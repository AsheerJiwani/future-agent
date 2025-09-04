export type CoverageID =
  | "C0" | "C1" | "C2" | "TAMPA2" | "PALMS" | "C3" | "C4" | "QUARTERS" | "C6" | "C9";

export type Personnel = "10"|"11"|"12"|"21"|"22";
export type FormationFamily = "2x2"|"3x1"|"Bunch"|"Trips"|"Empty"|"I"|"OffsetGun";

export type ReadStep = {
  step: number;
  keyDefender?: string;
  if?: string;
  then?: string;
  coachingPoint?: string;
};

export type ReadPlan = {
  vs: CoverageID;
  progression: ReadStep[];
  hotRules?: string[];
  notes?: string[];
};

export type DiagramRoute = {
  label: string; // "X","Z","Y","H","RB","QB"
  color?: string;
  path: Array<{ x: number; y: number }>; // 0..100 coords (offense at bottom)
};

export type Diagram = {
  losY?: number;
  players: Array<{ label: string; x: number; y: number; side: "O"|"D" }>;
  routes: DiagramRoute[];
  coverage?: CoverageID;
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
};
