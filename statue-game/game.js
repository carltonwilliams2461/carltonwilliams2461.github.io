"use strict";
/* ============================================================
   STATUE! — Haunted Museum (production build)
   A "freeze when watched" survival game in vanilla JS + Canvas.

   - 3 museum wings, sprite art, darkness + flashlight lighting,
     fog, synthesized sound (no audio files), localStorage progression.
   - CrazyGames SDK v3 is integrated through the CG wrapper below.
     Every SDK call is feature-detected and try/catch-guarded, so the
     game runs identically on a plain static host with no SDK present.
   ============================================================ */

/* ---------------- tiny helpers ---------------- */
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}
function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
  catch (e) { return fallback; }
}
function lsSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }

/* ---------------- persistent progression ---------------- */
const CONE_LEVELS = [0.96, 1.13, 1.31];        // half-angle radians (~55° / 65° / 75°)
const RANGE_LEVELS = [310, 348, 386];          // flashlight reach in px
const UPGRADE_COSTS = [200, 450];              // cost of lvl 0->1 and 1->2
const CHARACTERS = [
  { name: 'Scout', img: 'kid1', price: 0 },
  { name: 'Nova', img: 'kid2', price: 150 },
  { name: 'Finn', img: 'kid3', price: 300 }
];
const SAVE_KEY = 'statueSaveV1';
let save = { bank: 0, best: 0, cone: 0, batt: 0, char: 0, owned: [true, false, false], muted: false };
try {
  const raw = JSON.parse(lsGet(SAVE_KEY, 'null'));
  if (raw && typeof raw === 'object') {
    save.bank = raw.bank | 0; save.best = raw.best | 0;
    save.cone = clamp(raw.cone | 0, 0, 2); save.batt = clamp(raw.batt | 0, 0, 2);
    save.char = clamp(raw.char | 0, 0, 2);
    if (Array.isArray(raw.owned)) save.owned = [true, !!raw.owned[1], !!raw.owned[2]];
    save.muted = !!raw.muted;
    if (!save.owned[save.char]) save.char = 0;
  }
} catch (e) { /* corrupted save -> defaults */ }
function persist() { lsSet(SAVE_KEY, JSON.stringify(save)); }

/* ---------------- CrazyGames SDK v3 wrapper ----------------
   Docs: https://docs.crazygames.com/sdk/intro/ , /sdk/game/ , /sdk/video-ads/
   - init() must resolve before any other SDK call.
   - loadingStart/Stop bracket asset loading; the first gameplayStart
     marks the end of the measured initial download.
   - gameplayStart/Stop must bracket active gameplay (start, resume,
     revive, next level / stop on pause, menu, level end, before ads).
   - ad.requestAd('midgame', callbacks): mute + freeze in adStarted,
     restore in adFinished/adError. Midgame ads only at natural breaks.
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
let audioCtx = null, masterGain = null, musicGain = null, musicTimer = null;
let musicNodes = [], nextChordAt = 0, chordIdx = 0, nextPlinkAt = 0;
const CHORDS = [
  [110.00, 164.81, 220.00, 261.63],  // Am
  [87.31, 130.81, 174.61, 220.00],   // F
  [98.00, 146.83, 196.00, 246.94],   // G
  [82.41, 123.47, 164.81, 207.65]    // Em
];
const PLINKS = [440, 523.25, 587.33, 659.25, 783.99, 880];

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
      musicGain.gain.value = 0.5;
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
const sndCoin = () => { tone(950, 0.09, { type: 'sine', vol: 0.07 }); tone(1420, 0.14, { delay: 0.055, vol: 0.06 }); };
const sndStar = () => { [660, 880, 1108, 1479].forEach((f, i) => tone(f, 0.12, { delay: i * 0.07, type: 'triangle', vol: 0.07 })); };
const sndClick = () => tone(660, 0.05, { type: 'square', vol: 0.03 });
const sndDenied = () => tone(140, 0.18, { type: 'square', vol: 0.06, slideTo: 90 });
const sndUnlock = () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.16, { delay: i * 0.08, type: 'triangle', vol: 0.07 })); };
const sndJingle = () => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.22, { delay: i * 0.11, type: 'triangle', vol: 0.08 })); tone(1318.5, 0.4, { delay: 0.46, type: 'triangle', vol: 0.06 }); };
const sndCaught = () => { // jump-scare sting: dissonant cluster + noise + sub thump
  tone(110, 0.55, { type: 'sawtooth', vol: 0.16, lowpass: 900 });
  tone(116.5, 0.55, { type: 'sawtooth', vol: 0.16, lowpass: 900 });
  tone(55, 0.6, { type: 'sine', vol: 0.2, slideTo: 30 });
  noiseBurst(0.4, 0.12, 500);
};
function sndCreak(proximity) { // statue starting to move nearby: stone grinding
  const vol = clamp(0.02 + proximity * 0.09, 0.02, 0.11);
  tone(70 + Math.random() * 30, 0.5, { type: 'sawtooth', vol, lowpass: 300, slideTo: 42, attack: 0.08 });
  noiseBurst(0.3, vol * 0.5, 240);
}
/* ambient pad loop — scheduled from the main loop while playing */
function musicUpdate() {
  if (!audioCtx || !musicGain || state !== 'playing' && state !== 'caught') return;
  const now = audioCtx.currentTime;
  if (now >= nextChordAt) {
    const chord = CHORDS[chordIdx % CHORDS.length]; chordIdx++;
    nextChordAt = now + 4.2;
    for (const f of chord) {
      tone(f, 4.6, { type: 'triangle', vol: 0.028, attack: 1.4, music: true, lowpass: 700 });
      tone(f * 2, 4.6, { type: 'sine', vol: 0.008, attack: 1.8, music: true });
    }
  }
  if (now >= nextPlinkAt) { // sparse music-box notes — spooky music room vibe
    nextPlinkAt = now + 2.5 + Math.random() * 4.5;
    if (Math.random() < 0.75) tone(PLINKS[(Math.random() * PLINKS.length) | 0], 0.7, { type: 'sine', vol: 0.016, music: true });
  }
}

