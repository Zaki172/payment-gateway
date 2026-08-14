import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";

// Generate next payment number for the day
export const getNextPaymentNumber = mutation({
  args: {},
  handler: async (ctx): Promise<string> => {
    const now = new Date();
    const tokyoOffset = 9 * 60; // UTC+9
    const tokyoTime = new Date(now.getTime() + tokyoOffset * 60000);
    const dateKey = tokyoTime.toISOString().slice(0, 10).replace(/-/g, "");

    const counter = await ctx.db
      .query("paymentCounters")
      .withIndex("by_dateKey", (q) => q.eq("dateKey", dateKey))
      .unique();

    if (counter) {
      const next = counter.count + 1;
      await ctx.db.patch(counter._id, { count: next });
      return `IZP-${dateKey}-${String(next).padStart(4, "0")}`;
    } else {
      await ctx.db.insert("paymentCounters", { dateKey, count: 1 });
      return `IZP-${dateKey}-0001`;
    }
  },
});

export const create = mutation({
  args: {
    paymentNumber: v.string(),
    customerId: v.id("customers"),
    amount: v.number(),
    currency: v.string(),
    purpose: v.string(),
    description: v.optional(v.string()),
    bookingReference: v.optional(v.string()),
    invoiceReference: v.optional(v.string()),
    internalNote: v.optional(v.string()),
    expiresAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Unauthenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    // Check permission
    const allowedRoles = ["owner", "manager", "staff"];
    if (!allowedRoles.includes(user.role)) {
      throw new ConvexError({ message: "Insufficient permissions", code: "FORBIDDEN" });
    }

    // Enforce single transaction limit (hard block)
    if (user.singleTransactionLimit !== undefined && args.amount > user.singleTransactionLimit) {
      throw new ConvexError({
        message: `Amount exceeds your single transaction limit of ${args.currency} ${user.singleTransactionLimit.toLocaleString()}`,
        code: "FORBIDDEN",
      });
    }

    // Check if approval required (staff only; owners/managers bypass)
    const threshold = user.approvalThreshold ?? 300000; // default 300k JPY
    const requiresApproval = args.amount > threshold && (user.role === "staff");

    const status = requiresApproval ? "approval_required" : "pending";

    // Determine stripe mode from settings
    const settings = await ctx.db.query("stripeSettings").first();
    const stripeMode = settings?.mode ?? "test";

    const paymentId = await ctx.db.insert("payments", {
      ...args,
      createdBy: user._id,
      status,
      totalRefunded: 0,
      stripeMode,
    });

    // Create audit log
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      action: "payment_created",
      entityType: "payment",
      entityId: paymentId,
      description: `Payment ${args.paymentNumber} created for ${args.currency} ${args.amount}`,
    });

    // Create payment event
    await ctx.db.insert("paymentEvents", {
      paymentId,
      eventType: "created",
      description: requiresApproval
        ? `Payment created and pending manager approval`
        : `Payment created`,
      performedBy: user._id,
      isSystem: false,
    });

    if (requiresApproval) {
      await ctx.db.insert("paymentApprovals", {
        paymentId,
        requestedBy: user._id,
        status: "pending",
      });
      // Notify managers
      const managers = await ctx.db.query("users").collect();
      for (const m of managers.filter((u) => u.role === "owner" || u.role === "manager")) {
        await ctx.db.insert("notifications", {
          userId: m._id,
          title: "Payment Approval Required",
          message: `${user.name} created a payment of ${args.currency} ${args.amount.toLocaleString()} requiring approval`,
          type: "approval_required",
          isRead: false,
          paymentId,
        });
      }
    }

    return paymentId;
  },
});

export const list = query({
  args: {
    status: v.optional(v.string()),
    search: v.optional(v.string()),
    currency: v.optional(v.string()),
    purpose: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    let payments = args.status
      ? await ctx.db.query("payments").withIndex("by_status", (q) => q.eq("status", args.status!)).collect()
      : await ctx.db.query("payments").order("desc").collect();

    if (args.currency) payments = payments.filter((p) => p.currency === args.currency);
    if (args.purpose) payments = payments.filter((p) => p.purpose === args.purpose);
    if (args.createdBy) payments = payments.filter((p) => p.createdBy === args.createdBy);

    // Join customer and user
    const enriched = await Promise.all(
      payments.map(async (p) => {
        const customer = await ctx.db.get(p.customerId);
        const createdByUser = await ctx.db.get(p.createdBy);
        return { ...p, customer, createdByUser };
      })
    );

    if (args.search) {
      const q = args.search.toLowerCase();
      return enriched.filter(
        (p) =>
          p.paymentNumber.toLowerCase().includes(q) ||
          p.customer?.name.toLowerCase().includes(q) ||
          p.customer?.email?.toLowerCase().includes(q) ||
          p.bookingReference?.toLowerCase().includes(q) ||
          p.invoiceReference?.toLowerCase().includes(q)
      );
    }

    return enriched;
  },
});

