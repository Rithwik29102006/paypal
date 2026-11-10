# Mandate

A permission slip for AI agents that spend money. The user signs spending rules once; every purchase an AI agent makes is checked against them before PayPal moves any money; every decision leaves a tamper-proof receipt that can win a false dispute.

Built for the PayPal AI Hackathon 2026.

> Member 3 owns this README and will expand it (story, architecture image, setup, sandbox accounts, demo video).

## Repo layout

```text
apps/agent        shopping agent, trick detector, MCP server     (Member 1)  -> see apps/agent/README.md
apps/api          Mandate API: PayPal, rules, receipts, disputes  (Member 2)  -> coming
apps/web          dashboard + demo store pages                    (Member 3)  -> coming
packages/shared   zod schemas shared by all apps                  (Member 2)
tests/redteam     attack cases, runner, report.md                 (Member 1)
```

## Getting started

```bash
corepack enable
pnpm install
cp apps/agent/.env.example apps/agent/.env
pnpm test
pnpm redteam
```

## License

MIT, see [LICENSE](LICENSE).
