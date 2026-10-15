import { useEffect, useRef } from 'react';

/**
 * Anything that emits the meter level (0 to 1, on a decibel scale calibrated for speech);
 * returns the function that stops listening.
 */
export interface LevelFeed {
  onLevel(listener: (level: number) => void): () => void;
}

interface LevelMeterProps {
  feed: LevelFeed | null;
  bars: number;
  className?: string;
}

const QUIET = 0.15;

/**
 * Height of a bar, 0.15 to 1, for a level already on the meter's speech scale: the middle
 * bars rise higher than the edges.
 */
export function barScale(level: number, index: number, count: number): number {
  const shape = 0.6 + 0.4 * Math.sin((Math.PI * (index + 0.5)) / count);
  return Math.min(1, QUIET + (1 - QUIET) * level * shape);
}

// Ten updates a second go straight to the bars through refs, never through React state.
export function LevelMeter({ feed, bars, className = '' }: LevelMeterProps) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    if (!feed) return;
    return feed.onLevel((level) => {
      refs.current.forEach((bar, index) => {
        if (bar) bar.style.transform = `scaleY(${barScale(level, index, bars).toFixed(3)})`;
      });
    });
  }, [feed, bars]);

  return (
    <span className={`level-meter ${className}`} aria-hidden="true" data-testid="level-meter">
      {Array.from({ length: bars }, (_, index) => (
        <span
          key={index}
          className="level-meter-bar"
          ref={(element) => {
            refs.current[index] = element;
          }}
        />
      ))}
    </span>
  );
}
