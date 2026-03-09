# Agent 47 - AI Agent Skills Documentation

## Overview

Agent 47 is a comprehensive Solana trading system designed for AI agents to autonomously manage wallets, execute trades, and interact with DeFi protocols. This system provides a complete infrastructure for building intelligent trading bots on Solana with enterprise-grade security through Privy's Trusted Execution Environment (TEE).

### What This System Does

- **Wallet Management**: Create and manage Solana wallets with secure key storage via Privy
- **Token Swaps**: Execute token swaps using Jupiter aggregator (SOL ↔ USDC)
- **Offramp to Fiat**: Convert crypto to Nigerian Naira via PAJ Cash protocol
- **Copy Trading**: Automatically mirror trades from whale wallets in real-time
- **Autonomous Agents**: Spawn AI bots for DCA trading, price monitoring, token sniping, and liquidity management
- **Transaction Management**: Track and log all transactions in SQLite database
- **Telegram Interface**: User-friendly bot interface for all operations

### Key Features

- 🔐 Secure key management with Privy TEE (no private keys exposed)
- ⚡ Real-time transaction monitoring via Solana WebSocket subscriptions
- 🤖 Autonomous agent system with cron-based scheduling
- 💱 Jupiter v6 integration for optimal swap routing
- 🏦 Direct fiat offramp to Nigerian bank accounts
- 📊 Comprehensive transaction logging and history
- 🐋 Whale wallet copy trading with configurable limits
- 🌐 Multi-network support (devnet/mainnet)


## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     Telegram Bot (src/bot.js)               │
│                  User Interface & Command Router             │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐   ┌────────▼────────┐   ┌──────▼──────┐
│  Wallet Module │   │   Swap Module   │   │ Offramp Mod │
│  (src/wallet)  │   │   (src/swap)    │   │ (src/offramp│
│                │   │                 │   │             │
│  - Privy SDK   │   │  - Jupiter API  │   │ - PAJ Cash  │
│  - Key Mgmt    │   │  - Price Data   │   │ - Bank Acct │
└────────────────┘   └─────────────────┘   └─────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────▼────────┐   ┌────────▼────────┐   ┌──────▼──────┐
│ Copy Trader    │   │  Agent System   │   │  Database   │
│ (copytrader)   │   │  (src/agents)   │   │  (src/db)   │
│                │   │                 │   │             │
│ - Log Monitor  │   │  - Cron Jobs    │   │ - SQLite    │
│ - Auto Mirror  │   │  - DCA/Alerts   │   │ - Tx Logs   │
└────────────────┘   └─────────────────┘   └─────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  Solana Network   │
                    │  (via Helius RPC) │
                    └───────────────────┘
```

### Module Responsibilities

- **bot.js**: Telegram bot interface, command routing, user interaction
- **wallet.js**: Wallet creation, balance queries, transaction signing via Privy
- **swap.js**: Jupiter integration for token swaps, price queries
- **offramp.js**: PAJ Cash integration for crypto-to-fiat conversion
- **copytrader.js**: Real-time transaction monitoring and trade mirroring
- **agents.js**: Autonomous bot spawning and management with cron scheduling
- **db.js**: SQLite database for user data, transactions, and configurations


## Wallet Operations

### Creating a Wallet

The system uses Privy to create server-managed Solana wallets with keys stored in a Trusted Execution Environment (TEE).

**Function Signature:**
```javascript
async function createSolanaWallet(telegramId: string): Promise<{
  walletId: string,
  walletAddress: string,
  privyUserId: string
}>
```

**Code Example:**
```javascript
const { createSolanaWallet } = require('./src/wallet');

// Create a new wallet for a user
const walletInfo = await createSolanaWallet('123456789');

console.log('Wallet Address:', walletInfo.walletAddress);
console.log('Wallet ID:', walletInfo.walletId);
console.log('Privy User ID:', walletInfo.privyUserId);

// Save to database
db.createUser(
  telegramId,
  username,
  walletInfo.privyUserId,
  walletInfo.walletAddress,
  walletInfo.walletId
);
```

**What Happens:**
1. Creates a Privy user with custom metadata (telegramId)
2. Generates a server-managed Solana wallet
3. Returns wallet address and IDs for storage
4. Private key never leaves Privy's TEE

### Checking Wallet Balance

**Function Signature:**
```javascript
async function getWalletBalance(
  walletAddress: string,
  connection?: Connection
): Promise<{
  sol: number,
  usdc: number
}>
```

**Code Example:**
```javascript
const { getWalletBalance, SOLANA_CONNECTION } = require('./src/wallet');

// Get balance for a wallet
const balance = await getWalletBalance(
  '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  SOLANA_CONNECTION
);

console.log(`SOL: ${balance.sol.toFixed(4)}`);
console.log(`USDC: ${balance.usdc.toFixed(2)}`);
```

**What It Does:**
- Queries SOL balance via `connection.getBalance()`
- Queries USDC balance by finding associated token account
- Returns human-readable amounts (not lamports/microunits)
- Handles missing USDC accounts gracefully (returns 0)


### Signing and Sending Transactions

**Function Signature:**
```javascript
async function signAndSendTransaction(
  walletId: string,
  transaction: Transaction,
  connection?: Connection
): Promise<string> // Returns transaction signature
```

**Code Example:**
```javascript
const { signAndSendTransaction, SOLANA_CONNECTION } = require('./src/wallet');
const { Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');

// Build a transaction
const transaction = new Transaction().add(
  SystemProgram.transfer({
    fromPubkey: new PublicKey(senderAddress),
    toPubkey: new PublicKey(recipientAddress),
    lamports: 1000000 // 0.001 SOL
  })
);

// Sign and send via Privy
const signature = await signAndSendTransaction(
  walletId,
  transaction,
  SOLANA_CONNECTION
);

console.log('Transaction signature:', signature);
console.log('View on Solscan:', `https://solscan.io/tx/${signature}`);
```

**Process Flow:**
1. Gets recent blockhash from Solana network
2. Serializes the transaction
3. Sends to Privy for signing (keys never leave TEE)
4. Receives signed transaction
5. Broadcasts to Solana network
6. Waits for confirmation
7. Returns transaction signature

**Retry Logic:**
- Automatically retries up to 3 times on failure
- Uses exponential backoff (2^attempt * 1000ms)
- Throws error after all retries exhausted


### Transferring SOL

**Function Signature:**
```javascript
async function transferSOL(
  walletId: string,
  walletAddress: string,
  recipientAddress: string,
  amount: number,
  connection?: Connection
): Promise<{
  success: boolean,
  signature: string | null,
  error: string | null
}>
```

**Code Example:**
```javascript
const { transferSOL, SOLANA_CONNECTION } = require('./src/wallet');

// Transfer 0.5 SOL to another wallet
const result = await transferSOL(
  'wallet_id_from_privy',
  'sender_wallet_address',
  '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  0.5,
  SOLANA_CONNECTION
);

if (result.success) {
  console.log('Transfer successful!');
  console.log('Signature:', result.signature);
} else {
  console.error('Transfer failed:', result.error);
}
```

**What It Does:**
- Validates sender and recipient addresses
- Checks sender has sufficient balance (including 0.001 SOL fee reserve)
- Creates SystemProgram transfer instruction
- Signs transaction via Privy TEE
- Sends to Solana network
- Returns success status and signature


### Transferring USDC

**Function Signature:**
```javascript
async function transferUSDC(
  walletId: string,
  walletAddress: string,
  recipientAddress: string,
  amount: number,
  connection?: Connection
): Promise<{
  success: boolean,
  signature: string | null,
  error: string | null
}>
```

**Code Example:**
```javascript
const { transferUSDC, SOLANA_CONNECTION } = require('./src/wallet');

// Transfer 10 USDC to another wallet
const result = await transferUSDC(
  'wallet_id_from_privy',
  'sender_wallet_address',
  '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  10,
  SOLANA_CONNECTION
);

if (result.success) {
  console.log('USDC transfer successful!');
  console.log('Signature:', result.signature);
} else {
  console.error('USDC transfer failed:', result.error);
}
```

**What It Does:**
- Validates sender and recipient addresses
- Checks sender has sufficient USDC balance
- Gets or creates recipient's USDC associated token account
- Creates SPL token transfer instruction
- Signs transaction via Privy TEE
- Sends to Solana network
- Returns success status and signature

**Important Notes:**
- Automatically creates recipient's USDC token account if it doesn't exist
- Sender pays for account creation (rent-exempt minimum ~0.002 SOL)
- Uses network-appropriate USDC mint (devnet or mainnet)


## Swap Operations

### Executing Token Swaps

The system uses Jupiter v6 aggregator for optimal swap routing across all Solana DEXs.

**Function Signature:**
```javascript
async function executeSwap(
  walletAddress: string,
  walletId: string,
  inputToken: string,    // "SOL" or "USDC"
  outputToken: string,   // "SOL" or "USDC"
  amount: number,        // Human-readable amount (e.g., 1.5)
  privyClient: PrivyClient,
  connection: Connection
): Promise<{
  success: boolean,
  signature: string | null,
  inputAmount: number,
  outputAmount: number,
  error: string | null
}>
```

**Code Example:**
```javascript
const { executeSwap } = require('./src/swap');
const { PrivyClient } = require('@privy-io/node');
const { SOLANA_CONNECTION } = require('./src/wallet');

// Initialize Privy client
const privyClient = new PrivyClient({
  appId: process.env.PRIVY_APP_ID,
  appSecret: process.env.PRIVY_APP_SECRET
});

// Execute a swap: 0.1 SOL -> USDC
const result = await executeSwap(
  '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', // wallet address
  'wallet_id_from_privy',                          // wallet ID
  'SOL',                                           // input token
  'USDC',                                          // output token
  0.1,                                             // amount
  privyClient,
  SOLANA_CONNECTION
);

if (result.success) {
  console.log(`Swapped ${result.inputAmount} SOL for ${result.outputAmount} USDC`);
  console.log(`Transaction: ${result.signature}`);
} else {
  console.error(`Swap failed: ${result.error}`);
}
```

**Swap Process:**
1. Converts human-readable amount to lamports/microunits
2. Calls Jupiter quote API for best route
3. Gets swap transaction from Jupiter
4. Deserializes VersionedTransaction
5. Signs with Privy
6. Sends to network
7. Waits for confirmation
8. Returns result with output amount

**Supported Tokens:**
- SOL (9 decimals)
- USDC (6 decimals)
  - Mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
  - Devnet: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`


### Getting Token Prices

**Function Signature:**
```javascript
async function getTokenPrice(tokenMint: string): Promise<number>
```

**Code Example:**
```javascript
const { getTokenPrice } = require('./src/swap');

// Get SOL price in USD
const solMint = 'So11111111111111111111111111111111111111112';
const price = await getTokenPrice(solMint);

console.log(`SOL Price: $${price.toFixed(2)}`);
```

### Getting Swap Quotes

**Function Signature:**
```javascript
async function getSwapQuote(
  inputMint: string,
  outputMint: string,
  amountLamports: number,
  slippageBps?: number  // Default: 50 (0.5%)
): Promise<object | null>
```

**Code Example:**
```javascript
const { getSwapQuote, TOKEN_MINTS } = require('./src/swap');

// Get quote for 1 SOL -> USDC
const quote = await getSwapQuote(
  TOKEN_MINTS.SOL,
  TOKEN_MINTS.USDC,
  1000000000,  // 1 SOL in lamports
  50           // 0.5% slippage
);

if (quote) {
  console.log(`Expected output: ${quote.outAmount} microUSDC`);
  console.log(`Price impact: ${quote.priceImpactPct}%`);
}
```


## Offramp to Naira

### PAJ Cash Integration

PAJ Cash is a Solana-native offramp protocol that converts crypto to Nigerian Naira within 5 minutes.

**How It Works:**
1. User sends USDC/SOL to PAJ Cash pool address
2. PAJ Cash detects the transfer on-chain
3. Naira is deposited to user's bank account
4. No API calls needed - purely on-chain

**Function Signature:**
```javascript
async function initiateOfframp(
  telegramId: string,
  token: string,              // "USDC" or "SOL"
  amount: number,             // Human-readable amount
  bankAccount: {
    bankName: string,
    accountNumber: string,
    accountName: string
  },
  walletAddress: string,
  walletId: string,
  privyClient: PrivyClient,
  connection: Connection,
  db: Database
): Promise<{
  success: boolean,
  signature: string | null,
  amountSent: number,
  estimatedNaira: number,
  message: string
}>
```

**Code Example:**
```javascript
const { initiateOfframp, saveBankAccount, getBankAccount } = require('./src/offramp');

// First, save user's bank account
await saveBankAccount(
  '123456789',           // telegramId
  'GTBank',              // bank name
  '0123456789',          // account number
  'John Doe',            // account holder name
  db
);

// Get bank account
const bankAccount = getBankAccount('123456789', db);

// Initiate offramp: 50 USDC -> Naira
const result = await initiateOfframp(
  '123456789',           // telegramId
  'USDC',                // token
  50,                    // amount
  bankAccount,           // bank details
  walletAddress,
  walletId,
  privyClient,
  SOLANA_CONNECTION,
  db
);

if (result.success) {
  console.log(`Sent ${result.amountSent} USDC`);
  console.log(`Estimated: ₦${result.estimatedNaira.toFixed(2)}`);
  console.log(`Transaction: ${result.signature}`);
  console.log('Naira should arrive in 5 minutes');
}
```


### Estimating Naira Amount

**Function Signature:**
```javascript
async function estimateNaira(usdcAmount: number): Promise<number>
```

**Code Example:**
```javascript
const { estimateNaira } = require('./src/offramp');

// Estimate Naira for 100 USDC
const naira = await estimateNaira(100);
console.log(`100 USDC ≈ ₦${naira.toFixed(2)}`);
```

**Exchange Rate Source:**
- Uses free API: `https://open.er-api.com/v6/latest/USD`
- Fetches real-time USD/NGN rate
- Falls back to ~1500 NGN/USD if API fails

**Important Notes:**
- PAJ Cash pool addresses must be configured (get from https://paj.cash)
- Default addresses are placeholders and will throw error
- Contact PAJ Cash team via SuperteamNG Discord for official addresses
- Only supports USDC and SOL
- Minimum amounts may apply (check with PAJ Cash)


## Copy Trading System

### Starting Copy Trading

Monitor a whale wallet and automatically mirror their trades in real-time.

**Function Signature:**
```javascript
async function startCopyTrading(
  telegramId: string,
  targetWalletAddress: string,
  maxSolPerTrade: number,
  userWalletAddress: string,
  userWalletId: string,
  privyClient: PrivyClient,
  connection: Connection,
  bot: TelegramBot,
  db: Database
): Promise<{
  success: boolean,
  message: string
}>
```

**Code Example:**
```javascript
const { startCopyTrading } = require('./src/copytrader');

// Start copying a whale wallet
const result = await startCopyTrading(
  '123456789',                                      // your telegram ID
  '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', // whale wallet
  0.1,                                              // max 0.1 SOL per trade
  userWalletAddress,
  userWalletId,
  privyClient,
  SOLANA_CONNECTION,
  bot,
  db
);

if (result.success) {
  console.log('Copy trading started!');
  console.log(result.message);
}
```

**How It Works:**
1. Subscribes to target wallet's transaction logs via WebSocket
2. Monitors for Jupiter swap transactions (program ID: `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4`)
3. Extracts swap details (input/output tokens, amounts)
4. Mirrors the trade with scaled amount (10% of whale's trade, capped at maxSolPerTrade)
5. Sends Telegram notification on success/failure
6. Logs transaction to database

**Safety Features:**
- DEVNET ONLY (enforced in code)
- Configurable max SOL per trade
- Automatic scaling (10% of whale's trade)
- Error handling with user notifications
- Transaction logging for audit trail


### Stopping Copy Trading

**Function Signature:**
```javascript
async function stopCopyTrading(
  telegramId: string,
  targetWalletAddress: string,
  connection: Connection,
  db: Database
): Promise<{
  success: boolean,
  message: string
}>
```

**Code Example:**
```javascript
const { stopCopyTrading } = require('./src/copytrader');

// Stop copying a wallet
const result = await stopCopyTrading(
  '123456789',
  '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  SOLANA_CONNECTION,
  db
);

console.log(result.message);
```

### Analyzing Wallet Activity

**Function Signature:**
```javascript
async function analyzeWallet(
  walletAddress: string,
  connection: Connection
): Promise<{
  recentSwaps: number,
  tokensTraded: string[],
  estimatedPnl: string,
  totalTransactions: number
}>
```

**Code Example:**
```javascript
const { analyzeWallet } = require('./src/copytrader');

// Analyze a wallet's trading activity
const analysis = await analyzeWallet(
  '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  SOLANA_CONNECTION
);

console.log(`Recent swaps: ${analysis.recentSwaps}`);
console.log(`Tokens traded: ${analysis.tokensTraded.join(', ')}`);
console.log(`Total transactions: ${analysis.totalTransactions}`);
```

**What It Does:**
- Fetches last 20 transactions
- Identifies Jupiter swaps
- Extracts traded tokens
- Returns trading statistics


## Autonomous Agent System

### Agent Types

The system supports 4 types of autonomous agents:

1. **Trader Agent**: DCA (Dollar Cost Average) trading bot
2. **Analyst Agent**: Price monitoring with alerts
3. **Sniper Agent**: New token launch monitoring
4. **Liquidity Agent**: Wallet balance monitoring

### Spawning an Agent

**Function Signature:**
```javascript
async function spawnAgent(
  telegramId: string,
  agentType: string,        // "trader" | "analyst" | "sniper" | "liquidity"
  agentName: string,
  config: object,           // Agent-specific configuration
  userWallet: string,
  walletId: string,
  privyClient: PrivyClient,
  connection: Connection,
  bot: TelegramBot,
  db: Database
): Promise<{
  success: boolean,
  agentId: string | null,
  message: string
}>
```

### Trader Agent (DCA Bot)

**Configuration:**
```javascript
{
  intervalMinutes: 5,        // Execute trade every 5 minutes
  buyAmountSol: 0.01,        // Buy 0.01 SOL worth each time
  targetToken: "USDC",       // Token to buy
  enabled: true              // Enable/disable agent
}
```

**Code Example:**
```javascript
const { spawnAgent } = require('./src/agents');

// Spawn a DCA trading bot
const result = await spawnAgent(
  '123456789',
  'trader',
  'MyDCABot',
  {
    intervalMinutes: 5,
    buyAmountSol: 0.01,
    targetToken: 'USDC',
    enabled: true
  },
  userWallet,
  walletId,
  privyClient,
  SOLANA_CONNECTION,
  bot,
  db
);

if (result.success) {
  console.log(`Agent spawned: ${result.agentId}`);
}
```

**What It Does:**
- Executes swap every N minutes via cron job
- Buys specified amount of target token
- Sends Telegram notification on each trade
- Tracks performance stats (trades executed, total spent/received)
- Auto-stops after 3 consecutive failures


### Analyst Agent (Price Monitor)

**Configuration:**
```javascript
{
  watchToken: "SOL",              // Token to monitor
  alertThresholdPercent: 5,       // Alert on 5% price change
  checkIntervalMinutes: 2         // Check price every 2 minutes
}
```

**Code Example:**
```javascript
const result = await spawnAgent(
  '123456789',
  'analyst',
  'PriceWatcher',
  {
    watchToken: 'SOL',
    alertThresholdPercent: 5,
    checkIntervalMinutes: 2
  },
  userWallet,
  walletId,
  privyClient,
  SOLANA_CONNECTION,
  bot,
  db
);
```

**What It Does:**
- Fetches token price every N minutes
- Compares to last price
- Sends alert if change exceeds threshold
- Tracks price history in agent state

### Sniper Agent (Token Launch Monitor)

**Configuration:**
```javascript
{
  maxBuyAmountSol: 0.05,          // Max SOL to spend on new token
  minLiquidityUsd: 1000,          // Minimum liquidity required
  enabled: true
}
```

**Note:** Currently a placeholder for devnet. Production implementation would monitor Raydium pool initializations via Helius webhooks.

### Liquidity Agent (Balance Monitor)

**Configuration:**
```javascript
{
  minSolBalance: 0.1,             // Alert when SOL < 0.1
  alertOnly: true                 // Only send alerts (no auto-topup)
}
```

**Code Example:**
```javascript
const result = await spawnAgent(
  '123456789',
  'liquidity',
  'BalanceMonitor',
  {
    minSolBalance: 0.1,
    alertOnly: true
  },
  userWallet,
  walletId,
  privyClient,
  SOLANA_CONNECTION,
  bot,
  db
);
```

**What It Does:**
- Checks wallet balance every 5 minutes
- Sends alert when SOL balance drops below threshold
- Helps prevent failed transactions due to insufficient balance


### Managing Agents

**Stop an Agent:**
```javascript
const { stopAgent } = require('./src/agents');

const result = await stopAgent('123456789', 'MyDCABot', db);
console.log(result.message);
```

**List All Agents:**
```javascript
const { listAgents } = require('./src/agents');

const agents = listAgents('123456789', db);
agents.forEach(agent => {
  console.log(`${agent.name} (${agent.type}): ${agent.isRunning ? 'Running' : 'Stopped'}`);
  if (agent.stats) {
    console.log(`  Trades: ${agent.stats.tradesExecuted}`);
    console.log(`  Alerts: ${agent.stats.alertsSent}`);
  }
});
```

**Get Agent Stats:**
```javascript
const { getAgentStats } = require('./src/agents');

const stats = getAgentStats('123456789', 'MyDCABot');
if (stats) {
  console.log(`Trades executed: ${stats.tradesExecuted}`);
  console.log(`Total spent: ${stats.totalSpent} SOL`);
  console.log(`Total received: ${stats.totalReceived} tokens`);
  console.log(`Estimated P&L: ${stats.estimatedPnL}`);
  console.log(`Errors: ${stats.errors}`);
}
```

### Agent Safety Features

- **DEVNET ONLY**: Agents are restricted to devnet for safety
- **Failure Tracking**: Auto-stops after 3 consecutive failures
- **Error Notifications**: Sends Telegram alerts on errors
- **Performance Tracking**: Monitors trades, alerts, P&L, errors
- **Cron-based Scheduling**: Reliable execution with node-cron
- **Database Persistence**: Agent configs saved to SQLite


## Security Model

### Privy Trusted Execution Environment (TEE)

Agent 47 uses Privy's server-managed wallets with keys stored in a Trusted Execution Environment (TEE).

**Key Security Features:**

1. **No Private Key Exposure**
   - Private keys never leave Privy's TEE
   - Keys are generated and stored in secure hardware
   - Application never has access to raw private keys

2. **Server-Managed Wallets**
   - Wallets are created via Privy API
   - Signing happens server-side in TEE
   - User only receives public wallet address

3. **Transaction Signing Flow**
   ```
   Application → Serialized Transaction → Privy TEE → Signed Transaction → Solana Network
   ```

4. **Authentication**
   - Privy App ID and App Secret required
   - Secrets stored in environment variables
   - Never committed to version control

### Database Security

**SQLite Database (`data/agent_wallet.db`):**
- Stores user metadata, not private keys
- Contains: wallet addresses, Privy IDs, configurations
- Should be backed up regularly
- Access controlled via file system permissions

**Stored Data:**
- User profiles (telegram_id, username, wallet_address, privy_user_id)
- Copy trade configurations
- Agent bot configurations
- Transaction logs
- Bank account details (for offramp)

**NOT Stored:**
- Private keys (stored in Privy TEE)
- Seed phrases
- Sensitive authentication tokens


### Network Security

**RPC Connection:**
- Uses Helius RPC for reliable Solana access
- Supports custom RPC endpoints via environment variable
- Connection pooling for efficiency
- Automatic retry logic on failures

**Transaction Safety:**
- Confirmation required before execution
- Slippage protection on swaps (default 0.5%)
- Balance checks before transactions
- Transaction logging for audit trail

### Environment Variables Security

**Required Variables:**
```bash
TELEGRAM_BOT_TOKEN=your_bot_token
PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_app_secret
HELIUS_RPC_URL=your_helius_rpc_url
NETWORK=devnet  # or mainnet
```

**Security Best Practices:**
- Never commit `.env` file to version control
- Use `.env.example` for templates
- Rotate secrets regularly
- Use different credentials for dev/prod
- Restrict Privy app permissions to minimum required

### Rate Limiting and Safety Rules

**Copy Trading:**
- DEVNET ONLY (enforced in code)
- Maximum SOL per trade configurable
- Automatic scaling (10% of whale's trade)
- One active copy trade per user

**Autonomous Agents:**
- DEVNET ONLY (enforced in code)
- Minimum interval: 30 seconds (sniper agent)
- Auto-stop after 3 consecutive failures
- Maximum concurrent agents: unlimited (but monitored)

**Swap Operations:**
- Default slippage: 0.5% (50 bps)
- Configurable slippage tolerance
- Balance validation before swap
- Transaction confirmation required

**Offramp Operations:**
- Requires bank account setup
- Amount validation
- Exchange rate estimation
- Transaction confirmation required


## Integration Guide for AI Agents

### Quick Start

**1. Install Dependencies:**
```bash
npm install
```

**2. Configure Environment:**
```bash
cp .env.example .env
# Edit .env with your credentials
```

**3. Initialize Database:**
```javascript
const db = require('./src/db');
db.initDB();  // Creates tables automatically
```

**4. Create a Wallet:**
```javascript
const { createSolanaWallet } = require('./src/wallet');

const wallet = await createSolanaWallet('user_123');
console.log('Wallet created:', wallet.walletAddress);
```

**5. Execute a Swap:**
```javascript
const { executeSwap } = require('./src/swap');
const { PrivyClient } = require('@privy-io/node');
const { SOLANA_CONNECTION } = require('./src/wallet');

const privyClient = new PrivyClient({
  appId: process.env.PRIVY_APP_ID,
  appSecret: process.env.PRIVY_APP_SECRET
});

const result = await executeSwap(
  wallet.walletAddress,
  wallet.walletId,
  'SOL',
  'USDC',
  0.1,
  privyClient,
  SOLANA_CONNECTION
);

console.log('Swap result:', result);
```

### Common Integration Patterns

**Pattern 1: User Onboarding**
```javascript
// 1. Create wallet
const wallet = await createSolanaWallet(userId);

// 2. Save to database
db.createUser(userId, username, wallet.privyUserId, wallet.walletAddress, wallet.walletId);

// 3. Check balance
const balance = await getWalletBalance(wallet.walletAddress);

// 4. Request airdrop (devnet only)
if (process.env.NETWORK === 'devnet') {
  const { PublicKey } = require('@solana/web3.js');
  const signature = await SOLANA_CONNECTION.requestAirdrop(
    new PublicKey(wallet.walletAddress),
    1000000000  // 1 SOL
  );
  await SOLANA_CONNECTION.confirmTransaction(signature);
}
```


**Pattern 2: Automated Trading Bot**
```javascript
const { spawnAgent } = require('./src/agents');

// Get user from database
const user = db.getUserByTelegramId(userId);

// Spawn DCA bot
const result = await spawnAgent(
  userId,
  'trader',
  'AutoDCA',
  {
    intervalMinutes: 60,      // Trade every hour
    buyAmountSol: 0.05,       // Buy 0.05 SOL worth
    targetToken: 'USDC',
    enabled: true
  },
  user.wallet_address,
  user.wallet_id,
  privyClient,
  SOLANA_CONNECTION,
  bot,
  db
);

// Monitor agent performance
setInterval(() => {
  const stats = getAgentStats(userId, 'AutoDCA');
  console.log('Agent stats:', stats);
}, 300000);  // Check every 5 minutes
```

**Pattern 3: Copy Trading Setup**
```javascript
const { startCopyTrading, analyzeWallet } = require('./src/copytrader');

// First, analyze the whale wallet
const analysis = await analyzeWallet(whaleAddress, SOLANA_CONNECTION);
console.log(`Whale has ${analysis.recentSwaps} recent swaps`);

// If looks good, start copying
if (analysis.recentSwaps > 5) {
  const result = await startCopyTrading(
    userId,
    whaleAddress,
    0.1,  // Max 0.1 SOL per trade
    user.wallet_address,
    user.wallet_id,
    privyClient,
    SOLANA_CONNECTION,
    bot,
    db
  );
  
  console.log('Copy trading:', result.message);
}
```

**Pattern 4: Offramp Flow**
```javascript
const { saveBankAccount, initiateOfframp } = require('./src/offramp');

// 1. Save bank account
await saveBankAccount(userId, 'GTBank', '0123456789', 'John Doe', db);

// 2. Get bank account
const bankAccount = getBankAccount(userId, db);

// 3. Initiate offramp
const result = await initiateOfframp(
  userId,
  'USDC',
  100,  // 100 USDC
  bankAccount,
  user.wallet_address,
  user.wallet_id,
  privyClient,
  SOLANA_CONNECTION,
  db
);

console.log(`Offramp: ${result.message}`);
console.log(`Estimated: ₦${result.estimatedNaira}`);
```


### Error Handling

**All functions return structured results:**
```javascript
{
  success: boolean,
  message?: string,
  error?: string,
  // ... additional fields
}
```

**Example Error Handling:**
```javascript
try {
  const result = await executeSwap(...);
  
  if (!result.success) {
    console.error('Swap failed:', result.error);
    // Handle failure (notify user, retry, etc.)
    return;
  }
  
  // Success - process result
  console.log('Swap successful:', result.signature);
  
} catch (error) {
  console.error('Unexpected error:', error.message);
  // Handle exception
}
```

### Transaction Logging

**All transactions are automatically logged:**
```javascript
// Logged by executeSwap, initiateOfframp, etc.
db.logTransaction(
  telegramId,
  'swap',           // type
  0.1,              // amount
  'SOL',            // token_in
  'USDC',           // token_out
  signature,        // tx_signature
  'success'         // status
);

// Query transaction history
const stmt = db.prepare(`
  SELECT * FROM transactions 
  WHERE telegram_id = ? 
  ORDER BY created_at DESC 
  LIMIT 10
`);
const history = stmt.all(userId);
```

### Testing

**Run Test Suite:**
```bash
npm test
```

**Test Coverage:**
- Database operations (37 tests)
- Wallet creation and balance queries
- Swap execution
- Offramp flow
- Copy trading setup
- Agent spawning and management


## API Reference

### Database Module (`src/db.js`)

**User Management:**
```javascript
getUserByTelegramId(telegramId: string): object | null
createUser(telegramId, username, privyUserId, walletAddress, walletId): object
updateUserWallet(telegramId, walletAddress, walletId, privyUserId): void
```

**Copy Trading:**
```javascript
getCopyTrades(telegramId: string): Array
addCopyTrade(telegramId, targetWallet, maxSolPerTrade): void
removeCopyTrade(telegramId, targetWallet): void
```

**Agent Bots:**
```javascript
getAgentBots(telegramId: string): Array
addAgentBot(telegramId, agentType, agentName, config): void
updateAgentStatus(botId, isRunning): void
```

**Transactions:**
```javascript
logTransaction(telegramId, type, amount, tokenIn, tokenOut, txSignature, status): void
```

**Bank Accounts:**
```javascript
saveBankAccount(telegramId, bankName, accountNumber, accountName): void
getBankAccount(telegramId: string): object | null
```

### Wallet Module (`src/wallet.js`)

```javascript
createSolanaWallet(telegramId: string): Promise<{
  walletId: string,
  walletAddress: string,
  privyUserId: string
}>

getWalletBalance(walletAddress: string, connection?: Connection): Promise<{
  sol: number,
  usdc: number
}>

signAndSendTransaction(walletId: string, transaction: Transaction, connection?: Connection): Promise<string>

exportWalletInfo(walletId: string): Promise<{ address: string }>

// Exported constant
SOLANA_CONNECTION: Connection
```


### Swap Module (`src/swap.js`)

```javascript
getSwapQuote(inputMint: string, outputMint: string, amountLamports: number, slippageBps?: number): Promise<object | null>

executeSwap(
  walletAddress: string,
  walletId: string,
  inputToken: string,
  outputToken: string,
  amount: number,
  privyClient: PrivyClient,
  connection: Connection
): Promise<{
  success: boolean,
  signature: string | null,
  inputAmount: number,
  outputAmount: number,
  error: string | null
}>

getTokenPrice(tokenMint: string): Promise<number>

formatSwapResult(result: object, inputToken: string, outputToken: string): string

getTokenMint(tokenSymbol: string): string | null

getTokenDecimals(tokenSymbol: string): number

// Exported constants
SOL_MINT: string
USDC_MINT: string
TOKEN_MINTS: { SOL: string, USDC: string }
TOKEN_DECIMALS: { SOL: number, USDC: number }
```

### Offramp Module (`src/offramp.js`)

```javascript
initiateOfframp(
  telegramId: string,
  token: string,
  amount: number,
  bankAccount: { bankName: string, accountNumber: string, accountName: string },
  walletAddress: string,
  walletId: string,
  privyClient: PrivyClient,
  connection: Connection,
  db: Database
): Promise<{
  success: boolean,
  signature: string | null,
  amountSent: number,
  estimatedNaira: number,
  message: string
}>

estimateNaira(usdcAmount: number): Promise<number>

saveBankAccount(telegramId: string, bankName: string, accountNumber: string, accountName: string, db: Database): Promise<object>

getBankAccount(telegramId: string, db: Database): object | null

formatOfframpResult(result: object): string

// Exported constants
PAJ_USDC_POOL_ADDRESS: string
PAJ_SOL_POOL_ADDRESS: string
USDC_MINT: string
```


### Copy Trading Module (`src/copytrader.js`)

```javascript
startCopyTrading(
  telegramId: string,
  targetWalletAddress: string,
  maxSolPerTrade: number,
  userWalletAddress: string,
  userWalletId: string,
  privyClient: PrivyClient,
  connection: Connection,
  bot: TelegramBot,
  db: Database
): Promise<{ success: boolean, message: string }>

stopCopyTrading(
  telegramId: string,
  targetWalletAddress: string,
  connection: Connection,
  db: Database
): Promise<{ success: boolean, message: string }>

getCopyTradeStatus(telegramId: string, db: Database): Array<{
  targetWallet: string,
  maxSolPerTrade: number,
  isActive: boolean,
  createdAt: string
}>

analyzeWallet(walletAddress: string, connection: Connection): Promise<{
  recentSwaps: number,
  tokensTraded: string[],
  estimatedPnl: string,
  totalTransactions: number
}>

formatCopyTradeAlert(traderWallet: string, action: string, token: string, amount: number, myTxSig: string): string

getActiveSubscriptions(): Array
```

### Agent Module (`src/agents.js`)

```javascript
spawnAgent(
  telegramId: string,
  agentType: string,
  agentName: string,
  config: object,
  userWallet: string,
  walletId: string,
  privyClient: PrivyClient,
  connection: Connection,
  bot: TelegramBot,
  db: Database
): Promise<{ success: boolean, agentId: string | null, message: string }>

stopAgent(telegramId: string, agentName: string, db: Database): Promise<{ success: boolean, message: string }>

listAgents(telegramId: string, db: Database): Array<{
  name: string,
  type: string,
  config: object,
  isRunning: boolean,
  stats: object | null,
  createdAt: string
}>

getAgentStats(telegramId: string, agentName: string): object | null

getActiveAgents(): Array
```


## Supported Networks and Tokens

### Networks

**Devnet:**
- RPC: `https://api.devnet.solana.com` (public) or Helius devnet
- Used for: Testing, copy trading, autonomous agents
- Airdrop available: 1 SOL per request
- Explorer: https://solscan.io/?cluster=devnet

**Mainnet:**
- RPC: Helius mainnet (recommended) or public endpoints
- Used for: Production swaps, offramp
- Real funds at risk
- Explorer: https://solscan.io/

### Supported Tokens

**SOL (Native Token):**
- Mint: `So11111111111111111111111111111111111111112`
- Decimals: 9
- Used for: Gas fees, swaps, offramp

**USDC (Stablecoin):**
- Mainnet Mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- Devnet Mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- Decimals: 6
- Used for: Swaps, offramp, stable value storage

### Network Selection

Set via environment variable:
```bash
NETWORK=devnet  # or mainnet
```

**Automatic Network Detection:**
- USDC mint automatically selected based on NETWORK
- Copy trading and agents restricted to devnet
- Airdrop only available on devnet


## Advanced Topics

### Custom RPC Endpoints

**Using Helius (Recommended):**
```bash
HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY
```

**Benefits:**
- Higher rate limits
- Better reliability
- Enhanced APIs (webhooks, DAS API)
- Transaction history

**Using Public RPC:**
```bash
HELIUS_RPC_URL=https://api.devnet.solana.com
```

**Note:** Public RPCs have lower rate limits and may be less reliable.

### Transaction Monitoring

**Real-time Log Monitoring:**
```javascript
const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection(rpcUrl, 'confirmed');
const walletPubkey = new PublicKey(walletAddress);

// Subscribe to logs
const subscriptionId = connection.onLogs(
  walletPubkey,
  (logs, context) => {
    console.log('New transaction:', logs.signature);
    // Process transaction
  },
  'confirmed'
);

// Unsubscribe when done
await connection.removeOnLogsListener(subscriptionId);
```

### Custom Token Support

To add support for additional tokens:

1. **Add token mint to TOKEN_MINTS:**
```javascript
// In src/swap.js
const TOKEN_MINTS = {
  'SOL': SOL_MINT,
  'USDC': USDC_MINT,
  'BONK': 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'  // Add new token
};
```

2. **Add token decimals:**
```javascript
const TOKEN_DECIMALS = {
  'SOL': 9,
  'USDC': 6,
  'BONK': 5  // Add decimals
};
```

3. **Update balance query (if needed):**
```javascript
// In getWalletBalance function
// Add logic to query new token balance
```


### Performance Optimization

**Database Indexing:**
```javascript
// Add indexes for faster queries
db.exec(`CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_transactions_telegram_id ON transactions(telegram_id)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_copy_trades_telegram_id ON copy_trades(telegram_id)`);
```

**Connection Pooling:**
```javascript
// Reuse Solana connection across operations
const { SOLANA_CONNECTION } = require('./src/wallet');

// Don't create new connections for each operation
// ❌ Bad: const connection = new Connection(rpcUrl);
// ✅ Good: Use SOLANA_CONNECTION
```

**Caching:**
```javascript
// Cache token prices for 1 minute
const priceCache = new Map();
const CACHE_TTL = 60000; // 1 minute

async function getCachedPrice(tokenMint) {
  const cached = priceCache.get(tokenMint);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.price;
  }
  
  const price = await getTokenPrice(tokenMint);
  priceCache.set(tokenMint, { price, timestamp: Date.now() });
  return price;
}
```

### Monitoring and Logging

**Transaction Logging:**
```javascript
// All transactions are automatically logged
// Query recent transactions:
const recentTxs = db.prepare(`
  SELECT * FROM transactions 
  WHERE telegram_id = ? 
  ORDER BY created_at DESC 
  LIMIT 20
`).all(userId);

recentTxs.forEach(tx => {
  console.log(`${tx.type}: ${tx.amount} ${tx.token_in} -> ${tx.token_out}`);
  console.log(`Status: ${tx.status}, TX: ${tx.tx_signature}`);
});
```

**Agent Performance Monitoring:**
```javascript
const { getActiveAgents } = require('./src/agents');

// Monitor all active agents
setInterval(() => {
  const agents = getActiveAgents();
  agents.forEach(agent => {
    console.log(`Agent ${agent.name}:`);
    console.log(`  Trades: ${agent.stats.tradesExecuted}`);
    console.log(`  Errors: ${agent.stats.errors}`);
    console.log(`  Last activity: ${agent.stats.lastActivity}`);
  });
}, 60000); // Check every minute
```


## Troubleshooting

### Common Issues

**Issue: "Failed to create Solana wallet"**
- Check Privy credentials in .env
- Verify Privy app is active
- Check network connectivity

**Issue: "Failed to get swap quote"**
- Verify Jupiter API is accessible
- Check token mints are correct
- Ensure amount is not too small (min ~$0.01)

**Issue: "Transaction failed"**
- Check wallet has sufficient balance
- Verify network is not congested
- Check slippage tolerance
- Ensure RPC endpoint is responsive

**Issue: "Copy trading not working"**
- Verify NETWORK=devnet
- Check target wallet address is valid
- Ensure WebSocket connection is stable
- Verify user has sufficient balance

**Issue: "Agent stopped unexpectedly"**
- Check agent logs for errors
- Verify wallet has sufficient balance
- Check RPC endpoint is responsive
- Review agent configuration

### Debug Mode

**Enable Verbose Logging:**
```javascript
// Add to top of bot.js
process.env.DEBUG = 'true';

// Log all operations
console.log('Operation:', operation);
console.log('Parameters:', params);
console.log('Result:', result);
```

**Check Database State:**
```javascript
const db = require('./src/db');

// Check user
const user = db.getUserByTelegramId(userId);
console.log('User:', user);

// Check agents
const agents = db.getAgentBots(userId);
console.log('Agents:', agents);

// Check transactions
const txs = db.prepare('SELECT * FROM transactions WHERE telegram_id = ?').all(userId);
console.log('Transactions:', txs);
```


## Production Deployment

### Pre-Deployment Checklist

- [ ] Set NETWORK=mainnet in .env
- [ ] Configure production Privy credentials
- [ ] Set up Helius mainnet RPC endpoint
- [ ] Configure PAJ Cash pool addresses (get from https://paj.cash)
- [ ] Test all operations on devnet first
- [ ] Set up database backups
- [ ] Configure monitoring and alerts
- [ ] Review security settings
- [ ] Test error handling
- [ ] Document recovery procedures

### Environment Configuration

**Production .env:**
```bash
TELEGRAM_BOT_TOKEN=your_production_bot_token
PRIVY_APP_ID=your_production_privy_app_id
PRIVY_APP_SECRET=your_production_privy_app_secret
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_API_KEY
NETWORK=mainnet
```

### Database Backup

**Backup Script:**
```bash
#!/bin/bash
# backup-db.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
DB_FILE="./data/agent_wallet.db"

mkdir -p $BACKUP_DIR
cp $DB_FILE "$BACKUP_DIR/agent_wallet_$DATE.db"

# Keep only last 7 days of backups
find $BACKUP_DIR -name "agent_wallet_*.db" -mtime +7 -delete

echo "Database backed up to $BACKUP_DIR/agent_wallet_$DATE.db"
```

**Cron Job:**
```bash
# Run backup daily at 2 AM
0 2 * * * /path/to/backup-db.sh
```

### Monitoring

**Health Check Endpoint:**
```javascript
// Add to bot.js
const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: db ? 'connected' : 'disconnected',
    network: process.env.NETWORK,
    activeAgents: getActiveAgents().length
  };
  res.json(health);
});

app.listen(3000, () => {
  console.log('Health check endpoint: http://localhost:3000/health');
});
```


## Limitations and Future Enhancements

### Current Limitations

**Token Support:**
- Only SOL and USDC currently supported
- Adding new tokens requires code changes
- No automatic token discovery

**Copy Trading:**
- Limited to devnet for safety
- One active copy trade per user
- Only detects Jupiter swaps
- No stop-loss or take-profit

**Autonomous Agents:**
- Limited to devnet for safety
- Sniper agent is placeholder (not fully implemented)
- No advanced trading strategies
- No backtesting capabilities

**Offramp:**
- Only supports Nigerian Naira
- Requires manual PAJ Cash pool address configuration
- No automatic exchange rate updates
- No transaction status tracking from PAJ Cash

### Planned Enhancements

**Short Term:**
- Support for additional tokens (BONK, JUP, etc.)
- Enhanced transaction history with filtering
- Agent performance analytics dashboard
- Webhook support for real-time notifications
- Multi-language support

**Medium Term:**
- Copy trading on mainnet with risk controls
- Advanced agent strategies (grid trading, arbitrage)
- Portfolio tracking and analytics
- Multi-chain support (Ethereum, Polygon)
- Mobile app integration

**Long Term:**
- AI-powered trading strategies
- Social trading features
- Liquidity provision automation
- NFT trading support
- Cross-chain swaps


## Contributing

### Development Setup

1. **Clone Repository:**
```bash
git clone <repository-url>
cd agent-47
```

2. **Install Dependencies:**
```bash
npm install
```

3. **Configure Environment:**
```bash
cp .env.example .env
# Edit .env with your credentials
```

4. **Run Tests:**
```bash
npm test
```

5. **Start Development Bot:**
```bash
npm run dev
```

### Code Style

- Use CommonJS modules (require/module.exports)
- Follow existing naming conventions
- Add JSDoc comments for all functions
- Include error handling with try-catch
- Log important operations to console
- Write tests for new features

### Testing Guidelines

**Unit Tests:**
```javascript
// src/__tests__/myfeature.test.js
const { myFunction } = require('../myfeature');

describe('myFunction', () => {
  test('should do something', () => {
    const result = myFunction(input);
    expect(result).toBe(expected);
  });
});
```

**Integration Tests:**
```javascript
// src/__tests__/myfeature.integration.test.js
const db = require('../db');
const { setupTestDB, cleanupTestDB } = require('../testHelpers/dbTestHelper');

beforeEach(() => setupTestDB());
afterEach(() => cleanupTestDB());

test('should integrate with database', () => {
  // Test with real database
});
```


## Resources

### Official Documentation

- **Solana**: https://docs.solana.com/
- **Privy**: https://docs.privy.io/
- **Jupiter**: https://station.jup.ag/docs
- **PAJ Cash**: https://paj.cash
- **Telegraf**: https://telegraf.js.org/

### API References

- **Jupiter v6 API**: https://station.jup.ag/docs/apis/swap-api
- **Helius RPC**: https://docs.helius.dev/
- **Solana Web3.js**: https://solana-labs.github.io/solana-web3.js/

### Community

- **SuperteamNG Discord**: For PAJ Cash support
- **Solana Discord**: For general Solana questions
- **Jupiter Discord**: For swap-related questions

### Tools

- **Solscan**: https://solscan.io/ (Block explorer)
- **Solana Beach**: https://solanabeach.io/ (Network stats)
- **Jupiter Terminal**: https://jup.ag/ (Test swaps)

## License

ISC

## Support

For issues and questions:
1. Check this documentation first
2. Review error logs
3. Test on devnet before mainnet
4. Contact support via Telegram bot

---

**Built for the Solana AI Agent Bounty**

This system demonstrates enterprise-grade wallet management, autonomous trading, and DeFi integration on Solana. All operations are secured through Privy's Trusted Execution Environment, ensuring private keys never leave secure hardware.

**Key Innovations:**
- Server-managed wallets with TEE security
- Real-time copy trading via WebSocket monitoring
- Autonomous agent system with cron scheduling
- Direct fiat offramp to Nigerian bank accounts
- Comprehensive transaction logging and history

**For AI Agents:**
This documentation provides everything needed to integrate with Agent 47. All functions are well-documented with signatures, examples, and error handling patterns. The modular architecture allows easy extension and customization.
