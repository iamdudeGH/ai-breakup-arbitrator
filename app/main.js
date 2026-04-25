import { createClient, createAccount, generatePrivateKey, chains } from 'genlayer-js';

// ───────────────────────────────────────────────
// CONFIG
// ───────────────────────────────────────────────
const STUDIONET = chains.studionet;

// ───────────────────────────────────────────────
// LOCAL ACCOUNT — generated once, stored in localStorage
// This is the user's persistent identity on GenLayer Studionet.
// Same pattern as GenLayer Studio itself.
// ───────────────────────────────────────────────
function getOrCreateLocalAccount() {
    let pk = localStorage.getItem('gl_private_key');
    if (!pk) {
        pk = generatePrivateKey();
        localStorage.setItem('gl_private_key', pk);
    }
    const account = createAccount(pk);
    return account;
}

const localAccount = getOrCreateLocalAccount();
const localAddress = localAccount.address.toLowerCase();

// genlayer-js client with the local account — signs transactions directly, no MetaMask
const client = createClient({
    chain: STUDIONET,
    endpoint: STUDIONET.rpcUrls.default.http[0],
    account: localAccount,
});

// ───────────────────────────────────────────────
// STATE
// ───────────────────────────────────────────────
let contractAddress = null;
let myRole = null; // 'A' | 'B' | 'observer'

// ───────────────────────────────────────────────
// INIT
// ───────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    createParticles();

    // Show user their address everywhere
    document.querySelectorAll('.my-address-display').forEach(el => {
        el.textContent = localAddress;
    });

    // Check URL for contract address
    const urlContract = new URLSearchParams(window.location.search).get('c');
    if (urlContract && urlContract.startsWith('0x')) {
        contractAddress = urlContract;
        document.getElementById('contract-input').value = urlContract;
        showToast('📋 Contract loaded from link', 'info');
    }
});

// ───────────────────────────────────────────────
// TABS
// ───────────────────────────────────────────────
window.switchTab = function (tab) {
    document.getElementById('panel-join').classList.toggle('hidden', tab !== 'join');
    document.getElementById('panel-create').classList.toggle('hidden', tab !== 'create');
    document.getElementById('tab-join').classList.toggle('active', tab === 'join');
    document.getElementById('tab-create').classList.toggle('active', tab === 'create');
};

// ───────────────────────────────────────────────
// JOIN EXISTING CONTRACT
// ───────────────────────────────────────────────
window.joinContract = async function () {
    const addrInput = document.getElementById('contract-input').value.trim();
    if (!addrInput.startsWith('0x')) return showError('connect-error', 'Enter a valid contract address (0x...)');
    contractAddress = addrInput;

    try {
        await refreshStatus();
        identifyRole();
        showApp();
        updateURL(contractAddress);
        showToast(`✅ Joined as ${truncAddr(localAddress)}`, 'success');
    } catch (e) {
        showError('connect-error', e.message || 'Failed to read contract');
    }
};

// ───────────────────────────────────────────────
// DEPLOY NEW CONTRACT (via server — server uses deployer key, not user's key)
// ───────────────────────────────────────────────
window.deployAndJoin = async function () {
    const pbAddr = document.getElementById('pb-input').value.trim();
    if (!pbAddr.startsWith('0x')) return showToast('Enter your partner\'s address (0x...)', 'error');
    if (pbAddr.toLowerCase() === localAddress) return showToast('Partner B must be a different address', 'error');

    const statusEl = document.getElementById('deploy-status');
    statusEl.classList.remove('hidden');
    statusEl.textContent = '⏳ Fetching contract source…';

    try {
        const sourceRes = await fetch('/contract.py');
        if (!sourceRes.ok) throw new Error('Failed to load contract source');
        const contractCode = await sourceRes.text();

        statusEl.textContent = '⏳ Deploying contract to GenLayer Studionet…';

        const hash = await client.deployContract({
            code: contractCode,
            args: [localAddress, pbAddr],
            leaderOnly: false,
        });

        statusEl.textContent = `📤 Deploy tx sent!\n${hash}\n⏳ Waiting for consensus (~30-60s)…`;
        pollDeploy(hash, statusEl);
    } catch (err) {
        statusEl.textContent = `❌ ${err.message}`;
    }
};

