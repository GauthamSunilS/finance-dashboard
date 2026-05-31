import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function getAccessToken(): Promise<string> {
  const res = await fetch("https://accounts.zoho.in/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     Deno.env.get("ZOHO_CLIENT_ID")!,
      client_secret: Deno.env.get("ZOHO_CLIENT_SECRET")!,
      refresh_token: Deno.env.get("ZOHO_REFRESH_TOKEN")!,
      grant_type:    "refresh_token",
    }),
  });
  const d = await res.json();
  if (!d.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(d)}`);
  return d.access_token;
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
async function upsert(supabaseUrl: string, key: string, table: string, rows: any[]): Promise<void> {
  if (!rows.length) return;
  // Batch in 500s to avoid payload limits
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "resolution=merge-duplicates",
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

function mapInvoice(inv: any, orgId: string) {
  return {
    id: inv.invoice_id, org_id: orgId,
    invoice_number: inv.invoice_number,
    reference_number: inv.reference_number || null,  // used as IRN store
    customer_id: inv.customer_id, customer_name: inv.customer_name,
    gst_number: inv.gst_no || null,
    salesorder_id: inv.salesorder_id || null,
    status: inv.status, date: inv.date,
    due_date: inv.due_date || null,
    sub_total: Number(inv.sub_total || 0) || (Number(inv.total || 0) - Number(inv.tax_total || 0)),
    discount_total: Number(inv.discount_total || 0),
    tax_total: Number(inv.tax_total || 0),
    total: Number(inv.total || 0),
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
  // Zoho stores tax as tax_amount (inclusive) in detail view
  const taxTotal = Number(e.tax_total || e.tax_amount || 0);
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
  return {
    id: b.bill_id, org_id: orgId,
    bill_number: b.bill_number,
    reference_number: b.reference_number || null,
    vendor_id: b.vendor_id, vendor_name: b.vendor_name,
    purchaseorder_id: b.purchaseorder_id || null,
    status: b.status, date: b.date,
    due_date: b.due_date || null,
    sub_total: Number(b.sub_total || 0) || (Number(b.total || 0) - Number(b.tax_total || 0)),
    discount_total: Number(b.discount_total || 0),
    tax_total: Number(b.tax_total || 0),
    total: Number(b.total || 0),
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
    const token = await getAccessToken();
    const orgIds = Deno.env.get("ZOHO_ORG_IDS")!.split(",").map(s => s.trim());
    const SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL")!;
    const KEY = Deno.env.get("APP_SERVICE_ROLE_KEY")!;

    const summary: Record<string, number> = {};

    for (const orgId of orgIds) {
      console.log(`Syncing org: ${orgId}`);

      // ── MASTER DATA ──────────────────────────────────────────────────────────
      // Contacts (customers + vendors in one table)
      const contacts = (await fetchAll(token, orgId, "contacts", "contacts")).map(c => mapContact(c, orgId));
      await upsert(SUPABASE_URL, KEY, "contacts", contacts);
      summary["contacts"] = (summary["contacts"] || 0) + contacts.length;

      // Items / Products
      const items = (await fetchAll(token, orgId, "items", "items")).map(i => mapItem(i, orgId));
      await upsert(SUPABASE_URL, KEY, "items", items);
      summary["items"] = (summary["items"] || 0) + items.length;

      // ── SALES MODULE ─────────────────────────────────────────────────────────
      const estimates = (await fetchAll(token, orgId, "estimates", "estimates")).map(e => mapEstimate(e, orgId));
      await upsert(SUPABASE_URL, KEY, "estimates", estimates);
      summary["estimates"] = (summary["estimates"] || 0) + estimates.length;

      const salesOrders = (await fetchAll(token, orgId, "salesorders", "salesorders")).map(s => mapSalesOrder(s, orgId));
      await upsert(SUPABASE_URL, KEY, "sales_orders", salesOrders);
      summary["sales_orders"] = (summary["sales_orders"] || 0) + salesOrders.length;

      const invoices = (await fetchAll(token, orgId, "invoices", "invoices")).map(inv => mapInvoice(inv, orgId));
      await upsert(SUPABASE_URL, KEY, "finance_dashboard", invoices);
      summary["invoices"] = (summary["invoices"] || 0) + invoices.length;

      const salesReceipts = (await fetchAll(token, orgId, "salesreceipts", "salesreceipts")).map(r => mapSalesReceipt(r, orgId));
      await upsert(SUPABASE_URL, KEY, "sales_receipts", salesReceipts);
      summary["sales_receipts"] = (summary["sales_receipts"] || 0) + salesReceipts.length;

      const custPayments = (await fetchAll(token, orgId, "customerpayments", "customerpayments")).map(p => mapCustomerPayment(p, orgId));
      await upsert(SUPABASE_URL, KEY, "payments", custPayments);
      summary["payments"] = (summary["payments"] || 0) + custPayments.length;

      const creditNotes = (await fetchAll(token, orgId, "creditnotes", "creditnotes")).map(c => mapCreditNote(c, orgId));
      await upsert(SUPABASE_URL, KEY, "credit_notes", creditNotes);
      summary["credit_notes"] = (summary["credit_notes"] || 0) + creditNotes.length;

      // ── EXPENSE MODULE ───────────────────────────────────────────────────────
      // Fetch expense list first, then get full details for each (for GST/tax breakdown)
      const expenseList = await fetchAll(token, orgId, "expenses", "expenses");
      const expenses: any[] = [];
      for (const exp of expenseList) {
        try {
          const detailRes = await fetch(
            `https://www.zohoapis.in/books/v3/expenses/${exp.expense_id}?organization_id=${orgId}`,
            { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          );
          const detailData = await detailRes.json();
          const detail = detailData.expense || exp;
          expenses.push(mapExpense(detail, orgId));
        } catch {
          expenses.push(mapExpense(exp, orgId));
        }
      }
      await upsert(SUPABASE_URL, KEY, "expenses", expenses);
      summary["expenses"] = (summary["expenses"] || 0) + expenses.length;

      // ── PURCHASE MODULE ──────────────────────────────────────────────────────
      const purchaseOrders = (await fetchAll(token, orgId, "purchaseorders", "purchaseorders")).map(po => mapPurchaseOrder(po, orgId));
      await upsert(SUPABASE_URL, KEY, "purchase_orders", purchaseOrders);
      summary["purchase_orders"] = (summary["purchase_orders"] || 0) + purchaseOrders.length;

      // Fetch bills - Zoho returns all bills with status filter
      const billsList = await fetchAll(token, orgId, "bills", "bills");
      const bills = billsList.map((b: any) => mapBill(b, orgId));
      await upsert(SUPABASE_URL, KEY, "bills", bills);
      summary["bills"] = (summary["bills"] || 0) + bills.length;

      const vendorPayments = (await fetchAll(token, orgId, "vendorpayments", "vendorpayments")).map(p => mapVendorPayment(p, orgId));
      await upsert(SUPABASE_URL, KEY, "vendor_payments", vendorPayments);
      summary["vendor_payments"] = (summary["vendor_payments"] || 0) + vendorPayments.length;

      const vendorCredits = (await fetchAll(token, orgId, "vendorcredits", "vendorcredits")).map(c => mapVendorCredit(c, orgId));
      await upsert(SUPABASE_URL, KEY, "vendor_credits", vendorCredits);
      summary["vendor_credits"] = (summary["vendor_credits"] || 0) + vendorCredits.length;

      // ── ACCOUNTING / JOURNALS ────────────────────────────────────────────────
      // Fetch journal details to get line_items (ledger names)
      const journalList = await fetchAll(token, orgId, "journals", "journals");
      const journals: any[] = [];
      for (const jrn of journalList) {
        try {
          const res = await fetch(
            `https://www.zohoapis.in/books/v3/journals/${jrn.journal_id}?organization_id=${orgId}`,
            { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
          );
          const d = await res.json();
          journals.push(mapJournal(d.journal || jrn, orgId));
        } catch {
          journals.push(mapJournal(jrn, orgId));
        }
      }
      await upsert(SUPABASE_URL, KEY, "journals", journals);
      summary["journals"] = (summary["journals"] || 0) + journals.length;

      // ── BANKING ─────────────────────────────────────────────────────────────
      const bankAccounts = (await fetchAll(token, orgId, "bankaccounts", "bankaccounts")).map(a => mapBankAccount(a, orgId));
      await upsert(SUPABASE_URL, KEY, "bank_accounts", bankAccounts);
      summary["bank_accounts"] = (summary["bank_accounts"] || 0) + bankAccounts.length;

      const bankTransactions = (await fetchAll(token, orgId, "banktransactions", "transactions")).map(t => mapBankTransaction(t, orgId));
      await upsert(SUPABASE_URL, KEY, "bank_transactions", bankTransactions);
      summary["bank_transactions"] = (summary["bank_transactions"] || 0) + bankTransactions.length;

      // ── TAX PAYMENTS ─────────────────────────────────────────────────────────
      const taxPayments = (await fetchAll(token, orgId, "taxpayments", "tax_payments")).map(t => mapTaxPayment(t, orgId));
      await upsert(SUPABASE_URL, KEY, "tax_payments", taxPayments);
      summary["tax_payments"] = (summary["tax_payments"] || 0) + taxPayments.length;
    }

    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    console.log("Sync complete:", summary);

    return new Response(
      JSON.stringify({ success: true, total_records: total, breakdown: summary }),
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
