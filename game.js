/* ============================================================
   Water Puzzle  —  a premium "Magic Sort!"-style sorting game
   Canvas liquid with tilt-to-pour physics, rippling surfaces,
   rising bubbles, gooey pour streams, splash, hints, a star
   rating and confetti. Pure vanilla JS. No dependencies.
   ============================================================ */

const CAPACITY = 4;

// Each color carries a light/base/dark triad for cylinder shading.
const PALETTE = [
  null,
  { l: "#ff8f8f", b: "#f2504b", d: "#a81f1f" }, // red
  { l: "#78b6ff", b: "#3b82f6", d: "#1849b8" }, // blue
  { l: "#79e6a2", b: "#22c55e", d: "#118a3f" }, // green
  { l: "#ffd95e", b: "#f2b307", d: "#a5760a" }, // yellow
  { l: "#d29bff", b: "#a855f7", d: "#7321c0" }, // purple
  { l: "#ffb066", b: "#f97316", d: "#bd4a07" }, // orange
  { l: "#ffa6d0", b: "#ec4899", d: "#b31f6a" }, // pink
  { l: "#5fe8d5", b: "#14b8a6", d: "#0a7b6f" }, // teal
  { l: "#c6f36e", b: "#84cc16", d: "#54860b" }, // lime
  { l: "#bcacf9", b: "#8b5cf6", d: "#5b2fc0" }, // violet
  { l: "#6fecfb", b: "#06b6d4", d: "#0a7f96" }, // cyan
  { l: "#ffa7b6", b: "#f43f5e", d: "#b41436" }, // rose
];

function levelConfig(level) {
  const maxColors = PALETTE.length - 1;
  const colors = Math.min(3 + Math.floor((level - 1) / 1.5), maxColors);
  return { colors, emptyTubes: 2 };
}

const state = {
  level: 1,
  moves: 0,
  optimal: null,
  tubes: [],
  history: [],
  selected: null,
  addUsed: false,
  won: false,
  hint: null, // {from,to,until}
};

/* ============================================================
   Logic: generation, solver, pour rules
   ============================================================ */
function generateLevel(level) {
  const { colors, emptyTubes } = levelConfig(level);
  for (let attempt = 0; attempt < 80; attempt++) {
    const pool = [];
    for (let c = 1; c <= colors; c++) for (let i = 0; i < CAPACITY; i++) pool.push(c);
    shuffle(pool);
    const tubes = [];
    for (let c = 0; c < colors; c++) tubes.push(pool.slice(c * CAPACITY, c * CAPACITY + CAPACITY));
    for (let e = 0; e < emptyTubes; e++) tubes.push([]);
    if (isSolved(tubes)) continue;
    if (!isSolvable(tubes)) continue;                       // fast DFS acceptance
    return tubes;
  }
  const tubes = [];
  for (let c = 1; c <= colors; c++) tubes.push([c, c, c, c]);
  for (let e = 0; e < emptyTubes; e++) tubes.push([]);
  return tubes;
}

// Fast depth-first solvability check (bounded).
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

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function legalMoves(tubes) {
  const res = [];
  for (let from = 0; from < tubes.length; from++)
    for (let to = 0; to < tubes.length; to++)
      if (from !== to && canPour(tubes, from, to)) res.push({ from, to });
  return res;
}

// Breadth-first shortest solution. Returns the move list, or null.
function solvePath(start, cap = 300000) {
  const startKey = boardKey(start);
  if (isSolved(start)) return [];
  const seen = new Set([startKey]);
  const queue = [start.map((t) => t.slice())];
  const parent = new Map(); // key -> {pkey, move}
  parent.set(startKey, null);
  let head = 0, expanded = 0;
  while (head < queue.length) {
    if (++expanded > cap) return null;
    const cur = queue[head++];
    const curKey = boardKey(cur);
    for (const mv of legalMoves(cur)) {
      const nx = cur.map((t) => t.slice());
      applyPour(nx, mv.from, mv.to);
      const k = boardKey(nx);
      if (seen.has(k)) continue;
      seen.add(k);
      parent.set(k, { pkey: curKey, move: mv });
      if (isSolved(nx)) {
        const path = [];
        let key = k;
        while (parent.get(key)) { const p = parent.get(key); path.push(p.move); key = p.pkey; }
        return path.reverse();
      }
      queue.push(nx);
    }
  }
  return null;
}
function boardKey(tubes) { return tubes.map((t) => t.join(",")).sort().join("|"); }

