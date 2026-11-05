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
   boot); all sound is synthesized with WebAudio. FLAT FOLDER
   by design: the CrazyGames uploader flattens subfolders, so
   every file sits at the root and the game references bare
   filenames only.

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
  'DROP AND GIVE ME 25, NUMBNUTS!',
  'MOVE IT, ASSWIPE!',
  'YOU CALL THAT ATTENTION?!',
  "I'VE SEEN BETTER COORDINATION FROM A BAG OF HAMMERS!",
  'DO IT AGAIN. FASTER.',
  'OUTSTANDING. OUTSTANDINGLY BAD.',
  'WHAT IN THE WORLD ARE YOU DOING, PRIVATE?!',
  'MY BOOT MOVES FASTER THAN YOU!',
  'WAS THAT A TRY? THAT WAS NOT A TRY!',
  'YOU HAD ONE JOB, PRIVATE. ONE.',
  "IF YOU WERE ANY SLOWER, YOU'D BE GOING BACKWARDS!",
  "MY GRANDMOTHER JUST TEXTED. SHE'S EMBARRASSED FOR YOU."
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
/* The drill sergeant: round brown campaign hat, sunglasses, a face
   professionally offended by your existence. Parameterized per DS
   pack (hat band / skin / glasses change; the attitude doesn't). */
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
  // campaign hat: crown + wide flat brim (the smokey-bear silhouette)
  g.fillStyle = hat;
  g.beginPath(); g.ellipse(cx, h * 0.235, w * 0.135, h * 0.115, 0, 0, 7); g.fill();       // crown
  g.beginPath(); g.ellipse(cx, h * 0.145, w * 0.055, h * 0.028, 0, 0, 7); g.fill();       // crown pinch
  g.fillStyle = band; g.fillRect(cx - w * 0.128, h * 0.285, w * 0.256, h * 0.035);        // hat band
  g.fillStyle = hat;
  g.beginPath(); g.ellipse(cx, h * 0.335, w * 0.335, h * 0.052, 0, 0, 7); g.fill();       // brim
  g.fillStyle = 'rgba(0,0,0,.16)';
  g.beginPath(); g.ellipse(cx, h * 0.345, w * 0.335, h * 0.05, 0, 0, 7); g.fill();
  g.fillStyle = hat;
  g.beginPath(); g.ellipse(cx, h * 0.33, w * 0.335, h * 0.048, 0, 0, 7); g.fill();
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
function buildSprites() {
  const packs = {
    classic:  { skin: '#c98d5e', band: '#3d2c17', shirt: '#5a6148', clearGlasses: false },
    southern: { skin: '#a96f3f', band: '#7a1f1f', shirt: '#6b5a35', clearGlasses: false },
    whisper:  { skin: '#dcb08a', band: '#20242c', shirt: '#39404d', clearGlasses: true }
  };
  SPR.ds = {};
  SPR.dsBig = {};
  for (const k of Object.keys(packs)) {
    SPR.ds[k + 'Calm'] = makeSprite(300, 340, (g, w, h) => drawDSHead(g, w, h, Object.assign({}, packs[k], { shout: false })));
    SPR.ds[k + 'Shout'] = makeSprite(300, 340, (g, w, h) => drawDSHead(g, w, h, Object.assign({}, packs[k], { shout: true })));
    // the FAIL FLASH close-up: same vector art rendered at 2x so the
    // full-screen face stays crisp
    SPR.dsBig[k] = makeSprite(600, 680, (g, w, h) => drawDSHead(g, w, h, Object.assign({}, packs[k], { shout: true })));
  }
  SPR.recruit = {};
  for (const v of ['shaky', 'icy', 'wheels']) {
    SPR.recruit[v] = makeSprite(170, 300, (g, w, h) => drawRecruit(g, w, h, { skin: '#c98d5e', variant: v }));
  }
  // side-view push-up frames (body plank, arms to the ground)
  const pushFrame = down => (g, w, h) => {
    const hipY = down ? h * 0.52 : h * 0.40, headY = down ? h * 0.47 : h * 0.35;
    g.strokeStyle = '#5d6b47'; g.lineWidth = h * 0.16; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w * 0.22, hipY); g.lineTo(w * 0.80, headY + h * 0.03); g.stroke();   // torso plank
    g.strokeStyle = '#4c5540'; g.lineWidth = h * 0.11;
    g.beginPath(); g.moveTo(w * 0.22, hipY); g.lineTo(w * 0.06, h * 0.86); g.stroke();            // legs
    g.strokeStyle = '#c98d5e'; g.lineWidth = h * 0.07;
    g.beginPath(); g.moveTo(w * 0.76, headY + h * 0.06); g.lineTo(w * 0.82, h * 0.88); g.stroke(); // arm
    g.fillStyle = '#24231f'; g.beginPath(); g.ellipse(w * 0.03, h * 0.88, w * 0.05, h * 0.035, 0, 0, 7); g.fill(); // boot
    g.fillStyle = '#c98d5e'; g.beginPath(); g.arc(w * 0.86, headY, h * 0.085, 0, 7); g.fill();      // head
    g.fillStyle = '#2e2a20'; g.beginPath(); g.ellipse(w * 0.86, headY - h * 0.045, h * 0.085, h * 0.04, 0, Math.PI, 0); g.fill();
  };
  SPR.pushUp = makeSprite(340, 200, pushFrame(false));
  SPR.pushDn = makeSprite(340, 200, pushFrame(true));
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
function updateMute() { el('muteBtn').textContent = effectiveMuted() ? '🔇' : '🔊'; }

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
    streak = 0; meter -= 22; dayStats.failed++;
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

