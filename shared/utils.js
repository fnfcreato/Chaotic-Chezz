export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];
export const RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"];
export const CENTER_SQUARES = ["d4", "e4", "d5", "e5"];

export function cloneSerializable(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function squareToCoords(square) {
  return {
    file: FILES.indexOf(square[0]),
    rank: Number(square[1]) - 1,
  };
}

export function coordsToSquare(file, rank) {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) {
    return null;
  }
  return `${FILES[file]}${rank + 1}`;
}

export function isLightSquare(square) {
  const { file, rank } = squareToCoords(square);
  return (file + rank) % 2 === 1;
}

export function isDarkSquare(square) {
  return !isLightSquare(square);
}

export function isEdgeSquare(square) {
  const { file, rank } = squareToCoords(square);
  return file === 0 || file === 7 || rank === 0 || rank === 7;
}

export function getAdjacentSquares(square, orthogonalOnly = false) {
  const { file, rank } = squareToCoords(square);
  const results = [];

  for (let df = -1; df <= 1; df += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      if (df === 0 && dr === 0) {
        continue;
      }
      if (orthogonalOnly && Math.abs(df) + Math.abs(dr) !== 1) {
        continue;
      }
      const target = coordsToSquare(file + df, rank + dr);
      if (target) {
        results.push(target);
      }
    }
  }

  return results;
}

export function getFileSquares(fileLetter) {
  return RANKS.map((rank) => `${fileLetter}${rank}`);
}

export function getHalfSquares(color, half = "enemy") {
  const enemyRanks = color === "w" ? ["5", "6", "7", "8"] : ["1", "2", "3", "4"];
  const ownRanks = color === "w" ? ["1", "2", "3", "4"] : ["5", "6", "7", "8"];
  const ranks = half === "enemy" ? enemyRanks : ownRanks;
  return FILES.flatMap((file) => ranks.map((rank) => `${file}${rank}`));
}

export function getRandomItems(items, count) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy.slice(0, count);
}

export function createId(prefix = "id") {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}
