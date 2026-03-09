/**
 * Test database helper utilities
 * This file provides helper functions for creating and cleaning up test databases.
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

/**
 * Create a test database in memory
 * @returns {Database} In-memory database instance
 */
function createTestDb() {
  const db = new Database(':memory:');
  
  // Initialize all tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE NOT NULL,
      username TEXT,
      privy_user_id TEXT,
      wallet_address TEXT,
      wallet_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
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
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE NOT NULL,
      bank_name TEXT,
      account_number TEXT,
      account_name TEXT
    )
  `);
  
  return db;
}

/**
 * Create a test database in a temporary file location
 * @param {string} testName - Name of the test (used for unique file naming)
 * @returns {object} Object containing database instance and file path
 */
function createTestDbFile(testName) {
  const tempDir = path.join(__dirname, '..', '..', 'data', 'test');
  
  // Create temp directory if it doesn't exist
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const dbPath = path.join(tempDir, `test_${testName}_${Date.now()}.db`);
  const db = new Database(dbPath);
  
  // Initialize all tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE NOT NULL,
      username TEXT,
      privy_user_id TEXT,
      wallet_address TEXT,
      wallet_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
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
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT UNIQUE NOT NULL,
      bank_name TEXT,
      account_number TEXT,
      account_name TEXT
    )
  `);
  
  return { db, dbPath };
}

/**
 * Clean up test database
 * @param {Database} db - Database instance to close
 * @param {string} dbPath - Optional path to database file to delete
 */
function cleanupTestDb(db, dbPath) {
  if (db && db.open) {
    db.close();
  }
  
  if (dbPath && dbPath !== ':memory:' && fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
}

/**
 * Clean up all test database files in the temp directory
 */
function cleanupAllTestDbs() {
  const tempDir = path.join(__dirname, '..', '..', 'data', 'test');
  
  if (fs.existsSync(tempDir)) {
    const files = fs.readdirSync(tempDir);
    files.forEach(file => {
      if (file.startsWith('test_') && file.endsWith('.db')) {
        fs.unlinkSync(path.join(tempDir, file));
      }
    });
  }
}

module.exports = {
  createTestDb,
  createTestDbFile,
  cleanupTestDb,
  cleanupAllTestDbs
};
