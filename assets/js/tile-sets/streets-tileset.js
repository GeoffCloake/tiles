// assets/js/tile-sets/streets-tileset.js
import { TileSet } from '../core/base-classes.js';
import { DEFAULT_PLAYER_COLORS } from '../core/player-state.js';
import { renderPattern } from '../utils/canvas-utils.js';

class StreetsTileSet extends TileSet {
  constructor() {
    super({
      name: 'Streets',
      description: 'City streets with road connections',
      options: {
        enableCenterPatterns: true,
        centerPatternFrequency: 0.2,
        patternWeights: { circles: 0.7, squares: 0.3 },
      },
    });

    this.patterns = {
      street: {
        background: '#000000',
        elements: [
          { type: 'polygon', points: '150,150 200,100 200,0 100,0 100,100', fill: '#000000' },
          { type: 'rect', x: 147.76, y: 105.95, width: 4.49, height: 39.06, fill: '#FFFFFF' },
          { type: 'rect', x: 147.76, y: 55.23, width: 4.49, height: 39.06, fill: '#FFFFFF' },
          { type: 'rect', x: 147.76, y: 4.98, width: 4.49, height: 38.59, fill: '#FFFFFF' },
          { type: 'polygon', points: '102.25,0 103.64,0 103.64,103.64 102.25,102.25', fill: '#FFFFFF' },
          { type: 'polygon', points: '196.36,103.64 196.36,0 197.75,0 197.75,102.25', fill: '#FFFFFF' },
        ],
      },
      'non-street': {
        background: '#000000',
        elements: [
          { type: 'polygon', points: '150,150 200,100 100,100', fill: '#000000' },
          { type: 'polygon', points: '197.75,102.25 102.25,102.25 103.64,103.64 196.37,103.64', fill: '#FFFFFF' },
        ],
      },
    };

    this.centerPatterns = {
      circles: {
        elements: [
          { type: 'circle', cx: 150, cy: 150, r: 100, fill: '#000000' },
          { type: 'circle', cx: 150, cy: 150, r: 96, stroke: '#FFFFFF', fill: 'none', strokeWidth: 2 },
        ],
      },
      squares: {
        elements: [
          { type: 'rect', x: 25, y: 25, width: 250, height: 250, fill: '#000000' },
          { type: 'rect', x: 89.19, y: 89.19, width: 121.62, height: 121.62, stroke: '#FFFFFF', fill: '#000000' },
          { type: 'rect', x: 94.91, y: 94.91, width: 110.19, height: 110.19, fill: '#FFFFFF' },
        ],
      },
    };
  }

  generateTile(playerIndex = null, playerCount = 1) {
    const tile = {
      id: Math.random().toString(32).substr(2, 9),
      sides: Array(4).fill(null).map(() => (Math.random() < 0.75 ? 'street' : 'non-street')),
    };

    // Weighted center patterns
    if (this.options.enableCenterPatterns && Math.random() < this.options.centerPatternFrequency) {
      tile.centerPattern = Math.random() < this.options.patternWeights.circles ? 'circles' : 'squares';
    }

    // Use centralized player colors
    if (playerIndex !== null) {
      tile.backgroundColor = playerCount === 1 ? DEFAULT_PLAYER_COLORS[0] : DEFAULT_PLAYER_COLORS[playerIndex + 1];
    }

    return tile;
  }

  renderTile(tile, canvas, rotation = 0) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width;

    ctx.fillStyle = tile.backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, size, size);

    const rotatedSides = [...tile.sides];
    for (let i = 0; i < (rotation || tile.rotation || 0); i++) rotatedSides.unshift(rotatedSides.pop());

    rotatedSides.forEach((side, index) => renderPattern(ctx, size, this.patterns[side], index));

    if (tile.centerPattern) renderPattern(ctx, size, this.centerPatterns[tile.centerPattern], 0);

    if (tile.isStarterTile) {
      ctx.fillStyle = 'rgba(68, 68, 68, 0.5)';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  validateTile(tile) {
    return Array.isArray(tile.sides) && tile.sides.length === 4 && tile.sides.every(s => s === 'street' || s === 'non-street');
  }
}

export { StreetsTileSet };
