import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("APP_SUPABASE_URL")!;
const KEY = Deno.env.get("APP_SERVICE_ROLE_KEY")!;
const CLIENT_ID = Deno.env.get("ZOHO_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("ZOHO_CLIENT_SECRET")!;
const REFRESH_TOKEN = Deno.env.get("ZOHO_REFRESH_TOKEN")!;

const supabase = createClient(SUPABASE_URL, KEY);

async function getToken(): Promise<string> {
  const res = await fetch("https://accounts.zoho.in/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: REFRESH_TOKEN }),
  });
  const data = await res.json();
  return data.access_token;
}

const ENDPOINTS: Record<string, { path: string; idField: string }> = {
  expenses:        { path: "expenses",         idField: "expense_id" },
  bills:           { path: "bills",            idField: "bill_id" },
  journals:        { path: "journals",         idField: "journal_id" },
  invoices:        { path: "invoices",         idField: "invoice_id" },
  payments:        { path: "customerpayments", idField: "payment_id" },
  vendor_payments: { path: "vendorpayments",   idField: "payment_id" },
  sales_orders:    { path: "salesorders",      idField: "salesorder_id" },
};

serve(async (req) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { change_id, org_id } = await req.json();
    if (!change_id || !org_id) throw new Error("change_id and org_id required");

    // Get the pending change
    const { data: change, error: fetchErr } = await supabase.from("pending_changes").select("*").eq("id", change_id).single();
    if (fetchErr || !change) throw new Error("Change not found");

    const token = await getToken();
    const ep = ENDPOINTS[change.module];
    if (!ep) throw new Error(`Unknown module: ${change.module}`);

    const baseUrl = `https://www.zohoapis.in/books/v3/${ep.path}`;
    const headers = { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" };
    const orgParam = `?organization_id=${org_id}`;

    let res: Response;
    if (change.action === "create") {
      res = await fetch(baseUrl + orgParam, { method: "POST", headers, body: JSON.stringify(change.payload) });
    } else if (change.action === "update") {
      res = await fetch(`${baseUrl}/${change.record_id}${orgParam}`, { method: "PUT", headers, body: JSON.stringify(change.payload) });
    } else if (change.action === "delete") {
      res = await fetch(`${baseUrl}/${change.record_id}${orgParam}`, { method: "DELETE", headers });
    } else {
      throw new Error(`Unknown action: ${change.action}`);
    }

    const result = await res.json().catch(() => ({}));

    if (!res.ok || result.code !== 0) {
      const errMsg = result.message || `HTTP ${res.status}`;
      await supabase.from("pending_changes").update({ status: "failed", error: errMsg }).eq("id", change_id);
      return new Response(JSON.stringify({ success: false, error: errMsg }), { headers: cors });
    }

    // Mark as pushed
    await supabase.from("pending_changes").update({ status: "pushed", pushed_at: new Date().toISOString() }).eq("id", change_id);
    return new Response(JSON.stringify({ success: true, result }), { headers: cors });

  } catch (e: any) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 400, headers: cors });
  }
});
