/**
 * Agent-47 Personal Dashboard  --  app.js
 * Reads ?token= from URL, authenticates with server, renders user data.
 */

'use strict';

// --- Config ------------------------------------------------------------------
const PAGE_LABELS = {
  overview:     'Overview',
  transactions: 'Transactions',
  copytrade:    'Copy Trading',
  agents:       'AI Agents',
  offramp:      'Off-ramp',
};

// --- API base (set in config.js; empty = same origin for local dev) ----------
const API_BASE = (window.API_BASE || '').replace(/\/$/, '');

// --- Pull token from URL ------------------------------------------------------
const TOKEN = new URLSearchParams(window.location.search).get('token');

// --- State --------------------------------------------------------------------
let currentPage     = 'overview';
let txnOffset       = 0;
const TXN_LIMIT     = 25;
let txnTotal        = 0;
let allCopyTrades   = [];
let allAgents       = [];

// --- DOM helpers -------------------------------------------------------------
const $  = id => document.getElementById(id);
function setText(id, val) { const e=$(id); if(e) e.textContent=val; }
function setHTML(id, html){ const e=$(id); if(e) e.innerHTML=html;   }

// --- Toast --------------------------------------------------------------------
function toast(msg, type='info') {
  const area = $('toastArea');
  const el   = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  area.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// --- API fetch (always sends token) ------------------------------------------
async function api(path) {
  const sep = path.includes('?') ? '&' : '?';
  try {
    const res = await fetch(API_BASE + path + sep + 'token=' + TOKEN);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'HTTP ' + res.status);
    }
    return res.json();
  } catch (err) {
    console.error('[API]', path, err.message);
    return null;
  }
}

// --- Format helpers -----------------------------------------------------------
function fmtDate(str) {
  if (!str) return '--';
  return new Date(str).toLocaleString('en-GB', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });
}
function fmtDateShort(str) {
  if (!str) return '--';
  return new Date(str).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'});
}
function fmtSol(n) { return n == null ? '--' : parseFloat(n).toFixed(4); }
function addrShort(a) { if (!a || a.length < 12) return a || '--'; return a.slice(0,6) + '...' + a.slice(-4); }
function addrEl(addr) {
  if (!addr) return '<span class="cell-dim">--</span>';
  const url = 'https://explorer.solana.com/address/' + addr;
  return '<a class="addr" href="' + url + '" target="_blank" data-tip="' + addr + '">' + addrShort(addr) + '</a>';
}
function sigEl(sig) {
  if (!sig) return '<span class="cell-dim">--</span>';
  const url = 'https://explorer.solana.com/tx/' + sig;
  return '<a class="addr" href="' + url + '" target="_blank" data-tip="' + sig + '">' + sig.slice(0,8) + '...</a>';
}
function badgeStatus(s) {
  const m = {success:'badge-green',failed:'badge-red',pending:'badge-amber',error:'badge-red'};
  const c = m[String(s).toLowerCase()] || 'badge-gray';
  return '<span class="badge ' + c + '">' + (s || '--') + '</span>';
}
function badgeType(t) {
  const m = {swap:'badge-blue',transfer:'badge-gray',copy_trade:'badge-amber',offramp:'badge-green'};
  const c = m[String(t).toLowerCase()] || 'badge-gray';
  return '<span class="badge ' + c + '">' + (t || '--') + '</span>';
}
function badgeAgentType(t) {
  const m = {trader:'badge-blue',analyst:'badge-green',sniper:'badge-red',liquidity:'badge-amber'};
  const c = m[String(t).toLowerCase()] || 'badge-gray';
  return '<span class="badge ' + c + '">' + t + '</span>';
}
function activeTag(v) {
  return v
    ? '<span class="badge badge-green"><span class="dot dot-green"></span>Active</span>'
    : '<span class="badge badge-gray">Stopped</span>';
}
function runningTag(v) {
  return v
    ? '<span class="badge badge-green"><span class="dot dot-green"></span>Running</span>'
    : '<span class="badge badge-gray">Stopped</span>';
}
function configPills(obj) {
  if (!obj || typeof obj !== 'object') return '<span class="cell-dim">' + (obj || '--') + '</span>';
  return Object.entries(obj).map(function(e) {
    return '<span class="config-pill"><span class="config-key">' + e[0] + ':</span> <span class="config-val">' + e[1] + '</span></span>';
  }).join('');
}
function emptyRow(cols, msg) {
  msg = msg || 'No records found';
  return '<tr><td colspan="' + cols + '" style="text-align:center;padding:40px 0;color:var(--text-3);font-size:13px;">' + msg + '</td></tr>';
}

