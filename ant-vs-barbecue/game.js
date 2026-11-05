/* ============================================================
   ANT VS BARBECUE — endless lane defense for CrazyGames.
   The browser edition of Carlton's own app game (Backyard BBQ
   Defense): ants march down a picnic blanket to raid the feast,
   you hold the line with candles, grills, swatters, hoses and
   picnic baskets. The app's 10 waves + Queen finale become an
   ENDLESS escalating cookout here — score chase, no final wave.

   THE TWIST — CRUMB THIEVES: from Wave 3, some ants aren't here
   to eat your defenders. They sprint for the food, grab a crumb
   (-250 score, -15 charcoal) and RUN BACK with it. Pop a thief
   on the run back to win the crumb back; if it escapes off the
   right edge, the loot is gone for good. Priority targets.

   Vanilla JS + Canvas, no build step, no dependencies. All art
   is drawn in code (pre-rendered to offscreen canvases at boot);
   all sound is synthesized with WebAudio. FLAT FOLDER by design:
   the CrazyGames uploader flattens subfolders, so every file
   sits at the root and the game references bare filenames only.

   CrazyGames SDK v3 is integrated through the CG wrapper below,
   following the studio's proven pattern: every call is feature-
   detected and try/caught, so the game runs identically on a
   plain static host with no SDK present.
   ============================================================ */
'use strict';

/* ---------------- field geometry (same as the app) ---------------- */
const W = 1000, H = 560;
const ROWS = 5, COLS = 9;
const GRID_X = 118, GRID_Y = 26, CELL_W = 90, CELL_H = 102;
const GRID_R = GRID_X + COLS * CELL_W;          // 928 — ants enter here
const HOUSE_X = 44;                              // ants crossing this reach the food
const ZAPPER_X = 66;
const FOOD_X = 104;                              // thieves grab a crumb here

/* ---------------- defenders (app stats) ---------------- */
const DEFENDERS = {
  candle:  { name: 'Citronella Candle', icon: '🕯️', cost: 50,  hp: 140, cooldown: 5,  desc: 'Cooks up +25 charcoal' },
  grill:   { name: 'Grill',             icon: '🔥', cost: 100, hp: 220, cooldown: 5,  desc: 'Lobs fireballs down the lane' },
  swatter: { name: 'Fly Swatter',       icon: '🏸', cost: 125, hp: 280, cooldown: 7,  desc: 'Huge smacks, point blank only' },
  hose:    { name: 'Garden Hose',       icon: '💦', cost: 150, hp: 220, cooldown: 7,  desc: 'Soaks ants — big slowdown' },
  basket:  { name: 'Picnic Basket',     icon: '🧺', cost: 75,  hp: 850, cooldown: 10, desc: 'A wall with snacks inside' }
};
const CARD_ORDER = ['candle', 'grill', 'swatter', 'hose', 'basket'];
const GRILL_DMG = 30, GRILL_RATE = 1.35;         // fireball damage / seconds per shot
const SWAT_DMG = 95, SWAT_RATE = 1.05;           // melee damage / seconds per smack
const HOSE_TICK = 0.3, HOSE_SLOW = 0.45, HOSE_SLOW_DUR = 1.6, HOSE_DMG = 3;
const CANDLE_PERIOD = 12, CANDLE_YIELD = 25;

/* ---------------- ants (app stats + the thief) ---------------- */
const ANT_TYPES = {
  basic:     { hp: 105,  speed: 14,   dmg: 36,  score: 100,  r: 20, coins: 1, name: 'Ant' },
  fire:      { hp: 85,   speed: 31,   dmg: 36,  score: 150,  r: 19, coins: 2, name: 'Fire Ant' },
  carpenter: { hp: 520,  speed: 9.5,  dmg: 55,  score: 300,  r: 25, coins: 4, name: 'Carpenter Ant' },
  roach:     { hp: 340,  speed: 23,   dmg: 45,  score: 250,  r: 23, coins: 3, name: 'Roach' },
  queen:     { hp: 4600, speed: 7,    dmg: 130, score: 5000, r: 46, coins: 50, name: 'Queen Ant' },
  thief:     { hp: 95,   speed: 21,   dmg: 36,  score: 150,  r: 20, coins: 3, name: 'Crumb Thief' }
};
const THIEF_RUNBACK_SPEED = 52;
const CRUMB_SCORE = 250, CRUMB_CHARCOAL = 15;
/* Waves 1–10 mirror the app's table; 11+ are generated, endless. */
const APP_WAVES = [
  { basic: 6 },
  { basic: 10 },
  { basic: 12, fire: 3 },
  { basic: 14, fire: 5, carpenter: 1 },
  { basic: 16, fire: 6, carpenter: 2 },
  { basic: 14, fire: 8, carpenter: 2, roach: 3 },
  { basic: 18, fire: 8, carpenter: 3, roach: 5 },
  { basic: 20, fire: 10, carpenter: 4, roach: 6 },
  { basic: 24, fire: 12, carpenter: 5, roach: 8 },
  { basic: 16, fire: 8, carpenter: 4, roach: 6, queen: 1 }
];
const hpMulForWave = n => (n <= 10 ? 1 : Math.pow(1.16, n - 10));

/* ---------------- meta: upgrades, chefs, blanket themes ---------------- */
const UPGRADES = {
  flames: { name: 'Sharper Flames', icon: '🔥', desc: '+15% Grill damage per level',        costs: [100, 200, 400, 800, 1600] },
  swat:   { name: 'Heavy Swatter',  icon: '🏸', desc: '+20% Fly Swatter damage per level',  costs: [100, 200, 400, 800, 1600] },
  wax:    { name: 'Big Wax Energy', icon: '🕯️', desc: '+25% candle + lump charcoal / level', costs: [100, 200, 400, 800, 1600] },
  weave:  { name: 'Reinforced Gear', icon: '🧺', desc: '+30% Basket & Hose health / level', costs: [100, 200, 400, 800, 1600] },
  zap:    { name: 'Zapper Recharge', icon: '⚡', desc: 'Spent zappers re-arm as waves roll on', costs: [150, 300, 600, 1200, 2400] }
};
const CHEFS = {
  rookie:       { name: 'Backyard Rookie',  icon: '🧢', cost: 0,    desc: 'Just here for the cookout.' },
  sergeant:     { name: 'Grill Sergeant',   icon: '🎖️', cost: 600,  desc: '+10% all defender damage.' },
  auntie:       { name: 'Auntie Citronella', icon: '👒', cost: 1800, desc: 'Candles +50%, charcoal lumps +25%.' },
  exterminator: { name: 'The Exterminator', icon: '🕶️', cost: 4500, desc: '+20% damage. Zappers re-arm after every Queen.' }
};
const THEMES = {
  gingham:    { name: 'Classic Gingham', cost: 0,    a: '#e8e3d5', b: '#d9534a', grass: '#4d7c43', path: '#c9b189' },
  denim:      { name: 'Blue Denim',      cost: 400,  a: '#b9c8de', b: '#3d5a80', grass: '#557f47', path: '#a8b6c4' },
  night:      { name: 'Night Cookout',   cost: 1500, a: '#3a4460', b: '#232a42', grass: '#1d2b22', path: '#4a4438' },
  goldenhour: { name: 'Golden Hour',     cost: 3500, a: '#f6d9a0', b: '#e07b39', grass: '#6b8f3f', path: '#d9a75e' }
};

/* ---------------- lawn decor (deterministic, generated once) ---------------- */
const DECOR = (() => {
  let s = 1234567;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const speck = [], tufts = [], clouds = [];
  for (let i = 0; i < 240; i++) speck.push({ x: rnd() * W, y: rnd() * H, r: 1 + rnd() * 2.3, l: rnd() });
  for (let i = 0; i < 30; i++) tufts.push({ x: rnd() * W, y: rnd() * H, h: 6 + rnd() * 7, ph: rnd() * 7 });
  for (let i = 0; i < 3; i++) clouds.push({ x: rnd() * W, y: 70 + rnd() * 400, sc: 0.8 + rnd() * 0.9, v: 5 + rnd() * 5 });
  return { speck, tufts, clouds };
})();
const onBlanket = (x, y) => x >= GRID_X - 4 && x <= GRID_R + 4 && y >= GRID_Y - 4 && y <= GRID_Y + ROWS * CELL_H + 4;

/* ---------------- save (meta only; runs are fresh) ---------------- */
const SAVE_KEY = 'antVsBbqSaveV1';
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function defaultSave() {
  return {
    coins: 0, upg: { flames: 0, swat: 0, wax: 0, weave: 0, zap: 0 },
    chef: 'rookie', chefsOwned: ['rookie'], theme: 'gingham', themesOwned: ['gingham'],
    bestScore: 0, bestWave: 0, runs: 0, muted: false,
    tutStep: 0, tutDone: false, everPlaced: false
  };
}
let save = defaultSave();
try {
  const raw = lsGet(SAVE_KEY);
  if (raw) {
    const d = JSON.parse(raw);
    if (d && typeof d === 'object') {
      save = Object.assign(defaultSave(), d);
      save.upg = Object.assign(defaultSave().upg, d.upg || {});
    }
  }
} catch (e) { save = defaultSave(); }
/* Anyone who has ever placed a defender is not a new player. */
if (save.everPlaced) save.tutDone = true;
function persist() { lsSet(SAVE_KEY, JSON.stringify(save)); }

/* ---------------- derived stats ---------------- */
const chefDmgMul = () => (save.chef === 'sergeant' ? 1.10 : save.chef === 'exterminator' ? 1.20 : 1);
const grillDmg = () => GRILL_DMG * (1 + 0.15 * save.upg.flames) * chefDmgMul();
const swatDmg = () => SWAT_DMG * (1 + 0.20 * save.upg.swat) * chefDmgMul();
const candleYield = () => Math.round(CANDLE_YIELD * (1 + 0.25 * save.upg.wax) * (save.chef === 'auntie' ? 1.5 : 1));
const lumpValue = () => Math.round(25 * (1 + 0.25 * save.upg.wax) * (save.chef === 'auntie' ? 1.25 : 1));
const defMaxHp = key => Math.round(DEFENDERS[key].hp * ((key === 'basket' || key === 'hose') ? 1 + 0.30 * save.upg.weave : 1));
const zapRearmEvery = () => (save.upg.zap > 0 ? Math.max(4, 12 - 2 * save.upg.zap) : Infinity);

/* ---------------- CrazyGames SDK v3 wrapper ----------------
   Same proven pattern as the studio's other games: init()
   resolves before any other call; loading/gameplay calls
   bracket activity; midgame ads ONLY at natural breaks (run
   over, Queen wave cleared) with mute+freeze callbacks and a
   3-minute client throttle mirroring the server cooldown; the
   portal's game.settings.muteAudio outranks the in-game toggle.
   Every call is feature-detected + try/caught — off-portal the
   SDK reports environment 'disabled' and throws, treated absent. */
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

