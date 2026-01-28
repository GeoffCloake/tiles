// assets/js/utils/canvas-utils.js

/**
 * Sets the size of a canvas element
 * @param {HTMLCanvasElement} canvas - The canvas element
 * @param {number} size - The size to set for both width and height
 */
export const setCanvasSize = (canvas, size) => {
    canvas.width = size;
    canvas.height = size;
};

/**
 * Renders a pattern on a canvas context with optional rotation
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {number} size - The size of the canvas
 * @param {Object} pattern - The pattern to render
 * @param {number} rotation - Rotation in units of 90 degrees
 */
export const renderPattern = (ctx, size, pattern, rotation = 0) => {
    ctx.save();
    
    // Center and rotate
    ctx.translate(size/2, size/2);
    ctx.rotate(rotation * Math.PI/2);
    ctx.translate(-size/2, -size/2);
    
    // Scale to fit canvas
    const scale = size / 300;
    ctx.scale(scale, scale);
    
    // Draw elements
    pattern.elements.forEach(element => {
        ctx.beginPath();
        
        switch(element.type) {
            case 'polygon':
                const points = element.points.split(' ')
                    .map(point => point.split(',')
                    .map(coord => parseFloat(coord)));
                ctx.moveTo(...points[0]);
                points.slice(1).forEach(point => ctx.lineTo(...point));
                break;
                
            case 'rect':
                ctx.rect(element.x, element.y, element.width, element.height);
                break;
                
            case 'circle':
                ctx.arc(element.cx, element.cy, element.r, 0, Math.PI * 2);
                break;
        }
        
        if (element.fill) {
            ctx.fillStyle = element.fill;
            ctx.fill();
        }
        
        if (element.stroke) {
            ctx.strokeStyle = element.stroke;
            ctx.lineWidth = element.strokeWidth || 1;
            ctx.stroke();
        }
    });
    
    ctx.restore();
};

/**
 * Creates a score popup element and adds it to a cell
 * @param {HTMLElement} cell - The cell element to add the popup to
 * @param {number} score - The score to display
 */
export const createScorePopup = (cell, score) => {
    const scorePopup = document.createElement('div');
    scorePopup.className = 'score-popup';
    scorePopup.textContent = `+${score}`;
    cell.appendChild(scorePopup);
    setTimeout(() => scorePopup.remove(), 1000);
};