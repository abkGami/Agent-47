const { PrivyClient } = require('@privy-io/node');
const { Connection, PublicKey, LAMPORTS_PER_SOL, Transaction } = require('@solana/web3.js');

// Load environment variables
const PRIVY_APP_ID = process.env.PRIVY_APP_ID;
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET;
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.devnet.solana.com';
const NETWORK = process.env.NETWORK || 'devnet';

// USDC mint addresses
const USDC_MINT_MAINNET = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_MINT_DEVNET = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
const USDC_MINT = NETWORK === 'devnet' ? USDC_MINT_DEVNET : USDC_MINT_MAINNET;

// Initialize Privy Client
console.log('Initializing Privy Client...');
const privyClient = new PrivyClient({
  appId: PRIVY_APP_ID,
  appSecret: PRIVY_APP_SECRET
});
console.log('Privy Client initialized successfully');

// Initialize Solana Connection
console.log(`Initializing Solana Connection to ${HELIUS_RPC_URL}...`);
const SOLANA_CONNECTION = new Connection(HELIUS_RPC_URL, 'confirmed');
console.log('Solana Connection initialized successfully');

/**
 * Create a new Solana wallet for a Telegram user
 * @param {string} telegramId - Telegram user ID
 * @returns {Promise<{walletId: string, walletAddress: string, privyUserId: string}>}
 */
async function createSolanaWallet(telegramId) {
  try {
    console.log(`Creating Solana wallet for Telegram ID: ${telegramId}`);
    
    // Create a server-managed Solana wallet
    const wallet = await privyClient.wallets().create({
      chain_type: 'solana'
    });
    
    console.log(`Solana wallet created: ${wallet.address}`);
    
    return {
      walletId: wallet.id,
      walletAddress: wallet.address,
      privyUserId: wallet.id // Use wallet ID as user ID for simplicity
    };
  } catch (error) {
    console.error('Error creating Solana wallet:', error);
    throw new Error(`Failed to create Solana wallet: ${error.message}`);
  }
}

/**
 * Get wallet balance (SOL and USDC)
 * @param {string} walletAddress - Solana wallet address
 * @param {Connection} connection - Solana connection object
 * @returns {Promise<{sol: number, usdc: number}>}
 */
async function getWalletBalance(walletAddress, connection = SOLANA_CONNECTION) {
  try {
    console.log(`Getting balance for wallet: ${walletAddress}`);
    
    const publicKey = new PublicKey(walletAddress);
    
    // Get SOL balance
    const solBalance = await connection.getBalance(publicKey);
    const sol = solBalance / LAMPORTS_PER_SOL;
    
    console.log(`SOL balance: ${sol}`);
    
    // Get USDC balance
    let usdc = 0;
    try {
      const usdcMint = new PublicKey(USDC_MINT);
      const tokenAccounts = await connection.getTokenAccountsByOwner(publicKey, {
        mint: usdcMint
      });
      
      if (tokenAccounts.value.length > 0) {
        // Parse the token account data
        const accountInfo = tokenAccounts.value[0].account;
        // Token amount is stored at offset 64, 8 bytes (little-endian)
        const amount = accountInfo.data.readBigUInt64LE(64);
        // USDC has 6 decimals
        usdc = Number(amount) / 1_000_000;
        console.log(`USDC balance: ${usdc}`);
      } else {
        console.log('No USDC token account found');
      }
    } catch (usdcError) {
      console.warn('Error fetching USDC balance:', usdcError.message);
      // Don't throw, just return 0 for USDC
    }
    
    return { sol, usdc };
  } catch (error) {
    console.error('Error getting wallet balance:', error);
    throw new Error(`Failed to get wallet balance: ${error.message}`);
  }
}

/**
 * Sign and send a transaction
 * @param {string} walletId - Privy wallet ID
 * @param {Transaction} transaction - Solana transaction object
 * @param {Connection} connection - Solana connection object
 * @returns {Promise<string>} Transaction signature
 */
