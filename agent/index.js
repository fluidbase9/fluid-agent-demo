/**
 * fluid-agent-demo — Interactive AI Agent
 *
 * Demonstrates the full Fluid Wallet + FADP flow:
 *  • Prompts user to choose an action
 *  • Shows cost upfront and asks for confirmation
 *  • Auto-pays the FADP 402 using your Fluid Agent Key (fwag_...)
 *  • Falls back to FLDP EC key signing if no fwag_ key set
 *  • Uses mock receipts for demo without any keys
 *
 * Run: node agent/index.js
 */

"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const http     = require("http");
const https    = require("https");
const crypto   = require("crypto");
const readline = require("readline");

const SERVER       = `http://localhost:${process.env.PORT || 3001}`;
const FLUID_API    = process.env.FLUID_API_URL || "https://fluidnative.com";
const AGENT_KEY    = process.env.FLUID_AGENT_KEY || "";
const FLDP_NAME    = process.env.FLDP_API_KEY_NAME || "";
const FLDP_KEY     = (() => { try { return JSON.parse(process.env.FLDP_API_KEY_PRIVATE_KEY || "null"); } catch { return null; } })();

// ─── ANSI ─────────────────────────────────────────────────────────────────────
const C = { reset:"\x1b[0m", bold:"\x1b[1m", dim:"\x1b[2m", green:"\x1b[32m", cyan:"\x1b[36m", yellow:"\x1b[33m", red:"\x1b[31m", gray:"\x1b[90m", white:"\x1b[37m", magenta:"\x1b[35m" };
const W  = Math.min(process.stdout.columns || 72, 80);
const hr = (ch = "─") => console.log(C.dim + ch.repeat(W) + C.reset);
const nl = () => console.log();

// ─── Readline ─────────────────────────────────────────────────────────────────
function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => rl.question(`  ${C.cyan}?${C.reset}  ${q} `, a => { rl.close(); r(a.trim()); }));
}
async function confirm(msg) {
  const a = await ask(`${msg} ${C.gray}[y/N]${C.reset}`);
  return a.toLowerCase() === "y" || a.toLowerCase() === "yes";
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────
function request(method, urlStr, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const url     = new URL(urlStr);
    const mod     = url.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const req     = mod.request({
      hostname: url.hostname,
      port:     url.port || (url.protocol === "https:" ? 443 : 80),
      path:     url.pathname + url.search,
      method,
      headers:  { "Content-Type": "application/json", "User-Agent": "fluid-agent-demo/1.0", ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}), ...extraHeaders },
    }, res => {
      let d = "";
      res.on("data", c => (d += c));
      res.on("end",  () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, body: d }); } });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}
const GET  = (u, h)    => request("GET",  u, null, h);
const POST = (u, b, h) => request("POST", u, b,    h);

