import { formatDuration } from '../utils/format';
import './StatsBar.css';

interface StatsBarProps {
  elapsedMs: number;
  moves: number;
  progress: number; // 0..1
  paused: boolean;
}

export function StatsBar({ elapsedMs, moves, progress, paused }: StatsBarProps) {
  return (
    <div className="stats-bar" aria-live="off">
      <div className="stats-bar__item">
        <span className="stats-bar__label">Time</span>
        <span className="stats-bar__value">{paused ? '⏸ Paused' : formatDuration(elapsedMs)}</span>
      </div>
      <div className="stats-bar__progress">
        <div className="stats-bar__track">
          <div className="stats-bar__fill" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <span className="stats-bar__percent">{Math.round(progress * 100)}%</span>
      </div>
      <div className="stats-bar__item stats-bar__item--right">
        <span className="stats-bar__label">Moves</span>
        <span className="stats-bar__value">{moves}</span>
      </div>
    </div>
  );
}
