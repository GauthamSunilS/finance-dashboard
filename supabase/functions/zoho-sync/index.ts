import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
// Account A = Creatomy LLP + The Design Room (Gautham's Zoho)
const ACCOUNT_A_ORGS = ["60020061985", "60031248960"];
// Account B = Zero X Infinity (peer's Zoho)
const ACCOUNT_B_ORGS = ["60027611420"];

async function getAccessToken(orgId: string): Promise<string> {
  const isAccountA = ACCOUNT_A_ORGS.includes(orgId);
  const account = isAccountA ? "A" : "B";
  const sbUrl = Deno.env.get("APP_SUPABASE_URL")!;
  const sbKey = Deno.env.get("APP_SERVICE_ROLE_KEY")!;
  const sbHeaders = { apikey: sbKey, Authorization: `Bearer ${sbKey}`, "Content-Type": "application/json" };

  // 1. Reuse a cached, still-valid access token (Zoho tokens last ~1h). This is
  //    essential because the token endpoint is heavily rate-limited and the sync
  //    runs many passes — refreshing each time triggers "too many requests".
  try {
    const cRes = await fetch(`${sbUrl}/rest/v1/zoho_tokens?account=eq.${account}&select=access_token,expires_at`, { headers: sbHeaders });
    if (cRes.ok) {
      const rows = await cRes.json();
      if (Array.isArray(rows) && rows[0] && new Date(rows[0].expires_at).getTime() > Date.now() + 60000) {
        return rows[0].access_token;
      }
    }
  } catch { /* fall through to refresh */ }

  // 2. Refresh from Zoho
  const client_id     = isAccountA ? "1000.9ESMXKQDYSF2DQHEP8B4B4NINJXV2W" : Deno.env.get("ZOHO_CLIENT_ID")!;
  const client_secret = isAccountA ? Deno.env.get("ZOHO_CLIENT_SECRET_A")!   : Deno.env.get("ZOHO_CLIENT_SECRET")!;
  const refresh_token = isAccountA ? Deno.env.get("ZOHO_REFRESH_TOKEN_A")!   : Deno.env.get("ZOHO_REFRESH_TOKEN")!;

  const res = await fetch("https://accounts.zoho.in/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id, client_secret, refresh_token, grant_type: "refresh_token" }),
  });
  const d = await res.json();
  if (!d.access_token) throw new Error(`Token refresh failed for org ${orgId}: ${JSON.stringify(d)}`);

  // 3. Cache it (expire 5 min early for safety)
  const expiresAt = new Date(Date.now() + ((Number(d.expires_in) || 3600) - 300) * 1000).toISOString();
  try {
    await fetch(`${sbUrl}/rest/v1/zoho_tokens`, {
      method: "POST",
      headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({ account, access_token: d.access_token, expires_at: expiresAt }),
    });
  } catch { /* caching is best-effort */ }

  return d.access_token;
}

