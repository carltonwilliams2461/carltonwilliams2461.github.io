/* GRAVEYARD SHIFT — Idle Defense · 3D diorama edition
   C E Williams Games · CrazyGames lane.
   A real low-poly 3D graveyard diorama (Three.js r170, vendored — no CDN)
   viewed from a fixed cinematic angle. Idle systems carried from the 2D
   build and deepened: upgrade TREE, boss nights (The Undertaker), daily
   quests, 3 rotating grounds, composed music, offline earnings (8h cap),
   New Moon prestige, and the Purifier twist — mercy grows the economy. */
import * as THREE from './three.module.min.js';

/* ---------------- utils ---------------- */
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = n => Math.floor(n).toLocaleString('en-US');
function lsGet(k, f) { try { const v = localStorage.getItem(k); return v === null ? f : v; } catch (e) { return f; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
let seed = 1234567;
function srand(s) { seed = s >>> 0 || 1; }
function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ---------------- game data (carried from the 2D build, deepened) ---------------- */
const TURRETS = {
  lantern:  { name: 'Lantern Post',     icon: '🏮', cost: 50,  desc: 'Zaps one zombie at a time with holy light. Steady, long reach.', dmg: 7,  interval: 0.45, range: 8.6 },
  sprinkler:{ name: 'Holy Sprinkler',   icon: '💦', cost: 80,  desc: 'Rapid holy-water spray, short reach. Splashes close groups.',   dmg: 3,  interval: 0.16, range: 4.7, splash: 1.1 },
  bell:     { name: 'Bell Tower',       icon: '🔔', cost: 110, desc: 'Slow toll hits EVERY zombie near the target and slows them.',   dmg: 14, interval: 2.6,  range: 10.0, radius: 4.0, slow: 0.35, slowDur: 1.6 },
  purifier: { name: 'Purifier Chalice', icon: '🏆', cost: 130, desc: 'Deals NO damage. Channels a zombie into a golden Bone Mill worker who earns 🦴 forever — but a purifying plot is not shooting.', dmg: 0, interval: 0, range: 9.2, channel: 3.6 }
};
const TURRET_ORDER = ['lantern', 'sprinkler', 'bell', 'purifier'];
const LVL_MUL = [1, 1.8, 3.0];
const LVL_COST = [1.0, 0.9, 1.5];
const ZTYPES = {
  shambler: { hp: 22,  speed: 0.62, bounty: 5,  gate: 8,  scale: 1.0,  coat: 0x7d6891, skin: 0x8fce6e },
  runner:   { hp: 14,  speed: 1.32, bounty: 6,  gate: 6,  scale: 0.92, coat: 0x8f4f4a, skin: 0xa5d66d },
  ghost:    { hp: 36,  speed: 0.76, bounty: 9,  gate: 10, scale: 1.0,  coat: 0xcfd8dc, skin: 0xe8f6ee, ghost: true },
  brute:    { hp: 115, speed: 0.37, bounty: 18, gate: 25, scale: 1.45, coat: 0x5f7059, skin: 0x7fb45e }
};
const BOSS = { name: 'The Undertaker', hp: 1500, speed: 0.30, bounty: 250, gate: 40, scale: 2.15 };
/* Upgrade TREE — branches with prerequisite gates (the depth layer) */
const TREE = {
  light:  { branch: 'HOLY LIGHT', name: '💡 Sharper Light',    max: 5, costs: [60, 160, 300, 480, 700],   req: null,              desc: '+20% damage for every turret, per level.' },
  lens:   { branch: 'HOLY LIGHT', name: '🔭 Focused Lens',     max: 3, costs: [200, 420, 700],            req: ['light', 2],      desc: '+12% range for every turret, per level.' },
  shovel: { branch: 'THE BONK',   name: '🪏 Cursed Shovel',    max: 5, costs: [50, 130, 250, 400, 600],   req: null,              desc: 'Your zombie-bonk tap hits +5 harder per level.' },
  grip:   { branch: 'THE BONK',   name: '✊ Gravekeeper Grip', max: 3, costs: [220, 450, 750],            req: ['shovel', 2],     desc: 'Bonks splash 50% damage to zombies nearby.' },
  gate:   { branch: 'THE GATE',   name: '⛓️ Iron Gate',        max: 5, costs: [70, 180, 320, 500, 750],   req: null,              desc: '+50 max gate HP per level. The gate mends at dawn.' },
  thorns: { branch: 'THE GATE',   name: '🌹 Thorn Hedge',      max: 3, costs: [240, 480, 800],            req: ['gate', 2],       desc: 'Zombies chewing the gate take 8 thorn damage/sec per level.' },
  bunks:  { branch: 'THE MILL',   name: '🛏️ Mill Bunks',       max: 5, costs: [80, 200, 380, 600, 900],   req: null,              desc: '+4 Bone Mill worker cap per level (base cap 4).' },
  hustle: { branch: 'THE MILL',   name: '⚒️ Worker Hustle',    max: 5, costs: [90, 220, 420, 680, 1000],  req: ['bunks', 2],      desc: '+30% bones from your Mill crew, per level.' },
  magnet: { branch: 'THE MILL',   name: '🧲 Bone Magnet',      max: 3, costs: [150, 350, 600],            req: null,              desc: '+10% bones from every kill and bounty, per level.' }
};
const BRANCHES = ['HOLY LIGHT', 'THE BONK', 'THE GATE', 'THE MILL'];
const WORKER_RATE = 0.25;              // bones / sec / worker (15 per minute)
const OFFLINE_CAP_SEC = 8 * 3600;      // offline earnings cap: 8 hours
const LOCATIONS = [
  { name: 'The Graveyard',  fog: 0x131c30, fogD: 0.020, ground: 0x51663c, hemiSky: 0x8fa3d9, moon: 0xdfe8ff },
  { name: 'The Old Chapel', fog: 0x241a26, fogD: 0.019, ground: 0x5c5a36, hemiSky: 0xd9a37f, moon: 0xffe3c0 },
  { name: 'The Sunken Crypt', fog: 0x0c2426, fogD: 0.027, ground: 0x3d5a48, hemiSky: 0x7fd0c0, moon: 0xcffcf2 }
];
const QUEST_POOL = [
  { id: 'kills',   icon: '⚔️', text: 'Compost 150 zombies',        goal: 150, track: 'kills',    reward: { bones: 120 } },
  { id: 'purify',  icon: '✨', text: 'Purify 8 zombies',           goal: 8,   track: 'purified', reward: { bones: 100 } },
  { id: 'bonks',   icon: '👆', text: 'Bonk 40 zombies',            goal: 40,  track: 'bonks',    reward: { bones: 80 } },
  { id: 'earn',    icon: '🦴', text: 'Earn 900 bones',             goal: 900, track: 'earned',   reward: { bones: 150 } },
  { id: 'nights',  icon: '🌅', text: 'Hold 2 nights',              goal: 2,   track: 'nights',   reward: { shards: 1 } },
  { id: 'waves',   icon: '🌊', text: 'Clear 12 waves',             goal: 12,  track: 'waves',    reward: { bones: 100 } },
  { id: 'boss',    icon: '👹', text: 'Slay The Undertaker',        goal: 1,   track: 'boss',     reward: { bones: 200 } }
];

/* ---------------- persistent save ---------------- */
const SAVE_KEY = 'graveyardSave3DV1';
function todayKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function questsForToday() {
  const day = todayKey();
  const rngS = hashStr('gsquests-' + day);
  const order = QUEST_POOL.map((q, i) => i);
  let s = rngS;
  const rr = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rr() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return { day, list: order.slice(0, 3).map(i => ({ id: QUEST_POOL[i].id, prog: 0, claimed: false })) };
}
function defaultSave() {
  return {
    bones: 100, night: 1, bestNight: 0, shards: 0, milestones: 0,
    turrets: [],
    upg: { light: 0, lens: 0, shovel: 0, grip: 0, gate: 0, thorns: 0, bunks: 0, hustle: 0, magnet: 0 },
    workers: 0,
    stats: { kills: 0, purified: 0, nights: 0, earned: 0, bonks: 0, waves: 0, boss: 0 },
    quests: questsForToday(),
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
      save.turrets = raw.turrets.filter(t => t && TURRETS[t.type] && t.col >= 0 && t.col < 4 && t.lane >= 0 && t.lane < 3)
        .map(t => ({ col: t.col | 0, lane: t.lane | 0, type: t.type, lvl: clamp(t.lvl | 0 || 1, 1, 3) }));
    }
    for (const k of Object.keys(d.upg)) save.upg[k] = clamp((raw.upg && raw.upg[k]) | 0, 0, TREE[k].max);
    save.workers = clamp(raw.workers | 0, 0, 999);
    if (raw.stats) for (const k of Object.keys(d.stats)) save.stats[k] = Math.max(0, raw.stats[k] | 0);
    if (raw.quests && raw.quests.day === todayKey() && Array.isArray(raw.quests.list)) save.quests = raw.quests;
    save.muted = !!raw.muted;
    save.lastSeen = Math.max(0, +raw.lastSeen || 0);
    save.started = !!raw.started;
    save.tutDone = !!raw.tutDone;
    save.tutStep = clamp(raw.tutStep | 0, 0, 5);
  }
} catch (e) { /* corrupted save -> defaults */ }
if (save.started) save.tutDone = true;
function persist() { save.lastSeen = Date.now(); lsSet(SAVE_KEY, JSON.stringify(save)); }

/* ---------------- derived economy ---------------- */
const bonesMul = () => (1 + 0.20 * save.shards) * (1 + 0.10 * save.upg.magnet);
const dmgMul = () => (1 + 0.20 * save.upg.light) * (1 + 0.15 * save.shards);
const rangeMul = () => 1 + 0.12 * save.upg.lens;
const tapDmg = () => Math.round((5 + 5 * save.upg.shovel) * (1 + 0.15 * save.shards));
const maxGateHp = () => 100 + 50 * save.upg.gate;
const workerCap = () => 4 + 4 * save.upg.bunks;
const workerRate = () => save.workers * WORKER_RATE * (1 + 0.30 * save.upg.hustle) * bonesMul();
const turretCost = (type, lvl) => Math.round(TURRETS[type].cost * LVL_COST[lvl - 1]);
const turretInvested = t => { let s = 0; for (let l = 1; l <= t.lvl; l++) s += turretCost(t.type, l); return s; };
function offlineEarnedFor(elapsedMs, ratePerSec) {
  const secs = clamp(elapsedMs / 1000, 0, OFFLINE_CAP_SEC);
  return Math.floor(ratePerSec * secs);
}
function offlineEarned(elapsedMs) { return offlineEarnedFor(elapsedMs, workerRate()); }
function prestigeGain() { return Math.max(0, Math.floor(save.bestNight / 5) - save.milestones); }
function questDef(id) { return QUEST_POOL.find(q => q.id === id); }
function questTrack(track, n) {
  let changed = false;
  for (const q of save.quests.list) {
    const def = questDef(q.id);
    if (def && def.track === track && !q.claimed && q.prog < def.goal) { q.prog = Math.min(def.goal, q.prog + n); changed = true; }
  }
  if (changed) { syncQuestBadge(); persist(); }
}

/* ---------------- CrazyGames SDK v3 wrapper ----------------
   Proven studio pattern: init() first; loading/gameplay calls bracket
   activity; midgame ads ONLY at natural breaks (dawn summary, prestige)
   with a 3-minute client throttle; the portal's game.settings.muteAudio
   outranks the in-game toggle. Every call feature-detected + try/caught —
   off-portal the SDK reports 'disabled' and throws, so it reads as absent. */
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
    return this.ready;
  },
  loadingStart() { try { if (this.ready) this.sdk.game.loadingStart(); } catch (e) {} },
  loadingStop() { try { if (this.ready) this.sdk.game.loadingStop(); } catch (e) {} },
  gameplayStart() { try { if (this.ready) this.sdk.game.gameplayStart(); } catch (e) {} },
  gameplayStop() { try { if (this.ready) this.sdk.game.gameplayStop(); } catch (e) {} },
  happytime() { try { if (this.ready) this.sdk.game.happytime(); } catch (e) {} },
  sdkMuted() {
    try { return !!(this.ready && this.sdk.game && this.sdk.game.settings && this.sdk.game.settings.muteAudio); }
    catch (e) { return false; }
  },
  requestAd(onDone) {
    if (!this.ready || !this.sdk.ad) { onDone && onDone(); return; }
    if (performance.now() - this.lastAdAt < 180000) { onDone && onDone(); return; }
    this.lastAdAt = performance.now();
    adActive = true; updateMute(); setAdVeil(true);
    let finished = false;
    const done = () => { if (finished) return; finished = true; adActive = false; updateMute(); setAdVeil(false); onDone && onDone(); };
    try {
      this.sdk.ad.requestAd('midgame', {
        adStarted: () => {},
        adFinished: done,
        adError: done
      });
    } catch (e) { done(); }
    setTimeout(done, 30000); /* never trap the player behind a hung ad */
  }
};
let adActive = false;
function setAdVeil(on) { $('adveil').classList.toggle('hidden', !on); }

/* ---------------- audio: composed music + synth SFX ----------------
   The music is a REAL composed loop: an 8-bar music-box waltz in A minor
   (melody + bass + pad, scheduled with lookahead) over a low graveyard
   drone. Combat adds a heartbeat pulse. SFX synthesized per verb. */
