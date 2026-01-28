// assets/js/rules/basic-rules.js
import { Ruleset } from '../core/base-classes.js';

export class BasicRuleset extends Ruleset {
    constructor() {
        super({
            name: 'Basic Rules',
            description: 'Standard tile matching rules',
            options: {
                requireAdjacent: true,
                allowBlankMatches: false,
                enableFreePlay: false,
                enableBorderRule: false
            }
        });
    }

    isValidPlacement(gameState, position, tile) {
        const { x, y } = position;

        // Check if position is within bounds
        if (x < 0 || x >= gameState.boardSize || y < 0 || y >= gameState.boardSize) {
            return false;
        }

        // Check if position is already occupied
        if (gameState.boardState[y][x]) {
            return false;
        }

        // Border rule check
        if (this.options.enableBorderRule) {
            const isBorder = x === 0 || x === gameState.boardSize - 1 || 
                           y === 0 || y === gameState.boardSize - 1;
            
            if (isBorder) {
                // For Streets tileset
                if (gameState.tileSet.name === 'Streets') {
                    const rotatedSides = this.getRotatedSides(tile);
                    // Check if any border-facing side is a street
                    if (x === 0 && rotatedSides[3] === 'street') return false;
                    if (x === gameState.boardSize - 1 && rotatedSides[1] === 'street') return false;
                    if (y === 0 && rotatedSides[0] === 'street') return false;
                    if (y === gameState.boardSize - 1 && rotatedSides[2] === 'street') return false;
                }
                // For Shapes tileset
                else if (gameState.tileSet.name === 'Shapes') {
                    const rotatedSides = this.getRotatedSides(tile);
                    // Check if any border-facing side is not blank
                    if (x === 0 && rotatedSides[3] !== 'Blank') return false;
                    if (x === gameState.boardSize - 1 && rotatedSides[1] !== 'Blank') return false;
                    if (y === 0 && rotatedSides[0] !== 'Blank') return false;
                    if (y === gameState.boardSize - 1 && rotatedSides[2] !== 'Blank') return false;
                }
            }
        }

        // Free play mode overrides adjacent requirement
        if (this.options.enableFreePlay) {
            return this.checkEdgeMatches(gameState, position, tile);
        }

        // Check if this is the first move of the game
        const isFirstMove = this.isFirstMove(gameState);
        
        // If it's the first move and there are no starter tiles, any position is valid
        if (isFirstMove && !this.hasAnyStarterTiles(gameState)) {
            return true;
        }

        // Must be adjacent to at least one existing tile (unless in free play mode)
        if (!this.hasAdjacentTile(gameState, position)) {
            return false;
        }

        // Check if the tile matches all adjacent sides
        return this.checkEdgeMatches(gameState, position, tile);
    }

    isFirstMove(gameState) {
        // Check if this is actually the first tile being placed by players
        return gameState.boardState.every(row => 
            row.every(cell => !cell || cell.isStarterTile)
        );
    }

    hasAnyStarterTiles(gameState) {
        // Check if there are any starter tiles on the board
        return gameState.boardState.some(row => 
            row.some(cell => cell && cell.isStarterTile)
        );
    }

    hasAdjacentTile(gameState, position) {
        const { x, y } = position;
        const adjacent = [
            { x: x, y: y - 1 }, // top
            { x: x + 1, y: y }, // right
            { x: x, y: y + 1 }, // bottom
            { x: x - 1, y: y }  // left
        ];

        return adjacent.some(pos => {
            return pos.y >= 0 && pos.y < gameState.boardSize &&
                   pos.x >= 0 && pos.x < gameState.boardSize &&
                   gameState.boardState[pos.y][pos.x] !== null;
        });
    }

    checkEdgeMatches(gameState, position, tile) {
        const { x, y } = position;
        const adjacentPositions = [
            { x: x, y: y - 1, tileEdge: 0, adjacentEdge: 2 }, // top
            { x: x + 1, y: y, tileEdge: 1, adjacentEdge: 3 }, // right
            { x: x, y: y + 1, tileEdge: 2, adjacentEdge: 0 }, // bottom
            { x: x - 1, y: y, tileEdge: 3, adjacentEdge: 1 }  // left
        ];

        return adjacentPositions.every(({ x, y, tileEdge, adjacentEdge }) => {
            // Skip if position is out of bounds
            if (x < 0 || x >= gameState.boardSize || y < 0 || y >= gameState.boardSize) {
                return true;
            }

            const adjacentTile = gameState.boardState[y][x];
            // Skip if no adjacent tile
            if (!adjacentTile) {
                return true;
            }

            // Handle blank sides if allowed
            if (this.options.allowBlankMatches) {
                if (tile.sides[tileEdge] === 'Blank' || adjacentTile.sides[adjacentEdge] === 'Blank') {
                    return true;
                }
            }

            // Get rotated sides for both tiles
            let tileSides = this.getRotatedSides(tile);
            let adjTileSides = this.getRotatedSides(adjacentTile);
            
            // Check if sides match
            return tileSides[tileEdge] === adjTileSides[adjacentEdge];
        });
    }

    getRotatedSides(tile) {
        let sides = [...tile.sides];
        if (tile.rotation) {
            for (let i = 0; i < tile.rotation; i++) {
                sides.unshift(sides.pop());
            }
        }
        return sides;
    }

    getValidMoves(gameState, tile) {
        const validMoves = [];

        // If this is the first move and no starter tiles, all empty positions are valid
        const isFirstMove = this.isFirstMove(gameState);
        const hasStarterTiles = this.hasAnyStarterTiles(gameState);

        for (let y = 0; y < gameState.boardSize; y++) {
            for (let x = 0; x < gameState.boardSize; x++) {
                // For first move with no starter tiles, any empty position is valid
                if (isFirstMove && !hasStarterTiles && !gameState.boardState[y][x]) {
                    validMoves.push({ x, y });
                    continue;
                }

                // For free play mode, check any empty position
                if (this.options.enableFreePlay && !gameState.boardState[y][x]) {
                    if (this.isValidPlacement(gameState, { x, y }, tile)) {
                        validMoves.push({ x, y });
                    }
                    continue;
                }

                // Otherwise, check normal placement rules
                if (this.isValidPlacement(gameState, { x, y }, tile)) {
                    validMoves.push({ x, y });
                }
            }
        }

        return validMoves;
    }

    onTilePlaced(gameState, position, tile) {
        // No special handling needed for basic tile placement
        return true;
    }
}