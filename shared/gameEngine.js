import { Chess } from "chess.js";
import { RULE_BY_ID, RULE_LIBRARY } from "./ruleLibrary.js";
import {
  CENTER_SQUARES,
  FILES,
  cloneSerializable,
  createId,
  getAdjacentSquares,
  getFileSquares,
  getHalfSquares,
  getRandomItems,
  isDarkSquare,
  isEdgeSquare,
  isLightSquare,
  squareToCoords,
} from "./utils.js";

const PIECE_VALUES = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

const RULE_SET_CONFIG = {
  classic: {
    selectionInterval: 6,
    delayBuffer: 2,
    durationBonus: 1,
  },
  chaos: {
    selectionInterval: 4,
    delayBuffer: 0,
    durationBonus: 0,
  },
};

const RULE_CATEGORIES = {
  lantern_ward: "targeted",
  mason_pause: "targeted",
  quiet_grain: "targeted",
  stewards_seal: "targeted",
  velvet_tax: "targeted",
  reed_vow: "targeted",
  marble_annex: "zone",
  rosewell: "zone",
  cinder_walk: "zone",
  quiet_cloister: "zone",
  ivy_stair: "zone",
  kings_gallery: "zone",
  sentinel_arc: "zone",
  silent_file: "zone",
  pilgrim_step: "zone",
  border_edict: "global",
  hearth_right: "global",
  echo_discipline: "global",
  center_grace: "global",
  frost_ledger: "global",
  rooks_ribbon: "global",
  bishops_ash: "global",
  knights_halo: "global",
  dark_choir: "global",
  pawn_toll: "global",
  court_respite: "global",
  harbor_law: "global",
  crown_drift: "global",
  far_travelers: "global",
  mirror_tithe: "global",
  volatile_crest: "targeted",
  static_clasp: "targeted",
  riposte_shroud: "targeted",
  storm_collar: "targeted",
  thunder_cells: "zone",
  surge_file: "zone",
  tempest_ring: "zone",
  ember_wake: "global",
  chain_static: "global",
  aftershock_tithe: "global",
};

function getRuleSet(rule) {
  return rule.ruleSet ?? "classic";
}

function getRuleConfig(ruleSet) {
  return RULE_SET_CONFIG[ruleSet] ?? RULE_SET_CONFIG.classic;
}

function createInitialPieces() {
  const pieces = {};
  const boardMap = {};
  const entries = [
    ["w", "r", "a1"], ["w", "n", "b1"], ["w", "b", "c1"], ["w", "q", "d1"],
    ["w", "k", "e1"], ["w", "b", "f1"], ["w", "n", "g1"], ["w", "r", "h1"],
    ["b", "r", "a8"], ["b", "n", "b8"], ["b", "b", "c8"], ["b", "q", "d8"],
    ["b", "k", "e8"], ["b", "b", "f8"], ["b", "n", "g8"], ["b", "r", "h8"],
    ["w", "p", "a2"], ["w", "p", "b2"], ["w", "p", "c2"], ["w", "p", "d2"],
    ["w", "p", "e2"], ["w", "p", "f2"], ["w", "p", "g2"], ["w", "p", "h2"],
    ["b", "p", "a7"], ["b", "p", "b7"], ["b", "p", "c7"], ["b", "p", "d7"],
    ["b", "p", "e7"], ["b", "p", "f7"], ["b", "p", "g7"], ["b", "p", "h7"],
  ];

  entries.forEach(([color, type, square]) => {
    const pieceId = `${color}_${type}_${square}`;
    pieces[pieceId] = {
      id: pieceId,
      color,
      type,
      square,
      statuses: [],
    };
    boardMap[square] = pieceId;
  });

  return { pieces, boardMap };
}

function getChess(state) {
  return new Chess(state.fen);
}

function getFenWithTurn(fen, color) {
  const parts = fen.split(" ");
  parts[1] = color;
  return parts.join(" ");
}

function getTurnColor(state) {
  return getChess(state).turn();
}

function getKingSquare(state, color) {
  return Object.values(state.pieceStates).find(
    (piece) => piece.color === color && piece.type === "k",
  )?.square ?? null;
}

function getPiece(state, pieceId) {
  return pieceId ? state.pieceStates[pieceId] ?? null : null;
}

function getPieceAtSquare(state, square) {
  return getPiece(state, state.boardMap[square]);
}

function getAdjacentPieceIds(state, square, orthogonalOnly = false) {
  return getAdjacentSquares(square, orthogonalOnly)
    .map((targetSquare) => state.boardMap[targetSquare])
    .filter(Boolean);
}

function getAdjacentEnemyPieceIds(state, square, color, orthogonalOnly = false) {
  return getAdjacentPieceIds(state, square, orthogonalOnly).filter((pieceId) => {
    const piece = getPiece(state, pieceId);
    return piece && piece.color !== color;
  });
}

function getAdjacentAlliedPieceIds(state, square, color, orthogonalOnly = false) {
  return getAdjacentPieceIds(state, square, orthogonalOnly).filter((pieceId) => {
    const piece = getPiece(state, pieceId);
    return piece && piece.color === color;
  });
}

function addStatus(state, pieceId, status) {
  const piece = getPiece(state, pieceId);
  if (!piece) {
    return;
  }
  piece.statuses.push({
    id: createId("status"),
    ...status,
  });
}

function addZone(state, zone) {
  state.squareZones.push({
    id: createId("zone"),
    ...zone,
  });
}

function getStatusList(state, piece) {
  return piece.statuses.filter((status) => {
    if (status.expiresAtTurn != null && state.turnCount >= status.expiresAtTurn) {
      return false;
    }
    if (
      status.untilOwnerMoveCount != null &&
      state.movesByColor[piece.color] > status.untilOwnerMoveCount
    ) {
      return false;
    }
    return true;
  });
}