// ─── FADP auto-pay ────────────────────────────────────────────────────────────
async function pay(paymentInfo) {
  console.log(`\n  ${C.yellow}💳 Payment required${C.reset}`);
  console.log(`  ${C.gray}Amount:    ${C.reset}${C.yellow}${paymentInfo.amount} ${paymentInfo.currency}${C.reset}`);
  console.log(`  ${C.gray}Network:   ${C.reset}Base mainnet`);
  console.log(`  ${C.gray}Recipient: ${C.reset}${C.dim}${paymentInfo.recipient}${C.reset}`);
  console.log(`  ${C.gray}Endpoint:  ${C.reset}${paymentInfo.endpoint}`);
  nl();

  // ── Path A: fwag_ key → real on-chain payment ────────────────────────────
  if (AGENT_KEY) {
    console.log(`  ${C.cyan}→${C.reset}  Paying via Fluid Wallet (fwag_ key)…`);
    try {
      const r = await POST(`${FLUID_API}/v1/agents/send`, {
        to:     paymentInfo.recipient,
        amount: paymentInfo.amount,
        token:  paymentInfo.currency,
        chain:  paymentInfo.network || "base",
        memo:   `FADP: ${paymentInfo.endpoint}`,
      }, { "X-Agent-Key": AGENT_KEY });
      if (r.body?.txHash) {
        console.log(`  ${C.green}✓${C.reset}  Paid — txHash: ${C.dim}${r.body.txHash}${C.reset}`);
        return r.body.txHash;
      }
      console.log(`  ${C.yellow}⚠${C.reset}  API response: ${JSON.stringify(r.body)}`);
    } catch (e) { console.log(`  ${C.yellow}⚠${C.reset}  ${e.message}`); }
  }

  // ── Path B: FLDP EC key → signed FADP request ───────────────────────────
  if (FLDP_NAME && FLDP_KEY) {
    console.log(`  ${C.cyan}→${C.reset}  Signing with FLDP EC key…`);
    try {
      const nonce = crypto.randomBytes(16).toString("hex");
      const ts    = Date.now().toString();
      const sign  = crypto.createSign("SHA256");
      sign.update(`${nonce}.${ts}`); sign.end();
      const sig = sign.sign({ key: FLDP_KEY.privateKey, dsaEncoding: "ieee-p1363" }, "base64");
      const r = await POST(`${FLUID_API}/api/fadp/pay`, {
        amount: paymentInfo.amount, currency: paymentInfo.currency,
        recipient: paymentInfo.recipient, endpoint: paymentInfo.endpoint,
      }, { "X-FLDP-Key-Name": FLDP_NAME, "X-FLDP-Signature": sig, "X-FLDP-Nonce": nonce, "X-FLDP-Timestamp": ts });
      if (r.body?.receipt) { console.log(`  ${C.green}✓${C.reset}  Receipt: ${C.dim}${r.body.receipt.slice(0,24)}…${C.reset}`); return r.body.receipt; }
    } catch (e) { console.log(`  ${C.yellow}⚠${C.reset}  FLDP signing error: ${e.message}`); }
  }

  // ── Path C: Demo mode — mock receipt ────────────────────────────────────
  const mock = `demo_receipt_${crypto.randomBytes(8).toString("hex")}`;
  console.log(`  ${C.gray}ℹ${C.reset}  Demo mode — mock receipt: ${C.dim}${mock}${C.reset}`);
  console.log(`  ${C.gray}  (Set FLUID_AGENT_KEY in .env for real payments)${C.reset}`);
  return mock;
}

// ─── FADP fetch — calls endpoint, handles 402 automatically ──────────────────
async function fadpFetch(method, url, body, confirm402) {
  const first = await request(method, url, body).catch(e => { console.log(`  ${C.red}✗${C.reset}  ${e.message}`); return null; });
  if (!first) return null;

  if (first.status === 402) {
    const shouldPay = await confirm402(first.body.payment);
    if (!shouldPay) return null;
    const receipt = await pay(first.body.payment);
    if (!receipt) return null;
    return request(method, url, body, { "x-payment-receipt": receipt });
  }
  return first;
}

// ─── Pretty print result ──────────────────────────────────────────────────────
function printResult(data) {
  if (!data) return;
  nl();
  hr();
  const src = data._source || data._meta?.source || "";
  if (src) console.log(`  ${C.dim}source: ${src}${C.reset}`);
  const clean = { ...data };
  delete clean._source; delete clean._meta;
  console.log(JSON.stringify(clean, null, 2).split("\n").map(l => `  ${C.gray}${l}${C.reset}`).join("\n"));
  hr();
}

// ─── Menus ────────────────────────────────────────────────────────────────────
const MENU = [
  { key: "1", label: "Price — single coin",          cost: "0.001 USDC" },
  { key: "2", label: "Prices — bulk (multiple coins)",cost: "0.005 USDC" },
  { key: "3", label: "Trending coins",               cost: "0.001 USDC" },
  { key: "4", label: "Markets — top 20 by market cap",cost: "0.002 USDC" },
  { key: "5", label: "Swap quote (tokenIn → tokenOut)",cost: "0.002 USDC"},
  { key: "6", label: "Identity — resolve Fluid ID",  cost: "0.001 USDC" },
  { key: "7", label: "Wallet balance",               cost: "0.001 USDC" },
  { key: "q", label: "Quit",                         cost: "" },
];

