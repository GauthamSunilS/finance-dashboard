"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const COMPANY_LOGO = "/logo.png";
const COMPANY_NAME = "Gautham & Associates";

// ============================================
// TYPES
// ============================================
type Client = {
  id: string;
  name: string;
  source: "zoho" | "odoo";
  org_id: string | null;
};

type Invoice = {
  id: string; invoice_number: string; customer_name: string;
  status: string; date: string; due_date: string;
  sub_total: number; tax_total: number; total: number;
  balance: number; currency_code: string; reference_number: string | null;
  gst_number: string | null;
};

type SalesOrder = {
  id: string; salesorder_number: string; customer_name: string;
  status: string; date: string; shipment_date: string;
  sub_total: number; tax_total: number; total: number; currency_code: string;
};

type Estimate = {
  id: string; estimate_number: string; customer_name: string;
  status: string; date: string; expiry_date: string;
  sub_total: number; tax_total: number; total: number; currency_code: string;
};

type Payment = {
  id: string; payment_number: string; customer_name: string;
  payment_mode: string; amount: number; currency_code: string;
  date: string; reference_number: string | null;
};

type Expense = {
  id: string; expense_number: string; account_name: string | null;
  vendor_name: string | null; status: string; date: string;
  total: number; sub_total: number; tax_total: number;
  currency_code: string | null; description: string | null;
  reference_number: string | null; is_billable: boolean | null;
  customer_name: string | null; paid_through_account_name: string | null;
};

type SubModule = "invoices" | "sales_orders" | "estimates" | "payments" | "expenses" | "audit";

// ============================================
// HELPERS
// ============================================
function fmt(amount: number, currency?: string | null) {
  const safeCurrency = (currency && currency !== "null") ? currency : "USD";
  const locale = safeCurrency === "INR" ? "en-IN" : "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency", currency: safeCurrency, maximumFractionDigits: 0,
    }).format(amount);
  } catch { return String(amount); }
}

function inrFmt(n: number) { return "₹" + Math.abs(n).toLocaleString("en-IN"); }

function fmtDate(d: string | null | undefined) {
  if (!d || d === "null") return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

const STATUS_COLORS: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  sent: "bg-blue-100 text-blue-700",
  draft: "bg-zinc-100 text-zinc-500",
  overdue: "bg-red-100 text-red-600",
  void: "bg-orange-100 text-orange-600",
  accepted: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-600",
  invoiced: "bg-purple-100 text-purple-700",
  confirmed: "bg-blue-100 text-blue-700",
};

