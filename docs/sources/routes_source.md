---
doc: routes_source
purpose: Point Claude to external routes data
---

# Routes Source

Primary Reference:
- [Throw Deep Publishing: Complete Guide to Football Routes](https://throwdeeppublishing.com/blogs/football-glossary/football-pass-routes-complete-guide?srsltid=AfmBOorPN3C5MfjZf8gN-AWiQyLz-OdQMo1HTyOODVG-ILxO0_-Djj7x)

Protocol:
1. Use Playwright MCP to open this page.
2. Identify the requested route (Post, Corner, Dig, etc.).
3. Extract: depth, break, leverage rules, adjustments vs man/zone.
4. Encode into JSON schema:

```json
{
  "id": "route_name",
  "depthYards": 0,
  "break": "inside/outside-XX°",
  "manAdjustment": "",
  "zoneAdjustment": "",
  "dbInteraction": "",
  "acceleration": ""
}
```

5. Implement JSON in `concepts/{route}.json`.
6. Update catalog.ts + loadConcept.ts.
