// assets/js/ui/setup-manager.js

export class SetupManager {
    constructor(config) {
        console.log("Initializing SetupManager...");

        // Store configuration callback
        this.onGameStart = config.onGameStart;

        // Store references to DOM elements
        this.setupScreen = document.getElementById('setup-screen');
        this.gameScreen = document.getElementById('game');
        this.startButton = document.getElementById('start-game-button');

        // Basic Settings
        this.boardSizeSelect = document.getElementById('board-size');
        this.rackSizeSelect = document.getElementById('rack-size');
        this.tileSetSelect = document.getElementById('tile-set');
        this.playerCountSelect = document.getElementById('player-count');

        // Initial Tiles Layout
        this.initialTileLayout = document.getElementById('initial-tile-layout');
        this.initialTilesInput = document.getElementById('initial-tiles');
        this.layoutTilesSelect = document.getElementById('layout-tiles');

        // Timer Controls
        this.enableTimerCheckbox = document.getElementById('enable-timer');
        this.timeLimitInput = document.getElementById('time-limit');

        // Player Names
        this.playerNamesContainer = document.getElementById('player-names-container');

        // Shapes Tileset Options
        this.enableBlankSidesCheckbox = document.getElementById('enable-blank-sides');
        this.shapeCountSelect = document.getElementById('shape-count');

        // Rule Variations
        this.enableFreePlayCheckbox = document.getElementById('enable-free-play');
        this.enableBorderRuleCheckbox = document.getElementById('enable-border-rule');

        // Scoring Options (global)
        this.starterMultiplierInput = document.getElementById('starter-multiplier');

        // Scoring Options (Streets-specific)
        this.intersectionBonusInput = document.getElementById('intersection-bonus');
        this.centerBonusInput = document.getElementById('center-bonus');
        this.pathPointsInput = document.getElementById('path-points');
        this.completionBonusInput = document.getElementById('completion-bonus');
        this.endGameScoreModeRadio = document.getElementById('score-mode-endgame');

        this.setupEventListeners();
        this.initializeOptions();
    }

    setupEventListeners() {
        // Start button handler
        if (this.startButton) {
            this.startButton.onclick = () => this.startGame();
        }

        // Player count change handler
        if (this.playerCountSelect) {
            this.playerCountSelect.addEventListener('change', () => {
                this.updatePlayerNameInputs();
            });
        }

        // Timer checkbox handler
        if (this.enableTimerCheckbox) {
            this.enableTimerCheckbox.addEventListener('change', () => {
                this.toggleTimeLimitInput();
            });
        }

        // Initial tile layout handler
        if (this.initialTileLayout) {
            this.initialTileLayout.addEventListener('change', (e) => {
                this.toggleInitialTileOptions(e.target.value);
            });
        }

        // Initial tiles value display
        if (this.initialTilesInput) {
            this.initialTilesInput.addEventListener('input', (e) => {
                const display = e.target.parentElement.querySelector('.value-display');
                if (display) {
                    display.textContent = `${e.target.value} tiles`;
                }
            });
        }

        // Tile set change handler
        if (this.tileSetSelect) {
            this.tileSetSelect.addEventListener('change', (e) => {
                this.toggleTileSetOptions(e.target.value);
            });
        }
    }

    toggleInitialTileOptions(layoutType) {
        const randomOptions = document.querySelector('.setup-option-random');
        const arrangementOptions = document.querySelector('.setup-option-arrangement');

        if (randomOptions && arrangementOptions) {
            randomOptions.style.display = layoutType === 'random' ? 'block' : 'none';
            arrangementOptions.style.display = layoutType === 'arrangement' ? 'block' : 'none';
        }
    }

    toggleTimeLimitInput() {
        const container = document.getElementById('time-limit-container');
        if (container) {
            container.style.display = this.enableTimerCheckbox.checked ? 'block' : 'none';
        }
    }

    toggleTileSetOptions(tileSet) {
        // Toggle ALL tile-set specific blocks (tile settings and scoring settings).
        // An empty display value restores each element's stylesheet default.
        document.querySelectorAll('.shapes-only').forEach(el => {
            el.style.display = tileSet === 'shapes' ? '' : 'none';
        });
        document.querySelectorAll('.streets-only').forEach(el => {
            el.style.display = tileSet === 'streets' ? '' : 'none';
        });
    }

