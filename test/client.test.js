// The GraphQL client: the key in the x-token header only, the aliases, the
// station ids, the typed errors. No network: a fake `fetch`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ApiError,
  BRANDS_QUERY,
  ENDPOINT,
  MAX_ALIASES,
  createClient,
  endpointFromEnv,
  gridQuery,
  isStationId,
  liveQuery,
} from '../src/api/client.js';
import { FAKE_KEY, createFakeOpenApi } from './helpers/fake-openapi.js';

const KEY = FAKE_KEY;
const answer = (status, body) => async () => ({
  status,
  ok: status >= 200 && status < 300,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});
const rejects = async (promise, kind, check = () => {}) => {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ApiError, error.message);
    assert.equal(error.kind, kind);
    check(error);
    return true;
  });
};

test('POST to the official endpoint, the key in the x-token header, never in the URL', async () => {
  const seen = [];
  const client = createClient({
    fetch: async (url, init) => {
      seen.push({ url, init });
      return answer(200, { data: { brands: [] } })();
    },
  });
  await client.query(BRANDS_QUERY, KEY);
  assert.equal(seen[0].url, 'https://openapi.radiofrance.fr/v1/graphql');
  assert.equal(seen[0].url, ENDPOINT);
  assert.ok(!seen[0].url.includes(KEY));
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.headers['x-token'], KEY);
  assert.deepEqual(JSON.parse(seen[0].init.body), { query: BRANDS_QUERY });
});

test('no key: no request at all', async () => {
  let calls = 0;
  const client = createClient({ fetch: async () => (calls += 1) });
  await rejects(client.query(BRANDS_QUERY, ''), 'auth');
  assert.equal(calls, 0);
});

test('401 (missing or wrong key) and 403 are auth errors, the key never in the message', async () => {
  const api = createFakeOpenApi();
  await rejects(createClient({ fetch: api.fetch }).query(BRANDS_QUERY, 'wrong-key-123456'), 'auth');
  await rejects(
    createClient({
      fetch: answer(401, { message: `Unauthorized: bad token ${KEY}` }),
    }).query(BRANDS_QUERY, KEY),
    'auth',
    (error) => {
      assert.equal(error.status, 401);
      assert.ok(!error.message.includes(KEY), error.message);
    },
  );
  await rejects(createClient({ fetch: answer(403, 'Forbidden') }).query('{x}', KEY), 'auth');
});

test('429, or a refusal that talks about a quota, is a quota error; another 5xx is not', async () => {
  await rejects(
    createClient({ fetch: answer(429, { message: 'Too Many Requests' }) }).query('{x}', KEY),
    'quota',
  );
  await rejects(
    createClient({ fetch: answer(500, { message: 'Daily quota exceeded' }) }).query('{x}', KEY),
    'quota',
  );
  await rejects(
    createClient({
      fetch: answer(200, { errors: [{ message: 'API rate limit reached' }], data: null }),
    }).query('{x}', KEY),
    'quota',
  );
  await rejects(
    createClient({ fetch: answer(502, '<html>Bad gateway</html>') }).query('{x}', KEY),
    'http',
    (error) => assert.equal(error.status, 502),
  );
});

test('GraphQL errors without data: a graphql error, flagged when the schema refused the query', async () => {
  await rejects(
    createClient({
      fetch: answer(200, {
        errors: [{ message: 'Cannot query field "live" on type "Query".' }],
        data: null,
      }),
    }).query('{x}', KEY),
    'graphql',
    (error) => assert.equal(error.validation, true),
  );
  await rejects(
    createClient({
      fetch: answer(200, {
        errors: [{ message: 'Value "NOPE" does not exist in "StationsEnum" enum.' }],
      }),
    }).query('{x}', KEY),
    'graphql',
    (error) => assert.match(error.message, /NOPE/),
  );
  // A partial answer is data, with its errors.
  const partial = await createClient({
    fetch: answer(200, {
      data: { s0: { show: null }, s1: null },
      errors: [{ message: 'one failed' }],
    }),
  }).query('{x}', KEY);
  assert.equal(partial.errors.length, 1);
  assert.deepEqual(partial.data.s0, { show: null });
});

