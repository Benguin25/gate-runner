# GATE RUNNER — Design Spec

## Concept

Auto-running crowd on a straight lane. Gates come in pairs, left or right. Each gate has an operator (+N, xN, -N, ÷N). Drag to steer the crowd through the better gate. Red enemy clumps on the lane cost one unit per enemy. At the end of the lane the crowd crashes into a boss with a number over its head. Bigger crowd wins. 30 generated levels then endless, gates get sneakier (e.g. x2 vs +50 when you have 10 units).

Visual reference: Count Masters / Top War ads. Blue crowd, teal good gates, red bad gates, red enemies, boss at the end.

## Core loop

- Portrait, fixed camera looking down a lane from slightly behind the crowd. Fake perspective: lane narrows toward the top, sprites scale with y.
- Crowd auto-runs up the lane at constant speed. Player drags left/right to move the crowd centre across the lane width. No other input.
- Crowd rendered as N small circular units in a blob (sunflower/phyllotaxis layout so it looks organic). Cap rendering at 300 sprites; above that, scale the blob and rely on the count label.
- Count label floats above the crowd at all times, big and bold.
- Gate pairs span the lane every ~3 seconds. Each gate is a translucent coloured wall with its operator text. Teal = good (+, x), red = bad (-, ÷). Touching a gate applies the operator, number flashes, pop sound. You must pass through exactly one of the pair.
- Red enemy units stand in clumps on the lane; contact removes one of yours per one of theirs.
- Lane ends at a BOSS with a number over its head. Crowd charges. If count > boss number, boss is knocked back in a big tumble, level clears. Otherwise you lose units until 0 and see "Try again".

## Level generation

- Deterministic from level seed so levels are stable. /src/game/levels.ts.
- 30 levels, then endless: loop with +30% boss numbers per cycle.
- Difficulty ramp: level 1 boss = 20, gates obviously better-or-worse. From ~level 10 introduce trap comparisons (x2 vs +40 when crowd is ~30). From ~level 20 add split gates (left half +10, right half x1.5).
- Each level: 4 to 6 gate pairs, 8 to 12 seconds long.
- No moving gates.

## Economy and meta

- Coins per level = boss number / 2 plus bonus for overkill.
- Upgrade shop between levels, 3 upgrades:
  1. Starting crowd: +1 per tier, cost 100 * 1.3^n
  2. Income: +10% coins per tier, cost 150 * 1.35^n
  3. Unit strength: each unit counts 1.1x against boss per tier, cost 300 * 1.4^n
- Upgrades persist so failed levels still feel like progress.

## Monetization (milestone 7, not yet)

- Rewarded: "Revive with +50 units" on loss (once per attempt). "3x coins" on level clear. "Start with 20 units" before a level.
- Interstitial: after every 3rd level clear, 90s cooldown, never in first 3 minutes of a fresh install, never if remove_ads.
- IAP: remove_ads $2.99.

## Juice

- Gate pass: number flashes, units spring in from crowd centre, confetti of small squares in gate colour, medium haptic.
- Bad gate: units pop out with a deflate sound, red flash.
- Boss hit: slow-mo 0.3x for 0.4s, screen shake 6px, boss tumbles off.
- Win: units do a small staggered jump (15ms apart), coins fountain.
- Lose: units fall over in waves.
- Crowd blob squishes narrower when steering fast.

## Screens

- Home: level number, play, shop, settings.
- Game.
- Level clear: coins earned, (3x ad button later), next.
- Level fail: (revive ad button later), retry.
- Shop: three upgrade cards.

## Assets

- All procedural Skia. Units: circle body + smaller circle head, 2-frame bob. Gates: rounded rects at 70% opacity with bold text. Boss: bigger unit with a crown. Palette: crowd #3B82F6, good gate #14B8A6, bad gate #EF4444, enemies #EF4444, lane grey.
- Audio synthesized offline and committed, under 400KB total.

## Tech

- Crowd: integer count is truth. Rendered units purely visual, interpolate to formation slots.
- Fixed 60hz update, interpolated render, via GameCanvas.
- GameCanvas: full-screen Skia Canvas driven by Reanimated useFrameCallback, delta time, fixed-timestep update separated from render, pause flag. Exposes onUpdate(dt) and onRender.
- Persist: level, coins, upgrades, settings (AsyncStorage for now, MMKV later).

## Testing

- /scripts/bot.ts: headless greedy bot that plays every level picking the "bigger-looking" gate. Prints win rate per level. Target: ~95% win at L1 falling to ~60% by L30. Use it to tune the generator.

## Acceptance

- Level 1 from cold start in under 10 seconds.
- 60fps on a mid-range Android with 300 rendered units.
- tsc clean.

## Build order (one per Claude Code session)

1. Scaffold + GameCanvas + bouncing circle + bot stub
2. Lane + crowd blob + drag steering + one gate pair
3. Operators + enemies + boss
4. Level generator + 30 levels + endless, bot prints curve
5. Shop + persistence
6. Juice
7. Ads + IAP + iOS (separate instructions later)