// Web build for Vercel: the marketing site at "/" plus the Expo web app on
// every other route.
//
//   1. `expo export -p web` writes the single-page app to dist/ (index.html +
//      /_expo bundles).
//   2. This script renames the app shell to dist/app.html and copies the
//      static marketing site (site/) into dist/, so dist/index.html is the
//      landing page.
//   3. vercel.json rewrites every other non-file, non-/api path to /app.html,
//      so /legal/privacy, /support, /journal etc. still load the app.
import { cpSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
if (!existsSync(join(dist, 'index.html'))) {
  console.error('build-web: dist/index.html not found — run `expo export -p web` first');
  process.exit(1);
}
renameSync(join(dist, 'index.html'), join(dist, 'app.html'));
cpSync('site', dist, { recursive: true });
console.log('build-web: app shell → dist/app.html, landing page → dist/index.html');
