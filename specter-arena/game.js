'use strict';
/* ============================================================
   SPECTER ARENA — a neon ghost-eat-ghost .io-style arena.
   Single player vs AI bot ghosts. Eat orbs to grow, absorb
   smaller ghosts, flee bigger ones. PHASE (hold) makes you
   untouchable and lets you pass through anything — but burns
   your size every second. Escape and suicide are one button.

   Vanilla JS + Canvas, no build step, no dependencies. All art
   is drawn/pre-rendered on canvas at boot; all sound is
   synthesized with WebAudio (no audio files). Built for
   CrazyGames (teen / PEGI-12): SDK integration degrades
   gracefully — the game runs standalone with zero errors when
   the SDK is absent or reports environment 'disabled'.
   ============================================================ */

/* ---------------- utils + storage ---------------- */
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode etc. */ } }

const SAVE_KEY = 'specterSaveV1';
const save = { bank: 0, best: 0, skin: 0, trail: 0, muted: false,
               ownedSkins: [true, false, false, false, false],
               ownedTrails: [true, false, false, false, false] };
try {
  const raw = JSON.parse(lsGet(SAVE_KEY, 'null'));
  if (raw && typeof raw === 'object') {
    save.bank = raw.bank | 0; save.best = raw.best | 0;
    save.skin = clamp(raw.skin | 0, 0, 4); save.trail = clamp(raw.trail | 0, 0, 4);
    if (Array.isArray(raw.ownedSkins)) save.ownedSkins = save.ownedSkins.map((_, i) => i === 0 ? true : !!raw.ownedSkins[i]);
    if (Array.isArray(raw.ownedTrails)) save.ownedTrails = save.ownedTrails.map((_, i) => i === 0 ? true : !!raw.ownedTrails[i]);
    save.muted = !!raw.muted;
    if (!save.ownedSkins[save.skin]) save.skin = 0;
    if (!save.ownedTrails[save.trail]) save.trail = 0;
  }
} catch (e) { /* corrupted save -> defaults */ }
function persist() { lsSet(SAVE_KEY, JSON.stringify(save)); }

/* ---------------- CrazyGames SDK v3 wrapper ----------------
   Docs: https://docs.crazygames.com/sdk/intro/ , /sdk/game/ , /sdk/video-ads/
   - init() must resolve before any other SDK call.
   - loadingStart/Stop bracket asset loading; the first gameplayStart
     marks the end of the measured initial download.
   - gameplayStart/Stop must bracket active gameplay (start, resume,
     new run / stop on pause, menu, death, before ads).
   - ad.requestAd('midgame', callbacks): mute + freeze in adStarted,
     restore in adFinished/adError. Midgame ads only at natural
     breaks — here: on death, before the restart screen.
   - game.settings.muteAudio (Full Launch requirement) outranks the
     in-game mute toggle; we poll it and also register the listener.
----------------------------------------------------------- */
const CG = {
  sdk: null, ready: false, lastAdAt: -1e9,
  async init() {
    try {
      if (typeof window !== 'undefined' && window.CrazyGames && window.CrazyGames.SDK) {
        await window.CrazyGames.SDK.init();
        this.sdk = window.CrazyGames.SDK;
        // On non-CrazyGames domains the SDK reports environment 'disabled'
        // and its methods throw — treat that as "no SDK".
        this.ready = this.sdk.environment !== 'disabled';
        if (this.ready && this.sdk.game && this.sdk.game.addSettingsChangeListener) {
          try { this.sdk.game.addSettingsChangeListener(() => updateMute()); } catch (e) {}
        }
      }
    } catch (e) { this.sdk = null; this.ready = false; }
  },
  call(fn) {
    if (!this.ready || !this.sdk) return;
    try { fn(this.sdk); } catch (e) { /* SDK must never break the game */ }
  },
  loadingStart() {
    this.call(s => {
      if (s.game.loadingStart) s.game.loadingStart();
      if (s.game.sdkGameLoadingStart) s.game.sdkGameLoadingStart();
    });
  },
  loadingStop() {
    this.call(s => {
      if (s.game.loadingStop) s.game.loadingStop();
      if (s.game.sdkGameLoadingStop) s.game.sdkGameLoadingStop();
    });
  },
  gameplayStart() { this.call(s => { if (s.game.gameplayStart) s.game.gameplayStart(); }); },
  gameplayStop() { this.call(s => { if (s.game.gameplayStop) s.game.gameplayStop(); }); },
  happytime() { this.call(s => { if (s.game.happytime) s.game.happytime(); }); },
  sdkMuted() {
    if (!this.ready || !this.sdk) return false;
    try { return !!(this.sdk.game.settings && this.sdk.game.settings.muteAudio); }
    catch (e) { return false; }
  },
  /* Midgame ad at a natural break. done() is called exactly once,
     immediately when no ad can or should be shown. */
  midgameAd(done) {
    const finish = (() => { let fired = false; return () => { if (!fired) { fired = true; done(); } }; })();
    if (!this.ready || !this.sdk || !this.sdk.ad || !this.sdk.ad.requestAd) { finish(); return; }
    if (performance.now() - this.lastAdAt < 180000) { finish(); return; } // CG cooldown is 3 min
    this.lastAdAt = performance.now();
    adActive = true;
    setAdVeil(true);
    const safety = setTimeout(() => { adActive = false; setAdVeil(false); updateMute(); finish(); }, 6000);
    try {
      this.sdk.ad.requestAd('midgame', {
        adStarted: () => { adActive = true; updateMute(); },
        adFinished: () => { clearTimeout(safety); adActive = false; setAdVeil(false); updateMute(); finish(); },
        adError: () => { clearTimeout(safety); adActive = false; setAdVeil(false); updateMute(); finish(); }
      });
    } catch (e) {
      clearTimeout(safety); adActive = false; setAdVeil(false); updateMute(); finish();
    }
  }
};
let adActive = false;

/* ---------------- audio: all synthesized, no files ---------------- */
let audioCtx = null, masterGain = null, musicGain = null;
let nextChordAt = 0, chordIdx = 0, nextPlinkAt = 0;
const CHORDS = [ // dark neon pad: Dm — Bb — F — A
  [146.83, 220.00, 293.66, 349.23],
  [116.54, 174.61, 233.08, 293.66],
  [174.61, 220.00, 261.63, 349.23],
  [110.00, 164.81, 220.00, 277.18]
];
const PLINKS = [293.66, 349.23, 440.00, 523.25, 587.33];

function ensureAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = effectiveMuted() ? 0 : 0.9;
      masterGain.connect(audioCtx.destination);
      musicGain = audioCtx.createGain();
      musicGain.gain.value = 0.42;
      musicGain.connect(masterGain);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return true;
  } catch (e) { return false; }
}
function effectiveMuted() { return save.muted || CG.sdkMuted() || adActive; }
function updateMute() {
  const btn = document.getElementById('muteBtn');
  if (btn) btn.textContent = effectiveMuted() ? '🔇' : '🔊';
  if (masterGain && audioCtx) {
    masterGain.gain.setTargetAtTime(effectiveMuted() ? 0 : 0.9, audioCtx.currentTime, 0.03);
  }
}
function tone(freq, dur, opts) {
  if (!ensureAudio()) return;
  opts = opts || {};
  try {
    const t0 = audioCtx.currentTime + (opts.delay || 0);
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur);
    const vol = opts.vol || 0.08;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (opts.attack || 0.012));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = g;
    if (opts.lowpass) {
      const f = audioCtx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = opts.lowpass;
      o.connect(f); node = f;
    } else o.connect(g);
    node.connect(opts.music ? musicGain : masterGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  } catch (e) { /* audio is optional */ }
}
function noiseBurst(dur, vol, freq) {
  if (!ensureAudio()) return;
  try {
    const t0 = audioCtx.currentTime;
    const len = Math.max(1, (audioCtx.sampleRate * dur) | 0);
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const f = audioCtx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 800; f.Q.value = 0.8;
    const g = audioCtx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(masterGain);
    src.start(t0);
  } catch (e) { /* optional */ }
}
const sndClick = () => tone(660, 0.05, { type: 'square', vol: 0.03 });
const sndDenied = () => tone(140, 0.18, { type: 'square', vol: 0.06, slideTo: 90 });
const sndUnlock = () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.16, { delay: i * 0.08, type: 'triangle', vol: 0.07 })); };
const sndOrb = combo => tone(500 * (1 + Math.min(combo, 30) * 0.03), 0.07, { type: 'sine', vol: 0.045 });
const sndKill = () => {
  noiseBurst(0.22, 0.1, 1400);
  tone(760, 0.28, { type: 'sawtooth', vol: 0.07, slideTo: 190, lowpass: 1600 });
  [880, 1174, 1568].forEach((f, i) => tone(f, 0.14, { delay: 0.1 + i * 0.06, type: 'triangle', vol: 0.06 }));
};
const sndEaten = () => { // a bot got eaten near you — distant gulp
  tone(300, 0.16, { type: 'sine', vol: 0.03, slideTo: 120 });
};
const sndPhaseOn = () => tone(280, 0.28, { type: 'sine', vol: 0.06, slideTo: 940, attack: 0.04 });
const sndPhaseOff = () => tone(880, 0.2, { type: 'sine', vol: 0.045, slideTo: 260 });
const sndPhaseTick = () => tone(1180 + Math.random() * 240, 0.06, { type: 'sine', vol: 0.016 });
const sndDanger = () => { tone(64, 0.16, { type: 'sine', vol: 0.13 }); tone(58, 0.14, { delay: 0.19, type: 'sine', vol: 0.1 }); };
const sndDeath = () => {
  tone(620, 0.9, { type: 'sawtooth', vol: 0.13, slideTo: 68, lowpass: 1200 });
  tone(466, 0.9, { type: 'sawtooth', vol: 0.1, slideTo: 55, lowpass: 900 });
  noiseBurst(0.5, 0.1, 420);
};
const sndSurge = () => {
  [196, 196, 262].forEach((f, i) => tone(f, 0.3, { delay: i * 0.24, type: 'square', vol: 0.05, lowpass: 900 }));
};
const sndRank1 = () => { [587, 740, 880, 1174].forEach((f, i) => tone(f, 0.18, { delay: i * 0.09, type: 'triangle', vol: 0.07 })); };
/* ambient pad loop — scheduled from the main loop while playing */
function musicUpdate() {
  if (!audioCtx || effectiveMuted()) return;
  const now = audioCtx.currentTime;
  if (state !== 'playing' && state !== 'menu') return;
  if (now >= nextChordAt) {
    nextChordAt = now + 4.4;
    const ch = CHORDS[chordIdx++ % CHORDS.length];
    ch.forEach(f => tone(f, 4.6, { type: 'triangle', vol: 0.028, attack: 1.1, music: true }));
    tone(ch[0] / 2, 4.6, { type: 'sine', vol: 0.032, attack: 1.1, music: true });
  }
  if (now >= nextPlinkAt) {
    nextPlinkAt = now + rand(0.7, 2.4);
    if (Math.random() < 0.55) {
      tone(PLINKS[randi(0, PLINKS.length - 1)], 0.7, { type: 'sine', vol: 0.02, attack: 0.01, music: true });
    }
  }
}

/* ---------------- data ---------------- */
const SKINS = [
  { name: 'Specter', desc: 'The classic arena cyan. Everybody starts somewhere.', main: '#57f7ff', light: '#c8fcff', dark: '#0e7d94', cost: 0 },
  { name: 'Toxic',   desc: 'Radioactive lime. Glows where it should not.',        main: '#9dff3c', light: '#e4ffb0', dark: '#4c8a12', cost: 150 },
  { name: 'Inferno', desc: 'Died angry. Still warm.',                             main: '#ff8a3c', light: '#ffd2a5', dark: '#a03c0e', cost: 300 },
  { name: 'Void',    desc: 'Pulled out of the place between places.',             main: '#b26bff', light: '#e6c8ff', dark: '#5b21a0', cost: 500 },
  { name: 'Solar',   desc: 'A little piece of the sun that refused to set.',      main: '#ffd94d', light: '#fff3b0', dark: '#a87e12', cost: 800 }
];
const TRAILS = [
  { name: 'No Trail',    desc: 'Clean and quiet.',                                        kind: 'none',  cost: 0 },
  { name: 'Sparkles',    desc: 'Leave a little stardust behind you.',                     kind: 'spark', cost: 200 },
  { name: 'Embers',      desc: 'Burning crumbs for whoever is chasing you.',              kind: 'ember', cost: 400 },
  { name: 'Frost',       desc: 'Cold mist off a fresh grave.',                            kind: 'frost', cost: 400 },
  { name: 'Wraith Smoke', desc: 'A tail of dark smoke. Deeply ominous.',                  kind: 'smoke', cost: 650 }
];
const BOT_COLORS = [
  { main: '#ff5d7a', light: '#ffc2cf', dark: '#8f1f36' },
  { main: '#ffa53c', light: '#ffdfae', dark: '#8f5410' },
  { main: '#ffe93c', light: '#fff9b0', dark: '#8f7d10' },
  { main: '#3cff6e', light: '#b0ffd0', dark: '#12853a' },
  { main: '#3ca5ff', light: '#b0dcff', dark: '#12508f' },
  { main: '#c93cff', light: '#efb0ff', dark: '#6d128f' },
  { main: '#ff3cd8', light: '#ffb0f4', dark: '#8f126f' },
  { main: '#3cffe9', light: '#b0fff6', dark: '#0f8577' },
  { main: '#9aa3b8', light: '#e2e7f2', dark: '#4a5266' },
  { main: '#eef2ff', light: '#ffffff', dark: '#7d8aa8' }
];
const BOT_NAMES = [
  'xXShadowByteXx', 'NoScopeNina', 'GraveyardGreg', 'LootGoblin99', 'Vex', 'MoonHowler',
  'PanicPete', 'SirScreams', 'ZeroChill', 'BansheeQueen', 'CryptKeeper_TV', 'DoomNoodle',
  'HexHannah', 'WraithKing', 'SpookySteve', 'Echo', 'NightOwl99', 'GraveRobber',
  'PumpkinHead', 'MistWalker', 'TinyTerror', 'BigHaunt', 'SkeleTom', 'CasperHater',
  'OuijaKid', 'Gravvy', 'Lurk', 'PhantomFaye'
];
const ORB_COLORS = ['#57f7ff', '#ff5df2', '#ffd94d', '#78ff5a', '#b26bff'];

/* ---------------- tuning ---------------- */
const WORLD = 2600;                 // square arena, world units
const START_MASS = 14;
const PHASE_FLOOR = 12;             // phasing cuts out at this size
const ORB_COUNT = 320;
const ORB_MASS = 1.1;
const BOT_COUNT = 24;
const EAT_RATIO = 1.12;             // must be this much bigger (radius) to absorb
const SURGE_EVERY = 50;             // seconds between surges
const radiusOf = m => 9 + Math.sqrt(Math.max(1, m)) * 1.7;
const speedOf = r => 252 * Math.pow(r / radiusOf(START_MASS), -0.16);
const phaseDrain = m => 5 + m * 0.05;   // size burned per second while phasing

/* ---------------- DOM ---------------- */
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const VIEW_W = 960, VIEW_H = 600;
const el = {};
['sizeVal', 'rankVal', 'killVal', 'timeVal', 'board', 'boardList', 'eventMsg', 'phaseBtn',
 'menu', 'custom', 'over', 'paused', 'adveil', 'menuBest', 'customBank', 'customGrid',
 'finalStats', 'runEcto', 'bestLine', 'overTitle', 'startBtn', 'customBtn', 'againBtn',
 'customBackBtn', 'customPlayBtn', 'overMenuBtn', 'resumeBtn', 'pausedMenuBtn', 'pauseBtn', 'muteBtn'
].forEach(id => { el[id] = document.getElementById(id); });

