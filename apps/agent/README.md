# apps/agent: shopping agent, trick detector, MCP server, red team

Member 1's part of Mandate. The agent shops for the user but **cannot pay by itself**: every purchase goes through Mandate's `POST /check` and `POST /pay`, and this package also provides the trick detector that `/check` uses.

## Quick start

```bash
pnpm install                         # from the repo root
cp apps/agent/.env.example apps/agent/.env
# add ANTHROPIC_API_KEY, or OPENROUTER_API_KEY (or OPENAI_API_KEY)

pnpm test                            # 19 tests (incl. agent loop with a scripted model), no API key needed
pnpm redteam                         # 45-case red-team suite -> tests/redteam/report.md
pnpm demo                            # the Anita story in 3 scenes, no API key needed
pnpm agent "Buy notebooks and milk for this week"   # run the agent in the terminal (needs a key)
pnpm agent:server                    # HTTP server on :4100
pnpm mcp                             # MCP server over stdio
```

`MOCK_API=1` (the default in `.env.example`) uses a built-in mock of the Mandate API, so everything runs before Member 2's `apps/api` is live. Set `MOCK_API=0` and `MANDATE_API_URL` to switch to the real API.

## What's inside

| File | What it does |
| --- | --- |
| `store/products.json` | 25 demo products. Three are attack pages: `SCH-BUNDLE` (hidden CSS), `GRO-MILK2` (zero-width text), `SCH-NOTEBOOK-5` (fake review) |
| `src/store.ts` | Search, product lookup, and the raw page text an agent "reads" |
| `src/detector.ts` | Trick detector: rules layer + LLM judge, returns `{ riskScore, signals, verdict }` |
| `src/rulesEngine.ts` | Reference copy of the `/check` rules (Member 2 can port it) |
| `src/session.ts` | The payment flow with no LLM: catalog prices, evidence, `/check` then `/pay`, approvals, no cart splitting |
| `src/agent.ts` | Tool-calling agent (Vercel AI SDK v7): `search_products`, `get_product`, `request_payment` |
| `src/mandateClient.ts` | `HttpMandateClient` (real API) and `MockMandateClient` (in-memory) |
| `src/server.ts` | HTTP endpoints for Members 2 and 3 (below) |
| `src/mcp.ts` | MCP server: `search_products`, `get_product`, `mandate_buy` |
| `../../tests/redteam/` | 15 attacks + 15 normal purchases, runner, `report.md` |

## Safety properties (enforced in code, not just the prompt)

1. The agent has no PayPal credentials and no PayPal tool.
2. Prices come from the catalog; the model only picks SKUs and quantities.
3. The pages the agent read for a cart are attached to `/check` automatically, so the model can't hide them.
4. After a block, the same items are refused locally, so a blocked cart can't be split into smaller ones.
5. Page text is treated as untrusted data by the system prompt *and* scored by the detector.

## Trick detector

Rules layer signals: hidden CSS, zero-width characters, instructions aimed at the agent ("ignore previous rules", fake `system:` messages, "you must also buy"), items pushed by page text, category drift, unrequested items, high-risk categories, quantity spikes, lookalike merchants, reasoning that defers to the page, total mismatch. Signals combine with noisy-OR. The LLM judge (structured output) runs when an API key is set; final risk = the higher of the two.

Risk ≥ `RISK_BLOCK_AT` (0.7) blocks; ≥ `RISK_REVIEW_AT` (0.4) asks the user.

## Endpoints (`pnpm agent:server`, port 4100)

| Method + path | For | Purpose |
| --- | --- | --- |
| `POST /detect` | Member 2 | `DetectRequest` in, `RiskReport` out. Call this from `/check` |
| `GET /store/products` | Member 3 | Demo store catalog |
| `GET /store/products/:sku` | Member 3 | One product + raw page text (render hidden parts so the video can reveal them) |
| `POST /agent/run` | Member 3 | `{ request }` in, `{ text, events }` out |
| `POST /agent/run?stream=1` | Member 3 | Same, as server-sent events for the live feed |
| `GET /mock/state`, `POST /mock/approvals/:id` | Member 3 | Mock mode only: see state, approve/reject `{ approved: true }` |

## Requests to teammates

- **Member 2:** please add `GET /approvals/:id -> { status }` so the agent can wait for Anita's decision (`HttpMandateClient.waitForApproval`). `/check` should accept the optional `userRequest` field (already in `@mandate/shared`) and pass it to `/detect`.
- **Member 3:** the store pages should render `description` as HTML so the hidden `<span style="display:none">` is really hidden, with a "reveal hidden text" toggle for the video.

## Red-team results

Run `pnpm redteam`; full results are in [`tests/redteam/report.md`](../../tests/redteam/report.md). Two sets:

| Set | Cases | Rules only (no LLM) |
| --- | --- | --- |
| **Holdout** (never tuned on: other languages, base64, look-alike letters, fake user notes, slow escalation) | 10 attacks, 5 normal | 7 of 10 attacks stopped, 0 false blocks |
| Development (rules were adjusted until these passed, so optimistic) | 15 attacks, 15 normal | 15 of 15 attacks stopped, 0 false blocks |

The three holdout misses (base64-encoded instruction, bulk-buy pressure, slow escalation with no page) are what the LLM judge layer is for. **Run `pnpm redteam` once with an API key before quoting numbers in the video**, and quote the holdout number.

## AI tools used (for the README and Devpost)

| Tool | Where | What it does |
| --- | --- | --- |
| Claude via the Anthropic API (`AGENT_MODEL`, default `claude-sonnet-5-5`; OpenAI works too via `LLM_PROVIDER=openai`) | `src/agent.ts` | The shopping agent: understands the request, searches the store, reads pages, builds the cart, explains its reasoning |
| A smaller, faster model (`DETECTOR_MODEL`, default `claude-haiku-5-5`) with structured output | `src/detector.ts` | LLM judge: scores whether the cart reflects the user's request or a manipulation, with reasons |
| Vercel AI SDK v7 (`ai`) | agent + detector | Tool calling, multi-step agent loop, structured output, provider switching, mock models for tests |
| Model Context Protocol SDK | `src/mcp.ts` | Exposes Mandate as an MCP server so any MCP client can shop under the same guardrails |

The AI decides *what* to buy and flags *suspicious* carts; it never decides whether money moves. That decision is made by deterministic rules over a signed mandate, and only Mandate's API holds PayPal credentials.

## Deploying on Render

`apps/agent` runs as a web service: build `pnpm install`, start `pnpm --filter @mandate/agent start`, port from `AGENT_PORT`. Set `MOCK_API=0`, `MANDATE_API_URL` (Member 2's Render URL) and the LLM key as environment variables. Member 3 adds it to `render.yaml`.

## Why there's no PayPal Agent Toolkit in this package

The guide listed PayPal Agent Toolkit tools in the MCP server as optional. We left them out on purpose: the toolkit needs PayPal client credentials, and Mandate's core safety property is that the agent holds none. All PayPal calls (Orders, Vault, Webhooks, Disputes) live in Member 2's `apps/api`.
