require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const { PrivyClient } = require("@privy-io/node");

// Import all modules
const db = require("./db");
const {
  createSolanaWallet,
  getWalletBalance,
  transferSOL,
  transferUSDC,
  SOLANA_CONNECTION,
} = require("./wallet");
const { executeSwap, formatSwapResult } = require("./swap");
const {
  initiateOfframp,
  estimateNaira,
  saveBankAccount,
  getBankAccount,
  formatOfframpResult,
} = require("./offramp");
const {
  startCopyTrading,
  stopCopyTrading,
  getCopyTradeStatus,
  analyzeWallet,
} = require("./copytrader");
const {
  spawnAgent,
  stopAgent,
  listAgents,
  getAgentStats,
} = require("./agents");

// Environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const NETWORK = process.env.NETWORK || "devnet";
const DASHBOARD_URL = (process.env.DASHBOARD_URL || 'http://localhost:4747').replace(/\/$/, '');

console.log("=== Initializing Telegram Bot ===");
console.log(`Network: ${NETWORK}`);

// Initialize Privy Client
const privyClient = new PrivyClient({
  appId: PRIVY_APP_ID,
  appSecret: PRIVY_APP_SECRET,
});

// Initialize Telegraf bot
const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Initialize database
db.initDB();
console.log("Database initialized");

// ===== COMMAND HANDLERS =====

// /start command
bot.command("start", async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();
    const username = ctx.from.username || ctx.from.first_name;

    console.log(`/start command from ${username} (${telegramId})`);

    const welcomeMessage =
      `🤖 Welcome to Agent 47 - Solana Trading Bot!\n\n` +
      `I'm your autonomous trading assistant on Solana ${NETWORK}.\n\n` +
      `Available commands:\n` +
      `/createwallet - Create a new Solana wallet\n` +
      `/wallet - View your wallet balance\n` +
      `/airdrop - Request devnet SOL (devnet only)\n` +
      `/send - Send SOL or USDC to another wallet\n` +
      `/swap - Swap tokens (SOL ↔ USDC)\n` +
      `/offramp - Convert crypto to Naira\n` +
      `/setbank - Set your bank account\n` +
      `/copytrade - Copy whale wallet trades\n` +
      `/stopcopy - Stop copy trading\n` +
      `/mycopies - View active copy trades\n` +
      `/spawnbot - Create an AI agent bot\n` +
      `/mybots - View your agent bots\n` +
      `/stopbot - Stop an agent bot\n` +
      `/dashboard - Open your personal dashboard\n` +
      `/history - View transaction history\n` +
      `/help - Show this help message\n\n` +
      `Let's get started! Use /createwallet to begin.`;

    await ctx.reply(welcomeMessage);
  } catch (error) {
    console.error("Error in /start:", error);
    await ctx.reply("❌ An error occurred. Please try again.");
  }
});

// /help command
bot.command("help", async (ctx) => {
  try {
    await ctx.reply(
      `📚 Agent 47 Help\n\n` +
        `Wallet Commands:\n` +
        `/createwallet - Create new wallet\n` +
        `/wallet - Check balance\n` +
        `/airdrop - Get test SOL (devnet)\n` +
        `/send - Send SOL or USDC\n\n` +
        `Trading Commands:\n` +
        `/swap - Swap tokens\n` +
        `/offramp - Cash out to Naira\n` +
        `/setbank - Set bank details\n\n` +
        `Copy Trading:\n` +
        `/copytrade - Follow whale wallets\n` +
        `/stopcopy - Stop following\n` +
        `/mycopies - View active copies\n\n` +
        `AI Agents:\n` +
        `/spawnbot - Create autonomous bot\n` +
        `/mybots - View your bots\n` +
        `/stopbot - Stop a bot\n\n` +
        `/dashboard - Open your personal dashboard\n` +
        `/history - Transaction history`,
    );
  } catch (error) {
    console.error("Error in /help:", error);
    await ctx.reply("❌ An error occurred. Please try again.");
  }
});

