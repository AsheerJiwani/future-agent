// src/data/hoopsSources.ts
export type HoopsSource = {
  title: string;
  url: string;
  /** Reference year/era (event/adoption/popularization). Free-form string is OK. */
  date?: string;
  tags?: string[];
};

export const HOOPS_SOURCES: HoopsSource[] = [
  // Origins & foundational rules
  { title: "James Naismith (Inventor of Basketball)", url: "https://en.wikipedia.org/wiki/James_Naismith", date: "1891", tags: ["origins","history"] },
  { title: "Original 13 Rules of Basketball", url: "https://en.wikipedia.org/wiki/Original_rules_of_basketball", date: "1891", tags: ["rules","history"] },
  { title: "Basketball Rules (Overview)", url: "https://en.wikipedia.org/wiki/Basketball_rules", date: "ongoing", tags: ["rules","overview"] },

  // Shot clock, three-point line, key rule changes
  { title: "24-Second Shot Clock (NBA)", url: "https://en.wikipedia.org/wiki/Shot_clock", date: "1954", tags: ["rules","pace","NBA"] },
  { title: "Three-Point Field Goal (ABA → NBA)", url: "https://en.wikipedia.org/wiki/Three-point_field_goal", date: "ABA 1967 · NBA 1979", tags: ["rules","spacing","3pt"] },
  { title: "Defensive Three-Second Rule (NBA)", url: "https://en.wikipedia.org/wiki/Defensive_three-second_rule", date: "2001", tags: ["rules","defense","NBA"] },
  { title: "Zone Defense Legalized in NBA", url: "https://en.wikipedia.org/wiki/Zone_defense#Basketball", date: "2001", tags: ["rules","defense","NBA"] },
  { title: "Hand-Checking Enforcement Changes (NBA)", url: "https://en.wikipedia.org/wiki/Hand-checking", date: "2004", tags: ["rules","perimeter","NBA"] },
  { title: "Restricted Area / No-Charge Semicircle", url: "https://en.wikipedia.org/wiki/Restricted_area_(basketball)", date: "1997+ (NBA)", tags: ["rules","charging","NBA"] },
  { title: "Coach’s Challenge (NBA)", url: "https://en.wikipedia.org/wiki/Coach%27s_challenge", date: "2019", tags: ["rules","challenge","NBA"] },
  { title: "Transition Take Foul (NBA change)", url: "https://www.nba.com/news/nba-board-of-governors-approves-changes-to-transition-take-foul", date: "2022", tags: ["rules","transition","NBA"] },
  { title: "NCAA Shot Clock History", url: "https://en.wikipedia.org/wiki/Shot_clock#NCAA_men's_basketball", date: "1985→2015", tags: ["NCAA","rules","shot clock"] },

  // Offenses & actions
  { title: "Triangle Offense (Tex Winter / Phil Jackson)", url: "https://en.wikipedia.org/wiki/Triangle_offense", date: "1950s→1990s", tags: ["offense","triangle"] },
  { title: "Princeton Offense", url: "https://en.wikipedia.org/wiki/Princeton_offense", date: "1970s+", tags: ["offense","reads","backdoor"] },
  { title: "Dribble Drive Motion (Walberg/Calipari)", url: "https://en.wikipedia.org/wiki/Dribble_drive_motion_offense", date: "2000s", tags: ["offense","drive","kick"] },
  { title: "Pick-and-Roll (concept & tactics)", url: "https://en.wikipedia.org/wiki/Pick_and_roll", date: "core concept", tags: ["offense","PnR"] },
  { title: "Flex Offense", url: "https://en.wikipedia.org/wiki/Flex_offense", date: "1960s+", tags: ["offense","motion"] },
  { title: "Motion Offense (concept)", url: "https://en.wikipedia.org/wiki/Motion_offense", date: "concept", tags: ["offense","reads"] },
  { title: "Seven Seconds or Less (D’Antoni Suns)", url: "https://en.wikipedia.org/wiki/Seven_seconds_or_less", date: "2004–2007", tags: ["offense","pace","Suns"] },
  { title: "Spain Pick-and-Roll (Backscreen PnR)", url: "https://www.breakthroughbasketball.com/offense/spain-pick-and-roll.html", date: "2010s", tags: ["offense","Spain PnR"] },
  { title: "Horns Offense (set family)", url: "https://www.breakthroughbasketball.com/plays/horns-offense.html", date: "2000s+", tags: ["offense","horns"] },
  { title: "Pistol Action (dribble handoff series)", url: "https://www.basketballforcoaches.com/pistol-action/", date: "2010s", tags: ["offense","pistol","DHO"] },

  // Defenses & coverages
  { title: "Pack-Line Defense (Bennett family)", url: "https://en.wikipedia.org/wiki/Pack-line_defense", date: "1990s+", tags: ["defense","pack line"] },
  { title: "Match-Up Zone", url: "https://en.wikipedia.org/wiki/Match-up_zone", date: "concept", tags: ["defense","zone"] },
  { title: "Box-and-One Defense", url: "https://en.wikipedia.org/wiki/Box-and-one_defense", date: "concept", tags: ["defense","junk"] },
  { title: "Triangle-and-Two Defense", url: "https://en.wikipedia.org/wiki/Triangle_and_two_defense", date: "concept", tags: ["defense","junk"] },
  // (Named PnR coverages — reference articles tend to be coaching sites; tags still help)
  { title: "PnR Coverage: Drop / Contain (overview)", url: "https://www.breakthroughbasketball.com/defense/pick-and-roll-defense.html", date: "coaching ref", tags: ["defense","PnR","drop","contain"] },
  { title: "PnR Coverage: Switch / ICE / Hedge / Blitz", url: "https://www.basketballforcoaches.com/pick-and-roll-defense/", date: "coaching ref", tags: ["defense","PnR","switch","ice","hedge","blitz"] },

  // Analytics & advanced metrics
  { title: "True Shooting Percentage (TS%)", url: "https://en.wikipedia.org/wiki/True_shooting_percentage", date: "stat", tags: ["analytics","shooting"] },
  { title: "Effective FG% (eFG%)", url: "https://en.wikipedia.org/wiki/Effective_field_goal_percentage", date: "stat", tags: ["analytics","shooting"] },
  { title: "Player Efficiency Rating (PER)", url: "https://en.wikipedia.org/wiki/Player_efficiency_rating", date: "stat", tags: ["analytics"] },
  { title: "Box Plus/Minus (BPM)", url: "https://en.wikipedia.org/wiki/Box_Plus/Minus", date: "stat", tags: ["analytics"] },
  { title: "Offensive Rating (ORtg)", url: "https://en.wikipedia.org/wiki/Offensive_rating", date: "stat", tags: ["analytics"] },
  { title: "Defensive Rating (DRtg)", url: "https://en.wikipedia.org/wiki/Defensive_rating", date: "stat", tags: ["analytics"] },
  { title: "Pace (Possessions/48)", url: "https://en.wikipedia.org/wiki/Pace_(basketball)", date: "stat", tags: ["analytics","tempo"] },

  // Iconic teams & eras
  { title: "Boston Celtics Dynasty", url: "https://en.wikipedia.org/wiki/Boston_Celtics", date: "1957–1969", tags: ["history","Celtics","dynasty"] },
  { title: "Showtime Lakers", url: "https://en.wikipedia.org/wiki/Showtime_(basketball)", date: "1980s", tags: ["history","Lakers","Showtime"] },
  { title: "Bad Boys Pistons", url: "https://en.wikipedia.org/wiki/Bad_Boys_(Detroit_Pistons)", date: "late 1980s", tags: ["history","Pistons","defense"] },
  { title: "Chicago Bulls (Jordan Era)", url: "https://en.wikipedia.org/wiki/Chicago_Bulls", date: "1991–1998", tags: ["history","Bulls","Jordan"] },
  { title: "San Antonio Spurs “Beautiful Game” (2014)", url: "https://en.wikipedia.org/wiki/2014_NBA_Finals", date: "2014", tags: ["history","Spurs","passing"] },
  { title: "Golden State Warriors (Curry Era)", url: "https://en.wikipedia.org/wiki/Golden_State_Warriors", date: "2015–2019", tags: ["history","Warriors","3pt","gravity"] },
  { title: "Denver Nuggets (Jokić Era)", url: "https://en.wikipedia.org/wiki/Denver_Nuggets", date: "2023–", tags: ["history","Nuggets","hub offense"] },

  // International & global game
  { title: "FIBA Official Rules (PDF hub)", url: "https://www.fiba.basketball/documents", date: "current", tags: ["FIBA","rules"] },
  { title: "EuroLeague (Top European Club Comp.)", url: "https://en.wikipedia.org/wiki/EuroLeague", date: "2000–", tags: ["EuroLeague","clubs"] },
  { title: "FIBA Basketball World Cup", url: "https://en.wikipedia.org/wiki/FIBA_Basketball_World_Cup", date: "1950–", tags: ["FIBA","world cup"] },
  { title: "Basketball at the Summer Olympics", url: "https://en.wikipedia.org/wiki/Basketball_at_the_Summer_Olympics", date: "1936–", tags: ["Olympics","international"] },
  { title: "3x3 Basketball (FIBA)", url: "https://en.wikipedia.org/wiki/3x3_basketball", date: "2010s", tags: ["FIBA","3x3"] },

  // Coaching figures & systems (reference bios)
  { title: "Tex Winter", url: "https://en.wikipedia.org/wiki/Tex_Winter", date: "triangle era", tags: ["coach","triangle"] },
  { title: "Phil Jackson", url: "https://en.wikipedia.org/wiki/Phil_Jackson", date: "Bulls/Lakers", tags: ["coach"] },
  { title: "Mike D’Antoni", url: "https://en.wikipedia.org/wiki/Mike_D%27Antoni", date: "2000s–", tags: ["coach","pace","PnR"] },
  { title: "Gregg Popovich", url: "https://en.wikipedia.org/wiki/Gregg_Popovich", date: "1996–", tags: ["coach","Spurs"] },

  // Team/result databases
  { title: "Basketball-Reference (Teams)", url: "https://www.basketball-reference.com/teams/", date: "database", tags: ["reference","teams","stats"] },
  { title: "Basketball-Reference Glossary", url: "https://www.basketball-reference.com/about/glossary.html", date: "glossary", tags: ["reference","glossary"] }
];
