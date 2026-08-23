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
