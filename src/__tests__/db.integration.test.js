const db = require('../db');
const path = require('path');
const fs = require('fs');

describe('Database Module - Integration Tests', () => {
  describe('Module Exports', () => {
    test('should export database instance as default export', () => {
      expect(db).toBeDefined();
      expect(typeof db.prepare).toBe('function');
      expect(typeof db.exec).toBe('function');
    });
    
    test('should be requireable from other modules', () => {
      // This test verifies that the module can be required
      // If this test runs, it means require('../db') worked successfully
      expect(db).toBeDefined();
      
      // Verify it's a valid database instance
      expect(db.open).toBe(true);
      expect(typeof db.prepare).toBe('function');
    });
    
    test('should export all required functions', () => {
      expect(typeof db.initDB).toBe('function');
      expect(typeof db.getUserByTelegramId).toBe('function');
      expect(typeof db.createUser).toBe('function');
      expect(typeof db.updateUserWallet).toBe('function');
      expect(typeof db.getCopyTrades).toBe('function');
      expect(typeof db.addCopyTrade).toBe('function');
      expect(typeof db.removeCopyTrade).toBe('function');
      expect(typeof db.getAgentBots).toBe('function');
      expect(typeof db.addAgentBot).toBe('function');
      expect(typeof db.updateAgentStatus).toBe('function');
      expect(typeof db.logTransaction).toBe('function');
      expect(typeof db.saveBankAccount).toBe('function');
      expect(typeof db.getBankAccount).toBe('function');
    });
    
    test('should use CommonJS syntax (require/module.exports)', () => {
      // Verify the module was loaded using require (CommonJS)
      // If this test runs, it means require() worked
      expect(db).toBeDefined();
      
      // Verify we can access the database instance
      expect(db.name).toBeDefined();
      expect(db.open).toBe(true);
    });
    
    test('should create database file at correct path', () => {
      // Verify the database file exists at ./data/agent_wallet.db
      const expectedPath = path.join(__dirname, '..', '..', 'data', 'agent_wallet.db');
      expect(fs.existsSync(expectedPath)).toBe(true);
      
      // Verify the database name matches
      expect(db.name).toBe(expectedPath);
    });
    
    test('should create data directory if it does not exist', () => {
      // Verify the data directory exists
      const dataDir = path.join(__dirname, '..', '..', 'data');
      expect(fs.existsSync(dataDir)).toBe(true);
      expect(fs.statSync(dataDir).isDirectory()).toBe(true);
    });
  });
  
  describe('Error Propagation in Real Module', () => {
    test('should propagate constraint violation errors to caller', () => {
      // Create a user with a unique telegram_id
      const uniqueId = `test_${Date.now()}_${Math.random()}`;
      db.createUser(uniqueId, 'testuser', 'privy123', 'wallet123', 'walletid123');
      
      // Attempt to create duplicate should throw error
      expect(() => {
        db.createUser(uniqueId, 'testuser2', 'privy456', 'wallet456', 'walletid456');
      }).toThrow();
      
      // Verify error has proper SQLite error code
      try {
        db.createUser(uniqueId, 'testuser2', 'privy456', 'wallet456', 'walletid456');
      } catch (error) {
        expect(error.code).toBe('SQLITE_CONSTRAINT_UNIQUE');
        expect(error.message).toContain('UNIQUE constraint failed');
      }
    });
    
    test('should not catch errors internally', () => {
      // This test verifies that errors bubble up naturally
      const uniqueId = `test_${Date.now()}_${Math.random()}`;
      db.createUser(uniqueId, 'user1', 'privy1', 'wallet1', 'walletid1');
      
      let errorCaught = false;
      let errorCode = null;
      
      try {
        db.createUser(uniqueId, 'user2', 'privy2', 'wallet2', 'walletid2');
      } catch (error) {
        errorCaught = true;
        errorCode = error.code;
      }
      
      expect(errorCaught).toBe(true);
      expect(errorCode).toBe('SQLITE_CONSTRAINT_UNIQUE');
    });
  });
});
