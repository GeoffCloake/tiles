// tile-sets/shapes-tileset.js
import { TileSet } from '../core/base-classes.js';
import { colors, designPatterns } from '../utils/game-utils.js';

export class ShapesTileSet extends TileSet {
    constructor() {
        super({
            name: 'Shapes',
            description: 'Geometric shapes with matching edges',
            options: {
                shapeCount: 6,
                enableBlankSides: false
            }
        });

        this.colors = colors;
        this.patterns = designPatterns;
    }

    generateTile() {
        let availableColors = Object.keys(this.colors)
            .filter(color => color !== 'Blank')
            .slice(0, this.options.shapeCount);

        // If blank sides are enabled, add 'Blank' as a possible side
        if (this.options.enableBlankSides) {
            availableColors = [...availableColors, 'Blank'];
        }

        // Generate sides with ~20% chance of blank when enabled
        return {
            id: Math.random().toString(36).substr(2, 9),
            sides: Array(4).fill(null).map(() => {
                if (this.options.enableBlankSides && Math.random() < 0.2) {
                    return 'Blank';
                }
                return availableColors[Math.floor(Math.random() * (availableColors.length - (this.options.enableBlankSides ? 1 : 0)))];
            })
        };
    }

    renderTile(tile, canvas, rotation = 0) {
        const ctx = canvas.getContext('2d');
        const size = canvas.width;

        // Clear canvas
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, size, size);

        // Draw starter tile indicator
        if (tile.isStarterTile) {
            ctx.fillStyle = '#555555';
            ctx.beginPath();
            ctx.arc(size/2, size/2, size * 0.39, 0, Math.PI * 2);
            ctx.fill();
        }

        // Rotate sides if needed
        const rotatedSides = [...tile.sides];
        for (let i = 0; i < rotation; i++) {
            rotatedSides.unshift(rotatedSides.pop());
        }

        // Draw each side
        rotatedSides.forEach((colorName, index) => {
            if (colorName === 'Blank') return;

            ctx.save();
            ctx.translate(size/2, size/2);
            ctx.rotate((Math.PI/2) * index);
            ctx.translate(-size/2, -size/2);

            const scale = size / 300;
            ctx.scale(scale, scale);

            ctx.fillStyle = this.colors[colorName];
            const pattern = this.patterns[colorName];
            ctx.beginPath();
            const path = new Path2D(pattern.path);
            ctx.fill(path);

            ctx.restore();
        });
    }

    validateTile(tile) {
        return tile.sides.every(side => 
            this.colors[side] !== undefined);
    }
}