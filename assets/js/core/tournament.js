// assets/js/core/tournament.js
const LEADERBOARD_KEY = 'tiles_leaderboard_v1';

export class TournamentManager {
  constructor({ players, rounds }) {
    this.standings = players.map(p => ({ name: p.name, total: 0, rounds: [] }));
    this.totalRounds = rounds;
    this.currentRound = 0;
  }

  startRound() {
    this.currentRound++;
  }

  recordResult(finalScores) {
    finalScores.forEach(s => {
      const entry = this.standings.find(p => p.name === s.name);
      if (entry) {
        entry.total += s.score;
        entry.rounds.push(s.score);
      }
    });
  }

  getSortedStandings() {
    return [...this.standings].sort((a, b) => b.total - a.total);
  }

  isComplete() {
    return this.currentRound >= this.totalRounds;
  }

  saveToLeaderboard() {
    const winner = this.getSortedStandings()[0];
    if (!winner) return;
    const board = TournamentManager.getLeaderboard();
    board.push({
      date: new Date().toLocaleDateString(),
      winner: winner.name,
      score: winner.total,
      rounds: this.totalRounds,
      players: this.standings.length
    });
    board.sort((a, b) => b.score - a.score);
    try {
      localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(board.slice(0, 20)));
    } catch { /* storage unavailable */ }
  }

  static getLeaderboard() {
    try { return JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]'); }
    catch { return []; }
  }

  static clearLeaderboard() {
    try { localStorage.removeItem(LEADERBOARD_KEY); } catch { /* ignore */ }
  }
}
