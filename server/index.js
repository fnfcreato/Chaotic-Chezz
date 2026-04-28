import express from "express";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import {
  applyMove,
  applyRuleSelection,
  buildClientState,
  createInitialGameState,
  restartGame,
} from "../shared/gameEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const PORT = Number(process.env.PORT || 3001);
const rooms = new Map();
const socketPresence = new Map();

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return rooms.has(code) ? createRoomCode() : code;
}

function getPublicPlayers(room) {
  return {
    w: room.players.w
      ? {
          color: "w",
          name: room.players.w.name,
          connected: room.players.w.connected,
        }
      : null,
    b: room.players.b
      ? {
          color: "b",
          name: room.players.b.name,
          connected: room.players.b.connected,
        }
      : null,
  };
}

function syncRoomPause(room) {
  const bothPresent = Boolean(room.players.w && room.players.b);
  const bothConnected =
    Boolean(room.players.w?.connected) && Boolean(room.players.b?.connected);

  room.state.paused = !bothPresent || !bothConnected;
  if (!bothPresent) {
    room.state.pauseReason = "Waiting for a second player.";
  } else if (!bothConnected) {
    room.state.pauseReason = "A player disconnected. The game is paused until they reconnect.";
  } else {
    room.state.pauseReason = null;
  }
}

function emitRoomState(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) {
    return;
  }

  syncRoomPause(room);

  const basePayload = {
    roomCode,
    players: getPublicPlayers(room),
    game: buildClientState(room.state),
  };

  ["w", "b"].forEach((color) => {
    const player = room.players[color];
    if (player?.socketId) {
      io.to(player.socketId).emit("room:state", {
        ...basePayload,
        yourColor: color,
      });
    }
  });
}

function attachPlayer(roomCode, color, socket, sessionId, name) {
  const room = rooms.get(roomCode);
  if (!room) {
    return null;
  }

  room.players[color] = {
    color,
    name,
    sessionId,
    socketId: socket.id,
    connected: true,
  };

  socket.join(roomCode);
  socketPresence.set(socket.id, { roomCode, color, sessionId });
  syncRoomPause(room);
  emitRoomState(roomCode);

  return { roomCode, color };
}

function detachPlayerSocket(roomCode, color, socketId = null) {
  const room = rooms.get(roomCode);
  if (!room || !room.players[color]) {
    return;
  }

  if (socketId && room.players[color].socketId !== socketId) {
    return;
  }

  room.players[color].connected = false;
  room.players[color].socketId = null;
  syncRoomPause(room);
  emitRoomState(roomCode);
}

function findPlayerColor(room, sessionId) {
  if (room.players.w?.sessionId === sessionId) {
    return "w";
  }
  if (room.players.b?.sessionId === sessionId) {
    return "b";
  }
  return null;
}

function withRoomAction(socket, roomCode, sessionId, callback, reply) {
  const room = rooms.get(roomCode);
  if (!room) {
    reply?.({ ok: false, error: "Room not found." });
    return;
  }

  const color = findPlayerColor(room, sessionId);
  if (!color) {
    reply?.({ ok: false, error: "Player session not recognized for this room." });
    return;
  }

  callback(room, color, socket);
}

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, rooms: rooms.size });
});

const distPath = path.resolve(__dirname, "../dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (_request, response) => {
    response.sendFile(path.join(distPath, "index.html"));
  });
}

