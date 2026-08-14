"use node";
import { action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import Stripe from "stripe";
import { api, internal } from "./_generated/api";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new ConvexError({ message: "Stripe not configured", code: "BAD_REQUEST" });
  return new Stripe(key, { apiVersion: "2026-07-29.dahlia" });
}

export const createCheckoutSession = action({
  args: {
    paymentId: v.id("payments"),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args): Promise<{ sessionId: string; url: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Unauthenticated", code: "UNAUTHENTICATED" });

    const payment = await ctx.runQuery(api.payments.getById, { id: args.paymentId });
    if (!payment) throw new ConvexError({ message: "Payment not found", code: "NOT_FOUND" });
    if (payment.status === "paid") {
      throw new ConvexError({ message: "Payment already completed", code: "CONFLICT" });
    }

    const stripe = getStripe();

    // Build product name from purpose
    const productName = `${payment.purpose}${payment.bookingReference ? ` — ${payment.bookingReference}` : ""}`;

    const baseUrl = process.env.SITE_URL ?? "https://izumi.onhercules.app";

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: payment.currency.toLowerCase(),
              unit_amount: payment.amount,
              product_data: {
                name: productName,
                description: payment.description ?? undefined,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: payment.customer?.email ?? undefined,
        client_reference_id: payment.paymentNumber,
        metadata: {
          internal_payment_id: args.paymentId,
          payment_number: payment.paymentNumber,
          booking_reference: payment.bookingReference ?? "",
          created_by: String(payment.createdBy),
        },
        success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/payments`,
        expires_at: payment.expiresAt
          ? Math.floor(new Date(payment.expiresAt).getTime() / 1000)
          : Math.floor(Date.now() / 1000) + 72 * 3600,
      },
      {
        idempotencyKey: args.idempotencyKey,
      }
    );

    if (!session.url) throw new ConvexError({ message: "Stripe did not return a checkout URL", code: "EXTERNAL_SERVICE_ERROR" });

    // Update payment with Stripe session
    await ctx.runMutation(api.payments.updateStatus, {
      id: args.paymentId,
      stripeCheckoutSessionId: session.id,
      checkoutUrl: session.url,
      status: "pending",
    });

    // Create payment link record
    await ctx.runMutation(internal.stripeInternal.createPaymentLink, {
      paymentId: args.paymentId,
      stripeCheckoutSessionId: session.id,
      checkoutUrl: session.url,
    });

    // Log event
    await ctx.runMutation(api.payments.addEvent, {
      paymentId: args.paymentId,
      eventType: "link_created",
      description: "Stripe Checkout Session created",
      isSystem: false,
    });

    return { sessionId: session.id, url: session.url };
  },
});

export const verifyStripeConnection = action({
  args: {},
  handler: async (ctx): Promise<{ connected: boolean; mode: string; error?: string }> => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return { connected: false, mode: "test", error: "STRIPE_SECRET_KEY not set" };

    const stripe = getStripe();
    try {
      // Lightweight ping — list 1 balance transaction
      await stripe.balance.retrieve();
      const mode = key.startsWith("sk_live_") ? "live" : "test";

      // Update settings
      const settings = await ctx.runQuery(api.seed.getStripeSettings);
      if (settings) {
        await ctx.runMutation(api.seed.updateStripeSettings, {
          isConnected: true,
          mode,
        });
      }

      return { connected: true, mode };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      return { connected: false, mode: "test", error: msg };
    }
  },
});

export const createNewCheckoutAttempt = action({
  args: {
    paymentId: v.id("payments"),
  },
  handler: async (ctx, args): Promise<{ sessionId: string; url: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Unauthenticated", code: "UNAUTHENTICATED" });

    const payment = await ctx.runQuery(api.payments.getById, { id: args.paymentId });
    if (!payment) throw new ConvexError({ message: "Payment not found", code: "NOT_FOUND" });
    if (payment.status === "paid") throw new ConvexError({ message: "Payment already completed", code: "CONFLICT" });

    const stripe = getStripe();
    const productName = `${payment.purpose}${payment.bookingReference ? ` — ${payment.bookingReference}` : ""}`;
    const baseUrl = process.env.SITE_URL ?? "https://izumi.onhercules.app";

    // New expiry: 72 h from now
    const newExpiresAt = new Date(Date.now() + 72 * 3600000).toISOString();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: payment.currency.toLowerCase(),
          unit_amount: payment.amount,
          product_data: { name: productName, description: payment.description ?? undefined },
        },
        quantity: 1,
      }],
      customer_email: payment.customer?.email ?? undefined,
      client_reference_id: payment.paymentNumber,
      metadata: {
        internal_payment_id: args.paymentId,
        payment_number: payment.paymentNumber,
        booking_reference: payment.bookingReference ?? "",
      },
      success_url: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/payments`,
      expires_at: Math.floor(Date.now() / 1000) + 72 * 3600,
    });

    if (!session.url) throw new ConvexError({ message: "Stripe did not return a checkout URL", code: "EXTERNAL_SERVICE_ERROR" });

    // Reset payment to pending with new session
    await ctx.runMutation(api.payments.updateStatus, {
      id: args.paymentId,
      stripeCheckoutSessionId: session.id,
      checkoutUrl: session.url,
      status: "pending",
    });

    // Store new expiry
    await ctx.runMutation(api.payments.setExpiry, {
      id: args.paymentId,
      expiresAt: newExpiresAt,
    });

    await ctx.runMutation(internal.stripeInternal.createPaymentLink, {
      paymentId: args.paymentId,
      stripeCheckoutSessionId: session.id,
      checkoutUrl: session.url,
    });

    await ctx.runMutation(api.payments.addEvent, {
      paymentId: args.paymentId,
      eventType: "link_created",
      description: "New checkout attempt created",
      isSystem: false,
    });

    return { sessionId: session.id, url: session.url };
  },
});

export const processRefund = action({
  args: {
    refundId: v.id("refunds"),
  },
  handler: async (ctx, args): Promise<{ stripeRefundId: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Unauthenticated", code: "UNAUTHENTICATED" });

    const refund = await ctx.runQuery(api.refunds.getById, { id: args.refundId });
    if (!refund) throw new ConvexError({ message: "Refund not found", code: "NOT_FOUND" });
    if (refund.status !== "approved") {
      throw new ConvexError({ message: "Refund must be approved first", code: "BAD_REQUEST" });
    }

    const payment = await ctx.runQuery(api.payments.getById, { id: refund.paymentId });
    if (!payment?.stripePaymentIntentId) {
      throw new ConvexError({ message: "No Stripe PaymentIntent found for this payment", code: "BAD_REQUEST" });
    }

    const stripe = getStripe();
    const stripeRefund = await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      amount: refund.refundAmount,
    });

    return { stripeRefundId: stripeRefund.id };
  },
});
