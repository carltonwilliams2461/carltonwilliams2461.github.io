/* ============================================================
   BASIC TRAINING — Reception Week chaos for CrazyGames.
   Carlton's original idea (he lived it): you step off the bus
   into screaming drill sergeants and a week of seconds-long,
   near-impossible orders. A rapid-fire instruction-following
   game: read the order, do the right thing NOW, or drop and
   give push-ups. Days 1–7 are Reception Week (Day 7 is the
   graduation evaluation); after that, ENDLESS DRILL MODE —
   days generate forever, faster forever. Score chase: orders
   obeyed, streaks, push-ups avoided.

   Tone is the COMIC half of boot camp — screaming, absurd
   standards, "maggot / numbnuts" energy in text bubbles and
   synth barks. No slurs, no hazing violence, no weapons.

   Vanilla JS + Canvas, no build step, no dependencies. All art
   is drawn in code (pre-rendered to offscreen canvases at
   boot); SFX are synthesized with WebAudio, and the drill
   sergeant's voice is REAL recorded audio (bark-01..12.mp3 for
   the fail flash, cadence.mp3 for the day-pass chain — see VOX).
   FLAT FOLDER by design: the CrazyGames uploader flattens
   subfolders, so every file sits at the root and the game
   references bare filenames only.

   CrazyGames SDK v3 is integrated through the CG wrapper
   below, following the studio's proven pattern: every call is
   feature-detected and try/caught, so the game runs
   identically on a plain static host with no SDK present.
   ============================================================ */
'use strict';

/* ---------------- field geometry ---------------- */
const W = 1000, H = 560;
const GROUND_Y = 468;

/* ---------------- deterministic RNG (seedable for tests) ---------------- */
let rngState = (Date.now() % 2147483646) + 1;
function reseed(n) { rngState = ((Math.abs(Math.floor(n)) % 2147483646) + 1); }
function rnd() { rngState = (rngState * 48271) % 2147483647; return (rngState - 1) / 2147483646; }
function rndi(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

/* ---------------- meta: recruits, DS packs, themes ---------------- */
const RECRUITS = {
  shaky:  { name: 'Pvt. Shaky',  icon: '😰', cost: 0,    desc: 'Sweats through his uniform by 0600. Standard issue, standard nerves.' },
  icy:    { name: 'Pvt. Icy',    icon: '😎', cost: 600,  desc: 'Ice in his veins: +0.5s on every event timer.' },
  wheels: { name: 'Pvt. Wheels', icon: '🏃', cost: 1500, desc: 'Push-up penalties take 3 taps instead of 5. Human forklift.' }
};
const DS_PACKS = {
  classic:  { name: 'Classic DS',       icon: '🗣️', cost: 0,    desc: 'The original smoke show. Loud, proud, professionally offended.' },
  southern: { name: 'Southern Thunder', icon: '🌩️', cost: 800,  desc: 'Drawls the insult, then detonates it. Different barks, same fear.' },
  whisper:  { name: 'The Whisper',      icon: '🤫', cost: 2000, desc: 'Never raises his voice. Somehow scarier. Timers +5% — dread takes time.' }
};
const THEMES = {
  reception: { name: 'Reception Bay', icon: '🏢', cost: 0,    sky: ['#a8c4de', '#dfe9d8'], ground: '#5b5f52', asphalt: '#6e7264', building: '#7d7466' },
  sand:      { name: 'Sand & Sun',    icon: '🏜️', cost: 400,  sky: ['#f2c063', '#f7e3ae'], ground: '#a9853f', asphalt: '#bfa05c', building: '#8a6f42' },
  night:     { name: 'Night Watch',   icon: '🌙', cost: 1200, sky: ['#131c33', '#2c3d5e'], ground: '#232a22', asphalt: '#2e362e', building: '#1a2331' }
};
const DS_NAMES = { senior: 'DS HATCHETT ★', junior: 'DS RILEY' };

/* ---------------- events ---------------- */
const EVENT_DEFS = {
  bus:       { title: 'OFF THE BUS!',        base: 6.5,  tut: 'Tap YOUR duffel — the tagged one!' },
  line:      { title: 'GET ON THE LINE!',    base: 5.5,  tut: 'Find YOUR roster number!' },
  shark:     { title: 'SHARK ATTACK!',       base: 2.8,  tut: "Obey the senior DS's LAST order!" },
  attention: { title: 'ATTENTION!',          base: 4.2,  tut: "DON'T. MOVE." },
  shakedown: { title: 'CONTRABAND SHAKEDOWN!', base: 9.0, tut: 'Tap ONLY the contraband!' },
  uniform:   { title: 'UNIFORM ISSUE!',      base: 11.0, tut: 'Grab YOUR sizes only!' },
  locker:    { title: 'LOCKER DRILL!',       base: 13.0, tut: 'Match the diagram. Drag it!' },
  phone:     { title: 'PHONE CALL HOME!',    base: 7.5,  tut: 'Say it EXACTLY like that!' },
  pushups:   { title: 'DROP!',               base: 6.0,  tut: null }
};
const DAY_PLANS = {
  1: ['bus', 'line', 'attention', 'shark', 'shakedown'],
  2: ['bus', 'uniform', 'line', 'shark', 'phone', 'shakedown'],
  3: ['locker', 'bus', 'attention', 'uniform', 'shark', 'line', 'shakedown'],
  4: ['uniform', 'shark', 'locker', 'phone', 'bus', 'attention', 'shakedown', 'line'],
  5: ['shark', 'locker', 'uniform', 'phone', 'attention', 'bus', 'line', 'shakedown', 'shark'],
  6: ['locker', 'phone', 'uniform', 'shark', 'bus', 'attention', 'shakedown', 'line', 'uniform'],
  7: ['bus', 'line', 'shark', 'attention', 'shakedown', 'uniform', 'locker', 'phone', 'shark', 'locker']
};
const ALL_EVENTS = ['bus', 'line', 'shark', 'attention', 'shakedown', 'uniform', 'locker', 'phone'];
function buildDayPlan(day) {
  if (DAY_PLANS[day]) return DAY_PLANS[day].slice();
  const bag = shuffle(ALL_EVENTS);
  bag.push(pick(ALL_EVENTS), pick(ALL_EVENTS));
  return shuffle(bag);
}
function speedMul(day) { return Math.max(0.40, 1 - (day - 1) * 0.07); }

/* ---------------- phone-call scripts ---------------- */
const PHONE_LINES = [
  { text: 'Hi Mom. I made it. I am okay. Love you. Bye.',
    wrong: ['Hi Mom. I made it. I am great. Love you. Bye.', 'Hi Mom. I made it. Send money. Love you. Bye.'] },
  { text: 'This is your recruit. I have arrived safely. Training is hard. I am fine.',
    wrong: ['This is your recruit. I have arrived quickly. Training is hard. I am fine.', 'This is your recruit. I have arrived safely. Training is easy. I am fine.'] },
  { text: 'Dear family. Reception is chaos. The drill sergeants are loud. I will write soon.',
    wrong: ['Dear family. Reception is chaos. The drill sergeants are quiet. I will write soon.', 'Dear family. Reception is quiet. The drill sergeants are loud. I will write soon.'] }
];

/* ---------------- shakedown item pools ---------------- */
const CONTRA = [
  { icon: '🍫', name: 'Candy Bar' }, { icon: '📱', name: 'Cell Phone' },
  { icon: '📖', name: 'Magazine' }, { icon: '🥤', name: 'Energy Drink' },
  { icon: '🎲', name: 'Dice' }, { icon: '🍩', name: 'Donut' }
];
const LEGIT = [
  { icon: '🧦', name: 'Socks' }, { icon: '🧼', name: 'Soap' },
  { icon: '🪥', name: 'Toothbrush' }, { icon: '🥾', name: 'Boots' },
  { icon: '🧽', name: 'Sponge' }, { icon: '🧤', name: 'Gloves' },
  { icon: '🧢', name: 'Cap' }, { icon: '🪒', name: 'Razor' },
  { icon: '🩲', name: 'Briefs' }, { icon: '🧴', name: 'Lotion' }
];

/* ---------------- locker items ---------------- */
const LOCKER_ITEMS = [
  { icon: '🧦', name: 'Socks' }, { icon: '🥾', name: 'Boots' },
  { icon: '👕', name: 'PT Shirt' }, { icon: '🪥', name: 'Brush' },
  { icon: '🧼', name: 'Soap' }, { icon: '🧢', name: 'Cover' }
];

/* ---------------- uniform sizes ---------------- */
const UNIFORM_TYPES = [
  { key: 'boot', icon: '🥾', name: 'Boots', sizes: ['9', '9.5', '10', '10.5', '11', '12'] },
  { key: 'top', icon: '👕', name: 'Top', sizes: ['SM', 'MED', 'LG', 'XL'] },
  { key: 'cover', icon: '🪖', name: 'Cover', sizes: ['6⅞', '7¼', '7½', '8'] }
];

/* ---------------- DS voice lines ---------------- */
const FAIL_BARKS = [
  'DROP! GIVE ME PUSH-UPS!', 'ARE YOU KIDDING ME, PRIVATE?!',
  'SOUP. SANDWICH.', "MY GRANDMA'S FASTER THAN THAT!",
  'UN-BELIEVABLE!', "THAT'S IT — DOWN!", 'WHAT WAS THAT?!'
];
const WIN_QUIPS = ['SQUARED AWAY.', '…Acceptable.', "DON'T GET COCKY, PRIVATE.", 'HOOAH.', '…Fine. NEXT!'];
/* THE FAIL FLASH bark bank (Carlton's design addition): every blown
   order flashes a huge DS face full-screen with one of these lines.
   Rotation is a shuffled bag — no line repeats until all 12 cycle. */
const FAIL_FLASH_BARKS = [
  'DROP AND GIVE ME 25, NUMB NUTS!',
  'MOVE IT, ASSWIPE!',
  'YOU CALL THAT ATTENTION?!',
  "I'VE SEEN BETTER COORDINATION FROM MY BAG OF FUCKING HAMSTERS!",
  'DO IT AGAIN. DO IT FASTER.',
  'THAT WAS OUTSTANDING. OUTSTANDINGLY FUCKING BAD.',
  'WHAT IN THE WORLD ARE YOU DOING, PRIVATE?!',
  'MY BOOT MOVES FASTER THAN YOU, TURD!',
  "WAS THAT A TRY? THAT COULDN'T HAVE BEEN A FUCKING TRY!",
  'YOU HAD ONE JOB, PRIVATE. JUST ONE.',
  "IF YOU WERE ANY SLOWER, YOU'D BE GOING BACKWARDS!",
  'MY GRANDMA JUST TEXTED. SHE EMBARRASSED FOR YOU.'
];
const SHARK_ORDERS = ['GET DOWN!', 'STAY UP!', 'EYES FRONT!', 'LOOK AT ME!'];
const NUM_WORDS = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];

/* ---------------- save ---------------- */
const SAVE_KEY = 'basicTrainingSaveV1';
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function defaultSave() {
  return {
    merit: 0, recruit: 'shaky', recruitsOwned: ['shaky'],
    dsPack: 'classic', dsPacksOwned: ['classic'],
    theme: 'reception', themesOwned: ['reception'],
    bestScore: 0, bestDay: 0, graduations: 0, daysServed: 0, runs: 0,
    pushupsDone: 0, ordersObeyed: 0, muted: false,
    tutSeen: {}, tutDone: false, barkBag: []
  };
}
let save = defaultSave();
try {
  const raw = lsGet(SAVE_KEY);
  if (raw) {
    const d = JSON.parse(raw);
    if (d && typeof d === 'object') {
      save = Object.assign(defaultSave(), d);
      save.tutSeen = Object.assign({}, d.tutSeen || {});
      save.barkBag = Array.isArray(d.barkBag) ? d.barkBag.filter(i => Number.isInteger(i) && i >= 0 && i < FAIL_FLASH_BARKS.length) : [];
    }
  }
} catch (e) { save = defaultSave(); }
function persist() { lsSet(SAVE_KEY, JSON.stringify(save)); }

/* ---------------- CrazyGames SDK v3 wrapper ----------------
   Same proven pattern as the studio's other games: init()
   resolves before any other call; loading/gameplay calls
   bracket activity; midgame ads ONLY at natural breaks
   (between Days) with mute+freeze callbacks and a 3-minute
   client throttle mirroring the server cooldown; the portal's
   game.settings.muteAudio outranks the in-game toggle. Every
   call is feature-detected + try/caught — off-portal the SDK
   reports environment 'disabled' and throws, treated absent. */
