# NameGender JavaScript

```sh
npm install namegender
```

```js
import { NameGender } from 'namegender';
const client = new NameGender(process.env.NAMEGENDER_API_KEY);
const result = await client.name('Ayşe', { country: 'TR' });
console.log(result.gender, result.probability, result.confidence);
```

Node.js 18+, Deno and Bun are supported through the standard Fetch API.
