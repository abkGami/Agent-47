/**
 * Agent-47 Dashboard — Runtime Configuration
 *
 * API_BASE: The public URL of your API server (where the Telegram bot runs).
 *
 * Local development:  leave as '' (empty string) — requests go to the same origin.
 * Vercel deployment:  set to the full URL of your server, e.g.:
 *   window.API_BASE = 'https://your-vps-ip:4747';
 *   window.API_BASE = 'https://api.yourdomain.com';
 *
 * After editing, redeploy to Vercel.
 */
// window.API_BASE = 'http://agent-47.railway.internal:4747';
window.API_BASE = 'https://agent-47-production.up.railway.app';
