// utils/initial-tiles-utils.js

/**
 * Generates and places initial tiles using the game's ruleset
 * @param {GameState} gameState - The current game state
 * @param {Object} config - Configuration for initial tile placement
 * @returns {Array} Array of valid position/tile pairs
 */
export function placeInitialTiles(gameState, config) {
    if (config.type === 'random') {
        return generateValidInitialTiles(gameState, config.count);
    } else if (config.type === 'arrangement') {
        if (config.style === 'border') {
            return generateBorderTiles(gameState);
        } else if (config.style === 'centre') {
            return generateCenterTile(gameState);
        }
    }
    return [];
}

/**
 * Generates a set of valid initial tiles that connect properly
 * @param {GameState} gameState - Current game state
 * @param {number} count - Number of tiles to generate
 * @returns {Array} Array of positions and tiles that form valid connections
 */
export function generateValidInitialTiles(gameState, count) {
    const positions = [];
    const placedTiles = new Map(); // Map of "x,y" -> tile
    const boardSize = gameState.boardSize;

    // Get all possible positions
    for (let y = 0; y < boardSize; y++) {
        for (let x = 0; x < boardSize; x++) {
            positions.push({ x, y });
        }
    }

    // Shuffle positions
    for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    // Place first tile randomly
    const firstPos = positions[0];
    const firstTile = generateValidTile(gameState, firstPos);
    if (firstTile) {
        placedTiles.set(`${firstPos.x},${firstPos.y}`, firstTile);
    }

    // Try to place remaining tiles
    for (let i = 1; i < count && i < positions.length; i++) {
        const pos = positions[i];
        const tile = generateValidTile(gameState, pos, placedTiles);
        if (tile) {
            placedTiles.set(`${pos.x},${pos.y}`, tile);
        }
    }

    // Convert map to array of positions and tiles
    return [...placedTiles].map(([posStr, tile]) => {
        const [x, y] = posStr.split(',').map(Number);
        return { position: { x, y }, tile };
    });
}

/**
 * Generates border tiles for the game board (global across tile sets).
 * Respects the Border Rule toggle: ON=enforce edge rule, OFF=ignore.
 * @param {GameState} gameState - Current game state
 * @returns {Array} Array of positions and tiles for the border
 */
function generateBorderTiles(gameState) {
  const N = gameState.boardSize;

  // 1) Deterministic border walk (clockwise)
  const path = [];
  for (let x = 0; x < N; x++) path.push({x, y:0});
  for (let y = 1; y < N; y++) path.push({x:N-1, y});
  for (let x = N-2; x >= 0; x--) path.push({x, y:N-1});
  for (let y = N-2; y >= 1; y--) path.push({x:0, y});

  // 2) Try to fill with backtracking
  const placed = new Map();            // "x,y" -> tile
  const maxGlobalTries = 40;           // safety valve
  let globalTry = 0;

  const tryPlace = (index) => {
    if (index >= path.length) return true; // all filled

    const pos = path[index];
    const key = `${pos.x},${pos.y}`;

    // Try a bunch of random candidates at this cell
    for (let attempts = 0; attempts < 120; attempts++) {
      const tile = gameState.tileSet.generateTile();
      tile.isStarterTile = true;

      for (let r = 0; r < 4; r++) {
        tile.rotation = r;

        if (isValidTilePlacement(gameState, pos, tile, placed, /*isBorder*/true)) {
          placed.set(key, {...tile});
          if (tryPlace(index + 1)) return true;
          placed.delete(key); // backtrack
        }
      }
    }
    return false; // no fit here -> backtrack to previous cell
  };

  while (globalTry++ < maxGlobalTries) {
    placed.clear();
    if (tryPlace(0)) {
      // success -> convert to array
      return [...placed].map(([posStr, tile]) => {
        const [x, y] = posStr.split(',').map(Number);
        return { position: {x, y}, tile };
      });
    }
  }

  // Fallback: return whatever was placed (should be rare)
  return [...placed].map(([posStr, tile]) => {
    const [x, y] = posStr.split(',').map(Number);
    return { position: {x, y}, tile };
  });
}

/**
 * Generates a single center tile
 * @param {GameState} gameState - Current game state
 * @returns {Array} Array containing a single position and tile
 */