/* ---------------- audio: all synthesized, no files ----------------
   The SFX voices are the app's own synth recipes. */
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
function noiseBurst(dur, vol, freq) {
  if (effectiveMuted()) return; const a = ac(); if (!a) return;
  try {
    const len = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq || 1200;
    const g = a.createGain(); g.gain.value = vol || 0.2;
    src.connect(f); f.connect(g); g.connect(a.destination); src.start();
  } catch (e) {}
}
const SFX = {
  shoot() { tone(620, 0.09, 'square', 0.05, 180); },
  hit() { tone(190, 0.05, 'square', 0.045, 120); },
  splat() { noiseBurst(0.14, 0.16, 500); tone(140, 0.14, 'sawtooth', 0.08, 50); },
  swat() { noiseBurst(0.08, 0.2, 900); tone(300, 0.08, 'triangle', 0.1, 90); },
  spray() { noiseBurst(0.1, 0.05, 2600); },
  place() { tone(150, 0.12, 'triangle', 0.16, 70); noiseBurst(0.05, 0.08, 700); },
  collect() { tone(880, 0.09, 'sine', 0.12); tone(1320, 0.14, 'sine', 0.12, null, 0.07); },
  coin() { tone(990, 0.07, 'sine', 0.10); tone(1480, 0.12, 'sine', 0.10, null, 0.06); },
  zap() { noiseBurst(0.4, 0.3, 300); tone(1400, 0.35, 'sawtooth', 0.14, 80); },
  chomp() { tone(110, 0.07, 'square', 0.06, 70); },
  steal() { tone(740, 0.12, 'square', 0.10, 1180); tone(1180, 0.16, 'square', 0.09, 1560, 0.1); },
  horn() { tone(196, 0.16, 'square', 0.1); tone(262, 0.16, 'square', 0.1, null, 0.14); tone(330, 0.3, 'square', 0.11, null, 0.28); },
  fanfare() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, null, i * 0.13)); },
  lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.1, null, i * 0.2)); },
  error() { tone(160, 0.12, 'square', 0.09, 120); },
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
/* shade a #rrggbb color: f in [-1,1] (negative darkens, positive lightens) */
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; gg += (255 - gg) * f; b += (255 - b) * f; }
  else { r *= 1 + f; gg *= 1 + f; b *= 1 + f; }
  return 'rgb(' + (r | 0) + ',' + (gg | 0) + ',' + (b | 0) + ')';
}
/* rounded-rect path (smoke-test ctx stub has no roundRect — draw it by hand) */
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
/* Detailed shaded ant: segmented glossy gaster with banding + belly +
   specular, thorax, head with glossy eye, mandibles and two-segment
   antennae. pal = {dark, main, light, belly, accent}; opts per species. */