function hasStatus(state, piece, type) {
  return getStatusList(state, piece).some((status) => status.type === type);
}

function pruneTransientState(state) {
  state.squareZones = state.squareZones.filter(
    (zone) => zone.expiresAtTurn == null || state.turnCount < zone.expiresAtTurn,
  );

  Object.values(state.pieceStates).forEach((piece) => {
    piece.statuses = getStatusList(state, piece);
  });

  state.activeRules = state.activeRules.filter(
    (rule) => rule.expiresAtTurn == null || state.turnCount < rule.expiresAtTurn,
  );
}

function resolveMostAdvancedPawn(state, color) {
  const pawns = Object.values(state.pieceStates).filter(
    (piece) => piece.color === color && piece.type === "p",
  );
  if (!pawns.length) {
    return null;
  }
  const sorted = [...pawns].sort((left, right) => {
    const leftRank = Number(left.square[1]);
    const rightRank = Number(right.square[1]);
    return color === "w" ? rightRank - leftRank : leftRank - rightRank;
  });
  return sorted[0];
}

function resolveLeastAdvancedMinor(state, color) {
  const minors = Object.values(state.pieceStates).filter(
    (piece) => piece.color === color && (piece.type === "n" || piece.type === "b"),
  );
  if (!minors.length) {
    return null;
  }
  const sorted = [...minors].sort((left, right) => {
    const leftRank = Number(left.square[1]);
    const rightRank = Number(right.square[1]);
    return color === "w" ? leftRank - rightRank : rightRank - leftRank;
  });
  return sorted[0];
}

function resolveHighestValueMobilePiece(state, color) {
  const candidates = Object.values(state.pieceStates).filter(
    (piece) => piece.color === color && piece.type !== "k",
  );
  const legalMoves = getLegalMoves(state, color, true);
  const movableIds = new Set(legalMoves.map((move) => move.pieceId));
  const filtered = candidates.filter((piece) => movableIds.has(piece.id));
  const sorted = [...filtered].sort(
    (left, right) => PIECE_VALUES[right.type] - PIECE_VALUES[left.type],
  );
  return sorted[0] ?? null;
}

function resolveNearestRookToKing(state, color) {
  const rooks = Object.values(state.pieceStates).filter(
    (piece) => piece.color === color && piece.type === "r",
  );
  const kingSquare = getKingSquare(state, color);
  if (!rooks.length || !kingSquare) {
    return null;
  }
  const kingCoords = squareToCoords(kingSquare);
  return [...rooks].sort((left, right) => {
    const leftCoords = squareToCoords(left.square);
    const rightCoords = squareToCoords(right.square);
    const leftDistance =
      Math.abs(leftCoords.file - kingCoords.file) + Math.abs(leftCoords.rank - kingCoords.rank);
    const rightDistance =
      Math.abs(rightCoords.file - kingCoords.file) + Math.abs(rightCoords.rank - kingCoords.rank);
    return leftDistance - rightDistance;
  })[0];
}

function createSelectionChoices(state, player) {
  const config = getRuleConfig(state.ruleSet);
  const excludedIds = new Set([
    ...state.activeRules.map((rule) => rule.ruleId),
    ...state.pendingRules.map((rule) => rule.ruleId),
  ]);
  const pool = RULE_LIBRARY.filter(
    (rule) => !excludedIds.has(rule.id) && getRuleSet(rule) === state.ruleSet,
  );
  const source = pool.length >= 3
    ? pool
    : RULE_LIBRARY.filter((rule) => getRuleSet(rule) === state.ruleSet);
  const byCategory = {
    targeted: source.filter((rule) => RULE_CATEGORIES[rule.id] === "targeted"),
    zone: source.filter((rule) => RULE_CATEGORIES[rule.id] === "zone"),
    global: source.filter((rule) => RULE_CATEGORIES[rule.id] === "global"),
  };

  const diverseRules = [
    ...getRandomItems(byCategory.targeted.length ? byCategory.targeted : source, 1),
    ...getRandomItems(byCategory.zone.length ? byCategory.zone : source, 1),
    ...getRandomItems(byCategory.global.length ? byCategory.global : source, 1),
  ];
  const uniqueRules = Array.from(new Map(diverseRules.map((rule) => [rule.id, rule])).values());
  const rules =
    uniqueRules.length >= 3 ? uniqueRules.slice(0, 3) : getRandomItems(source, 3);
  const phaseIndex = Math.floor(state.turnCount / config.selectionInterval);

  return rules.map((rule) => ({
    ruleId: rule.id,
    name: rule.name,
    icon: rule.icon,
    description: rule.description,
    delay: getRandomItems(rule.delayOptions, 1)[0] + config.delayBuffer + (phaseIndex >= 3 ? 0 : 1),
    player,
  }));
}

function createWardStatus(state) {
  return {
    type: "ward",
    icon: "🛡️",
    label: "Cannot be captured",
    expiresAtTurn: state.turnCount + 2,
  };
}

function createPacifistStatus(state, sourceRuleInstanceId, expiresAtTurn = null) {
  return {
    type: "pacifist",
    icon: "☁️",
    label: "Cannot capture",
    clearOnMove: true,
    sourceRuleInstanceId,
    expiresAtTurn,
  };
}

function createRootedStatus(untilOwnerMoveCount, sourceRuleInstanceId, expiresAtTurn = null) {
  return {
    type: "rooted",
    icon: "🌿",
    label: "Cannot move",
    untilOwnerMoveCount,
    sourceRuleInstanceId,
    expiresAtTurn,
  };
}

