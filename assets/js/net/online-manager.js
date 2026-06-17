// assets/js/net/online-manager.js
// Orchestrates online play on top of the existing single-device game.
//
// Model: "current-player authority". The phone whose turn it is runs the real
// GameState locally (placing the tile, scoring, dealing its replacement), then
// pushes the full snapshot to sync.php. Every other phone polls and adopts the
// snapshot via the game's rehydration helpers — no game logic is re-run, so
// there's no RNG divergence. Per-player tile limits stay correct because the
// tile-generation counts travel with each snapshot.

import { OnlineClient } from './online-client.js?v=3.1';

const SESSION_KEY = 'tiles_online_session_v1';
const POLL_MS = 1500;

const ERROR_MESSAGES = {
  not_found: 'Room not found — check the code.',
  started: 'That game has already started.',
  full: 'That room is full.',
  bad_code: 'Enter a valid room code.',
  no_seat: "You're not seated in that room.",
  not_host: 'Only the host can start the game.',
  not_your_turn: "It's not your turn.",
  too_big: 'Game state too large to sync.',
};

export class OnlineManager {
  constructor(game) {
    this.game = game;
    this.client = new OnlineClient('./sync.php');

    this.code = null;
    this.token = null;
    this.mySlot = -1;
    this.isHost = false;
    this.status = 'idle';      // idle | lobby | playing | finished
    this.lastSeq = 0;
    this.config = null;
    this.roster = [];

    this._pollTimer = null;
    this._built = false;       // local game scaffolding constructed?
    this._endShown = false;
    this._pushing = false;
    this._pushPending = false;
  }

  get active() { return this.status !== 'idle'; }

  init() {
    this._wire();
    this._tryResume();
  }

  // ---- DOM wiring ----------------------------------------------------------

  _wire() {
    const click = (id, fn) => document.getElementById(id)?.addEventListener('click', fn);
    click('qs-online-btn', () => this.openModal());
    click('online-close-x', () => this.closeModal());
    click('online-host-btn', () => this.host());
    click('online-join-btn', () => this.join());
    click('online-start-btn', () => this.startMatch());
    click('online-play-again-btn', () => this.restartMatch());
    click('online-leave-btn', () => this.leave());
    click('online-abandon-btn', () => this.leave());
    click('online-stop-btn', () => this.stopGame());
    click('online-lobby-settings-btn', () => { this.closeModal(); this.game._goToSetup(); });
    click('game-online-btn', () => this.openModal());
    const modal = document.getElementById('online-modal');
    modal?.addEventListener('click', (e) => { if (e.target === modal) this.closeModal(); });
  }

  openModal() {
    if (this.active) {
      if (this.status === 'playing' || this.status === 'finished') {
        this._enterPlayingModal();
      } else {
        this._enterLobby();
      }
      return;
    }
    this._showPane('choose');
    this._error('');
    const m = document.getElementById('online-modal');
    if (m) m.style.display = 'flex';
  }

  _enterPlayingModal() {
    this._showPane('playing');
    const codeEl = document.getElementById('online-room-code-playing');
    if (codeEl) codeEl.textContent = this.code;
    this._renderRosterPlaying(this.roster);

    // Host sees Stop Game + Leave Room; non-host sees only Leave Session.
    const stopBtn = document.getElementById('online-stop-btn');
    if (stopBtn) stopBtn.style.display = this.isHost ? '' : 'none';
    const abandonBtn = document.getElementById('online-abandon-btn');
    if (abandonBtn) abandonBtn.textContent = this.isHost ? 'Leave Room' : 'Leave Session';

    const m = document.getElementById('online-modal');
    if (m) m.style.display = 'flex';
  }

  _renderRosterPlaying(roster) {
    const ul = document.getElementById('online-roster-playing');
    if (!ul) return;
    ul.innerHTML = '';
    (roster || []).forEach((r) => {
      const li = document.createElement('li');
      const badges =
        (r.slot === 0 ? '<span class="online-badge">host</span>' : '') +
        (r.slot === this.mySlot ? '<span class="online-badge">you</span>' : '');
      li.innerHTML =
        `<span class="online-dot ${r.online ? 'on' : ''}"></span>` +
        `<span>${this._esc(r.name)}</span>${badges}`;
      ul.appendChild(li);
    });
  }

  closeModal() {
    const m = document.getElementById('online-modal');
    if (m) m.style.display = 'none';
  }