// /createwallet command
bot.command("createwallet", async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();
    const username = ctx.from.username || ctx.from.first_name;

    console.log(`/createwallet command from ${username} (${telegramId})`);

    // Check if user already has a wallet
    const existingUser = db.getUserByTelegramId(telegramId);
    if (existingUser && existingUser.wallet_address) {
      await ctx.reply(
        `You already have a wallet!\n\n` +
          `Address: ${existingUser.wallet_address}\n\n` +
          `Use /wallet to check your balance.`,
      );
      return;
    }

    await ctx.reply("🔄 Creating your Solana wallet...");

    // Create wallet
    const walletInfo = await createSolanaWallet(telegramId);

    // Save to database
    if (existingUser) {
      db.updateUserWallet(
        telegramId,
        walletInfo.walletAddress,
        walletInfo.walletId,
        walletInfo.privyUserId,
      );
    } else {
      db.createUser(
        telegramId,
        username,
        walletInfo.privyUserId,
        walletInfo.walletAddress,
        walletInfo.walletId,
      );
    }

    await ctx.reply(
      `✅ Wallet created successfully!\n\n` +
        `📍 Address: ${walletInfo.walletAddress}\n\n` +
        `${NETWORK === "devnet" ? "💡 Use /airdrop to get test SOL\n\n" : ""}` +
        `Use /wallet to check your balance.`,
    );
  } catch (error) {
    console.error("Error in /createwallet:", error);
    await ctx.reply(`❌ Failed to create wallet: ${error.message}`);
  }
});

// /wallet command
bot.command("wallet", async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();

    console.log(`/wallet command from ${telegramId}`);

    // Get user from database
    const user = db.getUserByTelegramId(telegramId);
    if (!user || !user.wallet_address) {
      await ctx.reply(
        "❌ You don't have a wallet yet. Use /createwallet to create one.",
      );
      return;
    }

    await ctx.reply("🔄 Fetching balance...");

    // Get balance
    const balance = await getWalletBalance(
      user.wallet_address,
      SOLANA_CONNECTION,
    );

    await ctx.reply(
      `💰 Your Wallet Balance\n\n` +
        `📍 Address: ${user.wallet_address}\n\n` +
        `💎 SOL: ${balance.sol.toFixed(4)}\n` +
        `💵 USDC: ${balance.usdc.toFixed(2)}\n\n` +
        `Network: ${NETWORK}`,
    );
  } catch (error) {
    console.error("Error in /wallet:", error);
    await ctx.reply(`❌ Failed to fetch balance: ${error.message}`);
  }
});

// /airdrop command (devnet only)
bot.command("airdrop", async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();

    console.log(`/airdrop command from ${telegramId}`);

    if (NETWORK !== "devnet") {
      await ctx.reply("❌ Airdrop is only available on devnet.");
      return;
    }

    // Get user from database
    const user = db.getUserByTelegramId(telegramId);
    if (!user || !user.wallet_address) {
      await ctx.reply(
        "❌ You don't have a wallet yet. Use /createwallet to create one.",
      );
      return;
    }

    await ctx.reply("🔄 Requesting airdrop...");

    // Request airdrop
    const { PublicKey } = require("@solana/web3.js");
    const publicKey = new PublicKey(user.wallet_address);
    const signature = await SOLANA_CONNECTION.requestAirdrop(
      publicKey,
      1000000000, // 1 SOL
    );

    await SOLANA_CONNECTION.confirmTransaction(signature);

    await ctx.reply(
      `✅ Airdrop successful!\n\n` +
        `💎 Received: 1 SOL\n` +
        `🔗 TX: ${signature}\n\n` +
        `Use /wallet to check your balance.`,
    );
  } catch (error) {
    console.error("Error in /airdrop:", error);
    await ctx.reply(`❌ Airdrop failed: ${error.message}`);
  }
});

// /send command
bot.command("send", async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();

    console.log(`/send command from ${telegramId}`);

    // Get user from database
    const user = db.getUserByTelegramId(telegramId);
    if (!user || !user.wallet_address) {
      await ctx.reply(
        "❌ You don't have a wallet yet. Use /createwallet to create one.",
      );
      return;
    }

    await ctx.reply(
      `💸 Send Tokens\n\n` +
        `Please send your transfer in this format:\n` +
        `<amount> <token> to <address>\n\n` +
        `Examples:\n` +
        `• 0.5 SOL to 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU\n` +
        `• 10 USDC to 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU\n\n` +
        `Supported tokens: SOL, USDC`,
    );
  } catch (error) {
    console.error("Error in /send:", error);
    await ctx.reply(`❌ Error: ${error.message}`);
  }
});

