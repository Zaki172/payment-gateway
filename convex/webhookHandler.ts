// HTTP Action runs in Convex V8 runtime — no "use node"
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const stripeWebhook = httpAction(async (ctx, request) => {
  const sig = request.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  const body = await request.text();

  try {
    const result = await ctx.runAction(internal.stripeNode.verifyAndProcess, {
      rawBody: body,
      signature: sig,
    });

    if (result === "invalid_signature") {
      return new Response("Invalid signature", { status: 400 });
    }

    return new Response("OK", { status: 200 });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
