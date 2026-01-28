// assets/js/scoring/enhanced-scoring.js
// Enhanced scoring system with tileset-specific bonuses
import { ScoringSystem } from '../core/base-classes.js';

export class EnhancedStreetScoring extends ScoringSystem {
    constructor() {
        super({
            name: 'Enhanced Streets Scoring',
            description: 'Advanced scoring with bonuses for special placements',
            options: {
                starterTileMultiplier: 2,
                centerBonus: 5,
                intersectionBonus: 5,
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
        let score = 0;
        
        // Base score from matching edges
        const matchCount = this.countMatches(gameState, position, tile);
        score += this.options.scores[matchCount] || 0;

        // Center bonus
        if (this.isCenterPlacement(gameState, position)) {
            score += this.options.centerBonus;
        }

        // Intersection bonus (for tiles with all street sides)
        if (this.isIntersection(tile)) {
            score += this.options.intersectionBonus;
        }

        // Starter tile multiplier
        if (this.isConnectedToStarterTile(gameState, position)) {
            score *= this.options.starterTileMultiplier;
        }

        return score;
    }

    countMatches(gameState, position, tile) {
        const { x, y } = position;
        let matches = 0;

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

            if (tile.sides[tileEdge] === adjacentTile.sides[adjacentEdge]) {
                matches++;
            }
        });

        return matches;
    }

    isCenterPlacement(gameState, position) {
        const center = Math.floor(gameState.boardSize / 2);
        return position.x === center && position.y === center;
    }

    isIntersection(tile) {
        // Check if all sides are streets
        return tile.sides.every(side => side === 'street');
    }

    isConnectedToStarterTile(gameState, position) {
        const { x, y } = position;
        const adjacent = [
            { x: x, y: y - 1 },
            { x: x + 1, y: y },
            { x: x, y: y + 1 },
            { x: x - 1, y: y }
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