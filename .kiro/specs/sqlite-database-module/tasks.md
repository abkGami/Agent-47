# Implementation Plan: SQLite Database Module

## Overview

This plan implements a SQLite database module for a Solana AI agent wallet Telegram bot using better-sqlite3. The implementation follows a functional design pattern with synchronous operations, managing five core tables: users, copy_trades, agent_bots, transactions, and bank_accounts. All operations use CommonJS syntax and the synchronous better-sqlite3 API.

## Tasks

- [ ] 1. Set up database connection and initialization
  - Install better-sqlite3 dependency if not already present
  - Create src/db.js with database connection setup
  - Implement directory creation for ./data folder using fs.mkdirSync with recursive option
  - Create database instance pointing to ./data/agent_wallet.db
  - Implement initDB() function with CREATE TABLE IF NOT EXISTS statements for all five tables
  - Call initDB() automatically when module is imported
  - Export database instance as default export
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 7.1, 7.2, 7.3_

- [ ]* 1.1 Write property test for database initialization idempotency
  - **Property 1: Database initialization is idempotent**
  - **Validates: Requirements 1.9**

- [ ] 2. Implement user management operations
  - [ ] 2.1 Implement getUserByTelegramId function
    - Create prepared statement with SELECT query filtering by telegram_id
    - Use db.prepare().get() method to return single user or null
    - Export function
    - _Requirements: 2.1, 2.2, 2.3_
  
  - [ ] 2.2 Implement createUser function
    - Create prepared statement with INSERT query for all user fields
    - Use db.prepare().run() to insert record
    - Retrieve inserted record using lastInsertRowid
    - Return newly created user object
    - Export function
    - _Requirements: 2.4, 2.5, 2.6_
  
  - [ ] 2.3 Implement updateUserWallet function
    - Create prepared statement with UPDATE query for wallet_address, wallet_id, and privy_user_id
    - Use db.prepare().run() with telegram_id as WHERE condition
    - Export function
    - _Requirements: 2.7, 2.8_

- [ ]* 2.4 Write property tests for user management
  - **Property 2: User creation and retrieval round-trip**
  - **Validates: Requirements 2.2, 2.5, 2.6**
  - **Property 3: Non-existent user lookup returns null**
  - **Validates: Requirements 2.3**
  - **Property 4: User wallet update persistence**
  - **Validates: Requirements 2.8**

- [ ]* 2.5 Write unit tests for user management functions
  - Test getUserByTelegramId with existing and non-existent users
  - Test createUser with valid data
  - Test updateUserWallet updates correct fields
  - Test constraint violation when creating duplicate telegram_id
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

- [ ] 3. Implement copy trading configuration operations
  - [ ] 3.1 Implement getCopyTrades function
    - Create prepared statement with SELECT query filtering by telegram_id and is_active = 1
    - Use db.prepare().all() to return array of active copy trades
    - Export function
    - _Requirements: 3.1, 3.2_
  
  - [ ] 3.2 Implement addCopyTrade function
    - Create prepared statement with INSERT query including datetime('now') for created_at
    - Set is_active to 1 by default
    - Use db.prepare().run() to insert record
    - Export function
    - _Requirements: 3.3, 3.4_
  
  - [ ] 3.3 Implement removeCopyTrade function
    - Create prepared statement with UPDATE query setting is_active = 0
    - Filter by both telegram_id and target_wallet in WHERE clause
    - Use db.prepare().run() to update record
    - Export function
    - _Requirements: 3.5, 3.6_

- [ ]* 3.4 Write property tests for copy trading operations
  - **Property 5: Copy trade soft deletion removes from active results**
  - **Validates: Requirements 3.2, 3.6**
  - **Property 6: Copy trade creation makes configuration active**
  - **Validates: Requirements 3.4**

- [ ]* 3.5 Write unit tests for copy trading functions
  - Test getCopyTrades returns only active trades
  - Test addCopyTrade creates record with is_active = 1
  - Test removeCopyTrade sets is_active = 0 without deleting
  - Test getCopyTrades after removeCopyTrade excludes removed trade
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 4. Implement agent bot configuration operations
  - [ ] 4.1 Implement getAgentBots function
    - Create prepared statement with SELECT query filtering by telegram_id
    - Use db.prepare().all() to return array of all agent bots (regardless of is_running)
    - Export function
    - _Requirements: 4.1, 4.2_
  
  - [ ] 4.2 Implement addAgentBot function
    - Create prepared statement with INSERT query including datetime('now') for created_at
    - Set is_running to 0 by default
    - Use db.prepare().run() to insert record
    - Export function
    - _Requirements: 4.3, 4.4_
  
  - [ ] 4.3 Implement updateAgentStatus function
    - Create prepared statement with UPDATE query setting is_running field
    - Filter by bot id (not telegram_id) in WHERE clause
    - Use db.prepare().run() to update record
    - Export function
    - _Requirements: 4.5, 4.6_

