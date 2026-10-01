import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';
import createContextHook from '@nkzw/create-context-hook';
import { useQueryClient } from '@tanstack/react-query';
import { getDatabase, closeDatabase, closeAllDatabases, initializeTables, checkCatalogExists, getCardCount, syncCardsFromApi } from '@/utils/database';
import { useTCG } from '@/providers/TCGProvider';
import type { TCGId } from '@/constants/tcgs';

interface DatabaseState {
  db: SQLite.SQLiteDatabase | null;
  isReady: boolean;
  hasCatalog: boolean;
  catalogCount: number;
  isSyncing: boolean;
  syncProgress: { current: number; total: number } | null;
  lastSync: string | null;
  tcg: TCGId | null;
  syncCards: () => Promise<number>;
  refreshCatalog: () => Promise<void>;
}

export const [DatabaseProvider, useDatabase] = createContextHook((): DatabaseState => {
  const { tcg, ready: tcgReady } = useTCG();
  const queryClient = useQueryClient();
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [hasCatalog, setHasCatalog] = useState<boolean>(false);
  const [catalogCount, setCatalogCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncProgress, setSyncProgress] = useState<{ current: number; total: number } | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const activeTcgRef = useRef<TCGId | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const releaseWebDatabases = () => {
      void closeAllDatabases();
    };

    // Best-effort cleanup for Expo SQLite's exclusive OPFS access handles.
    // This reduces stale locks after reloads, tab closes and Fast Refresh.
    window.addEventListener('pagehide', releaseWebDatabases);
    window.addEventListener('beforeunload', releaseWebDatabases);

    return () => {
      window.removeEventListener('pagehide', releaseWebDatabases);
      window.removeEventListener('beforeunload', releaseWebDatabases);
    };
  }, []);

  useEffect(() => {
    if (!tcgReady) return;
    if (!tcg) {
      setIsReady(true);
      setDb(null);
      setHasCatalog(false);
      setCatalogCount(0);
      return;
    }
    let mounted = true;
    const previousTcg = activeTcgRef.current;
    activeTcgRef.current = tcg;

    // Never expose the previous game's database/catalog while the selected TCG is changing.
    setIsReady(false);
    setDb(null);
    setHasCatalog(false);
    setCatalogCount(0);
    setSyncProgress(null);
    void queryClient.invalidateQueries();
    (async () => {
      try {
        // expo-sqlite web uses an exclusive OPFS access handle. Release the
        // previous game's handle before opening the next database so a later
        // web reload cannot collide with stale handles.
        if (previousTcg && previousTcg !== tcg) {
          await queryClient.cancelQueries();
          await closeDatabase(previousTcg);
        }

        console.log(`[Provider] Initializing database for TCG=${tcg}...`);
        const database = await getDatabase(tcg);
        if (!mounted) return;
        setDb(database);

        await initializeTables(database);

        const catalogExists = await checkCatalogExists(database);
        if (!mounted) return;
        setHasCatalog(catalogExists);

        if (catalogExists) {
          const count = await getCardCount(database);
          if (!mounted) return;
          setCatalogCount(count);
        } else {
          setCatalogCount(0);
        }

        try {
          const setting = await database.getFirstAsync<{ value: string }>(
            "SELECT value FROM app_settings WHERE key = 'last_sync'"
          );
          if (mounted) setLastSync(setting?.value ?? null);
        } catch {
          if (mounted) setLastSync(null);
        }

        if (!catalogExists && mounted) {
          console.log(`[Provider] No catalog for ${tcg}, starting initial sync...`);
          setIsSyncing(true);
          try {
            const count = await syncCardsFromApi(database, (current, total) => {
              if (mounted) setSyncProgress({ current, total });
            }, tcg);
            if (mounted) {
              setHasCatalog(count > 0);
              setCatalogCount(count);
              setLastSync(count > 0 ? new Date().toISOString() : null);
              await queryClient.invalidateQueries();
              console.log(`[Provider] Initial sync completed for ${tcg}: ${count} cards`);
            }
          } catch (syncError) {
            console.error('[Provider] Initial sync failed:', syncError);
          } finally {
            if (mounted) {
              setIsSyncing(false);
              setSyncProgress(null);
            }
          }
        }

        if (mounted) {
          setIsReady(true);
          console.log(`[Provider] Database ready for ${tcg}. Catalog:`, catalogExists || await checkCatalogExists(database));
        }
      } catch (error) {
        console.error('[Provider] Database init error:', error);
        if (mounted) setIsReady(true);
      }
    })();

    return () => { mounted = false; };
  }, [tcg, tcgReady]);

  const syncCards = useCallback(async (): Promise<number> => {
    if (!db) throw new Error('Database not ready');
    if (!tcg) throw new Error('No TCG selected');
    setIsSyncing(true);
    setSyncProgress(null);
    try {
      const count = await syncCardsFromApi(db, (current, total) => {
        setSyncProgress({ current, total });
      }, tcg);
      setHasCatalog(true);
      setCatalogCount(count);
      setLastSync(new Date().toISOString());
      return count;
    } finally {
      setIsSyncing(false);
      setSyncProgress(null);
    }
  }, [db, tcg]);

  const refreshCatalog = useCallback(async () => {
    if (!db) return;
    const exists = await checkCatalogExists(db);
    setHasCatalog(exists);
    if (exists) {
      const count = await getCardCount(db);
      setCatalogCount(count);
    }
  }, [db]);

  return { db, isReady, hasCatalog, catalogCount, isSyncing, syncProgress, lastSync, tcg, syncCards, refreshCatalog };
});
