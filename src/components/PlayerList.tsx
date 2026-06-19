import type { PlayerInfo } from '../multiplayer/protocol';
import { sortPlayers } from '../multiplayer/sync';
import './PlayerList.css';

interface PlayerListProps {
  players: PlayerInfo[];
  localPlayerId: string;
  compact?: boolean;
}

export function PlayerList({ players, localPlayerId, compact }: PlayerListProps) {
  const sorted = sortPlayers(players);

  if (compact) {
    return (
      <div className="player-list player-list--compact" aria-label="Players in room">
        {sorted.map((p) => (
          <div
            key={p.id}
            className={`player-chip ${!p.online ? 'player-chip--offline' : ''}`}
            style={{ '--player-color': p.color } as React.CSSProperties}
            title={`${p.name}${p.isHost ? ' (host)' : ''} · ${p.moves} moves`}
          >
            <span className="player-chip__avatar">{p.name[0].toUpperCase()}</span>
            {p.isHost && <span className="player-chip__crown" aria-label="Host">👑</span>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="player-list" aria-label="Players in room">
      {sorted.map((p) => (
        <div
          key={p.id}
          className={`player-row ${!p.online ? 'player-row--offline' : ''} ${p.id === localPlayerId ? 'player-row--self' : ''}`}
        >
          <div className="player-row__avatar" style={{ background: p.color }}>
            {p.name[0].toUpperCase()}
          </div>
          <div className="player-row__info">
            <span className="player-row__name">
              {p.name}
              {p.id === localPlayerId && ' (you)'}
              {p.isHost && <span className="player-row__host" aria-label="Host"> 👑</span>}
            </span>
            <span className="player-row__moves">{p.moves} moves</span>
          </div>
          <span className={`player-row__status ${p.online ? 'is-online' : 'is-offline'}`} aria-label={p.online ? 'Online' : 'Offline'} />
        </div>
      ))}
    </div>
  );
}
