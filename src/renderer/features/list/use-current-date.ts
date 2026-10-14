import { useEffect, useState } from 'react';

/** The current date, refreshed every minute and when the window wakes so « Aujourd’hui » rolls over at midnight. */
export function useCurrentDate(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = setInterval(refresh, intervalMs);
    // A sleeping laptop stops the timer but not the clock.
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [intervalMs]);
  return now;
}