  _showPane(which) {
    ['choose', 'lobby', 'playing'].forEach((p) => {
      const el = document.getElementById(`online-pane-${p}`);
      if (el) el.style.display = p === which ? 'block' : 'none';
    });
  }

  _name() {
    const v = document.getElementById('online-name')?.value.trim();
    return v || 'Player';
  }

  _error(msg, inLobby = false, inPlaying = false) {
    let id = 'online-error';
    if (inLobby)   id = 'online-error-lobby';
    if (inPlaying) id = 'online-error-playing';
    const el = document.getElementById(id);
    if (el) el.textContent = msg || '';
  }

  _msg(code) { return ERROR_MESSAGES[code] || ('Error: ' + code); }

  _esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---- Hosting / joining ---------------------------------------------------

  async host() {
    this._error('');
    const name = this._name();
    // Capture the host's current game settings; players are filled in at start.
    const config = this.game.setupManager.buildConfig(4);
    config.tournament = null;
    let res;
    try { res = await this.client.create(name, config); }
    catch { return this._error('Network error — is the server reachable?'); }
    if (!res.ok) return this._error(this._msg(res.error));

    this.config = config;
    this.isHost = true;
    this.status = 'lobby';
    this.lastSeq = 0;
    this.roster = [{ slot: 0, name, online: true }];
    this._setSession({ code: res.code, token: res.token, slot: res.slot, isHost: true });
    this._enterLobby();
  }

  async join() {
    this._error('');
    const code = (document.getElementById('online-join-code')?.value || '').toUpperCase().trim();
    if (!code) return this._error('Enter a room code.');
    const name = this._name();
    let res;
    try { res = await this.client.join(code, name); }
    catch { return this._error('Network error — is the server reachable?'); }
    if (!res.ok) return this._error(this._msg(res.error));

    this.config = res.config;
    this.isHost = false;
    this.status = 'lobby';
    this.lastSeq = 0;
    this.roster = res.roster || [];
    this._setSession({ code: res.code || code, token: res.token, slot: res.slot, isHost: false });
    this._enterLobby();
  }

  // Host: build the initial game locally (deals tiles) and push it.
  async startMatch() {
    if (!this.isHost) return;
    const roster = (this.roster || []).slice().sort((a, b) => a.slot - b.slot);
    if (roster.length < 2) return this._error('Need at least 2 players to start.', true);

    const players = roster.map((r) => ({ name: r.name }));
    // Always read fresh settings from the setup UI so any changes the host made
    // via Change Settings are picked up.
    const freshConfig = this.game.setupManager.buildConfig(players.length);
    const config = { ...freshConfig, players, tournament: null, enableTimer: false };
    config.tileSetOptions = this.game.setupManager.getTileSetOptions(config.tileSet, players.length);
    this.config = config;

    // Optimistically flip to playing so the game UI builds in online mode.
    this.status = 'playing';
    this._endShown = false;
    this.game.buildHostedGame(config, this.mySlot);
    this._built = true;

    const gs = this.game.gameState;
    let res;
    try {
      res = await this.client.start(this.code, this.token, {
        state: gs.toJSON(),
        tileCounts: gs.tileSet.exportCounts ? gs.tileSet.exportCounts() : null,
        config,
      });
    } catch {
      return this._error('Network error starting game.', true);
    }
    if (!res.ok) return this._error(this._msg(res.error), true);
    this.status = 'playing';
    this.lastSeq = res.seq;
    this.closeModal();
  }

  // Host: start a new game in the same room without anyone leaving/rejoining.
  // Re-reads the current setup UI so the host can change board size, tile set,
  // scoring options etc. via the Settings button before clicking Play Again.
  async restartMatch() {
    if (!this.isHost) return;
    const roster = (this.roster || []).slice().sort((a, b) => a.slot - b.slot);
    const players = roster.map((r) => ({ name: r.name }));
    const freshConfig = this.game.setupManager.buildConfig(players.length);
    const config = { ...freshConfig, players, tournament: null, enableTimer: false };
    config.tileSetOptions = this.game.setupManager.getTileSetOptions(config.tileSet, players.length);
    this.config = config;

    this.status = 'playing';
    this._endShown = false;
    this.game.buildHostedGame(config, this.mySlot);
    this._built = true;
    document.getElementById('game-end-modal').style.display = 'none';

    const gs = this.game.gameState;
    let res;
    try {
      res = await this.client.start(this.code, this.token, {
        state: gs.toJSON(),
        tileCounts: gs.tileSet.exportCounts ? gs.tileSet.exportCounts() : null,
        config,
      });
    } catch {
      return this._error('Network error restarting game.', true);
    }
    if (!res.ok) return this._error(this._msg(res.error), true);
    this.status = 'playing';
    this.lastSeq = res.seq;
  }

