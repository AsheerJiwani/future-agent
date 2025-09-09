# NFL Game Simulator – Full Development Guide (Reference)

> **Use this when you need depth.** For everyday coding, return to **[Claude.md](./Claude.md)**.

## Project Overview
AI-assisted NFL simulator (Vercel + GitHub). Users play QB with AI coaching.  
Long-term: perspectives for WR, RB, DB/LB with role-specific coaching.

## Current Features Implemented
- **Real NFL concepts** in `src/data/football/concepts` (routes, formations, coverages). No invented plays.
- **AI Coach** gives post-play breakdowns and improvement tips.
- **Core mechanics:** pre-snap motion, audibles & protection, realistic speed/ball physics, star WR toggle.

## Offensive Concepts (Reference)
- Use existing concepts (curls, slants, verts/“999”, shallow cross, mesh, flood, etc.).
- Respect progressions and timing relative to QB drop (3/5/7 or shotgun rhythm).
- Example (Trips Flood): #1 vertical clear, #2 deep out, #3 flat — stretch deep/curl/flat defenders.

## Defensive Concepts (Detailed)
### Cover 0 (All-Out Man)
- Pure man across; 0 deep safeties; heavy pressure (often 6).
- Typical press technique; high risk, quick-game answers are open if protection fails.

### Cover 1 (Man-Free)
- Man across with **single high** safety (middle-of-field help).
- Variants: robber (safety/underneath lurk), spy (LB on QB). Rush usually 4–5.

### Cover 2 (Zone)
- Two deep halves (safeties); CBs jam/release to flats; 3 underneath hook/curl.
- **Tampa-2**: MLB runs the deep middle to reduce hole-shot between safeties.

### Cover 3 (Zone)
- Three deep (outside thirds by CBs + post safety middle third); four under.
- Underneath: curl-flat on each side + two hooks.
- **Vs 3×1**: rotate/roll; cloud to trips; backside can be man/lock to preserve three deep integrity.

### Cover 4 (Quarters / Match)
- Four deep, three under. Pattern-match rules:
  - CB takes #1 vertical; if #1 under, zone off and help inside.
  - Safety reads #2: vertical past ~10–12 ⇒ take in man; otherwise rob/double #1.
  - Mike helps carry #3 vertical in 3×1 until safety wins leverage.
- Strengths: deep coverage + run fit from safeties; Weakness: underneath spacing (only 3 under).

### Palms (2-Read / Trap)
- If #2 goes quickly to flat: CB jumps #2, Safety takes #1 vertical.
- If #2 vertical: play Quarters rules.

### Cover 6 (Quarter-Quarter-Half)
- Quarters to trips side; Cover 2 to single-WR side.
- Ensure assignment hand-offs are consistent at the split-field boundary.

## Personnel & Assignment Integrity
- **Never > 11 defenders.** Swap personnel for Nickel (5 DBs), Dime (6 DBs), etc.
- Explicit role mapping per defender each snap, e.g.:
  - `RCB: deep right third` | `Nickel: curl-flat left` | `Will: man on RB` | `FS: post middle third`
- Prevent overlapping zones; ensure every deep/under zone is owned; preserve rush integrity.

## Pocket & Line Play (OL/DL) — Canon

> This section defines how the **pass pocket** looks/behaves, plus pre-snap setups and post-snap actions for every OL/DL, including **Center double-team & scan** rules. Use this to drive both animation and collision/engagement logic.

### 1 Pocket Concept (what “real” should feel like)
- **Shape:** A convex, elliptical **envelope** centered on the QB’s depth. Tackles shape the **arc** on the edges; interior (C/LG/RG) forms the **apex** in front of the QB.
- **Dynamic:** The envelope **breathes**—it expands briefly on the set, then **compresses gradually** under pressure.
- **Contain:** Tackles keep rushers **outside the arc**; guards/center stop direct **A/B-gap** displacement.
- **Outcome constraint:** A **single defender** breaches the pocket **first**; a second might arrive but **staggered**.  
  - **Target sack timing:** **3–10s** after snap. (Tune per play speed, protection, and QB depth; default 2.8–4.0s feel fast, >6s rare.)

