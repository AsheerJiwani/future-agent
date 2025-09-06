"use client";

import { JSX, useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { FootballConceptId } from "../../data/football/catalog";
import type { CoverageID, ReceiverID, RouteKeyword, Pt, AlignMap } from "../../data/football/types";
import type { PlaySnapshot, SnapMeta } from "@/types/play";
import { usePlayClock } from "./hooks/usePlayClock";
import { XorShift32, mixSeed } from "../../lib/rng";

/* --------- Audio helpers --------- */
interface AudioWindow extends Window {
  AudioContext:
    | { new (contextOptions?: AudioContextOptions): AudioContext; prototype: AudioContext }
    | undefined;
  webkitAudioContext?: typeof AudioContext;
}
function getAudioCtor(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as AudioWindow;
  return w.AudioContext ?? w.webkitAudioContext;
}

// Plausible helper (avoid explicit any casts)
type Plausible = (event: string, opts?: { props?: Record<string, unknown> }) => void;
interface PlausibleWindow extends Window { plausible?: Plausible }
function safeTrack(event: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const w = window as PlausibleWindow;
  try { w.plausible?.(event, props ? { props } : undefined); } catch {}
}

/* --------- Field geometry (vertical orientation) --------- */
const FIELD_LENGTH_YDS = 120;
const FIELD_WIDTH_YDS = 53.333333;
const HASH_FROM_SIDELINE_YDS = 70.75 / 3;

const PX_W = 900;
const PX_H = 520;

const XPX = PX_W / FIELD_WIDTH_YDS;
const YPX = PX_H / FIELD_LENGTH_YDS;

const xAcross = (ydsAcross: number) => ydsAcross * XPX;
const yUp = (ydsUp: number) => PX_H - ydsUp * YPX;

// QB at bottom-middle, ~12 yds from GL
const QB = { x: xAcross(FIELD_WIDTH_YDS / 2), y: yUp(12) };

/* --------- Types --------- */
type DefenderID =
  | "CB_L"
  | "CB_R"
  | "NICKEL"
  | "FS"
  | "SS"
  | "SAM"
  | "MIKE"
  | "WILL";

// (Actor type removed)

type RouteMap = Record<ReceiverID, Pt[]>;
type AssignMap = Partial<Record<ReceiverID, RouteKeyword>>;

type FormationName = "TRIPS_RIGHT" | "DOUBLES" | "BUNCH_LEFT";

// (AudibleSuggestion interface removed; inline types are used where needed)

/* --------- Math + sampling --------- */
const qBezier = (p0: Pt, p1: Pt, p2: Pt, t: number): Pt => {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
};
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const segLen = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

/** Sample along a multi-segment path by arc length (t in [0,1]) */
function posOnPathLenScaled(path: Pt[], t: number): Pt {
  if (!path || path.length === 0) return { x: QB.x, y: QB.y };
  if (path.length === 1) return path[0];
  const tt = Math.max(0, Math.min(1, t));
  let total = 0;
  const lens: number[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const L = segLen(path[i], path[i + 1]);
    lens.push(L);
    total += L;
  }
  const target = tt * total;
  let acc = 0;
  for (let i = 0; i < lens.length; i++) {
    const L = lens[i];
    if (acc + L >= target) {
      const u = L === 0 ? 0 : (target - acc) / L;
      return lerp(path[i], path[i + 1], u);
    }
    acc += L;
  }
  return path[path.length - 1];
}

/* --------- Label offset to avoid overlaps --------- */
function labelOffsetFor(id: string, p: Pt): { dx: number; dy: number } {
  const leftOfQB = p.x < QB.x;
  const baseDx = leftOfQB ? 12 : -12;
  const dyMap: Record<string, number> = {
    X: -10,
    Z: -10,
    SLOT: 10,
    TE: 12,
    RB: 18,
    CB_L: -12,
    CB_R: -12,
    NICKEL: 10,
    FS: -14,
    SS: -6,
    SAM: 10,
    MIKE: 14,
    WILL: 16,
  };
  const dy = dyMap[id] ?? 10;
  return { dx: baseDx, dy };
}

/* --------- Route library (depths in yards via yUp) --------- */
const isLeftOfQB = (p: Pt) => p.x < QB.x;
const outSign = (p: Pt) => (isLeftOfQB(p) ? -1 : +1);
const inSign = (p: Pt) => (isLeftOfQB(p) ? +1 : -1);

const SIDELINE_MARGIN = 4;
const HASH_L = xAcross(HASH_FROM_SIDELINE_YDS);
const HASH_R = xAcross(FIELD_WIDTH_YDS - HASH_FROM_SIDELINE_YDS);
const oppositeHashX = (s: Pt) => (isLeftOfQB(s) ? HASH_R : HASH_L);
const sidelineX = (s: Pt, off = SIDELINE_MARGIN) =>
  isLeftOfQB(s) ? xAcross(off) : xAcross(FIELD_WIDTH_YDS - off);

const DEPTH = {
  quick: 21,
  short: 22,
  mid: 26,
  curl: 24,
  dig: 30,
  deep: 36,
  shot: 40,
};

const H = {
  outQuick: 8,
  outDeep: 14,
  flat: 8,
  meshSpan: 18,
};

function routeFromKeyword(name: RouteKeyword, s: Pt, coverage: CoverageID): Pt[] {
  const twoHigh = ["C2", "TAMPA2", "C4", "QUARTERS", "C6", "PALMS"].includes(coverage);
  switch (name) {
    /* Verticals */
    case "GO": {
      const rel = { x: s.x + outSign(s) * xAcross(2), y: yUp(DEPTH.short) };
      return [s, rel, { x: rel.x, y: yUp(DEPTH.shot) }];
    }
    case "SEAM": {
      return [s, { x: s.x, y: yUp(DEPTH.shot) }];
    }
    case "BENDER": {
      if (twoHigh) {
        const stem = { x: s.x, y: yUp(DEPTH.deep - 2) };
        return [s, stem, { x: QB.x, y: yUp(DEPTH.shot) }];
      }
      return [s, { x: s.x, y: yUp(DEPTH.shot) }];
    }

    /* Underneath / quick */
    case "HITCH": {
      const stem = { x: s.x, y: yUp(DEPTH.quick) };
      const work = { x: stem.x, y: yUp(DEPTH.quick - 2) };
      return [s, stem, work];
    }
    case "STICK": {
      const stem = { x: s.x, y: yUp(DEPTH.short) };
      const breakPt = { x: s.x + outSign(s) * xAcross(4), y: stem.y };
      return [s, stem, breakPt];
    }
    case "SLANT": {
      const breakPt = { x: s.x + inSign(s) * xAcross(6), y: yUp(DEPTH.quick) };
      return [s, breakPt, { x: breakPt.x + inSign(s) * xAcross(4), y: yUp(DEPTH.mid) }];
    }
    case "SPEED_OUT": {
      const stem = { x: s.x, y: yUp(DEPTH.quick) };
      const out = { x: s.x + outSign(s) * xAcross(H.outQuick), y: stem.y };
      return [s, stem, out];
    }
    case "FLAT": {
      const out = { x: s.x + outSign(s) * xAcross(H.flat), y: yUp(DEPTH.quick) };
      return [s, out];
    }
    case "CHECK": {
      return [s, { x: s.x + inSign(s) * xAcross(3), y: yUp(DEPTH.quick - 1) }];
    }

    /* Intermediate */
    case "OUT": {
      const stem = { x: s.x, y: yUp(DEPTH.mid) };
      const breakPt = { x: s.x + outSign(s) * xAcross(H.outDeep), y: stem.y };
      return [s, stem, breakPt];
    }
    case "OUT_LOW": {
      const stem = { x: s.x, y: yUp(DEPTH.quick) };
      const breakPt = { x: s.x + outSign(s) * xAcross(H.outQuick), y: stem.y };
      return [s, stem, breakPt];
    }
    case "OUT_MID": {
      const stem = { x: s.x, y: yUp(DEPTH.mid) };
      const breakPt = { x: s.x + outSign(s) * xAcross(12), y: stem.y };
      return [s, stem, breakPt];
    }
    case "OUT_HIGH": {
      const stem = { x: s.x, y: yUp(DEPTH.deep) };
      const breakPt = { x: s.x + outSign(s) * xAcross(H.outDeep), y: stem.y };
      return [s, stem, breakPt];
    }
    case "CURL": {
      const stem = { x: s.x, y: yUp(DEPTH.curl) };
      const work = { x: stem.x, y: yUp(DEPTH.curl - 2) };
      return [s, stem, work];
    }
    case "COMEBACK":
    case "COMEBACK_MID": {
      const stem = { x: s.x, y: yUp(DEPTH.dig) };
      const back = { x: sidelineX(s, 6), y: yUp(DEPTH.curl) };
      return [s, stem, back];
    }
    case "COMEBACK_LOW": {
      const stem = { x: s.x, y: yUp(DEPTH.curl) };
      const back = { x: sidelineX(s, 8), y: yUp(DEPTH.quick) };
      return [s, stem, back];
    }
    case "COMEBACK_HIGH": {
      const stem = { x: s.x, y: yUp(DEPTH.shot - 2) };
      const back = { x: sidelineX(s, 6), y: yUp(DEPTH.dig) };
      return [s, stem, back];
    }
    case "DIG": {
      const stem = { x: s.x, y: yUp(DEPTH.dig) };
      const inCut = { x: QB.x + inSign(s) * xAcross(10), y: stem.y };
      return [s, stem, inCut];
    }

    /* Deep */
    case "POST": {
      const stem = { x: s.x, y: yUp(DEPTH.deep) };
      const bend = { x: QB.x, y: yUp(DEPTH.shot) };
      return [s, stem, bend];
    }
    case "CORNER":
    case "CORNER_MID": {
      const stem  = { x: s.x, y: yUp(DEPTH.deep - 2) };
      const breakOut = { x: s.x + outSign(s) * xAcross(12), y: yUp(DEPTH.deep - 4) };
      const flag  = { x: sidelineX(s, 8), y: yUp(DEPTH.shot - 2) };
      return [s, stem, breakOut, flag];
    }
    case "CORNER_LOW": {
      const stem  = { x: s.x, y: yUp(DEPTH.mid) };
      const breakOut = { x: s.x + outSign(s) * xAcross(11), y: yUp(DEPTH.mid - 1) };
      const flag  = { x: sidelineX(s, 10), y: yUp(DEPTH.deep) };
      return [s, stem, breakOut, flag];
    }
    case "CORNER_HIGH": {
      const stem  = { x: s.x, y: yUp(DEPTH.deep) };
      const breakOut = { x: s.x + outSign(s) * xAcross(12), y: yUp(DEPTH.deep - 2) };
      const flag  = { x: sidelineX(s, 6), y: yUp(DEPTH.shot) };
      return [s, stem, breakOut, flag];
    }

    /* Crossers */
    case "OVER": {
      const stem = { x: s.x, y: yUp(DEPTH.deep - 2) };
      const cross = { x: oppositeHashX(s), y: yUp(DEPTH.deep) };
      return [s, stem, cross];
    }
    case "CROSS": {
      const stem = { x: s.x, y: yUp(DEPTH.mid - 1) };
      const cross = { x: oppositeHashX(s), y: yUp(DEPTH.mid) };
      return [s, stem, cross];
    }
    case "SHALLOW": {
      const under = { x: oppositeHashX(s), y: yUp(18) };
      return [s, under];
    }

    /* RB */
    case "WHEEL": {
      const flat = { x: sidelineX(s, 8), y: yUp(DEPTH.quick) };
      const up = { x: flat.x, y: yUp(DEPTH.deep) };
      return [s, flat, up];
    }

    default:
      return [s];
  }
}

// Man leverage helper: rough outside/inside leverage based on defender start vs receiver align
// pick likely man defender for the receiver (by alignment side)
function likelyManDefender(rid: ReceiverID, sAlign: Pt): DefenderID {
  if (rid === "SLOT") return "NICKEL";
  if (rid === "TE") return "SS";
  if (rid === "RB") return "MIKE";
  return sAlign.x < QB.x ? "CB_L" : "CB_R";
}

function isOutsideLeverage(rid: ReceiverID, A: AlignMap, starts: Record<DefenderID, Pt>): boolean {
  const s = A[rid];
  if (!s) return false;
  const did: DefenderID = likelyManDefender(rid, s);
  const d = starts[did] ?? { x: s.x, y: s.y };
  const left = s.x < QB.x;
  return left ? d.x < s.x : d.x > s.x;
}

function leverageAdjustPath(
  rid: ReceiverID,
  path: Pt[],
  cover: CoverageID,
  A: AlignMap,
  starts: Record<DefenderID, Pt>,
  levMeta?: Record<ReceiverID, { side: 'inside' | 'outside' | 'even'; via: string }>,
  adjMeta?: Record<ReceiverID, { dxYds: number; dDepthYds: number }>
): Pt[] {
  if (!path || path.length < 2) return path;
  const isMan = MAN_COVERAGES.has(cover);
  const isMatch = cover === 'PALMS' || cover === 'QUARTERS' || cover === 'C6';
  if (!(isMan || isMatch)) return path;
  const outside = isOutsideLeverage(rid, A, starts);
  const s = A[rid];
  const sign = outSign(s);

  const clone = path.map(p => ({ ...p }));
  const n = clone.length;
  let totalDx = 0, totalDy = 0;
  const adjustBreak = (idx: number, horizYds: number, depthDeltaYds: number) => {
    if (idx <= 0 || idx >= n) return;
    const p = clone[idx];
    // Horizontal adjust toward/away from sideline
    const targetX = outside ? s.x + sign * xAcross(horizYds * 0.75) : s.x + sign * xAcross(horizYds * 1.1);
    const maxX = sidelineX(s, 6);
    const oldX = clone[idx].x;
    clone[idx].x = sign > 0 ? Math.min(targetX, maxX) : Math.max(targetX, maxX);
    // Depth tweak
    const dy = (outside ? Math.abs(depthDeltaYds) : -Math.abs(depthDeltaYds)) * YPX;
    const oldY = clone[idx].y;
    clone[idx].y = p.y - dy;
    totalDx += (clone[idx].x - oldX) / XPX;
    totalDy += (oldY - clone[idx].y) / YPX; // positive = deeper
  };

  // Identify route class by geometry and adjust 2nd and/or last points
  if (n === 3) {
    // likely OUT/COMEBACK
    adjustBreak(2, Math.abs(clone[2].x - s.x) / XPX, 1.0);
  } else if (n >= 4) {
    // likely CORNER family
    adjustBreak(2, Math.abs(clone[2].x - s.x) / XPX, 0.8);
    adjustBreak(n - 1, Math.abs(clone[n - 1].x - s.x) / XPX, 1.2);
  }
  if (levMeta) levMeta[rid] = { side: outside ? 'outside' : 'inside', via: isMan ? 'man' : cover };
  if (adjMeta) adjMeta[rid] = { dxYds: totalDx, dDepthYds: totalDy };
  return clone;
}

/* --------- Formations (fixed align) --------- */
const FORMATIONS: Record<FormationName, AlignMap> = {
  TRIPS_RIGHT: {
    X: { x: xAcross(10), y: yUp(15) },
    Z: { x: xAcross(FIELD_WIDTH_YDS - 6), y: yUp(15) },
    SLOT: { x: xAcross(FIELD_WIDTH_YDS - 16), y: yUp(15) },
    TE: { x: xAcross(FIELD_WIDTH_YDS - 22), y: yUp(15) },
    RB: { x: xAcross(FIELD_WIDTH_YDS / 2 - 2), y: yUp(12) },
  },
  DOUBLES: {
    X: { x: xAcross(10), y: yUp(15) },
    Z: { x: xAcross(FIELD_WIDTH_YDS - 10), y: yUp(15) },
    SLOT: { x: xAcross(FIELD_WIDTH_YDS - 20), y: yUp(15) },
    TE: { x: xAcross(20), y: yUp(15) },
    RB: { x: xAcross(FIELD_WIDTH_YDS / 2 - 2), y: yUp(12) },
  },
  BUNCH_LEFT: {
    X: { x: xAcross(12), y: yUp(15) },
    SLOT: { x: xAcross(16), y: yUp(17) },
    TE: { x: xAcross(18.5), y: yUp(13.5) },
    Z: { x: xAcross(FIELD_WIDTH_YDS - 10), y: yUp(15) },
    RB: { x: xAcross(FIELD_WIDTH_YDS / 2 - 2), y: yUp(12) },
  },
};

function strongSide(receivers: AlignMap): "left" | "right" {
  let left = 0,
    right = 0;
  (Object.keys(receivers) as ReceiverID[]).forEach((id) => {
    if (receivers[id].x < QB.x) left++;
    else right++;
  });
  return right >= left ? "right" : "left";
}

type Numbering = Record<
  ReceiverID,
  { side: "left" | "right"; number: 1 | 2 | 3; band: "strong" | "weak" }
>;

function computeNumbering(align: AlignMap): Numbering {
  const ss = strongSide(align);
  const ids: ReceiverID[] = ["X", "Z", "SLOT", "TE", "RB"];
  const leftIds = ids.filter((id) => align[id].x < QB.x).sort((a, b) => align[a].x - align[b].x);
  const rightIds = ids.filter((id) => align[id].x >= QB.x).sort((a, b) => align[b].x - align[a].x);

  const tag = (lst: ReceiverID[], side: "left" | "right", band: "strong" | "weak") => {
    const out = {} as Numbering;
    lst.forEach((id, i) => {
      out[id] = { side, number: (i + 1) as 1 | 2 | 3, band };
    });
    return out;
  };
  const leftBand: "strong" | "weak" = ss === "left" ? "strong" : "weak";
  const rightBand: "strong" | "weak" = ss === "right" ? "strong" : "weak";
  return { ...tag(leftIds, "left", leftBand), ...tag(rightIds, "right", rightBand) } as Numbering;
}

/* --------- Concept defaults (used if JSON lacks assignments) --------- */
function buildConceptRoutes(
  conceptId: FootballConceptId,
  A: AlignMap,
  coverage: CoverageID
): RouteMap {
  const ID = (conceptId as string).toUpperCase();
  const mk = (m: Partial<Record<ReceiverID, RouteKeyword>>): RouteMap => ({
    X: routeFromKeyword(m.X ?? "HITCH", A.X, coverage),
    Z: routeFromKeyword(m.Z ?? "HITCH", A.Z, coverage),
    SLOT: routeFromKeyword(m.SLOT ?? "FLAT", A.SLOT, coverage),
    TE: routeFromKeyword(m.TE ?? "STICK", A.TE, coverage),
    RB: routeFromKeyword(m.RB ?? "CHECK", A.RB, coverage),
  });

  switch (ID) {
    case "FOUR_VERTS":
      return mk({ X: "GO", Z: "GO", SLOT: "BENDER", TE: "SEAM", RB: "CHECK" });
    case "SAIL":
    case "BOOT_FLOOD":
      return mk({ X: "GO", SLOT: "OUT", TE: "FLAT", Z: "COMEBACK", RB: "CHECK" });
    case "MESH":
      return mk({ X: "SHALLOW", SLOT: "SHALLOW", Z: "DIG", TE: "CORNER", RB: "CHECK" });
    case "STICK":
    case "SPACING":
    case "CURL_FLAT":
      return mk({ X: "CURL", Z: "CURL", SLOT: "FLAT", TE: "STICK", RB: "FLAT" });
    case "DAGGER":
      return mk({ SLOT: "SEAM", X: "DIG", Z: "GO", TE: "CHECK", RB: "CHECK" });
    case "Y_CROSS":
      return mk({ TE: "OVER", X: "POST", Z: "CURL", SLOT: "FLAT", RB: "CHECK" });
    case "SHALLOW":
      return mk({ SLOT: "SHALLOW", X: "DIG", Z: "POST", TE: "SEAM", RB: "CHECK" });
    case "LEVELS":
      return mk({ SLOT: "SHALLOW", X: "DIG", Z: "CURL", TE: "SEAM", RB: "CHECK" });
    case "MILLS":
      return mk({ X: "POST", SLOT: "DIG", Z: "GO", TE: "SEAM", RB: "CHECK" });
    case "POST_WHEEL":
      return mk({ SLOT: "WHEEL", X: "POST", Z: "COMEBACK", TE: "CURL", RB: "FLAT" });
    case "SLANT_FLAT":
      return mk({ X: "SLANT", SLOT: "FLAT", Z: "HITCH", TE: "STICK", RB: "CHECK" });
    case "DRIVE":
      return mk({ SLOT: "SHALLOW", X: "DIG", Z: "COMEBACK", TE: "SEAM", RB: "CHECK" });
    default:
      return mk({ X: "COMEBACK", Z: "CURL", SLOT: "FLAT", TE: "DIG", RB: "CHECK" });
  }
}

/* --------- Zone landmarks --------- */
const D_ALIGN: Record<DefenderID, Pt> = {
  CB_L: { x: xAcross(8), y: yUp(16.5) },
  CB_R: { x: xAcross(FIELD_WIDTH_YDS - 8), y: yUp(16.5) },
  NICKEL: { x: xAcross(FIELD_WIDTH_YDS - 18), y: yUp(17) },
  SAM: { x: xAcross(20), y: yUp(22) },
  MIKE: { x: xAcross(FIELD_WIDTH_YDS / 2), y: yUp(22) },
  WILL: { x: xAcross(FIELD_WIDTH_YDS - 20), y: yUp(22) },
  FS: { x: xAcross(FIELD_WIDTH_YDS / 2), y: yUp(35) },
  SS: { x: xAcross(FIELD_WIDTH_YDS / 2 - 12), y: yUp(32) },
};

const ZONES = {
  DEEP_LEFT: { x: xAcross(12), y: yUp(40) },
  DEEP_MIDDLE: { x: xAcross(FIELD_WIDTH_YDS / 2), y: yUp(42) },
  DEEP_RIGHT: { x: xAcross(FIELD_WIDTH_YDS - 12), y: yUp(40) },
  CURL_LEFT: { x: xAcross(18), y: yUp(26) },
  HOOK_MID: { x: xAcross(FIELD_WIDTH_YDS / 2), y: yUp(24) },
  CURL_RIGHT: { x: xAcross(FIELD_WIDTH_YDS - 18), y: yUp(26) },
  FLAT_LEFT: { x: xAcross(8), y: yUp(20) },
  FLAT_RIGHT: { x: xAcross(FIELD_WIDTH_YDS - 8), y: yUp(20) },
};

/* --------- Coverage families --------- */
const MAN_COVERAGES   = new Set<CoverageID>(["C0","C1"]);
const MATCH_COVERAGES = new Set<CoverageID>(["PALMS","C6","QUARTERS","C9"]);
const ZONE_COVERAGES  = new Set<CoverageID>(["C2","TAMPA2","C3","C4"]);
type C3Rotation = 'SKY' | 'BUZZ' | 'CLOUD_STRONG';
type C3RotationMode = 'AUTO' | C3Rotation;

/* =========================================
   COMPONENT
   ========================================= */

export default function PlaySimulator({
  conceptId,
  coverage,
  onSnapshot,
}: {
  conceptId: FootballConceptId;
  coverage: CoverageID;
  onSnapshot?: (snap: PlaySnapshot, meta: SnapMeta) => void;
}) {
  const [phase, setPhase] = useState<"pre" | "post" | "decided">("pre");
  const { t, setT, seek, start: startClock, stop: stopClock, reset: resetClock } = usePlayClock(3000);
  const [decision, setDecision] = useState<ReceiverID | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [explain, setExplain] = useState<string | null>(null);

  const [formation, setFormation] = useState<FormationName>("TRIPS_RIGHT");
  const [manualAssignments, setManualAssignments] = useState<AssignMap>({});

  const [align, setAlign] = useState<AlignMap>(FORMATIONS[formation]);
  const [O, setO] = useState<RouteMap>(() =>
    buildConceptRoutes(conceptId, FORMATIONS[formation], coverage));
  const [numbering, setNumbering] = useState<Numbering>(() => computeNumbering(FORMATIONS[formation]));

  // Defender starts (dynamic, strength-aware)
  const [Dstart, setDstart] = useState<Record<DefenderID, Pt>>(D_ALIGN);
  // Speeds
  const [recSpeed, setRecSpeed] = useState(1.0); // 0.7–1.5
  const [defSpeed, setDefSpeed] = useState(0.95); // 0.7–1.5

  // Sounds + notes
  const [soundOn, setSoundOn] = useState(true);
  const [audibleNote, setAudibleNote] = useState<string>("");

  // Ball flight
  const [ballFlying, setBallFlying] = useState(false);
  const [ballT, setBallT] = useState(0);
  const [ballP0, setBallP0] = useState<Pt>(QB);
  const [ballP1, setBallP1] = useState<Pt>(QB);
  const [ballP2, setBallP2] = useState<Pt>(QB);
  const [catchAt, setCatchAt] = useState<Pt | null>(null);

  // --- Blocking state (success odds: TE 90%, RB 70%)
  type Blocker = "TE" | "RB";
  type BlockMap = Partial<Record<Blocker, DefenderID | null>>;

  const [teBlock, setTeBlock] = useState(false);
  const [rbBlock, setRbBlock] = useState(false);

  const [, setBlockAssignments] = useState<BlockMap>({});
  const [blockedDefenders, setBlockedDefenders] = useState<Set<DefenderID>>(new Set());
  const [blockEngage, setBlockEngage] = useState<Partial<Record<DefenderID, Pt>>>({});

  // --- Audible UI ---
  const [audibleOn, setAudibleOn] = useState(false);
  const [audTarget, setAudTarget] = useState<ReceiverID | "">("");
  const [audRoute, setAudRoute]   = useState<RouteKeyword | "">("");

  const [, setCaught] = useState(false);

  // Relative speed multipliers by position (realistic-ish deltas)
  function receiverSpeedMult(id: ReceiverID): number {
    switch (id) {
      case "TE": return 0.90; // TEs a bit slower top-end vs WRs
      case "RB": return 0.98; // RBs quick but shorter stride on routes
      case "SLOT": return 0.98; // quick area burst, slightly less stride on deep
      default: return 1.00; // X/Z boundary WRs baseline
    }
  }
  function defenderSpeedMult(id: DefenderID): number {
    switch (id) {
      case "CB_L":
      case "CB_R":
        return 1.00; // top-end corners
      case "NICKEL":
        return 0.98; // close to CB
      case "FS":
      case "SS":
        return 0.96; // a touch slower than CBs
      case "SAM":
      case "MIKE":
      case "WILL":
        return 0.88; // LBs
      default:
        return 1.0;
    }
  }

  // Deterministic RNG per play
  const [playId, setPlayId] = useState(0);
  const [rngSeed, setRngSeed] = useState<number>(() => mixSeed(Date.now() >>> 0, Math.floor(Math.random() * 0x7fffffff)));
  const rngRef = useRef<XorShift32>(new XorShift32(mixSeed(rngSeed, playId)));
  useEffect(() => {
    rngRef.current = new XorShift32(mixSeed(rngSeed, playId));
  }, [rngSeed, playId]);

  // Restore from URL (formation, audibles, block flags, seed, playId)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const f = sp.get('f');
    if (f === 'TRIPS_RIGHT' || f === 'DOUBLES' || f === 'BUNCH_LEFT') setFormation(f as FormationName);
    const as = sp.get('as');
    if (as) {
      try { const parsed = JSON.parse(decodeURIComponent(as)); setManualAssignments(parsed); } catch {}
    }
    const tb = sp.get('tb'); setTeBlock(!!tb);
    const rb = sp.get('rb'); setRbBlock(!!rb);
    const pid = sp.get('pid'); if (pid) setPlayId(Number(pid));
    const sd = sp.get('seed'); if (sd) setRngSeed(Number(sd));
  }, []);

  // Openness metric per frame
  type OpenInfo = { score: number; sepYds: number; nearest: DefenderID | null };
  const [openness, setOpenness] = useState<Record<ReceiverID, OpenInfo>>({
    X: { score: 0, sepYds: 0, nearest: null },
    Z: { score: 0, sepYds: 0, nearest: null },
    SLOT: { score: 0, sepYds: 0, nearest: null },
    TE: { score: 0, sepYds: 0, nearest: null },
    RB: { score: 0, sepYds: 0, nearest: null },
  });
  const [lastWindow, setLastWindow] = useState<{ rid: ReceiverID; info: OpenInfo } | null>(null);
  const [lastThrowArea, setLastThrowArea] = useState<{ key: string; horiz: 'L'|'M'|'R'; band: 'SHORT'|'MID'|'DEEP'; depthYds: number } | null>(null);
  const [lastHoldMs, setLastHoldMs] = useState<number | null>(null);
  // Leverage meta for UI/AI
  const [levInfo, setLevInfo] = useState<Record<ReceiverID, { side: 'inside'|'outside'|'even'; via: string }>>({
    X: { side: 'even', via: '' }, Z: { side: 'even', via: '' }, SLOT: { side: 'even', via: '' }, TE: { side: 'even', via: '' }, RB: { side: 'even', via: '' }
  });
  const [levAdjust, setLevAdjust] = useState<Record<ReceiverID, { dxYds: number; dDepthYds: number }>>({
    X: { dxYds: 0, dDepthYds: 0 }, Z: { dxYds: 0, dDepthYds: 0 }, SLOT: { dxYds: 0, dDepthYds: 0 }, TE: { dxYds: 0, dDepthYds: 0 }, RB: { dxYds: 0, dDepthYds: 0 }
  });
  const [c3Rotation, setC3Rotation] = useState<C3Rotation>('SKY');
  const [c3RotationMode, setC3RotationMode] = useState<C3RotationMode>('AUTO');
  // Minimal AI log (append per snap)
  const [, setAiLog] = useState<Array<{ playId: number; coverage: CoverageID; formation: FormationName; leverage: typeof levInfo; adjustments: typeof levAdjust }>>([]);

  const PLAY_MS = 3000; // play clock duration (matches Snap timer)
  

  type ThrowMeta = { p0: Pt; p1: Pt; p2: Pt; tStart: number; frac: number };
  const [throwMeta, setThrowMeta] = useState<ThrowMeta | null>(null);

  // Generous menu of routes
  const ROUTE_MENU: RouteKeyword[] = [
    "GO","SPEED_OUT","CURL",
    "OUT_LOW","OUT_MID","OUT_HIGH",
    "CORNER_LOW","CORNER_MID","CORNER_HIGH",
    "COMEBACK_LOW","COMEBACK_MID","COMEBACK_HIGH",
    "DIG","POST",
    "SLANT","WHEEL","CHECK",
  ];

  const canThrowNow = useMemo(
  () => phase === "post" && !ballFlying && !decision && t < 0.999,
  [phase, ballFlying, decision, t]
);

  // Receivers available to audible (exclude blockers)
  const selectableReceivers = useMemo<ReceiverID[]>(
    () => (["X","Z","SLOT","TE","RB"] as ReceiverID[])
      .filter(id => !(id === "TE" && teBlock) && !(id === "RB" && rbBlock)),
    [teBlock, rbBlock]
  );

  const hasAudibles = useMemo(() => Object.keys(manualAssignments).length > 0, [manualAssignments]);

  // Drive the play clock via hook based on phase
  useEffect(() => {
    if (phase === "post") {
      // Restart clock cleanly for a new snap
      resetClock();
      // Defer start to next microtask to let reset state settle
      queueMicrotask(() => startClock());
    } else {
      stopClock();
    }
  }, [phase, resetClock, startClock, stopClock]);


  // --- CB technique: normal, press on both, press only to strength
