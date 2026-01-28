// First, add this HTML snippet after the tile-set selector in index.html
const scoringOptionsHtml = `
<div class="setup-option scoring-options" id="scoring-options">
    <h3>Scoring Options</h3>
    <div class="option-group">
        <label>
            <input type="checkbox" id="enable-center-bonus" checked>
            Enable Center Bonus (+5 points)
        </label>
    </div>
    <div class="option-group">
        <label>
            <input type="checkbox" id="enable-intersection-bonus" checked>
            Enable Intersection Bonus (+5 points)
        </label>
    </div>
</div>`;

// Update the SetupManager class to handle these new options
export class SetupManager {
    constructor(config) {
        // ... existing constructor code ...
        
        // Add new properties for scoring options
        this.centerBonusCheckbox = null;
        this.intersectionBonusCheckbox = null;
        
        this.initializeScoringOptions();
    }

    initializeScoringOptions() {
        // Insert scoring options HTML
        const tileSetSelect = document.getElementById('tile-set');
        if (tileSetSelect) {
            const container = document.createElement('div');
            container.innerHTML = scoringOptionsHtml;
            tileSetSelect.parentNode.insertBefore(container, tileSetSelect.nextSibling);
            
            // Get references to new checkboxes
            this.centerBonusCheckbox = document.getElementById('enable-center-bonus');
            this.intersectionBonusCheckbox = document.getElementById('enable-intersection-bonus');
            
            // Add event listener to show/hide scoring options based on tile set
            this.tileSetSelect.addEventListener('change', () => {
                this.toggleScoringOptions();
            });
        }
    }

    toggleScoringOptions() {
        const scoringOptions = document.getElementById('scoring-options');
        if (scoringOptions) {
            scoringOptions.style.display = 
                this.tileSetSelect.value === 'streets' ? 'block' : 'none';
        }
    }

    startGame() {
        const config = {
            // ... existing config ...
            scoringOptions: {
                enableCenterBonus: this.centerBonusCheckbox?.checked ?? true,
                enableIntersectionBonus: this.intersectionBonusCheckbox?.checked ?? true
            }
        };

        // Hide setup screen, show game screen
        if (this.setupScreen) this.setupScreen.style.display = 'none';
        if (this.gameScreen) this.gameScreen.style.display = 'flex';

        // Call onGameStart callback with config
        if (this.onGameStart) {
            this.onGameStart(config);
        }
    }
}

// Update main.js to handle the new scoring options
class Game {
    startGame(config) {
        // ... existing code ...

        // Configure scoring system based on options
        if (config.scoringOptions) {
            scoringSystem.options = {
                ...scoringSystem.options,
                centerBonus: config.scoringOptions.enableCenterBonus ? 5 : 0,
                intersectionBonus: config.scoringOptions.enableIntersectionBonus ? 5 : 0
            };
        }

        // ... rest of existing code ...
    }
}