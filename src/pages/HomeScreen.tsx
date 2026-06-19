import { useMemo, useState } from 'react';
import { Header } from '../components/Header';
import { SettingsSheet } from '../components/SettingsSheet';
import { ImageCard } from '../components/ImageCard';
import { BUILT_IN_PUZZLES, CATEGORIES } from '../assets/puzzles/manifest';
import { useApp } from '../store/AppContext';
import type { PuzzleCategory } from '../types/puzzle';
import './HomeScreen.css';

export function HomeScreen() {
  const { goTo, setSelectedImage } = useApp();
  const [category, setCategory] = useState<'All' | PuzzleCategory>('All');
  const [settingsOpen, setSettingsOpen] = useState(false);

  const images = useMemo(
    () => BUILT_IN_PUZZLES.filter((img) => category === 'All' || img.category === category),
    [category]
  );

  return (
    <div className="screen home-screen">
      <Header
        title="Piecewise"
        right={
          <button className="btn btn-icon btn-ghost" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="M19.4 13a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V19a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H4a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h.02A1.65 1.65 0 0011 2.51V2a2 2 0 114 0v.09a1.65 1.65 0 001 1.51h.02a1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V8a1.65 1.65 0 001.51 1H22a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        }
      />

      <div className="home-screen__intro">
        <h2>Pick a scene</h2>
        <p>Solve solo, or play together with friends in real time.</p>
      </div>

      <button className="multiplayer-cta" onClick={() => goTo('lobby')}>
        <span className="multiplayer-cta__icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2"/>
            <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            <path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.87" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </span>
        <span>
          <strong>Play with friends</strong>
          <small>Real-time cooperative multiplayer</small>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="multiplayer-cta__arrow">
          <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      <button className="upload-cta" onClick={() => goTo('upload')}>
        <span className="upload-cta__icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 16V4M12 4l-4 4M12 4l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </span>
        <span>
          <strong>Upload your own photo</strong>
          <small>JPG, PNG, or WebP</small>
        </span>
      </button>

      <div className="chip-row" role="tablist" aria-label="Filter by category">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={category === c}
            className={category === c ? 'chip is-active' : 'chip'}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="gallery-grid">
        {images.map((img) => (
          <ImageCard
            key={img.id}
            image={img}
            onSelect={(selected) => {
              setSelectedImage(selected);
              goTo('difficulty');
            }}
          />
        ))}
      </div>

      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