async function pollDeploy(hash, statusEl) {
    let attempts = 0;
    const iv = setInterval(async () => {
        attempts++;
        try {
            const tx = await client.getTransaction({ hash });
            const statusName = tx?.statusName || '';
            const leaderResult = tx?.consensus_data?.leader_receipt?.[0]?.result;

            if (/FINALIZED/i.test(statusName)) {
                clearInterval(iv);
                if (leaderResult?.status === 'contract_error') {
                    statusEl.textContent = `❌ Deploy failed: ${leaderResult.payload}`;
                } else {
                    contractAddress = tx.to_address;
                    statusEl.textContent = `✅ Contract deployed!\n${contractAddress}\n\nShare the link with your partner!`;
                    showToast('🎉 Contract is live!', 'success');
                    await refreshStatus();
                    identifyRole();
                    showApp();
                    updateURL(contractAddress);
                }
            }
        } catch { /* keep polling */ }
        if (attempts > 40) { clearInterval(iv); statusEl.textContent += '\n⚠️ Timeout — tx not confirmed.'; }
    }, 3000);
}

// ───────────────────────────────────────────────
// ROLE DETECTION
// ───────────────────────────────────────────────
function identifyRole() {
    const pa = (window._partnerA || '').toLowerCase();
    const pb = (window._partnerB || '').toLowerCase();

    myRole = localAddress === pa ? 'A' : localAddress === pb ? 'B' : 'observer';

    const configs = {
        A: { label: 'You are Partner A 💍', emoji: '👨', cls: 'role-a', caseTitle: '📝 Your Case (Partner A)' },
        B: { label: 'You are Partner B 💍', emoji: '👩', cls: 'role-b', caseTitle: '📝 Your Case (Partner B)' },
        observer: { label: '👁 Observer mode', emoji: '👁', cls: 'role-observer', caseTitle: '📝 Cases' },
    };
    const cfg = configs[myRole];

    document.getElementById('role-banner').className = `role-banner ${cfg.cls}`;
    document.getElementById('role-avatar').textContent = cfg.emoji;
    document.getElementById('role-name').textContent = cfg.label;
    document.getElementById('role-address').textContent = localAddress;
    document.getElementById('rc-addr').textContent = truncAddr(contractAddress);
    document.getElementById('my-case-title').textContent = cfg.caseTitle;

    if (myRole === 'observer') {
        document.querySelectorAll('.btn-primary').forEach(b => b.disabled = true);
        showToast('👁 Observer — your address is not a registered partner', 'info');
    }
}

// ───────────────────────────────────────────────
// READ CONTRACT STATE
// ───────────────────────────────────────────────
window.refreshStatus = async function () {
    if (!contractAddress) return;
    try {
        const [statusRaw, assetsRaw, partnersRaw] = await Promise.all([
            client.readContract({ address: contractAddress, functionName: 'get_status', args: [] }),
            client.readContract({ address: contractAddress, functionName: 'get_assets', args: [] }),
            client.readContract({ address: contractAddress, functionName: 'get_partners', args: [] }),
        ]);

        const status = String(statusRaw);
        const assets = Array.isArray(assetsRaw) ? assetsRaw : [];
        const partners = Array.isArray(partnersRaw) ? partnersRaw : [];

        window._partnerA = String(partners[0] || '').toLowerCase();
        window._partnerB = String(partners[1] || '').toLowerCase();

        updateStatusBadge(status);
        document.getElementById('si-status').textContent = status.toUpperCase();
        document.getElementById('si-pa').textContent = partners[0] ? truncAddr(String(partners[0])) : '—';
        document.getElementById('si-pb').textContent = partners[1] ? truncAddr(String(partners[1])) : '—';

        const list = document.getElementById('assets-list');
        list.innerHTML = assets.length
            ? '<div class="assets-label">Registered Assets</div>' + assets.map((a, i) => `<div class="asset-pill">${i + 1}. ${a}</div>`).join('')
            : '<div class="assets-empty">No assets added yet</div>';

        showPhasePanels(status);
        if (window._partnerA) identifyRole();
        if (status === 'resolved') await loadVerdict();

        if (status === 'active' || status === 'dispute') {
            try {
                const summary = await client.readContract({ address: contractAddress, functionName: 'get_case_summary', args: [] });
                updateCaseStatus(String(summary));
            } catch { /* optional */ }
        }
    } catch (e) {
        showToast(`⚠️ Read error: ${e.message}`, 'error');
    }
};

