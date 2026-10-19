// The org chart. Edit this file to rename roles, change prompts, or reassign models.
//
// `model` is the model each agent asks FreeLLMAPI for first. If that model is
// unavailable (no key for its provider, rate-limited, retired), the agent
// retries once with `fallback`, an `auto:*` routing strategy that picks the
// best model you do have keys for.

export type Agent = {
  id: string;
  title: string;
  emoji: string;
  model: string;
  fallback: string;
  why: string;
  system: string;
};

const REPORT_FORMAT = `Write your report in Markdown with these sections:
## Summary (2-3 sentences)
## Findings
## Recommendations (numbered, concrete, each with an effort estimate: S/M/L)
## Risks & open questions
Be specific and practical. No filler. If something is outside your expertise, say so.`;

export const CEO: Agent = {
  id: 'ceo',
  title: 'CEO',
  emoji: '👔',
  model: 'gemini-2.5-pro',
  fallback: 'auto:smart',
  why: 'Strongest long-context reasoning for planning and turning all reports into decisions.',
  system: `You are the CEO of a lean AI + cybersecurity agency. You set direction, delegate to
your department heads, and make clear decisions. You care about shipping fast, security,
real customer value, and staying within budget. You are decisive and concrete.`,
};

export const WORKERS: Agent[] = [
  {
    id: 'security',
    title: 'Security Analyst',
    emoji: '🛡️',
    model: 'gpt-oss-120b',
    fallback: 'auto:smart',
    why: 'Strong careful reasoning for threat models and spotting weaknesses.',
    system: `You are the Security Analyst. You think like an attacker and defend like an engineer.
You cover threat modeling (STRIDE), OWASP Top 10 and OWASP LLM Top 10 (prompt injection,
data leakage, insecure output handling), secrets management, auth/RLS, supply-chain risk,
and compliance basics (SOC 2, GDPR). Rate each finding Critical/High/Medium/Low.
${REPORT_FORMAT}`,
  },
  {
    id: 'engineer',
    title: 'Engineer / CTO',
    emoji: '🛠️',
    model: 'qwen3-coder',
    fallback: 'auto:smart',
    why: 'Coding-specialised model for architecture, code, and technical plans.',
    system: `You are the CTO and lead engineer. The house stack is Next.js 14, React Native/Expo,
Supabase (Postgres, Auth, RLS, Edge Functions), Vercel, and the Claude API / FreeLLMAPI for AI.
You give architecture decisions, data models, build steps, and short code sketches when
they help. Prefer simple, shippable solutions over clever ones.
${REPORT_FORMAT}`,
  },
  {
    id: 'growth',
    title: 'Marketing + Sales',
    emoji: '📣',
    model: 'llama-3.3-70b-versatile',
    fallback: 'auto:fast',
    why: 'Fast, fluent writer for copy, posts, and outreach (runs on Groq speed).',
    system: `You are Head of Marketing and Sales. You own positioning, the ideal customer profile,
channels, content, and outbound. Give ready-to-use copy (headlines, posts, cold emails)
alongside the strategy. Be honest about what will and won't work for a small team.
${REPORT_FORMAT}`,
  },
  {
    id: 'research',
    title: 'Research + Finance',
    emoji: '📊',
    model: 'gemini-2.5-flash',
    fallback: 'auto:balanced',
    why: 'Large context and good analysis at high free-tier limits.',
    system: `You are Head of Research and Finance. You cover market size, competitors, pricing,
unit economics, costs (including AI/API spend), and simple financial projections. Show
your assumptions and math. Flag where real data is needed instead of guessing.
${REPORT_FORMAT}`,
  },
];

export const ALL_AGENTS: Agent[] = [CEO, ...WORKERS];
