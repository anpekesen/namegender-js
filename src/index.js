export class NameGenderError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'NameGenderError';
    this.status = status;
    this.body = body;
  }
}

export class NameGenderWebhookError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NameGenderWebhookError';
  }
}

const encoder = new TextEncoder();

const toBytes = (body) => {
  if (typeof body === 'string') return encoder.encode(body);
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  throw new TypeError('rawBody must be the raw request body: a string, Buffer, Uint8Array or ArrayBuffer');
};

// Constant-time: the comparison must not reveal how many leading characters matched.
const safeEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/**
 * Webhook signature check.
 *
 * Uses Web Crypto, so it runs on Node 18+, Deno, Bun and edge runtimes alike.
 * Pass the body exactly as received: a framework that parses JSON and
 * serialises it again (Express's json() middleware, for one) changes the bytes
 * and the signature no longer matches.
 */
export const webhooks = {
  async verify(rawBody, signatureHeader, secret, { toleranceSeconds = 300, now = Date.now() / 1000 } = {}) {
    if (!secret) throw new TypeError('secret is required');
    if (!signatureHeader) throw new NameGenderWebhookError('Missing NameGender-Signature header');

    let timestamp = null;
    const signatures = [];
    for (const part of String(signatureHeader).split(',')) {
      const [key, value] = part.trim().split('=', 2);
      if (key === 't') timestamp = Number(value);
      if (key === 'v1' && value) signatures.push(value);
    }
    if (!Number.isInteger(timestamp) || signatures.length === 0) {
      throw new NameGenderWebhookError('Malformed NameGender-Signature header');
    }
    if (Math.abs(now - timestamp) > toleranceSeconds) {
      throw new NameGenderWebhookError('Webhook timestamp is outside the tolerance window');
    }

    const bytes = toBytes(rawBody);
    const key = await globalThis.crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signed = new Uint8Array(encoder.encode(`${timestamp}.`).length + bytes.length);
    signed.set(encoder.encode(`${timestamp}.`));
    signed.set(bytes, encoder.encode(`${timestamp}.`).length);
    const mac = new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', key, signed));
    const expected = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');

    if (!signatures.some((signature) => safeEqual(signature, expected))) {
      throw new NameGenderWebhookError('Webhook signature does not match');
    }

    return JSON.parse(new TextDecoder().decode(bytes));
  },
};

const FINISHED = new Set(['completed', 'failed', 'cancelled']);

// Statuses worth retrying an upload for: the request may never have reached
// the application. Everything else (402, 422, 429 too_many_batches) would
// fail the same way again.
const RETRYABLE = new Set([502, 503, 504]);

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(signal.reason);
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

const newIdempotencyKey = () => globalThis.crypto?.randomUUID?.()
  ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** File jobs: upload a CSV or XLSX file, get it back with gender columns added. */
class Batches {
  #send;
  #request;

  constructor(send, request) {
    this.#send = send;
    this.#request = request;
  }

