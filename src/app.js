// -----------------------------------------------------------------------------
// The Radio France integration: every Gladys handler.
//
//   start            the request counter (/data), the stations created in
//                    Gladys, the station list (`brands`, 1 request), then a
//                    first round
//   scan             the station list again (at most every 10 minutes)
//   rounds           what is on air on every followed station, in one
//                    request per 10 stations (src/scheduler.js decides when)
//   states           show, segment, track, follow switch (src/states.js)
//   scene events     transitions seen by the rounds only (src/scenes.js)
//   scene actions    now on air, upcoming shows (1 request at most)
//   widgets          now on air (+ refresh button), upcoming shows, API usage
//   status           no key, key refused, quota or budget reached, API down
//
// Nothing of Radio France is written to /data (terms of use, FAQ): the
// station list, what is on air and the grids live in memory, briefly. /data
// only holds the request counter and the follow switches.
// -----------------------------------------------------------------------------

import { normalizeConfig } from './config.js';
import { createStatePublisher } from './states.js';
import { createStorage } from './storage.js';
import { createBudget } from './budget.js';
import { chunks, nextDelay, reserveOf } from './scheduler.js';
import {
  ApiError,
  BRANDS_QUERY,
  LIVE_VARIANTS,
  MAX_ALIASES,
  createClient,
  endpointFromEnv,
  gridQuery,
  liveQuery,
} from './api/client.js';
import { currentFromGrid, parseLive, parseStations, topLevelShows } from './api/parse.js';
import { FEATURES, buildDevice, featureValues, idsOf, stationIdOf, trackText } from './devices.js';
import { ACTIONS, idsOnAir, stepEvent, trackEvent, transitions, TRIGGERS } from './scenes.js';
import {
  BUTTONS,
  WIDGETS,
  buildNowPlayingWidget,
  buildScheduleWidget,
  buildUsageWidget,
} from './widgets.js';
import { LANGUAGES, all, t } from './i18n.js';
import { clockTime, displayTimeZone } from './time.js';

export const SETTINGS_FILE = 'settings.json';
export const CONFIG_ACTIONS = { TEST_KEY: 'test_key' };

const BRANDS_TTL_MS = 24 * 3600 * 1000;
const BRANDS_RESCAN_MS = 10 * 60 * 1000;
const LIVE_FRESH_MS = 60 * 1000;
const UPCOMING_TTL_MS = 10 * 60 * 1000;
const SCHEDULE_TTL_MS = 15 * 60 * 1000;
// Nothing of Radio France stays in memory longer than this.
const MEMORY_MAX_MS = 60 * 60 * 1000;
const REFRESH_GAP_MS = 60 * 1000;
const ROUND_GAP_MS = 30 * 1000;
const WIDGET_REFRESH_MS = 10 * 1000;
const AUTH_BACKOFF_MS = [5, 10, 20, 40, 60].map((minutes) => minutes * 60 * 1000);
const ERROR_BACKOFF_MS = [1, 2, 5, 10, 20, 30].map((minutes) => minutes * 60 * 1000);
const GRID_PAST_MS = 2 * 3600 * 1000;
const GRID_AHEAD_MS = 12 * 3600 * 1000;
const UPCOMING_MAX = 10;

class UserError extends Error {
  constructor(key, values = {}) {
    super(t(key, 'en', values));
    this.name = 'UserError';
    this.key = key;
    this.values = values;
  }
}

/**
 * @description Create the integration.
 * @param {object} gladys - SDK client.
 * @param {object} [deps] - Dependencies (tests).
 * @returns {object} `{ start, stop, round, ... }`.
 */
