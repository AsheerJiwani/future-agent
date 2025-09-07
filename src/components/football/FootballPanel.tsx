"use client";

import { useEffect, useState } from "react";
// import AIAssistant from "./AIAssistant";
import type { PlaySnapshot, SnapMeta, ThrowSummary } from "@/types/play";
import PlaySimulator from "./PlaySimulator";
import { CONCEPTS, type FootballConceptId } from "../../data/football/catalog";
import type { CoverageID } from "../../data/football/types";
// import { getOrCreateUserId } from "../../lib/user";
import TutorChat from "./TutorChat";

const COVERAGES: CoverageID[] = [
  "C0","C1","C2","TAMPA2","PALMS","C3","C4","QUARTERS","C6","C9"
];
const COVERAGE_LABEL: Record<CoverageID, string> = {
  C0: "Cover 0",
  C1: "Cover 1 (Man-Free)",
  C2: "Cover 2",
  TAMPA2: "Tampa 2",
  PALMS: "Palms / 2-Read",
  C3: "Cover 3",
  C4: "Cover 4",
  QUARTERS: "Quarters (Match)",
  C6: "Cover 6 (QQH)",
  C9: "Cover 9 (Match)"
};

export default function FootballPanel() {
  const [conceptId, setConceptId] = useState<FootballConceptId>(CONCEPTS[0].id);
  const [coverage, setCoverage] = useState<CoverageID>("C3");
  const [mode, setMode] = useState<"teach" | "quiz">("teach");
  const [snapshot, setSnapshot] = useState<PlaySnapshot | undefined>(undefined);
  const [snapMeta, setSnapMeta] = useState<SnapMeta | undefined>(undefined);
  const [lastThrow, setLastThrow] = useState<ThrowSummary | undefined>(undefined);
  // const [userId, setUserId] = useState<string | null>(null); // retained for future personalization

  // Restore concept/coverage from URL (share links)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("c");
    const cov = sp.get("cov");
    if (c && (CONCEPTS as unknown as Array<{id:string}>).some(x => x.id === c)) setConceptId(c as FootballConceptId);
    if (cov) setCoverage(cov as CoverageID);
    // setUserId(getOrCreateUserId());
  }, []);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-wide text-white/60">QB Assistant Lab</div>
        <div className="flex gap-2">
          <button
            onClick={() => setMode("teach")}
            className={`px-3 py-1.5 rounded-xl text-sm ${mode==="teach" ? "bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white" : "bg-white/10 text-white/80"}`}
          >Teach</button>
          <button
            onClick={() => setMode("quiz")}
            className={`px-3 py-1.5 rounded-xl text-sm ${mode==="quiz" ? "bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white" : "bg-white/10 text-white/80"}`}
          >Quiz</button>
        </div>
      </div>

      {/* Selectors */}
      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-white/60 text-xs">Concept</span>
          <select
            value={conceptId}
            onChange={(e) => setConceptId(e.target.value as FootballConceptId)}
            className="bg-white/10 text-white rounded-xl px-3 py-2 outline-none"
          >
            {CONCEPTS.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-white/60 text-xs">Coverage</span>
          <select
            value={coverage}
            onChange={(e) => setCoverage(e.target.value as CoverageID)}
            className="bg-white/10 text-white rounded-xl px-3 py-2 outline-none"
          >
            {COVERAGES.map(cv => (
              <option key={cv} value={cv}>{COVERAGE_LABEL[cv]}</option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <div className="text-white/70 text-xs">
            Tip: switch to <span className="font-semibold">Quiz</span> to get grilled by Coach.
          </div>
        </div>
      </div>

      {/* Side-by-side: Simulator + Assistant */}
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <div className="relative">
          <PlaySimulator
            conceptId={conceptId}
            coverage={coverage}
            onSnapshot={(snap, meta) => {
              setSnapshot(snap);
              setSnapMeta(meta);
            }}
            onThrowGraded={(sum) => setLastThrow(sum)}
          />
          {lastThrow && (
            <div className="absolute top-15 left-6 rounded-xl bg-black/60 text-white text-xs px-3 py-2 border border-white/10 shadow-lg">
              <div className="uppercase tracking-wide text-white/60">Last Grade</div>
              <div className="text-sm font-semibold">{lastThrow.grade ?? '—'}</div>
              {lastThrow.throwArea && (
                <div className="text-white/60">Area: {lastThrow.throwArea}</div>
              )}
              {(typeof lastThrow.catchWindowScore === 'number') && (
                <div className="text-white/60">Open@Catch: {lastThrow.catchWindowScore?.toFixed?.(2)}{typeof lastThrow.catchSepYds==='number' ? ` (${lastThrow.catchSepYds.toFixed(1)} yds)` : ''}</div>
              )}
              <div className="mt-2 flex gap-2">
                <button onClick={()=>{
                  try { window.dispatchEvent(new CustomEvent('replay-at-break', { detail: { rid: lastThrow.target } })); } catch {}
                }} className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15">Replay @ break</button>
                <button onClick={()=>{
                  try { window.dispatchEvent(new CustomEvent('replay-at-catch')); } catch {}
                }} className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15">Replay @ catch</button>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <TutorChat conceptId={conceptId} coverage={coverage} formation={snapshot?.formation} snapshot={snapshot} snapMeta={snapMeta} lastThrow={lastThrow} onSetCoverage={(c)=>setCoverage(c)} />
        </div>
      </div>
    </div>
  );
}
