---
doc: defenses_source
purpose: External references for coverages and fronts
---

# Defensive Concepts Source

References:
- [4-3 Defense Complete Guide](https://throwdeeppublishing.com/blogs/football-glossary/the-4-3-defense-the-complete-guide)
- [3-4 Defense Complete Guide](https://throwdeeppublishing.com/blogs/football-glossary/the-3-4-defense-the-complete-guide)
- [Zone Defense (Wikipedia)](https://en.wikipedia.org/wiki/Zone_defense_in_American_football)
- [Big Blue View: Coverage Terms Glossary](https://www.bigblueview.com/2023/6/4/23742492/defensive-pass-coverage-terms-explained-glossary-of-terms)

## Protocol
1. Use Playwright MCP to open the relevant page.
2. For Coverages (e.g., Cover 3, Cover 2, Match Quarters):
   - Extract deep zones, underneath zones, leverage rules, rotation rules.
3. For Fronts (4-3, 3-4):
   - Extract gaps, LB responsibilities, pressure tendencies.
4. Implement in `PlaySimulator.tsx` using `applyCoverage(name)`.

## Related Line Play
- For DL techniques → see `defensive_line_source.md`
- For OL blocking schemes → see `offensive_line_source.md`