function updateCaseStatus(summary) {
    const hasA = summary.includes('case_a:') && !summary.includes('case_a: null') && !summary.includes('case_a: ""');
    const hasB = summary.includes('case_b:') && !summary.includes('case_b: null') && !summary.includes('case_b: ""');
    const rpa = document.querySelector('.rp-partner.a');
    const rpb = document.querySelector('.rp-partner.b');
    if (rpa) rpa.innerHTML = `<strong>Partner A</strong> ${hasA ? '✅ Case submitted' : '⏳ Case pending'}`;
    if (rpb) rpb.innerHTML = `<strong>Partner B</strong> ${hasB ? '✅ Case submitted' : '⏳ Case pending'}`;

    const myCaseIn = (myRole === 'A' && hasA) || (myRole === 'B' && hasB);
    if (myCaseIn) {
        const btn = document.getElementById('case-btn');
        const inp = document.getElementById('case-input');
        const badge = document.getElementById('case-submitted-badge');
        if (btn) { btn.disabled = true; btn.textContent = '✅ Case Submitted'; }
        if (inp) { inp.disabled = true; inp.placeholder = 'Your case has been submitted.'; }
        if (badge) badge.classList.remove('hidden');
    }
}

// ───────────────────────────────────────────────
// WRITE METHODS — signed locally, no MetaMask
// ───────────────────────────────────────────────
window.addAsset = () => txPrompt('add_asset', [document.getElementById('asset-input').value.trim()], 'asset-input', 'Add asset');
window.activate = () => sendTx('activate', [], 'Activate contract');
window.submitCase = () => txPrompt('submit_case', [document.getElementById('case-input').value.trim()], 'case-input', 'Submit case');
window.submitEvidence = () => {
    const ev = document.getElementById('evidence-input').value.trim();
    if (!ev) return showToast('Add evidence text', 'error');
    sendTx('submit_evidence', [ev], `Evidence: "${ev.slice(0, 30)}"`);
    document.getElementById('evidence-input').value = '';
    const li = document.createElement('div');
    li.className = 'ev-submitted-item'; li.textContent = `📎 ${ev}`;
    document.getElementById('my-evidence-list').appendChild(li);
};
window.requestResolution = async () => {
    const btn = document.getElementById('resolve-btn');
    btn.textContent = '⏳ Sending…'; btn.disabled = true;
    showToast('🤖 AI arbitration starting — takes ~60s', 'info');
    await sendTx('request_resolution', [], 'AI Resolution');
    btn.textContent = '⚡ Start AI Arbitration'; btn.disabled = false;
};

async function txPrompt(fn, args, clearId, label) {
    const val = args[0];
    if (!val || val.length < (fn === 'submit_case' ? 30 : 1))
        return showToast(fn === 'submit_case' ? 'Write at least 30 characters' : 'Field is empty', 'error');
    await sendTx(fn, args, label);
    if (clearId) document.getElementById(clearId).value = '';
}

async function sendTx(functionName, args, label) {
    if (!contractAddress) return showToast('No contract loaded', 'error');
    addTxLog(label, 'pending', '…');
    try {
        // Sign locally with the user's generated account — no MetaMask, no popups
        const hash = await client.writeContract({
            address: contractAddress,
            functionName,
            args,
            value: 0n,
        });
        updateTxLog(label, 'sent', hash);
        showToast(`📤 Transaction sent!`, 'info');
        pollTx(hash, label);
        setTimeout(refreshStatus, 4000);
    } catch (e) {
        console.error('[sendTx]', e);
        updateTxLog(label, 'error', e.message);
        showToast(`❌ ${e.message}`, 'error');
    }
}

async function pollTx(hash, label) {
    let n = 0;
    const iv = setInterval(async () => {
        n++;
        try {
            const tx = await client.getTransaction({ hash });
            const statusName = tx?.statusName || '';
            const leaderResult = tx?.consensus_data?.leader_receipt?.[0]?.result;

            if (/FINALIZED/i.test(statusName)) {
                clearInterval(iv);
                if (leaderResult?.status === 'contract_error') {
                    updateTxLog(label, 'error', leaderResult.payload);
                    showToast(`⚠️ ${label}: ${leaderResult.payload}`, 'error');
                } else {
                    updateTxLog(label, 'finalized', hash);
                    showToast(`✅ ${label} — confirmed on-chain!`, 'success');
                    await refreshStatus();
                }
            }
        } catch { /* keep polling */ }
        if (n > 40) clearInterval(iv);
    }, 3000);
}

