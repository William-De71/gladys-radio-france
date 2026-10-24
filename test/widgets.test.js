// The widget contents, checked with the validator of the SDK (what the core
// would drop), in the four languages.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import {
  BUTTONS,
  buildNowPlayingWidget,
  buildScheduleWidget,
  buildUsageWidget,
} from '../src/widgets.js';
import { parseLive, topLevelShows } from '../src/api/parse.js';
import { LANGUAGES } from '../src/i18n.js';
import { liveOf, stepsOf } from './helpers/fake-openapi.js';

const NOW = Date.UTC(2026, 9, 24, 5, 3);
const S = NOW / 1000;
const TZ = 'Europe/Paris';
const inter = { id: 'FRANCEINTER', title: 'France Inter' };
const credit = /données fournies par l’Open API Radio France/;

const contents = (language) => ({
  now: buildNowPlayingWidget({
    station: inter,
    now: parseLive(liveOf('FRANCEINTER', S)),
    fetchedAt: NOW - 90 * 1000,
    following: true,
    language,
    timeZone: TZ,
    nowMs: NOW,
  }),
  nowMusic: buildNowPlayingWidget({
    station: { id: 'FIP', title: 'FIP' },
    now: parseLive(liveOf('FIP', S)),
    fetchedAt: NOW,
    following: false,
    language,
    timeZone: TZ,
    nowMs: NOW,
  }),
  waiting: buildNowPlayingWidget({
    station: inter,
    now: null,
    fetchedAt: 0,
    following: true,
    canRefresh: false,
    language,
    timeZone: TZ,
    nowMs: NOW,
  }),
  none: buildNowPlayingWidget({ station: null, language, timeZone: TZ, nowMs: NOW }),
  schedule: buildScheduleWidget({
    station: inter,
    shows: topLevelShows(
      stepsOf('FRANCEINTER', S - 7200, S + 43200, { tracks: false, nowSeconds: S }),
      S,
    ),
    language,
    timeZone: TZ,
    nowMs: NOW,
  }),
  noSchedule: buildScheduleWidget({
    station: { id: 'FIP', title: 'FIP' },
    shows: [],
    language,
    timeZone: TZ,
    nowMs: NOW,
  }),
  scheduleError: buildScheduleWidget({
    station: inter,
    shows: null,
    reason: 'The Open API did not answer (HTTP 503).',
    language,
    timeZone: TZ,
    nowMs: NOW,
  }),
  scheduleNone: buildScheduleWidget({
    station: null,
    shows: null,
    language,
    timeZone: TZ,
    nowMs: NOW,
  }),
  ...Object.fromEntries(
    ['ok', 'idle', 'nokey', 'auth', 'quota', 'budget', 'error'].map((kind) => [
      `usage-${kind}`,
      buildUsageWidget({
        used: kind === 'budget' ? 900 : 312,
        budget: 900,
        state: { kind, until: NOW + 3600 * 1000 },
        nextAt: kind === 'ok' ? NOW + 125 * 1000 : null,
        followed: 3,
        paced: kind === 'budget',
        resetAt: Date.UTC(2026, 9, 24, 22, 0),
        language,
        timeZone: TZ,
      }),
    ]),
  ),
});

test('every content passes the validator of the SDK, in every language, with the credit last', () => {
  for (const language of LANGUAGES) {
    for (const [name, content] of Object.entries(contents(language))) {
      assert.deepEqual(validateWidgetContent(content), [], `${name} (${language})`);
      const last = content.components.at(-1);
      assert.equal(last.type, 'text', name);
      assert.equal(last.variant, 'caption', name);
      assert.match(last.text.fr, credit, name);
      assert.ok(content.ttl_seconds >= 10 && content.ttl_seconds <= 3600);
    }
  }
});

test('now on air: show, episode, segment, end; the refresh button carries the station', () => {
  const { now, nowMusic, waiting } = contents('fr');
  const rows = Object.fromEntries(now.components[1].items.map((item) => [item.label, item.value]));
  assert.equal(rows['Séquence'], 'Le journal fictif');
  assert.equal(rows['Fin prévue'], '08:00');
  assert.equal(rows['Mis à jour'], 'il y a 1 min');
  const button = now.components.find((c) => c.type === 'button');
  assert.deepEqual(button.action, { key: BUTTONS.REFRESH, params: { station: 'FRANCEINTER' } });
  const music = Object.fromEntries(
    nowMusic.components[1].items.map((item) => [item.label, item.value]),
  );
  assert.match(music['Suivi'], /Désactivé/);
  assert.match(music['Morceau'], / – /);
  assert.ok(!waiting.components.some((c) => c.type === 'button'), 'no key: no button');
});

test('upcoming shows: a list of 8 at most, the one on air marked, times in the local zone', () => {
  const { schedule, noSchedule } = contents('en');
  const list = schedule.components.find((c) => c.type === 'card-list');
  assert.equal(list.items.length, 8);
  assert.equal(list.items[0].badge.text, 'On air');
  assert.match(list.items[0].subtitle, /^07:00–08:00 · /);
  assert.equal(list.items[0].links[0].url.startsWith('https://'), true);
  assert.ok(!list.items[1].badge);
  assert.equal(noSchedule.components[1].items[0].value, 'Not published in advance');
});

test('API usage: a gauge against the budget, the state in words', () => {
  const usage = contents('en')['usage-quota'];
  const [gauge, status] = usage.components;
  assert.deepEqual([gauge.type, gauge.value, gauge.min, gauge.max], ['gauge', 312, 0, 900]);
  assert.match(status.items[0].value, /^Quota pause until \d\d:\d\d$/);
  assert.equal(status.items[4].value, '00:00');
  const over = buildUsageWidget({
    used: 950,
    budget: 500,
    state: { kind: 'ok' },
    nextAt: null,
    followed: 0,
    paced: false,
    resetAt: NOW,
    language: 'en',
    timeZone: TZ,
  });
  assert.equal(over.components[0].value, 500, 'never past the gauge');
  assert.equal(over.components[0].color, 'danger');
});
