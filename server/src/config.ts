import 'dotenv/config';
import path from 'node:path';

export const config = {
  port: Number(process.env.PORT ?? 8787),
  dataDir: path.resolve(process.env.DATA_DIR ?? './data'),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? 'http://localhost:8787').replace(/\/$/, ''),
  scryfallUserAgent: process.env.SCRYFALL_USER_AGENT ?? 'TCGCollectionCatalog/0.1',
  mtgImageMirror: (process.env.MTG_IMAGE_MIRROR ?? 'thumbnail') as 'none' | 'thumbnail' | 'full',
  mtgImageConcurrency: Math.max(1, Number(process.env.MTG_IMAGE_CONCURRENCY ?? 6)),
  autoSyncMtg: (process.env.AUTO_SYNC_MTG ?? 'false').toLowerCase() === 'true',
  adminToken: process.env.ADMIN_TOKEN ?? '',
};
