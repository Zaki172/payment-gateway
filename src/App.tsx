import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import AuthCallback from "./pages/auth/Callback.tsx";
import AppLayout from "./pages/layout/AppLayout.tsx";
import Dashboard from "./pages/dashboard/page.tsx";
import CreatePayment from "./pages/payments/create/page.tsx";
import AllPayments from "./pages/payments/page.tsx";
import PaymentDetail from "./pages/payments/[id]/page.tsx";
import Customers from "./pages/customers/page.tsx";
import CustomerDetail from "./pages/customers/[id]/page.tsx";
import PaymentLinks from "./pages/payment-links/page.tsx";
import Refunds from "./pages/refunds/page.tsx";
import Reports from "./pages/reports/page.tsx";
import AuditLogs from "./pages/audit-logs/page.tsx";
import TeamPermissions from "./pages/team/page.tsx";
import Settings from "./pages/settings/page.tsx";
import PaymentSuccess from "./pages/payment/success/page.tsx";
import PublicReceipt from "./pages/receipt/[id]/page.tsx";
import NotFound from "./pages/NotFound.tsx";

export default function App() {
  return (
    <DefaultProviders>
      <BrowserRouter>
        <Routes>
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/payment/success" element={<PaymentSuccess />} />
          <Route path="/receipt/:id" element={<PublicReceipt />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/create-payment" element={<CreatePayment />} />
            <Route path="/payments" element={<AllPayments />} />
            <Route path="/payments/:id" element={<PaymentDetail />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/customers/:id" element={<CustomerDetail />} />
            <Route path="/payment-links" element={<PaymentLinks />} />
            <Route path="/refunds" element={<Refunds />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/audit-logs" element={<AuditLogs />} />
            <Route path="/team" element={<TeamPermissions />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </DefaultProviders>
  );
}