  /**
   * Upload a file and, unless `start: false`, start it.
   *
   * `file` is a Blob or File (in Node 20+, `await fs.openAsBlob(path)`), or
   * bytes (Uint8Array, ArrayBuffer) together with `filename`. The extension
   * of the file name tells the API whether it is CSV or XLSX.
   *
   * One Idempotency-Key is used for every attempt of this call, so a retry
   * after a dropped connection returns the first job instead of opening a
   * second one and reserving credit twice.
   */
  async create(file, options = {}) {
    const { filename, idempotencyKey = newIdempotencyKey(), retries = 2, ...fields } = options;
    const blob = file instanceof Blob ? file : new Blob([file]);
    const name = filename ?? file?.name;
    if (!name) throw new TypeError('filename is required when file is not a File');

    const form = () => {
      const data = new FormData();
      data.append('file', blob, name);
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null) data.append(key, String(value));
      }
      return data;
    };

    for (let attempt = 0; ; attempt++) {
      try {
        return await this.#request('/batches', {
          method: 'POST',
          body: form(),
          headers: { 'Idempotency-Key': idempotencyKey },
        });
      } catch (error) {
        const retryable = !(error instanceof NameGenderError) || RETRYABLE.has(error.status);
        if (!retryable || attempt >= retries) throw error;
        await sleep(1000 * 2 ** attempt);
      }
    }
  }

  /** Start a job uploaded with `start: false`. `name_column` is required. */
  start(id, options) {
    return this.#request(`/batches/${encodeURIComponent(id)}/start`, { method: 'POST', body: JSON.stringify(options) });
  }

  get(id) {
    return this.#request(`/batches/${encodeURIComponent(id)}`, { method: 'GET' });
  }

  /** Newest first. Includes jobs started from the dashboard. */
  list(options = {}) {
    const query = new URLSearchParams(Object.entries(options).filter(([, v]) => v != null)).toString();
    return this.#request(`/batches${query ? `?${query}` : ''}`, { method: 'GET' });
  }

  /** Cancel a job that has not started (credit is returned), or delete a finished one. */
  async cancel(id) {
    await this.#request(`/batches/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  /**
   * Poll until the job is completed, failed or cancelled, and return it.
   * A failed job is returned, not thrown: check `status` and `error.code`.
   */
  async wait(id, { timeoutMs = 60 * 60 * 1000, signal, onProgress } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const job = await this.get(id);
      onProgress?.(job);
      if (FINISHED.has(job.status) || job.status === 'uploaded') return job;
      const wait = (job.poll_after_seconds ?? 5) * 1000;
      if (Date.now() + wait > deadline) throw new NameGenderError(`Timed out waiting for ${id}`, 0, job);
      await sleep(wait, signal);
    }
  }

  /** The result file as a Blob, in the format that was uploaded. */
  async download(id) {
    const response = await this.#send(`/batches/${encodeURIComponent(id)}/result`, { method: 'GET' });
    return response.blob();
  }
}

export class NameGender {
  constructor(apiKey, options = {}) {
    if (!apiKey) throw new TypeError('apiKey is required');
    this.apiKey = apiKey;
    this.baseUrl = (options.baseUrl || 'https://namegender.com/api/v1').replace(/\/$/, '');
    this.fetch = options.fetch || globalThis.fetch;
    if (!this.fetch) throw new TypeError('A fetch implementation is required');
    this.batches = new Batches((path, init) => this.#send(path, init), (path, init) => this.#request(path, init));
  }

  name(name, options = {}) { return this.#post('/gender', { name, ...options }); }
  email(email, options = {}) { return this.#post('/gender/email', { email, ...options }); }
  username(username, options = {}) { return this.#post('/gender/username', { username, ...options }); }
  // A string is one name, and any iterable (a Set, for example) becomes an
  // array: the API accepts only a JSON array, and JSON.stringify turns a Set
  // into {}.
  bulk(names, options = {}) {
    const list = typeof names === 'string' ? [names] : Array.from(names);
    return this.#post('/gender/bulk', { names: list, ...options });
  }
  countries(name, options = {}) { return this.#post('/gender/countries', { name, ...options }); }
  account() { return this.#request('/me', { method: 'GET' }); }

  async #post(path, body) {
    return this.#request(path, { method: 'POST', body: JSON.stringify(body) });
  }

  async #request(path, init) {
    const response = await this.#send(path, init);
    // 204 (a cancelled job) has no body.
    return response.status === 204 ? null : response.json().catch(() => null);
  }

  async #send(path, init) {
    const response = await this.fetch(this.baseUrl + path, {
      ...init,
      headers: {
        Accept: 'application/json',
        // FormData sets its own multipart Content-Type with the boundary.
        ...(typeof init.body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${this.apiKey}`,
        ...init.headers,
      },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new NameGenderError(body?.message || `HTTP ${response.status}`, response.status, body);
    }
    return response;
  }
}
