// -----------------------------------------------------------------------------
// A fake Radio France Open API, for the tests and scripts/fake-openapi.mjs.
//
// It answers the queries the integration sends (brands, live with aliases,
// grid) with the shapes of the documentation and of the projects that use
// the API (see NOTICE), on made-up programs: every title, artist and text
// below is invented. No data of Radio France is stored in this repository.
//
// What it simulates:
//   - the x-token header (401 without it or with another key);
//   - the daily quota (429 past `quota` requests, or a 500 "server error");
//   - schemas that refuse a query shape (`schema`: union | diffusion-only |
//     no-live), to test the fallbacks of the client;
//   - an unknown station (a GraphQL validation error for the whole query);
//   - a talk station (shows of one hour, the news at :00, a segment at :30),
//     a classical station (shows of two hours and tracks), a music station
//     without shows (FIP and its web radios, no schedule in advance).
// -----------------------------------------------------------------------------

export const FAKE_KEY = 'test-key-0123456789';

// The station list: a few of each kind. FRANCEBLEU has no stream of its own
// (only its local stations), FIP_BORDEAUX no stream at all.
export const BRANDS = [
  {
    id: 'FRANCEINTER',
    title: 'France Inter',
    liveStream: 'https://stream.invalid/a',
    localRadios: [],
    webRadios: [],
  },
  {
    id: 'FRANCEINFO',
    title: 'franceinfo',
    liveStream: 'https://stream.invalid/b',
    localRadios: null,
    webRadios: null,
  },
  {
    id: 'FRANCEMUSIQUE',
    title: 'France Musique',
    liveStream: 'https://stream.invalid/c',
    localRadios: [],
    webRadios: [
      {
        id: 'FRANCEMUSIQUE_EASY_CLASSIQUE',
        title: 'Musique Easy',
        liveStream: 'https://stream.invalid/d',
      },
    ],
  },
  {
    id: 'FIP',
    title: 'FIP',
    liveStream: 'https://stream.invalid/e',
    localRadios: [{ id: 'FIP_BORDEAUX', title: 'FIP à Bordeaux', liveStream: null }],
    webRadios: [
      { id: 'FIP_ROCK', title: 'FIP Rock', liveStream: 'https://stream.invalid/f' },
      { id: 'FIP_JAZZ', title: 'FIP Jazz', liveStream: 'https://stream.invalid/g' },
    ],
  },
  {
    id: 'FRANCEBLEU',
    title: 'ICI',
    liveStream: null,
    localRadios: [
      { id: 'FRANCEBLEU_ALSACE', title: 'ICI Alsace', liveStream: 'https://stream.invalid/h' },
    ],
    webRadios: [],
  },
];

// Indexed by the UTC hour modulo 8: 05:00 UTC (07:00 in Paris) is the morning show.
const SHOWS = [
  'Le Jeu des mille questions',
  'Le Magazine des ondes',
  'Midi pile',
  'Les Après-midi de demain',
  'La Soirée inventée',
  'Les Matins imaginaires',
  'Le Grand Atelier fictif',
  'La Tête au carré blanc',
];
const SEGMENTS = ['La chronique du jour', 'Le billet d’humeur', 'L’invité surprise'];
const TRACKS = [
  ['Les Lunes de papier', 'Clara Vent', 'Rivages', 2021, 'Label Imaginaire'],
  ['Midnight Ferry', 'The Paper Boats', 'Harbour Lights', 1998, 'Fictional Records'],
  ['Samba da fumaça', 'Orquestra Nuvem', 'Céu aberto', 1975, null],
  ['Blue Hour Blues', 'Sam Ortega Trio', 'Late Session', 2016, 'Imaginary Jazz'],
  ['Valse pour un phare', 'Ensemble Brume', 'Côtes', null, null],
];

const TALK = new Set(['FRANCEINTER', 'FRANCEINFO', 'FRANCEBLEU_ALSACE']);
const CLASSICAL = new Set(['FRANCEMUSIQUE', 'FRANCEMUSIQUE_EASY_CLASSIQUE']);
const NO_SHOWS = (id) => id === 'FIP' || id.startsWith('FIP_');

