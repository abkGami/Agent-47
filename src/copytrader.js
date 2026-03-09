const { Connection, PublicKey } = require('@solana/web3.js');
const axios = require('axios');
const { executeSwap, getTokenMint } = require('./swap');

/**
 * Copy Trading Module for Solana
 * 
 * DEVNET ONLY — for mainnet, ensure proper risk management and user consent
 * 
 * This module allows users to automatically copy trades from whale wallets.
 * When a target wallet executes a swap, this bot detects it and mirrors the trade
 * with a scaled amount based on the user's maxSolPerTrade setting.
 */

// Jupiter Program ID for detecting swaps
const JUPITER_PROGRAM_ID = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4';

// In-memory storage for active subscriptions
// Key: telegramId, Value: { subscriptionId, targetWallet, maxSolPerTrade, connection, bot }
const activeSubscriptions = new Map();

console.log('Copy Trading module initialized');
console.log('⚠️  DEVNET ONLY - For testing purposes');

/**
 * Start copy trading a target wallet
 * @param {string} telegramId - Telegram user ID
 * @param {string} targetWalletAddress - Wallet address to copy
 * @param {number} maxSolPerTrade - Maximum SOL to spend per trade
 * @param {string} userWalletAddress - User's wallet address
 * @param {string} userWalletId - User's Privy wallet ID
 * @param {object} privyClient - Privy client instance
 * @param {object} connection - Solana connection object
 * @param {object} bot - Telegram bot instance
 * @param {object} db - Database instance
 * @returns {Promise<object>} Result with success status and message
 */
async function startCopyTrading(
  telegramId,
  targetWalletAddress,
  maxSolPerTrade,
  userWalletAddress,
  userWalletId,
  privyClient,
  connection,
  bot,
  db
) {
  try {
    console.log(`\n=== Starting Copy Trading ===`);
    console.log(`User: ${telegramId}`);
    console.log(`Target Wallet: ${targetWalletAddress}`);
    console.log(`Max SOL per trade: ${maxSolPerTrade}`);
    
    // Validate target wallet address
    let targetPublicKey;
    try {
      targetPublicKey = new PublicKey(targetWalletAddress);
    } catch (error) {
      throw new Error('Invalid target wallet address');
    }
    
    // Check if already subscribed to this wallet
    const existingSubscription = activeSubscriptions.get(telegramId);
    if (existingSubscription && existingSubscription.targetWallet === targetWalletAddress) {
      return {
        success: false,
        message: 'Already copy trading this wallet'
      };
    }
    
    // Subscribe to account logs
    console.log('Setting up log subscription...');
    const subscriptionId = connection.onLogs(
      targetPublicKey,
      async (logs, context) => {
        try {
          console.log(`\n📊 New transaction detected from ${targetWalletAddress}`);
          console.log(`Signature: ${logs.signature}`);
          
          // Fetch transaction details
          const transaction = await connection.getParsedTransaction(
            logs.signature,
            {
              maxSupportedTransactionVersion: 0,
              commitment: 'confirmed'
            }
          );
          
          if (!transaction) {
            console.log('Transaction not found or not confirmed yet');
            return;
          }
          
          // Check if transaction involves Jupiter (swap detection)
          const instructions = transaction.transaction.message.instructions;
          let isJupiterSwap = false;
          let swapDetails = null;
          
          for (const instruction of instructions) {
            // Check if instruction involves Jupiter program
            if (instruction.programId && 
                instruction.programId.toString() === JUPITER_PROGRAM_ID) {
              isJupiterSwap = true;
              console.log('🔄 Jupiter swap detected!');
              
              // Try to extract swap details from the transaction
              swapDetails = await extractSwapDetails(transaction);
              break;
            }
          }
          
          if (isJupiterSwap && swapDetails) {
            console.log('Swap details:', swapDetails);
            
            // Calculate scaled amount (cap at maxSolPerTrade)
            let scaledAmount = Math.min(
              swapDetails.amount * 0.1, // Copy 10% of the whale's trade
              maxSolPerTrade
            );
            
            console.log(`Mirroring swap with ${scaledAmount} SOL`);
            
            // Mirror the swap
            try {
              const result = await executeSwap(
                userWalletAddress,
                userWalletId,
                swapDetails.inputToken,
                swapDetails.outputToken,
                scaledAmount,
                privyClient,
                connection
              );
              
              if (result.success) {
                console.log('✅ Copy trade executed successfully');
                
                // Send Telegram notification
                const alertMessage = formatCopyTradeAlert(
                  targetWalletAddress,
                  'Swap',
                  swapDetails.outputToken,
                  scaledAmount,
                  result.signature
                );
                
                await bot.telegram.sendMessage(telegramId, alertMessage);
                
                // Log to database
                db.logTransaction(
                  telegramId,
                  'copy_trade',
                  scaledAmount,
                  swapDetails.inputToken,
                  swapDetails.outputToken,
                  result.signature,
                  'success'
                );
              } else {
                console.error('❌ Copy trade failed:', result.error);
                
                // Notify user of failure
                await bot.telegram.sendMessage(
                  telegramId,
                  `⚠️ Copy trade failed: ${result.error}`
                );
              }
            } catch (swapError) {
              console.error('Error executing copy trade:', swapError.message);
              await bot.telegram.sendMessage(
                telegramId,
                `⚠️ Copy trade error: ${swapError.message}`
              );
            }
          }
        } catch (error) {
          console.error('Error processing transaction:', error.message);
        }
      },
      'confirmed'
    );
    
    console.log(`Subscription ID: ${subscriptionId}`);
    
    // Store subscription in memory
    activeSubscriptions.set(telegramId, {
      subscriptionId,
      targetWallet: targetWalletAddress,
      maxSolPerTrade,
      connection,
      bot,
      userWalletAddress,
      userWalletId,
      privyClient
    });
    
    // Save to database
    db.addCopyTrade(telegramId, targetWalletAddress, maxSolPerTrade);
    
    console.log('✅ Copy trading started successfully\n');
    
    return {
      success: true,
      message: `Now copy trading ${shortenAddress(targetWalletAddress)} with max ${maxSolPerTrade} SOL per trade`
    };
    
  } catch (error) {
    console.error('Error starting copy trading:', error.message);
    return {
      success: false,
      message: `Failed to start copy trading: ${error.message}`
    };
  }
}

