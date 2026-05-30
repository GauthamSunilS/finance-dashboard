"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";

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
  id: string; expense_number: string; account_name: string;
  vendor_name: string; status: string; date: string;
  total: number; currency_code: string; description: string | null;
};

type SubModule = "invoices" | "sales_orders" | "estimates" | "payments" | "expenses" | "audit";

// ============================================
// HELPERS
// ============================================
function fmt(amount: number, currency?: string | null) {
  const safeCurrency = currency || "INR";
  try {
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: safeCurrency, maximumFractionDigits: 0,
  }).format(amount);
  } catch { return "₹" + Math.round(amount).toLocaleString("en-IN"); }
}

function fmtDate(d: string | null | undefined) {
  if (!d || d === "null") return "—";
  return new Date(d).toLocaleDateString("en-US", {
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
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[status] || "bg-zinc-800 text-zinc-400"}`}>
      {status}
    </span>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className={`text-xl font-semibold ${color}`}>{value}</p>
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
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Finance Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-1">Sign in to continue</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500" />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="••••••••"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500" />
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
        <SummaryCard label="Total Invoiced" value={fmt(total)} color="text-white" />
        <SummaryCard label="Outstanding" value={fmt(balance)} color="text-amber-400" />
        <SummaryCard label="Tax Collected" value={fmt(tax)} color="text-blue-400" />
        <SummaryCard label="Paid" value={`${paid} / ${filtered.length}`} color="text-emerald-400" />
      </div>
      <div className="flex gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search customer or invoice..."
          className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none" />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none">
          {statuses.map(s => <option key={s} value={s}>{s === "all" ? "All Statuses" : s}</option>)}
        </select>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase">
                <th className="text-left px-4 py-3">Invoice</th>
                <th className="text-left px-4 py-3">Customer</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Due</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Subtotal</th>
                <th className="text-right px-4 py-3">Tax</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-right px-4 py-3">Balance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-zinc-500">No invoices found</td></tr>
              ) : filtered.map((inv, i) => (
                <tr key={inv.id} className={`border-b border-zinc-800/60 hover:bg-zinc-800/40 ${i % 2 === 0 ? "" : "bg-zinc-900/50"}`}>
                  <td className="px-4 py-3 font-mono text-zinc-400 text-xs">{inv.invoice_number}</td>
                  <td className="px-4 py-3 font-medium text-zinc-100 max-w-[160px] truncate">
                    {inv.customer_name}
                    {inv.gst_number && <div className="text-xs text-zinc-500">{inv.gst_number}</div>}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{fmtDate(inv.date)}</td>
                  <td className="px-4 py-3 text-zinc-400">{fmtDate(inv.due_date)}</td>
                  <td className="px-4 py-3"><Badge status={inv.status} /></td>
                  <td className="px-4 py-3 text-right text-zinc-300">{fmt(inv.sub_total, inv.currency_code ?? "INR")}</td>
                  <td className="px-4 py-3 text-right text-blue-400">{fmt(inv.tax_total, inv.currency_code ?? "INR")}</td>
                  <td className="px-4 py-3 text-right font-semibold text-white">{fmt(inv.total, inv.currency_code ?? "INR")}</td>
                  <td className="px-4 py-3 text-right font-semibold text-amber-400">{fmt(inv.balance, inv.currency_code ?? "INR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 text-xs text-zinc-600 border-t border-zinc-800">
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
        <SummaryCard label="Total Orders" value={`${filtered.length}`} color="text-white" />
        <SummaryCard label="Total Value" value={fmt(total)} color="text-blue-400" />
        <SummaryCard label="Confirmed" value={`${filtered.filter(s => s.status === "confirmed").length}`} color="text-emerald-400" />
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search customer or order number..."
        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none" />
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase">
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
                <tr><td colSpan={6} className="text-center py-10 text-zinc-500">No data yet — sync from Zoho to populate</td></tr>
              ) : filtered.map((s, i) => (
                <tr key={s.id} className={`border-b border-zinc-800/60 hover:bg-zinc-800/40 ${i % 2 === 0 ? "" : "bg-zinc-900/50"}`}>
                  <td className="px-4 py-3 font-mono text-zinc-400 text-xs">{s.salesorder_number}</td>
                  <td className="px-4 py-3 font-medium text-zinc-100">{s.customer_name}</td>
                  <td className="px-4 py-3 text-zinc-400">{fmtDate(s.date)}</td>
                  <td className="px-4 py-3 text-zinc-400">{fmtDate(s.shipment_date)}</td>
                  <td className="px-4 py-3"><Badge status={s.status} /></td>
                  <td className="px-4 py-3 text-right font-semibold text-white">{fmt(s.total, s.currency_code ?? "INR")}</td>
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
        <SummaryCard label="Total Estimates" value={`${filtered.length}`} color="text-white" />
        <SummaryCard label="Total Value" value={fmt(total)} color="text-blue-400" />
        <SummaryCard label="Accepted" value={`${accepted}`} color="text-emerald-400" />
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search customer or estimate number..."
        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none" />
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase">
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
                <tr><td colSpan={6} className="text-center py-10 text-zinc-500">No data yet — sync from Zoho to populate</td></tr>
              ) : filtered.map((e, i) => (
                <tr key={e.id} className={`border-b border-zinc-800/60 hover:bg-zinc-800/40 ${i % 2 === 0 ? "" : "bg-zinc-900/50"}`}>
                  <td className="px-4 py-3 font-mono text-zinc-400 text-xs">{e.estimate_number}</td>
                  <td className="px-4 py-3 font-medium text-zinc-100">{e.customer_name}</td>
                  <td className="px-4 py-3 text-zinc-400">{fmtDate(e.date)}</td>
                  <td className="px-4 py-3 text-zinc-400">{fmtDate(e.expiry_date)}</td>
                  <td className="px-4 py-3"><Badge status={e.status} /></td>
                  <td className="px-4 py-3 text-right font-semibold text-white">{fmt(e.total, e.currency_code ?? "INR")}</td>
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
        <SummaryCard label="Total Payments" value={`${filtered.length}`} color="text-white" />
        <SummaryCard label="Total Received" value={fmt(total)} color="text-emerald-400" />
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search customer or payment number..."
        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none" />
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase">
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
                <tr key={p.id} className={`border-b border-zinc-800/60 hover:bg-zinc-800/40 ${i % 2 === 0 ? "" : "bg-zinc-900/50"}`}>
                  <td className="px-4 py-3 font-mono text-zinc-400 text-xs">{p.payment_number}</td>
                  <td className="px-4 py-3 font-medium text-zinc-100">{p.customer_name}</td>
                  <td className="px-4 py-3 text-zinc-400">{fmtDate(p.date)}</td>
                  <td className="px-4 py-3 text-zinc-400 capitalize">{p.payment_mode}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-400">{fmt(p.amount, p.currency_code ?? "INR")}</td>
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
        <SummaryCard label="Total Expenses" value={`${filtered.length}`} color="text-white" />
        <SummaryCard label="Total Amount" value={fmt(total)} color="text-red-400" />
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Search vendor or account..."
        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none" />
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase">
                <th className="text-left px-4 py-3">Expense #</th>
                <th className="text-left px-4 py-3">Account</th>
                <th className="text-left px-4 py-3">Vendor</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-zinc-500">No data yet — sync from Zoho to populate</td></tr>
              ) : filtered.map((e, i) => (
                <tr key={e.id} className={`border-b border-zinc-800/60 hover:bg-zinc-800/40 ${i % 2 === 0 ? "" : "bg-zinc-900/50"}`}>
                  <td className="px-4 py-3 font-mono text-zinc-400 text-xs">{e.expense_number}</td>
                  <td className="px-4 py-3 text-zinc-300">{e.account_name}</td>
                  <td className="px-4 py-3 text-zinc-300">{e.vendor_name}</td>
                  <td className="px-4 py-3 text-zinc-400">{fmtDate(e.date)}</td>
                  <td className="px-4 py-3"><Badge status={e.status} /></td>
                  <td className="px-4 py-3 text-right font-semibold text-red-400">{fmt(e.total, e.currency_code ?? "INR")}</td>
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
// AUDIT & COMPLIANCE TAB
// ============================================

// ═══════════════════════════════════════════════════════════════════
// FULL COMPLIANCE ENGINE — All TDS Sections, MSME, GST, Payable Ageing
// ═══════════════════════════════════════════════════════════════════

// ── Complete TDS Section Rules (Income Tax Act 1961) ──
const TDS_RULES: { sec: string; label: string; keywords: string[]; threshold: number; rate: number; note?: string }[] = [
  // Salary / PF
  { sec: "192", label: "192 – Salary", keywords: ["salary","salaries","wages","payroll","staff cost","employee cost"], threshold: 250000, rate: 10, note: "Applicable per employee as per slab; 10% used as indicative average" },
  { sec: "192A", label: "192A – PF Premature Withdrawal", keywords: ["pf withdrawal","provident fund withdrawal","epf withdrawal"], threshold: 50000, rate: 10 },
  // Interest
  { sec: "193", label: "193 – Interest on Securities", keywords: ["interest on securities","debenture interest","bond interest","ncd interest"], threshold: 5000, rate: 10 },
  { sec: "194A", label: "194A – Interest (Other)", keywords: ["interest paid","bank interest","loan interest","interest charges","fixed deposit interest","fd interest","interest expense","finance charges"], threshold: 40000, rate: 10, note: "Threshold ₹40,000 for banks; ₹5,000 for others" },
  // Dividend / Winnings
  { sec: "194", label: "194 – Dividend", keywords: ["dividend paid","interim dividend"], threshold: 5000, rate: 10 },
  { sec: "194B", label: "194B – Lottery/Winnings", keywords: ["lottery","prize","winnings","game show"], threshold: 10000, rate: 30 },
  // Contractors & Professionals
  { sec: "194C", label: "194C – Contractors/Transport/Labour", keywords: ["contractor","sub-contractor","construction","civil work","transport","courier","logistics","freight","cargo","packers","movers","security","catering","caterer","printing","cleaning","housekeeping","labour","manpower","staffing","recruitment","placement agency","event management","event","pandal","decoration","fabrication","erection","installation"], threshold: 30000, rate: 2, note: "2% for company/firm, 1% for individual/HUF; aggregate ₹1L" },
  { sec: "194D", label: "194D – Insurance Commission", keywords: ["insurance commission","insurance agent","policy commission"], threshold: 15000, rate: 5 },
  { sec: "194DA", label: "194DA – Life Insurance Payout", keywords: ["life insurance maturity","lic maturity","insurance payout","life insurance claim"], threshold: 100000, rate: 5 },
  { sec: "194G", label: "194G – Lottery Ticket Commission", keywords: ["lottery commission","lottery ticket sale"], threshold: 15000, rate: 5 },
  { sec: "194H", label: "194H – Commission/Brokerage", keywords: ["commission","brokerage","referral fee","agent fee","dealer commission","channel partner","distributor commission","sales commission"], threshold: 15000, rate: 5 },
  { sec: "194I", label: "194I – Rent (P&M / Land & Building)", keywords: ["rent","lease","rental","property management","office space","premises","godown rent","warehouse rent","equipment rent","machinery rent","vehicle lease","operating lease"], threshold: 50000, rate: 10, note: "10% for land/building/furniture; 2% for P&M" },
  { sec: "194IB", label: "194IB – Rent by Individual/HUF (>₹50K/month)", keywords: ["monthly rent","house rent","flat rent","apartment rent","residential rent"], threshold: 50000, rate: 5, note: "Applies when individual/HUF not liable for audit pays rent >₹50,000/month" },
  { sec: "194IC", label: "194IC – Joint Development Agreement", keywords: ["jda","joint development","development agreement","land development"], threshold: 1, rate: 10 },
  { sec: "194J", label: "194J – Professional/Technical Services", keywords: ["consultant","consulting","professional","technical","legal","advocate","chartered accountant","ca fees","architect","engineer","software","it services","technology","agency","designer","freelancer","cloud","subscription","saas","advisory","audit fees","accounting","medical","doctor","royalty","non-compete"], threshold: 30000, rate: 10, note: "2% for technical services; 10% for professional services/royalty" },
  { sec: "194K", label: "194K – Mutual Fund Income", keywords: ["mutual fund","mf income","dividend from mf","mf redemption"], threshold: 5000, rate: 10 },
  { sec: "194LA", label: "194LA – Compensation on Compulsory Acquisition", keywords: ["land acquisition","compulsory acquisition","immovable property compensation"], threshold: 250000, rate: 10 },
  { sec: "194M", label: "194M – Contracts by Individual/HUF >₹50L", keywords: ["professional fees","contractor payment","commission payment"], threshold: 5000000, rate: 5, note: "For individuals/HUF not covered by 194C/H/J; threshold ₹50L aggregate in FY" },
  { sec: "194N", label: "194N – Cash Withdrawal >₹1Cr", keywords: ["cash withdrawal","cash payment"], threshold: 10000000, rate: 2, note: "2% above ₹1Cr; 5% if no ITR filed for 3 years" },
  { sec: "194O", label: "194O – E-Commerce Operator", keywords: ["ecommerce","e-commerce","amazon","flipkart","platform fee","marketplace fee","aggregator","online platform"], threshold: 500000, rate: 1 },
  { sec: "194Q", label: "194Q – Purchase of Goods >₹50L", keywords: ["purchase","goods purchase","stock purchase","raw material","inventory purchase","material purchase"], threshold: 5000000, rate: 0.1, note: "Buyer deducts TDS on purchases >₹50L in FY from a single seller" },
  { sec: "195", label: "195 – Payments to Non-Residents", keywords: ["foreign payment","overseas payment","import payment","non-resident","nri payment","remittance","wire transfer abroad","foreign vendor","foreign service","offshore"], threshold: 1, rate: 20, note: "Rate varies by treaty/nature; 20% indicative — check DTAA" },
  { sec: "206AA", label: "206AA – No PAN / Higher TDS", keywords: [], threshold: 0, rate: 20, note: "Applied when deductee has no PAN — higher of: prescribed rate, 20%, or rate in force" },
];

// ── MSME Classification Keywords ──
const MSME_KEYWORDS = ["msme","micro enterprise","small enterprise","medium enterprise","msmed","udyam","udyog aadhaar","ssi","small scale","cottage industry","artisan"];

// ── GST Blocked ITC Categories (Sec 17(5)) ──
const BLOCKED_ITC_KEYWORDS = [
  "food","canteen","catering","caterer","staff welfare","restaurant","meal","lunch","dinner",
  "club membership","gym","health club","beauty salon","beauty parlour",
  "personal","family","vacation","holiday","picnic","entertainment",
  "motor vehicle","car purchase","car hire","cab","taxi","uber","ola","vehicle hire",
  "construction of building","works contract","immovable property construction",
];

// ── RCM Services (Sec 9(4) / Sec 5(4) IGST) ──
const RCM_SERVICES = [
  { label: "Legal services from advocate", keywords: ["advocate","lawyer","legal counsel","legal retainer","litigation"] },
  { label: "GTA (Goods Transport Agency)", keywords: ["gta","goods transport agency","road transport","truck","lorry"] },
  { label: "Sponsorship services", keywords: ["sponsorship","sponsored","event sponsor"] },
  { label: "Services by director to company", keywords: ["director fee","sitting fee","director remuneration"] },
  { label: "Insurance agent to insurer", keywords: ["insurance agent service","surveyor fee"] },
  { label: "Renting of motor vehicle", keywords: ["renting of motor vehicle","cab rental","vehicle rental"] },
  { label: "Security services (unregistered)", keywords: ["security service","security guard","security agency"] },
];

// ── TDS Due Date Tracker (deposit by 7th of next month; March by 30 Apr) ──
function tdsDueDate(expDate: string): string {
  const d = new Date(expDate);
  const month = d.getMonth(); // 0-based
  const year = d.getFullYear();
  if (month === 2) return `30 Apr ${year}`; // March → 30 April
  const dueMonth = new Date(year, month + 1, 7);
  return dueMonth.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Helper: infer TDS rule ──
function inferTdsRule(vendor: string, account: string, amount: number) {
  const t = `${vendor} ${account}`.toLowerCase();
  // Skip 192 (salary) and 194Q (goods purchase) from auto-inference — needs payroll/purchase data
  const skipAuto = ["192","192A","194N","194Q","206AA"];
  for (const r of TDS_RULES) {
    if (skipAuto.includes(r.sec)) continue;
    if (r.keywords.length > 0 && r.keywords.some(k => t.includes(k)) && amount >= r.threshold) return r;
  }
  return null;
}

// ── Helper: infer RCM ──
function inferRcm(vendor: string, account: string) {
  const t = `${vendor} ${account}`.toLowerCase();
  for (const r of RCM_SERVICES) {
    if (r.keywords.some(k => t.includes(k))) return r;
  }
  return null;
}

// ── Helper: check ITC blocked ──
function isItcBlocked(account: string, vendor: string) {
  const t = `${account} ${vendor}`.toLowerCase();
  return BLOCKED_ITC_KEYWORDS.some(k => t.includes(k));
}

// ── Helper: is MSME vendor ──
function isMsmeVendor(vendor: string, description: string | null) {
  const t = `${vendor} ${description || ""}`.toLowerCase();
  return MSME_KEYWORDS.some(k => t.includes(k));
}

// ── Helper: days between two dates ──
function daysBetween(a: string, b: Date = new Date()) {
  return Math.floor((b.getTime() - new Date(a).getTime()) / 86400000);
}

type AuditFinding = {
  id: string;
  severity: "Critical" | "Warning" | "Info";
  category: "TDS" | "GST/ITC" | "RCM" | "Invoice" | "Collections" | "Matching" | "MSME" | "Payable Ageing" | "Data Quality";
  ref: string; date: string; party: string; account: string;
  amount: number; issue: string; detail: string; action: string;
  tdsSection?: string;
};

function buildFindings(
  invoices: Invoice[], salesOrders: SalesOrder[], payments: Payment[], expenses: Expense[]
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const today = new Date();

  // ════════════════════════════════════════
  // SECTION A — SALES / RECEIVABLES
  // ════════════════════════════════════════

  // A1. Customer invoice overdue ageing
  for (const inv of invoices) {
    if (inv.balance > 0 && inv.due_date) {
      const days = daysBetween(inv.due_date);
      if (days > 0) {
        findings.push({
          id: `OD-${inv.id}`,
          severity: days > 90 ? "Critical" : days > 30 ? "Warning" : "Info",
          category: "Collections", ref: inv.invoice_number, date: inv.date,
          party: inv.customer_name, account: "Trade Receivables", amount: inv.balance,
          issue: `Overdue ${days}d — ₹${inv.balance.toLocaleString("en-IN")} outstanding`,
          detail: `Invoice ${inv.invoice_number} due on ${inv.due_date}. Balance ₹${inv.balance.toLocaleString("en-IN")} of ₹${inv.total.toLocaleString("en-IN")} total is unpaid. ${days > 90 ? "Debt over 90 days — consider provision for bad debt and check if 43D interest income needs reversal." : ""}`,
          action: days > 90 ? "Issue final legal notice. Evaluate write-off / bad debt provision. If earlier partial provision made, reassess." : days > 60 ? "Escalate to management. Send formal demand with 15-day ultimatum." : days > 30 ? "Send written payment reminder with interest clause per contract." : "Follow up with customer — past due date.",
        });
      }
    }
  }

  // A2. B2B Invoice — missing customer GSTIN
  for (const inv of invoices) {
    if (!inv.gst_number && inv.tax_total > 0) {
      findings.push({
        id: `GSTIN-${inv.id}`, severity: "Warning", category: "Invoice",
        ref: inv.invoice_number, date: inv.date, party: inv.customer_name,
        account: "Sales Invoice", amount: inv.total,
        issue: "B2B invoice missing customer GSTIN",
        detail: `Invoice ${inv.invoice_number} — GST ₹${inv.tax_total.toLocaleString("en-IN")} charged but no GSTIN captured. Cannot auto-populate GSTR-1 B2B table. Buyer loses ITC eligibility.`,
        action: "Collect customer GSTIN and update in system. Re-issue invoice or send credit/debit note if required. Ensure GSTR-1 filed accurately.",
      });
    }
  }

  // A3. e-Invoice / IRN missing (>₹5 lakh)
  for (const inv of invoices) {
    if (inv.total >= 500000 && !inv.reference_number) {
      findings.push({
        id: `IRN-${inv.id}`, severity: "Critical", category: "Invoice",
        ref: inv.invoice_number, date: inv.date, party: inv.customer_name,
        account: "Sales Invoice", amount: inv.total,
        issue: `e-Invoice/IRN missing — ₹${(inv.total / 100000).toFixed(1)}L invoice`,
        detail: `Invoice ${inv.invoice_number} for ₹${inv.total.toLocaleString("en-IN")} has no IRN. e-Invoicing mandatory for turnovers above threshold. Invoice is legally invalid for ITC claim by buyer.`,
        action: "Generate IRN via IRP portal (einvoice1.gst.gov.in) immediately. Share QR-embedded invoice with buyer. Penalty u/s 122 of CGST Act may apply.",
      });
    }
  }

  // ════════════════════════════════════════
  // SECTION B — SO / PAYMENT MATCHING
  // ════════════════════════════════════════
  const invoicesByCustomer: Record<string, Invoice[]> = {};
  for (const inv of invoices) {
    const k = inv.customer_name.toLowerCase().trim();
    (invoicesByCustomer[k] = invoicesByCustomer[k] || []).push(inv);
  }
  const paymentsByCustomer: Record<string, Payment[]> = {};
  for (const p of payments) {
    const k = p.customer_name.toLowerCase().trim();
    (paymentsByCustomer[k] = paymentsByCustomer[k] || []).push(p);
  }

  const soProcessed = new Set<string>();
  for (const so of salesOrders) {
    const k = so.customer_name.toLowerCase().trim();
    if (soProcessed.has(k)) continue;
    soProcessed.add(k);
    const custPayments = paymentsByCustomer[k] || [];
    const custInvoices = invoicesByCustomer[k] || [];
    const totalPaid = custPayments.reduce((s, p) => s + p.amount, 0);
    const totalInvoiced = custInvoices.reduce((s, i) => s + i.total, 0);

    if (totalPaid > 0 && custInvoices.length === 0) {
      findings.push({
        id: `2WAY-${so.id}`, severity: "Critical", category: "Matching",
        ref: so.salesorder_number, date: so.date, party: so.customer_name,
        account: "Advance from Customer", amount: totalPaid,
        issue: `2-Way Mismatch: ₹${totalPaid.toLocaleString("en-IN")} received — zero invoices raised`,
        detail: `SO ${so.salesorder_number} (₹${so.total.toLocaleString("en-IN")}). Payment ₹${totalPaid.toLocaleString("en-IN")} received but NO invoice exists. GST output tax liability triggered from date of receipt (time of supply rule).`,
        action: "Raise tax invoice immediately. Pay GST on advance if not already done (RCM on advance u/r 85). Risk: interest @ 18% p.a. on delayed GST payment.",
      });
    } else if (totalPaid > 0 && totalInvoiced > 0 && totalInvoiced < totalPaid * 0.9) {
      const gap = totalPaid - totalInvoiced;
      findings.push({
        id: `3WAY-${so.id}`, severity: "Warning", category: "Matching",
        ref: so.salesorder_number, date: so.date, party: so.customer_name,
        account: "Advance from Customer", amount: gap,
        issue: `3-Way Gap: ₹${gap.toLocaleString("en-IN")} received but not invoiced`,
        detail: `Paid ₹${totalPaid.toLocaleString("en-IN")}, invoiced ₹${totalInvoiced.toLocaleString("en-IN")}. Uninvoiced advance: ₹${gap.toLocaleString("en-IN")}.`,
        action: `Raise balance invoice ₹${gap.toLocaleString("en-IN")}. Adjust advance receipt entry. Check if advance receipt voucher was raised with GST.`,
      });
    } else if (so.total > 0 && totalInvoiced < so.total * 0.5 && totalPaid === 0) {
      findings.push({
        id: `SONO-${so.id}`, severity: "Info", category: "Matching",
        ref: so.salesorder_number, date: so.date, party: so.customer_name,
        account: "Sales Order", amount: so.total - totalInvoiced,
        issue: `SO ${so.salesorder_number}: ₹${(so.total - totalInvoiced).toLocaleString("en-IN")} uninvoiced, no payment`,
        detail: `SO value ₹${so.total.toLocaleString("en-IN")}, invoiced ₹${totalInvoiced.toLocaleString("en-IN")}, payment nil.`,
        action: "Verify delivery/service completion. Raise invoice if obligation is fulfilled to trigger payment.",
      });
    }
  }

  // B2. Advance received, no SO
  for (const [k, custPayments] of Object.entries(paymentsByCustomer)) {
    const custInvoices = invoicesByCustomer[k] || [];
    const totalPaid = custPayments.reduce((s, p) => s + p.amount, 0);
    const totalInvoiced = custInvoices.reduce((s, i) => s + i.total, 0);
    const hasSO = salesOrders.some(so => so.customer_name.toLowerCase().trim() === k);
    if (!hasSO && totalPaid > totalInvoiced + 1000 && totalPaid > 10000) {
      const advance = totalPaid - totalInvoiced;
      findings.push({
        id: `ADV-${k}`, severity: "Warning", category: "Matching",
        ref: "—", date: custPayments[0].date, party: custPayments[0].customer_name,
        account: "Advance from Customer", amount: advance,
        issue: `Uninvoiced advance ₹${advance.toLocaleString("en-IN")} from ${custPayments[0].customer_name}`,
        detail: `Payments ₹${totalPaid.toLocaleString("en-IN")}, invoiced ₹${totalInvoiced.toLocaleString("en-IN")}. Gap ₹${advance.toLocaleString("en-IN")} sitting as advance with no SO.`,
        action: "Raise SO and invoice. GST time of supply on advance receipt. Advance receipt liability must be cleared.",
      });
    }
  }

  // ════════════════════════════════════════
  // SECTION C — EXPENSE / TDS / GST COMPLIANCE
  // ════════════════════════════════════════

  // Track vendor aggregates for 194Q (goods purchase >₹50L threshold in FY)
  const vendorExpTotal: Record<string, number> = {};
  for (const exp of expenses) {
    const vk = (exp.vendor_name || "").toLowerCase().trim();
    if (!vk) continue;
    vendorExpTotal[vk] = (vendorExpTotal[vk] || 0) + exp.total;
  }

  for (const exp of expenses) {
    const vendor = exp.vendor_name || "";
    const account = exp.account_name || "";
    const amt = exp.total;
    const vk = vendor.toLowerCase().trim();

    // C1. Full TDS inference
    const rule = inferTdsRule(vendor, account, amt);
    if (rule) {
      const expectedTds = Math.round(amt * rule.rate / 100);
      findings.push({
        id: `TDS-${exp.id}`, severity: "Critical", category: "TDS",
        ref: exp.expense_number || exp.id, date: exp.date,
        party: vendor || "Unknown", account: account || "—", amount: amt,
        tdsSection: rule.sec,
        issue: `TDS not deducted — ${rule.label} @ ${rule.rate}%`,
        detail: `Expense ₹${amt.toLocaleString("en-IN")} to "${vendor}" under "${account}". Section ${rule.sec} applies. Expected TDS ₹${expectedTds.toLocaleString("en-IN")}. Deposit due by ${tdsDueDate(exp.date)}.${rule.note ? ` Note: ${rule.note}` : ""}`,
        action: `Deduct TDS ₹${expectedTds.toLocaleString("en-IN")} u/s ${rule.sec}. Deposit via ITNS 281 by ${tdsDueDate(exp.date)}. Late deposit attracts interest @ 1.5%/month u/s 201(1A). File quarterly TDS return (Form 26Q / 27Q).`,
      });
    }

    // C2. 194Q — Goods purchase >₹50L from single vendor in FY
    const goodsKeywords = ["purchase","goods purchase","raw material","inventory","stock","material"];
    const isGoodsPurchase = goodsKeywords.some(k => (vendor + " " + account).toLowerCase().includes(k));
    if (isGoodsPurchase && vk && vendorExpTotal[vk] >= 5000000 && amt >= 50000) {
      const expectedTds = Math.round(amt * 0.1 / 100);
      findings.push({
        id: `194Q-${exp.id}`, severity: "Critical", category: "TDS",
        ref: exp.expense_number || exp.id, date: exp.date,
        party: vendor, account: account, amount: amt,
        tdsSection: "194Q",
        issue: `194Q – Purchase of goods >₹50L from ${vendor} — TDS @0.1% due`,
        detail: `Aggregate purchase from "${vendor}" this FY: ₹${(vendorExpTotal[vk] || 0).toLocaleString("en-IN")} exceeds ₹50L threshold. TDS @0.1% = ₹${expectedTds.toLocaleString("en-IN")} on this transaction.`,
        action: `Deduct TDS @0.1% u/s 194Q from this and all subsequent payments to ${vendor} this FY. Note: If seller has already collected TCS u/s 206C(1H), TDS need not be deducted again.`,
      });
    }

    // C3. RCM — Reverse Charge Mechanism
    const rcm = inferRcm(vendor, account);
    if (rcm && amt > 5000) {
      const gstRcm = Math.round(amt * 0.18);
      findings.push({
        id: `RCM-${exp.id}`, severity: "Warning", category: "RCM",
        ref: exp.expense_number || exp.id, date: exp.date,
        party: vendor || "—", account: account || "—", amount: amt,
        issue: `RCM applicable — ${rcm.label}`,
        detail: `Service: "${rcm.label}". Recipient must pay GST under RCM (Sec 9(4)/5(4)). Indicative GST @18% = ₹${gstRcm.toLocaleString("en-IN")}. Verify actual rate applicable.`,
        action: "Pay GST under RCM via cash ledger. Report in GSTR-3B Table 3.1(d). ITC of RCM paid is available in Table 4(D) of GSTR-3B in same month.",
      });
    }

    // C4. ITC Blocked Credits — Sec 17(5)
    if (isItcBlocked(account, vendor) && amt > 1000) {
      findings.push({
        id: `ITC-${exp.id}`, severity: "Warning", category: "GST/ITC",
        ref: exp.expense_number || exp.id, date: exp.date,
        party: vendor || "—", account: account || "—", amount: amt,
        issue: `ITC blocked u/s 17(5) — ${account}`,
        detail: `"${account}" falls under blocked ITC category. GST paid on this cannot be offset as input credit. Claiming it would attract penalty u/s 122.`,
        action: "Do not claim ITC in GSTR-3B. If claimed in error, reverse via Table 4(B)(2) with interest @24% p.a. from date of wrong credit.",
      });
    }

    // C5. MSME Vendor — Payable Ageing breach (45-day rule u/s 43B(h))
    const isMsme = isMsmeVendor(vendor, exp.description);
    if (isMsme) {
      const daysOld = daysBetween(exp.date);
      if (daysOld > 45) {
        findings.push({
          id: `MSME-${exp.id}`, severity: daysOld > 90 ? "Critical" : "Warning", category: "MSME",
          ref: exp.expense_number || exp.id, date: exp.date,
          party: vendor, account: account, amount: amt,
          issue: `MSME payment overdue ${daysOld}d — disallowance risk u/s 43B(h)`,
          detail: `Payment to MSME vendor "${vendor}" of ₹${amt.toLocaleString("en-IN")} is ${daysOld} days old. MSMED Act mandates payment within 45 days (or agreed period, max 45 days). Overdue by ${daysOld - 45} days.`,
          action: `Pay immediately. Disallowance u/s 43B(h) of Income Tax Act applies — unpaid MSME dues not deductible in current FY. Interest u/s 16 of MSMED Act @ 3x bank rate (compounded monthly) also applicable. File MSME Form-1 (MCA) if outstanding >45 days.`,
        });
      }
    }

    // C6. Expense with no vendor — TDS/GST cannot be assessed
    if ((!vendor || vendor.trim() === "") && amt >= 10000) {
      findings.push({
        id: `NOVND-${exp.id}`, severity: "Info", category: "Data Quality",
        ref: exp.expense_number || exp.id, date: exp.date,
        party: "Unknown", account: account || "—", amount: amt,
        issue: `No vendor — ₹${amt.toLocaleString("en-IN")} under "${account}" — TDS/GST unassessable`,
        detail: `Expense ${exp.expense_number} for ₹${amt.toLocaleString("en-IN")} has no vendor. TDS section cannot be inferred. Possible journal bypass.`,
        action: "Update vendor. If journal was used to skip vendor assignment, investigate — likely a compliance bypass.",
      });
    }

    // C7. Large cash/unclear payment mode — Section 40A(3) risk
    const cashKeywords = ["cash payment","cash expense","petty cash"];
    if (cashKeywords.some(k => (account + " " + (exp.description || "")).toLowerCase().includes(k)) && amt > 10000) {
      findings.push({
        id: `CASH-${exp.id}`, severity: "Warning", category: "Data Quality",
        ref: exp.expense_number || exp.id, date: exp.date,
        party: vendor || "—", account: account, amount: amt,
        issue: `Cash payment >₹10,000 — disallowance risk u/s 40A(3)`,
        detail: `Payment of ₹${amt.toLocaleString("en-IN")} appears to be in cash. Sec 40A(3) disallows expenses paid in cash >₹10,000 to a single person in a day.`,
        action: "Verify mode of payment. If cash, this expense is disallowable for income tax purposes. Convert to banking channel.",
      });
    }
  }

  // ════════════════════════════════════════
  // SECTION D — PAYABLE AGEING (all expenses)
  // ════════════════════════════════════════
  // Group unpaid expenses by vendor and flag ageing buckets
  const unpaidExpenses = expenses.filter(e => e.status === "unbilled" || e.status === "pending" || e.status === "open" || e.status === "due");
  const vendorPayable: Record<string, { vendor: string; total: number; oldest: string; items: Expense[] }> = {};
  for (const exp of unpaidExpenses) {
    const vk = (exp.vendor_name || "Unknown").toLowerCase().trim();
    if (!vendorPayable[vk]) vendorPayable[vk] = { vendor: exp.vendor_name || "Unknown", total: 0, oldest: exp.date, items: [] };
    vendorPayable[vk].total += exp.total;
    if (new Date(exp.date) < new Date(vendorPayable[vk].oldest)) vendorPayable[vk].oldest = exp.date;
    vendorPayable[vk].items.push(exp);
  }
  for (const vp of Object.values(vendorPayable)) {
    const daysOld = daysBetween(vp.oldest);
    if (daysOld > 30) {
      const isMsme = isMsmeVendor(vp.vendor, null);
      findings.push({
        id: `PAY-${vp.vendor.replace(/\s/g,"-")}`, severity: daysOld > 90 ? "Critical" : daysOld > 60 ? "Warning" : "Info",
        category: "Payable Ageing", ref: `${vp.items.length} txn(s)`, date: vp.oldest,
        party: vp.vendor, account: "Accounts Payable", amount: vp.total,
        issue: `Payable to ${vp.vendor} — ${daysOld}d overdue · ₹${vp.total.toLocaleString("en-IN")}${isMsme ? " · ⚠ MSME" : ""}`,
        detail: `${vp.items.length} unpaid expense(s) totalling ₹${vp.total.toLocaleString("en-IN")} to "${vp.vendor}". Oldest transaction: ${vp.oldest}.${isMsme ? ` MSME vendor — 45-day payment rule applies. Interest @ 3x bank rate if delayed beyond 45 days.` : ""}`,
        action: isMsme && daysOld > 45
          ? "URGENT — MSME payment overdue. Pay immediately to avoid 43B(h) disallowance, MSMED Act interest, and MCA Form-1 filing obligation."
          : daysOld > 90 ? "Review for reconciliation. Obtain confirmation from vendor. If genuinely payable, settle. If disputed, record accordingly." : "Follow up for invoice / payment processing.",
      });
    }
  }

  return findings;
}

// ── Customer 360 view ──
function buildCustomer360(invoices: Invoice[], payments: Payment[], salesOrders: SalesOrder[]) {
  const map: Record<string, {
    name: string; gstNumber: string | null;
    soCount: number; soTotal: number;
    invoiceCount: number; invoiced: number; taxCharged: number;
    received: number; outstanding: number;
    invoices: Invoice[]; payments: Payment[]; sos: SalesOrder[];
  }> = {};

  for (const so of salesOrders) {
    const k = so.customer_name;
    if (!map[k]) map[k] = { name: k, gstNumber: null, soCount: 0, soTotal: 0, invoiceCount: 0, invoiced: 0, taxCharged: 0, received: 0, outstanding: 0, invoices: [], payments: [], sos: [] };
    map[k].soCount++; map[k].soTotal += so.total; map[k].sos.push(so);
  }
  for (const inv of invoices) {
    const k = inv.customer_name;
    if (!map[k]) map[k] = { name: k, gstNumber: null, soCount: 0, soTotal: 0, invoiceCount: 0, invoiced: 0, taxCharged: 0, received: 0, outstanding: 0, invoices: [], payments: [], sos: [] };
    map[k].gstNumber = inv.gst_number;
    map[k].invoiceCount++; map[k].invoiced += inv.total;
    map[k].taxCharged += inv.tax_total; map[k].outstanding += inv.balance;
    map[k].invoices.push(inv);
  }
  for (const p of payments) {
    const k = p.customer_name;
    if (!map[k]) map[k] = { name: k, gstNumber: null, soCount: 0, soTotal: 0, invoiceCount: 0, invoiced: 0, taxCharged: 0, received: 0, outstanding: 0, invoices: [], payments: [], sos: [] };
    map[k].received += p.amount; map[k].payments.push(p);
  }
  return Object.values(map).sort((a, b) => b.invoiced - a.invoiced);
}

const SEVSTYLE: Record<string, { border: string; badge: string; bg: string; text: string }> = {
  Critical: { border: "border-red-500/40",   badge: "bg-red-500 text-white",    bg: "bg-red-950/25",   text: "text-red-300" },
  Warning:  { border: "border-amber-500/35",  badge: "bg-amber-400 text-black",  bg: "bg-amber-950/20", text: "text-amber-300" },
  Info:     { border: "border-sky-500/30",    badge: "bg-sky-600 text-white",    bg: "bg-sky-950/20",   text: "text-sky-300" },
};

function inrFmt(n: number) { return "₹" + Math.abs(n).toLocaleString("en-IN"); }

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
      setInvoices(inv.data || []);
      setSalesOrders(so.data || []);
      setPayments(pay.data || []);
      setExpenses(exp.data || []);
      setLoading(false);
    });
  }, [clientId]);

  const findings = buildFindings(invoices, salesOrders, payments, expenses);
  const customers = buildCustomer360(invoices, payments, salesOrders);

  const counts = {
    Critical: findings.filter(f => f.severity === "Critical").length,
    Warning: findings.filter(f => f.severity === "Warning").length,
    Info: findings.filter(f => f.severity === "Info").length,
  };
  const tdsExposure = findings.filter(f => f.category === "TDS").reduce((s, f) => {
    // Extract expected TDS from the detail string as a fallback estimate
    const match = f.detail.match(/Expected TDS[^₹]*₹([\d,]+)/);
    if (match) return s + parseInt(match[1].replace(/,/g, ""));
    const r = inferTdsRule(f.party, f.account, f.amount);
    return s + (r ? Math.round(f.amount * r.rate / 100) : 0);
  }, 0);
  const overdueTotal = findings.filter(f => f.category === "Collections").reduce((s, f) => s + f.amount, 0);
  const unmatchedAdv = findings.filter(f => f.category === "Matching" && f.id.startsWith("2WAY")).reduce((s, f) => s + f.amount, 0);
  const msmeRisk = findings.filter(f => f.category === "MSME").reduce((s, f) => s + f.amount, 0);

  const allCats = ["All", ...Array.from(new Set(findings.map(f => f.category)))];
  const filteredFindings = findings
    .filter(f =>
      (filterSev === "All" || f.severity === filterSev) &&
      (filterCat === "All" || f.category === filterCat) &&
      (section === "compliance" ? ["TDS","GST/ITC","RCM","Invoice","MSME"].includes(f.category) :
       section === "matching" ? f.category === "Matching" :
       section === "expenses" ? ["TDS","GST/ITC","RCM","Data Quality"].includes(f.category) :
       section === "payables" ? ["MSME","Payable Ageing"].includes(f.category) :
       true)
    )
    .sort((a, b) => ({ Critical: 0, Warning: 1, Info: 2 }[a.severity] ?? 3) - ({ Critical: 0, Warning: 1, Info: 2 }[b.severity] ?? 3));

  if (loading) return (
    <div className="text-center py-20 text-zinc-500">
      <div className="text-2xl mb-3 animate-pulse">⚙</div>
      <p>Running audit engine...</p>
    </div>
  );

  const SECTIONS = [
    { key: "overview",    label: "Overview" },
    { key: "customers",   label: "Customer 360" },
    { key: "matching",    label: "SO · Pay · Invoice" },
    { key: "compliance",  label: "Statutory Compliance" },
    { key: "expenses",    label: "Expense / TDS / GST" },
    { key: "payables",    label: "Payables · MSME · Ageing" },
  ] as const;

  return (
    <div className="space-y-5">
      {/* Section nav */}
      <div className="flex gap-1 flex-wrap">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`text-xs px-4 py-2 rounded-lg border transition whitespace-nowrap ${section === s.key ? "bg-zinc-100 text-zinc-900 border-zinc-100 font-semibold" : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"}`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {section === "overview" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Critical Findings", val: counts.Critical, sub: "require immediate action", color: "text-red-400", border: "border-red-500/30" },
              { label: "Warnings", val: counts.Warning, sub: "review recommended", color: "text-amber-400", border: "border-amber-500/30" },
              { label: "Info Flags", val: counts.Info, sub: "data quality checks", color: "text-sky-400", border: "border-sky-500/30" },
              { label: "Total Findings", val: findings.length, sub: "across all categories", color: "text-white", border: "border-zinc-700" },
            ].map(c => (
              <div key={c.label} className={`bg-zinc-900 border ${c.border} rounded-xl p-4`}>
                <p className="text-xs text-zinc-500 mb-1">{c.label}</p>
                <p className={`text-2xl font-black ${c.color}`}>{c.val}</p>
                <p className="text-xs text-zinc-600 mt-1">{c.sub}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[
              { label: "Overdue Receivables", val: inrFmt(overdueTotal), sub: "outstanding past due date", color: "text-red-300" },
              { label: "Est. TDS Exposure", val: inrFmt(tdsExposure), sub: "undeducted TDS liability", color: "text-violet-300" },
              { label: "Unmatched Advances", val: inrFmt(unmatchedAdv), sub: "payment received, no invoice", color: "text-amber-300" },
              { label: "MSME At-Risk", val: inrFmt(msmeRisk), sub: "43B(h) disallowance exposure", color: "text-orange-300" },
            ].map(c => (
              <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <p className="text-xs text-zinc-500 mb-1">{c.label}</p>
                <p className={`text-xl font-bold ${c.color}`}>{c.val}</p>
                <p className="text-xs text-zinc-600 mt-1">{c.sub}</p>
              </div>
            ))}
          </div>

          {/* Category breakdown */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <p className="text-sm font-semibold text-zinc-200">Findings by Category</p>
            </div>
            {allCats.filter(c => c !== "All").map(cat => {
              const catFindings = findings.filter(f => f.category === cat);
              const crit = catFindings.filter(f => f.severity === "Critical").length;
              const warn = catFindings.filter(f => f.severity === "Warning").length;
              return (
                <div key={cat} className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-zinc-200 font-medium w-40">{cat}</span>
                    <span className="text-xs text-zinc-500">{catFindings.length} finding{catFindings.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div className="flex gap-2">
                    {crit > 0 && <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">{crit} Critical</span>}
                    {warn > 0 && <span className="text-xs bg-amber-400 text-black px-2 py-0.5 rounded-full font-bold">{warn} Warning</span>}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-zinc-600 pb-2">
            Phase 2 (once synced): PO vs Bills vs GRN · Journal entry scrutiny · PT / PF (requires payroll sync) · 206C TCS · Advance tax estimation
          </p>
        </div>
      )}

      {/* ── CUSTOMER 360 ── */}
      {section === "customers" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2">
            {[
              { label: "Total Invoiced", val: inrFmt(invoices.reduce((s, i) => s + i.total, 0)), color: "text-white" },
              { label: "Total Received", val: inrFmt(payments.reduce((s, p) => s + p.amount, 0)), color: "text-emerald-400" },
              { label: "Outstanding", val: inrFmt(invoices.reduce((s, i) => s + i.balance, 0)), color: "text-amber-400" },
              { label: "GST Charged", val: inrFmt(invoices.reduce((s, i) => s + i.tax_total, 0)), color: "text-blue-400" },
            ].map(c => (
              <div key={c.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                <p className="text-xs text-zinc-500">{c.label}</p>
                <p className={`text-lg font-bold ${c.color}`}>{c.val}</p>
              </div>
            ))}
          </div>

          {customers.map(c => {
            const isOpen = expandedCustomer === c.name;
            const pct = c.invoiced > 0 ? Math.min(Math.round((c.received / c.invoiced) * 100), 100) : 0;
            const custFindings = findings.filter(f => f.party === c.name);
            return (
              <div key={c.name} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex items-start justify-between p-4 cursor-pointer hover:bg-zinc-800/40"
                  onClick={() => setExpandedCustomer(isOpen ? null : c.name)}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-zinc-100">{c.name}</span>
                      {c.gstNumber && <span className="text-xs font-mono text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">{c.gstNumber}</span>}
                      {custFindings.filter(f => f.severity === "Critical").length > 0 && (
                        <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-bold">
                          {custFindings.filter(f => f.severity === "Critical").length} Critical
                        </span>
                      )}
                      {custFindings.filter(f => f.severity === "Warning").length > 0 && (
                        <span className="text-xs bg-amber-400 text-black px-2 py-0.5 rounded-full font-bold">
                          {custFindings.filter(f => f.severity === "Warning").length} Warning
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-xs mt-2">
                      <div><span className="text-zinc-600">SOs</span> <span className="text-zinc-300">{c.soCount} ({inrFmt(c.soTotal)})</span></div>
                      <div><span className="text-zinc-600">Invoiced</span> <span className="text-zinc-300">{c.invoiceCount} inv · {inrFmt(c.invoiced)}</span></div>
                      <div><span className="text-zinc-600">Received</span> <span className="text-emerald-400">{inrFmt(c.received)}</span></div>
                      <div><span className="text-zinc-600">Outstanding</span> <span className={c.outstanding > 0 ? "text-amber-400" : "text-emerald-400"}>{inrFmt(c.outstanding)}</span></div>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-400" : pct >= 60 ? "bg-amber-400" : "bg-red-400"}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-zinc-500 w-12 text-right">{pct}% paid</span>
                    </div>
                  </div>
                  <span className="text-zinc-600 text-xs ml-4 mt-1 select-none">{isOpen ? "▲" : "▼"}</span>
                </div>

                {isOpen && (() => {
                  const today2 = new Date();
                  const ageBucket = (dueDate: string) => {
                    if (!dueDate) return null;
                    const d = Math.floor((today2.getTime() - new Date(dueDate).getTime()) / 86400000);
                    if (d <= 0) return null;
                    if (d <= 30) return { label: "0–30d", color: "text-yellow-400" };
                    if (d <= 60) return { label: "31–60d", color: "text-orange-400" };
                    if (d <= 90) return { label: "61–90d", color: "text-red-400" };
                    return { label: "90d+", color: "text-red-600 font-bold" };
                  };
                  const pendingInvoices = c.invoices.filter(i => i.balance > 0);
                  const paidInvoices = c.invoices.filter(i => i.balance === 0);
                  // Ageing buckets
                  const buckets = [
                    { label: "0–30d", amt: pendingInvoices.filter(i => { const d = Math.floor((today2.getTime() - new Date(i.due_date).getTime()) / 86400000); return d > 0 && d <= 30; }).reduce((s,i) => s+i.balance, 0) },
                    { label: "31–60d", amt: pendingInvoices.filter(i => { const d = Math.floor((today2.getTime() - new Date(i.due_date).getTime()) / 86400000); return d > 30 && d <= 60; }).reduce((s,i) => s+i.balance, 0) },
                    { label: "61–90d", amt: pendingInvoices.filter(i => { const d = Math.floor((today2.getTime() - new Date(i.due_date).getTime()) / 86400000); return d > 60 && d <= 90; }).reduce((s,i) => s+i.balance, 0) },
                    { label: "90d+", amt: pendingInvoices.filter(i => { const d = Math.floor((today2.getTime() - new Date(i.due_date).getTime()) / 86400000); return d > 90; }).reduce((s,i) => s+i.balance, 0) },
                  ].filter(b => b.amt > 0);
                  return (
                    <div className="border-t border-zinc-800 divide-y divide-zinc-800/50">

                      {/* Ageing summary */}
                      {buckets.length > 0 && (
                        <div className="px-4 py-3">
                          <p className="text-xs font-semibold text-zinc-400 mb-2">Overdue Ageing</p>
                          <div className="flex flex-wrap gap-3">
                            {buckets.map(b => (
                              <div key={b.label} className="bg-zinc-800/60 rounded-lg px-3 py-2 text-xs">
                                <span className="text-zinc-500 block">{b.label}</span>
                                <span className="text-amber-400 font-bold">{inrFmt(b.amt)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Pending Invoices */}
                      {pendingInvoices.length > 0 && (
                        <div className="px-4 py-3">
                          <p className="text-xs font-semibold text-zinc-400 mb-2">
                            Pending Invoices <span className="text-amber-400 ml-1">{pendingInvoices.length} · {inrFmt(pendingInvoices.reduce((s,i)=>s+i.balance,0))} outstanding</span>
                          </p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-zinc-600 border-b border-zinc-800">
                                  <th className="text-left py-1.5 pr-4 font-normal">Invoice #</th>
                                  <th className="text-left py-1.5 pr-4 font-normal">Date</th>
                                  <th className="text-left py-1.5 pr-4 font-normal">Due</th>
                                  <th className="text-left py-1.5 pr-4 font-normal">Status</th>
                                  <th className="text-right py-1.5 pr-4 font-normal">Invoice Amt</th>
                                  <th className="text-right py-1.5 pr-4 font-normal">GST</th>
                                  <th className="text-right py-1.5 font-normal">Outstanding</th>
                                </tr>
                              </thead>
                              <tbody>
                                {pendingInvoices.map(inv => {
                                  const bucket = ageBucket(inv.due_date);
                                  return (
                                    <tr key={inv.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/20">
                                      <td className="py-2 pr-4 font-mono text-zinc-300">
                                        {inv.invoice_number}
                                        {inv.total >= 500000 && !inv.reference_number && <span className="ml-1 text-red-400">⚠IRN</span>}
                                        {!inv.gst_number && inv.tax_total > 0 && <span className="ml-1 text-amber-400">⚠GST</span>}
                                      </td>
                                      <td className="py-2 pr-4 text-zinc-500">{fmtDate(inv.date)}</td>
                                      <td className="py-2 pr-4">
                                        <span className="text-zinc-500">{fmtDate(inv.due_date)}</span>
                                        {bucket && <span className={`ml-1.5 text-[10px] ${bucket.color}`}>{bucket.label}</span>}
                                      </td>
                                      <td className="py-2 pr-4"><Badge status={inv.status} /></td>
                                      <td className="py-2 pr-4 text-right text-zinc-300">{inrFmt(inv.total)}</td>
                                      <td className="py-2 pr-4 text-right text-blue-400">{inrFmt(inv.tax_total)}</td>
                                      <td className="py-2 text-right font-semibold text-amber-400">{inrFmt(inv.balance)}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Paid Invoices (collapsed) */}
                      {paidInvoices.length > 0 && (
                        <div className="px-4 py-3">
                          <p className="text-xs font-semibold text-zinc-400 mb-2">
                            Cleared Invoices <span className="text-emerald-500 ml-1">{paidInvoices.length} · {inrFmt(paidInvoices.reduce((s,i)=>s+i.total,0))}</span>
                          </p>
                          <div className="space-y-1">
                            {paidInvoices.map(inv => (
                              <div key={inv.id} className="flex items-center justify-between text-xs text-zinc-600">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono">{inv.invoice_number}</span>
                                  <span>{fmtDate(inv.date)}</span>
                                  <Badge status={inv.status} />
                                </div>
                                <span className="text-emerald-600">{inrFmt(inv.total)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Sales Orders */}
                      {c.sos.length > 0 && (
                        <div className="px-4 py-3">
                          <p className="text-xs font-semibold text-zinc-400 mb-2">Sales Orders</p>
                          <div className="space-y-1.5">
                            {c.sos.map(so => {
                              const soInvoiced = c.invoices.reduce((s,i) => s+i.total, 0);
                              const soReceived = c.received;
                              const gap = so.total - soInvoiced;
                              const matchStatus =
                                soInvoiced === 0 && soReceived > 0 ? { label: "⚠ Payment received, no invoice", color: "text-red-400" } :
                                soInvoiced > 0 && soReceived > soInvoiced * 1.05 ? { label: "⚠ Received > Invoiced (excess advance)", color: "text-amber-400" } :
                                soInvoiced >= so.total * 0.95 ? { label: "✓ Fully invoiced", color: "text-emerald-400" } :
                                gap > 0 ? { label: `${inrFmt(gap)} uninvoiced`, color: "text-zinc-400" } :
                                { label: "—", color: "text-zinc-600" };
                              return (
                                <div key={so.id} className="flex items-center justify-between text-xs bg-zinc-800/30 rounded-lg px-3 py-2">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-zinc-400">{so.salesorder_number}</span>
                                    <span className="text-zinc-600">{fmtDate(so.date)}</span>
                                    <Badge status={so.status} />
                                  </div>
                                  <div className="flex items-center gap-4 text-right">
                                    <span className="text-zinc-400">{inrFmt(so.total)}</span>
                                    <span className={matchStatus.color}>{matchStatus.label}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Payments received */}
                      {c.payments.length > 0 && (
                        <div className="px-4 py-3">
                          <p className="text-xs font-semibold text-zinc-400 mb-2">
                            Payments Received <span className="text-emerald-400 ml-1">{inrFmt(c.received)}</span>
                          </p>
                          <div className="space-y-1">
                            {c.payments.map(p => (
                              <div key={p.id} className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-zinc-500">{p.payment_number}</span>
                                  <span className="text-zinc-600">{fmtDate(p.date)}</span>
                                  <span className="text-zinc-700 bg-zinc-800 px-1.5 py-0.5 rounded text-[10px]">{p.payment_mode}</span>
                                  {p.reference_number && <span className="text-zinc-600 text-[10px]">Ref: {p.reference_number}</span>}
                                </div>
                                <span className="text-emerald-400 font-semibold">{inrFmt(p.amount)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Compliance flags */}
                      {custFindings.length > 0 && (
                        <div className="px-4 py-3">
                          <p className="text-xs font-semibold text-zinc-400 mb-2">Compliance Flags</p>
                          <div className="space-y-1.5">
                            {custFindings.map(f => (
                              <div key={f.id} className={`text-xs rounded-lg px-3 py-2 border ${SEVSTYLE[f.severity].border} ${SEVSTYLE[f.severity].bg}`}>
                                <span className={`font-semibold ${SEVSTYLE[f.severity].text}`}>{f.issue}</span>
                                <p className="text-zinc-500 mt-0.5">{f.action}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    </div>
                  );
                })()}
              </div>
            );
          })}
          {customers.length === 0 && <p className="text-center py-10 text-zinc-500">No customer data found — sync Zoho to populate</p>}
        </div>
      )}

      {/* ── MATCHING / FINDINGS (shared renderer for matching, compliance, expenses) ── */}
      {(section === "matching" || section === "compliance" || section === "expenses" || section === "payables") && (
        <div className="space-y-4">
          {section === "matching" && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-400 leading-relaxed">
              <p className="font-semibold text-zinc-300 mb-1">What is being checked</p>
              <p><span className="text-white">2-Way:</span> Sales Order exists + Payment received → but no Invoice raised (advance sitting unaccounted)</p>
              <p><span className="text-white">3-Way:</span> SO + Payment + Invoice all exist → but payment &gt; invoiced (partial invoicing gap)</p>
              <p><span className="text-white">Uninvoiced SO:</span> SO raised, no payment, no invoice → delivery may have happened without billing</p>
              <p className="mt-1 text-zinc-600">Phase 2 will add: PO → Bill → Payment matching and GRN reconciliation once purchase data is synced.</p>
            </div>
          )}
          {section === "compliance" && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-400 leading-relaxed">
              <p className="font-semibold text-zinc-300 mb-1">Statutory checks running</p>
              <p><span className="text-white">TDS:</span> 192 (Salary), 193 (Securities), 194/194A (Interest/Dividend), 194C (Contractors @2%), 194D (Insurance), 194G/H (Commission @5%), 194I/IB (Rent @10%), 194IC (JDA), 194J (Professional @10%), 194K (MF), 194LA (Land), 194M (Individual contracts), 194O (e-Commerce @1%), 194Q (Goods purchase @0.1% above ₹50L), 195 (NRI payments), 206AA (No PAN)</p>
              <p className="mt-1"><span className="text-white">GST:</span> ITC blocked u/s 17(5), B2B missing GSTIN, IRN missing on invoices &gt;₹5L</p>
              <p className="mt-1"><span className="text-white">RCM:</span> Legal services, GTA, sponsorship, director fees, security services, vehicle rental</p>
              <p className="mt-1 text-zinc-600">Phase 2: Journal entry scrutiny, 206C TCS, advance tax estimation, PT/PF once payroll data synced.</p>
            </div>
          )}
          {section === "payables" && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-400 leading-relaxed">
              <p className="font-semibold text-zinc-300 mb-1">Payable Ageing & MSME checks</p>
              <p><span className="text-white">MSME 43B(h):</span> Payments to MSME vendors outstanding beyond 45 days are disallowed as deduction in current FY under Income Tax Act. Interest @ 3x RBI bank rate (compounded monthly) applies under MSMED Act Sec 16.</p>
              <p className="mt-1"><span className="text-white">MCA Form-1:</span> Companies with MSME outstanding &gt;45 days must file MSME Form-1 with MCA twice a year (Apr–Sep, Oct–Mar).</p>
              <p className="mt-1"><span className="text-white">Payable Ageing:</span> All expense-status "pending/open/unbilled" entries grouped by vendor with oldest transaction date as anchor. Buckets: 0–30d, 31–45d (MSME breach), 46–60d, 61–90d, 90d+.</p>
            </div>
          )}

          {/* Severity + Category filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-zinc-500">Severity:</span>
            {["All","Critical","Warning","Info"].map(s => (
              <button key={s} onClick={() => setFilterSev(s)}
                className={`text-xs px-3 py-1 rounded-full border transition ${filterSev === s ? "bg-zinc-200 text-zinc-900 border-zinc-200" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                {s}
              </button>
            ))}
            {section !== "matching" && <>
              <span className="text-xs text-zinc-500 ml-2">Category:</span>
              {allCats.map(c => (
                <button key={c} onClick={() => setFilterCat(c)}
                  className={`text-xs px-3 py-1 rounded-full border transition ${filterCat === c ? "bg-zinc-200 text-zinc-900 border-zinc-200" : "border-zinc-700 text-zinc-400 hover:border-zinc-500"}`}>
                  {c}
                </button>
              ))}
            </>}
          </div>

          <p className="text-xs text-zinc-600">{filteredFindings.length} finding{filteredFindings.length !== 1 ? "s" : ""}</p>

          {filteredFindings.length === 0 && (
            <div className="text-center py-16 text-zinc-500">
              <p className="text-3xl mb-3">✓</p>
              <p className="font-medium text-zinc-300">No issues found in this category</p>
            </div>
          )}

          <div className="space-y-2">
            {filteredFindings.map(f => {
              const s = SEVSTYLE[f.severity];
              const isOpen = expandedFinding === f.id;
              return (
                <div key={f.id} onClick={() => setExpandedFinding(isOpen ? null : f.id)}
                  className={`rounded-xl border ${s.border} ${s.bg} cursor-pointer transition-all`}>
                  <div className="flex items-start gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.badge}`}>{f.severity}</span>
                        <span className="text-xs text-zinc-500">{f.category}</span>
                        <span className="text-xs text-zinc-700 font-mono ml-auto">{fmtDate(f.date)}</span>
                      </div>
                      <p className={`font-semibold text-sm ${s.text}`}>{f.issue}</p>
                      <p className="text-xs text-zinc-500 mt-0.5 truncate">{f.party}{f.account !== "—" ? ` · ${f.account}` : ""}</p>
                    </div>
                    <span className="text-zinc-600 text-xs ml-2 mt-1 select-none">{isOpen ? "▲" : "▼"}</span>
                  </div>
                  {isOpen && (
                    <div className="border-t border-white/5 px-4 pb-4 pt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-zinc-600 block">Reference</span><span className="text-zinc-200 font-mono">{f.ref}</span></div>
                        <div><span className="text-zinc-600 block">Amount</span><span className="text-zinc-200 font-bold">{inrFmt(f.amount)}</span></div>
                        <div><span className="text-zinc-600 block">Party</span><span className="text-zinc-200">{f.party}</span></div>
                        <div><span className="text-zinc-600 block">Account</span><span className="text-zinc-200">{f.account}</span></div>
                      </div>
                      <div className="bg-black/20 rounded-lg p-3 text-xs text-zinc-300 leading-relaxed">
                        <span className="text-zinc-500 block mb-1">Finding Detail</span>
                        {f.detail}
                      </div>
                      <div className="bg-emerald-950/40 border border-emerald-800/30 rounded-lg p-3 text-xs text-emerald-300 leading-relaxed">
                        <span className="text-emerald-600 block mb-1 font-bold">▶ Recommended Action</span>
                        {f.action}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
  const [activeTab, setActiveTab] = useState<SubModule>(() => {
    if (typeof window === "undefined") return "invoices";
    const tab = window.location.hash.replace("#","").split("|")[1];
    const valid = ["invoices","sales_orders","estimates","payments","expenses","audit"];
    return (tab && valid.includes(tab) ? tab : "invoices") as SubModule;
  });
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-zinc-500 hover:text-zinc-300 transition text-sm">← All Clients</button>
            <span className="text-zinc-700">/</span>
            <div>
              <h1 className="text-2xl font-bold text-white">{client.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full ${client.source === "zoho" ? "bg-blue-900 text-blue-300" : "bg-purple-900 text-purple-300"}`}>
                {client.source.toUpperCase()}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {syncMsg && <span className={`text-xs ${syncMsg.startsWith("✓") ? "text-emerald-400" : "text-red-400"}`}>{syncMsg}</span>}
            {client.source === "zoho" && (
              <button onClick={handleSync} disabled={syncing}
                className="text-xs px-3 py-1.5 rounded-md bg-blue-700 hover:bg-blue-600 text-white transition disabled:opacity-50">
                {syncing ? "Syncing..." : "⟳ Sync Zoho"}
              </button>
            )}
          </div>
        </div>

        {/* Sub-module tabs */}
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit overflow-x-auto">
          {SUB_MODULES.map(m => (
            <button key={m.key} onClick={() => { setActiveTab(m.key); const clientId = window.location.hash.replace("#","").split("|")[0]; window.location.hash = clientId + "|" + m.key; }}
              className={`text-sm px-4 py-1.5 rounded-lg transition whitespace-nowrap ${activeTab === m.key ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
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
  const [activeClientId, setActiveClientId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const hash = window.location.hash.replace("#", "").split("|")[0];
    return hash || null;
  });
  const [initialized, setInitialized] = useState(typeof window !== "undefined");

  useEffect(() => {
    if (!initialized) setInitialized(true);
  }, []);

  useEffect(() => {
    supabase.from("clients").select("*").order("name")
      .then(({ data }) => { setClients(data || []); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!initialized) return;
    if (activeClientId) {
      const tab = window.location.hash.replace("#","").split("|")[1] || "invoices";
      window.location.hash = activeClientId + "|" + tab;
    } else {
      window.location.hash = "";
    }
  }, [activeClientId, initialized]);

  const activeClient = clients.find(c => c.id === activeClientId) || null;

  if ((loading || !initialized) && activeClientId) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        <p className="text-zinc-500 animate-pulse">Loading...</p>
      </div>
    );
  }

  if (activeClient) {
    return <ClientModule client={activeClient} onBack={() => setActiveClientId(null)} />;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Finance Dashboard</h1>
            <p className="text-zinc-500 text-sm mt-0.5">Select a client to view their financials</p>
          </div>
          <button onClick={onLogout}
            className="text-xs px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-red-900 text-zinc-300 hover:text-red-300 transition">
            Sign Out
          </button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-zinc-500">Loading clients...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {clients.map(client => (
              <button key={client.id} onClick={() => { window.location.hash = client.id + "|invoices"; setActiveClientId(client.id); }}
                className="text-left bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-600 hover:bg-zinc-800/60 transition group">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-white group-hover:text-blue-300 transition">{client.name}</h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full mt-1 inline-block ${client.source === "zoho" ? "bg-blue-900 text-blue-300" : "bg-purple-900 text-purple-300"}`}>
                      {client.source.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-zinc-600 group-hover:text-zinc-400 transition text-lg">→</span>
                </div>
                <p className="text-xs text-zinc-600 mt-3">Invoices · Sales Orders · Estimates · Payments · Expenses</p>
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <p className="text-zinc-500 text-sm animate-pulse">Loading...</p>
    </div>
  );
  return <HomeInner />;
}

function HomeInner() {
  const [session, setSession] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(!!data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => setSession(!!s));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (session === null) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <p className="text-zinc-500 text-sm">Loading...</p>
      </div>
    );
  }

  return session
    ? <Dashboard onLogout={() => setSession(false)} />
    : <LoginScreen onLogin={() => setSession(true)} />;
}
