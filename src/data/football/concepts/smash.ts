import type { Concept } from "../../football/types";

// Strong-side Smash: #2 hitch (H), #1 corner (Z). Read cloud corner → flat.
const smash: Concept = {
  id: "SMASH",
  name: "Smash",
  family: "Dropback",
  bestInto: ["C2", "TAMPA2", "PALMS"],
  weakInto: ["C4", "QUARTERS"],
  personnel: ["10", "11"],
  formations: ["2x2", "3x1", "Bunch"],
  tags: ["corner + hitch", "high-low corner"],
  preSnapKeys: [
    "Two-high shell",
    "Cloud corner depth/leverage on #1",
    "Apex width vs #2 (flat defender)"
  ],
  postSnapKeys: [
    "Flat defender widens with hitch → corner opens",
    "Cloud corner bails/sinks with #1 → hitch now"
  ],
  footwork: "Gun 3 + hitch",
  readPlans: [
    {
      vs: "C2",
      progression: [
        {
          step: 1,
          keyDefender: "Cloud corner",
          if: "sinks/bails with #1",
          then: "Throw hitch to #2 (H) now",
          coachingPoint: "Ball out on hitch foot; no drift"
        },
        {
          step: 2,
          keyDefender: "Flat/overhang (apex)",
          if: "widens hard with hitch",
          then: "Throw corner to #1 (Z) at 18–22 on landmark",
          coachingPoint: "Hold MOF safety with eyes one beat"
        },
        {
          step: 3,
          if: "MOF safety overlaps the corner window",
          then: "Checkdown/weak hook",
          coachingPoint: "Don’t force the corner"
        }
      ],
      hotRules: ["Replace nickel blitz with quick hitch to #2 (H)"],
      notes: [
        "Alert 'glance' to isolated X weak vs press-bail if MOF safety leans strong pre-snap"
      ]
    }
  ],
  commonMistakes: [
    "Late to hitch vs squat corner",
    "Forcing corner vs mid-1/2 safety",
    "Drifting on quick game"
  ],
  sources: [
    { title: "Tampa-2 (overview)", url: "https://en.wikipedia.org/wiki/Tampa_2" }
  ],
  diagram: {
    losY: 15,
    coverage: "C2",
    players: [
      { label: "X",  x: 20, y: 8,  side: "O" },
      { label: "Z",  x: 80, y: 8,  side: "O" },
      { label: "Y",  x: 65, y: 12, side: "O" },
      { label: "H",  x: 35, y: 12, side: "O" },
      { label: "RB", x: 50, y: 6,  side: "O" },
      { label: "QB", x: 50, y: 4,  side: "O" },

      { label: "CB",  x: 15, y: 20, side: "D" },
      { label: "CB",  x: 85, y: 20, side: "D" },
      { label: "SS",  x: 35, y: 32, side: "D" },
      { label: "FS",  x: 65, y: 32, side: "D" },
      { label: "OLB", x: 30, y: 18, side: "D" },
      { label: "OLB", x: 70, y: 18, side: "D" },
      { label: "MLB", x: 50, y: 22, side: "D" }
    ],
    routes: [
      // Strong side: Z corner, H hitch, Y hook; Weak: X outside release; RB check
      { label: "Z", path: [ {x:80,y:8}, {x:80,y:12}, {x:76,y:18}, {x:70,y:22} ] },     // corner
      { label: "H", path: [ {x:35,y:12}, {x:35,y:16} ] },                               // hitch
      { label: "Y", path: [ {x:65,y:12}, {x:65,y:16} ] },                               // hook
      { label: "X", path: [ {x:20,y:8}, {x:20,y:12}, {x:22,y:16} ] },                   // outside release / alert
      { label: "RB",path: [ {x:50,y:6}, {x:48,y:10}, {x:46,y:12} ] }                    // check/weak
    ]
  }
};

export default smash;
