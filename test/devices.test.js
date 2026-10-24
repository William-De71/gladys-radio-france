// The devices of the Discover tab: what Gladys requires of every feature (the
// pitfalls the fake Gladys does not catch, forum topic 11005).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import {
  FEATURES,
  NO_TEXT,
  buildDevice,
  featureValues,
  stationIdOf,
  trackText,
} from '../src/devices.js';
import { parseStations } from '../src/api/parse.js';
import { LANGUAGES } from '../src/i18n.js';
import { BRANDS } from './helpers/fake-openapi.js';

const gladys = {
  externalIds: (type, id) => ({
    device: `ext:radio-france:${type}:${id}`,
    feature: (key) => `ext:radio-france:${type}:${id}:${key}`,
  }),
};
const stations = parseStations({ brands: BRANDS });

test('one device per station, an eternal external id from the station id (lower case)', () => {
  const device = buildDevice(gladys, { id: 'FRANCEBLEU_ALSACE', title: 'ICI Alsace' }, 'en');
  assert.equal(device.external_id, 'ext:radio-france:station:francebleu_alsace');
  assert.equal(device.name, 'ICI Alsace');
  assert.deepEqual(
    device.features.map((f) => f.external_id.split(':').pop()),
    ['show', 'program', 'track', 'follow'],
  );
  assert.deepEqual(device.params, [{ name: 'RADIO_FRANCE_STATION', value: 'FRANCEBLEU_ALSACE' }]);
  assert.equal(stationIdOf(gladys, device.external_id), 'FRANCEBLEU_ALSACE');
  assert.equal(stationIdOf(gladys, 'ext:radio-france:station:bad id'), null);
  assert.equal(stationIdOf(gladys, 'ext:other:station:fip'), null);
});

test('every feature: min, max, read_only, has_feedback; a known category/type pair', () => {
  const pairs = new Set(
    Object.entries(DEVICE_FEATURE_TYPES).flatMap(([category, types]) =>
      Object.values(types).map((type) => `${DEVICE_FEATURE_CATEGORIES[category]}/${type}`),
    ),
  );
  for (const language of LANGUAGES) {
    for (const station of stations) {
      const device = buildDevice(gladys, station, language);
      assert.equal(device.should_poll, false, 'paced by the integration, never by Gladys');
      assert.equal(device.poll_frequency, undefined);
      for (const feature of device.features) {
        for (const key of ['min', 'max', 'read_only', 'has_feedback']) {
          assert.notEqual(feature[key], undefined, `${feature.external_id}.${key}`);
        }
        assert.ok(pairs.has(`${feature.category}/${feature.type}`), feature.external_id);
        assert.ok(feature.name.startsWith(`${station.title} - `), feature.name);
      }
    }
  }
  const [show, , , follow] = buildDevice(gladys, stations[0], 'en').features;
  assert.deepEqual(
    [show.category, show.type, show.read_only],
    [DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, true],
  );
  assert.deepEqual(
    [follow.category, follow.type, follow.read_only, follow.min, follow.max],
    [DEVICE_FEATURE_CATEGORIES.SWITCH, DEVICE_FEATURE_TYPES.SWITCH.BINARY, false, 0, 1],
  );
});

test('values: never an empty text, a dash instead; nothing stale when not followed', () => {
  const song = {
    id: 't',
    kind: 'track',
    track: { title: 'Song', artist: 'Artist', album: '', year: null, label: '' },
  };
  const now = {
    show: { id: 's', show: 'Show', title: 'Episode' },
    program: null,
    song,
  };
  assert.deepEqual(featureValues(now, true), [
    [FEATURES.FOLLOW, 1],
    [FEATURES.SHOW, { text: 'Show' }],
    [FEATURES.PROGRAM, { text: NO_TEXT }],
    [FEATURES.TRACK, { text: 'Artist – Song' }],
  ]);
  assert.deepEqual(featureValues(null, true), [[FEATURES.FOLLOW, 1]]);
  assert.deepEqual(
    featureValues(now, false).map(([, value]) => value),
    [0, { text: NO_TEXT }, { text: NO_TEXT }, { text: NO_TEXT }],
  );
  const long = featureValues({ show: { show: 'x'.repeat(400) }, program: null, song: null }, true);
  assert.equal(long[1][1].text.length, 250);
  assert.equal(trackText({ track: { title: 'Only', artist: '' } }), 'Only');
  assert.equal(trackText(null), '');
});
