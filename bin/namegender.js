#!/usr/bin/env node
// NameGender command line client. No dependencies beyond the SDK in this package.
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { NameGender, NameGenderError } from '../src/index.js';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
// The API's bulk limit; longer lists are sent in chunks of this size.
const CHUNK = 100;

const HELP = `Usage: namegender [options] <name>...
       namegender --email <address>... | --username <handle>...
       namegender countries <name>
       namegender salutation [options] <full name>...
       namegender check [options] <full name>...
       namegender age [options] <name>...
       namegender account
       cat names.txt | namegender [options]

Look up the gender behind names, email addresses and usernames.

Options:
  -c, --country <CC>     Two-letter country code, e.g. IT. Andrea is male in Italy.
  -l, --locale <tag>     Language tag whose region is used as the country, e.g. it-IT.
  -e, --email            Read the values as email addresses.
  -u, --username         Read the values as usernames.
      --best-guess       Return the more likely gender even when evidence is weak.
      --json             Print the API response as JSON.
      --csv              Print CSV (query,gender,probability,sample_size,country).
      --key <key>        API key. Prefer the NAMEGENDER_API_KEY environment variable:
                         a key on the command line ends up in your shell history.

Salutation options (namegender salutation "Anna Müller" --language de):
      --language <tag>   Language of the salutation: en, en-US, en-GB, de, de-AT,
                         de-CH, fr, es, it, pt, pt-PT, pt-BR, nl, tr, pl, ja.
      --form <form>      formal (default), informal or neutral.
      --gender <g>       Known gender (male, female, neutral); skips the lookup.
      --title <title>    Academic title kept in a separate field, e.g. Dr.
      --min-probability <n>
                         50-100, default 90. Below it the neutral form is used.
  Quote each full name. The neutral form is used when the gender is not
  certain; --best-guess does not apply.

Name check (namegender check "Jennifer Null"):
  Says whether each full name looks like a real person's name: plausible,
  suspicious or implausible, a 0-100 score, and the signals behind it. It
  never calls a name fake; use it to flag records, not to reject people.
  --country and --locale work as above; --csv prints
  query,assessment,score,signals,name_type.

Age (namegender age Brittany --country US):
  How old the living people with each first name are: the median age, the
  middle half and the middle 80%. It describes a group, not a person.
  Covered: US, FR, NO; without --country or --locale the US series is used.
  --gender male|female uses one gender's records. --csv prints
  query,country,age,age_low,age_high,age_80_low,age_80_high,birth_year,sample_size,reason.

  -h, --help             Show this help.
  -v, --version          Show the version.

Every value costs one credit, unknown results included. With no arguments and
input on stdin, each non-empty line is one value.

Get a free API key at https://namegender.com`;

function fail(message, code = 1) {
  process.stderr.write(`namegender: ${message}\n`);
  process.exit(code);
}

