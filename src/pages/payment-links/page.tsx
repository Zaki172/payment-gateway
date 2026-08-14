import { useQuery, useAction } from "convex/react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from "@/lib/payment-utils.ts";
import { cn } from "@/lib/utils.ts";
import { Copy, ExternalLink, RotateCcw, Eye } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export default function PaymentLinks() {
  const navigate = useNavigate();
  const payments = useQuery(api.payments.list, {});
  const newCheckoutAttempt = useAction(api.stripe.createNewCheckoutAttempt);
  const [retrying, setRetrying] = useState<string | null>(null);

  const linksData = (payments ?? []).filter((p) => p.checkoutUrl || p.status === "failed" || p.status === "expired");
  const active = linksData.filter((p) => p.status === "pending" || p.status === "processing");
  const paid = linksData.filter((p) => p.status === "paid");
  const expired = linksData.filter((p) => p.status === "expired" || p.status === "cancelled" || p.status === "failed");

  const handleRetry = async (paymentId: Id<"payments">) => {
    setRetrying(paymentId);
    try {
      const result = await newCheckoutAttempt({ paymentId });
      await navigator.clipboard.writeText(result.url);
      toast.success("New checkout link created and copied!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create checkout");
    } finally {
      setRetrying(null);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Payment Links</h1>
        <p className="text-sm text-muted-foreground">Manage all generated Stripe checkout links</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Active", value: active.length, color: "text-blue-600" },
          { label: "Paid", value: paid.length, color: "text-emerald-600" },
          { label: "Expired / Cancelled", value: expired.length, color: "text-gray-500" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={cn("text-2xl font-bold mt-1", s.color)}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Customer</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Payment #</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Amount</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Reference</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Status</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden md:table-cell">Created</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden lg:table-cell">Expires</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!payments
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={8} className="px-4 py-3"><Skeleton className="h-8" /></td></tr>
                  ))
                : linksData.length === 0
                ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">No payment links yet. Create a payment to generate a link.</td></tr>
                )
                : linksData.map((p) => (
                  <tr key={p._id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3 text-xs">{p.customer?.name ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{p.paymentNumber}</td>
                    <td className="px-4 py-3 text-right font-semibold text-xs">{formatCurrency(p.amount, p.currency)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{p.bookingReference ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold", getStatusColor(p.status))}>{getStatusLabel(p.status)}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{formatDate(p._creationTime)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">{p.expiresAt ? formatDate(p.expiresAt) : "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => navigate(`/payments/${p._id}`)}>< Eye size={12} /></Button>
                        {p.checkoutUrl && (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { navigator.clipboard.writeText(p.checkoutUrl!); toast.success("Copied!"); }}><Copy size={12} /></Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => window.open(p.checkoutUrl!, "_blank")}><ExternalLink size={12} /></Button>
                          </>
                        )}
                        {(p.status === "failed" || p.status === "expired" || p.status === "cancelled") && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-blue-600" disabled={retrying === p._id} onClick={() => handleRetry(p._id as Id<"payments">)}><RotateCcw size={12} /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