let audioCtx = null, masterGain = null, musicGain = null, sfxGain = null;
function ensureAudio() {
  if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return true; }
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain(); masterGain.gain.value = 0.9; masterGain.connect(audioCtx.destination);
    musicGain = audioCtx.createGain(); musicGain.gain.value = 0.5; musicGain.connect(masterGain);
    sfxGain = audioCtx.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(masterGain);
    startMusic();
    return true;
  } catch (e) { return false; }
}
function effectiveMuted() { return save.muted || CG.sdkMuted() || adActive; }
function updateMute() { if (masterGain) masterGain.gain.value = effectiveMuted() ? 0 : 0.9; $('muteBtn').textContent = effectiveMuted() ? '🔇' : '🔊'; }
const mf = m => 440 * Math.pow(2, (m - 69) / 12);
/* A-minor music-box waltz: [beat, midi, beats] — 8 bars of 3 beats */
const WALTZ = [
  [0, 69, 1], [1, 72, 1], [2, 76, 1],
  [3, 81, 2], [5, 76, 1],
  [6, 77, 1], [7, 76, 1], [8, 74, 1],
  [9, 76, 2], [11, 71, 1],
  [12, 69, 1], [13, 72, 1], [14, 76, 1],
  [15, 81, 2], [17, 84, 1],
  [18, 83, 1], [19, 81, 1], [20, 76, 1],
  [21, 77, 1.5], [22.5, 76, 1.5]
];
const WALTZ_BARS = [ /* [bass midi, pad chord midis] per bar */
  [45, [57, 60, 64]], [45, [57, 60, 64]], [41, [53, 57, 60]], [40, [52, 56, 59]],
  [45, [57, 60, 64]], [45, [57, 60, 64]], [41, [53, 57, 60]], [40, [52, 56, 59]]
];
const BEAT = 0.58, LOOP_BEATS = 24;
let musicOn = false, musicBar = 0, nextNoteAt = 0, musicTimer = null;
function pluck(freq, t, vol, dur) {
  const o = audioCtx.createOscillator(), o2 = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = 'sine'; o.frequency.value = freq;
  o2.type = 'sine'; o2.frequency.value = freq * 3;
  const g2 = audioCtx.createGain(); g2.gain.value = 0.18;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0004, t + dur);
  o.connect(g); o2.connect(g2); g2.connect(g); g.connect(musicGain);
  o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
}
function padChord(midis, t, dur) {
  for (const m of midis) {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain(), f = audioCtx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.value = mf(m);
    f.type = 'lowpass'; f.frequency.value = 620;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.016, t + 0.9);
    g.gain.setValueAtTime(0.016, t + dur - 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f); f.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + dur + 0.05);
  }
}
function startMusic() {
  if (musicOn || !audioCtx) return;
  musicOn = true; nextNoteAt = audioCtx.currentTime + 0.1; musicBar = 0;
  musicTimer = setInterval(() => {
    if (!audioCtx || effectiveMuted()) { nextNoteAt = Math.max(nextNoteAt, audioCtx ? audioCtx.currentTime + 0.1 : 0); return; }
    while (nextNoteAt < audioCtx.currentTime + 0.35) {
      const barStart = nextNoteAt, bar = musicBar % 8;
      const [bass, chord] = WALTZ_BARS[bar];
      pluck(mf(bass), barStart, 0.11, 1.4);
      padChord(chord, barStart, BEAT * 3);
      for (const [b, m, len] of WALTZ) {
        if (Math.floor(b / 3) === bar) pluck(mf(m), barStart + (b % 3) * BEAT, 0.075, Math.max(0.5, len * BEAT * 0.95));
      }
      /* soft drone root, one per loop */
      if (bar === 0) {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = mf(33);
        g.gain.setValueAtTime(0, barStart);
        g.gain.linearRampToValueAtTime(0.02, barStart + 2);
        g.gain.linearRampToValueAtTime(0, barStart + BEAT * LOOP_BEATS);
        o.connect(g); g.connect(musicGain); o.start(barStart); o.stop(barStart + BEAT * LOOP_BEATS + 0.1);
      }
      nextNoteAt += BEAT * 3; musicBar++;
    }
  }, 120);
}
function tone(freq, dur, opts) {
  if (!ensureAudio() || effectiveMuted()) return;
  opts = opts || {};
  try {
    const t0 = audioCtx.currentTime + (opts.delay || 0);
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = opts.type || 'sine'; o.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t0 + dur);
    let node = o;
    if (opts.lowpass) { const f = audioCtx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lowpass; o.connect(f); node = f; }
    const peak = opts.vol || 0.05;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + (opts.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    node.connect(g); g.connect(opts.music ? musicGain : sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.05);
  } catch (e) { /* optional */ }
}
function noiseBurst(dur, vol, freq) {
  if (!ensureAudio() || effectiveMuted()) return;
  try {
    const t0 = audioCtx.currentTime;
    const len = Math.max(1, (audioCtx.sampleRate * dur) | 0);
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const f = audioCtx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 800; f.Q.value = 0.8;
    const g = audioCtx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t0);
  } catch (e) { /* optional */ }
}
const sndClick  = () => tone(640, 0.05, { type: 'square', vol: 0.03 });
const sndDenied = () => tone(140, 0.18, { type: 'square', vol: 0.06, slideTo: 90 });
const sndBuild  = () => { tone(220, 0.1, { type: 'triangle', vol: 0.08 }); tone(330, 0.14, { delay: 0.07, type: 'triangle', vol: 0.08 }); noiseBurst(0.12, 0.05, 500); };
const sndZap    = () => tone(1240, 0.07, { type: 'sawtooth', vol: 0.022, slideTo: 620, lowpass: 2600 });
const sndSplash = () => noiseBurst(0.09, 0.03, 1500);
const sndBell   = () => { tone(659, 1.1, { vol: 0.06 }); tone(988, 0.8, { vol: 0.03 }); tone(1318, 0.5, { vol: 0.016 }); };
const sndBonk   = () => { tone(180, 0.09, { type: 'square', vol: 0.06, slideTo: 70 }); noiseBurst(0.06, 0.045, 300); };
const sndDie    = () => tone(300, 0.3, { type: 'triangle', vol: 0.045, slideTo: 60 });
const sndPurify = () => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.24, { delay: i * 0.06, vol: 0.05 })); };
const sndCoin   = () => { tone(950, 0.08, { vol: 0.04 }); tone(1420, 0.12, { delay: 0.05, vol: 0.035 }); };
const sndDawn   = () => { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.3, { delay: i * 0.1, type: 'triangle', vol: 0.065 })); };
const sndFall   = () => { tone(98, 0.9, { type: 'sawtooth', vol: 0.12, lowpass: 700, slideTo: 40 }); noiseBurst(0.7, 0.09, 220); };
const sndBoss   = () => { tone(65, 1.4, { type: 'sawtooth', vol: 0.12, lowpass: 400 }); tone(98, 1.2, { delay: 0.15, type: 'sawtooth', vol: 0.09, lowpass: 500 }); noiseBurst(0.9, 0.06, 140); };

/* ---------------- 3D scene: the diorama ---------------- */
const stageEl = $('stage'), errEl = $('err');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  errEl.style.display = 'flex';
  errEl.textContent = 'WebGL is not available on this device/browser.';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
stageEl.insertBefore(renderer.domElement, stageEl.firstChild);

const scene = new THREE.Scene();
const dummy = new THREE.Object3D();
const camera = new THREE.PerspectiveCamera(41, 1.6, 0.1, 300);
const CAM_POS = new THREE.Vector3(0.6, 12.6, 17.8);
const CAM_TGT = new THREE.Vector3(0.6, 0.2, -0.6);
camera.position.copy(CAM_POS);
camera.lookAt(CAM_TGT);

/* world layout (units): lanes along X, gate right, graves left */
const LANE_Z = [-3.4, 0, 3.4];
const PLOT_X = [-7.6, -3.2, 1.2, 5.6];
const SPAWN_X = -14.6, GATE_X = 12.6, MILL_POS = new THREE.Vector3(16.8, 0, 5.6);
const plotPos = (col, lane) => new THREE.Vector3(PLOT_X[col], 0, LANE_Z[lane]);

/* textures — all generated at runtime, zero image files */
function canvasTex(size, paint, rx, ry) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  paint(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (rx) t.repeat.set(rx, ry || rx);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
srand(99);
const grassTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#42562f'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 5200; i++) {
    g.fillStyle = ['#33461f', '#4d6839', '#5c7a42', '#6c8a4c'][Math.floor(rnd() * 4)];
    g.fillRect(rnd() * s, rnd() * s, 2, 2 + rnd() * 3);
  }
  for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(20,26,14,.35)'; g.beginPath(); g.arc(rnd() * s, rnd() * s, 3 + rnd() * 9, 0, 7); g.fill(); }
}, 18, 10);
const dirtTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#5d4630'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = ['#4c3a26', '#6e573c', '#7d6244'][Math.floor(rnd() * 3)];
    g.beginPath(); g.arc(rnd() * s, rnd() * s, 1 + rnd() * 3, 0, 7); g.fill();
  }
}, 16, 2);
const barkTex = canvasTex(128, (g, s) => {
  g.fillStyle = '#40342a'; g.fillRect(0, 0, s, s);
  for (let x = 0; x < s; x += 5) { g.fillStyle = rnd() > 0.5 ? '#2e241a' : '#524233'; g.fillRect(x, 0, 2 + rnd() * 3, s); }
  for (let i = 0; i < 300; i++) { g.fillStyle = '#1e150e'; g.fillRect(rnd() * s, rnd() * s, 2, 5); }
});
const stoneTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#787a80'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = ['#67696f', '#8a8c92', '#55575d'][Math.floor(rnd() * 3)];
    g.beginPath(); g.arc(rnd() * s, rnd() * s, 2 + rnd() * 10, 0, 7); g.fill();
  }
  g.strokeStyle = 'rgba(30,30,36,.5)'; g.lineWidth = 2;
  for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(rnd() * s, 0); g.lineTo(rnd() * s, s); g.stroke(); }
}, 2, 1);
const plankTex = canvasTex(256, (g, s) => {
  g.fillStyle = '#6e5230'; g.fillRect(0, 0, s, s);
  const rows = 4, rh = s / rows;
  for (let r = 0; r < rows; r++) {
    g.fillStyle = ['#78592f', '#66492a', '#806438'][r % 3];
    g.fillRect(0, r * rh, s, rh - 2);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, r * rh + rh - 2, s, 2);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = 'rgba(56,38,16,.35)'; g.beginPath();
      const y = r * rh + rnd() * (rh - 4);
      g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + 2, s * 0.7, y - 2, s, y); g.stroke();
    }
  }
}, 1, 1);
function glowSprite(inner, outer) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  rg.addColorStop(0, inner); rg.addColorStop(0.4, outer); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
}
const glowAmber = glowSprite('rgba(255,214,140,1)', 'rgba(255,140,40,.45)');
const glowGold = glowSprite('rgba(255,240,180,1)', 'rgba(255,200,60,.5)');
const glowBlue = glowSprite('rgba(190,230,255,1)', 'rgba(110,170,255,.4)');

/* ---- figure textures: skin (mottled, veined, wounded), a painted face,
   torn cloth, torn pants — detail lives in the texture; the per-figure
   tint comes from instanceColor. ---- */
function figureTex(paint) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  paint(c.getContext('2d'), 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
srand(2024);
const skinTex = figureTex((g, s) => {
  g.fillStyle = '#c9cabb'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 260; i++) { /* mottling */
    g.fillStyle = ['rgba(120,128,96,.20)', 'rgba(146,150,120,.22)', 'rgba(100,110,84,.18)', 'rgba(160,158,138,.2)'][i % 4];
    g.beginPath(); g.ellipse(rnd() * s, rnd() * s, 6 + rnd() * 22, 4 + rnd() * 14, rnd() * 3, 0, 7); g.fill();
  }
  g.strokeStyle = 'rgba(84,96,110,.4)'; g.lineWidth = 1.2; /* veins */
  for (let i = 0; i < 26; i++) {
    let x = rnd() * s, y = rnd() * s; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (rnd() - 0.5) * 34; y += rnd() * 22; g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 5; i++) { /* wounds: dark red-brown blotches, darker core */
    const x = rnd() * s, y = rnd() * s, r = 7 + rnd() * 13;
    const rg = g.createRadialGradient(x, y, 1, x, y, r);
    rg.addColorStop(0, 'rgba(74,14,10,.92)'); rg.addColorStop(0.55, 'rgba(110,26,18,.65)'); rg.addColorStop(1, 'rgba(110,26,18,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  /* one stitched gash */
  g.strokeStyle = 'rgba(60,10,8,.85)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(40, 190); g.lineTo(105, 168); g.stroke();
  g.lineWidth = 1.6; g.strokeStyle = 'rgba(30,26,22,.8)';
  for (let i = 0; i < 6; i++) { const x = 46 + i * 11, y = 188 - i * 3.6; g.beginPath(); g.moveTo(x - 4, y - 6); g.lineTo(x + 4, y + 6); g.stroke(); }
  for (let i = 0; i < 1600; i++) { g.fillStyle = 'rgba(70,72,58,.16)'; g.fillRect(rnd() * s, rnd() * s, 1.6, 1.6); } /* grime */
});
const faceTex = figureTex((g, s) => {
  g.fillStyle = '#c9cabb'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 200; i++) {
    g.fillStyle = ['rgba(120,128,96,.2)', 'rgba(146,150,120,.2)', 'rgba(100,110,84,.18)'][i % 3];
    g.beginPath(); g.ellipse(rnd() * s, rnd() * s, 6 + rnd() * 18, 4 + rnd() * 12, rnd() * 3, 0, 7); g.fill();
  }
  /* face is painted centered at u=0.5 (geometry rotated so it fronts +X) */
  const cx = s * 0.5;
  /* brow shadow + sunken eye sockets with dull amber eyes */
  g.fillStyle = 'rgba(40,42,32,.72)';
  g.beginPath(); g.ellipse(cx, 94, 58, 15, 0, 0, 7); g.fill();
  for (const dx of [-28, 28]) {
    g.fillStyle = 'rgba(10,10,8,.96)';
    g.beginPath(); g.ellipse(cx + dx, 110, 17, 12, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(224,168,44,.98)';
    g.beginPath(); g.arc(cx + dx, 110, 5.2, 0, 7); g.fill();
    g.fillStyle = 'rgba(244,244,224,.85)';
    g.beginPath(); g.arc(cx + dx - 1.6, 108.4, 1.6, 0, 7); g.fill();
  }
  /* gaunt cheek hollows */
  g.fillStyle = 'rgba(88,92,72,.5)';
  g.beginPath(); g.ellipse(cx - 34, 146, 10, 16, 0.3, 0, 7); g.ellipse(cx + 34, 146, 10, 16, -0.3, 0, 7); g.fill();
  /* nose shading */
  g.fillStyle = 'rgba(90,94,76,.5)';
  g.beginPath(); g.ellipse(cx, 140, 8, 13, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(52,54,44,.65)';
  g.beginPath(); g.ellipse(cx - 5.5, 151, 3.4, 2.2, 0, 0, 7); g.ellipse(cx + 5.5, 151, 3.4, 2.2, 0, 0, 7); g.fill();
  /* slack open mouth, dark, with tooth ticks + blood streak */
  g.fillStyle = 'rgba(20,6,6,.97)';
  g.beginPath(); g.ellipse(cx, 184, 21, 15, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(230,226,200,.92)';
  for (let i = 0; i < 5; i++) g.fillRect(cx - 16 + i * 7.6, 173, 4.4, 6.5);
  g.strokeStyle = 'rgba(110,22,16,.75)'; g.lineWidth = 3.4;
  g.beginPath(); g.moveTo(cx + 13, 184); g.quadraticCurveTo(cx + 17, 204, cx + 12, 224); g.stroke();
  /* forehead gash */
  g.strokeStyle = 'rgba(74,14,10,.9)'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(cx - 30, 52); g.lineTo(cx + 6, 66); g.stroke();
  /* cheek wound */
  const rg = g.createRadialGradient(cx - 40, 150, 1, cx - 40, 150, 13);
  rg.addColorStop(0, 'rgba(74,14,10,.9)'); rg.addColorStop(1, 'rgba(110,26,18,0)');
  g.fillStyle = rg; g.beginPath(); g.arc(cx - 40, 150, 13, 0, 7); g.fill();
});
const clothTex = figureTex((g, s) => {
  g.fillStyle = '#bcbcbc'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 2400; i++) { g.fillStyle = ['rgba(70,70,70,.14)', 'rgba(150,150,150,.14)'][i % 2]; g.fillRect(rnd() * s, rnd() * s, 2, 1.2); } /* weave */
  /* jacket opening + lapels (front of torso, u≈0.5) */
  g.fillStyle = 'rgba(52,50,48,.85)'; g.fillRect(s * 0.485, 30, s * 0.03, 190);
  g.fillStyle = 'rgba(88,86,84,.7)';
  g.beginPath(); g.moveTo(s * 0.485, 34); g.lineTo(s * 0.40, 96); g.lineTo(s * 0.485, 108); g.fill();
  g.beginPath(); g.moveTo(s * 0.515, 34); g.lineTo(s * 0.60, 96); g.lineTo(s * 0.515, 108); g.fill();
  g.fillStyle = '#c9c2ae'; g.fillRect(s * 0.44, 40, s * 0.12, 66); /* shirt V */
  g.fillStyle = 'rgba(40,40,40,.9)'; /* buttons */
  for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(s * 0.545, 128 + i * 34, 3.4, 0, 7); g.fill(); }
  /* torn chest patch — skin shows through, bloodied rim */
  g.fillStyle = '#c2b498';
  g.beginPath();
  g.moveTo(52, 128); g.lineTo(96, 116); g.lineTo(108, 152); g.lineTo(76, 172); g.lineTo(50, 156); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(110,26,18,.8)'; g.lineWidth = 3; g.stroke();
  g.fillStyle = 'rgba(110,26,18,.55)'; g.beginPath(); g.ellipse(80, 146, 15, 9, 0.5, 0, 7); g.fill();
  /* frayed tear streaks + grime hem */
  g.strokeStyle = 'rgba(40,38,36,.65)'; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) { const x = rnd() * s; g.beginPath(); g.moveTo(x, 226); g.lineTo(x + (rnd() - 0.5) * 10, 244 + rnd() * 10); g.stroke(); }
  const gr = g.createLinearGradient(0, 200, 0, 256);
  gr.addColorStop(0, 'rgba(52,46,34,0)'); gr.addColorStop(1, 'rgba(52,46,34,.55)');
  g.fillStyle = gr; g.fillRect(0, 200, s, 56);
});
const pantsTex = figureTex((g, s) => {
  g.fillStyle = '#9aa0ac'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 1800; i++) { g.fillStyle = ['rgba(52,58,70,.16)', 'rgba(140,148,160,.14)'][i % 2]; g.fillRect(rnd() * s, rnd() * s, 1.6, 2.4); }
  g.strokeStyle = 'rgba(52,58,70,.5)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(s * 0.5, 0); g.lineTo(s * 0.5, s); g.stroke(); /* seam */
  /* torn knee — skin patch */
  g.fillStyle = '#c2b498';
  g.beginPath(); g.ellipse(s * 0.5, 168, 17, 12, 0, 0, 7); g.fill();
  g.strokeStyle = 'rgba(40,40,40,.6)'; g.lineWidth = 2; g.stroke();
  const gr = g.createLinearGradient(0, 190, 0, 256);
  gr.addColorStop(0, 'rgba(46,40,30,0)'); gr.addColorStop(1, 'rgba(46,40,30,.6)');
  g.fillStyle = gr; g.fillRect(0, 190, s, 66);
});

