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
      {/* SIDE-BY-SIDE LAYOUT - Full screen, no padding */}
      <div className="flex min-h-screen">
        {/* LEFT SIDE - PlaySimulator + Controls (expanded width, closer to edge) */}
        <div className="flex-1 flex flex-col pl-1 pr-0.5">
          {/* PlaySimulator Area with Performance Overlay */}
          <div className="flex-1 relative min-h-0">
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
            
            {/* Performance Widget - Top-left inside PlaySimulator */}
            <div className="absolute top-16 left-4 z-40 bg-black/80 backdrop-blur-xl border border-white/20 rounded-xl px-4 py-3 text-white min-w-48">
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

          {/* REDESIGNED CONTROL PANEL - User-friendly design */}
          <div className="bg-gradient-to-r from-black/95 via-slate-900/95 to-black/95 backdrop-blur-xl border-t border-white/20 shadow-2xl flex-shrink-0">
            {/* Top Section - Primary Actions */}
            <div className="px-6 py-4 border-b border-white/10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                  <div className="text-sm font-bold text-white">NFL Defense Trainer</div>
                  <div className="text-xs text-emerald-400 font-semibold">CONTROL CENTER</div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-white/80 text-sm cursor-pointer hover:text-white transition-colors">
                    <input type="checkbox" checked={adaptiveOn} onChange={(e)=>setAdaptiveOn(e.target.checked)} className="w-4 h-4 rounded border-white/30 bg-white/10 text-emerald-500 focus:ring-emerald-400" /> 
                    <span>AI Training</span>
                  </label>
                  <button
                    onClick={()=>void runReps(5)}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white text-sm font-semibold shadow-lg transition-all transform hover:scale-105"
                  >
                    🚀 Run 5 Reps
                  </button>
                </div>
              </div>
            </div>

            {/* Main Controls Grid - Better organized */}
            <div className="px-4 py-3">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                
                {/* Column 1: Core Setup */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1">🏈 CORE SETUP</div>
                  
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-white/90 font-medium flex items-center gap-1">Play Concept</label>
                      <select
                        value={conceptId}
                        onChange={(e) => {
                          const value = e.target.value as FootballConceptId;
                          startTransition(() => setConceptId(value));
                        }}
                        className="w-full bg-gradient-to-r from-white/15 to-white/10 text-white text-sm rounded-lg px-3 py-2 border border-white/30 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 transition-all hover:bg-white/20"
                      >
                        {CONCEPTS.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-white/90 font-medium flex items-center gap-1">Coverage</label>
                      <select
                        value={coverage}
                        onChange={(e) => {
                          const value = e.target.value as CoverageID;
                          startTransition(() => setCoverage(value));
                        }}
                        className="w-full bg-gradient-to-r from-white/15 to-white/10 text-white text-sm rounded-lg px-3 py-2 border border-white/30 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30 transition-all hover:bg-white/20"
                      >
                        {COVERAGES.map(cv => (
                          <option key={cv} value={cv}>{COVERAGE_LABEL[cv]}</option>
                        ))}
                      </select>
                    </div>
                </div>

                {/* Column 2: Action Controls */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1">⚡ ACTIONS</div>
                  
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-white/90 font-medium">Snap Controls</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          onClick={() => {
                            try {
                              window.dispatchEvent(new CustomEvent('agent-snap-now'));
                            } catch (e) {
                              console.warn('Failed to dispatch snap event:', e);
                            }
                          }}
                          className="px-2.5 py-2 text-xs rounded-md bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white font-semibold transition-all transform hover:scale-105 shadow-md"
                        >
                          Snap
                        </button>
                        <button
                          onClick={() => {
                            try {
                              window.dispatchEvent(new CustomEvent('replay-at-break'));
                            } catch (e) {
                              console.warn('Failed to dispatch break event:', e);
                            }
                          }}
                          className="px-2.5 py-2 text-xs rounded-md bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-semibold transition-all transform hover:scale-105 shadow-md"
                        >
                          @Break
                        </button>
                        <button
                          onClick={() => {
                            try {
                              window.dispatchEvent(new CustomEvent('replay-at-catch'));
                            } catch (e) {
                              console.warn('Failed to dispatch catch event:', e);
                            }
                          }}
                          className="px-2.5 py-2 text-xs rounded-md bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-semibold transition-all transform hover:scale-105 shadow-md"
                        >
                          @Catch
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-white/90 font-medium">Throw Targets</label>
                      <div className="grid grid-cols-5 gap-1">
                        {['X', 'Z', 'SLOT', 'TE', 'RB'].map(rid => (
                          <button
                            key={rid}
                            className="px-2 py-1.5 text-xs rounded-md bg-gradient-to-r from-white/15 to-white/10 hover:from-indigo-600 hover:to-indigo-700 text-white/90 hover:text-white border border-white/30 hover:border-indigo-400 transition-all transform hover:scale-105 font-semibold shadow-sm"
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

                {/* Column 3: Motion & Audibles */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1">🔄 ADJUSTMENTS</div>
                  
                  <div className="space-y-1.5">
                    <label className="text-xs text-white/90 font-medium">Motion</label>
                    <div className="space-y-2">
                      <select 
                        value={motionReceiver} 
                        onChange={(e) => setMotionReceiver(e.target.value)}
                        className="w-full bg-gradient-to-r from-white/15 to-white/10 text-white text-xs rounded-md px-2.5 py-1.5 border border-white/30 outline-none focus:border-emerald-400 transition-all hover:bg-white/20"
                      >
                        <option value="">Select Receiver</option>
                        <option value="X">X</option>
                        <option value="Z">Z</option>
                        <option value="SLOT">SLOT</option>
                        <option value="TE">TE</option>
                      </select>
                      <div className="grid grid-cols-2 gap-1.5">
                        <select 
                          value={motionType} 
                          onChange={(e) => setMotionType(e.target.value)}
                          className="bg-gradient-to-r from-white/15 to-white/10 text-white text-xs rounded-md px-2 py-1.5 border border-white/30 outline-none focus:border-emerald-400 transition-all hover:bg-white/20"
                        >
                          <option value="across">Across</option>
                          <option value="jet">Jet</option>
                          <option value="short">Short</option>
                        </select>
                        <select 
                          value={motionDirection} 
                          onChange={(e) => setMotionDirection(e.target.value)}
                          className="bg-gradient-to-r from-white/15 to-white/10 text-white text-xs rounded-md px-2 py-1.5 border border-white/30 outline-none focus:border-emerald-400 transition-all hover:bg-white/20"
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
                          className="w-full px-3 py-1.5 text-xs rounded-md bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 text-white font-semibold transition-all transform hover:scale-105 shadow-md"
                        >
                          Apply Motion
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Column 4: Advanced Options */}
                <div className="space-y-3">
                  <div className="text-xs font-semibold text-emerald-400 mb-2 flex items-center gap-1">⚙️ ADVANCED</div>
                  
                  <div className="space-y-1.5">
                    <label className="text-xs text-white/90 font-medium">Audibles</label>
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-1.5">
                        <select 
                          value={audibleReceiver} 
                          onChange={(e) => setAudibleReceiver(e.target.value)}
                          className="bg-gradient-to-r from-white/15 to-white/10 text-white text-xs rounded-md px-2 py-1.5 border border-white/30 outline-none focus:border-emerald-400 transition-all hover:bg-white/20"
                        >
                          <option value="">Receiver</option>
                          <option value="X">X</option>
                          <option value="Z">Z</option>
                          <option value="SLOT">SLOT</option>
                          <option value="TE">TE</option>
                        </select>
                        <select 
                          value={audibleRoute} 
                          onChange={(e) => setAudibleRoute(e.target.value)}
                          className="bg-gradient-to-r from-white/15 to-white/10 text-white text-xs rounded-md px-2 py-1.5 border border-white/30 outline-none focus:border-emerald-400 transition-all hover:bg-white/20"
                        >
                          <option value="">Route</option>
                          <option value="SLANT">SLANT</option>
                          <option value="FADE">FADE</option>
                          <option value="OUT">OUT</option>
                          <option value="COMEBACK">COMEBACK</option>
                          <option value="HITCH">HITCH</option>
                          <option value="GO">GO</option>
                          <option value="CURL">CURL</option>
                          <option value="DIG">DIG</option>
                        </select>
                      </div>
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
                          className="w-full px-3 py-1.5 text-xs rounded-md bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-semibold transition-all transform hover:scale-105 shadow-md"
                        >
                          Apply Audible
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-white/90 font-medium">Pass Protection</label>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 text-white/90 text-xs cursor-pointer hover:text-white transition-colors">
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
                          className="w-3 h-3 rounded border-white/40 bg-white/15 text-emerald-500 focus:ring-emerald-400" 
                        />
                        <span>TE Block</span>
                      </label>
                      <label className="flex items-center gap-2 text-white/90 text-xs cursor-pointer hover:text-white transition-colors">
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
                          className="w-3 h-3 rounded border-white/40 bg-white/15 text-emerald-500 focus:ring-emerald-400" 
                        />
                        <span>RB Block</span>
                      </label>
                      <label className="flex items-center gap-2 text-white/90 text-xs cursor-pointer hover:text-white transition-colors">
                        <input 
                          type="checkbox" 
                          className="w-3 h-3 rounded border-white/40 bg-white/15 text-emerald-500 focus:ring-emerald-400" 
                        />
                        <span>Snap on Motion</span>
                      </label>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SIDE - AI Defense Coach (expanded width, closer to edge) */}
        <div className="w-[32rem] border-l border-white/20 bg-black/40 backdrop-blur-xl flex flex-col pl-0.5 pr-1">
          <div className="flex-1 p-3 flex flex-col h-full">
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
    </div>
  );
}