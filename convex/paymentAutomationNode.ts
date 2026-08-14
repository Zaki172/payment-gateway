"use node";
/**
 * Node.js runtime — sends the expiry reminder email to the customer.
 * Isolated in its own file because it uses the Hercules email SDK (Node only).
 */
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { Hercules } from "@usehercules/sdk";
import escapeHtml from "escape-html";
import { api } from "./_generated/api";

const getHercules = () =>
  new Hercules({ apiKey: process.env.HERCULES_API_KEY!, apiVersion: "2025-12-09" });

function getSenderEmail(): string {
  return process.env.SENDER_EMAIL ?? "noreply@izumiglobal.jp";
}

function formatAmount(amount: number, currency: string): string {
  const noDecimals = ["JPY", "BDT"];
  const decimals = noDecimals.includes(currency.toUpperCase()) ? 0 : 2;
  const divisor = noDecimals.includes(currency.toUpperCase()) ? 1 : 100;
  const value = amount / divisor;
  try {
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return `${currency.toUpperCase()} ${value.toLocaleString()}`;
  }
}

export const sendReminderEmail = internalAction({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args): Promise<void> => {
    const payment = await ctx.runQuery(api.payments.getPublicReceipt, { id: args.paymentId });
    if (!payment) return;

    const customerEmail = payment.customer?.email;
    if (!customerEmail) return;
    if (!payment.checkoutUrl) return;

    const hercules = getHercules();
    const from = getSenderEmail();
    const customerName = payment.customer?.name ?? "Valued Customer";
    const amount = formatAmount(payment.amount, payment.currency);

    const expiresAtFormatted = payment.expiresAt
      ? new Date(payment.expiresAt).toLocaleString("en-US", {
          timeZone: "Asia/Tokyo",
          month: "long",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }) + " JST"
      : "soon";

    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><title>Payment Reminder</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#0f1740;padding:28px 32px;">
            <div style="color:#fff;font-size:20px;font-weight:bold;">IZUMI GLOBAL NETWORKS</div>
            <div style="color:#8896c8;font-size:11px;margin-top:3px;">イズミグローバルネットワークス合同会社</div>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            <div style="text-align:center;margin-bottom:24px;">
              <div style="display:inline-block;background:#fef3c7;border-radius:50%;width:60px;height:60px;line-height:60px;font-size:28px;">&#9200;</div>
              <h2 style="margin:12px 0 4px;color:#0f172a;font-size:22px;">Payment Reminder</h2>
              <p style="margin:0;color:#64748b;font-size:14px;">Dear ${escapeHtml(customerName)}, your payment is expiring soon.</p>
            </div>

            <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:20px;margin-bottom:24px;">
              <p style="margin:0 0 8px;font-size:13px;color:#92400e;font-weight:bold;">&#9888;&#65039; PAYMENT EXPIRES: ${escapeHtml(expiresAtFormatted)}</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:5px 0;color:#64748b;font-size:13px;width:140px;">Reference</td>
                  <td style="padding:5px 0;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(payment.paymentNumber)}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#64748b;font-size:13px;">Purpose</td>
                  <td style="padding:5px 0;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(payment.purpose)}</td>
                </tr>
                <tr>
                  <td style="padding:5px 0;color:#64748b;font-size:13px;">Amount Due</td>
                  <td style="padding:5px 0;color:#0f172a;font-size:13px;font-weight:600;">${escapeHtml(amount)}</td>
                </tr>
              </table>
            </div>

            <p style="font-size:14px;color:#334155;margin:0 0 16px;">Please complete your payment before the link expires:</p>
            <a href="${escapeHtml(payment.checkoutUrl)}" target="_blank"
               style="display:inline-block;background:#4361ee;color:#fff;font-size:14px;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;">
              Complete Payment &#8212; ${escapeHtml(amount)}
            </a>

            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
            <p style="font-size:12px;color:#94a3b8;margin:0;">
              Payment reference: <strong>${escapeHtml(payment.paymentNumber)}</strong><br/>
              If you have already paid or do not recognise this payment, please ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">
              &copy; ${new Date().getFullYear()} Izumi Global Networks &#183; イズミグローバルネットワークス合同会社
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await hercules.email.send({
      from: `Izumi Global Networks <${from}>`,
      to: customerEmail,
      subject: `Payment Reminder — Expires ${expiresAtFormatted} · ${escapeHtml(payment.paymentNumber)}`,
      html,
      text: `Payment Reminder\n\nDear ${customerName},\n\nYour payment of ${amount} (${payment.paymentNumber}) is expiring at ${expiresAtFormatted}.\n\nPay here: ${payment.checkoutUrl}`,
      tags: [{ name: "type", value: "expiry_reminder" }],
    });
  },
});
