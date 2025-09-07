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
  
  // Bottom control state
  const [motionReceiver, setMotionReceiver] = useState<string>('');
  const [motionType, setMotionType] = useState<string>('across');
  const [motionDirection, setMotionDirection] = useState<string>('left');
  const [audibleReceiver, setAudibleReceiver] = useState<string>('');
  const [audibleRoute, setAudibleRoute] = useState<string>('');
  const [teBlock, setTeBlock] = useState<boolean>(false);
  const [rbBlock, setRbBlock] = useState<boolean>(false);

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
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 pb-32">
      {/* FULL-WIDTH TOP BAR - AI Coach + Performance */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-white/20">
        <div className="flex items-stretch">
          {/* AI Defense Coach - Takes most width */}
          <div className="flex-1 p-4">
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
              isTopBar={true}
            />
          </div>
          
          {/* Performance Panel - Fixed width */}
          <div className="w-64 p-4 border-l border-white/20">
            <div className="text-xs uppercase tracking-wide text-emerald-400 font-semibold mb-3">Performance</div>
            {lastThrow ? (
              <div className="space-y-2 text-sm">
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
                <div className="pt-2 border-t border-white/10">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/60">Session:</span>
                    <span className="text-emerald-400 font-semibold">{sessionInfo.streak} reps</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-white/60 text-sm">
                <div className="text-amber-300 mb-2">🎯 Ready to train</div>
                <div>Make your first read to get started!</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MAIN FIELD AREA - Full screen simulator with top padding */}
      <div className="pt-40">
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

      {/* ENHANCED BOTTOM CONTROLS - Multiple sections */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-black/90 backdrop-blur-xl border-t border-white/20">
        <div className="px-6 py-4">
          {/* Top row - Main controls */}
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs uppercase tracking-wide text-emerald-400 font-semibold">NFL Defense Trainer</div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-white/80 text-sm">
                <input type="checkbox" checked={adaptiveOn} onChange={(e)=>setAdaptiveOn(e.target.checked)} className="w-4 h-4 rounded border-white/30 bg-white/10 text-emerald-500 focus:ring-emerald-400" /> 
                <span>AI Training</span>
              </label>
              <button
                onClick={()=>void runReps(5)}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
              >
                Run 5 Reps
              </button>
            </div>
          </div>

          {/* Bottom row - All controls organized */}
          <div className="grid grid-cols-6 gap-6 items-end">
            {/* Play Selection */}
            <div className="space-y-2">
              <div className="text-xs text-white/60 font-medium">PLAY</div>
              <select
                value={conceptId}
                onChange={(e) => {
                  const value = e.target.value as FootballConceptId;
                  startTransition(() => setConceptId(value));
                }}
                className="w-full bg-white/10 text-white text-sm rounded-lg px-3 py-2 border border-white/20 outline-none focus:border-white/40"
              >
                {CONCEPTS.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Coverage Selection */}
            <div className="space-y-2">
              <div className="text-xs text-white/60 font-medium">COVERAGE</div>
              <select
                value={coverage}
                onChange={(e) => {
                  const value = e.target.value as CoverageID;
                  startTransition(() => setCoverage(value));
                }}
                className="w-full bg-white/10 text-white text-sm rounded-lg px-3 py-2 border border-white/20 outline-none focus:border-white/40"
              >
                {COVERAGES.map(cv => (
                  <option key={cv} value={cv}>{COVERAGE_LABEL[cv]}</option>
                ))}
              </select>
            </div>

            {/* Throw Controls */}
            <div className="space-y-2">
              <div className="text-xs text-white/60 font-medium">THROW</div>
              <div className="bg-white/5 rounded-lg p-2 border border-white/10">
                <div className="text-xs text-white/80 mb-1">Target Receiver</div>
                <div className="flex gap-1">
                  {['X', 'Z', 'SLOT', 'TE', 'RB'].map(rid => (
                    <button
                      key={rid}
                      className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/20 text-white/80 border border-white/20 transition-colors"
                      onClick={() => {
                        try {
                          window.dispatchEvent(new CustomEvent('throw-to-receiver', { 
                            detail: { rid } 
                          }));
                        } catch (e) {
                          console.warn('Failed to dispatch throw event:', e);
                        }
                      }}
                    >
                      {rid}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Motion Controls */}
            <div className="space-y-2">
              <div className="text-xs text-white/60 font-medium">MOTION</div>
              <div className="bg-white/5 rounded-lg p-2 border border-white/10">
                <div className="space-y-1">
                  <select 
                    value={motionReceiver} 
                    onChange={(e) => setMotionReceiver(e.target.value)}
                    className="w-full bg-white/10 text-white text-xs rounded px-2 py-1 border border-white/20"
                  >
                    <option value="">Select Receiver</option>
                    <option value="X">X</option>
                    <option value="Z">Z</option>
                    <option value="SLOT">SLOT</option>
                    <option value="TE">TE</option>
                  </select>
                  <div className="flex gap-1">
                    <select 
                      value={motionType} 
                      onChange={(e) => setMotionType(e.target.value)}
                      className="flex-1 bg-white/10 text-white text-xs rounded px-1 py-1 border border-white/20"
                    >
                      <option value="across">Across</option>
                      <option value="jet">Jet</option>
                      <option value="short">Short</option>
                    </select>
                    <select 
                      value={motionDirection} 
                      onChange={(e) => setMotionDirection(e.target.value)}
                      className="flex-1 bg-white/10 text-white text-xs rounded px-1 py-1 border border-white/20"
                    >
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                  {motionReceiver && (
                    <button
                      onClick={() => {
                        try {
                          window.dispatchEvent(new CustomEvent('apply-motion', {
                            detail: { rid: motionReceiver, type: motionType, dir: motionDirection }
                          }));
                        } catch (e) {
                          console.warn('Failed to dispatch motion event:', e);
                        }
                      }}
                      className="w-full px-2 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors"
                    >
                      Apply Motion
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Audible Controls */}
            <div className="space-y-2">
              <div className="text-xs text-white/60 font-medium">AUDIBLE</div>
              <div className="bg-white/5 rounded-lg p-2 border border-white/10">
                <div className="space-y-1">
                  <select 
                    value={audibleReceiver} 
                    onChange={(e) => setAudibleReceiver(e.target.value)}
                    className="w-full bg-white/10 text-white text-xs rounded px-2 py-1 border border-white/20"
                  >
                    <option value="">Select Receiver</option>
                    <option value="X">X</option>
                    <option value="Z">Z</option>
                    <option value="SLOT">SLOT</option>
                    <option value="TE">TE</option>
                  </select>
                  <select 
                    value={audibleRoute} 
                    onChange={(e) => setAudibleRoute(e.target.value)}
                    className="w-full bg-white/10 text-white text-xs rounded px-2 py-1 border border-white/20"
                  >
                    <option value="">Route Change</option>
                    <option value="SLANT">SLANT</option>
                    <option value="FADE">FADE</option>
                    <option value="OUT">OUT</option>
                    <option value="COMEBACK">COMEBACK</option>
                  </select>
                  {audibleReceiver && audibleRoute && (
                    <button
                      onClick={() => {
                        try {
                          const assignments = { [audibleReceiver]: audibleRoute };
                          window.dispatchEvent(new CustomEvent('apply-audible', {
                            detail: { assignments }
                          }));
                        } catch (e) {
                          console.warn('Failed to dispatch audible event:', e);
                        }
                      }}
                      className="w-full px-2 py-1 text-xs rounded bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors"
                    >
                      Apply Audible
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Pass Protection */}
            <div className="space-y-2">
              <div className="text-xs text-white/60 font-medium">PASS PRO</div>
              <div className="bg-white/5 rounded-lg p-2 border border-white/10">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-white/80 text-xs">
                    <input 
                      type="checkbox" 
                      checked={teBlock}
                      onChange={(e) => {
                        setTeBlock(e.target.checked);
                        try {
                          window.dispatchEvent(new CustomEvent('toggle-te-block', {
                            detail: { enabled: e.target.checked }
                          }));
                        } catch (err) {
                          console.warn('Failed to dispatch TE block event:', err);
                        }
                      }}
                      className="w-3 h-3 rounded border-white/30 bg-white/10 text-emerald-500" 
                    />
                    <span>TE Block</span>
                  </label>
                  <label className="flex items-center gap-2 text-white/80 text-xs">
                    <input 
                      type="checkbox" 
                      checked={rbBlock}
                      onChange={(e) => {
                        setRbBlock(e.target.checked);
                        try {
                          window.dispatchEvent(new CustomEvent('toggle-rb-block', {
                            detail: { enabled: e.target.checked }
                          }));
                        } catch (err) {
                          console.warn('Failed to dispatch RB block event:', err);
                        }
                      }}
                      className="w-3 h-3 rounded border-white/30 bg-white/10 text-emerald-500" 
                    />
                    <span>RB Block</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
