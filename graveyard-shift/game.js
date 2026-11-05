"use strict";
/* ============================================================
   GRAVEYARD SHIFT — Idle Defense (production build)
   A lane-defense idle game for CrazyGames (teen / PEGI-12 spooky).
   Auto-turrets hold a graveyard gate against nightly zombie waves.
   The twist: a Purifier turret doesn't kill — it converts zombies
   into Bone Mill workers who earn Bones forever (even offline),
   but a purifier plot is a plot that isn't shooting anything.

   Vanilla JS + Canvas, no build step, no dependencies. All art is
   drawn in code (pre-rendered sprites), all sound is WebAudio
   synthesis — no media files. FLAT folder: every path is a bare
   filename (the CrazyGames uploader flattens subfolders).
   CrazyGames SDK v3 is integrated through the CG wrapper below,
   using the same proven pattern as STATUE!: every call is
   feature-detected + try/caught, so the game runs identically on
   a plain static host with no SDK present.
   ============================================================ */

/* ---------------- tiny helpers ---------------- */
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);
function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
  catch (e) { return fallback; }
}
function lsSet(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
const fmt = n => (n >= 100000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.floor(n)));

/* ---------------- field geometry (shared with rendering) ---------------- */
const W = 960, H = 600;
const LANES = [368, 458, 548];            // zombie foot-line y per lane
const PLOT_X = [300, 470, 640, 790];      // turret plot columns
const GATE_X = 902, SPAWN_X = -46;
const MILL_DOOR = { x: 74, y: 548 };

/* ---------------- balance data ---------------- */
const TURRETS = {
  lantern:  { name: 'Lantern Post',       icon: '🏮', cost: 50,  desc: 'Zaps one zombie at a time with holy light. Steady, long reach.', dmg: 7,  interval: 0.45, range: 285 },
  sprinkler:{ name: 'Holy Sprinkler',     icon: '💦', cost: 80,  desc: 'Rapid holy-water spray, short reach. Splashes close groups.',   dmg: 3,  interval: 0.16, range: 155, splash: 30 },
  bell:     { name: 'Bell Tower',         icon: '🔔', cost: 110, desc: 'Slow toll hits EVERY zombie near the target and slows them.',   dmg: 14, interval: 2.6,  range: 330, radius: 135, slow: 0.35, slowDur: 1.6 },
  purifier: { name: 'Purifier Chalice',   icon: '🏆', cost: 130, desc: 'Deals NO damage. Channels a zombie into a golden Bone Mill worker who earns 🦴 forever — but a purifying plot is not shooting.', dmg: 0, interval: 0, range: 305, channel: 3.6 }
};
const TURRET_ORDER = ['lantern', 'sprinkler', 'bell', 'purifier'];
const LVL_MUL = [1, 1.8, 3.0];                       // damage / effect per turret level
const LVL_COST = [1.0, 0.9, 1.5];                    // × base cost to BUY lvl 1 / upgrade to lvl 2 / lvl 3
const ZTYPES = {
  shambler: { hp: 22,  speed: 17, bounty: 5,  gate: 8,  scale: 1.0,  coat: '#5a4a6b', skin: '#8fce6e' },
  runner:   { hp: 14,  speed: 36, bounty: 6,  gate: 6,  scale: 0.92, coat: '#6b3a3a', skin: '#a5d66d' },
  ghost:    { hp: 36,  speed: 21, bounty: 9,  gate: 10, scale: 1.0,  coat: '#cfd8dc', skin: '#e8f6ee', ghost: true },
  brute:    { hp: 115, speed: 10, bounty: 18, gate: 25, scale: 1.45, coat: '#3f4a3a', skin: '#7fb45e' }
};
const UPGRADES = {
  light:  { name: '💡 Sharper Light',  max: 5, costs: [60, 160, 300, 480, 700],   desc: '+20% damage for every turret, per level.' },
  shovel: { name: '🪏 Cursed Shovel',  max: 5, costs: [50, 130, 250, 400, 600],   desc: 'Your zombie-bonk tap hits +5 harder per level.' },
  gate:   { name: '⛓️ Iron Gate',      max: 5, costs: [70, 180, 320, 500, 750],   desc: '+50 max gate HP per level. The gate mends itself at dawn.' },
  bunks:  { name: '🛏️ Mill Bunks',     max: 5, costs: [80, 200, 380, 600, 900],   desc: '+4 Bone Mill worker cap per level (base cap 4).' },
  hustle: { name: '⚒️ Worker Hustle',  max: 5, costs: [90, 220, 420, 680, 1000],  desc: '+30% bones from your Mill crew, per level.' }
};
const WORKER_RATE = 0.25;              // bones / second / worker (15 per minute)
const OFFLINE_CAP_SEC = 8 * 3600;      // offline earnings cap: 8 hours

/* ---------------- persistent progression ---------------- */
const SAVE_KEY = 'graveyardSaveV1';
function defaultSave() {
  return {
    bones: 80, night: 1, bestNight: 0, shards: 0, milestones: 0,
    turrets: [],                        // {col, lane, type, lvl}
    upg: { light: 0, shovel: 0, gate: 0, bunks: 0, hustle: 0 },
    workers: 0,
    stats: { kills: 0, purified: 0, nights: 0, earned: 0 },
    muted: false, lastSeen: 0, started: false
  };
}
let save = defaultSave();
try {
  const raw = JSON.parse(lsGet(SAVE_KEY, 'null'));
  if (raw && typeof raw === 'object') {
    const d = defaultSave();
    save.bones = Math.max(0, +raw.bones || 0);
    save.night = clamp(raw.night | 0 || 1, 1, 9999);
    save.bestNight = Math.max(0, raw.bestNight | 0);
    save.shards = Math.max(0, raw.shards | 0);
    save.milestones = Math.max(0, raw.milestones | 0);
    if (Array.isArray(raw.turrets)) {
      save.turrets = raw.turrets.filter(t => t && TURRETS[t.type] &&
        t.col >= 0 && t.col < 4 && t.lane >= 0 && t.lane < 3)
        .map(t => ({ col: t.col | 0, lane: t.lane | 0, type: t.type, lvl: clamp(t.lvl | 0 || 1, 1, 3) }));
    }
    for (const k of Object.keys(d.upg)) save.upg[k] = clamp((raw.upg && raw.upg[k]) | 0, 0, UPGRADES[k].max);
    save.workers = clamp(raw.workers | 0, 0, 999);
    if (raw.stats) for (const k of Object.keys(d.stats)) save.stats[k] = Math.max(0, raw.stats[k] | 0);
    save.muted = !!raw.muted;
    save.lastSeen = Math.max(0, +raw.lastSeen || 0);
    save.started = !!raw.started;
  }
} catch (e) { /* corrupted save -> defaults */ }
function persist() { save.lastSeen = Date.now(); lsSet(SAVE_KEY, JSON.stringify(save)); }

/* ---------------- derived economy ---------------- */
const bonesMul = () => 1 + 0.20 * save.shards;                  // prestige: +20% bones / shard
const dmgMul = () => (1 + 0.20 * save.upg.light) * (1 + 0.15 * save.shards);
const tapDmg = () => Math.round((5 + 5 * save.upg.shovel) * (1 + 0.15 * save.shards));
const maxGateHp = () => 100 + 50 * save.upg.gate;
const workerCap = () => 4 + 4 * save.upg.bunks;
const workerRate = () => save.workers * WORKER_RATE * (1 + 0.30 * save.upg.hustle) * bonesMul(); // bones/sec
const turretCost = (type, lvl) => Math.round(TURRETS[type].cost * LVL_COST[lvl - 1]);
const turretInvested = t => { let s = 0; for (let l = 1; l <= t.lvl; l++) s += turretCost(t.type, l); return s; };
/* Offline earnings: the Mill crew's rate at logoff × time away, capped at 8h.
   Pure function of (elapsedMs, rate) so the smoke test can verify it directly. */
function offlineEarnedFor(elapsedMs, ratePerSec) {
  const secs = clamp(elapsedMs / 1000, 0, OFFLINE_CAP_SEC);
  return Math.floor(ratePerSec * secs);
}
function offlineEarned(elapsedMs) { return offlineEarnedFor(elapsedMs, workerRate()); }