export const getById = query({
  args: { id: v.id("payments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const payment = await ctx.db.get(args.id);
    if (!payment) return null;
    const customer = await ctx.db.get(payment.customerId);
    const createdByUser = await ctx.db.get(payment.createdBy);
    const events = await ctx.db
      .query("paymentEvents")
      .withIndex("by_payment", (q) => q.eq("paymentId", args.id))
      .collect();
    const refunds = await ctx.db
      .query("refunds")
      .withIndex("by_payment", (q) => q.eq("paymentId", args.id))
      .collect();
    const links = await ctx.db
      .query("paymentLinks")
      .withIndex("by_payment", (q) => q.eq("paymentId", args.id))
      .collect();

    const eventsWithUser = await Promise.all(
      events.map(async (e) => {
        const user = e.performedBy ? await ctx.db.get(e.performedBy) : null;
        return { ...e, performedByUser: user };
      })
    );

    return { ...payment, customer, createdByUser, events: eventsWithUser, refunds, links };
  },
});

export const getPublicReceipt = query({
  args: { id: v.id("payments") },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.id);
    if (!payment) return null;

    const customer = await ctx.db.get(payment.customerId);

    // Completed refunds only
    const refunds = await ctx.db
      .query("refunds")
      .withIndex("by_payment", (q) => q.eq("paymentId", args.id))
      .collect();
    const completedRefunds = refunds.filter((r) => r.status === "completed");

    // Return only customer-safe fields — NO internal notes, approvals, staff IDs
    return {
      _id: payment._id,
      paymentNumber: payment.paymentNumber,
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      purpose: payment.purpose,
      bookingReference: payment.bookingReference ?? null,
      invoiceReference: payment.invoiceReference ?? null,
      description: payment.description ?? null,
      paidAt: payment.paidAt ?? null,
      createdAt: payment._creationTime,
      expiresAt: payment.expiresAt ?? null,
      checkoutUrl: payment.checkoutUrl ?? null,
      cardBrand: payment.cardBrand ?? null,
      cardLast4: payment.cardLast4 ?? null,
      totalRefunded: payment.totalRefunded ?? 0,
      customer: customer
        ? {
            name: customer.name,
            email: customer.email ?? null,
            phone: customer.phone ?? null,
            country: null,
          }
        : null,
      refunds: completedRefunds.map((r) => ({
        refundNumber: r.refundNumber,
        refundAmount: r.refundAmount,
        currency: r.currency,
        reason: r.reason ?? null,
        completedAt: r.completedAt ?? null,
      })),
    };
  },
});

export const updateStatus = mutation({
  args: {
    id: v.id("payments"),
    status: v.string(),
    stripeCheckoutSessionId: v.optional(v.string()),
    stripePaymentIntentId: v.optional(v.string()),
    stripeChargeId: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
    cardBrand: v.optional(v.string()),
    cardLast4: v.optional(v.string()),
    checkoutUrl: v.optional(v.string()),
    paidAt: v.optional(v.string()),
    failedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    await ctx.db.patch(id, updates);
  },
});

export const addEvent = mutation({
  args: {
    paymentId: v.id("payments"),
    eventType: v.string(),
    description: v.string(),
    performedBy: v.optional(v.id("users")),
    isSystem: v.boolean(),
    metadata: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("paymentEvents", args);
  },
});

export const cancel = mutation({
  args: { id: v.id("payments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Unauthenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    await ctx.db.patch(args.id, {
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
    });

    await ctx.db.insert("paymentEvents", {
      paymentId: args.id,
      eventType: "cancelled",
      description: "Payment cancelled",
      performedBy: user._id,
      isSystem: false,
    });

    await ctx.db.insert("auditLogs", {
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      action: "payment_cancelled",
      entityType: "payment",
      entityId: args.id,
      description: "Payment cancelled",
    });
  },
});

