const cron = require('node-cron');
const { executeSwap, getTokenPrice } = require('./swap');
const { LAMPORTS_PER_SOL } = require('@solana/web3.js');

/**
 * Autonomous AI Agent Management Module
 * 
 * DEVNET ONLY — Agents are restricted to devnet for safety
 * 
 * This module manages autonomous trading bots that can:
 * - Execute DCA (Dollar Cost Average) trades
 * - Monitor prices and send alerts
 * - Snipe new token launches
 * - Monitor wallet liquidity
 */

// Network validation
const NETWORK = process.env.NETWORK || 'devnet';

// In-memory storage for active agents
// Key: `${telegramId}_${agentName}`, Value: { cronJob, agentType, config, isRunning, stats }
const activeAgents = new Map();

// Track agent failures for error handling
const agentFailures = new Map();

console.log(`Agent Management module initialized for ${NETWORK} network`);
console.log('⚠️  DEVNET ONLY - Agents disabled on mainnet for safety');

/**
 * Spawn a new autonomous agent bot
 * @param {string} telegramId - Telegram user ID
 * @param {string} agentType - Type of agent ("trader", "analyst", "sniper", "liquidity")
 * @param {string} agentName - User-defined name for the agent
 * @param {object} config - Agent-specific configuration
 * @param {string} userWallet - User's wallet address
 * @param {string} walletId - Privy wallet ID
 * @param {object} privyClient - Privy client instance
 * @param {object} connection - Solana connection object
 * @param {object} bot - Telegram bot instance
 * @param {object} db - Database instance
 * @returns {Promise<object>} Result with success status and agent ID
 */
async function spawnAgent(
  telegramId,
  agentType,
  agentName,
  config,
  userWallet,
  walletId,
  privyClient,
  connection,
  bot,
  db
) {
  try {
    console.log(`\n=== Spawning Agent ===`);
    console.log(`User: ${telegramId}`);
    console.log(`Type: ${agentType}`);
    console.log(`Name: ${agentName}`);
    console.log(`Config:`, config);
    
    // Safety check: DEVNET ONLY
    if (NETWORK !== 'devnet') {
      throw new Error('⚠️ SAFETY: Autonomous agents are only available on DEVNET. Switch to devnet to use this feature.');
    }
    
    // Validate agent type
    const validTypes = ['trader', 'analyst', 'sniper', 'liquidity'];
    if (!validTypes.includes(agentType)) {
      throw new Error(`Invalid agent type. Must be one of: ${validTypes.join(', ')}`);
    }
    
    // Check if agent already exists
    const agentKey = `${telegramId}_${agentName}`;
    if (activeAgents.has(agentKey)) {
      throw new Error(`Agent "${agentName}" already exists. Stop it first or choose a different name.`);
    }
    
    // Initialize agent stats
    const stats = {
      tradesExecuted: 0,
      alertsSent: 0,
      totalSpent: 0,
      totalReceived: 0,
      lastActivity: new Date().toISOString(),
      errors: 0
    };
    
    // Create cron job based on agent type
    let cronJob;
    let cronSchedule;
    
    switch (agentType) {
      case 'trader':
        cronSchedule = `*/${config.intervalMinutes || 5} * * * *`;
        cronJob = cron.schedule(cronSchedule, async () => {
          await executeTraderAgent(
            telegramId,
            agentName,
            config,
            userWallet,
            walletId,
            privyClient,
            connection,
            bot,
            db,
            stats
          );
        });
        break;
        
      case 'analyst':
        cronSchedule = `*/${config.checkIntervalMinutes || 2} * * * *`;
        cronJob = cron.schedule(cronSchedule, async () => {
          await executeAnalystAgent(
            telegramId,
            agentName,
            config,
            connection,
            bot,
            stats
          );
        });
        break;
        
      case 'sniper':
        cronSchedule = '*/30 * * * * *'; // Every 30 seconds
        cronJob = cron.schedule(cronSchedule, async () => {
          await executeSniperAgent(
            telegramId,
            agentName,
            config,
            userWallet,
            walletId,
            privyClient,
            connection,
            bot,
            db,
            stats
          );
        });
        break;
        
      case 'liquidity':
        cronSchedule = '*/5 * * * *'; // Every 5 minutes
        cronJob = cron.schedule(cronSchedule, async () => {
          await executeLiquidityAgent(
            telegramId,
            agentName,
            config,
            userWallet,
            connection,
            bot,
            stats
          );
        });
        break;
    }
    
    // Store agent in memory
    activeAgents.set(agentKey, {
      cronJob,
      agentType,
      agentName,
      config,
      isRunning: true,
      stats,
      telegramId,
      userWallet,
      walletId,
      privyClient,
      connection,
      bot
    });
    
    // Initialize failure counter
    agentFailures.set(agentKey, 0);
    
    // Save to database
    db.addAgentBot(telegramId, agentType, agentName, JSON.stringify(config));
    
    // Send Telegram notification
    const message = `🤖 Agent "${agentName}" spawned as ${agentType} bot!\n\n` +
                   `⚙️ Configuration:\n${formatConfig(config)}\n\n` +
                   `✅ Agent is now running`;
    
    await bot.telegram.sendMessage(telegramId, message);
    
    console.log(`✅ Agent spawned successfully: ${agentKey}\n`);
    
    return {
      success: true,
      agentId: agentKey,
      message: `Agent "${agentName}" spawned successfully`
    };
    
  } catch (error) {
    console.error('Error spawning agent:', error.message);
    return {
      success: false,
      agentId: null,
      message: `Failed to spawn agent: ${error.message}`
    };
  }
}