// /swap command
bot.command("swap", async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();

    console.log(`/swap command from ${telegramId}`);

    // Get user from database
    const user = db.getUserByTelegramId(telegramId);
    if (!user || !user.wallet_address) {
      await ctx.reply(
        "❌ You don't have a wallet yet. Use /createwallet to create one.",
      );
      return;
    }

    await ctx.reply(
      `💱 Token Swap\n\n` +
        `Please send your swap in this format:\n` +
        `<amount> <from> to <to>\n\n` +
        `Examples:\n` +
        `• 0.1 SOL to USDC\n` +
        `• 50 USDC to SOL\n\n` +
        `Supported tokens: SOL, USDC`,
    );
  } catch (error) {
    console.error("Error in /swap:", error);
    await ctx.reply(`❌ An error occurred: ${error.message}`);
  }
});

// /offramp command
bot.command("offramp", async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();

    console.log(`/offramp command from ${telegramId}`);

    // Get user from database
    const user = db.getUserByTelegramId(telegramId);
    if (!user || !user.wallet_address) {
      await ctx.reply(
        "❌ You don't have a wallet yet. Use /createwallet to create one.",
      );
      return;
    }

    // Check if bank account is set
    const bankAccount = getBankAccount(telegramId, db);
    if (!bankAccount) {
      await ctx.reply(
        `❌ No bank account found.\n\n` +
          `Please set your bank account first using /setbank`,
      );
      return;
    }

    await ctx.reply(
      `🏦 Offramp to Naira\n\n` +
        `Bank: ${bankAccount.bank_name}\n` +
        `Account: ${bankAccount.account_number}\n\n` +
        `Please send your offramp in this format:\n` +
        `<amount> <token>\n\n` +
        `Examples:\n` +
        `• 50 USDC\n` +
        `• 0.5 SOL\n\n` +
        `Supported tokens: SOL, USDC`,
    );
  } catch (error) {
    console.error("Error in /offramp:", error);
    await ctx.reply(`❌ An error occurred: ${error.message}`);
  }
});

// /setbank command
bot.command("setbank", async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();

    console.log(`/setbank command from ${telegramId}`);

    await ctx.reply(
      `🏦 Set Bank Account\n\n` +
        `Please send your bank details in this format:\n` +
        `<bank_name> | <account_number> | <account_name>\n\n` +
        `Example:\n` +
        `GTBank | 0123456789 | John Doe`,
    );
  } catch (error) {
    console.error("Error in /setbank:", error);
    await ctx.reply(`❌ An error occurred: ${error.message}`);
  }
});

// /copytrade command
bot.command("copytrade", async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();

    console.log(`/copytrade command from ${telegramId}`);

    // Get user from database
    const user = db.getUserByTelegramId(telegramId);
    if (!user || !user.wallet_address) {
      await ctx.reply(
        "❌ You don't have a wallet yet. Use /createwallet to create one.",
      );
      return;
    }

    if (NETWORK !== "devnet") {
      await ctx.reply(
        "❌ Copy trading is only available on devnet for safety.",
      );
      return;
    }

    await ctx.reply(
      `🐋 Copy Trading\n\n` +
        `Please send the wallet address and max SOL per trade:\n` +
        `<wallet_address> <max_sol>\n\n` +
        `Example:\n` +
        `7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 0.1`,
    );
  } catch (error) {
    console.error("Error in /copytrade:", error);
    await ctx.reply(`❌ An error occurred: ${error.message}`);
  }
});

// /stopcopy command
bot.command("stopcopy", async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();

    console.log(`/stopcopy command from ${telegramId}`);

    // Get active copy trades
    const copyTrades = getCopyTradeStatus(telegramId, db);
    const activeTrades = copyTrades.filter((t) => t.isActive);

    if (activeTrades.length === 0) {
      await ctx.reply("❌ You don't have any active copy trades.");
      return;
    }

    await ctx.reply(
      `🛑 Stop Copy Trading\n\n` +
        `Please send the wallet address to stop copying:\n\n` +
        activeTrades.map((t) => `• ${t.targetWallet}`).join("\n"),
    );
  } catch (error) {
    console.error("Error in /stopcopy:", error);
    await ctx.reply(`❌ An error occurred: ${error.message}`);
  }
});

