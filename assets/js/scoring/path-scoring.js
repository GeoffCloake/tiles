// assets/js/scoring/path-scoring.js
class PathScoring {
  constructor(pointsPerTile = 3) {
    this.pointsPerTile = pointsPerTile;
    this.playerPaths = new Map();
  }

  findLongestPathForPlayer(gameState, playerId) {
    const playerColor = this.getPlayerColor(gameState, playerId);
    const centerSquares = this.findSpecialTilesForPlayer(gameState, 'squares', playerColor);
    const bonusCircles = this.findSpecialTilesForPlayer(gameState, 'circles', playerColor);

    if (!centerSquares.length || !bonusCircles.length) return null;

    let longestPath = null;
    let longestLength = 0;

    for (const start of centerSquares) {
      for (const end of bonusCircles) {
        const paths = this.findAllPathsForPlayer(gameState, start, end, playerColor);
        for (const path of paths) {
          if (path && path.length > longestLength) {
            longestPath = path;
            longestLength = path.length;
          }
        }
      }
    }

    this.playerPaths.set(playerId, longestPath);
    return longestPath;
  }

  calculateEndGameBonus(gameState, playerId) {
    const playerColor = this.getPlayerColor(gameState, playerId);

    // 1. Find all relevant start/end points for this player
    const centerSquares = this.findSpecialTilesForPlayer(gameState, 'squares', playerColor);
    const bonusCircles = this.findSpecialTilesForPlayer(gameState, 'circles', playerColor);

    if (!centerSquares.length || !bonusCircles.length) return 0;

    // 2. Find longest continuous path connecting a Center Square to ANY Bonus Circle
    // (Note: The user requested "connecting to bonus circles", possibly implicit plural.
    // Standard rule interpretation: Longest single path chain that starts at a Square and ends at a Circle)

    let longestPath = null;
    let longestPathLength = 0;

    for (const start of centerSquares) {
      // We do a BFS/DFS from each center square to find the max depth that hits a circle
      // Re-using findLongestPath logic but specifically targeting circle endpoints
      for (const end of bonusCircles) {
        const paths = this.findAllPathsForPlayer(gameState, start, end, playerColor);
        for (const path of paths) {
          if (path && path.length > longestPathLength) {
            longestPathLength = path.length;
            longestPath = path;
          }
        }
      }
    }

    return {
      score: longestPathLength * this.pointsPerTile,
      path: longestPath
    };
  }

  // FIX: use the player's assigned color, not “first rack tile”
  getPlayerColor(gameState, playerId) {
    const p = gameState.playerManager.getPlayerById(playerId);
    return p?.color ?? null;
  }

  findSpecialTilesForPlayer(gameState, patternType, playerColor) {
    const specialTiles = [];
    for (let y = 0; y < gameState.boardSize; y++) {
      for (let x = 0; x < gameState.boardSize; x++) {
        const tile = gameState.boardState[y][x];
        if (tile && tile.centerPattern?.toLowerCase() === patternType.toLowerCase() && tile.backgroundColor === playerColor) {
          specialTiles.push({ x, y, tile });
        }
      }
    }
    return specialTiles;
  }

  findAllPathsForPlayer(gameState, start, end, playerColor) {
    const visited = new Set();
    const paths = [];
    this.dfsSearch(gameState, start, end, [start], visited, paths, playerColor);
    return paths;
  }

  dfsSearch(gameState, current, end, currentPath, visited, paths, playerColor) {
    const key = `${current.x},${current.y}`;
    visited.add(key);

    if (current.x === end.x && current.y === end.y) {
      paths.push([...currentPath]);
    } else {
      const neighbors = this.getConnectedNeighbors(gameState, current, playerColor);
      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.y}`;
        if (!visited.has(neighborKey)) {
          currentPath.push(neighbor);
          this.dfsSearch(gameState, neighbor, end, currentPath, visited, paths, playerColor);
          currentPath.pop();
        }
      }
    }

    visited.delete(key);
  }

  getConnectedNeighbors(gameState, position /* , playerColor */) {
    const { x, y } = position;
    const currentTile = gameState.boardState[y][x];
    const rotatedSides = this.getRotatedSides(currentTile);
    const neighbors = [];

    const directions = [
      { dx: 0, dy: -1, currentEdge: 0, neighborEdge: 2 }, // top
      { dx: 1, dy: 0, currentEdge: 1, neighborEdge: 3 },  // right
      { dx: 0, dy: 1, currentEdge: 2, neighborEdge: 0 },  // bottom
      { dx: -1, dy: 0, currentEdge: 3, neighborEdge: 1 }  // left
    ];

    for (const { dx, dy, currentEdge, neighborEdge } of directions) {
      const newX = x + dx, newY = y + dy;
      if (newX < 0 || newX >= gameState.boardSize || newY < 0 || newY >= gameState.boardSize) continue;
      const neighborTile = gameState.boardState[newY][newX];
      if (!neighborTile) continue;
      const neighborSides = this.getRotatedSides(neighborTile);
      if (rotatedSides[currentEdge] === 'street' && neighborSides[neighborEdge] === 'street') {
        neighbors.push({ x: newX, y: newY, tile: neighborTile });
      }
    }
    return neighbors;
  }

  getRotatedSides(tile) {
    if (!tile) return [];
    let sides = [...tile.sides];
    if (tile.rotation) for (let i = 0; i < tile.rotation; i++) sides.unshift(sides.pop());
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