/* ---------------- state ---------------- */
let state = 'boot';           // boot | menu | playing | paused | over
let ghosts = [];              // player is ghosts[0] after a run starts
let player = null;
let orbs = [];
let stones = [];              // gravestone obstacles {x,y,r,ang}
let particles = [];
let wisps = [];
let cam = { x: WORLD / 2, y: WORLD / 2, zoom: 1 };
let elapsed = 0, surgeAt = SURGE_EVERY, wraithAlive = false;
let runOrbs = 0, runKills = 0, peakMass = START_MASS, survived = 0, wasRank1 = false;
let combo = 0, comboT = 0, dangerT = 0, phaseTickT = 0, boardT = 0, hudT = 0;
let sdkPlaying = false;
let eventTimer = null;

function cgStart() { if (!sdkPlaying) { CG.gameplayStart(); sdkPlaying = true; } }
function cgStop() { if (sdkPlaying) { CG.gameplayStop(); sdkPlaying = false; } }
function setAdVeil(on) { el.adveil.classList.toggle('hidden', !on); }
function setEvent(text, dur) {
  el.eventMsg.textContent = text;
  el.eventMsg.style.opacity = '1';
  if (eventTimer) clearTimeout(eventTimer);
  eventTimer = setTimeout(() => { el.eventMsg.style.opacity = '0'; }, (dur || 2.2) * 1000);
}
function fmtTime(s) { const m = Math.floor(s / 60), ss = Math.floor(s % 60); return m + ':' + String(ss).padStart(2, '0'); }

/* ---------------- pre-rendered sprites ---------------- */
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function ghostPath(g, S) {
  // S = sprite box width; sprite is S x S*1.12
  const cx = S / 2, domeRy = S * 0.46, domeCy = S * 0.47, hemY = S * 1.06;
  g.beginPath();
  for (let i = 0; i <= 28; i++) {
    const t = i / 28, ang = Math.PI + t * Math.PI;
    const x = cx + Math.cos(ang) * S * 0.47, y = domeCy + Math.sin(ang) * domeRy;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  for (let i = 1; i <= 56; i++) {
    const t = i / 56;
    const x = S * 0.97 - t * S * 0.94;
    const y = hemY - Math.abs(Math.sin(t * Math.PI * 5)) * S * 0.07;
    g.lineTo(x, y);
  }
  g.closePath();
}
function makeGhostSprite(col) {
  const S = 220, c = makeCanvas(S, S * 1.12), g = c.getContext('2d');
  g.shadowColor = col.main; g.shadowBlur = 26;
  ghostPath(g, S);
  const grad = g.createLinearGradient(0, 0, 0, S * 1.12);
  grad.addColorStop(0, col.light); grad.addColorStop(0.45, col.main); grad.addColorStop(1, col.dark);
  g.fillStyle = grad; g.fill();
  g.shadowBlur = 0;
  ghostPath(g, S); g.fillStyle = grad; g.fill(); // second pass: full-strength body over its own glow
  // top-left sheen
  g.beginPath(); g.ellipse(S * 0.36, S * 0.3, S * 0.16, S * 0.1, -0.5, 0, Math.PI * 2);
  g.fillStyle = 'rgba(255,255,255,0.28)'; g.fill();
  return c;
}
function makeOrbSprite(hex) {
  const S = 64, c = makeCanvas(S, S), g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.25, hex);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, S, S);
  return c;
}
function makeStoneSprite() {
  const S = 168, c = makeCanvas(S, S), g = c.getContext('2d');
  const cx = S / 2;
  g.beginPath(); g.arc(cx, cx, S * 0.46, 0, Math.PI * 2);
  const grad = g.createRadialGradient(cx - 20, cx - 24, 8, cx, cx, S * 0.48);
  grad.addColorStop(0, '#3d4358'); grad.addColorStop(0.75, '#232839'); grad.addColorStop(1, '#141824');
  g.fillStyle = grad; g.fill();
  g.lineWidth = 5; g.strokeStyle = 'rgba(87,247,255,0.35)'; g.stroke();
  g.beginPath(); g.arc(cx, cx, S * 0.36, 0, Math.PI * 2);
  g.lineWidth = 2; g.strokeStyle = 'rgba(178,107,255,0.4)'; g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3;
  for (let i = 0; i < 4; i++) { // cracks
    let x = cx + rand(-40, 40), y = cx + rand(-40, 40);
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 3; j++) { x += rand(-22, 22); y += rand(-10, 18); g.lineTo(x, y); }
    g.stroke();
  }
  // rune ticks
  g.fillStyle = 'rgba(87,247,255,0.5)';
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    g.fillRect(cx + Math.cos(a) * S * 0.36 - 2, cx + Math.sin(a) * S * 0.36 - 2, 4, 4);
  }
  return c;
}
function makeFloorTile() {
  const S = 512, c = makeCanvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#0a0a1e'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${randi(30, 70)},${randi(30, 60)},${randi(60, 110)},${rand(0.05, 0.16)})`;
    g.fillRect(rand(0, S), rand(0, S), rand(1, 3), rand(1, 3));
  }
  g.strokeStyle = 'rgba(52,58,102,0.5)'; g.lineWidth = 2;
  g.strokeRect(1, 1, S - 2, S - 2);
  g.strokeStyle = 'rgba(30,34,66,0.6)';
  g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
  return c;
}
function makeWispSprite() {
  const S = 256, c = makeCanvas(S, S), g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(160,190,235,0.16)');
  grad.addColorStop(1, 'rgba(160,190,235,0)');
  g.fillStyle = grad;
  g.save(); g.translate(S / 2, S / 2); g.scale(1, 0.36); g.translate(-S / 2, -S / 2);
  g.fillRect(0, 0, S, S); g.restore();
  return c;
}
let ghostSprites = {};   // key: main color -> sprite canvas
let orbSprites = [];
let stoneSprite = null, floorPattern = null, wispSprite = null;
function spriteFor(col) {
  if (!ghostSprites[col.main]) ghostSprites[col.main] = makeGhostSprite(col);
  return ghostSprites[col.main];
}
function buildSprites() {
  SKINS.forEach(s => spriteFor(s));
  BOT_COLORS.forEach(c => spriteFor(c));
  spriteFor({ main: '#8a5cff', light: '#d9c8ff', dark: '#341073' }); // wraith
  orbSprites = ORB_COLORS.map(makeOrbSprite);
  stoneSprite = makeStoneSprite();
  floorPattern = ctx.createPattern(makeFloorTile(), 'repeat');
  wispSprite = makeWispSprite();
}

