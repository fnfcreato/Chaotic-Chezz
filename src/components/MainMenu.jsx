export default function MainMenu({
  playerName,
  setPlayerName,
  roomCodeInput,
  setRoomCodeInput,
  onSingleplayerClassic,
  onSingleplayerChaos,
  onCreateRoomClassic,
  onCreateRoomChaos,
  onJoinRoom,
  busy,
  error,
}) {
  return (
    <section className="menu-shell">
      <div className="menu-card hero-card">
        <p className="eyebrow">Evolving Classical Chess</p>
        <h1>Ruled Chess</h1>
        <p className="hero-copy">
          Choose restrained evolution or a louder chaos ruleset with shocks, ripostes, and volatile contact.
        </p>
        <div className="button-row">
          <button className="primary-button large-button" onClick={onSingleplayerClassic}>
            Singleplayer Classic
          </button>
          <button className="secondary-button large-button" onClick={onSingleplayerChaos}>
            Singleplayer Chaos
          </button>
        </div>
      </div>

      <div className="menu-card">
        <h2>Online Multiplayer</h2>
        <label className="field">
          <span>Player name</span>
          <input
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            maxLength={20}
            placeholder="Player"
          />
        </label>

        <div className="menu-actions">
          <button className="secondary-button" onClick={onCreateRoomClassic} disabled={busy}>
            Create Classic Room
          </button>
          <button className="ghost-button" onClick={onCreateRoomChaos} disabled={busy}>
            Create Chaos Room
          </button>
        </div>

        <label className="field">
          <span>Room code</span>
          <input
            value={roomCodeInput}
            onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
          />
        </label>

        <div className="menu-actions">
          <button
            className="ghost-button"
            onClick={onJoinRoom}
            disabled={busy || roomCodeInput.trim().length < 6}
          >
            Join Room
          </button>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
      </div>
    </section>
  );
}