const diffusion = (id, start, end, showTitle, title, standFirst = '') => ({
  __typename: 'DiffusionStep',
  id,
  start,
  end,
  diffusion: {
    id: `d-${id}`,
    title,
    standFirst,
    url: `https://www.radiofrance.fr/fake/${encodeURIComponent(id)}`,
    show: { id: `show-${showTitle.length}`, title: showTitle },
  },
});

const trackStep = (station, slot) => {
  const [title, artist, album, year, label] = TRACKS[Math.abs(slot) % TRACKS.length];
  const start = slot * 240;
  return {
    __typename: 'TrackStep',
    id: `${station}-track-${start}`,
    start,
    end: start + 240,
    track: {
      id: `t-${slot}`,
      title,
      albumTitle: album,
      mainArtists: [artist],
      performers: [],
      authors: [],
      productionDate: year,
      label,
    },
  };
};

/**
 * @description The steps of a station between two instants.
 * @param {string} station - Station id.
 * @param {number} from - Start (s).
 * @param {number} to - End (s).
 * @param {object} options - `{ tracks, nowSeconds }`.
 * @returns {Array<object>} Steps, parents and children, by start.
 */
export function stepsOf(station, from, to, { tracks = true, nowSeconds = to } = {}) {
  const steps = [];
  if (!NO_SHOWS(station)) {
    const hours = CLASSICAL.has(station) ? 2 : 1;
    const span = hours * 3600;
    for (let start = Math.floor(from / span) * span; start < to; start += span) {
      const name = SHOWS[new Date(start * 1000).getUTCHours() % SHOWS.length];
      const hour = new Date(start * 1000).getUTCHours();
      steps.push(
        diffusion(
          `${station}-show-${start}`,
          start,
          start + span,
          name,
          `${name} du ${new Date(start * 1000).toISOString().slice(0, 10)}`,
          `Une émission inventée pour les tests (${hour} h UTC).`,
        ),
      );
      if (TALK.has(station)) {
        for (let h = 0; h < hours; h += 1) {
          const at = start + h * 3600;
          const utc = new Date(at * 1000).getUTCHours();
          steps.push(
            diffusion(
              `${station}-news-${at}`,
              at,
              at + 420,
              'Le journal fictif',
              `Le journal fictif de ${utc} h`,
            ),
          );
          steps.push({
            __typename: 'BlankStep',
            id: `${station}-jingle-${at}`,
            start: at + 420,
            end: at + 450,
            title: 'Jingle',
          });
          const segment = SEGMENTS[(at / 3600) % SEGMENTS.length];
          steps.push(
            diffusion(
              `${station}-seg-${at}`,
              at + 1800,
              at + 2100,
              segment,
              `${segment} : épisode ${utc}`,
            ),
          );
        }
      }
    }
  }
  if (tracks && (CLASSICAL.has(station) || NO_SHOWS(station) || station === 'MOUV')) {
    // Music stations publish their tracks as they are played, not ahead.
    const last = Math.min(to, nowSeconds + 1);
    for (let slot = Math.floor(from / 240); slot * 240 < last; slot += 1) {
      steps.push(trackStep(station, slot));
    }
  }
  return steps
    .filter((step) => step.end > from && step.start < to)
    .filter((step) => !NO_SHOWS(station) || step.start <= nowSeconds)
    .sort((a, b) => a.start - b.start || b.end - a.end);
}

const contains = (step, at) => step.start <= at && at < step.end;

/**
 * @description What `live` answers for a station.
 * @param {string} station - Station id.
 * @param {number} nowSeconds - Now (s).
 * @returns {object} `{ show, program, song }`.
 */
export function liveOf(station, nowSeconds) {
  const steps = stepsOf(station, nowSeconds - 4 * 3600, nowSeconds + 1, { nowSeconds });
  const now = steps.filter((step) => contains(step, nowSeconds));
  const shows = now.filter((step) => step.__typename !== 'TrackStep');
  shows.sort((a, b) => b.end - b.start - (a.end - a.start));
  return {
    show: shows[0] ?? null,
    program: shows.length > 1 ? shows[shows.length - 1] : null,
    song: now.find((step) => step.__typename === 'TrackStep') ?? null,
  };
}

const json = (status, body) => ({ status, body: JSON.stringify(body) });

