// assets/js/utils/game-utils.js

// Game configuration constants
export const DEFAULT_BOARD_SIZE = 9;
export const DEFAULT_RACK_SIZE = 5;

/**
 * Rotates an array the specified number of times
 * @param {Array} arr - The array to rotate
 * @param {number} times - Number of rotations
 * @returns {Array} The rotated array
 */
export const rotateArray = (arr, times) => {
    const result = [...arr];
    for (let i = 0; i < times; i++) {
        result.unshift(result.pop());
    }
    return result;
};

// Design patterns for tile sides
export const designPatterns = {
    Blank: {
        type: 'blank',
        path: ''
    },
    Purple: {
        type: 'triangle',
        path: 'M34.2,0 L89.4,0 L89,0.3 L150,61.3 L211,0.3 L210.6,0 L265.8,0 L150,115.8 Z'
    },
    Green: {
        type: 'rectangle',
        path: 'M68.1,0 L105.5,0 L105.5,44.5 L194,44.5 L194,0 L231.8,0 L231.8,81.8 L68.1,81.8 Z'
    },
    Blue: {
        type: 'arrow',
        path: 'M56.7,0 L94.8,0 L94.8,31.8 L122.4,47.7 L150,63.6 L177.6,47.7 L205.2,31.8 L205.2,0 L243.3,0 L243.3,53.9 L196.6,80.8 L150,107.7 L103.4,80.8 L56.7,53.9 Z'
    },
    Red: {
        type: 'arc',
        path: 'M243.2,0 C243.2,51.5 201.5,93.2 150,93.2 S56.8,51.5 56.8,0 H95.6 C95.6,30 120,54.4 150,54.4 S204.4,30 204.4,0 H243.2 Z'
    },
    Cyan: {
        type: 'arc2',
        path: 'M71.1,0 H228.9 C228.9,43.5 193.7,78.8 150,78.8 S71.1,43.5 71.1,0 Z'
    },
    Orange: {
        type: 'triangle2',
        path: 'M52.1,0 L247.9,0 L247.9,0 L150,97.9 L52.1,0 Z'
    },
    Pink: {
        type: 'arrow2',
        path: 'M71,0 L229,0 L229,45.6 L189.4,68.3 L150,91.1 L110.6,68.3 L71,45.6 Z'
    },
    Yellow: {
        type: 'rectangle2',
        path: 'M80.8,0 L219.2,0 L219.2,69.2 L80.8,69.2 Z'
    }
};

// Color definitions matching CSS variables
export const colors = {
    Blank: '#333333',
    Purple: '#a200ff',
    Blue: '#008bda',
    Green: '#1f9100',
    Red: '#df0000',
    Cyan: '#00b0c0',
    Orange: '#ff9018',
    Pink: '#ff64ee',
    Yellow: '#ffde00'
};

export const colorNames = Object.keys(colors).filter(color => color !== 'Blank');

/**
 * Updates the active shapes configuration
 * @param {number} count - Number of shapes to use
 * @returns {Array} Array of active color names
 */
export const updateActiveShapes = (count) => {
    return colorNames.slice(0, count);
};

/**
 * Shuffles an array in place
 * @param {Array} array - The array to shuffle
 * @returns {Array} The shuffled array
 */
export const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

/**
 * Generates a unique ID
 * @returns {string} A unique identifier
 */
export const generateId = () => {
    return Math.random().toString(36).substr(2, 9);
};