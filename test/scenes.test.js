// Transitions and event data of the scene triggers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  idsOnAir,
  stepEvent,
  trackEvent,
  transitions,
  TRIGGERS,
  STALE_SECONDS,
} from '../src/scenes.js';

const NOW = 1_800_000_000;
const show = (id, start = NOW - 60) => ({
  id,
  kind: 'diffusion',
  start,
  end: start + 3600,
  title: `Episode ${id}`,
  show: `Show ${id}`,
  description: 'x'.repeat(1500),
  url: 'https://www.radiofrance.fr/x',
});
const song = (id, start = NOW - 10) => ({
  id,
  kind: 'track',
  start,
  end: start + 200,
  title: 'T',
  track: { title: 'T', artist: 'A', album: 'B', year: 2001, label: '' },
});

test('nothing at the first reading', () => {
  assert.deepEqual(transitions(null, { show: show('a'), program: null, song: song('t') }, NOW), []);
});

test('one event per new step, none for the same one', () => {
  const before = { show: 'a', program: null, song: 't1' };
  assert.deepEqual(
    transitions(before, { show: show('a'), program: null, song: song('t1') }, NOW),
    [],
  );
  const now = { show: show('b'), program: show('p'), song: song('t2') };
  assert.deepEqual(
    transitions(before, now, NOW).map(([key]) => key),
    [TRIGGERS.SHOW_STARTED, TRIGGERS.PROGRAM_STARTED, TRIGGERS.TRACK_STARTED],
  );
});

test('a step that started long ago is not announced (after a pause)', () => {
  const before = { show: 'a', program: null, song: null };
  const late = { show: show('b', NOW - STALE_SECONDS - 1), program: null, song: null };
  assert.deepEqual(transitions(before, late, NOW), []);
  const fresh = { show: show('b', NOW - STALE_SECONDS + 1), program: null, song: null };
  assert.equal(transitions(before, fresh, NOW).length, 1);
});

test('a track missing for one reading is not announced twice', () => {
  const first = idsOnAir(null, { show: null, program: null, song: song('t1') });
  const gap = idsOnAir(first, { show: null, program: null, song: null });
  assert.equal(gap.song, 't1');
  assert.deepEqual(transitions(gap, { show: null, program: null, song: song('t1') }, NOW), []);
});

test('event data: flat, scalar, 1,000 characters at most', () => {
  const events = [
    trackEvent('ext:radio-france:station:fip', 'FIP', song('t')),
    stepEvent('ext:radio-france:station:franceinter', 'France Inter', show('a'), 'Europe/Paris'),
  ];
  for (const data of events) {
    assert.ok(Object.keys(data).length <= 30);
    for (const [key, value] of Object.entries(data)) {
      assert.ok(
        value === null || ['string', 'number', 'boolean'].includes(typeof value),
        `${key}: ${typeof value}`,
      );
      if (typeof value === 'string') assert.ok(value.length <= 1000, key);
    }
  }
  assert.equal(events[0].year, 2001);
  assert.equal(events[1].description.length, 1000);
  assert.match(events[1].ends_at, /^\d\d:\d\d$/);
});