function shockPiece(
  state,
  pieceId,
  sourceRuleInstanceId,
  icon = "⚡",
  label = "Shocked",
  expiresAtTurn = null,
) {
  const piece = getPiece(state, pieceId);
  if (!piece || piece.type === "k") {
    return;
  }

  addStatus(
    state,
    pieceId,
    {
      ...createRootedStatus(
        state.movesByColor[piece.color] + 1,
        sourceRuleInstanceId,
        expiresAtTurn ?? state.turnCount + 3,
      ),
      icon,
      label,
    },
  );
  addStatus(
    state,
    pieceId,
    {
      ...createPacifistStatus(
        state,
        sourceRuleInstanceId,
        expiresAtTurn ?? state.turnCount + 3,
      ),
      icon,
      label,
    },
  );
}

function zoneAffectsPiece(zone, piece) {
  if (!piece) {
    return false;
  }
  if (!zone.affects || zone.affects === "all") {
    return true;
  }
  if (zone.affects === "enemy") {
    return zone.owner != null && piece.color !== zone.owner;
  }
  if (zone.affects === "owner") {
    return zone.owner != null && piece.color === zone.owner;
  }
  return true;
}

function shockAdjacentPieces(
  state,
  square,
  sourceRuleInstanceId,
  targetColor = null,
  orthogonalOnly = false,
  icon = "⚡",
  label = "Shocked",
) {
  getAdjacentPieceIds(state, square, orthogonalOnly).forEach((pieceId) => {
    const piece = getPiece(state, pieceId);
    if (!piece) {
      return;
    }
    if (targetColor && piece.color !== targetColor) {
      return;
    }
    shockPiece(state, pieceId, sourceRuleInstanceId, icon, label);
  });
}

function getDynamicZones(state) {
  const zones = [];

  state.activeRules.forEach((rule) => {
    if (rule.ruleId === "kings_gallery") {
      const kingSquare = getKingSquare(state, rule.owner);
      if (!kingSquare) {
        return;
      }
      getAdjacentSquares(kingSquare).forEach((square) => {
        zones.push({
          id: `dyn_${rule.instanceId}_${square}`,
          type: "sanctuary",
          square,
          icon: "👑",
          label: "Gallery",
          sourceRuleInstanceId: rule.instanceId,
          dynamic: true,
        });
      });
    }

    if (rule.ruleId === "sentinel_arc") {
      const kingSquare = getKingSquare(state, rule.owner);
      if (!kingSquare) {
        return;
      }
      getAdjacentSquares(kingSquare, true).forEach((square) => {
        zones.push({
          id: `dyn_${rule.instanceId}_${square}`,
          type: "spring",
          square,
          icon: "🛡️",
          label: "Sentinel Arc",
          sourceRuleInstanceId: rule.instanceId,
          dynamic: true,
        });
      });
    }

    if (rule.ruleId === "silent_file") {
      const kingSquare = getKingSquare(state, rule.owner);
      if (kingSquare) {
        getFileSquares(kingSquare[0]).forEach((square) => {
          zones.push({
            id: `dyn_${rule.instanceId}_${square}`,
            type: "hush",
            square,
            icon: "📜",
            label: "Silent File",
            sourceRuleInstanceId: rule.instanceId,
            dynamic: true,
          });
        });
      }
    }

    if (rule.ruleId === "tempest_ring") {
      const kingSquare = getKingSquare(state, rule.owner);
      if (!kingSquare) {
        return;
      }
      getAdjacentSquares(kingSquare).forEach((square) => {
        zones.push({
          id: `dyn_${rule.instanceId}_${square}`,
          type: "shock",
          square,
          icon: "🌀",
          label: "Tempest Ring",
          sourceRuleInstanceId: rule.instanceId,
          owner: rule.owner,
          affects: "enemy",
          dynamic: true,
        });
      });
    }
  });

  return zones;
}

export function getAllZones(state) {
  return [...state.squareZones, ...getDynamicZones(state)];
}

function getZonesOnSquare(state, square) {
  return getAllZones(state).filter((zone) => zone.square === square);
}

