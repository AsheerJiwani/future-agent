"use client";

import { JSX, useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { FootballConceptId } from "../../data/football/catalog";
import type { CoverageID, Concept } from "../../data/football/types";
import { loadConcept } from "../../data/football/loadConcept";

interface AudioWindow extends Window {
  AudioContext: { new(contextOptions?: AudioContextOptions): AudioContext; prototype: AudioContext; } | undefined;
  webkitAudioContext?: typeof AudioContext;
}
function getAudioCtor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as AudioWindow;
  return w.AudioContext ?? w.webkitAudioContext;
}


/** ---------- Field geometry (vertical orientation) ---------- */
const FIELD_LENGTH_YDS = 120;
const FIELD_WIDTH_YDS = 53.333333;
const HASH_FROM_SIDELINE_YDS = 70.75 / 3;

const PX_W = 900;
const PX_H = 520;

const XPX = PX_W / FIELD_WIDTH_YDS;
const YPX = PX_H / FIELD_LENGTH_YDS;

const xAcross = (ydsAcross: number) => ydsAcross * XPX;
const yUp = (ydsUp: number) => PX_H - ydsUp * YPX;

const DECISION_POINTS = [0.35, 0.6];

// QB: bottom-middle, ~12 yds from GL
const QB = { x: xAcross(FIELD_WIDTH_YDS / 2), y: yUp(12) };

/** ---------- Types ---------- */
export type ReceiverID = "X" | "Z" | "SLOT" | "TE" | "RB";
type DefenderID = "CB_L" | "CB_R" | "NICKEL" | "FS" | "SS" | "SAM" | "MIKE" | "WILL";

export type RouteKeyword =
  | "GO" | "SEAM" | "BENDER"
  | "HITCH" | "OUT" | "SPEED_OUT" | "COMEBACK" | "CURL"
  | "DIG" | "POST" | "CORNER"
  | "CROSS" | "OVER" | "SHALLOW" | "SLANT"
  | "FLAT" | "WHEEL"
  | "CHECK" | "STICK";

type Pt = { x: number; y: number };
type Actor = { id: string; color: string; path: Pt[] };

type RouteMap = Record<ReceiverID, Pt[]>;
type AssignMap = Partial<Record<ReceiverID, RouteKeyword>>;
type AlignMap = Record<ReceiverID, Pt>;

interface DiagramSpec {
  routes?: Partial<Record<ReceiverID, Pt[]>>;
  defense?: Partial<Record<CoverageID, Record<string, Pt[]>>>;
  assignments?: AssignMap;
  align?: Partial<AlignMap>;
}

type FormationName = "TRIPS_RIGHT" | "DOUBLES" | "BUNCH_LEFT";

interface AudibleSuggestion {
  formation?: FormationName;
  assignments?: AssignMap;
  rationale?: string;
}

/** ---------- Math helpers ---------- */
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const qBezier = (p0: Pt, p1: Pt, p2: Pt, t: number): Pt => {
  const u = 1 - t;
  return { x: u*u*p0.x + 2*u*t*p1.x + t*t*p2.x, y: u*u*p0.y + 2*u*t*p1.y + t*t*p2.y };
};
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** ✅ Hoisted helper — safe to call anywhere below this line */
function posOnPath(path: Pt[], tt: number, fallback: Pt = QB): Pt {
  if (!path || path.length === 0) return fallback;
  if (path.length === 1) return path[0];
  const tClamped = Math.max(0, Math.min(1, tt));
  return lerp(path[0], path[path.length - 1], tClamped);
}

// Slightly different offsets per id + away from the player based on side
function labelOffsetFor(id: string, p: {x:number; y:number}): { dx: number; dy: number } {
    const isLeftOfQB = p.x < QB.x;
    const baseDx = isLeftOfQB ? 12 : -12;

    // per-id vertical spread to reduce stacking
    const dyMap: Record<string, number> = {
        X: -10, Z: -10, SLOT: 10, TE: 12, RB: 18,
        CB_L: -12, CB_R: -12, NICKEL: 10, FS: -14, SS: -6, SAM: 10, MIKE: 14, WILL: 16
    };
    const dy = dyMap[id] ?? 10;
    return { dx: baseDx, dy };
}

/** ---------- Route library ---------- */
/** ---------- Route library (depths in yards via yUp) ---------- */
// helper: +1 to right, -1 to left of QB
const sideSign = (start: Pt) => (start.x < QB.x ? +1 : -1);
// clamp toward sideline for outside landmark
const sidelineX = (start: Pt, off = 4) =>
  start.x < QB.x ? xAcross(4 + off) : xAcross(FIELD_WIDTH_YDS - (4 + off));
// hash marks
const HASH_L = xAcross(HASH_FROM_SIDELINE_YDS);
const HASH_R = xAcross(FIELD_WIDTH_YDS - HASH_FROM_SIDELINE_YDS);
// opposite hash for crosses
const oppositeHashX = (start: Pt) => (start.x < QB.x ? HASH_R : HASH_L);

