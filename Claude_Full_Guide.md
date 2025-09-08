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
