/**
 * record-demos.mjs
 * Records all 4 live demo segments using Playwright + a mock EIP-1193 wallet.
 *
 * Why mock wallet (not Brave+Rabby):
 *   Rabby starts LOCKED in any copied profile (vault key is session-only).
 *   The mock provider answers eth_requestAccounts instantly - no popup, no password.
 *   All signing is done server-side via viem using DEPLOYER_PRIVATE_KEY.
 *
 * Prerequisites:
 *   1. oracle:   cd oracle && npm run dev        (port 8787)
 *   2. frontend: cd frontend && npm run dev -- --webpack  (port 3000)
 *   3. demo-video/.env with DEPLOYER_PRIVATE_KEY=0x...
 *
 * Run:               node scripts/record-demos.mjs
 * Single segment:    node scripts/record-demos.mjs --seg 2
 */

import { chromium } from "playwright";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, existsSync, readdirSync, renameSync, statSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const PUBLIC = resolve(ROOT, "public");

// ─── Load .env ───────────────────────────────────────────────────────────────
const envPath = resolve(ROOT, ".env");
if (!existsSync(envPath)) {
  console.error("ERROR: demo-video/.env not found.\nCreate it with DEPLOYER_PRIVATE_KEY=0x...");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);
const PRIVATE_KEY = env.DEPLOYER_PRIVATE_KEY;
const FRONTEND_URL = env.FRONTEND_URL || "http://localhost:3000";

if (!PRIVATE_KEY || !PRIVATE_KEY.startsWith("0x")) {
  console.error("ERROR: DEPLOYER_PRIVATE_KEY missing or invalid in demo-video/.env");
  process.exit(1);
}

// ─── Viem wallet client ───────────────────────────────────────────────────────
const unichainSepolia = {
  id: 1301,
  name: "Unichain Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://sepolia.unichain.org"] },
    public: { http: ["https://sepolia.unichain.org"] },
  },
};

const account = privateKeyToAccount(PRIVATE_KEY);
const DEPLOYER_ADDRESS = account.address;

const walletClient = createWalletClient({
  account,
  chain: unichainSepolia,
  transport: http("https://sepolia.unichain.org"),
});

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Mock wallet initScript (runs before any page scripts) ────────────────────
function mockWalletScript(address) {
  return `(function() {
  var addr = "${address}";
  var rpc = "https://sepolia.unichain.org";
  var _ev = {};
  var provider = {
    isMetaMask: true,
    isConnected: function(){ return true; },
    selectedAddress: addr,
    chainId: "0x515",
    networkVersion: "1301",
    on: function(ev, fn){ (_ev[ev]=_ev[ev]||[]).push(fn); return this; },
    removeListener: function(ev, fn){ if(_ev[ev]) _ev[ev]=_ev[ev].filter(function(f){return f!==fn;}); },
    _emit: function(ev, data){ (_ev[ev]||[]).forEach(function(f){f(data);}); },
    request: async function(req){
      var method = req.method, params = req.params||[];
      if(method==="eth_accounts"||method==="eth_requestAccounts") return [addr];
      if(method==="eth_chainId") return "0x515";
      if(method==="net_version") return "1301";
      if(method==="wallet_switchEthereumChain"||method==="wallet_addEthereumChain"){
        if(params[0]&&params[0].chainId){provider.chainId=params[0].chainId;provider._emit("chainChanged",params[0].chainId);}
        return null;
      }
      if(method==="eth_sendTransaction") return await window.__signTx(JSON.stringify(params[0]));
      if(method==="personal_sign") return await window.__signMsg(params[0], params[1]);
      if(method==="eth_signTypedData_v4") return await window.__signTyped(params[0], params[1]);
      var r = await fetch(rpc,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:method,params:params})});
      var j = await r.json();
      if(j.error) throw new Error(j.error.message);
      return j.result;
    }
  };
  try {
    Object.defineProperty(window,"ethereum",{value:provider,writable:false,configurable:false});
  } catch(e){ window.ethereum=provider; }
  var info = {uuid:"mock-mm",name:"MetaMask",icon:"data:image/svg+xml,<svg/>",rdns:"io.metamask"};
  window.dispatchEvent(new CustomEvent("eip6963:announceProvider",{detail:{info:info,provider:provider}}));
  window.addEventListener("eip6963:requestProvider",function(){
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider",{detail:{info:info,provider:provider}}));
  });
})();`;
}

