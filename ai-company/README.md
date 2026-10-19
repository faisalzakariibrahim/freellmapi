# AI Company

A dashboard where a **CEO agent** takes your goal, assigns a task to each department head,
runs them **in parallel on their own models**, then reads every report and writes a final
decision memo with an action plan. All model calls go through your local
[FreeLLMAPI](../README.md) router, so it runs on free-tier models.

```
                 You (founder) ── goal ──▶ 👔 CEO  (gemini-2.5-pro)
                                              │ plans 1 task per dept
         ┌──────────────────┬─────────────────┼──────────────────┐
         ▼                  ▼                 ▼                  ▼
  🛡️ Security Analyst  🛠️ Engineer / CTO  📣 Marketing+Sales  📊 Research+Finance
    gpt-oss-120b        qwen3-coder        llama-3.3-70b       gemini-2.5-flash
         └──────────────────┴──── reports ────┴──────────────────┘
                                              ▼
                                   👔 CEO report → you
```

## Model allocation

| Agent | Default model | Fallback | Why |
|---|---|---|---|
| 👔 CEO | `gemini-2.5-pro` | `auto:smart` | Best long-context reasoning to plan and merge reports |
| 🛡️ Security Analyst | `gpt-oss-120b` | `auto:smart` | Careful reasoning for threat models (STRIDE, OWASP, OWASP LLM Top 10) |
| 🛠️ Engineer / CTO | `qwen3-coder` | `auto:smart` | Coding-specialised for architecture and code |
| 📣 Marketing + Sales | `llama-3.3-70b-versatile` | `auto:fast` | Fast, fluent copywriter |
| 📊 Research + Finance | `gemini-2.5-flash` | `auto:balanced` | Big context, high free limits, good at analysis |

If a model isn't available (no key for that provider, rate-limited), the agent retries once
with its `auto:*` fallback and the card shows a **fallback** tag plus the model that actually
answered. You can change any model from **Edit models** in the UI (saved in your browser), or
permanently in [`lib/company.ts`](lib/company.ts), which also holds each role's system prompt.

## Install (on your PC)

### 1. Run FreeLLMAPI (the router)

With Docker Desktop installed:

```bash
git clone https://github.com/faisalzakariibrahim/freellmapi.git
cd freellmapi
ENCRYPTION_KEY="$(openssl rand -hex 32)"
printf "ENCRYPTION_KEY=%s\nPORT=3001\n" "$ENCRYPTION_KEY" > .env
docker compose up -d
```

Windows PowerShell: replace the two key lines with

```powershell
$b = New-Object Byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
"ENCRYPTION_KEY=$(-join ($b | % { '{0:x2}' -f $_ }))`nPORT=3001" | Out-File -Encoding utf8 .env
```

No Docker? Use Node 20+ instead: `npm install` then `npm run dev` (same `.env`).

Then open **http://localhost:3001**:

1. **Keys page** → add free provider keys. More keys means more models. Good free ones to start with:
   Google AI Studio (Gemini), Groq (Llama, gpt-oss), Cerebras, OpenRouter, Mistral.
2. Copy the **unified API key** from the Keys page header.

Back up the `ENCRYPTION_KEY` in your `.env`. Without it, your stored provider keys can't be decrypted.

### 2. Run the AI Company dashboard

```bash
cd ai-company
cp .env.example .env.local     # then paste your unified key into FREELLMAPI_API_KEY
npm install
npm run build && npm start     # or `npm run dev` while editing
```

Open **http://localhost:3002**, type a goal, and press **Run company**.

## Security notes

- **Key stays server-side.** The FreeLLMAPI key is only read by the Next.js API route; the
  browser never sees it. `.env.local` is git-ignored.
- **Password.** Set `COMPANY_PASSWORD` in `.env.local` to require HTTP Basic auth. Do this
  before exposing the dashboard beyond localhost, and put it behind HTTPS.
- **Prompt injection.** Worker reports are fenced and the CEO is told to treat them as data,
  not instructions. Agents have **no tools**: they can't browse, run code, or send anything,
  so a hostile prompt can at worst produce bad text. Review any action plan before acting on it.
- **Safe rendering.** Model output is rendered by a small Markdown-to-React renderer with no
  `innerHTML`, so `<script>` in a reply shows up as text instead of running.
- **Abuse limits.** Goals are capped at 4,000 characters, model ids are allowlist-validated,
  and runs are limited to 5 per minute (each run makes about 6 model calls).
- **Security headers.** `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, and a locked-down Permissions-Policy.
- Don't paste client secrets or personal data into goals. They are sent to whichever
  third-party free provider the router picks, and free tiers may train on inputs.

## How it works

| File | Role |
|---|---|
| `lib/company.ts` | Org chart: roles, prompts, model allocation |
| `lib/llm.ts` | Calls FreeLLMAPI `/v1/chat/completions`, with a timeout and one fallback retry |
| `lib/orchestrator.ts` | CEO plan → parallel workers → CEO report |
| `app/api/run/route.ts` | Validates input and streams progress to the browser as NDJSON |
| `app/page.tsx` | Org-chart UI, model editor, report, history of the last 10 runs (browser only) |
| `proxy.ts` | Optional password gate |

To add a department, add an entry to `WORKERS` in `lib/company.ts`. The CEO picks it up automatically.
