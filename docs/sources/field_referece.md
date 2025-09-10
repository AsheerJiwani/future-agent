---
doc: field_reference
purpose: Visual reference and constraints for the field rendering
audience: Claude
version: 1.0
---

# Field Rendering – Visual Reference & Constraints

**Reference Image (perspective only):**  
Source article: https://www.shreveporttimes.com/story/sports/high-school/2019/06/27/red-river-gets-turfed-fields-amid-5-million-athletic-project/1578441001/  
Direct image: https://www.shreveporttimes.com/gcdn/presto/2019/06/27/PSHR/59c90462-a130-4550-a632-07a7e7f0162d-Red_River_field_2.jpg?width=660&height=495&fit=crop&format=pjpg&auto=webp

> Use the image **only** to match camera angle/perspective and general composition. **Do not** copy any logos/branding/colors from the photo.

## Required Look
1. **Lighting**: even (no vignette or hot spots).  
2. **Branding**: none (no logos, school names, midfield emblems).  
3. **End Zones**: render the word **“Touchdown”** centered in **each** end zone (clean type, high contrast).  
4. **Lines**:
   - Solid white perimeter/boundary lines.
   - Yard lines every 5 yards; numerals at 10-yard increments.
   - Hash marks visible and consistent (left & right).
5. **Color/Contrast**: natural green turf with subtle stripe variance for readability; white markings must be crisp.

## Implementation Notes
- Render with your existing field layer in the Play Simulator (e.g., React SVG/Canvas).
- Expose stable hooks for MCP tests:
  - `data-testid="field-root"`
  - `data-testid="endzone-left"`, `data-testid="endzone-right"`
  - `data-testid="endzone-left-text"`, `data-testid="endzone-right-text"`
- Provide props or config to toggle:
  - line thickness, hash density, numeral font size.
  - end zone text (default “Touchdown”).

## MCP Verification Protocol
1. Launch Playwright MCP → open `http://localhost:3000` → Football Panel → Play Simulator.
2. Assert:
   - Field root exists (`[data-testid="field-root"]`).
   - Two end zones exist and contain text `“Touchdown”`.
   - Yard lines are present (query by role/test id or count heuristic if instrumented).
3. Capture a11y snapshot & screenshot; include summary in commit body.
