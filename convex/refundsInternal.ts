import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const markRefundProcessing = internalMutation({
  args: { refundId: v.id("refunds") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.refundId, { status: "processing" });
  },
});

export const markRefundCompleted = internalMutation({
  args: {
    refundId: v.id("refunds"),
    paymentId: v.id("payments"),
    stripeRefundId: v.string(),
    refundAmount: v.number(),
    originalAmount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.refundId, {
      status: "completed",
      stripeRefundId: args.stripeRefundId,
      completedAt: new Date().toISOString(),
    });

    const payment = await ctx.db.get(args.paymentId);
    if (!payment) return;

    const newTotalRefunded = (payment.totalRefunded ?? 0) + args.refundAmount;
    const isFullRefund = newTotalRefunded >= args.originalAmount;

    await ctx.db.patch(args.paymentId, {
      totalRefunded: newTotalRefunded,
      status: isFullRefund ? "refunded" : "partially_refunded",
    });

    await ctx.db.insert("paymentEvents", {
      paymentId: args.paymentId,
      eventType: "refund_completed",
      description: `Refund of ${payment.currency} ${args.refundAmount.toLocaleString()} processed via Stripe (${args.stripeRefundId})`,
      isSystem: true,
    });

    await ctx.db.insert("auditLogs", {
      action: "refund_completed",
      entityType: "refund",
      entityId: args.refundId,
      description: `Stripe refund ${args.stripeRefundId} completed for ${payment.paymentNumber}`,
    });

    await ctx.scheduler.runAfter(0, internal.emails.sendRefundNotificationEmail, {
      refundId: args.refundId,
      paymentId: args.paymentId,
    });
  },
});

export const markRefundFailed = internalMutation({
  args: { refundId: v.id("refunds"), error: v.string() },
  handler: async (ctx, args) => {
    const refund = await ctx.db.get(args.refundId);
    if (!refund) return;

    await ctx.db.patch(args.refundId, { status: "failed" });

    await ctx.db.insert("paymentEvents", {
      paymentId: refund.paymentId,
      eventType: "refund_failed",
      description: `Refund processing failed: ${args.error}`,
      isSystem: true,
    });

    await ctx.db.insert("auditLogs", {
      action: "refund_failed",
      entityType: "refund",
      entityId: args.refundId,
      description: `Refund ${refund.refundNumber} failed: ${args.error}`,
    });
  },
});
