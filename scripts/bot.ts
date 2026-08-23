// Headless greedy bot — milestone 1 stub.
//
// Plays a level mathematically: at every gate pair it picks whichever
// operator yields the bigger crowd, and it assumes perfect steering (it
// dodges every enemy clump). Milestone 4 grows this into a win-rate report
// across all generated levels for tuning the generator.
//
// Run with: npm run bot   (or: npx tsx scripts/bot.ts)

import { getLevel } from '../src/game/levels';
import { applyOp, opLabel } from '../src/game/ops';

function playGreedy(levelNumber: number): void {
  const level = getLevel(levelNumber);
  let count = level.startCount;
  console.log(`level ${levelNumber} — start ${count}, boss ${level.boss.count}`);
  for (const pair of level.gatePairs) {
    const left = applyOp(count, pair.left);
    const right = applyOp(count, pair.right);
    const pickLeft = left >= right;
    const picked = pickLeft ? pair.left : pair.right;
    count = pickLeft ? left : right;
    console.log(
      `  z=${pair.z}  [${opLabel(pair.left)} | ${opLabel(pair.right)}] → ${opLabel(picked)} → ${count}`
    );
  }
  const won = count > level.boss.count;
  console.log(`  boss ${level.boss.count} vs crowd ${count} → ${won ? 'WIN' : 'LOSE'}`);
}

playGreedy(1);