window.loadVerdict = async function () {
    try {
        const r = await client.readContract({ address: contractAddress, functionName: 'get_resolution', args: [] });
        document.getElementById('verdict-text').innerHTML = String(r)
            .split('\n').map(l => `<p class="verdict-line${/^(RULING|SUMMARY|Asset:|Awarded|Reason:)/i.test(l.trim()) ? ' verdict-heading' : ''}">${escHtml(l) || '&nbsp;'}</p>`).join('');
    } catch { document.getElementById('verdict-text').textContent = 'Resolution not yet available.'; }
};

// ───────────────────────────────────────────────
// SHARE & DISCONNECT
// ───────────────────────────────────────────────
window.shareLink = function () {
    const url = `${location.origin}${location.pathname}?c=${contractAddress}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast('🔗 Link copied! Send it to your partner.', 'success');
        const btn = document.getElementById('share-btn');
        btn.textContent = '✅ Copied!';
        setTimeout(() => { btn.textContent = '🔗 Share Link'; }, 3000);
    });
};
window.disconnect = function () {
    contractAddress = null; myRole = null;
    document.getElementById('setup-screen').classList.remove('hidden');
    document.getElementById('app-screen').classList.add('hidden');
    const u = new URL(location); u.searchParams.delete('c'); history.replaceState({}, '', u);
};
function updateURL(addr) {
    const u = new URL(location); u.searchParams.set('c', addr); history.replaceState({}, '', u);
}
window.copyMyAddress = function () {
    navigator.clipboard.writeText(localAddress).then(() => {
        showToast('📋 Address copied!', 'success');
    });
};

// ───────────────────────────────────────────────
// UI UTILS
// ───────────────────────────────────────────────
function showApp() {
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
}
function showPhasePanels(status) {
    document.querySelectorAll('.phase-card').forEach(c => {
        c.style.display = c.dataset.phase.split(',').includes(status) ? 'block' : 'none';
    });
}
function updateStatusBadge(s) {
    document.getElementById('status-badge').className = 'status-badge status-' + s;
    document.getElementById('status-text').textContent = s.toUpperCase();
}

const txLog = [];
function addTxLog(l, s, d) { txLog.unshift({ l, s, d }); renderTxLog(); }
function updateTxLog(l, s, d) { const e = txLog.find(e => e.l === l && (e.s === 'pending' || e.s === 'sent')); if (e) { e.s = s; e.d = d; } renderTxLog(); }
function renderTxLog() {
    const el = document.getElementById('tx-log');
    if (!txLog.length) { el.innerHTML = '<div class="tx-empty">No transactions yet</div>'; return; }
    const icons = { pending: '⏳', sent: '📤', finalized: '✅', error: '❌' };
    el.innerHTML = txLog.slice(0, 8).map(e => `
    <div class="tx-item tx-${e.s}">
      <span>${icons[e.s] || '○'}</span>
      <span class="tx-label">${e.l}</span>
      <span class="tx-detail">${['finalized', 'sent'].includes(e.s) ? truncAddr(e.d) : e.d}</span>
    </div>`).join('');
}

function showError(id, msg) { const el = document.getElementById(id); el.textContent = `❌ ${msg}`; el.classList.remove('hidden'); }
function showToast(msg, type = 'info') {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('toast-visible'), 10);
    setTimeout(() => { t.classList.remove('toast-visible'); setTimeout(() => t.remove(), 300); }, 4500);
}
function truncAddr(a) { return a && a.length > 12 ? a.slice(0, 8) + '…' + a.slice(-6) : (a || ''); }
function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function createParticles() {
    const c = document.getElementById('particles');
    for (let i = 0; i < 40; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.cssText = `left:${Math.random() * 100}%;width:${Math.random() * 2 + 1}px;height:${Math.random() * 2 + 1}px;animation-duration:${Math.random() * 15 + 10}s;animation-delay:${Math.random() * 15}s;`;
        c.appendChild(p);
    }
}
