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
