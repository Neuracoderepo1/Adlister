import { describe, expect, it } from "vitest";
import { z } from "zod";

const jobInput = z.object({
  inventory_ids: z.array(z.string().uuid()).min(1).max(100),
  platforms: z.array(z.enum(["Tonaton", "Jiji", "Jumia", "Konga", "Takealot"])).min(1).max(5),
  price_offset_percent: z.number().min(-50).max(100)
}).strict();

describe("execution job request validation", () => {
  it("accepts a well-formed request", () => {
    expect(jobInput.safeParse({
      inventory_ids: ["00000000-0000-4000-8000-000000000001"],
      platforms: ["Jiji"], price_offset_percent: 0
    }).success).toBe(true);
  });
  it("rejects invalid UUIDs", () => {
    expect(jobInput.safeParse({ inventory_ids: ["not-a-uuid"], platforms: ["Jiji"], price_offset_percent: 0 }).success).toBe(false);
  });
  it("rejects unsupported marketplaces", () => {
    expect(jobInput.safeParse({ inventory_ids: ["00000000-0000-4000-8000-000000000001"], platforms: ["MarketplaceX"], price_offset_percent: 0 }).success).toBe(false);
  });
  it("rejects unsafe price offsets and unknown properties", () => {
    expect(jobInput.safeParse({ inventory_ids: ["00000000-0000-4000-8000-000000000001"], platforms: ["Jiji"], price_offset_percent: 1000 }).success).toBe(false);
    expect(jobInput.safeParse({ inventory_ids: ["00000000-0000-4000-8000-000000000001"], platforms: ["Jiji"], price_offset_percent: 0, publishNow: true }).success).toBe(false);
  });
});
