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

## Options and response

`name`, `email`, `username` and `bulk` accept `country`, `ai_fallback` and
`best_guess`:

```js
const result = await client.name('Andrea', { country: 'IT', best_guess: true });
```

A result carries `query`, `name`, `gender`, `country`, `probability`,
`sample_size`, `took_ms`, `source`, `confidence` and `matched_as`, alongside
`credits_charged`, `credits_remaining`, `data_version` and `request_id`.
Success is the HTTP status: any non-2xx response throws a `NameGenderError`
whose `body` is `{ error, message, request_id, docs }`. Branch on `body.error`,
not on `message`.

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