function activateRule(state, pendingRule) {
  const definition = RULE_BY_ID[pendingRule.ruleId];
  const config = getRuleConfig(state.ruleSet);
  const activeRule = {
    instanceId: pendingRule.instanceId,
    ruleId: pendingRule.ruleId,
    owner: pendingRule.owner,
    name: definition.name,
    icon: definition.icon,
    description: definition.description,
    startedAtTurn: state.turnCount,
    expiresAtTurn: state.turnCount + definition.duration + config.durationBonus,
    data: {},
  };

  switch (pendingRule.ruleId) {
    case "lantern_ward": {
      const target = resolveLeastAdvancedMinor(state, pendingRule.owner);
      if (target) {
        activeRule.data.targetPieceId = target.id;
        addStatus(state, target.id, {
          type: "ward",
          icon: "🕯️",
          label: "Lantern Ward",
          expiresAtTurn: activeRule.expiresAtTurn,
          sourceRuleInstanceId: activeRule.instanceId,
        });
      }
      break;
    }
    case "mason_pause": {
      const target = resolveMostAdvancedPawn(state, pendingRule.owner === "w" ? "b" : "w");
      if (target) {
        activeRule.data.targetPieceId = target.id;
        addStatus(
          state,
          target.id,
          createRootedStatus(
            state.movesByColor[target.color] + 2,
            activeRule.instanceId,
            activeRule.expiresAtTurn,
          ),
        );
      }
      break;
    }
    case "quiet_grain": {
      const target = resolveMostAdvancedPawn(state, pendingRule.owner);
      if (target) {
        activeRule.data.targetPieceId = target.id;
        addStatus(state, target.id, {
          type: "ward",
          icon: "🌾",
          label: "Quiet Grain",
          expiresAtTurn: activeRule.expiresAtTurn,
          sourceRuleInstanceId: activeRule.instanceId,
        });
        addStatus(
          state,
          target.id,
          {
            ...createPacifistStatus(state, activeRule.instanceId, activeRule.expiresAtTurn),
            icon: "🌾",
            label: "Quiet Grain",
            clearOnMove: false,
          },
        );
      }
      break;
    }
    case "stewards_seal": {
      const target = resolveNearestRookToKing(state, pendingRule.owner);
      if (target) {
        activeRule.data.targetPieceId = target.id;
        addStatus(state, target.id, {
          type: "ward",
          icon: "🔖",
          label: "Steward's Seal",
          expiresAtTurn: activeRule.expiresAtTurn,
          sourceRuleInstanceId: activeRule.instanceId,
        });
      }
      break;
    }
    case "velvet_tax": {
      const target = resolveHighestValueMobilePiece(
        state,
        pendingRule.owner === "w" ? "b" : "w",
      );
      if (target) {
        activeRule.data.targetPieceId = target.id;
        addStatus(
          state,
          target.id,
          {
            ...createPacifistStatus(state, activeRule.instanceId, activeRule.expiresAtTurn),
            icon: "🎭",
            label: "Velvet Tax",
            clearOnMove: false,
          },
        );
      }
      break;
    }
    case "marble_annex": {
      ["d3", "e3", "d6", "e6"].forEach((square) => {
        addZone(state, {
          type: "sanctuary",
          square,
          icon: "🏛️",
          label: "Marble Annex",
          expiresAtTurn: activeRule.expiresAtTurn,
          sourceRuleInstanceId: activeRule.instanceId,
        });
      });
      break;
    }
    case "rosewell": {
      ["c4", "f4", "c5", "f5"].forEach((square) => {
        addZone(state, {
          type: "spring",
          square,
          icon: "🌹",
          label: "Rosewell",
          expiresAtTurn: activeRule.expiresAtTurn,
          sourceRuleInstanceId: activeRule.instanceId,
        });
      });
      break;
    }
    case "cinder_walk": {
      ["b4", "g4", "b5", "g5"].forEach((square) => {
        addZone(state, {
          type: "cinder",
          square,
          icon: "🔥",
          label: "Cinder Walk",
          expiresAtTurn: activeRule.expiresAtTurn,
          sourceRuleInstanceId: activeRule.instanceId,
        });
      });
      break;
    }
    case "quiet_cloister": {
      ["c3", "f3", "c6", "f6"].forEach((square) => {
        addZone(state, {
          type: "hush",
          square,
          icon: "🤫",
          label: "Quiet Cloister",
          expiresAtTurn: activeRule.expiresAtTurn,
          sourceRuleInstanceId: activeRule.instanceId,
        });
      });
      break;
    }
    case "ivy_stair": {
      ["a4", "a5", "h4", "h5"].forEach((square) => {
        addZone(state, {
          type: "ivy",
          square,
          icon: "🌿",
          label: "Ivy Stair",
          expiresAtTurn: activeRule.expiresAtTurn,
          sourceRuleInstanceId: activeRule.instanceId,
        });
      });
      break;
    }
    case "pilgrim_step": {
      ["b2", "g2", "b7", "g7"].forEach((square) => {
        addZone(state, {
          type: "spring",
          square,
          icon: "🚪",
          label: "Pilgrim Step",
          expiresAtTurn: activeRule.expiresAtTurn,
          sourceRuleInstanceId: activeRule.instanceId,
        });
      });
      break;
    }
    case "reed_vow": {
      const queen = Object.values(state.pieceStates).find(
        (piece) => piece.color === pendingRule.owner && piece.type === "q",
      );
      if (queen) {
        activeRule.data.targetPieceId = queen.id;
        addStatus(
          state,
          queen.id,
          {
            ...createPacifistStatus(state, activeRule.instanceId, activeRule.expiresAtTurn),
            icon: "🎐",
            label: "Reed Vow",
            clearOnMove: false,
          },
        );
        addStatus(state, queen.id, {
          type: "ward",
          icon: "🎐",
          label: "Reed Vow",
          expiresAtTurn: activeRule.expiresAtTurn,
          sourceRuleInstanceId: activeRule.instanceId,
        });
      }
      break;
    }
    case "volatile_crest": {
      const target = resolveLeastAdvancedMinor(state, pendingRule.owner);
      if (target) {
        activeRule.data.targetPieceId = target.id;
        addStatus(state, target.id, {
          type: "volatile",
          icon: "💥",
          label: "Volatile Crest",
          expiresAtTurn: activeRule.expiresAtTurn,
          sourceRuleInstanceId: activeRule.instanceId,
        });
      }
      break;
    }
    case "static_clasp": {
      const target = resolveLeastAdvancedMinor(state, pendingRule.owner);
      if (target) {
        activeRule.data.targetPieceId = target.id;
        addStatus(state, target.id, {
          type: "shockTouch",
          icon: "⚡",
          label: "Static Clasp",
          expiresAtTurn: activeRule.expiresAtTurn,
          sourceRuleInstanceId: activeRule.instanceId,
        });
      }
      break;
    }
    case "riposte_shroud": {
      const target = resolveNearestRookToKing(state, pendingRule.owner);
      if (target) {
        activeRule.data.targetPieceId = target.id;
        addStatus(state, target.id, {
          type: "riposte",
          icon: "🗡️",
          label: "Riposte Shroud",
          expiresAtTurn: activeRule.expiresAtTurn,
          sourceRuleInstanceId: activeRule.instanceId,
        });
      }
      break;
    }
    case "thunder_cells": {
      ["d4", "e4", "d5", "e5"].forEach((square) => {
        addZone(state, {
          type: "shock",
          square,
          icon: "⛈️",
          label: "Thunder Cells",
          expiresAtTurn: activeRule.expiresAtTurn,
          sourceRuleInstanceId: activeRule.instanceId,
          affects: "all",
        });
      });
      break;
    }
    case "surge_file": {
      const file = getRandomItems(["c", "d", "e", "f"], 1)[0];
      activeRule.data.file = file;
      getFileSquares(file).forEach((square) => {
        addZone(state, {
          type: "shock",
          square,
          icon: "🌩️",
          label: "Surge File",
          expiresAtTurn: activeRule.expiresAtTurn,
          sourceRuleInstanceId: activeRule.instanceId,
          affects: "all",
        });
      });
      break;
    }
    case "storm_collar": {
      const target = resolveHighestValueMobilePiece(
        state,
        pendingRule.owner === "w" ? "b" : "w",
      );
      if (target) {
        activeRule.data.targetPieceId = target.id;
      }
      break;
    }
    default:
      break;
  }

  state.activeRules.push(activeRule);
  state.moveHistory.push({
    kind: "rule-activated",
    turnCount: state.turnCount,
    text: `${definition.icon} ${definition.name} activates`,
  });
}

