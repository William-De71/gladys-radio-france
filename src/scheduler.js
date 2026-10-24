// -----------------------------------------------------------------------------
// When to ask the Open API again.
//
// One round asks every followed station in as few requests as possible (10
// stations per request, GraphQL aliases). The next round is:
//
//   1. the earliest end among the steps on air (show, feature, track) + 5 s:
//      a new step starts then, nothing changes before;
//   2. never sooner than `min_interval_seconds`, never later than 15 minutes
//      (a step that runs late, a schedule changed on air);
//   3. slowed down by the budget: at most (requests left) / (requests per
//      round) rounds until midnight in Paris, a small reserve kept for the
//      scene actions and the widgets.
//
// Pure functions: tested in test/scheduler.test.js.
// -----------------------------------------------------------------------------

export const AFTER_END_MS = 5 * 1000;
export const MAX_DELAY_MS = 15 * 60 * 1000;
export const IDLE_DELAY_MS = 5 * 60 * 1000;

/**
 * @description Requests kept for scene actions and widget buttons.
 * @param {number} dailyBudget - The daily budget.
 * @returns {number} The reserve.
 */
export function reserveOf(dailyBudget) {
  return Math.min(50, Math.floor(dailyBudget * 0.05));
}

/**
 * @description The delay before the next round.
 * @param {object} params - Parameters.
 * @param {number} params.nowMs - Now (ms).
 * @param {number[]} params.ends - Ends of the steps on air (s).
 * @param {number} params.minIntervalSeconds - The configured floor.
 * @param {number} params.remaining - Requests left in the budget today.
 * @param {number} params.requestsPerRound - Requests of one round.
 * @param {number} params.reserve - Requests kept for the actions.
 * @param {number} params.resetAt - The next reset of the counter (ms).
 * @returns {{delay: number, paced: boolean, exhausted: boolean}} The delay
 * (ms); `paced` when the budget slowed it down; `exhausted` when no round is
 * possible before the reset (the delay then reaches it).
 */
export function nextDelay({
  nowMs,
  ends,
  minIntervalSeconds,
  remaining,
  requestsPerRound,
  reserve,
  resetAt,
}) {
  const future = (ends ?? []).filter((end) => Number.isFinite(end));
  let delay = future.length > 0 ? Math.min(...future) * 1000 + AFTER_END_MS - nowMs : IDLE_DELAY_MS;
  delay = Math.min(MAX_DELAY_MS, Math.max(minIntervalSeconds * 1000, delay));
  const untilReset = Math.max(0, resetAt - nowMs);
  const rounds = Math.floor((remaining - reserve) / Math.max(1, requestsPerRound));
  if (rounds < 1) {
    return { delay: untilReset + 1000, paced: true, exhausted: true };
  }
  const pace = Math.ceil(untilReset / rounds);
  if (pace > delay) {
    return { delay: pace, paced: true, exhausted: false };
  }
  return { delay, paced: false, exhausted: false };
}

/**
 * @description Split the stations into requests.
 * @param {string[]} ids - Station ids.
 * @param {number} size - Stations per request.
 * @returns {string[][]} Chunks.
 */
export function chunks(ids, size) {
  const out = [];
  for (let index = 0; index < ids.length; index += size) {
    out.push(ids.slice(index, index + size));
  }
  return out;
}