/* ---------------- world ---------------- */
function freeSpot(minEdge) {
  for (let tries = 0; tries < 40; tries++) {
    const x = rand(minEdge, WORLD - minEdge), y = rand(minEdge, WORLD - minEdge);
    let ok = true;
    for (const s of stones) if (dist2(x, y, s.x, s.y) < (s.r + 60) * (s.r + 60)) { ok = false; break; }
    if (ok) return { x, y };
  }
  return { x: rand(minEdge, WORLD - minEdge), y: rand(minEdge, WORLD - minEdge) };
}
function makeGhost(name, col, mass, bot, x, y) {
  return {
    name, col, bot: !!bot, x, y, vx: 0, vy: 0,
    mass, r: radiusOf(mass), phase: false, wantPhase: false, phaseCd: 0, phaseMax: 0,
    thinkT: rand(0, 0.15), tx: x, ty: y, seed: rand(0, Math.PI * 2),
    lookX: 1, lookY: 0,
    dead: false, gone: false, noRespawn: false, respawnT: 0, emitT: rand(0, 0.05), nerve: rand(0.35, 1),
    wraith: false
  };
}
function spawnOrb(o) {
  const p = freeSpot(40);
  o.x = p.x; o.y = p.y; o.c = randi(0, ORB_COLORS.length - 1);
  o.active = true; o.respawnT = 0; o.pulse = rand(0, Math.PI * 2);
  return o;
}
function buildWorld() {
  stones = [];
  const nStones = 14;
  for (let i = 0; i < nStones; i++) {
    const p = freeSpot(180);
    stones.push({ x: p.x, y: p.y, r: rand(26, 46), ang: rand(0, Math.PI * 2) });
  }
  orbs = [];
  for (let i = 0; i < ORB_COUNT; i++) orbs.push(spawnOrb({}));
  wisps = [];
  for (let i = 0; i < 10; i++) {
    wisps.push({ x: rand(0, WORLD), y: rand(0, WORLD), vx: rand(-9, 9), vy: rand(-4, 4), s: rand(380, 760) });
  }
  ghosts = [];
  const names = BOT_NAMES.slice();
  for (let i = 0; i < BOT_COUNT; i++) {
    const p = freeSpot(120);
    const nm = names.splice(randi(0, names.length - 1), 1)[0];
    ghosts.push(makeGhost(nm, BOT_COLORS[i % BOT_COLORS.length], rand(12, 46), true, p.x, p.y));
  }
}
function spawnPlayer() {
  const p = freeSpot(200);
  player = makeGhost('YOU', SKINS[save.skin], START_MASS, false, p.x, p.y);
  player.col = SKINS[save.skin];
  ghosts.unshift(player);
  cam.x = player.x; cam.y = player.y;
}

/* ---------------- bot AI ----------------
   Every ~0.15 s a bot picks a steering target:
   flee a bigger ghost > chase a smaller ghost > drift to orbs.
   Bots with nerve will PHASE to escape when a threat is close —
   and pay the same size burn the player does. */
function botThink(b, dt) {
  b.thinkT -= dt;
  if (b.thinkT > 0) return;
  b.thinkT = 0.15;
  let threat = null, threatD = 1e12, prey = null, preyD = 1e12;
  for (const g of ghosts) {
    if (g === b || g.dead) continue;
    const d = dist2(b.x, b.y, g.x, g.y);
    if (g.r > b.r * EAT_RATIO && d < threatD) { threat = g; threatD = d; }
    else if (b.r > g.r * EAT_RATIO && d < preyD) { prey = g; preyD = d; }
  }
  const fleeing = threat && threatD < 340 * 340;
  if (fleeing) {
    const dx = b.x - threat.x, dy = b.y - threat.y, m = Math.hypot(dx, dy) || 1;
    b.tx = b.x + dx / m * 420; b.ty = b.y + dy / m * 420;
    // phase escape: close threat + enough size to burn + nerve
    if (threatD < 190 * 190 && b.mass > 30 && b.phaseCd <= 0 && Math.random() < b.nerve) {
      b.wantPhase = true; b.phaseMax = rand(0.7, 1.5);
    }
  } else if (prey && preyD < 400 * 400) {
    b.tx = prey.x; b.ty = prey.y;
  } else {
    // drift toward the richest nearby orb cluster (sample a few orbs)
    let best = null, bestScore = -1;
    for (let k = 0; k < 7; k++) {
      const o = orbs[randi(0, orbs.length - 1)];
      if (!o || !o.active) continue;
      const d = dist2(b.x, b.y, o.x, o.y);
      if (d < 700 * 700) { const sc = 1e12 - d; if (sc > bestScore) { bestScore = sc; best = o; } }
    }
    if (best) { b.tx = best.x; b.ty = best.y; }
    else if (dist2(b.x, b.y, b.tx, b.ty) < 60 * 60) { b.tx = rand(120, WORLD - 120); b.ty = rand(120, WORLD - 120); }
  }
  // keep targets inside the arena
  b.tx = clamp(b.tx, 50, WORLD - 50); b.ty = clamp(b.ty, 50, WORLD - 50);
}

/* ---------------- particles ---------------- */
function spawnP(x, y, o) {
  if (particles.length > 520) return;
  particles.push({
    x, y, vx: o.vx || 0, vy: o.vy || 0,
    life: o.life || 0.5, max: o.life || 0.5,
    size: o.size || 3, color: o.color || '#ffffff',
    grow: o.grow || 0, drag: o.drag || 1
  });
}
function burst(x, y, color, n, spd, life, size) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), v = rand(spd * 0.3, spd);
    spawnP(x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(life * 0.5, life), size: rand(size * 0.5, size * 1.4), color, drag: 2.4 });
  }
}
function trailParticle(g) {
  const back = { x: g.x - g.lookX * g.r * 0.8, y: g.y - g.lookY * g.r * 0.8 };
  if (!g.bot) {
    const kind = TRAILS[save.trail].kind, col = SKINS[save.skin];
    if (kind === 'spark') spawnP(back.x, back.y, { vx: rand(-14, 14), vy: rand(-14, 14), life: rand(0.35, 0.6), size: rand(1.6, 3.2), color: '#dffcff' });
    else if (kind === 'ember') spawnP(back.x, back.y, { vx: rand(-10, 10), vy: rand(-46, -18), life: rand(0.4, 0.75), size: rand(1.8, 3.6), color: Math.random() < 0.5 ? '#ffb03c' : '#ff6a3c' });
    else if (kind === 'frost') spawnP(back.x, back.y, { vx: rand(-8, 8), vy: rand(4, 20), life: rand(0.6, 1), size: rand(2.4, 4.4), color: '#bfe8ff' });
    else if (kind === 'smoke') spawnP(back.x, back.y, { vx: rand(-8, 8), vy: rand(-14, -2), life: rand(0.7, 1.1), size: rand(4, 7), color: '#4d4266', grow: 9 });
    else return; // 'none'
  } else {
    spawnP(back.x, back.y, { vx: 0, vy: 0, life: 0.34, size: rand(1.6, 3), color: g.col.main });
  }
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    const d = Math.max(0, 1 - p.drag * dt);
    p.vx *= d; p.vy *= d;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.size += p.grow * dt;
  }
}

/* ---------------- movement & phasing ---------------- */
function moveGhost(g, dt, dirx, diry) {
  const len = Math.hypot(dirx, diry);
  let dvx = 0, dvy = 0;
  if (len > 0.01) {
    const spd = speedOf(g.r) * (g.phase ? 1.3 : 1) * (g.bot ? 0.97 : 1);
    dvx = dirx / len * spd; dvy = diry / len * spd;
    g.lookX = dirx / len; g.lookY = diry / len;
  }
  const k = Math.min(1, dt * 7);
  g.vx += (dvx - g.vx) * k; g.vy += (dvy - g.vy) * k;
  g.x += g.vx * dt; g.y += g.vy * dt;
  // arena boundary is warded — nobody phases out of the arena
  const m = g.r * 0.35;
  if (g.x < m) { g.x = m; g.vx = Math.max(0, g.vx); }
  if (g.x > WORLD - m) { g.x = WORLD - m; g.vx = Math.min(0, g.vx); }
  if (g.y < m) { g.y = m; g.vy = Math.max(0, g.vy); }
  if (g.y > WORLD - m) { g.y = WORLD - m; g.vy = Math.min(0, g.vy); }
  // gravestones are solid — unless you're phasing
  if (!g.phase) {
    for (const s of stones) {
      const rr = g.r * 0.72 + s.r;
      const d2v = dist2(g.x, g.y, s.x, s.y);
      if (d2v < rr * rr && d2v > 0.01) {
        const d = Math.sqrt(d2v), nx = (g.x - s.x) / d, ny = (g.y - s.y) / d;
        g.x = s.x + nx * rr; g.y = s.y + ny * rr;
        const vn = g.vx * nx + g.vy * ny;
        if (vn < 0) { g.vx -= vn * nx; g.vy -= vn * ny; }
      }
    }
  }
  // trail emission while moving
  g.emitT -= dt;
  const speed = Math.hypot(g.vx, g.vy);
  if (speed > 34 && g.emitT <= 0) {
    g.emitT = g.bot ? 0.07 : 0.03;
    trailParticle(g);
  }
}
function applyPhase(g, dt, want) {
  const active = want && g.mass > PHASE_FLOOR + 0.4;
  if (active && !g.phase) { g.phase = true; if (g === player) sndPhaseOn(); }
  if (!active && g.phase) { g.phase = false; if (g === player) sndPhaseOff(); }
  if (g.phase) {
    g.mass = Math.max(PHASE_FLOOR, g.mass - phaseDrain(g.mass) * dt);
    g.r = radiusOf(g.mass);
    if (g.mass <= PHASE_FLOOR + 0.01) {
      g.phase = false;
      if (g === player) sndPhaseOff();
      if (g.bot) g.phaseCd = 2;
    }
  }
}

