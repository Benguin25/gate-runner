// All gameplay tunables live here. No magic numbers in gameplay code.

export const CONFIG = {
  engine: {
    // Fixed 60hz simulation step; render interpolates between steps.
    fixedStep: 1 / 60,
    // Cap catch-up steps after a long frame so we never spiral.
    maxStepsPerFrame: 5,
    maxFrameDeltaSec: 0.1,
  },

  lane: {
    // Half-width of the lane at the crowd row / at the horizon, as a fraction of screen width.
    bottomHalfWidthFrac: 0.42,
    topHalfWidthFrac: 0.14,
    // Screen-y anchors as fractions of screen height.
    horizonYFrac: 0.16,
    crowdYFrac: 0.78,
    // Depth constant for the fake-perspective mapping p = dz / (dz + depth).
    perspectiveDepth: 14,
    // Stop drawing objects closer to the horizon than this projected fraction.
    cullFar: 0.96,
    // Stop drawing objects this far behind the crowd (world units).
    cullBehind: -4,
    // Sprite scale at the horizon (1 at the crowd row).
    minScale: 0.3,
    // Distance between the moving cross-lane stripes (world units).
    stripeSpacing: 6,
    stripeAlpha: 0.16,
  },

  run: {
    // Crowd auto-run speed, world units per second.
    speed: 7,
    // Drag sensitivity: normalized lane-x per (lane half-width) of finger travel.
    steerSensitivity: 1.7,
    // How fast the crowd centre chases the steering target (1/sec).
    steerLerp: 12,
    // Crowd centre may not leave this normalized band, so the blob stays on the lane.
    maxCrowdX: 0.8,
  },

  crowd: {
    startCount: 10,
    // Never render more than this many units; beyond it the blob scales up
    // and the count label carries the information.
    renderCap: 300,
    unitRadiusPx: 7,
    headRadiusFrac: 0.55,
    // Phyllotaxis slot spacing (px at scale 1).
    slotSpacingPx: 10.5,
    // Blob is flattened vertically to match the fake perspective.
    ellipseFlatten: 0.55,
    // How fast rendered units chase their formation slots (1/sec).
    slotLerp: 10,
    bobAmplitudePx: 1.6,
    bobFrequency: 9,
    labelFontSize: 42,
    labelGapPx: 22,
  },

  gates: {
    // Wall visuals.
    heightPx: 62,
    cornerRadiusPx: 10,
    opacity: 0.7,
    passedOpacity: 0.28,
    textFontSize: 30,
    // Chosen gate flashes for this long after being hit.
    hitFlashSec: 0.4,
  },

  enemies: {
    unitRadiusPx: 6,
    slotSpacingPx: 9,
    renderCap: 40,
    // Crowd centre must be within this normalized-x distance of the clump
    // centre when crossing its row to make contact.
    hitWindowX: 0.38,
    labelFontSize: 20,
  },

  boss: {
    // Boss fight starts when the crowd gets this close (world units).
    contactDistance: 2.5,
    bodyRadiusPx: 30,
    headRadiusFrac: 0.6,
    numberFontSize: 34,
    numberGapPx: 18,
    // Losing crowds drain at this many units per second.
    drainPerSec: 25,
    // Duration of the boss knockback tumble before the win overlay.
    knockbackSec: 0.9,
  },

  levels: {
    // Levels 1..loopCount are distinct; beyond that layouts loop with
    // bosses growing endlessBossGrowth^cycle.
    loopCount: 30,
    endlessBossGrowth: 1.3,
    // Seeds are levelNumber + seedOffset so re-tuning can reroll every layout.
    // 777 chosen by sweeping offsets for the smoothest bot win-rate curve.
    seedOffset: 777,
    // Level shape: pair count and duration both ramp with level.
    pairsMin: 4,
    pairsMax: 6,
    durationMinSec: 8,
    durationMaxSec: 12,
    // World-z of the first gate and the empty stretch before the boss.
    firstGateZ: 12,
    lastGateGapZ: 16,
    // Enemy clumps keep this much z clearance from gates so dodges are fair.
    enemyGateGapZ: 5,
    // Gate z positions jitter by up to this fraction of the gate spacing.
    gateZJitterFrac: 0.18,

    // Pair types. Traps (two teal gates where the "bigger-looking" one can be
    // wrong) appear from trapStartLevel; near-even split pairs from
    // splitStartLevel. Chances lerp from 0 at the start level to *ChanceMax
    // at loopCount.
    trapStartLevel: 10,
    trapChanceMax: 0.6,
    // Exponent < 1 makes the trap chance climb quickly after trapStartLevel
    // instead of only mattering near level 30.
    trapRampExponent: 0.6,
    splitStartLevel: 20,
    splitChanceMax: 0.4,

    // Operator value ranges as fractions of the current greedy-optimal count.
    // Good-gate growth ramps up with level so early bosses stay small
    // (spec: level 1 boss ≈ 20) while late optimal counts get big.
    addFracMin: 0.35,
    addFracMaxL1: 0.6,
    addFracMaxL30: 0.85,
    subFracMin: 0.2,
    subFracMax: 0.55,
    // Chance an obvious pair's good gate is a multiplier instead of an add.
    obviousMulChanceL1: 0.1,
    obviousMulChanceL30: 0.4,
    // Multiplier used for plain good gates and traps.
    mulValue: 2,
    // Softer multiplier for near-even split pairs (spec: "x1.5").
    splitMulValue: 1.5,
    divValue: 2,
    // Trap adds sit at this ratio band around the break-even value c*(mul-1):
    // below 1 the multiplier really is better, above 1 the add is better.
    trapRatioMin: 0.72,
    trapRatioMax: 1.45,
    // Split pair adds sit this close to break-even with the split multiplier.
    splitRatioMin: 0.92,
    splitRatioMax: 1.08,

    // Enemy clumps per level (ramps), each costing a fraction of the crowd
    // that would reach its row on the greedy-optimal line.
    enemyClumpsMin: 2,
    enemyClumpsMax: 4,
    enemyCountFracMin: 0.1,
    enemyCountFracMax: 0.16,
    enemyMinCount: 2,
    enemyMaxX: 0.6,

    // Boss number: the generator runs deterministic Monte-Carlo playouts of a
    // typical-player model over the finished layout and places the boss at
    // the target lose-rate quantile of the final-count distribution. That
    // bakes the difficulty curve directly into each layout regardless of its
    // trap/enemy mix. Target lose rate ramps linearly L1 -> L30.
    playoutCount: 256,
    // Typical-player model: gate outcomes are judged with log-normal noise of
    // this sigma, multipliers look typicalMulBias bigger than they are, and
    // typicalBlunderChance of picks go to the wrong side outright. Enemy
    // clumps are missed-reaction hits: with typicalDodgeFailChance the player
    // fails to react, and the clump connects only if their current path
    // actually runs through it.
    typicalSigma: 0.22,
    typicalMulBias: 1.06,
    typicalBlunderChance: 0.012,
    typicalDodgeFailChance: 0.15,
    // Normalized-x a player runs at inside their chosen gate half.
    typicalAimX: 0.45,
    targetLoseRateL1: 0.02,
    targetLoseRateL30: 0.4,
    // Exponent > 1 keeps mid-level lose targets modest (tight layouts can't
    // reach high lose rates anyway) and saves the squeeze for the end.
    targetLoseRateExponent: 1.4,
    bossMin: 5,
  },

  economy: {
    // Coins on clear = boss/2 plus a bonus per overkill unit, all scaled by
    // the income upgrade.
    coinsPerBossFrac: 0.5,
    overkillCoinFrac: 0.25,
    // Upgrade cost curves: cost(tier) = base * growth^tier (tier owned so far).
    upgrades: {
      startCrowd: { baseCost: 100, costGrowth: 1.3, bonusPerTier: 1 },
      income: { baseCost: 150, costGrowth: 1.35, bonusPerTier: 0.1 },
      strength: { baseCost: 300, costGrowth: 1.4, factorPerTier: 1.1 },
    },
  },

  colors: {
    bg: '#0F172A',
    lane: '#64748B',
    laneEdge: '#94A3B8',
    stripe: '#F1F5F9',
    crowd: '#3B82F6',
    crowdHead: '#93C5FD',
    goodGate: '#14B8A6',
    badGate: '#EF4444',
    gateText: '#FFFFFF',
    enemy: '#EF4444',
    enemyHead: '#FCA5A5',
    boss: '#DC2626',
    bossCrown: '#FBBF24',
    label: '#FFFFFF',
    labelShadow: '#0F172A',
  },
} as const;
