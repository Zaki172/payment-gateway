"use node";
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import Stripe from "stripe";
import { api } from "./_generated/api";

export const verifyAndProcess = internalAction({
  args: {
    rawBody: v.string(),
    signature: v.string(),
  },
  handler: async (ctx, args): Promise<"ok" | "invalid_signature" | "duplicate"> => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const stripeKey = process.env.STRIPE_SECRET_KEY;

    if (!webhookSecret || !stripeKey) {
      console.error("Stripe not configured — missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
      return "ok"; // Return ok so we don't alarm Stripe with 500s during setup
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2026-07-29.dahlia" });

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(args.rawBody, args.signature, webhookSecret);
    } catch {
      return "invalid_signature";
    }

    // Store and check for duplicates
    const stored = await ctx.runMutation(api.webhooks.storeEvent, {
      stripeEventId: event.id,
      eventType: event.type,
      payload: args.rawBody,
    });

    if (stored === "duplicate") {
      return "duplicate";
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        await ctx.runMutation(api.webhooks.handleCheckoutCompleted, {
          stripeEventId: event.id,
          sessionId: session.id,
          paymentIntentId:
            typeof session.payment_intent === "string"
              ? session.payment_intent
              : session.payment_intent?.id ?? null,
          clientReference: session.client_reference_id ?? null,
          customerEmail: session.customer_details?.email ?? null,
          amountTotal: session.amount_total,
          currency: session.currency ?? "jpy",
          paymentStatus: session.payment_status,
        });
      } else if (event.type === "payment_intent.payment_failed") {
        const pi = event.data.object as Stripe.PaymentIntent;
        await ctx.runMutation(api.webhooks.handlePaymentFailed, {
          stripeEventId: event.id,
          paymentIntentId: pi.id,
        });
      } else if (event.type === "charge.refunded") {
        const charge = event.data.object as Stripe.Charge;
        await ctx.runMutation(api.webhooks.handleChargeRefunded, {
          stripeEventId: event.id,
          chargeId: charge.id,
          paymentIntentId:
            typeof charge.payment_intent === "string" ? charge.payment_intent : null,
          amountRefunded: charge.amount_refunded,
          refunded: charge.refunded,
        });
      }

      await ctx.runMutation(api.webhooks.markProcessed, { stripeEventId: event.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(api.webhooks.markFailed, {
        stripeEventId: event.id,
        errorMessage: msg,
      });
    }

    return "ok";
  },
});
