---
doc: offensive_line_source
purpose: Authoritative external references for offensive line positions & blocking schemes
audience: Claude
version: 1.0
---

# Offensive Line Concepts

Primary References:
- [UA Playbook: Offensive Line Positions](https://www.underarmour.com/en-us/t/playbooks/football/offensive-line-positions-in-football/)
- [Glazier Clinics: OL Blocking Schemes](https://www.glazierclinics.com/football-coach-resources/helpful-offensive-line-blocking-schemes)
- [DraftBlaster: Zone/Man/Angle Blocking](https://www.draftblaster.com/nfl-schemes-offense/offensive-line-schemes-zone-man-angle/)

## Protocol
1. Use Playwright MCP to open these sources.
2. Extract the following for each OL concept:
   - **Formation**: OL alignment (LT, LG, C, RG, RT, TE).
   - **Blocking Scheme**: Zone, Man, Gap/Angle.
   - **Assignments**: By position (e.g., LT reach block vs 3-tech).
   - **Adjustments**: Blitz pickup, double teams, slide protection.
3. Encode into JSON schema:

```json
{
  "id": "zone_blocking",
  "positions": {
    "LT": "reach block DE",
    "LG": "combo DT to LB",
    "C": "zone step to play-side",
    "RG": "double DT then climb",
    "RT": "seal edge"
  },
  "schemeType": "zone",
  "adjustments": "slide protection vs overload blitz"
}
```

4. Implement logic in `PlaySimulator.tsx` under **applyBlockingScheme(name)**.
5. Use checklists to confirm blocking timing & pocket formation in UI.
