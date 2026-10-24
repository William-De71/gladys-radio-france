// -----------------------------------------------------------------------------
// Answers of the Open API -> the small objects the integration works with.
//
// Nothing here is stored: the results live in memory for a few minutes at
// most (the FAQ of the Open API forbids storing its data). Texts are kept as
// Radio France wrote them; only surrounding spaces are trimmed.
//
// A step (a "time zone" of the grid) is one of:
//   DiffusionStep  a show broadcast (diffusion), or a feature inside it
//   BlankStep      a jingle, a news flash, an untitled segment (title only)
//   TrackStep      a track played on air
// Times are POSIX seconds (UTC).
// -----------------------------------------------------------------------------

import { isStationId } from './client.js';

const str = (value) => (typeof value === 'string' ? value.trim() : '');
const seconds = (value) => {
  const number = typeof value === 'string' ? Number(value) : value;
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : null;
};
const names = (value) =>
  (Array.isArray(value) ? value : typeof value === 'string' ? [value] : [])
    .map(str)
    .filter(Boolean);

/**
 * @description The stations of the `brands` answer.
 *
 * A brand that has no stream of its own (France Bleu / ICI, a network of
 * local stations) is not a station; its local stations are. A station whose
 * `liveStream` is explicitly null does not broadcast (the former local FIP
 * stations): left out too. Titles and ids come from the answer, never from a
 * list in the code (France Bleu was renamed ICI in 2025).
 * @param {object} data - `{ brands: [...] }`.
 * @returns {Array<{id: string, title: string, brand: string, kind: string}>}
 * Stations, in the order of the answer.
 */
export function parseStations(data) {
  const stations = [];
  const seen = new Set();
  const broadcasts = (entry) =>
    !Object.prototype.hasOwnProperty.call(entry, 'liveStream') || Boolean(entry.liveStream);
  const add = (entry, brand, kind) => {
    const id = str(entry?.id);
    if (!isStationId(id) || seen.has(id) || !broadcasts(entry)) {
      return;
    }
    seen.add(id);
    stations.push({ id, title: str(entry.title) || id, brand, kind });
  };
  for (const brand of Array.isArray(data?.brands) ? data.brands : []) {
    if (!brand || typeof brand !== 'object') continue;
    const brandId = str(brand.id);
    add(brand, brandId, 'brand');
    for (const local of Array.isArray(brand.localRadios) ? brand.localRadios : []) {
      if (local) add(local, brandId, 'local');
    }
    for (const web of Array.isArray(brand.webRadios) ? brand.webRadios : []) {
      if (web) add(web, brandId, 'webradio');
    }
  }
  return stations;
}

/**
 * @description One step of an answer.
 * @param {object|null} raw - A step.
 * @returns {object|null} `{ id, kind, start, end, title, show, description,
 * url, track }`, null when it carries nothing to show.
 */
export function parseStep(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const base = {
    id: str(raw.id) || null,
    start: seconds(raw.start),
    end: seconds(raw.end),
  };
  if (raw.track && typeof raw.track === 'object') {
    const { track } = raw;
    const artists = names(track.mainArtists);
    const performers = names(track.performers);
    const authors = names(track.authors);
    const title = str(track.title);
    if (!title) return null;
    return {
      ...base,
      id: base.id ?? (str(track.id) || null),
      kind: 'track',
      title,
      show: '',
      description: '',
      url: '',
      track: {
        title,
        artist: (artists.length ? artists : performers.length ? performers : authors).join(', '),
        album: str(track.albumTitle),
        year: seconds(track.productionDate),
        label: str(track.label),
      },
    };
  }
  if (raw.diffusion && typeof raw.diffusion === 'object') {
    const { diffusion } = raw;
    const title = str(diffusion.title);
    const show = str(diffusion.show?.title);
    if (!title && !show) return null;
    const url = str(diffusion.url);
    return {
      ...base,
      id: base.id ?? (str(diffusion.id) || null),
      kind: 'diffusion',
      title: title || show,
      show: show || title,
      description: str(diffusion.standFirst),
      url: /^https:\/\//.test(url) ? url : '',
      track: null,
    };
  }
  const title = str(raw.title);
  if (!title) {
    return null;
  }
  return { ...base, kind: 'blank', title, show: title, description: '', url: '', track: null };
}

/**
 * @description The answer of `live` for one station.
 * @param {object|null} raw - `{ show, program, song }`.
 * @returns {{show: object|null, program: object|null, song: object|null}} Now.
 */
export function parseLive(raw) {
  const show = parseStep(raw?.show);
  let program = parseStep(raw?.program);
  const song = parseStep(raw?.song);
  if (program && show && program.id && program.id === show.id) {
    program = null;
  }
  return { show, program, song: song?.kind === 'track' ? song : null };
}

const contains = (step, nowSeconds) =>
  step.start !== null && step.end !== null && step.start <= nowSeconds && nowSeconds < step.end;
const length = (step) => (step.end ?? 0) - (step.start ?? 0);

/**
 * @description What is on air now, from a grid around now (the fallback when
 * the `live` query is refused): the longest show containing now, the
 * shortest feature inside it, the track playing.
 * @param {Array<object>} rawSteps - Steps of the grid.
 * @param {number} nowSeconds - Now (s).
 * @returns {{show: object|null, program: object|null, song: object|null}} Now.
 */
export function currentFromGrid(rawSteps, nowSeconds) {
  const steps = (Array.isArray(rawSteps) ? rawSteps : [])
    .map(parseStep)
    .filter((step) => step && contains(step, nowSeconds));
  const shows = steps
    .filter((step) => step.kind !== 'track')
    .sort((a, b) => length(b) - length(a) || a.start - b.start);
  const show = shows[0] ?? null;
  const program =
    shows.length > 1 && length(shows[shows.length - 1]) < length(show)
      ? shows[shows.length - 1]
      : null;
  const song = steps.find((step) => step.kind === 'track') ?? null;
  return { show, program, song };
}

/**
 * @description The shows of a grid: the diffusions that are not features of
 * a longer one (the grid lists a show and, inside its time range, its
 * features). Ordered by start.
 * @param {Array<object>} rawSteps - Steps of the grid.
 * @param {number} [fromSeconds] - Keep the shows still on air at this time.
 * @returns {Array<object>} Top-level shows.
 */
export function topLevelShows(rawSteps, fromSeconds = 0) {
  const steps = (Array.isArray(rawSteps) ? rawSteps : [])
    .map(parseStep)
    .filter((step) => step && step.kind === 'diffusion' && step.start !== null && step.end !== null)
    .filter((step) => step.end > step.start);
  const seen = new Set();
  return steps
    .filter(
      (step) =>
        !steps.some(
          (other) =>
            other !== step &&
            other.start <= step.start &&
            other.end >= step.end &&
            length(other) > length(step),
        ),
    )
    .filter((step) => step.end > fromSeconds)
    .filter((step) => {
      const key = step.id ?? `${step.start}-${step.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.start - b.start);
}