/* ---------------- DOM ---------------- */
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const scoreEl = $('score'), bankEl = $('bank'), heartsEl = $('hearts'),
  timeEl = $('time'), timebarEl = $('timebar'), levelNameEl = $('levelName');
const menuEl = $('menu'), shopEl = $('shop'), clearEl = $('clear'), overEl = $('over'),
  pausedEl = $('paused'), adveilEl = $('adveil');
const W = 960, H = 600, WALL = 26;

function setAdVeil(on) { adveilEl.classList.toggle('hidden', !on); }
function showOnly(el) {
  for (const o of [menuEl, shopEl, clearEl, overEl, pausedEl]) o.classList.toggle('hidden', o !== el);
  if (!el) for (const o of [menuEl, shopEl, clearEl, overEl, pausedEl]) o.classList.add('hidden');
}

/* ---------------- assets ---------------- */
const IMG = {};
const ASSET_LIST = ['kid1', 'kid2', 'kid3', 'statue', 'gargoyle'];
let frostCache = {};
function makeFrost(img) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = 'rgba(140,180,255,0.28)';
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over';
  return c;
}
function preloadAssets() {
  return Promise.all(ASSET_LIST.map(name => new Promise(res => {
    const img = new Image();
    img.onload = () => { IMG[name] = img; res(); };
    img.onerror = () => { IMG[name] = null; res(); }; // canvas fallback art if a file is missing
    img.src = 'assets/' + name + '.png';
  }))).then(() => {
    for (const n of ['statue', 'gargoyle']) if (IMG[n]) frostCache[n] = makeFrost(IMG[n]);
  });
}

/* ---------------- levels ----------------
   A run = endless nights. Each night visits the 3 wings in order;
   every new night remixes them harder (see escalation in startWing). */
const LEVELS = [
  {
    id: 'marble', name: 'Marble Hall', time: 60, baseSpeed: 82,
    floorA: '#2a2038', floorB: '#33264a', rug: '#4d2440', rugEdge: '#7a3a5e', frame: '#6b4f8f',
    obstacles: [
      { x: 150, y: 130, w: 110, h: 46, s: 'case' }, { x: 700, y: 130, w: 110, h: 46, s: 'case' },
      { x: 150, y: 424, w: 110, h: 46, s: 'case' }, { x: 700, y: 424, w: 110, h: 46, s: 'case' },
      { x: 425, y: 277, w: 110, h: 46, s: 'case' }
    ],
    spawns: [{ x: 90, y: 90 }, { x: 870, y: 90 }, { x: 90, y: 510 }, { x: 870, y: 510 }],
    extraSpawns: [{ x: 480, y: 84 }, { x: 480, y: 516 }, { x: 84, y: 300 }],
    mix: () => 'angel'
  },
  {
    id: 'egypt', name: 'Egyptian Wing', time: 60, baseSpeed: 88,
    floorA: '#22333a', floorB: '#2b4046', rug: '#54451f', rugEdge: '#a8842c', frame: '#8f7a4f',
    obstacles: [
      { x: 120, y: 118, w: 150, h: 54, s: 'tomb' }, { x: 690, y: 118, w: 150, h: 54, s: 'tomb' },
      { x: 120, y: 428, w: 150, h: 54, s: 'tomb' }, { x: 690, y: 428, w: 150, h: 54, s: 'tomb' },
      { x: 405, y: 148, w: 150, h: 44, s: 'tomb' }, { x: 405, y: 408, w: 150, h: 44, s: 'tomb' },
      { x: 292, y: 278, w: 58, h: 44, s: 'pillar' }, { x: 610, y: 278, w: 58, h: 44, s: 'pillar' }
    ],
    spawns: [{ x: 80, y: 80 }, { x: 880, y: 80 }, { x: 80, y: 520 }, { x: 880, y: 520 }, { x: 480, y: 84 }],
    extraSpawns: [{ x: 196, y: 300 }, { x: 764, y: 300 }, { x: 480, y: 516 }],
    mix: i => (i === 4 ? 'gargoyle' : 'angel')
  },
  {
    id: 'crypt', name: 'Gargoyle Crypt', time: 55, baseSpeed: 94,
    floorA: '#1b1826', floorB: '#251f33', rug: '#3d1520', rugEdge: '#7e2436', frame: '#5f4a6e',
    obstacles: [
      { x: 140, y: 108, w: 54, h: 128, s: 'crypt' }, { x: 766, y: 108, w: 54, h: 128, s: 'crypt' },
      { x: 140, y: 364, w: 54, h: 128, s: 'crypt' }, { x: 766, y: 364, w: 54, h: 128, s: 'crypt' },
      { x: 330, y: 138, w: 300, h: 44, s: 'crypt' }, { x: 330, y: 418, w: 300, h: 44, s: 'crypt' },
      { x: 430, y: 277, w: 100, h: 46, s: 'crypt' }
    ],
    spawns: [{ x: 72, y: 72 }, { x: 888, y: 72 }, { x: 72, y: 528 }, { x: 888, y: 528 }, { x: 480, y: 76 }, { x: 480, y: 524 }],
    extraSpawns: [{ x: 250, y: 300 }, { x: 710, y: 300 }, { x: 250, y: 76 }],
    mix: i => (i % 2 ? 'gargoyle' : 'angel')
  }
];
const STATUE_CONF = {
  angel: { img: 'statue', r: 17, drawH: 64, speedMul: 1.0, eyes: [[0.440, 0.348], [0.565, 0.348]], eyeColor: '#ff4040' },
  gargoyle: { img: 'gargoyle', r: 15, drawH: 56, speedMul: 1.18, eyes: [[0.300, 0.365], [0.452, 0.372]], eyeColor: '#ffb02e' }
};

