# Requirements Document

## Introduction

This document specifies the requirements for a SQLite database module for a Solana AI agent wallet Telegram bot. The module provides persistent storage for user data, copy trading configurations, agent bot settings, transaction logs, and bank account information using the better-sqlite3 library.

## Glossary

- **Database_Module**: The SQLite database interface module implemented in src/db.js
- **Users_Table**: Database table storing Telegram user and wallet information
- **Copy_Trades_Table**: Database table storing copy trading configurations
- **Agent_Bots_Table**: Database table storing AI agent bot configurations
- **Transactions_Table**: Database table storing transaction history
- **Bank_Accounts_Table**: Database table storing user bank account information
- **Telegram_ID**: Unique identifier for a Telegram user
- **Privy_User_ID**: Unique identifier from the Privy authentication service
- **Wallet_Address**: Solana blockchain wallet public address
- **Wallet_ID**: Internal identifier for a wallet
- **Target_Wallet**: Wallet address being monitored for copy trading
- **Agent_Type**: Category of AI agent (e.g., trading bot, monitoring bot)
- **TX_Signature**: Blockchain transaction signature hash

## Requirements

### Requirement 1: Database Initialization

**User Story:** As a developer, I want to initialize the database with required tables, so that the application can store persistent data.

#### Acceptance Criteria

1. THE Database_Module SHALL export a function named initDB
2. WHEN initDB is called, THE Database_Module SHALL create a database file at ./data/agent_wallet.db
3. WHEN the ./data directory does not exist, THE Database_Module SHALL create it before creating the database file
4. WHEN initDB is called, THE Database_Module SHALL create the Users_Table with columns: id (INTEGER PRIMARY KEY), telegram_id (TEXT UNIQUE), username (TEXT), privy_user_id (TEXT), wallet_address (TEXT), wallet_id (TEXT), created_at (DATETIME DEFAULT CURRENT_TIMESTAMP)
5. WHEN initDB is called, THE Database_Module SHALL create the Copy_Trades_Table with columns: id (INTEGER PRIMARY KEY), telegram_id (TEXT), target_wallet (TEXT), is_active (INTEGER DEFAULT 1), max_sol_per_trade (REAL DEFAULT 0.1), created_at (DATETIME)
6. WHEN initDB is called, THE Database_Module SHALL create the Agent_Bots_Table with columns: id (INTEGER PRIMARY KEY), telegram_id (TEXT), agent_type (TEXT), agent_name (TEXT), config (TEXT), is_running (INTEGER DEFAULT 0), created_at (DATETIME)
7. WHEN initDB is called, THE Database_Module SHALL create the Transactions_Table with columns: id (INTEGER PRIMARY KEY), telegram_id (TEXT), type (TEXT), amount (REAL), token_in (TEXT), token_out (TEXT), tx_signature (TEXT), status (TEXT), created_at (DATETIME)
8. WHEN initDB is called, THE Database_Module SHALL create the Bank_Accounts_Table with columns: id (INTEGER PRIMARY KEY), telegram_id (TEXT UNIQUE), bank_name (TEXT), account_number (TEXT), account_name (TEXT)
9. WHEN a table already exists, THE Database_Module SHALL not recreate or modify the existing table

### Requirement 2: User Management Operations

**User Story:** As a developer, I want to manage user records, so that I can store and retrieve user wallet information.

#### Acceptance Criteria

1. THE Database_Module SHALL export a function named getUserByTelegramId that accepts a Telegram_ID parameter
2. WHEN getUserByTelegramId is called with a valid Telegram_ID, THE Database_Module SHALL return the user record if it exists
3. WHEN getUserByTelegramId is called with a Telegram_ID that does not exist, THE Database_Module SHALL return null
4. THE Database_Module SHALL export a function named createUser that accepts parameters: telegramId, username, privyUserId, walletAddress, walletId
5. WHEN createUser is called, THE Database_Module SHALL insert a new record into the Users_Table with the provided parameters
6. WHEN createUser is called, THE Database_Module SHALL return the newly created user record
7. THE Database_Module SHALL export a function named updateUserWallet that accepts parameters: telegramId, walletAddress, walletId, privyUserId
8. WHEN updateUserWallet is called, THE Database_Module SHALL update the wallet_address, wallet_id, and privy_user_id fields for the user with the matching Telegram_ID

