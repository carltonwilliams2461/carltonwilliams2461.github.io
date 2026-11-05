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
    bones: 100, night: 1, bestNight: 0, shards: 0, milestones: 0,
    turrets: [],                        // {col, lane, type, lvl}
    upg: { light: 0, shovel: 0, gate: 0, bunks: 0, hustle: 0 },
    workers: 0,
    stats: { kills: 0, purified: 0, nights: 0, earned: 0 },
    muted: false, lastSeen: 0, started: false, tutDone: false, tutStep: 0
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
    save.tutDone = !!raw.tutDone;
    save.tutStep = clamp(raw.tutStep | 0, 0, 5);
  }
} catch (e) { /* corrupted save -> defaults */ }
/* Anyone who has already built a turret is not a new player: the
   first-night tutorial (below) only ever runs for brand-new saves. */
if (save.started) save.tutDone = true;
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
  pausedEl = $('paused'), adveilEl = $('adveil'), howtoEl = $('howto');
const tutBarEl = $('tutBar'), tutTextEl = $('tutText');
const OVERLAYS = [menuEl, awayEl, upgEl, summaryEl, prestigeEl, overEl, pausedEl, howtoEl];
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

/* ---------------- first-night tutorial ----------------
   A dismissible guided sequence for brand-new players only
   (save.tutDone / save.tutStep persist in the save). Steps:
   0 tap a plot -> 1 build a Lantern -> 2 first kill income ->
   3 bones buy more -> 4 Holy Sprinkler -> 5 Purifier/workers.
   The prompt bar never blocks input (pointer-events only on the
   ✕ button), and a pulsing ring / card glow points at the target. */
