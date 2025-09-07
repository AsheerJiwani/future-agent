"use client";
import { useState, useRef, useEffect } from "react";
import type { FootballConceptId } from "@data/football/catalog";
import type { CoverageID } from "@data/football/types";
import type { PlaySnapshot, SnapMeta, ThrowSummary } from "@/types/play";

type Msg = { role: 'user' | 'assistant'; content: string };

export default function TutorChat({ conceptId, coverage, formation, snapshot, snapMeta, lastThrow, adaptiveOn = false, onSetCoverage }: { conceptId?: FootballConceptId; coverage?: CoverageID; formation?: string; snapshot?: PlaySnapshot; snapMeta?: SnapMeta; lastThrow?: ThrowSummary; adaptiveOn?: boolean; onSetCoverage?: (c: CoverageID)=>void }) {
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
    if (!lastThrow) return;
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
              heldVsBreakMs: (lastThrow as any)?.heldVsBreakMs,
              throwArea: lastThrow.throwArea,
              firstOpenId: (lastThrow as any)?.firstOpenId,
              target: lastThrow.target,
            }
          })
        });
      } catch {}
    }
    void send('Analyze last rep.', lastThrow as unknown as Record<string, unknown>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastThrow?.playId, lastThrow?.grade]);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 md:p-4 backdrop-blur-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wide text-white/60">AI Football Tutor</div>
        <div className="flex items-center gap-3 text-xs text-white/70">
          <label className="flex items-center gap-1"><input type="checkbox" checked={audiblesOn} onChange={(e)=>setAudiblesOn(e.target.checked)} /> Audible Suggestions</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={tutor} onChange={(e)=>setTutor(e.target.checked)} /> Play Tutor</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={quizAfter} onChange={(e)=>setQuizAfter(e.target.checked)} /> Quiz after reps</label>
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
