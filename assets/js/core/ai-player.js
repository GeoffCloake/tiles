// assets/js/core/ai-player.js
// Computer-controlled players for local (hotseat) games.
//
// When it becomes an AI seat's turn the controller picks a move and plays it
// through the normal GameState API (selectTile → placeTile), so scoring,
// rendering and turn advancement happen exactly as they do for a human. Online
// games are left entirely to the human devices, so the controller stands down
// whenever an online match is active.
//
// Move selection by level:
//   easy   — a random legal move (ignores score entirely).
//   normal — the highest-scoring single move right now (1-ply greedy + noise).
//   hard   — Monte Carlo Tree Search: it plays many short games ahead from the
//            current position, modelling the opponents, and picks the move that
//            leads to the best score differential. This lets it plan paths,
//            keep the road network open and block opponents, rather than just
//            grabbing the best immediate score.

const THINK_MS = 650;         // visible "thinking" pause before an AI plays
const THINK_JITTER_MS = 450;  // a little randomness so it feels less robotic
const AI_PATH_BUDGET = 20000; // cap path-search work while weighing candidates

// ---- MCTS tuning -----------------------------------------------------------
const MCTS_BUDGET_MS   = 800;   // wall-clock budget for the whole tree search
const MCTS_MAX_ITERS   = 6000;  // safety cap on simulations per move
const MCTS_PATH_BUDGET = 5000;  // reduced path-search depth while simulating
const MCTS_ROOT_WIDTH  = 14;    // only search the most promising root moves
const ROLLOUT_DEPTH    = 5;     // plies played out past the tree each simulation
const ROLLOUT_SAMPLE   = 6;     // candidate moves sampled per rollout ply
const UCB_C            = 1.4;   // exploration constant (UCB1)
const VALUE_SCALE      = 15;    // score-diff that maps to a decisive win/loss

// A single node in the search tree.
class MCTSNode {
  constructor(parent, move) {
    this.parent = parent;
    this.move = move;     // {tileId, rotation, position} that led here (null at root)
    this.children = [];
    this.untried = null;  // lazily-filled legal moves; null = not yet enumerated
    this.visits = 0;
    this.reward = 0;      // summed reward, always from the AI player's perspective
  }
}

// A throwaway, mutable view of the game used only for simulation. It doubles as
// its own playerManager so the existing scoring and ruleset code — which reads
// gameState.boardState, gameState.boardSize, gameState.tileSet,
// gameState.getCurrentPlayer(), gameState.playerManager.players /
// .getPlayerById / .currentPlayerIndex, and calls gameState.emit() — runs
// unchanged against the simulated board.
class SimGame {
  get playerManager() { return this; }
  getCurrentPlayer() { return this.players[this.currentPlayerIndex]; }
  getPlayerById(id) { return this.players.find(p => p.id === id); }
  emit() {} // scoring emits 'pathUpdate'; swallow it during simulation