/* ---------------- CrazyGames SDK v3 wrapper ----------------
   Same proven pattern as STATUE! (docs.crazygames.com/sdk):
   init() resolves before any other call; loading/gameplay calls
   bracket activity; midgame ads ONLY at natural breaks (night
   complete, prestige) with mute+freeze callbacks and a 3-minute
   client throttle mirroring the server cooldown; the portal's
   game.settings.muteAudio outranks the in-game toggle. Every call
   is feature-detected + try/caught — off-portal the SDK reports
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
let audioCtx = null, masterGain = null, musicGain = null;
let chordIdx = 0, nextChordAt = 0, nextPlinkAt = 0;
const CHORDS = [
  [98.00, 146.83, 196.00, 246.94],   // G
  [82.41, 123.47, 164.81, 207.65],   // Em
  [110.00, 164.81, 220.00, 261.63],  // Am
  [87.31, 130.81, 174.61, 220.00]    // F
];
const PLINKS = [392, 440, 523.25, 587.33, 659.25];
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
      const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lowpass;
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
const sndClick  = () => tone(640, 0.05, { type: 'square', vol: 0.03 });
const sndDenied = () => tone(140, 0.18, { type: 'square', vol: 0.06, slideTo: 90 });
const sndBuild  = () => { tone(220, 0.1, { type: 'triangle', vol: 0.08 }); tone(330, 0.14, { delay: 0.07, type: 'triangle', vol: 0.08 }); noiseBurst(0.12, 0.05, 500); };
const sndZap    = () => tone(1240, 0.07, { type: 'sawtooth', vol: 0.028, slideTo: 620, lowpass: 2600 });
const sndSplash = () => noiseBurst(0.09, 0.035, 1500);
const sndBell   = () => { tone(659, 1.1, { type: 'sine', vol: 0.07 }); tone(988, 0.8, { type: 'sine', vol: 0.035 }); tone(1318, 0.5, { type: 'sine', vol: 0.02 }); };
const sndBonk   = () => { tone(180, 0.09, { type: 'square', vol: 0.07, slideTo: 70 }); noiseBurst(0.06, 0.05, 300); };
const sndDie    = () => tone(300, 0.3, { type: 'triangle', vol: 0.05, slideTo: 60 });
const sndPurify = () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.24, { delay: i * 0.06, type: 'sine', vol: 0.055 })); };
const sndCoin   = () => { tone(950, 0.08, { vol: 0.045 }); tone(1420, 0.12, { delay: 0.05, vol: 0.04 }); };
const sndDawn   = () => { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.3, { delay: i * 0.1, type: 'triangle', vol: 0.07 })); };
const sndFall   = () => { tone(98, 0.9, { type: 'sawtooth', vol: 0.13, lowpass: 700, slideTo: 40 }); noiseBurst(0.7, 0.1, 220); };
function musicUpdate() {
  if (!audioCtx || !musicGain || state !== 'playing') return;
  const now = audioCtx.currentTime;
  if (now >= nextChordAt) {
    const chord = CHORDS[chordIdx % CHORDS.length]; chordIdx++;
    nextChordAt = now + 4.6;
    for (const f of chord) {
      tone(f, 5.0, { type: 'triangle', vol: 0.024, attack: 1.5, music: true, lowpass: 640 });
      tone(f * 2, 5.0, { type: 'sine', vol: 0.007, attack: 2.0, music: true });
    }
  }
  if (now >= nextPlinkAt) { // sparse bell-like notes over the pad
    nextPlinkAt = now + 3 + Math.random() * 5;
    if (Math.random() < 0.7) tone(PLINKS[(Math.random() * PLINKS.length) | 0], 0.8, { type: 'sine', vol: 0.013, music: true });
  }
}

/* ---------------- DOM ---------------- */
const $ = id => document.getElementById(id);
const canvas = $('game'), ctx = canvas.getContext('2d');
const bonesEl = $('bones'), nightEl = $('nightLbl'), waveEl = $('waveLbl'),
  gateBarEl = $('gateBar'), gateLblEl = $('gateLbl'), workersEl = $('workersLbl'), shardEl = $('shardLbl'),
  phaseEl = $('phaseLbl'), callWaveBtn = $('callWaveBtn'), toastEl = $('toast'), bannerEl = $('banner');
const menuEl = $('menu'), awayEl = $('away'), buildEl = $('buildSheet'), turretEl = $('turretSheet'),
  upgEl = $('upgrades'), summaryEl = $('summary'), prestigeEl = $('prestige'), overEl = $('over'),
  pausedEl = $('paused'), adveilEl = $('adveil');
const OVERLAYS = [menuEl, awayEl, upgEl, summaryEl, prestigeEl, overEl, pausedEl];
function setAdVeil(on) { adveilEl.classList.toggle('hidden', !on); }
function showOnly(el) { for (const o of OVERLAYS) o.classList.toggle('hidden', o !== el); }
function closeSheets() { buildEl.classList.add('hidden'); turretEl.classList.add('hidden'); sel = null; }
let toastTimer = 0;
function toast(msg, ms) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 2200);
}
let bannerTimer = 0;
function banner(msg, ms) {
  bannerEl.textContent = msg;
  bannerEl.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => bannerEl.classList.remove('show'), ms || 1600);
}

/* ---------------- runtime state ---------------- */
let state = 'menu';            // menu | playing | summary | over | paused
let prePause = 'playing';
let phase = 'build';           // build | wave | breather (within a night)
let wave = 0, wavesTotal = 6;  // waves in the current night
let phaseT = 0;                // countdown for build/breather phases
let spawnQueue = [], spawnT = 0;
let zombies = [];              // active zombies
let shots = [];                // projectiles / beams / rings (visual + damage timing)
let parts = [];                // particles
let floaters = [];             // floating text (+5 🦴 etc.)
let turretState = new Map();   // "col,lane" -> {cd, channelTarget, channelT, bellSwing}
let gateHp = 100;
let sel = null;                // selected plot {col, lane} or turret ref
let nightKills = 0, nightPurified = 0, nightEarned = 0;
let elapsed = 0;               // run time (s) for idle scene anim
let persistT = 0;
const keyOf = (col, lane) => col + ',' + lane;
const turretAt = (col, lane) => save.turrets.find(t => t.col === col && t.lane === lane) || null;
const plotPos = (col, lane) => ({ x: PLOT_X[col], y: LANES[lane] - 56 });