const R = {
  // Verticals
  GO:     (s: Pt): Pt[] => [s, { x: s.x, y: yUp(42) }],
  SEAM:   (s: Pt): Pt[] => [s, { x: s.x, y: yUp(40) }],
  BENDER: (s: Pt, twoHigh: boolean): Pt[] => {
    // bend into/open away from MOF based on shell
    if (twoHigh) return [s, { x: QB.x, y: yUp(42) }];           // split safeties
    return [s, { x: s.x, y: yUp(38) }];                          // stay on seam vs MOFC
  },

  // Quick / intermediate
  HITCH:     (s: Pt): Pt[] => [s, { x: s.x, y: yUp(21) }],       // ~5 yds
  SPEED_OUT: (s: Pt): Pt[] => [s, { x: s.x + sideSign(s) * xAcross(10), y: yUp(20) }], // 4–6
  OUT:       (s: Pt): Pt[] => [s, { x: s.x + sideSign(s) * xAcross(14), y: yUp(26) }], // 10–12
  COMEBACK:  (s: Pt): Pt[] => [s, { x: sidelineX(s, 6), y: yUp(24) }],                 // 14–16 back to sideline
  CURL:      (s: Pt): Pt[] => [s, { x: s.x, y: yUp(24) }],       // 10–12 settle
  STICK:     (s: Pt): Pt[] => [s, { x: s.x + sideSign(s) * xAcross(4), y: yUp(22) }],  // 6–8 turn out/in

  // Intermediate crossers / deep breaks
  DIG:       (s: Pt): Pt[] => [s, { x: QB.x + sideSign(s) * xAcross(10), y: yUp(30) }],  // 12–15 in
  POST:      (s: Pt): Pt[] => [s, { x: QB.x, y: yUp(40) }],                               // 18–22 to MOF
  CORNER:    (s: Pt): Pt[] => [s, { x: sidelineX(s, 10), y: yUp(36) }],                   // 18–22 to corner
  OVER:      (s: Pt): Pt[] => [s, { x: oppositeHashX(s), y: yUp(28) }],                   // 12–18 over LB
  CROSS:     (s: Pt): Pt[] => [s, { x: oppositeHashX(s), y: yUp(26) }],                   // mid cross
  SHALLOW:   (s: Pt): Pt[] => [s, { x: oppositeHashX(s), y: yUp(18) }],                   // 3–5 across

  // Back
  FLAT:      (s: Pt): Pt[] => [s, { x: s.x + sideSign(s) * xAcross(8), y: yUp(18) }],
  WHEEL:     (s: Pt): Pt[] => [s, { x: sidelineX(s, 6), y: yUp(34) }],  // flat→up the sideline (approximated)
  CHECK:     (s: Pt): Pt[] => [s, { x: s.x + sideSign(s) * xAcross(4), y: yUp(17) }]
} as const;

// Factory that can react to coverage (for benders, etc.)
function routeFromKeyword(name: RouteKeyword, start: Pt, coverage: CoverageID): Pt[] {
  const twoHigh = ["C2", "TAMPA2", "C4", "QUARTERS", "C6", "PALMS"].includes(coverage);
  switch (name) {
    case "BENDER":   return R.BENDER(start, twoHigh);
    case "GO":       return R.GO(start);
    case "SEAM":     return R.SEAM(start);
    case "HITCH":    return R.HITCH(start);
    case "SPEED_OUT":return R.SPEED_OUT(start);
    case "OUT":      return R.OUT(start);
    case "COMEBACK": return R.COMEBACK(start);
    case "CURL":     return R.CURL(start);
    case "STICK":    return R.STICK(start);
    case "DIG":      return R.DIG(start);
    case "POST":     return R.POST(start);
    case "CORNER":   return R.CORNER(start);
    case "OVER":     return R.OVER(start);
    case "CROSS":    return R.CROSS(start);
    case "SHALLOW":  return R.SHALLOW(start);
    case "FLAT":     return R.FLAT(start);
    case "WHEEL":    return R.WHEEL(start);
    case "CHECK":    return R.CHECK(start);
    case "SLANT":    return [start, { x: QB.x - sideSign(start) * xAcross(6), y: yUp(20) }];
    default:         return [start, start];
  }
}

/** ---------- Formation presets (fixed align) ---------- */
const FORMATIONS: Record<FormationName, AlignMap> = {
  TRIPS_RIGHT: {
    X:   { x: xAcross(10),                    y: yUp(15) },
    Z:   { x: xAcross(FIELD_WIDTH_YDS - 6),   y: yUp(15) },
    SLOT:{ x: xAcross(FIELD_WIDTH_YDS - 16),  y: yUp(15) },
    TE:  { x: xAcross(FIELD_WIDTH_YDS - 22),  y: yUp(15) },
    RB:  { x: xAcross(FIELD_WIDTH_YDS / 2 - 2), y: yUp(12) }
  },
  DOUBLES: {
    X:   { x: xAcross(10),                    y: yUp(15) },
    Z:   { x: xAcross(FIELD_WIDTH_YDS - 10),  y: yUp(15) },
    SLOT:{ x: xAcross(FIELD_WIDTH_YDS - 20),  y: yUp(15) },
    TE:  { x: xAcross(20),                    y: yUp(15) },
    RB:  { x: xAcross(FIELD_WIDTH_YDS / 2 - 2), y: yUp(12) }
  },
  BUNCH_LEFT: {
    X:   { x: xAcross(12),                    y: yUp(15) },
    SLOT:{ x: xAcross(16),                    y: yUp(17) },
    TE:  { x: xAcross(18.5),                  y: yUp(13.5) },
    Z:   { x: xAcross(FIELD_WIDTH_YDS - 10),  y: yUp(15) },
    RB:  { x: xAcross(FIELD_WIDTH_YDS / 2 - 2), y: yUp(12) }
  }
};

