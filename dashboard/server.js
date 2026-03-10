/**
 * Agent-47 Personal Dashboard Server
 * All API routes are authenticated by the user's dashboard_token.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const Database = require('better-sqlite3');
const fs       = require('fs');

// --- Solana ---
const { Connection, PublicKey, LAMPORTS_PER_SOL, clusterApiUrl } = require('@solana/web3.js');
const { getAssociatedTokenAddress } = require('@solana/spl-token');

const NETWORK    = process.env.NETWORK || 'devnet';
const RPC_URL    = process.env.SOLANA_RPC_URL || clusterApiUrl(NETWORK === 'mainnet' ? 'mainnet-beta' : 'devnet');
const connection = new Connection(RPC_URL, 'confirmed');

const USDC_MINT = NETWORK === 'mainnet'
  ? 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  : '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

// --- Database ---
const dbPath = path.join(__dirname, '..', 'data', 'agent_wallet.db');
if (!fs.existsSync(dbPath)) {
  console.warn('[dashboard] Database not found at', dbPath);
  console.warn('[dashboard] Start the bot first so the database is created.');
}
const db = new Database(dbPath, { readonly: false, fileMustExist: false });

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE NOT NULL,
    username TEXT, privy_user_id TEXT,
    wallet_address TEXT, wallet_id TEXT,
    dashboard_token TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS copy_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL, target_wallet TEXT NOT NULL,
    is_active INTEGER DEFAULT 1, max_sol_per_trade REAL DEFAULT 0.1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS agent_bots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL, agent_type TEXT, agent_name TEXT,
    config TEXT, is_running INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT NOT NULL, type TEXT, amount REAL,
    token_in TEXT, token_out TEXT, tx_signature TEXT, status TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id TEXT UNIQUE NOT NULL,
    bank_name TEXT, account_number TEXT, account_name TEXT
  );
`);
try { db.exec('ALTER TABLE users ADD COLUMN dashboard_token TEXT'); } catch (_) {}

// --- Helpers ---
async function fetchBalance(walletAddress) {
  try {
    const pk    = new PublicKey(walletAddress);
    const lamps = await connection.getBalance(pk);
    const sol   = lamps / LAMPORTS_PER_SOL;
    let   usdc  = 0;
    try {
      const ata  = await getAssociatedTokenAddress(new PublicKey(USDC_MINT), pk);
      const info = await connection.getTokenAccountBalance(ata);
      usdc = parseFloat(info.value.uiAmount || 0);
    } catch { /* no ATA */ }
    return { sol: parseFloat(sol.toFixed(6)), usdc: parseFloat(usdc.toFixed(4)) };
  } catch { return null; }
}

// --- Auth middleware ---
function withUser(req, res, next) {
  const token = req.query.token || req.headers['x-dashboard-token'];
  if (!token) return res.status(401).json({ error: 'Missing token' });
  const user = db.prepare('SELECT * FROM users WHERE dashboard_token = ?').get(token);
  if (!user)  return res.status(403).json({ error: 'Invalid token' });
  req.user = user;
  next();
}

// --- App ---
const app  = express();
const PORT = process.env.DASHBOARD_PORT || 4747;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// GET /api/me  -- profile + live balance
app.get('/api/me', withUser, async (req, res) => {
  const u       = req.user;
  const balance = u.wallet_address ? await fetchBalance(u.wallet_address) : null;
  res.json({
    telegramId:    u.telegram_id,
    username:      u.username,
    walletAddress: u.wallet_address,
    network:       NETWORK,
    balance:       balance || { sol: 0, usdc: 0 },
    createdAt:     u.created_at,
  });
});