function activateDueRules(state) {
  const ready = state.pendingRules.filter((rule) => rule.activatesAtTurn <= state.turnCount);
  const waiting = state.pendingRules.filter((rule) => rule.activatesAtTurn > state.turnCount);
  state.pendingRules = waiting;
  ready.forEach((rule) => activateRule(state, rule));
}

function maybeStartRuleSelection(state) {
  const config = getRuleConfig(state.ruleSet);
  if (state.selectionPhase || state.result || state.turnCount === 0) {
    return;
  }
  if (state.turnCount % config.selectionInterval !== 0) {
    return;
  }
  const phaseIndex = Math.floor(state.turnCount / config.selectionInterval);
  const player = phaseIndex % 2 === 1 ? "w" : "b";
  state.selectionPhase = {
    player,
    choices: createSelectionChoices(state, player),
  };
  state.moveHistory.push({
    kind: "rule-selection",
    turnCount: state.turnCount,
    text: `${player === "w" ? "White" : "Black"} chooses the next rule`,
  });
}

function applyZoneEntryEffects(state, pieceId, square, sourceRuleExpiresAt = null) {
  const piece = getPiece(state, pieceId);
  if (!piece) {
    return;
  }
  const consumedZoneIds = [];
  getZonesOnSquare(state, square).forEach((zone) => {
    if (!zoneAffectsPiece(zone, piece)) {
      return;
    }
    if (zone.type === "spring") {
      addStatus(state, pieceId, {
        ...createWardStatus(state),
        icon: zone.icon,
        label: zone.label,
        sourceRuleInstanceId: zone.sourceRuleInstanceId,
        expiresAtTurn:
          sourceRuleExpiresAt != null
            ? Math.min(sourceRuleExpiresAt, state.turnCount + 2)
            : state.turnCount + 2,
      });
    }

    if (zone.type === "cinder") {
      addStatus(
        state,
        pieceId,
        {
          ...createPacifistStatus(
            state,
            zone.sourceRuleInstanceId,
            sourceRuleExpiresAt != null
              ? Math.min(sourceRuleExpiresAt, state.turnCount + 4)
              : state.turnCount + 4,
          ),
          icon: zone.icon,
          label: zone.label,
        },
      );
    }

    if (zone.type === "ivy") {
      addStatus(
        state,
        pieceId,
        {
          ...createRootedStatus(
            state.movesByColor[piece.color] + 1,
            zone.sourceRuleInstanceId,
            sourceRuleExpiresAt ?? state.turnCount + 4,
          ),
          icon: zone.icon,
          label: zone.label,
        },
      );
    }

    if (zone.type === "shock") {
      shockPiece(
        state,
        pieceId,
        zone.sourceRuleInstanceId,
        zone.icon,
        zone.label,
        sourceRuleExpiresAt != null
          ? Math.min(sourceRuleExpiresAt, state.turnCount + 3)
          : state.turnCount + 3,
      );
    }

    if (zone.consumable) {
      consumedZoneIds.push(zone.id);
    }
  });
  if (consumedZoneIds.length) {
    state.squareZones = state.squareZones.filter((zone) => !consumedZoneIds.includes(zone.id));
  }
}

