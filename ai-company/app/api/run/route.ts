import { ALL_AGENTS } from '@/lib/company';
import { isValidModel } from '@/lib/llm';
import { runCompany, type ModelOverrides, type RunEvent } from '@/lib/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_GOAL = 4000;

// Basic in-memory limiter: each run fans out to ~6 model calls, so cap runs per minute.
const WINDOW_MS = 60_000;
const MAX_RUNS_PER_WINDOW = 5;
const recent: number[] = [];

export async function POST(req: Request) {
  const now = Date.now();
  while (recent.length && now - recent[0] > WINDOW_MS) recent.shift();
  if (recent.length >= MAX_RUNS_PER_WINDOW) {
    return Response.json({ error: 'Too many runs. Wait a minute and try again.' }, { status: 429 });
  }

  let body: { goal?: unknown; models?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
  if (!goal) return Response.json({ error: 'Give the CEO a goal.' }, { status: 400 });
  if (goal.length > MAX_GOAL) return Response.json({ error: `Goal is too long (max ${MAX_GOAL} characters).` }, { status: 400 });

  // Only accept overrides for known agents, with safe model ids.
  const overrides: ModelOverrides = {};
  if (body.models && typeof body.models === 'object') {
    for (const a of ALL_AGENTS) {
      const m = (body.models as Record<string, unknown>)[a.id];
      if (m !== undefined && m !== '' && m !== a.model) {
        if (!isValidModel(m)) return Response.json({ error: `Invalid model id for ${a.title}` }, { status: 400 });
        overrides[a.id] = m;
      }
    }
  }

  recent.push(now);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: RunEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
      try {
        await runCompany(goal, overrides, emit, req.signal);
        emit({ type: 'done' });
      } catch (err) {
        if (!req.signal.aborted) {
          console.error('[ai-company] run failed:', err);
          emit({ type: 'error', error: err instanceof Error ? err.message : 'Run failed' });
        }
      } finally {
        try { controller.close(); } catch { /* client went away */ }
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  });
}
