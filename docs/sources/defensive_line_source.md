---
doc: defensive_line_source
purpose: External references for DL alignments & techniques
audience: Claude
version: 1.0
---

# Defensive Line Concepts

Primary Reference:
- [VIQTORI: Understanding Defensive Techniques](https://www.viqtorysports.com/understanding-defensive-techniques/)

## Protocol
1. Use Playwright MCP to open this page.
2. Extract **DL techniques (0–9-tech)**:
   - Technique # = alignment relative to OL (e.g., 3-tech = outside shoulder of guard).
   - Gaps: A, B, C.
   - Responsibilities: penetration vs contain.
3. Encode into JSON schema:

```json
{
  "id": "3_technique",
  "alignment": "outside shoulder of guard",
  "gap": "B gap",
  "role": "penetrate gap on snap",
  "adjustments": "slant inside vs zone; stunt with DE"
}
```

4. Implement logic in `PlaySimulator.tsx` under **applyDLTechnique(name)**.
5. Combine with coverage schemes (e.g., 4-3 Over with Cover 2).