  clone() {
    const s = new SimGame();
    s.boardSize = this.boardSize;
    s.boardState = this.boardState.map(row => row.slice());
    s.tileSet = this.tileSet;
    s.scoring = this.scoring;
    s.ruleset = this.ruleset;
    s.numPlayers = this.numPlayers;
    s.currentPlayerIndex = this.currentPlayerIndex;
    s.aiId = this.aiId;
    // Players are fresh objects (score/tiles mutate per simulation); tile
    // objects themselves are shared refs and never mutated in place.
    s.players = this.players.map(p => ({
      id: p.id, color: p.color, score: p.score, idx: p.idx, tiles: p.tiles.slice(),
    }));
    s.bestPaths = new Map(this.bestPaths);
    return s;
  }
}

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
    const level = player.aiLevel;

    // Hard plans ahead with MCTS. If the search can't produce a move for any
    // reason, fall through to the original greedy heuristic so a turn is never
    // skipped when a legal move exists.
    if (level === 'hard') {
      const planned = this._chooseMoveMCTS(gs, player);
      if (planned) return planned;
    }

    const moves = this._enumerateMoves(gs, player);
    if (!moves.length) return null;

    if (level === 'easy') {
      // Beatable: ignore score, play a random legal move.
      return moves[(Math.random() * moves.length) | 0];
    }
    return this._pickGreedy(moves, level === 'hard');
  }

  // 1-ply greedy pick shared by normal (and by hard as an MCTS fallback).
  _pickGreedy(moves, hard) {
    let best = null;
    let bestVal = -Infinity;
    for (const m of moves) {
      // Primary term: immediate placement score.
      // Border approach: proxy for claim/connect bonuses not captured by
      //   calculateScore — reward moves aligned with unclaimed border tiles.
      // Special bonus: for the centre-square starter tile, reward placement
      //   cells whose exits have clear line-of-sight to border tiles.
      // Hard also values road-network extensibility and edge-matching.
      // Path continuity: strongly reward moves that extend the player's
      // existing road network; penalise isolated placements that can never
      // contribute to the connected path score.
      // Blocking: reward moves that occupy cells on the opponent's approach
      // toward an unclaimed border tile (level 4 = adjacent = highest threat).
      // Don't apply the isolation penalty to blocking moves — cutting off the
      // opponent is worthwhile even if the move is outside the player's road.
      let val = m.score
        + m.borderApproach               * 2.0
        + m.specialBonus                 * 2.0
        + (m.connectsToPlayer ? 5.0 : 0)
        - (m.isolated && !m.blocksOpponent ? 8.0 : 0)
        + m.blocksOpponent               * 2.25
        + (hard ? m.openExits * 0.1 + m.matches * 0.05 : 0)
        - m.centerDist * 0.001;
      // Normal keeps a little noise so it isn't perfectly predictable; the
      // noise is tiny enough never to override a genuinely better move.
      if (!hard) val += Math.random() * 0.01;
      if (val > bestVal) { bestVal = val; best = m; }
    }
    return best;
  }

  // ---- Monte Carlo Tree Search (hard) --------------------------------------

  _chooseMoveMCTS(gs, player) {
    const scoring = gs.scoringSystem;
    if (!scoring || typeof scoring.calculateScore !== 'function') return null;

    const sim0 = this._snapshot(gs, player.id);
    const rootMoves = this._legalMoves(sim0);
    if (!rootMoves.length) return null;
    // Nothing to search when there's only one legal move.
    if (rootMoves.length === 1) return this._resolveMove(gs, player, rootMoves[0]);

    // State we temporarily borrow from the live objects and must hand back
    // pristine: the scoring path map, the path-search budget and the tile
    // generator's per-player counts (which enforce caps like one cross tile).
    const ps = scoring.pathScoring;
    const realBestPaths = scoring.bestPaths;
    const realBudget = ps ? ps.searchBudget : null;
    const realCounts = gs.tileSet ? gs.tileSet._tileCountsPerPlayer : null;
    const canDraw = !!(gs.tileSet && typeof gs.tileSet.generateTile === 'function'
                       && realCounts && typeof realCounts === 'object');

    if (ps) ps.searchBudget = Math.min(realBudget ?? MCTS_PATH_BUDGET, MCTS_PATH_BUDGET);

    const root = new MCTSNode(null, null);
    // Focus the budget: rank the root moves by immediate score once and only
    // search the strongest handful, rather than spreading thin over every cell.
    const candidates = this._rootCandidates(sim0, rootMoves, MCTS_ROOT_WIDTH);
    root.untried = candidates.slice();
    const rootDiff = this._diff(sim0, player.id);

    const deadline = Date.now() + MCTS_BUDGET_MS;
    let iters = 0;
    try {
      while (iters < MCTS_MAX_ITERS && Date.now() < deadline) {
        iters++;
        // Each simulation draws unknown future tiles from an isolated copy of
        // the per-player counts, so the real game's tile caps are never spent.
        if (canDraw) gs.tileSet._tileCountsPerPlayer = this._copyCounts(realCounts);
        try {
          const sim = sim0.clone();
          const leaf = this._treePolicy(root, sim, player.id);
          const reward = this._rollout(sim, player.id, rootDiff, canDraw);
          this._backprop(leaf, reward);
        } finally {
          if (canDraw) gs.tileSet._tileCountsPerPlayer = realCounts;
        }
      }
    } finally {
      // Leave every borrowed object exactly as we found it.
      scoring.bestPaths = realBestPaths;
      if (ps) ps.searchBudget = realBudget;
      if (canDraw) gs.tileSet._tileCountsPerPlayer = realCounts;
    }

    const best = this._mostVisitedChild(root);
    const chosen = best ? best.move : candidates[0];
    return this._resolveMove(gs, player, chosen);
  }

  // Rank root moves by their immediate score and keep the best `width`. Scoring
  // is done against a copy of the root path map so the live game is untouched.
  _rootCandidates(sim, moves, width) {
    if (moves.length <= width) return moves;
    const scoring = sim.scoring;
    const player = sim.players[sim.currentPlayerIndex];

    // Free play can offer hundreds of legal cells; pre-trim with cheap edge-match
    // counting (no path search) before paying for full scoring on each.
    const CAP = 40;
    let pool = moves;
    if (moves.length > CAP && typeof scoring.countMatches === 'function') {
      pool = moves
        .map(m => {
          const tile = player.tiles.find(t => t.id === m.tileId);
          const matches = tile ? scoring.countMatches(sim, m.position, { ...tile, rotation: m.rotation }) : 0;
          return { m, matches };
        })
        .sort((a, b) => b.matches - a.matches)
        .slice(0, CAP)
        .map(x => x.m);
    }

    // Include blocking bonus so MCTS explores moves that stop an opponent from
    // claiming a border tile, even when their immediate score is low.
    const bonusTilesForThreats = this._unclaimedBonusTiles(sim);
    const oppThreatsRoot = bonusTilesForThreats.length
      ? this._opponentBorderThreats(sim, player, bonusTilesForThreats) : new Map();

    const saved = scoring.bestPaths;
    const scored = pool.map(m => {
      const tile = player.tiles.find(t => t.id === m.tileId);
      let s = -Infinity;
      if (tile) {
        scoring.bestPaths = new Map(sim.bestPaths);
        try {
          const r = scoring.calculateScore(sim, m.position, { ...tile, rotation: m.rotation });
          s = (typeof r === 'object') ? (r.total || 0) : (r || 0);
        } catch (_) { s = 0; }
        s += (oppThreatsRoot.get(`${m.position.x},${m.position.y}`) || 0) * 2.25;
      }
      return { m, s };
    });
    scoring.bestPaths = saved; // restore the live map we borrowed
    scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, width).map(x => x.m);
  }

  // Build the simulation root from the live game (board rows and racks copied;
  // tile objects shared but treated as immutable).
  _snapshot(gs, aiId) {
    const scoring = gs.scoringSystem;
    const sim = new SimGame();
    sim.boardSize = gs.boardSize;
    sim.boardState = gs.boardState.map(row => row.slice());
    sim.tileSet = gs.tileSet;
    sim.scoring = scoring;
    sim.ruleset = gs.ruleset;
    sim.numPlayers = gs.playerManager.players.length;
    sim.currentPlayerIndex = gs.playerManager.currentPlayerIndex;
    sim.aiId = aiId;
    sim.players = gs.playerManager.players.map((p, i) => ({
      id: p.id, color: p.color, score: p.score, idx: i, tiles: p.tiles.slice(),
    }));
    sim.bestPaths = (scoring && scoring.bestPaths instanceof Map)
      ? new Map(scoring.bestPaths) : new Map();
    return sim;
  }

  // Walk down the tree (selecting with UCB1) until we reach a node with an
  // unexpanded move or a terminal position, expanding one new child. The sim is
  // advanced in lock-step so it reflects the returned node's position.
  _treePolicy(root, sim, aiId) {
    let node = root;
    while (true) {
      if (node.untried === null) node.untried = this._legalMoves(sim);

      if (node.untried.length > 0) {
        const i = (Math.random() * node.untried.length) | 0;
        const move = node.untried.splice(i, 1)[0];
        this._applyMove(sim, move, false); // tree moves don't draw replacements
        const child = new MCTSNode(node, move);
        node.children.push(child);
        return child;
      }

      if (node.children.length === 0) return node; // no legal moves: terminal

      // Paranoid model: the AI maximises its differential, every opponent is
      // assumed to minimise it. Whose turn it is is read from the live sim.
      const aiToMove = sim.players[sim.currentPlayerIndex].id === aiId;
      node = this._ucbSelect(node, aiToMove);
      this._applyMove(sim, node.move, false);
    }
  }

  _ucbSelect(node, aiToMove) {
    let best = null;
    let bestU = -Infinity;
    const lnN = Math.log(node.visits || 1);
    for (const c of node.children) {
      if (c.visits === 0) return c; // always try an unvisited child first
      const mean = c.reward / c.visits;
      const exploit = aiToMove ? mean : (1 - mean);
      const u = exploit + UCB_C * Math.sqrt(lnN / c.visits);
      if (u > bestU) { bestU = u; best = c; }
    }
    return best;
  }

  // Play out the position with a cheap, lightly-guided random policy and return
  // a [0,1] reward for the AI: how much its score differential improved over the
  // root, squashed so a couple of good moves reads as a near-certain win.
  _rollout(sim, aiId, rootDiff, canDraw) {
    for (let d = 0; d < ROLLOUT_DEPTH; d++) {
      const moves = this._legalMoves(sim);
      if (!moves.length) break;
      const move = this._rolloutPick(sim, moves);
      this._applyMove(sim, move, canDraw); // rollouts refill racks with draws
    }
    return this._logistic(this._diff(sim, aiId) - rootDiff);
  }

  // Sample a handful of legal moves and keep the one connecting the most edges,
  // also weighted toward moves that approach unclaimed border bonus tiles.
  // Uses countMatches + _borderApproachBonus only (no path search) so fast.
  _rolloutPick(sim, moves) {
    const scoring = sim.scoring;
    const player = sim.players[sim.currentPlayerIndex];
    const bonusTiles = this._unclaimedBonusTiles(sim);
    const k = Math.min(ROLLOUT_SAMPLE, moves.length);
    let best = null;
    let bestVal = -Infinity;
    for (let i = 0; i < k; i++) {
      const m = moves[(Math.random() * moves.length) | 0];
      const tile = player.tiles.find(t => t.id === m.tileId);
      let matches = 0;
      if (tile && typeof scoring.countMatches === 'function') {
        matches = scoring.countMatches(sim, m.position, { ...tile, rotation: m.rotation });
      }
      const sides = tile ? this._rotatedSides(tile.sides, m.rotation) : [];
      const borderBonus = bonusTiles.length
        ? this._borderApproachBonus(m.position, sides, bonusTiles) : 0;
      const val = matches + borderBonus * 0.4 + Math.random() * 0.5;
      if (val > bestVal) { bestVal = val; best = m; }
    }
    return best || moves[(Math.random() * moves.length) | 0];
  }

  // Apply a move to a simulation: score it (with this sim's own path map swapped
  // in so the live game is untouched), place the tile, spend it from the rack,
  // optionally draw a replacement, and advance the turn.
  _applyMove(sim, move, draw) {
    const player = sim.players[sim.currentPlayerIndex];
    const ti = player.tiles.findIndex(t => t.id === move.tileId);
    if (ti < 0) { // shouldn't happen; just pass the turn defensively
      sim.currentPlayerIndex = (sim.currentPlayerIndex + 1) % sim.players.length;
      return;
    }
    const tile = player.tiles[ti];
    const placed = { ...tile, rotation: move.rotation };

    const scoring = sim.scoring;
    const savedPaths = scoring.bestPaths;
    scoring.bestPaths = sim.bestPaths;
    let total = 0;
    try {
      const r = scoring.calculateScore(sim, move.position, placed);
      total = (typeof r === 'object') ? (r.total || 0) : (r || 0);
    } catch (_) {
      total = 0;
    } finally {
      sim.bestPaths = scoring.bestPaths; // capture path improvements this move made
      scoring.bestPaths = savedPaths;    // hand the live map straight back
    }

    sim.boardState[move.position.y][move.position.x] = placed;
    player.score += total;
    player.tiles.splice(ti, 1);

    // Special starter tiles are never replenished; everything else draws anew.
    if (draw && !tile.isSpecialStart) {
      const nt = sim.tileSet.generateTile(player.idx, sim.numPlayers);
      if (nt) player.tiles.push(nt);
    }

    sim.currentPlayerIndex = (sim.currentPlayerIndex + 1) % sim.players.length;
  }

  // Every legal (tile, rotation, cell) for the player to move in `sim`.
  // Rotations that leave a tile's edges unchanged are skipped.
  _legalMoves(sim) {
    const ruleset = sim.ruleset;
    const player = sim.players[sim.currentPlayerIndex];
    const moves = [];
    for (const tile of player.tiles) {
      const seen = new Set();
      for (let rot = 0; rot < 4; rot++) {
        const sides = this._rotatedSides(tile.sides, rot);
        const key = sides.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        const cells = ruleset.getValidMoves(sim, { ...tile, rotation: rot });
        for (const pos of cells) moves.push({ tileId: tile.id, rotation: rot, position: pos });
      }
    }
    return moves;
  }

  _backprop(node, reward) {
    for (let n = node; n; n = n.parent) { n.visits++; n.reward += reward; }
  }

  // AI score minus the best opponent score (0 if the AI is the only player).
  _diff(sim, aiId) {
    let mine = 0;
    let bestOther = -Infinity;
    for (const p of sim.players) {
      if (p.id === aiId) mine = p.score;
      else if (p.score > bestOther) bestOther = p.score;
    }
    return mine - (bestOther === -Infinity ? 0 : bestOther);
  }

  _mostVisitedChild(node) {
    let best = null;
    let bestV = -1;
    for (const c of node.children) {
      if (c.visits > bestV) { bestV = c.visits; best = c; }
    }
    return best;
  }

  // Turn a move descriptor back into a playable move bound to the live rack.
  _resolveMove(gs, player, move) {
    const tile = player.tiles.find(t => t.id === move.tileId);
    if (!tile) return null;
    return { tile, rotation: move.rotation, position: move.position };
  }

  _copyCounts(counts) {
    const out = {};
    for (const k in counts) out[k] = { ...counts[k] };
    return out;
  }

  _logistic(x) { return 1 / (1 + Math.exp(-x / VALUE_SCALE)); }

  // ----- Border-awareness helpers --------------------------------------------

  // All unclaimed border bonus tiles with their inward-facing edge index.
  _unclaimedBonusTiles(gs) {
    const N = gs.boardSize;
    const out = [];
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const t = gs.boardState[y]?.[x];
        if (t?.isBonusTile && !t.claimed) {
          const sides = this._rotatedSides(t.sides, t.rotation || 0);
          const inward = sides.indexOf('street');
          if (inward >= 0) out.push({ x, y, inward });
        }
      }
    }
    return out;
  }

  // Reward for moves aligned with unclaimed border tiles along a shared axis.
  // The claim bonus and connect bonus never appear in calculateScore (they are
  // awarded separately in placeTile), so the AI needs this explicit signal.
  // Direct edge-matching neighbour: +6; further away: tapers to 0 at 5 cells.
  _borderApproachBonus(pos, sides, bonusTiles) {
    const dirs = [
      { dx: 0, dy: -1, e: 0 }, { dx: 1, dy: 0, e: 1 },
      { dx: 0, dy: 1,  e: 2 }, { dx: -1, dy: 0, e: 3 },
    ];
    let bonus = 0;
    for (const bt of bonusTiles) {
      const dx = bt.x - pos.x, dy = bt.y - pos.y;
      if (dx !== 0 && dy !== 0) continue;               // not on the same axis
      const dist = Math.abs(dx || dy);
      if (dist === 0 || dist > 5) continue;
      const dir = dx !== 0
        ? (dx > 0 ? dirs[1] : dirs[3])
        : (dy > 0 ? dirs[2] : dirs[0]);
      if (sides[dir.e] !== 'street') continue;           // our edge doesn't face it
      if (((dir.e + 2) % 4) !== bt.inward) continue;    // bonus tile faces away
      bonus += dist === 1 ? 6 : Math.max(0, 5 - dist);
    }
    return bonus;
  }

  // Extra bonus when placing the centre-square starter tile.  Reward cells
  // whose street exits have a clear line-of-sight to unclaimed border tiles,
  // since that determines how productive early path-building will be.
  _centreSquarePlacementBonus(gs, pos, sides, bonusTiles) {
    const N = gs.boardSize;
    const dirs = [
      { dx: 0, dy: -1, e: 0 }, { dx: 1, dy: 0, e: 1 },
      { dx: 0, dy: 1,  e: 2 }, { dx: -1, dy: 0, e: 3 },
    ];
    let bonus = 0;
    for (const { dx, dy, e } of dirs) {
      if (sides[e] !== 'street') continue;
      let cx = pos.x + dx, cy = pos.y + dy;
      while (cx >= 0 && cx < N && cy >= 0 && cy < N) {
        const t = gs.boardState[cy]?.[cx];
        if (t) {
          if (t.isBonusTile && !t.claimed) bonus += 3; // clear shot at a bonus tile
          break;                                        // any tile blocks the view
        }
        cx += dx; cy += dy;
      }
    }
    // Slight penalty for each unclaimed border tile with no aligned exit —
    // signals exits are pointed at already-claimed or blocked directions.
    const unaligned = bonusTiles.filter(bt => {
      const dx = bt.x - pos.x, dy = bt.y - pos.y;
      if (dx !== 0 && dy !== 0) return false;
      const dist = Math.abs(dx || dy);
      if (dist === 0) return false;
      const dir = dx !== 0 ? (dx > 0 ? dirs[1] : dirs[3]) : (dy > 0 ? dirs[2] : dirs[0]);
      return sides[dir.e] !== 'street';
    }).length;
    bonus -= unaligned * 0.5;
    return bonus;
  }

  // ----- Path-continuity helper ----------------------------------------------

  // Map of empty cells adjacent to the player's already-placed tiles that have
  // a street edge facing outward.  The value is the edge index that a new tile
  // must have as 'street' to connect.  Isolated placements (not in this set)
  // cannot earn path-scoring points until the gap is later filled.
  _getPlayerFrontier(gs, player) {
    const N = gs.boardSize;
    const dirs = [
      { dx: 0, dy: -1, e: 0 }, { dx: 1, dy: 0, e: 1 },
      { dx: 0, dy: 1,  e: 2 }, { dx: -1, dy: 0, e: 3 },
    ];
    const frontier = new Map(); // "x,y" -> inbound edge that must be 'street'
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const t = gs.boardState[y]?.[x];
        if (!t || t.isBonusTile || t.backgroundColor !== player.color) continue;
        const tsides = this._rotatedSides(t.sides, t.rotation || 0);
        for (const { dx, dy, e } of dirs) {
          if (tsides[e] !== 'street') continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
          if (gs.boardState[ny]?.[nx]) continue;
          frontier.set(`${nx},${ny}`, (e + 2) % 4);
        }
      }
    }
    return frontier;
  }

  // Cells in any opponent's road frontier that lie on the approach axis toward
  // an unclaimed border bonus tile.  Returns Map<"x,y", level> where level 4
  // means the opponent is ONE step from claiming; level 1 means four steps.
  // Works with both live GameState (gs.playerManager.players) and SimGame
  // (gs.players), so it can be called from _rootCandidates too.
  _opponentBorderThreats(gs, player, bonusTiles) {
    const threats = new Map();
    if (!bonusTiles.length) return threats;
    const dirs = [
      { dx: 0, dy: -1, e: 0 }, { dx: 1, dy: 0, e: 1 },
      { dx: 0, dy: 1,  e: 2 }, { dx: -1, dy: 0, e: 3 },
    ];
    const allPlayers = gs.playerManager?.players ?? gs.players;
    const opponents = allPlayers.filter(p => p.id !== player.id);
    for (const opp of opponents) {
      const frontier = this._getPlayerFrontier(gs, opp);
      for (const [fKey] of frontier) {
        const [fx, fy] = fKey.split(',').map(Number);
        let maxLevel = 0;
        for (const bt of bonusTiles) {
          const dx = bt.x - fx, dy = bt.y - fy;
          if (dx !== 0 && dy !== 0) continue;          // must share an axis
          const dist = Math.abs(dx || dy);
          if (dist === 0 || dist > 4) continue;
          // Confirm the approach direction aligns with the bonus tile's inward street.
          const dir = dx !== 0
            ? (dx > 0 ? dirs[1] : dirs[3])
            : (dy > 0 ? dirs[2] : dirs[0]);
          if ((dir.e + 2) % 4 !== bt.inward) continue; // tile faces wrong way
          maxLevel = Math.max(maxLevel, 5 - dist);
        }
        if (maxLevel > 0) threats.set(fKey, maxLevel);
      }
    }
    return threats;
  }

  // ---- Greedy enumeration (easy / normal / hard fallback) ------------------

  // Enumerate every legal (tile, rotation, cell) and score it. Evaluation is
  // side-effect free: the scoring system's path-bonus bookkeeping is snapshotted
  // and restored between candidates so each is judged from the same baseline,
  // and the path search budget is reduced so dense boards stay responsive.
  _enumerateMoves(gs, player) {
    const scoring = gs.scoringSystem;
    const ruleset = gs.ruleset;
    const center = Math.floor(gs.boardSize / 2);
    const bonusTiles    = this._unclaimedBonusTiles(gs);
    const frontier      = this._getPlayerFrontier(gs, player);
    const hasFrontier   = frontier.size > 0;
    const oppThreats    = this._opponentBorderThreats(gs, player, bonusTiles);

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
            const fKey = `${pos.x},${pos.y}`;
            const connectsToPlayer = hasFrontier
              && frontier.has(fKey)
              && sides[frontier.get(fKey)] === 'street';
            moves.push({
              tile,
              rotation: rot,
              position: pos,
              score,
              matches: scoring.countMatches ? scoring.countMatches(gs, pos, probe) : 0,
              openExits: this._openExits(gs, pos, sides),
              centerDist: Math.abs(pos.x - center) + Math.abs(pos.y - center),
              borderApproach: this._borderApproachBonus(pos, sides, bonusTiles),
              specialBonus: tile.isSpecialStart
                ? this._centreSquarePlacementBonus(gs, pos, sides, bonusTiles) : 0,
              connectsToPlayer,
              isolated: hasFrontier && !connectsToPlayer,
              blocksOpponent: oppThreats.get(fKey) || 0,
            });
          }
        }
      }
    } finally {
      if (snap) scoring.bestPaths = new Map(snap); // leave scoring pristine
      if (ps) ps.searchBudget = origBudget;        // restore full-accuracy budget
    }

    // If every legal move is isolated (frontier exists but unreachable under
    // current tiles), lift the penalty so we don't unfairly suppress all moves.
    if (hasFrontier && !moves.some(m => m.connectsToPlayer)) {
      for (const m of moves) m.isolated = false;
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