function topColor(t) { return t.length ? t[t.length - 1] : 0; }
function topRun(t) {
  if (!t.length) return 0;
  const c = topColor(t); let n = 0;
  for (let i = t.length - 1; i >= 0 && t[i] === c; i--) n++;
  return n;
}
function canPour(tubes, from, to) {
  const a = tubes[from], b = tubes[to];
  if (!a.length || b.length >= CAPACITY || from === to) return false;
  if (!b.length) return !(a.length === CAPACITY && topRun(a) === CAPACITY);
  return topColor(a) === topColor(b);
}
function applyPour(tubes, from, to) {
  const a = tubes[from], b = tubes[to];
  const color = topColor(a);
  let amount = Math.min(topRun(a), CAPACITY - b.length);
  for (let i = 0; i < amount; i++) { a.pop(); b.push(color); }
  return amount;
}
function isTubeComplete(t) { return t.length === CAPACITY && topRun(t) === CAPACITY; }
function isSolved(tubes) { return tubes.every((t) => t.length === 0 || isTubeComplete(t)); }

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

let DPR = 1, VIEW = { w: 0, h: 0 }, LAYOUT = null;
let dyn = [];

const POUR_MS = 780;
const MAX_TILT = 0.92; // radians

let pour = null; // { from,to,color,amount,fromPre,toPre,start,done }

function syncDyn() {
  if (dyn.length === state.tubes.length) return;
  const next = [];
  for (let i = 0; i < state.tubes.length; i++) next[i] = dyn[i] || newDyn(i);
  dyn = next;
}
function newDyn(i) {
  const bubbles = [];
  const n = 3 + (i % 3);
  for (let k = 0; k < n; k++) bubbles.push({ x: Math.random(), r: 0.5 + Math.random(), sp: 0.15 + Math.random() * 0.25, ph: Math.random() });
  return { lift: 0, wave: 0, phase: Math.random() * 6.28, completeAt: -1, bubbles };
}

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = boardEl.clientWidth, h = boardEl.clientHeight;
  VIEW = { w, h };
  canvas.width = Math.round(w * DPR);
  canvas.height = Math.round(h * DPR);
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

function computeLayout() {
  const n = state.tubes.length;
  const padX = 10;
  const gapX = Math.max(14, Math.min(28, VIEW.w * 0.05));
  const gapY = 34;

  const maxPerRow = VIEW.w < 520 ? 5 : 7;
  const rows = Math.max(1, Math.ceil(n / maxPerRow));
  const perRow = Math.ceil(n / rows);

  let tubeW = (VIEW.w - padX * 2 - gapX * (perRow - 1)) / perRow;
  tubeW = Math.max(38, Math.min(70, tubeW));

  let wall = Math.max(2.5, tubeW * 0.05);
  let unitH = tubeW * 0.80;
  let bottomExtra = tubeW * 0.09;
  let tubeH = unitH * CAPACITY + bottomExtra;
  let liftPx = unitH * 0.34;

  const topPad = liftPx + tubeH * 0.34 + 8;
  const botPad = 10;
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
    rects.push({ x, y, w: tubeW, h: tubeH, cx: x + tubeW / 2, cy: y + tubeH / 2 });
  }
  LAYOUT = { tubeW, unitH, wall, bottomExtra, tubeH, rects, liftPx };
}

