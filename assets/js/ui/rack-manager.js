// assets/js/ui/rack-manager.js

export class RackManager {
    constructor(config) {
        this.rackElement = config.rackElement;
        this.rotateButton = config.rotateButton;
        this.showValidMovesButton = config.showValidMovesButton;
        this.onTileSelected = config.onTileSelected;
        
        this.gameState = null;
        this.showingValidMoves = false;
        
        this.setupEventListeners();
    }

    initialize(gameState) {
        this.gameState = gameState;
        this.updateRack(this.gameState.getCurrentPlayer().tiles);
    }

    setupEventListeners() {
        if (this.rotateButton) {
            this.rotateButton.onclick = () => this.handleRotate();
        }

        if (this.showValidMovesButton) {
            this.showValidMovesButton.onclick = () => this.toggleValidMoves();
        }
    }

    updateRack(tiles) {
        if (!this.rackElement) return;

        this.rackElement.innerHTML = '';
        this._updateTileInfo(null);
        tiles.forEach(tile => {
            const tileDiv = document.createElement("div");
            tileDiv.classList.add("tile");

            const canvas = document.createElement("canvas");
            canvas.width = 60;
            canvas.height = 60;
            this.gameState.tileSet.renderTile(tile, canvas);

            tileDiv.appendChild(canvas);
            tileDiv.dataset.tileId = tile.id;
            tileDiv.title = 'Click to select · Double-click to rotate';
            if (tile.isSpecialStart) {
                tileDiv.classList.add('rack-special-tile');
                tileDiv.title = 'Starter tile · plays once, not replenished';
            }
            tileDiv.addEventListener('mouseenter', () => this._updateTileInfo(tile));
            tileDiv.addEventListener('mouseleave', () => this._updateTileInfo(this.gameState?.selectedTile || null));
            tileDiv.onclick = () => {
                if (!tileDiv.classList.contains('selected')) {
                    this.selectTile(tile, tileDiv);
                }
            };
            tileDiv.ondblclick = () => {
                if (!tileDiv.classList.contains('selected')) this.selectTile(tile, tileDiv);
                this.handleRotate();
            };

            this.rackElement.appendChild(tileDiv);
        });
    }

    selectTile(tile, tileDiv) {
        const selectedDiv = document.querySelector('.rack .tile.selected');
        if (selectedDiv) selectedDiv.classList.remove('selected');
        tileDiv.classList.add('selected');
        this._updateTileInfo(tile);
        if (this.onTileSelected) this.onTileSelected(tile);
        if (this.showingValidMoves) this.showValidMoves();
    }

    getTileDescription(tile) {
        if (!tile) return '';
        const keyNames = {
            cross:      'Intersection — roads in all 4 directions',
            tJunction:  'T-Junction — 3-way road',
            straight:   'Straight Road — connects opposite sides',
            corner:     'Corner Road — bends between adjacent sides',
            deadEnd:    'Dead End — one road exit only',
            blank:      'Blank — no road connections',
            tunnel:     'Flyover — two roads cross without joining',
            roadblock:  'Road Block — costs points to play',
            private:    'Private Road — only your colour can connect',
        };
        const parts = [keyNames[tile.key] || (tile.type ? tile.type : 'Tile')];
        if (tile.centerPattern === 'circles')     parts.push('Bonus Circle: extra pts when placed');
        if (tile.centerPattern === 'squares')     parts.push('Centre Square: high bonus when placed');
        if (tile.centerPattern === 'speedCamera') parts.push('Speed Camera: halves placement score');
        if (tile.isSpecialStart) parts.push('Starter tile — plays once, not replenished');
        return parts.join('\n');
    }

    _updateTileInfo(tile) {
        const el = document.getElementById('tile-info');
        if (!el) return;
        if (!tile) { el.style.display = 'none'; return; }
        el.textContent = this.getTileDescription(tile);
        el.style.display = 'block';
    }

    handleRotate() {
        if (!this.gameState.selectedTile) return;

        const rotation = this.gameState.rotateTile();
        if (rotation !== null) {
            this.updateTileRotation(rotation);
            
            // Auto-update valid moves if they're being shown
            if (this.showingValidMoves) {
                this.showValidMoves();
            }
        }
    }