function strongSide(receivers: AlignMap): "left" | "right" {
  let left = 0, right = 0;
  (Object.keys(receivers) as ReceiverID[]).forEach((id) => {
    if (receivers[id].x < QB.x) left++; else right++;
  });
  return right >= left ? "right" : "left";
}

type Numbering = Record<ReceiverID, { side: "left" | "right"; number: 1 | 2 | 3; band: "strong" | "weak" }>;

function computeNumbering(align: AlignMap): Numbering {
  const ss = strongSide(align);
  const ids: ReceiverID[] = ["X","Z","SLOT","TE","RB"];
  const leftIds  = ids.filter(id => align[id].x < QB.x).sort((a,b)=> align[a].x - align[b].x);
  const rightIds = ids.filter(id => align[id].x >= QB.x).sort((a,b)=> align[b].x - align[a].x);

  const tag = (lst: ReceiverID[], side: "left"|"right", band: "strong"|"weak") => {
    const out = {} as Numbering;
    lst.forEach((id, i) => { out[id] = { side, number: (i+1) as 1|2|3, band }; });
    return out;
  };
  const leftBand: "strong"|"weak"  = ss === "left" ? "strong" : "weak";
  const rightBand: "strong"|"weak" = ss === "right" ? "strong" : "weak";

  return { ...tag(leftIds, "left", leftBand), ...tag(rightIds, "right", rightBand) } as Numbering;
}

/** Defaults by concept family (when no assignments provided) */
/** ---------- Concept defaults (used when JSON lacks assignments) ---------- */
function buildConceptRoutes(conceptId: FootballConceptId, A: AlignMap, coverage: CoverageID): RouteMap {
  const ID = (conceptId as string).toUpperCase();

  // helper to build w/ coverage-aware routes
  const mk = (m: Partial<Record<ReceiverID, RouteKeyword>>): RouteMap => ({
    X:    routeFromKeyword(m.X    ?? "HITCH",  A.X,    coverage),
    Z:    routeFromKeyword(m.Z    ?? "HITCH",  A.Z,    coverage),
    SLOT: routeFromKeyword(m.SLOT ?? "FLAT",   A.SLOT, coverage),
    TE:   routeFromKeyword(m.TE   ?? "STICK",  A.TE,   coverage),
    RB:   routeFromKeyword(m.RB   ?? "CHECK",  A.RB,   coverage)
  });

  switch (ID) {
    case "FOUR_VERTS":
      return mk({ X:"GO", Z:"GO", SLOT:"BENDER", TE:"SEAM", RB:"CHECK" });

    case "SAIL":
    case "BOOT_FLOOD":
      // #1 clear (GO), #2 deep OUT ~12–15 (sail), #3 FLAT
      return mk({ X:"GO", SLOT:"OUT", TE:"FLAT", Z:"COMEBACK", RB:"CHECK" });

    case "MESH":
      // shallow crossers + dig + corner/seam
      return mk({ X:"SHALLOW", SLOT:"SHALLOW", Z:"DIG", TE:"CORNER", RB:"CHECK" });

    case "STICK":
    case "SPACING":
    case "CURL_FLAT":
      return mk({ X:"CURL", Z:"CURL", SLOT:"FLAT", TE:"STICK", RB:"FLAT" });

    case "DAGGER":
      // #2 seam clear, #1 15yd dig
      return mk({ SLOT:"SEAM", X:"DIG", Z:"GO", TE:"CHECK", RB:"CHECK" });

    case "Y_CROSS":
      // Y over, frontside post, backside curl/flat
      return mk({ TE:"OVER", X:"POST", Z:"CURL", SLOT:"FLAT", RB:"CHECK" });

    case "SHALLOW":
      // drive: shallow + dig + post clear
      return mk({ SLOT:"SHALLOW", X:"DIG", Z:"POST", TE:"SEAM", RB:"CHECK" });

    case "LEVELS":
      // shallow + intermediate dig with sit/curl backside
      return mk({ SLOT:"SHALLOW", X:"DIG", Z:"CURL", TE:"SEAM", RB:"CHECK" });

    case "MILLS":
      // post-dig shot
      return mk({ X:"POST", SLOT:"DIG", Z:"GO", TE:"SEAM", RB:"CHECK" });

    case "POST_WHEEL":
      return mk({ SLOT:"WHEEL", X:"POST", Z:"COMEBACK", TE:"CURL", RB:"FLAT" });

    case "SLANT_FLAT":
      return mk({ X:"SLANT", SLOT:"FLAT", Z:"HITCH", TE:"STICK", RB:"CHECK" });

    case "DRIVE":
      return mk({ SLOT:"SHALLOW", X:"DIG", Z:"COMEBACK", TE:"SEAM", RB:"CHECK" });

    default:
      // vanilla balanced
      return mk({ X:"COMEBACK", Z:"CURL", SLOT:"FLAT", TE:"DIG", RB:"CHECK" });
  }
}

/** ---------- Defense (nickel) ---------- */
const D_ALIGN: Record<DefenderID, Pt> = {
  CB_L:   { x: xAcross(8),                      y: yUp(16.5) },
  CB_R:   { x: xAcross(FIELD_WIDTH_YDS - 8),    y: yUp(16.5) },
  NICKEL: { x: xAcross(FIELD_WIDTH_YDS - 18),   y: yUp(17)   },
  SAM:    { x: xAcross(20),                     y: yUp(22)   },
  MIKE:   { x: xAcross(FIELD_WIDTH_YDS/2),      y: yUp(22)   },
  WILL:   { x: xAcross(FIELD_WIDTH_YDS-20),     y: yUp(22)   },
  FS:     { x: xAcross(FIELD_WIDTH_YDS/2),      y: yUp(35)   },
  SS:     { x: xAcross(FIELD_WIDTH_YDS/2 - 12), y: yUp(32)   }
};

