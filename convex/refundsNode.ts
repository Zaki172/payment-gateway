"use node";
import { internalAction } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import Stripe from "stripe";
import { internal, api } from "./_generated/api";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new ConvexError({ message: "Stripe not configured", code: "BAD_REQUEST" });
  return new Stripe(key, { apiVersion: "2026-07-29.dahlia" });
}

/**
 * Called via scheduler immediately after a refund is approved.
 * Submits to Stripe and marks refund completed (or failed).
 */
export const processApprovedRefund = internalAction({
  args: { refundId: v.id("refunds") },
  handler: async (ctx, args): Promise<void> => {
    const refund = await ctx.runQuery(api.refunds.getById, { id: args.refundId });
    if (!refund) {
      await ctx.runMutation(internal.refundsInternal.markRefundFailed, {
        refundId: args.refundId,
        error: "Refund record not found",
      });
      return;
    }
    if (refund.status !== "approved") return; // already processed or rejected

    const payment = await ctx.runQuery(api.payments.getById, { id: refund.paymentId });
    if (!payment?.stripePaymentIntentId) {
      await ctx.runMutation(internal.refundsInternal.markRefundFailed, {
        refundId: args.refundId,
        error: "No Stripe PaymentIntent found — cannot process refund automatically.",
      });
      return;
    }

    // Mark as processing
    await ctx.runMutation(internal.refundsInternal.markRefundProcessing, { refundId: args.refundId });

    try {
      const stripe = getStripe();
      const stripeRefund = await stripe.refunds.create({
        payment_intent: payment.stripePaymentIntentId,
        amount: refund.refundAmount,
        metadata: {
          internal_refund_id: args.refundId,
          refund_number: refund.refundNumber,
        },
      });

      await ctx.runMutation(internal.refundsInternal.markRefundCompleted, {
        refundId: args.refundId,
        paymentId: refund.paymentId,
        stripeRefundId: stripeRefund.id,
        refundAmount: refund.refundAmount,
        originalAmount: refund.originalAmount,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown Stripe error";
      await ctx.runMutation(internal.refundsInternal.markRefundFailed, {
        refundId: args.refundId,
        error: msg,
      });
    }
  },
});
