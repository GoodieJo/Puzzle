import { useState } from 'react';
import { ConfettiCanvas } from './ConfettiCanvas';
import { formatDuration } from '../utils/format';
import './CompletionModal.css';

interface CompletionModalProps {
  open: boolean;
  elapsedMs: number;
  moves: number;
  pieceCount: number;
  title: string;
  onPlayAgain: () => void;
  onHome: () => void;
}

export function CompletionModal({ open, elapsedMs, moves, pieceCount, title, onPlayAgain, onHome }: CompletionModalProps) {
  const [shared, setShared] = useState(false);
  if (!open) return null;

  const shareText = `I just finished "${title}" - a ${pieceCount}-piece jigsaw puzzle in ${formatDuration(elapsedMs)} with ${moves} moves! 🧩`;

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ text: shareText, title: 'Piecewise' });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareText);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch {
      // user cancelled share sheet - nothing to do
    }
  };

  return (
    <div className="completion-modal" role="dialog" aria-modal="true" aria-label="Puzzle complete">
      <ConfettiCanvas />
      <div className="completion-card">
        <span className="completion-card__badge">🧩</span>
        <h2>Puzzle complete!</h2>
        <p className="completion-card__subtitle">{title}</p>

        <div className="completion-stats">
          <div>
            <span className="completion-stats__value">{formatDuration(elapsedMs)}</span>
            <span className="completion-stats__label">Time</span>
          </div>
          <div>
            <span className="completion-stats__value">{moves}</span>
            <span className="completion-stats__label">Moves</span>
          </div>
          <div>
            <span className="completion-stats__value">{pieceCount}</span>
            <span className="completion-stats__label">Pieces</span>
          </div>
        </div>

        <div className="completion-actions">
          <button className="btn btn-primary" onClick={onPlayAgain}>
            Play again
          </button>
          <button className="btn btn-ghost" onClick={handleShare}>
            {shared ? 'Copied!' : 'Share result'}
          </button>
          <button className="btn btn-ghost" onClick={onHome}>
            Back to gallery
          </button>
        </div>
      </div>
    </div>
  );
}
