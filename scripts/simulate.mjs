// The real integration (src/app.js, its real HTTP client and fetch) against
// the fake Open API served by scripts/fake-openapi.mjs, with the fake Gladys of
// the SDK. Run by scripts/check-simulator.sh:
//   node scripts/simulate.mjs http://127.0.0.1:18781
// Exits 1 at the first difference from what is expected.

import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createApp } from '../src/app.js';
import { memoryStorage } from '../src/storage.js';
import { FAKE_KEY } from '../test/helpers/fake-openapi.js';

const base = process.argv[2] ?? 'http://127.0.0.1:18781';
let offset = 0;
const advance = async (ms) => {
  offset += ms;
  await fetch(`${base}/_clock`, { method: 'POST', body: JSON.stringify({ advance: ms }) });
};
const DEVICE = (id) => `ext:test-integration:station:${id}`;
const step = (text) => console.log(`ok - ${text}`);

const gladys = createFakeGladys({ config: { api_key: FAKE_KEY, language: 'fr' } });
const storage = memoryStorage();
const app = createApp(gladys, {
  storage,
  endpoint: `${base}/v1/graphql`,
  now: () => Date.now() + offset,
  timeZone: 'Europe/Paris',
});
await gladys.connect();
await app.start();
assert.equal(gladys.fake.discoveredDevices.length, 8);
step('station list read over HTTP, 8 devices offered (no France Bleu brand, no silent station)');

for (const id of ['franceinter', 'fip']) {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === DEVICE(id));
  await gladys.fake.deviceCreated(structuredClone(device));
}
await app.round();
await app.states.flush();
assert.match(String(gladys.fake.lastState(`${DEVICE('fip')}:track`)), / – /);
step('one request for two stations, what is on air published');

// Two minutes into the next hour: a new show and a new track at least.
const nowMs = Date.now() + offset;
await advance(3600 * 1000 - (nowMs % (3600 * 1000)) + 2 * 60 * 1000);
await app.round();
const keys = gladys.fake.sceneEvents.map((event) => event.key);
assert.ok(keys.includes('show_started') && keys.includes('track_started'), keys.join());
step(`transitions announced: ${[...new Set(keys)].join(', ')}`);

const action = await gladys.fake.sceneAction('get_upcoming', { station: DEVICE('franceinter') });
assert.equal(action.success, true, action.error);
assert.match(action.data.outputs.summary, /^À venir sur France Inter : /);
step(`action get_upcoming: ${action.data.outputs.summary}`);

for (const key of ['now_playing', 'schedule', 'api_usage']) {
  const { data } = await gladys.fake.widgetGet(key, { settings: {}, language: 'fr' });
  assert.deepEqual(validateWidgetContent(data.content), [], key);
}
step('the three widgets are valid');

const used = app.budget.used();
// 4 in the documented shape, 2 more when the schema refuses the live query.
assert.ok(used >= 4 && used <= 8, `${used}`);
assert.deepEqual(Object.keys(storage.files).sort(), ['settings.json', 'usage.json']);
step(`${used} requests counted, /data holds only the counter and the switches`);

await app.stop();
await gladys.disconnect();
