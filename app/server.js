// server.js — Deployment server for AI Breakup Arbitrator
// This server holds a deployer wallet and deploys contracts on behalf of users.
// Users never see the private key. They just connect MetaMask for their own signing.
//
// Run: node server.js

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient, createAccount, chains } from 'genlayer-js';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY;
const PARTNER_A_PK = process.env.PARTNER_A_KEY;
const PARTNER_B_PK = process.env.PARTNER_B_KEY;

if (!DEPLOYER_PK || DEPLOYER_PK.includes('YOUR_DEPLOYER')) {
    console.error('\n❌  DEPLOYER_PRIVATE_KEY not set.\n');
    // Don't process.exit() on Vercel — it kills the serverless function entirely
}

// Load contract source — try multiple paths for compatibility with Vercel's bundler
let CONTRACT_SOURCE = '';
const possiblePaths = [
    join(__dirname, 'contract.py'),                      // local dev (same directory)
    join(__dirname, '..', 'contract.py'),                 // Vercel: bundled in api/ subfolder
    join(process.cwd(), 'contract.py'),                   // Vercel: project root via cwd
    join(process.cwd(), 'app', 'contract.py'),            // Vercel: if root isn't set to app/
];
for (const p of possiblePaths) {
    if (existsSync(p)) {
        CONTRACT_SOURCE = readFileSync(p, 'utf-8');
        console.log(`📄 Loaded contract from: ${p}`);
        break;
    }
}
if (!CONTRACT_SOURCE) {
    console.error(`❌ contract.py not found. Searched:\n${possiblePaths.join('\n')}`);
}

// Create a persistent deployer client (for deploy + reads)
let deployer = null;
let deployerClient = null;
try {
    if (DEPLOYER_PK) {
        deployer = createAccount(DEPLOYER_PK);
        deployerClient = createClient({
            chain: chains.studionet,
            endpoint: chains.studionet.rpcUrls.default.http[0],
            account: deployer,
        });
    }
} catch (err) {
    console.error('❌ Failed to create deployer account:', err.message);
}

// Build a map of partner address → genlayer client (for write transactions)
// Partners provide their Studionet private keys — stored server-side, never exposed to browser
const partnerClients = new Map();
function loadPartnerKey(pk, label) {
    if (!pk || pk.includes('YOUR_')) {
        console.warn(`⚠️  ${label} not set in .env — that partner cannot write to contracts`);
        return;
    }
    const acc = createAccount(pk);
    const c = createClient({ chain: chains.studionet, endpoint: chains.studionet.rpcUrls.default.http[0], account: acc });
    partnerClients.set(acc.address.toLowerCase(), c);
    console.log(`   ${label}: ${acc.address}`);
}

console.log(`\n⚖️  AI Breakup Arbitrator — Server`);
console.log(`   Deployer: ${deployer.address}`);
loadPartnerKey(PARTNER_A_PK, 'Partner A');
loadPartnerKey(PARTNER_B_PK, 'Partner B');
console.log(`   Network:  GenLayer Studionet\n`);

const app = express();
app.use(cors()); // allow all origins in production
app.use(express.json());

// Serve Vite build (production) using Express's built-in static middleware
const distPath = join(__dirname, 'dist');
if (existsSync(distPath)) {
    app.use(express.static(distPath));
    // SPA fallback — serve index.html for any non-API route
    app.use((req, res, next) => {
        if (req.path.startsWith('/api/')) return next();
        res.sendFile(join(distPath, 'index.html'));
    });
    console.log(`🌐 Serving frontend from /dist`);
}

