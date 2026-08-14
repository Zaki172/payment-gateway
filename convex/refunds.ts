import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";

export const requestRefund = mutation({
  args: {
    paymentId: v.id("payments"),
    refundAmount: v.number(),
    reason: v.string(),
    internalNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Unauthenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new ConvexError({ message: "Payment not found", code: "NOT_FOUND" });
    if (payment.status !== "paid" && payment.status !== "partially_refunded") {
      throw new ConvexError({ message: "Payment is not eligible for refund", code: "BAD_REQUEST" });
    }

    const now = new Date();
    const tokyoOffset = 9 * 60;
    const tokyoTime = new Date(now.getTime() + tokyoOffset * 60000);
    const dateKey = tokyoTime.toISOString().slice(0, 10).replace(/-/g, "");

    // Count refunds for numbering
    const allRefunds = await ctx.db.query("refunds").collect();
    const refundNumber = `RFD-${dateKey}-${String(allRefunds.length + 1).padStart(4, "0")}`;

    const refundId = await ctx.db.insert("refunds", {
      refundNumber,
      paymentId: args.paymentId,
      requestedBy: user._id,
      originalAmount: payment.amount,
      refundAmount: args.refundAmount,
      currency: payment.currency,
      reason: args.reason,
      internalNote: args.internalNote,
      status: "requested",
    });

    await ctx.db.insert("paymentEvents", {
      paymentId: args.paymentId,
      eventType: "refund_requested",
      description: `Refund of ${payment.currency} ${args.refundAmount.toLocaleString()} requested by ${user.name}`,
      performedBy: user._id,
      isSystem: false,
    });

    await ctx.db.insert("auditLogs", {
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      action: "refund_requested",
      entityType: "refund",
      entityId: refundId,
      description: `Refund request ${refundNumber} submitted`,
    });

    // Notify managers
    const managers = await ctx.db.query("users").collect();
    for (const m of managers.filter((u) => u.role === "owner" || u.role === "manager")) {
      await ctx.db.insert("notifications", {
        userId: m._id,
        title: "Refund Request",
        message: `${user.name} requested a refund of ${payment.currency} ${args.refundAmount.toLocaleString()} for ${payment.paymentNumber}`,
        type: "refund_requested",
        isRead: false,
        paymentId: args.paymentId,
        refundId,
      });
    }

    return refundId;
  },
});

export const list = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    let refunds = args.status
      ? await ctx.db.query("refunds").withIndex("by_status", (q) => q.eq("status", args.status!)).collect()
      : await ctx.db.query("refunds").order("desc").collect();

    return await Promise.all(
      refunds.map(async (r) => {
        const payment = await ctx.db.get(r.paymentId);
        const customer = payment ? await ctx.db.get(payment.customerId) : null;
        const requestedByUser = await ctx.db.get(r.requestedBy);
        const approvedByUser = r.approvedBy ? await ctx.db.get(r.approvedBy) : null;
        return { ...r, payment, customer, requestedByUser, approvedByUser };
      })
    );
  },
});

export const getById = query({
  args: { id: v.id("refunds") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db.get(args.id);
  },
});

export const approve = mutation({
  args: { id: v.id("refunds") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Unauthenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    if (!["owner", "manager"].includes(user.role)) {
      throw new ConvexError({ message: "Insufficient permissions to approve refunds", code: "FORBIDDEN" });
    }

    const refund = await ctx.db.get(args.id);
    if (!refund) throw new ConvexError({ message: "Refund not found", code: "NOT_FOUND" });

    await ctx.db.patch(args.id, {
      status: "approved",
      approvedBy: user._id,
      approvedAt: new Date().toISOString(),
    });

    await ctx.db.insert("paymentEvents", {
      paymentId: refund.paymentId,
      eventType: "refund_approved",
      description: `Refund approved by ${user.name}`,
      performedBy: user._id,
      isSystem: false,
    });

    await ctx.db.insert("auditLogs", {
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      action: "refund_approved",
      entityType: "refund",
      entityId: args.id,
      description: `Refund ${refund.refundNumber} approved`,
    });

    // Immediately schedule Stripe processing
    await ctx.scheduler.runAfter(0, internal.refundsNode.processApprovedRefund, {
      refundId: args.id,
    });

    return refund.paymentId;
  },
});

export const reject = mutation({
  args: { id: v.id("refunds"), rejectionReason: v.optional(v.string()) },
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

    const refund = await ctx.db.get(args.id);
    if (!refund) throw new ConvexError({ message: "Refund not found", code: "NOT_FOUND" });

    await ctx.db.patch(args.id, {
      status: "rejected",
      rejectedBy: user._id,
      rejectedAt: new Date().toISOString(),
      rejectionReason: args.rejectionReason,
    });

    await ctx.db.insert("paymentEvents", {
      paymentId: refund.paymentId,
      eventType: "refund_rejected",
      description: `Refund rejected by ${user.name}${args.rejectionReason ? `: ${args.rejectionReason}` : ""}`,
      performedBy: user._id,
      isSystem: false,
    });

    await ctx.db.insert("auditLogs", {
      userId: user._id,
      userEmail: user.email,
      userName: user.name,
      action: "refund_rejected",
      entityType: "refund",
      entityId: args.id,
      description: `Refund ${refund.refundNumber} rejected by ${user.name}`,
    });

    // Notify the requester
    await ctx.db.insert("notifications", {
      userId: refund.requestedBy,
      title: "Refund Request Rejected",
      message: `Your refund request ${refund.refundNumber} was rejected${args.rejectionReason ? `: ${args.rejectionReason}` : ""}`,
      type: "refund_rejected",
      isRead: false,
      paymentId: refund.paymentId,
      refundId: args.id,
    });
  },
});
