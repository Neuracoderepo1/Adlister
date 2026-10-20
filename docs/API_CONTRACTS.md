# API contracts — v1

Base API: Supabase project URL. All protected endpoints require `Authorization: Bearer <user access token>`. Never send a service-role key to the browser.

## Authentication
Supabase Auth magic-link OTP is enabled by the frontend. The database trigger provisions a personal organization and owner membership when a new auth user is created.

## `GET /rest/v1/inventory?select=...&order=created_at.desc`
Returns only inventory rows permitted by RLS for the signed-in user. Limit client queries; production pagination should use a cursor/range rather than loading an unbounded catalog.

Example response:
```json
[{
  "id": "uuid",
  "title": "Wireless headphones",
  "sku": "AUD-1001",
  "base_price": 2850,
  "currency": "GHS",
  "age_days": 14,
  "status": "active",
  "platforms": ["Jiji"]
}]
```

## `POST /functions/v1/create-execution-job`
Headers: `Authorization`, `Content-Type: application/json`, optional `Idempotency-Key` (8–200 characters).

Request:
```json
{
  "inventory_ids": ["uuid"],
  "platforms": ["Jiji"],
  "price_offset_percent": 0
}
```
Constraints: 1–100 inventory IDs; supported platform names only; price offset -50 to +100; strict JSON object; all inventory must belong to the caller's organization; role must be owner/admin/operator.

Accepted response (`201`):
```json
{
  "id": "uuid",
  "status": "queued",
  "requested_count": 1,
  "completed_count": 0,
  "failed_count": 0,
  "message": "Job accepted. Adapter eligibility is being evaluated; no marketplace publication has been confirmed.",
  "created_at": "ISO-8601 timestamp"
}
```
The current Edge Function creates durable job and operation rows only. It deliberately does not publish listings. Duplicate idempotency keys in an organization return the existing job. Error envelope:
```json
{"error":{"code":"VALIDATION_ERROR","message":"Invalid job request","details":{}}}
```
Expected status codes: `400` validation/JSON, `401` missing or invalid authentication, `403` membership/role/scope, `405` method, `500` server/database error.

## Job reads
`GET /rest/v1/execution_jobs?select=...&order=created_at.desc` and `GET /rest/v1/execution_job_items?...` are read-only to authenticated organization members through RLS. Clients cannot directly insert/update jobs or audit events.

## Planned worker/adapter contract (not implemented as publishing)
When an approved integration is available, a server-side worker should consume queued jobs and call a typed adapter:
```ts
interface MarketplaceAdapter {
  marketplace: "Tonaton" | "Jiji" | "Jumia" | "Konga" | "Takealot";
  capabilities(): Promise<{ create: boolean; update: boolean; pause: boolean; inventorySync: boolean }>;
  validateConnection(): Promise<{ ok: boolean; accountLabel?: string; errorCode?: string }>;
  upsertListing(input: { inventoryId: string; title: string; price: number; currency: string; imageUrl?: string | null; idempotencyKey: string }): Promise<
    { status: "succeeded"; externalListingId: string } |
    { status: "failed"; errorCode: string; retryable: boolean }
  >;
}
```
A `succeeded` operation requires a verifiable positive response from the real marketplace adapter, ideally including its external listing ID. No UI text or local state alone can transition an operation to succeeded. Worker design must include atomic job claiming, lease/heartbeat, bounded retries, rate limiting, timeout, dead-letter handling, and audit records.
