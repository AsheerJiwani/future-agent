"use client";

import { JSX, useEffect, useMemo, useRef, useState, useCallback, startTransition } from "react";
import type { FootballConceptId } from "../../data/football/catalog";
import type { CoverageID, ReceiverID, RouteKeyword, Pt, AlignMap } from "../../data/football/types";
import type { PlaySnapshot, SnapMeta, ThrowSummary } from "@/types/play";
import { usePlayClock } from "./hooks/usePlayClock";
import { XorShift32, mixSeed } from "../../lib/rng";
import { getOrCreateUserId } from "../../lib/user";

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

const PX_W = 720; // Reduced width to fit three-column layout better
const PX_H = 480; // Optimized height for complete 120-yard field visibility

const XPX = PX_W / FIELD_WIDTH_YDS;
const YPX = PX_H / FIELD_LENGTH_YDS;

const xAcross = (ydsAcross: number) => ydsAcross * XPX;
const yUp = (ydsUp: number) => PX_H - ydsUp * YPX;
// Convert a field Y coordinate to yards “upfield” from the bottom LOS
function yDepthYds(p: Pt): number {
  return (PX_H - p.y) / YPX;
}

// QB at field center width, positioned based on LOS (Line of Scrimmage at 20-yard line)
const LOS_YDS = 20; // Line of scrimmage 20 yards from bottom goal line
const QB = { x: xAcross(FIELD_WIDTH_YDS / 2), y: yUp(LOS_YDS) };

// Enhanced QB position based on formation and dropback progression
const getQBPosition = (isShotgun: boolean, isPostSnap: boolean = false, timeElapsed: number = 0) => {
  // Shotgun: QB starts 5-7 yards behind LOS
  // Under center: QB starts at LOS, then drops back 3/5/7 steps
  const baseY = isShotgun ? yUp(LOS_YDS + 7) : yUp(LOS_YDS);
  
  if (!isPostSnap) return { x: QB.x, y: baseY };
  
  // QB dropback progression with NFL-realistic timing
  if (isShotgun) {
    // Shotgun: minimal dropback, more lateral movement in pocket
    const pocketMovement = Math.sin(timeElapsed * 2) * 0.5; // Subtle pocket movement
    return { 
      x: QB.x + xAcross(pocketMovement), 
      y: baseY + yUp(Math.min(2, timeElapsed * 1.5))
    };
  } else {
    // Under center: traditional 3/5/7 step drops
    const dropSteps = timeElapsed < 1.0 ? 3 : timeElapsed < 2.0 ? 5 : 7;
    const dropYards = dropSteps * 1.2; // ~1.2 yards per step
    const dropProgress = Math.min(1, timeElapsed / 2.0);
    const currentDrop = dropYards * dropProgress;
    
    return { x: QB.x, y: baseY + yUp(currentDrop) };
  }
};

// Enhanced RB position based on formation and blocking assignments
const getRBPosition = (isShotgun: boolean, formation: FormationName, align: AlignMap, isBlocking: boolean = false, isPostSnap: boolean = false, timeElapsed: number = 0) => {
  if (isShotgun) {
    // Shotgun: RB offset and deeper than QB
    const lateralOffset = formation === "TRIPS_RIGHT" ? -3.5 : 3.5;
    const baseDepth = 18.5; // 1.5 yards deeper than QB
    
    if (isBlocking && isPostSnap) {
      // RB steps up to help with protection
      const protectionStep = Math.min(2, timeElapsed * 3);
      return { 
        x: QB.x + xAcross(lateralOffset * 0.7), 
        y: yUp(baseDepth - protectionStep) 
      };
    }
    
    return { x: QB.x + xAcross(lateralOffset), y: yUp(baseDepth) };
  } else {
    // Under center: RB behind QB, ready for handoff or protection
    const baseX = QB.x + xAcross(formation === "TRIPS_RIGHT" ? -1.5 : 1.5);
    const baseY = yUp(7); // 5 yards behind LOS
    
    if (isBlocking && isPostSnap) {
      // RB steps up for pass protection
      const protectionStep = Math.min(3, timeElapsed * 2.5);
      return { x: baseX, y: baseY - yUp(protectionStep) };
    }
    
    return { x: baseX, y: baseY };
  }
};

/* --------- Types --------- */
type DefenderID =
  | "CB_L"
  | "CB_R"
  | "NICKEL"
  | "FS"
  | "SS"
  | "SAM"
  | "MIKE"
  | "WILL"
  | "DE_L"
  | "DE_R"
  | "DT_L"
  | "DT_R";

type OffensiveLineID =
  | "LT"
  | "LG" 
  | "C"
  | "RG"
  | "RT";

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
// Dynamic QB hash X: module-local; PlaySimulator updates it each render
let QB_X_DYNAMIC: number = xAcross(FIELD_WIDTH_YDS / 2);
const qbX = () => QB_X_DYNAMIC;
const isLeftOfQB = (p: Pt) => p.x < qbX();
const outSign = (p: Pt) => (isLeftOfQB(p) ? -1 : +1);
// const inSign = (p: Pt) => (isLeftOfQB(p) ? +1 : -1);

const SIDELINE_MARGIN = 4;
const HASH_L = xAcross(HASH_FROM_SIDELINE_YDS);
const HASH_R = xAcross(FIELD_WIDTH_YDS - HASH_FROM_SIDELINE_YDS);
// const oppositeHashX = (s: Pt) => (isLeftOfQB(s) ? HASH_R : HASH_L);
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

