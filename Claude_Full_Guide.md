# NFL Game Simulator — Authoritative Canon (Full Guide)

> This file defines the **truth** for NFL mechanics. It is your reference whenever a task touches gameplay, physics, or rules. The **root Claude.md** is your short operational loop.

## File-scope Roles
- **Root `Claude.md`:** operational loop, MCP checks, research protocol, minimal guidance.  
- **This file:** **binding rules** and exact behaviors used by code + tests.  
- **`docs/football_notes.md`:** rationale, citations/links, and examples (non-binding).  
- **`docs/nfl_rules/*.md`:** unresolved items queued for user confirmation.

---

## Field Visual Canon (authoritative)
- Geometry: **120 yds** long (100 field + two 10 end zones), **53⅓ yds** wide; preserve ratio responsively.  
- Markings:
  - Yard lines every 5; minor ticks every yard.  
  - **NFL hash marks:** two interior rows per half, closer to the middle than college; aligned and uniform; center gap clear.  
  - Numbers every 10, centered between sideline and near hash, oriented toward nearest goal line.  
- End zones: distinct color; “TOUCHDOWN” typography legible; separate goal vs end line.  
- Sidelines: solid boundary.  
- Rendering: prefer **SVG**; line width 2–3 px; hash ticks 1–2 px; dashes 4–6 px; high-DPI aware.

## Spotting & Forward Progress
- Ball ends **inside hashes** → spot there.  
- Ball ends **outside** → spot at nearest hash.  
- **Forward progress:** if driven back by contact, spot at forward-most point; if voluntarily retreating, spot at tackle spot.

## Personnel & Assignments
- 11 on offense, 11 on defense; Nickel=5 DBs, Dime=6 DBs (never exceed).  
- Every defender has exactly one assignment: rush, man (with target), or zone (with named zone).  
- No overlapping zones; preserve rush integrity.

## Pocket & Pass Rush Canon
- **Envelope:** convex, elliptical “pocketEnvelope” centered at QB depth; tackles shape arc; interior forms apex. The envelope **breathes**: brief expand at set → compress 10–25% by ~3–4 s under pressure.  
- **Contain:** Tackles keep rushers **outside arc**; interior prevents A/B-gap collapse.  
- **Single first breach:** exactly **one** DL breaches first; rare second arrival with ≥ 400 ms stagger.  
- **Sack window:** **3–10 s** after snap (bias by play tempo/protection).  
- **Breach condition:** DL center crosses envelope on a vector intersecting the launch lane.  
- **Sack condition:** DL enters `sackRadius ≈ 0.8 yd` around QB → trigger SACK → stop ticks → spot ball using rules above.

### Center — Double-Team & Scan (authoritative)
1. **ID/Declare** MIKE internally (no UI).  
2. **Dual read:** On snap, take near A-gap threat; if light, **help** the **most-stressed guard**.  
3. **Help rules priority:**  
   a) Aid guard losing **vertical push** fastest;  
   b) If both stable, **scan** to RB side for A→B inside threat;  
   c) On stunt, pass penetrator, **catch looper**.  
4. **Late add (green dog):** peel to RB-side add.

**Sim hook:** per tick compute per-OL **stress** (DL leverage + depth loss). Center assists the neighbor with max stress unless A-gap threat exceeds threshold.

### Protection Schemes (assignments drive both sim & animation)
- **Man:** LT↔EDGE, LG↔DT, C↔NT/most dangerous A, RG↔DT, RT↔EDGE; RB/TE per call.  
- **Slide L/R:** each OL owns near gap to slide side; backside tackle remains man.  
- **Half-Slide L/R:** slide on call side; backside G/T man.  
- **Max Protect:** TE stays/help on his side; RB scans inside→out (LB→DB).

### DL Rush & Stunts
- Rush lanes honor declared gap (A/B/C) toward **pocket envelope** (not the QB directly).  
- **Win scheduling:** `winTime = base + rand(±variance)`, bias first win to best EDGE. At `winTime`, reduce engagement factor → shed → target QB.  
- **Stunts:** penetrator first, looper wraps; delay **150–300 ms**; pass-off if OL not max-stressed.

