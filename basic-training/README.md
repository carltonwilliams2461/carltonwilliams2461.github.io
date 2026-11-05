# BASIC TRAINING — Reception Week Chaos

A rapid-fire instruction-following game for **CrazyGames** (comedy chaos,
PEGI-16-style mild language). Carlton's original idea — he lived it: you step
off the bus into screaming drill sergeants and a week of seconds-long,
near-impossible orders. Read the order, do the right thing NOW, or drop and
give push-ups. It's the *comic* half of boot camp — the screaming, the absurd
standards, the impossible clocks — never the dark half: no slurs, no hazing
violence, no weapons pointed at anyone.

Vanilla JS + Canvas, no build step, no dependencies. All art is drawn in code
(pre-rendered to offscreen canvases at boot); SFX are synthesized with
WebAudio, and the drill sergeant's voice is **real recorded audio** —
`bark-01..12.mp3` (the fail-flash barks) and `cadence.mp3` (the full
day-pass cadence chain) — **Carlton's own voice**, recorded by him in
one take on 2026-11-04 (the earlier TTS voice was swapped out at his
direction; the bark texts below are his exact performed wording,
ad-libs included). **Flat folder
by design**: the CrazyGames uploader flattens subfolders and breaks relative
paths, so every file sits at the root and the game references bare filenames
only (asset files: `cover.png`, the menu art; `ds-win.mp4` + `ds-win.jpg`,
the day-pass cadence video and its poster still; the voice clips above.
The fail-flash face is drawn in code — no image file).

## Controls

| Action | Desktop | Touch |
|---|---|---|
| Obey an order | Click / tap the right thing, drag locker items | Same |
| Hold still (ATTENTION!) | Don't move the mouse, don't click | Don't touch |
| Push-ups (penalty) | Click fast | Tap fast |
| Shop | 🛒 Shop button (pauses the run) | Same |
| Pause | `P` / `Esc` or ⏸ button | ⏸ button |
| Mute | `M` or 🔊 button | 🔊 button |

## How a run works

- **A Training Day** is a run of timed micro-events ("orders"). Each one:
  the DS screams the order in a speech bubble (+ synth bark), then you have
  **3–6 seconds** to do exactly that. Success builds your **Squared-Away
  meter** (+8) and your streak; a blown order drains the meter (−22;
  **−14 on Day 1** — reception day runs a training drain, see the
  cadence section) and drops you into the push-up beat. Meter at zero =
  **RECYCLED** — run over, back to Day 1.
- **The 8 events:** 🚌 **Off the Bus** (tap YOUR duffel — the ★-tagged one —
  then hit the door) · 👣 **Get on the Line** (stand on YOUR roster number)
  · 🦈 **Shark Attack** (two DSs shout contradictory orders — obey the
  **senior DS (★)**, his **last** order wins) · 🤐 **Attention!** (hold
  perfectly still while a fly, a fainting recruit and a looming DS try to
  bait a flinch — any input is a fail) · 🎒 **Contraband Shakedown** (tap
  only the contraband into the amnesty box; issue gear is a strike) ·
  📏 **Uniform Issue** (grab only YOUR sizes as gear rains down) ·
  🗄️ **Locker Drill** (drag 6 items to match the diagram exactly) ·
  📞 **Phone Call Home** (memorize the script for 2 seconds, pick it back
  word-for-word from 3 bubbles).
- **Days 1–7 — Reception Week:** authored plans grow from 5 events to the
  10-event **Day 7 Graduation Evaluation**, and the speed multiplier tightens
  every day (×1.00 → ×0.58). Graduating banks a 65-Merit bonus.
- **Day 8+ — Endless Drill Mode:** 10 generated events a day, speed keeps
  tightening to a ×0.40 floor. Score chase: 100 + time bonus + streak bonus
  per order obeyed, push-ups avoided, days survived.

## THE FAIL FLASH

