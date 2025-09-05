// src/data/football/loadConcept.ts
import type {
  Concept,
  Diagram,
  CoverageID,
  ReadPlan,
  Personnel,
  FormationFamily,
} from "./types";
import { CONCEPTS, type FootballConceptId } from "./catalog";

/* ------------------ small type guards & helpers ------------------ */
function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

type SourceLink = { title: string; url: string; date?: string };

function coerceStringArray<T extends string>(v: unknown): T[] {
  return (Array.isArray(v) ? v : [])
    .map((x) => (typeof x === "string" ? (x as T) : undefined))
    .filter((x): x is T => Boolean(x));
}

/* ------------------ union coercers (strict types) ------------------ */
// "Quick" | "Dropback" | "PlayAction" | "RPO"
function coerceFamily(v: unknown): Concept["family"] {
  const s = String(v ?? "").toLowerCase().replace(/[\s_-]/g, "");
  if (s === "quick") return "Quick";
  if (s === "dropback") return "Dropback";
  if (s === "playaction" || s === "pa") return "PlayAction";
  if (s === "rpo") return "RPO";
  return "Dropback";
}

function coercePersonnelList(v: unknown): Personnel[] {
  // If your Personnel union is stricter (e.g. "11" | "12" | ...), you can filter/translate here.
  return coerceStringArray<string>(v) as Personnel[];
}

function coerceFormationsList(v: unknown): FormationFamily[] {
  return coerceStringArray<string>(v) as FormationFamily[];
}

function coerceSources(v: unknown): SourceLink[] {
  if (!Array.isArray(v)) return [];
  const out: SourceLink[] = [];
  for (const it of v) {
    if (isObject(it)) {
      const title = typeof it.title === "string" ? it.title : "source";
      const url = typeof it.url === "string" ? it.url : "";
      const date = typeof it.date === "string" ? it.date : undefined;
      if (url) out.push({ title, url, date });
    }
  }
  return out;
}

// Accept array of ReadPlan, or a record keyed by coverage → ReadPlan
function coerceReadPlans(v: unknown): ReadPlan[] {
  if (Array.isArray(v)) {
    // Array form already matches; just trust/guard objects
    return v.filter((x): x is ReadPlan => typeof x === "object" && x !== null);
  }

  if (typeof v === "object" && v !== null) {
    const out: ReadPlan[] = [];

    for (const [cov, plan] of Object.entries(v)) {
      if (typeof plan === "object" && plan !== null) {
        // Work on a mutable copy to avoid adding unknown keys to a type
        const obj = { ...(plan as Record<string, unknown>) };

        // Only set coverage if the JSON doesn't have it already
        if (obj.coverage === undefined) {
          // If your ReadPlan type includes 'coverage', this is fine.
          // If it doesn't, TS still allows the cast because we remove the key in the cast.
          obj.coverage = cov as CoverageID;
        }

        // Finally cast to ReadPlan; if your ReadPlan type doesn't include 'coverage',
        // you can drop it from the object at this point:
        const { coverage: _dropIfNotInType, ...rest } = obj;
        const candidate = ("coverage" in ({} as ReadPlan)) ? (obj as unknown as ReadPlan)
                                                           : (rest as unknown as ReadPlan);

        out.push(candidate);
      }
    }
    return out;
  }

  return [];
}
/* ------------------ diagram & concept normalizers ------------------ */
function normalizeDiagram(d?: unknown): Diagram {
  const dd = isObject(d) ? (d as Partial<Diagram>) : undefined;
  return {
    players: dd?.players ?? [],
    routes: dd?.routes ?? {},
    assignments: dd?.assignments ?? {},
    align: dd?.align ?? {},
    defense: dd?.defense ?? {},
  };
}

type LooseConcept = {
  id?: unknown;
  name?: unknown;
  family?: unknown;
  diagram?: unknown;
  bestInto?: unknown;
  weakInto?: unknown;
  personnel?: unknown;
  formations?: unknown;
  tags?: unknown;
  readPlans?: unknown;
  sources?: unknown;
};

function normalizeConcept(raw: unknown): Concept {
  const r = (raw ?? {}) as LooseConcept;

  return {
    id: String(r.id ?? (isObject(raw) && "name" in (raw as object) ? (raw as Record<string, unknown>).name : "UNKNOWN")),
    name: String(r.name ?? (isObject(raw) && "id" in (raw as object) ? (raw as Record<string, unknown>).id : "Unknown Concept")),
    family: coerceFamily(r.family),
    diagram: normalizeDiagram(r.diagram),

    bestInto: (Array.isArray(r.bestInto) ? (r.bestInto as CoverageID[]) : []) as CoverageID[],
    weakInto: (Array.isArray(r.weakInto) ? (r.weakInto as CoverageID[]) : []) as CoverageID[],

    personnel: coercePersonnelList(r.personnel),
    formations: coerceFormationsList(r.formations),
    tags: coerceStringArray<string>(r.tags),

    readPlans: coerceReadPlans(r.readPlans),
    sources: coerceSources(r.sources),
  };
}

/* ------------------ filename resolution (hybrid) ------------------ */
function toSnake(id: string) {
  return id.toLowerCase().replace(/[\s-]+/g, "_");
}

const ID_TO_SLUG: Record<FootballConceptId, string> = CONCEPTS.reduce(
  (acc, c) => {
    acc[c.id as FootballConceptId] = c.slug;
    return acc;
  },
  {} as Record<FootballConceptId, string>
);

/** optional explicit overrides if a file is oddly named */
const FILE_OVERRIDES: Partial<Record<FootballConceptId, string>> = {
  // example: BOOT_FLOOD: "boot_flood.json",
};

function candidateFiles(id: FootballConceptId): string[] {
  const override = FILE_OVERRIDES[id];
  if (override) return [override];

  const slug = ID_TO_SLUG[id];
  const fromSlug = `${slug}.json`;
  const fromSnake = `${toSnake(id)}.json`;
  return Array.from(new Set([fromSlug, fromSnake]));
}

async function tryImport(file: string): Promise<unknown | undefined> {
  try {
    const mod = await import(
      /* webpackMode: "lazy", webpackChunkName: "concepts" */ `./concepts/${file}`
    );
    // JSON modules export their content on .default in Next/TS config
    return (mod as Record<string, unknown>)?.default ?? mod;
  } catch {
    return undefined;
  }
}

/* ------------------ public API ------------------ */
export async function loadConcept(id: FootballConceptId): Promise<Concept> {
  const candidates = candidateFiles(id);
  for (const file of candidates) {
    const raw = await tryImport(file);
    if (raw) return normalizeConcept(raw);
  }
  throw new Error(
    `No JSON found for concept "${id}". Tried: ${candidates.join(
      ", "
    )}. Ensure the file exists in src/data/football/concepts/.`
  );
}
