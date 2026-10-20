export type Currency = "GHS" | "NGN" | "KES" | "ZAR";
export type Region = "Ghana" | "Nigeria" | "Kenya" | "South Africa";
export type ListingStatus = "draft" | "active" | "paused" | "archived";
export type JobStatus = "queued" | "running" | "succeeded" | "partial" | "failed" | "cancelled";

export interface InventoryItem {
  id: string;
  title: string;
  sku: string | null;
  image_url: string | null;
  base_price: number;
  currency: Currency;
  age_days: number;
  status: ListingStatus;
  platforms: string[];
  selected?: boolean;
}

export interface ExecutionJob {
  id: string;
  status: JobStatus;
  requested_count: number;
  completed_count: number;
  failed_count: number;
  message: string;
  created_at: string;
}
