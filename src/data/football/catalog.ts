export const CONCEPTS = [
  // Core set
  { id: "SMASH",        name: "Smash",                     slug: "smash" },
  { id: "SAIL",         name: "Sail / Flood",              slug: "sail" },
  { id: "MESH",         name: "Mesh",                      slug: "mesh" },
  { id: "STICK",        name: "Stick (Quick)",             slug: "stick" },
  { id: "DAGGER",       name: "Dagger",                    slug: "dagger" },
  { id: "FOUR_VERTS",   name: "Four Verticals",            slug: "four_verts" },
  { id: "Y_CROSS",      name: "Y-Cross",                   slug: "y_cross" },
  { id: "SHALLOW",      name: "Shallow Cross",             slug: "shallow" },
  { id: "CURL_FLAT",    name: "Curl-Flat (Quick)",         slug: "curl_flat" },

  // New additions
  { id: "SLANT_FLAT",   name: "Slant-Flat",                slug: "slant_flat" },
  { id: "SPACING",      name: "Spacing (Snag)",            slug: "spacing" },
  { id: "LEVELS",       name: "Levels",                    slug: "levels" },
  { id: "MILLS",        name: "Mills (Post-Dig)",          slug: "mills" },
  { id: "YANKEE",       name: "Yankee (PA Cross-Post)",    slug: "yankee" },
  { id: "POST_WHEEL",   name: "Post-Wheel",                slug: "post_wheel" },
  { id: "STICK_NOD",    name: "Stick-Nod (Stick-Go)",      slug: "stick_nod" },
  { id: "TUNNEL_SCREEN",name: "Tunnel Screen",             slug: "tunnel_screen" },
  { id: "GLANCE_RPO",   name: "Glance RPO",                slug: "glance_rpo" },
  { id: "BOOT_FLOOD",   name: "Boot Flood (PA)",           slug: "boot_flood" }
] as const;

export type FootballConceptId = typeof CONCEPTS[number]["id"];
