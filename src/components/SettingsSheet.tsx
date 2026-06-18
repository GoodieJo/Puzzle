import { useApp } from '../store/AppContext';
import './SettingsSheet.css';

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const { settings, updateSettings } = useApp();
  if (!open) return null;

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet__handle" />
        <h2 className="sheet__title">Settings</h2>

        <div className="sheet__row">
          <span>Dark mode</span>
          <Toggle
            checked={settings.theme === 'dark'}
            onChange={(v) => updateSettings({ theme: v ? 'dark' : 'light' })}
            label="Dark mode"
          />
        </div>

        <div className="sheet__row">
          <span>High contrast</span>
          <Toggle
            checked={settings.highContrast}
            onChange={(v) => updateSettings({ highContrast: v })}
            label="High contrast"
          />
        </div>

        <div className="sheet__row">
          <span>Allow piece rotation</span>
          <Toggle
            checked={settings.allowRotation}
            onChange={(v) => updateSettings({ allowRotation: v })}
            label="Allow piece rotation"
          />
        </div>

        <div className="sheet__row">
          <span>Sound effects</span>
          <Toggle
            checked={settings.soundOn}
            onChange={(v) => updateSettings({ soundOn: v })}
            label="Sound effects"
          />
        </div>

        <div className="sheet__row sheet__row--column">
          <span>Piece edge style</span>
          <div className="segmented" role="radiogroup" aria-label="Piece edge style">
            <button
              role="radio"
              aria-checked={settings.pieceStyle === 'classic'}
              className={settings.pieceStyle === 'classic' ? 'segmented__item is-active' : 'segmented__item'}
              onClick={() => updateSettings({ pieceStyle: 'classic' })}
            >
              Classic
            </button>
            <button
              role="radio"
              aria-checked={settings.pieceStyle === 'square'}
              className={settings.pieceStyle === 'square' ? 'segmented__item is-active' : 'segmented__item'}
              onClick={() => updateSettings({ pieceStyle: 'square' })}
            >
              Square
            </button>
          </div>
        </div>

        <button className="btn btn-primary sheet__close" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={checked ? 'toggle is-on' : 'toggle'}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__thumb" />
    </button>
  );
}
