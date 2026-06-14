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
        document.getElementById('qs-vs-ai-btn')?.addEventListener('click', () => this.quickPlayVsAI());
        document.getElementById('setup-back-btn')?.addEventListener('click', () => this.showQuickStart());

        // Tile generation presets (in the Weights modal)
        document.getElementById('weights-apply-preset')?.addEventListener('click', () => {
            const sel = document.getElementById('weights-preset');
            if (sel?.value) this.applyTilePreset(sel.value);
        });
        document.getElementById('weights-reset')?.addEventListener('click', () => this.resetTileSettings());
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
                <select id="player-${i}-ai" class="player-ai-select" title="Who controls this player">
                    <option value="">🧑 Human</option>
                    <option value="easy">🤖 Computer · Easy</option>
                    <option value="normal">🤖 Computer · Normal</option>
                    <option value="hard">🤖 Computer · Hard</option>
                </select>
            `;
            this.playerNamesContainer.appendChild(inputGroup);
        }
    }

    // Per-player setup: name plus optional computer-control level.
    getPlayerConfigs() {
        const configs = [];
        document.querySelectorAll('[id^="player-"][id$="-name"]').forEach(input => {
            const n = input.id.match(/^player-(\d+)-name$/)?.[1];
            const ai = n ? (document.getElementById(`player-${n}-ai`)?.value || null) : null;
            configs.push({ name: input.value || input.placeholder, ai: ai || null });
        });
        return configs;
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

    // Tile-set specific options, scoped so each set only receives its own.
    // playerCountOverride lets online play request per-player options for the
    // actual number of seated players, independent of the setup dropdown.
    getTileSetOptions(tileSet, playerCountOverride = null) {
        if (tileSet === 'shapes') {
            return {
                enableBlankSides: this.enableBlankSidesCheckbox?.checked || false,
                shapeCount: parseInt(this.shapeCountSelect?.value || '6')
            };
        }
        if (tileSet === 'streets') {
            const playerCount = playerCountOverride ?? parseInt(this.playerCountSelect?.value || '1');
            const perPlayerOptions = {};
            for (let i = 0; i < playerCount; i++) {
                const freq = parseInt(document.getElementById(`center-pattern-freq-p${i}`)?.value || '20') / 100;
                const circlesPct = parseInt(document.getElementById(`circles-ratio-p${i}`)?.value || '70') / 100;
                const penaltyFreq = parseInt(document.getElementById(`penalty-freq-p${i}`)?.value || '0') / 100;
                perPlayerOptions[i] = {
                    centerPatternFrequency: freq,
                    patternWeights: { circles: circlesPct, squares: 1 - circlesPct },
                    penaltyFrequency: penaltyFreq,
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
            speedCamera: m('tm-speedcam'),
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
                enableEndGameBonus: this.endGameScoreModeRadio?.checked || false,
                penaltyScores: {
                    roadblock: parseInt(document.getElementById('roadblock-penalty')?.value || '10'),
                }
            });
        }

        return options;
    }

    // Assemble a complete game config from the current form values, with no
    // side effects. Used both by Start Game and by online hosting.
    buildConfig(playerCountOverride = null) {
        const tileSet = this.tileSetSelect.value;
        return {
            boardSize: parseInt(this.boardSizeSelect.value),
            rackSize: parseInt(this.rackSizeSelect.value),
            tileSet,
            ruleset: 'basic',
            initialTiles: this.getInitialTilesConfig(),
            enableTimer: this.enableTimerCheckbox.checked,
            timeLimit: parseInt(this.timeLimitInput.value),
            players: this.getPlayerConfigs(),

            // Tileset specific options
            tileSetOptions: this.getTileSetOptions(tileSet, playerCountOverride),

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
    }

    startGame(config = null) {
        // Allow callers to pass a prebuilt config; otherwise read the form.
        if (!config || config instanceof Event) config = this.buildConfig();
        console.log("Setup Manager: Starting game...", config);

        // Hide setup/quick-start screens, show game screen
        if (this.setupScreen) this.setupScreen.style.display = 'none';
        const qs = document.getElementById('quick-start-screen'); if (qs) qs.style.display = 'none';
        if (this.gameScreen) this.gameScreen.style.display = 'flex';

        // Call onGameStart callback with config
        if (this.onGameStart) {
            this.onGameStart(config);
        }
    }

    // Quick-start shortcut: you versus one Normal computer player, using the
    // current default board/scoring settings.
    quickPlayVsAI() {
        const config = this.buildConfig(2); // per-player tile options for 2 seats
        config.players = [
            { name: 'You', ai: null },
            { name: 'Computer', ai: 'normal' },
        ];
        this.startGame(config);
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

    // ---- Tile generation presets ----

    // Base field names (without the -pN player suffix) covering every
    // per-player tile-generation control: bonus freq/mix, tile weights, maxes.
    static get _TILE_FIELDS() {
        return [
            'center-pattern-freq', 'circles-ratio',
            'tw-cross', 'tw-t', 'tw-straight', 'tw-corner', 'tw-dead', 'tw-blank',
            'tw-tunnel', 'tw-roadblock', 'tw-private',
            'tm-circles', 'tm-squares',
            'penalty-freq', 'tm-speedcam',
            'tm-cross', 'tm-t', 'tm-straight', 'tm-corner', 'tm-dead', 'tm-blank',
            'tm-tunnel', 'tm-roadblock', 'tm-private',
        ];
    }

    // Ready-made tile profiles. Each is applied to all players; tweak
    // individual tabs afterwards for asymmetric games. Any field left out
    // defaults to 0. Saved configs capture the resulting values.
    static get TILE_PRESETS() {
        const base = overrides => ({
            'center-pattern-freq': 20, 'circles-ratio': 70,
            'tw-cross': 0, 'tw-t': 0, 'tw-straight': 0, 'tw-corner': 0, 'tw-dead': 0, 'tw-blank': 0,
            'tw-tunnel': 0, 'tw-roadblock': 0, 'tw-private': 0,
            'tm-circles': 0, 'tm-squares': 0,
            'penalty-freq': 0, 'tm-speedcam': 0,
            'tm-cross': 0, 'tm-t': 0, 'tm-straight': 0, 'tm-corner': 0, 'tm-dead': 0, 'tm-blank': 0,
            'tm-tunnel': 0, 'tm-roadblock': 0, 'tm-private': 0,
            ...overrides,
        });
        return {
            'classic': {
                label: 'Classic (default)',
                values: base({ 'tw-cross': 5, 'tw-t': 15, 'tw-straight': 10, 'tw-corner': 15, 'tw-dead': 10, 'tw-blank': 5 }),
            },
            'special-tiles': {
                label: 'Special Tiles',
                values: base({
                    'circles-ratio': 60,
                    'tw-cross': 5, 'tw-t': 12, 'tw-straight': 10, 'tw-corner': 12, 'tw-dead': 8, 'tw-blank': 4,
                    'tw-tunnel': 8, 'tw-roadblock': 6, 'tw-private': 8,
                    'penalty-freq': 10, 'tm-speedcam': 0,
                }),
            },
            'highways': {
                label: 'Highways',
                values: base({
                    'center-pattern-freq': 15,
                    'tw-cross': 16, 'tw-t': 10, 'tw-straight': 28, 'tw-corner': 8, 'tw-dead': 4, 'tw-blank': 2,
                    'tw-tunnel': 6,
                }),
            },
            'sparse': {
                label: 'Sparse / Strategic',
                values: base({
                    'center-pattern-freq': 10, 'circles-ratio': 80,
                    'tw-cross': 3, 'tw-t': 8, 'tw-straight': 8, 'tw-corner': 12, 'tw-dead': 16, 'tw-blank': 16,
                }),
            },
            'bonus-rush': {
                label: 'Bonus Rush',
                values: base({
                    'center-pattern-freq': 45, 'circles-ratio': 50,
                    'tw-cross': 6, 'tw-t': 14, 'tw-straight': 12, 'tw-corner': 14, 'tw-dead': 8, 'tw-blank': 4,
                }),
            },
            'limited-specials': {
                label: 'Limited Specials (capped)',
                values: base({
                    'circles-ratio': 60,
                    'tw-cross': 5, 'tw-t': 12, 'tw-straight': 10, 'tw-corner': 12, 'tw-dead': 8, 'tw-blank': 4,
                    'tw-tunnel': 6, 'tw-roadblock': 5, 'tw-private': 6,
                    'tm-tunnel': 3, 'tm-roadblock': 2, 'tm-private': 4, 'tm-circles': 6, 'tm-squares': 4,
                }),
            },
        };
    }

    // Write a preset's values into every player tab and refresh displays.
    applyTilePreset(name) {
        const preset = SetupManager.TILE_PRESETS[name];
        if (!preset) return;
        for (let p = 0; p < 4; p++) {
            for (const [field, val] of Object.entries(preset.values)) {
                const el = document.getElementById(`${field}-p${p}`);
                if (!el) continue;
                el.value = val;
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }
    }

    resetTileSettings() {
        this.applyTilePreset('classic');
    }

    populateTilePresetSelect() {
        const sel = document.getElementById('weights-preset');
        if (!sel || sel.dataset.populated) return;
        for (const [key, p] of Object.entries(SetupManager.TILE_PRESETS)) {
            const o = document.createElement('option');
            o.value = key;
            o.textContent = p.label;
            sel.appendChild(o);
        }
        sel.dataset.populated = '1';
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
            `penalty-freq-p${i}`, `tm-speedcam-p${i}`,
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
            'roadblock-penalty',
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

        // Populate saved configs + tile preset dropdowns
        this.populateConfigSelect();
        this.populateTilePresetSelect();
    }
}