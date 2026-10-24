// -----------------------------------------------------------------------------
// Time helpers.
//
// The daily quota of the Open API (1,000 requests per key) is assumed to be
// reset at midnight in Paris: Radio France does not document the hour. The
// day of the request counter is therefore always computed in Europe/Paris,
// whatever the time zone of the container. Times shown to the user (end of a
// show, next reading) use the time zone the Gladys supervisor gives the
// container (TZ), Europe/Paris when there is none.
// -----------------------------------------------------------------------------

export const PARIS = 'Europe/Paris';

const formatters = new Map();
const formatter = (timeZone) => {
  if (!formatters.has(timeZone)) {
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-GB', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }),
    );
  }
  return formatters.get(timeZone);
};

/**
 * @description The wall clock of an instant in a time zone.
 * @param {number} ms - Instant (ms).
 * @param {string} timeZone - IANA time zone.
 * @returns {{year: number, month: number, day: number, hour: number, minute: number, second: number}}
 * The parts.
 */
export function partsIn(ms, timeZone) {
  const parts = {};
  for (const { type, value } of formatter(timeZone).formatToParts(new Date(ms))) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  return parts;
}

const offsetOf = (ms, timeZone) => {
  const p = partsIn(ms, timeZone);
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
  );
};

/**
 * @description The day of an instant in Paris, the day of the request counter.
 * @param {number} ms - Instant (ms).
 * @returns {string} `YYYY-MM-DD`.
 */
export function parisDay(ms) {
  const p = partsIn(ms, PARIS);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/**
 * @description The next midnight in Paris (the assumed reset of the quota).
 * @param {number} ms - Instant (ms).
 * @returns {number} The next midnight in Paris (ms), strictly after `ms`.
 */
export function nextParisMidnight(ms) {
  const p = partsIn(ms, PARIS);
  const wall = Date.UTC(p.year, p.month - 1, p.day + 1);
  // Two passes: the offset at midnight may differ from the one now (DST).
  let guess = wall - offsetOf(wall, PARIS);
  guess = wall - offsetOf(guess, PARIS);
  return guess;
}

/**
 * @description The time zone of the times shown to the user.
 * @param {string} [candidate] - Usually `process.env.TZ`.
 * @returns {string} A valid IANA time zone, Europe/Paris otherwise.
 */
export function displayTimeZone(candidate = process.env.TZ) {
  if (typeof candidate === 'string' && candidate.trim() !== '' && candidate !== ':/etc/localtime') {
    try {
      new Intl.DateTimeFormat('en', { timeZone: candidate.trim() });
      return candidate.trim();
    } catch {
      // Not an IANA name: fall through.
    }
  }
  return PARIS;
}

/**
 * @description `HH:MM` of an instant.
 * @param {number|null} ms - Instant (ms).
 * @param {string} [timeZone] - Time zone.
 * @returns {string} The time, '' without an instant.
 */
export function clockTime(ms, timeZone = displayTimeZone()) {
  if (!Number.isFinite(ms)) {
    return '';
  }
  const p = partsIn(ms, timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}
