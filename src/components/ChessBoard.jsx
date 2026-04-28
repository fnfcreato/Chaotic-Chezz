import { FILES, squareToCoords } from "../../shared/utils.js";
import { getPieceGlyph } from "../../shared/gameEngine.js";

const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"];

export default function ChessBoard({
  game,
  selectedSquare,
  legalTargets,
  onSquareClick,
  orientation,
  disabled,
}) {
  const files = orientation === "w" ? FILES : [...FILES].reverse();
  const ranks = orientation === "w" ? [...RANKS] : [...RANKS].reverse();
  const lastMove = [...game.moveHistory].reverse().find((entry) => entry.kind === "move");
  const effectMap = new Map();

  game.squareEffects.forEach((effect) => {
    if (!effectMap.has(effect.square)) {
      effectMap.set(effect.square, []);
    }
    effectMap.get(effect.square).push(effect);
  });

  return (
    <div className="board-frame">
      <div className="board-shell">
        <div className="board-ranks">
          {ranks.map((rank) => (
            <span key={rank} className="outer-coordinate">
              {rank}
            </span>
          ))}
        </div>

        <div className="board-grid">
          {ranks.map((rank) =>
            files.map((file) => {
              const square = `${file}${rank}`;
              const pieceId = game.boardMap[square];
              const piece = pieceId ? game.pieceStates[pieceId] : null;
              const squareEffects = effectMap.get(square) ?? [];
              const statusIcons = piece?.statuses?.slice(0, 2).map((status) => status.icon) ?? [];
              const { file: actualFile, rank: actualRank } = squareToCoords(square);
              const isDark = (actualFile + actualRank) % 2 === 0;
              const isSelected = selectedSquare === square;
              const isLegal = legalTargets.includes(square);
              const isLastMove = lastMove && (lastMove.from === square || lastMove.to === square);

              return (
                <button
                  key={square}
                  className={[
                    "board-square",
                    isDark ? "dark-square" : "light-square",
                    isSelected ? "selected-square" : "",
                    isLegal ? "legal-square" : "",
                    isLastMove ? "last-move-square" : "",
                  ].join(" ")}
                  disabled={disabled}
                  onClick={() => onSquareClick(square)}
                  type="button"
                >
                  {squareEffects[0] ? <span className="square-effect">{squareEffects[0].icon}</span> : null}
                  {piece ? (
                    <span className={`piece piece-${piece.color}`}>
                      <span className="piece-glyph">{getPieceGlyph(piece)}</span>
                      {statusIcons.length ? (
                        <span className="piece-status">{statusIcons.join("")}</span>
                      ) : null}
                    </span>
                  ) : isLegal ? (
                    <span className="legal-dot" />
                  ) : null}
                </button>
              );
            }),
          )}
        </div>
      </div>

      <div className="board-files">
        {files.map((file) => (
          <span key={file} className="outer-coordinate">
            {file}
          </span>
        ))}
      </div>
    </div>
  );
}
