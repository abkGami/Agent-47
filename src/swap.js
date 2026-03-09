const axios = require('axios');
const { VersionedTransaction, LAMPORTS_PER_SOL } = require('@solana/web3.js');

// Jupiter API endpoints (v1 - new API)
const JUPITER_QUOTE_API = 'https://api.jup.ag/swap/v1/quote';
const JUPITER_SWAP_API = 'https://api.jup.ag/swap/v1/swap';
const JUPITER_PRICE_API = 'https://api.jup.ag/price/v3';

// Token mint addresses
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

// Determine which USDC mint to use based on network
const NETWORK = process.env.NETWORK || 'devnet';
const USDC_MINT = NETWORK === 'devnet' ? USDC_MINT_DEVNET : USDC_MINT_MAINNET;

// Token decimals
const TOKEN_DECIMALS = {
  'SOL': 9,
  'USDC': 6
};

// Token mint mapping
const TOKEN_MINTS = {
  'SOL': SOL_MINT,
  'USDC': USDC_MINT
};

// Jupiter API key (required for all tiers)
const JUPITER_API_KEY = process.env.JUPITER_API_KEY;

if (!JUPITER_API_KEY || JUPITER_API_KEY === 'your_jupiter_api_key_here') {
  console.warn('⚠️  WARNING: JUPITER_API_KEY not set!');
  console.warn('⚠️  Get a free API key at: https://portal.jup.ag/');
  console.warn('⚠️  Add it to your .env file as JUPITER_API_KEY=your_key_here');
}

console.log(`Swap module initialized for ${NETWORK} network`);
console.log(`Using USDC mint: ${USDC_MINT}`);

// IMPORTANT: Jupiter only supports mainnet-beta
if (NETWORK === 'devnet') {
  console.warn('⚠️  WARNING: Jupiter swap API only works on MAINNET!');
  console.warn('⚠️  Devnet tokens do not have liquidity pools on Jupiter.');
  console.warn('⚠️  To test swaps, set NETWORK=mainnet in your .env file.');
  console.warn('⚠️  Note: Mainnet swaps use real tokens and incur real fees.');
}

/**
 * Get a swap quote from Jupiter
 * @param {string} inputMint - Input token mint address
 * @param {string} outputMint - Output token mint address
 * @param {number} amountLamports - Amount in smallest unit (lamports/microunits)
 * @param {number} slippageBps - Slippage in basis points (default 50 = 0.5%)
 * @returns {Promise<object|null>} Quote response or null on failure
 */
async function getSwapQuote(inputMint, outputMint, amountLamports, slippageBps = 50) {
  try {
    // Check if on devnet and warn user
    if (NETWORK === 'devnet') {
      console.error('❌ Jupiter swap API only works on MAINNET');
      console.error('❌ Devnet tokens do not have liquidity pools');
      return null;
    }
    
    console.log(`Getting swap quote: ${amountLamports} ${inputMint} -> ${outputMint}`);
    console.log(`Slippage: ${slippageBps} bps (${slippageBps / 100}%)`);
    
    // Call Jupiter v1 quote API with API key
    const response = await axios.get(JUPITER_QUOTE_API, {
      params: {
        inputMint: inputMint,
        outputMint: outputMint,
        amount: amountLamports.toString(),
        slippageBps: slippageBps
      },
      headers: {
        'x-api-key': JUPITER_API_KEY
      }
    });
    
    console.log(`Quote received: ${response.data.outAmount} output tokens`);
    return response.data;
  } catch (error) {
    console.error('Error getting swap quote:', error.message);
    if (error.response) {
      console.error('API response:', error.response.data);
    }
    return null;
  }
}

/**
 * Execute a token swap
 * @param {string} walletAddress - User's wallet address
 * @param {string} walletId - Privy wallet ID
 * @param {string} inputToken - Input token symbol (e.g., "SOL")
 * @param {string} outputToken - Output token symbol (e.g., "USDC")
 * @param {number} amount - Human-readable amount (e.g., 1.5)
 * @param {object} privyClient - Privy client instance
 * @param {object} connection - Solana connection object
 * @returns {Promise<object>} Swap result with success, signature, amounts, and error
 */