// ─── Read record IDs still needing detail enrichment, straight from our DB ────
// (detail_synced=false). Avoids re-listing all modules from Zoho on every pass.
async function getUnsyncedIds(sbUrl: string, key: string, table: string, orgId: string, limit = 1000): Promise<string[]> {
  const res = await fetch(
    `${sbUrl}/rest/v1/${table}?select=id&org_id=eq.${orgId}&detail_synced=eq.false&limit=${limit}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  if (!res.ok) return [];
  const rows = await res.json();
  return Array.isArray(rows) ? rows.map((r: any) => String(r.id)) : [];
}

// ─── Enrich one module: fetch detail for the given IDs within the time budget ──
async function enrichModule(
  sbUrl: string, key: string, table: string, ids: string[],
  fetchOne: (id: string) => Promise<any | null>, deadline: number, concurrency = 10
): Promise<{ todo: number; done: number; capped: boolean }> {
  const records: any[] = [];
  let i = 0;
  for (; i < ids.length; i += concurrency) {
    if (Date.now() > deadline) break;
    const batch = ids.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map((id) => fetchOne(id)));
    for (const s of settled) {
      if (s.status === "fulfilled" && s.value !== null) records.push(s.value);
    }
  }
  await upsert(sbUrl, key, table, records);
  return { todo: ids.length, done: records.length, capped: ids.length >= 1000 };
}

// ─── Paginated Zoho fetcher ────────────────────────────────────────────────────
async function fetchAll(token: string, orgId: string, endpoint: string, listKey: string): Promise<any[]> {
  const results: any[] = [];
  let page = 1;
  while (true) {
    const url = `https://www.zohoapis.in/books/v3/${endpoint}?organization_id=${orgId}&page=${page}&per_page=200`;
    const res = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`${endpoint} page ${page} failed: ${res.status} - ${errText.slice(0, 200)}`);
      break;
    }
    const data = await res.json();
    // Check for Zoho API errors in response body
    if (data.code && data.code !== 0) {
      console.error(`${endpoint} API error: code=${data.code} message=${data.message}`);
      break;
    }
    // Try listKey, then singular, then first array in response
    const items: any[] = data[listKey] || data[listKey.slice(0,-1)] || [];
    if (page === 1) console.log(`${endpoint}: found ${items.length} items, keys: ${Object.keys(data).join(",")}`);
    results.push(...items);
    if (items.length < 200 || !data.page_context?.has_more_page) break;
    page++;
  }
  return results;
}

