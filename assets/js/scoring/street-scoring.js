// assets/js/scoring/street-scoring.js
// Streets tile set scoring: shared adjacency scoring (street-to-street
// connections) plus centre pattern, intersection and centre placement
// bonuses, and path scoring between Centre Squares and Bonus Circles.
import { AdjacencyScoring } from './adjacency-scoring.js';
import { PathScoring } from './path-scoring.js';

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

    calculateBonuses(gameState, position, tile) {
        let bonus = 0;

        if (tile.centerPattern) {
            bonus += this.options.centerPatternScores[tile.centerPattern] || 0;
        }

        if (this.isIntersection(tile)) {
            bonus += this.options.intersectionBonus || 0;
        }

        if (this.isCenterPlacement(gameState, position)) {
            bonus += this.options.centerBonus || 0;
        }

        // Instant mode: path improvements score as tiles are placed.
        // End-game mode scores the longest path once, in getFinalScore.
        if (!this.options.enableEndGameBonus) {
            bonus += this.scorePathProgress(gameState, position, tile);
        }

        return bonus;
    }

    scorePathProgress(gameState, position, tile) {
        const player = gameState.getCurrentPlayer();
        if (!player) return 0;

        // Search with the candidate tile on the board; the actual placement
        // happens after scoring, so restore the cell afterwards.
        const previous = gameState.boardState[position.y][position.x];
        gameState.boardState[position.y][position.x] = tile;
        const longestPath = this.pathScoring.findLongestPathForPlayer(gameState, player.id);
        gameState.boardState[position.y][position.x] = previous;

        if (!longestPath) return 0;

        let bonus = 0;
        const best = this.bestPaths.get(player.id) || { length: 0, score: 0 };

        // One-off bonus the first time a centre-to-bonus connection is completed
        if (best.length === 0 && (this.options.completionBonus || 0) > 0) {
            bonus += this.options.completionBonus;
        }

        // Award only the improvement over the player's previous best path
        if (longestPath.length > best.length) {
            const pathScore = this.pathScoring.calculatePathScore(longestPath);
            bonus += pathScore - best.score;
            this.bestPaths.set(player.id, {
                length: longestPath.length,
                score: pathScore
            });
        }

        gameState.emit('pathUpdate', { playerId: player.id, path: longestPath });
        return bonus;
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
        // All four sides are streets (a 4-way intersection)
        return Array.isArray(tile.sides) && tile.sides.every(side => side === 'street');
    }

    isCenterPlacement(gameState, position) {
        const center = Math.floor(gameState.boardSize / 2);
        return position.x === center && position.y === center;
    }
}
