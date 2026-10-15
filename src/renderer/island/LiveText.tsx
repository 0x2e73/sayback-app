import type { IslandLiveSnapshot, LiveTrack, LiveUnavailableReason } from '../../shared/live';
import { liveTurns } from './live-text';

const TRACKS: Record<LiveTrack, string> = { microphone: 'Toi', system: 'Les autres' };

const UNAVAILABLE: Record<LiveUnavailableReason, string> = {
  'no-model': 'Texte en direct indisponible : aucun modèle local',
  'no-binary': 'Texte en direct indisponible',
  'engine-failed': 'Texte en direct indisponible',
  'port-conflict': 'Texte en direct coupé par sécurité',
};

interface LiveTextProps {
  /** Null until the first snapshot; never called with the text turned off. */
  live: IslandLiveSnapshot | null;
}

/** The latest turns anchored at the bottom, the older ones fading out at the top. */
export function LiveText({ live }: LiveTextProps) {
  if (live?.enabled && live.availability.state === 'unavailable') {
    return <p className="island-live-status">{UNAVAILABLE[live.availability.reason]}</p>;
  }
  const turns = live?.enabled ? liveTurns(live.segments) : [];
  if (turns.length === 0) return <p className="island-live-waiting">En attente de parole…</p>;
  return (
    <section className="island-live" aria-label="Texte en direct">
      <div className="island-live-turns">
        {turns.map((turn) => (
          <p key={turn.key} className="island-live-turn">
            <span className="island-live-track">{TRACKS[turn.track]}</span>
            {turn.text}
          </p>
        ))}
      </div>
    </section>
  );
}
