declare module 'sql.js/dist/sql-asm.js' {
  interface SqlJsStatement {
    bind(values?: unknown[] | Record<string, unknown>): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }

  interface SqlJsDatabase {
    exec(sql: string): Array<{ columns: string[]; values: unknown[][] }>;
    run(sql: string, params?: unknown[] | Record<string, unknown>): SqlJsDatabase;
    prepare(sql: string, params?: unknown[] | Record<string, unknown>): SqlJsStatement;
    getRowsModified(): number;
    export(): Uint8Array;
    close(): void;
  }

  interface SqlJsModule {
    Database: new (data?: Uint8Array) => SqlJsDatabase;
  }

  export default function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsModule>;
}
