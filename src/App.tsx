import { useApp } from './store/AppContext';
import { HomeScreen } from './pages/HomeScreen';
import { UploadScreen } from './pages/UploadScreen';
import { DifficultyScreen } from './pages/DifficultyScreen';
import { PuzzleWorkspace } from './pages/PuzzleWorkspace';
import { LobbyScreen } from './pages/LobbyScreen';
import { RoomSetupScreen } from './pages/RoomSetupScreen';

export default function App() {
  const { screen } = useApp();
  switch (screen) {
    case 'lobby':      return <LobbyScreen />;
    case 'room-setup': return <RoomSetupScreen />;
    case 'upload':     return <UploadScreen />;
    case 'difficulty': return <DifficultyScreen />;
    case 'workspace':  return <PuzzleWorkspace />;
    case 'home':
    default:           return <HomeScreen />;
  }
}