/* ---------------- THE FAIL FLASH ----------------
   On every blown order: a huge DS face fills the screen for
   ~0.85s with a screen shake, a bark SFX, and one line from the
   rotating bank — then the push-up beat proceeds as normal.
   Purely visual; input and timers are untouched.
   Carlton's sharpened spec: the face is a PHOTOREALISTIC portrait
   of a fictional drill sergeant (generated for this game, original
   character — no real person). The cartoon game cuts to a real
   face in yours; that contrast is the scare. If the photo can't
   load (offline/blocked/headless) the big cartoon DS sprite is
   the fallback. */
let flashImg = null, flashImgReady = false;
try {
  flashImg = new Image();
  flashImg.onload = () => { flashImgReady = true; };
  flashImg.src = 'ds-flash.jpg';
} catch (e) { flashImg = null; }
const flash = { active: false, t: 0, dur: 0.85, text: '' };
function nextBarkLine() {
  if (!Array.isArray(save.barkBag) || !save.barkBag.length) {
    save.barkBag = shuffle(FAIL_FLASH_BARKS.map((_, i) => i));
  }
  const idx = save.barkBag.pop();
  persist();
  return FAIL_FLASH_BARKS[idx];
}
function triggerFailFlash() {
  flash.text = nextBarkLine();
  flash.t = flash.dur;
  flash.active = true;
  SFX.bark(3);
}
function drawFailFlash(g) {
  if (!flash.active) return;
  const remain = Math.max(0, flash.t / flash.dur);
  g.fillStyle = 'rgba(52,8,4,' + (0.45 + 0.25 * remain) + ')';
  g.fillRect(0, 0, W, H);
  if (flashImgReady && flashImg) {
    // the real face: scale-punch as it lands, then it just LOOMS
    const punch = 1 + 0.30 * remain * remain;
    const s = 620 * punch;
    g.drawImage(flashImg, W / 2 - s / 2, 238 - s / 2, s, s);
  } else {
    const big = SPR.dsBig[save.dsPack];
    const pulse = 1 + 0.05 * Math.sin(timeNow * 30) * remain;
    const fw = 400 * pulse, fh = 453 * pulse;
    g.drawImage(big, W / 2 - fw / 2, 208 - fh / 2, fw, fh);
  }
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
  const frame = d.count % 2 ? SPR.pushDn : SPR.pushUp;
  const bob = Math.sin(timeNow * 3) * 3;
  g.drawImage(frame, 330, 300 + bob, 340, 200);
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
el('nextDayBtn').addEventListener('click', () => { showOnly(null); CG.midgameAd(() => startDay(day + 1)); });
el('dayMenuBtn').addEventListener('click', quitToMenu);
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
  flashState() { return { active: flash.active, t: flash.t, text: flash.text, bankRemaining: Array.isArray(save.barkBag) ? save.barkBag.length : 0 }; },
  triggerFailFlash
};
