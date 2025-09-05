export type CoverageID =
  | "C0" | "C1" | "C2" | "TAMPA2" | "PALMS" | "C3" | "C4" | "QUARTERS" | "C6" | "C9";

export type Personnel = "10"|"11"|"12"|"21"|"22";
export type FormationFamily = "2x2"|"3x1"|"Bunch"|"Trips"|"Empty"|"I"|"OffsetGun";

export type ProgressionStep = {
  step: number;
  keyDefender?: string;
  if?: string;
  then?: string;
  coachingPoint?: string;
};

export type ReadPlan = {
  vs: CoverageID;
  progression: ProgressionStep[];
  hotRules?: string[];
  notes?: string[];
};

export type DiagramRoute = {
  label: string; // "X","Z","Y","H","RB","QB"
  color?: string;
  path: Array<{ x: number; y: number }>; // 0..100 coords (offense at bottom)
};

export type ReceiverID = "X" | "Z" | "SLOT" | "TE" | "RB";
export type RouteKeyword =
  // Verticals / seams
  | "GO" | "SEAM" | "BENDER"
  // Quick / underneath
  | "HITCH" | "OUT" | "OUT_LOW" | "OUT_MID" | "OUT_HIGH" | "SPEED_OUT" | "FLAT" | "SLANT" | "CHECK" | "STICK"
  // Intermediate
  | "COMEBACK" | "COMEBACK_LOW" | "COMEBACK_MID" | "COMEBACK_HIGH" | "CURL" | "DIG" | "CROSS"
  // Deep / specials
  | "POST" | "CORNER" | "CORNER_LOW" | "CORNER_MID" | "CORNER_HIGH" | "OVER" | "SHALLOW" | "WHEEL";

export type Pt = { x: number; y: number };
export type AlignMap = Record<ReceiverID, Pt>;

export interface Diagram {
  // ⬇️ make these optional so JSON with only assignments compiles
  players?: Array<{ id: string; label?: string; start?: Pt }>;
  routes?: Partial<Record<ReceiverID, Pt[]>>;
  assignments?: Partial<Record<ReceiverID, RouteKeyword>>;
  align?: Partial<AlignMap>;
  defense?: Partial<Record<CoverageID, Record<string, Pt[]>>>;
};

export type Concept = {
  id: string;
  name: string;
  family: "Quick"|"Dropback"|"PlayAction"|"RPO";
  bestInto: CoverageID[];
  weakInto?: CoverageID[];
  personnel: Personnel[];
  formations: FormationFamily[];
  tags?: string[];
  preSnapKeys?: string[];
  postSnapKeys?: string[];
  footwork?: string;
  readPlans: ReadPlan[];
  commonMistakes?: string[];
  sources?: { title: string; url: string }[];
  diagram?: Diagram;
  coachingPoints?: string[];
};
