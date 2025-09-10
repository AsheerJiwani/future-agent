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

## Workflow Example (Implement Post Route)
1. Open `docs/sources/routes_source.md` → follow Throw Deep Publishing link.
2. Use Playwright MCP to extract Post route definition.
3. Implement JSON + logic in correct files.
4. Run `docs/checklists/implement_route_checklist.md`.
5. Verify UI with Playwright MCP.
6. Commit with results.