  // Host: return the room to lobby state without destroying it.
  // All connected non-hosts will detect the status change on their next poll
  // and be shown the lobby waiting screen automatically.
  async stopGame() {
    if (!this.isHost) return;
    let res;
    try { res = await this.client.reset(this.code, this.token); }
    catch { return this._error('Network error — could not stop game.', false, true); }
    if (!res.ok) return this._error(this._msg(res.error), false, true);

    this.status = 'lobby';
    this._built = false;
    this._endShown = false;
    this.lastSeq = res.seq;
    document.getElementById('game-end-modal')?.style.setProperty('display', 'none');
    this._enterLobby();
  }

  // ---- Lobby ---------------------------------------------------------------

  _enterLobby() {
    this._showPane('lobby');
    const codeEl = document.getElementById('online-room-code');
    if (codeEl) codeEl.textContent = this.code;
    const startBtn = document.getElementById('online-start-btn');
    if (startBtn) startBtn.style.display = this.isHost ? '' : 'none';
    const waiting = document.getElementById('online-waiting-msg');
    if (waiting) waiting.style.display = this.isHost ? 'none' : '';
    const settingsBtn = document.getElementById('online-lobby-settings-btn');
    if (settingsBtn) settingsBtn.style.display = this.isHost ? '' : 'none';
    this._error('', true);
    this._renderRoster(this.roster);
    const m = document.getElementById('online-modal');
    if (m) m.style.display = 'flex';
    this._startPolling();
  }

  _renderRoster(roster) {
    const ul = document.getElementById('online-roster');
    if (ul) {
      ul.innerHTML = '';
      (roster || []).forEach((r) => {
        const li = document.createElement('li');
        const badges =
          (r.slot === 0 ? '<span class="online-badge">host</span>' : '') +
          (r.slot === this.mySlot ? '<span class="online-badge">you</span>' : '');
        li.innerHTML =
          `<span class="online-dot ${r.online ? 'on' : ''}"></span>` +
          `<span>${this._esc(r.name)}</span>${badges}`;
        ul.appendChild(li);
      });
    }
    const startBtn = document.getElementById('online-start-btn');
    if (startBtn) startBtn.disabled = !(this.isHost && (roster || []).length >= 2);
  }

  // ---- Polling -------------------------------------------------------------

  _startPolling() { this._stopPolling(); this._poll(); }
  _stopPolling() { if (this._pollTimer) { clearTimeout(this._pollTimer); this._pollTimer = null; } }

  async _poll() {
    try {
      const res = await this.client.poll(this.code, this.lastSeq, this.token);
      this._handlePoll(res);
    } catch {
      /* transient network error — keep polling */
    }
    if (this.status !== 'idle') {
      this._pollTimer = setTimeout(() => this._poll(), POLL_MS);
    }
  }

  _handlePoll(res) {
    if (!res || !res.ok) {
      if (res && res.error === 'not_found') {
        this._error('Room closed.', true);
        this.leave(false);
      }
      return;
    }

    // Host reset the room back to lobby while a game was in progress.
    // Non-hosts detect this and return to the lobby waiting screen.
    const isLobbyReset = res.status === 'lobby' &&
      (this.status === 'playing' || this.status === 'finished') &&
      res.seq > this.lastSeq;
    if (isLobbyReset) {
      this._endShown = false;
      this._built = false;
      this.status = 'lobby';
      this.lastSeq = res.seq;
      if (res.roster) { this.roster = res.roster; this._renderRoster(res.roster); }
      if (!this.isHost) {
        document.getElementById('game-end-modal')?.style.setProperty('display', 'none');
        this._enterLobby();
      }
      return;
    }

    // Advance status monotonically: a late/stale poll must never drag us back
    // (e.g. from an optimistic 'playing' to the server's not-yet-updated 'lobby').
    // Exception: a new game started by the host resets finished→playing, detected
    // by firstMove=true on the incoming state.
    const isRestart = res.state?.firstMove === true && this.status === 'finished';
    if (isRestart) {
      this._endShown = false;
      this.status = 'playing';
      // Force a full rebuild so non-hosts pick up any config changes (board size,
      // tile set, scoring options) the host may have made via the Settings button.
      this._built = false;
    }
    const order = { idle: 0, lobby: 1, playing: 2, finished: 3 };
    if (res.status && order[res.status] >= order[this.status]) this.status = res.status;
    if (res.roster) { this.roster = res.roster; this._renderRoster(res.roster); }

    if (res.seq && res.seq > this.lastSeq) {
      this.lastSeq = res.seq;
      if ((res.status === 'playing' || res.status === 'finished') && res.state) {
        this.adopt(res);
      }
    }
  }

