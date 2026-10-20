import { z } from "zod";
import { supabase } from "./supabase";
import type { InventoryItem, ExecutionJob } from "./types";

const inventoryInput = z.object({
  title: z.string().trim().min(1).max(180),
  sku: z.string().trim().max(100).nullable().optional(),
  image_url: z.string().url().max(2048).nullable().optional(),
  base_price: z.number().finite().min(0).max(1_000_000_000),
  currency: z.enum(["GHS", "NGN", "KES", "ZAR"]),
  age_days: z.number().int().min(0).max(36500).default(0),
  status: z.enum(["draft", "active", "paused", "archived"]).default("draft"),
  platforms: z.array(z.string().min(1).max(80)).max(20).default([])
});

export type InventoryInput = z.infer<typeof inventoryInput>;

function requireBackend() {
  if (!supabase) throw new Error("Backend is not configured. Add the Supabase URL and anon key, then run the database migration.");
  return supabase;
}

export async function listInventory(): Promise<InventoryItem[]> {
  const client = requireBackend();
  const { data, error } = await client.from("inventory")
    .select("id,title,sku,image_url,base_price,currency,age_days,status,platforms")
    .order("created_at", { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []) as InventoryItem[];
}

export async function createInventory(input: InventoryInput): Promise<InventoryItem> {
  const client = requireBackend();
  const parsed = inventoryInput.parse(input);
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) throw new Error("Sign in before adding inventory.");
  const { data, error } = await client.from("inventory")
    .insert({ ...parsed, organization_id: await getActiveOrganizationId() })
    .select("id,title,sku,image_url,base_price,currency,age_days,status,platforms").single();
  if (error) throw error;
  return data as InventoryItem;
}

async function getActiveOrganizationId(): Promise<string> {
  const client = requireBackend();
  const { data, error } = await client.rpc("get_my_default_organization_id");
  if (error) throw new Error("Could not resolve your organization. Complete account setup first.");
  if (!data) throw new Error("No organization is associated with this account.");
  return data as string;
}

export async function updateInventory(id: string, patch: Partial<InventoryInput>): Promise<InventoryItem> {
  const client = requireBackend();
  if (!z.string().uuid().safeParse(id).success) throw new Error("Invalid inventory ID.");
  const safe = inventoryInput.partial().parse(patch);
  const { data, error } = await client.from("inventory").update(safe).eq("id", id)
    .select("id,title,sku,image_url,base_price,currency,age_days,status,platforms").single();
  if (error) throw error;
  return data as InventoryItem;
}

export async function createExecutionJob(inventoryIds: string[], platforms: string[], priceOffsetPercent: number): Promise<ExecutionJob> {
  const client = requireBackend();
  const request = z.object({
    inventory_ids: z.array(z.string().uuid()).min(1).max(100),
    platforms: z.array(z.enum(["Tonaton", "Jiji", "Jumia", "Konga", "Takealot"])).min(1).max(5),
    price_offset_percent: z.number().min(-50).max(100)
  }).parse({ inventory_ids: inventoryIds, platforms, price_offset_percent: priceOffsetPercent });
  const { data, error } = await client.functions.invoke("create-execution-job", { body: request, headers: { "Idempotency-Key": crypto.randomUUID() } });
  if (error) throw new Error(error.message || "Could not create execution job.");
  return data as ExecutionJob;
}

export async function listExecutionJobs(): Promise<ExecutionJob[]> {
  const client = requireBackend();
  const { data, error } = await client.from("execution_jobs")
    .select("id,status,requested_count,completed_count,failed_count,message,created_at")
    .order("created_at", { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []) as ExecutionJob[];
}