/* ---------------- pre-rendered sprites ----------------
   Everything is drawn once into offscreen canvases at boot, then
   blitted per frame — cheap and crisp. Zombies get 2 walk frames. */
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
const SPR = { zombie: {}, turret: {} };
function drawZombieBody(g, type, frame, purified) {
  const z = ZTYPES[type];
  const coat = purified ? '#c9a227' : z.coat;
  const skin = purified ? '#ffe9a8' : z.skin;
  g.clearRect(0, 0, 96, 112);
  g.save();
  g.translate(48, 4);
  const legSwing = frame === 0 ? -6 : 6;
  // legs (tattered pants + shoes)
  g.fillStyle = '#2e2a38';
  g.fillRect(-13 + legSwing * 0.4, 76, 10, 22); g.fillRect(4 - legSwing * 0.4, 76, 10, 22);
  g.fillStyle = '#4a3423';
  g.fillRect(-15 + legSwing * 0.4, 96, 14, 6); g.fillRect(3 - legSwing * 0.4, 96, 14, 6);
  // coat / body
  g.fillStyle = coat;
  rr(g, -19, 40, 38, 42, 7); g.fill();
  g.fillStyle = 'rgba(0,0,0,.22)';
  g.fillRect(-19, 66, 38, 4);                       // torn hem shading
  g.beginPath(); g.moveTo(-19, 82); g.lineTo(-8, 74); g.lineTo(0, 82); g.lineTo(9, 75); g.lineTo(19, 82); g.lineTo(19, 70); g.lineTo(-19, 70); g.fill();
  g.fillStyle = purified ? '#fff3c4' : '#d8cf9f';    // shirt
  g.beginPath(); g.moveTo(-7, 42); g.lineTo(7, 42); g.lineTo(4, 62); g.lineTo(-4, 62); g.fill();
  if (!purified && !z.ghost) { g.fillStyle = 'rgba(90,20,20,.5)'; g.fillRect(6, 50, 5, 7); } // stain, no gore — just grime
  // arms reaching forward (+x) — classic zombie shuffle
  g.strokeStyle = skin; g.lineWidth = 8; g.lineCap = 'round';
  const reach = frame === 0 ? 26 : 21;
  g.beginPath(); g.moveTo(8, 50); g.lineTo(8 + reach, 46 + (frame ? 3 : -2)); g.stroke();
  g.beginPath(); g.moveTo(4, 58); g.lineTo(4 + reach - 5, 60); g.stroke();
  g.fillStyle = skin;
  g.beginPath(); g.arc(10 + reach, 45 + (frame ? 3 : -2), 5, 0, 7); g.fill();
  g.beginPath(); g.arc(6 + reach - 5, 60, 5, 0, 7); g.fill();
  // head
  g.beginPath(); g.arc(2, 24, 17, 0, 7); g.fill();
  g.fillStyle = 'rgba(0,0,0,.15)'; g.beginPath(); g.arc(-6, 12, 6, 0, 7); g.fill(); // hair patch shadow
  if (!z.ghost && !purified) { // messy hair
    g.strokeStyle = '#2c2c34'; g.lineWidth = 3;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(-8 + i * 5, 10); g.lineTo(-10 + i * 6, 3 + Math.abs(i)); g.stroke(); }
  }
  // eyes — big goofy cartoon eyes looking right
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(8, 21, 5.4, 0, 7); g.fill();
  g.beginPath(); g.arc(-3, 22, 4.6, 0, 7); g.fill();
  g.fillStyle = '#20242c';
  g.beginPath(); g.arc(10, 21, 2.6, 0, 7); g.fill();
  g.beginPath(); g.arc(-1, 22, 2.2, 0, 7); g.fill();
  // mouth — silly open grin / peaceful smile when purified
  g.strokeStyle = '#26303a'; g.lineWidth = 2.4;
  g.beginPath();
  if (purified) g.arc(6, 30, 6, 0.15 * Math.PI, 0.85 * Math.PI);
  else { g.moveTo(1, 33); g.lineTo(12, 33); }
  g.stroke();
  if (!purified) { g.fillStyle = '#fff'; g.fillRect(4, 33, 3.4, 3.4); g.fillRect(9, 33, 3, 3); } // two goofy teeth
  g.restore();
  if (z.ghost && !purified) { // ghostly veil
    g.save(); g.globalAlpha = 0.35; g.fillStyle = '#e8f6ee';
    g.beginPath(); g.ellipse(48, 58, 27, 52, 0, 0, 7); g.fill(); g.restore();
  }
}
function buildSprites() {
  for (const type of Object.keys(ZTYPES)) {
    SPR.zombie[type] = [0, 1].map(f => {
      const c = makeCanvas(96, 112), g = c.getContext('2d');
      drawZombieBody(g, type, f, false);
      return c;
    });
    const pc = makeCanvas(96, 112), pg = pc.getContext('2d');
    drawZombieBody(pg, type, 0, true);
    SPR.zombie[type + 'Pure'] = pc;
  }
  // --- turrets ---
  SPR.turret.lantern = (() => {
    const c = makeCanvas(80, 108), g = c.getContext('2d');
    g.fillStyle = '#5d422c'; g.fillRect(36, 44, 8, 58);                       // post
    g.fillStyle = '#77572f'; g.fillRect(24, 98, 32, 8);                        // base
    const glow = g.createRadialGradient(40, 30, 4, 40, 30, 34);
    glow.addColorStop(0, 'rgba(255,220,120,.85)'); glow.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(40, 30, 34, 0, 7); g.fill();
    g.fillStyle = '#2c2c34'; rr(g, 28, 12, 24, 34, 4); g.fill();               // lantern cage
    g.fillStyle = '#ffd76a'; rr(g, 32, 17, 16, 24, 3); g.fill();               // flame glass
    g.fillStyle = '#fff3c4'; g.beginPath(); g.ellipse(40, 29, 4.5, 8, 0, 0, 7); g.fill();
    g.fillStyle = '#1e1e26'; g.beginPath(); g.moveTo(24, 12); g.lineTo(56, 12); g.lineTo(40, 2); g.fill(); // cap
    return c;
  })();
  SPR.turret.sprinkler = (() => {
    const c = makeCanvas(80, 108), g = c.getContext('2d');
    g.fillStyle = '#8a6d2f'; rr(g, 22, 88, 36, 16, 5); g.fill();               // brass base
    g.fillStyle = '#c9a227'; g.fillRect(36, 56, 8, 34);                        // stem
    g.fillStyle = '#e8c84a'; g.beginPath(); g.arc(40, 50, 12, 0, 7); g.fill(); // head
    g.fillStyle = '#7a5f22';
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.arc(40 + i * 5, 44 - Math.abs(i), 2.4, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(170,225,255,.75)'; g.lineWidth = 2;
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(40, 46); g.quadraticCurveTo(40 + i * 9, 30, 40 + i * 13, 44 + Math.abs(i) * 4); g.stroke(); }
    return c;
  })();
  SPR.turret.bell = (() => {
    const c = makeCanvas(96, 150), g = c.getContext('2d');
    g.fillStyle = '#4a3524';
    g.fillRect(16, 60, 9, 86); g.fillRect(71, 60, 9, 86);                        // legs
    g.fillRect(10, 52, 76, 9);                                                  // beam
    g.fillStyle = '#3a2a1c'; g.beginPath(); g.moveTo(4, 52); g.lineTo(92, 52); g.lineTo(48, 22); g.fill(); // roof
    g.fillStyle = '#5d422c'; g.fillRect(6, 140, 84, 8);                          // base
    g.fillStyle = '#c9a227';                                                    // bell
    g.beginPath(); g.moveTo(48, 66); g.quadraticCurveTo(34, 66, 33, 84); g.lineTo(30, 96); g.lineTo(66, 96); g.lineTo(63, 84); g.quadraticCurveTo(62, 66, 48, 66); g.fill();
    g.fillStyle = '#8a6d2f'; g.beginPath(); g.arc(48, 100, 5, 0, 7); g.fill();    // clapper
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(40, 70, 5, 20);
    return c;
  })();
  SPR.turret.purifier = (() => {
    const c = makeCanvas(80, 108), g = c.getContext('2d');
    g.fillStyle = '#4c4c58'; rr(g, 24, 84, 32, 20, 4); g.fill();                 // stone pedestal
    g.fillStyle = '#6a6a78'; g.fillRect(36, 62, 8, 24);
    const glow = g.createRadialGradient(40, 42, 4, 40, 42, 36);
    glow.addColorStop(0, 'rgba(255,233,168,.9)'); glow.addColorStop(1, 'rgba(255,233,168,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(40, 42, 36, 0, 7); g.fill();
    g.fillStyle = '#c9a227';                                                     // chalice bowl
    g.beginPath(); g.moveTo(24, 34); g.lineTo(56, 34); g.quadraticCurveTo(52, 52, 40, 54); g.quadraticCurveTo(28, 52, 24, 34); g.fill();
    g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(40, 30, 9, 0, 7); g.fill();     // holy orb
    g.fillStyle = '#fff'; g.beginPath(); g.arc(37, 27, 3, 0, 7); g.fill();
    return c;
  })();
}

/* ---------------- economy grants ---------------- */
function grantBones(n, countStats) {
  if (n <= 0) return;
  save.bones += n;
  if (countStats) { nightEarned += n; save.stats.earned += n; }
  syncHud();
}
function floater(x, y, text, color) {
  floaters.push({ x, y, text, color: color || '#ffe9a8', t: 0 });
  if (floaters.length > 40) floaters.shift();
}
function burst(x, y, color, n, speed) {
  for (let i = 0; i < (n || 8); i++) {
    const a = Math.random() * Math.PI * 2, s = rand(20, speed || 90);
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, t: 0, life: rand(0.3, 0.7), color, r: rand(1.6, 3.4) });
  }
  if (parts.length > 320) parts.splice(0, parts.length - 320);
}