function antBody(g, w, h, pal, opts) {
  opts = opts || {};
  const cy = h * 0.52;
  const ell = (cx, cyy, rx, ry, rot) => { g.beginPath(); g.ellipse(cx, cyy, rx, ry, rot || 0, 0, 7); };
  const sheen = (cx, cyy, r) => {
    const gr = g.createRadialGradient(cx - r * 0.35, cyy - r * 0.4, 1, cx, cyy, r);
    gr.addColorStop(0, pal.light); gr.addColorStop(0.55, pal.main); gr.addColorStop(1, pal.dark);
    return gr;
  };
  /* ---- abdomen / gaster ---- */
  g.fillStyle = sheen(w * 0.70, cy, w * 0.30); ell(w * 0.70, cy, w * 0.26, h * 0.30); g.fill();
  // segment bands: concentric ellipses scaled inside the gaster (no clip needed)
  g.strokeStyle = 'rgba(0,0,0,.30)'; g.lineWidth = Math.max(1.4, h * 0.045);
  for (const k of [0.42, 0.64, 0.84]) { ell(w * 0.70, cy, w * 0.26 * k, h * 0.30 * k); g.stroke(); }
  g.fillStyle = pal.belly; g.globalAlpha = 0.75; ell(w * 0.70, cy + h * 0.13, w * 0.185, h * 0.155); g.fill(); g.globalAlpha = 1;
  if (opts.goldBands) {
    g.strokeStyle = 'rgba(255,217,77,.75)'; g.lineWidth = h * 0.035;
    for (const k of [0.52, 0.74]) { ell(w * 0.70, cy, w * 0.26 * k, h * 0.30 * k); g.stroke(); }
  }
  if (opts.wing) {   // roach wing-case: center split + long sheen streak
    g.strokeStyle = 'rgba(20,10,4,.55)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(w * 0.50, cy); g.lineTo(w * 0.93, cy); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.20)'; ell(w * 0.68, cy - h * 0.10, w * 0.19, h * 0.07, -0.25); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,.30)'; ell(w * 0.615, cy - h * 0.175, w * 0.095, h * 0.065, -0.4); g.fill();   // specular
  if (opts.flame) {   // fire ant: flame crest on the gaster
    const fx = w * 0.78, fy = cy - h * 0.30, fs = h * 0.30 * (opts.flameScale || 1);
    const fg = g.createRadialGradient(fx, fy, 1, fx, fy, fs);
    fg.addColorStop(0, 'rgba(255,220,90,.95)'); fg.addColorStop(0.5, 'rgba(255,120,40,.75)'); fg.addColorStop(1, 'rgba(255,80,20,0)');
    g.fillStyle = fg; g.beginPath(); g.arc(fx, fy, fs, 0, 7); g.fill();
    g.fillStyle = '#ff8a3d';
    g.beginPath(); g.moveTo(fx - fs * 0.34, fy + fs * 0.3); g.quadraticCurveTo(fx - fs * 0.4, fy - fs * 0.25, fx, fy - fs * 0.62);
    g.quadraticCurveTo(fx + fs * 0.38, fy - fs * 0.2, fx + fs * 0.32, fy + fs * 0.3); g.quadraticCurveTo(fx, fy + fs * 0.45, fx - fs * 0.34, fy + fs * 0.3); g.fill();
    g.fillStyle = '#ffd94d'; g.beginPath(); g.ellipse(fx, fy + fs * 0.16, fs * 0.15, fs * 0.24, 0, 0, 7); g.fill();
  }
  /* ---- thorax + neck ---- */
  g.fillStyle = pal.dark; ell(w * 0.325, cy, w * 0.045, h * 0.13); g.fill();
  g.fillStyle = sheen(w * 0.44, cy, w * 0.17); ell(w * 0.44, cy, w * 0.155, h * 0.225); g.fill();
  g.fillStyle = 'rgba(255,255,255,.22)'; ell(w * 0.415, cy - h * 0.10, w * 0.07, h * 0.05, -0.4); g.fill();
  /* ---- head ---- */
  g.fillStyle = sheen(w * 0.215, cy, w * 0.135); ell(w * 0.215, cy, w * 0.125, h * 0.205); g.fill();
  // mandibles (front, left — the ant faces left)
  g.strokeStyle = pal.dark; g.lineWidth = Math.max(1.6, h * 0.045); g.lineCap = 'round';
  g.beginPath(); g.moveTo(w * 0.115, cy + h * 0.05); g.quadraticCurveTo(w * 0.045, cy + h * 0.10, w * 0.035, cy + h * 0.01); g.stroke();
  g.beginPath(); g.moveTo(w * 0.12, cy + h * 0.13); g.quadraticCurveTo(w * 0.06, cy + h * 0.20, w * 0.045, cy + h * 0.12); g.stroke();
  // antennae: elbowed, with tip bulbs
  const aLen = opts.longAntennae ? 1.35 : 1;
  g.lineWidth = Math.max(1.6, h * 0.04);
  g.beginPath(); g.moveTo(w * 0.17, cy - h * 0.15); g.quadraticCurveTo(w * 0.13, cy - h * 0.36, w * 0.035, cy - h * 0.40 * aLen); g.stroke();
  g.beginPath(); g.moveTo(w * 0.21, cy - h * 0.16); g.quadraticCurveTo(w * 0.20, cy - h * 0.38, w * 0.10, cy - h * 0.47 * aLen); g.stroke();
  g.fillStyle = pal.light;
  g.beginPath(); g.arc(w * 0.035, cy - h * 0.40 * aLen, Math.max(1.4, h * 0.035), 0, 7); g.fill();
  g.beginPath(); g.arc(w * 0.10, cy - h * 0.47 * aLen, Math.max(1.4, h * 0.035), 0, 7); g.fill();
  // glossy eye
  g.fillStyle = '#140b06'; ell(w * 0.185, cy - h * 0.055, w * 0.030, h * 0.052); g.fill();
  g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(w * 0.175, cy - h * 0.075, Math.max(1, h * 0.02), 0, 7); g.fill();
  if (opts.mask) {   // crumb thief: bandit mask band across the head, eye hole punched
    g.fillStyle = '#17100a'; ell(w * 0.205, cy - h * 0.045, w * 0.118, h * 0.082); g.fill();
    g.fillStyle = pal.accent; g.beginPath(); g.arc(w * 0.185, cy - h * 0.055, Math.max(1.8, h * 0.042), 0, 7); g.fill();
    g.fillStyle = '#140b06'; g.beginPath(); g.arc(w * 0.185, cy - h * 0.055, Math.max(0.9, h * 0.02), 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(w * 0.178, cy - h * 0.068, Math.max(0.7, h * 0.016), 0, 7); g.fill();
  }
}
const SPR = {};
function buildSprites() {
  SPR.basic = makeSprite(64, 48, (g, w, h) => antBody(g, w, h, { dark: '#2e1c0d', main: '#4a3220', light: '#7d5a36', belly: '#6b4a2c', accent: '#fff' }));
  SPR.fire = makeSprite(64, 48, (g, w, h) => antBody(g, w, h, { dark: '#6e1c08', main: '#a82c12', light: '#e87a3d', belly: '#d9542b', accent: '#ffd94d' }, { flame: true }));
  SPR.carpenter = makeSprite(84, 60, (g, w, h) => antBody(g, w, h, { dark: '#120b06', main: '#2b1c10', light: '#59452a', belly: '#453017', accent: '#fff' }));
  SPR.roach = makeSprite(76, 52, (g, w, h) => antBody(g, w, h, { dark: '#33200e', main: '#5d3a1a', light: '#96682f', belly: '#7d5226', accent: '#ffe9a8' }, { wing: true, longAntennae: true }));
  SPR.queen = makeSprite(150, 110, (g, w, h) => {
    antBody(g, w, h, { dark: '#3d0d29', main: '#6d1f4d', light: '#b45c8d', belly: '#93406e', accent: '#ffe9a8' }, { goldBands: true });
    // crown: gold gradient, three points, jewel dots
    const cg = g.createLinearGradient(0, h * 0.04, 0, h * 0.32);
    cg.addColorStop(0, '#ffe97a'); cg.addColorStop(0.6, '#ffd94d'); cg.addColorStop(1, '#d9a416');
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(w * 0.095, h * 0.27); g.lineTo(w * 0.135, h * 0.07); g.lineTo(w * 0.195, h * 0.215);
    g.lineTo(w * 0.255, h * 0.045); g.lineTo(w * 0.315, h * 0.235); g.lineTo(w * 0.335, h * 0.325); g.lineTo(w * 0.105, h * 0.325);
    g.closePath(); g.fill();
    g.strokeStyle = '#a87c0e'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#ff5e7a'; g.beginPath(); g.arc(w * 0.215, h * 0.27, 4.4, 0, 7); g.fill();
    g.fillStyle = '#7ddcff'; g.beginPath(); g.arc(w * 0.145, h * 0.28, 3.2, 0, 7); g.arc(w * 0.29, h * 0.28, 3.2, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.beginPath(); g.arc(w * 0.205, h * 0.26, 1.4, 0, 7); g.fill();
    // sparkle beside the crown
    g.strokeStyle = 'rgba(255,233,168,.9)'; g.lineWidth = 2;
    const sx = w * 0.40, sy = h * 0.13;
    g.beginPath(); g.moveTo(sx - 6, sy); g.lineTo(sx + 6, sy); g.moveTo(sx, sy - 6); g.lineTo(sx, sy + 6); g.stroke();
  });
  SPR.thief = makeSprite(64, 48, (g, w, h) => antBody(g, w, h, { dark: '#1d1206', main: '#3d2c14', light: '#6e5626', belly: '#59431f', accent: '#ffd94d' }, { mask: true }));
  SPR.sack = makeSprite(30, 30, (g, w, h) => {   // the crumb sack, drawn on a laden thief
    const sg = g.createRadialGradient(w * 0.38, h * 0.38, 2, w / 2, h * 0.58, w * 0.5);
    sg.addColorStop(0, '#f4dc8e'); sg.addColorStop(0.6, '#e8c96a'); sg.addColorStop(1, '#c39f3e');
    g.fillStyle = sg; g.beginPath(); g.ellipse(w / 2, h * 0.58, w * 0.36, h * 0.34, 0, 0, 7); g.fill();
    g.fillStyle = '#b8933f'; g.fillRect(w / 2 - 3, 2, 6, 8);
    g.strokeStyle = '#8a6a24'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(w / 2 - 5, 9); g.lineTo(w / 2 + 5, 9); g.stroke();
    g.fillStyle = '#8a5a1d'; g.beginPath(); g.arc(w * 0.4, h * 0.55, 3, 0, 7); g.arc(w * 0.6, h * 0.66, 2.4, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(w * 0.38, h * 0.4, 3.4, 2, -0.5, 0, 7); g.fill();
  });
  SPR.lump = makeSprite(34, 30, (g, w, h) => {
    const eg = g.createRadialGradient(w * 0.56, h * 0.42, 1, w * 0.56, h * 0.46, 12);
    eg.addColorStop(0, 'rgba(255,150,50,.85)'); eg.addColorStop(1, 'rgba(255,110,30,0)');
    g.fillStyle = eg; g.beginPath(); g.arc(w * 0.56, h * 0.46, 12, 0, 7); g.fill();
    const chunk = (cx, cyy, rx, ry, lite) => {
      const cg2 = g.createLinearGradient(cx - rx, cyy - ry, cx + rx, cyy + ry);
      cg2.addColorStop(0, lite); cg2.addColorStop(1, '#171208');
      g.fillStyle = cg2; g.beginPath(); g.ellipse(cx, cyy, rx, ry, 0, 0, 7); g.fill();
    };
    chunk(w / 2, h * 0.64, w * 0.36, h * 0.30, '#4a3a28');
    chunk(w * 0.38, h * 0.48, w * 0.18, h * 0.17, '#5d4832');
    chunk(w * 0.63, h * 0.52, w * 0.14, h * 0.13, '#54402a');
    g.fillStyle = '#ff7a2f'; g.beginPath(); g.arc(w * 0.58, h * 0.44, 3.4, 0, 7); g.fill();
    g.fillStyle = '#ffb020'; g.beginPath(); g.arc(w * 0.58, h * 0.44, 1.7, 0, 7); g.fill();
    g.fillStyle = '#fff3b0'; g.beginPath(); g.arc(w * 0.57, h * 0.43, 0.8, 0, 7); g.fill();
  });
}
function drawDefenderArt(g, type, size, tNow) {
  const s = size, cx = s / 2, base = s * 0.86;
  g.save(); g.translate(cx, base);
  if (type === 'candle') {
    // citronella candle in a glass jar: glass sheen, wax body, live flame
    const fl = 1 + Math.sin(tNow * 9) * 0.15;
    const glow = g.createRadialGradient(0, -s * 0.52, 1, 0, -s * 0.40, s * 0.36);
    glow.addColorStop(0, 'rgba(255,190,60,.34)'); glow.addColorStop(1, 'rgba(255,190,60,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(0, -s * 0.40, s * 0.36, 0, 7); g.fill();
    const jar = g.createLinearGradient(-s * 0.11, 0, s * 0.11, 0);
    jar.addColorStop(0, '#fdf3d0'); jar.addColorStop(0.5, '#f3e2b8'); jar.addColorStop(1, '#dfc489');
    g.fillStyle = jar; rr(g, -s * 0.11, -s * 0.44, s * 0.22, s * 0.44, s * 0.045); g.fill();
    const wax = g.createLinearGradient(0, -s * 0.30, 0, 0);
    wax.addColorStop(0, '#f7d774'); wax.addColorStop(1, '#dfae3e');
    g.fillStyle = wax; rr(g, -s * 0.095, -s * 0.30, s * 0.19, s * 0.285, s * 0.03); g.fill();
    g.fillStyle = '#c9a44e'; rr(g, -s * 0.115, -s * 0.465, s * 0.23, s * 0.05, s * 0.02); g.fill();   // rim band
    g.fillStyle = 'rgba(255,255,255,.55)'; rr(g, -s * 0.085, -s * 0.42, s * 0.035, s * 0.36, s * 0.016); g.fill();   // glass streak
    g.fillStyle = '#4a3520'; g.fillRect(-s * 0.008, -s * 0.50, s * 0.016, s * 0.05);   // wick
    const fg = g.createRadialGradient(0, -s * 0.545, 0.5, 0, -s * 0.52, s * 0.115 * fl);
    fg.addColorStop(0, '#fff6c8'); fg.addColorStop(0.45, '#ffb020'); fg.addColorStop(1, 'rgba(255,110,30,0)');
    g.fillStyle = fg; g.beginPath(); g.ellipse(0, -s * 0.53 * fl, s * 0.062, s * 0.115 * fl, 0, 0, 7); g.fill();
    g.fillStyle = '#fff3b0'; g.beginPath(); g.ellipse(0, -s * 0.515 * fl, s * 0.026, s * 0.055 * fl, 0, 0, 7); g.fill();
  } else if (type === 'grill') {
    // kettle grill: shaded bowl, legs, grate bars over glowing coals, smoke wisp
    const smokePh = (tNow * 0.35 + 0.3) % 1;
    g.fillStyle = 'rgba(230,230,230,' + (0.20 * (1 - smokePh)).toFixed(3) + ')';
    g.beginPath(); g.ellipse(s * 0.05 + Math.sin(tNow * 1.3) * s * 0.02, -s * 0.42 - smokePh * s * 0.22, s * (0.05 + smokePh * 0.06), s * (0.035 + smokePh * 0.045), 0, 0, 7); g.fill();
    g.strokeStyle = '#15181c'; g.lineWidth = s * 0.045; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-s * 0.20, -s * 0.10); g.lineTo(-s * 0.27, 0); g.stroke();
    g.beginPath(); g.moveTo(s * 0.20, -s * 0.10); g.lineTo(s * 0.27, 0); g.stroke();
    const bowl = g.createRadialGradient(-s * 0.08, -s * 0.30, s * 0.04, 0, -s * 0.16, s * 0.34);
    bowl.addColorStop(0, '#4a5158'); bowl.addColorStop(0.6, '#2b3036'); bowl.addColorStop(1, '#14171b');
    g.fillStyle = bowl; g.beginPath(); g.ellipse(0, -s * 0.16, s * 0.31, s * 0.175, 0, 0, 7); g.fill();
    const fl = 1 + Math.sin(tNow * 11 + 1) * 0.18;
    const coals = g.createRadialGradient(0, -s * 0.235, 1, 0, -s * 0.22, s * 0.20);
    coals.addColorStop(0, 'rgba(255,190,60,.95)'); coals.addColorStop(0.55, 'rgba(255,106,31,.85)'); coals.addColorStop(1, 'rgba(200,50,10,.25)');
    g.fillStyle = coals; g.beginPath(); g.ellipse(0, -s * 0.225, s * 0.185 * fl, s * 0.062 * fl, 0, 0, 7); g.fill();
    g.fillStyle = '#ffd94d';
    g.beginPath(); g.moveTo(-s * 0.045, -s * 0.225); g.quadraticCurveTo(0, -s * 0.315 * fl, s * 0.045, -s * 0.225); g.quadraticCurveTo(0, -s * 0.20, -s * 0.045, -s * 0.225); g.fill();
    g.strokeStyle = '#79828c'; g.lineWidth = s * 0.038;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * s * 0.105, -s * 0.315); g.lineTo(i * s * 0.105, -s * 0.155); g.stroke(); }
    g.strokeStyle = '#98a1a9'; g.lineWidth = s * 0.03;
    g.beginPath(); g.moveTo(-s * 0.29, -s * 0.235); g.lineTo(s * 0.29, -s * 0.235); g.stroke();
    g.fillStyle = '#15181c'; g.fillRect(-s * 0.385, -s * 0.20, s * 0.075, s * 0.045); g.fillRect(s * 0.31, -s * 0.20, s * 0.075, s * 0.045);   // side handles
    g.fillStyle = 'rgba(255,255,255,.20)'; g.beginPath(); g.ellipse(-s * 0.13, -s * 0.27, s * 0.10, s * 0.035, -0.25, 0, 7); g.fill();
  } else if (type === 'swatter') {
    // wooden handle + red mesh swatter head (gradient, rim, hole grid)
    const hg = g.createLinearGradient(-s * 0.20, 0, s * 0.09, -s * 0.42);
    hg.addColorStop(0, '#6e4423'); hg.addColorStop(0.5, '#a06a35'); hg.addColorStop(1, '#7c4f27');
    g.strokeStyle = hg; g.lineWidth = s * 0.075; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-s * 0.16, 0); g.lineTo(s * 0.05, -s * 0.42); g.stroke();
    g.save(); g.translate(s * 0.13, -s * 0.52); g.rotate(0.5);
    const sg = g.createRadialGradient(-s * 0.06, -s * 0.08, s * 0.03, 0, 0, s * 0.27);
    sg.addColorStop(0, '#f0765e'); sg.addColorStop(0.65, '#e2543e'); sg.addColorStop(1, '#b93a28');
    g.fillStyle = sg; g.beginPath(); g.ellipse(0, 0, s * 0.20, s * 0.26, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(120,25,15,.5)';
    for (let ix = -2; ix <= 2; ix++) for (let iy = -3; iy <= 3; iy++) {
      const dx = ix * s * 0.075 + (iy % 2 ? s * 0.037 : 0), dy = iy * s * 0.07;
      if ((dx / (s * 0.185)) ** 2 + (dy / (s * 0.245)) ** 2 > 0.92) continue;   // keep holes inside the head
      g.beginPath(); g.arc(dx, dy, s * 0.016, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.ellipse(-s * 0.07, -s * 0.11, s * 0.09, s * 0.13, -0.4, 0, 7); g.fill();
    g.strokeStyle = '#93321f'; g.lineWidth = s * 0.028; g.beginPath(); g.ellipse(0, 0, s * 0.20, s * 0.26, 0, 0, 7); g.stroke();
    g.restore();
  } else if (type === 'hose') {
    // coiled garden hose: two shaded rings + brass nozzle + water bead
    const coil = (r, lw) => {
      const cg2 = g.createLinearGradient(-r, -s * 0.16 - r, r, -s * 0.16 + r);
      cg2.addColorStop(0, '#3fae6a'); cg2.addColorStop(0.5, '#2e7d4f'); cg2.addColorStop(1, '#1d5c37');
      g.strokeStyle = cg2; g.lineWidth = lw; g.lineCap = 'round';
      g.beginPath(); g.arc(-s * 0.05, -s * 0.16, r, 0, 7); g.stroke();
    };
    coil(s * 0.205, s * 0.105); coil(s * 0.115, s * 0.095);
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = s * 0.028;
    g.beginPath(); g.arc(-s * 0.05, -s * 0.16, s * 0.205, -2.2, -1.1); g.stroke();
    g.beginPath(); g.arc(-s * 0.05, -s * 0.16, s * 0.115, -2.4, -1.4); g.stroke();
    const nz = g.createLinearGradient(0, -s * 0.10, 0, s * 0.10);
    nz.addColorStop(0, '#f2cd6b'); nz.addColorStop(0.5, '#c9a44e'); nz.addColorStop(1, '#96762a');
    g.fillStyle = nz; g.save(); g.translate(s * 0.185, -s * 0.315); g.rotate(-0.7); rr(g, -s * 0.052, -s * 0.105, s * 0.104, s * 0.21, s * 0.03); g.fill();
    g.fillStyle = '#7c5f1e'; g.fillRect(-s * 0.052, s * 0.045, s * 0.104, s * 0.028); g.restore();
    const dg = g.createRadialGradient(s * 0.235, -s * 0.40, 0.5, s * 0.25, -s * 0.385, s * 0.045);
    dg.addColorStop(0, '#eaf9ff'); dg.addColorStop(0.4, '#9be7ff'); dg.addColorStop(1, 'rgba(90,170,230,.25)');
    g.fillStyle = dg; g.beginPath(); g.ellipse(s * 0.25, -s * 0.385, s * 0.032, s * 0.045, 0.5, 0, 7); g.fill();
  } else if (type === 'basket') {
    // woven picnic basket: shaded body, weave, rim, checkered cloth + bread peek
    const bb = g.createLinearGradient(0, -s * 0.34, 0, 0);
    bb.addColorStop(0, '#c99a58'); bb.addColorStop(1, '#96682e');
    g.fillStyle = bb; g.beginPath();
    g.moveTo(-s * 0.32, -s * 0.34); g.lineTo(s * 0.32, -s * 0.34); g.lineTo(s * 0.25, 0); g.lineTo(-s * 0.25, 0); g.closePath(); g.fill();
    // weave rows sized to the trapezoid's half-width at each height (no clip)
    g.strokeStyle = 'rgba(110,72,25,.65)'; g.lineWidth = s * 0.030;
    for (let i = 0; i < 3; i++) {
      const yy = -s * 0.255 + i * s * 0.095, hw = s * (0.32 - ((yy / s + 0.34) / 0.34) * 0.07) - s * 0.012;
      g.beginPath(); g.moveTo(-hw, yy); g.lineTo(hw, yy); g.stroke();
    }
    g.strokeStyle = 'rgba(255,230,170,.30)'; g.lineWidth = s * 0.020;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * s * 0.105 + s * 0.015, -s * 0.335); g.lineTo(i * s * 0.105 - s * 0.015, -s * 0.01); g.stroke(); }
    g.fillStyle = '#7c4f1d'; rr(g, -s * 0.335, -s * 0.385, s * 0.67, s * 0.055, s * 0.02); g.fill();   // rim
    // checkered cloth draped over the top
    g.fillStyle = '#f6f0e2'; rr(g, -s * 0.30, -s * 0.475, s * 0.60, s * 0.10, s * 0.03); g.fill();
    g.fillStyle = '#d9534a';
    for (let i = 0; i < 4; i++) g.fillRect(-s * 0.30 + i * s * 0.15 + s * 0.028, -s * 0.475, s * 0.045, s * 0.10);
    g.fillRect(-s * 0.30, -s * 0.44, s * 0.60, s * 0.032);
    // bread roll peeking out
    const bg2 = g.createRadialGradient(-s * 0.02, -s * 0.52, 1, 0, -s * 0.485, s * 0.085);
    bg2.addColorStop(0, '#f7d774'); bg2.addColorStop(1, '#c98f3a');
    g.fillStyle = bg2; g.beginPath(); g.ellipse(0, -s * 0.485, s * 0.085, s * 0.042, 0, 0, 7); g.fill();
  }
  g.restore();
}

/* ---------------- run state ---------------- */
let state = 'menu';              // menu | playing | paused | shop | howto | over
let shopFrom = 'menu';
let grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null)), zappers = Array(ROWS).fill(true);
let ants = [], projectiles = [], particles = [], lumps = [], zapFx = [];
let charcoal = 150, score = 0, wave = 0, phase = 'build', phaseTimer = 14, spawnQueue = [], spawnTimer = 0, waveTotal = 0, waveSpawned = 0;
let selected = null, cardCooldowns = {}, shake = 0, timeNow = 0, runCoins = 0, kills = 0, thievesStopped = 0, thievesEscaped = 0, lumpTimer = 5, trickleAcc = 0, queenAlive = false;
let backState = 'menu';

