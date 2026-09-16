export interface Options { country?: string; askToAI?: boolean; forceToGenderize?: boolean; type?: 'name'|'email'|'username' }
export interface CountriesOptions { limit?: number }
export interface CountryRegistration { country: string; count: number; share: number; gender: 'male'|'female'|null; probability: number; source: string }
/**
 * Country distribution of a name. Not a country-of-origin or ethnicity inference:
 * `registrations` is counted volume, comparable only among countries that publish
 * counted birth statistics; `attested_in` is presence with no weight attached.
 */
export interface CountriesResponse {
  status: boolean; used_credits: number; remaining_credits: number; expires: null; data_version: string | null; request_id: string | null; duration: string;
  name: string;
  basis: { counted_sources: string[]; counted_countries: number; attested_countries: number; note: string };
  registrations: CountryRegistration[];
  attested_in: string[];
}
export interface ClientOptions { baseUrl?: string; fetch?: typeof globalThis.fetch }
export class NameGenderError extends Error { status: number; body: unknown }
export class NameGender {
  constructor(apiKey: string, options?: ClientOptions);
  name(name: string, options?: Options): Promise<any>;
  email(email: string, options?: Options): Promise<any>;
  username(username: string, options?: Options): Promise<any>;
  bulk(names: string[], options?: Options): Promise<any>;
  countries(name: string, options?: CountriesOptions): Promise<CountriesResponse>;
  account(): Promise<any>;
}