test('network failures and garbage are typed too', async () => {
  await rejects(
    createClient({
      fetch: async () => {
        throw new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } });
      },
    }).query('{x}', KEY),
    'network',
    (error) => assert.equal(error.message, 'ECONNRESET'),
  );
  await rejects(createClient({ fetch: answer(200, 'not json') }).query('{x}', KEY), 'invalid');
});

test('station ids are enum values: checked before they reach a query', () => {
  for (const id of ['FIP', 'FRANCEINTER', 'FRANCEBLEU_ALSACE', 'FIP_HIP_HOP', 'FIP2']) {
    assert.ok(isStationId(id), id);
  }
  for (const id of ['fip', 'FIP)', 'FIP { brands', '', '_FIP', 'A'.repeat(65), null, 12]) {
    assert.ok(!isStationId(id), String(id));
  }
  assert.throws(() => liveQuery(['FIP) { __schema'], 'live', 0));
  assert.throws(() => gridQuery('fip', 0, 10));
});

test('one request reads up to 10 stations with aliases s0, s1…', () => {
  const ids = ['FIP', 'FRANCEINTER', 'MOUV'];
  const query = liveQuery(ids, 'live', 1_700_000_000);
  assert.match(query, /s0: live\(station: FIP\)/);
  assert.match(query, /s1: live\(station: FRANCEINTER\)/);
  assert.match(query, /s2: live\(station: MOUV\)/);
  for (const field of [
    'show {',
    'program {',
    'song {',
    'mainArtists',
    'productionDate',
    '... on BlankStep',
  ]) {
    assert.ok(query.includes(field), field);
  }
  assert.ok(!liveQuery(ids, 'live-diffusion', 0).includes('BlankStep'));
  const grid = liveQuery(ids, 'grid', 1_700_000_000);
  assert.match(
    grid,
    /s1: grid\(start: 1699989200, end: 1700000060, station: FRANCEINTER, includeTracks: true\)/,
  );
  assert.throws(() => liveQuery(Array(MAX_ALIASES + 1).fill('FIP'), 'live', 0));
  assert.throws(() => liveQuery([], 'live', 0));
  assert.ok(!query.includes('liveStream'), 'the stream URL is never asked by the live query');
});

test('a grid covers less than 24 hours, without the tracks', () => {
  const query = gridQuery('FRANCEINTER', 1000, 2000.7);
  assert.match(query, /grid\(start: 1000, end: 2000, station: FRANCEINTER, includeTracks: false\)/);
  assert.throws(() => gridQuery('FIP', 0, 24 * 3600));
  assert.throws(() => gridQuery('FIP', 10, 10));
});

test('a development endpoint is accepted on this machine only', () => {
  assert.equal(endpointFromEnv({}), ENDPOINT);
  assert.equal(
    endpointFromEnv({ RADIO_FRANCE_OPENAPI_URL: 'http://127.0.0.1:8781/v1/graphql' }),
    'http://127.0.0.1:8781/v1/graphql',
  );
  assert.equal(
    endpointFromEnv({ RADIO_FRANCE_OPENAPI_URL: 'https://evil.example/graphql' }),
    ENDPOINT,
  );
  assert.equal(
    endpointFromEnv({ RADIO_FRANCE_OPENAPI_URL: 'http://192.168.1.5/graphql' }),
    ENDPOINT,
  );
  assert.equal(endpointFromEnv({ RADIO_FRANCE_OPENAPI_URL: 'nonsense' }), ENDPOINT);
});

test('the fake API answers the queries of the client as documented', async () => {
  const api = createFakeOpenApi({ now: () => Date.UTC(2026, 9, 24, 5, 10) });
  const client = createClient({ fetch: api.fetch });
  const { data } = await client.query(liveQuery(['FRANCEINTER', 'FIP'], 'live', 0), KEY);
  assert.equal(data.s0.show.__typename, 'DiffusionStep');
  assert.equal(data.s1.show, null, 'FIP: no show');
  assert.ok(Array.isArray(data.s1.song.track.mainArtists));
  assert.equal(api.requests.length, 1);
  assert.equal(api.requests[0].token, KEY);
});