const ZONES = {
  DEEP_LEFT:    { x: xAcross(12), y: yUp(40) },
  DEEP_MIDDLE:  { x: xAcross(FIELD_WIDTH_YDS/2), y: yUp(42) },
  DEEP_RIGHT:   { x: xAcross(FIELD_WIDTH_YDS-12), y: yUp(40) },
  CURL_LEFT:    { x: xAcross(18), y: yUp(26) },
  HOOK_MID:     { x: xAcross(FIELD_WIDTH_YDS/2), y: yUp(24) },
  CURL_RIGHT:   { x: xAcross(FIELD_WIDTH_YDS-18), y: yUp(26) },
  FLAT_LEFT:    { x: xAcross(8), y: yUp(20) },
  FLAT_RIGHT:   { x: xAcross(FIELD_WIDTH_YDS-8), y: yUp(20) }
};

function buildDefensePaths(coverage: CoverageID, O: RouteMap): Record<string, Pt[]> {
  const manTrail = (start: Pt, targetPath: Pt[]): Pt[] => {
    const end = targetPath[targetPath.length - 1];
    const mid = lerp(start, end, 0.6);
    return [start, mid, end];
  };

  switch (coverage) {
    case "C3":
      return {
        CB_L: [D_ALIGN.CB_L, ZONES.DEEP_LEFT],
        CB_R: [D_ALIGN.CB_R, ZONES.DEEP_RIGHT],
        FS:   [D_ALIGN.FS,   ZONES.DEEP_MIDDLE],
        SS:   [D_ALIGN.SS,   ZONES.CURL_LEFT],
        NICKEL:[D_ALIGN.NICKEL, ZONES.CURL_RIGHT],
        SAM:  [D_ALIGN.SAM,  ZONES.CURL_LEFT],
        MIKE: [D_ALIGN.MIKE, ZONES.HOOK_MID],
        WILL: [D_ALIGN.WILL, ZONES.CURL_RIGHT]
      };
    case "C2":
      return {
        CB_L: [D_ALIGN.CB_L, ZONES.FLAT_LEFT],
        CB_R: [D_ALIGN.CB_R, ZONES.FLAT_RIGHT],
        FS:   [D_ALIGN.FS,   ZONES.DEEP_RIGHT],
        SS:   [D_ALIGN.SS,   ZONES.DEEP_LEFT],
        NICKEL:[D_ALIGN.NICKEL, ZONES.CURL_RIGHT],
        SAM:  [D_ALIGN.SAM,  ZONES.CURL_LEFT],
        MIKE: [D_ALIGN.MIKE, ZONES.HOOK_MID],
        WILL: [D_ALIGN.WILL, ZONES.CURL_RIGHT]
      };
    case "TAMPA2":
      return {
        CB_L: [D_ALIGN.CB_L, ZONES.FLAT_LEFT],
        CB_R: [D_ALIGN.CB_R, ZONES.FLAT_RIGHT],
        FS:   [D_ALIGN.FS,   ZONES.DEEP_RIGHT],
        SS:   [D_ALIGN.SS,   ZONES.DEEP_LEFT],
        MIKE: [D_ALIGN.MIKE, { x: ZONES.DEEP_MIDDLE.x, y: yUp(34) }],
        SAM:  [D_ALIGN.SAM,  ZONES.CURL_LEFT],
        WILL: [D_ALIGN.WILL, ZONES.CURL_RIGHT],
        NICKEL:[D_ALIGN.NICKEL, ZONES.CURL_RIGHT]
      };
    case "QUARTERS":
    case "C4":
      return {
        CB_L: [D_ALIGN.CB_L, { x: xAcross(16), y: yUp(36) }],
        CB_R: [D_ALIGN.CB_R, { x: xAcross(FIELD_WIDTH_YDS-16), y: yUp(36) }],
        FS:   [D_ALIGN.FS,   { x: xAcross(FIELD_WIDTH_YDS/2 + 8), y: yUp(38) }],
        SS:   [D_ALIGN.SS,   { x: xAcross(FIELD_WIDTH_YDS/2 - 8), y: yUp(38) }],
        SAM:  [D_ALIGN.SAM,  ZONES.CURL_LEFT],
        MIKE: [D_ALIGN.MIKE, ZONES.HOOK_MID],
        WILL: [D_ALIGN.WILL, ZONES.CURL_RIGHT],
        NICKEL:[D_ALIGN.NICKEL, ZONES.CURL_RIGHT]
      };
    case "PALMS": {
      const slotVert = O.SLOT[O.SLOT.length - 1];
      return {
        CB_L: [D_ALIGN.CB_L, ZONES.FLAT_LEFT],
        CB_R: [D_ALIGN.CB_R, ZONES.FLAT_RIGHT],
        SS:   [D_ALIGN.SS,   { x: slotVert.x - xAcross(8), y: Math.min(slotVert.y, yUp(36)) }],
        FS:   [D_ALIGN.FS,   { x: xAcross(FIELD_WIDTH_YDS/2 + 10), y: yUp(38) }],
        SAM:  [D_ALIGN.SAM,  ZONES.CURL_LEFT],
        MIKE: [D_ALIGN.MIKE, ZONES.HOOK_MID],
        WILL: [D_ALIGN.WILL, ZONES.CURL_RIGHT],
        NICKEL:[D_ALIGN.NICKEL, ZONES.CURL_RIGHT]
      };
    }
    case "C1":
      return {
        CB_L:   manTrail(D_ALIGN.CB_L, O.X),
        CB_R:   manTrail(D_ALIGN.CB_R, O.Z),
        NICKEL: manTrail(D_ALIGN.NICKEL, O.SLOT),
        SS:     manTrail(D_ALIGN.SS, O.TE),
        MIKE:   manTrail(D_ALIGN.MIKE, O.RB),
        FS:     [D_ALIGN.FS, ZONES.DEEP_MIDDLE],
        SAM:    [D_ALIGN.SAM, ZONES.CURL_LEFT],
        WILL:   [D_ALIGN.WILL, ZONES.CURL_RIGHT]
      };
    case "C0":
      return {
        CB_L:   manTrail(D_ALIGN.CB_L, O.X),
        CB_R:   manTrail(D_ALIGN.CB_R, O.Z),
        NICKEL: manTrail(D_ALIGN.NICKEL, O.SLOT),
        SS:     manTrail(D_ALIGN.SS, O.TE),
        MIKE:   manTrail(D_ALIGN.MIKE, O.RB),
        FS:     manTrail(D_ALIGN.FS, O.TE),
        SAM:    [D_ALIGN.SAM, ZONES.HOOK_MID],
        WILL:   [D_ALIGN.WILL, ZONES.HOOK_MID]
      };
    case "C6":
      return {
        CB_L: [D_ALIGN.CB_L, { x: xAcross(16), y: yUp(36) }],
        SS:   [D_ALIGN.SS,   { x: xAcross(FIELD_WIDTH_YDS/2 - 8), y: yUp(38) }],
        CB_R: [D_ALIGN.CB_R, ZONES.FLAT_RIGHT],
        FS:   [D_ALIGN.FS,   ZONES.DEEP_RIGHT],
        SAM:  [D_ALIGN.SAM,  ZONES.CURL_LEFT],
        MIKE: [D_ALIGN.MIKE, ZONES.HOOK_MID],
        WILL: [D_ALIGN.WILL, ZONES.CURL_RIGHT],
        NICKEL:[D_ALIGN.NICKEL, ZONES.CURL_RIGHT]
      };
    case "C9":
      return {
        CB_L: [D_ALIGN.CB_L, ZONES.DEEP_LEFT],
        CB_R: [D_ALIGN.CB_R, ZONES.CURL_RIGHT],
        FS:   [D_ALIGN.FS,   ZONES.DEEP_MIDDLE],
        SS:   [D_ALIGN.SS,   ZONES.FLAT_LEFT],
        SAM:  [D_ALIGN.SAM,  ZONES.CURL_LEFT],
        MIKE: [D_ALIGN.MIKE, ZONES.HOOK_MID],
        WILL: [D_ALIGN.WILL, ZONES.CURL_RIGHT],
        NICKEL:[D_ALIGN.NICKEL, ZONES.CURL_RIGHT]
      };
    default:
      return buildDefensePaths("C3", O);
  }
}