/* lights & sky */
const hemi = new THREE.HemisphereLight(0x8fa3d9, 0x2e2118, 0.75);
scene.add(hemi);
const moonLight = new THREE.DirectionalLight(0xdfe8ff, 1.25);
moonLight.position.set(-16, 24, -10);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(1024, 1024);
moonLight.shadow.camera.left = -22; moonLight.shadow.camera.right = 22;
moonLight.shadow.camera.top = 16; moonLight.shadow.camera.bottom = -16;
moonLight.shadow.camera.far = 80;
moonLight.shadow.bias = -0.0005;
scene.add(moonLight);
/* warm fill from the gate braziers' side: faces catch firelight as they advance */
const gateGlow = new THREE.DirectionalLight(0xff9a4d, 0.42);
gateGlow.position.set(30, 7, 2);
scene.add(gateGlow);
const fireLightL = new THREE.PointLight(0xff8c3a, 26, 13, 1.9); fireLightL.position.set(11.4, 2.2, -4.6); scene.add(fireLightL);
const fireLightR = new THREE.PointLight(0xff8c3a, 26, 13, 1.9); fireLightR.position.set(11.4, 2.2, 4.6); scene.add(fireLightR);
const millLight = new THREE.PointLight(0xffd98a, 18, 11, 1.9); millLight.position.set(16.8, 2.6, 5.6); scene.add(millLight);
scene.fog = new THREE.FogExp2(0x131c30, 0.02);

/* sky dome + moon + stars */
let skyMat;
{
  const c = document.createElement('canvas'); c.width = 4; c.height = 512;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0, '#0a1029'); grad.addColorStop(0.5, '#1d2c52');
  grad.addColorStop(0.8, '#3d4a78'); grad.addColorStop(1, '#5c5a7d');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 512);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  skyMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(160, 24, 14), skyMat));
  const moon = new THREE.Sprite(glowSprite('rgba(245,248,255,1)', 'rgba(200,215,255,.55)'));
  moon.position.set(-52, 44, -95); moon.scale.setScalar(30);
  scene.add(moon);
  const N = 260, pos = new Float32Array(N * 3);
  srand(4242);
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2, e = 0.25 + rnd() * 1.2, r = 140;
    pos[i * 3] = Math.cos(a) * Math.cos(e) * r; pos[i * 3 + 1] = Math.sin(e) * r; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xcdd8ff, size: 0.9, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.85 })));
  /* far hill silhouettes */
  const hillMat = new THREE.MeshBasicMaterial({ color: 0x1a2542 });
  srand(31);
  const hills = new THREE.InstancedMesh(new THREE.ConeGeometry(26, 17, 7), hillMat, 9);
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 9 - 0.5) * 1.7;
    dummy.position.set(Math.sin(a) * 105, 0, -Math.abs(Math.cos(a)) * 105 - 12);
    dummy.rotation.set(0, rnd() * 3, 0);
    dummy.scale.set(0.75 + rnd() * 0.65, 0.8 + rnd() * 0.7, 0.75 + rnd() * 0.65);
    dummy.updateMatrix(); hills.setMatrixAt(i, dummy.matrix);
  }
  scene.add(hills);
}

/* ground + path */
const groundMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, color: 0xbcc4ae });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 34), groundMat);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
scene.add(ground);
{
  const path = new THREE.Mesh(new THREE.PlaneGeometry(31, 10.6), new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1 }));
  path.rotation.x = -Math.PI / 2; path.position.set(-1, 0.015, 0); path.receiveShadow = true;
  scene.add(path);
}

/* shared materials / geometries */
const MAT = {
  stone: new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95 }),
  stoneDark: new THREE.MeshStandardMaterial({ color: 0x55565e, roughness: 1 }),
  iron: new THREE.MeshStandardMaterial({ color: 0x2c2f38, roughness: 0.55, metalness: 0.7 }),
  wood: new THREE.MeshStandardMaterial({ map: plankTex, roughness: 1 }),
  bark: new THREE.MeshStandardMaterial({ map: barkTex, roughness: 1 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc9973f, roughness: 0.35, metalness: 0.8 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xf2c14e, roughness: 0.3, metalness: 0.75, emissive: 0x664d08, emissiveIntensity: 0.5 }),
  bone: new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.9 })
};

/* instanced gravestones + dead trees + perimeter fence */
srand(777);
{
  const shape = new THREE.Shape();
  shape.moveTo(-0.42, 0); shape.lineTo(-0.42, 0.62);
  shape.absarc(0, 0.62, 0.42, Math.PI, 0, true);
  shape.lineTo(0.42, 0);
  shape.closePath();
  const stoneGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false });
  const spots = [];
  while (spots.length < 44) {
    const x = -16 + rnd() * 30, z = rnd() > 0.5 ? 5.8 + rnd() * 7.5 : -13 + rnd() * 6.5;
    if (x > 10.5 && z > 3) continue;
    spots.push([x, z]);
  }
  const stones = new THREE.InstancedMesh(stoneGeo, MAT.stone, spots.length);
  spots.forEach(([x, z], i) => {
    dummy.position.set(x, 0, z);
    dummy.rotation.set((rnd() - 0.5) * 0.14, rnd() * Math.PI, (rnd() - 0.5) * 0.12);
    dummy.scale.setScalar(0.75 + rnd() * 0.8);
    dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix);
  });
  stones.castShadow = stones.receiveShadow = true;
  scene.add(stones);
  /* dead trees: trunk + two branch cones of bare limbs (boxes) */
  const trunkGeo = new THREE.CylinderGeometry(0.14, 0.3, 3.1, 6);
  const limbGeo = new THREE.CylinderGeometry(0.03, 0.09, 1.7, 5);
  const treePts = [[-15.5, -8.5], [-11, 9.5], [-4, -10.5], [4.5, 10.8], [10, -10], [15.5, -8], [-17, 3], [8.5, 11.5]];
  const trunks = new THREE.InstancedMesh(trunkGeo, MAT.bark, treePts.length);
  const limbs = new THREE.InstancedMesh(limbGeo, MAT.bark, treePts.length * 3);
  treePts.forEach(([x, z], i) => {
    const s = 0.85 + rnd() * 0.7;
    dummy.position.set(x, 1.55 * s, z); dummy.rotation.set((rnd() - 0.5) * 0.1, rnd() * 3, (rnd() - 0.5) * 0.12);
    dummy.scale.setScalar(s); dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
    for (let b = 0; b < 3; b++) {
      dummy.position.set(x + (rnd() - 0.5) * 0.5, (2.6 + b * 0.35) * s, z + (rnd() - 0.5) * 0.5);
      dummy.rotation.set(0.7 + rnd() * 0.5, rnd() * Math.PI * 2, 0.5 + rnd() * 0.4);
      dummy.scale.setScalar(s); dummy.updateMatrix(); limbs.setMatrixAt(i * 3 + b, dummy.matrix);
    }
  });
  trunks.castShadow = true;
  scene.add(trunks, limbs);
  /* back fence posts */
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 1.05, 0.16), MAT.bark, 26);
  for (let i = 0; i < 26; i++) {
    dummy.position.set(-17 + i * 1.42, 0.5, -8.6 + Math.sin(i * 0.7) * 0.3);
    dummy.rotation.set(0, 0, (rnd() - 0.5) * 0.1); dummy.scale.setScalar(1);
    dummy.updateMatrix(); posts.setMatrixAt(i, dummy.matrix);
  }
  scene.add(posts);
}

/* the crypt (spawn, left) */
{
  const crypt = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.4, 7.6), MAT.stone);
  base.position.y = 1.7; base.castShadow = base.receiveShadow = true; crypt.add(base);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.7, 4), MAT.stoneDark);
  roof.position.y = 4.25; roof.rotation.y = Math.PI / 4; roof.scale.set(1.15, 1, 1.5); roof.castShadow = true; crypt.add(roof);
  const doorM = new THREE.MeshStandardMaterial({ color: 0x05070d, roughness: 1 });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 2.5), doorM);
  door.position.set(2.21, 1.25, 0); door.rotation.y = Math.PI / 2; crypt.add(door);
  const glow = new THREE.Sprite(glowBlue); glow.position.set(2.5, 1.5, 0); glow.scale.setScalar(3.2); crypt.add(glow);
  crypt.position.set(-16.8, 0, 0);
  scene.add(crypt);
}

/* the gate (right) + braziers */
const gateGroup = new THREE.Group();
let gateDoors;
{
  const postGeo = new THREE.CylinderGeometry(0.34, 0.42, 5.4, 8);
  for (const z of [-4.9, 4.9]) {
    const p = new THREE.Mesh(postGeo, MAT.stone); p.position.set(0, 2.7, z); p.castShadow = true; gateGroup.add(p);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), MAT.stoneDark); cap.position.set(0, 5.6, z); gateGroup.add(cap);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 10.6), MAT.stone);
  beam.position.y = 5.15; beam.castShadow = true; gateGroup.add(beam);
  gateDoors = new THREE.Group();
  const doorGeo = new THREE.BoxGeometry(0.22, 4.4, 4.7);
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.18, 4.5), MAT.brass, 8);
  {
    let bi = 0;
    for (const side of [-1, 1]) {
      const d = new THREE.Mesh(doorGeo, MAT.iron);
      d.position.set(0, 2.2, side * 2.42); d.castShadow = true;
      gateDoors.add(d);
      for (let b = 0; b < 4; b++) {
        dummy.position.set(0, 0.7 + b * 1.05, side * 2.42);
        dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
        dummy.updateMatrix(); bars.setMatrixAt(bi++, dummy.matrix);
      }
    }
  }
  gateDoors.add(bars);
  gateGroup.add(gateDoors);
  for (const z of [-4.6, 4.6]) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.2, 0.5, 8), MAT.iron);
    bowl.position.set(-1.3, 1.15, z); gateGroup.add(bowl);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 6), MAT.iron);
    pole.position.set(-1.3, 0.55, z); gateGroup.add(pole);
    const fl = new THREE.Sprite(glowAmber); fl.position.set(-1.3, 1.8, z); fl.scale.setScalar(1.9); fl.name = 'brazierFlame'; gateGroup.add(fl);
  }
  gateGroup.position.set(GATE_X, 0, 0);
  scene.add(gateGroup);
}

/* the Bone Mill (right, behind the gate) */
const millGroup = new THREE.Group();
let millWheel;
{
  const hut = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 3.4), MAT.wood);
  hut.position.y = 1.3; hut.castShadow = hut.receiveShadow = true; millGroup.add(hut);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.5, 4), MAT.stoneDark);
  roof.position.y = 3.35; roof.rotation.y = Math.PI / 4; roof.castShadow = true; millGroup.add(roof);
  const winMat = new THREE.MeshStandardMaterial({ color: 0x201404, emissive: 0xffb45c, emissiveIntensity: 1.8 });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.8), winMat);
  win.position.set(-1.71, 1.6, 0); win.rotation.y = -Math.PI / 2; millGroup.add(win);
  millWheel = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.13, 8, 18), MAT.wood);
  millWheel.position.set(0, 1.5, 1.95); millWheel.castShadow = true; millGroup.add(millWheel);
  for (let i = 0; i < 2; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.1, 0.14), MAT.wood);
    spoke.rotation.z = i * Math.PI / 2; spoke.position.copy(millWheel.position); millGroup.add(spoke);
  }
  const sign = new THREE.Sprite(glowGold); sign.position.set(0, 3.4, 0); sign.scale.setScalar(2.6); millGroup.add(sign);
  millGroup.position.copy(MILL_POS);
  scene.add(millGroup);
}

/* location dressing: chapel silhouette + crypt pillars (toggled per location) */
const chapelGroup = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(5, 4.4, 4), MAT.stoneDark); body.position.y = 2.2; chapelGroup.add(body);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(1.7, 7.4, 1.7), MAT.stoneDark); tower.position.set(-1.4, 3.7, 0); chapelGroup.add(tower);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.6, 4), MAT.stoneDark); spire.position.set(-1.4, 8.7, 0); spire.rotation.y = Math.PI / 4; chapelGroup.add(spire);
  const winMat = new THREE.MeshStandardMaterial({ color: 0x140c02, emissive: 0xff9a3c, emissiveIntensity: 1.4 });
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1, 2), winMat); win.position.set(1.2, 2.2, 2.01); chapelGroup.add(win);
  chapelGroup.position.set(-6, 0, -13.5);
  scene.add(chapelGroup);
}
const cryptPropsGroup = new THREE.Group();
{
  const pil = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.65, 4.6, 8), MAT.stone, 5);
  const capB = new THREE.InstancedMesh(new THREE.BoxGeometry(1.5, 0.4, 1.5), MAT.stoneDark, 5);
  for (let i = 0; i < 5; i++) {
    dummy.position.set(-12 + i * 6.5, 2.3, -12.8); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
    dummy.updateMatrix(); pil.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 4.8; dummy.updateMatrix(); capB.setMatrixAt(i, dummy.matrix);
  }
  pil.castShadow = true;
  cryptPropsGroup.add(pil, capB);
  scene.add(cryptPropsGroup);
}

/* turret plots: stone slabs + highlight rings */
const plotMeshes = [];
const ringGeo = new THREE.RingGeometry(0.95, 1.22, 28);
{
  const slabGeo = new THREE.CylinderGeometry(1.05, 1.18, 0.22, 8);
  const slabs = new THREE.InstancedMesh(slabGeo, MAT.stone, 12);
  let si = 0;
  for (let col = 0; col < 4; col++) for (let lane = 0; lane < 3; lane++) {
    const p = plotPos(col, lane);
    dummy.position.set(p.x, 0.11, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1);
    dummy.updateMatrix(); slabs.setMatrixAt(si++, dummy.matrix);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, 0.26, p.z);
    ring.visible = false;
    scene.add(ring);
    plotMeshes.push({ col, lane, ring, pos: p });
  }
  slabs.receiveShadow = true; slabs.castShadow = true;
  scene.add(slabs);
}

/* ---------------- turret models ---------------- */
const turretObjs = new Map(); // "col,lane" -> {group, head parts...}
function buildTurretModel(type, lvl) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.88, 0.5, 8), MAT.stone);
  base.position.y = 0.45; base.castShadow = base.receiveShadow = true; g.add(base);
  const parts = { group: g, type };
  const s = 1 + 0.08 * (lvl - 1);
  if (type === 'lantern') {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.7, 6), MAT.iron);
    pole.position.y = 1.5; pole.castShadow = true; g.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.52),
      new THREE.MeshStandardMaterial({ color: 0x33270e, emissive: 0xffb45c, emissiveIntensity: 1.7, roughness: 0.4 }));
    lamp.position.y = 2.55; lamp.castShadow = true; g.add(lamp);
    const capT = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.34, 4), MAT.iron);
    capT.position.y = 3.05; capT.rotation.y = Math.PI / 4; g.add(capT);
    const glow = new THREE.Sprite(glowAmber); glow.position.y = 2.55; glow.scale.setScalar(2.2); g.add(glow);
    parts.glow = glow;
  } else if (type === 'sprinkler') {
    const shrine = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 1.15, 7), MAT.stone);
    shrine.position.y = 1.2; shrine.castShadow = true; g.add(shrine);
    const head = new THREE.Group(); head.position.y = 1.95;
    const cross1 = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.13, 0.13), MAT.brass); head.add(cross1);
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 1.15), MAT.brass); head.add(cross2);
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x9fd8ff, emissive: 0x3c7fb8, emissiveIntensity: 0.9, roughness: 0.2 }));
    head.add(orb);
    g.add(head); parts.head = head;
    const glow = new THREE.Sprite(glowBlue); glow.position.y = 1.95; glow.scale.setScalar(1.5); g.add(glow);
  } else if (type === 'bell') {
    for (const dx of [-0.55, 0.55]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.2, 0.16), MAT.wood);
      post.position.set(dx, 1.7, 0); post.castShadow = true; g.add(post);
    }
    const roofB = new THREE.Mesh(new THREE.ConeGeometry(1.15, 0.6, 4), MAT.stoneDark);
    roofB.position.y = 3.05; roofB.rotation.y = Math.PI / 4; roofB.castShadow = true; g.add(roofB);
    const beamB = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.14, 0.14), MAT.wood);
    beamB.position.y = 2.72; g.add(beamB);
    const bellPivot = new THREE.Group(); bellPivot.position.y = 2.72;
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.46, 0.62, 10),
      new THREE.MeshStandardMaterial({ color: 0xd8a844, roughness: 0.3, metalness: 0.85 }));
    bell.position.y = -0.38; bell.castShadow = true; bellPivot.add(bell);
    g.add(bellPivot); parts.bellPivot = bellPivot; parts.swing = 0;
  } else if (type === 'purifier') {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.6, 1.3, 7), MAT.stone);
    ped.position.y = 1.3; ped.castShadow = true; g.add(ped);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.2, 0.55, 10), MAT.gold);
    cup.position.y = 2.2; cup.castShadow = true; g.add(cup);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 6), MAT.gold);
    stem.position.y = 1.9; g.add(stem);
    const ringP = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.045, 6, 24),
      new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0xcc9420, emissiveIntensity: 1.2, roughness: 0.3, metalness: 0.6 }));
    ringP.position.y = 2.25; ringP.rotation.x = Math.PI / 2.4; g.add(ringP);
    parts.ring = ringP;
    const glow = new THREE.Sprite(glowGold); glow.position.y = 2.3; glow.scale.setScalar(2.6); g.add(glow);
    parts.glow = glow;
  }
  /* level pips */
  for (let i = 0; i < lvl; i++) {
    const pip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), MAT.gold);
    pip.position.set(-0.3 + i * 0.3, 0.78, 0.72); g.add(pip);
  }
  g.scale.setScalar(s);
  return parts;
}
function syncTurretModels() {
  const want = new Set(save.turrets.map(t => t.col + ',' + t.lane));
  for (const [key, obj] of [...turretObjs]) {
    if (!want.has(key)) { scene.remove(obj.group); turretObjs.delete(key); }
  }
  for (const t of save.turrets) {
    const key = t.col + ',' + t.lane;
    const cur = turretObjs.get(key);
    if (cur && cur.type === t.type && cur.lvl === t.lvl) continue;
    if (cur) scene.remove(cur.group);
    const parts = buildTurretModel(t.type, t.lvl);
    parts.lvl = t.lvl;
    const p = plotPos(t.col, t.lane);
    parts.group.position.set(p.x, 0.2, p.z);
    scene.add(parts.group);
    turretObjs.set(key, parts);
  }
}

