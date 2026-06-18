import natureValley from './nature-valley.svg';
import natureForest from './nature-forest.svg';
import animalsFox from './animals-fox.svg';
import animalsOwl from './animals-owl.svg';
import loveSunset from './love-sunset.svg';
import citiesSkyline from './cities-skyline.svg';
import abstractWaves from './abstract-waves.svg';
import abstractBlocks from './abstract-blocks.svg';
import type { PuzzleImageMeta } from '../../types/puzzle';

export const BUILT_IN_PUZZLES: PuzzleImageMeta[] = [
  { id: 'nature-valley', title: 'Sunset Valley', category: 'Nature', src: natureValley, thumb: natureValley, aspect: 1, builtIn: true },
  { id: 'nature-forest', title: 'Pine Forest', category: 'Nature', src: natureForest, thumb: natureForest, aspect: 1, builtIn: true },
  { id: 'animals-fox', title: 'Fox Portrait', category: 'Animals', src: animalsFox, thumb: animalsFox, aspect: 1, builtIn: true },
  { id: 'animals-owl', title: 'Night Owl', category: 'Animals', src: animalsOwl, thumb: animalsOwl, aspect: 1, builtIn: true },
  { id: 'love-sunset', title: 'Heart of Gold', category: 'Love', src: loveSunset, thumb: loveSunset, aspect: 1, builtIn: true },
  { id: 'cities-skyline', title: 'City Lights', category: 'Cities', src: citiesSkyline, thumb: citiesSkyline, aspect: 1, builtIn: true },
  { id: 'abstract-waves', title: 'Flow State', category: 'Abstract', src: abstractWaves, thumb: abstractWaves, aspect: 1, builtIn: true },
  { id: 'abstract-blocks', title: 'Block Party', category: 'Abstract', src: abstractBlocks, thumb: abstractBlocks, aspect: 1, builtIn: true },
];

export const CATEGORIES = ['All', 'Nature', 'Animals', 'Love', 'Cities', 'Abstract'] as const;
