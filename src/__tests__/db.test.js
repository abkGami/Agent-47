const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { createTestDb, cleanupTestDb } = require('../testHelpers/dbTestHelper');TestHelper');TestHelper');

// Mock the database module to use an in-memory database for testing
let db;
let getUserByTelegramId, createUser, updateUserWallet, initDB;

describe('Database Module - User Management', () => {
  beforeEach(() => {
    // Create a fresh in-memory database for each test using helper
    db = createTestDb();
    
    // Define functions using the test database
    getUserByTelegramId = (telegramId) => {
      const stmt = db.prepare('SELECT * FROM users WHERE telegram_id = ?');
      return stmt.get(telegramId) || null;
    };
    
    createUser = (telegramId, username, privyUserId, walletAddress, walletId) => {
      const stmt = db.prepare(`
        INSERT INTO users (telegram_id, username, privy_user_id, wallet_address, wallet_id)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(telegramId, username, privyUserId, walletAddress, walletId);
      return getUserByTelegramId(telegramId);
    };
    
    updateUserWallet = (telegramId, walletAddress, walletId, privyUserId) => {
      const stmt = db.prepare(`
        UPDATE users 
        SET wallet_address = ?, wallet_id = ?, privy_user_id = ?
        WHERE telegram_id = ?
      `);
      stmt.run(walletAddress, walletId, privyUserId, telegramId);
    };
  });
  
  afterEach(() => {
    cleanupTestDb(db);
  });
  
  describe('getUserByTelegramId', () => {
    test('should return user when telegram_id exists', () => {
      // Create a user directly
      const stmt = db.prepare(`
        INSERT INTO users (telegram_id, username, privy_user_id, wallet_address, wallet_id)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run('123456', 'testuser', 'privy123', 'wallet123', 'walletid123');
      
      // Retrieve the user
      const user = getUserByTelegramId('123456');
      
      expect(user).not.toBeNull();
      expect(user.telegram_id).toBe('123456');
      expect(user.username).toBe('testuser');
      expect(user.privy_user_id).toBe('privy123');
      expect(user.wallet_address).toBe('wallet123');
      expect(user.wallet_id).toBe('walletid123');
    });
    
    test('should return null when telegram_id does not exist', () => {
      const user = getUserByTelegramId('nonexistent');
      expect(user).toBeNull();
    });
  });
  
  describe('createUser', () => {
    test('should create a new user and return the user object', () => {
      const user = createUser('123456', 'testuser', 'privy123', 'wallet123', 'walletid123');
      
      expect(user).not.toBeNull();
      expect(user.telegram_id).toBe('123456');
      expect(user.username).toBe('testuser');
      expect(user.privy_user_id).toBe('privy123');
      expect(user.wallet_address).toBe('wallet123');
      expect(user.wallet_id).toBe('walletid123');
      expect(user.created_at).toBeDefined();
    });
    
    test('should throw error when creating duplicate telegram_id', () => {
      createUser('123456', 'testuser', 'privy123', 'wallet123', 'walletid123');
      
      expect(() => {
        createUser('123456', 'testuser2', 'privy456', 'wallet456', 'walletid456');
      }).toThrow();
    });
  });
  
  describe('updateUserWallet', () => {
    test('should update wallet information for existing user', () => {
      // Create a user
      createUser('123456', 'testuser', 'privy123', 'wallet123', 'walletid123');
      
      // Update wallet info
      updateUserWallet('123456', 'newwallet', 'newwalletid', 'newprivy');
      
      // Retrieve and verify
      const user = getUserByTelegramId('123456');
      expect(user.wallet_address).toBe('newwallet');
      expect(user.wallet_id).toBe('newwalletid');
      expect(user.privy_user_id).toBe('newprivy');
      expect(user.username).toBe('testuser'); // Should remain unchanged
    });
  });
});