/* ---------------- eating & absorbing ---------------- */
function eatOrbs(dt) {
  for (const o of orbs) {
    if (!o.active) {
      o.respawnT -= dt;
      if (o.respawnT <= 0) spawnOrb(o);
    }
  }
  for (const g of ghosts) {
    if (g.dead || g.phase) continue; // the incorporeal can't eat
    let grew = false;
    for (const o of orbs) {
      if (!o.active) continue;
      const rr = g.r + 7;
      if (dist2(g.x, g.y, o.x, o.y) < rr * rr) {
        o.active = false; o.respawnT = rand(0.8, 2.6);
        g.mass += ORB_MASS; grew = true;
        if (g === player) {
          runOrbs++; combo++; comboT = 1.2; sndOrb(combo);
          burst(o.x, o.y, ORB_COLORS[o.c], 3, 60, 0.3, 2);
        }
      }
    }
    if (grew) g.r = radiusOf(g.mass);
  }
}
function absorbStep() {
  for (let i = 0; i < ghosts.length; i++) {
    const a = ghosts[i];
    if (a.dead) continue;
    for (let j = i + 1; j < ghosts.length; j++) {
      const b = ghosts[j];
      if (b.dead || a.phase || b.phase) continue;
      const big = a.r >= b.r ? a : b, small = big === a ? b : a;
      if (big.r <= small.r * EAT_RATIO) continue;
      const rr = big.r - small.r * 0.3;
      if (dist2(big.x, big.y, small.x, small.y) < rr * rr) {
        big.mass += small.mass * 0.55;
        big.r = radiusOf(big.mass);
        burst(small.x, small.y, small.col.main, 18, 190, 0.6, 3.4);
        if (small.wraith) { wraithAlive = false; small.noRespawn = true; }
        if (small === player) { playerDied(big); return; }
        if (big === player) { runKills++; sndKill(); }
        else if (player && dist2(big.x, big.y, player.x, player.y) < 700 * 700) sndEaten();
        small.dead = true; small.respawnT = 2.5;
      }
    }
  }
}

/* ---------------- surges & the Dread Wraith ---------------- */
const WRAITH_COL = { main: '#8a5cff', light: '#d9c8ff', dark: '#341073' };
function doSurge() {
  surgeAt += SURGE_EVERY;
  sndSurge();
  const c = freeSpot(320);
  let placed = 0;
  for (const o of orbs) {
    if (placed >= 46) break;
    const a = rand(0, Math.PI * 2), rr = rand(50, 270);
    o.x = clamp(c.x + Math.cos(a) * rr, 30, WORLD - 30);
    o.y = clamp(c.y + Math.sin(a) * rr, 30, WORLD - 30);
    o.active = true; placed++;
  }
  if (elapsed >= 40 && !wraithAlive && player) {
    const p = freeSpot(150);
    const w = makeGhost('DreadWraith', WRAITH_COL, Math.max(170, player.mass * 1.7), true, p.x, p.y);
    w.wraith = true; w.nerve = 0.15;
    ghosts.push(w);
    wraithAlive = true;
    setEvent('⚠ SURGE — THE DREAD WRAITH STIRS', 2.6);
  } else {
    setEvent('⚠ SURGE — ORB STORM', 2.2);
  }
}

/* ---------------- death ---------------- */
function playerDied(killer) {
  if (!player || player.dead) return;
  player.dead = true;
  burst(player.x, player.y, player.col.main, 42, 300, 0.9, 4);
  sndDeath();
  state = 'over';
  cgStop();
  const score = Math.floor(peakMass * 10 + runKills * 150 + survived * 5 + runOrbs * 2);
  const ecto = runOrbs + runKills * 5;
  save.bank += ecto;
  if (score > save.best) save.best = score;
  persist();
  ghosts = ghosts.filter(g => g !== player);
  el.board.classList.add('hidden');
  el.phaseBtn.classList.add('hidden');
  el.overTitle.textContent = killer.wraith ? 'The Dread Wraith Got You!' : killer.name + ' ate you!';
  el.finalStats.textContent = `Peak size ${Math.floor(peakMass)} · 💀 ${runKills} eaten · ⏱ ${fmtTime(survived)} · Score ${score}`;
  el.runEcto.textContent = `Banked ✦ ${ecto} — spend them in Ghosts & Trails. They never expire.`;
  el.bestLine.textContent = `Best run: ${save.best} pts · Bank: ✦ ${save.bank}`;
  // Midgame ad at the natural break: death -> restart screen.
  CG.midgameAd(() => { el.over.classList.remove('hidden'); });
}

/* ---------------- ranks / HUD / leaderboard ---------------- */
let rank1Ghost = null, playerRank = 0, threat01 = 0;
function computeRanks() {
  const alive = ghosts.filter(g => !g.dead).sort((a, b) => b.mass - a.mass);
  rank1Ghost = alive[0] || null;
  playerRank = player ? alive.indexOf(player) + 1 : 0;
  return alive;
}
function buildBoard() {
  const alive = computeRanks();
  const rows = [];
  const top = alive.slice(0, 8);
  const mk = g => {
    const li = document.createElement('li');
    if (g === player) li.className = 'me';
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = g.col.main;
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = (g.wraith ? '👑 ' : '') + g.name;
    const ms = document.createElement('span'); ms.textContent = Math.floor(g.mass);
    li.appendChild(dot); li.appendChild(nm); li.appendChild(ms);
    return li;
  };
  top.forEach(g => rows.push(mk(g)));
  if (player && playerRank > 8) rows.push(mk(player));
  el.boardList.innerHTML = '';
  rows.forEach(r => el.boardList.appendChild(r));
}
function refreshHUD() {
  if (player) {
    el.sizeVal.textContent = Math.floor(player.mass);
    el.sizeVal.classList.toggle('phasing', !!player.phase);
  }
  el.rankVal.textContent = playerRank > 0 ? '#' + playerRank : '#–';
  el.killVal.textContent = runKills;
  el.timeVal.textContent = fmtTime(survived);
}