// /mycopies command
bot.command("mycopies", async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();

    console.log(`/mycopies command from ${telegramId}`);

    // Get copy trade status
    const copyTrades = getCopyTradeStatus(telegramId, db);

    if (copyTrades.length === 0) {
      await ctx.reply("❌ You don't have any copy trades.");
      return;
    }

    const message =
      `🐋 Your Copy Trades\n\n` +
      copyTrades
        .map(
          (trade) =>
            `${trade.isActive ? "✅" : "❌"} ${trade.targetWallet.slice(0, 8)}...\n` +
            `   Max: ${trade.maxSolPerTrade} SOL\n` +
            `   Created: ${new Date(trade.createdAt).toLocaleDateString()}`,
        )
        .join("\n\n");

    await ctx.reply(message);
  } catch (error) {
    console.error("Error in /mycopies:", error);
    await ctx.reply(`❌ An error occurred: ${error.message}`);
  }
});

// /spawnbot command
bot.command("spawnbot", async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();

    console.log(`/spawnbot command from ${telegramId}`);

    // Get user from database
    const user = db.getUserByTelegramId(telegramId);
    if (!user || !user.wallet_address) {
      await ctx.reply(
        "❌ You don't have a wallet yet. Use /createwallet to create one.",
      );
      return;
    }

    if (NETWORK !== "devnet") {
      await ctx.reply("❌ AI agents are only available on devnet for safety.");
      return;
    }

    await ctx.reply(
      `🤖 Spawn AI Agent Bot\n\n` +
        `Available agent types:\n` +
        `1. trader - DCA trading bot\n` +
        `2. analyst - Price monitoring\n` +
        `3. sniper - Token launch sniper\n` +
        `4. liquidity - Balance monitor\n\n` +
        `Format:\n` +
        `<type> <name> <config_json>\n\n` +
        `Examples:\n` +
        `trader MyDCA {"intervalMinutes":5,"buyAmountSol":0.01,"targetToken":"USDC","enabled":true}\n\n` +
        `analyst PriceWatch {"watchToken":"SOL","alertThresholdPercent":5,"checkIntervalMinutes":2}`,
    );
  } catch (error) {
    console.error("Error in /spawnbot:", error);
    await ctx.reply(`❌ An error occurred: ${error.message}`);
  }
});

// /mybots command
bot.command("mybots", async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();

    console.log(`/mybots command from ${telegramId}`);

    // Get agents
    const agents = listAgents(telegramId, db);

    if (agents.length === 0) {
      await ctx.reply("❌ You don't have any agent bots.");
      return;
    }

    const message =
      `🤖 Your Agent Bots\n\n` +
      agents
        .map(
          (agent) =>
            `${agent.isRunning ? "✅" : "❌"} ${agent.name} (${agent.type})\n` +
            `   ${agent.stats ? `Trades: ${agent.stats.tradesExecuted}, Alerts: ${agent.stats.alertsSent}` : "Not running"}`,
        )
        .join("\n\n");

    await ctx.reply(message);
  } catch (error) {
    console.error("Error in /mybots:", error);
    await ctx.reply(`❌ An error occurred: ${error.message}`);
  }
});

// /stopbot command
bot.command("stopbot", async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();

    console.log(`/stopbot command from ${telegramId}`);

    // Get agents
    const agents = listAgents(telegramId, db);
    const runningAgents = agents.filter((a) => a.isRunning);

    if (runningAgents.length === 0) {
      await ctx.reply("❌ You don't have any running agent bots.");
      return;
    }

    await ctx.reply(
      `🛑 Stop Agent Bot\n\n` +
        `Please send the agent name to stop:\n\n` +
        runningAgents.map((a) => `• ${a.name}`).join("\n"),
    );
  } catch (error) {
    console.error("Error in /stopbot:", error);
    await ctx.reply(`❌ An error occurred: ${error.message}`);
  }
});

// /history command
bot.command("history", async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();

    console.log(`/history command from ${telegramId}`);

    await ctx.reply("📊 Transaction history feature coming soon!");
  } catch (error) {
    console.error("Error in /history:", error);
    await ctx.reply(`❌ An error occurred: ${error.message}`);
  }
});

