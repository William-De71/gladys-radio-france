// -----------------------------------------------------------------------------
// Scene triggers and actions.
//
// Triggers (one event per transition seen by the polling of the followed
// stations, never at the first reading after a start, never for a step
// already announced, never for a step that started more than 30 minutes ago
// — after a pause, a late event would be wrong —, and never as a consequence
// of a scene action or of a widget button):
//   track_started     a new track on air
//   show_started      a new show
//   program_started   a new segment inside the show (the 7 o'clock news…)
//
// Actions:
//   get_now_playing   what is on air (memory when less than 60 s old)
//   get_upcoming      the next shows, with a sentence to read out
//
// Event data is flat (≤ 30 keys, strings ≤ 1,000 characters).
// -----------------------------------------------------------------------------

import { clockTime } from './time.js';

export const TRIGGERS = {
  TRACK_STARTED: 'track_started',
  SHOW_STARTED: 'show_started',
  PROGRAM_STARTED: 'program_started',
};

export const ACTIONS = {
  GET_NOW_PLAYING: 'get_now_playing',
  GET_UPCOMING: 'get_upcoming',
};

export const STALE_SECONDS = 30 * 60;
const MAX = 1000;

const cut = (value, max = MAX) => {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/**
 * @description The event of a new track.
 * @param {string} device - Device external id.
 * @param {string} stationName - Station title.
 * @param {object} song - The track step.
 * @returns {object} Event data.
 */
export function trackEvent(device, stationName, song) {
  return {
    station: device,
    station_name: cut(stationName),
    title: cut(song.track.title),
    artist: cut(song.track.artist),
    album: cut(song.track.album),
    year: Number.isInteger(song.track.year) ? song.track.year : null,
    label: cut(song.track.label),
  };
}

/**
 * @description The event of a new show or segment.
 * @param {string} device - Device external id.
 * @param {string} stationName - Station title.
 * @param {object} step - The show or segment.
 * @param {string} timeZone - Time zone of `ends_at`.
 * @returns {object} Event data.
 */
export function stepEvent(device, stationName, step, timeZone) {
  return {
    station: device,
    station_name: cut(stationName),
    show: cut(step.show),
    title: cut(step.title),
    description: cut(step.description),
    url: cut(step.url),
    ends_at: step.end ? clockTime(step.end * 1000, timeZone) : '',
  };
}

/**
 * @description The transitions between two readings of a station.
 * @param {object|null} before - The ids announced so far `{ show, program,
 * song }`, null at the first reading.
 * @param {object} now - `{ show, program, song }` on air.
 * @param {number} nowSeconds - Now (s).
 * @returns {Array<[string, object]>} `[trigger, step]` to announce.
 */
export function transitions(before, now, nowSeconds) {
  if (!before) {
    return [];
  }
  const fresh = (step) =>
    step && step.id && (step.start === null || nowSeconds - step.start <= STALE_SECONDS);
  const out = [];
  if (fresh(now.show) && now.show.id !== before.show) out.push([TRIGGERS.SHOW_STARTED, now.show]);
  if (fresh(now.program) && now.program.id !== before.program) {
    out.push([TRIGGERS.PROGRAM_STARTED, now.program]);
  }
  if (fresh(now.song) && now.song.id !== before.song) out.push([TRIGGERS.TRACK_STARTED, now.song]);
  return out;
}

/**
 * @description The ids of what is on air, the base of the next comparison.
 * Steps keep their id while absent: a station that loses its track for one
 * reading (a jingle between two tracks) does not announce the same track
 * twice.
 * @param {object|null} before - Previous ids.
 * @param {object} now - `{ show, program, song }`.
 * @returns {{show: string|null, program: string|null, song: string|null}} Ids.
 */
export function idsOnAir(before, now) {
  return {
    show: now.show?.id ?? before?.show ?? null,
    program: now.program?.id ?? before?.program ?? null,
    song: now.song?.id ?? before?.song ?? null,
  };
}
