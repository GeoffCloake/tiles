// assets/js/core/game-state.js
import { PlayerManager } from './player-state.js';
import { DEFAULT_BOARD_SIZE, DEFAULT_RACK_SIZE } from '../utils/game-utils.js';
import { placeInitialTiles } from '../utils/initial-tiles-utils.js';

export class GameState {
    constructor(config) {
        this.boardSize = config.boardSize || DEFAULT_BOARD_SIZE;
        this.rackSize = config.rackSize || DEFAULT_RACK_SIZE;
        this.tileSet = config.tileSet;
        this.ruleset = config.ruleset;
        this.scoringSystem = config.scoringSystem;

        this.boardState = Array(this.boardSize).fill(null)
            .map(() => Array(this.boardSize).fill(null));
        this.selectedTile = null;
        this.currentRotation = 0;
        this.firstMove = true;

        this.eventHandlers = new Map();

        this.playerManager = new PlayerManager(this);
        if (config.players) {
            this.playerManager.initializePlayers(config.players);
        }

        if (config.enableTimer && config.timeLimit) {
            this.playerManager.initializeTurnTimer(config.timeLimit);
        }

        if (config.initialTiles) {
            this.initializeBoard(config.initialTiles);
        }
    }

    initializeBoard(config) {
        console.log("Initializing board with config:", config);
        
        if (!config || (!config.type && !config.count)) {
            console.warn("Invalid initial tiles configuration");
            return;
        }

        if (typeof config === 'number') {
            config = {
                type: 'random',
                count: config
            };
        }

        const tileConfig = {
            type: config.type || 'random',
            count: config.count || 0,
            style: config.style || 'border'
        };

        const placedTiles = placeInitialTiles(this, tileConfig);
        
        if (placedTiles && placedTiles.length > 0) {
            placedTiles.forEach(({ position, tile }) => {
                this.boardState[position.y][position.x] = tile;
                this.emit('tilePlaced', { position, tile });
            });
            console.log(`Successfully placed ${placedTiles.length} initial tiles`);
        } else {
            console.warn("No initial tiles were placed");
        }
    }

    on(eventName, handler) {
        if (!this.eventHandlers.has(eventName)) {
            this.eventHandlers.set(eventName, new Set());
        }
        this.eventHandlers.get(eventName).add(handler);
    }

    off(eventName, handler) {
        const handlers = this.eventHandlers.get(eventName);
        if (handlers) {
            handlers.delete(handler);
        }
    }

    emit(eventName, data) {
        const handlers = this.eventHandlers.get(eventName);
        if (handlers) {
            handlers.forEach(handler => handler(data));
        }
    }

    selectTile(tile) {
        this.selectedTile = tile;
        this.currentRotation = 0;
        this.emit('tileSelected', tile);
    }

    rotateTile() {
        if (!this.selectedTile) return null;

        this.currentRotation = (this.currentRotation + 1) % 4;

        const rotatedTile = {
            ...this.selectedTile,
            sides: [...this.selectedTile.sides],
            rotation: this.currentRotation
        };

        for (let i = 0; i < this.currentRotation; i++) {
            rotatedTile.sides.unshift(rotatedTile.sides.pop());
        }

        const validMoves = this.getValidMoves(rotatedTile);

        this.emit('tileRotated', {
            rotation: this.currentRotation,
            validMoves: validMoves
        });

        return this.currentRotation;
    }

    getValidMoves(tile) {
        if (!tile) return [];

        let tileToCheck = tile;
        if (this.currentRotation > 0 && tile === this.selectedTile) {
            tileToCheck = {
                ...tile,
                sides: [...tile.sides]
            };
            for (let i = 0; i < this.currentRotation; i++) {
                tileToCheck.sides.unshift(tileToCheck.sides.pop());
            }
        }

        return this.ruleset.getValidMoves(this, tileToCheck);
    }

    placeTile(position) {
        const { x, y } = position;

        if (!this.selectedTile) {
            return { success: false, reason: 'No tile selected' };
        }

        if (this.boardState[y][x]) {
            return { success: false, reason: 'Position already occupied' };
        }

        const rotatedTile = {
            ...this.selectedTile,
            sides: [...this.selectedTile.sides],
            rotation: this.currentRotation,
            backgroundColor: this.selectedTile.backgroundColor
        };

        if (!this.ruleset.isValidPlacement(this, position, rotatedTile)) {
            return { success: false, reason: 'Invalid placement' };
        }

        const score = this.scoringSystem.calculateScore(this, position, rotatedTile);

        this.boardState[y][x] = rotatedTile;

        const currentPlayer = this.getCurrentPlayer();
        this.playerManager.updatePlayerScore(currentPlayer.id, score);

        const playerIndex = this.playerManager.players.indexOf(currentPlayer);
        const newTile = this.tileSet.generateTile(playerIndex, this.playerManager.players.length);
        this.playerManager.replaceTile(currentPlayer.id, this.selectedTile.id, newTile);

        this.selectedTile = null;
        this.currentRotation = 0;

        if (this.firstMove) {
            this.firstMove = false;
        }

        this.nextTurn();

        this.emit('tilePlaced', { position, tile: rotatedTile, score });
        this.emit('scoreUpdate', currentPlayer);

        return { success: true, score };
    }

    getCurrentPlayer() {
        return this.playerManager.getCurrentPlayer();
    }

    nextTurn() {
        const nextPlayer = this.playerManager.nextTurn();
        this.selectedTile = null;
        this.currentRotation = 0;

        this.emit('turnChange', nextPlayer);

        if (this.isGameOver()) {
            this.endGame();
        }

        return nextPlayer;
    }

    isGameOver() {
        const isBoardFull = this.boardState.every(row =>
            row.every(cell => cell !== null)
        );
        if (isBoardFull) return true;

        const hasValidMoves = this.playerManager.players.some(player =>
            player.tiles.some(tile => {
                for (let rotation = 0; rotation < 4; rotation++) {
                    const rotatedTile = {
                        ...tile,
                        sides: [...tile.sides]
                    };
                    for (let i = 0; i < rotation; i++) {
                        rotatedTile.sides.unshift(rotatedTile.sides.pop());
                    }
                    if (this.getValidMoves(rotatedTile).length > 0) {
                        return true;
                    }
                }
                return false;
            })
        );
        return !hasValidMoves;
    }

    endGame() {
        const finalScores = this.playerManager.players.map(player => ({
            id: player.id,
            name: player.name,
            score: this.scoringSystem.getFinalScore(this, player)
        }));

        finalScores.sort((a, b) => b.score - a.score);

        this.playerManager.stopTurnTimer();
        this.emit('gameEnd', finalScores);
    }

    toJSON() {
        return {
            boardSize: this.boardSize,
            rackSize: this.rackSize,
            boardState: this.boardState,
            players: this.playerManager.players,
            currentPlayerIndex: this.playerManager.currentPlayerIndex,
            firstMove: this.firstMove
        };
    }

    static fromJSON(json, config) {
        const gameState = new GameState({
            ...config,
            boardSize: json.boardSize,
            rackSize: json.rackSize
        });

        gameState.boardState = json.boardState;
        gameState.playerManager.players = json.players;
        gameState.playerManager.currentPlayerIndex = json.currentPlayerIndex;
        gameState.firstMove = json.firstMove;

        return gameState;
    }
}
