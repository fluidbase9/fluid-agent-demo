/**
 * fluid-agent-demo — FADP API Server
 *
 * Every endpoint below is gated behind FADP/1.0 (HTTP 402).
 * Agents that understand the protocol pay automatically.
 * Humans get a clear payment-required JSON response.
 *
 * Endpoints:
 *   GET  /                          Free  — landing page
 *   GET  /health                    Free  — server status + pricing
 *   GET  /api/price/:coinId         0.001 USDC — live single price
 *   GET  /api/prices                0.005 USDC — bulk prices
 *   GET  /api/trending              0.001 USDC — trending coins
 *   GET  /api/markets               0.002 USDC — top 20 by market cap
 *   POST /api/swap-quote            0.002 USDC — swap quote via Fluid SOR
 *   GET  /api/identity/:handle      0.001 USDC — resolve Fluid ID → address
 *   GET  /api/balance               0.001 USDC — wallet balance (agent key)
 */

"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const express = require("express");
const https   = require("https");
const http    = require("http");
const crypto  = require("crypto");

const app            = express();
const PORT           = Number(process.env.PORT || 3001);
const FLUID_API      = process.env.FLUID_API_URL || "https://fluidnative.com";
const TICKER_KEY     = process.env.FLUID_TICKER_KEY || "";
const RECIPIENT      = process.env.FLDP_API_KEY_NAME || "fluid/devkeys/demo/0000";

app.use(express.json());

// ─── ANSI helpers ────────────────────────────────────────────────────────────
const C = { reset:"\x1b[0m", green:"\x1b[32m", cyan:"\x1b[36m", yellow:"\x1b[33m", gray:"\x1b[90m", red:"\x1b[31m" };

// ─── Replay protection ────────────────────────────────────────────────────────
const usedReceipts = new Map();
setInterval(() => { const n = Date.now(); for (const [k,v] of usedReceipts) if (v < n) usedReceipts.delete(k); }, 60_000);

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function apiGet(path, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url  = new URL(`${FLUID_API}${path}`);
    const mod  = url.protocol === "https:" ? https : http;
    const opts = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === "https:" ? 443 : 80),
      path:     url.pathname + url.search,
      method:   "GET",
      headers:  { "Content-Type": "application/json", ...extraHeaders },
    };
    const req = mod.request(opts, res => {
      let d = "";
      res.on("data", c => (d += c));
      res.on("end",  () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
    });
    req.on("error", reject);
    req.end();
  });
}

