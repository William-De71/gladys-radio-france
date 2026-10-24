// -----------------------------------------------------------------------------
// Integration configuration: the `config_schema` values of the manifest,
// normalized so the rest of the code never deals with strings from a form or
// `undefined`.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Defaults: they MUST stay consistent with the `default` values of the
// manifest `config_schema` (test/manifest.test.js checks it).
export const DEFAULTS = {
  api_key: '',
  language: 'fr',
  daily_budget: 900,
  min_interval_seconds: 90,
};

// Bounds of the numbers, the same as the manifest (min / max).
export const BOUNDS = {
  daily_budget: [100, 1000],
  min_interval_seconds: [60, 600],
};

const bounded = (value, [min, max], fallback) => {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof number !== 'number' || !Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
};

/**
 * @description Normalize the raw configuration.
 * @param {object} raw - `gladys.config` or the `onConfigUpdated` payload.
 * @returns {{ apiKey: string, language: string, dailyBudget: number,
 * minIntervalSeconds: number }} The configuration.
 */
export function normalizeConfig(raw = {}) {
  const key = typeof raw?.api_key === 'string' ? raw.api_key.trim() : '';
  return {
    // A key is a token: anything else (spaces, a pasted URL) is refused by the
    // API anyway, and must never reach a header.
    apiKey: /^[\w.-]{8,200}$/.test(key) ? key : '',
    language: LANGUAGES.includes(raw?.language) ? raw.language : DEFAULTS.language,
    dailyBudget: bounded(raw?.daily_budget, BOUNDS.daily_budget, DEFAULTS.daily_budget),
    minIntervalSeconds: bounded(
      raw?.min_interval_seconds,
      BOUNDS.min_interval_seconds,
      DEFAULTS.min_interval_seconds,
    ),
  };
}
