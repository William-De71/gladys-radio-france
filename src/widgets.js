// -----------------------------------------------------------------------------
// The dashboard widgets (pure: built from what app.js knows, reused by
// docs/illustrations/gen.mjs).
//
//   now_playing   a station: show, episode, segment, track, end, last
//                 reading; a "Refresh" button (one request)
//   schedule      a station: the next shows (card-list), from the grid
//   api_usage     requests used today against the budget (gauge), state,
//                 next reading, stations followed, reset of the counter
//
// Every widget ends with the credit the terms of use require ("données
// fournies par l’Open API Radio France"), as a small caption. The Gladys
// card renders the texts in its header slot: the caption shows under the
// heading.
//
// Budget of a card: 8 components, 1 focal, 6 tiles, 2 texts (1 body),
// 1 status (10 rows), 4 buttons.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { all, ago, t } from './i18n.js';
import { trackText } from './devices.js';
import { clockTime } from './time.js';

export const WIDGETS = {
  NOW_PLAYING: 'now_playing',
  SCHEDULE: 'schedule',
  API_USAGE: 'api_usage',
};
export const BUTTONS = { REFRESH: 'refresh' };
export const SCHEDULE_ITEMS = 8;

const cut = (value, max) => {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const credit = () => ({ type: 'text', variant: 'caption', text: all('credit') });

/**
 * @description The "Now on air" widget.
 * @param {object} params - Parameters.
 * @param {{id: string, title: string}|null} params.station - The station.
 * @param {object|null} params.now - `{ show, program, song }`, null before
 * the first reading.
 * @param {number} params.fetchedAt - Time of the reading (ms), 0 if none.
 * @param {boolean} params.following - The follow switch.
 * @param {boolean} [params.canRefresh] - Whether the button may be shown.
 * @param {string} params.language - Language.
 * @param {string} params.timeZone - Time zone of the times.
 * @param {number} params.nowMs - Now (ms).
 * @returns {object} The content.
 */
export function buildNowPlayingWidget({
  station,
  now,
  fetchedAt,
  following,
  canRefresh = true,
  language,
  timeZone,
  nowMs,
}) {
  if (!station) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', variant: 'body', text: all('widgetNoStation') }, credit()],
    };
  }
  const items = [];
  const row = (labelKey, value, icon, color = WIDGET_COLORS.NEUTRAL) => {
    // 32 characters leave room for the label on a narrow card.
    if (value) items.push({ label: t(labelKey, language), value: cut(value, 32), icon, color });
  };
  if (!following) {
    row('widgetFollow', t('widgetFollowOff', language), 'pause-circle', WIDGET_COLORS.WARNING);
  }
  if (now) {
    const show = now.show;
    row('widgetShow', show?.show, 'radio', WIDGET_COLORS.PRIMARY);
    if (show && show.title && show.title !== show.show) {
      row('widgetEpisode', show.title, 'mic', WIDGET_COLORS.INFO);
    }
    row('widgetProgram', now.program?.show, 'message-circle', WIDGET_COLORS.INFO);
    row('widgetTrack', trackText(now.song), 'music', WIDGET_COLORS.SUCCESS);
    const end = now.show?.end ?? now.program?.end ?? null;
    if (end) row('widgetEnds', clockTime(end * 1000, timeZone), 'clock');
    if (!show && !now.program && !now.song) {
      row('widgetShow', t('widgetNothing', language), 'radio');
    }
    row('widgetUpdated', ago(fetchedAt, nowMs, language), 'refresh-cw');
  } else if (following) {
    row('widgetUpdated', t('widgetWaiting', language), 'loader', WIDGET_COLORS.WARNING);
  }
  const components = [{ type: 'text', variant: 'heading', text: cut(station.title, 40) }];
  if (items.length > 0) components.push({ type: 'status', items: items.slice(0, 10) });
  if (canRefresh) {
    components.push({
      type: 'button',
      label: all('widgetRefresh'),
      icon: 'refresh-cw',
      style: 'secondary',
      action: { key: BUTTONS.REFRESH, params: { station: station.id } },
    });
  }
  components.push(credit());
  return { ttl_seconds: 60, components };
}

/**
 * @description The "Upcoming shows" widget.
 * @param {object} params - Parameters.
 * @param {{id: string, title: string}|null} params.station - The station.
 * @param {Array<object>|null} params.shows - Top-level shows from now on,
 * null when the grid could not be read.
 * @param {string} [params.reason] - Why the grid is missing.
 * @param {string} params.language - Language.
 * @param {string} params.timeZone - Time zone of the times.
 * @param {number} params.nowMs - Now (ms).
 * @returns {object} The content.
 */