io.on("connection", (socket) => {
  socket.on("room:create", (payload, reply) => {
    const sessionId = payload?.sessionId;
    const name = payload?.name?.trim() || "White";
    const ruleSet = payload?.ruleSet === "chaos" ? "chaos" : "classic";
    if (!sessionId) {
      reply?.({ ok: false, error: "Missing session id." });
      return;
    }

    const roomCode = createRoomCode();
    const room = {
      code: roomCode,
      state: createInitialGameState("multiplayer", ruleSet),
      players: {
        w: null,
        b: null,
      },
    };
    room.state.paused = true;
    room.state.pauseReason = "Waiting for a second player.";
    rooms.set(roomCode, room);
    attachPlayer(roomCode, "w", socket, sessionId, name);
    reply?.({ ok: true, roomCode, color: "w" });
  });

  socket.on("room:join", (payload, reply) => {
    const roomCode = payload?.roomCode?.toUpperCase();
    const sessionId = payload?.sessionId;
    const name = payload?.name?.trim() || "Black";
    const room = rooms.get(roomCode);

    if (!room) {
      reply?.({ ok: false, error: "Room not found." });
      return;
    }

    const existingColor = findPlayerColor(room, sessionId);
    if (existingColor) {
      attachPlayer(roomCode, existingColor, socket, sessionId, room.players[existingColor].name);
      reply?.({ ok: true, roomCode, color: existingColor });
      return;
    }

    if (room.players.b) {
      reply?.({ ok: false, error: "Room is already full." });
      return;
    }

    attachPlayer(roomCode, "b", socket, sessionId, name);
    reply?.({ ok: true, roomCode, color: "b" });
  });

  socket.on("room:reconnect", (payload, reply) => {
    const roomCode = payload?.roomCode?.toUpperCase();
    const sessionId = payload?.sessionId;
    const room = rooms.get(roomCode);

    if (!room || !sessionId) {
      reply?.({ ok: false, error: "Reconnect failed." });
      return;
    }

    const color = findPlayerColor(room, sessionId);
    if (!color) {
      reply?.({ ok: false, error: "Player not found for reconnect." });
      return;
    }

    attachPlayer(roomCode, color, socket, sessionId, room.players[color].name);
    reply?.({ ok: true, roomCode, color });
  });

  socket.on("game:move", (payload, reply) => {
    withRoomAction(
      socket,
      payload?.roomCode?.toUpperCase(),
      payload?.sessionId,
      (room, color) => {
        if (room.state.paused) {
          reply?.({ ok: false, error: room.state.pauseReason || "Game is paused." });
          return;
        }

        if (buildClientState(room.state).turn !== color) {
          reply?.({ ok: false, error: "It is not your turn." });
          return;
        }

        const result = applyMove(room.state, {
          from: payload.from,
          to: payload.to,
          promotion: payload.promotion,
        });

        if (!result.ok) {
          reply?.(result);
          return;
        }

        room.state = result.state;
        emitRoomState(payload.roomCode.toUpperCase());
        reply?.({ ok: true });
      },
      reply,
    );
  });

  socket.on("game:selectRule", (payload, reply) => {
    withRoomAction(
      socket,
      payload?.roomCode?.toUpperCase(),
      payload?.sessionId,
      (room, color) => {
        const result = applyRuleSelection(room.state, payload.ruleId, color);
        if (!result.ok) {
          reply?.(result);
          return;
        }

        room.state = result.state;
        emitRoomState(payload.roomCode.toUpperCase());
        reply?.({ ok: true });
      },
      reply,
    );
  });

  socket.on("game:restart", (payload, reply) => {
    withRoomAction(
      socket,
      payload?.roomCode?.toUpperCase(),
      payload?.sessionId,
      (room) => {
        room.state = restartGame(room.state);
        room.state.mode = "multiplayer";
        syncRoomPause(room);
        emitRoomState(payload.roomCode.toUpperCase());
        reply?.({ ok: true });
      },
      reply,
    );
  });

  socket.on("room:leave", (payload, reply) => {
    withRoomAction(
      socket,
      payload?.roomCode?.toUpperCase(),
      payload?.sessionId,
      (room, color) => {
        socket.leave(payload.roomCode.toUpperCase());
        socketPresence.delete(socket.id);
        detachPlayerSocket(room.code, color, socket.id);
        reply?.({ ok: true });
      },
      reply,
    );
  });

  socket.on("disconnect", () => {
    const presence = socketPresence.get(socket.id);
    socketPresence.delete(socket.id);
    if (!presence) {
      return;
    }

    detachPlayerSocket(presence.roomCode, presence.color, socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Ruled Chess server listening on ${PORT}`);
});