const CG = {
  sdk: null, ready: false, lastAdAt: -1e9,
  async init() {
    try {
      if (typeof window !== 'undefined' && window.CrazyGames && window.CrazyGames.SDK) {
        await window.CrazyGames.SDK.init();
        this.sdk = window.CrazyGames.SDK;
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
  loadingStart() { this.call(s => { if (s.game.loadingStart) s.game.loadingStart(); if (s.game.sdkGameLoadingStart) s.game.sdkGameLoadingStart(); }); },
  loadingStop() { this.call(s => { if (s.game.loadingStop) s.game.loadingStop(); if (s.game.sdkGameLoadingStop) s.game.sdkGameLoadingStop(); }); },
  gameplayStart() { this.call(s => { if (s.game.gameplayStart) s.game.gameplayStart(); }); },
  gameplayStop() { this.call(s => { if (s.game.gameplayStop) s.game.gameplayStop(); }); },
  happytime() { this.call(s => { if (s.game.happytime) s.game.happytime(); }); },
  sdkMuted() {
    if (!this.ready || !this.sdk) return false;
    try { return !!(this.sdk.game.settings && this.sdk.game.settings.muteAudio); } catch (e) { return false; }
  },
  midgameAd(done) {
    const finish = (() => { let fired = false; return () => { if (!fired) { fired = true; done(); } }; })();
    if (!this.ready || !this.sdk || !this.sdk.ad || !this.sdk.ad.requestAd) { finish(); return; }
    if (performance.now() - this.lastAdAt < 180000) { finish(); return; }
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
let audioCtx = null;
function ac() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function effectiveMuted() { return save.muted || CG.sdkMuted() || adActive; }
function tone(freq, dur, type, vol, slideTo, delay) {
  if (effectiveMuted()) return; const a = ac(); if (!a) return;
  try {
    const t0 = a.currentTime + (delay || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol || 0.12, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (e) {}
}
function noiseBurst(dur, vol, freq, type) {
  if (effectiveMuted()) return; const a = ac(); if (!a) return;
  try {
    const len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = type || 'highpass'; f.frequency.value = freq || 1200;
    const g = a.createGain(); g.gain.value = vol || 0.2;
    src.connect(f); f.connect(g); g.connect(a.destination); src.start();
  } catch (e) {}
}
/* A DS bark: a formant-ish saw burst that reads as a shout without
   any voice acting. Pitch + syllable count vary by pack. */
function barkSfx(syllables, pitchMul) {
  const p = pitchMul || 1;
  for (let i = 0; i < (syllables || 1); i++) {
    tone(190 * p, 0.11, 'sawtooth', 0.13, 95 * p, i * 0.13);
    tone(95 * p, 0.11, 'square', 0.07, 60 * p, i * 0.13);
    noiseBurst(0.07, 0.05, 700);
  }
}
const SFX = {
  bark(n) { barkSfx(n || 2, save.dsPack === 'southern' ? 0.82 : save.dsPack === 'whisper' ? 1.3 : 1); },
  whistle() { for (let i = 0; i < 2; i++) { tone(2350, 0.09, 'square', 0.06, 2100, i * 0.12); tone(2500, 0.07, 'square', 0.05, 2250, i * 0.12 + 0.04); } },
  brakes() { tone(880, 0.4, 'sine', 0.1, 240); noiseBurst(0.45, 0.14, 300, 'lowpass'); },
  buzzer() { tone(130, 0.22, 'square', 0.16); tone(130, 0.3, 'square', 0.16, null, 0.28); },
  ding() { tone(880, 0.09, 'sine', 0.11); tone(1318, 0.16, 'sine', 0.11, null, 0.07); },
  toss() { noiseBurst(0.12, 0.1, 1800); },
  grab() { tone(520, 0.07, 'triangle', 0.12, 760); },
  wrong() { tone(170, 0.14, 'square', 0.11, 110); },
  grunt() { tone(95, 0.09, 'sawtooth', 0.13, 58); noiseBurst(0.05, 0.06, 500); },
  reveille() { [392, 523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, 0.2, 'triangle', 0.1, null, i * 0.15)); },
  fanfare() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.24, 'triangle', 0.12, null, i * 0.13)); },
  thud() { tone(85, 0.16, 'sine', 0.2, 40); noiseBurst(0.1, 0.1, 300, 'lowpass'); },
  buzzFly() { tone(180, 0.5, 'sawtooth', 0.03, 240); },
  click() { tone(700, 0.05, 'sine', 0.07); }
};

/* ---------------- DOM ---------------- */
const el = id => document.getElementById(id);
const canvas = el('game'), ctx = canvas.getContext('2d');
const tutTextEl = el('tutText');

/* ---------------- sprites: pre-rendered offscreen canvases ---------------- */
function makeSprite(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return c;
}
/* The drill sergeant: round brown campaign hat — ALWAYS TILTED,
   pulled low and tipped forward so the brim's shadow sits on the
   eyes (Carlton's signature, from real DS reference photos) —
   sunglasses, a face professionally offended by your existence.
   Parameterized per DS pack (hat band / skin / glasses change;
   the attitude doesn't). */
function drawDSHead(g, w, h, o) {
  const cx = w / 2, skin = o.skin, hat = '#6b4a2a', band = o.band;
  // shoulders + shirt
  g.fillStyle = o.shirt; g.beginPath();
  g.moveTo(cx - w * 0.34, h); g.quadraticCurveTo(cx, h * 0.72, cx + w * 0.34, h); g.closePath(); g.fill();
  g.fillStyle = '#3d4433'; g.beginPath();  // collar V
  g.moveTo(cx - w * 0.09, h * 0.86); g.lineTo(cx, h * 0.99); g.lineTo(cx + w * 0.09, h * 0.86); g.closePath(); g.fill();
  // neck
  g.fillStyle = skin; g.fillRect(cx - w * 0.07, h * 0.62, w * 0.14, h * 0.2);
  g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(cx - w * 0.07, h * 0.62, w * 0.14, h * 0.05);
  // ears
  g.fillStyle = skin;
  g.beginPath(); g.ellipse(cx - w * 0.205, h * 0.47, w * 0.035, h * 0.055, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(cx + w * 0.205, h * 0.47, w * 0.035, h * 0.055, 0, 0, 7); g.fill();
  // face
  g.beginPath(); g.ellipse(cx, h * 0.46, w * 0.20, h * 0.235, 0, 0, 7); g.fill();
  // jaw shading
  g.fillStyle = 'rgba(0,0,0,.08)'; g.beginPath(); g.ellipse(cx, h * 0.60, w * 0.15, h * 0.09, 0, 0, 7); g.fill();
  // nose
  g.fillStyle = skin; g.beginPath(); g.ellipse(cx, h * 0.52, w * 0.032, h * 0.045, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(cx, h * 0.555, w * 0.03, h * 0.012, 0, 0, 7); g.fill();
  // sunglasses (the Whisper wears clear lenses — you can see the disappointment)
  if (o.clearGlasses) {
    g.strokeStyle = '#22252a'; g.lineWidth = Math.max(2, w * 0.012);
    g.strokeRect(cx - w * 0.165, h * 0.375, w * 0.14, h * 0.085);
    g.strokeRect(cx + w * 0.025, h * 0.375, w * 0.14, h * 0.085);
    g.beginPath(); g.moveTo(cx - w * 0.025, h * 0.41); g.lineTo(cx + w * 0.025, h * 0.41); g.stroke();
    g.fillStyle = '#1c1e24';  // narrow angry eyes
    g.fillRect(cx - w * 0.125, h * 0.415, w * 0.07, h * 0.014);
    g.fillRect(cx + w * 0.055, h * 0.415, w * 0.07, h * 0.014);
  } else {
    g.fillStyle = '#14161a';
    g.beginPath(); g.roundRect(cx - w * 0.175, h * 0.365, w * 0.155, h * 0.095, h * 0.03); g.fill();
    g.beginPath(); g.roundRect(cx + w * 0.02, h * 0.365, w * 0.155, h * 0.095, h * 0.03); g.fill();
    g.fillRect(cx - w * 0.03, h * 0.395, w * 0.06, h * 0.02);
    g.fillStyle = 'rgba(255,255,255,.28)';
    g.beginPath(); g.ellipse(cx - w * 0.11, h * 0.395, w * 0.035, h * 0.016, -0.5, 0, 7); g.fill();
    g.beginPath(); g.ellipse(cx + w * 0.085, h * 0.395, w * 0.035, h * 0.016, -0.5, 0, 7); g.fill();
  }
  // brows (visible above the glasses — always furious)
  g.strokeStyle = 'rgba(30,20,12,.85)'; g.lineWidth = Math.max(2, w * 0.014); g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx - w * 0.15, h * 0.345); g.lineTo(cx - w * 0.045, h * 0.365); g.stroke();
  g.beginPath(); g.moveTo(cx + w * 0.15, h * 0.345); g.lineTo(cx + w * 0.045, h * 0.365); g.stroke();
  // mouth
  if (o.shout) {
    g.fillStyle = '#4a1408'; g.beginPath(); g.ellipse(cx, h * 0.635, w * 0.075, h * 0.052, 0, 0, 7); g.fill();
    g.fillStyle = '#e8dcc8'; g.fillRect(cx - w * 0.065, h * 0.588, w * 0.13, h * 0.02);
    g.fillStyle = '#8a3b2a'; g.beginPath(); g.ellipse(cx, h * 0.662, w * 0.045, h * 0.02, 0, 0, 7); g.fill();
  } else {
    g.strokeStyle = '#5d3423'; g.lineWidth = Math.max(2, w * 0.011);
    g.beginPath(); g.moveTo(cx - w * 0.07, h * 0.645); g.quadraticCurveTo(cx, h * 0.625, cx + w * 0.07, h * 0.645); g.stroke();
  }
  // campaign hat, drawn as one group, lowered and rotated: the tilt
  g.save();
  g.translate(cx, h * 0.30); g.rotate(0.055); g.translate(-cx, -h * 0.30);
  g.fillStyle = hat;
  g.beginPath(); g.ellipse(cx, h * 0.252, w * 0.135, h * 0.115, 0, 0, 7); g.fill();       // crown
  g.beginPath(); g.ellipse(cx, h * 0.162, w * 0.055, h * 0.028, 0, 0, 7); g.fill();       // crown pinch
  g.fillStyle = band; g.fillRect(cx - w * 0.128, h * 0.30, w * 0.256, h * 0.035);          // hat band
  g.fillStyle = hat;
  g.beginPath(); g.ellipse(cx, h * 0.35, w * 0.335, h * 0.052, 0, 0, 7); g.fill();         // brim
  g.fillStyle = 'rgba(0,0,0,.16)';
  g.beginPath(); g.ellipse(cx, h * 0.36, w * 0.335, h * 0.05, 0, 0, 7); g.fill();
  g.fillStyle = hat;
  g.beginPath(); g.ellipse(cx, h * 0.345, w * 0.335, h * 0.048, 0, 0, 7); g.fill();
  g.restore();
  // the brim's shadow band across the eyes — the menace lives here
  g.fillStyle = 'rgba(24,12,4,.30)';
  g.beginPath(); g.ellipse(cx, h * 0.405, w * 0.196, h * 0.08, 0.055, 0, 7); g.fill();
  g.fillStyle = 'rgba(24,12,4,.15)';
  g.beginPath(); g.ellipse(cx, h * 0.445, w * 0.188, h * 0.062, 0.055, 0, 7); g.fill();
}
function drawRecruit(g, w, h, o) {
  const cx = w / 2;
  // legs + boots
  g.fillStyle = '#4c5540'; g.fillRect(cx - w * 0.13, h * 0.72, w * 0.1, h * 0.22); g.fillRect(cx + w * 0.03, h * 0.72, w * 0.1, h * 0.22);
  g.fillStyle = '#24231f'; g.fillRect(cx - w * 0.15, h * 0.93, w * 0.14, h * 0.05); g.fillRect(cx + w * 0.01, h * 0.93, w * 0.14, h * 0.05);
  // torso (issue-green tee)
  g.fillStyle = '#5d6b47'; g.beginPath(); g.roundRect(cx - w * 0.17, h * 0.40, w * 0.34, h * 0.34, w * 0.06); g.fill();
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(cx - w * 0.17, h * 0.68, w * 0.34, h * 0.06);
  // arms straight down (at attention) — or out for push-up frames handled elsewhere
  g.fillStyle = '#5d6b47'; g.fillRect(cx - w * 0.235, h * 0.42, w * 0.06, h * 0.3); g.fillRect(cx + w * 0.175, h * 0.42, w * 0.06, h * 0.3);
  g.fillStyle = o.skin; g.beginPath(); g.arc(cx - w * 0.205, h * 0.75, w * 0.032, 0, 7); g.fill(); g.beginPath(); g.arc(cx + w * 0.205, h * 0.75, w * 0.032, 0, 7); g.fill();
  // head
  g.beginPath(); g.ellipse(cx, h * 0.27, w * 0.115, h * 0.125, 0, 0, 7); g.fill();
  g.fillStyle = '#2e2a20'; g.beginPath(); g.ellipse(cx, h * 0.185, w * 0.118, h * 0.055, 0, 0, Math.PI, 0); g.fill();  // buzz cut
  if (o.variant === 'wheels') { g.fillStyle = '#c0392b'; g.fillRect(cx - w * 0.12, h * 0.155, w * 0.24, h * 0.035); }
  if (o.variant === 'icy') {  // sunglasses, unbothered
    g.fillStyle = '#14161a'; g.fillRect(cx - w * 0.105, h * 0.235, w * 0.21, h * 0.04);
    g.strokeStyle = '#5d3423'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - w * 0.05, h * 0.335); g.lineTo(cx + w * 0.05, h * 0.335); g.stroke();
  } else {
    // wide terrified eyes
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(cx - w * 0.045, h * 0.26, w * 0.026, h * 0.03, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(cx + w * 0.045, h * 0.26, w * 0.026, h * 0.03, 0, 0, 7); g.fill();
    g.fillStyle = '#1c1e24'; g.beginPath(); g.arc(cx - w * 0.045, h * 0.265, w * 0.012, 0, 7); g.fill(); g.beginPath(); g.arc(cx + w * 0.045, h * 0.265, w * 0.012, 0, 7); g.fill();
    g.strokeStyle = '#5d3423'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(cx, h * 0.345, w * 0.02, h * 0.014, 0, 0, 7); g.stroke();  // wobbly little o mouth
  }
  if (o.variant === 'shaky') {  // sweat drops
    g.fillStyle = '#7ec3ea';
    g.beginPath(); g.ellipse(cx - w * 0.15, h * 0.22, w * 0.016, h * 0.026, 0.4, 0, 7); g.fill();
    g.beginPath(); g.ellipse(cx + w * 0.145, h * 0.30, w * 0.014, h * 0.022, -0.4, 0, 7); g.fill();
  }
}
const SPR = {};
/* DS pack art, shared by the stage sprites and the fail-flash
   close-up head (drawFlashHead), so the man in your face is the
   same man as on the stage: same skin, same hat band, same shirt. */
const DS_PACK_ART = {
  classic:  { skin: '#c98d5e', band: '#3d2c17', shirt: '#5a6148', clearGlasses: false },
  southern: { skin: '#a96f3f', band: '#7a1f1f', shirt: '#6b5a35', clearGlasses: false },
  whisper:  { skin: '#dcb08a', band: '#20242c', shirt: '#39404d', clearGlasses: true }
};
function buildSprites() {
  const packs = DS_PACK_ART;
  SPR.ds = {};
  SPR.dsBig = {};
  for (const k of Object.keys(packs)) {
    SPR.ds[k + 'Calm'] = makeSprite(300, 340, (g, w, h) => drawDSHead(g, w, h, Object.assign({}, packs[k], { shout: false })));
    SPR.ds[k + 'Shout'] = makeSprite(300, 340, (g, w, h) => drawDSHead(g, w, h, Object.assign({}, packs[k], { shout: true })));
    // legacy 2x DS render — the fail flash used this sprite before
    // the talking close-up head (drawFlashHead) replaced it; kept
    // as spare art, nothing in the flash path reads it anymore
    SPR.dsBig[k] = makeSprite(600, 680, (g, w, h) => drawDSHead(g, w, h, Object.assign({}, packs[k], { shout: true })));
  }
  SPR.recruit = {};
  for (const v of ['shaky', 'icy', 'wheels']) {
    SPR.recruit[v] = makeSprite(170, 300, (g, w, h) => drawRecruit(g, w, h, { skin: '#c98d5e', variant: v }));
  }
  // side-view push-up recruit — a SOLID MAN, rebuilt after Carlton
  // rejected the old stroke-drawn 'stick figure' outright ('his legs
  // are all fucked up... you gotta make a man'). Parametric rig: the
  // body is ONE rigid plank pivoting on the toes — ankle, hip,
  // shoulder and head stay on a single straight line at every phase,
  // so the legs can never bend, splay or warp. The arms are solved
  // two-bone (shoulder -> elbow -> planted hand) so the elbows fold
  // back naturally as the plank lowers. Every part is a filled,
  // tapered, shaded mass — no line limbs. Pose and proportions
  // follow Carlton's reference: front leaning rest, arms vertical
  // under the shoulders at the top, gray PT shirt, olive trousers,
  // belt, patrol cap, black boots, feet together on the ground.
  const PUSH_GY = 366;  // ground line inside the 680x400 sprite
  function pushFigure(g, t) {
    const skin = '#c98d5e', skinD = '#a96f3f';
    const tee = '#7d8278', teeD = '#5b6056', teeL = '#9aa093';
    const pants = '#4c5540', pantsD = '#39412f', pantsF = '#414a34', pantsFD = '#303826';
    const boot = '#24231f', bootD = '#171713', cap = '#4a5138', capD = '#39412c';
    const A = { x: 74, y: 338 };              // ankle — fixed; the body pivots on the toes
    const phi = (25.5 - 9.5 * t) * Math.PI / 180;   // plank angle: lowers, never sags
    const ux = Math.cos(phi), uy = -Math.sin(phi);
    const at = d => ({ x: A.x + d * ux, y: A.y + d * uy });  // point along the plank
    const hip = at(250), sho = at(478), knee = at(112), headC = at(532);
    const nd = { x: -uy, y: ux };             // plank underside normal (toward ground)
    const nu = { x: uy, y: -ux };             // plank top normal
    const hand = { x: 505, y: PUSH_GY };      // planted under the top-position shoulder
    // two-bone arm solve: elbow tracks BACK as the body lowers
    const L1 = 118, L2 = 118;
    const adx = hand.x - sho.x, ady = hand.y - sho.y;
    const aLen = Math.hypot(adx, ady) || 1;
    const aDist = Math.min(aLen, L1 + L2 - 0.5);
    const aMid = aDist / 2, aH = Math.sqrt(Math.max(0, L1 * L1 - aMid * aMid));
    const pvx = -ady / aLen, pvy = adx / aLen, psgn = pvx < 0 ? 1 : -1;
    const elbow = { x: sho.x + adx / 2 + aH * pvx * psgn, y: sho.y + ady / 2 + aH * pvy * psgn };
    const far = p => ({ x: p.x - 13, y: p.y + 5 });
    // one solid tapered limb segment (filled mass, rounded joints)
    const seg = (p1, p2, w1, w2, col) => {
      const vx = p2.x - p1.x, vy = p2.y - p1.y, L = Math.hypot(vx, vy) || 1;
      const nx = -vy / L, ny = vx / L;
      g.fillStyle = col; g.beginPath();
      g.moveTo(p1.x + nx * w1 / 2, p1.y + ny * w1 / 2);
      g.lineTo(p2.x + nx * w2 / 2, p2.y + ny * w2 / 2);
      g.quadraticCurveTo(p2.x + vx / L * w2 * 0.38, p2.y + vy / L * w2 * 0.38, p2.x - nx * w2 / 2, p2.y - ny * w2 / 2);
      g.lineTo(p1.x - nx * w1 / 2, p1.y - ny * w1 / 2);
      g.quadraticCurveTo(p1.x - vx / L * w1 * 0.38, p1.y - vy / L * w1 * 0.38, p1.x + nx * w1 / 2, p1.y + ny * w1 / 2);
      g.fill();
    };
    const bootShape = (ank, col, sole) => {
      g.fillStyle = col; g.beginPath();
      g.moveTo(ank.x + 15, ank.y - 12);
      g.quadraticCurveTo(ank.x - 2, ank.y + 8, ank.x - 24, ank.y + 19);
      g.lineTo(ank.x - 30, ank.y + 27);                    // toe front
      g.lineTo(ank.x - 32, PUSH_GY);
      g.lineTo(ank.x + 24, PUSH_GY);                      // sole
      g.lineTo(ank.x + 25, ank.y + 4);                    // heel back
      g.quadraticCurveTo(ank.x + 24, ank.y - 10, ank.x + 15, ank.y - 12);
      g.fill();
      g.fillStyle = sole; g.fillRect(ank.x - 32, PUSH_GY - 4, 57, 4);
    };
    // ground shadow + contact patches
    g.fillStyle = 'rgba(0,0,0,.16)';
    g.beginPath(); g.ellipse((52 + headC.x) / 2, PUSH_GY + 7, 268, 10, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.beginPath(); g.ellipse(hand.x, PUSH_GY + 4, 30, 5, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(56, PUSH_GY + 4, 30, 5, 0, 0, 7); g.fill();
    // far arm (behind the body, darker)
    seg(far(sho), far(elbow), 30, 25, skinD);
    seg(far(elbow), far(hand), 26, 21, skinD);
    // far leg + boot
    seg(far(hip), far(knee), 37, 29, pantsFD);
    seg(far(knee), far(at(10)), 28, 21, pantsFD);
    bootShape(far(A), bootD, '#0f0e0c');
    // near leg (trousers): thigh + calf, dead straight along the plank
    seg(hip, knee, 43, 33, pants);
    seg(knee, at(10), 31, 23, pantsD);
    // torso: one tapered mass, shoulder -> hip, shaded top to bottom
    const cT = { x: sho.x + nu.x * 46, y: sho.y + nu.y * 46 }, cB = { x: sho.x + nd.x * 48, y: sho.y + nd.y * 48 };
    const hT = { x: hip.x + nu.x * 36, y: hip.y + nu.y * 36 }, hB = { x: hip.x + nd.x * 40, y: hip.y + nd.y * 40 };
    const grad = g.createLinearGradient(0, sho.y - 52, 0, hip.y + 58);
    grad.addColorStop(0, teeL); grad.addColorStop(0.45, tee); grad.addColorStop(1, teeD);
    g.fillStyle = grad; g.beginPath();
    g.moveTo(cT.x, cT.y);
    g.quadraticCurveTo((cT.x + hT.x) / 2, (cT.y + hT.y) / 2 - 4, hT.x, hT.y);
    g.quadraticCurveTo(hip.x + ux * 14, hip.y + uy * 14, hB.x, hB.y);
    g.lineTo(cB.x, cB.y);
    g.quadraticCurveTo(sho.x - ux * 16, sho.y - uy * 16, cT.x, cT.y);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,.13)';   // underside shade along the belly edge
    g.beginPath();
    g.moveTo(cB.x, cB.y); g.lineTo(hB.x, hB.y);
    g.lineTo(hB.x - nd.x * 13, hB.y - nd.y * 13); g.lineTo(cB.x - nd.x * 13, cB.y - nd.y * 13);
    g.closePath(); g.fill();
    // belt at the waist (shirt tucked, per the reference)
    const bIn = { x: hip.x + ux * 6, y: hip.y + uy * 6 }, bOut = { x: hip.x - ux * 9, y: hip.y - uy * 9 };
    g.fillStyle = '#3a2e1e'; g.beginPath();
    g.moveTo(bIn.x + nu.x * 38, bIn.y + nu.y * 38); g.lineTo(bOut.x + nu.x * 37, bOut.y + nu.y * 37);
    g.lineTo(bOut.x + nd.x * 41, bOut.y + nd.y * 41); g.lineTo(bIn.x + nd.x * 41, bIn.y + nd.y * 41);
    g.closePath(); g.fill();
    g.fillStyle = '#8a743f'; g.fillRect(bIn.x - 5, bIn.y - 5, 10, 10);   // buckle
    // near boot
    bootShape(A, boot, bootD);
    // near arm: sleeve to mid-upper-arm, then skin; deltoid cap on the shoulder
    const slv = { x: sho.x + (elbow.x - sho.x) * 0.45, y: sho.y + (elbow.y - sho.y) * 0.45 };
    g.fillStyle = tee; g.beginPath(); g.arc(sho.x, sho.y, 30, 0, 7); g.fill();
    seg(sho, slv, 37, 32, tee);
    seg(slv, elbow, 32, 27, skin);
    seg(elbow, hand, 28, 22, skin);
    g.fillStyle = skinD;   // planted hand, fingers forward
    g.beginPath(); g.ellipse(hand.x + 3, PUSH_GY - 3, 17, 6.5, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(90,50,25,.55)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(hand.x + 8, PUSH_GY - 7); g.lineTo(hand.x + 8, PUSH_GY - 1); g.stroke();
    // neck + head (profile, looking down the plank line, patrol cap)
    seg(at(490), { x: headC.x - ux * 14, y: headC.y - uy * 14 }, 34, 30, skinD);
    g.save();
    g.translate(headC.x, headC.y); g.rotate(-phi + 0.10);
    g.fillStyle = skin;
    g.beginPath(); g.ellipse(2, -2, 33, 28, 0, 0, 7); g.fill();            // skull
    g.beginPath(); g.ellipse(12, 7, 22, 19, 0, 0, 7); g.fill();            // jaw/cheek mass
    g.fillStyle = 'rgba(0,0,0,.09)';
    g.beginPath(); g.ellipse(13, 13, 17, 11, 0, 0, 7); g.fill();           // jaw shade
    g.fillStyle = skinD;
    g.beginPath(); g.moveTo(29, 1); g.lineTo(40, 9); g.lineTo(28, 12); g.closePath(); g.fill();  // nose
    g.beginPath(); g.ellipse(-10, 0, 6, 8, 0, 0, 7); g.fill();             // ear
    g.fillStyle = '#1c1e24'; g.fillRect(12, -6, 11, 4);                    // eye, cast down
    g.strokeStyle = 'rgba(40,22,10,.85)'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(7, -11); g.lineTo(23, -8); g.stroke();         // brow
    g.strokeStyle = 'rgba(90,50,30,.8)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(22, 16); g.lineTo(31, 14); g.stroke();         // gritted mouth
    // patrol cap: dome + band + brim tipped down over the eyes
    g.fillStyle = cap;
    g.beginPath(); g.ellipse(0, -13, 34, 19, 0, Math.PI, 0); g.fill();
    g.fillRect(-34, -15, 68, 8);
    g.fillStyle = capD; g.fillRect(-34, -9, 68, 4);
    g.beginPath(); g.moveTo(27, -11); g.lineTo(57, -4); g.lineTo(57, 1); g.lineTo(28, -4); g.closePath(); g.fill();
    g.fillStyle = '#2e2a20'; g.fillRect(-35, -7, 7, 13);                   // buzz cut behind the cap
    g.restore();
  }
  SPR.pushFrames = [];
  for (let i = 0; i <= 8; i++) SPR.pushFrames.push(makeSprite(680, 400, (g) => pushFigure(g, i / 8)));
  SPR.pushUp = SPR.pushFrames[0];
  SPR.pushDn = SPR.pushFrames[SPR.pushFrames.length - 1];
  SPR.bus = makeSprite(620, 330, (g, w, h) => {
    // the bus: long, government-issue, full of regret
    g.fillStyle = '#8b8f7d'; g.beginPath(); g.roundRect(6, 26, w - 12, h - 96, 26); g.fill();
    g.fillStyle = '#7a7e6c'; g.fillRect(6, h * 0.52, w - 12, h * 0.1);
    g.fillStyle = '#aebba8'; g.fillRect(6, 26, w - 12, 16);
    for (let i = 0; i < 7; i++) { g.fillStyle = '#2e3d46'; g.beginPath(); g.roundRect(26 + i * 76, 58, 62, 56, 6); g.fill(); g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(30 + i * 76, 62, 26, 50); }
    g.fillStyle = '#2e3d46'; g.beginPath(); g.roundRect(w - 92, 52, 74, 118, 6); g.fill();  // windshield
    g.fillStyle = '#585d4f'; g.fillRect(w / 2 - 3, 40, 6, h - 116);                        // door seam (front door at right)
    g.fillStyle = '#ffd94d'; g.fillRect(28, h * 0.42, 110, 26); g.fillStyle = '#4a2c00';
    g.font = 'bold 19px Trebuchet MS'; g.textAlign = 'center'; g.fillText('RECEPTION', 83, h * 0.42 + 20);
    g.fillStyle = '#1e1f1c';
    for (const wx of [86, w - 96]) { g.beginPath(); g.arc(wx, h - 62, 44, 0, 7); g.fill(); g.fillStyle = '#585d4f'; g.beginPath(); g.arc(wx, h - 62, 20, 0, 7); g.fill(); g.fillStyle = '#1e1f1c'; }
    g.fillStyle = '#ffd94d'; g.beginPath(); g.arc(w - 20, h * 0.44, 8, 0, 7); g.fill();
  });
}

/* ---------------- background + shared canvas drawing ---------------- */
function drawBackground(g, themeKey) {
  const th = THEMES[themeKey || save.theme];
  const sky = g.createLinearGradient(0, 0, 0, GROUND_Y);
  sky.addColorStop(0, th.sky[0]); sky.addColorStop(1, th.sky[1]);
  g.fillStyle = sky; g.fillRect(0, 0, W, GROUND_Y);
  if (save.theme === 'night') {
    g.fillStyle = '#f4f1de'; g.beginPath(); g.arc(880, 70, 30, 0, 7); g.fill();
    g.fillStyle = 'rgba(244,241,222,.16)'; g.beginPath(); g.arc(880, 70, 52, 0, 7); g.fill();
    g.fillStyle = '#fff';
    for (let i = 0; i < 40; i++) { const sx = (i * 173) % 1000, sy = (i * 97) % 220; g.fillRect(sx, sy, 2.4, 2.4); }
  } else {
    g.fillStyle = save.theme === 'sand' ? '#ffdf8a' : '#fff3b0';
    g.beginPath(); g.arc(880, 74, 40, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.75)';
    for (const [cx, cy, s] of [[180, 70, 1], [430, 44, 0.7], [660, 92, 0.85]]) {
      for (const [dx, dy, rr] of [[0, 0, 30], [-32, 6, 22], [32, 6, 24], [6, -12, 22]]) {
        g.beginPath(); g.ellipse(cx + dx * s, cy + dy * s, rr * s, rr * s * 0.62, 0, 0, 7); g.fill();
      }
    }
  }
  // barracks / reception building silhouette
  g.fillStyle = th.building;
  g.fillRect(0, GROUND_Y - 190, 330, 190); g.fillRect(368, GROUND_Y - 150, 260, 150); g.fillRect(690, GROUND_Y - 172, 310, 172);
  g.fillStyle = 'rgba(0,0,0,.22)';
  g.fillRect(0, GROUND_Y - 190, 330, 14); g.fillRect(368, GROUND_Y - 150, 260, 12); g.fillRect(690, GROUND_Y - 172, 310, 13);
  g.fillStyle = save.theme === 'night' ? '#ffd76a' : 'rgba(30,40,50,.55)';
  for (let bx = 22; bx < 310; bx += 44) for (let by = GROUND_Y - 160; by < GROUND_Y - 30; by += 42) g.fillRect(bx, by, 24, 26);
  for (let bx = 712; bx < 980; bx += 44) for (let by = GROUND_Y - 142; by < GROUND_Y - 30; by += 42) g.fillRect(bx, by, 24, 26);
  // parade ground
  g.fillStyle = th.asphalt; g.fillRect(0, GROUND_Y, W, H - GROUND_Y);
  g.fillStyle = th.ground; g.fillRect(0, H - 16, W, 16);
  g.strokeStyle = 'rgba(255,217,77,.5)'; g.lineWidth = 3; g.setLineDash([26, 18]);
  g.beginPath(); g.moveTo(0, GROUND_Y + 44); g.lineTo(W, GROUND_Y + 44); g.stroke(); g.setLineDash([]);
}
function drawSpeechBubble(g, x, y, w, text, opts) {
  opts = opts || {};
  const fs = opts.small ? 17 : 23;
  g.font = 'bold ' + fs + 'px "Trebuchet MS", sans-serif';
  const words = String(text).split(' ');
  const lines = []; let cur = '';
  for (const wd of words) {
    const t = cur ? cur + ' ' + wd : wd;
    if (g.measureText(t).width > w - 36 && cur) { lines.push(cur); cur = wd; } else cur = t;
  }
  if (cur) lines.push(cur);
  const bh = lines.length * (fs + 6) + 22;
  g.fillStyle = opts.fill || '#fdfaf0';
  g.strokeStyle = '#2b2a1c'; g.lineWidth = 3;
  g.beginPath(); g.roundRect(x, y, w, bh, 14); g.fill(); g.stroke();
  const tailX = opts.tailX !== undefined ? opts.tailX : x + 40;
  g.beginPath(); g.moveTo(tailX - 12, y + bh - 2); g.lineTo(tailX + 14, y + bh - 2); g.lineTo(tailX + (opts.tailDir || 0), y + bh + 20); g.closePath();
  g.fillStyle = opts.fill || '#fdfaf0'; g.fill(); g.stroke();
  g.fillStyle = opts.fill || '#fdfaf0'; g.fillRect(tailX - 11, y + bh - 6, 24, 7);
  g.fillStyle = opts.color || '#a11f0d';
  g.textAlign = 'center';
  lines.forEach((ln, i) => g.fillText(ln, x + w / 2, y + 30 + i * (fs + 6)));
  g.textAlign = 'left';
  return bh;
}
function drawTimerBar(g, frac, label) {
  g.fillStyle = 'rgba(10,10,6,.72)'; g.beginPath(); g.roundRect(16, 12, W - 32, 26, 13); g.fill();
  const col = frac > 0.45 ? '#b7d94d' : frac > 0.22 ? '#ffd94d' : '#e0483a';
  if (frac > 0) { g.fillStyle = col; g.beginPath(); g.roundRect(20, 16, (W - 40) * Math.min(1, frac), 18, 9); g.fill(); }
  g.fillStyle = '#fff3d6'; g.font = 'bold 14px "Trebuchet MS", sans-serif'; g.textAlign = 'center';
  g.fillText(label || '', W / 2, 30); g.textAlign = 'left';
}

/* ---------------- viewport pinning + responsive fit ----------------
   The field is a fixed 1000x560 design. The game is the entire
   page, #wrap is position:fixed, and pinWrap() drives its size
   AND offset from window.visualViewport (width/height/
   offsetLeft/offsetTop) on vv resize + scroll, so the column
   always sits exactly inside the visible area — browser bars
   can never cover the game, and the page can never scroll.
   fitStage() measures the real chrome heights and caps the
   unified column width (--uW, shared by HUD / meter / event bar
   / stage) by that same visible box. Desktop resolves to the
   same 1000px design width. */
function vvBox() {
  const vv = window.visualViewport;
  if (vv && vv.width) {
    return { w: vv.width, h: vv.height, ox: vv.offsetLeft || 0, oy: vv.offsetTop || 0 };
  }
  return { w: window.innerWidth || 1000, h: window.innerHeight || 800, ox: 0, oy: 0 };
}
let lastFitW = 0;
function chromeHeight() {
  let h = 48;  // wrap padding (16) + flex gaps (24) + safe-area/fudge slack
  for (const id of ['hud', 'meterRow', 'evBar', 'rotateHint']) {
    const e = el(id);
    if (e && !e.classList.contains('hidden')) h += (e.offsetHeight || 0);
  }
  return h;
}
function fitStage() {
  const box = vvBox();
  const vw = box.w, vh = box.h;
  const hint = el('rotateHint');
  let best = Math.min(vw * 0.97, W);
  for (let i = 0; i < 3; i++) {           // chrome wraps -> heights shift; converge, keep the min
    if (hint) hint.classList.toggle('hidden', !(vh > vw && best < 540));
    const byHeight = (vh - chromeHeight()) * (W / H);
    const w = Math.max(240, Math.min(vw * 0.97, W, byHeight));
    if (Math.abs(w - best) < 1) { best = w; break; }
    best = Math.min(best, w);
    applyUW(best);
  }
  applyUW(best);
  lastFitW = best;
  return best;
}
function applyUW(px) {
  const de = document.documentElement;
  if (de && de.style && de.style.setProperty) de.style.setProperty('--uW', px + 'px');
  const st = el('stage'); if (st) st.style.width = px + 'px';
}
function pinWrap() {
  const wrap = el('wrap');
  const box = vvBox();
  if (wrap && wrap.style) {
    wrap.style.width = box.w + 'px';
    wrap.style.height = box.h + 'px';
    wrap.style.left = box.ox + 'px';
    wrap.style.top = box.oy + 'px';
  }
  return fitStage();
}
window.addEventListener('resize', pinWrap);
window.addEventListener('load', pinWrap);
window.addEventListener('orientationchange', () => setTimeout(pinWrap, 60));
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', pinWrap);
  window.visualViewport.addEventListener('scroll', pinWrap);
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(pinWrap);

/* ---------------- game state ---------------- */
let state = 'menu';           // menu | howto | shop | dayintro | event | dayend | over | paused
let shopReturn = 'menu';
let day = 1, score = 0, meter = 60, streak = 0;
let plan = [], planIdx = 0;
let dayStats = { obeyed: 0, failed: 0 };
let dayMerit = 0, runMerit = 0;
let ev = null;                // current event object
let bannerT = 0;
let timeNow = 0;
const pointer = { x: -99, y: -99, down: false };

const OVERLAYS = ['menu', 'howto', 'shop', 'dayend', 'pauseOv', 'overOv'];
function showOnly(id) {
  for (const o of OVERLAYS) el(o).classList.toggle('hidden', o !== id);
  pinWrap();
}
function setAdVeil(on) { el('adVeil').classList.toggle('hidden', !on); }
let toastTimer = 0;
function showToast(text, ms) {
  const t = el('toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms || 1500);
}
function showBanner(main, sub) {
  const b = el('banner');
  b.innerHTML = main + (sub ? '<div class="sub">' + sub + '</div>' : '');
  b.classList.add('show');
}
function hideBanner() { el('banner').classList.remove('show'); }

/* ---------------- HUD ---------------- */
function updateHUD() {
  el('dayVal').textContent = '📅 Day ' + day;
  el('scoreVal').textContent = '🏆 ' + score;
  el('meritVal').textContent = '⭐ ' + save.merit;
  el('streakVal').textContent = '🔥 ×' + streak;
  const f = el('meterFill');
  f.style.width = Math.max(0, Math.min(100, meter)) + '%';
  f.classList.toggle('low', meter <= 30);
  el('meterPct').textContent = Math.max(0, Math.round(meter)) + '%';
  el('evDS').textContent = ev && ev.type === 'shark' && ev.phase === 'play' ? 'WHO DO YOU OBEY?' : DS_NAMES.senior;
}
function updateMenuStats() {
  const bits = [];
  if (save.bestScore > 0) bits.push('🏆 Best score: ' + save.bestScore);
  if (save.bestDay > 0) bits.push('📅 Best day: ' + save.bestDay);
  if (save.graduations > 0) bits.push('🎓 Graduations: ' + save.graduations);
  if (save.pushupsDone > 0) bits.push('💪 Lifetime push-ups: ' + save.pushupsDone);
  el('menuStats').textContent = bits.length ? bits.join(' · ') : 'No service record yet. The bus is waiting.';
}
function updateMute() {
  el('muteBtn').textContent = effectiveMuted() ? '🔇' : '🔊';
  if (typeof VOX !== 'undefined') {   // recorded voices obey the same mute
    VOX.applyMute();
    if (!effectiveMuted() && winPop.active) VOX.playCadence();
  }
}

/* ---------------- tutorial ---------------- */
function tutActiveFor(type) {
  return !save.tutDone && EVENT_DEFS[type] && EVENT_DEFS[type].tut && !save.tutSeen[type];
}
function refreshTutBar() {
  const bar = el('tutBar');
  if (state === 'event' && ev && tutActiveFor(ev.type)) {
    tutTextEl.textContent = EVENT_DEFS[ev.type].tut;
    bar.classList.remove('hidden');
  } else bar.classList.add('hidden');
}
function markTutSeen(type) {
  if (!EVENT_DEFS[type] || !EVENT_DEFS[type].tut) return;
  save.tutSeen[type] = true;
  if (ALL_EVENTS.every(t => save.tutSeen[t])) save.tutDone = true;
  persist();
}
function skipTutorial() { save.tutDone = true; persist(); refreshTutBar(); }

/* ---------------- flow ---------------- */
function startRun() {
  score = 0; meter = 60; streak = 0; runMerit = 0;
  save.runs++; persist();
  SFX.reveille();
  startDay(1);
}
function startDay(n) {
  day = n; plan = buildDayPlan(n); planIdx = 0;
  dayStats = { obeyed: 0, failed: 0 }; dayMerit = 0;
  showOnly(null);
  state = 'dayintro'; bannerT = 1.7;
  showBanner('DAY ' + n, n === 7 ? '🎓 GRADUATION EVALUATION' : n > 7 ? '♾️ DRILL MODE' : 'RECEPTION WEEK');
  el('evName').textContent = THEMES[save.theme].name;
  updateHUD();
}
function eventTime(type) {
  let t = EVENT_DEFS[type].base * speedMul(day);
  if (save.recruit === 'icy') t += 0.5;
  if (save.dsPack === 'whisper') t *= 1.05;
  return t;
}
function beginEvent(type) {
  const def = EVENT_DEFS[type];
  ev = {
    type, phase: 'intro', t: 0, done: false,
    introDur: Math.max(0.8, 1.5 * Math.max(0.6, speedMul(day))),
    timeTotal: type === 'attention' ? def.base : eventTime(type),
    timeLeft: 0, sayText: '', sayWho: 'senior', sayT: 0, data: null
  };
  ev.timeLeft = ev.timeTotal;
  EV_SETUP[type](ev);
  state = 'event';
  el('evName').textContent = def.title;
  refreshTutBar();
  updateHUD();
}
function nextEvent() {
  planIdx++;
  if (planIdx >= plan.length) { dayComplete(); return; }
  beginEvent(plan[planIdx]);
}
/* Blown-order drain. The standard cost is 22 Squared-Away — but
   Day 1 runs a training drain of 14. Day-1 reachability audit
   (start 60, 5 events, pass +8): at 22, three cold mistakes in a
   row — 60 → 38 → 16 → −6 — recycled a brand-new private before
   he ever saw the whole day, let alone the cadence waiting at the
   end of it; ANY 4 fails killed the run in every order. At 14,
   three straight fails leave 18 and the day still finishes, four
   fails + one obeyed order squeak through at 12, and only blowing
   ALL five orders (60 − 5×14 < 0) still recycles. Reception day
   teaches; it doesn't execute. Days 2+ and Drill Mode keep 22. */
function failDrain() { return day === 1 ? 14 : 22; }
function finishEvent(success) {
  if (!ev || ev.done) return;
  ev.done = true;
  const type = ev.type;
  markTutSeen(type);
  el('tutBar').classList.add('hidden');
  if (type === 'pushups') {
    if (meter <= 0) { gameOver(); return; }
    nextEvent(); return;
  }
  if (success) {
    const timeBonus = Math.round(50 * Math.max(0, ev.timeLeft) / ev.timeTotal);
    const pts = 100 + timeBonus + Math.min(50, streak * 5);
    score += pts; streak++;
    meter = Math.min(100, meter + 8);
    save.merit += 3; dayMerit += 3; runMerit += 3;
    save.ordersObeyed++; dayStats.obeyed++;
    SFX.ding();
    if (rnd() < 0.3) showToast(pick(WIN_QUIPS) + ' +' + pts, 1100);
    else showToast('SQUARED AWAY! +' + pts, 1100);
  } else {
    streak = 0; meter -= failDrain(); dayStats.failed++;
    SFX.buzzer();
    triggerFailFlash();
  }
  persist(); updateHUD();
  if (success) nextEvent();
  else beginEvent('pushups');
}
function dayComplete() {
  state = 'dayend';
  ev = null;
  CG.gameplayStop();
  save.daysServed++;
  save.bestDay = Math.max(save.bestDay, day);
  let bonus = 15, title = 'DAY ' + day + ' COMPLETE', extra = '';
  if (day === 7) {
    bonus = 65; save.graduations++;
    title = '🎓 GRADUATION — DAY 7 COMPLETE!';
    extra = '<br>🎖️ Graduation bonus banked. Welcome to <b>Drill Mode</b> — it never ends now.';
    SFX.fanfare(); CG.happytime();
  } else SFX.ding();
  save.merit += bonus; dayMerit += bonus; runMerit += bonus;
  save.bestScore = Math.max(save.bestScore, score);
  persist(); updateHUD();
  el('dayEndTitle').textContent = title;
  el('dayEndStats').innerHTML =
    'Orders obeyed: <b>' + dayStats.obeyed + '</b> · Blown: <b>' + dayStats.failed + '</b><br>' +
    '🏆 Score: <b>' + score + '</b> · ⭐ Merit earned today: <b>' + dayMerit + '</b>' + extra + '<br>' +
    '<span class="small">Tomorrow is faster. It is always faster.</span>';
  el('nextDayBtn').textContent = day === 7 ? 'Enter Drill Mode ➜' : 'Day ' + (day + 1) + ' ➜';
  showOnly('dayend');
  showWinPop();
}
function gameOver() {
  state = 'over';
  ev = null;
  CG.gameplayStop();
  save.bestScore = Math.max(save.bestScore, score);
  persist(); updateHUD(); updateMenuStats();
  el('overStats').innerHTML =
    'Your Squared-Away meter hit zero on <b>Day ' + day + '</b>. Back to Day 1, private.<br>' +
    '🏆 Score: <b>' + score + '</b> · ⭐ Merit banked: <b>' + runMerit + '</b> · 💪 Push-ups served: <b>' + save.pushupsDone + '</b><br>' +
    '<span class="small">The DS is already telling the next bus about you.</span>';
  showOnly('overOv');
}
function pauseGame() {
  if (state !== 'event') return;
  state = 'paused'; CG.gameplayStop(); showOnly('pauseOv');
}
function resumeGame() {
  if (state !== 'paused') return;
  showOnly(null); state = 'event'; CG.gameplayStart();
}
function quitToMenu() {
  state = 'menu'; ev = null;
  CG.gameplayStop();
  save.bestScore = Math.max(save.bestScore, score);
  persist(); updateHUD(); updateMenuStats();
  el('evName').textContent = THEMES[save.theme].name;
  showOnly('menu');
}

/* ---------------- shop ---------------- */
const OWNED_KEY = { recruit: 'recruitsOwned', dsPack: 'dsPacksOwned', theme: 'themesOwned' };
function shopRow(container, def, key, kind) {
  const owned = save[OWNED_KEY[kind]].includes(key);
  const equipped = save[kind] === key;
  const row = document.createElement('div'); row.className = 'upg';
  const info = document.createElement('div'); info.className = 'info';
  const nm = document.createElement('div'); nm.className = 'uname'; nm.textContent = def.icon + ' ' + def.name;
  const ds = document.createElement('div'); ds.className = 'udesc'; ds.textContent = def.desc;
  info.appendChild(nm); info.appendChild(ds);
  if (equipped) { const eq = document.createElement('div'); eq.className = 'uequip'; eq.textContent = '✔ EQUIPPED'; info.appendChild(eq); }
  const btn = document.createElement('button');
  if (equipped) { btn.textContent = 'Equipped'; btn.disabled = true; }
  else if (owned) { btn.textContent = 'Equip'; btn.addEventListener('click', () => { buyOrEquip(kind, key); }); }
  else if (save.merit >= def.cost) { btn.textContent = '⭐ ' + def.cost; btn.addEventListener('click', () => { buyOrEquip(kind, key); }); }
  else { btn.textContent = '⭐ ' + def.cost + ' · Need ' + (def.cost - save.merit) + ' more'; btn.disabled = true; }
  row.appendChild(info); row.appendChild(btn);
  container.appendChild(row);
  return row;
}
function buyOrEquip(kind, key) {
  const table = kind === 'recruit' ? RECRUITS : kind === 'dsPack' ? DS_PACKS : THEMES;
  const def = table[key]; if (!def) return false;
  const ownedKey = OWNED_KEY[kind];
  if (!save[ownedKey].includes(key)) {
    if (save.merit < def.cost) { SFX.wrong(); return false; }
    save.merit -= def.cost; save[ownedKey].push(key);
  }
  save[kind] = key;
  persist(); SFX.ding(); refreshShop(); updateHUD();
  return true;
}
function refreshShop() {
  el('shopMerit').textContent = '⭐ ' + save.merit;
  const rc = el('shopRecruits'); rc.innerHTML = '';
  for (const k of Object.keys(RECRUITS)) shopRow(rc, RECRUITS[k], k, 'recruit');
  const pc = el('shopPacks'); pc.innerHTML = '';
  for (const k of Object.keys(DS_PACKS)) shopRow(pc, DS_PACKS[k], k, 'dsPack');
  const tc = el('shopThemes'); tc.innerHTML = '';
  for (const k of Object.keys(THEMES)) shopRow(tc, THEMES[k], k, 'theme');
}
function openShop() {
  shopReturn = state;
  if (state === 'event') CG.gameplayStop();
  state = 'shop';
  refreshShop();
  showOnly('shop');
}
function closeShop() {
  state = shopReturn;
  if (state === 'menu') { showOnly('menu'); updateMenuStats(); }
  else if (state === 'dayend') showOnly('dayend');
  else if (state === 'over') showOnly('overOv');
  else if (state === 'paused') showOnly('pauseOv');
  else if (state === 'event') { showOnly(null); CG.gameplayStart(); }
  else showOnly(null);
}

/* ============================================================
   EVENTS — each has SETUP / UPDATE / DRAW / DOWN / MOVE / UP.
   The DS bubble + timer bar are drawn by the shared scene
   renderer; events own their props and logic.
   ============================================================ */
function sayTransient(text, dur) {
  if (!ev) return;
  ev.sayText2 = text; ev.sayT = dur || 1.3;
  SFX.bark(2);
}
function dsSprite(shout) { return SPR.ds[save.dsPack + (shout ? 'Shout' : 'Calm')]; }

/* ---------------- RECORDED VOICES (VOX) ----------------
   Carlton: the DS must actually TALK. The bark lines and the whole
   cadence chain are real recorded voice clips (CARLTON'S OWN
   voice, recorded by him in one take on 2026-11-04) shipped flat in the game folder — bark-01..12.mp3 keyed
   to FAIL_FLASH_BARKS by index, cadence.mp3 for the day-pass.
   BARK_DUR / BARK_ENV are measured from the shipped clips
   (duration in seconds; loudness envelope at 20 fps) and drive
   the flash timing and the talking-jaw animation. Every play
   routes through effectiveMuted() — the in-game toggle AND the
   portal's muteAudio both silence the voices. Where no Audio
   exists (headless tests), VOX quietly no-ops and the old synth
   SFX remain as the fallback. */
const BARK_DUR = [1.567, 1.459, 1.634, 3.513, 2.171, 4.069, 2.225, 2.706, 3.429, 3.183, 3.056, 3.276];
const BARK_ENV = [[0.52,0.44,0.28,0.21,0.25,0.43,0.54,0.42,0.25,0.10,0.08,0.26,0.42,0.44,0.41,0.41,0.39,0.42,0.57,0.77,0.94,0.97,0.85,0.67,0.57,0.53,0.57,0.65,0.60,0.36,0.15,0.05],[0.21,0.61,0.83,0.75,0.69,0.66,0.56,0.39,0.22,0.14,0.11,0.11,0.08,0.09,0.22,0.31,0.28,0.19,0.09,0.05,0.11,0.27,0.37,0.34,0.31,0.22,0.09,0.04,0.05,0.03],[0.15,0.42,0.63,0.55,0.26,0.06,0.09,0.22,0.27,0.30,0.30,0.25,0.22,0.21,0.23,0.28,0.35,0.34,0.35,0.43,0.36,0.15,0.08,0.15,0.43,0.78,0.77,0.45,0.27,0.37,0.42,0.26,0.09],[0.31,0.70,0.69,0.31,0.08,0.23,0.64,0.94,0.96,0.85,0.68,0.61,0.75,0.80,0.69,0.62,0.43,0.30,0.47,0.62,0.64,0.62,0.54,0.51,0.55,0.62,0.58,0.34,0.19,0.32,0.49,0.47,0.31,0.18,0.25,0.40,0.46,0.44,0.36,0.31,0.39,0.51,0.60,0.63,0.54,0.38,0.33,0.42,0.47,0.33,0.14,0.04,0.01,0.11,0.38,0.46,0.32,0.35,0.45,0.35,0.18,0.25,0.59,0.74,0.51,0.23,0.10,0.06,0.13,0.19,0.12],[0.21,0.55,0.57,0.38,0.31,0.28,0.26,0.21,0.16,0.13,0.13,0.14,0.10,0.06,0.05,0.05,0.03,0.01,0.00,0.00,0.02,0.08,0.12,0.15,0.40,0.69,0.66,0.55,0.40,0.17,0.05,0.02,0.08,0.19,0.22,0.19,0.15,0.08,0.03,0.03,0.09,0.11,0.07,0.03],[0.25,0.52,0.49,0.29,0.31,0.48,0.44,0.27,0.21,0.22,0.27,0.29,0.33,0.27,0.11,0.06,0.07,0.06,0.03,0.01,0.05,0.33,0.79,0.98,0.82,0.49,0.20,0.09,0.07,0.05,0.03,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.05,0.30,0.65,0.66,0.37,0.14,0.05,0.03,0.06,0.29,0.62,0.75,0.79,0.81,0.73,0.68,0.68,0.64,0.49,0.23,0.06,0.03,0.13,0.26,0.25,0.29,0.48,0.59,0.66,0.73,0.74,0.73,0.75,0.75,0.67,0.54,0.39,0.22,0.08],[0.26,0.64,0.81,0.69,0.41,0.21,0.31,0.53,0.66,0.66,0.57,0.61,0.80,0.87,0.82,0.76,0.66,0.57,0.57,0.68,0.78,0.89,0.96,0.95,0.90,0.87,0.93,0.96,0.84,0.58,0.33,0.22,0.15,0.08,0.07,0.17,0.40,0.67,0.77,0.72,0.57,0.40,0.28,0.15,0.05],[0.08,0.19,0.29,0.37,0.39,0.32,0.22,0.11,0.03,0.01,0.00,0.00,0.16,0.57,0.78,0.51,0.16,0.03,0.07,0.22,0.32,0.29,0.23,0.15,0.06,0.04,0.14,0.26,0.25,0.16,0.07,0.04,0.07,0.11,0.17,0.22,0.24,0.25,0.26,0.25,0.19,0.10,0.04,0.03,0.06,0.14,0.27,0.36,0.34,0.29,0.27,0.23,0.15,0.07,0.03],[0.31,0.72,0.82,0.57,0.42,0.56,0.71,0.78,0.85,0.86,0.84,0.65,0.38,0.30,0.32,0.46,0.63,0.71,0.66,0.49,0.26,0.09,0.03,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.03,0.30,0.67,0.60,0.23,0.14,0.30,0.56,0.81,0.79,0.63,0.53,0.42,0.43,0.59,0.66,0.58,0.37,0.15,0.05,0.14,0.28,0.24,0.22,0.40,0.45,0.37,0.36,0.42,0.50,0.48,0.37,0.23,0.12],[0.28,0.73,0.90,0.64,0.42,0.45,0.52,0.48,0.40,0.36,0.42,0.48,0.52,0.69,0.84,0.77,0.62,0.56,0.58,0.52,0.50,0.61,0.55,0.37,0.25,0.19,0.19,0.16,0.09,0.12,0.27,0.40,0.41,0.39,0.35,0.30,0.24,0.13,0.04,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.01,0.07,0.19,0.40,0.68,0.73,0.51,0.24,0.11,0.11,0.15,0.23,0.43,0.55,0.45,0.28,0.16,0.08],[0.20,0.48,0.47,0.36,0.51,0.74,0.91,0.89,0.71,0.50,0.28,0.16,0.29,0.51,0.53,0.40,0.34,0.27,0.13,0.06,0.19,0.53,0.77,0.65,0.40,0.28,0.32,0.35,0.25,0.10,0.02,0.01,0.01,0.01,0.00,0.00,0.01,0.21,0.63,0.80,0.59,0.47,0.61,0.59,0.36,0.32,0.50,0.65,0.67,0.63,0.57,0.54,0.51,0.37,0.36,0.50,0.47,0.30,0.13,0.04,0.04,0.04],[0.23,0.61,0.81,0.69,0.53,0.46,0.50,0.50,0.34,0.15,0.32,0.73,0.79,0.58,0.49,0.41,0.41,0.55,0.62,0.49,0.36,0.47,0.59,0.41,0.16,0.05,0.04,0.14,0.35,0.42,0.26,0.08,0.09,0.15,0.14,0.09,0.07,0.24,0.61,0.75,0.60,0.42,0.30,0.23,0.17,0.08,0.02,0.18,0.49,0.54,0.40,0.34,0.33,0.24,0.15,0.09,0.15,0.34,0.48,0.52,0.59,0.65,0.56,0.37,0.19,0.07]];
const VOX = {
  barks: [], cadence: null, cadenceReady: false,
  init() {
    try {
      if (typeof Audio === 'undefined') return;
      for (let i = 0; i < FAIL_FLASH_BARKS.length; i++) {
        const a = new Audio();
        a.preload = 'auto'; a.volume = 0.95;
        a.src = 'bark-' + String(i + 1).padStart(2, '0') + '.mp3';
        this.barks.push(a);
      }
      const c = new Audio();
      c.preload = 'auto'; c.volume = 0.95; c.src = 'cadence.mp3';
      c.addEventListener('canplaythrough', () => { this.cadenceReady = true; });
      this.cadence = c;
    } catch (e) { this.barks = []; this.cadence = null; }
  },
  // returns true when the recorded-voice path owns this bark
  // (played, or deliberately silent because the game is muted)
  playBark(idx) {
    const a = this.barks[idx];
    if (!a) return false;
    if (effectiveMuted()) return true;
    try { a.pause(); a.currentTime = 0; const p = a.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
    return true;
  },
  barkPos(idx) {
    const a = this.barks[idx];
    if (a && !a.paused && !a.ended) return a.currentTime;
    return -1;
  },
  playCadence() {
    if (!this.cadence) return false;
    if (effectiveMuted()) return true;
    try { this.cadence.currentTime = 0; const p = this.cadence.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
    return true;
  },
  stopCadence() { if (this.cadence) { try { this.cadence.pause(); } catch (e) {} } },
  stopBark() { for (const a of this.barks) { try { a.pause(); } catch (e) {} } },
  cadenceAudible() { return !!this.cadence && !effectiveMuted(); },
  applyMute() {
    if (!effectiveMuted()) return;
    this.stopBark(); this.stopCadence();
  }
};
VOX.init();

/* ---------------- THE FAIL FLASH ----------------
   On every blown order: a huge DS face fills the screen with a
   screen shake and one line from the rotating bark bank — SPOKEN
   by the recorded DS voice while the face TALKS with the
   syllables (see drawFlashHead) — then the push-up beat proceeds
   as normal. Purely visual; input and timers are untouched.

   THE FACE (Carlton, Nov 4, final form): the flash shipped first
   as a photoreal portrait, then as that portrait with a
   canvas-animated jaw — and he still read it as "a still photo,
   it ain't moving." His fix: "maybe he can be a cartoon, but
   just a talking type of cartoon — a realistic looking talking
   cartoon saying the words of the voice you put with it." So
   the flash face is now a detailed shaded CARTOON head drawn in
   code: same character language as the covers and the stage DS
   (campaign hat TILTED low, brim shadow over hard bare eyes, no
   sunglasses) with a rigged jaw and mouth — FOUR mouth states
   (closed / slight / mid / wide) selected every frame from the
   bark clip's loudness envelope, so the mouth slams shut
   between words exactly like a man talking, while the brows
   furrow and the whole head lunges and shakes with the bark.
   The photograph (ds-flash.jpg) is retired from the game; the
   original file lives in basic-training-art-raw/ with the
   rejected generation candidates.

   VOICE-SWAP PATH: the rig reads ONLY the bark clips plus the
   baked BARK_DUR / BARK_ENV constants. A replacement DS voice
   drops in by putting new raw clips at
   basic-training-art-raw/audio/raw/bark-01..12.mp3, re-running
   audio/build_audio.py (it re-encodes bark-01..12.mp3 here and
   re-measures durations + envelopes), and pasting its printed
   BARK_DUR / BARK_ENV over the constants in the VOX block.
   No rig code changes. */
const flash = { active: false, t: 0, dur: 0.85, text: '', barkIdx: -1, jaw: 0, jawOverride: null };
function nextBarkLine() {
  if (!Array.isArray(save.barkBag) || !save.barkBag.length) {
    save.barkBag = shuffle(FAIL_FLASH_BARKS.map((_, i) => i));
  }
  const idx = save.barkBag.pop();
  persist();
  flash.barkIdx = idx;   // audio clip + envelope ride the same index as the text
  return FAIL_FLASH_BARKS[idx];
}
function triggerFailFlash() {
  flash.text = nextBarkLine();
  // the face stays up for as long as the bark takes to say
  flash.dur = Math.max(0.95, Math.min(6.0, (BARK_DUR[flash.barkIdx] || 0.85) + 0.15));
  flash.t = flash.dur;
  flash.active = true;
  if (!VOX.playBark(flash.barkIdx)) SFX.bark(3);   // synth only where no Audio exists
}
/* How open the DS mouth is right now, 0..1 — driven by the bark
   clip's measured loudness envelope at the playback position
   (or the flash clock when the voice is muted/absent), so the
   mouth works WITH the syllables. jawOverride is a test hook. */
function flashJawAmount() {
  if (flash.jawOverride != null) return flash.jawOverride;
  const env = BARK_ENV[flash.barkIdx];
  if (!env || !env.length) return 0;
  let pos = VOX.barkPos(flash.barkIdx);
  if (pos < 0) pos = flash.dur - flash.t;
  const f = Math.max(0, Math.min(env.length - 1, Math.floor(pos * 20)));
  const cur = env[f], nxt = env[Math.min(env.length - 1, f + 1)];
  return Math.max(0, Math.min(1, (cur + nxt) / 2));
}
/* Which of the four mouth states an envelope value selects.
   Under 0.10 the mouth is CLOSED — between words and on quiet
   consonants it shuts, and that shutting is what makes the open
   states read as speech instead of a hole in the face. */
function flashMouthState(jaw) {
  if (jaw < 0.10) return 0;
  if (jaw < 0.35) return 1;
  if (jaw < 0.65) return 2;
  return 3;
}
/* hex color -> rgb() string shifted toward black (amt<0) or
   white (amt>0); the flash head's shading is built from these. */
function shadeOf(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amt < 0 ? 0 : 255, f = Math.abs(amt);
  r = Math.round(r + (t - r) * f); g = Math.round(g + (t - g) * f); b = Math.round(b + (t - b) * f);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}
/* THE TALKING HEAD — a face-filling cartoon drill sergeant,
   drawn fresh every frame in a 900x900 stage (the old photo's
   frame), centered on (cx, cy) at size s. jaw (0..1) is the
   live envelope value: it picks the mouth state, drops the jaw
   group on its hinge, and widens the shout. fury (0..1) drives
   the brow furrow and creases. Layers, back to front: shoulders
   + collar, neck, the JAW GROUP (chin, stubble, jaw shading —
   translated/rotated as one piece so it can never tear), the
   upper head (skull, ears, nose, hard eyes, brows), the mouth
   assembly (interior, teeth, tongue — spanning both layers),
   then the tilted campaign hat and the brim's shadow band laid
   over the eyes. At jaw = 0 the head is at rest: mouth shut,
   jaw seated — that rest head is also the flash's only
   fallback; there is no image left to fail to load. */
function drawFlashHead(g, cx, cy, s, jaw, fury) {
  const P = DS_PACK_ART[save.dsPack] || DS_PACK_ART.classic;
  const skin = P.skin, band = P.band, shirt = P.shirt, hat = '#6b4a2a';
  const state = flashMouthState(jaw);
  const drop = jaw * 34;                    // chin travel on its hinge
  const openH = [2, 13, 33, 58][state];     // mouth interior height
  const lipY = 668, mCx = 450;
  const mHW = 80 + state * 7;               // mouth half-width
  g.save();
  g.translate(cx - s / 2, cy - s / 2);
  g.scale(s / 900, s / 900);

  /* ---- shoulders + uniform collar ---- */
  let gr = g.createLinearGradient(0, 750, 0, 900);
  gr.addColorStop(0, shadeOf(shirt, -0.02)); gr.addColorStop(1, shadeOf(shirt, -0.30));
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(60, 900); g.bezierCurveTo(130, 806, 300, 768, 450, 760);
  g.bezierCurveTo(600, 768, 770, 806, 840, 900); g.closePath(); g.fill();
  g.fillStyle = shadeOf(shirt, -0.38);         // collar V shadow
  g.beginPath();
  g.moveTo(400, 772); g.lineTo(450, 846); g.lineTo(500, 772); g.lineTo(518, 900); g.lineTo(382, 900); g.closePath(); g.fill();
  g.fillStyle = shadeOf(shirt, -0.16);         // collar flaps
  g.beginPath(); g.moveTo(394, 768); g.lineTo(450, 840); g.lineTo(434, 856); g.lineTo(368, 786); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(506, 768); g.lineTo(450, 840); g.lineTo(466, 856); g.lineTo(532, 786); g.closePath(); g.fill();
  g.fillStyle = '#c9a227';                  // collar brass
  for (const bx of [404, 496]) {
    g.beginPath(); g.arc(bx, 852, 9, 0, 7); g.fill();
    g.strokeStyle = 'rgba(80,58,4,.7)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(bx - 5, 847); g.lineTo(bx + 5, 857); g.moveTo(bx + 5, 847); g.lineTo(bx - 5, 857); g.stroke();
  }

  /* ---- neck (mostly in the jaw's shadow) ---- */
  g.fillStyle = shadeOf(skin, -0.17);
  g.beginPath();
  g.moveTo(398, 686); g.lineTo(502, 686); g.lineTo(512, 788);
  g.bezierCurveTo(480, 806, 420, 806, 388, 788); g.closePath(); g.fill();
  g.fillStyle = 'rgba(40,16,4,.32)';
  g.beginPath(); g.ellipse(450, 706, 92, 24, 0, 0, 7); g.fill();

  /* ---- THE JAW GROUP: chin + stubble + jaw shading, moved as
     one piece (drop + a hinge rotation at ear height), so the
     lower face can work without ever tearing at a seam. The
     upper head is drawn over its top edge at every position. */
  g.save();
  g.translate(450, 615); g.rotate(jaw * 0.05); g.translate(-450, -615);
  g.translate(0, drop);
  const jawPath = () => {
    g.beginPath();
    g.moveTo(234, 560);
    g.bezierCurveTo(228, 652, 242, 730, 304, 784);
    g.bezierCurveTo(354, 824, 546, 824, 596, 784);
    g.bezierCurveTo(658, 730, 672, 652, 666, 560);
    g.bezierCurveTo(596, 590, 304, 590, 234, 560);
    g.closePath();
  };
  gr = g.createLinearGradient(0, 540, 0, 824);
  gr.addColorStop(0, shadeOf(skin, -0.01)); gr.addColorStop(1, shadeOf(skin, -0.14));
  g.fillStyle = gr; jawPath(); g.fill();
  g.save(); jawPath(); g.clip();
  g.fillStyle = 'rgba(74,34,8,.15)';        // masseter (jaw muscle) shading
  g.beginPath(); g.ellipse(268, 672, 36, 86, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(632, 672, 36, 86, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(74,34,8,.13)';        // under-chin shade
  g.beginPath(); g.ellipse(450, 808, 180, 44, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,226,178,.10)';    // chin highlight
  g.beginPath(); g.ellipse(450, 748, 58, 18, 0, 0, 7); g.fill();
  // stubble: a deterministic speckle (same seed every frame —
  // a beard, not television static)
  let seed = 987654321;
  const srnd = () => { seed = (seed * 48271) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 650; i++) {
    const sx = 245 + srnd() * 410, sy = 640 + Math.pow(srnd(), 1.35) * 166;
    g.fillStyle = 'rgba(34,20,10,' + (0.04 + srnd() * 0.07).toFixed(3) + ')';
    g.beginPath(); g.arc(sx, sy, 1 + srnd() * 1.8, 0, 7); g.fill();
  }
  g.restore();
  g.restore();

  /* ---- UPPER HEAD: skull, ears, nose, eyes, brows ---- */
  gr = g.createLinearGradient(0, 130, 0, 690);
  gr.addColorStop(0, shadeOf(skin, 0.10)); gr.addColorStop(0.45, skin); gr.addColorStop(1, shadeOf(skin, -0.05));
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(450, 150);
  g.bezierCurveTo(562, 150, 650, 220, 670, 340);
  g.bezierCurveTo(684, 430, 680, 540, 664, 632);
  g.bezierCurveTo(622, 676, 544, 692, 450, 692);
  g.bezierCurveTo(356, 692, 278, 676, 236, 632);
  g.bezierCurveTo(220, 540, 216, 430, 230, 340);
  g.bezierCurveTo(250, 220, 338, 150, 450, 150);
  g.closePath(); g.fill();
  // ears
  for (const m of [-1, 1]) {
    g.fillStyle = shadeOf(skin, -0.05);
    g.beginPath(); g.ellipse(450 + m * 232, 530, 30, 54, 0, 0, 7); g.fill();
    g.fillStyle = shadeOf(skin, -0.24);
    g.beginPath(); g.ellipse(450 + m * 236, 532, 13, 30, 0, 0, 7); g.fill();
  }
  // broad shading: temples, cheeks, cheekbone light
  g.fillStyle = 'rgba(84,40,10,.10)';
  g.beginPath(); g.ellipse(272, 330, 44, 108, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(628, 330, 44, 108, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(84,40,10,.08)';
  g.beginPath(); g.ellipse(296, 572, 50, 66, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(604, 572, 50, 66, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,228,178,.10)';
  g.beginPath(); g.ellipse(322, 506, 42, 24, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(578, 506, 42, 24, 0, 0, 7); g.fill();
  // nose: bridge shade, base, nostrils, highlight
  g.fillStyle = 'rgba(92,46,16,.12)';
  g.beginPath(); g.moveTo(430, 452); g.lineTo(442, 452); g.lineTo(438, 542); g.lineTo(426, 542); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(458, 452); g.lineTo(470, 452); g.lineTo(474, 542); g.lineTo(462, 542); g.closePath(); g.fill();
  g.fillStyle = shadeOf(skin, -0.12);
  g.beginPath(); g.ellipse(450, 596, 36, 17, 0, 0, 7); g.fill();
  g.strokeStyle = 'rgba(80,40,14,.35)'; g.lineWidth = 4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(424, 590); g.quadraticCurveTo(450, 610, 476, 590); g.stroke();
  g.fillStyle = 'rgba(43,20,7,.6)';
  g.beginPath(); g.ellipse(433, 600, 8.5, 5.5, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(467, 600, 8.5, 5.5, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,232,188,.13)';
  g.beginPath(); g.ellipse(444, 546, 9, 30, -0.08, 0, 7); g.fill();
  // nasolabial folds — they deepen with fury
  g.strokeStyle = 'rgba(74,36,12,' + (0.10 + 0.22 * fury).toFixed(3) + ')'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(406, 600); g.quadraticCurveTo(386, 642, 394, 668); g.stroke();
  g.beginPath(); g.moveTo(494, 600); g.quadraticCurveTo(514, 642, 506, 668); g.stroke();
  // eyes: hard, bare, narrowed — sockets, whites, irises, lids
  for (const m of [-1, 1]) {
    const ecx = 450 + m * 102;
    g.fillStyle = 'rgba(84,40,10,.10)';
    g.beginPath(); g.ellipse(ecx, 502, 60, 28, 0, 0, 7); g.fill();
    g.fillStyle = '#e9e3d3';
    g.beginPath();
    g.moveTo(ecx - 47, 508); g.quadraticCurveTo(ecx, 491, ecx + 47, 508);
    g.quadraticCurveTo(ecx, 523, ecx - 47, 508); g.closePath(); g.fill();
    g.fillStyle = '#2c1a0e';
    g.beginPath(); g.arc(ecx + m * 3, 507, 14, 0, 7); g.fill();
    g.fillStyle = '#070302';
    g.beginPath(); g.arc(ecx + m * 3, 507, 6, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.beginPath(); g.arc(ecx - 4, 501, 3, 0, 7); g.fill();
    // heavy upper lid, slanted down toward the nose — the anger
    g.strokeStyle = shadeOf(skin, -0.30); g.lineWidth = 14; g.lineCap = 'round';
    g.beginPath(); g.moveTo(ecx - m * 51, 492); g.quadraticCurveTo(ecx, 486 + fury * 3, ecx + m * 51, 505); g.stroke();
    g.strokeStyle = 'rgba(70,36,12,.55)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(ecx - m * 51, 480); g.quadraticCurveTo(ecx, 474 + fury * 3, ecx + m * 51, 492); g.stroke();
    g.strokeStyle = 'rgba(70,36,12,.45)';
    g.beginPath(); g.moveTo(ecx - 38, 521); g.quadraticCurveTo(ecx, 529, ecx + 38, 521); g.stroke();
  }
  // brows: thick, dropped at the inner ends — furrow scales with fury
  for (const m of [-1, 1]) {
    g.strokeStyle = '#221206'; g.lineWidth = 18; g.lineCap = 'round';
    g.beginPath(); g.moveTo(450 + m * 160, 466 + fury * 3); g.lineTo(450 + m * 40, 480 + fury * 13); g.stroke();
    g.strokeStyle = 'rgba(34,18,6,.6)'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(450 + m * 152, 458 + fury * 3); g.lineTo(450 + m * 48, 471 + fury * 13); g.stroke();
  }
  // forehead creases between the brows
  g.strokeStyle = 'rgba(74,36,12,' + (0.08 + 0.30 * fury).toFixed(3) + ')'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(430, 474); g.quadraticCurveTo(450, 468 + fury * 5, 470, 474); g.stroke();

  /* ---- MOUTH ASSEMBLY: spans the upper head and the jaw
     group — interior height IS the jaw state, teeth hang from
     the upper lip, tongue rides the bottom. ---- */
  if (state === 0) {
    // pressed shut: a grim line, lips sealed between words
    g.strokeStyle = '#6e3b26'; g.lineWidth = 8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(mCx - mHW, lipY + 1); g.quadraticCurveTo(mCx, lipY + 7, mCx + mHW, lipY + 1); g.stroke();
    g.strokeStyle = 'rgba(70,36,12,.30)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(mCx - mHW * 0.8, lipY - 7); g.quadraticCurveTo(mCx, lipY - 3, mCx + mHW * 0.8, lipY - 7); g.stroke();
    g.fillStyle = 'rgba(60,28,8,.25)';
    g.beginPath(); g.ellipse(mCx, lipY + 14, mHW * 0.5, 6, 0, 0, 7); g.fill();
  } else {
    const mBot = lipY + openH;
    const cornerL = lipY - (state === 3 ? 5 : 0), cornerR = lipY + 1;
    const traceMouth = () => {
      g.beginPath();
      g.moveTo(mCx - mHW, cornerL);
      g.quadraticCurveTo(mCx, lipY - 7, mCx + mHW, cornerR);
      g.quadraticCurveTo(mCx + mHW * 0.55, mBot, mCx, mBot + 2);
      g.quadraticCurveTo(mCx - mHW * 0.55, mBot, mCx - mHW, cornerL);
      g.closePath();
    };
    gr = g.createLinearGradient(0, lipY, 0, mBot);
    gr.addColorStop(0, '#431207'); gr.addColorStop(1, '#1d0503');
    g.fillStyle = gr; traceMouth(); g.fill();
    g.save(); traceMouth(); g.clip();
    // upper teeth, hanging from the upper lip
    const teethH = Math.min(16, openH * 0.5 + 4);
    g.fillStyle = '#e9e2cf';
    g.fillRect(mCx - mHW * 0.82, lipY - 4, mHW * 1.64, teethH);
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2;
    for (const tx of [-0.30, 0, 0.30]) {
      g.beginPath(); g.moveTo(mCx + tx * mHW * 2 * 0.82, lipY - 2); g.lineTo(mCx + tx * mHW * 2 * 0.82, lipY - 4 + teethH); g.stroke();
    }
    if (state >= 2) {
      // tongue + lower teeth ride the jaw
      g.fillStyle = '#93453a';
      g.beginPath(); g.ellipse(mCx, mBot - 3, mHW * 0.46, Math.max(5, openH * 0.30), 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(255,180,150,.25)';
      g.beginPath(); g.ellipse(mCx - mHW * 0.12, mBot - 6, mHW * 0.22, Math.max(2.5, openH * 0.13), 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(221,213,192,.92)';
      g.fillRect(mCx - mHW * 0.6, mBot - 7, mHW * 1.2, 7);
    }
    g.restore();
    g.strokeStyle = 'rgba(70,32,16,.85)'; g.lineWidth = 5; traceMouth(); g.stroke();
    // lower-lip light + the shadow the open mouth throws on the chin
    g.strokeStyle = 'rgba(255,210,170,.18)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(mCx - mHW * 0.6, mBot + 5); g.quadraticCurveTo(mCx, mBot + 11, mCx + mHW * 0.6, mBot + 5); g.stroke();
    g.fillStyle = 'rgba(50,22,6,' + (0.10 + 0.14 * jaw).toFixed(3) + ')';
    g.beginPath(); g.ellipse(mCx, mBot + 17, mHW * 0.7, 8, 0, 0, 7); g.fill();
  }

  /* ---- THE HAT: one tilted group, pulled LOW — crown, band,
     brass, and the wide brim whose front edge rides right over
     the brows. Then its shadow, laid across the eyes. ---- */
  g.save();
  g.translate(450, 330); g.rotate(0.055); g.translate(-450, -330);
  gr = g.createLinearGradient(0, 70, 0, 400);
  gr.addColorStop(0, shadeOf(hat, 0.10)); gr.addColorStop(1, shadeOf(hat, -0.14));
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(450, 235, 205, 165, 0, 0, 7); g.fill();          // crown
  g.fillStyle = shadeOf(hat, -0.08);
  g.beginPath(); g.ellipse(450, 148, 100, 30, 0, 0, 7); g.fill();           // crown pinch
  g.fillStyle = band; g.fillRect(292, 318, 316, 54);                        // hat band (inside the crown's silhouette)
  g.fillStyle = shadeOf(band, -0.30); g.fillRect(292, 362, 316, 10);
  g.fillStyle = '#c9a227';                                                  // band brass
  g.fillRect(437, 324, 26, 28);
  g.strokeStyle = 'rgba(80,58,4,.8)'; g.lineWidth = 3; g.strokeRect(443, 330, 14, 16);
  gr = g.createLinearGradient(0, 326, 0, 458);
  gr.addColorStop(0, shadeOf(hat, 0.03)); gr.addColorStop(1, shadeOf(hat, -0.18));
  g.fillStyle = gr;
  g.beginPath(); g.ellipse(450, 392, 412, 66, 0, 0, 7); g.fill();           // brim
  g.save();
  g.beginPath(); g.rect(0, 392, 900, 80); g.clip();
  g.strokeStyle = 'rgba(20,10,2,.35)'; g.lineWidth = 4;
  g.beginPath(); g.ellipse(450, 392, 412, 66, 0, 0, 7); g.stroke();         // brim front edge
  g.restore();
  // the brim's shadow band across the eyes — the menace lives here
  // (kept translucent and soft: a shadow, never a visor)
  g.fillStyle = 'rgba(22,10,3,.21)';
  g.beginPath(); g.ellipse(450, 482, 300, 76, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(22,10,3,.08)';
  g.beginPath(); g.ellipse(450, 514, 288, 42, 0, 0, 7); g.fill();
  g.restore();

  g.restore();
}
function drawFailFlash(g) {
  if (!flash.active) return;
  const remain = Math.max(0, flash.t / flash.dur);
  g.fillStyle = 'rgba(52,8,4,' + (0.45 + 0.25 * remain) + ')';
  g.fillRect(0, 0, W, H);
  // the talking cartoon head: scale-punch as it lands, then it
  // LOOMS — lunging and shaking, gated by the bark envelope,
  // while the mouth works the syllables. jaw = 0 is the head at
  // rest; that rest head is the only fallback (no image to load).
  const jaw = flashJawAmount();
  flash.jaw = jaw;
  const fury = Math.max(jaw, remain * 0.6);
  const punch = 1 + 0.24 * remain * remain + 0.045 * jaw;
  const s = 620 * punch;
  const cxp = W / 2 + (Math.sin(timeNow * 57) * 2.4 + Math.sin(timeNow * 31) * 1.4) * jaw;
  const cyp = 212 + Math.cos(timeNow * 47) * 2.0 * jaw;
  g.save();
  g.translate(cxp, cyp); g.rotate(Math.sin(timeNow * 41) * 0.008 * jaw); g.translate(-cxp, -cyp);
  drawFlashHead(g, cxp, cyp, s, jaw, fury);
  g.restore();
  // the bark, on a stencil ribbon across the bottom
  g.fillStyle = 'rgba(14,14,8,.92)';
  g.beginPath(); g.roundRect(60, H - 118, W - 120, 76, 12); g.fill();
  g.strokeStyle = '#ffd94d'; g.lineWidth = 3;
  g.beginPath(); g.roundRect(60, H - 118, W - 120, 76, 12); g.stroke();
  g.fillStyle = '#ffe9a8';
  g.font = 'bold 30px "Arial Black", "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  const lines = wrapLines(g, flash.text, W - 190);
  lines.forEach((ln, i) => g.fillText(ln, W / 2, H - 118 + (lines.length > 1 ? 32 : 50) + i * 34));
  g.textAlign = 'left';
}

/* ---------------- THE DAY-PASS CADENCE ----------------
   The win counterpart to the fail flash — Carlton's pair. Passing a
   Day plays the cadence video (ds-win.mp4) on the day-complete
   screen: the DS marching the squad in step, calling cadence. The
   ribbon runs the traditional CALL & RESPONSE chain exactly as
   dictated: the DS calls a line, the SQUAD answers "YOU'RE RIGHT!"
   — the response is its own beat, in its own color, never part of
   the call. This "when you left" chain is the primary cadence and
   stays intact, in this order. Stomp drums underneath are
   synthesized in the same WebAudio kit as everything else. Tap the
   video to skip it; the poster still (ds-win.jpg) is the fallback
   if the clip can't play. */
const CADENCE_CHAIN = [
  { who: 'DS', text: 'YOUR MAMA WAS HOME WHEN YOU LEFT!' },
  { who: 'SQUAD', text: "YOU'RE RIGHT!" },
  { who: 'DS', text: 'YOUR DADDY WAS HOME WHEN YOU LEFT!' },
  { who: 'SQUAD', text: "YOU'RE RIGHT!" },
  { who: 'DS', text: 'YOUR MAMA, YOUR DADDY, THE DOG, THE CAT, THE RAT WERE ALL HOME WHEN YOU LEFT!' },
  { who: 'SQUAD', text: "YOU'RE RIGHT! YOU'RE RIGHT!" }
];
/* Per-line slot durations of the recorded cadence mix
   (cadence.mp3): each voice segment was assembled into exactly
   its slot, so when the clip plays, the ribbon steps in sync
   with the voices — DS call, squad answer, in Carlton's order,
   marching stomps mixed underneath. Total = one full chain. */
const CADENCE_STEP_DUR = [2.0, 1.0, 2.05, 1.0, 5.3, 1.5];
const winPop = { active: false, step: 0, t: 0, beat: 0, fromMenu: false };
function cadenceStomp(big) {
  tone(95, 0.13, 'sine', big ? 0.24 : 0.15, 44);
  noiseBurst(0.05, big ? 0.10 : 0.06, 900, 'lowpass');
}
function advanceCadence() {
  winPop.step = (winPop.step + 1) % CADENCE_CHAIN.length;
  const line = CADENCE_CHAIN[winPop.step];
  const who = el('cadenceWho'), txt = el('cadenceText');
  if (who) { who.textContent = line.who === 'DS' ? '🗣️ DS' : '📣 SQUAD'; who.className = line.who === 'DS' ? 'whoDs' : 'whoSquad'; }
  if (txt) txt.textContent = line.text;
  if (line.who === 'DS' && !VOX.cadenceAudible()) SFX.bark(2);   // synth only when the recorded chain isn't sounding
}
function showWinPop() {
  const pop = el('winPop'), v = el('winVid');
  if (pop) pop.classList.remove('hidden');
  winPop.active = true; winPop.step = -1; winPop.t = 0; winPop.beat = 0;
  advanceCadence();
  VOX.playCadence();   // the recorded chain: DS calls, squad answers, stomps under
  if (v) {
    try { v.currentTime = 0; } catch (e) {}
    if (typeof v.play === 'function') { try { const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  }
}
/* FRONT-DOOR CADENCE (Carlton): the day-pass cadence is the game's
   best moment, but it sat buried behind a full Day clear — so the
   main menu (and How to Play) carry a HEAR THE CADENCE button that
   borrows THIS pop, not a copy of it: the winPop element is
   re-homed into the menu's slot for the show and returned to its
   day-end home slot when it stops, whichever way it stops (skip
   tap, button toggle, or leaving the menu). Same video, same
   recorded chain in Carlton's voice, same ribbon, same mute rules
   (every play routes through VOX / effectiveMuted) — one player,
   two doors. No save, progress or day flow is touched. */
function placeWinPop(slot) {
  const pop = el('winPop');
  if (pop && slot) { try { slot.appendChild(pop); } catch (e) {} }
}
function showMenuCadence() {
  if (winPop.active && winPop.fromMenu) { stopWinPop(); return; }   // the button toggles it off
  placeWinPop(el('winPopSlot'));
  winPop.fromMenu = true;
  showWinPop();
}
function stopWinPop() {
  if (!winPop.active) return;
  winPop.active = false;
  VOX.stopCadence();
  const pop = el('winPop'), v = el('winVid');
  if (pop) pop.classList.add('hidden');
  if (v && typeof v.pause === 'function') { try { v.pause(); } catch (e) {} }
  if (winPop.fromMenu) { winPop.fromMenu = false; placeWinPop(el('winPopSlotHome')); }
}
function updateWinPop(dt) {
  if (!winPop.active) return;
  if (state !== 'dayend' && !(winPop.fromMenu && state === 'menu')) { stopWinPop(); return; }
  winPop.t += dt;
  // ribbon steps on the recorded mix's slot boundaries when the
  // voice path exists; the text-length heuristic is the fallback
  const stepDur = VOX.cadence ? (CADENCE_STEP_DUR[winPop.step] || 0.95)
    : (CADENCE_CHAIN[winPop.step].text.length > 40 ? 1.5 : 0.95);
  if (winPop.t >= stepDur) {
    winPop.t = 0; advanceCadence();
    if (winPop.step === 0) VOX.playCadence();   // chain wrapped — voices start the next pass
  }
  winPop.beat += dt;
  if (winPop.beat >= 0.48) { winPop.beat = 0; if (!VOX.cadenceAudible()) cadenceStomp(winPop.step % 2 === 0); }
}

/* ---------------- OFF THE BUS ---------------- */
const BUS_DOOR = { x: 922, y: 240, w: 62, h: 180 };
const EV_SETUP = {}, EV_UPDATE = {}, EV_DRAW = {}, EV_DOWN = {}, EV_MOVE = {}, EV_UP = {};
EV_SETUP.bus = e => {
  const names = shuffle(['JONES', 'SMITH', 'GARCIA', 'BROWN', 'LEE', 'KIM', 'PATEL', 'BROOKS', 'HAYES', 'FORD', 'REYES', 'WILLIAMS']);
  const cols = ['#6a7256', '#77754f', '#5d6b47', '#71684a'];
  const bags = [];
  for (let i = 0; i < 12; i++) {
    const cx = 52 + (i % 4) * 132, cy = 196 + Math.floor(i / 4) * 88;
    bags.push({ x: cx, y: cy, w: 118, h: 66, name: names[i], mine: names[i] === 'WILLIAMS', col: cols[i % 4], flash: 0 });
  }
  e.data = { bags, stage: 0 };
  e.sayText = 'GET OFF MY BUS! FIND YOUR DUFFEL, WILLIAMS!';
  SFX.brakes(); SFX.bark(3);
};
EV_DRAW.bus = (g, e) => {
  const d = e.data;
  g.drawImage(SPR.bus, 548, 168, 452, 241);
  if (d.stage === 1) {
    const pulse = 0.6 + 0.4 * Math.sin(timeNow * 8);
    g.strokeStyle = 'rgba(255,217,77,' + pulse + ')'; g.lineWidth = 5;
    g.beginPath(); g.roundRect(BUS_DOOR.x, BUS_DOOR.y, BUS_DOOR.w, BUS_DOOR.h, 8); g.stroke();
    g.fillStyle = '#ffd94d'; g.font = 'bold 17px "Trebuchet MS"'; g.textAlign = 'center';
    g.fillText('EXIT!', BUS_DOOR.x + BUS_DOOR.w / 2, BUS_DOOR.y - 10); g.textAlign = 'left';
  }
  for (const b of d.bags) {
    if (b.flash > 0) b.flash -= 0.03;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(b.x + b.w / 2, b.y + b.h + 6, b.w * 0.44, 8, 0, 0, 7); g.fill();
    g.fillStyle = b.flash > 0 ? '#a03a2c' : b.col;
    g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 12); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 3; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 12); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(b.x + 10, b.y + b.h / 2 - 3, b.w - 20, 6);
    g.strokeStyle = '#3d3a28'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(b.x + b.w / 2 - 16, b.y + 4); g.quadraticCurveTo(b.x + b.w / 2, b.y - 10, b.x + b.w / 2 + 16, b.y + 4); g.stroke();
    // the tag: yours is orange with a star; everyone else's is paperwork-colored
    const tagPulse = b.mine && e.phase === 'intro' ? 1 + 0.12 * Math.sin(timeNow * 9) : 1;
    g.save(); g.translate(b.x + b.w - 16, b.y + 10); g.scale(tagPulse, tagPulse);
    g.fillStyle = b.mine ? '#ff8c1a' : '#b9ac8d';
    g.beginPath(); g.roundRect(-13, -8, 26, 17, 3); g.fill();
    g.fillStyle = b.mine ? '#4a2c00' : '#5d563f'; g.font = 'bold 11px "Trebuchet MS"'; g.textAlign = 'center';
    g.fillText(b.mine ? '★' : '≡', 0, 5); g.restore();
    g.fillStyle = '#efe8d2'; g.font = 'bold 14px "Trebuchet MS"'; g.textAlign = 'center';
    g.fillText(b.name, b.x + b.w / 2, b.y + b.h / 2 + 5); g.textAlign = 'left';
  }
  g.fillStyle = '#efe8d2'; g.font = 'bold 16px "Trebuchet MS"';
  g.fillText(d.stage === 0 ? '🎒 Whose duffel has the ★ tag?' : '🚪 NOW MOVE — TAP THE DOOR!', 52, 168);
};
EV_DOWN.bus = (e, x, y) => {
  const d = e.data;
  if (d.stage === 0) {
    for (const b of d.bags) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        if (b.mine) { d.stage = 1; SFX.grab(); sayTransient('NOW GET OFF MY BUS!'); }
        else { b.flash = 1; SFX.wrong(); e.timeLeft = Math.max(0.05, e.timeLeft - 1); showToast('NOT YOURS, PRIVATE!', 800); }
        return;
      }
    }
  } else if (x >= BUS_DOOR.x && x <= BUS_DOOR.x + BUS_DOOR.w && y >= BUS_DOOR.y && y <= BUS_DOOR.y + BUS_DOOR.h) {
    finishEvent(true);
  }
};

/* ---------------- GET ON THE LINE ---------------- */
EV_SETUP.line = e => {
  const myNum = rndi(12, 88);
  const used = new Set([myNum]);
  const spots = [];
  for (let i = 0; i < 8; i++) {
    let n = myNum;
    if (i > 0) { do { n = rndi(10, 95); } while (used.has(n)); used.add(n); }
    spots.push({ x: 78 + i * 116, y: 392, num: n, mine: n === myNum, flash: 0 });
  }
  e.data = { spots: shuffle(spots), myNum };
  e.data.spots.forEach((s, i) => { s.x = 78 + i * 116; });
  e.sayText = 'ROSTER ' + myNum + '! FIND YOUR FEET, PRIVATE!';
  SFX.bark(3);
};
EV_DRAW.line = (g, e) => {
  const d = e.data;
  g.fillStyle = 'rgba(255,217,77,.14)'; g.fillRect(30, 356, 940, 150);
  for (const s of d.spots) {
    if (s.flash > 0) s.flash -= 0.03;
    g.fillStyle = s.flash > 0 ? '#a03a2c' : '#ffd94d';
    for (const dx of [0, 32]) {
      g.save(); g.translate(s.x + dx, s.y); g.rotate(dx ? 0.14 : -0.14);
      g.beginPath(); g.ellipse(0, 0, 13, 27, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(0, -30, 15, 10, 0, 0, 7); g.fill();
      g.restore();
    }
    g.fillStyle = '#2b2a1c'; g.beginPath(); g.roundRect(s.x - 14, s.y + 38, 76, 30, 6); g.fill();
    g.fillStyle = '#ffd76a'; g.font = 'bold 21px "Trebuchet MS"'; g.textAlign = 'center';
    g.fillText(String(s.num), s.x + 24, s.y + 61); g.textAlign = 'left';
  }
  g.fillStyle = '#efe8d2'; g.font = 'bold 17px "Trebuchet MS"';
  g.fillText('👣 Your roster number is ' + d.myNum + ' — stand on it!', 52, 168);
};
EV_DOWN.line = (e, x, y) => {
  for (const s of e.data.spots) {
    if (x >= s.x - 22 && x <= s.x + 78 && y >= s.y - 48 && y <= s.y + 74) {
      if (s.mine) { finishEvent(true); return; }
      s.flash = 1; SFX.wrong(); e.timeLeft = Math.max(0.05, e.timeLeft - 1); showToast('WRONG FEET!', 800); return;
    }
  }
};

/* ---------------- SHARK ATTACK ---------------- */
const SHARK_BTNS = SHARK_ORDERS.map((o, i) => ({ x: 14 + i * 246, y: 452, w: 232, h: 66, order: o }));
EV_SETUP.shark = e => {
  const seq = [];
  const who = ['junior', 'senior', rnd() < 0.5 ? 'junior' : 'senior', 'senior'];
  for (let i = 0; i < 4; i++) seq.push({ who: who[i], order: pick(SHARK_ORDERS) });
  let seniorLast = null;
  for (const s of seq) if (s.who === 'senior') seniorLast = s.order;
  e.data = { seq, answer: seniorLast, sub: 'orders', seqIdx: -1, seqT: 0, flashDur: Math.max(0.34, 0.62 * speedMul(day)) };
  e.sayText = 'SHARK ATTACK! WHO DO YOU OBEY?!';
  SFX.whistle(); SFX.bark(3);
};
EV_UPDATE.shark = (e, dt) => {
  const d = e.data;
  if (d.sub !== 'orders') return;
  d.seqT += dt;
  if (d.seqT >= d.flashDur) {
    d.seqT = 0; d.seqIdx++;
    if (d.seqIdx >= d.seq.length) { d.sub = 'move'; SFX.whistle(); }
    else SFX.bark(1);
  }
};
EV_DRAW.shark = (g, e) => {
  const d = e.data;
  if (e.phase === 'intro') drawSpeechBubble(g, 300, 40, 400, e.sayText, { tailX: 480 });
  const speaking = d.sub === 'orders' && d.seqIdx >= 0 && d.seqIdx < d.seq.length ? d.seq[d.seqIdx] : null;
  // senior (left, starred) and junior (right)
  for (const [who, x] of [['senior', 128], ['junior', 622]]) {
    const isSpeaking = speaking && speaking.who === who;
    g.drawImage(dsSprite(!!isSpeaking), x, 108, 250, 283);
    if (who === 'senior') {
      g.fillStyle = '#ffd94d'; g.beginPath(); g.arc(x + 226, 128, 21, 0, 7); g.fill();
      g.fillStyle = '#4a2c00'; g.font = 'bold 24px "Trebuchet MS"'; g.textAlign = 'center'; g.fillText('★', x + 226, 136); g.textAlign = 'left';
      g.fillStyle = '#ffd76a'; g.font = 'bold 15px "Trebuchet MS"'; g.fillText('★ SENIOR DS', x + 52, 420);
    } else {
      g.fillStyle = '#efe8d2'; g.font = 'bold 15px "Trebuchet MS"'; g.fillText('JUNIOR DS', x + 66, 420);
    }
    if (isSpeaking) drawSpeechBubble(g, x + 6, 40, 262, speaking.order, { tailX: x + 120, small: true });
  }
  if (d.sub === 'move') {
    drawSpeechBubble(g, 330, 56, 340, 'MOVE! LAST ORDER — WHOSE?!', { tailX: 480 });
    for (const b of SHARK_BTNS) {
      g.fillStyle = '#efe6cc'; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 12); g.fill();
      g.strokeStyle = '#7a6c3f'; g.lineWidth = 3; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 12); g.stroke();
      g.fillStyle = '#a11f0d'; g.font = 'bold 21px "Trebuchet MS"'; g.textAlign = 'center';
      g.fillText(b.order, b.x + b.w / 2, b.y + 41); g.textAlign = 'left';
    }
  } else if (e.phase === 'play') {
    g.fillStyle = '#efe8d2'; g.font = 'bold 17px "Trebuchet MS"'; g.textAlign = 'center';
    g.fillText('👂 LISTEN…', W / 2, 500); g.textAlign = 'left';
  }
};
EV_DOWN.shark = (e, x, y) => {
  const d = e.data;
  if (d.sub !== 'move') return;
  for (const b of SHARK_BTNS) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      if (b.order === d.answer) finishEvent(true); else finishEvent(false);
      return;
    }
  }
};

/* ---------------- ATTENTION ---------------- */
EV_SETUP.attention = e => {
  e.data = { elapsed: 0, anchor: null, flySfx: false, faintSfx: false, zoomSfx: false };
  e.sayText = 'ATTENTION! DO. NOT. MOVE.';
  SFX.whistle();
};
EV_UPDATE.attention = (e, dt) => {
  const d = e.data;
  d.elapsed += dt;
  if (!d.flySfx && d.elapsed > 0.7) { d.flySfx = true; SFX.buzzFly(); }
  if (!d.faintSfx && d.elapsed > 1.6) { d.faintSfx = true; SFX.thud(); }
  if (!d.zoomSfx && d.elapsed > 2.6) { d.zoomSfx = true; SFX.bark(1); }
};
EV_DRAW.attention = (g, e) => {
  const d = e.data, t = d.elapsed;
  if (e.phase === 'intro') drawSpeechBubble(g, 280, 40, 440, e.sayText, { tailX: 460 });
  // the recruit beside you — faints at 1.6s
  g.save();
  if (t > 1.6) { g.translate(238, 452); g.rotate(-1.35); g.drawImage(SPR.recruit[save.recruit], -60, -212, 120, 212); }
  else g.drawImage(SPR.recruit[save.recruit], 178, 240, 120, 212);
  g.restore();
  // YOU, at attention, center stage
  g.drawImage(SPR.recruit[save.recruit], 415, 148, 170, 300);
  g.fillStyle = '#efe8d2'; g.font = 'bold 15px "Trebuchet MS"'; g.textAlign = 'center';
  g.fillText('YOU', 500, 478); g.textAlign = 'left';
  // the DS looms — and leans in at 2.6s
  const zoom = t > 2.6 ? 1.22 : 1;
  const dw = 250 * zoom, dh = 283 * zoom;
  g.drawImage(dsSprite(t > 2.6), 962 - dw, 400 - dh, dw, dh);
  // a fly with no respect for the formation
  if (t > 0.7 && t < 2.3) {
    const fx = -40 + (t - 0.7) / 1.6 * 1080, fy = 210 + Math.sin((t - 0.7) * 14) * 26;
    g.fillStyle = '#1c1e24'; g.beginPath(); g.ellipse(fx, fy, 7, 5, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.65)';
    g.beginPath(); g.ellipse(fx - 4, fy - 6, 6, 3, -0.6, 0, 7); g.fill();
    g.beginPath(); g.ellipse(fx + 4, fy - 6, 6, 3, 0.6, 0, 7); g.fill();
  }
  if (e.phase === 'play') {
    g.fillStyle = '#efe8d2'; g.font = 'bold 19px "Trebuchet MS"'; g.textAlign = 'center';
    g.fillText('🤐 HOLD… ' + Math.max(0, e.timeLeft).toFixed(1), W / 2, 84); g.textAlign = 'left';
  }
};
EV_DOWN.attention = () => { finishEvent(false); };
EV_MOVE.attention = (e, x, y) => {
  const d = e.data;
  if (!d.anchor) { d.anchor = { x, y }; return; }
  const dx = x - d.anchor.x, dy = y - d.anchor.y;
  if (Math.sqrt(dx * dx + dy * dy) > 16) finishEvent(false);
};

/* ---------------- CONTRABAND SHAKEDOWN ---------------- */
EV_SETUP.shakedown = e => {
  const items = shuffle([
    ...shuffle(CONTRA).slice(0, 5).map(it => ({ ...it, contra: true })),
    ...shuffle(LEGIT).slice(0, 11).map(it => ({ ...it, contra: false }))
  ]);
  const tiles = items.map((it, i) => ({
    ...it, x: 176 + (i % 4) * 166, y: 104 + Math.floor(i / 4) * 96, w: 156, h: 86, found: false, flash: 0
  }));
  e.data = { tiles, need: 5, found: 0, strikes: 0 };
  e.sayText = 'SHAKEDOWN! DUMP IT OUT — CONTRABAND IN THE BOX!';
  SFX.bark(3);
};
EV_DRAW.shakedown = (g, e) => {
  const d = e.data;
  g.fillStyle = '#efe8d2'; g.font = 'bold 16px "Trebuchet MS"';
  g.fillText('🎒 Contraband tossed: ' + d.found + ' / ' + d.need + (d.strikes ? '   ·   ❌ strikes: ' + d.strikes + ' / 3' : ''), 176, 84);
  for (const t of d.tiles) {
    if (t.flash > 0) t.flash -= 0.03;
    g.fillStyle = t.found ? '#7fae4c' : t.flash > 0 ? '#a03a2c' : '#efe6cc';
    g.beginPath(); g.roundRect(t.x, t.y, t.w, t.h, 10); g.fill();
    g.strokeStyle = '#7a6c3f'; g.lineWidth = 2.5; g.beginPath(); g.roundRect(t.x, t.y, t.w, t.h, 10); g.stroke();
    g.font = '30px "Trebuchet MS"'; g.textAlign = 'center';
    g.globalAlpha = t.found ? 0.45 : 1;
    g.fillText(t.icon, t.x + t.w / 2, t.y + 40);
    g.globalAlpha = 1;
    g.fillStyle = t.found ? '#22300f' : '#2b2a1c'; g.font = 'bold 13.5px "Trebuchet MS"';
    g.fillText(t.found ? '✓ TOSSED' : t.name, t.x + t.w / 2, t.y + 68);
    g.textAlign = 'left';
  }
  g.fillStyle = '#8a5a1d'; g.beginPath(); g.roundRect(360, 496, 280, 44, 8); g.fill();
  g.fillStyle = '#ffe9a8'; g.font = 'bold 17px "Trebuchet MS"'; g.textAlign = 'center';
  g.fillText('📥 AMNESTY BOX', 500, 524); g.textAlign = 'left';
};
EV_DOWN.shakedown = (e, x, y) => {
  const d = e.data;
  for (const t of d.tiles) {
    if (t.found || x < t.x || x > t.x + t.w || y < t.y || y > t.y + t.h) continue;
    if (t.contra) {
      t.found = true; d.found++; SFX.toss();
      if (d.found >= d.need) { finishEvent(true); return; }
    } else {
      t.flash = 1; d.strikes++; SFX.wrong();
      e.timeLeft = Math.max(0.05, e.timeLeft - 1);
      showToast('THAT\'S ISSUE GEAR!', 800);
      if (d.strikes >= 3) { finishEvent(false); return; }
    }
    return;
  }
};

/* ---------------- UNIFORM ISSUE ---------------- */
function spawnUniformItem(e, forceCorrect) {
  const d = e.data;
  let type, size;
  if (forceCorrect) {
    const missing = UNIFORM_TYPES.filter(t => !d.got[t.key]);
    if (!missing.length) return null;
    type = pick(missing); size = d.need[type.key];
  } else {
    type = pick(UNIFORM_TYPES); size = pick(type.sizes);
  }
  const item = {
    x: 90 + rnd() * 820, y: -46, vy: (120 + rnd() * 80) / Math.max(0.55, speedMul(day)),
    type: type.key, icon: type.icon, size, phase: rnd() * 6.28, flash: 0
  };
  d.items.push(item);
  return item;
}
EV_SETUP.uniform = e => {
  const need = {}, got = {};
  for (const t of UNIFORM_TYPES) { need[t.key] = pick(t.sizes); got[t.key] = false; }
  e.data = { need, got, items: [], spawnT: 0.2, spawnCount: 0, strikes: 0 };
  e.sayText = 'ISSUE LINE! GRAB YOUR SIZES — ONLY YOUR SIZES!';
  SFX.bark(3);
};
EV_UPDATE.uniform = (e, dt) => {
  const d = e.data;
  d.spawnT -= dt;
  if (d.spawnT <= 0) {
    d.spawnCount++;
    spawnUniformItem(e, d.spawnCount % 3 === 0);
    d.spawnT = 0.34 + 0.5 * speedMul(day);
  }
  for (const it of d.items) {
    it.y += it.vy * dt;
    it.x += Math.sin(timeNow * 2.2 + it.phase) * 16 * dt;
    if (it.flash > 0) it.flash -= dt * 2;
  }
  d.items = d.items.filter(it => it.y < H + 60);
};
EV_DRAW.uniform = (g, e) => {
  const d = e.data;
  // your size card
  g.fillStyle = '#efe6cc'; g.beginPath(); g.roundRect(16, 52, 296, 104, 10); g.fill();
  g.strokeStyle = '#7a6c3f'; g.lineWidth = 2.5; g.beginPath(); g.roundRect(16, 52, 296, 104, 10); g.stroke();
  g.fillStyle = '#a11f0d'; g.font = 'bold 16px "Trebuchet MS"'; g.fillText('📏 YOUR SIZES', 30, 76);
  g.font = 'bold 15.5px "Trebuchet MS"';
  UNIFORM_TYPES.forEach((t, i) => {
    const ok = d.got[t.key];
    g.fillStyle = ok ? '#5d7a2a' : '#2b2a1c';
    g.fillText((ok ? '✓ ' : '• ') + t.icon + ' ' + t.name + ': ' + d.need[t.key], 30, 102 + i * 19);
  });
  if (d.strikes) { g.fillStyle = '#e0483a'; g.font = 'bold 15px "Trebuchet MS"'; g.fillText('❌ ' + d.strikes + ' / 3', 330, 76); }
  for (const it of d.items) {
    g.fillStyle = it.flash > 0 ? '#a03a2c' : '#e8e0c8';
    g.beginPath(); g.roundRect(it.x - 38, it.y - 40, 76, 88, 10); g.fill();
    g.strokeStyle = '#7a6c3f'; g.lineWidth = 2; g.beginPath(); g.roundRect(it.x - 38, it.y - 40, 76, 88, 10); g.stroke();
    g.font = '32px "Trebuchet MS"'; g.textAlign = 'center'; g.fillText(it.icon, it.x, it.y + 2);
    g.fillStyle = '#2b2a1c'; g.font = 'bold 16px "Trebuchet MS"'; g.fillText(it.size, it.x, it.y + 32);
    g.textAlign = 'left';
  }
};
EV_DOWN.uniform = (e, x, y) => {
  const d = e.data;
  for (let i = d.items.length - 1; i >= 0; i--) {
    const it = d.items[i];
    if (Math.abs(x - it.x) <= 42 && Math.abs(y - it.y) <= 48) {
      d.items.splice(i, 1);
      if (!d.got[it.type] && it.size === d.need[it.type]) {
        d.got[it.type] = true; SFX.grab();
        if (UNIFORM_TYPES.every(t => d.got[t.key])) { finishEvent(true); return; }
      } else {
        it.flash = 1; d.strikes++; SFX.wrong();
        showToast('WRONG SIZE, PRIVATE!', 800);
        if (d.strikes >= 3) { finishEvent(false); return; }
      }
      return;
    }
  }
};

/* ---------------- LOCKER DRILL ---------------- */
function lockerSlotRect(i) { return { x: 356 + (i % 2) * 144, y: 118 + Math.floor(i / 2) * 96, w: 132, h: 84 }; }
function diagramSlotRect(i) { return { x: 44 + (i % 2) * 122, y: 118 + Math.floor(i / 2) * 88, w: 112, h: 76 }; }
EV_SETUP.locker = e => {
  const solution = shuffle([0, 1, 2, 3, 4, 5]);        // slot -> itemId
  const trayOrder = shuffle([0, 1, 2, 3, 4, 5]);
  const items = trayOrder.map((id, i) => ({
    id, loc: 'tray', slot: -1,
    hx: 700, hy: 118 + i * 58, x: 700, y: 118 + i * 58, w: 256, h: 48
  }));
  e.data = { solution, items, dragId: -1, dragDX: 0, dragDY: 0 };
  e.sayText = 'LOCKER DRILL! MATCH THE DIAGRAM — EXACTLY!';
  SFX.bark(3);
};
function lockerItemPos(e, it) {
  if (it.loc === 'slot') { const r = lockerSlotRect(it.slot); return { x: r.x + 8, y: r.y + 18, w: r.w - 16, h: 48 }; }
  if (e.data.dragId === it.id) return { x: it.x, y: it.y, w: it.w, h: it.h };
  return { x: it.hx, y: it.hy, w: it.w, h: it.h };
}
EV_DRAW.locker = (g, e) => {
  const d = e.data;
  const drawLocker = (x0, w, label) => {
    g.fillStyle = '#77806b'; g.beginPath(); g.roundRect(x0 - 10, 100, w + 20, 322, 8); g.fill();
    g.strokeStyle = '#3f4636'; g.lineWidth = 3; g.beginPath(); g.roundRect(x0 - 10, 100, w + 20, 322, 8); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.25)'; for (let v = 0; v < 3; v++) g.fillRect(x0 + 12 + v * 14, 108, 7, 3);
    g.fillStyle = '#efe8d2'; g.font = 'bold 14px "Trebuchet MS"'; g.textAlign = 'center';
    g.fillText(label, x0 + w / 2, 442); g.textAlign = 'left';
  };
  drawLocker(44, 234, '📋 THE DIAGRAM');
  drawLocker(356, 276, '🗄️ YOUR LOCKER');
  g.fillStyle = '#efe8d2'; g.font = 'bold 14px "Trebuchet MS"'; g.fillText('🧺 ISSUE TRAY', 700, 106);
  for (let s = 0; s < 6; s++) {
    const dr = diagramSlotRect(s), item = LOCKER_ITEMS[d.solution[s]];
    g.fillStyle = '#5d6650'; g.beginPath(); g.roundRect(dr.x, dr.y, dr.w, dr.h, 6); g.fill();
    g.font = '26px "Trebuchet MS"'; g.textAlign = 'center'; g.fillText(item.icon, dr.x + dr.w / 2, dr.y + 38);
    g.fillStyle = '#efe8d2'; g.font = 'bold 11.5px "Trebuchet MS"'; g.fillText(item.name, dr.x + dr.w / 2, dr.y + 62); g.textAlign = 'left';
    const r = lockerSlotRect(s);
    g.fillStyle = '#4c5540'; g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 6); g.fill();
    g.strokeStyle = 'rgba(239,232,210,.4)'; g.lineWidth = 2; g.setLineDash([6, 5]);
    g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 6); g.stroke(); g.setLineDash([]);
  }
  const drawItem = it => {
    const p = lockerItemPos(e, it);
    g.fillStyle = d.dragId === it.id ? '#ffd94d' : '#efe6cc';
    g.beginPath(); g.roundRect(p.x, p.y, p.w, p.h, 9); g.fill();
    g.strokeStyle = '#7a6c3f'; g.lineWidth = 2; g.beginPath(); g.roundRect(p.x, p.y, p.w, p.h, 9); g.stroke();
    g.font = '24px "Trebuchet MS"'; g.fillText(LOCKER_ITEMS[it.id].icon, p.x + 10, p.y + 33);
    g.fillStyle = '#2b2a1c'; g.font = 'bold 14.5px "Trebuchet MS"';
    g.fillText(LOCKER_ITEMS[it.id].name, p.x + 46, p.y + 30);
  };
  for (const it of d.items) if (d.dragId !== it.id) drawItem(it);
  for (const it of d.items) if (d.dragId === it.id) drawItem(it);
};
function lockerCheck(e) {
  const d = e.data;
  const placed = d.items.filter(it => it.loc === 'slot');
  if (placed.length < 6) return;
  const wrong = placed.filter(it => d.solution[it.slot] !== it.id);
  if (!wrong.length) { finishEvent(true); return; }
  for (const it of wrong) { it.loc = 'tray'; it.slot = -1; it.x = it.hx; it.y = it.hy; }
  SFX.wrong();
  e.timeLeft = Math.max(0.05, e.timeLeft - 2);
  showToast('NOT SQUARED AWAY! CHECK THE DIAGRAM!', 1100);
}
EV_DOWN.locker = (e, x, y) => {
  const d = e.data;
  for (let i = d.items.length - 1; i >= 0; i--) {
    const it = d.items[i], p = lockerItemPos(e, it);
    if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
      d.dragId = it.id; d.dragDX = x - p.x; d.dragDY = y - p.y;
      it.x = p.x; it.y = p.y;
      if (it.loc === 'slot') { it.loc = 'drag'; }
      return;
    }
  }
};
EV_MOVE.locker = (e, x, y) => {
  const d = e.data;
  if (d.dragId < 0) return;
  const it = d.items.find(i => i.id === d.dragId);
  if (it) { it.x = x - d.dragDX; it.y = y - d.dragDY; }
};
EV_UP.locker = (e, x, y) => {
  const d = e.data;
  if (d.dragId < 0) return;
  const it = d.items.find(i => i.id === d.dragId);
  d.dragId = -1;
  if (!it) return;
  let placed = false;
  for (let s = 0; s < 6; s++) {
    const r = lockerSlotRect(s);
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      const occupant = d.items.find(i => i.loc === 'slot' && i.slot === s);
      if (!occupant) { it.loc = 'slot'; it.slot = s; placed = true; }
      break;
    }
  }
  if (!placed) { it.loc = 'tray'; it.slot = -1; it.x = it.hx; it.y = it.hy; }
  else SFX.grab();
  lockerCheck(e);
};

/* ---------------- PHONE CALL HOME ---------------- */
const PHONE_BTNS = [0, 1, 2].map(i => ({ x: 130, y: 168 + i * 84, w: 740, h: 70 }));
function wrapLines(g, text, maxW) {
  const words = String(text).split(' '), lines = [];
  let cur = '';
  for (const wd of words) {
    const t = cur ? cur + ' ' + wd : wd;
    if (g.measureText(t).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}
EV_SETUP.phone = e => {
  const line = pick(PHONE_LINES);
  e.data = { line: line.text, options: shuffle([line.text, line.wrong[0], line.wrong[1]]), sub: 'memorize', memT: 2.2 };
  e.sayText = 'ONE PHONE CALL! SAY IT EXACTLY LIKE THAT!';
  SFX.bark(2);
};
EV_UPDATE.phone = (e, dt) => {
  const d = e.data;
  if (d.sub === 'memorize') {
    d.memT -= dt;
    if (d.memT <= 0) { d.sub = 'choose'; SFX.whistle(); }
  }
};
EV_DRAW.phone = (g, e) => {
  const d = e.data;
  if (e.phase === 'intro') return;  // the shared intro band carries the order
  g.drawImage(SPR.recruit[save.recruit], 56, 210, 120, 212);
  g.fillStyle = '#2b2a1c'; g.beginPath(); g.roundRect(150, 268, 16, 30, 4); g.fill();  // the phone
  if (d.sub === 'memorize') {
    g.fillStyle = '#efe6cc'; g.beginPath(); g.roundRect(210, 150, 640, 190, 14); g.fill();
    g.strokeStyle = '#7a6c3f'; g.lineWidth = 3; g.beginPath(); g.roundRect(210, 150, 640, 190, 14); g.stroke();
    g.fillStyle = '#a11f0d'; g.font = 'bold 17px "Trebuchet MS"'; g.textAlign = 'center';
    g.fillText('📜 MEMORIZE IT — WORD FOR WORD!', 530, 184);
    g.fillStyle = '#2b2a1c'; g.font = 'bold 24px "Trebuchet MS"';
    wrapLines(g, '"' + d.line + '"', 580).forEach((ln, i) => g.fillText(ln, 530, 232 + i * 32));
    g.fillStyle = '#7a6c3f'; g.font = 'bold 15px "Trebuchet MS"';
    g.fillText(Math.max(0, d.memT).toFixed(1) + 's…', 530, 322);
    g.textAlign = 'left';
  } else {
    g.fillStyle = '#efe8d2'; g.font = 'bold 16px "Trebuchet MS"'; g.textAlign = 'center';
    g.fillText('🗣️ SAY IT:', W / 2, 148); g.textAlign = 'left';
    PHONE_BTNS.forEach((b, i) => {
      g.fillStyle = '#fdfaf0'; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 16); g.fill();
      g.strokeStyle = '#2b2a1c'; g.lineWidth = 2.5; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 16); g.stroke();
      g.fillStyle = '#2b2a1c'; g.font = 'bold 16.5px "Trebuchet MS"'; g.textAlign = 'center';
      const lines = wrapLines(g, d.options[i], b.w - 40);
      lines.forEach((ln, j) => g.fillText(ln, b.x + b.w / 2, b.y + (lines.length > 1 ? 28 : 42) + j * 21));
      g.textAlign = 'left';
    });
  }
};
EV_DOWN.phone = (e, x, y) => {
  const d = e.data;
  if (d.sub !== 'choose') return;
  for (let i = 0; i < 3; i++) {
    const b = PHONE_BTNS[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      if (d.options[i] === d.line) finishEvent(true); else finishEvent(false);
      return;
    }
  }
};

/* ---------------- PUSH-UPS (the penalty beat) ---------------- */
EV_SETUP.pushups = e => {
  e.data = { need: save.recruit === 'wheels' ? 3 : 5, count: 0 };
  e.sayText = pick(FAIL_BARKS);
};
EV_DRAW.pushups = (g, e) => {
  const d = e.data;
  g.drawImage(dsSprite(true), 56, 120, 230, 261);
  drawSpeechBubble(g, 300, 66, 430, e.sayText, { tailX: 330 });
  // one tap = one full push-up: the plank dips and drives back up
  // through the pre-rendered phase frames (rigid body, bending elbows)
  let ft = 0;
  if (d.animT0 != null) {
    const p = (timeNow - d.animT0) / 0.42;
    if (p >= 1) d.animT0 = null;
    else ft = Math.sin(Math.PI * Math.max(0, p));
  }
  const fi = Math.round(ft * (SPR.pushFrames.length - 1));
  g.drawImage(SPR.pushFrames[fi], 330, 300, 340, 200);
  g.fillStyle = '#fff3d6'; g.font = 'bold 44px "Arial Black", "Trebuchet MS"'; g.textAlign = 'center';
  g.fillText(d.count + ' / ' + d.need, 760, 240);
  g.font = 'bold 19px "Trebuchet MS"'; g.fillStyle = '#ffd76a';
  g.fillText('👆 TAP TO PUSH!', 760, 282);
  if (d.count > 0) {
    g.fillStyle = '#efe8d2'; g.font = 'bold 22px "Trebuchet MS"';
    g.fillText('"' + NUM_WORDS[Math.min(10, d.count)] + ', SIR!"', 500, 140);
  }
  g.textAlign = 'left';
};
EV_DOWN.pushups = e => {
  const d = e.data;
  d.count++;
  d.animT0 = timeNow;
  save.pushupsDone++;
  persist();
  SFX.grunt();
  if (d.count >= d.need) finishEvent(true);
};

/* ---------------- input dispatch ---------------- */
function toGame(evt) {
  const r = canvas.getBoundingClientRect();
  return { x: (evt.clientX - r.left) * W / r.width, y: (evt.clientY - r.top) * H / r.height };
}
canvas.addEventListener('pointerdown', evt => {
  evt.preventDefault();
  const p = toGame(evt);
  pointer.x = p.x; pointer.y = p.y; pointer.down = true;
  if (state !== 'event' || !ev || ev.phase !== 'play' || ev.done) return;
  if (EV_DOWN[ev.type]) EV_DOWN[ev.type](ev, p.x, p.y);
});
canvas.addEventListener('pointermove', evt => {
  const p = toGame(evt);
  pointer.x = p.x; pointer.y = p.y;
  if (state !== 'event' || !ev || ev.phase !== 'play' || ev.done) return;
  if (EV_MOVE[ev.type]) EV_MOVE[ev.type](ev, p.x, p.y);
});
window.addEventListener('pointerup', evt => {
  pointer.down = false;
  if (state !== 'event' || !ev || ev.phase !== 'play' || ev.done) return;
  if (EV_UP[ev.type]) { const p = toGame(evt); EV_UP[ev.type](ev, p.x, p.y); }
});

/* ---------------- shared scene rendering ---------------- */
const COMMON_DS = { bus: 1, line: 1, shakedown: 1, uniform: 1, locker: 1, phone: 1 };
function drawScene(g) {
  drawBackground(g);
  if (!ev) {
    if (state === 'menu') {
      g.drawImage(dsSprite(true), 120, 168, 230, 261);
      drawSpeechBubble(g, 330, 92, 400, 'GET OFF MY BUS!', { tailX: 350 });
      g.drawImage(SPR.recruit[save.recruit], 700, 178, 150, 265);
    }
    return;
  }
  const e = ev;
  if (COMMON_DS[e.type]) {
    if (e.phase === 'intro') {
      g.drawImage(dsSprite(true), 14, 40, 88, 100);
      drawSpeechBubble(g, 116, 46, 850, e.sayText, { tailX: 142 });
    } else {
      g.drawImage(dsSprite(false), 892, 44, 92, 104);
      if (e.sayT > 0 && e.sayText2) drawSpeechBubble(g, 452, 42, 420, e.sayText2, { tailX: 872, small: true });
    }
  }
  if (EV_DRAW[e.type]) EV_DRAW[e.type](g, e);
  if (e.phase === 'play') drawTimerBar(g, Math.max(0, e.timeLeft) / e.timeTotal, EVENT_DEFS[e.type].title);
  drawFailFlash(g);
}

/* ---------------- per-frame update ---------------- */
function updateEvent(dt) {
  const e = ev; if (!e || e.done) return;
  if (e.phase === 'intro') {
    e.t += dt;
    if (e.t >= e.introDur) e.phase = 'play';
    return;
  }
  const sharkListening = e.type === 'shark' && e.data.sub === 'orders';
  if (!sharkListening) e.timeLeft -= dt;
  if (e.sayT > 0) e.sayT -= dt;
  if (EV_UPDATE[e.type]) EV_UPDATE[e.type](e, dt);
  if (e.done || ev !== e) return;
  if (e.timeLeft <= 0) {
    e.timeLeft = 0;
    if (e.type === 'attention' || e.type === 'pushups') finishEvent(true);
    else finishEvent(false);
  }
}
let lastTs = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0);
  lastTs = ts; timeNow = ts / 1000;
  if (state === 'dayintro') {
    bannerT -= dt;
    if (bannerT <= 0) { hideBanner(); beginEvent(plan[0]); CG.gameplayStart(); }
  } else if (state === 'event') updateEvent(dt);
  updateWinPop(dt);
  if (flash.active) {
    flash.t -= dt;
    if (flash.t <= 0) flash.active = false;
    const mag = 11 * Math.max(0, flash.t / flash.dur);
    ctx.save();
    ctx.translate((Math.random() * 2 - 1) * mag, (Math.random() * 2 - 1) * mag);
    drawScene(ctx);
    ctx.restore();
  } else drawScene(ctx);
}

/* ---------------- solve/fail helpers (debug + tests) ---------------- */
function tapAt(x, y) { if (ev && EV_DOWN[ev.type]) EV_DOWN[ev.type](ev, x, y); }
function solveCurrent() {
  if (!ev || ev.phase !== 'play') return false;
  const e = ev, d = e.data;
  switch (e.type) {
    case 'bus': {
      const b = d.bags.find(bb => bb.mine);
      tapAt(b.x + b.w / 2, b.y + b.h / 2);
      tapAt(BUS_DOOR.x + BUS_DOOR.w / 2, BUS_DOOR.y + BUS_DOOR.h / 2);
      break;
    }
    case 'line': { const s = d.spots.find(ss => ss.mine); tapAt(s.x + 24, s.y); break; }
    case 'shark': {
      if (d.sub !== 'move') d.sub = 'move';
      const b = SHARK_BTNS.find(bb => bb.order === d.answer);
      tapAt(b.x + b.w / 2, b.y + b.h / 2);
      break;
    }
    case 'attention': break;  // solved by standing still — the caller pumps frames
    case 'shakedown': for (const t of d.tiles) if (t.contra && !t.found) tapAt(t.x + t.w / 2, t.y + t.h / 2); break;
    case 'uniform': {
      let guard = 0;
      while (!UNIFORM_TYPES.every(t => d.got[t.key]) && guard++ < 12) {
        const it = spawnUniformItem(e, true);
        if (!it) break;
        it.y = 200; tapAt(it.x, it.y);
      }
      break;
    }
    case 'locker': {
      for (let s = 0; s < 6 && !e.done; s++) {
        const it = d.items.find(i => i.id === d.solution[s]);
        if (!it || it.loc === 'slot') continue;
        const p = lockerItemPos(e, it), r = lockerSlotRect(s);
        EV_DOWN.locker(e, p.x + p.w / 2, p.y + p.h / 2);
        EV_MOVE.locker(e, r.x + r.w / 2, r.y + r.h / 2);
        EV_UP.locker(e, r.x + r.w / 2, r.y + r.h / 2);
      }
      break;
    }
    case 'phone': {
      if (d.sub === 'memorize') d.sub = 'choose';
      const b = PHONE_BTNS[d.options.indexOf(d.line)];
      tapAt(b.x + b.w / 2, b.y + b.h / 2);
      break;
    }
    case 'pushups': { let guard = 0; while (ev === e && !e.done && guard++ < 12) tapAt(500, 380); break; }
  }
  return e.done;
}
function failCurrent() {
  if (!ev) return;
  if (ev.type === 'attention') { EV_MOVE.attention(ev, 0, 0); EV_MOVE.attention(ev, 500, 300); }
  else ev.timeLeft = Math.min(ev.timeLeft, 0.01);
}

/* ---------------- wiring ---------------- */
el('playBtn').addEventListener('click', () => { SFX.click(); startRun(); });
el('howBtn').addEventListener('click', () => { SFX.click(); state = 'howto'; showOnly('howto'); });
el('howClose').addEventListener('click', () => { SFX.click(); state = 'menu'; showOnly('menu'); });
el('shopBtn').addEventListener('click', () => { if (state !== 'shop') { SFX.click(); openShop(); } });
el('shopBtnMenu').addEventListener('click', () => { SFX.click(); openShop(); });
el('shopClose').addEventListener('click', () => { SFX.click(); closeShop(); });
el('pauseBtn').addEventListener('click', () => { if (state === 'event') pauseGame(); else if (state === 'paused') resumeGame(); });
el('resumeBtn').addEventListener('click', resumeGame);
el('quitBtn').addEventListener('click', quitToMenu);
el('muteBtn').addEventListener('click', () => { save.muted = !save.muted; persist(); updateMute(); });
el('cadenceBtnMenu').addEventListener('click', () => { SFX.click(); showMenuCadence(); });
el('cadenceBtnHow').addEventListener('click', () => { SFX.click(); state = 'menu'; showOnly('menu'); showMenuCadence(); });
el('nextDayBtn').addEventListener('click', () => { showOnly(null); CG.midgameAd(() => startDay(day + 1)); });
el('dayMenuBtn').addEventListener('click', quitToMenu);
el('winVid').addEventListener('click', () => { SFX.click(); stopWinPop(); });
el('againBtn').addEventListener('click', () => { SFX.click(); startRun(); });
el('overMenuBtn').addEventListener('click', quitToMenu);
el('tutX').addEventListener('click', skipTutorial);
window.addEventListener('keydown', evt => {
  if (evt.key === 'p' || evt.key === 'P' || evt.key === 'Escape') { if (state === 'event') pauseGame(); else if (state === 'paused') resumeGame(); }
  if (evt.key === 'm' || evt.key === 'M') { save.muted = !save.muted; persist(); updateMute(); }
});

/* ---------------- boot ---------------- */
buildSprites();
CG.init();
CG.loadingStart();
updateHUD(); updateMenuStats(); updateMute();
el('evName').textContent = THEMES[save.theme].name;
pinWrap();
CG.loadingStop();
requestAnimationFrame(frame);

/* ---------------- debug handle (tests) ---------------- */
window.__bt = {
  save, CG,
  get state() { return state; }, get day() { return day; }, get score() { return score; },
  get meter() { return meter; }, get streak() { return streak; }, get ev() { return ev; },
  get plan() { return plan; }, get planIdx() { return planIdx; },
  startRun, startDay, beginEvent, finishEvent, nextEvent, dayComplete,
  solveCurrent, failCurrent, tapAt,
  simDown(x, y) { if (ev && EV_DOWN[ev.type]) EV_DOWN[ev.type](ev, x, y); },
  simMove(x, y) { if (ev && EV_MOVE[ev.type]) EV_MOVE[ev.type](ev, x, y); },
  simUp(x, y) { if (ev && EV_UP[ev.type]) EV_UP[ev.type](ev, x, y); },
  buyOrEquip, openShop, closeShop, refreshShop,
  setMerit(n) { save.merit = n; persist(); updateHUD(); },
  setMeter(n) { meter = n; updateHUD(); },
  skipTutorial, reseed, pinWrap, fitStage, vvBox,
  tutDone() { return save.tutDone; },
  tutActiveFor,
  FAIL_FLASH_BARKS,
  flashState() { return { active: flash.active, t: flash.t, text: flash.text, barkIdx: flash.barkIdx, jaw: flash.jaw || 0, bankRemaining: Array.isArray(save.barkBag) ? save.barkBag.length : 0 }; },
  get flash() { return flash; },
  triggerFailFlash,
  flashMouthState,
  flashHeadData(jaw, fury) {
    try {
      const c = document.createElement('canvas'); c.width = 900; c.height = 900;
      const g2 = c.getContext('2d');
      g2.fillStyle = '#340804'; g2.fillRect(0, 0, 900, 900);
      drawFlashHead(g2, 450, 462, 880, jaw, fury == null ? Math.max(jaw, 0.5) : fury);
      return c.toDataURL ? c.toDataURL('image/png') : null;
    } catch (e) { return null; }
  },
  VOX, BARK_DUR, BARK_ENV, CADENCE_STEP_DUR,
  pushInfo() { return { frames: SPR.pushFrames.length, w: SPR.pushFrames[0].width, h: SPR.pushFrames[0].height, upSame: SPR.pushUp === SPR.pushFrames[0], dnSame: SPR.pushDn === SPR.pushFrames[SPR.pushFrames.length - 1] }; },
  pushFrameData(i) { const c = SPR.pushFrames[Math.max(0, Math.min(SPR.pushFrames.length - 1, i))]; return c && c.toDataURL ? c.toDataURL('image/png') : null; },
  CADENCE_CHAIN, showWinPop, stopWinPop, showMenuCadence, failDrain,
  winState() { const l = CADENCE_CHAIN[winPop.step]; return { active: winPop.active, fromMenu: winPop.fromMenu, step: winPop.step, who: l ? l.who : null, text: l ? l.text : '' }; }
};
