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
                ...options
            }
        });

        this.pathScoring = new PathScoring(this.options.pathPoints);
        this.bestPaths = new Map(); // playerId -> { length, score } (instant mode)
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
        gameState.boardState[position.y][position.x] = previous;

        if (!longestPath) return [];

        const entries = [];
        const best = this.bestPaths.get(player.id) || { length: 0, score: 0 };

        // One-off bonus the first time a centre-to-bonus connection is completed
        if (best.length === 0 && (this.options.completionBonus || 0) > 0) {
            entries.push({ key: 'completion', label: 'First Connection', points: this.options.completionBonus });
        }

        // Award only the improvement over the player's previous best path
        if (longestPath.length > best.length) {
            const pathScore = this.pathScoring.calculatePathScore(longestPath);
            entries.push({ key: 'paths', label: 'Path Bonus', points: pathScore - best.score });
            this.bestPaths.set(player.id, {
                length: longestPath.length,
                score: pathScore
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

    // Called after a tile is placed on the board. Finds every unclaimed border-bonus
    // tile that is now street-reachable from the player's centre squares and claims it
    // (colours it, removes neutral status). Returns the list of claimed tiles so the
    // caller can re-render them.
    claimBorderBonusTiles(gameState, player) {
        const unclaimed = [];
        for (let y = 0; y < gameState.boardSize; y++) {
            for (let x = 0; x < gameState.boardSize; x++) {
                const t = gameState.boardState[y][x];
                if (t?.isBorderBonus && !t.claimed) unclaimed.push({ x, y, tile: t });
            }
        }
        if (!unclaimed.length) return [];

        const centerSquares = this.pathScoring.findSpecialTilesForPlayer(
            gameState, 'squares', player.color
        );
        if (!centerSquares.length) return [];

        const reachable = this._streetReachableFrom(gameState, centerSquares, player.id);
        const claimed = [];
        for (const { x, y, tile } of unclaimed) {
            if (reachable.has(`${x},${y}`)) {
                tile.backgroundColor = player.color;
                tile.claimed = true;
                tile.isStarterTile = false; // now exclusively this player's circle
                claimed.push({ x, y, tile });
            }
        }
        return claimed;
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
