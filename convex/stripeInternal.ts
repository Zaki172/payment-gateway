import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const createPaymentLink = internalMutation({
  args: {
    paymentId: v.id("payments"),
    stripeCheckoutSessionId: v.string(),
    checkoutUrl: v.string(),
    expiresAt: v.optional(v.string()),
    createdBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const users = await ctx.db.query("users").take(1);
    const createdBy = args.createdBy ?? users[0]?._id;
    if (!createdBy) return;

    return await ctx.db.insert("paymentLinks", {
      paymentId: args.paymentId,
      stripeCheckoutSessionId: args.stripeCheckoutSessionId,
      checkoutUrl: args.checkoutUrl,
      status: "active",
      expiresAt: args.expiresAt,
      createdBy,
    });
  },
});
