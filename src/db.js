const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Create database instance
const db = new Database(path.join(dataDir, "agent_wallet.db"));

// Migrate: add dashboard_token column to existing databases
try {
  db.exec("ALTER TABLE users ADD COLUMN dashboard_token TEXT");
} catch (_) {
  /* already exists */
}

// Initialize database with all required tables
function initDB() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE NOT NULL,
      username TEXT,
      privy_user_id TEXT,
      wallet_address TEXT,
      wallet_id TEXT,
      dashboard_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Copy trades table
  db.exec(`
    CREATE TABLE IF NOT EXISTS copy_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      target_wallet TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      max_sol_per_trade REAL DEFAULT 0.1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Agent bots table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_bots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      agent_type TEXT,
      agent_name TEXT,
      config TEXT,
      is_running INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Transactions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      type TEXT,
      amount REAL,
      token_in TEXT,
      token_out TEXT,
      tx_signature TEXT,
      status TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Bank accounts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE NOT NULL,
      bank_name TEXT,
      account_number TEXT,
      account_name TEXT
    )
  `);
}

// Initialize database on module import
initDB();

// User Management Operations

/**
 * Get user by Telegram ID
 * @param {string} telegramId - Telegram user ID
 * @returns {object|null} User object or null if not found
 */
function getUserByTelegramId(telegramId) {
  const stmt = db.prepare("SELECT * FROM users WHERE telegram_id = ?");
  return stmt.get(telegramId) || null;
}

/**
 * Create a new user
 * @param {string} telegramId - Telegram user ID
 * @param {string} username - Telegram username
 * @param {string} privyUserId - Privy authentication service ID
 * @param {string} walletAddress - Solana wallet public address
 * @param {string} walletId - Internal wallet identifier
 * @returns {object} Newly created user object
 */
