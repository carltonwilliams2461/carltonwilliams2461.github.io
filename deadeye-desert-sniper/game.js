"use strict";
/* ============================================================
   DEADEYE: DESERT SNIPER — Scope Ops (production build)
   A first-person scope-view sniper game for CrazyGames.
   Lone military sniper overwatching desert contracts: canyon
   outpost, village rooftops, convoy road, oil field. Read the
   wind, hold your breath, drop the priority target first —
   headshots pay double, civilians end the contract.

   Vanilla JS + Canvas, no build step, no dependencies. All art
   is drawn in code (canvas scenes + figures), all sound is
   WebAudio synthesis — no media files. FLAT folder: every path
   is a bare filename (the CrazyGames uploader flattens).
   CrazyGames SDK v3 is integrated through the CG wrapper below
   (same proven pattern as the rest of the C E Williams slate):
   every call feature-detected + try/caught, so the game runs
   identically on a plain static host with no SDK present.
   ============================================================ */

/* ---------------- tiny helpers ---------------- */
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
/* Deterministic seeded RNG (mulberry32) — contract generation and
   wind rolls are reproducible per contract number, which the
   smoke test relies on for the seeded-wind checks. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
  catch (e) { return fallback; }
}
function lsSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
const fmt = n => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/* ---------------- field geometry ---------------- */
const VIEW_W = 1000, VIEW_H = 562;         // canvas size
const WORLD_W = 2400, WORLD_H = 700;       // ground-layer world (world units)
const ZOOMS = [1, 2, 4, 6, 8];

/* ---------------- scenes ----------------
   Each scene: palette + prop list (drawn in ground space) + spawn
   slots. A slot is where a figure can operate: ground line y,
   patrol range, distance scale, and optional cover height (the
   world-y of the cover top — body shots below it hit the cover). */
const SCENES = {
  canyon: {
    name: 'Canyon Outpost',
    sky: ['#f7c873', '#e8903f'], horizon: '#c96f2e',
    ridgeFar: '#b45a28', ridgeMid: '#8f421e', ground: '#a8642f', groundDark: '#8a4f24',
    props: [
      { t: 'tower', x: 330, y: 470 }, { t: 'tent', x: 620, y: 520 }, { t: 'crates', x: 900, y: 545 },
      { t: 'truck', x: 1250, y: 540 }, { t: 'crates', x: 1560, y: 548 }, { t: 'tent', x: 1830, y: 522 },
      { t: 'barrel', x: 1080, y: 555 }, { t: 'barrel', x: 2050, y: 552 }, { t: 'sign', x: 90, y: 520 }
    ],
    slots: [
      { x: 300, y: 470, range: 120, dist: 0.78, coverTop: 428 },
      { x: 640, y: 545, range: 160, dist: 1.0 },
      { x: 905, y: 560, range: 90, dist: 1.05, coverTop: 512 },
      { x: 1255, y: 562, range: 140, dist: 1.08, coverTop: 506 },
      { x: 1565, y: 566, range: 110, dist: 1.1, coverTop: 518 },
      { x: 1840, y: 548, range: 150, dist: 1.0 },
      { x: 2080, y: 570, range: 130, dist: 1.15 },
      { x: 480, y: 585, range: 200, dist: 1.2 }
    ],
    civPaths: [[150, 600, 700], [1700, 596, 2250]]
  },
  village: {
    name: 'Village Rooftops',
    sky: ['#f9d98c', '#f0a04b'], horizon: '#d98a3d',
    ridgeFar: '#c07a34', ridgeMid: '#9c5c26', ground: '#b07a3e', groundDark: '#8f5f2c',
    props: [
      { t: 'adobe', x: 240, y: 470, w: 300, h: 150 }, { t: 'adobe', x: 700, y: 452, w: 260, h: 168 },
      { t: 'adobe', x: 1150, y: 478, w: 320, h: 142 }, { t: 'adobe', x: 1620, y: 458, w: 280, h: 162 },
      { t: 'adobe', x: 2050, y: 472, w: 300, h: 148 }, { t: 'crates', x: 1010, y: 580 },
      { t: 'barrel', x: 560, y: 590 }, { t: 'barrel', x: 1930, y: 592 }
    ],
    slots: [
      { x: 330, y: 470, range: 90, dist: 0.95, roof: true, coverTop: 452 },
      { x: 790, y: 452, range: 80, dist: 0.92, roof: true, coverTop: 434 },
      { x: 1300, y: 478, range: 100, dist: 0.98, roof: true, coverTop: 458 },
      { x: 1720, y: 458, range: 85, dist: 0.94, roof: true, coverTop: 440 },
      { x: 2140, y: 472, range: 90, dist: 0.96, roof: true, coverTop: 454 },
      { x: 1015, y: 596, range: 80, dist: 1.12, coverTop: 548 },
      { x: 565, y: 604, range: 120, dist: 1.18 },
      { x: 1900, y: 606, range: 130, dist: 1.2 }
    ],
    civPaths: [[120, 622, 900], [1300, 620, 2280]]
  },
  convoy: {
    name: 'Convoy Road',
    sky: ['#f6bd63', '#e07f30'], horizon: '#c26124',
    ridgeFar: '#a34e22', ridgeMid: '#7e3a18', ground: '#9c5a28', groundDark: '#7c4420',
    props: [
      { t: 'truck', x: 420, y: 520 }, { t: 'truck', x: 1080, y: 528 }, { t: 'truck', x: 1760, y: 518 },
      { t: 'wreck', x: 760, y: 545 }, { t: 'rocks', x: 1420, y: 548 }, { t: 'rocks', x: 2080, y: 550 },
      { t: 'sign', x: 90, y: 512 }, { t: 'barrel', x: 590, y: 556 }, { t: 'barrel', x: 1600, y: 558 }
    ],
    slots: [
      { x: 425, y: 540, range: 70, dist: 1.02, coverTop: 484 },
      { x: 765, y: 560, range: 60, dist: 1.06, coverTop: 512 },
      { x: 1085, y: 548, range: 75, dist: 1.04, coverTop: 492 },
      { x: 1425, y: 564, range: 65, dist: 1.08, coverTop: 518 },
      { x: 1765, y: 538, range: 70, dist: 1.0, coverTop: 482 },
      { x: 2085, y: 566, range: 70, dist: 1.1, coverTop: 520 },
      { x: 250, y: 600, range: 170, dist: 1.18 },
      { x: 1980, y: 602, range: 180, dist: 1.2 }
    ],
    civPaths: [[200, 618, 1000], [1400, 616, 2300]]
  },
  oilfield: {
    name: 'Oil Field',
    sky: ['#f2b45e', '#d9772f'], horizon: '#b85a20',
    ridgeFar: '#96431c', ridgeMid: '#74320f', ground: '#8f4f22', groundDark: '#6f3a18',
    props: [
      { t: 'pumpjack', x: 380, y: 540 }, { t: 'tank', x: 760, y: 520 }, { t: 'pipes', x: 1150, y: 555 },
      { t: 'pumpjack', x: 1520, y: 545 }, { t: 'tank', x: 1900, y: 522 }, { t: 'crates', x: 2150, y: 560 },
      { t: 'barrel', x: 980, y: 566 }, { t: 'barrel', x: 560, y: 568 }
    ],
    slots: [
      { x: 385, y: 556, range: 80, dist: 1.05, coverTop: 500 },
      { x: 765, y: 540, range: 90, dist: 1.0, coverTop: 470 },
      { x: 1155, y: 572, range: 85, dist: 1.1, coverTop: 528 },
      { x: 1525, y: 560, range: 80, dist: 1.06, coverTop: 504 },
      { x: 1905, y: 542, range: 90, dist: 1.02, coverTop: 472 },
      { x: 2155, y: 574, range: 75, dist: 1.12, coverTop: 526 },
      { x: 560, y: 600, range: 150, dist: 1.18 },
      { x: 1300, y: 604, range: 170, dist: 1.2 }
    ],
    civPaths: [[150, 622, 800], [1600, 620, 2300]]
  }
};
const SCENE_ORDER = ['canyon', 'village', 'convoy', 'oilfield'];

/* ---------------- contracts ----------------
   Authored set 1–8, then the endless ladder (9+) is procedural.
   tgt = mercenaries, pri = priority target present, civ = civilians,
   shooters / counters = hostiles who return fire, wind = max |wind|,
   par = par seconds for the time bonus, move = patrol speed factor. */
const CONTRACTS = [
  { scene: 'canyon',   name: 'First Blood',    tgt: 3, pri: false, civ: 0, shooters: 0, counters: 0, wind: 2, par: 75,  move: 0.8 },
  { scene: 'canyon',   name: 'Dust Line',      tgt: 4, pri: false, civ: 1, shooters: 0, counters: 0, wind: 4, par: 90,  move: 0.9 },
  { scene: 'village',  name: 'Rooftop Social', tgt: 4, pri: true,  civ: 2, shooters: 0, counters: 0, wind: 4, par: 95,  move: 0.9 },
  { scene: 'village',  name: 'High Noon',      tgt: 5, pri: false, civ: 1, shooters: 1, counters: 0, wind: 6, par: 105, move: 1.0 },
  { scene: 'convoy',   name: 'Ambush Alley',   tgt: 5, pri: true,  civ: 2, shooters: 1, counters: 0, wind: 6, par: 110, move: 1.05 },
  { scene: 'convoy',   name: 'Hot Freight',    tgt: 6, pri: false, civ: 1, shooters: 2, counters: 0, wind: 7, par: 120, move: 1.1 },
  { scene: 'oilfield', name: 'Black Gold',     tgt: 6, pri: true,  civ: 2, shooters: 2, counters: 0, wind: 8, par: 125, move: 1.15 },
  { scene: 'oilfield', name: 'Counter-Snipe',  tgt: 5, pri: false, civ: 1, shooters: 1, counters: 1, wind: 8, par: 130, move: 1.15 }
];
function ladderSpec(n) {
  const rng = mulberry32(n * 7919 + 13);
  const scene = SCENE_ORDER[Math.floor(rng() * 4)];
  const k = n - 8; // ladder depth
  return {
    scene,
    name: 'Ladder Contract ' + n,
    tgt: Math.min(5 + Math.ceil(k * 0.8), 10),
    pri: rng() < 0.6,
    civ: 1 + Math.floor(rng() * 2),
    shooters: Math.min(1 + Math.floor(k / 2), 4),
    counters: Math.min(Math.floor((k + 1) / 2), 3),
    wind: Math.min(6 + k, 12),
    par: Math.max(70, 130 - k * 4),
    move: Math.min(1.15 + k * 0.05, 1.7)
  };
}
function contractSpec(n) {
  return n <= CONTRACTS.length ? Object.assign({ n }, CONTRACTS[n - 1]) : Object.assign({ n }, ladderSpec(n));
}

/* ---------------- armory ---------------- */
const UPGRADES = {
  stability: { name: '🎯 Stability Rig', max: 5, costs: [40, 90, 160, 260, 400], desc: '−14% scope sway per level. The rifle stops arguing with you.' },
  zoom:      { name: '🔭 Long Glass',    max: 2, costs: [120, 300],              desc: 'Unlocks higher max zoom: 6×, then 8×. Faces get names.' },
  reload:    { name: '⚡ Fast Hands',    max: 5, costs: [35, 80, 140, 220, 340], desc: '−12% bolt + reload time per level. Chamber the next one sooner.' },
  breath:    { name: '🫁 Lung Training', max: 5, costs: [35, 80, 140, 220, 340], desc: '+25% breath capacity per level, faster recovery too.' }
};
const SKINS = [
  { id: 'standard', name: 'Standard Issue', cost: 0,   ring: '#2c2113', tint: null,               desc: 'The rifle they handed you. It has never lied.' },
  { id: 'sand',     name: 'Sandstorm',      cost: 150, ring: '#c8a24a', tint: 'rgba(255,190,90,0.06)', desc: 'Desert tan wrap. Blends with everything out here.' },
  { id: 'night',    name: 'Night Ops',      cost: 260, ring: '#101408', tint: 'rgba(90,255,140,0.07)',  desc: 'Blacked-out hardware, ghost-green glass.' },
  { id: 'gold',     name: 'Gold Standard',  cost: 500, ring: '#ffd76a', tint: 'rgba(255,215,106,0.05)', desc: 'You are not hiding. You are advertising.' }
];
const RETICLES = [
  { id: 'mildot',  name: 'Mil-Dot',     cost: 0,   desc: 'The classic. Dots for days.' },
  { id: 'crossx',  name: 'Crosshair X', cost: 180, desc: 'Diagonal X wires with a center dot.' },
  { id: 'chevron', name: 'Chevron',     cost: 320, desc: 'A chevron point with a drop post. Fast eyes love it.' }
];

/* ---------------- persistent progression ---------------- */
const SAVE_KEY = 'deadeyeSaveV1';
function defaultSave() {
  return {
    coins: 0, unlocked: 1,               // next contract number to play
    upg: { stability: 0, zoom: 0, reload: 0, breath: 0 },
    skinsOwned: ['standard'], skin: 'standard',
    retOwned: ['mildot'], reticle: 'mildot',
    best: {},                            // scene -> best contract score
    stats: { kills: 0, headshots: 0, shots: 0, contracts: 0, civFails: 0 },
    muted: false, tutDone: false, tutStep: 0
  };
}
let save = defaultSave();
try {
  const raw = JSON.parse(lsGet(SAVE_KEY, 'null'));
  if (raw && typeof raw === 'object') {
    const d = defaultSave();
    save.coins = Math.max(0, raw.coins | 0);
    save.unlocked = clamp(raw.unlocked | 0 || 1, 1, 9999);
    for (const k of Object.keys(d.upg)) save.upg[k] = clamp((raw.upg && raw.upg[k]) | 0, 0, UPGRADES[k].max);
    if (Array.isArray(raw.skinsOwned)) save.skinsOwned = raw.skinsOwned.filter(id => SKINS.some(s => s.id === id));
    if (!save.skinsOwned.includes('standard')) save.skinsOwned.unshift('standard');
    if (SKINS.some(s => s.id === raw.skin) && save.skinsOwned.includes(raw.skin)) save.skin = raw.skin;
    if (Array.isArray(raw.retOwned)) save.retOwned = raw.retOwned.filter(id => RETICLES.some(r => r.id === id));
    if (!save.retOwned.includes('mildot')) save.retOwned.unshift('mildot');
    if (RETICLES.some(r => r.id === raw.reticle) && save.retOwned.includes(raw.reticle)) save.reticle = raw.reticle;
    if (raw.best && typeof raw.best === 'object') for (const k of SCENE_ORDER) save.best[k] = Math.max(0, raw.best[k] | 0);
    if (raw.stats) for (const k of Object.keys(d.stats)) save.stats[k] = Math.max(0, raw.stats[k] | 0);
    save.muted = !!raw.muted;
    save.tutDone = !!raw.tutDone;
    save.tutStep = clamp(raw.tutStep | 0, 0, 4);
  }
} catch (e) { /* corrupted save -> defaults */ }
if (save.stats.contracts > 0) save.tutDone = true;   // veterans skip the school
function persist() { lsSet(SAVE_KEY, JSON.stringify(save)); }

/* ---------------- derived stats ---------------- */
const swayMul = () => Math.pow(0.86, save.upg.stability);
const maxZoom = () => ZOOMS[2 + save.upg.zoom];                 // 4x base, 6x, 8x
const boltTime = () => 0.95 * Math.pow(0.88, save.upg.reload);
const reloadTime = () => 2.3 * Math.pow(0.88, save.upg.reload);
const breathMax = () => 3.2 * (1 + 0.25 * save.upg.breath);     // seconds of held breath
const breathRegen = () => 0.55 * (1 + 0.15 * save.upg.breath);  // fraction / sec
const skinDef = () => SKINS.find(s => s.id === save.skin) || SKINS[0];

/* ---------------- CrazyGames SDK v3 wrapper ----------------
   Same proven pattern as the rest of the slate (docs.crazygames.com/sdk):
   init() resolves before any other call; loading/gameplay calls bracket
   activity; midgame ads ONLY at natural breaks (contract complete /
   failed screens) with mute + veil callbacks and a 3-minute client
   throttle mirroring the server cooldown; the portal's
   game.settings.muteAudio outranks the in-game toggle. Every call is
   feature-detected + try/caught — off-portal the SDK reports
   environment 'disabled' and throws, so we treat it as absent. */
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
  /* Midgame ad at a natural break. done() fires exactly once,
     immediately when no ad can or should be shown. */
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
let audioCtx = null, masterGain = null;
function ensureAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = effectiveMuted() ? 0 : 0.9;
      masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return true;
  } catch (e) { return false; }
}
function effectiveMuted() { return save.muted || CG.sdkMuted() || adActive; }
function updateMute() { if (masterGain && audioCtx) masterGain.gain.setTargetAtTime(effectiveMuted() ? 0 : 0.9, audioCtx.currentTime, 0.02); }
function tone(freq, dur, type, vol, slideTo, delay) {
  if (!ensureAudio()) return;
  const t0 = audioCtx.currentTime + (delay || 0);
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(vol || 0.2, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(masterGain); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noiseBurst(dur, vol, freq, delay, q) {
  if (!ensureAudio()) return;
  const t0 = audioCtx.currentTime + (delay || 0);
  const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const f = audioCtx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 900; f.Q.value = q || 0.7;
  const g = audioCtx.createGain(); g.gain.value = vol || 0.4;
  src.connect(f); f.connect(g); g.connect(masterGain); src.start(t0);
}
const SFX = {
  shot()    { noiseBurst(0.28, 0.85, 500, 0, 0.4); tone(120, 0.22, 'triangle', 0.5, 40); noiseBurst(0.5, 0.16, 300, 0.22, 0.5); }, // crack + body + desert echo
  dry()     { tone(1400, 0.05, 'square', 0.12); },
  bolt()    { noiseBurst(0.06, 0.25, 1800, 0, 1.2); noiseBurst(0.06, 0.2, 1200, 0.09, 1.2); },
  reload()  { noiseBurst(0.07, 0.3, 900, 0, 1); noiseBurst(0.07, 0.3, 1400, 0.28, 1); noiseBurst(0.08, 0.35, 700, 0.55, 1); },
  hitmark() { tone(2100, 0.06, 'square', 0.14); },
  headshot(){ tone(2600, 0.07, 'square', 0.16); tone(3400, 0.09, 'square', 0.12, null, 0.06); },
  hurt()    { noiseBurst(0.18, 0.5, 240, 0, 0.6); tone(90, 0.25, 'sawtooth', 0.3, 50); },
  crack()   { noiseBurst(0.08, 0.5, 2600, 0, 1.5); },                                   // incoming round snapping past
  glint()   { tone(3200, 0.12, 'sine', 0.07, 3800); },
  radio()   { tone(1250, 0.05, 'square', 0.08); tone(980, 0.06, 'square', 0.08, null, 0.09); tone(1250, 0.05, 'square', 0.08, null, 0.19); },
  fail()    { tone(220, 0.5, 'sawtooth', 0.22, 110); tone(165, 0.6, 'sawtooth', 0.18, 82, 0.15); },
  win()     { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.18, null, i * 0.11)); },
  heart()   { tone(55, 0.1, 'sine', 0.5, 40); tone(50, 0.09, 'sine', 0.35, 38, 0.16); }   // lub-dub at low breath
};