// --- Navigation ---------------------------------------------------------------
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(function(el) { el.classList.toggle('active', el.dataset.page === page); });
  document.querySelectorAll('.page').forEach(function(el) { el.classList.toggle('active', el.id === 'page-' + page); });
  setText('headerTitle', PAGE_LABELS[page] || page);
  loadPage(page);
}

document.querySelectorAll('.nav-item').forEach(function(el) { el.addEventListener('click', function() { navigate(el.dataset.page); }); });
$('btnRefresh').addEventListener('click', function() { loadPage(currentPage); toast('Refreshed'); });

// --- Screens -----------------------------------------------------------------
function showApp()     { $('screenLoading').style.display='none'; $('screenInvalid').style.display='none'; $('app').style.display='flex'; }
function showInvalid() { $('screenLoading').style.display='none'; $('screenInvalid').style.display='flex'; $('app').style.display='none'; }

// --- Page dispatcher ----------------------------------------------------------
function loadPage(page) {
  switch(page) {
    case 'overview':     loadOverview();     break;
    case 'transactions': loadTransactions(); break;
    case 'copytrade':    loadCopyTrade();    break;
    case 'agents':       loadAgents();       break;
    case 'offramp':      loadOfframp();      break;
  }
}

// --- User profile (sidebar) ---------------------------------------------------
async function loadProfile() {
  const data = await api('/api/me');
  if (!data) return;

  const net = data.network || 'devnet';
  const badge = $('networkBadge');
  badge.textContent = net;
  badge.className   = 'header-network-badge ' + net;
  setText('sidebarNet', net);

  const name = data.username ? '@' + data.username : 'ID ' + data.telegramId;
  setText('ucName', name);
  setText('ucAddr', addrShort(data.walletAddress) || 'No wallet');
  setText('ucSol',  fmtSol(data.balance.sol));
  setText('ucUsdc', fmtSol(data.balance.usdc));
}

// --- Overview -----------------------------------------------------------------
async function loadOverview() {
  const results = await Promise.all([
    api('/api/me/overview'),
    api('/api/me/transactions?limit=8&offset=0'),
  ]);
  const ov   = results[0];
  const txns = results[1];

  if (!ov) { toast('Failed to load overview', 'error'); return; }

  setText('st-total',          ov.totalTxns);
  setText('st-success-sub',    ov.successTxns + ' successful');
  setText('st-swaps',          ov.swapCount);
  setText('st-transfers',      ov.transferCount);
  setText('st-copies',         ov.totalCopies);
  setText('st-active-copies',  ov.activeCopies + ' active');
  setText('st-agents',         ov.totalAgents);
  setText('st-running-agents', ov.runningAgents + ' running');
  setText('st-offramps',       ov.offrampCount);
  setText('vol-swap',          fmtSol(ov.swapVol));
  setText('vol-transfer',      fmtSol(ov.transferVol));
  setText('vol-offramp',       fmtSol(ov.offrampVol));

  renderActivityChart(ov.activity || []);
  if (txns) renderRecentTxns(txns.rows || []);
}

function renderActivityChart(activity) {
  const chart = $('activityChart');
  const days  = [];
  for (let i = 6; i >= 0; i--) {
    const d   = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const found = activity.find(function(a) { return a.day === key; });
    days.push({ txns: found ? found.txns : 0, label: d.toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) });
  }
  const maxTxns = Math.max.apply(null, days.map(function(d) { return d.txns; }).concat([1]));
  if (days.every(function(d) { return d.txns === 0; })) {
    chart.innerHTML = '<div style="color:var(--text-3);font-size:12px;font-family:var(--mono);padding:20px 0">No activity in last 7 days</div>';
    return;
  }
  chart.innerHTML = days.map(function(d) {
    const pct = Math.max((d.txns / maxTxns) * 100, d.txns > 0 ? 4 : 1);
    return '<div class="bar-col"><div class="bar" style="height:' + pct + '%" data-tip="' + d.txns + ' txn' + (d.txns !== 1 ? 's' : '') + '"></div><div class="bar-label">' + d.label + '</div></div>';
  }).join('');
}

