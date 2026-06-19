import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.css';
import App from './App.tsx';
import { AppProvider } from './store/AppContext';
import { RoomProvider } from './store/RoomContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <RoomProvider>
        <App />
      </RoomProvider>
    </AppProvider>
  </StrictMode>
);

if ('serviceWorker' in navigator) {
  import('virtual:pwa-register')
    .then(({ registerSW }) => { registerSW({ immediate: true }); })
    .catch(() => { /* PWA not available in dev */ });
}
