import './PreviewModal.css';

interface PreviewModalProps {
  open: boolean;
  src: string;
  onClose: () => void;
}

export function PreviewModal({ open, src, onClose }: PreviewModalProps) {
  if (!open) return null;
  return (
    <div className="preview-modal" role="dialog" aria-modal="true" aria-label="Puzzle preview" onClick={onClose}>
      <img src={src} alt="Completed puzzle preview" />
      <button className="btn btn-icon preview-modal__close" onClick={onClose} aria-label="Close preview">
        ✕
      </button>
    </div>
  );
}
