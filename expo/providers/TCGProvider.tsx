import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { TCG_STORAGE_KEY, TCGS, type TCGId } from '@/constants/tcgs';

interface TCGState {
  tcg: TCGId | null;
  ready: boolean;
  setTcg: (id: TCGId) => Promise<void>;
}

function isTCGId(value: string | null): value is TCGId {
  return !!value && TCGS.some((game) => game.id === value);
}

export const [TCGProvider, useTCG] = createContextHook((): TCGState => {
  // Keep the selected game in memory immediately. AsyncStorage is persistence,
  // not the source of truth while the app is running.
  const [tcg, setTcgState] = useState<TCGId | null>(null);
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(TCG_STORAGE_KEY);
        if (mounted && isTCGId(stored)) {
          setTcgState(stored);
          console.log(`[TCG] Restored selected game: ${stored}`);
        }
      } catch (e) {
        console.log('[TCG] load error', e);
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const setTcg = useCallback(async (id: TCGId): Promise<void> => {
    // Update React first so every provider/screen sees the same TCG in this render cycle.
    setTcgState(id);
    console.log(`[TCG] Selected game: ${id}`);
    try {
      await AsyncStorage.setItem(TCG_STORAGE_KEY, id);
    } catch (e) {
      console.log('[TCG] save error', e);
      // Do not roll the UI back to another game just because persistence failed.
    }
  }, []);

  return { tcg, ready, setTcg };
});
