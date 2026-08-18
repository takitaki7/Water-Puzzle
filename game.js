/* ============================================================
   Water Puzzle  —  a "Magic Sort!"-style color sorting game
   Canvas-rendered liquid: real cylinder shading, a rippling
   surface, arcing pour streams and splash ripples.
   Pure vanilla JS. No dependencies.
   ============================================================ */

const CAPACITY = 4; // liquid units per tube

// A vivid, well-separated palette. Index 0 is unused so colors map to
// 1..N (0 == empty). Each entry carries a light/base/dark triad so the
// liquid can be shaded like a real cylinder of water.
const PALETTE = [
  null,
  { l: "#ff8a8a", b: "#ef4444", d: "#b01818" }, // red
  { l: "#7db4ff", b: "#3b82f6", d: "#1a52c0" }, // blue
  { l: "#71e59a", b: "#22c55e", d: "#128a3c" }, // green
  { l: "#f7d451", b: "#eab308", d: "#a97a06" }, // yellow
  { l: "#cf96ff", b: "#a855f7", d: "#7521c0" }, // purple
  { l: "#ffab5e", b: "#f97316", d: "#bd4e07" }, // orange
  { l: "#f9a3cf", b: "#ec4899", d: "#b21e68" }, // pink
  { l: "#5fe6d3", b: "#14b8a6", d: "#0a7d70" }, // teal
  { l: "#bef264", b: "#84cc16", d: "#54860b" }, // lime
  { l: "#b6a5f7", b: "#8b5cf6", d: "#5b2fc0" }, // violet
  { l: "#67e8f9", b: "#06b6d4", d: "#087f96" }, // cyan
  { l: "#fda4b4", b: "#f43f5e", d: "#b41436" }, // rose
];

/* ---------- Level configuration by difficulty ---------- */
function levelConfig(level) {
  const maxColors = PALETTE.length - 1;
  const colors = Math.min(3 + Math.floor((level - 1) / 1.5), maxColors);
  const emptyTubes = 2; // two spares keep every generated level solvable
  return { colors, emptyTubes };
}

/* ---------- Game state ---------- */
const state = {
  level: 1,
  moves: 0,
  tubes: [],        // array of arrays; bottom = index 0
  history: [],      // stack of previous tube snapshots for undo
  selected: null,   // index of currently picked-up tube
  addUsed: false,   // extra tube power-up used this level?
  won: false,
};

/* ============================================================
   Level generation — random fill filtered by a real solver so
   every board handed to the player is provably solvable.
   ============================================================ */