async function signAndSendTransaction(walletId, transaction, connection = SOLANA_CONNECTION) {
  const MAX_RETRIES = 3;
  let lastError;
  
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Signing and sending transaction (attempt ${attempt}/${MAX_RETRIES})...`);
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      
      // Serialize the transaction
      const serializedTransaction = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false
      });
      
      // Sign the transaction using Privy
      console.log(`Signing transaction with wallet ID: ${walletId}`);
      
      // Use Privy's Solana-specific signing method
      // Note: signTransaction may not be available, use signAndSendTransaction approach
      const response = await privyClient.wallets().solana().signTransaction(walletId, {
        transaction: serializedTransaction.toString('base64')
      });
      
      // Decode the signed transaction
      const signedTxBuffer = Buffer.from(response.signed_transaction, 'base64');
      
      // Send the signed transaction
      console.log('Sending signed transaction to network...');
      const signature = await connection.sendRawTransaction(signedTxBuffer, {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });
      
      console.log(`Transaction sent successfully: ${signature}`);
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');
      console.log(`Transaction confirmed: ${signature}`);
      
      return signature;
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt} failed:`, error.message);
      
      if (attempt < MAX_RETRIES) {
        // Wait before retrying (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error('All retry attempts failed');
  throw new Error(`Failed to sign and send transaction after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

/**
 * Export wallet information (public key only)
 * @param {string} walletId - Privy wallet ID
 * @returns {Promise<{address: string}>}
 */
async function exportWalletInfo(walletId) {
  try {
    console.log(`Exporting wallet info for wallet ID: ${walletId}`);
    
    // Get wallet information from Privy
    const wallet = await privyClient.wallets.get(walletId);
    
    console.log(`Wallet address: ${wallet.address}`);
    
    return {
      address: wallet.address
    };
  } catch (error) {
    console.error('Error exporting wallet info:', error);
    throw new Error(`Failed to export wallet info: ${error.message}`);
  }
}

/**
 * Transfer SOL to another wallet
 * @param {string} walletId - Privy wallet ID (sender)
 * @param {string} walletAddress - Sender's wallet address
 * @param {string} recipientAddress - Recipient's wallet address
 * @param {number} amount - Amount of SOL to send
 * @param {Connection} connection - Solana connection object
 * @returns {Promise<{success: boolean, signature: string|null, error: string|null}>}
 */
async function transferSOL(walletId, walletAddress, recipientAddress, amount, connection = SOLANA_CONNECTION) {
  try {
    console.log(`\n=== Transferring SOL ===`);
    console.log(`From: ${walletAddress}`);
    console.log(`To: ${recipientAddress}`);
    console.log(`Amount: ${amount} SOL`);
    
    // Validate addresses
    let fromPubkey, toPubkey;
    try {
      fromPubkey = new PublicKey(walletAddress);
      toPubkey = new PublicKey(recipientAddress);
    } catch (error) {
      throw new Error('Invalid wallet address format');
    }
    
    // Check if recipient address is valid
    if (!PublicKey.isOnCurve(toPubkey.toBytes())) {
      throw new Error('Invalid recipient address');
    }
    
    // Check balance
    const balance = await connection.getBalance(fromPubkey);
    const amountLamports = Math.floor(amount * LAMPORTS_PER_SOL);
    
    // Reserve 0.001 SOL for transaction fee
    const feeReserve = 0.001 * LAMPORTS_PER_SOL;
    
    if (balance < amountLamports + feeReserve) {
      throw new Error(`Insufficient balance. You have ${balance / LAMPORTS_PER_SOL} SOL, need ${amount + 0.001} SOL (including fee)`);
    }
    
    // Import SystemProgram for transfer instruction
    const { SystemProgram } = require('@solana/web3.js');
    
    // Create transfer instruction
    const transferInstruction = SystemProgram.transfer({
      fromPubkey: fromPubkey,
      toPubkey: toPubkey,
      lamports: amountLamports
    });
    
    // Create transaction
    const transaction = new Transaction().add(transferInstruction);
    transaction.feePayer = fromPubkey;
    
    // Sign and send transaction
    console.log('Signing and sending SOL transfer...');
    const signature = await signAndSendTransaction(walletId, transaction, connection);
    
    console.log(`✅ SOL transfer successful: ${signature}`);
    
    return {
      success: true,
      signature: signature,
      error: null
    };
  } catch (error) {
    console.error('❌ SOL transfer failed:', error.message);
    return {
      success: false,
      signature: null,
      error: error.message
    };
  }
}

/**
 * Transfer USDC to another wallet
 * @param {string} walletId - Privy wallet ID (sender)
 * @param {string} walletAddress - Sender's wallet address
 * @param {string} recipientAddress - Recipient's wallet address
 * @param {number} amount - Amount of USDC to send
 * @param {Connection} connection - Solana connection object
 * @returns {Promise<{success: boolean, signature: string|null, error: string|null}>}
 */
async function transferUSDC(walletId, walletAddress, recipientAddress, amount, connection = SOLANA_CONNECTION) {
  try {
    console.log(`\n=== Transferring USDC ===`);
    console.log(`From: ${walletAddress}`);
    console.log(`To: ${recipientAddress}`);
    console.log(`Amount: ${amount} USDC`);
    
    // Validate addresses
    let fromPubkey, toPubkey;
    try {
      fromPubkey = new PublicKey(walletAddress);
      toPubkey = new PublicKey(recipientAddress);
    } catch (error) {
      throw new Error('Invalid wallet address format');
    }
    
    // Check if recipient address is valid
    if (!PublicKey.isOnCurve(toPubkey.toBytes())) {
      throw new Error('Invalid recipient address');
    }
    
    // Import SPL Token functions
    const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, createTransferInstruction } = require('@solana/spl-token');
    
    const usdcMint = new PublicKey(USDC_MINT);
    
    // Get sender's USDC token account
    const fromTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      fromPubkey
    );
    
    // Check sender's USDC balance
    const fromAccountInfo = await connection.getAccountInfo(fromTokenAccount);
    if (!fromAccountInfo) {
      throw new Error('You do not have a USDC token account. Get some USDC first.');
    }
    
    const fromBalance = fromAccountInfo.data.readBigUInt64LE(64);
    const amountMicroUnits = Math.floor(amount * 1_000_000); // USDC has 6 decimals
    
    if (fromBalance < amountMicroUnits) {
      throw new Error(`Insufficient USDC balance. You have ${Number(fromBalance) / 1_000_000} USDC, need ${amount} USDC`);
    }
    
    // Get recipient's USDC token account
    const toTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      toPubkey
    );
    
    // Check if recipient has a USDC token account
    const toAccountInfo = await connection.getAccountInfo(toTokenAccount);
    
    // Create transaction
    const transaction = new Transaction();
    transaction.feePayer = fromPubkey;
    
    // If recipient doesn't have a USDC token account, create it
    if (!toAccountInfo) {
      console.log('Recipient does not have a USDC token account. Creating one...');
      const createAccountInstruction = createAssociatedTokenAccountInstruction(
        fromPubkey, // payer
        toTokenAccount, // associated token account
        toPubkey, // owner
        usdcMint // mint
      );
      transaction.add(createAccountInstruction);
    }
    
    // Add transfer instruction
    const transferInstruction = createTransferInstruction(
      fromTokenAccount, // source
      toTokenAccount, // destination
      fromPubkey, // owner
      amountMicroUnits // amount
    );
    transaction.add(transferInstruction);
    
    // Sign and send transaction
    console.log('Signing and sending USDC transfer...');
    const signature = await signAndSendTransaction(walletId, transaction, connection);
    
    console.log(`✅ USDC transfer successful: ${signature}`);
    
    return {
      success: true,
      signature: signature,
      error: null
    };
  } catch (error) {
    console.error('❌ USDC transfer failed:', error.message);
    return {
      success: false,
      signature: null,
      error: error.message
    };
  }
}

// Export functions and connection
module.exports = {
  createSolanaWallet,
  getWalletBalance,
  signAndSendTransaction,
  exportWalletInfo,
  transferSOL,
  transferUSDC,
  SOLANA_CONNECTION
};
