import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { TCG_STORAGE_KEY, type TCGId } from '@/constants/tcgs';

interface TCGState {
  tcg: TCGId | null;
  ready: boolean;
  setTcg: (id: TCGId) => Promise<void>;
}

export const [TCGProvider, useTCG] = createContextHook((): TCGState => {
  const [tcg, setTcgState] = useState<TCGId | null>(null);
  const [ready, setReady] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(TCG_STORAGE_KEY);
        if (mounted && stored) setTcgState(stored as TCGId);
      } catch (e) {
        console.log('[TCG] load error', e);
      } finally {
        if (mounted) setReady(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const setTcg = useCallback(async (id: TCGId): Promise<void> => {
    try {
      await AsyncStorage.setItem(TCG_STORAGE_KEY, id);
      setTcgState(id);
    } catch (e) {
      console.log('[TCG] save error', e);
    }
  }, []);

  return { tcg, ready, setTcg };
});