function setTutStep(n) { if (n === tutStep) return; tutStep = n; save.tutStep = n; persist(); }
function finishTut() {
  if (save.tutDone) return;
  save.tutDone = true;
  save.tutStep = tutStep;
  persist();
  tutBarEl.classList.add('hidden');
}
function tutPrompt() {
  if (save.tutDone || state !== 'playing') return null;
  const sheetOpen = !buildEl.classList.contains('hidden');
  switch (tutStep) {
    case 0: return { text: '👆 Tap a glowing plot to build!', ring: !sheetOpen };
    case 1: return { text: '🏮 Start with a Lantern Post', ring: false };
    case 2: return { text: '💀 Kills pay 🦴 Bones — watch it work!', ring: false };
    case 3: return { text: '🦴 Bones buy turrets — tap another plot', ring: !sheetOpen };
    case 4: return { text: '💦 Holy Sprinkler splashes groups — try one!', ring: !sheetOpen };
    case 5: return { text: '🏆 Purifier turns zombies into Bone Mill workers — earning forever!', ring: !sheetOpen };
  }
  return null;
}
function syncTutBar() {
  const p = tutPrompt();
  if (!p) { tutBarEl.classList.add('hidden'); return; }
  tutBarEl.classList.remove('hidden');
  if (tutTextEl.textContent !== p.text) tutTextEl.textContent = p.text;
}
function tutTick() {
  if (save.tutDone) { tutBarEl.classList.add('hidden'); return; }
  if (state === 'playing') {
    if (hasTurret('purifier')) { finishTut(); return; }   // figured it out solo — done
    const sheetOpen = !buildEl.classList.contains('hidden');
    if (tutStep <= 1 && save.turrets.length >= 1) setTutStep(2);   // built (even between frames) — move on
    else if (tutStep === 0 && sheetOpen) setTutStep(1);
    else if (tutStep === 1 && !sheetOpen) setTutStep(0);
    else if (tutStep === 2 && (nightKills > 0 || save.stats.kills > 0)) setTutStep(3);
    else if (tutStep === 3 && hasTurret('sprinkler')) setTutStep(5);
    else if (tutStep === 3 && Math.floor(save.bones) >= TURRETS.sprinkler.cost) setTutStep(4);
    else if (tutStep === 4 && (hasTurret('sprinkler') || Math.floor(save.bones) >= TURRETS.purifier.cost)) setTutStep(5);
  }
  syncTutBar();
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
let tutStep = clamp(save.tutStep | 0, 0, 5);   // first-night tutorial step (persisted)
let nightKills = 0, nightPurified = 0, nightEarned = 0;
let elapsed = 0;               // run time (s) for idle scene anim
let persistT = 0;
const keyOf = (col, lane) => col + ',' + lane;
const turretAt = (col, lane) => save.turrets.find(t => t.col === col && t.lane === lane) || null;
const hasTurret = type => save.turrets.some(t => t.type === type);
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
/* art helpers: shade() blends a #rrggbb toward black (amt<0) or white
   (amt>0); vgrad() builds a vertical gradient from [offset,color] stops;
   limb() fills a tapered solid limb segment with a round joint cap —
   the house style after the no-stick-figures standard. */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  const r = Math.round(((n >> 16) & 255) + (t - ((n >> 16) & 255)) * p);
  const g2 = Math.round(((n >> 8) & 255) + (t - ((n >> 8) & 255)) * p);
  const b = Math.round((n & 255) + (t - (n & 255)) * p);
  return 'rgb(' + r + ',' + g2 + ',' + b + ')';
}
function vgrad(g, y0, y1, stops) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  for (const s of stops) gr.addColorStop(s[0], s[1]);
  return gr;
}
function limb(g, x1, y1, x2, y2, w1, w2, col) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2);
  g.lineTo(x2 + nx * w2 / 2, y2 + ny * w2 / 2);
  g.lineTo(x2 - nx * w2 / 2, y2 - ny * w2 / 2);
  g.lineTo(x1 - nx * w1 / 2, y1 - ny * w1 / 2);
  g.closePath(); g.fill();
  g.beginPath(); g.arc(x2, y2, w2 / 2, 0, 7); g.fill();
}
function drawZombieBody(g, type, frame, purified) {
  const z = ZTYPES[type];
  const coat = purified ? '#c9a227' : z.coat;
  const skin = purified ? '#ffe9a8' : z.skin;
  g.clearRect(0, 0, 96, 112);
  g.save();
  g.translate(48, 4);
  const legSwing = frame === 0 ? -5 : 5;
  if (purified) { // warm halo behind the converted crew member
    const halo = g.createRadialGradient(2, 26, 4, 2, 26, 34);
    halo.addColorStop(0, 'rgba(255,225,130,.5)'); halo.addColorStop(1, 'rgba(255,225,130,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(2, 26, 34, 0, 7); g.fill();
  }
  // --- legs: solid tapered trousers + shaded shoes ---
  const pants = vgrad(g, 70, 100, [[0, '#3d394e'], [1, '#211e2c']]);
  limb(g, -8, 70, -9 + legSwing * 0.55, 97, 12, 10, pants);
  limb(g, 8, 70, 9 - legSwing * 0.55, 97, 12, 10, pants);
  g.fillStyle = '#503a24';
  rr(g, -17 + legSwing * 0.55, 95, 16, 7, 3); g.fill();
  rr(g, 1 - legSwing * 0.55, 95, 16, 7, 3); g.fill();
  g.fillStyle = 'rgba(255,255,255,.16)';
  rr(g, -17 + legSwing * 0.55, 95, 16, 2.2, 1); g.fill();
  rr(g, 1 - legSwing * 0.55, 95, 16, 2.2, 1); g.fill();
  // neck
  g.fillStyle = shade(skin, -0.12); g.fillRect(-3, 34, 10, 10);
  // --- coat / torso: gradient body, lapels, shirt, torn hem ---
  g.fillStyle = vgrad(g, 38, 84, [[0, shade(coat, 0.30)], [0.55, coat], [1, shade(coat, -0.30)]]);
  rr(g, -19, 40, 38, 42, 7); g.fill();
  g.fillStyle = shade(coat, -0.20);                    // torn hem band
  g.beginPath(); g.moveTo(-19, 82); g.lineTo(-8, 74); g.lineTo(0, 82); g.lineTo(9, 75); g.lineTo(19, 82); g.lineTo(19, 70); g.lineTo(-19, 70); g.closePath(); g.fill();
  g.fillStyle = vgrad(g, 42, 64, [[0, purified ? '#fff6d0' : '#e2d7ab'], [1, purified ? '#d8bc62' : '#a99c72']]); // shirt
  g.beginPath(); g.moveTo(-7, 42); g.lineTo(7, 42); g.lineTo(4, 62); g.lineTo(-4, 62); g.closePath(); g.fill();
  g.fillStyle = shade(coat, -0.25);                    // lapels
  g.beginPath(); g.moveTo(-8, 41); g.lineTo(-1, 41); g.lineTo(-5, 56); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(8, 41); g.lineTo(1, 41); g.lineTo(5, 56); g.closePath(); g.fill();
  g.fillStyle = shade(coat, 0.20);                     // stitched patch
  g.fillRect(-16, 56, 7, 6);
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 0.8;
  g.strokeRect(-16, 56, 7, 6);
  g.fillStyle = 'rgba(30,26,20,.75)';                  // buttons
  g.beginPath(); g.arc(0, 60, 1.5, 0, 7); g.fill();
  g.beginPath(); g.arc(0, 67, 1.5, 0, 7); g.fill();
  if (!purified && !z.ghost) { g.fillStyle = 'rgba(90,20,20,.45)'; g.fillRect(7, 50, 5, 7); } // stain, no gore — just grime
  // --- arms: solid tapered limbs reaching forward (+x) ---
  const reach = frame === 0 ? 27 : 22, dip = frame ? 4 : -2;
  limb(g, 6, 57, 12, 60, 10.5, 8.5, shade(coat, -0.08));        // far arm: sleeve
  limb(g, 12, 60, 8 + reach - 6, 61, 8, 6.5, shade(skin, -0.10)); // far forearm
  g.fillStyle = shade(skin, -0.10);
  g.beginPath(); g.arc(10 + reach - 6, 61, 4.8, 0, 7); g.fill();  // far hand
  limb(g, 9, 48, 16, 47 + dip * 0.4, 11.5, 9, coat);              // near arm: sleeve
  limb(g, 16, 47 + dip * 0.4, 11 + reach, 46 + dip, 8.5, 7, skin); // near forearm
  g.fillStyle = skin;
  g.beginPath(); g.arc(13 + reach, 46 + dip, 5.4, 0, 7); g.fill(); // near hand
  g.beginPath(); g.arc(16 + reach, 49 + dip, 3.2, 0, 7); g.fill(); // finger lump
  // --- head: radial-lit skull, shaded jaw, ear, messy hair ---
  const hg = g.createRadialGradient(-3, 14, 4, 2, 24, 21);
  hg.addColorStop(0, shade(skin, 0.32)); hg.addColorStop(0.7, skin); hg.addColorStop(1, shade(skin, -0.22));
  g.fillStyle = hg; g.beginPath(); g.arc(2, 24, 17, 0, 7); g.fill();
  g.fillStyle = 'rgba(0,0,0,.13)';                     // jaw shade
  g.beginPath(); g.ellipse(4, 33, 11, 7, 0, 0, Math.PI); g.fill();
  g.fillStyle = shade(skin, -0.08);                    // ear
  g.beginPath(); g.arc(-12, 26, 4.2, 0, 7); g.fill();
  g.fillStyle = shade(skin, -0.2);
  g.beginPath(); g.arc(-12, 26, 2, 0, 7); g.fill();
  g.fillStyle = shade(skin, -0.16);                    // nose bump
  g.beginPath(); g.ellipse(17.5, 28, 3.4, 2.4, 0.3, 0, 7); g.fill();
  if (!z.ghost) { // hair: spiky filled mop (tidier + golden when purified)
    g.fillStyle = purified ? '#8a6d2f' : vgrad(g, 2, 16, [[0, '#3d3d48'], [1, '#23232c']]);
    g.beginPath();
    g.moveTo(-14, 18);
    g.lineTo(-15, 8); g.lineTo(-9, 12); g.lineTo(-8, 4); g.lineTo(-3, 10);
    g.lineTo(0, 3); g.lineTo(4, 9); g.lineTo(9, 4); g.lineTo(11, 11);
    g.lineTo(16, 8); g.lineTo(15, 17);
    g.quadraticCurveTo(2, 9, -14, 18);
    g.closePath(); g.fill();
  }
  // brow shadow, then goofy eyes with glints — looking right, always
  g.fillStyle = 'rgba(0,0,0,.16)';
  g.beginPath(); g.ellipse(3, 16.5, 12, 3.4, 0, 0, 7); g.fill();
  g.fillStyle = '#fdfdf4';
  g.beginPath(); g.arc(8, 21, 5.4, 0, 7); g.fill();
  g.beginPath(); g.arc(-3, 22, 4.6, 0, 7); g.fill();
  g.fillStyle = '#20242c';
  g.beginPath(); g.arc(10, 21, 2.6, 0, 7); g.fill();
  g.beginPath(); g.arc(-1, 22, 2.2, 0, 7); g.fill();
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(10.9, 20.1, 0.95, 0, 7); g.fill();
  g.beginPath(); g.arc(-0.2, 21.2, 0.8, 0, 7); g.fill();
  // mouth — dark open grin with teeth / peaceful smile when purified
  if (purified) {
    g.strokeStyle = '#6d5516'; g.lineWidth = 2.4;
    g.beginPath(); g.arc(6, 29, 6.5, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  } else if (z.ghost) {
    g.fillStyle = 'rgba(38,48,58,.8)';
    g.beginPath(); g.ellipse(7, 32, 3.2, 4.2, 0, 0, 7); g.fill();
  } else {
    g.fillStyle = '#38211c';
    rr(g, 0, 31.5, 13, 5.4, 2.4); g.fill();
    g.fillStyle = '#fff';
    g.fillRect(3.4, 31.5, 3.4, 3.2); g.fillRect(8.6, 31.5, 3, 2.8); // two goofy teeth
  }
  g.restore();
  if (z.ghost && !purified) { // ghostly veil: gradient sheet, wavy hem
    g.save(); g.globalAlpha = 0.5;
    const veil = g.createLinearGradient(0, 6, 0, 110);
    veil.addColorStop(0, 'rgba(238,250,244,.85)'); veil.addColorStop(1, 'rgba(200,230,220,.25)');
    g.fillStyle = veil;
    g.beginPath();
    g.moveTo(24, 52);
    g.quadraticCurveTo(24, 12, 48, 8);
    g.quadraticCurveTo(72, 12, 72, 52);
    g.lineTo(72, 96);
    g.quadraticCurveTo(66, 104, 60, 96);
    g.quadraticCurveTo(54, 104, 48, 96);
    g.quadraticCurveTo(42, 104, 36, 96);
    g.quadraticCurveTo(30, 104, 24, 96);
    g.closePath(); g.fill();
    g.restore();
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
    g.fillStyle = vgrad(g, 42, 102, [[0, '#7a5a34'], [1, '#483218']]);
    g.fillRect(36, 44, 8, 58);                                                 // post (wood gradient)
    g.fillStyle = 'rgba(20,14,8,.55)'; g.fillRect(36, 58, 8, 3); g.fillRect(36, 82, 8, 3); // iron bands
    g.fillStyle = vgrad(g, 96, 107, [[0, '#5d6a76'], [1, '#39424e']]);
    rr(g, 23, 97, 34, 9, 4); g.fill();                                         // stone base
    g.fillStyle = 'rgba(255,255,255,.14)'; rr(g, 23, 97, 34, 3, 2); g.fill();
    const glow = g.createRadialGradient(40, 30, 4, 40, 30, 38);
    glow.addColorStop(0, 'rgba(255,220,120,.9)'); glow.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(40, 30, 38, 0, 7); g.fill();
    g.fillStyle = vgrad(g, 10, 48, [[0, '#3d434f'], [1, '#1d2027']]);
    rr(g, 27, 12, 26, 35, 4); g.fill();                                        // lantern cage
    g.fillStyle = vgrad(g, 16, 42, [[0, '#fff0b8'], [0.6, '#ffd76a'], [1, '#ffab3d']]);
    rr(g, 31, 16, 18, 26, 3); g.fill();                                        // flame glass
    g.fillStyle = 'rgba(255,140,40,.85)';
    g.beginPath(); g.ellipse(40, 31, 6.4, 10, 0, 0, 7); g.fill();              // flame body
    g.fillStyle = '#fff6d8';
    g.beginPath(); g.ellipse(40, 30, 3.6, 6.4, 0, 0, 7); g.fill();             // flame core
    g.fillStyle = 'rgba(24,26,34,.6)';                                         // cage bars
    g.fillRect(33.4, 15, 2, 28); g.fillRect(45.4, 15, 2, 28);
    g.fillStyle = vgrad(g, 1, 13, [[0, '#2e333d'], [1, '#171a20']]);
    g.beginPath(); g.moveTo(23, 13); g.lineTo(57, 13); g.lineTo(40, 2); g.closePath(); g.fill(); // cap
    g.fillStyle = '#c9a227'; g.beginPath(); g.arc(40, 3, 2.6, 0, 7); g.fill();  // finial
    return c;
  })();
  SPR.turret.sprinkler = (() => {
    const c = makeCanvas(80, 108), g = c.getContext('2d');
    g.fillStyle = vgrad(g, 84, 106, [[0, '#dcb84a'], [0.5, '#b08d2e'], [1, '#7c611f']]);
    rr(g, 21, 86, 38, 18, 6); g.fill();                                        // brass base
    g.fillStyle = 'rgba(255,246,200,.5)'; rr(g, 21, 86, 38, 4, 2); g.fill();
    g.fillStyle = '#6d551f';
    for (const bx of [27, 53]) { g.beginPath(); g.arc(bx, 99, 2.1, 0, 7); g.fill(); } // bolts
    g.fillStyle = vgrad(g, 52, 90, [[0, '#e8c84a'], [1, '#96762a']]);
    g.fillRect(36, 54, 8, 34);                                                 // stem
    const hg2 = g.createRadialGradient(36, 43, 3, 40, 50, 14);
    hg2.addColorStop(0, '#f6dc7e'); hg2.addColorStop(0.7, '#d8ae3e'); hg2.addColorStop(1, '#8a6d2f');
    g.fillStyle = hg2; g.beginPath(); g.arc(40, 50, 12.5, 0, 7); g.fill();     // head
    g.fillStyle = '#7a5f22'; g.beginPath(); g.arc(40, 50, 5.6, 0, 7); g.fill(); // nozzle hub
    g.fillStyle = '#5d4a1a';
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.arc(40 + i * 5, 44 - Math.abs(i), 2.2, 0, 7); g.fill(); }
    for (let i = -3; i <= 3; i++) {                                            // water arcs, two-tone + droplets
      g.strokeStyle = 'rgba(150,210,255,.26)'; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(40, 46); g.quadraticCurveTo(40 + i * 9, 29, 40 + i * 13, 44 + Math.abs(i) * 4); g.stroke();
      g.strokeStyle = 'rgba(224,246,255,.65)'; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(40, 46); g.quadraticCurveTo(40 + i * 9, 29, 40 + i * 13, 44 + Math.abs(i) * 4); g.stroke();
      g.fillStyle = 'rgba(200,236,255,.7)';
      g.beginPath(); g.arc(40 + i * 13, 44 + Math.abs(i) * 4, 1.5, 0, 7); g.fill();
    }
    return c;
  })();
  SPR.turret.bell = (() => {
    const c = makeCanvas(96, 150), g = c.getContext('2d');
    g.fillStyle = vgrad(g, 58, 148, [[0, '#5d4530'], [1, '#38281a']]);
    g.fillRect(16, 60, 9, 86); g.fillRect(71, 60, 9, 86);                        // legs
    g.strokeStyle = 'rgba(38,26,16,.85)'; g.lineWidth = 5;                      // cross braces
    g.beginPath(); g.moveTo(20, 132); g.lineTo(76, 74); g.stroke();
    g.beginPath(); g.moveTo(76, 132); g.lineTo(20, 74); g.stroke();
    g.fillStyle = vgrad(g, 50, 62, [[0, '#6b4e30'], [1, '#453120']]);
    g.fillRect(10, 52, 76, 9);                                                  // beam
    g.fillStyle = vgrad(g, 20, 54, [[0, '#54402c'], [1, '#2e2013']]);
    g.beginPath(); g.moveTo(4, 52); g.lineTo(92, 52); g.lineTo(48, 22); g.closePath(); g.fill(); // roof
    g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1.6;                       // shingle rows
    for (const ry of [33, 41, 48]) { g.beginPath(); g.moveTo(48 - (ry - 19) * 1.45, ry); g.lineTo(48 + (ry - 19) * 1.45, ry); g.stroke(); }
    g.fillStyle = vgrad(g, 138, 150, [[0, '#5d6a76'], [1, '#39424e']]);
    rr(g, 6, 140, 84, 8, 3); g.fill();                                          // stone base
    g.strokeStyle = '#2c2015'; g.lineWidth = 2.4;                               // rope
    g.beginPath(); g.moveTo(48, 61); g.lineTo(48, 67); g.stroke();
    const bellG = g.createLinearGradient(29, 0, 67, 0);                         // bell: brushed-metal sweep
    bellG.addColorStop(0, '#8a6d2f'); bellG.addColorStop(0.38, '#d8ae3e');
    bellG.addColorStop(0.52, '#ffedb0'); bellG.addColorStop(0.66, '#c9a227'); bellG.addColorStop(1, '#6d551f');
    g.fillStyle = bellG;
    g.beginPath(); g.moveTo(48, 66); g.quadraticCurveTo(34, 66, 33, 84); g.lineTo(30, 96); g.lineTo(66, 96); g.lineTo(63, 84); g.quadraticCurveTo(62, 66, 48, 66); g.fill();
    g.strokeStyle = 'rgba(90,70,20,.55)'; g.lineWidth = 1.6;                    // bell bands
    g.beginPath(); g.moveTo(31.4, 90); g.lineTo(64.6, 90); g.stroke();
    g.fillStyle = 'rgba(70,54,16,.8)';
    g.beginPath(); g.ellipse(48, 96.5, 18, 3.6, 0, 0, 7); g.fill();             // bell mouth
    g.fillStyle = '#6d551f'; g.beginPath(); g.arc(48, 100, 5, 0, 7); g.fill();    // clapper
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(40, 70, 5, 20);
    return c;
  })();
  SPR.turret.purifier = (() => {
    const c = makeCanvas(80, 108), g = c.getContext('2d');
    g.fillStyle = vgrad(g, 82, 106, [[0, '#747482'], [0.4, '#55555f'], [1, '#37373f']]);
    rr(g, 24, 84, 32, 20, 4); g.fill();                                         // stone pedestal
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(24, 94); g.lineTo(56, 94); g.stroke();              // block course
    g.beginPath(); g.moveTo(33, 86); g.lineTo(30, 93); g.lineTo(34, 99); g.stroke(); // crack
    g.fillStyle = '#82828f'; rr(g, 20, 80, 40, 6, 3); g.fill();                 // cap slab
    g.fillStyle = vgrad(g, 58, 84, [[0, '#8a8a99'], [1, '#55555f']]);
    g.fillRect(36, 60, 8, 22);                                                  // stem
    const glow = g.createRadialGradient(40, 42, 4, 40, 42, 38);
    glow.addColorStop(0, 'rgba(255,233,168,.95)'); glow.addColorStop(1, 'rgba(255,233,168,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(40, 42, 38, 0, 7); g.fill();
    const bowlG = g.createLinearGradient(22, 0, 58, 0);                         // chalice: gold sweep
    bowlG.addColorStop(0, '#8a6d2f'); bowlG.addColorStop(0.45, '#e8c84a'); bowlG.addColorStop(0.58, '#fff0b0'); bowlG.addColorStop(1, '#96762a');
    g.fillStyle = bowlG;
    g.beginPath(); g.moveTo(24, 34); g.lineTo(56, 34); g.quadraticCurveTo(52, 52, 40, 54); g.quadraticCurveTo(28, 52, 24, 34); g.fill();
    g.fillStyle = '#ffedb0'; g.beginPath(); g.ellipse(40, 34, 16, 3.8, 0, 0, 7); g.fill(); // rim
    g.fillStyle = '#d8ae3e'; g.beginPath(); g.ellipse(40, 34, 11, 2.4, 0, 0, 7); g.fill(); // rim inner
    const orbG = g.createRadialGradient(36, 25, 2, 40, 30, 11);                 // holy orb
    orbG.addColorStop(0, '#ffffff'); orbG.addColorStop(0.45, '#ffe9a8'); orbG.addColorStop(1, 'rgba(255,200,80,.25)');
    g.fillStyle = orbG; g.beginPath(); g.arc(40, 30, 10, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.9)';                                       // sparkles
    for (const [sx, sy, sr] of [[26, 20, 3.4], [55, 16, 2.8], [60, 40, 2.4]]) {
      g.beginPath();
      g.moveTo(sx, sy - sr); g.lineTo(sx + sr * 0.32, sy - sr * 0.32); g.lineTo(sx + sr, sy); g.lineTo(sx + sr * 0.32, sy + sr * 0.32);
      g.lineTo(sx, sy + sr); g.lineTo(sx - sr * 0.32, sy + sr * 0.32); g.lineTo(sx - sr, sy); g.lineTo(sx - sr * 0.32, sy - sr * 0.32);
      g.closePath(); g.fill();
    }
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
  if (save.night >= 3 && !save.tutDone) finishTut();   // well past the lessons by Night 3
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
  if (save.night === 1 && !save.tutDone && tutStep < 5) setTutStep(5);   // Night 1 held: the Purifier lesson is due
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
  fresh.tutDone = save.tutDone; fresh.tutStep = save.tutStep;
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
  tutTick();
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
/* ground dressing (visual only, fixed at boot): grass tufts, pebbles,
   and per-lane dirt speckles so the field reads as textured earth */
const TUFTS = [];
for (let i = 0; i < 110; i++) TUFTS.push({ x: rand(4, 956), y: rand(332, 596), s: rand(0.6, 1.4), lean: rand(-2.5, 2.5) });
const PEBBLES = [];
for (let i = 0; i < 46; i++) PEBBLES.push({ x: rand(6, 954), y: rand(336, 594), r: rand(1.4, 3.6), light: Math.random() < 0.4 });
const PATHDOTS = [];
for (let i = 0; i < 90; i++) PATHDOTS.push({ lane: (Math.random() * 3) | 0, x: rand(20, 940), dy: rand(-11, 11), r: rand(1, 2.6) });
let groundTex = null;
function buildGroundTex() {
  groundTex = makeCanvas(220, 220);
  const g = groundTex.getContext('2d');
  for (let i = 0; i < 620; i++) {
    g.fillStyle = Math.random() < 0.6 ? 'rgba(0,0,0,.13)' : 'rgba(190,220,170,.07)';
    g.beginPath(); g.arc(rand(0, 220), rand(0, 220), rand(0.6, 2.2), 0, 7); g.fill();
  }
  for (let i = 0; i < 60; i++) { // tiny grass flecks
    g.strokeStyle = 'rgba(120,180,110,.12)'; g.lineWidth = 1;
    const x = rand(0, 220), y = rand(0, 220);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-2, 2), y - rand(2, 5)); g.stroke();
  }
}
function farRidgeY(x) { return 268 - Math.sin((x + elapsed * 3) * 0.008) * 22 - Math.sin(x * 0.02) * 8; }
function drawBackground() {
  if (!groundTex) buildGroundTex();
  // sky — deep indigo into violet, a breath of teal at the horizon
  const sky = ctx.createLinearGradient(0, 0, 0, 330);
  sky.addColorStop(0, '#0d1230'); sky.addColorStop(0.55, '#1d1b42'); sky.addColorStop(0.85, '#2c2a52'); sky.addColorStop(1, '#31405a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 330);
  // stars — hashed scatter (no lattice), two sizes, a few sparkles
  for (let i = 0; i < 70; i++) {
    const hx = Math.sin(i * 127.1 + 311.7) * 43758.5453, hy = Math.sin(i * 269.5 + 183.3) * 28001.8384;
    const sx = (hx - Math.floor(hx)) * W, sy = (hy - Math.floor(hy)) * 215;
    const tw = 0.2 + 0.55 * Math.abs(Math.sin(elapsed * 0.7 + i * 1.7));
    ctx.fillStyle = 'rgba(255,255,255,' + tw + ')';
    const big = i % 9 === 0;
    ctx.fillRect(sx, sy, big ? 2.6 : 1.6, big ? 2.6 : 1.6);
    if (big) { ctx.fillRect(sx - 2.4, sy + 0.8, 7.4, 1); ctx.fillRect(sx + 0.8, sy - 2.4, 1, 7.4); }
  }
  // slow dark clouds crossing the moon's sky — broken, wispy puffs
  ctx.fillStyle = 'rgba(13,17,36,.30)';
  for (let i = 0; i < 3; i++) {
    const cx = ((elapsed * (3 + i * 1.6) + i * 380) % (W + 420)) - 210, cy = 44 + i * 52;
    ctx.beginPath();
    ctx.ellipse(cx - 44, cy + 3, 40, 7, 0, 0, 7);
    ctx.ellipse(cx + 6, cy, 52, 9, 0, 0, 7);
    ctx.ellipse(cx + 58, cy + 4, 34, 6, 0, 0, 7);
    ctx.fill();
  }
  // moon (top-right area, clear of the gate) — halo, craters, shaded limb
  const mx = 838, my = 74;
  const mg = ctx.createRadialGradient(mx, my, 10, mx, my, 96);
  mg.addColorStop(0, 'rgba(240,246,255,.5)'); mg.addColorStop(1, 'rgba(240,246,255,0)');
  ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, 96, 0, 7); ctx.fill();
  const moonG = ctx.createRadialGradient(mx - 13, my - 12, 8, mx, my, 44);
  moonG.addColorStop(0, '#f7fafd'); moonG.addColorStop(0.75, '#e3eaf4'); moonG.addColorStop(1, '#c3cede');
  ctx.fillStyle = moonG; ctx.beginPath(); ctx.arc(mx, my, 42, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(150,165,190,.45)';
  ctx.beginPath(); ctx.arc(mx - 13, my - 9, 8, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(mx + 15, my + 13, 6, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(mx + 6, my - 18, 4.5, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(mx - 22, my + 16, 5, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(mx + 24, my - 4, 3.4, 0, 7); ctx.fill();
  // far ridge (parallax drift) — with a silhouette cemetery along it:
  // mini tombstones, fence posts and a dead tree glued to the ridge line
  ctx.fillStyle = '#1d2b3a';
  ctx.beginPath(); ctx.moveTo(0, 268);
  for (let x = 0; x <= W; x += 60) ctx.lineTo(x, farRidgeY(x));
  ctx.lineTo(W, 330); ctx.lineTo(0, 330); ctx.fill();
  ctx.fillStyle = '#141f2b';
  for (let i = 0; i < 15; i++) {
    const sx = 24 + i * 63 + (i % 3) * 11, sy = farRidgeY(sx);
    if (i % 4 === 3) { ctx.fillRect(sx, sy - 13, 3, 13); ctx.fillRect(sx - 4, sy - 9, 11, 3); }       // cross
    else { rr(ctx, sx, sy - 10, 8, 10, 3); ctx.fill(); }                                              // round stone
  }
  ctx.strokeStyle = '#141f2b'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(430, farRidgeY(430) + 2); ctx.quadraticCurveTo(436, farRidgeY(430) - 26, 428, farRidgeY(430) - 40); ctx.stroke();
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(431, farRidgeY(430) - 22); ctx.quadraticCurveTo(446, farRidgeY(430) - 30, 456, farRidgeY(430) - 29); ctx.stroke();
  // near ridge — darker, with a leaning fence line at its base
  ctx.fillStyle = '#131e29';
  ctx.beginPath(); ctx.moveTo(0, 300);
  for (let x = 0; x <= W; x += 60) ctx.lineTo(x, 300 - Math.sin((x - elapsed * 1.5) * 0.01 + 2) * 14);
  ctx.lineTo(W, 340); ctx.lineTo(0, 340); ctx.fill();
  ctx.strokeStyle = '#0d151d'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(120, 323); ctx.lineTo(880, 323); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(120, 331); ctx.lineTo(880, 331); ctx.stroke();
  ctx.fillStyle = '#0d151d';
  for (let x = 128; x <= 880; x += 47) ctx.fillRect(x, 314, 4.6, 20);
  // dead tree silhouette, left
  ctx.strokeStyle = '#0b1220'; ctx.lineCap = 'round';
  ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(26, 336); ctx.quadraticCurveTo(34, 268, 24, 226); ctx.stroke();
  ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(27, 268); ctx.quadraticCurveTo(52, 246, 74, 244); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(26, 244); ctx.quadraticCurveTo(8, 226, -4, 208); ctx.stroke();
  ctx.lineWidth = 3.4;
  ctx.beginPath(); ctx.moveTo(66, 244); ctx.quadraticCurveTo(84, 232, 96, 234); ctx.stroke();
  ctx.lineWidth = 2.2; // twig fingers
  ctx.beginPath(); ctx.moveTo(84, 234); ctx.lineTo(102, 226); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(52, 247); ctx.lineTo(60, 234); ctx.stroke();
  // ground — mossy gradient, soft dark patches, tiled speckle texture
  const gnd = ctx.createLinearGradient(0, 320, 0, H);
  gnd.addColorStop(0, '#274434'); gnd.addColorStop(0.5, '#1b3125'); gnd.addColorStop(1, '#101f16');
  ctx.fillStyle = gnd; ctx.fillRect(0, 320, W, H - 320);
  ctx.fillStyle = 'rgba(0,0,0,.13)';
  for (const [px, py, pr] of [[180, 420, 130], [560, 520, 170], [830, 400, 110], [380, 350, 90]]) {
    ctx.beginPath(); ctx.ellipse(px, py, pr, pr * 0.36, 0, 0, 7); ctx.fill();
  }
  ctx.save(); ctx.globalAlpha = 0.55;
  for (let tx = 0; tx < W; tx += 220) for (let ty = 320; ty < H; ty += 220)
    ctx.drawImage(groundTex, tx, ty);
  ctx.restore();
  // lane paths (worn dirt) — layered earth, speckles, edge stones
  for (let li = 0; li < 3; li++) {
    const ly = LANES[li];
    ctx.fillStyle = 'rgba(104,80,54,.5)';
    ctx.beginPath(); ctx.ellipse(W / 2 + 20, ly + 6, W / 2, 16, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(150,120,82,.28)';
    ctx.beginPath(); ctx.ellipse(W / 2 + 20, ly + 4, W / 2 - 30, 10, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(70,52,34,.5)';
    for (const d of PATHDOTS) if (d.lane === li) { ctx.beginPath(); ctx.arc(d.x, ly + 5 + d.dy, d.r, 0, 7); ctx.fill(); }
    ctx.fillStyle = 'rgba(140,148,158,.5)';
    for (let ex = 26; ex < W - 10; ex += 83) {
      ctx.beginPath(); ctx.ellipse(ex + (li * 29) % 40, ly - 9, 4.6, 2.4, 0.4, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(ex + 34 + (li * 17) % 30, ly + 19, 3.8, 2, -0.3, 0, 7); ctx.fill();
    }
  }
  // tombstones — shaded stone, rim light, cracks, moss
  for (const s of STONES) {
    const y = LANES[s.lane] - 66 + (s.kind === 2 ? 26 : 0);
    const wdt = (s.kind === 2 ? 17 : 15) * s.s, hgt = (s.kind === 1 ? 23 : 20) * s.s;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(s.x + wdt / 2, y + hgt + 2, wdt * 0.62, 2.6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = vgrad(ctx, y, y + hgt, [[0, '#8b96a5'], [0.5, '#67727f'], [1, '#49525e']]);
    if (s.kind === 0) { rr(ctx, s.x, y, wdt, hgt, 6 * s.s); ctx.fill(); }
    else if (s.kind === 1) { ctx.fillRect(s.x + wdt * 0.36, y, wdt * 0.28, hgt); ctx.fillRect(s.x, y + hgt * 0.26, wdt, hgt * 0.2); }
    else { rr(ctx, s.x, y + 8 * s.s, wdt, hgt - 8 * s.s, 3); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,.20)';
    if (s.kind === 0) { rr(ctx, s.x, y, wdt, 3 * s.s, 2); ctx.fill(); }
    else if (s.kind === 2) { rr(ctx, s.x, y + 8 * s.s, wdt, 2.6 * s.s, 1); ctx.fill(); }
    ctx.strokeStyle = 'rgba(20,24,30,.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(s.x + wdt * 0.64, y + 3); ctx.lineTo(s.x + wdt * 0.55, y + hgt * 0.5); ctx.stroke();
    ctx.fillStyle = 'rgba(96,140,80,.4)';
    ctx.beginPath(); ctx.ellipse(s.x + wdt * 0.2, y + hgt - 2, 3.4 * s.s, 1.8 * s.s, 0, 0, 7); ctx.fill();
  }
  // grass tufts + pebbles scattered over the field
  ctx.strokeStyle = 'rgba(110,170,100,.5)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  for (const t of TUFTS) {
    ctx.beginPath();
    ctx.moveTo(t.x, t.y); ctx.lineTo(t.x + t.lean - 2.4, t.y - 6 * t.s);
    ctx.moveTo(t.x + 2, t.y); ctx.lineTo(t.x + t.lean + 0.6, t.y - 8 * t.s);
    ctx.moveTo(t.x + 4, t.y); ctx.lineTo(t.x + t.lean + 3.2, t.y - 5.4 * t.s);
    ctx.stroke();
  }
  for (const p of PEBBLES) {
    ctx.fillStyle = p.light ? 'rgba(190,196,180,.5)' : 'rgba(90,100,96,.55)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r, p.r * 0.62, 0.3, 0, 7); ctx.fill();
  }
  // horizon fog band + drifting ground fog
  const fogG = ctx.createLinearGradient(0, 318, 0, 356);
  fogG.addColorStop(0, 'rgba(200,220,235,0)'); fogG.addColorStop(0.5, 'rgba(200,220,235,.10)'); fogG.addColorStop(1, 'rgba(200,220,235,0)');
  ctx.fillStyle = fogG; ctx.fillRect(0, 318, W, 38);
  ctx.fillStyle = 'rgba(210,225,235,.07)';
  for (let i = 0; i < 4; i++) {
    const fx = ((elapsed * (6 + i * 3) + i * 260) % (W + 320)) - 160;
    ctx.beginPath(); ctx.ellipse(fx, 566 - i * 8, 150, 15, 0, 0, 7); ctx.fill();
  }
  ctx.fillStyle = 'rgba(210,225,235,.05)';
  for (let i = 0; i < 3; i++) {
    const fx = ((elapsed * (4 + i * 2) + i * 340 + 120) % (W + 360)) - 180;
    ctx.beginPath(); ctx.ellipse(fx, 428 - i * 36, 190, 12, 0, 0, 7); ctx.fill();
  }
  // fireflies
  for (const f of FLIES) {
    const fx = f.x + Math.sin(elapsed * f.s + f.p) * 16, fy = f.y + Math.cos(elapsed * f.s * 0.8 + f.p) * 9;
    ctx.fillStyle = 'rgba(255,220,120,' + (0.25 + 0.4 * Math.abs(Math.sin(elapsed * 1.3 + f.p))) + ')';
    ctx.beginPath(); ctx.arc(fx, fy, 1.8, 0, 7); ctx.fill();
  }
}
/* Foreground depth: near grass silhouettes + two big out-of-focus
   stones at the bottom corners, drawn over the scene's lowest strip */
function drawForeground() {
  ctx.fillStyle = 'rgba(6,10,8,.5)';
  ctx.beginPath(); ctx.ellipse(6, 618, 66, 52, 0.25, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(958, 626, 78, 58, -0.2, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(10,16,12,.85)';
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 14) {
    const bh = 7 + 9 * Math.abs(Math.sin(x * 0.37)) + 5 * Math.sin(x * 0.11);
    ctx.lineTo(x + 6, H - bh); ctx.lineTo(x + 12, H);
  }
  ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
}

function drawMill() {
  const x = 12, y = 470;
  ctx.fillStyle = 'rgba(0,0,0,.35)';                                     // ground shadow
  ctx.beginPath(); ctx.ellipse(x + 54, y + 110, 66, 8, 0, 0, 7); ctx.fill();
  // chimney smoke (idle life)
  ctx.fillStyle = 'rgba(200,210,220,.10)';
  for (let i = 0; i < 3; i++) {
    const sy = y - 18 - ((elapsed * 9 + i * 17) % 51), sx = x + 88 + Math.sin(elapsed * 0.9 + i * 2.1) * 4 + (y - sy) * 0.14;
    ctx.beginPath(); ctx.ellipse(sx, sy, 5 + (y - sy) * 0.12, 3.6 + (y - sy) * 0.07, 0, 0, 7); ctx.fill();
  }
  // shack — plank walls with seams and a lit face
  ctx.fillStyle = vgrad(ctx, y + 22, y + 106, [[0, '#54402a'], [1, '#33261a']]);
  rr(ctx, x, y + 22, 108, 84, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.2;
  for (let px = x + 15; px < x + 104; px += 15) { ctx.beginPath(); ctx.moveTo(px, y + 26); ctx.lineTo(px, y + 102); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,220,150,.07)'; rr(ctx, x, y + 22, 108, 12, 5); ctx.fill();
  // roof — shingled gradient + chimney
  ctx.fillStyle = vgrad(ctx, y - 10, y + 28, [[0, '#42311e'], [1, '#241a10']]);
  ctx.beginPath(); ctx.moveTo(x - 4, y + 26); ctx.lineTo(x + 54, y - 8); ctx.lineTo(x + 112, y + 26); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.2;
  for (const ry of [y + 6, y + 14, y + 21]) { ctx.beginPath(); ctx.moveTo(x + 54 - (ry - y + 8) * 1.55, ry); ctx.lineTo(x + 54 + (ry - y + 8) * 1.55, ry); ctx.stroke(); }
  ctx.fillStyle = '#4c4c58'; ctx.fillRect(x + 82, y - 2, 11, 18);
  ctx.fillStyle = '#5d6a76'; ctx.fillRect(x + 80, y - 5, 15, 5);
  // door — planks, hinges, ring handle, step stone
  ctx.fillStyle = '#241a10'; rr(ctx, MILL_DOOR.x - 17, y + 48, 34, 58, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.5)';
  ctx.beginPath(); ctx.moveTo(MILL_DOOR.x - 6, y + 50); ctx.lineTo(MILL_DOOR.x - 6, y + 104); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(MILL_DOOR.x + 6, y + 50); ctx.lineTo(MILL_DOOR.x + 6, y + 104); ctx.stroke();
  ctx.fillStyle = '#8a8a99'; ctx.fillRect(MILL_DOOR.x - 16, y + 58, 5, 3); ctx.fillRect(MILL_DOOR.x - 16, y + 90, 5, 3);
  ctx.strokeStyle = '#c9c9d4'; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.arc(MILL_DOOR.x + 11, y + 78, 3.4, 0, 7); ctx.stroke();
  ctx.fillStyle = '#39424e'; rr(ctx, MILL_DOOR.x - 15, y + 106, 30, 5, 2); ctx.fill();
  // glowing window — warm gradient, frame, cross muntin, crew silhouettes
  const wglow = ctx.createRadialGradient(x + 25, y + 51, 3, x + 25, y + 51, 30);
  wglow.addColorStop(0, 'rgba(255,205,100,.5)'); wglow.addColorStop(1, 'rgba(255,205,100,0)');
  ctx.fillStyle = wglow; ctx.beginPath(); ctx.arc(x + 25, y + 51, 30, 0, 7); ctx.fill();
  ctx.fillStyle = '#2c2015'; rr(ctx, x + 10, y + 38, 30, 26, 3); ctx.fill();
  ctx.fillStyle = vgrad(ctx, y + 41, y + 61, [[0, '#ffe08a'], [1, '#ff9d3c']]);
  rr(ctx, x + 13, y + 41, 24, 20, 2); ctx.fill();
  ctx.fillStyle = 'rgba(60,40,10,.9)';
  const bob = Math.sin(elapsed * 2.4) * 1.6;
  for (let i = 0; i < Math.min(3, save.workers); i++) ctx.fillRect(x + 16 + i * 8, y + 48 + bob * (i % 2 ? 1 : -1) * 0.4, 5, 9);
  ctx.strokeStyle = '#2c2015'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + 25, y + 41); ctx.lineTo(x + 25, y + 61); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x + 13, y + 51); ctx.lineTo(x + 37, y + 51); ctx.stroke();
  // bone wheel — rim with a lit arc, bone spokes with knob ends
  ctx.save();
  ctx.translate(x + 88, y + 66);
  ctx.rotate(elapsed * (save.workers > 0 ? 0.7 : 0.12));
  ctx.strokeStyle = '#b8ac7e'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.stroke();
  ctx.strokeStyle = '#efe8c8'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(0, 0, 15, -0.6, 0.9); ctx.stroke();
  ctx.lineWidth = 4.4; ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, ex = Math.cos(a) * 13.4, ey = Math.sin(a) * 13.4;
    ctx.strokeStyle = '#d8cf9f';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = '#e8e2cc';
    ctx.beginPath(); ctx.arc(ex, ey, 3.1, 0, 7); ctx.fill();
  }
  ctx.fillStyle = '#8a6d2f'; ctx.beginPath(); ctx.arc(0, 0, 3.6, 0, 7); ctx.fill();
  ctx.restore();
  // sign plaque
  ctx.fillStyle = vgrad(ctx, y - 26, y - 8, [[0, '#5d4530'], [1, '#3a2a1a']]);
  rr(ctx, x + 6, y - 26, 96, 17, 4); ctx.fill();
  ctx.strokeStyle = '#241a10'; ctx.lineWidth = 1.6; rr(ctx, x + 6, y - 26, 96, 17, 4); ctx.stroke();
  ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 11.5px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('BONE MILL', x + 54, y - 13.5);
  ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#ffd76a';
  ctx.fillText('⚰️ ' + save.workers + '/' + workerCap(), x + 54, y + 122);
}
function drawGate() {
  const hpFrac = clamp(gateHp / maxGateHp(), 0, 1);
  ctx.fillStyle = 'rgba(0,0,0,.35)';                                     // ground shadow + rubble
  ctx.beginPath(); ctx.ellipse(GATE_X + 28, 562, 52, 7, 0, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(120,128,140,.5)';
  ctx.beginPath(); ctx.ellipse(GATE_X - 2, 560, 7, 3.4, 0.4, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(GATE_X + 62, 558, 5.4, 2.8, -0.3, 0, 7); ctx.fill();
  // stone pillars — coursed blocks, cap stones, mossy feet
  for (const px of [GATE_X - 12, GATE_X + 38]) {
    ctx.fillStyle = vgrad(ctx, 296, 560, [[0, '#6e7684'], [0.5, '#565d68'], [1, '#3e454f']]);
    rr(ctx, px, 296, 30, 264, 4); ctx.fill();
    ctx.strokeStyle = 'rgba(16,20,26,.45)'; ctx.lineWidth = 1.6;
    for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(px + 1, 296 + i * 44); ctx.lineTo(px + 29, 296 + i * 44); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(px + 15, 296); ctx.lineTo(px + 15, 340); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px + 15, 384); ctx.lineTo(px + 15, 428); ctx.stroke();
    ctx.fillStyle = '#7d8694'; rr(ctx, px - 3, 288, 36, 12, 3); ctx.fill();   // cap stone
    ctx.fillStyle = 'rgba(255,255,255,.16)'; rr(ctx, px - 3, 288, 36, 3.4, 2); ctx.fill();
    ctx.fillStyle = 'rgba(96,140,80,.35)';
    ctx.beginPath(); ctx.ellipse(px + 6, 548, 6, 9, 0.2, 0, 7); ctx.fill();
  }
  // iron bars — dark iron with a moonlit edge; rails with rivets
  for (let bx = GATE_X + 20; bx <= GATE_X + 36; bx += 8) {
    ctx.fillStyle = '#20242c'; ctx.fillRect(bx, 306, 4.6, 246);
    ctx.fillStyle = 'rgba(190,205,225,.4)'; ctx.fillRect(bx, 306, 1.3, 246);
  }
  for (const ry of [330, 520]) {
    ctx.fillStyle = vgrad(ctx, ry - 4, ry + 4, [[0, '#39404c'], [1, '#1b1f26']]);
    ctx.fillRect(GATE_X + 15, ry - 4, 28, 8);
    ctx.fillStyle = '#59626f';
    ctx.beginPath(); ctx.arc(GATE_X + 20, ry, 1.7, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(GATE_X + 38, ry, 1.7, 0, 7); ctx.fill();
  }
  // spikes
  ctx.fillStyle = '#23272f';
  for (let bx = GATE_X + 19; bx <= GATE_X + 38; bx += 8) { ctx.beginPath(); ctx.moveTo(bx - 3, 306); ctx.lineTo(bx + 3.4, 306); ctx.lineTo(bx + 0.2, 291); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = 'rgba(190,205,225,.35)';
  for (let bx = GATE_X + 19; bx <= GATE_X + 38; bx += 8) { ctx.beginPath(); ctx.moveTo(bx - 3, 306); ctx.lineTo(bx + 0.2, 291); ctx.lineTo(bx + 0.4, 306); ctx.closePath(); ctx.fill(); }
  // damage: scorch + tilt as HP falls
  if (hpFrac < 0.55) {
    ctx.fillStyle = 'rgba(255,110,60,' + (0.25 + 0.2 * Math.sin(elapsed * 9)) + ')';
    ctx.beginPath(); ctx.ellipse(GATE_X + 28, 548, 20, 8, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(20,16,20,.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(GATE_X - 6, 360); ctx.lineTo(GATE_X + 6, 410); ctx.lineTo(GATE_X - 2, 452); ctx.stroke();
  }
  // hanging bronze plaque
  ctx.strokeStyle = '#17130e'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(GATE_X + 12, 252); ctx.lineTo(GATE_X + 17, 262); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(GATE_X + 44, 252); ctx.lineTo(GATE_X + 39, 262); ctx.stroke();
  ctx.fillStyle = vgrad(ctx, 262, 280, [[0, '#4a3d28'], [1, '#2c2416']]);
  rr(ctx, GATE_X + 1, 262, 54, 18, 4); ctx.fill();
  ctx.strokeStyle = '#8a6d2f'; ctx.lineWidth = 1.4; rr(ctx, GATE_X + 1, 262, 54, 18, 4); ctx.stroke();
  ctx.fillStyle = '#ffd76a'; ctx.font = 'bold 10.5px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('THE GATE', GATE_X + 28, 275);
}
function drawPlots() {
  const canAfford = Math.floor(save.bones) >= TURRETS.lantern.cost;   // cheapest build — gates the plot pulse
  for (let lane = 0; lane < 3; lane++) for (let col = 0; col < 4; col++) {
    const p = plotPos(col, lane);
    const t = turretAt(col, lane);
    // stone plinth — coursed, beveled, moss at the foot
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 41, 34, 4.6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = vgrad(ctx, p.y + 26, p.y + 40, t ? [[0, '#4c5a6e'], [1, '#313c4c']] : [[0, '#414f61'], [1, '#29333f']]);
    rr(ctx, p.x - 30, p.y + 26, 60, 14, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.10)'; rr(ctx, p.x - 30, p.y + 26, 60, 4, 3); ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,20,.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x - 30, p.y + 33); ctx.lineTo(p.x + 30, p.y + 33); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x - 4, p.y + 27); ctx.lineTo(p.x - 4, p.y + 32); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x + 12, p.y + 34); ctx.lineTo(p.x + 12, p.y + 39); ctx.stroke();
    ctx.fillStyle = 'rgba(96,140,80,.35)';
    ctx.beginPath(); ctx.ellipse(p.x - 22, p.y + 38, 6, 2.2, 0, 0, 7); ctx.fill();
    if (!t) {
      // empty plots pulse invitingly only while the player can afford a build;
      // otherwise they sit dim so nobody waits on a glow they can't use
      const pulse = canAfford ? 0.5 + 0.3 * Math.sin(elapsed * 2.4 + (col + lane)) : 0.16;
      ctx.strokeStyle = 'rgba(255,215,106,' + pulse + ')'; ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      rr(ctx, p.x - 26, p.y - 34, 52, 58, 8); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,233,168,' + (canAfford ? 0.85 : 0.3) + ')'; ctx.font = 'bold 17px system-ui'; ctx.textAlign = 'center';
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
  ctx.fillStyle = 'rgba(0,0,0,.30)';                                     // contact shadow
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 38, 27, 5.6, 0, 0, 7); ctx.fill();
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
  // purifier beam — wide halo pass + bright core + impact glow
  if (t.type === 'purifier' && st.target && !st.target.dead) {
    const ty = LANES[st.target.lane] - 48;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,205,90,.16)'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 62); ctx.lineTo(st.target.x, ty); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,230,160,.9)'; ctx.lineWidth = 2.6;
    ctx.shadowColor = '#ffd76a'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - 62); ctx.lineTo(st.target.x, ty); ctx.stroke();
    ctx.fillStyle = 'rgba(255,240,190,.5)';
    ctx.beginPath(); ctx.arc(st.target.x, ty, 9 + 2.4 * Math.sin(elapsed * 9), 0, 7); ctx.fill();
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
  ctx.fillStyle = 'rgba(0,0,0,.34)';                                     // contact shadow
  ctx.beginPath(); ctx.ellipse(2, 5, 27, 6, 0, 0, 7); ctx.fill();
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
  drawTutRing();
  for (const t of save.turrets) drawTurret(t);
  // zombies sorted by lane then depth
  const sorted = [...zombies].sort((a, b) => (a.lane - b.lane) || ((a.laneY || 0) - (b.laneY || 0)));
  for (const z of sorted) drawZombie(z);
  // shots
  for (const s of shots) {
    if (s.kind === 'bolt') {
      const k = clamp(s.t / s.dur, 0, 1);
      const x = s.x + (s.tx - s.x) * k, y = s.y + (s.ty - s.y) * k;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,233,168,.45)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(x, y); ctx.stroke();   // light trail
      ctx.shadowColor = '#ffe9a8'; ctx.shadowBlur = 14;
      ctx.fillStyle = 'rgba(255,220,130,.4)'; ctx.beginPath(); ctx.arc(x, y, 8.6, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(x, y, 4.8, 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill();
      ctx.restore();
    } else if (s.kind === 'spray') {
      ctx.save();
      for (let i = -2; i <= 2; i++) {
        const ex = s.tx + i * 9, ey = s.ty + Math.abs(i) * 3;
        ctx.strokeStyle = 'rgba(150,210,255,.20)'; ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(s.x, s.y);
        ctx.quadraticCurveTo((s.x + s.tx) / 2 + i * 7, s.y - 26, ex, ey);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(220,245,255,.68)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(s.x, s.y);
        ctx.quadraticCurveTo((s.x + s.tx) / 2 + i * 7, s.y - 26, ex, ey);
        ctx.stroke();
        ctx.fillStyle = 'rgba(205,238,255,.85)';
        ctx.beginPath(); ctx.arc(ex, ey, 1.8, 0, 7); ctx.fill();
      }
      ctx.restore();
    } else if (s.kind === 'ring') {
      const k = clamp(s.t / s.dur, 0, 1);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,215,106,' + (0.75 * (1 - k)) + ')'; ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.radius * k, 0, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,240,200,' + (0.4 * (1 - k)) + ')'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.radius * k * 0.68, 0, 7); ctx.stroke();
      ctx.restore();
    }
  }
  // particles — soft halo + bright core so bursts read as light, not dots
  for (const p of parts) {
    const a = clamp(1 - p.t / p.life, 0, 1);
    ctx.globalAlpha = a * 0.28;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 2.1, 0, 7); ctx.fill();
    ctx.globalAlpha = a;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawForeground();
  // vignette — moonlit corners
  const vg = ctx.createRadialGradient(W / 2, H / 2 - 20, H * 0.42, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(3,5,10,0)'); vg.addColorStop(1, 'rgba(3,5,10,.30)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  // floaters
  ctx.textAlign = 'center'; ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 4;
  for (const f of floaters) {
    ctx.globalAlpha = clamp(1.3 - f.t, 0, 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/* Tutorial pointing ring: a pulsing gold ellipse + bouncing 👇 over the
   first empty plot (middle lane first) while the current step wants a build. */
function drawTutRing() {
  const p = tutPrompt();
  if (!p || !p.ring) return;
  let tgt = null;
  for (const lane of [1, 0, 2]) {
    for (let col = 0; col < 4; col++) if (!turretAt(col, lane)) { tgt = { col, lane }; break; }
    if (tgt) break;
  }
  if (!tgt) return;
  const pp = plotPos(tgt.col, tgt.lane);
  const pulse = 1 + 0.08 * Math.sin(elapsed * 5);
  ctx.save();
  ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 3.4;
  ctx.shadowColor = '#ffd76a'; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.ellipse(pp.x, pp.y - 6, 40 * pulse, 44 * pulse, 0, 0, 7); ctx.stroke();
  ctx.font = '22px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('👇', pp.x, pp.y - 62 + Math.sin(elapsed * 5) * 5);
  ctx.restore();
}

/* ---------------- build / upgrade UI ---------------- */
function openBuildSheet(col, lane) {
  sel = { col, lane };
  const wrap = $('buildCards');
  wrap.innerHTML = '';
  for (const type of TURRET_ORDER) {
    const c = TURRETS[type];
    const cost = turretCost(type, 1);
    const afford = Math.floor(save.bones) >= cost;
    const b = document.createElement('button');
    b.className = 'card';
    b.innerHTML = '<div class="tname">' + c.icon + ' ' + c.name + '</div>' +
      '<div class="tcost' + (afford ? '' : ' cant') + '">🦴 ' + cost +
      (afford ? '' : ' · Need ' + (cost - Math.floor(save.bones)) + ' more') +
      '</div><div class="tdesc">' + c.desc + '</div>';
    b.disabled = !afford;
    if (!afford) b.classList.add('cant');
    if (!save.tutDone && ((type === 'lantern' && tutStep <= 1) ||
        (type === 'sprinkler' && tutStep === 4) || (type === 'purifier' && tutStep === 5))) {
      b.classList.add('tut-glow');
    }
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
$('howBtn').addEventListener('click', () => { sndClick(); showOnly(howtoEl); });
$('howClose').addEventListener('click', () => { sndClick(); showOnly(menuEl); });
$('tutX').addEventListener('click', () => { sndClick(); finishTut(); });
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
  $('prestigeText').innerHTML = 'Reset to Night 1: turrets sold, upgrades and crew released, bones back to 🦴 100.<br>' +
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
  get tutStep() { return tutStep; },
  get tutDone() { return save.tutDone; },
  tutPromptText() { const p = tutPrompt(); return p ? p.text : null; },
  finishTut, openBuildSheet, closeSheets,
  startNight, beginWave, callWaveEarly, nightComplete, doPrestige, prestigeGain,
  buildTurret, grantBones, spawnZombie, damageZombie, tapZombie, purifyZombie,
  offlineEarned, offlineEarnedFor, workerRate, workerCap, maxGateHp, tapDmg,
  selectPlot(col, lane) { sel = { col, lane }; },
  CG
};
