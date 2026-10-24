# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for the **Radio France Open API**
(unofficial, not affiliated with Radio France): a Node.js service (Node 22+,
ESM, no build step) in its own sandboxed Docker container, talking to Gladys
through [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency, and to `https://openapi.radiofrance.fr/v1/graphql`
(`transports: ["cloud"]`) with the personal key of the user in the `x-token`
header. `type: "device"`, Gladys 5.1.0+ (widgets, scenes). No `keywords` nor
`countries` in the manifest: they need Gladys 5.3.0.

**Never tested with a real key.** The client is tested against a fake API
(`test/helpers/fake-openapi.js`) built from the documentation and from projects
that use the API (see NOTICE).

## Commands

```bash
npm install
npm test                                  # node --test; a fake Open API, never the network
node --test test/app.test.js              # one file
UPDATE_BASELINE=1 npm test                # rewrite test/fixtures/discovery.baseline.json (on purpose only)
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
node scripts/fake-openapi.mjs 8781        # the fake API on 127.0.0.1 (key test-key-0123456789)
scripts/check-simulator.sh                # the real app over HTTP against the fake API, 3 schema shapes
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only: createApp(gladys) + connect + start
src/app.js              every handler: start, scan, rounds, states, scene events and
                        actions, widgets, configuration button, status
src/api/client.js       GraphQL client (x-token header, typed errors), the queries:
                        brands, live with aliases (3 shapes), grid
src/api/parse.js        answers -> stations, steps, what is on air, shows of a grid
src/scheduler.js        when to ask again (end of the steps, bounds, pace of the budget)
src/budget.js           the request counter of the day (Paris) in /data/usage.json
src/time.js             Paris day and midnight, HH:MM in the time zone of the container
src/devices.js          a station -> the Gladys device, feature values
src/scenes.js           trigger / action keys, transitions, event data
src/widgets.js          the three widgets (pure, reused by docs/illustrations)
src/states.js           state publication: created devices only, coalesced, 240/min, 429 pause
src/storage.js          /data: usage.json, settings.json (follow switches)
src/config.js           key, language, daily budget, minimum interval
src/i18n.js             runtime texts, en / fr / de / es
test/helpers/fake-openapi.js  the fake Open API (made-up programs, quota, schema shapes)
scripts/fake-openapi.mjs      the same over HTTP; scripts/simulate.mjs drives the real app
.github/scripts/release.mjs   version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store:
  `ext:<selector>:station:<StationsEnum id in lower case>`, features `…:show`,
  `…:program`, `…:track`, `…:follow`, their `category` / `type` / `min` /
  `max`, the keys of `config_schema` and `actions`, the widgets and their
  settings, the triggers (fields, variables), the scene actions (fields,
  outputs). `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update it to make a test pass
  without a documented migration.
- **Terms of use of the Open API** (CGU of 06/06/2019, FAQ):
  - **nothing of Radio France in `/data`**, no proxy, no disk cache: the station
    list, what is on air and the grids live in memory, an hour at most;
  - **no stream, no podcast playback**: never expose `liveStream` or
    `playerUrl` (`liveStream` is only read in `brands` to know whether a station
    broadcasts);
  - **the credit** "données fournies par l’Open API Radio France" in every
    widget (`credit` in `src/i18n.js`, the French sentence word for word);
  - **no logo** of Radio France or of its stations; titles shown as they are
    (never translated; shortening for a widget is fine);
  - private, non-commercial use, a personal key per user.
- **The quota**: 1,000 requests a day per key, the key blocked past it. Every
  HTTP request goes through `request()` in `src/app.js`, which counts it in the
  budget **before** sending it. Never add a request outside it. Rounds keep a
  reserve (`reserveOf`) for the actions and the widget button. No station
  followed means no request at all.
- **Never put a value in a query that is not checked**: station ids match
  `^[A-Z][A-Z0-9_]*$` (`isStationId`), times are integers.
- **The key** travels in the `x-token` header only, never in a URL, a log or an
  error message (`clean()` masks it); a development endpoint
  (`RADIO_FRANCE_OPENAPI_URL`) must be on 127.0.0.1 / localhost.
- **Scene events** once per new step, seen by a scheduled round only: never at
  the first reading, never for a step that started more than 30 minutes ago,
  never from a scene action or a widget button (no loop).
- **No empty text state** (Gladys would drop it): `NO_TEXT`.
- **The station list comes from the API** (France Bleu became ICI in 2025):
  never a hard-coded list in `src/`; the fake API keeps a small one for tests.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, `src/i18n.js`,
  `docs/*.md`, README) exists in en, fr, de, es; `test/i18n.test.js` checks it.
  German says "du", Spanish "usted".
- **Widget images.** After any change to a widget content, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
  Budget: 8 components, 2 texts (the heading and the credit caption), 1 status.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  Below 1.0.0 until the maintainer runs Release with `release-as: 1.0.0`.
- **Changelog.** Ne jamais éditer CHANGELOG.md à la main, il est généré à la
  release. Écris le titre de PR comme la ligne que l'utilisateur lira.
- **Commits and PR titles** follow Conventional Commits, in English.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network beyond 127.0.0.1.

## Assumptions (not verifiable without a key)

- The full schema of `live(station)`: `show` / `program` as a Step union
  (`DiffusionStep` | `BlankStep`), `song` as a `TrackStep`. If the API refuses
  it, `live-diffusion` (no `BlankStep`) then `grid` (steps around now) are
  tried, once per run (`LIVE_VARIANTS`).
- A request with 10 aliases counts as **one** request (the terms define a
  request as an HTTP request).
- The daily counter resets at **midnight in Paris**.
- The ids of the ICI local stations are still `FRANCEBLEU_*`; the code takes
  them from `brands` anyway.
- A quota refusal is a 429 or a message about a quota / limit; a plain 500
  ("server error" in the FAQ) is treated as an outage with a growing delay.

## Pitfalls

- The grid lists a show **and** its segments in its time range (flattened):
  `topLevelShows` drops a diffusion contained in a longer one.
- `grid` returns 100 steps at most and a range under 24 hours; FIP and its web
  radios publish no schedule in advance (an empty grid is normal).
- A GraphQL validation error rejects the whole query (every alias): an unknown
  station is found in the message and left out (`rejected`).
- `node --test` also runs `test/helpers/`: nothing starts on import.
- The validator of the Gladys core creates `gladys-development.duckdb` in the
  current folder: run it from elsewhere.
- A top-level `const SVG` in `docs/illustrations/render.js` would shadow the
  global of ApexCharts: it is `SVG_NS`.
