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
    <div className="fixed inset-0 bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
      {/* AI TUTOR WIDGET - Positioned above route zones (30+ yard area) */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-4xl px-4">
        <TutorChat 
          adaptiveOn={adaptiveOn} 
          conceptId={conceptId} 
          coverage={coverage} 
          formation={snapshot?.formation} 
          snapshot={snapshot} 
          snapMeta={snapMeta} 
          lastThrow={lastThrow} 
          onSetCoverage={(c)=>setCoverage(c)}
          isFullScreen={true}
        />
      </div>

      {/* MAIN FIELD AREA - Full screen simulator */}
      <div className="absolute inset-0 pt-32">
        <PlaySimulator
          conceptId={conceptId}
          coverage={coverage}
          onSnapshot={(snap, meta) => {
            setSnapshot(snap);
            setSnapMeta(meta);
          }}
          onThrowGraded={(sum) => setLastThrow(sum)}
          fullScreen={true}
        />
      </div>

      {/* COMPACT TRAINING CONTROLS - Bottom overlay */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-40 flex items-center gap-3 bg-black/80 backdrop-blur-xl border border-white/20 rounded-2xl px-6 py-3">
        <div className="text-xs uppercase tracking-wide text-emerald-400 font-semibold">NFL Defense Trainer</div>
        <div className="w-px h-6 bg-white/20"></div>
        
        {/* Compact concept selector */}
        <select
          value={conceptId}
          onChange={(e) => {
            const value = e.target.value as FootballConceptId;
            startTransition(() => setConceptId(value));
          }}
          className="bg-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none border border-white/20"
        >
          {CONCEPTS.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Compact coverage selector */}
        <select
          value={coverage}
          onChange={(e) => {
            const value = e.target.value as CoverageID;
            startTransition(() => setCoverage(value));
          }}
          className="bg-white/10 text-white text-sm rounded-lg px-3 py-2 outline-none border border-white/20"
        >
          {COVERAGES.map(cv => (
            <option key={cv} value={cv}>{COVERAGE_LABEL[cv]}</option>
          ))}
        </select>

        <div className="w-px h-6 bg-white/20"></div>

        {/* Training mode toggle */}
        <label className="flex items-center gap-2 text-white/80 text-sm cursor-pointer">
          <input type="checkbox" checked={adaptiveOn} onChange={(e)=>setAdaptiveOn(e.target.checked)} className="rounded" /> 
          <span>AI Training</span>
        </label>

        {/* Quick rep button */}
        <button
          onClick={()=>void runReps(5)}
          className="px-4 py-2 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 text-white text-sm font-medium transition-colors"
        >
          Run 5 Reps
        </button>

        {/* Session streak */}
        <div className="text-white/60 text-sm">
          Streak: <span className="text-emerald-400 font-semibold">{sessionInfo.streak}</span>
        </div>
      </div>

      {/* PERFORMANCE STATS - Top right corner */}
      <div className="absolute top-4 right-4 z-40 bg-black/80 backdrop-blur-xl border border-white/20 rounded-xl px-4 py-3 text-white min-w-48">
        <div className="text-xs uppercase tracking-wide text-emerald-400 font-semibold mb-2">Performance</div>
        {lastThrow ? (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-white/60">Grade:</span>
              <span className={`font-bold ${lastThrow.grade?.includes('A') ? 'text-emerald-400' : lastThrow.grade?.includes('B') ? 'text-yellow-400' : 'text-orange-400'}`}>
                {lastThrow.grade ?? '—'}
              </span>
            </div>
            {lastThrow.throwArea && (
              <div className="flex justify-between items-center">
                <span className="text-white/60">Target:</span>
                <span className="text-white font-medium">{lastThrow.throwArea}</span>
              </div>
            )}
            {(typeof lastThrow.catchWindowScore === 'number') && (
              <div className="flex justify-between items-center">
                <span className="text-white/60">Window:</span>
                <span className={`font-medium ${lastThrow.catchWindowScore > 0.7 ? 'text-emerald-400' : lastThrow.catchWindowScore > 0.4 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {(lastThrow.catchWindowScore * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-white/60 text-sm">
            <div className="text-amber-300 mb-1">🎯 Ready to train</div>
            <div>Make your first read to get started!</div>
          </div>
        )}
        
        {/* Session Progress */}
        <div className="mt-3 pt-2 border-t border-white/10">
          <div className="flex justify-between items-center text-xs">
            <span className="text-white/60">Session:</span>
            <span className="text-emerald-400 font-semibold">{sessionInfo.streak} reps</span>
          </div>
        </div>
      </div>
    </div>
  );
}