    updatePlayerNameInputs() {
        if (!this.playerNamesContainer) return;

        const playerCount = parseInt(this.playerCountSelect.value);
        this.playerNamesContainer.innerHTML = '';

        for (let i = 1; i <= playerCount; i++) {
            const inputGroup = document.createElement('div');
            inputGroup.className = 'player-name-input';
            inputGroup.innerHTML = `
                <label for="player-${i}-name">Player ${i} Name:</label>
                <input type="text" 
                       id="player-${i}-name" 
                       name="player-${i}-name" 
                       placeholder="Enter name"
                       value="Player ${i}">
            `;
            this.playerNamesContainer.appendChild(inputGroup);
        }
    }

    getPlayerNames() {
        const names = [];
        const inputs = document.querySelectorAll('[id^="player-"][id$="-name"]');
        inputs.forEach(input => {
            names.push(input.value || input.placeholder);
        });
        return names;
    }

    getInitialTilesConfig() {
        const layoutType = this.initialTileLayout?.value || 'random';

        if (layoutType === 'random') {
            return {
                type: 'random',
                count: parseInt(this.initialTilesInput?.value || '0')
            };
        } else if (layoutType === 'arrangement') {
            return {
                type: 'arrangement',
                style: this.layoutTilesSelect?.value || 'border'
            };
        }

        // Default configuration
        return {
            type: 'random',
            count: 0
        };
    }

    // Tile-set specific options, scoped so each set only receives its own
    getTileSetOptions(tileSet) {
        if (tileSet === 'shapes') {
            return {
                enableBlankSides: this.enableBlankSidesCheckbox?.checked || false,
                shapeCount: parseInt(this.shapeCountSelect?.value || '6')
            };
        }
        return {};
    }

    // Global scoring options plus the active tile set's extras
    getScoringOptions(tileSet) {
        const options = {
            starterTileMultiplier: parseInt(this.starterMultiplierInput?.value || '2')
        };

        if (tileSet === 'streets') {
            Object.assign(options, {
                intersectionBonus: parseInt(this.intersectionBonusInput?.value || '5'),
                centerBonus: parseInt(this.centerBonusInput?.value || '5'),
                pathPoints: parseInt(this.pathPointsInput?.value || '3'),
                completionBonus: parseInt(this.completionBonusInput?.value || '20'),
                enableEndGameBonus: this.endGameScoreModeRadio?.checked || false
            });
        }

        return options;
    }

    startGame() {
        console.log("Setup Manager: Starting game...");
        const tileSet = this.tileSetSelect.value;
        const config = {
            boardSize: parseInt(this.boardSizeSelect.value),
            rackSize: parseInt(this.rackSizeSelect.value),
            tileSet,
            ruleset: 'basic',
            initialTiles: this.getInitialTilesConfig(),
            enableTimer: this.enableTimerCheckbox.checked,
            timeLimit: parseInt(this.timeLimitInput.value),
            players: this.getPlayerNames().map(name => ({ name })),

            // Tileset specific options
            tileSetOptions: this.getTileSetOptions(tileSet),

            // Rule variations (global across tile sets)
            rulesetOptions: {
                enableFreePlay: this.enableFreePlayCheckbox?.checked || false,
                enableBorderRule: this.enableBorderRuleCheckbox?.checked || false
            },

            // Scoring configuration (global + tile-set specific)
            scoringOptions: this.getScoringOptions(tileSet)
        };

        console.log("Game config:", config);

        // Hide setup screen, show game screen
        if (this.setupScreen) this.setupScreen.style.display = 'none';
        if (this.gameScreen) this.gameScreen.style.display = 'flex';

        // Call onGameStart callback with config
        if (this.onGameStart) {
            this.onGameStart(config);
        }
    }

    showSetup() {
        if (this.gameScreen) this.gameScreen.style.display = 'none';
        if (this.setupScreen) this.setupScreen.style.display = 'flex';
    }

    initializeOptions() {
        // Initialize tile set options
        if (this.tileSetSelect) {
            this.toggleTileSetOptions(this.tileSetSelect.value);
        }

        // Initialize initial tile layout options
        if (this.initialTileLayout) {
            this.toggleInitialTileOptions(this.initialTileLayout.value);
        }

        // Ensure setup screen is visible initially
        if (this.setupScreen && this.gameScreen) {
            this.setupScreen.style.display = 'flex';
            this.gameScreen.style.display = 'none';
        }

        // Initialize player names based on default player count
        this.updatePlayerNameInputs();
    }
}