/* ---------------- waves & nights ---------------- */
function wavesForNight(n) { return 5 + Math.min(5, n); }
function zombieHpMul() { return Math.pow(1.22, save.night - 1) * (1 + 0.06 * (wave - 1)); }
function zombieSpeedMul() { return Math.min(1.15, 1 + 0.01 * (save.night - 1)); }
function pickZombieType() {
  const n = save.night;
  const pool = [['shambler', 100]];
  if (wave >= 3 || n >= 2) pool.push(['runner', 34]);
  if (n >= 2) pool.push(['ghost', 24]);
  if (n >= 3) pool.push(['brute', 15]);
  let tot = 0; for (const p of pool) tot += p[1];
  let r = Math.random() * tot;
  for (const p of pool) { r -= p[1]; if (r <= 0) return p[0]; }
  return 'shambler';
}
function startNight(fromMenu) {
  closeSheets();
  showOnly(null);
  state = 'playing';
  wave = 0;
  wavesTotal = wavesForNight(save.night);
  gateHp = maxGateHp();
  zombies = []; shots = []; spawnQueue = [];
  turretState.clear();
  nightKills = 0; nightPurified = 0; nightEarned = 0;
  phase = 'build'; phaseT = 18;
  banner('🌙 Night ' + save.night, 1800);
  CG.gameplayStart();
  persist();
  syncHud();
  if (fromMenu) sndClick();
}
function beginWave() {
  wave++;
  phase = 'wave';
  const count = Math.round((4 + wave * 1.6 + save.night * 1.2));
  spawnQueue = [];
  for (let i = 0; i < count; i++) spawnQueue.push(pickZombieType());
  // a brute anchor late in big waves
  if (save.night >= 3 && wave >= 3) spawnQueue.push('brute');
  spawnT = 0.4;
  banner('Wave ' + wave + ' / ' + wavesTotal, 1300);
  syncHud();
}
function spawnZombie(type, lane) {
  const conf = ZTYPES[type];
  const hp = Math.round(conf.hp * zombieHpMul());
  const z = {
    type, lane: lane === undefined ? (Math.random() * 3) | 0 : lane,
    x: SPAWN_X - rand(0, 30), hp, maxHp: hp,
    speed: conf.speed * zombieSpeedMul() * rand(0.9, 1.1),
    slowT: 0, slowMul: 1, purifyT: 0, state: 'walk', walkT: rand(0, 1),
    hitFlash: 0, dead: false
  };
  zombies.push(z);
  return z;
}
function callWaveEarly() {
  if (state !== 'playing' || (phase !== 'build' && phase !== 'breather')) return;
  const bonus = Math.ceil(phaseT) * 2;
  if (bonus > 0) { grantBones(bonus, true); floater(W / 2, 120, '+' + bonus + ' 🦴 early call', '#ffd76a'); sndCoin(); }
  beginWave();
}
function nightComplete() {
  phase = 'done';
  // purified zombies still strolling to the Mill check in at dawn
  for (const z of zombies) {
    if (z.state === 'purified' && !z.dead) {
      z.dead = true;
      if (save.workers < workerCap()) save.workers++; else grantBones(10, true);
    }
  }
  const bonus = Math.round((30 + 10 * save.night) * bonesMul());
  grantBones(bonus, true);
  save.stats.nights++;
  if (save.night > save.bestNight) save.bestNight = save.night;
  persist();
  CG.gameplayStop();
  CG.happytime();
  sndDawn();
  state = 'summary';
  $('sumTitle').textContent = '🌅 Dawn breaks — Night ' + save.night + ' held!';
  $('sumStats').innerHTML =
    'Zombies composted: <b>' + nightKills + '</b> · Purified into the crew: <b>' + nightPurified + '</b><br>' +
    'Bones earned tonight: <b>🦴 ' + fmt(nightEarned) + '</b> (incl. dawn bonus ' + fmt(bonus) + ')<br>' +
    'Mill crew: <b>' + save.workers + '</b> earning <b>' + fmt(workerRate() * 60) + ' 🦴/min</b> — even while you\'re away.';
  $('nextNightBtn').textContent = '🌙 Begin Night ' + (save.night + 1);
  const pg = prestigeGain();
  $('prestigeBtn').classList.toggle('hidden', pg <= 0);
  if (pg > 0) $('prestigeBtn').textContent = '🌟 New Moon (Prestige) +' + pg + ' 🌟';
  showOnly(summaryEl);
  syncHud();
}
function gateFallen() {
  phase = 'done';
  CG.gameplayStop();
  sndFall();
  state = 'over';
  $('overText').innerHTML = 'The horde smashed through on <b>Night ' + save.night + ', Wave ' + wave + '</b>.' +
    '<br>Rebuild your nerve — your turrets can be upgraded between waves, and a Purifier crew pays for it all.';
  showOnly(overEl);
  persist();
}
/* Prestige ("New Moon"): milestones at every 5th completed night. */
function prestigeGain() {
  return Math.max(0, Math.floor(save.bestNight / 5) - save.milestones);
}
function doPrestige() {
  const gain = prestigeGain();
  if (gain <= 0) return;
  save.milestones += gain;
  save.shards += gain;
  const keepStats = save.stats, keepMuted = save.muted;
  const fresh = defaultSave();
  fresh.shards = save.shards; fresh.milestones = save.milestones;
  fresh.stats = keepStats; fresh.muted = keepMuted; fresh.started = true;
  fresh.bestNight = save.bestNight;
  save = fresh;
  turretState.clear();
  persist();
  CG.happytime();
  sndPurify();
  banner('🌟 New Moon! +' + gain + ' 🌟', 2200);
  toast('Permanent: +' + (20 * gain) + '% bones, +' + (15 * gain) + '% damage — forever.', 3200);
  startNight(false);
}

/* ---------------- zombie outcomes ---------------- */
function killZombie(z, byTap) {
  z.dead = true;
  const conf = ZTYPES[z.type];
  const bounty = Math.round(conf.bounty * bonesMul());
  grantBones(bounty, true);
  save.stats.kills++;
  nightKills++;
  burst(z.x, LANES[z.lane] - 46, z.type === 'ghost' ? '#cfe8d8' : '#9fd06e', 10, 110);
  floater(z.x, LANES[z.lane] - 104, '+' + bounty + ' 🦴');
  if (!byTap) sndDie();
  persist();
}
function purifyZombie(z) {
  z.state = 'purified';
  z.purifyT = 0;
  save.stats.purified++;
  nightPurified++;
  burst(z.x, LANES[z.lane] - 46, '#ffd76a', 16, 120);
  floater(z.x, LANES[z.lane] - 108, '✨ Purified!', '#ffd76a');
  sndPurify();
  persist();
}
function addWorker() { // a purified zombie reaches the Mill door
  if (save.workers < workerCap()) {
    save.workers++;
    floater(MILL_DOOR.x, MILL_DOOR.y - 120, '⚰️ Crew +1 · ' + fmt(workerRate() * 60) + ' 🦴/min', '#ffd76a');
    sndCoin();
  } else {
    grantBones(10, true); // mill full: the soul pays a signing bonus instead
    floater(MILL_DOOR.x, MILL_DOOR.y - 120, 'Mill full! +10 🦴', '#ffe9a8');
  }
  persist();
  syncHud();
}
function damageZombie(z, dmg, byTap) {
  if (z.dead || z.state !== 'walk') return;
  z.hp -= dmg;
  z.hitFlash = 0.09;
  if (z.hp <= 0) killZombie(z, byTap);
}
function tapZombie(z) {
  if (z.dead || z.state !== 'walk') return;
  damageZombie(z, tapDmg(), true);
  burst(z.x, LANES[z.lane] - 52, '#ffffff', 5, 80);
  sndBonk();
}

/* ---------------- turret combat ---------------- */
function turretTarget(t, rangeMul) {
  const conf = TURRETS[t.type];
  const pos = plotPos(t.col, t.lane);
  const range = conf.range * (rangeMul || 1);
  let best = null;
  for (const z of zombies) {
    if (z.dead || z.state !== 'walk' || z.lane !== t.lane) continue;
    if (z.x < pos.x - range || z.x > pos.x + 42) continue;
    if (!best || z.x > best.x) best = z;   // furthest along = most dangerous
  }
  return best;
}
function updateTurrets(dt) {
  for (const t of save.turrets) {
    const conf = TURRETS[t.type];
    const k = keyOf(t.col, t.lane);
    let st = turretState.get(k);
    if (!st) { st = { cd: rand(0, 0.2), target: null, channel: 0, swing: 0 }; turretState.set(k, st); }
    st.cd -= dt;
    st.swing = Math.max(0, st.swing - dt * 3);
    const pos = plotPos(t.col, t.lane);
    if (t.type === 'purifier') {
      // hold the channel on a live target; drop it if it leaves/dies
      if (st.target && (st.target.dead || st.target.state !== 'walk' || st.target.lane !== t.lane ||
          st.target.x < pos.x - conf.range || st.target.x > pos.x + 42)) {
        st.target = null; st.channel = 0;
      }
      if (!st.target) st.target = turretTarget(t);
      if (st.target) {
        const need = conf.channel * Math.pow(st.target.maxHp / 22, 0.45) / LVL_MUL[t.lvl - 1];
        st.channel += dt;
        st.target.purifyT = clamp(st.channel / need, 0, 1);
        if (Math.random() < dt * 8) burst(st.target.x + rand(-8, 8), LANES[st.target.lane] - rand(30, 80), '#ffd76a', 1, 40);
        if (st.channel >= need) {
          const z = st.target; st.target = null; st.channel = 0;
          purifyZombie(z);
        }
      }
      continue;
    }
    if (st.cd > 0) continue;
    const target = turretTarget(t);
    if (!target) { st.cd = 0.06; continue; }
    const dmg = conf.dmg * LVL_MUL[t.lvl - 1] * dmgMul();
    st.cd = conf.interval;
    if (t.type === 'lantern') {
      shots.push({ kind: 'bolt', x: pos.x, y: pos.y - 66, tx: target.x, ty: LANES[target.lane] - 48, t: 0, dur: 0.09, target, dmg });
      sndZap();
    } else if (t.type === 'sprinkler') {
      shots.push({ kind: 'spray', x: pos.x, y: pos.y - 44, tx: target.x, ty: LANES[target.lane] - 40, t: 0, dur: 0.13, target, dmg, splash: conf.splash });
      sndSplash();
    } else if (t.type === 'bell') {
      st.swing = 1;
      shots.push({ kind: 'ring', x: target.x, y: LANES[target.lane] - 44, t: 0, dur: 0.45, radius: conf.radius * (1 + 0.12 * (t.lvl - 1)), dmg, slow: conf.slow, slowDur: conf.slowDur });
      sndBell();
    }
  }
}
function applyShot(s) {
  if (s.kind === 'bolt') {
    if (s.target && !s.target.dead) damageZombie(s.target, s.dmg, false);
  } else if (s.kind === 'spray') {
    for (const z of zombies) {
      if (z.dead || z.state !== 'walk') continue;
      const dx = z.x - s.tx, dy = (LANES[z.lane] - 44) - s.ty;
      if (dx * dx + dy * dy <= s.splash * s.splash + 500) damageZombie(z, s.dmg, false);
    }
  } else if (s.kind === 'ring') {
    for (const z of zombies) {
      if (z.dead || z.state !== 'walk') continue;
      const dx = z.x - s.x, dy = (LANES[z.lane] - 44) - s.y;
      if (dx * dx + dy * dy <= s.radius * s.radius) {
        damageZombie(z, s.dmg, false);
        if (!z.dead) { z.slowMul = 1 - s.slow; z.slowT = s.slowDur; }
      }
    }
  }
}