/* ---------------- game state ---------------- */
let state = 'boot'; // boot | menu | playing | paused | caught | clear | adbreak | over
let levelIdx = 0, night = 1, level = LEVELS[0], levelTime = 60;
let score = 0, lives = 3, runCoins = 0, coinsCollected = 0;
let timeLeft = 60, elapsed = 0, invulnTimer = 0, caughtTimer = 0, bannerTimer = 0, shake = 0;
let catcher = null, wingCoinsStart = 0;
let statues = [], coin = null, popups = [];
const player = { x: W / 2, y: H - 110, r: 15, speed: 238, face: -Math.PI / 2, walk: 0, moving: false };
let sdkPlaying = false;
function cgStart() { if (!sdkPlaying) { CG.gameplayStart(); sdkPlaying = true; } }
function cgStop() { if (sdkPlaying) { CG.gameplayStop(); sdkPlaying = false; } }

/* fog blobs */
const fogs = [];
for (let i = 0; i < 7; i++) {
  fogs.push({ x: Math.random() * W, y: Math.random() * H, s: 0.7 + Math.random() * 1.1, v: 4 + Math.random() * 7, a: 0.04 + Math.random() * 0.05 });
}

/* ---------------- geometry (vs. current level) ---------------- */
function segSeg(px, py, qx, qy, rx, ry, sx, sy) {
  const d1x = qx - px, d1y = qy - py, d2x = sx - rx, d2y = sy - ry;
  const den = d1x * d2y - d1y * d2x;
  if (den === 0) return false;
  const t = ((rx - px) * d2y - (ry - py) * d2x) / den;
  const u = ((rx - px) * d1y - (ry - py) * d1x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
function segHitsRect(x1, y1, x2, y2, r) {
  if (x1 >= r.x && x1 <= r.x + r.w && y1 >= r.y && y1 <= r.y + r.h) return true;
  if (x2 >= r.x && x2 <= r.x + r.w && y2 >= r.y && y2 <= r.y + r.h) return true;
  return segSeg(x1, y1, x2, y2, r.x, r.y, r.x + r.w, r.y) ||
         segSeg(x1, y1, x2, y2, r.x + r.w, r.y, r.x + r.w, r.y + r.h) ||
         segSeg(x1, y1, x2, y2, r.x + r.w, r.y + r.h, r.x, r.y + r.h) ||
         segSeg(x1, y1, x2, y2, r.x, r.y + r.h, r.x, r.y);
}
function losClear(x1, y1, x2, y2) {
  for (const o of level.obstacles) if (segHitsRect(x1, y1, x2, y2, o)) return false;
  return true;
}
function viewRange() { return RANGE_LEVELS[save.batt]; }
function viewHalf() { return CONE_LEVELS[save.cone]; }
function isObserved(s) {
  const d = Math.sqrt(dist2(player.x, player.y, s.x, s.y));
  if (d > viewRange()) return false;
  const ang = Math.atan2(s.y - player.y, s.x - player.x);
  if (angleDiff(ang, player.face) > viewHalf()) return false;
  return losClear(player.x, player.y, s.x, s.y);
}
function collide(e) {
  e.x = clamp(e.x, WALL + e.r, W - WALL - e.r);
  e.y = clamp(e.y, WALL + e.r, H - WALL - e.r);
  for (const o of level.obstacles) {
    const nx = clamp(e.x, o.x, o.x + o.w), ny = clamp(e.y, o.y, o.y + o.h);
    const dx = e.x - nx, dy = e.y - ny, d2 = dx * dx + dy * dy;
    if (d2 < e.r * e.r) {
      if (d2 === 0) { e.y = o.y - e.r; continue; }
      const d = Math.sqrt(d2), push = (e.r - d) / d;
      e.x += dx * push; e.y += dy * push;
    }
  }
}
function pointFree(x, y, pad) {
  if (x < WALL + pad || x > W - WALL - pad || y < WALL + pad || y > H - WALL - pad) return false;
  for (const o of level.obstacles) {
    if (x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad) return false;
  }
  return true;
}

/* ---------------- flow ---------------- */
function makeStatues(nightNum) {
  const pool = level.spawns.concat(level.extraSpawns);
  const extra = Math.min(pool.length, level.spawns.length + (nightNum - 1));
  const speedMul = Math.min(1.75, 1 + 0.13 * (nightNum - 1));
  const out = [];
  for (let i = 0; i < extra; i++) {
    const type = level.mix(i);
    const conf = STATUE_CONF[type];
    out.push({
      x: pool[i].x, y: pool[i].y, sx: pool[i].x, sy: pool[i].y,
      r: conf.r, type, conf,
      speed: (level.baseSpeed + i * 4) * conf.speedMul * speedMul,
      observed: false, wobble: Math.random() * Math.PI * 2,
      wasMoving: false, creakCd: Math.random() * 2
    });
  }
  return out;
}
function resetPositions() {
  player.x = W / 2; player.y = H - 110; player.face = -Math.PI / 2;
  statues = makeStatues(night);
  invulnTimer = 1.0;
}
function spawnCoin() {
  const star = (coinsCollected % 5 === 4);
  for (let tries = 0; tries < 220; tries++) {
    const x = WALL + 30 + Math.random() * (W - 2 * WALL - 60);
    const y = WALL + 30 + Math.random() * (H - 2 * WALL - 60);
    if (!pointFree(x, y, 20)) continue;
    if (dist2(x, y, player.x, player.y) < 90 * 90) continue;
    let ok = true;
    for (const s of statues) if (dist2(x, y, s.x, s.y) < 70 * 70) { ok = false; break; }
    if (!ok) continue;
    coin = { x, y, r: star ? 15 : 12, star, spin: Math.random() * Math.PI * 2 };
    return;
  }
  coin = { x: W / 2, y: 90, r: 12, star: false, spin: 0 };
}
function startRun() {
  ensureAudio(); sndClick();
  score = 0; lives = 3; runCoins = 0; night = 1;
  showOnly(null);
  startWing(0);
}
function startWing(idx) {
  levelIdx = idx;
  level = LEVELS[idx];
  levelTime = Math.max(38, level.time - 4 * (night - 1));
  timeLeft = levelTime;
  elapsed = 0; coinsCollected = 0; popups = [];
  wingCoinsStart = runCoins;
  resetPositions();
  spawnCoin();
  bannerTimer = 1.7;
  state = 'playing';
  showOnly(null);
  syncHud();
  cgStart();
}
function onCaught(s) {
  lives--;
  catcher = s;
  shake = 16;
  sndCaught();
  state = 'caught';
  caughtTimer = 1.45;
  cgStop();
  syncHud();
}
function endRun() {
  state = 'over';
  cgStop();
  if (score > save.best) save.best = score;
  if (night > (save.bestNight || 0)) save.bestNight = night;
  persist();
  $('overTitle').textContent = night > 1 || levelIdx > 0 ? 'The Statues Got You!' : 'The Statues Got You!';
  $('finalScore').textContent = 'Score: ' + score;
  $('runCoins').textContent = '🪙 Gold grabbed this run: ' + runCoins +
    ' · You reached Night ' + night + ', ' + level.name;
  $('bestScore').textContent = 'Best score: ' + save.best + ' · Best night: ' + (save.bestNight || 1);
  showOnly(overEl);
  syncMenuInfo();
}
function wingCleared() {
  state = 'clear';
  score += 150;
  sndJingle();
  cgStop();
  CG.happytime();
  const isNightEnd = levelIdx === LEVELS.length - 1;
  $('clearTitle').textContent = isNightEnd ? '🌙 You Survived Night ' + night + '!' : level.name + ' Cleared!';
  $('clearStats').textContent =
    'Wing bonus: +150 pts · Gold this wing: ' + (runCoins - wingCoinsStart) +
    ' · Score: ' + score + (isNightEnd ? ' · The museum resets… darker, faster, hungrier.' : '');
  $('nextBtn').textContent = isNightEnd ? 'Start Night ' + (night + 1) + ' ▶' : 'Next Wing ▶';
  showOnly(clearEl);
  syncHud();
}
function advanceWing() {
  ensureAudio(); sndClick();
  const isNightEnd = levelIdx === LEVELS.length - 1;
  showOnly(null);
  if (isNightEnd) {
    night++;
    state = 'adbreak'; // natural break between nights — the midgame ad slot
    CG.midgameAd(() => startWing(0));
  } else {
    startWing(levelIdx + 1);
  }
}
function toMenu() {
  sndClick();
  cgStop();
  state = 'menu';
  showOnly(menuEl);
  syncMenuInfo();
  renderShop();
}
function togglePause(force) {
  if (state === 'playing' && force !== false) {
    state = 'paused'; cgStop(); showOnly(pausedEl);
  } else if (state === 'paused' && force !== true) {
    state = 'playing'; showOnly(null); cgStart();
  }
}
function syncMenuInfo() {
  $('menuBest').textContent = '🏆 Best score: ' + save.best +
    ' · 🌙 Best night: ' + (save.bestNight || 1) + ' · 🪙 Gold bank: ' + save.bank;
}
function syncHud() {
  scoreEl.textContent = score;
  bankEl.textContent = save.bank;
  heartsEl.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
  timeEl.textContent = Math.ceil(timeLeft);
  timebarEl.style.width = clamp(timeLeft / levelTime * 100, 0, 100) + '%';
  levelNameEl.textContent = (night > 1 ? 'NIGHT ' + night + ' · ' : '') + level.name.toUpperCase();
}

/* ---------------- shop ---------------- */
function pips(lvl) { return '●'.repeat(lvl) + '○'.repeat(2 - lvl); }
function renderShop() {
  const grid = $('shopGrid');
  grid.innerHTML = '';
  const mk = (html) => { const d = document.createElement('div'); d.className = 'shopitem'; d.innerHTML = html; return d; };
  const btn = (label, disabled, cls) => {
    const b = document.createElement('button');
    b.className = 'buybtn' + (cls ? ' ' + cls : '');
    b.textContent = label; b.disabled = !!disabled;
    return b;
  };
  // flashlight cone
  {
    const maxed = save.cone >= 2, cost = maxed ? null : UPGRADE_COSTS[save.cone];
    const el = mk('<div class="info"><b>🔦 Wider Light Beam</b> <span class="pips">' + pips(save.cone) + '</span>' +
      '<div>Your flashlight cone grows: 110° → 130° → 150°. Freeze statues earlier, from more angles.</div></div>');
    const b = btn(maxed ? 'MAX' : '🪙 ' + cost, maxed || save.bank < cost);
    b.addEventListener('click', () => buyUpgrade('cone'));
    el.appendChild(b); grid.appendChild(el);
  }
  // battery / range
  {
    const maxed = save.batt >= 2, cost = maxed ? null : UPGRADE_COSTS[save.batt];
    const el = mk('<div class="info"><b>🔋 Stronger Lantern</b> <span class="pips">' + pips(save.batt) + '</span>' +
      '<div>Your light reaches farther through the dark: more warning before a statue is on you.</div></div>');
    const b = btn(maxed ? 'MAX' : '🪙 ' + cost, maxed || save.bank < cost);
    b.addEventListener('click', () => buyUpgrade('batt'));
    el.appendChild(b); grid.appendChild(el);
  }
  // characters
  CHARACTERS.forEach((c, i) => {
    const owned = save.owned[i], selected = save.char === i;
    const el = mk('<img src="assets/' + c.img + '.png" alt="">' +
      '<div class="info"><b>' + c.name + '</b><div>' +
      (i === 0 ? 'The first explorer. Brave, curious, slightly underdressed for a haunting.' :
       i === 1 ? 'Runs toward the spooky noises. Nobody knows why.' :
                'Has read every plaque in the museum. Twice.') + '</div></div>');
    const b = selected ? btn('Selected', true, 'selected')
      : owned ? btn('Select', false)
      : btn('🪙 ' + c.price, save.bank < c.price);
    b.addEventListener('click', () => {
      if (!save.owned[i]) {
        if (save.bank < c.price) { sndDenied(); return; }
        save.bank -= c.price; save.owned[i] = true; sndUnlock();
      } else sndClick();
      save.char = i; persist(); renderShop(); syncHud();
    });
    el.appendChild(b); grid.appendChild(el);
  });
}
function buyUpgrade(kind) {
  const lvl = save[kind];
  if (lvl >= 2) { sndDenied(); return; }
  const cost = UPGRADE_COSTS[lvl];
  if (save.bank < cost) { sndDenied(); return; }
  save.bank -= cost; save[kind] = lvl + 1;
  sndUnlock(); persist(); renderShop(); syncHud();
}

/* ---------------- input ---------------- */
const keys = {};
window.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys[e.key.toLowerCase()] = true;
  ensureAudio();
  if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    if (state === 'playing' || state === 'paused') togglePause();
  }
  if (e.key === ' ' || e.key === 'Enter') {
    if (state === 'menu') startRun();
    else if (state === 'over') startRun();
  }
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
window.addEventListener('pointerdown', () => ensureAudio(), { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') { // silent auto-pause (no SDK event on focus loss, per docs)
    state = 'paused'; showOnly(pausedEl);
  }
});

const joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
function toLogical(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: (ev.clientX - r.left) * W / r.width, y: (ev.clientY - r.top) * H / r.height };
}
canvas.addEventListener('pointerdown', ev => {
  ensureAudio();
  if (state !== 'playing') return;
  const p = toLogical(ev);
  joy.active = true; joy.id = ev.pointerId; joy.ox = p.x; joy.oy = p.y; joy.dx = 0; joy.dy = 0;
  try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
});
canvas.addEventListener('pointermove', ev => {
  if (!joy.active || ev.pointerId !== joy.id) return;
  const p = toLogical(ev);
  let dx = p.x - joy.ox, dy = p.y - joy.oy;
  const len = Math.hypot(dx, dy), max = 55;
  if (len > max) { dx = dx / len * max; dy = dy / len * max; }
  joy.dx = dx / max; joy.dy = dy / max;
});
function joyEnd(ev) { if (ev.pointerId === joy.id) { joy.active = false; joy.dx = 0; joy.dy = 0; } }
canvas.addEventListener('pointerup', joyEnd);
canvas.addEventListener('pointercancel', joyEnd);

function inputVector() {
  let x = 0, y = 0;
  if (keys['arrowleft'] || keys['a']) x -= 1;
  if (keys['arrowright'] || keys['d']) x += 1;
  if (keys['arrowup'] || keys['w']) y -= 1;
  if (keys['arrowdown'] || keys['s']) y += 1;
  if (x === 0 && y === 0 && joy.active) { x = joy.dx; y = joy.dy; }
  const len = Math.hypot(x, y);
  if (len > 1) { x /= len; y /= len; }
  return { x, y };
}

