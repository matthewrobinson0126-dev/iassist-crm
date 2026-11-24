// Send app errors to the database (client_errors table) so problems seen on the iPad can be found and fixed.
// Only the error text, the screen and the app version are sent.
import { CONFIG } from './config.js?v=20261124200421';

export function reportError(err) {
  try {
    if (!CONFIG.supabaseUrl) return;
    fetch(`${CONFIG.supabaseUrl}/rest/v1/client_errors`, {
      method: 'POST', keepalive: true,
      headers: { apikey: CONFIG.supabaseKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ message: String(err?.message || err).slice(0, 2000), stack: String(err?.stack || '').slice(0, 6000),
        page: (location.hash || '/').slice(0, 300), version: new URL(import.meta.url).searchParams.get('v') || '' }),
    }).catch(() => {});
  } catch { /* never break the app */ }
}