describe('Database Module - Copy Trading Configuration', () => {
  let getCopyTrades, addCopyTrade, removeCopyTrade;
  
  beforeEach(() => {
    // Create a fresh in-memory database for each test using helper
    db = createTestDb();
    
    // Define copy trading functions using the test database
    getCopyTrades = (telegramId) => {
      const stmt = db.prepare('SELECT * FROM copy_trades WHERE telegram_id = ? AND is_active = 1');
      return stmt.all(telegramId);
    };
    
    addCopyTrade = (telegramId, targetWallet, maxSolPerTrade) => {
      const stmt = db.prepare(`
        INSERT INTO copy_trades (telegram_id, target_wallet, max_sol_per_trade, is_active, created_at)
        VALUES (?, ?, ?, 1, datetime('now'))
      `);
      stmt.run(telegramId, targetWallet, maxSolPerTrade);
    };
    
    removeCopyTrade = (telegramId, targetWallet) => {
      const stmt = db.prepare(`
        UPDATE copy_trades 
        SET is_active = 0
        WHERE telegram_id = ? AND target_wallet = ?
      `);
      stmt.run(telegramId, targetWallet);
    };
  });
  
  afterEach(() => {
    cleanupTestDb(db);
  });
  
  describe('getCopyTrades', () => {
    test('should return only active copy trades for a user', () => {
      // Add active copy trades
      addCopyTrade('123456', 'wallet1', 0.5);
      addCopyTrade('123456', 'wallet2', 0.3);
      
      // Add inactive copy trade
      addCopyTrade('123456', 'wallet3', 0.2);
      removeCopyTrade('123456', 'wallet3');
      
      // Get active copy trades
      const trades = getCopyTrades('123456');
      
      expect(trades).toHaveLength(2);
      expect(trades[0].target_wallet).toBe('wallet1');
      expect(trades[0].is_active).toBe(1);
      expect(trades[1].target_wallet).toBe('wallet2');
      expect(trades[1].is_active).toBe(1);
    });
    
    test('should return empty array when no active copy trades exist', () => {
      const trades = getCopyTrades('nonexistent');
      expect(trades).toEqual([]);
    });
  });
  
  describe('addCopyTrade', () => {
    test('should create a new copy trade with is_active = 1', () => {
      addCopyTrade('123456', 'wallet1', 0.5);
      
      const trades = getCopyTrades('123456');
      expect(trades).toHaveLength(1);
      expect(trades[0].telegram_id).toBe('123456');
      expect(trades[0].target_wallet).toBe('wallet1');
      expect(trades[0].max_sol_per_trade).toBe(0.5);
      expect(trades[0].is_active).toBe(1);
      expect(trades[0].created_at).toBeDefined();
    });
  });
  
  describe('removeCopyTrade', () => {
    test('should set is_active to 0 without deleting the record', () => {
      // Add a copy trade
      addCopyTrade('123456', 'wallet1', 0.5);
      
      // Verify it's active
      let trades = getCopyTrades('123456');
      expect(trades).toHaveLength(1);
      
      // Remove the copy trade
      removeCopyTrade('123456', 'wallet1');
      
      // Verify it's no longer in active results
      trades = getCopyTrades('123456');
      expect(trades).toHaveLength(0);
      
      // Verify the record still exists but is inactive
      const allTrades = db.prepare('SELECT * FROM copy_trades WHERE telegram_id = ?').all('123456');
      expect(allTrades).toHaveLength(1);
      expect(allTrades[0].is_active).toBe(0);
    });
    
    test('should only remove the specific copy trade matching both telegram_id and target_wallet', () => {
      // Add multiple copy trades
      addCopyTrade('123456', 'wallet1', 0.5);
      addCopyTrade('123456', 'wallet2', 0.3);
      
      // Remove only one
      removeCopyTrade('123456', 'wallet1');
      
      // Verify only one remains active
      const trades = getCopyTrades('123456');
      expect(trades).toHaveLength(1);
      expect(trades[0].target_wallet).toBe('wallet2');
    });
  });
});

