// -----------------------------------------------------------------------------
// The daily request budget.
//
// The Open API allows 1,000 requests a day per key (terms of use, art. 5.3
// and 9.1; FAQ) and blocks the key past it. The integration allows itself
// `daily_budget` of them (900 by default: the key may serve something else
// too) and counts every HTTP request it sends: polling, scene actions,
// widget button, schedule widget, the key test, the station list. It is
// assumed that Radio France counts HTTP requests, not the stations asked in
// one request (aliases); that is not documented.
//
// The day is the day in Paris; the reset hour is not documented either:
// midnight in Paris is assumed. The counter is kept in /data/usage.json (our
// own number, no data of Radio France), so a restart does not forget it.
//
// Paused states:
//   budget   the integration used its daily budget: until midnight (Paris)
//   quota    the API refused for quota: until midnight (Paris) + 5 minutes
// -----------------------------------------------------------------------------

import { nextParisMidnight, parisDay } from './time.js';

export const USAGE_FILE = 'usage.json';
export const QUOTA_MARGIN_MS = 5 * 60 * 1000;

/**
 * @description Create the budget.
 * @param {object} deps - Dependencies.
 * @param {object} deps.storage - `{ read, write }` (src/storage.js).
 * @param {Function} deps.now - Clock (ms).
 * @param {Function} deps.limit - `() => daily budget`.
 * @param {object} [deps.logger] - Logger.
 * @returns {object} The budget.
 */
export function createBudget({ storage, now, limit, logger }) {
  let day = parisDay(now());
  let count = 0;
  let quotaUntil = 0;
  let writing = Promise.resolve();

  const save = () => {
    const snapshot = { day, count, quota_until: quotaUntil || null };
    writing = writing
      .then(() => storage.write(USAGE_FILE, snapshot))
      .catch((error) =>
        logger?.warn?.(`Radio France: saving the request counter failed: ${error?.message}`),
      );
    return writing;
  };

  const roll = () => {
    const today = parisDay(now());
    if (today !== day) {
      day = today;
      count = 0;
      save();
    }
    if (quotaUntil && now() >= quotaUntil) {
      quotaUntil = 0;
      save();
    }
  };

  const budget = {
    /** Read the counter saved by a previous run. */
    async load() {
      const saved = await storage.read(USAGE_FILE).catch(() => null);
      if (saved && saved.day === parisDay(now())) {
        day = saved.day;
        count = Number.isInteger(saved.count) && saved.count >= 0 ? saved.count : 0;
      }
      if (Number.isFinite(saved?.quota_until) && saved.quota_until > now()) {
        quotaUntil = saved.quota_until;
      }
      roll();
    },

    /** @returns {number} Requests sent today (Paris). */
    used() {
      roll();
      return count;
    },

    /** @returns {number} Requests left today within the budget. */
    remaining() {
      roll();
      return Math.max(0, limit() - count);
    },

    /** @returns {number} The next reset (ms): midnight in Paris. */
    resetAt() {
      return nextParisMidnight(now());
    },

    /**
     * @description Why requests are paused, if they are.
     * @returns {{reason: string, until: number}|null} `quota` or `budget`.
     */
    pause() {
      roll();
      if (quotaUntil) return { reason: 'quota', until: quotaUntil };
      if (count >= limit()) return { reason: 'budget', until: nextParisMidnight(now()) };
      return null;
    },

    /**
     * @description Whether `n` requests may be sent now.
     * @param {number} [n] - Requests.
     * @returns {boolean} True when not paused and within the budget.
     */
    canSpend(n = 1) {
      roll();
      return !quotaUntil && count + n <= limit();
    },

    /** Count one request (before sending it: a request that fails may count too). */
    spend() {
      roll();
      count += 1;
      save();
    },

    /** The API refused for quota: nothing more until the reset. */
    quotaReached() {
      quotaUntil = nextParisMidnight(now()) + QUOTA_MARGIN_MS;
      save();
    },

    /** Forget a quota pause (a new key). */
    clearQuota() {
      if (quotaUntil) {
        quotaUntil = 0;
        save();
      }
    },

    /** For the tests: wait for the last write. */
    flush: () => writing,
  };
  return budget;
}