/**
 * Stop copy trading a target wallet
 * @param {string} telegramId - Telegram user ID
 * @param {string} targetWalletAddress - Wallet address to stop copying
 * @param {object} connection - Solana connection object
 * @param {object} db - Database instance
 * @returns {Promise<object>} Result with success status
 */
async function stopCopyTrading(telegramId, targetWalletAddress, connection, db) {
  try {
    console.log(`\n=== Stopping Copy Trading ===`);
    console.log(`User: ${telegramId}`);
    console.log(`Target Wallet: ${targetWalletAddress}`);
    
    // Get subscription from memory
    const subscription = activeSubscriptions.get(telegramId);
    
    if (!subscription) {
      return {
        success: false,
        message: 'No active copy trading subscription found'
      };
    }
    
    if (subscription.targetWallet !== targetWalletAddress) {
      return {
        success: false,
        message: 'Not currently copy trading this wallet'
      };
    }
    
    // Remove log listener
    console.log(`Removing subscription: ${subscription.subscriptionId}`);
    await connection.removeOnLogsListener(subscription.subscriptionId);
    
    // Remove from memory
    activeSubscriptions.delete(telegramId);
    
    // Update database
    db.removeCopyTrade(telegramId, targetWalletAddress);
    
    console.log('✅ Copy trading stopped successfully\n');
    
    return {
      success: true,
      message: `Stopped copy trading ${shortenAddress(targetWalletAddress)}`
    };
    
  } catch (error) {
    console.error('Error stopping copy trading:', error.message);
    return {
      success: false,
      message: `Failed to stop copy trading: ${error.message}`
    };
  }
}

/**
 * Get copy trade status for a user
 * @param {string} telegramId - Telegram user ID
 * @param {object} db - Database instance
 * @returns {Array} List of active copy trades
 */
function getCopyTradeStatus(telegramId, db) {
  try {
    console.log(`Getting copy trade status for ${telegramId}`);
    
    // Get from database
    const copyTrades = db.getCopyTrades(telegramId);
    
    // Check which ones are active in memory
    const subscription = activeSubscriptions.get(telegramId);
    
    return copyTrades.map(trade => ({
      targetWallet: trade.target_wallet,
      maxSolPerTrade: trade.max_sol_per_trade,
      isActive: subscription && subscription.targetWallet === trade.target_wallet,
      createdAt: trade.created_at
    }));
    
  } catch (error) {
    console.error('Error getting copy trade status:', error.message);
    return [];
  }
}

/**
 * Analyze a wallet's trading activity
 * @param {string} walletAddress - Wallet address to analyze
 * @param {object} connection - Solana connection object
 * @returns {Promise<object>} Wallet analysis
 */
