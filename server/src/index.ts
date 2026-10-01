import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { db } from './db.js';
import { mtgCards, mtgVersion } from './catalog.js';
import { isMtgSyncRunning, syncMtgCatalog } from './mtg-sync.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const imageDir = path.join(config.dataDir, 'images');
fs.mkdirSync(imageDir, { recursive: true });
app.use('/images', express.static(imageDir, {
  immutable: true,
  maxAge: '30d',
}));

app.get('/health', (_req, res) => {
  res.json({ ok: true, mtg_sync_running: isMtgSyncRunning() });
});

app.get('/catalog/mtg/version', mtgVersion);
app.get('/catalog/mtg/cards', mtgCards);

app.post('/admin/sync/mtg', async (req, res) => {
  if (config.adminToken && req.header('authorization') !== `Bearer ${config.adminToken}`) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  try {
    const result = await syncMtgCatalog(req.query.force === '1');
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

app.listen(config.port, () => {
  console.log(`[Server] Catalog server listening on ${config.publicBaseUrl}`);
  const mtgCount = (db.prepare('SELECT COUNT(*) as count FROM mtg_cards').get() as { count: number }).count;
  console.log(`[Server] MTG oracle cards: ${mtgCount}`);

  if (config.autoSyncMtg) {
    void syncMtgCatalog(false).catch(error => {
      console.error('[Server] Automatic MTG sync failed:', error);
    });
  }
});