/**
 * Stop an active agent
 * @param {string} telegramId - Telegram user ID
 * @param {string} agentName - Agent name to stop
 * @param {object} db - Database instance
 * @returns {Promise<object>} Result with success status
 */
async function stopAgent(telegramId, agentName, db) {
  try {
    console.log(`\n=== Stopping Agent ===`);
    console.log(`User: ${telegramId}`);
    console.log(`Agent: ${agentName}`);
    
    const agentKey = `${telegramId}_${agentName}`;
    const agent = activeAgents.get(agentKey);
    
    if (!agent) {
      return {
        success: false,
        message: `Agent "${agentName}" not found`
      };
    }
    
    // Stop the cron job
    agent.cronJob.stop();
    
    // Remove from memory
    activeAgents.delete(agentKey);
    agentFailures.delete(agentKey);
    
    // Update database (get agent ID first)
    const agents = db.getAgentBots(telegramId);
    const dbAgent = agents.find(a => a.agent_name === agentName);
    if (dbAgent) {
      db.updateAgentStatus(dbAgent.id, 0);
    }
    
    console.log(`✅ Agent stopped: ${agentKey}\n`);
    
    return {
      success: true,
      message: `Agent "${agentName}" stopped successfully`
    };
    
  } catch (error) {
    console.error('Error stopping agent:', error.message);
    return {
      success: false,
      message: `Failed to stop agent: ${error.message}`
    };
  }
}

/**
 * List all agents for a user
 * @param {string} telegramId - Telegram user ID
 * @param {object} db - Database instance
 * @returns {Array} List of agents with their status
 */
function listAgents(telegramId, db) {
  try {
    console.log(`Listing agents for ${telegramId}`);
    
    // Get from database
    const dbAgents = db.getAgentBots(telegramId);
    
    // Enrich with runtime status
    return dbAgents.map(agent => {
      const agentKey = `${telegramId}_${agent.agent_name}`;
      const activeAgent = activeAgents.get(agentKey);
      
      return {
        name: agent.agent_name,
        type: agent.agent_type,
        config: JSON.parse(agent.config),
        isRunning: activeAgent ? activeAgent.isRunning : false,
        stats: activeAgent ? activeAgent.stats : null,
        createdAt: agent.created_at
      };
    });
    
  } catch (error) {
    console.error('Error listing agents:', error.message);
    return [];
  }
}

/**
 * Get performance stats for an agent
 * @param {string} telegramId - Telegram user ID
 * @param {string} agentName - Agent name
 * @returns {object|null} Agent stats or null
 */