/* ---------------- main update ---------------- */
function update(dt) {
  elapsed += dt; survived = elapsed;
  if (elapsed >= surgeAt) doSurge();
  if (comboT > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }

  for (const g of ghosts) {
    if (g.dead) {
      if (g.bot) {
        g.respawnT -= dt;
        if (g.respawnT <= 0) {
          if (g.noRespawn) { g.gone = true; continue; }
          const p = freeSpot(120);
          g.x = p.x; g.y = p.y; g.vx = g.vy = 0;
          g.mass = 12 + rand(0, 30) + Math.min(60, elapsed * 0.55);
          g.r = radiusOf(g.mass); g.dead = false; g.phase = false;
        }
      }
      continue;
    }
    if (g.bot) {
      botThink(g, dt);
      g.phaseCd = Math.max(0, g.phaseCd - dt);
      if (g.wantPhase) {
        g.phaseMax -= dt;
        if (g.phaseMax <= 0) { g.wantPhase = false; g.phaseCd = 2; }
      }
      applyPhase(g, dt, !!g.wantPhase);
      moveGhost(g, dt, g.tx - g.x, g.ty - g.y);
    }
  }
  ghosts = ghosts.filter(g => !g.gone);
  if (player && !player.dead) {
    const d = playerDir();
    applyPhase(player, dt, inputPhaseHeld());
    moveGhost(player, dt, d.x, d.y);
    if (player.mass > peakMass) peakMass = player.mass;
    // phase shimmer sound
    if (player.phase) { phaseTickT -= dt; if (phaseTickT <= 0) { phaseTickT = 0.22; sndPhaseTick(); } }
    // danger sense: nearest bigger ghost
    let nd = 1e12;
    for (const g of ghosts) {
      if (g === player || g.dead) continue;
      if (g.r > player.r * EAT_RATIO) nd = Math.min(nd, dist2(player.x, player.y, g.x, g.y));
    }
    threat01 = nd < 300 * 300 ? 1 - Math.sqrt(nd) / 300 : 0;
    if (threat01 > 0.45) { dangerT -= dt; if (dangerT <= 0) { dangerT = 0.85; sndDanger(); } }
    // reaching #1
    computeRanks();
    if (playerRank === 1 && !wasRank1) { wasRank1 = true; sndRank1(); setEvent('👑 YOU RULE THE ARENA', 2); CG.happytime(); }
    if (playerRank > 1) wasRank1 = wasRank1 && playerRank === 1;
  }

  eatOrbs(dt);
  absorbStep();
  updateParticles(dt);
  for (const w of wisps) {
    w.x += w.vx * dt; w.y += w.vy * dt;
    if (w.x < -200) w.x = WORLD + 200; if (w.x > WORLD + 200) w.x = -200;
    if (w.y < -200) w.y = WORLD + 200; if (w.y > WORLD + 200) w.y = -200;
  }

  // camera follows, zoom eases out as you grow
  if (player) {
    const k = Math.min(1, dt * 5);
    cam.x += (player.x - cam.x) * k; cam.y += (player.y - cam.y) * k;
    const tz = clamp(Math.pow(radiusOf(START_MASS) / player.r, 0.28), 0.52, 1.12);
    cam.zoom += (tz - cam.zoom) * Math.min(1, dt * 2.5);
    const hw = VIEW_W / 2 / cam.zoom, hh = VIEW_H / 2 / cam.zoom;
    cam.x = clamp(cam.x, hw - 340, WORLD - hw + 340);
    cam.y = clamp(cam.y, hh - 340, WORLD - hh + 340);
  }

  boardT -= dt;
  if (boardT <= 0) { boardT = 0.25; buildBoard(); }
  hudT -= dt;
  if (hudT <= 0) { hudT = 0.1; refreshHUD(); }
}
/* menu backdrop: bots drift and snack, nobody dies */
function updateAmbient(dt, now) {
  for (const g of ghosts) {
    if (g.dead) continue;
    botThink(g, dt);
    moveGhost(g, dt, g.tx - g.x, g.ty - g.y);
  }
  for (const o of orbs) {
    if (!o.active) { o.respawnT -= dt; if (o.respawnT <= 0) spawnOrb(o); continue; }
    for (const g of ghosts) {
      if (g.phase) continue;
      const rr = g.r + 7;
      if (dist2(g.x, g.y, o.x, o.y) < rr * rr) { o.active = false; o.respawnT = rand(0.8, 2.6); g.mass += ORB_MASS; g.r = radiusOf(g.mass); break; }
    }
  }
  updateParticles(dt);
  for (const w of wisps) { w.x += w.vx * dt; w.y += w.vy * dt; }
  cam.x = WORLD / 2 + Math.cos(now * 0.00004) * 380;
  cam.y = WORLD / 2 + Math.sin(now * 0.000055) * 380;
  cam.zoom += (0.62 - cam.zoom) * Math.min(1, dt * 2);
}