- [ ]* 4.4 Write property tests for agent bot operations
  - **Property 7: Agent bot retrieval returns all user bots**
  - **Validates: Requirements 4.2**
  - **Property 8: Agent bot creation initializes as stopped**
  - **Validates: Requirements 4.4**
  - **Property 9: Agent bot status update persistence**
  - **Validates: Requirements 4.6**

- [ ]* 4.5 Write unit tests for agent bot functions
  - Test getAgentBots returns all bots for user
  - Test addAgentBot creates record with is_running = 0
  - Test updateAgentStatus updates is_running field correctly
  - Test config field stores JSON string properly
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ] 5. Implement transaction logging operations
  - [ ] 5.1 Implement logTransaction function
    - Create prepared statement with INSERT query for all transaction fields
    - Include datetime('now') for created_at timestamp
    - Use db.prepare().run() to insert record
    - Export function
    - _Requirements: 5.1, 5.2, 5.3_

- [ ]* 5.2 Write property test for transaction logging
  - **Property 10: Transaction logging round-trip**
  - **Validates: Requirements 5.2, 5.3**

- [ ]* 5.3 Write unit tests for transaction logging
  - Test logTransaction inserts record with all provided fields
  - Test logTransaction sets created_at automatically
  - Test multiple transactions can be logged for same user
  - _Requirements: 5.1, 5.2, 5.3_

- [ ] 6. Implement bank account management operations
  - [ ] 6.1 Implement saveBankAccount function
    - Create prepared statement with INSERT OR REPLACE query for upsert behavior
    - Use db.prepare().run() to insert or update record
    - Export function
    - _Requirements: 6.1, 6.2, 6.3_
  
  - [ ] 6.2 Implement getBankAccount function
    - Create prepared statement with SELECT query filtering by telegram_id
    - Use db.prepare().get() to return single bank account or null
    - Export function
    - _Requirements: 6.4, 6.5, 6.6_

- [ ]* 6.3 Write property tests for bank account operations
  - **Property 11: Bank account upsert behavior**
  - **Validates: Requirements 6.3**
  - **Property 12: Bank account save and retrieve round-trip**
  - **Validates: Requirements 6.2, 6.5**
  - **Property 13: Non-existent bank account lookup returns null**
  - **Validates: Requirements 6.6**

- [ ]* 6.4 Write unit tests for bank account functions
  - Test saveBankAccount creates new record when none exists
  - Test saveBankAccount updates existing record (no duplicates)
  - Test getBankAccount returns correct record
  - Test getBankAccount returns null for non-existent account
  - Test telegram_id UNIQUE constraint prevents duplicates
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [ ] 7. Implement error handling and module exports
  - [ ] 7.1 Verify all database operations propagate errors to callers
    - Ensure no try-catch blocks wrap database operations internally
    - Verify constraint violations throw SQLite errors
    - Test that errors include proper error codes (e.g., SQLITE_CONSTRAINT)
    - _Requirements: 7.4, 7.5_
  
  - [ ] 7.2 Finalize module exports
    - Export all functions using module.exports
    - Export database instance as default export
    - Verify CommonJS syntax throughout module
    - _Requirements: 7.1, 7.3_

- [ ]* 7.3 Write property test for error propagation
  - **Property 14: Database errors propagate to caller**
  - **Validates: Requirements 7.5**

- [ ]* 7.4 Write unit tests for error handling
  - Test duplicate telegram_id in users table throws SQLITE_CONSTRAINT
  - Test duplicate telegram_id in bank_accounts table throws SQLITE_CONSTRAINT
  - Test errors are not caught internally
  - _Requirements: 7.4, 7.5_

- [ ] 8. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Integration and final verification
  - [ ] 9.1 Verify module integration with existing bot code
    - Test that src/db.js can be required from other modules
    - Verify database file is created at correct path
    - Verify all exported functions are accessible
    - _Requirements: 7.1, 7.3_
  
  - [ ] 9.2 Create test database setup and teardown utilities
    - Implement helper to create test database in memory or temp location
    - Implement helper to clean up test databases after tests
    - Update all test files to use test database helpers
    - _Requirements: 1.2_

- [ ]* 9.3 Write integration tests for cross-component workflows
  - Test creating user, adding copy trade, and retrieving copy trades
  - Test creating user, adding agent bot, updating status, and retrieving bots
  - Test creating user, logging transaction, and querying transactions
  - Test creating user, saving bank account, and retrieving bank account
  - _Requirements: 2.1, 2.4, 3.1, 3.3, 4.1, 4.3, 5.1, 6.1, 6.4_

- [ ] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties using fast-check library
- Unit tests validate specific examples and edge cases
- All database operations use synchronous better-sqlite3 API
- Error handling follows fail-fast pattern with errors propagated to callers
- Module uses CommonJS syntax (require/module.exports) for Node.js compatibility