// ─── Start a fresh recording context ────────────────────────────────────────
async function startContext() {
  const browser = await chromium.launch({
    headless: false,
    args: ["--window-size=1280,900", "--no-sandbox"],
  });

  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: PUBLIC, size: { width: 1280, height: 800 } },
  });

  await ctx.addInitScript(mockWalletScript(DEPLOYER_ADDRESS));

  await ctx.exposeFunction("__signTx", async (txJson) => {
    try {
      const tx = JSON.parse(txJson);
      const hash = await walletClient.sendTransaction({
        to: tx.to,
        data: tx.data,
        value: tx.value ? BigInt(tx.value) : 0n,
        ...(tx.gas ? { gas: BigInt(tx.gas) } : {}),
      });
      console.log(`    TX: ${hash}`);
      return hash;
    } catch (e) {
      console.error("    TX error:", e.shortMessage || e.message);
      throw e;
    }
  });

  await ctx.exposeFunction("__signMsg", async (msg) => {
    try {
      const sig = await walletClient.signMessage({ message: { raw: msg } });
      console.log("    Message signed");
      return sig;
    } catch (e) {
      console.error("    Sign error:", e.message);
      throw e;
    }
  });

  await ctx.exposeFunction("__signTyped", async (_addr, tdJson) => {
    try {
      const td = JSON.parse(tdJson);
      const { EIP712Domain: _d, ...cleanTypes } = td.types || {};
      const sig = await walletClient.signTypedData({
        domain: td.domain,
        types: cleanTypes,
        primaryType: td.primaryType,
        message: td.message,
      });
      console.log("    TypedData signed");
      return sig;
    } catch (e) {
      console.error("    TypedData error:", e.message);
      throw e;
    }
  });

  const page = await ctx.newPage();
  return { browser, ctx, page };
}