/* ---------------- modeled figures: articulated, textured, instanced ----------------
   REALISM STANDARD (Carlton, Nov 5): every figure is a fully modeled 3D
   humanoid — human proportions (~1.86 units tall), capsule-built pelvis /
   torso / neck / head / upper arms / forearms+hands / thighs / shins+feet,
   canvas-painted skin (mottling, veins, wounds, stitches), a painted face,
   torn-cloth and torn-pants textures, forward-kinematics walk / shamble /
   gate-attack / work cycles, hit flinches, and a procedural ragdoll
   collapse on death. Parts are instanced per body part, so the whole
   horde stays at ~14 draw calls per material class. */
function mergeParts(parts) {
  const pos = [], nor = [], uv = [];
  for (const { geo, mtx } of parts) {
    const g = geo.toNonIndexed();
    if (mtx) g.applyMatrix4(mtx);
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}
const _tm = new THREE.Matrix4(), _tq = new THREE.Quaternion(), _tv = new THREE.Vector3(), _ts = new THREE.Vector3();
function partMtx(x, y, z, sx, sy, sz, rx, ry, rz) {
  _tq.setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0));
  _tv.set(x, y, z); _ts.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_tv, _tq, _ts);
}
function buildFigureGeos() {
  const pelvisGeo = new THREE.CapsuleGeometry(0.165, 0.17, 5, 12);
  pelvisGeo.applyMatrix4(partMtx(0, 0, 0, 0.8, 0.82, 1.3, Math.PI / 2, 0, 0));
  const torsoGeo = new THREE.CapsuleGeometry(0.225, 0.32, 6, 14);
  torsoGeo.scale(0.8, 1, 1.08);
  torsoGeo.rotateY(-Math.PI / 2); /* lathe UV: painted jacket front (u≈0.5) must face +X */
  const neckGeo = new THREE.CylinderGeometry(0.055, 0.065, 0.2, 8);
  const headGeo = new THREE.SphereGeometry(0.145, 20, 16);
  headGeo.scale(1.06, 1.18, 0.94);
  const upperArmGeo = new THREE.CapsuleGeometry(0.058, 0.21, 5, 10);
  upperArmGeo.translate(0, -0.15, 0);
  upperArmGeo.rotateY(-Math.PI / 2);
  const foreArmGeo = mergeParts([
    { geo: new THREE.CapsuleGeometry(0.05, 0.19, 5, 10), mtx: partMtx(0, -0.125, 0, 1, 1, 1) },
    { geo: new THREE.SphereGeometry(0.07, 10, 8), mtx: partMtx(0, -0.3, 0, 0.9, 1.25, 0.9) } /* hand */
  ]);
  const thighGeo = new THREE.CapsuleGeometry(0.08, 0.28, 5, 10);
  thighGeo.translate(0, -0.2, 0);
  thighGeo.rotateY(-Math.PI / 2); /* torn-knee patch fronts +X */
  const shinGeo = mergeParts([
    { geo: (() => { const g = new THREE.CapsuleGeometry(0.06, 0.29, 5, 10); g.rotateY(-Math.PI / 2); return g; })(), mtx: partMtx(0, -0.18, 0, 1, 1, 1) },
    { geo: new THREE.BoxGeometry(0.24, 0.09, 0.12), mtx: partMtx(0.065, -0.415, 0, 1, 1, 1) } /* boot/foot */
  ]);
  return { pelvis: pelvisGeo, torso: torsoGeo, neck: neckGeo, head: headGeo,
           upperArmL: upperArmGeo, upperArmR: upperArmGeo, foreArmL: foreArmGeo, foreArmR: foreArmGeo,
           thighL: thighGeo, thighR: thighGeo, shinL: shinGeo, shinR: shinGeo };
}
const FIG_GEO = buildFigureGeos();
const FIG_SPEC = [
  ['pelvis', 'pants'], ['torso', 'cloth'], ['neck', 'skin'], ['head', 'face'],
  ['upperArmL', 'cloth'], ['upperArmR', 'cloth'], ['foreArmL', 'skin'], ['foreArmR', 'skin'],
  ['thighL', 'pants'], ['thighR', 'pants'], ['shinL', 'pants'], ['shinR', 'pants']
];
function figureMats(ghost) {
  const extra = ghost
    ? { transparent: true, opacity: 0.58, depthWrite: false, emissive: 0x16283d, emissiveIntensity: 0.4 }
    : {};
  /* slight emissive floor: figures never fall to silhouette-black at night,
     so painted skin/cloth detail stays readable under the moon */
  const lift = ghost ? {} : {
    skin: { emissive: 0x27331a, emissiveIntensity: 0.55 },
    face: { emissive: 0x27331a, emissiveIntensity: 0.55 },
    cloth: { emissive: 0x12101a, emissiveIntensity: 0.5 },
    pants: { emissive: 0x0b0b10, emissiveIntensity: 0.5 }
  };
  return {
    skin:  new THREE.MeshStandardMaterial({ map: skinTex, roughness: 0.58, ...extra, ...(lift.skin || {}) }),
    face:  new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.58, ...extra, ...(lift.face || {}) }),
    cloth: new THREE.MeshStandardMaterial({ map: clothTex, roughness: 0.88, ...extra, ...(lift.cloth || {}) }),
    pants: new THREE.MeshStandardMaterial({ map: pantsTex, roughness: 0.92, ...extra, ...(lift.pants || {}) })
  };
}
const HORDE_MAX = 52, GHOST_MAX = 18;
function makeFigureSet(max, ghost) {
  const mats = figureMats(ghost);
  const set = {};
  for (const [key, matKey] of FIG_SPEC) {
    const m = new THREE.InstancedMesh(FIG_GEO[key], mats[matKey], max);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = true;
    m.frustumCulled = false;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    scene.add(m);
    set[key] = m;
  }
  const barG = new THREE.PlaneGeometry(0.95, 0.13);
  set.bar = new THREE.InstancedMesh(barG, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.92, depthWrite: false }), max);
  set.barBg = new THREE.InstancedMesh(barG, new THREE.MeshBasicMaterial({ color: 0x10131c, transparent: true, opacity: 0.65, depthWrite: false }), max);
  for (const k of ['bar', 'barBg']) {
    set[k].instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    set[k].frustumCulled = false;
    scene.add(set[k]);
  }
  set.bar.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  return set;
}
const horde = makeFigureSet(HORDE_MAX, false);
const ghostHorde = makeFigureSet(GHOST_MAX, true);
const _c = new THREE.Color();
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
function hidePart(mesh, i) { mesh.setMatrixAt(i, ZERO_M); }
function setPartQ(mesh, i, p, q, s) {
  dummy.position.copy(p);
  dummy.quaternion.copy(q);
  dummy.scale.setScalar(s);
  dummy.updateMatrix();
  mesh.setMatrixAt(i, dummy.matrix);
}
const PANTS_BY_TYPE = { shambler: 0x565064, runner: 0x644048, ghost: 0xd8dee2, brute: 0x46503e };
const GOLD_COAT = new THREE.Color(0xd8a844), GOLD_SKIN = new THREE.Color(0xffe9a8);
function figurePalette(z) {
  const base = z.boss ? { coat: 0x353044, skin: 0x9db873 } : ZTYPES[z.type];
  const coat = new THREE.Color(base.coat), skin = new THREE.Color(base.skin);
  let pants = new THREE.Color(z.boss ? 0x1f2026 : (PANTS_BY_TYPE[z.type] || 0x4a4a55));
  const gold = z.state === 'purified' || z.state === 'worker';
  const ch = z.channel || 0;
  if (gold) { coat.copy(GOLD_COAT); skin.copy(GOLD_SKIN); pants = new THREE.Color(0x8a6a24); }
  else if (ch > 0) { coat.lerp(GOLD_COAT, ch * 0.8); skin.lerp(GOLD_SKIN, ch * 0.45); }
  return { coat, skin, pants, shin: pants.clone().multiplyScalar(0.45) };
}
function paintFigure(set, i, pal) {
  const put = (key, col) => { set[key].setColorAt(i, col); };
  put('torso', pal.coat); put('upperArmL', pal.coat); put('upperArmR', pal.coat);
  put('head', pal.skin); put('neck', pal.skin); put('foreArmL', pal.skin); put('foreArmR', pal.skin);
  put('pelvis', pal.pants); put('thighL', pal.pants); put('thighR', pal.pants);
  put('shinL', pal.shin); put('shinR', pal.shin);
}

/* pose computation: one angles object drives instanced figures AND the boss */
const POSE = {
  x: 0, z: 0, hx: 1, hz: 0, rootY: 0.94, scale: 1,
  lean: 0.15, roll: 0, headPitch: 0.28, headRoll: 0, headYaw: 0,
  armL: { swing: 1.15, out: 0.1, elbow: 0.38 }, armR: { swing: 1.15, out: -0.1, elbow: 0.38 },
  legL: { swing: 0, knee: 0.08 }, legR: { swing: 0, knee: 0.08 }
};
const clamp01 = v => clamp(v, 0, 1);
const easeOut = t => 1 - Math.pow(1 - t, 3);
function headingFor(z) {
  if (z.state === 'purified') {
    const dx = (MILL_POS.x - 2.2) - z.x, dz = (MILL_POS.z - 1.2) - z.z, d = Math.hypot(dx, dz) || 1;
    return { hx: dx / d, hz: dz / d };
  }
  if (z.state === 'worker') return { hx: 0.3, hz: 0.95 };
  return { hx: 1, hz: 0 };
}
function computePose(z) {
  const P = POSE;
  const st = z.state;
  const ph = z.animPhase || 0;
  const f = z.flinch || 0;
  let h = headingFor(z);
  P.scale = z.boss ? 1.5 : z.scale;
  P.lean = 0.16; P.roll = 0; P.headPitch = 0.28; P.headRoll = Math.sin(elapsed * 0.7 + z.phase) * 0.1;
  P.headYaw = Math.sin(elapsed * 0.45 + z.phase * 2) * 0.09;
  P.armL.swing = 1.16; P.armR.swing = 1.16; P.armL.out = 0.12; P.armR.out = -0.12;
  P.armL.elbow = 0.4; P.armR.elbow = 0.4;
  P.legL.swing = 0; P.legR.swing = 0; P.legL.knee = 0.08; P.legR.knee = 0.08;
  P.rootY = 0.94;
  if (st === 'corpse') {
    const cp = z.corpse, ct = clamp(elapsed - cp.start, 0, 4);
    P.hx = cp.hx; P.hz = cp.hz;
    const drop = clamp01(ct / 0.42);
    let y = 0.94 + (0.23 - 0.94) * drop * drop;
    if (ct > 0.42 && ct < 0.72) { const bp = (ct - 0.42) / 0.3; y += Math.sin(bp * Math.PI) * 0.045 * (1 - bp); }
    if (ct > 2.45) y -= (ct - 2.45) * 0.4;
    P.rootY = y;
    const fallK = easeOut(clamp01(ct / 0.62));
    P.lean = cp.fall * 1.42 * fallK;
    P.roll = cp.roll * fallK;
    P.headPitch = 0.3 + cp.fall * 0.3 * fallK;
    P.headRoll = cp.headRoll * fallK;
    const flail = Math.exp(-ct * 4.5);
    const settle = easeOut(clamp01((ct - 0.3) / 0.7));
    P.armL.swing = 1.16 + (cp.armL - 1.16) * settle + Math.sin(ct * 26 + z.phase) * 0.35 * flail;
    P.armR.swing = 1.16 + (cp.armR - 1.16) * settle + Math.cos(ct * 23 + z.phase) * 0.35 * flail;
    P.armL.elbow = 0.4 + (cp.elbowL - 0.4) * settle;
    P.armR.elbow = 0.4 + (cp.elbowR - 0.4) * settle;
    P.armL.out = 0.12 + (cp.outL - 0.12) * settle;
    P.armR.out = -0.12 + (cp.outR + 0.12) * settle;
    P.legL.swing = (cp.legL) * settle + Math.sin(ct * 21) * 0.22 * flail;
    P.legR.swing = (cp.legR) * settle + Math.cos(ct * 19) * 0.22 * flail;
    P.legL.knee = 0.08 + (cp.kneeL - 0.08) * settle;
    P.legR.knee = 0.08 + (cp.kneeR - 0.08) * settle;
    if (ct > 3.35) z.remove = true;
  } else if (st === 'walk' || st === 'purified') {
    P.hx = h.hx; P.hz = h.hz;
    const stride = z.type === 'runner' ? 0.62 : 0.52;
    const limpL = z.limp || 1, limpR = 2 - limpL;
    P.legL.swing = Math.sin(ph) * stride * limpL;
    P.legR.swing = Math.sin(ph + Math.PI) * stride * limpR;
    P.legL.knee = Math.pow(Math.max(0, -Math.cos(ph - 0.45)), 1.3) * 0.85;
    P.legR.knee = Math.pow(Math.max(0, -Math.cos(ph + Math.PI - 0.45)), 1.3) * 0.85;
    P.rootY = 0.94 - Math.abs(Math.sin(ph)) * 0.045;
    P.roll = Math.sin(ph) * 0.05;
    P.lean = st === 'purified' ? 0.06 : 0.18 + Math.sin(ph * 2) * 0.015;
    P.headPitch = st === 'purified' ? 0.06 : 0.3;
    const sway = Math.sin(ph * 0.5 + z.phase) * 0.1;
    P.armL.swing = (st === 'purified' ? 0.5 : 1.16) + sway;
    P.armR.swing = (st === 'purified' ? 0.5 : 1.16) - sway;
    P.armL.elbow = P.armR.elbow = st === 'purified' ? 0.25 : 0.42;
  } else if (st === 'gate') {
    P.hx = 1; P.hz = 0;
    const cyc = Math.sin((z.attackT / 1.1) * Math.PI);
    P.lean = 0.26 + cyc * 0.16;
    P.headPitch = 0.36;
    P.armL.swing = 1.3 + cyc * 0.62; P.armR.swing = 1.3 + cyc * 0.62;
    P.armL.elbow = P.armR.elbow = 0.3;
    P.legL.knee = P.legR.knee = 0.14;
    P.rootY = 0.93;
  } else if (st === 'worker') {
    P.hx = h.hx; P.hz = h.hz;
    P.lean = 0.13 + Math.sin(ph) * 0.03;
    P.headPitch = 0.18;
    P.armR.swing = 0.6 + Math.sin(ph) * 0.3; P.armR.elbow = 0.55;
    P.armL.swing = 0.3 + Math.sin(ph + 1.4) * 0.12; P.armL.elbow = 0.35;
    P.rootY = 0.94 + Math.sin(ph * 2) * 0.012;
  } else {
    P.hx = h.hx; P.hz = h.hz;
  }
  if (f > 0 && st !== 'corpse') {
    P.lean -= 0.42 * f;
    P.headPitch -= 0.5 * f;
    P.armL.swing -= 0.3 * f; P.armR.swing -= 0.3 * f;
  }
  P.x = z.x - P.hx * 0.07 * f;
  P.z = z.z - P.hz * 0.07 * f;
  return P;
}

/* forward kinematics: writes POSE into an instanced set (idx >= 0) or a mesh map (boss) */
const _qYaw = new THREE.Quaternion(), _qA = new THREE.Quaternion(), _qB = new THREE.Quaternion();
const _qPelvis = new THREE.Quaternion(), _qTorso = new THREE.Quaternion(), _qHead = new THREE.Quaternion();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _pelvisP = new THREE.Vector3(), _torsoP = new THREE.Vector3(), _neckP = new THREE.Vector3(), _headP = new THREE.Vector3();
const _up = new THREE.Vector3(), _side = new THREE.Vector3(), _fwd = new THREE.Vector3(), _dir = new THREE.Vector3();
const _jointP = new THREE.Vector3(), _jointP2 = new THREE.Vector3();
const JOINTS = { headP: new THREE.Vector3(), headQ: new THREE.Quaternion(), headUp: new THREE.Vector3(),
                 pelvisP: new THREE.Vector3(), torsoQ: new THREE.Quaternion(), handR: new THREE.Vector3(), handL: new THREE.Vector3() };
