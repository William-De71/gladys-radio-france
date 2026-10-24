// -----------------------------------------------------------------------------
// One Gladys device per Radio France station.
//
//   external_id   ext:<selector>:station:<station id in lower case>
//                 (fip, franceinter, francebleu_alsace, fip_hip_hop…): the id
//                 of the `StationsEnum` of the API, never its title
//   features      show      the show on air (text)
//                 program   the segment on air inside it (text)
//                 track     "Artist – Title" of the track on air (text)
//                 follow    whether the integration asks the API about this
//                           station (switch, written by the user or a scene)
//
// No `should_poll`: Gladys polls at most every 60 s, the API allows 1,000
// requests a day; the integration paces itself (src/scheduler.js).
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { isStationId } from './api/client.js';
import { t } from './i18n.js';

export const DEVICE_TYPE = 'station';
export const FEATURES = {
  SHOW: 'show',
  PROGRAM: 'program',
  TRACK: 'track',
  FOLLOW: 'follow',
};
export const STATION_PARAM = 'RADIO_FRANCE_STATION';

// Gladys takes an empty text for no text at all (the state would be lost):
// nothing on air reads as a dash.
export const NO_TEXT = '–';
const MAX_TEXT = 250;

const text = () => ({
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
  min: 0,
  max: 0,
  read_only: true,
  has_feedback: true,
  keep_history: false,
});

const FEATURE_SPECS = [
  [FEATURES.SHOW, text()],
  [FEATURES.PROGRAM, text()],
  [FEATURES.TRACK, text()],
  [
    FEATURES.FOLLOW,
    {
      category: DEVICE_FEATURE_CATEGORIES.SWITCH,
      type: DEVICE_FEATURE_TYPES.SWITCH.BINARY,
      min: 0,
      max: 1,
      read_only: false,
      has_feedback: true,
      keep_history: false,
    },
  ],
];

/**
 * @description The station id of a device external id.
 * @param {object} gladys - SDK client.
 * @param {string} externalId - Device external id.
 * @returns {string|null} FIP, FRANCEINTER… or null.
 */
export function stationIdOf(gladys, externalId) {
  const prefix = gladys.externalIds(DEVICE_TYPE, '').device;
  const value = String(externalId ?? '');
  if (!value.startsWith(prefix)) {
    return null;
  }
  const id = value.slice(prefix.length).toUpperCase();
  return isStationId(id) ? id : null;
}

/**
 * @description The external ids of a station.
 * @param {object} gladys - SDK client.
 * @param {string} id - Station id.
 * @returns {{device: string, feature: Function}} Ids.
 */
export function idsOf(gladys, id) {
  return gladys.externalIds(DEVICE_TYPE, id.toLowerCase());
}

/**
 * @description The device of a station, for the Discover tab.
 * @param {object} gladys - SDK client.
 * @param {{id: string, title: string}} station - The station.
 * @param {string} language - Language of the feature names.
 * @returns {object} The device.
 */
export function buildDevice(gladys, station, language) {
  const ids = idsOf(gladys, station.id);
  const name = station.title || station.id;
  return {
    name,
    external_id: ids.device,
    should_poll: false,
    features: FEATURE_SPECS.map(([key, feature]) => ({
      name: `${name} - ${t(`feature_${key}`, language)}`,
      external_id: ids.feature(key),
      ...feature,
    })),
    params: [{ name: STATION_PARAM, value: station.id }],
  };
}

const cut = (value) => {
  const clean = String(value ?? '').trim();
  return clean.length > MAX_TEXT ? `${clean.slice(0, MAX_TEXT - 1)}…` : clean;
};

/**
 * @description The text of a track: "Artist – Title".
 * @param {object|null} song - A track step.
 * @returns {string} The text, '' without a track.
 */
export function trackText(song) {
  if (!song?.track) {
    return '';
  }
  return [song.track.artist, song.track.title].filter(Boolean).join(' – ');
}

/**
 * @description The values of the features of a station.
 * @param {object|null} now - `{ show, program, song }` on air, null when unknown.
 * @param {boolean} following - The follow switch.
 * @returns {Array<[string, number|{text: string}]>} `[featureKey, value]`.
 */
export function featureValues(now, following) {
  const values = [[FEATURES.FOLLOW, following ? 1 : 0]];
  if (!following) {
    // A station that is not asked any more: no stale programs.
    values.push([FEATURES.SHOW, { text: NO_TEXT }]);
    values.push([FEATURES.PROGRAM, { text: NO_TEXT }]);
    values.push([FEATURES.TRACK, { text: NO_TEXT }]);
    return values;
  }
  if (!now) {
    return values;
  }
  values.push([FEATURES.SHOW, { text: cut(now.show?.show) || NO_TEXT }]);
  values.push([FEATURES.PROGRAM, { text: cut(now.program?.show) || NO_TEXT }]);
  values.push([FEATURES.TRACK, { text: cut(trackText(now.song)) || NO_TEXT }]);
  return values;
}