// ─── Fetch live wallet balance from Fluid backend ─────────────────────────────
async function fetchWalletBalance() {
  if (!AGENT_KEY) return null;
  try {
    const r = await GET(`${FLUID_API}/v1/agents/balance`, { "X-Agent-Key": AGENT_KEY });
    if (r.status === 200 && r.body) return r.body;
  } catch { /* offline */ }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const TQ = "\x1b[38;2;72;209;204m";
  nl();
  hr("═");
  nl();
  console.log(`  \x1b[1m${TQ}█████ █     █   █ ███ ████ \x1b[0m`);
  console.log(`  \x1b[1m${TQ}█     █     █   █  █  █   █\x1b[0m`);
  console.log(`  \x1b[1m${TQ}████  █     █   █  █  █   █\x1b[0m`);
  console.log(`  \x1b[1m${TQ}█     █     █   █  █  █   █\x1b[0m`);
  console.log(`  \x1b[1m${TQ}█     █████ █████ ███ ████ \x1b[0m`);
  nl();
  console.log(`  \x1b[1m${TQ}█     █  ███  █     █     █████ █████\x1b[0m`);
  console.log(`  \x1b[1m${TQ}█  █  █ █   █ █     █     █       █  \x1b[0m`);
  console.log(`  \x1b[1m${TQ}█ █ █ █ █████ █     █     ████    █  \x1b[0m`);
  console.log(`  \x1b[1m${TQ}██   ██ █   █ █     █     █       █  \x1b[0m`);
  console.log(`  \x1b[1m${TQ}█     █ █   █ █████ █████ █████   █  \x1b[0m`);
  nl();
  console.log(`  \x1b[2mFADP Agent Demo  ·  fluidnative.com/fadp\x1b[0m`);
  nl();
  hr("═");
  nl();

  // Auth status
  console.log(`  ${C.bold}Auth status:${C.reset}`);
  console.log(`  ${AGENT_KEY ? C.green+"✓" : C.gray+"○"}${C.reset}  FLUID_AGENT_KEY   ${AGENT_KEY ? C.green+"(live payments)" : C.gray+"not set — demo mode"}${C.reset}`);
  console.log(`  ${(FLDP_NAME && FLDP_KEY) ? C.green+"✓" : C.gray+"○"}${C.reset}  FLDP EC Key       ${(FLDP_NAME && FLDP_KEY) ? C.green+"(signing enabled)" : C.gray+"not set"}${C.reset}`);
  nl();

  // Live wallet balance from Fluid backend
  if (AGENT_KEY) {
    console.log(`  ${C.bold}Wallet Balance${C.reset}  ${C.dim}(Base mainnet · live from Fluid Wallet)${C.reset}`);
    const bal = await fetchWalletBalance();
    if (bal) {
      const usdc = parseFloat(bal.usdc || 0);
      const eth  = parseFloat(bal.eth  || 0);
      const usdt = parseFloat(bal.usdt || 0);
      const usdcColor = usdc >= 0.1 ? C.green : usdc > 0 ? C.yellow : C.red;
      console.log(`  ${C.cyan}USDC${C.reset}  ${usdcColor}${C.bold}${usdc.toFixed(2)}${C.reset}  ${usdc < 0.01 ? C.red+"⚠  Low balance — top up USDC on Base to pay"+C.reset : ""}`);
      console.log(`  ${C.cyan}ETH ${C.reset}  ${C.white}${eth.toFixed(6)}${C.reset}`);
      if (usdt > 0) console.log(`  ${C.cyan}USDT${C.reset}  ${C.white}${usdt.toFixed(2)}${C.reset}`);
      if (bal.address) console.log(`  ${C.cyan}Addr${C.reset}  ${C.dim}${bal.address}${C.reset}`);
    } else {
      console.log(`  ${C.yellow}⚠${C.reset}  Could not reach Fluid backend — check your connection`);
    }
    nl();
  }

  // Server check
  const health = await GET(`${SERVER}/health`).catch(() => null);
  if (!health || health.status !== 200) {
    console.log(`  ${C.red}✗${C.reset}  Server not running. Start it first:`);
    console.log(`     ${C.cyan}node server/index.js${C.reset}`);
    process.exit(1);
  }
  console.log(`  ${C.green}✓${C.reset}  Server online → ${C.cyan}${SERVER}${C.reset}`);
  nl();

  while (true) {
    hr();
    nl();
    console.log(`  ${C.bold}Choose an action:${C.reset}\n`);
    MENU.forEach(m => {
      if (m.key === "q") console.log(`  ${C.gray}[q]${C.reset}  Quit`);
      else console.log(`  ${C.cyan}[${m.key}]${C.reset}  ${m.label.padEnd(38)} ${C.yellow}${m.cost}${C.reset}`);
    });
    nl();

    const choice = await ask("Pick an option:");

    // ── 1: Single price ──────────────────────────────────────────────────────
    if (choice === "1") {
      const coin = (await ask(`Coin ID ${C.gray}(e.g. ethereum, bitcoin, solana)${C.reset}`) || "ethereum").toLowerCase();
      const ok   = await confirm(`Fetch ${C.cyan}${coin}${C.reset} price? Costs ${C.yellow}0.001 USDC${C.reset}.`);
      if (!ok) continue;
      const r = await fadpFetch("GET", `${SERVER}/api/price/${coin}`, null, async () => true);
      if (r?.status === 200) printResult(r.body);
    }

    // ── 2: Bulk prices ───────────────────────────────────────────────────────
    else if (choice === "2") {
      const raw  = (await ask(`Coin IDs ${C.gray}(comma-separated, e.g. ethereum,bitcoin,solana)${C.reset}`) || "ethereum,bitcoin,solana").replace(/\s/g,"");
      const ok   = await confirm(`Fetch prices for ${C.cyan}${raw}${C.reset}? Costs ${C.yellow}0.005 USDC${C.reset}.`);
      if (!ok) continue;
      const r = await fadpFetch("GET", `${SERVER}/api/prices?ids=${raw}`, null, async () => true);
      if (r?.status === 200) printResult(r.body);
    }

    // ── 3: Trending ──────────────────────────────────────────────────────────
    else if (choice === "3") {
      const ok = await confirm(`Fetch trending coins? Costs ${C.yellow}0.001 USDC${C.reset}.`);
      if (!ok) continue;
      const r = await fadpFetch("GET", `${SERVER}/api/trending`, null, async () => true);
      if (r?.status === 200) printResult(r.body);
    }

    // ── 4: Markets ───────────────────────────────────────────────────────────
    else if (choice === "4") {
      const ok = await confirm(`Fetch top 20 market cap? Costs ${C.yellow}0.002 USDC${C.reset}.`);
      if (!ok) continue;
      const r = await fadpFetch("GET", `${SERVER}/api/markets`, null, async () => true);
      if (r?.status === 200) printResult(r.body);
    }

    // ── 5: Swap quote ─────────────────────────────────────────────────────────
    else if (choice === "5") {
      const tokenIn  = (await ask(`Token in  ${C.gray}(e.g. USDC, ETH)${C.reset}`)  || "USDC").toUpperCase();
      const tokenOut = (await ask(`Token out ${C.gray}(e.g. ETH, USDC)${C.reset}`)  || "ETH").toUpperCase();
      const amount   =  await ask(`Amount    ${C.gray}(e.g. 100)${C.reset}`)         || "100";
      const ok       = await confirm(`Get quote: ${C.cyan}${amount} ${tokenIn} → ${tokenOut}${C.reset}? Costs ${C.yellow}0.002 USDC${C.reset}.`);
      if (!ok) continue;
      const r = await fadpFetch("POST", `${SERVER}/api/swap-quote`, { tokenIn, tokenOut, amountIn: amount }, async () => true);
      if (r?.status === 200) printResult(r.body);
    }

    // ── 6: Identity ───────────────────────────────────────────────────────────
    else if (choice === "6") {
      const handle = await ask(`Fluid ID or email ${C.gray}(e.g. alice@fluidnative.com)${C.reset}`) || "alice@fluidnative.com";
      const ok     = await confirm(`Resolve ${C.cyan}${handle}${C.reset}? Costs ${C.yellow}0.001 USDC${C.reset}.`);
      if (!ok) continue;
      const r = await fadpFetch("GET", `${SERVER}/api/identity/${encodeURIComponent(handle)}`, null, async () => true);
      if (r?.status === 200) printResult(r.body);
    }

    // ── 7: Balance ────────────────────────────────────────────────────────────
    else if (choice === "7") {
      const ok = await confirm(`Fetch wallet balance? Costs ${C.yellow}0.001 USDC${C.reset}.`);
      if (!ok) continue;
      const r = await fadpFetch("GET", `${SERVER}/api/balance`, null, async () => true);
      if (r?.status === 200) {
        nl();
        hr();
        const b = r.body;
        console.log(`  ${C.bold}Wallet Balance${C.reset}  ${C.dim}(chain: Base ${b.chainId || 8453})${C.reset}`);
        nl();
        console.log(`  ${C.cyan}ETH ${C.reset} ${C.bold}${b.eth || "—"}${C.reset}`);
        console.log(`  ${C.cyan}USDC${C.reset} ${C.bold}${b.usdc || "—"}${C.reset}`);
        console.log(`  ${C.cyan}USDT${C.reset} ${C.bold}${b.usdt || "—"}${C.reset}`);
        if (b._source) console.log(`\n  ${C.dim}source: ${b._source}${C.reset}`);
        hr();
      }
    }

    else if (choice === "q" || choice === "quit" || choice === "exit") {
      nl();
      console.log(`  ${C.gray}Goodbye!${C.reset}`);
      nl();
      break;
    }

    nl();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
