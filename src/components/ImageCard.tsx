import type { PuzzleImageMeta } from '../types/puzzle';
import './ImageCard.css';

interface ImageCardProps {
  image: PuzzleImageMeta;
  onSelect: (image: PuzzleImageMeta) => void;
}

export function ImageCard({ image, onSelect }: ImageCardProps) {
  return (
    <button className="image-card" onClick={() => onSelect(image)} aria-label={`Start puzzle: ${image.title}`}>
      <span className="image-card__art">
        <img src={image.thumb} alt="" loading="lazy" decoding="async" />
      </span>
      <span className="image-card__meta">
        <span className="image-card__title">{image.title}</span>
        <span className="image-card__category">{image.category}</span>
      </span>
    </button>
  );
}