Carlton's design addition (the STATUE! ghost-face scare, boot-camp style),
sharpened by him across three rounds: **every blown order flashes a huge
drill-sergeant face full-screen — and the face TALKS.** The face is a
detailed shaded **cartoon head drawn in code** (`drawFlashHead` in
`game.js`): skin gradients and stubble, a hard square jaw, bare narrowed
eyes (no sunglasses — the menace is the brim shadow, per his direction),
and the brown campaign hat **tilted forward and pulled low, its brim
casting a shadow band across the eyes** — his signature, taken from his
reference photos of real drill sergeants ("the hat should always be
tilted like that"). The skin, hat band, and shirt follow the equipped DS
pack, so the man in your face is the man from the stage. The tilt also
applies to the in-game DS sprites and the PIL cover art. The flash lands
with a **scale-punch** + **screen shake**, shows one line from a
**12-line bark bank** ("DROP AND GIVE ME 25, NUMB NUTS!", "I'VE SEEN
BETTER COORDINATION FROM MY BAG OF FUCKING HAMSTERS!", …) — and the line is
**spoken out loud** by Carlton himself (`bark-NN.mp3`, same index
as the text; the flash stays up for the length of the bark, ~1.5–4.2 s).
The bank is a shuffled bag persisted in the save: **no line repeats
until all 12 have cycled** — audio and text ride the same dealt index,
so they can never drift apart. The flash is purely visual — timers and
input are untouched — and the push-up penalty beat follows as usual.

**How the talking works.** The head is drawn fresh every frame in two
layers — an upper head (skull, eyes, brows, hat) and a **jaw group**
(chin, stubble, jaw shading) that drops and rotates on its hinge as one
piece, so it can never tear at a seam. The mouth assembly spans both:
**four mouth states (closed / slight / mid / wide)** — interior height,
teeth, and tongue keyed to the state — selected every frame from the
bark clip's **measured loudness envelope** at the live playback
position (the same `BARK_ENV` data path the photo jaw used). Under
0.10 the mouth is pressed shut, so between words it closes like a real
man's does; loud syllables throw it wide while the brows furrow and
the whole head lunges and shakes, gated by the same envelope. jaw = 0
is the head at rest — and that rest head is the flash's only fallback:
there is no image left to fail to load.

**History, honestly kept.** The flash shipped first as a photoreal
portrait (`ds-flash.jpg`, a generated original character), then as that
portrait with a canvas-animated jaw — Carlton still read it as "a
still photo, it ain't moving," and the image-to-video route for it had
already failed twice (one character swap, one generator refusal — not
retried). His call: "a talking type of cartoon… a realistic looking
talking cartoon saying the words." The photograph is retired from the
pack; the file is preserved in `../basic-training-art-raw/` with the
rejected candidates. The cartoon head's four mouth states were
rendered head-only and in live flash frames and inspected side by
side: states unmistakably distinct, jaw travel obvious, no tears, no
duplicated features, hat tilt and brim shadow intact.

**Voice swap — DONE 2026-11-04 (Carlton's own voice):** the talking rig
reads only the bark clips plus the baked `BARK_DUR` / `BARK_ENV`
constants, so the replacement voice needed NO rig changes: his
one-take recording was segmented on silence boundaries into
`../basic-training-art-raw/audio/raw/bark-01..12.mp3` (+ `call-1..3`,
`resp-1..2`), `audio/build_audio.py` re-encoded the shipped
`bark-01..12.mp3`, re-measured durations + 20 fps envelopes, and the
printed `BARK_DUR` / `BARK_ENV` replaced the constants in
`game.js`. The flash length cap rose 2.9 s → 6.0 s so his longer
lines are never cut. The old TTS raws are kept in
`audio/raw/mai03-backup/`. (The cadence calls are a separate mix —
`cadence.mp3` was rebuilt by the same script from his call/response
takes, slots widened to his natural pace — no tempo compression.)

## THE DAY-PASS CADENCE

The win counterpart to the fail flash — Carlton's pair. **Passing a Day
plays a 2.5 s video pop-up on the day-complete screen** (`ds-win.mp4`,
631 KB): the DS marching alongside a squad in step down the barracks
road, calling cadence (generated still → image-to-video; frames
inspected — faces, legs and boots stay coherent). `ds-win.jpg` is its
poster/fallback still. Under it, a ribbon runs the traditional cadence
as **call & response, exactly as Carlton dictated it** — the DS calls,
the SQUAD answers; the response is its own beat, in green with a 📣
SQUAD label, never part of the call:

> 🗣️ DS: YOUR MAMA WAS HOME WHEN YOU LEFT! → 📣 SQUAD: YOU'RE RIGHT!
> 🗣️ DS: YOUR DADDY WAS HOME WHEN YOU LEFT! → 📣 SQUAD: YOU'RE RIGHT!
> 🗣️ DS: YOUR MAMA, YOUR DADDY, THE DOG, THE CAT, THE RAT WERE ALL HOME
> WHEN YOU LEFT! → 📣 SQUAD: YOU'RE RIGHT! YOU'RE RIGHT!

**The cadence is now real recorded audio too** (`cadence.mp3`, 12.85 s):
the DS call lines in Carlton's own voice, the squad's "YOU'RE
RIGHT!" answers **group-processed from his own takes** (five layered
copies — pitch-shifted, offset, room-echoed — so it sounds like a
formation answering, not one man), assembled call → response → call →
response → full chain → double response in Carlton's exact order,
with synthesized marching stomps mixed underneath at step tempo.
Each segment was built into an
exact time slot (`CADENCE_STEP_DUR` = 2.00 / 1.00 / 2.05 / 1.00 / 5.30 /
1.50 s), and the ribbon steps on those slot boundaries, so the words on
screen land with the voices. The chain is the primary cadence and stays
intact in this order. **Tap the video to skip**; the pop also stops
itself — audio included — when you leave the day-complete screen. Mute
(in-game toggle or the portal's `muteAudio`) silences barks and cadence
together; where no Audio exists at all, the old synth bark/stomps remain
as the fallback.

**FRONT-DOOR CADENCE (added at Carlton's word — he loved the moment
but could never reach it):** the main menu and How to Play both carry
a **🎖️ Hear the Cadence** button that plays this exact presentation
on demand. It is the *same* pop, not a copy: `showMenuCadence()`
re-homes the `winPop` element into a stage-level slot (`#winPopSlot`,
outside the scrollable menu overlay, where it floats as a centered
card over the dimmed menu via the `#winPopSlot #winPop` CSS), calls
the unchanged `showWinPop()`, and `stopWinPop()` returns the element
to its day-end home slot (`#winPopSlotHome`) whichever way the show
ends — video tap (skip), button toggle, or leaving the menu. Same
video, same recorded chain, same ribbon sync, same mute rules; no
save, progress or day flow is touched, and the day-pass pop is
verified unchanged after menu use.

**Day-1 reachability audit (same round):** Day 1 is 5 authored
events; the meter starts at 60, passes pay +8, and at the old −22
drain three cold mistakes in a row (60 → 38 → 16 → −6) recycled a
first-time player before he'd seen the whole day — and *any* 4 fails
ended the run in every order. Day 1 now drains **14** per blown
order (`failDrain()`, Day 1 only): three straight fails leave 18 and
the day finishes, 4 fails + 1 obeyed order pass at 12, and only
blowing **all five** orders still recycles (60 − 5×14 < 0). Days 2+
and Drill Mode keep the full −22, verified behaviorally in the smoke
suite (World 9).

## THE PUSH-UP RECRUIT

Carlton played the penalty beat and rejected the original recruit
outright — it was drawn from single canvas strokes (one fat line for a
torso, one line for both legs, a dangling arm that never reached the
ground, a circle for a head). Rebuilt as a **parametric rig**: the body
is one rigid plank pivoting on the toes, so ankle, hip, shoulder and
head stay on a single straight line at **every** phase and the legs can
never bend, splay or warp; the arms are solved two-bone
(shoulder → elbow → planted hand) so the elbows fold back naturally as
the plank lowers. Every part is a filled, tapered, shaded mass —
broad torso with a tucked shirt and belt, real arms and hands planted
under the shoulders, straight trouser legs together, boots with toes
on the ground, head in profile with a patrol cap. Pose and proportions
follow Carlton's reference photo of soldiers in front-leaning rest
(gray PT shirt, olive trousers, arms vertical at the top). Nine phase
frames (680×400) are pre-rendered at boot; one tap plays one full
push-up (down and back up in 0.42 s). Top / middle / bottom frames
were rendered and inspected side by side: straight plank, straight
legs, correct elbows at all three.

## Meta (Merit ⭐ persists between runs)

- **Recruits:** 😰 Pvt. Shaky (free; sweats on cue) · 😎 Pvt. Icy (600 ⭐;
  +0.5 s on every event timer) · 🏃 Pvt. Wheels (1500 ⭐; push-up penalties
  take 3 taps instead of 5).
- **DS packs:** 🗣️ Classic DS (free) · 🌩️ Southern Thunder (800 ⭐; lower
  barks, red hat band) · 🤫 The Whisper (2000 ⭐; quiet bubbles, clear
  glasses, timers +5% because dread takes time).
- **Barracks themes:** 🏢 Reception Bay (free) · 🏜️ Sand & Sun (400 ⭐) ·
  🌙 Night Watch (1200 ⭐).
- Shop buttons show the exact shortfall ("⭐ 1500 · Need 640 more") when
  you can't afford something — no guessing.

## Onboarding

First time each event type appears, a one-line guided prompt rides over the
field ("Tap YOUR duffel — the tagged one!", "DON'T. MOVE."), skippable via
the ✕ on the prompt bar, persisted so it never repeats; returning players
are grandfathered out. A one-screen How to Play covers the whole loop in
six lines.

## Phone fit (the studio pin standard)

The game is the entire page: `html, body` are `100dvh` with `overflow:
hidden`; `#wrap` is `position: fixed` and `pinWrap()` drives its size **and**
offset from `window.visualViewport` on visualViewport resize/scroll, so
browser tab strips and address bars can never cover the game and the page
can never scroll. `fitStage()` caps the whole column (HUD / meter / event
bar / stage) by the visible box — letterboxed, never cropped. Compact phone
chrome shrinks labels but never hides one. Safe-area insets are padded.

## Portal pack

| File | Spec |
|---|---|
| `index.html` + `game.js` | The game (runtime ≈ 129 KB; the fail-flash talking head is drawn in code — no face image ships) |
| `bark-01..12.mp3` | 1.0–2.5 s each, 9–21 KB — the recorded DS barks, indexed to the bark bank |
| `cadence.mp3` | 8.7 s, 69 KB — the recorded cadence chain (DS calls + group squad + stomps) |
| `ds-win.mp4` | 2.5 s, 1152×768, 631 KB — day-pass cadence video (silent; its audio is `cadence.mp3`) |
| `ds-win.jpg` | 1152×768, 131 KB — cadence poster/fallback still |
| `cover.png` | 1200×630 master (menu art) |
| `cover-landscape.png` | 1920×1080 (exact) |
| `cover-portrait.png` | 800×1200 (exact) |
| `cover-square.png` | 800×800 (exact) |
| `preview-landscape.mp4` | 15 s, 1920×1080 zoompan over the landscape cover |
| `preview-portrait.mp4` | 15 s, 800×1200 zoompan over the portrait cover |

Total pack ≈ 3.00 MB. Cover art is 100% PIL-drawn (DS face-to-face with the
recruit, "MOVE! MOVE! MOVE!" bubble); the title "BASIC TRAINING" was
verified letter-by-letter visually after render, and re-verified after
the hat-tilt re-render. The generated assets are the cadence still/clip
(see above); the retired fail-flash photograph is preserved in
`../basic-training-art-raw/`. Voice clips were produced with the
studio TTS route (deep male voice, loudness-normalized); every clip is
ffprobe-verified (bark durations 1.02–2.52 s; cadence exactly 8.70 s),
and the working files live in `../basic-training-art-raw/audio/`
(`build_audio.py` reproduces the whole pipeline).

QA: `../basic-training-art-raw/smoke-test.js` — **129 headless checks**
(boot, all 8 events' win AND fail paths, push-up penalty insertion,
FAIL FLASH trigger + full 12-line bark rotation cycle + talking-head
checks (photo retired from the pack, no photo wiring left in the JS,
the cartoon head is the flash's single draw path, four mouth states
selected by envelope value), day progression,
graduation, endless generation + speed floor, returning-player shop with
shortfall text, fake-SDK between-day ads with the 3-minute throttle,
responsive fit at phone/desktop sizes, visualViewport pinning assertions,
day-pass cadence behavior — pop opens on the MAMA call, squad answers on
its own beat, chain verified intact in order, tap-to-skip stops it —
plus cadence video asset presence/MP4-magic/size checks, and a World 7
block: all 13 voice clips ship as real MP3s of sane size, bark
durations/envelopes baked for all 12 lines, cadence slot durations sum
to the recorded chain, VOX no-ops cleanly where no Audio exists, the
dealt bark index provably matches the shown line, flash duration
follows the dealt clip, the push-up rig renders 9 hi-res phase frames
and the old stick-figure code is gone, total pack under 5 MB). Live
browser verification (headless Chromium) additionally confirmed: all
12 bark elements + the cadence clip load, a dealt bark plays with its
playback position advancing while the jaw tracks the envelope, mute
pauses a bark mid-flight, and the cadence plays on the day-complete
pop. Screenshots of the push-up phases, the talking cartoon head at
four mouth states (head-only sheet plus live flash frames), and the
win pop live in `../basic-training-art-raw/verify/`.
`node --check` clean. One honest limit, same as every studio game: no
real-device visual pass is possible from the build machine — Carlton's
phone is the final visual check.

**Preview:** https://carltonwilliams2461.github.io/basic-training/