/* ---------------- DOM ---------------- */
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const hud = {
  contract: $('contractVal'), score: $('scoreVal'), coins: $('coinsVal'), targets: $('targetsVal'),
  wind: $('windVal'), hp: $('hpVal'), ammo: $('ammoVal'), zoom: $('zoomLbl'),
  breathBar: $('breathBar'), muteBtn: $('muteBtn')
};
const els = {
  menu: $('menu'), howto: $('howto'), brief: $('brief'), shop: $('shop'),
  summary: $('summary'), failed: $('failed'), pause: $('pauseOv'),
  banner: $('banner'), toast: $('toast'), tutBar: $('tutBar'), tutText: $('tutText'), adVeil: $('adVeil')
};
function showOnly(el) {
  for (const k of ['menu', 'howto', 'brief', 'shop', 'summary', 'failed', 'pause']) els[k].classList.toggle('hidden', els[k] !== el);
}
function setAdVeil(on) { els.adVeil.classList.toggle('hidden', !on); }
let toastTimer = 0;
function toast(msg, ms) {
  els.toast.textContent = msg; els.toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms || 2400);
}
let bannerTimer = 0;
function banner(main, sub, ms) {
  els.banner.innerHTML = main + (sub ? '<div class="sub">' + sub + '</div>' : '');
  els.banner.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => els.banner.classList.remove('show'), ms || 1900);
}

/* ---------------- run state ---------------- */
let state = 'menu';            // menu | brief | playing | paused | summary | failed | shop | howto
let shopReturn = 'menu';
let spec = null;               // current contract spec
let figures = [];              // live figures in the world
let particles = [], tracers = [], splats = [], dust = [], pools = [];
let camX = WORLD_W / 2, camY = 430;
let zoomIdx = 0;               // index into ZOOMS (clamped by maxZoom)
let timeNow = 0;               // seconds, game clock (menu anim uses it too)
let timeScale = 1, slowT = 0;  // bullet-cam slow motion
let wind = 0;                  // current wind (world units/sec of drift at dist 1)
let windSeed = 1;
let score = 0, shotsFired = 0, kills = 0, headshots = 0;
let integrity = 100, cracks = 0;
let ammo = 5, boltT = 0, reloadT = 0, recoil = 0;
let breath = 1, holding = false, breathHeldT = 0, heartT = 0;
let contractT = 0, alerted = false, priorityGone = false, priEscapeT = -1;
let swayT = rand(0, 100);
let pointer = { x: VIEW_W / 2, y: VIEW_H / 2, inside: false, down: false };
let keys = {};
let lastLookX = camX, lookMoved = 0;
let radioCool = 0;

/* ---------------- ballistics (pure, testable) ----------------
   Wind drift: the round leaves the muzzle at the aim point but the
   desert pushes it sideways in flight. Drift grows with target
   distance (dist) and wind strength; sign follows the wind. */
const WIND_K = 2.6;            // world units of drift per wind unit at dist 1
function windDrift(w, dist) { return w * dist * WIND_K; }
function impactPoint(aimX, aimY, w, dist) {
  return { x: aimX + windDrift(w, dist), y: aimY };
}
/* Figure hit geometry. A figure stands on (x, y): height FH world
   units tall (scaled by dist). Head = top circle; body = torso box.
   Crouching behind cover exposes only what pokes above coverTop. */
function figureHeight(f) { return 62 * f.dist * (f.crouch ? 0.68 : 1); }
function headBox(f) {
  const h = figureHeight(f);
  return { cx: f.x, cy: f.y - h * 0.88, r: h * 0.13 };
}
function bodyBox(f) {
  const h = figureHeight(f);
  return { x0: f.x - h * 0.19, x1: f.x + h * 0.19, y0: f.y - h * 0.76, y1: f.y - h * 0.06 };
}
/* Resolve a shot whose bullet lands at world point (ix, iy).
   Returns { result, figure } — result: 'head' | 'body' | 'civilian'
   | 'cover' | 'miss'. Pure against the figures array: no side
   effects, so the smoke test can drive it directly. */
function resolveShot(ix, iy) {
  let best = null;
  for (const f of figures) {
    if (f.dead || f.escaped) continue;
    const hb = headBox(f);
    const dHead = Math.hypot(ix - hb.cx, iy - hb.cy);
    const headExposed = f.coverTop === undefined || hb.cy <= f.coverTop;
    if (dHead <= hb.r && headExposed) { if (!best || f.dist > best.f.dist) best = { f, part: 'head' }; continue; }
    if (dHead <= hb.r && !headExposed) { if (!best) best = { f, part: 'cover' }; continue; }
    const bb = bodyBox(f);
    if (ix >= bb.x0 && ix <= bb.x1 && iy >= bb.y0 && iy <= bb.y1) {
      if (f.coverTop !== undefined && iy > f.coverTop) { if (!best) best = { f, part: 'cover' }; continue; }
      if (!best || f.dist > best.f.dist) best = { f, part: 'body' };
    }
  }
  if (!best) return { result: 'miss', figure: null };
  if (best.part === 'cover') return { result: 'cover', figure: best.f };
  if (best.f.kind === 'civilian') return { result: 'civilian', figure: best.f };
  return { result: best.part, figure: best.f };
}

/* ---------------- contract setup ---------------- */
function spawnFigure(kind, slot, rng) {
  const f = {
    kind, x: slot.x + (rng() - 0.5) * 60, y: slot.y, homeX: slot.x,
    range: slot.range, dist: slot.dist, coverTop: slot.coverTop,
    dir: rng() < 0.5 ? -1 : 1, speed: 0, hp: kind === 'counter' ? 2 : 2,
    state: 'patrol', crouch: false, crouchT: 1 + rng() * 3, moveT: 2 + rng() * 4,
    fireT: 3 + rng() * 4, glintT: 0, walkPhase: rng() * 6.28, dead: false, escaped: false,
    woundT: 0, alertRun: 0, seed: rng()
  };
  if (kind === 'civilian') { f.hp = 1; f.state = 'stroll'; }
  if (kind === 'counter') { f.state = 'nest'; f.crouch = true; }
  return f;
}
function setupContract(n) {
  spec = contractSpec(n);
  const scene = SCENES[spec.scene];
  const rng = mulberry32(n * 31337 + 7);
  figures = []; particles = []; tracers = []; splats = []; pools = [];
  score = 0; shotsFired = 0; kills = 0; headshots = 0;
  integrity = 100; cracks = 0; ammo = 5; boltT = 0; reloadT = 0; recoil = 0;
  breath = 1; holding = false; breathHeldT = 0;
  contractT = 0; alerted = false; priorityGone = false; priEscapeT = -1; priFirstKill = false;
  timeScale = 1; slowT = 0;
  windSeed = n * 1013 + 17;
  rollWind(true);
  // shuffle slots deterministically, then deal out roles
  const slots = scene.slots.slice();
  for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = slots[i]; slots[i] = slots[j]; slots[j] = t; }
  let si = 0;
  const next = () => slots[si++ % slots.length];
  if (spec.pri) figures.push(spawnFigure('priority', next(), rng));
  for (let i = 0; i < spec.tgt; i++) figures.push(spawnFigure('merc', next(), rng));
  for (let i = 0; i < spec.shooters; i++) figures.push(spawnFigure('shooter', next(), rng));
  for (let i = 0; i < spec.counters; i++) figures.push(spawnFigure('counter', next(), rng));
  for (let i = 0; i < spec.civ; i++) {
    const p = scene.civPaths[i % scene.civPaths.length];
    const f = spawnFigure('civilian', { x: p[0], y: p[1], range: Math.abs(p[2] - p[0]) / 2, dist: 1.22 }, rng);
    f.homeX = (p[0] + p[2]) / 2; f.x = p[0] + rng() * Math.abs(p[2] - p[0]);
    figures.push(f);
  }
  camX = WORLD_W / 2; camY = 430; zoomIdx = 0; lastLookX = camX; lookMoved = 0;
  updateHUD();
}
function rollWind(first) {
  const rng = mulberry32(windSeed + Math.floor(contractT * 2) + (first ? 0 : 5000));
  wind = Math.round((rng() * 2 - 1) * (spec ? spec.wind : 4));
}
/* how many hostiles the contract actually fields (for HUD + win check) */
function hostilesTotal() { return figures.filter(f => f.kind !== 'civilian').length; }
function hostilesDown() { return figures.filter(f => f.kind !== 'civilian' && f.dead).length; }
function priorityFigure() { return figures.find(f => f.kind === 'priority') || null; }

/* ---------------- figure behaviour ---------------- */
function alertPack(x) {
  alerted = true;
  for (const f of figures) {
    if (f.dead || f.escaped || f.kind === 'civilian') continue;
    if (Math.abs(f.x - x) < 700) f.alertRun = 1.6;
  }
}
let priFirstKill = false;      // priority dropped before any other hostile (bonus)
function startPriorityEscape() {
  const pri = priorityFigure();
  if (!pri || pri.dead || pri.escaped || priEscapeT >= 0) return;
  priEscapeT = 9;               // seconds before he reaches the treeline
  pri.state = 'escape';
  toast('⚠️ The priority target is bolting!', 2200);
  SFX.radio();
}
function updateFigures(dt) {
  const moveMul = spec ? spec.move : 1;
  for (const f of figures) {
    if (f.dead || f.escaped) continue;
    f.walkPhase += dt * (Math.abs(f.speed) > 1 ? 9 : 2);
    if (f.woundT > 0) f.woundT -= dt;
    const speedMul = (f.alertRun > 0 ? 2.1 : 1) * moveMul;
    if (f.alertRun > 0) f.alertRun -= dt;
    if (f.kind === 'civilian') {
      f.speed = 16 * f.dir;
      f.x += f.speed * dt;
      if (f.x > f.homeX + f.range) f.dir = -1;
      if (f.x < f.homeX - f.range) f.dir = 1;
      continue;
    }
    if (f.state === 'escape') {
      const edge = f.x < WORLD_W / 2 ? -80 : WORLD_W + 80;
      f.dir = edge < f.x ? -1 : 1;
      f.speed = 95 * f.dir;
      f.x += f.speed * dt;
      f.crouch = false;
      continue;
    }
    if (f.kind === 'counter') {
      // counter-sniper: sits in his nest, glints, fires on a cycle
      if (alerted || shotsFired > 0) {
        f.fireT -= dt;
        if (f.fireT < 1.2 && f.fireT > 0 && f.glintT <= 0) { f.glintT = 0.5; SFX.glint(); spawnGlint(f); }
        if (f.glintT > 0) f.glintT -= dt;
        if (f.fireT <= 0) { f.fireT = rand(3.4, 5.2); enemyShot(f, 26, 0.85); }
      }
      continue;
    }
    // patrol brain: walk between the ends of the slot range, pause + crouch
    f.moveT -= dt;
    if (f.state === 'patrol') {
      f.speed = 26 * f.dir * speedMul;
      f.x += f.speed * dt;
      f.crouch = false;
      if (f.x > f.homeX + f.range) { f.dir = -1; f.state = 'idle'; f.moveT = rand(1.2, 3); }
      if (f.x < f.homeX - f.range) { f.dir = 1; f.state = 'idle'; f.moveT = rand(1.2, 3); }
      if (f.moveT <= 0) { f.state = 'idle'; f.moveT = rand(1, 2.6); }
    } else { // idle
      f.speed = 0;
      f.crouch = f.coverTop !== undefined && f.seed > 0.3;
      if (f.moveT <= 0) { f.state = 'patrol'; f.dir = f.x < f.homeX ? 1 : -1; if (Math.random() < 0.4) f.dir *= -1; f.moveT = rand(2.5, 5); }
    }
    // shooters return fire once the shooting has started
    if (f.kind === 'shooter' && shotsFired > 0) {
      f.fireT -= dt;
      if (f.fireT <= 0) { f.fireT = rand(3.8, 6.5) / moveMul; enemyShot(f, 13, 0.45); }
    }
  }
  // priority escape countdown
  if (priEscapeT > 0) {
    priEscapeT -= dt;
    const pri = priorityFigure();
    if (priEscapeT <= 0 && pri && !pri.dead) {
      pri.escaped = true; priorityGone = true;
      failContract('The priority target slipped into the treeline. Command is not pleased.');
    }
  }
}
/* An enemy round comes in: mostly a crack past the scope, sometimes a hit. */
function enemyShot(f, dmg, hitChance) {
  spawnTracerFrom(f);
  if (Math.random() < hitChance * 0.55) {
    integrity = Math.max(0, integrity - dmg);
    cracks = Math.min(3, cracks + 1);
    SFX.hurt(); SFX.crack();
    recoil = Math.min(1, recoil + 0.5);
    toast('⚠️ Taking fire — position integrity ' + integrity + '%', 1600);
    if (integrity <= 0) failContract('Enemy fire found you. The scope goes dark.');
  } else {
    SFX.crack();
  }
  updateHUD();
}

/* ---------------- effects ---------------- */
/* Blood, tuned to READ on a phone screen (Carlton's playtest note):
   a fat droplet burst + a red mist + an instant impact flash at the
   hit point, a stain blooming on the figure, and — on a kill — a
   pool that forms under the body and stays for the whole contract.
   Particles live in world space, so the burst automatically scales
   with the scope: at 8x it fills the glass. Flat-shaded game blood,
   never photoreal. */
function spawnBlood(x, y, big) {
  const n = big ? 22 : 14, mist = big ? 8 : 5;
  for (let i = 0; i < n; i++) {
    const a = rand(-0.5, Math.PI + 0.5), sp = rand(30, big ? 240 : 155);
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: -Math.abs(Math.sin(a)) * sp * 0.65 - rand(10, 60), life: rand(0.35, 0.75), t: 0, r: rand(2.2, big ? 6 : 4.6), col: Math.random() < 0.65 ? '#b01a1e' : '#7d1013' });
  }
  for (let i = 0; i < mist; i++) {
    particles.push({ x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-26, 26), vy: rand(-32, -4), life: rand(0.25, 0.45), t: 0, r: rand(6, big ? 13 : 10), col: 'rgba(164,22,26,0.30)', mist: true });
  }
  particles.push({ x, y, vx: 0, vy: 0, life: 0.13, t: 0, r: big ? 16 : 12, col: '#d21f26', flash: true });
  splats.push({ x, y, r: rand(6, big ? 15 : 10), t: 0, life: 5 });
  if (splats.length > 24) splats.shift();
}
/* A kill leaves a pool: grows to full size over ~a second, then
   persists for the rest of the contract (capped — oldest shift out). */
function spawnPool(f) {
  const h = figureHeight(f);
  pools.push({ x: f.x + rand(-4, 4), y: f.y + 2, r: 0, rT: h * rand(0.40, 0.50), t: 0, grow: rand(0.8, 1.2) });
  if (pools.length > 40) pools.shift();
}
function spawnDustPuff(x, y) {
  // Fine grains, a low tan mist, and a few dark chips: cover impacts should
  // kick up a little geology, not eight identical beige dots.
  for (let i = 0; i < 10; i++) particles.push({ x: x + rand(-6, 6), y: y + rand(-4, 4), vx: rand(-30, 30), vy: rand(-48, -8), life: rand(0.3, 0.72), t: 0, r: rand(1.6, 4.8), col: i % 3 ? 'rgba(218,170,100,0.82)' : 'rgba(164,112,58,0.86)' });
  for (let i = 0; i < 5; i++) particles.push({ x: x + rand(-5, 5), y: y + rand(-3, 3), vx: rand(-18, 18), vy: rand(-26, -5), life: rand(0.42, 0.7), t: 0, r: rand(6, 11), col: 'rgba(202,152,88,0.30)', mist: true });
  for (let i = 0; i < 7; i++) particles.push({ x, y, vx: rand(-72, 72), vy: rand(-92, -18), life: rand(0.28, 0.55), t: 0, r: rand(1.5, 3.4), col: i % 2 ? '#6b4423' : '#3f2812', chunk: true, rot: rand(0, 3), vr: rand(-9, 9) });
}
function spawnGlint(f) {
  particles.push({ x: f.x, y: f.y - figureHeight(f) * 0.9, vx: 0, vy: 0, life: 0.5, t: 0, r: 7, col: '#fff6c8', glint: true });
}
function spawnTracerFrom(f) {
  const hb = headBox(f);
  tracers.push({ x0: hb.cx, y0: hb.cy, x1: camX + rand(-160, 160), y1: camY + rand(-90, 90), t: 0, life: 0.22, enemy: true });
}
function spawnTracerTo(ix, iy) {
  tracers.push({ x0: camX, y0: camY + 330, x1: ix, y1: iy, t: 0, life: 0.3, enemy: false });
}
function updateEffects(dt) {
  for (const p of particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.mist ? 30 : 460) * dt; if (p.chunk) p.rot += p.vr * dt; }
  particles = particles.filter(p => p.t < p.life);
  for (const p of pools) { p.t += dt; const k = Math.min(1, p.t / p.grow); p.r = p.rT * (1 - (1 - k) * (1 - k)); }
  for (const t of tracers) t.t += dt;
  tracers = tracers.filter(t => t.t < t.life);
  for (const s of splats) s.t += dt;
  splats = splats.filter(s => s.t < s.life);
  // ambient dust drifts with the wind — your cheapest wind gauge
  if (Math.random() < dt * 6) {
    dust.push({ x: camX + rand(-700, 700), y: rand(240, 640), t: 0, life: rand(1.5, 3) });
  }
  for (const d of dust) { d.t += dt; d.x += wind * 14 * dt; d.y += 4 * dt; }
  dust = dust.filter(d => d.t < d.life);
  if (dust.length > 60) dust.splice(0, dust.length - 60);
}

