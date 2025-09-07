"use client";

import { useEffect, useState, useRef, startTransition } from "react";
import { getOrCreateUserId } from "../../lib/user";
// import AIAssistant from "./AIAssistant";
import type { PlaySnapshot, SnapMeta, ThrowSummary } from "@/types/play";
import PlaySimulator from "./PlaySimulator";
import { CONCEPTS, type FootballConceptId } from "../../data/football/catalog";
import type { CoverageID } from "../../data/football/types";
// import { getOrCreateUserId } from "../../lib/user";
import TutorChat from "./TutorChat";

type DrillConfig = {
  coverage?: CoverageID;
  formation?: 'TRIPS_RIGHT'|'DOUBLES'|'BUNCH_LEFT';
  motions?: Array<{ rid: 'X'|'Z'|'SLOT'|'TE'|'RB'; type?: 'jet'|'short'|'across'; dir?: 'left'|'right' }>;
  fireZone?: { on: boolean; preset?: 'NICKEL'|'SAM'|'WILL' };
};

type LastDrillState = {
  prev: { coverage: CoverageID; formation?: 'TRIPS_RIGHT'|'DOUBLES'|'BUNCH_LEFT' };
  suggestion: {
    suggestedCoverage?: CoverageID;
    suggestedFormation?: 'TRIPS_RIGHT'|'DOUBLES'|'BUNCH_LEFT';
    motions?: Array<{ rid: 'X'|'Z'|'SLOT'|'TE'|'RB'; type?: 'jet'|'short'|'across'; dir?: 'left'|'right' }>;
    fireZone?: { on: boolean; preset?: 'NICKEL'|'SAM'|'WILL' };
  };
};

type SessionData = {
  streak?: number;
  lastDrill?: LastDrillState;
  starRid?: string;
  adaptiveOn?: boolean;
};

