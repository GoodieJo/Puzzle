import './Toolbar.css';

interface ToolbarProps {
  onShuffle: () => void;
  onAutoArrange: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onTogglePreview: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  onTogglePause: () => void;
  paused: boolean;
  onRestart: () => void;
  showGhost: boolean;
  onToggleGhost: () => void;
  allowRotation: boolean;
  onRotate: () => void;
  rotateEnabled: boolean;
}

export function Toolbar({
  onShuffle,
  onAutoArrange,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onTogglePreview,
  onToggleFullscreen,
  isFullscreen,
  onTogglePause,
  paused,
  onRestart,
  showGhost,
  onToggleGhost,
  allowRotation,
  onRotate,
  rotateEnabled,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar__row">
        <ToolButton label="Shuffle" onClick={onShuffle}>
          <path d="M16 3h5v5M21 3L14 10M8 21H3v-5M3 21l7-7M21 16v5h-5M21 21l-7-7M3 8V3h5M3 3l7 7" />
        </ToolButton>
        <ToolButton label="Auto-arrange" onClick={onAutoArrange}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </ToolButton>
        <ToolButton label="Ghost preview" onClick={onToggleGhost} active={showGhost}>
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </ToolButton>
        <ToolButton label="Full preview" onClick={onTogglePreview}>
          <rect x="3" y="3" width="18" height="14" rx="2" />
          <path d="M3 17l5-5 4 3 5-6 4 4" />
        </ToolButton>
        {allowRotation && (
          <ToolButton label="Rotate piece" onClick={onRotate} disabled={!rotateEnabled}>
            <path d="M4 9a8 8 0 1114.93 4.5M4 9V4M4 9h5" />
          </ToolButton>
        )}
      </div>
      <div className="toolbar__row">
        <ToolButton label="Zoom out" onClick={onZoomOut}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3M8 11h6" />
        </ToolButton>
        <ToolButton label="Reset zoom" onClick={onResetZoom}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </ToolButton>
        <ToolButton label="Zoom in" onClick={onZoomIn}>
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
        </ToolButton>
        <ToolButton label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={onToggleFullscreen}>
          <path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3" />
        </ToolButton>
        <ToolButton label={paused ? 'Resume' : 'Pause'} onClick={onTogglePause}>
          {paused ? <path d="M6 4l14 8-14 8V4z" /> : (
            <>
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </>
          )}
        </ToolButton>
        <ToolButton label="Restart" onClick={onRestart}>
          <path d="M3 12a9 9 0 1 1 2.64 6.36M3 12V6m0 6h6" />
        </ToolButton>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
  active,
  disabled,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={active ? 'tool-btn is-active' : 'tool-btn'}
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}
