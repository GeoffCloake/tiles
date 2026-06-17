// assets/js/core/game-state.js
import { PlayerManager } from './player-state.js?v=4.11';
import { DEFAULT_BOARD_SIZE, DEFAULT_RACK_SIZE } from '../utils/game-utils.js';
import { placeInitialTiles } from '../utils/initial-tiles-utils.js?v=4.21';

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

        // Online play: when locked, local input (select/rotate/place) is ignored
        // because it isn't this device's turn. Set by the OnlineManager.
        this.inputLocked = false;
        // Optional hook invoked after a committed local move, so the online
        // layer can broadcast the resulting snapshot. No-op in hotseat play.
        this.onLocalCommit = null;
        this._ended = false;
        this._finalScores = null;

        this.eventHandlers = new Map();

        this.specialStartConfig = config.specialStartTiles || null;
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
        if (this.inputLocked) return;
        this.selectedTile = tile;
        this.currentRotation = 0;
        this.emit('tileSelected', tile);
    }

    rotateTile() {
        if (this.inputLocked) return null;
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

        if (this.inputLocked) {
            return { success: false, reason: 'Not your turn' };
        }

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

        const result = this.scoringSystem.calculateScore(this, position, rotatedTile);
        // Handle object or number return
        const score = typeof result === 'object' ? result.total : result;
        const bonus = typeof result === 'object' ? result.bonus : 0;
        const breakdown = typeof result === 'object' ? result.breakdown : null;

        this.boardState[y][x] = rotatedTile;

        const currentPlayer = this.getCurrentPlayer();
        this.playerManager.updatePlayerScore(currentPlayer.id, score, bonus, breakdown);

        // Claim any bonus tiles now connected to this player's street path
        const claimed = this.scoringSystem.claimBonusTiles?.(this, currentPlayer, position) ?? [];

        // Award points for newly claimed tiles (adjacent road play, step 1)
        let claimScore = 0;
        const claimBonus = this.scoringSystem.options?.claimBonus ?? 0;
        const newlyClaimed = claimed.filter(c => !c.connected);
        if (claimBonus > 0 && newlyClaimed.length > 0) {
            claimScore += claimBonus * newlyClaimed.length;
            this.playerManager.updatePlayerScore(
                currentPlayer.id, claimScore, claimScore,
                [{ key: 'borderClaim', label: `Border Claim (×${newlyClaimed.length})`, points: claimScore }]
            );
        }
        // Award points for newly connected tiles (BFS from centre, step 2)
        const connectBonus = this.scoringSystem.options?.connectBonus ?? 0;
        const newlyConnected = claimed.filter(c => !!c.connected);
        if (connectBonus > 0 && newlyConnected.length > 0) {
            const connScore = connectBonus * newlyConnected.length;
            claimScore += connScore;
            this.playerManager.updatePlayerScore(
                currentPlayer.id, connScore, connScore,
                [{ key: 'borderConnect', label: `Centre Connected (×${newlyConnected.length})`, points: connScore }]
            );
        }

        const playerIndex = this.playerManager.players.indexOf(currentPlayer);
        const isSpecialTile = !!this.selectedTile.isSpecialStart;
        const newTile = isSpecialTile ? null : this.tileSet.generateTile(playerIndex, this.playerManager.players.length);
        this.playerManager.replaceTile(currentPlayer.id, this.selectedTile.id, newTile);

        this.selectedTile = null;
        this.currentRotation = 0;

        if (this.firstMove) {
            this.firstMove = false;
        }

        this.nextTurn();

        this.emit('tilePlaced', { position, tile: rotatedTile, score: score + claimScore, bonus: bonus + claimScore, breakdown, claimed });
        this.emit('scoreUpdate', currentPlayer);

        // Online: broadcast the resulting snapshot (no-op in hotseat play).
        this.onLocalCommit?.();

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
        const finalScores = this.playerManager.players.map(player => {
            const result = this.scoringSystem.getFinalScore(this, player);
            // Handle both simple number return (legacy/other systems) and structured object
            if (typeof result === 'object') {
                return {
                    id: player.id,
                    name: player.name,
                    score: result.total,
                    base: result.base,
                    bonus: result.bonus,
                    path: result.path
                };
            } else {
                return {
                    id: player.id,
                    name: player.name,
                    score: result
                };
            }
        });

        finalScores.sort((a, b) => b.score - a.score);

        // Record on the state so online play can broadcast the result.
        this._ended = true;
        this._finalScores = finalScores;

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
