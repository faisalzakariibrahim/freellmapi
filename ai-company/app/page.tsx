'use client';

import { useEffect, useRef, useState } from 'react';
import { ALL_AGENTS, CEO, WORKERS, type Agent } from '@/lib/company';
import { Markdown } from '@/components/Markdown';

type Status = 'idle' | 'working' | 'done' | 'error';
type AgentState = { status: Status; task?: string; output?: string; model?: string; routedVia?: string | null; usedFallback?: boolean; ms?: number; error?: string };
type Run = { id: string; at: number; goal: string; report: string; workers: Record<string, AgentState> };

const HISTORY_KEY = 'ai-company:history';
const MODELS_KEY = 'ai-company:models';
const EXAMPLES = [
  'Launch our AI + cybersecurity agency for small businesses in New Jersey within 30 days.',
  'Plan a security audit offering for startups shipping LLM features.',
  'Should we turn MuslimPromax into a paid app? Give me a go-to-market plan.',
];

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

const blank = (): Record<string, AgentState> => Object.fromEntries(ALL_AGENTS.map((a) => [a.id, { status: 'idle' as Status }]));

export default function Home() {
  const [goal, setGoal] = useState('');
  const [running, setRunning] = useState(false);
  const [state, setState] = useState<Record<string, AgentState>>(blank);
  const [plan, setPlan] = useState<string>('');
  const [report, setReport] = useState('');
  const [error, setError] = useState('');
  const [models, setModels] = useState<Record<string, string>>({});
  const [showModels, setShowModels] = useState(false);
  const [history, setHistory] = useState<Run[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setModels(load(MODELS_KEY, {}));
    setHistory(load(HISTORY_KEY, []));
  }, []);

  const patch = (id: string, p: Partial<AgentState>) => setState((s) => ({ ...s, [id]: { ...s[id], ...p } }));
  const modelFor = (a: Agent) => models[a.id] || a.model;

  async function run() {
    if (!goal.trim() || running) return;
    setRunning(true);
    setError('');
    setReport('');
    setPlan('');
    const fresh = blank();
    fresh.ceo = { status: 'working' };
    setState(fresh);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const outputs: Record<string, AgentState> = {};
    let finalReport = '';

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, models }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const e = JSON.parse(line);
          switch (e.type) {
            case 'plan':
              setPlan(e.summary);
              patch('ceo', { status: 'idle', model: e.model, routedVia: e.routedVia, usedFallback: e.usedFallback });
              for (const a of e.assignments) patch(a.workerId, { task: a.task });
              break;
            case 'worker_start':
              patch(e.workerId, { status: 'working' });
              break;
            case 'worker_done':
              outputs[e.workerId] = { status: 'done', output: e.output, model: e.model };
              patch(e.workerId, { status: 'done', output: e.output, model: e.model, routedVia: e.routedVia, usedFallback: e.usedFallback, ms: e.ms });
              break;
            case 'worker_error':
              patch(e.workerId, { status: 'error', error: e.error });
              break;
            case 'ceo_start':
              patch('ceo', { status: 'working' });
              break;
            case 'report':
              finalReport = e.output;
              setReport(e.output);
              patch('ceo', { status: 'done', model: e.model, routedVia: e.routedVia, usedFallback: e.usedFallback, ms: e.ms });
              break;
            case 'error':
              throw new Error(e.error);
          }
        }
      }
      if (finalReport) {
        const entry: Run = { id: crypto.randomUUID(), at: Date.now(), goal, report: finalReport, workers: outputs };
        const next = [entry, ...history].slice(0, 10);
        setHistory(next);
        save(HISTORY_KEY, next);
      }
    } catch (err) {
      if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : String(err));
      setState((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v.status === 'working' ? { ...v, status: 'error' as Status } : v])));
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function openRun(r: Run) {
    setGoal(r.goal);
    setReport(r.report);
    setPlan('');
    setError('');
    setState({ ...blank(), ...r.workers, ceo: { status: 'done' } });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function setModel(id: string, value: string) {
    const next = { ...models, [id]: value.trim() };
    if (!value.trim()) delete next[id];
    setModels(next);
    save(MODELS_KEY, next);
  }

  return (
    <main>
      <header className="top">
        <div>
          <h1>AI Company</h1>
          <p className="muted">Give the CEO a goal. It delegates to {WORKERS.length} department heads, each running on its own model through FreeLLMAPI, then reports back.</p>
        </div>
        <button className="ghost" onClick={() => setShowModels((v) => !v)}>{showModels ? 'Hide' : 'Edit'} models</button>
      </header>

      {showModels && (
        <section className="card models">
          <h2>Model allocation</h2>
          <p className="muted small">Any FreeLLMAPI model id or routing strategy (<code>auto:smart</code>, <code>auto:fast</code>…). Leave blank for the default. If a model fails, the agent falls back to its <code>auto:*</code> strategy.</p>
          {ALL_AGENTS.map((a) => (
            <label key={a.id} className="model-row">
              <span>{a.emoji} {a.title}</span>
              <input value={models[a.id] ?? ''} placeholder={a.model} onChange={(e) => setModel(a.id, e.target.value)} spellCheck={false} />
              <span className="muted small">{a.why}</span>
            </label>
          ))}
        </section>
      )}

      <section className="card">
        <textarea
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="What should the company work on?"
          rows={3}
          maxLength={4000}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) run(); }}
        />
        <div className="row">
          <div className="chips">
            {EXAMPLES.map((x) => <button key={x} className="chip" onClick={() => setGoal(x)} disabled={running}>{x.slice(0, 42)}…</button>)}
          </div>
          {running
            ? <button className="danger" onClick={() => abortRef.current?.abort()}>Stop</button>
            : <button className="primary" onClick={run} disabled={!goal.trim()}>Run company</button>}
        </div>
        {error && <p className="error">⚠️ {error}</p>}
      </section>

      <section className="org">
        <AgentCard agent={CEO} s={state.ceo} model={modelFor(CEO)} extra={plan ? <p className="plan"><strong>Plan:</strong> {plan}</p> : null} />
        <div className="reports-line" aria-hidden />
        <div className="grid">
          {WORKERS.map((w) => <AgentCard key={w.id} agent={w} s={state[w.id]} model={modelFor(w)} />)}
        </div>
      </section>

      {report && (
        <section className="card report">
          <div className="row">
            <h2>👔 CEO report</h2>
            <button className="ghost" onClick={() => navigator.clipboard?.writeText(report)}>Copy</button>
          </div>
          <Markdown text={report} />
        </section>
      )}

      {history.length > 0 && (
        <section className="card">
          <div className="row">
            <h2>Past runs</h2>
            <button className="ghost" onClick={() => { setHistory([]); save(HISTORY_KEY, []); }}>Clear</button>
          </div>
          <ul className="history">
            {history.map((r) => (
              <li key={r.id}><button className="link" onClick={() => openRun(r)}>{r.goal.slice(0, 90)}</button> <span className="muted small">{new Date(r.at).toLocaleString()}</span></li>
            ))}
          </ul>
          <p className="muted small">Saved in this browser only.</p>
        </section>
      )}
    </main>
  );
}