/** ---------- Component ---------- */
export default function PlaySimulator({
  conceptId,
  coverage
}: {
  conceptId: FootballConceptId;
  coverage: CoverageID;
}) {
  const [phase, setPhase] = useState<"pre" | "post" | "decided">("pre");
  const [t, setT] = useState(0);
  const [decision, setDecision] = useState<ReceiverID | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [explain, setExplain] = useState<string | null>(null);

  const [formation, setFormation] = useState<FormationName>("TRIPS_RIGHT");
  const [manualAssignments, setManualAssignments] = useState<AssignMap>({}); // AI audible can override

  const [O, setO] = useState<RouteMap>({ X: [], Z: [], SLOT: [], TE: [], RB: [] });
  const [numbering, setNumbering] = useState<ReturnType<typeof computeNumbering>>(
    () => computeNumbering(FORMATIONS[formation])
  );
  const [D, setD] = useState<Record<string, Pt[]>>({});

  const [soundOn, setSoundOn] = useState(true);
  const [audibleNote, setAudibleNote] = useState<string>("");

  // Ball flight
  const [ballFlying, setBallFlying] = useState(false);
  const [ballT, setBallT] = useState(0);
  const [ballP0, setBallP0] = useState<Pt>(QB);
  const [ballP1, setBallP1] = useState<Pt>(QB);
  const [ballP2, setBallP2] = useState<Pt>(QB);
  const [catchAt, setCatchAt] = useState<Pt | null>(null);

  const throwEnabled = useMemo(
    () => DECISION_POINTS.some(dp => Math.abs(t - dp) < 0.08) && phase === "post" && !ballFlying && !decision,
    [t, phase, ballFlying, decision]
  );

  // Load concept + build routes from (manual > diagram > defaults), then defense
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const concept: Concept = await loadConcept(conceptId);
      const diag = (concept.diagram ?? {}) as DiagramSpec;

      // Choose base alignment: formation preset -> override with diagram.align (if present)
      const F = FORMATIONS[formation];
      const A: AlignMap = {
        X:   diag.align?.X   ?? F.X,
        Z:   diag.align?.Z   ?? F.Z,
        SLOT:diag.align?.SLOT?? F.SLOT,
        TE:  diag.align?.TE  ?? F.TE,
        RB:  diag.align?.RB  ?? F.RB
      };

      const defaults = buildConceptRoutes(conceptId, A, coverage);

      const resolvedAssignments: AssignMap = {
        ...diag.assignments,
        ...manualAssignments // manual (AI) wins
      };

      const routes: RouteMap = {
        X:    diag.routes?.X    ?? (resolvedAssignments.X    ? routeFromKeyword(resolvedAssignments.X,    A.X,    coverage) : defaults.X),
        Z:    diag.routes?.Z    ?? (resolvedAssignments.Z    ? routeFromKeyword(resolvedAssignments.Z,    A.Z,    coverage) : defaults.Z),
        SLOT: diag.routes?.SLOT ?? (resolvedAssignments.SLOT ? routeFromKeyword(resolvedAssignments.SLOT, A.SLOT, coverage) : defaults.SLOT),
        TE:   diag.routes?.TE   ?? (resolvedAssignments.TE   ? routeFromKeyword(resolvedAssignments.TE,   A.TE,   coverage) : defaults.TE),
        RB:   diag.routes?.RB   ?? (resolvedAssignments.RB   ? routeFromKeyword(resolvedAssignments.RB,   A.RB,   coverage) : defaults.RB),
      };

      const def = buildDefensePaths(coverage, routes);
      const nums = computeNumbering(A);

      if (!cancelled) {
        setNumbering(nums);
        setO(routes);
        setD(def);
        // reset play
        setPhase("pre"); setT(0);
        setDecision(null); setGrade(null); setExplain(null);
        setBallFlying(false); setBallT(0); setCatchAt(null);
      }
    })();
    return () => { cancelled = true; };
  }, [conceptId, coverage, formation, manualAssignments]);

  // Play clock
  const playRef = useRef<number | null>(null);
  useEffect(() => {
    if (phase !== "post") return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / 3000);
      setT(u);
      if (u < 1) playRef.current = requestAnimationFrame(tick);
      else cancelAnimationFrame(playRef.current!);
    };
    playRef.current = requestAnimationFrame(tick);
    return () => { if (playRef.current) cancelAnimationFrame(playRef.current); };
  }, [phase]);

  const offenseActors: Actor[] = useMemo(() => ([
    { id: "X",    color: "#60a5fa", path: O.X },
    { id: "Z",    color: "#22d3ee", path: O.Z },
    { id: "SLOT", color: "#34d399", path: O.SLOT },
    { id: "TE",   color: "#f472b6", path: O.TE },
    { id: "RB",   color: "#a78bfa", path: O.RB }
  ]), [O]);

  const defenseActors: Actor[] = useMemo(() =>
    Object.entries(D).map(([id, path]) => ({ id, color: "#f87171", path })),
  [D]);

  // ---------- AI grader ----------
  async function gradeDecision(to: ReceiverID) {
    try {
      const res = await fetch("/api/football-grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conceptId, coverage, target: to, time: t,
          numbering, formation, assignments: manualAssignments
        })
      });
      const data: { grade?: string; rationale?: string; coachingTip?: string } = await res.json();
      setGrade(data.grade ?? "OK");
      const detail = [data.rationale, data.coachingTip].filter(Boolean).join("  Tip: ");
      setExplain(detail || "Good rep.");
    } catch {
      setGrade("OK");
      setExplain("Grader unavailable. Try again.");
    }
  }

  // ---------- Ball flight + sounds (typed; no `any`) ----------

