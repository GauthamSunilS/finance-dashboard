"use client";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";


// ─── Pending Changes Queue ────────────────────────────────────────────────────
type PendingChange = {
  id: string; org_id: string; module: string; action: "create" | "update" | "delete";
  record_id: string | null; payload: any; status: string; error: string | null; created_at: string;
};

async function queueChange(orgId: string, module: string, action: "create" | "update" | "delete", recordId: string | null, payload: any) {
  const { error } = await supabase.from("pending_changes").insert({
    org_id: orgId, module, action, record_id: recordId, payload, status: "pending"
  });
  return !error;
}

// Zoho API endpoints for each module
const ZOHO_ENDPOINTS: Record<string, { path: string; idField: string; listKey: string }> = {
  invoices:        { path: "invoices",        idField: "invoice_id",        listKey: "invoice" },
  expenses:        { path: "expenses",        idField: "expense_id",        listKey: "expense" },
  bills:           { path: "bills",           idField: "bill_id",           listKey: "bill" },
  journals:        { path: "journals",        idField: "journal_id",        listKey: "journal" },
  payments:        { path: "customerpayments",idField: "payment_id",        listKey: "payment" },
  vendor_payments: { path: "vendorpayments",  idField: "payment_id",        listKey: "payment" },
  sales_orders:    { path: "salesorders",     idField: "salesorder_id",     listKey: "salesorder" },
};

const COMPANY_LOGO = "/logo.png";
const COMPANY_NAME = "Gautham & Associates";

// ─── Types ────────────────────────────────────────────────────────────────────
type Client = { id: string; name: string; source: string; org_id: string | null };
type Invoice = { id: string; invoice_number: string; customer_name: string; status: string; date: string; due_date: string; sub_total: number; tax_total: number; total: number; balance: number; currency_code: string | null; reference_number: string | null; gst_number: string | null };
type SalesOrder = { id: string; salesorder_number: string; customer_name: string; status: string; date: string; shipment_date: string | null; total: number; billed_status: string | null; currency_code: string | null };
type Estimate = { id: string; estimate_number: string; customer_name: string; status: string; date: string; expiry_date: string | null; total: number; currency_code: string | null };
type Payment = { id: string; payment_number: string; customer_name: string; payment_mode: string | null; amount: number; currency_code: string | null; exchange_rate: number | null; date: string; reference_number: string | null };
type Expense = { id: string; expense_number: string | null; account_name: string | null; vendor_name: string | null; status: string; date: string; total: number; sub_total: number; tax_total: number; currency_code: string | null; description: string | null };
type Bill = { id: string; bill_number: string; vendor_name: string; status: string; date: string; due_date: string | null; total: number; balance: number; currency_code: string | null; purchaseorder_id: string | null };
type PurchaseOrder = { id: string; purchaseorder_number: string; vendor_name: string; status: string; date: string; total: number; billed_status: string | null; received_status: string | null; currency_code: string | null };
type VendorPayment = { id: string; payment_number: string | null; vendor_name: string; amount: number; date: string; payment_mode: string | null; currency_code: string | null };
type Journal = { id: string; journal_date: string; entry_number: string | null; notes: string | null; total: number; line_items: string | null };

type Module = "accounting" | "audit" | "compliance";
type AcctSection = "invoices" | "sales_orders" | "estimates" | "payments" | "expenses" | "purchases" | "bills" | "vendor_payments" | "journals";
type AuditSection = "overview" | "customers" | "so_match" | "po_match" | "gst" | "tds" | "findings";
type CompSection = "client_report" | "summary" | "gst_filing" | "tds_filing" | "pt_pf" | "it_filing";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number, currency?: string | null) {
  const c = (currency && currency !== "null") ? currency : "INR";
  try { return new Intl.NumberFormat(c === "INR" ? "en-IN" : "en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n); }
  catch { return "₹" + n.toLocaleString("en-IN"); }
}
function inr(n: number) { return "₹" + Math.abs(n).toLocaleString("en-IN"); }
function fdate(d: string | null | undefined) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return d; }
}
function daysDiff(d: string) { return Math.floor((new Date().getTime() - new Date(d).getTime()) / 86400000); }