// /dashboard command
bot.command("dashboard", async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();

    console.log(`/dashboard command from ${telegramId}`);

    const user = db.getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply(
        "❌ You do not have an account yet. Use /createwallet to get started.",
      );
      return;
    }

    const token = db.getOrCreateDashboardToken(telegramId);
    const url = `${DASHBOARD_URL}/?token=${token}`;

    await ctx.reply(
      `Your personal dashboard is ready.\n\n` +
        `${url}\n\n` +
        `Keep this link private — it gives full access to your activity.`,
    );
  } catch (error) {
    console.error("Error in /dashboard:", error);
    await ctx.reply(`❌ An error occurred: ${error.message}`);
  }
});

// ===== TEXT MESSAGE HANDLERS =====

// Handle text messages for multi-step commands
bot.on("text", async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();
    const text = ctx.message.text;

    // Skip if it's a command
    if (text.startsWith("/")) {
      return;
    }

    console.log(`Text message from ${telegramId}: ${text}`);

    // Get user from database
    const user = db.getUserByTelegramId(telegramId);

    // Parse swap command (e.g., "0.1 SOL to USDC")
    const swapMatch = text.match(
      /^(\d+\.?\d*)\s+(SOL|USDC)\s+to\s+(SOL|USDC)$/i,
    );
    if (swapMatch) {
      if (!user || !user.wallet_address) {
        await ctx.reply(
          "❌ You don't have a wallet yet. Use /createwallet to create one.",
        );
        return;
      }

      const amount = parseFloat(swapMatch[1]);
      const fromToken = swapMatch[2].toUpperCase();
      const toToken = swapMatch[3].toUpperCase();

      if (fromToken === toToken) {
        await ctx.reply("❌ Cannot swap the same token.");
        return;
      }

      // Confirmation
      await ctx.reply(
        `💱 Swap Confirmation\n\n` +
          `From: ${amount} ${fromToken}\n` +
          `To: ${toToken}\n\n` +
          `Confirm?`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "✅ Confirm",
              `swap_confirm_${amount}_${fromToken}_${toToken}`,
            ),
            Markup.button.callback("❌ Cancel", "swap_cancel"),
          ],
        ]),
      );
      return;
    }

    // Parse send command (e.g., "0.5 SOL to 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU")
    const sendMatch = text.match(
      /^(\d+\.?\d*)\s+(SOL|USDC)\s+to\s+([1-9A-HJ-NP-Za-km-z]{32,44})$/i,
    );
    if (sendMatch) {
      if (!user || !user.wallet_address) {
        await ctx.reply(
          "❌ You don't have a wallet yet. Use /createwallet to create one.",
        );
        return;
      }

      const amount = parseFloat(sendMatch[1]);
      const token = sendMatch[2].toUpperCase();
      const recipientAddress = sendMatch[3];

      // Validate amount
      if (amount <= 0) {
        await ctx.reply("❌ Amount must be greater than 0.");
        return;
      }

      // Confirmation
      await ctx.reply(
        `💸 Send Confirmation\n\n` +
          `Amount: ${amount} ${token}\n` +
          `To: ${recipientAddress.substring(0, 8)}...${recipientAddress.substring(recipientAddress.length - 8)}\n\n` +
          `⚠️ Double-check the address! Transactions cannot be reversed.\n\n` +
          `Confirm?`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "✅ Confirm",
              `send_confirm_${amount}_${token}_${recipientAddress}`,
            ),
            Markup.button.callback("❌ Cancel", "send_cancel"),
          ],
        ]),
      );
      return;
    }

    // Parse offramp command (e.g., "50 USDC")
    const offrampMatch = text.match(/^(\d+\.?\d*)\s+(SOL|USDC)$/i);
    if (offrampMatch) {
      if (!user || !user.wallet_address) {
        await ctx.reply(
          "❌ You don't have a wallet yet. Use /createwallet to create one.",
        );
        return;
      }

      const bankAccount = getBankAccount(telegramId, db);
      if (!bankAccount) {
        await ctx.reply("❌ No bank account found. Use /setbank first.");
        return;
      }

      const amount = parseFloat(offrampMatch[1]);
      const token = offrampMatch[2].toUpperCase();

      // Estimate Naira
      const estimatedNaira = await estimateNaira(
        token === "USDC" ? amount : amount * 100,
      );

      // Confirmation
      await ctx.reply(
        `🏦 Offramp Confirmation\n\n` +
          `Amount: ${amount} ${token}\n` +
          `Estimated: ₦${estimatedNaira.toFixed(2)}\n` +
          `Bank: ${bankAccount.bank_name}\n` +
          `Account: ${bankAccount.account_number}\n\n` +
          `Confirm?`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "✅ Confirm",
              `offramp_confirm_${amount}_${token}`,
            ),
            Markup.button.callback("❌ Cancel", "offramp_cancel"),
          ],
        ]),
      );
      return;
    }

    // Parse bank account setup (e.g., "GTBank | 0123456789 | John Doe")
    const bankMatch = text.match(/^(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)$/);
    if (bankMatch) {
      const bankName = bankMatch[1].trim();
      const accountNumber = bankMatch[2].trim();
      const accountName = bankMatch[3].trim();

      await saveBankAccount(
        telegramId,
        bankName,
        accountNumber,
        accountName,
        db,
      );

      await ctx.reply(
        `✅ Bank account saved!\n\n` +
          `Bank: ${bankName}\n` +
          `Account: ${accountNumber}\n` +
          `Name: ${accountName}\n\n` +
          `You can now use /offramp to cash out.`,
      );
      return;
    }

    // Parse copy trade command (e.g., "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU 0.1")
    const copyTradeMatch = text.match(
      /^([1-9A-HJ-NP-Za-km-z]{32,44})\s+(\d+\.?\d*)$/,
    );
    if (copyTradeMatch) {
      if (!user || !user.wallet_address) {
        await ctx.reply(
          "❌ You don't have a wallet yet. Use /createwallet to create one.",
        );
        return;
      }

      const targetWallet = copyTradeMatch[1];
      const maxSol = parseFloat(copyTradeMatch[2]);

      await ctx.reply("🔄 Starting copy trading...");

      const result = await startCopyTrading(
        telegramId,
        targetWallet,
        maxSol,
        user.wallet_address,
        user.wallet_id,
        privyClient,
        SOLANA_CONNECTION,
        bot,
        db,
      );

      await ctx.reply(
        result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
      );
      return;
    }

    // Parse stop copy trade (wallet address)
    const stopCopyMatch = text.match(/^([1-9A-HJ-NP-Za-km-z]{32,44})$/);
    if (stopCopyMatch) {
      const targetWallet = stopCopyMatch[1];

      await ctx.reply("🔄 Stopping copy trading...");

      const result = await stopCopyTrading(
        telegramId,
        targetWallet,
        SOLANA_CONNECTION,
        db,
      );

      await ctx.reply(
        result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
      );
      return;
    }

    // Parse spawn agent command (e.g., "trader MyDCA {...}")
    const spawnMatch = text.match(
      /^(trader|analyst|sniper|liquidity)\s+(\w+)\s+(\{.+\})$/,
    );
    if (spawnMatch) {
      if (!user || !user.wallet_address) {
        await ctx.reply(
          "❌ You don't have a wallet yet. Use /createwallet to create one.",
        );
        return;
      }

      const agentType = spawnMatch[1];
      const agentName = spawnMatch[2];
      let config;

      try {
        config = JSON.parse(spawnMatch[3]);
      } catch (error) {
        await ctx.reply("❌ Invalid JSON configuration.");
        return;
      }

      await ctx.reply("🔄 Spawning agent...");

      const result = await spawnAgent(
        telegramId,
        agentType,
        agentName,
        config,
        user.wallet_address,
        user.wallet_id,
        privyClient,
        SOLANA_CONNECTION,
        bot,
        db,
      );

      if (!result.success) {
        await ctx.reply(`❌ ${result.message}`);
      }
      // Success message is sent by spawnAgent function
      return;
    }

    // Parse stop agent command (agent name)
    const stopAgentMatch = text.match(/^(\w+)$/);
    if (stopAgentMatch) {
      const agentName = stopAgentMatch[1];

      // Check if this is an agent name
      const agents = listAgents(telegramId, db);
      const agent = agents.find((a) => a.name === agentName);

      if (agent) {
        await ctx.reply("🔄 Stopping agent...");

        const result = await stopAgent(telegramId, agentName, db);

        await ctx.reply(
          result.success ? `✅ ${result.message}` : `❌ ${result.message}`,
        );
        return;
      }
    }

    // Default response
    await ctx.reply(
      `I didn't understand that. Use /help to see available commands.`,
    );
  } catch (error) {
    console.error("Error handling text message:", error);
    await ctx.reply(`❌ An error occurred: ${error.message}`);
  }
});

