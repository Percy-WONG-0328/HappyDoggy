# HappyDoggy

Phase 1 local interactive prototype for the HappyDoggy private calendar app.

## Run

```powershell
npm.cmd install
npm.cmd run dev
```

The prototype uses mock users and events only. Supabase Auth, RLS, and cloud sync are deferred to Phase 2 per `PRD.md`.

## Phase 2 Supabase Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Create invited users from Supabase Auth.
4. Add reciprocal rows in `user_relationships` for active relationships.
5. Copy `.env.example` to `.env.local` and fill:

```powershell
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

When those variables are present, the app switches from mock mode to Supabase Auth and cloud event CRUD.

## Phase 3 PWA

The app is a web-first PWA, not a native iOS App Store app.

- Deploy the Next.js app to Vercel.
- Add the same Supabase environment variables in Vercel project settings.
- Open the deployed URL in iPhone Safari.
- Use Safari Share > Add to Home Screen to install it as an app-like home-screen icon.

PWA files:

- `src/app/manifest.ts`
- `public/icons/*`
- `public/sw.js`
- `public/offline.html`

The service worker caches the basic app shell and shows `offline.html` for navigation while offline. Supabase calendar data still requires network access for sync.