function createUser(
  telegramId,
  username,
  privyUserId,
  walletAddress,
  walletId,
) {
  const stmt = db.prepare(`
    INSERT INTO users (telegram_id, username, privy_user_id, wallet_address, wallet_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(telegramId, username, privyUserId, walletAddress, walletId);

  // Retrieve and return the newly created user
  return getUserByTelegramId(telegramId);
}

/**
 * Update user wallet information
 * @param {string} telegramId - Telegram user ID
 * @param {string} walletAddress - New wallet address
 * @param {string} walletId - New wallet ID
 * @param {string} privyUserId - New Privy user ID
 */
function updateUserWallet(telegramId, walletAddress, walletId, privyUserId) {
  const stmt = db.prepare(`
    UPDATE users 
    SET wallet_address = ?, wallet_id = ?, privy_user_id = ?
    WHERE telegram_id = ?
  `);
  stmt.run(walletAddress, walletId, privyUserId, telegramId);
}

// Copy Trading Configuration Operations

/**
 * Get active copy trades for a user
 * @param {string} telegramId - Telegram user ID
 * @returns {Array} Array of active copy trade configurations
 */
function getCopyTrades(telegramId) {
  const stmt = db.prepare(
    "SELECT * FROM copy_trades WHERE telegram_id = ? AND is_active = 1",
  );
  return stmt.all(telegramId);
}

/**
 * Add a new copy trade configuration
 * @param {string} telegramId - Telegram user ID
 * @param {string} targetWallet - Wallet address to copy
 * @param {number} maxSolPerTrade - Maximum SOL per trade
 */
function addCopyTrade(telegramId, targetWallet, maxSolPerTrade) {
  const stmt = db.prepare(`
    INSERT INTO copy_trades (telegram_id, target_wallet, max_sol_per_trade, is_active, created_at)
    VALUES (?, ?, ?, 1, datetime('now'))
  `);
  stmt.run(telegramId, targetWallet, maxSolPerTrade);
}

/**
 * Remove a copy trade configuration (soft delete)
 * @param {string} telegramId - Telegram user ID
 * @param {string} targetWallet - Wallet address to stop copying
 */
function removeCopyTrade(telegramId, targetWallet) {
  const stmt = db.prepare(`
    UPDATE copy_trades 
    SET is_active = 0
    WHERE telegram_id = ? AND target_wallet = ?
  `);
  stmt.run(telegramId, targetWallet);
}

// Agent Bot Configuration Operations

/**
 * Get all agent bots for a user
 * @param {string} telegramId - Telegram user ID
 * @returns {Array} Array of all agent bot configurations
 */
function getAgentBots(telegramId) {
  const stmt = db.prepare("SELECT * FROM agent_bots WHERE telegram_id = ?");
  return stmt.all(telegramId);
}

/**
 * Add a new agent bot configuration
 * @param {string} telegramId - Telegram user ID
 * @param {string} agentType - Type of agent (e.g., "trading", "monitoring")
 * @param {string} agentName - User-defined agent name
 * @param {string} config - JSON configuration string
 */
function addAgentBot(telegramId, agentType, agentName, config) {
  const stmt = db.prepare(`
    INSERT INTO agent_bots (telegram_id, agent_type, agent_name, config, is_running, created_at)
    VALUES (?, ?, ?, ?, 0, datetime('now'))
  `);
  stmt.run(telegramId, agentType, agentName, config);
}

/**
 * Update agent bot running status
 * @param {number} botId - Agent bot ID
 * @param {number} isRunning - Running status (0 or 1)
 */
function updateAgentStatus(botId, isRunning) {
  const stmt = db.prepare(`
    UPDATE agent_bots 
    SET is_running = ?
    WHERE id = ?
  `);
  stmt.run(isRunning, botId);
}

// Transaction Logging Operations

/**
 * Log a transaction
 * @param {string} telegramId - Telegram user ID
 * @param {string} type - Transaction type (e.g., "swap", "transfer")
 * @param {number} amount - Transaction amount
 * @param {string} tokenIn - Input token symbol
 * @param {string} tokenOut - Output token symbol
 * @param {string} txSignature - Blockchain transaction hash
 * @param {string} status - Transaction status (e.g., "success", "failed")
 */
function logTransaction(
  telegramId,
  type,
  amount,
  tokenIn,
  tokenOut,
  txSignature,
  status,
) {
  const stmt = db.prepare(`
    INSERT INTO transactions (telegram_id, type, amount, token_in, token_out, tx_signature, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  stmt.run(telegramId, type, amount, tokenIn, tokenOut, txSignature, status);
}

// Bank Account Management Operations

/**
 * Save or update bank account information (upsert)
 * @param {string} telegramId - Telegram user ID
 * @param {string} bankName - Name of bank
 * @param {string} accountNumber - Bank account number
 * @param {string} accountName - Account holder name
 */
function saveBankAccount(telegramId, bankName, accountNumber, accountName) {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO bank_accounts (telegram_id, bank_name, account_number, account_name)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(telegramId, bankName, accountNumber, accountName);
}

/**
 * Get bank account by Telegram ID
 * @param {string} telegramId - Telegram user ID
 * @returns {object|null} Bank account object or null if not found
 */
function getBankAccount(telegramId) {
  const stmt = db.prepare("SELECT * FROM bank_accounts WHERE telegram_id = ?");
  return stmt.get(telegramId) || null;
}

// Dashboard Token Operations

/**
 * Get existing dashboard token or generate a new one for the user.
 * @param {string} telegramId - Telegram user ID
 * @returns {string|null} Secure hex token
 */
function getOrCreateDashboardToken(telegramId) {
  const user = getUserByTelegramId(telegramId);
  if (!user) return null;
  if (user.dashboard_token) return user.dashboard_token;
  const token = crypto.randomBytes(28).toString("hex");
  db.prepare("UPDATE users SET dashboard_token = ? WHERE telegram_id = ?").run(
    token,
    telegramId,
  );
  return token;
}

/**
 * Lookup a user by their dashboard token.
 * @param {string} token - Dashboard token
 * @returns {object|null} User row or null
 */
function getUserByDashboardToken(token) {
  if (!token) return null;
  return (
    db.prepare("SELECT * FROM users WHERE dashboard_token = ?").get(token) ||
    null
  );
}

// Export database instance and functions
module.exports = db;
module.exports.initDB = initDB;
module.exports.getUserByTelegramId = getUserByTelegramId;
module.exports.createUser = createUser;
module.exports.updateUserWallet = updateUserWallet;
module.exports.getCopyTrades = getCopyTrades;
module.exports.addCopyTrade = addCopyTrade;
module.exports.removeCopyTrade = removeCopyTrade;
module.exports.getAgentBots = getAgentBots;
module.exports.addAgentBot = addAgentBot;
module.exports.updateAgentStatus = updateAgentStatus;
module.exports.logTransaction = logTransaction;
module.exports.saveBankAccount = saveBankAccount;
module.exports.getBankAccount = getBankAccount;
module.exports.getOrCreateDashboardToken = getOrCreateDashboardToken;
module.exports.getUserByDashboardToken = getUserByDashboardToken;
