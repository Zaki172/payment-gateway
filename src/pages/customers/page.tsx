import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { formatCurrency, formatDate } from "@/lib/payment-utils.ts";
import { Plus, Search, Eye } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog.tsx";
import { Label } from "@/components/ui/label.tsx";
import { toast } from "sonner";

export default function Customers() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", internalId: "" });
  const [loading, setLoading] = useState(false);

  const customers = useQuery(api.customers.list, { search: search || undefined });
  const createCustomer = useMutation(api.customers.create);

  const handleCreate = async () => {
    if (!form.name) {
      toast.error("Customer name is required");
      return;
    }
    setLoading(true);
    try {
      await createCustomer({
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        internalCustomerId: form.internalId || undefined,
      });
      toast.success("Customer created");
      setCreateOpen(false);
      setForm({ name: "", email: "", phone: "", internalId: "" });
    } catch {
      toast.error("Failed to create customer");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-muted-foreground">Manage your customer database</p>
        </div>
        <Button className="sm:ml-auto" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} className="mr-1" /> Add Customer
        </Button>
      </div>

      <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 max-w-sm">
        <Search size={14} className="text-muted-foreground shrink-0" />
        <Input
          className="border-0 bg-transparent h-auto p-0 text-sm focus-visible:ring-0"
          placeholder="Search name, email, phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Customer</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Phone</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Total Paid</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium hidden md:table-cell">Payments</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium hidden lg:table-cell">Last Payment</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!customers
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-8" /></td></tr>
                  ))
                : customers.length === 0
                ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <p className="text-muted-foreground">No customers yet</p>
                      <Button size="sm" className="mt-3" onClick={() => setCreateOpen(true)}>
                        <Plus size={14} className="mr-1" /> Add Customer
                      </Button>
                    </td>
                  </tr>
                )
                : customers.map((c) => (
                  <tr key={c._id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {c.name.charAt(0)}
                        </div>
                        <div>
                          <div className="font-medium text-xs">{c.name}</div>
                          <div className="text-[10px] text-muted-foreground">{c.email ?? "—"}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-xs">{formatCurrency(c.totalPaidAmount, "JPY")}</td>
                    <td className="px-4 py-3 text-right text-xs hidden md:table-cell">{c.paymentCount}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground hidden lg:table-cell">
                      {c.lastPaymentAt ? formatDate(c.lastPaymentAt) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => navigate(`/customers/${c._id}`)}>
                        <Eye size={12} className="mr-1" /> View
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input placeholder="John Smith" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" placeholder="example@gmail.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input placeholder="+81-80-1234-5678" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Internal Customer ID</Label>
              <Input placeholder="CUST-001" value={form.internalId} onChange={(e) => setForm({ ...form, internalId: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={loading}>{loading ? "Creating..." : "Create Customer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
