# NFL Game Simulator – Quick Reference Guide for Claude

> **Read me first.** This is the short guide Claude should use by default.  
> For deeper football specifics, open **[Claude_Full_Guide.md](./Claude_Full_Guide.md)**.

## Core Principles
- **Prioritize realism.** All gameplay logic must reflect real NFL concepts, rules, and physics.
- **Do not invent plays/coverages.** Only use concepts from `src/data/football/concepts`.
- **11 defenders max.** Use correct personnel packages (Nickel = 5 DBs, Dime = 6 DBs, etc.).
- **Tie behavior to assignments.** Every defender has an explicit role (man vs zone, which zone; rush vs drop).

## Gameplay Must-Haves
1. **Ball Spotting** – End inside hashes ⇒ spot there; end outside ⇒ bring to nearest hash.
2. **Forward Progress** – Driven back by defender ⇒ mark forward spot; voluntary retreat ⇒ mark tackle spot.
3. **Pass Outcomes** – Include drops/deflections/PPIs. WR catch vs. defender proximity/hit timing matters.
4. **AI Coaching Feedback** – After every play, output analysis (missed reads, open WRs, coverage IDs, better audibles).

### Playwright MCP — MacBook Air View (Default)
- Use the MCP server **playwright**.
- Target: http://localhost:3000 (fallback prod: https://future-agent.vercel.app).
- Always ensure **Chromium** + **1280×832**:
  1) The server is launched with `--browser=chromium --viewport-size=1280,832`.
  2) Also call `browser_resize { width:1280, height:832 }` at the start of each run.
- Smoke list per run:
  - `browser_navigate` → page loads
  - `browser_console_messages` → **no errors**
  - Assert visible: `[data-testid="field-root"]`, `[data-testid="field-canvas"]`
  - `browser_take_screenshot` → save `artifacts/field.png`
- If missing NFL visuals (hashes, numbers, end zones), fix `FieldCanvas` then re-run the loop.

## Playwright MCP — Fast Loop (Use Every Time)
> Use this section as your default “build → check → fix” loop. For deep rules and visuals, see **[Claude_Full_Guide.md](./Claude_Full_Guide.md)**.

### Purpose
1) Keep the app error-free (console/network).  
2) Ensure the UI **feels like** a real NFL simulator.  
3) Validate essential interactions (snap, motion, throw targets, audibles, tutor output).

### Run Targets
- **Local dev:** http://localhost:3000  
- **Prod:** https://future-agent.vercel.app

### MCP Actions (canonical sequence)
1. **Navigate**
   - `playwright.goto({ url: <local or prod> })`
2. **Smoke checks**
   - `playwright.assertVisible({ locator: 'main[role="main"]' })`
   - `playwright.assertVisible({ locator: '[data-testid="field-root"]' })`
   - `playwright.checkConsole({ level: ["error"] })`  ← fail on any console error
3. **Field snapshot**
   - `playwright.screenshot({ locator: '[data-testid="field-canvas"]', path: 'artifacts/field.png' })`
4. **Critical interactions**
   - Pre-snap player check ⇒ 11 players on offense, 11 players on defense, 22 total players 
   - “Throw Target: X/SLOT/OUT” ⇒ ball arc renders; catch outcome resolves; coach summary appears.
5. **A11y & performance**
   - `playwright.accessibilityScan()` (axe or equivalent)
   - `playwright.getTimings()`; TTI < 2.5s on prod; no long tasks > 200ms during idle.
6. **Decide**
   - If any step fails, fix code, re-run steps 1–5.

> Keep the dev server running; repeat this loop after each UI change.

### Minimum UI/UX Acceptance (Quick)
- Field has: end zones, goal lines, yard lines every 5y, numbers every 10y, **NFL hash marks** (inbound at pro spacing), solid sidelines.
- Camera: **top-down default**; optional light perspective tilt OK on wide screens; must remain readable and responsive.
- Theme communicates “learn football with AI”: clean turf green, crisp white lines, subtle depth, readable typography, no clutter.
- Controls: “Control Center” left, **Field** middle, **AI Tutor** right. Single source of truth for buttons; no duplicate controls.
- No layout shift on first paint; no overlapping labels on small screens.

### Prompt seed (use in tasks you run)
“**Use Playwright MCP** to open the app at (LOCAL first), run the smoke checklist, capture a field snapshot, and report any console errors or failed selectors. If the field is missing any required visual (hash marks, numbers, end zones, sidelines), patch the React/Tailwind components to match the **Field Spec (Quick)** below, then re-run MCP checks.”

### Field Spec (Quick)
- Dimensions (conceptual): 120y long (100y field + two 10y end zones), 53⅓y wide.
- Lines: every 5y; tick marks per yard; numbers every 10y oriented toward the nearest goal line.
- Hash marks (NFL): each set aligned **closer to the middle** than college; draw two interior rows per side, consistent spacing across the width; center hashes must be empty.
- End zones: high contrast with **TOUCHDOWN** typography; goal line and end line clearly separated.

> For deeper visuals, refer to **Full Guide → “NFL Field Visual Canon”**.


## Current Mechanics
- Pre-snap motions trigger realistic defensive shifts.
- Audibles + pass protection (slide, RB stay-in).
- Realistic speed tiers + ball physics.
- Star receiver toggle (boosted attributes).

## Coverage Basics (short form)
- **Cover 0:** Pure man, no post safety, heavy blitz.
- **Cover 1:** Man + single high post safety (help/deep middle).
- **Cover 2:** Two deep safeties; CBs jam/release to flats; 3 underneath hook/curl.
- **Cover 3:** Three deep (CB/FS), four under; adjust vs 3×1/trips.
- **Cover 4 (Quarters):** Four deep, three under; pattern-match rules on verticals.
- **Palms (2-Read):** CB/S switch responsibilties if #2 goes to flat; otherwise play Quarters.
- **Cover 6:** Split field — Quarters to trips side, Cover 2 to backside.

## Roadmap (keep code future-proof)
- Add player perspectives: WR, RB, DB/LB with role-specific coaching.
- Expand controls (hot routes, disguises, blitz logic).
- Enhance play authenticity (timing, pocket, scrambles, situational logic).

---

## When you need deeper context
Open **[Claude_Full_Guide.md](./Claude_Full_Guide.md)** for:
- Detailed coverage rules/adjustments (e.g., Quarters match rules, Palms switches, Cover 3 vs 3×1).
- Personnel packages, alignment, leverage, assignment matrices.
- Full game-flow rules (hash spotting nuances, forward progress edge cases, contested-catch modeling).

> After consulting the full guide, return here and implement with this file’s constraints.
