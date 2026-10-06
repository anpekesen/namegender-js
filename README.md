# NameGender JavaScript

```sh
npm install namegender
```

```js
import { NameGender } from 'namegender';
const client = new NameGender(process.env.NAMEGENDER_API_KEY);
const result = await client.name('Ayşe', { country: 'TR' });
console.log(result.gender, result.probability, result.sample_size, result.confidence);
```

Node.js 18+, Deno and Bun are supported through the standard Fetch API.

Get an API key from the [namegender.com](https://namegender.com) dashboard and
keep it on the server. A key in browser code can be copied and spent by anyone
who opens the page; restrict a key to your server's IP addresses in the
dashboard if you can.

## Command line

The package ships a `namegender` command. Keep the key in an environment
variable; a key typed on the command line ends up in your shell history.

```sh
export NAMEGENDER_API_KEY=ng_live_...
npx namegender Andrea --country IT
npx namegender Emma Liam Andrea
npx namegender --email jane.doe@example.com
cat names.txt | npx namegender --csv > genders.csv
npx namegender countries Mehmet
npx namegender salutation "Ahmet Yılmaz" --language tr
npx namegender account
```

```
$ npx namegender Emma
QUERY  GENDER  PROB  SAMPLE
Emma   female  100%  1,201,635
```

Each non-empty line on stdin is one value; lists longer than 100 are sent in
bulk requests of 100. `--json` prints the API response, `--csv` prints
`query,gender,probability,sample_size,country`, and `--locale it-IT` or
`--best-guess` work as in the client. Every value costs one credit, unknown
results included. Run `npx namegender --help` for all options.

`namegender salutation` prints the formal salutation for each quoted full
name; `--form informal` or `--form neutral` picks another form, and
`--language`, `--country`, `--gender`, `--title` and `--min-probability` work
as in the client. `--csv` prints `query,salutation,form,reason,gender,language`.

## Options and response

`name`, `email`, `username` and `bulk` accept `country`, `locale`, `ip`,
`ai_fallback` and `best_guess`:

```js
const result = await client.name('Andrea', { country: 'IT', best_guess: true });
```

When you do not know the country, pass what you have: `locale` is a language
tag such as the browser's `navigator.language` (its region becomes the country;
`en` without a region sets none), and `ip` is the end user's IP address, used
only when neither `country` nor a regional `locale` is sent and never stored.
`country_source` in the response says which one was used: `'country'`,
`'locale'`, `'ip'` or `null`.

```js
const result = await client.name('Andrea', { locale: 'it-IT' });
console.log(result.gender, result.country_source); // 'male' 'locale'
```

A result carries `query`, `name`, `first_name`, `middle_name`, `last_name`, `name_type`, `gender`, `country`, `probability`,
`sample_size`, `took_ms`, `source`, `confidence` and `matched_as`, alongside
`credits_charged`, `credits_remaining`, `data_version` and `request_id`.
Success is the HTTP status: any non-2xx response throws a `NameGenderError`
whose `body` is `{ error, message, request_id, docs }`. Branch on `body.error`,
not on `message`.

## Salutation

Builds the opening line of a letter or email from a full name. Titles in the
name are recognised; the formal, informal and neutral forms all come back.

```js
const de = await client.salutation('Dr. Anna Müller', { language: 'de' });
console.log(de.salutation.formal);   // 'Sehr geehrte Frau Dr. Müller,'

const tr = await client.salutation('Ahmet Yılmaz', { language: 'tr' });
console.log(tr.salutation.formal);   // 'Sayın Ahmet Bey,'

// Parts stored separately: no parsing is done.
await client.salutation(null, { first_name: 'Anna', last_name: 'Müller', title: 'Dr.', language: 'de' });

const list = await client.salutationBulk(['Ahmet Yılmaz', 'Acme A.Ş.'], { language: 'tr' }); // up to 100
console.log(list.summary); // { total: 2, gendered: 1, neutral: 0, organization: 1 }
```

Options are `language` (en, en-US, en-GB, de, de-AT, de-CH, fr, es, it, pt,
pt-PT, pt-BR, nl, tr, pl, ja; anything else is a 422 `NameGenderError` whose
`body.supported` lists them), `country`, `locale`, `ip`, `gender` (`'male'`,
`'female'` or `'neutral'`, skipping the lookup), `min_probability` (50–100,
default 90) and `title`.