const AXIS_X = new THREE.Vector3(1, 0, 0), AXIS_Y = new THREE.Vector3(0, 1, 0), AXIS_Z = new THREE.Vector3(0, 0, 1);
function writePart(parts, key, idx, p, q, s) {
  const m = parts[key];
  if (!m) return;
  if (m.isInstancedMesh) setPartQ(m, idx, p, q, s);
  else { m.position.copy(p); m.quaternion.copy(q); m.scale.setScalar(s); }
}
function applyFigure(parts, idx, P, pal) {
  const s = P.scale;
  _v1.set(P.hx, 0, P.hz).normalize();
  _v2.set(0, 1, 0);
  _v3.crossVectors(_v1, _v2);
  _tm.makeBasis(_v1, _v2, _v3);
  _qYaw.setFromRotationMatrix(_tm);
  _fwd.copy(_v1);
  /* pelvis */
  _pelvisP.set(P.x, P.rootY * s, P.z);
  _qA.setFromAxisAngle(AXIS_Z, -P.lean * 0.32); _qB.setFromAxisAngle(AXIS_X, P.roll * 0.55);
  _qPelvis.copy(_qYaw).multiply(_qA).multiply(_qB);
  writePart(parts, 'pelvis', idx, _pelvisP, _qPelvis, s);
  /* torso */
  _qA.setFromAxisAngle(AXIS_Z, -P.lean); _qB.setFromAxisAngle(AXIS_X, P.roll);
  _qTorso.copy(_qYaw).multiply(_qA).multiply(_qB);
  _up.set(0, 1, 0).applyQuaternion(_qTorso);
  _torsoP.copy(_pelvisP).addScaledVector(_up, 0.34 * s).addScaledVector(_fwd, 0.015 * s);
  writePart(parts, 'torso', idx, _torsoP, _qTorso, s);
  /* neck + head */
  _neckP.copy(_torsoP).addScaledVector(_up, 0.37 * s);
  writePart(parts, 'neck', idx, _neckP, _qTorso, s);
  _qA.setFromAxisAngle(AXIS_Z, -P.headPitch); _qB.setFromAxisAngle(AXIS_X, P.headRoll);
  _qHead.copy(_qTorso).multiply(_qA).multiply(_qB);
  _qA.setFromAxisAngle(AXIS_Y, P.headYaw); _qHead.multiply(_qA);
  _v1.set(0, 1, 0).applyQuaternion(_qHead);
  _headP.copy(_neckP).addScaledVector(_v1, 0.17 * s).addScaledVector(_fwd, 0.01 * s);
  writePart(parts, 'head', idx, _headP, _qHead, s);
  JOINTS.headP.copy(_headP); JOINTS.headQ.copy(_qHead); JOINTS.headUp.copy(_v1);
  JOINTS.pelvisP.copy(_pelvisP); JOINTS.torsoQ.copy(_qTorso);
  _side.set(0, 0, 1).applyQuaternion(_qTorso);
  /* arms */
  for (const sideSign of [-1, 1]) {
    const arm = sideSign < 0 ? P.armL : P.armR;
    const sgn = sideSign < 0 ? 'L' : 'R';
    _jointP.copy(_torsoP).addScaledVector(_up, 0.27 * s).addScaledVector(_side, sideSign * 0.26 * s);
    _qA.setFromAxisAngle(AXIS_Z, arm.swing); _qB.setFromAxisAngle(AXIS_X, arm.out);
    const qArm = new THREE.Quaternion().copy(_qTorso).multiply(_qA).multiply(_qB);
    writePart(parts, 'upperArm' + sgn, idx, _jointP, qArm, s);
    _dir.set(0, -1, 0).applyQuaternion(qArm);
    _jointP2.copy(_jointP).addScaledVector(_dir, 0.32 * s);
    _qA.setFromAxisAngle(AXIS_Z, arm.elbow);
    const qFore = new THREE.Quaternion().copy(qArm).multiply(_qA);
    writePart(parts, 'foreArm' + sgn, idx, _jointP2, qFore, s);
    _dir.set(0, -1, 0).applyQuaternion(qFore);
    if (sgn === 'R') JOINTS.handR.copy(_jointP2).addScaledVector(_dir, 0.31 * s);
    else JOINTS.handL.copy(_jointP2).addScaledVector(_dir, 0.31 * s);
  }
  /* legs */
  _side.set(0, 0, 1).applyQuaternion(_qPelvis);
  _up.set(0, 1, 0).applyQuaternion(_qPelvis);
  for (const sideSign of [-1, 1]) {
    const leg = sideSign < 0 ? P.legL : P.legR;
    const sgn = sideSign < 0 ? 'L' : 'R';
    _jointP.copy(_pelvisP).addScaledVector(_side, sideSign * 0.115 * s).addScaledVector(_up, -0.02 * s);
    _qA.setFromAxisAngle(AXIS_Z, leg.swing); _qB.setFromAxisAngle(AXIS_X, P.roll * 0.2);
    const qThigh = new THREE.Quaternion().copy(_qYaw).multiply(_qA).multiply(_qB);
    writePart(parts, 'thigh' + sgn, idx, _jointP, qThigh, s);
    _dir.set(0, -1, 0).applyQuaternion(qThigh);
    _jointP2.copy(_jointP).addScaledVector(_dir, 0.46 * s);
    _qA.setFromAxisAngle(AXIS_Z, -leg.knee);
    const qShin = new THREE.Quaternion().copy(qThigh).multiply(_qA);
    writePart(parts, 'shin' + sgn, idx, _jointP2, qShin, s);
  }
  if (idx >= 0 && pal) paintFigure(parts, idx, pal);
}

/* The Undertaker — the same modeled figure, unique meshes + accessories */
const bossGroup = new THREE.Group();
const bossParts = {};
let bossHat, bossTail, bossLamp, bossLampGlow;
{
  const mats = {
    skin: new THREE.MeshStandardMaterial({ map: skinTex, color: 0x9db873, roughness: 0.6, emissive: 0x27331a, emissiveIntensity: 0.5 }),
    face: new THREE.MeshStandardMaterial({ map: faceTex, color: 0xa8c088, roughness: 0.6, emissive: 0x27331a, emissiveIntensity: 0.5 }),
    cloth: new THREE.MeshStandardMaterial({ map: clothTex, color: 0x4c4266, roughness: 0.9, emissive: 0x12101a, emissiveIntensity: 0.5 }),
    pants: new THREE.MeshStandardMaterial({ map: pantsTex, color: 0x2e3038, roughness: 0.95, emissive: 0x0b0b10, emissiveIntensity: 0.5 })
  };
  for (const [key, matKey] of FIG_SPEC) {
    const m = new THREE.Mesh(FIG_GEO[key], mats[matKey]);
    m.castShadow = true;
    bossGroup.add(m);
    bossParts[key] = m;
  }
  const coatMat = new THREE.MeshStandardMaterial({ map: clothTex, color: 0x2a2438, roughness: 0.95, side: THREE.DoubleSide });
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.045, 14), coatMat);
  const topH = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.3, 14), coatMat);
  bossHat = new THREE.Group(); bossHat.add(brim); topH.position.y = 0.16; bossHat.add(topH);
  bossHat.traverse(o => { o.castShadow = true; });
  bossGroup.add(bossHat);
  const tailGeo = new THREE.BoxGeometry(0.08, 0.8, 0.54); tailGeo.translate(0, -0.4, 0);
  bossTail = new THREE.Mesh(tailGeo, coatMat); bossTail.castShadow = true;
  bossGroup.add(bossTail);
  bossLamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.27, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x243012, emissive: 0x9fe870, emissiveIntensity: 1.7, roughness: 0.4 }));
  bossGroup.add(bossLamp);
  bossLampGlow = new THREE.Sprite(glowSprite('rgba(190,255,170,1)', 'rgba(110,220,90,.45)'));
  bossLampGlow.scale.setScalar(1.6);
  bossGroup.add(bossLampGlow);
  bossGroup.visible = false;
  scene.add(bossGroup);
}

/* ---------------- effects pools ---------------- */
const zapPool = [];
{
  for (let i = 0; i < 10; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(5 * 3), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    line.frustumCulled = false; scene.add(line);
    zapPool.push({ line, life: 0 });
  }
}
function fireZap(from, to) {
  const z = zapPool.find(z => z.life <= 0) || zapPool[0];
  const pos = z.line.geometry.attributes.position;
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    pos.setXYZ(i,
      from.x + (to.x - from.x) * t + (i > 0 && i < 4 ? (Math.random() - 0.5) * 0.3 : 0),
      from.y + (to.y - from.y) * t + (i > 0 && i < 4 ? (Math.random() - 0.5) * 0.3 : 0),
      from.z + (to.z - from.z) * t + (i > 0 && i < 4 ? (Math.random() - 0.5) * 0.3 : 0));
  }
  pos.needsUpdate = true;
  z.line.material.opacity = 0.95; z.life = 0.09;
}
const ringPool = [];
{
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 26),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
    ringPool.push({ m, life: 0, maxR: 4 });
  }
}
function fireRing(x, z, maxR) {
  const r = ringPool.find(r => r.life <= 0) || ringPool[0];
  r.m.position.set(x, 0.35, z); r.maxR = maxR; r.life = 0.45; r.m.visible = true;
}
/* particle pool (one Points cloud, recycled) */
const PMAX = 700;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3);
const pVel = new Float32Array(PMAX * 3), pLife = new Float32Array(PMAX);
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.17, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
points.frustumCulled = false;
scene.add(points);
let pCursor = 0;
function burst(x, y, z, hex, n, speed, up) {
  _c.setHex(hex);
  for (let k = 0; k < n; k++) {
    const i = pCursor; pCursor = (pCursor + 1) % PMAX;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    const a = Math.random() * Math.PI * 2, r = (0.3 + Math.random() * 0.7) * (speed || 2);
    pVel[i * 3] = Math.cos(a) * r; pVel[i * 3 + 1] = (up || 2.2) * (0.4 + Math.random() * 0.8); pVel[i * 3 + 2] = Math.sin(a) * r;
    pCol[i * 3] = _c.r; pCol[i * 3 + 1] = _c.g; pCol[i * 3 + 2] = _c.b;
    pLife[i] = 0.55 + Math.random() * 0.4;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
}
function updateParticles(dt) {
  let any = false;
  for (let i = 0; i < PMAX; i++) {
    if (pLife[i] <= 0) continue;
    any = true;
    pLife[i] -= dt;
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -50; continue; }
    pVel[i * 3 + 1] -= 5.5 * dt;
    pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    if (pPos[i * 3 + 1] < 0.05) { pPos[i * 3 + 1] = 0.05; pVel[i * 3 + 1] *= -0.4; }
  }
  if (any) pGeo.attributes.position.needsUpdate = true;
}
/* purify beams */
const beamPool = [];
{
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, 1, 6, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffd968, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.visible = false; scene.add(m);
    beamPool.push({ m, life: 0 });
  }
}
function fireBeam(from, to, dur) {
  const b = beamPool.find(b => b.life <= 0) || beamPool[0];
  const mid = from.clone().add(to).multiplyScalar(0.5);
  b.m.position.copy(mid);
  b.m.scale.y = from.distanceTo(to);
  const dir = to.clone().sub(from).normalize();
  b.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  b.m.material.opacity = 0.75; b.m.visible = true; b.life = dur;
}
/* damage floaters (HTML pool, projected) */
const floatPool = [];
{
  const wrap = $('floaters');
  for (let i = 0; i < 22; i++) {
    const d = document.createElement('div');
    d.className = 'floater'; d.style.opacity = '0';
    wrap.appendChild(d);
    floatPool.push({ el: d, life: 0, pos: new THREE.Vector3(), vy: 0 });
  }
}
const _v = new THREE.Vector3();
function floater(pos, text, color) {
  const f = floatPool.find(f => f.life <= 0) || floatPool[0];
  f.pos.copy(pos); f.life = 0.85; f.vy = 1.6;
  f.el.textContent = text; f.el.style.color = color || '#ffe9a8';
}
function updateFloaters(dt) {
  const w = stageEl.clientWidth, h = stageEl.clientHeight;
  for (const f of floatPool) {
    if (f.life <= 0) { f.el.style.opacity = '0'; continue; }
    f.life -= dt; f.pos.y += f.vy * dt; f.vy *= (1 - 1.8 * dt);
    _v.copy(f.pos).project(camera);
    if (_v.z > 1) { f.el.style.opacity = '0'; continue; }
    f.el.style.transform = `translate(${((_v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%,-50%)`;
    f.el.style.opacity = String(clamp(f.life / 0.4, 0, 1));
  }
}

/* ---------------- game state ---------------- */
let state = 'menu';            // menu | playing | summary | over | paused | away
let phase = 'build';           // build | wave | done
let pausedFrom = null;
let gateHp = maxGateHp();
let wave = 0, waveTotal = 0, spawnQueue = [], spawnTimer = 0, breather = 0;
let elapsed = 0, nightKills = 0, nightPurified = 0, nightEarned = 0;
let zombies = [];              // live zombie objects
let bossRef = null;
let sel = null;                // selected plot {col,lane}
let camDrift = 0, startSweep = 0;
let locationIdx = 0;
const turretState = new Map(); // "col,lane" -> {cool, target, channelT, channelTarget}

function grantBones(n, countStats) {
  const amt = Math.round(n * (countStats ? bonesMul() : 1));
  save.bones += amt;
  if (countStats) { save.stats.earned += amt; nightEarned += amt; questTrack('earned', amt); }
  return amt;
}
function wavesForNight(n) { return 5 + Math.min(5, n); }
function zombieHpMul() { return Math.pow(1.22, save.night - 1) * (1 + 0.06 * (wave - 1)); }
function zombieSpeedMul() { return Math.min(1.15, 1 + 0.01 * (save.night - 1)); }
function isBossNight() { return save.night % 5 === 0; }
function pickZombieType() {
  const r = Math.random();
  const n = save.night;
  if (n >= 3 && r < 0.13) return 'brute';
  if (n >= 2 && r < 0.32) return 'ghost';
  if (r < 0.55) return 'runner';
  return 'shambler';
}
function applyLocation() {
  locationIdx = (save.night - 1) % 3;
  const L = LOCATIONS[locationIdx];
  scene.fog.color.setHex(L.fog); scene.fog.density = L.fogD;
  groundMat.color.setHex(L.ground);
  hemi.color.setHex(L.hemiSky);
  moonLight.color.setHex(L.moon);
  chapelGroup.visible = locationIdx === 1;
  cryptPropsGroup.visible = locationIdx === 2;
  $('locLbl').textContent = '· ' + L.name;
}