// ===== CALLBACK QUERY HANDLERS (Inline Buttons) =====

// Handle swap confirmation
bot.action(/^swap_confirm_(.+)_(.+)_(.+)$/, async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();
    const amount = parseFloat(ctx.match[1]);
    const fromToken = ctx.match[2];
    const toToken = ctx.match[3];

    console.log(
      `Swap confirmation from ${telegramId}: ${amount} ${fromToken} to ${toToken}`,
    );

    // Get user from database
    const user = db.getUserByTelegramId(telegramId);
    if (!user || !user.wallet_address) {
      await ctx.answerCbQuery("❌ Wallet not found");
      return;
    }

    await ctx.answerCbQuery();
    await ctx.editMessageText("🔄 Executing swap...");

    // Execute swap
    const result = await executeSwap(
      user.wallet_address,
      user.wallet_id,
      fromToken,
      toToken,
      amount,
      privyClient,
      SOLANA_CONNECTION,
    );

    // Log transaction
    db.logTransaction(
      telegramId,
      "swap",
      amount,
      fromToken,
      toToken,
      result.signature,
      result.success ? "success" : "failed",
    );

    // Send result
    const message = formatSwapResult(result, fromToken, toToken);
    await ctx.editMessageText(message);
  } catch (error) {
    console.error("Error in swap confirmation:", error);
    await ctx.editMessageText(`❌ Swap failed: ${error.message}`);
  }
});

