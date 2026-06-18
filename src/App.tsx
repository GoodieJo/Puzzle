import { useApp } from './store/AppContext';
import { HomeScreen } from './pages/HomeScreen';
import { UploadScreen } from './pages/UploadScreen';
import { DifficultyScreen } from './pages/DifficultyScreen';
import { PuzzleWorkspace } from './pages/PuzzleWorkspace';

export default function App() {
  const { screen } = useApp();

  switch (screen) {
    case 'upload':
      return <UploadScreen />;
    case 'difficulty':
      return <DifficultyScreen />;
    case 'workspace':
      return <PuzzleWorkspace />;
    case 'home':
    default:
      return <HomeScreen />;
  }
}
