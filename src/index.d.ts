export interface Options {
  country?: string;
  /** Fall back to a language model when the name is not in the database. Requires AI consent on the account. */
  ai_fallback?: boolean;
  /** Return the most likely gender even when probability is below the threshold. */
  best_guess?: boolean;
  type?: 'name'|'email'|'username';
}
export interface CountriesOptions { limit?: number }
/** Fields every successful lookup response carries. Success is the HTTP status; there is no `status` field. */
export interface Envelope { credits_charged: number; credits_remaining: number; data_version: string | null; request_id: string | null }
export interface GenderResult {
  query: string;
  name: string | null;
  gender: 'male'|'female'|null;
  country: string | null;
  sample_size: number;
  probability: number;
  took_ms: number;
  source: string;
  confidence: string;
  matched_as: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
}
export interface GenderResponse extends Envelope, GenderResult {}
export interface BulkResponse extends Envelope {
  took_ms: number;
  summary: { total: number; identified: number; unknown: number; match_rate: number };
  results: GenderResult[];
}
export interface CountryRegistration { country: string; count: number; share: number; gender: 'male'|'female'|null; probability: number; source: string }
/**
 * Country distribution of a name. Not a country-of-origin or ethnicity inference:
 * `registrations` is counted volume, comparable only among countries that publish
 * counted birth statistics; `attested_in` is presence with no weight attached.
 */
export interface CountriesResponse extends Envelope {
  took_ms: number;
  name: string;
  basis: { counted_sources: string[]; counted_countries: number; attested_countries: number; note: string };
  registrations: CountryRegistration[];
  attested_in: string[];
}
export interface AccountResponse {
  email: string;
  credits_remaining: number;
  purchased_credits: number;
  free_today: number;
  free_daily_limit: number;
  lifetime_requests: number;
  data_version: string | null;
  ai: { consented: boolean; consented_at: string | null; subprocessor: Record<string, string | null> };
}
export type BatchStatus = 'uploaded'|'queued'|'processing'|'completed'|'failed'|'cancelled';
export type BatchErrorCode = 'source_missing'|'no_columns'|'name_column_missing'|'empty_file'|'bad_format'|'unreadable'|'no_credits'|'processing_error'|'stalled';
export interface BatchSettings {
  /** Header of the column holding the names, exactly as in the file. Required to start. */
  name_column?: string;
  /** Header of a column holding a country code per row. */
  country_column?: string;
  /** Default country for rows without one. */
  country?: string;
  /** Requires AI consent on the account. */
  ai_fallback?: boolean;
  best_guess?: boolean;
  /** The result can be downloaded once, then it is deleted. */
  delete_after_download?: boolean;
}
export interface BatchCreateOptions extends BatchSettings {
  /** Needed when `file` is bytes rather than a File. Its extension (.csv, .xlsx) sets the format. */
  filename?: string;
  /** false: upload and inspect only; see `inspection` on the job. Default true. */
  start?: boolean;
  /** Reused across retries of this call. Generated when omitted. */
  idempotencyKey?: string;
  /** Retries on network errors and 502/503/504. Default 2. */
  retries?: number;
}
export interface BatchJob {
  id: string;
  status: BatchStatus;
  source: 'api'|'panel';
  file: { name: string; format: 'csv'|'xlsx' };
  columns: { name: string | null; country: string | null };
  options: { country: string | null; ai_fallback: boolean; best_guess: boolean; delete_after_download: boolean };
  rows: { total: number; processed: number; identified: number | null };
  progress: number;
  credits: { reserved: number | null; charged: number | null };
  summary: { male: number; female: number; unknown: number; from_llm: number } | null;
  data_version: string | null;
  /** Set when status is 'failed'. Branch on `code`. */
  error: { code: BatchErrorCode; message: string } | null;
  result: { url: string; format: 'csv'|'xlsx'; expires_at: string | null } | null;
  /** Only while status is 'uploaded'. */
  inspection: {
    columns: string[]; preview: string[][];
    guessed_name_column: string | null; guessed_country_column: string | null;
    credits_needed: number; credits_available: number;
  } | null;
  poll_after_seconds: number | null;
  created_at: string | null; started_at: string | null; finished_at: string | null; expires_at: string | null;
}
export interface BatchList { data: BatchJob[]; page: number; per_page: number; total: number; has_more: boolean }
export interface WaitOptions { timeoutMs?: number; signal?: AbortSignal; onProgress?: (job: BatchJob) => void }
export interface Batches {
  create(file: Blob | ArrayBuffer | Uint8Array, options?: BatchCreateOptions): Promise<BatchJob>;
  start(id: string, options: BatchSettings & { name_column: string }): Promise<BatchJob>;
  get(id: string): Promise<BatchJob>;
  list(options?: { limit?: number; page?: number }): Promise<BatchList>;
  cancel(id: string): Promise<void>;
  /** Resolves with the job once completed, failed or cancelled; a failed job is not thrown. */
  wait(id: string, options?: WaitOptions): Promise<BatchJob>;
  download(id: string): Promise<Blob>;
}
/** New types can be added: answer 2xx to one you do not handle and ignore it. */
export type WebhookEventType = 'batch.completed'|'batch.failed'|'credits.low'|'credits.depleted'|'webhook.test';
/** `data.object` of credits.low and credits.depleted. Checked hourly; a heads-up, not a balance feed. */
export interface CreditsAlert {
  kind: 'credits_low'|'credits_out';
  /** Same as credits_remaining on /me: purchased, subscription and today's free credits. */
  credits_remaining: number;
  purchased: number;
  subscription: number;
  /** Average credits per day over the last 14 days. */
  daily_burn: number;
  /** credits.low only. */
  runway_days?: number;
  since: string;
}
export interface WebhookEvent<T = BatchJob | CreditsAlert | { message: string }> {
  /** Stable across retries: deduplicate on it. */
  id: string;
  type: WebhookEventType;
  created_at: string;
  api_version: 'v1';
  data: { object: T };
}
/** Thrown when a webhook request fails verification. Answer it with 400 and do nothing else. */
export class NameGenderWebhookError extends Error {}
export const webhooks: {
  /**
   * Checks NameGender-Signature and returns the parsed event.
   * `rawBody` must be the body exactly as received, not re-serialised JSON.
   */
  verify(
    rawBody: string | Uint8Array | ArrayBuffer,
    signatureHeader: string | null | undefined,
    secret: string,
    options?: { toleranceSeconds?: number; now?: number },
  ): Promise<WebhookEvent>;
};
export interface ClientOptions { baseUrl?: string; fetch?: typeof globalThis.fetch }
/** Thrown for any non-2xx response. `body` is the error body: { error, message, request_id, docs }. */
export class NameGenderError extends Error { status: number; body: unknown }
export class NameGender {
  constructor(apiKey: string, options?: ClientOptions);
  name(name: string, options?: Options): Promise<GenderResponse>;
  email(email: string, options?: Options): Promise<GenderResponse>;
  username(username: string, options?: Options): Promise<GenderResponse>;
  bulk(names: string | Iterable<string>, options?: Options): Promise<BulkResponse>;
  countries(name: string, options?: CountriesOptions): Promise<CountriesResponse>;
  account(): Promise<AccountResponse>;
  /** File jobs: upload a CSV or XLSX file, get it back with gender columns added. */
  readonly batches: Batches;
}
