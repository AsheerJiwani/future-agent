// src/data/football/coverage.ts
import type { CoverageID } from "./types";

export const COVERAGES: CoverageID[] = [
  "C0","C1","C2","TAMPA2","PALMS","C3","C4","QUARTERS","C6","C9"
];

export const COVERAGE_LABEL: Record<CoverageID,string> = {
  C0: "Cover 0 (Zero)",
  C1: "Cover 1 (Man-Free)",
  C2: "Cover 2",
  TAMPA2: "Tampa 2",
  PALMS: "Palms / 2-Read",
  C3: "Cover 3",
  C4: "Cover 4",
  QUARTERS: "Quarters (Match)",
  C6: "Cover 6 (QQH)",
  C9: "Cover 9 (Match)"
};
