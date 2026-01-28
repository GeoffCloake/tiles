// assets/js/ui/board-manager.js
import { createScorePopup } from '../utils/canvas-utils.js';

export class BoardManager {
  constructor(config) {
    this.boardElement = config.boardElement;
    this.onTilePlaced = config.onTilePlaced;
    this.gameState = null;
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

  renderTile(position, tile) {
    const index = position.y * this.gameState.boardSize + position.x;
    const cell = this.boardElement.children[index];
    if (!cell) return;
    const canvas = cell.querySelector('canvas');
    if (!canvas) return;
    this.gameState.tileSet.renderTile(tile, canvas, tile.rotation || 0);
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

  showScorePopup(position, score) {
    const index = position.y * this.gameState.boardSize + position.x;
    const cell = this.boardElement.children[index];
    if (cell) createScorePopup(cell, score);
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
      if (tile) this.renderTile({ x, y }, tile);
    }
  }

  setupResizeListener() {
    let t;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => this.resizeBoard(), 250);
    });
  }
}