type RoutineData = {
  name: string;
  drill: DrillConfig;
};

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
  const [adaptiveOn, setAdaptiveOn] = useState<boolean>(false);
  const [starRid, setStarRid] = useState<""|"X"|"Z"|"SLOT"|"TE"|"RB">("");
  const [sessionInfo, setSessionInfo] = useState<{ streak: number; recs?: Array<{ skill: string; coverage: string; reason: string }> }>({ streak: 0 });
  const [userId, setUserId] = useState<string | null>(null);
  const [lastDrill, setLastDrill] = useState<{
    prev: { coverage: CoverageID; formation?: 'TRIPS_RIGHT'|'DOUBLES'|'BUNCH_LEFT' };
    suggestion: { suggestedCoverage?: CoverageID; suggestedFormation?: 'TRIPS_RIGHT'|'DOUBLES'|'BUNCH_LEFT'; motions?: Array<{ rid: 'X'|'Z'|'SLOT'|'TE'|'RB'; type?: 'jet'|'short'|'across'; dir?: 'left'|'right' }>; fireZone?: { on: boolean; preset?: 'NICKEL'|'SAM'|'WILL' } }
  } | null>(null);
  const [autoRun, setAutoRun] = useState<{ on: boolean; left: number }>({ on: false, left: 0 });
  const autoRunRef = useRef<{ on: boolean; left: number }>({ on: false, left: 0 });
  const [routines, setRoutines] = useState<Array<{ name: string; drill: { coverage?: CoverageID; formation?: 'TRIPS_RIGHT'|'DOUBLES'|'BUNCH_LEFT'; motions?: Array<{ rid: 'X'|'Z'|'SLOT'|'TE'|'RB'; type?: 'jet'|'short'|'across'; dir?: 'left'|'right' }>; fireZone?: { on: boolean; preset?: 'NICKEL'|'SAM'|'WILL' } } }>>([]);
  const [routineName, setRoutineName] = useState<string>('');
  // const [userId, setUserId] = useState<string | null>(null); // retained for future personalization

  // Restore concept/coverage from URL (share links)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const c = sp.get("c");
    const cov = sp.get("cov");
    if (c && (CONCEPTS as unknown as Array<{id:string}>).some(x => x.id === c)) setConceptId(c as FootballConceptId);
    if (cov) setCoverage(cov as CoverageID);
    setUserId(getOrCreateUserId());
  }, []);

  // Pull skill summary periodically when adaptive is on
  useEffect(() => {
    if (!adaptiveOn) return;
    let stop = false;
    async function load() {
      try {
        const res = await fetch('/api/skills/summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
        const data = await res.json() as { recs?: Array<{ skill: string; coverage: string; reason: string }> };
        if (!stop && data.recs) setSessionInfo(s => ({ ...s, recs: data.recs }));
      } catch {}
    }
    void load();
    const id = setInterval(load, 15000);
    return () => { stop = true; clearInterval(id); };
  }, [adaptiveOn]);

  // Load persisted session
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const res = await fetch('/api/session/load', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
        const data = await res.json() as { session?: SessionData };
        if (data.session?.streak) setSessionInfo(s => ({ ...s, streak: data.session!.streak! }));
        if (typeof data.session?.adaptiveOn === 'boolean') setAdaptiveOn(data.session.adaptiveOn);
        if (data.session?.lastDrill) setLastDrill(data.session.lastDrill);
        if (data.session?.starRid) {
          try { window.dispatchEvent(new CustomEvent('set-star', { detail: { rid: data.session.starRid } })); } catch {}
        }
      } catch {}
    })();
  }, [userId]);

  // Load routines when user available
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const res = await fetch('/api/routine/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
        const data = await res.json() as { routines?: RoutineData[] };
        setRoutines(data.routines || []);
      } catch {}
    })();
  }, [userId]);

  // Persist session (debounced-ish)
  useEffect(() => {
    const id = setTimeout(() => {
      if (!userId) return;
      try { void fetch('/api/session/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, session: { streak: sessionInfo.streak, lastDrill, adaptiveOn } }) }); } catch {}
    }, 600);
    return () => clearTimeout(id);
  }, [userId, sessionInfo.streak, JSON.stringify(lastDrill), adaptiveOn]);

  // Listen for apply/revert drill from simulator banner
  useEffect(() => {
    function onApply() {
      if (!lastDrill) return;
      const d = lastDrill.suggestion;
      if (d.suggestedCoverage) setCoverage(d.suggestedCoverage);
      if (d.suggestedFormation) {
        try { window.dispatchEvent(new CustomEvent('set-formation', { detail: { formation: d.suggestedFormation } })); } catch {}
      }
      if (Array.isArray(d.motions)) d.motions.forEach(m => { try { window.dispatchEvent(new CustomEvent('apply-motion', { detail: m })); } catch {} });
      if (d.fireZone?.on) { try { window.dispatchEvent(new CustomEvent('set-firezone', { detail: { on: true, preset: d.fireZone.preset } })); } catch {} }
    }
    function onRevert() {
      if (!lastDrill) return;
      const p = lastDrill.prev;
      setCoverage(p.coverage);
      if (p.formation) { try { window.dispatchEvent(new CustomEvent('set-formation', { detail: { formation: p.formation } })); } catch {} }
      try { window.dispatchEvent(new CustomEvent('set-firezone', { detail: { on: false } })); } catch {}
    }
    window.addEventListener('apply-drill', onApply as EventListener);
    window.addEventListener('revert-drill', onRevert as EventListener);
    return () => {
      window.removeEventListener('apply-drill', onApply as EventListener);
      window.removeEventListener('revert-drill', onRevert as EventListener);
    };
  }, [lastDrill]);

  // Auto run 5 reps loop
  useEffect(() => { autoRunRef.current = autoRun; }, [autoRun]);
  async function runReps(n: number) {
    setAutoRun({ on: true, left: n });
    for (let i=0; i<n; i++) {
      if (!autoRunRef.current.on) break;
      // simple 3-second countdown
      for (let c=3; c>0; c--) {
        if (!autoRunRef.current.on) break;
        try { window.dispatchEvent(new CustomEvent('auto-run-status', { detail: { active: true, left: (n - i), nextIn: c } })); } catch {}
        await new Promise(res => setTimeout(res, 1000));
      }
      if (!autoRunRef.current.on) break;
      try { window.dispatchEvent(new CustomEvent('start-snap')); } catch {}
      try { window.dispatchEvent(new CustomEvent('auto-run-status', { detail: { active: true, left: (n - i - 1), nextIn: 3 } })); } catch {}
      setAutoRun(s => ({ on: true, left: Math.max(0, s.left - 1) }));
      await new Promise(res => setTimeout(res, 3600));
    }
    setAutoRun({ on: false, left: 0 });
    try { window.dispatchEvent(new CustomEvent('auto-run-status', { detail: { active: false, left: 0, nextIn: 0 } })); } catch {}
  }

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
            onChange={(e) => {
              // PERFORMANCE: Use requestAnimationFrame for non-blocking concept changes
              const value = e.target.value as FootballConceptId;
              startTransition(() => setConceptId(value));
            }}
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
            onChange={(e) => {
              // PERFORMANCE: Use requestAnimationFrame for non-blocking coverage changes  
              const value = e.target.value as CoverageID;
              startTransition(() => setCoverage(value));
            }}
            className="bg-white/10 text-white rounded-xl px-3 py-2 outline-none"
          >
            {COVERAGES.map(cv => (
              <option key={cv} value={cv}>{COVERAGE_LABEL[cv]}</option>
            ))}
          </select>
        </label>

        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-white/70 text-xs">
            <input type="checkbox" checked={adaptiveOn} onChange={(e)=>setAdaptiveOn(e.target.checked)} /> Adaptive Drills
          </label>
          <label className="flex items-center gap-2 text-white/70 text-xs">
            <span>Star</span>
            <select value={starRid} onChange={(e)=>{ const v = e.target.value as typeof starRid; setStarRid(v); try { window.dispatchEvent(new CustomEvent('set-star', { detail: { rid: v || '' } })); } catch {} }} className="bg-white/10 text-white rounded-md px-2 py-2">
              <option value="">—</option>
              <option value="X">X</option>
              <option value="Z">Z</option>
              <option value="SLOT">SLOT</option>
              <option value="TE">TE</option>
              <option value="RB">RB</option>
            </select>
          </label>
          <button
            onClick={async ()=>{
              if (!adaptiveOn) return;
              try {
                const res = await fetch('/api/adaptive/next', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conceptId, coverage }) });
                const data = await res.json() as { suggestedCoverage?: CoverageID; suggestedFormation?: 'TRIPS_RIGHT'|'DOUBLES'|'BUNCH_LEFT'; motions?: Array<{ rid: 'X'|'Z'|'SLOT'|'TE'|'RB'; type?: 'jet'|'short'|'across'; dir?: 'left'|'right' }>; fireZone?: { on: boolean; preset?: 'NICKEL'|'SAM'|'WILL' }; reason?: string; recs?: Array<{ skill: string; coverage: CoverageID; reason: string }> };
                if (data.recs) setSessionInfo(s => ({ ...s, recs: data.recs }));
                // Capture prev for revert then apply suggestion
                setLastDrill({ prev: { coverage, formation: (snapshot?.formation as 'TRIPS_RIGHT'|'DOUBLES'|'BUNCH_LEFT') }, suggestion: { suggestedCoverage: data.suggestedCoverage, suggestedFormation: data.suggestedFormation, motions: data.motions, fireZone: data.fireZone } });
                if (data.suggestedCoverage) setCoverage(data.suggestedCoverage);
                // Apply formation preset (opt-in) via event
                if (data.suggestedFormation) {
                  try { window.dispatchEvent(new CustomEvent('set-formation', { detail: { formation: data.suggestedFormation } })); } catch {}
                }
                // Apply suggested motion(s) (best effort, one at a time)
                if (Array.isArray(data.motions)) {
                  for (const m of data.motions) {
                    try { window.dispatchEvent(new CustomEvent('apply-motion', { detail: m })); } catch {}
                  }
                }
                // Apply fire-zone if requested
                if (data.fireZone?.on) {
                  try { window.dispatchEvent(new CustomEvent('set-firezone', { detail: { on: true, preset: data.fireZone?.preset } })); } catch {}
                }
                // Show a drill banner in the simulator
                try {
                  window.dispatchEvent(new CustomEvent('adaptive-drill', { detail: {
                    coverage: data.suggestedCoverage,
                    formation: data.suggestedFormation,
                    motions: data.motions,
                    fireZone: data.fireZone,
                    reason: data.reason
                  }}));
                } catch {}
              } catch {}
            }}
            className={`px-3 py-1.5 rounded-xl text-sm ${adaptiveOn ? 'bg-gradient-to-r from-amber-500 to-lime-500 text-black' : 'bg-white/10 text-white/50 cursor-not-allowed'}`}
            title={adaptiveOn ? 'Get the next drill' : 'Enable Adaptive Drills to use'}
          >Next Drill</button>
          {adaptiveOn && !autoRun.on && (
            <button onClick={()=>void runReps(5)} className="px-3 py-1.5 rounded-xl text-sm bg-white/10 text-white/80">Run 5 Reps</button>
          )}
          {adaptiveOn && autoRun.on && (
            <button onClick={()=>setAutoRun({ on:false, left: 0 })} className="px-3 py-1.5 rounded-xl text-sm bg-rose-600/80 text-white">Stop ({autoRun.left})</button>
          )}
          {/* Routine picker */}
          <div className="flex items-center gap-2 text-white/70 text-xs">
            <span>Routine</span>
            <select value={routineName} onChange={(e)=>setRoutineName(e.target.value)} className="bg-white/10 text-white rounded-md px-2 py-2">
              <option value="">—</option>
              {routines.map((r,i)=>(<option key={i} value={r.name}>{r.name}</option>))}
            </select>
            <button
              className="px-2 py-1.5 rounded-md bg-white/10 text-white/80"
              onClick={()=>{
                const r = routines.find(rr=>rr.name===routineName);
                if (!r) return;
                setLastDrill({ prev: { coverage, formation: (snapshot?.formation as 'TRIPS_RIGHT'|'DOUBLES'|'BUNCH_LEFT') }, suggestion: { suggestedCoverage: r.drill.coverage, suggestedFormation: r.drill.formation, motions: r.drill.motions, fireZone: r.drill.fireZone } });
                if (r.drill.coverage) setCoverage(r.drill.coverage);
                if (r.drill.formation) { try { window.dispatchEvent(new CustomEvent('set-formation', { detail: { formation: r.drill.formation } })); } catch {} }
                if (r.drill.motions) { r.drill.motions.forEach(m=>{ try{ window.dispatchEvent(new CustomEvent('apply-motion', { detail: m })); }catch{} }); }
                if (r.drill.fireZone?.on) { try { window.dispatchEvent(new CustomEvent('set-firezone', { detail: { on: true, preset: r.drill.fireZone.preset } })); } catch {} }
                try { window.dispatchEvent(new CustomEvent('adaptive-drill', { detail: { coverage: r.drill.coverage, formation: r.drill.formation, motions: r.drill.motions, fireZone: r.drill.fireZone, reason: 'Routine' } })); } catch {}
              }}
            >Apply</button>
            {adaptiveOn && routineName && (
              <button onClick={()=>void runReps(5)} className="px-2 py-1.5 rounded-md bg-white/10 text-white/80">Run 5</button>
            )}
            <button
              className="px-2 py-1.5 rounded-md bg-white/10 text-white/80"
              onClick={async ()=>{
                if (!routineName) return;
                // eslint-disable-next-line no-alert
                const nn = (window.prompt('Rename routine to:', routineName) || '').trim();
                if (!nn || nn === routineName) return;
                try {
                  await fetch('/api/routine/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldName: routineName, newName: nn }) });
                  setRoutineName(nn);
                  const res = await fetch('/api/routine/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                  const data = await res.json() as { routines?: RoutineData[] };
                  setRoutines(data.routines || []);
                } catch {}
              }}
            >Rename</button>
            <button
              className="px-2 py-1.5 rounded-md bg-rose-600/80 text-white"
              onClick={async ()=>{
                if (!routineName) return;
                if (!window.confirm(`Delete routine "${routineName}"?`)) return;
                try {
                  await fetch('/api/routine/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: routineName }) });
                  setRoutineName('');
                  const res = await fetch('/api/routine/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
                  const data = await res.json() as { routines?: RoutineData[] };
                  setRoutines(data.routines || []);
                } catch {}
              }}
            >Delete</button>
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
          <TutorChat adaptiveOn={adaptiveOn} conceptId={conceptId} coverage={coverage} formation={snapshot?.formation} snapshot={snapshot} snapMeta={snapMeta} lastThrow={lastThrow} onSetCoverage={(c)=>setCoverage(c)} />
          {/* Session View: simple progress + recommended reps */}
          <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-white/90 text-sm">
            <div className="text-white/60 text-xs mb-1">Session</div>
            <div className="flex items-center gap-4 text-xs">
              <div>Streak: <span className="font-semibold">{sessionInfo.streak}</span></div>
            </div>
            {sessionInfo.recs && sessionInfo.recs.length>0 && (
              <div className="mt-2">
                <div className="text-white/60 text-xs mb-1">Recommended Reps</div>
                <ul className="list-disc list-inside">
                  {sessionInfo.recs.slice(0,3).map((r,i)=> (
                    <li key={i}><span className="text-white/60">{r.skill}:</span> {r.coverage} — {r.reason}</li>
                  ))}
                </ul>
              </div>
            )}
            {!sessionInfo.recs && <div className="text-white/50 text-xs mt-1">Enable Adaptive Drills and run a few reps to get tailored suggestions.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