function applyAfterMoveRuleEffects(state, moveContext) {
  const { pieceId, move, from, to, movingColor } = moveContext;
  const piece = getPiece(state, pieceId);
  if (!piece) {
    return;
  }

  state.activeRules.forEach((rule) => {
    switch (rule.ruleId) {
      case "stewards_seal":
        if (rule.data.targetPieceId === pieceId) {
          addZone(state, {
            type: "spring",
            square: from,
            icon: "🔖",
            label: "Steward's Seal",
            expiresAtTurn: Math.min(rule.expiresAtTurn, state.turnCount + 4),
            sourceRuleInstanceId: rule.instanceId,
          });
        }
        break;
      case "hearth_right":
        if (move.captured) {
          addStatus(state, pieceId, {
            ...createWardStatus(state),
            icon: "🪵",
            label: "Hearth Right",
            sourceRuleInstanceId: rule.instanceId,
            expiresAtTurn: Math.min(rule.expiresAtTurn, state.turnCount + 2),
          });
        }
        break;
      case "echo_discipline":
        if (state.lastMovedByColor[movingColor] === pieceId) {
          addStatus(state, pieceId, {
            ...createPacifistStatus(state, rule.instanceId, rule.expiresAtTurn),
            icon: "🪞",
            label: "Echo Discipline",
          });
        }
        break;
      case "center_grace":
        if (CENTER_SQUARES.includes(to)) {
          addStatus(state, pieceId, {
            ...createWardStatus(state),
            icon: "✨",
            label: "Center Grace",
            sourceRuleInstanceId: rule.instanceId,
            expiresAtTurn: Math.min(rule.expiresAtTurn, state.turnCount + 2),
          });
        }
        break;
      case "frost_ledger":
        if (CENTER_SQUARES.includes(from)) {
          addStatus(state, pieceId, {
            ...createPacifistStatus(state, rule.instanceId, rule.expiresAtTurn),
            icon: "❄️",
            label: "Frost Ledger",
          });
        }
        break;
      case "rooks_ribbon":
        if (piece.type === "r") {
          addZone(state, {
            type: "spring",
            square: from,
            icon: "🎀",
            label: "Rook's Ribbon",
            expiresAtTurn: Math.min(rule.expiresAtTurn, state.turnCount + 4),
            sourceRuleInstanceId: rule.instanceId,
          });
        }
        break;
      case "bishops_ash":
        if (piece.type === "b") {
          addZone(state, {
            type: "cinder",
            square: from,
            icon: "🪶",
            label: "Bishop's Ash",
            expiresAtTurn: Math.min(rule.expiresAtTurn, state.turnCount + 4),
            sourceRuleInstanceId: rule.instanceId,
          });
        }
        break;
      case "knights_halo":
        if (piece.type === "n" && isLightSquare(to)) {
          addStatus(state, pieceId, {
            ...createWardStatus(state),
            icon: "🌙",
            label: "Knight's Halo",
            sourceRuleInstanceId: rule.instanceId,
            expiresAtTurn: Math.min(rule.expiresAtTurn, state.turnCount + 2),
          });
        }
        break;
      case "dark_choir":
        if (piece.type === "b" && isDarkSquare(to)) {
          addStatus(state, pieceId, {
            ...createWardStatus(state),
            icon: "⛪",
            label: "Dark Choir",
            sourceRuleInstanceId: rule.instanceId,
            expiresAtTurn: Math.min(rule.expiresAtTurn, state.turnCount + 2),
          });
        }
        break;
      case "pawn_toll":
        if (piece.type === "p" && move.flags.includes("b")) {
          addStatus(state, pieceId, {
            ...createPacifistStatus(state, rule.instanceId, rule.expiresAtTurn),
            icon: "⏳",
            label: "Pawn Toll",
          });
        }
        break;
      case "crown_drift":
        addStatus(state, pieceId, {
          ...createRootedStatus(
            state.movesByColor[movingColor] + 1,
            rule.instanceId,
            rule.expiresAtTurn,
          ),
          icon: "🌊",
          label: "Crown Drift",
        });
        break;
      case "far_travelers":
        if (
          (piece.type === "n" || piece.type === "b") &&
          getHalfSquares(piece.color, "enemy").includes(to)
        ) {
          addStatus(state, pieceId, {
            ...createWardStatus(state),
            icon: "🧳",
            label: "Far Travelers",
            sourceRuleInstanceId: rule.instanceId,
            expiresAtTurn: Math.min(rule.expiresAtTurn, state.turnCount + 2),
          });
        }
        break;
      case "mirror_tithe":
        if (move.captured && isDarkSquare(from)) {
          addStatus(state, pieceId, {
            ...createRootedStatus(
              state.movesByColor[movingColor] + 1,
              rule.instanceId,
              rule.expiresAtTurn,
            ),
            icon: "💠",
            label: "Mirror Tithe",
          });
        }
        break;
      case "ember_wake":
        addZone(state, {
          type: "shock",
          square: from,
          icon: "♨️",
          label: "Ember Wake",
          expiresAtTurn: Math.min(rule.expiresAtTurn, state.turnCount + 3),
          sourceRuleInstanceId: rule.instanceId,
          affects: "all",
          consumable: true,
        });
        break;
      case "chain_static":
        if (rule.owner === movingColor) {
          getAdjacentEnemyPieceIds(state, to, movingColor, true).forEach((enemyPieceId) => {
            shockPiece(
              state,
              enemyPieceId,
              rule.instanceId,
              "🔗",
              "Chain Static",
              Math.min(rule.expiresAtTurn, state.turnCount + 3),
            );
          });
        }
        break;
      case "aftershock_tithe":
        if (move.captured) {
          shockPiece(
            state,
            pieceId,
            rule.instanceId,
            "🫨",
            "Aftershock Tithe",
            Math.min(rule.expiresAtTurn, state.turnCount + 3),
          );
          const allyId = getAdjacentAlliedPieceIds(state, to, movingColor, true)
            .find((candidateId) => candidateId !== pieceId);
          if (allyId) {
            shockPiece(
              state,
              allyId,
              rule.instanceId,
              "🫨",
              "Aftershock Tithe",
              Math.min(rule.expiresAtTurn, state.turnCount + 3),
            );
          }
        }
        break;
      case "storm_collar":
        if (rule.data.targetPieceId === pieceId) {
          addStatus(state, pieceId, {
            ...createRootedStatus(
              state.movesByColor[movingColor] + 1,
              rule.instanceId,
              rule.expiresAtTurn,
            ),
            icon: "🌪️",
            label: "Storm Collar",
          });
        }
        break;
      default:
        break;
    }
  });

  if (hasStatus(state, piece, "shockTouch")) {
    getAdjacentEnemyPieceIds(state, to, movingColor, true).forEach((enemyPieceId) => {
      shockPiece(
        state,
        enemyPieceId,
        getStatusList(state, piece).find((status) => status.type === "shockTouch")?.sourceRuleInstanceId,
        "⚡",
        "Static Clasp",
        state.turnCount + 3,
      );
    });
  }

  applyZoneEntryEffects(state, pieceId, to);
}

