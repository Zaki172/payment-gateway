/**
 * Cron Jobs — Izumi Payment Hub
 *
 * Runs hourly to:
 *   1. Mark expired payment links as status=expired
 *   2. Send in-app + email reminders for payments expiring within 24h
 *
 * NOTE: Cron jobs consume Hercules Cloud resources. Monitor at
 * Settings > Billing > Hercules Cloud.
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.hourly(
  "mark expired payment links",
  { minuteUTC: 5 },
  internal.paymentAutomation.markExpiredPayments
);

crons.hourly(
  "send payment expiry reminders",
  { minuteUTC: 7 },
  internal.paymentAutomation.sendExpiryReminders
);

export default crons;