// GET /api/me/overview  -- aggregate stats
app.get('/api/me/overview', withUser, (req, res) => {
  const tid = req.user.telegram_id;
  const q   = s => db.prepare(s).get(tid).c;
  const qv  = s => db.prepare(s).get(tid).v;

  const totalTxns     = q("SELECT COUNT(*) as c FROM transactions WHERE telegram_id=?");
  const successTxns   = q("SELECT COUNT(*) as c FROM transactions WHERE telegram_id=? AND status='success'");
  const swapCount     = q("SELECT COUNT(*) as c FROM transactions WHERE telegram_id=? AND type='swap'");
  const transferCount = q("SELECT COUNT(*) as c FROM transactions WHERE telegram_id=? AND type='transfer'");
  const offrampCount  = q("SELECT COUNT(*) as c FROM transactions WHERE telegram_id=? AND type='offramp'");
  const copyCount     = q("SELECT COUNT(*) as c FROM transactions WHERE telegram_id=? AND type='copy_trade'");
  const activeCopies  = q("SELECT COUNT(*) as c FROM copy_trades WHERE telegram_id=? AND is_active=1");
  const totalCopies   = q("SELECT COUNT(*) as c FROM copy_trades WHERE telegram_id=?");
  const runningAgents = q("SELECT COUNT(*) as c FROM agent_bots WHERE telegram_id=? AND is_running=1");
  const totalAgents   = q("SELECT COUNT(*) as c FROM agent_bots WHERE telegram_id=?");
  const swapVol       = qv("SELECT COALESCE(SUM(amount),0) as v FROM transactions WHERE telegram_id=? AND type IN ('swap','copy_trade') AND status='success'");
  const transferVol   = qv("SELECT COALESCE(SUM(amount),0) as v FROM transactions WHERE telegram_id=? AND type='transfer' AND status='success'");
  const offrampVol    = qv("SELECT COALESCE(SUM(amount),0) as v FROM transactions WHERE telegram_id=? AND type='offramp' AND status='success'");
  const activity      = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as txns
    FROM transactions WHERE telegram_id=? AND created_at >= date('now','-6 days')
    GROUP BY day ORDER BY day ASC
  `).all(tid);

  res.json({ totalTxns, successTxns, swapCount, transferCount, offrampCount, copyCount,
             activeCopies, totalCopies, runningAgents, totalAgents,
             swapVol, transferVol, offrampVol, activity });
});

// GET /api/me/transactions  -- paginated
app.get('/api/me/transactions', withUser, (req, res) => {
  const tid    = req.user.telegram_id;
  const limit  = Math.min(parseInt(req.query.limit) || 25, 100);
  const offset = parseInt(req.query.offset) || 0;
  const type   = req.query.type   || null;
  const status = req.query.status || null;

  let where = 'WHERE telegram_id = ?';
  const args = [tid];
  if (type)   { where += ' AND type = ?';   args.push(type);   }
  if (status) { where += ' AND status = ?'; args.push(status); }

  const rows  = db.prepare(`SELECT * FROM transactions ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) as c FROM transactions ${where}`).get(...args).c;
  res.json({ rows, total, limit, offset });
});

// GET /api/me/copy-trades
app.get('/api/me/copy-trades', withUser, (req, res) => {
  const rows = db.prepare('SELECT * FROM copy_trades WHERE telegram_id=? ORDER BY created_at DESC').all(req.user.telegram_id);
  res.json(rows);
});

// GET /api/me/agents
app.get('/api/me/agents', withUser, (req, res) => {
  const rows = db.prepare('SELECT * FROM agent_bots WHERE telegram_id=? ORDER BY created_at DESC').all(req.user.telegram_id);
  res.json(rows.map(r => { try { r.config = JSON.parse(r.config); } catch { /* ok */ } return r; }));
});

// GET /api/me/bank
app.get('/api/me/bank', withUser, (req, res) => {
  const row = db.prepare('SELECT * FROM bank_accounts WHERE telegram_id=?').get(req.user.telegram_id);
  res.json(row || null);
});

// Catch-all
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  Agent-47 Personal Dashboard`);
  console.log(`  Running at   http://localhost:${PORT}`);
  console.log(`  Network      ${NETWORK}`);
  console.log(`  Database     ${dbPath}\n`);
});
