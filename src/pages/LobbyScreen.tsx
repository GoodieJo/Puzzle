import { useEffect, useRef, useState } from 'react';
import { Header } from '../components/Header';
import { useRoom } from '../store/RoomContext';
import { useApp } from '../store/AppContext';
import './LobbyScreen.css';

export function LobbyScreen() {
  const { goTo } = useApp();
  const { playerName, setPlayerName, createRoom, joinRoom, connectionStatus } = useRoom();
  const [nameInput, setNameInput] = useState(playerName || '');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Auto-join if room code in URL: /room/ABC123
  useEffect(() => {
    const match = window.location.pathname.match(/\/room\/([A-Z0-9]{6})/i);
    if (match) {
      setJoinCode(match[1].toUpperCase());
    }
    nameRef.current?.focus();
  }, []);

  const validateName = () => {
    const name = nameInput.trim();
    if (!name) { setError('Please enter your name first.'); return null; }
    if (name.length > 24) { setError('Name too long (24 char max).'); return null; }
    setPlayerName(name);
    setError('');
    return name;
  };

  const handleCreate = async () => {
    const name = validateName();
    if (!name) return;
    setBusy(true);
    try {
      const id = await createRoom();
      window.history.pushState({}, '', `/room/${id}`);
      goTo('room-setup');
    } catch {
      setError('Could not create room. Please check your connection.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = () => {
    const name = validateName();
    if (!name) return;
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) { setError('Enter the 6-character room code.'); return; }
    window.history.pushState({}, '', `/room/${code}`);
    joinRoom(code);
    goTo('room-setup');
  };

  return (
    <div className="screen lobby-screen">
      <Header title="Piecewise" onBack={() => goTo('home')} />

      <div className="lobby-body">
        <div className="lobby-hero">
          <span className="lobby-hero__icon" aria-hidden="true">🧩</span>
          <h2>Play together</h2>
          <p>Solve puzzles cooperatively in real time with friends on any device.</p>
        </div>

        <div className="lobby-card">
          <label className="lobby-label" htmlFor="player-name">Your name</label>
          <input
            id="player-name"
            ref={nameRef}
            className="lobby-input"
            type="text"
            value={nameInput}
            placeholder="e.g. Raj"
            maxLength={24}
            autoComplete="nickname"
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
          />
          {error && <p className="lobby-error" role="alert">{error}</p>}

          <button
            className="btn btn-primary lobby-btn"
            onClick={handleCreate}
            disabled={busy || connectionStatus === 'connecting'}
          >
            {busy ? 'Creating…' : 'Create a room'}
          </button>
        </div>

        <div className="lobby-divider"><span>or join an existing room</span></div>

        <div className="lobby-card">
          <label className="lobby-label" htmlFor="room-code">Room code</label>
          <input
            id="room-code"
            className="lobby-input lobby-input--code"
            type="text"
            value={joinCode}
            placeholder="ABC123"
            maxLength={6}
            autoComplete="off"
            autoCapitalize="characters"
            onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') handleJoin(); }}
          />
          <button
            className="btn lobby-btn"
            onClick={handleJoin}
            disabled={joinCode.length !== 6 || connectionStatus === 'connecting'}
          >
            Join room
          </button>
        </div>
      </div>
    </div>
  );
}
