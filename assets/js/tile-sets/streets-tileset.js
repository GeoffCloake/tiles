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

    this._tileCountsPerPlayer = {};

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
      { key: 'roadblock', type: 'roadblock', sides: ['street','street','street','street'],                weight: 0  },
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

  onNewGame() {
    this._tileCountsPerPlayer = {};
    this._debugLogged = new Set();
  }

  // Per-player tile-issue counts travel with each online snapshot so that
  // max-per-game limits stay correct no matter which device deals a tile.
  exportCounts() {
    return JSON.parse(JSON.stringify(this._tileCountsPerPlayer || {}));
  }

  importCounts(counts) {
    this._tileCountsPerPlayer = counts ? JSON.parse(JSON.stringify(counts)) : {};
  }

  generateTile(playerIndex = null, playerCount = 1) {
    const pi = playerIndex ?? 0;
    if (!this._tileCountsPerPlayer[pi]) this._tileCountsPerPlayer[pi] = {};
    const counts = this._tileCountsPerPlayer[pi];

    // Per-player options with fallback to global options
    const pp = this.options.perPlayerOptions?.[pi] || {};
    const weights   = pp.tileWeights   || this.options.tileWeights   || this._defaultWeights();
    const maxCounts = pp.tileMaxCounts  || this.options.tileMaxCounts  || {};
    const freq      = pp.centerPatternFrequency ?? this.options.centerPatternFrequency ?? 0.2;
    const circlesRatio = pp.patternWeights?.circles ?? this.options.patternWeights?.circles ?? 0.7;

    // Debug: log the active profile once per player each game
    this._debugLogged ??= new Set();
    if (!this._debugLogged.has(pi)) {
      this._debugLogged.add(pi);
      const limits = Object.entries(maxCounts).filter(([, v]) => v > 0).map(([k, v]) => `${k}≤${v}`).join(', ') || 'none';
      console.log(`[Tiles P${pi}] weights: ${weights.map(w => `${w.key}:${w.weight}`).join(', ')} | limits: ${limits}`);
    }

    // A tile type is eligible if it still has capacity AND is enabled — either
    // by a positive weight, or by having a max set (a max alone switches the
    // type on so the limit can drive how many appear). Weight-0 + max types are
    // picked with a baseline weight of 1.
    const valid = weights
      .map(w => {
        const max  = maxCounts[w.key] || 0;
        const used = counts[w.key] || 0;
        if (max > 0 && used >= max) return null;       // hit its cap
        if (w.weight <= 0 && max <= 0) return null;     // disabled
        return { ...w, weight: w.weight > 0 ? w.weight : 1 };
      })
      .filter(Boolean);

    let shape;
    if (valid.length) {
      shape = this._weightedSelect(valid);
    } else {
      // Everything is disabled or has hit its cap — fall back to a neutral
      // blank tile rather than random ones, so limits are never exceeded.
      shape = {
        type: 'normal',
        sides: ['non-street', 'non-street', 'non-street', 'non-street'],
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

    // Track per-player count for all tile types
    if (shape.key) {
      counts[shape.key] = (counts[shape.key] || 0) + 1;
    }

    // Centre pattern (normal, non-special tiles only)
    if (this.options.enableCenterPatterns && Math.random() < freq && tile.type === 'normal') {
      const maxC = maxCounts.centerCircles || 0;
      const maxS = maxCounts.centerSquares || 0;
      const canCircle = !(maxC > 0 && (counts.centerCircles || 0) >= maxC);
      const canSquare = !(maxS > 0 && (counts.centerSquares || 0) >= maxS);
      if (canCircle || canSquare) {
        const pattern = (canCircle && canSquare)
          ? (Math.random() < circlesRatio ? 'circles' : 'squares')
          : (canCircle ? 'circles' : 'squares');
        tile.centerPattern = pattern;
        const key = pattern === 'circles' ? 'centerCircles' : 'centerSquares';
        counts[key] = (counts[key] || 0) + 1;
      }
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

  renderTile(tile, canvas, rotation = 0, pathColor = null, pathEdges = null) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width;

    // Road Block: fully custom, no road graphics
    if (tile.type === 'roadblock') {
      this._drawRoadblock(ctx, size);
      return;
    }

    // Blocker: non-playable sealed cell
    if (tile.type === 'blocker') {
      this._drawBlocker(ctx, size);
      return;
    }

    ctx.fillStyle = tile.backgroundColor || '#ffffff';
    ctx.fillRect(0, 0, size, size);

    const rotatedSides = [...tile.sides];
    for (let i = 0; i < (rotation || tile.rotation || 0); i++) rotatedSides.unshift(rotatedSides.pop());

    rotatedSides.forEach((side, index) => renderPattern(ctx, size, this.patterns[side], index));

    if (tile.centerPattern) renderPattern(ctx, size, this.centerPatterns[tile.centerPattern], 0);

    // Special overlays on top of road graphics
    if (tile.type === 'tunnel')  this._drawTunnelOverlay(ctx, size, rotation || tile.rotation || 0, tile.backgroundColor || '#ffffff');
    if (tile.type === 'private') this._drawPrivateIndicator(ctx, size, tile, rotatedSides);

    if (tile.isStarterTile) {
      ctx.fillStyle = 'rgba(68, 68, 68, 0.5)';
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    if (pathColor) this._drawPathHighlight(ctx, size, rotatedSides, pathColor, pathEdges);
  }

  // Draws a centreline stroke only along the edges the path actually travels.
  // `edges` is an array of edge indices [0=N,1=E,2=S,3=W]; if null, fall back
  // to all street edges (used when the caller doesn't know the direction).
  // Two passes: wide translucent glow halo, then a bright narrow line on top.
  _drawPathHighlight(ctx, size, rotatedSides, color, edges = null) {
    const edgeEndpoints = [[size / 2, 0], [size, size / 2], [size / 2, size], [0, size / 2]];
    const activeEdges = edges !== null
      ? edges
      : rotatedSides.map((s, i) => s === 'street' ? i : null).filter(i => i !== null);
    if (!activeEdges.length) return;

    const cx = size / 2;
    const cy = size / 2;

    const drawSegments = () => {
      ctx.beginPath();
      for (const e of activeEdges) {
        ctx.moveTo(...edgeEndpoints[e]);
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    };

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Glow halo
    ctx.lineWidth = size * 0.12;
    ctx.globalAlpha = 0.25;
    drawSegments();

    // Bright centreline
    ctx.lineWidth = size * 0.045;
    ctx.globalAlpha = 0.9;
    drawSegments();

    ctx.restore();
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

  // Non-playable sealed corner — dark with fine hatching
  _drawBlocker(ctx, size) {
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, size, size);

    // Diagonal hatch lines to signal "out of bounds"
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(1, size * 0.025);
    const step = size * 0.22;
    ctx.beginPath();
    for (let i = -size; i < size * 2; i += step) {
      ctx.moveTo(i, 0);
      ctx.lineTo(i + size, size);
    }
    ctx.stroke();

    // Subtle inset border
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.strokeRect(size * 0.06, size * 0.06, size * 0.88, size * 0.88);
  }

  // Flyover tile drawn from scratch.
  // Uses the same renderPattern as every other tile for identical dash proportions.
  // Tunnel dashes are hidden at the crossing; bridge edges marked with white lines.
  _drawTunnelOverlay(ctx, size, rotation = 0, bgColor = '#ffffff') {
    const cx    = size / 2;
    const cy    = size / 2;
    const roadW = size * 0.34;
    const r     = roadW / 2;
    const ewUp  = (rotation % 2 === 1);

    // Flyover arms / tunnel arms (indices into renderPattern rotation)
    const [fa, fb, ta, tb] = ewUp ? [1, 3, 0, 2] : [0, 2, 1, 3];

    // Start fresh
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);

    // Both roads solid black
    ctx.fillStyle = '#000000';
    ctx.fillRect(cx - r, 0, roadW, size);
    ctx.fillRect(0, cy - r, size, roadW);

    // Draw tunnel road dashes at original proportions (same renderPattern as all tiles)
    renderPattern(ctx, size, this.patterns['street'], ta);
    renderPattern(ctx, size, this.patterns['street'], tb);

    // Cover crossing centre with black — hides tunnel dashes under the flyover
    ctx.fillStyle = '#000000';
    ctx.fillRect(cx - r, cy - r, roadW, roadW);

    // Draw flyover road dashes over the full road length
    renderPattern(ctx, size, this.patterns['street'], fa);
    renderPattern(ctx, size, this.patterns['street'], fb);

    // White lines at the bridge crossing edges to emphasise the bridge
    const lk = Math.max(2, size * 0.03);
    ctx.fillStyle = '#ffffff';
    if (ewUp) {
      // E-W flyover: horizontal lines at N and S of crossing
      ctx.fillRect(cx - r, cy - r - lk, roadW, lk);  // N edge
      ctx.fillRect(cx - r, cy + r,       roadW, lk);  // S edge
    } else {
      // N-S flyover: vertical lines at W and E of crossing
      ctx.fillRect(cx - r - lk, cy - r, lk, roadW);  // W edge
      ctx.fillRect(cx + r,       cy - r, lk, roadW);  // E edge
    }
  }

  // Player-owned private lane: coloured road surface + shoulder bollards, no centre line.
  // Rotates the canvas context 90° for E-W tiles so drawing is always done as N-S.
  _drawPrivateIndicator(ctx, size, tile, rotatedSides) {
    const cx    = size / 2;
    const color = tile?.backgroundColor || '#4488ff';
    const isEW  = rotatedSides?.[1] === 'street'; // east side is street → E-W orientation

    ctx.save();
    if (isEW) {
      ctx.translate(cx, cx);
      ctx.rotate(Math.PI / 2);
      ctx.translate(-cx, -cx);
    }

    const roadHW = size * 0.168;

    // Flood road interior with player colour
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(cx - roadHW + 1, 0, (roadHW - 1) * 2, size);

    // Erase centre dashes → single undivided lane
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.fillRect(cx - size * 0.025, 0, size * 0.05, size);

    // Bollard posts (black + white reflector cap) on each shoulder
    const bw   = Math.max(3, size * 0.055);
    const bh   = Math.max(7, size * 0.11);
    const capH = Math.max(2, bh * 0.28);
    const gap  = size / 4.5;
    const lx   = cx - roadHW + 1 + bw;
    const rx   = cx + roadHW - 1 - bw;

    for (let y = gap * 0.5; y < size; y += gap) {
      for (const bx of [lx, rx]) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(bx - bw / 2, y - bh / 2, bw, bh);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bx - bw / 2, y - bh / 2, bw, capH);
      }
    }

    ctx.restore();
  }

  validateTile(tile) {
    return Array.isArray(tile.sides) && tile.sides.length === 4 &&
      tile.sides.every(s => s === 'street' || s === 'non-street');
  }
}

export { StreetsTileSet };
