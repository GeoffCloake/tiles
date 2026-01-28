// assets/js/core/player-state.js
import { generateId } from '../utils/game-utils.js';

export const DEFAULT_PLAYER_COLORS = [
    '#FFFFFF',  // White - Single player
    '#df0000',  // Red - Player 1
    '#008bda',  // Blue - Player 2
    '#FFE600',  // Yellow - Player 3
    '#1f9100'   // Green - Player 4
];

export class Player {
    constructor(name, id = null) {
        this.id = id || generateId();
        this.name = name;
        this.score = 0;
        this.bonusScore = 0;
        this.tiles = [];
        this.color = null;
    }

    addScore(points, isBonus = false) {
        this.score += points;
        if (isBonus) {
            this.bonusScore += points;
        }
    }

    setTiles(tiles) {
        this.tiles = tiles;
    }

    setColor(color) {
        this.color = color;
    }

    removeTile(tileId) {
        const index = this.tiles.findIndex(t => t.id === tileId);
        if (index !== -1) {
            this.tiles.splice(index, 1);
        }
    }

    addTile(tile) {
        this.tiles.push(tile);
    }
}

export class PlayerManager {
    constructor(gameState) {
        this.gameState = gameState;
        this.players = [];
        this.currentPlayerIndex = 0;
        this.turnTimer = null;
    }

    initializePlayers(playerConfigs) {
        // Use default player colors if not specified
        const playerColors = playerConfigs.map((config, index) =>
            config.color || (playerConfigs.length === 1 ? DEFAULT_PLAYER_COLORS[0] : DEFAULT_PLAYER_COLORS[index + 1]) || '#000000'
        );

        this.players = playerConfigs.map((config, index) => {
            const player = new Player(config.name);

            // Set player color
            const playerColor = playerColors[index];
            player.setColor(playerColor);

            console.log(`PlayerManager: Player ${config.name} (Index ${index}) assigned color ${playerColor}.`);

            // Initialize player's tiles
            player.setTiles(
                Array(this.gameState.rackSize)
                    .fill(null)
                    .map(() => this.gameState.tileSet.generateTile(index, playerConfigs.length))
            );

            return player;
        });
    }

    getCurrentPlayer() {
        return this.players[this.currentPlayerIndex];
    }

    nextTurn() {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        return this.getCurrentPlayer();
    }

    initializeTurnTimer(timeLimit) {
        if (this.turnTimer) {
            clearInterval(this.turnTimer);
            this.turnTimer = null;
        }

        if (!timeLimit) return;

        let timeLeft = timeLimit;
        this.turnTimer = setInterval(() => {
            timeLeft--;
            this.gameState.emit('turnTimerUpdate', timeLeft);

            if (timeLeft <= 0) {
                clearInterval(this.turnTimer);
                this.nextTurn();
                this.initializeTurnTimer(timeLimit);
                this.gameState.emit('turnChange', this.getCurrentPlayer());
            }
        }, 1000);
    }

    stopTurnTimer() {
        if (this.turnTimer) {
            clearInterval(this.turnTimer);
            this.turnTimer = null;
        }
    }

    replaceTile(playerId, oldTileId, newTile) {
        const player = this.players.find(p => p.id === playerId);
        if (player) {
            player.removeTile(oldTileId);
            player.addTile(newTile);
        }
    }

    getPlayerById(playerId) {
        return this.players.find(p => p.id === playerId);
    }

    skipTurn() {
        const nextPlayer = this.nextTurn();
        this.gameState.emit('turnChange', nextPlayer);

        if (this.turnTimer) {
            this.initializeTurnTimer(this.timeLimit);
        }
    }

    updatePlayerScore(playerId, points) {
        const player = this.getPlayerById(playerId);
        if (player) {
            player.addScore(points);
            this.gameState.emit('scoreUpdate', player);
        }
    }
}