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

```bash
# 1. Clone the repo
git clone https://github.com/fluidbase9/fluid-agent-demo

# 2. Enter the project folder
cd fluid-agent-demo

# 3. Install dependencies
npm install

# 4. Run the setup CLI (clears cache to ensure latest version)
#    → creates your developer account
#    → generates FLDP EC key pair (shown once — save it)
#    → generates FLUID_AGENT_KEY (fwag_...) — auto-exported to ~/.zshrc
#    → select agent skills to install (Codex, Cursor, Cline, etc.)
#    → choose installation scope: Project or Global
#    → scaffolds fadp-sample/ with keys pre-filled
#    → opens VS Code automatically
rm -rf ~/.npm/_npx && npx @fluidwallet/fadp-cli@latest

# 5. Start the FADP-gated API server (runs in background)
node server/index.js &

# 6. Run the interactive paying agent
node agent/index.js
```

> **Tip:** Open a new terminal after step 4 so `~/.zshrc` is sourced and `FLUID_AGENT_KEY` is active.

---

## After setup — run your scaffolded project

The CLI creates a `fadp-sample/` folder and opens it in VS Code automatically. Once setup is complete, run these commands inside `fadp-sample/`:

```bash
# Install dependencies for the sample project
npm install

# Terminal 1 — start the FADP-gated API server
node server.js

# Terminal 2 — run the interactive paying agent
node agent.js
```

The `.env` file inside `fadp-sample/` already has your keys pre-filled — it works out of the box.

---

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
