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

        // Scoring Options
        this.starterMultiplierInput = document.getElementById('starter-multiplier');
        this.intersectionBonusInput = document.getElementById('intersection-bonus');
        this.centerBonusInput = document.getElementById('center-bonus');

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
        // Toggle Shapes-specific options
        const shapeControls = document.querySelector('.shapes-only');
        const streetsControls = document.querySelector('.streets-only');

        if (shapeControls && streetsControls) {
            shapeControls.style.display = tileSet === 'shapes' ? 'block' : 'none';
            streetsControls.style.display = tileSet === 'streets' ? 'block' : 'none';
        }
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

    startGame() {
        console.log("Setup Manager: Starting game...");
        const config = {
            boardSize: parseInt(this.boardSizeSelect.value),
            rackSize: parseInt(this.rackSizeSelect.value),
            tileSet: this.tileSetSelect.value,
            ruleset: 'basic',
            initialTiles: this.getInitialTilesConfig(),
            enableTimer: this.enableTimerCheckbox.checked,
            timeLimit: parseInt(this.timeLimitInput.value),
            players: this.getPlayerNames().map(name => ({ name })),

            // Tileset specific options
            tileSetOptions: {
                enableBlankSides: this.enableBlankSidesCheckbox?.checked || false,
                shapeCount: parseInt(this.shapeCountSelect?.value || '6')
            },

            // Rule variations
            rulesetOptions: {
                enableFreePlay: this.enableFreePlayCheckbox?.checked || false,
                enableBorderRule: this.enableBorderRuleCheckbox?.checked || false
            },

            // Scoring configuration
            scoringOptions: {
                starterTileMultiplier: parseInt(this.starterMultiplierInput?.value || '2'),
                intersectionBonus: parseInt(this.intersectionBonusInput?.value || '5'),
                centerBonus: parseInt(this.centerBonusInput?.value || '5')
            }
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