// Handle swap cancellation
bot.action("swap_cancel", async (ctx) => {
  await ctx.answerCbQuery("Swap cancelled");
  await ctx.editMessageText("❌ Swap cancelled");
});

// Handle send confirmation
bot.action(/^send_confirm_(.+)_(.+)_(.+)$/, async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();
    const amount = parseFloat(ctx.match[1]);
    const token = ctx.match[2];
    const recipientAddress = ctx.match[3];

    console.log(
      `Send confirmation from ${telegramId}: ${amount} ${token} to ${recipientAddress}`,
    );

    // Get user from database
    const user = db.getUserByTelegramId(telegramId);
    if (!user || !user.wallet_address) {
      await ctx.answerCbQuery("❌ Wallet not found");
      return;
    }

    await ctx.answerCbQuery();
    await ctx.editMessageText("🔄 Sending tokens...");

    // Execute transfer
    let result;
    if (token === "SOL") {
      result = await transferSOL(
        user.wallet_id,
        user.wallet_address,
        recipientAddress,
        amount,
        SOLANA_CONNECTION,
      );
    } else if (token === "USDC") {
      result = await transferUSDC(
        user.wallet_id,
        user.wallet_address,
        recipientAddress,
        amount,
        SOLANA_CONNECTION,
      );
    } else {
      await ctx.editMessageText(`❌ Unsupported token: ${token}`);
      return;
    }

    // Log transaction
    db.logTransaction(
      telegramId,
      "send",
      amount,
      token,
      recipientAddress,
      result.signature,
      result.success ? "success" : "failed",
    );

    // Send result
    if (result.success) {
      await ctx.editMessageText(
        `✅ Transfer Successful!\n\n` +
          `💸 Sent: ${amount} ${token}\n` +
          `📍 To: ${recipientAddress.substring(0, 8)}...${recipientAddress.substring(recipientAddress.length - 8)}\n\n` +
          `🔗 Transaction: ${result.signature}\n` +
          `🔍 View on Solscan: https://solscan.io/tx/${result.signature}${NETWORK === "devnet" ? "?cluster=devnet" : ""}`,
      );
    } else {
      await ctx.editMessageText(
        `❌ Transfer Failed\n\n` +
          `💸 Attempted: ${amount} ${token}\n` +
          `📍 To: ${recipientAddress.substring(0, 8)}...${recipientAddress.substring(recipientAddress.length - 8)}\n\n` +
          `⚠️ Error: ${result.error}\n\n` +
          `Please try again or contact support if the issue persists.`,
      );
    }
  } catch (error) {
    console.error("Error in send confirmation:", error);
    await ctx.editMessageText(`❌ Transfer failed: ${error.message}`);
  }
});

