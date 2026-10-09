import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/namegender.js', import.meta.url));
const requests = [];
let server;
let baseUrl;

function result(query, country = null) {
  const male = country === 'IT' || query === 'Liam';
  return {
    query, name: query, gender: query === 'Qzzxvv' ? null : male ? 'male' : 'female',
    probability: query === 'Qzzxvv' ? 0 : 97, sample_size: query === 'Qzzxvv' ? 0 : 12345,
    country, source: 'db', confidence: 'high', matched_as: null, took_ms: 1,
    first_name: query, middle_name: null, last_name: null,
  };
}

// "Acme GmbH" is an organization, "Kim Lee" has no certain gender.
function salutation(query, language = 'tr') {
  if (query === 'Acme GmbH') {
    return { query, language, form: 'organization', reason: null,
      salutation: { formal: 'Sayın Yetkili,', informal: 'Merhaba,', neutral: 'Sayın Yetkili,' },
      parts: { opening: 'Sayın', courtesy: null, academic: null, name: null },
      gender: null, gender_source: null, probability: null, confidence: null,
      first_name: null, last_name: null, name_type: 'organization', country: null };
  }
  const [first, last] = query.split(' ');
  if (query === 'Kim Lee') {
    return { query, language, form: 'neutral', reason: 'gender_unknown',
      salutation: { formal: `Sayın ${first} ${last},`, informal: `Merhaba ${first},`, neutral: `Sayın ${first} ${last},` },
      parts: { opening: 'Sayın', courtesy: null, academic: null, name: `${first} ${last}` },
      gender: null, gender_source: null, probability: null, confidence: null,
      first_name: first, last_name: last, name_type: 'personal', country: null };
  }
  return { query, language, form: 'gendered', reason: null,
    salutation: { formal: `Sayın ${first} Bey,`, informal: `Merhaba ${first},`, neutral: `Sayın ${first} ${last},` },
    parts: { opening: 'Sayın', courtesy: 'Bey', academic: null, name: first },
    gender: 'male', gender_source: 'lookup', probability: 99, confidence: 'high',
    first_name: first, last_name: last ?? null, name_type: 'personal', country: 'TR' };
}

// "asdf qwerty" is implausible, "Mickey Mouse" suspicious, anything else plausible.
function nameCheck(query) {
  const [first, last = null] = query.split(' ');
  const base = { query, first_name: first, last_name: last, name_type: 'personal',
    evidence: { first_name_status: 'counted', first_name_counted_records: 5000 } };
  if (query === 'asdf qwerty') {
    return { ...base, assessment: 'implausible', score: 0, evidence: { first_name_status: 'not_found', first_name_counted_records: 0 }, signals: [
      { code: 'keyboard_pattern', severity: 'high', part: 'first_name', value: 'asdf' },
      { code: 'keyboard_pattern', severity: 'high', part: 'last_name', value: 'qwerty' },
      { code: 'first_name_not_found', severity: 'medium', part: 'first_name', value: 'asdf' },
    ] };
  }
  if (query === 'Mickey Mouse') {
    return { ...base, assessment: 'suspicious', score: 40, signals: [
      { code: 'fictional_character', severity: 'medium', part: 'full', value: 'Mickey Mouse' },
      { code: 'first_name_attested', severity: 'info', part: 'first_name', value: 'Mickey' },
    ] };
  }
  return { ...base, assessment: 'plausible', score: 92, signals: [{ code: 'first_name_attested', severity: 'positive', part: 'first_name', value: first }] };
}

// Brittany is a 1990 name; DE is not covered; Xqzv is not in the series.
function ageResult(name, country = 'US', gender = null) {
  const base = { name, first_name: name, gender, age: null, age_range: null, age_range_80: null, birth_year: null,
    sample_size: 0, births: 0, country, country_source: country === 'US' ? 'default' : 'country',
    source: country === 'DE' ? null : 'ssa', series: country === 'DE' ? null : '1880-2024', reference_year: 2026, reason: null };
  if (country === 'DE') return { ...base, reason: 'country_not_covered' };
  if (name === 'Xqzv') return { ...base, reason: 'not_found' };
  return { ...base, age: 36, age_range: { low: 32, high: 38 }, age_range_80: { low: 28, high: 41 }, birth_year: 1990,
    sample_size: 353775, births: 361434 };
}