function routeFromKeyword(name: RouteKeyword, s: Pt, coverage: CoverageID, refLeft?: boolean): Pt[] {
  const twoHigh = ["C2", "TAMPA2", "C4", "QUARTERS", "C6", "PALMS"].includes(coverage);
  const left = (refLeft !== undefined) ? refLeft : isLeftOfQB(s);
  const outS = left ? -1 : +1;
  const inS  = left ? +1 : -1;
  const sidelineXRef = (off = SIDELINE_MARGIN) => (left ? xAcross(off) : xAcross(FIELD_WIDTH_YDS - off));
  switch (name) {
    /* Verticals */
    case "GO": {
      const rel = { x: s.x + outS * xAcross(2), y: yUp(DEPTH.short) };
      return [s, rel, { x: rel.x, y: yUp(DEPTH.shot) }];
    }
    case "SEAM": {
      return [s, { x: s.x, y: yUp(DEPTH.shot) }];
    }
    case "BENDER": {
      if (twoHigh) {
        const stem = { x: s.x, y: yUp(DEPTH.deep - 2) };
        return [s, stem, { x: qbX(), y: yUp(DEPTH.shot) }];
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
      const breakPt = { x: s.x + outS * xAcross(4), y: stem.y };
      return [s, stem, breakPt];
    }
    case "SLANT": {
      const breakPt = { x: s.x + inS * xAcross(6), y: yUp(DEPTH.quick) };
      return [s, breakPt, { x: breakPt.x + inS * xAcross(4), y: yUp(DEPTH.mid) }];
    }
    case "SPEED_OUT": {
      const stem = { x: s.x, y: yUp(DEPTH.quick) };
      const out = { x: s.x + outS * xAcross(H.outQuick), y: stem.y };
      return [s, stem, out];
    }
    case "FLAT": {
      const out = { x: s.x + outS * xAcross(H.flat), y: yUp(DEPTH.quick) };
      return [s, out];
    }
    case "CHECK": {
      return [s, { x: s.x + inS * xAcross(3), y: yUp(DEPTH.quick - 1) }];
    }

    /* Intermediate */
    case "OUT": {
      const stem = { x: s.x, y: yUp(DEPTH.mid) };
      const breakPt = { x: s.x + outS * xAcross(H.outDeep), y: stem.y };
      return [s, stem, breakPt];
    }
    case "OUT_LOW": {
      const stem = { x: s.x, y: yUp(DEPTH.quick) };
      const breakPt = { x: s.x + outS * xAcross(H.outQuick), y: stem.y };
      return [s, stem, breakPt];
    }
    case "OUT_MID": {
      const stem = { x: s.x, y: yUp(DEPTH.mid) };
      const breakPt = { x: s.x + outS * xAcross(12), y: stem.y };
      return [s, stem, breakPt];
    }
    case "OUT_HIGH": {
      const stem = { x: s.x, y: yUp(DEPTH.deep) };
      const breakPt = { x: s.x + outS * xAcross(H.outDeep), y: stem.y };
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
      const back = { x: sidelineXRef(6), y: yUp(DEPTH.curl) };
      return [s, stem, back];
    }
    case "COMEBACK_LOW": {
      const stem = { x: s.x, y: yUp(DEPTH.curl) };
      const back = { x: sidelineXRef(8), y: yUp(DEPTH.quick) };
      return [s, stem, back];
    }
    case "COMEBACK_HIGH": {
      const stem = { x: s.x, y: yUp(DEPTH.shot - 2) };
      const back = { x: sidelineXRef(6), y: yUp(DEPTH.dig) };
      return [s, stem, back];
    }
    case "DIG": {
      const stem = { x: s.x, y: yUp(DEPTH.dig) };
      const inCut = { x: qbX() + inS * xAcross(10), y: stem.y };
      return [s, stem, inCut];
    }

    /* Deep */
    case "POST": {
      const stem = { x: s.x, y: yUp(DEPTH.deep) };
      const bend = { x: qbX(), y: yUp(DEPTH.shot) };
      return [s, stem, bend];
    }
    case "CORNER":
    case "CORNER_MID": {
      // Mid corner: stem tops at 10 yds beyond LOS, then 15 yds upfield diagonally to sideline
      const losY = yDepthYds(s);
      const stemTopY = losY + 10;
      const diagY = stemTopY + 15;
      const stem = { x: s.x, y: yUp(stemTopY) };
      const diag = { x: sidelineX(s, 8), y: yUp(diagY) };
      return [s, stem, diag];
    }
    case "CORNER_LOW": {
      // Low corner: stem tops at 3 yds beyond LOS, then 15 yds upfield diagonally to sideline
      const losY = yDepthYds(s);
      const stemTopY = losY + 3;
      const diagY = stemTopY + 15;
      const stem = { x: s.x, y: yUp(stemTopY) };
      const diag = { x: sidelineXRef(8), y: yUp(diagY) };
      return [s, stem, diag];
    }
    case "CORNER_HIGH": {
      // High corner: stem tops at 17 yds beyond LOS, then 15 yds upfield diagonally to sideline
      const losY = yDepthYds(s);
      const stemTopY = losY + 17;
      const diagY = stemTopY + 15;
      const stem = { x: s.x, y: yUp(stemTopY) };
      const diag = { x: sidelineXRef(8), y: yUp(diagY) };
      return [s, stem, diag];
    }

    /* Crossers */
    case "OVER": {
      const stem = { x: s.x, y: yUp(DEPTH.deep - 2) };
      const cross = { x: left ? HASH_R : HASH_L, y: yUp(DEPTH.deep) };
      return [s, stem, cross];
    }
    case "CROSS": {
      const stem = { x: s.x, y: yUp(DEPTH.mid - 1) };
      const cross = { x: left ? HASH_R : HASH_L, y: yUp(DEPTH.mid) };
      return [s, stem, cross];
    }
    case "SHALLOW": {
      const under = { x: left ? HASH_R : HASH_L, y: yUp(18) };
      return [s, under];
    }

    /* RB */
    case "WHEEL": {
      const flat = { x: sidelineXRef(8), y: yUp(DEPTH.quick) };
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

// Adjust far-hash outside splits: pull outside WRs a couple yards inside from the sideline
function adjustSplitsForHash(A: AlignMap, hash: 'L'|'R'): AlignMap {
  const qbXNow = hash === 'L' ? HASH_L : HASH_R;
  const farRight = hash === 'L';
  const clampX = (x: number) => Math.max(xAcross(4), Math.min(xAcross(FIELD_WIDTH_YDS - 4), x));
  const res: AlignMap = { ...A } as AlignMap;
  (['X','Z','SLOT','TE','RB'] as ReceiverID[]).forEach((rid) => {
    const p = A[rid];
    if (!p) return;
    const isFar = farRight ? (p.x > qbXNow) : (p.x < qbXNow);
    if (!isFar) return;
    // distance to nearest sideline in yards
    const distSidelineYds = farRight ? (FIELD_WIDTH_YDS - p.x / XPX) : (p.x / XPX);
    if (distSidelineYds <= 9.0) {
      // Move 2 yards in toward MOF
      const dx = xAcross(farRight ? -2 : +2);
      res[rid] = { x: clampX(p.x + dx), y: p.y };
    }
  });
  return res;
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

/* --------- PERFORMANCE: Memoization Caches for Ultra-Fast Rendering --------- */
const formationCache = new Map<string, AlignMap>();
const numberingCache = new Map<string, Numbering>();
// const routeCache = new Map<string, RouteMap>();

// Debounced state update pattern for preventing rapid-fire updates (unused for now)
// const debounceMap = new Map<string, NodeJS.Timeout>();
// function debouncedUpdate(key: string, updateFn: () => void, delay = 16) {
//   const existing = debounceMap.get(key);
//   if (existing) clearTimeout(existing);
//   
//   const timeout = setTimeout(() => {
//     updateFn();
//     debounceMap.delete(key);
//   }, delay);
//   
//   debounceMap.set(key, timeout);
// }

function getCachedFormation(formationName: FormationName, hashSide: 'L'|'R', customAlign: AlignMap | null): AlignMap {
  if (customAlign) return customAlign;
  
  const key = `${formationName}_${hashSide}`;
  if (formationCache.has(key)) {
    return formationCache.get(key)!;
  }
  
  const base = FORMATIONS[formationName];
  const adjusted = adjustSplitsForHash(base, hashSide);
  formationCache.set(key, adjusted);
  return adjusted;
}

function getCachedNumbering(align: AlignMap): Numbering {
  // Simple cache key based on positions - for production you might want a more sophisticated key
  const key = JSON.stringify(align);
  if (numberingCache.has(key)) {
    return numberingCache.get(key)!;
  }
  
  const numbering = computeNumbering(align);
  numberingCache.set(key, numbering);
  return numbering;
}

/* --------- Concept defaults (used if JSON lacks assignments) --------- */
function buildConceptRoutes(
  conceptId: FootballConceptId,
  A: AlignMap,
  coverage: CoverageID,
  orient?: Record<ReceiverID, boolean>
): RouteMap {
  const ID = (conceptId as string).toUpperCase();
  const mk = (m: Partial<Record<ReceiverID, RouteKeyword>>): RouteMap => ({
    X: routeFromKeyword(m.X ?? "HITCH", A.X, coverage, orient?.X),
    Z: routeFromKeyword(m.Z ?? "HITCH", A.Z, coverage, orient?.Z),
    SLOT: routeFromKeyword(m.SLOT ?? "FLAT", A.SLOT, coverage, orient?.SLOT),
    TE: routeFromKeyword(m.TE ?? "STICK", A.TE, coverage, orient?.TE),
    RB: routeFromKeyword(m.RB ?? "CHECK", A.RB, coverage, orient?.RB),
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
  CB_L: { x: xAcross(8), y: yUp(LOS_YDS - 3.5) },
  CB_R: { x: xAcross(FIELD_WIDTH_YDS - 8), y: yUp(LOS_YDS - 3.5) },
  NICKEL: { x: xAcross(FIELD_WIDTH_YDS - 18), y: yUp(LOS_YDS - 3) },
  SAM: { x: xAcross(20), y: yUp(LOS_YDS + 2) },
  MIKE: { x: xAcross(FIELD_WIDTH_YDS / 2), y: yUp(LOS_YDS + 2) },
  WILL: { x: xAcross(FIELD_WIDTH_YDS - 20), y: yUp(LOS_YDS + 2) },
  FS: { x: xAcross(FIELD_WIDTH_YDS / 2), y: yUp(LOS_YDS + 15) },
  SS: { x: xAcross(FIELD_WIDTH_YDS / 2 - 12), y: yUp(LOS_YDS + 12) },
  DE_L: { x: xAcross(FIELD_WIDTH_YDS / 2 - 9), y: yUp(LOS_YDS - 0.5) },
  DE_R: { x: xAcross(FIELD_WIDTH_YDS / 2 + 9), y: yUp(LOS_YDS - 0.5) },
  DT_L: { x: xAcross(FIELD_WIDTH_YDS / 2 - 3), y: yUp(LOS_YDS - 0.5) },
  DT_R: { x: xAcross(FIELD_WIDTH_YDS / 2 + 3), y: yUp(LOS_YDS - 0.5) }
};

// Base Offensive Line positions (will be adjusted dynamically for pocket)
const OL_ALIGN: Record<OffensiveLineID, Pt> = {
  LT: { x: xAcross(FIELD_WIDTH_YDS / 2 - 6), y: yUp(LOS_YDS) },
  LG: { x: xAcross(FIELD_WIDTH_YDS / 2 - 3), y: yUp(LOS_YDS) },
  C: { x: xAcross(FIELD_WIDTH_YDS / 2), y: yUp(LOS_YDS) },
  RG: { x: xAcross(FIELD_WIDTH_YDS / 2 + 3), y: yUp(LOS_YDS) },
  RT: { x: xAcross(FIELD_WIDTH_YDS / 2 + 6), y: yUp(LOS_YDS) }
};

// Enhanced OL positions that form realistic NFL pocket
const getOLPosition = (olId: OffensiveLineID, qbPosition: Pt, isPostSnap: boolean, timeElapsed: number, 
                     protection: ProtectionScheme = 'MAN_PROTECT', isShotgun: boolean = false) => {
  const basePos = OL_ALIGN[olId];
  
  if (!isPostSnap) return basePos;
  
  // NFL pocket formation - forms upside-down "U" around QB
  const pocketDepth = Math.min(isShotgun ? 2 : 4, timeElapsed * 1.8);
  const pocketY = basePos.y + yUp(pocketDepth);
  
  // Enhanced Center blocking logic for double teams and LB pickup
  let xAdjust = 0;
  let yAdjust = 0;
  
  if (olId === 'C') {
    // Center-specific logic: double team or LB pickup
    if (timeElapsed > 0.8) {
      // After initial engagement, Center can:
      // 1. Help with double team on DT
      // 2. Pick up blitzing LB (MIKE most common)
      // 3. Slide to help with breakthrough
      
      // Check for MIKE LB blitz (common interior blitz)
      const mikeBlitzLikely = protection === 'MAX_PROTECT' || Math.random() > 0.7;
      
      if (mikeBlitzLikely) {
        // Center steps up to pick up MIKE LB
        yAdjust = -1.5; // Step forward to meet LB
        xAdjust = 0; // Stay centered
      } else {
        // Double team help - step toward nearest DT
        const helpSide = Math.random() > 0.5 ? 'L' : 'R';
        xAdjust = helpSide === 'L' ? -1.2 : 1.2;
        yAdjust = -0.5; // Step up slightly for leverage
      }
    }
  } else {
    // Regular OL protection scheme adjustments
    switch (protection) {
      case 'SLIDE_LEFT':
        xAdjust = olId === 'RT' ? -1 : olId === 'RG' ? -0.5 : olId === 'LT' ? 0.5 : 0;
        break;
      case 'SLIDE_RIGHT':
        xAdjust = olId === 'LT' ? 1 : olId === 'LG' ? 0.5 : olId === 'RT' ? -0.5 : 0;
        break;
      case 'HALF_SLIDE_LEFT':
        xAdjust = ['RG', 'RT'].includes(olId) ? -0.5 : 0;
        break;
      case 'HALF_SLIDE_RIGHT':
        xAdjust = ['LG', 'LT'].includes(olId) ? 0.5 : 0;
        break;
    }
  }
  
  // Create pocket "U" shape - wider at the top, narrower near QB
  const distanceFromCenter = Math.abs(basePos.x - QB.x);
  const pocketArc = distanceFromCenter * 0.15; // More pronounced arc
  const pocketWidth = Math.max(0.8, 1 - (pocketDepth * 0.1)); // Pocket narrows as it deepens
  
  return {
    x: basePos.x + xAcross(xAdjust) * pocketWidth,
    y: pocketY - yUp(pocketArc) + yUp(yAdjust)
  };
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

// Defender id list (used by openness, wrPosSafe, etc.) — keep above first usage to avoid TDZ
// const DEFENDER_IDS: DefenderID[] = [
//   "CB_L", "CB_R", "NICKEL", "FS", "SS", "SAM", "MIKE", "WILL", "DE_L", "DE_R", "DT_L", "DT_R"
// ];

// Get active defenders based on offensive personnel (11 total)
function getActiveDefenders(formation: FormationName): DefenderID[] {
  const hasSlot = formation === "TRIPS_RIGHT" || formation === "BUNCH_LEFT";
  const base_defense: DefenderID[] = ["CB_L", "CB_R", "FS", "SS", "SAM", "MIKE", "WILL", "DE_L", "DE_R", "DT_L", "DT_R"];
  const nickel_defense: DefenderID[] = ["CB_L", "CB_R", "NICKEL", "FS", "SS", "SAM", "MIKE", "DE_L", "DE_R", "DT_L", "DT_R"];
  
  return hasSlot ? nickel_defense : base_defense;
}

const OL_IDS: OffensiveLineID[] = ["LT", "LG", "C", "RG", "RT"];
// const DL_IDS: DefenderID[] = ["DE_L", "DE_R", "DT_L", "DT_R"];

// Enhanced protection schemes and breakthrough system
type ProtectionScheme = 'SLIDE_LEFT' | 'SLIDE_RIGHT' | 'HALF_SLIDE_LEFT' | 'HALF_SLIDE_RIGHT' | 'MAX_PROTECT' | 'MAN_PROTECT';
type RushMove = 'POWER' | 'SPEED' | 'INSIDE' | 'STUNT';
type BreakthroughResult = {
  defender: DefenderID;
  timeToQB: number; // seconds until reaching QB
  rushMove: RushMove;
};

// Deterministic breakthrough system - one DL will always break through
const calculateBreakthrough = (timeElapsed: number, protection: ProtectionScheme, dlSpeed: number = 1.0): BreakthroughResult | null => {
  // Choose which DL breaks through based on protection scheme and time
  const baseBreakthroughTime = protection === 'MAX_PROTECT' ? 4.5 : protection.includes('SLIDE') ? 3.2 : 2.8;
  const adjustedTime = baseBreakthroughTime / dlSpeed;
  
  if (timeElapsed < adjustedTime) return null;
  
  // Select breakthrough defender based on protection weakness
  let defender: DefenderID;
  let rushMove: RushMove;
  
  switch (protection) {
    case 'SLIDE_LEFT':
      defender = 'DE_R';
      rushMove = 'SPEED';
      break;
    case 'SLIDE_RIGHT':
      defender = 'DE_L';
      rushMove = 'SPEED';
      break;
    case 'HALF_SLIDE_LEFT':
      defender = Math.random() > 0.5 ? 'DT_R' : 'DE_R';
      rushMove = 'INSIDE';
      break;
    case 'HALF_SLIDE_RIGHT':
      defender = Math.random() > 0.5 ? 'DT_L' : 'DE_L';
      rushMove = 'INSIDE';
      break;
    default:
      // MAN_PROTECT: most likely DT up the middle
      defender = Math.random() > 0.6 ? 'DT_L' : 'DT_R';
      rushMove = 'POWER';
  }
  
  const timeToQB = Math.max(0.5, adjustedTime - timeElapsed + 1.0);
  return { defender, timeToQB, rushMove };
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
  onThrowGraded,
  fullScreen = false,
}: {
  conceptId: FootballConceptId;
  coverage: CoverageID;
  onSnapshot?: (snap: PlaySnapshot, meta: SnapMeta) => void;
  onThrowGraded?: (summary: ThrowSummary) => void;
  fullScreen?: boolean;
}) {
  const [phase, setPhase] = useState<"pre" | "post" | "decided">("pre");
  const { t, setT, seek, start: startClock, stop: stopClock, reset: resetClock } = usePlayClock(3000);
  const [decision, setDecision] = useState<ReceiverID | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [explain, setExplain] = useState<string | null>(null);

  const [formation, setFormation] = useState<FormationName>("TRIPS_RIGHT");
  const [manualAssignments, setManualAssignments] = useState<AssignMap>({});

  const [align, setAlign] = useState<AlignMap>(FORMATIONS[formation]);
  const [customAlign, setCustomAlign] = useState<AlignMap | null>(null);
  const [O, setO] = useState<RouteMap>(() => {
    const A0 = FORMATIONS[formation];
    const orient0: Record<ReceiverID, boolean> = {
      X: (A0.X.x < QB.x),
      Z: (A0.Z.x < QB.x),
      SLOT: (A0.SLOT.x < QB.x),
      TE: (A0.TE.x < QB.x),
      RB: (A0.RB.x < QB.x)
    };
    return buildConceptRoutes(conceptId, A0, coverage, orient0);
  });
  // Reset route orientation when concept or formation changes (call-time anchor)
  useEffect(() => {
    const A0 = FORMATIONS[formation];
    const orient0: Record<ReceiverID, boolean> = {
      X: (A0.X.x < QB.x),
      Z: (A0.Z.x < QB.x),
      SLOT: (A0.SLOT.x < QB.x),
      TE: (A0.TE.x < QB.x),
      RB: (A0.RB.x < QB.x)
    };
    setRouteOrient(orient0);
    // // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conceptId, formation]);
  const [numbering, setNumbering] = useState<Numbering>(() => getCachedNumbering(FORMATIONS[formation]));

  // Defender starts (dynamic, strength-aware)
  const [Dstart, setDstart] = useState<Record<DefenderID, Pt>>(D_ALIGN);
  // Live defender positions with velocity tracking for smooth movement
  const [Dlive, setDlive] = useState<Record<DefenderID, Pt>>(Dstart);
  const [Dvelocity, setDvelocity] = useState<Record<DefenderID, Pt>>({} as Record<DefenderID, Pt>);
  const [DlastTargets, setDlastTargets] = useState<Record<DefenderID, Pt>>(Dstart);
  const [DzoneAssignments, setDzoneAssignments] = useState<Record<DefenderID, { primary: ReceiverID | null, zone: string, priority: number }>>({} as Record<DefenderID, { primary: ReceiverID | null, zone: string, priority: number }>);
  const [DstableTargets, setDstableTargets] = useState<Record<DefenderID, Pt>>(Dstart);
  const lastTRef = useRef<number>(0);
  const lastUpdateTimeRef = useRef<number>(0);
  const lastZoneUpdateRef = useRef<number>(0);
  const [overlayTick, setOverlayTick] = useState(0);
  // Speeds
  const [recSpeed, setRecSpeed] = useState(1.0); // 0.7–1.5
  const [defSpeed, setDefSpeed] = useState(0.95); // 0.7–1.5
  const [ballSpeed, setBallSpeed] = useState(1.0); // 0.5–3.0 (50% to 300%)

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
  // Star receiver (user-chosen)
  const [starRid, setStarRid] = useState<ReceiverID | "">("");
  
  // New state for enhanced OL/DL mechanics
  const [protectionScheme] = useState<ProtectionScheme>('MAN_PROTECT');
  const [isShotgun] = useState<boolean>(false);
  // const [breakthrough, setBreakthrough] = useState<BreakthroughResult | null>(null);
  // const [olDlEngagement, setOlDlEngagement] = useState<Record<string, { ol: OffensiveLineID; dl: DefenderID; intensity: number }>>({});

  // --- Blocking state (success odds: TE 90%, RB 70%)
  type Blocker = "TE" | "RB";
  type BlockMap = Partial<Record<Blocker, DefenderID | null>>;

  const [teBlock, setTeBlock] = useState(false);
  const [rbBlock, setRbBlock] = useState(false);
  const [shotgun, setShotgun] = useState(false);
  const [qbPos, setQbPos] = useState(() => getQBPosition(isShotgun, false, 0));

  // Update QB position when formation/shotgun changes or time progresses
  useEffect(() => {
    setQbPos(getQBPosition(isShotgun, phase === 'post', t));
  }, [isShotgun, phase, t, formation]);

  // Update RB position in formation when shotgun changes
  useEffect(() => {
    const baseAlign = FORMATIONS[formation];
    const newAlign = {
      ...baseAlign,
      RB: getRBPosition(shotgun, formation, baseAlign)
    };
    setAlign(newAlign);
  }, [shotgun, formation]);

  const [, setBlockAssignments] = useState<BlockMap>({});
  const [blockedDefenders, setBlockedDefenders] = useState<Set<DefenderID>>(new Set());
  const [blockEngage, setBlockEngage] = useState<Partial<Record<DefenderID, Pt>>>({});

  // --- Audible UI ---
  const [audibleOn, setAudibleOn] = useState(false);
  const [audTarget, setAudTarget] = useState<ReceiverID | "">("");
  const [audRoute, setAudRoute]   = useState<RouteKeyword | "">("");

  const [, setCaught] = useState(false);

  // --- Motion state (only one motion at a time) ---
  type MotionType = 'jet'|'short'|'across';
  type MotionDir = 'left'|'right';
  const [motionRid, setMotionRid] = useState<ReceiverID | "">("");
  const [motionType, setMotionType] = useState<MotionType>('across');
  const [motionDir, setMotionDir] = useState<MotionDir>('right');
  const [snapOnMotion, setSnapOnMotion] = useState<boolean>(true);
  const [motionBusy, setMotionBusy] = useState<boolean>(false);
  const [lastMotion, setLastMotion] = useState<{ rid: ReceiverID; type: MotionType; dir: MotionDir } | null>(null);
  const [routeOrient, setRouteOrient] = useState<Record<ReceiverID, boolean>>({ X: true, Z: false, SLOT: false, TE: false, RB: false });
  // Dev & checks
  const [fireZoneOn, setFireZoneOn] = useState<boolean>(false);
  const [showDev, setShowDev] = useState<boolean>(false);
  const [showDefense, setShowDefense] = useState<boolean>(false);
  type FZPreset = 'NICKEL' | 'SAM' | 'WILL';
  const [fzPreset, setFzPreset] = useState<FZPreset>('NICKEL');
  const [drillInfo, setDrillInfo] = useState<{ coverage?: CoverageID; formation?: FormationName; motions?: Array<{ rid: ReceiverID; type?: 'jet'|'short'|'across'; dir?: 'left'|'right' }>; fireZone?: { on: boolean; preset?: FZPreset }; reason?: string; lastRep?: { target: ReceiverID; grade?: string; throwArea?: string; windowScore?: number; catchWindowScore?: number; catchSepYds?: number } } | null>(null);
  const [autoRunHUD, setAutoRunHUD] = useState<{ active: boolean; left: number; nextIn: number }>({ active: false, left: 0, nextIn: 0 });
  const [repChips, setRepChips] = useState<Array<{ grade?: string; open?: number; area?: string }>>([]);
  const [motionLockRid, setMotionLockRid] = useState<ReceiverID | null>(null);
  const [hashSide, setHashSide] = useState<'L'|'R'>('L');
  // push current QB X to helpers used above
  QB_X_DYNAMIC = hashSide === 'L' ? HASH_L : HASH_R;
  const [showNearest, setShowNearest] = useState<boolean>(false);
  // const [lastCatchInfo, setLastCatchInfo] = useState<{ rid: ReceiverID; t: number; score: number; sep: number } | null>(null);
  const [motionBoost, setMotionBoost] = useState<{ rid: ReceiverID | null; untilT: number; mult: number }>({ rid: null, untilT: 0, mult: 1.0 });
  const [manLagProfile, setManLagProfile] = useState<Partial<Record<DefenderID, { lagFrac: number; amp: number }>>>({});

  // Relative speed multipliers by position (realistic-ish deltas)
  function receiverSpeedMult(id: ReceiverID): number {
    switch (id) {
      case "TE": return 0.90; // TEs a bit slower top-end vs WRs
      case "RB": return 0.98; // RBs quick but shorter stride on routes
      case "SLOT": return 0.98; // quick area burst, slightly less stride on deep
      default: return 1.00; // X/Z boundary WRs baseline
    }
  }
  // Additional speed boost for star receiver
  const starSpeedMult = useCallback((id: ReceiverID): number => {
    if (!starRid || id !== starRid) return 1.0;
    return 1.10;
  }, [starRid]);
  function defenderSpeedMult(id: DefenderID): number {
    // REALISTIC SPEED CAP: Defenders capped at 90% of their receiver equivalents
    switch (id) {
      case "CB_L":
      case "CB_R":
        // Cover X/Z WRs: 90% of baseline WR speed (1.00)
        return 0.90;
      case "NICKEL":
        // Cover SLOT: 90% of SLOT speed (0.98)
        return 0.88;
      case "FS":
      case "SS":
        // Cover deep routes from WRs/RBs: 90% of average receiver
        return 0.86;
      case "SAM":
      case "MIKE":
      case "WILL":
        // Cover TEs/RBs: 90% of TE speed (0.90)
        return 0.81;
      case "DE_L":
      case "DE_R":
        // Defensive Ends: Pass rush/contain, slower than LBs
        return 0.75;
      case "DT_L":
      case "DT_R":
        // Defensive Tackles: Interior rush, slowest defenders
        return 0.65;
      default:
        return 0.85; // Default safe cap
    }
  }

  // Deterministic RNG per play
  const [playId, setPlayId] = useState(0);
  const [rngSeed, setRngSeed] = useState<number>(() => mixSeed(Date.now() >>> 0, Math.floor(Math.random() * 0x7fffffff)));
  const [userId, setUserId] = useState<string | null>(null);
  const rngRef = useRef<XorShift32>(new XorShift32(mixSeed(rngSeed, playId)));
  useEffect(() => {
    rngRef.current = new XorShift32(mixSeed(rngSeed, playId));
  }, [rngSeed, playId]);

  // External control: replay at target break (last decision or provided rid)
  useEffect(() => {
    function onReplayAtBreak(e: Event) {
      const ce = e as CustomEvent<{ rid?: ReceiverID }>;
      const rid = ce.detail?.rid ?? (decision as ReceiverID | null);
      if (!rid) return;
      const path = O[rid] ?? [];
      const breaks = segmentBreakFracs(path);
      if (!breaks.length) return;
      const firstBreak = breaks[0];
      const mult = receiverSpeedMult(rid) * starSpeedMult(rid);
      const tBreak = Math.min(1, firstBreak / Math.max(0.0001, recSpeed * mult));
      // ensure post phase and seek the clock to the break point
      setPhase("post");
      seek(tBreak);
    }
    function onReplayAtCatch() {
      // Approximate: seek near end of rep
      setPhase("post");
      seek(0.95);
    }
    function onAgentSnapNow() {
      // Trigger a fresh snap
      setPhase("post");
      // ensure clock restarts; usePlayClock resets on phase change
    }
    function onApplyAudible(e: Event) {
      const ce = e as CustomEvent<{ assignments?: Partial<Record<ReceiverID, RouteKeyword>> }>; // RouteKeyword is in scope
      if (ce.detail?.assignments) {
        setManualAssignments(ce.detail.assignments);
      }
    }
    function onApplyMotion(e: Event) {
      const ce = e as CustomEvent<{ rid: ReceiverID; type?: 'jet'|'short'|'across'; dir?: 'left'|'right' }>; 
      const d = ce.detail ?? { rid: undefined, type: 'across' as const, dir: undefined };
      const rid = d.rid as ReceiverID | undefined;
      const type = (d.type ?? 'across') as 'jet'|'short'|'across';
      const dir = d.dir as ('left'|'right'|undefined);
      const base = getCachedFormation(formation, hashSide, customAlign);
      if (!rid) return;
      const cur = base[rid as keyof AlignMap] as Pt | undefined;
      if (!cur) return;
      if (motionBusy) return;
      if (motionLockRid && motionLockRid !== rid) return;
      const sign = dir ? (dir === 'left' ? -1 : 1) : (cur.x < QB.x ? 1 : -1);
      let dx = 0; const dy = 0;
      if (type === 'short') dx = sign * xAcross(6);
      else if (type === 'jet') dx = sign * xAcross(10);
      else if (type === 'across') dx = (QB.x - cur.x) * 2; // reflect across QB
      const end: Pt = { x: Math.max(xAcross(4), Math.min(xAcross(FIELD_WIDTH_YDS - 4), cur.x + dx)), y: cur.y + dy };
      setMotionBusy(true);
      // Compute realistic motion duration based on yards distance and receiver speed
      const yards = Math.hypot((end.x - cur.x)/XPX, (end.y - cur.y)/YPX);
      const baseYps = 6.0; // baseline yards/sec
      const eff = Math.max(4.5, baseYps * recSpeed * receiverSpeedMult(rid) * starSpeedMult(rid) * 0.9);
      const durMs = Math.max(800, Math.min(3500, Math.round((yards / eff) * 1000)));
      setLastMotion({ rid, type, dir: (dir ?? (cur.x < QB.x ? 'right' : 'left')) as 'left'|'right' });
      animateAlign(rid, cur, end, durMs, base, () => { setMotionBusy(false); setMotionLockRid(rid); });
    }
    function onStartSnapNow() {
      try { startSnap(); } catch {}
    }
    window.addEventListener('replay-at-break', onReplayAtBreak as EventListener);
    window.addEventListener('replay-at-catch', onReplayAtCatch as EventListener);
    window.addEventListener('agent-snap-now', onAgentSnapNow as EventListener);
    window.addEventListener('apply-audible', onApplyAudible as EventListener);
    window.addEventListener('apply-motion', onApplyMotion as EventListener);
    window.addEventListener('start-snap', onStartSnapNow as EventListener);
    // Hard reset event handler
    function onHardReset() {
      try { hardReset(); } catch {}
    }
    window.addEventListener('hard-reset', onHardReset as EventListener);
    // Ball speed change event handler
    function onBallSpeedChange(e: Event) {
      try {
        const ce = e as CustomEvent<{ speed?: number }>;
        const speed = ce.detail?.speed;
        if (typeof speed === 'number' && speed >= 0.5 && speed <= 3.0) {
          setBallSpeed(speed);
        }
      } catch {}
    }
    window.addEventListener('ball-speed-change', onBallSpeedChange as EventListener);
    // Throw targets event handler
    function onThrowToReceiver(e: Event) {
      try {
        const ce = e as CustomEvent<{ rid?: ReceiverID }>;
        const rid = ce.detail?.rid;
        if (!rid) return;
        // Reuse existing throw logic
        startThrow(rid as ReceiverID);
      } catch {
        // swallow to keep UI resilient
      }
    }
    window.addEventListener('throw-to-receiver', onThrowToReceiver as EventListener);
    function onSetFireZone(e: Event) {
      const ce = e as CustomEvent<{ on?: boolean; preset?: FZPreset }>;
      if (typeof ce.detail?.on === 'boolean') setFireZoneOn(ce.detail.on);
      if (ce.detail?.preset) setFzPreset(ce.detail.preset);
    }
    function onAdaptiveDrill(e: Event) {
      const ce = e as CustomEvent<{ coverage?: CoverageID; formation?: FormationName; motions?: Array<{ rid: ReceiverID; type?: 'jet'|'short'|'across'; dir?: 'left'|'right' }>; fireZone?: { on: boolean; preset?: FZPreset }; reason?: string }>;
      setDrillInfo(ce.detail ?? null);
    }
    window.addEventListener('set-firezone', onSetFireZone as EventListener);
    window.addEventListener('adaptive-drill', onAdaptiveDrill as EventListener);
    function onRepResult(e: Event) {
      const ce = e as CustomEvent<{ target: ReceiverID; grade?: string; throwArea?: string; windowScore?: number; catchWindowScore?: number; catchSepYds?: number }>;
      setDrillInfo(prev => prev ? { ...prev, lastRep: ce.detail } : prev);
      try {
        const open = typeof ce.detail.catchWindowScore === 'number' ? ce.detail.catchWindowScore : (typeof ce.detail.windowScore === 'number' ? ce.detail.windowScore : undefined);
        setRepChips((chips) => [{ grade: ce.detail.grade, open, area: ce.detail.throwArea }, ...chips].slice(0, 6));
      } catch {}
    }
    function onAutoRunStatus(e: Event) {
      const ce = e as CustomEvent<{ active?: boolean; left?: number; nextIn?: number }>;
      setAutoRunHUD(s => ({ active: ce.detail?.active ?? s.active, left: ce.detail?.left ?? s.left, nextIn: ce.detail?.nextIn ?? s.nextIn }));
    }
    window.addEventListener('rep-result', onRepResult as EventListener);
    window.addEventListener('auto-run-status', onAutoRunStatus as EventListener);
    function onSetFormation(e: Event) {
      try {
        const ce = e as CustomEvent<{ formation: FormationName }>;
        const f = ce.detail?.formation;
        if (!f) return;
        if (f !== 'TRIPS_RIGHT' && f !== 'DOUBLES' && f !== 'BUNCH_LEFT') return;
        setPhase('pre');
        setCustomAlign(null);
        setMotionLockRid(null);
        setFormation(f);
      } catch {}
    }
    window.addEventListener('set-formation', onSetFormation as EventListener);
    function onSetStar(e: Event) {
      try {
        const ce = e as CustomEvent<{ rid?: ReceiverID | '' | string | null | undefined }>;
        const raw = ce.detail?.rid ?? '';
        // Accept only known receiver ids or blank; ignore anything else to avoid crashes
        const valid: Set<string> = new Set(["", "X", "Z", "SLOT", "TE", "RB"]);
        const rid = (typeof raw === 'string' && valid.has(raw)) ? (raw as ReceiverID | '') : '';
        setStarRid(rid);
      } catch {
        // Swallow to keep UI resilient if a malformed event fires
      }
    }
    window.addEventListener('set-star', onSetStar as EventListener);
    return () => {
      window.removeEventListener('replay-at-break', onReplayAtBreak as EventListener);
      window.removeEventListener('replay-at-catch', onReplayAtCatch as EventListener);
      window.removeEventListener('agent-snap-now', onAgentSnapNow as EventListener);
      window.removeEventListener('apply-audible', onApplyAudible as EventListener);
      window.removeEventListener('apply-motion', onApplyMotion as EventListener);
      window.removeEventListener('start-snap', onStartSnapNow as EventListener);
      window.removeEventListener('hard-reset', onHardReset as EventListener);
      window.removeEventListener('ball-speed-change', onBallSpeedChange as EventListener);
      window.removeEventListener('throw-to-receiver', onThrowToReceiver as EventListener);
      window.removeEventListener('set-firezone', onSetFireZone as EventListener);
      window.removeEventListener('adaptive-drill', onAdaptiveDrill as EventListener);
      window.removeEventListener('rep-result', onRepResult as EventListener);
      window.removeEventListener('auto-run-status', onAutoRunStatus as EventListener);
      window.removeEventListener('set-formation', onSetFormation as EventListener);
      window.removeEventListener('set-star', onSetStar as EventListener);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [O, recSpeed, decision, seek, customAlign, formation, motionBusy]);
  useEffect(() => {
    setUserId(getOrCreateUserId());
  }, []);

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

  // --- CB technique and press state (moved up to avoid TDZ in wrPosSafe) ---
  type CBTechnique = "normal" | "press" | "pressStrong";
  const [cbTechnique] = useState<CBTechnique>("normal");
  type CBPressOutcome = "NONE" | "JAM_LOCK" | "WHIFF" | "JAM_AND_RELEASE";
  type CBPressState = { rid: ReceiverID | null; outcome: CBPressOutcome };
  type CBPressInfo = { outcome: CBPressOutcome; untilT: number };
  const [cbPress, setCbPress] = useState<{ CB_L: CBPressState; CB_R: CBPressState }>({
    CB_L: { rid: null, outcome: "NONE" },
    CB_R: { rid: null, outcome: "NONE" },
  });
  const PRESS_DELAY_FRAC = 0.3 / (PLAY_MS / 1000);
  const WHIFF_DELAY_FRAC = 1.0 / (PLAY_MS / 1000);

  // Generous menu of routes
  const ROUTE_MENU: RouteKeyword[] = [
    "GO","SPEED_OUT","CURL",
    "OUT_LOW","OUT_MID","OUT_HIGH",
    "CORNER_LOW","CORNER_MID","CORNER_HIGH",
    "COMEBACK_LOW","COMEBACK_MID","COMEBACK_HIGH",
    "DIG","POST",
    "SLANT","WHEEL","CHECK",
  ];

  // Compute top open receiver now (non-blockers, pre-decision)
  // Memoized with reduced computation frequency
  const [cachedTopOpen, setCachedTopOpen] = useState<{ rid: ReceiverID; score: number; area: string } | null>(null);
  const lastTopOpenUpdate = useRef<number>(0);
  
  useEffect(() => {
    if (phase !== 'post' || decision || ballFlying) {
      setCachedTopOpen(null);
      return;
    }
    
    // Throttle expensive computation to every 100ms
    const now = performance.now();
    if (now - lastTopOpenUpdate.current < 100) return;
    lastTopOpenUpdate.current = now;
    
    requestAnimationFrame(() => {
      const rids: ReceiverID[] = ["X","Z","SLOT","TE","RB"].filter(r=>!(r==='TE' && teBlock) && !(r==='RB' && rbBlock)) as ReceiverID[];
      let bestRid: ReceiverID | null = null;
      let bestScore = -1;
      for (const rid of rids) {
        const info = computeReceiverOpenness(rid, t);
        if (info.score > bestScore) { bestScore = info.score; bestRid = rid; }
      }
      if (!bestRid) {
        setCachedTopOpen(null);
        return;
      }
      const area = classifyThrowArea(wrPosSafe(bestRid, t));
      setCachedTopOpen({ rid: bestRid, score: bestScore, area: area.key });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, decision, ballFlying, teBlock, rbBlock, t, coverage, align, O]);
  
  // const topOpenNow = cachedTopOpen;

  const canThrowNow = useMemo(
  () => phase === "post" && !ballFlying && !decision && t < 0.999,
  [phase, ballFlying, decision, t]
);

  // Smoothly animate a single receiver's alignment pre-snap
  const motionRafRef = useRef<number | null>(null);
  function animateAlign(rid: ReceiverID, from: Pt, to: Pt, durMs = 900, baseAlign: AlignMap, onDone?: () => void) {
    // Cancel any prior RAF
    if (motionRafRef.current !== null) {
      try { cancelAnimationFrame(motionRafRef.current); } catch {}
      motionRafRef.current = null;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / durMs);
      const ease = u < 0.5 ? 2 * u * u : -1 + (4 - 2 * u) * u;
      const x = from.x + (to.x - from.x) * ease;
      const y = from.y + (to.y - from.y) * ease;
      const nxt: AlignMap = { ...(baseAlign as AlignMap), [rid]: { x, y } } as AlignMap;
      setCustomAlign(nxt);
      if (u < 1) motionRafRef.current = requestAnimationFrame(step);
      else { motionRafRef.current = null; onDone?.(); }
    };
    motionRafRef.current = requestAnimationFrame(step);
  }

  // Receivers available to audible (exclude blockers)
  const selectableReceivers = useMemo<ReceiverID[]>(
    () => (["X","Z","SLOT","TE","RB"] as ReceiverID[])
      .filter(id => !(id === "TE" && teBlock) && !(id === "RB" && rbBlock)),
    [teBlock, rbBlock]
  );

  const hasAudibles = useMemo(() => Object.keys(manualAssignments).length > 0, [manualAssignments]);

  // Ultra-fast clock management - no delays
  useEffect(() => {
    if (phase === "post") {
      // Start clock immediately for instant response
      resetClock();
      startClock();
    } else {
      stopClock();
    }
  }, [phase, resetClock, startClock, stopClock]);


  // Press outcomes per CB at the snap (types defined above)

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
    CB_L: false, CB_R: false, NICKEL: false, FS: false, SS: false, SAM: false, MIKE: false, WILL: false, DE_L: false, DE_R: false, DT_L: false, DT_R: false
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

  // Live pre-snap updates while motion animates: update defender starts only (avoid route churn loops)
  useEffect(() => {
    if (!customAlign) return;
    if (!motionBusy) return; // only during motion

    // Update defender pre-snap starts so the defense adjusts as motion occurs
    const starts = computeDefenderStarts(customAlign);
    setDstart(starts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customAlign, motionBusy]);

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

    // Trips detection via numbering
    const hasL3 = !!left3?.();
    const hasR3 = !!right3?.();
    const tripsSide: 'left'|'right'|null = hasL3 ? 'left' : hasR3 ? 'right' : null;
    // Simplified trips check heuristic
    let tripsCheck: 'SOLO'|'POACH'|'MABLE' | undefined;
    if (tripsSide) {
      // If Quarters, prefer POACH; else if C1, MABLE; else SOLO
      tripsCheck = coverage === 'QUARTERS' ? 'POACH' : coverage === 'C1' ? 'MABLE' : 'SOLO';
    }

    // C3 kick/push hint when recent jet moved toward strong side and auto rotation chose CLOUD_STRONG
    const sr2 = strongIsRight();
    const towardStrong = lastMotion ? ((sr2 && lastMotion.dir === 'right') || (!sr2 && lastMotion.dir === 'left')) : false;
    const c3KickPush = coverage === 'C3' && !!lastMotion && lastMotion.type === 'jet' && towardStrong && c3Rotation === 'CLOUD_STRONG';

    // Fire-zone hints
    let fireZoneDropper: DefenderID | null = null;
    let fireZoneBlitzer: DefenderID | null = null;
    if (coverage === 'C3' && fireZoneOn) {
      if (fzPreset === 'NICKEL') { fireZoneDropper = sr2 ? 'WILL' : 'SAM'; fireZoneBlitzer = 'NICKEL'; }
      else if (fzPreset === 'SAM') { fireZoneDropper = 'NICKEL'; fireZoneBlitzer = 'SAM'; }
      else if (fzPreset === 'WILL') { fireZoneDropper = 'NICKEL'; fireZoneBlitzer = 'WILL'; }
    }

    // Hot signal: in man if blitzers exceed blockers; in fire-zone if blitzer present
    const blockers = (teBlock ? 1 : 0) + (rbBlock ? 1 : 0);
    const hotNow = ((coverage === 'C0' || coverage === 'C1') && (manExtraRoles.blitzers.length > blockers))
      || ((coverage === 'C3') && fireZoneOn && !!fireZoneBlitzer);

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
      motion: lastMotion ? { rid: lastMotion.rid, type: lastMotion.type, dir: lastMotion.dir } : undefined,
      coverageInsights: {
        c3Rotation: coverage === 'C3' ? c3Rotation : undefined,
        palmsTrapNow,
        quartersCarry2Now,
        mofState,
        tripsCheck,
        tripsSide: tripsSide ?? null,
        c3KickPush,
        hotNow,
        fireZone: coverage === 'C3' ? fireZoneOn : false,
        fireZoneDropper: fireZoneDropper ?? null,
        fireZoneBlitzer: fireZoneBlitzer ?? null,
        banjoActive: (coverage === 'C1' || coverage === 'C9') && formation === 'BUNCH_LEFT',
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
  // Seed man lag profile (per-play) when man coverage starts
  const prof: Partial<Record<DefenderID, { lagFrac: number; amp: number }>> = {};
  (['CB_L','CB_R','NICKEL','SS','MIKE'] as DefenderID[]).forEach((id) => {
    const r1 = rngRef.current.nextFloat();
    const r2 = rngRef.current.nextFloat();
    prof[id] = { lagFrac: 0.10 + 0.12 * r1, amp: 0.6 + 0.6 * r2 };
  });
  setManLagProfile(prof);
}, [phase, coverage]);

  // SPLIT APPROACH: Immediate visual updates + background expensive computations
  useEffect(() => {
    // Only rebuild at pre-snap or when structure changes, and avoid thrashing during motion
    if (phase !== 'pre') return;
    if (motionBusy) return;
    
    // IMMEDIATE: Basic alignment and numbering for instant visual feedback
    const A = getCachedFormation(formation, hashSide, customAlign);
    setAlign(A);
    setNumbering(getCachedNumbering(A));
    
    // BACKGROUND: Defer expensive route and defender computations
    setTimeout(() => {
      // Compute defender starts first so we can adjust routes by leverage
      const starts = computeDefenderStarts(A as AlignMap);

      // Use preserved route orientation so routes don't flip after motion
      const routes = buildConceptRoutes(conceptId, A as AlignMap, coverage, routeOrient);

      if (teBlock) routes.TE = passProPathTE(A as AlignMap);
      if (rbBlock) routes.RB = passProPathRB(A as AlignMap);

      // Apply manual audible overrides (skip if that player is blocking)
      (Object.entries(manualAssignments) as [ReceiverID, RouteKeyword][])
        .forEach(([rid, kw]) => {
          if ((rid === "TE" && teBlock) || (rid === "RB" && rbBlock)) return;
          routes[rid] = routeFromKeyword(kw, (A as AlignMap)[rid], coverage, routeOrient[rid]);
        });

      // Leverage-driven tweaks (man + match) and collect meta
      const levMeta: Record<ReceiverID, { side: 'inside'|'outside'|'even'; via: string }> = { X: {side:'even', via:''}, Z: {side:'even', via:''}, SLOT: {side:'even', via:''}, TE: {side:'even', via:''}, RB: {side:'even', via:''} };
      const adjMeta: Record<ReceiverID, { dxYds: number; dDepthYds: number }> = { X: {dxYds:0,dDepthYds:0}, Z: {dxYds:0,dDepthYds:0}, SLOT: {dxYds:0,dDepthYds:0}, TE: {dxYds:0,dDepthYds:0}, RB: {dxYds:0,dDepthYds:0} };
      (Object.keys(routes) as ReceiverID[]).forEach((rid) => {
        if ((rid === "TE" && teBlock) || (rid === "RB" && rbBlock)) return;
        routes[rid] = leverageAdjustPath(rid, routes[rid], coverage, A, starts, levMeta, adjMeta);
      });

      setO(routes);
      setDstart(starts);
      setLevInfo(levMeta);
      setLevAdjust(adjMeta);
      
      // Auto-snap after motion is now handled directly in motion completion callback
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, formation, conceptId, coverage, teBlock, rbBlock, manualAssignments, setT, customAlign, motionBusy, hashSide]);

  // Reset to pre-snap when structural knobs change (but not during motion)
  useEffect(() => {
    if (motionBusy) return;
    setPhase('pre');
    setT(0);
    setDecision(null);
    setGrade(null);
    setExplain(null);
    setBallFlying(false);
    setBallT(0);
    setCatchAt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formation, conceptId, coverage, teBlock, rbBlock]);

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

  // Choose C3 rotation each snap (bias based on recent motion and strength)
  useEffect(() => {
    if (coverage !== 'C3') return;
    if (phase !== 'post') return;
    if (c3RotationMode !== 'AUTO') {
      setC3Rotation(c3RotationMode);
      return;
    }
    const sr = strongIsRight();
    const recentJet = lastMotion && lastMotion.type === 'jet' ? lastMotion : null;
    if (recentJet) {
      // If fast motion moved toward strong side, bias to CLOUD_STRONG to handle flat immediately
      const towardStrong = (sr && recentJet.dir === 'right') || (!sr && recentJet.dir === 'left');
      if (towardStrong) { setC3Rotation('CLOUD_STRONG'); return; }
      // Otherwise favor SKY/BUZZ split with slight BUZZ tilt
      const r = rngRef.current.nextFloat();
      setC3Rotation(r < 0.35 ? 'SKY' : 'BUZZ');
      return;
    }
    // Default AUTO random
    const r = rngRef.current.nextFloat();
    const rot: C3Rotation = r < 0.5 ? 'SKY' : r < 0.85 ? 'BUZZ' : 'CLOUD_STRONG';
    setC3Rotation(rot);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, coverage, c3RotationMode, lastMotion, align, numbering]);

  // (Dlive/lastTRef/overlayTick are defined earlier to avoid TDZ)

  function wrPosSafe(id: ReceiverID, tt: number): Pt {
    // During pre-snap (including motion), show the live alignment position
    if (phase !== 'post') {
      const Acur = (customAlign ?? align) as AlignMap;
      return Acur[id] ?? align[id] ?? QB;
    }
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

    let s = Math.min(1, tAdj * recSpeed * receiverSpeedMult(id) * starSpeedMult(id));
    // Momentum boost if this receiver motioned into the snap
    if (motionBoost.rid === id && tt < motionBoost.untilT) {
      s = Math.min(1, s * motionBoost.mult);
    }
    if (!path || path.length === 0) return align[id] ?? QB;
    let p = posOnPathLenScaled(path, s);
    // Star receiver: intelligent zone float into space when not open and route is carrying into coverage
    if (starRid && id === starRid && (ZONE_COVERAGES.has(coverage) || MATCH_COVERAGES.has(coverage))) {
      try {
        // Find nearest defender using defenderTarget (non-recursive wrPos)
        let nearestId: DefenderID | null = null;
        let best = Number.POSITIVE_INFINITY;
        for (const did of getActiveDefenders(formation)) {
          const dp = defenderTarget(coverage, did, tt);
          const yds = distYds(p, dp);
          if (yds < best) { best = yds; nearestId = did; }
        }
        // If tight (e.g., <3 yds), drift laterally away from nearest defender and slightly toward MOF
        if (nearestId && best < 3.0) {
          const dp = defenderTarget(coverage, nearestId, tt);
          const dirX = Math.sign(p.x - dp.x) || (p.x < qbX() ? -1 : 1);
          const driftYds = Math.min(1.6, Math.max(0.4, (3.0 - best) * 0.6));
          const centerPull = (qbX() - p.x) / XPX; // yards toward MOF
          const centerW = 0.25; // small weight toward MOF
          const dx = xAcross(driftYds * dirX + centerPull * centerW);
          const newX = Math.max(xAcross(4), Math.min(xAcross(FIELD_WIDTH_YDS - 4), p.x + dx));
          p = { x: newX, y: p.y };
        }
      } catch {
        // If anything goes sideways, just return the normal route position
      }
    }
    return p;
  }

  // Distance in yards accounting for non-uniform px scales
  function distYds(a: Pt, b: Pt): number {
    const dx = (a.x - b.x) / XPX;
    const dy = (a.y - b.y) / YPX;
    return Math.hypot(dx, dy);
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

  // Defender target (pure) and smoothing
  function defenderTarget(cover: CoverageID, id: DefenderID, tt: number): Pt {
    const start = Dstart[id] ?? D_ALIGN[id];
    // Pre-snap: target the pre-snap starts (strength-aware) to smooth adjustments during motion
    if (phase !== 'post') {
      const Acur = (customAlign ?? FORMATIONS[formation]) as AlignMap;
      const starts = computeDefenderStarts(Acur);
      return starts[id] ?? D_ALIGN[id];
    }
    const sr = strongIsRight();
    const anchor = zoneAnchor(cover, id);
    const pressInfo = id === 'CB_L' ? cbPress.CB_L : id === 'CB_R' ? cbPress.CB_R : undefined;
    if ((cover === 'C0' || cover === 'C1' || MATCH_COVERAGES.has(cover)) && pressInfo && pressInfo.outcome !== 'NONE' && pressInfo.rid) {
      const wr0 = align[pressInfo.rid] ?? QB;
      const pressPoint: Pt = { x: (start.x + wr0.x) / 2, y: yUp(16.5) };
      const pressUntil = pressInfo.outcome === 'JAM_LOCK' ? 1 : pressInfo.outcome === 'JAM_AND_RELEASE' ? (0.3 / (PLAY_MS/1000)) : (1.0 / (PLAY_MS/1000));
      if (tt < pressUntil) return pressPoint;
    }
    if (MAN_COVERAGES.has(cover)) {
      const map: Partial<Record<DefenderID, ReceiverID>> = { CB_L: 'X', CB_R: 'Z', NICKEL: 'SLOT', SS: 'TE', MIKE: 'RB' };
      const threeS = sr ? (right3() ?? null) : (left3() ?? null);
      const oneS = sr ? (right1() ?? 'Z') : (left1() ?? 'X');
      const twoS = sr ? (right2() ?? 'SLOT') : (left2() ?? 'SLOT');
      if (threeS) { if (sr) { map.CB_R = oneS; map.NICKEL = twoS; } else { map.CB_L = oneS; map.NICKEL = twoS; } map.MIKE = threeS; }
      const key = map[id];
      if (key) {
        // Apply cut indecision lag for man defenders; consider direction vs leverage
        const prof = manLagProfile[id];
        if (prof) {
          const sev = cutSeverityFor(key, tt); // 0..1
          const lev = levInfo[key]?.side ?? 'even';
          const dir = cutDirectionFor(key, tt);
          let dirW = 1.0;
          if (lev === 'inside') dirW = dir === 'inside' ? 0.85 : dir === 'outside' ? 1.20 : 1.0;
          else if (lev === 'outside') dirW = dir === 'outside' ? 0.85 : dir === 'inside' ? 1.20 : 1.0;
          const levW = lev === 'even' ? 1.0 : 1.0; // lev already baked into dirW
          const starW = (starRid && key === starRid) ? 1.35 : 1.0; // star cuts create more DB hesitation
          const lag = prof.lagFrac * prof.amp * sev * levW * dirW * starW;
          const lagTT = Math.max(0, tt - lag);
          return wrPos(key, lagTT);
        }
        return wrPos(key, tt);
      }
      if (id === 'FS') { const pL = wrPos(left2() ?? 'SLOT', tt), pR = wrPos(right2() ?? 'SLOT', tt); return { x: (pL.x + pR.x)/2, y: Math.min(pL.y, pR.y, yUp(36)) }; }
      return anchor;
    }
    if (ZONE_COVERAGES.has(cover)) {
      return anchor;
    }
    if (MATCH_COVERAGES.has(cover)) return anchor;
    return anchor;
  }

  // Zone assignment calculation (runs at 25ms for ultra-smooth performance)
  useEffect(() => {
    const now = performance.now();
    if (now - lastZoneUpdateRef.current < 1) return; // Update zone assignments every 100ms
    lastZoneUpdateRef.current = now;
    
    if (!ZONE_COVERAGES.has(coverage)) return;
    
    // Calculate NFL-realistic zone assignments and responsibilities
    const calculateZoneAssignments = (): Record<DefenderID, { primary: ReceiverID | null, zone: string, priority: number }> => {
      const assignments = {} as Record<DefenderID, { primary: ReceiverID | null, zone: string, priority: number }>;
      const sr = strongIsRight();
      
      // Get receiver positions for threat assessment
      const receivers = (['X', 'Z', 'SLOT', 'TE', 'RB'] as ReceiverID[]).map(rid => ({
        id: rid,
        pos: wrPos(rid, t),
        depth: yDepthYds(wrPos(rid, t))
      }));
      
      // Zone responsibility mapping based on coverage
      if (coverage === 'C3') {
        // Cover 3: Deep thirds, underneath zones
        assignments['FS'] = { primary: null, zone: 'deep_middle', priority: 1 };
        assignments['CB_L'] = { primary: null, zone: 'deep_left', priority: 1 };
        assignments['CB_R'] = { primary: null, zone: 'deep_right', priority: 1 };
        assignments['SS'] = { primary: null, zone: 'strong_hook', priority: 2 };
        assignments['MIKE'] = { primary: null, zone: 'middle_hook', priority: 2 };
        assignments['NICKEL'] = { primary: null, zone: 'slot_underneath', priority: 3 };
        assignments['SAM'] = { primary: null, zone: 'strong_flat', priority: 3 };
        assignments['WILL'] = { primary: null, zone: 'weak_flat', priority: 3 };
        
        // Assign primary threats in each zone
        receivers.forEach(rcv => {
          if (rcv.depth > 12) { // Deep threats
            if (rcv.pos.x < qbX() - 60) assignments['CB_L'].primary = rcv.id;
            else if (rcv.pos.x > qbX() + 60) assignments['CB_R'].primary = rcv.id;
            else assignments['FS'].primary = rcv.id;
          } else if (rcv.depth > 6) { // Intermediate
            if (Math.abs(rcv.pos.x - qbX()) < 40) assignments['MIKE'].primary = rcv.id;
            else if (sr && rcv.pos.x > qbX()) assignments['SS'].primary = rcv.id;
          }
        });
      } else if (coverage === 'C2') {
        // Cover 2: Deep halves, underneath zones
        assignments['FS'] = { primary: null, zone: 'deep_left_half', priority: 1 };
        assignments['SS'] = { primary: null, zone: 'deep_right_half', priority: 1 };
        assignments['CB_L'] = { primary: null, zone: 'left_underneath', priority: 2 };
        assignments['CB_R'] = { primary: null, zone: 'right_underneath', priority: 2 };
        assignments['MIKE'] = { primary: null, zone: 'middle_hook', priority: 2 };
        assignments['NICKEL'] = { primary: null, zone: 'slot_coverage', priority: 3 };
      }
      
      return assignments;
    };
    
    const newAssignments = calculateZoneAssignments();
    setDzoneAssignments(newAssignments);
    
    // Calculate stable target positions based on zone assignments
    const stableTargets = {} as Record<DefenderID, Pt>;
    for (const id of getActiveDefenders(formation)) {
      const assignment = newAssignments[id];
      if (!assignment) continue;
      
      let zoneCenter: Pt;
      const qbPos = { x: qbX(), y: QB.y };
      
      // NFL zone positioning based on assignment
      switch (assignment.zone) {
        case 'deep_middle':
          zoneCenter = { x: qbPos.x, y: yUp(25) };
          break;
        case 'deep_left':
          zoneCenter = { x: qbPos.x - 80, y: yUp(25) };
          break;
        case 'deep_right':
          zoneCenter = { x: qbPos.x + 80, y: yUp(25) };
          break;
        case 'deep_left_half':
          zoneCenter = { x: qbPos.x - 50, y: yUp(20) };
          break;
        case 'deep_right_half':
          zoneCenter = { x: qbPos.x + 50, y: yUp(20) };
          break;
        case 'strong_hook':
        case 'middle_hook':
          zoneCenter = { x: qbPos.x + (assignment.zone === 'strong_hook' ? 30 : 0), y: yUp(12) };
          break;
        case 'left_underneath':
          zoneCenter = { x: qbPos.x - 60, y: yUp(8) };
          break;
        case 'right_underneath':
          zoneCenter = { x: qbPos.x + 60, y: yUp(8) };
          break;
        case 'slot_underneath':
        case 'slot_coverage':
          zoneCenter = { x: qbPos.x + 25, y: yUp(6) };
          break;
        case 'strong_flat':
          zoneCenter = { x: qbPos.x + 70, y: yUp(3) };
          break;
        case 'weak_flat':
          zoneCenter = { x: qbPos.x - 70, y: yUp(3) };
          break;
        default:
          zoneCenter = Dstart[id] ?? D_ALIGN[id];
      }
      
      // Adjust position based on primary threat
      if (assignment.primary) {
        const threat = wrPos(assignment.primary, t);
        // Move toward threat but stay within zone boundaries
        const threatWeight = 0.2;
        zoneCenter = {
          x: zoneCenter.x + (threat.x - zoneCenter.x) * threatWeight,
          y: zoneCenter.y + (threat.y - zoneCenter.y) * threatWeight
        };
      }
      
      stableTargets[id] = zoneCenter;
    }
    
    setDstableTargets(stableTargets);
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, phase, coverage, align, O]);

  // High-performance movement system with zone stability
  useEffect(() => {
    const now = performance.now();
    const deltaTime = Math.min(50, now - lastUpdateTimeRef.current) / 1000;
    lastUpdateTimeRef.current = now;
    
    if (deltaTime <= 0) return;
    
    const roleFactor = (id: DefenderID): number => {
      const assignment = DzoneAssignments[id];
      if (!assignment) return 1.0;
      
      // Different agility based on zone responsibility
      switch (assignment.priority) {
        case 1: return 0.8; // Deep coverage - more deliberate
        case 2: return 1.0; // Intermediate - baseline
        case 3: return 1.2; // Underneath - quick reactions
        default: return 1.0;
      }
    };

    const nextPositions: Record<DefenderID, Pt> = { ...Dlive };
    const nextVelocities: Record<DefenderID, Pt> = { ...Dvelocity };
    const nextTargets: Record<DefenderID, Pt> = { ...DlastTargets };
    
    for (const id of getActiveDefenders(formation)) {
      const current = Dlive[id] ?? Dstart[id] ?? D_ALIGN[id];
      const currentVel = Dvelocity[id] ?? { x: 0, y: 0 };
      
      // Use stable zone-based target or fallback to original logic
      let target: Pt;
      if (ZONE_COVERAGES.has(coverage) && DstableTargets[id]) {
        target = DstableTargets[id];
      } else {
        target = defenderTarget(coverage, id, t);
      }
      
      const lastTarget = DlastTargets[id] ?? target;
      
      // Calculate movement parameters
      let maxSpeed = Math.max(0.5, Math.min(1.6, defSpeed * defenderSpeedMult(id)));
      const isDB = ['CB_L', 'CB_R', 'NICKEL', 'FS', 'SS'].includes(id);
      const isLB = ['SAM', 'MIKE', 'WILL'].includes(id);
      
      if (isDB) maxSpeed = Math.min(maxSpeed, recSpeed * 0.90);
      if (isLB) maxSpeed = Math.min(maxSpeed, recSpeed * 0.81);
      
      maxSpeed *= roleFactor(id);
      
      // Zone-aware movement with stability
      const pixelsPerSecond = maxSpeed * ((XPX + YPX) / 2);
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      const distanceToTarget = Math.sqrt(dx * dx + dy * dy);
      
      // More conservative target change detection for zones
      const isZone = ZONE_COVERAGES.has(coverage);
      const changeThreshold = isZone ? 25 : 15; // Larger threshold for zones
      const targetDx = target.x - lastTarget.x;
      const targetDy = target.y - lastTarget.y;
      const targetChanged = Math.sqrt(targetDx * targetDx + targetDy * targetDy) > changeThreshold;
      
      let desiredVelX = 0, desiredVelY = 0;
      
      if (distanceToTarget > 3) {
        const dirX = dx / distanceToTarget;
        const dirY = dy / distanceToTarget;
        const desiredSpeed = Math.min(pixelsPerSecond, distanceToTarget * (isZone ? 2 : 4));
        desiredVelX = dirX * desiredSpeed;
        desiredVelY = dirY * desiredSpeed;
      }
      
      // Smoother acceleration for zones
      const accel = isZone ? (targetChanged ? 600 : 400) : (targetChanged ? 1200 : 800);
      const velDamping = isZone ? 0.90 : 0.85; // Higher damping for zones
      
      let newVelX = currentVel.x * velDamping + (desiredVelX - currentVel.x) * Math.min(1, accel * deltaTime);
      let newVelY = currentVel.y * velDamping + (desiredVelY - currentVel.y) * Math.min(1, accel * deltaTime);
      
      const velMag = Math.sqrt(newVelX * newVelX + newVelY * newVelY);
      if (velMag > pixelsPerSecond) {
        newVelX = (newVelX / velMag) * pixelsPerSecond;
        newVelY = (newVelY / velMag) * pixelsPerSecond;
      }
      
      const newX = current.x + newVelX * deltaTime;
      const newY = current.y + newVelY * deltaTime;
      
      nextPositions[id] = { x: newX, y: newY };
      nextVelocities[id] = { x: newVelX, y: newVelY };
      nextTargets[id] = target;
    }
    
    setDlive(nextPositions);
    setDvelocity(nextVelocities);
    setDlastTargets(nextTargets);
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, phase, coverage, align, O, defSpeed, DstableTargets, DzoneAssignments]);

  useEffect(() => { if (phase !== 'post') setDlive(Dstart); }, [Dstart, phase]);
  useEffect(() => { lastTRef.current = t; }, [t]);

  // Optimized overlay recomputation with better throttling
  useEffect(() => {
    if (!showDefense) return;
    let raf = 0;
    let last = performance.now();
    const budgetMs = motionBusy ? 120 : 200; // Increased intervals for better performance
    const loop = (now: number) => {
      if (now - last >= budgetMs) { 
        // Use requestIdleCallback when available for smoother performance
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(() => setOverlayTick((v) => v + 1), { timeout: 50 });
        } else {
          setOverlayTick((v) => v + 1);
        }
        last = now; 
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [showDefense, motionBusy]);

  // Compute openness for a single receiver at time tt
  function computeReceiverOpenness(rid: ReceiverID, tt: number): OpenInfo {
    const rp = wrPosSafe(rid, tt);
    let bestYds = Infinity;
    let nearest: DefenderID | null = null;
    for (const did of getActiveDefenders(formation)) {
      const dp = Math.abs(tt - t) < 1e-4 ? (Dlive[did] ?? Dstart[did] ?? D_ALIGN[did]) : defenderTarget(coverage, did, tt);
      const yds = distYds(rp, dp);
      if (yds < bestYds) { bestYds = yds; nearest = did; }
    }
    // Map separation yards to 0..1 score: 1.0 yds = tight (0), 8.0 yds = open (1)
    const MIN_SEP = 1.0, MAX_SEP = 8.0;
    const score = Math.max(0, Math.min(1, (bestYds - MIN_SEP) / (MAX_SEP - MIN_SEP)));
    return { score, sepYds: bestYds, nearest };
  }

  // Update openness every frame while play is live
  // Throttled openness computation to reduce expensive calculations
  const lastOpennessUpdateRef = useRef<number>(0);
  useEffect(() => {
    if (phase !== "post") {
      setOpenness((prev) => ({ ...prev, X: { score: 0, sepYds: 0, nearest: null }, Z: { score: 0, sepYds: 0, nearest: null }, SLOT: { score: 0, sepYds: 0, nearest: null }, TE: { score: 0, sepYds: 0, nearest: null }, RB: { score: 0, sepYds: 0, nearest: null } }));
      return;
    }
    
    // Throttle openness calculations to every 50ms for better performance
    const now = performance.now();
    if (now - lastOpennessUpdateRef.current < 50) return;
    lastOpennessUpdateRef.current = now;
    
    // Batch all openness calculations
    requestAnimationFrame(() => {
      const infoX = computeReceiverOpenness("X", t);
      const infoZ = computeReceiverOpenness("Z", t);
      const infoS = computeReceiverOpenness("SLOT", t);
      const infoT = computeReceiverOpenness("TE", t);
      const infoR = computeReceiverOpenness("RB", t);
      setOpenness({ X: infoX, Z: infoZ, SLOT: infoS, TE: infoT, RB: infoR });
    });
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

  // Defensive Line - 4 players aligned based on formation strength
  const DE_L: Pt = { x: xAcross(FIELD_WIDTH_YDS / 2 - 9), y: yUp(9.5) };
  const DE_R: Pt = { x: xAcross(FIELD_WIDTH_YDS / 2 + 9), y: yUp(9.5) };
  const DT_L: Pt = { x: xAcross(FIELD_WIDTH_YDS / 2 - 3), y: yUp(9.5) };
  const DT_R: Pt = { x: xAcross(FIELD_WIDTH_YDS / 2 + 3), y: yUp(9.5) };

  return { CB_L, CB_R, NICKEL, FS, SS, SAM, MIKE, WILL, DE_L, DE_R, DT_L, DT_R };
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
        // Sky/Buzz/Cloud (strong) rotation variants (static anchors only)
        const rot = c3Rotation; // SKY | BUZZ | CLOUD_STRONG
        const sr = strongIsRight();
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
        // Defensive Line: Rush the passer at snap position
        if (id === "DE_L" || id === "DE_R" || id === "DT_L" || id === "DT_R") return D_ALIGN[id];
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
        // Defensive Line: Rush the passer at snap position
        if (id === "DE_L" || id === "DE_R" || id === "DT_L" || id === "DT_R") return D_ALIGN[id];
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
        // Defensive Line: Rush the passer at snap position
        if (id === "DE_L" || id === "DE_R" || id === "DT_L" || id === "DT_R") return D_ALIGN[id];
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
        // Defensive Line: Rush the passer at snap position
        if (id === "DE_L" || id === "DE_R" || id === "DT_L" || id === "DT_R") return D_ALIGN[id];
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
        // Defensive Line: Rush the passer at snap position
        if (id === "DE_L" || id === "DE_R" || id === "DT_L" || id === "DT_R") return D_ALIGN[id];
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
        // Defensive Line: Rush the passer at snap position
        if (id === "DE_L" || id === "DE_R" || id === "DT_L" || id === "DT_R") return D_ALIGN[id];
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
        // Defensive Line: Rush the passer at snap position
        if (id === "DE_L" || id === "DE_R" || id === "DT_L" || id === "DT_R") return D_ALIGN[id];
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
        // Defensive Line: Rush the passer at snap position
        if (id === "DE_L" || id === "DE_R" || id === "DT_L" || id === "DT_R") return D_ALIGN[id];
        return D_ALIGN[id];
      }
    }
  }

  /* --- helper: WR current position at time tt --- */
  const wrPos = (id: ReceiverID, tt: number): Pt =>
    posOnPathLenScaled(O[id], Math.min(1, tt * recSpeed * receiverSpeedMult(id) * starSpeedMult(id)));

  // TE/RB pass-pro spots
  function passProPathTE(A: AlignMap): Pt[] {
    const spot: Pt = { x: A.TE.x, y: yUp(16.5) };
    return [A.TE, spot];
  }
  function passProPathRB(A: AlignMap): Pt[] {
    const offset = A.RB.x >= qbX() ? xAcross(3) : -xAcross(3);
    const spot: Pt = { x: qbX() + offset, y: yUp(15.5) };
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
  const left3  = () => findByNumber("left", 3);
  const right3 = () => findByNumber("right", 3);

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

// Direction of current cut relative to MOF (inside/outside) at time tt
function cutDirectionFor(rid: ReceiverID, tt: number): 'inside' | 'outside' | 'straight' {
  const path = O[rid];
  if (!path || path.length < 2) return 'straight';
  const tNow = Math.max(0, Math.min(1, tt * recSpeed));
  const dt = 0.012; // small window
  const t0 = Math.max(0, tNow - dt);
  const t1 = Math.min(1, tNow + dt);
  const p0 = posOnPathLenScaled(path, t0);
  const p1 = posOnPathLenScaled(path, t1);
  const vx = p1.x - p0.x; // horizontal component
  if (Math.abs(vx) < 0.5) return 'straight';
  // inside is toward QB.x; outside is toward sideline
  const insideSign = QB.x > p1.x ? 1 : -1;
  return Math.sign(vx) === insideSign ? 'inside' : 'outside';
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
    // who is in man on whom (base)
    const manMap: Partial<Record<DefenderID, ReceiverID>> = {
        CB_L:   "X",
        CB_R:   "Z",
        NICKEL: "SLOT",
        SS:     "TE",
        MIKE:   "RB",
        // FS free in C1; in C0 we treat FS as free unless you choose to man him elsewhere.
    };

    // Bunch banjo (simple): early in route, swap Nickel/Corner responsibility on bunch side
    const bunchLeft = formation === 'BUNCH_LEFT';
    if (tt < 0.20 && bunchLeft) {
      // On left side, let Nickel match outside-most and CB_L take next
      const outsideLeft: ReceiverID = align.X.x < align.Z.x ? 'X' : 'Z';
      const nextLeft: ReceiverID = outsideLeft === 'X' ? 'SLOT' : 'TE';
      manMap.NICKEL = outsideLeft;
      manMap.CB_L = nextLeft;
    }

    // MABLE vs trips in C1: strong CB on #1, Nickel on #2, MIKE on #3, weak side unchanged
    if (cover === 'C1') {
      const sr = strongIsRight();
      const oneS = sr ? (right1() ?? 'Z') : (left1() ?? 'X');
      const twoS = sr ? (right2() ?? 'SLOT') : (left2() ?? 'SLOT');
      const threeS = sr ? (right3() ?? null) : (left3() ?? null);
      if (threeS) {
        if (sr) {
          manMap.CB_R = oneS;
          manMap.NICKEL = twoS;
        } else {
          manMap.CB_L = oneS;
          manMap.NICKEL = twoS;
        }
        manMap.MIKE = threeS;
      }
    }

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

        // Green-dog feel: if MIKE has RB but RB blocks pre-snap (toggle), convert to shallow spy
        if (id === 'MIKE' && key === 'RB' && rbBlock) {
          const spyPoint: Pt = { x: QB.x, y: yUp(20) };
          return {
            x: start.x + (spyPoint.x - start.x) * Math.min(1, 0.22 + effT * (0.75 * spd)),
            y: start.y + (spyPoint.y - start.y) * Math.min(1, 0.22 + effT * (0.75 * spd)),
          };
        }
        return {
        x: start.x + (target.x - start.x) * Math.min(1, base + effT * (0.95 * spd * lagScale)),
        y: start.y + (target.y - start.y) * Math.min(1, base + effT * (0.95 * spd * lagScale)),
        };
    }

    // --- Free player (FS) in C1: MOF with backside help in MABLE ---
    if (cover === "C1" && id === "FS") {
        // const sr = strongIsRight();
        const hasL3 = !!left3();
        const hasR3 = !!right3();
        if (hasL3 || hasR3) {
          // Trips present: lean to weak #1 while staying high
          const weakOneId: ReceiverID | null = hasR3 ? (left1() ?? 'X') : hasL3 ? (right1() ?? 'Z') : null;
          if (weakOneId) {
            const pWeak1 = wrPos(weakOneId, tt);
            const help: Pt = {
              x: (pWeak1.x + QB.x) / 2, // slight MOF bias
              y: Math.min(pWeak1.y, yUp(36))
            };
            return {
              x: start.x + (help.x - start.x) * Math.min(1, 0.24 + effT * (0.62 * spd)),
              y: start.y + (help.y - start.y) * Math.min(1, 0.24 + effT * (0.62 * spd)),
            };
          }
        }
        // No trips: midpoint the #2s and stay over the top
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
      // Fire Zone (3-under/3-deep) behavior for C3
      if (cover === 'C3' && fireZoneOn) {
        const sr = strongIsRight();
        let dropper: DefenderID | null = null;
        let blitzer: DefenderID | null = null;
        if (fzPreset === 'NICKEL') { dropper = sr ? 'WILL' : 'SAM'; blitzer = 'NICKEL'; }
        else if (fzPreset === 'SAM') { dropper = 'NICKEL'; blitzer = 'SAM'; }
        else if (fzPreset === 'WILL') { dropper = 'NICKEL'; blitzer = 'WILL'; }
        if (id === 'CB_L') return ZONES.DEEP_LEFT;
        if (id === 'CB_R') return ZONES.DEEP_RIGHT;
        if (id === 'FS')   return ZONES.DEEP_MIDDLE;
        if (id === 'MIKE') return ZONES.HOOK_MID;
        if (id === 'NICKEL') {
          // blitz path toward QB
          if (blitzer === 'NICKEL') {
            const gapX = QB.x + (sr ? xAcross(6) : -xAcross(6));
            const blitzPoint: Pt = { x: gapX, y: QB.y };
            return approach(start, blitzPoint, 0.20, 1.25);
          }
          if (dropper === 'NICKEL') {
            const flat = sr ? ZONES.FLAT_RIGHT : ZONES.FLAT_LEFT;
            return approach(start, flat, 0.25, 0.60);
          }
          return approach(start, zoneAnchor(cover, id), 0.25, 0.55);
        }
        if (dropper && id === dropper) {
          // drop to strong flat
          const flat = sr ? ZONES.FLAT_RIGHT : ZONES.FLAT_LEFT;
          return approach(start, flat, 0.25, 0.60);
        }
        if (id === 'SS') {
          // buzz to weak curl
          const curl = sr ? ZONES.CURL_LEFT : ZONES.CURL_RIGHT;
          return approach(start, curl, 0.20, 0.55);
        }
        if (id === (sr ? 'SAM' : 'WILL')) {
          // opposite OLB shade weak curl
          const curl = sr ? ZONES.CURL_LEFT : ZONES.CURL_RIGHT;
          return approach(start, curl, 0.20, 0.50);
        }
        return approach(start, zoneAnchor(cover, id), 0.25, 0.55);
      }
      // Special ramp for TAMPA2 MIKE: hook -> pole (deep middle)
      if (cover === 'TAMPA2' && id === 'MIKE') {
        const hook = ZONES.HOOK_MID;
        const pole: Pt = { x: hook.x, y: yUp(34) };
        const f = Math.min(1, effT * 1.2); // ramp a bit quicker than clock
        const target: Pt = { x: hook.x + (pole.x - hook.x) * f, y: hook.y + (pole.y - hook.y) * f };
        return approach(start, target, 0.30, 0.55);
      }

      // Defensive Line: Enhanced pass rush with breakthrough system
      if (id === 'DE_L' || id === 'DE_R' || id === 'DT_L' || id === 'DT_R') {
        // Get current QB position for dynamic rush tracking
        const currentQBPos = getQBPosition(isShotgun, true, tt);
        
        // Check for breakthrough (deterministic one DL will eventually win)
        const currentBreakthrough = calculateBreakthrough(tt, protectionScheme, defSpeed);
        
        // Enhanced OL/DL engagement and jockeying mechanics
        if (tt < 0.5) {
          // Pre-engagement phase: DL and OL line up and prepare
          const jockeyDistance = Math.sin(tt * 8) * 0.3; // Subtle pre-snap movement
          const adjustedStart = { 
            x: start.x + xAcross(jockeyDistance), 
            y: start.y + yUp(jockeyDistance * 0.5) 
          };
          
          // Move toward initial engagement point
          const olEngagePoint = getOLPosition('C', currentQBPos, true, tt, protectionScheme, isShotgun); // Center as reference
          const engageX = id === 'DE_L' ? olEngagePoint.x - xAcross(4) : 
                         id === 'DE_R' ? olEngagePoint.x + xAcross(4) : 
                         id === 'DT_L' ? olEngagePoint.x - xAcross(1.5) : olEngagePoint.x + xAcross(1.5);
          
          return approach(adjustedStart, { x: engageX, y: start.y + yUp(0.5) }, 0.8, 0.95);
        }
        
        // Post-engagement: realistic pocket battle
        const isBreakthroughPlayer = currentBreakthrough?.defender === id;
        const rushSpeed = isBreakthroughPlayer ? 0.4 : 0.25; // Breakthrough player is faster
        const rushAccuracy = isBreakthroughPlayer ? 0.95 : 0.8;
        
        if (id === 'DE_L' || id === 'DE_R') {
          // Defensive Ends: External rush with contain, creating pocket "U" shape
          const rushMove = currentBreakthrough?.rushMove || 'SPEED';
          let rushPoint: Pt;
          
          if (isBreakthroughPlayer && rushMove === 'SPEED') {
            // Speed rush: outside path to QB
            const sideMultiplier = id === 'DE_L' ? -1 : 1;
            rushPoint = { 
              x: currentQBPos.x + xAcross(3 * sideMultiplier), 
              y: currentQBPos.y 
            };
          } else {
            // Contain rush: maintain pocket integrity while advancing
            const containX = id === 'DE_L' ? currentQBPos.x - xAcross(2.5) : currentQBPos.x + xAcross(2.5);
            rushPoint = { x: containX, y: currentQBPos.y + yUp(1) };
          }
          
          return approach(start, rushPoint, rushSpeed, rushAccuracy);
        } else {
          // Defensive Tackles: Interior rush creating pocket pressure
          const rushMove = currentBreakthrough?.rushMove || 'POWER';
          let rushPoint: Pt;
          
          if (isBreakthroughPlayer) {
            if (rushMove === 'INSIDE') {
              // Inside rush directly at QB
              rushPoint = { x: currentQBPos.x, y: currentQBPos.y };
            } else {
              // Power rush with slight angle
              const sideMultiplier = id === 'DT_L' ? -0.5 : 0.5;
              rushPoint = { 
                x: currentQBPos.x + xAcross(sideMultiplier), 
                y: currentQBPos.y + yUp(0.5) 
              };
            }
          } else {
            // Non-breakthrough DT: pressure but slower advance, maintain pocket shape
            const lateralOffset = (Math.random() - 0.5) * xAcross(2);
            rushPoint = { 
              x: currentQBPos.x + lateralOffset,
              y: currentQBPos.y + yUp(2)
            };
          }
          
          return approach(start, rushPoint, rushSpeed, rushAccuracy);
        }
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

      // C3 kick/push adjustment early vs motion: send flat player to the motion side
      if (cover === 'C3' && tt < 0.22 && lastMotion) {
        const toRight = lastMotion.dir === 'right';
        const flatPt = toRight ? ZONES.FLAT_RIGHT : ZONES.FLAT_LEFT;
        if (id === 'NICKEL') return approach(start, flatPt, 0.20, 0.60);
        if (id === 'SS' && c3Rotation !== 'BUZZ') {
          // SKY/CLOUD: safety toward curl/flat on motion side
          const curlPt = toRight ? ZONES.CURL_RIGHT : ZONES.CURL_LEFT;
          return approach(start, curlPt, 0.15, 0.55);
        }
      }

      // C2 dynamic trap behavior: corner drives #2 under; safety caps #1
      if (cover === 'C2') {
        const twoL = wrPos(left2() ?? 'SLOT', tt);
        const twoR = wrPos(right2() ?? 'SLOT', tt);
        const underL = yDepthYds(twoL) <= 10;
        const underR = yDepthYds(twoR) <= 10;
        if (id === 'CB_L' && underL) return approach(start, twoL, 0.0, 0.50);
        if (id === 'CB_R' && underR) return approach(start, twoR, 0.0, 0.50);
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
        // Trips checks (SOLO/POACH) simplified: weak safety poaches #3 vertical to the trips side,
        // boundary corner isolates #1. Nickel walls #2 early.
        const tripsOnRight = !!right3();
        const tripsOnLeft  = !!left3();
        if (id === "CB_L") return approach(p, wrPos(left1() ?? "X", tt), 0.10, 0.55);
        if (id === "CB_R") return approach(p, wrPos(right1() ?? "Z", tt), 0.10, 0.55);

        // Safeties: carry #2 vertical; if trips, weak safety poaches #3 vertical
        if (id === "SS" || id === "FS") {
          const isSS = id === 'SS';
          const myTwo = isSS ? (sr ? twoStrong : twoWeak) : (sr ? twoWeak : twoStrong);
          if (isVert(myTwo)) return approach(p, myTwo, 0.05, 0.45);

          const myOne = isSS ? (sr ? oneStrong : oneWeak) : (sr ? oneWeak : oneStrong);
          // Poach #3 if trips to the opposite safety's side
          const threeStrong = sr ? (right3() ?? null) : (left3() ?? null);
          const pThree = threeStrong ? wrPos(threeStrong, tt) : null;
          const imWeakSafety = (sr && !isSS) || (!sr && isSS);
          if (imWeakSafety && pThree && isVert(pThree)) return approach(p, pThree, 0.05, 0.40);

          const mid = { x: (myOne.x + myTwo.x)/2, y: (myOne.y + myTwo.y)/2 };
          return approach(p, mid, 0.05, 0.30);
        }

        // Nickel/LBs: wall #2 to trips and midpoint #3/RB underneath
        if (id === "NICKEL" || id === "MIKE" || id === "SAM" || id === "WILL") {
          const myTwo = (id === "NICKEL" || (id === "SAM" && !sr) || (id === "WILL" && sr)) ? twoStrong : twoWeak;
          if (id === "NICKEL" && (tripsOnLeft || tripsOnRight) && tt < 0.25) {
            const inside = myTwo.x > QB.x ? -xAcross(2) : xAcross(2);
            const wall: Pt = { x: myTwo.x + inside, y: yUp(18) };
            return approach(start, wall, 0.10, 0.55);
          }
          const pThree = (sr ? (right3() ? wrPos(right3()!, tt) : wrPos("RB", tt)) : (left3() ? wrPos(left3()!, tt) : wrPos("RB", tt)));
          const mid = { x: (myTwo.x + pThree.x)/2, y: (myTwo.y + pThree.y)/2 };
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
        const bunchLeft = formation === 'BUNCH_LEFT';
        if (bunchLeft && tt < 0.20) {
          // Early switch (banjo) on bunch: Nickel match outside-most briefly, CB_L take next
          if (id === 'NICKEL') {
            const outer = left1() ?? 'X';
            return approach(start, wrPos(outer, tt), 0.10, 0.60);
          }
          if (id === 'CB_L') {
            const nxt = left2() ?? 'SLOT';
            return approach(start, wrPos(nxt, tt), 0.10, 0.55);
          }
        }
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

    let gradeStr = 'OK';
    let explainStr = '';
    try {
      // Enhanced coaching analysis data
      const allReceivers: ReceiverID[] = ['X', 'Z', 'SLOT', 'TE', 'RB'];
      const receiverAnalysis = allReceivers.map(rid => {
        try {
          const openness = computeReceiverOpenness(rid, t);
          return { receiver: rid, score: openness.score, separation: openness.sepYds };
        } catch {
          return { receiver: rid, score: 0, separation: 0 };
        }
      }).sort((a, b) => b.score - a.score);
      
      const coverageDescription = identifyCoverage(coverage);
      
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
          catchWindowScore: computeReceiverOpenness(to, Math.min(1, t)).score,
          catchSepYds: computeReceiverOpenness(to, Math.min(1, t)).sepYds,
          targetBreakMs,
          heldVsBreakMs,
          firstOpenId,
          firstOpenMs,
          throwArea: lastThrowArea?.key,
          // Enhanced coaching data (as per Claude.md guidelines)
          coverageDescription,
          receiverAnalysis,
          progressionAnalysis: analyzeProgression(to, t)
        })
      });
      const data: { grade?: string; rationale?: string; coachingTip?: string } = await res.json();
      gradeStr = data.grade ?? 'OK';
      explainStr = [data.rationale, data.coachingTip].filter(Boolean).join("  Tip: ") || "Good rep.";
    } catch {
      gradeStr = 'OK';
      explainStr = "Grader unavailable. Try again.";
    }

    setGrade(gradeStr);
    setExplain(explainStr);
    safeTrack('ai_grade', { grade: gradeStr });

    // Notify parent so downstream AI Assistant can refresh with this throw context
    try {
      const throwSummary = {
        target: to,
        time: t,
        playId,
        holdMs,
        throwArea: lastThrowArea?.key,
        depthYds: lastThrowArea?.depthYds,
        windowScore: lastWindow?.info.score,
        nearestSepYds: lastWindow?.info.sepYds,
        nearestDefender: lastWindow?.info.nearest ?? null,
        grade: gradeStr,
        explanation: explainStr,
        conceptId,
        coverage,
        formation,
        catchWindowScore: computeReceiverOpenness(to, Math.min(1, t)).score,
        catchSepYds: computeReceiverOpenness(to, Math.min(1, t)).sepYds,
        // Add unique identifier to ensure AI Tutor always triggers
        throwTimestamp: Date.now(),
        uniqueId: `${playId}-${to}-${Date.now()}`
      };
      
      // Debug: ensure callback fires
      console.log('[PlaySimulator] onThrowGraded called with:', { playId, grade: gradeStr, target: to });
      onThrowGraded?.(throwSummary);
      // Broadcast a lightweight rep result for in-sim drill banner
      try {
        const rep = {
          target: to,
          grade: gradeStr,
          holdMs,
          throwArea: lastThrowArea?.key,
          windowScore: lastWindow?.info.score,
          catchWindowScore: computeReceiverOpenness(to, Math.min(1, t)).score,
          catchSepYds: computeReceiverOpenness(to, Math.min(1, t)).sepYds,
        };
        window.dispatchEvent(new CustomEvent('rep-result', { detail: rep }));
      } catch {}
    } catch {}

    // Server-side throw log (for future analytics) — log regardless of grader success
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
        grade: gradeStr,
        userId: userId ?? undefined,
        extra: {
          c3Rotation: coverage === 'C3' ? c3Rotation : undefined,
          coverageInsights: meta.coverageInsights,
          catchWindowScore: computeReceiverOpenness(to, Math.min(1, t)).score,
          catchSepYds: computeReceiverOpenness(to, Math.min(1, t)).sepYds,
          targetBreakMs,
          heldVsBreakMs,
          firstOpenId,
          firstOpenMs
        }
      };
      void fetch('/api/throw-log', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': userId ?? '' }, body: JSON.stringify(payload) });
    } catch {}
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

  function applyMotionNow() {
    if (!motionRid || motionBusy || phase !== 'pre') return;
    try {
      const A = (customAlign ?? FORMATIONS[formation]) as AlignMap;
      const cur = A[motionRid as ReceiverID];
      if (!cur) return;
      if (motionLockRid && motionLockRid !== motionRid) return;
      const sign = motionDir === 'left' ? -1 : 1;
      let dx = 0; const dy = 0;
      if (motionType === 'short') dx = sign * xAcross(6);
      else if (motionType === 'jet') dx = sign * xAcross(10);
      else if (motionType === 'across') dx = (QB.x - cur.x) * 2;
      const end: Pt = { x: Math.max(xAcross(4), Math.min(xAcross(FIELD_WIDTH_YDS - 4), cur.x + dx)), y: cur.y + dy };
      setMotionBusy(true);
      setLastMotion({ rid: motionRid as ReceiverID, type: motionType, dir: motionDir });
      // Compute realistic motion duration based on yards distance and receiver speed
      const yards = Math.hypot((end.x - cur.x)/XPX, (end.y - cur.y)/YPX);
      const baseYps = 6.0; // baseline yards/sec
      const eff = Math.max(4.5, baseYps * recSpeed * receiverSpeedMult(motionRid as ReceiverID) * starSpeedMult(motionRid as ReceiverID) * 0.9);
      const durMs = Math.max(800, Math.min(3500, Math.round((yards / eff) * 1000)));
      animateAlign(motionRid as ReceiverID, cur, end, durMs, A, () => {
        setMotionBusy(false);
        setMotionLockRid(motionRid as ReceiverID);
        
        if (snapOnMotion) {
          // SIMPLIFIED: Direct snap after motion completes - no complex timing
          setMotionBoost({ rid: motionRid as ReceiverID, untilT: 0.12, mult: 1.18 });
          // Use minimal delay to ensure DOM is settled, then snap immediately
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              startSnap();
            });
          });
        }
      });
    } catch {
      setMotionBusy(false);
    }
  }

  function startSnap() {
    // ULTRA-FAST: Batch all state updates synchronously for instant UI response
    const newPlayId = playId + 1;
    const newRngSeed = mixSeed(rngSeed, Date.now() >>> 0);
    
    // All critical state updates happen immediately in one batch
    setT(0);
    setDecision(null);
    setGrade(null);
    setExplain(null);
    setBallFlying(false);
    setBallT(0);
    setCatchAt(null);
    setCaught(false);
    setThrowMeta(null);
    setPlayId(newPlayId);
    setRngSeed(newRngSeed);
    setDrillInfo(null);
    setMotionLockRid(null);
    // setLastCatchInfo(null);
    
    // INSTANT phase transition - no micro/macro task delays
    setPhase("post");
    
    // All non-critical operations pushed to background with maximum delay
    setTimeout(() => {
      safeTrack('snap', { conceptId, coverage, formation });
      setAiLog((log) => log.concat([{ playId: newPlayId, coverage, formation, leverage: levInfo, adjustments: levAdjust }]));
      
      // API logging completely detached from UI flow
      setTimeout(() => {
        try {
          const meta = buildSnapMeta();
          const payload = {
            conceptId,
            coverage,
            formation,
            playId: newPlayId,
            rngSeed: newRngSeed,
            c3Rotation: coverage === 'C3' ? c3Rotation : undefined,
            press: meta.press,
            roles: meta.roles,
            leverage: meta.leverage,
          };
          fetch('/api/snap-log', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': userId ?? '' }, body: JSON.stringify(payload) }).catch(() => {});
        } catch {}
      }, 200);
    }, 10);
  }

  // NFL-Level Catch Outcome Calculation (as per Claude.md guidelines)
  function calculateCatchOutcome(catchPoint: Pt, _receiverPos: Pt, targetReceiver: ReceiverID | null) {
    if (!targetReceiver) {
      return { caught: false, incompleteReason: "No target receiver" };
    }
    
    // Find nearest defender to catch point
    let nearestDefender: DefenderID | null = null;
    let nearestDistance = Infinity;
    
    for (const defenderId of getActiveDefenders(formation)) {
      const defPos = Dlive[defenderId] ?? Dstart[defenderId] ?? D_ALIGN[defenderId];
      const distance = Math.sqrt((defPos.x - catchPoint.x) ** 2 + (defPos.y - catchPoint.y) ** 2);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestDefender = defenderId;
      }
    }
    
    // Convert pixel distance to yards for realistic evaluation
    const defenderSeparationYards = nearestDistance / ((XPX + YPX) / 2) * FIELD_WIDTH_YDS / XPX;
    
    // NFL-realistic catch probability based on separation and receiver skill
    let baseCatchProbability = 0.85; // Base catch rate for NFL receivers
    
    // Receiver skill modifiers
    if (targetReceiver === starRid) baseCatchProbability += 0.10; // Star receiver bonus
    if (targetReceiver === 'TE') baseCatchProbability += 0.05; // TEs typically reliable
    if (targetReceiver === 'RB') baseCatchProbability -= 0.05; // RBs slightly less reliable on passes
    
    // Defender proximity impact
    if (defenderSeparationYards < 1) {
      baseCatchProbability *= 0.30; // Heavy contest
    } else if (defenderSeparationYards < 2) {
      baseCatchProbability *= 0.60; // Moderate contest
    } else if (defenderSeparationYards < 3) {
      baseCatchProbability *= 0.80; // Light contest
    }
    // Separation > 3 yards = no penalty (open receiver)
    
    // Ball speed impact (faster balls harder to catch under pressure)
    if (defenderSeparationYards < 2 && ballSpeed > 1.5) {
      baseCatchProbability *= 0.85; // Fast ball under pressure
    }
    
    // Random outcome with weighted probability
    const catchRoll = Math.random();
    const caught = catchRoll < baseCatchProbability;
    
    if (!caught) {
      // Determine incomplete reason based on circumstances
      let incompleteReason = "Drop";
      if (defenderSeparationYards < 1.5) {
        incompleteReason = Math.random() < 0.6 ? "Pass breakup" : "Hit as caught";
      } else if (defenderSeparationYards < 2.5) {
        incompleteReason = "Deflection";
      }
      
      return { 
        caught: false, 
        incompleteReason,
        defenderSeparation: defenderSeparationYards,
        nearestDefender 
      };
    }
    
    // For caught passes, determine if receiver was hit and type of hit
    const wasHit = defenderSeparationYards < 2;
    let hitType: 'driven_back' | 'voluntary_retreat' | null = null;
    let forwardProgress: Pt | null = null;
    let tackleSpot: Pt | null = null;
    
    if (wasHit) {
      // Simulate forward progress vs being driven back
      const driveBackChance = defenderSeparationYards < 1 ? 0.7 : 0.3;
      hitType = Math.random() < driveBackChance ? 'driven_back' : 'voluntary_retreat';
      
      if (hitType === 'driven_back') {
        // Mark forward progress (furthest point before being driven back)
        forwardProgress = catchPoint;
        tackleSpot = { 
          x: catchPoint.x, 
          y: catchPoint.y + (Math.random() - 0.5) * 20 // Driven back 0-10 pixels
        };
      } else {
        // Voluntary retreat - tackle at slightly different spot
        tackleSpot = { 
          x: catchPoint.x + (Math.random() - 0.5) * 15, 
          y: catchPoint.y + (Math.random() - 0.5) * 15 
        };
      }
    }
    
    return { 
      caught: true, 
      wasHit, 
      hitType, 
      forwardProgress, 
      tackleSpot,
      defenderSeparation: defenderSeparationYards,
      nearestDefender 
    };
  }

  // Enhanced AI Coaching Feedback System (as per Claude.md guidelines)
  function identifyCoverage(coverage: CoverageID): string {
    const coverageMap: Record<CoverageID, string> = {
      'C0': 'Cover 0 (All-Out Man) - Pure man coverage, no deep safety help',
      'C1': 'Cover 1 (Man-Free) - Man coverage with single high safety',
      'C2': 'Cover 2 (Zone) - Two deep safeties, CBs jam/release to flats',
      'TAMPA2': 'Tampa 2 - Cover 2 with MIKE running middle pole',
      'C3': 'Cover 3 (Zone) - Three deep (CB/FS), four underneath',
      'C4': 'Cover 4 (Quarters) - Four deep, pattern-match on verticals', 
      'QUARTERS': 'Quarters (Match) - Pattern-match rules on verticals',
      'PALMS': 'Palms (2-Read) - CB/Safety switch based on #2 route',
      'C6': 'Cover 6 (Quarter-Quarter-Half) - Split field coverage',
      'C9': 'Cover 9 (3-Match) - Match rules rotate to trips side'
    };
    return coverageMap[coverage] || coverage;
  }

  function analyzeProgression(targetReceiver: ReceiverID, throwTime: number): string {
    const receivers: ReceiverID[] = ['X', 'Z', 'SLOT', 'TE', 'RB'];
    const openReceivers: Array<{rid: ReceiverID, score: number, sep: number}> = [];
    
    // Analyze all receivers at throw time
    for (const rid of receivers) {
      try {
        const openness = computeReceiverOpenness(rid, throwTime);
        if (openness.score >= 0.6) {
          openReceivers.push({
            rid, 
            score: openness.score, 
            sep: openness.sepYds
          });
        }
      } catch {
        continue;
      }
    }
    
    // Sort by openness score
    openReceivers.sort((a, b) => b.score - a.score);
    
    if (openReceivers.length === 0) {
      return "No receivers had clear separation - good coverage by defense.";
    }
    
    const bestOption = openReceivers[0];
    if (bestOption.rid === targetReceiver) {
      return `✓ Correct read - ${targetReceiver} was best option (${bestOption.sep.toFixed(1)}yd sep).`;
    } else {
      const alternatives = openReceivers.filter(r => r.rid !== targetReceiver).slice(0, 2);
      if (alternatives.length > 0) {
        const altText = alternatives.map(r => `${r.rid} (${r.sep.toFixed(1)}yd)`).join(', ');
        return `Consider: ${altText} had better separation than ${targetReceiver}.`;
      }
      return `Target ${targetReceiver} was acceptable but not optimal choice.`;
    }
  }

  function generateImmediateCoachingFeedback(
    catchResult: { wasHit?: boolean; hitType?: string | null; defenderSeparation?: number; incompleteReason?: string },
    coverage: CoverageID, 
    targetReceiver: ReceiverID,
    throwTime: number,
    _receiverInfo: { score: number; sepYds: number }
  ): string {
    
    const coverageId = identifyCoverage(coverage);
    const progression = analyzeProgression(targetReceiver, throwTime);
    
    let feedback = `${coverageId.split(' -')[0]} Coverage. `;
    
    if (catchResult.wasHit) {
      const hitType = catchResult.hitType === 'driven_back' ? 'driven back' : 'maintained balance';
      feedback += `Hit immediately, ${hitType} (${catchResult.defenderSeparation?.toFixed(1)}yd sep). `;
      
      if (catchResult.defenderSeparation && catchResult.defenderSeparation < 2) {
        feedback += "Tight window - consider quicker release or check-down. ";
      }
    } else if (catchResult.defenderSeparation && catchResult.defenderSeparation > 3) {
      feedback += `Clean catch - ${catchResult.defenderSeparation?.toFixed(1)}yd separation. `;
      if (_receiverInfo.score > 0.8) {
        feedback += "Excellent read. ";
      }
    }
    
    feedback += progression;
    
    return feedback;
  }

  function generateIncompletePassFeedback(
    catchResult: { incompleteReason?: string; defenderSeparation?: number },
    coverage: CoverageID, 
    targetReceiver: ReceiverID,
    throwTime: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _receiverInfo: { score: number; sepYds: number }
  ): string {
    
    const coverageId = identifyCoverage(coverage);
    const progression = analyzeProgression(targetReceiver, throwTime);
    
    let feedback = `Incomplete vs ${coverageId.split(' -')[0]}. `;
    
    if (catchResult.incompleteReason) {
      if (catchResult.incompleteReason.includes('Deflected')) {
        feedback += `Deflected by defender (${catchResult.defenderSeparation?.toFixed(1) || 'close'}yd sep) - `;
        if (catchResult.defenderSeparation && catchResult.defenderSeparation < 1.5) {
          feedback += "throw earlier or find different target. ";
        } else {
          feedback += "unlucky break, good throw. ";
        }
      } else if (catchResult.incompleteReason.includes('Dropped')) {
        feedback += `Dropped by ${targetReceiver} - good throw, receiver error. `;
      } else if (catchResult.incompleteReason.includes('Contested')) {
        feedback += `Contested catch failed (${catchResult.defenderSeparation?.toFixed(1)}yd sep) - `;
        feedback += "consider safer option or throw earlier. ";
      } else {
        feedback += `${catchResult.incompleteReason} (${catchResult.defenderSeparation?.toFixed(1)}yd sep). `;
      }
    }
    
    feedback += progression;
    
    return feedback;
  }

  function hardReset() {
    // Batch state updates for instant response
    requestAnimationFrame(() => {
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
      setMotionLockRid(null);
      setDrillInfo(null);
      // setLastCatchInfo(null);
    });
  }
  function startThrow(to: ReceiverID) {
  // Quick validation checks first
  if ((to === "TE" && teBlock) || (to === "RB" && rbBlock)) return;
  if (phase !== "post" || ballFlying || t >= 0.999) return;
  
  const path = O[to];
  if (!path || path.length === 0) return;

  // ULTRA-FAST: Calculate and set all critical state immediately
  const p2 = posOnPathLenScaled(path, Math.min(1, t * recSpeed * receiverSpeedMult(to) * starSpeedMult(to)));
  
  // Use current QB position (accounts for dropback)
  const currentQBPos = getQBPosition(isShotgun, phase === 'post', t);
  const p0 = { x: qbX(), y: currentQBPos.y };
  
  const mid = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
  
  // Enhanced arc calculation based on ball speed and distance
  const distancePx = dist(p0, p2);
  const baseArc = distancePx * 0.15;
  // Faster ball speed = flatter trajectory (less arc)
  const speedArcModifier = 1 / ballSpeed; // Higher speed = lower arc
  const arc = Math.min(120, Math.max(20, baseArc * speedArcModifier));
  const p1 = { x: mid.x, y: mid.y - arc };
  
  // Accurate distance calculation in yards
  const distanceXYds = Math.abs(p2.x - p0.x) / XPX;
  const distanceYYds = Math.abs(p2.y - p0.y) / YPX;
  const distanceYards = Math.sqrt(distanceXYds * distanceXYds + distanceYYds * distanceYYds);
  
  // Calculate realistic flight time based on NFL QB arm strength (29.3333 yards/sec)
  const baseFlightTimeMs = (distanceYards / 29.3333) * 1000; // NFL QB speed in ms
  const adjustedFlightTimeMs = baseFlightTimeMs / ballSpeed; // Apply speed modifier
  const flightMs = Math.min(1400, Math.max(300, adjustedFlightTimeMs));
  const frac = Math.min(0.6, Math.max(0.15, flightMs / PLAY_MS));
  const holdMs = Math.round(t * PLAY_MS);
  
  // Batch all critical UI updates for instant response
  setBallP0(p0);
  setBallP1(p1);
  setBallP2(p2);
  setBallT(0);
  setCatchAt(null);
  setLastHoldMs(holdMs);
  setDecision(to);
  setBallFlying(true);
  setThrowMeta({ p0, p1, p2, tStart: t, frac });
  setCaught(false);
  
  // Defer only the most expensive computations
  setTimeout(() => {
    const win = computeReceiverOpenness(to, t);
    setLastWindow({ rid: to, info: win });
    const area = classifyThrowArea(p2);
    setLastThrowArea(area);
    if (soundOn) playWhistle();
    safeTrack('throw', { target: to, t: Number(t.toFixed(2)), area: area.key, depthYds: area.depthYds });
  }, 5);
}

  // Optimized ball animation with reduced computation
  const lastBallUpdate = useRef<number>(0);
  useEffect(() => {
    if (!ballFlying || !throwMeta) return;

    // Throttle ball animation for smoother performance
    const now = performance.now();
    if (now - lastBallUpdate.current < 16) return; // ~60fps max
    lastBallUpdate.current = now;
    
    const rel = Math.max(0, Math.min(1, (t - throwMeta.tStart) / throwMeta.frac));
    const eased = rel < 0.5 ? 2 * rel * rel : -1 + (4 - 2 * rel) * rel;
    setBallT(eased);

    if (rel >= 1 && ballFlying) {
      setBallFlying(false);
      
      // NFL Ball Spotting Rules Implementation
      const catchPoint = throwMeta.p2;
      const receiverPosition = decision ? wrPos(decision, t) : catchPoint;
      
      // Calculate catch probability based on defender proximity and timing
      const catchResult = calculateCatchOutcome(catchPoint, receiverPosition, decision);
      
      if (catchResult.caught) {
        setCatchAt(catchPoint);
        setCaught(true);
        
        // Forward Progress Rules (as per Claude.md guidelines)
        let ballSpot = catchPoint;
        if (catchResult.wasHit && catchResult.hitType === 'driven_back') {
          // Driven back by defender => mark furthest forward point before being pushed back
          ballSpot = catchResult.forwardProgress || catchPoint;
        } else if (catchResult.wasHit && catchResult.hitType === 'voluntary_retreat') {
          // Voluntary retreat => mark actual tackle spot
          ballSpot = catchResult.tackleSpot || catchPoint;
        }
        
        // Hash Rules (as per Claude.md guidelines)
        let nextHash: 'L' | 'R';
        const spotX = ballSpot.x;
        
        // End inside hashes => spot there; end outside => bring to nearest hash
        if (spotX >= HASH_L && spotX <= HASH_R) {
          // Between hashes - spot exactly where caught
          nextHash = Math.abs(spotX - HASH_L) <= Math.abs(spotX - HASH_R) ? 'L' : 'R';
        } else {
          // Outside hashes - bring to nearest hash
          nextHash = spotX < HASH_L ? 'L' : 'R';
        }
        
        setHashSide(nextHash);
        
        // Enhanced AI Coaching Feedback (as per Claude.md guidelines)
        if (decision) {
          const coachingFeedback = generateImmediateCoachingFeedback(
            catchResult, 
            coverage, 
            decision, 
            t, 
            computeReceiverOpenness(decision, t)
          );
          setExplain(coachingFeedback);
        } else {
          setExplain("Catch completed but no target identified");
        }
        
      } else {
        // Incomplete pass scenarios - Enhanced coaching feedback
        setCatchAt(null);
        setCaught(false);
        if (decision) {
          const incompleteFeedback = generateIncompletePassFeedback(
            catchResult, 
            coverage, 
            decision, 
            t, 
            computeReceiverOpenness(decision, t)
          );
          setExplain(incompleteFeedback);
        } else {
          setExplain("Incomplete: No target receiver");
        }
      }
      
      setThrowMeta(null);
      
      // CRITICAL: Execute immediately for AI Tutor functionality
      if (decision) {
        try {
          // const ci = computeReceiverOpenness(decision, t);
          // setLastCatchInfo({ rid: decision, t, score: ci.score, sep: ci.sepYds });
        } catch {}
        // Must call gradeDecision immediately to ensure onThrowGraded fires for AI Tutor
        gradeDecision(decision);
      }
      if (soundOn) playCatchPop();
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
        let opacity = 0.25;
        
        // Enhanced line weights and opacity for better hierarchy
        if (yds % 10 === 0) {
          sw = 2.5;
          opacity = 0.4;
        }
        if (yds === 0 || yds === 120) {
          sw = 4; // End lines more prominent
          opacity = 0.8;
        }
        if (yds === 10 || yds === 110) {
          sw = 3.5; // Goal lines
          opacity = 0.7;
        }
        if (yds === 60) {
          sw = 3; // Midfield line
          opacity = 0.5;
        }
        
        lines.push(
          <line
            key={`yl-${yds}`}
            x1={0}
            x2={PX_W}
            y1={y}
            y2={y}
            stroke="rgba(255,255,255,0.9)"
            strokeWidth={sw}
            opacity={opacity}
          />
        );
      }
      return <>{lines}</>;
    };
    const HashMarks = () => {
      const marks: JSX.Element[] = [];
      const xHashL = xAcross(HASH_FROM_SIDELINE_YDS);
      const xHashR = xAcross(FIELD_WIDTH_YDS - HASH_FROM_SIDELINE_YDS);
      
      // NFL regulation: each hash mark is 24 inches long (2 feet)
      const hashLength = xAcross(2); // 2 yards converted to pixels
      const hashWidth = 1.5;
      
      // Draw hash marks every yard from 11-109 (avoiding end zones)
      for (let y = 11; y <= 109; y++) {
        const yy = yUp(y);
        const opacity = y % 5 === 0 ? 0.9 : 0.7; // More prominent every 5 yards
        const strokeWidth = y % 5 === 0 ? 2 : hashWidth; // Thicker every 5 yards
        
        // Left hash marks
        marks.push(
          <line
            key={`hl-${y}`}
            x1={xHashL - hashLength / 2}
            x2={xHashL + hashLength / 2}
            y1={yy}
            y2={yy}
            stroke="rgba(255,255,255,0.95)"
            strokeWidth={strokeWidth}
            opacity={opacity}
          />
        );
        
        // Right hash marks
        marks.push(
          <line
            key={`hr-${y}`}
            x1={xHashR - hashLength / 2}
            x2={xHashR + hashLength / 2}
            y1={yy}
            y2={yy}
            stroke="rgba(255,255,255,0.95)"
            strokeWidth={strokeWidth}
            opacity={opacity}
          />
        );
        
        // Add small tick marks every yard between 5-yard lines
        if (y % 5 !== 0) {
          const tickLength = xAcross(0.5); // Small tick marks
          // Left side ticks
          marks.push(
            <line
              key={`tl-${y}`}
              x1={5}
              x2={5 + tickLength}
              y1={yy}
              y2={yy}
              stroke="rgba(255,255,255,0.6)"
              strokeWidth={1}
            />
          );
          // Right side ticks  
          marks.push(
            <line
              key={`tr-${y}`}
              x1={PX_W - 5 - tickLength}
              x2={PX_W - 5}
              y1={yy}
              y2={yy}
              stroke="rgba(255,255,255,0.6)"
              strokeWidth={1}
            />
          );
        }
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
        {/* End zone text */}
        <text
          x={PX_W / 2}
          y={yUp(115)}
          fill="rgba(255,255,255,0.8)"
          stroke="rgba(0,0,0,0.3)"
          strokeWidth={1}
          fontSize={14}
          fontWeight="bold"
          textAnchor="middle"
          dominantBaseline="middle"
        >
          TOUCHDOWN
        </text>
        <text
          x={PX_W / 2}
          y={yUp(5)}
          fill="rgba(255,255,255,0.8)"
          stroke="rgba(0,0,0,0.3)"
          strokeWidth={1}
          fontSize={14}
          fontWeight="bold"
          textAnchor="middle"
          dominantBaseline="middle"
          transform={`rotate(180 ${PX_W / 2} ${yUp(5)})`}
        >
          TOUCHDOWN
        </text>
      </>
    );
  };

  // Throw buttons hide TE/RB if they’re blocking
  const throwButtons = useMemo<ReceiverID[]>(() => {
    const base: ReceiverID[] = ["X", "Z", "SLOT", "TE", "RB"];
    return base.filter((id) => !(id === "TE" && teBlock) && !(id === "RB" && rbBlock));
  }, [teBlock, rbBlock]);

  // Throttled defense overlay JSX
  const defenseOverlay = useMemo(() => {
    return (
      <g>
        {getActiveDefenders(formation).map((did) => {
          const startP = Dstart[did] ?? D_ALIGN[did];
          const isMan = MAN_COVERAGES.has(coverage);
          const isZone = ZONE_COVERAGES.has(coverage);
          const isMatch = MATCH_COVERAGES.has(coverage);

          const sr = strongIsRight();
          const oneS = sr ? (right1() ?? 'Z') : (left1() ?? 'X');
          const twoS = sr ? (right2() ?? 'SLOT') : (left2() ?? 'SLOT');
          const threeS = sr ? (right3() ?? null) : (left3() ?? null);

          const elems: JSX.Element[] = [];

          if (isMan) {
            let tgt: ReceiverID | null = null;
            if (did === 'CB_L') tgt = 'X';
            if (did === 'CB_R') tgt = 'Z';
            if (did === 'NICKEL') tgt = 'SLOT';
            if (did === 'SS') tgt = 'TE';
            if (did === 'MIKE') tgt = 'RB';
            if (threeS) {
              if (did === (sr ? 'CB_R' : 'CB_L')) tgt = oneS;
              if (did === 'NICKEL') tgt = twoS;
              if (did === 'MIKE') tgt = threeS;
            }
            if (tgt) {
              const tp = (customAlign ?? align)[tgt] ?? align[tgt];
              elems.push(<line key={`ml-${did}`} x1={startP.x} y1={startP.y} x2={tp.x} y2={tp.y} stroke="#fca5a5" strokeWidth={2} strokeDasharray="4 3" />);
              elems.push(<circle key={`mp-${did}`} cx={tp.x} cy={tp.y} r={4} fill="#fca5a5" />);
            }
            if (phase !== 'post') {
              // Pre-snap: show faint potential layouts
              if (did === 'SAM') {
                const blitz = { x: QB.x - xAcross(6), y: QB.y };
                elems.push(<line key={`pre-blz-sam`} x1={startP.x} y1={startP.y} x2={blitz.x} y2={blitz.y} stroke="#fb7185" strokeWidth={1.5} opacity={0.5} />);
              }
              if (did === 'WILL') {
                const spy = { x: QB.x, y: yUp(20) };
                elems.push(<line key={`pre-spy-will`} x1={startP.x} y1={startP.y} x2={spy.x} y2={spy.y} stroke="#fde68a" strokeWidth={1.5} strokeDasharray="2 2" opacity={0.5} />);
              }
            } else {
              if (manExtraRoles.spy === did) {
                const spy = { x: QB.x, y: yUp(20) };
                elems.push(<line key={`spy-${did}`} x1={startP.x} y1={startP.y} x2={spy.x} y2={spy.y} stroke="#fde68a" strokeWidth={2} strokeDasharray="2 2" />);
              }
              if (manExtraRoles.blitzers.includes(did)) {
                const blitz = { x: QB.x + (did === 'SAM' ? -xAcross(6) : xAcross(6)), y: QB.y };
                elems.push(<line key={`blz-${did}`} x1={startP.x} y1={startP.y} x2={blitz.x} y2={blitz.y} stroke="#fb7185" strokeWidth={2.5} />);
              }
            }
          } else if (isZone || isMatch) {
            let anc = zoneAnchor(coverage, did);
            // Fire-zone: show blitzer and dropper visually
            if (coverage === 'C3' && fireZoneOn) {
              let fzDrop: DefenderID | null = null, fzBlitz: DefenderID | null = null;
              if (fzPreset === 'NICKEL') { fzDrop = sr ? 'WILL' : 'SAM'; fzBlitz = 'NICKEL'; }
              else if (fzPreset === 'SAM') { fzDrop = 'NICKEL'; fzBlitz = 'SAM'; }
              else if (fzPreset === 'WILL') { fzDrop = 'NICKEL'; fzBlitz = 'WILL'; }
              if (fzBlitz === did) {
                const blitz = { x: QB.x + (did === 'SAM' ? -xAcross(6) : did === 'WILL' ? xAcross(6) : (sr ? xAcross(6) : -xAcross(6))), y: QB.y };
                elems.push(<line key={`fzbl-${did}`} x1={startP.x} y1={startP.y} x2={blitz.x} y2={blitz.y} stroke="#fb7185" strokeWidth={2.5} />);
              }
              if (fzDrop === did) anc = sr ? ZONES.FLAT_RIGHT : ZONES.FLAT_LEFT;
            }
            elems.push(<line key={`zl-${did}`} x1={startP.x} y1={startP.y} x2={anc.x} y2={anc.y} stroke="#93c5fd" strokeWidth={2} strokeDasharray="4 3" />);
            const r = did === 'FS' ? 22 : did === 'SS' || did.startsWith('CB_') ? 18 : did === 'MIKE' ? 12 : 12;
            elems.push(<circle key={`zb-${did}`} cx={anc.x} cy={anc.y} r={r} fill="rgba(147,197,253,0.18)" stroke="rgba(147,197,253,0.5)" strokeWidth={1} />);
          }
          return <g key={`def-${did}`}>{elems}</g>;
        })}
      </g>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayTick, coverage, Dstart, align, customAlign, fireZoneOn, fzPreset, phase, manExtraRoles, showDefense]);

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
          <label className="flex items-center gap-2 text-white/70 text-xs">
            <input type="checkbox" checked={showDefense} onChange={(e) => {
              // PERFORMANCE: Use requestAnimationFrame for instant Show Defense toggle
              const checked = e.target.checked;
              startTransition(() => setShowDefense(checked));
            }} /> Show Defense
          </label>
          <label className="flex items-center gap-2 text-white/70 text-xs">
            <input type="checkbox" checked={showDev} onChange={(e)=>setShowDev(e.target.checked)} /> Dev Overlay
          </label>
          {showDev && (
            <label className="flex items-center gap-2 text-white/70 text-xs">
              <input type="checkbox" checked={showNearest} onChange={(e)=>setShowNearest(e.target.checked)} /> Show Nearest
            </label>
          )}
          <label className="flex items-center gap-2 text-white/70 text-xs">
            <span>Hash</span>
            <select className="bg-white/10 text-white text-xs rounded-md px-2 py-1" value={hashSide} onChange={(e)=>setHashSide(e.target.value as 'L'|'R')}>
              <option value="L">Left</option>
              <option value="R">Right</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-white/70 text-xs">
            <span>Star</span>
            <select className="bg-white/10 text-white text-xs rounded-md px-2 py-1" value={starRid ?? ''} onChange={(e)=>setStarRid((e.target.value || '') as ReceiverID | '')}>
              <option value="">—</option>
              <option value="X">X</option>
              <option value="Z">Z</option>
              <option value="SLOT">SLOT</option>
              <option value="TE">TE</option>
              <option value="RB">RB</option>
            </select>
          </label>
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
            onChange={(e) => {
              // PERFORMANCE: Use requestAnimationFrame for instant Formation changes
              const value = e.target.value as FormationName;
              startTransition(() => setFormation(value));
            }}
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

      <div className="relative w-full">
        <svg viewBox={`0 0 ${PX_W} ${PX_H}`} className="w-full rounded-xl">
          {drawField()}
          {/* Drill banner (applied by Adaptive Next Drill) */}
          {drillInfo && (
            (() => {
              const x = 12, y = 12;
              const lines: string[] = [];
              if (drillInfo.coverage) lines.push(`Coverage: ${drillInfo.coverage}`);
              if (drillInfo.formation) lines.push(`Formation: ${drillInfo.formation}`);
              if (drillInfo.fireZone?.on) lines.push(`Fire Zone: ${drillInfo.fireZone.preset || '—'}`);
              if (drillInfo.motions?.length) lines.push(`Motion: ${drillInfo.motions.map(m=>`${m.rid}:${m.type||'across'}${m.dir?'/'+m.dir:''}`).join(', ')}`);
              if (drillInfo.reason) lines.push(`Why: ${drillInfo.reason}`);
              if (drillInfo.lastRep) {
                const lr = drillInfo.lastRep;
                const open = typeof lr.catchWindowScore === 'number' ? lr.catchWindowScore.toFixed(2) : (typeof lr.windowScore==='number' ? lr.windowScore.toFixed(2) : '—');
                const sep = typeof lr.catchSepYds === 'number' ? ` (${lr.catchSepYds.toFixed(1)} yds)` : '';
                lines.push(`Last: ${lr.grade || '—'} · ${lr.throwArea || '—'} · open ${open}${sep}`);
              }
              const w = 360, h = Math.max(36, 20 + lines.length * 14);
              return (
                <g>
                  <rect x={x} y={y} width={w} height={h} rx={10} fill="rgba(17,17,17,0.55)" stroke="rgba(255,255,255,0.18)" />
                  <text x={x+10} y={y+18} className="text-[11px]" fill="rgba(255,255,255,0.95)">Next Drill</text>
                  {lines.map((ln,i)=> (
                    <text key={`dl-${i}`} x={x+10} y={y+32+i*14} className="text-[10px]" fill="rgba(255,255,255,0.92)">{ln}</text>
                  ))}
                  {/* Buttons: Save, Apply, Revert, Dismiss */}
                  <g onClick={async ()=>{
                    try {
                      const defaultName = `${drillInfo.coverage || 'C?'} ${drillInfo.formation || ''} ${drillInfo.fireZone?.on ? 'FZ' : ''}`.trim() || 'Routine';
                      const name = typeof window !== 'undefined' ? (window.prompt('Name this drill routine:', defaultName) || '').trim() : defaultName;
                      if (!name) return;
                      await fetch('/api/routine/save', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-user-id': userId ?? '' }, body: JSON.stringify({ routine: { name, drill: { coverage: drillInfo.coverage, formation: drillInfo.formation, motions: drillInfo.motions, fireZone: drillInfo.fireZone } } }) });
                    } catch {}
                  }}>
                    <rect x={x+w-262} y={y+8} width={56} height={18} rx={6} fill="rgba(99,102,241,0.25)" stroke="rgba(99,102,241,0.4)" />
                    <text x={x+w-234} y={y+21} className="text-[10px]" fill="rgba(255,255,255,0.95)" textAnchor="middle">Save</text>
                  </g>
                  <g onClick={()=>{ try{ window.dispatchEvent(new CustomEvent('apply-drill')); }catch{} }}>
                    <rect x={x+w-198} y={y+8} width={56} height={18} rx={6} fill="rgba(34,197,94,0.25)" stroke="rgba(34,197,94,0.4)" />
                    <text x={x+w-170} y={y+21} className="text-[10px]" fill="rgba(255,255,255,0.95)" textAnchor="middle">Apply</text>
                  </g>
                  <g onClick={()=>{ try{ window.dispatchEvent(new CustomEvent('revert-drill')); }catch{} }}>
                    <rect x={x+w-134} y={y+8} width={56} height={18} rx={6} fill="rgba(250,204,21,0.25)" stroke="rgba(250,204,21,0.4)" />
                    <text x={x+w-106} y={y+21} className="text-[10px]" fill="rgba(255,255,255,0.95)" textAnchor="middle">Revert</text>
                  </g>
                  <g onClick={()=>setDrillInfo(null)}>
                    <rect x={x+w-70} y={y+8} width={56} height={18} rx={6} fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.25)" />
                    <text x={x+w-42} y={y+21} className="text-[10px]" fill="rgba(255,255,255,0.95)" textAnchor="middle">Dismiss</text>
                  </g>
                </g>
              );
            })()
          )}
          {/* Auto-run HUD */}
          {autoRunHUD.active && (
            (() => {
              const text = `Auto: ${autoRunHUD.left} left · next in ${Math.max(0, Math.ceil(autoRunHUD.nextIn))}s`;
              return (
                <g>
                  <rect x={PX_W-210} y={12} width={198} height={24} rx={10} fill="rgba(17,17,17,0.55)" stroke="rgba(255,255,255,0.18)" />
                  <text x={PX_W-110} y={29} className="text-[11px]" fill="rgba(255,255,255,0.95)" textAnchor="middle">{text}</text>
                </g>
              );
            })()
          )}
          {/* Rep chips (last 6) */}
          {repChips.length > 0 && (
            (() => {
              const baseX = PX_W - 210, baseY = 44;
              const items = repChips;
              const colorFor = (g?: string) => {
                const s = (g||'').toLowerCase();
                if (s.includes('great')) return '#22c55e';
                if (s.includes('good')) return '#06b6d4';
                if (s.includes('ok')) return '#94a3b8';
                if (s.includes('risky')) return '#f59e0b';
                if (s.includes('late')) return '#ef4444';
                if (s.includes('wrong')) return '#f472b6';
                if (s.includes('missed')) return '#ef4444';
                return '#9ca3af';
              };
              return (
                <g>
                  {items.map((it, i) => (
                    <g key={`rc-${i}`} transform={`translate(${baseX}, ${baseY + i*20})`}>
                      <rect x={0} y={0} width={198} height={16} rx={8} fill="rgba(17,17,17,0.45)" stroke="rgba(255,255,255,0.15)" />
                      <circle cx={10} cy={8} r={5} fill={colorFor(it.grade)} />
                      <text x={22} y={11} className="text-[9px]" fill="rgba(255,255,255,0.92)">
                        {(it.grade || '—')} · {(typeof it.open==='number' ? it.open.toFixed(2) : '—')} {it.area ? `· ${it.area}` : ''}
                      </text>
                    </g>
                  ))}
                </g>
              );
            })()
          )}
          {/* Defense Overlay: pre-snap plan (throttled) */}
          {showDefense && defenseOverlay}


          {/* Route paths (offense) */}
          <g fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={2}>
            {(["X", "Z", "SLOT", "TE", "RB"] as ReceiverID[]).map((rid) => (
              <polyline key={`rp-${rid}`} points={(O[rid] ?? []).map((pt) => `${pt.x},${pt.y}`).join(" ")} />
            ))}
          </g>

          {/* QB */}
          <circle cx={qbPos.x} cy={qbPos.y} r={7} fill="#fbbf24" />
          <text x={qbPos.x + 10} y={qbPos.y + 4} className="fill-white/85 text-[10px]">
            QB
          </text>

          {/* Offensive Line */}
          {OL_IDS.map(olId => {
            const pos = getOLPosition(olId, qbPos, phase === 'post', t, protectionScheme, isShotgun);
            return (
              <g key={`ol-${olId}`}>
                <circle cx={pos.x} cy={pos.y} r={6} fill="#10b981" />
                <text x={pos.x - 6} y={pos.y - 12} className="fill-white/85 text-[8px]">
                  {olId}
                </text>
              </g>
            );
          })}

          {/* On-field coverage tooltip (top-center) + legend */}
          {(() => {
            const lines: string[] = [];
            const safFS = Dlive['FS'] ?? Dstart['FS'];
            const safSS = Dlive['SS'] ?? Dstart['SS'];
            const safDeep = [safFS, safSS].filter(p => yDepthYds(p) >= 14).length;
            lines.push(`MOF: ${safDeep >= 2 ? 'two-high' : 'one-high'}`);
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
            const boxW = 200;
            const lineH = 14;
            const padY = 8;
            const boxH = padY * 2 + lines.length * lineH;
            const x = (PX_W - boxW) / 2;
            const y = 8;
            return (
              <g>
                <rect x={x} y={y} width={boxW} height={boxH} rx={8} fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.25)" />
                {lines.map((ln, i) => (
                  <text key={`ct-${i}`} x={x + 10} y={y + padY + (i + 0.8) * lineH} className="text-[10px]" fill="rgba(255,255,255,0.95)" style={{ paintOrder: 'stroke' }}>
                    {ln}
                  </text>
                ))}
                {/* Legend (top-right corner) */}
                {showDefense && (
                  (() => {
                    const lx = PX_W - 180, ly = y + 0;
                    return (
                      <g>
                        <rect x={lx} y={ly} width={170} height={72} rx={8} fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.25)" />
                        <text x={lx + 8} y={ly + 14} className="text-[10px]" fill="rgba(255,255,255,0.95)">Legend</text>
                        <g>
                          <line x1={lx + 10} y1={ly + 26} x2={lx + 40} y2={ly + 26} stroke="#fca5a5" strokeWidth={2} strokeDasharray="4 3" />
                          <text x={lx + 48} y={ly + 29} className="text-[9px]" fill="rgba(255,255,255,0.9)">Man assignment</text>
                        </g>
                        <g>
                          <line x1={lx + 10} y1={ly + 38} x2={lx + 40} y2={ly + 38} stroke="#93c5fd" strokeWidth={2} strokeDasharray="4 3" />
                          <circle cx={lx + 58} cy={ly + 38} r={6} fill="rgba(147,197,253,0.18)" stroke="rgba(147,197,253,0.5)" strokeWidth={1} />
                          <text x={lx + 72} y={ly + 41} className="text-[9px]" fill="rgba(255,255,255,0.9)">Zone anchor & bubble</text>
                        </g>
                        <g>
                          <line x1={lx + 10} y1={ly + 50} x2={lx + 40} y2={ly + 50} stroke="#fb7185" strokeWidth={2.5} />
                          <text x={lx + 48} y={ly + 53} className="text-[9px]" fill="rgba(255,255,255,0.9)">Blitz path</text>
                        </g>
                        <g>
                          <line x1={lx + 10} y1={ly + 62} x2={lx + 40} y2={ly + 62} stroke="#fde68a" strokeWidth={2} strokeDasharray="2 2" />
                          <text x={lx + 48} y={ly + 65} className="text-[9px]" fill="rgba(255,255,255,0.9)">Spy path</text>
                        </g>
                      </g>
                    );
                  })()
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
                {/* Star receiver highlight */}
                {starRid === rid && (
                  <circle cx={p.x} cy={p.y} r={9} fill="none" stroke="#fcd34d" strokeWidth={2.2} />
                )}
                {/* Active throw target highlight */}
                {decision === rid && (
                  <>
                    <circle cx={p.x} cy={p.y} r={11} fill="none" stroke="#ff4444" strokeWidth={3} opacity={0.8}>
                      <animate attributeName="r" values="11;13;11" dur="1.2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.8;0.4;0.8" dur="1.2s" repeatCount="indefinite" />
                    </circle>
                    <circle cx={p.x} cy={p.y} r={8} fill="rgba(255,68,68,0.2)" />
                  </>
                )}
                {/* Best open receiver pulse */}
                {cachedTopOpen?.rid === rid && cachedTopOpen.score > 0.7 && decision !== rid && (
                  <circle cx={p.x} cy={p.y} r={10} fill="none" stroke="#00ff88" strokeWidth={2} opacity={0.6}>
                    <animate attributeName="r" values="10;12;10" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.6;0.2;0.6" dur="2s" repeatCount="indefinite" />
                  </circle>
                )}
                <text
                  x={p.x + dx}
                  y={p.y + dy}
                  className="text-[9px]"
                  fill="rgba(255,255,255,0.95)"
                  stroke="rgba(0,0,0,0.7)"
                  strokeWidth={2}
                  style={{ paintOrder: "stroke" }}
                >
                  {rid}{starRid===rid?" ★":""}
                  {badge}
                </text>
                {showDev && showNearest && (() => {
                  const info = computeReceiverOpenness(rid, t);
                  return (
                    <text
                      x={p.x}
                      y={p.y + 16}
                      className="text-[8px]"
                      fill="rgba(255,255,255,0.95)"
                      stroke="rgba(0,0,0,0.7)"
                      strokeWidth={2}
                      style={{ paintOrder: 'stroke' }}
                      textAnchor="middle"
                    >
                      {info.nearest ?? '-'} · {info.sepYds.toFixed(1)} yd
                    </text>
                  );
                })()}
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
                {(() => {
                  const side = levInfo[rid]?.side;
                  if (!(phase === 'pre' && side && side !== 'even')) return null;
                  return (
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
                      {`Lev: ${side === 'outside' ? 'OUT' : 'IN'}`}
                    </text>
                  );
                })()}
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
          {getActiveDefenders(formation).map(id => {
            const p = defenderPos(coverage, id, t);
            const { dx, dy } = labelOffsetFor(id, p);

            const isDL = id.startsWith('DE_') || id.startsWith('DT_');
            return (
                <g key={id}>
                <rect x={p.x - 6} y={p.y - 6} width={12} height={12} fill={isDL ? "#7c2d12" : "#ef4444"} opacity={0.95}/>
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

          {/* Enhanced Ball Flight Animation */}
          {ballFlying && (
            <>
              {/* Flight path - full trajectory */}
              <path
                d={`M ${ballP0.x} ${ballP0.y} Q ${ballP1.x} ${ballP1.y} ${ballP2.x} ${ballP2.y}`}
                stroke="rgba(255,255,255,0.4)"
                strokeDasharray="8 4"
                strokeWidth={2}
                fill="none"
                opacity={0.7}
              />
              
              {/* Active flight line - shows current trajectory */}
              <path
                d={`M ${ballP0.x} ${ballP0.y} Q ${ballP1.x} ${ballP1.y} ${ballP2.x} ${ballP2.y}`}
                stroke="rgba(255,165,0,0.9)"
                strokeWidth={3}
                fill="none"
                opacity={Math.max(0.3, 1 - ballT)}
                style={{
                  filter: 'drop-shadow(0px 0px 3px rgba(255,165,0,0.5))'
                }}
              />
              
              {/* Ball with realistic motion blur effect */}
              {(() => {
                const bp = qBezier(ballP0, ballP1, ballP2, ballT);
                const speed = ballSpeed;
                const blurRadius = Math.min(8, speed * 3);
                
                return (
                  <g>
                    {/* Motion blur trail */}
                    {ballT > 0.1 && (
                      <circle 
                        cx={qBezier(ballP0, ballP1, ballP2, Math.max(0, ballT - 0.05)).x} 
                        cy={qBezier(ballP0, ballP1, ballP2, Math.max(0, ballT - 0.05)).y} 
                        r={4} 
                        fill="rgba(245,158,11,0.3)" 
                      />
                    )}
                    {ballT > 0.2 && (
                      <circle 
                        cx={qBezier(ballP0, ballP1, ballP2, Math.max(0, ballT - 0.1)).x} 
                        cy={qBezier(ballP0, ballP1, ballP2, Math.max(0, ballT - 0.1)).y} 
                        r={3} 
                        fill="rgba(245,158,11,0.2)" 
                      />
                    )}
                    
                    {/* Main ball */}
                    <circle 
                      cx={bp.x} 
                      cy={bp.y} 
                      r={6} 
                      fill="#f59e0b" 
                      stroke="white" 
                      strokeWidth={2}
                      style={{
                        filter: `drop-shadow(0px 2px ${blurRadius}px rgba(245,158,11,0.4))`
                      }}
                    />
                    
                    {/* Speed indicator glow */}
                    <circle 
                      cx={bp.x} 
                      cy={bp.y} 
                      r={8 + speed * 2} 
                      fill="none" 
                      stroke="rgba(255,165,0,0.3)" 
                      strokeWidth={1}
                      opacity={speed > 1 ? 0.6 : 0.3}
                    />
                  </g>
                );
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

        {/* Controls - Only show in fullScreen mode */}
        {fullScreen && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {phase === "pre" ? (
                <>
                  <button onClick={startSnap} className="px-3 py-2 rounded-xl bg-emerald-500/90 text-white">
                    Snap
                  </button>
                  <label className="ml-2 flex items-center gap-1">
                    <input 
                      type="checkbox" 
                      checked={shotgun} 
                      onChange={(e) => setShotgun(e.target.checked)} 
                    />
                    <span className="text-white/90">Shotgun</span>
                  </label>
                </>
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
          </>
        )}

        {/* Motion controls - Only show in fullScreen mode */}
        {fullScreen && (
          <div className="mt-2 flex flex-wrap items-center gap-2 ml-2">
            <div className="text-white/60 text-xs">Motion</div>
            <select
              className="bg-white/10 text-white text-xs md:text-sm rounded-md px-2 py-2"
              value={motionRid}
              onChange={(e) => {
                // PERFORMANCE: Use requestAnimationFrame to avoid blocking UI
                const value = e.target.value as ReceiverID;
                startTransition(() => setMotionRid(value));
              }}
              disabled={motionBusy || phase !== 'pre'}
            >
              <option value="">Receiver…</option>
              {(["X","Z","SLOT","TE","RB"] as ReceiverID[]).map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select
              className="bg-white/10 text-white text-xs md:text-sm rounded-md px-2 py-2"
              value={motionType}
              onChange={(e) => setMotionType(e.target.value as 'jet'|'short'|'across')}
              disabled={motionBusy || phase !== 'pre'}
            >
              <option value="jet">Jet</option>
              <option value="short">Short</option>
              <option value="across">Across</option>
            </select>
            <select
              className="bg-white/10 text-white text-xs md:text-sm rounded-md px-2 py-2"
              value={motionDir}
              onChange={(e) => setMotionDir(e.target.value as 'left'|'right')}
              disabled={motionBusy || phase !== 'pre'}
            >
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
            <label className="flex items-center gap-2 text-white/70 text-xs">
              <input type="checkbox" checked={snapOnMotion} onChange={(e)=>setSnapOnMotion(e.target.checked)} disabled={motionBusy || phase !== 'pre'} /> Snap on motion
            </label>
            <button
              onClick={applyMotionNow}
              disabled={!motionRid || motionBusy || phase !== 'pre'}
              className="px-3 py-2 rounded-xl bg-emerald-400 text-black font-semibold disabled:opacity-60"
              title="Animate motion before snap"
            >
              Move
            </button>
            {motionBusy && <div className="text-white/60 text-xs">Motioning…</div>}
          </div>
        )}

        {/* Throw targets + Audible - Only show in fullScreen mode */}
        {fullScreen && (
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
              <label className="ml-2 flex items-center gap-1"><input type="checkbox" checked={fireZoneOn} onChange={(e)=>setFireZoneOn(e.target.checked)} /> Fire Zone (3u/3d)</label>
              {fireZoneOn && (
                <>
                  <span>Preset</span>
                  <select
                    className="bg-white/10 text-white rounded-md px-2 py-2"
                    value={fzPreset}
                    onChange={(e)=>setFzPreset(e.target.value as FZPreset)}
                    title="Fire-zone preset"
                  >
                    <option value="NICKEL">Nickel Blitz</option>
                    <option value="SAM">SAM Blitz</option>
                    <option value="WILL">WILL Blitz</option>
                  </select>
                </>
              )}
              <label className="ml-2 flex items-center gap-1"><input type="checkbox" checked={showDev} onChange={(e)=>setShowDev(e.target.checked)} /> Dev Overlay</label>
              {showDev && (
                <>
                  <label className="ml-2 flex items-center gap-1"><input type="checkbox" checked={showDefense} onChange={(e) => {
                    // PERFORMANCE: Use requestAnimationFrame for instant Show Defense toggle
                    const checked = e.target.checked;
                    startTransition(() => setShowDefense(checked));
                  }} /> Show Defense</label>
                  <label className="ml-2 flex items-center gap-1"><input type="checkbox" checked={showNearest} onChange={(e)=>setShowNearest(e.target.checked)} /> Show Nearest</label>
                </>
              )}
            </div>
          )}

          {/* Inline audible controls when enabled */}
          {audibleOn && (
            <div className="flex flex-wrap items-center gap-2 pl-1">
              <select
                className="bg-white/10 text-white text-xs md:text-sm rounded-md px-2 py-2"
                value={audTarget}
                onChange={(e) => {
                  // ULTRA-PERFORMANCE: Optimized for instant response
                  const value = e.target.value as ReceiverID;
                  // Immediate visual feedback with double RAF for smoothness
                  requestAnimationFrame(() => {
                    startTransition(() => setAudTarget(value));
                  });
                }}
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
                onChange={(e) => {
                  // ULTRA-PERFORMANCE: Optimized for instant response
                  const value = e.target.value as RouteKeyword;
                  // Immediate visual feedback with double RAF for smoothness
                  requestAnimationFrame(() => {
                    startTransition(() => setAudRoute(value));
                  });
                }}
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
        )}

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
      {showDev && (
        <div className="mt-3 p-3 rounded-xl bg-white/5 text-white text-xs space-y-1 border border-white/10">
          <div className="uppercase text-white/60">Dev Checks</div>
          <div>Coverage: {coverage} {coverage==='C3' ? `(rot=${c3RotationMode==='AUTO'?c3Rotation:c3RotationMode}${fireZoneOn? ', fire-zone':''})` : ''}</div>
          {(() => { const m = buildSnapMeta(); return (
            <>
              <div>Trips: {m.coverageInsights?.tripsSide || '—'} {m.coverageInsights?.tripsCheck ? `(${m.coverageInsights?.tripsCheck})` : ''}</div>
              <div>MOF: {m.coverageInsights?.mofState}</div>
              <div>Hot: {m.coverageInsights?.hotNow ? 'YES' : 'no'}</div>
              {coverage==='C3' && (
                <div>Kick/Push: {m.coverageInsights?.c3KickPush ? 'bias' : '—'} · Dropper: {m.coverageInsights?.fireZoneDropper || '—'} · Blitzer: {m.coverageInsights?.fireZoneBlitzer || '—'}</div>
              )}
              <div>Banjo: {m.coverageInsights?.banjoActive ? 'on' : 'off'}</div>
            </>
          ); })()}
        </div>
      )}
    </div>
  );
}
