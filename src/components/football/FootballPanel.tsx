"use client";
import { useEffect, useState, useRef, startTransition } from "react";
import { getOrCreateUserId } from "../../lib/user";
import type { PlaySnapshot, SnapMeta, ThrowSummary } from "../../types/play";
import PlaySimulator from "./PlaySimulator";
import { CONCEPTS, type FootballConceptId } from "../../data/football/catalog";
import type { CoverageID } from "../../data/football/types";
import TutorChat from "./TutorChat";

// Types (keeping existing ones)
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

const COVERAGES: CoverageID[] = ["C0", "C1", "C2", "TAMPA2", "PALMS", "C3", "C4", "QUARTERS", "C6", "C9"];
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
  // State variables (keeping existing ones)
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
    suggestion: {
      suggestedCoverage?: CoverageID;
      suggestedFormation?: 'TRIPS_RIGHT'|'DOUBLES'|'BUNCH_LEFT';
      motions?: Array<{ rid: 'X'|'Z'|'SLOT'|'TE'|'RB'; type?: 'jet'|'short'|'across'; dir?: 'left'|'right' }>;
      fireZone?: { on: boolean; preset?: 'NICKEL'|'SAM'|'WILL' };
    };
  } | null>(null);
  const [autoRun, setAutoRun] = useState<{ on: boolean; left: number }>({ on: false, left: 0 });
  const autoRunRef = useRef<{ on: boolean; left: number }>({ on: false, left: 0 });
  const [routines, setRoutines] = useState<Array<{ name: string; drill: { coverage?: CoverageID; formation?: 'TRIPS_RIGHT'|'DOUBLES'|'BUNCH_LEFT'; motions?: Array<{ rid: 'X'|'Z'|'SLOT'|'TE'|'RB'; type?: 'jet'|'short'|'across'; dir?: 'left'|'right' }>; fireZone?: { on: boolean; preset?: 'NICKEL'|'SAM'|'WILL' } } }>>([]);
  const [routineName, setRoutineName] = useState<string>('');
  
  // Bottom control state
  const [motionReceiver, setMotionReceiver] = useState<string>('');
  const [motionType, setMotionType] = useState<string>('across');
  const [motionDirection, setMotionDirection] = useState<string>('left');
  const [audibleReceiver, setAudibleReceiver] = useState<string>('');
  const [audibleRoute, setAudibleRoute] = useState<string>('');
  const [teBlock, setTeBlock] = useState<boolean>(false);
  const [rbBlock, setRbBlock] = useState<boolean>(false);

  // All existing useEffect hooks would go here (keeping them from original)
  
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
        if (data.routines) setRoutines(data.routines);
      } catch {}
    })();
  }, [userId]);

  // Auto rep running functionality
  async function runReps(n: number) {
    setAutoRun({ on: true, left: n });
    autoRunRef.current = { on: true, left: n };
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
    autoRunRef.current = { on: false, left: 0 };
    try { window.dispatchEvent(new CustomEvent('auto-run-status', { detail: { active: false, left: 0, nextIn: 0 } })); } catch {}
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* LEFT SIDEBAR + MAIN CONTENT LAYOUT */}
      <div className="flex h-screen">
        {/* LEFT SIDEBAR - Control Center (Fixed Width) */}
        <div className="bg-black/95 backdrop-blur-xl border-r border-white/20 flex flex-col max-h-screen overflow-hidden" style={{ width: '288px', minWidth: '288px', flexShrink: 0 }}>
          {/* Header */}
          <div className="px-4 py-3 border-b border-white/10 bg-gradient-to-r from-emerald-500/10 to-cyan-500/10">
            <div className="text-sm font-bold text-emerald-400">🏈 GAME CONTROLS</div>
          </div>
          
          {/* Scrollable Controls */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Essential Controls */}
            <div className="space-y-3">
              <div className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Essential</div>
              
              {/* Play Concept */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-white/80">PLAY CONCEPT</div>
                <select
                  value={conceptId}
                  onChange={(e) => {
                    const value = e.target.value as FootballConceptId;
                    startTransition(() => setConceptId(value));
                  }}
                  className="w-full bg-white/10 text-white text-sm rounded-lg px-3 py-2 border border-white/20 outline-none focus:border-emerald-400"
                >
                  {CONCEPTS.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Coverage */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-white/80">COVERAGE</div>
                <select
                  value={coverage}
                  onChange={(e) => {
                    const value = e.target.value as CoverageID;
                    startTransition(() => setCoverage(value));
                  }}
                  className="w-full bg-white/10 text-white text-sm rounded-lg px-3 py-2 border border-white/20 outline-none focus:border-emerald-400"
                >
                  {COVERAGES.map(cv => (
                    <option key={cv} value={cv}>{COVERAGE_LABEL[cv]}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Game Controls */}
            <div className="space-y-3">
              <div className="text-xs font-semibold text-purple-300 uppercase tracking-wider">Game Controls</div>
              
              {/* SNAP and RESET buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    try {
                      window.dispatchEvent(new CustomEvent('agent-snap-now'));
                    } catch (e) {
                      console.warn('Failed to dispatch snap event:', e);
                    }
                  }}
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold transition-all transform hover:scale-105 shadow-lg"
                >
                  🏈 SNAP
                </button>
                <button
                  onClick={() => {
                    try {
                      window.dispatchEvent(new CustomEvent('hard-reset'));
                    } catch (e) {
                      console.warn('Failed to dispatch reset event:', e);
                    }
                  }}
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold transition-all transform hover:scale-105 shadow-lg"
                >
                  🔄 RESET
                </button>
              </div>

              {/* Quick Throw Targets */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-white/80">QUICK THROW</div>
                <div className="grid grid-cols-3 gap-1">
                  {['X', 'Z', 'SLOT', 'TE', 'RB'].map(rid => (
                    <button
                      key={rid}
                      className="px-2 py-2 text-xs rounded-md bg-purple-500/20 hover:bg-purple-500/40 text-white border border-purple-500/30 transition-all hover:scale-105 font-medium"
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

            {/* Advanced Controls */}
            <div className="space-y-3">
              <div className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">Advanced</div>
              
              {/* Pass Protection */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-white/80">PASS PROTECTION</div>
                <div className="space-y-2">
                  <label className="flex items-center justify-between p-2 bg-black/30 rounded border border-red-500/20 cursor-pointer">
                    <span className="text-xs text-white">TE Block</span>
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
                      className="w-3 h-3 rounded border-red-500/30 bg-black/30 text-red-500" 
                    />
                  </label>
                  
                  <label className="flex items-center justify-between p-2 bg-black/30 rounded border border-red-500/20 cursor-pointer">
                    <span className="text-xs text-white">RB Block</span>
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
                      className="w-3 h-3 rounded border-red-500/30 bg-black/30 text-red-500" 
                    />
                  </label>
                </div>
              </div>

              {/* AI Training */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-white/80 text-xs">
                    <input type="checkbox" checked={adaptiveOn} onChange={(e)=>setAdaptiveOn(e.target.checked)} className="w-3 h-3 rounded border-white/30 bg-white/10 text-emerald-500" /> 
                    <span>AI Training</span>
                  </label>
                </div>
                <button
                  onClick={()=>void runReps(5)}
                  className="w-full px-3 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
                >
                  ⚡ Run 5 Reps
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex">
          {/* PlaySimulator Area */}
          <div className="flex-1 relative">
            <PlaySimulator
              conceptId={conceptId}
              coverage={coverage}
              onSnapshot={(s, meta) => {
                setSnapshot(s);
                setSnapMeta(meta);
              }}
              onThrowGraded={(t) => setLastThrow(t)}
              fullScreen={false}
            />
            
            {/* Performance Widget - Top-right corner of PlaySimulator border */}
            <div className="absolute top-19 right-5 z-40 bg-black/90 backdrop-blur-xl border border-white/30 rounded-lg px-3 py-2 text-white min-w-44 shadow-lg">
              <div className="text-xs uppercase tracking-wide text-emerald-400 font-semibold mb-2">Performance</div>
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

          {/* RIGHT SIDEBAR - AI Tutor */}
          <div className="w-80 border-l border-white/20 bg-black/40 backdrop-blur-xl">
            <div className="h-full p-4">
              <TutorChat 
                adaptiveOn={adaptiveOn} 
                conceptId={conceptId} 
                coverage={coverage} 
                formation={snapshot?.formation} 
                snapshot={snapshot} 
                snapMeta={snapMeta} 
                lastThrow={lastThrow} 
                onSetCoverage={(c)=>setCoverage(c)}
                isFullScreen={false}
                isTopBar={false}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}