async function analyzeWallet(walletAddress, connection) {
  try {
    console.log(`\n=== Analyzing Wallet ===`);
    console.log(`Wallet: ${walletAddress}`);
    
    const publicKey = new PublicKey(walletAddress);
    
    // Fetch last 20 transaction signatures
    const signatures = await connection.getSignaturesForAddress(publicKey, {
      limit: 20
    });
    
    console.log(`Found ${signatures.length} recent transactions`);
    
    let recentSwaps = 0;
    const tokensTraded = new Set();
    
    // Analyze each transaction
    for (const sigInfo of signatures) {
      try {
        const transaction = await connection.getParsedTransaction(
          sigInfo.signature,
          {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
          }
        );
        
        if (!transaction) continue;
        
        // Check for Jupiter swaps
        const instructions = transaction.transaction.message.instructions;
        for (const instruction of instructions) {
          if (instruction.programId && 
              instruction.programId.toString() === JUPITER_PROGRAM_ID) {
            recentSwaps++;
            
            // Try to extract token information
            const swapDetails = await extractSwapDetails(transaction);
            if (swapDetails) {
              tokensTraded.add(swapDetails.inputToken);
              tokensTraded.add(swapDetails.outputToken);
            }
            break;
          }
        }
      } catch (txError) {
        console.warn(`Error analyzing transaction ${sigInfo.signature}:`, txError.message);
      }
    }
    
    console.log(`Analysis complete: ${recentSwaps} swaps found`);
    
    return {
      recentSwaps,
      tokensTraded: Array.from(tokensTraded),
      estimatedPnl: 'N/A', // Would require price tracking over time
      totalTransactions: signatures.length
    };
    
  } catch (error) {
    console.error('Error analyzing wallet:', error.message);
    return {
      recentSwaps: 0,
      tokensTraded: [],
      estimatedPnl: 'Error',
      totalTransactions: 0
    };
  }
}

/**
 * Extract swap details from a parsed transaction
 * @param {object} transaction - Parsed transaction object
 * @returns {object|null} Swap details or null
 */
async function extractSwapDetails(transaction) {
  try {
    // Look for token balance changes to determine input/output tokens
    const preBalances = transaction.meta.preTokenBalances || [];
    const postBalances = transaction.meta.postTokenBalances || [];
    
    // Find tokens that decreased (input) and increased (output)
    let inputToken = null;
    let outputToken = null;
    let amount = 0;
    
    // Compare pre and post balances
    for (const preBalance of preBalances) {
      const postBalance = postBalances.find(
        pb => pb.accountIndex === preBalance.accountIndex
      );
      
      if (postBalance) {
        const preAmount = parseFloat(preBalance.uiTokenAmount.uiAmountString);
        const postAmount = parseFloat(postBalance.uiTokenAmount.uiAmountString);
        const diff = postAmount - preAmount;
        
        if (diff < 0) {
          // Token decreased (input)
          inputToken = preBalance.mint;
          amount = Math.abs(diff);
        } else if (diff > 0) {
          // Token increased (output)
          outputToken = postBalance.mint;
        }
      }
    }
    
    // Try to map mints to token symbols
    const inputSymbol = getTokenSymbolFromMint(inputToken) || 'UNKNOWN';
    const outputSymbol = getTokenSymbolFromMint(outputToken) || 'UNKNOWN';
    
    if (inputToken && outputToken) {
      return {
        inputToken: inputSymbol,
        outputToken: outputSymbol,
        amount: amount || 0.1 // Default to 0.1 if we can't determine
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting swap details:', error.message);
    return null;
  }
}

/**
 * Get token symbol from mint address
 * @param {string} mint - Token mint address
 * @returns {string|null} Token symbol or null
 */
function getTokenSymbolFromMint(mint) {
  if (!mint) return null;
  
  // Common token mints
  const tokenMap = {
    'So11111111111111111111111111111111111111112': 'SOL',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
    '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU': 'USDC' // Devnet
  };
  
  return tokenMap[mint] || null;
}

/**
 * Format copy trade alert message
 * @param {string} traderWallet - Trader's wallet address
 * @param {string} action - Action performed (e.g., "Swap", "Buy", "Sell")
 * @param {string} token - Token symbol
 * @param {number} amount - Amount traded
 * @param {string} myTxSig - User's transaction signature
 * @returns {string} Formatted message
 */
function formatCopyTradeAlert(traderWallet, action, token, amount, myTxSig) {
  const network = process.env.NETWORK || 'devnet';
  const solscanUrl = `https://solscan.io/tx/${myTxSig}${network === 'devnet' ? '?cluster=devnet' : ''}`;
  
  return `🐋 Copy Trade Executed!\n\n` +
         `👁 Whale Wallet: ${shortenAddress(traderWallet)}\n` +
         `🔁 Action: ${action} ${token}\n` +
         `💰 Your Amount: ${amount} SOL\n\n` +
         `🔗 Your Transaction: ${myTxSig}\n` +
         `🔍 View on Solscan: ${solscanUrl}`;
}

/**
 * Shorten wallet address for display
 * @param {string} address - Full wallet address
 * @returns {string} Shortened address
 */
function shortenAddress(address) {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/**
 * Get all active subscriptions (for debugging/monitoring)
 * @returns {Array} List of active subscriptions
 */
function getActiveSubscriptions() {
  const subscriptions = [];
  for (const [telegramId, subscription] of activeSubscriptions.entries()) {
    subscriptions.push({
      telegramId,
      targetWallet: subscription.targetWallet,
      maxSolPerTrade: subscription.maxSolPerTrade
    });
  }
  return subscriptions;
}

// Export functions
module.exports = {
  startCopyTrading,
  stopCopyTrading,
  getCopyTradeStatus,
  analyzeWallet,
  formatCopyTradeAlert,
  getActiveSubscriptions
};
