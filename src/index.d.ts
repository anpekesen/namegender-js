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
}
