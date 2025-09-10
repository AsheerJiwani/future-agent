"use client";
import { useState, useRef, useEffect } from "react";
import type { FootballConceptId } from "@data/football/catalog";
import type { CoverageID } from "@data/football/types";
import type { PlaySnapshot, SnapMeta, ThrowSummary } from "@/types/play";

type Msg = { role: 'user' | 'assistant'; content: string };

export default function TutorChat({ 
  conceptId, 
  coverage, 
  formation, 
  snapshot, 
  snapMeta, 
  lastThrow, 
  adaptiveOn = false, 
  onSetCoverage, 
  isFullScreen = false, 
  isTopBar = false,
  layoutMode = 'study',
  isDraggable = false 
}: { 
  conceptId?: FootballConceptId; 
  coverage?: CoverageID; 
  formation?: string; 
  snapshot?: PlaySnapshot; 
  snapMeta?: SnapMeta; 
  lastThrow?: ThrowSummary; 
  adaptiveOn?: boolean; 
  onSetCoverage?: (c: CoverageID)=>void; 
  isFullScreen?: boolean; 
  isTopBar?: boolean;
  layoutMode?: 'study' | 'practice' | 'coach';
  isDraggable?: boolean;
}) {
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [audiblesOn, setAudiblesOn] = useState(true);
  const [tutor, setTutor] = useState(true);
  const [quizAfter, setQuizAfter] = useState(true);
  const [loading, setLoading] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => { viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: 'smooth' }); }, [history, loading]);

  async function send(msg: string, throwCtx?: Record<string, unknown>) {
    setLoading(true);
    try {
      const res = await fetch('/api/football-tutor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conceptId, coverage, formation, snapshot, snapMeta, throwCtx, toggles: { audibles: audiblesOn, tutor, quiz: quizAfter }, history: [...history, { role:'user', content: msg }] })
      });
      const data = await res.json() as { reply?: string; improvements?: string[]; reads?: string[]; audibles?: Array<{ label?: string; formation?: string; assignments?: Record<string,string>; rationale: string }>; suggestedCoverage?: CoverageID; suggestedReason?: string; grade?: { grade: string; rationale: string; nextRead: string; coachingTip: string; letter?: string }; coverage_read?: { family: string; cues: string[] }; progression?: { step: number; text: string }[]; audible?: { formation?: string; assignments?: Record<string,string>; rationale?: string }; quiz?: { question: string; answer: string; explain: string } };
      setHistory(h => [...h, { role: 'user', content: msg }, { role: 'assistant', content: data.reply || '…' }]);
      if (data.grade) setGradeCard(data.grade);
      if (data.coverage_read) setCovRead(data.coverage_read);
      if (data.progression) setProg(data.progression);
      if (data.suggestedCoverage) setSuggested({ cov: data.suggestedCoverage, why: data.suggestedReason || '' });
      if (data.audible) setAudible(data.audible);
      if (data.audibles) setAudibleList(data.audibles);
      if (data.improvements) setImprove(data.improvements);
      if (data.reads) setReads(data.reads);
      if (data.quiz) setQuiz(data.quiz);
    } catch {
      setHistory(h => [...h, { role: 'assistant', content: 'Tutor unavailable. Try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  const [gradeCard, setGradeCard] = useState<{ grade: string; rationale: string; nextRead: string; coachingTip: string; letter?: string } | null>(null);
  const [covRead, setCovRead] = useState<{ family: string; cues: string[] } | null>(null);
  const [prog, setProg] = useState<{ step: number; text: string }[] | null>(null);
  const [suggested, setSuggested] = useState<{ cov: CoverageID; why: string } | null>(null);
  const [audible, setAudible] = useState<{ formation?: string; assignments?: Record<string,string>; rationale?: string } | null>(null);
  const [audibleList, setAudibleList] = useState<Array<{ label?: string; formation?: string; assignments?: Record<string,string>; rationale: string }> | null>(null);
  const [quiz, setQuiz] = useState<{ question: string; answer: string; explain: string } | null>(null);
  const [quizAns, setQuizAns] = useState('');
  const [quizResult, setQuizResult] = useState<'correct'|'wrong'|''>('');
  const [improve, setImprove] = useState<string[] | null>(null);
  const [reads, setReads] = useState<string[] | null>(null);

  // Auto-analyze after a graded throw
  useEffect(() => {
    if (!lastThrow) {
      console.log('[TutorChat] No lastThrow data');
      return;
    }
    
    // CRITICAL FIX: Always trigger analysis with multiple identifiers
    const shouldAnalyze = lastThrow.uniqueId || lastThrow.throwTimestamp || lastThrow.playId;
    if (!shouldAnalyze) {
      console.log('[TutorChat] Missing identifiers, skipping analysis');
      return;
    }
    
    console.log('[TutorChat] ✓ TRIGGERING AI Analysis for throw:', { 
      uniqueId: lastThrow.uniqueId,
      throwTimestamp: lastThrow.throwTimestamp,
      playId: lastThrow.playId, 
      grade: lastThrow.grade, 
      target: lastThrow.target,
      time: new Date().toISOString()
    });
    
    // Optional: track skills for adaptive drills
    if (adaptiveOn) {
      try {
        void fetch('/api/skills/track', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
            conceptId, coverage, formation,
            throw: {
              grade: lastThrow.grade,
              windowScore: lastThrow.windowScore,
              catchWindowScore: lastThrow.catchWindowScore,
              heldVsBreakMs: lastThrow.heldVsBreakMs,
              throwArea: lastThrow.throwArea,
              firstOpenId: lastThrow.firstOpenId,
              target: lastThrow.target,
            }
          })
        });
      } catch {}
    }
    
    // GUARANTEED UNIQUE: Force analysis with multiple timestamps
    const analysisRequest = {
      ...lastThrow,
      analysisTimestamp: Date.now(),
      forceAnalysis: true,
      requestId: Math.random().toString(36).substring(7)
    };
    
    console.log('[TutorChat] → Sending "Analyze last rep." with request ID:', analysisRequest.requestId);
    void send('Analyze last rep.', analysisRequest as unknown as Record<string, unknown>);
    
    // ROBUST: Multiple dependency checks to ensure triggering
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastThrow?.uniqueId, lastThrow?.throwTimestamp, lastThrow?.playId, lastThrow?.grade, lastThrow?.target]);

  // Layout-specific rendering based on mode
  if (layoutMode === 'practice') {
    // PRACTICE MODE: Minimal, non-intrusive assistance
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <div className="bg-black/90 backdrop-blur-xl rounded-lg p-3 border border-emerald-500/30 min-w-64 max-w-80 shadow-2xl">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-emerald-400">🎯 PRACTICE ASSIST</div>
            <button className="text-white/60 hover:text-white text-xs">×</button>
          </div>
          
          {/* Quick feedback only */}
          {gradeCard && (
            <div className="mb-2 p-2 bg-emerald-500/10 rounded border border-emerald-500/20">
              <div className="text-xs text-emerald-300 font-medium">{gradeCard.grade}</div>
              <div className="text-xs text-white/80 mt-1">{gradeCard.nextRead}</div>
            </div>
          )}
          
          {/* Minimal input */}
          <form className="flex gap-2" onSubmit={(e)=>{e.preventDefault(); if(!input.trim()) return; const msg=input.trim(); setInput(''); void send(msg);}}>
            <input 
              value={input} 
              onChange={(e)=>setInput(e.target.value)} 
              placeholder="Quick question..." 
              className="flex-1 bg-white/10 border border-white/20 rounded px-2 py-1 text-white text-xs placeholder-white/50 outline-none" 
            />
            <button disabled={loading} className="px-2 py-1 rounded bg-emerald-600 text-white text-xs">
              Ask
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (isTopBar) {
    // TOP BAR MODE: Horizontal layout for top bar integration
    return (
      <div className="flex items-center gap-4 h-full">
        {/* STATUS & CONTROLS - Left side */}
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
          <div className="text-sm font-semibold text-white">AI Defense Coach</div>
          <div className="flex items-center gap-3 text-xs text-white/60">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={tutor} onChange={(e)=>setTutor(e.target.checked)} className="rounded" /> 
              <span>Auto-Analysis</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={quizAfter} onChange={(e)=>setQuizAfter(e.target.checked)} className="rounded" /> 
              <span>Quiz Mode</span>
            </label>
          </div>
        </div>

        {/* AI FEEDBACK - Center flex area */}
        <div className="flex-1 flex items-center gap-3 overflow-x-auto">
          {/* Suggested Coverage Card */}
          {suggested && (
            <div className="flex-shrink-0 bg-gradient-to-r from-indigo-500/20 to-fuchsia-500/20 border border-indigo-400/30 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="text-indigo-300 text-xs font-semibold">🎯 {suggested.cov}</div>
                {onSetCoverage && (
                  <button 
                    onClick={()=>onSetCoverage(suggested.cov)} 
                    className="px-2 py-1 rounded bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition-colors"
                  >
                    Apply
                  </button>
                )}
              </div>
              {suggested.why && <div className="text-white/70 text-xs mt-1">{suggested.why}</div>}
            </div>
          )}

          {/* Grade Card */}
          {gradeCard && (
            <div className="flex-shrink-0 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-400/30 rounded-lg px-3 py-2">
              <div className="text-emerald-300 text-xs font-semibold">📊 {gradeCard.grade}</div>
              <div className="text-white/70 text-xs">{gradeCard.nextRead}</div>
            </div>
          )}

          {/* Training Prompt - Always visible when no feedback */}
          {!suggested && !gradeCard && !loading && (
            <div className="flex-shrink-0 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-400/30 rounded-lg px-3 py-2">
              <div className="text-amber-300 text-xs font-semibold mb-1">🏈 NFL DEFENSE TRAINING</div>
              <div className="text-white text-xs">
                Ready to master NFL-level defense reads? Study the coverage, read the receivers, make the perfect throw.
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex-shrink-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-400/30 rounded-lg px-3 py-2">
              <div className="text-blue-300 text-xs font-semibold">🧠 ANALYZING</div>
              <div className="flex items-center gap-1 text-blue-300">
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                <span className="text-xs ml-1">Thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* QUICK CHAT - Right side */}
        <div className="flex-shrink-0">
          <form className="flex gap-2" onSubmit={(e)=>{e.preventDefault(); if(!input.trim()) return; const msg=input.trim(); setInput(''); void send(msg);}}>
            <input 
              value={input} 
              onChange={(e)=>setInput(e.target.value)} 
              placeholder="Ask AI coach..." 
              className="w-40 bg-white/10 border border-white/20 rounded px-3 py-1.5 text-white text-sm placeholder-white/50 outline-none focus:border-white/40 transition-colors" 
            />
            <button disabled={loading} className="px-3 py-1.5 rounded bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white text-xs font-medium disabled:opacity-50 transition-opacity">
              {loading ? '...' : 'Ask'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (isFullScreen) {
    // FULL-SCREEN MODE: Smart widget positioned above route zones
    return (
      <div className="bg-black/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-2xl">
        {/* COMPACT HEADER */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
            <div className="text-sm font-semibold text-white">AI Defense Coach</div>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/60">
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={tutor} onChange={(e)=>setTutor(e.target.checked)} className="rounded" /> 
              <span>Auto-Analysis</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={quizAfter} onChange={(e)=>setQuizAfter(e.target.checked)} className="rounded" /> 
              <span>Quiz Mode</span>
            </label>
          </div>
        </div>

        {/* AI FEEDBACK CARDS - Horizontal layout */}
        <div className="p-3">
          <div className="flex gap-3 overflow-x-auto">
            {/* Suggested Coverage Card */}
            {suggested && (
              <div className="flex-shrink-0 bg-gradient-to-r from-indigo-500/20 to-fuchsia-500/20 border border-indigo-400/30 rounded-xl p-3 min-w-64">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-indigo-300 text-xs font-semibold">🎯 COVERAGE SUGGESTION</div>
                  {onSetCoverage && (
                    <button 
                      onClick={()=>onSetCoverage(suggested.cov)} 
                      className="px-2 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-medium transition-colors"
                    >
                      Apply
                    </button>
                  )}
                </div>
                <div className="text-white font-semibold">{suggested.cov}</div>
                {suggested.why && <div className="text-white/70 text-sm mt-1">{suggested.why}</div>}
              </div>
            )}

            {/* Grade Card */}
            {gradeCard && (
              <div className="flex-shrink-0 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-400/30 rounded-xl p-3 min-w-64">
                <div className="text-emerald-300 text-xs font-semibold mb-2">📊 THROW ANALYSIS</div>
                <div className="space-y-1 text-sm">
                  <div><span className="text-white/60">Grade:</span> <span className="text-white font-medium">{gradeCard.grade}</span></div>
                  <div><span className="text-white/60">Next Read:</span> <span className="text-white">{gradeCard.nextRead}</span></div>
                  <div><span className="text-white/60">Tip:</span> <span className="text-white">{gradeCard.coachingTip}</span></div>
                </div>
              </div>
            )}

            {/* Training Prompt Card - Always visible when no other feedback */}
            {!suggested && !gradeCard && !loading && (
              <div className="flex-shrink-0 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-400/30 rounded-xl p-3 min-w-80">
                <div className="text-amber-300 text-xs font-semibold mb-2">🏈 NFL DEFENSE TRAINING</div>
                <div className="text-white text-sm mb-3">
                  Ready to master NFL-level defense reads? Each rep builds game-winning instincts. Study the coverage, read the receivers, make the perfect throw.
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={()=>{ try{ window.dispatchEvent(new CustomEvent('agent-snap-now')); }catch{} }} 
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
                  >
                    Take the Snap
                  </button>
                  <button 
                    onClick={()=>{ try{ window.dispatchEvent(new CustomEvent('start-snap')); }catch{} }} 
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
                  >
                    Auto-Start
                  </button>
                </div>
                <div className="text-amber-200/80 text-xs mt-2">
                  💡 Tip: Look for leverage mismatches and coverage rotations
                </div>
              </div>
            )}

            {/* Loading State with Motivation */}
            {loading && (
              <div className="flex-shrink-0 bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-400/30 rounded-xl p-3 min-w-64">
                <div className="text-blue-300 text-xs font-semibold mb-2">🧠 ANALYZING YOUR READ</div>
                <div className="text-white text-sm mb-2">AI coach is studying your throw...</div>
                <div className="flex items-center gap-2 text-blue-300">
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                  <span className="text-sm ml-2">Thinking...</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* QUICK CHAT INPUT */}
        <div className="px-3 pb-3">
          <form className="flex gap-2" onSubmit={(e)=>{e.preventDefault(); if(!input.trim()) return; const msg=input.trim(); setInput(''); void send(msg);}}>
            <input 
              value={input} 
              onChange={(e)=>setInput(e.target.value)} 
              placeholder="Ask about reads, audibles, or coverage..." 
              className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white text-sm placeholder-white/50 outline-none focus:border-white/40 transition-colors" 
            />
            <button disabled={loading} className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white text-sm font-medium disabled:opacity-50 transition-opacity">
              {loading ? 'Thinking...' : 'Ask'}
            </button>
          </form>
        </div>

        {/* CHAT HISTORY - Collapsible */}
        {history.length > 0 && (
          <div className="mx-3 mb-3 bg-white/5 border border-white/10 rounded-lg">
            <div className="max-h-32 overflow-y-auto p-2 space-y-2 text-sm">
              {history.slice(-4).map((m,i) => (
                <div key={i} className={m.role==='assistant' ? 'text-white/90' : 'text-indigo-300'}>
                  <span className="text-[10px] px-1.5 py-0.5 rounded mr-2 bg-white/10">{m.role==='assistant'?'AI':'You'}</span>
                  <span className="align-middle">{m.content}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // COACH MODE: Enhanced analysis and feedback
  if (layoutMode === 'coach') {
    return (
      <div className="h-full flex flex-col">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur-lg flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm uppercase tracking-wide text-white font-semibold">👨‍🏫 AI FOOTBALL COACH</div>
            <div className="flex items-center gap-3 text-xs text-white/70">
              <label className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors">
                <input type="checkbox" checked={tutor} onChange={(e)=>setTutor(e.target.checked)} className="w-3 h-3 rounded border-white/30 bg-white/10 text-emerald-500" /> 
                <span>Auto-Analysis</span>
              </label>
              <label className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors">
                <input type="checkbox" checked={quizAfter} onChange={(e)=>setQuizAfter(e.target.checked)} className="w-3 h-3 rounded border-white/30 bg-white/10 text-emerald-500" /> 
                <span>Advanced Quizzing</span>
              </label>
            </div>
          </div>

          {/* Enhanced Coach Feedback Cards */}
          <div className="space-y-3 mb-4">
            {/* Detailed Grade Analysis */}
            {gradeCard && (
              <div className="bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-emerald-300 text-sm font-semibold">📊 PERFORMANCE BREAKDOWN</div>
                  {gradeCard.letter && <div className="text-lg font-bold text-emerald-400">{gradeCard.letter}</div>}
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-white/60 text-xs">Read Quality:</div>
                    <div className="text-white font-medium">{gradeCard.grade}</div>
                  </div>
                  <div>
                    <div className="text-white/60 text-xs">Next Priority:</div>
                    <div className="text-cyan-300 font-medium">{gradeCard.nextRead}</div>
                  </div>
                </div>
                <div className="mt-3 p-3 bg-black/30 rounded-lg">
                  <div className="text-white/60 text-xs mb-1">Coaching Point:</div>
                  <div className="text-white text-sm">{gradeCard.coachingTip}</div>
                </div>
              </div>
            )}

            {/* Advanced Coverage Analysis */}
            {suggested && (
              <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-indigo-300 text-sm font-semibold">🎯 TACTICAL RECOMMENDATION</div>
                  {onSetCoverage && (
                    <button 
                      onClick={()=>onSetCoverage(suggested.cov)} 
                      className="px-3 py-1 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium transition-colors"
                    >
                      Apply {suggested.cov}
                    </button>
                  )}
                </div>
                <div className="text-white text-lg font-bold mb-2">{suggested.cov}</div>
                {suggested.why && <div className="text-white/80 text-sm">{suggested.why}</div>}
              </div>
            )}
          </div>

          {/* Expansive Chat History for Coach Mode */}
          <div ref={viewportRef} className="flex-1 overflow-auto space-y-2 p-3 bg-white/5 rounded-xl mb-4 min-h-0">
            {history.map((m,i) => (
              <div key={i} className={m.role==='assistant' ? 'text-white/90' : 'text-indigo-300'}>
                <span className="text-[10px] px-2 py-0.5 rounded-full mr-2 bg-white/10">{m.role==='assistant'?'Coach':'You'}</span>
                <span className="align-middle whitespace-pre-wrap">{m.content}</span>
              </div>
            ))}
            {loading && <div className="text-white/50 text-sm italic">Coach is analyzing your play...</div>}
          </div>

          {/* Enhanced Input for Detailed Questions */}
          <form className="flex gap-2" onSubmit={(e)=>{e.preventDefault(); if(!input.trim()) return; const msg=input.trim(); setInput(''); void send(msg);}}>
            <input 
              value={input} 
              onChange={(e)=>setInput(e.target.value)} 
              placeholder="Ask detailed questions about reads, progressions, technique..." 
              className="flex-1 bg-white/10 rounded-xl px-4 py-3 text-white placeholder-white/40 outline-none border border-white/20 focus:border-white/40" 
            />
            <button disabled={loading} className="px-4 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-medium disabled:opacity-50">
              {loading ? 'Analyzing...' : 'Ask Coach'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // STUDY MODE: Traditional detailed layout  
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 md:p-4 backdrop-blur-lg">
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs uppercase tracking-wide text-white/60 font-semibold">🤖 AI Football Tutor</div>
        <div className="flex items-center gap-3 text-xs text-white/70">
          <label className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors">
            <input type="checkbox" checked={audiblesOn} onChange={(e)=>setAudiblesOn(e.target.checked)} className="w-3 h-3 rounded border-white/30 bg-white/10 text-emerald-500" /> 
            <span>Audible Suggestions</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors">
            <input type="checkbox" checked={tutor} onChange={(e)=>setTutor(e.target.checked)} className="w-3 h-3 rounded border-white/30 bg-white/10 text-emerald-500" /> 
            <span>Tutor Tips</span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer hover:text-white transition-colors">
            <input type="checkbox" checked={quizAfter} onChange={(e)=>setQuizAfter(e.target.checked)} className="w-3 h-3 rounded border-white/30 bg-white/10 text-emerald-500" /> 
            <span>Quiz after reps</span>
          </label>
        </div>
      </div>
      {/* Suggested coverage */}
      {suggested && (
        <div className="mb-2 rounded-xl bg-white/5 border border-white/10 p-2 text-white/90 text-sm flex items-center justify-between">
          <div>
            <div className="text-white/60 text-xs">Suggested Coverage</div>
            <div className="font-semibold">{suggested.cov}</div>
            {suggested.why && <div className="text-white/60">{suggested.why}</div>}
          </div>
          {onSetCoverage && (
            <div className="flex gap-2">
              <button onClick={()=>onSetCoverage(suggested.cov)} className="px-2 py-1 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white text-xs">Use Coverage</button>
              <button onClick={()=>{ onSetCoverage(suggested.cov); try{ window.dispatchEvent(new CustomEvent('agent-snap-now')); }catch{} }} className="px-2 py-1 rounded-lg bg-white/10 text-white text-xs">Use + Snap</button>
            </div>
          )}
        </div>
      )}
      {/* Grade + structure */}
      {gradeCard && (
        <div className="mb-2 rounded-xl bg-white/5 border border-white/10 p-2 text-white/90 text-sm">
          <div className="flex items-center justify-between">
            <div className="text-white/60 text-xs">Throw Feedback</div>
            {gradeCard.letter && <div className="text-xs font-semibold">Rating: {gradeCard.letter}</div>}
          </div>
          <div className="mt-1 space-y-0.5">
            <div><span className="text-white/60">Grade:</span> {gradeCard.grade}</div>
            <div><span className="text-white/60">Why:</span> {gradeCard.rationale}</div>
            <div><span className="text-white/60">Next Read:</span> {gradeCard.nextRead}</div>
            <div><span className="text-white/60">Tip:</span> {gradeCard.coachingTip}</div>
          </div>
        </div>
      )}
      {improve && improve.length>0 && (
        <div className="mb-2 rounded-xl bg-white/5 border border-white/10 p-2 text-white/90 text-sm">
          <div className="text-white/60 text-xs">What to Improve</div>
          <ul className="list-disc list-inside">{improve.map((s,i)=>(<li key={i}>{s}</li>))}</ul>
        </div>
      )}
      {reads && reads.length>0 && (
        <div className="mb-2 rounded-xl bg-white/5 border border-white/10 p-2 text-white/90 text-sm">
          <div className="text-white/60 text-xs">Reads Advice</div>
          <ul className="list-disc list-inside">{reads.map((s,i)=>(<li key={i}>{s}</li>))}</ul>
        </div>
      )}
      {audible && (audible.assignments || audible.formation) && (
        <div className="mb-2 rounded-xl bg-white/5 border border-white/10 p-2 text-white/90 text-sm flex items-center justify-between">
          <div>
            <div className="text-white/60 text-xs">Audible Suggestion</div>
            {audible.formation && <div>Formation: {audible.formation}</div>}
            {audible.assignments && (
              <ul className="list-disc list-inside">{Object.entries(audible.assignments).map(([k,v])=> (<li key={k}><span className="text-white/60">{k}:</span> {v}</li>))}</ul>
            )}
            {audible.rationale && <div className="text-white/60">{audible.rationale}</div>}
          </div>
          {audible.assignments && <button onClick={()=>{ try{ window.dispatchEvent(new CustomEvent('apply-audible',{ detail: { assignments: audible.assignments } })); }catch{} }} className="px-2 py-1 rounded-lg bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white text-xs">Apply Audible</button>}
        </div>
      )}
      {audibleList && audibleList.length>0 && (
        <div className="mb-2 rounded-xl bg-white/5 border border-white/10 p-2 text-white/90 text-sm">
          <div className="text-white/60 text-xs mb-1">Audible Ideas</div>
          <div className="space-y-2">
            {audibleList.map((a,i)=> (
              <div key={i} className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{a.label || `Audible #${i+1}`}</div>
                  {a.formation && <div className="text-white/60">Formation: {a.formation}</div>}
                  {a.assignments && <ul className="list-disc list-inside">{Object.entries(a.assignments).map(([k,v])=> (<li key={k}><span className="text-white/60">{k}:</span> {v}</li>))}</ul>}
                  <div className="text-white/60">{a.rationale}</div>
                </div>
                {a.assignments && <button onClick={()=>{ try{ window.dispatchEvent(new CustomEvent('apply-audible',{ detail: { assignments: a.assignments } })); }catch{} }} className="px-2 py-1 rounded-lg bg-white/10 text-white text-xs self-center">Apply</button>}
              </div>
            ))}
          </div>
        </div>
      )}
      {covRead && (
        <div className="mb-2 rounded-xl bg-white/5 border border-white/10 p-2 text-white/90 text-sm">
          <div className="text-white/60 text-xs">Coverage Read</div>
          <div>Family: {covRead.family}</div>
          {covRead.cues?.length ? <ul className="list-disc list-inside text-white/80">{covRead.cues.map((c,i)=>(<li key={i}>{c}</li>))}</ul>:null}
        </div>
      )}
      {prog && prog.length>0 && (
        <div className="mb-2 rounded-xl bg-white/5 border border-white/10 p-2 text-white/90 text-sm">
          <div className="text-white/60 text-xs">Progression</div>
          <ol className="list-decimal list-inside">{prog.map((p,i)=>(<li key={i}>{p.text}</li>))}</ol>
        </div>
      )}
      <div ref={viewportRef} className="h-44 md:h-56 overflow-auto space-y-2 p-2 bg-white/5 rounded-xl">
        {history.map((m,i) => (
          <div key={i} className={m.role==='assistant' ? 'text-white/90' : 'text-fuchsia-300'}>
            <span className="text-[10px] px-2 py-0.5 rounded-full mr-2 bg-white/10">{m.role==='assistant'?'Tutor':'You'}</span>
            <span className="align-middle whitespace-pre-wrap">{m.content}</span>
          </div>
        ))}
        {loading && <div className="text-white/50 text-sm italic">Tutor is thinking…</div>}
      </div>
      {quiz && (
        <div className="mt-2 rounded-xl bg-white/5 border border-white/10 p-2 text-white/90 text-sm">
          <div className="text-white/60 text-xs mb-1">Quiz</div>
          <div className="mb-2">{quiz.question}</div>
          <form className="flex gap-2" onSubmit={(e)=>{e.preventDefault(); const ok = quizAns.trim().toLowerCase() === (quiz.answer||'').trim().toLowerCase(); setQuizResult(ok?'correct':'wrong'); setHistory(h=>[...h, { role:'user', content: `Quiz: ${quizAns}` }, { role:'assistant', content: ok? '✅ Correct.' : `❌ Not quite. ${quiz.explain || ''}` }]); setQuizAns(''); }}>
            <input value={quizAns} onChange={(e)=>setQuizAns(e.target.value)} className="flex-1 bg-white/10 rounded-xl px-3 py-2 text-white placeholder-white/40 outline-none" placeholder="Your answer" />
            <button className="px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white">Submit</button>
          </form>
          {quizResult && <div className="mt-1 text-xs text-white/70">{quizResult==='correct' ? 'Nice. Keep stacking reps.' : `Answer: ${quiz.answer}`}</div>}
        </div>
      )}
      <form className="mt-2 flex gap-2" onSubmit={(e)=>{e.preventDefault(); if(!input.trim()) return; const msg=input.trim(); setInput(''); void send(msg);}}>
        <input value={input} onChange={(e)=>setInput(e.target.value)} placeholder="Ask about coverage, reads, or audibles…" className="flex-1 bg-white/10 rounded-xl px-3 py-2 text-white placeholder-white/40 outline-none" />
        <button disabled={loading} className="px-3 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white disabled:opacity-50">Send</button>
        <button type="button" onClick={()=>{ try{ window.dispatchEvent(new CustomEvent('agent-snap-now')); }catch{} }} className="px-3 py-2 rounded-xl bg-white/10 text-white">Snap</button>
        <button type="button" onClick={()=>{ try{ window.dispatchEvent(new CustomEvent('replay-at-break')); }catch{} }} className="px-3 py-2 rounded-xl bg-white/10 text-white">@Break</button>
        <button type="button" onClick={()=>{ try{ window.dispatchEvent(new CustomEvent('replay-at-catch')); }catch{} }} className="px-3 py-2 rounded-xl bg-white/10 text-white">@Catch</button>
      </form>
    </div>
  );
}
