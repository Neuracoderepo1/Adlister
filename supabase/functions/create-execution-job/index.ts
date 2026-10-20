import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@3.24.1";

const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? Deno.env.get("ALLOWED_ORIGIN") ?? "http://localhost:5173")
  .split(",").map((value) => value.trim()).filter(Boolean);
const allowedHeaders = "authorization, x-client-info, apikey, content-type, idempotency-key";
function corsHeaders(origin: string | null) {
  const acceptedOrigin = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  return {
    "Access-Control-Allow-Origin": acceptedOrigin,
    "Access-Control-Allow-Headers": allowedHeaders,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}
const inputSchema = z.object({
  inventory_ids: z.array(z.string().uuid()).min(1).max(100),
  platforms: z.array(z.enum(["Tonaton", "Jiji", "Jumia", "Konga", "Takealot"])).min(1).max(5),
  price_offset_percent: z.number().min(-50).max(100)
}).strict();

function response(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return response({ error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } }, 405, cors);
  const origin = req.headers.get("Origin");
  if (origin && !allowedOrigins.includes(origin)) return response({ error: { code: "ORIGIN_NOT_ALLOWED", message: "Origin is not allowed" } }, 403, cors);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return response({ error: { code: "UNAUTHORIZED", message: "Sign-in required" } }, 401, cors);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return response({ error: { code: "SERVER_CONFIG", message: "Server is not configured" } }, 500, cors);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return response({ error: { code: "UNAUTHORIZED", message: "Valid session required" } }, 401, cors);

  let body: unknown;
  try { body = await req.json(); } catch { return response({ error: { code: "INVALID_JSON", message: "Request body must be JSON" } }, 400, cors); }
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return response({ error: { code: "VALIDATION_ERROR", message: "Invalid job request", details: parsed.error.flatten() } }, 400, cors);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: membership, error: membershipError } = await admin.from("organization_members")
    .select("organization_id,role").eq("user_id", user.id).order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (membershipError) return response({ error: { code: "DATABASE_ERROR", message: "Could not resolve organization" } }, 500, cors);
  if (!membership) return response({ error: { code: "NO_ORGANIZATION", message: "Account has no organization" } }, 403, cors);
  if (!["owner", "admin", "operator"].includes(membership.role)) return response({ error: { code: "FORBIDDEN", message: "Operator permission required" } }, 403, cors);

  const orgId = membership.organization_id;
  const { data: items, error: itemsError } = await admin.from("inventory")
    .select("id,organization_id,store_id,status").eq("organization_id", orgId).in("id", parsed.data.inventory_ids);
  if (itemsError) return response({ error: { code: "DATABASE_ERROR", message: "Could not validate inventory" } }, 500, cors);
  if (!items || items.length !== parsed.data.inventory_ids.length) return response({ error: { code: "INVENTORY_SCOPE", message: "One or more inventory records do not belong to your organization" } }, 403, cors);

  const suppliedIdempotencyKey = req.headers.get("idempotency-key");
  if (suppliedIdempotencyKey !== null && (suppliedIdempotencyKey.length < 8 || suppliedIdempotencyKey.length > 200)) {
    return response({ error: { code: "INVALID_IDEMPOTENCY_KEY", message: "Idempotency key must be between 8 and 200 characters" } }, 400, cors);
  }
  const idempotencyKey = suppliedIdempotencyKey ?? crypto.randomUUID();
  const storeIds = [...new Set(items.map((item) => item.store_id).filter(Boolean))];
  const storeId = storeIds.length === 1 ? storeIds[0] : null;
  const { data: existing } = await admin.from("execution_jobs").select("*")
    .eq("organization_id", orgId).eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing) return response(existing, 200, cors);

  const { data: job, error: jobError } = await admin.from("execution_jobs").insert({
    organization_id: orgId, store_id: storeId, requested_by: user.id,
    status: "queued", requested_count: parsed.data.inventory_ids.length,
    platforms: parsed.data.platforms, price_offset_percent: parsed.data.price_offset_percent,
    idempotency_key: idempotencyKey,
    message: "Job accepted. Adapter eligibility is being evaluated; no marketplace publication has been confirmed."
  }).select("*").single();
  if (jobError || !job) return response({ error: { code: "JOB_CREATE_FAILED", message: "Could not create execution job" } }, 500, cors);

  const jobItems = items.flatMap((item) => parsed.data.platforms.map((platform) => ({
    organization_id: orgId, job_id: job.id, inventory_id: item.id, marketplace: platform, status: "pending"
  })));
  const { error: jobItemsError } = await admin.from("execution_job_items").insert(jobItems);
  if (jobItemsError) {
    await admin.from("execution_jobs").update({ status: "failed", failed_count: parsed.data.inventory_ids.length, error_code: "JOB_ITEMS_CREATE_FAILED", message: "Could not create operation records." }).eq("id", job.id);
    return response({ error: { code: "JOB_ITEMS_CREATE_FAILED", message: "Could not create operation records" } }, 500, cors);
  }
  await admin.from("audit_logs").insert({
    organization_id: orgId, actor_id: user.id, action: "execution_job.created",
    resource_type: "execution_job", resource_id: job.id,
    details: { requested_count: items.length, platforms: parsed.data.platforms, price_offset_percent: parsed.data.price_offset_percent, result: "queued; no publishing claim" }
  });
  return response({
    id: job.id, status: job.status, requested_count: job.requested_count,
    completed_count: job.completed_count, failed_count: job.failed_count,
    message: job.message, created_at: job.created_at
  }, 201, cors);
});
