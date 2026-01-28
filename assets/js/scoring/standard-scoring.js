// assets/js/scoring/standard-scoring.js
import { ScoringSystem } from '../core/base-classes.js';

export class StandardScoring extends ScoringSystem {
    constructor() {
        super({
            name: 'Standard Scoring',
            description: 'Score based on number of matching edges',
            options: {
                starterTileMultiplier: 2,
                scores: {
                    1: 1,  // 1 matching edge
                    2: 4,  // 2 matching edges
                    3: 9,  // 3 matching edges
                    4: 16  // 4 matching edges
                }
            }
        });
    }

    calculateScore(gameState, position, tile) {
        const matchCount = this.countMatches(gameState, position, tile);
        let score = this.options.scores[matchCount] || 0;

        // Apply starter tile multiplier if connected to a starter tile
        if (this.isConnectedToStarterTile(gameState, position)) {
            score *= this.options.starterTileMultiplier;
        }

        return score;
    }

    getRotatedSides(tile) {
        // Create a copy of the sides array
        let sides = [...tile.sides];
        
        // Apply rotation if specified
        if (tile.rotation) {
            for (let i = 0; i < tile.rotation; i++) {
                sides.unshift(sides.pop());
            }
        }
        return sides;
    }

    countMatches(gameState, position, tile) {
        const { x, y } = position;
        let matches = 0;

        // Get rotated sides for the placed tile
        const tileSides = this.getRotatedSides(tile);

        const adjacentPositions = [
            { x: x, y: y - 1, tileEdge: 0, adjacentEdge: 2 }, // top
            { x: x + 1, y: y, tileEdge: 1, adjacentEdge: 3 }, // right
            { x: x, y: y + 1, tileEdge: 2, adjacentEdge: 0 }, // bottom
            { x: x - 1, y: y, tileEdge: 3, adjacentEdge: 1 }  // left
        ];

        adjacentPositions.forEach(({ x, y, tileEdge, adjacentEdge }) => {
            // Skip if position is out of bounds
            if (x < 0 || x >= gameState.boardSize || y < 0 || y >= gameState.boardSize) {
                return;
            }

            const adjacentTile = gameState.boardState[y][x];
            if (!adjacentTile) return;

            // Get rotated sides for the adjacent tile
            const adjacentSides = this.getRotatedSides(adjacentTile);

            // Don't count matches with blank sides
            if (tileSides[tileEdge] === 'Blank' || adjacentSides[adjacentEdge] === 'Blank') {
                return;
            }

            // Count match if sides are the same
            if (tileSides[tileEdge] === adjacentSides[adjacentEdge]) {
                matches++;
            }
        });

        return matches;
    }

    isConnectedToStarterTile(gameState, position) {
        const { x, y } = position;
        const adjacent = [
            { x: x, y: y - 1 }, // top
            { x: x + 1, y: y }, // right
            { x: x, y: y + 1 }, // bottom
            { x: x - 1, y: y }  // left
        ];

        return adjacent.some(({ x, y }) => {
            if (x < 0 || x >= gameState.boardSize || y < 0 || y >= gameState.boardSize) {
                return false;
            }
            const tile = gameState.boardState[y][x];
            return tile?.isStarterTile === true;
        });
    }

    getFinalScore(gameState, player) {
        return player.score;
    }
}