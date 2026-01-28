// assets/js/scoring/street-scoring.js
import { ScoringSystem } from '../core/base-classes.js';
import { PathScoring } from './path-scoring.js';

export class StreetScoring extends ScoringSystem {
    constructor() {
        super({
            name: 'Street Scoring',
            description: 'Score based on road connections, special tiles, and paths',
            options: {
                starterTileMultiplier: 2,
                scores: {
                    1: 1,  // 1 road connection
                    2: 4,  // 2 road connections
                    3: 9,  // 3 road connections
                    4: 16  // 4 road connections
                },
                centerPatternScores: {
                    squares: 20,  // Center square
                    circles: 10   // Bonus circle
                },
                pathScoring: new PathScoring(3) // 3 points per tile in path
            }
        });
        
        // Track best paths per player
        this.bestPaths = new Map(); // playerId -> {length: number, score: number}
    }

    calculateScore(gameState, position, tile) {
        let totalScore = 0;

        // 1. Calculate road connection score
        const roadConnections = this.countRoadMatches(gameState, position, tile);
        totalScore += this.options.scores[roadConnections] || 0;

        // 2. Add center pattern bonus if present
        if (tile.centerPattern) {
            totalScore += this.options.centerPatternScores[tile.centerPattern] || 0;
        }

        // 3. Apply starter tile multiplier if connected to a starter tile
        if (this.isConnectedToStarterTile(gameState, position)) {
            totalScore *= this.options.starterTileMultiplier;
        }

        // 4. Temporarily add the current tile to calculate path score
        const currentPlayer = gameState.getCurrentPlayer();
        gameState.boardState[position.y][position.x] = tile;  // Temporarily place tile

        // Now calculate path score with the new tile in place
        const longestPath = this.options.pathScoring.findLongestPathForPlayer(gameState, currentPlayer.id);
        if (longestPath) {
            const currentPathScore = this.options.pathScoring.calculatePathScore(longestPath);
            
            // Get player's best path info
            const bestPath = this.bestPaths.get(currentPlayer.id) || { length: 0, score: 0 };
            
            // Only add score if this path is longer
            if (longestPath.length > bestPath.length) {
                // Calculate additional points for the improvement
                const additionalScore = currentPathScore - bestPath.score;
                
                console.log(`New longest path for ${currentPlayer.name}:`, 
                    this.options.pathScoring.visualizePath(longestPath));
                console.log(`Path improved by ${longestPath.length - bestPath.length} tiles`);
                console.log(`Additional score: ${additionalScore}`);
                
                // Update best path
                this.bestPaths.set(currentPlayer.id, {
                    length: longestPath.length,
                    score: currentPathScore
                });
                
                // Add only the improvement points to total score
                totalScore += additionalScore;
            }
            
            // Update path length display regardless of scoring
            gameState.emit('pathUpdate', { playerId: currentPlayer.id, path: longestPath });
        }

        // Remove the temporary tile since the actual placement happens later
        gameState.boardState[position.y][position.x] = null;

        return totalScore;
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

    countRoadMatches(gameState, position, tile) {
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

            // Only count matches for road connections
            if (tileSides[tileEdge] === 'street' && adjacentSides[adjacentEdge] === 'street') {
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

    // Reset a player's best path (useful for new games)
    resetPlayerPath(playerId) {
        this.bestPaths.delete(playerId);
    }

    // Reset all player paths
    resetAllPaths() {
        this.bestPaths.clear();
    }
}