/* ---------------- sway + breath ----------------
   The aim never sits still: layered sine sway, amplitude scaled by
   zoom and the stability rig, divided hard while breath is held.
   Pure helper so the smoke test can verify the model. */
function swayAmp() {
  const z = ZOOMS[zoomIdx];
  let amp = (2.2 + z * 1.5) * swayMul();
  if (holding && breath > 0) amp *= 0.18;
  if (breath <= 0) amp *= 1.5;               // lungs empty: hands shake
  return amp;
}
function swayOffset(t) {
  const a = swayAmp();
  return {
    x: (Math.sin(t * 0.9) * 0.6 + Math.sin(t * 2.17 + 1.3) * 0.4) * a,
    y: (Math.cos(t * 1.13 + 0.5) * 0.6 + Math.sin(t * 1.71) * 0.4) * a * 0.8
  };
}
function aimPoint() {
  const s = swayOffset(swayT);
  return { x: camX + s.x, y: camY + s.y - recoil * 26 };
}

/* ---------------- firing ---------------- */
function canFire() { return state === 'playing' && boltT <= 0 && reloadT <= 0 && ammo > 0; }
function fire() {
  if (state !== 'playing') return;
  ensureAudio();
  if (reloadT > 0) return;
  if (boltT > 0) return;
  if (ammo <= 0) { SFX.dry(); startReload(); return; }
  const aim = aimPoint();   // resolve at the pre-shot aim: the round leaves before the kick
  ammo--; shotsFired++; save.stats.shots++;
  boltT = boltTime(); recoil = 1;
  SFX.shot();
  // the bullet meets the target plane at the depth of whatever the
  // crosshair is over: resolve against nearest figure depth first
  const probe = resolveShot(aim.x, aim.y);
  const dist = probe.figure ? probe.figure.dist : 1.05;
  const imp = impactPoint(aim.x, aim.y, wind, dist);
  const res = resolveShot(imp.x, imp.y);
  spawnTracerTo(imp.x, imp.y);
  tutEvent('shot');
  if (res.result === 'head' || res.result === 'body') {
    applyHit(res.figure, res.result, imp);
  } else if (res.result === 'civilian') {
    res.figure.dead = true;
    spawnBlood(imp.x, imp.y, false);
    spawnPool(res.figure);
    save.stats.civFails++;
    failContract('A civilian went down. That round ends careers — contract terminated.');
  } else if (res.result === 'cover') {
    spawnDustPuff(imp.x, imp.y);
    alertPack(imp.x);
  } else {
    spawnDustPuff(imp.x, imp.y);
    alertPack(imp.x);
  }
  if (ammo <= 0) startReload();
  persist();
  updateHUD();
}
function applyHit(f, part, imp) {
  alertPack(imp.x);
  // wound stain: stored in figure units (100 = full height) so it
  // rides the figure at any zoom/crouch and blooms while woundT runs
  const fh = figureHeight(f);
  f.stain = { x: clamp((imp.x - f.x) * 100 / fh, -16, 16), y: clamp(-(f.y - imp.y) * 100 / fh, -97, -42), r: part === 'head' ? 10 : 13 };
  if (part === 'head') {
    f.hp = 0; f.dead = true;
    spawnBlood(imp.x, imp.y, true);
    spawnPool(f);
    SFX.headshot(); lastHitT = timeNow;
    kills++; headshots++; save.stats.kills++; save.stats.headshots++;
    const pts = f.kind === 'priority' ? 400 : 250;
    score += pts;
    banner('💥 HEADSHOT', '+' + pts, 1100);
    slowT = 0.85; timeScale = 0.22;                    // bullet-cam beat
    spawnTracerTo(imp.x, imp.y);
    if (f.kind === 'priority' && kills === 1) { priFirstKill = true; toast('◆ Priority target down — first. Textbook.', 2200); }
    tutEvent('headshot');
  } else {
    f.hp -= 1;
    spawnBlood(imp.x, imp.y, false);
    SFX.hitmark(); lastHitT = timeNow;
    if (f.hp <= 0) {
      f.dead = true;
      spawnPool(f);
      kills++; save.stats.kills++;
      const pts = f.kind === 'priority' ? 200 : 100;
      score += pts;
      banner('Target down', '+' + pts, 900);
      if (f.kind === 'priority' && kills === 1) { priFirstKill = true; toast('◆ Priority target down — first. Textbook.', 2200); }
      tutEvent('kill');
    } else {
      f.woundT = 1.4; f.alertRun = 2;
      toast('Winged him — finish it', 1200);
      score += 25;
      tutEvent('kill');
    }
  }
  if (f.kind !== 'priority' && f.dead) {
    const pri = priorityFigure();
    if (pri && !pri.dead && !pri.escaped) startPriorityEscape();
  }
  checkContractEnd();
}
function startReload() {
  if (reloadT > 0 || ammo === 5) return;
  reloadT = reloadTime();
  SFX.reload();
}
function checkContractEnd() {
  if (state !== 'playing') return;
  const pri = priorityFigure();
  if (pri && pri.escaped) return;                      // fail already fired
  if (hostilesDown() >= hostilesTotal() && hostilesTotal() > 0) completeContract();
}

/* ---------------- contract flow ---------------- */
function completeContract() {
  state = 'summary';
  CG.gameplayStop(); CG.happytime();
  const timeBonus = Math.max(0, Math.round((spec.par - contractT) * 10));
  const accBonus = shotsFired <= hostilesTotal() + 1 ? 150 : 0;
  const priBonus = spec.pri && priFirstKill ? 200 : 0;
  score += timeBonus + accBonus + priBonus;
  const pay = 30 + Math.round(score / 12);
  save.coins += pay;
  save.stats.contracts++;
  if (spec.n >= save.unlocked) save.unlocked = spec.n + 1;
  if (!save.best[spec.scene] || score > save.best[spec.scene]) save.best[spec.scene] = score;
  persist();
  SFX.win(); SFX.radio();
  $('sumTitle').textContent = '✅ Contract ' + spec.n + ' Complete — ' + spec.name;
  $('sumStats').innerHTML =
    'Score <b>' + fmt(score) + '</b> · Kills ' + kills + ' · Headshots ' + headshots + ' · Shots ' + shotsFired + '<br>' +
    (timeBonus ? '⏱ Under par: +' + timeBonus + '<br>' : '') +
    (accBonus ? '🎯 Surgical bonus: +' + accBonus + '<br>' : '') +
    (priBonus ? '◆ Priority-first bonus: +' + priBonus + '<br>' : '') +
    'Contract pay: <b>🪙 ' + pay + '</b> · Best on ' + SCENES[spec.scene].name + ': ' + fmt(save.best[spec.scene]) +
    (spec.n >= 8 ? '<br><span class="small">The ladder never ends. Contracts keep coming, and so do the counter-snipers.</span>' : '');
  showOnly(els.summary);
  updateHUD();
}
function failContract(reason) {
  if (state !== 'playing') return;
  state = 'failed';
  CG.gameplayStop();
  // partial pay for hostiles dropped before the fail — the work was real
  const pay = Math.round(score / 25);
  if (pay > 0) save.coins += pay;
  persist();
  SFX.fail();
  $('failText').innerHTML = reason + (pay > 0 ? '<br><br>Partial pay for targets dropped: <b>🪙 ' + pay + '</b>' : '');
  showOnly(els.failed);
  updateHUD();
}
function showBrief(n) {
  state = 'brief';
  const s = contractSpec(n);
  const scene = SCENES[s.scene];
  $('briefTitle').textContent = 'Contract ' + n + ' — ' + s.name;
  $('briefBody').innerHTML =
    '📍 <b>' + scene.name + '</b><br>' +
    '💀 Hostiles: <b>' + (s.tgt + s.shooters + s.counters + (s.pri ? 1 : 0)) + '</b>' +
    (s.pri ? ' (incl. ◆ priority target)' : '') + '<br>' +
    (s.shooters ? '🔫 ' + s.shooters + ' of them shoot back<br>' : '') +
    (s.counters ? '🎯 ' + s.counters + ' counter-sniper' + (s.counters > 1 ? 's' : '') + ' hunting YOU — watch for the glint<br>' : '') +
    (s.civ ? '🚷 ' + s.civ + ' civilian' + (s.civ > 1 ? 's' : '') + ' in the field — check every shot<br>' : '') +
    '💨 Wind up to ' + s.wind + ' · ⏱ Par ' + s.par + 's<br>' +
    '<span class="small">Headshots pay double. Drop the ◆ first for a 200 bonus — drop anyone else first and he bolts.</span>';
  showOnly(els.brief);
}
function beginContract(n) {
  setupContract(n);
  state = 'playing';
  showOnly(null);
  CG.gameplayStart();
  SFX.radio();
  banner('CONTRACT ' + n, spec.name + ' — ' + SCENES[spec.scene].name, 2000);
  tutSync();
  updateHUD();
}

/* ---------------- per-frame update ---------------- */
function update(dt) {
  timeNow += dt;
  if (state !== 'playing') { updateEffects(dt); return; }
  // slow-mo bullet cam runs on real time, world on scaled time
  if (slowT > 0) { slowT -= dt; if (slowT <= 0) timeScale = 1; }
  const wdt = dt * timeScale;
  contractT += wdt;
  swayT += wdt * (holding && breath > 0 ? 0.55 : 1);
  if (boltT > 0) { boltT -= wdt; if (boltT <= 0 && ammo > 0) SFX.bolt(); }
  if (reloadT > 0) { reloadT -= wdt; if (reloadT <= 0) { ammo = 5; } }
  recoil = Math.max(0, recoil - dt * 3.2);
  // breath
  if (holding && breath > 0) {
    breath = Math.max(0, breath - wdt / breathMax());
    breathHeldT += wdt;
    if (breathHeldT > 0.7) tutEvent('breath');
    if (breath <= 0.25 && breath > 0) { heartT -= dt; if (heartT <= 0) { heartT = 0.85; SFX.heart(); } }
  } else {
    breath = Math.min(1, breath + breathRegen() * wdt);
    breathHeldT = 0;
  }
  // wind shifts gently over the contract
  if (Math.floor(contractT * 2) !== Math.floor((contractT - wdt) * 2)) rollWind(false);
  // camera follows the pointer: crosshair stays centred, world pans
  const rect = canvas.getBoundingClientRect();
  const px = clamp((pointer.x - rect.left) / rect.width, 0, 1);
  const py = clamp((pointer.y - rect.top) / rect.height, 0, 1);
  const targX = clamp(200 + px * (WORLD_W - 400), 0, WORLD_W);
  const targY = clamp(180 + py * (WORLD_H - 260), 120, WORLD_H - 60);
  const lookX0 = camX;
  camX += (targX - camX) * Math.min(1, dt * 7);
  camY += (targY - camY) * Math.min(1, dt * 7);
  lookMoved += Math.abs(camX - lookX0);
  if (lookMoved > 260) tutEvent('look');
  updateFigures(wdt);
  updateEffects(wdt);
  radioCool -= dt;
  updateHUD();
}

