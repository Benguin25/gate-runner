# SFX

CC0 sound set, preloaded at boot by `src/engine/sfx.ts`. Keep total under
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

NOTE: the CC0 recordings this set was meant to ship with never landed in the
repo, so the current .wav files are offline-synthesized placeholders in the
same format (16-bit mono 22050 Hz) awaiting drop-in replacement.
