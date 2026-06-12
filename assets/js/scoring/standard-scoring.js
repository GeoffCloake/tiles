// assets/js/scoring/standard-scoring.js
// Adjacency-only scoring used by the Shapes tile set: edges connect when
// their colours match exactly, blank sides never score.
import { AdjacencyScoring } from './adjacency-scoring.js';

export class StandardScoring extends AdjacencyScoring {
    constructor() {
        super({
            name: 'Standard Scoring',
            description: 'Score based on number of matching edges'
        });
    }
}