function getAgentStats(telegramId, agentName) {
  try {
    const agentKey = `${telegramId}_${agentName}`;
    const agent = activeAgents.get(agentKey);
    
    if (!agent) {
      return null;
    }
    
    const profitLoss = agent.stats.totalReceived - agent.stats.totalSpent;
    
    return {
      agentName: agent.agentName,
      agentType: agent.agentType,
      tradesExecuted: agent.stats.tradesExecuted,
      alertsSent: agent.stats.alertsSent,
      totalSpent: agent.stats.totalSpent,
      totalReceived: agent.stats.totalReceived,
      estimatedPnL: profitLoss,
      lastActivity: agent.stats.lastActivity,
      errors: agent.stats.errors,
      isRunning: agent.isRunning
    };
    
  } catch (error) {
    console.error('Error getting agent stats:', error.message);
    return null;
  }
}

/**
 * Execute trader agent logic (DCA trading)
 */
async function executeTraderAgent(
  telegramId,
  agentName,
  config,
  userWallet,
  walletId,
  privyClient,
  connection,
  bot,
  db,
  stats
) {
  const agentKey = `${telegramId}_${agentName}`;
  
  try {
    if (!config.enabled) {
      console.log(`Trader agent ${agentName} is disabled`);
      return;
    }
    
    console.log(`\n🤖 Trader Agent "${agentName}" executing...`);
    
    // Execute DCA trade
    const result = await executeSwap(
      userWallet,
      walletId,
      'SOL',
      config.targetToken || 'USDC',
      config.buyAmountSol || 0.01,
      privyClient,
      connection
    );
    
    if (result.success) {
      stats.tradesExecuted++;
      stats.totalSpent += config.buyAmountSol;
      stats.totalReceived += result.outputAmount;
      stats.lastActivity = new Date().toISOString();
      
      // Reset failure counter
      agentFailures.set(agentKey, 0);
      
      // Send notification
      await bot.telegram.sendMessage(
        telegramId,
        `🤖 DCA Trade by "${agentName}"\n\n` +
        `💱 ${config.buyAmountSol} SOL → ${result.outputAmount.toFixed(6)} ${config.targetToken}\n` +
        `🔗 TX: ${result.signature}`
      );
      
      console.log(`✅ Trader agent executed successfully`);
    } else {
      throw new Error(result.error);
    }
    
  } catch (error) {
    await handleAgentError(agentKey, telegramId, agentName, error, bot, stats);
  }
}

/**
 * Execute analyst agent logic (price monitoring)
 */
async function executeAnalystAgent(
  telegramId,
  agentName,
  config,
  connection,
  bot,
  stats
) {
  const agentKey = `${telegramId}_${agentName}`;
  
  try {
    console.log(`\n📊 Analyst Agent "${agentName}" checking prices...`);
    
    // Get token mint
    const tokenMint = config.watchToken === 'SOL' 
      ? 'So11111111111111111111111111111111111111112'
      : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    
    // Get current price
    const currentPrice = await getTokenPrice(tokenMint);
    
    // Get last price from agent state
    const agent = activeAgents.get(agentKey);
    const lastPrice = agent.lastPrice || currentPrice;
    
    // Calculate price change
    const priceChange = ((currentPrice - lastPrice) / lastPrice) * 100;
    
    console.log(`Price: $${currentPrice}, Change: ${priceChange.toFixed(2)}%`);
    
    // Check if threshold exceeded
    if (Math.abs(priceChange) >= (config.alertThresholdPercent || 5)) {
      stats.alertsSent++;
      stats.lastActivity = new Date().toISOString();
      
      const direction = priceChange > 0 ? '📈' : '📉';
      
      await bot.telegram.sendMessage(
        telegramId,
        `${direction} Price Alert from "${agentName}"\n\n` +
        `💰 ${config.watchToken}: $${currentPrice.toFixed(4)}\n` +
        `📊 Change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%\n` +
        `⏰ Time: ${new Date().toLocaleString()}`
      );
      
      console.log(`✅ Alert sent for ${priceChange.toFixed(2)}% change`);
    }
    
    // Update last price
    agent.lastPrice = currentPrice;
    
    // Reset failure counter
    agentFailures.set(agentKey, 0);
    
  } catch (error) {
    await handleAgentError(agentKey, telegramId, agentName, error, bot, stats);
  }
}

