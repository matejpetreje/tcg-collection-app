type SqlJsDatabase = {
  exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
  run(sql: string, params?: unknown[] | Record<string, unknown>): SqlJsDatabase;
  prepare(sql: string, params?: unknown[] | Record<string, unknown>): {
    bind(values?: unknown[] | Record<string, unknown>): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  };
  getRowsModified(): number;
  export(): Uint8Array;
  close(): void;
};

type SqlJsModule = {
  Database: new (data?: Uint8Array) => SqlJsDatabase;
};

interface WebRunResult {
  lastInsertRowId: number;
  changes: number;
}

const DB_NAME = 'tcg-collection-web-sqlite';
const STORE_NAME = 'databases';
const DB_VERSION = 1;

let sqlModulePromise: Promise<SqlJsModule> | null = null;

async function getSqlModule(): Promise<SqlJsModule> {
  if (!sqlModulePromise) {
    sqlModulePromise = import('sql.js/dist/sql-asm.js').then(async (mod: any) => {
      const initSqlJs = mod.default ?? mod;
      return await initSqlJs();
    });
  }
  return sqlModulePromise;
}

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open IndexedDB.'));
  });
}

async function readPersisted(name: string): Promise<Uint8Array | null> {
  const database = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(name);
      request.onsuccess = () => {
        const value = request.result;
        if (!value) {
          resolve(null);
          return;
        }
        if (value instanceof ArrayBuffer) {
          resolve(new Uint8Array(value));
          return;
        }
        if (ArrayBuffer.isView(value)) {
          resolve(new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)));
          return;
        }
        resolve(null);
      };
      request.onerror = () => reject(request.error ?? new Error('Could not read web database.'));
    });
  } finally {
    database.close();
  }
}

async function writePersisted(name: string, bytes: Uint8Array): Promise<void> {
  const database = await openStore();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not save web database.'));
      tx.onabort = () => reject(tx.error ?? new Error('Web database save was aborted.'));
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      tx.objectStore(STORE_NAME).put(copy, name);
    });
  } finally {
    database.close();
  }
}

function normalizeParams(params?: unknown[] | Record<string, unknown>): unknown[] | Record<string, unknown> | undefined {
  if (!params) return undefined;
  return params;
}

export class WebSqliteDatabase {
  private db: SqlJsDatabase;
  private readonly name: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private transactionDepth = 0;
  private dirty = false;

  private constructor(name: string, db: SqlJsDatabase) {
    this.name = name;
    this.db = db;
  }

  static async open(name: string): Promise<WebSqliteDatabase> {
    const SQL = await getSqlModule();
    const persisted = await readPersisted(name);
    const db = persisted?.length ? new SQL.Database(persisted) : new SQL.Database();
    const instance = new WebSqliteDatabase(name, db);
    instance.db.exec('PRAGMA foreign_keys = ON;');
    console.log(`[DB:web] ${name} opened from IndexedDB`);
    return instance;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error(`Web database ${this.name} is closed`);
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.transactionDepth > 0) return;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persist().catch(error => {
        console.error(`[DB:web] Failed to persist ${this.name}:`, error);
      });
    }, 1200);
  }

  private async persist(): Promise<void> {
    if (this.closed || !this.dirty) return;
    const bytes = this.db.export();
    await writePersisted(this.name, bytes);
    this.dirty = false;
  }

  async execAsync(sql: string): Promise<void> {
    this.assertOpen();
    this.db.exec(sql);
    this.markDirty();
  }

  async runAsync(
    sql: string,
    params: unknown[] | Record<string, unknown> = []
  ): Promise<WebRunResult> {
    this.assertOpen();
    this.db.run(sql, normalizeParams(params));
    const changes = this.db.getRowsModified();
    let lastInsertRowId = 0;
    const rows = this.db.exec('SELECT last_insert_rowid() AS id');
    const value = rows[0]?.values?.[0]?.[0];
    if (typeof value === 'number') lastInsertRowId = value;
    else if (typeof value === 'bigint') lastInsertRowId = Number(value);
    this.markDirty();
    return { lastInsertRowId, changes };
  }

  async getAllAsync<T>(
    sql: string,
    params: unknown[] | Record<string, unknown> = []
  ): Promise<T[]> {
    this.assertOpen();
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(normalizeParams(params));
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  }

  async getFirstAsync<T>(
    sql: string,
    params: unknown[] | Record<string, unknown> = []
  ): Promise<T | null> {
    this.assertOpen();
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(normalizeParams(params));
      return stmt.step() ? (stmt.getAsObject() as T) : null;
    } finally {
      stmt.free();
    }
  }

  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.assertOpen();
    const outermost = this.transactionDepth === 0;
    if (outermost) this.db.exec('BEGIN;');
    this.transactionDepth++;
    try {
      await task();
      this.transactionDepth--;
      if (outermost) {
        this.db.exec('COMMIT;');
        this.markDirty();
        await this.persist();
      }
    } catch (error) {
      this.transactionDepth = Math.max(0, this.transactionDepth - 1);
      if (outermost) {
        try {
          this.db.exec('ROLLBACK;');
        } catch {}
      }
      throw error;
    }
  }

  async withExclusiveTransactionAsync(task: (db: WebSqliteDatabase) => Promise<void>): Promise<void> {
    await this.withTransactionAsync(() => task(this));
  }

  async closeAsync(): Promise<void> {
    if (this.closed) return;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.persist();
    this.db.close();
    this.closed = true;
    console.log(`[DB:web] Closed ${this.name}`);
  }

  closeSync(): void {
    if (this.closed) return;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.dirty) {
      const bytes = this.db.export();
      this.dirty = false;
      void writePersisted(this.name, bytes).catch(error => {
        console.error(`[DB:web] Failed to persist ${this.name} during close:`, error);
      });
    }
    this.db.close();
    this.closed = true;
    console.log(`[DB:web] Closed ${this.name} (sync)`);
  }
}

export async function openWebDatabase(name: string): Promise<WebSqliteDatabase> {
  return WebSqliteDatabase.open(name);
}