/* buttons */
$('startBtn').addEventListener('click', startRun);
$('shopBtn').addEventListener('click', () => { ensureAudio(); sndClick(); renderShop(); showOnly(shopEl); });
$('shopBackBtn').addEventListener('click', () => toMenu());
$('shopPlayBtn').addEventListener('click', startRun);
$('nextBtn').addEventListener('click', advanceWing);
$('clearMenuBtn').addEventListener('click', toMenu);
$('againBtn').addEventListener('click', startRun);
$('overMenuBtn').addEventListener('click', toMenu);
$('resumeBtn').addEventListener('click', () => { ensureAudio(); togglePause(false); });
$('pausedMenuBtn').addEventListener('click', toMenu);
$('pauseBtn').addEventListener('click', () => { if (state === 'playing' || state === 'paused') togglePause(); });
$('muteBtn').addEventListener('click', () => {
  save.muted = !save.muted; persist();
  if (!save.muted) ensureAudio();
  updateMute();
});

/* ---------------- update ---------------- */
function update(dt) {
  for (const f of fogs) {
    f.x += f.v * dt;
    if (f.x - 160 * f.s > W) { f.x = -160 * f.s; f.y = Math.random() * H; }
  }
  musicUpdate();
  if (state === 'caught') {
    caughtTimer -= dt;
    shake = Math.max(0, shake - dt * 11);
    if (caughtTimer <= 0) {
      if (lives > 0) {
        resetPositions();
        spawnCoin();
        state = 'playing';
        cgStart(); // resume after revive — per SDK guidance, gameplay resumes here
      } else {
        endRun();
      }
    }
    return;
  }
  if (state !== 'playing') return;

  elapsed += dt;
  timeLeft -= dt;
  if (bannerTimer > 0) bannerTimer -= dt;
  if (invulnTimer > 0) invulnTimer -= dt;
  if (timeLeft <= 0) { timeLeft = 0; syncHud(); wingCleared(); return; }

  // player movement
  const v = inputVector();
  player.moving = Math.hypot(v.x, v.y) > 0.12;
  if (player.moving) {
    player.x += v.x * player.speed * dt;
    player.y += v.y * player.speed * dt;
    player.face = Math.atan2(v.y, v.x);
    player.walk += dt * 11;
    collide(player);
  }

  // statues
  const rampMul = Math.min(1.6, 1 + 0.15 * (night - 1)) * clamp(elapsed / 6, 0.25, 1);
  for (const s of statues) {
    s.observed = isObserved(s);
    s.creakCd -= dt;
    if (!s.observed && !s.wasMoving) {
      const d = Math.sqrt(dist2(s.x, s.y, player.x, player.y));
      if (d < 320 && s.creakCd <= 0) { sndCreak(d); s.creakCd = 2.5 + Math.random(); }
    }
    s.wasMoving = !s.observed;
    if (!s.observed) {
      const dx = player.x - s.x, dy = player.y - s.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = s.speed * rampMul;
      s.x += dx / d * sp * dt;
      s.y += dy / d * sp * dt;
      s.wobble += dt * 7;
      for (const o of statues) {
        if (o === s) continue;
        const ox = s.x - o.x, oy = s.y - o.y, od = Math.hypot(ox, oy);
        const min = s.r + o.r + 4;
        if (od > 0 && od < min) { s.x += ox / od * (min - od) * 0.5; s.y += oy / od * (min - od) * 0.5; }
      }
      collide(s);
    }
    if (invulnTimer <= 0 && dist2(s.x, s.y, player.x, player.y) < (s.r + player.r - 2) * (s.r + player.r - 2)) {
      onCaught(s);
      return;
    }
  }

  // coin
  if (coin) {
    coin.spin += dt * 3.2;
    if (dist2(coin.x, coin.y, player.x, player.y) < (player.r + coin.r + 4) * (player.r + coin.r + 4)) {
      const val = coin.star ? 5 : 1;
      runCoins += val;
      save.bank += val;               // gold banks immediately and persists across runs
      score += coin.star ? 50 : 10;
      coinsCollected++;
      popups.push({ x: coin.x, y: coin.y - 16, text: coin.star ? '+5 ⭐' : '+1 🪙', color: coin.star ? '#ffe066' : '#ffd76a', t: 0 });
      sndCoin(coin.star);
      if (score > save.best) save.best = score;
      persist();
      spawnCoin();
      syncHud();
    }
  }
  for (const p of popups) { p.t += dt; p.y -= dt * 34; }
  popups = popups.filter(p => p.t < 0.9);
  syncHud();
}