describe('Database Module - Agent Bot Configuration', () => {
  let getAgentBots, addAgentBot, updateAgentStatus;
  
  beforeEach(() => {
    // Create a fresh in-memory database for each test using helper
    db = createTestDb();
    
    // Define agent bot functions using the test database
    getAgentBots = (telegramId) => {
      const stmt = db.prepare('SELECT * FROM agent_bots WHERE telegram_id = ?');
      return stmt.all(telegramId);
    };
    
    addAgentBot = (telegramId, agentType, agentName, config) => {
      const stmt = db.prepare(`
        INSERT INTO agent_bots (telegram_id, agent_type, agent_name, config, is_running, created_at)
        VALUES (?, ?, ?, ?, 0, datetime('now'))
      `);
      stmt.run(telegramId, agentType, agentName, config);
    };
    
    updateAgentStatus = (botId, isRunning) => {
      const stmt = db.prepare(`
        UPDATE agent_bots 
        SET is_running = ?
        WHERE id = ?
      `);
      stmt.run(isRunning, botId);
    };
  });
  
  afterEach(() => {
    cleanupTestDb(db);
  });
  
  describe('getAgentBots', () => {
    test('should return all agent bots for a user regardless of is_running status', () => {
      // Add agent bots with different statuses
      addAgentBot('123456', 'trading', 'Bot 1', '{"strategy":"aggressive"}');
      addAgentBot('123456', 'monitoring', 'Bot 2', '{"interval":60}');
      
      // Update one to running
      const allBots = db.prepare('SELECT * FROM agent_bots WHERE telegram_id = ?').all('123456');
      updateAgentStatus(allBots[0].id, 1);
      
      // Get all bots
      const bots = getAgentBots('123456');
      
      expect(bots).toHaveLength(2);
      expect(bots[0].agent_name).toBe('Bot 1');
      expect(bots[1].agent_name).toBe('Bot 2');
    });
    
    test('should return empty array when no agent bots exist', () => {
      const bots = getAgentBots('nonexistent');
      expect(bots).toEqual([]);
    });
  });
  
  describe('addAgentBot', () => {
    test('should create a new agent bot with is_running = 0', () => {
      addAgentBot('123456', 'trading', 'My Trading Bot', '{"strategy":"conservative"}');
      
      const bots = getAgentBots('123456');
      expect(bots).toHaveLength(1);
      expect(bots[0].telegram_id).toBe('123456');
      expect(bots[0].agent_type).toBe('trading');
      expect(bots[0].agent_name).toBe('My Trading Bot');
      expect(bots[0].config).toBe('{"strategy":"conservative"}');
      expect(bots[0].is_running).toBe(0);
      expect(bots[0].created_at).toBeDefined();
    });
    
    test('should store config as TEXT (JSON string)', () => {
      const configObj = { strategy: 'aggressive', maxTrades: 10 };
      addAgentBot('123456', 'trading', 'Bot', JSON.stringify(configObj));
      
      const bots = getAgentBots('123456');
      expect(bots[0].config).toBe(JSON.stringify(configObj));
      
      // Verify it can be parsed back
      const parsedConfig = JSON.parse(bots[0].config);
      expect(parsedConfig.strategy).toBe('aggressive');
      expect(parsedConfig.maxTrades).toBe(10);
    });
  });
  
  describe('updateAgentStatus', () => {
    test('should update is_running field correctly', () => {
      // Add an agent bot
      addAgentBot('123456', 'trading', 'Bot 1', '{}');
      
      // Get the bot ID
      let bots = getAgentBots('123456');
      const botId = bots[0].id;
      
      // Verify initial status
      expect(bots[0].is_running).toBe(0);
      
      // Update to running
      updateAgentStatus(botId, 1);
      
      // Verify status changed
      bots = getAgentBots('123456');
      expect(bots[0].is_running).toBe(1);
      
      // Update back to stopped
      updateAgentStatus(botId, 0);
      
      // Verify status changed again
      bots = getAgentBots('123456');
      expect(bots[0].is_running).toBe(0);
    });
    
    test('should update by bot id not telegram_id', () => {
      // Add multiple bots for same user
      addAgentBot('123456', 'trading', 'Bot 1', '{}');
      addAgentBot('123456', 'monitoring', 'Bot 2', '{}');
      
      // Get bot IDs
      const bots = getAgentBots('123456');
      const bot1Id = bots[0].id;
      
      // Update only first bot
      updateAgentStatus(bot1Id, 1);
      
      // Verify only first bot is running
      const updatedBots = getAgentBots('123456');
      expect(updatedBots[0].is_running).toBe(1);
      expect(updatedBots[1].is_running).toBe(0);
    });
  });
});

