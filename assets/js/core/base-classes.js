// core/base-classes.js
export class TileSet {
    constructor(config) {
        this.name = config.name;
        this.description = config.description;
        this.options = config.options || {};
    }

    updateOptions(newOptions) {
        this.options = {
            ...this.options,
            ...newOptions
        };
    }

    generateTile() {
        throw new Error('generateTile must be implemented by subclass');
    }

    renderTile(tile, canvas, rotation = 0) {
        throw new Error('renderTile must be implemented by subclass');
    }

    validateTile(tile) {
        throw new Error('validateTile must be implemented by subclass');
    }
}

export class Ruleset {
    constructor(config) {
        this.name = config.name;
        this.description = config.description;
        this.options = config.options || {};
    }

    isValidPlacement(gameState, position, tile) {
        throw new Error('isValidPlacement must be implemented by subclass');
    }

    getValidMoves(gameState, tile) {
        throw new Error('getValidMoves must be implemented by subclass');
    }

    onTilePlaced(gameState, position, tile) {
        throw new Error('onTilePlaced must be implemented by subclass');
    }
}

export class ScoringSystem {
    constructor(config) {
        this.name = config.name;
        this.description = config.description;
        this.options = config.options || {};
    }

    calculateScore(gameState, position, tile) {
        throw new Error('calculateScore must be implemented by subclass');
    }

    getFinalScore(gameState, player) {
        throw new Error('getFinalScore must be implemented by subclass');
    }
}