let parsed;
try {
  parsed = parseArgs({
    allowPositionals: true,
    options: {
      country: { type: 'string', short: 'c' },
      locale: { type: 'string', short: 'l' },
      email: { type: 'boolean', short: 'e' },
      username: { type: 'boolean', short: 'u' },
      'best-guess': { type: 'boolean' },
      language: { type: 'string' },
      form: { type: 'string' },
      gender: { type: 'string' },
      title: { type: 'string' },
      'min-probability': { type: 'string' },
      json: { type: 'boolean' },
      csv: { type: 'boolean' },
      key: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
} catch (error) {
  fail(`${error.message}\nRun "namegender --help" for usage.`, 2);
}

const { values: opts, positionals } = parsed;

if (opts.help) { process.stdout.write(`${HELP}\n`); process.exit(0); }
if (opts.version) { process.stdout.write(`${VERSION}\n`); process.exit(0); }
if (opts.email && opts.username) fail('--email and --username cannot be combined.', 2);
if (opts.json && opts.csv) fail('--json and --csv cannot be combined.', 2);

const FORMS = ['formal', 'informal', 'neutral'];
const isSalutation = parsed.positionals[0] === 'salutation';
const isCheck = parsed.positionals[0] === 'check';
const isAge = parsed.positionals[0] === 'age';
// --gender is shared with age; the rest belong to salutation alone.
const salutationOnly = ['language', 'form', 'gender', 'title', 'min-probability']
  .filter((o) => opts[o] !== undefined && !(isAge && o === 'gender'));
if (!isSalutation && salutationOnly.length) fail(`--${salutationOnly[0]} works only with the salutation command.`, 2);
if (isSalutation) {
  if (opts.email || opts.username) fail('salutation reads full names; --email and --username do not apply.', 2);
  if (opts['best-guess']) fail('--best-guess does not apply to salutation: the neutral form is used when the gender is not certain.', 2);
  if (opts.form !== undefined && !FORMS.includes(opts.form)) fail(`--form must be one of ${FORMS.join(', ')}.`, 2);
  if (opts['min-probability'] !== undefined && !/^\d+$/.test(opts['min-probability'])) fail('--min-probability must be a whole number from 50 to 100.', 2);
}

if (isCheck) {
  if (opts.email || opts.username) fail('check reads full names; --email and --username do not apply.', 2);
  if (opts['best-guess']) fail('--best-guess does not apply to check.', 2);
}

if (isAge) {
  if (opts.email || opts.username) fail('age reads names; --email and --username do not apply.', 2);
  if (opts['best-guess']) fail('--best-guess does not apply to age.', 2);
  if (opts.gender !== undefined && !['male', 'female'].includes(opts.gender)) fail('--gender must be male or female for age.', 2);
}

const apiKey = opts.key || process.env.NAMEGENDER_API_KEY;
if (!apiKey) fail('No API key. Set NAMEGENDER_API_KEY (free key at https://namegender.com).', 2);

const client = new NameGender(apiKey, { baseUrl: process.env.NAMEGENDER_BASE_URL || undefined });
const lookupOptions = {
  ...(opts.country ? { country: opts.country } : {}),
  ...(opts.locale ? { locale: opts.locale } : {}),
  ...(opts['best-guess'] ? { best_guess: true } : {}),
};

const salutationOptions = {
  ...(opts.language ? { language: opts.language } : {}),
  ...(opts.country ? { country: opts.country } : {}),
  ...(opts.locale ? { locale: opts.locale } : {}),
  ...(opts.gender ? { gender: opts.gender } : {}),
  ...(opts.title ? { title: opts.title } : {}),
  ...(opts['min-probability'] !== undefined ? { min_probability: Number(opts['min-probability']) } : {}),
};

const checkOptions = {
  ...(opts.country ? { country: opts.country } : {}),
  ...(opts.locale ? { locale: opts.locale } : {}),
};

const ageOptions = {
  ...(opts.country ? { country: opts.country } : {}),
  ...(opts.locale ? { locale: opts.locale } : {}),
  ...(opts.gender ? { gender: opts.gender } : {}),
};

async function readStdin() {
  const lines = [];
  for await (const line of createInterface({ input: process.stdin })) {
    const value = line.trim();
    if (value !== '') lines.push(value);
  }
  return lines;
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function printResults(results, meta) {
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(meta, null, 2)}\n`);
    return;
  }
  if (opts.csv) {
    process.stdout.write('query,gender,probability,sample_size,country\n');
    for (const r of results) {
      process.stdout.write([r.query, r.gender, r.probability, r.sample_size, r.country].map(csvCell).join(',') + '\n');
    }
    return;
  }
  const rows = results.map((r) => [
    r.query,
    r.gender ?? 'unknown',
    r.gender ? `${r.probability}%` : '',
    r.sample_size ? r.sample_size.toLocaleString('en-US') : '',
    r.country ?? '',
  ]);
  const header = ['QUERY', 'GENDER', 'PROB', 'SAMPLE', 'COUNTRY'];
  // No country anywhere (a worldwide answer): drop the empty column.
  if (results.every((r) => !r.country)) {
    header.pop();
    rows.forEach((row) => row.pop());
  }
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => String(row[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ').trimEnd();
  process.stdout.write(`${line(header)}\n${rows.map(line).join('\n')}\n`);
}

function printTable(header, rows) {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => String(row[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join('  ').trimEnd();
  process.stdout.write(`${line(header)}\n${rows.map(line).join('\n')}\n`);
}

function printSalutations(results, meta) {
  const form = opts.form || 'formal';
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(meta, null, 2)}\n`);
    return;
  }
  if (opts.csv) {
    process.stdout.write('query,salutation,form,reason,gender,language\n');
    for (const r of results) {
      process.stdout.write([r.query, r.salutation[form], r.form, r.reason, r.gender, r.language].map(csvCell).join(',') + '\n');
    }
    return;
  }
  const header = ['QUERY', 'SALUTATION', 'FORM', 'REASON'];
  const rows = results.map((r) => [r.query, r.salutation[form], r.form, r.reason ?? '']);
  // Every salutation gendered: drop the empty reason column.
  if (results.every((r) => !r.reason)) {
    header.pop();
    rows.forEach((row) => row.pop());
  }
  printTable(header, rows);
}

// Only the signals that count against a name; info and positive ones explain
// the score but are not a reason to look at the record. A code seen on both
// parts is listed once.
const concerns = (r) => [...new Set(r.signals.filter((s) => s.severity !== 'info' && s.severity !== 'positive').map((s) => s.code))];

function printChecks(results, meta) {
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(meta, null, 2)}\n`);
    return;
  }
  if (opts.csv) {
    process.stdout.write('query,assessment,score,signals,name_type\n');
    for (const r of results) {
      process.stdout.write([r.query, r.assessment, r.score, concerns(r).join(';'), r.name_type].map(csvCell).join(',') + '\n');
    }
    return;
  }
  printTable(['QUERY', 'ASSESSMENT', 'SCORE', 'SIGNALS'], results.map((r) => [r.query, r.assessment, r.score, concerns(r).join(', ')]));
}

async function check(values) {
  if (values.length === 1) {
    const result = await client.nameCheck(values[0], checkOptions);
    printChecks([result], result);
    return;
  }

  const results = [];
  let last = null;
  let charged = 0;
  for (let i = 0; i < values.length; i += CHUNK) {
    last = await client.nameCheckBulk(values.slice(i, i + CHUNK), checkOptions);
    charged += last.credits_charged ?? 0;
    results.push(...last.results);
  }
  // The summary of the last chunk alone would undercount; recount over all.
  const summary = { total: results.length, plausible: 0, suspicious: 0, implausible: 0 };
  for (const r of results) if (r.assessment in summary) summary[r.assessment]++;
  printChecks(results, { ...last, credits_charged: charged, summary, results });
}

function printAges(results, meta) {
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(meta, null, 2)}\n`);
    return;
  }
  if (opts.csv) {
    process.stdout.write('query,country,age,age_low,age_high,age_80_low,age_80_high,birth_year,sample_size,reason\n');
    for (const r of results) {
      process.stdout.write([r.name, r.country, r.age, r.age_range?.low, r.age_range?.high, r.age_range_80?.low,
        r.age_range_80?.high, r.birth_year, r.sample_size, r.reason].map(csvCell).join(',') + '\n');
    }
    return;
  }
  // The median alone would read as one person's age; the middle half sits next to it.
  const range = (x) => (x ? `${x.low}-${x.high}` : '');
  const header = ['NAME', 'COUNTRY', 'AGE', 'MIDDLE HALF', 'MIDDLE 80%', 'REASON'];
  const rows = results.map((r) => [r.name, r.country, r.age ?? '', range(r.age_range), range(r.age_range_80), r.reason ?? '']);
  if (results.every((r) => !r.reason)) {
    header.pop();
    rows.forEach((row) => row.pop());
  }
  printTable(header, rows);
}