// ─── Supabase upsert ──────────────────────────────────────────────────────────
// resolution "merge-duplicates" updates existing rows; "ignore-duplicates" only
// inserts new rows (used for the list pass so enriched detail isn't clobbered).
async function upsert(
  supabaseUrl: string, key: string, table: string, rows: any[],
  resolution: "merge-duplicates" | "ignore-duplicates" = "merge-duplicates"
): Promise<void> {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: `resolution=${resolution}`,
      },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Upsert ${table} batch ${i} failed: ${err}`);
    }
  }
}

// ─── Field mappers ────────────────────────────────────────────────────────────

function mapContact(c: any, orgId: string) {
  return {
    id: c.contact_id, org_id: orgId,
    contact_name: c.contact_name || null,
    company_name: c.company_name || null,
    contact_type: c.contact_type || null,         // customer / vendor
    status: c.status || null,
    email: c.email || null,
    phone: c.phone || null,
    mobile: c.mobile || null,
    gstin: c.gst_no || c.gstin || null,
    pan: c.pan_no || null,
    currency_code: c.currency_code || null,
    outstanding_receivable: Number(c.outstanding_receivable_amount || 0),
    outstanding_payable: Number(c.outstanding_payable_amount || 0),
    payment_terms: c.payment_terms || null,
    payment_terms_label: c.payment_terms_label || null,
    billing_address: c.billing_address ? JSON.stringify(c.billing_address) : null,
    shipping_address: c.shipping_address ? JSON.stringify(c.shipping_address) : null,
    created_time: c.created_time || null,
    last_modified_time: c.last_modified_time || null,
  };
}

function mapEstimate(e: any, orgId: string) {
  return {
    id: e.estimate_id, org_id: orgId,
    estimate_number: e.estimate_number,
    reference_number: e.reference_number || null,
    customer_id: e.customer_id, customer_name: e.customer_name,
    status: e.status, date: e.date,
    expiry_date: e.expiry_date || null,
    sub_total: Number(e.sub_total || 0),
    discount_total: Number(e.discount_total || 0),
    tax_total: Number(e.tax_total || 0),
    total: Number(e.total || 0),
    currency_code: e.currency_code,
    created_time: e.created_time, last_modified_time: e.last_modified_time,
  };
}

function mapSalesOrder(s: any, orgId: string) {
  return {
    id: s.salesorder_id, org_id: orgId,
    salesorder_number: s.salesorder_number,
    reference_number: s.reference_number || null,
    customer_id: s.customer_id, customer_name: s.customer_name,
    status: s.status, date: s.date,
    shipment_date: s.shipment_date || null,
    sub_total: Number(s.sub_total || 0),
    discount_total: Number(s.discount_total || 0),
    tax_total: Number(s.tax_total || 0),
    total: Number(s.total || 0),
    billed_status: s.billed_status || null,
    invoiced_status: s.invoiced_status || null,
    currency_code: s.currency_code,
    created_time: s.created_time, last_modified_time: s.last_modified_time,
  };
}

function resolveTax(inv: any): number {
  // 1. Top-level tax_total / tax_amount
  const t1 = Number(inv.tax_total || inv.tax_amount || 0);
  if (t1 > 0) return t1;
  // 2. Sum taxes[] array (CGST + SGST + IGST entries)
  if (Array.isArray(inv.taxes) && inv.taxes.length > 0) {
    const t2 = inv.taxes.reduce((s: number, t: any) => s + Number(t.tax_amount || 0), 0);
    if (t2 > 0) return t2;
  }
  // 3. Individual CGST / SGST / IGST fields
  const t3 = Number(inv.cgst_total || 0) + Number(inv.sgst_total || 0) + Number(inv.igst_total || 0);
  if (t3 > 0) return t3;
  // 4. Derive from total - sub_total if both are present and different
  const sub = Number(inv.sub_total || 0);
  const tot = Number(inv.total || 0);
  if (sub > 0 && tot > sub) return tot - sub;
  return 0;
}

function mapInvoice(inv: any, orgId: string) {
  const taxTotal  = resolveTax(inv);
  const total     = Number(inv.total || 0);
  const subTotal  = Number(inv.sub_total || 0) || (total - taxTotal);
  return {
    id: inv.invoice_id, org_id: orgId,
    invoice_number: inv.invoice_number,
    reference_number: inv.reference_number || null,
    customer_id: inv.customer_id, customer_name: inv.customer_name,
    gst_number: inv.gst_no || null,
    salesorder_id: inv.salesorder_id || null,
    status: inv.status, date: inv.date,
    due_date: inv.due_date || null,
    sub_total: subTotal,
    discount_total: Number(inv.discount_total || 0),
    tax_total: taxTotal,
    total,
    balance: Number(inv.balance || 0),
    currency_code: inv.currency_code || "INR",
    created_time: inv.created_time, last_modified_time: inv.last_modified_time,
  };
}

function mapSalesReceipt(r: any, orgId: string) {
  return {
    id: r.salesreceipt_id, org_id: orgId,
    salesreceipt_number: r.salesreceipt_number,
    reference_number: r.reference_number || null,
    customer_id: r.customer_id, customer_name: r.customer_name,
    status: r.status, date: r.date,
    sub_total: Number(r.sub_total || 0),
    tax_total: Number(r.tax_total || 0),
    total: Number(r.total || 0),
    payment_mode: r.payment_mode || null,
    currency_code: r.currency_code,
    created_time: r.created_time, last_modified_time: r.last_modified_time,
  };
}

function mapCustomerPayment(p: any, orgId: string) {
  return {
    id: p.payment_id, org_id: orgId,
    payment_number: p.payment_number,
    customer_id: p.customer_id, customer_name: p.customer_name,
    payment_mode: p.payment_mode || null,
    amount: Number(p.amount || 0),
    bank_charges: Number(p.bank_charges || 0),
    tax_amount_withheld: Number(p.tax_amount_withheld || 0),
    currency_code: p.currency_code || "INR",
    exchange_rate: Number(p.exchange_rate || 1),
    date: p.date,
    reference_number: p.reference_number || null,
    invoices: p.invoices ? JSON.stringify(p.invoices) : null,
    created_time: p.created_time, last_modified_time: p.last_modified_time,
  };
}

function mapCreditNote(c: any, orgId: string) {
  return {
    id: c.creditnote_id, org_id: orgId,
    creditnote_number: c.creditnote_number,
    reference_number: c.reference_number || null,
    customer_id: c.customer_id, customer_name: c.customer_name,
    status: c.status, date: c.date,
    sub_total: Number(c.sub_total || 0),
    tax_total: Number(c.tax_total || 0),
    total: Number(c.total || 0),
    balance: Number(c.balance || 0),
    currency_code: c.currency_code,
    reason: c.reason || null,
    created_time: c.created_time, last_modified_time: c.last_modified_time,
  };
}

function mapExpense(e: any, orgId: string) {
  const taxTotal = resolveTax(e);
  const total = Number(e.total || 0);
  const subTotal = Number(e.sub_total || 0) || (total - taxTotal);
  return {
    id: e.expense_id, org_id: orgId,
    expense_number: e.expense_id,
    account_id: e.account_id || null,
    account_name: e.account_name || null,
    vendor_id: e.vendor_id || null,
    vendor_name: e.vendor_name || e.vendor?.vendor_name || null,
    paid_through_account_name: e.paid_through_account_name || null,
    status: e.status,
    date: e.date,
    due_date: e.due_date || null,
    total: total,
    sub_total: subTotal,
    tax_total: taxTotal,
    is_billable: e.is_billable || false,
    customer_id: e.customer_id || null,
    customer_name: e.customer_name || null,
    currency_code: e.currency_code || e.currency_id || "INR",
    reference_number: e.reference_number || null,
    description: e.description || null,
    report_name: e.report_name || null,
    created_time: e.created_time || null,
    last_modified_time: e.last_modified_time || null,
  };
}

function mapPurchaseOrder(po: any, orgId: string) {
  return {
    id: po.purchaseorder_id, org_id: orgId,
    purchaseorder_number: po.purchaseorder_number,
    reference_number: po.reference_number || null,
    vendor_id: po.vendor_id, vendor_name: po.vendor_name,
    status: po.status, date: po.date,
    expected_delivery_date: po.expected_delivery_date || null,
    delivery_date: po.delivery_date || null,
    sub_total: Number(po.sub_total || 0),
    discount_total: Number(po.discount_total || 0),
    tax_total: Number(po.tax_total || 0),
    total: Number(po.total || 0),
    billed_status: po.billed_status || null,       // none / partial / fully_billed
    received_status: po.received_status || null,   // none / partial / fully_received (GRN)
    currency_code: po.currency_code,
    delivery_address: po.delivery_address ? JSON.stringify(po.delivery_address) : null,
    created_time: po.created_time, last_modified_time: po.last_modified_time,
  };
}

function mapBill(b: any, orgId: string) {
  const taxTotal = resolveTax(b);
  const total = Number(b.total || 0);
  return {
    id: b.bill_id, org_id: orgId,
    bill_number: b.bill_number,
    reference_number: b.reference_number || null,
    vendor_id: b.vendor_id, vendor_name: b.vendor_name,
    purchaseorder_id: b.purchaseorder_id || null,
    status: b.status, date: b.date,
    due_date: b.due_date || null,
    sub_total: Number(b.sub_total || 0) || (total - taxTotal),
    discount_total: Number(b.discount_total || 0),
    tax_total: taxTotal,
    total,
    balance: Number(b.balance || 0),
    currency_code: b.currency_code,
    created_time: b.created_time, last_modified_time: b.last_modified_time,
  };
}

function mapVendorPayment(p: any, orgId: string) {
  return {
    id: p.payment_id, org_id: orgId,
    payment_number: p.payment_number || null,
    vendor_id: p.vendor_id, vendor_name: p.vendor_name,
    payment_mode: p.payment_mode || null,
    amount: Number(p.amount || 0),
    bank_charges: Number(p.bank_charges || 0),
    tax_amount_withheld: Number(p.tax_amount_withheld || 0),  // TDS deducted
    currency_code: p.currency_code,
    date: p.date,
    reference_number: p.reference_number || null,
    bills: p.bills ? JSON.stringify(p.bills) : null,  // which bills settled
    created_time: p.created_time, last_modified_time: p.last_modified_time,
  };
}

function mapVendorCredit(c: any, orgId: string) {
  return {
    id: c.vendor_credit_id, org_id: orgId,
    vendor_credit_number: c.vendor_credit_number,
    reference_number: c.reference_number || null,
    vendor_id: c.vendor_id, vendor_name: c.vendor_name,
    status: c.status, date: c.date,
    sub_total: Number(c.sub_total || 0),
    tax_total: Number(c.tax_total || 0),
    total: Number(c.total || 0),
    balance: Number(c.balance || 0),
    currency_code: c.currency_code,
    created_time: c.created_time, last_modified_time: c.last_modified_time,
  };
}

function mapJournal(j: any, orgId: string) {
  return {
    id: j.journal_id, org_id: orgId,
    journal_date: j.journal_date || j.date || null,
    entry_number: j.entry_number || j.journal_number || String(j.journal_id || ""),
    reference_number: j.reference_number || null,
    notes: j.notes || j.description || null,
    total: Number(j.total || j.debit_or_credit_total || j.debit_total || 0),
    currency_code: j.currency_code || j.currency_id || "INR",
    status: j.status || null,
    line_items: j.line_items ? JSON.stringify(j.line_items) : null,
    created_time: j.created_time || null,
    last_modified_time: j.last_modified_time || null,
  };
}

function mapBankAccount(a: any, orgId: string) {
  return {
    id: a.account_id, org_id: orgId,
    account_name: a.account_name,
    account_type: a.account_type || null,
    currency_code: a.currency_code || null,
    account_number: a.account_number || null,
    bank_name: a.bank_name || null,
    is_active: a.is_active ?? true,
    current_balance: Number(a.current_balance || 0),
    uncategorized_transactions: Number(a.uncategorized_transactions || 0),
  };
}

function mapBankTransaction(t: any, orgId: string) {
  return {
    id: t.transaction_id, org_id: orgId,
    account_id: t.account_id || null,
    account_name: t.account_name || null,
    transaction_type: t.transaction_type || null,
    amount: Number(t.amount || 0),
    debit_or_credit: t.debit_or_credit || null,
    date: t.date,
    reference_number: t.reference_number || null,
    description: t.description || null,
    status: t.status || null,
    payee: t.payee || null,
    currency_code: t.currency_code || null,
    is_manually_added: t.is_manually_added || false,
    created_time: t.created_time, last_modified_time: t.last_modified_time,
  };
}

function mapItem(i: any, orgId: string) {
  return {
    id: i.item_id, org_id: orgId,
    name: i.name,
    item_type: i.item_type || null,        // sales / purchases / both
    product_type: i.product_type || null,  // goods / service
    status: i.status || null,
    sku: i.sku || null,
    unit: i.unit || null,
    rate: Number(i.rate || 0),
    purchase_rate: Number(i.purchase_rate || 0),
    tax_name: i.tax_name || null,
    tax_percentage: Number(i.tax_percentage || 0),
    hsn_or_sac: i.hsn_or_sac || null,    // HSN/SAC code
    stock_on_hand: Number(i.stock_on_hand || 0),
    created_time: i.created_time, last_modified_time: i.last_modified_time,
  };
}

function mapTaxPayment(t: any, orgId: string) {
  return {
    id: t.tax_payment_id || `${orgId}-${t.payment_date}-${t.amount}`, org_id: orgId,
    payment_date: t.payment_date,
    tax_name: t.tax_name || null,
    amount: Number(t.amount || 0),
    reference_number: t.reference_number || null,
    notes: t.notes || null,
    created_time: t.created_time,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const orgId: string = body.org_id;
    if (!orgId) throw new Error("org_id is required in request body");

    const startedAt = Date.now();
    const token = await getAccessToken(orgId);
    const SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL")!;
    const KEY = Deno.env.get("APP_SERVICE_ROLE_KEY")!;
    const phase: string = body.phase || "list";

    // Budget the detail work so the whole invocation stays under the 150s limit.
    const deadline = startedAt + 120000;

    const getDetail = async (endpoint: string, id: string, key: string, mapFn: (x: any) => any) => {
      const r = await fetch(`https://www.zohoapis.in/books/v3/${endpoint}/${id}?organization_id=${orgId}`,
        { headers: { Authorization: `Zoho-oauthtoken ${token}` } });
      if (!r.ok) return null;
      const d = await r.json();
      // Always mark detail_synced so genuinely zero-tax records are not re-fetched
      return d[key] ? { ...mapFn(d[key]), detail_synced: true } : null;
    };

    // ── ENRICH PASS ──────────────────────────────────────────────────────────
    // Reads remaining records (detail_synced=false) from our own DB — no Zoho
    // list calls — and fetches each one's detail to fill GST / ledger lines.
    if (phase === "enrich") {
      const [invIds, billIds, expIds, jrnIds] = await Promise.all([
        getUnsyncedIds(SUPABASE_URL, KEY, "finance_dashboard", orgId),
        getUnsyncedIds(SUPABASE_URL, KEY, "bills", orgId),
        getUnsyncedIds(SUPABASE_URL, KEY, "expenses", orgId),
        getUnsyncedIds(SUPABASE_URL, KEY, "journals", orgId),
      ]);

      const invRes = await enrichModule(SUPABASE_URL, KEY, "finance_dashboard", invIds,
        (id) => getDetail("invoices", id, "invoice", (x) => mapInvoice(x, orgId)), deadline);
      const billRes = await enrichModule(SUPABASE_URL, KEY, "bills", billIds,
        (id) => getDetail("bills", id, "bill", (x) => mapBill(x, orgId)), deadline);
      const expRes = await enrichModule(SUPABASE_URL, KEY, "expenses", expIds,
        (id) => getDetail("expenses", id, "expense", (x) => mapExpense(x, orgId)), deadline);
      const jrnRes = await enrichModule(SUPABASE_URL, KEY, "journals", jrnIds,
        (id) => getDetail("journals", id, "journal", (x) => mapJournal(x, orgId)), deadline);

      const enrichment = { invoices: invRes, bills: billRes, expenses: expRes, journals: jrnRes };
      const more = [invRes, billRes, expRes, jrnRes].some(r => r.done < r.todo || r.capped);
      console.log(`Enrich org ${orgId}:`, enrichment, "more:", more);
      return new Response(JSON.stringify({ success: true, enrichment, more }),
        { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    // ── LIST PASS ────────────────────────────────────────────────────────────
    console.log(`List sync org: ${orgId}`);
    const [
      contactsRaw, itemsRaw, estimatesRaw, salesOrdersRaw, invoicesRaw,
      salesReceiptsRaw, custPaymentsRaw, creditNotesRaw, expensesRaw,
      purchaseOrdersRaw, billsRaw, vendorPaymentsRaw, vendorCreditsRaw,
      journalsRaw, bankAccountsRaw, bankTxRaw, taxPaymentsRaw,
    ] = await Promise.all([
      fetchAll(token, orgId, "contacts",        "contacts"),
      fetchAll(token, orgId, "items",           "items"),
      fetchAll(token, orgId, "estimates",       "estimates"),
      fetchAll(token, orgId, "salesorders",     "salesorders"),
      fetchAll(token, orgId, "invoices",        "invoices"),
      fetchAll(token, orgId, "salesreceipts",   "salesreceipts"),
      fetchAll(token, orgId, "customerpayments","customerpayments"),
      fetchAll(token, orgId, "creditnotes",     "creditnotes"),
      fetchAll(token, orgId, "expenses",        "expenses"),
      fetchAll(token, orgId, "purchaseorders",  "purchaseorders"),
      fetchAll(token, orgId, "bills",           "bills"),
      fetchAll(token, orgId, "vendorpayments",  "vendorpayments"),
      fetchAll(token, orgId, "vendorcredits",   "vendorcredits"),
      fetchAll(token, orgId, "journals",        "journals"),
      fetchAll(token, orgId, "bankaccounts",    "bankaccounts"),
      fetchAll(token, orgId, "banktransactions","transactions"),
      fetchAll(token, orgId, "taxpayments",     "tax_payments"),
    ]);

    // Cheap modules: list data is complete → full upsert
    await Promise.all([
      upsert(SUPABASE_URL, KEY, "contacts",          contactsRaw.map(c => mapContact(c, orgId))),
      upsert(SUPABASE_URL, KEY, "items",             itemsRaw.map(i => mapItem(i, orgId))),
      upsert(SUPABASE_URL, KEY, "estimates",         estimatesRaw.map(e => mapEstimate(e, orgId))),
      upsert(SUPABASE_URL, KEY, "sales_orders",      salesOrdersRaw.map(s => mapSalesOrder(s, orgId))),
      upsert(SUPABASE_URL, KEY, "sales_receipts",    salesReceiptsRaw.map(r => mapSalesReceipt(r, orgId))),
      upsert(SUPABASE_URL, KEY, "payments",          custPaymentsRaw.map(p => mapCustomerPayment(p, orgId))),
      upsert(SUPABASE_URL, KEY, "credit_notes",      creditNotesRaw.map(c => mapCreditNote(c, orgId))),
      upsert(SUPABASE_URL, KEY, "purchase_orders",   purchaseOrdersRaw.map(po => mapPurchaseOrder(po, orgId))),
      upsert(SUPABASE_URL, KEY, "vendor_payments",   vendorPaymentsRaw.map(p => mapVendorPayment(p, orgId))),
      upsert(SUPABASE_URL, KEY, "vendor_credits",    vendorCreditsRaw.map(c => mapVendorCredit(c, orgId))),
      upsert(SUPABASE_URL, KEY, "bank_accounts",     bankAccountsRaw.map(a => mapBankAccount(a, orgId))),
      upsert(SUPABASE_URL, KEY, "bank_transactions", bankTxRaw.map(t => mapBankTransaction(t, orgId))),
      upsert(SUPABASE_URL, KEY, "tax_payments",      taxPaymentsRaw.map(t => mapTaxPayment(t, orgId))),
    ]);

    // Detail modules: insert only NEW rows (ignore-duplicates) so existing
    // enriched tax/line_items are never clobbered. New rows start detail_synced=false.
    await Promise.all([
      upsert(SUPABASE_URL, KEY, "finance_dashboard", invoicesRaw.map(i => mapInvoice(i, orgId)), "ignore-duplicates"),
      upsert(SUPABASE_URL, KEY, "bills",             billsRaw.map(b => mapBill(b, orgId)), "ignore-duplicates"),
      upsert(SUPABASE_URL, KEY, "expenses",          expensesRaw.map(e => mapExpense(e, orgId)), "ignore-duplicates"),
      upsert(SUPABASE_URL, KEY, "journals",          journalsRaw.map(j => mapJournal(j, orgId)), "ignore-duplicates"),
    ]);

    const summary = {
      contacts: contactsRaw.length, items: itemsRaw.length, estimates: estimatesRaw.length,
      sales_orders: salesOrdersRaw.length, invoices: invoicesRaw.length,
      sales_receipts: salesReceiptsRaw.length, payments: custPaymentsRaw.length,
      credit_notes: creditNotesRaw.length, expenses: expensesRaw.length,
      purchase_orders: purchaseOrdersRaw.length, bills: billsRaw.length,
      vendor_payments: vendorPaymentsRaw.length, vendor_credits: vendorCreditsRaw.length,
      journals: journalsRaw.length, bank_accounts: bankAccountsRaw.length,
      bank_transactions: bankTxRaw.length, tax_payments: taxPaymentsRaw.length,
    };
    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    console.log(`List sync done org ${orgId}:`, summary);

    // Always continue into enrich passes to fill GST / ledger detail
    return new Response(
      JSON.stringify({ success: true, total_records: total, breakdown: summary, more: true }),
      { headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (err: any) {
    console.error("Sync error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