before(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      requests.push({ method: req.method, url: req.url, body, auth: req.headers.authorization });
      res.setHeader('Content-Type', 'application/json');
      if (req.headers.authorization !== 'Bearer ng_live_test') {
        res.statusCode = 401;
        res.end(JSON.stringify({ error: 'invalid_key', message: 'The API key is not valid.' }));
        return;
      }
      const envelope = { credits_charged: 1, credits_remaining: 99, data_version: '2026.10', request_id: 'req_1' };
      if (req.url === '/gender/bulk') {
        const country = body.country || (body.locale ? body.locale.slice(-2).toUpperCase() : null);
        res.end(JSON.stringify({ ...envelope, took_ms: 2, country_source: body.country ? 'country' : null,
          summary: { total: body.names.length, identified: body.names.length, unknown: 0, match_rate: 100 },
          results: body.names.map((n) => result(n, country)) }));
        return;
      }
      if (req.url === '/salutation/bulk') {
        const results = body.names.map((n) => salutation(n, body.language));
        const count = (form) => results.filter((r) => r.form === form).length;
        res.end(JSON.stringify({ ...envelope, credits_charged: results.length, took_ms: 2, country_source: null, language: body.language,
          summary: { total: results.length, gendered: count('gendered'), neutral: count('neutral'), organization: count('organization') },
          results }));
        return;
      }
      if (req.url === '/salutation') {
        if (body.language === 'xx') {
          res.statusCode = 422;
          res.end(JSON.stringify({ error: 'invalid_input', message: 'Unsupported language.', field: 'language', supported: ['en', 'tr'] }));
          return;
        }
        res.end(JSON.stringify({ ...envelope, country_source: body.country ? 'country' : null, ...salutation(body.name, body.language) }));
        return;
      }
      if (req.url === '/name-check/bulk') {
        const results = body.names.map(nameCheck);
        const count = (a) => results.filter((r) => r.assessment === a).length;
        res.end(JSON.stringify({ ...envelope, credits_charged: results.length, took_ms: 2, country_source: null,
          summary: { total: results.length, plausible: count('plausible'), suspicious: count('suspicious'), implausible: count('implausible') },
          results }));
        return;
      }
      if (req.url === '/name-check') {
        if (body.name === '') {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'missing_input', message: 'Send name, or first_name and last_name.' }));
          return;
        }
        res.end(JSON.stringify({ ...envelope, country_source: body.country ? 'country' : body.locale ? 'locale' : null, ...nameCheck(body.name) }));
        return;
      }
      if (req.url === '/age/bulk') {
        const results = body.names.map((n) => ageResult(n, body.country, body.gender ?? null));
        res.end(JSON.stringify({ credits_charged: body.country === 'DE' ? 0 : results.length, credits_remaining: 99, request_id: 'req_1',
          country_source: results[0].country_source, results }));
        return;
      }
      if (req.url === '/age') {
        res.end(JSON.stringify({ credits_charged: body.country === 'DE' ? 0 : 1, credits_remaining: 99, request_id: 'req_1',
          ...ageResult(body.name, body.country, body.gender ?? null) }));
        return;
      }
      if (req.url === '/me') {
        res.end(JSON.stringify({ email: 'dev@example.com', credits_remaining: 99, free_today: 50 }));
        return;
      }
      const value = body.name ?? body.email ?? body.username;
      const country = body.country || (body.locale ? body.locale.slice(-2).toUpperCase() : null);
      res.end(JSON.stringify({ ...envelope, country_source: body.country ? 'country' : body.locale ? 'locale' : null, ...result(value, country) }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

function run(args, { input, key = 'ng_live_test' } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      env: { ...process.env, NAMEGENDER_API_KEY: key, NAMEGENDER_BASE_URL: baseUrl },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    if (input !== undefined) child.stdin.end(input); else child.stdin.end();
  });
}

test('one name prints a table and sends country', async () => {
  requests.length = 0;
  const { code, stdout } = await run(['Andrea', '--country', 'IT']);
  assert.equal(code, 0);
  assert.match(stdout, /QUERY\s+GENDER/);
  assert.match(stdout, /Andrea\s+male\s+97%\s+12,345\s+IT/);
  assert.deepEqual(requests[0].body, { name: 'Andrea', country: 'IT' });
  assert.equal(requests[0].url, '/gender');
});

