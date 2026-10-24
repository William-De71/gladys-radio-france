// Answers of the API -> stations, steps, what is on air, the shows of a grid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentFromGrid,
  parseLive,
  parseStations,
  parseStep,
  topLevelShows,
} from '../src/api/parse.js';
import { BRANDS, stepsOf } from './helpers/fake-openapi.js';

test('stations: brands, local stations and web radios that broadcast, titles from the answer', () => {
  const stations = parseStations({ brands: BRANDS });
  const ids = stations.map((station) => station.id);
  assert.deepEqual(ids, [
    'FRANCEINTER',
    'FRANCEINFO',
    'FRANCEMUSIQUE',
    'FRANCEMUSIQUE_EASY_CLASSIQUE',
    'FIP',
    'FIP_ROCK',
    'FIP_JAZZ',
    'FRANCEBLEU_ALSACE',
  ]);
  assert.ok(!ids.includes('FRANCEBLEU'), 'a brand without a stream of its own is not a station');
  assert.ok(!ids.includes('FIP_BORDEAUX'), 'a station without a stream is left out');
  // France Bleu became ICI: the title comes from the answer.
  assert.equal(stations.find((s) => s.id === 'FRANCEBLEU_ALSACE').title, 'ICI Alsace');
  assert.equal(stations.find((s) => s.id === 'FIP_ROCK').kind, 'webradio');
});

test('stations: malformed entries, duplicates and unusable ids are skipped', () => {
  const stations = parseStations({
    brands: [
      null,
      {
        id: 'FIP',
        title: ' FIP ',
        webRadios: [
          { id: 'FIP', title: 'again' },
          { id: 'fip_x', title: 'lower' },
        ],
      },
      { id: 'X) { evil', title: 'injection' },
      { id: 'MOUV', liveStream: '' },
      { id: 'NEWSTATION' }, // no liveStream field at all: kept
    ],
  });
  assert.deepEqual(
    stations.map((s) => [s.id, s.title]),
    [
      ['FIP', 'FIP'],
      ['NEWSTATION', 'NEWSTATION'],
    ],
  );
  assert.deepEqual(parseStations(null), []);
  assert.deepEqual(parseStations({ brands: 'nope' }), []);
});

test('a diffusion step: show name, episode title, summary, https page only', () => {
  const step = parseStep({
    __typename: 'DiffusionStep',
    id: 'a_1',
    start: 1000,
    end: '4600',
    diffusion: {
      title: ' Episode du jour ',
      standFirst: 'Résumé',
      url: 'http://insecure.example/page',
      show: { title: 'La Matinale' },
    },
  });
  assert.deepEqual(step, {
    id: 'a_1',
    start: 1000,
    end: 4600,
    kind: 'diffusion',
    title: 'Episode du jour',
    show: 'La Matinale',
    description: 'Résumé',
    url: '',
    track: null,
  });
  assert.equal(parseStep({ id: 'b', diffusion: { title: 'Seul' } }).show, 'Seul');
});

test('a track step: main artists first, then performers, year as a number', () => {
  const step = parseStep({
    id: 't',
    start: 1,
    end: 2,
    track: {
      title: 'Song',
      mainArtists: ['A', 'B'],
      performers: ['P'],
      albumTitle: 'Album',
      productionDate: 1994,
      label: null,
    },
  });
  assert.equal(step.kind, 'track');
  assert.deepEqual(step.track, {
    title: 'Song',
    artist: 'A, B',
    album: 'Album',
    year: 1994,
    label: '',
  });
  assert.equal(
    parseStep({ id: 't', track: { title: 'X', mainArtists: [], performers: ['P'] } }).track.artist,
    'P',
  );
  assert.equal(parseStep({ id: 't', track: { title: '' } }), null);
});

test('a blank step and nothing', () => {
  assert.equal(parseStep({ id: 'j', start: 1, end: 2, title: 'Jingle' }).kind, 'blank');
  assert.equal(parseStep({ id: 'j' }), null);
  assert.equal(parseStep(null), null);
});

test('live: the segment is dropped when it is the show itself', () => {
  const show = { id: 's', start: 1, end: 9, diffusion: { title: 'Show' } };
  assert.equal(parseLive({ show, program: show, song: null }).program, null);
  const now = parseLive({ show: null, program: null, song: { id: 't', track: { title: 'T' } } });
  assert.equal(now.show, null);
  assert.equal(now.song.track.title, 'T');
  assert.deepEqual(parseLive(null), { show: null, program: null, song: null });
});

test('from a grid: the longest show, the shortest segment and the track playing now', () => {
  const at = Date.UTC(2026, 9, 24, 5, 3) / 1000;
  const now = currentFromGrid(
    stepsOf('FRANCEINTER', at - 3 * 3600, at + 60, { nowSeconds: at }),
    at,
  );
  assert.equal(now.show.show, stepsOf('FRANCEINTER', at, at + 1)[0].diffusion.show.title);
  assert.equal(now.program.show, 'Le journal fictif');
  assert.equal(now.song, null);
  const fip = currentFromGrid(stepsOf('FIP', at - 3 * 3600, at + 60, { nowSeconds: at }), at);
  assert.equal(fip.show, null);
  assert.equal(fip.song.kind, 'track');
});

test('the shows of a grid: no segment, from now on, ordered', () => {
  const at = Date.UTC(2026, 9, 24, 5, 40) / 1000;
  const steps = stepsOf('FRANCEINTER', at - 7200, at + 12 * 3600, {
    tracks: false,
    nowSeconds: at,
  });
  const shows = topLevelShows(steps, at);
  assert.ok(shows.length >= 12);
  assert.ok(shows.every((show) => show.end - show.start === 3600));
  assert.ok(shows[0].start <= at && at < shows[0].end, 'the show on air comes first');
  for (let i = 1; i < shows.length; i += 1) assert.ok(shows[i].start > shows[i - 1].start);
  assert.deepEqual(topLevelShows(null), []);
});
