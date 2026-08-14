import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import {
  TrendingUp, CreditCard, Clock, XCircle, RotateCcw,
  CheckCircle, BarChart2, Users, ArrowRight, Link2, Download, Plus, Shield, AlertTriangle,
} from "lucide-react";
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from "@/lib/payment-utils.ts";

const DATE_FILTERS = [
  { label: "Today", value: "today" },
  { label: "7 Days", value: "7days" },
  { label: "30 Days", value: "30days" },
  { label: "This Month", value: "month" },
];

const STATUS_COLORS = {
  paid: "#22c55e",
  pending: "#f59e0b",
  failed: "#ef4444",
  refunded: "#8b5cf6",
};

export default function Dashboard() {
  const [dateFilter, setDateFilter] = useState("30days");
  const navigate = useNavigate();
  const stats = useQuery(api.payments.getDashboardStats, { dateFilter });
  const recentPayments = useQuery(api.payments.list, {});
  const recentActivity = useQuery(api.payments.getRecentActivity);
  const chartData = useQuery(api.reports.getRevenueByDay, { days: dateFilter === "today" ? 1 : dateFilter === "7days" ? 7 : 30 });
  const expiringData = useQuery(api.paymentAutomation.getExpiringPayments);

  const kpiCards = stats
    ? [
        {
          label: "Total Collected",
          value: formatCurrency(stats.totalCollected, "JPY"),
          sub: `${stats.paidCount} payments`,
          icon: <TrendingUp size={20} />,
          color: "text-emerald-600",
          bg: "bg-emerald-50 dark:bg-emerald-950/30",
        },
        {
          label: "Paid Payments",
          value: stats.paidCount.toString(),
          sub: formatCurrency(stats.paidAmount, "JPY"),
          icon: <CheckCircle size={20} />,
          color: "text-emerald-600",
          bg: "bg-emerald-50 dark:bg-emerald-950/30",
        },
        {
          label: "Pending Payments",
          value: stats.pendingCount.toString(),
          sub: formatCurrency(stats.pendingAmount, "JPY"),
          icon: <Clock size={20} />,
          color: "text-amber-600",
          bg: "bg-amber-50 dark:bg-amber-950/30",
        },
        {
          label: "Failed Payments",
          value: stats.failedCount.toString(),
          sub: formatCurrency(stats.failedAmount, "JPY"),
          icon: <XCircle size={20} />,
          color: "text-red-600",
          bg: "bg-red-50 dark:bg-red-950/30",
        },
        {
          label: "Refunded",
          value: formatCurrency(stats.refundedAmount, "JPY"),
          sub: "",
          icon: <RotateCcw size={20} />,
          color: "text-purple-600",
          bg: "bg-purple-50 dark:bg-purple-950/30",
        },
        {
          label: "Success Rate",
          value: `${stats.successRate.toFixed(1)}%`,
          sub: "",
          icon: <BarChart2 size={20} />,
          color: "text-blue-600",
          bg: "bg-blue-50 dark:bg-blue-950/30",
        },
        {
          label: "Average Payment",
          value: formatCurrency(stats.avgPayment, "JPY"),
          sub: "",
          icon: <CreditCard size={20} />,
          color: "text-indigo-600",
          bg: "bg-indigo-50 dark:bg-indigo-950/30",
        },
        {
          label: "Total Transactions",
          value: stats.totalTransactions.toString(),
          sub: "",
          icon: <BarChart2 size={20} />,
          color: "text-slate-600",
          bg: "bg-slate-50 dark:bg-slate-900/50",
        },
      ]
    : [];

  const pieData = stats
    ? [
        { name: "Paid", value: stats.paidCount, color: STATUS_COLORS.paid },
        { name: "Pending", value: stats.pendingCount, color: STATUS_COLORS.pending },
        { name: "Failed", value: stats.failedCount, color: STATUS_COLORS.failed },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Welcome to Izumi Payment Hub</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-muted rounded-lg p-0.5 gap-0.5">
            {DATE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setDateFilter(f.value)}
                className={cn(
                  "px-3 py-1.5 text-xs rounded-md font-medium transition-colors",
                  dateFilter === f.value
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => navigate("/create-payment")}>
            <Plus size={14} className="mr-1" /> Create Payment
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {!stats
          ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          : kpiCards.map((card) => (
              <Card key={card.label} className="border shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">{card.label}</p>
                      <p className="text-xl font-bold mt-1">{card.value}</p>
                      {card.sub && <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>}
                    </div>
                    <div className={cn("p-2 rounded-lg shrink-0", card.bg, card.color)}>{card.icon}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Expiring Soon Widget */}
      {expiringData && (expiringData.expiringToday.length > 0 || expiringData.expiringSoon.length > 0) && (
        <div className={cn(
          "rounded-xl border p-4",
          expiringData.expiringToday.length > 0
            ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
            : "bg-orange-50 border-orange-200 dark:bg-orange-950/20 dark:border-orange-800"
        )}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className={expiringData.expiringToday.length > 0 ? "text-amber-600" : "text-orange-500"} />
            <h3 className={cn("text-sm font-semibold", expiringData.expiringToday.length > 0 ? "text-amber-800 dark:text-amber-400" : "text-orange-700 dark:text-orange-400")}>
              {expiringData.expiringToday.length > 0
                ? `${expiringData.expiringToday.length} payment${expiringData.expiringToday.length > 1 ? "s" : ""} expiring today`
                : `${expiringData.expiringSoon.length} payment${expiringData.expiringSoon.length > 1 ? "s" : ""} expiring within 48 hours`
              }
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[...expiringData.expiringToday, ...expiringData.expiringSoon].slice(0, 6).map((p) => (
              <button
                key={p._id}
                onClick={() => navigate(`/payments/${p._id}`)}
                className="flex items-center justify-between bg-white/80 dark:bg-background/60 border border-amber-200 dark:border-amber-800/50 rounded-lg px-3 py-2 text-left hover:bg-white transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground truncate">{p.paymentNumber}</div>
                  <div className="text-xs text-muted-foreground truncate">{p.customerName}</div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div className="text-xs font-bold text-amber-700 dark:text-amber-400">{formatCurrency(p.amount, p.currency)}</div>
                  <div className="text-[10px] text-muted-foreground">{formatDate(p.expiresAt, true)} JST</div>
                </div>
              </button>
            ))}
          </div>
          {(expiringData.expiringToday.length + expiringData.expiringSoon.length) > 6 && (
            <button
              onClick={() => navigate("/payments?status=pending")}
              className="mt-2 text-xs text-amber-700 dark:text-amber-400 hover:underline cursor-pointer"
            >
              View all expiring payments &rarr;
            </button>
          )}
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Volume chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Revenue Trend</CardTitle>
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate("/reports")}>
              Full Report <ArrowRight size={12} />
            </Button>
          </CardHeader>
          <CardContent>
            {!chartData ? (
              <Skeleton className="h-48" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashRevenueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `¥${(v / 1000).toFixed(0)}k`} width={42} />
                  <Tooltip
                    formatter={(value: unknown) => [formatCurrency(Number(value ?? 0), "JPY"), "Revenue"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" fill="url(#dashRevenueGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Status pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Payment Status</CardTitle>
          </CardHeader>
          <CardContent>
            {!stats ? (
              <Skeleton className="h-48" />
            ) : pieData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend formatter={(value) => <span className="text-xs">{value}</span>} />
                  <Tooltip formatter={(v: unknown) => [String(v ?? ""), "Payments"]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent payments + activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent payments */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Recent Payments</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/payments")} className="text-xs gap-1">
              View All <ArrowRight size={12} />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Customer</th>
                    <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Reference</th>
                    <th className="text-right px-4 py-2 text-xs text-muted-foreground font-medium">Amount</th>
                    <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium">Status</th>
                    <th className="text-left px-4 py-2 text-xs text-muted-foreground font-medium hidden md:table-cell">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {!recentPayments
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i}>
                          <td colSpan={5} className="px-4 py-2"><Skeleton className="h-8" /></td>
                        </tr>
                      ))
                    : recentPayments.slice(0, 8).map((p) => (
                        <tr
                          key={p._id}
                          className="border-b last:border-0 hover:bg-muted/30 cursor-pointer"
                          onClick={() => navigate(`/payments/${p._id}`)}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                {p.customer?.name?.charAt(0) ?? "?"}
                              </div>
                              <div>
                                <div className="font-medium text-xs">{p.customer?.name}</div>
                                <div className="text-[10px] text-muted-foreground">{p.customer?.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{p.bookingReference ?? p.paymentNumber}</td>
                          <td className="px-4 py-3 text-right font-medium text-xs">
                            {formatCurrency(p.amount, p.currency)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold", getStatusColor(p.status))}>
                              {getStatusLabel(p.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">
                            {formatDate(p._creationTime)}
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Recent activity + quick actions */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-h-64 overflow-y-auto">
              {!recentActivity
                ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10" />)
                : recentActivity.slice(0, 8).map((a) => (
                    <div key={a._id} className="flex items-start gap-2 text-xs">
                      <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", getActivityDot(a.eventType))} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{getActivityLabel(a.eventType)}</p>
                        {a.customer && (
                          <p className="text-muted-foreground">{a.customer.name}</p>
                        )}
                        {a.payment && (
                          <p className="text-muted-foreground">{formatCurrency(a.payment.amount, a.payment.currency)}</p>
                        )}
                      </div>
                      <span className="text-muted-foreground shrink-0">{formatTimeAgo(a._creationTime)}</span>
                    </div>
                  ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { icon: <Link2 size={15} />, label: "Create Payment Link", to: "/create-payment" },
                { icon: <Users size={15} />, label: "Manage Customers", to: "/customers" },
                { icon: <Download size={15} />, label: "Reports & Analytics", to: "/reports" },
                { icon: <RotateCcw size={15} />, label: "View Refunds", to: "/refunds" },
                { icon: <Shield size={15} />, label: "Audit Logs", to: "/audit-logs" },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={() => navigate(a.to)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm hover:bg-muted/60 transition-colors text-left"
                >
                  <span className="text-primary">{a.icon}</span>
                  <span className="flex-1">{a.label}</span>
                  <ArrowRight size={12} className="text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function getActivityDot(type: string) {
  if (type === "paid") return "bg-emerald-500";
  if (type === "failed") return "bg-red-500";
  if (type === "created" || type === "link_created") return "bg-blue-500";
  if (type.includes("refund")) return "bg-purple-500";
  return "bg-muted-foreground";
}

function getActivityLabel(type: string) {
  const map: Record<string, string> = {
    created: "Payment created",
    link_created: "Payment link created",
    link_copied: "Payment link copied",
    paid: "Payment received",
    failed: "Payment failed",
    expired: "Payment expired",
    cancelled: "Payment cancelled",
    refund_requested: "Refund requested",
    refund_approved: "Refund approved",
    refund_completed: "Refund processed",
    approval_approved: "Payment approved",
  };
  return map[type] ?? type;
}

function formatTimeAgo(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}
