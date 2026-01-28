// Player UI manager (sidebar names, current player, scores, timer, skip turn)

const DEFAULT_PLAYER_COLORS = [
  '#FFFFFF', // solo mode
  '#df0000', '#008bda', '#FFE600', '#1f9100'
];

export class PlayerUIManager {
  constructor(config) {
    this.playerContainer = document.getElementById('player-container');
    this.currentPlayerDisplay = document.getElementById('current-player-display');
    this.turnTimer = document.getElementById('turn-timer');
    this.skipTurnButton = document.getElementById('skip-turn');
    this.playerNamesContainer = document.getElementById('player-names-container');

    this.gameState = null;
    this.config = config || {};
    this.playerColors = DEFAULT_PLAYER_COLORS;

    this.setupEventListeners();
  }

  setupEventListeners() {
    if (this.skipTurnButton) {
      this.skipTurnButton.addEventListener('click', () => {
        if (this.config.onSkipTurn) this.config.onSkipTurn();
      });
    }
    const playerCountSelect = document.getElementById('player-count');
    if (playerCountSelect) {
      playerCountSelect.addEventListener('change', (e) => {
        this.updatePlayerNameInputs(parseInt(e.target.value, 10));
      });
    }
  }

  initialize(gameState) {
    this.gameState = gameState;
    this.updatePlayerList();
    this.setupGameStateListeners();
  }

  setupGameStateListeners() {
    if (!this.gameState) return;
    this.gameState.on('turnChange', (player) => this.updateCurrentPlayer(player));
    this.gameState.on('scoreUpdate', (player) => this.updatePlayerScore(player));
    this.gameState.on('turnTimerUpdate', (timeLeft) => this.updateTurnTimer(timeLeft));
  }

  updateCurrentPlayer(player) {
    this.updateCurrentPlayerDisplay(player);
    this.updatePlayerHighlight(player);
  }

  updateCurrentPlayerDisplay(player) {
    if (this.currentPlayerDisplay && player) {
      this.currentPlayerDisplay.textContent = `${player.name}'s Turn`;
    }
  }

  updatePlayerList() {
    if (!this.playerContainer || !this.gameState) return;
    const players = this.gameState.playerManager.players;

    this.playerContainer.setAttribute('data-players', players.length);
    this.playerContainer.innerHTML = '';

    players.forEach((player, index) => {
      const div = document.createElement('div');
      div.id = `player-${player.id}`;
      div.className = 'player-info';

      const colorIndex = players.length === 1 ? 0 : Math.min(index + 1, this.playerColors.length - 1);
      const playerColor = this.playerColors[colorIndex];
      div.dataset.playerColor = playerColor;

      if (player === this.gameState.getCurrentPlayer()) {
        div.classList.add('active-turn');
        div.style.border = `1px solid ${playerColor}`;
      }

      const bonusText = player.bonusScore > 0 ? ` <small style="color:var(--accent-green)">(${player.bonusScore} Bonus)</small>` : '';
      div.innerHTML = `<h3>${player.name}</h3>
                       <p>Score: <span id="score-${player.id}">${player.score}${bonusText}</span></p>`;

      this.playerContainer.appendChild(div);
    });
  }

  updatePlayerScore(player) {
    const el = document.getElementById(`score-${player.id}`);
    if (el) {
      // Show breakdown if bonus exists
      const bonusText = player.bonusScore > 0 ? ` <small style="color:var(--accent-green)">(${player.bonusScore} Bonus)</small>` : '';
      el.innerHTML = `${player.score}${bonusText}`;
    }
  }

  updatePlayerHighlight(player) {
    if (!this.playerContainer) return;

    // clear
    document.querySelectorAll('.player-info').forEach(div => {
      div.classList.remove('active-turn');
      div.style.border = 'none';
    });

    const players = this.gameState.playerManager.players;
    const idx = players.findIndex(p => p.id === player.id);
    const colorIndex = players.length === 1 ? 0 : Math.min(idx + 1, this.playerColors.length - 1);
    const playerColor = this.playerColors[colorIndex];

    const div = document.getElementById(`player-${player.id}`);
    if (div) {
      div.classList.add('active-turn');
      div.style.border = `1px solid ${playerColor}`;
    }
  }

  updateTurnTimer(timeLeft) {
    if (!this.turnTimer) return;
    this.turnTimer.textContent = timeLeft > 0 ? `Time: ${timeLeft}s` : '';
  }

  updatePlayerNameInputs(playerCount) {
    if (!this.playerNamesContainer) return;

    this.playerNamesContainer.innerHTML = '';
    for (let i = 1; i <= playerCount; i++) {
      const g = document.createElement('div');
      g.className = 'player-name-input';
      g.innerHTML = `
        <label for="player-${i}-name">Player ${i} Name:</label>
        <input type="text" id="player-${i}-name" name="player-${i}-name" placeholder="Enter name" value="Player ${i}">
      `;
      this.playerNamesContainer.appendChild(g);
    }
  }

  getPlayerNames() {
    const names = [];
    document.querySelectorAll('[id^="player-"][id$="-name"]').forEach(input =>
      names.push(input.value || input.placeholder)
    );
    return names;
  }

  getPlayerCount() {
    const s = document.getElementById('player-count');
    return s ? parseInt(s.value, 10) : 1;
  }

  resetDisplay() {
    if (this.currentPlayerDisplay) this.currentPlayerDisplay.textContent = '';
    if (this.turnTimer) this.turnTimer.textContent = '';
    if (this.playerContainer) this.playerContainer.innerHTML = '';
  }

  getPlayerColor(playerIndex) {
    const players = this.gameState ? this.gameState.playerManager.players : [];
    const colorIndex = players.length === 1 ? 0 : Math.min(playerIndex + 1, this.playerColors.length - 1);
    return this.playerColors[colorIndex];
  }
}
