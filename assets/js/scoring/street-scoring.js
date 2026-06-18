// assets/js/scoring/street-scoring.js
// Streets tile set scoring: shared adjacency scoring (street-to-street
// connections) plus centre pattern, intersection and centre placement
// bonuses, and path scoring between Centre Squares and Bonus Circles.
import { AdjacencyScoring } from './adjacency-scoring.js';
import { PathScoring } from './path-scoring.js?v=3.0';

export class StreetScoring extends AdjacencyScoring {
    constructor(options = {}) {
        super({
            name: 'Street Scoring',
            description: 'Score based on road connections, special tiles, and paths',
            options: {
                centerPatternScores: {
                    squares: 20,  // Centre square
                    circles: 10   // Bonus circle
                },
                intersectionBonus: 5,
                centerBonus: 5,
                pathPoints: 3,
                completionBonus: 20,
                enableEndGameBonus: false,
                penaltyScores: { roadblock: 10 },
                claimBonus: 5,
                connectBonus: 10,
                borderPathBonus: 15,
                ...options
            }
        });

        this.pathScoring = new PathScoring(this.options.pathPoints);
        this.bestPaths = new Map(); // playerId -> { length, score, borderReached } (instant mode)
    }

    onNewGame() {
        this.bestPaths.clear();
        this.pathScoring.reset();
        this.pathScoring.pointsPerTile = this.options.pathPoints || 3;
    }

    // Only street-to-street edges count as connections
    edgesMatch(tileSide, adjacentSide) {
        return tileSide === 'street' && adjacentSide === 'street';
    }

    bonusEntries(gameState, position, tile) {
        const entries = [];

        if (tile.centerPattern) {
            const points = this.options.centerPatternScores[tile.centerPattern] || 0;
            if (points) {
                entries.push(tile.centerPattern === 'squares'
                    ? { key: 'centerSquares', label: 'Centre Squares', points }
                    : { key: 'bonusCircles', label: 'Bonus Circles', points });
            }
        }

        if (this.isIntersection(tile) && this.options.intersectionBonus) {
            entries.push({ key: 'intersections', label: 'Intersections', points: this.options.intersectionBonus });
        }

        if (this.isCenterPlacement(gameState, position) && this.options.centerBonus) {
            entries.push({ key: 'boardCentre', label: 'Board Centre', points: this.options.centerBonus });
        }

        // Instant mode: path improvements score as tiles are placed.
        // End-game mode scores the longest path once, in getFinalScore.
        if (!this.options.enableEndGameBonus) {
            entries.push(...this.pathProgressEntries(gameState, position, tile));
        }

        if (tile.type === 'roadblock') {
            const penalty = this.options.penaltyScores?.roadblock || 0;
            if (penalty) entries.push({ key: 'roadblockPenalty', label: 'Road Block Penalty', points: -penalty });
        }

        return entries;
    }

    calculateScore(gameState, position, tile) {
        const result = super.calculateScore(gameState, position, tile);
        if (tile.centerPattern === 'speedCamera' && result.total !== 0) {
            const penalty = -Math.floor(Math.abs(result.total) / 2);
            if (penalty !== 0) {
                result.breakdown.push({ key: 'speedCamera', label: 'Speed Camera', points: penalty });
                result.total += penalty;
                result.bonus += penalty;
            }
        }
        return result;
    }

    pathProgressEntries(gameState, position, tile) {
        const player = gameState.getCurrentPlayer();
        if (!player) return [];

        // Search with the candidate tile on the board; the actual placement
        // happens after scoring, so restore the cell afterwards.
        const previous = gameState.boardState[position.y][position.x];
        gameState.boardState[position.y][position.x] = tile;
        const longestPath = this.pathScoring.findLongestPathForPlayer(gameState, player.id);

        // Check endpoint while tile is still on the board (bonus tiles are pre-placed).
        let endIsBonusTile = false;
        if (longestPath && longestPath.length > 0) {
            const endPos = longestPath[longestPath.length - 1];
            endIsBonusTile = !!gameState.boardState[endPos?.y]?.[endPos?.x]?.isBonusTile;
        }

        gameState.boardState[position.y][position.x] = previous;

        if (!longestPath) return [];

        const entries = [];
        const best = this.bestPaths.get(player.id) || { length: 0, score: 0, borderReached: false };

        // One-off bonus the first time a centre-to-bonus connection is completed
        if (best.length === 0 && (this.options.completionBonus || 0) > 0) {
            entries.push({ key: 'completion', label: 'First Connection', points: this.options.completionBonus });
        }

        // Award only the improvement over the player's previous best path
        if (longestPath.length > best.length) {
            const pathScore = this.pathScoring.calculatePathScore(longestPath);
            entries.push({ key: 'paths', label: 'Path Bonus', points: pathScore - best.score });

            // One-off bonus the first time a path terminates at a bonus tile.
            if (endIsBonusTile && !best.borderReached && (this.options.borderPathBonus || 0) > 0) {
                entries.push({ key: 'townSquarePath', label: 'Town Square Connection', points: this.options.borderPathBonus });
            }

            this.bestPaths.set(player.id, {
                length: longestPath.length,
                score: pathScore,
                borderReached: endIsBonusTile || best.borderReached,
            });
        }

        gameState.emit('pathUpdate', { playerId: player.id, path: longestPath });
        return entries;
    }

