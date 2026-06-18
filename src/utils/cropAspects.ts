export interface CropAspectOption {
  id: string;
  label: string;
  ratio: number; // width / height
}

export const CROP_ASPECTS: CropAspectOption[] = [
  { id: 'square', label: 'Square', ratio: 1 },
  { id: 'standard', label: 'Standard', ratio: 4 / 3 },
  { id: 'wide', label: 'Wide', ratio: 16 / 9 },
  { id: 'portrait', label: 'Portrait', ratio: 3 / 4 },
];

/**
 * Builds a crop aspect option matching the source photo's own dimensions, so
 * the whole image can be used with zero forced cropping/zoom. This is offered
 * first and selected by default - the fixed presets above are only needed
 * when someone deliberately wants a different shape (e.g. a square crop).
 */
export function getOriginalAspectOption(naturalWidth: number, naturalHeight: number): CropAspectOption {
  return {
    id: 'original',
    label: 'Original',
    ratio: naturalWidth / naturalHeight || 1,
  };
}
