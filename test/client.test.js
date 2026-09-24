import test from 'node:test';
import assert from 'node:assert/strict';
import { NameGender } from '../src/index.js';

test('sends authenticated JSON', async () => {
  let request;
  const client = new NameGender('secret', { baseUrl: 'https://example.test/api/v1/', fetch: async (url, init) => {
    request = { url, init };
    return { ok: true, json: async () => ({ gender: 'female' }) };
  }});
  const result = await client.name('Ayşe', { country: 'TR' });
  assert.equal(result.gender, 'female');
  assert.equal(request.url, 'https://example.test/api/v1/gender');
  assert.equal(request.init.headers.Authorization, 'Bearer secret');
  assert.deepEqual(JSON.parse(request.init.body), { name: 'Ayşe', country: 'TR' });
});

test('requests the country distribution', async () => {
  let request;
  const client = new NameGender('secret', { baseUrl: 'https://example.test/api/v1/', fetch: async (url, init) => {
    request = { url, init };
    return { ok: true, json: async () => ({ name: 'Mehmet', registrations: [{ country: 'FR', share: 58.97 }], attested_in: ['FR', 'TR'] }) };
  }});
  const result = await client.countries('Mehmet', { limit: 10 });
  assert.deepEqual(result.attested_in, ['FR', 'TR']);
  assert.equal(request.url, 'https://example.test/api/v1/gender/countries');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.headers.Authorization, 'Bearer secret');
  assert.deepEqual(JSON.parse(request.init.body), { name: 'Mehmet', limit: 10 });
});

test('sends the lookup options by their NameGender names', async () => {
  let request;
  const client = new NameGender('secret', { fetch: async (url, init) => {
    request = { url, init };
    return { ok: true, json: async () => ({ query: 'Andrea', gender: 'male', sample_size: 120, took_ms: 3, credits_remaining: 9 }) };
  }});
  const result = await client.name('Andrea', { country: 'IT', ai_fallback: true, best_guess: true });
  assert.equal(result.sample_size, 120);
  assert.equal(request.url, 'https://namegender.com/api/v1/gender');
  assert.deepEqual(JSON.parse(request.init.body), { name: 'Andrea', country: 'IT', ai_fallback: true, best_guess: true });
});

test('throws on a non-2xx status and keeps the error body', async () => {
  const client = new NameGender('secret', { fetch: async () => ({
    ok: false, status: 402, json: async () => ({ error: 'no_credits', message: 'Out of credits.', request_id: 'req_1', docs: 'https://namegender.com/docs' }),
  })});
  await assert.rejects(() => client.account(), (error) => {
    assert.equal(error.status, 402);
    assert.equal(error.body.error, 'no_credits');
    assert.equal(error.message, 'Out of credits.');
    return true;
  });
});

test('bulk always sends names as an array', async () => {
  const bodies = [];
  const client = new NameGender('secret', { fetch: async (url, init) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ results: [], summary: {} }) };
  }});

  await client.bulk('Ayşe');
  await client.bulk(new Set(['Ayşe', 'Mehmet']));
  await client.bulk(['Priya']);

  assert.deepEqual(bodies.map((b) => b.names), [['Ayşe'], ['Ayşe', 'Mehmet'], ['Priya']]);
});

const job = (overrides = {}) => ({ id: 'B-1', status: 'queued', poll_after_seconds: 0, ...overrides });

test('uploads a file as multipart with an idempotency key', async () => {
  let request;
  const client = new NameGender('secret', { fetch: async (url, init) => {
    request = { url, init };
    return { ok: true, status: 202, json: async () => job() };
  }});

  const result = await client.batches.create(new TextEncoder().encode('ad\nAyşe\n'), {
    filename: 'customers.csv', name_column: 'ad', country: 'TR', best_guess: true,
  });

  assert.equal(result.id, 'B-1');
  assert.equal(request.url, 'https://namegender.com/api/v1/batches');
  assert.ok(request.init.body instanceof FormData);
  assert.equal(request.init.headers['Content-Type'], undefined, 'FormData must set its own boundary');
  assert.ok(request.init.headers['Idempotency-Key']);
  assert.equal(request.init.body.get('name_column'), 'ad');
  assert.equal(request.init.body.get('best_guess'), 'true');
  assert.equal(request.init.body.get('file').name, 'customers.csv');
  assert.equal(await request.init.body.get('file').text(), 'ad\nAyşe\n');
});

