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
function antBody(g, w, h, body, belly, accent) {
  const cy = h / 2;
  g.fillStyle = body;
  g.beginPath(); g.ellipse(w * 0.70, cy, w * 0.26, h * 0.30, 0, 0, 7); g.fill();   // abdomen
  g.beginPath(); g.ellipse(w * 0.44, cy, w * 0.16, h * 0.22, 0, 0, 7); g.fill();   // thorax
  g.beginPath(); g.ellipse(w * 0.22, cy, w * 0.13, h * 0.20, 0, 0, 7); g.fill();   // head
  g.fillStyle = belly;
  g.beginPath(); g.ellipse(w * 0.70, cy + h * 0.08, w * 0.18, h * 0.16, 0, 0, 7); g.fill();
  g.strokeStyle = body; g.lineWidth = Math.max(2, h * 0.045); g.lineCap = 'round';
  g.beginPath(); g.moveTo(w * 0.26, cy - h * 0.14); g.quadraticCurveTo(w * 0.16, cy - h * 0.44, w * 0.04, cy - h * 0.40); g.stroke();
  g.beginPath(); g.moveTo(w * 0.30, cy - h * 0.12); g.quadraticCurveTo(w * 0.26, cy - h * 0.42, w * 0.16, cy - h * 0.46); g.stroke();
  g.fillStyle = accent || '#fff';
  g.beginPath(); g.arc(w * 0.18, cy - h * 0.06, Math.max(1.6, h * 0.05), 0, 7); g.fill();
}
const SPR = {};
function buildSprites() {
  SPR.basic = makeSprite(64, 48, (g, w, h) => antBody(g, w, h, '#4a3220', '#6b4a2c'));
  SPR.fire = makeSprite(64, 48, (g, w, h) => { antBody(g, w, h, '#a82c12', '#d9542b', '#ffd94d'); g.fillStyle = '#ff8a3d'; g.beginPath(); g.ellipse(w * 0.7, h * 0.28, 7, 4, 0, 0, 7); g.fill(); });
  SPR.carpenter = makeSprite(84, 60, (g, w, h) => antBody(g, w, h, '#2b1c10', '#453017'));
  SPR.roach = makeSprite(76, 52, (g, w, h) => { antBody(g, w, h, '#5d3a1a', '#7d5226', '#ffe9a8'); g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.ellipse(w * 0.68, h * 0.34, w * 0.2, h * 0.1, -0.4, 0, 7); g.fill(); });
  SPR.queen = makeSprite(150, 110, (g, w, h) => {
    antBody(g, w, h, '#6d1f4d', '#93406e', '#ffe9a8');
    g.fillStyle = '#ffd94d';  // crown
    g.beginPath();
    g.moveTo(w * 0.10, h * 0.26); g.lineTo(w * 0.14, h * 0.08); g.lineTo(w * 0.20, h * 0.22);
    g.lineTo(w * 0.26, h * 0.06); g.lineTo(w * 0.32, h * 0.24); g.lineTo(w * 0.33, h * 0.32); g.lineTo(w * 0.11, h * 0.32);
    g.closePath(); g.fill();
  });
  SPR.thief = makeSprite(64, 48, (g, w, h) => {
    antBody(g, w, h, '#3d2c14', '#59431f', '#ffd94d');
    g.fillStyle = '#ffd94d';  // bandit mask stripe
    g.fillRect(w * 0.08, h * 0.36, w * 0.26, h * 0.14);
  });
  SPR.sack = makeSprite(30, 30, (g, w, h) => {   // the crumb sack, drawn on a laden thief
    g.fillStyle = '#e8c96a'; g.beginPath(); g.ellipse(w / 2, h * 0.58, w * 0.36, h * 0.34, 0, 0, 7); g.fill();
    g.fillStyle = '#b8933f'; g.fillRect(w / 2 - 3, 2, 6, 8);
    g.fillStyle = '#8a5a1d'; g.beginPath(); g.arc(w * 0.4, h * 0.55, 3, 0, 7); g.arc(w * 0.6, h * 0.66, 2.4, 0, 7); g.fill();
  });
  SPR.lump = makeSprite(34, 30, (g, w, h) => {
    g.fillStyle = '#241d16'; g.beginPath(); g.ellipse(w / 2, h * 0.62, w * 0.36, h * 0.3, 0, 0, 7); g.fill();
    g.fillStyle = '#3a2e22'; g.beginPath(); g.ellipse(w * 0.38, h * 0.48, w * 0.18, h * 0.16, 0, 0, 7); g.fill();
    g.fillStyle = '#ff7a2f'; g.beginPath(); g.arc(w * 0.58, h * 0.44, 3.4, 0, 7); g.fill();
    g.fillStyle = '#ffb020'; g.beginPath(); g.arc(w * 0.58, h * 0.44, 1.7, 0, 7); g.fill();
  });
}
function drawDefenderArt(g, type, size, tNow) {
  const s = size, cx = s / 2, base = s * 0.86;
  g.save(); g.translate(cx, base);
  if (type === 'candle') {
    g.fillStyle = '#f3e2b8'; g.fillRect(-s * 0.10, -s * 0.44, s * 0.20, s * 0.44);
    g.fillStyle = '#d9b96a'; g.fillRect(-s * 0.10, -s * 0.44, s * 0.20, s * 0.07);
    const fl = 1 + Math.sin(tNow * 9) * 0.15;
    g.fillStyle = '#ff9a2f'; g.beginPath(); g.ellipse(0, -s * 0.52 * fl, s * 0.055, s * 0.11 * fl, 0, 0, 7); g.fill();
    g.fillStyle = '#ffe94d'; g.beginPath(); g.ellipse(0, -s * 0.50 * fl, s * 0.028, s * 0.06 * fl, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,190,60,.18)'; g.beginPath(); g.arc(0, -s * 0.3, s * 0.34, 0, 7); g.fill();
  } else if (type === 'grill') {
    g.fillStyle = '#22262b'; g.beginPath(); g.ellipse(0, -s * 0.16, s * 0.30, s * 0.17, 0, 0, 7); g.fill();
    g.strokeStyle = '#454c54'; g.lineWidth = s * 0.045;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * s * 0.11, -s * 0.30); g.lineTo(i * s * 0.11, -s * 0.05); g.stroke(); }
    g.fillStyle = '#22262b'; g.fillRect(-s * 0.30, -s * 0.03, s * 0.09, s * 0.05); g.fillRect(s * 0.21, -s * 0.03, s * 0.09, s * 0.05);
    const fl = 1 + Math.sin(tNow * 11 + 1) * 0.2;
    g.fillStyle = '#ff6a1f'; g.beginPath(); g.ellipse(0, -s * 0.20, s * 0.16 * fl, s * 0.07 * fl, 0, 0, 7); g.fill();
    g.fillStyle = '#ffb020'; g.beginPath(); g.ellipse(0, -s * 0.20, s * 0.09 * fl, s * 0.04 * fl, 0, 0, 7); g.fill();
  } else if (type === 'swatter') {
    g.strokeStyle = '#8a5a2b'; g.lineWidth = s * 0.07; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-s * 0.16, 0); g.lineTo(s * 0.05, -s * 0.42); g.stroke();
    g.save(); g.translate(s * 0.13, -s * 0.52); g.rotate(0.5);
    g.fillStyle = '#e2543e'; g.beginPath(); g.ellipse(0, 0, s * 0.20, s * 0.26, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 1.5;
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * s * 0.09, -s * 0.22); g.lineTo(i * s * 0.09, s * 0.22); g.stroke(); }
    g.restore();
  } else if (type === 'hose') {
    g.strokeStyle = '#2e7d4f'; g.lineWidth = s * 0.11; g.lineCap = 'round';
    g.beginPath(); g.arc(-s * 0.05, -s * 0.14, s * 0.20, 0.4, 5.6); g.stroke();
    g.strokeStyle = '#256b42'; g.beginPath(); g.arc(-s * 0.05, -s * 0.14, s * 0.11, 0.4, 5.6); g.stroke();
    g.fillStyle = '#c8ccd2'; g.save(); g.translate(s * 0.17, -s * 0.30); g.rotate(-0.7); g.fillRect(-s * 0.05, -s * 0.10, s * 0.10, s * 0.20); g.restore();
    g.fillStyle = '#9be7ff'; g.beginPath(); g.arc(s * 0.24, -s * 0.38, s * 0.035, 0, 7); g.fill();
  } else if (type === 'basket') {
    g.fillStyle = '#b5813f'; g.beginPath();
    g.moveTo(-s * 0.32, -s * 0.34); g.lineTo(s * 0.32, -s * 0.34); g.lineTo(s * 0.25, 0); g.lineTo(-s * 0.25, 0); g.closePath(); g.fill();
    g.strokeStyle = '#8a5f27'; g.lineWidth = s * 0.035;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-s * 0.30 + i * s * 0.02, -s * 0.26 + i * s * 0.10); g.lineTo(s * 0.30 - i * s * 0.02, -s * 0.26 + i * s * 0.10); g.stroke(); }
    g.fillStyle = '#e2543e'; g.fillRect(-s * 0.34, -s * 0.42, s * 0.68, s * 0.09);
    g.fillStyle = '#f6f0e2'; g.beginPath(); g.ellipse(0, -s * 0.44, s * 0.16, s * 0.05, 0, 0, 7); g.fill();  // plate peeking out
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
  // grass + picnic blanket
  ctx.fillStyle = theme.grass; ctx.fillRect(-12, -12, W + 24, H + 24);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    ctx.fillStyle = (r + c) % 2 ? theme.a : theme.b;
    ctx.fillRect(GRID_X + c * CELL_W, GRID_Y + r * CELL_H, CELL_W, CELL_H);
  }
  ctx.strokeStyle = 'rgba(0,0,0,.14)'; ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) { ctx.beginPath(); ctx.moveTo(GRID_X + c * CELL_W, GRID_Y); ctx.lineTo(GRID_X + c * CELL_W, GRID_Y + ROWS * CELL_H); ctx.stroke(); }
  for (let r = 0; r <= ROWS; r++) { ctx.beginPath(); ctx.moveTo(GRID_X, GRID_Y + r * CELL_H); ctx.lineTo(GRID_R, GRID_Y + r * CELL_H); ctx.stroke(); }
  // the feast (left strip) + house edge
  ctx.fillStyle = theme.path; ctx.fillRect(0, GRID_Y, GRID_X - 8, ROWS * CELL_H);
  const foods = ['🍗', '🌭', '🍔', '🌽', '🍉'];
  ctx.font = '30px serif'; ctx.textAlign = 'center';
  for (let r = 0; r < ROWS; r++) ctx.fillText(foods[r], 88, laneY(r) + 10);
  // zappers
  for (let r = 0; r < ROWS; r++) {
    const y = laneY(r);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(ZAPPER_X, y + 23, 15, 4.5, 0, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(ZAPPER_X, y);
    if (zappers[r]) {
      ctx.fillStyle = '#39424e'; ctx.fillRect(-4, -26, 8, 30);
      ctx.fillStyle = '#9be7ff'; ctx.beginPath(); ctx.arc(0, -30, 7 + Math.sin(timeNow * 6 + r) * 1.2, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(155,231,255,.7)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-6, -18); ctx.lineTo(0, -8); ctx.lineTo(-3, -8); ctx.lineTo(5, 2); ctx.stroke();
    } else {
      ctx.fillStyle = '#23272c'; ctx.fillRect(-4, -18, 8, 22);
      ctx.fillStyle = '#565d66'; ctx.beginPath(); ctx.arc(0, -22, 5, 0, 7); ctx.fill();
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
    }
    if (d.type === 'hose' && d.spraying) {
      ctx.fillStyle = 'rgba(120,200,255,.20)';
      ctx.beginPath();
      ctx.moveTo(ctr.x + 20, ctr.y - 12); ctx.lineTo(ctr.x + CELL_W * 2.6, ctr.y - 34); ctx.lineTo(ctr.x + CELL_W * 2.6, ctr.y + 22); ctx.lineTo(ctr.x + 20, ctr.y + 8);
      ctx.closePath(); ctx.fill();
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
    // legs
    ctx.strokeStyle = a.type === 'fire' ? '#7d1f08' : '#2b1c10'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const lx = a.x - 12 + i * 12, ph = Math.sin(a.walk + i * 1.1) * 7;
      ctx.beginPath(); ctx.moveTo(lx, y + 4); ctx.lineTo(lx + ph, y + spec.r * 0.85); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(lx, y - 4); ctx.lineTo(lx - ph, y - spec.r * 0.6); ctx.stroke();
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
    }
  }
  // fireballs
  for (const p of projectiles) {
    const y = laneY(p.lane) - 12;
    ctx.fillStyle = '#ff6a1f'; ctx.beginPath(); ctx.arc(p.x, y, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd94d'; ctx.beginPath(); ctx.arc(p.x + 2, y, 4, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,106,31,.4)'; ctx.beginPath(); ctx.arc(p.x - 10, y, 5, 0, 7); ctx.fill();
  }
  // zapper bolts
  for (const z of zapFx) {
    ctx.strokeStyle = 'rgba(155,231,255,' + Math.max(0, z.life / 0.3) + ')'; ctx.lineWidth = 3;
    ctx.beginPath(); z.points.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)); ctx.stroke();
  }
  // particles
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
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

