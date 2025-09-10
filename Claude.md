# NFL Game Simulator — Operational Guide for Claude (Root)

> Use this file for **everyday work**. For deep mechanics, open **Claude_Full_Guide.md**.

## Mission
Build and maintain a production-ready **NFL play simulator** with **real NFL rules** and authentic behaviors. Do **not** invent plays/coverages/routes/rules. Use only concepts in `src/data/football/concepts` and the canon in **Claude_Full_Guide.md**.

## Agentic Loop (tight)
1) **Establish baseline (UI/UX)**  
   - Start dev server (`pnpm dev` or `npm run dev`).  
   - **Playwright MCP** → open `http://localhost:3000` → `browser_resize 1280×832`.  
   - Capture **baseline** screenshots:  
     - Whole app: `main[role="main"]`  
     - Field: `[data-testid="field-canvas"]` → save `artifacts/baseline_field.png`  
     - Controls: `[data-testid="control-center"]`  
   - Log console errors; dump timings. This anchors the “before state” for any request.
2) **Understand & plan**  
   - Read only the smallest set of files that are clearly relevant.  
   - Update/maintain `docs/code_index.md` (one-liners per file).  
   - Draft a minimal change plan + acceptance criteria + MCP verification steps.
3) **Implement**  
   - Make **small diffs**. No speculative refactors. Obey TypeScript strictness and your UI conventions.
4) **Verify (UI is the truth)**  
   - Re-run Playwright MCP: smoke checks, a11y scan, perf timings, domain checks (players=22, hashes visible, pocket behavior).  
   - If anything fails, capture the precise failure (selector/role, expected vs actual, console error), fix, and **re-verify**.
5) **Harden**  
   - Mirror MCP steps as Playwright tests; add unit tests for core logic.  
   - Lint, typecheck, and ensure zero console errors in dev.
6) **Document**  
   - If you changed rules/mechanics, **also** update **Claude_Full_Guide.md** and `docs/football_notes.md`.

## Non-negotiables
- **NFL realism only.** No invented rules or hybrid college/NFL hashes.  
- **Personnel integrity:** 11 on O, 11 on D; Nickel=5 DBs; Dime=6 DBs.  
- **Assignments explicit:** Every defender has a unique job (zone/man/rush). No overlap.  
- **Pocket canon:** Convex “envelope” around QB; single DL breaches first; sacks in **3–10 s**; Center help & scan logic active.  
- **Ball mechanics:** Hash/spotting and forward progress per NFL rules.  
- **Controls truth:** All throws/motions/audibles live only in the Control Center.

## NFL Rule & Concept Research Protocol
When asked to apply a rule you don’t have firmly:
1) **Never invent.** Pause changes.  
2) **Check local canon first:** `Claude_Full_Guide.md` → `docs/football_notes.md` → `src/data/football/concepts`.  
3) **If still missing:** create `docs/nfl_rules/TODO_<slug>.md` with:  
   - The open question;  
   - The scenario (down/distance, formation, coverage);  
   - Your current best **non-functional** plan (no behavior change yet).  
4) Ask the user for the exact rule/citation or permission to add the rule to **Claude_Full_Guide.md**.  
5) Once confirmed, implement and backfill tests.

## Playwright MCP — Fast Path
- Engine: Chromium. Viewport: **1280×832**. Target: **http://localhost:3000** (fallback **https://future-agent.vercel.app**).
- Sequence:
  1. `browser_navigate` → wait for network idle  
  2. Assert visible: `main[role="main"]`, `[data-testid="field-root"]`, `[data-testid="field-canvas"]`, `[data-testid="control-center"]`  
  3. `browser_console_messages` → **no errors**  
  4. Snapshot field to `artifacts/field.png`  
  5. Interactions: snap → motion (if set) → throw target (e.g., SLOT/OUT) → coach summary  
  6. A11y scan; timings: TTI ≤ 2.5 s prod; no idle long tasks > 200 ms
- If any step fails → fix → re-run.

## Commands
- Dev: `pnpm dev`  
- Tests: `pnpm test` (add Playwright specs for new flows)  
- Lint/format: `pnpm lint` → `pnpm format`  
- Build: `pnpm build`

## When You Need Depth
Open **Claude_Full_Guide.md** (authoritative canon for pocket, protections, coverages, spotting, forward progress, field visuals, timings, and acceptance).
