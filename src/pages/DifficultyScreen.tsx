import { useEffect } from 'react';
import { useApp } from '../store/AppContext';
import { Header } from '../components/Header';
import { DIFFICULTY_OPTIONS, pieceCount } from '../utils/difficulty';
import { seedFromString } from '../engine/rng';
import type { PuzzleConfig } from '../types/puzzle';
import './DifficultyScreen.css';

const LABEL_CLASS: Record<string, string> = {
  Easy: 'diff-pill diff-pill--easy',
  Medium: 'diff-pill diff-pill--medium',
  Hard: 'diff-pill diff-pill--hard',
  Expert: 'diff-pill diff-pill--expert',
};

export function DifficultyScreen() {
  const { goTo, selectedImage, setConfig, settings } = useApp();

  useEffect(() => {
    if (!selectedImage) goTo('home');
  }, [selectedImage, goTo]);

  if (!selectedImage) {
    return null;
  }

  const start = (rows: number, cols: number) => {
    const config: PuzzleConfig = {
      imageId: selectedImage.id,
      imageSrc: selectedImage.src,
      rows,
      cols,
      pieceStyle: settings.pieceStyle,
      allowRotation: settings.allowRotation,
      aspect: selectedImage.aspect,
      seed: seedFromString(`${selectedImage.id}:${rows}x${cols}`),
    };
    setConfig(config);
    goTo('workspace');
  };

  return (
    <div className="screen difficulty-screen">
      <Header title="Choose difficulty" onBack={() => goTo(selectedImage.builtIn ? 'home' : 'upload')} />

      <div className="difficulty-screen__preview">
        <img src={selectedImage.thumb} alt="" />
        <div>
          <strong>{selectedImage.title}</strong>
          <span>{selectedImage.category}</span>
        </div>
      </div>

      <div className="difficulty-grid">
        {DIFFICULTY_OPTIONS.map((opt) => (
          <button key={`${opt.rows}x${opt.cols}`} className="difficulty-card" onClick={() => start(opt.rows, opt.cols)}>
            <span className="difficulty-card__count">{pieceCount(opt)}</span>
            <span className="difficulty-card__grid">
              {opt.rows} × {opt.cols}
            </span>
            <span className={LABEL_CLASS[opt.label]}>{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