One credit per name. When the gender is not certain the gendered form is not
guessed: `form` is `'neutral'` and `reason` says why (`'gender_unknown'`,
`'below_min_probability'`, ...). `best_guess` does not apply to salutations.

## Country distribution

Returns the countries a name is recorded in. This is not a country-of-origin or
ethnicity inference, and must not be used as one.

```js
const result = await client.countries('Mehmet', { limit: 10 });
console.log(result.registrations); // [{ country: 'FR', count: 3775, share: 58.97, gender: 'male', probability: 99, source: 'insee' }, ...]
console.log(result.attested_in);   // ['AL', 'AU', 'BE', ..., 'TR', 'US']
console.log(result.basis.note);
```

The two lists are deliberately kept apart. `registrations` is measured volume and
is comparable only among the seven countries that publish counted birth
statistics (US, UK, France, Canada, Spain, Ireland, Norway); `share` is a
percentage across those counts alone. `attested_in` is presence with no weight
attached, which is where countries that publish no counts, such as Turkey, Japan
and India, appear. Show `basis.note` next to any percentage you display.

`limit` (1–100, default 25) caps how many counted countries come back in
`registrations`. One credit per request.

## File jobs

Upload a CSV or XLSX file (up to 100 MB and 1,000,000 rows) and get it back
with gender columns added. One credit per row, charged only if the job
completes.

```js
import { openAsBlob } from 'node:fs'; // Node 20+; on Node 18, new Blob([await readFile(path)])
import { writeFile } from 'node:fs/promises';

const job = await client.batches.create(await openAsBlob('customers.csv'), {
  filename: 'customers.csv',
  name_column: 'first_name',     // required to start
  country_column: 'country',     // optional: a country code per row
});

const done = await client.batches.wait(job.id, { onProgress: (j) => console.log(j.progress) });
if (done.status === 'failed') throw new Error(done.error.code);

const file = await client.batches.download(done.id);
await writeFile('customers-gender.csv', Buffer.from(await file.arrayBuffer()));
```

`name_column` is required to start: a guessed column that turns out to be
wrong would spend credits on the wrong data. To see the columns and the cost
first, upload with `start: false`, read `job.inspection`, then call
`client.batches.start(job.id, { name_column })`.

`create` sends an `Idempotency-Key` and retries network errors and 502/503/504
with the same key, so a retry never opens a second job. Pass your own
`idempotencyKey` to keep that guarantee across your own retries.

`wait` resolves with a failed job rather than throwing; branch on
`job.error.code`. `cancel` returns the credit of a job that has not started,
and deletes a finished one. `list({ limit, page })` includes jobs started from
the dashboard. Up to three jobs can be queued or running at once; a fourth is
refused with `429 too_many_batches`.

The result appends `gender`, `probability`, `sample_size`, `country`, `source`,
`matched_as`, `first_name`, `middle_name`, `last_name` and `name_type` to every
row. A CSV result starts with a UTF-8 byte order mark so that Excel reads it
correctly.

## Webhooks

Add an endpoint under Webhooks in the dashboard, and NameGender sends a signed
`POST` to it when a file job completes or fails, and when credits are about to
run out (`credits.low`) or have run out (`credits.depleted`, checked hourly). `webhooks.verify` checks the
signature and the timestamp, and returns the event.

```js
import express from 'express';
import { webhooks, NameGenderWebhookError } from 'namegender';

const app = express();

// express.raw, not express.json: the signature covers the exact bytes sent.
app.post('/namegender', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = await webhooks.verify(
      req.body,
      req.get('NameGender-Signature'),
      process.env.NAMEGENDER_WEBHOOK_SECRET,
    );
  } catch (error) {
    if (error instanceof NameGenderWebhookError) return res.sendStatus(400);
    throw error;
  }

  res.sendStatus(204);   // answer first, then do the work

  if (event.type === 'batch.completed') {
    // event.data.object is the job, as batches.get() returns it
  }
});
```

Use `event.id` (also the `NameGender-Event-Id` header) to ignore a delivery you
have already handled. A retry carries the same id, and order is not guaranteed.
Anything other than a 2xx within 10 seconds is retried, up to 8 attempts over
about 45 hours. `verify` uses Web Crypto, so it works the same on Node 18+,
Deno, Bun and edge runtimes.