test('retries an upload with the same idempotency key, but not a refusal', async () => {
  const keys = [];
  let calls = 0;
  const client = new NameGender('secret', { fetch: async (url, init) => {
    keys.push(init.headers['Idempotency-Key']);
    calls++;
    if (calls === 1) throw new TypeError('fetch failed');
    return { ok: true, status: 202, json: async () => job() };
  }});

  await client.batches.create(new Blob(['ad\nAyşe\n']), { filename: 'a.csv', name_column: 'ad' });
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1]);

  let refused = 0;
  const strict = new NameGender('secret', { fetch: async () => {
    refused++;
    return { ok: false, status: 402, json: async () => ({ error: 'no_credits' }) };
  }});
  await assert.rejects(() => strict.batches.create(new Blob(['x']), { filename: 'a.csv', name_column: 'ad' }));
  assert.equal(refused, 1);
});

test('requires a filename for raw bytes', async () => {
  const client = new NameGender('secret', { fetch: async () => assert.fail('no request expected') });
  await assert.rejects(() => client.batches.create(new Uint8Array([1])), TypeError);
});

test('waits until the job finishes and reports progress', async () => {
  const statuses = ['queued', 'processing', 'completed'];
  const seen = [];
  const client = new NameGender('secret', { fetch: async (url) => {
    assert.equal(url, 'https://namegender.com/api/v1/batches/B-1');
    return { ok: true, status: 200, json: async () => job({ status: statuses.shift() }) };
  }});

  const result = await client.batches.wait('B-1', { onProgress: (j) => seen.push(j.status) });
  assert.equal(result.status, 'completed');
  assert.deepEqual(seen, ['queued', 'processing', 'completed']);
});

test('cancels, lists and downloads', async () => {
  const requests = [];
  const client = new NameGender('secret', { fetch: async (url, init) => {
    requests.push(`${init.method} ${url}`);
    if (init.method === 'DELETE') return { ok: true, status: 204, json: async () => { throw new Error('no body'); } };
    if (url.endsWith('/result')) return { ok: true, status: 200, blob: async () => new Blob(['ad,gender\n']) };
    return { ok: true, status: 200, json: async () => ({ data: [], total: 0 }) };
  }});

  assert.equal(await client.batches.cancel('B-1'), undefined);
  await client.batches.list({ limit: 5 });
  const file = await client.batches.download('B-1');
  assert.equal(await file.text(), 'ad,gender\n');

  assert.deepEqual(requests, [
    'DELETE https://namegender.com/api/v1/batches/B-1',
    'GET https://namegender.com/api/v1/batches?limit=5',
    'GET https://namegender.com/api/v1/batches/B-1/result',
  ]);
});

// Same vector as the server's WebhookDeliveryTest, computed independently.
const VECTOR = {
  secret: 'whsec_test_vector',
  body: '{"id":"evt_1","type":"webhook.test"}',
  header: 't=1700000000,v1=857fcddfea47617c448b7a8e6537bbd59c9922a37c5273b2709812fbadb29e50',
  now: 1700000000,
};

test('verifies a webhook against the shared test vector', async () => {
  const { webhooks } = await import('../src/index.js');
  const event = await webhooks.verify(VECTOR.body, VECTOR.header, VECTOR.secret, { now: VECTOR.now + 60 });
  assert.equal(event.id, 'evt_1');

  // Buffer and Uint8Array bodies are the same bytes.
  await webhooks.verify(Buffer.from(VECTOR.body), VECTOR.header, VECTOR.secret, { now: VECTOR.now });
  // A second v1 (secret rotation) is accepted when either matches.
  await webhooks.verify(VECTOR.body, `t=1700000000,v1=${'0'.repeat(64)},v1=857fcddfea47617c448b7a8e6537bbd59c9922a37c5273b2709812fbadb29e50`, VECTOR.secret, { now: VECTOR.now });
});

test('rejects a tampered body, a wrong secret, an old timestamp and a missing header', async () => {
  const { webhooks, NameGenderWebhookError } = await import('../src/index.js');
  const reject = (...args) => assert.rejects(() => webhooks.verify(...args), NameGenderWebhookError);

  await reject(VECTOR.body.replace('evt_1', 'evt_2'), VECTOR.header, VECTOR.secret, { now: VECTOR.now });
  await reject(VECTOR.body, VECTOR.header, 'whsec_other', { now: VECTOR.now });
  await reject(VECTOR.body, VECTOR.header, VECTOR.secret, { now: VECTOR.now + 301 });
  await reject(VECTOR.body, undefined, VECTOR.secret, { now: VECTOR.now });
  await reject(VECTOR.body, 't=abc,v1=', VECTOR.secret, { now: VECTOR.now });
  await assert.rejects(() => webhooks.verify({ id: 'evt_1' }, VECTOR.header, VECTOR.secret, { now: VECTOR.now }), TypeError);
});