function getCapturedSquare(move) {
  if (!move.flags.includes("e")) {
    return move.to;
  }
  const targetRank = Number(move.to[1]);
  return `${move.to[0]}${move.color === "w" ? targetRank - 1 : targetRank + 1}`;
}

function updatePieceRegistry(state, move, pieceId) {
  const piece = getPiece(state, pieceId);
  if (!piece) {
    return null;
  }

  delete state.boardMap[move.from];

  let capturedPieceId = null;
  let capturedPieceSnapshot = null;
  if (move.captured) {
    const capturedSquare = getCapturedSquare(move);
    capturedPieceId = state.boardMap[capturedSquare];
    capturedPieceSnapshot = capturedPieceId ? cloneSerializable(state.pieceStates[capturedPieceId]) : null;
    delete state.boardMap[capturedSquare];
    delete state.pieceStates[capturedPieceId];
  }

  piece.square = move.to;
  piece.type = move.promotion ?? move.piece;
  state.boardMap[move.to] = pieceId;

  if (move.flags.includes("k")) {
    const rookFrom = move.color === "w" ? "h1" : "h8";
    const rookTo = move.color === "w" ? "f1" : "f8";
    const rookId = state.boardMap[rookFrom];
    if (rookId) {
      delete state.boardMap[rookFrom];
      state.boardMap[rookTo] = rookId;
      state.pieceStates[rookId].square = rookTo;
    }
  }

  if (move.flags.includes("q")) {
    const rookFrom = move.color === "w" ? "a1" : "a8";
    const rookTo = move.color === "w" ? "d1" : "d8";
    const rookId = state.boardMap[rookFrom];
    if (rookId) {
      delete state.boardMap[rookFrom];
      state.boardMap[rookTo] = rookId;
      state.pieceStates[rookId].square = rookTo;
    }
  }

  return { capturedPieceId, capturedPieceSnapshot };
}

function isMoveBlockedByRules(state, move, pieceId) {
  const piece = getPiece(state, pieceId);
  const target = move.captured ? getPieceAtSquare(state, getCapturedSquare(move)) : null;
  if (!piece) {
    return true;
  }

  if (hasStatus(state, piece, "rooted")) {
    return true;
  }

  if (move.captured && hasStatus(state, piece, "pacifist")) {
    return true;
  }

  if (move.captured && target && hasStatus(state, target, "ward")) {
    return true;
  }

  const targetZones = getZonesOnSquare(state, move.to);
  if (move.captured && targetZones.some((zone) => zone.type === "sanctuary")) {
    return true;
  }

  if (
    move.captured &&
    targetZones.some((zone) => zone.type === "hush") &&
    (piece.type === "b" || piece.type === "r" || piece.type === "q")
  ) {
    return true;
  }

  for (const rule of state.activeRules) {
    if (
      rule.ruleId === "border_edict" &&
      rule.owner === piece.color &&
      (piece.type === "n" || piece.type === "b") &&
      isEdgeSquare(move.to)
    ) {
      return true;
    }

    if (
      rule.ruleId === "court_respite" &&
      piece.type === "q" &&
      move.captured &&
      targetZones.some((zone) => zone.type === "sanctuary" || zone.type === "spring")
    ) {
      return true;
    }

    if (rule.ruleId === "harbor_law" && move.captured && (move.to[0] === "a" || move.to[0] === "h")) {
      return true;
    }
  }

  return false;
}

export function createInitialGameState(mode = "singleplayer", ruleSet = "classic") {
  const { pieces, boardMap } = createInitialPieces();
  return {
    id: createId("game"),
    mode,
    ruleSet,
    fen: new Chess().fen(),
    turnCount: 0,
    movesByColor: { w: 0, b: 0 },
    pieceStates: pieces,
    boardMap,
    squareZones: [],
    activeRules: [],
    pendingRules: [],
    selectionPhase: null,
    moveHistory: [],
    lastMovedByColor: { w: null, b: null },
    result: null,
    paused: false,
    pauseReason: null,
  };
}

export function getLegalMoves(state, forceColor = null, allowOffTurn = false) {
  const activeChess = getChess(state);
  const turn = activeChess.turn();
  const color = forceColor ?? turn;
  const chess =
    color === turn || !allowOffTurn
      ? activeChess
      : new Chess(getFenWithTurn(state.fen, color));

  if (state.result || state.paused || state.selectionPhase) {
    return [];
  }

  if (color !== turn && !allowOffTurn) {
    return [];
  }

  return chess
    .moves({ verbose: true })
    .map((move) => ({
      ...move,
      pieceId: state.boardMap[move.from],
    }))
    .filter((move) => !isMoveBlockedByRules(state, move, move.pieceId));
}

export function getLegalMovesForSquare(state, square) {
  return getLegalMoves(state).filter((move) => move.from === square);
}

