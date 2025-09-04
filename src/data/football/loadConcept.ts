import type { Concept } from "./types";
import type { FootballConceptId } from "./catalog";

/**
 * Map each concept ID to a lazy JSON import.
 * Ensure a matching JSON file exists in: src/data/football/concepts/
 * (e.g., ./concepts/smash.json)
 */
export const CONCEPT_IMPORTERS: Record<FootballConceptId, () => Promise<Concept>> = {
  // Core set
  SMASH:        async () => (await import("./concepts/smash.json")).default as Concept,
  SAIL:         async () => (await import("./concepts/sail.json")).default as Concept,
  MESH:         async () => (await import("./concepts/mesh.json")).default as Concept,
  STICK:        async () => (await import("./concepts/stick.json")).default as Concept,
  DAGGER:       async () => (await import("./concepts/dagger.json")).default as Concept,
  FOUR_VERTS:   async () => (await import("./concepts/four_verts.json")).default as Concept,
  Y_CROSS:      async () => (await import("./concepts/y_cross.json")).default as Concept,
  SHALLOW:      async () => (await import("./concepts/shallow.json")).default as Concept,
  CURL_FLAT:    async () => (await import("./concepts/curl_flat.json")).default as Concept,

  // New additions (make sure these files exist before building)
  SLANT_FLAT:   async () => (await import("./concepts/slant_flat.json")).default as Concept,
  SPACING:      async () => (await import("./concepts/spacing.json")).default as Concept,
  LEVELS:       async () => (await import("./concepts/levels.json")).default as Concept,
  MILLS:        async () => (await import("./concepts/mills.json")).default as Concept,
  YANKEE:       async () => (await import("./concepts/yankee.json")).default as Concept,
  POST_WHEEL:   async () => (await import("./concepts/post_wheel.json")).default as Concept,
  STICK_NOD:    async () => (await import("./concepts/stick_nod.json")).default as Concept,
  TUNNEL_SCREEN:async () => (await import("./concepts/tunnel_screen.json")).default as Concept,
  GLANCE_RPO:   async () => (await import("./concepts/glance_rpo.json")).default as Concept,
  BOOT_FLOOD:   async () => (await import("./concepts/boot_flood.json")).default as Concept
};

export async function loadConcept(id: FootballConceptId): Promise<Concept> {
  const loader = CONCEPT_IMPORTERS[id];
  if (!loader) {
    throw new Error(`Unknown concept id: ${id}`);
  }
  return loader();
}
