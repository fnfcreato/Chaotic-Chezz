import { useEffect, useMemo, useRef, useState } from "react";
import ChessBoard from "./components/ChessBoard.jsx";
import MainMenu from "./components/MainMenu.jsx";
import RuleModal from "./components/RuleModal.jsx";
import Sidebar from "./components/Sidebar.jsx";
import { getSocket } from "./lib/socket.js";
import {
  applyMove,
  applyRuleSelection,
  buildClientState,
  chooseAIMove,
  chooseAIRule,
  createInitialGameState,
  getLegalMovesForSquare,
  restartGame,
} from "../shared/gameEngine.js";
import { playSound, setSoundEnabled, unlockSound } from "./lib/sound.js";

const socket = getSocket();

function getStoredSessionId() {
  const existing = window.localStorage.getItem("ruled_chess_session");
  if (existing) {
    return existing;
  }
  const created = `session_${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem("ruled_chess_session", created);
  return created;
}

function storeRoom(roomCode, color) {
  window.localStorage.setItem(
    "ruled_chess_room",
    JSON.stringify({ roomCode, color }),
  );
}

function clearStoredRoom() {
  window.localStorage.removeItem("ruled_chess_room");
}

function readStoredRoom() {
  const raw = window.localStorage.getItem("ruled_chess_room");
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function emitAck(event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, (response) => resolve(response));
  });
}

function getPromotionForMove(game, from, to) {
  const pieceId = game.boardMap[from];
  const piece = pieceId ? game.pieceStates[pieceId] : null;
  if (!piece || piece.type !== "p") {
    return undefined;
  }

  if ((piece.color === "w" && to[1] === "8") || (piece.color === "b" && to[1] === "1")) {
    return "q";
  }

  return undefined;
}

export default function App() {
  const sessionId = useMemo(() => getStoredSessionId(), []);
  const roomFromUrl = new URLSearchParams(window.location.search).get("room") || "";
  const [screen, setScreen] = useState("menu");
  const [mode, setMode] = useState("singleplayer");
  const [game, setGame] = useState(buildClientState(createInitialGameState("singleplayer", "classic")));
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [playerName, setPlayerName] = useState("Player");
  const [roomCodeInput, setRoomCodeInput] = useState(roomFromUrl.toUpperCase());
  const [roomCode, setRoomCode] = useState("");
  const [roomPlayers, setRoomPlayers] = useState(null);
  const [playerColor, setPlayerColor] = useState("w");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [soundOn, setSoundOn] = useState(true);
  const previousHistoryLength = useRef(game.moveHistory.length);

  const orientation = mode === "multiplayer" ? playerColor : "w";
  const legalTargets = useMemo(
    () => (selectedSquare ? getLegalMovesForSquare(game, selectedSquare).map((move) => move.to) : []),
    [game, selectedSquare],
  );
  const roomLink = useMemo(
    () => (roomCode ? `${window.location.origin}?room=${roomCode}` : ""),
    [roomCode],
  );
  const canMoveLocal =
    !game.result &&
    !game.paused &&
    !game.selectionPhase &&
    game.turn === (mode === "multiplayer" ? playerColor : "w");
  const canChooseRule =
    Boolean(game.selectionPhase) &&
    game.selectionPhase.player === (mode === "multiplayer" ? playerColor : "w");

  useEffect(() => {
    setSoundEnabled(soundOn);
  }, [soundOn]);

  useEffect(() => {
    const previousLength = previousHistoryLength.current;
    const nextLength = game.moveHistory.length;
    if (nextLength <= previousLength) {
      previousHistoryLength.current = nextLength;
      return;
    }

    const newEntries = game.moveHistory.slice(previousLength);
    newEntries.forEach((entry) => {
      if (entry.kind === "move") {
        playSound(entry.captured ? "capture" : "move");
        if (entry.note === "Check") {
          playSound("check");
        }
      } else if (entry.kind === "rule-picked") {
        playSound("rule-pick");
      } else if (entry.kind === "rule-activated") {
        playSound("rule-activate");
      }
    });

    previousHistoryLength.current = nextLength;
  }, [game]);

  useEffect(() => {
    const handleState = (payload) => {
      setMode("multiplayer");
      setScreen("game");
      setGame(payload.game);
      setRoomCode(payload.roomCode);
      setRoomPlayers(payload.players);
      setPlayerColor(payload.yourColor);
      setSelectedSquare(null);
      storeRoom(payload.roomCode, payload.yourColor);
    };

    socket.on("room:state", handleState);
    return () => {
      socket.off("room:state", handleState);
    };
  }, []);

  useEffect(() => {
    const reconnect = async () => {
      const storedRoom = readStoredRoom();
      if (!storedRoom?.roomCode) {
        return;
      }
      const response = await emitAck("room:reconnect", {
        roomCode: storedRoom.roomCode,
        sessionId,
      });
      if (!response?.ok) {
        clearStoredRoom();
      }
    };

    if (socket.connected) {
      reconnect();
      return undefined;
    }

    socket.on("connect", reconnect);
    return () => {
      socket.off("connect", reconnect);
    };
  }, [sessionId]);

  useEffect(() => {
    if (mode !== "singleplayer") {
      return undefined;
    }

    if (game.result || game.paused) {
      return undefined;
    }

    if (game.selectionPhase?.player === "b") {
      const timer = window.setTimeout(() => {
        const choice = chooseAIRule(game, "b");
        if (!choice) {
          return;
        }
        const result = applyRuleSelection(game, choice.ruleId, "b");
        if (result.ok) {
          setGame(buildClientState(result.state));
        }
      }, 600);
      return () => window.clearTimeout(timer);
    }

    if (game.turn === "b" && !game.selectionPhase) {
      const timer = window.setTimeout(() => {
        const move = chooseAIMove(game, "b");
        if (!move) {
          return;
        }
        const result = applyMove(game, move);
        if (result.ok) {
          setGame(buildClientState(result.state));
        }
      }, 500);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [game, mode]);

  async function startSingleplayer(ruleSet = "classic") {
    await unlockSound();
    if (mode === "multiplayer" && roomCode) {
      await emitAck("room:leave", {
        roomCode,
        sessionId,
      });
    }
    clearStoredRoom();
    setMode("singleplayer");
    setScreen("game");
    setSelectedSquare(null);
    setRoomCode("");
    setRoomPlayers(null);
    setPlayerColor("w");
    setError("");
    setGame(buildClientState(createInitialGameState("singleplayer", ruleSet)));
  }

  async function createRoom(ruleSet = "classic") {
    await unlockSound();
    setBusy(true);
    setError("");
    const response = await emitAck("room:create", {
      sessionId,
      name: playerName,
      ruleSet,
    });
    setBusy(false);
    if (!response?.ok) {
      setError(response?.error || "Room could not be created.");
      return;
    }
    setPlayerColor(response.color);
  }

  async function joinRoom() {
    await unlockSound();
    setBusy(true);
    setError("");
    const response = await emitAck("room:join", {
      roomCode: roomCodeInput,
      sessionId,
      name: playerName,
    });
    setBusy(false);
    if (!response?.ok) {
      setError(response?.error || "Room could not be joined.");
      return;
    }
    setPlayerColor(response.color);
  }

  async function submitMove(from, to) {
    await unlockSound();
    const promotion = getPromotionForMove(game, from, to);

    if (mode === "singleplayer") {
      const result = applyMove(game, { from, to, promotion });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setGame(buildClientState(result.state));
      setSelectedSquare(null);
      setError("");
      return;
    }

    const response = await emitAck("game:move", {
      roomCode,
      sessionId,
      from,
      to,
      promotion,
    });
    if (!response?.ok) {
      setError(response?.error || "Move failed.");
      return;
    }
    setSelectedSquare(null);
    setError("");
  }

  async function handleSquareClick(square) {
    await unlockSound();
    if (!canMoveLocal) {
      return;
    }

    const pieceId = game.boardMap[square];
    const piece = pieceId ? game.pieceStates[pieceId] : null;
    const controlColor = mode === "multiplayer" ? playerColor : "w";

    if (!selectedSquare) {
      if (piece && piece.color === controlColor) {
        setSelectedSquare(square);
      }
      return;
    }

    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }

    if (piece && piece.color === controlColor) {
      setSelectedSquare(square);
      return;
    }

    if (legalTargets.includes(square)) {
      submitMove(selectedSquare, square);
      return;
    }

    setSelectedSquare(null);
  }

  async function handleRuleChoice(ruleId) {
    await unlockSound();
    if (!canChooseRule) {
      return;
    }

    if (mode === "singleplayer") {
      const result = applyRuleSelection(game, ruleId, "w");
      if (result.ok) {
        setGame(buildClientState(result.state));
        setError("");
      }
      return;
    }

    const response = await emitAck("game:selectRule", {
      roomCode,
      sessionId,
      ruleId,
    });
    if (!response?.ok) {
      setError(response?.error || "Rule selection failed.");
    } else {
      setError("");
    }
  }

  async function handleRestart() {
    await unlockSound();
    setSelectedSquare(null);
    if (mode === "singleplayer") {
      setGame(buildClientState(restartGame(game)));
      return;
    }

    await emitAck("game:restart", {
      roomCode,
      sessionId,
    });
  }

  function handleReturnMenu() {
    const leaveRoom = async () => {
      if (mode === "multiplayer" && roomCode) {
        await emitAck("room:leave", {
          roomCode,
          sessionId,
        });
      }
      clearStoredRoom();
      setScreen("menu");
      setError("");
      setSelectedSquare(null);
    };

    leaveRoom();
  }

  async function handleCopyLink() {
    await unlockSound();
    if (!roomLink) {
      return;
    }
    try {
      await navigator.clipboard.writeText(roomLink);
    } catch {
      setError("Clipboard access was denied.");
    }
  }

  if (screen === "menu") {
    return (
      <main className="app-shell">
        <MainMenu
          playerName={playerName}
          setPlayerName={setPlayerName}
          roomCodeInput={roomCodeInput}
          setRoomCodeInput={setRoomCodeInput}
          onSingleplayerClassic={() => startSingleplayer("classic")}
          onSingleplayerChaos={() => startSingleplayer("chaos")}
          onCreateRoomClassic={() => createRoom("classic")}
          onCreateRoomChaos={() => createRoom("chaos")}
          onJoinRoom={joinRoom}
          busy={busy}
          error={error}
        />
      </main>
    );
  }

  return (
    <main className="app-shell">
      <div className="game-layout">
        <section className="board-panel">
          <div className="board-header">
            <div>
              <p className="eyebrow">{mode === "multiplayer" ? "Online Match" : "Against the House AI"}</p>
              <h1>Ruled Chess</h1>
            </div>
            <div className="status-group">
              <span className="turn-chip">{game.turn === "w" ? "White" : "Black"} to move</span>
              <button
                className="ghost-button"
                type="button"
                onClick={() => setSoundOn((current) => !current)}
              >
                {soundOn ? "Sound On" : "Sound Off"}
              </button>
              {error ? <span className="error-chip">{error}</span> : null}
            </div>
          </div>

          <ChessBoard
            game={game}
            selectedSquare={selectedSquare}
            legalTargets={legalTargets}
            onSquareClick={handleSquareClick}
            orientation={orientation}
            disabled={!canMoveLocal}
          />
        </section>

        <Sidebar
          game={game}
          mode={mode}
          roomCode={roomCode}
          roomLink={roomLink}
          players={roomPlayers}
          playerColor={playerColor}
          onRestart={handleRestart}
          onCopyLink={handleCopyLink}
          onReturnMenu={handleReturnMenu}
        />
      </div>

      <RuleModal
        selectionPhase={game.selectionPhase}
        canChoose={canChooseRule}
        onChoose={handleRuleChoice}
      />
    </main>
  );
}
