# Core UI Foundation

Goal: Build the foundational UI structure, lock in the design system, and establish the main dashboard.

Lovable Prompt Strategy:

Prompt Example: "Create a fully dynamic web and mobile-optimized dashboard titled 'Maziwaflow Mobile' featuring a deep blue header bar and a rounded central white container card. Inside the card, build stacked pill-shaped buttons with exact labels and colors: 'Receive Milk' (Green), 'Change Password' (Purple), 'Enquiries' (Orange), 'View Collections' (Soft Purple/Blue), and 'Logout' (Dark Brown). Include a pink floating help button (?) at the bottom right."

Pro Tip (Theme & Color Locking): Explicitly state your exact color scheme in this opening prompt. This locks your design rules (backgrounds, buttons, cards, and accent colors) so Lovable doesn't drift into mismatched styles as you add more views later.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3cd49a99-251d-4bce-bfd5-4e83d3f5552a).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd "Maziwaflow  mobile app"
npm i
npm run dev
```

## Email confirmation redirects

Set `VITE_APP_URL` to the public application origin for deployed builds. If it is
omitted, email confirmation links use the origin currently serving the app. Add
the resulting `/auth?verified=1` callback URL to the Supabase Auth redirect URL
allowlist. Supabase records successful confirmation in
`auth.users.email_confirmed_at`.

## Deploy to Cloudflare Workers

The app uses TanStack Start server rendering, so it needs a server-capable host;
GitHub Pages cannot host the production build on its own. The GitHub Actions
workflow builds every push and pull request, then deploys pushes to `main` to
Cloudflare Workers.

To enable automatic deployment:

1. Create a Cloudflare API token with permission to edit Workers and obtain your
   Cloudflare account ID.
2. In the GitHub repository, open **Settings → Secrets and variables → Actions**
   and add repository secrets named `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`.
3. Push a commit to `main`. After the workflow succeeds, the deployment step
   reports the public `https://...workers.dev` URL.

To build locally, run `npm run build` from this app directory. The Cloudflare
Worker entry point and its Wrangler configuration are generated under
`.output/server/`.

## Build an Android APK

The Android app loads the deployed, server-rendered web app, so it needs an
HTTPS URL. The `Build Android APK` GitHub Actions workflow accepts this URL
when run manually; it defaults to `https://maziwaflow-app.pages.dev`. Push and
tag builds use the `CAPACITOR_SERVER_URL` repository variable when set, and
otherwise use that same default.

To build locally, install Android Studio/SDK and JDK 21, then run:

```sh
npm run build
export CAPACITOR_SERVER_URL=https://maziwaflow-app.pages.dev
npx cap add android
npx cap sync android
(cd android && ./gradlew assembleDebug)
```

The debug APK is written to
`android/app/build/outputs/apk/debug/app-debug.apk`.