    getFinalScore(gameState, player) {
        if (this.options.enableEndGameBonus) {
            const { score: bonus, path } = this.pathScoring.calculateEndGameBonus(gameState, player.id);
            return {
                total: player.score + bonus,
                base: player.score,
                bonus,
                path
            };
        }

        // Instant mode: bonuses are already included in the score; report the split
        const bonus = player.bonusScore || 0;
        return {
            total: player.score,
            base: player.score - bonus,
            bonus,
            path: null
        };
    }

    isIntersection(tile) {
        if (tile.type === 'tunnel') return false; // flyover — streets cross but don't meet
        return Array.isArray(tile.sides) && tile.sides.every(side => side === 'street');
    }

    isCenterPlacement(gameState, position) {
        const center = Math.floor(gameState.boardSize / 2);
        return position.x === center && position.y === center;
    }

    // Two-step process called after each tile placement:
    //   Step 1 — adjacent road play → claim (star, no background yet)
    //   Step 2 — BFS from player's centre 'squares' tile → connect (background colour)
    // Both can fire on the same turn. Returns all tiles that need re-rendering.
    claimBonusTiles(gameState, player, position) {
        const toRender = [];

        // ── Step 1: adjacent road play → claim ────────────────────────────────
        if (position) {
            const { x, y } = position;
            const placedTile = gameState.boardState[y][x];
            if (placedTile) {
                let placedSides = [...placedTile.sides];
                for (let i = 0; i < (placedTile.rotation || 0); i++) placedSides.unshift(placedSides.pop());

                const dirs = [
                    { dx:  0, dy: -1, myEdge: 0, theirEdge: 2 },
                    { dx:  1, dy:  0, myEdge: 1, theirEdge: 3 },
                    { dx:  0, dy:  1, myEdge: 2, theirEdge: 0 },
                    { dx: -1, dy:  0, myEdge: 3, theirEdge: 1 },
                ];

                for (const { dx, dy, myEdge, theirEdge } of dirs) {
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || nx >= gameState.boardSize || ny < 0 || ny >= gameState.boardSize) continue;
                    const t = gameState.boardState[ny]?.[nx];
                    if (!t?.isBonusTile || t.claimed) continue;

                    let bonusSides = [...t.sides];
                    for (let i = 0; i < (t.rotation || 0); i++) bonusSides.unshift(bonusSides.pop());

                    if (placedSides[myEdge] === 'street' && bonusSides[theirEdge] === 'street') {
                        t.claimed = true;
                        t.isStarterTile = false; // no longer a neutral endpoint
                        t.claimedByColor = player.color; // for star colour
                        toRender.push({ x: nx, y: ny, tile: t });
                    }
                }
            }
        }

        // ── Step 2: BFS from centre → connect (background colour) ─────────────
        // For every claimed-but-uncoloured tile, check if this player's centre
        // square is now street-connected to it (including tiles just claimed above).
        const uncoloured = [];
        for (let cy = 0; cy < gameState.boardSize; cy++) {
            for (let cx = 0; cx < gameState.boardSize; cx++) {
                const t = gameState.boardState[cy][cx];
                if (t?.isBonusTile && t.claimed && !t.backgroundColor) uncoloured.push({ x: cx, y: cy, tile: t });
            }
        }

        if (uncoloured.length) {
            const centerSquares = this.pathScoring.findSpecialTilesForPlayer(
                gameState, 'squares', player.color
            );
            if (centerSquares.length) {
                const reachable = this._streetReachableFrom(gameState, centerSquares, player.id);
                for (const { x, y, tile } of uncoloured) {
                    if (reachable.has(`${x},${y}`)) {
                        tile.backgroundColor = player.color;
                        if (!toRender.find(c => c.x === x && c.y === y)) toRender.push({ x, y, tile, connected: true });
                        else toRender.find(c => c.x === x && c.y === y).connected = true;
                    }
                }
            }
        }

        return toRender;
    }

    // BFS: set of all cells reachable from `starts` via connected street edges.
    // Tunnels are directional — each (cell, entryDirection) pair is tracked
    // separately so a tunnel can be traversed in both axes independently without
    // allowing illegal turns through it.
    _streetReachableFrom(gameState, starts, playerId) {
        const cellVisited = new Set(starts.map(s => `${s.x},${s.y}`));
        const tunnelVisited = new Set();
        const queue = starts.map(s => ({ node: s, from: null }));

        while (queue.length) {
            const { node, from } = queue.shift();
            for (const n of this.pathScoring.getConnectedNeighbors(gameState, node, from, playerId)) {
                const key = `${n.x},${n.y}`;
                const nTile = gameState.boardState[n.y]?.[n.x];

                if (nTile?.type === 'tunnel') {
                    // Track each tunnel entry direction independently so both
                    // axes are reachable but illegal turns are not.
                    const dirKey = `${key}@${n.x - node.x},${n.y - node.y}`;
                    if (!tunnelVisited.has(dirKey)) {
                        tunnelVisited.add(dirKey);
                        cellVisited.add(key);
                        queue.push({ node: n, from: node });
                    }
                } else if (!cellVisited.has(key)) {
                    cellVisited.add(key);
                    queue.push({ node: n, from: node });
                }
            }
        }
        return cellVisited;
    }
}
