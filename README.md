# fluid-agent-demo

> Full working demo of **Fluid Wallet API + FADP/1.0** for developers.

Clone it, add your keys, and see a real AI agent auto-pay for live crypto data.

[![FADP/1.0](https://img.shields.io/badge/protocol-FADP%2F1.0-10b981)](https://github.com/fluidbase9/fadp)
[![fluid-ticker](https://img.shields.io/badge/prices-fluid--ticker-34d399)](https://github.com/fluidbase9/fluid-ticker)
[![Base](https://img.shields.io/badge/chain-Base-0052ff)](https://base.org)

## What's inside

| File | What it does |
|------|-------------|
| `server/index.js` | Express API with 7 FADP-gated endpoints — prices, markets, swap quotes, identity, balance |
| `agent/index.js` | Interactive CLI agent — prompts you to pay, auto-pays via Fluid Wallet, prints results |

## Quick start

```bash
# 1. Clone & install
git clone https://github.com/fluidbase9/fluid-agent-demo
cd fluid-agent-demo
npm install

# 2. Get your keys
npx @fluidwallet/fadp-cli     # generates FLDP EC key → .env.fadp
# Also get your fwag_ key from Developer Dashboard → API Keys

# 3. Set up .env
cp .env.example .env
# fill in FLUID_AGENT_KEY and FLDP_API_KEY_NAME

# 4. Run
node server/index.js   # terminal 1 — starts the FADP API server
node agent/index.js    # terminal 2 — starts the interactive agent
```

## Endpoints (all FADP-gated)

| Endpoint | Cost | Description |
|----------|------|-------------|
| `GET /health` | Free | Server status + pricing |
| `GET /api/price/:coinId` | 0.001 USDC | Live price — e.g. `/api/price/ethereum` |
| `GET /api/prices?ids=eth,btc` | 0.005 USDC | Bulk prices |
| `GET /api/trending` | 0.001 USDC | Trending coins right now |
| `GET /api/markets` | 0.002 USDC | Top 20 by market cap |
| `POST /api/swap-quote` | 0.002 USDC | Swap quote via Fluid SOR |
| `GET /api/identity/:handle` | 0.001 USDC | Resolve Fluid ID → address |
| `GET /api/balance` | 0.001 USDC | Wallet balance (ETH, USDC, USDT) |

## The FADP payment flow

```
agent calls  →  GET /api/price/ethereum
                     ↓
server returns  →  402 {
                     protocol: "FADP/1.0",
                     payment: {
                       amount: "0.001",
                       currency: "USDC",
                       network: "base",
                       recipient: "fluid/devkeys/..."
                     }
                   }
                     ↓
agent pays  →  POST /v1/agents/send  { to, amount, token }
               (uses FLUID_AGENT_KEY / fwag_... key)
                     ↓
agent retries  →  GET /api/price/ethereum
                  x-payment-receipt: 0xabc123...
                     ↓
server verifies  →  200 { price: 3241.55, change24h: +2.4% }
```

## Keys

| Key | Where to get | Used for |
|-----|-------------|----------|
| `FLUID_AGENT_KEY` (`fwag_...`) | Developer Dashboard → API Keys | Real on-chain payments |
| `FLDP_API_KEY_NAME` + private key | `npx @fluidwallet/fadp-cli` | FADP identity / EC signing |

**No keys?** The demo still runs — it uses mock receipts so you can see the full flow without spending real USDC.

## Works with agent skills

If you ran `npx @fluidwallet/fadp-cli` (Mode 2) and installed agent skills, drop them into `agents/` and the agent will find them automatically.

## Related packages

| Package | Description |
|---------|-------------|
| [`@fluidwallet/fadp-cli`](https://npmjs.com/package/@fluidwallet/fadp-cli) | Setup CLI — generates keys, installs skills |
| [`fluid-fadp`](https://npmjs.com/package/fluid-fadp) | FADP protocol library (server middleware + client) |
| [`@fluidwallet/fluid-ticker`](https://github.com/fluidbase9/fluid-ticker) | Price data — 11 aggregated sources |
| [`fluid-wallet-agentkit`](https://github.com/fluidbase9/fluid-wallet-agentkit) | Full agent SDK (payments, swaps, identity) |

## License

MIT — [Fluid Wallet](https://fluidnative.com)