/* ---------------- night / wave flow ---------------- */
function startNight(fromMenu) {
  applyLocation();
  if (!save.tutDone && tutStep === 0 && save.night === 1) { tutStep = 1; save.tutStep = 1; }
  gateHp = maxGateHp();
  wave = 0; waveTotal = wavesForNight(save.night);
  nightKills = 0; nightPurified = 0; nightEarned = 0;
  zombies = zombies.filter(z => z.state === 'worker');
  bossRef = null; bossGroup.visible = false;
  turretState.clear();
  for (const t of save.turrets) turretState.set(t.col + ',' + t.lane, { cool: 0, target: null, channelT: 0 });
  phase = 'build'; breather = fromMenu ? 6 : 4;
  state = 'playing';
  showOnly(null); closeSheets();
  startSweep = 1.6; /* cinematic glide from the gate to the graves */
  CG.gameplayStart();
  banner('🌙 Night ' + save.night + (isBossNight() ? ' — HE walks tonight' : ''), 1600);
  syncHud(); syncTutBar();
  persist();
}
function beginWave() {
  wave++;
  phase = 'wave';
  const count = Math.round((5 + wave * 1.6 + save.night * 1.2) * (wave === waveTotal ? 1.35 : 1));
  spawnQueue = [];
  for (let i = 0; i < count; i++) spawnQueue.push(pickZombieType());
  if (isBossNight() && wave === waveTotal) spawnQueue.push('undertaker');
  spawnTimer = 0.5;
  syncHud();
}
function spawnZombie(type) {
  const lane = Math.floor(Math.random() * 3);
  const boss = type === 'undertaker';
  const base = boss ? BOSS : ZTYPES[type];
  const z = {
    type, boss, lane,
    x: SPAWN_X - Math.random() * 1.2, z: LANE_Z[lane] + (Math.random() - 0.5) * 0.7,
    hp: base.hp * (boss ? Math.pow(1.22, save.night - 5) : zombieHpMul()),
    maxHp: 0, speed: base.speed * zombieSpeedMul() * (0.9 + Math.random() * 0.2),
    bounty: base.bounty, gate: base.gate, scale: base.scale,
    state: 'walk',           // walk | gate | purified | worker | corpse
    phase: Math.random() * Math.PI * 2,
    animPhase: Math.random() * Math.PI * 2,
    flinch: 0, limp: 0.82 + Math.random() * 0.36,
    slowT: 0, slowMul: 1, attackT: 0, channel: 0, dead: false, remove: false, corpse: null,
    slot: -1, ghostSet: !!base.ghost
  };
  z.maxHp = z.hp;
  zombies.push(z);
  if (boss) { bossRef = z; bossGroup.visible = true; sndBoss(); banner('👹 THE UNDERTAKER', 1800); shake(0.5); }
  return z;
}
function callWaveEarly() {
  if (state !== 'playing' || phase !== 'build') return;
  const bonus = Math.round(breather * 2);
  if (bonus > 0) { grantBones(bonus, true); floater(new THREE.Vector3(0, 3.4, 0), '+' + bonus + ' 🦴 early!', '#ffd98a'); }
  breather = 0;
  beginWave();
  sndClick();
}
function nightComplete() {
  phase = 'done';
  if (save.night === 1 && !save.tutDone && tutStep < 5) setTutStep(5);
  for (const z of zombies) {
    if (z.state === 'purified' && !z.dead) {
      z.remove = true;
      if (save.workers < workerCap()) {
        save.workers++;
        /* the checked-in worker takes a visible spot by the mill */
        const n = save.workers - 1;
        zombies.push({
          type: 'shambler', boss: false, lane: 2,
          x: MILL_POS.x - 2.6 + (n % 4) * 0.95, z: MILL_POS.z - 1.6 + Math.floor(n / 4) * 0.95,
          hp: 22, maxHp: 22, speed: 0.62, bounty: 0, gate: 0, scale: 1,
          state: 'worker', phase: Math.random() * 6.28, animPhase: Math.random() * 6.28,
          flinch: 0, limp: 1, slowT: 0, slowMul: 1, attackT: 0, channel: 0,
          dead: false, remove: false, corpse: null, slot: -1, ghostSet: false
        });
      } else grantBones(10, true);
    }
  }
  const bonus = grantBones(30 + 10 * save.night, true);
  save.stats.nights++;
  questTrack('nights', 1);
  if (save.night > save.bestNight) save.bestNight = save.night;
  persist();
  CG.gameplayStop(); CG.happytime();
  sndDawn();
  state = 'summary';
  $('sumTitle').textContent = '🌅 Dawn breaks — Night ' + save.night + ' held!';
  $('sumStats').innerHTML =
    'Zombies composted: <b>' + nightKills + '</b> · Purified into the crew: <b>' + nightPurified + '</b><br>' +
    'Bones earned tonight: <b>🦴 ' + fmt(nightEarned) + '</b> (incl. dawn bonus ' + fmt(bonus) + ')<br>' +
    'Mill crew: <b>' + save.workers + '</b> earning <b>' + fmt(workerRate() * 60) + ' 🦴/min</b> — even while you\'re away.<br>' +
    'Tomorrow night: <b>' + LOCATIONS[save.night % 3].name + '</b>' + (save.night % 5 === 4 ? ' · 👹 <b>The Undertaker walks on Night ' + (save.night + 1) + '</b>' : '');
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
  sndFall(); shake(1);
  state = 'over';
  $('overText').innerHTML = 'The horde smashed through on <b>Night ' + save.night + ', Wave ' + wave + '</b>.' +
    '<br>Your turrets, upgrades, crew and bones are all kept — spend them and try the night again.';
  showOnly(overEl);
  persist();
}
function doPrestige() {
  const gain = prestigeGain();
  if (gain <= 0) return;
  save.milestones += gain;
  save.shards += gain;
  const keepStats = save.stats, keepMuted = save.muted, keepQuests = save.quests;
  const fresh = defaultSave();
  fresh.shards = save.shards; fresh.milestones = save.milestones;
  fresh.stats = keepStats; fresh.muted = keepMuted; fresh.quests = keepQuests;
  fresh.started = true; fresh.bestNight = save.bestNight;
  fresh.tutDone = save.tutDone; fresh.tutStep = save.tutStep;
  save = fresh;
  turretState.clear();
  syncTurretModels();
  persist();
  CG.happytime();
  sndPurify();
  banner('🌟 New Moon! +' + gain + ' 🌟', 2200);
  toast('Permanent: +' + (20 * gain) + '% bones, +' + (15 * gain) + '% damage — forever.', 3200);
  startNight(false);
}

/* ---------------- combat ---------------- */
function killZombie(z, byTap) {
  if (z.dead) return;
  const h = headingFor(z);
  z.dead = true;
  z.state = 'corpse';
  z.corpse = {
    start: elapsed, hx: h.hx, hz: h.hz,
    fall: Math.random() < 0.55 ? 1 : -1,
    roll: (Math.random() - 0.5) * 0.7, headRoll: (Math.random() - 0.5) * 0.9,
    armL: 0.2 + Math.random() * 2.2, armR: 0.2 + Math.random() * 2.2,
    elbowL: Math.random() * 0.9, elbowR: Math.random() * 0.9,
    outL: 0.3 + Math.random() * 0.8, outR: -0.3 - Math.random() * 0.8,
    legL: (Math.random() - 0.5) * 1.6, legR: (Math.random() - 0.5) * 1.6,
    kneeL: 0.2 + Math.random() * 0.9, kneeR: 0.2 + Math.random() * 0.9
  };
  burst(z.x, 1.1 * z.scale, z.z, 0x761a12, z.boss ? 30 : 10, 2.2, 2.4);
  burst(z.x, 1.0 * z.scale, z.z, 0xd8d2bd, z.boss ? 18 : 6, 1.8, 2.2);
  const gained = grantBones(z.bounty, true);
  save.stats.kills++; nightKills++;
  questTrack('kills', 1);
  if (z.boss) { save.stats.boss++; questTrack('boss', 1); bossRef = null; banner('👹 UNDERTAKER DOWN +' + gained + ' 🦴', 2000); shake(0.7); CG.happytime(); }
  else floater(new THREE.Vector3(z.x, 2.3 * z.scale, z.z), '+' + gained, '#ffe9a8');
  sndDie(); if (!byTap) sndCoin();
}
function purifyZombie(z) {
  if (z.dead || z.boss) return;
  z.state = 'purified'; z.channel = 0;
  nightPurified++; save.stats.purified++;
  questTrack('purify', 1);
  burst(z.x, 1.4, z.z, 0xffd968, 20, 2, 3);
  floater(new THREE.Vector3(z.x, 2.2 * z.scale, z.z), '✨ purified!', '#ffd968');
  sndPurify();
}
function addWorker(z) {
  if (save.workers < workerCap()) {
    save.workers++;
    z.state = 'worker';
    z.workPhase = Math.random() * Math.PI * 2;
    /* take a spot in the crew cluster beside the mill */
    const n = save.workers - 1;
    z.x = MILL_POS.x - 2.6 + (n % 4) * 0.95;
    z.z = MILL_POS.z - 1.6 + Math.floor(n / 4) * 0.95;
    toast('🧟‍♂️ A new Mill worker! Crew: ' + save.workers + ' · ' + fmt(workerRate() * 60) + ' 🦴/min', 2400);
  } else {
    z.remove = true;
    const b = grantBones(10, true);
    floater(new THREE.Vector3(MILL_POS.x - 2, 2.6, MILL_POS.z), 'Mill full +' + b + ' 🦴', '#ffd98a');
  }
  persist(); syncHud();
}
function damageZombie(z, dmg) {
  if (z.dead || z.state === 'purified' || z.state === 'worker') return;
  z.hp -= dmg;
  if (z.hp <= 0) killZombie(z, false);
  else z.flinch = 1;
}
function tapZombie(z) {
  if (z.dead || z.state !== 'walk' && z.state !== 'gate') return;
  const d = tapDmg();
  z.flinch = 1;
  z.hp -= d;
  burst(z.x, 1.5 * z.scale, z.z, 0xffffff, 5, 1.6, 2);
  floater(new THREE.Vector3(z.x, 2.3 * z.scale, z.z), '-' + d, '#ffffff');
  save.stats.bonks++; questTrack('bonks', 1);
  if (save.upg.grip > 0) {
    for (const o of zombies) {
      if (o !== z && !o.dead && (o.state === 'walk' || o.state === 'gate') && Math.hypot(o.x - z.x, o.z - z.z) < 1.9) {
        o.hp -= Math.round(d * 0.5);
        if (o.hp <= 0) killZombie(o, true);
      }
    }
  }
  if (z.hp <= 0) killZombie(z, true);
  sndBonk();
  tutTick();
}
function turretTarget(t, range) {
  let best = null, bestX = -Infinity;
  for (const z of zombies) {
    if (z.dead || z.state !== 'walk' && z.state !== 'gate') continue;
    const p = plotPos(t.col, t.lane);
    const d = Math.hypot(z.x - p.x, z.z - p.z);
    if (d <= range && z.x > bestX) { best = z; bestX = z.x; }
  }
  return best;
}
const _from = new THREE.Vector3(), _to = new THREE.Vector3();
function updateTurrets(dt) {
  for (const t of save.turrets) {
    const key = t.col + ',' + t.lane;
    const st = turretState.get(key); if (!st) continue;
    const conf = TURRETS[t.type];
    const obj = turretObjs.get(key);
    const p = plotPos(t.col, t.lane);
    const range = conf.range * rangeMul();
    const lvlMul = LVL_MUL[t.lvl - 1];
    if (t.type === 'purifier') {
      if (!st.target || st.target.dead || st.target.state !== 'walk' && st.target.state !== 'gate' ||
          Math.hypot(st.target.x - p.x, st.target.z - p.z) > range) {
        st.target = turretTarget(t, range); st.channelT = 0;
      }
      if (st.target) {
        if (st.channelT === 0) fireBeam(_from.set(p.x, 2.5, p.z), _to.set(st.target.x, 1.2, st.target.z), conf.channel);
        st.channelT += dt;
        st.target.channel = st.channelT / conf.channel;
        if (Math.random() < dt * 6) burst(st.target.x, 1.6, st.target.z, 0xffd968, 1, 0.7, 1.4);
        if (st.channelT >= conf.channel) { purifyZombie(st.target); st.target = null; st.channelT = 0; }
      }
      continue;
    }
    st.cool -= dt;
    if (st.cool > 0) continue;
    const tgt = turretTarget(t, range);
    if (!tgt) continue;
    st.cool = conf.interval;
    _to.set(tgt.x, 1.1 * tgt.scale, tgt.z);
    if (t.type === 'lantern') {
      fireZap(_from.set(p.x, 2.6, p.z), _to);
      damageZombie(tgt, conf.dmg * lvlMul * dmgMul());
      burst(tgt.x, 1.2, tgt.z, 0xffd98a, 3, 1.2, 1.6);
      sndZap();
    } else if (t.type === 'sprinkler') {
      if (obj && obj.head) obj.head.rotation.y += 2.4;
      burst(tgt.x, 0.9, tgt.z, 0x9fd8ff, 4, 1.4, 1.8);
      for (const z of zombies) {
        if (!z.dead && (z.state === 'walk' || z.state === 'gate') && Math.hypot(z.x - tgt.x, z.z - tgt.z) <= conf.splash) {
          damageZombie(z, conf.dmg * lvlMul * dmgMul());
        }
      }
      sndSplash();
    } else if (t.type === 'bell') {
      if (obj) obj.swing = 1;
      fireRing(tgt.x, tgt.z, conf.radius);
      for (const z of zombies) {
        if (!z.dead && (z.state === 'walk' || z.state === 'gate') && Math.hypot(z.x - tgt.x, z.z - tgt.z) <= conf.radius) {
          damageZombie(z, conf.dmg * lvlMul * dmgMul());
          if (!z.dead) { z.slowT = conf.slowDur; z.slowMul = 1 - conf.slow; }
        }
      }
      sndBell();
    }
  }
}

/* ---------------- main simulation ---------------- */
let shakeT = 0;
function shake(n) { shakeT = Math.max(shakeT, n); }
function update(dt) {
  elapsed += dt;
  /* mill income, always ticking while playing */
  if (state === 'playing') {
    const inc = workerRate() * dt;
    if (inc > 0) { save.bones += inc; }
  }
  if (state !== 'playing') return;
  if (phase === 'build') {
    breather -= dt;
    if (breather <= 0) beginWave();
  } else if (phase === 'wave') {
    if (spawnQueue.length) {
      spawnTimer -= dt;
      if (spawnTimer <= 0) { spawnZombie(spawnQueue.shift()); spawnTimer = Math.max(0.35, 1.15 - wave * 0.05 - save.night * 0.02); }
    } else if (!zombies.some(z => !z.dead && (z.state === 'walk' || z.state === 'gate'))) {
      questTrack('waves', 1);
      if (wave >= waveTotal) { nightComplete(); return; }
      phase = 'build'; breather = 9;
      toast('☀️ Wave cleared — build, upgrade, then call the next wave', 2600);
      syncHud();
    }
  }
  /* zombies */
  for (const z of zombies) {
    if (z.dead) continue;
    if (z.flinch > 0) z.flinch = Math.max(0, z.flinch - dt / 0.24);
    if (z.state === 'walk') z.animPhase += dt * (3.2 + z.speed * 4.4);
    else if (z.state === 'purified') z.animPhase += dt * 7.2;
    else if (z.state === 'worker') z.animPhase += dt * 2.2;
    if (z.slowT > 0) { z.slowT -= dt; if (z.slowT <= 0) z.slowMul = 1; }
    if (z.state === 'walk') {
      z.x += z.speed * z.slowMul * dt;
      if (z.x >= GATE_X - 0.8) { z.state = 'gate'; z.x = GATE_X - 0.8; z.attackT = 0; }
    } else if (z.state === 'gate') {
      z.attackT += dt;
      if (save.upg.thorns > 0) { z.hp -= 8 * save.upg.thorns * dt; if (z.hp <= 0) { killZombie(z, false); continue; } }
      if (z.attackT >= 1.1) {
        z.attackT = 0;
        gateHp -= z.gate;
        shake(0.3);
        burst(GATE_X - 0.6, 1.6, z.z, 0xff8a5c, 6, 1.8, 2);
        floater(new THREE.Vector3(GATE_X - 1.2, 3, z.z), '-' + z.gate + ' ⛓️', '#ff9a8a');
        sndBonk();
        if (gateHp <= 0) { gateHp = 0; gateFallen(); }
        syncHud();
      }
    } else if (z.state === 'purified') {
      const dx = (MILL_POS.x - 2.2) - z.x, dz = (MILL_POS.z - 1.2) - z.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) { addWorker(z); }
      else { z.x += dx / d * 1.5 * dt; z.z += dz / d * 1.5 * dt; }
    }
  }
  zombies = zombies.filter(z => !z.remove);
  updateTurrets(dt);
  tutTick();
}