/**
 * @description Create the fake API.
 * @param {object} [options] - Options.
 * @param {string} [options.key] - The valid key.
 * @param {Function} [options.now] - Clock (ms).
 * @param {number} [options.quota] - Requests a day before the refusal.
 * @param {string} [options.quotaMode] - `429` or `500`.
 * @param {string} [options.schema] - union | diffusion-only | no-live.
 * @returns {object} `{ answer, fetch, requests, state }`.
 */
export function createFakeOpenApi(options = {}) {
  const state = {
    key: options.key ?? FAKE_KEY,
    now: options.now ?? Date.now,
    quota: options.quota ?? 1000,
    quotaMode: options.quotaMode ?? '429',
    schema: options.schema ?? 'union',
    down: false,
    brands: structuredClone(BRANDS),
    count: 0,
  };
  const requests = [];

  /**
   * @description Answer one HTTP request.
   * @param {object} request - `{ method, headers, body }`.
   * @returns {{status: number, body: string}} The answer.
   */
  const answer = ({ method = 'POST', headers = {}, body = '' }) => {
    const token = headers['x-token'];
    let query;
    try {
      query = JSON.parse(body).query ?? '';
    } catch {
      query = '';
    }
    requests.push({ method, token, query });
    if (state.down) return json(503, { message: 'Service Unavailable' });
    if (!token) return json(401, { message: 'Unauthorized: Missing x-token' });
    if (token !== state.key) return json(401, { message: 'Unauthorized' });
    state.count += 1;
    if (state.count > state.quota) {
      return state.quotaMode === '500'
        ? json(500, { message: 'Internal Server Error' })
        : json(429, { message: 'Too Many Requests: rate limit exceeded' });
    }
    if (method !== 'POST' || !query) {
      return json(400, { errors: [{ message: 'Must provide query string.' }] });
    }
    const nowSeconds = Math.floor(state.now() / 1000);
    const known = new Set(
      state.brands.flatMap((brand) => [
        brand.id,
        ...(brand.localRadios ?? []).map((r) => r.id),
        ...(brand.webRadios ?? []).map((r) => r.id),
      ]),
    );
    const validation = (message) => json(200, { errors: [{ message }], data: null });

    if (/^\{\s*brands\s*\{/.test(query.trim())) {
      return json(200, { data: { brands: state.brands } });
    }
    const lives = [...query.matchAll(/(\w+): live\(station: (\w+)\)/g)];
    const grids = [
      ...query.matchAll(
        /(?:(\w+): )?grid\(start: (\d+), end: (\d+), station: (\w+), includeTracks: (true|false)\)/g,
      ),
    ];
    for (const [, , station] of lives) {
      if (!known.has(station))
        return validation(`Value "${station}" does not exist in "StationsEnum" enum.`);
    }
    for (const match of grids) {
      if (!known.has(match[4])) {
        return validation(`Value "${match[4]}" does not exist in "StationsEnum" enum.`);
      }
    }
    if (lives.length > 0) {
      if (state.schema === 'no-live')
        return validation('Cannot query field "live" on type "Query".');
      if (state.schema === 'diffusion-only' && query.includes('on BlankStep')) {
        return validation(
          'Fragment cannot be spread here as objects of type "DiffusionStep" can never be of type "BlankStep".',
        );
      }
      const data = {};
      for (const [, alias, station] of lives) data[alias] = liveOf(station, nowSeconds);
      return json(200, { data });
    }
    if (grids.length > 0) {
      const data = {};
      for (const [, alias, start, end, station, tracks] of grids) {
        const from = Number(start);
        const to = Number(end);
        if (to - from >= 24 * 3600) {
          return json(200, {
            errors: [{ message: 'The time range must be less than 24 hours' }],
            data: null,
          });
        }
        data[alias ?? 'grid'] = stepsOf(station, from, to, {
          tracks: tracks === 'true',
          nowSeconds,
        }).slice(0, 100);
      }
      return json(200, { data });
    }
    return validation('Syntax Error: Unexpected Name');
  };

  /**
   * @description A `fetch` answering from the fake (tests).
   * @param {string} url - URL.
   * @param {object} init - Request.
   * @returns {Promise<object>} A Response-like object.
   */
  const fetch = async (url, init = {}) => {
    if (state.offline) {
      throw new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });
    }
    const { status, body } = answer({
      method: init.method,
      headers: init.headers ?? {},
      body: init.body,
    });
    return { status, ok: status >= 200 && status < 300, text: async () => body };
  };

  return { answer, fetch, requests, state };
}