// ─── Connect wallet via RainbowKit modal ────────────────────────────────────
async function connectWallet(page) {
  await page.waitForLoadState("networkidle");
  await sleep(1200);

  const connectBtn = page.getByRole("button", { name: /connect wallet/i }).first();
  if (!(await connectBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
    console.log("  Already connected");
    return;
  }

  await connectBtn.click();
  await sleep(1000);

  // RainbowKit modal: select MetaMask (our mock announces as io.metamask)
  for (const name of ["MetaMask", "Browser Wallet", "Injected"]) {
    const btn = page.getByText(name, { exact: true }).first();
    if (await btn.isVisible({ timeout: 2500 }).catch(() => false)) {
      await btn.click();
      console.log(`  Selected: "${name}"`);
      await sleep(1800);
      break;
    }
  }

  // Wait for modal to close
  const modal = page.locator('[data-rk][role="dialog"]');
  await modal.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
  if (await modal.isVisible({ timeout: 500 }).catch(() => false)) {
    await page.keyboard.press("Escape");
    await sleep(500);
  }

  console.log("  Wallet connected");
}

// ─── Save video and shut down ───────────────────────────────────────────────
async function saveVideo(ctx, browser, targetName) {
  let videoPath;
  try {
    const pages = ctx.pages();
    if (pages.length > 0) videoPath = await pages[0].video()?.path();
  } catch (_) {}

  await ctx.close();
  await browser.close();
  await sleep(2500);

  if (videoPath && existsSync(videoPath)) {
    renameSync(videoPath, resolve(PUBLIC, targetName));
    console.log(`  Saved: ${targetName}`);
    return;
  }

  // Fallback: newest unnamed .webm in PUBLIC
  const files = readdirSync(PUBLIC)
    .filter((f) => f.endsWith(".webm") && !/^seg\d/.test(f))
    .map((f) => ({ f, mtime: statSync(resolve(PUBLIC, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length > 0) {
    renameSync(resolve(PUBLIC, files[0].f), resolve(PUBLIC, targetName));
    console.log(`  Saved (fallback): ${targetName}`);
  } else {
    console.warn(`  WARNING: no .webm found for ${targetName}`);
  }
}

// ─── SEGMENT 2: Creator Flow ─────────────────────────────────────────────────
async function recordSeg2() {
  console.log("\n=== Segment 2: Creator Flow ===");
  let browser = null, ctx = null;
  try {
    const r = await startContext();
    browser = r.browser; ctx = r.ctx;
    const page = r.page;

    await page.goto(`${FRONTEND_URL}/launch`, { waitUntil: "networkidle" });
    await connectWallet(page);
    await sleep(800);

    // Wait for the form: LaunchFlow now shows demo buttons
    console.log("  Waiting for upload form...");
    await page.getByText("Unique", { exact: true }).waitFor({ timeout: 10000 });

    // Step 1: click "Unique" demo asset
    console.log("  Clicking Unique demo asset...");
    await page.getByText("Unique", { exact: true }).click();
    await sleep(6500); // oracle scan animation (~4s)

    // Continue to Step 2
    await page.getByRole("button", { name: /continue to mint/i }).click();
    await sleep(800);

    // Step 2: fill token details
    console.log("  Filling token details...");
    const nameInput = page.getByPlaceholder(/token name/i);
    const symInput = page.getByPlaceholder(/symbol/i);
    if (await nameInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await nameInput.fill("Demo IP Token");
    }
    if (await symInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await symInput.fill("DIPT");
    }
    await sleep(500);

    // Attest & Mint
    console.log("  Attest & Mint...");
    await page.getByRole("button", { name: /attest.*mint/i }).click();
    await sleep(28000); // 2 on-chain txns

    // Step 3: Register IP
    console.log("  Register IP...");
    await page.getByRole("button", { name: /register ip/i }).click();
    await sleep(16000);

    // Step 4: Open Launchpad
    console.log("  Open Launchpad...");
    await page.getByRole("button", { name: /open launchpad/i }).click();
    await sleep(18000);

    // Show /creator page
    console.log("  Showing /creator...");
    await page.goto(`${FRONTEND_URL}/creator`, { waitUntil: "networkidle" });
    await sleep(4000);

    await saveVideo(ctx, browser, "seg2-creator.webm");
    ctx = null; browser = null;
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

// ─── SEGMENT 4: Collector + LP ────────────────────────────────────────────────
async function recordSeg4() {
  console.log("\n=== Segment 4: Collector + LP ===");
  let browser = null, ctx = null;
  try {
    const r = await startContext();
    browser = r.browser; ctx = r.ctx;
    const page = r.page;

    await page.goto(`${FRONTEND_URL}/market`, { waitUntil: "networkidle" });
    await connectWallet(page);
    await sleep(2000);

    console.log("  Showing IP market...");
    await sleep(2000);

    // Click first IP card
    const card = page.locator('a[href*="/trade"], a[href*="/pool"]').first();
    if (await card.isVisible({ timeout: 5000 }).catch(() => false)) {
      await card.click();
      await sleep(2000);
    }

    // Mint test raise-tokens
    const mintBtn = page.getByRole("button", { name: /mint test|get usdc|faucet/i });
    if (await mintBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("  Minting test tokens...");
      await mintBtn.click();
      await sleep(13000);
    }

    // Buy on bonding curve
    const amountInput = page
      .locator('input[type="number"], input[placeholder*="amount" i]')
      .first();
    if (await amountInput.isVisible({ timeout: 4000 }).catch(() => false)) {
      await amountInput.fill("50");
      await sleep(400);
      const buyBtn = page.getByRole("button", { name: /^buy/i }).first();
      if (await buyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        console.log("  Buying on bonding curve...");
        await buyBtn.click();
        await sleep(15000);
      }
    }

    await page.goto(`${FRONTEND_URL}/market/portfolio`, { waitUntil: "networkidle" });
    await sleep(2000);

    // LP role switch
    const roleBtn = page
      .getByRole("button", { name: /\blp\b|liquidity provider/i })
      .first();
    if (await roleBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("  Switching to LP role...");
      await roleBtn.click();
      await sleep(1000);
    }

    await page.goto(`${FRONTEND_URL}/pools`, { waitUntil: "networkidle" });
    await sleep(2500);

    const poolLink = page.locator('a[href*="/pool/"]').first();
    if (await poolLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await poolLink.click();
      await sleep(2500);
    }

    // IL simulator slider
    const slider = page.locator('input[type="range"]').first();
    if (await slider.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log("  Dragging IL slider...");
      const box = await slider.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 20 });
        await page.mouse.up();
      }
      await sleep(1200);
    }

    // Provide liquidity
    const provideBtn = page
      .getByRole("button", { name: /provide|add liquidity/i })
      .first();
    if (await provideBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
      console.log("  Providing liquidity...");
      await provideBtn.click();
      await sleep(800);
      const inputs = page.locator('input[type="number"]');
      const cnt = await inputs.count();
      for (let i = 0; i < cnt; i++) {
        await inputs.nth(i).fill("0.001");
        await sleep(250);
      }
      const confirmBtn = page
        .getByRole("button", { name: /confirm|approve|add|submit/i })
        .first();
      if (await confirmBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await confirmBtn.click();
        await sleep(16000);
      }
    }

    await page.goto(`${FRONTEND_URL}/portfolio`, { waitUntil: "networkidle" });
    await sleep(2500);

    await saveVideo(ctx, browser, "seg4-collector-lp.webm");
    ctx = null; browser = null;
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

// ─── SEGMENT 6: Living DRS ────────────────────────────────────────────────────
async function recordSeg6() {
  console.log("\n=== Segment 6: Living DRS ===");
  let browser = null, ctx = null;
  try {
    const r = await startContext();
    browser = r.browser; ctx = r.ctx;
    const page = r.page;

    await page.goto(`${FRONTEND_URL}/pools`, { waitUntil: "networkidle" });
    await connectWallet(page);
    await sleep(2500);

    // Pick pool with highest dilutionCount (typically second pool)
    console.log("  Finding Living-D pool...");
    const poolLinks = page.locator('a[href*="/pool/"]');
    const cnt = await poolLinks.count();
    const target = cnt >= 2 ? poolLinks.nth(1) : poolLinks.first();
    if (await target.isVisible({ timeout: 5000 }).catch(() => false)) {
      await target.click();
    }
    await sleep(3000);

    console.log("  Showing dilutionCount and effectiveD...");
    await sleep(4500);

    // Open Reactscan cross-chain proof in new tab
    console.log("  Opening Reactscan tab...");
    const newTab = await ctx.newPage();
    await newTab
      .goto(
        "https://lasna.reactscan.net/address/0xB44F024468dc78572D1Ad7b3f5Ce3A51408E5C5d",
        { waitUntil: "domcontentloaded", timeout: 20000 }
      )
      .catch(() => {});
    await sleep(4000);

    await page.bringToFront();
    await sleep(3500);

    await saveVideo(ctx, browser, "seg6-living-drs.webm");
    ctx = null; browser = null;
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

// ─── SEGMENT 8: The Gate ──────────────────────────────────────────────────────
async function recordSeg8() {
  console.log("\n=== Segment 8: The Gate ===");
  let browser = null, ctx = null;
  try {
    const r = await startContext();
    browser = r.browser; ctx = r.ctx;
    const page = r.page;

    await page.goto(`${FRONTEND_URL}/launch`, { waitUntil: "networkidle" });
    await connectWallet(page);
    await sleep(800);

    // Wait for demo buttons to appear
    await page.getByText("Unique", { exact: true }).waitFor({ timeout: 10000 });

    // Click "AI-replicated" (high DRS, gate blocks Continue)
    console.log("  Clicking AI-replicated asset...");
    await page.getByText("AI-replicated", { exact: true }).click();

    console.log("  Waiting for high DRS to load...");
    await sleep(6500); // oracle scan + gauge fill

    console.log("  Showing blocked gate...");
    await sleep(5000); // hold on blocked state for camera

    await saveVideo(ctx, browser, "seg8-gate.webm");
    ctx = null; browser = null;
  } finally {
    if (ctx) await ctx.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const SEGMENTS = [
  { num: 2, name: "seg2-creator",      fn: recordSeg2 },
  { num: 4, name: "seg4-collector-lp", fn: recordSeg4 },
  { num: 6, name: "seg6-living-drs",   fn: recordSeg6 },
  { num: 8, name: "seg8-gate",         fn: recordSeg8 },
];

async function main() {
  console.log("=== Veritas Demo Recorder ===");
  console.log(`Frontend: ${FRONTEND_URL}`);
  console.log(`Wallet:   ${DEPLOYER_ADDRESS}\n`);

  const segArg = process.argv.indexOf("--seg");
  const only = segArg !== -1 ? parseInt(process.argv[segArg + 1]) : null;

  for (const { num, name, fn } of SEGMENTS) {
    if (only !== null && num !== only) {
      console.log(`Skipping ${name}`);
      continue;
    }
    try {
      await fn();
      console.log(`Done: ${name}.webm\n`);
    } catch (e) {
      console.error(`ERROR in ${name}:`, e.message);
      console.error("Continuing...\n");
    }
  }

  console.log("All done. Files in demo-video/public/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