function resetRun() {
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  zappers = Array(ROWS).fill(true);
  ants = []; projectiles = []; particles = []; lumps = []; zapFx = [];
  charcoal = 150; score = 0; wave = 0; phase = 'build'; phaseTimer = 14;
  spawnQueue = []; spawnTimer = 0; waveTotal = 0; waveSpawned = 0;
  selected = null; cardCooldowns = {}; shake = 0; runCoins = 0; kills = 0;
  thievesStopped = 0; thievesEscaped = 0; lumpTimer = 5; trickleAcc = 0; queenAlive = false;
  save.runs++; persist();
}
function cellCenter(r, c) { return { x: GRID_X + c * CELL_W + CELL_W / 2, y: GRID_Y + r * CELL_H + CELL_H / 2 }; }
function laneY(r) { return GRID_Y + r * CELL_H + CELL_H / 2; }

/* ---------------- waves ---------------- */
function buildWave(n) {
  let comp;
  if (n <= 10) comp = Object.assign({}, APP_WAVES[n - 1]);
  else {
    const k = n - 10;
    comp = {
      basic: 20 + k * 3, fire: 10 + k * 2, carpenter: 4 + Math.floor(k * 0.8),
      roach: 6 + k, queen: n % 10 === 0 ? 1 : 0
    };
  }
  if (n > 10 && n % 10 === 0) comp.queen = 1;
  const list = [];
  for (const t of Object.keys(comp)) for (let i = 0; i < (comp[t] || 0); i++) list.push(t);
  // shuffle, but the queen always marches last
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const tmp = list[i]; list[i] = list[j]; list[j] = tmp; }
  const qi = list.indexOf('queen');
  if (qi >= 0) { list.splice(qi, 1); list.push('queen'); }
  // crumb thieves ride along inside the basic column from wave 3
  if (n >= 3) {
    let thieves = Math.min(1 + Math.floor((n - 3) / 2), 5);
    for (let i = 0; i < list.length && thieves > 0; i++) {
      if (list[i] === 'basic' && Math.random() < 0.22) { list[i] = 'thief'; thieves--; }
    }
    if (thieves > 0) { const bi = list.indexOf('basic'); if (bi >= 0) list[bi] = 'thief'; }
  }
  return list;
}
function startWave(n) {
  wave = n; phase = 'wave'; queenAlive = false;
  spawnQueue = buildWave(n); waveTotal = spawnQueue.length; waveSpawned = 0; spawnTimer = 0.5;
  if (n > 1 && save.upg.zap > 0 && n % zapRearmEvery() === 0 && zappers.some(z => !z)) {
    zappers = Array(ROWS).fill(true);
    toast('⚡ Zapper Recharge — every lane is hot again!');
  }
  const isQueenWave = n % 10 === 0;
  showBanner(isQueenWave ? '👑 QUEEN WAVE ' + n : 'WAVE ' + n, isQueenWave ? 'Something BIG is coming…' : (n === 5 ? 'A huge wave of ants is approaching!' : ''));
  if (n === 3 && !save.tutDone && save.tutStep === 3) tutAdvance(4);   // thief lesson arms at wave 3 (once earlier lessons are done)
  refreshCards(); updateHud();
}
function spawnAnt(type) {
  const spec = ANT_TYPES[type];
  const lane = Math.floor(Math.random() * ROWS);
  const ant = {
    type, lane, x: GRID_R + 40 + Math.random() * 30, hp: spec.hp * hpMulForWave(wave), maxHp: spec.hp * hpMulForWave(wave),
    speed: spec.speed, slowUntil: 0, flash: 0, dead: false, squash: 0, walk: Math.random() * 7,
    carrying: false, escaped: false, biteAcc: 0
  };
  ants.push(ant);
  if (type === 'queen') { queenAlive = true; showBanner('👑 THE QUEEN ANT 👑', 'Squash her to save the cookout!'); addShake(6); SFX.horn(); }
  return ant;
}

/* ---------------- economy + combat ---------------- */
function addCharcoal(n) { charcoal += n; updateHud(); }
function bankCoins(n) { runCoins += n; save.coins += n; persist(); updateHud(); }
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 130 - 20, life: 0.5, max: 0.5, color, size: 2 + Math.random() * 2.5 });
}
function addShake(n) { shake = Math.max(shake, n); }
function damageAnt(a, dmg) {
  if (a.dead) return;
  a.hp -= dmg; a.flash = 0.08;
  if (a.hp <= 0) killAnt(a);
}
function killAnt(a) {
  a.dead = true; a.squash = 0.28; kills++;
  const spec = ANT_TYPES[a.type];
  score += spec.score;
  bankCoins(spec.coins);
  burst(a.x, laneY(a.lane), a.type === 'fire' ? '#ff8a3d' : '#5b4632', a.type === 'queen' ? 30 : 12);
  SFX.splat();
  if (a.type === 'queen') { queenAlive = false; addShake(14); CG.happytime(); }
  else if (a.type === 'carpenter' || a.type === 'roach') addShake(3);
  if (a.type === 'thief' && a.carrying) {
    score += CRUMB_SCORE; addCharcoal(CRUMB_CHARCOAL); thievesStopped++;
    toast('🍪 Crumb recovered! +' + CRUMB_SCORE);
    SFX.coin();
  }
  if (a.type === 'thief') tutResolveThief();   // popped one, lesson learned (carrying or not)
  updateHud();
}
function fireZapper(lane) {
  zappers[lane] = false;
  const y = laneY(lane);
  const bolt = [{ x: ZAPPER_X + 6, y }];
  let bx = ZAPPER_X + 6;
  while (bx < GRID_R) { bx += 26 + Math.random() * 30; bolt.push({ x: bx, y: y + (Math.random() * 26 - 13) }); }
  zapFx.push({ points: bolt, life: 0.3 });
  for (const a of ants) if (a.lane === lane && !a.dead) damageAnt(a, 1e9);
  for (let i = 0; i < 14; i++) particles.push({ x: ZAPPER_X + Math.random() * 30, y: y - 24 + Math.random() * 48, vx: 60 + Math.random() * 220, vy: -60 + Math.random() * 120, life: 0.35, max: 0.35, color: i % 3 ? '#ffe94d' : '#9be7ff', size: 2.5 });
  SFX.zap(); addShake(5);
  toast('⚡ Bug zapper fired in lane ' + (lane + 1) + '! That lane is wide open now…');
}
function placeDefender(r, c) {
  const key = selected, def = DEFENDERS[key];
  if (!def || grid[r][c]) return false;
  if (charcoal < def.cost) { toast('Need ' + (def.cost - charcoal) + ' more charcoal for ' + def.name + '!'); SFX.error(); return false; }
  if ((cardCooldowns[key] || 0) > 0) { toast(def.name + ' is cooling down…'); return false; }
  charcoal -= def.cost;
  cardCooldowns[key] = def.cooldown;
  grid[r][c] = { type: key, hp: defMaxHp(key), maxHp: defMaxHp(key), cool: 0.4, hoseTick: 0 };
  selected = null;
  if (!save.everPlaced) { save.everPlaced = true; persist(); }
  SFX.place();
  const ctr = cellCenter(r, c);
  burst(ctr.x, ctr.y + 20, '#c9b189', 8);
  tutOnPlace(key);
  refreshCards(); updateHud();
  return true;
}
function shovelAt(r, c) {
  if (!grid[r][c]) return false;
  const ctr = cellCenter(r, c);
  burst(ctr.x, ctr.y, '#c9b189', 10);
  grid[r][c] = null; selected = null;
  SFX.place(); refreshCards();
  return true;
}
function collectLump(l) {
  l.gone = true;
  addCharcoal(lumpValue());
  SFX.collect();
  burst(l.x, l.y, '#ffd94d', 7);
  tutOnCollect();
}