/* ---------------- responsive fit ----------------
   The field is a fixed 1000x560 design. Sizing by viewport width alone
   overflowed phone screens (worst in landscape): HUD + card bar + wave
   bar + stage stacked taller than the screen and overflow:hidden
   clipped the rest. fitStage() measures the real chrome heights and
   caps the unified column width (--uW, shared by HUD / card bar /
   wave bar / stage) so the WHOLE column fits the visible viewport —
   letterboxed, never cropped, never scrollable. visualViewport is
   used when available so Android browser chrome showing/hiding
   re-fits instead of clipping the bottom. Desktop (>= ~1030px wide
   with room to spare) resolves to the same 1000px design as before. */
let lastFitW = 0;
function chromeHeight() {
  let h = 40;  // wrap padding (16) + flex gaps (18) + fudge
  for (const id of ['hud', 'cardbar', 'waveBar', 'rotateHint']) {
    const e = el(id);
    if (e && !e.classList.contains('hidden')) h += (e.offsetHeight || 0);
  }
  return h;
}
function fitStage() {
  const vv = window.visualViewport;
  const vw = (vv && vv.width) || window.innerWidth || 1000;
  const vh = (vv && vv.height) || window.innerHeight || 800;
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
window.addEventListener('resize', fitStage);
window.addEventListener('load', fitStage);
window.addEventListener('orientationchange', () => setTimeout(fitStage, 60));
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitStage);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitStage);

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
  fitStage();
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
  stageW: () => lastFitW,
  CG
};
