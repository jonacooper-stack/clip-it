# App Store screenshots

`store/screenshots/iphone-6.9/` holds the six App Store screenshots (6.9" iPhone,
1320 × 2868). They're rendered from the real app (the web build of the same
code) with sample content: a sample account, sample wall posts by fictional
explorers, and cached Scout posts. Every network request is answered inside the
headless browser, so nothing touches the real database. Wall and journal
photos are public domain or CC0; Scout's photos show their credit on screen.

To regenerate after the UI changes:

1. Build the web app with the Supabase settings from `eas.json` (so the app
   behaves as signed in), into a temp folder, and serve it:
   ```bash
   EXPO_PUBLIC_SUPABASE_URL=https://oybkykeoatfgcfqgaqpl.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key from eas.json> npx expo export -p web --clear --output-dir /tmp/shots-web
   ```
   ```bash
   mv /tmp/shots-web/index.html /tmp/shots-web/app.html && cp -r site/. /tmp/shots-web/
   ```
   Serve that folder on `http://127.0.0.1:8791`, sending unknown paths to
   `/app.html` (like Vercel's rewrite).
2. `node scripts/store-screenshots/shoot.js /tmp/shots` renders the raw screens
   (440 × 902 points at 3x) into `/tmp/shots/raw`.
3. `node scripts/store-screenshots/frame.js /tmp/shots` adds the headline,
   phone frame and status bar, writing the final PNGs to `/tmp/shots`.