/* ---------------- the simulation ---------------- */
function update(dt) {
  timeNow += dt;
  for (const k of Object.keys(cardCooldowns)) if (cardCooldowns[k] > 0) cardCooldowns[k] = Math.max(0, cardCooldowns[k] - dt);
  // charcoal trickle + sky lumps
  trickleAcc += dt;
  if (trickleAcc >= 1.5) { trickleAcc = 0; charcoal += 1; updateHud(); }
  lumpTimer -= dt;
  if (lumpTimer <= 0) {
    lumpTimer = 7 + Math.random() * 4;
    lumps.push({ x: GRID_X + 30 + Math.random() * (COLS * CELL_W - 60), y: GRID_Y + 16 + Math.random() * (ROWS * CELL_H - 30), life: 8, bob: Math.random() * 7, gone: false });
  }
  for (const l of lumps) { l.life -= dt; if (l.life <= 0) l.gone = true; }
  lumps = lumps.filter(l => !l.gone);

  if (phase === 'build') {
    phaseTimer -= dt;
    if (phaseTimer <= 0) startWave(wave + 1);
  } else if (phase === 'wave') {
    if (spawnQueue.length) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = Math.max(0.35, 1.15 - wave * 0.03);
        spawnAnt(spawnQueue.shift()); waveSpawned++;
      }
    } else if (!ants.some(a => !a.dead)) {
      phase = 'build'; phaseTimer = 16;
      const bonus = 100 + wave * 25;
      score += bonus;
      bankCoins(5 + wave);
      toast('Wave ' + wave + ' cleared! +' + bonus + ' bonus');
      SFX.fanfare();
      if (wave % 10 === 0) {           // queen wave cleared: natural break
        if (save.chef === 'exterminator' && zappers.some(z => !z)) { zappers = Array(ROWS).fill(true); toast('🕶️ The Exterminator re-armed your zappers!'); }
        CG.midgameAd(() => {});
      }
      updateHud();
    }
  }

  /* defenders */
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const d = grid[r][c]; if (!d) continue;
    d.cool -= dt;
    if (d.type === 'candle') {
      if (d.cool <= 0) { d.cool = CANDLE_PERIOD; addCharcoal(candleYield()); const ctr = cellCenter(r, c); burst(ctr.x, ctr.y - 26, '#ffd94d', 4); }
    } else if (d.type === 'grill') {
      if (d.cool <= 0) {
        const target = ants.filter(a => !a.dead && a.lane === r && a.x > GRID_X + c * CELL_W).sort((p, q) => p.x - q.x)[0];
        if (target) {
          const ctr = cellCenter(r, c);
          projectiles.push({ x: ctr.x + 16, y: ctr.y - 12, lane: r, vx: 340, dmg: grillDmg(), gone: false });
          d.cool = GRILL_RATE; SFX.shoot();
        } else d.cool = 0.15;
      }
    } else if (d.type === 'swatter') {
      if (d.cool <= 0) {
        const front = GRID_X + (c + 1) * CELL_W;
        const target = ants.filter(a => !a.dead && a.lane === r && a.x > GRID_X + c * CELL_W - 8 && a.x < front + 26).sort((p, q) => p.x - q.x)[0];
        if (target) { damageAnt(target, swatDmg()); d.cool = SWAT_RATE; d.swing = 0.22; SFX.swat(); }
        else d.cool = 0.12;
      }
      if (d.swing > 0) d.swing -= dt;
    } else if (d.type === 'hose') {
      d.hoseTick -= dt;
      const inRange = ants.filter(a => !a.dead && a.lane === r && a.x > GRID_X + c * CELL_W && a.x < GRID_X + (c + 3) * CELL_W);
      d.spraying = inRange.length > 0;
      if (d.spraying && d.hoseTick <= 0) {
        d.hoseTick = HOSE_TICK;
        for (const a of inRange) { a.slowUntil = timeNow + (a.type === 'roach' ? HOSE_SLOW_DUR * 0.56 : HOSE_SLOW_DUR); damageAnt(a, HOSE_DMG * chefDmgMul()); }
        SFX.spray();
      }
    }
  }

  /* projectiles */
  for (const p of projectiles) {
    p.x += p.vx * dt;
    const hit = ants.filter(a => !a.dead && a.lane === p.lane && Math.abs(a.x - p.x) < ANT_TYPES[a.type].r + 8).sort((u, v) => u.x - v.x)[0];
    if (hit) { p.gone = true; damageAnt(hit, p.dmg); SFX.hit(); burst(p.x, laneY(p.lane) - 6, '#ffb020', 4); }
    if (p.x > W + 20) p.gone = true;
  }
  projectiles = projectiles.filter(p => !p.gone);

  /* ants */
  for (const a of ants) {
    if (a.dead) { a.squash -= dt; continue; }
    if (a.flash > 0) a.flash -= dt;
    a.walk += dt * (a.carrying ? 14 : 8);
    const slowed = timeNow < a.slowUntil;
    const spd = a.speed * (slowed ? HOSE_SLOW : 1) * (a.type === 'queen' ? 1 : 1 + wave * 0.004);
    if (a.carrying) {                       // thief running the crumb home
      a.x += THIEF_RUNBACK_SPEED * dt;
      if (a.x > W + 30) {
        a.dead = true; a.squash = 0; a.escaped = true; thievesEscaped++;
        toast('🍪 A thief got away with your crumb!');
        SFX.error();
        tutResolveThief();
      }
      continue;
    }
    // find a defender to eat: the cell whose right portion the ant has reached
    const mouthX = a.x - ANT_TYPES[a.type].r * 0.55;
    const col = Math.floor((mouthX - GRID_X) / CELL_W);
    const target = (col >= 0 && col < COLS && mouthX >= GRID_X) ? grid[a.lane][col] : null;
    if (target) {
      a.biteAcc += dt;
      target.hp -= ANT_TYPES[a.type].dmg * dt;
      if (a.biteAcc >= 0.55) { a.biteAcc = 0; SFX.chomp(); }
      if (target.hp <= 0) {
        grid[a.lane][col] = null;
        toast(DEFENDERS[target.type].name + ' got eaten!');
        burst(a.x - 14, laneY(a.lane), '#8a5f27', 8);
        refreshCards();
      }
    } else {
      a.x -= spd * dt;
    }
    if (a.x < FOOD_X && a.type === 'thief' && !a.carrying) {
      a.carrying = true;
      score = Math.max(0, score - CRUMB_SCORE);
      charcoal = Math.max(0, charcoal - CRUMB_CHARCOAL);
      SFX.steal();
      toast('🍪 Crumb stolen! Pop that thief!');
      burst(a.x, laneY(a.lane), '#ffd94d', 10);
      updateHud();
      continue;
    }
    if (a.x < HOUSE_X + 10) {
      if (zappers[a.lane]) { fireZapper(a.lane); }
      else { gameOver(a.lane); return; }
    }
  }
  ants = ants.filter(a => !a.dead || a.squash > 0);

  /* particles + zap fx */
  for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.life -= dt; }
  particles = particles.filter(p => p.life > 0);
  for (const z of zapFx) z.life -= dt;
  zapFx = zapFx.filter(z => z.life > 0);
  if (shake > 0) shake = Math.max(0, shake - dt * 26);
}

/* ---------------- tutorial (first run only, never repeats) ----------------
   Steps: 0 pick Grill card -> 1 place it -> 2 tap a charcoal lump ->
   3 place a Candle -> 4 (armed at Wave 3) stop a Crumb Thief -> done.
   Every prompt <= 10 words, pointing highlight on the target, the bar
   never blocks input, ✕ skips forever, and anyone who has ever placed
   a defender (save.everPlaced) never sees it. */
const TUT_TEXT = [
  '👆 Pick the Grill card up top',
  '👆 Tap a lawn square to place it',
  '👆 Charcoal lumps fall — tap one!',
  '🕯️ Place a Candle — free charcoal',
  '🍪 Crumb Thief! Pop him running back!'
];
function tutActive() { return state === 'playing' && !save.tutDone && save.tutStep >= 0 && save.tutStep <= 4; }
function tutAdvance(step) {
  if (save.tutDone) return;
  if (step > save.tutStep) { save.tutStep = step; persist(); }
  refreshTut();
}
function tutFinish() { save.tutDone = true; persist(); refreshTut(); refreshCards(); }
function tutOnSelect(key) { if (tutActive() && save.tutStep === 0 && key === 'grill') tutAdvance(1); }
function tutOnPlace(key) {
  if (!tutActive()) return;
  if (save.tutStep === 1) {
    tutAdvance(2);
    if (!lumps.length) { lumpTimer = 0.1; }   // make sure a lump is on its way
  }
  if (save.tutStep === 3 && key === 'candle') tutAdvance(4);
  if (save.tutStep === 2 && key === 'candle') tutAdvance(4);  // eager beaver: skip ahead
}
function tutOnCollect() { if (tutActive() && save.tutStep === 2) tutAdvance(3); }
function tutResolveThief() { if (tutActive() && save.tutStep === 4) tutFinish(); }
function refreshTut() {
  const bar = el('tutBar');
  if (!bar) return;
  // Step 4 (thief lesson) stays hidden until thieves actually exist.
  const step4TooEarly = save.tutStep === 4 && wave < 3 && !(typeof ants !== 'undefined' && ants && ants.some(a => a.type === 'thief'));
  if (tutActive() && !step4TooEarly) { bar.classList.remove('hidden'); tutTextEl.textContent = TUT_TEXT[save.tutStep]; }
  else bar.classList.add('hidden');
  refreshCards();
}

