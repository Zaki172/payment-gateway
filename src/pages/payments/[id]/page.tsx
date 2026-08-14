import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { toast } from "sonner";
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from "@/lib/payment-utils.ts";
import { cn } from "@/lib/utils.ts";
import {
  ArrowLeft, Copy, ExternalLink, RefreshCw, CheckCircle2, XCircle, Clock, AlertCircle,
  RotateCcw, FileText, Link2, Ban, ShieldCheck, Activity, Download, Mail,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog.tsx";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { generateInvoicePDF } from "@/lib/generate-invoice-pdf.ts";
import { ConvexError } from "convex/values";

export default function PaymentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const payment = useQuery(api.payments.getById, { id: id as Id<"payments"> });
  const currentUser = useQuery(api.users.getCurrentUser);
  const requestRefund = useMutation(api.refunds.requestRefund);
  const approvePayment = useMutation(api.payments.approvePayment);
  const cancelPayment = useMutation(api.payments.cancel);
  const newCheckoutAttempt = useAction(api.stripe.createNewCheckoutAttempt);
  const sendPaymentLinkEmail = useAction(api.emails.sendPaymentLinkEmail);

  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundNote, setRefundNote] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!payment) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  const canRefund = payment.status === "paid" || payment.status === "partially_refunded";
  const canApprove = payment.status === "approval_required" &&
    (currentUser?.role === "owner" || currentUser?.role === "manager");
  const canRetry = payment.status === "failed" || payment.status === "expired" || payment.status === "cancelled";

  const handleSendEmail = async () => {
    setLoading(true);
    try {
      await sendPaymentLinkEmail({ paymentId: payment._id });
      toast.success(`Payment link emailed to ${payment.customer?.email}`);
    } catch (err) {
      if (err instanceof ConvexError) {
        const { message } = err.data as { message: string };
        toast.error(message);
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to send email");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNewAttempt = async () => {
    setLoading(true);
    try {
      const result = await newCheckoutAttempt({ paymentId: payment._id });
      toast.success("New checkout link created");
      await navigator.clipboard.writeText(result.url);
      toast.info("Link copied to clipboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create checkout");
    } finally {
      setLoading(false);
    }
  };

  const handleRefundSubmit = async () => {
    if (!refundAmount || Number(refundAmount) <= 0) {
      toast.error("Enter a valid refund amount");
      return;
    }
    setLoading(true);
    try {
      const noDecimals = ["JPY", "BDT"];
      const amt = noDecimals.includes(payment.currency)
        ? Math.round(Number(refundAmount))
        : Math.round(Number(refundAmount) * 100);

      await requestRefund({
        paymentId: payment._id,
        refundAmount: amt,
        reason: refundReason,
        internalNote: refundNote || undefined,
      });
      toast.success("Refund request submitted");
      setRefundOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit refund");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      await approvePayment({ paymentId: payment._id });
      toast.success("Payment approved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to approve");
    }
  };

  const handleCancel = async () => {
    try {
      await cancelPayment({ id: payment._id });
      toast.success("Payment cancelled");
      setCancelOpen(false);
    } catch {
      toast.error("Failed to cancel");
    }
  };

  const StatusIcon = () => {
    if (payment.status === "paid") return <CheckCircle2 className="text-emerald-500" size={20} />;
    if (payment.status === "failed") return <XCircle className="text-red-500" size={20} />;
    if (payment.status === "pending") return <Clock className="text-amber-500" size={20} />;
    if (payment.status === "approval_required") return <AlertCircle className="text-orange-500" size={20} />;
    return <RefreshCw className="text-blue-500" size={20} />;
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/payments")}>
          <ArrowLeft size={16} className="mr-1" /> Back
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <StatusIcon />
          <div>
            <h1 className="text-xl font-bold font-mono">{payment.paymentNumber}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold", getStatusColor(payment.status))}>
                {getStatusLabel(payment.status)}
              </span>
              <span className="text-sm font-semibold">{formatCurrency(payment.amount, payment.currency)}</span>
            </div>
          </div>
        </div>

        <div className="sm:ml-auto flex flex-wrap gap-2">
          {(payment.status === "paid" || payment.status === "refunded" || payment.status === "partially_refunded") && (
            <Button size="sm" variant="secondary" onClick={() => {
              generateInvoicePDF({ ...payment, customer: payment.customer ?? undefined, createdByUser: payment.createdByUser ?? undefined });
              toast.success("Receipt downloaded");
            }}>
              <Download size={14} className="mr-1" /> Download Receipt
            </Button>
          )}
          {(payment.status === "paid" || payment.status === "refunded" || payment.status === "partially_refunded") && (
            <Button size="sm" variant="secondary" onClick={() => window.open(`/receipt/${payment._id}`, "_blank")}>
              <ExternalLink size={14} className="mr-1" /> View Receipt Page
            </Button>
          )}
          {canRetry && (
            <Button size="sm" variant="secondary" onClick={handleNewAttempt} disabled={loading}>
              <RotateCcw size={14} className="mr-1" /> New Checkout Attempt
            </Button>
          )}
          {canApprove && (
            <Button size="sm" onClick={handleApprove}>
              <CheckCircle2 size={14} className="mr-1" /> Approve Payment
            </Button>
          )}
          {canRefund && (
            <Button size="sm" variant="secondary" onClick={() => setRefundOpen(true)}>
              <RefreshCw size={14} className="mr-1" /> Request Refund
            </Button>
          )}
          {payment.checkoutUrl && (
            <>
              <Button size="sm" variant="secondary" onClick={() => {
                navigator.clipboard.writeText(payment.checkoutUrl!);
                toast.success("Link copied");
              }}>
                <Copy size={14} className="mr-1" /> Copy Link
              </Button>
              {payment.customer?.email && payment.status !== "paid" && (
                <Button size="sm" variant="secondary" onClick={handleSendEmail} disabled={loading}>
                  <Mail size={14} className="mr-1" /> Email to Customer
                </Button>
              )}
              <Button size="sm" onClick={() => window.open(payment.checkoutUrl!, "_blank")}>
                <ExternalLink size={14} className="mr-1" /> Open Checkout
              </Button>
            </>
          )}
          {(payment.status === "pending" || payment.status === "approval_required") && (
            <Button size="sm" variant="destructive" onClick={() => setCancelOpen(true)}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {payment.status === "approval_required" && (
        <div className="flex items-start gap-3 p-4 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-xl">
          <AlertCircle size={18} className="text-orange-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">Awaiting Manager Approval</p>
            <p className="text-xs text-orange-600/80 dark:text-orange-500 mt-0.5">
              This payment exceeds the staff approval threshold and requires a manager or owner to approve.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Customer Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Name" value={payment.customer?.name} />
            <Row label="Email" value={payment.customer?.email ?? "—"} />
            <Row label="Phone" value={payment.customer?.phone ?? "—"} />
            <Row label="Customer ID" value={payment.customer?.internalCustomerId ?? "—"} />
            <Button variant="ghost" size="sm" className="text-xs mt-1 px-0" onClick={() => navigate(`/customers/${payment.customerId}`)}>View Customer Profile &rarr;</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Payment Information</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Amount" value={formatCurrency(payment.amount, payment.currency)} />
            <Row label="Currency" value={payment.currency} />
            <Row label="Purpose" value={payment.purpose} />
            <Row label="Booking Ref" value={payment.bookingReference ?? "—"} />
            <Row label="Invoice Ref" value={payment.invoiceReference ?? "—"} />
            {payment.description && <Row label="Description" value={payment.description} />}
            <Row label="Created By" value={payment.createdByUser?.name ?? "—"} />
            <Row label="Created At" value={formatDate(payment._creationTime)} />
            {payment.paidAt && <Row label="Paid At" value={formatDate(payment.paidAt)} />}
            {payment.expiresAt && <Row label="Expires" value={formatDate(payment.expiresAt)} />}
            {payment.internalNote && (
              <div className="mt-2 pt-2 border-t">
                <div className="text-xs text-muted-foreground mb-1">Internal Note</div>
                <div className="text-xs bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded p-2 text-amber-900 dark:text-amber-300">{payment.internalNote}</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Stripe References</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Mode" value={
              <span className={cn("text-xs font-semibold", payment.stripeMode === "test" ? "text-amber-600" : "text-emerald-600")}>
                {payment.stripeMode?.toUpperCase()}
              </span>
            } />
            <Row label="Checkout Session ID" value={<span className="font-mono text-xs">{payment.stripeCheckoutSessionId ?? "—"}</span>} />
            <Row label="PaymentIntent ID" value={<span className="font-mono text-xs">{payment.stripePaymentIntentId ?? "—"}</span>} />
            <Row label="Charge ID" value={<span className="font-mono text-xs">{payment.stripeChargeId ?? "—"}</span>} />
            {payment.cardBrand && <Row label="Card" value={`${payment.cardBrand.toUpperCase()} •••• ${payment.cardLast4}`} />}
          </CardContent>
        </Card>

        {payment.refunds.length > 0 && (
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm">Refunds</CardTitle>
              <span className="text-xs text-muted-foreground">{formatCurrency(payment.refunds.reduce((s, r) => s + r.refundAmount, 0), payment.currency)} of {formatCurrency(payment.amount, payment.currency)} refunded</span>
            </CardHeader>
            <CardContent className="space-y-2">
              {payment.refunds.map((r) => (
                <div key={r._id} className="flex items-center justify-between text-sm py-2 border-b last:border-0">
                  <div>
                    <div className="font-mono text-xs font-medium">{r.refundNumber}</div>
                    <div className="text-xs text-muted-foreground">{r.reason}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatCurrency(r.refundAmount, r.currency)}</div>
                    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold", getStatusColor(r.status))}>{getStatusLabel(r.status)}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Payment Activity</CardTitle></CardHeader>
        <CardContent>
          {payment.events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Activity size={28} className="mb-2 opacity-50" />
              <p className="text-sm">No activity recorded yet</p>
            </div>
          ) : (
            <div className="space-y-0">
              {payment.events.sort((a, b) => a._creationTime - b._creationTime).map((e, i) => {
                const { icon: EventIcon, className: iconClass } = getEventIconConfig(e.eventType);
                return (
                  <div key={e._id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={cn("w-8 h-8 rounded-full shrink-0 flex items-center justify-center", iconClass)}>
                        <EventIcon size={16} />
                      </div>
                      {i < payment.events.length - 1 && <div className="w-px flex-1 bg-border" />}
                    </div>
                    <div className="pb-4 flex-1 pt-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{e.description}</p>
                        {e.isSystem && (
                          <span className="text-[10px] font-medium bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 px-1.5 py-0.5 rounded">via Stripe</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {e.performedByUser ? `${e.performedByUser.name} · ` : ""}
                        {new Date(e._creationTime).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Request Refund</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="bg-muted rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Original Amount</span>
                <span className="font-semibold">{formatCurrency(payment.amount, payment.currency)}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Refund Amount *</Label>
              <Input type="number" placeholder="Full or partial amount" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Reason *</Label>
              <Input placeholder="e.g. Customer requested cancellation" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Internal Note</Label>
              <Textarea placeholder="Internal notes (not shown to customer)" value={refundNote} onChange={(e) => setRefundNote(e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRefundOpen(false)}>Cancel</Button>
            <Button onClick={handleRefundSubmit} disabled={loading}>{loading ? "Submitting..." : "Submit Refund Request"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel Payment?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will cancel the payment. The checkout link will no longer work.</p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>Go Back</Button>
            <Button variant="destructive" onClick={handleCancel}>Cancel Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function getEventIconConfig(type: string): { icon: React.ComponentType<{ size?: number }>; className: string } {
  if (type === "created") return { icon: FileText, className: "bg-blue-100 text-blue-600 dark:bg-blue-900/40" };
  if (type === "link_created") return { icon: Link2, className: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40" };
  if (type === "link_copied") return { icon: Copy, className: "bg-sky-100 text-sky-600 dark:bg-sky-900/40" };
  if (type === "paid") return { icon: CheckCircle2, className: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40" };
  if (type === "failed") return { icon: XCircle, className: "bg-red-100 text-red-600 dark:bg-red-900/40" };
  if (type === "cancelled") return { icon: Ban, className: "bg-gray-100 text-gray-500 dark:bg-gray-800" };
  if (type === "refund_requested" || type.includes("refund")) return { icon: RotateCcw, className: "bg-purple-100 text-purple-600 dark:bg-purple-900/40" };
  if (type === "approved") return { icon: ShieldCheck, className: "bg-teal-100 text-teal-600 dark:bg-teal-900/40" };
  return { icon: Activity, className: "bg-muted text-muted-foreground" };
}