/* ---------------- rendering ---------------- */
const darkC = document.createElement('canvas'); darkC.width = W; darkC.height = H;
const dctx = darkC.getContext('2d');
const fogSprite = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, 'rgba(200,200,220,0.55)');
  gr.addColorStop(1, 'rgba(200,200,220,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return c;
})();

function drawStar(g, x, y, r, rot) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.48;
    const a = rot + i * Math.PI / 5 - Math.PI / 2;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
  }
  g.closePath();
}

function drawRoom(g) {
  for (let ty = 0; ty < H / 40; ty++) for (let tx = 0; tx < W / 40; tx++) {
    g.fillStyle = (tx + ty) % 2 ? level.floorA : level.floorB;
    g.fillRect(tx * 40, ty * 40, 40, 40);
  }
  g.fillStyle = level.rug;
  g.fillRect(W / 2 - 210, H / 2 - 150, 420, 300);
  g.strokeStyle = level.rugEdge; g.lineWidth = 5;
  g.strokeRect(W / 2 - 210, H / 2 - 150, 420, 300);
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.strokeRect(W / 2 - 186, H / 2 - 126, 372, 252);
  // wall
  g.fillStyle = '#171021';
  g.fillRect(0, 0, W, WALL); g.fillRect(0, H - WALL, W, WALL);
  g.fillRect(0, 0, WALL, H); g.fillRect(W - WALL, 0, WALL, H);
  g.strokeStyle = '#4a3566'; g.lineWidth = 3;
  g.strokeRect(WALL - 2, WALL - 2, W - 2 * WALL + 4, H - 2 * WALL + 4);
  // paintings on the top wall
  const px = [190, 452, 714];
  for (let i = 0; i < 3; i++) {
    g.fillStyle = level.frame; g.fillRect(px[i], 3, 56, 20);
    g.fillStyle = i === 1 ? '#31435f' : '#3d2b52'; g.fillRect(px[i] + 4, 6, 48, 14);
    g.fillStyle = 'rgba(240,230,200,0.75)';
    if (i === 0) { g.beginPath(); g.arc(px[i] + 16, 13, 4.5, 0, 7); g.fill(); }
    if (i === 1) { g.beginPath(); g.moveTo(px[i] + 10, 19); g.lineTo(px[i] + 26, 7); g.lineTo(px[i] + 42, 19); g.closePath(); g.fill(); }
    if (i === 2) drawStar(g, px[i] + 40, 13, 5, 0), g.fill();
  }
  for (const o of level.obstacles) drawObstacle(g, o);
}

function drawObstacle(g, o) {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(o.x + 3, o.y + 5, o.w, o.h);
  if (o.s === 'case') {
    g.fillStyle = '#3a2c1c'; g.fillRect(o.x, o.y, o.w, o.h);
    g.fillStyle = '#b9d6e8'; g.fillRect(o.x + 5, o.y + 5, o.w - 10, o.h - 16);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(o.x + 8, o.y + 7, o.w * 0.4, 5);
    g.fillStyle = '#8a6d3b'; g.fillRect(o.x, o.y + o.h - 9, o.w, 9);
    g.fillStyle = '#e8c95a';
    g.beginPath(); g.arc(o.x + o.w / 2, o.y + o.h / 2 - 3, 6, 0, 7); g.fill();
  } else if (o.s === 'tomb') {
    g.fillStyle = '#6e5a2e'; g.fillRect(o.x, o.y, o.w, o.h);
    g.fillStyle = '#c9a227'; g.fillRect(o.x + 4, o.y + 4, o.w - 8, o.h - 8);
    g.fillStyle = '#54451f'; g.fillRect(o.x + 9, o.y + 9, o.w - 18, o.h - 18);
    g.fillStyle = '#e8c95a';
    g.beginPath(); g.arc(o.x + o.w / 2, o.y + o.h / 2, 8, 0, 7); g.fill();
    g.fillRect(o.x + o.w / 2 - 2, o.y + 6, 4, o.h - 12);
  } else if (o.s === 'pillar') {
    g.fillStyle = '#4d4458'; g.fillRect(o.x, o.y, o.w, o.h);
    g.fillStyle = '#6a5f7d'; g.fillRect(o.x + 6, o.y + 6, o.w - 12, o.h - 12);
    g.strokeStyle = '#332b40'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(o.x + o.w / 2, o.y + 4); g.lineTo(o.x + o.w / 2, o.y + o.h - 4); g.stroke();
  } else { // crypt slab
    g.fillStyle = '#3b3548'; g.fillRect(o.x, o.y, o.w, o.h);
    g.fillStyle = '#57506b'; g.fillRect(o.x + 4, o.y + 4, o.w - 8, o.h - 8);
    g.strokeStyle = '#241f31'; g.lineWidth = 2;
    g.strokeRect(o.x + 10, o.y + 10, o.w - 20, o.h - 20);
    g.fillStyle = '#241f31';
    g.font = 'bold 13px Georgia, serif'; g.textAlign = 'center';
    g.fillText('R·I·P', o.x + o.w / 2, o.y + o.h / 2 + 5);
  }
}