function generateCenterTile(gameState) {
    const centerX = Math.floor(gameState.boardSize / 2);
    const centerY = Math.floor(gameState.boardSize / 2);
    const pos = { x: centerX, y: centerY };

    const tile = generateValidTile(gameState, pos, new Map());
    if (tile) {
        return [{ position: pos, tile }];
    }
    return [];
}

/**
 * Generates a valid tile for a given position
 * @param {GameState} gameState - Current game state
 * @param {Object} position - Position to place tile
 * @param {Map} placedTiles - Map of already placed tiles
 * @param {boolean} isBorder - Whether this is a border position during arrangement
 * @returns {Object|null} Valid tile or null if no valid tile found
 */
function generateValidTile(gameState, position, placedTiles = new Map(), isBorder = false) {
    const boardSize = gameState.boardSize;
    const { x, y } = position;

    // Check if position is valid
    if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) {
        return null;
    }

    // Try multiple tiles until one fits
    for (let attempts = 0; attempts < 50; attempts++) {
        const tile = gameState.tileSet.generateTile();
        tile.isStarterTile = true;

        // Try all possible rotations
        for (let rotation = 0; rotation < 4; rotation++) {
            tile.rotation = rotation;

            if (isValidTilePlacement(gameState, position, tile, placedTiles, isBorder)) {
                return tile;
            }
        }
    }

    return null;
}

/**
 * Checks if a tile placement is valid for initial seeding
 * @param {GameState} gameState - Current game state
 * @param {Object} position - Position to check
 * @param {Object} tile - Tile to check
 * @param {Map} placedTiles - Map of already placed tiles (just the seed tiles)
 * @param {boolean} isBorder - True when called from border arrangement generation
 * @returns {boolean} Whether the placement is valid
 */
function isValidTilePlacement(gameState, position, tile, placedTiles, isBorder) {
    const { x, y } = position;
    const boardSize = gameState.boardSize;

    // Get rotated sides
    let tileSides = [...tile.sides];
    for (let i = 0; i < tile.rotation; i++) {
        tileSides.unshift(tileSides.pop());
    }

    // *** Global behavior for arrangement vs. edge rule ***
    // Apply edge rule ONLY if the Border Rule option is enabled.
    // (Arrangement generation sets isBorder=true; that alone should not force the rule.)
    if (gameState.ruleset.options.enableBorderRule) {
        const isBorderPos = x === 0 || x === boardSize - 1 || y === 0 || y === boardSize - 1;
        if (isBorderPos) {
            if (gameState.tileSet.name === 'Streets') {
                // No streets on outward edges
                if ((x === 0 && tileSides[3] === 'street') ||
                    (x === boardSize - 1 && tileSides[1] === 'street') ||
                    (y === 0 && tileSides[0] === 'street') ||
                    (y === boardSize - 1 && tileSides[2] === 'street')) {
                    return false;
                }
            } else if (gameState.tileSet.name === 'Shapes') {
                // Blanks-only facing outward
                if ((x === 0 && tileSides[3] !== 'Blank') ||
                    (x === boardSize - 1 && tileSides[1] !== 'Blank') ||
                    (y === 0 && tileSides[0] !== 'Blank') ||
                    (y === boardSize - 1 && tileSides[2] !== 'Blank')) {
                    return false;
                }
            }
        }
    }

    // Check adjacent seed tiles (don’t require adjacency; just enforce matches where neighbors exist)
    const adjacent = [
        { x: x, y: y - 1, tileEdge: 0, adjacentEdge: 2 }, // top
        { x: x + 1, y: y, tileEdge: 1, adjacentEdge: 3 }, // right
        { x: x, y: y + 1, tileEdge: 2, adjacentEdge: 0 }, // bottom
        { x: x - 1, y: y, tileEdge: 3, adjacentEdge: 1 }  // left
    ];

    return adjacent.every(({ x, y, tileEdge, adjacentEdge }) => {
        if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) {
            return true;
        }

        const adjTile = placedTiles.get(`${x},${y}`);
        if (!adjTile) {
            return true;
        }

        // Get rotated sides for adjacent tile
        let adjSides = [...adjTile.sides];
        for (let i = 0; i < adjTile.rotation; i++) {
            adjSides.unshift(adjSides.pop());
        }

        // If blanks are allowed to match, let those pass
        if (gameState.ruleset.options.allowBlankMatches) {
            if (tileSides[tileEdge] === 'Blank' || adjSides[adjacentEdge] === 'Blank') {
                return true;
            }
        }

        return tileSides[tileEdge] === adjSides[adjacentEdge];
    });
}