**Implementation hooks**
- Maintain a `pocketEnvelope` (SVG path or Canvas poly) recomputed each tick from OL set points and QB position.
- Apply a **pressure factor** that narrows the envelope ~10–25% over time as DLs win leverage.

---

### 2 Pre-Snap Setup (by position & formation)

#### QB alignment
- **Dropback:** Under center at LOS pre-snap; perform **3- or 5-step** drop (≈1.2s / 1.8s) to reach launch depth.
- **Shotgun:** Pre-aligned **5–7 yards** behind LOS; small settle step only.

#### RB alignment (depends on QB)
- **Dropback:** RB **behind QB** at ≈**7y** depth, centered unless formation calls offset.
- **Shotgun:** RB **offset**: ≈ **(QB depth + 1–1.5y)** and **1.5–2y lateral** (left or right).

#### OL base splits & stance
- **Positions:** LT–LG–C–RG–RT on LOS; slight stagger for tackles.
- **Set landmarks (conceptual, to seed animations):**
  - **Tackles:** Kick to an **outside arc** (wider, deeper set angle).
  - **Guards:** Shorter set, vertical anchor inside.
  - **Center:** Quick vertical set; eyes up for help/scan.

#### DL fronts (examples)
- **4-down:** EDGE(LEO)/DE outside, 3-tech/1-tech inside.
- **Odd/over/under:** Respect declared **A/B/C gap** rush lanes.

---

### 3 Protection Schemes (assignment logic)

> Encode assignments so animations and collision checks read the same source of truth.

- **Man:**  
  LT↔EDGE, LG↔DT, C↔NT/most dangerous A, RG↔DT, RT↔EDGE.  
  RB/TE as configured (chip/stay/release).
- **Slide Left / Slide Right:**  
  Line steps to call; each OL owns the **near gap** in slide direction. **Backside tackle** often man on EDGE.
- **Half-Slide (L/R):**  
  Slide on call side; **backside** (G/T) play **man**.
- **Max Protect:**  
  TE and/or RB stay; TE helps tackle on his side; RB **scans inside→out** (LB → DB).

---

### 4 Center Rules — Double-Team & Scan (authoritative)
- **ID & declare:** Center identifies the **MIKE** / primary threat pre-snap (internal; no UI required).
- **Dual read:** On snap, Center takes **near A-gap** threat; if light, he **helps** (double-team) the **most stressed guard**.
- **Help rules (priority):**
  1. Aid whichever guard is losing **vertical push** fastest.
  2. If both stable, **scan** to RB’s side for an **A→B** inside threat.
  3. If a **stunt/twist** occurs, pass off penetrator, **catch the looper**.
- **Release:** If an LB green-dogs (adds late), Center can **peel** to pickup per scan side.

**Simplified sim logic**
- For each tick, compute per-OL **stress** (DL leverage, depth loss). Center picks the **max-stress neighbor** to assist unless an A-gap threat exceeds a threshold.

---

### 5 Post-Snap Actions & Animations

#### Offensive Line (each LT/LG/C/RG/RT)
- **Set:** Move to **set point** based on scheme; face threat.
- **Engage:** Once in contact radius, reduce DL forward speed by an **engagement factor**.
- **Mirror & anchor:** Tackles widen & ride outside arc; guards set vertical anchor; Center applies help/scan rules above.
- **Pass-off (stunts):** If penetrator crosses face and a looper replaces, **handoff** assignment; update animation target and engagement.
- **Recover:** If displaced, re-anchor toward pocket boundary rather than straight line back (prevents teleporting).

#### RB / TE (when blocking)
- **RB scan (inside→out):** A-gap threat → B/C → EDGE leak. If no LB blitz, may attach to nearest unengaged DL on his side.
- **TE chip:** Brief chip on EDGE then either **release** (if not Max Protect) or **stay** and fit outside of tackle.

#### Defensive Line (each EDGE/DT/NT/DE)
- **Lane & angle:** Rush along assigned **gap lane** (A/B/C) toward the **pocket envelope**, not the QB directly.
- **Leverage build:** Gain depth; convert speed-to-power; try to **cross face** (inside) or **win edge** (outside).
- **Stunts (if called):** Penetrator goes first, looper wraps; use simple timing offsets (≈150–300ms).
- **Win scheduling (deterministic-random):**  
  - Assign each DL a `winTime = base + rand(±variance)`; apply a **first-to-win bias** to one rusher (often the best EDGE).  
  - At `winTime`, reduce engagement factor → **shed** → target QB.

