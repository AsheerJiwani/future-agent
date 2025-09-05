import type { FootballConceptId } from "../data/football/catalog";
import type { CoverageID, ReceiverID, RouteKeyword, Pt, AlignMap } from "../data/football/types";

export type RouteMap = Record<ReceiverID, Pt[]>;

export type PlaySnapshot = {
  conceptId: FootballConceptId;
  coverage: CoverageID;
  formation: string;
  align: AlignMap;
  routes: RouteMap; // already adjusted for leverage
  assignments?: Partial<Record<ReceiverID, RouteKeyword>>;
  numbering?: Record<string, unknown>;
  recSpeed?: number; // 0.6..1.4
  defSpeed?: number; // 0.6..1.4
  rngSeed?: number;
  playId?: number;
};

export type SnapMeta = {
  press?: {
    CB_L?: { outcome: string; rid?: ReceiverID | null };
    CB_R?: { outcome: string; rid?: ReceiverID | null };
  };
  blocks?: {
    blockedDefenders?: string[];
    teBlock?: boolean;
    rbBlock?: boolean;
  };
  roles?: { blitzers?: string[]; spy?: string | null };
  leverage?: Record<ReceiverID, { side: 'inside' | 'outside' | 'even'; via: string }>;
  leverageAdjust?: Record<ReceiverID, { dxYds: number; dDepthYds: number }>;
};

export type ThrowEvent = {
  target: ReceiverID;
  time: number; // 0..1
  windowScore?: number;
  nearestSepYds?: number;
  nearestDefender?: string;
  catchPoint?: Pt;
};