/* ---------------- render ---------------- */
const STARS = [];
for (let i = 0; i < 120; i++) STARS.push({ x: rand(0, VIEW_W), y: rand(0, VIEW_H), r: rand(0.6, 1.9), tw: rand(0, 7) });
function drawGhostShape(g, now) {
  const spr = spriteFor(g.col);
  const bob = Math.sin(now * 0.0024 + g.seed) * g.r * 0.05;
  const w = g.r * 2.35, h = w * 1.12;
  ctx.beginPath();
  ctx.ellipse(g.x, g.y + g.r * 1.02, g.r * 0.85, g.r * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
  ctx.save();
  ctx.translate(g.x, g.y + bob);
  ctx.rotate(clamp(g.vx * 0.00045, -0.1, 0.1));
  if (g.phase) ctx.globalAlpha = 0.45;
  ctx.drawImage(spr, -w / 2, -h / 2 - g.r * 0.14, w, h);
  ctx.restore();
  if (g.phase) {
    ctx.beginPath();
    ctx.arc(g.x, g.y + bob, g.r * (1.32 + 0.08 * Math.sin(now * 0.012 + g.seed)), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(140,250,255,0.55)'; ctx.lineWidth = 2; ctx.stroke();
  }
  // eyes — white glow ovals, pupils tracking travel direction
  const ey = g.y + bob - g.r * 0.16, ex = g.r * 0.34;
  const erx = Math.max(2.4, g.r * 0.155), ery = Math.max(3, g.r * 0.2);
  const menacing = g.bot && player && !player.dead && g.r > player.r * EAT_RATIO;
  for (const sgn of [-1, 1]) {
    const exx = g.x + sgn * ex;
    ctx.beginPath(); ctx.ellipse(exx, ey, erx, ery, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(244,254,255,0.96)'; ctx.fill();
    const px = exx + g.lookX * erx * 0.42, py = ey + g.lookY * ery * 0.42;
    ctx.beginPath(); ctx.arc(px, py, Math.max(1.4, erx * 0.48), 0, Math.PI * 2);
    ctx.fillStyle = '#0a1420'; ctx.fill();
    if (menacing || g === player) { // fierce brows, slanted down toward the middle
      ctx.beginPath();
      ctx.moveTo(exx - sgn * erx * 1.3, ey - ery * 1.7);
      ctx.lineTo(exx + sgn * erx * 1.3, ey - ery * 1.05);
      ctx.strokeStyle = 'rgba(6,16,26,0.85)'; ctx.lineWidth = Math.max(2, g.r * 0.07); ctx.stroke();
    }
  }
  // crown for the arena's current #1 (and the Wraith always looks royal)
  if (g === rank1Ghost || g.wraith) {
    const cw = g.r * 0.9, chh = g.r * 0.42, cxp = g.x - cw / 2, cyp = g.y + bob - g.r * 1.32;
    ctx.beginPath();
    ctx.moveTo(cxp, cyp + chh);
    ctx.lineTo(cxp, cyp + chh * 0.3); ctx.lineTo(cxp + cw * 0.25, cyp + chh * 0.75);
    ctx.lineTo(cxp + cw * 0.5, cyp); ctx.lineTo(cxp + cw * 0.75, cyp + chh * 0.75);
    ctx.lineTo(cxp + cw, cyp + chh * 0.3); ctx.lineTo(cxp + cw, cyp + chh);
    ctx.closePath();
    ctx.fillStyle = '#ffd94d'; ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,0,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  if (g.bot) {
    ctx.font = `bold ${clamp(g.r * 0.44, 11, 22)}px "Trebuchet MS", sans-serif`;
    ctx.textAlign = 'center';
    const ly = g.y - g.r * ((g === rank1Ghost || g.wraith) ? 1.5 : 1.24);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText(g.name, g.x, ly);
    ctx.fillStyle = g.wraith ? '#ffd94d' : 'rgba(240,248,255,0.92)';
    ctx.fillText(g.name, g.x, ly);
  }
}
function render(now) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#03030a';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // parallax starfield in the void outside the arena
  for (const s of STARS) {
    const sx = ((s.x - cam.x * 0.04) % VIEW_W + VIEW_W) % VIEW_W;
    const sy = ((s.y - cam.y * 0.04) % VIEW_H + VIEW_H) % VIEW_H;
    ctx.globalAlpha = 0.35 + 0.3 * Math.sin(now * 0.001 + s.tw);
    ctx.fillStyle = '#cfe0ff';
    ctx.fillRect(sx, sy, s.r, s.r);
  }
  ctx.globalAlpha = 1;
  const z = cam.zoom;
  ctx.setTransform(z, 0, 0, z, VIEW_W / 2 - cam.x * z, VIEW_H / 2 - cam.y * z);
  const vx0 = cam.x - VIEW_W / 2 / z - 90, vx1 = cam.x + VIEW_W / 2 / z + 90;
  const vy0 = cam.y - VIEW_H / 2 / z - 90, vy1 = cam.y + VIEW_H / 2 / z + 90;
  // floor
  ctx.fillStyle = floorPattern || '#0a0a1e';
  ctx.fillRect(0, 0, WORLD, WORLD);
  // centre sigil
  ctx.beginPath(); ctx.arc(WORLD / 2, WORLD / 2, 210, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(87,247,255,0.13)'; ctx.lineWidth = 5; ctx.stroke();
  ctx.beginPath(); ctx.arc(WORLD / 2, WORLD / 2, 150, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,93,242,0.11)'; ctx.lineWidth = 3; ctx.stroke();
  // wisps
  for (const w of wisps) ctx.drawImage(wispSprite, w.x - w.s / 2, w.y - w.s / 2, w.s, w.s);
  // orbs (culled)
  for (const o of orbs) {
    if (!o.active || o.x < vx0 || o.x > vx1 || o.y < vy0 || o.y > vy1) continue;
    const s = 17 * (1 + 0.16 * Math.sin(now * 0.004 + o.pulse));
    ctx.drawImage(orbSprites[o.c], o.x - s / 2, o.y - s / 2, s, s);
  }
  // gravestones
  for (const s of stones) {
    if (s.x < vx0 - 60 || s.x > vx1 + 60 || s.y < vy0 - 60 || s.y > vy1 + 60) continue;
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(s.ang);
    ctx.drawImage(stoneSprite, -s.r * 1.1, -s.r * 1.1, s.r * 2.2, s.r * 2.2);
    ctx.restore();
  }
  // particles (under ghosts)
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1) * 0.85;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.4, p.size), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // ghosts — small first so the big ones loom over them
  const sorted = ghosts.filter(g => !g.dead).sort((a, b) => a.r - b.r);
  for (const g of sorted) {
    if (g.x < vx0 - 80 || g.x > vx1 + 80 || g.y < vy0 - 80 || g.y > vy1 + 80) continue;
    drawGhostShape(g, now);
  }
  // warded boundary
  ctx.strokeStyle = 'rgba(87,247,255,0.85)'; ctx.lineWidth = 7;
  ctx.shadowColor = '#57f7ff'; ctx.shadowBlur = 22;
  ctx.strokeRect(0, 0, WORLD, WORLD);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,93,242,0.4)'; ctx.lineWidth = 2;
  ctx.strokeRect(14, 14, WORLD - 28, WORLD - 28);
  // screen space: minimap + danger vignette
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawMinimap();
  if (state === 'playing' && threat01 > 0.02) {
    const pulse = 0.75 + 0.25 * Math.sin(now * 0.012);
    const grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.78);
    grad.addColorStop(0, 'rgba(255,45,70,0)');
    grad.addColorStop(1, `rgba(255,45,70,${(0.3 * threat01 * pulse).toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}
function drawMinimap() {
  const S = 124, x0 = 12, y0 = VIEW_H - S - 12, sc = S / WORLD;
  ctx.fillStyle = 'rgba(6,8,22,0.62)';
  ctx.fillRect(x0, y0, S, S);
  ctx.strokeStyle = 'rgba(87,247,255,0.35)'; ctx.lineWidth = 1;
  ctx.strokeRect(x0, y0, S, S);
  // current view box
  const hw = VIEW_W / 2 / cam.zoom, hh = VIEW_H / 2 / cam.zoom;
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.strokeRect(x0 + (cam.x - hw) * sc, y0 + (cam.y - hh) * sc, hw * 2 * sc, hh * 2 * sc);
  for (const g of ghosts) {
    if (g.dead) continue;
    ctx.fillStyle = g === player ? '#ffffff' : g.col.main;
    ctx.beginPath();
    ctx.arc(x0 + g.x * sc, y0 + g.y * sc, g === player ? 3.4 : (g.wraith ? 3.2 : 2.2), 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ---------------- input ---------------- */
const keys = {};
const input = {
  mouseX: VIEW_W / 2, mouseY: VIEW_H / 2, mouseSeen: false, mouseDown: false,
  space: false, touchPhase: false,
  dragId: null, dragSX: 0, dragSY: 0, dragX: 0, dragY: 0
};
function inputPhaseHeld() { return input.space || input.mouseDown || input.touchPhase; }
function playerDir() {
  let dx = 0, dy = 0;
  if (keys['KeyW'] || keys['ArrowUp']) dy -= 1;
  if (keys['KeyS'] || keys['ArrowDown']) dy += 1;
  if (keys['KeyA'] || keys['ArrowLeft']) dx -= 1;
  if (keys['KeyD'] || keys['ArrowRight']) dx += 1;
  if (dx || dy) return { x: dx, y: dy };
  if (input.dragId !== null) {
    const vx = input.dragX - input.dragSX, vy = input.dragY - input.dragSY;
    const l = Math.hypot(vx, vy);
    return l > 14 ? { x: vx / l, y: vy / l } : { x: 0, y: 0 };
  }
  if (input.mouseSeen && player) {
    const wx = cam.x + (input.mouseX - VIEW_W / 2) / cam.zoom;
    const wy = cam.y + (input.mouseY - VIEW_H / 2) / cam.zoom;
    const vx = wx - player.x, vy = wy - player.y;
    const l = Math.hypot(vx, vy);
    if (l > 10) return { x: vx / l, y: vy / l };
  }
  return { x: 0, y: 0 };
}
function toView(e) {
  const rect = cv.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (VIEW_W / Math.max(1, rect.width)),
    y: (e.clientY - rect.top) * (VIEW_H / Math.max(1, rect.height))
  };
}
cv.addEventListener('pointermove', e => {
  const p = toView(e);
  if (e.pointerType === 'touch') {
    if (input.dragId === e.pointerId) { input.dragX = p.x; input.dragY = p.y; }
  } else { input.mouseX = p.x; input.mouseY = p.y; input.mouseSeen = true; }
});
cv.addEventListener('pointerdown', e => {
  ensureAudio();
  const p = toView(e);
  if (e.pointerType === 'touch') {
    input.dragId = e.pointerId; input.dragSX = input.dragX = p.x; input.dragSY = input.dragY = p.y;
  } else {
    input.mouseX = p.x; input.mouseY = p.y; input.mouseSeen = true; input.mouseDown = true;
  }
});
function pointerEnd(e) {
  if (e.pointerType === 'touch') { if (input.dragId === e.pointerId) input.dragId = null; }
  else input.mouseDown = false;
}
cv.addEventListener('pointerup', pointerEnd);
cv.addEventListener('pointercancel', pointerEnd);
cv.addEventListener('contextmenu', e => e.preventDefault());
el.phaseBtn.addEventListener('pointerdown', e => { e.preventDefault(); ensureAudio(); input.touchPhase = true; el.phaseBtn.classList.add('on'); });
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
  el.phaseBtn.addEventListener(ev, () => { input.touchPhase = false; el.phaseBtn.classList.remove('on'); }));
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  ensureAudio();
  if (e.code === 'Space') { input.space = true; e.preventDefault(); }
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (state === 'playing') pauseGame(false);
    else if (state === 'paused') resumeGame();
  }
  if (e.code === 'Enter') {
    if (state === 'menu') startRun();
    else if (state === 'over' && !el.over.classList.contains('hidden')) startRun();
  }
});
window.addEventListener('keyup', e => {
  keys[e.code] = false;
  if (e.code === 'Space') input.space = false;
});
window.addEventListener('pointerdown', () => ensureAudio(), { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') {
    // Auto-pause is deliberately silent on the SDK side (docs: no
    // gameplay events on focus loss). Manual pause does cgStop().
    state = 'paused';
    el.paused.classList.remove('hidden');
  }
});

/* ---------------- run control ---------------- */
function hideOverlays() {
  [el.menu, el.custom, el.over, el.paused].forEach(o => o.classList.add('hidden'));
}
function refreshMenuBest() {
  el.menuBest.textContent = save.best > 0
    ? `Best run: ${save.best} pts · Bank: ✦ ${save.bank}`
    : 'No runs yet. The arena is waiting.';
}
function startRun() {
  buildWorld();
  spawnPlayer();
  elapsed = 0; survived = 0; surgeAt = SURGE_EVERY; wraithAlive = false;
  runOrbs = 0; runKills = 0; peakMass = START_MASS; wasRank1 = false;
  combo = 0; comboT = 0; threat01 = 0;
  particles = [];
  hideOverlays();
  el.board.classList.remove('hidden');
  el.phaseBtn.classList.remove('hidden');
  state = 'playing';
  cgStop(); cgStart();
  buildBoard(); refreshHUD();
  setEvent('EAT THE LIGHT!', 1.6);
}
function pauseGame(silent) {
  if (state !== 'playing') return;
  state = 'paused';
  if (!silent) cgStop();
  el.paused.classList.remove('hidden');
}
function resumeGame() {
  if (state !== 'paused') return;
  el.paused.classList.add('hidden');
  state = 'playing';
  cgStart();
}
function toMenu() {
  state = 'menu';
  cgStop();
  if (player) { ghosts = ghosts.filter(g => g !== player); player = null; }
  hideOverlays();
  el.menu.classList.remove('hidden');
  el.board.classList.add('hidden');
  el.phaseBtn.classList.add('hidden');
  refreshMenuBest();
}

/* ---------------- customize (skins & trails) ---------------- */
const TRAIL_SWATCH = { none: '#2a3352', spark: '#cfefff', ember: '#ff9a3c', frost: '#bfe8ff', smoke: '#8a7f9e' };
function shopRow(kindLabel, item, owned, selected, bank, onBuy, onEquip) {
  const row = document.createElement('div');
  row.className = 'shopitem';
  const sw = document.createElement('div');
  sw.className = 'swatch';
  if (kindLabel === 'GHOSTS') { sw.style.background = item.main; sw.style.color = item.main; }
  else { sw.style.background = TRAIL_SWATCH[item.kind]; sw.style.color = TRAIL_SWATCH[item.kind]; }
  const info = document.createElement('div');
  info.className = 'info';
  const b = document.createElement('b'); b.textContent = item.name;
  const d = document.createElement('div'); d.textContent = item.desc;
  info.appendChild(b); info.appendChild(d);
  const btn = document.createElement('button');
  btn.className = 'buybtn' + (selected ? ' selected' : '');
  if (selected) { btn.textContent = 'Equipped ✓'; btn.disabled = true; }
  else if (owned) { btn.textContent = 'Equip'; btn.addEventListener('click', () => { ensureAudio(); sndClick(); onEquip(); }); }
  else {
    btn.textContent = '✦ ' + item.cost;
    btn.disabled = bank < item.cost;
    btn.addEventListener('click', () => {
      ensureAudio();
      if (save.bank >= item.cost) { save.bank -= item.cost; sndUnlock(); onBuy(); }
      else sndDenied();
    });
  }
  row.appendChild(sw); row.appendChild(info); row.appendChild(btn);
  return row;
}
function buildCustom() {
  el.customBank.textContent = save.bank;
  el.customGrid.innerHTML = '';
  const head1 = document.createElement('div'); head1.className = 'shophead'; head1.textContent = 'GHOSTS';
  el.customGrid.appendChild(head1);
  SKINS.forEach((s, i) => {
    el.customGrid.appendChild(shopRow('GHOSTS', s, save.ownedSkins[i], save.skin === i, save.bank,
      () => { save.ownedSkins[i] = true; save.skin = i; persist(); if (player) player.col = SKINS[i]; buildCustom(); },
      () => { save.skin = i; persist(); if (player) player.col = SKINS[i]; buildCustom(); }));
  });
  const head2 = document.createElement('div'); head2.className = 'shophead'; head2.textContent = 'TRAILS';
  el.customGrid.appendChild(head2);
  TRAILS.forEach((t, i) => {
    el.customGrid.appendChild(shopRow('TRAILS', t, save.ownedTrails[i], save.trail === i, save.bank,
      () => { save.ownedTrails[i] = true; save.trail = i; persist(); buildCustom(); },
      () => { save.trail = i; persist(); buildCustom(); }));
  });
}

/* ---------------- wiring ---------------- */
function wire(id, fn) { el[id].addEventListener('click', () => { ensureAudio(); sndClick(); fn(); }); }
wire('startBtn', startRun);
wire('againBtn', startRun);
wire('customPlayBtn', startRun);
wire('customBtn', () => { buildCustom(); hideOverlays(); el.custom.classList.remove('hidden'); });
wire('customBackBtn', () => { hideOverlays(); el.menu.classList.remove('hidden'); refreshMenuBest(); });
wire('overMenuBtn', toMenu);
wire('pausedMenuBtn', toMenu);
wire('resumeBtn', resumeGame);
el.pauseBtn.addEventListener('click', () => {
  ensureAudio();
  if (state === 'playing') pauseGame(false);
  else if (state === 'paused') resumeGame();
});
el.muteBtn.addEventListener('click', () => {
  save.muted = !save.muted;
  persist();
  updateMute();
  if (!save.muted) sndClick();
});

/* ---------------- main loop ---------------- */
let lastTs = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.033, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;
  if (state === 'playing') update(dt);
  else if (state === 'menu') updateAmbient(dt, ts);
  render(ts);
  musicUpdate();
}

/* ---------------- boot ---------------- */
(async function boot() {
  await CG.init();
  CG.loadingStart();
  buildSprites();
  buildWorld();
  buildCustom();
  refreshMenuBest();
  updateMute();
  CG.loadingStop();
  state = 'menu';
  requestAnimationFrame(loop);
})();

/* ---------------- debug / smoke-test handle ---------------- */
window.SPECTER = {
  get state() { return state; },
  get player() {
    return player ? { mass: player.mass, r: player.r, x: player.x, y: player.y, phase: player.phase, dead: player.dead } : null;
  },
  get bots() { return ghosts.filter(g => g.bot && !g.dead).length; },
  get ghosts() { return ghosts.length; },
  get bank() { return save.bank; },
  get save() { return save; },
  startRun, toMenu, pauseGame, resumeGame,
  setPhase(on) { input.space = !!on; },
  clearBots() { ghosts = ghosts.filter(g => !g.bot); },
  feed() {
    if (!player) return;
    const o = orbs.find(o => !o.active) || orbs[0];
    o.x = player.x; o.y = player.y; o.active = true;
  },
  forceDeath() {
    if (!player || player.dead) return;
    const k = makeGhost('TestWraith', BOT_COLORS[0], player.mass * 4 + 60, true, player.x, player.y);
    ghosts.push(k);
  },
  step(dt) { if (state === 'playing') update(dt); render(performance.now()); }
};
