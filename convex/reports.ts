import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Returns aggregated revenue data grouped by day for a given period.
 * Used for the trend chart on the Reports page.
 */
export const getRevenueByDay = query({
  args: {
    days: v.number(), // number of days to look back
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const cutoff = Date.now() - args.days * 24 * 60 * 60 * 1000;
    const payments = await ctx.db
      .query("payments")
      .order("desc")
      .take(2000);

    const tokyoOffset = 9 * 60 * 60 * 1000; // UTC+9 ms

    // Build map of day → {revenue, count}
    const map: Record<string, { revenue: number; count: number; refunded: number }> = {};

    for (let i = args.days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000 + tokyoOffset);
      const key = d.toISOString().slice(0, 10);
      map[key] = { revenue: 0, count: 0, refunded: 0 };
    }

    for (const p of payments) {
      if (p._creationTime < cutoff) continue;
      const d = new Date(p._creationTime + tokyoOffset);
      const key = d.toISOString().slice(0, 10);
      if (!(key in map)) continue;
      if (p.status === "paid" || p.status === "partially_refunded" || p.status === "refunded") {
        map[key].revenue += p.amount;
        map[key].count += 1;
      }
      if (p.totalRefunded) {
        map[key].refunded += p.totalRefunded;
      }
    }

    return Object.entries(map).map(([date, data]) => ({
      date: date.slice(5), // MM-DD
      fullDate: date,
      revenue: data.revenue,
      count: data.count,
      refunded: data.refunded,
      net: data.revenue - data.refunded,
    }));
  },
});

/**
 * Returns breakdown by service purpose.
 */
export const getPurposeBreakdown = query({
  args: { dateFilter: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const all = await ctx.db.query("payments").collect();
    const cutoff = getCutoff(args.dateFilter);
    const filtered = cutoff ? all.filter((p) => p._creationTime >= cutoff) : all;
    const paid = filtered.filter((p) => p.status === "paid" || p.status === "partially_refunded" || p.status === "refunded");

    const map: Record<string, { amount: number; count: number }> = {};
    for (const p of paid) {
      map[p.purpose] = map[p.purpose] ?? { amount: 0, count: 0 };
      map[p.purpose].amount += p.amount;
      map[p.purpose].count += 1;
    }

    return Object.entries(map)
      .map(([purpose, data]) => ({ purpose, ...data }))
      .sort((a, b) => b.amount - a.amount);
  },
});

/**
 * Returns breakdown by currency.
 */
export const getCurrencyBreakdown = query({
  args: { dateFilter: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const all = await ctx.db.query("payments").collect();
    const cutoff = getCutoff(args.dateFilter);
    const filtered = cutoff ? all.filter((p) => p._creationTime >= cutoff) : all;
    const paid = filtered.filter((p) => p.status === "paid" || p.status === "partially_refunded" || p.status === "refunded");

    const map: Record<string, { amount: number; count: number }> = {};
    for (const p of paid) {
      map[p.currency] = map[p.currency] ?? { amount: 0, count: 0 };
      map[p.currency].amount += p.amount;
      map[p.currency].count += 1;
    }

    return Object.entries(map)
      .map(([currency, data]) => ({ currency, ...data }))
      .sort((a, b) => b.count - a.count);
  },
});

/**
 * Returns top 10 customers by revenue.
 */
export const getTopCustomers = query({
  args: { dateFilter: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const all = await ctx.db.query("payments").collect();
    const cutoff = getCutoff(args.dateFilter);
    const filtered = cutoff ? all.filter((p) => p._creationTime >= cutoff) : all;
    const paid = filtered.filter((p) => p.status === "paid" || p.status === "partially_refunded" || p.status === "refunded");

    const map: Record<string, { amount: number; count: number; customerId: string }> = {};
    for (const p of paid) {
      const cid = p.customerId;
      map[cid] = map[cid] ?? { amount: 0, count: 0, customerId: cid };
      map[cid].amount += p.amount;
      map[cid].count += 1;
    }

    const sorted = Object.values(map).sort((a, b) => b.amount - a.amount).slice(0, 10);

    return await Promise.all(
      sorted.map(async (row) => {
        const customer = await ctx.db.get(row.customerId as Parameters<typeof ctx.db.get>[0]);
        // ctx.db.get returns a union of all table types — narrow to customers table fields safely
        const c = customer as { name?: string; email?: string } | null;
        return { ...row, customerName: c?.name ?? "Unknown", customerEmail: c?.email };
      })
    );
  },
});

/**
 * Returns all paid payments for CSV export (bounded).
 */
export const getPaymentsForExport = query({
  args: {
    dateFilter: v.optional(v.string()),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const all = await ctx.db.query("payments").order("desc").take(2000);
    const cutoff = getCutoff(args.dateFilter);
    let filtered = cutoff ? all.filter((p) => p._creationTime >= cutoff) : all;

    if (args.status) {
      filtered = filtered.filter((p) => p.status === args.status);
    }

    return await Promise.all(
      filtered.map(async (p) => {
        const customer = await ctx.db.get(p.customerId);
        const createdByUser = await ctx.db.get(p.createdBy);
        return { ...p, customerName: customer?.name, customerEmail: customer?.email, createdByName: createdByUser?.name };
      })
    );
  },
});

function getCutoff(dateFilter: string | undefined): number | null {
  if (!dateFilter || dateFilter === "all") return null;
  const now = Date.now();
  if (dateFilter === "today") {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }
  if (dateFilter === "7days") return now - 7 * 24 * 60 * 60 * 1000;
  if (dateFilter === "30days") return now - 30 * 24 * 60 * 60 * 1000;
  if (dateFilter === "90days") return now - 90 * 24 * 60 * 60 * 1000;
  if (dateFilter === "month") {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  }
  if (dateFilter === "year") {
    const d = new Date();
    return new Date(d.getFullYear(), 0, 1).getTime();
  }
  return null;
}
