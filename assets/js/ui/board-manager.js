// assets/js/ui/board-manager.js
import { createScorePopup } from '../utils/canvas-utils.js';

export class BoardManager {
  constructor(config) {
    this.boardElement = config.boardElement;
    this.onTilePlaced = config.onTilePlaced;
    this.gameState = null;
    this._pathHighlights = new Map(); // "x,y" -> { color, edges }
  }

  initialize(gameState) {
    this.gameState = gameState;
    this.generateBoard();
    this.setupResizeListener();
    this.resizeBoard();
  }

  generateBoard() {
    if (!this.boardElement || !this.gameState) return;

    this.boardElement.innerHTML = '';
    this.boardElement.style.gridTemplateColumns = `repeat(${this.gameState.boardSize}, 1fr)`;
    this.boardElement.style.gridTemplateRows = `repeat(${this.gameState.boardSize}, 1fr)`;

    for (let y = 0; y < this.gameState.boardSize; y++) {
      for (let x = 0; x < this.gameState.boardSize; x++) {
        const cell = document.createElement('div');
        cell.classList.add('tile');
        cell.dataset.row = y;
        cell.dataset.col = x;

        const canvas = document.createElement('canvas');
        cell.appendChild(canvas);
        cell.onclick = () => this.handleCellClick(x, y);
        this.boardElement.appendChild(cell);

        // Size canvas to the actual cell size after it’s in the layout
        const size = Math.min(cell.clientWidth, cell.clientHeight) || Math.floor(700 / this.gameState.boardSize);
        canvas.width = size;
        canvas.height = size;
        canvas.style.width = '100%';
        canvas.style.height = '100%';

        const tile = this.gameState.boardState[y][x];
        if (tile) this.renderTile({ x, y }, tile);
      }
    }
  }

  handleCellClick(x, y) { if (this.onTilePlaced) this.onTilePlaced({ x, y }); }

  renderTile(position, tile, pathColor = null, pathEdges = null) {
    const index = position.y * this.gameState.boardSize + position.x;
    const cell = this.boardElement.children[index];
    if (!cell) return;
    const canvas = cell.querySelector('canvas');
    if (!canvas) return;
    this.gameState.tileSet.renderTile(tile, canvas, tile.rotation || 0, pathColor, pathEdges);
    if (tile.isBonusTile) {
      cell.classList.toggle('bonus-tile-unclaimed', !tile.claimed);
      cell.classList.toggle('bonus-tile-claimed',   !!tile.claimed);
      if (tile.claimed && tile.claimedByColor) {
        cell.style.setProperty('--star-color', tile.claimedByColor);
      }
    } else {
      cell.classList.remove('bonus-tile-unclaimed', 'bonus-tile-claimed');
    }
  }

  // Returns the edge index on `tile` that faces `neighbor` (N=0, E=1, S=2, W=3)
  _edgeFacing(neighbor, tile) {
    const dx = neighbor.x - tile.x;
    const dy = neighbor.y - tile.y;
    if (dy === -1) return 0;
    if (dx ===  1) return 1;
    if (dy ===  1) return 2;
    if (dx === -1) return 3;
    return null;
  }

  // Re-render every cell from the current boardState. Used when adopting a
  // remote game snapshot in online play: paints placed tiles and clears any
  // cell that should be empty, so the board always matches the authority.
  renderAll() {
    if (!this.boardElement || !this.gameState) return;
    const n = this.gameState.boardSize;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const tile = this.gameState.boardState[y][x];
        if (tile) {
          this.renderTile({ x, y }, tile);
        } else {
          const index = y * n + x;
          const canvas = this.boardElement.children[index]?.querySelector('canvas');
          if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        }
      }
    }
  }

  showValidMoves(validMoves) {
    this.clearValidMoves();
    validMoves.forEach(({ x, y }) => {
      const index = y * this.gameState.boardSize + x;
      const cell = this.boardElement.children[index];
      if (cell) cell.classList.add('valid-placement');
    });
  }

  clearValidMoves() {
    document.querySelectorAll('.tile.valid-placement').forEach((tile) => tile.classList.remove('valid-placement'));
  }

  showInvalidPlacement(position) {
    const index = position.y * this.gameState.boardSize + position.x;
    const cell = this.boardElement.children[index];
    if (!cell) return;
    cell.classList.add('invalid');
    setTimeout(() => cell.classList.remove('invalid'), 500);
  }

  highlightPath(path, color = null) {
    if (!path || !path.length) return;
    path.forEach((pos, i) => {
      const { x, y } = pos;
      // Only draw segments the path actually travels: edges toward prev and next tiles
      const edges = [];
      if (i > 0) { const e = this._edgeFacing(path[i - 1], pos); if (e !== null) edges.push(e); }
      if (i < path.length - 1) { const e = this._edgeFacing(path[i + 1], pos); if (e !== null) edges.push(e); }

      this._pathHighlights.set(`${x},${y}`, { color, edges });
      const index = y * this.gameState.boardSize + x;
      const cell = this.boardElement.children[index];
      if (!cell) return;
      cell.classList.add('bonus-path');
      if (color) cell.style.setProperty('--path-color', color);
      else cell.style.removeProperty('--path-color');
      const tile = this.gameState.boardState[y][x];
      if (tile) this.renderTile(pos, tile, color, edges);
    });
  }

  clearPathHighlights() {
    for (const [key] of this._pathHighlights) {
      const [x, y] = key.split(',').map(Number);
      const tile = this.gameState.boardState[y][x];
      if (tile) this.renderTile({ x, y }, tile);
    }
    this._pathHighlights.clear();
    this.boardElement.querySelectorAll('.bonus-path').forEach(cell => {
      cell.classList.remove('bonus-path');
      cell.style.removeProperty('--path-color');
    });
  }

  showScorePopup(position, score, bonus = 0) {
    const index = position.y * this.gameState.boardSize + position.x;
    const cell = this.boardElement.children[index];
    if (cell) {
      // Format: "+9 (+5 Bonus)"
      const text = bonus > 0 ? `+${score} (+${bonus} Bonus)` : `+${score}`;
      createScorePopup(cell, text);
    }
  }

  resizeBoard() {
    const cells = this.boardElement.children;
    for (const cell of cells) {
      const canvas = cell.querySelector('canvas');
      if (!canvas) continue;
      const size = Math.min(cell.clientWidth, cell.clientHeight);
      if (!size) continue;
      canvas.width = size;
      canvas.height = size;

      const x = parseInt(cell.dataset.col, 10);
      const y = parseInt(cell.dataset.row, 10);
      const tile = this.gameState.boardState[y][x];
      if (tile) {
        const h = this._pathHighlights.get(`${x},${y}`);
        this.renderTile({ x, y }, tile, h?.color ?? null, h?.edges ?? null);
      }
    }
  }

  setupResizeListener() {
    let t;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => this.resizeBoard(), 250);
    });
  }

  updateZoneOverlay(active, zone) {
    if (!this.boardElement || !this.gameState) return;
    const n = this.gameState.boardSize;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const cell = this.boardElement.children[y * n + x];
        if (!cell) continue;
        const outside = active && zone && (x < zone.x1 || x > zone.x2 || y < zone.y1 || y > zone.y2);
        cell.classList.toggle('zone-dim', !!outside);
      }
    }
  }
}
