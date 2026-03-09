const axios = require('axios');
const {
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const {
  getAssociatedTokenAddress,
  createTransferInstruction,
  TOKEN_PROGRAM_ID
} = require('@solana/spl-token');

/**
 * PAJ Cash Offramp Module
 * 
 * PAJ Cash is a Solana-native offramp protocol that allows users to send USDC/SOL
 * to a designated pool address and receive Naira in their bank account within 5 minutes.
 * 
 * IMPORTANT: Get the official PAJ Cash pool addresses from https://paj.cash
 * For production use, contact PAJ Cash team via:
 * - Website: https://paj.cash
 * - SuperteamNG Discord
 * 
 * The pool addresses below are placeholders and MUST be replaced with official addresses.
 */

// PAJ Cash pool addresses (MUST BE REPLACED WITH OFFICIAL ADDRESSES FROM paj.cash)
const PAJ_USDC_POOL_ADDRESS = 'PLACEHOLDER_PAJ_POOL_ADDRESS'; // Get this from paj.cash — it's the receiving address for USDC deposits
const PAJ_SOL_POOL_ADDRESS = 'PLACEHOLDER_PAJ_SOL_POOL'; // Get this from paj.cash — it's the receiving address for SOL deposits

// USDC mint addresses
const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

// Determine network and USDC mint
const NETWORK = process.env.NETWORK || 'devnet';
const USDC_MINT = NETWORK === 'devnet' ? USDC_MINT_DEVNET : USDC_MINT_MAINNET;

// Exchange rate API
const EXCHANGE_RATE_API = 'https://open.er-api.com/v6/latest/USD';

console.log(`Offramp module initialized for ${NETWORK} network`);
console.log(`Using USDC mint: ${USDC_MINT}`);

/**
 * Estimate Naira amount from USDC
 * @param {number} usdcAmount - Amount in USDC
 * @returns {Promise<number>} Estimated Naira amount
 */
async function estimateNaira(usdcAmount) {
  try {
    console.log(`Estimating Naira for ${usdcAmount} USDC...`);
    
    // Fetch USD to NGN exchange rate
    const response = await axios.get(EXCHANGE_RATE_API);
    const exchangeRate = response.data.rates.NGN;
    
    if (!exchangeRate) {
      throw new Error('Failed to get NGN exchange rate');
    }
    
    console.log(`Current USD/NGN rate: ${exchangeRate}`);
    
    // Calculate estimated Naira
    const estimatedNaira = usdcAmount * exchangeRate;
    console.log(`Estimated Naira: ₦${estimatedNaira.toFixed(2)}`);
    
    return estimatedNaira;
  } catch (error) {
    console.error('Error estimating Naira:', error.message);
    // Return a fallback estimate (approximate rate)
    const fallbackRate = 1500; // Approximate USD/NGN rate
    console.warn(`Using fallback rate: ${fallbackRate}`);
    return usdcAmount * fallbackRate;
  }
}

/**
 * Save bank account details to database
 * @param {string} telegramId - Telegram user ID
 * @param {string} bankName - Bank name
 * @param {string} accountNumber - Bank account number
 * @param {string} accountName - Account holder name
 * @param {object} db - Database instance
 * @returns {Promise<object>} Success message
 */
async function saveBankAccount(telegramId, bankName, accountNumber, accountName, db) {
  try {
    console.log(`Saving bank account for Telegram ID: ${telegramId}`);
    
    // Save to database using the saveBankAccount function from db module
    db.saveBankAccount(telegramId, bankName, accountNumber, accountName);
    
    console.log('Bank account saved successfully');
    
    return {
      success: true,
      message: 'Bank account details saved successfully'
    };
  } catch (error) {
    console.error('Error saving bank account:', error.message);
    throw new Error(`Failed to save bank account: ${error.message}`);
  }
}

/**
 * Initiate offramp transaction to PAJ Cash
 * @param {string} telegramId - Telegram user ID
 * @param {string} token - Token to offramp ("USDC" or "SOL")
 * @param {number} amount - Human-readable amount
 * @param {object} bankAccount - Bank account details { bankName, accountNumber, accountName }
 * @param {string} walletAddress - User's wallet address
 * @param {string} walletId - Privy wallet ID
 * @param {object} privyClient - Privy client instance
 * @param {object} connection - Solana connection object
 * @param {object} db - Database instance
 * @returns {Promise<object>} Offramp result
 */
async function initiateOfframp(
  telegramId,
  token,
  amount,
  bankAccount,
  walletAddress,
  walletId,
  privyClient,
  connection,
  db
) {
  try {
    console.log(`\n=== Initiating Offramp ===`);
    console.log(`User: ${telegramId}`);
    console.log(`Token: ${token}`);
    console.log(`Amount: ${amount}`);
    console.log(`Bank: ${bankAccount.bankName} - ${bankAccount.accountNumber}`);
    
    // Validate token
    if (token !== 'USDC' && token !== 'SOL') {
      throw new Error(`Unsupported token: ${token}. Only USDC and SOL are supported.`);
    }
    
    // Validate PAJ pool addresses
    if (PAJ_USDC_POOL_ADDRESS === 'PLACEHOLDER_PAJ_POOL_ADDRESS' || 
        PAJ_SOL_POOL_ADDRESS === 'PLACEHOLDER_PAJ_SOL_POOL') {
      throw new Error('PAJ Cash pool addresses not configured. Please get official addresses from paj.cash');
    }
    
    let transaction;
    let amountLamports;
    let poolAddress;
    let estimatedNaira;
    
    // Build transaction based on token type
    if (token === 'USDC') {
      console.log('\nBuilding USDC transfer transaction...');
      
      // Convert USDC amount to microunits (6 decimals)
      amountLamports = Math.floor(amount * 1_000_000);
      poolAddress = PAJ_USDC_POOL_ADDRESS;
      
      // Get user's USDC token account
      const userPublicKey = new PublicKey(walletAddress);
      const usdcMint = new PublicKey(USDC_MINT);
      const poolPublicKey = new PublicKey(poolAddress);
      
      // Get associated token addresses
      const userTokenAccount = await getAssociatedTokenAddress(
        usdcMint,
        userPublicKey
      );
      
      const poolTokenAccount = await getAssociatedTokenAddress(
        usdcMint,
        poolPublicKey
      );
      
      console.log(`User USDC account: ${userTokenAccount.toString()}`);
      console.log(`Pool USDC account: ${poolTokenAccount.toString()}`);
      
      // Create transfer instruction
      const transferInstruction = createTransferInstruction(
        userTokenAccount,
        poolTokenAccount,
        userPublicKey,
        amountLamports,
        [],
        TOKEN_PROGRAM_ID
      );
      
      // Build transaction
      transaction = new Transaction().add(transferInstruction);
      
      // Estimate Naira
      estimatedNaira = await estimateNaira(amount);
      
    } else if (token === 'SOL') {
      console.log('\nBuilding SOL transfer transaction...');
      
      // Convert SOL amount to lamports (9 decimals)
      amountLamports = Math.floor(amount * LAMPORTS_PER_SOL);
      poolAddress = PAJ_SOL_POOL_ADDRESS;
      
      const userPublicKey = new PublicKey(walletAddress);
      const poolPublicKey = new PublicKey(poolAddress);
      
      console.log(`Sending ${amountLamports} lamports to ${poolAddress}`);
      
      // Create SOL transfer instruction
      const transferInstruction = SystemProgram.transfer({
        fromPubkey: userPublicKey,
        toPubkey: poolPublicKey,
        lamports: amountLamports
      });
      
      // Build transaction
      transaction = new Transaction().add(transferInstruction);
      
      // Get SOL price in USD and estimate Naira
      // For simplicity, we'll use a rough estimate (SOL ≈ $100)
      // In production, fetch real-time SOL price
      const solPriceUSD = 100; // Placeholder - should fetch from API
      const usdValue = amount * solPriceUSD;
      estimatedNaira = await estimateNaira(usdValue);
    }
    
    // Get recent blockhash
    console.log('\nGetting recent blockhash...');
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = new PublicKey(walletAddress);
    
    // Serialize transaction
    console.log('Serializing transaction...');
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });
    
    // Sign transaction with Privy
    console.log('Signing transaction with Privy...');
    const caip2 = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'; // Solana devnet
    const signedTransactionResponse = await privyClient.wallets().solana().signTransaction(walletId, {
      caip2,
      transaction: serializedTransaction.toString('base64')
    });
    
    // Send signed transaction
    console.log('Sending transaction to network...');
    const signedTxBuffer = Buffer.from(signedTransactionResponse.signed_transaction, 'base64');
    
    const signature = await connection.sendRawTransaction(signedTxBuffer, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3
    });
    
    console.log(`Transaction sent: ${signature}`);
    
    // Wait for confirmation
    console.log('Waiting for confirmation...');
    await connection.confirmTransaction(signature, 'confirmed');
    console.log(`Transaction confirmed: ${signature}`);
    
    // Log transaction to database
    console.log('Logging transaction to database...');
    db.logTransaction(
      telegramId,
      `offramp_${token.toLowerCase()}`,
      amount,
      token,
      'NGN',
      signature,
      'confirmed'
    );
    
    console.log('\n=== Offramp Initiated Successfully ===\n');
    
    return {
      success: true,
      signature: signature,
      amountSent: amount,
      estimatedNaira: estimatedNaira,
      message: `Successfully sent ${amount} ${token} to PAJ Cash. Naira should arrive in your bank account within 5 minutes.`
    };
    
  } catch (error) {
    console.error('\n=== Offramp Failed ===');
    console.error('Error:', error.message);
    
    // Log failed transaction
    try {
      db.logTransaction(
        telegramId,
        `offramp_${token.toLowerCase()}`,
        amount,
        token,
        'NGN',
        null,
        'failed'
      );
    } catch (dbError) {
      console.error('Failed to log error to database:', dbError.message);
    }
    
    return {
      success: false,
      signature: null,
      amountSent: amount,
      estimatedNaira: 0,
      message: `Offramp failed: ${error.message}`
    };
  }
}

