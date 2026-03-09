// Load environment variables
require('dotenv').config();

// Import database and bot
const { initDB } = require('./src/db');
const bot = require('./src/bot');

// Get network from environment
const NETWORK = process.env.NETWORK || 'devnet';

// Startup banner
console.log('╔═══════════════════════════════════════╗');
console.log('║   🤖 SolanaAgent Wallet Bot           ║');
console.log(`║   Network: ${NETWORK.padEnd(28)}║`);
console.log('║   Status: Starting...                  ║');
console.log('╚═══════════════════════════════════════╝');
console.log('');

// Initialize database
console.log('📊 Initializing database...');
initDB();
console.log('✅ Database initialized');
console.log('');

// Launch bot
console.log('🚀 Launching Telegram bot...');
bot.launch()
  .then(() => {
    console.log('✅ Bot is running! Open Telegram and search for your bot.');
    console.log('');
    console.log('Press Ctrl+C to stop the bot');
    console.log('');
  })
  .catch((error) => {
    console.error('❌ Failed to start bot:', error.message);
    process.exit(1);
  });

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('');
  console.error('❌ Uncaught Exception:', error.message);
  console.error('Stack:', error.stack);
  console.error('');
  console.error('Bot will attempt to continue running...');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('');
  console.error('❌ Unhandled Promise Rejection:', reason);
  console.error('Promise:', promise);
  console.error('');
  console.error('Bot will attempt to continue running...');
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('');
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  bot.stop('SIGINT');
  console.log('✅ Bot stopped successfully');
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('');
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  bot.stop('SIGTERM');
  console.log('✅ Bot stopped successfully');
  process.exit(0);
});