function drawCoinEntity(g) {
  if (!coin) return;
  const sq = Math.abs(Math.cos(coin.spin));
  g.save();
  g.translate(coin.x, coin.y + Math.sin(coin.spin * 1.4) * 2.5);
  if (coin.star) {
    g.shadowColor = '#ffe066'; g.shadowBlur = 14;
    g.fillStyle = '#ffd93b';
    drawStar(g, 0, 0, coin.r, coin.spin * 0.4); g.fill();
    g.shadowBlur = 0; g.fillStyle = '#fff3b0';
    drawStar(g, 0, 0, coin.r * 0.55, coin.spin * 0.4); g.fill();
  } else {
    g.shadowColor = '#ffd76a'; g.shadowBlur = 12;
    g.fillStyle = '#f5b93f';
    g.beginPath(); g.ellipse(0, 0, Math.max(2.5, coin.r * sq), coin.r, 0, 0, 7); g.fill();
    g.shadowBlur = 0; g.fillStyle = '#ffe9a8';
    g.beginPath(); g.ellipse(0, 0, Math.max(1.5, coin.r * 0.6 * sq), coin.r * 0.6, 0, 0, 7); g.fill();
  }
  g.restore();
  // sparkle twinkle
  const tw = (Math.sin(coin.spin * 2.3) + 1) / 2;
  g.strokeStyle = 'rgba(255,240,180,' + (0.25 + tw * 0.55) + ')';
  g.lineWidth = 2;
  const sx = coin.x + 13, sy = coin.y - 13, r2 = 3 + tw * 3;
  g.beginPath();
  g.moveTo(sx - r2, sy); g.lineTo(sx + r2, sy);
  g.moveTo(sx, sy - r2); g.lineTo(sx, sy + r2);
  g.stroke();
}

function spriteBox(img, cx, feetY, drawH) {
  const w = drawH * img.width / img.height;
  return { x: cx - w / 2, y: feetY - drawH, w, h: drawH };
}
function drawPlayer(g) {
  const img = IMG[CHARACTERS[save.char].img];
  const bob = player.moving ? Math.abs(Math.sin(player.walk)) * 3.2 : Math.sin(performance.now() / 600) * 0.8;
  const feetY = player.y + player.r + 5 - bob;
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.beginPath(); g.ellipse(player.x, player.y + player.r + 4, 15, 5, 0, 0, 7); g.fill();
  if (invulnTimer > 0 && Math.floor(performance.now() / 110) % 2 === 0) g.globalAlpha = 0.45;
  if (img) {
    const b = spriteBox(img, player.x, feetY, 58);
    g.save();
    g.translate(player.x, feetY);
    g.rotate(player.moving ? Math.sin(player.walk) * 0.055 : 0);
    g.translate(-player.x, -feetY);
    g.drawImage(img, b.x, b.y, b.w, b.h);
    g.restore();
  } else {
    g.fillStyle = '#2ec4b6';
    g.beginPath(); g.arc(player.x, player.y, player.r, 0, 7); g.fill();
    g.fillStyle = '#e63946';
    g.beginPath(); g.arc(player.x, player.y - 5, 9, Math.PI, 0); g.fill();
  }
  g.globalAlpha = 1;
}
function drawStatueBody(g, s) {
  const img = IMG[s.conf.img];
  const moving = !s.observed;
  const bob = moving ? Math.abs(Math.sin(s.wobble)) * 2.4 : 0;
  const feetY = s.y + s.r + 6 - bob;
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.beginPath(); g.ellipse(s.x, s.y + s.r + 5, s.r + 3, 5.5, 0, 0, 7); g.fill();
  if (img) {
    const b = spriteBox(img, s.x, feetY, s.conf.drawH);
    g.save();
    if (moving) {
      g.translate(s.x, feetY);
      g.rotate(Math.sin(s.wobble * 0.8) * 0.075);
      g.translate(-s.x, -feetY);
    }
    g.drawImage(moving || !frostCache[s.conf.img] ? img : frostCache[s.conf.img], b.x, b.y, b.w, b.h);
    g.restore();
    s.box = b;
  } else {
    g.fillStyle = moving ? '#cfd6dd' : '#8fa8c8';
    g.beginPath(); g.arc(s.x, s.y, s.r, 0, 7); g.fill();
    s.box = { x: s.x - s.r, y: s.y - s.r, w: s.r * 2, h: s.r * 2 };
  }
  // frozen eye-slits (drawn in the lit world pass; frozen statues sit inside the beam)
  if (!moving && s.box) {
    g.strokeStyle = 'rgba(20,20,35,0.85)'; g.lineWidth = 2;
    for (const [fx, fy] of s.conf.eyes) {
      const ex = s.box.x + fx * s.box.w, ey = s.box.y + fy * s.box.h;
      g.beginPath(); g.moveTo(ex - 3.4, ey); g.lineTo(ex + 3.4, ey); g.stroke();
    }
  }
}
function drawEyesGlow(g) {
  for (const s of statues) {
    if (s.observed || !s.box) continue; // only creeping statues show burning eyes in the dark
    g.save();
    g.shadowColor = s.conf.eyeColor; g.shadowBlur = 13;
    g.fillStyle = s.conf.eyeColor;
    for (const [fx, fy] of s.conf.eyes) {
      g.beginPath();
      g.arc(s.box.x + fx * s.box.w, s.box.y + fy * s.box.h, 2.7, 0, 7);
      g.fill();
    }
    g.restore();
  }
}

