# Fig Progress Log

Date: 2026-07-01

This log records the product, UI, infrastructure, and deployment work completed during the HappyDoggy to Fig transition. It is intended as a concise GitHub-visible checkpoint before the next round of PWA testing and product polish.

## 1. Product Direction

The project has moved away from the temporary HappyDoggy name and is now using Fig as the public product identity.

Current positioning:

- Product name: Fig
- App Store style name: Fig: Calendar for Two
- Product line: A quiet calendar for two.
- Core promise: See each other's day. Find time together. Keep your own space.
- Primary product surface: a split-screen timeline for two people
- Boundary language: Only Mine / Visible / Ours

The product should stay narrow. Fig is not being positioned as a chores app, grocery app, date planner, relationship assistant, family organizer, or broad couples operating system. The core value is helping two people see each other's rhythm while keeping clear personal boundaries.

## 2. Strategy Documents Added

The following project documents now capture the positioning and roadmap direction:

- `fig-brand-narrative.md`
- `docs/strategy-log-2026-06-30.md`
- `docs/fig-positioning-decision-2026-06-30.md`

Key strategy decision:

- Cupla is framed as "manage your relationship."
- Fig is framed as "see each other's rhythm."

This distinction should guide future UI, onboarding, App Store copy, and feature prioritization.

## 3. Public Brand Surface Rename

Public app surfaces have been renamed from HappyDoggy to Fig.

Updated areas include:

- Next.js metadata in `src/app/layout.tsx`
- PWA manifest in `src/app/manifest.ts`
- Offline fallback copy in `public/offline.html`
- SVG icon accessibility label in `public/icons/icon.svg`
- Login and profile copy in `src/app/page.tsx`
- Invite/account error copy in `src/lib/calendarRepository.ts`
- Service worker cache naming in `public/sw.js`
- README title and production URL documentation

The repository name is still HappyDoggy, but the product surface now presents as Fig.

## 4. Boundary Language Update

The event editor sharing labels were updated to match the new product language:

- Just me -> Only Mine
- Let them see -> Visible
- Together -> Ours

The underlying model was intentionally left unchanged. Internal values such as `just-me`, `let-see`, `together`, `visibility`, and participant records continue to drive the save logic.

## 5. Domain Purchase and Production Routing

The production domain is now:

https://withfig.app/

Domain setup status:

- `withfig.app` was purchased through Vercel.
- The domain is connected to the production Vercel project.
- `https://withfig.app/` returns a valid production response.
- `https://www.withfig.app/` redirects to `https://withfig.app/`.
- The user has verified the registration email.
- The legacy Vercel URL remains available as a fallback: `https://happy-doggy-eosin.vercel.app/`.

README now documents the primary domain, the www redirect, and the legacy fallback URL.

## 6. Supabase Auth Configuration Review

The app currently uses Supabase email/password auth through:

- `signUp`
- `signInWithPassword`

The app does not currently rely on:

- OAuth redirects
- Magic links
- Password reset redirects
- Explicit `redirectTo` values

Recommended Supabase Auth URL settings were documented in README:

- Site URL: `https://withfig.app`
- Redirect URLs:
  - `https://withfig.app/**`
  - `https://www.withfig.app/**`
  - `https://happy-doggy-eosin.vercel.app/**`
  - `http://localhost:3000/**`

Because the current flow is email/password based, the custom domain should not block login by itself. These settings are still recommended before OAuth, magic links, or password reset flows are added.

## 7. Event Editor Work Completed

The event editor received a major V1 redesign and multiple mobile fixes.

Completed editor work includes:

- Rebuilt the editor information hierarchy around title, summary, When, For, and Style.
- Added the Only Mine / Visible / Ours sharing control.
- Added editable date, start time, end time, and all-day controls.
- Added deterministic one-hour default handling for single-time events.
- Improved color/category selection.
- Improved toggles, save button styling, delete icon styling, and bottom safe-area spacing.
- Converted the mobile editor sheet to a full-screen fixed panel.
- Added body/root scroll locking while the editor is open.
- Fixed inner scroll containment so the sheet feels stable on iPhone.
- Moved the bottom Delete/Save bar outside the scrollable content.
- Removed the old drag handle from the full-screen editor.
- Reduced the title input size.
- Replaced the default browser blue focus ring with the sage focus style.
- Fixed title input padding and top-row vertical alignment.

The timeline main page was not the target of this redesign. The work focused on the event editor opened from event creation or editing.

## 8. Floating Island Create Actions

The old two-button mobile creation flow was simplified.

Completed work includes:

- Removed the separate `+ Me` and `+ Both` external creation buttons.
- Added a single cream floating island for creation actions.
- Kept a primary `+ New` action.
- Kept the sparkle AI creation entry point.
- Defaulted normal creation to the personal boundary state, with the editor responsible for changing the For setting.

This reduces duplicated creation logic now that the event editor itself owns the boundary choice.

## 9. AI Event Input Work Completed

AI-assisted event creation is wired into the same draft-to-editor flow.

Completed work includes:

- Text input parsing through Volcengine Ark / Doubao.
- Image and screenshot parsing through the same event draft pipeline.
- Parsed drafts open in the existing event editor for user confirmation.
- Mobile/PWA image parsing timeout was increased so slow normal-mode parsing does not immediately fall back to a generic image event.
- Temporary image debug instrumentation was used during diagnosis and later removed after testing.

Voice input is not implemented yet because the speech-to-text service has not been selected.

## 10. Current Production Status

Current live app:

https://withfig.app/

Current project state:

- Main branch is deployable to Vercel.
- Latest production deployment is reachable through the new custom domain.
- The user has confirmed the domain opens the app.
- Email verification for the domain purchase has been completed.
- WWW redirect has been added and verified.
- PWA testing on the new domain is the next hands-on validation step.

## 11. Known Gaps

Important remaining work:

- Full PWA test on iPhone from `https://withfig.app/`.
- Full regression pass for login, create, edit, drag, resize, delete undo, invites, realtime refresh, Week View navigation, and Find Time Together.
- Voice input selection and implementation.
- ICS import/export.
- Real settings flows for Profile entries such as categories, notifications, calendar sync, and privacy.
- Onboarding and empty states for first-time users.
- Accessibility pass.
- Offline polish beyond the current shell/offline fallback.
- App Store readiness work: legal/name availability, screenshots, copy, privacy policy, support URL, and Apple Developer account preparation.

## 12. Recent Commits

Recent checkpoint commits include:

- `4e56413` - Adopt Fig boundary language
- `de22c93` - Rename public app surfaces to Fig
- `b4da242` - Document withfig production domain setup

This log should serve as the next GitHub-visible checkpoint after the domain and brand transition.