    updateTileRotation(rotation) {
        const selectedDiv = document.querySelector('.rack .tile.selected');
        if (selectedDiv && this.gameState.selectedTile) {
            const canvas = selectedDiv.querySelector('canvas');
            if (canvas) {
                // Clear canvas first
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                // Render rotated tile
                this.gameState.tileSet.renderTile(
                    this.gameState.selectedTile, 
                    canvas, 
                    rotation
                );
                
                // Add visual indicator of rotation
                this.showRotationIndicator(canvas, rotation);
            }
        }
    }

    showRotationIndicator(canvas, rotation) {
        const ctx = canvas.getContext('2d');
        const size = canvas.width;
        const padding = size * 0.1;
        
        ctx.save();
        ctx.translate(size/2, size/2);
        ctx.rotate((Math.PI/2) * rotation);
        
        // Draw rotation indicator
        ctx.beginPath();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.moveTo(-padding, -padding);
        ctx.lineTo(-padding/2, -padding);
        ctx.lineTo(-padding/2, -padding*1.5);
        ctx.stroke();
        
        ctx.restore();
    }

    toggleValidMoves() {
        this.showingValidMoves = !this.showingValidMoves;
        if (this.showValidMovesButton) {
            this.showValidMovesButton.classList.toggle('active');
        }

        if (this.showingValidMoves && this.gameState.selectedTile) {
            this.showValidMoves();
        } else {
            this.clearValidMoves();
        }
    }

    showValidMoves() {
        if (!this.gameState.selectedTile) return;
        
        // Get valid moves considering current rotation
        const validMoves = this.gameState.getValidMoves(this.gameState.selectedTile);
        
        // Clear previous highlights
        this.clearValidMoves();
        
        // Highlight valid moves on board
        const boardCells = document.querySelectorAll('.board .tile');
        validMoves.forEach(({x, y}) => {
            const index = y * this.gameState.boardSize + x;
            const cell = boardCells[index];
            if (cell) {
                cell.classList.add('valid-placement');
                
                // Add preview of rotated tile
                this.showTilePreview(cell, x, y);
            }
        });
    }

    showTilePreview(cell, x, y) {
        // Remove any existing preview handlers
        const clone = cell.cloneNode(true);
        cell.parentNode.replaceChild(clone, cell);
        
        // Add new preview handlers
        clone.addEventListener('mouseenter', () => {
            if (!this.gameState.selectedTile) return;
            
            const previewCanvas = document.createElement('canvas');
            previewCanvas.classList.add('tile-preview');
            previewCanvas.width = clone.clientWidth;
            previewCanvas.height = clone.clientHeight;
            
            // Render preview with current rotation
            this.gameState.tileSet.renderTile(
                this.gameState.selectedTile,
                previewCanvas,
                this.gameState.currentRotation
            );
            
            // Add semi-transparent overlay
            const ctx = previewCanvas.getContext('2d');
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
            
            clone.appendChild(previewCanvas);
        });
        
        clone.addEventListener('mouseleave', () => {
            const preview = clone.querySelector('.tile-preview');
            if (preview) {
                preview.remove();
            }
        });

        // Preserve the original click handler
        clone.onclick = () => {
            if (this.gameState.selectedTile) {
                this.gameState.placeTile({x, y});
            }
        };
    }

    clearValidMoves() {
        document.querySelectorAll('.board .tile').forEach(cell => {
            cell.classList.remove('valid-placement');
            const preview = cell.querySelector('.tile-preview');
            if (preview) {
                preview.remove();
            }
        });
    }

    updateSelectedTile(tile) {
        // Update visual selection in rack
        const tiles = this.rackElement.querySelectorAll('.tile');
        tiles.forEach(tileDiv => {
            if (tileDiv.dataset.tileId === tile.id) {
                tileDiv.classList.add('selected');
            } else {
                tileDiv.classList.remove('selected');
            }
        });
    }

    // Helper method to find tile element by ID
    getTileElement(tileId) {
        return this.rackElement.querySelector(`[data-tile-id="${tileId}"]`);
    }
}