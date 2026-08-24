# SFX

Sourced sound set, preloaded at boot by `src/engine/sfx.ts`. Keep total under
800KB. To swap a sound, overwrite the file and keep the name — the mapping is:

| File | Played on |
| --- | --- |
| pop.wav + quack1/2/3.wav | good gate pass (random quack, ±10% pitch per play) |
| womp.wav + peep.wav | bad gate (peep alone on enemy-clump contact) |
| ratchet.wav → ding.wav / buzz.wav | gamble gate spin → win / fail |
| thud.wav + chorus.wav | boss beaten (impact, then quack chorus on the win) |
| snap.wav + descend.wav | boss lost |
| coins.wav | coin award |
| click.wav | UI button tap |

All files are 16-bit mono 22050 Hz wav, peak-normalized per sound.

## Sources

Everything except the quacks is Kenney (kenney.nl, CC0 1.0), taken from the
pack mirrors in github.com/lavenderdotpet/CC0-Public-Domain-Sounds:

- pop = Interface Sounds `drop_003`, ding = `glass_002` (+ echo tail),
  buzz = `error_004` (doubled, slowed)
- womp = Digital Audio `lowDown`; peep and descend = `pepSound3`
  (slowed / stepped down a G-E-B arpeggio)
- ratchet = Casino Audio `cardShuffle` (trimmed, rising level)
- thud = Impact Sounds `impactSoft_heavy_001` (bass-boosted)
- snap = RPG Audio `metalLatch` (double hit); coins = RPG Audio `handleCoins`
- click = UI Audio `click1`

quack1-3 and chorus are sliced / layered from the duck recording
`scripts/ducker/quack.mp3` in github.com/artemvasilkin/ducker. That repo
declares no license for the recording, so its provenance is unverified —
replace the four quack files with a cleanly-licensed recording before any
commercial release.