  // ---- Adopting a snapshot -------------------------------------------------

  adopt(snapshot) {
    this.config = snapshot.config || this.config;
    this.status = snapshot.status || this.status;

    if (!this._built) {
      this.game.buildJoinedGame(this.config, snapshot, this.mySlot);
      this._built = true;
    } else {
      this.game.applyOnlineSnapshot(snapshot);
    }
    this.closeModal();

    // When a fresh game arrives after the previous one ended, clear any
    // lingering game-end screen so the non-host player sees the new board.
    if (snapshot.status === 'playing' && !this._endShown) {
      document.getElementById('game-end-modal')?.style.setProperty('display', 'none');
    }

    if ((snapshot.status === 'finished' || snapshot.ended) && !this._endShown) {
      this._endShown = true;
      this.game.showGameEndModal(snapshot.finalScores || []);
    }
  }

  // ---- Pushing a local move ------------------------------------------------

  async pushLocalMove() {
    if (this.status !== 'playing') return;
    if (this._pushing) { this._pushPending = true; return; }
    this._pushing = true;
    try {
      do {
        this._pushPending = false;
        const gs = this.game.gameState;
        const payload = {
          fromSlot: this.mySlot,
          state: gs.toJSON(),
          tileCounts: gs.tileSet.exportCounts ? gs.tileSet.exportCounts() : null,
          ended: !!gs._ended,
          finalScores: gs._finalScores || null,
        };
        let res;
        try { res = await this.client.move(this.code, this.token, payload); }
        catch { res = null; }

        if (res && res.ok) {
          this.lastSeq = res.seq;
          if (gs._ended) this.status = 'finished';
        } else if (res && res.seq) {
          // Rejected (stale / not our turn): force a re-adopt of the
          // authoritative state on the next poll to self-heal.
          this.lastSeq = Math.max(0, res.seq - 1);
        }
      } while (this._pushPending);
    } finally {
      this._pushing = false;
    }
  }

  // ---- Session persistence / resume ---------------------------------------

  _setSession({ code, token, slot, isHost }) {
    this.code = code;
    this.token = token;
    this.mySlot = slot;
    this.isHost = !!isHost;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ code, token, slot, isHost: !!isHost }));
    } catch { /* ignore */ }
  }

  _loadSession() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  }

  _clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }

  async _tryResume() {
    const s = this._loadSession();
    if (!s || !s.code || !s.token) return;
    let res;
    try { res = await this.client.resume(s.code, s.token); }
    catch { return; }
    if (!res.ok) { this._clearSession(); return; }

    this.code = s.code;
    this.token = s.token;
    this.mySlot = res.slot;
    this.isHost = !!res.isHost;
    this.config = res.config;
    this.status = res.status;
    this.roster = res.roster || [];
    this.lastSeq = 0;

    if (res.status === 'lobby') {
      this._enterLobby();
    } else {
      // playing or finished — re-join the live game.
      this._startPolling();
      this.adopt(res);
      this.lastSeq = res.seq;
    }
  }

  // ---- Leaving -------------------------------------------------------------

  async leave(callServer = true, afterFn = null) {
    this._stopPolling();
    if (callServer && this.code) {
      try { await this.client.leave(this.code, this.token); } catch { /* ignore */ }
    }
    this._clearSession();
    this.code = null;
    this.token = null;
    this.mySlot = -1;
    this.isHost = false;
    this.status = 'idle';
    this.lastSeq = 0;
    this.config = null;
    this.roster = [];
    this._built = false;
    this._endShown = false;
    this.closeModal();
    (afterFn ?? (() => this.game.setupManager.showQuickStart()))();
  }
}
