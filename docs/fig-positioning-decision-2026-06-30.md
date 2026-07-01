# Fig Positioning Decision

Date: 2026-06-30

This document turns the strategy log and brand narrative into a working product decision. It is intentionally short: the goal is to guide naming, domain selection, UI language, roadmap priority, and App Store positioning.

## 1. Decision

The product should move away from **HappyDoggy** as a public brand.

The working public brand should be:

**Fig**

The working product line should be:

**A quiet calendar for two.**

The primary user-facing promise should be:

**See each other's day. Find time together. Keep your own space.**

## 2. What Fig Is

Fig is a two-person time interface.

It helps two people see the shape of each other's day, understand shared availability, and coordinate time without repeatedly asking when the other person is free.

The product is centered on:

- A split-screen daily timeline
- Only Mine / Visible / Ours sharing boundaries
- Shared free-time discovery
- Low-friction event creation
- AI-assisted schedule input from text, screenshots, and future imports

## 3. What Fig Is Not

Fig should not become a broad relationship operating system.

Do not position Fig as:

- A relationship assistant
- A couples super-app
- A chores or grocery tool
- A date planner
- A family organizer
- A generic calendar replacement for teams
- A calendar aggregator whose main value is importing every external calendar

The product may eventually connect to external calendars, but the core value should remain the two-person timeline and boundary model.

## 4. First Target Market

Start narrow.

Primary early segments:

1. Long-distance and semi-long-distance couples
2. University and graduate-student couples
3. Young working couples with fragmented schedules

Do not start with families, friend groups, roommates, or teams. Those markets add permission complexity and dilute the product's emotional clarity.

## 5. Differentiation

The key competitor risk is looking like a lighter Cupla.

Fig should not compete by having fewer relationship modules. It should compete by being a different kind of product:

**Cupla:** manage your relationship.  
**Fig:** see each other's rhythm.

Fig's durable differentiation should be:

- Quietness: no dashboard, no scorekeeping, no relationship management layer
- Boundaries: Only Mine / Visible / Ours is central, not hidden in settings
- Time perception: the product shows rhythm, not only conflicts
- Focus: the timeline is the product, not one feature among many
- Input speed: AI and import features reduce manual entry friction

## 6. Naming Direction

Recommended public name:

**Fig**

Recommended App Store display style:

**Fig: Calendar for Two**

Recommended subtitle:

**See each other's day.**

Avoid:

- HappyDoggy as a public name
- Cupla-like names
- Generic names such as Couple Calendar
- Names that imply therapy, relationship coaching, or emotional scoring

## 7. Product Language

Use these terms consistently:

| Concept | Preferred language | Avoid |
| --- | --- | --- |
| Product | calendar for two | couples calendar, relationship app |
| Main view | split-screen timeline | partner dashboard |
| Sharing modes | Only Mine / Visible / Ours | private / public / shared as primary UI copy |
| Availability | find time together | check availability |
| Core feeling | rhythm | productivity, optimization |

Implementation implication:

The current Event Editor should keep its functional model while using **Only Mine / Visible / Ours** as the user-facing boundary language.

## 8. Domain Direction

Do not buy a HappyDoggy domain.

The selected production domain is:

**withfig.app**

Domain routing:

- https://withfig.app/ is the primary production URL.
- https://www.withfig.app/ redirects to https://withfig.app/.
- The legacy Vercel URL remains available as a fallback, but should not be used in public-facing copy.

Decision rationale:

- Short and brandable
- Reads naturally as an invitation to use Fig
- Avoids over-locking the product to the word calendar
- Works well for PWA and eventual App Store positioning

## 9. Roadmap Implications

Near-term product work should reinforce the positioning instead of adding broad modules.

Priority order:

1. Rename product surfaces from HappyDoggy to Fig after the positioning is confirmed.
2. Replace sharing copy with the boundary model language where appropriate.
3. Remove temporary debug instrumentation and outdated README wording.
4. Polish the split-screen timeline and event editor until they feel native and distinct.
5. Build import/parsing flows that reduce manual schedule entry.
6. Add onboarding that teaches the split-screen timeline and Only Mine / Visible / Ours model.
7. Run a side-by-side visual similarity audit against Cupla before public launch.

Deprioritize:

- Chores
- Groceries
- Wishlists
- Date planning
- Relationship advice
- Mood tracking
- Large group scheduling

## 10. Open Questions

These are still unresolved and should be answered before preparing App Store assets:

1. Is **Fig** legally available enough for the intended launch markets?
2. Should the Chinese-facing name translate Fig literally, phonetically, or use a separate concept?
3. Should the first launch be English-only, Chinese-only, or bilingual?
4. Should App Store screenshots emphasize long-distance couples, student couples, or young working couples first?

## 11. Current Recommendation

Proceed with Fig as the working product identity.

The production domain is now purchased and configured at https://withfig.app/. Keep the product narrow while validating the identity and core timeline experience.

Do not broaden the product. The narrowness is the advantage.
