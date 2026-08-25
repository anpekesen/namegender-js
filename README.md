# GenderScope JavaScript

```sh
npm install genderscope
```

```js
import { GenderScope } from 'genderscope';
const client = new GenderScope(process.env.GENDERSCOPE_API_KEY);
const result = await client.name('Ayşe', { country: 'TR' });
console.log(result.gender, result.probability, result.confidence);
```

Node.js 18+, Deno and Bun are supported through the standard Fetch API.
