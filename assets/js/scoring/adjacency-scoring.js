// assets/js/scoring/adjacency-scoring.js
// Global adjacency scoring core shared by all tile sets.
// Tile sets specialise it via two hooks:
//   - edgesMatch(tileSide, adjacentSide): what counts as a scoring connection
//   - calculateBonuses(gameState, position, tile): extra points beyond connections
import { ScoringSystem } from '../core/base-classes.js';

export class AdjacencyScoring extends ScoringSystem {
    constructor(config = {}) {
        super({
            name: config.name || 'Adjacency Scoring',
            description: config.description || 'Score based on matching adjacent edges',
            options: {
                starterTileMultiplier: 2,
                scores: {
                    1: 1,  // 1 matching edge
                    2: 4,  // 2 matching edges
                    3: 9,  // 3 matching edges
                    4: 16  // 4 matching edges
                },
                ...config.options
            }
        });
    }

    // Called once per new game so systems can clear per-game state
    onNewGame() {}

    // Default: edges connect when identical (blank sides never score)
    edgesMatch(tileSide, adjacentSide) {
        if (tileSide === 'Blank' || adjacentSide === 'Blank') return false;
        return tileSide === adjacentSide;
    }

    // Default: no tile-set specific bonuses.
    // Subclasses return an array of { key, label, points } entries.
    bonusEntries(gameState, position, tile) {
        return [];
    }

    calculateScore(gameState, position, tile) {
        const breakdown = [];

        const matches = this.countMatches(gameState, position, tile);
        const connectionScore = this.options.scores[matches] || 0;
        if (connectionScore) {
            breakdown.push({ key: 'connections', label: 'Connections', points: connectionScore });
        }

        // Starter multiplier applies to the connection score only, never to bonuses;
        // tracked as its own component so tallies show what it contributed
        if (connectionScore && this.isConnectedToStarterTile(gameState, position)) {
            const extra = connectionScore * (this.options.starterTileMultiplier - 1);
            if (extra) {
                breakdown.push({
                    key: 'starterMultiplier',
                    label: `Starter Multiplier (×${this.options.starterTileMultiplier})`,
                    points: extra
                });
            }
        }

        const bonusItems = this.bonusEntries(gameState, position, tile).filter(e => e.points);
        breakdown.push(...bonusItems);

        const bonus = bonusItems.reduce((sum, e) => sum + e.points, 0);
        const total = breakdown.reduce((sum, e) => sum + e.points, 0);

        return { total, bonus, breakdown };
    }

    getRotatedSides(tile) {
        const sides = [...tile.sides];
        if (tile.rotation) {
            for (let i = 0; i < tile.rotation; i++) {
                sides.unshift(sides.pop());
            }
        }
        return sides;
    }

    forEachAdjacentTile(gameState, position, callback) {
        const { x, y } = position;
        const adjacentPositions = [
            { x: x, y: y - 1, tileEdge: 0, adjacentEdge: 2 }, // top
            { x: x + 1, y: y, tileEdge: 1, adjacentEdge: 3 }, // right
            { x: x, y: y + 1, tileEdge: 2, adjacentEdge: 0 }, // bottom
            { x: x - 1, y: y, tileEdge: 3, adjacentEdge: 1 }  // left
        ];

        adjacentPositions.forEach(({ x, y, tileEdge, adjacentEdge }) => {
            if (x < 0 || x >= gameState.boardSize || y < 0 || y >= gameState.boardSize) {
                return;
            }
            const adjacentTile = gameState.boardState[y][x];
            if (!adjacentTile) return;

            callback(adjacentTile, tileEdge, adjacentEdge);
        });
    }

    countMatches(gameState, position, tile) {
        const tileSides = this.getRotatedSides(tile);
        let matches = 0;

        this.forEachAdjacentTile(gameState, position, (adjacentTile, tileEdge, adjacentEdge) => {
            const adjacentSides = this.getRotatedSides(adjacentTile);
            if (this.edgesMatch(tileSides[tileEdge], adjacentSides[adjacentEdge])) {
                matches++;
            }
        });

        return matches;
    }

    isConnectedToStarterTile(gameState, position) {
        let connected = false;
        this.forEachAdjacentTile(gameState, position, (adjacentTile) => {
            if (adjacentTile.isStarterTile === true) connected = true;
        });
        return connected;
    }

    getFinalScore(gameState, player) {
        return {
            total: player.score,
            base: player.score,
            bonus: 0,
            path: null
        };
    }
}
