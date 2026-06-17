# HappyDoggy PRD

## 1. Product Summary

HappyDoggy is a private minimalist calendar app for web and iPhone browser usage. It is designed for a very small group of users, around 5 people, with a focus on fast timeline-based scheduling and intimate shared calendar views.

The core idea is that users do not create events by filling out traditional calendar forms first. Instead, they directly select time on a daily timeline, then quickly adjust event details such as title, color, category, and participants.

The first version will focus on the daily view and shared two-person scheduling experience. The sharing model is designed for couples or close relationships: users in an active relationship can see each other's full schedule by default, while individual events can still be marked private when needed.

## 2. Target Users

- Primary user: the owner of the app.
- Secondary users: invited close users, around 5 total accounts.
- Usage context:
  - Personal planning.
  - Study, life, date, work, appointment, and shared schedule coordination.
  - Mobile usage on iPhone through browser or PWA.
  - Desktop usage through web browser.

## 3. Goals

### 3.1 Product Goals

- Provide a simple, beautiful, fast daily scheduling experience.
- Let users create events by selecting time directly on a timeline.
- Let users in a close relationship see each other's full schedule by default.
- Let users mark specific events as private.
- Show two users' daily schedules side by side.
- Show shared events across the center of both users' columns.
- Sync data across devices through the cloud.

### 3.2 MVP Goals

- Support email and password login.
- Support a daily timeline from 00:00 to 24:00.
- Use 15-minute scheduling granularity.
- Allow drag-to-create events.
- Allow basic event editing.
- Allow events to be public within the relationship by default.
- Allow events to be marked private.
- Allow comparing the current user and one selected person in a split daily view.
- Store data in the cloud.

### 3.3 Non-Goals For MVP

- Public registration for unknown users.
- Large-scale social features.
- Complex enterprise permissions.
- AI scheduling.
- Native iOS App Store release.
- Full offline-first behavior.
- Advanced recurring events.
- Calendar import/export.

## 4. Platforms

### 4.1 Initial Platform

- Responsive Web App.
- Optimized for:
  - Desktop browsers.
  - iPhone Safari.

### 4.2 Later Platform

- PWA support:
  - Add to iPhone home screen.
  - App-like full-screen usage.
  - Basic cached shell for faster loading.

Native iOS development is not planned for MVP unless the web/PWA experience proves insufficient.

## 5. Core User Stories

### 5.1 Authentication

- As a user, I can log in with email and password.
- As a user, I can stay logged in on my device.
- As the app owner, I can limit access to invited users only.

### 5.2 Daily Timeline

- As a user, I can view my full day from 00:00 to 24:00.
- As a user, I can drag on the timeline to select a time range.
- As a mobile user, I can intentionally enter event creation mode without fighting page scroll.
- As a user, I can create an event from the selected range.
- As a user, I can create events aligned to 15-minute intervals.
- As a user, I can tap or click an event to edit it.
- As a user, I can drag an event to change its time.
- As a user, I can resize an event to change its duration.

### 5.3 Event Editing

- As a user, I can set an event title.
- As a user, I can choose an event category.
- As a user, I can choose an event color.
- As a user, I can mark an event as private.
- As a user, I can choose whether an event is shared-visible within my relationship.
- As a user, I can delete an event I created.

### 5.4 Shared Calendar

- As a user, I can choose another user to compare schedules with.
- As a user, I can see my schedule on the left side.
- As a user, I can see the selected user's schedule on the right side.
- As a user, I can see events involving both users spanning the center area across both sides.
- As a user, I can see the other person's non-private events by default if we have an active relationship.
- As a user, I cannot see the other person's private events.
- As a user, I can distinguish personal events from shared events visually.

### 5.5 Cloud Sync

- As a user, I can see the same schedule on desktop and iPhone.
- As a user, I can update an event on one device and see it reflected on another device.
- As a user, I can see events shared with me after they are created or updated.

## 6. MVP Feature Requirements

### 6.1 Login

Required:

- Email/password login.
- Logout.
- Session persistence.
- Only authorized users can access app pages.

Preferred implementation:

- Supabase Auth.
- Invitation or admin-created accounts for MVP.

### 6.2 Daily View

Required:

- Default view after login is the daily timeline.
- Timeline range: 00:00 to 24:00.
- Time slot granularity: 15 minutes.
- Current date selector.
- Previous day and next day navigation.
- Today shortcut.
- Vertical scrolling timeline.
- Time labels on the left.
- Event blocks positioned according to start and end time.

Interaction requirements:

- Desktop:
  - Click and drag empty timeline area to create an event.
  - Drag event body to move event.
  - Drag top or bottom handle to resize event.