/* ---------------- per-frame update ---------------- */
function update(dt) {
  elapsed += dt;
  musicUpdate();
  // particles & floaters always drift (menu backdrop stays alive)
  for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 130 * dt; }
  parts = parts.filter(p => p.t < p.life);
  for (const f of floaters) { f.t += dt; f.y -= 34 * dt; }
  floaters = floaters.filter(f => f.t < 1.15);
  if (state !== 'playing') return;

  // worker income ticks continuously
  if (save.workers > 0) {
    const gain = workerRate() * dt;
    save.bones += gain;
    nightEarned += gain; save.stats.earned += gain;
  }
  persistT += dt;
  if (persistT > 4) { persistT = 0; persist(); syncHud(); }

  // phase flow
  if (phase === 'build' || phase === 'breather') {
    phaseT -= dt;
    if (phaseT <= 0) beginWave();
  } else if (phase === 'wave') {
    if (spawnQueue.length) {
      spawnT -= dt;
      if (spawnT <= 0) {
        spawnT = Math.max(0.45, 1.15 - wave * 0.05);
        spawnZombie(spawnQueue.shift());
      }
    }
  }

  updateTurrets(dt);

  // zombies
  for (const z of zombies) {
    z.walkT += dt * (z.state === 'walk' ? z.speed * 0.11 : 2.2);
    z.hitFlash = Math.max(0, z.hitFlash - dt);
    if (z.slowT > 0) { z.slowT -= dt; if (z.slowT <= 0) z.slowMul = 1; }
    if (z.state === 'walk') {
      z.x += z.speed * z.slowMul * dt;
      if (z.x >= GATE_X) {
        z.dead = true;
        gateHp -= ZTYPES[z.type].gate;
        burst(GATE_X + 16, LANES[z.lane] - 40, '#ff8a5c', 12, 130);
        floater(GATE_X - 30, LANES[z.lane] - 100, '-' + ZTYPES[z.type].gate + ' 🚪', '#ff9a7a');
        sndBonk();
        syncHud();
        if (gateHp <= 0) { gateHp = 0; gateFallen(); }
      }
    } else if (z.state === 'purified') {
      // stroll to the Bone Mill door, then join the crew
      if (z.laneY === undefined) z.laneY = LANES[z.lane];
      const dx = MILL_DOOR.x - z.x, dy = MILL_DOOR.y - z.laneY;
      const d = Math.hypot(dx, dy);
      if (d < 14) { z.dead = true; addWorker(); }
      else {
        z.x += (dx / d) * 66 * dt;
        z.laneY += (dy / d) * 66 * dt;
      }
    }
  }
  zombies = zombies.filter(z => !z.dead);

  // shots resolve
  for (const s of shots) {
    s.t += dt;
    if ((s.kind === 'bolt' || s.kind === 'spray') && !s.applied && s.t >= s.dur) { s.applied = true; applyShot(s); }
    if (s.kind === 'ring' && !s.applied && s.t >= 0.12) { s.applied = true; applyShot(s); }
  }
  shots = shots.filter(s => s.t < s.dur + 0.05);

  // wave cleared?
  if (phase === 'wave' && !spawnQueue.length && !zombies.some(z => z.state === 'walk')) {
    if (wave >= wavesTotal) { nightComplete(); return; }
    const bonus = Math.round((8 + 2 * wave) * bonesMul());
    grantBones(bonus, true);
    floater(W / 2, 130, 'Wave cleared! +' + bonus + ' 🦴', '#ffd76a');
    phase = 'breather'; phaseT = 10;
    persist();
  }
  syncHudLight();
}

/* ---------------- HUD ---------------- */
function syncHud() {
  bonesEl.textContent = '🦴 ' + fmt(save.bones);
  nightEl.textContent = '🌙 Night ' + save.night;
  workersEl.textContent = '⚰️ Crew ' + save.workers + '/' + workerCap() + ' · +' + fmt(workerRate() * 60) + '/min';
  shardEl.classList.toggle('hidden', save.shards <= 0);
  if (save.shards > 0) shardEl.textContent = '🌟 ' + save.shards;
  gateBarEl.style.width = clamp(gateHp / maxGateHp() * 100, 0, 100) + '%';
  gateBarEl.style.background = gateHp / maxGateHp() < 0.3 ? 'linear-gradient(90deg,#ff6a4d,#ff9a3c)' : 'linear-gradient(90deg,#7ddc6a,#c6f24e)';
  gateLblEl.textContent = Math.ceil(gateHp) + '/' + maxGateHp();
  syncHudLight();
}
function syncHudLight() {
  bonesEl.textContent = '🦴 ' + fmt(save.bones);
  if (state !== 'playing') { waveEl.textContent = 'Wave –'; phaseEl.textContent = 'The gate is quiet… for now.'; callWaveBtn.classList.add('hidden'); return; }
  waveEl.textContent = phase === 'wave' ? 'Wave ' + wave + ' / ' + wavesTotal : 'Night ' + save.night;
  if (phase === 'build') phaseEl.textContent = '⏳ First wave in ' + Math.ceil(phaseT) + 's — tap a stone plot to build!';
  else if (phase === 'breather') phaseEl.textContent = '🌿 Breather — next wave in ' + Math.ceil(phaseT) + 's. Build, upgrade, purify…';
  else if (phase === 'wave') {
    const alive = zombies.filter(z => z.state === 'walk').length;
    phaseEl.textContent = '🧟 ' + (alive + spawnQueue.length) + ' zombies shambling… hold the gate!';
  }
  callWaveBtn.classList.toggle('hidden', !(phase === 'build' || phase === 'breather'));
}

