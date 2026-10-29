import { useEffect, useState } from 'react';
import { getTodayLocal } from '../lib/periodDayCache';

/** Recheck on resume as mobile WebViews suspend timers while backgrounded. */
export function useLocalDay(): string {
  const [day, setDay] = useState(getTodayLocal);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      clearTimeout(timer);
      setDay(getTodayLocal());
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      timer = setTimeout(check, midnight.getTime() - now.getTime() + 100);
    };
    check();
    window.addEventListener('focus', check);
    window.addEventListener('pageshow', check);
    document.addEventListener('visibilitychange', check);
    document.addEventListener('resume', check);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', check);
      window.removeEventListener('pageshow', check);
      document.removeEventListener('visibilitychange', check);
      document.removeEventListener('resume', check);
    };
  }, []);
  return day;
}
