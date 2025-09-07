export type KnowledgeItem = {
  id: string;
  title: string;
  tags: string[];
  bullets: string[];
};

export const KNOWLEDGE: KnowledgeItem[] = [
  {
    id: 'COVER3_CORE',
    title: 'Cover 3 — Core Rules',
    tags: ['C3','Cover 3','zone','rotation','SKY','BUZZ','cloud'],
    bullets: [
      'Deep thirds: CB/FS/CB each own outside/middle deep third.',
      'Underneath: curl/flat players widen with #2 to flats; hook defender (MIKE) sinks to 10–12 yds.',
      'Rotations: SKY (safety to curl/flat), BUZZ (safety buzz to curl), CLOUD (corner to flat strong).',
    ],
  },
  {
    id: 'COVER2_CORE',
    title: 'Cover 2 — Core Rules',
    tags: ['C2','Cover 2','Tampa','TAMPA2','flat','hole'],
    bullets: [
      'Half-field safeties cap verticals; corners jam to flats.',
      'TAMPA2: MIKE runs middle at depth (~15–20 yds) to close the hole.',
      'Holes: smash corner vs squat CB; hole shot between safety/corner with timing.',
    ],
  },
  {
    id: 'PALMS_2READ',
    title: 'Palms / 2-Read',
    tags: ['PALMS','2-Read','quarters-match','trap'],
    bullets: [
      'Corner traps #2 to the flat; safety takes #1 vertical.',
      'Great vs quick out/flat; alert slant-flat and smash adjustments.',
    ],
  },
  {
    id: 'SMASH_TEACH',
    title: 'Smash Teaching Points',
    tags: ['SMASH','corner','flat','high-low'],
    bullets: [
      'High–low the flat defender: corner over flat.',
      'Timing: throw flat on rhythm vs off leverage; throw corner as it clears CB/S space.',
    ],
  },
  {
    id: 'QUARTERS_MATCH',
    title: 'Quarters (Match) — Core Rules',
    tags: ['C4','Quarters','match','quarters-match','carry','#2 vertical'],
    bullets: [
      'Safeties read #2: vertical = carry; out = rob curl; in shallow = pass and rob dig/post.',
      'Corners play MOD/MEG depending on #2 release; alert switch vs bunch/trips.',
      'Stressors: four verts, deep over + post, slot fades vs leverage.',
    ],
  },
  {
    id: 'COVER6_QQH',
    title: 'Cover 6 (QQH)',
    tags: ['C6','quarters','half','rotation','QQH'],
    bullets: [
      'Quarters to one side, Cover 2 to the other. Strength call dictates which.',
      'Half side: corner squat/flat; Quarters side: safety read #2 vertical.',
    ],
  },
  {
    id: 'Y_CROSS_TEACH',
    title: 'Y-Cross Teaching Points',
    tags: ['Y_CROSS','cross','dig','shot'],
    bullets: [
      'Read MOF safety; rhythm to crosser, alert post/dig vs rotation.',
      'Vs C3 BUZZ/SKY, find crosser window under hook/curl then alert over route.',
    ],
  },
];

export function pickKnowledge(keys: string[], k = 3): KnowledgeItem[] {
  const toks = new Set(keys.map(s => s.toLowerCase()));
  const scored = KNOWLEDGE.map(item => ({
    item,
    score: item.tags.reduce((acc, t) => acc + (toks.has(t.toLowerCase()) ? 1 : 0), 0)
  }));
  return scored.sort((a,b) => b.score - a.score).slice(0,k).map(s => s.item);
}