const SC: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700", sent: "bg-blue-100 text-blue-700",
  draft: "bg-zinc-100 text-zinc-500", overdue: "bg-red-100 text-red-600",
  void: "bg-orange-100 text-orange-600", accepted: "bg-emerald-100 text-emerald-700",
  declined: "bg-red-100 text-red-600", confirmed: "bg-blue-100 text-blue-700",
  open: "bg-blue-100 text-blue-700", closed: "bg-zinc-100 text-zinc-500",
  billed: "bg-purple-100 text-purple-700", partial: "bg-amber-100 text-amber-700",
  pending: "bg-amber-100 text-amber-700", nonbillable: "bg-zinc-100 text-zinc-400",
};
function Badge({ s }: { s: string }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${SC[s?.toLowerCase()] || "bg-zinc-100 text-zinc-400"}`}>{s || "—"}</span>;
}
function Card({ label, value, sub, color = "text-zinc-900", onClick, active }: { label: string; value: string; sub?: string; color?: string; onClick?: () => void; active?: boolean }) {
  return (
    <div onClick={onClick} className={`bg-white border rounded-xl p-4 shadow-sm transition-all ${onClick ? "cursor-pointer hover:shadow-md" : ""} ${active ? "border-black ring-2 ring-black ring-offset-1" : "border-zinc-200"}`}>
      <p className="text-xs text-zinc-400 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-400 mt-0.5">{sub}</p>}
      {active && <p className="text-xs text-zinc-500 mt-1 font-medium">✓ Filtered</p>}
    </div>
  );
}
function Table({ cols, rows, empty = "No data" }: { cols: string[]; rows: React.ReactNode[][]; empty?: string }) {
  return (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              {cols.map((c, i) => <th key={i} className={`px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide ${i === cols.length - 1 ? "text-right" : "text-left"}`}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={cols.length} className="text-center py-10 text-zinc-400 text-sm">{empty}</td></tr>
              : rows.map((row, i) => (
                <tr key={i} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                  {row.map((cell, j) => <td key={j} className={`px-4 py-3 ${j === row.length - 1 ? "text-right" : "text-left"} text-zinc-700`}>{cell}</td>)}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── TDS Rules ────────────────────────────────────────────────────────────────
const TDS: { sec: string; label: string; kw: string[]; excludeKw: string[]; min: number; rate: number }[] = [
  { sec: "194C", label: "194C – Contractors", kw: ["contractor","construction","transport","courier","logistics","freight","security","catering","cleaning","labour","manpower","event","fabrication","printing","repair","maintenance"], excludeKw: ["software","subscription","saas","cloud"], min: 30000, rate: 2 },
  { sec: "194J", label: "194J – Professional", kw: ["consultant","consulting","professional","legal","advocate","chartered","software","it service","technology","designer","freelancer","saas","advisory","audit fees","technical","dues & subscription","subscription","cloud"], excludeKw: ["bank","hardware","material"], min: 30000, rate: 10 },
  { sec: "194H", label: "194H – Commission", kw: ["commission","brokerage","referral fee","agent fee","dealer commission"], excludeKw: [], min: 15000, rate: 5 },
  { sec: "194I", label: "194I – Rent", kw: ["rent","lease","rental","property management","office space","premises","godown","warehouse"], excludeKw: [], min: 50000, rate: 10 },
  { sec: "194A", label: "194A – Interest", kw: ["interest paid","loan interest","interest on loan","interest expense","interest charges"], excludeKw: ["bank charges","service charge","processing fee","gst","tax"], min: 5000, rate: 10 },
];
function inferTds(vendor: string, account: string, amount: number) {
  const t = `${vendor} ${account}`.toLowerCase();
  // Skip known non-TDS accounts
  const skip = ["bank charges","bank fee","bank service","gst","tax","petty cash","salary advance","reimbursement","travel expense","conveyance","postage","stationery","printing","office supplies"];
  if (skip.some(s => t.includes(s))) return null;
  for (const r of TDS) {
    if (r.kw.some(k => t.includes(k)) && !r.excludeKw.some(k => t.includes(k)) && amount >= r.min) return r;
  }
  return null;
}
const BLOCKED_ITC = ["food","canteen","catering","caterer","staff welfare","restaurant","meal","lunch","dinner","club membership","gym","personal","car hire","cab","taxi"];
function isBlocked(account: string, vendor: string) { return BLOCKED_ITC.some(k => `${account} ${vendor}`.toLowerCase().includes(k)); }


// ─── FY / Month Helpers ───────────────────────────────────────────────────────
function getFY(date: string): string {
  if (!date) return "Unknown";
  const d = new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-based, April = 3
  return month >= 3 ? `FY ${year}-${String(year + 1).slice(2)}` : `FY ${year - 1}-${String(year).slice(2)}`;
}

function getAvailableFYs(dates: string[]): string[] {
  const fys = new Set(dates.filter(Boolean).map(getFY));
  return ["All", ...Array.from(fys).sort().reverse()];
}

function getAvailableMonths(dates: string[], fy: string): string[] {
  const filtered = fy === "All" ? dates : dates.filter(d => getFY(d) === fy);
  const months = new Set(filtered.filter(Boolean).map(d => d.slice(0, 7)));
  return ["All", ...Array.from(months).sort().reverse()];
}

function filterByFYMonth<T extends { date?: string; journal_date?: string }>(
  items: T[], fy: string, month: string
): T[] {
  return items.filter(item => {
    const d = (item as any).date || (item as any).journal_date || "";
    if (fy !== "All" && getFY(d) !== fy) return false;
    if (month !== "All" && !d.startsWith(month)) return false;
    return true;
  });
}

function FYMonthFilter({ dates, fy, month, onFY, onMonth }: {
  dates: string[]; fy: string; month: string;
  onFY: (v: string) => void; onMonth: (v: string) => void;
}) {
  const fys = getAvailableFYs(dates);
  const months = getAvailableMonths(dates, fy);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-zinc-400 font-medium">FY:</span>
      <select value={fy} onChange={e => { onFY(e.target.value); onMonth("All"); }}
        className="text-xs border border-zinc-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-black bg-white">
        {fys.map(f => <option key={f} value={f}>{f}</option>)}
      </select>
      <span className="text-xs text-zinc-400 font-medium">Month:</span>
      <select value={month} onChange={e => onMonth(e.target.value)}
        className="text-xs border border-zinc-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-black bg-white">
        {months.map(m => <option key={m} value={m}>{m === "All" ? "All Months" : new Date(m + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</option>)}
      </select>
      {(fy !== "All" || month !== "All") && (
        <button onClick={() => { onFY("All"); onMonth("All"); }}
          className="text-xs text-zinc-400 hover:text-black px-2 py-1 rounded border border-zinc-200 hover:border-zinc-400 transition">
          Clear
        </button>
      )}
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  async function handleLogin() {
    setError(null); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message); else onLogin();
    setLoading(false);
  }
  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white border border-zinc-200 rounded-2xl p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-3 mb-2">
          <img src={COMPANY_LOGO} alt="CA" className="h-10 w-auto" />
          <div><p className="font-bold text-zinc-900 text-sm">{COMPANY_NAME}</p><p className="text-xs text-zinc-400">Finance Dashboard</p></div>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="w-full border border-zinc-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-black transition" />
          </div>
          <div>
            <label className="text-xs text-zinc-500 mb-1 block">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} placeholder="••••••••" className="w-full border border-zinc-200 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-black transition" />
          </div>
        </div>
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <button onClick={handleLogin} disabled={loading} className="w-full bg-black text-white font-semibold text-sm py-2.5 rounded-lg hover:bg-zinc-800 transition disabled:opacity-50">{loading ? "Signing in..." : "Sign In"}</button>
      </div>
    </div>
  );
}



// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
          <h2 className="font-bold text-zinc-900">{title}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-black text-xl leading-none">×</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, type = "text", placeholder = "" }: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black transition" />
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-black transition bg-white">
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

// ─── Pending Changes Panel ────────────────────────────────────────────────────
function PendingChangesPanel({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const [changes, setChanges] = useState<PendingChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("pending_changes").select("*").eq("org_id", orgId)
      .in("status", ["pending", "failed"]).order("created_at", { ascending: false })
      .then(({ data }) => { setChanges(data || []); setLoading(false); });
  }, [orgId]);

  async function pushChange(change: PendingChange) {
    setPushing(change.id);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/zoho-write`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ change_id: change.id, org_id: orgId }),
      });
      const result = await res.json();
      if (result.success) {
        setChanges(prev => prev.filter(c => c.id !== change.id));
      } else {
        setChanges(prev => prev.map(c => c.id === change.id ? { ...c, status: "failed", error: result.error } : c));
      }
    } catch (e: any) {
      setChanges(prev => prev.map(c => c.id === change.id ? { ...c, status: "failed", error: e.message } : c));
    }
    setPushing(null);
  }

  async function pushAll() {
    const pending = changes.filter(c => c.status === "pending");
    for (const c of pending) await pushChange(c);
  }

  async function discard(id: string) {
    await supabase.from("pending_changes").delete().eq("id", id);
    setChanges(prev => prev.filter(c => c.id !== id));
  }

  return (
    <Modal title={`Pending Changes (${changes.length})`} onClose={onClose}>
      {loading ? <p className="text-center py-8 text-zinc-400">Loading...</p> : changes.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-3xl mb-2">✓</p>
          <p className="text-zinc-500 font-medium">No pending changes</p>
          <p className="text-xs text-zinc-400 mt-1">All changes have been pushed to Zoho</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">{changes.filter(c => c.status === "pending").length} pending · {changes.filter(c => c.status === "failed").length} failed</p>
            <button onClick={pushAll} className="text-xs bg-black text-white px-4 py-1.5 rounded-lg hover:bg-zinc-800 transition font-medium">
              Push All to Zoho →
            </button>
          </div>
          <div className="space-y-2">
            {changes.map(c => (
              <div key={c.id} className={`border rounded-xl p-4 ${c.status === "failed" ? "border-red-200 bg-red-50" : "border-zinc-200 bg-white"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.action === "create" ? "bg-emerald-100 text-emerald-700" : c.action === "delete" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                        {c.action.toUpperCase()}
                      </span>
                      <span className="text-xs font-medium text-zinc-600 capitalize">{c.module.replace("_", " ")}</span>
                      {c.record_id && <span className="text-xs font-mono text-zinc-400">{c.record_id.slice(-10)}</span>}
                    </div>
                    <p className="text-xs text-zinc-500">{JSON.stringify(c.payload).slice(0, 120)}...</p>
                    {c.error && <p className="text-xs text-red-600 mt-1">Error: {c.error}</p>}
                    <p className="text-xs text-zinc-300 mt-1">{new Date(c.created_at).toLocaleString("en-IN")}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => pushChange(c)} disabled={pushing === c.id}
                      className="text-xs bg-black text-white px-3 py-1 rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition">
                      {pushing === c.id ? "..." : "Push"}
                    </button>
                    <button onClick={() => discard(c.id)} className="text-xs border border-zinc-200 px-3 py-1 rounded-lg hover:bg-zinc-100 transition text-zinc-500">
                      Discard
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Edit/Create forms ────────────────────────────────────────────────────────

function ExpenseForm({ orgId, expense, onSave, onClose }: { orgId: string; expense?: Expense | null; onSave: () => void; onClose: () => void }) {
  const [date, setDate] = useState(expense?.date || new Date().toISOString().slice(0, 10));
  const [account, setAccount] = useState(expense?.account_name || "");
  const [vendor, setVendor] = useState(expense?.vendor_name || "");
  const [amount, setAmount] = useState(String(expense?.total || ""));
  const [description, setDescription] = useState(expense?.description || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const payload = { date, account_name: account, vendor_name: vendor, total: Number(amount), description, currency_code: "INR" };
    const ok = await queueChange(orgId, "expenses", expense ? "update" : "create", expense?.id || null, payload);
    if (ok) { onSave(); onClose(); }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Date"><Input type="date" value={date} onChange={setDate} /></Field>
        <Field label="Amount (₹)"><Input type="number" value={amount} onChange={setAmount} placeholder="0.00" /></Field>
        <Field label="Account/Category"><Input value={account} onChange={setAccount} placeholder="e.g. Software Expenses" /></Field>
        <Field label="Vendor"><Input value={vendor} onChange={setVendor} placeholder="e.g. Zoho Corporation" /></Field>
      </div>
      <Field label="Description"><Input value={description} onChange={setDescription} placeholder="Notes" /></Field>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
        ⚠ This change will be queued for your review before being pushed to Zoho.
      </div>
      <div className="flex gap-3 justify-end">
        <button onClick={onClose} className="text-sm px-4 py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition">Cancel</button>
        <button onClick={save} disabled={saving || !amount || !date} className="text-sm px-4 py-2 bg-black text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition">
          {saving ? "Queuing..." : "Queue Change"}
        </button>
      </div>
    </div>
  );
}

function JournalForm({ orgId, journal, onSave, onClose }: { orgId: string; journal?: Journal | null; onSave: () => void; onClose: () => void }) {
  const [date, setDate] = useState(journal?.journal_date || new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState(journal?.notes || "");
  const [lines, setLines] = useState<{ account: string; debit: string; credit: string }[]>(() => {
    try {
      const parsed = JSON.parse(journal?.line_items || "[]");
      return parsed.length > 0 ? parsed.map((l: any) => ({ account: l.account_name || "", debit: l.debit_or_credit === "debit" ? String(l.amount) : "", credit: l.debit_or_credit === "credit" ? String(l.amount) : "" })) : [{ account: "", debit: "", credit: "" }, { account: "", debit: "", credit: "" }];
    } catch { return [{ account: "", debit: "", credit: "" }, { account: "", debit: "", credit: "" }]; }
  });
  const [saving, setSaving] = useState(false);

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  function addLine() { setLines(prev => [...prev, { account: "", debit: "", credit: "" }]); }
  function removeLine(i: number) { setLines(prev => prev.filter((_, j) => j !== i)); }
  function updateLine(i: number, field: string, val: string) { setLines(prev => prev.map((l, j) => j === i ? { ...l, [field]: val } : l)); }

  async function save() {
    setSaving(true);
    const payload = {
      journal_date: date, notes,
      line_items: lines.filter(l => l.account).map(l => ({
        account_name: l.account,
        debit_or_credit: Number(l.debit) > 0 ? "debit" : "credit",
        amount: Number(l.debit) || Number(l.credit),
      }))
    };
    const ok = await queueChange(orgId, "journals", journal ? "update" : "create", journal?.id || null, payload);
    if (ok) { onSave(); onClose(); }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Journal Date"><Input type="date" value={date} onChange={setDate} /></Field>
        <Field label="Notes / Reference"><Input value={notes} onChange={setNotes} placeholder="e.g. Payroll-25" /></Field>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Journal Lines</label>
          <button onClick={addLine} className="text-xs text-blue-600 hover:underline">+ Add Line</button>
        </div>
        <div className="border border-zinc-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-zinc-50 border-b border-zinc-200 text-xs text-zinc-500">
              <th className="text-left px-3 py-2">Account</th>
              <th className="text-right px-3 py-2">Debit</th>
              <th className="text-right px-3 py-2">Credit</th>
              <th className="px-3 py-2 w-8"></th>
            </tr></thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-1.5"><input value={line.account} onChange={e => updateLine(i, "account", e.target.value)} placeholder="Account name" className="w-full border border-zinc-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-black" /></td>
                  <td className="px-3 py-1.5"><input type="number" value={line.debit} onChange={e => updateLine(i, "debit", e.target.value)} placeholder="0" className="w-full border border-zinc-200 rounded px-2 py-1 text-xs text-right focus:outline-none focus:border-black" /></td>
                  <td className="px-3 py-1.5"><input type="number" value={line.credit} onChange={e => updateLine(i, "credit", e.target.value)} placeholder="0" className="w-full border border-zinc-200 rounded px-2 py-1 text-xs text-right focus:outline-none focus:border-black" /></td>
                  <td className="px-3 py-1.5 text-center"><button onClick={() => removeLine(i)} className="text-zinc-300 hover:text-red-500 text-lg leading-none">×</button></td>
                </tr>
              ))}
              <tr className={`border-t-2 text-xs font-bold ${balanced ? "text-emerald-600 border-emerald-200" : "text-red-600 border-red-200"}`}>
                <td className="px-3 py-2">{balanced ? "✓ Balanced" : "✗ Not balanced"}</td>
                <td className="px-3 py-2 text-right">{inr(totalDebit)}</td>
                <td className="px-3 py-2 text-right">{inr(totalCredit)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
        ⚠ This change will be queued for your review before being pushed to Zoho.
      </div>
      <div className="flex gap-3 justify-end">
        <button onClick={onClose} className="text-sm px-4 py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition">Cancel</button>
        <button onClick={save} disabled={saving || !balanced || !date} className="text-sm px-4 py-2 bg-black text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition">
          {saving ? "Queuing..." : "Queue Change"}
        </button>
      </div>
    </div>
  );
}

function BillForm({ orgId, bill, onSave, onClose }: { orgId: string; bill?: Bill | null; onSave: () => void; onClose: () => void }) {
  const [date, setDate] = useState(bill?.date || new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(bill?.due_date || "");
  const [vendor, setVendor] = useState(bill?.vendor_name || "");
  const [billNumber, setBillNumber] = useState(bill?.bill_number || "");
  const [amount, setAmount] = useState(String(bill?.total || ""));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const payload = { date, due_date: dueDate, vendor_name: vendor, bill_number: billNumber, total: Number(amount) };
    const ok = await queueChange(orgId, "bills", bill ? "update" : "create", bill?.id || null, payload);
    if (ok) { onSave(); onClose(); }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Bill #"><Input value={billNumber} onChange={setBillNumber} placeholder="e.g. INV-001" /></Field>
        <Field label="Vendor"><Input value={vendor} onChange={setVendor} placeholder="Vendor name" /></Field>
        <Field label="Bill Date"><Input type="date" value={date} onChange={setDate} /></Field>
        <Field label="Due Date"><Input type="date" value={dueDate} onChange={setDueDate} /></Field>
        <Field label="Amount (₹)"><Input type="number" value={amount} onChange={setAmount} placeholder="0.00" /></Field>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">⚠ Queued for review before pushing to Zoho.</div>
      <div className="flex gap-3 justify-end">
        <button onClick={onClose} className="text-sm px-4 py-2 border border-zinc-200 rounded-lg hover:bg-zinc-50">Cancel</button>
        <button onClick={save} disabled={saving || !amount || !vendor} className="text-sm px-4 py-2 bg-black text-white rounded-lg hover:bg-zinc-800 disabled:opacity-50 transition">
          {saving ? "Queuing..." : "Queue Change"}
        </button>
      </div>
    </div>
  );
}

// ─── Journal Table (expandable) ──────────────────────────────────────────────
function JournalTable({ journals, onEdit, onDelete }: { journals: Journal[]; onEdit?: (j: Journal) => void; onDelete?: (j: Journal) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (journals.length === 0) return <div className="text-center py-10 text-zinc-400 text-sm bg-white border border-zinc-200 rounded-xl">No journal entries — sync from Zoho</div>;
  return (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Entry #</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide w-1/3">Ledger Accounts</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide w-1/4">Notes</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide">Total</th>
              <th className="px-4 py-3 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {journals.map((j) => {
              const isOpen = expanded === j.id;
              let lines: any[] = [];
              try { lines = JSON.parse(j.line_items || "[]"); } catch {}
              const ledgerPreview = lines.length > 0
                ? lines.map((l: any) => l.account_name || l.account || "").filter(Boolean).join(" · ")
                : "—";
              return (
                <>
                  <tr key={j.id}
                    onClick={() => setExpanded(isOpen ? null : j.id)}
                    className="border-b border-zinc-100 hover:bg-zinc-50 cursor-pointer">
                    <td className="px-4 py-3 font-mono text-xs text-zinc-500">{j.entry_number || j.id.slice(-8)}</td>
                    <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">{fdate(j.journal_date)}</td>
                    <td className="px-4 py-3 text-zinc-700 text-xs">{isOpen ? ledgerPreview : ledgerPreview.length > 60 ? ledgerPreview.slice(0, 60) + "…" : ledgerPreview}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs">{j.notes ? (j.notes.length > 40 ? j.notes.slice(0, 40) + "…" : j.notes) : "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-zinc-900">{inr(j.total)}</td>
                    <td className="px-4 py-3 text-zinc-400 text-xs select-none">{isOpen ? "▲" : "▼"}</td>
                  </tr>
                  {isOpen && (
                    <tr key={j.id + "-detail"} className="border-b border-zinc-100 bg-zinc-50">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="space-y-3">
                          {j.notes && <p className="text-xs text-zinc-500"><span className="font-semibold text-zinc-700">Notes: </span>{j.notes}</p>}
                          {lines.length > 0 ? (
                            <div>
                              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Journal Lines</p>
                              <table className="w-full text-xs border border-zinc-200 rounded-lg overflow-hidden">
                                <thead>
                                  <tr className="bg-zinc-100 border-b border-zinc-200">
                                    <th className="text-left px-3 py-2 font-semibold text-zinc-500">Account</th>
                                    <th className="text-right px-3 py-2 font-semibold text-zinc-500">Debit</th>
                                    <th className="text-right px-3 py-2 font-semibold text-zinc-500">Credit</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {lines.map((line: any, i: number) => (
                                    <tr key={i} className="border-b border-zinc-100 last:border-0">
                                      <td className="px-3 py-2 text-zinc-700">{line.account_name || line.account || "—"}</td>
                                      <td className="px-3 py-2 text-right text-emerald-600">{line.debit_or_credit === "debit" || line.debit ? inr(Number(line.amount || line.debit || 0)) : "—"}</td>
                                      <td className="px-3 py-2 text-right text-red-600">{line.debit_or_credit === "credit" || line.credit ? inr(Number(line.amount || line.credit || 0)) : "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : <p className="text-xs text-zinc-400">No line item details — re-sync to fetch ledger details</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Accounting Module ────────────────────────────────────────────────────────
function AccountingModule({ orgId, initSection = "" }: { orgId: string; initSection?: string }) {
  const [section, setSection] = useState<AcctSection>(() => {
    const valid = ["invoices","sales_orders","estimates","payments","expenses","purchases","bills","vendor_payments","journals"];
    return (initSection && valid.includes(initSection) ? initSection : "invoices") as AcctSection;
  });
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [vendorPayments, setVendorPayments] = useState<VendorPayment[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [fy, setFy] = useState("All");
  const [month, setMonth] = useState("All");
  const [modal, setModal] = useState<{ type: string; record?: any } | null>(null);
  const [showPending, setShowPending] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [invFilter, setInvFilter] = useState<string | null>(null);
  const [payFilter, setPayFilter] = useState<string | null>(null);
  const [expFilter, setExpFilter] = useState<string | null>(null);
  const [billFilter, setBillFilter] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("pending_changes").select("id", { count: "exact" }).eq("org_id", orgId).eq("status", "pending")
      .then(({ count }) => setPendingCount(count || 0));
  }, [orgId, modal]);

  function reload() {
    setLoading(true);
    Promise.all([
      supabase.from("finance_dashboard").select("*").eq("org_id", orgId).order("date", { ascending: false }),
      supabase.from("sales_orders").select("*").eq("org_id", orgId).order("date", { ascending: false }),
      supabase.from("estimates").select("*").eq("org_id", orgId).order("date", { ascending: false }),
      supabase.from("payments").select("*").eq("org_id", orgId).order("date", { ascending: false }),
      supabase.from("expenses").select("*").eq("org_id", orgId).order("date", { ascending: false }),
      supabase.from("bills").select("*").eq("org_id", orgId).order("date", { ascending: false }),
      supabase.from("purchase_orders").select("*").eq("org_id", orgId).order("date", { ascending: false }),
      supabase.from("vendor_payments").select("*").eq("org_id", orgId).order("date", { ascending: false }),
      supabase.from("journals").select("*").eq("org_id", orgId).order("journal_date", { ascending: false }),
    ]).then(([inv, so, est, pay, exp, bil, po, vp, jrn]) => {
      setInvoices(inv.data || []); setSalesOrders(so.data || []); setEstimates(est.data || []);
      setPayments(pay.data || []); setExpenses(exp.data || []); setBills(bil.data || []);
      setPurchaseOrders(po.data || []); setVendorPayments(vp.data || []); setJournals(jrn.data || []);
      setLoading(false);
    });
  }

  useEffect(() => {
    Promise.all([
      supabase.from("finance_dashboard").select("*").eq("org_id", orgId).order("date", { ascending: false }),
      supabase.from("sales_orders").select("*").eq("org_id", orgId).order("date", { ascending: false }),
      supabase.from("estimates").select("*").eq("org_id", orgId).order("date", { ascending: false }),
      supabase.from("payments").select("*").eq("org_id", orgId).order("date", { ascending: false }),
      supabase.from("expenses").select("*").eq("org_id", orgId).order("date", { ascending: false }),
      supabase.from("bills").select("*").eq("org_id", orgId).order("date", { ascending: false }),
      supabase.from("purchase_orders").select("*").eq("org_id", orgId).order("date", { ascending: false }),
      supabase.from("vendor_payments").select("*").eq("org_id", orgId).order("date", { ascending: false }),
      supabase.from("journals").select("*").eq("org_id", orgId).order("journal_date", { ascending: false }),
    ]).then(([inv, so, est, pay, exp, bil, po, vp, jrn]) => {
      setInvoices(inv.data || []); setSalesOrders(so.data || []); setEstimates(est.data || []);
      setPayments(pay.data || []); setExpenses(exp.data || []); setBills(bil.data || []);
      setPurchaseOrders(po.data || []); setVendorPayments(vp.data || []); setJournals(jrn.data || []);
      setLoading(false);
    });
  }, [orgId]);

  const SECTIONS: { key: AcctSection; label: string; count: number }[] = [
    { key: "invoices", label: "Invoices", count: invoices.length },
    { key: "sales_orders", label: "Sales Orders", count: salesOrders.length },
    { key: "estimates", label: "Quotes/Estimates", count: estimates.length },
    { key: "payments", label: "Receipts", count: payments.length },
    { key: "expenses", label: "Expenses", count: expenses.length },
    { key: "purchases", label: "Purchase Orders", count: purchaseOrders.length },
    { key: "bills", label: "Bills", count: bills.length },
    { key: "vendor_payments", label: "Vendor Payments", count: vendorPayments.length },
    { key: "journals", label: "Journal Entries", count: journals.length },
  ];

  if (loading) return <div className="text-center py-20 text-zinc-400">Loading accounting data...</div>;

  return (
    <>
    <div className="space-y-4">
      {/* Section nav */}
      <div className="flex gap-1 flex-wrap border-b border-zinc-200 pb-0">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => { setSection(s.key); setSearch(""); try { const parts = window.location.hash.replace("#","").split("|"); window.location.hash = `${parts[0]}|${parts[1] || "accounting"}|${s.key}`; } catch {} }}
            className={`text-xs px-3 py-2 whitespace-nowrap border-b-2 -mb-px transition font-medium ${section === s.key ? "border-black text-black" : "border-transparent text-zinc-400 hover:text-zinc-700"}`}>
            {s.label} <span className="text-zinc-300 ml-1">{s.count}</span>
          </button>
        ))}
      </div>

      {/* Pending Changes + New Entry */}
      <div className="flex items-center gap-2 justify-between flex-wrap">
        <div className="flex gap-2">
          {section === "expenses" && <button onClick={() => setModal({ type: "expense" })} className="text-xs bg-black text-white px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition">+ New Expense</button>}
          {section === "journals" && <button onClick={() => setModal({ type: "journal" })} className="text-xs bg-black text-white px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition">+ New Journal</button>}
          {section === "bills" && <button onClick={() => setModal({ type: "bill" })} className="text-xs bg-black text-white px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition">+ New Bill</button>}
        </div>
        <button onClick={() => setShowPending(true)} className={`text-xs px-3 py-1.5 rounded-lg border transition flex items-center gap-1.5 ${pendingCount > 0 ? "bg-amber-50 border-amber-300 text-amber-700 font-semibold" : "border-zinc-200 text-zinc-400"}`}>
          {pendingCount > 0 ? `⏳ ${pendingCount} Pending Changes` : "No Pending Changes"}
        </button>
      </div>

      {/* Search + FY Filter */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Search ${section}...`}
            className="w-full pl-9 pr-4 py-2 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-black transition" />
        </div>
        <FYMonthFilter
          dates={[...invoices, ...salesOrders, ...estimates, ...payments, ...expenses, ...bills, ...purchaseOrders, ...vendorPayments].map((i: any) => i.date || i.journal_date || "")}
          fy={fy} month={month} onFY={setFy} onMonth={setMonth} />
      </div>

      {/* INVOICES */}
      {section === "invoices" && (() => {
        const base = filterByFYMonth(invoices, fy, month).filter(i => i.invoice_number?.toLowerCase().includes(search.toLowerCase()) || i.customer_name?.toLowerCase().includes(search.toLowerCase()));
        const d = invFilter === "outstanding" ? base.filter(i => i.balance > 0) : invFilter === "paid" ? base.filter(i => i.status === "paid") : base;
        const total = base.reduce((s, i) => s + i.total, 0); const balance = base.reduce((s, i) => s + i.balance, 0); const gst = base.reduce((s, i) => s + i.tax_total, 0);
        const cur = base[0]?.currency_code || "INR";
        const toggle = (f: string) => setInvFilter(prev => prev === f ? null : f);
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card label="Total Invoiced" value={fmt(total, cur)} onClick={() => toggle("all")} active={invFilter === "all"} />
              <Card label="Outstanding" value={fmt(balance, cur)} color="text-amber-600" onClick={() => toggle("outstanding")} active={invFilter === "outstanding"} />
              <Card label="GST Collected" value={fmt(gst, cur)} color="text-blue-600" onClick={() => toggle("gst")} active={invFilter === "gst"} />
              <Card label={`Paid (${base.filter(i => i.status === "paid").length})`} value={`${base.filter(i => i.status === "paid").length} / ${base.length}`} color="text-emerald-600" onClick={() => toggle("paid")} active={invFilter === "paid"} />
            </div>
            <Table cols={["Invoice #", "Customer", "Date", "Due", "Status", "Subtotal", "GST", "Total", "Balance"]}
              rows={d.map(i => [
                <span className="font-mono text-xs text-zinc-500">{i.invoice_number}{i.total >= 500000 && !i.reference_number ? <span className="ml-1 text-red-500 text-[10px]">⚠IRN</span> : null}</span>,
                <span>{i.customer_name}{i.gst_number ? <span className="block text-xs text-zinc-400">{i.gst_number}</span> : null}</span>,
                fdate(i.date), fdate(i.due_date), <Badge s={i.status} />,
                <span>{i.sub_total > 0 ? fmt(i.sub_total, i.currency_code) : "—"}</span>,
                <span className="text-blue-600">{i.tax_total > 0 ? fmt(i.tax_total, i.currency_code) : "—"}</span>,
                <span className="font-semibold">{fmt(i.total, i.currency_code)}</span>,
                <span className={i.balance > 0 ? "font-semibold text-amber-600" : "text-emerald-600"}>{i.balance > 0 ? fmt(i.balance, i.currency_code) : "Paid"}</span>,
              ])} empty="No invoices — sync from Zoho" />
          </div>
        );
      })()}

      {/* SALES ORDERS */}
      {section === "sales_orders" && (() => {
        const d = filterByFYMonth(salesOrders, fy, month).filter(s => s.salesorder_number?.toLowerCase().includes(search.toLowerCase()) || s.customer_name?.toLowerCase().includes(search.toLowerCase()));
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Card label="Total Orders" value={String(d.length)} />
              <Card label="Total Value" value={fmt(d.reduce((s, i) => s + i.total, 0), d[0]?.currency_code)} />
              <Card label="Confirmed" value={String(d.filter(s => s.status === "confirmed").length)} color="text-emerald-600" />
            </div>
            <Table cols={["SO #", "Customer", "Date", "Shipment", "Status", "Billed", "Total"]}
              rows={d.map(s => [
                <span className="font-mono text-xs text-zinc-500">{s.salesorder_number}</span>,
                s.customer_name, fdate(s.date), fdate(s.shipment_date), <Badge s={s.status} />,
                <Badge s={s.billed_status || "none"} />,
                <span className="font-semibold">{fmt(s.total, s.currency_code)}</span>,
              ])} empty="No sales orders" />
          </div>
        );
      })()}

      {/* ESTIMATES */}
      {section === "estimates" && (() => {
        const d = filterByFYMonth(estimates, fy, month).filter(e => e.estimate_number?.toLowerCase().includes(search.toLowerCase()) || e.customer_name?.toLowerCase().includes(search.toLowerCase()));
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Card label="Total Quotes" value={String(d.length)} />
              <Card label="Total Value" value={fmt(d.reduce((s, i) => s + i.total, 0), d[0]?.currency_code)} />
              <Card label="Accepted" value={String(d.filter(e => e.status === "accepted").length)} color="text-emerald-600" />
            </div>
            <Table cols={["Estimate #", "Customer", "Date", "Expiry", "Status", "Total"]}
              rows={d.map(e => [
                <span className="font-mono text-xs text-zinc-500">{e.estimate_number}</span>,
                e.customer_name, fdate(e.date), fdate(e.expiry_date), <Badge s={e.status} />,
                <span className="font-semibold">{fmt(e.total, e.currency_code)}</span>,
              ])} empty="No estimates" />
          </div>
        );
      })()}

      {/* PAYMENTS / RECEIPTS */}
      {section === "payments" && (() => {
        const allPay = filterByFYMonth(payments, fy, month).filter(p => p.payment_number?.toLowerCase().includes(search.toLowerCase()) || p.customer_name?.toLowerCase().includes(search.toLowerCase()));
        const d = payFilter === "forex" ? allPay.filter(p => p.currency_code && p.currency_code !== "INR") : allPay;
        const toggle = (f: string) => setPayFilter(prev => prev === f ? null : f);
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Card label="Total Receipts" value={String(allPay.length)} />
              <Card label="Total Received" value={fmt(allPay.reduce((s, i) => s + i.amount, 0), allPay[0]?.currency_code)} color="text-emerald-600" />
              <Card label="Foreign Currency" value={String(allPay.filter(p => p.currency_code && p.currency_code !== "INR").length)} color="text-blue-600" onClick={() => toggle("forex")} active={payFilter === "forex"} sub="Click to filter forex" />
            </div>
            <Table cols={["Receipt #", "Customer", "Date", "Mode", "Foreign Amt", "Forex Rate", "INR Amount"]}
              rows={d.map(p => {
                const isForeign = p.currency_code && p.currency_code !== "INR";
                const rate = p.exchange_rate || 1;
                const inrAmt = isForeign ? p.amount : p.amount;
                const foreignAmt = isForeign && rate > 1 ? p.amount / rate : null;
                return [
                  <span className="font-mono text-xs text-zinc-500">{p.payment_number}</span>,
                  p.customer_name, fdate(p.date),
                  <span className="text-xs bg-zinc-100 px-2 py-0.5 rounded">{p.payment_mode || "—"}</span>,
                  <span className="text-zinc-600">{foreignAmt ? fmt(foreignAmt, p.currency_code) : "—"}</span>,
                  <span className="text-xs text-zinc-400">{isForeign && rate > 1 ? `1 ${p.currency_code} = ₹${rate.toFixed(2)}` : "—"}</span>,
                  <span className="font-semibold text-emerald-600">{inr(inrAmt)}</span>,
                ];
              })} empty="No payments received" />
          </div>
        );
      })()}

      {/* EXPENSES */}
      {section === "expenses" && (() => {
        const d = filterByFYMonth(expenses, fy, month).filter(e => (e.vendor_name || "").toLowerCase().includes(search.toLowerCase()) || (e.account_name || "").toLowerCase().includes(search.toLowerCase()));
        const total = d.reduce((s, e) => s + e.total, 0); const gst = d.reduce((s, e) => s + (e.tax_total || 0), 0);
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Card label="Total Expenses" value={String(d.length)} />
              <Card label="GST Paid" value={inr(gst)} color="text-blue-600" />
              <Card label="Total Amount" value={inr(total)} color="text-red-600" />
            </div>
            <Table cols={["Ref", "Account", "Vendor", "Date", "Status", "Taxable", "GST", "Total", ""]}
              rows={d.map(e => [
                <span className="font-mono text-xs text-zinc-500">{e.expense_number?.slice(-10) || "—"}</span>,
                <span className="text-xs">{e.account_name || "—"}</span>,
                <span>{e.vendor_name || "—"}</span>, fdate(e.date), <Badge s={e.status} />,
                <span>{e.sub_total > 0 ? fmt(e.sub_total, e.currency_code || "INR") : fmt(e.total - (e.tax_total || 0), e.currency_code || "INR")}</span>,
                <span className="text-blue-600">{e.tax_total > 0 ? fmt(e.tax_total, e.currency_code || "INR") : "—"}</span>,
                <span className="font-semibold text-red-600">{fmt(e.total, e.currency_code || "INR")}</span>,
              ])} empty="No expenses — sync from Zoho" />
          </div>
        );
      })()}

      {/* PURCHASE ORDERS */}
      {section === "purchases" && (() => {
        const d = filterByFYMonth(purchaseOrders, fy, month).filter(p => p.purchaseorder_number?.toLowerCase().includes(search.toLowerCase()) || p.vendor_name?.toLowerCase().includes(search.toLowerCase()));
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Card label="Total POs" value={String(d.length)} />
              <Card label="Total Value" value={fmt(d.reduce((s, i) => s + i.total, 0), d[0]?.currency_code)} />
              <Card label="Unbilled" value={String(d.filter(p => p.billed_status === "none" || !p.billed_status).length)} color="text-amber-600" />
            </div>
            <Table cols={["PO #", "Vendor", "Date", "Status", "Billed", "GRN Status", "Total"]}
              rows={d.map(p => [
                <span className="font-mono text-xs text-zinc-500">{p.purchaseorder_number}</span>,
                p.vendor_name, fdate(p.date), <Badge s={p.status} />,
                <Badge s={p.billed_status || "none"} />,
                <Badge s={p.received_status || "none"} />,
                <span className="font-semibold">{fmt(p.total, p.currency_code)}</span>,
              ])} empty="No purchase orders — sync from Zoho" />
          </div>
        );
      })()}

      {/* BILLS */}
      {section === "bills" && (() => {
        const base = filterByFYMonth(bills, fy, month).filter(b => b.bill_number?.toLowerCase().includes(search.toLowerCase()) || b.vendor_name?.toLowerCase().includes(search.toLowerCase()));
        const d = billFilter === "outstanding" ? base.filter(b => b.balance > 0) : billFilter === "paid" ? base.filter(b => b.status === "paid") : base;
        const toggle = (f: string) => setBillFilter(prev => prev === f ? null : f);
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Card label="Total Bills" value={String(base.length)} onClick={() => toggle("all")} active={invFilter === "all"} />
              <Card label="Outstanding" value={fmt(base.reduce((s, i) => s + i.balance, 0), base[0]?.currency_code)} color="text-amber-600" onClick={() => toggle("outstanding")} active={invFilter === "outstanding"} />
              <Card label="Paid" value={String(base.filter(b => b.status === "paid").length)} color="text-emerald-600" onClick={() => toggle("paid")} active={invFilter === "paid"} />
            </div>
            <Table cols={["Bill #", "Vendor", "Date", "Due", "Status", "Total", "Balance", ""]}
              rows={d.map(b => [
                <span className="font-mono text-xs text-zinc-500">{b.bill_number}</span>,
                b.vendor_name, fdate(b.date), fdate(b.due_date), <Badge s={b.status} />,
                <span className="font-semibold">{fmt(b.total, b.currency_code)}</span>,
                <span className={b.balance > 0 ? "font-semibold text-amber-600" : "text-emerald-600"}>{b.balance > 0 ? fmt(b.balance, b.currency_code) : "Paid"}</span>,
              ])} empty="No bills — sync from Zoho" />
          </div>
        );
      })()}

      {/* VENDOR PAYMENTS */}
      {section === "vendor_payments" && (() => {
        const d = filterByFYMonth(vendorPayments, fy, month).filter(p => (p.vendor_name || "").toLowerCase().includes(search.toLowerCase()));
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Card label="Total Payments Made" value={String(d.length)} />
              <Card label="Total Amount Paid" value={fmt(d.reduce((s, i) => s + i.amount, 0), d[0]?.currency_code)} color="text-red-600" />
            </div>
            <Table cols={["Ref", "Vendor", "Date", "Mode", "Amount"]}
              rows={d.map(p => [
                <span className="font-mono text-xs text-zinc-500">{p.payment_number || "—"}</span>,
                p.vendor_name, fdate(p.date),
                <span className="text-xs bg-zinc-100 px-2 py-0.5 rounded">{p.payment_mode || "—"}</span>,
                <span className="font-semibold text-red-600">{fmt(p.amount, p.currency_code)}</span>,
              ])} empty="No vendor payments — sync from Zoho" />
          </div>
        );
      })()}

      {/* JOURNALS */}
      {section === "journals" && (() => {
        const d = filterByFYMonth(journals, fy, month).filter(j => (j.entry_number || "").toLowerCase().includes(search.toLowerCase()) || (j.notes || "").toLowerCase().includes(search.toLowerCase()));
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Card label="Journal Entries" value={String(d.length)} />
              <Card label="Total Value" value={inr(d.reduce((s, j) => s + j.total, 0))} />
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700">
              ⚠ Journal entries bypass automated TDS/GST checks. Each entry below is flagged for manual review in the Internal Audit module.
            </div>
            <JournalTable journals={d} onEdit={j => setModal({ type: "journal", record: j })} onDelete={async j => { await queueChange(orgId, "journals", "delete", j.id, {}); setPendingCount(c => c + 1); }} />
          </div>
        );
      })()}
    </div>
    {showPending && <PendingChangesPanel orgId={orgId} onClose={() => setShowPending(false)} />}
    {modal?.type === "expense" && <Modal title={modal.record ? "Edit Expense" : "New Expense"} onClose={() => setModal(null)}><ExpenseForm orgId={orgId} expense={modal.record} onSave={() => { reload(); setPendingCount(c => c + 1); }} onClose={() => setModal(null)} /></Modal>}
    {modal?.type === "journal" && <Modal title={modal.record ? "Edit Journal" : "New Journal Entry"} onClose={() => setModal(null)}><JournalForm orgId={orgId} journal={modal.record} onSave={() => { reload(); setPendingCount(c => c + 1); }} onClose={() => setModal(null)} /></Modal>}
    {modal?.type === "bill" && <Modal title={modal.record ? "Edit Bill" : "New Bill"} onClose={() => setModal(null)}><BillForm orgId={orgId} bill={modal.record} onSave={() => { reload(); setPendingCount(c => c + 1); }} onClose={() => setModal(null)} /></Modal>}
    </>
  );
}


