# BASIC TRAINING — Reception Week Chaos

A rapid-fire instruction-following game for **CrazyGames** (comedy chaos,
PEGI-16-style mild language). Carlton's original idea — he lived it: you step
off the bus into screaming drill sergeants and a week of seconds-long,
near-impossible orders. Read the order, do the right thing NOW, or drop and
give push-ups. It's the *comic* half of boot camp — the screaming, the absurd
standards, the impossible clocks — never the dark half: no slurs, no hazing
violence, no weapons pointed at anyone.

Vanilla JS + Canvas, no build step, no dependencies. All art is drawn in code
(pre-rendered to offscreen canvases at boot); all sound is synthesized with
WebAudio (barks are formant-ish saw bursts — no voice acting). **Flat folder
by design**: the CrazyGames uploader flattens subfolders and breaks relative
paths, so every file sits at the root and the game references bare filenames
only (asset files: `cover.png`, the menu art; `ds-flash.jpg`, the photoreal
fail-flash face; `ds-win.mp4` + `ds-win.jpg`, the day-pass cadence video
and its poster still).

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
  meter** (+8) and your streak; a blown order drains the meter (−22) and
  drops you into the push-up beat. Meter at zero = **RECYCLED** — run over,
  back to Day 1.
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
sharpened by him mid-build: **every blown order flashes a huge
drill-sergeant face full-screen — a PHOTOREALISTIC one.** A muscle-bound
DS mid-scream, veins out, brown campaign hat **tilted forward and pulled
low, its brim casting a shadow band across the eyes** — Carlton's
signature direction, taken from his reference photos of real drill
sergeants ("the hat should always be tilted like that"; the photos were
style reference only — the face is an original fictional character, no
real person, no actor's likeness, and **no sunglasses this time**: the
brim shadow does the menace). The current face was picked as the meanest
clean one of 3 fresh candidates (frontal mid-scream beat a silent stare
and a 3/4 angle) and compressed to 176 KB (`ds-flash.jpg`, 900×900). The
tilt now applies **everywhere the DS appears**: the photo, the in-game
cartoon DS sprites (hat group lowered + rotated, shadow band over the
eyes, incl. the 2× flash fallback), and the PIL cover art. It lands
with a **scale-punch** (1.3× → 1× in the first frames) + **screen shake**
+ a 3-syllable bark for ~0.85 s, showing one line from a **12-line bark
bank** ("DROP AND GIVE ME 25, NUMBNUTS!", "I'VE SEEN BETTER COORDINATION
FROM A BAG OF HAMMERS!", …). Everything else in the game is cartoon —
that's the point: cartoon world, then a REAL face in yours. If the photo
can't load (offline/blocked), the big 2× cartoon DS sprite is the
fallback. The bank is a shuffled bag persisted in the save: **no line
repeats until all 12 have cycled**. The flash is purely visual — timers
and input are untouched — and the push-up penalty beat follows as usual.

**Honest note — the flash does not move (yet).** Carlton asked for the
fail flash as a 1.5–2.5 s VIDEO (lunge, head-shake, mid-scream). Two
image-to-video attempts were made on the winning still: the first
drifted into a completely different man outdoors (character swap —
unusable), the second was refused by the generator. Rather than fake
motion, the flash ships as the new still + the existing scale-punch.
Its win counterpart below DID animate cleanly, so the pair is currently:
fail = photo flash, pass = cadence video.

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

Calls also fire the synth bark; synthesized stomp drums (low sine drops
+ noise snaps) march underneath at step tempo. The chain is the primary
cadence and stays intact in this order. **Tap the video to skip**; the
pop also stops itself when you leave the day-complete screen.

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
| `index.html` + `game.js` | The game (runtime ≈ 100 KB) |
| `ds-flash.jpg` | 900×900, 176 KB — photoreal fail-flash face (tilted hat, no sunglasses) |
| `ds-win.mp4` | 2.5 s, 1152×768, 631 KB — day-pass cadence video (silent; drums are WebAudio) |
| `ds-win.jpg` | 1152×768, 131 KB — cadence poster/fallback still |
| `cover.png` | 1200×630 master (menu art) |
| `cover-landscape.png` | 1920×1080 (exact) |
| `cover-portrait.png` | 800×1200 (exact) |
| `cover-square.png` | 800×800 (exact) |
| `preview-landscape.mp4` | 15 s, 1920×1080 zoompan over the landscape cover |
| `preview-portrait.mp4` | 15 s, 800×1200 zoompan over the portrait cover |

Total pack ≈ 2.9 MB. Cover art is 100% PIL-drawn (DS face-to-face with the
recruit, "MOVE! MOVE! MOVE!" bubble); the title "BASIC TRAINING" was
verified letter-by-letter visually after render, and re-verified after
the hat-tilt re-render. The generated assets are the fail-flash face and
the cadence still/clip (see above).

QA: `../basic-training-art-raw/smoke-test.js` — **102 headless checks**
(boot, all 8 events' win AND fail paths, push-up penalty insertion,
FAIL FLASH trigger + full 12-line bark rotation cycle + photo-asset
presence/size/reference checks, day progression,
graduation, endless generation + speed floor, returning-player shop with
shortfall text, fake-SDK between-day ads with the 3-minute throttle,
responsive fit at phone/desktop sizes, visualViewport pinning assertions,
day-pass cadence behavior — pop opens on the MAMA call, squad answers on
its own beat, chain verified intact in order, tap-to-skip stops it —
plus cadence video asset presence/MP4-magic/size checks, total pack
under 5 MB).
`node --check` clean. One honest limit, same as every studio game: no
real-device visual pass is possible from the build machine — Carlton's
phone is the final visual check.

**Preview:** https://carltonwilliams2461.github.io/basic-training/