export function applyMove(state, request) {
  const nextState = cloneSerializable(state);
  const chess = getChess(nextState);
  const legalMoves = getLegalMoves(nextState);
  const selectedMove = legalMoves.find(
    (move) =>
      move.from === request.from &&
      move.to === request.to &&
      (request.promotion ? move.promotion === request.promotion : true),
  );

  if (!selectedMove) {
    return { ok: false, error: "Illegal move under the current rules." };
  }

  const pieceId = nextState.boardMap[request.from];
  const movingColor = selectedMove.color;
  const move = chess.move({
    from: request.from,
    to: request.to,
    promotion: request.promotion ?? "q",
  });

  if (!move) {
    return { ok: false, error: "Move could not be applied." };
  }

  const { capturedPieceId, capturedPieceSnapshot } = updatePieceRegistry(nextState, move, pieceId);
  nextState.fen = chess.fen();
  nextState.turnCount += 1;
  nextState.movesByColor[movingColor] += 1;

  const movedPiece = getPiece(nextState, pieceId);
  if (movedPiece) {
    movedPiece.statuses = getStatusList(nextState, movedPiece).filter((status) => !status.clearOnMove);
  }

  applyAfterMoveRuleEffects(nextState, {
    pieceId,
    move,
    from: request.from,
    to: request.to,
    movingColor,
  });

  if (move.captured && movedPiece && hasStatus(nextState, movedPiece, "volatile")) {
    shockAdjacentPieces(nextState, move.to, getStatusList(nextState, movedPiece)
      .find((status) => status.type === "volatile")?.sourceRuleInstanceId, null, false, "💥", "Volatile Crest");
  }

  if (move.captured && capturedPieceSnapshot?.statuses?.some((status) => status.type === "volatile")) {
    const volatileStatus = capturedPieceSnapshot.statuses.find((status) => status.type === "volatile");
    shockAdjacentPieces(
      nextState,
      capturedPieceSnapshot.square,
      volatileStatus?.sourceRuleInstanceId,
      null,
      false,
      "💥",
      "Volatile Crest",
    );
  }

  if (move.captured && capturedPieceSnapshot?.statuses?.some((status) => status.type === "riposte")) {
    const riposteStatus = capturedPieceSnapshot.statuses.find((status) => status.type === "riposte");
    shockPiece(nextState, pieceId, riposteStatus?.sourceRuleInstanceId, "🗡️", "Riposte Shroud");
  }

  nextState.moveHistory.push({
    kind: "move",
    turnCount: nextState.turnCount,
    color: movingColor,
    san: move.san,
    from: move.from,
    to: move.to,
    piece: move.piece,
    captured: move.captured ?? null,
    capturedPieceId,
    note: chess.inCheck() ? "Check" : null,
  });

  nextState.lastMovedByColor[movingColor] = pieceId;

  pruneTransientState(nextState);
  activateDueRules(nextState);

  if (chess.isCheckmate()) {
    nextState.result = {
      winner: movingColor,
      reason: "checkmate",
    };
  } else if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition()) {
    nextState.result = {
      winner: null,
      reason: "draw",
    };
  } else {
    maybeStartRuleSelection(nextState);
  }

  return { ok: true, state: nextState };
}

export function applyRuleSelection(state, ruleId, player) {
  const nextState = cloneSerializable(state);

  if (!nextState.selectionPhase) {
    return { ok: false, error: "No rule selection is active." };
  }

  if (nextState.selectionPhase.player !== player) {
    return { ok: false, error: "It is not your rule choice." };
  }

  const chosen = nextState.selectionPhase.choices.find((choice) => choice.ruleId === ruleId);
  if (!chosen) {
    return { ok: false, error: "This rule is not available." };
  }

  const definition = RULE_BY_ID[ruleId];
  nextState.pendingRules.push({
    instanceId: createId("rule"),
    ruleId,
    owner: player,
    activatesAtTurn: nextState.turnCount + chosen.delay,
    delay: chosen.delay,
    name: definition.name,
    icon: definition.icon,
    description: definition.description,
  });
  nextState.moveHistory.push({
    kind: "rule-picked",
    turnCount: nextState.turnCount,
    text: `${definition.icon} ${definition.name} selected by ${player === "w" ? "White" : "Black"}`,
  });
  nextState.selectionPhase = null;

  return { ok: true, state: nextState };
}

export function restartGame(state) {
  const fresh = createInitialGameState(state.mode, state.ruleSet);
  return fresh;
}

export function buildClientState(state) {
  const clone = cloneSerializable(state);
  const chess = getChess(clone);
  pruneTransientState(clone);
  return {
    ...clone,
    turn: chess.turn(),
    inCheck: chess.inCheck(),
    legalMoveCount: getLegalMoves(clone).length,
    squareEffects: getAllZones(clone),
    activeRulesView: clone.activeRules.map((rule) => ({
      ...rule,
      remainingTurns: Math.max(rule.expiresAtTurn - clone.turnCount, 0),
    })),
    pendingRulesView: clone.pendingRules.map((rule) => ({
      ...rule,
      remainingTurns: Math.max(rule.activatesAtTurn - clone.turnCount, 0),
    })),
  };
}

export function getPieceGlyph(piece) {
  const glyphs = {
    wk: "♔",
    wq: "♕",
    wr: "♖",
    wb: "♗",
    wn: "♘",
    wp: "♙",
    bk: "♚",
    bq: "♛",
    br: "♜",
    bb: "♝",
    bn: "♞",
    bp: "♟",
  };
  return glyphs[`${piece.color}${piece.type}`];
}

function evaluateMoveHeuristic(state, move) {
  let score = 0;
  if (move.captured) {
    score += PIECE_VALUES[move.captured] * 10;
  }
  if (CENTER_SQUARES.includes(move.to)) {
    score += 3;
  }
  if (move.flags.includes("k") || move.flags.includes("q")) {
    score += 2;
  }
  if (move.promotion) {
    score += 9;
  }
  const next = applyMove(state, move);
  if (next.ok && next.state.result?.winner === move.color) {
    score += 1000;
  }
  return score + Math.random();
}

export function chooseAIMove(state, color) {
  const legalMoves = getLegalMoves(state, color);
  if (!legalMoves.length) {
    return null;
  }
  return [...legalMoves].sort(
    (left, right) => evaluateMoveHeuristic(state, right) - evaluateMoveHeuristic(state, left),
  )[0];
}

export function chooseAIRule(state, color) {
  if (!state.selectionPhase || state.selectionPhase.player !== color) {
    return null;
  }
  return [...state.selectionPhase.choices].sort((left, right) => left.delay - right.delay)[0];
}
