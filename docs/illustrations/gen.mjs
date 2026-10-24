// Widget contents for the generated illustrations, built by the real code of
// the integration: the app itself (src/app.js) wired to the fake Gladys of the
// SDK and to the fake Open API of the tests (test/helpers/fake-openapi.js),
// on a fixed date. Four cards:
//   talk       "Now on air" on a talk station: show, episode, segment, end
//   music      "Now on air" on a music station: the track
//   schedule   "Upcoming shows" of the talk station
//   usage      "Open API usage": requests of the day against the budget
// Every program, title and artist is invented: never data of Radio France.
// Written as JSON for render.js: node gen.mjs <repo> <out.json>

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (file) => import(pathToFileURL(join(repo, file)).href);
const { createApp } = await load('src/app.js');
const { memoryStorage } = await load('src/storage.js');
const { LANGUAGES } = await load('src/i18n.js');
const { createFakeOpenApi, FAKE_KEY } = await load('test/helpers/fake-openapi.js');
const { createFakeGladys } = await import(
  pathToFileURL(join(repo, 'node_modules/@gladysassistant/integration-sdk/lib/testing.js')).href
);

const manifest = JSON.parse(readFileSync(join(repo, 'gladys-assistant-integration.json'), 'utf8'));
const silent = { info() {}, warn() {}, error() {}, debug() {} };

// Saturday 24 October 2026, 07:31 in Paris; 312 requests already used today.
let clock = Date.UTC(2026, 9, 24, 5, 31, 20);
const api = createFakeOpenApi({ now: () => clock });
const gladys = createFakeGladys({ config: { api_key: FAKE_KEY, language: 'en' } });
const app = createApp(gladys, {
  storage: memoryStorage({ 'usage.json': { day: '2026-10-24', count: 309 } }),
  fetch: api.fetch,
  now: () => clock,
  timeZone: 'Europe/Paris',
  logger: silent,
});
await gladys.connect();
await app.start();
for (const id of ['franceinter', 'fip', 'francebleu_alsace']) {
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id.endsWith(`:${id}`));
  await gladys.fake.deviceCreated(structuredClone(device));
}
await app.round();
clock += 50 * 1000;

const station = (id) => ({ station: `ext:test-integration:station:${id}` });
const cards = {
  talk: ['now_playing', station('franceinter')],
  music: ['now_playing', station('fip')],
  schedule: ['schedule', station('franceinter')],
  usage: ['api_usage', {}],
};
const contents = Object.fromEntries(LANGUAGES.map((language) => [language, {}]));
for (const language of LANGUAGES) {
  for (const [name, [key, settings]] of Object.entries(cards)) {
    const ack = await gladys.fake.widgetGet(key, { settings, language });
    if (!ack.success) throw new Error(`${name}: ${ack.error}`);
    contents[language][name] = ack.data.content;
  }
}
await app.stop();
await gladys.fake.shutdown();

const declaration = (key) => manifest.widgets.find((widget) => widget.key === key);
writeFileSync(
  out,
  JSON.stringify({
    contents,
    images: {},
    cards: Object.fromEntries(
      Object.entries(cards).map(([name, [key]]) => [
        name,
        { icon: declaration(key).icon, label: declaration(key).label },
      ]),
    ),
  }),
);