/* ---------------- rendering ---------------- */
function render() {
  const theme = THEMES[save.theme] || THEMES.gingham;
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  // ---- backyard: shaded lawn, dirt entry (right), feast path (left) ----
  const grassG = ctx.createLinearGradient(0, -12, 0, H + 12);
  grassG.addColorStop(0, shade(theme.grass, 0.13)); grassG.addColorStop(0.55, theme.grass); grassG.addColorStop(1, shade(theme.grass, -0.20));
  ctx.fillStyle = grassG; ctx.fillRect(-12, -12, W + 24, H + 24);
  const dirtG = ctx.createLinearGradient(GRID_R, 0, W + 12, 0);
  dirtG.addColorStop(0, shade(theme.path, -0.02)); dirtG.addColorStop(1, shade(theme.path, -0.26));
  ctx.fillStyle = dirtG; ctx.fillRect(GRID_R, -12, W - GRID_R + 12, H + 24);
  const pathG = ctx.createLinearGradient(0, GRID_Y, 0, GRID_Y + ROWS * CELL_H);
  pathG.addColorStop(0, shade(theme.path, 0.10)); pathG.addColorStop(1, shade(theme.path, -0.14));
  ctx.fillStyle = pathG; ctx.fillRect(-12, GRID_Y, GRID_X - 8 + 12, ROWS * CELL_H);
  // lawn speckle + swaying grass tufts (grass/dirt only, never on the blanket)
  for (const sp of DECOR.speck) {
    if (onBlanket(sp.x, sp.y)) continue;
    ctx.fillStyle = sp.l > 0.5 ? 'rgba(255,255,220,.10)' : 'rgba(0,0,0,.10)';
    ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r, 0, 7); ctx.fill();
  }
  ctx.lineCap = 'round';
  for (const tf of DECOR.tufts) {
    if (onBlanket(tf.x, tf.y)) continue;
    const sway = Math.sin(timeNow * 1.7 + tf.ph) * 2.2;
    for (let b = -1; b <= 1; b++) {
      const bx = tf.x + b * 3.2, tipX = bx + sway * (1 + b * 0.22) + b * 1.5;
      ctx.strokeStyle = b === 0 ? shade(theme.grass, 0.28) : shade(theme.grass, 0.16); ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.moveTo(bx, tf.y); ctx.quadraticCurveTo(bx + sway * 0.4, tf.y - tf.h * 0.6, tipX, tf.y - tf.h); ctx.stroke();
    }
  }
  // ---- picnic blanket: themed checks + fabric sheen + stitched border ----
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    ctx.fillStyle = (r + c) % 2 ? theme.a : theme.b;
    ctx.fillRect(GRID_X + c * CELL_W, GRID_Y + r * CELL_H, CELL_W, CELL_H);
  }
  const sheen = ctx.createLinearGradient(GRID_X, GRID_Y, GRID_R, GRID_Y + ROWS * CELL_H);
  sheen.addColorStop(0, 'rgba(255,255,235,.10)'); sheen.addColorStop(0.45, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(30,10,0,.07)');
  ctx.fillStyle = sheen; ctx.fillRect(GRID_X, GRID_Y, COLS * CELL_W, ROWS * CELL_H);
  ctx.strokeStyle = 'rgba(0,0,0,.10)'; ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(GRID_X + c * CELL_W, GRID_Y); ctx.lineTo(GRID_X + c * CELL_W, GRID_Y + ROWS * CELL_H); ctx.stroke(); }
  for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(GRID_X, GRID_Y + r * CELL_H); ctx.lineTo(GRID_R, GRID_Y + r * CELL_H); ctx.stroke(); }
  ctx.strokeStyle = shade(theme.b, -0.28); ctx.lineWidth = 5;
  ctx.strokeRect(GRID_X - 2, GRID_Y - 2, COLS * CELL_W + 4, ROWS * CELL_H + 4);
  ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.6; ctx.setLineDash([7, 6]);
  ctx.strokeRect(GRID_X + 6, GRID_Y + 6, COLS * CELL_W - 12, ROWS * CELL_H - 12);
  ctx.setLineDash([]);
  // soft seam shadow where the blanket meets the feast path
  ctx.fillStyle = 'rgba(0,0,0,.13)'; ctx.fillRect(GRID_X - 9, GRID_Y, 5, ROWS * CELL_H);
  // cloud shadows drifting over the whole yard (soft gradients — no clip needed)
  for (const cl of DECOR.clouds) {
    const sx = ((cl.x + timeNow * cl.v) % (W + 380)) - 190;
    const sg = ctx.createRadialGradient(sx, cl.y, 10, sx, cl.y, 130 * cl.sc);
    sg.addColorStop(0, 'rgba(18,40,10,.10)'); sg.addColorStop(1, 'rgba(18,40,10,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.ellipse(sx, cl.y, 135 * cl.sc, 54 * cl.sc, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx - 60 * cl.sc, cl.y + 10, 70 * cl.sc, 34 * cl.sc, 0, 0, 7); ctx.fill();
  }
  // the feast: each dish served on a plate
  const foods = ['🍗', '🌭', '🍔', '🌽', '🍉'];
  ctx.font = '30px serif'; ctx.textAlign = 'center';
  for (let r = 0; r < ROWS; r++) {
    const y = laneY(r);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(88, y + 15, 27, 7, 0, 0, 7); ctx.fill();
    const pg = ctx.createRadialGradient(82, y + 4, 2, 88, y + 8, 27);
    pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.75, '#f1ead8'); pg.addColorStop(1, '#cfc4a6');
    ctx.fillStyle = pg; ctx.beginPath(); ctx.ellipse(88, y + 8, 27, 10.5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(120,100,60,.4)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(88, y + 8, 20, 7, 0, 0, 7); ctx.stroke();
    ctx.fillText(foods[r], 88, y + 10);
  }
  // zappers: little lantern housings with a live blue tube (or a spent X)
  for (let r = 0; r < ROWS; r++) {
    const y = laneY(r);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(ZAPPER_X, y + 25, 15, 4.5, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(ZAPPER_X, y);
    const housing = ctx.createLinearGradient(-11, 0, 11, 0);
    housing.addColorStop(0, '#4c5866'); housing.addColorStop(0.5, '#39424e'); housing.addColorStop(1, '#22282f');
    ctx.fillStyle = housing; rr(ctx, -11, -22, 22, 44, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.4; rr(ctx, -11, -22, 22, 44, 6); ctx.stroke();
    if (zappers[r]) {
      const flick = 0.78 + Math.sin(timeNow * 22 + r * 2.1) * 0.22;
      const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
      glow.addColorStop(0, 'rgba(155,231,255,' + (0.45 * flick).toFixed(3) + ')'); glow.addColorStop(1, 'rgba(155,231,255,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.fill();
      const tube = ctx.createLinearGradient(-6, 0, 6, 0);
      tube.addColorStop(0, '#7cc7ee'); tube.addColorStop(0.5, '#d8f6ff'); tube.addColorStop(1, '#7cc7ee');
      ctx.fillStyle = tube; rr(ctx, -6, -15, 12, 30, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(20,60,90,.8)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-3.4, -8); ctx.lineTo(0.8, -1); ctx.lineTo(-1.6, -1); ctx.lineTo(3.4, 8); ctx.stroke();
    } else {
      ctx.fillStyle = '#23272c'; rr(ctx, -6, -15, 12, 30, 4); ctx.fill();
      ctx.strokeStyle = '#6a7178'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-6, -10); ctx.lineTo(6, 10); ctx.moveTo(6, -10); ctx.lineTo(-6, 10); ctx.stroke();
    }
    ctx.restore();
  }
  // placement ghost + tutorial ring
  if (state === 'playing' && selected && selected !== 'shovel' && hoverCell) {
    const ctr = cellCenter(hoverCell.r, hoverCell.c);
    ctx.fillStyle = grid[hoverCell.r][hoverCell.c] ? 'rgba(255,80,60,.3)' : 'rgba(255,255,255,.35)';
    ctx.fillRect(GRID_X + hoverCell.c * CELL_W + 3, GRID_Y + hoverCell.r * CELL_H + 3, CELL_W - 6, CELL_H - 6);
    if (!grid[hoverCell.r][hoverCell.c]) { ctx.globalAlpha = 0.65; drawDefenderArtAt(ctr.x, ctr.y + 34, selected, 74); ctx.globalAlpha = 1; }
  }
  if (tutActive() && save.tutStep === 1) {
    const ctr = cellCenter(2, 2), pulse = 1 + Math.sin(timeNow * 6) * 0.12;
    ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(ctr.x, ctr.y, 40 * pulse, 44 * pulse, 0, 0, 7); ctx.stroke();
    ctx.font = '26px serif'; ctx.fillText('👇', ctr.x, ctr.y - 52 + Math.sin(timeNow * 6) * 5);
  }
  // defenders
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const d = grid[r][c]; if (!d) continue;
    const ctr = cellCenter(r, c);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.ellipse(ctr.x, ctr.y + 32, 30, 7, 0, 0, 7); ctx.fill();
    if (d.type === 'swatter' && d.swing > 0) { ctx.save(); ctx.translate(ctr.x, ctr.y + 34); ctx.rotate(-0.7); ctx.translate(-ctr.x, -ctr.y - 34); drawDefenderArtAt(ctr.x, ctr.y + 34, d.type, 76); ctx.restore(); }
    else drawDefenderArtAt(ctr.x, ctr.y + 34, d.type, 76);
    if (d.hp < d.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(ctr.x - 26, ctr.y - 46, 52, 6);
      ctx.fillStyle = d.hp / d.maxHp > 0.35 ? '#7ddc6a' : '#ff6a5e'; ctx.fillRect(ctr.x - 26, ctr.y - 46, 52 * Math.max(0, d.hp / d.maxHp), 6);
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.strokeRect(ctr.x - 26, ctr.y - 46, 52, 6);
    }
    if (d.type === 'hose' && d.spraying) {
      const sprayG = ctx.createLinearGradient(ctr.x + 20, 0, ctr.x + CELL_W * 2.6, 0);
      sprayG.addColorStop(0, 'rgba(150,215,255,.32)'); sprayG.addColorStop(1, 'rgba(150,215,255,.04)');
      ctx.fillStyle = sprayG;
      ctx.beginPath();
      ctx.moveTo(ctr.x + 20, ctr.y - 12); ctx.lineTo(ctr.x + CELL_W * 2.6, ctr.y - 34); ctx.lineTo(ctr.x + CELL_W * 2.6, ctr.y + 22); ctx.lineTo(ctr.x + 20, ctr.y + 8);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(225,246,255,.55)';
      for (let i = 0; i < 11; i++) {
        const fx = ctr.x + 34 + ((i * 67 + timeNow * 300) % (CELL_W * 2.25));
        const fy = ctr.y - 8 + ((i * 41) % 30) - 8 + Math.sin(timeNow * 9 + i * 1.7) * 2.5;
        ctx.beginPath(); ctx.arc(fx, fy, 1.8, 0, 7); ctx.fill();
      }
    }
  }
  // charcoal lumps
  for (const l of lumps) {
    const bobY = Math.sin(timeNow * 3 + l.bob) * 3;
    if (l.life < 2 && Math.floor(timeNow * 6) % 2) continue;   // blink before vanishing
    ctx.fillStyle = 'rgba(255,200,60,.25)'; ctx.beginPath(); ctx.arc(l.x, l.y + bobY, 20 + Math.sin(timeNow * 5) * 3, 0, 7); ctx.fill();
    ctx.drawImage(SPR.lump, l.x - 17, l.y - 15 + bobY);
  }
  // ants
  const sorted = ants.slice().sort((a, b) => a.lane - b.lane || a.x - b.x);
  for (const a of sorted) {
    const y = laneY(a.lane), spec = ANT_TYPES[a.type], spr = SPR[a.type];
    const sw = spr.width, sh = spr.height;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(a.x, y + spec.r * 0.8, spec.r * 0.9, 5, 0, 0, 7); ctx.fill();
    if (a.dead) {  // squash
      ctx.save(); ctx.translate(a.x, y + spec.r * 0.5); ctx.scale(1.25, 0.35); ctx.globalAlpha = Math.max(0, a.squash / 0.28);
      ctx.drawImage(spr, -sw / 2, -sh / 2); ctx.restore(); ctx.globalAlpha = 1;
      continue;
    }
    // legs: two-segment (hip -> knee -> foot), far set dimmer + shorter
    ctx.strokeStyle = a.type === 'fire' ? '#7d1f08' : (a.type === 'queen' ? '#3d0d29' : '#241708');
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.7; ctx.lineWidth = 2.4;
    for (let i = 0; i < 3; i++) {
      const hx = a.x - 11 + i * 11, ph = Math.sin(a.walk + i * 1.1 + 0.6);
      ctx.beginPath(); ctx.moveTo(hx, y - 3);
      ctx.lineTo(hx + ph * 3, y - spec.r * 0.40); ctx.lineTo(hx + ph * 6, y - spec.r * 0.60); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const hx = a.x - 11 + i * 11, ph = Math.sin(a.walk + i * 1.1);
      ctx.beginPath(); ctx.moveTo(hx, y + 3);
      ctx.lineTo(hx + ph * 4 + 2, y + spec.r * 0.48); ctx.lineTo(hx + ph * 8, y + spec.r * 0.88); ctx.stroke();
    }
    ctx.save();
    if (a.carrying) { ctx.translate(a.x, y); ctx.scale(-1, 1); ctx.translate(-a.x, -y); }
    if (a.flash > 0) { ctx.globalAlpha = 0.75; }
    ctx.drawImage(spr, a.x - sw / 2, y - sh / 2);
    ctx.restore();
    if (a.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.ellipse(a.x, y, spec.r, spec.r * 0.62, 0, 0, 7); ctx.fill(); }
    if (a.carrying) ctx.drawImage(SPR.sack, a.x - 15, y - spec.r - 24 + Math.sin(a.walk * 2) * 2);
    if (timeNow < a.slowUntil) { ctx.fillStyle = 'rgba(120,200,255,.35)'; ctx.beginPath(); ctx.ellipse(a.x, y, spec.r + 3, spec.r * 0.66, 0, 0, 7); ctx.fill(); }
    if (a.maxHp > 130 && a.hp < a.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(a.x - 24, y - spec.r - 14, 48, 6);
      ctx.fillStyle = a.type === 'queen' ? '#ff5ea8' : '#ffb020'; ctx.fillRect(a.x - 24, y - spec.r - 14, 48 * Math.max(0, a.hp / a.maxHp), 6);
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.strokeRect(a.x - 24, y - spec.r - 14, 48, 6);
    }
  }
  // fireballs: glowing gradient core + fading trail
  for (const p of projectiles) {
    const y = laneY(p.lane) - 12;
    const flick = 1 + Math.sin(timeNow * 30 + p.x * 0.05) * 0.15;
    const glow = ctx.createRadialGradient(p.x, y, 1, p.x, y, 17 * flick);
    glow.addColorStop(0, 'rgba(255,150,50,.50)'); glow.addColorStop(1, 'rgba(255,110,30,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(p.x, y, 17 * flick, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,110,30,.30)'; ctx.beginPath(); ctx.arc(p.x - 10, y + 1, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,110,30,.16)'; ctx.beginPath(); ctx.arc(p.x - 19, y + 2, 4, 0, 7); ctx.fill();
    const core = ctx.createRadialGradient(p.x + 2, y - 2, 0.5, p.x, y, 8.5);
    core.addColorStop(0, '#fff6c8'); core.addColorStop(0.45, '#ffd94d'); core.addColorStop(0.8, '#ff8a2f'); core.addColorStop(1, '#f25c10');
    ctx.fillStyle = core; ctx.beginPath(); ctx.arc(p.x, y, 8.5 * flick, 0, 7); ctx.fill();
  }
  // zapper bolts: wide glow pass under a bright core pass
  for (const z of zapFx) {
    const al = Math.max(0, z.life / 0.3);
    ctx.strokeStyle = 'rgba(110,190,255,' + (al * 0.35).toFixed(3) + ')'; ctx.lineWidth = 6; ctx.lineJoin = 'round';
    ctx.beginPath(); z.points.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)); ctx.stroke();
    ctx.strokeStyle = 'rgba(225,248,255,' + al.toFixed(3) + ')'; ctx.lineWidth = 2.2;
    ctx.beginPath(); z.points.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)); ctx.stroke();
  }
  // particles: soft round motes, not squares
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
function drawDefenderArtAt(x, yBottom, type, size) {
  ctx.save(); ctx.translate(x - size / 2, yBottom - size);
  drawDefenderArt(ctx, type, size, timeNow);
  ctx.restore();
}

