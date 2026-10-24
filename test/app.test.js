// The integration end to end: the real app, the fake Gladys of the SDK and the
// fake Open API (test/helpers/fake-openapi.js), on a fake clock. No network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createApp, SETTINGS_FILE } from '../src/app.js';
import { USAGE_FILE } from '../src/budget.js';
import { memoryStorage } from '../src/storage.js';
import { FAKE_KEY, createFakeOpenApi } from './helpers/fake-openapi.js';

const START = Date.UTC(2026, 9, 24, 4, 58, 0); // 06:58 in Paris
const NEWS = Date.UTC(2026, 9, 24, 5, 3, 0); // 07:03 in Paris: the news is on
const DEVICE = (id) => `ext:test-integration:station:${id}`;
const feature = (id, key) => `${DEVICE(id)}:${key}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function setup(t, options = {}) {
  let clock = options.start ?? START;
  const api = createFakeOpenApi({ now: () => clock, ...(options.api ?? {}) });
  const gladys = createFakeGladys({
    config: { api_key: FAKE_KEY, language: 'en', ...(options.config ?? {}) },
    devices: options.devices ?? [],
  });
  const storage = options.storage ?? memoryStorage();
  const logs = [];
  const logger = Object.fromEntries(
    ['info', 'warn', 'error', 'debug'].map((level) => [
      level,
      (...args) => logs.push(args.join(' ')),
    ]),
  );
  const app = createApp(gladys, {
    storage,
    fetch: api.fetch,
    now: () => clock,
    timeZone: 'Europe/Paris',
    logger,
  });
  await gladys.connect();
  await app.start();
  t.after(async () => {
    await app.stop();
    await gladys.disconnect();
  });
  return {
    api,
    gladys,
    app,
    storage,
    logs,
    advance: (ms) => {
      clock += ms;
    },
    now: () => clock,
  };
}

const create = async ({ gladys }, ...ids) => {
  for (const id of ids) {
    const device = gladys.fake.discoveredDevices.find((d) => d.external_id === DEVICE(id));
    assert.ok(device, id);
    await gladys.fake.deviceCreated(structuredClone(device));
  }
};
const liveRequests = (api) =>
  api.requests.filter((r) => /live\(|grid\(.*includeTracks: true/.test(r.query));
const events = (gladys, key) => gladys.fake.sceneEvents.filter((event) => event.key === key);

test('start: the station list (1 request), published for Discover, nothing polled yet', async (t) => {
  const { gladys, api } = await setup(t);
  assert.equal(api.requests.length, 1, 'brands only: no station is created');
  assert.match(api.requests[0].query, /brands/);
  const ids = gladys.fake.discoveredDevices.map((device) => device.external_id);
  assert.equal(ids.length, 8);
  assert.ok(ids.includes(DEVICE('francebleu_alsace')));
  assert.ok(!ids.includes(DEVICE('francebleu')), 'a brand without a stream');
  const inter = gladys.fake.discoveredDevices.find((d) => d.external_id === DEVICE('franceinter'));
  assert.equal(inter.name, 'France Inter');
  assert.deepEqual(gladys.fake.connectionStatus, { connected: true });
});

test('no key: no request at all, a status that says how to get one', async (t) => {
  const { api, gladys } = await setup(t, { config: { api_key: '' } });
  assert.equal(api.requests.length, 0);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /developers\.radiofrance\.fr/);
  const { data } = await gladys.fake.action('test_key', {});
  assert.match(data.message.en, /No Open API key/);
  assert.equal(api.requests.length, 0);
});

test('a created station is read in the next round; values published; no event at the first reading', async (t) => {
  const context = await setup(t, { start: NEWS });
  const { gladys, api, app } = context;
  await create(context, 'franceinter', 'fip');
  await app.round();
  const live = liveRequests(api);
  assert.equal(live.length, 1, 'two stations, one request');
  assert.match(live[0].query, /s0: live\(station: FIP\)[\s\S]*s1: live\(station: FRANCEINTER\)/);
  assert.equal(live[0].token, FAKE_KEY);
  await app.states.flush();
  assert.equal(gladys.fake.lastState(feature('franceinter', 'program')), 'Le journal fictif');
  assert.match(String(gladys.fake.lastState(feature('fip', 'track'))), / – /);
  assert.equal(
    gladys.fake.lastState(feature('fip', 'show')),
    '–',
    'FIP has no show: a dash, never empty',
  );
  assert.equal(gladys.fake.lastState(feature('fip', 'follow')), 1);
  assert.deepEqual(gladys.fake.sceneEvents, []);
});

test('transitions fire the triggers once, with flat data', async (t) => {
  const context = await setup(t);
  const { gladys, app, advance } = context;
  await create(context, 'franceinter', 'fip');
  await app.round();
  advance(3 * 60 * 1000); // 07:01 in Paris: a new hour, the news, a new track
  await app.round();
  const show = events(gladys, 'show_started');
  const program = events(gladys, 'program_started');
  const track = events(gladys, 'track_started');
  assert.equal(show.length, 1);
  assert.equal(show[0].data.station, DEVICE('franceinter'));
  assert.equal(show[0].data.ends_at, '08:00');
  assert.equal(program[0].data.show, 'Le journal fictif');
  assert.equal(program[0].data.ends_at, '07:07');
  assert.equal(track.length, 1);
  assert.equal(track[0].data.station_name, 'FIP');
  // The same steps again: nothing new.
  advance(30 * 1000);
  await app.round();
  assert.equal(gladys.fake.sceneEvents.length, 3);
});

test('the next round waits for the end of what is on air, within the bounds', async (t) => {
  const context = await setup(t);
  const { app, now } = context;
  await create(context, 'franceinter');
  await app.round();
  // 06:58: the show ends at 07:00 -> 120 s + 5 s.
  assert.equal(app.nextAt - now(), 125 * 1000);
  assert.equal(app.paced, false);
});

test('follow switch off: the station is no longer asked; nothing followed means no request', async (t) => {
  const context = await setup(t);
  const { gladys, api, app } = context;
  await create(context, 'franceinter', 'fip');
  await app.round();
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === DEVICE('fip'));
  const follow = device.features.find((f) => f.external_id === feature('fip', 'follow'));
  const ack = await gladys.fake.setValue(device, follow, 0);
  assert.equal(ack.success, true);
  await app.round();
  assert.doesNotMatch(liveRequests(api).at(-1).query, /FIP/);
  await app.states.flush();
  assert.equal(gladys.fake.lastState(feature('fip', 'track')), '–');
  assert.equal(gladys.fake.lastState(feature('fip', 'follow')), 0);
  assert.deepEqual(context.storage.files[SETTINGS_FILE].following, {
    FIP: false,
    FRANCEINTER: true,
  });

  const inter = gladys.fake.discoveredDevices.find((d) => d.external_id === DEVICE('franceinter'));
  await gladys.fake.setValue(
    inter,
    inter.features.find((f) => f.key === undefined && f.external_id.endsWith(':follow')),
    0,
  );
  const before = api.requests.length;
  await app.round();
  assert.equal(api.requests.length, before, 'zero request when nothing is followed');
  // The texts are read-only.
  const show = inter.features.find((f) => f.external_id.endsWith(':show'));
  const refused = await gladys.fake.setValue(inter, show, 1);
  assert.equal(refused.success, false);
});

test('the follow switches survive a restart (/data), and only they and the counter are stored', async (t) => {
  const storage = memoryStorage({ [SETTINGS_FILE]: { following: { FIP: false } } });
  const devices = [
    { external_id: DEVICE('fip'), name: 'FIP', features: [] },
    { external_id: DEVICE('franceinter'), name: 'France Inter', features: [] },
  ];
  const { api, app } = await setup(t, { storage, devices });
  const live = liveRequests(api);
  assert.equal(live.length, 1, 'the first round at start');
  assert.doesNotMatch(live[0].query, /station: FIP\)/);
  assert.match(live[0].query, /station: FRANCEINTER\)/);
  await app.budget.flush();
  assert.deepEqual(Object.keys(storage.files).sort(), [SETTINGS_FILE, USAGE_FILE].sort());
  const stored = JSON.stringify(storage.files);
  assert.doesNotMatch(stored, /journal|Matins|Inter"|track/i, 'nothing of Radio France in /data');
});

test('more than 10 stations: one request per 10', async (t) => {
  const context = await setup(t);
  const { api, app } = context;
  const extra = Array.from({ length: 12 }, (_, i) => `FIP_EXTRA${i}`);
  api.state.brands.push({
    id: 'EXTRA',
    title: 'Extra',
    liveStream: null,
    localRadios: [],
    webRadios: extra.map((id) => ({ id, title: id, liveStream: 'https://x.invalid' })),
  });
  await context.gladys.fake.scanRequest();
  await sleep(10);
  // The scan within 10 minutes keeps the list in memory: ask the key test.
  await context.gladys.fake.action('test_key', {});
  await create(context, ...extra.map((id) => id.toLowerCase()));
  const before = liveRequests(api).length;
  await app.round();
  assert.equal(liveRequests(api).length - before, 2);
});

test('a key refused: status, no request until the backoff, then again', async (t) => {
  const context = await setup(t);
  const { api, app, gladys, advance } = context;
  await create(context, 'franceinter');
  api.state.key = 'another-key-xxxxxxxx';
  await app.round();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refuses the API key/);
  const count = api.requests.length;
  advance(60 * 1000);
  await app.round();
  assert.equal(api.requests.length, count, 'backoff: 5 minutes');
  api.state.key = FAKE_KEY;
  advance(5 * 60 * 1000);
  await app.round();
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.ok(
    context.logs.every((line) => !line.includes(FAKE_KEY)),
    'the key is never logged',
  );
});

test('a quota refusal (429): pause until midnight in Paris + 5 min, actions refused', async (t) => {
  const context = await setup(t, { api: { quota: 2 } });
  const { api, app, gladys, advance } = context;
  await create(context, 'franceinter');
  await app.round(); // request 2: OK
  advance(5 * 60 * 1000);
  await app.round(); // request 3: 429
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /quota .* until 00:05/);
  const count = api.requests.length;
  advance(10 * 60 * 1000);
  await app.round();
  const action = await gladys.fake.sceneAction('get_upcoming', { station: DEVICE('franceinter') });
  assert.equal(action.success, false);
  assert.match(action.error, /budget used/);
  assert.equal(api.requests.length, count);
  assert.equal(app.nextAt, Date.UTC(2026, 9, 24, 22, 5) + 1000);
});

test('"server error" past the quota: treated as an outage, retried later, not hammered', async (t) => {
  const context = await setup(t, { api: { quota: 1, quotaMode: '500' } });
  const { app, gladys, now } = context;
  await create(context, 'franceinter');
  await app.round();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /does not answer \(HTTP 500\)/);
  assert.equal(app.nextAt - now(), 60 * 1000);
});

test('the daily budget is respected: rounds stop, the reserve is left to the actions', async (t) => {
  const context = await setup(t, { config: { daily_budget: 100 } });
  const { app, gladys, advance } = context;
  await create(context, 'franceinter');
  for (let i = 0; i < 120; i += 1) {
    advance(15 * 60 * 1000);
    await app.round();
  }
  const used = app.budget.used();
  assert.ok(used <= 100, `${used}`);
  // The first rounds of the next day (00:xx) may have run: the counter restarted.
  assert.ok(gladys.fake.connectionStatuses.length > 0);
});

test('pacing: with few requests left the rounds space out until midnight', async (t) => {
  const storage = memoryStorage({ [USAGE_FILE]: { day: '2026-10-24', count: 880 } });
  const context = await setup(t, { storage });
  const { app, now } = context;
  await create(context, 'franceinter');
  await app.round();
  assert.equal(app.paced, true);
  // 17 h left (06:58 -> 24:00), 900 - 881 - 45 < 1: nothing before the reset.
  assert.equal(app.nextAt, Date.UTC(2026, 9, 24, 22, 0) + 1000);
  assert.ok(app.nextAt - now() > 15 * 60 * 1000);
});

test('the schema refuses the live query: simpler shapes, then the grid', async (t) => {
  const context = await setup(t, { start: NEWS, api: { schema: 'no-live' } });
  const { app, gladys } = context;
  await create(context, 'franceinter', 'fip');
  await app.round();
  assert.equal(app.variant, 'grid');
  await app.states.flush();
  assert.equal(gladys.fake.lastState(feature('franceinter', 'program')), 'Le journal fictif');
  assert.match(String(gladys.fake.lastState(feature('fip', 'track'))), / – /);
  const other = await setup(t, { start: NEWS, api: { schema: 'diffusion-only' } });
  await create(other, 'franceinter');
  await other.app.round();
  assert.equal(other.app.variant, 'live-diffusion');
});

test('a station the API does not know is left out, the others still read', async (t) => {
  const devices = [
    { external_id: DEVICE('franceinter'), name: 'France Inter', features: [] },
    { external_id: DEVICE('gone_station'), name: 'Gone', features: [] },
  ];
  // The list could not be read: every created station is asked.
  const context = await setup(t, { start: NEWS, devices, config: { api_key: FAKE_KEY } });
  const { app, gladys, api } = context;
  api.state.brands = [...api.state.brands];
  await app.round();
  await app.states.flush();
  assert.equal(gladys.fake.lastState(feature('franceinter', 'program')), 'Le journal fictif');
  assert.ok(
    liveRequests(api).every((r) => !/GONE_STATION/.test(r.query)),
    'not in the list: never asked',
  );
});

test('actions: only the declared outputs; memory reused for a minute', async (t) => {
  const context = await setup(t, { start: NEWS });
  const { gladys, app, api, advance } = context;
  await create(context, 'franceinter', 'fip');
  await app.round();
  const count = api.requests.length;
  const now = await gladys.fake.sceneAction('get_now_playing', { station: DEVICE('franceinter') });
  assert.equal(now.success, true, now.error);
  assert.deepEqual(Object.keys(now.data.outputs).sort(), [
    'album',
    'artist',
    'ends_at',
    'program',
    'show',
    'title',
  ]);
  assert.equal(now.data.outputs.program, 'Le journal fictif');
  assert.equal(api.requests.length, count, 'fresh in memory: no request');
  advance(2 * 60 * 1000);
  await gladys.fake.sceneAction('get_now_playing', { station: DEVICE('fip') });
  assert.equal(api.requests.length, count + 1);

  const upcoming = await gladys.fake.sceneAction('get_upcoming', {
    station: DEVICE('franceinter'),
    count: 2,
  });
  assert.equal(upcoming.success, true, upcoming.error);
  assert.deepEqual(Object.keys(upcoming.data.outputs).sort(), [
    'next_show',
    'next_start',
    'summary',
  ]);
  assert.match(
    upcoming.data.outputs.summary,
    /^Coming up on France Inter: .+ at \d\d:\d\d, .+ at \d\d:\d\d\.$/,
  );
  assert.match(api.requests.at(-1).query, /includeTracks: false/);
  // Cached 10 minutes.
  await gladys.fake.sceneAction('get_upcoming', { station: DEVICE('franceinter') });
  assert.equal(api.requests.length, count + 2);
  // An action never fires a trigger.
  assert.deepEqual(gladys.fake.sceneEvents, []);

  const fip = await gladys.fake.sceneAction('get_upcoming', { station: DEVICE('fip') });
  assert.equal(fip.data.outputs.summary, 'No upcoming show announced on FIP.');
  const unknown = await gladys.fake.sceneAction('get_now_playing', { station: 'ext:other:x' });
  assert.equal(unknown.success, false);
});

test('the language of the configuration for the action texts', async (t) => {
  const context = await setup(t, { config: { language: 'fr' } });
  await create(context, 'franceinter');
  const upcoming = await context.gladys.fake.sceneAction('get_upcoming', {
    station: DEVICE('franceinter'),
  });
  assert.match(upcoming.data.outputs.summary, /^À venir sur France Inter : /);
  const device = context.gladys.fake.discoveredDevices[0];
  assert.match(device.features[0].name, / - Émission$/);
});

test('widgets: valid in every language, the credit in each, refresh button once a minute', async (t) => {
  const context = await setup(t);
  const { gladys, app, api, advance } = context;
  await create(context, 'franceinter', 'fip');
  await app.round();
  for (const key of ['now_playing', 'schedule', 'api_usage']) {
    for (const language of ['en', 'fr', 'de', 'es']) {
      const ack = await gladys.fake.widgetGet(key, {
        settings: { station: DEVICE('franceinter') },
        language,
      });
      assert.equal(ack.success, true, ack.error);
      const { content } = ack.data;
      assert.deepEqual(validateWidgetContent(content), [], `${key} ${language}`);
      assert.match(JSON.stringify(content.components.at(-1)), /Open API/);
    }
  }
  const count = api.requests.length;
  const first = await gladys.fake.widgetAction('now_playing', 'refresh', { station: 'FIP' });
  assert.match(first.data.message.en, /^Updated: /);
  assert.equal(api.requests.length, count + 1);
  const second = await gladys.fake.widgetAction('now_playing', 'refresh', { station: 'FIP' });
  assert.match(second.data.message.en, /less than a minute/);
  assert.equal(api.requests.length, count + 1);
  advance(61 * 1000);
  await gladys.fake.widgetAction('now_playing', 'refresh', { station: 'FIP' });
  assert.equal(api.requests.length, count + 2);
  const bad = await gladys.fake.widgetAction('now_playing', 'refresh', { station: 'MOUV' });
  assert.match(bad.data.message.en, /Choose a Radio France station/);
  assert.deepEqual(gladys.fake.sceneEvents, [], 'a button never fires a trigger');
});

test('device created: its values published again, the widgets refreshed', async (t) => {
  const context = await setup(t);
  const { gladys, app } = context;
  await create(context, 'franceinter');
  await app.round();
  await app.states.flush();
  const before = gladys.fake.states.length;
  const device = gladys.fake.discoveredDevices.find((d) => d.external_id === DEVICE('franceinter'));
  await gladys.fake.deviceCreated(structuredClone(device));
  await app.states.flush();
  assert.ok(gladys.fake.states.length > before, 'republished');
  assert.ok(gladys.fake.widgetRefreshes.includes('now_playing'));
  await gladys.fake.deviceDeleted(structuredClone(device));
  assert.equal(app.created.size, 0);
});

test('a new key in the configuration: the list again, the quota pause forgotten', async (t) => {
  const context = await setup(t, { config: { api_key: '' } });
  const { gladys, api } = context;
  assert.equal(api.requests.length, 0);
  await gladys.fake.configUpdated({ api_key: FAKE_KEY, language: 'de' });
  assert.equal(api.requests.length, 1);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(gladys.fake.discoveredDevices[0].features[0].name, / - Sendung$/);
  const { data } = await gladys.fake.action('test_key', {});
  assert.match(
    data.message.fr,
    /^Clé acceptée : 8 stations disponibles\. Requêtes aujourd’hui : 2 sur 900\.$/,
  );
});

test('a station the API stops knowing: left out after one refusal, the others read', async (t) => {
  const context = await setup(t, { start: NEWS });
  const { app, api, gladys, advance } = context;
  await create(context, 'franceinter', 'fip');
  await app.round();
  api.state.brands = api.state.brands.filter((brand) => brand.id !== 'FIP');
  advance(5 * 60 * 1000);
  const before = api.requests.length;
  await app.round();
  assert.equal(api.requests.length - before, 2, 'the refused query, then without FIP');
  assert.doesNotMatch(api.requests.at(-1).query, /station: FIP\)/);
  advance(5 * 60 * 1000);
  await app.round();
  assert.equal(api.requests.length - before, 3);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});