export function buildScheduleWidget({ station, shows, reason = '', language, timeZone, nowMs }) {
  if (!station) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', variant: 'body', text: all('widgetNoStation') }, credit()],
    };
  }
  const heading = { type: 'text', variant: 'heading', text: cut(station.title, 40) };
  if (shows === null) {
    return {
      ttl_seconds: 300,
      components: [
        heading,
        {
          type: 'status',
          items: [
            {
              label: t('widgetState', language),
              value: cut(reason || '–', 40),
              icon: 'alert-circle',
              color: WIDGET_COLORS.WARNING,
            },
          ],
        },
        credit(),
      ],
    };
  }
  const nowSeconds = nowMs / 1000;
  const items = shows.slice(0, SCHEDULE_ITEMS).map((show) => {
    const times = `${clockTime(show.start * 1000, timeZone)}–${clockTime(show.end * 1000, timeZone)}`;
    const item = {
      title: cut(show.show, 60),
      subtitle: cut(
        show.title && show.title !== show.show ? `${times} · ${show.title}` : times,
        120,
      ),
    };
    if (show.start <= nowSeconds && nowSeconds < show.end) {
      item.badge = { text: t('widgetOnAir', language), color: WIDGET_COLORS.SUCCESS };
    }
    if (show.description) item.description = cut(show.description, 2000);
    if (show.url) item.links = [{ url: show.url, label: t('widgetLink', language) }];
    return item;
  });
  const components = [heading];
  if (items.length > 0) {
    components.push({ type: 'card-list', display: 'list', items });
  } else {
    // FIP and its web radios do not publish their schedule in advance.
    components.push({
      type: 'status',
      items: [
        {
          label: t('widgetSchedule', language),
          value: t('widgetNotPublished', language),
          icon: 'calendar',
          color: WIDGET_COLORS.NEUTRAL,
        },
      ],
    });
  }
  components.push(credit());
  return { ttl_seconds: 900, components };
}

/**
 * @description The "API usage" widget.
 * @param {object} params - Parameters.
 * @param {number} params.used - Requests sent today.
 * @param {number} params.budget - Daily budget.
 * @param {{kind: string, until?: number}} params.state - ok | idle | nokey |
 * auth | quota | budget | error.
 * @param {number|null} params.nextAt - Next reading (ms).
 * @param {number} params.followed - Stations followed.
 * @param {boolean} params.paced - Whether the budget slows the readings.
 * @param {number} params.resetAt - Reset of the counter (ms).
 * @param {string} params.language - Language.
 * @param {string} params.timeZone - Time zone of the times.
 * @returns {object} The content.
 */
export function buildUsageWidget({
  used,
  budget,
  state,
  nextAt,
  followed,
  paced,
  resetAt,
  language,
  timeZone,
}) {
  const ratio = budget > 0 ? used / budget : 1;
  const time = (ms) => clockTime(ms, timeZone);
  const states = {
    ok: [t('widgetStateOk', language), WIDGET_COLORS.SUCCESS, 'check-circle'],
    idle: [t('widgetStateIdle', language), WIDGET_COLORS.NEUTRAL, 'pause-circle'],
    nokey: [t('widgetStateNoKey', language), WIDGET_COLORS.WARNING, 'key'],
    auth: [t('widgetStateAuth', language), WIDGET_COLORS.DANGER, 'key'],
    quota: [
      t('widgetStateQuota', language, { time: time(state.until) }),
      WIDGET_COLORS.DANGER,
      'slash',
    ],
    budget: [
      t('widgetStateBudget', language, { time: time(state.until) }),
      WIDGET_COLORS.WARNING,
      'slash',
    ],
    error: [t('widgetStateError', language), WIDGET_COLORS.DANGER, 'wifi-off'],
  };
  const [stateText, stateColor, stateIcon] = states[state.kind] ?? states.error;
  const items = [
    {
      label: t('widgetState', language),
      value: cut(stateText, 40),
      icon: stateIcon,
      color: stateColor,
    },
    {
      label: t('widgetNextReading', language),
      value: nextAt ? time(nextAt) : '–',
      icon: 'clock',
      color: WIDGET_COLORS.NEUTRAL,
    },
    {
      label: t('widgetFollowed', language),
      value: followed,
      icon: 'radio',
      color: followed > 0 ? WIDGET_COLORS.PRIMARY : WIDGET_COLORS.NEUTRAL,
    },
    {
      label: t('widgetRhythm', language),
      value: t(paced ? 'widgetPaced' : 'widgetRhythmNormal', language),
      icon: 'activity',
      color: paced ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
    {
      label: t('widgetReset', language),
      value: time(resetAt),
      icon: 'rotate-ccw',
      color: WIDGET_COLORS.NEUTRAL,
    },
  ];
  return {
    ttl_seconds: 60,
    components: [
      {
        type: 'gauge',
        label: all('widgetRequests'),
        // The budget may have been lowered after requests were sent.
        value: Math.min(used, budget),
        min: 0,
        max: budget,
        color:
          ratio >= 1
            ? WIDGET_COLORS.DANGER
            : ratio >= 0.8
              ? WIDGET_COLORS.WARNING
              : WIDGET_COLORS.SUCCESS,
      },
      { type: 'status', items },
      credit(),
    ],
  };
}
