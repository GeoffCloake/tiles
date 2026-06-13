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
        // tileWeights: null means use _defaultWeights()
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

  // ---- Tile type catalogue ----

  _defaultWeights() {
    return [
      { key: 'cross',     type: 'normal',    sides: ['street','street','street','street'],                weight: 5  },
      { key: 'tJunction', type: 'normal',    sides: ['street','street','street','non-street'],            weight: 15 },
      { key: 'straight',  type: 'normal',    sides: ['street','non-street','street','non-street'],        weight: 10 },
      { key: 'corner',    type: 'normal',    sides: ['street','street','non-street','non-street'],        weight: 15 },
      { key: 'deadEnd',   type: 'normal',    sides: ['street','non-street','non-street','non-street'],    weight: 10 },
      { key: 'blank',     type: 'normal',    sides: ['non-street','non-street','non-street','non-street'],weight: 5  },
      // Special tiles (disabled by default — set weight > 0 in setup to enable)
      { key: 'tunnel',    type: 'tunnel',    sides: ['street','street','street','street'],                weight: 0  },
      { key: 'roadblock', type: 'roadblock', sides: ['non-street','non-street','non-street','non-street'],weight: 0  },
      { key: 'private',   type: 'private',   sides: ['street','non-street','street','non-street'],        weight: 0  },
    ];
  }

  _weightedSelect(weights) {
    const total = weights.reduce((s, w) => s + w.weight, 0);
    if (total === 0) return weights[0];
    let r = Math.random() * total;
    for (const item of weights) {
      r -= item.weight;
      if (r <= 0) return item;
    }
    return weights[weights.length - 1];
  }

  generateTile(playerIndex = null, playerCount = 1) {
    const weights = this.options.tileWeights || this._defaultWeights();
    const valid = weights.filter(w => w.weight > 0);

    let shape;
    if (valid.length) {
      shape = this._weightedSelect(valid);
    } else {
      // Legacy fallback: fully random
      shape = {
        type: 'normal',
        sides: Array(4).fill(null).map(() => Math.random() < 0.75 ? 'street' : 'non-street'),
      };
    }

    const tile = {
      id: Math.random().toString(32).substr(2, 9),
      sides: [...shape.sides],
      type: shape.type || 'normal',
    };

    // Random rotation — skip for rotationally symmetric tile types
    const allSame = tile.sides.every(s => s === tile.sides[0]);
    const twoFold  = tile.sides[0] === tile.sides[2] && tile.sides[1] === tile.sides[3] && tile.sides[0] !== tile.sides[1];
    const maxRot   = allSame ? 1 : twoFold ? 2 : 4;
    const rot      = Math.floor(Math.random() * maxRot);
    for (let i = 0; i < rot; i++) tile.sides.unshift(tile.sides.pop());

    // Centre pattern (normal tiles only)
    if (
      this.options.enableCenterPatterns &&
      Math.random() < (this.options.centerPatternFrequency ?? 0.2) &&
      tile.type === 'normal'
    ) {
      tile.centerPattern = Math.random() < (this.options.patternWeights?.circles ?? 0.7) ? 'circles' : 'squares';
    }

    // Player colour
    if (playerIndex !== null) {
      tile.backgroundColor = playerCount === 1
        ? DEFAULT_PLAYER_COLORS[0]
        : DEFAULT_PLAYER_COLORS[playerIndex + 1];
    }

    // Private lane: record ownership index so path scoring can filter opponents
    if (tile.type === 'private' && playerIndex !== null) {
      tile.ownedByIndex = playerIndex;
    }

    return tile;
  }

  renderTile(tile, canvas, rotation = 0) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width;

    // Road Block: fully custom, no road graphics
    if (tile.type === 'roadblock') {
      this._drawRoadblock(ctx, size);
      return;
    }

    ctx.fillStyle = tile.backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, size, size);

    const rotatedSides = [...tile.sides];
    for (let i = 0; i < (rotation || tile.rotation || 0); i++) rotatedSides.unshift(rotatedSides.pop());

    rotatedSides.forEach((side, index) => renderPattern(ctx, size, this.patterns[side], index));

    if (tile.centerPattern) renderPattern(ctx, size, this.centerPatterns[tile.centerPattern], 0);

    // Special overlays on top of road graphics
    if (tile.type === 'tunnel')  this._drawTunnelOverlay(ctx, size);
    if (tile.type === 'private') this._drawPrivateIndicator(ctx, size);

    if (tile.isStarterTile) {
      ctx.fillStyle = 'rgba(68, 68, 68, 0.5)';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Dark tile with red X — no road connections
  _drawRoadblock(ctx, size) {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = '#cc2200';
    ctx.lineWidth = Math.max(2, size * 0.05);
    ctx.strokeRect(size * 0.07, size * 0.07, size * 0.86, size * 0.86);

    ctx.lineWidth = Math.max(3, size * 0.10);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(size * 0.22, size * 0.22);
    ctx.lineTo(size * 0.78, size * 0.78);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(size * 0.78, size * 0.22);
    ctx.lineTo(size * 0.22, size * 0.78);
    ctx.stroke();
  }

  // 4-way cross with bridge: N-S road goes over E-W road at the centre
  _drawTunnelOverlay(ctx, size) {
    const cx = size / 2;
    const cy = size / 2;
    const roadW = size * 0.34;

    // Darken E-W crossing band (under-road)
    ctx.fillStyle = 'rgba(0,0,0,0.50)';
    ctx.fillRect(0, cy - roadW * 0.5, size, roadW);

    // Bridge deck (N-S over-road)
    ctx.fillStyle = 'rgba(38,38,38,0.88)';
    ctx.fillRect(cx - roadW * 0.5, 0, roadW, size);

    // Redraw N-S road markings over the bridge deck
    renderPattern(ctx, size, this.patterns['street'], 0);
    renderPattern(ctx, size, this.patterns['street'], 2);

    // Bridge support pillars at crossing edges
    ctx.fillStyle = '#606060';
    const pw = size * 0.045;
    const ph = roadW * 0.7;
    ctx.fillRect(cx - roadW * 0.5 - pw, cy - ph / 2, pw, ph);
    ctx.fillRect(cx + roadW * 0.5,       cy - ph / 2, pw, ph);

    // Flyover directional label
    ctx.fillStyle = 'rgba(255,200,0,0.9)';
    ctx.font = `bold ${Math.max(7, size * 0.14)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↕', cx, cy - roadW * 0.12);
  }

  // Small circular badge marking a player-only private lane
  _drawPrivateIndicator(ctx, size) {
    const cx = size / 2;
    const cy = size / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = `bold ${Math.max(6, size * 0.17)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', cx, cy + size * 0.01);
  }

  validateTile(tile) {
    return Array.isArray(tile.sides) && tile.sides.length === 4 &&
      tile.sides.every(s => s === 'street' || s === 'non-street');
  }
}

export { StreetsTileSet };