function generateLevel(level) {
  const { colors, emptyTubes } = levelConfig(level);
  for (let attempt = 0; attempt < 60; attempt++) {
    const pool = [];
    for (let c = 1; c <= colors; c++) for (let i = 0; i < CAPACITY; i++) pool.push(c);
    shuffle(pool);

    const tubes = [];
    for (let c = 0; c < colors; c++) tubes.push(pool.slice(c * CAPACITY, c * CAPACITY + CAPACITY));
    for (let e = 0; e < emptyTubes; e++) tubes.push([]);

    if (isSolved(tubes)) continue;
    if (isSolvable(tubes)) return tubes;
  }
  const tubes = [];
  for (let c = 1; c <= colors; c++) tubes.push([c, c, c, c]);
  for (let e = 0; e < emptyTubes; e++) tubes.push([]);
  return tubes;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function legalMoves(tubes) {
  const res = [];
  for (let from = 0; from < tubes.length; from++) {
    for (let to = 0; to < tubes.length; to++) {
      if (from !== to && canPour(tubes, from, to)) res.push({ from, to });
    }
  }
  return res;
}

function isSolvable(start) {
  const seen = new Set();
  const stack = [start.map((t) => t.slice())];
  let expanded = 0;
  while (stack.length) {
    if (++expanded > 2_000_000) return false;
    const cur = stack.pop();
    if (isSolved(cur)) return true;
    const k = boardKey(cur);
    if (seen.has(k)) continue;
    seen.add(k);
    for (const mv of legalMoves(cur)) {
      const nx = cur.map((t) => t.slice());
      applyPour(nx, mv.from, mv.to);
      stack.push(nx);
    }
  }
  return false;
}
function boardKey(tubes) {
  return tubes.map((t) => t.join(",")).sort().join("|");
}

/* ---------- Pour rules ---------- */
function topColor(tube) { return tube.length ? tube[tube.length - 1] : 0; }
function topRun(tube) {
  if (!tube.length) return 0;
  const c = topColor(tube);
  let n = 0;
  for (let i = tube.length - 1; i >= 0 && tube[i] === c; i--) n++;
  return n;
}
function canPour(tubes, from, to) {
  const a = tubes[from], b = tubes[to];
  if (!a.length) return false;
  if (b.length >= CAPACITY) return false;
  if (from === to) return false;
  if (!b.length) {
    if (a.length === CAPACITY && topRun(a) === CAPACITY) return false;
    return true;
  }
  return topColor(a) === topColor(b);
}
function applyPour(tubes, from, to) {
  const a = tubes[from], b = tubes[to];
  const color = topColor(a);
  let amount = Math.min(topRun(a), CAPACITY - b.length);
  for (let i = 0; i < amount; i++) { a.pop(); b.push(color); }
  return amount;
}

function isTubeComplete(tube) { return tube.length === CAPACITY && topRun(tube) === CAPACITY; }
function isSolved(tubes) { return tubes.every((t) => t.length === 0 || isTubeComplete(t)); }

// Merge consecutive equal colors into {color, units} bands, bottom-first.
function bandsOf(tube) {
  const bands = [];
  for (const c of tube) {
    const last = bands[bands.length - 1];
    if (last && last.color === c) last.units += 1;
    else bands.push({ color: c, units: 1 });
  }
  return bands;
}

/* ============================================================
   Canvas engine
   ============================================================ */
const boardEl = document.getElementById("board");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const levelValueEl = document.getElementById("levelValue");
const movesValueEl = document.getElementById("movesValue");

let DPR = Math.min(window.devicePixelRatio || 1, 2.5);
let VIEW = { w: 0, h: 0 };
let LAYOUT = null;

// Per-tube animation data, kept in sync with tube count.
let dyn = [];
function syncDyn() {
  if (dyn.length === state.tubes.length) return;
  dyn = state.tubes.map((_, i) => dyn[i] || { lift: 0, wave: 0, phase: Math.random() * 6.28, completeAt: -1 });
}

// Active pour animation.
let pour = null; // { from, to, color, amount, fromPre, toPre, start, done }
const POUR_MS = 560;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = boardEl.clientWidth;
  const h = boardEl.clientHeight;
  VIEW = { w, h };
  canvas.width = Math.round(w * DPR);
  canvas.height = Math.round(h * DPR);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

// Compute tube geometry that fits the board area.
function computeLayout() {
  const n = state.tubes.length;
  const padX = 10;
  const gapX = Math.max(14, Math.min(26, VIEW.w * 0.05));
  const gapY = 30;

  // Balance the tubes across as few rows as possible (≤ maxPerRow each).
  const maxPerRow = VIEW.w < 520 ? 5 : 7;
  const rows = Math.max(1, Math.ceil(n / maxPerRow));
  const perRow = Math.ceil(n / rows);

  let tubeW = (VIEW.w - padX * 2 - gapX * (perRow - 1)) / perRow;
  tubeW = Math.max(38, Math.min(68, tubeW));

  let wall = Math.max(2.5, tubeW * 0.055);
  let unitH = tubeW * 0.78;
  let bottomExtra = tubeW * 0.10;        // glass below the liquid's rounded base
  let tubeH = unitH * CAPACITY + bottomExtra;
  let liftPx = unitH * 0.34;

  // Reserve headroom above the top row for the lift and the pour arc.
  const topPad = liftPx + tubeH * 0.32 + 6;
  const botPad = 8;
  const budget = VIEW.h - topPad - botPad;

  let usedH = rows * tubeH + (rows - 1) * gapY;
  if (usedH > budget && budget > 0) {
    const f = budget / usedH;
    unitH *= f; bottomExtra *= f; tubeH *= f; liftPx *= f;
    usedH = rows * tubeH + (rows - 1) * gapY;
  }

  const startY = topPad + Math.max(0, (budget - usedH) / 2);
  const rowH = tubeH + gapY;

  const rects = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, n - row * perRow);
    const rowW = inRow * tubeW + (inRow - 1) * gapX;
    const startX = (VIEW.w - rowW) / 2;
    const col = i - row * perRow;
    const x = startX + col * (tubeW + gapX);
    const y = startY + row * rowH;
    rects.push({ x, y, w: tubeW, h: tubeH, cx: x + tubeW / 2 });
  }

  LAYOUT = { tubeW, unitH, wall, bottomExtra, tubeH, rects, liftPx };
}