/* ---------------- rendering ---------------- */
let lastHitT = -9, groundTex = [];
function proj(wx, wy, f) {
  const aim = aimPoint();
  const z = ZOOMS[zoomIdx];
  const fy = f === 1 ? 1 : 1 - (1 - f) * 0.45;
  return { x: VIEW_W / 2 + (wx - aim.x) * z * f, y: VIEW_H / 2 + (wy - aim.y) * z * fy };
}
function ridgePath(baseY, amp, seed, f, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  const rng = mulberry32(seed);
  const bumps = [];
  for (let i = 0; i <= 12; i++) bumps.push(rng());
  let started = false;
  for (let wx = -300; wx <= WORLD_W + 300; wx += 60) {
    const t = (wx + 300) / (WORLD_W + 600) * 12;
    const i0 = Math.floor(t), fr = t - i0;
    const b = bumps[Math.min(11, i0)] * (1 - fr) + bumps[Math.min(12, i0 + 1)] * fr;
    const p = proj(wx, baseY - b * amp, f);
    if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
  }
  const bl = proj(-300, baseY + 130, f), br = proj(WORLD_W + 300, baseY + 130, f);
  ctx.lineTo(br.x, br.y); ctx.lineTo(bl.x, bl.y);
  ctx.closePath(); ctx.fill();
}
/* --- art-pass helpers (visual only; no simulation state lives here) --- */
function hexRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16 & 255, n >> 8 & 255, n & 255];
}
function rgba(hex, a) { const c = hexRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
function mixHex(h1, h2, t) {
  const a = hexRgb(h1), b = hexRgb(h2);
  return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' + Math.round(a[1] + (b[1] - a[1]) * t) + ',' + Math.round(a[2] + (b[2] - a[2]) * t) + ')';
}
function artNoise(ix, iy) {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function poly(points, fill) {
  if (fill) ctx.fillStyle = fill;
  ctx.beginPath();
  points.forEach((p, i) => { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
  ctx.closePath(); ctx.fill();
}
function ridgeContour(baseY, amp, seed, f, drop, col, width) {
  const rng = mulberry32(seed);
  const bumps = [];
  for (let i = 0; i <= 12; i++) bumps.push(rng());
  ctx.strokeStyle = col; ctx.lineWidth = width;
  ctx.beginPath();
  let started = false;
  for (let wx = -300; wx <= WORLD_W + 300; wx += 60) {
    const t = (wx + 300) / (WORLD_W + 600) * 12;
    const i0 = Math.floor(t), fr = t - i0;
    const b = bumps[Math.min(11, i0)] * (1 - fr) + bumps[Math.min(12, i0 + 1)] * fr;
    const p = proj(wx, baseY - b * amp + drop, f);
    if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}
function contactShadow(wx, wy, w, h, a) {
  const p = proj(wx, wy, 1), z = ZOOMS[zoomIdx];
  ctx.fillStyle = 'rgba(35,17,4,' + a + ')';
  ctx.beginPath(); ctx.ellipse(p.x, p.y, w * z, h * z, 0, 0, 7); ctx.fill();
}
function distantSilhouettes(sceneKey) {
  const z = ZOOMS[zoomIdx];
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = '#6f3418';
  if (sceneKey === 'canyon') {
    for (const m of [[120, 392, 300, 54], [1880, 382, 380, 64]]) {
      const a = proj(m[0], m[1], 0.2), b = proj(m[0] + m[2], m[1] + m[3], 0.2);
      poly([[a.x, a.y], [a.x + 22 * z * 0.2, a.y - 14 * z * 0.2], [b.x - 20 * z * 0.2, a.y - 14 * z * 0.2], [b.x, a.y], [b.x, b.y], [a.x, b.y]], '#6f3418');
    }
  } else if (sceneKey === 'village') {
    for (const bx of [360, 1180, 2020]) {
      const p = proj(bx, 408, 0.2), s = z * 0.2;
      ctx.fillRect(p.x - 62 * s, p.y - 42 * s, 124 * s, 42 * s);
      ctx.beginPath(); ctx.arc(p.x, p.y - 42 * s, 30 * s, Math.PI, 0); ctx.fill();
      ctx.fillRect(p.x - 4 * s, p.y - 104 * s, 8 * s, 34 * s);
      ctx.beginPath(); ctx.arc(p.x, p.y - 104 * s, 10 * s, 0, 7); ctx.fill();
    }
  } else if (sceneKey === 'convoy') {
    ctx.strokeStyle = '#5f2d14'; ctx.lineWidth = Math.max(1, 3 * z * 0.2);
    for (const px of [220, 760, 1320, 1880, 2300]) {
      const p = proj(px, 414, 0.2), s = z * 0.2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 82 * s); ctx.moveTo(p.x - 32 * s, p.y - 68 * s); ctx.lineTo(p.x + 32 * s, p.y - 68 * s); ctx.stroke();
    }
  } else if (sceneKey === 'oilfield') {
    for (const px of [620, 1580, 2240]) {
      const p = proj(px, 414, 0.2), s = z * 0.2;
      ctx.strokeStyle = '#522a12'; ctx.lineWidth = Math.max(1, 5 * s);
      ctx.beginPath(); ctx.moveTo(p.x - 24 * s, p.y); ctx.lineTo(p.x, p.y - 58 * s); ctx.lineTo(p.x + 24 * s, p.y); ctx.moveTo(p.x - 58 * s, p.y - 66 * s); ctx.lineTo(p.x + 58 * s, p.y - 54 * s); ctx.stroke();
    }
  }
  ctx.restore();
}
function drawSkyAndRidges(scene) {
  const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  g.addColorStop(0, mixHex(scene.sky[0], '#fff0bd', 0.10));
  g.addColorStop(0.34, scene.sky[0]);
  g.addColorStop(0.58, scene.sky[1]);
  g.addColorStop(0.72, mixHex(scene.sky[1], scene.horizon, 0.55));
  g.addColorStop(0.79, scene.horizon);
  g.addColorStop(1, scene.horizon);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // High, heat-thinned clouds: broken, soft-edged bands — never ruled lines.
  for (let i = 0; i < 4; i++) {
    const wy = 70 + i * 52, seed = 17 + i * 23;
    const spans = [[-260 + i * 90, 420 + i * 70], [760 + i * 55, 1470 + i * 40], [1810 - i * 35, 2580]];
    for (const span of spans) {
      ctx.beginPath();
      for (let wx = span[0]; wx <= span[1]; wx += 90) {
        const p = proj(wx, wy + Math.sin(wx * 0.004 + seed) * 6, 0.12);
        if (wx === span[0]) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = 'rgba(255,246,214,' + (0.075 - i * 0.009) + ')';
      ctx.lineWidth = 17 - i * 2.2; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath();
      for (let wx = span[0]; wx <= span[1]; wx += 90) {
        const p = proj(wx, wy + 9 + Math.sin(wx * 0.004 + seed) * 6, 0.12);
        if (wx === span[0]) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = 'rgba(190,92,38,0.045)'; ctx.lineWidth = 8; ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }
  const sun = proj(1980, 105, 0.12);
  const sg = ctx.createRadialGradient(sun.x, sun.y, 3, sun.x, sun.y, 150);
  sg.addColorStop(0, 'rgba(255,250,218,0.98)'); sg.addColorStop(0.16, 'rgba(255,226,146,0.62)');
  sg.addColorStop(0.48, 'rgba(255,183,82,0.20)'); sg.addColorStop(1, 'rgba(255,183,82,0)');
  ctx.fillStyle = sg; ctx.fillRect(sun.x - 150, sun.y - 150, 300, 300);
  const core = ctx.createRadialGradient(sun.x - 7, sun.y - 8, 2, sun.x, sun.y, 31);
  core.addColorStop(0, '#fffbe8'); core.addColorStop(0.72, '#ffedb5'); core.addColorStop(1, 'rgba(255,214,120,0.88)');
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(sun.x, sun.y, 30, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,240,190,0.20)'; ctx.fillRect(sun.x - 128, sun.y - 2, 256, 4);
  // Three depth planes instead of two cut-outs, with sedimentary contours.
  ctx.save(); ctx.globalAlpha = 0.48; ridgePath(388, 44, 23, 0.18, scene.ridgeFar); ctx.restore();
  distantSilhouettes(spec ? spec.scene : 'canyon');
  ridgePath(408, 66, 41, 0.3, scene.ridgeFar);
  ridgeContour(408, 66, 41, 0.3, 17, 'rgba(255,218,160,0.13)', 2);
  ridgeContour(408, 66, 41, 0.3, 31, 'rgba(58,24,8,0.14)', 3);
  ridgeContour(408, 66, 41, 0.3, 46, 'rgba(255,190,120,0.08)', 2);
  ridgePath(438, 40, 97, 0.55, scene.ridgeMid);
  ridgeContour(438, 40, 97, 0.55, 13, 'rgba(255,205,140,0.11)', 2);
  ridgeContour(438, 40, 97, 0.55, 26, 'rgba(42,18,5,0.16)', 3);
  // Suspended dust/haze pooling on the horizon.
  const hz = proj(0, 414, 0.55), hz2 = proj(0, 466, 0.55);
  const hg = ctx.createLinearGradient(0, hz.y, 0, hz2.y);
  hg.addColorStop(0, 'rgba(255,220,150,0)'); hg.addColorStop(0.52, 'rgba(255,220,150,0.20)'); hg.addColorStop(1, 'rgba(255,220,150,0)');
  ctx.fillStyle = hg; ctx.fillRect(0, hz.y, VIEW_W, hz2.y - hz.y);
}
function drawGround(scene) {
  const tl = proj(-400, 430, 1), br = proj(WORLD_W + 400, WORLD_H + 40, 1);
  const gg = ctx.createLinearGradient(0, tl.y, 0, br.y);
  gg.addColorStop(0, mixHex(scene.horizon, scene.ground, 0.42));
  gg.addColorStop(0.22, scene.ground);
  gg.addColorStop(0.68, mixHex(scene.ground, scene.groundDark, 0.38));
  gg.addColorStop(1, scene.groundDark);
  ctx.fillStyle = gg; ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

  // Deterministic terrain: broad mineral patches, pebble clusters, cracks,
  // dry scrub and wind ripples. Cell noise is stable, so detail never crawls
  // or flickers between frames; only the heat layer moves.
  const aim = aimPoint(), z = ZOOMS[zoomIdx];
  const halfW = VIEW_W / (2 * z) + 150, halfH = VIEW_H / (2 * z) + 90;
  const x0 = Math.max(-360, Math.floor((aim.x - halfW) / 80) * 80), x1 = Math.min(WORLD_W + 360, aim.x + halfW);
  const y0 = 432, y1 = Math.min(WORLD_H + 50, aim.y + halfH);
  for (let gx = x0; gx < x1; gx += 80) {
    for (let gy = y0; gy < y1; gy += 28) {
      const ix = Math.round(gx / 80), iy = Math.round(gy / 28), n = artNoise(ix, iy);
      const cx = gx + 14 + n * 48, cy = gy + 6 + artNoise(iy, ix) * 17;
      const c = proj(cx, cy, 1);
      if (c.x < -130 || c.x > VIEW_W + 130 || c.y < -30 || c.y > VIEW_H + 30) continue;
      if (n > 0.30) {
        ctx.fillStyle = n > 0.66 ? 'rgba(255,222,158,0.052)' : 'rgba(43,19,5,0.058)';
        ctx.beginPath(); ctx.ellipse(c.x, c.y, (34 + n * 52) * z, (6 + n * 8) * z, 0, 0, 7); ctx.fill();
      }
      // pebble cluster — two lit stones and their shaded mates
      if (n > 0.22) {
        for (let k = 0; k < 4; k++) {
          const px = cx + (artNoise(ix * 3 + k, iy) - 0.5) * 58, py = cy + (artNoise(ix, iy * 5 + k) - 0.5) * 17;
          const p = proj(px, py, 1), r = (1.1 + artNoise(k, ix + iy) * 2.2) * Math.max(0.7, z * 0.55);
          ctx.fillStyle = 'rgba(48,24,8,0.20)'; ctx.beginPath(); ctx.ellipse(p.x + r * 0.25, p.y + r * 0.28, r, r * 0.55, 0, 0, 7); ctx.fill();
          ctx.fillStyle = k % 2 ? 'rgba(226,178,116,0.34)' : 'rgba(112,67,32,0.34)';
          ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.58, 0, 0, 7); ctx.fill();
        }
      }
      // cracked earth in the driest cells
      if (n < 0.20 && z >= 2) {
        ctx.strokeStyle = 'rgba(52,24,8,0.22)'; ctx.lineWidth = Math.max(0.8, 0.55 * z);
        let px = cx, py = cy;
        ctx.beginPath(); ctx.moveTo(proj(px, py, 1).x, proj(px, py, 1).y);
        for (let k = 0; k < 3; k++) { px += (artNoise(ix + k, iy * 7) - 0.35) * 26; py += (artNoise(ix * 11, iy + k) - 0.5) * 8; const p = proj(px, py, 1); ctx.lineTo(p.x, p.y); }
        ctx.stroke();
      }
      // dry scrub: a shaded root crown and individual tapered blades
      if (n > 0.58 && !(spec && spec.scene === 'convoy' && cy > 492 && cy < 610)) {
        const p = proj(cx + 28, cy + 8, 1), s = Math.max(0.65, z * 0.72);
        ctx.fillStyle = 'rgba(45,25,8,0.22)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 10 * s, 2.4 * s, 0, 0, 7); ctx.fill();
        for (let b = -2; b <= 2; b++) {
          const sway = Math.sin(timeNow * 1.4 + ix + b) * 1.2;
          ctx.strokeStyle = b % 2 ? 'rgba(116,105,52,0.58)' : 'rgba(83,76,35,0.62)';
          ctx.lineWidth = Math.max(0.8, 1.15 * s);
          ctx.beginPath(); ctx.moveTo(p.x + b * 2.2 * s, p.y);
          ctx.quadraticCurveTo(p.x + b * 3.4 * s, p.y - 6 * s, p.x + b * 4.4 * s + sway, p.y - (10 + Math.abs(b)) * s); ctx.stroke();
        }
      }
      // wind-polished ripple
      if (n > 0.42) {
        const p = proj(cx - 22, cy + 11, 1);
        ctx.strokeStyle = 'rgba(255,225,165,0.075)'; ctx.lineWidth = Math.max(0.7, 0.7 * z);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + 22 * z, p.y - 2.4 * z, p.x + 48 * z, p.y); ctx.stroke();
      }
    }
  }

  if (spec && spec.scene === 'convoy') {
    const r1 = proj(-400, 496, 1), r2 = proj(WORLD_W + 400, 606, 1);
    ctx.fillStyle = 'rgba(45,24,10,0.30)'; ctx.fillRect(r1.x, r1.y - 7 * z, r2.x - r1.x, r2.y - r1.y + 14 * z);
    const rg = ctx.createLinearGradient(0, r1.y, 0, r2.y);
    rg.addColorStop(0, '#86603a'); rg.addColorStop(0.18, '#75502c'); rg.addColorStop(0.72, '#654325'); rg.addColorStop(1, '#50331c');
    ctx.fillStyle = rg; ctx.fillRect(r1.x, r1.y, r2.x - r1.x, r2.y - r1.y);
    // twin tyre-polished tracks and a dusty, broken centre line
    for (const wy of [524, 578]) {
      ctx.strokeStyle = 'rgba(37,20,9,0.20)'; ctx.lineWidth = 13 * z;
      ctx.beginPath();
      for (let wx = -360; wx <= WORLD_W + 360; wx += 120) { const p = proj(wx, wy + Math.sin(wx * 0.01) * 2, 1); if (wx === -360) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,220,160,0.055)'; ctx.lineWidth = 3 * z; ctx.stroke();
    }
    for (let wx = -300; wx < WORLD_W + 300; wx += 190) {
      const d = proj(wx, 550, 1), broken = artNoise(wx, 55) > 0.78;
      ctx.fillStyle = 'rgba(50,30,13,0.20)'; ctx.fillRect(d.x + 2, d.y + 2 * z, 84 * z, 5 * z);
      ctx.fillStyle = broken ? 'rgba(240,205,145,0.30)' : 'rgba(255,220,150,0.48)';
      ctx.fillRect(d.x, d.y, (broken ? 48 : 84) * z, 5 * z);
    }
    ctx.fillStyle = 'rgba(255,224,166,0.10)'; ctx.fillRect(r1.x, r1.y, r2.x - r1.x, 5 * z); ctx.fillRect(r1.x, r2.y - 5 * z, r2.x - r1.x, 5 * z);
  }
  ctx.fillStyle = scene.groundDark;
  for (const m of groundTex) {
    const p = proj(m.x, m.y, 1);
    if (p.x < -60 || p.x > VIEW_W + 60) continue;
    ctx.fillRect(p.x, p.y, m.len * ZOOMS[zoomIdx], 2.4 * ZOOMS[zoomIdx]);
  }
  // Heat shimmer: paired light/dark waves give the air visible thickness.
  for (let i = 0; i < 5; i++) {
    for (const pass of [[0, 'rgba(255,255,255,0.050)'], [2.2, 'rgba(92,38,10,0.045)']]) {
      ctx.strokeStyle = pass[1]; ctx.lineWidth = i < 2 ? 2.4 : 1.5;
      ctx.beginPath();
      for (let sx = 0; sx <= VIEW_W; sx += 32) {
        const wy = 444 + i * 24 + Math.sin(timeNow * 2.4 + sx * 0.021 + i * 2.1) * (2.5 + i * 0.35);
        const p = proj(camX + (sx - VIEW_W / 2) / z, wy, 1);
        if (sx === 0) ctx.moveTo(sx, p.y + pass[0]); else ctx.lineTo(sx, p.y + pass[0]);
      }
      ctx.stroke();
    }
  }
  // Foreground settles darker, like looking across a near shoulder of dirt.
  const fg = ctx.createLinearGradient(0, VIEW_H * 0.78, 0, VIEW_H);
  fg.addColorStop(0, 'rgba(35,16,4,0)'); fg.addColorStop(1, 'rgba(35,16,4,0.16)');
  ctx.fillStyle = fg; ctx.fillRect(0, VIEW_H * 0.78, VIEW_W, VIEW_H * 0.22);
}
function drawFlag(wx, baseY) {
  const p = proj(wx, baseY, 1), z = ZOOMS[zoomIdx];
  ctx.strokeStyle = '#3a2c18'; ctx.lineWidth = Math.max(1.5, 3 * z);
  ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 74 * z); ctx.stroke();
  const w = wind, len = (16 + Math.abs(w) * 3.4) * z, dir = w < 0 ? -1 : 1;
  const flut = Math.sin(timeNow * 9 + wx) * 3 * z;
  ctx.fillStyle = Math.abs(w) >= 7 ? '#d9402e' : (Math.abs(w) >= 3 ? '#f2a541' : '#e8ddc0');
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - 74 * z);
  ctx.lineTo(p.x + dir * len, p.y - 66 * z + flut);
  ctx.lineTo(p.x, p.y - 56 * z);
  ctx.closePath(); ctx.fill();
}
function localGradient(x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const s of stops) g.addColorStop(s[0], s[1]);
  return g;
}
function fasteners(points, u, col) {
  ctx.fillStyle = col;
  for (const p of points) { ctx.beginPath(); ctx.arc(p[0] * u, p[1] * u, 1.7 * u, 0, 7); ctx.fill(); }
}
function drawProp(pr) {
  const z = ZOOMS[zoomIdx];
  const p = proj(pr.x, pr.y, 1);
  if (p.x < -420 || p.x > VIEW_W + 420) return;
  const u = z; // world unit -> px
  const shadowW = pr.t === 'adobe' ? (pr.w || 280) * 0.54 : (pr.t === 'truck' || pr.t === 'wreck' ? 104 : (pr.t === 'tank' ? 92 : (pr.t === 'pipes' ? 122 : 68)));
  contactShadow(pr.x, pr.y + 4, shadowW, pr.t === 'adobe' ? 10 : 7, pr.t === 'barrel' ? 0.20 : 0.27);
  ctx.save(); ctx.translate(p.x, p.y);
  switch (pr.t) {
    case 'tower': {
      // Twin timber legs, cross-bracing, plank deck and a shaded roof.
      for (const side of [-1, 1]) {
        poly([[(side * 39 - 4) * u, 0], [(side * 25 - 4) * u, -110 * u], [(side * 25 + 4) * u, -110 * u], [(side * 39 + 4) * u, 0]], side < 0 ? '#6d4b28' : '#51351b');
      }
      ctx.strokeStyle = '#4c3319'; ctx.lineWidth = 5.2 * u;
      ctx.beginPath();
      ctx.moveTo(-34 * u, -38 * u); ctx.lineTo(34 * u, -80 * u); ctx.moveTo(34 * u, -38 * u); ctx.lineTo(-34 * u, -80 * u);
      ctx.moveTo(-37 * u, -8 * u); ctx.lineTo(37 * u, -8 * u); ctx.stroke();
      ctx.strokeStyle = 'rgba(238,198,128,0.28)'; ctx.lineWidth = 1.4 * u;
      ctx.beginPath(); ctx.moveTo(-31 * u, -42 * u); ctx.lineTo(31 * u, -82 * u); ctx.stroke();
      ctx.fillStyle = '#3d2812'; ctx.fillRect(-50 * u, -111 * u, 100 * u, 8 * u);
      ctx.fillStyle = localGradient(0, -126 * u, 0, -108 * u, [[0, '#9a773f'], [0.55, '#7d5b2d'], [1, '#5d4225']]);
      ctx.fillRect(-50 * u, -126 * u, 100 * u, 17 * u);
      ctx.strokeStyle = 'rgba(48,30,12,0.5)'; ctx.lineWidth = 1.2 * u;
      for (const lx of [-25, 0, 25]) { ctx.beginPath(); ctx.moveTo(lx * u, -126 * u); ctx.lineTo(lx * u, -109 * u); ctx.stroke(); }
      ctx.fillStyle = '#4c3319'; ctx.beginPath(); ctx.moveTo(-59 * u, -126 * u); ctx.lineTo(0, -156 * u); ctx.lineTo(59 * u, -126 * u); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,215,145,0.13)'; ctx.beginPath(); ctx.moveTo(0, -156 * u); ctx.lineTo(59 * u, -126 * u); ctx.lineTo(18 * u, -126 * u); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a6a3a';
      for (const sx of [-42, 30]) { ctx.beginPath(); ctx.ellipse(sx * u, -2 * u, 15 * u, 5 * u, 0, 0, 7); ctx.fill(); }
      break;
    }
    case 'tent': {
      const tg = localGradient(-72 * u, 0, 72 * u, 0, [[0, '#5f522f'], [0.48, '#96865a'], [0.52, '#7a6a42'], [1, '#554827']]);
      ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(-74 * u, 0); ctx.lineTo(0, -60 * u); ctx.lineTo(74 * u, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,232,170,0.16)'; ctx.beginPath(); ctx.moveTo(0, -60 * u); ctx.lineTo(74 * u, 0); ctx.lineTo(38 * u, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#463b20'; ctx.beginPath(); ctx.moveTo(-16 * u, 0); ctx.lineTo(0, -35 * u); ctx.lineTo(16 * u, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(230,196,124,0.20)'; ctx.fillRect(-2 * u, -35 * u, 4 * u, 35 * u);
      ctx.strokeStyle = 'rgba(52,42,18,0.55)'; ctx.lineWidth = 1.5 * u;
      for (const sx of [-48, -24, 24, 48]) { ctx.beginPath(); ctx.moveTo(sx * u, -Math.abs(sx) * 0.28 * u - 8 * u); ctx.lineTo(sx * 0.55 * u, -58 * u); ctx.stroke(); }
      ctx.strokeStyle = '#40351a'; ctx.lineWidth = 2.4 * u; ctx.beginPath(); ctx.moveTo(0, -60 * u); ctx.lineTo(0, -72 * u); ctx.stroke();
      ctx.strokeStyle = 'rgba(45,35,15,0.65)'; ctx.lineWidth = 1.3 * u;
      ctx.beginPath(); ctx.moveTo(-58 * u, -18 * u); ctx.lineTo(-76 * u, -1 * u); ctx.moveTo(58 * u, -18 * u); ctx.lineTo(76 * u, -1 * u); ctx.stroke();
      ctx.fillStyle = '#3a2c12'; ctx.fillRect(-79 * u, -3 * u, 5 * u, 4 * u); ctx.fillRect(74 * u, -3 * u, 5 * u, 4 * u);
      break;
    }
    case 'crates': {
      const boxes = [[-46, -34, 44, 34], [2, -34, 44, 34], [-22, -66, 44, 32]];
      for (const b of boxes) {
        ctx.fillStyle = 'rgba(42,24,8,0.24)'; ctx.fillRect((b[0] + 3) * u, (b[1] + 3) * u, b[2] * u, b[3] * u);
        ctx.fillStyle = localGradient(0, b[1] * u, 0, (b[1] + b[3]) * u, [[0, '#a67c42'], [0.55, '#8a6a3a'], [1, '#6d4f27']]);
        ctx.fillRect(b[0] * u, b[1] * u, b[2] * u, b[3] * u);
        ctx.strokeStyle = '#50361a'; ctx.lineWidth = 2.2 * u; ctx.strokeRect(b[0] * u, b[1] * u, b[2] * u, b[3] * u);
        ctx.strokeStyle = 'rgba(62,40,16,0.55)'; ctx.lineWidth = 1.4 * u;
        for (const fy of [0.34, 0.68]) { ctx.beginPath(); ctx.moveTo(b[0] * u, (b[1] + b[3] * fy) * u); ctx.lineTo((b[0] + b[2]) * u, (b[1] + b[3] * fy) * u); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(b[0] * u, b[1] * u); ctx.lineTo((b[0] + b[2]) * u, (b[1] + b[3]) * u); ctx.moveTo((b[0] + b[2]) * u, b[1] * u); ctx.lineTo(b[0] * u, (b[1] + b[3]) * u); ctx.stroke();
        ctx.fillStyle = 'rgba(240,205,140,0.20)'; ctx.fillRect((b[0] + 7) * u, (b[1] + 6) * u, 17 * u, 4 * u);
        fasteners([[b[0] + 5, b[1] + 5], [b[0] + b[2] - 5, b[1] + 5], [b[0] + 5, b[1] + b[3] - 5], [b[0] + b[2] - 5, b[1] + b[3] - 5]], u, 'rgba(40,24,8,0.65)');
      }
      break;
    }
    case 'truck': case 'wreck': {
      const wreck = pr.t === 'wreck';
      ctx.rotate(wreck ? -0.07 : 0);
      if (wreck) ctx.translate(0, 3 * u);
      const body = wreck ? ['#5b5042', '#463e33', '#332d25'] : ['#78824a', '#66703c', '#4e5c2c'];
      ctx.fillStyle = localGradient(0, -84 * u, 0, -10 * u, [[0, body[0]], [0.58, body[1]], [1, body[2]]]);
      ctx.fillRect(-90 * u, -82 * u, 120 * u, 64 * u);
      ctx.fillStyle = 'rgba(255,238,180,0.13)'; ctx.fillRect(-90 * u, -82 * u, 120 * u, 6 * u);
      ctx.strokeStyle = 'rgba(28,30,16,0.42)'; ctx.lineWidth = 1.4 * u;
      for (const px of [-62, -34, -6, 22]) { ctx.beginPath(); ctx.moveTo(px * u, -80 * u); ctx.lineTo(px * u, -20 * u); ctx.stroke(); }
      ctx.fillStyle = wreck ? '#38332b' : '#53612e'; ctx.fillRect(30 * u, -64 * u, 54 * u, 46 * u);
      ctx.fillStyle = localGradient(58 * u, -58 * u, 78 * u, -38 * u, [[0, wreck ? '#6f7772' : '#d7edf2'], [0.55, wreck ? '#454b4a' : '#91b6c2'], [1, '#2e4149']]);
      ctx.fillRect(57 * u, -58 * u, 21 * u, 19 * u);
      ctx.strokeStyle = 'rgba(20,22,14,0.55)'; ctx.lineWidth = 1.6 * u; ctx.strokeRect(57 * u, -58 * u, 21 * u, 19 * u);
      ctx.fillStyle = 'rgba(22,24,16,0.55)'; ctx.fillRect(38 * u, -31 * u, 9 * u, 4 * u);
      ctx.fillStyle = '#2b2417'; ctx.fillRect(30 * u, -20 * u, 54 * u, 5 * u); ctx.fillRect(-90 * u, -20 * u, 120 * u, 5 * u);
      for (const wx of [-54, 54]) {
        ctx.fillStyle = '#17130e'; ctx.beginPath(); ctx.arc(wx * u, -13 * u, 14.5 * u, 0, 7); ctx.fill();
        ctx.fillStyle = '#2e2a23'; ctx.beginPath(); ctx.arc(wx * u, -13 * u, 10.5 * u, 0, 7); ctx.fill();
        ctx.fillStyle = '#8d8574'; ctx.beginPath(); ctx.arc(wx * u, -13 * u, 5.2 * u, 0, 7); ctx.fill();
        fasteners([[wx - 3, -16], [wx + 3, -16], [wx - 3, -10], [wx + 3, -10]], u, '#3a352c');
      }
      ctx.fillStyle = wreck ? 'rgba(116,57,24,0.48)' : 'rgba(74,48,20,0.20)';
      for (const r of [[-78, -68, 18, 7], [-18, -36, 24, 9], [42, -48, 16, 6]]) ctx.fillRect(r[0] * u, r[1] * u, r[2] * u, r[3] * u);
      if (wreck) { ctx.strokeStyle = '#211c15'; ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.moveTo(30 * u, -64 * u); ctx.lineTo(48 * u, -46 * u); ctx.lineTo(84 * u, -52 * u); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,224,160,0.10)'; ctx.fillRect(-90 * u, -18 * u, 174 * u, 3 * u);
      break;
    }
    case 'barrel': {
      const bg = localGradient(-13 * u, 0, 13 * u, 0, [[0, '#59351b'], [0.28, '#a06a31'], [0.55, '#7a4a22'], [1, '#472812']]);
      ctx.fillStyle = bg; ctx.fillRect(-13 * u, -40 * u, 26 * u, 40 * u);
      ctx.fillStyle = '#b57d3d'; ctx.beginPath(); ctx.ellipse(0, -40 * u, 13 * u, 4.2 * u, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(66,36,14,0.55)'; ctx.beginPath(); ctx.ellipse(0, -40 * u, 8 * u, 2.4 * u, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#96602e'; ctx.fillRect(-13 * u, -34 * u, 26 * u, 5 * u); ctx.fillRect(-13 * u, -10 * u, 26 * u, 5 * u);
      ctx.fillStyle = 'rgba(130,66,28,0.48)'; ctx.fillRect(5 * u, -29 * u, 3 * u, 16 * u); ctx.fillRect(-8 * u, -22 * u, 2 * u, 10 * u);
      break;
    }
    case 'sign': {
      ctx.fillStyle = localGradient(-3 * u, 0, 3 * u, 0, [[0, '#77572e'], [1, '#443014']]); ctx.fillRect(-3 * u, -72 * u, 6 * u, 72 * u);
      ctx.fillStyle = localGradient(0, -74 * u, 0, -42 * u, [[0, '#c49a3a'], [0.6, '#a8842f'], [1, '#7c5f22']]);
      ctx.fillRect(-39 * u, -74 * u, 78 * u, 30 * u);
      ctx.strokeStyle = '#59451a'; ctx.lineWidth = 2 * u; ctx.strokeRect(-39 * u, -74 * u, 78 * u, 30 * u);
      ctx.fillStyle = '#3a2c18'; ctx.font = `bold ${16 * u}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText('⚠', 0, -51 * u);
      fasteners([[-34, -69], [34, -69], [-34, -49], [34, -49]], u, '#4a3814');
      break;
    }
    case 'adobe': {
      const w = pr.w || 280, h = pr.h || 150;
      ctx.fillStyle = localGradient(-w / 2 * u, 0, w / 2 * u, 0, [[0, '#a9763e'], [0.18, '#d2a364'], [0.72, '#c99a5b'], [1, '#966f38']]);
      ctx.fillRect(-w / 2 * u, -h * u, w * u, h * u);
      // irregular stucco patches and sun-baked tonal variation
      for (let i = 0; i < 7; i++) {
        const px = -w / 2 + ((i * 83) % Math.max(40, w - 50)) + 16, py = -h + 24 + ((i * 47) % Math.max(30, h - 48));
        ctx.fillStyle = i % 2 ? 'rgba(255,224,164,0.075)' : 'rgba(104,62,24,0.075)';
        ctx.beginPath(); ctx.ellipse(px * u, py * u, (22 + i * 4) * u, (9 + i % 3 * 4) * u, 0, 0, 7); ctx.fill();
      }
      ctx.fillStyle = '#e0b26e'; ctx.fillRect(-w / 2 * u, -h * u, w * u, 10 * u);
      ctx.fillStyle = '#7d5527'; ctx.fillRect(-w / 2 * u, (-h + 10) * u, w * u, 5 * u);
      // protruding roof vigas, with tiny end-grain rings and cast shadows
      for (let vx = -w / 2 + 24; vx < w / 2 - 12; vx += 38) {
        ctx.fillStyle = 'rgba(80,46,16,0.28)'; ctx.fillRect(vx * u, (-h + 19) * u, 15 * u, 5 * u);
        ctx.fillStyle = '#6d4722'; ctx.fillRect((vx - 2) * u, (-h + 14) * u, 16 * u, 6 * u);
        ctx.fillStyle = '#9a7440'; ctx.fillRect((vx + 10) * u, (-h + 14) * u, 3 * u, 6 * u);
      }
      ctx.fillStyle = 'rgba(118,72,30,0.20)'; ctx.fillRect(-w / 2 * u, -22 * u, w * u, 22 * u);
      // arched doorway, inset in shadow with a worn lintel
      ctx.fillStyle = '#211407'; ctx.beginPath(); ctx.moveTo(-17 * u, 0); ctx.lineTo(-17 * u, -37 * u); ctx.arc(0, -37 * u, 17 * u, Math.PI, 0); ctx.lineTo(17 * u, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#8a5a28'; ctx.lineWidth = 4 * u; ctx.stroke();
      ctx.fillStyle = 'rgba(255,210,130,0.12)'; ctx.fillRect(-13 * u, -48 * u, 5 * u, 44 * u);
      for (const wx of [-w / 4, w / 4]) {
        ctx.fillStyle = '#2d1c10'; ctx.fillRect((wx - 14) * u, -98 * u, 28 * u, 32 * u);
        ctx.fillStyle = localGradient(0, -98 * u, 0, -66 * u, [[0, '#70502a'], [0.5, '#4c3319'], [1, '#604323']]); ctx.fillRect((wx - 14) * u, -98 * u, 28 * u, 5 * u);
        ctx.strokeStyle = '#3c2812'; ctx.lineWidth = 2 * u;
        for (const fy of [-86, -76]) { ctx.beginPath(); ctx.moveTo((wx - 14) * u, fy * u); ctx.lineTo((wx + 14) * u, fy * u); ctx.stroke(); }
        ctx.fillStyle = 'rgba(190,225,235,0.20)'; ctx.fillRect((wx - 10) * u, -94 * u, 7 * u, 22 * u);
      }
      ctx.strokeStyle = 'rgba(90,52,20,0.28)'; ctx.lineWidth = 1.3 * u;
      ctx.beginPath(); ctx.moveTo((-w / 2 + 28) * u, -42 * u); ctx.lineTo((-w / 2 + 42) * u, -30 * u); ctx.lineTo((-w / 2 + 36) * u, -18 * u); ctx.stroke();
      break;
    }
    case 'rocks': {
      const facets = [
        [[-62, 0], [-36, -45], [-10, -34], [-18, 0], 'rgba(62,48,36,0.22)'],
        [[-36, -45], [0, -31], [18, -54], [30, 0], 'rgba(255,235,190,0.10)'],
        [[-20, 0], [-8, -27], [8, -18], [27, 0], 'rgba(255,235,190,0.08)']
      ];
      ctx.fillStyle = localGradient(-62 * u, -54 * u, 60 * u, 0, [[0, '#9a866b'], [0.5, '#7c6a55'], [1, '#5d4c3b']]);
      ctx.beginPath(); ctx.moveTo(-62 * u, 0); ctx.lineTo(-36 * u, -45 * u); ctx.lineTo(0, -31 * u); ctx.lineTo(18 * u, -54 * u); ctx.lineTo(60 * u, 0); ctx.closePath(); ctx.fill();
      for (const f of facets) poly(f.slice(0, 4).map(p => [p[0] * u, p[1] * u]), f[4]);
      ctx.strokeStyle = 'rgba(45,34,24,0.35)'; ctx.lineWidth = 1.4 * u;
      ctx.beginPath(); ctx.moveTo(-26 * u, -12 * u); ctx.lineTo(-12 * u, -20 * u); ctx.lineTo(4 * u, -14 * u); ctx.moveTo(18 * u, -38 * u); ctx.lineTo(28 * u, -20 * u); ctx.stroke();
      for (const s of [[-48, 3, 9], [44, 3, 12], [66, 2, 7]]) {
        ctx.fillStyle = '#77664f'; ctx.beginPath(); ctx.ellipse(s[0] * u, s[1] * u, s[2] * u, s[2] * 0.48 * u, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,235,190,0.14)'; ctx.beginPath(); ctx.ellipse((s[0] - 2) * u, (s[1] - 1) * u, s[2] * 0.55 * u, s[2] * 0.22 * u, 0, 0, 7); ctx.fill();
      }
      break;
    }
    case 'pumpjack': {
      const ang = Math.sin(timeNow * 0.8 + pr.x) * 0.055;
      for (const side of [-1, 1]) poly([[(side * 34 - 4) * u, 0], [(side * 5 - 4) * u, -80 * u], [(side * 5 + 4) * u, -80 * u], [(side * 34 + 4) * u, 0]], side < 0 ? '#4a443c' : '#332f29');
      ctx.strokeStyle = '#29261f'; ctx.lineWidth = 3.6 * u;
      ctx.beginPath(); ctx.moveTo(-27 * u, -28 * u); ctx.lineTo(27 * u, -28 * u); ctx.moveTo(-17 * u, -54 * u); ctx.lineTo(17 * u, -54 * u); ctx.stroke();
      ctx.fillStyle = localGradient(0, -10 * u, 0, 0, [[0, '#6d6250'], [1, '#3c372e']]); ctx.fillRect(-54 * u, -9 * u, 108 * u, 9 * u);
      ctx.fillStyle = '#55483a'; ctx.fillRect(-28 * u, -30 * u, 34 * u, 22 * u);
      ctx.fillStyle = '#77664a'; ctx.fillRect(-28 * u, -30 * u, 34 * u, 5 * u);
      fasteners([[-22, -24], [0, -24], [-22, -13], [0, -13]], u, '#211d18');
      ctx.save(); ctx.translate(0, -80 * u); ctx.rotate(ang);
      ctx.fillStyle = localGradient(0, -10 * u, 0, 8 * u, [[0, '#8a743f'], [0.55, '#6b5a33'], [1, '#453820']]);
      ctx.fillRect(-86 * u, -9 * u, 172 * u, 15 * u);
      ctx.fillStyle = '#4c4438'; ctx.beginPath(); ctx.arc(86 * u, 2 * u, 16 * u, 0, 7); ctx.fill();
      ctx.fillStyle = '#2e2a24'; ctx.beginPath(); ctx.arc(86 * u, 2 * u, 6 * u, 0, 7); ctx.fill();
      ctx.fillStyle = '#7c6a3a'; ctx.fillRect(-102 * u, -18 * u, 22 * u, 34 * u);
      ctx.fillStyle = 'rgba(255,226,160,0.16)'; ctx.fillRect(-102 * u, -18 * u, 22 * u, 5 * u);
      ctx.restore();
      ctx.strokeStyle = '#211e1a'; ctx.lineWidth = 3.6 * u;
      ctx.beginPath(); ctx.moveTo(70 * u, -72 * u + Math.sin(timeNow * 0.8 + pr.x) * 6 * u); ctx.lineTo(70 * u, 0); ctx.stroke();
      ctx.strokeStyle = 'rgba(230,220,190,0.20)'; ctx.lineWidth = 1.1 * u;
      ctx.beginPath(); ctx.moveTo(68.5 * u, -70 * u + Math.sin(timeNow * 0.8 + pr.x) * 6 * u); ctx.lineTo(68.5 * u, -4 * u); ctx.stroke();
      break;
    }
    case 'tank': {
      const tg = localGradient(-78 * u, 0, 78 * u, 0, [[0, '#675a42'], [0.24, '#b09a6e'], [0.55, '#8a7a5c'], [0.82, '#77684c'], [1, '#554a36']]);
      ctx.fillStyle = tg; ctx.fillRect(-78 * u, -96 * u, 156 * u, 96 * u);
      ctx.fillStyle = '#c0aa7c'; ctx.beginPath(); ctx.ellipse(0, -96 * u, 78 * u, 16 * u, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(80,60,34,0.35)'; ctx.beginPath(); ctx.ellipse(12 * u, -94 * u, 58 * u, 11 * u, 0, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(112,62,26,0.42)'; ctx.fillRect(-78 * u, -61 * u, 156 * u, 9 * u); ctx.fillRect(-78 * u, -27 * u, 156 * u, 7 * u);
      ctx.fillStyle = 'rgba(255,235,180,0.12)'; ctx.fillRect(-78 * u, -69 * u, 156 * u, 3 * u); ctx.fillRect(-78 * u, -35 * u, 156 * u, 3 * u);
      for (const rx of [-46, 4, 48]) { ctx.fillStyle = 'rgba(112,55,22,0.30)'; ctx.fillRect(rx * u, -52 * u, 5 * u, 48 * u); }
      ctx.strokeStyle = '#4e4433'; ctx.lineWidth = 2.4 * u;
      ctx.beginPath(); ctx.moveTo(58 * u, -90 * u); ctx.lineTo(58 * u, 0); ctx.moveTo(76 * u, -90 * u); ctx.lineTo(76 * u, 0); ctx.stroke();
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(58 * u, (-84 + i * 18) * u); ctx.lineTo(76 * u, (-84 + i * 18) * u); ctx.stroke(); }
      ctx.fillStyle = '#5d5138'; ctx.fillRect(-18 * u, -111 * u, 36 * u, 7 * u);
      break;
    }
    case 'pipes': {
      for (const px of [-90, -30, 30, 90]) {
        ctx.fillStyle = localGradient(0, -38 * u, 0, 0, [[0, '#6d5136'], [1, '#40301d']]); ctx.fillRect((px - 5) * u, -38 * u, 10 * u, 38 * u);
      }
      for (const py of [-48, -27]) {
        ctx.fillStyle = localGradient(0, (py - 7) * u, 0, (py + 7) * u, [[0, '#a67c48'], [0.38, '#77552f'], [0.78, '#503a20'], [1, '#332612']]);
        ctx.fillRect(-112 * u, (py - 7) * u, 224 * u, 14 * u);
        ctx.fillStyle = 'rgba(255,230,170,0.18)'; ctx.fillRect(-112 * u, (py - 7) * u, 224 * u, 3 * u);
        for (const fx of [-72, 0, 72]) { ctx.fillStyle = '#3c2b16'; ctx.fillRect((fx - 4) * u, (py - 8) * u, 8 * u, 16 * u); fasteners([[fx, py - 4], [fx, py + 4]], u, '#c9a15e'); }
      }
      ctx.fillStyle = localGradient(-13 * u, 0, 13 * u, 0, [[0, '#5d4325'], [0.5, '#9a7440'], [1, '#4a351d']]);
      ctx.beginPath(); ctx.ellipse(-112 * u, -38 * u, 10 * u, 14 * u, 0, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(112 * u, -38 * u, 10 * u, 14 * u, 0, 0, 7); ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/* ---------------- figures: fleshed-out sprites ----------------
   Carlton's playtest verdict on the first build: "the men look like
   stick figures — I can't tell who I'm shooting." So figures are
   now SOLID people, pre-rendered once to offscreen sprites (upper
   body + head + arms + rifle baked; legs stay dynamic tapered
   quads so the walk/crouch animation survives). The read is
   unmistakable at 1x and 8x alike:
   - HOSTILES: helmet, tac vest, a real rifle shape, desert kit —
     and ONE marker on every one of them: a bright RED armband and
     a RED stripe across the helmet.
   - CIVILIANS: no helmet, no weapon, bright clothes (white robe /
     light-blue shirt), upright stroll, one carries a basket.
   Sprites are painted in "figure units": 100 units = full figure
   height, head centre at -88 (r 13) — exactly the headBox/bodyBox
   geometry, so hit resolution never moved. */
const SPRITE_DEFS = {
  merc:     { armed: true,  marker: 'redband', cloth: '#6b6242', clothD: '#524b32', vest: '#47412e', vestD: '#332e20', helmet: '#57543a', skin: '#c89878', pants: '#4c4433' },
  shooter:  { armed: true,  marker: 'redband', cloth: '#54443a', clothD: '#40332a', vest: '#33291f', vestD: '#241c14', helmet: '#3f3428', skin: '#b0825e', pants: '#3d3226' },
  counter:  { armed: true,  marker: 'redband', cloth: '#3a4034', clothD: '#2c3128', vest: '#2c3324', vestD: '#1f2519', helmet: '#46523a', skin: '#c89878', pants: '#2e3328', ghillie: true, longGun: true },
  priority: { armed: true,  marker: 'redband', cloth: '#6b6242', clothD: '#524b32', vest: '#5a2d20', vestD: '#422015', helmet: '#7a2020', skin: '#d8a87e', pants: '#4c4433' },
  civRobe:   { armed: false, marker: null, cloth: '#e9e3d3', clothD: '#cfc6ae', skin: '#a8744c', pants: '#5a4632' },
  civShirt:  { armed: false, marker: null, cloth: '#7fa8c9', clothD: '#6790b3', skin: '#8a5f3a', pants: '#8a6f4d' },
  civBasket: { armed: false, marker: null, cloth: '#d8cf6a', clothD: '#bcb254', skin: '#6e4a2c', pants: '#7a6248', basket: true }
};
function spriteKeyFor(f) {
  if (f.kind !== 'civilian') return f.kind;
  return f.seed < 0.34 ? 'civRobe' : (f.seed < 0.67 ? 'civShirt' : 'civBasket');
}
let figureSprites = null;      // key -> { stand, dead } offscreen canvases
function figureSprite(f) {
  const key = spriteKeyFor(f);
  if (!figureSprites) buildFigureSprites();
  const s = figureSprites[key];
  return { key, def: SPRITE_DEFS[key], stand: s.stand, dead: s.dead };
}
function buildFigureSprites() {
  figureSprites = {};
  for (const key of Object.keys(SPRITE_DEFS)) {
    figureSprites[key] = { stand: paintFigureSprite(key, false), dead: paintFigureSprite(key, true) };
  }
  return figureSprites;
}
/* tapered limb segment as a filled quad — volume, not a line */
function limbQuad(c, x0, y0, x1, y1, w0, w1, col) {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x0 + nx * w0 / 2, y0 + ny * w0 / 2);
  c.lineTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
  c.lineTo(x1 - nx * w1 / 2, y1 - ny * w1 / 2);
  c.lineTo(x0 - nx * w0 / 2, y0 - ny * w0 / 2);
  c.closePath(); c.fill();
}
function paintFigureSprite(key, dead) {
  const def = SPRITE_DEFS[key];
  const S = 4;                                   // px per figure unit
  const c = document.createElement('canvas');
  if (dead) { c.width = 136 * S; c.height = 46 * S; }
  else { c.width = 132 * S; c.height = 112 * S; }
  const g = c.getContext('2d');
  if (dead) { g.translate(68 * S, 38 * S); g.scale(S, S); paintFallen(g, def, key); }
  else { g.translate(66 * S, 108 * S); g.scale(S, S); paintStanding(g, def, key); }
  return c;
}
/* standing upper body: hips (-46) to head top (-101), facing +x */
function paintStanding(g, def, key) {
  const robe = key === 'civRobe';
  // garment / torso — wide shoulders tapering to the waist
  g.fillStyle = def.cloth;
  g.beginPath();
  if (robe) {
    g.moveTo(-16, -77); g.lineTo(16, -77); g.lineTo(21, -3); g.lineTo(-21, -3); g.closePath(); g.fill();
    g.fillStyle = def.clothD;                       // shade wedge
    g.beginPath(); g.moveTo(4, -77); g.lineTo(16, -77); g.lineTo(21, -3); g.lineTo(6, -3); g.closePath(); g.fill();
    g.fillStyle = '#b8a06a';                        // sash belt
    g.fillRect(-18.5, -47, 37, 4.5);
  } else {
    g.moveTo(-18.5, -78); g.lineTo(18.5, -78); g.lineTo(13.5, -44); g.lineTo(-13.5, -44); g.closePath(); g.fill();
    g.fillStyle = def.clothD;                       // shade wedge
    g.beginPath(); g.moveTo(5, -78); g.lineTo(18.5, -78); g.lineTo(13.5, -44); g.lineTo(5, -44); g.closePath(); g.fill();
  }
  if (def.armed) {
    // tac vest with mag pouches
    g.fillStyle = def.vest;
    g.beginPath(); g.moveTo(-14, -75); g.lineTo(14, -75); g.lineTo(12, -47); g.lineTo(-12, -47); g.closePath(); g.fill();
    g.fillStyle = def.vestD;
    for (const px of [-10.5, -3.5, 3.5]) g.fillRect(px, -61, 6.4, 10);
    g.fillRect(-12, -70, 24, 2.6);                  // chest strap
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(-14, -75, 28, 2.2);
    // rear arm with THE red armband — the hostile marker
    limbQuad(g, -16, -75, -23, -54, 8, 6, def.cloth);
    g.fillStyle = '#d21f26';
    g.save(); g.translate(-20.6, -63); g.rotate(0.32); g.fillRect(-4.6, -4, 9.2, 8); g.restore();
    g.fillStyle = def.skin; g.beginPath(); g.arc(-23.5, -51, 3.4, 0, 7); g.fill();
    // forward arm reaching to the rifle grip
    limbQuad(g, 16, -75, 27, -66, 8, 6, def.cloth);
    limbQuad(g, 27, -66, 33, -69, 6, 5, def.clothD);
    g.fillStyle = def.skin; g.beginPath(); g.arc(33.5, -69, 3.2, 0, 7); g.fill();
    paintRifle(g, def);
  } else if (robe) {
    // sleeves run down the robe's edge, hands peeking out
    limbQuad(g, -15, -74, -19.5, -34, 8.5, 7, def.clothD);
    limbQuad(g, 15, -74, 19.5, -34, 8.5, 7, def.cloth);
    g.fillStyle = def.skin;
    g.beginPath(); g.arc(-19.5, -31, 3.3, 0, 7); g.arc(19.5, -31, 3.3, 0, 7); g.fill();
  } else {
    // civilian arms hang loose at the sides
    limbQuad(g, -16.5, -75, -20, -49, 7.5, 5.5, def.clothD);
    limbQuad(g, 16.5, -75, 20, -49, 7.5, 5.5, def.cloth);
    g.fillStyle = def.skin;
    g.beginPath(); g.arc(-20, -46.5, 3.3, 0, 7); g.arc(20, -46.5, 3.3, 0, 7); g.fill();
    if (def.basket) {
      // woven basket on the rear arm, cloth bundle on top
      g.strokeStyle = '#8a5f24'; g.lineWidth = 2.4;
      g.beginPath(); g.arc(-26, -44, 7.5, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
      g.fillStyle = '#a8792f';
      g.beginPath(); g.moveTo(-34, -44); g.lineTo(-18, -44); g.lineTo(-20.5, -31); g.lineTo(-31.5, -31); g.closePath(); g.fill();
      g.strokeStyle = '#7c5c33'; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(-33, -39.5); g.lineTo(-19, -39.5); g.moveTo(-32, -35); g.lineTo(-20, -35); g.stroke();
      g.fillStyle = '#c94f38'; g.beginPath(); g.ellipse(-26, -45.5, 6.4, 3.4, 0, 0, 7); g.fill();
    }
  }
  // neck + head
  g.fillStyle = def.skin; g.fillRect(-4, -83, 8, 6);
  g.beginPath(); g.arc(0, -88, 12.6, 0, 7); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.13)'; g.beginPath(); g.arc(3.5, -84.5, 8.6, 0, 7); g.fill();   // jaw shade
  g.fillStyle = def.skin; g.beginPath(); g.arc(-1.5, -88.5, 11.4, 0, 7); g.fill();
  if (def.armed) {
    // helmet dome + brim + THE red stripe
    g.fillStyle = def.helmet;
    g.beginPath(); g.arc(0, -89, 14.4, Math.PI * 0.96, Math.PI * 2.04); g.closePath(); g.fill();
    g.fillRect(-16, -90.6, 32, 3.6);
    g.strokeStyle = '#d21f26'; g.lineWidth = 4.4;
    g.beginPath(); g.arc(0, -89, 13.4, Math.PI * 1.18, Math.PI * 1.82); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(10.5, -82); g.lineTo(12.5, -76); g.stroke();                     // chin strap
    if (def.ghillie) {
      g.strokeStyle = '#55663f'; g.lineWidth = 2;
      for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 3.6, -101 + Math.abs(i)); g.lineTo(i * 4.4, -92 + Math.abs(i) * 0.6); g.stroke(); }
    }
  } else if (key === 'civRobe') {
    g.fillStyle = '#f2ede0';                        // white headscarf + tail
    g.beginPath(); g.arc(0, -89.5, 13.6, Math.PI * 0.95, Math.PI * 2.05); g.closePath(); g.fill();
    g.fillRect(-14.5, -90.5, 29, 3);
    g.fillRect(-15, -90, 5.5, 15);
  } else {
    g.fillStyle = key === 'civBasket' ? '#3a2a18' : '#2e2018';
    g.beginPath(); g.arc(0, -90, 12.9, Math.PI * 1.02, Math.PI * 1.98); g.closePath(); g.fill();
    g.fillRect(-12.9, -91, 25.8, 3.4);
  }
}
/* a real rifle silhouette: stock, receiver, mag, barrel, muzzle */
function paintRifle(g, def) {
  g.save();
  g.translate(13, -63); g.rotate(-0.055);
  g.fillStyle = '#241c10';
  g.beginPath();                                  // stock + receiver
  g.moveTo(-13, -2.5); g.lineTo(16, -3.4); g.lineTo(16, 1.8); g.lineTo(2, 2.4); g.lineTo(-4, 6.5); g.lineTo(-12, 4.5); g.closePath(); g.fill();
  g.fillRect(14, -2.6, def.longGun ? 34 : 27, 3.1);                                     // barrel
  g.fillRect(def.longGun ? 46 : 39, -3.4, 3.4, 4.8);                                    // muzzle brake
  g.beginPath(); g.moveTo(3, 2.2); g.lineTo(8.6, 2.2); g.lineTo(7.2, 10.5); g.lineTo(2.2, 10); g.closePath(); g.fill();  // mag
  g.fillRect(20, -6.4, 2.2, 3.8);                                                       // front sight post
  g.fillStyle = '#3a2f1c'; g.fillRect(-11, -3.6, 24, 1.7);                              // top highlight
  if (def.longGun) { g.fillStyle = '#171208'; g.fillRect(0, -8.2, 11, 3.6); g.fillRect(2, -4.6, 1.8, 2); g.fillRect(8, -4.6, 1.8, 2); }  // his scope
  g.restore();
}
/* fallen body for the dead state — the pool forms under it */
function paintFallen(g, def, key) {
  const robe = key === 'civRobe';
  g.fillStyle = def.pants;                        // legs stretched out
  limbQuad(g, -16, -7, -42, -4.5, 8, 6.5, def.pants);
  limbQuad(g, -14, -11, -40, -13.5, 8, 6.5, def.pants);
  g.fillStyle = '#2c2113';                        // boots
  g.beginPath(); g.ellipse(-46, -4, 5.6, 3, 0, 0, 7); g.ellipse(-44, -13.5, 5.6, 3, 0, 0, 7); g.fill();
  g.fillStyle = def.cloth;                        // torso on its side
  g.beginPath();
  if (robe) { g.moveTo(-20, -1); g.lineTo(22, -2); g.lineTo(18, -15); g.lineTo(-16, -16); g.closePath(); }
  else { g.moveTo(-19, -1.5); g.lineTo(20, -1.5); g.lineTo(22, -13); g.lineTo(-15, -14.5); g.closePath(); }
  g.fill();
  if (def.armed) {
    g.fillStyle = def.vest; g.fillRect(-8, -13.5, 24, 11);
    g.fillStyle = def.vestD; g.fillRect(-2, -12, 5.6, 8); g.fillRect(5, -12, 5.6, 8);
    g.fillStyle = '#d21f26'; g.fillRect(13, -15.5, 8.5, 4.4);       // red band, still on the arm
    limbQuad(g, 16, -12, 30, -19, 7, 5.5, def.cloth);               // sprawled arm
  } else if (!robe) {
    limbQuad(g, 16, -11, 31, -6, 7, 5.5, def.cloth);
  }
  g.fillStyle = def.skin; g.beginPath(); g.arc(31, -7.5, 11, 0, 7); g.fill();
  if (def.armed) {
    g.fillStyle = def.helmet;
    g.beginPath(); g.arc(31, -8.5, 12.4, Math.PI * 0.9, Math.PI * 2.1); g.closePath(); g.fill();
    g.strokeStyle = '#d21f26'; g.lineWidth = 3.8;
    g.beginPath(); g.arc(31, -8.5, 11.4, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
  } else if (robe) {
    g.fillStyle = '#f2ede0'; g.beginPath(); g.arc(31, -9, 11.8, Math.PI * 0.95, Math.PI * 2.05); g.closePath(); g.fill();
  } else {
    g.fillStyle = '#2e2018'; g.beginPath(); g.arc(31, -9.5, 11.2, Math.PI * 1.05, Math.PI * 1.95); g.closePath(); g.fill();
  }
  if (def.armed) {                                // his rifle, dropped beside him
    g.save(); g.translate(-4, -19); g.rotate(0.16); g.fillStyle = '#241c10';
    g.fillRect(-16, -2, 46, 3.4); g.fillRect(28, -2.8, 3.2, 5);
    g.beginPath(); g.moveTo(2, 1.2); g.lineTo(7.4, 1.2); g.lineTo(6.2, 8.6); g.lineTo(1.4, 8.2); g.closePath(); g.fill();
    g.restore();
  }
}
function drawFigure(f) {
  const z = ZOOMS[zoomIdx];
  const p = proj(f.x, f.y, 1);
  const u = figureHeight(f) * z;              // full height on screen, px
  if (p.x < -u * 0.85 || p.x > VIEW_W + u * 0.85) return;
  const us = u / 100;                          // px per figure unit
  const spr = figureSprite(f);
  const def = spr.def;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (f.dead) {
    // fallen sprite — the blood pool (drawn in drawWorld) spreads under it
    ctx.drawImage(spr.dead, -68 * us, -38 * us, 136 * us, 46 * us);
    ctx.restore();
    return;
  }
  // soft shadow
  ctx.fillStyle = 'rgba(40,20,5,0.35)';
  ctx.beginPath(); ctx.ellipse(0, 0, u * 0.30, u * 0.055, 0, 0, 7); ctx.fill();
  const moving = Math.abs(f.speed) > 1;
  const swing = moving ? Math.sin(f.walkPhase) * 15 : 0;      // figure units
  const tilt = f.woundT > 0 ? Math.sin(timeNow * 30) * 0.03 : (f.state === 'escape' ? f.dir * 0.10 : 0);
  ctx.rotate(tilt);
  // legs — dynamic tapered quads (the robe covers its wearer's)
  if (spr.key === 'civRobe') {
    ctx.fillStyle = '#4a3826';
    ctx.beginPath(); ctx.ellipse(-7 * us, -1 * us, 5 * us, 2.4 * us, 0, 0, 7); ctx.ellipse(7 * us, -1 * us, 5 * us, 2.4 * us, 0, 0, 7); ctx.fill();
  } else if (f.crouch) {
    limbQuad(ctx, 4 * us, -46 * us, 16 * us, -20 * us, 8.5 * us, 7 * us, def.pants);
    limbQuad(ctx, 16 * us, -20 * us, 10 * us, -1 * us, 7 * us, 6 * us, def.pants);
    limbQuad(ctx, -4 * us, -46 * us, -15 * us, -24 * us, 8.5 * us, 7 * us, def.pants);
    limbQuad(ctx, -15 * us, -24 * us, -19 * us, -1 * us, 7 * us, 6 * us, def.pants);
    ctx.fillStyle = '#2c2113';
    ctx.beginPath(); ctx.ellipse(10 * us, -1 * us, 5.4 * us, 2.6 * us, 0, 0, 7); ctx.ellipse(-19 * us, -1 * us, 5.4 * us, 2.6 * us, 0, 0, 7); ctx.fill();
  } else {
    limbQuad(ctx, -6 * us, -46 * us, swing * us, -1 * us, 9 * us, 6.5 * us, def.pants);
    limbQuad(ctx, 6 * us, -46 * us, -swing * us, -1 * us, 9 * us, 6.5 * us, def.pants);
    ctx.fillStyle = '#2c2113';
    ctx.beginPath(); ctx.ellipse(swing * us, -1 * us, 5.6 * us, 2.7 * us, 0, 0, 7); ctx.ellipse(-swing * us, -1 * us, 5.6 * us, 2.7 * us, 0, 0, 7); ctx.fill();
  }
  // upper body sprite (flipped to facing)
  ctx.save();
  ctx.scale(f.dir, 1);
  ctx.drawImage(spr.stand, -66 * us, -108 * us, 132 * us, 112 * us);
  ctx.restore();
  // counter-sniper glint at his scope
  if (f.kind === 'counter' && f.glintT > 0) {
    const gx = f.dir * u * 0.19, gy = -u * 0.71;
    ctx.strokeStyle = 'rgba(255,246,200,0.95)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx - 10, gy); ctx.lineTo(gx + 10, gy); ctx.moveTo(gx, gy - 10); ctx.lineTo(gx, gy + 10);
    ctx.moveTo(gx - 7, gy - 7); ctx.lineTo(gx + 7, gy + 7); ctx.moveTo(gx + 7, gy - 7); ctx.lineTo(gx - 7, gy + 7);
    ctx.stroke();
  }
  // wound stain — blooms over the first quarter-second after the hit
  if (f.stain && f.woundT > 0) {
    const age = 1.4 - f.woundT;
    const bloom = Math.min(1, age / 0.25);
    const sr = f.stain.r * us * (0.45 + 0.55 * bloom);
    ctx.fillStyle = 'rgba(125,16,19,0.88)';
    ctx.beginPath(); ctx.ellipse(f.stain.x * us, f.stain.y * us, sr, sr * 0.82, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(94,10,13,0.95)';
    ctx.beginPath(); ctx.ellipse(f.stain.x * us, f.stain.y * us, sr * 0.55, sr * 0.45, 0, 0, 7); ctx.fill();
  }
  ctx.restore();
  // priority diamond — intel marker floating over the mark
  if (f.kind === 'priority') {
    const mp = proj(f.x, f.y - figureHeight(f) - 16 - Math.sin(timeNow * 3.2) * 3, 1);
    ctx.save();
    ctx.translate(mp.x, mp.y); ctx.rotate(Math.PI / 4);
    const s2 = 8 + Math.sin(timeNow * 3.2) * 1.6;
    ctx.fillStyle = 'rgba(255,60,40,0.92)'; ctx.fillRect(-s2 / 2, -s2 / 2, s2, s2);
    ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 1.6; ctx.strokeRect(-s2 / 2, -s2 / 2, s2, s2);
    ctx.restore();
  }
}

function drawWorld() {
  const scene = SCENES[spec ? spec.scene : 'canyon'];
  drawSkyAndRidges(scene);
  drawGround(scene);
  for (const pr of scene.props) drawProp(pr);
  drawFlag(140, 566); drawFlag(2260, 566);
  // blood decals
  for (const s of splats) {
    const p = proj(s.x, s.y, 1);
    ctx.fillStyle = 'rgba(140,16,20,' + (0.65 * (1 - s.t / s.life)) + ')';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, s.r * ZOOMS[zoomIdx], s.r * 0.4 * ZOOMS[zoomIdx], 0, 0, 7); ctx.fill();
  }
  // blood pools under the fallen — they stay for the whole contract
  for (const p of pools) {
    const pp = proj(p.x, p.y, 1);
    const r = p.r * ZOOMS[zoomIdx];
    if (r < 0.5) continue;
    ctx.fillStyle = 'rgba(94,10,13,0.88)';
    ctx.beginPath(); ctx.ellipse(pp.x, pp.y, r, r * 0.38, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(125,16,19,0.55)';
    ctx.beginPath(); ctx.ellipse(pp.x - r * 0.15, pp.y - r * 0.05, r * 0.62, r * 0.24, 0, 0, 7); ctx.fill();
  }
  // Drifting dust (the free wind gauge): a soft body and a wind-stretched
  // tail, fading in and out instead of hard little rectangles.
  for (const d of dust) {
    const p = proj(d.x, d.y, 1), z = ZOOMS[zoomIdx];
    const lifeK = Math.sin(Math.PI * Math.min(1, d.t / d.life));
    const dir = wind === 0 ? 0.35 : Math.sign(wind), len = (7 + Math.abs(wind) * 1.7) * z;
    ctx.fillStyle = 'rgba(232,183,112,' + (0.10 * lifeK) + ')';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, 7 * z, 2.6 * z, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,170,' + (0.42 * lifeK) + ')'; ctx.lineWidth = Math.max(1, 1.25 * z); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p.x - dir * len * 0.4, p.y + len * 0.08); ctx.lineTo(p.x + dir * len, p.y - len * 0.10); ctx.stroke();
    ctx.lineCap = 'butt';
  }
  const sorted = figures.slice().sort((a, b) => a.y - b.y);
  for (const f of sorted) drawFigure(f);
  // tracers
  for (const t of tracers) {
    const a = proj(t.x0, t.y0, 1), b = proj(t.x1, t.y1, 1);
    const k = 1 - t.t / t.life;
    ctx.strokeStyle = t.enemy ? 'rgba(255,92,50,' + (0.20 * k) + ')' : 'rgba(255,196,92,' + (0.22 * k) + ')';
    ctx.lineWidth = t.enemy ? 6 : 7;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = t.enemy ? 'rgba(255,120,80,' + (0.85 * k) + ')' : 'rgba(255,240,190,' + (0.9 * k) + ')';
    ctx.lineWidth = t.enemy ? 2 : 2.6;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // particles (blood puffs, dust, glints)
  for (const p of particles) {
    const sp = proj(p.x, p.y, 1);
    const k = 1 - p.t / p.life;
    if (p.glint) {
      ctx.strokeStyle = 'rgba(255,246,200,' + k + ')'; ctx.lineWidth = 2;
      const r = p.r * 2.2;
      ctx.beginPath();
      ctx.moveTo(sp.x - r, sp.y); ctx.lineTo(sp.x + r, sp.y); ctx.moveTo(sp.x, sp.y - r); ctx.lineTo(sp.x, sp.y + r);
      ctx.stroke();
    } else if (p.flash) {
      // the instant red star at the impact point — reads at any zoom
      const r = p.r * ZOOMS[zoomIdx];
      ctx.strokeStyle = 'rgba(210,31,38,' + k + ')'; ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(sp.x - r, sp.y); ctx.lineTo(sp.x + r, sp.y); ctx.moveTo(sp.x, sp.y - r * 0.7); ctx.lineTo(sp.x, sp.y + r * 0.7);
      ctx.moveTo(sp.x - r * 0.7, sp.y - r * 0.5); ctx.lineTo(sp.x + r * 0.7, sp.y + r * 0.5); ctx.moveTo(sp.x + r * 0.7, sp.y - r * 0.5); ctx.lineTo(sp.x - r * 0.7, sp.y + r * 0.5);
      ctx.stroke();
      ctx.globalAlpha = k;
      ctx.fillStyle = '#7d1013';
      ctx.beginPath(); ctx.arc(sp.x, sp.y, r * 0.3, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (p.chunk) {
      const r = p.r * ZOOMS[zoomIdx];
      ctx.save(); ctx.translate(sp.x, sp.y); ctx.rotate(p.rot || 0); ctx.globalAlpha = Math.max(0, k);
      ctx.fillStyle = p.col; ctx.fillRect(-r, -r * 0.62, r * 2, r * 1.24);
      ctx.fillStyle = 'rgba(232,183,112,0.35)'; ctx.fillRect(-r, -r * 0.62, r * 2, r * 0.35);
      ctx.restore(); ctx.globalAlpha = 1;
    } else {
      ctx.globalAlpha = Math.max(0, p.mist ? 0.55 * k : k);
      ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, p.r * ZOOMS[zoomIdx], 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}
function drawReticle(R) {
  const cx = VIEW_W / 2, cy = VIEW_H / 2;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.42)'; ctx.shadowBlur = 1.4; ctx.shadowOffsetX = 0.6; ctx.shadowOffsetY = 0.6;
  ctx.strokeStyle = 'rgba(12,10,8,0.90)'; ctx.fillStyle = 'rgba(12,10,8,0.90)';
  ctx.lineCap = 'round';
  if (save.reticle === 'crossx') {
    ctx.lineWidth = 3.1;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath(); ctx.moveTo(cx + dx * 26, cy + dy * 26); ctx.lineTo(cx + dx * R * 0.92, cy + dy * R * 0.92); ctx.stroke();
    }
    ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(cx - 15, cy); ctx.lineTo(cx + 15, cy); ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy + 15); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, 7); ctx.fill();
  } else if (save.reticle === 'chevron') {
    ctx.lineWidth = 3.8;
    ctx.beginPath(); ctx.moveTo(cx - 17, cy + 7); ctx.lineTo(cx, cy - 13); ctx.lineTo(cx + 17, cy + 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.13)'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(cx - 15, cy + 4); ctx.lineTo(cx, cy - 12); ctx.lineTo(cx + 15, cy + 4); ctx.stroke();
    ctx.strokeStyle = 'rgba(12,10,8,0.90)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(cx, cy + 18); ctx.lineTo(cx, cy + 76); ctx.stroke();
    for (const [dy, hw] of [[36, 20], [54, 14]]) { ctx.beginPath(); ctx.moveTo(cx - hw, cy + dy); ctx.lineTo(cx + hw, cy + dy); ctx.stroke(); }
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(cx - R + 8, cy); ctx.lineTo(cx - 34, cy); ctx.moveTo(cx + 34, cy); ctx.lineTo(cx + R - 8, cy); ctx.stroke();
  } else { // mil-dot: heavy outer posts, fine centre hairs, etched dots
    ctx.lineWidth = 4.6;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx - 188, cy); ctx.moveTo(cx + 188, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy - 188); ctx.moveTo(cx, cy + 188); ctx.lineTo(cx, cy + R);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 188, cy); ctx.lineTo(cx - 12, cy); ctx.moveTo(cx + 12, cy); ctx.lineTo(cx + 188, cy);
    ctx.moveTo(cx, cy - 188); ctx.lineTo(cx, cy - 12); ctx.moveTo(cx, cy + 12); ctx.lineTo(cx, cy + 188);
    ctx.stroke();
    for (const d of [42, 84, 126, 168]) {
      for (const [dx, dy] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
        ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 2.35, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.arc(cx + dx - 0.6, cy + dy - 0.6, 0.8, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(12,10,8,0.90)';
      }
    }
    ctx.beginPath(); ctx.arc(cx, cy, 1.7, 0, 7); ctx.fill();
  }
  ctx.restore();
}
function drawCracks() {
  for (let i = 0; i < cracks; i++) {
    const rng = mulberry32(i * 131 + 7);
    const ox = [60, VIEW_W - 80, VIEW_W / 2][i], oy = [40, 70, VIEW_H - 30][i];
    // dark glass shadow first, then the bright fracture core
    for (const pass of [[2.8, 'rgba(0,0,0,0.26)', 1.5, 1.5], [1.35, 'rgba(235,245,255,0.58)', 0, 0]]) {
      const rr = mulberry32(i * 131 + 7);
      ctx.strokeStyle = pass[1]; ctx.lineWidth = pass[0];
      ctx.save(); ctx.translate(pass[2], pass[3]);
      for (let s = 0; s < 5; s++) {
        let x = ox, y = oy;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += (rr() - 0.5) * 130; y += (rr() - 0.3) * 90; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(235,245,255,0.30)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ox, oy, 9 + i * 3, 0, 7); ctx.stroke();
  }
}
function drawScope() {
  const z = ZOOMS[zoomIdx];
  const skin = skinDef();
  const cx = VIEW_W / 2, cy = VIEW_H / 2;
  if (z >= 2) {
    const R = 272;
    if (skin.tint) {
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
      ctx.fillStyle = skin.tint; ctx.fillRect(cx - R, cy - R, R * 2, R * 2); ctx.restore();
    }
    ctx.beginPath(); ctx.rect(0, 0, VIEW_W, VIEW_H); ctx.arc(cx, cy, R, 0, Math.PI * 2, true);
    ctx.fillStyle = '#060504'; ctx.fill('evenodd');
    const eg = ctx.createRadialGradient(cx, cy, R - 16, cx, cy, R + 3);
    eg.addColorStop(0, 'rgba(0,0,0,0)'); eg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R + 3, 0, 7); ctx.clip();
    ctx.fillStyle = eg; ctx.fillRect(cx - R - 4, cy - R - 4, (R + 4) * 2, (R + 4) * 2); ctx.restore();
    // Real glass: a diagonal sheen, lower-corner falloff, micro-dust and a
    // few hairline scratches kept out of the centre picture.
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R - 2, 0, 7); ctx.clip();
    const sheen = ctx.createLinearGradient(cx - R, cy - R, cx + R * 0.55, cy + R * 0.45);
    sheen.addColorStop(0, 'rgba(255,255,255,0.13)'); sheen.addColorStop(0.30, 'rgba(255,255,255,0.025)');
    sheen.addColorStop(0.58, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(24,42,52,0.10)');
    ctx.fillStyle = sheen; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    const fall = ctx.createRadialGradient(cx - R * 0.34, cy - R * 0.38, R * 0.18, cx + R * 0.18, cy + R * 0.22, R * 1.08);
    fall.addColorStop(0, 'rgba(0,0,0,0)'); fall.addColorStop(0.72, 'rgba(0,0,0,0.03)'); fall.addColorStop(1, 'rgba(0,0,0,0.20)');
    ctx.fillStyle = fall; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, R - 13, Math.PI * 1.08, Math.PI * 1.38); ctx.stroke();
    ctx.strokeStyle = 'rgba(140,205,235,0.10)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(cx, cy, R - 7, Math.PI * 1.10, Math.PI * 1.31); ctx.stroke();
    ctx.fillStyle = 'rgba(30,24,16,0.20)';
    for (let i = 0; i < 11; i++) {
      const a = artNoise(i, 91) * Math.PI * 2, rr = R * (0.70 + artNoise(91, i) * 0.25);
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.8 + artNoise(i, 7) * 1.1, 0, 7); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 0.8;
    for (const sc of [[-0.72, -0.52, 34, -9], [0.64, -0.70, 25, 12], [0.76, 0.48, -30, 7]]) {
      ctx.beginPath(); ctx.moveTo(cx + sc[0] * R, cy + sc[1] * R); ctx.lineTo(cx + sc[0] * R + sc[2], cy + sc[1] * R + sc[3]); ctx.stroke();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(120,205,255,0.14)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, R - 2, 0, 7); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,132,58,0.10)';
    ctx.beginPath(); ctx.arc(cx, cy, R + 1, 0, 7); ctx.stroke();
    ctx.lineWidth = 11; ctx.strokeStyle = skin.ring;
    ctx.beginPath(); ctx.arc(cx, cy, R + 5, 0, 7); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.arc(cx, cy, R + 12, 0, 7); ctx.stroke();
    // Machined bezel: lit upper-left arc, shaded lower-right arc, knurl ticks
    // and four recessed screws. Pure hardware dressing around the glass.
    ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(255,240,190,0.30)';
    ctx.beginPath(); ctx.arc(cx, cy, R + 6, Math.PI * 1.05, Math.PI * 1.48); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.44)';
    ctx.beginPath(); ctx.arc(cx, cy, R + 6, Math.PI * 0.08, Math.PI * 0.48); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.34)'; ctx.lineWidth = 2;
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * Math.PI * 2, r0 = R + 10.5, r1 = R + 14.5;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
    }
    for (const a of [Math.PI * 0.25, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) {
      const bx = cx + Math.cos(a) * (R + 6), by = cy + Math.sin(a) * (R + 6);
      ctx.fillStyle = '#090705'; ctx.beginPath(); ctx.arc(bx, by, 4.2, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,235,180,0.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bx, by, 4.2, 0, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx - 2.6, by); ctx.lineTo(bx + 2.6, by); ctx.stroke();
    }
    drawReticle(R);
    ctx.font = 'bold 15px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillText(z + '×', cx + 0.8, cy + R - 13.2);
    ctx.fillStyle = 'rgba(255,233,168,0.92)';
    ctx.fillText(z + '×', cx, cy + R - 14);
    if (wind !== 0) {
      ctx.font = 'bold 17px "Trebuchet MS", sans-serif';
      ctx.fillText((wind > 0 ? '▶' : '◀') + ' ' + Math.abs(wind), cx + (wind > 0 ? 1 : -1) * (R - 42), cy + 6);
    }
    if (reloadT > 0) { ctx.fillStyle = 'rgba(255,154,134,0.95)'; ctx.font = 'bold 16px "Trebuchet MS", sans-serif'; ctx.fillText('RELOADING', cx, cy - R + 30); }
    else if (boltT > 0) { ctx.fillStyle = 'rgba(255,233,168,0.8)'; ctx.font = 'bold 13px "Trebuchet MS", sans-serif'; ctx.fillText('· · ·', cx, cy - R + 28); }
  } else {
    const sheen = ctx.createLinearGradient(0, 0, VIEW_W, VIEW_H);
    sheen.addColorStop(0, 'rgba(255,255,255,0.075)'); sheen.addColorStop(0.38, 'rgba(255,255,255,0)');
    sheen.addColorStop(0.76, 'rgba(30,48,58,0.035)'); sheen.addColorStop(1, 'rgba(0,0,0,0.07)');
    ctx.fillStyle = sheen; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const vg = ctx.createRadialGradient(cx, cy, VIEW_H * 0.40, cx, cy, VIEW_H * 0.80);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(0.68, 'rgba(0,0,0,0.10)'); vg.addColorStop(1, 'rgba(0,0,0,0.46)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.strokeStyle = 'rgba(12,10,8,0.75)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 16, cy); ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy + 16); ctx.stroke();
    ctx.fillStyle = 'rgba(255,233,168,0.9)'; ctx.font = 'bold 13px "Trebuchet MS", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('SPOTTING — zoom in to engage', cx, cy + 30);
  }
  if (timeNow - lastHitT < 0.22) {
    ctx.strokeStyle = 'rgba(255,240,200,0.95)'; ctx.lineWidth = 2.6;
    const o = 12;
    ctx.beginPath();
    ctx.moveTo(cx - o, cy - o); ctx.lineTo(cx - 4, cy - 4); ctx.moveTo(cx + o, cy - o); ctx.lineTo(cx + 4, cy - 4);
    ctx.moveTo(cx - o, cy + o); ctx.lineTo(cx - 4, cy + 4); ctx.moveTo(cx + o, cy + o); ctx.lineTo(cx + 4, cy + 4);
    ctx.stroke();
  }
  if (cracks > 0) drawCracks();
}
function render() {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  if (state === 'menu' || state === 'shop' || state === 'howto') {
    camX = WORLD_W / 2 + Math.sin(timeNow * 0.07) * 330;
    camY = 430;
  }
  drawWorld();
  if (state === 'playing' || state === 'paused') drawScope();
}

/* ---------------- HUD ---------------- */
function updateHUD() {
  hud.contract.textContent = '🎯 Contract ' + (spec ? spec.n : save.unlocked) + (spec && spec.n > 8 ? ' · Ladder' : '');
  hud.score.textContent = '🏆 ' + fmt(score);
  hud.coins.textContent = '🪙 ' + fmt(save.coins);
  hud.targets.textContent = '💀 ' + hostilesDown() + '/' + hostilesTotal();
  hud.wind.textContent = wind === 0 ? '💨 CALM' : '💨 ' + (wind > 0 ? '▶' : '◀') + ' ' + Math.abs(wind);
  hud.hp.textContent = '🛡 ' + Math.ceil(integrity);
  hud.hp.classList.toggle('low', integrity <= 35);
  hud.ammo.textContent = reloadT > 0 ? '🔫 ↻' : '🔫 ' + ammo;
  hud.zoom.textContent = 'ZOOM ' + ZOOMS[zoomIdx] + '×';
  const bb = hud.breathBar;
  bb.style.width = Math.round(breath * 100) + '%';
  bb.className = breath <= 0.01 ? 'empty' : ((holding && breath > 0) ? 'holding' : '');
  hud.muteBtn.textContent = effectiveMuted() ? '🔇' : '🔊';
}
function refreshMenu() {
  const nxt = contractSpec(save.unlocked);
  const bests = SCENE_ORDER.filter(s => save.best[s]).map(s => SCENES[s].name + ' best ' + fmt(save.best[s])).join(' · ');
  $('menuStats').textContent =
    'Contracts completed: ' + save.stats.contracts + ' · Headshots: ' + save.stats.headshots +
    ' · Next up: Contract ' + save.unlocked + ' — ' + nxt.name + (bests ? ' · ' + bests : '');
}

/* ---------------- tutorial (first contract only) ---------------- */
const TUT_STEPS = [
  '🔭 Scroll or Z — zoom in',
  '🫁 Hold SHIFT — steady your breath',
  '💨 Watch the wind flag — aim off',
  '🎯 Headshots pay double — aim high'
];
let tutWindT = 0;
function tutActive() { return !save.tutDone && state === 'playing'; }
function tutSync() {
  if (tutActive() && save.tutStep < TUT_STEPS.length) {
    els.tutText.textContent = TUT_STEPS[save.tutStep];
    els.tutBar.classList.remove('hidden');
  } else {
    els.tutBar.classList.add('hidden');
  }
}
function tutEvent(ev) {
  if (!tutActive()) return;
  const s = save.tutStep;
  if (s === 0 && ev === 'zoom') save.tutStep = 1;
  else if (s === 1 && ev === 'breath') { save.tutStep = 2; tutWindT = 0; }
  else if (s === 2 && (ev === 'shot' || ev === 'windtime')) save.tutStep = 3;
  else if (s === 3 && (ev === 'headshot' || ev === 'kill')) { finishTut(); return; }
  else return;
  persist(); tutSync();
}
function finishTut() {
  save.tutDone = true; persist();
  els.tutBar.classList.add('hidden');
  if (state === 'playing') toast('School\'s out. Go earn. 🎯', 1800);
}
$('tutX').addEventListener('click', () => { save.tutDone = true; persist(); tutSync(); });

/* ---------------- armory ---------------- */
function costLabel(cost) {
  if (save.coins >= cost) return { txt: '🪙 ' + cost, cant: false };
  return { txt: '🪙 ' + cost + ' · Need ' + (cost - save.coins) + ' more', cant: true };
}
function shopRow(name, desc, pips, btnTxt, btnDisabled, costInfo) {
  const row = document.createElement('div');
  row.className = 'upg';
  const info = document.createElement('div'); info.className = 'info';
  const un = document.createElement('div'); un.className = 'uname'; un.textContent = name;
  const ud = document.createElement('div'); ud.className = 'udesc'; ud.textContent = desc;
  info.appendChild(un); info.appendChild(ud);
  if (pips) { const pp = document.createElement('div'); pp.className = 'pips'; pp.textContent = pips; info.appendChild(pp); }
  row.appendChild(info);
  if (costInfo) { const c = document.createElement('span'); c.className = 'cost' + (costInfo.cant ? ' cant' : ''); c.textContent = costInfo.txt; row.appendChild(c); }
  const btn = document.createElement('button');
  btn.textContent = btnTxt; btn.disabled = !!btnDisabled;
  row.appendChild(btn);
  return { row, btn };
}
function buildShop() {
  $('shopCoins').textContent = '🪙 ' + fmt(save.coins);
  const list = $('shopList');
  list.innerHTML = '';
  for (const key of Object.keys(UPGRADES)) {
    const u = UPGRADES[key], lvl = save.upg[key];
    const maxed = lvl >= u.max;
    const cost = maxed ? 0 : u.costs[lvl];
    const ci = maxed ? null : costLabel(cost);
    const pips = '●'.repeat(lvl) + '○'.repeat(u.max - lvl);
    const { row, btn } = shopRow(u.name, u.desc, pips, maxed ? 'MAXED' : 'Upgrade', maxed || save.coins < cost, ci);
    btn.addEventListener('click', () => buyUpgrade(key));
    list.appendChild(row);
  }
  for (const sk of SKINS) {
    const owned = save.skinsOwned.includes(sk.id);
    const equipped = save.skin === sk.id;
    const ci = owned ? null : costLabel(sk.cost);
    const { row, btn } = shopRow('🎨 ' + sk.name, sk.desc, null, equipped ? 'EQUIPPED' : (owned ? 'Equip' : 'Buy'), equipped || (!owned && save.coins < sk.cost), ci);
    btn.addEventListener('click', () => buySkin(sk.id));
    list.appendChild(row);
  }
  for (const rt of RETICLES) {
    const owned = save.retOwned.includes(rt.id);
    const equipped = save.reticle === rt.id;
    const ci = owned ? null : costLabel(rt.cost);
    const { row, btn } = shopRow('➕ ' + rt.name, rt.desc, null, equipped ? 'EQUIPPED' : (owned ? 'Equip' : 'Buy'), equipped || (!owned && save.coins < rt.cost), ci);
    btn.addEventListener('click', () => buyReticle(rt.id));
    list.appendChild(row);
  }
}
function buyUpgrade(key) {
  const u = UPGRADES[key], lvl = save.upg[key];
  if (lvl >= u.max) return false;
  const cost = u.costs[lvl];
  if (save.coins < cost) { toast('Need ' + (cost - save.coins) + ' more 🪙', 1500); return false; }
  save.coins -= cost; save.upg[key]++;
  persist(); buildShop(); updateHUD(); SFX.radio();
  return true;
}
function buySkin(id) {
  const sk = SKINS.find(s => s.id === id);
  if (!sk) return false;
  if (!save.skinsOwned.includes(id)) {
    if (save.coins < sk.cost) { toast('Need ' + (sk.cost - save.coins) + ' more 🪙', 1500); return false; }
    save.coins -= sk.cost; save.skinsOwned.push(id);
  }
  save.skin = id;
  persist(); buildShop(); updateHUD(); SFX.radio();
  return true;
}
function buyReticle(id) {
  const rt = RETICLES.find(r => r.id === id);
  if (!rt) return false;
  if (!save.retOwned.includes(id)) {
    if (save.coins < rt.cost) { toast('Need ' + (rt.cost - save.coins) + ' more 🪙', 1500); return false; }
    save.coins -= rt.cost; save.retOwned.push(id);
  }
  save.reticle = id;
  persist(); buildShop(); updateHUD(); SFX.radio();
  return true;
}
function openShop(from) {
  shopReturn = from;
  if (state === 'playing') { state = 'paused'; CG.gameplayStop(); }
  buildShop();
  showOnly(els.shop);
}
function closeShop() {
  if (shopReturn === 'summary') { showOnly(els.summary); }
  else if (shopReturn === 'paused') { showOnly(els.pause); }
  else { state = 'menu'; showOnly(els.menu); refreshMenu(); }
}

/* ---------------- input ---------------- */
function setZoom(idx) {
  const maxI = ZOOMS.indexOf(maxZoom());
  const ni = clamp(idx, 0, maxI);
  if (ni !== zoomIdx) {
    zoomIdx = ni;
    if (ZOOMS[ni] >= 2) tutEvent('zoom');
    updateHUD();
  }
}
canvas.addEventListener('mousemove', e => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.inside = true; });
canvas.addEventListener('mousedown', e => { e.preventDefault(); ensureAudio(); if (state === 'playing') fire(); });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (state !== 'playing') return;
  setZoom(zoomIdx + (e.deltaY < 0 ? 1 : -1));
}, { passive: false });
let pinchD = 0;
canvas.addEventListener('touchstart', e => {
  e.preventDefault(); ensureAudio();
  const t = e.touches[0];
  pointer.x = t.clientX; pointer.y = t.clientY; pointer.inside = true;
  if (e.touches.length === 2) pinchD = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 2) {
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (pinchD && Math.abs(d - pinchD) > 42) { setZoom(zoomIdx + (d > pinchD ? 1 : -1)); pinchD = d; }
    return;
  }
  const t = e.touches[0];
  pointer.x = t.clientX; pointer.y = t.clientY;
}, { passive: false });
canvas.addEventListener('touchend', e => { e.preventDefault(); pinchD = 0; }, { passive: false });
const fireBtn = $('fireBtn'), breathBtn = $('breathBtn');
if (fireBtn) {
  fireBtn.addEventListener('touchstart', e => { e.preventDefault(); ensureAudio(); if (state === 'playing') fire(); }, { passive: false });
  fireBtn.addEventListener('mousedown', e => { e.preventDefault(); if (state === 'playing') fire(); });
}
if (breathBtn) {
  const on = e => { e.preventDefault(); holding = true; };
  const off = e => { e.preventDefault(); holding = false; };
  breathBtn.addEventListener('touchstart', on, { passive: false });
  breathBtn.addEventListener('touchend', off, { passive: false });
  breathBtn.addEventListener('mousedown', on);
  breathBtn.addEventListener('mouseup', off);
}
document.addEventListener('keydown', e => {
  if (e.repeat) { if (e.key === 'Shift') holding = true; return; }
  keys[e.key] = true;
  if (e.key === 'Shift') { holding = true; ensureAudio(); }
  if (state !== 'playing') return;
  const k = e.key.toLowerCase();
  if (k === 'z') setZoom(zoomIdx + 1);
  else if (k === 'x') setZoom(zoomIdx - 1);
  else if (k === 'r') startReload();
  else if (k === 'p' || k === 'escape') pauseGame();
  else if (k === 'm') toggleMute();
  else if (k === ' ') { e.preventDefault(); fire(); }
});
document.addEventListener('keyup', e => {
  keys[e.key] = false;
  if (e.key === 'Shift') holding = false;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') { state = 'paused'; showOnly(els.pause); }
});
function toggleMute() { save.muted = !save.muted; persist(); updateMute(); updateHUD(); }
function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused'; CG.gameplayStop(); showOnly(els.pause);
}
function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing'; showOnly(null); CG.gameplayStart(); tutSync();
}
function toMenu() {
  state = 'menu'; CG.gameplayStop();
  zoomIdx = 0;
  setupContract(save.unlocked);
  showOnly(els.menu); refreshMenu(); updateHUD();
}

/* ---------------- buttons ---------------- */
let briefN = 1;
$('playBtn').addEventListener('click', () => { ensureAudio(); briefN = save.unlocked; showBrief(briefN); });
$('beginBtn').addEventListener('click', () => { ensureAudio(); beginContract(briefN); });
$('briefMenuBtn').addEventListener('click', toMenu);
$('howBtn').addEventListener('click', () => showOnly(els.howto));
$('howClose').addEventListener('click', () => { state = 'menu'; showOnly(els.menu); refreshMenu(); });
$('shopBtn').addEventListener('click', () => openShop((state === 'paused' || state === 'playing') ? 'paused' : (state === 'summary' ? 'summary' : 'menu')));
$('shopBtnMenu').addEventListener('click', () => openShop('menu'));
$('sumShopBtn').addEventListener('click', () => openShop('summary'));
$('shopClose').addEventListener('click', closeShop);
$('pauseBtn').addEventListener('click', () => { if (state === 'playing') pauseGame(); else if (state === 'paused') resumeGame(); });
$('muteBtn').addEventListener('click', toggleMute);
$('zoomInBtn').addEventListener('click', () => setZoom(zoomIdx + 1));
$('zoomOutBtn').addEventListener('click', () => setZoom(zoomIdx - 1));
$('nextBtn').addEventListener('click', () => { const n = spec.n + 1; CG.midgameAd(() => { briefN = n; showBrief(n); }); });
$('retryBtn').addEventListener('click', () => { const n = spec.n; CG.midgameAd(() => beginContract(n)); });
$('sumMenuBtn').addEventListener('click', toMenu);
$('failMenuBtn').addEventListener('click', toMenu);
$('resumeBtn').addEventListener('click', resumeGame);
$('quitBtn').addEventListener('click', toMenu);

/* ---------------- phone fit + viewport pinning ----------------
   The game is the entire page. #wrap is position:fixed and gets its
   height AND top offset from window.visualViewport, so mobile
   browser chrome (URL bars that show/hide on scroll) can never
   cover or shift any part of the game. Inside the pinned wrap, the
   stage is sized by width AND height with letterboxing — never
   cropped, never scrolling — in both orientations. Reserved space
   (HUD + control bar + tip) is measured live, so wrapped HUD rows
   on narrow phones are fine. */
function viewportSize() {
  const vv = (typeof window !== 'undefined' && window.visualViewport) || null;
  return {
    w: (vv && vv.width) || window.innerWidth || 0,
    h: (vv && vv.height) || window.innerHeight || 0,
    top: (vv && vv.offsetTop) || 0
  };
}
function pinViewport() {
  try {
    const wrapEl = $('wrap');
    const vs = viewportSize();
    if (wrapEl && window.visualViewport) {
      wrapEl.style.height = vs.h + 'px';
      wrapEl.style.top = vs.top + 'px';
    }
  } catch (e) { /* CSS 100dvh pin remains as the fallback */ }
  fitStage();
}
function fitStage() {
  try {
    const vs = viewportSize();
    if (!vs.w || !vs.h) return;
    const hudEl = $('hud'), ctrlEl = $('ctrlBar'), tipEl = $('tip'), stageEl = $('stage');
    const reserved = ((hudEl && hudEl.offsetHeight) || 0) + ((ctrlEl && ctrlEl.offsetHeight) || 0) + ((tipEl && tipEl.offsetHeight) || 0) + 34;
    const availW = Math.min(vs.w * 0.98, 1000);
    const availH = Math.max(190, vs.h - reserved);
    const w = Math.max(250, Math.min(availW, availH * (VIEW_W / VIEW_H)));
    const wpx = Math.floor(w) + 'px';
    if (stageEl) stageEl.style.width = wpx;
    if (hudEl) hudEl.style.width = wpx;
    if (ctrlEl) ctrlEl.style.width = wpx;
  } catch (e) { /* CSS min(97vw,1000px) remains as the fallback */ }
}
if (typeof window !== 'undefined' && window.visualViewport) {
  window.visualViewport.addEventListener('resize', pinViewport);
  window.visualViewport.addEventListener('scroll', pinViewport);
}
window.addEventListener('resize', pinViewport);
window.addEventListener('orientationchange', pinViewport);

/* ---------------- main loop + boot ---------------- */
let lastTs = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;
  update(dt);
  if (tutActive() && save.tutStep === 2) { tutWindT += dt; if (tutWindT > 3) tutEvent('windtime'); }
  render();
}
(async function boot() {
  CG.loadingStart();
  await CG.init();
  setupContract(save.unlocked);
  state = 'menu';
  showOnly(els.menu);
  refreshMenu();
  buildShop();
  pinViewport();
  setTimeout(pinViewport, 350);
  updateMute(); updateHUD();
  CG.loadingStop();
  requestAnimationFrame(frame);
})();

/* ---------------- debug / smoke-test handle ---------------- */
window.__deadeye = {
  get state() { return state; },
  get save() { return save; },
  get spec() { return spec; },
  get figures() { return figures; },
  get particles() { return particles; },
  get pools() { return pools; },
  spawnBlood, spawnPool, spawnDustPuff, updateEffects, spriteDefs: SPRITE_DEFS, figureSprite, spriteKeyFor,
  get score() { return score; },
  get kills() { return kills; },
  get headshots() { return headshots; },
  get ammo() { return ammo; },
  get breath() { return breath; },
  get integrity() { return integrity; },
  get wind() { return wind; },
  get zoomIdx() { return zoomIdx; },
  get camX() { return camX; },
  setWind(w) { wind = w; },
  setBreath(v) { breath = v; },
  setHolding(v) { holding = v; },
  setCoins(n) { save.coins = n; persist(); },
  setIntegrity(n) { integrity = n; },
  setupContract, beginContract, showBrief, fire, startReload,
  resolveShot, impactPoint, windDrift, swayAmp, swayOffset, aimPoint,
  headBox, bodyBox, figureHeight, setZoom, buyUpgrade, buySkin, buyReticle,
  applyHit, checkContractEnd, completeContract, failContract,
  hostilesTotal, hostilesDown, updateFigures, contractSpec, ladderSpec,
  tutStep: () => save.tutStep,
  tutDone: () => save.tutDone,
  tutEvent, finishTut, fitStage, pinViewport, viewportSize,
  CG
};
