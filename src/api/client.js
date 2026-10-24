// -----------------------------------------------------------------------------
// GraphQL client of the Radio France Open API.
//
//   POST https://openapi.radiofrance.fr/v1/graphql   { "query": "..." }
//   header x-token: <the user's key>
//
// The key always travels in the header, never in the URL (an URL ends up in
// logs and error messages). Errors are typed so the app can react:
//
//   auth      401 / 403: missing, unknown or revoked key
//   quota     429, or a refusal that talks about a quota or a limit (the
//             FAQ says "a server error" past 1,000 requests a day)
//   graphql   HTTP 200 with `errors` and no usable data (a field or a station
//             the schema does not know, a malformed query)
//   http      any other HTTP status
//   network   no answer (DNS, TLS, timeout)
//   invalid   an answer that is not the JSON of a GraphQL response
//
// Station ids are values of the `StationsEnum` enum, written as they are in
// the query (never quoted): they are checked against ^[A-Z0-9_]+$ first.
// -----------------------------------------------------------------------------

export const ENDPOINT = 'https://openapi.radiofrance.fr/v1/graphql';
export const MAX_ALIASES = 10;
const TIMEOUT_MS = 12 * 1000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

export class ApiError extends Error {
  /**
   * @param {string} kind - auth | quota | graphql | http | network | invalid.
   * @param {string} message - Message, never containing the key.
   * @param {object} [details] - `{ status, validation }`.
   */
  constructor(kind, message, details = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = details.status ?? null;
    // A GraphQL validation error: the query asks for something the schema
    // does not have (the app then tries a simpler query).
    this.validation = details.validation === true;
  }
}

/**
 * @description The endpoint: the official one, or a fake server on this
 * machine for development (RADIO_FRANCE_OPENAPI_URL, see
 * scripts/fake-openapi.mjs). Any other URL is ignored: the key must only
 * ever be sent to Radio France.
 * @param {object} [env] - Environment.
 * @returns {string} The endpoint.
 */
export function endpointFromEnv(env = process.env) {
  const candidate = env.RADIO_FRANCE_OPENAPI_URL;
  if (!candidate) return ENDPOINT;
  try {
    const url = new URL(candidate);
    if (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      return url.href;
    }
  } catch {
    // Not a URL: the official endpoint.
  }
  return ENDPOINT;
}

/**
 * @description Whether a string can be written as a `StationsEnum` value.
 * @param {*} id - Candidate.
 * @returns {boolean} True for FIP, FRANCEBLEU_ALSACE, FIP_HIP_HOP…
 */
export function isStationId(id) {
  return typeof id === 'string' && id.length <= 64 && /^[A-Z][A-Z0-9_]*$/.test(id);
}

const QUOTA = /quota|rate.?limit|too many|limit exceeded|limite/i;
const AUTH = /unauthori[sz]ed|forbidden|x-token|invalid token|api key/i;
const VALIDATION =
  /cannot query field|unknown (type|argument)|cannot be spread|can never be of type|does not exist in "?\w*enum|expected type|syntax error|is not defined by type|field ".*" (must|argument)/i;

const clean = (text, key) => {
  let value = String(text ?? '').slice(0, 300);
  if (key) value = value.split(key).join('***');
  return value.replace(/\s+/g, ' ').trim();
};

/**
 * @description Create the client.
 * @param {object} [options] - Options.
 * @param {Function} [options.fetch] - `fetch` (tests).
 * @param {string} [options.endpoint] - URL (the fake server of scripts/).
 * @param {number} [options.timeoutMs] - Timeout of a request.
 * @returns {{ query: Function, endpoint: string }} The client.
 */