- Mobile:
  - Normal vertical swipe scrolls the timeline.
  - Long-press on empty timeline space enters create mode.
  - After create mode starts, vertical drag selects the event time range.
  - Tap event to open editor.
  - Drag event body to move event only after a short press/hold or from an explicit edit state.
  - Resize behavior may be simplified for MVP if needed, but it must not conflict with normal page scrolling.

Gesture decision for MVP:

- Use long-press to disambiguate mobile event creation from page scrolling.
- Long-press threshold target: 350-500 ms.
- While creating an event on mobile, prevent page scroll only after creation mode has started.
- Provide a visible creation preview before committing the event.
- Cancel creation if the selected duration is less than 15 minutes.
- A future "new event mode" toggle can be added later if long-press testing feels unreliable on iPhone Safari.

### 6.3 Event Model

Each event must support:

- id
- title
- start_at stored in UTC
- end_at stored in UTC
- timezone for the event's original scheduling context, default Asia/Hong_Kong
- date-derived display position
- color
- category
- owner_user_id
- visibility
- participant_user_ids for events both users actively participate in
- is_all_day
- created_at
- updated_at

Optional in MVP:

- notes
- location
- spans_midnight display metadata can be derived from start_at and end_at

Deferred:

- recurrence
- reminders
- attachments

### 6.4 Categories

Initial categories:

- Life
- Study
- Date
- Work
- Health
- Other

Categories should be editable later, but fixed categories are acceptable for MVP.

Schema requirement:

- Store category as a string, not as a database enum.
- This keeps future custom categories easy to add without database constraint migrations.

### 6.5 Colors

Required:

- Quick color selection from a small palette.
- Color visible on the event block.

Suggested palette:

- Blue
- Green
- Yellow
- Pink
- Red
- Gray

### 6.6 Shared View

Required:

- User can select one comparison user.
- Main daily view is split into two vertical columns:
  - Left: current user.
  - Right: selected user.
- Current user's private events appear only in the left column.
- Selected user's non-private events appear in the right column when there is an active relationship.
- Events involving both users span across the two columns.
- Shared events should appear visually centered and wider than personal events.
- Overlapping events must be laid out deterministically within their display lane.
- Private, relationship-visible, and participant-shared events may overlap in time and must not visually cover each other.

Visibility rule for MVP:

- A user can see:
  - Events they own.
  - Non-private events owned by users in an active relationship with them.
  - Events where they are explicitly listed as a participant.
  - Events shared-visible within their relationship.
- A user cannot see another user's private events unless they own the event.

### 6.7 Event Collision Layout

Event layout must handle overlapping events inside the same visual lane.

Visual lanes:

- Current user's lane.
- Selected user's lane.
- Shared center lane for events involving both displayed users.

Collision rule:

- Events overlap if their rendered local-time segments intersect.
- Events that touch exactly at a boundary do not overlap. For example, 10:00-11:00 and 11:00-12:00 are not overlapping.
- Collision detection runs after cross-midnight events are split into render-time segments.
- All-day events are excluded from timed collision layout and appear in the all-day area.

Layout algorithm requirement:

- For each lane and rendered day, group overlapping timed event segments into collision groups.
- Assign each event segment a column index within its collision group.
- Assign each event segment a total column count for that group.
- Calculate width as available lane width divided by total column count.
- Calculate horizontal offset from column index.
- Preserve stable ordering by start time, then duration, then event id.

Shared center lane behavior:

- Events involving both displayed users render in the shared center lane.
- If a shared event overlaps a private or relationship-visible event in a side lane, both remain visible because they are in different lanes.
- If multiple shared events overlap each other, they are columnized within the shared center lane.

Phase 1 requirement:

- Build this layout algorithm against mock data before Supabase integration.
- Include examples covering:
  - Two overlapping personal events.
  - Three partially overlapping personal events.
  - One personal event overlapping one shared event.
  - Cross-midnight event segment overlapping a normal event.

### 6.8 Sync

Required:

- Store users and events in a cloud database.
- Fetch events for selected date.
- Save create/update/delete operations to cloud.
- Refresh UI after mutations.
- Store event start_at and end_at in UTC.
- Render event times using the client's selected or detected timezone.
- Default timezone should be Asia/Hong_Kong.
- Keep a timezone conversion layer in code even if MVP users are initially in the same timezone.

Preferred:

- Supabase database.
- Supabase Row Level Security.
- Supabase Realtime can be added after the first working version.

## 6.9 Timezone And Date Boundary Rules

### 6.9.1 Timezone Storage

Required:

- All event timestamps must be stored as UTC.
- start_at and end_at must never be stored as local-time-only values.
- The client should render events according to the active display timezone.
- The default display timezone is Asia/Hong_Kong.
- Users may later have different timezones, such as one user in the United States and another in Mongolia.

Implementation guidance:

- Introduce a small timezone utility layer early.
- Avoid spreading date conversion logic across UI components.
- Store the user's preferred timezone in profile settings when profile editing is added.
- For MVP, if profile settings are not built yet, use Asia/Hong_Kong as the default and the browser timezone as an optional display override.

### 6.9.2 All-Day Events

All-day events must be explicitly represented instead of inferred from 00:00 to 24:00.

Required fields:

- is_all_day boolean.
- start_at UTC.
- end_at UTC.

Display rule:

- All-day events appear in a pinned all-day area above the hourly timeline.
- They should not consume the full 00:00 to 24:00 vertical timeline height.

### 6.9.3 Cross-Midnight Events

Cross-midnight events are events where the local rendered start date and end date are different.

Examples:

- 22:00 to 02:00.
- 23:30 to 01:00.

MVP display rule:

- On the start date, show the segment from start time to 24:00.
- On the next date, show the segment from 00:00 to end time.
- Use a subtle visual continuation indicator for split segments.
- Editing the event should still edit one event, not two separate events.

Data rule:

- Do not duplicate cross-midnight events in the database.
- Store one event with one start_at and one end_at in UTC.
- Split only at render time.

## 7. Future Feature Requirements

### 7.1 Week View

- Show seven days horizontally.
- Show events in compressed daily columns.
- Tap a day to enter daily view.

### 7.2 Month View

- Show month grid.
- Show compact event indicators.
- Tap date to enter daily view.

### 7.3 Year View

- Show year overview.
- Highlight days with events.
- Tap month/day to navigate.

### 7.4 PWA

- Installable web app.
- App icon.
- Splash screen.
- Mobile full-screen display.

### 7.5 Notifications

- Event reminders.
- Shared event update alerts.
- Browser notification support.

## 8. Data Design Draft

### 8.1 users

Managed by authentication provider.

Additional profile table:

- id
- email
- display_name
- avatar_url
- created_at

### 8.2 events

- id
- owner_user_id
- title
- start_at stored as UTC timestamptz
- end_at stored as UTC timestamptz
- timezone string, default Asia/Hong_Kong
- category string
- color
- visibility string, default relationship
- is_all_day boolean, default false
- notes
- created_at
- updated_at

Schema requirements:

- category must be stored as a string, not an enum.
- visibility must be stored as a string, not an enum.
- start_at and end_at must be stored as timestamp-with-timezone values normalized to UTC.
- timezone stores the event's original scheduling context or intended display context.
- Cross-midnight behavior is derived from start_at and end_at at render time, not stored as duplicate rows.

### 8.3 event_participants

- id
- event_id
- user_id
- role
- created_at

Role examples:

- owner
- participant

Purpose:

- Use this table for events that both users actively participate in.
- Participant status affects display placement, such as spanning across both columns.
- Visibility is not primarily controlled by this table in the relationship-sharing model.

### 8.4 user_relationships

Required for MVP and central to Row Level Security:

- id
- user_id
- related_user_id
- status
- relationship_type
- created_at
- updated_at

Status examples:

- active
- pending
- blocked

Relationship type examples:

- partner
- close_friend
- family

RLS requirement:

- This table is the core basis for relationship-level visibility.
- If two users have an active relationship, they can see each other's non-private events.

Implementation note:

- Use reciprocal rows for MVP.
- When user A and user B have an active relationship, store one row from A to B and one row from B to A.
- This creates slight redundancy but keeps RLS policies simple and easier to audit.
- RLS can check a single direction: user_relationships.user_id = auth.uid() and user_relationships.related_user_id = events.owner_user_id and status = active.
- Keep a uniqueness constraint on (user_id, related_user_id) to prevent duplicate relationship rows.

Relationship count decision:

- MVP supports multiple active relationships per user.
- The comparison user selector lists all active related users.
- This supports the 5-person private-group case while preserving the same RLS model.
- The UI still compares the current user with one selected related user at a time.

### 8.5 Event Visibility

Event visibility should be stored as a string to allow future expansion.

Suggested values:

- relationship
- private

MVP default:

- relationship

Meaning:

- relationship: visible to the owner and active related users.
- private: visible only to the owner.

## 9. Permission Rules

### 9.1 Event Read

A user can read an event if:

- The user is the event owner.
- The event visibility is relationship and the event owner has an active relationship with the user.
- The user exists in event_participants for that event and the event is not private from that user.

Private event rule:

- If visibility is private, only the owner can read it.

### 9.2 Event Create

A logged-in user can create events where:

- owner_user_id is the current user.
- visibility is either relationship or private.
- participants, if present, refer only to users with an active relationship or otherwise allowed by future sharing rules.

### 9.3 Event Update

MVP rule:

- Event owner can update all fields.
- Related users can view non-private events but cannot edit unless later enabled.
- Participants can view but not edit unless later enabled.

Possible later rule:

- Shared participants can edit shared events.
- Active relationship users can edit each other's non-private events.

### 9.4 Event Delete

MVP rule:

- Only event owner can delete the event.

## 10. UX Principles

- Minimalist, quiet, and direct.
- Timeline first, forms second.
- Fast color and category edits.
- No heavy dashboard feel.
- No unnecessary onboarding.
- The daily view should feel like the product's home.
- Mobile interactions should be large enough for fingers.
- Text should be sparse and functional.

## 11. UI Structure Draft

### 11.1 Logged Out

- Centered login panel.
- Email input.
- Password input.
- Login button.

### 11.2 Logged In

Main layout:

- Top bar:
  - Date controls.
  - Today button.
  - Comparison user selector listing active related users.
  - Logout button.
- Main area:
  - Full-day vertical timeline.
  - Left schedule column.
  - Right schedule column.
  - Shared event layer spanning both columns.
- Event editor:
  - Opens as modal or bottom sheet.
  - Title input.
  - Category selector.
  - Color selector.
  - Participant selector.
  - Delete button.
  - Save button.

## 12. Technical Recommendation

### 12.1 Frontend

- Next.js
- React
- TypeScript
- CSS Modules or Tailwind CSS

### 12.2 Backend

- Supabase Auth
- Supabase Postgres
- Supabase Row Level Security
- Supabase Realtime after MVP base is stable

### 12.3 Deployment

- Vercel for frontend.
- Supabase for backend.

### 12.4 Local Development

- Project directory: E:\HappyDoggy
- Use environment variables for Supabase URL and anon key.
- Keep database schema in versioned SQL files.
- Keep timezone utilities isolated in a dedicated date/time module.

## 13. Development Phases

### Phase 1: Local Interactive Prototype

Purpose:

- Validate timeline interaction and shared layout before connecting cloud services.
- Prove the two highest-risk interaction pieces before broader feature work:
  - Mobile gesture disambiguation between timeline scrolling and event creation.
  - Deterministic collision layout for overlapping timed events.

Scope:

- Next.js app scaffold.
- Daily timeline UI.
- Mock users.
- Mock events.
- Desktop drag-to-create.
- Mobile long-press-to-create spike.
- Event collision layout spike.
- Event editor.
- Split shared view.

Phase 1 order:

- Build static daily split layout with mock events.
- Implement render-time event segmentation for normal and cross-midnight events.
- Implement collision layout for side lanes and shared center lane.
- Implement desktop drag-to-create.
- Implement mobile long-press-to-create and verify it does not break vertical scrolling.
- Add editor interactions after the layout and gesture model are stable.

### Phase 2: Supabase Integration

Scope:

- Supabase project setup.
- Auth integration.
- Database schema.
- Row Level Security.
- Relationship-based visibility policies.
- Real event CRUD.
- Cloud sync across devices.

### Phase 3: Mobile And PWA Polish

Scope:

- iPhone layout refinements.
- Touch interaction tuning.
- PWA manifest.
- App icon.
- Installable home-screen app.

### Phase 4: Calendar Expansion

Scope:

- Week view.
- Month view.
- Year view.
- Better navigation between views.

## 14. MVP Acceptance Criteria

The MVP is acceptable when:

- A user can log in with email and password.
- A user can view the current day timeline from 00:00 to 24:00.
- A user can create an event by selecting time on the timeline.
- On iPhone Safari, normal vertical swipe scrolls the timeline.
- On iPhone Safari, long-press on empty timeline space enters creation mode.
- Mobile event creation does not accidentally trigger during ordinary scroll.
- Created events snap to 15-minute intervals.
- A user can edit event title, category, color, and participants.
- A user can mark an event as private.
- A user can delete their own event.
- A user can select another user for comparison.
- Personal events display in the correct user's column.
- Shared events involving both selected users span across both columns.
- Overlapping events in the same lane are displayed side by side and do not cover each other.
- Overlapping shared events are columnized inside the shared center lane.
- Non-private events from an active related user are visible by default.
- Private events are visible only to the owner.
- All event timestamps are stored in UTC.
- Events render according to the active display timezone, defaulting to Asia/Hong_Kong.
- All-day events appear in a dedicated all-day area.
- Cross-midnight events render correctly across both affected days.
- Events are persisted in the cloud.
- The same account can see updated events on another device.
- The app is usable on iPhone Safari.
- user_relationships uses reciprocal rows.
- The comparison selector supports multiple active related users and compares one selected user at a time.

## 15. Open Decisions

Before or during development, these decisions should be confirmed:

- Should active relationship users be able to edit each other's non-private events, or only view them?
- Should categories be fixed in MVP, or user-customizable from the beginning?
- Should the timeline visually emphasize sleeping hours?
- Should event reminders be included in MVP or deferred?
- Should account creation be invite-only or manually managed by the owner?
