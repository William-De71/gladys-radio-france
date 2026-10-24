// -----------------------------------------------------------------------------
// Entry point of the Radio France external integration (unofficial, not
// affiliated with Radio France).
//
// The Radio France Open API (GraphQL, a personal key per user, 1,000 requests
// a day):
//   - devices: one per station (France Inter, franceinfo, FIP and its web
//     radios, the local stations…), with the show, the segment and the track
//     on air, and a "follow" switch (src/devices.js);
//   - scene triggers: a new track, a new show, a new segment;
//   - scene actions: what is on air, the next shows;
//   - dashboard widgets: now on air, upcoming shows, API usage.
//
// This file only wires the SDK client: the handlers are in src/app.js,
// registered before connect() (the SDK requires it).
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
const app = createApp(gladys, { logger });

gladys.handleShutdown(() => app.stop());

logger.info(`Starting the Radio France integration ${version}...`);
try {
  await gladys.connect();
  await app.start();
} catch (error) {
  logger.error('Radio France: startup failed', error);
  process.exit(1);
}