function AgentCard({ agent, s, model, extra }: { agent: Agent; s?: AgentState; model: string; extra?: React.ReactNode }) {
  const st = s ?? { status: 'idle' as Status };
  const [open, setOpen] = useState(false);
  return (
    <article className={`agent ${st.status} ${agent.id === 'ceo' ? 'ceo' : ''}`}>
      <div className="agent-head">
        <span className="emoji">{agent.emoji}</span>
        <div className="grow">
          <h3>{agent.title}</h3>
          <p className="model" title={agent.why}>
            {st.model && st.model !== model ? <>{model} → <b>{st.model}</b></> : model}
            {st.routedVia && <> · via {st.routedVia}</>}
            {st.usedFallback && <span className="tag">fallback</span>}
          </p>
        </div>
        <span className={`dot ${st.status}`} title={st.status} />
      </div>
      {extra}
      {st.task && agent.id !== 'ceo' && <p className="task"><strong>Task:</strong> {st.task}</p>}
      {st.status === 'working' && <p className="muted small pulse">Working…</p>}
      {st.status === 'error' && st.error && <p className="error small">{st.error}</p>}
      {st.output && (
        <>
          <button className="link" onClick={() => setOpen((v) => !v)}>{open ? 'Hide report' : 'Read report'}{st.ms ? ` · ${(st.ms / 1000).toFixed(1)}s` : ''}</button>
          {open && <Markdown text={st.output} />}
        </>
      )}
    </article>
  );
}