/* ---------------- horde rendering ---------------- */
function renderHorde() {
  let oi = 0, gi = 0, bossSeen = false;
  const camQ = camera.quaternion;
  for (const z of zombies) {
    if (z.remove) continue;
    const P = computePose(z);
    if (z.boss) {
      bossSeen = true;
      bossGroup.visible = true;
      bossGroup.position.set(z.x, 0, z.z);
      const localP = { ...P, x: 0, z: 0, armL: P.armL, armR: P.armR, legL: P.legL, legR: P.legR };
      applyFigure(bossParts, -1, localP, null);
      /* accessories follow the joints */
      bossHat.position.copy(JOINTS.headP).addScaledVector(JOINTS.headUp, 0.13 * P.scale);
      bossHat.quaternion.copy(JOINTS.headQ);
      bossHat.scale.setScalar(P.scale);
      _v1.set(-1, 0, 0); /* behind the pelvis, hanging from the coat */
      bossTail.position.copy(JOINTS.pelvisP).addScaledVector(_fwd, -0.17 * P.scale);
      bossTail.position.y += 0.06 * P.scale;
      bossTail.quaternion.copy(JOINTS.torsoQ);
      bossTail.scale.setScalar(P.scale);
      bossLamp.position.copy(JOINTS.handR);
      bossLampGlow.position.copy(JOINTS.handR);
      continue;
    }
    const set = z.ghostSet ? ghostHorde : horde;
    const max = z.ghostSet ? GHOST_MAX : HORDE_MAX;
    const i = z.ghostSet ? gi++ : oi++;
    if (i >= max) continue;
    z.slot = i;
    applyFigure(set, i, P, figurePalette(z));
    /* HP bar (billboarded to the fixed camera) */
    const frac = clamp(z.hp / z.maxHp, 0, 1);
    const showBar = frac < 1 && z.state !== 'worker' && z.state !== 'corpse';
    if (showBar) {
      dummy.position.set(z.x, 2.2 * P.scale, z.z);
      dummy.quaternion.copy(camQ); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      set.barBg.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(Math.max(0.02, frac), 0.62, 1);
      dummy.translateX(-(1 - frac) * 0.475);
      dummy.updateMatrix();
      set.bar.setMatrixAt(i, dummy.matrix);
      _c.setHSL(0.33 * frac, 0.85, 0.55); set.bar.setColorAt(i, _c);
      z.barShown = true;
    } else { hidePart(set.bar, i); hidePart(set.barBg, i); z.barShown = false; }
  }
  if (!bossSeen) bossGroup.visible = false;
  for (const [set, used, max] of [[horde, oi, HORDE_MAX], [ghostHorde, gi, GHOST_MAX]]) {
    for (let i = used; i < max; i++) {
      for (const [key] of FIG_SPEC) hidePart(set[key], i);
      hidePart(set.bar, i); hidePart(set.barBg, i);
    }
    const anyVisible = used > 0;
    for (const [key] of FIG_SPEC) {
      set[key].visible = anyVisible;
      set[key].count = used;
      if (anyVisible) { set[key].instanceMatrix.needsUpdate = true; if (set[key].instanceColor) set[key].instanceColor.needsUpdate = true; }
    }
    let anyBar = false;
    for (const z of zombies) if (z.barShown && (z.ghostSet ? set === ghostHorde : set === horde)) { anyBar = true; break; }
    set.bar.visible = set.barBg.visible = anyVisible && anyBar;
    set.bar.count = set.barBg.count = used;
    if (set.bar.visible) { set.bar.instanceMatrix.needsUpdate = true; set.barBg.instanceMatrix.needsUpdate = true; if (set.bar.instanceColor) set.bar.instanceColor.needsUpdate = true; }
  }
}

/* ---------------- DOM / overlays ---------------- */
const menuEl = $('menu'), awayEl = $('away'), buildEl = $('buildSheet'), turretEl = $('turretSheet'),
  upgEl = $('upgrades'), questEl = $('quests'), summaryEl = $('summary'), prestigeEl = $('prestige'),
  overEl = $('over'), pausedEl = $('paused'), howtoEl = $('howto');
const OVERLAYS = [menuEl, awayEl, upgEl, questEl, summaryEl, prestigeEl, overEl, pausedEl, howtoEl];
function showOnly(el) { for (const o of OVERLAYS) o.classList.toggle('hidden', o !== el); }
function closeSheets() { buildEl.classList.add('hidden'); turretEl.classList.add('hidden'); sel = null; }
let toastTimer = 0, bannerTimer = 0;
function toast(msg, ms) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), ms || 2200);
}
function banner(msg, ms) {
  const b = $('banner');
  b.textContent = msg; b.classList.add('on');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => b.classList.remove('on'), ms || 1600);
}

/* ---------------- HUD ---------------- */
function syncHud() {
  $('bones').textContent = fmt(save.bones);
  $('nightLbl').textContent = save.night;
  $('workersLbl').textContent = save.workers + '/' + workerCap();
  $('shardLbl').textContent = save.shards;
  const ghp = state === 'playing' || state === 'paused' ? gateHp : maxGateHp();
  $('gateBar').style.width = clamp(ghp / maxGateHp() * 100, 0, 100) + '%';
  $('gateLbl').textContent = Math.ceil(ghp);
  const wl = $('waveLbl');
  if (state !== 'playing' && state !== 'paused') wl.textContent = 'At the gate…';
  else if (phase === 'wave') wl.textContent = 'Wave ' + wave + '/' + waveTotal + (isBossNight() && wave === waveTotal ? ' 👹' : '');
  else if (phase === 'build') wl.textContent = 'Next wave in ' + Math.ceil(breather) + 's';
  else wl.textContent = 'Dawn';
  const cb = $('callWaveBtn');
  cb.disabled = !(state === 'playing' && phase === 'build');
  cb.textContent = phase === 'build' && state === 'playing'
    ? '⚔️ Call the wave early (+' + Math.round(breather * 2) + ' 🦴)'
    : '⚔️ Call the wave early';
  syncQuestBadge();
}
function syncMenu() {
  $('mBones').textContent = fmt(save.bones);
  $('mBest').textContent = save.bestNight;
  $('mCrew').textContent = save.workers;
  $('mRate').textContent = fmt(workerRate() * 60);
  $('mShards').textContent = save.shards;
  const pg = prestigeGain();
  $('menuPrestigeLine').textContent = pg > 0
    ? '🌟 A New Moon is ready — prestige from the dawn summary after any night.'
    : 'Hold ' + Math.max(0, 5 - (save.bestNight % 5)) + ' more night(s) to earn the next 🌟 Moon Shard.';
  $('startBtn').textContent = save.started ? '🌙 Begin Night ' + save.night : '🌙 Start the Night';
}
function syncQuestBadge() {
  const ready = save.quests.list.some(q => { const d = questDef(q.id); return d && !q.claimed && q.prog >= d.goal; });
  $('questBadge').classList.toggle('hidden', !ready);
}

/* ---------------- tutorial (first night, guided, skippable) ---------------- */
let tutStep = save.tutStep || 0;
const TUT_TEXT = [
  '',
  '👆 Tap a glowing stone plot to build your first turret',
  '🏮 Build a Lantern Post — it zaps zombies with holy light',
  '🦴 Kills pay Bones. Bones build your defense',
  '💦 Add a Holy Sprinkler for groups — short reach, rapid splash',
  '🏆 The Purifier turns zombies into Mill workers who earn forever'
];
function setTutStep(n) {
  if (n === tutStep) return;
  tutStep = n; save.tutStep = n; persist();
  syncTutBar();
}
function finishTut() { save.tutDone = true; save.tutStep = 5; tutStep = 5; persist(); syncTutBar(); }
function tutActive() { return state === 'playing' && save.night === 1 && !save.tutDone && tutStep >= 1 && tutStep <= 5; }
function syncTutBar() {
  const on = tutActive();
  $('tutBar').classList.toggle('on', on);
  if (on) $('tutText').textContent = TUT_TEXT[tutStep];
}
function tutTick() {
  if (!tutActive()) return;
  if (tutStep === 1 && sel) setTutStep(2);
  else if (tutStep === 2 && save.turrets.length >= 1) setTutStep(3);
  else if (tutStep === 3 && Math.floor(save.bones) >= TURRETS.sprinkler.cost) setTutStep(4);
  else if (tutStep === 4 && (save.turrets.some(t => t.type === 'sprinkler') || Math.floor(save.bones) >= TURRETS.purifier.cost)) setTutStep(5);
  syncTutBar();
}
$('tutSkip').addEventListener('click', () => { finishTut(); sndClick(); });

/* ---------------- build / turret sheets ---------------- */
function plotTurret(col, lane) { return save.turrets.find(t => t.col === col && t.lane === lane); }
function openBuildSheet(col, lane) {
  sel = { col, lane };
  turretEl.classList.add('hidden');
  const wrap = $('buildCards');
  wrap.innerHTML = '';
  for (const type of TURRET_ORDER) {
    const c = TURRETS[type];
    const cost = turretCost(type, 1);
    const afford = Math.floor(save.bones) >= cost;
    const card = document.createElement('button');
    card.className = 'card' + (afford ? '' : ' cant') + (tutActive() && tutStep === 2 && type === 'lantern' ? ' glow' : '');
    card.innerHTML = '<span class="nm">' + c.icon + ' ' + c.name + '</span><span class="ds">' + c.desc + '</span>' +
      '<span class="ct' + (afford ? '' : ' short') + '">🦴 ' + cost + (afford ? '' : ' · Need ' + (cost - Math.floor(save.bones)) + ' more') + '</span>';
    card.addEventListener('click', () => { if (afford) buildTurret(type); else sndDenied(); });
    wrap.appendChild(card);
  }
  buildEl.classList.remove('hidden');
  syncPlotRings();
}
function openTurretSheet(t) {
  sel = { col: t.col, lane: t.lane };
  buildEl.classList.add('hidden');
  const c = TURRETS[t.type];
  $('turretTitle').textContent = c.icon + ' ' + c.name + ' · Lv ' + t.lvl;
  const stats = t.type === 'purifier'
    ? 'Channels a zombie into a Mill worker in ' + c.channel + 's. Range ' + (c.range * rangeMul()).toFixed(1) + '.'
    : 'Damage ' + Math.round(c.dmg * LVL_MUL[t.lvl - 1] * dmgMul()) + ' · Range ' + (c.range * rangeMul()).toFixed(1) + (c.splash ? ' · Splash' : '') + (c.radius ? ' · Area toll' : '');
  $('turretInfo').textContent = stats;
  const upBtn = $('turretUpBtn');
  if (t.lvl >= 3) { upBtn.textContent = 'Max level'; upBtn.disabled = true; }
  else {
    const cost = turretCost(t.type, t.lvl + 1);
    upBtn.disabled = false;
    upBtn.textContent = '⬆️ Upgrade · 🦴 ' + cost + (Math.floor(save.bones) < cost ? ' (need ' + (cost - Math.floor(save.bones)) + ' more)' : '');
  }
  $('turretSellBtn').textContent = 'Sell · +🦴 ' + Math.floor(turretInvested(t) * 0.7);
  turretEl.classList.remove('hidden');
  syncPlotRings();
}
function buildTurret(type) {
  if (!sel) return;
  const cost = turretCost(type, 1);
  if (Math.floor(save.bones) < cost) { sndDenied(); return; }
  if (plotTurret(sel.col, sel.lane)) return;
  save.bones -= cost;
  save.turrets.push({ col: sel.col, lane: sel.lane, type, lvl: 1 });
  turretState.set(sel.col + ',' + sel.lane, { cool: 0, target: null, channelT: 0 });
  save.started = true;
  syncTurretModels();
  const p = plotPos(sel.col, sel.lane);
  burst(p.x, 1.2, p.z, 0xffe9a8, 12, 1.6, 2.4);
  sndBuild();
  closeSheets(); syncPlotRings();
  persist(); syncHud();
  tutTick();
}
function sellTurret() {
  if (!sel) return;
  const t = plotTurret(sel.col, sel.lane); if (!t) return;
  save.bones += Math.floor(turretInvested(t) * 0.7);
  save.turrets = save.turrets.filter(x => x !== t);
  turretState.delete(sel.col + ',' + sel.lane);
  syncTurretModels();
  sndCoin();
  closeSheets(); syncPlotRings();
  persist(); syncHud();
}
function upgradeTurret() {
  if (!sel) return;
  const t = plotTurret(sel.col, sel.lane); if (!t || t.lvl >= 3) return;
  const cost = turretCost(t.type, t.lvl + 1);
  if (Math.floor(save.bones) < cost) { sndDenied(); return; }
  save.bones -= cost;
  t.lvl++;
  syncTurretModels();
  sndBuild();
  openTurretSheet(t);
  persist(); syncHud();
}
$('buildClose').addEventListener('click', () => { closeSheets(); syncPlotRings(); sndClick(); });
$('turretClose').addEventListener('click', () => { closeSheets(); syncPlotRings(); sndClick(); });
$('turretUpBtn').addEventListener('click', upgradeTurret);
$('turretSellBtn').addEventListener('click', sellTurret);
function syncPlotRings() {
  const canAffordAny = Math.floor(save.bones) >= TURRETS.lantern.cost;
  for (const pm of plotMeshes) {
    const occupied = !!plotTurret(pm.col, pm.lane);
    const selected = sel && sel.col === pm.col && sel.lane === pm.lane;
    const tutTarget = tutActive() && tutStep === 1 && !occupied;
    pm.ring.visible = !occupied && (selected || tutTarget || (state === 'playing' && phase === 'build' && canAffordAny));
    pm.ring.material.color.setHex(selected ? 0xffffff : 0xffd98a);
  }
}

/* ---------------- upgrades tree UI ---------------- */
function reqMet(key) {
  const u = TREE[key];
  if (!u.req) return true;
  return (save.upg[u.req[0]] || 0) >= u.req[1];
}
function renderTree() {
  $('upgBones').textContent = fmt(save.bones);
  const wrap = $('treeWrap');
  wrap.innerHTML = '';
  for (const branch of BRANCHES) {
    const div = document.createElement('div');
    div.className = 'branch';
    div.innerHTML = '<h4>' + branch + '</h4>';
    for (const key of Object.keys(TREE)) {
      const u = TREE[key];
      if (u.branch !== branch) continue;
      const lvl = save.upg[key] || 0;
      const met = reqMet(key);
      const node = document.createElement('div');
      node.className = 'node' + (met ? '' : ' locked');
      let html = '<span class="nm">' + u.name + '</span><span class="ds">' + u.desc + '</span>' +
        '<span class="pips">' + '●'.repeat(lvl) + '○'.repeat(u.max - lvl) + '</span>';
      if (!met) html += '<span class="req">Requires ' + TREE[u.req[0]].name.replace(/^\S+ /, '') + ' Lv ' + u.req[1] + '</span>';
      node.innerHTML = html;
      if (met && lvl < u.max) {
        const cost = u.costs[lvl];
        const afford = Math.floor(save.bones) >= cost;
        const btn = document.createElement('button');
        btn.className = 'buybtn';
        btn.disabled = !afford;
        btn.innerHTML = 'Buy · 🦴 ' + cost + (afford ? '' : ' <span class="short">(need ' + (cost - Math.floor(save.bones)) + ' more)</span>');
        btn.addEventListener('click', () => {
          if (Math.floor(save.bones) < cost) { sndDenied(); return; }
          save.bones -= cost;
          save.upg[key]++;
          if (key === 'gate') gateHp = Math.min(maxGateHp(), gateHp + 50);
          sndBuild();
          persist(); renderTree(); syncHud();
        });
        node.appendChild(btn);
      } else if (lvl >= u.max) {
        const s = document.createElement('span');
        s.className = 'req'; s.style.color = '#7fd08a'; s.textContent = 'MAXED';
        node.appendChild(s);
      }
      div.appendChild(node);
    }
    wrap.appendChild(div);
  }
}
let upgReturn = 'menu';
function openUpgrades(from) {
  upgReturn = from || state;
  if (state === 'playing') { pausedFrom = 'playing'; state = 'paused'; CG.gameplayStop(); }
  renderTree();
  showOnly(upgEl);
  closeSheets();
  sndClick();
}
function closeUpgrades() {
  if (upgReturn === 'playing' && (state === 'paused')) { state = 'playing'; pausedFrom = null; CG.gameplayStart(); showOnly(null); }
  else if (upgReturn === 'summary') showOnly(summaryEl);
  else if (upgReturn === 'over') showOnly(overEl);
  else { state = state === 'paused' ? 'menu' : state; showOnly(menuEl); syncMenu(); }
  syncHud();
}
$('upgBtn').addEventListener('click', () => openUpgrades(state === 'playing' ? 'playing' : state));
$('menuUpgBtn').addEventListener('click', () => openUpgrades('menu'));
$('upgClose').addEventListener('click', () => { closeUpgrades(); sndClick(); });

/* ---------------- quests UI ---------------- */
let questReturn = 'menu';
function renderQuests() {
  const wrap = $('questList');
  wrap.innerHTML = '';
  for (const q of save.quests.list) {
    const d = questDef(q.id); if (!d) continue;
    const done = q.prog >= d.goal;
    const div = document.createElement('div');
    div.className = 'quest';
    const reward = d.reward.shards ? '🌟 ' + d.reward.shards + ' Moon Shard' : '🦴 ' + d.reward.bones;
    div.innerHTML = '<span class="qt">' + d.icon + ' ' + d.text + '</span>' +
      '<div class="qbar"><div class="qfill" style="width:' + clamp(q.prog / d.goal * 100, 0, 100) + '%"></div></div>' +
      '<div class="qr"><span class="qp">' + Math.min(q.prog, d.goal) + ' / ' + d.goal + ' · Reward: ' + reward + '</span></div>';
    const btn = document.createElement('button');
    if (q.claimed) { btn.className = 'ghostbtn'; btn.textContent = '✓ Claimed'; btn.disabled = true; }
    else if (done) {
      btn.className = 'bigbtn'; btn.textContent = 'Claim ' + reward;
      btn.addEventListener('click', () => {
        q.claimed = true;
        if (d.reward.bones) grantBones(d.reward.bones, false);
        if (d.reward.shards) save.shards += d.reward.shards;
        sndPurify();
        persist(); renderQuests(); syncHud(); syncMenu();
      });
    } else { btn.className = 'ghostbtn'; btn.textContent = 'In progress'; btn.disabled = true; }
    div.querySelector('.qr').appendChild(btn);
    wrap.appendChild(div);
  }
}
function openQuests(from) {
  questReturn = from || state;
  if (state === 'playing') { pausedFrom = 'playing'; state = 'paused'; CG.gameplayStop(); }
  renderQuests();
  showOnly(questEl);
  closeSheets();
  sndClick();
}
function closeQuests() {
  if (questReturn === 'playing' && state === 'paused') { state = 'playing'; pausedFrom = null; CG.gameplayStart(); showOnly(null); }
  else if (questReturn === 'summary') showOnly(summaryEl);
  else { if (state === 'paused') state = 'menu'; showOnly(menuEl); syncMenu(); }
  syncHud();
}
$('questBtn').addEventListener('click', () => openQuests(state));
$('menuQuestBtn').addEventListener('click', () => openQuests('menu'));
$('questClose').addEventListener('click', () => { closeQuests(); sndClick(); });

