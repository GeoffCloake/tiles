// assets/js/main.js
const VERSION = '3.5';

import { GameRegistry } from './core/game-registry.js';
import { GameState } from './core/game-state.js?v=3.2';
import { Player } from './core/player-state.js';
import { StreetsTileSet } from './tile-sets/streets-tileset.js?v=3.5c';
import { ShapesTileSet } from './tile-sets/shapes-tileset.js';
import { BasicRuleset } from './rules/basic-rules.js';
import { StandardScoring } from './scoring/standard-scoring.js';
import { StreetScoring } from './scoring/street-scoring.js?v=3.2';
import { BoardManager } from './ui/board-manager.js?v=3.3a';
import { RackManager } from './ui/rack-manager.js';
import { SetupManager } from './ui/setup-manager.js?v=3.1';
import { PlayerUIManager } from './ui/player-ui.js';
import { TournamentManager } from './core/tournament.js';
import { OnlineManager } from './net/online-manager.js?v=3.0';
import { AIController } from './core/ai-player.js?v=3.1';

class Game {
  constructor() {
    this.registry = new GameRegistry();
    this.gameState = null;

    this.boardManager = null;
    this.rackManager = null;
    this.setupManager = null;
    this.playerUIManager = null;

    this._savedConfig = null; // latest normalized config for New Game
    this._freshTournament = false; // force new TournamentManager on next _buildGame
    this.tournament = null;
    this.wakeLock = null;
    this.showingPaths = false;
    this.online = null; // OnlineManager, set in initialize()
    this.ai = null;     // AIController, set in initialize()
  }

  async initialize() {
    this.registerGameComponents();
    this.initializeManagers();
    this.setupEventListeners();
    this.online = new OnlineManager(this);
    this.online.init();
    this.ai = new AIController(this);
    await this.requestWakeLock();
  }

