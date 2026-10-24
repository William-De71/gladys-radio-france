// When to ask again: end of the steps on air, floor, ceiling, pace of the
// budget; the day in Paris; the request counter in /data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDLE_DELAY_MS, MAX_DELAY_MS, chunks, nextDelay, reserveOf } from '../src/scheduler.js';
import { clockTime, displayTimeZone, nextParisMidnight, parisDay } from '../src/time.js';
import { createBudget, QUOTA_MARGIN_MS, USAGE_FILE } from '../src/budget.js';
import { memoryStorage } from '../src/storage.js';

const NOW = Date.UTC(2026, 9, 24, 10, 0, 0); // 12:00 in Paris
const base = {
  nowMs: NOW,
  minIntervalSeconds: 90,
  remaining: 800,
  requestsPerRound: 1,
  reserve: 45,
  resetAt: Date.UTC(2026, 9, 24, 22, 0, 0), // midnight in Paris (CEST)
};

test('next round: the earliest end on air + 5 s', () => {
  const plan = nextDelay({
    ...base,
    ends: [NOW / 1000 + 600, NOW / 1000 + 200, NOW / 1000 + 3000],
  });
  assert.equal(plan.delay, 205 * 1000);
  assert.equal(plan.paced, false);
});

test('never sooner than the minimum interval, never later than 15 minutes', () => {
  assert.equal(nextDelay({ ...base, ends: [NOW / 1000 + 10] }).delay, 90 * 1000);
  assert.equal(
    nextDelay({ ...base, ends: [NOW / 1000 - 100] }).delay,
    90 * 1000,
    'an end in the past',
  );
  assert.equal(nextDelay({ ...base, ends: [NOW / 1000 + 7200] }).delay, MAX_DELAY_MS);
  assert.equal(nextDelay({ ...base, ends: [] }).delay, IDLE_DELAY_MS, 'nothing on air with an end');
  assert.equal(nextDelay({ ...base, ends: [], minIntervalSeconds: 600 }).delay, 600 * 1000);
});

test('the budget paces the rounds until midnight in Paris', () => {
  // 12 hours left, 100 requests left - 45 kept = 55 rounds: one every 785 s.
  const plan = nextDelay({ ...base, remaining: 100, ends: [NOW / 1000 + 100] });
  assert.equal(plan.paced, true);
  assert.equal(plan.delay, Math.ceil((12 * 3600 * 1000) / 55));
  // Two requests a round (11 to 20 stations): twice as slow.
  const two = nextDelay({ ...base, remaining: 100, requestsPerRound: 2, ends: [NOW / 1000 + 100] });
  assert.equal(two.delay, Math.ceil((12 * 3600 * 1000) / 27));
  // Plenty left: the programs decide.
  assert.equal(nextDelay({ ...base, remaining: 900, ends: [NOW / 1000 + 100] }).paced, false);
});

test('no round possible before the reset: wait for it', () => {
  const plan = nextDelay({ ...base, remaining: 45, ends: [NOW / 1000 + 100] });
  assert.equal(plan.exhausted, true);
  assert.equal(plan.delay, base.resetAt - NOW + 1000);
});

test('the reserve of the actions: 5 % of the budget, 50 at most', () => {
  assert.equal(reserveOf(900), 45);
  assert.equal(reserveOf(1000), 50);
  assert.equal(reserveOf(100), 5);
});

test('stations are asked 10 by 10', () => {
  const ids = Array.from({ length: 23 }, (_, i) => `S${i}`);
  assert.deepEqual(
    chunks(ids, 10).map((chunk) => chunk.length),
    [10, 10, 3],
  );
  assert.deepEqual(chunks([], 10), []);
});

test('the day of the counter is the day in Paris, reset at midnight in Paris (DST included)', () => {
  assert.equal(parisDay(Date.UTC(2026, 9, 24, 21, 59)), '2026-10-24');
  assert.equal(parisDay(Date.UTC(2026, 9, 24, 22, 0)), '2026-10-25');
  assert.equal(nextParisMidnight(Date.UTC(2026, 9, 24, 10, 0)), Date.UTC(2026, 9, 24, 22, 0));
  // 25 October 2026: back to winter time, the next midnight is at 23:00 UTC.
  assert.equal(nextParisMidnight(Date.UTC(2026, 9, 25, 10, 0)), Date.UTC(2026, 9, 25, 23, 0));
  // 29 March 2026: summer time starts during the night.
  assert.equal(nextParisMidnight(Date.UTC(2026, 2, 28, 12, 0)), Date.UTC(2026, 2, 28, 23, 0));
  assert.equal(nextParisMidnight(Date.UTC(2026, 2, 29, 12, 0)), Date.UTC(2026, 2, 29, 22, 0));
  // Exactly at midnight: the next one.
  assert.equal(nextParisMidnight(Date.UTC(2026, 9, 24, 22, 0)), Date.UTC(2026, 9, 25, 23, 0));
});

test('times shown in the time zone of the container, Europe/Paris without a valid one', () => {
  assert.equal(displayTimeZone('America/Montreal'), 'America/Montreal');
  assert.equal(displayTimeZone(''), 'Europe/Paris');
  assert.equal(displayTimeZone('Not/AZone'), 'Europe/Paris');
  assert.equal(displayTimeZone(undefined), 'Europe/Paris');
  assert.equal(clockTime(Date.UTC(2026, 9, 24, 5, 7), 'Europe/Paris'), '07:07');
  assert.equal(clockTime(Date.UTC(2026, 9, 24, 22, 0), 'Europe/Paris'), '00:00');
  assert.equal(clockTime(null), '');
});

test('the counter: kept in /data, our number only, reset with the day in Paris', async () => {
  let clock = Date.UTC(2026, 9, 24, 21, 0);
  const storage = memoryStorage();
  const budget = createBudget({ storage, now: () => clock, limit: () => 3 });
  await budget.load();
  assert.ok(budget.canSpend(3));
  budget.spend();
  budget.spend();
  await budget.flush();
  assert.deepEqual(storage.files[USAGE_FILE], { day: '2026-10-24', count: 2, quota_until: null });
  assert.ok(!budget.canSpend(2));
  assert.equal(budget.remaining(), 1);
  budget.spend();
  assert.deepEqual(budget.pause(), { reason: 'budget', until: Date.UTC(2026, 9, 24, 22, 0) });

  // A restart the same day keeps the count.
  const again = createBudget({ storage, now: () => clock, limit: () => 3 });
  await budget.flush();
  await again.load();
  assert.equal(again.used(), 3);
  // Midnight in Paris: back to zero.
  clock = Date.UTC(2026, 9, 24, 22, 0, 1);
  assert.equal(again.used(), 0);
  assert.equal(again.pause(), null);
});

test('a quota refusal pauses until midnight in Paris + 5 minutes, even after a restart', async () => {
  let clock = Date.UTC(2026, 9, 24, 15, 0);
  const storage = memoryStorage();
  const budget = createBudget({ storage, now: () => clock, limit: () => 900 });
  await budget.load();
  budget.quotaReached();
  await budget.flush();
  const until = Date.UTC(2026, 9, 24, 22, 0) + QUOTA_MARGIN_MS;
  assert.deepEqual(budget.pause(), { reason: 'quota', until });
  assert.ok(!budget.canSpend());
  const restarted = createBudget({ storage, now: () => clock, limit: () => 900 });
  await restarted.load();
  assert.equal(restarted.pause().reason, 'quota');
  clock = until;
  assert.equal(restarted.pause(), null);
  assert.ok(restarted.canSpend());
});
