"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Invoice = {
  id: string;
  org_id: string;
  invoice_number: string;
  reference_number: string | null;
  customer_id: string;
  customer_name: string;
  gst_number: string | null;
  status: string;
  date: string;
  due_date: string;
  sub_total: number;
  tax_total: number;
  total: number;
  balance: number;
  currency_code: string;
  created_time: string;
  last_modified_time: string;
};

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  sent: "bg-blue-100 text-blue-700",
  draft: "bg-zinc-100 text-zinc-500",
  overdue: "bg-red-100 text-red-600",
  void: "bg-orange-100 text-orange-600",
};

function fmt(amount: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(dateStr: string) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ---------- Login Screen ----------
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      onLogin();
    }
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
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="••••••••"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-white text-zinc-900 font-semibold text-sm py-2.5 rounded-lg hover:bg-zinc-200 transition disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </div>
    </div>
  );
}

// ---------- Dashboard ----------
function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [data, setData] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    const { data, error } = await supabase
      .from("finance_dashboard")
      .select("*")
      .order("date", { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      setData(data || []);
    }
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    onLogout();
  }

  const statuses = ["all", ...Array.from(new Set(data.map((d) => d.status)))];

  const filtered = data.filter((inv) => {
    const matchSearch =
      inv.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      inv.invoice_number?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const totalRevenue = filtered.reduce((s, i) => s + (i.total || 0), 0);
  const totalBalance = filtered.reduce((s, i) => s + (i.balance || 0), 0);
  const totalTax = filtered.reduce((s, i) => s + (i.tax_total || 0), 0);
  const paidCount = filtered.filter((i) => i.status === "paid").length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Finance Dashboard</h1>
            <p className="text-zinc-400 text-sm mt-0.5">Zoho Books · Live data</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchData}
              className="text-xs px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
            >
              ↻ Refresh
            </button>
            <button
              onClick={handleLogout}
              className="text-xs px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-red-900 text-zinc-300 hover:text-red-300 transition"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Invoiced", value: fmt(totalRevenue), color: "text-white" },
            { label: "Outstanding Balance", value: fmt(totalBalance), color: "text-amber-400" },
            { label: "Tax Collected", value: fmt(totalTax), color: "text-blue-400" },
            { label: "Paid Invoices", value: `${paidCount} / ${filtered.length}`, color: "text-emerald-400" },
          ].map((card) => (
            <div key={card.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500 mb-1">{card.label}</p>
              <p className={`text-xl font-semibold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search customer or invoice number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-600"
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All Statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-20 text-zinc-500">Loading invoices...</div>
        ) : error ? (
          <div className="text-center py-20 text-red-400">Error: {error}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-zinc-500">No invoices found.</div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 text-xs uppercase tracking-wider">
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
                  {filtered.map((inv, i) => (
                    <tr
                      key={inv.id}
                      className={`border-b border-zinc-800/60 hover:bg-zinc-800/40 transition ${
                        i % 2 === 0 ? "" : "bg-zinc-900/50"
                      }`}
                    >
                      <td className="px-4 py-3 font-mono text-zinc-400 text-xs">{inv.invoice_number}</td>
                      <td className="px-4 py-3 font-medium text-zinc-100 max-w-[160px] truncate">
                        {inv.customer_name}
                        {inv.gst_number && (
                          <div className="text-xs text-zinc-500 font-normal">{inv.gst_number}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{fmtDate(inv.date)}</td>
                      <td className="px-4 py-3 text-zinc-400">{fmtDate(inv.due_date)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                            STATUS_STYLES[inv.status] || "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-zinc-300">
                        {fmt(inv.sub_total, inv.currency_code)}
                      </td>
                      <td className="px-4 py-3 text-right text-blue-400">
                        {fmt(inv.tax_total, inv.currency_code)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-white">
                        {fmt(inv.total, inv.currency_code)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-amber-400">
                        {fmt(inv.balance, inv.currency_code)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 text-xs text-zinc-600 border-t border-zinc-800">
              Showing {filtered.length} of {data.length} invoices
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Root ----------
export default function Home() {
  const [session, setSession] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(!!data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(!!session);
    });

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
