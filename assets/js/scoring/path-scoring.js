// assets/js/scoring/path-scoring.js
// Finds a player's longest continuous street path between their own
// Centre Squares and Bonus Circles. Neutral starter tiles count as circle
// endpoints for every player. Streets owned by any player can form part
// of the path; only the endpoints are player-specific.

const DEFAULT_SEARCH_BUDGET = 150000;

class PathScoring {
  constructor(pointsPerTile = 3, searchBudget = DEFAULT_SEARCH_BUDGET) {
    this.pointsPerTile = pointsPerTile;
    // Caps DFS node expansions per search so dense boards stay responsive;
    // when the cap is hit, the best path found so far is returned.
    this.searchBudget = searchBudget;
    this.playerPaths = new Map(); // playerId -> last best path found
  }

  reset() {
    this.playerPaths.clear();
  }

  findLongestPathForPlayer(gameState, playerId) {
    const playerColor = this.getPlayerColor(gameState, playerId);
    const centerSquares = this.findSpecialTilesForPlayer(gameState, 'squares', playerColor);
    const bonusCircles = this.findSpecialTilesForPlayer(gameState, 'circles', playerColor);

    if (!centerSquares.length || !bonusCircles.length) {
      this.playerPaths.set(playerId, null);
      return null;
    }

    const circleKeys = new Set(bonusCircles.map(({ x, y }) => `${x},${y}`));
    const budget = { remaining: this.searchBudget };
    let longestPath = null;

    for (const start of centerSquares) {
      const path = this.findLongestPathFrom(gameState, start, circleKeys, budget, playerId);
      if (path && (!longestPath || path.length > longestPath.length)) {
        longestPath = path;
      }
    }

    this.playerPaths.set(playerId, longestPath);
    return longestPath;
  }

  calculateEndGameBonus(gameState, playerId) {
    const path = this.findLongestPathForPlayer(gameState, playerId);
    return {
      score: this.calculatePathScore(path),
      path
    };
  }

  // Depth-first search for the longest simple path from a square to any
  // circle. Paths may pass through circles and keep extending; the best
  // endpoint hit along the way is recorded.
  // playerId is threaded through so private-lane ownership can be checked.
  // fromPos tracks the previous position so tunnel directionality is enforced.
  findLongestPathFrom(gameState, start, targetKeys, budget, playerId = null) {
    let best = null;
    const visited = new Set();
    const path = [start];

    const visit = (current, fromPos = null) => {
      if (budget.remaining-- <= 0) return;

      const key = `${current.x},${current.y}`;
      visited.add(key);

      if (path.length > 1 && targetKeys.has(key)) {
        if (!best || path.length > best.length) best = [...path];
      }

      for (const neighbor of this.getConnectedNeighbors(gameState, current, fromPos, playerId)) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        if (visited.has(neighborKey)) continue;
        path.push(neighbor);
        visit(neighbor, current);
        path.pop();
      }

      visited.delete(key);
    };

    visit(start, null);
    return best;
  }

  getPlayerColor(gameState, playerId) {
    const player = gameState.playerManager.getPlayerById(playerId);
    return player?.color ?? null;
  }

  findSpecialTilesForPlayer(gameState, patternType, playerColor) {
    const specialTiles = [];
    const targetColor = playerColor?.toLowerCase();
    const wantedPattern = patternType.toLowerCase();

    for (let y = 0; y < gameState.boardSize; y++) {
      for (let x = 0; x < gameState.boardSize; x++) {
        const tile = gameState.boardState[y][x];
        if (!tile) continue;

        const tileColor = tile.backgroundColor?.toLowerCase();
        const isColorMatch = !!tileColor && !!targetColor && tileColor === targetColor;

        // Player-owned tiles with the matching centre pattern
        if (tile.centerPattern?.toLowerCase() === wantedPattern && isColorMatch) {
          specialTiles.push({ x, y, tile });
          continue;
        }

        // Neutral starter tiles count as circle endpoints for everyone
        if (wantedPattern === 'circles' && tile.isStarterTile) {
          specialTiles.push({ x, y, tile });
        }
      }
    }
    return specialTiles;
  }

  // fromPos: the cell we arrived from (for tunnel directionality)
  // playerId: the player whose path is being searched (for private lane filtering)
  getConnectedNeighbors(gameState, position, fromPos = null, playerId = null) {
    const { x, y } = position;
    const currentTile = gameState.boardState[y][x];
    const rotatedSides = this.getRotatedSides(currentTile);
    const neighbors = [];

    const directions = [
      { dx: 0, dy: -1, currentEdge: 0, neighborEdge: 2 }, // top
      { dx: 1, dy: 0,  currentEdge: 1, neighborEdge: 3 }, // right
      { dx: 0, dy: 1,  currentEdge: 2, neighborEdge: 0 }, // bottom
      { dx: -1, dy: 0, currentEdge: 3, neighborEdge: 1 }  // left
    ];

    // Tunnel tiles only allow straight-through movement: exit direction must
    // equal entry direction (no turns).
    let allowedDx = null, allowedDy = null;
    if (currentTile.type === 'tunnel' && fromPos !== null) {
      allowedDx = x - fromPos.x;
      allowedDy = y - fromPos.y;
    }

    // Resolve the current player's index for private-lane ownership checks
    let playerIndex = -1;
    if (playerId !== null) {
      playerIndex = gameState.playerManager.players.findIndex(p => p.id === playerId);
    }

    for (const { dx, dy, currentEdge, neighborEdge } of directions) {
      if (rotatedSides[currentEdge] !== 'street') continue;

      // Tunnel: skip exits that aren't straight ahead
      if (allowedDx !== null && (dx !== allowedDx || dy !== allowedDy)) continue;

      const newX = x + dx, newY = y + dy;
      if (newX < 0 || newX >= gameState.boardSize || newY < 0 || newY >= gameState.boardSize) continue;

      const neighborTile = gameState.boardState[newY][newX];
      if (!neighborTile) continue;

      // Private lane: skip if owned by a different player
      if (
        neighborTile.type === 'private' &&
        playerIndex >= 0 &&
        neighborTile.ownedByIndex !== undefined &&
        neighborTile.ownedByIndex !== playerIndex
      ) continue;

      const neighborSides = this.getRotatedSides(neighborTile);
      if (neighborSides[neighborEdge] === 'street') {
        neighbors.push({ x: newX, y: newY, tile: neighborTile });
      }
    }
    return neighbors;
  }

  getRotatedSides(tile) {
    if (!tile) return [];
    const sides = [...tile.sides];
    if (tile.rotation) {
      for (let i = 0; i < tile.rotation; i++) sides.unshift(sides.pop());
    }
    return sides;
  }

  calculatePathScore(path) {
    return path ? path.length * this.pointsPerTile : 0;
  }

  visualizePath(path) {
    return path ? path.map(p => `(${p.x},${p.y})`).join(' -> ') : '';
  }
}

export { PathScoring };