/* ---------- color helpers ---------- */
function rgb(hex) { const v = hex.replace("#", ""); return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]; }
function rgba(hex, a) { const c = rgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

/* ---------- geometry paths ---------- */
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

/* ---------- per-tube transform ---------- */
// Returns {offX,offY,angle,scale,pivotX,pivotY}. Source tube tilts & lifts
// toward its target during a pour; others just lift/pulse.
function tubeXf(idx, now) {
  const L = LAYOUT, r = L.rects[idx], d = dyn[idx];
  let scale = 1;
  if (d.completeAt >= 0) {
    const t = (now - d.completeAt) / 460;
    if (t < 1) scale = 1 + Math.sin(t * Math.PI) * 0.07; else d.completeAt = -1;
  }
  if (pour && pour.from === idx) {
    const p = pourProgress();
    const ta = tiltAmt(p);
    const to = L.rects[pour.to];
    const dir = to.cx >= r.cx ? 1 : -1;
    const pourCx = to.cx - dir * (to.w * 0.60);
    const pourCy = to.y - r.h * 0.02 + r.h * 0.5;
    return {
      offX: (pourCx - r.cx) * ta,
      offY: (pourCy - r.cy) * ta - d.lift * L.liftPx * (1 - ta),
      angle: dir * MAX_TILT * ta,
      scale, pivotX: r.cx, pivotY: r.cy, dir,
    };
  }
  return { offX: 0, offY: -d.lift * L.liftPx, angle: 0, scale, pivotX: r.cx, pivotY: r.cy, dir: 1 };
}
function tiltAmt(p) {
  if (p < 0.2) return easeOut(p / 0.2);
  if (p > 0.82) return easeOut(Math.max(0, (1 - p) / 0.18));
  return 1;
}
// Apply the same transform to a local point (for lip position).
function xfPoint(px, py, xf) {
  const dx = px - xf.pivotX, dy = py - xf.pivotY;
  const c = Math.cos(xf.angle), s = Math.sin(xf.angle);
  return {
    x: xf.pivotX + (dx * c - dy * s) * xf.scale + xf.offX,
    y: xf.pivotY + (dx * s + dy * c) * xf.scale + xf.offY,
  };
}

/* ---------- draw one tube ---------- */
function drawTube(idx, now) {
  const L = LAYOUT, r = L.rects[idx];
  const xf = tubeXf(idx, now);

  ctx.save();
  ctx.translate(xf.offX, xf.offY);
  ctx.translate(xf.pivotX, xf.pivotY);
  ctx.rotate(xf.angle);
  ctx.scale(xf.scale, xf.scale);
  ctx.translate(-xf.pivotX, -xf.pivotY);

  const x = r.x, y = r.y, w = r.w, h = r.h;
  const topR = w * 0.16, botR = w * 0.5, wall = L.wall;
  const inX = x + wall, inW = w - wall * 2;
  const inTop = y, inBot = y + h - wall, inBotR = inW * 0.5;

  // drop shadow
  ctx.save();
  ctx.filter = "blur(6px)";
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  tubePath(x + 2, y + 9, w, h, topR, botR);
  ctx.fill();
  ctx.restore();

  // glass back
  tubePath(x, y, w, h, topR, botR);
  const gb = ctx.createLinearGradient(x, y, x + w, y);
  gb.addColorStop(0, "rgba(255,255,255,0.12)");
  gb.addColorStop(0.5, "rgba(255,255,255,0.03)");
  gb.addColorStop(1, "rgba(255,255,255,0.09)");
  ctx.fillStyle = gb;
  ctx.fill();

  // liquid
  const bands = displayBands(idx);
  if (bands.length) {
    ctx.save();
    tubePath(inX, inTop, inW, inBot - inTop, Math.max(2, topR - wall * 0.5), inBotR);
    ctx.clip();
    drawLiquid(idx, bands, inX, inW, inBot, L.unitH, now, dyn[idx]);
    ctx.restore();
  }

  drawGlassFront(idx, x, y, w, h, topR, botR, wall, inW, now);
  ctx.restore();
}

function drawGlassFront(idx, x, y, w, h, topR, botR, wall, inW, now) {
  // rim ellipse
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + wall * 0.6, inW / 2, wall * 1.05, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.34)";
  ctx.lineWidth = Math.max(1, wall * 0.5);
  ctx.stroke();
  ctx.restore();

  // gloss streaks
  ctx.save();
  tubePath(x, y, w, h, topR, botR);
  ctx.clip();
  let g = ctx.createLinearGradient(x + w * 0.12, 0, x + w * 0.42, 0);
  g.addColorStop(0, "rgba(255,255,255,0.42)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x + w * 0.1, y + h * 0.04, w * 0.24, h * 0.92);
  g = ctx.createLinearGradient(x + w * 0.78, 0, x + w * 0.95, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(255,255,255,0.16)");
  ctx.fillStyle = g;
  ctx.fillRect(x + w * 0.7, y + h * 0.04, w * 0.25, h * 0.92);
  ctx.restore();

  // outline + selection / hint rings
  const selected = state.selected === idx;
  const hinted = state.hint && (state.hint.from === idx || state.hint.to === idx) && now < state.hint.until;
  tubePath(x, y, w, h, topR, botR);
  if (selected) { ctx.strokeStyle = "#5fe6ff"; ctx.lineWidth = 3; ctx.shadowColor = "rgba(95,230,255,0.85)"; ctx.shadowBlur = 16; }
  else if (hinted) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 140);
    ctx.strokeStyle = state.hint.from === idx ? "#ffd34e" : "#8affc0";
    ctx.lineWidth = 3; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 10 + pulse * 14;
  } else { ctx.strokeStyle = "rgba(255,255,255,0.34)"; ctx.lineWidth = 1.6; }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// bands to draw, accounting for an active pour
function displayBands(idx) {
  if (pour && pour.from === idx) {
    const p = pourProgress();
    const drop = easeOut(clamp((p - 0.22) / 0.5)) * pour.amount;
    const bands = pour.fromPre.map((b) => ({ ...b }));
    if (bands.length) bands[bands.length - 1].units = Math.max(0, bands[bands.length - 1].units - drop);
    return bands.filter((b) => b.units > 0.001);
  }
  if (pour && pour.to === idx) {
    const p = pourProgress();
    const rise = easeInOut(clamp((p - 0.30) / 0.5)) * pour.amount;
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

function drawLiquid(idx, bands, inX, inW, inBot, unitH, now, d) {
  let total = 0; for (const b of bands) total += b.units;
  const surfaceY = inBot - total * unitH;

  // bands (bottom-first)
  let yb = inBot;
  for (let i = 0; i < bands.length; i++) {
    const band = bands[i], yt = yb - band.units * unitH, pal = PALETTE[band.color];
    const g = ctx.createLinearGradient(0, yt, 0, yb);
    g.addColorStop(0, pal.l); g.addColorStop(0.34, pal.b); g.addColorStop(1, pal.d);
    ctx.fillStyle = g;
    ctx.fillRect(inX - 1, yt, inW + 2, band.units * unitH + 1.5);
    if (i < bands.length - 1) { ctx.fillStyle = "rgba(255,255,255,0.10)"; ctx.fillRect(inX - 1, yt, inW + 2, 1.2); }
    yb = yt;
  }

  // rising bubbles inside the liquid
  const topBand = bands[bands.length - 1], pal = PALETTE[topBand.color];
  const t = now / 1000;
  for (const bub of d.bubbles) {
    const range = inBot - surfaceY - 6;
    if (range <= 4) continue;
    const prog = (t * bub.sp + bub.ph) % 1;
    const by = inBot - 3 - prog * range;
    const bx = inX + 4 + bub.x * (inW - 8);
    const br = bub.r * (unitH * 0.05);
    const fade = Math.sin(prog * Math.PI);
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.28 * fade})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // rippling surface
  const idle = 1.1, amp = idle + d.wave;
  const k1 = (Math.PI * 2 * 1.25) / inW, k2 = (Math.PI * 2 * 2.1) / inW;
  const crest = (x) => Math.sin(x * k1 + t * 2.4 + d.phase) * amp + Math.sin(x * k2 - t * 3.1 + d.phase) * amp * 0.45;
  const step = Math.max(3, inW / 14);

  ctx.beginPath();
  ctx.moveTo(inX, surfaceY + 6);
  for (let x = 0; x <= inW; x += step) ctx.lineTo(inX + x, surfaceY + crest(x));
  ctx.lineTo(inX + inW, surfaceY + 6);
  ctx.closePath();
  const mg = ctx.createLinearGradient(0, surfaceY - amp - 4, 0, surfaceY + 8);
  mg.addColorStop(0, pal.l); mg.addColorStop(1, pal.b);
  ctx.fillStyle = mg; ctx.fill();

  ctx.beginPath();
  for (let x = 0; x <= inW; x += step) {
    const px = inX + x, py = surfaceY + crest(x) - 1;
    if (x === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1.6; ctx.stroke();

  // cylinder shading, limited to the liquid region
  ctx.save();
  ctx.beginPath();
  ctx.rect(inX - 1, surfaceY - amp - 2, inW + 2, inBot - surfaceY + amp + 6);
  ctx.clip();
  const sh = ctx.createLinearGradient(inX, 0, inX + inW, 0);
  sh.addColorStop(0, "rgba(0,0,0,0.30)");
  sh.addColorStop(0.16, "rgba(0,0,0,0.05)");
  sh.addColorStop(0.32, "rgba(255,255,255,0.18)");
  sh.addColorStop(0.5, "rgba(255,255,255,0.02)");
  sh.addColorStop(0.82, "rgba(0,0,0,0.10)");
  sh.addColorStop(1, "rgba(0,0,0,0.34)");
  ctx.fillStyle = sh;
  ctx.fillRect(inX - 1, surfaceY - amp - 2, inW + 2, inBot - surfaceY + amp + 8);
  ctx.restore();
}

/* ---------- pour stream + splash ---------- */
function drawPour(now) {
  if (!pour) return;
  const p = pourProgress(), L = LAYOUT;
  const from = L.rects[pour.from], to = L.rects[pour.to];
  const xf = tubeXf(pour.from, now);
  const dir = xf.dir;
  const pal = PALETTE[pour.color];

  // spout = the low lip corner of the tilted source
  const lipLocalX = dir > 0 ? from.x + from.w * 0.9 : from.x + from.w * 0.1;
  const lip = xfPoint(lipLocalX, from.y + from.w * 0.06, xf);

  // destination surface point
  const toBands = displayBands(pour.to);
  let tot = 0; for (const b of toBands) tot += b.units;
  const inBot = to.y + to.h - L.wall;
  const surfaceY = inBot - tot * L.unitH;
  const tx = to.cx, ty = surfaceY;

  const alpha = Math.min(clamp((p - 0.2) / 0.08), clamp((0.84 - p) / 0.08));
  if (alpha > 0.01) {
    const mx = (lip.x + tx) / 2 + dir * 6;
    const apexY = Math.min(lip.y, ty) - 8;
    // gooey ribbon
    ctx.save();
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lip.x, lip.y);
    ctx.quadraticCurveTo(mx, apexY, tx, ty);
    const wS = Math.max(4, L.tubeW * 0.15);
    ctx.strokeStyle = rgba(pal.b, 0.95 * alpha); ctx.lineWidth = wS; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(lip.x, lip.y);
    ctx.quadraticCurveTo(mx, apexY, tx, ty);
    ctx.strokeStyle = rgba(pal.l, 0.9 * alpha); ctx.lineWidth = wS * 0.4; ctx.stroke();
    ctx.restore();
    // leading droplet
    for (let i = 0; i < 2; i++) {
      const u = ((now / 240) + i / 2) % 1;
      const bx = bez(lip.x, mx, tx, u), by = bez(lip.y, apexY, ty, u);
      ctx.beginPath(); ctx.arc(bx, by, wS * 0.24, 0, Math.PI * 2);
      ctx.fillStyle = rgba(pal.l, 0.85 * alpha); ctx.fill();
    }
  }

  // splash ripples at destination
  if (p > 0.34 && p < 0.98) {
    const inW = to.w - L.wall * 2, rp = (p - 0.34) / 0.64;
    for (let i = 0; i < 2; i++) {
      const rr = (rp * 1.5 + i * 0.5) % 1;
      ctx.beginPath();
      ctx.ellipse(tx, ty, inW * 0.5 * rr, 4 * rr, 0, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(pal.l, (1 - rr) * 0.5); ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
}
function bez(a, b, c, t) { const u = 1 - t; return u * u * a + 2 * u * t * b + t * t * c; }
let FREEZE = null; // debug: pin pour progress for screenshots
function pourProgress() { if (FREEZE != null) return FREEZE; return pour ? clamp((performance.now() - pour.start) / POUR_MS) : 0; }

function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function easeOut(t) { return 1 - Math.pow(1 - t, 2.2); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

/* ============================================================
   Main loop — source tube drawn last so its lip overlaps.
   ============================================================ */
function frame(now) {
  // Self-heal: if the board's measured size ever differs from what the
  // canvas was sized for (first paint before layout settled, web-font
  // reflow, window/orientation change, no resize event fired), re-sync.
  if (boardEl.clientWidth !== VIEW.w || boardEl.clientHeight !== VIEW.h) resize();
  if (VIEW.w < 4 || VIEW.h < 4) { requestAnimationFrame(frame); return; }
  syncDyn();
  computeLayout();
  for (let i = 0; i < dyn.length; i++) {
    const d = dyn[i];
    d.lift += ((state.selected === i ? 1 : 0) - d.lift) * 0.3;
    d.wave *= 0.94;
  }
  if (pour && !pour.done && FREEZE == null && pourProgress() >= 1) finalizePour(now);

  ctx.clearRect(0, 0, VIEW.w, VIEW.h);
  for (let i = 0; i < state.tubes.length; i++) if (!(pour && pour.from === i)) drawTube(i, now);
  drawPour(now);
  if (pour) drawTube(pour.from, now); // tilted source on top
  requestAnimationFrame(frame);
}

/* ============================================================
   Interaction
   ============================================================ */
function pointerToTube(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const px = clientX - rect.left, py = clientY - rect.top, L = LAYOUT;
  for (let i = 0; i < L.rects.length; i++) {
    const r = L.rects[i], lift = dyn[i] ? dyn[i].lift * L.liftPx : 0;
    if (px >= r.x && px <= r.x + r.w && py >= r.y - lift && py <= r.y - lift + r.h) return i;
  }
  return null;
}

function onTubeClick(idx) {
  if (state.won || pour || idx == null) return;
  state.hint = null;
  if (state.selected === null) {
    if (state.tubes[idx].length === 0) return;
    state.selected = idx; sfx("pick"); return;
  }
  if (state.selected === idx) { state.selected = null; return; }

  const from = state.selected, to = idx;
  if (canPour(state.tubes, from, to)) {
    const color = topColor(state.tubes[from]);
    const amount = Math.min(topRun(state.tubes[from]), CAPACITY - state.tubes[to].length);
    const fromPre = bandsOf(state.tubes[from]), toPre = bandsOf(state.tubes[to]);
    pushHistory();
    applyPour(state.tubes, from, to);
    state.moves++; state.selected = null;
    updateHud();
    pour = { from, to, color, amount, fromPre, toPre, start: performance.now(), done: false };
    dyn[from].wave = 3;
    sfx("pour");
  } else {
    state.selected = state.tubes[to].length ? to : null;
  }
}

function finalizePour(now) {
  pour.done = true;
  const to = pour.to, from = pour.from;
  pour = null;
  dyn[to].wave = 6;
  let completed = false;
  if (isTubeComplete(state.tubes[to])) { dyn[to].completeAt = now; completed = true; }
  if (isTubeComplete(state.tubes[from])) { dyn[from].completeAt = now; completed = true; }
  if (completed) sfx("complete");
  if (isSolved(state.tubes)) onWin();
}

canvas.addEventListener("click", (e) => { audioResume(); onTubeClick(pointerToTube(e.clientX, e.clientY)); });

/* ============================================================
   Controls
   ============================================================ */
function pushHistory() {
  state.history.push({ tubes: state.tubes.map((t) => t.slice()), moves: state.moves });
  if (state.history.length > 400) state.history.shift();
}
function undo() {
  if (!state.history.length || state.won || pour) return;
  const prev = state.history.pop();
  state.tubes = prev.tubes; state.moves = prev.moves;
  state.selected = null; state.hint = null;
  syncDyn(); updateHud(); sfx("pick");
}
function restart() {
  if (state.won || pour || !state.history.length) return;
  state.tubes = state.history[0].tubes.map((t) => t.slice());
  state.moves = 0; state.history = []; state.selected = null; state.hint = null;
  syncDyn(); updateHud();
}
function addTube() {
  if (state.addUsed || state.won || pour) return;
  pushHistory();
  state.tubes.push([]);
  state.addUsed = true; state.selected = null;
  dyn.push(newDyn(state.tubes.length - 1));
  updateHud();
}
function hint() {
  if (state.won || pour) return;
  const path = solvePath(state.tubes, 300000);
  if (path && path.length) {
    const mv = path[0];
    state.hint = { from: mv.from, to: mv.to, until: performance.now() + 2200 };
    state.selected = null;
  } else {
    // no solution from here — nudge the player to undo
    flashButton("undoBtn");
  }
}
function flashButton(id) {
  const el = document.getElementById(id);
  el.classList.add("pulse");
  setTimeout(() => el.classList.remove("pulse"), 1600);
}

function newLevel(advance) { if (advance) state.level++; loadLevel(state.level); }
let optimalToken = 0;
function loadLevel(level) {
  state.level = level;
  state.tubes = generateLevel(level);
  state.optimal = null;
  state.moves = 0; state.history = []; state.selected = null;
  state.addUsed = false; state.won = false; state.hint = null;
  pour = null; dyn = []; syncDyn();
  hideWin(); updateHud();
  // Compute the shortest solution off the critical path (used for stars).
  const token = ++optimalToken;
  const snapshot = state.tubes.map((t) => t.slice());
  setTimeout(() => {
    const path = solvePath(snapshot, 150000);
    if (token === optimalToken) state.optimal = path ? path.length : null;
  }, 30);
}

function updateHud() {
  levelValueEl.textContent = String(state.level);
  movesValueEl.textContent = String(state.moves);
  const addBtn = document.getElementById("addTubeBtn");
  addBtn.disabled = state.addUsed || state.won;
  addBtn.classList.toggle("spent", state.addUsed);
  document.getElementById("undoBtn").disabled = state.history.length === 0 || state.won;
  document.getElementById("hintBtn").disabled = state.won;
}

/* ---------- Win overlay + stars + confetti ---------- */
const overlay = document.getElementById("winOverlay");
function starCount() {
  const opt = state.optimal;
  if (!opt) return state.moves <= (state.tubes.length * 3) ? 3 : 2;
  if (state.moves <= opt) return 3;
  if (state.moves <= Math.ceil(opt * 1.4)) return 2;
  return 1;
}
function onWin() {
  state.won = true; state.selected = null; updateHud();
  const stars = starCount();
  const starEls = document.querySelectorAll("#stars .star");
  starEls.forEach((s) => s.classList.remove("on"));
  const optTxt = state.optimal ? `（最短 <b>${state.optimal}</b> 手）` : "";
  document.getElementById("winSub").innerHTML = `<b>${state.moves}</b> 手でクリア ${optTxt}`;
  overlay.classList.remove("hidden");
  // pop stars in sequence
  starEls.forEach((s, i) => setTimeout(() => { if (i < stars) s.classList.add("on"); }, 260 + i * 220));
  startConfetti();
  sfx("win");
}
function hideWin() { overlay.classList.add("hidden"); stopConfetti(); }

/* ---------- Confetti ---------- */
const confettiCanvas = document.getElementById("confetti");
const cctx = confettiCanvas.getContext("2d");
let confetti = [], confettiRAF = null;
function startConfetti() {
  const w = confettiCanvas.clientWidth, h = confettiCanvas.clientHeight;
  confettiCanvas.width = w * DPR; confettiCanvas.height = h * DPR;
  cctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const cols = ["#ff6b6b", "#ffd34e", "#33d16f", "#34d3ff", "#a855f7", "#ec4899"];
  confetti = [];
  for (let i = 0; i < 140; i++) confetti.push({
    x: w / 2 + (Math.random() - 0.5) * w * 0.5,
    y: h * 0.32 + (Math.random() - 0.5) * 40,
    vx: (Math.random() - 0.5) * 8,
    vy: -6 - Math.random() * 7,
    g: 0.22 + Math.random() * 0.12,
    r: 4 + Math.random() * 5,
    rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
    col: cols[(Math.random() * cols.length) | 0], life: 0,
  });
  cancelAnimationFrame(confettiRAF);
  confettiStep();
}
function confettiStep() {
  const w = confettiCanvas.clientWidth, h = confettiCanvas.clientHeight;
  cctx.clearRect(0, 0, w, h);
  let alive = 0;
  for (const c of confetti) {
    c.vy += c.g; c.x += c.vx; c.y += c.vy; c.vx *= 0.99; c.rot += c.vr; c.life++;
    if (c.y < h + 20) alive++;
    cctx.save();
    cctx.translate(c.x, c.y); cctx.rotate(c.rot);
    cctx.fillStyle = c.col; cctx.globalAlpha = Math.max(0, 1 - c.life / 220);
    cctx.fillRect(-c.r / 2, -c.r / 2, c.r, c.r * 1.6);
    cctx.restore();
  }
  if (alive > 0 && !overlay.classList.contains("hidden")) confettiRAF = requestAnimationFrame(confettiStep);
}
function stopConfetti() { cancelAnimationFrame(confettiRAF); cctx && cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height); }

/* ---------- Sound (WebAudio, no assets) ---------- */
let AC = null, soundOn = true;
try { soundOn = localStorage.getItem("waterpuzzle.sound") !== "0"; } catch (_) {}
function audioResume() {
  if (!soundOn) return;
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { AC = null; } }
  if (AC && AC.state === "suspended") AC.resume();
}
function tone(freq, dur, type = "sine", vol = 0.12, when = 0) {
  if (!soundOn || !AC) return;
  const t0 = AC.currentTime + when;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(AC.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
function sfx(kind) {
  if (!soundOn) return;
  audioResume();
  if (!AC) return;
  if (kind === "pick") tone(520, 0.09, "triangle", 0.08);
  else if (kind === "pour") { tone(300, 0.14, "sine", 0.10); tone(220, 0.22, "sine", 0.06, 0.05); }
  else if (kind === "complete") { tone(660, 0.12, "triangle", 0.12); tone(880, 0.16, "triangle", 0.10, 0.09); }
  else if (kind === "win") { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, "triangle", 0.12, i * 0.12)); }
}

/* ============================================================
   Wire up — null-safe so a missing element (e.g. a stale cached
   asset mismatch) can never crash the whole script and blank the
   board. Each binding is independent.
   ============================================================ */
function on(id, evt, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(evt, fn);
}
on("undoBtn", "click", () => { audioResume(); undo(); });
on("restartBtn", "click", restart);
on("addTubeBtn", "click", addTube);
on("hintBtn", "click", () => { audioResume(); hint(); });
on("replayBtn", "click", () => { hideWin(); loadLevel(state.level); });
on("nextLevelBtn", "click", () => newLevel(true));

const soundBtn = document.getElementById("soundBtn");
function refreshSoundBtn() {
  if (!soundBtn) return;
  soundBtn.textContent = soundOn ? "🔊" : "🔇";
  soundBtn.classList.toggle("muted", !soundOn);
}
on("soundBtn", "click", () => {
  soundOn = !soundOn;
  try { localStorage.setItem("waterpuzzle.sound", soundOn ? "1" : "0"); } catch (_) {}
  refreshSoundBtn();
  if (soundOn) { audioResume(); sfx("pick"); }
});
refreshSoundBtn();

document.addEventListener("keydown", (e) => {
  if (e.key === "u" || e.key === "U") undo();
  else if (e.key === "r" || e.key === "R") restart();
  else if (e.key === "h" || e.key === "H") hint();
  else if (e.key === "n" || e.key === "N") newLevel(true);
});
window.addEventListener("resize", resize);
window.addEventListener("load", resize);
// Re-sync the canvas whenever the board box changes size (covers font
// reflow, mobile URL-bar show/hide, split-screen, etc.).
if (window.ResizeObserver) new ResizeObserver(resize).observe(boardEl);

// Persist progress on win.
const _onWin = onWin;
onWin = function () { _onWin(); try { localStorage.setItem("waterpuzzle.level", String(state.level + 1)); } catch (_) {} };

function loadProgress() {
  try { const v = parseInt(localStorage.getItem("waterpuzzle.level") || "1", 10); return v > 0 ? v : 1; } catch (_) { return 1; }
}

// Test / debug hook.
window.WaterPuzzle = {
  state, layout: () => LAYOUT, click: onTubeClick, pouring: () => !!pour,
  legalMoves, applyPour, isSolved, boardKey, solvePath, hint, undo,
  pourP: () => pourProgress(),
  freeze: (v) => { FREEZE = v; },
};

resize();
loadLevel(loadProgress());
requestAnimationFrame(frame);
