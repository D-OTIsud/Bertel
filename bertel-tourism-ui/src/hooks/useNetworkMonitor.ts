import { useEffect } from 'react';
import { useUiStore } from '../store/ui-store';

export function useNetworkMonitor() {
  const setNetworkStatus = useUiStore((state) => state.setNetworkStatus);

  useEffect(() => {
    const sync = () => {
      setNetworkStatus(navigator.onLine ? 'connected' : 'offline');
    };

    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);

    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, [setNetworkStatus]);
}