# Fig

Fig is a quiet calendar for two. It helps two people see each other's day, find time together, and keep personal boundaries through a split-screen timeline. The project started under the HappyDoggy codename and has now moved to a deployable PWA with Supabase Auth, cloud sync, relationship invites, realtime updates, and iPhone home-screen support.

Production:

https://withfig.app/

Repository:

https://github.com/Percy-WONG-0328/HappyDoggy

## Current Status

The app supports self-service account registration, login, display-name editing, inviting another user by email, accepting invitations, and automatically creating an active two-way relationship. Once connected, two users can create Only Mine events, Visible events, and Ours events that both participants can edit or delete.

The main branch is deployable to Vercel. Local development falls back to mock data when Supabase environment variables are not configured.

The current UI redesign is implemented for the main calendar shell: Day View, Week View, Profile, mobile header behavior, timeline styling, and the guava-themed visual system. Week View includes week navigation, sticky day headers, a scrollable 24-hour grid, and a "Find Time Together" helper that highlights shared free evening slots directly on the weekly grid.

## Features

- Day-view calendar with two-person lanes and centered shared events.
- 15-minute scheduling granularity.
- Cross-midnight event rendering.
- Event collision layout.
- Drag to create events.
- Drag to move events.
- Resize events from the top or bottom.
- Event editor modal.
- All-day events.
- Only Mine, Visible, and Ours event boundaries.
- Supabase Auth registration and login.
- User profiles with editable display names.
- Email-based relationship invites.
- Accept invite flow that creates reciprocal active relationships.
- Supabase-backed event CRUD.
- Supabase Realtime refresh for events, participants, and relationships.
- Manual sync and automatic refresh when the app becomes visible.
- Optimistic updates with rollback when saves fail.
- Failed create cleanup.
- Failed drag or resize restore.
- Delete with 6-second Undo.
- Protection against stale save responses overwriting newer edits.
- PWA manifest, icons, Apple touch icon, iOS metadata, service worker, and offline fallback.
- New-version prompt with Refresh action.
- iPhone-friendly compact layout with mobile event creation controls.
- Redesigned guava/sage calendar interface for Day View, Week View, and Profile.
- Profile page for display name, relationship invites, and account actions.
- Week View with previous/next week navigation, day jumps, event editing, empty-slot creation, and a scrollable 24-hour grid.
- Visual "Find Time Together" helper for shared free evening slots.
- AI-assisted event drafts from natural-language text or an image, confirmed through the existing event editor.

## Not Done Yet

- Full post-redesign regression testing for auth, event CRUD, drag, resize, delete Undo, relationship invites, realtime refresh, Week navigation, and Find Time Together.
- Voice transcription for AI event drafts, plus ICS generation/import.
- Real settings flows for Profile page entries such as categories, notifications, calendar sync, account privacy, and any future preference screens.
- Production polish for onboarding, empty states, accessibility review, and edge-case offline behavior.

## Completed Phases

### Phase 1: Local Interaction Prototype

Implemented the core calendar interaction model with mock data: day timeline, two-person columns, centered shared events, 15-minute snapping, cross-midnight rendering, collision layout, drag creation, drag movement, top and bottom resize, edit dialog, all-day events, and a flat UI foundation.

### Phase 2: Supabase Cloud Integration

Added Supabase Auth and cloud data for `profiles`, `events`, `event_participants`, and `user_relationships`. The app supports authenticated CRUD, row-level security, private and shared visibility rules, realtime updates, manual sync, automatic refresh, and save status feedback.

This phase also includes fixes for RLS recursion, UUID handling, duplicate participants, owner participant cleanup, and shared event permissions so that shared participants can edit and delete shared events.

### Phase 3: PWA and iPhone Experience

Added the PWA shell, manifest, icons, Apple metadata, service worker, offline fallback, and iPhone-focused layout improvements. Mobile now supports a single-screen two-person timeline, larger touch targets, `+ Me` and `+ Both` creation, and improved drag/resize behavior that avoids scroll conflicts.

## Run Locally

```powershell
npm.cmd install
npm.cmd run dev
```

Then open the local Next.js URL printed by the dev server.

## Environment

Copy `.env.example` to `.env.local` and fill:

```powershell
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
ARK_API_KEY=
ARK_MODEL=doubao-seed-2-1-pro-260628
ARK_TEXT_MODEL=
```

When both variables are present, the app uses Supabase Auth, database CRUD, and realtime sync. Without them, it uses local mock users and events.
`ARK_API_KEY` enables AI event parsing through Volcengine Ark. `ARK_MODEL` selects the vision model and defaults to `doubao-seed-2-1-pro-260628`. `ARK_TEXT_MODEL` can optionally select a faster text model; when unset, text parsing uses `ARK_MODEL` with minimal reasoning and a hard timeout.

## Supabase Setup

Production domain:

- Primary: https://withfig.app/
- WWW: https://www.withfig.app/ redirects to https://withfig.app/
- Legacy Vercel URL: https://happy-doggy-eosin.vercel.app/

For a fresh Supabase project, run:

```text
supabase/schema.sql
```

The schema includes tables, indexes, realtime publication setup, helper functions, invite acceptance RPC, triggers, and RLS policies.

Additional SQL patch files are kept in `supabase/` for historical fixes and targeted production repairs:

- `fix_rls_recursion.sql`
- `enable_realtime.sql`
- `add_auth_invites.sql`
- `fix_shared_update_policy.sql`
- `fix_shared_delete_policy.sql`
- `fix_shared_event_permissions.sql`
- `cleanup_owner_participants.sql`


### Supabase Auth URL Configuration

The current app uses email/password auth through `signUp` and `signInWithPassword`; it does not currently use OAuth, magic links, password reset, or an explicit `redirectTo` option. Direct email/password login should work on `withfig.app` as long as the Supabase URL and anon key are configured in Vercel.

Still configure Supabase Auth before broader testing because email confirmation and future password reset flows depend on it:

1. In Supabase, open **Authentication > URL Configuration**.
2. Set **Site URL** to `https://withfig.app`.
3. Add these **Redirect URLs**:
   - `https://withfig.app/**`
   - `https://www.withfig.app/**`
   - `https://happy-doggy-eosin.vercel.app/**`
   - `http://localhost:3000/**`
4. Keep the production URL exact and use localhost only for development.

Reference: https://supabase.com/docs/guides/auth/redirect-urls

## PWA Deployment

The app is a web-first PWA rather than a native iOS App Store app.

1. Deploy the Next.js app to Vercel.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel project settings.
3. Connect `withfig.app` as the primary production domain.
4. Redirect `www.withfig.app` to `https://withfig.app/`.
5. Open `https://withfig.app/` in iPhone Safari.
6. Use Safari Share > Add to Home Screen.

PWA files:

- `src/app/manifest.ts`
- `src/app/pwa-register.tsx`
- `public/sw.js`
- `public/offline.html`
- `public/icons/*`

The service worker caches the app shell and serves `offline.html` for offline navigation. Supabase calendar data still requires network access to sync.

## Project Structure

- `src/app/page.tsx` - main calendar app and interaction orchestration.
- `src/app/event-editor.tsx` - event editing form.
- `src/app/status-message.tsx` - save, sync, error, and undo status UI.
- `src/lib/calendarRepository.ts` - Supabase and mock repository logic.
- `src/lib/layout.ts` - event lane and collision layout helpers.
- `src/lib/time.ts` - date and time utilities.
- `src/types/calendar.ts` - shared calendar types.
- `supabase/schema.sql` - complete database schema and policies.

## Useful Commands

```powershell
npm.cmd run build
```

Builds the app for production and runs TypeScript checks.
