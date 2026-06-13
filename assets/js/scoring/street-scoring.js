// assets/js/scoring/street-scoring.js
// Streets tile set scoring: shared adjacency scoring (street-to-street
// connections) plus centre pattern, intersection and centre placement
// bonuses, and path scoring between Centre Squares and Bonus Circles.
import { AdjacencyScoring } from './adjacency-scoring.js';
import { PathScoring } from './path-scoring.js?v=2.5';

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

        return entries;
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
}
