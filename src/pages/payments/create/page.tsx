import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select.tsx";
import { toast } from "sonner";
import { PURPOSES, CURRENCIES, EXPIRY_OPTIONS, formatCurrency } from "@/lib/payment-utils.ts";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { CheckCircle2, Copy, ExternalLink, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils.ts";

export default function CreatePayment() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const customers = useQuery(api.customers.list, {});
  const createCustomer = useMutation(api.customers.create);
  const getNextNumber = useMutation(api.payments.getNextPaymentNumber);
  const createPayment = useMutation(api.payments.create);
  const createCheckout = useAction(api.stripe.createCheckoutSession);

  const [step, setStep] = useState<"form" | "created">("form");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ paymentId: Id<"payments">; url: string; paymentNumber: string; needsApproval: boolean } | null>(null);

  const [customerMode, setCustomerMode] = useState<"existing" | "new">("existing");
  const [selectedCustomerId, setSelectedCustomerId] = useState(() => searchParams.get("customerId") ?? "");
  const [customerSearch, setCustomerSearch] = useState("");
  const [newCustomer, setNewCustomer] = useState({ name: "", email: "", phone: "", internalId: "" });
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("JPY");
  const [purpose, setPurpose] = useState("");
  const [bookingRef, setBookingRef] = useState("");
  const [description, setDescription] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [expiryHours, setExpiryHours] = useState(72);

  const filteredCustomers = (customers ?? []).filter(
    (c) =>
      !customerSearch ||
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      c.email?.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const selectedCustomer = (customers ?? []).find((c) => c._id === selectedCustomerId);

  const handleSubmit = async () => {
    if (!amount || Number(amount) <= 0) { toast.error("Please enter a valid amount"); return; }
    if (!purpose) { toast.error("Please select a payment purpose"); return; }
    if (!bookingRef) { toast.error("Please enter a booking/invoice reference"); return; }
    if (customerMode === "existing" && !selectedCustomerId) { toast.error("Please select a customer"); return; }
    if (customerMode === "new" && !newCustomer.name) { toast.error("Please enter customer name"); return; }

    setLoading(true);
    try {
      let customerId: Id<"customers">;
      if (customerMode === "new") {
        customerId = await createCustomer({ name: newCustomer.name, email: newCustomer.email || undefined, phone: newCustomer.phone || undefined, internalCustomerId: newCustomer.internalId || undefined });
      } else {
        customerId = selectedCustomerId as Id<"customers">;
      }

      const paymentNumber = await getNextNumber({});
      const expiresAt = new Date(Date.now() + expiryHours * 3600000).toISOString();
      const noDecimals = ["JPY", "BDT"];
      const amountInt = noDecimals.includes(currency) ? Math.round(Number(amount)) : Math.round(Number(amount) * 100);

      const paymentId = await createPayment({ paymentNumber, customerId, amount: amountInt, currency, purpose, description: description || undefined, bookingReference: bookingRef, internalNote: internalNote || undefined, expiresAt });

      let checkoutUrl = "";
      let needsApproval = false;

      try {
        const checkout = await createCheckout({ paymentId, idempotencyKey: `payment_${paymentId}` });
        checkoutUrl = checkout.url;
      } catch (err) {
        if (err instanceof Error && err.message.includes("approval")) {
          needsApproval = true;
        } else if (err instanceof Error && err.message.includes("Stripe not configured")) {
          checkoutUrl = "";
          toast.warning("Stripe is not configured. Payment record created without a checkout link.");
        } else {
          throw err;
        }
      }

      setResult({ paymentId, url: checkoutUrl, paymentNumber, needsApproval });
      setStep("created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create payment");
    } finally {
      setLoading(false);
    }
  };

  if (step === "created" && result) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <div className={cn("w-16 h-16 rounded-full flex items-center justify-center mx-auto", result.needsApproval ? "bg-amber-100" : "bg-emerald-100")}>
              {result.needsApproval ? <AlertCircle size={32} className="text-amber-600" /> : <CheckCircle2 size={32} className="text-emerald-600" />}
            </div>
            <div>
              <h2 className="text-xl font-bold">{result.needsApproval ? "Approval Required" : "Payment Link Created"}</h2>
              <p className="text-sm text-muted-foreground mt-1">{result.needsApproval ? "This payment requires manager approval before a checkout link can be generated." : "The Stripe checkout link is ready to share with your customer."}</p>
            </div>
            <div className="bg-muted rounded-lg p-4 text-sm space-y-2 text-left">
              <div className="flex justify-between"><span className="text-muted-foreground">Payment #</span><span className="font-mono font-medium">{result.paymentNumber}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold">{formatCurrency(["JPY", "BDT"].includes(currency) ? Number(amount) : Number(amount) * 100, currency)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span>{bookingRef}</span></div>
            </div>
            {result.url && (
              <div className="space-y-2">
                <div className="bg-muted rounded-lg px-3 py-2 text-xs font-mono text-left break-all">{result.url}</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" className="flex-1" onClick={() => { navigator.clipboard.writeText(result.url); toast.success("Link copied!"); }}><Copy size={14} className="mr-1" /> Copy Link</Button>
                  <Button size="sm" className="flex-1" onClick={() => window.open(result.url, "_blank")}><ExternalLink size={14} className="mr-1" /> Open Checkout</Button>
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => navigate(`/payments/${result.paymentId}`)}>View Payment</Button>
              <Button className="flex-1" onClick={() => { setStep("form"); setResult(null); setAmount(""); setBookingRef(""); setDescription(""); setInternalNote(""); setSelectedCustomerId(""); }}>Create Another</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create Payment</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Generate a secure Stripe Checkout link for your customer</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Customer Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button size="sm" variant={customerMode === "existing" ? "default" : "secondary"} onClick={() => setCustomerMode("existing")}>Existing Customer</Button>
            <Button size="sm" variant={customerMode === "new" ? "default" : "secondary"} onClick={() => setCustomerMode("new")}>New Customer</Button>
          </div>
          {customerMode === "existing" ? (
            <div className="space-y-2">
              <Input placeholder="Search customer name or email..." value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
              <div className="border rounded-lg max-h-40 overflow-y-auto">
                {filteredCustomers.slice(0, 10).map((c) => (
                  <button key={c._id} onClick={() => { setSelectedCustomerId(c._id); setCustomerSearch(""); }} className={cn("w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/50 text-left transition-colors", selectedCustomerId === c._id && "bg-primary/5")}>
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">{c.name.charAt(0)}</div>
                    <div><div className="font-medium">{c.name}</div><div className="text-xs text-muted-foreground">{c.email}</div></div>
                    {selectedCustomerId === c._id && <CheckCircle2 size={14} className="text-primary ml-auto" />}
                  </button>
                ))}
                {filteredCustomers.length === 0 && <div className="p-4 text-center text-sm text-muted-foreground">No customers found</div>}
              </div>
              {selectedCustomer && (
                <div className="bg-primary/5 rounded-lg px-3 py-2 text-sm">
                  <span className="font-medium">{selectedCustomer.name}</span>
                  {selectedCustomer.email && <span className="text-muted-foreground ml-2">{selectedCustomer.email}</span>}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1"><Label>Customer Name *</Label><Input placeholder="e.g. Rahim Ahmed" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Email</Label><Input type="email" placeholder="customer@example.com" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} /></div>
              <div className="space-y-1"><Label>Phone</Label><Input placeholder="+81-80-1234-5678" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} /></div>
              <div className="col-span-2 space-y-1"><Label>Internal Customer ID</Label><Input placeholder="CUST-001" value={newCustomer.internalId} onChange={(e) => setNewCustomer({ ...newCustomer, internalId: e.target.value })} /></div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Payment Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Amount *</Label><Input type="number" placeholder="85000" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-1"><Label>Currency *</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          {amount && Number(amount) > 0 && (
            <div className="bg-primary/5 rounded-lg px-3 py-2 text-sm font-medium">{formatCurrency(["JPY", "BDT"].includes(currency) ? Number(amount) : Number(amount) * 100, currency)}</div>
          )}
          <div className="space-y-1"><Label>Payment Purpose *</Label>
            <Select value={purpose} onValueChange={setPurpose}>
              <SelectTrigger><SelectValue placeholder="Select purpose..." /></SelectTrigger>
              <SelectContent>{PURPOSES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Booking / Invoice Reference *</Label><Input placeholder="NTT-260814-001" value={bookingRef} onChange={(e) => setBookingRef(e.target.value)} /></div>
          <div className="space-y-1"><Label>Description</Label><Textarea placeholder="e.g. Tokyo to Dhaka round trip air ticket" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} /></div>
          <div className="space-y-1"><Label>Internal Note <span className="text-xs text-muted-foreground">(never shown to customer)</span></Label><Textarea placeholder="For internal reference only..." value={internalNote} onChange={(e) => setInternalNote(e.target.value)} rows={2} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Payment Link Settings</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1"><Label>Link Expiration</Label>
            <div className="flex gap-2 flex-wrap">
              {EXPIRY_OPTIONS.map((opt) => (
                <button key={opt.hours} onClick={() => setExpiryHours(opt.hours)} className={cn("px-3 py-1.5 rounded-lg text-sm border transition-colors", expiryHours === opt.hours ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted")}>{opt.label}</button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" size="lg" onClick={handleSubmit} disabled={loading}>
        {loading ? <span className="flex items-center gap-2"><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Creating Secure Payment Link…</span> : "Create Payment Link"}
      </Button>
    </div>
  );
}
