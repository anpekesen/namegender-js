export class GenderScopeError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'GenderScopeError';
    this.status = status;
    this.body = body;
  }
}

export class GenderScope {
  constructor(apiKey, options = {}) {
    if (!apiKey) throw new TypeError('apiKey is required');
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl || 'https://genderscope.io/api/v1').replace(/\/$/, '');
    this.fetch = options.fetch || globalThis.fetch;
    if (!this.fetch) throw new TypeError('A fetch implementation is required');
  }

  name(name, options = {}) { return this.#post('/gender', { name, ...options }); }
  email(email, options = {}) { return this.#post('/gender/email', { email, ...options }); }
  username(username, options = {}) { return this.#post('/gender/username', { username, ...options }); }
  bulk(names, options = {}) { return this.#post('/gender/bulk', { names, ...options }); }
  account() { return this.#request('/me', { method: 'GET' }); }

  async #post(path, body) {
    return this.#request(path, { method: 'POST', body: JSON.stringify(body) });
  }

  async #request(path, init) {
    const response = await this.fetch(this.baseUrl + path, {
      ...init,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
        ...init.headers,
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new GenderScopeError(body?.message || `HTTP ${response.status}`, response.status, body);
    return body;
  }
}