---

### 6 Breach & Sack Rules

- **Breach condition:** DL center point crosses **pocket envelope** boundary on a vector that intersects the QB’s launch lane.
- **Sack condition:** DL enters `sackRadius` (~**0.8y**) around QB. Trigger **SACK** event, stop ticks, spot ball via hash/forward-progress rules.
- **Arrival cardinality:** Enforce **one DL at a time**; allow a rare **second** within ≥**400ms** stagger.
- **Timing envelope:** **3–10s** from snap to sack.  
  - Use play tempo/protection to bias earlier (quick game) vs later (max-protect, good help).

---

### 7 Tuning & Telemetry (for realism)

- **Pocket width at set:** Tackle-to-tackle ≈ **16–18y** (field units), compress 10–25% by 3–4s under pressure.
- **DL push speeds:** engaged 3–4 y/s; free 5–6 y/s.
- **OL lateral:** 2.5–3.5 y/s; anchor reduces DL displacement rate.
- **Win schedule defaults:** `base=2600ms, variance=±500ms, firstBias=0.2–0.4`.  
- **Stunts:** looper delay 150–300ms; pass-off succeeds if both OL not max-stressed.
- **Metrics to log:** first breach time, sack time, helper (C) assists count, RB/TE pickup success, max pocket compression.

---

### 8 Acceptance Criteria (UI + Sim)
- On **snap**, OL & DL start moving within **≤100ms**.
- The **pocket envelope** is drawn and **changes shape** over time; tackles keep width, interior resists depth.
- **Center help** visibly shifts: double-team when a guard is stressed; otherwise scan to the call side.
- **RB/TE** behavior matches protection: RB scans I→O; TE chips or stays by call.
- Exactly **one DL breaches first**; second arrival (if any) is **staggered**.
- **Sacks occur between 3–10s** post-snap across scenarios.
- No console errors; animations are smooth; positions remain physically plausible (no teleports).

> For code organization: drive everything from an **assignment matrix** (scheme → OL/DL responsibilities), a **win scheduler** (per-DL), and a **pocket envelope** calculator tied to QB depth (dropback vs shotgun). Animations (SVG/Canvas) should read these same data to stay in sync with physics.


## Playwright MCP — Comprehensive Usage
> Use this when you need depth. After reading, return to **[Claude.md](./Claude.md)** for the short loop.

### Playwright MCP — Device/Browser Details
- **Browser engine:** Chromium (stable and fast on your machine).
- **Viewport:** 1280×832 (MacBook Air-like); always call `browser_resize` at runtime.
- **Optional UA:** Chrome on macOS (set via MCP args) to keep rendering paths consistent.
- **Why:** Ensures crisp SVG lines, correct hash mark spacing, and reliable performance for the NFL field at laptop size.

### Why MCP here
- View the live UI while coding; catch visual/interaction regressions immediately.
- Enforce NFL correctness (hash spacing, markings) and UX consistency.

### Canonical MCP Routine (detailed)
1) **Start**
- Local dev: `pnpm dev` (ensure no type errors).
- `playwright.goto({ url: "http://localhost:3000" })`
- `playwright.waitForNetworkIdle()`

2) **Structural assertions**
- Field shell: `[data-testid="field-root"]` visible and within viewport.
- Canvas/SVG: `[data-testid="field-canvas"]` rendered with non-zero size.
- Controls:
  - `[data-testid="control-center"]` (left)
  - `[data-testid="ai-tutor"]` (right)
- No duplicate “Throw Target” controls outside the Control Center.

3) **NFL Field Visual Canon** (authoritative)
- **Geometry**: 120y length, 53⅓y width (ratio preserved responsively).
- **Markings**:
  - Yard lines every 5y; minor ticks each yard.
  - **Hash marks (NFL)**:
    - Two interior rows per half, clearly inboard of college hashes.
    - Uniform spacing along the length; aligned across the field.
  - Numbers every 10y, horizontally centered between sideline and near hash; oriented toward the nearest goal line.
  - Goal lines, end lines, and end zones distinctly styled; pylon markers (optional icons) at corners.
