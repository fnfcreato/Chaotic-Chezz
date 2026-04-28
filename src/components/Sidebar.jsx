function RuleList({ title, rules, pending = false }) {
  return (
    <section className="panel-section">
      <div className="panel-section-header">
        <h3>{title}</h3>
        <span>{rules.length}</span>
      </div>
      <div className="rule-stack">
        {rules.length ? (
          rules.map((rule) => (
            <article key={rule.instanceId} className="rule-pill">
              <div className="rule-pill-header">
                <span className="rule-icon">{rule.icon}</span>
                <strong>{rule.name}</strong>
              </div>
              <p>{rule.description}</p>
              <span className="rule-timer">
                {pending ? `In ${rule.remainingTurns} turns` : `${rule.remainingTurns} turns left`}
              </span>
            </article>
          ))
        ) : (
          <p className="muted-text">No rules here yet.</p>
        )}
      </div>
    </section>
  );
}

export default function Sidebar({
  game,
  mode,
  roomCode,
  roomLink,
  players,
  playerColor,
  onRestart,
  onCopyLink,
  onReturnMenu,
}) {
  const turnLabel = game.turn === "w" ? "White" : "Black";
  const latestEntries = [...game.moveHistory].slice(-16).reverse();
  const ruleSetLabel = game.ruleSet === "chaos" ? "Chaos" : "Classic";

  return (
    <aside className="sidebar">
      <section className="panel-section">
        <p className="eyebrow">{mode === "multiplayer" ? "Live Match" : "Singleplayer"}</p>
        <h2>{turnLabel} to move</h2>
        <p className="status-line">
          Ruleset: <strong>{ruleSetLabel}</strong>
        </p>
        <p className="status-line">
          Total turns: <strong>{game.turnCount}</strong>
        </p>
        {game.inCheck && !game.result ? <p className="status-badge">Check</p> : null}
        {game.result ? (
          <p className="result-banner">
            {game.result.winner
              ? `${game.result.winner === "w" ? "White" : "Black"} wins by ${game.result.reason}.`
              : `Game drawn by ${game.result.reason}.`}
          </p>
        ) : null}
        {game.paused ? <p className="result-banner paused-banner">{game.pauseReason}</p> : null}
      </section>

      {mode === "multiplayer" ? (
        <section className="panel-section">
          <div className="panel-section-header">
            <h3>Room</h3>
            <span>{roomCode}</span>
          </div>
          <p className="muted-text">{roomLink}</p>
          <div className="player-row">
            <span className={playerColor === "w" ? "active-player" : ""}>
              White: {players?.w?.name || "Open"} {players?.w?.connected === false ? "• offline" : ""}
            </span>
            <span className={playerColor === "b" ? "active-player" : ""}>
              Black: {players?.b?.name || "Open"} {players?.b?.connected === false ? "• offline" : ""}
            </span>
          </div>
          <div className="button-row">
            <button className="secondary-button" onClick={onCopyLink}>
              Copy Invite Link
            </button>
          </div>
        </section>
      ) : null}

      <RuleList title="Active Rules" rules={game.activeRulesView} />
      <RuleList title="Pending Rules" rules={game.pendingRulesView} pending />

      <section className="panel-section">
        <div className="panel-section-header">
          <h3>Move History</h3>
          <span>{game.moveHistory.length}</span>
        </div>
        <div className="history-list">
          {latestEntries.map((entry, index) => (
            <div key={`${entry.kind}_${entry.turnCount}_${index}`} className="history-item">
              {entry.kind === "move" ? (
                <span>
                  {entry.color === "w" ? "White" : "Black"}: {entry.san}
                </span>
              ) : (
                <span>{entry.text}</span>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="panel-section actions-section">
        <div className="button-row">
          <button className="secondary-button" onClick={onRestart}>
            Restart
          </button>
          <button className="ghost-button" onClick={onReturnMenu}>
            Main Menu
          </button>
        </div>
      </section>
    </aside>
  );
}
