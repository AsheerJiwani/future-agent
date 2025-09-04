"use client";

import { useMemo, useState } from "react";
import type { CoverageID, Concept } from "../data/football/types";
import smash from "../data/football/concepts/smash";
import PlayDiagram from "./football/PlayDiagram";
import ReadStepper from "./football/ReadStepper";

type Decision = {
  text: string;
  highlightLabels: string[];  // which routes to glow
  highlightStep?: number;     // which step to emphasize
};

// simple rules for Smash vs coverage + toggles
function decideForSmash(coverage: CoverageID, rotateStrong: boolean, nickelBlitz: boolean): Decision {
  // base C2 read: cloud corner sink → hitch (H); flat widens → corner (Z)
  if (nickelBlitz) {
    return {
      text: "Hot: Replace nickel blitz with quick hitch to #2 (H).",
      highlightLabels: ["H"],
      highlightStep: 1
    };
  }
  if (rotateStrong) {
    return {
      text: "Pre-snap: MOF safety leaning/rotating strong → Alert glance/now weak to X. If not thrown, work the base: hitch (H) if corner sinks; else corner (Z).",
      highlightLabels: ["X"],
      highlightStep: 1
    };
  }
  switch (coverage) {
    case "C2":
    case "TAMPA2":
    case "PALMS":
      return {
        text: "Base Smash vs 2-high: If cloud corner sinks with #1, throw hitch (H) now. If flat widens with hitch, throw corner (Z).",
        highlightLabels: ["H","Z"],
        highlightStep: 1
      };
    case "C3":
    case "C4":
    case "QUARTERS":
      return {
        text: "Into 3/4, Smash is weaker: be ready to work the hitch now vs soft corners, or check down if deep defenders cap the corner.",
        highlightLabels: ["H"],
        highlightStep: 1
      };
    default:
      return {
        text: "If unclear shell, confirm post-snap rotation: take the hitch now vs off/squat; otherwise don’t force corner—find the check.",
        highlightLabels: ["H"],
        highlightStep: 1
      };
  }
}

const concepts: Record<string, Concept> = { SMASH: smash };

export default function FootballPlaybookCoach() {
  const [coverage, setCoverage] = useState<CoverageID>("C2");
  const [rotateStrong, setRotateStrong] = useState(false);
  const [nickelBlitz, setNickelBlitz] = useState(false);

  // for now we showcase Smash
  const concept = concepts.SMASH;
  const plan = useMemo(() => {
    const p = concept.readPlans.find(r => r.vs === coverage) ?? concept.readPlans[0];
    return p;
  }, [concept, coverage]);

  const decision = decideForSmash(coverage, rotateStrong, nickelBlitz);

  const diagram = useMemo(() => {
    const base = concept.diagram!;
    return { ...base, coverage }; // overlay chosen coverage
  }, [concept, coverage]);

  async function askModel() {
    // optional refinement via API (if you wire the route below)
    try {
      const res = await fetch("/api/football-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptId: concept.id, coverage, rotateStrong, nickelBlitz })
      });
      if (res.ok) {
        const data = await res.json() as { decision: string };
        alert(data.decision);
      } else {
        alert("Model advice unavailable; using rules.");
      }
    } catch {
      alert("Model advice unavailable; using rules.");
    }
  }

  return (
    <div className="panel-surface thin-border" style={{ background: "var(--surface)" }}>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h2 className="text-xl font-semibold">Football Playbook Coach</h2>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm opacity-80">
            Coverage:&nbsp;
            <select
              value={coverage}
              onChange={(e) => setCoverage(e.target.value as CoverageID)}
              className="bg-white/5 thin-border rounded-lg px-2 py-1"
            >
              {["C2","TAMPA2","PALMS","C3","C4","QUARTERS","C1","C0"].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-sm opacity-80 inline-flex items-center gap-2">
            <input type="checkbox" checked={rotateStrong} onChange={(e)=>setRotateStrong(e.target.checked)} />
            Rotate Strong
          </label>
          <label className="text-sm opacity-80 inline-flex items-center gap-2">
            <input type="checkbox" checked={nickelBlitz} onChange={(e)=>setNickelBlitz(e.target.checked)} />
            Nickel Blitz
          </label>

          <button onClick={askModel} className="btn-accent">Model Advice</button>
        </div>
      </div>

      <div className="text-white/70 text-sm mt-1 mb-4">
        Concept: <span className="font-medium">{concept.name}</span> · Footwork: {concept.footwork}
      </div>

      <PlayDiagram diagram={diagram} highlightLabels={decision.highlightLabels} />

      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <ReadStepper plan={plan} highlightStep={decision.highlightStep} />

        <div className="rounded-2xl thin-border p-4 bg-white/5">
          <div className="opacity-70 uppercase text-sm mb-2">Decision</div>
          <div className="font-medium">{decision.text}</div>

          <div className="opacity-70 uppercase text-sm mt-4 mb-1">Pre / Post-snap</div>
          <ul className="list-disc ml-5">
            {concept.preSnapKeys?.map((k,i)=><li key={i}>{k}</li>)}
          </ul>
          <ul className="list-disc ml-5 mt-2">
            {concept.postSnapKeys?.map((k,i)=><li key={i}>{k}</li>)}
          </ul>

          {concept.commonMistakes?.length ? (
            <>
              <div className="opacity-70 uppercase text-sm mt-4 mb-1">Common mistakes</div>
              <ul className="list-disc ml-5">{concept.commonMistakes.map((m,i)=><li key={i}>{m}</li>)}</ul>
            </>
          ) : null}
        </div>
      </div>

      {concept.sources?.length ? (
        <div className="rounded-2xl thin-border p-4 bg-white/5 mt-4">
          <div className="opacity-70 uppercase text-sm mb-2">Sources</div>
          <ul className="list-disc ml-5">
            {concept.sources.map((s,i)=><li key={i}><a className="underline hover:opacity-90" href={s.url} target="_blank" rel="noreferrer">{s.title}</a></li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