/**
 * Format offramp result for display in Telegram
 * @param {object} result - Offramp result object
 * @returns {string} Formatted message
 */
function formatOfframpResult(result) {
  if (result.success) {
    // Success message
    return `🏦 Offramp Initiated!\n\n` +
           `💵 ${result.amountSent} ${result.token || 'tokens'} sent to PAJ Cash\n` +
           `💰 Estimated: ₦${result.estimatedNaira.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}\n` +
           `⏱️ Usually arrives in 5 minutes\n\n` +
           `🔗 Transaction: ${result.signature}\n` +
           `🔍 View on Solscan: https://solscan.io/tx/${result.signature}${NETWORK === 'devnet' ? '?cluster=devnet' : ''}\n\n` +
           `📱 Check your bank account shortly!`;
  } else {
    // Error message
    return `❌ Offramp Failed\n\n` +
           `💵 Attempted: ${result.amountSent} tokens\n\n` +
           `⚠️ Error: ${result.message}\n\n` +
           `Please try again or contact support if the issue persists.`;
  }
}

/**
 * Get bank account details from database
 * @param {string} telegramId - Telegram user ID
 * @param {object} db - Database instance
 * @returns {object|null} Bank account details or null
 */
function getBankAccount(telegramId, db) {
  try {
    return db.getBankAccount(telegramId);
  } catch (error) {
    console.error('Error getting bank account:', error.message);
    return null;
  }
}

// Export functions
module.exports = {
  initiateOfframp,
  estimateNaira,
  saveBankAccount,
  getBankAccount,
  formatOfframpResult,
  // Export constants for use in other modules
  PAJ_USDC_POOL_ADDRESS,
  PAJ_SOL_POOL_ADDRESS,
  USDC_MINT
};
