// Extension: thinking-viz
// Live token cost in JPY, plus workspace lifetime total and what it could buy.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createServer } from "node:http";
import { join } from "node:path";
import { joinSession, createCanvas } from "@github/copilot-sdk/extension";
import { renderHtml } from "./renderer.mjs";
import { describePurchase, formatYen } from "./catalog.mjs";

const INSTANCE_ID = "thinking-main";
const USD_PER_PREMIUM = 0.04;
const INPUT_USD_PER_M = 2.5;
const OUTPUT_USD_PER_M = 10;
const CACHE_USD_PER_M = 0.25;
const FX_FALLBACK = 148;

const servers = new Map();
const sseClients = new Set();
const seenCalls = new Set();

const copilotHome = process.env.COPILOT_HOME || join(homedir(), ".copilot");
const budgetFile = join(copilotHome, "extensions", "thinking-viz", "artifacts", "budget.json");

let fx = FX_FALLBACK;
let opening = false;
let ledgerFile = "";
let budgetYen = null;
let testTotalJpy = null;

const usage = emptyUsage();
const turn = emptyUsage();

function emptyUsage() {
    return {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        premiumCost: 0,
        nanoAiu: 0,
        model: "",
    };
}

function estimateUsd(u) {
    const fromTokens =
        (u.inputTokens / 1e6) * INPUT_USD_PER_M +
        (u.outputTokens / 1e6) * OUTPUT_USD_PER_M +
        (u.cacheReadTokens / 1e6) * CACHE_USD_PER_M;
    const fromPremium = (u.premiumCost || 0) * USD_PER_PREMIUM;
    const fromAiu = (u.nanoAiu / 1e9) * USD_PER_PREMIUM;
    return Math.max(fromTokens, fromPremium, fromAiu, 0);
}

function money(u) {
    const usd = estimateUsd(u);
    const jpy = usd * fx;
    return {
        usd,
        jpy,
        usdLabel: `$${usd.toFixed(4)}`,
        jpyLabel: formatYen(jpy),
        inputTokens: u.inputTokens,
        outputTokens: u.outputTokens,
        cacheReadTokens: u.cacheReadTokens,
        model: u.model,
        purchase: describePurchase(jpy),
    };
}

function budgetView(totalJpy) {
    if (!(budgetYen > 0)) {
        return { set: false, yen: 0, spent: totalJpy, remaining: 0, usedRatio: 0 };
    }
    const remaining = budgetYen - totalJpy;
    return {
        set: true,
        yen: budgetYen,
        yenLabel: formatYen(budgetYen),
        spent: totalJpy,
        remaining,
        remainingLabel: formatYen(remaining),
        overYen: remaining < 0 ? -remaining : 0,
        overLabel: formatYen(Math.abs(remaining)),
        usedRatio: Math.min(1, Math.max(0, totalJpy / budgetYen)),
        over: remaining < 0,
    };
}

function moneyFromJpy(jpy) {
    const usd = fx > 0 ? jpy / fx : 0;
    return {
        usd,
        jpy,
        usdLabel: `$${usd.toFixed(4)}`,
        jpyLabel: formatYen(jpy),
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        model: "test",
        purchase: describePurchase(jpy),
    };
}

function snapshot() {
    const live = money(turn);
    const total = testTotalJpy == null ? money(usage) : moneyFromJpy(testTotalJpy);
    return {
        live,
        total,
        budget: budgetView(total.jpy),
        testTotalJpy,
        fx,
    };
}

function broadcast() {
    const payload = `data: ${JSON.stringify(snapshot())}\n\n`;
    for (const res of sseClients) {
        try {
            res.write(payload);
        } catch {
            sseClients.delete(res);
        }
    }
}

function addUsage(target, data) {
    target.inputTokens += Number(data.inputTokens || 0);
    target.outputTokens += Number(data.outputTokens || 0);
    target.cacheReadTokens += Number(data.cacheReadTokens || 0);
    target.premiumCost += Number(data.cost || 0);
    target.nanoAiu += Number(data.copilotUsage?.totalNanoAiu || data.totalNanoAiu || 0);
    if (data.model) target.model = data.model;
}

async function loadLedger(workspacePath) {
    if (!workspacePath) return;
    ledgerFile = join(workspacePath, "files", "token-cost.json");
    try {
        const raw = JSON.parse(await readFile(ledgerFile, "utf8"));
        usage.inputTokens = Number(raw.inputTokens || 0);
        usage.outputTokens = Number(raw.outputTokens || 0);
        usage.cacheReadTokens = Number(raw.cacheReadTokens || 0);
        usage.premiumCost = Number(raw.premiumCost || 0);
        usage.nanoAiu = Number(raw.nanoAiu || 0);
        usage.model = String(raw.model || "");
        for (const id of raw.seenCalls || []) seenCalls.add(id);
    } catch {
        // first run in this workspace
    }
}