test('a worldwide answer has no country column', async () => {
  const { stdout } = await run(['Emma']);
  assert.equal(stdout, 'QUERY  GENDER  PROB  SAMPLE\nEmma   female  97%   12,345\n');
});

test('locale is passed through', async () => {
  requests.length = 0;
  await run(['Andrea', '--locale', 'it-IT']);
  assert.deepEqual(requests[0].body, { name: 'Andrea', locale: 'it-IT' });
});

test('several names use one bulk request', async () => {
  requests.length = 0;
  const { code, stdout } = await run(['Emma', 'Liam', 'Qzzxvv']);
  assert.equal(code, 0);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/gender/bulk');
  assert.deepEqual(requests[0].body, { names: ['Emma', 'Liam', 'Qzzxvv'], type: 'name' });
  assert.match(stdout, /Qzzxvv\s+unknown/);
});

test('stdin lines become values, blank lines are skipped, csv is quoted', async () => {
  requests.length = 0;
  const { code, stdout } = await run(['--csv'], { input: 'Emma\n\n  Liam  \n"Smith, John"\n' });
  assert.equal(code, 0);
  assert.deepEqual(requests[0].body.names, ['Emma', 'Liam', '"Smith, John"']);
  const lines = stdout.trim().split('\n');
  assert.equal(lines[0], 'query,gender,probability,sample_size,country');
  assert.equal(lines[1], 'Emma,female,97,12345,');
  assert.equal(lines[3], '"""Smith, John""",female,97,12345,');
});

test('more than 100 values are sent in chunks of 100', async () => {
  requests.length = 0;
  const names = Array.from({ length: 205 }, (_, i) => `Name${i}`);
  const { code, stdout } = await run(['--json'], { input: names.join('\n') });
  assert.equal(code, 0);
  assert.deepEqual(requests.map((r) => r.body.names.length), [100, 100, 5]);
  assert.equal(JSON.parse(stdout).results.length, 205);
});

test('--email reads values as email addresses', async () => {
  requests.length = 0;
  await run(['--email', 'jane.doe@example.com']);
  assert.equal(requests[0].url, '/gender/email');
  assert.deepEqual(requests[0].body, { email: 'jane.doe@example.com' });
});

test('account prints the balance', async () => {
  const { code, stdout } = await run(['account']);
  assert.equal(code, 0);
  assert.match(stdout, /credits remaining: 99/);
});

test('an API error exits non-zero with the reason on stderr', async () => {
  const { code, stdout, stderr } = await run(['Emma'], { key: 'ng_live_wrong' });
  assert.equal(code, 1);
  assert.equal(stdout, '');
  assert.match(stderr, /The API key is not valid\. \(invalid_key\)/);
});

test('a missing key is a usage error', async () => {
  const { code, stderr } = await run(['Emma'], { key: '' });
  assert.equal(code, 2);
  assert.match(stderr, /NAMEGENDER_API_KEY/);
});

test('conflicting flags are rejected before any request', async () => {
  requests.length = 0;
  const { code } = await run(['--email', '--username', 'x']);
  assert.equal(code, 2);
  assert.equal(requests.length, 0);
});

test('salutation prints the formal form and sends only the set options', async () => {
  requests.length = 0;
  const { code, stdout } = await run(['salutation', 'Ahmet Yılmaz', '--language', 'tr', '--country', 'TR']);
  assert.equal(code, 0);
  assert.equal(requests[0].url, '/salutation');
  assert.deepEqual(requests[0].body, { name: 'Ahmet Yılmaz', language: 'tr', country: 'TR' });
  assert.equal(stdout, 'QUERY         SALUTATION        FORM\nAhmet Yılmaz  Sayın Ahmet Bey,  gendered\n');
});

test('salutation --form picks the form and shows the reason when one is neutral', async () => {
  requests.length = 0;
  const { code, stdout } = await run(['salutation', '--form', 'informal', '--title', 'Dr.', '--gender', 'male', '--min-probability', '80', 'Ahmet Yılmaz', 'Kim Lee']);
  assert.equal(code, 0);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/salutation/bulk');
  assert.deepEqual(requests[0].body, { names: ['Ahmet Yılmaz', 'Kim Lee'], gender: 'male', title: 'Dr.', min_probability: 80 });
  assert.match(stdout, /QUERY\s+SALUTATION\s+FORM\s+REASON/);
  assert.match(stdout, /Ahmet Yılmaz\s+Merhaba Ahmet,\s+gendered\n/);
  assert.match(stdout, /Kim Lee\s+Merhaba Kim,\s+neutral\s+gender_unknown/);
});