export const getDashboardStats = query({
  args: { dateFilter: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const all = await ctx.db.query("payments").collect();

    // Filter by date
    let filtered = all;
    if (args.dateFilter && args.dateFilter !== "all") {
      const now = new Date();
      let cutoff: Date;
      if (args.dateFilter === "today") {
        cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (args.dateFilter === "7days") {
        cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (args.dateFilter === "30days") {
        cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      } else {
        cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
      }
      filtered = all.filter((p) => new Date(p._creationTime) >= cutoff);
    }

    const paid = filtered.filter((p) => p.status === "paid");
    const pending = filtered.filter((p) => p.status === "pending" || p.status === "processing");
    const failed = filtered.filter((p) => p.status === "failed");
    const refunded = filtered.filter((p) => p.status === "refunded" || p.status === "partially_refunded");

    const totalCollected = paid.reduce((s, p) => s + p.amount, 0);
    const totalPendingAmount = pending.reduce((s, p) => s + p.amount, 0);
    const totalFailedAmount = failed.reduce((s, p) => s + p.amount, 0);
    const totalRefundedAmount = refunded.reduce((s, p) => s + p.totalRefunded, 0);
    const successRate = filtered.length > 0 ? (paid.length / filtered.length) * 100 : 0;

    return {
      totalCollected,
      paidCount: paid.length,
      paidAmount: totalCollected,
      pendingCount: pending.length,
      pendingAmount: totalPendingAmount,
      failedCount: failed.length,
      failedAmount: totalFailedAmount,
      refundedAmount: totalRefundedAmount,
      successRate,
      avgPayment: paid.length > 0 ? totalCollected / paid.length : 0,
      totalTransactions: filtered.length,
    };
  },
});

export const getRecentActivity = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const events = await ctx.db.query("paymentEvents").order("desc").take(20);
    const enriched = await Promise.all(
      events.map(async (e) => {
        const payment = await ctx.db.get(e.paymentId);
        const customer = payment ? await ctx.db.get(payment.customerId) : null;
        const user = e.performedBy ? await ctx.db.get(e.performedBy) : null;
        return { ...e, payment, customer, performedByUser: user };
      })
    );
    return enriched;
  },
});

export const approvePayment = mutation({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Unauthenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    if (!["owner", "manager"].includes(user.role)) {
      throw new ConvexError({ message: "Insufficient permissions", code: "FORBIDDEN" });
    }

    await ctx.db.patch(args.paymentId, {
      status: "pending",
      approvedBy: user._id,
      approvedAt: new Date().toISOString(),
    });

    const approval = await ctx.db
      .query("paymentApprovals")
      .withIndex("by_payment", (q) => q.eq("paymentId", args.paymentId))
      .first();
    if (approval) {
      await ctx.db.patch(approval._id, {
        reviewedBy: user._id,
        status: "approved",
        reviewedAt: new Date().toISOString(),
      });
    }

    await ctx.db.insert("paymentEvents", {
      paymentId: args.paymentId,
      eventType: "approval_approved",
      description: `Payment approved by ${user.name}`,
      performedBy: user._id,
      isSystem: false,
    });
  },
});

export const getPendingApprovals = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user || !["owner", "manager"].includes(user.role)) return [];

    const approvals = await ctx.db
      .query("paymentApprovals")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .collect();

    return await Promise.all(
      approvals.map(async (a) => {
        const payment = await ctx.db.get(a.paymentId);
        const requester = await ctx.db.get(a.requestedBy);
        const customer = payment ? await ctx.db.get(payment.customerId) : null;
        return { ...a, payment, requester, customer };
      })
    );
  },
});

export const setExpiry = mutation({
  args: { id: v.id("payments"), expiresAt: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { expiresAt: args.expiresAt });
  },
});

export const getPaymentChartData = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const payments = await ctx.db.query("payments").order("desc").take(200);

    // Group by day (last 7 days)
    const days: Record<string, number> = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      days[key] = 0;
    }

    for (const p of payments) {
      const key = new Date(p._creationTime).toISOString().slice(0, 10);
      if (key in days) {
        days[key] = (days[key] ?? 0) + (p.status === "paid" ? p.amount : 0);
      }
    }

    return Object.entries(days).map(([date, amount]) => ({
      date: date.slice(5), // MM-DD
      amount,
    }));
  },
});