type CBTechnique = "normal" | "press" | "pressStrong";
const [cbTechnique] = useState<CBTechnique>("normal");

// Press outcomes per CB at the snap
type CBPressOutcome = "NONE" | "JAM_LOCK" | "WHIFF" | "JAM_AND_RELEASE";
type CBPressState = { rid: ReceiverID | null; outcome: CBPressOutcome };
type CBPressInfo = { outcome: CBPressOutcome; untilT: number }; // untilT is play-clock fraction [0..1]

const [cbPress, setCbPress] = useState<{ CB_L: CBPressState; CB_R: CBPressState }>({
    CB_L: { rid: null, outcome: "NONE" },
    CB_R: { rid: null, outcome: "NONE" },
});

// Fractions of play clock for delays (uses your PLAY_MS)
const PRESS_DELAY_FRAC = 0.3 / (PLAY_MS / 1000);   // ~0.10 if PLAY_MS=3000
const WHIFF_DELAY_FRAC = 1.0 / (PLAY_MS / 1000);   // ~0.33 if PLAY_MS=3000

// Sample press outcomes for corners at the instant the play starts
useEffect(() => {
  // Ensure pre-snap clears any prior press state
  if (phase !== "post") {
    const leftOne  = left1();
    const rightOne = right1();
    setCbPress({
      CB_L: { rid: leftOne,  outcome: "NONE" },
      CB_R: { rid: rightOne, outcome: "NONE" },
    });
    return;
  }

  const isMan = coverage === "C0" || coverage === "C1";
  const sr = strongIsRight();                     // true if strength = right
  const strongCB: DefenderID = sr ? "CB_R" : "CB_L";
  const weakCB:   DefenderID = sr ? "CB_L" : "CB_R";

  // 70% strong, 20% weak (C0/C1 only). Otherwise no auto press.
  const wantStrong = isMan && rngRef.current.nextFloat() < 0.70;
  const wantWeak   = isMan && rngRef.current.nextFloat() < 0.20;

  // If you support manual technique overrides, honor them here:
  // - "press": force both to press in man
  // - "pressStrong": force strong CB to press in man
  // - "normal": use the auto 70/20 above
  // (Remove/adjust this block if you don’t have `cbTechnique`.)
  const forceBoth   = (typeof cbTechnique !== "undefined") && cbTechnique === "press";
  const forceStrong = (typeof cbTechnique !== "undefined") && cbTechnique === "pressStrong";

  const active: Record<DefenderID, boolean> = {
    CB_L: false, CB_R: false, NICKEL: false, FS: false, SS: false, SAM: false, MIKE: false, WILL: false
  };
  if (isMan) {
    if (forceBoth) {
      active.CB_L = true; active.CB_R = true;
    } else if (forceStrong) {
      active[strongCB] = true;
    } else {
      active[strongCB] = wantStrong;
      active[weakCB]   = wantWeak;
    }
  }

  // Convert “press” into an outcome with the requested odds:
  // - 10% JAM_LOCK (stuck at LOS)
  // - 20% WHIFF (stands still 1.0s then chases)
  // - 70% JAM_AND_RELEASE (holds 0.3s then chases)
  const secToFrac = (ms: number) => ms / (PLAY_MS); // 300ms -> 0.1 when PLAY_MS=3000
  const pick = (on: boolean): CBPressInfo => {
    if (!on) return { outcome: "NONE", untilT: 0 };
    const r = rngRef.current.nextFloat();
    if (r < 0.10) return { outcome: "JAM_LOCK",         untilT: 9 };                 // >1 means “whole play”
    if (r < 0.30) return { outcome: "WHIFF",            untilT: secToFrac(1000) };   // ~1.0s
    return            { outcome: "JAM_AND_RELEASE", untilT: secToFrac(300)  };   // ~0.3s
  };

  

  

  const leftActive  = active.CB_L;
  const rightActive = active.CB_R;
  const L = pick(leftActive);
  const R = pick(rightActive);
  const leftOne  = left1();   // helper you already have
  const rightOne = right1();  // helper you already have

setCbPress({
  CB_L: { rid: L.outcome === "NONE" ? null : leftOne,  outcome: L.outcome as CBPressOutcome },
  CB_R: { rid: R.outcome === "NONE" ? null : rightOne, outcome: R.outcome as CBPressOutcome },
});


  // Pre-snap depth look (press ≈ 1–2 yds; normal ≈ 7 yds)
  const yPress = yUp(16.5);
  const yOff   = yUp(22);
  const leftOuter:  ReceiverID = align.X.x < align.Z.x ? "X" : "Z";
  const rightOuter: ReceiverID = leftOuter === "X" ? "Z" : "X";

  setDstart(s => ({
    ...s,
    CB_L: { x: align[leftOuter].x,  y: L.outcome !== "NONE" ? yPress : yOff },
    CB_R: { x: align[rightOuter].x, y: R.outcome !== "NONE" ? yPress : yOff },
  }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [phase, coverage, align, numbering, cbTechnique]);

  // Build AI payload helpers
  function buildSnapshot(): import("@/types/play").PlaySnapshot {
    return {
      conceptId,
      coverage,
      formation,
      align,
      routes: O,
      assignments: manualAssignments,
      numbering: numbering as unknown as Record<string, unknown>,
      recSpeed,
      defSpeed,
      rngSeed,
      playId
    };
  }

  function buildSnapMeta(): import("@/types/play").SnapMeta {
    // Coverage insights (per current t)
    let palmsTrapNow = false;
    let quartersCarry2Now = false;
    const sr = strongIsRight();
    const twoStrong = wrPos(sr ? (right2() ?? "SLOT") : (left2() ?? "SLOT"), t);
    if (coverage === 'PALMS') palmsTrapNow = yDepthYds(twoStrong) <= 10;
    if (coverage === 'QUARTERS') quartersCarry2Now = yDepthYds(twoStrong) >= 12;
    const safFS = defenderPos(coverage, 'FS', t);
    const safSS = defenderPos(coverage, 'SS', t);
    const safDeep = [safFS, safSS].filter(p => yDepthYds(p) >= 14).length;
    const mofState: 'one-high' | 'two-high' = safDeep >= 2 ? 'two-high' : 'one-high';

    return {
      press: {
        CB_L: cbPress.CB_L,
        CB_R: cbPress.CB_R,
      },
      blocks: {
        blockedDefenders: Array.from(blockedDefenders),
        teBlock,
        rbBlock,
      },
      roles: {
        blitzers: manExtraRoles.blitzers,
        spy: manExtraRoles.spy ?? null,
      },
      leverage: levInfo,
      leverageAdjust: levAdjust,
      coverageInsights: {
        c3Rotation: coverage === 'C3' ? c3Rotation : undefined,
        palmsTrapNow,
        quartersCarry2Now,
        mofState,
      }
    };
  }

  // Emit snapshot/meta to parent (for CoachChat) on relevant changes
  useEffect(() => {
    if (!onSnapshot) return;
    try {
      onSnapshot(buildSnapshot(), buildSnapMeta());
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptId, coverage, formation, align, O, cbPress, blockedDefenders, teBlock, rbBlock, levInfo, levAdjust, recSpeed, defSpeed, rngSeed, playId]);

  // --- AI Audible ---
  async function aiAudible() {
    try {
      const payload = {
        conceptId,
        coverage,
        formation,
        assignments: manualAssignments,
        numbering: numbering as unknown as Record<string, unknown>,
        snapshot: buildSnapshot(),
        snapMeta: buildSnapMeta(),
      };
      const res = await fetch("/api/football-audible", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const suggestion: { formation?: FormationName; assignments?: Partial<Record<ReceiverID, RouteKeyword>>; rationale?: string } = await res.json();
      if (suggestion.formation) setFormation(suggestion.formation);
      if (suggestion.assignments) setManualAssignments(suggestion.assignments);
      setAudibleNote(suggestion.rationale ?? "Audible applied.");
      // Reset to pre-snap after changing routes
      setPhase("pre");
      setT(0);
      setDecision(null);
      setGrade(null);
      setExplain(null);
      setBallFlying(false);
      setBallT(0);
      setCatchAt(null);
    } catch {
      setAudibleNote("AI audible unavailable. Try again.");
    }
  }

  /** -------- MAN (C0/C1) snap-time extra roles -------- */
type ExtraRoles = { blitzers: DefenderID[]; spy: DefenderID | null };
const [manExtraRoles, setManExtraRoles] = useState<ExtraRoles>({ blitzers: [], spy: null });

useEffect(() => {
  // Only (re)roll roles when the snap actually starts
  if (phase !== "post") {
    setManExtraRoles({ blitzers: [], spy: null });
    return;
  }
  if (coverage !== "C0" && coverage !== "C1") {
    setManExtraRoles({ blitzers: [], spy: null });
    return;
  }

  // In this sim, SAM & WILL are the "extra" LBs (CBs/Nickel/SS/MIKE are manned up)
  const extras: DefenderID[] = ["SAM", "WILL"];

  // Rule: never 2 spies. Outcomes:
  //  - both blitz, OR
  //  - exactly one blitz + one spy
  let blitzers: DefenderID[] = [];
  let spy: DefenderID | null = null;

  if (extras.length === 2) {
    if (rngRef.current.nextFloat() < 0.5) {
      // both blitz
      blitzers = extras.slice();
    } else {
      // one spies, the other blitzes
      spy = rngRef.current.nextFloat() < 0.5 ? extras[0] : extras[1];
      blitzers = [spy === extras[0] ? extras[1] : extras[0]];
    }
  } else if (extras.length === 1) {
    // single extra: blitz 70% else spy
    if (rngRef.current.nextFloat() < 0.7) blitzers = extras;
    else spy = extras[0];
  }

  setManExtraRoles({ blitzers, spy });
}, [phase, coverage]);

  // Rebuild alignment, numbering, routes (with leverage), and defender starts whenever inputs change
  useEffect(() => {
    const A = FORMATIONS[formation];
    setAlign(A);
    setNumbering(computeNumbering(A));

    // Compute defender starts first so we can adjust routes by leverage
    const starts = computeDefenderStarts(A);

    const routes = buildConceptRoutes(conceptId, A, coverage);

    if (teBlock) routes.TE = passProPathTE(A);
    if (rbBlock) routes.RB = passProPathRB(A);

    // Apply manual audible overrides (skip if that player is blocking)
    (Object.entries(manualAssignments) as [ReceiverID, RouteKeyword][])
      .forEach(([rid, kw]) => {
        if ((rid === "TE" && teBlock) || (rid === "RB" && rbBlock)) return;
        routes[rid] = routeFromKeyword(kw, A[rid], coverage);
      });

    // Leverage-driven tweaks (man + match) and collect meta
    const levMeta: Record<ReceiverID, { side: 'inside'|'outside'|'even'; via: string }> = { X: {side:'even', via:''}, Z: {side:'even', via:''}, SLOT: {side:'even', via:''}, TE: {side:'even', via:''}, RB: {side:'even', via:''} };
    const adjMeta: Record<ReceiverID, { dxYds: number; dDepthYds: number }> = { X: {dxYds:0,dDepthYds:0}, Z: {dxYds:0,dDepthYds:0}, SLOT: {dxYds:0,dDepthYds:0}, TE: {dxYds:0,dDepthYds:0}, RB: {dxYds:0,dDepthYds:0} };
    (Object.keys(routes) as ReceiverID[]).forEach((rid) => {
      if ((rid === "TE" && teBlock) || (rid === "RB" && rbBlock)) return;
      routes[rid] = leverageAdjustPath(rid, routes[rid], coverage, A, starts, levMeta, adjMeta);
    });

    setO(routes);

    // strength-aware defensive starting spots
    setDstart(starts);

    // reset to pre-snap for consistency
    setPhase("pre");
    setT(0);
    setDecision(null);
    setGrade(null);
    setExplain(null);
    setBallFlying(false);
    setBallT(0);
    setCatchAt(null);
    // expose leverage info for UI/AI
    setLevInfo(levMeta);
    setLevAdjust(adjMeta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formation, conceptId, coverage, teBlock, rbBlock, manualAssignments, setT]);

  useEffect(() => {
    if (phase !== "post") {
      setBlockAssignments({});
      setBlockedDefenders(new Set());
      setBlockEngage({});
      return;
    }

    const sr = strongIsRight(); // reads `numbering`
    const assigns: BlockMap = {};
    const engages: Partial<Record<DefenderID, Pt>> = {};
    const blocked = new Set<DefenderID>();

    if (teBlock) {
      const tgt = computeBlockTarget("TE", coverage, align, Dstart, sr);
      assigns.TE = tgt ?? null;
      const ok = rngRef.current.nextFloat() < 0.90; // TE success 90%
      if (tgt && ok) {
        blocked.add(tgt);
        engages[tgt] = computeEngagePoint("TE", (O.TE[0] ?? align.TE), Dstart[tgt]);
      }
    }

    if (rbBlock) {
      const tgt = computeBlockTarget("RB", coverage, align, Dstart, sr);
      assigns.RB = tgt ?? null;
      const ok = rngRef.current.nextFloat() < 0.70; // RB success 70%
      if (tgt && ok) {
        blocked.add(tgt);
        engages[tgt] = computeEngagePoint("RB", (O.RB[0] ?? align.RB), Dstart[tgt]);
      }
    }

    setBlockAssignments(assigns);
    setBlockedDefenders(blocked);
    setBlockEngage(engages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, teBlock, rbBlock, coverage, align, Dstart, O]);

  // Choose C3 rotation each snap
  useEffect(() => {
    if (coverage !== 'C3') return;
    if (phase !== 'post') return;
    if (c3RotationMode === 'AUTO') {
      const r = rngRef.current.nextFloat();
      const rot: C3Rotation = r < 0.5 ? 'SKY' : r < 0.85 ? 'BUZZ' : 'CLOUD_STRONG';
      setC3Rotation(rot);
    } else {
      setC3Rotation(c3RotationMode);
    }
  }, [phase, coverage, c3RotationMode]);

  const DEFENDER_IDS: DefenderID[] = ["CB_L", "CB_R", "NICKEL", "FS", "SS", "SAM", "MIKE", "WILL"];

  function wrPosSafe(id: ReceiverID, tt: number): Pt {
  const path = O[id];
  const tPlay = Math.max(0, Math.min(1, tt));
  let tAdj = tPlay;

  // NB: must be CB_L / CB_R (underscore), and guard with optional chaining
  const pressL = cbPress?.CB_L;
  const pressR = cbPress?.CB_R;

  const mine =
    pressL?.rid === id ? pressL :
    pressR?.rid === id ? pressR :
    undefined;

  if (mine && mine.outcome !== "NONE") {
    if (mine.outcome === "JAM_LOCK") {
      // stuck on LOS for the whole play
      return align[id] ?? QB;
    }
    if (mine.outcome === "JAM_AND_RELEASE") {
      // delay WR’s route by PRESS_DELAY_FRAC, then continue
      const denom = (1 - PRESS_DELAY_FRAC) || 1; // guard divide-by-zero
      tAdj = tPlay < PRESS_DELAY_FRAC ? 0 : (tPlay - PRESS_DELAY_FRAC) / denom;
    }
    // WHIFF → no WR delay
  }

  const s = Math.min(1, tAdj * recSpeed * receiverSpeedMult(id));
  if (!path || path.length === 0) return align[id] ?? QB;
  return posOnPathLenScaled(path, s);
}

  // Distance in yards accounting for non-uniform px scales
  function distYds(a: Pt, b: Pt): number {
    const dx = (a.x - b.x) / XPX;
    const dy = (a.y - b.y) / YPX;
    return Math.hypot(dx, dy);
  }
  // Vertical depth (yds from LOS at bottom)
  function yDepthYds(p: Pt): number {
    return (PX_H - p.y) / YPX;
  }

  // Classify throw area: horizontal (L/M/R by hashes) + vertical band (SHORT/MID/DEEP)
  function classifyThrowArea(p: Pt): { horiz: 'L'|'M'|'R'; band: 'SHORT'|'MID'|'DEEP'; key: string; depthYds: number } {
    const depthFromLOS = Math.max(0, yDepthYds(p) - 12);
    const band: 'SHORT'|'MID'|'DEEP' = depthFromLOS <= 10 ? 'SHORT' : depthFromLOS <= 20 ? 'MID' : 'DEEP';
    const horiz: 'L'|'M'|'R' = p.x < HASH_L ? 'L' : p.x > HASH_R ? 'R' : 'M';
    return { horiz, band, key: `${horiz}_${band}`, depthYds: Math.round(depthFromLOS) };
  }

  // Route break fractions (by arc length, for first interior break)
  function segmentBreakFracs(path: Pt[]): number[] {
    if (!path || path.length < 3) return [];
    let total = 0;
    const lens: number[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const L = segLen(path[i], path[i + 1]);
      lens.push(L); total += L;
    }
    if (total <= 0) return [];
    const fracs: number[] = [];
    let acc = 0;
    for (let i = 0; i < lens.length - 1; i++) {
      acc += lens[i];
      fracs.push(acc / total);
    }
    return fracs;
  }

  // Compute openness for a single receiver at time tt
  function computeReceiverOpenness(rid: ReceiverID, tt: number): OpenInfo {
    const rp = wrPosSafe(rid, tt);
    let bestYds = Infinity;
    let nearest: DefenderID | null = null;
    for (const did of DEFENDER_IDS) {
      const dp = defenderPos(coverage, did, tt);
      const yds = distYds(rp, dp);
      if (yds < bestYds) { bestYds = yds; nearest = did; }
    }
    // Map separation yards to 0..1 score: 1.5 yds = tight (0), 6.0 yds = open (1)
    const MIN_SEP = 1.5, MAX_SEP = 6.0;
    const score = Math.max(0, Math.min(1, (bestYds - MIN_SEP) / (MAX_SEP - MIN_SEP)));
    return { score, sepYds: bestYds, nearest };
  }

  // Update openness every frame while play is live
  useEffect(() => {
    if (phase !== "post") {
      setOpenness((prev) => ({ ...prev, X: { score: 0, sepYds: 0, nearest: null }, Z: { score: 0, sepYds: 0, nearest: null }, SLOT: { score: 0, sepYds: 0, nearest: null }, TE: { score: 0, sepYds: 0, nearest: null }, RB: { score: 0, sepYds: 0, nearest: null } }));
      return;
    }
    const infoX = computeReceiverOpenness("X", t);
    const infoZ = computeReceiverOpenness("Z", t);
    const infoS = computeReceiverOpenness("SLOT", t);
    const infoT = computeReceiverOpenness("TE", t);
    const infoR = computeReceiverOpenness("RB", t);
    setOpenness({ X: infoX, Z: infoZ, SLOT: infoS, TE: infoT, RB: infoR });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, phase, coverage, recSpeed, defSpeed, O, Dstart, blockedDefenders]);


  /* --------- Dynamic pre-snap defender starts --------- */
  function computeDefenderStarts(A: AlignMap): Record<DefenderID, Pt> {
  const outsideLeft: ReceiverID  = A.X.x < A.Z.x ? "X" : "Z";
  const outsideRight: ReceiverID = outsideLeft === "X" ? "Z" : "X";
  const slot = A.SLOT;

  const ssRight = strongSide(A) === "right";
  const yCBPress = yUp(16.5); // ~1–2 yds
  const yCBNorm  = yUp(22);   // ~7 yds

  // Per-side CB depth
  const yCB_L =
    cbTechnique === "press"      ? yCBPress :
    cbTechnique === "pressStrong" ? (ssRight ? yCBNorm : yCBPress) :
    yCBNorm;

  const yCB_R =
    cbTechnique === "press"      ? yCBPress :
    cbTechnique === "pressStrong" ? (ssRight ? yCBPress : yCBNorm) :
    yCBNorm;

  const CB_L: Pt = { x: A[outsideLeft].x,  y: yCB_L };
  const CB_R: Pt = { x: A[outsideRight].x, y: yCB_R };

  const yNickel = yUp(17), ySafety = yUp(32), yFS = yUp(35), yBacker = yUp(22);
  const insideBias = xAcross(2);
  const nickelX =
    slot?.x !== undefined
      ? (slot.x > QB.x ? slot.x - insideBias : slot.x + insideBias)
      : ssRight ? xAcross(FIELD_WIDTH_YDS - 18) : xAcross(18);
  const NICKEL: Pt = { x: nickelX, y: yNickel };

  const SS: Pt = {
    x: ssRight ? xAcross(FIELD_WIDTH_YDS / 2 + 8) : xAcross(FIELD_WIDTH_YDS / 2 - 8),
    y: ySafety,
  };
  const FS: Pt   = { x: xAcross(FIELD_WIDTH_YDS / 2), y: yFS };
  const SAM: Pt  = { x: ssRight ? xAcross(20) : xAcross(FIELD_WIDTH_YDS - 20), y: yBacker };
  const MIKE: Pt = { x: xAcross(FIELD_WIDTH_YDS / 2), y: yBacker };
  const WILL: Pt = { x: ssRight ? xAcross(FIELD_WIDTH_YDS - 20) : xAcross(20), y: yBacker };

  return { CB_L, CB_R, NICKEL, FS, SS, SAM, MIKE, WILL };
}


  // --- strength detector ---
  const strongIsRight = useCallback((): boolean => {
    return Object.values(numbering).some((n) => n.band === "strong" && n.side === "right");
  }, [numbering]);

  // --- strength-aware zone anchor selection ---
  function zoneAnchor(cover: CoverageID, id: DefenderID): Pt {
    const sr = strongIsRight();
    const L = { DEEP: ZONES.DEEP_LEFT, FLAT: ZONES.FLAT_LEFT, CURL: ZONES.CURL_LEFT };
    const R = { DEEP: ZONES.DEEP_RIGHT, FLAT: ZONES.FLAT_RIGHT, CURL: ZONES.CURL_RIGHT };
    const MID = ZONES.DEEP_MIDDLE;
    const HOOK = ZONES.HOOK_MID;
    const off = (pt: Pt, dx: number) => ({ x: pt.x + xAcross(dx), y: pt.y });

    switch (cover) {
      case "C3": {
        // Sky/Buzz/Cloud (strong) rotation variants
        const rot = c3Rotation; // SKY | BUZZ | CLOUD_STRONG
        if (id === "CB_L") return (rot === 'CLOUD_STRONG' && !sr) ? L.FLAT : L.DEEP;
        if (id === "CB_R") return (rot === 'CLOUD_STRONG' && sr)  ? R.FLAT : R.DEEP;
        if (id === "FS")   return MID;
        if (id === "SS") {
          if (rot === 'BUZZ') return sr ? off(R.CURL, -2) : off(L.CURL, +2); // buzz: safety to curl/hook
          // sky/cloud: safety toward curl/flat
          return sr ? off(R.CURL, -1) : off(L.CURL, +1);
        }
        if (id === "NICKEL") {
          if (rot === 'BUZZ') return sr ? R.FLAT : L.FLAT; // OLB/slot to flat in buzz
          return sr ? off(L.CURL, +1) : off(R.CURL, -1);
        }
        if (id === "MIKE") return HOOK;
        if (id === "SAM")  return sr ? off(L.CURL, +0.5) : off(R.CURL, -0.5);
        if (id === "WILL") return sr ? off(R.CURL, -0.5) : off(L.CURL, +0.5);
        return D_ALIGN[id];
      }
      case "C2": {
        if (id === "CB_L") return L.FLAT;
        if (id === "CB_R") return R.FLAT;
        if (id === "SS")   return sr ? R.DEEP : L.DEEP;
        if (id === "FS")   return sr ? L.DEEP : R.DEEP;
        if (id === "MIKE") return HOOK;
        if (id === "NICKEL") return sr ? off(R.CURL, -1.5) : off(L.CURL, +1.5);
        if (id === "SAM")    return sr ? off(L.CURL, +1.0) : off(R.CURL, -1.0);
        if (id === "WILL")   return sr ? off(L.CURL, +3.0) : off(R.CURL, -3.0);
        return D_ALIGN[id];
      }
      case "TAMPA2": {
        if (id === "CB_L") return L.FLAT;
        if (id === "CB_R") return R.FLAT;
        if (id === "SS")   return sr ? R.DEEP : L.DEEP;
        if (id === "FS")   return sr ? L.DEEP : R.DEEP;
        if (id === "MIKE") return { x: HOOK.x, y: yUp(34) };
        if (id === "NICKEL") return sr ? off(R.CURL, -1.5) : off(L.CURL, +1.5);
        if (id === "SAM")    return sr ? off(L.CURL, +1.0) : off(R.CURL, -1.0);
        if (id === "WILL")   return sr ? off(L.CURL, +3.0) : off(R.CURL, -3.0);
        return D_ALIGN[id];
      }
      case "C4":
      case "QUARTERS": {
        if (id === "CB_L") return { x: xAcross(14), y: yUp(36) };
        if (id === "CB_R") return { x: xAcross(FIELD_WIDTH_YDS - 14), y: yUp(36) };
        if (id === "FS")   return { x: xAcross(FIELD_WIDTH_YDS/2 + 8), y: yUp(38) };
        if (id === "SS")   return { x: xAcross(FIELD_WIDTH_YDS/2 - 8), y: yUp(38) };
        if (id === "MIKE") return HOOK;
        if (id === "SAM")  return sr ? off(L.CURL, +1.0) : off(R.CURL, -1.0);
        if (id === "WILL") return sr ? off(R.CURL, -1.0) : off(L.CURL, +1.0);
        if (id === "NICKEL") return sr ? off(R.CURL, -1.5) : off(L.CURL, +1.5);
        return D_ALIGN[id];
      }
      case "PALMS": {
        if (id === "CB_L") return L.FLAT;
        if (id === "CB_R") return R.FLAT;
        if (id === "SS")   return sr ? R.DEEP : L.DEEP;
        if (id === "FS")   return sr ? L.DEEP : R.DEEP;
        if (id === "MIKE") return HOOK;
        if (id === "SAM")  return sr ? off(L.CURL, +1.0) : off(R.CURL, -1.0);
        if (id === "WILL") return sr ? off(R.CURL, -1.0) : off(L.CURL, +1.0);
        if (id === "NICKEL") return sr ? off(R.CURL, -1.5) : off(L.CURL, +1.5);
        return D_ALIGN[id];
      }
      case "C6": {
        const halfOnRight = !sr;
        if (id === "CB_L") return halfOnRight ? L.DEEP : { x: xAcross(14), y: yUp(36) };
        if (id === "CB_R") return halfOnRight ? { x: xAcross(FIELD_WIDTH_YDS - 14), y: yUp(36) } : R.DEEP;
        if (id === "SS")   return halfOnRight ? R.DEEP : { x: xAcross(FIELD_WIDTH_YDS/2 - 8), y: yUp(38) };
        if (id === "FS")   return halfOnRight ? { x: xAcross(FIELD_WIDTH_YDS/2 + 8), y: yUp(38) } : L.DEEP;
        if (id === "MIKE") return HOOK;
        if (id === "SAM")  return sr ? off(L.CURL, +1.0) : off(R.CURL, -1.0);
        if (id === "WILL") return sr ? off(R.CURL, -1.0) : off(L.CURL, +1.0);
        if (id === "NICKEL") return sr ? off(R.CURL, -1.5) : off(L.CURL, +1.5);
        return D_ALIGN[id];
      }
      case "C9": {
        if (sr) {
          if (id === "CB_R") return off(R.CURL, -1.5);
          if (id === "SS")   return R.FLAT;
          if (id === "CB_L") return L.DEEP;
        } else {
          if (id === "CB_L") return off(L.CURL, +1.5);
          if (id === "SS")   return L.FLAT;
          if (id === "CB_R") return R.DEEP;
        }
        if (id === "FS")   return MID;
        if (id === "MIKE") return HOOK;
        if (id === "SAM")  return sr ? off(L.CURL, +1.0) : off(R.CURL, -1.0);
        if (id === "WILL") return sr ? off(R.CURL, -1.0) : off(L.CURL, +1.0);
        if (id === "NICKEL") return sr ? off(R.CURL, -1.5) : off(L.CURL, +1.5);
        return D_ALIGN[id];
      }
      default: {
        if (id === "CB_L") return ZONES.DEEP_LEFT;
        if (id === "CB_R") return ZONES.DEEP_RIGHT;
        if (id === "FS")   return ZONES.DEEP_MIDDLE;
        if (id === "SS")   return sr ? off(ZONES.CURL_RIGHT, -1) : off(ZONES.CURL_LEFT, +1);
        if (id === "SAM")  return sr ? off(ZONES.CURL_LEFT, +0.5) : off(ZONES.CURL_RIGHT, -0.5);
        if (id === "WILL") return sr ? off(ZONES.CURL_RIGHT, -0.5) : off(ZONES.CURL_LEFT, +0.5);
        if (id === "MIKE") return ZONES.HOOK_MID;
        if (id === "NICKEL") return sr ? off(ZONES.CURL_RIGHT, -1.5) : off(ZONES.CURL_LEFT, +1.5);
        return D_ALIGN[id];
      }
    }
  }

  /* --- helper: WR current position at time tt --- */
  const wrPos = (id: ReceiverID, tt: number): Pt =>
    posOnPathLenScaled(O[id], Math.min(1, tt * recSpeed * receiverSpeedMult(id)));

  // TE/RB pass-pro spots
  function passProPathTE(A: AlignMap): Pt[] {
    const spot: Pt = { x: A.TE.x, y: yUp(16.5) };
    return [A.TE, spot];
  }
  function passProPathRB(A: AlignMap): Pt[] {
    const offset = A.RB.x >= QB.x ? xAcross(3) : -xAcross(3);
    const spot: Pt = { x: QB.x + offset, y: yUp(15.5) };
    return [A.RB, spot];
  }

  // Choose the defender a blocker will target
  function computeBlockTarget(
    who: Blocker,
    cover: CoverageID,
    A: AlignMap,
    starts: Record<DefenderID, Pt>,
    strongRight: boolean
  ): DefenderID | null {
    const CANDIDATES: DefenderID[] = ["SAM", "WILL", "NICKEL", "CB_L", "CB_R", "MIKE"];

    if (cover === "C0") {
      const blitzLB: DefenderID = strongRight ? "SAM" : "WILL";
      if (who === "RB") return blitzLB;
    }

    const bx = (who === "TE" ? A.TE.x : A.RB.x);
    const mySide: "left" | "right" = bx < QB.x ? "left" : "right";
    const isOnMySide = (id: DefenderID) =>
      mySide === "left" ? starts[id].x < QB.x : starts[id].x >= QB.x;

    const weight = (id: DefenderID) => {
      let w = dist(starts[id], QB);
      if (who === "TE") {
        if ((mySide === "left" && id === "CB_L") || (mySide === "right" && id === "CB_R")) w *= 0.7;
        if (id === "NICKEL") w *= 0.8;
      } else {
        if (id === "MIKE") w *= 0.6;
        if ((mySide === "left" && id === "SAM") || (mySide === "right" && id === "WILL")) w *= 0.85;
      }
      w *= isOnMySide(id) ? 0.8 : 1.2;
      return w;
    };

    let best: { id: DefenderID; w: number } | null = null;
    for (const id of CANDIDATES) {
      const w = weight(id);
      if (!best || w < best.w) best = { id, w };
    }
    return best?.id ?? null;
  }

  // Where the block “locks in”
  function computeEngagePoint(
    who: Blocker,
    blockerStart: Pt,
    defenderStart: Pt
  ): Pt {
    const r = rngRef.current.nextFloat();
    const losY = yUp(who === "TE" ? 16.5 + r * 0.8 : 15.5 + r * 0.6);
    const t = who === "TE" ? 0.6 : 0.35;
    const x = blockerStart.x + (defenderStart.x - blockerStart.x) * t;
    return { x, y: losY };
  }

  // --- numbered receiver helpers (by side) ---
  function findByNumber(side: "left" | "right", num: 1 | 2 | 3): ReceiverID | null {
    for (const [id, info] of Object.entries(numbering) as [ReceiverID, Numbering[ReceiverID]][]) {
      if (info.side === side && info.number === num) return id;
    }
    return null;
  }
  const left1  = () => findByNumber("left", 1)  ?? "X";
  const right1 = () => findByNumber("right", 1) ?? "Z";
  const left2  = () => findByNumber("left", 2)  ?? (left1()  === "X" ? "SLOT" : "TE");
  const right2 = () => findByNumber("right", 2) ?? (right1() === "Z" ? "SLOT" : "TE");

  /** Cut severity for a receiver at play-time `tt` (0..1).
 *  Returns 0..1 where 0 = straight, 1 = sharp cut right now.
 */
function cutSeverityFor(rid: ReceiverID, tt: number): number {
  const path = O[rid];
  if (!path || path.length < 2) return 0;

  const dt = 0.015; // small sampling window
  const tNow = Math.max(0, Math.min(1, tt * recSpeed));
  const t0 = Math.max(0, tNow - dt);
  const t1 = Math.min(1, tNow + dt);

  const p0 = posOnPathLenScaled(path, t0);
  const p1 = posOnPathLenScaled(path, tNow);
  const p2 = posOnPathLenScaled(path, t1);

  const v1x = p1.x - p0.x, v1y = p1.y - p0.y;
  const v2x = p2.x - p1.x, v2y = p2.y - p1.y;

  const n1 = Math.hypot(v1x, v1y);
  const n2 = Math.hypot(v2x, v2y);
  if (n1 < 1e-3 || n2 < 1e-3) return 0;

  const dot = v1x * v2x + v1y * v2y;
  const cos = Math.max(-1, Math.min(1, dot / (n1 * n2)));
  const ang = Math.acos(cos); // radians

  // map ~30°..120° into 0..1
  const aMin = (30 * Math.PI) / 180;
  const aMax = (120 * Math.PI) / 180;
  const sev = (ang - aMin) / (aMax - aMin);
  return Math.max(0, Math.min(1, sev));
}

  /* --- defender controller --- */
  function defenderPos(cover: CoverageID, id: DefenderID, tt: number): Pt {
    const start = Dstart[id] ?? D_ALIGN[id];
    const effT = Math.max(0, Math.min(1, tt));  // time remaining
    const spd = Math.max(0.5, Math.min(1.6, defSpeed * defenderSpeedMult(id)));
    const sr = strongIsRight();
    const approach = (from: Pt, to: Pt, base = 0, gain = 1) => {
      const pct = Math.min(1, base + effT * (gain * spd));
      return { x: from.x + (to.x - from.x) * pct, y: from.y + (to.y - from.y) * pct };
    };
    // --- press gating for corners (works for C0 / C1 because we only roll there) ---
    const pressInfo = id === "CB_L" ? cbPress.CB_L : id === "CB_R" ? cbPress.CB_R : undefined;
  if (pressInfo && pressInfo.outcome !== "NONE" && pressInfo.rid) {
  // how long the press effect lasts, by outcome
  const pressUntil =
    pressInfo.outcome === "JAM_LOCK"        ? 1
    : pressInfo.outcome === "JAM_AND_RELEASE" ? PRESS_DELAY_FRAC
    : pressInfo.outcome === "WHIFF"           ? WHIFF_DELAY_FRAC
    : 0;

  if (effT < pressUntil) {
    // Hold at a shallow press point near the LOS on the WR’s side
    const wr0 = align[pressInfo.rid] ?? QB;
    const pressPoint: Pt = { x: (start.x + wr0.x) / 2, y: yUp(16.5) };

    if (pressInfo.outcome === "JAM_LOCK") {
      // stay engaged at the line the whole play
      return approach(start, pressPoint, 0.35, 1.2);
    }

    if (pressInfo.outcome === "WHIFF") {
      // CB hesitates briefly (frozen) before recovering
      return start;
    }

    // JAM_AND_RELEASE: hold briefly at press point, then release
    return approach(start, pressPoint, 0.30, 0.8);
  }
  // after the press window, fall through to normal man/match pursuit
} 

    if (blockedDefenders.has(id)) {
      const ep = blockEngage[id] ?? start;
      return approach(start, ep, 0.35, 1.35);
    }

    const anchor = zoneAnchor(cover, id);

    /* ================= MAN: C1 / C0 ================= */
    if (MAN_COVERAGES.has(cover)) {
        const info = id === "CB_L" ? cbPress.CB_L : id === "CB_R" ? cbPress.CB_R : undefined;
        if (info && info.outcome !== "NONE") {
            if (info.outcome === "JAM_LOCK") return { x: start.x, y: start.y };
            if (info.outcome === "JAM_AND_RELEASE" && tt < PRESS_DELAY_FRAC) return { x: start.x, y: start.y };
            if (info.outcome === "WHIFF" && tt < WHIFF_DELAY_FRAC) return { x: start.x, y: start.y };
  }
    // who is in man on whom
    const manMap: Partial<Record<DefenderID, ReceiverID>> = {
        CB_L:   "X",
        CB_R:   "Z",
        NICKEL: "SLOT",
        SS:     "TE",
        MIKE:   "RB",
        // FS free in C1; in C0 we treat FS as free unless you choose to man him elsewhere.
    };

    // Extra-LB roles from snap-time draw (never 2 spies)
    const iBlitz = manExtraRoles.blitzers.includes(id);
    const iSpy   = manExtraRoles.spy === id;

    // --- C0/C1: blitz & spy behaviors for *extras* (SAM/WILL in this sim) ---
    if (iBlitz) {
        // attack a guard gap to avoid centerline overlaps
        const gapX = QB.x + (id === "SAM" ? -xAcross(2.0) : xAcross(2.0));
        const blitzPoint: Pt = { x: gapX, y: QB.y };
        return {
        x: start.x + (blitzPoint.x - start.x) * Math.min(1, 0.15 + effT * (1.45 * spd)),
        y: start.y + (blitzPoint.y - start.y) * Math.min(1, 0.15 + effT * (1.45 * spd)),
        };
    }
    if (iSpy) {
        // shallow spy ~8–10 yds, mirror RB if through MOF (green-dog feel)
        const spyPoint: Pt = { x: QB.x, y: yUp(20) };
        const rbP = wrPos("RB", tt);
        const rbInMOF = Math.abs(rbP.x - QB.x) < xAcross(8) && rbP.y < yUp(26);
        const target = rbInMOF ? rbP : spyPoint;
        return {
        x: start.x + (target.x - start.x) * Math.min(1, 0.20 + effT * (0.75 * spd)),
        y: start.y + (target.y - start.y) * Math.min(1, 0.20 + effT * (0.75 * spd)),
        };
    }

    // --- Man trail with "cut lag" for the assigned matchup ---
    const key = manMap[id];
    if (key) {
        const target = wrPos(key, tt);

        // lag when the WR cuts: scale down pursuit gain up to ~70%
        const lag = cutSeverityFor(key, tt);         // 0..1
        const lagScale = 1 - .2 * lag;              // 1.0 -> no lag, 0.3 -> strong lag

        // a little initial cushion so they don't instantly glue to the WR
        const base = .18;  // 0.1..0.2

        return {
        x: start.x + (target.x - start.x) * Math.min(1, base + effT * (0.95 * spd * lagScale)),
        y: start.y + (target.y - start.y) * Math.min(1, base + effT * (0.95 * spd * lagScale)),
        };
    }

    // --- Free players (e.g., FS in C1) play MOF lean rather than sitting idle ---
    if (cover === "C1" && id === "FS") {
        // midpoint the #2s and stay over the top
        const twoL = left2();
        const twoR = right2();
        const pL = wrPos(twoL ?? "SLOT", tt);
        const pR = wrPos(twoR ?? "SLOT", tt);
        const mid = { x: (pL.x + pR.x) / 2, y: Math.min(pL.y, pR.y, yUp(36)) };
        return {
        x: start.x + (mid.x - start.x) * Math.min(1, 0.22 + effT * (0.65 * spd)),
        y: start.y + (mid.y - start.y) * Math.min(1, 0.22 + effT * (0.65 * spd)),
        };
    }

    // Fallback: slide toward a nearby zone anchor (keeps motion plausible)
    const anchor = zoneAnchor(cover === "C0" ? "C3" : "C1", id);
    return {
        x: start.x + (anchor.x - start.x) * Math.min(1, 0.2 + effT * (0.55 * spd)),
        y: start.y + (anchor.y - start.y) * Math.min(1, 0.2 + effT * (0.55 * spd)),
    };
    }

    /* ZONE */
    if (ZONE_COVERAGES.has(cover)) {
      // Special ramp for TAMPA2 MIKE: hook -> pole (deep middle)
      if (cover === 'TAMPA2' && id === 'MIKE') {
        const hook = ZONES.HOOK_MID;
        const pole: Pt = { x: hook.x, y: yUp(34) };
        const f = Math.min(1, effT * 1.2); // ramp a bit quicker than clock
        const target: Pt = { x: hook.x + (pole.x - hook.x) * f, y: hook.y + (pole.y - hook.y) * f };
        return approach(start, target, 0.30, 0.55);
      }
      // Curl/flat droppers midpoint for a beat before driving
      let p = approach(start, anchor, 0.35, 0.6);

      // Compute a simple midpoint of nearby threats to emulate “squeeze then drive”
      const threats = (["X","Z","SLOT","TE","RB"] as ReceiverID[]).map(r => ({ id: r, p: wrPos(r, tt) }));
      const midAll = threats.reduce((acc, cur) => ({ x: acc.x + cur.p.x/5, y: acc.y + cur.p.y/5 }), { x: 0, y: 0 });
      if ((cover === 'C3' || cover === 'C4') && tt < 0.22 && id !== 'CB_L' && id !== 'CB_R') {
        p = approach(start, { x: (anchor.x + midAll.x)/2, y: Math.min(anchor.y, midAll.y) }, 0.25, 0.45);
      }

      const nearest = threats.reduce((best, cur) =>
        ((cur.p.x - anchor.x)**2 + (cur.p.y - anchor.y)**2) <
        ((best.p.x - anchor.x)**2 + (best.p.y - anchor.y)**2) ? cur : best, threats[0]);
      const near = Math.hypot(nearest.p.x - anchor.x, nearest.p.y - anchor.y) < xAcross(18);

      if (cover === "C3" && id === "SS") {
        const s = near ? approach(p, nearest.p, 0.0, 0.45) : p;
        return { x: s.x, y: Math.max(s.y, yUp(28)) };
      }

      if ((cover === "C3" || cover === "C4") && (id === "CB_L" || id === "CB_R")) {
        return p;
      }

      return near ? approach(p, nearest.p, 0.0, 0.45) : p;
    }

    /* MATCH */
    if (MATCH_COVERAGES.has(cover)) {
        const info = id === "CB_L" ? cbPress.CB_L : id === "CB_R" ? cbPress.CB_R : undefined;
        if (info && info.outcome !== "NONE") {
            if (info.outcome === "JAM_LOCK") return { x: start.x, y: start.y };
            if (info.outcome === "JAM_AND_RELEASE" && tt < PRESS_DELAY_FRAC) return { x: start.x, y: start.y };
            if (info.outcome === "WHIFF" && tt < WHIFF_DELAY_FRAC) return { x: start.x, y: start.y };
  }
      let p = approach(start, anchor, 0.35, 0.6);
      const twoStrong = wrPos(sr ? (right2() ?? "SLOT") : (left2() ?? "SLOT"), tt);
      const oneStrong = wrPos(sr ? (right1() ?? "Z") : (left1() ?? "X"), tt);
      const twoWeak   = wrPos(!sr ? (right2() ?? "SLOT") : (left2() ?? "SLOT"), tt);
      const oneWeak   = wrPos(!sr ? (right1() ?? "Z") : (left1() ?? "X"), tt);

      const isVert = (pt: Pt) => yDepthYds(pt) >= 12; // #2 vertical past ~12 yds

      if (cover === "QUARTERS") {
        if (id === "CB_L") return approach(p, wrPos(left1() ?? "X", tt), 0.10, 0.55);
        if (id === "CB_R") return approach(p, wrPos(right1() ?? "Z", tt), 0.10, 0.55);

        if (id === "SS" || id === "FS") {
          const tgt2 = id === "SS" ? (sr ? twoStrong : twoWeak) : (sr ? twoWeak : twoStrong);
          if (isVert(tgt2)) return approach(p, tgt2, 0.05, 0.45);
          const tgt1 = id === "SS" ? (sr ? oneStrong : oneWeak) : (sr ? oneWeak : oneStrong);
          const mid = { x: (tgt1.x + tgt2.x)/2, y: (tgt1.y + tgt2.y)/2 };
          return approach(p, mid, 0.05, 0.30);
        }

        if (id === "NICKEL" || id === "MIKE" || id === "SAM" || id === "WILL") {
          const three = wrPos("RB", tt);
          const myTwo = (id === "NICKEL" || (id === "SAM" && !sr) || (id === "WILL" && sr)) ? twoStrong : twoWeak;
          // Nickel wall #2 at ~6–8 yds inside leverage before passing it
          if (id === "NICKEL" && tt < 0.25) {
            const inside = myTwo.x > QB.x ? -xAcross(2) : xAcross(2);
            const wall: Pt = { x: myTwo.x + inside, y: yUp(18) };
            return approach(start, wall, 0.10, 0.55);
          }
          const mid = { x: (myTwo.x + three.x)/2, y: (myTwo.y + three.y)/2 };
          return approach(p, mid, 0.05, 0.35);
        }
        return p;
      }

      if (cover === "PALMS") {
        // Trap #2 to flat if #2 under ~10 yds; else carry #2 vertical
        const underTwo = yDepthYds(twoStrong) <= 10;
        if ((id === "SS" && sr) || (id === "FS" && !sr)) {
          if (!underTwo) p = approach(p, twoStrong, 0.0, 0.40); // safety carries #2 if vertical
        }
        if ((id === "CB_R" && sr) || (id === "CB_L" && !sr)) {
          if (underTwo) p = approach(p, twoStrong, 0.0, 0.40); // corner traps #2
        }
        return p;
      }

      if (cover === "C6") {
        // Quarters to strength: apply #2 vertical rule on the quarters side
        if ((id === "SS" && sr) || (id === "FS" && !sr)) {
          if (isVert(twoStrong)) p = approach(p, twoStrong, 0.0, 0.35);
        }
        return p;
      }

      if (cover === "C9") {
        if ((id === "CB_R" && sr) || (id === "CB_L" && !sr)) {
          p = approach(p, oneStrong, 0.0, 0.38);
        }
        return p;
      }

      return p;
    }

    return approach(start, anchor, 0.3, 0.5);
  }

  /** ---------- AI grader ---------- */
  async function gradeDecision(to: ReceiverID) {
    try {
      // Compute target break timing and first-open signal
      const path = O[to] ?? [];
      const breaks = segmentBreakFracs(path);
      const firstBreak = breaks.length ? breaks[0] : undefined;
      const mult = receiverSpeedMult(to);
      const tBreak = firstBreak !== undefined ? Math.min(1, firstBreak / Math.max(0.0001, recSpeed * mult)) : undefined;
      const targetBreakMs = tBreak !== undefined ? Math.round(tBreak * PLAY_MS) : undefined;
      const holdMs = lastHoldMs ?? Math.round(t * PLAY_MS);
      const heldVsBreakMs = targetBreakMs !== undefined ? (holdMs - targetBreakMs) : undefined;

      // Find first-open receiver (score >= 0.6)
      const rids: ReceiverID[] = ["X","Z","SLOT","TE","RB"];
      let firstOpenId: ReceiverID | undefined;
      let firstOpenMs: number | undefined;
      for (let step = 0; step <= 100; step++) {
        const tt = step / 100; // 0..1
        for (const rid of rids) {
          const info = computeReceiverOpenness(rid, tt);
          if (info.score >= 0.6) {
            firstOpenId = rid; firstOpenMs = Math.round(tt * PLAY_MS);
            break;
          }
        }
        if (firstOpenId) break;
      }

      const res = await fetch("/api/football-grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conceptId, coverage, target: to, time: t,
          numbering, formation, assignments: manualAssignments,
          windowScore: lastWindow?.info.score ?? undefined,
          nearestSepYds: lastWindow?.info.sepYds ?? undefined,
          nearestDefender: lastWindow?.info.nearest ?? undefined,
          playId,
          holdMs,
          targetBreakMs,
          heldVsBreakMs,
          firstOpenId,
          firstOpenMs,
          throwArea: lastThrowArea?.key,
        })
      });
      const data: { grade?: string; rationale?: string; coachingTip?: string } = await res.json();
      setGrade(data.grade ?? "OK");
      const detail = [data.rationale, data.coachingTip].filter(Boolean).join("  Tip: ");
      setExplain(detail || "Good rep.");
      safeTrack('ai_grade', { grade: data.grade ?? 'OK' });

      // Server-side throw log (for future analytics)
      try {
        const meta = buildSnapMeta();
        const payload = {
          conceptId,
          coverage,
          formation,
          target: to,
          time: t,
          playId,
          holdMs,
          throwArea: lastThrowArea?.key,
          depthYds: lastThrowArea?.depthYds,
          windowScore: lastWindow?.info.score,
          nearestSepYds: lastWindow?.info.sepYds,
          grade: data.grade ?? 'OK',
          extra: {
            c3Rotation: coverage === 'C3' ? c3Rotation : undefined,
            coverageInsights: meta.coverageInsights,
            targetBreakMs,
            heldVsBreakMs,
            firstOpenId,
            firstOpenMs
          }
        };
        void fetch('/api/throw-log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } catch {}
    } catch {
      setGrade("OK");
      setExplain("Grader unavailable. Try again.");
    }
  }

  // ---------- Ball flight + sounds (ball follows play clock, no extra RAF) ----------
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

  function applyAudible() {
    if (!audibleOn || !audTarget || !audRoute) return;
    setManualAssignments(prev => ({ ...prev, [audTarget]: audRoute }));
    setPhase("pre"); setT(0); setDecision(null); setGrade(null); setExplain(null);
    setBallFlying(false); setBallT(0); setCatchAt(null);
    safeTrack('audible_apply', { target: audTarget, route: audRoute });
  }

  function clearAudibles() {
    if (!hasAudibles && !audTarget && !audRoute) return;
    setManualAssignments({});
    setAudTarget(""); setAudRoute(""); setAudibleOn(false);
    setPhase("pre"); setT(0); setDecision(null); setGrade(null); setExplain(null);
    setBallFlying(false); setBallT(0); setCatchAt(null);
  }

  function startSnap() {
    setT(0);
    setDecision(null);
    setGrade(null);
    setExplain(null);
    setBallFlying(false);
    setBallT(0);
    setCatchAt(null);
    setCaught(false);
    setThrowMeta(null);
    // New deterministic roll for this play
    setPlayId((p) => p + 1);
    setRngSeed((s) => mixSeed(s, Date.now() >>> 0));
    safeTrack('snap', { conceptId, coverage, formation });
    // Log leverage context for AI
    setAiLog((log) => log.concat([{ playId: playId + 1, coverage, formation, leverage: levInfo, adjustments: levAdjust }]));
    setPhase("pre");
    queueMicrotask(() => setPhase("post"));
  }

  function hardReset() {
    setPhase("pre");
    setT(0);
    setDecision(null);
    setGrade(null);
    setExplain(null);
    setBallFlying(false);
    setBallT(0);
    setCatchAt(null);
    setCaught(false);
    setThrowMeta(null);
  }
  function startThrow(to: ReceiverID) {
  // Blocked targets can’t receive throws
  if ((to === "TE" && teBlock) || (to === "RB" && rbBlock)) return;

  // Only during the live snap, only one ball in the air, and before timer ends
  if (phase !== "post" || ballFlying || t >= 0.999) return;

  const path = O[to];
  if (!path || path.length === 0) return;

  const p2 = posOnPathLenScaled(path, Math.min(1, t * recSpeed * receiverSpeedMult(to)));
  const p0 = { ...QB };
  const mid = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
  const arc = Math.min(80, Math.max(40, dist(p0, p2) * 0.15));
  const p1 = { x: mid.x, y: mid.y - arc };

  const flightMs = Math.min(1400, Math.max(600, dist(p0, p2) * 2.2));
  const frac = Math.min(0.6, Math.max(0.2, flightMs / PLAY_MS));

  setBallP0(p0); setBallP1(p1); setBallP2(p2);
  setBallT(0);
  setCatchAt(null);
  // capture window at throw time
  const win = computeReceiverOpenness(to, t);
  setLastWindow({ rid: to, info: win });
  // capture throw area + hold time
  const area = classifyThrowArea(p2);
  setLastThrowArea(area);
  setLastHoldMs(Math.round(t * PLAY_MS));
  setDecision(to);            // keep single-throw-per-play behavior
  setBallFlying(true);
  setThrowMeta({ p0, p1, p2, tStart: t, frac });
  setCaught(false);
  if (soundOn) playWhistle();
  safeTrack('throw', { target: to, t: Number(t.toFixed(2)), area: area.key, depthYds: area.depthYds });
}

  // Ball follows the single play clock (no extra RAF)
  useEffect(() => {
    if (!ballFlying || !throwMeta) return;

    const rel = Math.max(0, Math.min(1, (t - throwMeta.tStart) / throwMeta.frac));
    const eased = rel < 0.5 ? 2 * rel * rel : -1 + (4 - 2 * rel) * rel;
    setBallT(eased);

    if (rel >= 1 && ballFlying) {
      setBallFlying(false);
      setCatchAt(throwMeta.p2);
      setThrowMeta(null);
      setCaught(true);
      if (soundOn) playCatchPop();
      if (decision) void gradeDecision(decision);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, ballFlying, throwMeta, soundOn, playCatchPop, decision]);

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
        lines.push(
          <line
            key={`yl-${yds}`}
            x1={0}
            x2={PX_W}
            y1={y}
            y2={y}
            stroke="rgba(255,255,255,0.65)"
            strokeWidth={sw}
            opacity={yds % 5 === 0 ? 0.25 : 0.2}
          />
        );
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
        marks.push(
          <line
            key={`hl-${y}`}
            x1={xHashL - hh}
            x2={xHashL + hh}
            y1={yy}
            y2={yy}
            stroke="rgba(255,255,255,0.8)"
            strokeWidth={1.2}
          />
        );
        marks.push(
          <line
            key={`hr-${y}`}
            x1={xHashR - hh}
            x2={xHashR + hh}
            y1={yy}
            y2={yy}
            stroke="rgba(255,255,255,0.8)"
            strokeWidth={1.2}
          />
        );
      }
      return <>{marks}</>;
    };
    const YardNumbers = () => {
      const nums: JSX.Element[] = [];
      const leftX = xAcross(6.5);
      const rightX = PX_W - xAcross(6.5);
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
            <stop offset="0%" stopColor="#0b4d12" />
            <stop offset="100%" stopColor="#0b3f0f" />
          </linearGradient>
          <radialGradient id="catchPulse" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.7)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
        </defs>
        <rect x={0} y={0} width={PX_W} height={PX_H} fill="url(#turfV)" rx={12} />
        {Array.from({ length: FIELD_LENGTH_YDS / 5 }, (_, i) => {
          const y = yUp(i * 5);
          return (
            <rect
              key={`stripe-${i}`}
              x={0}
              y={yUp((i + 1) * 5)}
              width={PX_W}
              height={y - yUp((i + 1) * 5)}
              fill={i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent"}
            />
          );
        })}
        <rect x={0} y={yUp(10)} width={PX_W} height={PX_H - yUp(10)} fill="rgba(255,255,255,0.03)" />
        <rect x={0} y={yUp(120)} width={PX_W} height={yUp(110) - yUp(120)} fill="rgba(255,255,255,0.03)" />
        <rect x={0} y={0} width={PX_W} height={PX_H} fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={3} rx={12} />
        <YardLines />
        <HashMarks />
        <YardNumbers />
      </>
    );
  };

  // Throw buttons hide TE/RB if they’re blocking
  const throwButtons = useMemo<ReceiverID[]>(() => {
    const base: ReceiverID[] = ["X", "Z", "SLOT", "TE", "RB"];
    return base.filter((id) => !(id === "TE" && teBlock) && !(id === "RB" && rbBlock));
  }, [teBlock, rbBlock]);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 md:p-4 backdrop-blur-lg">
      <div className="flex items-center gap-3 mb-2">
        <div className="text-xs uppercase tracking-wide text-white/60">
          Simulator — {conceptId} vs {coverage}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Coverage insights pill */}
          <div className="hidden md:flex items-center gap-2 text-[11px] text-white/80">
            {coverage === 'C3' && (
              <span className="px-2 py-1 rounded-md bg-white/10">C3: {c3RotationMode === 'AUTO' ? c3Rotation : c3RotationMode}</span>
            )}
            {coverage === 'PALMS' && (
              <span className="px-2 py-1 rounded-md bg-white/10">Palms: {yDepthYds(wrPos(strongIsRight() ? (right2() ?? 'SLOT') : (left2() ?? 'SLOT'), t)) <= 10 ? 'TRAP #2' : 'CARRY #2'}</span>
            )}
            {coverage === 'QUARTERS' && (
              <span className="px-2 py-1 rounded-md bg-white/10">Quarters: {yDepthYds(wrPos(strongIsRight() ? (right2() ?? 'SLOT') : (left2() ?? 'SLOT'), t)) >= 12 ? 'CARRY #2' : 'MIDPOINT'}</span>
            )}
          </div>
          <button
            onClick={() => {
              try {
                const sp = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
                sp.set('c', String(conceptId));
                sp.set('cov', String(coverage));
                sp.set('f', String(formation));
                if (Object.keys(manualAssignments).length) sp.set('as', encodeURIComponent(JSON.stringify(manualAssignments)));
                if (teBlock) sp.set('tb', '1'); else sp.delete('tb');
                if (rbBlock) sp.set('rb', '1'); else sp.delete('rb');
                sp.set('pid', String(playId));
                sp.set('seed', String(rngSeed >>> 0));
                const url = `${window.location.pathname}?${sp.toString()}`;
                void navigator.clipboard.writeText(`${window.location.origin}${url}`);
                setAudibleNote('Copied shareable play link to clipboard.');
                safeTrack('share');
              } catch {
                setAudibleNote('Could not copy link.');
              }
            }}
            className="px-2 py-1 text-xs rounded-md bg-indigo-600/80 text-white"
            title="Copy a shareable link of this play"
          >
            Copy Play
          </button>
          <label className="text-white/70 text-xs">Formation</label>
          <select
            value={formation}
            onChange={(e) => setFormation(e.target.value as FormationName)}
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

          {/* Route paths (offense) */}
          <g fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={2}>
            {(["X", "Z", "SLOT", "TE", "RB"] as ReceiverID[]).map((rid) => (
              <polyline key={`rp-${rid}`} points={(O[rid] ?? []).map((pt) => `${pt.x},${pt.y}`).join(" ")} />
            ))}
          </g>

          {/* QB */}
          <circle cx={QB.x} cy={QB.y} r={7} fill="#fbbf24" />
          <text x={QB.x + 10} y={QB.y + 4} className="fill-white/85 text-[10px]">
            QB
          </text>

          {/* On-field coverage tooltip near QB */}
          {(() => {
            const lines: string[] = [];
            // MOF state
            const safFS = defenderPos(coverage, 'FS', t);
            const safSS = defenderPos(coverage, 'SS', t);
            const safDeep = [safFS, safSS].filter(p => yDepthYds(p) >= 14).length;
            lines.push(`MOF: ${safDeep >= 2 ? 'two-high' : 'one-high'}`);
            // Rotation / rules
            if (coverage === 'C3') lines.push(`C3: ${c3RotationMode === 'AUTO' ? c3Rotation : c3RotationMode}`);
            if (coverage === 'PALMS') {
              const sr = strongIsRight();
              const two = wrPos(sr ? (right2() ?? 'SLOT') : (left2() ?? 'SLOT'), t);
              lines.push(`Palms: ${yDepthYds(two) <= 10 ? 'TRAP #2' : 'CARRY #2'}`);
            }
            if (coverage === 'QUARTERS') {
              const sr = strongIsRight();
              const two = wrPos(sr ? (right2() ?? 'SLOT') : (left2() ?? 'SLOT'), t);
              lines.push(`Quarters: ${yDepthYds(two) >= 12 ? 'CARRY #2' : 'MIDPOINT'}`);
            }
            if (!lines.length) return null;
            const x = QB.x + xAcross(8);
            const y = QB.y - yDepthYds({ x: QB.x, y: QB.y }) / 100; // negligible; keep below
            return (
              <g>
                <rect x={x} y={QB.y - 44} width={160} height={36} rx={8} fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.25)" />
                <text x={x + 8} y={QB.y - 30} className="text-[10px]" fill="rgba(255,255,255,0.95)" style={{ paintOrder: 'stroke' }}>
                  {lines[0]}
                </text>
                {lines[1] && (
                  <text x={x + 8} y={QB.y - 18} className="text-[10px]" fill="rgba(255,255,255,0.9)">
                    {lines[1]}
                  </text>
                )}
              </g>
            );
          })()}

          {/* Offense */}
          {(["X", "Z", "SLOT", "TE", "RB"] as ReceiverID[]).map((rid) => {
            const p = wrPosSafe(rid, t);
            const nr = numbering[rid];
            const badge = nr ? ` (#${nr.number} ${nr.band})` : "";
            const { dx, dy } = labelOffsetFor(rid, p);
            const open = openness[rid]?.score ?? 0;
            const hue = Math.round(120 * open); // 0=red, 120=green
            return (
              <g key={rid}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={6}
                  fill={
                    rid === "X"
                      ? "#60a5fa"
                      : rid === "Z"
                      ? "#22d3ee"
                      : rid === "SLOT"
                      ? "#34d399"
                      : rid === "TE"
                      ? "#f472b6"
                      : "#a78bfa"
                  }
                />
                <text
                  x={p.x + dx}
                  y={p.y + dy}
                  className="text-[9px]"
                  fill="rgba(255,255,255,0.95)"
                  stroke="rgba(0,0,0,0.7)"
                  strokeWidth={2}
                  style={{ paintOrder: "stroke" }}
                >
                  {rid}
                  {badge}
                </text>
                {((rid === "TE" && teBlock) || (rid === "RB" && rbBlock)) && (
                  <text
                    x={p.x}
                    y={p.y - 12}
                    className="text-[8px]"
                    fill="rgba(255,255,255,0.95)"
                    stroke="rgba(0,0,0,0.7)"
                    strokeWidth={2}
                    style={{ paintOrder: "stroke" }}
                    textAnchor="middle"
                  >
                    PRO
                  </text>
                )}
                {phase === 'pre' && (
                  <text
                    x={p.x}
                    y={p.y + 14}
                    className="text-[8px]"
                    fill="rgba(255,255,255,0.9)"
                    stroke="rgba(0,0,0,0.6)"
                    strokeWidth={2}
                    style={{ paintOrder: 'stroke' }}
                    textAnchor="middle"
                  >
                    Lev: {levInfo[rid]?.side === 'outside' ? 'OUT' : levInfo[rid]?.side === 'inside' ? 'IN' : 'EVEN'}
                  </text>
                )}
                {phase === 'post' && (
                  <circle
                    cx={p.x}
                    cy={p.y - 12}
                    r={4}
                    fill={`hsl(${hue} 80% 45%)`}
                    stroke="rgba(255,255,255,0.8)"
                    strokeWidth={1}
                  >
                    <title>
                      {`Openness: ${(open*100).toFixed(0)}%  (nearest: ${openness[rid]?.nearest ?? '-'} @ ${(openness[rid]?.sepYds ?? 0).toFixed(1)} yds)`}
                    </title>
                  </circle>
                )}
              </g>
            );
          })}

          {/* Defense (computed live) */}
          {DEFENDER_IDS.map(id => {
            const p = defenderPos(coverage, id, t);
            const { dx, dy } = labelOffsetFor(id, p);

            return (
                <g key={id}>
                <rect x={p.x - 6} y={p.y - 6} width={12} height={12} fill="#ef4444" opacity={0.95}/>
                <text x={p.x + dx} y={p.y + dy}
                        className="text-[9px]" fill="rgba(255,255,255,0.95)"
                        stroke="rgba(0,0,0,0.7)" strokeWidth={2} style={{ paintOrder: "stroke" }}>
                    {id}
                </text>

                {/* Press badge on corners that are pressing */}
                {((id === "CB_L" && cbPress.CB_L.outcome !== "NONE") ||
                    (id === "CB_R" && cbPress.CB_R.outcome !== "NONE")) && (
                    <text
                    x={p.x}
                    y={p.y - 10}
                    className="text-[8px]"
                    fill="rgba(255,255,255,0.95)"
                    stroke="rgba(0,0,0,0.7)"
                    strokeWidth={2}
                    style={{ paintOrder: "stroke" }}
                    textAnchor="middle"
                    >
                    press
                    </text>
                )}
                </g>
            );
            })}

          {/* Ball path & ball */}
          {ballFlying && (
            <>
              <path
                d={`M ${ballP0.x} ${ballP0.y} Q ${ballP1.x} ${ballP1.y} ${ballP2.x} ${ballP2.y}`}
                stroke="rgba(255,255,255,0.6)"
                strokeDasharray="6 6"
                fill="none"
              />
              {(() => {
                const bp = qBezier(ballP0, ballP1, ballP2, ballT);
                return <circle cx={bp.x} cy={bp.y} r={5} fill="#f59e0b" stroke="white" strokeWidth={1} />;
              })()}
            </>
          )}

          {/* Catch pulse */}
          {catchAt && (
            <circle cx={catchAt.x} cy={catchAt.y} r={12} fill="url(#catchPulse)">
              <animate attributeName="r" from="0" to="28" dur="0.5s" fill="freeze" />
              <animate attributeName="opacity" from="0.9" to="0" dur="0.5s" fill="freeze" />
            </circle>
          )}
        </svg>

        {/* Controls */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {phase === "pre" ? (
            <button onClick={startSnap} className="px-3 py-2 rounded-xl bg-emerald-500/90 text-white">
              Snap
            </button>
          ) : (
            <button onClick={hardReset} className="px-3 py-2 rounded-xl bg-white/10 text-white">
              Reset
            </button>
          )}

          <div className="flex items-center gap-2 ml-1">
            <span className="text-white/60 text-xs">Time</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.floor(t * 100)}
              onChange={(e) => seek(Number(e.target.value) / 100)}
              disabled={ballFlying || phase !== "post"}
            />
          </div>

          {/* Speed sliders */}
          <div className="flex items-center gap-2 ml-2">
            <span className="text-white/60 text-xs">WR Speed</span>
            <input
              type="range"
              min={60}
              max={140}
              value={Math.round(recSpeed * 100)}
              onChange={(e) => setRecSpeed(Number(e.target.value) / 100)}
              title={`${(recSpeed * 100).toFixed(0)}%`}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white/60 text-xs">DEF Speed</span>
            <input
              type="range"
              min={60}
              max={140}
              value={Math.round(defSpeed * 100)}
              onChange={(e) => setDefSpeed(Number(e.target.value) / 100)}
              title={`${(defSpeed * 100).toFixed(0)}%`}
            />
          </div>

          <label className="ml-auto flex items-center gap-2 text-white/70 text-xs">
            <input type="checkbox" checked={soundOn} onChange={() => setSoundOn((s) => !s)} /> Sound
          </label>
        </div>

        {/* (removed duplicate audible quick row to avoid double Apply buttons) */}

        {/* Pass-pro toggles */}
        <div className="flex items-center gap-3 ml-2">
          <label className="flex items-center gap-2 text-white/70 text-xs">
            <input type="checkbox" checked={teBlock} onChange={() => setTeBlock((v) => !v)} />
            TE pass-pro
          </label>
          <label className="flex items-center gap-2 text-white/70 text-xs">
            <input type="checkbox" checked={rbBlock} onChange={() => setRbBlock((v) => !v)} />
            RB pass-pro
          </label>
        </div>

        {/* Throw targets + Audible */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
        {throwButtons.map(to => (
            <button
            key={to}
            disabled={!canThrowNow}
            onClick={() => startThrow(to)}
            className={`px-3 py-2 rounded-xl ${
                canThrowNow ? "bg-gradient-to-r from-indigo-500 to-fuchsia-500" : "bg-white/10"
            } text-white disabled:opacity-50`}
            title={canThrowNow ? "Throw now" : "Wait (ball in air or play over)"}
            >
            Throw: {to}
            </button>
        ))}

          {/* Big Audible toggle button */}
          <button
            onClick={() => setAudibleOn((v) => !v)}
            className={`ml-1 px-4 py-3 rounded-xl text-white font-semibold shadow ${
              audibleOn
                ? "bg-gradient-to-r from-amber-500 to-pink-500"
                : "bg-gradient-to-r from-fuchsia-600 to-purple-600 hover:opacity-90"
            }`}
            title="Toggle audible mode"
          >
            {audibleOn ? "Audible: ON" : "Audible"}
          </button>

          {/* Clear Audibles */}
          <button
            onClick={clearAudibles}
            disabled={!hasAudibles && !audTarget && !audRoute}
            className="px-4 py-3 rounded-xl text-white font-semibold bg-white/10 disabled:opacity-50"
            title={hasAudibles ? "Clear all audibles" : "No audibles set"}
          >
            Clear Audibles
          </button>

          {/* C3 Rotation selector (optional control) */}
          {coverage === 'C3' && (
            <div className="flex items-center gap-2 ml-2 text-white/80 text-xs">
              <span>C3 Rotation</span>
              <select
                className="bg-white/10 text-white rounded-md px-2 py-2"
                value={c3RotationMode}
                onChange={(e) => setC3RotationMode(e.target.value as C3RotationMode)}
                title="Choose Cover 3 rotation"
              >
                <option value="AUTO">Auto</option>
                <option value="SKY">Sky</option>
                <option value="BUZZ">Buzz</option>
                <option value="CLOUD_STRONG">Cloud (Strong)</option>
              </select>
            </div>
          )}

          {/* Inline audible controls when enabled */}
          {audibleOn && (
            <div className="flex flex-wrap items-center gap-2 pl-1">
              <select
                className="bg-white/10 text-white text-xs md:text-sm rounded-md px-2 py-2"
                value={audTarget}
                onChange={(e) => setAudTarget(e.target.value as ReceiverID)}
              >
                <option value="">Receiver…</option>
                {selectableReceivers.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <select
                className="bg-white/10 text-white text-xs md:text-sm rounded-md px-2 py-2"
                value={audRoute}
                onChange={(e) => setAudRoute(e.target.value as RouteKeyword)}
              >
                <option value="">Route…</option>
                {ROUTE_MENU.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <button
                onClick={applyAudible}
                disabled={!audTarget || !audRoute}
                className="px-3 py-2 rounded-xl bg-amber-400 text-black font-semibold disabled:opacity-60"
              >
                Apply
              </button>
            </div>
          )}
        </div>

        {/* Result + audible note */}
        {(decision || grade || explain || audibleNote) && (
          <div className="mt-3 p-3 rounded-xl bg-white/5 text-white space-y-1">
            {decision && (
              <div className="text-sm">
                You threw to <span className="font-semibold">{decision}</span>. Grade:{" "}
                <span className="font-semibold">{grade ?? "…"}</span>
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