function buildDarkness() {
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  dctx.globalCompositeOperation = 'source-over';
  dctx.clearRect(0, 0, W, H);
  dctx.fillStyle = 'rgba(5,3,13,0.93)';
  dctx.fillRect(0, 0, W, H);
  dctx.globalCompositeOperation = 'destination-out';
  const punch = (x, y, r, a) => {
    const gr = dctx.createRadialGradient(x, y, 4, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,' + a + ')');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = gr;
    dctx.beginPath(); dctx.arc(x, y, r, 0, 7); dctx.fill();
  };
  // flashlight cone
  const range = viewRange(), half = viewHalf();
  const grad = dctx.createRadialGradient(player.x, player.y, 8, player.x, player.y, range);
  grad.addColorStop(0, 'rgba(0,0,0,0.99)');
  grad.addColorStop(0.72, 'rgba(0,0,0,0.88)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  dctx.fillStyle = grad;
  dctx.beginPath();
  dctx.moveTo(player.x, player.y);
  dctx.arc(player.x, player.y, range, player.face - half, player.face + half);
  dctx.closePath(); dctx.fill();
  punch(player.x, player.y, 74, 0.62); // pool of light around the player
  if (coin) punch(coin.x, coin.y, 34, 0.5); // treasure glints through the dark
  for (const s of statues) if (!s.observed) punch(s.x, s.y, 30, 0.30); // creepers disturb the dark
}

function draw() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (state === 'caught' && catcher) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }
  drawRoom(ctx);
  drawCoinEntity(ctx);
  for (const s of statues) drawStatueBody(ctx, s);
  drawPlayer(ctx);

  if (state !== 'menu') {
    buildDarkness();
    ctx.drawImage(darkC, 0, 0);
    drawEyesGlow(ctx);
    // coin glint above the dark
    if (coin) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + 0.25 * Math.sin(coin.spin * 2.3);
      ctx.fillStyle = '#ffedb5';
      ctx.beginPath(); ctx.arc(coin.x, coin.y, 6, 0, 7); ctx.fill();
      ctx.restore();
    }
  }
  // drifting fog
  for (const f of fogs) {
    ctx.globalAlpha = f.a;
    ctx.drawImage(fogSprite, f.x - 128 * f.s, f.y - 128 * f.s, 256 * f.s, 256 * f.s);
  }
  ctx.globalAlpha = 1;
  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.78);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.52)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

  for (const p of popups) {
    ctx.globalAlpha = 1 - p.t / 0.9;
    ctx.font = 'bold 19px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.globalAlpha = 1;

  if (state === 'playing' && bannerTimer > 0) {
    ctx.globalAlpha = Math.min(1, bannerTimer / 0.7);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 40px Georgia, serif';
    ctx.fillText(level.name.toUpperCase(), W / 2, 108);
    ctx.font = 'bold 19px system-ui, sans-serif';
    ctx.fillStyle = '#cbb8ff';
    ctx.fillText(night > 1 ? '— NIGHT ' + night + ' —' : 'watch the statues. freeze them with your light.', W / 2, 138);
    ctx.globalAlpha = 1;
  }

  // touch joystick
  if (joy.active) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 46, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.arc(joy.ox + joy.dx * 32, joy.oy + joy.dy * 32, 19, 0, 7); ctx.fill();
  }

  // jump scare
  if (state === 'caught' && catcher) {
    const t = 1 - caughtTimer / 1.45; // 0 → 1
    ctx.fillStyle = 'rgba(90,0,10,' + (0.25 + 0.3 * Math.sin(t * Math.PI)) + ')';
    ctx.fillRect(0, 0, W, H);
    const img = IMG[catcher.conf.img];
    if (img) {
      const bigH = 240 + t * 190;
      const b = spriteBox(img, W / 2, H / 2 + bigH / 2, bigH);
      ctx.drawImage(img, b.x, b.y, b.w, b.h);
      ctx.save();
      ctx.shadowColor = catcher.conf.eyeColor; ctx.shadowBlur = 26;
      ctx.fillStyle = catcher.conf.eyeColor;
      for (const [fx, fy] of catcher.conf.eyes) {
        ctx.beginPath(); ctx.arc(b.x + fx * b.w, b.y + fy * b.h, 6 + t * 5, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5560';
    ctx.font = 'bold 54px Georgia, serif';
    ctx.fillText('CAUGHT!', W / 2, 92);
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillStyle = '#ffd7da';
    ctx.fillText(lives > 0 ? 'It drags you back to the door…' : 'The museum keeps you now…', W / 2, H - 34);
  }
}

/* ---------------- main loop ---------------- */
let lastTs = 0;
function loop(ts) {
  const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016);
  lastTs = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

/* ---------------- boot ---------------- */
(async function boot() {
  await CG.init();
  CG.loadingStart();
  await preloadAssets();
  statues = makeStatues(1); // idle scene behind the menu
  state = 'menu';
  showOnly(menuEl);
  syncMenuInfo();
  renderShop();
  syncHud();
  updateMute();
  CG.loadingStop();
  requestAnimationFrame(loop);
})();

/* debug/testing handle (also handy for QA screenshots) */
window.STATUE = {
  get state() { return state; },
  get levelIdx() { return levelIdx; },
  get night() { return night; },
  get lives() { return lives; },
  get score() { return score; },
  get save() { return save; },
  startRun, advanceWing, togglePause, wingCleared,
  forceCatch() { if (state === 'playing' && statues[0]) onCaught(statues[0]); },
  forceClear() { if (state === 'playing') { timeLeft = 0.0001; } },
  CG
};
