# apps/api: Mandate API

The only part of Mandate that talks to PayPal. It signs mandates, checks every agent purchase (`/check`), moves money (`/pay`), keeps a hash-chained receipt log, and defends disputes with that evidence.

## Setup

```bash
pnpm install                                   # repo root
cp apps/api/.env.example apps/api/.env         # fill in, see below
pnpm --filter @mandate/api exec prisma generate
pnpm --filter @mandate/api exec prisma migrate deploy
pnpm --filter @mandate/api seed                # mandate mdt_demo for user anita
pnpm agent:server                              # detector on :4100 (another terminal)
pnpm api                                       # API on :4000
```

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | 4000 | |
| `DATABASE_URL` | (required) | `file:./dev.db` locally |
| `DETECTOR_URL` | `http://localhost:4100` | Member 1's agent server; on Render, its public URL |
| `WEB_ORIGIN` | `http://localhost:3000` | CORS + SSE origin (dashboard URL) |
| `API_PUBLIC_URL` | `http://localhost:4000` | Used by scripts |
| `PAYPAL_MODE` | `mock` | `mock` (no network) or `sandbox` (real PayPal sandbox) |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID` | | Required when `PAYPAL_MODE=sandbox` |
| `PAYPAL_RETURN_URL`, `PAYPAL_CANCEL_URL` | `WEB_ORIGIN/paypal/return`, `/paypal/cancel` | Vault approval redirects |
| `SIGNING_KEY` | generated into `.keys/` | **Set it on Render**: the disk is wiped on redeploy and a new key invalidates every mandate |
| `RISK_BLOCK_AT`, `RISK_REVIEW_AT` | 0.7, 0.4 | Detector thresholds |

## Endpoints

All errors are `{ error, reasons? }` with an HTTP status. Types live in `@mandate/shared`.

| Method + path | Request | Response |
| --- | --- | --- |
| `GET /health` | | `{ ok: true }` |
| `POST /mandates` | `{ userId, rules }` | `{ mandate, approveUrl }` (PayPal vault approval link) |
| `POST /mandates/:id/vault/complete` | none | Mandate with `vaultId` |
| `GET /mandates/:id` | | Mandate + `spentThisMonth` |
| `POST /check` | `CheckRequest` | `{ cartId, decision, reasons, riskScore, receiptSeq, approvalId? }` |
| `GET /approvals/:id` | | `{ status }` |
| `POST /approvals/:id` | `{ approved }` | Approval (409 if already decided) |
| `POST /pay` | `{ cartId }` | `PayResponse`: `captured`, or `created` + `approveUrl` when there is no saved payment method; 403 unless allowed/approved |
| `POST /payments/:id/capture` | | Capture after the buyer approved the order in PayPal |
| `GET /receipts?mandateId=` | | `Receipt[]`, newest first |
| `GET /receipts/verify?mandateId=` | | `{ ok, brokenSeq, checked }` |
| `GET /events` | | Server-sent events, `LiveEventV2` (`check`, `approval`, `payment`, `dispute`) |
| `POST /webhooks/paypal` | PayPal webhook | Verifies the signature on the raw body, ignores duplicates, handles `PAYMENT.CAPTURE.COMPLETED/DENIED`, `CUSTOMER.DISPUTE.CREATED/UPDATED/RESOLVED` |
| `GET /disputes` | | `DisputeView[]`, newest first, with `evidence` for the dashboard drawer |
| `GET /disputes/:id` | | `DisputeView` |
| `GET /disputes/:id/evidence.pdf` | | The one-page PDF sent to PayPal |
| `POST /disputes/:id/defend` | none | Build + submit evidence (runs automatically on `CUSTOMER.DISPUTE.CREATED`) |
| `POST /disputes/:id/sandbox-resolve` | `{ outcome: "won" \| "lost" }` | **Sandbox/mock only**: asks PayPal to rule (`adjudicate`) |

## Disputes: how the evidence works

On `CUSTOMER.DISPUTE.CREATED` the API links the dispute to our payment through `disputed_transactions[].seller_transaction_id` (the capture id), then submits evidence with PayPal's **multipart** `provide-evidence` call: an `input` part with `evidence_type: OTHER` and a summary note, plus the PDF as `evidence-file`. The evidence contains the signed mandate (Ed25519, verifiable with the included public key), the `/check` decision and reasons, the user's approval, the payment, and the cart's slice of the SHA-256 receipt chain. A `dispute_evidence` receipt stores hashes of the JSON and PDF, so the evidence itself is tamper-evident.

In the sandbox, a dispute can be driven to an outcome with PayPal's sandbox-only calls: `require-evidence` (done automatically when the dispute is `UNDER_REVIEW`) and `adjudicate` (`POST /disputes/:id/sandbox-resolve`).

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm --filter @mandate/api seed` | Create (or repair) mandate `mdt_demo` for user `anita` |
| `pnpm --filter @mandate/api tamper -- <seq>` | Dev only: edit one receipt so `/receipts/verify` reports it |
| `pnpm --filter @mandate/api replay:dispute -- [cartId] [--win]` | **Mock mode only.** Replays a recorded dispute webhook against the latest captured payment. Output is labelled REPLAY: it is not a real PayPal dispute |
| `pnpm --filter @mandate/api import:dispute -- <PP-D-...>` | **Sandbox.** Fetches a real sandbox dispute by id and defends it, without needing the webhook to reach you |

## Real sandbox dispute, step by step

1. Make a real sandbox purchase (vault or approval flow) so a payment is `captured`.
2. Log in to sandbox.paypal.com as the buyer (Personal) account, open that payment, and file an unauthorised-transaction dispute. Copy its `PP-D-...` id.
3. Either let the webhook arrive (Render URL registered in the PayPal app), or run `import:dispute -- PP-D-...`.
4. `POST /disputes/:id/sandbox-resolve {"outcome":"won"}` to get PayPal's sandbox ruling.

## Known limits

- SQLite locally. For Render, either switch the Prisma provider to `postgresql` and run the migrations there, or accept that data resets on redeploy.
- Every field marked `// VERIFY:` in `src/paypal/sandbox.ts` still needs one real sandbox run to confirm.
- `replay:dispute` evidence is real, but the dispute is not: say so in the demo.
