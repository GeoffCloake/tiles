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
        this.tally = {}; // key -> { label, points } accumulated per score component
        this.tiles = [];
        this.color = null;
        this.aiLevel = null; // null = human; 'easy' | 'normal' | 'hard' for bots
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

    // Rebuild a Player (with methods) from a serialized snapshot. Used when
    // adopting a remote game state in online play.
    static fromJSON(obj) {
        const p = new Player(obj.name, obj.id);
        p.score = obj.score || 0;
        p.bonusScore = obj.bonusScore || 0;
        p.tally = obj.tally || {};
        p.tiles = obj.tiles || [];
        p.color = obj.color || null;
        p.aiLevel = obj.aiLevel || null;
        return p;
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

            // Mark computer-controlled seats (null/undefined = human)
            player.aiLevel = config.ai || null;

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

        // Online: a skip advances the turn — broadcast the new state.
        this.gameState.onLocalCommit?.();
    }

    updatePlayerScore(playerId, points, bonusPoints = 0, breakdown = null) {
        const player = this.getPlayerById(playerId);
        if (player) {
            player.addScore(points);
            if (bonusPoints) player.bonusScore += bonusPoints;

            // Tally what each score was made up of
            if (Array.isArray(breakdown)) {
                breakdown.forEach(({ key, label, points: p }) => {
                    if (!p || !key) return;
                    const entry = player.tally[key] || { label, points: 0 };
                    entry.points += p;
                    player.tally[key] = entry;
                });
            }

            this.gameState.emit('scoreUpdate', player);
        }
    }
}