/**
 * Execute sniper agent logic (new token monitoring)
 */
async function executeSniperAgent(
  telegramId,
  agentName,
  config,
  userWallet,
  walletId,
  privyClient,
  connection,
  bot,
  db,
  stats
) {
  const agentKey = `${telegramId}_${agentName}`;
  
  try {
    if (!config.enabled) {
      return;
    }
    
    console.log(`\n🎯 Sniper Agent "${agentName}" scanning...`);
    
    // Simulated new token detection (in production, use Helius webhooks or Raydium API)
    // For devnet testing, this is a placeholder
    
    // Reset failure counter
    agentFailures.set(agentKey, 0);
    
    // Note: Actual implementation would monitor Raydium pool initializations
    // and execute trades based on liquidity and other criteria
    
  } catch (error) {
    await handleAgentError(agentKey, telegramId, agentName, error, bot, stats);
  }
}

/**
 * Execute liquidity agent logic (balance monitoring)
 */
async function executeLiquidityAgent(
  telegramId,
  agentName,
  config,
  userWallet,
  connection,
  bot,
  stats
) {
  const agentKey = `${telegramId}_${agentName}`;
  
  try {
    console.log(`\n💧 Liquidity Agent "${agentName}" checking balance...`);
    
    // Get wallet balance
    const { getWalletBalance } = require('./wallet');
    const balance = await getWalletBalance(userWallet, connection);
    
    console.log(`SOL Balance: ${balance.sol}`);
    
    // Check if below threshold
    if (balance.sol < (config.minSolBalance || 0.1)) {
      stats.alertsSent++;
      stats.lastActivity = new Date().toISOString();
      
      await bot.telegram.sendMessage(
        telegramId,
        `⚠️ Low Balance Alert from "${agentName}"\n\n` +
        `💰 Current SOL: ${balance.sol.toFixed(4)}\n` +
        `📉 Threshold: ${config.minSolBalance || 0.1} SOL\n\n` +
        `Please top up your wallet to continue trading.`
      );
      
      console.log(`✅ Low balance alert sent`);
    }
    
    // Reset failure counter
    agentFailures.set(agentKey, 0);
    
  } catch (error) {
    await handleAgentError(agentKey, telegramId, agentName, error, bot, stats);
  }
}

/**
 * Handle agent errors with retry logic
 */
async function handleAgentError(agentKey, telegramId, agentName, error, bot, stats) {
  console.error(`❌ Agent "${agentName}" error:`, error.message);
  
  stats.errors++;
  
  // Increment failure counter
  const failures = (agentFailures.get(agentKey) || 0) + 1;
  agentFailures.set(agentKey, failures);
  
  // If failed 3 times, alert user and stop agent
  if (failures >= 3) {
    console.error(`🛑 Agent "${agentName}" failed 3 times, stopping...`);
    
    const agent = activeAgents.get(agentKey);
    if (agent) {
      agent.cronJob.stop();
      agent.isRunning = false;
    }
    
    await bot.telegram.sendMessage(
      telegramId,
      `🛑 Agent "${agentName}" has been stopped due to repeated failures.\n\n` +
      `❌ Error: ${error.message}\n\n` +
      `Please check your configuration and restart the agent.`
    );
  }
}

/**
 * Format configuration for display
 */
function formatConfig(config) {
  return Object.entries(config)
    .map(([key, value]) => `  • ${key}: ${value}`)
    .join('\n');
}

/**
 * Get all active agents (for monitoring)
 */
function getActiveAgents() {
  const agents = [];
  for (const [key, agent] of activeAgents.entries()) {
    agents.push({
      key,
      name: agent.agentName,
      type: agent.agentType,
      isRunning: agent.isRunning,
      stats: agent.stats
    });
  }
  return agents;
}

// Export functions
module.exports = {
  spawnAgent,
  stopAgent,
  listAgents,
  getAgentStats,
  getActiveAgents
};
