export type KnowledgeItem = {
  id: string;
  title: string;
  tags: string[];
  bullets: string[];
  sources?: { title: string; url: string }[];
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
    sources: [
      { title: 'TCU/Aranda C3 teach', url: 'https://matchquarters.com' },
      { title: 'Nick Saban C3 Buzz notes', url: 'https://www.footballdx.com' }
    ]
  },
  {
    id: 'TRIPS_SOLO_POACH_VARIANTS',
    title: 'Trips (3x1) — SOLO/POACH variants',
    tags: ['TRIPS','3x1','SOLO','POACH','quarters','C4','C3','boundary','X iso'],
    bullets: [
      'SOLO: boundary corner isolated on X; weak safety poaches #3 vertical to deny seams.',
      'Versus SOLO, isolate X on boundary with comebacks/digs; or stress poach with #3 bender.',
      'POACH to strength: strong safety brackets #3 on vertical/over; attack opposite curl/flat with flood.',
    ],
  },
  {
    id: 'TRIPS_XISO_MENU',
    title: 'Trips (3x1) — X iso menu',
    tags: ['TRIPS','3x1','X iso','boundary','man','leverage'],
    bullets: [
      'Boundary X vs off or soft press: comeback, curl, glance based on leverage.',
      'If press with no post help (C0/C1), use slant/fade and rub with back or TE across formation.',
      'If safety shaded to X, work trips side flood or seams; don’t force boundary go vs help.',
    ],
  },
  {
    id: 'TRIPS_C6_QQH',
    title: 'Cover 6 (QQH) to Trips',
    tags: ['TRIPS','C6','QQH','quarters','half','rotation'],
    bullets: [
      'Quarters to trips: safety reads #2/#3; half to X isolates boundary corner in squat/flat.',
      'Exploit half side with hole shots/comeback; to trips, stress seams and deep over under quarters rules.',
      'Motion #3 to force checks and open bender window; flood to half side for curl/flat conflict.',
    ],
  },
  {
    id: 'MOTION_EFFECTS_C3',
    title: 'Motion — effects on Cover 3 rotations',
    tags: ['motion','orbit','jet','C3','rotation','SKY','BUZZ','cloud'],
    bullets: [
      'Fast motion across strength can flip SKY↔CLOUD or push rotation — snap on the move to out‑leverage flat defender.',
      'Jet to trips forces kick/push rules; run quick access (now) or flat away from rotation.',
      'Orbit into boundary widens curl/flat — hit corner or flat in vacated zone.',
    ],
  },
  {
    id: 'MOTION_EFFECTS_QUARTERS',
    title: 'Motion — Quarters adjustments',
    tags: ['motion','C4','quarters','switch','cut','MOD','MEG'],
    bullets: [
      'Across‑the‑ball motion induces switch/cut calls; create free releases and switch verticals to stress rules.',
      'Short motion to compress split eases inside access on slants/glance; or widen to create outside fade space.',
      'Motion #3 late forces poach decisions; hit seam/bender before safety carries.',
    ],
  },
  {
    id: 'HOT_REPLACE_FIREZONE',
    title: 'Hot/Replace vs Fire Zone (3 under, 3 deep)',
    tags: ['hot','pressure','fire zone','C3','replace','slant','flat'],
    bullets: [
      'Identify dropped DL/edge to flat — replace with quick out/flat; avoid throwing hot into buzz/hook late.',
      'Slant/flat and stick beat 3‑under if ball is on rhythm; find hot off blitz side and throw through window.',
    ],
  },
  {
    id: 'HOT_RULES_DOUBLE_A',
    title: 'Hot/Replace vs Double‑A pressures',
    tags: ['hot','pressure','double A','C1','zero','RB','check‑release'],
    bullets: [
      'Versus Double‑A, keep RB in if needed; throw hot replacing blitz with glance/quick in‑breaker.',
      'If zero, immediate rubs/stacks win — avoid deep drops; protect edges with quicks and move the spot.',
    ],
  },
  {
    id: 'HOT_RULES_NICKEL',
    title: 'Hot/Replace vs Nickel pressure',
    tags: ['hot','nickel','pressure','slot','replace','quick'],
    bullets: [
      'Nickel off slot — replace with quick access to slot (now/hitch) or flat by #2.',
      'Sight adjust: slot fade vs press nickel in C1; swing away from pressure for easy outlet.',
    ],
  },
  {
    id: 'LEVERAGE_TE_VS_SS',
    title: 'Route leverage — TE vs SS',
    tags: ['TE','SS','leverage','stick','corner','seam'],
    bullets: [
      'Inside‑shade SS: stick/out leverage wins; outside‑shade SS: work seam/bender inside post safety.',
      'Press SS: use quick stick‑nod or fade‑stop; avoid late balls vs collision at 8–10 yards.',
    ],
  },
  {
    id: 'LEVERAGE_RB_WHEEL_VS_LB',
    title: 'Route leverage — RB Wheel vs LB',
    tags: ['RB','wheel','LB','man','seam','leverage'],
    bullets: [
      'LB inside leverage: swing first to widen, climb to wheel up sideline — throw with air away from trail.',
      'Vs zone curl/flat, wheel clears for corner/dig; throw if flat jumps and safety is capped.',
    ],
  },
  {
    id: 'LEVERAGE_SLOT_VS_NICKEL',
    title: 'Route leverage — Slot vs Nickel',
    tags: ['slot','nickel','leverage','option','choice','stick'],
    bullets: [
      'Inside leverage: option out/pivot; outside leverage: option in/stick — decide off hips at 5–6 yds.',
      'Against zone, settle immediately in soft windows; don’t drift into hook defenders.',
    ],
  },
  {
    id: 'REDZONE_SPACING',
    title: 'Red Zone — spacing and timing',
    tags: ['red zone','spacing','choice','fade','pick'],
    bullets: [
      'Compress splits; decisions must be on time — spacing/choice with pick elements beat tight windows.',
      'Throw fade only with elite leverage; otherwise target quick out/under and RB angle inside.',
    ],
  },
  {
    id: 'BACKED_UP_SHOT_MENU',
    title: 'Backed Up — shot/escape menu',
    tags: ['backed up','shot','escape','playaction'],
    bullets: [
      'Move the pocket (boot/naked) to buy air; shot calls like Yankee if protection is trusted.',
      'Avoid negative plays; quick outs and slants to escape shadow of goalpost.',
    ],
  },
  {
    id: 'TWO_MINUTE_PROGRESSION',
    title: 'Two‑Minute — quick progression rules',
    tags: ['2‑minute','tempo','clock','sideline','hash'],
    bullets: [
      'Sideline outs and quick curls to stop clock; read hash leverage to hit seams if MOF open.',
      'RB check‑release to swing/angle as last window; avoid sacks, throwaways are wins.',
    ],
  },
  {
    id: 'THIRD_MEDIUM_MENU',
    title: '3rd‑and‑Medium — call sheet menu',
    tags: ['3rd down','medium','man','zone','rub','spacing'],
    bullets: [
      'Versus man: mesh, shallow, rub outs; versus zone: spacing/stick and dagger/dig windows.',
      'Use quick motions/stacks to break press and pre‑declare leverage.',
    ],
  },
  {
    id: 'QUARTERS_MOD_MEG',
    title: 'Quarters Calls — MOD/MEG specifics',
    tags: ['QUARTERS','C4','MOD','MEG','rules','#2','vertical'],
    bullets: [
      'MOD: Corner plays man on deep (MOD) on #1 if #2 is under; pass off shallow #2 and rob curl.',
      'MEG: Corner has man everywhere he goes on #1; safety handles #2 vertical/cross per rules.',
      'Versus stacked/bunch: check switch/cut calls to handle fast outs and seams.',
    ],
    sources: [{ title: 'MOD/MEG rules', url: 'https://matchquarters.com' }]
  },
  {
    id: 'PALMS_TRIGGERS',
    title: 'Palms (2‑Read) Triggers by Formation/Routes',
    tags: ['PALMS','2-Read','triggers','#2','flat','out','smash','slant-flat'],
    bullets: [
      '#2 out/flat triggers corner trap; safety tops #1 vertical — stress with double moves and smash corner.',
      'Trips: to 3x1, check mini/poach calls on #3 vertical; manipulate with seams and benders.',
    ],
    sources: [{ title: '2‑Read triggers', url: 'https://matchquarters.com' }]
  },
  {
    id: 'TRIPS_CHECKS_C3',
    title: '3x1 Trips Checks — Cover 3',
    tags: ['TRIPS','3x1','C3','checks','poach','kick','push'],
    bullets: [
      'Kick/push rotation to strength; nickel carries #2, safety inserts to poach #3 vertical.',
      'Stress seam by #3 (bender) and deep over; flood opposite to out‑leverage curl/flat.',
    ],
    sources: [{ title: 'Trips C3 checks', url: 'https://matchquarters.com' }]
  },
  {
    id: 'TRIPS_CHECKS_QUARTERS',
    title: '3x1 Trips Checks — Quarters',
    tags: ['TRIPS','3x1','quarters','poach','solo','bracket'],
    bullets: [
      'SOLO/POACH: weak safety poaches #3 vertical; boundary corner isolates on #1.',
      'Bracket #3 on strong; attack with switch verticals, cross/post, and RB swing flood.',
    ],
    sources: [{ title: 'Trips Quarters checks', url: 'https://matchquarters.com' }]
  },
  {
    id: 'TIMING_STICK',
    title: 'Timing — Stick',
    tags: ['STICK','timing','depth','rhythm','quick'],
    bullets: [
      'Stick at ~5–6 yards; ball out on third step (gun) to stick vs inside leverage or flat vs outside leverage.',
      'Avoid hitching — late balls invite undercuts by curl defenders.',
    ],
    sources: [{ title: 'Stick rhythm', url: 'https://www.shakinthesouthland.com' }]
  },
  {
    id: 'TIMING_CURL_FLAT',
    title: 'Timing — Curl‑Flat',
    tags: ['CURL_FLAT','timing','depth','curl','flat'],
    bullets: [
      'Curl at 12–14; throw flat on rhythm to widen squat/curl‑flat defender then reset to curl sitting between hook zones.',
      'Vs man, snap curl away from leverage; vs zone, sit soft and don’t drift.',
    ],
    sources: [{ title: 'Curl‑Flat timing', url: 'https://www.xandolabs.com' }]
  },
  {
    id: 'PRESS_TECHNIQUE',
    title: 'Defensive Technique — Press Outcomes',
    tags: ['press','jam','release','WR','CB','timing'],
    bullets: [
      'Press can delay route stem (jam/lock) or miss (whiff) — expect timing offsets on boundary routes.',
      'Beat with stacks/bunch, motion, or inside/outside releases planned for leverage.',
    ],
    sources: [{ title: 'Press techniques', url: 'https://www.footballdx.com' }]
  },
  {
    id: 'CORNER_TECHNIQUE',
    title: 'Corner Technique — Squat vs Soft Press',
    tags: ['corner','squat','soft press','trap','flat'],
    bullets: [
      'Squat: eyes to #2 and flat; susceptible to corner over flat (Smash).',
      'Soft press: bail technique — attack with comebacks/curls breaking back to ball.',
    ],
    sources: [{ title: 'Corner technique', url: 'https://www.shakinthesouthland.com' }]
  },
  {
    id: 'RB_MATCH_RULES',
    title: 'RB Match Rules — Man vs Zone',
    tags: ['RB','match','C1','C0','zone','hook','spy'],
    bullets: [
      'In C1/C0, RB matched by LB (MIKE/WILL) — convert to checkdown vs man; use wheel vs mismatch.',
      'In zone, hook defenders eye RB — use spot/swing to manipulate underneath windows.',
    ],
    sources: [{ title: 'RB match rules', url: 'https://www.usafootball.com' }]
  },
  {
    id: 'BUNCH_RULES',
    title: 'Bunch — Coverage Rules & Stressors',
    tags: ['bunch','stack','switch','banjo','match'],
    bullets: [
      'Defenses use banjo/switch calls vs bunch; stress by fast 7‑route and flat underneath (Flood).',
      'Cross and return (pivot/spin) routes defeat trail man and match rules.',
    ],
    sources: [{ title: 'Bunch rules', url: 'https://matchquarters.com' }]
  },
  {
    id: 'C1_MANFREE',
    title: 'Cover 1 (Man‑Free) — Core Rules',
    tags: ['C1','Cover 1','man','free','leverage','press'],
    bullets: [
      'Single‑high free safety; corners and nickel in man with inside/out leverage rules.',
      'RB matched by MIKE/WILL; TE often by SS; use rubs, stacks, and crossers.',
      'Alert pressure; hot answers replace blitz (slant/flat, stick, glance).',
    ],
    sources: [{ title: 'Man‑free basics', url: 'https://matchquarters.com' }]
  },
  {
    id: 'C0_ZERO',
    title: 'Cover 0 (Zero) — Pressure',
    tags: ['C0','Cover 0','zero','man','pressure','hot'],
    bullets: [
      'All man, no post safety; pressure likely — beat with quicks and picks.',
      'Hot: replace blitz with slant/flat, glance, shallow, quick outs.',
      'Shots require max protection or built‑in answers (slot fade vs press).',
    ],
    sources: [{ title: 'Zero pressure answers', url: 'https://www.xandolabs.com' }]
  },
  {
    id: 'C9_MATCH',
    title: 'Cover 9 (Quarters Match / 3‑Match)',
    tags: ['C9','quarters','match','3-match','pattern'],
    bullets: [
      'Match rules rotate to trips; weak corner plays deep third, strong side matches routes.',
      'Stress with 3x1: over routes, switch releases, seams by #3.',
    ],
    sources: [{ title: 'C9 match', url: 'https://matchquarters.com' }]
  },
  {
    id: 'C2_TRAP_CLOUD',
    title: 'Cover 2 Trap / Cloud',
    tags: ['C2','trap','cloud','corner','flat','smash'],
    bullets: [
      'Corner squats/traps out/flat; safety caps #1 vertical — bait corner/flat throws.',
      'Smash: flat first to widen squat, then hole shot corner as safety stays wide.',
    ],
    sources: [{ title: 'C2 trap', url: 'https://www.shakinthesouthland.com' }]
  },
  {
    id: 'SPACING_SNAG',
    title: 'Spacing / Snag — Teaching Points',
    tags: ['SPACING','SNAG','spot','flat','corner','triangle'],
    bullets: [
      'Triangle read: spot/snag, flat, corner — settle in zone windows.',
      'Vs man: rub to flat; vs zone: sit soft spot quickly; avoid holding.',
    ],
    sources: [{ title: 'Spacing triangle', url: 'https://www.runthepower.com' }]
  },
  {
    id: 'LEVELS',
    title: 'Levels — Teaching Points',
    tags: ['LEVELS','dig','in','cross','C3','quarters'],
    bullets: [
      'High‑low the hook/curl with dig over shallow/in; alert crosser vs man.',
      'Vs C3/BUZZ: throw dig behind buzz; vs Quarters: work crosser window.',
    ],
    sources: [{ title: 'Levels concept', url: 'https://www.xandolabs.com' }]
  },
  {
    id: 'SHALLOW',
    title: 'Shallow Cross — Teaching Points',
    tags: ['SHALLOW','cross','man','mesh','C1'],
    bullets: [
      'Shallow under hook; sit vs zone; win vs man with speed and rub.',
      'Look high‑low shallow to dig/curl; avoid late balls crossing MOF.',
    ],
    sources: [{ title: 'Shallow cross', url: 'https://www.runthepower.com' }]
  },
  {
    id: 'POST_WHEEL',
    title: 'Post‑Wheel — Teaching Points',
    tags: ['POST_WHEEL','wheel','post','C2','trap','quarters'],
    bullets: [
      'Wheel exploits flat defenders; post occupies safety — throw wheel vs trap/curl‑flat conflict.',
      'Alert coverage carry: vs Quarters, safety may carry #2 vertical (wheel).',
    ],
    sources: [{ title: 'Post‑Wheel', url: 'https://www.shakinthesouthland.com' }]
  },
  {
    id: 'YANKEE_PA',
    title: 'Yankee (PA Cross‑Post) — Teaching Points',
    tags: ['YANKEE','playaction','over','post','shot'],
    bullets: [
      'Deep over + post shot vs MOF closed; hit over vs sinking post safety; throw post if FS jumps over.',
      'Needs protection and sell; don’t force post vs carry ‑ find over crosser.',
    ],
    sources: [{ title: 'Yankee PA', url: 'https://www.xandolabs.com' }]
  },
  {
    id: 'GLANCE_RPO',
    title: 'Glance RPO — Teaching Points',
    tags: ['GLANCE','RPO','slant','C1','C0','box'],
    bullets: [
      'Read apex / box count; attach glance vs single‑high and soft inside leverage.',
      'If apex inserts, pull and throw glance; else handoff into light box.',
    ],
    sources: [{ title: 'Glance RPO', url: 'https://www.runthepower.com' }]
  },
  {
    id: 'BOOT_FLOOD_PA',
    title: 'Boot Flood (PA) — Teaching Points',
    tags: ['BOOT_FLOOD','playaction','flood','naked','flat'],
    bullets: [
      'Move the launch point; 3‑level stretch with flat, over, and deep crosser/corner.',
      'Versus zone, hit flat early then over; versus man, leverage crossers and throw on the move.',
    ],
    sources: [{ title: 'Boot Flood', url: 'https://www.runthepower.com' }]
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
    sources: [
      { title: 'Tampa-2 overview', url: 'https://en.wikipedia.org/wiki/Tampa_2' }
    ]
  },
  {
    id: 'PALMS_2READ',
    title: 'Palms / 2-Read',
    tags: ['PALMS','2-Read','quarters-match','trap'],
    bullets: [
      'Corner traps #2 to the flat; safety takes #1 vertical.',
      'Great vs quick out/flat; alert slant-flat and smash adjustments.',
    ],
    sources: [
      { title: '2-Read / Palms', url: 'https://matchquarters.com' }
    ]
  },
  {
    id: 'SMASH_TEACH',
    title: 'Smash Teaching Points',
    tags: ['SMASH','corner','flat','high-low'],
    bullets: [
      'High–low the flat defender: corner over flat.',
      'Timing: throw flat on rhythm vs off leverage; throw corner as it clears CB/S space.',
    ],
    sources: [
      { title: 'Smash concept', url: 'https://www.shakinthesouthland.com/2010/7/14/1567851/film-room-smash' }
    ]
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
    sources: [
      { title: 'Quarters match overview', url: 'https://matchquarters.com' }
    ]
  },
  {
    id: 'COVER6_QQH',
    title: 'Cover 6 (QQH)',
    tags: ['C6','quarters','half','rotation','QQH'],
    bullets: [
      'Quarters to one side, Cover 2 to the other. Strength call dictates which.',
      'Half side: corner squat/flat; Quarters side: safety read #2 vertical.',
    ],
    sources: [
      { title: 'Cover 6 basics', url: 'https://www.footballstudyhall.com/2016/8/15/12485528/cover-6' }
    ]
  },
  {
    id: 'Y_CROSS_TEACH',
    title: 'Y-Cross Teaching Points',
    tags: ['Y_CROSS','cross','dig','shot'],
    bullets: [
      'Read MOF safety; rhythm to crosser, alert post/dig vs rotation.',
      'Vs C3 BUZZ/SKY, find crosser window under hook/curl then alert over route.',
    ],
    sources: [
      { title: 'Air Raid Y-Cross', url: 'https://www.usafootball.com/blogs/football-coaching/post/10318/air-raid-y-cross' }
    ]
  },
  {
    id: 'C3_SKY',
    title: 'Cover 3 SKY rotation',
    tags: ['C3','SKY','rotation','curl-flat','safety'],
    bullets: [
      'Safety rotates to curl/flat; slot/OLB carries hook/curl opposite.',
      'Alert curl/flat conflict: sail/flood stresses the rotating safety.',
    ],
    sources: [{ title: 'C3 Sky vs Flood', url: 'https://matchquarters.com' }]
  },
  {
    id: 'C3_BUZZ',
    title: 'Cover 3 BUZZ rotation',
    tags: ['C3','BUZZ','rotation','hook','curl'],
    bullets: [
      'Safety buzzes down into hook/curl; flat defender expands to the flat.',
      'Alert dig/curl windows behind buzzing safety; dagger/dig concepts timed under FS.',
    ],
    sources: [{ title: 'C3 Buzz overview', url: 'https://www.xandolabs.com' }]
  },
  {
    id: 'C3_CLOUD_STRONG',
    title: 'Cover 3 CLOUD (strong)',
    tags: ['C3','CLOUD','corner-flat','rotation','strong'],
    bullets: [
      'Strong corner to flat; safety caps over #1. Weak corner plays deep third.',
      'Alert switch releases vs cloud; smash/flat control stresses squat corner.',
    ],
    sources: [{ title: 'Cloud rotation', url: 'https://matchquarters.com' }]
  },
  {
    id: 'FOUR_VERTS',
    title: 'Four Verticals (2x2) — Teaching Points',
    tags: ['FOUR_VERTS','verts','seam','MOF','C3','C2','QUARTERS'],
    bullets: [
      'Vs MOF closed (C1/C3): attack seams; rhythm to inside seam based on hook drops.',
      'Vs MOF open (C2/C4): stress safeties with benders; alert hole shot vs squat corners.',
    ],
    sources: [{ title: 'Four Verts', url: 'https://www.xandolabs.com' }]
  },
  {
    id: 'MILLS_POST_DIG',
    title: 'Mills (Post-Dig) — Teaching Points',
    tags: ['MILLS','post','dig','shot','C3','BUZZ','quarters'],
    bullets: [
      'Clear FS with post; throw dig behind buzzing safety or hook dropper.',
      'Timing: reset to dig as post occupies middle; avoid late throws vs carry safety.',
    ],
    sources: [{ title: 'Mills concept', url: 'https://www.runthepower.com' }]
  },
  {
    id: 'SAIL_FLOOD',
    title: 'Sail / Flood — Teaching Points',
    tags: ['SAIL','FLOOD','3-level','corner','flat','C3','rotation'],
    bullets: [
      '3-level stretch to one side: flat, intermediate out/corner, deep clear.',
      'Vs C3 Sky/Cloud, read flat-to-corner based on rotation; hit corner in soft void.',
    ],
    sources: [{ title: 'Flood vs C3', url: 'https://matchquarters.com' }]
  },
  {
    id: 'MESH',
    title: 'Mesh — Teaching Points',
    tags: ['MESH','cross','man','zone','rub'],
    bullets: [
      'Great vs man (rub); settle in zone windows at 4–6 yds.',
      'Alert RB swing/spot as outlet; be decisive to avoid late throws across traffic.',
    ],
    sources: [{ title: 'Mesh concept', url: 'https://www.runthepower.com' }]
  },
  {
    id: 'STICK',
    title: 'Stick — Teaching Points',
    tags: ['STICK','flat','stick','quick','rhythm'],
    bullets: [
      'Rhythm to stick vs inside leverage; flat answers outside leverage.',
      'Avoid holding the ball; timing wins this concept.',
    ],
    sources: [{ title: 'Stick concept', url: 'https://www.shakinthesouthland.com' }]
  },
  {
    id: 'DAGGER',
    title: 'Dagger — Teaching Points',
    tags: ['DAGGER','dig','clearout','C3','BUZZ'],
    bullets: [
      'Clear go routes to open the dig at 15–18 yards; hit window behind buzz safety.',
      'Check down timely if hook defenders sink; avoid late throws across MOF.',
    ],
    sources: [{ title: 'Dagger vs Buzz', url: 'https://www.xandolabs.com' }]
  }
];

export function pickKnowledge(keys: string[], k = 3): KnowledgeItem[] {
  const toks = new Set(keys.map(s => s.toLowerCase()));
  const scored = KNOWLEDGE.map(item => ({
    item,
    score: item.tags.reduce((acc, t) => acc + (toks.has(t.toLowerCase()) ? 1 : 0), 0)
  }));
  return scored.sort((a,b) => b.score - a.score).slice(0,k).map(s => s.item);
}