test('salutation reads stdin in chunks of 100 and totals the summary', async () => {
  requests.length = 0;
  const names = Array.from({ length: 150 }, (_, i) => (i === 0 ? 'Acme GmbH' : `Ali Veli${i}`));
  const { code, stdout } = await run(['salutation', '--json', '--language', 'tr'], { input: `${names.join('\n')}\n\n` });
  assert.equal(code, 0);
  assert.deepEqual(requests.map((r) => [r.url, r.body.names.length]), [['/salutation/bulk', 100], ['/salutation/bulk', 50]]);
  const out = JSON.parse(stdout);
  assert.equal(out.results.length, 150);
  assert.equal(out.results[0].query, 'Acme GmbH');
  assert.equal(out.results[149].query, 'Ali Veli149');
  assert.equal(out.credits_charged, 150);
  assert.deepEqual(out.summary, { total: 150, gendered: 149, neutral: 0, organization: 1 });
});

test('salutation csv prints the chosen form', async () => {
  const { code, stdout } = await run(['salutation', '--csv', '--form', 'neutral'], { input: 'Ahmet Yılmaz\nAcme GmbH\n' });
  assert.equal(code, 0);
  assert.equal(stdout, 'query,salutation,form,reason,gender,language\nAhmet Yılmaz,"Sayın Ahmet Yılmaz,",gendered,,male,tr\nAcme GmbH,"Sayın Yetkili,",organization,,,tr\n');
});

test('salutation surfaces an unsupported language as an API error', async () => {
  const { code, stdout, stderr } = await run(['salutation', 'Ahmet Yılmaz', '--language', 'xx']);
  assert.equal(code, 1);
  assert.equal(stdout, '');
  assert.match(stderr, /Unsupported language\. \(invalid_input\)/);
});

test('salutation rejects bad flags before any request', async () => {
  requests.length = 0;
  assert.equal((await run(['salutation', '--form', 'casual', 'Ahmet Yılmaz'])).code, 2);
  assert.equal((await run(['salutation', '--best-guess', 'Ahmet Yılmaz'])).code, 2);
  assert.equal((await run(['salutation', '--email', 'a@b.c'])).code, 2);
  assert.equal((await run(['--language', 'tr', 'Ahmet'])).code, 2);
  assert.equal(requests.length, 0);
});

test('check prints the assessment and sends only the set options', async () => {
  requests.length = 0;
  const { code, stdout } = await run(['check', 'asdf qwerty', '--country', 'US']);
  assert.equal(code, 0);
  assert.equal(requests[0].url, '/name-check');
  assert.deepEqual(requests[0].body, { name: 'asdf qwerty', country: 'US' });
  assert.equal(stdout, 'QUERY        ASSESSMENT   SCORE  SIGNALS\nasdf qwerty  implausible  0      keyboard_pattern, first_name_not_found\n');
});

test('check lists only signals that count against a name', async () => {
  requests.length = 0;
  const { code, stdout } = await run(['check', '--locale', 'en-US', 'Jennifer Null', 'Mickey Mouse']);
  assert.equal(code, 0);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/name-check/bulk');
  assert.deepEqual(requests[0].body, { names: ['Jennifer Null', 'Mickey Mouse'], locale: 'en-US' });
  assert.match(stdout, /Jennifer Null\s+plausible\s+92\n/);
  assert.match(stdout, /Mickey Mouse\s+suspicious\s+40\s+fictional_character\n/);
  assert.doesNotMatch(stdout, /first_name_attested/);
});

