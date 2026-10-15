/** Local / long-running server: the API plus the built website. */
import { relative } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { announcements, app, startupNote } from './app.js';
import { API_PORT, WEB_DIST } from './env.js';

// serveStatic resolves root against the working directory.
const STATIC_ROOT = relative(process.cwd(), WEB_DIST) || '.';
app.use('/*', serveStatic({ root: STATIC_ROOT }));
app.get('*', serveStatic({ root: STATIC_ROOT, path: 'index.html' }));

void announcements.start();

serve({ fetch: app.fetch, port: API_PORT }, ({ port }) => {
  console.log(`PANSA on http://localhost:${port}  ${startupNote}`);
});
