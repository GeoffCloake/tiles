// core/game-registry.js
export class GameRegistry {
    constructor() {
        this.tileSets = new Map();
        this.rulesets = new Map();
        this.scoringSystems = new Map();
        this.tileSetScoringMap = new Map(); // Maps tilesets to their scoring systems
    }

    registerTileSet(name, tileSet) {
        this.tileSets.set(name, tileSet);
    }

    registerRuleset(name, ruleset) {
        this.rulesets.set(name, ruleset);
    }

    registerScoringSystem(name, scoringSystem, forTileSet = null) {
        this.scoringSystems.set(name, scoringSystem);
        
        // If this scoring system is specific to a tileset, map it
        if (forTileSet) {
            this.tileSetScoringMap.set(forTileSet, name);
        }
    }

    getTileSet(name) {
        return this.tileSets.get(name);
    }

    getRuleset(name) {
        return this.rulesets.get(name);
    }

    getScoringSystem(name) {
        return this.scoringSystems.get(name);
    }

    // Get appropriate scoring system for a tileset
    getScoringSystemForTileSet(tileSetName) {
        const specificScoring = this.tileSetScoringMap.get(tileSetName);
        if (specificScoring) {
            return this.scoringSystems.get(specificScoring);
        }
        // Fall back to standard scoring if no specific scoring system is registered
        return this.scoringSystems.get('standard');
    }
}