/* ---------------- HUD / cards / toast / banner ---------------- */
let toastTimer = null;
function toast(msg) {
  const t = el('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
let bannerTimer = null;
function showBanner(main, sub) {
  const b = el('banner'); if (!b) return;
  b.innerHTML = '';
  const d1 = document.createElement('div'); d1.textContent = main;
  const d2 = document.createElement('div'); d2.className = 'sub'; d2.textContent = sub || '';
  b.appendChild(d1); if (sub) b.appendChild(d2);
  b.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.remove('show'), 2100);
}
function updateHud() {
  if (el('charcoalVal')) el('charcoalVal').textContent = '🪨 ' + Math.floor(charcoal);
  if (el('scoreVal')) el('scoreVal').textContent = '🏆 ' + Math.floor(score);
  if (el('waveVal')) el('waveVal').textContent = '🌊 Wave ' + Math.max(1, wave);
  if (el('coinsVal')) el('coinsVal').textContent = '🪙 ' + save.coins;
  if (el('phaseLbl')) {
    el('phaseLbl').textContent = state !== 'playing' ? 'The ants are coming for the feast…'
      : phase === 'build' ? 'Next wave in ' + Math.ceil(phaseTimer) + 's — shore up the blanket!'
      : 'Wave ' + wave + ' — ' + (waveTotal - waveSpawned + ants.filter(a => !a.dead).length) + ' ants to go';
  }
  const nb = el('nextWaveBtn');
  if (nb) nb.classList.toggle('hidden', !(state === 'playing' && phase === 'build'));
}
const cardEls = {};
function buildCards() {
  const bar = el('cardbar'); if (!bar) return;
  bar.innerHTML = '';
  for (const key of CARD_ORDER) {
    const def = DEFENDERS[key];
    const b = document.createElement('button');
    b.className = 'card'; b.id = 'card-' + key;
    b.innerHTML = '<span class="cicon">' + def.icon + '</span><span class="cname">' + def.name + '</span>' +
      '<span class="ccost">🪨 ' + def.cost + '</span><span class="cdesc">' + def.desc + '</span><span class="ccd"></span>';
    b.addEventListener('click', () => { selectCard(key); });
    bar.appendChild(b); cardEls[key] = b;
  }
  const sh = document.createElement('button');
  sh.className = 'card shovel'; sh.id = 'card-shovel';
  sh.innerHTML = '<span class="cicon">⛏️</span><span class="cname">Shovel</span><span class="ccost">free</span><span class="cdesc">Dig up a defender</span><span class="ccd"></span>';
  sh.addEventListener('click', () => { selectCard('shovel'); });
  bar.appendChild(sh); cardEls.shovel = sh;
}
function selectCard(key) {
  if (state !== 'playing') return;
  if (key !== 'shovel') {
    const def = DEFENDERS[key];
    if ((cardCooldowns[key] || 0) > 0) { toast(def.name + ' is cooling down…'); return; }
    if (charcoal < def.cost) { toast('Need ' + (def.cost - charcoal) + ' more charcoal for ' + def.name + '!'); SFX.error(); return; }
  }
  selected = selected === key ? null : key;
  SFX.click();
  tutOnSelect(key);
  refreshCards();
}
function refreshCards() {
  for (const key of CARD_ORDER) {
    const ce = cardEls[key]; if (!ce) continue;
    const def = DEFENDERS[key], cd = cardCooldowns[key] || 0;
    const cant = charcoal < def.cost;
    ce.classList.toggle('sel', selected === key);
    ce.classList.toggle('cant', cant || cd > 0);
    ce.classList.toggle('tut-glow', tutActive() && ((save.tutStep === 0 && key === 'grill') || (save.tutStep === 3 && key === 'candle')));
    const costEl = ce.querySelector('.ccost'), cdEl = ce.querySelector('.ccd');
    if (costEl) costEl.textContent = cant ? '🪨 ' + def.cost + ' · Need ' + (def.cost - Math.floor(charcoal)) + ' more' : '🪨 ' + def.cost;
    if (cdEl) cdEl.textContent = cd > 0 ? '⏳ ' + Math.ceil(cd) + 's' : '';
  }
  if (cardEls.shovel) cardEls.shovel.classList.toggle('sel', selected === 'shovel');
}

/* ---------------- viewport pinning + responsive fit ----------------
   The field is a fixed 1000x560 design. Round 1 sized the column by
   viewport width alone and it overflowed phone screens. Round 2 sized
   by the visible viewport but left #wrap in normal document flow at
   height:100dvh — on Edge (Android) the layout viewport stays taller
   than the VISIBLE one while the tab strip + address bar are up, so
   the column's top slid under the browser bars (defender card names
   clipped — "can't see what I'm picking") and tall overlay content
   spilled below the fold. The bulletproof arrangement, round 3: the
   game is the entire page, #wrap is position:fixed, and pinWrap()
   drives its size AND offset from window.visualViewport
   (width/height/offsetLeft/offsetTop) on vv resize + scroll, so the
   column always sits exactly inside the visible area. fitStage()
   measures the real chrome heights and caps the unified column width
   (--uW, shared by HUD / card bar / wave bar / stage) by that same
   visible box, so the WHOLE column fits by width and height —
   letterboxed, never cropped, never scrollable. Desktop (>= ~1030px
   wide with room to spare) resolves to the same 1000px design. */
function vvBox() {
  const vv = window.visualViewport;
  if (vv && vv.width) {
    return { w: vv.width, h: vv.height, ox: vv.offsetLeft || 0, oy: vv.offsetTop || 0 };
  }
  return { w: window.innerWidth || 1000, h: window.innerHeight || 800, ox: 0, oy: 0 };
}
let lastFitW = 0;
function chromeHeight() {
  let h = 48;  // wrap padding (16) + flex gaps (18) + safe-area/fudge slack
  for (const id of ['hud', 'cardbar', 'waveBar', 'rotateHint']) {
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
  for (let i = 0; i < 3; i++) {           // card bar wraps -> heights shift; converge, keep the min
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
/* Pin #wrap onto the visible viewport, then re-fit the column. Any
   browser-bar slide (vv scroll) or chrome show/hide (vv resize)
   re-pins, so the game can never sit under Edge's bars or off-fold. */
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

/* ---------------- overlays + flow ---------------- */
function showOnly(id) {
  for (const oid of ['menu', 'howto', 'shop', 'pauseOv', 'overOv']) {
    const o = el(oid); if (o) o.classList.toggle('hidden', oid !== id);
  }
}
function setAdVeil(on) { const v = el('adVeil'); if (v) v.classList.toggle('hidden', !on); }
function updateMute() {
  const btn = el('muteBtn');
  if (btn) btn.textContent = effectiveMuted() ? '🔇' : '🔊';
}
function startRun() {
  resetRun();
  state = 'playing';
  showOnly(null);
  CG.gameplayStart();
  refreshTut(); refreshCards(); updateHud();
  toast('First wave in 14s — place a Grill and a Candle to get cooking!');
}
function gameOver(lane) {
  state = 'over';
  if (score > save.bestScore) save.bestScore = Math.floor(score);
  if (wave > save.bestWave) save.bestWave = wave;
  persist();
  CG.gameplayStop();
  SFX.lose();
  showBanner('😱 THE FEAST IS RAIDED!', 'Lane ' + (lane + 1) + ' broke through…');
  CG.midgameAd(() => {
    if (el('overStats')) el('overStats').innerHTML =
      'You held <b>' + wave + '</b> waves and scored <b>' + Math.floor(score) + '</b>.<br>' +
      '🦴 Kills: ' + kills + ' · 🍪 Thieves stopped: ' + thievesStopped + ' · got away: ' + thievesEscaped + '<br>' +
      '🪙 Coins banked this run: <b>' + runCoins + '</b> · Best: ' + save.bestScore + ' pts / wave ' + save.bestWave;
    showOnly('overOv');
    state = 'over';
  });
}
function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused'; CG.gameplayStop(); showOnly('pauseOv');
}
function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing'; showOnly(null); CG.gameplayStart();
}
function openShop(from) {
  shopFrom = from;
  if (state === 'playing') CG.gameplayStop();
  backState = state;
  state = 'shop';
  buildShop(); showOnly('shop');
}
function closeShop() {
  showOnly(shopFrom === 'menu' ? 'menu' : null);
  state = shopFrom === 'menu' ? 'menu' : 'playing';
  if (state === 'playing') CG.gameplayStart();
  updateHud();
}
function buildShop() {
  const list = el('shopList'); if (!list) return;
  list.innerHTML = '';
  if (el('shopCoins')) el('shopCoins').textContent = '🪙 ' + save.coins;
  const mkRow = (icon, name, desc, pips, btnLabel, disabled, onBuy) => {
    const row = document.createElement('div'); row.className = 'upg';
    const info = document.createElement('div'); info.className = 'info';
    info.innerHTML = '<div class="uname">' + icon + ' ' + name + '</div><div class="udesc">' + desc + '</div>' + (pips ? '<div class="pips">' + pips + '</div>' : '');
    const b = document.createElement('button'); b.textContent = btnLabel; b.disabled = !!disabled;
    b.addEventListener('click', onBuy);
    row.appendChild(info); row.appendChild(b); list.appendChild(row);
  };
  for (const key of Object.keys(UPGRADES)) {
    const u = UPGRADES[key], lvl = save.upg[key], maxed = lvl >= u.costs.length;
    const cost = maxed ? null : u.costs[lvl];
    mkRow(u.icon, u.name, u.desc, '●'.repeat(lvl) + '○'.repeat(u.costs.length - lvl),
      maxed ? 'MAX' : '🪙 ' + cost, maxed || save.coins < cost,
      () => { if (!maxed && save.coins >= cost) { save.coins -= cost; save.upg[key]++; persist(); SFX.coin(); buildShop(); updateHud(); } });
  }
  const sep1 = document.createElement('h3'); sep1.textContent = '👨‍🍳 Head Chef (pick your passive)'; list.appendChild(sep1);
  for (const key of Object.keys(CHEFS)) {
    const cf = CHEFS[key], owned = save.chefsOwned.includes(key), active = save.chef === key;
    mkRow(cf.icon, cf.name, cf.desc, '', active ? 'IN THE KITCHEN' : owned ? 'Select' : '🪙 ' + cf.cost,
      active || (!owned && save.coins < cf.cost),
      () => {
        if (!owned && save.coins >= cf.cost) { save.coins -= cf.cost; save.chefsOwned.push(key); }
        if (owned || save.coins >= 0) { save.chef = key; persist(); SFX.coin(); buildShop(); updateHud(); }
      });
  }
  const sep2 = document.createElement('h3'); sep2.textContent = '🧺 Blanket Themes'; list.appendChild(sep2);
  for (const key of Object.keys(THEMES)) {
    const th = THEMES[key], owned = save.themesOwned.includes(key), active = save.theme === key;
    mkRow('🎨', th.name, 'Pure style. The ants judge silently.', '', active ? 'ON THE GRASS' : owned ? 'Select' : '🪙 ' + th.cost,
      active || (!owned && save.coins < th.cost),
      () => {
        if (!owned && save.coins >= th.cost) { save.coins -= th.cost; save.themesOwned.push(key); }
        save.theme = key; persist(); SFX.coin(); buildShop();
      });
  }
}

/* ---------------- input ---------------- */
let hoverCell = null;
function canvasPos(evt) {
  const rect = canvas.getBoundingClientRect();
  const cx = (evt.touches ? evt.touches[0].clientX : evt.clientX), cy = (evt.touches ? evt.touches[0].clientY : evt.clientY);
  return { x: (cx - rect.left) * (W / rect.width), y: (cy - rect.top) * (H / rect.height) };
}
canvas.addEventListener('pointermove', evt => {
  const p = canvasPos(evt);
  const c = Math.floor((p.x - GRID_X) / CELL_W), r = Math.floor((p.y - GRID_Y) / CELL_H);
  hoverCell = (r >= 0 && r < ROWS && c >= 0 && c < COLS) ? { r, c } : null;
});
canvas.addEventListener('pointerdown', evt => {
  if (state !== 'playing') return;
  ac();
  const p = canvasPos(evt);
  // charcoal lumps first — they're money
  for (const l of lumps) if (Math.abs(l.x - p.x) < 26 && Math.abs(l.y - p.y) < 24) { collectLump(l); return; }
  const c = Math.floor((p.x - GRID_X) / CELL_W), r = Math.floor((p.y - GRID_Y) / CELL_H);
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return;
  if (selected === 'shovel') { shovelAt(r, c); return; }
  if (selected) { placeDefender(r, c); return; }
  if (grid[r][c]) toast(DEFENDERS[grid[r][c].type].name + ' — holding the line.');
});
document.addEventListener('keydown', evt => {
  if (evt.key === 'p' || evt.key === 'P' || evt.key === 'Escape') { if (state === 'playing') pauseGame(); else if (state === 'paused') resumeGame(); }
  if (evt.key === 'm' || evt.key === 'M') { save.muted = !save.muted; persist(); updateMute(); }
  const numKeys = { 1: 'candle', 2: 'grill', 3: 'swatter', 4: 'hose', 5: 'basket' };
  if (numKeys[evt.key]) selectCard(numKeys[evt.key]);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') { state = 'paused'; showOnly('pauseOv'); }  // silent auto-pause
});

/* ---------------- boot + main loop ---------------- */
function wireUi() {
  el('playBtn').addEventListener('click', () => { SFX.click(); startRun(); });
  el('howBtn').addEventListener('click', () => { backState = state; state = 'howto'; showOnly('howto'); });
  el('howClose').addEventListener('click', () => { state = 'menu'; showOnly('menu'); });
  el('shopBtnMenu').addEventListener('click', () => openShop('menu'));
  el('shopBtn').addEventListener('click', () => { if (state === 'playing' || state === 'paused') openShop('game'); });
  el('shopClose').addEventListener('click', closeShop);
  el('pauseBtn').addEventListener('click', () => { if (state === 'playing') pauseGame(); else if (state === 'paused') resumeGame(); });
  el('resumeBtn').addEventListener('click', resumeGame);
  el('quitBtn').addEventListener('click', () => { state = 'menu'; showOnly('menu'); refreshMenu(); });
  el('againBtn').addEventListener('click', () => { SFX.click(); startRun(); });
  el('overMenuBtn').addEventListener('click', () => { state = 'menu'; showOnly('menu'); refreshMenu(); });
  el('muteBtn').addEventListener('click', () => { save.muted = !save.muted; persist(); updateMute(); });
  el('nextWaveBtn').addEventListener('click', () => {
    if (state === 'playing' && phase === 'build') { addCharcoal(25); toast('+25 charcoal — wave called early!'); startWave(wave + 1); }
  });
  el('tutX').addEventListener('click', () => tutFinish());
}
function refreshMenu() {
  if (el('menuStats')) el('menuStats').textContent =
    '🏆 Best: ' + save.bestScore + ' pts · 🌊 Wave ' + save.bestWave + ' · 🪙 ' + save.coins + ' coins · Chef: ' + CHEFS[save.chef].name;
  const pb = el('playBtn');
  if (pb) pb.textContent = save.runs > 0 ? '🔥 Fire Up the Grill' : '🔥 Start the Cookout';
}
let lastTs = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
  lastTs = ts;
  if (state === 'playing' && !adActive) { update(dt); refreshCards(); }
  if (state === 'playing' || state === 'paused' || state === 'over' || state === 'shop') render();
  updateHud();
}
async function boot() {
  CG.loadingStart();
  buildSprites();
  buildCards();
  pinWrap();
  wireUi();
  refreshMenu(); updateMute(); updateHud(); refreshTut();
  showOnly('menu');
  await CG.init();
  CG.loadingStop();
  requestAnimationFrame(loop);
}
boot();

/* ---------------- debug/testing handle ---------------- */
window.__avb = {
  get state() { return state; },
  get save() { return save; },
  get wave() { return wave; },
  get phase() { return phase; },
  get charcoal() { return charcoal; },
  get score() { return score; },
  get ants() { return ants; },
  get lumps() { return lumps; },
  get zappers() { return zappers; },
  startRun, startWave, spawnAnt, placeDefender, selectCard, collectLump, damageAnt,
  setCharcoal(n) { charcoal = n; },
  setCoins(n) { save.coins = n; persist(); },
  tutStep: () => save.tutStep,
  tutDone: () => save.tutDone,
  gridAt: (r, c) => grid[r][c],
  fitStage,
  pinWrap,
  vvBox,
  stageW: () => lastFitW,
  CG
};