  registerGameComponents() {
    this.registry.registerTileSet('streets', new StreetsTileSet());
    this.registry.registerTileSet('shapes', new ShapesTileSet());
    this.registry.registerRuleset('basic', new BasicRuleset());
    this.registry.registerScoringSystem('standard', new StandardScoring(), 'shapes');
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
    this._initWeightsTabs();

    document.getElementById('new-game-button')?.addEventListener('click', () => this.newGame());

    document.getElementById('new-game-modal')?.addEventListener('click', () => {
      document.getElementById('game-end-modal').style.display = 'none';
      this.newGame();
    });

    document.getElementById('view-board-modal')?.addEventListener('click', () => {
      document.getElementById('game-end-modal').style.display = 'none';
    });

    document.getElementById('return-setup')?.addEventListener('click', () => {
      document.getElementById('game-end-modal').style.display = 'none';
      if (this._exitOnline()) return;
      this.ai?.detach(); // stop any computer players from playing the old game
      this.setupManager.showSetup();
    });

    document.getElementById('setup-button')?.addEventListener('click', () => {
      if (this._exitOnline()) return;
      this.ai?.detach(); // stop any computer players from playing the old game
      this.setupManager.showSetup();
    });
    document.getElementById('show-paths')?.addEventListener('click', () => this.togglePathHighlights());

    // Click a player card while paths are on to pin that player's path; click again to unpin
    document.getElementById('player-container')?.addEventListener('click', (e) => {
      if (!this.showingPaths) return;
      const card = e.target.closest('.player-info[id^="player-"]');
      if (!card) return;
      const playerId = card.id.replace('player-', '');
      this.selectedPathPlayerId = (this.selectedPathPlayerId === playerId) ? null : playerId;
      this._updatePathPlayerIndicators();
      this.refreshPathHighlights();
    });

    // Rules modal
    document.getElementById('rules-button')?.addEventListener('click', () => this.showRules());
    document.getElementById('close-rules')?.addEventListener('click', () => this.hideRules());
    document.getElementById('close-rules-x')?.addEventListener('click', () => this.hideRules());
    const rulesModal = document.getElementById('rules-modal');
    rulesModal?.addEventListener('click', (e) => { if (e.target === rulesModal) this.hideRules(); });

    // Scoring Settings modal
    document.getElementById('scoring-button')?.addEventListener('click', () => this.showScoring());
    document.getElementById('close-scoring-x')?.addEventListener('click', () => this.hideScoring());
    const scoringModal = document.getElementById('scoring-modal');
    scoringModal?.addEventListener('click', (e) => { if (e.target === scoringModal) this.hideScoring(); });

    // Config modal
    document.getElementById('config-button')?.addEventListener('click', () => this.showConfig());
    document.getElementById('close-config-x')?.addEventListener('click', () => this.hideConfig());
    document.getElementById('setup-config-btn')?.addEventListener('click', () => this.showConfig());
    const configModal = document.getElementById('config-modal');
    configModal?.addEventListener('click', (e) => { if (e.target === configModal) this.hideConfig(); });

    // Weights modal (game sidebar, setup screen, quick-start screen)
    document.getElementById('weights-button')?.addEventListener('click', () => this.showWeights());
    document.getElementById('close-weights-x')?.addEventListener('click', () => this.hideWeights());
    document.getElementById('setup-weights-btn')?.addEventListener('click', () => this.showWeights());
    document.getElementById('qs-weights-btn')?.addEventListener('click', () => this.showWeights());
    const weightsModal = document.getElementById('weights-modal');
    weightsModal?.addEventListener('click', (e) => { if (e.target === weightsModal) this.hideWeights(); });

    // Tournament modal
    document.getElementById('tournament-next')?.addEventListener('click', () => {
      document.getElementById('tournament-modal').style.display = 'none';
      this.newGame();
    });
    document.getElementById('tournament-show-leaderboard')?.addEventListener('click', () => this.showLeaderboard());
    document.getElementById('tournament-return-setup')?.addEventListener('click', () => {
      document.getElementById('tournament-modal').style.display = 'none';
      this._freshTournament = true;
      this.tournament = null;
      this.setupManager.showSetup();
    });

    // Leaderboard modal
    document.getElementById('leaderboard-button')?.addEventListener('click', () => this.showLeaderboard());
    document.getElementById('close-leaderboard-x')?.addEventListener('click', () => this.hideLeaderboard());
    document.getElementById('close-leaderboard')?.addEventListener('click', () => this.hideLeaderboard());
    document.getElementById('clear-leaderboard')?.addEventListener('click', () => {
      TournamentManager.clearLeaderboard();
      this.showLeaderboard(); // refresh
    });
    const leaderboardModal = document.getElementById('leaderboard-modal');
    leaderboardModal?.addEventListener('click', (e) => { if (e.target === leaderboardModal) this.hideLeaderboard(); });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { this.hideRules(); this.hideScoring(); this.hideLeaderboard(); this.hideConfig(); this.hideWeights(); }
    });

    document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
  }

  async startGame(config) {
    const normalized = this._normalizeConfig(config);
    this._savedConfig = normalized;
    this._freshTournament = true; // always start a new tournament when coming from Setup
    await this._buildGame(normalized);
  }

  async newGame() {
    // In online play, "New Game" leaves the room and returns to the menu.
    if (this._exitOnline()) return;
    if (!this._savedConfig) {
      this.ai?.detach();
      this.setupManager.showSetup();
      return;
    }
    const currentNames = this.playerUIManager.getPlayerNames?.();
    if (currentNames && currentNames.length) {
      // Keep each seat's computer-control level across New Game.
      const prev = this._savedConfig.players || [];
      this._savedConfig.players = currentNames.map((name, i) => ({
        name,
        ai: prev[i]?.ai || null,
      }));
    }
    // Always re-read tileSetOptions from the current Weights modal so any
    // changes made during the game are picked up for the new game.
    const freshOpts = this.setupManager?.getTileSetOptions(this._savedConfig.tileSet);
    if (freshOpts) this._savedConfig.tileSetOptions = freshOpts;

    await this._buildGame({ ...this._savedConfig });
  }

  async _buildGame(cfg) {
    const tileSet = this.registry.getTileSet(cfg.tileSet);
    const ruleset = this.registry.getRuleset(cfg.ruleset);
    const scoringSystem = this.registry.getScoringSystemForTileSet(cfg.tileSet);

    if (tileSet && cfg.tileSetOptions) {
      tileSet.updateOptions(cfg.tileSetOptions);
      const players = Object.keys(cfg.tileSetOptions.perPlayerOptions || {}).length;
      if (players) console.log(`[_buildGame] applied per-player tile options for ${players} player(s)`);
    }
    if (ruleset && cfg.rulesetOptions) ruleset.options = { ...ruleset.options, ...cfg.rulesetOptions };
    if (scoringSystem && cfg.scoringOptions) {
      scoringSystem.options = { ...scoringSystem.options, ...cfg.scoringOptions };
    }
    // Clear per-game state after options are applied
    tileSet?.onNewGame?.();
    scoringSystem?.onNewGame?.();

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
    this.selectedPathPlayerId = null;
    this._updatePathPlayerIndicators();

    // No extra initializeBoard() call here � constructor already placed starters
    // when initialTilesArg is provided (random or arrangement).

    this.updateUIForCurrentPlayer();

    // Tournament state
    if (cfg.tournament?.enabled) {
      if (this._freshTournament || !this.tournament || this.tournament.isComplete()) {
        this.tournament = new TournamentManager({
          players: cfg.players,
          rounds: cfg.tournament.rounds
        });
      }
      this._freshTournament = false;
      this.tournament.startRound();
    } else {
      this.tournament = null;
    }
    this._updateRoundIndicator();

    // Leaderboard button visible when tournament data exists
    const lbBtn = document.getElementById('leaderboard-button');
    if (lbBtn) lbBtn.style.display = TournamentManager.getLeaderboard().length ? '' : 'none';

    // Path highlighting only applies to tile sets with path scoring
    const showPathsButton = document.getElementById('show-paths');
    if (showPathsButton) {
      showPathsButton.style.display = this.gameState.scoringSystem?.pathScoring ? '' : 'none';
    }
    this.refreshPathHighlights();

    this.boardManager.setupResizeListener();
    this.boardManager.resizeBoard();

    const setupScreen = document.getElementById('setup-screen');
    const gameScreen = document.getElementById('game');
    if (setupScreen && gameScreen) {
      setupScreen.style.display = 'none';
      document.getElementById('quick-start-screen')?.style.setProperty('display', 'none');
      gameScreen.style.display = 'flex';
    }

    // Hand any computer-controlled seats to the AI. Harmless online (the
    // controller stands down while a network match is active).
    this.ai?.attach(this.gameState);
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
    this.gameState.on('tilePlaced', ({ position, tile, score, bonus, claimed }) => {
      this.boardManager.renderTile(position, tile);
      if (score > 0) this.boardManager.showScorePopup(position, score, bonus);
      // Re-render any border-bonus tiles that were just claimed
      for (const c of (claimed ?? [])) {
        this.boardManager.renderTile({ x: c.x, y: c.y }, c.tile);
      }
      this.refreshPathHighlights();
    });

    this.gameState.on('turnChange', () => this.updateUIForCurrentPlayer());
    this.gameState.on('gameEnd', (finalScores) => {
      // Highlight every player's bonus path in their colour
      finalScores.forEach(s => {
        if (s.path) {
          const player = this.gameState.playerManager.getPlayerById(s.id);
          this.boardManager.highlightPath(s.path, player?.color);
        }
      });

      if (this.tournament) {
        this.tournament.recordResult(finalScores);
        this._updateRoundIndicator();
        this.showTournamentStandings(finalScores);
      } else {
        this.showGameEndModal(finalScores);
      }
    });

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
  handleSkipTurn() {
    if (this.gameState?.inputLocked) return; // online: not your turn
    if (this.gameState?.getCurrentPlayer()?.aiLevel) return; // AI plays its own turn
    this.gameState?.playerManager?.skipTurn?.();
  }

  updateUIForCurrentPlayer() {
    const currentPlayer = this.gameState.getCurrentPlayer();
    const online = this.online?.active ? this.online : null;

    // In online play each device shows its own rack (not the active player's),
    // and input is locked unless it's this device's turn.
    if (online) {
      const players = this.gameState.playerManager.players;
      const myTiles = players[online.mySlot]?.tiles || [];
      this.rackManager.updateRack(myTiles);
      this.playerUIManager.updateCurrentPlayer(currentPlayer);
      this.boardManager.clearValidMoves();

      const myTurn = this.gameState.playerManager.currentPlayerIndex === online.mySlot;
      this.gameState.inputLocked = !myTurn;
      document.getElementById('rack')?.classList.toggle('rack-locked', !myTurn);
      this._updateOnlineBanner(myTurn, currentPlayer);
      return;
    }

    this.rackManager.updateRack(currentPlayer.tiles);
    this.playerUIManager.updateCurrentPlayer(currentPlayer);
    this.boardManager.clearValidMoves();

    // On a computer player's turn, dim the rack so a human can't play for it.
    // We don't set inputLocked: the AI itself reaches placeTile through the
    // same API, and pointer-events:none on the rack is enough to block taps.
    const isAI = !!currentPlayer.aiLevel;
    document.getElementById('rack')?.classList.toggle('rack-locked', isAI);
  }

  _updateOnlineBanner(myTurn, currentPlayer) {
    const banner = document.getElementById('online-banner');
    if (!banner || !this.online) return;
    banner.style.display = '';
    banner.classList.toggle('my-turn', myTurn);
    banner.classList.toggle('waiting', !myTurn);
    const label = myTurn ? '▶ Your turn' : `Waiting for ${currentPlayer?.name || '…'}`;
    banner.innerHTML = `${label}<span class="code">Room ${this.online.code}</span>`;
  }

  // ---- Online game construction / adoption ----

  // Host path: build the game normally (deals initial tiles) then wire the
  // online broadcast hook. The snapshot is pushed by the OnlineManager.
  buildHostedGame(config) {
    this._buildGame({ ...config, tournament: null });
    this.gameState.onLocalCommit = () => this.online.pushLocalMove();
  }

  // Joiner path: build scaffolding WITHOUT dealing (no players/initialTiles),
  // then adopt the host's snapshot and initialise the managers once.
  buildJoinedGame(config, snapshot) {
    const tileSet = this.registry.getTileSet(config.tileSet);
    const ruleset = this.registry.getRuleset(config.ruleset);
    const scoringSystem = this.registry.getScoringSystemForTileSet(config.tileSet);

    if (tileSet && config.tileSetOptions) tileSet.updateOptions(config.tileSetOptions);
    if (ruleset && config.rulesetOptions) ruleset.options = { ...ruleset.options, ...config.rulesetOptions };
    if (scoringSystem && config.scoringOptions) scoringSystem.options = { ...scoringSystem.options, ...config.scoringOptions };
    tileSet?.onNewGame?.();
    scoringSystem?.onNewGame?.();

    // No players/initialTiles → constructor does not deal any tiles.
    this.gameState = new GameState({
      tileSet, ruleset, scoringSystem,
      boardSize: config.boardSize, rackSize: config.rackSize,
    });

    this._applyOnlineSnapshotData(snapshot);

    this.setupGameStateListeners();
    this.boardManager.initialize(this.gameState);
    this.rackManager.initialize(this.gameState);
    this.playerUIManager.initialize(this.gameState);
    this.gameState.onLocalCommit = () => this.online.pushLocalMove();

    this.tournament = null;
    this._updateRoundIndicator();
    const lbBtn = document.getElementById('leaderboard-button');
    if (lbBtn) lbBtn.style.display = 'none';
    const showPathsButton = document.getElementById('show-paths');
    if (showPathsButton) showPathsButton.style.display = this.gameState.scoringSystem?.pathScoring ? '' : 'none';

    document.getElementById('setup-screen')?.style.setProperty('display', 'none');
    document.getElementById('quick-start-screen')?.style.setProperty('display', 'none');
    document.getElementById('game')?.style.setProperty('display', 'flex');

    this._refreshOnlineView();
  }

  // Incremental update of an already-built online game from a fresh snapshot.
  applyOnlineSnapshot(snapshot) {
    this._applyOnlineSnapshotData(snapshot);
    this.boardManager.renderAll();
    this._refreshOnlineView();
  }

  _applyOnlineSnapshotData(snapshot) {
    const s = snapshot.state;
    if (!s) return;
    const gs = this.gameState;
    gs.boardState = s.boardState;
    gs.firstMove = s.firstMove;
    gs.playerManager.players = (s.players || []).map(p => Player.fromJSON(p));
    gs.playerManager.currentPlayerIndex = s.currentPlayerIndex || 0;
    gs._ended = !!snapshot.ended;
    gs._finalScores = snapshot.finalScores || null;
    if (snapshot.tileCounts && gs.tileSet.importCounts) gs.tileSet.importCounts(snapshot.tileCounts);
  }

  _refreshOnlineView() {
    this.playerUIManager.updatePlayerList();
    this.updateUIForCurrentPlayer();
    this._updatePathPlayerIndicators();
    this.refreshPathHighlights();
  }

  // Leave an online game (if any) and return to the quick-start screen.
  _exitOnline() {
    if (this.online?.active) { this.online.leave(); return true; }
    return false;
  }

  togglePathHighlights() {
    this.showingPaths = !this.showingPaths;
    document.getElementById('show-paths')?.classList.toggle('active', this.showingPaths);
    if (!this.showingPaths) this.selectedPathPlayerId = null;
    this._updatePathPlayerIndicators();
    this.refreshPathHighlights();
  }

  // Show only one player's path: the pinned player, or the current player by default
  refreshPathHighlights() {
    if (!this.boardManager || !this.gameState) return;
    this.boardManager.clearPathHighlights();
    if (!this.showingPaths) return;

    const pathScoring = this.gameState.scoringSystem?.pathScoring;
    if (!pathScoring) return;

    const target = this.selectedPathPlayerId
      ? this.gameState.playerManager.getPlayerById(this.selectedPathPlayerId)
      : this.gameState.getCurrentPlayer();
    if (!target) return;

    const path = pathScoring.findLongestPathForPlayer(this.gameState, target.id);
    if (path) this.boardManager.highlightPath(path, target.color);
  }

  // Mark the pinned player's card with a visible indicator; add pointer cursor when paths are on
  _updatePathPlayerIndicators() {
    const container = document.getElementById('player-container');
    if (!container) return;
    container.classList.toggle('paths-active', !!this.showingPaths);
    container.querySelectorAll('.player-info').forEach(div => {
      const id = div.id.replace('player-', '');
      div.classList.toggle('path-viewing', !!this.showingPaths && id === this.selectedPathPlayerId);
    });
  }

  // ---- Scoring Settings Panel ----

  showScoring() {
    this.populateScoringPanel();
    const m = document.getElementById('scoring-modal');
    if (m) m.style.display = 'flex';
  }

  hideScoring() {
    const m = document.getElementById('scoring-modal');
    if (m) m.style.display = 'none';
  }

  populateScoringPanel() {
    const display = document.getElementById('scoring-display');
    if (!display || !this.gameState) return;

    const opts = this.gameState.scoringSystem?.options || {};
    const tileOpts = this.gameState.tileSet?.options || {};
    const tileSet = this._savedConfig?.tileSet || 'streets';

    const row = (label, val) =>
      `<div class="tally-row"><span>${label}</span><span>${val}</span></div>`;
    const sec = (title) => `<h4>${title}</h4>`;

    let html = sec('Connection Scoring');
    const scores = opts.scores || { 1: 1, 2: 4, 3: 9, 4: 16 };
    [1, 2, 3, 4].forEach(n => { html += row(`${n} match${n > 1 ? 'es' : ''}`, `+${scores[n] ?? '?'} pts`); });
    html += row('Starter tile multiplier', `×${opts.starterTileMultiplier ?? 2}`);

    if (tileSet === 'streets') {
      const ps = opts.centerPatternScores || { circles: 10, squares: 20 };
      html += sec('Centre Pattern Tiles');
      html += row('Bonus Circle (⭕)', `+${ps.circles} pts`);
      html += row('Centre Square (⬛)', `+${ps.squares} pts`);

      html += sec('Placement Bonuses');
      html += row('Intersection (4-way street)', `+${opts.intersectionBonus ?? 0} pts`);
      html += row('Board centre cell', `+${opts.centerBonus ?? 0} pts`);

      html += sec('Path Bonuses');
      html += row('Per path tile', `+${opts.pathPoints ?? 3} pts`);
      html += row('First connection', `+${opts.completionBonus ?? 0} pts`);
      html += row('Scoring mode', opts.enableEndGameBonus ? 'End of game' : 'Instant (in-play)');

      const freq = tileOpts.centerPatternFrequency ?? 0.2;
      const cr = tileOpts.patternWeights?.circles ?? 0.7;
      html += sec('Tile Generation');
      html += row('Special tile frequency', `${Math.round(freq * 100)}%`);
      html += row('Pattern mix', `${Math.round(cr * 100)}% Circles · ${Math.round((1 - cr) * 100)}% Squares`);
    }

    display.innerHTML = html;
  }

  // ---- Tournament ----

  _updateRoundIndicator() {
    const el = document.getElementById('round-indicator');
    if (!el) return;
    el.textContent = this.tournament
      ? `Round ${this.tournament.currentRound} of ${this.tournament.totalRounds}`
      : '';
  }

  showTournamentStandings(finalScores) {
    const isComplete = this.tournament.isComplete();
    const titleEl = document.getElementById('tournament-modal-title');
    const standingsDiv = document.getElementById('tournament-standings');
    const nextBtn = document.getElementById('tournament-next');

    if (titleEl) {
      titleEl.textContent = isComplete
        ? '🏆 Tournament Complete!'
        : `Round ${this.tournament.currentRound} of ${this.tournament.totalRounds} Complete`;
    }

    const sorted = this.tournament.getSortedStandings();
    const medals = ['🥇', '🥈', '🥉'];

    let html = '<h4>Round Results</h4>';
    finalScores.sort((a, b) => b.score - a.score);
    finalScores.forEach((s, i) => {
      html += `<div class="tally-row"><span>${medals[i] || (i + 1)} ${s.name}</span><span>${s.score} pts</span></div>`;
    });

    html += '<h4 style="margin-top:1rem;">Cumulative Standings</h4>';
    html += '<table class="tournament-table"><tr><th></th><th>Player</th><th>Total</th>';
    for (let r = 1; r <= this.tournament.currentRound; r++) html += `<th>R${r}</th>`;
    html += '</tr>';
    sorted.forEach((p, i) => {
      html += `<tr><td>${medals[i] || i + 1}</td><td>${p.name}</td><td><strong>${p.total}</strong></td>`;
      p.rounds.forEach(r => { html += `<td>${r}</td>`; });
      html += '</tr>';
    });
    html += '</table>';

    if (isComplete) {
      html += `<p class="tournament-winner">🏆 ${sorted[0].name} wins with ${sorted[0].total} points!</p>`;
      this.tournament.saveToLeaderboard();
      const lbBtn = document.getElementById('leaderboard-button');
      if (lbBtn) lbBtn.style.display = '';
    }

    if (standingsDiv) standingsDiv.innerHTML = html;
    if (nextBtn) nextBtn.style.display = isComplete ? 'none' : '';

    document.getElementById('tournament-modal').style.display = 'flex';
  }

  showLeaderboard() {
    const display = document.getElementById('leaderboard-display');
    if (!display) return;

    const board = TournamentManager.getLeaderboard();
    if (!board.length) {
      display.innerHTML = '<p style="color:var(--text-secondary)">No tournament results yet. Complete a tournament to see records here.</p>';
    } else {
      let html = '<table class="tournament-table">';
      html += '<tr><th>#</th><th>Winner</th><th>Score</th><th>Rounds</th><th>Players</th><th>Date</th></tr>';
      board.forEach((entry, i) => {
        html += `<tr>
          <td>${i + 1}</td><td>${entry.winner}</td><td><strong>${entry.score}</strong></td>
          <td>${entry.rounds}</td><td>${entry.players}</td><td>${entry.date}</td>
        </tr>`;
      });
      html += '</table>';
      display.innerHTML = html;
    }
    document.getElementById('leaderboard-modal').style.display = 'flex';
  }

  hideLeaderboard() {
    document.getElementById('leaderboard-modal').style.display = 'none';
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

  showConfig() {
    this.setupManager?.populateConfigSelect();
    const m = document.getElementById('config-modal');
    if (m) m.style.display = 'flex';
  }

  hideConfig() {
    const m = document.getElementById('config-modal');
    if (m) m.style.display = 'none';
  }

  showWeights() {
    const m = document.getElementById('weights-modal');
    if (!m) return;

    // Sync tab visibility to current player count
    const playerCount = parseInt(document.getElementById('player-count')?.value || '1');
    document.querySelectorAll('.weights-tab').forEach(tab => {
      tab.style.display = parseInt(tab.dataset.player) < playerCount ? '' : 'none';
    });

    // Ensure an active tab is visible; reset to P1 if current is hidden
    const activeTab = document.querySelector('.weights-tab.active');
    if (!activeTab || activeTab.style.display === 'none') {
      document.querySelectorAll('.weights-tab')[0]?.click();
    }

    m.style.display = 'flex';
  }

  _initWeightsTabs() {
    document.querySelectorAll('.weights-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.weights-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.weights-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`weights-panel-${tab.dataset.player}`)?.classList.add('active');
      });
    });

    const weightFields = [
      'center-pattern-freq','circles-ratio',
      'tm-circles','tm-squares',
      'tw-cross','tw-t','tw-straight','tw-corner','tw-dead','tw-blank',
      'tw-tunnel','tw-roadblock','tw-private',
      'tm-cross','tm-t','tm-straight','tm-corner','tm-dead','tm-blank',
      'tm-tunnel','tm-roadblock','tm-private',
    ];
    document.querySelectorAll('.copy-weights-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetPanel = btn.closest('.weights-panel');
        const ti = targetPanel?.dataset.player;
        if (ti == null) return;
        weightFields.forEach(field => {
          const src = document.getElementById(`${field}-p0`);
          const dst = document.getElementById(`${field}-p${ti}`);
          if (src && dst) {
            dst.value = src.value;
            dst.dispatchEvent(new Event('input'));
          }
        });
      });
    });
  }

  hideWeights() {
    const m = document.getElementById('weights-modal');
    if (m) m.style.display = 'none';
  }

  updateRulesText() {
    const setup = this.setupManager;
    const opts = this._savedConfig?.scoringOptions || {};

    // Show only the sections relevant to the active tile set
    const tileSet = this._savedConfig?.tileSet || setup?.tileSetSelect?.value || 'streets';
    document.querySelectorAll('.rules-streets-only').forEach(el => {
      el.style.display = tileSet === 'streets' ? '' : 'none';
    });
    document.querySelectorAll('.rules-shapes-only').forEach(el => {
      el.style.display = tileSet === 'shapes' ? '' : 'none';
    });

    const multiplier = opts.starterTileMultiplier
      ?? parseInt(setup?.starterMultiplierInput?.value || '2', 10);
    const pathPoints = opts.pathPoints
      ?? parseInt(setup?.pathPointsInput?.value || '3', 10);
    const intersectionBonus = opts.intersectionBonus
      ?? parseInt(setup?.intersectionBonusInput?.value || '5', 10);
    const centerBonus = opts.centerBonus
      ?? parseInt(setup?.centerBonusInput?.value || '5', 10);
    const completionBonus = opts.completionBonus
      ?? parseInt(setup?.completionBonusInput?.value || '20', 10);
    const circleScore = opts.centerPatternScores?.circles
      ?? parseInt(setup?.circleScoreInput?.value || '10', 10);
    const squareScore = opts.centerPatternScores?.squares
      ?? parseInt(setup?.squareScoreInput?.value || '20', 10);

    const setVals = (className, val) => {
      document.querySelectorAll(`.${className}`).forEach(el => (el.textContent = val));
    };

    setVals('rule-val-multiplier', multiplier);
    setVals('rule-val-path-points', pathPoints);
    setVals('rule-val-intersection', intersectionBonus);
    setVals('rule-val-center', centerBonus);
    setVals('rule-val-completion', completionBonus);
    setVals('rule-val-circle-score', circleScore);
    setVals('rule-val-square-score', squareScore);
  }

  showGameEndModal(finalScores) {
    const modal = document.getElementById('game-end-modal');
    const scoresDiv = document.getElementById('final-scores');
    finalScores.sort((a, b) => b.score - a.score);
    const endBonusEnabled = this._savedConfig?.scoringOptions?.enableEndGameBonus;
    const scoreHtml = finalScores
      .map((score, i) => {
        let details = '';
        if (score.bonus > 0 || endBonusEnabled) {
          details = ` <span class="score-details">(${score.base || 0} Base + ${score.bonus || 0} Bonus)</span>`;
        }

        // Tally of what the score comprised of
        const player = this.gameState?.playerManager?.getPlayerById(score.id);
        const tallyEntries = Object.values(player?.tally || {}).filter(t => t.points);
        if (endBonusEnabled && score.bonus > 0) {
          tallyEntries.push({ label: 'End-Game Path', points: score.bonus });
        }
        const tallyHtml = tallyEntries.length
          ? `<ul class="score-tally">${tallyEntries
              .map(t => `<li><span>${t.label}</span><span>+${t.points}</span></li>`)
              .join('')}</ul>`
          : '';

        return `<div class="final-score-entry">
                  <p${i === 0 ? ' class="winner"' : ''}>${score.name}: ${score.score} points${details}${i === 0 ? ' 🏆' : ''}</p>
                  ${tallyHtml}
                </div>`;
      })
      .join('');
    scoresDiv.innerHTML = scoreHtml;
    modal.style.display = 'flex'; // Ensure flex display

    // Initialize Draggable Logic
    this.makeElementDraggable(document.querySelector('#game-end-modal .modal-content'), document.querySelector('#game-end-modal h2'));
  }

  makeElementDraggable(element, handle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    if (!handle) return; // Need a handle

    handle.onmousedown = dragMouseDown;
    handle.ontouchstart = dragMouseDown;

    function dragMouseDown(e) {
      e = e || window.event;
      // e.preventDefault(); // Don't prevent default immediately for touch or scrolling might break, but for a handle it's usually okay.
      // For drag handle, preventing default is often good to stop scrolling.
      if (e.type === 'touchstart') {
        // e.preventDefault(); // Prevents scroll, good for handle
      } else {
        e.preventDefault();
      }

      // get the mouse cursor position at startup:
      const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

      pos3 = clientX;
      pos4 = clientY;

      document.onmouseup = closeDragElement;
      document.ontouchend = closeDragElement;

      // call a function whenever the cursor moves:
      document.onmousemove = elementDrag;
      document.ontouchmove = elementDrag;
    }

    function elementDrag(e) {
      e = e || window.event;
      e.preventDefault(); // Prevent scrolling while dragging
      // calculate the new cursor position:
      const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

      pos1 = pos3 - clientX;
      pos2 = pos4 - clientY;
      pos3 = clientX;
      pos4 = clientY;
      // set the element's new position:
      // We use offsets because the element is flex-positioned initially
      // To make it movable, we might need to switch to relative/absolute or just use margins/transforms.
      // Easiest for a flex item is often transforms, but top/left works if position is relative/absolute.
      // Let's use Top/Left and ensure position is set.

      // If element is not yet absolute/fixed, force it?
      // Actually, since it's in a flex container (the modal wrapper), moving it might be tricky without position:relative.
      // Let's simply adjust margin or transform? No, top/left is standard.

      // Check if position is already set, if not, lock it to current computed
      const style = window.getComputedStyle(element);
      if (style.position === 'static') {
        element.style.position = 'relative';
      }

      element.style.top = (element.offsetTop - pos2) + "px";
      element.style.left = (element.offsetLeft - pos1) + "px";

      // Reset margin if we want to rely purely on top/left (optional, but helps de-conflict flex alignment)
      // element.style.margin = 0;
    }

    function closeDragElement() {
      // stop moving when mouse button is released:
      document.onmouseup = null;
      document.onmousemove = null;
      document.ontouchend = null;
      document.ontouchmove = null;
    }
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
  const versionEl = document.getElementById('version-display');
  if (versionEl) versionEl.textContent = `v${VERSION}`;

  const game = new Game();
  await game.initialize();
});