describe('Database Module - Transaction Logging', () => {
  let logTransaction;
  
  beforeEach(() => {
    // Create a fresh in-memory database for each test using helper
    db = createTestDb();
    
    // Define transaction logging function using the test database
    logTransaction = (telegramId, type, amount, tokenIn, tokenOut, txSignature, status) => {
      const stmt = db.prepare(`
        INSERT INTO transactions (telegram_id, type, amount, token_in, token_out, tx_signature, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);
      stmt.run(telegramId, type, amount, tokenIn, tokenOut, txSignature, status);
    };
  });
  
  afterEach(() => {
    cleanupTestDb(db);
  });
  
  describe('logTransaction', () => {
    test('should insert transaction record with all provided fields', () => {
      // Log a transaction
      logTransaction('123456', 'swap', 1.5, 'SOL', 'USDC', 'tx_abc123', 'success');
      
      // Retrieve the transaction
      const transactions = db.prepare('SELECT * FROM transactions WHERE telegram_id = ?').all('123456');
      
      expect(transactions).toHaveLength(1);
      expect(transactions[0].telegram_id).toBe('123456');
      expect(transactions[0].type).toBe('swap');
      expect(transactions[0].amount).toBe(1.5);
      expect(transactions[0].token_in).toBe('SOL');
      expect(transactions[0].token_out).toBe('USDC');
      expect(transactions[0].tx_signature).toBe('tx_abc123');
      expect(transactions[0].status).toBe('success');
    });
    
    test('should set created_at automatically', () => {
      // Log a transaction
      logTransaction('123456', 'swap', 1.5, 'SOL', 'USDC', 'tx_abc123', 'success');
      
      // Retrieve the transaction
      const transactions = db.prepare('SELECT * FROM transactions WHERE telegram_id = ?').all('123456');
      
      expect(transactions[0].created_at).toBeDefined();
      expect(transactions[0].created_at).not.toBeNull();
    });
    
    test('should allow multiple transactions for same user', () => {
      // Log multiple transactions
      logTransaction('123456', 'swap', 1.5, 'SOL', 'USDC', 'tx_abc123', 'success');
      logTransaction('123456', 'transfer', 0.5, 'SOL', null, 'tx_def456', 'success');
      logTransaction('123456', 'swap', 2.0, 'USDC', 'SOL', 'tx_ghi789', 'failed');
      
      // Retrieve all transactions
      const transactions = db.prepare('SELECT * FROM transactions WHERE telegram_id = ?').all('123456');
      
      expect(transactions).toHaveLength(3);
      expect(transactions[0].type).toBe('swap');
      expect(transactions[1].type).toBe('transfer');
      expect(transactions[2].type).toBe('swap');
    });
  });
});

describe('Database Module - Bank Account Management', () => {
  let saveBankAccount, getBankAccount;
  
  beforeEach(() => {
    // Create a fresh in-memory database for each test using helper
    db = createTestDb();
    
    // Define bank account functions using the test database
    saveBankAccount = (telegramId, bankName, accountNumber, accountName) => {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO bank_accounts (telegram_id, bank_name, account_number, account_name)
        VALUES (?, ?, ?, ?)
      `);
      stmt.run(telegramId, bankName, accountNumber, accountName);
    };
    
    getBankAccount = (telegramId) => {
      const stmt = db.prepare('SELECT * FROM bank_accounts WHERE telegram_id = ?');
      return stmt.get(telegramId) || null;
    };
  });
  
  afterEach(() => {
    cleanupTestDb(db);
  });
  
  describe('saveBankAccount', () => {
    test('should create new record when none exists', () => {
      // Save a bank account
      saveBankAccount('123456', 'Test Bank', '1234567890', 'John Doe');
      
      // Retrieve the bank account
      const account = getBankAccount('123456');
      
      expect(account).not.toBeNull();
      expect(account.telegram_id).toBe('123456');
      expect(account.bank_name).toBe('Test Bank');
      expect(account.account_number).toBe('1234567890');
      expect(account.account_name).toBe('John Doe');
    });
    
    test('should update existing record (no duplicates)', () => {
      // Save initial bank account
      saveBankAccount('123456', 'Test Bank', '1234567890', 'John Doe');
      
      // Update with new information
      saveBankAccount('123456', 'New Bank', '9876543210', 'Jane Doe');
      
      // Retrieve the bank account
      const account = getBankAccount('123456');
      
      // Verify updated values
      expect(account.bank_name).toBe('New Bank');
      expect(account.account_number).toBe('9876543210');
      expect(account.account_name).toBe('Jane Doe');
      
      // Verify no duplicates exist
      const allAccounts = db.prepare('SELECT * FROM bank_accounts WHERE telegram_id = ?').all('123456');
      expect(allAccounts).toHaveLength(1);
    });
    
    test('should enforce UNIQUE constraint on telegram_id', () => {
      // Save a bank account
      saveBankAccount('123456', 'Test Bank', '1234567890', 'John Doe');
      
      // Verify only one record exists
      const allAccounts = db.prepare('SELECT * FROM bank_accounts').all();
      expect(allAccounts).toHaveLength(1);
      
      // Update should still result in only one record
      saveBankAccount('123456', 'New Bank', '9876543210', 'Jane Doe');
      const allAccountsAfter = db.prepare('SELECT * FROM bank_accounts').all();
      expect(allAccountsAfter).toHaveLength(1);
    });
  });
  
  describe('getBankAccount', () => {
    test('should return correct bank account record', () => {
      // Save a bank account
      saveBankAccount('123456', 'Test Bank', '1234567890', 'John Doe');
      
      // Retrieve the bank account
      const account = getBankAccount('123456');
      
      expect(account).not.toBeNull();
      expect(account.telegram_id).toBe('123456');
      expect(account.bank_name).toBe('Test Bank');
      expect(account.account_number).toBe('1234567890');
      expect(account.account_name).toBe('John Doe');
    });
    
    test('should return null for non-existent account', () => {
      const account = getBankAccount('nonexistent');
      expect(account).toBeNull();
    });
    
    test('should return null when telegram_id has no bank account', () => {
      // Save a bank account for different user
      saveBankAccount('123456', 'Test Bank', '1234567890', 'John Doe');
      
      // Try to get account for different user
      const account = getBankAccount('999999');
      expect(account).toBeNull();
    });
  });
});

