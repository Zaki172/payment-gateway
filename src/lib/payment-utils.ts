/**
 * Shared payment utilities — formatting, status colors, labels.
 * Never put Stripe secrets or sensitive data here.
 */

export function formatCurrency(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  // JPY and BDT have no decimal places
  const noDecimals = ["JPY", "BDT"];
  const decimals = noDecimals.includes(code) ? 0 : 2;
  const divisor = noDecimals.includes(code) ? 1 : 100;

  const value = amount / divisor;

  try {
    return new Intl.NumberFormat("ja-JP", {
      style: "currency",
      currency: code,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return `${code} ${value.toLocaleString()}`;
  }
}

export function formatDate(ts: number | string, showTime = true): string {
  const d = typeof ts === "number" ? new Date(ts) : new Date(ts);
  const options: Intl.DateTimeFormatOptions = {
    timeZone: "Asia/Tokyo",
    month: "short",
    day: "numeric",
    ...(showTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  };
  return d.toLocaleString("en-US", options);
}

export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    processing: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
    failed: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    expired: "bg-gray-100 text-gray-600 dark:bg-gray-900/50 dark:text-gray-400",
    cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-900/50 dark:text-gray-400",
    refunded: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400",
    partially_refunded: "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-400",
    approval_required: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-400",
    draft: "bg-gray-100 text-gray-600 dark:bg-gray-900/50 dark:text-gray-400",
    // refund statuses
    requested: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    approved: "bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-400",
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
    rejected: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400",
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    paid: "Paid",
    pending: "Pending",
    processing: "Processing",
    failed: "Failed",
    expired: "Expired",
    cancelled: "Cancelled",
    refunded: "Refunded",
    partially_refunded: "Partial Refund",
    approval_required: "Approval Required",
    draft: "Draft",
    requested: "Pending Approval",
    approved: "Approved — Processing",
    completed: "Completed",
    rejected: "Rejected",
    refund_failed: "Failed",
  };
  return map[status] ?? status;
}

export const PURPOSES = [
  "Air Ticket",
  "Tour Package",
  "Hotel",
  "Visa Service",
  "Service Fee",
  "Invoice",
  "Other",
] as const;

export const CURRENCIES = ["JPY", "USD", "BDT"] as const;

export const EXPIRY_OPTIONS = [
  { label: "24 Hours", hours: 24 },
  { label: "72 Hours", hours: 72 },
  { label: "7 Days", hours: 168 },
];