## Coverage Canon (templates used to generate assignments)
- **Cover 0:** pure man; no post safety; heavy pressure (often 6).  
- **Cover 1 (man-free):** man + single high; variants: robber (lurk), spy (LB on QB). Typical rush 4–5.  
- **Cover 2:** halves safeties; CBs jam/release to flats; 3 underneath hook/curl. **Tampa-2:** MLB runs deep middle.  
- **Cover 3:** outside thirds by CBs + post middle third; four underneath (curl-flat L/R, hook L/R). **Vs 3×1:** rotate/roll; trips cloud.  
- **Cover 4 (Quarters/match):** four deep/three under. Pattern-match: CB takes #1 vertical; if #1 under, zone off/help; Safety reads #2: vertical past ~10–12 yds ⇒ man; else rob #1; Mike carries #3 vertical to handoff.  
- **Palms (2-Read):** #2 to flat → CB jumps #2; Safety takes #1 vertical; else play Quarters.  
- **Cover 6:** Quarters to trips; Cover 2 to single-WR side.

## Offensive Concepts (real examples only)
Use concepts defined in `src/data/football/concepts` (curls, slants, verts “999”, shallow cross, mesh, flood, trips flood).  
Respect route timing vs QB drops (3/5/7 or shotgun rhythm).  
**Trips Flood:** #1 vertical clear; #2 deep out; #3 flat; stretch deep/curl/flat defenders.

## Motions, Audibles, and Post-snap Actions
- **Motions:** orbit/zip/jet/yo-yo alter alignments; defenders shift per coverage rules.  
- **Audibles:** can change routes and protections (slide/half-slide/max protect).  
- **RB/TE blocking:** RB scans **I→O**; TE chip then release or stay per call.

## Timings & Tuning (defaults)
- Pocket width at set **16–18 yds** tackle-to-tackle; compress **10–25%** by 3–4 s.  
- DL push speeds: engaged **3–4 yds/s**, free **5–6 yds/s**.  
- OL lateral **2.5–3.5 yds/s**; anchor reduces DL displacement.  
- Win schedule: `base=2600 ms`, `variance=±500 ms`, `firstBias=0.2–0.4`.  
- Stunt looper delay **150–300 ms**.  
- **Telemetry to log:** first breach time, sack time, Center assist count, RB/TE pickup success, max pocket compression.

## Acceptance Criteria (UI + Sim)
- On snap, OL/DL move **≤ 100 ms**.  
- Pocket envelope rendered and **changes shape** over time.  
- Center help dynamic per stress; RB/TE behave per protection.  
- Exactly one DL breaches first; optional second with ≥ 400 ms stagger.  
- Sacks occur **3–10 s** post-snap.  
- Zero console errors; no teleporting; smooth animation.

## Playwright MCP — Comprehensive Routine
1) Start server → `browser_navigate("http://localhost:3000")` → `browser_resize(1280,832)` → wait idle.  
2) Structural assertions:  
   - `[data-testid="field-root"]`, `[data-testid="field-canvas"]`  
   - `[data-testid="control-center"]`, `[data-testid="ai-tutor"]`  
3) **Field Canon checks** (hashes, numbers, yard lines, sidelines, typography).  
4) Interactions: motion (orbit/zip/jet) with optional “snap on motion”; snap; throw target; coach analysis appears.  
5) A11y scan; timings (TTI ≤ 2.5 s prod; no idle long task > 200 ms).  
6) Fail fast, fix, re-run. Save snapshots under `artifacts/`.

## Research & Updates (when rules are missing)
- Follow the **Research Protocol** in root `Claude.md`.  
- After user confirms a rule/interpretation, update this file’s canon and add tests; keep `docs/football_notes.md` for examples and references.

## Roadmap (authoritative)
- Player perspectives (WR/RB/DB/LB) with role-specific coaching.  
- Hot routes; disguises; blitz packages.  
- Situational logic (down/distance, clock/score).  
- Special teams (punts, kickoffs, FG) after core phases stabilize.