/* ---------------- rendering ---------------- */
const STONES = [];
for (let i = 0; i < 26; i++) STONES.push({ x: rand(8, 940), lane: (Math.random() * 3) | 0, s: rand(0.5, 1.1), kind: (Math.random() * 3) | 0 });
const FLIES = [];
for (let i = 0; i < 22; i++) FLIES.push({ x: rand(0, W), y: rand(300, 570), p: rand(0, 9), s: rand(0.4, 1.1) });
function drawBackground() {
  // sky
  const sky = ctx.createLinearGradient(0, 0, 0, 330);
  sky.addColorStop(0, '#131a33'); sky.addColorStop(0.7, '#232048'); sky.addColorStop(1, '#2c2a4a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 330);
  // stars
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  for (let i = 0; i < 46; i++) {
    const sx = (i * 173.3) % W, sy = (i * 97.7) % 210;
    ctx.globalAlpha = 0.25 + 0.5 * Math.abs(Math.sin(elapsed * 0.7 + i));
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.globalAlpha = 1;
  // moon (top-right area, clear of the gate)
  const mx = 838, my = 74;
  const mg = ctx.createRadialGradient(mx, my, 10, mx, my, 92);
  mg.addColorStop(0, 'rgba(240,246,255,.5)'); mg.addColorStop(1, 'rgba(240,246,255,0)');
  ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, 92, 0, 7); ctx.fill();
  ctx.fillStyle = '#e9eef7'; ctx.beginPath(); ctx.arc(mx, my, 42, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(160,175,200,.5)';
  ctx.beginPath(); ctx.arc(mx - 13, my - 9, 8, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(mx + 15, my + 13, 6, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(mx + 6, my - 18, 4.5, 0, 7); ctx.fill();
  // parallax hills (drift slowly against run time for depth)
  ctx.fillStyle = '#1d2b3a';
  ctx.beginPath(); ctx.moveTo(0, 268);
  for (let x = 0; x <= W; x += 60) ctx.lineTo(x, 268 - Math.sin((x + elapsed * 3) * 0.008) * 22 - Math.sin(x * 0.02) * 8);
  ctx.lineTo(W, 330); ctx.lineTo(0, 330); ctx.fill();
  ctx.fillStyle = '#16222e';
  ctx.beginPath(); ctx.moveTo(0, 300);
  for (let x = 0; x <= W; x += 60) ctx.lineTo(x, 300 - Math.sin((x - elapsed * 1.5) * 0.01 + 2) * 14);
  ctx.lineTo(W, 340); ctx.lineTo(0, 340); ctx.fill();
  // dead tree silhouette, left
  ctx.strokeStyle = '#0d141d'; ctx.lineCap = 'round';
  ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(26, 336); ctx.quadraticCurveTo(34, 268, 24, 226); ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(27, 268); ctx.quadraticCurveTo(52, 246, 74, 244); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(26, 244); ctx.quadraticCurveTo(8, 226, -4, 208); ctx.stroke();
  ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.moveTo(66, 244); ctx.quadraticCurveTo(84, 232, 96, 234); ctx.stroke();
  // ground
  const gnd = ctx.createLinearGradient(0, 320, 0, H);
  gnd.addColorStop(0, '#22392c'); gnd.addColorStop(0.5, '#1a2f24'); gnd.addColorStop(1, '#12211a');
  ctx.fillStyle = gnd; ctx.fillRect(0, 320, W, H - 320);
  // lane paths (worn dirt)
  for (const ly of LANES) {
    ctx.fillStyle = 'rgba(96,74,52,.4)';
    ctx.beginPath(); ctx.ellipse(W / 2 + 20, ly + 6, W / 2, 15, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(140,112,76,.25)';
    ctx.beginPath(); ctx.ellipse(W / 2 + 20, ly + 4, W / 2 - 30, 9, 0, 0, 7); ctx.fill();
  }
  // tombstones
  for (const s of STONES) {
    const y = LANES[s.lane] - 66 + (s.kind === 2 ? 26 : 0);
    ctx.fillStyle = 'rgba(120,132,148,.55)';
    if (s.kind === 0) { rr(ctx, s.x, y, 15 * s.s, 20 * s.s, 6 * s.s); ctx.fill(); }
    else if (s.kind === 1) { ctx.fillRect(s.x, y + 4, 4.6 * s.s, 17 * s.s); ctx.fillRect(s.x - 4 * s.s, y + 8, 13 * s.s, 4 * s.s); }
    else { rr(ctx, s.x, y + 8, 17 * s.s, 12 * s.s, 3); ctx.fill(); }
  }
  // drifting fog
  ctx.fillStyle = 'rgba(210,225,235,.06)';
  for (let i = 0; i < 4; i++) {
    const fx = ((elapsed * (6 + i * 3) + i * 260) % (W + 320)) - 160;
    ctx.beginPath(); ctx.ellipse(fx, 566 - i * 8, 150, 15, 0, 0, 7); ctx.fill();
  }
  // fireflies
  for (const f of FLIES) {
    const fx = f.x + Math.sin(elapsed * f.s + f.p) * 16, fy = f.y + Math.cos(elapsed * f.s * 0.8 + f.p) * 9;
    ctx.fillStyle = 'rgba(255,220,120,' + (0.25 + 0.4 * Math.abs(Math.sin(elapsed * 1.3 + f.p))) + ')';
    ctx.beginPath(); ctx.arc(fx, fy, 1.8, 0, 7); ctx.fill();
  }
}
function drawMill() {
  const x = 12, y = 470;
  // shack
  ctx.fillStyle = '#3a2c1e'; rr(ctx, x, y + 22, 108, 84, 5); ctx.fill();
  ctx.fillStyle = '#54402a'; rr(ctx, x + 6, y + 30, 96, 68, 4); ctx.fill();
  ctx.fillStyle = '#2c2015'; ctx.beginPath(); ctx.moveTo(x - 4, y + 26); ctx.lineTo(x + 54, y - 8); ctx.lineTo(x + 112, y + 26); ctx.fill(); // roof
  // door
  ctx.fillStyle = '#1c1410'; rr(ctx, MILL_DOOR.x - 17, y + 48, 34, 58, 5); ctx.fill();
  // glowing window with crew silhouettes
  ctx.fillStyle = '#ffd76a'; rr(ctx, x + 12, y + 40, 26, 22, 3); ctx.fill();
  ctx.fillStyle = 'rgba(60,40,10,.85)';
  const bob = Math.sin(elapsed * 2.4) * 1.6;
  for (let i = 0; i < Math.min(3, save.workers); i++) ctx.fillRect(x + 16 + i * 8, y + 48 + bob * (i % 2 ? 1 : -1) * 0.4, 5, 9);
  // bone wheel
  ctx.save();
  ctx.translate(x + 88, y + 66);
  ctx.rotate(elapsed * (save.workers > 0 ? 0.7 : 0.12));
  ctx.strokeStyle = '#d8cf9f'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.stroke();
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(i * Math.PI / 2) * 15, Math.sin(i * Math.PI / 2) * 15); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = '#e8e2cc'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('BONE MILL', x + 54, y - 14);
  ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#ffd76a';
  ctx.fillText('⚰️ ' + save.workers + '/' + workerCap(), x + 54, y + 122);
}
function drawGate() {
  const hpFrac = clamp(gateHp / maxGateHp(), 0, 1);
  // stone pillars
  ctx.fillStyle = '#565d68'; rr(ctx, GATE_X - 12, 296, 30, 264, 4); ctx.fill();
  ctx.fillStyle = '#454c57'; rr(ctx, GATE_X + 38, 296, 30, 264, 4); ctx.fill();
  ctx.fillStyle = '#6a7280';
  for (let i = 0; i < 5; i++) { ctx.fillRect(GATE_X - 12, 312 + i * 50, 30, 3); ctx.fillRect(GATE_X + 38, 312 + i * 50, 30, 3); }
  // iron bars
  ctx.strokeStyle = '#23272f'; ctx.lineWidth = 5;
  for (let bx = GATE_X + 21; bx <= GATE_X + 35; bx += 7) { ctx.beginPath(); ctx.moveTo(bx, 306); ctx.lineTo(bx, 552); ctx.stroke(); }
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(GATE_X + 16, 330); ctx.lineTo(GATE_X + 42, 330); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(GATE_X + 16, 520); ctx.lineTo(GATE_X + 42, 520); ctx.stroke();
  // spikes
  ctx.fillStyle = '#23272f';
  for (let bx = GATE_X + 19; bx <= GATE_X + 38; bx += 7) { ctx.beginPath(); ctx.moveTo(bx - 3, 306); ctx.lineTo(bx + 3, 306); ctx.lineTo(bx, 292); ctx.fill(); }
  // damage: scorch + tilt as HP falls
  if (hpFrac < 0.55) {
    ctx.fillStyle = 'rgba(255,110,60,' + (0.25 + 0.2 * Math.sin(elapsed * 9)) + ')';
    ctx.beginPath(); ctx.ellipse(GATE_X + 28, 548, 20, 8, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(20,16,20,.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(GATE_X - 6, 360); ctx.lineTo(GATE_X + 6, 410); ctx.lineTo(GATE_X - 2, 452); ctx.stroke();
  }
  ctx.fillStyle = '#e8e2cc'; ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('THE GATE', GATE_X + 28, 284);
}
function drawPlots() {
  for (let lane = 0; lane < 3; lane++) for (let col = 0; col < 4; col++) {
    const p = plotPos(col, lane);
    const t = turretAt(col, lane);
    // stone plinth
    ctx.fillStyle = t ? '#3d4756' : '#333e4d';
    rr(ctx, p.x - 30, p.y + 26, 60, 14, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.07)'; rr(ctx, p.x - 30, p.y + 26, 60, 5, 3); ctx.fill();
    if (!t) {
      const pulse = 0.5 + 0.3 * Math.sin(elapsed * 2.4 + (col + lane));
      ctx.strokeStyle = 'rgba(255,215,106,' + pulse + ')'; ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      rr(ctx, p.x - 26, p.y - 34, 52, 58, 8); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,233,168,.85)'; ctx.font = 'bold 17px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('＋', p.x, p.y + 6);
    }
    if (sel && sel.col === col && sel.lane === lane) {
      ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 2.6;
      rr(ctx, p.x - 31, p.y - 40, 62, 70, 9); ctx.stroke();
    }
  }
}
function drawTurret(t) {
  const p = plotPos(t.col, t.lane);
  const st = turretState.get(keyOf(t.col, t.lane)) || { swing: 0, target: null, channel: 0 };
  ctx.save();
  ctx.translate(p.x, p.y + 34);
  if (t.type === 'lantern') ctx.drawImage(SPR.turret.lantern, -40, -104);
  else if (t.type === 'sprinkler') ctx.drawImage(SPR.turret.sprinkler, -40, -104);
  else if (t.type === 'purifier') ctx.drawImage(SPR.turret.purifier, -40, -104);
  else if (t.type === 'bell') {
    ctx.save();
    ctx.translate(0, -108);
    if (st.swing > 0) { ctx.translate(48, 10); ctx.rotate(Math.sin(st.swing * 14) * 0.05 * st.swing); ctx.translate(-48, -10); }
    ctx.drawImage(SPR.turret.bell, -48, 0);
    ctx.restore();
  }
  ctx.restore();
  // purifier beam
  if (t.type === 'purifier' && st.target && !st.target.dead) {
    const ty = LANES[st.target.lane] - 48;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,215,106,.75)'; ctx.lineWidth = 3;
    ctx.shadowColor = '#ffd76a'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 62); ctx.lineTo(st.target.x, ty); ctx.stroke();
    ctx.restore();
  }
  // level pips
  ctx.fillStyle = '#ffd76a'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('★'.repeat(t.lvl), p.x, p.y + 52);
}
function drawZombie(z) {
  const conf = ZTYPES[z.type];
  const frames = SPR.zombie[z.type];
  const purified = z.state === 'purified';
  const img = purified ? SPR.zombie[z.type + 'Pure'] : frames[Math.floor(z.walkT * 2.2) % 2];
  const y = z.laneY !== undefined ? z.laneY : LANES[z.lane];
  const s = conf.scale;
  const bob = Math.sin(z.walkT * 6) * 2.2;
  ctx.save();
  if (conf.ghost && !purified) ctx.globalAlpha = 0.82;
  ctx.translate(z.x, y + bob * 0.4);
  ctx.scale(s, s);
  ctx.drawImage(img, -48, -104);
  ctx.restore();
  if (z.hitFlash > 0) {
    ctx.save(); ctx.globalAlpha = z.hitFlash * 5; ctx.globalCompositeOperation = 'lighter';
    ctx.translate(z.x, y + bob * 0.4); ctx.scale(s, s);
    ctx.drawImage(img, -48, -104);
    ctx.restore();
  }
  if (purified) { // golden aura
    ctx.save();
    ctx.strokeStyle = 'rgba(255,215,106,' + (0.5 + 0.3 * Math.sin(elapsed * 5)) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(z.x, y - 48 * s, 30 * s, 52 * s, 0, 0, 7); ctx.stroke();
    ctx.restore();
    return;
  }
  // purify progress ring
  if (z.purifyT > 0) {
    ctx.save();
    ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.arc(z.x, y - 106 * s, 10, -Math.PI / 2, -Math.PI / 2 + z.purifyT * Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  // hp bar
  if (z.hp < z.maxHp) {
    const w = 44 * s;
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(z.x - w / 2, y - 112 * s, w, 5.4);
    ctx.fillStyle = z.purifyT > 0 ? '#ffd76a' : '#8be06a';
    ctx.fillRect(z.x - w / 2 + 0.7, y - 112 * s + 0.7, (w - 1.4) * clamp(z.hp / z.maxHp, 0, 1), 4);
  }
  if (z.slowT > 0) { ctx.fillStyle = 'rgba(170,225,255,.8)'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('❄', z.x + 20 * s, y - 92 * s); }
}
function draw() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  drawMill();
  drawGate();
  drawPlots();
  for (const t of save.turrets) drawTurret(t);
  // zombies sorted by lane then depth
  const sorted = [...zombies].sort((a, b) => (a.lane - b.lane) || ((a.laneY || 0) - (b.laneY || 0)));
  for (const z of sorted) drawZombie(z);
  // shots
  for (const s of shots) {
    if (s.kind === 'bolt') {
      const k = clamp(s.t / s.dur, 0, 1);
      const x = s.x + (s.tx - s.x) * k, y = s.y + (s.ty - s.y) * k;
      ctx.save(); ctx.shadowColor = '#ffe9a8'; ctx.shadowBlur = 14;
      ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); ctx.restore();
    } else if (s.kind === 'spray') {
      ctx.save(); ctx.strokeStyle = 'rgba(170,225,255,.65)'; ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(s.x, s.y);
        ctx.quadraticCurveTo((s.x + s.tx) / 2 + i * 7, s.y - 26, s.tx + i * 9, s.ty + Math.abs(i) * 3);
        ctx.stroke();
      }
      ctx.restore();
    } else if (s.kind === 'ring') {
      const k = clamp(s.t / s.dur, 0, 1);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,215,106,' + (0.75 * (1 - k)) + ')'; ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.radius * k, 0, 7); ctx.stroke();
      ctx.restore();
    }
  }
  // particles
  for (const p of parts) {
    ctx.globalAlpha = clamp(1 - p.t / p.life, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // floaters
  ctx.textAlign = 'center'; ctx.font = 'bold 15px system-ui, sans-serif';
  for (const f of floaters) {
    ctx.globalAlpha = clamp(1.3 - f.t, 0, 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

/* ---------------- build / upgrade UI ---------------- */
function openBuildSheet(col, lane) {
  sel = { col, lane };
  const wrap = $('buildCards');
  wrap.innerHTML = '';
  for (const type of TURRET_ORDER) {
    const c = TURRETS[type];
    const cost = turretCost(type, 1);
    const b = document.createElement('button');
    b.className = 'card';
    b.innerHTML = '<div class="tname">' + c.icon + ' ' + c.name + '</div>' +
      '<div class="tcost">🦴 ' + cost + '</div><div class="tdesc">' + c.desc + '</div>';
    b.disabled = Math.floor(save.bones) < cost;
    b.addEventListener('click', () => { buildTurret(type); });
    wrap.appendChild(b);
  }
  turretEl.classList.add('hidden');
  buildEl.classList.remove('hidden');
  syncHud();
}
function openTurretSheet(t) {
  sel = { col: t.col, lane: t.lane };
  const c = TURRETS[t.type];
  $('turretName').textContent = c.icon + ' ' + c.name + ' — Lv ' + t.lvl;
  let info;
  if (t.type === 'purifier') {
    info = 'Channels zombies into golden Mill workers in ~' + (c.channel / LVL_MUL[t.lvl - 1]).toFixed(1) +
      's each. Workers earn ' + fmt(WORKER_RATE * (1 + 0.30 * save.upg.hustle) * bonesMul() * 60) + ' 🦴/min forever — even offline.';
  } else {
    info = 'Damage ' + Math.round(c.dmg * LVL_MUL[t.lvl - 1] * dmgMul()) + ' · range ' + c.range +
      (t.type === 'bell' ? ' · tolls every ' + c.interval + 's, slows the horde' : '') +
      (t.type === 'sprinkler' ? ' · splashes groups' : '') + '.';
  }
  $('turretInfo').textContent = info;
  const upBtn = $('turretUpgradeBtn'), sellBtn = $('turretSellBtn');
  if (t.lvl >= 3) { upBtn.disabled = true; upBtn.textContent = '★ Max level'; }
  else {
    const cost = turretCost(t.type, t.lvl + 1);
    upBtn.disabled = Math.floor(save.bones) < cost;
    upBtn.textContent = '⬆ Upgrade — 🦴 ' + cost;
    upBtn.onclick = () => {
      if (Math.floor(save.bones) < cost) { sndDenied(); return; }
      save.bones -= cost; t.lvl++;
      turretState.delete(keyOf(t.col, t.lane));
      sndBuild(); floater(plotPos(t.col, t.lane).x, plotPos(t.col, t.lane).y - 70, '⬆ Lv ' + t.lvl, '#ffd76a');
      persist(); openTurretSheet(t); syncHud();
    };
  }
  const refund = Math.floor(turretInvested(t) * 0.7);
  sellBtn.textContent = 'Sell — +🦴 ' + refund;
  sellBtn.onclick = () => {
    save.turrets = save.turrets.filter(x => x !== t);
    turretState.delete(keyOf(t.col, t.lane));
    grantBones(refund, false);
    sndCoin(); closeSheets(); persist(); syncHud();
  };
  buildEl.classList.add('hidden');
  turretEl.classList.remove('hidden');
  syncHud();
}
function buildTurret(type) {
  if (!sel) return;
  const cost = turretCost(type, 1);
  if (Math.floor(save.bones) < cost) { sndDenied(); toast('Not enough 🦴!'); return; }
  if (turretAt(sel.col, sel.lane)) { closeSheets(); return; }
  save.bones -= cost;
  save.turrets.push({ col: sel.col, lane: sel.lane, type, lvl: 1 });
  save.started = true;
  sndBuild();
  burst(PLOT_X[sel.col], LANES[sel.lane] - 30, '#ffd76a', 10, 90);
  closeSheets();
  persist(); syncHud();
}
function renderUpgrades() {
  const list = $('upgList');
  list.innerHTML = '';
  for (const k of Object.keys(UPGRADES)) {
    const u = UPGRADES[k], lvl = save.upg[k];
    const row = document.createElement('div');
    row.className = 'upg';
    const maxed = lvl >= u.max;
    const cost = maxed ? 0 : u.costs[lvl];
    row.innerHTML = '<div class="info"><div class="uname">' + u.name + '</div>' +
      '<div class="udesc">' + u.desc + '</div><div class="pips">' + '●'.repeat(lvl) + '○'.repeat(u.max - lvl) + '</div></div>';
    const b = document.createElement('button');
    b.textContent = maxed ? 'MAX' : '🦴 ' + cost;
    b.disabled = maxed || Math.floor(save.bones) < cost;
    b.addEventListener('click', () => {
      if (Math.floor(save.bones) < cost) { sndDenied(); return; }
      save.bones -= cost;
      save.upg[k]++;
      if (k === 'gate') gateHp = maxGateHp();
      sndBuild(); persist(); renderUpgrades(); syncHud();
    });
    row.appendChild(b);
    list.appendChild(row);
  }
}

/* ---------------- input ---------------- */
function canvasPos(ev) {
  const r = canvas.getBoundingClientRect();
  const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX);
  const cy = (ev.touches ? ev.touches[0].clientY : ev.clientY);
  return { x: (cx - r.left) / r.width * W, y: (cy - r.top) / r.height * H };
}
function onTap(ev) {
  if (state !== 'playing' || adActive) return;
  const p = canvasPos(ev);
  ensureAudio();
  // zombies first — bonking is the fun part
  let hitZ = null;
  for (const z of zombies) {
    if (z.dead || z.state !== 'walk') continue;
    const s = ZTYPES[z.type].scale;
    if (Math.abs(p.x - z.x) < 34 * s && p.y > LANES[z.lane] - 108 * s && p.y < LANES[z.lane] + 8) {
      if (!hitZ || z.x > hitZ.x) hitZ = z;
    }
  }
  if (hitZ) { tapZombie(hitZ); return; }
  // plots / turrets
  for (let lane = 0; lane < 3; lane++) for (let col = 0; col < 4; col++) {
    const pp = plotPos(col, lane);
    if (Math.abs(p.x - pp.x) < 34 && p.y > pp.y - 46 && p.y < pp.y + 42) {
      const t = turretAt(col, lane);
      sndClick();
      if (t) openTurretSheet(t); else openBuildSheet(col, lane);
      return;
    }
  }
  closeSheets();
}
canvas.addEventListener('pointerdown', onTap);
function togglePause(force) {
  if (state === 'playing' || (force === false && state === 'paused')) {
    state = 'paused'; prePause = 'playing';
    CG.gameplayStop();
    showOnly(pausedEl);
  } else if (state === 'paused') {
    state = 'playing';
    showOnly(null);
    CG.gameplayStart();
  }
  syncHud();
}
function toMenu() {
  state = 'menu';
  zombies = []; shots = []; spawnQueue = [];
  closeSheets();
  CG.gameplayStop();
  syncMenu();
  showOnly(menuEl);
  persist(); syncHud();
}
function syncMenu() {
  $('playBtn').textContent = save.started ? '🌙 Continue — Night ' + save.night : '🌙 Start Night 1';
  const s = save.stats;
  $('menuStats').innerHTML = save.started
    ? 'Best night: <b>' + save.bestNight + '</b> · Crew: <b>' + save.workers + '</b> · ' +
      'Composted: <b>' + s.kills + '</b> · Purified: <b>' + s.purified + '</b> · Lifetime bones: <b>🦴 ' + fmt(s.earned) + '</b>'
    : 'Tap a plot, build a 🏮 Lantern Post (🦴 50), and hold the gate. Your first night is gentle… mostly.';
}

/* ---------------- wiring ---------------- */
$('playBtn').addEventListener('click', () => { ensureAudio(); startNight(true); });
$('awayCollectBtn').addEventListener('click', () => {
  const amt = awayEl.dataset.amount | 0;
  if (amt > 0) { grantBones(amt, false); sndCoin(); }
  awayEl.classList.add('hidden');
  syncMenu(); showOnly(menuEl); persist();
});
$('buildClose').addEventListener('click', () => { sndClick(); closeSheets(); });
$('turretClose').addEventListener('click', () => { sndClick(); closeSheets(); });
let upgReturn = null; // which screen the Upgrades overlay was opened from
function openUpgrades() {
  sndClick();
  upgReturn = state;
  renderUpgrades();
  showOnly(upgEl);
  if (state === 'playing') togglePauseSilent();
}
$('upgBtn').addEventListener('click', openUpgrades);
$('pausedUpgBtn').addEventListener('click', openUpgrades);
$('upgClose').addEventListener('click', () => {
  sndClick();
  const back = upgReturn; upgReturn = null;
  if (back === 'paused') showOnly(pausedEl);
  else if (back === 'menu') showOnly(menuEl);
  else if (back === 'summary') showOnly(summaryEl);
  else if (back === 'over') showOnly(overEl);
  else if (back === 'playing') { state = 'playing'; showOnly(null); CG.gameplayStart(); }
  else showOnly(null);
});
function togglePauseSilent() { // opening upgrades mid-night pauses without the pause menu
  if (state === 'playing') { state = 'paused'; CG.gameplayStop(); }
}
$('pauseBtn').addEventListener('click', () => { if (state === 'playing' || state === 'paused') togglePause(); });
$('resumeBtn').addEventListener('click', () => togglePause());
$('pausedMenuBtn').addEventListener('click', () => toMenu());
$('muteBtn').addEventListener('click', () => { save.muted = !save.muted; persist(); updateMute(); });
callWaveBtn.addEventListener('click', () => callWaveEarly());
$('nextNightBtn').addEventListener('click', () => {
  save.night++;
  persist();
  showOnly(null);
  CG.midgameAd(() => startNight(false));   // ad break at the natural dawn break
});
$('sumMenuBtn').addEventListener('click', () => { save.night++; persist(); toMenu(); });
$('prestigeBtn').addEventListener('click', () => {
  const g = prestigeGain();
  $('prestigeText').innerHTML = 'Reset to Night 1: turrets sold, upgrades and crew released, bones back to 🦴 80.<br>' +
    'In return: <b>+' + g + ' 🌟 Moon Shards</b> — every shard is a permanent <b>+20% bones</b> and <b>+15% damage</b>, forever.';
  showOnly(prestigeEl);
});
$('prestigeCancelBtn').addEventListener('click', () => showOnly(summaryEl));
$('prestigeConfirmBtn').addEventListener('click', () => {
  showOnly(null);
  CG.midgameAd(() => doPrestige());        // ad break at the prestige moment
});
$('retryBtn').addEventListener('click', () => { gateHp = maxGateHp(); startNight(false); });
$('overMenuBtn').addEventListener('click', () => toMenu());
window.addEventListener('keydown', ev => {
  if (ev.key === 'p' || ev.key === 'P' || ev.key === 'Escape') { if (state === 'playing' || state === 'paused') togglePause(); }
  if (ev.key === 'm' || ev.key === 'M') { save.muted = !save.muted; persist(); updateMute(); }
  if ((ev.key === ' ' || ev.key === 'Enter') && state === 'menu') { ev.preventDefault(); startNight(true); }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    persist();
    if (state === 'playing') { state = 'paused'; showOnly(pausedEl); }  // silent auto-pause: no SDK events on focus loss, per docs
  }
});

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
  buildSprites();
  // offline earnings: the Mill crew worked while the tab was closed
  let awayAmt = 0;
  if (save.lastSeen > 0 && save.workers > 0) {
    const elapsedMs = Date.now() - save.lastSeen;
    if (elapsedMs > 120000) awayAmt = offlineEarned(elapsedMs);
  }
  gateHp = maxGateHp();
  state = 'menu';
  syncMenu();
  showOnly(menuEl);
  if (awayAmt > 0) {
    awayEl.dataset.amount = awayAmt;
    const mins = Math.round(Math.min((Date.now() - save.lastSeen) / 60000, OFFLINE_CAP_SEC / 60));
    $('awayText').innerHTML = 'Your <b>' + save.workers + '</b> Mill workers kept grinding for <b>' + mins + ' min</b> while you were gone.' +
      '<br>They earned <b>🦴 ' + fmt(awayAmt) + '</b>.';
    awayEl.classList.remove('hidden');
  }
  syncHud();
  updateMute();
  persist();
  CG.loadingStop();
  requestAnimationFrame(loop);
})();

/* debug/testing handle (also handy for QA screenshots) */
window.GRAVEYARD = {
  get state() { return state; },
  get phase() { return phase; },
  get wave() { return wave; },
  get wavesTotal() { return wavesTotal; },
  get gateHp() { return gateHp; },
  get zombies() { return zombies; },
  get save() { return save; },
  startNight, beginWave, callWaveEarly, nightComplete, doPrestige, prestigeGain,
  buildTurret, grantBones, spawnZombie, damageZombie, tapZombie, purifyZombie,
  offlineEarned, offlineEarnedFor, workerRate, workerCap, maxGateHp, tapDmg,
  selectPlot(col, lane) { sel = { col, lane }; },
  CG
};
