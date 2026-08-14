import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select.tsx";
import { toast } from "sonner";
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from "@/lib/payment-utils.ts";
import { cn } from "@/lib/utils.ts";
import { Copy, ExternalLink, Eye, Plus, Search, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog.tsx";

const STATUS_TABS = [
  { label: "All", value: "" },
  { label: "Paid", value: "paid" },
  { label: "Pending", value: "pending" },
  { label: "Failed", value: "failed" },
  { label: "Refunded", value: "refunded" },
  { label: "Expired", value: "expired" },
];

export default function AllPayments() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultStatus = searchParams.get("status") ?? "";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(defaultStatus);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const cancelPayment = useMutation(api.payments.cancel);

  const payments = useQuery(api.payments.list, {
    status: statusFilter || undefined,
    search: search || undefined,
  });
  const allPayments = useQuery(api.payments.list, {});
  const pendingApprovals = useQuery(api.payments.getPendingApprovals) ?? [];
  const approvePayment = useMutation(api.payments.approvePayment);
  const addEvent = useMutation(api.payments.addEvent);

  const handleCancel = async () => {
    if (!cancelId) return;
    try {
      await cancelPayment({ id: cancelId as Parameters<typeof cancelPayment>[0]["id"] });
      toast.success("Payment cancelled");
      setCancelId(null);
    } catch {
      toast.error("Failed to cancel payment");
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Payments</h1>
          <p className="text-sm text-muted-foreground">Manage all payment requests</p>
        </div>
        <Button className="sm:ml-auto" size="sm" onClick={() => navigate("/create-payment")}>
          <Plus size={14} className="mr-1" /> Create Payment
        </Button>
      </div>

      {pendingApprovals.length > 0 && (
        <Card className="border-amber-300/50 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle size={16} className="text-amber-600 shrink-0" />
              <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                {pendingApprovals.length} payment{pendingApprovals.length > 1 ? "s" : ""} awaiting your approval
              </span>
            </div>
            <div className="space-y-2">
              {pendingApprovals.map((a) => (
                <div key={a._id} className="flex items-center justify-between gap-3 bg-white dark:bg-card rounded-lg px-3 py-2.5 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center text-xs font-bold text-amber-700 shrink-0">
                      {a.customer?.name.charAt(0) ?? "?"}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{a.customer?.name ?? "Unknown"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {a.payment?.paymentNumber} · {a.payment ? formatCurrency(a.payment.amount, a.payment.currency) : ""} · requested by {a.requester?.name}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => navigate(`/payments/${a.paymentId}`)}>
                      <Eye size={11} className="mr-1" /> View
                    </Button>
                    <Button size="sm" className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={async () => {
                      try {
                        await approvePayment({ paymentId: a.paymentId });
                        toast.success("Payment approved");
                      } catch {
                        toast.error("Failed to approve payment");
                      }
                    }}>
                      <CheckCircle2 size={11} className="mr-1" /> Approve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 flex-1 max-w-sm">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <Input
            className="border-0 bg-transparent h-auto p-0 text-sm focus-visible:ring-0"
            placeholder="Search by name, reference, payment #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {STATUS_TABS.filter((s) => s.value).map((s) => (
              <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => {
          const count = allPayments?.filter((p) => tab.value ? p.status === tab.value : true).length;
          const isActive = statusFilter === tab.value;
          return (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors flex items-center gap-1.5",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted text-muted-foreground"
              )}
            >
              {tab.label}
              {count !== undefined && (
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full",
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-primary/10 text-primary"
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Payment #</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Customer</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Reference</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden sm:table-cell">Purpose</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Amount</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Status</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden lg:table-cell">Created By</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden md:table-cell">Created</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden lg:table-cell">Paid At</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!payments
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={10} className="px-4 py-3"><Skeleton className="h-8" /></td>
                    </tr>
                  ))
                : payments.length === 0
                ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center">
                      <p className="text-muted-foreground">No payments found</p>
                      <Button size="sm" className="mt-3" onClick={() => navigate("/create-payment")}>
                        <Plus size={14} className="mr-1" /> Create Payment
                      </Button>
                    </td>
                  </tr>
                )
                : payments.map((p) => (
                  <tr key={p._id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs font-medium">{p.paymentNumber}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {p.customer?.name?.charAt(0) ?? "?"}
                        </div>
                        <div>
                          <div className="font-medium text-xs">{p.customer?.name}</div>
                          <div className="text-[10px] text-muted-foreground hidden sm:block">{p.customer?.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.bookingReference ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">{p.purpose}</td>
                    <td className="px-4 py-3 text-right font-semibold text-xs">{formatCurrency(p.amount, p.currency)}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold", getStatusColor(p.status))}>
                        {getStatusLabel(p.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">{p.createdByUser?.name ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{formatDate(p._creationTime)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">{p.paidAt ? formatDate(p.paidAt) : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => navigate(`/payments/${p._id}`)}>
                          <Eye size={12} className="mr-1" /> View
                        </Button>
                        {p.checkoutUrl && (
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => {
                            navigator.clipboard.writeText(p.checkoutUrl!);
                            toast.success("Link copied");
                            addEvent({ paymentId: p._id, eventType: "link_copied", description: "Checkout link copied by staff", isSystem: false });
                          }}>
                            <Copy size={12} />
                          </Button>
                        )}
                        {p.checkoutUrl && (
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => window.open(p.checkoutUrl!, "_blank")}>
                            <ExternalLink size={12} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!cancelId} onOpenChange={() => setCancelId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Payment?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This will cancel the payment and the checkout link will no longer work.</p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCancelId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleCancel}>Confirm Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
