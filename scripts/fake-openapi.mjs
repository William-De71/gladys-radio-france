// The fake Radio France Open API of the tests, as an HTTP server on this
// machine, to run the integration without a key:
//
//   node scripts/fake-openapi.mjs [port] [--schema=union|diffusion-only|no-live]
//                                 [--quota=1000] [--quota-mode=429|500]
//   RADIO_FRANCE_OPENAPI_URL=http://127.0.0.1:8781/v1/graphql  (the integration)
//   api_key = test-key-0123456789                               (its configuration)
//
// POST /_clock {"advance": ms} moves its clock forward (scripts/simulate.mjs).
// Every program is made up (test/helpers/fake-openapi.js).

import { createServer } from 'node:http';
import { createFakeOpenApi, FAKE_KEY } from '../test/helpers/fake-openapi.js';

const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const port = Number(args.find((arg) => /^\d+$/.test(arg)) ?? 8781);
let offset = 0;
const api = createFakeOpenApi({
  now: () => Date.now() + offset,
  schema: option('schema', 'union'),
  quota: Number(option('quota', 1000)),
  quotaMode: option('quota-mode', '429'),
});

const server = createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8');
    if (request.url === '/_clock' && request.method === 'POST') {
      offset += Number(JSON.parse(body || '{}').advance) || 0;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ offset, requests: api.requests.length }));
      return;
    }
    if (!request.url.startsWith('/v1/graphql')) {
      response.writeHead(404).end();
      return;
    }
    const { status, body: answer } = api.answer({
      method: request.method,
      headers: request.headers,
      body,
    });
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(answer);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(
    `Fake Radio France Open API on http://127.0.0.1:${port}/v1/graphql (key ${FAKE_KEY})`,
  );
});
