import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const storeEvent = mutation({
  args: {
    stripeEventId: v.string(),
    eventType: v.string(),
    payload: v.string(),
  },
  handler: async (ctx, args): Promise<"stored" | "duplicate"> => {
    const existing = await ctx.db
      .query("webhookEvents")
      .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", args.stripeEventId))
      .unique();

    if (existing) return "duplicate";

    await ctx.db.insert("webhookEvents", {
      stripeEventId: args.stripeEventId,
      eventType: args.eventType,
      payload: args.payload,
      status: "processing",
    });

    return "stored";
  },
});

export const markProcessed = mutation({
  args: { stripeEventId: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("webhookEvents")
      .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", args.stripeEventId))
      .unique();
    if (event) {
      await ctx.db.patch(event._id, { status: "processed", processedAt: new Date().toISOString() });
    }

    // Update webhook health
    const settings = await ctx.db.query("stripeSettings").first();
    if (settings) {
      await ctx.db.patch(settings._id, {
        lastWebhookAt: new Date().toISOString(),
        webhookHealthy: true,
      });
    }
  },
});

export const markFailed = mutation({
  args: { stripeEventId: v.string(), errorMessage: v.string() },
  handler: async (ctx, args) => {
    const event = await ctx.db
      .query("webhookEvents")
      .withIndex("by_stripeEventId", (q) => q.eq("stripeEventId", args.stripeEventId))
      .unique();
    if (event) {
      await ctx.db.patch(event._id, { status: "failed", errorMessage: args.errorMessage });
    }
  },
});

export const handleCheckoutCompleted = mutation({
  args: {
    stripeEventId: v.string(),
    sessionId: v.string(),
    paymentIntentId: v.union(v.string(), v.null()),
    clientReference: v.union(v.string(), v.null()),
    customerEmail: v.union(v.string(), v.null()),
    amountTotal: v.union(v.number(), v.null()),
    currency: v.string(),
    paymentStatus: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.paymentStatus !== "paid") return;

    // Find payment by Stripe session ID
    const payment = await ctx.db
      .query("payments")
      .withIndex("by_stripeSessionId", (q) => q.eq("stripeCheckoutSessionId", args.sessionId))
      .unique();

    if (!payment) return;
    if (payment.status === "paid") return; // idempotent

    await ctx.db.patch(payment._id, {
      status: "paid",
      stripePaymentIntentId: args.paymentIntentId ?? undefined,
      paidAt: new Date().toISOString(),
    });

    // Update payment link status
    const link = await ctx.db
      .query("paymentLinks")
      .withIndex("by_stripeSession", (q) => q.eq("stripeCheckoutSessionId", args.sessionId))
      .first();
    if (link) {
      await ctx.db.patch(link._id, { status: "paid" });
    }

    // Update customer stats
    const customer = await ctx.db.get(payment.customerId);
    if (customer) {
      await ctx.db.patch(customer._id, {
        totalPaidAmount: customer.totalPaidAmount + payment.amount,
        paymentCount: customer.paymentCount + 1,
        lastPaymentAt: new Date().toISOString(),
      });
    }

    // Create events
    await ctx.db.insert("paymentEvents", {
      paymentId: payment._id,
      eventType: "paid",
      description: "Payment confirmed by Stripe webhook",
      isSystem: true,
    });

    // Create audit log
    await ctx.db.insert("auditLogs", {
      action: "payment_paid",
      entityType: "payment",
      entityId: payment._id,
      description: `Payment ${payment.paymentNumber} confirmed as paid via Stripe`,
    });

    // Create notifications for managers and the creator
    const staffToNotify = await ctx.db.query("users").collect();
    for (const u of staffToNotify.filter((u) => ["owner", "manager", "accounts"].includes(u.role) || u._id === payment.createdBy)) {
      await ctx.db.insert("notifications", {
        userId: u._id,
        title: "Payment Received",
        message: `Payment ${payment.paymentNumber} of ${payment.currency} ${payment.amount.toLocaleString()} has been confirmed`,
        type: "payment_received",
        isRead: false,
        paymentId: payment._id,
      });
    }

    // Schedule confirmation email to customer (best-effort, non-blocking)
    await ctx.scheduler.runAfter(0, internal.emails.sendPaymentConfirmationEmail, {
      paymentId: payment._id,
    });
  },
});

export const handlePaymentFailed = mutation({
  args: {
    stripeEventId: v.string(),
    paymentIntentId: v.string(),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find payment by payment intent OR checkout session ID
    let payment = await ctx.db.query("payments").collect().then(
      (all) => all.find((p) => p.stripePaymentIntentId === args.paymentIntentId)
    );
    if (!payment && args.sessionId) {
      payment = await ctx.db
        .query("payments")
        .withIndex("by_stripeSessionId", (q) => q.eq("stripeCheckoutSessionId", args.sessionId))
        .unique() ?? undefined;
    }
    if (!payment || payment.status === "paid") return;

    await ctx.db.patch(payment._id, {
      status: "failed",
      failedAt: new Date().toISOString(),
    });

    await ctx.db.insert("paymentEvents", {
      paymentId: payment._id,
      eventType: "failed",
      description: "Payment failed — reported by Stripe",
      isSystem: true,
    });
  },
});

export const handleChargeRefunded = mutation({
  args: {
    stripeEventId: v.string(),
    chargeId: v.string(),
    paymentIntentId: v.union(v.string(), v.null()),
    amountRefunded: v.number(),
    refunded: v.boolean(),
  },
  handler: async (ctx, args) => {
    const payments = await ctx.db.query("payments").collect();
    const payment = payments.find(
      (p) => p.stripeChargeId === args.chargeId || (args.paymentIntentId && p.stripePaymentIntentId === args.paymentIntentId)
    );
    if (!payment) return;

    const newTotal = args.amountRefunded;
    const newStatus = args.refunded ? "refunded" : "partially_refunded";

    await ctx.db.patch(payment._id, {
      totalRefunded: newTotal,
      status: newStatus,
    });

    await ctx.db.insert("paymentEvents", {
      paymentId: payment._id,
      eventType: "refund_completed",
      description: args.refunded
        ? "Full refund confirmed by Stripe"
        : `Partial refund of ${payment.currency} ${newTotal} confirmed`,
      isSystem: true,
    });

    // Find any processing refund records and mark complete
    const refunds = await ctx.db
      .query("refunds")
      .withIndex("by_payment", (q) => q.eq("paymentId", payment._id))
      .collect();
    for (const r of refunds.filter((r) => r.status === "approved" || r.status === "processing")) {
      await ctx.db.patch(r._id, {
        status: "completed",
        completedAt: new Date().toISOString(),
      });
    }
  },
});
