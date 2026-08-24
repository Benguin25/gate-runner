// All gameplay tunables live here. No magic numbers in gameplay code.

export const CONFIG = {
  engine: {
    // Fixed 60hz simulation step; render interpolates between steps.
    fixedStep: 1 / 60,
    // Cap catch-up steps after a long frame so we never spiral.
    maxStepsPerFrame: 5,
    maxFrameDeltaSec: 0.1,
    // Juice events queued by the sim are dropped past this many per step, so
    // headless callers that never drain them (bot, playouts) stay bounded.
    maxQueuedEvents: 16,
  },

  lane: {
    // Half-width of the lane at the crowd row / at the horizon, as a fraction
    // of screen width. Camera sits low and close: the lane fills most of the
    // screen width and the flock dominates the frame.
    bottomHalfWidthFrac: 0.47,
    topHalfWidthFrac: 0.2,
    // Screen-y anchors as fractions of screen height.
    horizonYFrac: 0.24,
    crowdYFrac: 0.8,
    // Depth constant for the fake-perspective mapping p = dz / (dz + depth).
    // Smaller = closer camera: far objects (the boss) stay bigger on screen.
    perspectiveDepth: 11,
    // Stop drawing objects closer to the horizon than this projected fraction.
    cullFar: 0.96,
    // Stop drawing objects this far behind the crowd (world units).
    cullBehind: -4,
    // Sprite scale at the horizon (1 at the crowd row).
    minScale: 0.38,
    // Distance between the moving cross-lane stripes (world units).
    stripeSpacing: 6,
    stripeAlpha: 0.16,
  },

  audio: {
    // Every gate-pass quack retriggers at a random playback rate in
    // 1 ± this fraction (pitch shifts with rate), so quacks never sound stamped.
    quackPitchJitter: 0.1,
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
    // and the count label carries the information. Kept low so each duckling
    // is big enough to read as an individual (Count Masters style).
    renderCap: 80,
    unitRadiusPx: 9.5,
    headRadiusFrac: 0.58,
    // Phyllotaxis slot spacing (px at scale 1). Loose, so ducklings separate.
    slotSpacingPx: 17,
    // Each slot is nudged by a stable per-index offset of up to this fraction
    // of the spacing in x and y, so the flock reads organic, never as rows.
    slotJitterFrac: 0.3,
    // Blob is flattened vertically to match the fake perspective.
    ellipseFlatten: 0.55,
    // How fast rendered units chase their formation slots (1/sec).
    slotLerp: 10,
    // Ducklings do a 2-frame waddle: the bob snaps between two poses at this
    // rate (frames/sec) with a small sideways rock on alternate frames.
    bobAmplitudePx: 2.2,
    bobFrequency: 9,
    waddleFramesPerSec: 7,
    waddleRockPx: 1.6,
    // Beak: orange triangle on the head, pointing up the lane.
    beakHalfWidthFrac: 0.5,
    beakLengthFrac: 0.9,
    // Each duckling leans a random amount so the flock never looks stamped.
    tiltMaxRad: 0.3,
    // Two black eyes on the upper sides of the head (fracs of head radius).
    eyeRadiusFrac: 0.2,
    eyeOutFrac: 0.48,
    eyeUpFrac: 0.3,
    // A few ducklings lag behind their slot for an organic flock shape.
    trailChance: 0.15,
    trailMaxPx: 8,
    // Mama duck leads the flock: bigger, white, this far ahead of the blob edge.
    mamaScale: 1.6,
    mamaGapPx: 8,
    // Mama's eyes are enlarged past the duckling fraction so her face reads
    // at her bigger scale.
    mamaEyeScale: 1.35,
    // Mama's stern brow: line endpoints and thickness as fracs of head radius.
    browInFrac: 0.14,
    browOutFrac: 0.78,
    browInUpFrac: 0.48,
    browOutUpFrac: 0.75,
    browStrokeFrac: 0.2,
    labelFontSize: 42,
  },

  gates: {
    // Wall visuals.
    heightPx: 62,
    cornerRadiusPx: 10,
    // Near-solid walls: the operator has to read instantly at a glance.
    opacity: 0.9,
    passedOpacity: 0.28,
    textFontSize: 30,
    // Chosen gate flashes for this long after being hit.
    hitFlashSec: 0.4,
    // Trio rows (with a middle gamble gate) split the lane in thirds; the
    // crowd centre picks the middle when |x| is under this normalized bound.
    trioThirdX: 1 / 3,
    // Lookahead: the pair after the current one renders dimmed but readable;
    // pairs beyond it are hidden so the choice stays a two-row read.
    lookaheadAlphaFrac: 0.55,
    // Far-pair text never scales below this, so the operators stay readable.
    lookaheadTextMinScale: 0.55,
  },

  enemies: {
    // Few big crabs per clump so each one reads at distance; the pill badge
    // carries the real count.
    unitRadiusPx: 11,
    slotSpacingPx: 17,
    // Render-only cap per clump. Outlined crabs cost several draws each, so
    // this stays low for 60fps.
    renderCap: 8,
    // Crowd centre must be within this normalized-x distance of the clump
    // centre when crossing its row to make contact.
    hitWindowX: 0.38,
    labelFontSize: 20,
  },

  boss: {
    // The boss is a single giant grumpy crab at the end of the path. The
    // fight starts when the crowd gets this close (world units).
    contactDistance: 2.5,
    // Purely visual base radius; the crab reads at 3-4x duckling scale.
    bodyRadiusPx: 42,
    // Crab anatomy, all as fractions of bodyRadiusPx. "Up" means -y.
    bodyWidthFrac: 1.2,
    bodyHeightFrac: 0.85,
    clawRadiusFrac: 0.5,
    clawOutFrac: 1.2,
    clawUpFrac: 0.85,
    shoulderRadiusFrac: 0.28,
    shoulderOutFrac: 0.88,
    shoulderUpFrac: 0.42,
    eyeRadiusFrac: 0.3,
    eyeOutFrac: 0.44,
    eyeUpFrac: 0.82,
    pupilFrac: 0.14,
    browStrokeFrac: 0.13,
    mouthStrokeFrac: 0.08,
    // Idle menace: slight body sway plus a pincer snap every snapPeriodSec.
    swayHz: 0.45,
    swayRad: 0.055,
    snapPeriodSec: 2,
    // While the crowd is losing he snaps much faster.
    snapLosePeriodSec: 0.55,
    snapSec: 0.25,
    snapLiftFrac: 0.18,
    // Win: he tips over backwards and slides off over knockbackSec.
    tipRad: 2,
    slideOffFrac: 3.2,
    // Top of the text hierarchy: boss > player count > gates > enemy pills.
    numberFontSize: 50,
    numberGapPx: 26,
    // Number badge floats this many body radii above the crab's base row.
    badgeUpFrac: 1.75,
    // Losing crowds get snatched at this many ducklings per second.
    drainPerSec: 25,
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

    // Gamble gate: purple x3/÷3 middle option. From gambleStartLevel, about
    // 1 in gambleLevelChance⁻¹ levels get one, at most one per level, always
    // as the middle of a trio so it is never forced. Placed from a side RNG
    // stream so it never rerolls the base layout.
    gambleStartLevel: 8,
    gambleLevelChance: 0.25,
    gambleValue: 3,

    // Sequenced traps (lookahead): pair A is x2 vs +K with the add strictly
    // better (ratio > 1 band below), then pair B flat-subtracts a big chunk
    // (-F vs ÷seqDivValue). The subtraction widens the relative gap between
    // A's two outcomes, so reading both rows separates them while a one-row
    // greedy read stays inside perception noise. Chance ramps L12 -> L30.
    seqTrapStartLevel: 12,
    seqTrapChanceL12: 0.5,
    seqTrapChanceL30: 0.9,
    // Pair-A add sits this far above break-even (add strictly better).
    seqTrapRatioMin: 1.12,
    seqTrapRatioMax: 1.38,
    // Pair-B subtraction as a fraction of the optimal count after A; must
    // stay under 1/2 so the sub side beats ÷seqDivValue on the optimal line.
    seqSqueezeFracMin: 0.38,
    seqSqueezeFracMax: 0.47,
    seqDivValue: 3,

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
    // The typical player reads the next row too (it is rendered ahead): a
    // one-row read within this perceived ratio is re-scored one row deeper.
    // Greedy one-row play therefore under-performs the boss calibration on
    // trap rows — that is what makes sequenced traps bite.
    typicalPlanCloseRatio: 1.65,
    // Normalized-x a player runs at inside their chosen gate half.
    typicalAimX: 0.45,
    targetLoseRateL1: 0.02,
    targetLoseRateL30: 0.4,
    // Exponent > 1 keeps mid-level lose targets modest (tight layouts can't
    // reach high lose rates anyway) and saves the squeeze for the end.
    targetLoseRateExponent: 1.4,
    bossMin: 5,
  },

  juice: {
    // Boss hit: brief slow motion plus a screen shake as the knockback starts.
    slowmoScale: 0.3,
    slowmoSec: 0.4,
    shakeAmplitudePx: 6,
    shakeSec: 0.45,
    // Shake oscillator frequencies (rad/sec); two incommensurate axes so the
    // offset never settles into a visible loop.
    shakeFreqX: 55,
    shakeFreqY: 47,

    // Full-screen red flash on a bad gate.
    redFlashAlpha: 0.3,
    redFlashSec: 0.35,

    // Gamble gate drama: purple flash on contact, then the count label spins
    // slot-machine numbers ticking at gambleTickHz before the result lands
    // with a big pop (and a second flash coloured by the outcome).
    gambleFlashAlpha: 0.38,
    gambleFlashSec: 0.4,
    gambleSpinSec: 0.75,
    gambleTickHz: 14,
    gambleLandPopScale: 1.9,

    // Losing to the boss: ducklings get snatched one by one — small yellow
    // particles fly from the flock to the crab over this long.
    drainPullSec: 0.4,
    drainPullMaxPerTick: 2,

    // Confetti of small squares in the gate colour on every gate pass.
    confettiCount: 22,
    confettiSizePx: 5,
    confettiSpeedMinPx: 140,
    confettiSpeedMaxPx: 360,
    // Extra upward kick so bursts fountain instead of just radiating.
    confettiUpKickPx: 150,
    confettiGravityPx: 780,
    confettiSpinMaxRad: 10,
    confettiLifeSec: 0.85,

    // Units popping out of the blob on a bad gate (and on enemy hits).
    popUnitsMax: 10,
    popUnitsEnemyMax: 6,
    popUnitSpeedMinPx: 130,
    popUnitSpeedMaxPx: 300,
    popUnitUpKickPx: 190,
    popUnitGravityPx: 900,
    popUnitLifeSec: 0.7,

    // Win: coins fountain out of the crowd while units do a staggered jump.
    coinCount: 26,
    coinRadiusPx: 5,
    coinSpeedMinPx: 90,
    coinSpeedMaxPx: 260,
    coinUpKickPx: 420,
    coinGravityPx: 820,
    coinLifeSec: 1.2,
    winJumpStaggerSec: 0.015,
    winJumpHeightPx: 12,
    winJumpSec: 0.34,
    // How long the celebration/defeat plays before the result overlay.
    winOverlayDelaySec: 1.5,

    // Lose: units fall over in a wave spreading from the blob centre.
    loseWaveSpeedPx: 220,
    loseFallSec: 0.4,
    loseOverlayDelaySec: 1.3,

    // Count label pops on every gate hit ("number flashes").
    labelPopScale: 1.45,
    labelPopSec: 0.28,

    // Crowd blob squishes narrower when steering fast. Squish amount per
    // normalized-lane-x/sec of crowd speed, its cap, and the smoothing rate.
    squishPerVel: 0.1,
    squishMax: 0.32,
    squishLerp: 9,

    // Particle pool size shared by confetti, coins and popped units.
    maxParticles: 120,
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

  // Visual-polish tunables. Everything here is render-only: nothing feeds
  // back into the sim, and every effect can be dialled down independently
  // if a device drops frames.
  visual: {
    // Sky: vertical gradient from skyTop down to a warm skyHorizon band; the
    // gradient reaches this far past the horizon line so the warmth pools there.
    skyBandFrac: 1.1,
    // Clouds: 2-3 simple wide lozenges drifting across the sky band.
    cloudCount: 3,
    cloudMinWidthPx: 70,
    cloudMaxWidthPx: 120,
    cloudHeightFrac: 0.3,
    cloudSpeedMinPx: 5,
    cloudSpeedMaxPx: 12,
    cloudAlpha: 0.92,
    cloudBandTopFrac: 0.04,
    cloudBandBottomFrac: 0.16,

    // Pond strip hugging the left screen edge (widths as screen fracs at the
    // bottom / at the horizon). Lilypads scroll with the lane and bob.
    pondBottomWidthFrac: 0.22,
    pondTopWidthFrac: 0.055,
    lilypadCount: 6,
    lilypadSpacingZ: 4.5,
    lilypadRadiusPx: 11,
    lilypadFlatten: 0.6,
    lilypadBobPx: 2.2,
    lilypadBobHz: 0.5,
    // Skip pads where the visible pond sliver is thinner than this.
    lilypadMinPondPx: 16,

    // Grass-side decorations: one flower or pebble per world slot per side,
    // anchored to world z so they scroll with the lane.
    decorCount: 12,
    decorSpacingZ: 2.4,
    decorMarginPx: 10,
    decorBeltPx: 46,
    flowerChance: 0.6,
    flowerRadiusPx: 3.2,
    flowerCenterFrac: 0.45,
    pebbleRadiusPx: 2.4,

    // Warm sand path: subtle speckle texture rows plus a soft light
    // highlight just inside each edge.
    speckleRows: 13,
    speckleSpacingZ: 1.7,
    specklePerRow: 3,
    speckleRadiusPx: 1.4,
    speckleAlpha: 0.4,
    edgeHighlightWidthPx: 2.5,
    edgeHighlightAlpha: 0.5,
    edgeHighlightInsetPx: 4,

    // Dust motes drifting along the lane edges, scrolling with the lane.
    moteCount: 8,
    moteRangeZ: 10,
    moteRadiusPx: 1.8,
    moteAlpha: 0.4,
    moteBobPx: 6,
    moteBobHz: 0.4,
    moteEdgeInsetPx: 12,

    // Thick dark cartoon outline around every entity (px at scale 1; scales
    // with perspective / blob scale where the entity does).
    outlinePx: 2.5,

    // Soft ellipse drop shadows (per-unit ellipse as fracs of body radius).
    shadowAlpha: 0.15,
    shadowWidthFrac: 1.25,
    shadowHeightFrac: 0.42,
    shadowDropFrac: 0.95,
    // Faint shadow band gates cast on the path.
    gateShadowHeightPx: 7,
    gateShadowAlpha: 0.13,
    bossShadowAlpha: 0.2,
    bossShadowScale: 1.12,

    // Gate frame: two chunky posts + crossbar, bevelled face, inner glow.
    postWidthPx: 10,
    postRisePx: 12,
    crossbarHeightPx: 11,
    bevelHeightPx: 6,
    bevelAlpha: 0.2,
    glowInsetPx: 5,
    glowWidthPx: 3.5,
    glowAlpha: 0.3,
    // Good gates pulse gently: glow alpha swings and the wall grows a touch.
    goodPulseHz: 1.4,
    goodPulseAmp: 0.4,
    goodPulseGrowPx: 2,
    // Bad gates: bold diagonal warning stripes.
    warnStripeAlpha: 0.3,
    warnStripeWidthPx: 16,
    warnStripeGapPx: 13,
    // Gamble gate: twinkling sparkles over the purple wall.
    sparkleCount: 5,
    sparkleHz: 1.8,
    sparkleMinPx: 2,
    sparkleMaxPx: 4,

    // Crab enemies (all fracs of the enemy unit radius): big googly eyes on
    // top, visible open pincers out to the sides.
    crabBodyWidthFrac: 1.3,
    crabBodyHeightFrac: 0.85,
    crabClawFrac: 0.62,
    crabClawOutFrac: 1.55,
    crabClawUpFrac: 0.7,
    crabEyeOutFrac: 0.52,
    crabEyeUpFrac: 1.15,
    crabEyeFrac: 0.5,
    crabPupilFrac: 0.26,
    // Enemy count pill badge above each clump.
    pillPadXPx: 8,
    pillHeightPx: 24,
    pillRadiusPx: 12,

    // Boss number badge.
    badgePadXPx: 18,
    badgeHeightPx: 64,
    badgeRadiusPx: 16,
    badgeRimPx: 3,

    // HUD: rounded tag behind the chunky-outlined count label, pinned at
    // bottom-centre (screen-height frac) so it can never overlap gate text.
    hudCountYFrac: 0.93,
    hudTagAlpha: 0.55,
    hudTagPadXPx: 14,
    hudTagPadYPx: 10,
    hudTagRadiusPx: 16,
    countOutlinePx: 6,
    gateOutlinePx: 6,
    textShadowAlpha: 0.4,

    // Flock blob breathes subtly at idle.
    breatheAmp: 0.013,
    breatheHz: 0.55,
  },

  colors: {
    // Duckling park theme, loud saturated cartoon: punchy sky over a warm
    // horizon, vivid grass, rich sand path, hot yellow flock, everything
    // ringed by a thick dark brown outline. All game colours live here.
    // bg is the menu/overlay backdrop; the in-game backdrop is the sky.
    bg: '#0B3B45',
    skyTop: '#38B6F5',
    skyHorizon: '#FFE182',
    cloud: '#FFFFFF',
    grass: '#4FC42D',
    flowerPink: '#FF7BCE',
    flowerWhite: '#FFFFFF',
    flowerCenter: '#FFC400',
    pebble: '#BAB1A5',
    pond: '#1FA0F2',
    lilypad: '#2E9E1F',
    lane: '#F4C862',
    laneEdge: '#C8862E',
    laneHighlight: '#FFE9AC',
    laneSpeckle: '#D8A245',
    stripe: '#FFEFC2',
    dust: '#FFE9B8',
    shadow: '#2E2013',
    // The thick cartoon outline around every entity (dark warm brown).
    outline: '#4A2F1A',
    crowd: '#FFD500',
    crowdHead: '#FFE24A',
    beak: '#FF8A00',
    mama: '#FFFFFF',
    mamaHead: '#FFFDF4',
    goodGate: '#00C9A3',
    badGate: '#FF3B30',
    gambleGate: '#B32EF5',
    gateText: '#FFFFFF',
    // Chunky operator text: deep per-kind fill under a thick white outline.
    goodGateText: '#00786A',
    badGateText: '#C4160C',
    gambleGateText: '#7A0FB8',
    gateOutline: '#FFFFFF',
    gateFrame: '#FFF6E3',
    gateFrameShade: '#B99C6C',
    warnStripe: '#5B0A05',
    sparkle: '#FDF4FF',
    enemy: '#F53D2A',
    crabClaw: '#D92B14',
    crabEye: '#FFFFFF',
    crabPupil: '#1D130A',
    pill: '#E02414',
    // Boss crab: bigger, meaner, slightly deeper red than the clump crabs.
    bossBody: '#EF4B1F',
    bossClaw: '#D63310',
    bossBadge: '#C4160C',
    bossBadgeRim: '#FFD9D4',
    hudTag: '#0F172A',
    coin: '#FFC400',
    // UI accent for buttons (the yellow flock colour reads poorly there).
    button: '#00A88C',
    label: '#FFFFFF',
    labelShadow: '#33200E',
  },
} as const;