async function saveLedger() {
    if (!ledgerFile) return;
    try {
        await mkdir(join(ledgerFile, ".."), { recursive: true });
        await writeFile(
            ledgerFile,
            JSON.stringify({
                ...usage,
                seenCalls: [...seenCalls].slice(-400),
                updatedAt: new Date().toISOString(),
            }),
            "utf8",
        );
    } catch {
        // ignore disk errors
    }
}

async function loadBudget() {
    try {
        const raw = JSON.parse(await readFile(budgetFile, "utf8"));
        const n = Number(raw.yen);
        budgetYen = Number.isFinite(n) && n >= 0 ? n : null;
    } catch {
        budgetYen = null;
    }
}

async function saveBudget() {
    try {
        await mkdir(join(budgetFile, ".."), { recursive: true });
        await writeFile(
            budgetFile,
            JSON.stringify({ yen: budgetYen, updatedAt: new Date().toISOString() }),
            "utf8",
        );
    } catch {
        // ignore disk errors
    }
}

function readBody(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
            } catch {
                resolve({});
            }
        });
    });
}

async function setBudgetYen(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return false;
    budgetYen = n;
    await saveBudget();
    broadcast();
    return true;
}

async function refreshFx() {
    try {
        const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=JPY");
        if (!res.ok) return;
        const json = await res.json();
        const n = Number(json?.rates?.JPY);
        if (n > 0) fx = n;
    } catch {
        // keep fallback
    }
}

function json(res, body, status = 200) {
    res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(body));
}

async function startServer() {
    const html = renderHtml();
    const server = createServer((req, res) => {
        const url = new URL(req.url || "/", "http://127.0.0.1");
        if (req.method === "POST" && url.pathname === "/budget") {
            void readBody(req).then(async (body) => {
                const ok = await setBudgetYen(body.yen);
                json(res, { ok, budget: snapshot().budget }, ok ? 200 : 400);
            });
            return;
        }
        if (req.method === "POST" && url.pathname === "/test-total") {
            void readBody(req).then((body) => {
                const raw = body.yen;
                if (raw === "" || raw == null) {
                    testTotalJpy = null;
                } else {
                    const n = Number(raw);
                    if (!Number.isFinite(n) || n < 0) {
                        json(res, { ok: false }, 400);
                        return;
                    }
                    testTotalJpy = n;
                }
                broadcast();
                json(res, { ok: true, testTotalJpy });
            });
            return;
        }
        if (url.pathname === "/events") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache",
                Connection: "keep-alive",
            });
            res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
            sseClients.add(res);
            req.on("close", () => sseClients.delete(res));
            return;
        }
        if (url.pathname === "/state") {
            json(res, snapshot());
            return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    return { server, url: `http://127.0.0.1:${port}/` };
}

async function ensureOpen(session) {
    if (opening) return;
    opening = true;
    try {
        await session.rpc.canvas.open({
            canvasId: "thinking-viz",
            instanceId: INSTANCE_ID,
        });
    } catch {
        // already open or no renderer
    } finally {
        opening = false;
    }
}

function onSessionEvent(event) {
    const type = event?.type;
    const data = event?.data || {};
    if (type === "user.message") {
        Object.assign(turn, emptyUsage());
        broadcast();
        return;
    }
    if (type !== "assistant.usage") return;
    const callId = data.apiCallId || data.providerCallId || data.serviceRequestId;
    if (callId) {
        if (seenCalls.has(callId)) return;
        seenCalls.add(callId);
    }
    addUsage(turn, data);
    addUsage(usage, data);
    broadcast();
    void saveLedger();
}

const session = await joinSession({
    canvases: [
        createCanvas({
            id: "thinking-viz",
            displayName: "トークン料金",
            description:
                "消費トークンを円換算し、予算の残りとこのチャットの合計・買えるものを出すキャンバス。",
            actions: [
                {
                    name: "refresh",
                    description: "いまの円換算と合計、予算の残りを返す",
                    handler: async () => snapshot(),
                },
                {
                    name: "set_budget",
                    description: "予算を円で保存する",
                    inputSchema: {
                        type: "object",
                        properties: {
                            yen: { type: "number", description: "予算（円）" },
                        },
                        required: ["yen"],
                    },
                    handler: async (ctx) => {
                        const ok = await setBudgetYen(ctx.input?.yen);
                        return { ok, budget: snapshot().budget };
                    },
                },
            ],
            open: async (ctx) => {
                let entry = servers.get(ctx.instanceId);
                if (!entry) {
                    entry = await startServer();
                    servers.set(ctx.instanceId, entry);
                }
                return { title: "トークン料金", url: entry.url };
            },
            onClose: async (ctx) => {
                const entry = servers.get(ctx.instanceId);
                if (entry) {
                    servers.delete(ctx.instanceId);
                    await new Promise((resolve) => entry.server.close(() => resolve()));
                }
            },
        }),
    ],
});

await loadLedger(session.workspacePath);
await loadBudget();
void refreshFx().then(() => broadcast());

session.on((event) => {
    try {
        onSessionEvent(event);
        if (event?.type === "user.message") setTimeout(() => ensureOpen(session), 0);
    } catch {
        // never break the session from viz errors
    }
});