### Requirement 3: Copy Trading Configuration Management

**User Story:** As a developer, I want to manage copy trading configurations, so that users can configure which wallets to copy.

#### Acceptance Criteria

1. THE Database_Module SHALL export a function named getCopyTrades that accepts a Telegram_ID parameter
2. WHEN getCopyTrades is called, THE Database_Module SHALL return all records from Copy_Trades_Table where telegram_id matches and is_active equals 1
3. THE Database_Module SHALL export a function named addCopyTrade that accepts parameters: telegramId, targetWallet, maxSolPerTrade
4. WHEN addCopyTrade is called, THE Database_Module SHALL insert a new record into Copy_Trades_Table with is_active set to 1 and created_at set to the current timestamp
5. THE Database_Module SHALL export a function named removeCopyTrade that accepts parameters: telegramId, targetWallet
6. WHEN removeCopyTrade is called, THE Database_Module SHALL update the is_active field to 0 for records matching both telegram_id and target_wallet

### Requirement 4: Agent Bot Configuration Management

**User Story:** As a developer, I want to manage AI agent bot configurations, so that users can create and control multiple agent bots.

#### Acceptance Criteria

1. THE Database_Module SHALL export a function named getAgentBots that accepts a Telegram_ID parameter
2. WHEN getAgentBots is called, THE Database_Module SHALL return all records from Agent_Bots_Table where telegram_id matches the parameter
3. THE Database_Module SHALL export a function named addAgentBot that accepts parameters: telegramId, agentType, agentName, config
4. WHEN addAgentBot is called, THE Database_Module SHALL insert a new record into Agent_Bots_Table with is_running set to 0 and created_at set to the current timestamp
5. THE Database_Module SHALL export a function named updateAgentStatus that accepts parameters: botId, isRunning
6. WHEN updateAgentStatus is called, THE Database_Module SHALL update the is_running field for the record with matching id

### Requirement 5: Transaction Logging

**User Story:** As a developer, I want to log all transactions, so that users can view their transaction history.

#### Acceptance Criteria

1. THE Database_Module SHALL export a function named logTransaction that accepts parameters: telegramId, type, amount, tokenIn, tokenOut, txSignature, status
2. WHEN logTransaction is called, THE Database_Module SHALL insert a new record into Transactions_Table with created_at set to the current timestamp
3. WHEN logTransaction is called, THE Database_Module SHALL store all provided parameters in their respective columns

### Requirement 6: Bank Account Management

**User Story:** As a developer, I want to manage bank account information, so that users can configure off-ramp destinations.

#### Acceptance Criteria

1. THE Database_Module SHALL export a function named saveBankAccount that accepts parameters: telegramId, bankName, accountNumber, accountName
2. WHEN saveBankAccount is called with a Telegram_ID that has no existing bank account, THE Database_Module SHALL insert a new record into Bank_Accounts_Table
3. WHEN saveBankAccount is called with a Telegram_ID that has an existing bank account, THE Database_Module SHALL update the existing record with the new values
4. THE Database_Module SHALL export a function named getBankAccount that accepts a Telegram_ID parameter
5. WHEN getBankAccount is called, THE Database_Module SHALL return the bank account record for the matching Telegram_ID if it exists
6. WHEN getBankAccount is called with a Telegram_ID that has no bank account, THE Database_Module SHALL return null

### Requirement 7: Module Configuration and Error Handling

**User Story:** As a developer, I want proper module configuration and error handling, so that the module integrates correctly with Node.js applications.

#### Acceptance Criteria

1. THE Database_Module SHALL use CommonJS module syntax with require and module.exports
2. THE Database_Module SHALL use the synchronous API from the better-sqlite3 library
3. THE Database_Module SHALL export the database instance as the default export
4. WHEN any database operation encounters an error, THE Database_Module SHALL wrap the operation in a try-catch block
5. WHEN an error occurs during a database operation, THE Database_Module SHALL throw the error to the calling code
6. THE Database_Module SHALL use the better-sqlite3 library for all database operations