const playWhistle = useCallback((volume = 0.12) => {
  const Ctx = getAudioCtor();
  if (!Ctx) return;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(2000, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.6);
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.65);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.66);
}, []);

const playCatchPop = useCallback((volume = 0.12) => {
  const Ctx = getAudioCtor();
  if (!Ctx) return;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(300, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.08);
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.1);
}, []);

  function startThrow(to: ReceiverID) {
    const tgt = offenseActors.find(a => a.id === to)!;
    const p2 = posOnPath(tgt.path, t);
    const p0 = { ...QB };
    const mid = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
    const arc = Math.min(80, Math.max(40, dist(p0, p2) * 0.15));
    const p1 = { x: mid.x, y: mid.y - arc }; // arc upward

    setBallP0(p0); setBallP1(p1); setBallP2(p2);
    setBallT(0); setCatchAt(null);
    setBallFlying(true);
    setDecision(to);
    if (soundOn) playWhistle();
    void gradeDecision(to);
  }

  const ballRef = useRef<number | null>(null);
  useEffect(() => {
    if (!ballFlying) return;
    const d = dist(ballP0, ballP2);
    const dur = Math.min(1400, Math.max(600, d * 2.2));
    const t0 = performance.now();
    const tick = (now: number) => {
        const u = Math.min(1, (now - t0) / dur);
        const eased = u < 0.5 ? 2*u*u : -1 + (4 - 2*u)*u;
        setBallT(eased);
        if (u < 1) ballRef.current = requestAnimationFrame(tick);
        else {
        setBallFlying(false);
        setCatchAt(ballP2);
        if (soundOn) playCatchPop(); // 👍 stable callback
        setPhase("decided");
        }
    };
    ballRef.current = requestAnimationFrame(tick);
    return () => { if (ballRef.current) cancelAnimationFrame(ballRef.current); };
    }, [ballFlying, ballP0, ballP2, soundOn, playCatchPop]);


  /** ---------- Field drawing ---------- */
  const drawField = () => {
    const YardLines = () => {
      const lines: JSX.Element[] = [];
      for (let yds = 0; yds <= FIELD_LENGTH_YDS; yds += 5) {
        const y = yUp(yds);
        let sw = 1.2;
        if (yds % 10 === 0) sw = 2;
        if (yds === 0 || yds === 120) sw = 3.2;
        if (yds === 10 || yds === 110) sw = 3;
        lines.push(<line key={`yl-${yds}`} x1={0} x2={PX_W} y1={y} y2={y} stroke="rgba(255,255,255,0.65)" strokeWidth={sw} opacity={yds % 5 === 0 ? 0.25 : 0.2}/>);
      }
      return <>{lines}</>;
    };
    const HashMarks = () => {
      const marks: JSX.Element[] = [];
      const xHashL = xAcross(HASH_FROM_SIDELINE_YDS);
      const xHashR = xAcross(FIELD_WIDTH_YDS - HASH_FROM_SIDELINE_YDS);
      const hh = 6;
      for (let y = 11; y <= 109; y++) {
        const yy = yUp(y);
        marks.push(<line key={`hl-${y}`} x1={xHashL-hh} x2={xHashL+hh} y1={yy} y2={yy} stroke="rgba(255,255,255,0.8)" strokeWidth={1.2}/>);
        marks.push(<line key={`hr-${y}`} x1={xHashR-hh} x2={xHashR+hh} y1={yy} y2={yy} stroke="rgba(255,255,255,0.8)" strokeWidth={1.2}/>);
      }
      return <>{marks}</>;
    };
    // inside drawField()
    const YardNumbers = () => {
    const nums: JSX.Element[] = [];
    const leftX = xAcross(6.5);
    const rightX = PX_W - xAcross(6.5);

    // One label per 10 yards on each sideline
    for (let y = 20; y <= 100; y += 10) {
        const yy = yUp(y);
        const label = y <= 60 ? y - 10 : 110 - y;
        nums.push(
        <text
            key={`nL-${y}`}
            x={leftX}
            y={yy + 6}
            fill="rgba(255,255,255,0.9)"
            stroke="rgba(0,0,0,0.6)"
            strokeWidth={2}
            style={{ paintOrder: "stroke" }}
            fontSize={18}
            textAnchor="middle"
            dominantBaseline="middle"
        >
            {label}
        </text>
        );
        nums.push(
        <text
            key={`nR-${y}`}
            x={rightX}
            y={yy + 6}
            fill="rgba(255,255,255,0.9)"
            stroke="rgba(0,0,0,0.6)"
            strokeWidth={2}
            style={{ paintOrder: "stroke" }}
            fontSize={18}
            textAnchor="middle"
            dominantBaseline="middle"
        >
            {label}
        </text>
        );
    }
    return <>{nums}</>;
    };

    return (
      <>
        <defs>
          <linearGradient id="turfV" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b4d12"/>
            <stop offset="100%" stopColor="#0b3f0f"/>
          </linearGradient>
          <radialGradient id="catchPulse" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.7)"/>
            <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={PX_W} height={PX_H} fill="url(#turfV)" rx={12}/>
        {Array.from({ length: FIELD_LENGTH_YDS / 5 }, (_, i) => {
          const y = yUp(i * 5);
          return <rect key={`stripe-${i}`} x={0} y={yUp((i+1)*5)} width={PX_W} height={y - yUp((i+1)*5)} fill={i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent"}/>;
        })}
        <rect x={0} y={yUp(10)} width={PX_W} height={PX_H - yUp(10)} fill="rgba(255,255,255,0.03)" />
        <rect x={0} y={yUp(120)} width={PX_W} height={yUp(110) - yUp(120)} fill="rgba(255,255,255,0.03)" />
        <rect x={0} y={0} width={PX_W} height={PX_H} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={3} rx={12}/>
        <YardLines/>
        <HashMarks/>
        <YardNumbers/>
      </>
    );
  };

  // ---------- AI Audible ----------
  async function aiAudible() {
    try {
      const payload = {
        conceptId,
        coverage,
        formation,
        assignments: manualAssignments,
        numbering
      };
      const res = await fetch("/api/football-audible", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const suggestion: AudibleSuggestion = await res.json();
      if (suggestion.formation) setFormation(suggestion.formation);
      if (suggestion.assignments) setManualAssignments(suggestion.assignments);
      setAudibleNote(suggestion.rationale ?? "Audible applied.");
      // reset to pre-snap
      setPhase("pre"); setT(0); setDecision(null); setGrade(null); setExplain(null);
      setBallFlying(false); setBallT(0); setCatchAt(null);
    } catch {
      setAudibleNote("AI audible unavailable. Try again.");
    }
  }

  const throwButtons: ReceiverID[] = ["X","Z","SLOT","TE","RB"];

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 md:p-4 backdrop-blur-lg">
      <div className="flex items-center gap-3 mb-2">
        <div className="text-xs uppercase tracking-wide text-white/60">
          Simulator — {conceptId} vs {coverage}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-white/70 text-xs">Formation</label>
          <select
            value={formation}
            onChange={(e)=>setFormation(e.target.value as FormationName)}
            className="bg-white/10 text-white text-xs rounded-md px-2 py-1"
          >
            <option value="TRIPS_RIGHT">Trips Right (3x1)</option>
            <option value="DOUBLES">Doubles (2x2)</option>
            <option value="BUNCH_LEFT">Bunch Left</option>
          </select>
          <button onClick={aiAudible} className="px-2 py-1 text-xs rounded-md bg-fuchsia-600/80 text-white">
            AI Audible
          </button>
        </div>
      </div>

      <div className="relative mx-auto w-full max-w-[960px]">
        <svg viewBox={`0 0 ${PX_W} ${PX_H}`} className="w-full rounded-xl">
          {drawField()}

          {/* QB */}
          <circle cx={QB.x} cy={QB.y} r={7} fill="#fbbf24"/>
          <text x={QB.x + 10} y={QB.y + 4} className="fill-white/85 text-[10px]">QB</text>

          {/* Offense with (#n strong/weak) labels */}
          {offenseActors.map(a => {
            const p = posOnPath(a.path, t);
            const nr = numbering[a.id as ReceiverID];
            const badge = nr ? ` (#${nr.number} ${nr.band})` : "";
            const { dx, dy } = labelOffsetFor(a.id, p);

            return (
                <g key={a.id}>
                <circle cx={p.x} cy={p.y} r={6} fill={a.color}/>
                <text
                    x={p.x + dx}
                    y={p.y + dy}
                    className="text-[9px]"
                    fill="rgba(255,255,255,0.95)"
                    stroke="rgba(0,0,0,0.7)"
                    strokeWidth={2}
                    style={{ paintOrder: "stroke" }}
                >
                    {a.id}{badge}
                </text>
                </g>
            );
            })}

          {/* Defense */}
          {defenseActors.map(d => {
            const p = posOnPath(d.path, t);
            const { dx, dy } = labelOffsetFor(d.id, p);

            return (
                <g key={d.id}>
                <rect x={p.x - 6} y={p.y - 6} width={12} height={12} fill="#ef4444" opacity={0.95}/>
                <text
                    x={p.x + dx}
                    y={p.y + dy}
                    className="text-[9px]"
                    fill="rgba(255,255,255,0.95)"
                    stroke="rgba(0,0,0,0.7)"
                    strokeWidth={2}
                    style={{ paintOrder: "stroke" }}
                >
                    {d.id}
                </text>
                </g>
            );
            })}

          {/* Ball path & ball */}
          {ballFlying && (
            <>
              <path d={`M ${ballP0.x} ${ballP0.y} Q ${ballP1.x} ${ballP1.y} ${ballP2.x} ${ballP2.y}`} stroke="rgba(255,255,255,0.6)" strokeDasharray="6 6" fill="none"/>
              {(() => {
                const bp = qBezier(ballP0, ballP1, ballP2, ballT);
                return <circle cx={bp.x} cy={bp.y} r={5} fill="#f59e0b" stroke="white" strokeWidth={1}/>;
              })()}
            </>
          )}

          {/* Catch pulse */}
          {catchAt && (
            <circle cx={catchAt.x} cy={catchAt.y} r={12} fill="url(#catchPulse)">
              <animate attributeName="r" from="0" to="28" dur="0.5s" fill="freeze"/>
              <animate attributeName="opacity" from="0.9" to="0" dur="0.5s" fill="freeze"/>
            </circle>
          )}
        </svg>

        {/* Controls */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {phase !== "post" ? (
            <button onClick={() => setPhase("post")} className="px-3 py-2 rounded-xl bg-emerald-500/90 text-white">Snap</button>
          ) : (
            <button
              onClick={() => {
                setPhase("pre"); setT(0); setDecision(null);
                setGrade(null); setExplain(null);
                setBallFlying(false); setBallT(0); setCatchAt(null);
              }}
              className="px-3 py-2 rounded-xl bg-white/10 text-white"
            >
              Reset
            </button>
          )}
          <div className="flex items-center gap-2 ml-2">
            <span className="text-white/60 text-xs">Time</span>
            <input type="range" min={0} max={100} value={Math.floor(t*100)} onChange={(e)=>setT(Number(e.target.value)/100)} disabled={ballFlying || phase!=="post"}/>
          </div>
          <label className="ml-auto flex items-center gap-2 text-white/70 text-xs">
            <input type="checkbox" checked={soundOn} onChange={()=>setSoundOn(s=>!s)}/> Sound
          </label>
        </div>

        {/* Throw targets */}
        <div className="mt-2 flex flex-wrap gap-2">
          {throwButtons.map(to => (
            <button
              key={to}
              disabled={!throwEnabled}
              onClick={() => startThrow(to)}
              className={`px-3 py-2 rounded-xl ${throwEnabled ? "bg-gradient-to-r from-indigo-500 to-fuchsia-500" : "bg-white/10"} text-white disabled:opacity-50`}
              title={throwEnabled ? "Make your read & throw" : "Wait for window"}
            >
              Throw: {to}
            </button>
          ))}
        </div>

        {/* Result + audible note */}
        {(decision || grade || explain || audibleNote) && (
          <div className="mt-3 p-3 rounded-xl bg-white/5 text-white space-y-1">
            {decision && (
              <div className="text-sm">
                You threw to <span className="font-semibold">{decision}</span>.{" "}
                Grade: <span className="font-semibold">{grade ?? "…"}</span>
              </div>
            )}
            {explain && <div className="text-white/70 text-sm">{explain}</div>}
            {audibleNote && <div className="text-fuchsia-300/90 text-xs">Audible: {audibleNote}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
