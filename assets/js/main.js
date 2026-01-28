// assets/js/main.js
import { GameRegistry } from './core/game-registry.js';
import { GameState } from './core/game-state.js';
import { StreetsTileSet } from './tile-sets/streets-tileset.js';
import { ShapesTileSet } from './tile-sets/shapes-tileset.js';
import { BasicRuleset } from './rules/basic-rules.js';
import { StandardScoring } from './scoring/standard-scoring.js';
import { StreetScoring } from './scoring/street-scoring.js';
import { BoardManager } from './ui/board-manager.js';
import { RackManager } from './ui/rack-manager.js';
import { SetupManager } from './ui/setup-manager.js';
import { PlayerUIManager } from './ui/player-ui.js';

class Game {
  constructor() {
    this.registry = new GameRegistry();
    this.gameState = null;

    this.boardManager = null;
    this.rackManager = null;
    this.setupManager = null;
    this.playerUIManager = null;

    this._savedConfig = null; // latest normalized config for New Game
    this.wakeLock = null;
  }

  async initialize() {
    this.registerGameComponents();
    this.initializeManagers();
    this.setupEventListeners();
    await this.requestWakeLock();
  }

  registerGameComponents() {
    this.registry.registerTileSet('streets', new StreetsTileSet());
    this.registry.registerTileSet('shapes', new ShapesTileSet());
    this.registry.registerRuleset('basic', new BasicRuleset());
    this.registry.registerScoringSystem('standard', new StandardScoring());
    this.registry.registerScoringSystem('street', new StreetScoring(), 'streets');
  }

  initializeManagers() {
    this.boardManager = new BoardManager({
      boardElement: document.getElementById('board'),
      onTilePlaced: (position) => this.handleTilePlaced(position),
    });

    this.rackManager = new RackManager({
      rackElement: document.getElementById('rack'),
      rotateButton: document.getElementById('rotate-button'),
      showValidMovesButton: document.getElementById('show-valid-moves'),
      onTileSelected: (tile) => this.handleTileSelected(tile),
    });

    this.playerUIManager = new PlayerUIManager({
      onSkipTurn: () => this.handleSkipTurn(),
    });

    this.setupManager = new SetupManager({
      onGameStart: (config) => this.startGame(config),
    });
  }

  setupEventListeners() {
    document.getElementById('new-game-button')?.addEventListener('click', () => this.newGame());

    document.getElementById('new-game-modal')?.addEventListener('click', () => {
      document.getElementById('game-end-modal').style.display = 'none';
      this.newGame();
    });

    document.getElementById('return-setup')?.addEventListener('click', () => {
      document.getElementById('game-end-modal').style.display = 'none';
      this.setupManager.showSetup();
    });

    document.getElementById('setup-button')?.addEventListener('click', () => this.setupManager.showSetup());
    document.getElementById('rules-button')?.addEventListener('click', () => this.showRules());
    document.getElementById('close-rules')?.addEventListener('click', () => this.hideRules());

    document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
  }

  async startGame(config) {
    const normalized = this._normalizeConfig(config);
    this._savedConfig = normalized;
    await this._buildGame(normalized);
  }

  async newGame() {
    if (!this._savedConfig) {
      this.setupManager.showSetup();
      return;
    }
    const currentNames = this.playerUIManager.getPlayerNames?.();
    if (currentNames && currentNames.length) {
      this._savedConfig.players = currentNames.map((name) => ({ name }));
    }
    await this._buildGame({ ...this._savedConfig });
  }