export function createClient({
  fetch = globalThis.fetch,
  endpoint = ENDPOINT,
  timeoutMs = TIMEOUT_MS,
} = {}) {
  /**
   * @description Run one GraphQL query: exactly one HTTP request.
   * @param {string} query - The query.
   * @param {string} apiKey - The key.
   * @returns {Promise<{ data: object, errors: object[] }>} The data, and the
   * errors of a partial answer.
   */
  async function query(query, apiKey) {
    if (!apiKey) {
      throw new ApiError('auth', 'no API key');
    }
    let response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          'x-token': apiKey,
          'user-agent': 'gladys-radio-france (Gladys Assistant integration)',
        },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new ApiError(
        'network',
        clean(error?.cause?.code ?? error?.message ?? 'network error', apiKey),
      );
    }
    let text;
    try {
      text = await response.text();
    } catch (error) {
      throw new ApiError('network', clean(error?.message, apiKey), { status: response.status });
    }
    if (text.length > MAX_BODY_BYTES) {
      throw new ApiError('invalid', 'answer too big', { status: response.status });
    }
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    const message = clean(
      body?.message ?? body?.errors?.map?.((error) => error?.message).join(' / ') ?? text,
      apiKey,
    );
    const { status } = response;
    if (status === 401 || status === 403) {
      throw new ApiError('auth', message || `HTTP ${status}`, { status });
    }
    if (status === 429 || (status >= 400 && QUOTA.test(message))) {
      throw new ApiError('quota', message || `HTTP ${status}`, { status });
    }
    if (status < 200 || status >= 300) {
      throw new ApiError('http', message || `HTTP ${status}`, { status });
    }
    if (!body || typeof body !== 'object') {
      throw new ApiError('invalid', 'not a GraphQL answer', { status });
    }
    const errors = Array.isArray(body.errors) ? body.errors : [];
    const data = body.data && typeof body.data === 'object' ? body.data : null;
    const usable =
      data && Object.values(data).some((value) => value !== null && value !== undefined);
    if (errors.length > 0 && !usable) {
      if (QUOTA.test(message)) throw new ApiError('quota', message, { status });
      if (AUTH.test(message) && !VALIDATION.test(message)) {
        throw new ApiError('auth', message, { status });
      }
      throw new ApiError('graphql', message || 'GraphQL error', {
        status,
        validation: VALIDATION.test(message),
      });
    }
    if (!data) {
      throw new ApiError('invalid', 'no data', { status });
    }
    return { data, errors };
  }

  return { query, endpoint };
}

// --- Queries -----------------------------------------------------------------------------------

// Every brand with its local stations and web radios. `liveStream` is only
// read to know whether a station broadcasts (France Bleu / ICI as a brand
// has none, only its local stations): it is never kept nor shown.
export const BRANDS_QUERY = `{
  brands {
    id
    title
    liveStream
    localRadios { id title liveStream }
    webRadios { id title liveStream }
  }
}`;

const DIFFUSION = `... on DiffusionStep {
        id start end
        diffusion { id title standFirst url show { id title } }
      }`;
const BLANK = `... on BlankStep { id start end title }`;
const TRACK_FIELDS = `track { id title albumTitle mainArtists performers authors productionDate label }`;

// The shapes of the `live` query, from the most complete to the safest. The
// schema cannot be read without a key and is not published: if the API
// refuses a shape (validation error), the next one is tried.
//   live            show / program as a Step union, song as a TrackStep
//   live-diffusion  show / program as DiffusionStep only
//   grid            no `live` at all: the steps around now, from the grid
export const LIVE_VARIANTS = ['live', 'live-diffusion', 'grid'];
export const GRID_PAST_SECONDS = 3 * 3600;

const liveSelection = (variant) => {
  const step = variant === 'live' ? `__typename ${DIFFUSION} ${BLANK}` : `__typename ${DIFFUSION}`;
  return `show { ${step} }
    program { ${step} }
    song { id start end ${TRACK_FIELDS} }`;
};

const gridSelection = (withTracks) =>
  `__typename ${DIFFUSION} ${BLANK}${withTracks ? ` ... on TrackStep { id start end ${TRACK_FIELDS} }` : ''}`;

const checkIds = (ids) => {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_ALIASES) {
    throw new Error(`1 to ${MAX_ALIASES} stations per query`);
  }
  for (const id of ids) {
    if (!isStationId(id)) throw new Error(`not a station id: ${String(id).slice(0, 40)}`);
  }
};

/**
 * @description What is on air now on up to 10 stations, in one request
 * (one alias per station: s0, s1…).
 * @param {string[]} ids - Station ids.
 * @param {string} variant - One of LIVE_VARIANTS.
 * @param {number} nowSeconds - Now (s), for the grid variant.
 * @returns {string} The query.
 */
export function liveQuery(ids, variant, nowSeconds) {
  checkIds(ids);
  if (variant === 'grid') {
    const start = Math.floor(nowSeconds - GRID_PAST_SECONDS);
    const end = Math.floor(nowSeconds + 60);
    return `{
  ${ids
    .map(
      (id, index) =>
        `s${index}: grid(start: ${start}, end: ${end}, station: ${id}, includeTracks: true) { ${gridSelection(true)} }`,
    )
    .join('\n  ')}
}`;
  }
  return `{
  ${ids.map((id, index) => `s${index}: live(station: ${id}) { ${liveSelection(variant)} }`).join('\n  ')}
}`;
}

/**
 * @description The program grid of one station, without the tracks.
 * @param {string} id - Station id.
 * @param {number} start - Start (s, POSIX).
 * @param {number} end - End (s), less than 24 h after the start.
 * @returns {string} The query.
 */
export function gridQuery(id, start, end) {
  checkIds([id]);
  const from = Math.floor(start);
  const to = Math.floor(end);
  if (!(to > from) || to - from >= 24 * 3600) {
    throw new Error('a grid covers less than 24 hours');
  }
  return `{
  grid(start: ${from}, end: ${to}, station: ${id}, includeTracks: false) { ${gridSelection(false)} }
}`;
}