// ─── Editable TDS Table ───────────────────────────────────────────────────────
function EditableTDSTable({ items, orgId }: { items: { exp: Expense; rule: typeof TDS[0]; expectedTds: number }[]; orgId: string }) {
  // Local overrides: { [expId]: { sec: string; rate: number; tds: number; excluded: boolean; note: string } }
  const [overrides, setOverrides] = useState<Record<string, { sec: string; rate: number; tds: number; excluded: boolean; note: string }>>({});
  const [editing, setEditing] = useState<string | null>(null);

  function getRow(item: typeof items[0]) {
    const o = overrides[item.exp.id];
    return {
      sec: o?.sec ?? item.rule.sec,
      rate: o?.rate ?? item.rule.rate,
      tds: o?.tds ?? item.expectedTds,
      excluded: o?.excluded ?? false,
      note: o?.note ?? "",
    };
  }

  function updateOverride(id: string, field: string, value: any) {
    setOverrides(prev => {
      const existing = prev[id] || {};
      const updated = { ...existing, [field]: value };
      // Recalculate TDS if rate changes
      if (field === "rate") {
        const item = items.find(i => i.exp.id === id);
        if (item) updated.tds = Math.round(item.exp.total * Number(value) / 100);
      }
      return { ...prev, [id]: updated };
    });
  }

  const visibleItems = items.filter(i => !getRow(i).excluded);
  const totalTds = visibleItems.reduce((s, i) => s + getRow(i).tds, 0);
  const excludedCount = items.filter(i => getRow(i).excluded).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Transaction Detail — Editable</p>
        <div className="flex items-center gap-3">
          {excludedCount > 0 && <span className="text-xs text-zinc-400">{excludedCount} excluded</span>}
          <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded font-bold">Total TDS: {inr(totalTds)}</span>
        </div>
      </div>
      <div className="text-xs text-zinc-400 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2">
        ✏ Click any row to edit TDS section, rate, or amount. Check "Exclude" to remove from TDS computation (e.g. bank charges incorrectly inferred).
      </div>
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="text-left px-3 py-3 text-xs font-semibold text-zinc-500 uppercase">Date</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-zinc-500 uppercase">Vendor</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-zinc-500 uppercase">Account</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-zinc-500 uppercase">FY</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-zinc-500 uppercase">Amount</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-zinc-500 uppercase">Section</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-zinc-500 uppercase">Rate %</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-zinc-500 uppercase">TDS ₹</th>
                <th className="text-center px-3 py-3 text-xs font-semibold text-zinc-500 uppercase">Exclude</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-zinc-500 uppercase">Note</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const row = getRow(item);
                const isEditing = editing === item.exp.id;
                const isOverridden = !!overrides[item.exp.id];
                return (
                  <tr key={item.exp.id}
                    className={`border-b border-zinc-100 last:border-0 ${row.excluded ? "opacity-40 bg-zinc-50" : "hover:bg-zinc-50"} ${isOverridden ? "bg-amber-50/30" : ""}`}>
                    <td className="px-3 py-2.5 text-zinc-600 whitespace-nowrap text-xs">{fdate(item.exp.date)}</td>
                    <td className="px-3 py-2.5 text-zinc-700 text-xs max-w-[120px] truncate">{item.exp.vendor_name || "—"}</td>
                    <td className="px-3 py-2.5 text-zinc-500 text-xs max-w-[120px] truncate">{item.exp.account_name || "—"}</td>
                    <td className="px-3 py-2.5 text-zinc-400 text-xs whitespace-nowrap">{getFY(item.exp.date || "")}</td>
                    <td className="px-3 py-2.5 text-right text-zinc-700 text-xs">{inr(item.exp.total)}</td>
                    <td className="px-3 py-2.5 text-center">
                      {isEditing ? (
                        <select value={row.sec} onChange={e => updateOverride(item.exp.id, "sec", e.target.value)}
                          className="text-xs border border-zinc-200 rounded px-1 py-0.5 focus:outline-none focus:border-violet-500 bg-white">
                          {TDS.map(r => <option key={r.sec} value={r.sec}>{r.sec}</option>)}
                          <option value="NONE">None</option>
                        </select>
                      ) : (
                        <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${isOverridden ? "bg-amber-100 text-amber-700" : "bg-violet-100 text-violet-700"}`}
                          onClick={() => setEditing(item.exp.id)}>{row.sec}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {isEditing ? (
                        <input type="number" value={row.rate} onChange={e => updateOverride(item.exp.id, "rate", Number(e.target.value))}
                          className="w-14 text-xs border border-zinc-200 rounded px-1 py-0.5 text-right focus:outline-none focus:border-violet-500" />
                      ) : (
                        <span className="text-xs text-zinc-600 cursor-pointer" onClick={() => setEditing(item.exp.id)}>{row.rate}%</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {isEditing ? (
                        <input type="number" value={row.tds} onChange={e => updateOverride(item.exp.id, "tds", Number(e.target.value))}
                          className="w-20 text-xs border border-zinc-200 rounded px-1 py-0.5 text-right focus:outline-none focus:border-violet-500" />
                      ) : (
                        <span className={`text-xs font-bold cursor-pointer ${isOverridden ? "text-amber-600" : "text-violet-600"}`}
                          onClick={() => setEditing(item.exp.id)}>{inr(row.tds)}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <input type="checkbox" checked={row.excluded} onChange={e => updateOverride(item.exp.id, "excluded", e.target.checked)}
                        className="w-3.5 h-3.5 accent-red-500 cursor-pointer" />
                    </td>
                    <td className="px-3 py-2.5">
                      {isEditing ? (
                        <div className="flex gap-1">
                          <input value={row.note} onChange={e => updateOverride(item.exp.id, "note", e.target.value)}
                            placeholder="Reason for override..." className="text-xs border border-zinc-200 rounded px-2 py-0.5 focus:outline-none w-32" />
                          <button onClick={() => setEditing(null)} className="text-xs bg-black text-white px-2 py-0.5 rounded">✓</button>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400 cursor-pointer italic" onClick={() => setEditing(item.exp.id)}>
                          {row.note || (isOverridden ? "Modified" : "click to edit")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-bold">
                <td colSpan={7} className="px-3 py-2.5 text-sm">Total (after exclusions)</td>
                <td className="px-3 py-2.5 text-right text-violet-700 text-sm font-bold">{inr(totalTds)}</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      {Object.keys(overrides).length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
          <p className="text-xs text-amber-700 font-medium">⚠ {Object.keys(overrides).length} override(s) applied. These are local only — not saved to Zoho.</p>
          <button onClick={() => setOverrides({})} className="text-xs text-amber-700 hover:text-amber-900 underline">Reset all</button>
        </div>
      )}
    </div>
  );
}

// ─── Internal Audit Module ────────────────────────────────────────────────────
function AuditModule({ orgId, initSection = "" }: { orgId: string; initSection?: string }) {
  const [section, setSection] = useState<AuditSection>(() => {
    const valid = ["overview","customers","so_match","po_match","gst","tds","findings"];
    return (initSection && valid.includes(initSection) ? initSection : "overview") as AuditSection;
  });
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [vendorPayments, setVendorPayments] = useState<VendorPayment[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState("");
  const [fy, setFy] = useState("All");
  const [month, setMonth] = useState("All");

  useEffect(() => {
    Promise.all([
      supabase.from("finance_dashboard").select("*").eq("org_id", orgId),
      supabase.from("sales_orders").select("*").eq("org_id", orgId),
      supabase.from("payments").select("*").eq("org_id", orgId),
      supabase.from("expenses").select("*").eq("org_id", orgId),
      supabase.from("bills").select("*").eq("org_id", orgId),
      supabase.from("purchase_orders").select("*").eq("org_id", orgId),
      supabase.from("vendor_payments").select("*").eq("org_id", orgId),
      supabase.from("journals").select("*").eq("org_id", orgId),
    ]).then(([inv, so, pay, exp, bil, po, vp, jrn]) => {
      setInvoices(inv.data || []); setSalesOrders(so.data || []);
      setPayments(pay.data || []); setExpenses(exp.data || []);
      setBills(bil.data || []); setPurchaseOrders(po.data || []);
      setVendorPayments(vp.data || []); setJournals(jrn.data || []);
      setLoading(false);
    });
  }, [orgId]);

  // ── Findings engine ──
  type Finding = { id: string; sev: "Critical" | "Warning" | "Info"; cat: string; party: string; ref: string; date: string; amount: number; issue: string; detail: string; action: string };
  // Apply FY/Month filter to all data
  const fInvoices = filterByFYMonth(invoices, fy, month);
  const fSalesOrders = filterByFYMonth(salesOrders, fy, month);
  const fPayments = filterByFYMonth(payments, fy, month);
  const fExpenses = filterByFYMonth(expenses, fy, month);
  const fBills = filterByFYMonth(bills, fy, month);
  const fPurchaseOrders = filterByFYMonth(purchaseOrders, fy, month);
  const fVendorPayments = filterByFYMonth(vendorPayments, fy, month);
  const fJournals = filterByFYMonth(journals, fy, month);

  const findings: Finding[] = [];
  const today = new Date();

  // Overdue invoices
  for (const inv of fInvoices) {
    if (inv.balance > 0 && inv.due_date) {
      const days = daysDiff(inv.due_date);
      if (days > 0) findings.push({ id: `OD-${inv.id}`, sev: days > 90 ? "Critical" : days > 30 ? "Warning" : "Info", cat: "Collections", party: inv.customer_name, ref: inv.invoice_number, date: inv.date, amount: inv.balance, issue: `Overdue ${days}d — ₹${inv.balance.toLocaleString("en-IN")} unpaid`, detail: `Invoice ${inv.invoice_number} was due on ${inv.due_date}. Balance ₹${inv.balance.toLocaleString("en-IN")} of total ₹${inv.total.toLocaleString("en-IN")}.`, action: days > 90 ? "Issue legal notice. Consider bad debt provision u/s 36(1)(vii)." : days > 30 ? "Send formal demand letter with interest clause." : "Follow up for payment." });
    }
  }

  // Missing GSTIN on B2B invoices
  for (const inv of fInvoices) {
    if (!inv.gst_number && inv.tax_total > 0) findings.push({ id: `GSTIN-${inv.id}`, sev: "Warning", cat: "GST", party: inv.customer_name, ref: inv.invoice_number, date: inv.date, amount: inv.total, issue: "B2B invoice — customer GSTIN missing", detail: `Invoice ${inv.invoice_number}: GST ₹${inv.tax_total.toLocaleString("en-IN")} charged but no GSTIN. GSTR-1 B2B table incomplete.`, action: "Collect GSTIN and update. Buyer loses ITC without GSTIN on invoice." });
  }

  // e-Invoice / IRN missing
  for (const inv of fInvoices) {
    if (inv.total >= 500000 && !inv.reference_number) findings.push({ id: `IRN-${inv.id}`, sev: "Critical", cat: "GST", party: inv.customer_name, ref: inv.invoice_number, date: inv.date, amount: inv.total, issue: `e-Invoice/IRN missing — ₹${(inv.total / 100000).toFixed(1)}L invoice`, detail: `Invoice ${inv.invoice_number} for ₹${inv.total.toLocaleString("en-IN")} has no IRN. Mandatory under e-invoicing threshold.`, action: "Generate IRN via IRP portal immediately. Invoice invalid for buyer ITC without IRN." });
  }

  // TDS on expenses + bills (combined)
  const allTdsSources = [
    ...fExpenses.map(e => ({ id: e.id, vendor: e.vendor_name||"", account: e.account_name||"", amount: e.total, date: e.date, ref: e.expense_number||e.id, source: "expense" })),
    ...fBills.map(b => ({ id: "bill_"+b.id, vendor: b.vendor_name||"", account: b.vendor_name||"Bill", amount: b.total, date: b.date, ref: b.bill_number, source: "bill" })),
  ];
  for (const src of allTdsSources) {
    const exp = { id: src.id, vendor_name: src.vendor, account_name: src.account, total: src.amount, date: src.date, expense_number: src.ref } as any;
    const rule = inferTds(exp.vendor_name || "", exp.account_name || "", exp.total);
    if (rule) {
      const expectedTds = Math.round(exp.total * rule.rate / 100);
      const dueDate = (() => { const d = new Date(exp.date); return d.getMonth() === 2 ? "30 Apr" : new Date(d.getFullYear(), d.getMonth() + 1, 7).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }); })();
      const srcLabel = src.source === "bill" ? "Bill" : "Expense";
      findings.push({ id: `TDS-${exp.id}`, sev: "Critical", cat: "TDS", party: exp.vendor_name || "Unknown", ref: String(exp.expense_number || "").slice(-10) || exp.id, date: exp.date, amount: exp.total, issue: `TDS not deducted — ${rule.label} @${rule.rate}% (${srcLabel})`, detail: `${srcLabel} ₹${exp.total.toLocaleString("en-IN")} to "${exp.vendor_name}" under "${exp.account_name}". Expected TDS ₹${expectedTds.toLocaleString("en-IN")}. Due by ${dueDate}.`, action: `Deduct ₹${expectedTds.toLocaleString("en-IN")} u/s ${rule.sec}. Deposit by ${dueDate} via ITNS 281. File Form 26Q quarterly.` });
    }
    if (isBlocked(exp.account_name || "", exp.vendor_name || "") && (exp as any).tax_total > 0) findings.push({ id: `ITC-${exp.id}`, sev: "Warning", cat: "GST", party: exp.vendor_name || "—", ref: String((exp as any).expense_number || "").slice(-10) || exp.id, date: exp.date, amount: exp.total, issue: `ITC blocked u/s 17(5) — ${exp.account_name}`, detail: `"${exp.account_name}" is a blocked ITC category. GST cannot be claimed.`, action: "Do not claim ITC in GSTR-3B. Reverse if already claimed — interest @24% p.a." });
  }

  // SO vs Payment 2-way mismatch
  const invByCust: Record<string, Invoice[]> = {}; const payByCust: Record<string, Payment[]> = {};
  for (const i of fInvoices) { const k = (i.customer_name || "").toLowerCase(); (invByCust[k] = invByCust[k] || []).push(i); }
  for (const p of fPayments) { const k = (p.customer_name || "").toLowerCase(); (payByCust[k] = payByCust[k] || []).push(p); }
  const soSeen = new Set<string>();
  for (const so of fSalesOrders) {
    const k = (so.customer_name || "").toLowerCase();
    if (soSeen.has(k)) continue; soSeen.add(k);
    const totalPaid = (payByCust[k] || []).reduce((s, p) => s + p.amount, 0);
    const totalInvoiced = (invByCust[k] || []).reduce((s, i) => s + i.total, 0);
    if (totalPaid > 0 && totalInvoiced === 0) findings.push({ id: `2WAY-${so.id}`, sev: "Critical", cat: "Matching", party: so.customer_name, ref: so.salesorder_number, date: so.date, amount: totalPaid, issue: `₹${totalPaid.toLocaleString("en-IN")} received — zero invoices raised`, detail: `SO ${so.salesorder_number} ₹${so.total.toLocaleString("en-IN")}. Payment ₹${totalPaid.toLocaleString("en-IN")} received but no invoice. GST output liability triggered on advance receipt.`, action: "Raise tax invoice immediately. GST interest @18% p.a. from date of advance receipt." });
    else if (totalPaid > 0 && totalInvoiced < totalPaid * 0.9) findings.push({ id: `3WAY-${so.id}`, sev: "Warning", cat: "Matching", party: so.customer_name, ref: so.salesorder_number, date: so.date, amount: totalPaid - totalInvoiced, issue: `₹${(totalPaid - totalInvoiced).toLocaleString("en-IN")} advance not invoiced`, detail: `Received ₹${totalPaid.toLocaleString("en-IN")}, invoiced ₹${totalInvoiced.toLocaleString("en-IN")}. Gap ₹${(totalPaid - totalInvoiced).toLocaleString("en-IN")} sitting as advance.`, action: `Raise invoice for balance ₹${(totalPaid - totalInvoiced).toLocaleString("en-IN")}. GST time of supply already triggered.` });
  }

  // PO vs Bill vs Payment 3-way
  for (const po of fPurchaseOrders) {
    const linkedBills = bills.filter(b => b.purchaseorder_id === po.id);
    const linkedPayments = fVendorPayments.filter(vp => linkedBills.some(b => b.vendor_name === vp.vendor_name));
    const totalBilled = linkedBills.reduce((s, b) => s + b.total, 0);
    const totalPaid = linkedPayments.reduce((s, p) => s + p.amount, 0);
    if (totalPaid > 0 && linkedBills.length === 0) findings.push({ id: `PONOSUPPL-${po.id}`, sev: "Critical", cat: "Matching", party: po.vendor_name, ref: po.purchaseorder_number, date: po.date, amount: totalPaid, issue: `PO payment made — no bill accounted`, detail: `PO ${po.purchaseorder_number} ₹${po.total.toLocaleString("en-IN")}. Payment made but no bill recorded. GRN status: ${po.received_status || "unknown"}.`, action: "Book vendor bill immediately. Verify GRN. Without bill, expense is unverifiable." });
    if (po.received_status === "fully_received" && (po.billed_status === "none" || !po.billed_status)) findings.push({ id: `GRNNOBOOK-${po.id}`, sev: "Warning", cat: "Matching", party: po.vendor_name, ref: po.purchaseorder_number, date: po.date, amount: po.total, issue: `GRN done — bill not booked`, detail: `PO ${po.purchaseorder_number}: Goods received (GRN complete) but vendor bill not yet recorded.`, action: "Book vendor bill to account for the liability. Vendor may claim interest on delayed payment." });
  }

  // Journal entries flagged
  for (const jrn of fJournals) {
    findings.push({ id: `JRN-${jrn.id}`, sev: "Info", cat: "Journal Override", party: "Journal Entry", ref: jrn.entry_number || jrn.id.slice(-8), date: jrn.journal_date, amount: jrn.total, issue: `Journal entry ₹${jrn.total.toLocaleString("en-IN")} — bypasses auto-checks`, detail: `Entry ${jrn.entry_number || jrn.id}: "${jrn.notes || "no notes"}". Manual entries bypass TDS/GST engine.`, action: "Review for TDS/GST applicability. Verify approvals and supporting documents." });
  }

  // Overdue bills payable
  for (const bill of fBills) {
    if (bill.balance > 0 && bill.due_date) {
      const days = daysDiff(bill.due_date);
      if (days > 0) findings.push({ id: `BILLOD-${bill.id}`, sev: days > 60 ? "Warning" : "Info", cat: "Payables", party: bill.vendor_name, ref: bill.bill_number, date: bill.date, amount: bill.balance, issue: `Vendor bill overdue ${days}d — ₹${bill.balance.toLocaleString("en-IN")} unpaid`, detail: `Bill ${bill.bill_number} from ${bill.vendor_name} due ${bill.due_date}. Balance ₹${bill.balance.toLocaleString("en-IN")}.`, action: "Process vendor payment. Check if vendor is MSME — 45-day rule under 43B(h) applies." });
    }
  }

  const sevCount = { Critical: findings.filter(f => f.sev === "Critical").length, Warning: findings.filter(f => f.sev === "Warning").length, Info: findings.filter(f => f.sev === "Info").length };
  const totalRevenue = fInvoices.reduce((s, i) => s + i.total, 0);
  const totalExpAmt = fExpenses.reduce((s, e) => s + e.total, 0);
  const totalReceivedAmt = fPayments.reduce((s, p) => s + p.amount, 0);
  const sevStyle: Record<string, { border: string; bg: string; badge: string; text: string }> = {
    Critical: { border: "border-red-200", bg: "bg-red-50", badge: "bg-red-500 text-white", text: "text-red-700" },
    Warning: { border: "border-amber-200", bg: "bg-amber-50", badge: "bg-amber-400 text-black", text: "text-amber-700" },
    Info: { border: "border-sky-200", bg: "bg-sky-50", badge: "bg-sky-500 text-white", text: "text-sky-700" },
  };

  const AUDIT_SECTIONS: { key: AuditSection; label: string }[] = [
    { key: "overview", label: "Overview" }, { key: "customers", label: "Customer Ledger" },
    { key: "so_match", label: "SO ↔ Payment ↔ Invoice" }, { key: "po_match", label: "PO ↔ GRN ↔ Bill ↔ Payment" },
    { key: "gst", label: "GST Summary" }, { key: "tds", label: "TDS Summary" },
    { key: "findings", label: `All Findings (${findings.length})` },
  ];

  if (loading) return <div className="text-center py-20 text-zinc-400">Loading audit data...</div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 flex-wrap border-b border-zinc-200">
        {AUDIT_SECTIONS.map(s => (
          <button key={s.key} onClick={() => { setSection(s.key); try { const p = window.location.hash.replace("#","").split("|"); window.location.hash = `${p[0]}|${p[1]||"audit"}|${s.key}`; } catch {} }}
            className={`text-xs px-3 py-2 whitespace-nowrap border-b-2 -mb-px transition font-medium ${section === s.key ? "border-black text-black" : "border-transparent text-zinc-400 hover:text-zinc-700"}`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* FY / Month Filter */}
      <FYMonthFilter
        dates={[...invoices, ...expenses, ...salesOrders, ...payments, ...bills, ...purchaseOrders, ...vendorPayments].map((i: any) => i.date || "")}
        fy={fy} month={month} onFY={v => { setFy(v); setMonth("All"); }} onMonth={setMonth} />

      {/* Overview */}
      {section === "overview" && (
        <div className="space-y-4">
          {/* MIS Summary */}
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide mb-3">
              MIS Summary {fy !== "All" ? `· ${fy}` : ""}{month !== "All" ? ` · ${new Date(month + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}` : ""}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card label="Total Revenue" value={inr(totalRevenue)} color="text-emerald-600" sub="Sales invoices" />
              <Card label="Total Expenses" value={inr(totalExpAmt)} color="text-red-600" sub="All expenses" />
              <Card label="Total Received" value={inr(totalReceivedAmt)} color="text-blue-600" sub="Customer payments" />
              <Card label="Net Position" value={inr(totalRevenue - totalExpAmt)} color={totalRevenue - totalExpAmt >= 0 ? "text-emerald-600" : "text-red-600"} sub="Revenue − Expenses" />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="Critical Issues" value={String(sevCount.Critical)} color="text-red-600" sub="Immediate action" />
            <Card label="Warnings" value={String(sevCount.Warning)} color="text-amber-600" sub="Review needed" />
            <Card label="Info Flags" value={String(sevCount.Info)} color="text-sky-600" sub="For awareness" />
            <Card label="Total Findings" value={String(findings.length)} sub="All categories" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="Overdue Receivables" value={inr(findings.filter(f => f.cat === "Collections").reduce((s, f) => s + f.amount, 0))} color="text-red-600" />
            <Card label="TDS Exposure" value={inr(fExpenses.reduce((s, e) => { const r = inferTds(e.vendor_name || "", e.account_name || "", e.total); return s + (r ? Math.round(e.total * r.rate / 100) : 0); }, 0))} color="text-violet-600" />
            <Card label="Matching Gaps" value={String(findings.filter(f => f.cat === "Matching").length)} color="text-amber-600" />
            <Card label="Journal Overrides" value={String(fJournals.length)} color="text-orange-600" />
          </div>
          <div className="bg-white border border-zinc-200 rounded-xl p-5">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-4">Findings by Category</p>
            <div className="space-y-2">
              {Array.from(new Set(findings.map(f => f.cat))).map(cat => {
                const catItems = findings.filter(f => f.cat === cat);
                const crit = catItems.filter(f => f.sev === "Critical").length;
                const warn = catItems.filter(f => f.sev === "Warning").length;
                return (
                  <div key={cat} className="flex items-center justify-between py-2 border-b border-zinc-100 last:border-0">
                    <span className="text-sm font-medium text-zinc-700">{cat}</span>
                    <div className="flex items-center gap-2">
                      {crit > 0 && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">{crit} Critical</span>}
                      {warn > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{warn} Warning</span>}
                      <span className="text-xs text-zinc-400">{catItems.length} total</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Customer Ledger */}
      {section === "customers" && (() => {
        const custMap: Record<string, { invoiced: number; received: number; outstanding: number; invCount: number; payCount: number }> = {};
        for (const inv of fInvoices) {
          const k = inv.customer_name;
          if (!custMap[k]) custMap[k] = { invoiced: 0, received: 0, outstanding: 0, invCount: 0, payCount: 0 };
          custMap[k].invoiced += inv.total; custMap[k].outstanding += inv.balance; custMap[k].invCount++;
        }
        for (const pay of fPayments) {
          const k = pay.customer_name;
          if (!custMap[k]) custMap[k] = { invoiced: 0, received: 0, outstanding: 0, invCount: 0, payCount: 0 };
          custMap[k].received += pay.amount; custMap[k].payCount++;
        }
        const custs = Object.entries(custMap).sort((a, b) => b[1].invoiced - a[1].invoiced);
        return (
          <div className="space-y-3">
            {custs.map(([name, c]) => {
              const pct = c.invoiced > 0 ? Math.min(Math.round((c.received / c.invoiced) * 100), 100) : 0;
              const custInvoices = invoices.filter(i => i.customer_name === name);
              const custPayments = payments.filter(p => p.customer_name === name);
              const isOpen = expanded === name;
              return (
                <div key={name} className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                  <div className="p-4 cursor-pointer hover:bg-zinc-50" onClick={() => setExpanded(isOpen ? null : name)}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-semibold text-zinc-900">{name}</p>
                        <div className="grid grid-cols-4 gap-4 mt-2 text-xs">
                          <div><span className="text-zinc-400">Invoiced </span><span className="font-medium">{inr(c.invoiced)}</span></div>
                          <div><span className="text-zinc-400">Received </span><span className="font-medium text-emerald-600">{inr(c.received)}</span></div>
                          <div><span className="text-zinc-400">Outstanding </span><span className={`font-medium ${c.outstanding > 0 ? "text-amber-600" : "text-emerald-600"}`}>{inr(c.outstanding)}</span></div>
                          <div><span className="text-zinc-400">Collection </span><span className="font-medium">{pct}%</span></div>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-1.5 bg-zinc-100 rounded-full"><div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-400" : pct >= 60 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${pct}%` }} /></div>
                        </div>
                      </div>
                      <span className="text-zinc-400 text-xs ml-4">{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t border-zinc-100">
                      {custInvoices.length > 0 && (
                        <div className="px-4 py-3">
                          <p className="text-xs font-semibold text-zinc-500 mb-2">Invoices</p>
                          <Table cols={["Invoice #", "Date", "Due", "Status", "Total", "Balance"]}
                            rows={custInvoices.map(i => [
                              <span className="font-mono text-xs">{i.invoice_number}</span>,
                              fdate(i.date), fdate(i.due_date), <Badge s={i.status} />,
                              fmt(i.total, i.currency_code),
                              <span className={i.balance > 0 ? "font-semibold text-amber-600" : "text-emerald-600"}>{i.balance > 0 ? inr(i.balance) : "Paid"}</span>,
                            ])} />
                        </div>
                      )}
                      {custPayments.length > 0 && (
                        <div className="px-4 py-3 border-t border-zinc-100">
                          <p className="text-xs font-semibold text-zinc-500 mb-2">Payments Received</p>
                          <Table cols={["Receipt #", "Date", "Mode", "Amount"]}
                            rows={custPayments.map(p => [
                              <span className="font-mono text-xs">{p.payment_number}</span>,
                              fdate(p.date),
                              <span className="text-xs bg-zinc-100 px-2 py-0.5 rounded">{p.payment_mode || "—"}</span>,
                              <span className="font-semibold text-emerald-600">{inr(p.amount)}</span>,
                            ])} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {custs.length === 0 && <p className="text-center py-12 text-zinc-400">No customer data</p>}
          </div>
        );
      })()}

      {/* SO Match */}
      {section === "so_match" && (
        <div className="space-y-4">
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 text-xs text-zinc-500">
            <p className="font-semibold text-zinc-700 mb-1">2-Way: SO ↔ Payment received &nbsp;|&nbsp; 3-Way: SO ↔ Payment ↔ Invoice</p>
            <p>Flags: payment received with no invoice · payment exceeds invoiced amount · SO fully delivered but not invoiced</p>
          </div>
          <Table cols={["Customer", "SO #", "SO Value", "Invoiced", "Received", "Gap", "Status"]}
            rows={fSalesOrders.map(so => {
              const k = (so.customer_name || "").toLowerCase();
              const totalInvoiced = (invByCust[k] || []).reduce((s, i) => s + i.total, 0);
              const totalPaid = (payByCust[k] || []).reduce((s, p) => s + p.amount, 0);
              const gap = totalPaid - totalInvoiced;
              const status = totalPaid > 0 && totalInvoiced === 0 ? <span className="text-xs font-bold text-red-600">⚠ No Invoice</span> :
                gap > so.total * 0.1 ? <span className="text-xs font-bold text-amber-600">⚠ Excess Advance</span> :
                totalInvoiced >= so.total * 0.95 ? <span className="text-xs text-emerald-600">✓ Fully Invoiced</span> :
                <span className="text-xs text-zinc-400">Partial</span>;
              return [so.customer_name, <span className="font-mono text-xs">{so.salesorder_number}</span>, inr(so.total), inr(totalInvoiced), inr(totalPaid), <span className={gap > 0 ? "font-semibold text-amber-600" : "text-zinc-400"}>{gap > 0 ? inr(gap) : "—"}</span>, status];
            })} empty="No sales orders" />
        </div>
      )}

      {/* PO Match */}
      {section === "po_match" && (
        <div className="space-y-4">
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 text-xs text-zinc-500">
            <p className="font-semibold text-zinc-700 mb-1">3-Way: PO ↔ GRN ↔ Bill ↔ Payment</p>
            <p>Flags: payment made without bill · GRN done but bill not booked · bill raised without PO</p>
          </div>
          <Table cols={["Vendor", "PO #", "PO Value", "GRN", "Billed", "Bill Value", "Paid", "Status"]}
            rows={purchaseOrders.map(po => {
              const linkedBills = fBills.filter(b => b.purchaseorder_id === po.id || b.vendor_name === po.vendor_name);
              const totalBilled = linkedBills.reduce((s, b) => s + b.total, 0);
              const totalPaid = vendorPayments.filter(vp => vp.vendor_name === po.vendor_name).reduce((s, p) => s + p.amount, 0);
              const status = totalPaid > 0 && linkedBills.length === 0 ? <span className="text-xs font-bold text-red-600">⚠ Paid, No Bill</span> :
                po.received_status === "fully_received" && !po.billed_status ? <span className="text-xs font-bold text-amber-600">⚠ GRN, No Bill</span> :
                totalBilled > 0 && totalPaid >= totalBilled * 0.95 ? <span className="text-xs text-emerald-600">✓ Clear</span> :
                <span className="text-xs text-zinc-400">In Progress</span>;
              return [po.vendor_name, <span className="font-mono text-xs">{po.purchaseorder_number}</span>, inr(po.total), <Badge s={po.received_status || "none"} />, <Badge s={po.billed_status || "none"} />, totalBilled > 0 ? inr(totalBilled) : "—", totalPaid > 0 ? inr(totalPaid) : "—", status];
            })} empty="No purchase orders — sync from Zoho" />
        </div>
      )}

      {/* GST Summary */}
      {section === "gst" && (() => {
        const filtInv = filterByFYMonth(invoices, fy, month);
        const filtExp = filterByFYMonth(expenses, fy, month);
        const monthData: Record<string, { output: number; input: number; blocked: number; b2b: number; b2c: number; invCount: number; expCount: number }> = {};
        for (const inv of filtInv) {
          const m = inv.date?.slice(0, 7) || "unknown";
          if (!monthData[m]) monthData[m] = { output: 0, input: 0, blocked: 0, b2b: 0, b2c: 0, invCount: 0, expCount: 0 };
          monthData[m].output += inv.tax_total;
          if (inv.gst_number) monthData[m].b2b += inv.total; else monthData[m].b2c += inv.total;
          monthData[m].invCount++;
        }
        for (const exp of filtExp) {
          const m = exp.date?.slice(0, 7) || "unknown";
          if (!monthData[m]) monthData[m] = { output: 0, input: 0, blocked: 0, b2b: 0, b2c: 0, invCount: 0, expCount: 0 };
          if (isBlocked(exp.account_name || "", exp.vendor_name || "")) monthData[m].blocked += (exp.tax_total || 0);
          else monthData[m].input += (exp.tax_total || 0);
          monthData[m].expCount++;
        }
        const rows = Object.entries(monthData).sort((a, b) => b[0].localeCompare(a[0]));
        const totOutput = rows.reduce((s, [,d]) => s + d.output, 0);
        const totInput = rows.reduce((s, [,d]) => s + d.input, 0);
        const totBlocked = rows.reduce((s, [,d]) => s + d.blocked, 0);
        return (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
              <p className="font-semibold mb-1">GST Filing Summary — Month-wise</p>
              <p>Output GST (GSTR-1) · Input ITC (GSTR-3B) · Net Payable = Output − ITC · Blocked ITC u/s 17(5) cannot be claimed</p>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <Card label="Total Output GST" value={inr(totOutput)} color="text-red-600" />
              <Card label="Total Input ITC" value={inr(totInput)} color="text-emerald-600" />
              <Card label="Blocked ITC" value={inr(totBlocked)} color="text-amber-600" />
              <Card label="Net GST Payable" value={inr(totOutput - totInput)} color="text-blue-600" />
            </div>
            <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50">
                      {["Month", "FY", "B2B Sales", "B2C Sales", "Output GST", "Input ITC", "Blocked ITC", "Net Payable", "Invoices", "Expenses"].map((c, i) => (
                        <th key={i} className={`px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap ${i > 1 ? "text-right" : "text-left"}`}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(([m, d]) => (
                      <tr key={m} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                        <td className="px-4 py-3 font-semibold text-zinc-900">{new Date(m + "-01").toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</td>
                        <td className="px-4 py-3 text-xs text-zinc-400">{getFY(m + "-01")}</td>
                        <td className="px-4 py-3 text-right text-zinc-600">{inr(d.b2b)}</td>
                        <td className="px-4 py-3 text-right text-zinc-600">{inr(d.b2c)}</td>
                        <td className="px-4 py-3 text-right font-medium text-red-600">{inr(d.output)}</td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-600">{inr(d.input)}</td>
                        <td className="px-4 py-3 text-right text-amber-600">{d.blocked > 0 ? inr(d.blocked) : "—"}</td>
                        <td className="px-4 py-3 text-right font-bold text-blue-600">{inr(d.output - d.input)}</td>
                        <td className="px-4 py-3 text-right text-zinc-400">{d.invCount}</td>
                        <td className="px-4 py-3 text-right text-zinc-400">{d.expCount}</td>
                      </tr>
                    ))}
                    {rows.length > 1 && (
                      <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-bold">
                        <td className="px-4 py-3 text-zinc-900">Total</td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3 text-right">{inr(rows.reduce((s,[,d])=>s+d.b2b,0))}</td>
                        <td className="px-4 py-3 text-right">{inr(rows.reduce((s,[,d])=>s+d.b2c,0))}</td>
                        <td className="px-4 py-3 text-right text-red-600">{inr(totOutput)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600">{inr(totInput)}</td>
                        <td className="px-4 py-3 text-right text-amber-600">{totBlocked > 0 ? inr(totBlocked) : "—"}</td>
                        <td className="px-4 py-3 text-right text-blue-600">{inr(totOutput - totInput)}</td>
                        <td className="px-4 py-3 text-right">{rows.reduce((s,[,d])=>s+d.invCount,0)}</td>
                        <td className="px-4 py-3 text-right">{rows.reduce((s,[,d])=>s+d.expCount,0)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

      {/* TDS Summary */}
      {section === "tds" && (() => {
        const filtExp = filterByFYMonth(expenses, fy, month);
        const filtBills = filterByFYMonth(bills, fy, month);
        const filtVP = filterByFYMonth(vendorPayments, fy, month);
        const filtJrn = filterByFYMonth(journals, fy, month);

        // Bills as TDS source
        const billAsExp: Expense[] = filtBills.map(b => ({
          id: "bill_"+b.id, expense_number: b.bill_number, account_name: b.vendor_name || "Bill",
          vendor_name: b.vendor_name, status: b.status, date: b.date,
          total: b.total, sub_total: b.total, tax_total: 0,
          currency_code: b.currency_code, description: null,
        } as Expense));

        // Vendor payments as TDS source
        const vpAsExp: Expense[] = filtVP.map(vp => ({
          id: "vp_"+vp.id, expense_number: vp.payment_number || vp.id, account_name: "Vendor Payment",
          vendor_name: vp.vendor_name, status: "paid", date: vp.date,
          total: vp.amount, sub_total: vp.amount, tax_total: 0,
          currency_code: vp.currency_code, description: null,
        } as Expense));

        // Journal debit lines as TDS source
        const jrnAsExp: Expense[] = filtJrn.flatMap(j => {
          try {
            const lines = JSON.parse(j.line_items || "[]");
            return lines
              .filter((l: any) => (l.debit_or_credit === "debit" || Number(l.debit || 0) > 0) && Number(l.amount || l.debit || 0) > 0)
              .map((l: any) => ({
                id: "jrn_"+j.id+"_"+(l.account_name||""), expense_number: j.entry_number || j.id,
                account_name: l.account_name || "", vendor_name: l.contact_name || l.customer_name || "",
                status: "published", date: j.journal_date,
                total: Number(l.amount || l.debit || 0), sub_total: Number(l.amount || l.debit || 0),
                tax_total: 0, currency_code: j.currency_code || "INR",
                description: j.notes,
              } as Expense));
          } catch { return []; }
        });

        // Combine all sources - deduplicate by vendor+amount+date
        const seen = new Set<string>();
        const allSources = [...filtExp, ...billAsExp, ...vpAsExp, ...jrnAsExp].filter(e => {
          const key = `${e.vendor_name}|${e.total}|${e.date}|${e.account_name}`;
          if (seen.has(key)) return false;
          seen.add(key); return true;
        });

        const tdsItems = allSources.map(exp => {
          const rule = inferTds(exp.vendor_name || "", exp.account_name || "", exp.total);
          if (!rule) return null;
          return { exp, rule, expectedTds: Math.round(exp.total * rule.rate / 100) };
        }).filter(Boolean) as { exp: Expense; rule: typeof TDS[0]; expectedTds: number }[];

        // Month-wise TDS breakdown
        const byMonth: Record<string, { count: number; total: number; tds: number; fy: string }> = {};
        for (const t of tdsItems) {
          const m = t.exp.date?.slice(0, 7) || "unknown";
          if (!byMonth[m]) byMonth[m] = { count: 0, total: 0, tds: 0, fy: getFY(t.exp.date || "") };
          byMonth[m].count++; byMonth[m].total += t.exp.total; byMonth[m].tds += t.expectedTds;
        }

        // Section-wise TDS breakdown
        const bySec: Record<string, { count: number; total: number; tds: number }> = {};
        for (const t of tdsItems) {
          if (!bySec[t.rule.sec]) bySec[t.rule.sec] = { count: 0, total: 0, tds: 0 };
          bySec[t.rule.sec].count++; bySec[t.rule.sec].total += t.exp.total; bySec[t.rule.sec].tds += t.expectedTds;
        }
        const monthRows = Object.entries(byMonth).sort((a, b) => b[0].localeCompare(a[0]));
        const totTds = tdsItems.reduce((s, t) => s + t.expectedTds, 0);

        return (
          <div className="space-y-5">
            <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-xs text-violet-700">
              <p className="font-semibold mb-1">TDS Summary — for Form 26Q / 27Q Quarterly Filing</p>
              <p>Estimated TDS liability inferred from vendor name + account head + amount threshold. Deposit by 7th of next month (March: 30 Apr) via ITNS 281.</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Card label="Total TDS Liability" value={inr(totTds)} color="text-violet-600" />
              <Card label="Transactions Liable" value={String(tdsItems.length)} />
              <Card label="Quarters in Period" value={String(new Set(tdsItems.map(t => { const d = new Date(t.exp.date); const q = Math.floor((d.getMonth() - 3 + 12) % 12 / 3); return `${getFY(t.exp.date)}-Q${q+1}`; })).size)} />
            </div>

            {/* Month-wise column view */}
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Month-wise TDS</p>
              <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50">
                        {["Month", "FY", "Quarter", "Transactions", "Expense Total", "TDS Liability", "Deposit Due"].map((c, i) => (
                          <th key={i} className={`px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wide whitespace-nowrap ${i > 1 ? "text-right" : "text-left"}`}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {monthRows.map(([m, d]) => {
                        const dt = new Date(m + "-01");
                        const qNum = Math.floor((dt.getMonth() - 3 + 12) % 12 / 3) + 1;
                        const depositDue = dt.getMonth() === 2 ? "30 Apr" : new Date(dt.getFullYear(), dt.getMonth() + 1, 7).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
                        return (
                          <tr key={m} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50">
                            <td className="px-4 py-3 font-semibold">{dt.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</td>
                            <td className="px-4 py-3 text-xs text-zinc-400">{d.fy}</td>
                            <td className="px-4 py-3 text-right"><span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">Q{qNum}</span></td>
                            <td className="px-4 py-3 text-right text-zinc-600">{d.count}</td>
                            <td className="px-4 py-3 text-right text-zinc-600">{inr(d.total)}</td>
                            <td className="px-4 py-3 text-right font-bold text-violet-600">{inr(d.tds)}</td>
                            <td className="px-4 py-3 text-right text-xs font-medium text-zinc-500">{depositDue}</td>
                          </tr>
                        );
                      })}
                      {monthRows.length > 1 && (
                        <tr className="border-t-2 border-zinc-300 bg-zinc-50 font-bold">
                          <td className="px-4 py-3">Total</td>
                          <td className="px-4 py-3"></td>
                          <td className="px-4 py-3"></td>
                          <td className="px-4 py-3 text-right">{tdsItems.length}</td>
                          <td className="px-4 py-3 text-right">{inr(tdsItems.reduce((s,t)=>s+t.exp.total,0))}</td>
                          <td className="px-4 py-3 text-right text-violet-600">{inr(totTds)}</td>
                          <td className="px-4 py-3"></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Section-wise TDS */}
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Section-wise TDS</p>
              <Table cols={["Section", "Transactions", "Expense Total", "TDS @Rate"]}
                rows={Object.entries(bySec).map(([sec, d]) => {
                  const rule = TDS.find(r => r.sec === sec)!;
                  return [<span className="font-semibold">{rule.label}</span>, String(d.count), inr(d.total), <span className="font-bold text-violet-600">{inr(d.tds)}</span>];
                })} empty="No TDS liability found" />
            </div>

            {/* Editable Transaction Detail */}
            <EditableTDSTable items={tdsItems} orgId={orgId} />
          </div>
        );
      })()}

      {/* All Findings */}
      {section === "findings" && (
        <div className="space-y-3">
          {["Critical", "Warning", "Info"].map(sev =>
            findings.filter(f => f.sev === sev).map(f => {
              const s = sevStyle[f.sev];
              const isOpen = expanded === f.id;
              return (
                <div key={f.id} onClick={() => setExpanded(isOpen ? null : f.id)} className={`rounded-xl border ${s.border} ${s.bg} cursor-pointer`}>
                  <div className="flex items-start gap-3 p-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.badge}`}>{f.sev}</span>
                        <span className="text-xs text-zinc-400">{f.cat}</span>
                        <span className="text-xs text-zinc-300 ml-auto">{f.date}</span>
                      </div>
                      <p className={`font-semibold text-sm ${s.text}`}>{f.issue}</p>
                      <p className="text-xs text-zinc-400 mt-0.5">{f.party} · ₹{f.amount.toLocaleString("en-IN")}</p>
                    </div>
                    <span className="text-zinc-400 text-xs select-none">{isOpen ? "▲" : "▼"}</span>
                  </div>
                  {isOpen && (
                    <div className="border-t border-zinc-200 px-4 pb-4 pt-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-zinc-400">Ref </span><span className="font-mono text-zinc-700">{f.ref}</span></div>
                        <div><span className="text-zinc-400">Amount </span><span className="font-bold">₹{f.amount.toLocaleString("en-IN")}</span></div>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-xs text-zinc-600 border border-zinc-100">{f.detail}</div>
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-700"><span className="font-bold block mb-0.5">▶ Action Required</span>{f.action}</div>
                    </div>
                  )}
                </div>
              );
            })
          )}
          {findings.length === 0 && <div className="text-center py-12 text-zinc-400"><p className="text-4xl mb-3">✓</p><p className="font-medium">No issues found</p></div>}
        </div>
      )}
    </div>
  );
}


// ─── CLIENT SUMMARY (Presentation-ready one-pager) ───────────────────────────
function ClientSummaryReport({ orgId, clientName }: { orgId: string; clientName: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [fy, setFy] = useState("All");
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  useEffect(() => {
    Promise.all([
      supabase.from("finance_dashboard").select("*").eq("org_id", orgId),
      supabase.from("payments").select("*").eq("org_id", orgId),
      supabase.from("expenses").select("*").eq("org_id", orgId),
      supabase.from("bills").select("*").eq("org_id", orgId),
    ]).then(([inv, pay, exp, bil]) => {
      setInvoices(inv.data || []); setPayments(pay.data || []);
      setExpenses(exp.data || []); setBills(bil.data || []);
      setLoading(false);
    });
  }, [orgId]);

  const fInv = filterByFYMonth(invoices, fy, "All");
  const fPay = filterByFYMonth(payments, fy, "All");
  const fExp = filterByFYMonth(expenses, fy, "All");
  const fBil = filterByFYMonth(bills, fy, "All");
  const fys = getAvailableFYs([...invoices.map(i=>i.date), ...expenses.map(e=>e.date)]);

  const turnover = fInv.reduce((s,i)=>s+i.total,0);
  const collected = fPay.reduce((s,p)=>s+p.amount,0);
  const outstanding = fInv.reduce((s,i)=>s+i.balance,0);
  const gstOutput = fInv.reduce((s,i)=>s+i.tax_total,0);
  const gstInput = fExp.filter(e=>!isBlocked(e.account_name||"",e.vendor_name||"")).reduce((s,e)=>s+(e.tax_total||0),0);
  const tdsLiability = fExp.reduce((s,e)=>{ const r=inferTds(e.vendor_name||"",e.account_name||"",e.total); return s+(r?Math.round(e.total*r.rate/100):0); },0);
  const overdueInv = fInv.filter(i=>i.balance>0&&i.due_date&&new Date(i.due_date)<new Date());
  const overdueAmt = overdueInv.reduce((s,i)=>s+i.balance,0);
  const totalExpenses = fExp.reduce((s,e)=>s+e.total,0);
  const billsOutstanding = fBil.reduce((s,b)=>s+b.balance,0);

  // Aging buckets
  const aging = { d30:0, d60:0, d90:0, d90p:0 };
  for (const inv of fInv.filter(i=>i.balance>0&&i.due_date)) {
    const days = Math.floor((new Date().getTime()-new Date(inv.due_date).getTime())/86400000);
    if (days<=0) continue;
    if (days<=30) aging.d30+=inv.balance;
    else if (days<=60) aging.d60+=inv.balance;
    else if (days<=90) aging.d90+=inv.balance;
    else aging.d90p+=inv.balance;
  }

  const compStatus = [
    { label: "GSTR-1", status: gstOutput > 0 ? "Due" : "NA", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
    { label: "GSTR-3B", status: gstOutput - gstInput > 0 ? `₹${(gstOutput-gstInput).toLocaleString("en-IN")} payable` : "Nil", color: gstOutput-gstInput>0?"text-red-600":"text-emerald-600", bg: gstOutput-gstInput>0?"bg-red-50":"bg-emerald-50", border: gstOutput-gstInput>0?"border-red-200":"border-emerald-200" },
    { label: "TDS (26Q)", status: tdsLiability > 0 ? `₹${tdsLiability.toLocaleString("en-IN")} liability` : "Nil", color: tdsLiability>0?"text-violet-600":"text-emerald-600", bg: tdsLiability>0?"bg-violet-50":"bg-emerald-50", border: tdsLiability>0?"border-violet-200":"border-emerald-200" },
    { label: "Receivables", status: overdueAmt > 0 ? `₹${overdueAmt.toLocaleString("en-IN")} overdue` : "Clear", color: overdueAmt>0?"text-red-600":"text-emerald-600", bg: overdueAmt>0?"bg-red-50":"bg-emerald-50", border: overdueAmt>0?"border-red-200":"border-emerald-200" },
    { label: "Payables", status: billsOutstanding > 0 ? `₹${billsOutstanding.toLocaleString("en-IN")} due` : "Clear", color: billsOutstanding>0?"text-amber-600":"text-emerald-600", bg: billsOutstanding>0?"bg-amber-50":"bg-emerald-50", border: billsOutstanding>0?"border-amber-200":"border-emerald-200" },
  ];

  if (loading) return <div className="text-center py-20 text-zinc-400">Preparing report...</div>;

  return (
    <div className="space-y-6">
      {/* FY selector */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-zinc-500">Financial Year:</span>
        <select value={fy} onChange={e=>setFy(e.target.value)} className="text-sm border border-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-black bg-white font-medium">
          {fys.map(f=><option key={f} value={f}>{f}</option>)}
        </select>
        <span className="text-xs text-zinc-400 ml-2">Prepared by {COMPANY_NAME} · {today}</span>
      </div>

      {/* Header */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="text-xs text-zinc-400 uppercase tracking-widest mb-1">Client Report</p>
            <h2 className="text-2xl font-black text-zinc-900">{clientName}</h2>
            <p className="text-sm text-zinc-500 mt-0.5">{fy !== "All" ? fy : "All Years"} · As of {today}</p>
          </div>
          <img src={COMPANY_LOGO} alt="CA" className="h-12 w-auto" />
        </div>

        {/* Key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total Turnover", value: inr(turnover), color: "text-zinc-900", icon: "📈" },
            { label: "Collected", value: inr(collected), color: "text-emerald-600", icon: "✅" },
            { label: "Outstanding", value: inr(outstanding), color: outstanding>0?"text-amber-600":"text-emerald-600", icon: "⏳" },
            { label: "Total Expenses", value: inr(totalExpenses), color: "text-red-600", icon: "📤" },
          ].map(m => (
            <div key={m.label} className="bg-zinc-50 rounded-xl p-4">
              <p className="text-lg mb-1">{m.icon}</p>
              <p className="text-xs text-zinc-400 uppercase tracking-wide">{m.label}</p>
              <p className={`text-xl font-bold mt-0.5 ${m.color}`}>{m.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* GST Position */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-zinc-900 mb-4">GST Position</h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-red-50 border border-red-100 rounded-xl p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Output GST (Sales)</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{inr(gstOutput)}</p>
            <p className="text-xs text-zinc-400 mt-1">Collected from customers</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Input ITC (Purchases)</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{inr(gstInput)}</p>
            <p className="text-xs text-zinc-400 mt-1">Eligible credit</p>
          </div>
          <div className={`${gstOutput-gstInput>0?"bg-amber-50 border-amber-100":"bg-emerald-50 border-emerald-100"} border rounded-xl p-4`}>
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Net Payable</p>
            <p className={`text-2xl font-bold mt-1 ${gstOutput-gstInput>0?"text-amber-600":"text-emerald-600"}`}>{inr(Math.max(0,gstOutput-gstInput))}</p>
            <p className="text-xs text-zinc-400 mt-1">{gstOutput-gstInput>0?"To be deposited":"Surplus ITC"}</p>
          </div>
        </div>
        {/* Monthly GST table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-200 text-zinc-400 uppercase tracking-wide">
              <th className="text-left py-2 pr-4">Month</th>
              <th className="text-right py-2 pr-4">Output</th>
              <th className="text-right py-2 pr-4">Input ITC</th>
              <th className="text-right py-2">Net Payable</th>
            </tr></thead>
            <tbody>
              {(() => {
                const months: Record<string,{out:number;inp:number}> = {};
                for (const inv of fInv) { const m=inv.date?.slice(0,7)||""; if(!months[m]) months[m]={out:0,inp:0}; months[m].out+=inv.tax_total; }
                for (const exp of fExp) { const m=exp.date?.slice(0,7)||""; if(!months[m]) months[m]={out:0,inp:0}; if(!isBlocked(exp.account_name||"",exp.vendor_name||"")) months[m].inp+=(exp.tax_total||0); }
                return Object.entries(months).sort((a,b)=>b[0].localeCompare(a[0])).map(([m,d])=>(
                  <tr key={m} className="border-b border-zinc-50 hover:bg-zinc-50">
                    <td className="py-2 pr-4 font-medium">{new Date(m+"-01").toLocaleDateString("en-IN",{month:"short",year:"numeric"})}</td>
                    <td className="py-2 pr-4 text-right text-red-600">{inr(d.out)}</td>
                    <td className="py-2 pr-4 text-right text-emerald-600">{inr(d.inp)}</td>
                    <td className={`py-2 text-right font-bold ${d.out-d.inp>0?"text-amber-600":"text-emerald-600"}`}>{inr(d.out-d.inp)}</td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receivables Aging */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-zinc-900 mb-4">Receivables Aging</h3>
        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: "1–30 Days", value: aging.d30, color: "text-amber-500" },
            { label: "31–60 Days", value: aging.d60, color: "text-orange-500" },
            { label: "61–90 Days", value: aging.d90, color: "text-red-500" },
            { label: "90+ Days", value: aging.d90p, color: "text-red-700" },
          ].map(a => (
            <div key={a.label} className="bg-zinc-50 rounded-xl p-3 text-center">
              <p className="text-xs text-zinc-400 mb-1">{a.label}</p>
              <p className={`text-lg font-bold ${a.color}`}>{inr(a.value)}</p>
            </div>
          ))}
        </div>
        {overdueInv.length > 0 ? (
          <table className="w-full text-xs">
            <thead><tr className="border-b border-zinc-200 text-zinc-400 uppercase tracking-wide">
              <th className="text-left py-2 pr-3">Invoice</th>
              <th className="text-left py-2 pr-3">Customer</th>
              <th className="text-left py-2 pr-3">Due Date</th>
              <th className="text-right py-2 pr-3">Days</th>
              <th className="text-right py-2">Outstanding</th>
            </tr></thead>
            <tbody>
              {overdueInv.sort((a,b)=>new Date(a.due_date).getTime()-new Date(b.due_date).getTime()).map(inv=>{
                const days=Math.floor((new Date().getTime()-new Date(inv.due_date).getTime())/86400000);
                const color=days>90?"text-red-700":days>60?"text-red-500":days>30?"text-orange-500":"text-amber-500";
                return (
                  <tr key={inv.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                    <td className="py-2 pr-3 font-mono">{inv.invoice_number}</td>
                    <td className="py-2 pr-3">{inv.customer_name}</td>
                    <td className="py-2 pr-3">{fdate(inv.due_date)}</td>
                    <td className={`py-2 pr-3 text-right font-bold ${color}`}>{days}d</td>
                    <td className="py-2 text-right font-bold text-red-600">{inr(inv.balance)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="text-center py-4 text-emerald-600 font-medium">✓ No overdue receivables</p>}
      </div>

      {/* TDS Tracker */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-zinc-900 mb-4">TDS Tracker</h3>
        {tdsLiability > 0 ? (
          <>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-violet-50 border border-violet-100 rounded-xl p-4">
                <p className="text-xs text-zinc-500 uppercase">Total TDS Liability</p>
                <p className="text-2xl font-bold text-violet-600 mt-1">{inr(tdsLiability)}</p>
              </div>
              <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-4">
                <p className="text-xs text-zinc-500 uppercase">Transactions Liable</p>
                <p className="text-2xl font-bold mt-1">{fExp.filter(e=>inferTds(e.vendor_name||"",e.account_name||"",e.total)).length}</p>
              </div>
            </div>
            <table className="w-full text-xs">
              <thead><tr className="border-b border-zinc-200 text-zinc-400 uppercase tracking-wide">
                <th className="text-left py-2 pr-3">Vendor</th>
                <th className="text-left py-2 pr-3">Account</th>
                <th className="text-left py-2 pr-3">Date</th>
                <th className="text-left py-2 pr-3">Section</th>
                <th className="text-right py-2 pr-3">Amount</th>
                <th className="text-right py-2">TDS Due</th>
              </tr></thead>
              <tbody>
                {fExp.map(e=>{ const r=inferTds(e.vendor_name||"",e.account_name||"",e.total); if(!r) return null;
                  return <tr key={e.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                    <td className="py-2 pr-3">{e.vendor_name||"—"}</td>
                    <td className="py-2 pr-3 text-zinc-400">{e.account_name||"—"}</td>
                    <td className="py-2 pr-3">{fdate(e.date)}</td>
                    <td className="py-2 pr-3"><span className="bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded font-mono font-bold">{r.sec}</span></td>
                    <td className="py-2 pr-3 text-right">{inr(e.total)}</td>
                    <td className="py-2 text-right font-bold text-violet-600">{inr(Math.round(e.total*r.rate/100))}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </>
        ) : <p className="text-center py-4 text-emerald-600 font-medium">✓ No TDS liability found</p>}
      </div>

      {/* Compliance Status */}
      <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-zinc-900 mb-4">Compliance Status</h3>
        <div className="grid grid-cols-1 gap-3">
          {compStatus.map(c=>(
            <div key={c.label} className={`flex items-center justify-between p-4 rounded-xl border ${c.bg} ${c.border}`}>
              <span className="font-semibold text-zinc-700">{c.label}</span>
              <span className={`text-sm font-bold ${c.color}`}>{c.status}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 p-4 bg-zinc-50 rounded-xl text-xs text-zinc-500">
          <p className="font-semibold text-zinc-700 mb-2">Important Deadlines</p>
          <div className="grid grid-cols-2 gap-2">
            {[["GSTR-1","11th of next month"],["GSTR-3B","20th of next month"],["TDS Deposit","7th of next month"],["Form 26Q","15th after quarter end"],["Advance Tax","15 Jun / 15 Sep / 15 Dec / 15 Mar"],["IT Return","31st October"]].map(([f,d])=>(
              <div key={f} className="flex items-center justify-between border-b border-zinc-100 pb-1">
                <span className="font-medium text-zinc-600">{f}</span>
                <span className="text-zinc-400">{d}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Compliance Module ────────────────────────────────────────────────────────
function ComplianceModule({ orgId, clientName, initSection = "" }: { orgId: string; clientName: string; initSection?: string }) {
  const [section, setSection] = useState<CompSection>(() => {
    const valid = ["summary","gst_filing","tds_filing","pt_pf","it_filing"];
    return (initSection && valid.includes(initSection) ? initSection : "client_report") as CompSection;
  });
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [fy, setFy] = useState("All");
  const [month, setMonth] = useState("All");

  useEffect(() => {
    Promise.all([
      supabase.from("finance_dashboard").select("*").eq("org_id", orgId),
      supabase.from("expenses").select("*").eq("org_id", orgId),
    ]).then(([inv, exp]) => {
      setInvoices(inv.data || []); setExpenses(exp.data || []); setLoading(false);
    });
  }, [orgId]);

  const COMP_SECTIONS: { key: CompSection; label: string }[] = [
    { key: "client_report", label: "📊 Client Report" },
    { key: "summary", label: "Summary" },
    { key: "gst_filing", label: "GST Filing" },
    { key: "tds_filing", label: "TDS Filing" },
    { key: "pt_pf", label: "PT / PF" },
    { key: "it_filing", label: "IT Filing" },
  ];

  if (loading) return <div className="text-center py-20 text-zinc-400">Loading compliance data...</div>;

  const filtInvoices = filterByFYMonth(invoices, fy, month);
  const filtExpenses = filterByFYMonth(expenses, fy, month);
  const totalSales = filtInvoices.reduce((s, i) => s + i.total, 0);
  const totalGstOutput = filtInvoices.reduce((s, i) => s + i.tax_total, 0);
  const totalGstInput = filtExpenses.filter(e => !isBlocked(e.account_name || "", e.vendor_name || "")).reduce((s, e) => s + (e.tax_total || 0), 0);
  const tdsItems = filtExpenses.filter(e => inferTds(e.vendor_name || "", e.account_name || "", e.total));
  const totalTdsLiability = tdsItems.reduce((s, e) => { const r = inferTds(e.vendor_name || "", e.account_name || "", e.total); return s + (r ? Math.round(e.total * r.rate / 100) : 0); }, 0);
  const overdueInvoices = filtInvoices.filter(i => i.balance > 0 && i.due_date && daysDiff(i.due_date) > 0);
  const missingIRN = filtInvoices.filter(i => i.total >= 500000 && !i.reference_number);
  const missingGSTIN = filtInvoices.filter(i => !i.gst_number && i.tax_total > 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 flex-wrap border-b border-zinc-200">
        {COMP_SECTIONS.map(s => (
          <button key={s.key} onClick={() => { setSection(s.key); try { const p = window.location.hash.replace("#","").split("|"); window.location.hash = `${p[0]}|${p[1]||"compliance"}|${s.key}`; } catch {} }}
            className={`text-xs px-3 py-2 whitespace-nowrap border-b-2 -mb-px transition font-medium ${section === s.key ? "border-black text-black" : "border-transparent text-zinc-400 hover:text-zinc-700"}`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* FY / Month Filter */}
      <FYMonthFilter
        dates={[...invoices, ...expenses].map(i => (i as any).date || "")}
        fy={fy} month={month} onFY={v => { setFy(v); setMonth("All"); }} onMonth={setMonth} />

      {section === "client_report" && <ClientSummaryReport orgId={orgId} clientName={clientName} />}

      {section === "summary" && (
        <div className="space-y-6">
          <div className="bg-white border border-zinc-200 rounded-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-lg font-bold text-zinc-900">{clientName}</p>
                <p className="text-sm text-zinc-400">Compliance Summary — {new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</p>
                <p className="text-xs text-zinc-400 mt-0.5">Prepared by {COMPANY_NAME}</p>
              </div>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${missingIRN.length > 0 || overdueInvoices.length > 3 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                {missingIRN.length > 0 || overdueInvoices.length > 3 ? "Action Required" : "Generally Compliant"}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="border border-zinc-100 rounded-lg p-3">
                <p className="text-xs text-zinc-400 mb-1">Total Turnover</p>
                <p className="text-lg font-bold">{inr(totalSales)}</p>
              </div>
              <div className="border border-zinc-100 rounded-lg p-3">
                <p className="text-xs text-zinc-400 mb-1">GST Output</p>
                <p className="text-lg font-bold text-red-600">{inr(totalGstOutput)}</p>
              </div>
              <div className="border border-zinc-100 rounded-lg p-3">
                <p className="text-xs text-zinc-400 mb-1">GST Input (ITC)</p>
                <p className="text-lg font-bold text-emerald-600">{inr(totalGstInput)}</p>
              </div>
              <div className="border border-zinc-100 rounded-lg p-3">
                <p className="text-xs text-zinc-400 mb-1">Net GST Payable</p>
                <p className="text-lg font-bold text-blue-600">{inr(totalGstOutput - totalGstInput)}</p>
              </div>
              <div className="border border-zinc-100 rounded-lg p-3">
                <p className="text-xs text-zinc-400 mb-1">TDS Liability</p>
                <p className="text-lg font-bold text-violet-600">{inr(totalTdsLiability)}</p>
              </div>
              <div className="border border-zinc-100 rounded-lg p-3">
                <p className="text-xs text-zinc-400 mb-1">Overdue Receivables</p>
                <p className="text-lg font-bold text-amber-600">{inr(overdueInvoices.reduce((s, i) => s + i.balance, 0))}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Key Compliance Alerts</p>
            {missingIRN.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="font-semibold text-red-700 text-sm">⚠ {missingIRN.length} invoice(s) above ₹5L missing IRN/e-Invoice</p>
                <p className="text-xs text-red-600 mt-1">Invoices: {missingIRN.map(i => i.invoice_number).join(", ")}</p>
                <p className="text-xs text-red-500 mt-1">Action: Generate IRN from IRP portal. These invoices are invalid for buyer ITC without IRN.</p>
              </div>
            )}
            {missingGSTIN.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="font-semibold text-amber-700 text-sm">⚠ {missingGSTIN.length} B2B invoice(s) missing customer GSTIN</p>
                <p className="text-xs text-amber-600 mt-1">Action: Collect GSTIN from customers before next GSTR-1 filing.</p>
              </div>
            )}
            {totalTdsLiability > 0 && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                <p className="font-semibold text-violet-700 text-sm">⚠ Estimated TDS liability ₹{totalTdsLiability.toLocaleString("en-IN")} on {tdsItems.length} transaction(s)</p>
                <p className="text-xs text-violet-600 mt-1">Action: Deduct TDS before vendor payments. Deposit by 7th of following month. File Form 26Q quarterly.</p>
              </div>
            )}
            {overdueInvoices.length === 0 && missingIRN.length === 0 && missingGSTIN.length === 0 && totalTdsLiability === 0 && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <p className="font-semibold text-emerald-700 text-sm">✓ No major compliance issues identified</p>
                <p className="text-xs text-emerald-600 mt-1">Continue regular monitoring and ensure timely GST/TDS filings.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {section === "gst_filing" && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
            <p className="font-semibold text-sm mb-2">GST Filing Checklist</p>
            <div className="grid grid-cols-2 gap-2">
              {[["GSTR-1", "11th of next month", "Outward supplies"], ["GSTR-3B", "20th of next month", "Summary + payment"], ["GSTR-2A/2B", "Auto-populated", "ITC reconciliation"], ["GSTR-9", "31st Dec", "Annual return"]].map(([form, due, desc]) => (
                <div key={form} className="bg-white rounded-lg p-2 border border-blue-100">
                  <p className="font-bold text-blue-800">{form}</p>
                  <p className="text-blue-600">Due: {due}</p>
                  <p className="text-blue-400">{desc}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Card label="Output GST (GSTR-1)" value={inr(totalGstOutput)} color="text-red-600" sub="Collected from customers" />
            <Card label="Input GST (ITC)" value={inr(totalGstInput)} color="text-emerald-600" sub="Eligible for set-off" />
            <Card label="Net Payable" value={inr(Math.max(0, totalGstOutput - totalGstInput))} color="text-blue-600" sub="To be deposited" />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Monthly GST Summary</p>
            <Table cols={["Month", "Sales (B2B)", "Sales (B2C)", "Output GST", "Input GST", "Net Payable"]}
              rows={(() => {
                const months: Record<string, { b2b: number; b2c: number; output: number; input: number }> = {};
                for (const inv of filtInvoices) {
                  const m = inv.date?.slice(0, 7) || "";
                  if (!months[m]) months[m] = { b2b: 0, b2c: 0, output: 0, input: 0 };
                  if (inv.gst_number) months[m].b2b += inv.total; else months[m].b2c += inv.total;
                  months[m].output += inv.tax_total;
                }
                for (const exp of filtExpenses) {
                  const m = exp.date?.slice(0, 7) || "";
                  if (!months[m]) months[m] = { b2b: 0, b2c: 0, output: 0, input: 0 };
                  if (!isBlocked(exp.account_name || "", exp.vendor_name || "")) months[m].input += (exp.tax_total || 0);
                }
                return Object.entries(months).sort((a, b) => b[0].localeCompare(a[0])).map(([m, d]) => [
                  <span className="font-semibold">{m}</span>, inr(d.b2b), inr(d.b2c),
                  <span className="text-red-600">{inr(d.output)}</span>,
                  <span className="text-emerald-600">{inr(d.input)}</span>,
                  <span className="font-bold">{inr(d.output - d.input)}</span>,
                ]);
              })()} empty="No data" />
          </div>
        </div>
      )}

      {section === "tds_filing" && (
        <div className="space-y-4">
          <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 text-xs text-violet-700">
            <p className="font-semibold text-sm mb-2">TDS Filing Checklist</p>
            <div className="grid grid-cols-2 gap-2">
              {[["Form 26Q", "Quarterly (Jul/Oct/Jan/May)", "TDS on payments to residents"], ["Form 27Q", "Quarterly", "TDS on NRI payments"], ["Form 16A", "15 days after Q-end", "TDS certificate to deductee"], ["ITNS 281", "7th of next month (Mar: 30 Apr)", "Monthly TDS deposit challan"]].map(([form, due, desc]) => (
                <div key={form} className="bg-white rounded-lg p-2 border border-violet-100">
                  <p className="font-bold text-violet-800">{form}</p>
                  <p className="text-violet-600">Due: {due}</p>
                  <p className="text-violet-400">{desc}</p>
                </div>
              ))}
            </div>
          </div>
          <Card label="Total TDS to Deduct & Deposit" value={inr(totalTdsLiability)} color="text-violet-600" sub={`${tdsItems.length} transactions liable`} />
          <Table cols={["Section", "Vendor", "Account", "Expense", "Rate", "TDS Due", "Deposit By"]}
            rows={tdsItems.map(e => {
              const rule = inferTds(e.vendor_name || "", e.account_name || "", e.total)!;
              const tds = Math.round(e.total * rule.rate / 100);
              const d = new Date(e.date);
              const dueDate = d.getMonth() === 2 ? "30 Apr" : new Date(d.getFullYear(), d.getMonth() + 1, 7).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
              return [
                <span className="font-mono text-xs font-bold text-violet-700">{rule.sec}</span>,
                e.vendor_name || "—", <span className="text-xs">{e.account_name || "—"}</span>,
                inr(e.total), `${rule.rate}%`,
                <span className="font-bold text-violet-600">{inr(tds)}</span>,
                <span className="text-xs font-medium text-zinc-500">{dueDate}</span>,
              ];
            })} empty="No TDS liability found" />
        </div>
      )}

      {section === "pt_pf" && (
        <div className="space-y-4">
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-5">
            <p className="font-semibold text-zinc-700 mb-3">Professional Tax (PT) & Provident Fund (PF)</p>
            <div className="space-y-3 text-sm text-zinc-600">
              <div className="flex gap-3 p-3 bg-white border border-zinc-100 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 flex-shrink-0"></div>
                <div>
                  <p className="font-semibold text-zinc-800">Professional Tax (PT)</p>
                  <p className="text-xs mt-0.5">Monthly deduction from employee salary. Rate varies by state. Maharashtra: up to ₹200/month. Due by last day of following month.</p>
                  <p className="text-xs text-amber-600 mt-1">⚠ Requires payroll data — connect payroll system or enter manually to enable auto-calculation.</p>
                </div>
              </div>
              <div className="flex gap-3 p-3 bg-white border border-zinc-100 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 flex-shrink-0"></div>
                <div>
                  <p className="font-semibold text-zinc-800">Provident Fund (PF / EPF)</p>
                  <p className="text-xs mt-0.5">12% of basic salary from employee + 12% employer contribution. ECR filing by 15th of next month. Applicable if 20+ employees.</p>
                  <p className="text-xs text-blue-600 mt-1">⚠ Requires payroll data. Once payroll is synced, PF liability, ECR filing, and monthly challan amounts will auto-populate here.</p>
                </div>
              </div>
              <div className="flex gap-3 p-3 bg-white border border-zinc-100 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-purple-400 mt-1.5 flex-shrink-0"></div>
                <div>
                  <p className="font-semibold text-zinc-800">ESI (Employee State Insurance)</p>
                  <p className="text-xs mt-0.5">3.25% employer + 0.75% employee on gross salary ≤ ₹21,000/month. Monthly challan by 15th.</p>
                  <p className="text-xs text-purple-600 mt-1">⚠ Requires payroll data to enable.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {section === "it_filing" && (
        <div className="space-y-4">
          <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-5">
            <p className="font-semibold text-zinc-700 mb-4">Income Tax Filing Summary</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Card label={`Total Revenue (${fy !== "All" ? fy : "All FY"}${month !== "All" ? " · " + month : ""})`} value={inr(totalSales)} />
              <Card label="Total Expenses" value={inr(filtExpenses.reduce((s, e) => s + e.total, 0))} color="text-red-600" />
              <Card label="Net Profit (Indicative)" value={inr(totalSales - filtExpenses.reduce((s, e) => s + e.total, 0))} color="text-emerald-600" />
              <Card label="TDS Deducted (as deductee)" value={inr(0)} sub="Add from Form 26AS" />
            </div>
            <div className="space-y-3 text-sm">
              {[
                { form: "ITR-6 / ITR-3", due: "31st Oct (companies/LLPs with audit)", desc: "File income tax return. Attach audit report u/s 44AB if applicable." },
                { form: "Form 3CA/3CB + 3CD", due: "30th Sep (audit cases)", desc: "Tax audit report if turnover exceeds ₹1 Cr (business) / ₹50L (professional)." },
                { form: "Advance Tax", due: "Jun 15% · Sep 45% · Dec 75% · Mar 100%", desc: "If estimated tax liability &gt; ₹10,000. Interest u/s 234B/234C if missed." },
                { form: "Form 26AS / AIS", due: "Verify before filing", desc: "Reconcile TDS credits, advance tax paid, and high-value transactions." },
              ].map(item => (
                <div key={item.form} className="flex gap-3 p-3 bg-white border border-zinc-100 rounded-lg">
                  <div className="flex-1">
                    <p className="font-semibold text-zinc-800 text-sm">{item.form}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Due: {item.due}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Client Module ────────────────────────────────────────────────────────────
function ClientModule({ client, onBack }: { client: Client; onBack: () => void }) {
  const getHashModule = (): Module => {
    try {
      const m = window.location.hash.replace("#", "").split("|")[1];
      if (m === "audit" || m === "compliance") return m;
    } catch {}
    return "accounting";
  };
  const getHashSection = (): string => {
    try { return window.location.hash.replace("#","").split("|")[2] || ""; } catch { return ""; }
  };
  const [module, setModule] = useState<Module>(getHashModule);
  const [initSection] = useState<string>(getHashSection);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const orgId = client.org_id ?? client.id;

  async function handleSync() {
    setSyncing(true); setSyncMsg(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/zoho-sync`, { method: "POST", headers: { Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ org_id: orgId }) });
      const r = await res.json();
      setSyncMsg(r.success ? `✓ Synced ${r.total_records} records` : `✗ ${r.error || "Failed"}`);
    } catch (e: any) { setSyncMsg(`✗ ${e.message}`); }
    setSyncing(false);
  }

  const MODULES: { key: Module; label: string; desc: string }[] = [
    { key: "accounting", label: "📒 Accounting", desc: "Sales · Purchases · Expenses · Journals" },
    { key: "audit", label: "🔍 Internal Audit", desc: "Matching · GST · TDS · Findings · MIS" },
    { key: "compliance", label: "📋 Compliance & Findings", desc: "Filing summaries · Client presentation · IT" },
  ];

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Header */}
      <div className="border-b border-zinc-200 px-6 py-3 flex items-center justify-between sticky top-0 bg-white z-10">
        <div className="flex items-center gap-4">
          <img src={COMPANY_LOGO} alt="CA" className="h-9 w-auto object-contain" />
          <div className="border-l border-zinc-200 pl-4 flex items-center gap-2">
            <button onClick={onBack} className="text-zinc-400 hover:text-black text-sm transition">← Clients</button>
            <span className="text-zinc-200">/</span>
            <div>
              <p className="font-bold text-black text-sm">{client.name}</p>
              <span className="text-xs text-zinc-400">{client.source?.toUpperCase()}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {syncMsg && <span className={`text-xs ${syncMsg.startsWith("✓") ? "text-emerald-600" : "text-red-500"}`}>{syncMsg}</span>}
          {client.source === "zoho" && (
            <button onClick={handleSync} disabled={syncing} className="text-xs px-3 py-1.5 rounded border border-zinc-300 hover:bg-zinc-100 transition disabled:opacity-50">
              {syncing ? "Syncing..." : "⟳ Sync Zoho"}
            </button>
          )}
        </div>
      </div>

      {/* Module selector */}
      <div className="border-b border-zinc-200 px-6 flex gap-0">
        {MODULES.map(m => (
          <button key={m.key} onClick={() => { setModule(m.key); try { const id = window.location.hash.replace("#","").split("|")[0]; const defaults: Record<string,string> = {accounting:"invoices",audit:"overview",compliance:"summary"}; window.location.hash = id + "|" + m.key + "|" + (defaults[m.key]||""); } catch {} }}
            className={`flex flex-col px-5 py-3 border-b-2 -mb-px transition text-left ${module === m.key ? "border-black" : "border-transparent hover:border-zinc-300"}`}>
            <span className={`text-sm font-semibold ${module === m.key ? "text-black" : "text-zinc-400"}`}>{m.label}</span>
            <span className="text-xs text-zinc-400 mt-0.5">{m.desc}</span>
          </button>
        ))}
      </div>

      {/* Module content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {module === "accounting" && <AccountingModule orgId={orgId} initSection={initSection} />}
        {module === "audit" && <AuditModule orgId={orgId} initSection={initSection} />}
        {module === "compliance" && <ComplianceModule orgId={orgId} clientName={client.name} initSection={initSection} />}
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeClientId, setActiveClientId] = useState<string | null>(null);

  useEffect(() => {
    try { const hash = window.location.hash.replace("#","").split("|")[0]; if (hash) setActiveClientId(hash); } catch {}
  }, []);

  useEffect(() => {
    supabase.from("clients").select("*").order("name").then(({ data }) => { setClients(data || []); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!activeClientId) return;
    try { const parts = window.location.hash.replace("#","").split("|"); const tab = parts[1] || "accounting"; const sec = parts[2] || ""; window.location.hash = activeClientId + "|" + tab + (sec ? "|" + sec : ""); } catch {}
  }, [activeClientId]);

  const activeClient = clients.find(c => c.id === activeClientId) || null;
  const filtered = clients.filter(c => c.name?.toLowerCase().includes(search.toLowerCase()));
  const today = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "long", year: "numeric" });

  if (loading && activeClientId) return <div className="min-h-screen bg-white flex items-center justify-center"><p className="text-zinc-400 animate-pulse">Loading...</p></div>;
  if (activeClient) return <ClientModule client={activeClient} onBack={() => { setActiveClientId(null); try { window.location.hash = ""; } catch {} }} />;

  return (
    <div className="min-h-screen bg-white font-sans">
      <div className="border-b border-zinc-200 px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={COMPANY_LOGO} alt="CA" className="h-10 w-auto object-contain" />
          <div className="border-l border-zinc-200 pl-3">
            <p className="text-sm font-bold text-zinc-900">{COMPANY_NAME}</p>
            <p className="text-xs text-zinc-400">Finance Dashboard · {today}</p>
          </div>
        </div>
        <button onClick={onLogout} className="text-xs px-3 py-1.5 rounded border border-zinc-300 hover:bg-zinc-100 text-zinc-600 transition">Sign Out</button>
      </div>
      <div className="max-w-3xl mx-auto px-8 py-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">Clients</h2>
          <span className="text-xs text-zinc-400">{filtered.length} of {clients.length}</span>
        </div>
        <div className="relative mb-4">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clients..." autoFocus className="w-full pl-9 pr-4 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-black focus:ring-1 focus:ring-black transition" />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-black text-lg">×</button>}
        </div>
        {loading ? (
          <div className="text-center py-20 text-zinc-400">Loading clients...</div>
        ) : (
          <div className="border border-zinc-200 rounded-xl overflow-hidden">
            <div className="grid grid-cols-12 bg-zinc-50 border-b border-zinc-200 px-6 py-2.5 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              <div className="col-span-8">Client Name</div>
              <div className="col-span-3">Source</div>
              <div className="col-span-1"></div>
            </div>
            {filtered.length === 0 ? (
              <div className="text-center py-10 text-zinc-400 text-sm">No clients found</div>
            ) : filtered.map((client, i) => (
              <button key={client.id}
                onClick={() => { try { window.location.hash = client.id + "|accounting"; } catch {} setActiveClientId(client.id); }}
                className="w-full grid grid-cols-12 items-center px-6 py-4 text-left hover:bg-zinc-50 transition border-b border-zinc-100 last:border-0 group">
                <div className="col-span-8 flex items-center gap-4">
                  <span className="text-xs text-zinc-300 w-5 text-right">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-semibold text-black text-sm group-hover:underline">{client.name}</span>
                </div>
                <div className="col-span-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded border ${client.source === "zoho" ? "border-blue-200 text-blue-600 bg-blue-50" : "border-purple-200 text-purple-600 bg-purple-50"}`}>
                    {client.source?.toUpperCase()}
                  </span>
                </div>
                <div className="col-span-1 text-right text-zinc-300 group-hover:text-black transition">→</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
function HomeInner() {
  const [session, setSession] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(!!data.session));
    const { data: l } = supabase.auth.onAuthStateChange((_e, s) => setSession(!!s));
    return () => l.subscription.unsubscribe();
  }, []);
  if (session === null) return <div className="min-h-screen bg-white flex items-center justify-center"><p className="text-zinc-400 text-sm animate-pulse">Loading...</p></div>;
  return session ? <Dashboard onLogout={() => setSession(false)} /> : <LoginScreen onLogin={() => setSession(true)} />;
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="min-h-screen bg-white flex items-center justify-center"><p className="text-zinc-400 text-sm animate-pulse">Loading...</p></div>;
  return <HomeInner />;
}
