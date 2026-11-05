# ANT VS BARBECUE — Endless Lane Defense

A lane-defense game for **CrazyGames** (comedy, PEGI-12). This is the browser
edition of Carlton's own app game **Backyard BBQ Defense** (Ant vs Barbecue):
same field, same defenders, same ants, same charcoal — rebuilt endless.

Ants march down a picnic blanket to raid the feast. You hold the line with
Citronella Candles, Grills, Fly Swatters, Garden Hoses and Picnic Baskets.
**The twist — CRUMB THIEVES:** from Wave 3, some ants skip your defenders
entirely. They sprint for the food, grab a crumb (**−250 score, −15 charcoal**)
and run back home with it. Pop a thief on the run back to win the crumb back;
if it escapes off the right edge, the loot is gone. Every thief on the field
is a priority target screaming for your attention — that's the game.

Vanilla JS + Canvas, no build step, no dependencies. All in-game art is drawn
in code (pre-rendered to offscreen canvases at boot); all sound is synthesized
with WebAudio — the SFX voices are the app's own synth recipes.

**Art pass (Nov 4, 2026 — studio graphics standard):** art only, zero gameplay
changes. Ants are now detailed shaded sprites (segmented glossy gaster, belly,
specular, mandibles, elbowed antennae, glossy eye; fire ant flame crest, roach
wing-case, queen's jeweled crown + gold banding, thief's bandit mask) on
two-segment animated legs. Defenders rebuilt with gradients and character
(glass citronella jar, kettle grill with glowing coals + smoke, mesh swatter,
coiled hose with brass nozzle, woven basket with checkered cloth). The yard
gained depth: gradient lawn with speckle + swaying tufts, dirt entry strip,
drifting cloud shadows, fabric sheen + stitched blanket border, plated feast,
lantern-style zappers, gradient fireballs with trails, double-pass zap bolts,
round particles, and gradient-polished cards/panels. Verified by rendered
Chromium screenshots (menu / early wave / heavy wave / shop / phone) in
`../ant-bbq-art-raw/shots-before|after/`; smoke suite still 66/66. **Flat folder
by design**: the CrazyGames uploader flattens subfolders and breaks relative
paths, so every file sits at the root and the game references bare filenames
only (`cover.png` is the only asset file; it's the menu art).

## Controls

| Action | Desktop | Touch |
|---|---|---|
| Place defender | Pick a card up top (or keys `1–5`), click a blanket square | Same |
| Collect charcoal | Click a fallen charcoal lump | Tap it |
| Dig up a defender | Shovel card, then the square | Same |
| Call next wave early | "Send next wave ⚑ +25" button (+25 charcoal) | Same |
| Shop | 🛒 Shop button (pauses the run) | Same |
| Pause | `P` / `Esc` or ⏸ button | ⏸ button |
| Mute | `M` or 🔊 button | 🔊 button |

## How a run works

- **The field:** the app's exact geometry — 5 lanes × 9 columns on a picnic
  blanket (canvas 1000×560, grid at x=118, cell 90×102). Ants enter from the
  right and march left toward the feast at the left edge.
- **Defenders (app stats):** 🕯️ Citronella Candle (50 🪨, brews +25 charcoal
  every 12s) · 🔥 Grill (100 🪨, lobs fireballs down its lane) · 🏸 Fly
  Swatter (125 🪨, huge melee smacks, point blank only) · 💦 Garden Hose
  (150 🪨, soaks ants in front — 55% speed for 1.6s) · 🧺 Picnic Basket
  (75 🪨, 850 HP snack-filled wall). Cards have the app's cooldowns (5/5/7/7/10s).
- **Charcoal (app economy):** starts at 150, trickles in (+1 per 1.5s), falls
  from the sky in lumps worth 25 (tap them before they vanish), and Candles
  cook up more. Calling a wave early pays +25.
- **Ants (app stats):** Ant (105 HP, slow) · Fire Ant (85 HP, fast) ·
  Carpenter Ant (520 HP tank) · Roach (340 HP, quick, resists hose slow) ·
  Queen Ant (4,600 HP boss) · **Crumb Thief** (95 HP, sprints both ways).
  Ants stop and eat the defender in front of them, exactly like the app.
- **Bug zappers (app rule):** the first ant through a lane trips that lane's
  zapper, which fries the *entire* lane and is spent. A second ant through a
  spent lane raids the feast — run over. Run summary shows score, waves held,
  kills, thief stats and coins banked.
- **Waves:** 1–10 mirror the app's composition table (Queen finale at 10).
  From 11 the cookout is **endless and procedural**: compositions keep growing,
  ant HP scales ×1.16 per wave past 10, speed creeps +0.4%/wave, and a Queen
  returns every 10th wave. Score chase, no final wave — by design.

## Meta (coins persist between runs)

Kill bounties (1–4 🪙, Queen 50) and wave-clear bonuses bank into a permanent
coin purse, spent in the 🛒 Shop:

- **Upgrades** (5 levels each): Sharper Flames (+15% Grill damage), Heavy
  Swatter (+20%), Big Wax Energy (+25% candle + lump charcoal), Reinforced
  Gear (+30% Basket/Hose HP), Zapper Recharge (spent zappers re-arm on a
  wave cadence — every 10 waves at Lv1, tightening to every 4 at Lv5).
- **Head Chefs** (pick one passive): Backyard Rookie (free) · Grill Sergeant
  (600 🪙, +10% damage) · Auntie Citronella (1,800 🪙, candles +50%, lumps
  +25%) · The Exterminator (4,500 🪙, +20% damage, zappers re-arm after
  every Queen wave).
- **Blanket themes:** Classic Gingham (free), Blue Denim (400), Night
  Cookout (1,500), Golden Hour (3,500) — pure palette swaps of the field.

Best score / best wave are saved. Save key `antVsBbqSaveV1` (LocalStorage).

## Tutorial (first run only, never repeats)

A dismissible gold prompt bar (✕ skips forever, persisted in the save) walks
five steps, each ≤10 words, none of them blocking input:

1. "👆 Pick the Grill card up top" — Grill card glows.
2. "👆 Tap a lawn square to place it" — pulsing ring + 👇 on the grid, ghost preview.
3. "👆 Charcoal lumps fall — tap one!" — a lump is guaranteed to be on its way.
4. "🕯️ Place a Candle — free charcoal" — Candle card glows.
5. "🍪 Crumb Thief! Pop him running back!" — arms when the candle lesson is
   done, stays hidden until Wave 3 when thieves actually exist, completes
   when the first thief is popped (or gets away).

Cards a player can't afford show the exact shortfall in red
("🪨 150 · Need 40 more"). Anyone who has ever placed a defender
(`save.everPlaced`) never sees the tutorial. A one-screen **How to Play**
panel covers the same ground from the menu.

## CrazyGames SDK

SDK v3 via the studio's proven `CG` wrapper: init before all other calls,
loading/gameplay start-stop brackets, `happytime` on a Queen kill, and
**midgame ads only at natural breaks** — run over and Queen-wave clears —
behind the 3-minute client throttle, with mute+freeze veil while an ad is
active. The portal's `game.settings.muteAudio` outranks the in-game toggle.
Every call is feature-detected and try/caught: off-portal (GitHub Pages
preview, local dev) the game runs fully standalone.

## Files

| File | What |
|---|---|
| `index.html` | Shell, HUD, card bar, overlays (menu / how-to / shop / pause / game over), tutorial bar |
| `game.js` | The whole game (~56 KB) |
| `cover.png` | Master cover 1200×630 (also the menu art) |
| `cover-landscape.png` | 1920×1080 portal cover |
| `cover-portrait.png` | 800×1200 portal cover |
| `cover-square.png` | 800×800 portal cover |
| `preview-landscape.mp4` / `preview-portrait.mp4` | 15s cover-zoom previews |

Cover art is 100% PIL-drawn (no generated assets): gingham blanket, grill,
swatter, zapper pole, and the star — a sunglasses-wearing ant hauling a
crumb sack. Title drawn from a literal string and verified letter-by-letter
("ANT VS BARBECUE").

## Testing

Headless smoke suite at `../ant-bbq-art-raw/smoke-test.js` (Node vm + DOM
stubs, drives the real code): **66 checks, all passing** — boot, tutorial
state machine end-to-end, placement/economy, candle income, lump collect,
grill kill, thief steal → run-back → recovery, zapper fire + second-breach
game over, save roundtrip, returning-player grandfathering, real shop
purchases (upgrade + chef), endless wave-11 HP scaling, Queen cadence, and
a fake-SDK world proving the game-over ad fires once and the 3-minute
throttle blocks the second, a responsive-fit world (portrait 360×740 /
390×844, landscape 844×390, desktop 1280×800), and a viewport-pinning
world (wrap sized/offset from a simulated visualViewport with browser
bars, re-pin on vv scroll, plus static page guarantees). `node --check
game.js` clean.

## Responsive fit (phones)

The game is the entire page. `#wrap` is `position:fixed` and `pinWrap()`
in game.js drives its size AND offset from `window.visualViewport`
(width / height / offsetLeft / offsetTop), re-pinning on vv resize and
vv scroll — so the column always sits exactly inside the VISIBLE area,
even while Edge's tab strip + address bar are up (round 2 left the wrap
in document flow at `100dvh`, taller than the visible viewport, and the
browser bars clipped the defender card names). Page scroll is locked
(`overflow:hidden`, `overscroll-behavior:none`, `touch-action:none` on
the wrap) and wrap padding respects `env(safe-area-inset-*)`.
`fitStage()` then measures the real HUD / card-bar / wave-bar heights
and caps a unified column width (`--uW`, shared by all four rows) by
that same visible box — letterboxed, never cropped. Overlays center
safely (auto margins) so the top of tall menu content stays reachable
by scrolling inside the overlay instead of clipping. Narrow or short
screens (≤700px wide or ≤520px tall) get compact chrome: the defender
bar becomes a one-row horizontal scroll strip of short cards that
always show icon + name + price (only the flavor description drops),
and HUD buttons grow to ≥40px tap targets. Portrait phones small
enough to shrink the field get a "↻ Rotate your phone for a bigger
view" pill. Desktop resolves to the original 1000px design, unchanged.
(Graveyard Shift never had this bug: its build cards live in an
in-stage sheet, so it has no external card bar eating screen height.)

## Design decisions made where the app source was thin

- **Endless structure:** the app is 10 fixed waves behind a $2.99 paywall.
  Portal rules = no paywall, retention first — so waves 1–10 keep the app's
  tables verbatim and 11+ go procedural with compounding HP. The app's
  "second ant through = game over" stakes are kept (it's the identity of
  the lose condition), softened only by permanent meta progression.
- **Damage numbers:** the app defines HP/costs/cooldowns but buries its
  projectile/melee numbers in its combat code; the browser edition sets
  Grill 30 dmg/1.35s, Swatter 95/1.05s, Hose 3 dmg per 0.3s tick + slow —
  tuned so the app's wave tables clear with the app's own economy.
- **Coins:** the app has no meta currency (its meta *was* the paywall).
  Coins replace it as the portal-legal progression sink.
- **Mid-run resume:** the app auto-saves mid-run state; the browser edition
  saves meta only (matches the studio's other portal games, keeps runs
  honest score attacks).
