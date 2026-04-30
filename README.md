# fluid-agent-demo

> Full working demo of **Fluid Wallet API + FADP/1.0** for developers.

Clone it, run the CLI, and see a real AI agent auto-pay for live crypto data.

[![FADP/1.0](https://img.shields.io/badge/protocol-FADP%2F1.0-10b981)](https://github.com/fluidbase9/fadp)
[![fluid-ticker](https://img.shields.io/badge/prices-fluid--ticker-34d399)](https://github.com/fluidbase9/fluid-ticker)
[![Base](https://img.shields.io/badge/chain-Base-0052ff)](https://base.org)

## What's inside

| File | What it does |
|------|-------------|
| `server/index.js` | Express API with 7 FADP-gated endpoints — prices, markets, swap quotes, identity, balance |
| `agent/index.js` | Interactive CLI agent — auto-pays via Fluid Wallet, prints receipt with BaseScan link |

## Quick start

> ⚠️ **Run each command separately** — do not paste the whole block at once.
> The CLI is interactive and will wait for your input.

**Step 1 — Clone and install**
```bash
git clone https://github.com/fluidbase9/fluid-agent-demo
cd fluid-agent-demo
npm install
```

**Step 2 — Run the setup CLI**
```bash
npx @fluidwallet/fadp-cli@latest
```
The CLI will:
- Create your developer account
- Generate your FLDP EC key pair — **shown once, save it now**
- Generate your `FLUID_AGENT_KEY` (`fwag_...`) — exported to `~/.zshrc` automatically
- Install agent skills into Codex / Cursor / Cline / etc.
- Scaffold a `fadp-sample/` demo project
- Open VS Code automatically

**Step 3 — Run (two separate terminals)**
```bash
node server/index.js   # terminal 1 — FADP-gated API server
```
```bash
node agent/index.js    # terminal 2 — interactive paying agent
```

> **Tip:** Open a new terminal after the CLI finishes so `~/.zshrc` is sourced and `FLUID_AGENT_KEY` is in your environment.

## Endpoints (all FADP-gated)

| Endpoint | Cost | Description |
|----------|------|-------------|
| `GET /health` | Free | Server status + pricing |
| `GET /api/price/:coinId` | 0.001 USDC | Live price |
| `GET /api/prices?ids=eth,btc` | 0.005 USDC | Bulk prices |
| `GET /api/trending` | 0.001 USDC | Trending coins |
| `GET /api/markets` | 0.002 USDC | Top 20 by market cap |
| `POST /api/swap-quote` | 0.002 USDC | Swap quote via Fluid SOR |
| `GET /api/identity/:handle` | 0.001 USDC | Resolve Fluid ID → address |
| `GET /api/balance` | 0.001 USDC | Wallet balance |

## The FADP payment flow

```
agent calls  →  GET /api/price/ethereum
                     ↓
server returns  →  402 { protocol: "FADP/1.0", payment: { amount: "0.001", currency: "USDC", ... } }
                     ↓
agent pays  →  POST /v1/agents/send  (uses FLUID_AGENT_KEY from environment)
                     ↓
agent retries  →  GET /api/price/ethereum  +  x-payment-receipt: 0xabc...
                     ↓
server verifies  →  200 { price: 3241.55, change24h: +2.4% }
```

## Keys

| Key | How you get it | Used for |
|-----|---------------|----------|
| `FLUID_AGENT_KEY` (`fwag_...`) | Auto-generated + exported to `~/.zshrc` by CLI | On-chain payments |
| `FLDP_API_KEY_NAME` + private key | Shown once during CLI — **copy and save** | FADP identity / EC signing |

**No keys?** The demo runs in mock mode — no real USDC needed.

## Agent skills

After the CLI, `FLUID_AGENT_KEY` is in `~/.zshrc`. Codex, Cursor, Cline, and any other AI coding agent picks it up automatically in new terminal sessions.

## Related packages

| Package | Description |
|---------|-------------|
| [`@fluidwallet/fadp-cli`](https://npmjs.com/package/@fluidwallet/fadp-cli) | Setup CLI — keys, skills, shell export |
| [`fluid-fadp`](https://npmjs.com/package/fluid-fadp) | FADP protocol middleware |
| [`fluid-wallet-agentkit`](https://github.com/fluidbase9/fluid-wallet-agentkit) | Full agent SDK |

## License

MIT — [Fluid Wallet](https://fluidnative.com)
