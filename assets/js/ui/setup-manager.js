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
        this.circleScoreInput = document.getElementById('circle-score');
        this.squareScoreInput = document.getElementById('square-score');
        this.intersectionBonusInput = document.getElementById('intersection-bonus');
        this.centerBonusInput = document.getElementById('center-bonus');
        this.pathPointsInput = document.getElementById('path-points');
        this.completionBonusInput = document.getElementById('completion-bonus');
        this.endGameScoreModeRadio = document.getElementById('score-mode-endgame');

        // Tournament options
        this.enableTournamentCheckbox = document.getElementById('enable-tournament');
        this.tournamentRoundsSelect = document.getElementById('tournament-rounds');

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
                if (display) display.textContent = `${e.target.value} tiles`;
            });
        }

        // Tile set change handler
        if (this.tileSetSelect) {
            this.tileSetSelect.addEventListener('change', (e) => {
                this.toggleTileSetOptions(e.target.value);
            });
        }

        // Tournament toggle
        if (this.enableTournamentCheckbox) {
            this.enableTournamentCheckbox.addEventListener('change', () => {
                const opt = document.getElementById('tournament-rounds-option');
                if (opt) opt.style.display = this.enableTournamentCheckbox.checked ? 'block' : 'none';
            });
        }

        // Config save / load / delete
        document.getElementById('config-save-btn')?.addEventListener('click', () => this.saveCurrentConfig());
        document.getElementById('config-load-btn')?.addEventListener('click', () => this.loadSelectedConfig());
        document.getElementById('config-delete-btn')?.addEventListener('click', () => this.deleteSelectedConfig());

        document.getElementById('qs-load-play-btn')?.addEventListener('click', () => this.quickLoadAndPlay());
        document.getElementById('qs-full-setup-btn')?.addEventListener('click', () => this.showSetup());
        document.getElementById('qs-default-play-btn')?.addEventListener('click', () => this.startGame());
        document.getElementById('setup-back-btn')?.addEventListener('click', () => this.showQuickStart());
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
        if (tileSet === 'streets') {
            const playerCount = parseInt(this.playerCountSelect?.value || '1');
            const perPlayerOptions = {};
            for (let i = 0; i < playerCount; i++) {
                const freq = parseInt(document.getElementById(`center-pattern-freq-p${i}`)?.value || '20') / 100;
                const circlesPct = parseInt(document.getElementById(`circles-ratio-p${i}`)?.value || '70') / 100;
                perPlayerOptions[i] = {
                    centerPatternFrequency: freq,
                    patternWeights: { circles: circlesPct, squares: 1 - circlesPct },
                    tileWeights: this._getTileWeights(i),
                    tileMaxCounts: this._getTileMaxCounts(i),
                };
            }
            return { perPlayerOptions };
        }
        return {};
    }

    _getTileMaxCounts(playerIndex = 0) {
        const p = playerIndex;
        const m = id => Math.max(0, parseInt(document.getElementById(`${id}-p${p}`)?.value || '0', 10));
        return {
            cross: m('tm-cross'), tJunction: m('tm-t'), straight: m('tm-straight'),
            corner: m('tm-corner'), deadEnd: m('tm-dead'), blank: m('tm-blank'),
            tunnel: m('tm-tunnel'), roadblock: m('tm-roadblock'), private: m('tm-private'),
            centerCircles: m('tm-circles'), centerSquares: m('tm-squares'),
        };
    }

    // Global scoring options plus the active tile set's extras
    getScoringOptions(tileSet) {
        const options = {
            starterTileMultiplier: parseInt(this.starterMultiplierInput?.value || '2')
        };

        if (tileSet === 'streets') {
            Object.assign(options, {
                centerPatternScores: {
                    circles: parseInt(this.circleScoreInput?.value || '10'),
                    squares: parseInt(this.squareScoreInput?.value || '20')
                },
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
            scoringOptions: this.getScoringOptions(tileSet),

            // Tournament configuration
            tournament: this.enableTournamentCheckbox?.checked
                ? { enabled: true, rounds: parseInt(this.tournamentRoundsSelect?.value || '3') }
                : null
        };

        console.log("Game config:", config);

        // Hide setup/quick-start screens, show game screen
        if (this.setupScreen) this.setupScreen.style.display = 'none';
        const qs = document.getElementById('quick-start-screen'); if (qs) qs.style.display = 'none';
        if (this.gameScreen) this.gameScreen.style.display = 'flex';

        // Call onGameStart callback with config
        if (this.onGameStart) {
            this.onGameStart(config);
        }
    }

    _getTileWeights(playerIndex = 0) {
        const p = playerIndex;
        const w = (id, def) => Math.max(0, parseInt(document.getElementById(`${id}-p${p}`)?.value ?? def, 10));
        return [
            { key: 'cross',     type: 'normal',    sides: ['street','street','street','street'],                weight: w('tw-cross', 5)     },
            { key: 'tJunction', type: 'normal',    sides: ['street','street','street','non-street'],            weight: w('tw-t', 15)        },
            { key: 'straight',  type: 'normal',    sides: ['street','non-street','street','non-street'],        weight: w('tw-straight', 10) },
            { key: 'corner',    type: 'normal',    sides: ['street','street','non-street','non-street'],        weight: w('tw-corner', 15)   },
            { key: 'deadEnd',   type: 'normal',    sides: ['street','non-street','non-street','non-street'],    weight: w('tw-dead', 10)     },
            { key: 'blank',     type: 'normal',    sides: ['non-street','non-street','non-street','non-street'],weight: w('tw-blank', 5)     },
            { key: 'tunnel',    type: 'tunnel',    sides: ['street','street','street','street'],                weight: w('tw-tunnel', 0)    },
            { key: 'roadblock', type: 'roadblock', sides: ['street','street','street','street'],                weight: w('tw-roadblock', 0) },
            { key: 'private',   type: 'private',   sides: ['street','non-street','street','non-street'],        weight: w('tw-private', 0)   },
        ];
    }

    // ---- Game Configuration save / load ----

    static get _CONFIG_FIELDS() {
        const perPlayerFields = Array.from({ length: 4 }, (_, i) => [
            `center-pattern-freq-p${i}`, `circles-ratio-p${i}`,
            `tm-circles-p${i}`, `tm-squares-p${i}`,
            `tw-cross-p${i}`, `tw-t-p${i}`, `tw-straight-p${i}`, `tw-corner-p${i}`,
            `tw-dead-p${i}`, `tw-blank-p${i}`, `tw-tunnel-p${i}`, `tw-roadblock-p${i}`, `tw-private-p${i}`,
            `tm-cross-p${i}`, `tm-t-p${i}`, `tm-straight-p${i}`, `tm-corner-p${i}`,
            `tm-dead-p${i}`, `tm-blank-p${i}`, `tm-tunnel-p${i}`, `tm-roadblock-p${i}`, `tm-private-p${i}`,
        ]).flat();
        return [
            'board-size','rack-size','tile-set','player-count',
            'initial-tile-layout','initial-tiles','layout-tiles',
            'enable-timer','time-limit',
            ...perPlayerFields,
            'enable-blank-sides','shape-count',
            'enable-free-play','enable-border-rule',
            'starter-multiplier','circle-score','square-score',
            'intersection-bonus','center-bonus','path-points','completion-bonus',
            'score-mode-endgame','enable-tournament','tournament-rounds',
        ];
    }

    static _storedConfigs() {
        try { return JSON.parse(localStorage.getItem('tiles_game_configs_v1') || '[]'); }
        catch { return []; }
    }
    static _saveConfigs(list) {
        localStorage.setItem('tiles_game_configs_v1', JSON.stringify(list));
    }

    populateConfigSelect() {
        const list = SetupManager._storedConfigs();
        const opts = '<option value="">— Saved configs —</option>' +
            list.map((c, i) => `<option value="${i}">${c.name}</option>`).join('');
        const el1 = document.getElementById('config-select');
        if (el1) el1.innerHTML = opts;
        const el2 = document.getElementById('qs-config-select');
        if (el2) el2.innerHTML = opts.replace('Saved configs', 'Load saved config');
    }

    saveCurrentConfig() {
        const nameEl = document.getElementById('config-name');
        const name = nameEl?.value?.trim();
        if (!name) return;
        const values = {};
        for (const id of SetupManager._CONFIG_FIELDS) {
            const el = document.getElementById(id);
            if (!el) continue;
            values[id] = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value;
        }
        const list = SetupManager._storedConfigs();
        const idx = list.findIndex(c => c.name === name);
        if (idx >= 0) list[idx] = { name, values };
        else list.push({ name, values });
        SetupManager._saveConfigs(list);
        if (nameEl) nameEl.value = '';
        this.populateConfigSelect();
    }

    _applyConfigValues(config) {
        if (!config) return;
        for (const [id, value] of Object.entries(config.values)) {
            const el = document.getElementById(id);
            if (!el) continue;
            if (el.type === 'checkbox' || el.type === 'radio') el.checked = value;
            else el.value = value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('input',  { bubbles: true }));
        }
        this.updatePlayerNameInputs();
        this.toggleTimeLimitInput();
        this.toggleTileSetOptions(this.tileSetSelect?.value || 'streets');
    }

    loadSelectedConfig() {
        const sel = document.getElementById('config-select');
        const idx = parseInt(sel?.value);
        if (isNaN(idx) || idx < 0) return;
        this._applyConfigValues(SetupManager._storedConfigs()[idx]);
    }

    quickLoadAndPlay() {
        const sel = document.getElementById('qs-config-select');
        const idx = parseInt(sel?.value);
        if (!isNaN(idx) && idx >= 0) {
            this._applyConfigValues(SetupManager._storedConfigs()[idx]);
        }
        this.startGame();
    }

    deleteSelectedConfig() {
        const sel = document.getElementById('config-select');
        const idx = parseInt(sel?.value);
        if (isNaN(idx) || idx < 0) return;
        const list = SetupManager._storedConfigs();
        list.splice(idx, 1);
        SetupManager._saveConfigs(list);
        this.populateConfigSelect();
    }

    showQuickStart() {
        document.getElementById('quick-start-screen').style.display = 'flex';
        document.getElementById('setup-screen').style.display = 'none';
        if (this.gameScreen) this.gameScreen.style.display = 'none';
        this.populateConfigSelect();
    }

    showSetup() {
        document.getElementById('quick-start-screen').style.display = 'none';
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

        // Ensure quick-start screen is visible initially
        document.getElementById('quick-start-screen').style.display = 'flex';
        if (this.setupScreen) this.setupScreen.style.display = 'none';
        if (this.gameScreen) this.gameScreen.style.display = 'none';

        // Initialize player names based on default player count
        this.updatePlayerNameInputs();

        // Populate saved configs dropdown
        this.populateConfigSelect();
    }
}