  async _buildGame(cfg) {
    const tileSet = this.registry.getTileSet(cfg.tileSet);
    const ruleset = this.registry.getRuleset(cfg.ruleset);
    const scoringSystem = this.registry.getScoringSystemForTileSet(cfg.tileSet);

    if (tileSet && cfg.tileSetOptions) tileSet.updateOptions(cfg.tileSetOptions);
    if (ruleset && cfg.rulesetOptions) ruleset.options = { ...ruleset.options, ...cfg.rulesetOptions };
    if (scoringSystem && cfg.scoringOptions) {
      scoringSystem.options = { ...scoringSystem.options, ...cfg.scoringOptions };

      // Explicitly update path scoring instance if it exists
      if (cfg.scoringOptions.pathPoints && scoringSystem.options.pathScoring) {
        scoringSystem.options.pathScoring.pointsPerTile = cfg.scoringOptions.pathPoints;
      }
    }

    // ---- Initial tiles handling (supports both Random and Arrangement) ----
    const isObj = typeof cfg.initialTiles === 'object' && cfg.initialTiles !== null;
    const isArrangement = isObj && cfg.initialTiles.type === 'arrangement';
    const randomCount = isObj
      ? Number(cfg.initialTiles.count || 0)
      : (typeof cfg.initialTiles === 'number' ? cfg.initialTiles : 0);

    let initialTilesArg = null;
    if (isArrangement) {
      // Pass arrangement through even though it has no count
      initialTilesArg = { type: 'arrangement', style: cfg.initialTiles.style || 'border' };
    } else if (randomCount > 0) {
      initialTilesArg = { type: 'random', count: randomCount, ...(cfg.initialTiles?.style ? { style: cfg.initialTiles.style } : {}) };
    }
    // ----------------------------------------------------------------------

    this.gameState = new GameState({
      tileSet,
      ruleset,
      scoringSystem,
      boardSize: cfg.boardSize,
      rackSize: cfg.rackSize,
      players: cfg.players,
      enableTimer: cfg.enableTimer,
      timeLimit: cfg.timeLimit,
      ...(initialTilesArg ? { initialTiles: initialTilesArg } : {}) // only when needed
    });

    this.setupGameStateListeners();

    this.boardManager.initialize(this.gameState);
    this.rackManager.initialize(this.gameState);
    this.playerUIManager.initialize(this.gameState);

    // No extra initializeBoard() call here � constructor already placed starters
    // when initialTilesArg is provided (random or arrangement).

    this.updateUIForCurrentPlayer();

    this.boardManager.setupResizeListener();
    this.boardManager.resizeBoard();

    const setupScreen = document.getElementById('setup-screen');
    const gameScreen = document.getElementById('game');
    if (setupScreen && gameScreen) {
      setupScreen.style.display = 'none';
      gameScreen.style.display = 'flex';
    }
  }

  _normalizeConfig(config) {
    const norm = { ...config };

    // Preserve Arrangement objects; for Random, keep number or object with count.
    if (typeof norm.initialTiles === 'number') {
      // number: keep as-is (0 means none)
    } else if (norm.initialTiles && typeof norm.initialTiles === 'object') {
      if (norm.initialTiles.type === 'arrangement') {
        norm.initialTiles = { type: 'arrangement', style: norm.initialTiles.style || 'border' };
      } else {
        // treat anything else as random
        const c = Number(norm.initialTiles.count || 0);
        norm.initialTiles = c > 0 ? { type: 'random', count: c } : 0;
      }
    } else {
      norm.initialTiles = 0;
    }

    // Normalize players to [{name}]
    if (!norm.players || !Array.isArray(norm.players) || !norm.players.length) {
      norm.players = [{ name: 'Player 1' }];
    } else if (typeof norm.players[0] === 'string') {
      norm.players = norm.players.map(name => ({ name }));
    }

    norm.ruleset = norm.ruleset || 'basic';
    norm.tileSet = norm.tileSet || 'streets';
    norm.boardSize = norm.boardSize || 9;
    norm.rackSize = norm.rackSize || 5;
    norm.enableTimer = !!norm.enableTimer;
    norm.timeLimit = norm.timeLimit || 60;

    return norm;
  }

