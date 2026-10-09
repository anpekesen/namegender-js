export interface Options {
  /** ISO 3166-1 alpha-2 code. Always wins over `locale` and `ip`. */
  country?: string;
  /** Language tag such as `it-IT`; its region is the country when `country` is not sent. `en` sets none. */
  locale?: string;
  /** End user IP address; its country is used when neither `country` nor a regional `locale` is sent. Not stored. */
  ip?: string;
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
/** Where the country came from; null when the answer is worldwide. */
export type CountrySource = 'country'|'locale'|'ip'|null;
export interface GenderResponse extends Envelope, GenderResult { country_source: CountrySource }
export interface BulkResponse extends Envelope {
  took_ms: number;
  country_source: CountrySource;
  summary: { total: number; identified: number; unknown: number; match_rate: number };
  results: GenderResult[];
}
export interface SalutationOptions {
  /** Language of the salutation: en, en-US, en-GB, de, de-AT, de-CH, fr, es, it, pt, pt-PT, pt-BR, nl, tr, pl, ja. Default: the language of `locale`, else the main language of the country, else en. Anything else is a 422. */
  language?: string;
  /** Country hint for the gender lookup, as in `Options`. */
  country?: string;
  locale?: string;
  ip?: string;
  /** Known gender; skips the lookup. `neutral` always gives the neutral form. */
  gender?: 'male'|'female'|'neutral';
  /** 50–100, default 90. Below it the neutral form is used. */
  min_probability?: number;
  /** Academic title kept in a separate field, e.g. `Dr.`; used in de and en. */
  title?: string;
}
export interface SalutationSingleOptions extends SalutationOptions {
  /** Instead of `name`, when the parts are stored separately. Not parsed. */
  first_name?: string;
  last_name?: string;
}
export type SalutationReason = 'gender_unknown'|'below_min_probability'|'gender_neutral_requested'|'no_surname'|'no_given_name'|'language_ungendered';
export interface SalutationResult {
  query: string;
  language: string;
  form: 'gendered'|'neutral'|'organization';
  /** Why the form is not gendered; null when it is. */
  reason: SalutationReason | null;
  salutation: { formal: string; informal: string; neutral: string };
  parts: { opening: string | null; courtesy: string | null; academic: string | null; name: string | null };
  gender: 'male'|'female'|null;
  gender_source: 'lookup'|'input'|'title'|null;
  probability: number | null;
  confidence: string | null;
  first_name: string | null;
  last_name: string | null;
  name_type: 'personal'|'organization'|'role';
  country: string | null;
}
export interface SalutationResponse extends Envelope, SalutationResult { country_source: CountrySource }
export interface SalutationBulkResponse extends Envelope {
  took_ms: number;
  country_source: CountrySource;
  language: string;
  summary: { total: number; gendered: number; neutral: number; organization: number };
  /** In input order. */
  results: SalutationResult[];
}
export interface NameCheckOptions {
  /** Country hint, as in `Options`. */
  country?: string;
  locale?: string;
  ip?: string;
}
export interface NameCheckSingleOptions extends NameCheckOptions {
  /** Instead of `name`, when the parts are stored separately. Not parsed. */
  first_name?: string;
  last_name?: string;
}
export type NameCheckSignalCode = 'keyboard_pattern'|'repeated_characters'|'placeholder'|'placeholder_pair'|'fictional_character'|'profanity'
  |'contains_url_or_email'|'contains_digits'|'contains_symbols'|'organization_name'|'too_long'|'no_vowels'
  |'same_first_and_last'|'initials_only'|'single_name'|'first_name_not_found'|'first_name_attested'|'script_not_covered';
export interface NameCheckSignal {
  code: NameCheckSignalCode;
  severity: 'high'|'medium'|'low'|'info'|'positive';
  /** Which part of the name the signal is about; null when it is not tied to one. */
  part: 'full'|'first_name'|'last_name'|null;
  value: string | null;
}
/**
 * Whether a name typed into a form looks like a real person's name. It never
 * calls a name fake: use it to flag records for review, not to reject people.
 */
export interface NameCheckResult {
  query: string;
  assessment: 'plausible'|'suspicious'|'implausible';
  /** 0–100. */
  score: number;
  signals: NameCheckSignal[];
  first_name: string | null;
  last_name: string | null;
  name_type: 'personal'|'organization'|'role';
  evidence: { first_name_status: 'counted'|'attested'|'not_found'|null; first_name_counted_records: number };
}
export interface NameCheckResponse extends Envelope, NameCheckResult { country_source: CountrySource }
export interface NameCheckBulkResponse extends Envelope {
  took_ms: number;
  country_source: CountrySource;
  summary: { total: number; plausible: number; suspicious: number; implausible: number };
  /** In input order. */
  results: NameCheckResult[];
}
export interface AgeOptions {
  /** Use only one gender's records. Men called Leslie are far older than women. */
  gender?: 'male'|'female';
  /** Country hint, as in `Options`. Covered: US, FR, NO; without a hint the US series is used. */
  country?: string;
  locale?: string;
  ip?: string;
}
export interface AgeRange { low: number; high: number }
/**
 * How old the living people with a first name are. It describes a group, not
 * a person: never use it to decide anything about one person.
 */
export interface AgeResult {
  name: string;
  first_name: string | null;
  /** The gender filter that was sent, or null for both. */
  gender: 'male'|'female'|null;
  /** Median age; null with a `reason`. */
  age: number | null;
  /** The middle half (25th to 75th percentile). */
  age_range: AgeRange | null;
  /** The middle 80% (10th to 90th percentile). */
  age_range_80: AgeRange | null;
  birth_year: number | null;
  /** Estimated living people with the name in the series. */
  sample_size: number;
  /** Registered births with the name over the whole series. */
  births: number;
  country: string;
  /** `default`: no hint was sent and the US series was used. */
  country_source: 'country'|'locale'|'ip'|'default';
  source: 'ssa'|'insee'|'ssb'|null;
  /** Birth years in the series, e.g. "1880-2024". */
  series: string | null;
  reference_year: number;
  /** `country_not_covered` costs no credit. */
  reason: 'not_found'|'insufficient_data'|'country_not_covered'|null;
}
/** The age endpoints carry no `data_version`: their data is not the name-gender snapshot. */
export interface AgeResponse extends Omit<Envelope, 'data_version'>, AgeResult {}
export interface AgeBulkResponse extends Omit<Envelope, 'data_version'> {
  country_source: 'country'|'locale'|'ip'|'default';
  /** In input order. */
  results: AgeResult[];
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
  /** One credit. Pass `null` as `name` (or only the options) to send `first_name` and `last_name` instead. */
  salutation(name: string | null, options?: SalutationSingleOptions): Promise<SalutationResponse>;
  salutation(options: SalutationSingleOptions & { name?: string }): Promise<SalutationResponse>;
  /** 1–100 names, one credit each; the options apply to every name. */
  salutationBulk(names: string | Iterable<string>, options?: SalutationOptions): Promise<SalutationBulkResponse>;
  /** One credit. Pass `null` as `name` (or only the options) to send `first_name` and `last_name` instead. */
  nameCheck(name: string | null, options?: NameCheckSingleOptions): Promise<NameCheckResponse>;
  nameCheck(options: NameCheckSingleOptions & { name?: string }): Promise<NameCheckResponse>;
  /** 1–100 names, one credit each; the options apply to every name. */
  nameCheckBulk(names: string | Iterable<string>, options?: NameCheckOptions): Promise<NameCheckBulkResponse>;
  /** One credit; none when the country is not covered. */
  age(name: string, options?: AgeOptions): Promise<AgeResponse>;
  /** 1–100 names, one credit each; the options apply to every name. */
  ageBulk(names: string | Iterable<string>, options?: AgeOptions): Promise<AgeBulkResponse>;
  account(): Promise<AccountResponse>;
  /** File jobs: upload a CSV or XLSX file, get it back with gender columns added. */
  readonly batches: Batches;
}
