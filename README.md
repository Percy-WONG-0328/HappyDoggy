# HappyDoggy

HappyDoggy is a private two-person shared calendar PWA. It started as a local interaction prototype and has now moved to a deployable web app with Supabase Auth, cloud sync, relationship invites, realtime updates, and iPhone home-screen support.

Production:

https://happy-doggy-eosin.vercel.app/

Repository:

https://github.com/Percy-WONG-0328/HappyDoggy

## Current Status

The app supports self-service account registration, login, display-name editing, inviting another user by email, accepting invitations, and automatically creating an active two-way relationship. Once connected, two users can create private events, relationship-visible events, and shared events that both participants can edit or delete.

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
- Private, relationship-visible, and shared event visibility.
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
- Week View with previous/next week navigation and a scrollable 24-hour grid.
- Visual "Find Time Together" helper for shared free evening slots.

## Not Done Yet

- Full post-redesign regression testing on real devices for auth, event CRUD, drag, resize, delete Undo, relationship invites, realtime refresh, Week navigation, and Find Time Together.
- AI-assisted schedule input: text or voice to structured calendar events, with optional ICS generation/import.
- Custom domain setup for the deployed PWA.
- Real settings flows for Profile page entries such as categories, notifications, calendar sync, account privacy, and any future preference screens.
- Week View creation/editing interactions from the grid itself, such as tapping events to edit or tapping empty time to create.
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
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

When both variables are present, the app uses Supabase Auth, database CRUD, and realtime sync. Without them, it uses local mock users and events.
`GEMINI_API_KEY` enables the AI natural-language event parser. `GEMINI_MODEL` is optional and defaults to `gemini-2.5-flash`.

## Supabase Setup

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

## PWA Deployment

The app is a web-first PWA rather than a native iOS App Store app.

1. Deploy the Next.js app to Vercel.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel project settings.
3. Open the deployed URL in iPhone Safari.
4. Use Safari Share > Add to Home Screen.

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
