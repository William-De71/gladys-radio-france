# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- **api:** the official Radio France Open API (GraphQL), with the personal key of the user sent in the `x-token` header only; up to 10 stations read in one request (aliases); typed errors for a refused key, the daily quota, a query the schema refuses (simpler shapes tried, then the program grid) and an outage
- **stations:** the station list read from the API (national stations, web radios, ICI local stations), never hard-coded; one device per station with the show, the segment and the track on air, and a "Follow" switch: a station that is not followed is never asked
- **quota:** a daily request budget (900 by default, out of the 1,000 a day of a key) counted in `/data` and reset at midnight in Paris; the next reading waits for the end of what is on air, never sooner than the minimum interval, and is spread over the rest of the day when the budget runs low; a pause until midnight when the API refuses for quota, a growing delay when the key is refused
- **scenes:** triggers when a new track, a new show or a new segment starts on a followed station (never at the first reading, never twice for the same step); actions that return what is on air and the next shows with a sentence to read out
- **widgets:** "Now on air" with a Refresh button, "Upcoming shows" from the program grid, "Open API usage" with a gauge of the requests of the day; each shows the credit "données fournies par l’Open API Radio France"
- **terms:** nothing of Radio France stored (memory only, an hour at most), no stream played, no logo; the procedure to request a key explained in the configuration
- **i18n:** English, French, German and Spanish for the manifest, the runtime texts, the documentation and the README

[0.1.0]: https://github.com/William-De71/gladys-radio-france/releases/tag/v0.1.0
