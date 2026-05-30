"use client";

import { useEffect, useState } from "react";
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

type SubModule = "invoices" | "sales_orders" | "estimates" | "payments" | "expenses" | "reports";

// ============================================
// HELPERS
// ============================================
function fmt(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency, maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(d: string) {
  if (!d) return "—";
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
                  <td className="px-4 py-3 text-right text-zinc-300">{fmt(inv.sub_total, inv.currency_code)}</td>
                  <td className="px-4 py-3 text-right text-blue-400">{fmt(inv.tax_total, inv.currency_code)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-white">{fmt(inv.total, inv.currency_code)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-amber-400">{fmt(inv.balance, inv.currency_code)}</td>
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
                  <td className="px-4 py-3 text-right font-semibold text-white">{fmt(s.total, s.currency_code)}</td>
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
                  <td className="px-4 py-3 text-right font-semibold text-white">{fmt(e.total, e.currency_code)}</td>
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
                  <td className="px-4 py-3 text-right font-semibold text-red-400">{fmt(e.total, e.currency_code)}</td>
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
          className={`text-sm px-5 py-2 rounded-lg border transition ${activeReport === "customers" ? "bg-zinc-100 text-zinc-900 border-zinc-100" : "bg-transparent text-zinc-400 border-zinc-800 hover:border-zinc-600"}`}>
          Customer Report
        </button>
        <button
          onClick={() => setActiveReport("expenses")}
          className={`text-sm px-5 py-2 rounded-lg border transition ${activeReport === "expenses" ? "bg-zinc-100 text-zinc-900 border-zinc-100" : "bg-transparent text-zinc-400 border-zinc-800 hover:border-zinc-600"}`}>
          Expense Ledger
        </button>
      </div>

      {activeReport === "customers" && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">Total Invoiced</p>
              <p className="text-xl font-semibold text-white">{fmt(totalInvoiced)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">Total Received</p>
              <p className="text-xl font-semibold text-emerald-400">{fmt(totalReceived)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">Outstanding</p>
              <p className="text-xl font-semibold text-amber-400">{fmt(totalBalance)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">Total GST</p>
              <p className="text-xl font-semibold text-blue-400">{fmt(totalGST)}</p>
            </div>
          </div>

          {/* Customer table */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-200">Customer-wise Breakdown</h3>
              <p className="text-xs text-zinc-500 mt-0.5">{customers.length} customers</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase">
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
                      <tr key={i} className="border-b border-zinc-800/60 hover:bg-zinc-800/40">
                        <td className="px-4 py-3 font-medium text-zinc-100">{c.name}</td>
                        <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{c.gst || "—"}</td>
                        <td className="px-4 py-3 text-right text-zinc-400">{c.invoiceCount} <span className="text-zinc-600 text-xs">({c.paidCount} paid)</span></td>
                        <td className="px-4 py-3 text-right font-semibold text-white">{fmt(c.invoiced)}</td>
                        <td className="px-4 py-3 text-right text-emerald-400">{fmt(c.received)}</td>
                        <td className="px-4 py-3 text-right text-amber-400">{fmt(c.balance)}</td>
                        <td className="px-4 py-3 text-right text-blue-400">{fmt(c.gst_amount)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-zinc-800 rounded-full h-1.5">
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
                  <tr className="border-t border-zinc-700 bg-zinc-800/50">
                    <td className="px-4 py-3 font-semibold text-zinc-300" colSpan={3}>Total</td>
                    <td className="px-4 py-3 text-right font-bold text-white">{fmt(totalInvoiced)}</td>
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
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">Total Expenses</p>
              <p className="text-xl font-semibold text-red-400">{fmt(totalExpenses)}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">No. of Entries</p>
              <p className="text-xl font-semibold text-white">{expenses.length}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">Ledger Accounts</p>
              <p className="text-xl font-semibold text-purple-400">{expenseAccounts.length}</p>
            </div>
          </div>

          {/* Ledger breakdown */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-200">Expense Ledger</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Grouped by account</p>
            </div>
            {expenseAccounts.map((grp, gi) => (
              <div key={gi} className="border-b border-zinc-800/60 last:border-0">
                <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/30">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-zinc-100">{grp.account}</span>
                    <span className="text-xs text-zinc-500">{grp.count} entries</span>
                  </div>
                  <span className="text-sm font-bold text-red-400">{fmt(grp.total)}</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-zinc-600 text-xs uppercase border-b border-zinc-800/40">
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
                        <tr key={ei} className="border-b border-zinc-800/30 hover:bg-zinc-800/20 last:border-0">
                          <td className="px-6 py-2 font-mono text-zinc-500 text-xs">{exp.expense_number}</td>
                          <td className="px-4 py-2 text-zinc-300">{exp.vendor_name || "—"}</td>
                          <td className="px-4 py-2 text-zinc-500">{fmtDate(exp.date)}</td>
                          <td className="px-4 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_COLORS[exp.status] || "bg-zinc-800 text-zinc-400"}`}>{exp.status}</span>
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
              <div className="flex items-center justify-between px-4 py-3 bg-zinc-800/50 border-t border-zinc-700">
                <span className="text-sm font-semibold text-zinc-300">Grand Total</span>
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
// CLIENT MODULE
// ============================================
const SUB_MODULES: { key: SubModule; label: string }[] = [
  { key: "invoices", label: "Invoices" },
  { key: "sales_orders", label: "Sales Orders" },
  { key: "estimates", label: "Estimates" },
  { key: "payments", label: "Payments" },
  { key: "expenses", label: "Expenses" },
  { key: "reports", label: "📊 Reports" },
];

function ClientModule({ client, onBack }: { client: Client; onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<SubModule>("invoices");
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
            <button key={m.key} onClick={() => setActiveTab(m.key)}
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
        {activeTab === "reports" && <ReportsTab clientId={client.org_id ?? client.id} />}
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
  const [activeClientId, setActiveClientId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "");
      return hash || null;
    }
    return null;
  });

  useEffect(() => {
    supabase.from("clients").select("*").order("name")
      .then(({ data }) => { setClients(data || []); setLoading(false); });
  }, []);

  // Sync hash with active client
  useEffect(() => {
    if (activeClientId) {
      window.location.hash = activeClientId;
    } else {
      history.pushState(null, document.title, window.location.pathname);
    }
  }, [activeClientId]);

  // Listen for browser back/forward
  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      setActiveClientId(hash || null);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const activeClient = clients.find(c => c.id === activeClientId) || null;

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
              <button key={client.id} onClick={() => setActiveClientId(client.id)}
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
