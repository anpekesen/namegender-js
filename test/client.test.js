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