  setupGameStateListeners() {
    this.gameState.on('tilePlaced', ({ position, tile, score }) => {
      this.boardManager.renderTile(position, tile);
      if (score > 0) this.boardManager.showScorePopup(position, score);
    });

    this.gameState.on('turnChange', () => this.updateUIForCurrentPlayer());
    this.gameState.on('gameEnd', (finalScores) => this.showGameEndModal(finalScores));

    this.gameState.on('tileSelected', (tile) => {
      this.rackManager.updateSelectedTile(tile);
      if (this.rackManager.showingValidMoves) this.rackManager.showValidMoves();
    });

    this.gameState.on('tileRotated', ({ validMoves }) => {
      if (this.rackManager.showingValidMoves) this.boardManager.showValidMoves(validMoves);
    });
  }

  handleTilePlaced(position) {
    if (!this.gameState.selectedTile) return;
    const result = this.gameState.placeTile(position);
    if (!result.success) this.boardManager.showInvalidPlacement(position);
    else this.boardManager.clearValidMoves();
  }

  handleTileSelected(tile) { this.gameState.selectTile(tile); }
  handleSkipTurn() { this.gameState?.playerManager?.skipTurn?.(); }

  updateUIForCurrentPlayer() {
    const currentPlayer = this.gameState.getCurrentPlayer();
    this.rackManager.updateRack(currentPlayer.tiles);
    this.playerUIManager.updateCurrentPlayer(currentPlayer);
    this.boardManager.clearValidMoves();
  }

  showRules() {
    const rulesModal = document.getElementById('rules-modal');
    if (rulesModal) {
      rulesModal.style.display = 'flex';
      this.updateRulesText();
    }
  }

  hideRules() {
    const rulesModal = document.getElementById('rules-modal');
    if (rulesModal) rulesModal.style.display = 'none';
  }

  updateRulesText() {
    const setup = this.setupManager;
    const defaults = { multiplier: 2, pathPoints: 3, intersection: 5, center: 5 };

    const multiplier = this._savedConfig?.scoringOptions?.starterTileMultiplier
      ?? parseInt(setup.starterMultiplierInput?.value || defaults.multiplier);

    const pathPoints = this._savedConfig?.scoringOptions?.pathPoints
      ?? parseInt(setup.pathPointsInput?.value || defaults.pathPoints);

    const intersectionBonus = this._savedConfig?.scoringOptions?.intersectionBonus
      ?? parseInt(setup.intersectionBonusInput?.value || defaults.intersection);

    const centerBonus = this._savedConfig?.scoringOptions?.centerBonus
      ?? parseInt(setup.centerBonusInput?.value || defaults.center);

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal('rule-display-multiplier', multiplier);
    setVal('rule-display-path-points', pathPoints);
    setVal('rule-display-path-points-example', pathPoints);
    setVal('rule-display-intersection', intersectionBonus);
    setVal('rule-display-intersection-example', intersectionBonus);
    setVal('rule-display-center', centerBonus);
  }

  showGameEndModal(finalScores) {
    const modal = document.getElementById('game-end-modal');
    const scoresDiv = document.getElementById('final-scores');
    finalScores.sort((a, b) => b.score - a.score);
    const scoreHtml = finalScores
      .map((score, i) => `<p${i === 0 ? ' class="winner"' : ''}>${score.name}: ${score.score} points${i === 0 ? ' ??' : ''}</p>`)
      .join('');
    scoresDiv.innerHTML = scoreHtml;
    modal.style.display = 'block';
  }

  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator) this.wakeLock = await navigator.wakeLock.request('screen');
    } catch {
      this.setupNoSleepFallback();
    }
  }

  async handleVisibilityChange() {
    if (this.wakeLock !== null && document.visibilityState === 'visible') {
      await this.requestWakeLock();
    }
  }

  setupNoSleepFallback() {
    let last = Date.now();
    const t = setInterval(() => {
      if (Date.now() - last > 30000) window.dispatchEvent(new Event('dummy'));
    }, 30000);
    ['touchstart', 'touchmove', 'touchend', 'click', 'keydown'].forEach(ev =>
      document.addEventListener(ev, () => (last = Date.now()))
    );
    window.addEventListener('unload', () => clearInterval(t));
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const game = new Game();
  await game.initialize();
});
