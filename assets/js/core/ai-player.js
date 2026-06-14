// assets/js/core/ai-player.js
// Computer-controlled players for local (hotseat) games.
//
// When it becomes an AI seat's turn the controller picks a move and plays it
// through the normal GameState API (selectTile → placeTile), so scoring,
// rendering and turn advancement happen exactly as they do for a human. Online
// games are left entirely to the human devices, so the controller stands down
// whenever an online match is active.

const THINK_MS = 650;         // visible "thinking" pause before an AI plays
const THINK_JITTER_MS = 450;  // a little randomness so it feels less robotic
const AI_PATH_BUDGET = 20000; // cap path-search work while weighing candidates

export class AIController {
  constructor(game) {
    this.game = game;
    this.gameState = null;
    this._timer = null;
    this._turnHandler = null;
  }

  // Bind to a freshly built game and react to every turn change. Safe to call
  // repeatedly — it detaches from any previous game first.
  attach(gameState) {
    this.detach();
    this.gameState = gameState;
    this._turnHandler = () => this._onTurn();
    gameState.on('turnChange', this._turnHandler);
    this._onTurn(); // the opening player may already be an AI
  }

  detach() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this.gameState && this._turnHandler) {
      this.gameState.off('turnChange', this._turnHandler);
    }
    this._turnHandler = null;
  }

  _online() { return !!this.game.online?.active; }

  _onTurn() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    const gs = this.gameState;
    if (!gs || gs._ended || this._online()) return;
    const player = gs.getCurrentPlayer();
    if (!player || !player.aiLevel) return;
    const delay = THINK_MS + Math.random() * THINK_JITTER_MS;
    this._timer = setTimeout(() => this._play(player), delay);
  }

  _play(player) {
    this._timer = null;
    const gs = this.gameState;
    if (!gs || gs._ended || this._online()) return;
    // The turn may have moved on while we were "thinking" (New Game, Setup…).
    if (gs.getCurrentPlayer() !== player) return;

    const move = this.chooseMove(gs, player);
    if (!move) {
      // No legal placement. If nobody can move (or the board is full) the game
      // is over — end it rather than passing forever (matters for all-AI games,
      // since skipTurn alone never triggers game-over detection).
      if (gs.isGameOver?.()) gs.endGame();
      else gs.playerManager.skipTurn(); // pass to a player who can move
      return;
    }

    // Play it through the public API. The rack is dimmed for AI turns but not
    // input-locked, so these calls go through and emit all the usual events.
    gs.selectTile(move.tile);
    gs.currentRotation = move.rotation;
    const result = gs.placeTile(move.position);
    if (!result || !result.success) {
      // Defensive: if the chosen move was somehow rejected, pass rather than
      // leave the AI stuck on its turn.
      gs.playerManager.skipTurn();
    }
  }

  // ---- Move selection ------------------------------------------------------

  chooseMove(gs, player) {
    const moves = this._enumerateMoves(gs, player);
    if (!moves.length) return null;

    const level = player.aiLevel;
    if (level === 'easy') {
      // Beatable: ignore score, play a random legal move.
      return moves[(Math.random() * moves.length) | 0];
    }

    const hard = level === 'hard';
    let best = null;
    let bestVal = -Infinity;
    for (const m of moves) {
      // Primary term is the immediate score. Hard also values keeping the road
      // network extensible and well-connected. A tiny centre bias yields tidy
      // openings; it's far smaller than any real score so it only breaks ties.
      let val = m.score
        + (hard ? m.openExits * 0.1 + m.matches * 0.05 : 0)
        - m.centerDist * 0.001;
      // Normal keeps a little noise so it isn't perfectly predictable; the
      // noise is tiny enough never to override a genuinely better move.
      if (!hard) val += Math.random() * 0.01;
      if (val > bestVal) { bestVal = val; best = m; }
    }
    return best;
  }

  // Enumerate every legal (tile, rotation, cell) and score it. Evaluation is
  // side-effect free: the scoring system's path-bonus bookkeeping is snapshotted
  // and restored between candidates so each is judged from the same baseline,
  // and the path search budget is reduced so dense boards stay responsive.
  _enumerateMoves(gs, player) {
    const scoring = gs.scoringSystem;
    const ruleset = gs.ruleset;
    const center = Math.floor(gs.boardSize / 2);

    const snap = (scoring && scoring.bestPaths instanceof Map)
      ? new Map(scoring.bestPaths) : null;
    const ps = scoring && scoring.pathScoring;
    const origBudget = ps ? ps.searchBudget : null;
    if (ps) ps.searchBudget = Math.min(origBudget ?? AI_PATH_BUDGET, AI_PATH_BUDGET);

    const moves = [];
    try {
      for (const tile of player.tiles) {
        const seen = new Set(); // skip duplicate rotations of symmetric tiles
        for (let rot = 0; rot < 4; rot++) {
          const sides = this._rotatedSides(tile.sides, rot);
          const key = sides.join(',');
          if (seen.has(key)) continue;
          seen.add(key);

          const probe = { ...tile, rotation: rot };
          const cells = ruleset.getValidMoves(gs, probe);
          for (const pos of cells) {
            if (snap) scoring.bestPaths = new Map(snap);
            const r = scoring.calculateScore(gs, pos, probe);
            const score = (typeof r === 'object') ? r.total : r;
            moves.push({
              tile,
              rotation: rot,
              position: pos,
              score,
              matches: scoring.countMatches ? scoring.countMatches(gs, pos, probe) : 0,
              openExits: this._openExits(gs, pos, sides),
              centerDist: Math.abs(pos.x - center) + Math.abs(pos.y - center),
            });
          }
        }
      }
    } finally {
      if (snap) scoring.bestPaths = new Map(snap); // leave scoring pristine
      if (ps) ps.searchBudget = origBudget;        // restore full-accuracy budget
    }
    return moves;
  }

  // Count street edges of a placed tile that face an empty in-bounds cell — a
  // cheap proxy for how much future road-building potential the move keeps open.
  _openExits(gs, pos, sides) {
    const dirs = [
      { dx: 0, dy: -1, e: 0 }, { dx: 1, dy: 0, e: 1 },
      { dx: 0, dy: 1, e: 2 }, { dx: -1, dy: 0, e: 3 },
    ];
    let open = 0;
    for (const { dx, dy, e } of dirs) {
      if (sides[e] !== 'street') continue;
      const nx = pos.x + dx, ny = pos.y + dy;
      if (nx < 0 || nx >= gs.boardSize || ny < 0 || ny >= gs.boardSize) continue;
      if (!gs.boardState[ny][nx]) open++;
    }
    return open;
  }

  _rotatedSides(sides, rotation) {
    const s = [...sides];
    for (let i = 0; i < (rotation || 0); i++) s.unshift(s.pop());
    return s;
  }
}