function renderRecentTxns(rows) {
  if (!rows.length) { setHTML('recentTxBody', emptyRow(5, 'No transactions yet')); return; }
  setHTML('recentTxBody', rows.map(function(r) {
    return '<tr>' +
      '<td>' + badgeType(r.type) + '</td>' +
      '<td class="cell-mono">' + fmtSol(r.amount) + '</td>' +
      '<td>' +
        (r.token_in  ? '<span class="badge badge-gray">' + r.token_in  + '</span>' : '') +
        (r.token_out ? '<span class="badge badge-gray">' + r.token_out + '</span>' : '') +
      '</td>' +
      '<td>' + badgeStatus(r.status) + '</td>' +
      '<td class="cell-dim">' + fmtDateShort(r.created_at) + '</td>' +
    '</tr>';
  }).join(''));
}

// --- Transactions -------------------------------------------------------------
async function loadTransactions(reset) {
  if (reset !== false) txnOffset = 0;
  const type   = $('txnTypeFilter').value;
  const status = $('txnStatusFilter').value;
  const params = new URLSearchParams({ limit: TXN_LIMIT, offset: txnOffset });
  if (type)   params.set('type',   type);
  if (status) params.set('status', status);
  const data = await api('/api/me/transactions?' + params.toString());
  if (!data) { toast('Failed to load transactions', 'error'); return; }
  txnTotal = data.total;
  setText('txnCount', data.total);
  renderTransactions(data.rows || []);
  updateTxnPagination();
}

function renderTransactions(rows) {
  if (!rows.length) { setHTML('txnBody', emptyRow(8)); return; }
  setHTML('txnBody', rows.map(function(r) {
    return '<tr>' +
      '<td class="cell-mono cell-dim">#' + r.id + '</td>' +
      '<td>' + badgeType(r.type) + '</td>' +
      '<td class="cell-mono">' + fmtSol(r.amount) + '</td>' +
      '<td><span class="badge badge-gray">' + (r.token_in  || '--') + '</span></td>' +
      '<td><span class="badge badge-gray">' + (r.token_out || '--') + '</span></td>' +
      '<td>' + sigEl(r.tx_signature) + '</td>' +
      '<td>' + badgeStatus(r.status) + '</td>' +
      '<td class="cell-dim">' + fmtDate(r.created_at) + '</td>' +
    '</tr>';
  }).join(''));
}

function updateTxnPagination() {
  const start = txnOffset + 1;
  const end   = Math.min(txnOffset + TXN_LIMIT, txnTotal);
  setText('txnPagInfo', txnTotal ? (start + '-' + end + ' of ' + txnTotal) : 'No records');
  $('txnPrev').disabled = txnOffset === 0;
  $('txnNext').disabled = txnOffset + TXN_LIMIT >= txnTotal;
}

$('txnPrev').addEventListener('click', function() { txnOffset = Math.max(0, txnOffset - TXN_LIMIT); loadTransactions(false); });
$('txnNext').addEventListener('click', function() { txnOffset += TXN_LIMIT; loadTransactions(false); });
['txnTypeFilter','txnStatusFilter'].forEach(function(id) { $(id).addEventListener('change', function() { loadTransactions(true); }); });

// --- Copy Trading -------------------------------------------------------------
async function loadCopyTrade() {
  const results = await Promise.all([
    api('/api/me/copy-trades'),
    api('/api/me/transactions?type=copy_trade&limit=100'),
  ]);
  const rows = results[0];
  const txns = results[1];
  if (!rows) { toast('Failed to load copy trades', 'error'); return; }
  allCopyTrades = rows;
  setText('ct-active', rows.filter(function(r) { return r.is_active; }).length);
  setText('ct-total',  rows.length);
  setText('ct-txns',   txns ? txns.total : '--');
  renderCopyTrades(allCopyTrades);
}

function renderCopyTrades(rows) {
  const sf = $('ctStatusFilter').value;
  const filtered = sf !== '' ? rows.filter(function(r) { return String(r.is_active) === sf; }) : rows;
  setText('ctCount', filtered.length);
  if (!filtered.length) { setHTML('ctBody', emptyRow(5, 'No copy trades configured yet')); return; }
  setHTML('ctBody', filtered.map(function(r) {
    return '<tr>' +
      '<td class="cell-mono cell-dim">#' + r.id + '</td>' +
      '<td>' + addrEl(r.target_wallet) + '</td>' +
      '<td class="cell-mono">' + fmtSol(r.max_sol_per_trade) + ' SOL</td>' +
      '<td>' + activeTag(r.is_active) + '</td>' +
      '<td class="cell-dim">' + fmtDate(r.created_at) + '</td>' +
    '</tr>';
  }).join(''));
}

