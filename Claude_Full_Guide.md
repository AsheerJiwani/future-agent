# CLAUDE_Full_Guide.md

## How to Read These Docs
- Start at `docs/workflow_index.md`.
- For routes → `docs/sources/routes_source.md`.
- For coverages/defenses → `docs/sources/defenses_source.md`.
- For OL concepts → `docs/sources/offensive_line_source.md`.
- For DL concepts → `docs/sources/defensive_line_source.md`.
- Always run a checklist before commit.

## 5 Patterns to Make Claude Efficient
1. **YAML front-matter**: Each file declares purpose, audience, version.
2. **Numbered directives**: Always execute in order.
3. **Anchored sections**: Use headings as jump-to references.
4. **Schemas in JSON fences**: Ensure generated files match schema.
5. **Cross-linked checklists**: Every action links to a verification checklist.

## Playwright MCP Protocol
- Launch browser → open `http://localhost:3000`
- Navigate to Football Panel → Play Simulator
- Query elements by role/name
- Run snaps, capture a11y snapshots + timings
- Compare results to source spec
