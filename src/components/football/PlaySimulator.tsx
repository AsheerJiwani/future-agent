"use client";

import { JSX, useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { FootballConceptId } from "../../data/football/catalog";
import type { CoverageID } from "../../data/football/types";

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

const DECISION_POINTS = [0.35, 0.6];

// QB at bottom-middle, ~12 yds from GL
const QB = { x: xAcross(FIELD_WIDTH_YDS / 2), y: yUp(12) };

/* --------- Types --------- */
export type ReceiverID = "X" | "Z" | "SLOT" | "TE" | "RB";
type DefenderID =
  | "CB_L"
  | "CB_R"
  | "NICKEL"
  | "FS"
  | "SS"
  | "SAM"
  | "MIKE"
  | "WILL";

export type RouteKeyword =
  | "GO"
  | "SEAM"
  | "BENDER"
  | "HITCH"
  | "OUT"
  | "SPEED_OUT"
  | "COMEBACK"
  | "CURL"
  | "DIG"
  | "POST"
  | "CORNER"
  | "CROSS"
  | "OVER"
  | "SHALLOW"
  | "SLANT"
  | "FLAT"
  | "WHEEL"
  | "CHECK"
  | "STICK";

type Pt = { x: number; y: number };
type Actor = { id: string; color: string; path: Pt[] };

type RouteMap = Record<ReceiverID, Pt[]>;
type AssignMap = Partial<Record<ReceiverID, RouteKeyword>>;
type AlignMap = Record<ReceiverID, Pt>;

type FormationName = "TRIPS_RIGHT" | "DOUBLES" | "BUNCH_LEFT";

interface AudibleSuggestion {
  formation?: FormationName;
  assignments?: AssignMap;
  rationale?: string;
}

/* --------- Math + sampling --------- */
const qBezier = (p0: Pt, p1: Pt, p2: Pt, t: number): Pt => {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
  };
};
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const d2 = (a: Pt, b: Pt) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
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
    case "CURL": {
      const stem = { x: s.x, y: yUp(DEPTH.curl) };
      const work = { x: stem.x, y: yUp(DEPTH.curl - 2) };
      return [s, stem, work];
    }
    case "COMEBACK": {
      const stem = { x: s.x, y: yUp(DEPTH.dig) };
      const back = { x: sidelineX(s, 6), y: yUp(DEPTH.curl) };
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
    case "CORNER": {
      const stem = { x: s.x, y: yUp(DEPTH.deep) };
      const flag = { x: sidelineX(s, 8), y: yUp(DEPTH.shot) };
      return [s, stem, flag];
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

/* =========================================
   COMPONENT
   ========================================= */

export default function PlaySimulator({
  conceptId,
  coverage,
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

  const [blockAssignments, setBlockAssignments] = useState<BlockMap>({});
  const [blockedDefenders, setBlockedDefenders] = useState<Set<DefenderID>>(new Set());
  const [blockEngage, setBlockEngage] = useState<Partial<Record<DefenderID, Pt>>>({});

  // --- Audible UI ---
  const [audibleOn, setAudibleOn] = useState(false);
  const [audTarget, setAudTarget] = useState<ReceiverID | "">("");
  const [audRoute, setAudRoute]   = useState<RouteKeyword | "">("");

  const [caught, setCaught] = useState(false);

  const PLAY_MS = 3000; // play clock duration (matches Snap timer)

  type ThrowMeta = { p0: Pt; p1: Pt; p2: Pt; tStart: number; frac: number };
  const [throwMeta, setThrowMeta] = useState<ThrowMeta | null>(null);

  // Generous menu of routes
  const ROUTE_MENU: RouteKeyword[] = [
    "GO","SPEED_OUT","CURL",
    "DIG","POST","CORNER",
    "SLANT","WHEEL","CHECK",
  ];

  // Receivers available to audible (exclude blockers)
  const selectableReceivers = useMemo<ReceiverID[]>(
    () => (["X","Z","SLOT","TE","RB"] as ReceiverID[])
      .filter(id => !(id === "TE" && teBlock) && !(id === "RB" && rbBlock)),
    [teBlock, rbBlock]
  );

  const hasAudibles = useMemo(() => Object.keys(manualAssignments).length > 0, [manualAssignments]);

  // === Single fast play clock (3000ms) ===
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

  // Rebuild alignment, numbering, routes, and defender starts whenever inputs change
  useEffect(() => {
    const A = FORMATIONS[formation];
    setAlign(A);
    setNumbering(computeNumbering(A));

    const routes = buildConceptRoutes(conceptId, A, coverage);

    if (teBlock) routes.TE = passProPathTE(A);
    if (rbBlock) routes.RB = passProPathRB(A);

    // Apply manual audible overrides (skip if that player is blocking)
    (Object.entries(manualAssignments) as [ReceiverID, RouteKeyword][])
      .forEach(([rid, kw]) => {
        if ((rid === "TE" && teBlock) || (rid === "RB" && rbBlock)) return;
        routes[rid] = routeFromKeyword(kw, A[rid], coverage);
      });

    setO(routes);

    // strength-aware defensive starting spots
    setDstart(computeDefenderStarts(A));

    // reset to pre-snap for consistency
    setPhase("pre");
    setT(0);
    setDecision(null);
    setGrade(null);
    setExplain(null);
    setBallFlying(false);
    setBallT(0);
    setCatchAt(null);
  }, [formation, conceptId, coverage, teBlock, rbBlock, manualAssignments]);

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
      const ok = Math.random() < 0.90; // TE success 90%
      if (tgt && ok) {
        blocked.add(tgt);
        engages[tgt] = computeEngagePoint("TE", (O.TE[0] ?? align.TE), Dstart[tgt]);
      }
    }

    if (rbBlock) {
      const tgt = computeBlockTarget("RB", coverage, align, Dstart, sr);
      assigns.RB = tgt ?? null;
      const ok = Math.random() < 0.70; // RB success 70%
      if (tgt && ok) {
        blocked.add(tgt);
        engages[tgt] = computeEngagePoint("RB", (O.RB[0] ?? align.RB), Dstart[tgt]);
      }
    }

    setBlockAssignments(assigns);
    setBlockedDefenders(blocked);
    setBlockEngage(engages);
  }, [phase, teBlock, rbBlock, coverage, align, Dstart, O]);

  const DEFENDER_IDS: DefenderID[] = ["CB_L", "CB_R", "NICKEL", "FS", "SS", "SAM", "MIKE", "WILL"];

  const throwEnabled = useMemo(
    () => DECISION_POINTS.some((dp) => Math.abs(t - dp) < 0.08) && phase === "post" && !ballFlying && !decision,
    [t, phase, ballFlying, decision]
  );

  // Offense actors: simple array of {id, color, path} derived from the current routes O
  const offenseActors = useMemo<Actor[]>(() => ([
    { id: "X",    color: "#60a5fa", path: O.X },
    { id: "Z",    color: "#22d3ee", path: O.Z },
    { id: "SLOT", color: "#34d399", path: O.SLOT },
    { id: "TE",   color: "#f472b6", path: O.TE },
    { id: "RB",   color: "#a78bfa", path: O.RB },
  ]), [O]);

  function wrPosSafe(id: ReceiverID, tt: number): Pt {
    const path = O[id];
    if (path && path.length > 0) return posOnPathLenScaled(path, Math.min(1, tt * recSpeed));
    return align[id] ?? QB;
  }

  /* --------- Dynamic pre-snap defender starts --------- */
  function computeDefenderStarts(A: AlignMap): Record<DefenderID, Pt> {
    // Find outside receivers left/right for CB alignment
    const outsideLeft: ReceiverID = A.X.x < A.Z.x ? "X" : "Z";
    const outsideRight: ReceiverID = outsideLeft === "X" ? ("Z" as ReceiverID) : ("X" as ReceiverID);
    const slot = A.SLOT;

    const ssRight = strongSide(A) === "right";
    const yPressCB = yUp(16.5);
    const yNickel = yUp(17);
    const ySafety = yUp(32);
    const yFS = yUp(35);
    const yBacker = yUp(22);

    const CB_L: Pt = { x: A[outsideLeft].x, y: yPressCB };
    const CB_R: Pt = { x: A[outsideRight].x, y: yPressCB };

    const insideBias = xAcross(2);
    const nickelX =
      slot?.x !== undefined
        ? (slot.x > QB.x ? slot.x - insideBias : slot.x + insideBias)
        : ssRight
        ? xAcross(FIELD_WIDTH_YDS - 18)
        : xAcross(18);
    const NICKEL: Pt = { x: nickelX, y: yNickel };

    const SS: Pt = {
      x: ssRight ? xAcross(FIELD_WIDTH_YDS / 2 + 8) : xAcross(FIELD_WIDTH_YDS / 2 - 8),
      y: ySafety,
    };
    const FS: Pt = { x: xAcross(FIELD_WIDTH_YDS / 2), y: yFS };

    const SAM: Pt = { x: ssRight ? xAcross(20) : xAcross(FIELD_WIDTH_YDS - 20), y: yBacker };
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
        if (id === "CB_L") return L.DEEP;
        if (id === "CB_R") return R.DEEP;
        if (id === "FS")   return MID;
        if (id === "SS")     return sr ? off(R.CURL, -1) : off(L.CURL, +1);
        if (id === "NICKEL") return sr ? off(L.CURL, +1) : off(R.CURL, -1);
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
    posOnPathLenScaled(O[id], Math.min(1, tt * recSpeed));

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
    const losY = yUp(who === "TE" ? 16.5 + Math.random() * 0.8 : 15.5 + Math.random() * 0.6);
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

  /* --- defender controller --- */
  function defenderPos(cover: CoverageID, id: DefenderID, tt: number): Pt {
    const start = Dstart[id] ?? D_ALIGN[id];
    const effT = Math.max(0, Math.min(1, tt));
    const spd = Math.max(0.5, Math.min(1.6, defSpeed));
    const sr = strongIsRight();

    const approach = (from: Pt, to: Pt, base = 0, gain = 1) => {
      const pct = Math.min(1, base + effT * (gain * spd));
      return { x: from.x + (to.x - from.x) * pct, y: from.y + (to.y - from.y) * pct };
    };

    if (blockedDefenders.has(id)) {
      const ep = blockEngage[id] ?? start;
      return approach(start, ep, 0.35, 1.35);
    }

    const anchor = zoneAnchor(cover, id);

    /* MAN */
    if (MAN_COVERAGES.has(cover)) {
      if (cover === "C0") {
        const blitzLB: DefenderID = sr ? "SAM" : "WILL";
        const spyLB: DefenderID   = sr ? "WILL" : "SAM";

        if (id === blitzLB) {
          const gapX = QB.x + (sr ? xAcross(2) : -xAcross(2));
          const blitzPoint: Pt = { x: gapX, y: QB.y };
          return approach(start, blitzPoint, 0.15, 1.35);
        }
        if (id === spyLB) {
          const spyPoint: Pt = { x: QB.x, y: yUp(20) };
          const rbP = wrPos("RB", tt);
          const rbInMOF = Math.abs(rbP.x - QB.x) < xAcross(8) && rbP.y < yUp(26);
          const target = rbInMOF ? rbP : spyPoint;
          return approach(start, target, 0.20, 0.70);
        }
      }

      const manMap: Partial<Record<DefenderID, ReceiverID>> = {
        CB_L:   "X",
        CB_R:   "Z",
        NICKEL: "SLOT",
        SS:     "TE",
        MIKE:   "RB",
      };
      const key = manMap[id];
      if (key) {
        const target = wrPos(key, tt);
        return approach(start, target, 0.20, 0.90);
      }

      if (cover === "C1") {
        if (id === "FS") {
          const twoL = left2();
          const twoR = right2();
          const pL = wrPos(twoL ?? "SLOT", tt);
          const pR = wrPos(twoR ?? "SLOT", tt);
          const mid = { x: (pL.x + pR.x) / 2, y: Math.min(pL.y, pR.y, yUp(36)) };
          return approach(start, mid, 0.25, 0.65);
        }
        if (id === "WILL" || id === "SAM") {
          const mySide: "left" | "right" =
            id === "SAM" ? (sr ? "left" : "right") : (sr ? "right" : "left");
          const sideFilter = (p: Pt) => (mySide === "left" ? p.x < QB.x : p.x >= QB.x);
          const threats = (["X","Z","SLOT","TE","RB"] as ReceiverID[])
            .map(r => ({ id: r, p: wrPos(r, tt) }))
            .filter(w => sideFilter(w.p));
          const nearest = threats.sort((a,b) =>
            (a.p.x - anchor.x)**2 + (a.p.y - anchor.y)**2 - ((b.p.x - anchor.x)**2 + (b.p.y - anchor.y)**2)
          )[0]?.p ?? anchor;

          const toHook = approach(start, anchor, 0.20, 0.55);
          return approach(toHook, nearest, 0.0, 0.25);
        }
      }

      return approach(start, anchor, 0.2, 0.5);
    }

    /* ZONE */
    if (ZONE_COVERAGES.has(cover)) {
      const p = approach(start, anchor, 0.35, 0.6);

      const threats = (["X","Z","SLOT","TE","RB"] as ReceiverID[]).map(r => ({ id: r, p: wrPos(r, tt) }));
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
      let p = approach(start, anchor, 0.35, 0.6);
      const twoStrong = wrPos(sr ? (right2() ?? "SLOT") : (left2() ?? "SLOT"), tt);
      const oneStrong = wrPos(sr ? (right1() ?? "Z") : (left1() ?? "X"), tt);
      const twoWeak   = wrPos(!sr ? (right2() ?? "SLOT") : (left2() ?? "SLOT"), tt);
      const oneWeak   = wrPos(!sr ? (right1() ?? "Z") : (left1() ?? "X"), tt);

      const isVert = (pt: Pt) => pt.y < yUp(30);

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
          const mid = { x: (myTwo.x + three.x)/2, y: (myTwo.y + three.y)/2 };
          return approach(p, mid, 0.05, 0.35);
        }
        return p;
      }

      if (cover === "PALMS") {
        if ((id === "SS" && sr) || (id === "FS" && !sr)) {
          if (isVert(twoStrong)) p = approach(p, twoStrong, 0.0, 0.40);
        }
        if ((id === "CB_R" && sr) || (id === "CB_L" && !sr)) {
          if (!isVert(twoStrong)) p = approach(p, oneStrong, 0.0, 0.35);
        }
        return p;
      }

      if (cover === "C6") {
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
    const path = O[to];
    if (!path || path.length === 0 || ballFlying) return;

    const p2 = posOnPathLenScaled(path, Math.min(1, t * recSpeed));
    const p0 = { ...QB };
    const mid = { x: (p0.x + p2.x) / 2, y: (p0.y + p2.y) / 2 };
    const arc = Math.min(80, Math.max(40, dist(p0, p2) * 0.15));
    const p1 = { x: mid.x, y: mid.y - arc };

    // Estimate a realistic flight time and convert to play-time fraction
    const flightMs = Math.min(1400, Math.max(600, dist(p0, p2) * 2.2));
    const frac = Math.min(0.6, Math.max(0.2, flightMs / PLAY_MS));

    setBallP0(p0);
    setBallP1(p1);
    setBallP2(p2);
    setBallT(0);
    setCatchAt(null);
    setDecision(to);
    setBallFlying(true);
    setThrowMeta({ p0, p1, p2, tStart: t, frac });
    setCaught(false);
    if (soundOn) playWhistle();
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
          <button onClick={applyAudible} className="px-2 py-1 text-xs rounded-md bg-fuchsia-600/80 text-white">
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

          {/* Offense */}
          {(["X", "Z", "SLOT", "TE", "RB"] as ReceiverID[]).map((rid) => {
            const p = wrPosSafe(rid, t);
            const nr = numbering[rid];
            const badge = nr ? ` (#${nr.number} ${nr.band})` : "";
            const { dx, dy } = labelOffsetFor(rid, p);
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
              </g>
            );
          })}

          {/* Defense */}
          {(["CB_L", "CB_R", "NICKEL", "FS", "SS", "SAM", "MIKE", "WILL"] as DefenderID[]).map((id) => {
            const p = defenderPos(coverage, id, t);
            const { dx, dy } = labelOffsetFor(id, p);
            return (
              <g key={id}>
                <rect x={p.x - 6} y={p.y - 6} width={12} height={12} fill="#ef4444" opacity={0.95} />
                <text
                  x={p.x + dx}
                  y={p.y + dy}
                  className="text-[9px]"
                  fill="rgba(255,255,255,0.95)"
                  stroke="rgba(0,0,0,0.7)"
                  strokeWidth={2}
                  style={{ paintOrder: "stroke" }}
                >
                  {id}
                </text>
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
              onChange={(e) => setT(Number(e.target.value) / 100)}
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

        {/* Audible controls quick row */}
        <div className="flex items-center gap-2 ml-2">
          {audibleOn && (
            <>
              <select
                className="bg-white/10 text-white text-xs rounded-md px-2 py-1"
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
                className="bg-white/10 text-white text-xs rounded-md px-2 py-1"
                value={audRoute}
                onChange={(e) => setAudRoute(e.target.value as RouteKeyword)}
              >
                <option value="">Route…</option>
                {["GO", "SPEED_OUT", "CURL", "DIG", "POST", "CORNER", "SLANT", "WHEEL", "CHECK"].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <button
                onClick={applyAudible}
                className="px-2 py-1 text-xs rounded-md bg-amber-500/90 text-black font-semibold"
                disabled={!audTarget || !audRoute}
                title={!audTarget || !audRoute ? "Pick receiver and route" : "Apply audible"}
              >
                Apply
              </button>
            </>
          )}
        </div>

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
          {/* Throw buttons */}
          {throwButtons.map((to) => {
            const canThrow =
              DECISION_POINTS.some((dp) => Math.abs(t - dp) < 0.08) && phase === "post" && !ballFlying && !decision;
            return (
              <button
                key={to}
                disabled={!canThrow}
                onClick={() => startThrow(to)}
                className={`px-3 py-2 rounded-xl ${
                  canThrow ? "bg-gradient-to-r from-indigo-500 to-fuchsia-500" : "bg-white/10"
                } text-white disabled:opacity-50`}
                title={canThrow ? "Make your read & throw" : "Wait for window"}
              >
                Throw: {to}
              </button>
            );
          })}

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
                {["GO", "SPEED_OUT", "CURL", "DIG", "POST", "CORNER", "SLANT", "WHEEL", "CHECK"].map((r) => (
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