/* ---------------- flow buttons ---------------- */
function toMenu() {
  state = 'menu';
  zombies = zombies.filter(z => z.state === 'worker');
  bossGroup.visible = false;
  showOnly(menuEl);
  closeSheets(); syncPlotRings();
  syncMenu(); syncHud();
  CG.gameplayStop();
  persist();
}
$('startBtn').addEventListener('click', () => { ensureAudio(); sndClick(); save.started = true; if (!save.tutDone && tutStep === 0) { tutStep = 1; save.tutStep = 1; } startNight(true); syncPlotRings(); });
$('nextNightBtn').addEventListener('click', () => {
  save.night++;
  persist();
  CG.requestAd(() => { startNight(false); syncPlotRings(); });
});
$('sumMenuBtn').addEventListener('click', () => { save.night++; persist(); toMenu(); });
$('prestigeBtn').addEventListener('click', () => {
  const pg = prestigeGain();
  $('prestigeText').innerHTML = 'Reset the graveyard to Night 1 — turrets, tree, crew and bones start over.<br>' +
    'You keep: stats, quests, and <b>+' + pg + ' 🌟 Moon Shard' + (pg > 1 ? 's' : '') + '</b>.<br>' +
    'Each shard is permanent: <b>+20% bones, +15% damage</b>. Total after: 🌟 ' + (save.shards + pg) + '.';
  showOnly(prestigeEl);
  sndClick();
});
$('prestigeGo').addEventListener('click', () => { CG.requestAd(() => doPrestige()); });
$('prestigeCancel').addEventListener('click', () => { showOnly(summaryEl); sndClick(); });
$('retryBtn').addEventListener('click', () => { startNight(false); syncPlotRings(); sndClick(); });
$('overMenuBtn').addEventListener('click', toMenu);
$('pauseMenuBtn').addEventListener('click', () => { pausedFrom = null; toMenu(); });
$('resumeBtn').addEventListener('click', () => togglePause(false));
$('howBtn').addEventListener('click', () => { showOnly(howtoEl); sndClick(); });
$('howClose').addEventListener('click', () => { if (state === 'menu') showOnly(menuEl); else showOnly(null); sndClick(); });
$('awayBtn').addEventListener('click', () => { showOnly(menuEl); syncMenu(); sndClick(); });
function togglePause(force) {
  if (state === 'playing' && force !== false) {
    pausedFrom = 'playing'; state = 'paused';
    showOnly(pausedEl);
    CG.gameplayStop();
  } else if (state === 'paused' && pausedFrom === 'playing') {
    pausedFrom = null; state = 'playing';
    showOnly(null);
    CG.gameplayStart();
  }
  syncHud();
}
$('pauseBtn').addEventListener('click', () => togglePause());
$('muteBtn').addEventListener('click', () => { save.muted = !save.muted; persist(); ensureAudio(); updateMute(); });
$('callWaveBtn').addEventListener('click', callWaveEarly);
addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!buildEl.classList.contains('hidden') || !turretEl.classList.contains('hidden')) { closeSheets(); syncPlotRings(); }
    else togglePause();
  }
  if (e.code === 'KeyM') $('muteBtn').click();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') togglePause(true);
  persist();
});

/* ---------------- input: raycast taps ---------------- */
const raycaster = new THREE.Raycaster();
const pointerV = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitP = new THREE.Vector3();
let downAt = 0;
renderer.domElement.addEventListener('pointerdown', e => {
  ensureAudio();
  downAt = performance.now();
  const rect = renderer.domElement.getBoundingClientRect();
  pointerV.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointerV, camera);
  if (!raycaster.ray.intersectPlane(groundPlane, hitP)) return;
  if (state !== 'playing') return;
  /* zombie bonk first (nearest within 0.85) */
  let best = null, bestD = 0.95;
  for (const z of zombies) {
    if (z.dead || (z.state !== 'walk' && z.state !== 'gate')) continue;
    const d = Math.hypot(z.x - hitP.x, z.z - hitP.z);
    if (d < bestD) { bestD = d; best = z; }
  }
  if (best) { tapZombie(best); return; }
  /* then plots */
  for (const pm of plotMeshes) {
    if (Math.hypot(pm.pos.x - hitP.x, pm.pos.z - hitP.z) < 1.25) {
      const t = plotTurret(pm.col, pm.lane);
      if (t) openTurretSheet(t); else openBuildSheet(pm.col, pm.lane);
      sndClick();
      return;
    }
  }
  closeSheets(); syncPlotRings();
});

/* ---------------- sky mood + ambience ---------------- */
const MOODS = {
  dusk:  { fog: new THREE.Color(0x2a2138), sky: new THREE.Color(0x8a6a9a), hemiI: 0.98, moonI: 1.1, exp: 1.16 },
  night: { fog: null, sky: null, hemiI: 0.88, moonI: 1.35, exp: 1.14 },
  deep:  { fog: new THREE.Color(0x0a0e1e), sky: new THREE.Color(0x5a6aa8), hemiI: 0.68, moonI: 1.5, exp: 1.06 },
  dawn:  { fog: new THREE.Color(0x4a3644), sky: new THREE.Color(0xd9a37f), hemiI: 1.12, moonI: 0.75, exp: 1.2 }
};
let moodCur = { fog: new THREE.Color(0x131c30), hemiI: 0.75, moonI: 1.25, exp: 1.1 };
function moodTarget() {
  if (state === 'summary' || state === 'away') return 'dawn';
  if (state === 'menu') return 'dusk';
  if (phase === 'build' && wave === 0) return 'dusk';
  if (isBossNight() && wave >= waveTotal - 1) return 'deep';
  return 'night';
}
function updateSky(dt) {
  const name = moodTarget();
  const M = MOODS[name];
  const loc = LOCATIONS[locationIdx];
  const fogT = name === 'night' ? _c.setHex(loc.fog) : (M.fog || _c.setHex(loc.fog));
  scene.fog.color.lerp(fogT, Math.min(1, dt * 0.7));
  moodCur.hemiI += (M.hemiI - moodCur.hemiI) * Math.min(1, dt * 0.7);
  moodCur.moonI += (M.moonI - moodCur.moonI) * Math.min(1, dt * 0.7);
  moodCur.exp += (M.exp - moodCur.exp) * Math.min(1, dt * 0.7);
  hemi.intensity = moodCur.hemiI;
  moonLight.intensity = moodCur.moonI;
  renderer.toneMappingExposure = moodCur.exp;
  const flick = 0.85 + Math.sin(elapsed * 11) * 0.07 + Math.sin(elapsed * 23 + 1.7) * 0.05;
  fireLightL.intensity = 26 * flick;
  fireLightR.intensity = 26 * (0.9 + Math.sin(elapsed * 13 + 2) * 0.08);
  millLight.intensity = 18 * (0.9 + Math.sin(elapsed * 7) * 0.06);
  millWheel.rotation.z -= dt * (save.workers > 0 ? 0.7 : 0.12);
  for (const obj of turretObjs.values()) {
    if (obj.bellPivot && obj.swing > 0) {
      obj.swing = Math.max(0, obj.swing - dt * 1.4);
      obj.bellPivot.rotation.x = Math.sin(obj.swing * Math.PI * 3) * 0.5 * obj.swing;
    }
    if (obj.ring) obj.ring.rotation.z += dt * 0.8;
  }
  for (const pm of plotMeshes) {
    if (pm.ring.visible) pm.ring.material.opacity = 0.45 + Math.sin(elapsed * 4) * 0.25;
  }
  /* gate doors sag as the gate takes damage */
  const frac = state === 'playing' || state === 'paused' ? gateHp / maxGateHp() : 1;
  gateDoors.rotation.z = (1 - frac) * 0.1;
  gateDoors.position.y = -(1 - frac) * 0.22;
}
function updateFx(dt) {
  for (const z of zapPool) {
    if (z.life > 0) { z.life -= dt; z.line.visible = z.life > 0; z.line.material.opacity = clamp(z.life / 0.09, 0, 1) * 0.95; }
    else z.line.visible = false;
  }
  for (const r of ringPool) {
    if (r.life > 0) {
      r.life -= dt;
      const k = 1 - clamp(r.life / 0.45, 0, 1);
      r.m.scale.setScalar(0.3 + k * r.maxR);
      r.m.material.opacity = (1 - k) * 0.55;
      r.m.visible = r.life > 0;
    } else r.m.visible = false;
  }
  for (const b of beamPool) {
    if (b.life > 0) { b.life -= dt; b.m.material.opacity = clamp(b.life, 0, 0.75); b.m.visible = b.life > 0; }
    else b.m.visible = false;
  }
  updateParticles(dt);
  updateFloaters(dt);
}

/* ---------------- camera + resize + perf governor ---------------- */
const camBase = CAM_POS.clone();
let lastW = 0, lastH = 0;
function resize() {
  const w = stageEl.clientWidth, h = stageEl.clientHeight;
  if (w < 2 || h < 2 || (w === lastW && h === lastH)) return;
  lastW = w; lastH = h;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  /* portrait: pull back and raise so the whole field stays framed */
  const t = clamp((1.35 - camera.aspect) / 0.75, 0, 1);
  camBase.copy(CAM_POS).lerp(new THREE.Vector3(0.6, 19.5, 25.5), t);
  camera.position.copy(camBase);
  camera.fov = 41 + t * 7;
  camera.updateProjectionMatrix();
  camera.lookAt(CAM_TGT);
}
addEventListener('resize', resize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
setInterval(resize, 600);
let govLevel = 0, govTime = 0, govFrames = 0, govLast = performance.now();
function govern() {
  if (govLevel >= 2) return;
  const now = performance.now();
  govTime += (now - govLast) / 1000; govLast = now; govFrames++;
  if (govTime < 1.5) return;
  const avg = govFrames / govTime;
  govTime = 0; govFrames = 0;
  if (avg >= 24) { govLevel = 2; return; }
  govLevel++;
  if (govLevel === 1) { renderer.setPixelRatio(1); lastW = 0; resize(); }
  else {
    renderer.shadowMap.enabled = false;
    moonLight.castShadow = false;
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  }
}

/* ---------------- main loop ---------------- */
const clock = new THREE.Clock();
let hudTick = 0, camLock = false;
function animate() {
  requestAnimationFrame(animate);
  resize();
  const rawDt = Math.min(clock.getDelta(), 0.05);
  const dt = state === 'paused' ? 0 : rawDt;
  if (dt > 0) update(dt);
  zombies = zombies.filter(z => !z.remove);
  /* camera: idle drift on menu, start-of-night sweep, damage shake */
  camDrift += rawDt;
  if (camLock) { /* debug close-up holds the camera */ }
  else if (state === 'menu') {
    camera.position.x = camBase.x + Math.sin(camDrift * 0.11) * 1.6;
    camera.position.y = camBase.y + Math.sin(camDrift * 0.07) * 0.5;
    camera.position.z = camBase.z;
    camera.lookAt(CAM_TGT);
  } else {
    if (startSweep > 0) {
      startSweep -= rawDt;
      const k = clamp(startSweep / 1.6, 0, 1);
      camera.position.x = camBase.x - (1 - k) * 4.5;
      camera.position.z = camBase.z - (1 - k) * 2;
      camera.lookAt(CAM_TGT.x - (1 - k) * 3, CAM_TGT.y, CAM_TGT.z);
    } else {
      camera.position.x = camBase.x + (camera.aspect < 1.35 ? 0 : Math.sin(camDrift * 0.05) * 0.2);
      camera.position.y = camBase.y;
      camera.position.z = camBase.z;
      camera.lookAt(CAM_TGT);
    }
  }
  if (shakeT > 0) {
    shakeT = Math.max(0, shakeT - rawDt * 1.8);
    camera.position.x += (Math.random() - 0.5) * 0.22 * shakeT;
    camera.position.y += (Math.random() - 0.5) * 0.18 * shakeT;
  }
  renderHorde();
  updateSky(rawDt);
  updateFx(dt);
  renderer.render(scene, camera);
  govern();
  hudTick += rawDt;
  if (hudTick > 0.25) { hudTick = 0; if (state === 'playing') syncHud(); syncPlotRings(); }
}

/* ---------------- boot ---------------- */
(async function boot() {
  CG.loadingStart();
  await CG.init();
  /* restore the persistent Mill crew as visible workers */
  for (let i = 0; i < save.workers; i++) {
    zombies.push({
      type: 'shambler', boss: false, lane: 2,
      x: MILL_POS.x - 2.6 + (i % 4) * 0.95, z: MILL_POS.z - 1.6 + Math.floor(i / 4) * 0.95,
      hp: 22, maxHp: 22, speed: 0.62, bounty: 0, gate: 0, scale: 1,
      state: 'worker', phase: Math.random() * 6.28, animPhase: Math.random() * 6.28,
      flinch: 0, limp: 1, slowT: 0, slowMul: 1, attackT: 0, channel: 0,
      dead: false, remove: false, corpse: null, slot: -1, ghostSet: false
    });
  }
  syncTurretModels();
  applyLocation();
  /* offline earnings (crew rate at logoff × away time, 8h cap) */
  let awayEarned = 0;
  if (save.lastSeen > 0 && save.workers > 0) {
    const awayMs = Date.now() - save.lastSeen;
    if (awayMs > 120000) awayEarned = offlineEarned(awayMs);
  }
  if (awayEarned > 0) {
    save.bones += awayEarned;
    save.stats.earned += awayEarned;
    $('awayText').innerHTML = 'Your Mill crew of <b>' + save.workers + '</b> kept working while you were gone:<br><b>🦴 +' + fmt(awayEarned) + '</b> bones banked.';
    state = 'away';
    showOnly(awayEl);
  } else {
    state = 'menu';
    showOnly(menuEl);
  }
  syncMenu(); syncHud(); syncTutBar(); updateMute();
  persist();
  resize();
  animate();
  CG.loadingStop();
})();

/* ---------------- debug / smoke-test handle ---------------- */
window.GRAVEYARD3D = {
  get state() { return state; },
  get phase() { return phase; },
  get save() { return save; },
  get zombies() { return zombies; },
  get gateHp() { return gateHp; },
  get wave() { return wave; },
  renderer, scene, camera,
  stats() {
    const info = renderer.info.render;
    return { calls: info.calls, triangles: info.triangles, govLevel, state, phase, wave, zombies: zombies.length };
  },
  startNight: () => startNight(true),
  buildTurret: (col, lane, type) => { sel = { col, lane }; buildTurret(type); },
  spawnZombie: t => spawnZombie(t),
  callWave: () => { if (phase === 'build') { breather = 0; beginWave(); } },
  damage: (z, d) => damageZombie(z, d),
  kill: z => killZombie(z, false),
  purify: z => purifyZombie(z),
  offlineEarnedFor, offlineEarned, prestigeGain,
  doPrestige, nightComplete,
  setNight: n => { save.night = n; applyLocation(); },
  addBones: n => { save.bones += n; },
  tutStep: () => tutStep,
  tutDone: () => save.tutDone,
  step: dt => { update(dt); },
  closeUp(x, z, dist) {
    camLock = true;
    camera.position.set(x - (dist || 3.2), 1.55, z + (dist || 3.2) * 0.9);
    camera.lookAt(x + 0.4, 1.05, z);
  },
  closeFront(x, z, dist) { /* the figure walks +x, so its face is toward +x */
    camLock = true;
    camera.position.set(x + (dist || 2.4), 1.35, z + (dist || 2.4) * 0.45);
    camera.lookAt(x, 1.02, z);
  },
  pinQuality() { /* capture/smoke helper: stop the perf governor stepping down on slow test rigs */
    govLevel = 2;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    moonLight.castShadow = true;
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    lastW = 0; resize();
  },
  camHome() { camLock = false; camera.position.copy(camBase); camera.lookAt(CAM_TGT); }
};
