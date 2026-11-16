// The match: rounds, money and win conditions, as pure state. No three.js
// here — main.js owns the scene and calls into this. A match is first to
// five round wins (at most nine rounds). The player's team (Vanguard)
// attacks every round; Rogue defends.
//
// Phases: 'buy' (12 s, frozen, buy menu open) -> 'live' (100 s round timer)
// -> 'planted' (bomb fuse 35 s) -> 'over' (4 s banner) -> next round, or
// 'matchover' when a team reaches five.
export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const BOMB_SECONDS = 35;
export const OVER_SECONDS = 4;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const LOSS_STREAK_BONUS = 500;
export const LOSS_REWARD_MAX = 3400;
export const PLANT_REWARD = 300;

export function createMatch() {
  const match = {
    phase: 'buy',
    phaseT: BUY_SECONDS,
    round: 1,
    score: { attack: 0, defend: 0 },
    money: START_MONEY,
    lossStreak: 0,
    kills: 0,
    deaths: 0,
    lastReason: '',
    winner: null,
  };

  function startRound(round) {
    match.round = round;
    match.phase = 'buy';
    match.phaseT = BUY_SECONDS;
    match.lastReason = '';
  }

  function endRound(winner, reason) {
    match.score[winner] += 1;
    match.lastReason = reason;
    if (winner === 'attack') {
      match.money += WIN_REWARD;
      match.lossStreak = 0;
    } else {
      match.money += Math.min(LOSS_REWARD_MAX, LOSS_REWARD + match.lossStreak * LOSS_STREAK_BONUS);
      match.lossStreak += 1;
    }
    match.phase = 'over';
    match.phaseT = OVER_SECONDS;
    match.winner = winner;
    if (match.score.attack >= WIN_ROUNDS || match.score.defend >= WIN_ROUNDS || match.round >= MAX_ROUNDS) {
      match.phase = 'matchover';
      match.phaseT = OVER_SECONDS;
    }
  }

  // Advance the clock. `events` is what happened this tick; the match
  // answers with the round-end it causes, or null.
  function update(dt, events) {
    if (match.phase === 'matchover' || match.phase === 'over') {
      match.phaseT -= dt;
      if (match.phaseT <= 0) return { type: match.phase === 'over' ? 'overDone' : 'matchDone' };
      return null;
    }
    match.phaseT -= dt;
    if (match.phase === 'buy' && match.phaseT <= 0) {
      match.phase = 'live';
      match.phaseT = ROUND_SECONDS;
      return { type: 'live' };
    }
    if (match.phase === 'live' && events.bombPlanted) {
      match.phase = 'planted';
      match.phaseT = BOMB_SECONDS;
      return { type: 'planted' };
    }
    if (match.phase === 'live' && match.phaseT <= 0) {
      endRound('defend', 'Time expired — the bomb was never planted.');
      return { type: 'roundEnd', winner: 'defend', reason: match.lastReason };
    }
    if (match.phase === 'planted' && match.phaseT <= 0) {
      endRound('attack', 'The bomb detonated.');
      return { type: 'roundEnd', winner: 'attack', reason: match.lastReason };
    }
    if (events.defendersDead) {
      endRound('attack', 'Rogue team eliminated.');
      return { type: 'roundEnd', winner: 'attack', reason: match.lastReason };
    }
    // After the plant the round plays on until the bomb is defused or blows,
    // even with no attacker left standing.
    if (match.phase === 'live' && events.attackersDead) {
      endRound('defend', 'Vanguard team eliminated.');
      return { type: 'roundEnd', winner: 'defend', reason: match.lastReason };
    }
    if (match.phase === 'planted' && events.bombDefused) {
      endRound('defend', 'The bomb was defused.');
      return { type: 'roundEnd', winner: 'defend', reason: match.lastReason };
    }
    return null;
  }

  function nextRound() {
    if (match.score.attack >= WIN_ROUNDS || match.score.defend >= WIN_ROUNDS || match.round >= MAX_ROUNDS) {
      match.phase = 'matchover';
      match.phaseT = OVER_SECONDS;
      return false;
    }
    startRound(match.round + 1);
    return true;
  }

  function addKillReward() {
    match.money += KILL_REWARD;
    match.kills += 1;
  }

  function addPlantReward() {
    match.money += PLANT_REWARD;
  }

  function recordDeath() {
    match.deaths += 1;
  }

  function spend(amount) {
    if (match.money < amount) return false;
    match.money -= amount;
    return true;
  }

  return {
    state: match,
    startRound,
    endRound,
    update,
    nextRound,
    addKillReward,
    addPlantReward,
    recordDeath,
    spend,
    matchWinner() {
      if (match.score.attack > match.score.defend) return 'attack';
      if (match.score.defend > match.score.attack) return 'defend';
      return null;
    },
  };
}