// ─────────────────────────────────────────────
// POST /api/deploy
// Body: { partner_a: "0x...", partner_b: "0x..." }
// Returns: { hash, status } — client polls for finalization
// ─────────────────────────────────────────────
app.post('/api/deploy', async (req, res) => {
    if (!deployerClient) {
        return res.status(500).json({ error: 'Server misconfigured: DEPLOYER_PRIVATE_KEY not set.' });
    }
    if (!CONTRACT_SOURCE) {
        return res.status(500).json({ error: 'Server misconfigured: contract.py not found.' });
    }

    const { partner_a, partner_b } = req.body;

    if (!partner_a?.startsWith('0x') || !partner_b?.startsWith('0x')) {
        return res.status(400).json({ error: 'Both partner addresses must be valid 0x addresses.' });
    }

    if (partner_a.toLowerCase() === partner_b.toLowerCase()) {
        return res.status(400).json({ error: 'Partner A and Partner B must be different addresses.' });
    }

    console.log(`📝  Deploy request: A=${partner_a} B=${partner_b}`);

    try {
        const hash = await deployerClient.deployContract({
            code: CONTRACT_SOURCE,
            args: [partner_a, partner_b],
            leaderOnly: false,
        });

        console.log(`📤  Deploy tx: ${hash}`);
        res.json({ hash });
    } catch (err) {
        console.error('Deploy error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/tx/:hash — poll transaction status
// Returns: { status, statusName, contractAddress? }
// ─────────────────────────────────────────────
app.get('/api/tx/:hash', async (req, res) => {
    try {
        const tx = await deployerClient.getTransaction({ hash: req.params.hash });
        if (!tx) return res.json({ status: 'pending', statusName: 'PENDING' });

        const statusName = tx.statusName || '';
        const finalized = /FINALIZED/i.test(statusName);

        // Only check the LEADER receipt for success/failure
        // (some validators may disagree even in a successful tx — that's normal)
        const leaderResult = tx.consensus_data?.leader_receipt?.[0]?.result;
        const leaderFailed = leaderResult?.status === 'contract_error';

        if (finalized && leaderFailed) {
            const errMsg = leaderResult?.payload || 'Contract deployment failed';
            console.error('Deploy failed:', errMsg);
            return res.json({ status: 'error', statusName: 'FAILED', error: errMsg });
        }

        // On GenLayer Studionet, tx.to_address IS the deployed contract address
        const contractAddress = tx.to_address || null;

        console.log(`TX ${req.params.hash.slice(0, 10)}: ${statusName} | addr: ${contractAddress}`);
        res.json({
            status: statusName,
            statusName,
            contractAddress: finalized && !leaderFailed ? contractAddress : null,
        });
    } catch (err) {
        console.error('TX poll error:', err.message);
        res.json({ status: 'pending', error: err.message });
    }
});

// ─────────────────────────────────────────────
// POST /api/call — write a contract function on behalf of a partner
// Body: { sender: "0x...", contract: "0x...", function: "...", args: [...] }
// Returns: { hash }
// The server signs using the sender's stored Studionet private key.
// ─────────────────────────────────────────────
app.post('/api/call', async (req, res) => {
    const { sender, contract: contractAddr, function: fn, args = [] } = req.body;

    if (!sender?.startsWith('0x') || !contractAddr?.startsWith('0x') || !fn) {
        return res.status(400).json({ error: 'Missing sender, contract, or function.' });
    }

    const partnerClient = partnerClients.get(sender.toLowerCase());
    if (!partnerClient) {
        return res.status(403).json({
            error: `No key registered for address ${sender}. Add PARTNER_A_KEY or PARTNER_B_KEY to .env and restart the server.`,
        });
    }

    console.log(`📝  Call: ${fn}(${JSON.stringify(args)}) from ${sender.slice(0, 10)}…`);
    try {
        const hash = await partnerClient.writeContract({
            address: contractAddr,
            functionName: fn,
            args,
            value: 0n,
        });
        console.log(`📤  Call tx: ${hash}`);
        res.json({ hash });
    } catch (err) {
        console.error('Call error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ─────────────────────────────────────────────
// GET /api/call/:hash — poll a write tx status
// ─────────────────────────────────────────────
app.get('/api/call/:hash', async (req, res) => {
    try {
        const tx = await deployerClient.getTransaction({ hash: req.params.hash });
        if (!tx) return res.json({ status: 'PENDING' });
        const leaderResult = tx.consensus_data?.leader_receipt?.[0]?.result;
        const failed = leaderResult?.status === 'contract_error';
        const finalized = /FINALIZED/i.test(tx.statusName || '');
        if (finalized && failed) return res.json({ status: 'ERROR', error: leaderResult?.payload });
        res.json({ status: tx.statusName || 'PENDING', finalized: finalized && !failed });
    } catch (err) {
        res.json({ status: 'PENDING', error: err.message });
    }
});

// ─────────────────────────────────────────────
// Health check
// ─────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    res.json({
        ok: !!DEPLOYER_PK && !!CONTRACT_SOURCE,
        deployer: deployer?.address || 'NOT SET',
        partners: [...partnerClients.keys()],
        network: 'studionet',
        contractLoaded: !!CONTRACT_SOURCE,
        contractLength: CONTRACT_SOURCE.length,
        envSet: !!DEPLOYER_PK,
        __dirname,
        cwd: process.cwd(),
    });
});

if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`✅  Server running at http://localhost:${PORT}`);
        console.log(`   POST /api/deploy        — deploy contract`);
        console.log(`   POST /api/call          — write contract function`);
        console.log(`   GET  /api/tx/:hash      — poll deploy status`);
        console.log(`   GET  /api/call/:hash    — poll write status\n`);
    });
}

export default app;