function Badge({ status }: { status: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[status] || "bg-zinc-100 text-zinc-400"}`}>
      {status}
    </span>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 shadow-sm">
      <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

// ============================================
// LOGIN
// ============================================
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else onLogin();
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-zinc-200 rounded-2xl p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Finance Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-1">Sign in to continue</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-zinc-100 border border-zinc-300 rounded-lg px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-600 focus:outline-none focus:border-zinc-500" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="••••••••"
              className="w-full bg-zinc-100 border border-zinc-300 rounded-lg px-4 py-2.5 text-sm text-zinc-900 placeholder-zinc-600 focus:outline-none focus:border-zinc-500" />
          </div>
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button onClick={handleLogin} disabled={loading}
          className="w-full bg-white text-zinc-900 font-semibold text-sm py-2.5 rounded-lg hover:bg-zinc-200 transition disabled:opacity-50">
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </div>
    </div>
  );
}

// ============================================
// INVOICES TAB
// ============================================
function InvoicesTab({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    supabase.from("finance_dashboard").select("*")
      .eq("org_id", clientId).order("date", { ascending: false })
      .then(({ data }) => { setData(data || []); setLoading(false); });
  }, [clientId]);

  const statuses = ["all", ...Array.from(new Set(data.map(d => d.status)))];
  const filtered = data.filter(inv =>
    (statusFilter === "all" || inv.status === statusFilter) &&
    (inv.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      inv.invoice_number?.toLowerCase().includes(search.toLowerCase()))
  );
  const total = filtered.reduce((s, i) => s + i.total, 0);
  const balance = filtered.reduce((s, i) => s + i.balance, 0);
  const tax = filtered.reduce((s, i) => s + i.tax_total, 0);
  const paid = filtered.filter(i => i.status === "paid").length;

  if (loading) return <div className="text-center py-20 text-zinc-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total Invoiced" value={fmt(total)} color="text-zinc-900" />
        <SummaryCard label="Outstanding" value={fmt(balance)} color="text-amber-400" />
        <SummaryCard label="GST Collected" value={fmt(tax)} color="text-blue-400" />
        <SummaryCard label="Paid" value={`${paid} / ${filtered.length}`} color="text-emerald-400" />
      </div>
      <div className="flex gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search customer or invoice..."
          className="flex-1 bg-white border border-zinc-200 rounded-lg px-4 py-2 text-sm text-zinc-800 placeholder-zinc-600 focus:outline-none" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-700 focus:outline-none">
          {statuses.map(s => <option key={s} value={s}>{s === "all" ? "All Statuses" : s}</option>)}
        </select>
      </div>
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 text-xs uppercase">
                <th className="text-left px-4 py-3">Invoice</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Due</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Subtotal</th>
                <th className="text-right px-4 py-3">GST</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-right px-4 py-3">Balance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-zinc-500">No invoices found</td></tr>
              ) : filtered.map((inv, i) => (
                <tr key={inv.id} className={`border-b border-zinc-100 hover:bg-zinc-50 ${i % 2 === 0 ? "" : "bg-zinc-50"}`}>
                  <td className="px-4 py-3 font-mono text-zinc-400 text-xs">{inv.invoice_number}</td>
                  <td className="px-4 py-3 font-medium text-zinc-900 max-w-[160px] truncate">
                    {inv.customer_name}
                    {inv.gst_number && <div className="text-xs text-zinc-500">{inv.gst_number}</div>}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{fmtDate(inv.date)}</td>
                  <td className="px-4 py-3 text-zinc-400">{fmtDate(inv.due_date)}</td>
                  <td className="px-4 py-3"><Badge status={inv.status} /></td>
                  <td className="px-4 py-3 text-right text-zinc-700">{inv.sub_total > 0 ? fmt(inv.sub_total, inv.currency_code) : "—"}</td>
                  <td className="px-4 py-3 text-right text-blue-400">{fmt(inv.tax_total, inv.currency_code)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-zinc-900">{fmt(inv.total, inv.currency_code)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-amber-400">{fmt(inv.balance, inv.currency_code)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-xs text-zinc-600 border-t border-zinc-200">
          Showing {filtered.length} of {data.length} invoices
        </div>
      </div>
    </div>
  );
}

// ============================================
// SALES ORDERS TAB
// ============================================
function SalesOrdersTab({ clientId }: { clientId: string }) {
  const [data, setData] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase.from("sales_orders").select("*")
      .eq("org_id", clientId).order("date", { ascending: false })
      .then(({ data }) => { setData(data || []); setLoading(false); });
  }, [clientId]);

  const filtered = data.filter(s =>
    s.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.salesorder_number?.toLowerCase().includes(search.toLowerCase())
  );
  const total = filtered.reduce((s, i) => s + i.total, 0);

  if (loading) return <div className="text-center py-20 text-zinc-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <SummaryCard label="Total Orders" value={`${filtered.length}`} color="text-zinc-900" />
        <SummaryCard label="Total Value" value={fmt(total)} color="text-blue-400" />
        <SummaryCard label="Confirmed" value={`${filtered.filter(s => s.status === "confirmed").length}`} color="text-emerald-400" />
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search customer or order number..."
        className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-2 text-sm text-zinc-800 placeholder-zinc-600 focus:outline-none" />
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 text-xs uppercase">
                <th className="text-left px-4 py-3">Order #</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Shipment</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-zinc-500">No data yet — sync from Zoho to populate</td></tr>
              ) : filtered.map((s, i) => (
                <tr key={s.id} className={`border-b border-zinc-100 hover:bg-zinc-50 ${i % 2 === 0 ? "" : "bg-zinc-50"}`}>
                  <td className="px-4 py-3 font-mono text-zinc-400 text-xs">{s.salesorder_number}</td>
                  <td className="px-4 py-3 font-medium text-zinc-900">{s.customer_name}</td>
                  <td className="px-4 py-3 text-zinc-400">{fmtDate(s.date)}</td>
                  <td className="px-4 py-3 text-zinc-400">{fmtDate(s.shipment_date)}</td>
                  <td className="px-4 py-3"><Badge status={s.status} /></td>
                  <td className="px-4 py-3 text-right font-semibold text-zinc-900">{fmt(s.total, s.currency_code)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================
// ESTIMATES TAB
// ============================================
function EstimatesTab({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase.from("estimates").select("*")
      .eq("org_id", clientId).order("date", { ascending: false })
      .then(({ data }) => { setData(data || []); setLoading(false); });
  }, [clientId]);

  const filtered = data.filter(e =>
    e.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.estimate_number?.toLowerCase().includes(search.toLowerCase())
  );
  const total = filtered.reduce((s, i) => s + i.total, 0);
  const accepted = filtered.filter(e => e.status === "accepted").length;

  if (loading) return <div className="text-center py-20 text-zinc-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <SummaryCard label="Total Estimates" value={`${filtered.length}`} color="text-zinc-900" />
        <SummaryCard label="Total Value" value={fmt(total)} color="text-blue-400" />
        <SummaryCard label="Accepted" value={`${accepted}`} color="text-emerald-400" />
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search customer or estimate number..."
        className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-2 text-sm text-zinc-800 placeholder-zinc-600 focus:outline-none" />
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 text-xs uppercase">
                <th className="text-left px-4 py-3">Estimate #</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Expiry</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-zinc-500">No data yet — sync from Zoho to populate</td></tr>
              ) : filtered.map((e, i) => (
                <tr key={e.id} className={`border-b border-zinc-100 hover:bg-zinc-50 ${i % 2 === 0 ? "" : "bg-zinc-50"}`}>
                  <td className="px-4 py-3 font-mono text-zinc-400 text-xs">{e.estimate_number}</td>
                  <td className="px-4 py-3 font-medium text-zinc-900">{e.customer_name}</td>
                  <td className="px-4 py-3 text-zinc-400">{fmtDate(e.date)}</td>
                  <td className="px-4 py-3 text-zinc-400">{fmtDate(e.expiry_date)}</td>
                  <td className="px-4 py-3"><Badge status={e.status} /></td>
                  <td className="px-4 py-3 text-right font-semibold text-zinc-900">{fmt(e.total, e.currency_code)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================
// PAYMENTS TAB
// ============================================
function PaymentsTab({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase.from("payments").select("*")
      .eq("org_id", clientId).order("date", { ascending: false })
      .then(({ data }) => { setData(data || []); setLoading(false); });
  }, [clientId]);

  const filtered = data.filter(p =>
    p.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.payment_number?.toLowerCase().includes(search.toLowerCase())
  );
  const total = filtered.reduce((s, i) => s + i.amount, 0);

  if (loading) return <div className="text-center py-20 text-zinc-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Total Payments" value={`${filtered.length}`} color="text-zinc-900" />
        <SummaryCard label="Total Received" value={fmt(total)} color="text-emerald-400" />
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search customer or payment number..."
        className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-2 text-sm text-zinc-800 placeholder-zinc-600 focus:outline-none" />
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 text-xs uppercase">
                <th className="text-left px-4 py-3">Payment #</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Mode</th>
                <th className="text-right px-4 py-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-zinc-500">No data yet — sync from Zoho to populate</td></tr>
              ) : filtered.map((p, i) => (
                <tr key={p.id} className={`border-b border-zinc-100 hover:bg-zinc-50 ${i % 2 === 0 ? "" : "bg-zinc-50"}`}>
                  <td className="px-4 py-3 font-mono text-zinc-400 text-xs">{p.payment_number}</td>
                  <td className="px-4 py-3 font-medium text-zinc-900">{p.customer_name}</td>
                  <td className="px-4 py-3 text-zinc-400">{fmtDate(p.date)}</td>
                  <td className="px-4 py-3 text-zinc-400 capitalize">{p.payment_mode}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-400">{fmt(p.amount, p.currency_code)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================
// EXPENSES TAB
// ============================================
function ExpensesTab({ clientId }: { clientId: string }) {
  const [data, setData] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase.from("expenses").select("*")
      .eq("org_id", clientId).order("date", { ascending: false })
      .then(({ data }) => { setData(data || []); setLoading(false); });
  }, [clientId]);

  const filtered = data.filter(e =>
    e.vendor_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.account_name?.toLowerCase().includes(search.toLowerCase())
  );
  const total = filtered.reduce((s, i) => s + i.total, 0);

  if (loading) return <div className="text-center py-20 text-zinc-500">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Total Expenses" value={`${filtered.length}`} color="text-zinc-900" />
        <SummaryCard label="Total Amount" value={fmt(total)} color="text-red-400" />
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search vendor or account..."
        className="w-full bg-white border border-zinc-200 rounded-lg px-4 py-2 text-sm text-zinc-800 placeholder-zinc-600 focus:outline-none" />
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-500 text-xs uppercase">
                <th className="text-left px-4 py-3">Expense #</th>
                <th className="text-left px-4 py-3">Account</th>
                <th className="text-left px-4 py-3">Vendor</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Taxable</th>
                <th className="text-right px-4 py-3">GST</th>
                <th className="text-right px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-zinc-500">No data yet — sync from Zoho to populate</td></tr>
              ) : filtered.map((e, i) => (
                <tr key={e.id} className={`border-b border-zinc-100 hover:bg-zinc-50 ${i % 2 === 0 ? "" : "bg-zinc-50"}`}>
                  <td className="px-4 py-3 font-mono text-zinc-400 text-xs">{e.expense_number?.slice(-10) || "—"}</td>
                  <td className="px-4 py-3 text-zinc-700">{e.account_name || "—"}</td>
                  <td className="px-4 py-3 text-zinc-700">{e.vendor_name || "—"}</td>
                  <td className="px-4 py-3 text-zinc-400">{fmtDate(e.date)}</td>
                  <td className="px-4 py-3"><Badge status={e.status} /></td>
                  <td className="px-4 py-3 text-right text-zinc-700">{e.sub_total > 0 ? fmt(e.sub_total, e.currency_code || "INR") : fmt(e.total - (e.tax_total || 0), e.currency_code || "INR")}</td>
                  <td className="px-4 py-3 text-right text-blue-600">{e.tax_total > 0 ? fmt(e.tax_total, e.currency_code || "INR") : "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">{fmt(e.total, e.currency_code || "INR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ============================================
// REPORTS TAB
// ============================================
function ReportsTab({ clientId }: { clientId: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState<"customers" | "expenses">("customers");

  useEffect(() => {
    Promise.all([
      supabase.from("finance_dashboard").select("*").eq("org_id", clientId),
      supabase.from("payments").select("*").eq("org_id", clientId),
      supabase.from("expenses").select("*").eq("org_id", clientId),
    ]).then(([inv, pay, exp]) => {
      setInvoices(inv.data || []);
      setPayments(pay.data || []);
      setExpenses(exp.data || []);
      setLoading(false);
    });
  }, [clientId]);

  if (loading) return <div className="text-center py-20 text-zinc-500">Loading reports...</div>;

  // ── Customer Summary ──────────────────────────────────────────────────
  const customerMap: Record<string, {
    name: string; gst: string | null;
    invoiced: number; received: number; balance: number; gst_amount: number;
    invoiceCount: number; paidCount: number;
  }> = {};

  for (const inv of invoices) {
    const key = inv.customer_name;
    if (!customerMap[key]) {
      customerMap[key] = { name: inv.customer_name, gst: inv.gst_number, invoiced: 0, received: 0, balance: 0, gst_amount: 0, invoiceCount: 0, paidCount: 0 };
    }
    customerMap[key].invoiced += inv.total;
    customerMap[key].balance += inv.balance;
    customerMap[key].gst_amount += inv.tax_total;
    customerMap[key].invoiceCount++;
    if (inv.status === "paid") customerMap[key].paidCount++;
  }

  for (const pay of payments) {
    const key = pay.customer_name;
    if (customerMap[key]) customerMap[key].received += pay.amount;
  }

  const customers = Object.values(customerMap).sort((a, b) => b.invoiced - a.invoiced);
  const totalInvoiced = customers.reduce((s, c) => s + c.invoiced, 0);
  const totalReceived = customers.reduce((s, c) => s + c.received, 0);
  const totalBalance = customers.reduce((s, c) => s + c.balance, 0);
  const totalGST = customers.reduce((s, c) => s + c.gst_amount, 0);

  // ── Expense Ledger ─────────────────────────────────────────────────────
  const expenseByAccount: Record<string, { account: string; total: number; count: number; items: Expense[] }> = {};
  for (const exp of expenses) {
    const key = exp.account_name || "Uncategorized";
    if (!expenseByAccount[key]) expenseByAccount[key] = { account: key, total: 0, count: 0, items: [] };
    expenseByAccount[key].total += exp.total;
    expenseByAccount[key].count++;
    expenseByAccount[key].items.push(exp);
  }
  const expenseAccounts = Object.values(expenseByAccount).sort((a, b) => b.total - a.total);
  const totalExpenses = expenses.reduce((s, e) => s + e.total, 0);

  return (
    <div className="space-y-5">
      {/* Report selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveReport("customers")}
          className={`text-sm px-5 py-2 rounded-lg border transition ${activeReport === "customers" ? "bg-zinc-100 text-zinc-900 border-zinc-100" : "bg-transparent text-zinc-400 border-zinc-200 hover:border-zinc-400"}`}>
          Customer Report
        </button>
        <button
          onClick={() => setActiveReport("expenses")}
          className={`text-sm px-5 py-2 rounded-lg border transition ${activeReport === "expenses" ? "bg-zinc-100 text-zinc-900 border-zinc-100" : "bg-transparent text-zinc-400 border-zinc-200 hover:border-zinc-400"}`}>
          Expense Ledger
        </button>
      </div>

      {activeReport === "customers" && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white border border-zinc-200 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">Total Invoiced</p>
              <p className="text-xl font-semibold text-zinc-900">{fmt(totalInvoiced)}</p>
            </div>
            <div className="bg-white border border-zinc-200 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">Total Received</p>
              <p className="text-xl font-semibold text-emerald-400">{fmt(totalReceived)}</p>
            </div>
            <div className="bg-white border border-zinc-200 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">Outstanding</p>
              <p className="text-xl font-semibold text-amber-400">{fmt(totalBalance)}</p>
            </div>
            <div className="bg-white border border-zinc-200 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">Total GST</p>
              <p className="text-xl font-semibold text-blue-400">{fmt(totalGST)}</p>
            </div>
          </div>

          {/* Customer table */}
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-200">
              <h3 className="text-sm font-semibold text-zinc-800">Customer-wise Breakdown</h3>
              <p className="text-xs text-zinc-500 mt-0.5">{customers.length} customers</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-500 text-xs uppercase">
                    <th className="text-left px-4 py-3">Customer</th>
                    <th className="text-left px-4 py-3">GST No.</th>
                    <th className="text-right px-4 py-3">Invoices</th>
                    <th className="text-right px-4 py-3">Invoiced</th>
                    <th className="text-right px-4 py-3">Received</th>
                    <th className="text-right px-4 py-3">Outstanding</th>
                    <th className="text-right px-4 py-3">GST</th>
                    <th className="text-right px-4 py-3">Collection %</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c, i) => {
                    const pct = c.invoiced > 0 ? Math.round((c.received / c.invoiced) * 100) : 0;
                    return (
                      <tr key={i} className="border-b border-zinc-100 hover:bg-zinc-50">
                        <td className="px-4 py-3 font-medium text-zinc-900">{c.name}</td>
                        <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{c.gst || "—"}</td>
                        <td className="px-4 py-3 text-right text-zinc-400">{c.invoiceCount} <span className="text-zinc-600 text-xs">({c.paidCount} paid)</span></td>
                        <td className="px-4 py-3 text-right font-semibold text-zinc-900">{fmt(c.invoiced)}</td>
                        <td className="px-4 py-3 text-right text-emerald-400">{fmt(c.received)}</td>
                        <td className="px-4 py-3 text-right text-amber-400">{fmt(c.balance)}</td>
                        <td className="px-4 py-3 text-right text-blue-400">{fmt(c.gst_amount)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-zinc-100 rounded-full h-1.5">
                              <div className="bg-emerald-400 h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className={`text-xs font-medium ${pct >= 100 ? "text-emerald-400" : pct >= 50 ? "text-amber-400" : "text-red-400"}`}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-zinc-300 bg-zinc-100/50">
                    <td className="px-4 py-3 font-semibold text-zinc-700" colSpan={3}>Total</td>
                    <td className="px-4 py-3 text-right font-bold text-zinc-900">{fmt(totalInvoiced)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-400">{fmt(totalReceived)}</td>
                    <td className="px-4 py-3 text-right font-bold text-amber-400">{fmt(totalBalance)}</td>
                    <td className="px-4 py-3 text-right font-bold text-blue-400">{fmt(totalGST)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeReport === "expenses" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-white border border-zinc-200 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">Total Expenses</p>
              <p className="text-xl font-semibold text-red-400">{fmt(totalExpenses)}</p>
            </div>
            <div className="bg-white border border-zinc-200 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">No. of Entries</p>
              <p className="text-xl font-semibold text-zinc-900">{expenses.length}</p>
            </div>
            <div className="bg-white border border-zinc-200 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">Ledger Accounts</p>
              <p className="text-xl font-semibold text-purple-400">{expenseAccounts.length}</p>
            </div>
          </div>

          {/* Ledger breakdown */}
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-200">
              <h3 className="text-sm font-semibold text-zinc-800">Expense Ledger</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Grouped by account</p>
            </div>
            {expenseAccounts.map((grp, gi) => (
              <div key={gi} className="border-b border-zinc-100 last:border-0">
                <div className="flex items-center justify-between px-4 py-3 bg-zinc-50">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-zinc-900">{grp.account}</span>
                    <span className="text-xs text-zinc-500">{grp.count} entries</span>
                  </div>
                  <span className="text-sm font-bold text-red-400">{fmt(grp.total)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-zinc-600 text-xs uppercase border-b border-zinc-100">
                        <th className="text-left px-6 py-2">Expense #</th>
                        <th className="text-left px-4 py-2">Vendor</th>
                        <th className="text-left px-4 py-2">Date</th>
                        <th className="text-left px-4 py-2">Status</th>
                        <th className="text-left px-4 py-2">Description</th>
                        <th className="text-right px-4 py-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grp.items.map((exp, ei) => (
                        <tr key={ei} className="border-b border-zinc-200/30 hover:bg-zinc-50 last:border-0">
                          <td className="px-6 py-2 font-mono text-zinc-500 text-xs">{exp.expense_number}</td>
                          <td className="px-4 py-2 text-zinc-700">{exp.vendor_name || "—"}</td>
                          <td className="px-4 py-2 text-zinc-500">{fmtDate(exp.date)}</td>
                          <td className="px-4 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[exp.status] || "bg-zinc-100 text-zinc-400"}`}>{exp.status}</span>
                          </td>
                          <td className="px-4 py-2 text-zinc-500 text-xs max-w-[200px] truncate">{exp.description || "—"}</td>
                          <td className="px-4 py-2 text-right font-semibold text-red-400">{fmt(exp.total, exp.currency_code)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
            {expenseAccounts.length === 0 && (
              <div className="text-center py-10 text-zinc-500">No expenses found</div>
            )}
            {expenseAccounts.length > 0 && (
              <div className="flex items-center justify-between px-4 py-3 bg-zinc-100/50 border-t border-zinc-300">
                <span className="text-sm font-semibold text-zinc-700">Grand Total</span>
                <span className="text-sm font-bold text-red-400">{fmt(totalExpenses)}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================
// COMPLIANCE ENGINE + AUDIT TAB
// ============================================

const TDS_RULES: { sec: string; label: string; keywords: string[]; threshold: number; rate: number; note?: string }[] = [
  { sec: "192", label: "192 – Salary", keywords: ["salary","salaries","wages","payroll","staff cost","employee cost"], threshold: 250000, rate: 10 },
  { sec: "194A", label: "194A – Interest", keywords: ["interest paid","loan interest","interest charges","fd interest","interest expense","finance charges","bank charges"], threshold: 5000, rate: 10 },
  { sec: "194C", label: "194C – Contractors", keywords: ["contractor","sub-contractor","construction","civil work","transport","courier","logistics","freight","cargo","packers","movers","security","catering","caterer","printing","cleaning","housekeeping","labour","manpower","staffing","event","fabrication","erection","installation"], threshold: 30000, rate: 2, note: "2% for company/firm, 1% for individual/HUF" },
  { sec: "194H", label: "194H – Commission/Brokerage", keywords: ["commission","brokerage","referral fee","agent fee","dealer commission","channel partner","distributor commission","sales commission"], threshold: 15000, rate: 5 },
  { sec: "194I", label: "194I – Rent", keywords: ["rent","lease","rental","property management","office space","premises","godown rent","warehouse rent","equipment rent","machinery rent"], threshold: 50000, rate: 10 },
  { sec: "194J", label: "194J – Professional/Technical", keywords: ["consultant","consulting","professional","technical","legal","advocate","chartered","architect","software","it services","technology","agency","designer","freelancer","cloud","subscription","saas","advisory","audit fees","accounting","medical","doctor"], threshold: 30000, rate: 10 },
  { sec: "194M", label: "194M – Contracts >₹50L (Individual)", keywords: ["professional fees","contractor payment","commission payment"], threshold: 5000000, rate: 5 },
  { sec: "194O", label: "194O – E-Commerce", keywords: ["ecommerce","e-commerce","amazon","flipkart","platform fee","marketplace fee","aggregator"], threshold: 500000, rate: 1 },
  { sec: "194Q", label: "194Q – Goods Purchase >₹50L", keywords: ["purchase","goods purchase","raw material","inventory purchase","material purchase"], threshold: 5000000, rate: 0.1 },
  { sec: "195", label: "195 – NRI/Foreign Payments", keywords: ["foreign payment","overseas payment","non-resident","nri payment","remittance","foreign vendor","offshore"], threshold: 1, rate: 20 },
];

const BLOCKED_ITC = ["food","canteen","catering","caterer","staff welfare","restaurant","meal","lunch","dinner","club membership","gym","health club","personal","motor vehicle","car hire","cab","taxi"];
const RCM_SERVICES = [
  { label: "Legal services from advocate", keywords: ["advocate","lawyer","legal counsel","legal retainer","litigation"] },
  { label: "GTA – Goods Transport Agency", keywords: ["gta","goods transport","road transport","truck","lorry"] },
  { label: "Sponsorship services", keywords: ["sponsorship","sponsored","event sponsor"] },
  { label: "Director fees to company", keywords: ["director fee","sitting fee","director remuneration"] },
  { label: "Security services", keywords: ["security service","security guard","security agency"] },
];

function inferTdsRule(vendor: string, account: string, amount: number) {
  const t = `${vendor} ${account}`.toLowerCase();
  const skip = ["192","194Q","195"];
  for (const r of TDS_RULES) {
    if (skip.includes(r.sec)) continue;
    if (r.keywords.some(k => t.includes(k)) && amount >= r.threshold) return r;
  }
  return null;
}
function isItcBlocked(account: string, vendor: string) {
  return BLOCKED_ITC.some(k => `${account} ${vendor}`.toLowerCase().includes(k));
}
function inferRcm(vendor: string, account: string) {
  const t = `${vendor} ${account}`.toLowerCase();
  for (const r of RCM_SERVICES) { if (r.keywords.some(k => t.includes(k))) return r; }
  return null;
}
function tdsDueDate(expDate: string): string {
  const d = new Date(expDate);
  if (d.getMonth() === 2) return `30 Apr ${d.getFullYear()}`;
  return new Date(d.getFullYear(), d.getMonth() + 1, 7).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

type AuditFinding = {
  id: string; severity: "Critical" | "Warning" | "Info";
  category: "TDS" | "GST/ITC" | "RCM" | "Invoice" | "Collections" | "Matching" | "MSME" | "Payable Ageing" | "Data Quality";
  ref: string; date: string; party: string; account: string;
  amount: number; issue: string; detail: string; action: string;
};

function buildFindings(invoices: Invoice[], salesOrders: SalesOrder[], payments: Payment[], expenses: Expense[]): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const today = new Date();

  for (const inv of invoices) {
    if (inv.balance > 0 && inv.due_date) {
      const days = Math.floor((today.getTime() - new Date(inv.due_date).getTime()) / 86400000);
      if (days > 0) {
        findings.push({ id: `OD-${inv.id}`, severity: days > 90 ? "Critical" : days > 30 ? "Warning" : "Info", category: "Collections", ref: inv.invoice_number, date: inv.date, party: inv.customer_name, account: "Trade Receivables", amount: inv.balance, issue: `Overdue ${days}d — ₹${inv.balance.toLocaleString("en-IN")} unpaid`, detail: `Invoice ${inv.invoice_number} due ${inv.due_date}. Balance ₹${inv.balance.toLocaleString("en-IN")} of ₹${inv.total.toLocaleString("en-IN")}.`, action: days > 90 ? "Issue legal notice. Evaluate bad debt provision." : days > 30 ? "Send formal payment reminder with interest clause." : "Follow up — past due date." });
      }
    }
    if (!inv.gst_number && inv.tax_total > 0) {
      findings.push({ id: `GSTIN-${inv.id}`, severity: "Warning", category: "Invoice", ref: inv.invoice_number, date: inv.date, party: inv.customer_name, account: "Sales Invoice", amount: inv.total, issue: "B2B invoice missing customer GSTIN", detail: `Invoice ${inv.invoice_number} — GST ₹${inv.tax_total.toLocaleString("en-IN")} charged but no GSTIN. Cannot populate GSTR-1 B2B table.`, action: "Collect customer GSTIN and update. Report correctly in GSTR-1." });
    }
    if (inv.total >= 500000 && !inv.reference_number) {
      findings.push({ id: `IRN-${inv.id}`, severity: "Critical", category: "Invoice", ref: inv.invoice_number, date: inv.date, party: inv.customer_name, account: "Sales Invoice", amount: inv.total, issue: `e-Invoice/IRN missing — ₹${(inv.total/100000).toFixed(1)}L invoice`, detail: `Invoice ${inv.invoice_number} ₹${inv.total.toLocaleString("en-IN")} has no IRN. Mandatory threshold breach.`, action: "Generate IRN via IRP portal. Buyer cannot claim ITC without IRN." });
    }
  }

  const invByCust: Record<string, Invoice[]> = {};
  const payByCust: Record<string, Payment[]> = {};
  for (const i of invoices) { const k = i.customer_name?.toLowerCase().trim() || ""; (invByCust[k] = invByCust[k] || []).push(i); }
  for (const p of payments) { const k = p.customer_name?.toLowerCase().trim() || ""; (payByCust[k] = payByCust[k] || []).push(p); }

  const soSeen = new Set<string>();
  for (const so of salesOrders) {
    const k = so.customer_name?.toLowerCase().trim() || "";
    if (soSeen.has(k)) continue; soSeen.add(k);
    const totalPaid = (payByCust[k] || []).reduce((s, p) => s + p.amount, 0);
    const totalInvoiced = (invByCust[k] || []).reduce((s, i) => s + i.total, 0);
    if (totalPaid > 0 && (invByCust[k] || []).length === 0) {
      findings.push({ id: `2WAY-${so.id}`, severity: "Critical", category: "Matching", ref: so.salesorder_number, date: so.date, party: so.customer_name, account: "Advance from Customer", amount: totalPaid, issue: `₹${totalPaid.toLocaleString("en-IN")} received — NO invoice raised`, detail: `SO ${so.salesorder_number} ₹${so.total.toLocaleString("en-IN")}. Payment received but no invoice. GST output liability triggered from receipt date.`, action: "Raise invoice immediately. Pay GST on advance. Risk: interest @18% p.a." });
    } else if (totalPaid > 0 && totalInvoiced > 0 && totalInvoiced < totalPaid * 0.9) {
      findings.push({ id: `3WAY-${so.id}`, severity: "Warning", category: "Matching", ref: so.salesorder_number, date: so.date, party: so.customer_name, account: "Advance from Customer", amount: totalPaid - totalInvoiced, issue: `₹${(totalPaid - totalInvoiced).toLocaleString("en-IN")} received but not invoiced`, detail: `Paid ₹${totalPaid.toLocaleString("en-IN")}, invoiced ₹${totalInvoiced.toLocaleString("en-IN")}. Gap ₹${(totalPaid - totalInvoiced).toLocaleString("en-IN")}.`, action: `Raise balance invoice ₹${(totalPaid - totalInvoiced).toLocaleString("en-IN")}. Clear advance entry.` });
    }
  }

  for (const exp of expenses) {
    const vendor = exp.vendor_name || "";
    const account = exp.account_name || "";
    const rule = inferTdsRule(vendor, account, exp.total);
    if (rule) {
      const expectedTds = Math.round(exp.total * rule.rate / 100);
      findings.push({ id: `TDS-${exp.id}`, severity: "Critical", category: "TDS", ref: exp.expense_number || exp.id, date: exp.date, party: vendor || "Unknown", account: account || "—", amount: exp.total, issue: `TDS not deducted — ${rule.label} @${rule.rate}%`, detail: `Expense ₹${exp.total.toLocaleString("en-IN")} to "${vendor}". Expected TDS ₹${expectedTds.toLocaleString("en-IN")}. Deposit due ${tdsDueDate(exp.date)}.`, action: `Deduct TDS ₹${expectedTds.toLocaleString("en-IN")} u/s ${rule.sec}. Deposit via ITNS 281 by ${tdsDueDate(exp.date)}. File Form 26Q.` });
    }
    const rcm = inferRcm(vendor, account);
    if (rcm && exp.total > 5000) {
      findings.push({ id: `RCM-${exp.id}`, severity: "Warning", category: "RCM", ref: exp.expense_number || exp.id, date: exp.date, party: vendor || "—", account: account || "—", amount: exp.total, issue: `RCM applicable — ${rcm.label}`, detail: `GST @18% = ₹${Math.round(exp.total * 0.18).toLocaleString("en-IN")} payable under Reverse Charge.`, action: "Pay GST under RCM via cash ledger. Report in GSTR-3B Table 3.1(d)." });
    }
    if (isItcBlocked(account, vendor) && exp.total > 1000) {
      findings.push({ id: `ITC-${exp.id}`, severity: "Warning", category: "GST/ITC", ref: exp.expense_number || exp.id, date: exp.date, party: vendor || "—", account: account || "—", amount: exp.total, issue: `ITC blocked u/s 17(5) — ${account}`, detail: `"${account}" is a blocked credit category. GST paid cannot be offset.`, action: "Do not claim ITC in GSTR-3B. Reverse if already claimed — interest @24% p.a." });
    }
    if (!vendor && exp.total >= 10000) {
      findings.push({ id: `NOVND-${exp.id}`, severity: "Info", category: "Data Quality", ref: exp.expense_number || exp.id, date: exp.date, party: "Unknown", account: account || "—", amount: exp.total, issue: `No vendor — ₹${exp.total.toLocaleString("en-IN")} under "${account}" — unassessable`, detail: `No vendor name. TDS/GST section cannot be inferred.`, action: "Update vendor. If journal used to skip vendor, investigate — likely compliance bypass." });
    }
  }
  return findings;
}

type Customer360 = { name: string; gstNumber: string; invoiceCount: number; invoiced: number; received: number; outstanding: number; soCount: number; soTotal: number; invoices: Invoice[]; payments: Payment[]; sos: SalesOrder[] };
function buildCustomer360(invoices: Invoice[], payments: Payment[], salesOrders: SalesOrder[]): Customer360[] {
  const map: Record<string, Customer360> = {};
  for (const inv of invoices) {
    const k = inv.customer_name;
    if (!map[k]) map[k] = { name: k, gstNumber: inv.gst_number || "", invoiceCount: 0, invoiced: 0, received: 0, outstanding: 0, soCount: 0, soTotal: 0, invoices: [], payments: [], sos: [] };
    map[k].invoiced += inv.total; map[k].outstanding += inv.balance; map[k].invoiceCount++;
    if (!map[k].gstNumber && inv.gst_number) map[k].gstNumber = inv.gst_number;
    map[k].invoices.push(inv);
  }
  for (const p of payments) {
    const k = p.customer_name;
    if (!map[k]) map[k] = { name: k, gstNumber: "", invoiceCount: 0, invoiced: 0, received: 0, outstanding: 0, soCount: 0, soTotal: 0, invoices: [], payments: [], sos: [] };
    map[k].received += p.amount; map[k].payments.push(p);
  }
  for (const so of salesOrders) {
    const k = so.customer_name;
    if (!map[k]) map[k] = { name: k, gstNumber: "", invoiceCount: 0, invoiced: 0, received: 0, outstanding: 0, soCount: 0, soTotal: 0, invoices: [], payments: [], sos: [] };
    map[k].soCount++; map[k].soTotal += so.total; map[k].sos.push(so);
  }
  return Object.values(map).sort((a, b) => b.invoiced - a.invoiced);
}

const SEVSTYLE: Record<string, { border: string; badge: string; bg: string; text: string }> = {
  Critical: { border: "border-red-300", badge: "bg-red-500 text-white", bg: "bg-red-50", text: "text-red-600" },
  Warning:  { border: "border-amber-300", badge: "bg-amber-400 text-black", bg: "bg-amber-50", text: "text-amber-700" },
  Info:     { border: "border-sky-300", badge: "bg-sky-500 text-white", bg: "bg-sky-50", text: "text-sky-700" },
};

function AuditTab({ clientId }: { clientId: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<"overview" | "customers" | "matching" | "compliance" | "expenses" | "payables">("overview");
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [filterSev, setFilterSev] = useState("All");
  const [filterCat, setFilterCat] = useState("All");

  useEffect(() => {
    Promise.all([
      supabase.from("finance_dashboard").select("*").eq("org_id", clientId),
      supabase.from("sales_orders").select("*").eq("org_id", clientId),
      supabase.from("payments").select("*").eq("org_id", clientId),
      supabase.from("expenses").select("*").eq("org_id", clientId),
    ]).then(([inv, so, pay, exp]) => {
      setInvoices(inv.data || []); setSalesOrders(so.data || []);
      setPayments(pay.data || []); setExpenses(exp.data || []);
      setLoading(false);
    });
  }, [clientId]);

  const findings = buildFindings(invoices, salesOrders, payments, expenses);
  const customers = buildCustomer360(invoices, payments, salesOrders);
  const counts = { Critical: findings.filter(f => f.severity === "Critical").length, Warning: findings.filter(f => f.severity === "Warning").length, Info: findings.filter(f => f.severity === "Info").length };
  const tdsExposure = findings.filter(f => f.category === "TDS").reduce((s, f) => { const r = inferTdsRule(f.party, f.account, f.amount); return s + (r ? Math.round(f.amount * r.rate / 100) : 0); }, 0);
  const overdueTotal = findings.filter(f => f.category === "Collections").reduce((s, f) => s + f.amount, 0);
  const unmatchedAdv = findings.filter(f => f.id.startsWith("2WAY")).reduce((s, f) => s + f.amount, 0);

  const SECTIONS = [
    { key: "overview", label: "Overview" }, { key: "customers", label: "Customer 360" },
    { key: "matching", label: "SO · Pay · Invoice" }, { key: "compliance", label: "Statutory Compliance" },
    { key: "expenses", label: "Expense / TDS / GST" }, { key: "payables", label: "Payables · Ageing" },
  ] as const;

  const sectionFindings = findings.filter(f =>
    section === "matching" ? ["Matching"].includes(f.category) :
    section === "compliance" ? ["TDS","GST/ITC","RCM","Invoice"].includes(f.category) :
    section === "expenses" ? ["TDS","GST/ITC","RCM","Data Quality"].includes(f.category) :
    section === "payables" ? ["MSME","Payable Ageing","Collections"].includes(f.category) :
    true
  ).filter(f => (filterSev === "All" || f.severity === filterSev) && (filterCat === "All" || f.category === filterCat));

  const cats = ["All", ...Array.from(new Set(findings.map(f => f.category)))];

  if (loading) return <div className="text-center py-20 text-zinc-400">Running compliance checks...</div>;

  return (
    <div className="space-y-5">
      {/* Section nav */}
      <div className="flex gap-1 flex-wrap">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition ${section === s.key ? "bg-black text-white border-black" : "bg-white border-zinc-200 text-zinc-500 hover:border-zinc-400"}`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {section === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard label="Critical Issues" value={String(counts.Critical)} color="text-red-600" />
            <SummaryCard label="Warnings" value={String(counts.Warning)} color="text-amber-600" />
            <SummaryCard label="Overdue Receivables" value={inrFmt(overdueTotal)} color="text-red-600" />
            <SummaryCard label="Est. TDS Exposure" value={inrFmt(tdsExposure)} color="text-violet-600" />
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Findings by Category</p>
            {Array.from(new Set(findings.map(f => f.category))).map(cat => {
              const catFindings = findings.filter(f => f.category === cat);
              const critCount = catFindings.filter(f => f.severity === "Critical").length;
              return (
                <div key={cat} className="flex items-center justify-between py-2 border-b border-zinc-100 last:border-0">
                  <span className="text-sm text-zinc-700">{cat}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">{catFindings.length} finding{catFindings.length !== 1 ? "s" : ""}</span>
                    {critCount > 0 && <span className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold">{critCount} Critical</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-zinc-400">Phase 2 (once synced): PO vs Bills vs GRN · Journal scrutiny · PT/PF · 206C TCS · Advance tax</p>
        </div>
      )}

      {/* Customer 360 */}
      {section === "customers" && (
        <div className="space-y-3">
          {customers.length === 0 ? <p className="text-center py-12 text-zinc-400">No customer data yet — sync from Zoho</p> : customers.map(c => {
            const isOpen = expandedCustomer === c.name;
            const pct = c.invoiced > 0 ? Math.min(Math.round((c.received / c.invoiced) * 100), 100) : 0;
            const custFindings = findings.filter(f => f.party === c.name);
            return (
              <div key={c.name} className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                <div className="flex items-start justify-between p-4 cursor-pointer hover:bg-zinc-50" onClick={() => setExpandedCustomer(isOpen ? null : c.name)}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-zinc-900">{c.name}</span>
                      {c.gstNumber && <span className="text-xs font-mono text-zinc-400 bg-zinc-100 px-2 py-0.5 rounded">{c.gstNumber}</span>}
                      {custFindings.filter(f => f.severity === "Critical").length > 0 && <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">{custFindings.filter(f => f.severity === "Critical").length} Critical</span>}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-xs mt-2">
                      <div><span className="text-zinc-400">Invoiced </span><span className="text-zinc-700">{inrFmt(c.invoiced)}</span></div>
                      <div><span className="text-zinc-400">Received </span><span className="text-emerald-600">{inrFmt(c.received)}</span></div>
                      <div><span className="text-zinc-400">Outstanding </span><span className={c.outstanding > 0 ? "text-amber-600" : "text-emerald-600"}>{inrFmt(c.outstanding)}</span></div>
                      <div><span className="text-zinc-400">SOs </span><span className="text-zinc-700">{c.soCount} ({inrFmt(c.soTotal)})</span></div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-400" : pct >= 60 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-zinc-400 w-12 text-right">{pct}% paid</span>
                    </div>
                  </div>
                  <span className="text-zinc-400 text-xs ml-4 mt-1 select-none">{isOpen ? "▲" : "▼"}</span>
                </div>
                {isOpen && (
                  <div className="border-t border-zinc-100 divide-y divide-zinc-100">
                    {c.invoices.length > 0 && (
                      <div className="px-4 py-3">
                        <p className="text-xs font-semibold text-zinc-500 mb-2">Invoices</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead><tr className="text-zinc-400 border-b border-zinc-100">
                              <th className="text-left py-1.5 pr-4 font-normal">Invoice #</th>
                              <th className="text-left py-1.5 pr-4 font-normal">Date</th>
                              <th className="text-left py-1.5 pr-4 font-normal">Due</th>
                              <th className="text-left py-1.5 pr-4 font-normal">Status</th>
                              <th className="text-right py-1.5 pr-4 font-normal">Total</th>
                              <th className="text-right py-1.5 font-normal">Outstanding</th>
                            </tr></thead>
                            <tbody>{c.invoices.map(inv => (
                              <tr key={inv.id} className="border-b border-zinc-50 last:border-0">
                                <td className="py-2 pr-4 font-mono text-zinc-500">{inv.invoice_number}</td>
                                <td className="py-2 pr-4 text-zinc-400">{fmtDate(inv.date)}</td>
                                <td className="py-2 pr-4 text-zinc-400">{fmtDate(inv.due_date)}</td>
                                <td className="py-2 pr-4"><Badge status={inv.status} /></td>
                                <td className="py-2 pr-4 text-right text-zinc-700">{inrFmt(inv.total)}</td>
                                <td className="py-2 text-right font-semibold">{inv.balance > 0 ? <span className="text-amber-600">{inrFmt(inv.balance)}</span> : <span className="text-emerald-600">Paid</span>}</td>
                              </tr>
                            ))}</tbody>
                          </table>
                        </div>
                      </div>
                    )}
                    {c.payments.length > 0 && (
                      <div className="px-4 py-3">
                        <p className="text-xs font-semibold text-zinc-500 mb-2">Payments Received <span className="text-emerald-600">{inrFmt(c.received)}</span></p>
                        <div className="space-y-1">{c.payments.map(p => (
                          <div key={p.id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-zinc-400">{p.payment_number}</span>
                              <span className="text-zinc-400">{fmtDate(p.date)}</span>
                              {p.payment_mode && <span className="text-zinc-300 bg-zinc-100 px-1.5 py-0.5 rounded text-[10px]">{p.payment_mode}</span>}
                            </div>
                            <span className="text-emerald-600 font-semibold">{inrFmt(p.amount)}</span>
                          </div>
                        ))}</div>
                      </div>
                    )}
                    {c.sos.length > 0 && (
                      <div className="px-4 py-3">
                        <p className="text-xs font-semibold text-zinc-500 mb-2">Sales Orders</p>
                        <div className="space-y-1.5">{c.sos.map(so => {
                          const soInvoiced = c.invoiced;
                          const gap = so.total - soInvoiced;
                          const matchStatus = c.received > 0 && c.invoiceCount === 0 ? { label: "⚠ Payment received, no invoice", color: "text-red-600" } : soInvoiced >= so.total * 0.95 ? { label: "✓ Fully invoiced", color: "text-emerald-600" } : gap > 0 ? { label: `${inrFmt(gap)} uninvoiced`, color: "text-zinc-400" } : { label: "—", color: "text-zinc-400" };
                          return (
                            <div key={so.id} className="flex items-center justify-between text-xs bg-zinc-50 rounded-lg px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-zinc-400">{so.salesorder_number}</span>
                                <span className="text-zinc-400">{fmtDate(so.date)}</span>
                                <Badge status={so.status} />
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="text-zinc-500">{inrFmt(so.total)}</span>
                                <span className={matchStatus.color}>{matchStatus.label}</span>
                              </div>
                            </div>
                          );
                        })}</div>
                      </div>
                    )}
                    {custFindings.length > 0 && (
                      <div className="px-4 py-3">
                        <p className="text-xs font-semibold text-zinc-500 mb-2">Compliance Flags</p>
                        <div className="space-y-1.5">{custFindings.map(f => (
                          <div key={f.id} className={`text-xs rounded-lg px-3 py-2 border ${SEVSTYLE[f.severity].border} ${SEVSTYLE[f.severity].bg}`}>
                            <span className={`font-semibold ${SEVSTYLE[f.severity].text}`}>{f.issue}</span>
                            <p className="text-zinc-500 mt-0.5">{f.action}</p>
                          </div>
                        ))}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Findings list for matching/compliance/expenses/payables */}
      {(section === "matching" || section === "compliance" || section === "expenses" || section === "payables") && (
        <div className="space-y-4">
          {section === "compliance" && (
            <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 text-xs text-zinc-500 leading-relaxed">
              <p className="font-semibold text-zinc-700 mb-1">Statutory checks running</p>
              <p><span className="text-zinc-900 font-medium">TDS:</span> 192 (Salary), 194A (Interest), 194C (Contractors @2%), 194H (Commission @5%), 194I (Rent @10%), 194J (Professional @10%), 194M, 194O (E-Commerce @1%), 194Q (Goods >₹50L @0.1%), 195 (NRI @20%)</p>
              <p className="mt-1"><span className="text-zinc-900 font-medium">GST:</span> ITC blocked u/s 17(5), B2B missing GSTIN, IRN missing &gt;₹5L</p>
              <p className="mt-1"><span className="text-zinc-900 font-medium">RCM:</span> Legal, GTA, Sponsorship, Director fees, Security services</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-zinc-400">Severity:</span>
            {["All","Critical","Warning","Info"].map(s => (
              <button key={s} onClick={() => setFilterSev(s)} className={`text-xs px-3 py-1 rounded-full border transition ${filterSev === s ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-200 text-zinc-400 hover:border-zinc-400"}`}>
                {s}{s !== "All" ? ` (${counts[s as keyof typeof counts] ?? 0})` : ""}
              </button>
            ))}
            <span className="text-xs text-zinc-400 ml-2">Category:</span>
            {cats.map(c => (
              <button key={c} onClick={() => setFilterCat(c)} className={`text-xs px-3 py-1 rounded-full border transition ${filterCat === c ? "bg-zinc-900 text-white border-zinc-900" : "border-zinc-200 text-zinc-400 hover:border-zinc-400"}`}>{c}</button>
            ))}
          </div>
          <p className="text-xs text-zinc-400">{sectionFindings.length} findings</p>
          <div className="space-y-2">
            {sectionFindings.map(f => {
              const s = SEVSTYLE[f.severity];
              const isOpen = expandedFinding === f.id;
              return (
                <div key={f.id} onClick={() => setExpandedFinding(isOpen ? null : f.id)} className={`rounded-xl border ${s.border} ${s.bg} cursor-pointer transition-all`}>
                  <div className="flex items-start gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.badge}`}>{f.severity}</span>
                        <span className="text-xs text-zinc-400">{f.category}</span>
                        <span className="text-xs text-zinc-300 font-mono ml-auto">{f.date}</span>
                      </div>
                      <p className={`font-semibold text-sm ${s.text}`}>{f.issue}</p>
                      <p className="text-xs text-zinc-400 mt-0.5 truncate">{f.party} · ₹{f.amount.toLocaleString("en-IN")}</p>
                    </div>
                    <span className="text-zinc-400 text-xs mt-1 select-none">{isOpen ? "▲" : "▼"}</span>
                  </div>
                  {isOpen && (
                    <div className="border-t border-zinc-200 px-4 pb-4 pt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-zinc-400 block">Ref</span><span className="text-zinc-700 font-mono">{f.ref}</span></div>
                        <div><span className="text-zinc-400 block">Account</span><span className="text-zinc-700">{f.account}</span></div>
                        <div><span className="text-zinc-400 block">Party</span><span className="text-zinc-700">{f.party}</span></div>
                        <div><span className="text-zinc-400 block">Amount</span><span className="text-zinc-900 font-bold">₹{f.amount.toLocaleString("en-IN")}</span></div>
                      </div>
                      <div className="bg-zinc-50 rounded-lg p-3 text-xs text-zinc-600 leading-relaxed">
                        <span className="text-zinc-400 block mb-1">Finding</span>{f.detail}
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-700 leading-relaxed">
                        <span className="text-emerald-600 block mb-1 font-bold">▶ Recommended Action</span>{f.action}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {sectionFindings.length === 0 && <div className="text-center py-12 text-zinc-400"><p className="text-3xl mb-3">✓</p><p className="font-medium text-zinc-600">No issues found in this category</p></div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// CLIENT MODULE
// ============================================
const SUB_MODULES: { key: SubModule; label: string }[] = [
  { key: "invoices", label: "Invoices" },
  { key: "sales_orders", label: "Sales Orders" },
  { key: "estimates", label: "Estimates" },
  { key: "payments", label: "Payments" },
  { key: "expenses", label: "Expenses" },
  { key: "audit", label: "🔍 Audit & Compliance" },
];

function ClientModule({ client, onBack }: { client: Client; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<SubModule>("invoices");

  useEffect(() => {
    try {
      const tab = window.location.hash.replace("#","").split("|")[1];
      const valid = ["invoices","sales_orders","estimates","payments","expenses","audit"];
      if (tab && valid.includes(tab)) setActiveTab(tab as SubModule);
    } catch {}
  }, []);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/zoho-sync`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ client_id: client.id }),
        }
      );
      const result = await res.json();
      if (result.success) {
        setSyncMsg(`✓ Synced ${result.total_records} records`);
      } else {
        setSyncMsg(`✗ ${result.error || "Sync failed"}`);
      }
    } catch (e: any) {
      setSyncMsg(`✗ ${e.message}`);
    }
    setSyncing(false);
  }

  return (
    <div className="min-h-screen bg-white text-black font-sans">
      <div className="border-b border-zinc-200 px-8 py-3 flex items-center justify-between bg-white sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <img src={COMPANY_LOGO} alt="CA India" className="h-10 w-auto object-contain" />
          <div className="border-l border-zinc-200 pl-4 flex items-center gap-2">
            <button onClick={onBack} className="text-zinc-400 hover:text-black transition text-sm">← All Clients</button>
            <span className="text-zinc-300">/</span>
            <div>
              <h1 className="text-base font-bold text-black">{client.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded border ${client.source === "zoho" ? "border-blue-200 text-blue-600 bg-blue-50" : "border-purple-200 text-purple-600 bg-purple-50"}`}>
                {client.source.toUpperCase()}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {syncMsg && <span className={`text-xs font-medium ${syncMsg.startsWith("✓") ? "text-emerald-600" : "text-red-500"}`}>{syncMsg}</span>}
          {client.source === "zoho" && (
            <button onClick={handleSync} disabled={syncing}
              className="text-xs px-3 py-1.5 rounded border border-zinc-300 hover:bg-zinc-100 text-zinc-700 transition disabled:opacity-50">
              {syncing ? "Syncing..." : "⟳ Sync Zoho"}
            </button>
          )}
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-8 py-6 space-y-5">
        <div className="flex gap-1 border-b border-zinc-200 overflow-x-auto">
          {SUB_MODULES.map(m => (
            <button key={m.key} onClick={() => { setActiveTab(m.key); try { const id = window.location.hash.replace("#","").split("|")[0]; window.location.hash = id + "|" + m.key; } catch {} }}
              className={`text-sm px-4 py-2.5 whitespace-nowrap transition border-b-2 -mb-px font-medium ${activeTab === m.key ? "border-black text-black" : "border-transparent text-zinc-400 hover:text-zinc-700"}`}>
              {m.label}
            </button>
          ))}
        </div>
        {activeTab === "invoices" && <InvoicesTab clientId={client.org_id ?? client.id} />}
        {activeTab === "sales_orders" && <SalesOrdersTab clientId={client.org_id ?? client.id} />}
        {activeTab === "estimates" && <EstimatesTab clientId={client.org_id ?? client.id} />}
        {activeTab === "payments" && <PaymentsTab clientId={client.org_id ?? client.id} />}
        {activeTab === "expenses" && <ExpensesTab clientId={client.org_id ?? client.id} />}
        {activeTab === "audit" && <AuditTab clientId={client.org_id ?? client.id} />}
      </div>
    </div>
  );
}

// ============================================
// DASHBOARD (CLIENT LIST)
// ============================================
function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  // Use URL hash to track active client — survives page refresh
  const [activeClientId, setActiveClientId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const hash = window.location.hash.replace("#", "").split("|")[0];
      if (hash) setActiveClientId(hash);
    } catch {}
  }, []);

  useEffect(() => {
    supabase.from("clients").select("*").order("name")
      .then(({ data }) => { setClients(data || []); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!activeClientId) return;
    try {
      const tab = window.location.hash.replace("#","").split("|")[1] || "invoices";
      window.location.hash = activeClientId + "|" + tab;
    } catch {}
  }, [activeClientId]);

  const activeClient = clients.find(c => c.id === activeClientId) || null;

  if (loading && activeClientId) {
    return <div className="min-h-screen bg-white flex items-center justify-center"><p className="text-zinc-400 text-sm animate-pulse">Loading...</p></div>;
  }

  if (activeClient) {
    return <ClientModule client={activeClient} onBack={() => setActiveClientId(null)} />;
  }

  const today = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "long", year: "numeric" });
  const [search, setSearch] = useState("");
  const filteredClients = clients.filter(c => c.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="min-h-screen bg-white text-black font-sans">
      <div className="border-b border-zinc-200 px-8 py-3 flex items-center justify-between bg-white">
        <div className="flex items-center gap-3">
          <img src={COMPANY_LOGO} alt="CA India" className="h-10 w-auto object-contain" />
          <div className="border-l border-zinc-200 pl-3">
            <p className="text-sm font-bold text-zinc-900">{COMPANY_NAME}</p>
            <p className="text-xs text-zinc-400">Finance Dashboard · {today}</p>
          </div>
        </div>
        <button onClick={onLogout} className="text-xs px-3 py-1.5 rounded border border-zinc-300 hover:bg-zinc-100 text-zinc-600 transition">Sign Out</button>
      </div>
      <div className="max-w-4xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Clients</h2>
          <span className="text-xs text-zinc-400">{filteredClients.length} of {clients.length} entities</span>
        </div>
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..." autoFocus
            className="w-full pl-9 pr-4 py-2.5 border border-zinc-200 rounded-lg text-sm text-black placeholder-zinc-400 focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-black text-lg leading-none">×</button>}
        </div>
        {loading ? (
          <div className="text-center py-20 text-zinc-400 text-sm">Loading...</div>
        ) : (
          <div className="border border-zinc-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 bg-zinc-50 border-b border-zinc-200 px-6 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              <div className="col-span-9">Client Name</div>
              <div className="col-span-2">Source</div>
              <div className="col-span-1"></div>
            </div>
            {filteredClients.length === 0 ? (
              <div className="text-center py-12 text-zinc-400 text-sm">No clients found for &ldquo;{search}&rdquo;</div>
            ) : filteredClients.map((client, i) => (
              <button key={client.id}
                onClick={() => { try { window.location.hash = client.id + "|invoices"; } catch {} setActiveClientId(client.id); }}
                className="w-full grid grid-cols-12 items-center px-6 py-4 text-left hover:bg-zinc-50 transition border-b border-zinc-100 last:border-0 group">
                <div className="col-span-9 flex items-center gap-4">
                  <span className="text-xs text-zinc-400 w-5 text-right flex-shrink-0">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-semibold text-black text-sm group-hover:underline">{client.name}</span>
                </div>
                <div className="col-span-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded border ${client.source === "zoho" ? "border-blue-200 text-blue-600 bg-blue-50" : "border-purple-200 text-purple-600 bg-purple-50"}`}>
                    {client.source?.toUpperCase()}
                  </span>
                </div>
                <div className="col-span-1 text-right text-zinc-300 group-hover:text-black transition text-lg">→</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// ROOT
// ============================================
export default function Home() {
  const [session, setSession] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(!!data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(!!s));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === null) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    );
  }

  return session
    ? <Dashboard onLogout={() => setSession(false)} />
    : <LoginScreen onLogin={() => setSession(true)} />;
}
