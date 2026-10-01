import './db.js';
import { syncMtgCatalog } from './mtg-sync.js';

const force = process.argv.includes('--force');

syncMtgCatalog(force)
  .then(result => {
    console.log('[MTG Server] Sync result:', result);
    process.exit(0);
  })
  .catch(error => {
    console.error('[MTG Server] Sync failed:', error);
    process.exit(1);
  });