export function createApp(gladys, deps = {}) {
  const logger = deps.logger ?? { info() {}, warn() {}, error() {}, debug() {} };
  const storage = deps.storage ?? createStorage();
  const now = deps.now ?? Date.now;
  const timeZone = deps.timeZone ?? displayTimeZone();
  const client =
    deps.client ??
    createClient({ fetch: deps.fetch, endpoint: deps.endpoint ?? endpointFromEnv() });
  let config = normalizeConfig(gladys.config ?? {});

  const budget = createBudget({ storage, now, limit: () => config.dailyBudget, logger });
  const stations = new Map(); // id -> { id, title } (brands, memory only)
  let brandsAt = 0;
  const created = new Map(); // id -> device name, the stations created in Gladys
  const following = new Map(); // id -> boolean (/data/settings.json)
  const live = new Map(); // id -> { now, fetchedAt }
  const announced = new Map(); // id -> ids of the steps announced (triggers)
  const grids = new Map(); // id -> { steps, fetchedAt }
  const rejected = new Set(); // ids the API does not know
  const lastRefresh = new Map(); // id -> ms (widget button)
  let variant = 0; // index in LIVE_VARIANTS
  let apiState = { kind: 'ok', until: 0, failures: 0, error: '' };
  let timer = null;
  let nextAt = null;
  let paced = false;
  let lastRoundAt = 0;
  let rounding = null;
  let stopped = false;
  let lastStatus = null;
  const widgetTimers = new Map();
  const widgetLast = new Map();

  const isCreatedDevice = (deviceId) => {
    const id = stationIdOf(gladys, deviceId);
    return Boolean(id && created.has(id));
  };
  const states = createStatePublisher(gladys, { logger, now, isCreated: isCreatedDevice });

  const safely = async (fn, what) => {
    try {
      return await fn();
    } catch (error) {
      logger.warn(`Radio France: ${what} failed: ${error?.message ?? error}`);
      return undefined;
    }
  };

  const titleOf = (id) => created.get(id) || stations.get(id)?.title || id;
  const isFollowing = (id) => following.get(id) !== false;
  const followedIds = () =>
    [...created.keys()]
      .filter((id) => isFollowing(id) && !rejected.has(id))
      .filter((id) => stations.size === 0 || stations.has(id))
      .sort();

  // --- Settings (/data) ----------------------------------------------------------------------

  const saveSettings = () =>
    safely(
      () =>
        storage.write(SETTINGS_FILE, {
          following: Object.fromEntries([...following].filter(([id]) => created.has(id))),
        }),
      'saving /data',
    );

  // --- Status and widgets ----------------------------------------------------------------------

  const pauseOf = () => budget.pause();

  const stateKind = () => {
    if (!config.apiKey) return { kind: 'nokey' };
    if (apiState.kind === 'auth') return { kind: 'auth', until: apiState.until };
    const pause = pauseOf();
    if (pause) return { kind: pause.reason, until: pause.until };
    if (apiState.kind === 'error') return { kind: 'error', until: apiState.until };
    if (followedIds().length === 0) return { kind: 'idle' };
    return { kind: 'ok' };
  };

  const publishStatus = () => {
    const state = stateKind();
    let message = null;
    const time = clockTime(state.until, timeZone);
    if (state.kind === 'nokey') message = all('statusNoKey');
    if (state.kind === 'auth') message = all('statusAuth', { time });
    if (state.kind === 'quota') message = all('statusQuota', { time });
    if (state.kind === 'budget') message = all('statusBudget', { time, count: budget.used() });
    if (state.kind === 'error') message = all('statusError', { time, error: apiState.error });
    const key = JSON.stringify(message);
    if (key === lastStatus) return;
    lastStatus = key;
    safely(
      () =>
        message ? gladys.setConnectionStatus(false, message) : gladys.setConnectionStatus(true),
      'status',
    );
  };

  const refreshWidget = (key, force = false) => {
    const wait = (widgetLast.get(key) ?? 0) + WIDGET_REFRESH_MS - now();
    if (force || wait <= 0) {
      widgetLast.set(key, now());
      clearTimeout(widgetTimers.get(key));
      widgetTimers.delete(key);
      safely(() => gladys.requestWidgetRefresh(key), `refreshing the widget ${key}`);
      return;
    }
    if (!widgetTimers.has(key)) {
      const handle = setTimeout(() => {
        widgetTimers.delete(key);
        refreshWidget(key, true);
      }, wait);
      handle.unref?.();
      widgetTimers.set(key, handle);
    }
  };

  // --- States ----------------------------------------------------------------------------------

  const pushValues = (id) => {
    const ids = idsOf(gladys, id);
    for (const [key, value] of featureValues(live.get(id)?.now ?? null, isFollowing(id))) {
      states.push(ids.feature(key), value);
    }
  };

  // --- Requests --------------------------------------------------------------------------------

  const backoff = (list, failures) => list[Math.min(failures, list.length - 1)];

  /**
   * @description One request to the Open API, counted in the budget first.
   * @param {string} query - GraphQL query.
   * @param {object} [options] - `{ reserve }`: keep the reserve of the
   * actions (rounds), or use it (actions, buttons).
   * @returns {Promise<object>} The data.
   */
  const request = async (query, { reserve = false } = {}) => {
    if (!config.apiKey) throw new UserError('errorNoKey');
    const keep = reserve ? reserveOf(config.dailyBudget) : 0;
    if (!budget.canSpend(1 + keep)) {
      throw new UserError('errorBudget', { time: clockTime(budget.resetAt(), timeZone) });
    }
    budget.spend();
    try {
      const { data, errors } = await client.query(query, config.apiKey);
      if (errors.length > 0) {
        logger.debug?.(`Radio France: partial answer: ${errors[0]?.message ?? ''}`);
      }
      if (apiState.kind !== 'ok') {
        apiState = { kind: 'ok', until: 0, failures: 0, error: '' };
        logger.info('Radio France: the Open API answers again');
      }
      return data;
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.kind === 'auth') {
          const failures = apiState.kind === 'auth' ? apiState.failures + 1 : 0;
          apiState = {
            kind: 'auth',
            failures,
            until: now() + backoff(AUTH_BACKOFF_MS, failures),
            error: error.message,
          };
          logger.warn(`Radio France: the API key is refused (${error.message})`);
        } else if (error.kind === 'quota') {
          budget.quotaReached();
          logger.warn(`Radio France: daily quota of the Open API reached (${error.message})`);
        } else if (error.kind !== 'graphql') {
          const failures = apiState.kind === 'error' ? apiState.failures + 1 : 0;
          apiState = {
            kind: 'error',
            failures,
            until: now() + backoff(ERROR_BACKOFF_MS, failures),
            error: error.status ? `HTTP ${error.status}` : String(error.message).slice(0, 60),
          };
          logger.warn(`Radio France: the Open API failed: ${error.message}`);
        }
      }
      throw error;
    } finally {
      publishStatus();
      refreshWidget(WIDGETS.API_USAGE);
    }
  };

  /**
   * @description What is on air on stations: one request per 10 stations.
   * A query the schema refuses moves to the next shape (LIVE_VARIANTS); a
   * station the API does not know is left out from then on.
   * @param {string[]} ids - Station ids.
   * @param {object} [options] - `{ reserve }` (see request).
   * @returns {Promise<Map<string, object>>} id -> `{ show, program, song }`.
   */
  const fetchLive = async (ids, options = {}) => {
    const out = new Map();
    for (const first of chunks(ids, MAX_ALIASES)) {
      let chunk = first;
      for (let attempt = 0; chunk.length > 0; attempt += 1) {
        const shape = LIVE_VARIANTS[variant];
        const nowSeconds = Math.floor(now() / 1000);
        let data;
        try {
          data = await request(liveQuery(chunk, shape, nowSeconds), options);
        } catch (error) {
          if (error instanceof ApiError && error.kind === 'graphql' && attempt < 3) {
            const unknown = chunk.filter((id) => new RegExp(`\\b${id}\\b`).test(error.message));
            if (unknown.length > 0) {
              unknown.forEach((id) => rejected.add(id));
              logger.warn(`Radio France: the API does not know ${unknown.join(', ')}: left out`);
              chunk = chunk.filter((id) => !unknown.includes(id));
              continue;
            }
            if (error.validation && variant < LIVE_VARIANTS.length - 1) {
              variant += 1;
              logger.warn(
                `Radio France: the API refuses the "${shape}" query (${error.message}), trying "${LIVE_VARIANTS[variant]}"`,
              );
              continue;
            }
          }
          throw error;
        }
        chunk.forEach((id, index) => {
          const raw = data[`s${index}`];
          out.set(id, shape === 'grid' ? currentFromGrid(raw, nowSeconds) : parseLive(raw));
        });
        break;
      }
    }
    return out;
  };

  const fire = (key, data) =>
    safely(() => gladys.publishSceneEvent(key, data), `scene event ${key}`);

  /**
   * @description Keep what is on air, publish it, and — for a round only —
   * announce the transitions.
   * @param {string} id - Station id.
   * @param {object} onAir - `{ show, program, song }`.
   * @param {boolean} fromRound - Whether a scheduled round read it.
   */
  const apply = (id, onAir, fromRound) => {
    live.set(id, { now: onAir, fetchedAt: now() });
    if (fromRound && created.has(id)) {
      const before = announced.get(id) ?? null;
      const device = idsOf(gladys, id).device;
      for (const [key, step] of transitions(before, onAir, Math.floor(now() / 1000))) {
        fire(
          key,
          key === TRIGGERS.TRACK_STARTED
            ? trackEvent(device, titleOf(id), step)
            : stepEvent(device, titleOf(id), step, timeZone),
        );
      }
      announced.set(id, idsOnAir(before, onAir));
    }
    pushValues(id);
  };

  // --- Station list ----------------------------------------------------------------------------

  const publishDiscovered = async () => {
    if (stations.size === 0) return;
    const devices = [...stations.values()].map((station) =>
      buildDevice(gladys, station, config.language),
    );
    await safely(() => gladys.publishDiscoveredDevices(devices), 'publishing the stations');
  };

  /**
   * @description Read the station list (1 request) unless it is recent.
   * @param {number} maxAgeMs - Age under which the list in memory is kept.
   * @param {object} [options] - `{ reserve }` (see request).
   * @returns {Promise<number>} Stations known.
   */
  const loadBrands = async (maxAgeMs, options = {}) => {
    if (brandsAt && now() - brandsAt < maxAgeMs && stations.size > 0) {
      return stations.size;
    }
    const data = await request(BRANDS_QUERY, options);
    const list = parseStations(data);
    if (list.length === 0) {
      throw new ApiError('invalid', 'no station in the answer');
    }
    stations.clear();
    for (const station of list) stations.set(station.id, station);
    brandsAt = now();
    rejected.clear();
    logger.info(`Radio France: ${stations.size} stations`);
    await publishDiscovered();
    return stations.size;
  };

  // --- Rounds ----------------------------------------------------------------------------------

  const schedule = (delay) => {
    clearTimeout(timer);
    timer = null;
    if (stopped) return;
    nextAt = now() + Math.max(0, delay);
    timer = setTimeout(
      () => {
        timer = null;
        round();
      },
      Math.max(0, delay),
    );
    timer.unref?.();
  };

  const planNext = (ids) => {
    const nowSeconds = now() / 1000;
    const ends = [];
    for (const id of ids) {
      const onAir = live.get(id)?.now;
      for (const step of [onAir?.show, onAir?.program, onAir?.song]) {
        if (step?.end && step.end > nowSeconds - 60) ends.push(step.end);
      }
    }
    const plan = nextDelay({
      nowMs: now(),
      ends,
      minIntervalSeconds: config.minIntervalSeconds,
      remaining: budget.remaining(),
      requestsPerRound: Math.ceil(ids.length / MAX_ALIASES),
      reserve: reserveOf(config.dailyBudget),
      resetAt: budget.resetAt(),
    });
    paced = plan.paced;
    schedule(plan.delay);
  };

  /**
   * @description One round: what is on air on every followed station.
   * @returns {Promise<void>}
   */
  const round = async () => {
    if (rounding) return rounding;
    rounding = (async () => {
      clearTimeout(timer);
      timer = null;
      nextAt = null;
      if (stopped) return;
      // Memory: nothing of Radio France kept longer than an hour.
      for (const [id, entry] of [...live, ...grids]) {
        if (now() - entry.fetchedAt > MEMORY_MAX_MS) {
          live.delete(id);
          grids.delete(id);
        }
      }
      const ids = followedIds();
      if (!config.apiKey || ids.length === 0) {
        paced = false;
        return;
      }
      if (apiState.kind !== 'ok' && now() < apiState.until) {
        schedule(apiState.until - now());
        return;
      }
      const pause = pauseOf();
      if (pause) {
        schedule(pause.until - now() + 1000);
        return;
      }
      if (now() - brandsAt > BRANDS_TTL_MS) {
        await safely(() => loadBrands(BRANDS_TTL_MS, { reserve: true }), 'reading the stations');
      }
      const perRound = Math.ceil(followedIds().length / MAX_ALIASES);
      if (!budget.canSpend(perRound + reserveOf(config.dailyBudget))) {
        paced = true;
        schedule(budget.resetAt() - now() + 1000);
        return;
      }
      lastRoundAt = now();
      try {
        const results = await fetchLive(followedIds(), { reserve: true });
        for (const [id, onAir] of results) apply(id, onAir, true);
      } catch (error) {
        logger.warn(`Radio France: reading what is on air failed: ${error.message}`);
        if (apiState.kind !== 'ok' && apiState.until > now()) {
          schedule(apiState.until - now());
        } else {
          planNext(followedIds());
        }
        return;
      }
      planNext(followedIds());
      refreshWidget(WIDGETS.NOW_PLAYING);
    })();
    try {
      await rounding;
    } finally {
      rounding = null;
      publishStatus();
      refreshWidget(WIDGETS.API_USAGE);
    }
  };

  // A new station to follow: a round soon, not before ROUND_GAP_MS after the last.
  const roundSoon = () => {
    if (stopped) return;
    const delay = Math.max(0, lastRoundAt + ROUND_GAP_MS - now());
    if (timer && nextAt !== null && nextAt - now() <= delay) return;
    schedule(delay);
  };

  // --- Errors shown to the user ----------------------------------------------------------------

  const explain = (error, language) => {
    if (error instanceof UserError) return t(error.key, language, error.values);
    if (error instanceof ApiError) {
      if (error.kind === 'auth') return t('errorAuth', language);
      if (error.kind === 'quota') {
        return t('errorBudget', language, { time: clockTime(budget.resetAt(), timeZone) });
      }
      return t('errorApi', language, {
        error: error.status ? `HTTP ${error.status}` : String(error.message).slice(0, 80),
      });
    }
    return String(error?.message ?? error).slice(0, 200);
  };
  const userFacing = (error) => new Error(explain(error, config.language));

  // --- Devices ---------------------------------------------------------------------------------

  const track = (device) => {
    const id = stationIdOf(gladys, device?.external_id);
    if (!id) return null;
    created.set(
      id,
      typeof device.name === 'string' && device.name.trim() ? device.name.trim() : id,
    );
    if (!following.has(id)) {
      // The switch of a device created before: its last value, else on.
      const feature = device.features?.find?.(
        (item) => item.external_id === idsOf(gladys, id).feature(FEATURES.FOLLOW),
      );
      const last = Number(feature?.last_value);
      following.set(id, !(feature && Number.isFinite(last) && last === 0));
    }
    return id;
  };

  gladys.onDeviceCreated(async (device) => {
    const id = track(device);
    if (!id) return;
    await saveSettings();
    // States published before the creation were thrown away by Gladys.
    states.republish(device.external_id);
    pushValues(id);
    Object.values(WIDGETS).forEach((key) => refreshWidget(key, true));
    publishStatus();
    if (isFollowing(id) && !live.has(id)) roundSoon();
  });

  gladys.onDeviceUpdated(async (device) => {
    const id = track(device);
    if (!id) return;
    states.republish(device.external_id);
    pushValues(id);
  });

  gladys.onDeviceDeleted(async (device) => {
    const id = stationIdOf(gladys, device?.external_id);
    if (!id) return;
    created.delete(id);
    following.delete(id);
    live.delete(id);
    announced.delete(id);
    states.forget(device.external_id);
    await saveSettings();
    publishStatus();
    Object.values(WIDGETS).forEach((key) => refreshWidget(key, true));
  });

  gladys.onSetValue(async (device, feature, value) => {
    const id = stationIdOf(gladys, device?.external_id);
    const key = String(feature?.external_id ?? '')
      .split(':')
      .pop();
    if (!id || !created.has(id)) throw userFacing(new UserError('errorUnknownStation'));
    if (key !== FEATURES.FOLLOW) {
      throw new Error(`${key} is read-only`);
    }
    const on = Number(value) === 1;
    const was = isFollowing(id);
    following.set(id, on);
    await saveSettings();
    if (!on) {
      live.delete(id);
      announced.delete(id);
    }
    states.forget(feature.external_id);
    pushValues(id);
    publishStatus();
    refreshWidget(WIDGETS.NOW_PLAYING);
    refreshWidget(WIDGETS.API_USAGE);
    if (on && !was) roundSoon();
  });

  gladys.onScanRequest(async () => {
    try {
      await loadBrands(BRANDS_RESCAN_MS);
    } catch (error) {
      logger.warn(`Radio France: reading the stations failed: ${error.message}`);
      await publishDiscovered();
    }
  });

  gladys.onConfigUpdated(async (raw) => {
    const before = config;
    config = normalizeConfig(raw ?? {});
    if (before.apiKey !== config.apiKey) {
      apiState = { kind: 'ok', until: 0, failures: 0, error: '' };
      budget.clearQuota();
      lastStatus = null;
      if (config.apiKey) {
        await safely(() => loadBrands(0), 'reading the stations');
      }
    } else if (before.language !== config.language) {
      await publishDiscovered();
    }
    publishStatus();
    refreshWidget(WIDGETS.API_USAGE, true);
    if (config.apiKey) roundSoon();
  });

  // --- Configuration button --------------------------------------------------------------------

  gladys.onAction(CONFIG_ACTIONS.TEST_KEY, async () => {
    if (!config.apiKey) return all('errorNoKey');
    try {
      const count = await loadBrands(0);
      roundSoon();
      return all('testOk', { count, used: budget.used(), budget: config.dailyBudget });
    } catch (error) {
      return all((language) => explain(error, language).slice(0, 1000));
    }
  });

  // --- Scene actions ---------------------------------------------------------------------------

  const stationOfField = (value) => {
    const id = stationIdOf(gladys, value);
    if (!id || !created.has(id)) throw new UserError('errorUnknownStation');
    return id;
  };

  const onAirOf = async (id) => {
    const entry = live.get(id);
    if (entry && now() - entry.fetchedAt < LIVE_FRESH_MS) return entry.now;
    const results = await fetchLive([id]);
    const onAir = results.get(id) ?? { show: null, program: null, song: null };
    apply(id, onAir, false);
    refreshWidget(WIDGETS.NOW_PLAYING);
    return onAir;
  };

  gladys.onSceneAction(ACTIONS.GET_NOW_PLAYING, async (fields = {}) => {
    try {
      const id = stationOfField(fields.station);
      const onAir = await onAirOf(id);
      const end = onAir.show?.end ?? onAir.program?.end ?? null;
      return {
        show: onAir.show?.show ?? '',
        program: onAir.program?.show ?? '',
        title: onAir.song?.track?.title ?? '',
        artist: onAir.song?.track?.artist ?? '',
        album: onAir.song?.track?.album ?? '',
        ends_at: end ? clockTime(end * 1000, timeZone) : '',
      };
    } catch (error) {
      throw userFacing(error);
    }
  });

  const gridOf = async (id, maxAgeMs) => {
    const cached = grids.get(id);
    if (cached && now() - cached.fetchedAt < maxAgeMs) return cached.steps;
    const data = await request(
      gridQuery(id, (now() - GRID_PAST_MS) / 1000, (now() + GRID_AHEAD_MS) / 1000),
    );
    const steps = Array.isArray(data.grid) ? data.grid : [];
    grids.set(id, { steps, fetchedAt: now() });
    return steps;
  };

  gladys.onSceneAction(ACTIONS.GET_UPCOMING, async (fields = {}) => {
    try {
      const id = stationOfField(fields.station);
      const count = Math.min(UPCOMING_MAX, Math.max(1, Math.round(Number(fields.count) || 3)));
      const nowSeconds = now() / 1000;
      const shows = topLevelShows(await gridOf(id, UPCOMING_TTL_MS), nowSeconds)
        .filter((show) => show.start > nowSeconds)
        .slice(0, count);
      const language = config.language;
      const station = titleOf(id);
      const list = shows
        .map((show) =>
          t('upcomingItem', language, {
            title: show.show,
            time: clockTime(show.start * 1000, timeZone),
          }),
        )
        .join(', ');
      return {
        summary: (shows.length > 0
          ? t('upcomingSummary', language, { station, list })
          : t('upcomingNone', language, { station })
        ).slice(0, 10000),
        next_show: shows[0]?.show ?? '',
        next_start: shows[0] ? clockTime(shows[0].start * 1000, timeZone) : '',
      };
    } catch (error) {
      throw userFacing(error);
    }
  });

  // --- Widgets ---------------------------------------------------------------------------------

  const widgetStation = (setting) => {
    const id = stationIdOf(gladys, setting);
    if (id && created.has(id)) return id;
    const ids = [...created.keys()].sort();
    return ids.find(isFollowing) ?? ids[0] ?? null;
  };
  const languageOf = (language) => (LANGUAGES.includes(language) ? language : config.language);

  gladys.onWidgetGet(WIDGETS.NOW_PLAYING, async ({ settings = {}, language } = {}) => {
    const id = widgetStation(settings.station);
    const entry = id ? live.get(id) : null;
    return buildNowPlayingWidget({
      station: id ? { id, title: titleOf(id) } : null,
      now: entry?.now ?? null,
      fetchedAt: entry?.fetchedAt ?? 0,
      following: id ? isFollowing(id) : false,
      canRefresh: Boolean(config.apiKey),
      language: languageOf(language),
      timeZone,
      nowMs: now(),
    });
  });

  gladys.onWidgetAction(WIDGETS.NOW_PLAYING, async (actionKey, params = {}) => {
    if (actionKey !== BUTTONS.REFRESH) return all('errorUnknownStation');
    const id = typeof params.station === 'string' ? params.station : '';
    if (!created.has(id)) return all('errorUnknownStation');
    if (now() - (lastRefresh.get(id) ?? 0) < REFRESH_GAP_MS) return all('toastTooSoon');
    lastRefresh.set(id, now());
    try {
      const results = await fetchLive([id]);
      apply(id, results.get(id) ?? { show: null, program: null, song: null }, false);
      refreshWidget(WIDGETS.NOW_PLAYING, true);
      const onAir = live.get(id)?.now;
      const what = trackText(onAir?.song) || onAir?.show?.show || titleOf(id);
      return all('toastRefreshed', { station: what.slice(0, 150) });
    } catch (error) {
      return all((lang) => explain(error, lang).slice(0, 200));
    }
  });

  gladys.onWidgetGet(WIDGETS.SCHEDULE, async ({ settings = {}, language } = {}) => {
    const lang = languageOf(language);
    const id = widgetStation(settings.station);
    if (!id) {
      return buildScheduleWidget({
        station: null,
        shows: null,
        language: lang,
        timeZone,
        nowMs: now(),
      });
    }
    let shows = null;
    let reason = '';
    try {
      shows = topLevelShows(await gridOf(id, SCHEDULE_TTL_MS), now() / 1000);
    } catch (error) {
      const cached = grids.get(id);
      if (cached && now() - cached.fetchedAt < MEMORY_MAX_MS) {
        shows = topLevelShows(cached.steps, now() / 1000);
      } else {
        reason = explain(error, lang);
      }
    }
    return buildScheduleWidget({
      station: { id, title: titleOf(id) },
      shows,
      reason,
      language: lang,
      timeZone,
      nowMs: now(),
    });
  });

  gladys.onWidgetGet(WIDGETS.API_USAGE, async ({ language } = {}) =>
    buildUsageWidget({
      used: budget.used(),
      budget: config.dailyBudget,
      state: stateKind(),
      nextAt,
      followed: followedIds().length,
      paced,
      resetAt: budget.resetAt(),
      language: languageOf(language),
      timeZone,
    }),
  );

  // --- Lifecycle -------------------------------------------------------------------------------

  const start = async () => {
    // gladys.config is filled by connect(), after createApp.
    config = normalizeConfig(gladys.config ?? {});
    await budget.load();
    const saved = (await safely(() => storage.read(SETTINGS_FILE), 'reading /data')) ?? {};
    for (const [id, on] of Object.entries(saved?.following ?? {})) {
      if (typeof on === 'boolean') following.set(id, on);
    }
    const devices = (await safely(() => gladys.getDevices(), 'reading the devices')) ?? [];
    for (const device of Array.isArray(devices) ? devices : []) track(device);
    for (const id of created.keys()) pushValues(id);
    if (config.apiKey) {
      await safely(() => loadBrands(BRANDS_TTL_MS), 'reading the stations');
    }
    publishStatus();
    await round();
  };

  const stop = async () => {
    stopped = true;
    clearTimeout(timer);
    timer = null;
    for (const handle of widgetTimers.values()) clearTimeout(handle);
    widgetTimers.clear();
    states.stop();
    await rounding?.catch(() => {});
    await budget.flush();
  };

  return {
    start,
    stop,
    round,
    states,
    budget,
    created,
    live,
    stations,
    following,
    get nextAt() {
      return nextAt;
    },
    get variant() {
      return LIVE_VARIANTS[variant];
    },
    get paced() {
      return paced;
    },
  };
}