test('check reads stdin in chunks of 100 and totals the summary', async () => {
  requests.length = 0;
  const names = Array.from({ length: 150 }, (_, i) => (i === 0 ? 'asdf qwerty' : i === 1 ? 'Mickey Mouse' : `Jennifer Null${i}`));
  const { code, stdout } = await run(['check', '--json'], { input: `${names.join('\n')}\n\n` });
  assert.equal(code, 0);
  assert.deepEqual(requests.map((r) => [r.url, r.body.names.length]), [['/name-check/bulk', 100], ['/name-check/bulk', 50]]);
  const out = JSON.parse(stdout);
  assert.equal(out.results.length, 150);
  assert.equal(out.results[0].query, 'asdf qwerty');
  assert.equal(out.results[149].query, 'Jennifer Null149');
  assert.equal(out.credits_charged, 150);
  assert.deepEqual(out.summary, { total: 150, plausible: 148, suspicious: 1, implausible: 1 });
});

test('check csv prints the signals', async () => {
  const { code, stdout } = await run(['check', '--csv'], { input: 'asdf qwerty\nJennifer Null\n' });
  assert.equal(code, 0);
  assert.equal(stdout, 'query,assessment,score,signals,name_type\nasdf qwerty,implausible,0,keyboard_pattern;first_name_not_found,personal\nJennifer Null,plausible,92,,personal\n');
});

test('check surfaces an API error', async () => {
  const { code, stdout, stderr } = await run(['check', '']);
  assert.equal(code, 1);
  assert.equal(stdout, '');
  assert.match(stderr, /Send name, or first_name and last_name\. \(missing_input\)/);
});

test('check rejects bad flags before any request', async () => {
  requests.length = 0;
  assert.equal((await run(['check', '--best-guess', 'Jennifer Null'])).code, 2);
  assert.equal((await run(['check', '--email', 'a@b.c'])).code, 2);
  assert.equal((await run(['check', '--language', 'en', 'Jennifer Null'])).code, 2);
  assert.equal(requests.length, 0);
});

test('age prints the median next to the middle half and the middle 80%', async () => {
  requests.length = 0;
  const { code, stdout } = await run(['age', 'Brittany']);
  assert.equal(code, 0);
  assert.deepEqual(requests[0].body, { name: 'Brittany' });
  assert.equal(stdout, 'NAME      COUNTRY  AGE  MIDDLE HALF  MIDDLE 80%\nBrittany  US       36   32-38        28-41\n');
});

test('age sends country and gender, and shows the reason when there is no age', async () => {
  requests.length = 0;
  const { code, stdout } = await run(['age', '--country', 'DE', '--gender', 'female', 'Andrea', 'Xqzv']);
  assert.equal(code, 0);
  assert.deepEqual(requests[0].body, { names: ['Andrea', 'Xqzv'], country: 'DE', gender: 'female' });
  assert.match(stdout, /^NAME\s+COUNTRY\s+AGE\s+MIDDLE HALF\s+MIDDLE 80%\s+REASON\n/);
  assert.match(stdout, /Andrea\s+DE\s+country_not_covered/);
});

test('age reads stdin in chunks of 100 and sums the credits', async () => {
  requests.length = 0;
  const input = Array.from({ length: 150 }, (_, i) => (i === 149 ? 'Xqzv' : `Brittany${i}`)).join('\n');
  const { code, stdout } = await run(['age', '--json'], { input });
  assert.equal(code, 0);
  assert.deepEqual(requests.map((r) => [r.url, r.body.names.length]), [['/age/bulk', 100], ['/age/bulk', 50]]);
  const out = JSON.parse(stdout);
  assert.equal(out.results.length, 150);
  assert.equal(out.credits_charged, 150);
  assert.equal(out.results[149].reason, 'not_found');
});

test('age csv prints both ranges', async () => {
  const { code, stdout } = await run(['age', '--csv'], { input: 'Brittany\nXqzv\n' });
  assert.equal(code, 0);
  assert.equal(stdout, 'query,country,age,age_low,age_high,age_80_low,age_80_high,birth_year,sample_size,reason\n'
    + 'Brittany,US,36,32,38,28,41,1990,353775,\nXqzv,US,,,,,,,0,not_found\n');
});

test('age rejects bad flags before any request', async () => {
  requests.length = 0;
  assert.equal((await run(['age', '--gender', 'neutral', 'Leslie'])).code, 2);
  assert.equal((await run(['age', '--email', 'a@b.c'])).code, 2);
  assert.equal((await run(['age', '--language', 'en', 'Leslie'])).code, 2);
  assert.equal((await run(['--gender', 'male', 'Leslie'])).code, 2);
  assert.equal(requests.length, 0);
});