function apiPost(path, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url     = new URL(`${FLUID_API}${path}`);
    const mod     = url.protocol === "https:" ? https : http;
    const payload = JSON.stringify(body);
    const opts    = {
      hostname: url.hostname,
      port:     url.port || (url.protocol === "https:" ? 443 : 80),
      path:     url.pathname,
      method:   "POST",
      headers:  { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload), ...extraHeaders },
    };
    const req = mod.request(opts, res => {
      let d = "";
      res.on("data", c => (d += c));
      res.on("end",  () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ─── FADP gate middleware ─────────────────────────────────────────────────────
function fadpGate(amountUsdc, description) {
  return async (req, res, next) => {
    const receipt = req.headers["x-payment-receipt"];

    if (!receipt) {
      console.log(`  ${C.yellow}402${C.reset}  ${req.method} ${req.path}  →  ${amountUsdc} USDC required`);
      return res.status(402).json({
        error:       "Payment required",
        protocol:    "FADP/1.0",
        payment: {
          amount:      amountUsdc,
          currency:    "USDC",
          network:     "base",
          recipient:   RECIPIENT,
          endpoint:    req.path,
          description: description || req.path,
          payUrl:      `${FLUID_API}/api/fadp/pay`,
          docsUrl:     "https://fluidnative.com/fadp",
        },
      });
    }

    if (usedReceipts.has(receipt))
      return res.status(402).json({ error: "Receipt already used", protocol: "FADP/1.0" });

    // Verify with Fluid API — allow through in dev if unreachable
    let valid = true;
    try {
      const r = await apiPost("/api/fadp/verify-receipt", { receipt });
      valid = r.body?.valid === true;
    } catch { /* allow offline */ }

    if (!valid) return res.status(402).json({ error: "Invalid payment receipt" });

    usedReceipts.set(receipt, Date.now() + 5 * 60_000);
    console.log(`  ${C.green}✓${C.reset}   ${req.method} ${req.path}  —  receipt verified`);
    next();
  };
}

// ─── Ticker helper ────────────────────────────────────────────────────────────
async function ticker(path) {
  const headers = TICKER_KEY ? { "x-fluid-ticker-key": TICKER_KEY } : {};
  try {
    return await apiGet(`/api/ticker${path}`, headers);
  } catch {
    return null;
  }
}

// Mock fallbacks for demo when API is unreachable
const MOCK_PRICES = { ethereum: 3241.55, bitcoin: 67432.10, solana: 142.30, usdc: 1.00, base: 2.10 };
function mockPrice(id) {
  return MOCK_PRICES[id.toLowerCase()] ?? parseFloat((Math.random() * 500 + 1).toFixed(2));
}

// ─── Free routes ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({
  status: "ok", protocol: "FADP/1.0", server: "fluid-agent-demo",
  endpoints: {
    "GET /api/price/:coinId":    "0.001 USDC — single coin price",
    "GET /api/prices":           "0.005 USDC — bulk prices (?ids=eth,btc,sol)",
    "GET /api/trending":         "0.001 USDC — trending coins",
    "GET /api/markets":          "0.002 USDC — top 20 by market cap",
    "POST /api/swap-quote":      "0.002 USDC — swap quote via Fluid SOR",
    "GET /api/identity/:handle": "0.001 USDC — resolve Fluid ID to address",
    "GET /api/balance":          "0.001 USDC — wallet balance",
  },
}));

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>Fluid Agent Demo</title>
  <style>
    *{box-sizing:border-box}
    body{font-family:monospace;background:#060c1a;color:#e6edf3;margin:0;padding:40px}
    h1{color:#10b981;margin-bottom:4px}
    .sub{color:#4b5563;font-size:13px;margin-bottom:32px}
    .badge{display:inline-block;background:rgba(16,185,129,.12);color:#34d399;border:1px solid rgba(16,185,129,.25);padding:2px 10px;border-radius:20px;font-size:11px;margin-right:6px}
    table{border-collapse:collapse;width:100%;max-width:860px;margin-top:16px}
    th,td{border:1px solid #21262d;padding:10px 16px;text-align:left;font-size:13px}
    th{background:#0d1117;color:#8b949e;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
    tr:hover td{background:rgba(255,255,255,.02)}
    .get{color:#34d399;font-weight:bold}
    .post{color:#60a5fa;font-weight:bold}
    .cost{color:#f59e0b}
    .free{color:#60a5fa}
    code{background:#161b22;padding:2px 6px;border-radius:4px;color:#34d399;font-size:12px}
    a{color:#34d399}
    .section{margin-top:40px}
    h2{color:#e6edf3;font-size:15px;margin-bottom:12px;border-bottom:1px solid #21262d;padding-bottom:8px}
    pre{background:#0d1117;border:1px solid #21262d;padding:20px;border-radius:8px;overflow-x:auto;color:#e6edf3;font-size:12px;line-height:1.6}
  </style>
</head>
<body>
  <h1>🌊 Fluid Agent Demo</h1>
  <p class="sub">
    <span class="badge">FADP/1.0</span>
    <span class="badge">fluid-ticker</span>
    <span class="badge">Base mainnet</span>
    Full working demo of Fluid Wallet API + FADP protocol
  </p>

  <table>
    <thead><tr><th>Method</th><th>Endpoint</th><th>Cost</th><th>Description</th></tr></thead>
    <tbody>
      <tr><td class="get">GET</td><td><code>/health</code></td><td class="free">Free</td><td>Server status + pricing</td></tr>
      <tr><td class="get">GET</td><td><code>/api/price/:coinId</code></td><td class="cost">0.001 USDC</td><td>Live price — e.g. /api/price/ethereum</td></tr>
      <tr><td class="get">GET</td><td><code>/api/prices?ids=eth,btc</code></td><td class="cost">0.005 USDC</td><td>Bulk prices for multiple coins</td></tr>
      <tr><td class="get">GET</td><td><code>/api/trending</code></td><td class="cost">0.001 USDC</td><td>Trending coins right now</td></tr>
      <tr><td class="get">GET</td><td><code>/api/markets</code></td><td class="cost">0.002 USDC</td><td>Top 20 coins by market cap</td></tr>
      <tr><td class="post">POST</td><td><code>/api/swap-quote</code></td><td class="cost">0.002 USDC</td><td>Swap quote via Fluid SOR</td></tr>
      <tr><td class="get">GET</td><td><code>/api/identity/:handle</code></td><td class="cost">0.001 USDC</td><td>Resolve Fluid ID → wallet address</td></tr>
      <tr><td class="get">GET</td><td><code>/api/balance</code></td><td class="cost">0.001 USDC</td><td>Wallet balance (ETH, USDC, USDT)</td></tr>
    </tbody>
  </table>

  <div class="section">
    <h2>How it works (FADP/1.0)</h2>
    <pre>1. Agent calls /api/price/ethereum  (no header)
2. Server returns 402 + { amount: "0.001", currency: "USDC", payUrl: "..." }
3. Agent pays via Fluid Wallet → gets receipt (txHash)
4. Agent retries:  GET /api/price/ethereum
                   x-payment-receipt: 0xabc...
5. Server verifies → 200 { price: 3241.55, change24h: +2.4% }</pre>
  </div>

  <div class="section">
    <h2>Quick start</h2>
    <pre>git clone https://github.com/fluidbase9/fluid-agent-demo
cd fluid-agent-demo && npm install
cp .env.example .env   # add your keys

node server/index.js   # terminal 1
node agent/index.js    # terminal 2</pre>
  </div>

  <p style="margin-top:32px;color:#4b5563;font-size:12px">
    <a href="https://github.com/fluidbase9/fluid-agent-demo">GitHub</a> ·
    <a href="https://github.com/fluidbase9/fadp">FADP Protocol</a> ·
    <a href="https://fluidnative.com/fadp">Docs</a>
  </p>
</body>
</html>`);
});

// ─── FADP-gated routes ────────────────────────────────────────────────────────

// Single price
app.get("/api/price/:coinId", fadpGate("0.001", "Single coin price from fluid-ticker"), async (req, res) => {
  const id  = req.params.coinId.toLowerCase();
  const r   = await ticker(`/price/${id}`);
  if (r && r.status === 200) return res.json({ ...r.body, _source: "fluid-ticker" });
  res.json({ coinId: id, price: mockPrice(id), currency: "usd", _source: "mock-fallback" });
});

// Bulk prices
app.get("/api/prices", fadpGate("0.005", "Bulk prices from fluid-ticker"), async (req, res) => {
  const ids = (req.query.ids || "ethereum,bitcoin,solana").toString();
  const r   = await ticker(`/prices?ids=${ids}`);
  if (r && r.status === 200) return res.json({ ...r.body, _source: "fluid-ticker" });
  const prices = {};
  ids.split(",").forEach(id => { prices[id.trim()] = { usd: mockPrice(id.trim()) }; });
  res.json({ prices, _source: "mock-fallback" });
});

// Trending
app.get("/api/trending", fadpGate("0.001", "Trending coins from fluid-ticker"), async (req, res) => {
  const r = await ticker("/trending");
  if (r && r.status === 200) return res.json({ ...r.body, _source: "fluid-ticker" });
  res.json({ trending: ["pepe","dogwifhat","brett","bonk","popcat"], _source: "mock-fallback" });
});

// Markets
app.get("/api/markets", fadpGate("0.002", "Top 20 coins by market cap"), async (req, res) => {
  const r = await ticker("/markets?per_page=20");
  if (r && r.status === 200) return res.json({ ...r.body, _source: "fluid-ticker" });
  res.json({
    markets: [
      { id: "bitcoin",  symbol: "BTC", price: 67432, market_cap: 1320000000000, rank: 1 },
      { id: "ethereum", symbol: "ETH", price: 3241,  market_cap: 389000000000,  rank: 2 },
      { id: "solana",   symbol: "SOL", price: 142,   market_cap: 65000000000,   rank: 3 },
    ],
    _source: "mock-fallback",
  });
});

// Swap quote
app.post("/api/swap-quote", fadpGate("0.002", "Swap quote via Fluid SOR"), async (req, res) => {
  const { tokenIn = "USDC", tokenOut = "ETH", amountIn = "100" } = req.body;
  const agentKey = process.env.FLUID_AGENT_KEY;
  if (agentKey) {
    const r = await apiPost("/v1/agents/quote-swap", { tokenIn, tokenOut, amountIn }, { "X-Agent-Key": agentKey }).catch(() => null);
    if (r && r.status === 200) return res.json({ ...r.body, _source: "fluid-sor" });
  }
  // Mock fallback
  const ethPrice = 3241.55;
  const amountOut = tokenOut.toLowerCase() === "eth"
    ? (parseFloat(amountIn) / ethPrice).toFixed(6)
    : (parseFloat(amountIn) * ethPrice).toFixed(2);
  res.json({
    tokenIn, tokenOut, amountIn, amountOut,
    route: "fluidAmm", slippage: "0.1%", estimatedGas: "0.0002 ETH",
    _source: "mock-fallback",
  });
});

// Identity resolution
app.get("/api/identity/:handle", fadpGate("0.001", "Resolve Fluid ID to wallet address"), async (req, res) => {
  const handle    = req.params.handle;
  const agentKey  = process.env.FLUID_AGENT_KEY;
  if (agentKey) {
    const r = await apiGet(`/v1/agents/identity/resolve?handle=${encodeURIComponent(handle)}`, { "X-Agent-Key": agentKey }).catch(() => null);
    if (r && r.status === 200) return res.json({ ...r.body, _source: "fluid-identity" });
  }
  res.json({ handle, address: "0xD858...mock", registered: false, _source: "mock-fallback", note: "Set FLUID_AGENT_KEY for live resolution" });
});

// Wallet balance
app.get("/api/balance", fadpGate("0.001", "Wallet balance from Fluid Wallet"), async (req, res) => {
  const agentKey = process.env.FLUID_AGENT_KEY;
  if (agentKey) {
    const r = await apiGet("/v1/agents/balance", { "X-Agent-Key": agentKey }).catch(() => null);
    if (r && r.status === 200) return res.json({ ...r.body, _source: "fluid-wallet" });
  }
  res.json({ eth: "0.142", usdc: "1250.00", usdt: "0.00", chainId: 8453, _source: "mock-fallback", note: "Set FLUID_AGENT_KEY for live balance" });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n${C.cyan}  🌊  Fluid Agent Demo — API Server${C.reset}`);
  console.log(`  ${C.gray}FADP/1.0 · fluid-ticker · Base mainnet${C.reset}\n`);
  console.log(`  ${C.green}▶${C.reset}  http://localhost:${PORT}\n`);
  console.log(`  ${C.gray}Gated endpoints (require FADP payment):${C.reset}`);
  console.log(`  ${C.yellow}⊙${C.reset}  /api/price/:coin      0.001 USDC`);
  console.log(`  ${C.yellow}⊙${C.reset}  /api/prices           0.005 USDC`);
  console.log(`  ${C.yellow}⊙${C.reset}  /api/trending         0.001 USDC`);
  console.log(`  ${C.yellow}⊙${C.reset}  /api/markets          0.002 USDC`);
  console.log(`  ${C.yellow}⊙${C.reset}  /api/swap-quote       0.002 USDC`);
  console.log(`  ${C.yellow}⊙${C.reset}  /api/identity/:handle 0.001 USDC`);
  console.log(`  ${C.yellow}⊙${C.reset}  /api/balance          0.001 USDC`);
  console.log(`\n  Run ${C.cyan}node agent/index.js${C.reset} to see the agent pay and interact\n`);
});
