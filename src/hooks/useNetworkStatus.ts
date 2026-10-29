import { useEffect, useState } from 'react';

const isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;

export function useNetworkStatus(): boolean {
  const [online, setOnline] = useState(isOnline);
  useEffect(() => {
    const check = () => setOnline(isOnline());
    window.addEventListener('online', check);
    window.addEventListener('offline', check);
    window.addEventListener('focus', check);
    document.addEventListener('resume', check);
    return () => {
      window.removeEventListener('online', check);
      window.removeEventListener('offline', check);
      window.removeEventListener('focus', check);
      document.removeEventListener('resume', check);
    };
  }, []);
  return online;
}
