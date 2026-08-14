import { httpRouter } from "convex/server";
import { stripeWebhook } from "./webhookHandler";

const http = httpRouter();

http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: stripeWebhook,
});

export default http;