async function executeSwap(walletAddress, walletId, inputToken, outputToken, amount, privyClient, connection) {
  try {
    console.log(`\n=== Executing Swap ===`);
    console.log(`Wallet: ${walletAddress}`);
    console.log(`Swap: ${amount} ${inputToken} -> ${outputToken}`);
    
    // Check if on devnet
    if (NETWORK === 'devnet') {
      return {
        success: false,
        signature: null,
        inputAmount: amount,
        outputAmount: 0,
        error: 'Jupiter swap API only works on MAINNET. Devnet tokens do not have liquidity pools. Set NETWORK=mainnet in .env to use swaps (requires real tokens and fees).'
      };
    }
    
    // Get token mints
    const inputMint = TOKEN_MINTS[inputToken];
    const outputMint = TOKEN_MINTS[outputToken];
    
    if (!inputMint || !outputMint) {
      throw new Error(`Unsupported token: ${inputToken} or ${outputToken}`);
    }
    
    // Get token decimals
    const inputDecimals = TOKEN_DECIMALS[inputToken];
    const outputDecimals = TOKEN_DECIMALS[outputToken];
    
    // Convert human-readable amount to smallest unit (lamports/microunits)
    const amountLamports = Math.floor(amount * Math.pow(10, inputDecimals));
    console.log(`Amount in smallest units: ${amountLamports}`);
    
    // Step 1: Get quote from Jupiter
    console.log('\nStep 1: Getting quote from Jupiter...');
    const quote = await getSwapQuote(inputMint, outputMint, amountLamports);
    
    if (!quote) {
      return {
        success: false,
        signature: null,
        inputAmount: amount,
        outputAmount: 0,
        error: 'Failed to get swap quote'
      };
    }
    
    // Calculate output amount in human-readable format
    const outputAmount = parseInt(quote.outAmount) / Math.pow(10, outputDecimals);
    console.log(`Expected output: ${outputAmount} ${outputToken}`);
    
    // Step 2: Get swap transaction from Jupiter
    console.log('\nStep 2: Getting swap transaction from Jupiter...');
    const swapResponse = await axios.post(JUPITER_SWAP_API, {
      userPublicKey: walletAddress,
      quoteResponse: quote,
      wrapAndUnwrapSol: true,
      // Use dynamic slippage if available in quote
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto'
    }, {
      headers: {
        'x-api-key': JUPITER_API_KEY
      }
    });
    
    const { swapTransaction } = swapResponse.data;
    console.log('Swap transaction received from Jupiter');
    
    // Step 3: Deserialize the transaction
    console.log('\nStep 3: Deserializing transaction...');
    const transactionBuffer = Buffer.from(swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(transactionBuffer);
    console.log('Transaction deserialized successfully');
    
    // Step 4: Sign the transaction with Privy
    console.log('\nStep 4: Signing transaction with Privy...');
    const caip2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'; // Solana devnet
    const signedTransactionResponse = await privyClient.wallets().solana().signTransaction(walletId, {
      caip2,
      transaction: swapTransaction
    });
    
    console.log('Transaction signed successfully');
    
    // Step 5: Send the signed transaction to the network
    console.log('\nStep 5: Sending transaction to network...');
    const signedTxBuffer = Buffer.from(signedTransactionResponse.signed_transaction, 'base64');
    
    const signature = await connection.sendRawTransaction(signedTxBuffer, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3
    });
    
    console.log(`Transaction sent: ${signature}`);
    
    // Step 6: Wait for confirmation
    console.log('\nStep 6: Waiting for confirmation...');
    await connection.confirmTransaction(signature, 'confirmed');
    console.log(`Transaction confirmed: ${signature}`);
    
    console.log('\n=== Swap Completed Successfully ===\n');
    
    return {
      success: true,
      signature: signature,
      inputAmount: amount,
      outputAmount: outputAmount,
      error: null
    };
    
  } catch (error) {
    console.error('\n=== Swap Failed ===');
    console.error('Error:', error.message);
    if (error.response) {
      console.error('API Error:', error.response.data);
    }
    
    return {
      success: false,
      signature: null,
      inputAmount: amount,
      outputAmount: 0,
      error: error.message
    };
  }
}

/**
 * Get current token price in USD
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<number>} Token price in USD
 */
async function getTokenPrice(tokenMint) {
  try {
    // Check if on devnet and warn user
    if (NETWORK === 'devnet') {
      console.warn('⚠️  Jupiter price API only works on MAINNET');
      return 0;
    }
    
    console.log(`Getting price for token: ${tokenMint}`);
    
    // Call Jupiter price API with API key
    const response = await axios.get(JUPITER_PRICE_API, {
      params: {
        ids: tokenMint
      },
      headers: {
        'x-api-key': JUPITER_API_KEY
      }
    });
    
    // Extract price from response
    const priceData = response.data.data[tokenMint];
    
    if (!priceData || !priceData.price) {
      console.warn(`No price data found for token: ${tokenMint}`);
      return 0;
    }
    
    const price = priceData.price;
    console.log(`Token price: $${price}`);
    
    return price;
  } catch (error) {
    console.error('Error getting token price:', error.message);
    return 0;
  }
}

/**
 * Format swap result for display in Telegram
 * @param {object} result - Swap result object
 * @param {string} inputToken - Input token symbol
 * @param {string} outputToken - Output token symbol
 * @returns {string} Formatted message
 */
function formatSwapResult(result, inputToken, outputToken) {
  if (result.success) {
    // Success message
    return `✅ Swap Successful!\n\n` +
           `💱 ${result.inputAmount} ${inputToken} → ${result.outputAmount.toFixed(6)} ${outputToken}\n\n` +
           `🔗 Transaction: ${result.signature}\n` +
           `🔍 View on Solscan: https://solscan.io/tx/${result.signature}${NETWORK === 'devnet' ? '?cluster=devnet' : ''}`;
  } else {
    // Error message
    return `❌ Swap Failed\n\n` +
           `💱 Attempted: ${result.inputAmount} ${inputToken} → ${outputToken}\n\n` +
           `⚠️ Error: ${result.error}\n\n` +
           `Please try again or contact support if the issue persists.`;
  }
}

/**
 * Get token mint address from symbol
 * @param {string} tokenSymbol - Token symbol (e.g., "SOL", "USDC")
 * @returns {string} Token mint address
 */
function getTokenMint(tokenSymbol) {
  return TOKEN_MINTS[tokenSymbol] || null;
}

/**
 * Get token decimals from symbol
 * @param {string} tokenSymbol - Token symbol (e.g., "SOL", "USDC")
 * @returns {number} Token decimals
 */
function getTokenDecimals(tokenSymbol) {
  return TOKEN_DECIMALS[tokenSymbol] || 9;
}

// Export functions
module.exports = {
  getSwapQuote,
  executeSwap,
  getTokenPrice,
  formatSwapResult,
  getTokenMint,
  getTokenDecimals,
  // Export constants for use in other modules
  SOL_MINT,
  USDC_MINT,
  TOKEN_MINTS,
  TOKEN_DECIMALS
};
