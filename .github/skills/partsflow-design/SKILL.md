---
name: partsflow-design
description: Improve and review the PartsFlow web app UI with a restrained, professional ERP design system. Use for UI audits, visual redesigns, responsive polish, accessibility improvements, and frontend presentation changes while preserving existing business behavior and data.
---

# PartsFlow Design Skill

## Mission

Make PartsFlow feel like a thoughtfully designed, production-ready inventory and operations system—not a generic AI-generated dashboard. Favor clarity, speed, consistency, and trustworthy data presentation over decoration.

## Non-negotiable project safeguards

- Never commit directly to `main`. Work on a clearly named feature branch and open a pull request for the owner to review and merge.
- Keep changes scoped to the requested task. Prefer small, reviewable diffs.
- Preserve existing data, database schema, Supabase configuration, authentication, authorization, routes, API contracts, validation, calculations, inventory rules, and user workflows.
- Do not remove, rename, reorder in a meaning-changing way, or hide fields, actions, columns, statuses, or information unless the user explicitly requests it.
- Do not replace real data with mock data, add fake metrics, or make up loading/success states.
- Do not add a dependency or run a migration for a visual-only task unless explicitly approved.
- If a requested visual change could affect behavior or data comprehension, explain the risk and choose the least invasive option.
- Never claim a build, test, deployment, or visual check passed unless it was actually run and observed.

## Visual direction

### Core character
- Professional, calm, practical, and human-crafted; appropriate for daily warehouse, stock, purchasing, and operations work.
- Use a restrained white, neutral gray, and light-to-medium blue palette. Avoid purple hues and very dark navy as the dominant accent.
- Prefer solid surfaces, clear borders, subtle depth, and purposeful emphasis.
- Avoid gratuitous gradients, glassmorphism, glowing effects, excessive blur, oversized rounded cards, decorative blobs, emoji-as-interface-icons, and shadows on every element.
- Use existing brand assets and icon libraries already in the project. Do not mix unrelated icon styles.

### Layout and hierarchy
- Establish a clear page title, concise supporting context when useful, then primary actions and task content.
- Keep spacing systematic and compact enough for real operational work. Avoid both cramped controls and oversized empty areas.
- Align labels, inputs, buttons, totals, and table columns deliberately.
- Use consistent container widths, gutters, section gaps, and alignment across pages.
- Keep important actions discoverable without competing with the data.
- Prefer simple panels and dividers over nesting cards inside cards.

### Typography
- Use the existing project font unless there is a clear, approved reason to change it.
- Build a small, consistent type scale for page titles, section headings, body text, labels, metadata, and tabular values.
- Maintain readable Thai and Latin text, appropriate line-height, and clear numeric alignment.
- Avoid tiny low-contrast helper text, overly bold body copy, and inconsistent font weights.

### Color and state
- Use color semantically: blue for primary actions and selected states; neutral colors for supporting UI; distinct, accessible colors for success, warning, error, and informational states.
- Never communicate status by color alone; retain text, icon, or another clear cue.
- Ensure text and controls have sufficient contrast in normal, hover, focus, disabled, and error states.
- Keep the same meaning for a color across all pages.

### Tables and inventory data
- Treat tables and operational data as first-class UI, not decoration.
- Preserve every existing field and action unless the user explicitly requests a change.
- Use clear column headers, consistent row heights, readable numbers, sensible alignment, and restrained row separators or zebra striping.
- Avoid excessive cell padding that forces unnecessary horizontal scrolling.
- On mobile, choose a deliberate responsive strategy (responsive columns, horizontal scrolling, or an existing card treatment) without silently dropping information.
- Make empty, loading, error, and no-results states clear and consistent when those states already exist.

### Forms and actions
- Group related fields and use consistent label, input, help text, validation, and spacing patterns.
- Make primary, secondary, destructive, and disabled actions visually distinct.
- Keep buttons aligned with the related form or workflow; preserve submit behavior and validation.
- Make focus states visible and ensure controls are usable by keyboard and touch.
- Avoid changing button labels, confirmation behavior, or save semantics as part of a visual-only pass.

### Navigation and responsive behavior
- Keep active navigation states clear but restrained.
- Maintain a consistent shell, page padding, and heading hierarchy across screens.
- Test narrow mobile widths, tablet widths, and desktop layouts. Check for clipping, overlapping controls, unreadable tables, off-screen actions, and awkward line wrapping.
- Prefer responsive layout changes over shrinking everything uniformly.
- Keep touch targets comfortably usable and preserve access to all existing functions.

## Workflow

1. **Understand before editing**
   - Inspect the relevant page, shared layout, theme/style entry points, and existing component conventions.
   - Trace the current UI state and user actions enough to avoid changing behavior accidentally.
   - Identify shared styles that may affect unrelated pages.
2. **Audit**
   - Note hierarchy, spacing, alignment, typography, color, component consistency, responsiveness, accessibility, and data visibility.
   - Prioritize issues by user impact rather than novelty.
3. **Plan**
   - State the intended visual changes and list what will remain untouched.
   - Prefer existing components and design tokens; avoid broad global selectors if a scoped rule is safer.
4. **Implement**
   - Make the smallest coherent change.
   - Reuse established components, tokens, and icon packages.
   - Avoid one-off styling when a shared pattern is appropriate, but do not force unrelated pages into an unsuitable abstraction.
5. **Verify**
   - Run available lint, type-check, build, and relevant tests when the environment supports them.
   - Inspect desktop and mobile views if a browser or preview is available.
   - Check console/build output where possible.
   - Review the diff for accidental behavior, content, dependency, or data changes.
   - Clearly disclose checks that could not be run.
6. **Deliver**
   - Open a pull request targeting `main`; never merge it on the user's behalf unless explicitly instructed.
   - Summarize changed files, visual impact, behavior intentionally preserved, checks performed, and any known limitations.
   - Provide a verified preview URL only if one is actually available.

## Definition of done

- The page feels consistent with the PartsFlow visual direction.
- Content and operational information remain complete and understandable.
- Existing interactions and business logic remain unchanged.
- Desktop and mobile layouts are considered.
- Contrast, focus, and control states are usable.
- The diff is scoped, understandable, and free of unrelated edits.
- Validation status is reported honestly.
- Work is available through a reviewable pull request, not a direct commit to `main`.

## Review checklist

- [ ] No purple-heavy palette, gratuitous gradients, excessive rounding, or decorative effects.
- [ ] Page title, actions, and data have a clear visual hierarchy.
- [ ] Spacing, typography, colors, controls, and icons are consistent.
- [ ] All original data, fields, actions, and statuses remain present.
- [ ] Tables remain readable and usable on small screens.
- [ ] Keyboard focus, contrast, and state feedback are clear.
- [ ] No database, API, auth, route, or business-logic changes in a visual-only task.
- [ ] Relevant checks were run, or unavailable checks are disclosed.
- [ ] Changes are on a feature branch and a PR is open for owner review.