$('ctStatusFilter').addEventListener('change', function() { renderCopyTrades(allCopyTrades); });

// --- AI Agents ----------------------------------------------------------------
async function loadAgents() {
  const rows = await api('/api/me/agents');
  if (!rows) { toast('Failed to load agents', 'error'); return; }
  allAgents = rows;
  setText('ag-running', rows.filter(function(r) { return r.is_running; }).length);
  ['trader','analyst','sniper','liquidity'].forEach(function(t) {
    setText('ag-' + t, rows.filter(function(r) { return r.agent_type === t; }).length);
  });
  renderAgents(allAgents);
}

function renderAgents(rows) {
  const tf = $('agTypeFilter').value;
  const sf = $('agStatusFilter').value;
  let f = rows;
  if (tf)      f = f.filter(function(r) { return r.agent_type === tf; });
  if (sf !== '') f = f.filter(function(r) { return String(r.is_running) === sf; });
  setText('agCount', f.length);
  if (!f.length) { setHTML('agBody', emptyRow(6, 'No agent bots created yet')); return; }
  setHTML('agBody', f.map(function(r) {
    return '<tr>' +
      '<td class="cell-mono cell-dim">#' + r.id + '</td>' +
      '<td class="cell-mono">' + (r.agent_name || '--') + '</td>' +
      '<td>' + badgeAgentType(r.agent_type) + '</td>' +
      '<td style="max-width:300px">' + configPills(r.config) + '</td>' +
      '<td>' + runningTag(r.is_running) + '</td>' +
      '<td class="cell-dim">' + fmtDate(r.created_at) + '</td>' +
    '</tr>';
  }).join(''));
}

['agTypeFilter','agStatusFilter'].forEach(function(id) { $(id).addEventListener('change', function() { renderAgents(allAgents); }); });

// --- Off-ramp -----------------------------------------------------------------
async function loadOfframp() {
  const results = await Promise.all([
    api('/api/me/bank'),
    api('/api/me/transactions?type=offramp&limit=50'),
  ]);
  const bank = results[0];
  const txns = results[1];

  // Bank card
  if (bank) {
    $('bankEmpty').style.display   = 'none';
    $('bankDetails').style.display = 'block';
    setText('bankName',     bank.bank_name      || '--');
    setText('bankAcct',     bank.account_number || '--');
    setText('bankAcctName', bank.account_name   || '--');
  } else {
    $('bankEmpty').style.display   = 'block';
    $('bankDetails').style.display = 'none';
  }

  // Off-ramp transactions
  const rows = txns ? txns.rows : [];
  setText('orCount', txns ? txns.total : 0);
  if (!rows.length) { setHTML('orBody', emptyRow(6, 'No off-ramp transactions yet')); return; }
  setHTML('orBody', rows.map(function(r) {
    return '<tr>' +
      '<td class="cell-mono cell-dim">#' + r.id + '</td>' +
      '<td class="cell-mono">' + fmtSol(r.amount) + '</td>' +
      '<td><span class="badge badge-gray">' + (r.token_in || '--') + '</span></td>' +
      '<td>' + sigEl(r.tx_signature) + '</td>' +
      '<td>' + badgeStatus(r.status) + '</td>' +
      '<td class="cell-dim">' + fmtDate(r.created_at) + '</td>' +
    '</tr>';
  }).join(''));
}

// --- Init ---------------------------------------------------------------------
(async function init() {
  if (!TOKEN) { showInvalid(); return; }

  // Verify token is valid by loading profile
  const profile = await api('/api/me');
  if (!profile) { showInvalid(); return; }

  showApp();

  // Populate sidebar user card + network badge
  const net = profile.network || 'devnet';
  const badge = $('networkBadge');
  badge.textContent = net;
  badge.className   = 'header-network-badge ' + net;
  setText('sidebarNet', net);
  setText('ucName',  profile.username ? '@' + profile.username : 'ID ' + profile.telegramId);
  setText('ucAddr',  addrShort(profile.walletAddress) || 'No wallet linked');
  setText('ucSol',   fmtSol(profile.balance.sol));
  setText('ucUsdc',  fmtSol(profile.balance.usdc));

  // Load default page
  navigate('overview');
})();
