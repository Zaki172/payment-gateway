import { useQuery, useAction } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api.js";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, AlertTriangle, RefreshCw, Copy, Building2,
  Zap, Lock, Settings as SettingsIcon, CreditCard, Webhook, ShieldCheck,
} from "lucide-react";
import { formatDate } from "@/lib/payment-utils.ts";

const TABS = [
  { id: "company", label: "Company", icon: <Building2 size={14} /> },
  { id: "stripe", label: "Stripe", icon: <CreditCard size={14} /> },
  { id: "security", label: "Security", icon: <ShieldCheck size={14} /> },
  { id: "profile", label: "My Profile", icon: <SettingsIcon size={14} /> },
] as const;

type Tab = typeof TABS[number]["id"];

export default function Settings() {
  const [tab, setTab] = useState<Tab>("company");
  const currentUser = useQuery(api.users.getCurrentUser);
  const stripeSettings = useQuery(api.seed.getStripeSettings);
  const verifyStripe = useAction(api.stripe.verifyStripeConnection);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ connected: boolean; mode: string; error?: string } | null>(null);

  const CONVEX_SITE_URL = "https://upbeat-fly-318.convex.site";
  const webhookUrl = `${CONVEX_SITE_URL}/stripe/webhook`;

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const result = await verifyStripe({});
      setVerifyResult(result);
      if (result.connected) {
        toast.success(`Stripe connected (${result.mode.toUpperCase()} mode)`);
      } else {
        toast.error(result.error ?? "Stripe connection failed");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  const isConnected = verifyResult?.connected ?? stripeSettings?.isConnected ?? false;
  const stripeMode = verifyResult?.mode ?? stripeSettings?.mode ?? "test";

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          <SettingsIcon size={18} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">Application configuration and integration status</p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap -mb-px border-b-2",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {tab === "company" && (
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 size={15} className="text-primary" /> Company Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow label="Company Name" value="Izumi Global Networks" />
              <InfoRow label="Legal Name" value="イズミグローバルネットワークス合同会社" />
              <InfoRow label="Tagline" value="Connecting You Globally" />
              <InfoRow label="Default Currency" value={<Badge variant="secondary">JPY — Japanese Yen</Badge>} />
              <InfoRow label="Timezone" value={<Badge variant="secondary">Asia/Tokyo (JST, UTC+9)</Badge>} />
              <InfoRow label="Payment Number Format" value={<code className="text-xs bg-muted px-1.5 py-0.5 rounded">IZP-YYYYMMDD-XXXX</code>} />
              <InfoRow label="Refund Number Format" value={<code className="text-xs bg-muted px-1.5 py-0.5 rounded">RFD-YYYYMMDD-XXXX</code>} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap size={15} className="text-primary" /> Payment Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow label="Supported Currencies" value={
                <div className="flex gap-1.5">
                  {["JPY", "USD", "BDT"].map((c) => (
                    <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
                  ))}
                </div>
              } />
              <InfoRow label="Money Storage" value="Integer (smallest currency unit)" />
              <InfoRow label="Staff Approval Default" value="¥300,000 per transaction" />
              <InfoRow label="Checkout Platform" value="Stripe Checkout (hosted)" />
              <InfoRow label="Refund Processing" value="Automatic on approval, via Stripe API" />
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "stripe" && (
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <CreditCard size={15} className="text-primary" /> Stripe Connection
                {stripeMode === "test" && (
                  <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">TEST MODE</Badge>
                )}
                {stripeMode === "live" && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">LIVE MODE</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!stripeSettings ? (
                <Skeleton className="h-16" />
              ) : (
                <>
                  <div className={cn(
                    "flex items-center gap-3 p-3.5 rounded-xl border",
                    isConnected ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20" : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20"
                  )}>
                    {isConnected
                      ? <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
                      : <XCircle size={20} className="text-red-500 shrink-0" />}
                    <div className="flex-1">
                      <div className="font-semibold text-sm">
                        {isConnected ? "Connected to Stripe" : "Not Connected"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Mode:{" "}
                        <span className={cn("font-semibold", stripeMode === "test" ? "text-amber-600" : "text-emerald-600")}>
                          {stripeMode.toUpperCase()}
                        </span>
                        {stripeSettings.accountDisplayName && (
                          <span className="ml-2">· {stripeSettings.accountDisplayName}</span>
                        )}
                      </div>
                      {verifyResult?.error && (
                        <div className="text-xs text-red-500 mt-1">{verifyResult.error}</div>
                      )}
                    </div>
                    <Button size="sm" variant="secondary" onClick={handleVerify} disabled={verifying} className="shrink-0">
                      <RefreshCw size={12} className={cn("mr-1.5", verifying && "animate-spin")} />
                      {verifying ? "Verifying…" : "Test Connection"}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <InfoRow label="Webhook Health" value={
                      stripeSettings.webhookHealthy
                        ? <span className="text-emerald-600 font-medium flex items-center gap-1"><CheckCircle2 size={12} /> Healthy</span>
                        : <span className="text-muted-foreground">No webhooks received</span>
                    } />
                    {stripeSettings.lastWebhookAt && (
                      <InfoRow label="Last Webhook" value={formatDate(stripeSettings.lastWebhookAt)} />
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          <Card className="border-amber-200/70 dark:border-amber-800/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <AlertTriangle size={15} /> Secrets Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              <p className="text-muted-foreground text-xs">
                Stripe credentials are stored securely as encrypted secrets. Go to <strong>Advanced → Secrets</strong> in the sidebar to add them.
              </p>
              <div className="space-y-2">
                {[
                  { key: "STRIPE_SECRET_KEY", desc: "Your Stripe secret or restricted key (sk_test_… or rk_…)" },
                  { key: "STRIPE_WEBHOOK_SECRET", desc: "Webhook endpoint signing secret (whsec_…)" },
                  { key: "SITE_URL", desc: "Your deployed app URL for checkout success/cancel redirects" },
                ].map(({ key, desc }) => (
                  <div key={key} className="flex items-start gap-2 p-2.5 bg-muted/60 rounded-lg">
                    <code className="text-xs font-mono font-semibold text-primary shrink-0">{key}</code>
                    <span className="text-xs text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="border-blue-200/70 dark:border-blue-800/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2 text-blue-700 dark:text-blue-400">
                <Webhook size={15} /> Webhook Endpoint
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <code className="text-xs break-all flex-1 font-mono">{webhookUrl}</code>
                <Button size="sm" variant="ghost" className="h-7 px-2 shrink-0" onClick={() => copyToClipboard(webhookUrl, "Webhook URL")}>
                  <Copy size={12} />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Register this URL in your <strong>Stripe Dashboard → Developers → Webhooks</strong>. Select these events:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {["checkout.session.completed", "payment_intent.payment_failed", "charge.refunded"].map((e) => (
                  <div key={e} className="flex items-center gap-1">
                    <code className="text-[10px] bg-muted px-2 py-0.5 rounded font-mono">{e}</code>
                    <Button size="sm" variant="ghost" className="h-5 px-1" onClick={() => copyToClipboard(e, e)}>
                      <Copy size={9} />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "security" && (
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lock size={15} className="text-primary" /> Security Architecture
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { icon: <ShieldCheck size={16} className="text-emerald-600" />, title: "Server-side Stripe API calls only", desc: "All Stripe API calls are executed in Convex Node.js actions. The Stripe secret key never reaches the browser." },
                { icon: <CheckCircle2 size={16} className="text-emerald-600" />, title: "Webhook signature verification", desc: "Every incoming Stripe webhook is verified using STRIPE_WEBHOOK_SECRET before any database writes occur." },
                { icon: <CheckCircle2 size={16} className="text-emerald-600" />, title: "Payment status set only by webhook", desc: "A payment is marked Paid only after a verified checkout.session.completed webhook." },
                { icon: <CheckCircle2 size={16} className="text-emerald-600" />, title: "Refund approval workflow", desc: "Refunds cannot be submitted to Stripe directly by staff. They must be approved by a Manager or Owner." },
                { icon: <CheckCircle2 size={16} className="text-emerald-600" />, title: "Role-based access control (RBAC)", desc: "All backend mutations verify the caller's role from the database (not client-supplied)." },
                { icon: <CheckCircle2 size={16} className="text-emerald-600" />, title: "Immutable audit log", desc: "All sensitive operations are written to the auditLogs table. Entries are append-only." },
                { icon: <CheckCircle2 size={16} className="text-emerald-600" />, title: "Duplicate webhook prevention", desc: "Stripe event IDs are checked for duplicates before processing." },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border">
                  <span className="shrink-0 mt-0.5">{item.icon}</span>
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "profile" && (
        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <SettingsIcon size={15} className="text-primary" /> Your Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!currentUser ? (
                <Skeleton className="h-24" />
              ) : (
                <>
                  <div className="flex items-center gap-4 pb-3 border-b">
                    <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground text-xl font-bold">
                      {currentUser.name?.charAt(0)?.toUpperCase() ?? "U"}
                    </div>
                    <div>
                      <div className="font-semibold text-lg">{currentUser.name ?? "Unnamed"}</div>
                      <div className="text-muted-foreground text-sm">{currentUser.email ?? "No email"}</div>
                      <Badge className="mt-1 capitalize text-[10px]">{currentUser.role}</Badge>
                    </div>
                  </div>
                  <InfoRow label="Role" value={<span className="capitalize font-medium">{currentUser.role}</span>} />
                  <InfoRow label="Status" value={
                    <span className={cn("font-medium flex items-center gap-1", currentUser.isActive ? "text-emerald-600" : "text-red-500")}>
                      {currentUser.isActive ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      {currentUser.isActive ? "Active" : "Inactive"}
                    </span>
                  } />
                  {currentUser.singleTransactionLimit && (
                    <InfoRow label="Transaction Limit" value={`¥${currentUser.singleTransactionLimit.toLocaleString()}`} />
                  )}
                  {currentUser.approvalThreshold && (
                    <InfoRow label="Approval Threshold" value={`¥${currentUser.approvalThreshold.toLocaleString()}`} />
                  )}
                  {currentUser.lastLoginAt && (
                    <InfoRow label="Last Login" value={formatDate(currentUser.lastLoginAt)} />
                  )}
                </>
              )}
            </CardContent>
          </Card>
          <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-lg border">
            To update your name or email, please contact an Owner or Manager. These values are synced from your Hercules Auth profile on login.
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-muted-foreground shrink-0 text-xs mt-0.5">{label}</span>
      <span className="font-medium text-right text-xs">{value}</span>
    </div>
  );
}