async function age(values) {
  if (values.length === 1) {
    const result = await client.age(values[0], ageOptions);
    printAges([result], result);
    return;
  }

  const results = [];
  let last = null;
  let charged = 0;
  for (let i = 0; i < values.length; i += CHUNK) {
    last = await client.ageBulk(values.slice(i, i + CHUNK), ageOptions);
    charged += last.credits_charged ?? 0;
    results.push(...last.results);
  }
  printAges(results, { ...last, credits_charged: charged, results });
}

async function salutation(values) {
  if (values.length === 1) {
    const result = await client.salutation(values[0], salutationOptions);
    printSalutations([result], result);
    return;
  }

  const results = [];
  let last = null;
  let charged = 0;
  for (let i = 0; i < values.length; i += CHUNK) {
    last = await client.salutationBulk(values.slice(i, i + CHUNK), salutationOptions);
    charged += last.credits_charged ?? 0;
    results.push(...last.results);
  }
  // The summary of the last chunk alone would undercount; recount over all.
  const summary = { total: results.length, gendered: 0, neutral: 0, organization: 0 };
  for (const r of results) if (r.form in summary) summary[r.form]++;
  printSalutations(results, { ...last, credits_charged: charged, summary, results });
}

async function lookup(values) {
  const type = opts.email ? 'email' : opts.username ? 'username' : 'name';

  if (values.length === 1) {
    const result = await client[type](values[0], lookupOptions);
    printResults([result], result);
    return;
  }

  const results = [];
  let last = null;
  for (let i = 0; i < values.length; i += CHUNK) {
    last = await client.bulk(values.slice(i, i + CHUNK), { ...lookupOptions, type });
    results.push(...last.results);
  }
  printResults(results, { ...last, results });
}

async function main() {
  const [command, ...rest] = positionals;

  if (command === 'account' && rest.length === 0) {
    const account = await client.account();
    if (opts.json) { process.stdout.write(`${JSON.stringify(account, null, 2)}\n`); return; }
    process.stdout.write(`${account.email}\ncredits remaining: ${account.credits_remaining}\nfree today: ${account.free_today}\n`);
    return;
  }

  if (command === 'countries') {
    if (rest.length !== 1) fail('Usage: namegender countries <name>', 2);
    const result = await client.countries(rest[0]);
    if (opts.json) { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); return; }
    for (const r of result.registrations) {
      process.stdout.write(`${r.country}  ${String(r.share).padStart(6)}%  ${r.gender ?? 'unknown'}\n`);
    }
    if (result.basis?.note) process.stdout.write(`\n${result.basis.note}\n`);
    return;
  }

  let values = isSalutation || isCheck || isAge ? rest : positionals;
  if (values.length === 0) {
    if (process.stdin.isTTY) { process.stdout.write(`${HELP}\n`); process.exit(2); }
    values = await readStdin();
    if (values.length === 0) fail('No input.', 2);
  }

  await (isSalutation ? salutation(values) : isCheck ? check(values) : isAge ? age(values) : lookup(values));
}

main().catch((error) => {
  if (error instanceof NameGenderError) {
    fail(`${error.message}${error.body?.error ? ` (${error.body.error})` : ''}`);
  }
  fail(error.message);
});
