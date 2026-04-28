export default function RuleModal({ selectionPhase, canChoose, onChoose }) {
  if (!selectionPhase) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <p className="eyebrow">Rule Selection Phase</p>
        <h2>Choose the next disturbance</h2>
        <p className="modal-copy">
          {selectionPhase.player === "w" ? "White" : "Black"} chooses one of three future rules.
        </p>

        <div className="rule-choice-grid">
          {selectionPhase.choices.map((choice) => (
            <button
              key={`${choice.ruleId}_${choice.delay}`}
              className="rule-choice-card"
              onClick={() => onChoose(choice.ruleId)}
              disabled={!canChoose}
              type="button"
            >
              <div className="rule-choice-header">
                <span className="rule-icon">{choice.icon}</span>
                <div>
                  <strong>{choice.name}</strong>
                  <p>Activates in {choice.delay} turns</p>
                </div>
              </div>
              <p>{choice.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
