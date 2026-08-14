/**
 * Payment Automation — Expiry & Reminders
 *
 * Two internal mutations called by the hourly cron:
 *   1. markExpiredPayments   — sets status=expired for overdue pending payments
 *   2. sendExpiryReminders   — creates in-app notifications for payments expiring within 24h
 *
 * An additional query supports the dashboard "Expiring Soon" widget.
 */
import { internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// ─── 1. Mark expired payments ─────────────────────────────────────────────────

export const markExpiredPayments = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date().toISOString();

    // Collect pending payments that have an expiresAt in the past
    const pendingPayments = await ctx.db
      .query("payments")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const expired = pendingPayments.filter(
      (p) => p.expiresAt && p.expiresAt < now
    );

    for (const payment of expired) {
      await ctx.db.patch(payment._id, { status: "expired" });

      await ctx.db.insert("paymentEvents", {
        paymentId: payment._id,
        eventType: "expired",
        description: "Payment link expired automatically",
        isSystem: true,
      });

      await ctx.db.insert("auditLogs", {
        action: "payment_expired",
        entityType: "payment",
        entityId: payment._id,
        description: `Payment ${payment.paymentNumber} automatically expired`,
      });

      // Notify the creator
      await ctx.db.insert("notifications", {
        userId: payment.createdBy,
        title: "Payment Link Expired",
        message: `Payment ${payment.paymentNumber} has expired and is no longer collectible`,
        type: "payment_expired",
        isRead: false,
        paymentId: payment._id,
      });
    }

    return { expiredCount: expired.length };
  },
});

// ─── 2. Send expiry reminder notifications ────────────────────────────────────

export const sendExpiryReminders = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();

    // Pending payments expiring within the next 24 hours
    const pendingPayments = await ctx.db
      .query("payments")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const expiringSoon = pendingPayments.filter(
      (p) => p.expiresAt && p.expiresAt > nowIso && p.expiresAt <= in24h
    );

    let remindersCreated = 0;

    for (const payment of expiringSoon) {
      // Avoid duplicate reminder notifications within this run window.
      // Check if we already sent a reminder notification for this payment recently (last 2h).
      const recentReminder = await ctx.db
        .query("notifications")
        .withIndex("by_user_and_payment", (q) =>
          q.eq("userId", payment.createdBy).eq("paymentId", payment._id)
        )
        .order("desc")
        .first();

      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000).getTime();
      if (recentReminder && recentReminder._creationTime > twoHoursAgo) {
        // Already notified recently — skip
        continue;
      }

      const expiresAtFormatted = payment.expiresAt
        ? new Date(payment.expiresAt).toLocaleString("en-US", {
            timeZone: "Asia/Tokyo",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }) + " JST"
        : "soon";

      // Notify the creator
      await ctx.db.insert("notifications", {
        userId: payment.createdBy,
        title: "Payment Expiring Soon",
        message: `Payment ${payment.paymentNumber} (${payment.currency} ${payment.amount.toLocaleString()}) expires at ${expiresAtFormatted}`,
        type: "payment_expiring",
        isRead: false,
        paymentId: payment._id,
      });

      // Also notify managers/owners so they can take action if needed
      const managers = await ctx.db.query("users").collect();
      for (const m of managers.filter((u) =>
        (u.role === "owner" || u.role === "manager") && u._id !== payment.createdBy
      )) {
        await ctx.db.insert("notifications", {
          userId: m._id,
          title: "Payment Expiring Soon",
          message: `Payment ${payment.paymentNumber} (${payment.currency} ${payment.amount.toLocaleString()}) expires at ${expiresAtFormatted}`,
          type: "payment_expiring",
          isRead: false,
          paymentId: payment._id,
        });
      }

      // Schedule customer email reminder if checkout URL exists
      if (payment.checkoutUrl) {
        await ctx.scheduler.runAfter(0, internal.paymentAutomation.sendExpiryReminderEmail, {
          paymentId: payment._id,
        });
      }

      remindersCreated++;
    }

    return { remindersCreated };
  },
});

// ─── 3. Customer email reminder (scheduled action, uses emails module) ────────

export const sendExpiryReminderEmail = internalMutation({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    // Schedule the node email action
    await ctx.scheduler.runAfter(0, internal.paymentAutomationNode.sendReminderEmail, {
      paymentId: args.paymentId,
    });
  },
});

// ─── 4. Dashboard query: expiring payments ────────────────────────────────────

export const getExpiringPayments = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { expiringToday: [], expiringSoon: [] };

    const now = new Date();
    const endOfToday = new Date(now);
    // "Today" = remaining hours of today in JST
    endOfToday.setUTCHours(endOfToday.getUTCHours() + 9); // shift to JST
    const jstToday = endOfToday.toISOString().slice(0, 10);
    const endOfTodayUtc = new Date(jstToday + "T15:00:00.000Z"); // midnight JST = 15:00 UTC

    const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();

    const pendingPayments = await ctx.db
      .query("payments")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    const withExpiry = pendingPayments.filter((p) => p.expiresAt && p.expiresAt > nowIso);

    const expiringToday = withExpiry.filter(
      (p) => p.expiresAt && p.expiresAt <= endOfTodayUtc.toISOString()
    );
    const expiringSoon = withExpiry.filter(
      (p) =>
        p.expiresAt &&
        p.expiresAt > endOfTodayUtc.toISOString() &&
        p.expiresAt <= in48h
    );

    // Enrich with customer names
    const enrich = async (payments: typeof withExpiry) =>
      Promise.all(
        payments.map(async (p) => {
          const customer = await ctx.db.get(p.customerId);
          return {
            _id: p._id,
            paymentNumber: p.paymentNumber,
            amount: p.amount,
            currency: p.currency,
            purpose: p.purpose,
            expiresAt: p.expiresAt!,
            customerName: customer?.name ?? "Unknown",
          };
        })
      );

    return {
      expiringToday: await enrich(expiringToday),
      expiringSoon: await enrich(expiringSoon),
    };
  },
});
