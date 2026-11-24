import { useEffect, useState } from 'react';
import { subscribeNativeNetworkStatus } from '../utils/nativeAndroid';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    const unsubscribeNative = subscribeNativeNetworkStatus((online) => {
      setIsOnline(online);
    });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      unsubscribeNative();
    };
  }, []);

  return isOnline;
}