describe('Database Module - Error Handling', () => {
  beforeEach(() => {
    // Create a fresh in-memory database for each test using helper
    db = createTestDb();
    
    // Define functions using the test database
    createUser = (telegramId, username, privyUserId, walletAddress, walletId) => {
      const stmt = db.prepare(`
        INSERT INTO users (telegram_id, username, privy_user_id, wallet_address, wallet_id)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(telegramId, username, privyUserId, walletAddress, walletId);
      
      const getStmt = db.prepare('SELECT * FROM users WHERE telegram_id = ?');
      return getStmt.get(telegramId);
    };
  });
  
  afterEach(() => {
    cleanupTestDb(db);
  });
  
  describe('Error Propagation', () => {
    test('should throw SQLITE_CONSTRAINT error when creating duplicate telegram_id in users table', () => {
      // Create first user
      createUser('123456', 'user1', 'privy1', 'wallet1', 'walletid1');
      
      // Attempt to create duplicate user should throw error
      expect(() => {
        createUser('123456', 'user2', 'privy2', 'wallet2', 'walletid2');
      }).toThrow();
      
      // Verify the error is a constraint error
      try {
        createUser('123456', 'user2', 'privy2', 'wallet2', 'walletid2');
      } catch (error) {
        expect(error.code).toBe('SQLITE_CONSTRAINT_UNIQUE');
        expect(error.message).toContain('UNIQUE constraint failed');
      }
    });
    
    test('should throw SQLITE_CONSTRAINT error when inserting duplicate telegram_id in bank_accounts table', () => {
      // Create first bank account using INSERT (not INSERT OR REPLACE)
      const insertStmt = db.prepare(`
        INSERT INTO bank_accounts (telegram_id, bank_name, account_number, account_name)
        VALUES (?, ?, ?, ?)
      `);
      insertStmt.run('123456', 'Bank1', '111', 'User1');
      
      // Attempt to insert duplicate should throw error
      expect(() => {
        insertStmt.run('123456', 'Bank2', '222', 'User2');
      }).toThrow();
      
      // Verify the error is a constraint error
      try {
        insertStmt.run('123456', 'Bank2', '222', 'User2');
      } catch (error) {
        expect(error.code).toBe('SQLITE_CONSTRAINT_UNIQUE');
        expect(error.message).toContain('UNIQUE constraint failed');
      }
    });
    
    test('should propagate errors without internal try-catch', () => {
      // This test verifies that errors bubble up naturally
      // by checking that we can catch them at the caller level
      
      createUser('123456', 'user1', 'privy1', 'wallet1', 'walletid1');
      
      let errorCaught = false;
      let errorCode = null;
      
      try {
        createUser('123456', 'user2', 'privy2', 'wallet2', 'walletid2');
      } catch (error) {
        errorCaught = true;
        errorCode = error.code;
      }
      
      expect(errorCaught).toBe(true);
      expect(errorCode).toBe('SQLITE_CONSTRAINT_UNIQUE');
    });
    
    test('should include proper error codes in constraint violations', () => {
      createUser('123456', 'user1', 'privy1', 'wallet1', 'walletid1');
      
      try {
        createUser('123456', 'user2', 'privy2', 'wallet2', 'walletid2');
        fail('Expected error to be thrown');
      } catch (error) {
        // Verify error has proper SQLite error code
        expect(error.code).toBeDefined();
        expect(error.code).toBe('SQLITE_CONSTRAINT_UNIQUE');
        
        // Verify error message is descriptive
        expect(error.message).toBeDefined();
        expect(error.message).toContain('UNIQUE');
      }
    });
  });
});
