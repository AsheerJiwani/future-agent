# CLAUDE.md

## Mission
AUTOMATE THE ENTIRE WORKFLOW of the NFL game simulator (Next.js + Vercel) by:
1. Researching football concepts via Playwright MCP using the linked authoritative sources.
2. Implementing code edits in the correct files.
3. Running Playwright MCP verification on `http://localhost:3000`.
4. Iterating until all checks pass.

## Golden Rules
1. Never invent football logic. Always consult the sources in `docs/sources/*.md`.
2. Use Playwright MCP to extract the correct definitions of routes, coverages, line concepts, or assignments.
3. Always follow numbered checklists in `docs/checklists/*.md`.
4. Commit changes only after passing all UI verification steps.

## Implementation Scope
- **UI:** `src/components/football/FootballPanel.tsx`
- **Simulation:** `src/components/football/PlaySimulator.tsx`
- **Concept Data:** `src/data/football/concepts/*.json`, `catalog.ts`, `loadConcept.ts`

## Field Rendering Reference (UI)

Use `docs/sources/field_reference.md` as the **single source of truth** for the field’s look & perspective.

1. **Goal**: Render a clean, neutral NFL-style field in the Play Simulator (React) that visually matches the perspective of the reference image (link in `field_reference.md`), with **even lighting**, **no school/team branding**, and the word **“Touchdown”** centered in **each** end zone.
2. **Do Not** import or overlay the source photo. Recreate a neutral, brand-free field with our own SVG/Canvas/CSS.
3. **Checklist** (must pass before commit):
   - Green turf gradient with even lighting (no dark hotspots).
   - Entire field fits within screen
   - Entire field is displayed
   - Solid white boundary lines and yard lines every 5 yards (with 10-yard numerals).
   - Hash marks rendered and aligned consistently across the field.
   - “Touchdown” text appears centered in **both** end zones, legible at the default zoom.
   - No logos, watermarks, school names, or extra branding.
4. **Playwright MCP Verification**
   - Open `http://localhost:3000` → Football Panel → Play Simulator.
   - Assert the field container mounts with a fixed **MacBook Air–like** viewport (as configured).
   - Query for field root by test id or role (e.g., `data-testid="field-root"`).
   - Verify end zone text nodes exist (`"Touchdown"` twice).
   - Capture a11y snapshot, record pass/fail in commit body.


## Workflow Example (Implement Post Route)
1. Open `docs/sources/routes_source.md` → follow Throw Deep Publishing link.
2. Use Playwright MCP to extract Post route definition.
3. Implement JSON + logic in correct files.
4. Run `docs/checklists/implement_route_checklist.md`.
5. Verify UI with Playwright MCP.
6. Commit with results.
