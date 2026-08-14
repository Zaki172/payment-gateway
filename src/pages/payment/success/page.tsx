import { useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { useNavigate } from "react-router-dom";

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center max-w-sm space-y-6">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 size={40} className="text-emerald-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Payment Successful!</h1>
          <p className="text-muted-foreground mt-2">
            Your payment has been processed securely through Stripe. A confirmation will be sent to you shortly.
          </p>
        </div>
        {sessionId && (
          <div className="bg-muted rounded-lg p-3 text-xs text-left">
            <span className="text-muted-foreground">Reference: </span>
            <span className="font-mono">{sessionId.slice(0, 20)}…</span>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Payment status is confirmed via Stripe. This page is for information only.
        </p>
        <Button onClick={() => navigate("/")} className="w-full">
          Return to Dashboard
        </Button>
      </div>
    </div>
  );
}
