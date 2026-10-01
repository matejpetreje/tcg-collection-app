import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { config } from './config.js';

const BULK_META_URL = 'https://api.scryfall.com/bulk-data/default-cards';

export interface ScryfallBulkMeta {
  id: string;
  type: string;
  updated_at: string;
  download_uri: string;
  size: number;
  content_type: string;
  content_encoding: string;
}

function headers(): Record<string, string> {
  return {
    Accept: 'application/json;q=0.9,*/*;q=0.8',
    'User-Agent': config.scryfallUserAgent,
  };
}

export async function getDefaultCardsBulkMeta(): Promise<ScryfallBulkMeta> {
  const response = await fetch(BULK_META_URL, { headers: headers() });
  if (!response.ok) throw new Error(`Scryfall bulk metadata HTTP ${response.status}`);
  return response.json() as Promise<ScryfallBulkMeta>;
}

export async function downloadBulkFile(meta: ScryfallBulkMeta): Promise<string> {
  const dir = path.join(config.dataDir, 'bulk');
  fs.mkdirSync(dir, { recursive: true });
  const finalPath = path.join(dir, 'scryfall-default-cards.json');
  const tempPath = `${finalPath}.part`;

  const response = await fetch(meta.download_uri, { headers: headers() });
  if (!response.ok || !response.body) {
    throw new Error(`Scryfall bulk download HTTP ${response.status}`);
  }

  await pipeline(response.body as never, fs.createWriteStream(tempPath));
  fs.renameSync(tempPath, finalPath);
  return finalPath;
}
