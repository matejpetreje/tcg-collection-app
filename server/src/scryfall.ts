import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { config } from './config.js';

const BULK_LIST_URL = 'https://api.scryfall.com/bulk-data';

export interface ScryfallBulkMeta {
  id: string;
  type: string;
  updated_at: string;
  jsonl_download_uri?: string;
  download_uri?: string;
  compressed_size?: number;
  size?: number;
  content_type?: string;
  content_encoding?: string;
}

interface ScryfallBulkList {
  object: 'list';
  data: ScryfallBulkMeta[];
}

function headers(): Record<string, string> {
  return {
    Accept: 'application/json;q=0.9,*/*;q=0.8',
    'User-Agent': config.scryfallUserAgent,
  };
}

export async function getDefaultCardsBulkMeta(): Promise<ScryfallBulkMeta> {
  const response = await fetch(BULK_LIST_URL, { headers: headers() });
  if (!response.ok) throw new Error(`Scryfall bulk metadata HTTP ${response.status}`);

  const list = await response.json() as ScryfallBulkList;
  const meta = list.data.find(item => item.type === 'default_cards');
  if (!meta) throw new Error('Scryfall default_cards bulk dataset was not found');

  if (!meta.jsonl_download_uri && !meta.download_uri) {
    throw new Error('Scryfall default_cards metadata has no download URI');
  }

  return meta;
}

export async function downloadBulkFile(meta: ScryfallBulkMeta): Promise<string> {
  const url = meta.jsonl_download_uri ?? meta.download_uri;
  if (!url) throw new Error('Scryfall bulk download URL is missing');

  const dir = path.join(config.dataDir, 'bulk');
  fs.mkdirSync(dir, { recursive: true });

  const isJsonlGzip = !!meta.jsonl_download_uri;
  const finalPath = path.join(
    dir,
    isJsonlGzip ? 'scryfall-default-cards.jsonl.gz' : 'scryfall-default-cards.json'
  );
  const tempPath = `${finalPath}.part`;

  console.log(`[MTG Server] Downloading Scryfall bulk from ${url}`);

  const response = await fetch(url, { headers: headers() });
  if (!response.ok || !response.body) {
    throw new Error(`Scryfall bulk download HTTP ${response.status}`);
  }

  await pipeline(response.body as never, fs.createWriteStream(tempPath));
  fs.renameSync(tempPath, finalPath);
  return finalPath;
}
