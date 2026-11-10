# apps/web: Mandate Frontend Dashboard

Member 3's frontend application for Mandate. Built with Next.js (App Router), TypeScript, and Tailwind CSS.

## Features

- **Fintech Dashboard**: Live spending meter (`$90.46 of $300.00`), active mandate rules summary, recent check/payment decisions, and real-time SSE live feed.
- **Create & Edit Mandate**: Form with interactive plain-language preview: *"Your agent can spend up to $300 a month on groceries and school supplies, and will ask you above $60"*. Simulates canonicalization, Ed25519 signing, and PayPal Vault token binding.
- **AI Agent Console**: Direct shopping interface with pre-built hackathon demo prompts and step-by-step reasoning visibility.
- **Approvals Interface**: Interactive management of held orders (`needs_approval`), cart item inspector, and risk scores from the trick detector with Approve / Reject controls.
- **Tamper-Proof Receipts**: Cryptographic timeline of hash-chained receipts (`hash = sha256(prevHash + canonicalize(payload))`). Includes **Verify Chain Integrity** tool and a **Simulate Tamper** demonstration button that proves the cryptographic audit catches modified records.
- **Dispute Defender**: 4-step dispute progression (Filed -> Evidence Built -> Submitted -> Won) with a complete evidence drawer displaying the signed mandate, receipt slice, and /check decision log.
- **Demo Store (`/store` & `/store/p/[sku]`)**: 25 catalog products, including 3 poisoned attack pages with an interactive **Reveal Hidden Text** toggle for hackathon video demonstrations.

## Getting Started

```bash
# from repo root
pnpm --filter @mandate/web dev
# runs on http://localhost:3000
```