- **Sidelines**: solid boundary.
- **Typography**: end-zone label “TOUCHDOWN” legible, balanced kerning/letter-spacing.
- **Color tokens** (can be overridden in Tailwind):
  - `--turf-600: #1f7a2b;  --turf-700: #166a22;`
  - `--line-0: #ffffff;   --accent-ylw: #ffd84d;`
  - `--sideline-0: #e8fff0; --dash-0: #bde5c8;`
- **Rendering**:
  - Prefer **SVG** for crisp lines; Canvas acceptable if pixel snapping handled.
  - Lines width: 2–3px (scale with container), hash ticks 1–2px, dashes 4–6px length.
  - Support high-DPI displays (device pixel ratio considerations).

4) **Interaction validations**
- Motion: choose “Orbit/Zip/Jet” styles; defender shifts follow rules; motion can “snap on motion” if enabled.
- Audibles: change concept; OL protection overlay updates; RB stay-in changes route to block.
- Throws: select target; render ball arc; resolve catch with contested-catch logic; update ball spot per hash/forward-progress rules.
- Coach output: coverage guess + better decision coaching; no empty states.

5) **Error & a11y gates**
- `playwright.checkConsole({ level: ["error"] })` ⇒ must be **zero**.
- `playwright.accessibilityScan()` ⇒ no critical violations for interactive controls.
- `playwright.captureTrace({ onFailure: true })` for triage.

6) **Artifacts**
- Save `artifacts/field.png` and `artifacts/controls.png` per run.
- Optionally persist visual snapshots and compare (`playwright.compareSnapshot`).

### Implementation notes for the field
- **React structure**:
  - `<FieldRoot data-testid="field-root">`
  - `<FieldCanvas data-testid="field-canvas">` (SVG or Canvas)
  - Layers: background turf → 5-yard grid → yard numbers → hash marks → boundaries → end zones → players/routes → overlays.
- **Responsive**:
  - Maintain aspect ratio (e.g., 120:53.33) with an aspect-ratio box; on mobile, switch to top-down with slightly larger numbers for readability.
- **Performance**:
  - Avoid re-painting the entire SVG on every tick; isolate moving layers (players/ball) from static layers (field).
- **Testing selectors**:
  - Use stable `data-testid` attributes for MCP and Playwright tests; avoid brittle CSS selectors.

## Game Flow & Rule Modeling
### Ball Spotting & Hashes
- End **between** hashes ⇒ spot there for next snap.
- End **outside** hashes ⇒ bring to **nearest hash** on same yardline.
- Side-dependent wide/short field impacts alignment, splits, leverage.

### Forward Progress vs Retreat
- **Driven back by defender** ⇒ mark furthest forward point reached **before** being pushed back.
- **Voluntary retreat** ⇒ mark actual tackle spot (no forward progress).

### Incompletions, Drops, & Contested Catches
- At catch moment, evaluate:
  - Defender distance & closing speed;
  - Relative orientation (hit timing);
  - WR catch/traffic rating.
- Model: clean catch, jarred loose, deflection, DPI (future), random drop (low freq for wide-open).

## Coaching Output (Post-Play)
- Identify coverage (best guess) and pressure structure.
- Show progression and openness windows.
- Suggest improved decision (check-down, throw-away, audible next time).

## Future Features & Roadmap
- Multi-perspective play (WR, RB, DB/LB) with coaching.
- Hot routes, disguise shells, blitz checks, motion checks (“snap on motion”).
- Timing sync (routes ↔ QB drops), pocket integrity, scramble/throw-away, clock & D/D awareness.
- Later: penalties, fatigue, subs, weather.

---

## Implementation Notes
1. Drive everything from **concept files**; no freeform routes/coverages.
2. Keep **assignment matrices** authoritative per call/personnel.
3. Maintain **physics coherence** (speed tiers, ball flight, hang time).
4. Ensure coach feedback is **specific** and **actionable**.
5. Build modularly so defenses/offense can evolve without breaking rules.

> When finished consulting this reference, jump back to **[Claude.md](./Claude.md)** to implement succinctly.
