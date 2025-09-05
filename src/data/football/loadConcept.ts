// src/data/football/loadConcept.ts
import type { Concept, Diagram, CoverageID, ReadPlan, Personnel, FormationFamily  } from "./types";
import { CONCEPTS, type FootballConceptId } from "./catalog";

/* ---------- helpers to coerce loose JSON into your strict unions ---------- */

// family: "Quick" | "Dropback" | "PlayAction" | "RPO"
function coerceFamily(v: unknown): Concept["family"] {
  const s = String(v ?? "").toLowerCase().replace(/[\s_-]/g, "");
  if (s === "quick") return "Quick";
  if (s === "dropback") return "Dropback";
  if (s === "playaction" || s === "pa") return "PlayAction";
  if (s === "rpo") return "RPO";
  // fallback: pick a sensible default
  return "Dropback";
}

// generic array coercer that preserves only strings and then casts
function coerceStringArray<T extends string>(v: unknown): T[] {
  return (Array.isArray(v) ? v : [])
    .map((x) => (typeof x === "string" ? (x as T) : undefined))
    .filter(Boolean) as T[];
}

// personnel: Personnel[]  (JSON often has ["11","12",...])
function coercePersonnelList(v: unknown): Personnel[] {
  const arr = coerceStringArray<string>(v);
  // If you have a known whitelist, you can filter it here. For now, trust input.
  return arr as Personnel[];
}

// formations: FormationFamily[] (e.g., ["2x2","3x1","Bunch", ...] depending on your union)
function coerceFormationsList(v: unknown): FormationFamily[] {
  const arr = coerceStringArray<string>(v);
  return arr as FormationFamily[];
}

// readPlans: Accept either an array of ReadPlan, or a Record<CoverageID, ReadPlan>
// If it's a record, convert to array and attach the coverage key if missing.
function coerceReadPlans(v: unknown): ReadPlan[] {
  if (Array.isArray(v)) return v as ReadPlan[];
  if (v && typeof v === "object") {
    const out: ReadPlan[] = [];
    for (const [cov, plan] of Object.entries(v as Record<string, unknown>)) {
      if (plan && typeof plan === "object") {
        const p = plan as any;
        // ensure coverage is present on the ReadPlan if your type expects it
        if (!("coverage" in p)) p.coverage = cov as CoverageID;
        out.push(p as ReadPlan);
      }
    }
    return out;
  }
  return [];
}


/* ---------------- Normalizers: make sparse JSON safe as Concept ---------------- */

function normalizeDiagram(d?: Partial<Diagram>): Diagram {
  return {
    players: d?.players ?? [],
    routes: d?.routes ?? {},
    assignments: d?.assignments ?? {},
    align: d?.align ?? {},
    defense: d?.defense ?? {},
  };
}

function normalizeConcept(raw: unknown): Concept {
  const r = raw as any;

  return {
    id: String(r?.id ?? r?.name ?? "UNKNOWN"),
    name: String(r?.name ?? r?.id ?? "Unknown Concept"),

    // ✅ fix family union
    family: coerceFamily(r?.family),

    diagram: normalizeDiagram(r?.diagram),

    // coverage fit lists
    bestInto: (r?.bestInto ?? []) as CoverageID[],
    weakInto: (r?.weakInto ?? []) as CoverageID[],

    // ✅ fix union arrays
    personnel: coercePersonnelList(r?.personnel),
    formations: coerceFormationsList(r?.formations),

    tags: coerceStringArray<string>(r?.tags),
    coachingPoints: coerceStringArray<string>(r?.coachingPoints),

    // ✅ accept array or record then normalize to ReadPlan[]
    readPlans: coerceReadPlans(r?.readPlans),

    sources: (r?.sources ?? []) as Array<{ title: string; url: string; date?: string }>,
  };
}

/* ---------------- Helpers to resolve filenames ---------------- */

function toSnake(id: string) {
  return id.toLowerCase().replace(/[\s-]+/g, "_");
}

const ID_TO_SLUG: Record<FootballConceptId, string> = CONCEPTS.reduce(
  (acc, c) => ((acc[c.id as FootballConceptId] = c.slug), acc),
  {} as Record<FootballConceptId, string>
);

/** If you ever have an odd filename, map it here (takes precedence). */
const FILE_OVERRIDES: Partial<Record<FootballConceptId, string>> = {
  // Example overrides (not strictly needed given your note):
  // BOOT_FLOOD: "boot_flood.json",
  // Y_CROSS: "y_cross.json",
};

function candidateFiles(id: FootballConceptId): string[] {
  const override = FILE_OVERRIDES[id];
  if (override) return [override];

  const slug = ID_TO_SLUG[id];                   // from catalog
  const fromSlug = `${slug}.json`;               // e.g., "four_verts.json"
  const fromSnake = `${toSnake(id)}.json`;       // e.g., "four_verts.json"
  // De-dupe while preserving order
  return Array.from(new Set([fromSlug, fromSnake]));
}

async function tryImport(file: string): Promise<any | undefined> {
  try {
    const mod = await import(
      /* webpackMode: "lazy", webpackChunkName: "concepts" */ `./concepts/${file}`
    );
    return mod?.default ?? mod;
  } catch {
    return undefined;
  }
}

/* ---------------- Public API ---------------- */

export async function loadConcept(id: FootballConceptId): Promise<Concept> {
  const candidates = candidateFiles(id);
  for (const file of candidates) {
    const raw = await tryImport(file);
    if (raw) return normalizeConcept(raw);
  }
  throw new Error(
    `No JSON found for concept "${id}". Tried: ${candidates.join(
      ", "
    )}. Ensure a matching file exists in src/data/football/concepts/.`
  );
}
