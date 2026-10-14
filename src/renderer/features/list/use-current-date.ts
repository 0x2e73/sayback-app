import { useEffect, useState } from 'react';

/** The current date, refreshed every minute so « Aujourd’hui » rolls over at midnight. */
export function useCurrentDate(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
