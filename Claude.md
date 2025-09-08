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