// Handle send cancellation
bot.action("send_cancel", async (ctx) => {
  await ctx.answerCbQuery("Transfer cancelled");
  await ctx.editMessageText("❌ Transfer cancelled");
});

// Handle offramp confirmation
bot.action(/^offramp_confirm_(.+)_(.+)$/, async (ctx) => {
  try {
    const telegramId = ctx.from.id.toString();
    const amount = parseFloat(ctx.match[1]);
    const token = ctx.match[2];

    console.log(`Offramp confirmation from ${telegramId}: ${amount} ${token}`);

    // Get user from database
    const user = db.getUserByTelegramId(telegramId);
    if (!user || !user.wallet_address) {
      await ctx.answerCbQuery("❌ Wallet not found");
      return;
    }

    // Get bank account
    const bankAccount = getBankAccount(telegramId, db);
    if (!bankAccount) {
      await ctx.answerCbQuery("❌ Bank account not found");
      return;
    }

    await ctx.answerCbQuery();
    await ctx.editMessageText("🔄 Processing offramp...");

    // Execute offramp
    const result = await initiateOfframp(
      telegramId,
      token,
      amount,
      bankAccount,
      user.wallet_address,
      user.wallet_id,
      privyClient,
      SOLANA_CONNECTION,
      db,
    );

    // Send result
    const message = formatOfframpResult({ ...result, token });
    await ctx.editMessageText(message);
  } catch (error) {
    console.error("Error in offramp confirmation:", error);
    await ctx.editMessageText(`❌ Offramp failed: ${error.message}`);
  }
});

// Handle offramp cancellation
bot.action("offramp_cancel", async (ctx) => {
  await ctx.answerCbQuery("Offramp cancelled");
  await ctx.editMessageText("❌ Offramp cancelled");
});

// ===== ERROR HANDLING =====

// Handle errors
bot.catch((err, ctx) => {
  console.error("Bot error:", err);
  ctx
    .reply("❌ An unexpected error occurred. Please try again.")
    .catch(console.error);
});

// ===== GRACEFUL SHUTDOWN =====

// Handle shutdown signals
process.once("SIGINT", () => {
  console.log("\n🛑 Received SIGINT, shutting down gracefully...");
  bot.stop("SIGINT");
  process.exit(0);
});

process.once("SIGTERM", () => {
  console.log("\n🛑 Received SIGTERM, shutting down gracefully...");
  bot.stop("SIGTERM");
  process.exit(0);
});

// ===== START BOT =====

// Set bot commands menu (appears next to input box)
async function setupBotMenu() {
  try {
    await bot.telegram.setMyCommands([
      { command: "start", description: "🏠 Welcome & help" },
      { command: "createwallet", description: "💼 Create new wallet" },
      { command: "wallet", description: "💰 Check balance" },
      { command: "send", description: "💸 Send SOL or USDC" },
      { command: "swap", description: "💱 Swap tokens" },
      { command: "airdrop", description: "🪂 Get test SOL (devnet)" },
      { command: "offramp", description: "🏦 Cash out to Naira" },
      { command: "setbank", description: "🏧 Set bank account" },
      { command: "copytrade", description: "🐋 Copy whale trades" },
      { command: "mycopies", description: "📋 View copy trades" },
      { command: "spawnbot", description: "🤖 Create AI agent" },
      { command: "mybots", description: "🤖 View your bots" },
      { command: "help", description: "❓ Show help" },
    ]);
    console.log("✅ Bot menu commands set successfully");
  } catch (error) {
    console.error("⚠️  Failed to set bot menu:", error.message);
  }
}

// Export bot for testing
module.exports = bot;

// Start bot if this file is run directly
if (require.main === module) {
  console.log("🚀 Starting Agent 47 Telegram Bot...");
  console.log(`Network: ${NETWORK}`);
  console.log(`Bot username: @${bot.botInfo?.username || "unknown"}`);

  // Setup bot menu and launch
  setupBotMenu()
    .then(() => bot.launch())
    .then(() => {
      console.log("✅ Bot is running!");
      console.log("Press Ctrl+C to stop");
    })
    .catch((error) => {
      console.error("❌ Failed to start bot:", error);
      process.exit(1);
    });
}