/* ---------- color helpers ---------- */
function rgb(hex) {
  const v = hex.replace("#", "");
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
function rgba(hex, a) { const c = rgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

/* ---------- tube path ---------- */
// A rounded-top, U-bottomed capsule outline.
function tubePath(x, y, w, h, topR, botR) {
  ctx.beginPath();
  ctx.moveTo(x, y + topR);
  ctx.quadraticCurveTo(x, y, x + topR, y);
  ctx.lineTo(x + w - topR, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + topR);
  ctx.lineTo(x + w, y + h - botR);
  ctx.quadraticCurveTo(x + w, y + h, x + w - botR, y + h);
  ctx.lineTo(x + botR, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - botR);
  ctx.closePath();
}

/* ---------- draw one tube ---------- */
function drawTube(idx, now) {
  const L = LAYOUT;
  const r = L.rects[idx];
  const d = dyn[idx];
  const lift = d.lift * L.liftPx;

  // Complete-pulse scale.
  let scale = 1;
  if (d.completeAt >= 0) {
    const t = (now - d.completeAt) / 460;
    if (t < 1) scale = 1 + Math.sin(Math.min(t, 1) * Math.PI) * 0.06;
    else d.completeAt = -1;
  }

  ctx.save();
  const cx = r.cx;
  const cy = r.y - lift + r.h / 2;
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  const x = r.x, y = r.y - lift, w = r.w, h = r.h;
  const topR = w * 0.16, botR = w * 0.5;
  const wall = L.wall;
  const inX = x + wall, inW = w - wall * 2;
  const inTop = y;                       // liquid may reach the open top
  const inBot = y + h - wall;            // inner floor
  const inBotR = inW * 0.5;

  // Soft drop shadow.
  ctx.save();
  ctx.filter = "blur(6px)";
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  tubePath(x + 2, y + 8, w, h, topR, botR);
  ctx.fill();
  ctx.restore();

  // Glass back plate.
  tubePath(x, y, w, h, topR, botR);
  const gb = ctx.createLinearGradient(x, y, x + w, y);
  gb.addColorStop(0, "rgba(255,255,255,0.10)");
  gb.addColorStop(0.5, "rgba(255,255,255,0.03)");
  gb.addColorStop(1, "rgba(255,255,255,0.08)");
  ctx.fillStyle = gb;
  ctx.fill();

  // ---- Liquid, clipped to the inner cavity ----
  const bands = displayBands(idx);
  if (bands.length) {
    ctx.save();
    innerPath(inX, inTop, inW, inBot, inBotR, topR - wall * 0.5);
    ctx.clip();
    drawLiquid(idx, bands, inX, inW, inBot, L.unitH, now, d);
    ctx.restore();
  }

  // ---- Glass front: rim, gloss, outline ----
  // Rim (open mouth) — an ellipse lip at the top.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + wall * 0.6, inW / 2, wall * 1.1, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.30)";
  ctx.lineWidth = Math.max(1, wall * 0.5);
  ctx.stroke();
  ctx.restore();

  // Vertical gloss streak.
  ctx.save();
  tubePath(x, y, w, h, topR, botR);
  ctx.clip();
  const gloss = ctx.createLinearGradient(x + w * 0.14, 0, x + w * 0.4, 0);
  gloss.addColorStop(0, "rgba(255,255,255,0.35)");
  gloss.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gloss;
  ctx.fillRect(x + w * 0.12, y + h * 0.05, w * 0.22, h * 0.9);
  // faint right edge sheen
  const gloss2 = ctx.createLinearGradient(x + w * 0.78, 0, x + w * 0.94, 0);
  gloss2.addColorStop(0, "rgba(255,255,255,0)");
  gloss2.addColorStop(1, "rgba(255,255,255,0.12)");
  ctx.fillStyle = gloss2;
  ctx.fillRect(x + w * 0.7, y + h * 0.05, w * 0.24, h * 0.9);
  ctx.restore();

  // Outline (brighter when selected).
  const selected = state.selected === idx;
  tubePath(x, y, w, h, topR, botR);
  ctx.lineWidth = selected ? 3 : 1.6;
  ctx.strokeStyle = selected ? "#67e8f9" : "rgba(255,255,255,0.32)";
  if (selected) { ctx.shadowColor = "rgba(103,232,249,0.8)"; ctx.shadowBlur = 16; }
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.restore();
}

// Inner cavity path (rounded bottom, gently rounded top corners).
function innerPath(x, top, w, bot, botR, topR) {
  const h = bot - top;
  tubePath(x, top, w, h, Math.max(2, topR), botR);
}

// The bands to draw for a tube right now, accounting for an active pour.
function displayBands(idx) {
  if (pour && pour.from === idx) {
    const p = pourProgress();
    const drop = easeOut(clamp(p / 0.55)) * pour.amount;
    const bands = pour.fromPre.map((b) => ({ ...b }));
    if (bands.length) bands[bands.length - 1].units = Math.max(0, bands[bands.length - 1].units - drop);
    return bands.filter((b) => b.units > 0.001);
  }
  if (pour && pour.to === idx) {
    const p = pourProgress();
    const rise = easeInOut(clamp((p - 0.28) / 0.72)) * pour.amount;
    const bands = pour.toPre.map((b) => ({ ...b }));
    if (rise > 0.001) {
      const last = bands[bands.length - 1];
      if (last && last.color === pour.color) last.units += rise;
      else bands.push({ color: pour.color, units: rise });
    }
    return bands;
  }
  return bandsOf(state.tubes[idx]);
}

// Draw stacked liquid bands with cylinder shading and a rippling surface.
function drawLiquid(idx, bands, inX, inW, inBot, unitH, now, d) {
  let total = 0;
  for (const b of bands) total += b.units;
  const surfaceY = inBot - total * unitH;

  // Fill each band as a vertical gradient rectangle (flat, up to surface).
  let yb = inBot;
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i];
    const yt = yb - band.units * unitH;
    const pal = PALETTE[band.color];
    const g = ctx.createLinearGradient(0, yt, 0, yb);
    g.addColorStop(0, pal.l);
    g.addColorStop(0.35, pal.b);
    g.addColorStop(1, pal.d);
    ctx.fillStyle = g;
    ctx.fillRect(inX - 1, yt, inW + 2, band.units * unitH + 1.5);
    // subtle seam highlight between bands
    if (i < bands.length - 1) {
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(inX - 1, yt, inW + 2, 1.2);
    }
    yb = yt;
  }

  // Rippling surface on the topmost band.
  const topBand = bands[bands.length - 1];
  const pal = PALETTE[topBand.color];
  const idle = 1.1;
  const amp = idle + d.wave;
  const t = now / 1000;
  const k1 = (Math.PI * 2 * 1.25) / inW;
  const k2 = (Math.PI * 2 * 2.1) / inW;
  const crest = (x) =>
    Math.sin(x * k1 + t * 2.4 + d.phase) * amp +
    Math.sin(x * k2 - t * 3.1 + d.phase) * amp * 0.45;

  const step = Math.max(3, inW / 12);
  // Meniscus fill (a lighter lip that follows the wave).
  ctx.beginPath();
  ctx.moveTo(inX, surfaceY + 6);
  for (let x = 0; x <= inW; x += step) ctx.lineTo(inX + x, surfaceY + crest(x));
  ctx.lineTo(inX + inW, surfaceY + 6);
  ctx.closePath();
  const mg = ctx.createLinearGradient(0, surfaceY - amp - 4, 0, surfaceY + 8);
  mg.addColorStop(0, pal.l);
  mg.addColorStop(1, pal.b);
  ctx.fillStyle = mg;
  ctx.fill();

  // Glossy surface line.
  ctx.beginPath();
  for (let x = 0; x <= inW; x += step) {
    const px = inX + x, py = surfaceY + crest(x) - 1;
    if (x === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Cylinder shading: darken the sides, add a soft central gloss —
  // restricted to the liquid region so the empty tube above stays clear.
  ctx.save();
  ctx.beginPath();
  ctx.rect(inX - 1, surfaceY - amp - 2, inW + 2, inBot - surfaceY + amp + 4);
  ctx.clip();
  const shade = ctx.createLinearGradient(inX, 0, inX + inW, 0);
  shade.addColorStop(0, "rgba(0,0,0,0.30)");
  shade.addColorStop(0.18, "rgba(0,0,0,0.05)");
  shade.addColorStop(0.34, "rgba(255,255,255,0.16)");
  shade.addColorStop(0.5, "rgba(255,255,255,0.02)");
  shade.addColorStop(0.82, "rgba(0,0,0,0.10)");
  shade.addColorStop(1, "rgba(0,0,0,0.34)");
  ctx.fillStyle = shade;
  ctx.fillRect(inX - 1, surfaceY - amp - 2, inW + 2, inBot - surfaceY + amp + 6);
  ctx.restore();
}

/* ---------- pour stream + splash ---------- */
function drawPour(now) {
  if (!pour) return;
  const p = pourProgress();
  const L = LAYOUT;
  const from = L.rects[pour.from];
  const to = L.rects[pour.to];
  const dFrom = dyn[pour.from], dTo = dyn[pour.to];

  const sx = from.cx;
  const sy = from.y - dFrom.lift * L.liftPx + L.wall * 0.6; // spout at the mouth
  const tx = to.cx;
  const ty = to.y - dTo.lift * L.liftPx + L.wall * 0.6;

  // Arc apex a bit above the higher mouth.
  const apexY = Math.min(sy, ty) - L.tubeH * 0.28;
  const mx = (sx + tx) / 2;
  const pal = PALETTE[pour.color];

  // Stream is "in flight" for the middle of the animation.
  const streamA = clamp((p - 0.06) / 0.16);          // fade in
  const streamB = 1 - clamp((p - 0.86) / 0.14);       // fade out
  const alpha = Math.min(streamA, streamB);
  if (alpha > 0.01) {
    // Draw the arc as a tapered ribbon by stroking a bezier twice.
    ctx.save();
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(mx, apexY, tx, ty);
    const wStream = Math.max(4, L.tubeW * 0.16);
    ctx.strokeStyle = rgba(pal.b, 0.92 * alpha);
    ctx.lineWidth = wStream;
    ctx.stroke();
    // bright core
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(mx, apexY, tx, ty);
    ctx.strokeStyle = rgba(pal.l, 0.9 * alpha);
    ctx.lineWidth = wStream * 0.42;
    ctx.stroke();
    ctx.restore();

    // A couple of falling droplets travelling along the arc.
    for (let i = 0; i < 3; i++) {
      const u = ((now / 260) + i / 3) % 1;
      const bx = bez(sx, mx, tx, u);
      const by = bez(sy, apexY, ty, u);
      ctx.beginPath();
      ctx.arc(bx, by, wStream * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = rgba(pal.l, 0.8 * alpha);
      ctx.fill();
    }
  }

  // Splash ripples at the destination surface while it fills.
  if (p > 0.3 && p < 0.98) {
    const toBands = displayBands(pour.to);
    let total = 0; for (const b of toBands) total += b.units;
    const inBot = to.y - dTo.lift * L.liftPx + to.h - L.wall;
    const surfaceY = inBot - total * L.unitH;
    const inW = to.w - L.wall * 2;
    const rp = (p - 0.3) / 0.68;
    for (let i = 0; i < 2; i++) {
      const rr = ((rp * 1.4 + i * 0.5) % 1);
      ctx.beginPath();
      ctx.ellipse(tx, surfaceY, (inW * 0.5) * rr, 4 * rr, 0, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(pal.l, (1 - rr) * 0.5);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
}

function bez(a, b, c, t) { const u = 1 - t; return u * u * a + 2 * u * t * b + t * t * c; }
function pourProgress() { return pour ? clamp((performance.now() - pour.start) / POUR_MS) : 0; }

/* ---------- easing ---------- */
function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function easeOut(t) { return 1 - Math.pow(1 - t, 2.2); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

/* ============================================================
   Main loop
   ============================================================ */
function frame(now) {
  syncDyn();
  computeLayout();

  // Advance per-tube animation.
  for (let i = 0; i < dyn.length; i++) {
    const d = dyn[i];
    const target = state.selected === i ? 1 : 0;
    d.lift += (target - d.lift) * 0.28;
    d.wave *= 0.94; // slosh decays back to the idle ripple
  }

  // Finalize a completed pour.
  if (pour && !pour.done && pourProgress() >= 1) finalizePour(now);

  ctx.clearRect(0, 0, VIEW.w, VIEW.h);
  for (let i = 0; i < state.tubes.length; i++) drawTube(i, now);
  drawPour(now);

  requestAnimationFrame(frame);
}

/* ============================================================
   Interaction
   ============================================================ */
function pointerToTube(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const L = LAYOUT;
  for (let i = 0; i < L.rects.length; i++) {
    const r = L.rects[i];
    const lift = dyn[i] ? dyn[i].lift * L.liftPx : 0;
    if (px >= r.x && px <= r.x + r.w && py >= r.y - lift && py <= r.y - lift + r.h) return i;
  }
  return null;
}

function onTubeClick(idx) {
  if (state.won || pour || idx == null) return;

  if (state.selected === null) {
    if (state.tubes[idx].length === 0) return;
    state.selected = idx;
    return;
  }
  if (state.selected === idx) { state.selected = null; return; }

  const from = state.selected;
  const to = idx;
  if (canPour(state.tubes, from, to)) {
    const color = topColor(state.tubes[from]);
    const amount = Math.min(topRun(state.tubes[from]), CAPACITY - state.tubes[to].length);
    const fromPre = bandsOf(state.tubes[from]);
    const toPre = bandsOf(state.tubes[to]);

    pushHistory();
    applyPour(state.tubes, from, to);
    state.moves++;
    state.selected = null;
    updateHud();

    pour = { from, to, color, amount, fromPre, toPre, start: performance.now(), done: false };
    dyn[from].wave = 3.5;
  } else {
    state.selected = state.tubes[to].length ? to : null;
  }
}

function finalizePour(now) {
  pour.done = true;
  const to = pour.to, from = pour.from;
  pour = null;
  dyn[to].wave = 5.5; // splash settle
  if (isTubeComplete(state.tubes[to])) markComplete(to, now);
  if (isTubeComplete(state.tubes[from])) markComplete(from, now);
  if (isSolved(state.tubes)) onWin();
}
function markComplete(idx, now) { dyn[idx].completeAt = now || performance.now(); }

canvas.addEventListener("click", (e) => onTubeClick(pointerToTube(e.clientX, e.clientY)));

/* ============================================================
   Controls
   ============================================================ */
function pushHistory() {
  state.history.push({ tubes: state.tubes.map((t) => t.slice()), moves: state.moves });
  if (state.history.length > 300) state.history.shift();
}

function undo() {
  if (!state.history.length || state.won || pour) return;
  const prev = state.history.pop();
  state.tubes = prev.tubes;
  state.moves = prev.moves;
  state.selected = null;
  syncDyn();
  updateHud();
}
function restart() {
  if (state.won || pour || !state.history.length) return;
  const first = state.history[0];
  state.tubes = first.tubes.map((t) => t.slice());
  state.moves = 0;
  state.history = [];
  state.selected = null;
  syncDyn();
  updateHud();
}
function addTube() {
  if (state.addUsed || state.won || pour) return;
  pushHistory();
  state.tubes.push([]);
  state.addUsed = true;
  state.selected = null;
  dyn.push({ lift: 0, wave: 0, phase: Math.random() * 6.28, completeAt: -1 });
  updateHud();
}
function newLevel(advance) {
  if (advance) state.level++;
  loadLevel(state.level);
}
function loadLevel(level) {
  state.level = level;
  state.tubes = generateLevel(level);
  state.moves = 0;
  state.history = [];
  state.selected = null;
  state.addUsed = false;
  state.won = false;
  pour = null;
  dyn = [];
  syncDyn();
  hideWin();
  updateHud();
}

function updateHud() {
  levelValueEl.textContent = String(state.level);
  movesValueEl.textContent = String(state.moves);
  document.getElementById("addTubeBtn").disabled = state.addUsed || state.won;
  document.getElementById("undoBtn").disabled = state.history.length === 0 || state.won;
}

/* ---------- Win overlay ---------- */
const overlay = document.getElementById("winOverlay");
function onWin() {
  state.won = true;
  state.selected = null;
  updateHud();
  document.getElementById("winSub").innerHTML =
    `レベル <b>${state.level}</b> を <b>${state.moves}</b> 手でクリアしました。`;
  setTimeout(() => overlay.classList.remove("hidden"), 520);
  saveProgress();
}
function hideWin() { overlay.classList.add("hidden"); }

/* ---------- Persistence ---------- */
function saveProgress() {
  try { localStorage.setItem("waterpuzzle.level", String(state.level + 1)); } catch (_) {}
}
function loadProgress() {
  try {
    const v = parseInt(localStorage.getItem("waterpuzzle.level") || "1", 10);
    return Number.isFinite(v) && v > 0 ? v : 1;
  } catch (_) { return 1; }
}

/* ============================================================
   Wire up
   ============================================================ */
document.getElementById("undoBtn").addEventListener("click", undo);
document.getElementById("restartBtn").addEventListener("click", restart);
document.getElementById("addTubeBtn").addEventListener("click", addTube);
document.getElementById("newBtn").addEventListener("click", () => newLevel(false));
document.getElementById("nextLevelBtn").addEventListener("click", () => newLevel(true));

document.addEventListener("keydown", (e) => {
  if (e.key === "u" || e.key === "U") undo();
  else if (e.key === "r" || e.key === "R") restart();
  else if (e.key === "n" || e.key === "N") newLevel(true);
});

window.addEventListener("resize", resize);

// Minimal hook for automated testing / debugging.
window.WaterPuzzle = {
  state,
  layout: () => LAYOUT,
  click: onTubeClick,
  pouring: () => !!pour,
  legalMoves, applyPour, isSolved, boardKey,
};

resize();
loadLevel(loadProgress());
requestAnimationFrame(frame);
