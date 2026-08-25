export interface Options { country?: string; askToAI?: boolean; forceToGenderize?: boolean; type?: 'name'|'email'|'username' }
export interface ClientOptions { baseUrl?: string; fetch?: typeof globalThis.fetch }
export class GenderScopeError extends Error { status: number; body: unknown }
export class GenderScope {
  constructor(apiKey: string, options?: ClientOptions);
  name(name: string, options?: Options): Promise<any>;
  email(email: string, options?: Options): Promise<any>;
  username(username: string, options?: Options): Promise<any>;
  bulk(names: string[], options?: Options): Promise<any>;
  account(): Promise<any>;
}
