/* ============================================================
   Water Puzzle  —  a premium "Magic Sort!"-style sorting game
   Bottle-shaped vessels with cork caps, tilt-to-pour physics,
   rippling liquid, a rewarded-ad power-up economy, coins,
   star ratings and confetti. Pure vanilla JS. No dependencies.
   ============================================================ */

const CAPACITY = 4;

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

const PW_DEFAULT = { undo: 5, hint: 3, add: 3 };

const state = {
  level: 1,
  moves: 0,
  optimal: null,
  coins: 0,
  pw: { ...PW_DEFAULT },
  tubes: [],
  history: [],
  selected: null,
  won: false,
  hint: null,
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
    if (!isSolvable(tubes)) continue;
    return tubes;
  }
  const tubes = [];
  for (let c = 1; c <= colors; c++) tubes.push([c, c, c, c]);
  for (let e = 0; e < emptyTubes; e++) tubes.push([]);
  return tubes;
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

// Breadth-first shortest solution.
function solvePath(start, cap = 300000) {
  const startKey = boardKey(start);
  if (isSolved(start)) return [];
  const seen = new Set([startKey]);
  const queue = [start.map((t) => t.slice())];
  const parent = new Map();
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
  if (!b.length) return true;                        // empty destination: always allowed
  return topColor(a) === topColor(b);                // otherwise the top colors must match
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
const coinValueEl = document.getElementById("coinValue");

let DPR = 1, VIEW = { w: 0, h: 0 }, LAYOUT = null;
let dyn = [];

const POUR_MS = 780;
const MAX_TILT = 0.92;

let pour = null;
let FREEZE = null;

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
  return { lift: 0, wave: 0, phase: Math.random() * 6.28, completeAt: -1, completeColor: 0, sparks: [], bubbles };
}
const COMPLETE_MS = 850;

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
  const padX = 8;
  const gapX = Math.max(12, Math.min(24, VIEW.w * 0.045));
  const gapY = 26;

  const maxPerRow = VIEW.w < 520 ? 5 : 7;
  const rows = Math.max(1, Math.ceil(n / maxPerRow));
  const perRow = Math.ceil(n / rows);

  let tubeW = (VIEW.w - padX * 2 - gapX * (perRow - 1)) / perRow;
  tubeW = Math.max(36, Math.min(72, tubeW));

  let wall = Math.max(2.5, tubeW * 0.05);
  let unitH = tubeW * 0.66;

  // Bottle proportions (multiples of unitH). Open-mouth bottle: a small
  // rim lip (capF), a slim neck, a rounded shoulder, then the body.
  const capF = 0.16, neckF = 0.5, shoulderF = 0.5, bottomF = 0.18;
  let liftPx = unitH * 0.32;

  const metrics = () => {
    const capH = unitH * capF, neckH = unitH * neckF, shoulderH = unitH * shoulderF, bottomPad = unitH * bottomF;
    const bodyH = unitH * CAPACITY + bottomPad;
    const tubeH = capH + neckH + shoulderH + bodyH;
    return { capH, neckH, shoulderH, bottomPad, bodyH, tubeH, neckW: tubeW * 0.46 };
  };
  let m = metrics();

  const topPad = liftPx + m.tubeH * 0.30 + 6;
  const budget = VIEW.h - topPad - 8;
  let usedH = rows * m.tubeH + (rows - 1) * gapY;
  if (usedH > budget && budget > 0) {
    const f = budget / usedH;
    unitH *= f; liftPx *= f; m = metrics();
    usedH = rows * m.tubeH + (rows - 1) * gapY;
  }

  const startY = topPad + Math.max(0, (budget - usedH) / 2);
  const rowH = m.tubeH + gapY;

  const rects = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, n - row * perRow);
    const rowW = inRow * tubeW + (inRow - 1) * gapX;
    const startX = (VIEW.w - rowW) / 2;
    const col = i - row * perRow;
    const x = startX + col * (tubeW + gapX);
    const y = startY + row * rowH;
    rects.push({ x, y, w: tubeW, h: m.tubeH, cx: x + tubeW / 2, cy: y + m.tubeH / 2 });
  }
  LAYOUT = { tubeW, unitH, wall, liftPx, m, rects };
}

/* ---------- color helpers ---------- */
function rgb(hex) { const v = hex.replace("#", ""); return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)]; }
function rgba(hex, a) { const c = rgb(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

/* ---------- bottle outline ---------- */
function roundedBar(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function bottlePath(x, y, w, m) {
  const cx = x + w / 2, nhw = m.neckW / 2;
  const neckTop = y + m.capH;
  const shoulderTop = neckTop + m.neckH;
  const bodyTop = shoulderTop + m.shoulderH;
  const bodyBot = bodyTop + m.bodyH;
  const botR = w * 0.44;
  const sMidY = shoulderTop + (bodyTop - shoulderTop) * 0.55;
  ctx.beginPath();
  ctx.moveTo(cx - nhw, neckTop);
  ctx.lineTo(cx - nhw, shoulderTop);
  // smooth S-curve shoulder to the body wall
  ctx.bezierCurveTo(cx - nhw, sMidY, x, shoulderTop + (bodyTop - shoulderTop) * 0.45, x, bodyTop);
  ctx.lineTo(x, bodyBot - botR);
  ctx.quadraticCurveTo(x, bodyBot, x + botR, bodyBot);
  ctx.lineTo(x + w - botR, bodyBot);
  ctx.quadraticCurveTo(x + w, bodyBot, x + w, bodyBot - botR);
  ctx.lineTo(x + w, bodyTop);
  ctx.bezierCurveTo(x + w, shoulderTop + (bodyTop - shoulderTop) * 0.45, cx + nhw, sMidY, cx + nhw, shoulderTop);
  ctx.lineTo(cx + nhw, neckTop);
  ctx.closePath();
  return { cx, neckTop, shoulderTop, bodyTop, bodyBot, inBot: bodyBot - m.wall };
}

/* ---------- per-tube transform ---------- */
function tubeXf(idx, now) {
  const L = LAYOUT, r = L.rects[idx], d = dyn[idx];
  let scale = 1;
  if (d.completeAt >= 0) {
    const t = (now - d.completeAt) / COMPLETE_MS;
    if (t < 1) scale = 1 + 0.17 * Math.sin(t * Math.PI) * Math.exp(-1.6 * t) + 0.05 * Math.sin(t * Math.PI * 3) * Math.exp(-3 * t);
    // completeAt is cleared by the FX pass, not here
  }
  if (pour && pour.from === idx) {
    const p = pourProgress(), ta = tiltAmt(p);
    const to = L.rects[pour.to];
    const dir = to.cx >= r.cx ? 1 : -1;
    const pourCx = to.cx - dir * (to.w * 0.58);
    const pourCy = to.y - r.h * 0.04 + r.h * 0.5;
    return {
      offX: (pourCx - r.cx) * ta,
      offY: (pourCy - r.cy) * ta - d.lift * L.liftPx * (1 - ta),
      angle: dir * MAX_TILT * ta, scale, pivotX: r.cx, pivotY: r.cy, dir,
    };
  }
  return { offX: 0, offY: -d.lift * L.liftPx, angle: 0, scale, pivotX: r.cx, pivotY: r.cy, dir: 1 };
}
function tiltAmt(p) {
  if (p < 0.2) return easeOut(p / 0.2);
  if (p > 0.82) return easeOut(Math.max(0, (1 - p) / 0.18));
  return 1;
}
function xfPoint(px, py, xf) {
  const dx = px - xf.pivotX, dy = py - xf.pivotY;
  const c = Math.cos(xf.angle), s = Math.sin(xf.angle);
  return { x: xf.pivotX + (dx * c - dy * s) * xf.scale + xf.offX, y: xf.pivotY + (dx * s + dy * c) * xf.scale + xf.offY };
}

/* ---------- draw one bottle ---------- */
function drawTube(idx, now) {
  const L = LAYOUT, r = L.rects[idx], m = { ...L.m, wall: L.wall };
  const xf = tubeXf(idx, now);

  ctx.save();
  ctx.translate(xf.offX, xf.offY);
  ctx.translate(xf.pivotX, xf.pivotY);
  ctx.rotate(xf.angle);
  ctx.scale(xf.scale, xf.scale);
  ctx.translate(-xf.pivotX, -xf.pivotY);

  const x = r.x, y = r.y, w = r.w;

  // shadow
  ctx.save();
  ctx.filter = "blur(6px)";
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  const gp = bottlePath(x + 2, y + 9, w, m); ctx.fill();
  ctx.restore();

  // glass back — cool, slightly blue-tinted glass
  const g = bottlePath(x, y, w, m);
  const gb = ctx.createLinearGradient(x, y, x + w, y);
  gb.addColorStop(0, "rgba(214,230,255,0.18)");
  gb.addColorStop(0.45, "rgba(255,255,255,0.05)");
  gb.addColorStop(0.75, "rgba(180,200,255,0.05)");
  gb.addColorStop(1, "rgba(150,175,235,0.13)");
  ctx.fillStyle = gb; ctx.fill();
  // inner base shading for depth
  ctx.save();
  bottlePath(x, y, w, m); ctx.clip();
  const bshade = ctx.createLinearGradient(0, g.bodyBot - w * 0.5, 0, g.bodyBot);
  bshade.addColorStop(0, "rgba(0,0,0,0)");
  bshade.addColorStop(1, "rgba(0,0,0,0.22)");
  ctx.fillStyle = bshade;
  ctx.fillRect(x, g.bodyBot - w * 0.5, w, w * 0.5);
  ctx.restore();

  // liquid, clipped to bottle interior
  const bands = displayBands(idx);
  if (bands.length) {
    ctx.save();
    bottlePath(x, y, w, m);
    ctx.clip();
    drawLiquid(idx, bands, x + m.wall, w - m.wall * 2, g.inBot, L.unitH, now, dyn[idx]);
    ctx.restore();
  }

  drawGlassFront(idx, x, y, w, m, g, now);

  // shine sweep across a just-completed bottle
  if (dyn[idx].completeAt >= 0) {
    const t = (now - dyn[idx].completeAt) / COMPLETE_MS;
    if (t < 0.7) {
      ctx.save();
      bottlePath(x, y, w, m); ctx.clip();
      const sweep = -0.3 + (t / 0.7) * 1.6; // -0.3 .. 1.3 of width
      const sx = x + sweep * w;
      ctx.translate(sx, y); ctx.rotate(-0.35);
      const sg = ctx.createLinearGradient(-w * 0.25, 0, w * 0.25, 0);
      sg.addColorStop(0, "rgba(255,255,255,0)");
      sg.addColorStop(0.5, `rgba(255,255,255,${0.5 * (1 - t / 0.7)})`);
      sg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sg;
      ctx.fillRect(-w * 0.25, -m.capH, w * 0.5, g.bodyBot - y + m.capH * 2);
      ctx.restore();
    }
  }

  ctx.restore();
}

function drawGlassFront(idx, x, y, w, m, g, now) {
  // rim at neck opening
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(g.cx, g.neckTop, m.neckW / 2, m.wall * 1.0, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.34)";
  ctx.lineWidth = Math.max(1, m.wall * 0.5);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  bottlePath(x, y, w, m); ctx.clip();
  // bright specular highlight streak (left)
  let gg = ctx.createLinearGradient(x + w * 0.14, 0, x + w * 0.34, 0);
  gg.addColorStop(0, "rgba(255,255,255,0)");
  gg.addColorStop(0.5, "rgba(255,255,255,0.55)");
  gg.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gg;
  roundedBar(x + w * 0.14, g.shoulderTop + m.wall, w * 0.14, g.bodyBot - g.shoulderTop - w * 0.32, w * 0.07);
  ctx.fill();
  // thin secondary highlight
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  roundedBar(x + w * 0.30, g.bodyTop + w * 0.1, w * 0.045, g.bodyBot - g.bodyTop - w * 0.4, w * 0.025);
  ctx.fill();
  // soft right-edge rim light
  gg = ctx.createLinearGradient(x + w * 0.80, 0, x + w * 0.97, 0);
  gg.addColorStop(0, "rgba(255,255,255,0)");
  gg.addColorStop(1, "rgba(200,220,255,0.20)");
  ctx.fillStyle = gg;
  ctx.fillRect(x + w * 0.78, g.bodyTop, w * 0.2, g.bodyBot - g.bodyTop);
  ctx.restore();

  // outline / selection / hint
  const selected = state.selected === idx;
  const hinted = state.hint && (state.hint.from === idx || state.hint.to === idx) && now < state.hint.until;
  bottlePath(x, y, w, m);
  if (selected) { ctx.strokeStyle = "#7de3ff"; ctx.lineWidth = 3; ctx.shadowColor = "rgba(125,227,255,0.85)"; ctx.shadowBlur = 16; }
  else if (hinted) {
    const pulse = 0.5 + 0.5 * Math.sin(now / 140);
    ctx.strokeStyle = state.hint.from === idx ? "#ffd34e" : "#8affc0";
    ctx.lineWidth = 3; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 10 + pulse * 14;
  } else { ctx.strokeStyle = "rgba(255,255,255,0.30)"; ctx.lineWidth = 1.6; }
  ctx.stroke();
  ctx.shadowBlur = 0;
}

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
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.28 * fade})`; ctx.lineWidth = 1; ctx.stroke();
  }

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
  for (let x = 0; x <= inW; x += step) { const px = inX + x, py = surfaceY + crest(x) - 1; if (x === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
  ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1.6; ctx.stroke();

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
  const p = pourProgress(), L = LAYOUT, m = { ...L.m, wall: L.wall };
  const from = L.rects[pour.from], to = L.rects[pour.to];
  const xf = tubeXf(pour.from, now), dir = xf.dir, pal = PALETTE[pour.color];

  const neckTopLocal = from.y + m.capH;
  const lip = xfPoint(from.cx + dir * m.neckW * 0.4, neckTopLocal, xf);

  const toBands = displayBands(pour.to);
  let tot = 0; for (const b of toBands) tot += b.units;
  const inBot = to.y + to.h - m.wall;
  const ty = inBot - tot * L.unitH, tx = to.cx;

  const alpha = Math.min(clamp((p - 0.2) / 0.08), clamp((0.84 - p) / 0.08));
  if (alpha > 0.01) {
    const mx = (lip.x + tx) / 2 + dir * 6, apexY = Math.min(lip.y, ty) - 8;
    ctx.save(); ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(lip.x, lip.y); ctx.quadraticCurveTo(mx, apexY, tx, ty);
    const wS = Math.max(4, L.tubeW * 0.14);
    ctx.strokeStyle = rgba(pal.b, 0.95 * alpha); ctx.lineWidth = wS; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lip.x, lip.y); ctx.quadraticCurveTo(mx, apexY, tx, ty);
    ctx.strokeStyle = rgba(pal.l, 0.9 * alpha); ctx.lineWidth = wS * 0.4; ctx.stroke();
    ctx.restore();
    for (let i = 0; i < 2; i++) {
      const u = ((now / 240) + i / 2) % 1;
      const bx = bez(lip.x, mx, tx, u), by = bez(lip.y, apexY, ty, u);
      ctx.beginPath(); ctx.arc(bx, by, wS * 0.24, 0, Math.PI * 2); ctx.fillStyle = rgba(pal.l, 0.85 * alpha); ctx.fill();
    }
  }
  if (p > 0.34 && p < 0.98) {
    const inW = to.w - m.wall * 2, rp = (p - 0.34) / 0.64;
    for (let i = 0; i < 2; i++) {
      const rr = (rp * 1.5 + i * 0.5) % 1;
      ctx.beginPath(); ctx.ellipse(tx, ty, inW * 0.5 * rr, 4 * rr, 0, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(pal.l, (1 - rr) * 0.5); ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
}
function bez(a, b, c, t) { const u = 1 - t; return u * u * a + 2 * u * t * b + t * t * c; }
function pourProgress() { if (FREEZE != null) return FREEZE; return pour ? clamp((performance.now() - pour.start) / POUR_MS) : 0; }
function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function easeOut(t) { return 1 - Math.pow(1 - t, 2.2); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

/* ============================================================
   Main loop
   ============================================================ */
function frame(now) {
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
  if (pour) drawTube(pour.from, now);
  drawCompleteFX(now);
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
    pour = { from, to, color, amount, fromPre, toPre, start: performance.now(), done: false };
    dyn[from].wave = 3; sfx("pour");
  } else {
    state.selected = state.tubes[to].length ? to : null;
  }
}
function finalizePour(now) {
  pour.done = true;
  const to = pour.to, from = pour.from;
  pour = null;
  dyn[to].wave = 6;
  let done = false;
  if (isTubeComplete(state.tubes[to])) { markComplete(to, now); done = true; }
  if (isTubeComplete(state.tubes[from])) { markComplete(from, now); done = true; }
  if (done) sfx("complete");
  if (isSolved(state.tubes)) onWin();
}
function markComplete(idx, now) {
  const d = dyn[idx];
  d.completeAt = now;
  d.completeColor = topColor(state.tubes[idx]);
  d.wave = 9;
  const pal = PALETTE[d.completeColor] || { l: "#ffd34e" };
  const cols = [pal.l, "#ffffff", "#ffe08a"];
  d.sparks = [];
  const n = 20;
  for (let k = 0; k < n; k++) d.sparks.push({
    a: (k / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.5,
    sp: 0.75 + Math.random() * 1.0, r: 3.2 + Math.random() * 4.5,
    spin: Math.random() * 6.28, col: cols[k % cols.length],
  });
}

function drawSparkle(x, y, r, rot, color) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.quadraticCurveTo(0, 0, 0, r);
  ctx.quadraticCurveTo(0, 0, -r, 0);
  ctx.quadraticCurveTo(0, 0, 0, -r);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawCompleteFX(now) {
  const L = LAYOUT;
  for (let i = 0; i < dyn.length; i++) {
    const d = dyn[i];
    if (d.completeAt < 0) continue;
    const t = (now - d.completeAt) / COMPLETE_MS;
    if (t >= 1) { d.completeAt = -1; continue; }
    const r = L.rects[i];
    const cx = r.cx, cyc = r.cy - d.lift * L.liftPx - r.h * 0.05, w = r.w;
    const pal = PALETTE[d.completeColor] || { l: "#ffd34e" };

    ctx.save();

    // soft radial flash bloom behind the bottle
    if (t < 0.45) {
      const fa = 1 - t / 0.45;
      const rad = w * (0.7 + t * 1.8);
      const fg = ctx.createRadialGradient(cx, cyc, 0, cx, cyc, rad);
      fg.addColorStop(0, rgba("#ffffff", 0.5 * fa));
      fg.addColorStop(0.35, rgba(pal.l, 0.4 * fa));
      fg.addColorStop(1, rgba(pal.l, 0));
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(cx, cyc, rad, 0, Math.PI * 2); ctx.fill();
    }

    // two bold expanding shock rings
    for (let k = 0; k < 2; k++) {
      const tt = clamp((t - k * 0.14) / 0.85);
      if (tt <= 0) continue;
      const rr = w * 0.42 + easeOut(tt) * w * (1.25 + k * 0.45);
      ctx.beginPath();
      ctx.arc(cx, cyc, rr, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(k ? pal.l : "#ffffff", (1 - tt) * (k ? 0.7 : 0.9));
      ctx.lineWidth = (1 - tt) * 6 + 1.5;
      ctx.stroke();
    }

    // bright sparkle burst (solid + colored glow) — pops against the dark sky
    for (const s of d.sparks) {
      const dist = (w * 0.35) + easeOut(clamp(t / 0.9)) * s.sp * w * 1.55;
      const px = cx + Math.cos(s.a) * dist;
      const py = cyc + Math.sin(s.a) * dist;
      const sz = s.r * (1 - t * 0.55) * 2.2;
      if (sz <= 0.4) continue;
      const al = Math.min(1, 1.35 - t);
      ctx.shadowColor = rgba(pal.l, 0.9); ctx.shadowBlur = 14;
      drawSparkle(px, py, sz * 1.7, s.spin + t * 6, rgba(pal.l, al * 0.9)); // colored halo
      ctx.shadowBlur = 0;
      drawSparkle(px, py, sz, s.spin + t * 6, rgba("#ffffff", al));           // white core
    }
    ctx.restore();
  }
}
canvas.addEventListener("click", (e) => { audioResume(); onTubeClick(pointerToTube(e.clientX, e.clientY)); });

/* ============================================================
   Power-ups  (Undo / Hint / +Bottle) with a rewarded-ad economy
   ============================================================ */
function pushHistory() {
  state.history.push({ tubes: state.tubes.map((t) => t.slice()), moves: state.moves });
  if (state.history.length > 400) state.history.shift();
}

// Coin prices for buying a power-up when you're out.
const PRICE = { undo: 60, hint: 90, add: 140 };

// Undo
function useUndo() {
  if (state.won || pour) return;
  if (state.pw.undo > 0) { if (doUndo()) { state.pw.undo--; savePW(); updateHud(); } }
  else if (state.history.length) openStore("undo");
  else flashBtn("undoBtn");
}
function doUndo() {
  if (!state.history.length) return false;
  const prev = state.history.pop();
  state.tubes = prev.tubes; state.moves = prev.moves;
  state.selected = null; state.hint = null;
  syncDyn(); sfx("pick"); return true;
}
// Hint
function useHint() {
  if (state.won || pour) return;
  if (state.pw.hint > 0) { if (doHint()) { state.pw.hint--; savePW(); updateHud(); } }
  else openStore("hint");
}
function doHint() {
  const path = solvePath(state.tubes, 300000);
  if (path && path.length) {
    const mv = path[0];
    state.hint = { from: mv.from, to: mv.to, until: performance.now() + 2400 };
    state.selected = null; return true;
  }
  flashBtn("undoBtn"); return false; // stuck — suggest undo
}
// +Bottle
function useAdd() {
  if (state.won || pour) return;
  if (state.pw.add > 0) { doAdd(); state.pw.add--; savePW(); updateHud(); }
  else openStore("add");
}
function doAdd() {
  pushHistory();
  state.tubes.push([]);
  state.selected = null;
  dyn.push(newDyn(state.tubes.length - 1));
}

function flashBtn(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add("pulse");
  setTimeout(() => el.classList.remove("pulse"), 1400);
}

/* ---------- rewarded ad (simulated) ---------- */
const adModal = document.getElementById("adModal");
const AD_INFO = {
  undo: { icon: "↩️", reward: "Undo your last move" },
  hint: { icon: "💡", reward: "+1 Hint" },
  add: { icon: "🧪", reward: "+1 Empty bottle" },
};
let adKind = null, adTimer = null;
function openAd(kind) {
  adKind = kind;
  const info = AD_INFO[kind];
  document.getElementById("adIcon").textContent = info.icon;
  document.getElementById("adReward").textContent = "Reward: " + info.reward;
  document.getElementById("adHeadline").textContent = "Watch a video";
  const fill = document.getElementById("adFill");
  const status = document.getElementById("adStatus");
  const claim = document.getElementById("adClaim");
  fill.style.width = "0%"; claim.classList.add("hidden");
  status.textContent = "Reward in 3…";
  adModal.classList.remove("hidden");

  const dur = 3000; const t0 = performance.now();
  clearInterval(adTimer);
  adTimer = setInterval(() => {
    const e = performance.now() - t0, r = Math.min(1, e / dur);
    fill.style.width = (r * 100) + "%";
    const left = Math.ceil((dur - e) / 1000);
    status.textContent = r < 1 ? `Reward in ${left}…` : "Reward ready!";
    if (r >= 1) { clearInterval(adTimer); claim.classList.remove("hidden"); }
  }, 80);
}
function closeAd() { clearInterval(adTimer); adModal.classList.add("hidden"); adKind = null; }
function grantAd() {
  const kind = adKind; closeAd();
  if (kind) grantPowerup(kind);
}
// Give one power-up and immediately spend it (the "watch/buy → do it now" flow).
function grantPowerup(kind) {
  state.pw[kind] = (state.pw[kind] || 0) + 1; savePW(); updateHud();
  if (kind === "undo") useUndo();
  else if (kind === "hint") useHint();
  else if (kind === "add") useAdd();
}

/* ---------- get-more store (watch ad OR spend coins) ---------- */
const storeModal = document.getElementById("storeModal");
const STORE_INFO = {
  undo: { icon: "↩️", title: "Get more Undos" },
  hint: { icon: "💡", title: "Get more Hints" },
  add: { icon: "🧪", title: "Get more Bottles" },
};
let storeKind = null;
function openStore(kind) {
  storeKind = kind;
  const info = STORE_INFO[kind], price = PRICE[kind];
  document.getElementById("storeIcon").textContent = info.icon;
  document.getElementById("storeTitle").textContent = info.title;
  document.getElementById("storeBuyPrice").textContent = "Buy · " + price;
  document.getElementById("storeCoins").textContent = String(state.coins);
  const buyBtn = document.getElementById("storeBuy");
  buyBtn.classList.toggle("disabled", state.coins < price);
  storeModal.classList.remove("hidden");
}
function closeStore() { storeModal.classList.add("hidden"); storeKind = null; }
function buyPowerup() {
  const kind = storeKind; if (!kind) return;
  const price = PRICE[kind];
  if (state.coins < price) {
    const buyBtn = document.getElementById("storeBuy");
    buyBtn.classList.remove("shake"); void buyBtn.offsetWidth; buyBtn.classList.add("shake");
    return;
  }
  state.coins -= price; saveCoins();
  closeStore();
  grantPowerup(kind); // adds one and spends it right away
}

/* ============================================================
   Levels
   ============================================================ */
let optimalToken = 0;
function newLevel(advance) { if (advance) state.level++; loadLevel(state.level); }
function loadLevel(level) {
  state.level = level;
  state.tubes = generateLevel(level);
  state.optimal = null; state.moves = 0; state.history = [];
  state.selected = null; state.won = false; state.hint = null;
  pour = null; dyn = []; syncDyn();
  hideWin(); updateHud();
  const token = ++optimalToken;
  const snap = state.tubes.map((t) => t.slice());
  setTimeout(() => { const path = solvePath(snap, 150000); if (token === optimalToken) state.optimal = path ? path.length : null; }, 30);
}

function updateHud() {
  levelValueEl.textContent = String(state.level);
  coinValueEl.textContent = String(state.coins);
  setBadge("undoBadge", state.pw.undo);
  setBadge("hintBadge", state.pw.hint);
  setBadge("addBadge", state.pw.add);
}
function setBadge(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  if (n > 0) { el.textContent = String(n); el.classList.remove("ad"); }
  else { el.textContent = "+"; el.classList.remove("ad"); } // 0 → tap opens the get-more store
}

/* ---------- Win + stars + coins + confetti ---------- */
const overlay = document.getElementById("winOverlay");
function starCount() {
  const opt = state.optimal;
  if (!opt) return state.moves <= state.tubes.length * 3 ? 3 : 2;
  if (state.moves <= opt) return 3;
  if (state.moves <= Math.ceil(opt * 1.4)) return 2;
  return 1;
}
function onWin() {
  state.won = true; state.selected = null;
  const stars = starCount();
  const reward = 40 + stars * 30;
  state.coins += reward; saveCoins();
  try { localStorage.setItem("waterpuzzle.level", String(state.level + 1)); } catch (_) {}
  updateHud();

  // Celebration wave: every filled bottle pops in sequence before the card.
  const filled = [];
  for (let i = 0; i < state.tubes.length; i++) if (state.tubes[i].length) filled.push(i);
  const t0 = performance.now();
  filled.forEach((idx, k) => setTimeout(() => { markComplete(idx, performance.now()); sfx("complete"); }, k * 90));
  const delay = Math.min(900, filled.length * 90 + 260);

  setTimeout(() => {
    const starEls = document.querySelectorAll("#stars .win-star");
    starEls.forEach((s) => s.classList.remove("on"));
    const optTxt = state.optimal ? ` · Best ${state.optimal}` : "";
    document.getElementById("winSub").innerHTML = `Cleared in <b>${state.moves}</b> moves${optTxt}`;
    document.getElementById("winCoins").textContent = "+" + reward;
    overlay.classList.remove("hidden");
    starEls.forEach((s, i) => setTimeout(() => { if (i < stars) s.classList.add("on"); }, 200 + i * 240));
    startConfetti(); sfx("win");
  }, delay);
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
  for (let i = 0; i < 150; i++) confetti.push({
    x: w / 2 + (Math.random() - 0.5) * w * 0.5, y: h * 0.3 + (Math.random() - 0.5) * 40,
    vx: (Math.random() - 0.5) * 8, vy: -6 - Math.random() * 7,
    g: 0.22 + Math.random() * 0.12, r: 4 + Math.random() * 5,
    rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
    col: cols[(Math.random() * cols.length) | 0], life: 0,
  });
  cancelAnimationFrame(confettiRAF); confettiStep();
}
function confettiStep() {
  const w = confettiCanvas.clientWidth, h = confettiCanvas.clientHeight;
  cctx.clearRect(0, 0, w, h);
  let alive = 0;
  for (const c of confetti) {
    c.vy += c.g; c.x += c.vx; c.y += c.vy; c.vx *= 0.99; c.rot += c.vr; c.life++;
    if (c.y < h + 20) alive++;
    cctx.save(); cctx.translate(c.x, c.y); cctx.rotate(c.rot);
    cctx.fillStyle = c.col; cctx.globalAlpha = Math.max(0, 1 - c.life / 220);
    cctx.fillRect(-c.r / 2, -c.r / 2, c.r, c.r * 1.6); cctx.restore();
  }
  if (alive > 0 && !overlay.classList.contains("hidden")) confettiRAF = requestAnimationFrame(confettiStep);
}
function stopConfetti() { cancelAnimationFrame(confettiRAF); cctx && cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height); }

/* ---------- Sound ---------- */
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
  o.connect(g); g.connect(AC.destination); o.start(t0); o.stop(t0 + dur + 0.02);
}
function sfx(kind) {
  if (!soundOn) return; audioResume(); if (!AC) return;
  if (kind === "pick") tone(520, 0.09, "triangle", 0.08);
  else if (kind === "pour") { tone(300, 0.14, "sine", 0.10); tone(220, 0.22, "sine", 0.06, 0.05); }
  else if (kind === "complete") { tone(660, 0.12, "triangle", 0.12); tone(880, 0.16, "triangle", 0.10, 0.09); }
  else if (kind === "win") { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, "triangle", 0.12, i * 0.12)); }
}

/* ---------- Persistence ---------- */
function savePW() { try { localStorage.setItem("waterpuzzle.pw", JSON.stringify(state.pw)); } catch (_) {} }
function saveCoins() { try { localStorage.setItem("waterpuzzle.coins", String(state.coins)); } catch (_) {} }
function loadPersisted() {
  try {
    const pw = JSON.parse(localStorage.getItem("waterpuzzle.pw") || "null");
    if (pw && typeof pw === "object") state.pw = { undo: pw.undo ?? PW_DEFAULT.undo, hint: pw.hint ?? PW_DEFAULT.hint, add: pw.add ?? PW_DEFAULT.add };
    state.coins = parseInt(localStorage.getItem("waterpuzzle.coins") || "0", 10) || 0;
  } catch (_) {}
}
function loadProgress() {
  try { const v = parseInt(localStorage.getItem("waterpuzzle.level") || "1", 10); return v > 0 ? v : 1; } catch (_) { return 1; }
}

/* ============================================================
   Wire up (null-safe)
   ============================================================ */
function on(id, evt, fn) { const el = document.getElementById(id); if (el) el.addEventListener(evt, fn); }

on("undoBtn", "click", () => { audioResume(); useUndo(); });
on("hintBtn", "click", () => { audioResume(); useHint(); });
on("addTubeBtn", "click", () => { audioResume(); useAdd(); });

on("nextLevelBtn", "click", () => newLevel(true));

on("adClaim", "click", () => { audioResume(); grantAd(); });
on("adClose", "click", closeAd);

on("storeClose", "click", closeStore);
on("storeWatch", "click", () => { audioResume(); const k = storeKind; closeStore(); if (k) openAd(k); });
on("storeBuy", "click", () => { audioResume(); buyPowerup(); });

// Settings modal
const settingsModal = document.getElementById("settingsModal");
function refreshSoundRow() { const el = document.getElementById("soundState"); if (el) el.textContent = soundOn ? "On" : "Off"; }
on("settingsBtn", "click", () => { refreshSoundRow(); settingsModal.classList.remove("hidden"); });
on("closeSettings", "click", () => settingsModal.classList.add("hidden"));
on("restartLevelBtn", "click", () => { settingsModal.classList.add("hidden"); const first = state.history[0]; if (first && !state.won) { state.tubes = first.tubes.map((t) => t.slice()); state.moves = 0; state.history = []; state.selected = null; state.hint = null; syncDyn(); } else if (!state.won) { loadLevel(state.level); } });
on("soundToggle", "click", () => {
  soundOn = !soundOn;
  try { localStorage.setItem("waterpuzzle.sound", soundOn ? "1" : "0"); } catch (_) {}
  refreshSoundRow();
  if (soundOn) { audioResume(); sfx("pick"); }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "u" || e.key === "U") useUndo();
  else if (e.key === "h" || e.key === "H") useHint();
  else if (e.key === "b" || e.key === "B") useAdd();
  else if (e.key === "n" || e.key === "N") newLevel(true);
});
window.addEventListener("resize", resize);
window.addEventListener("load", resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(boardEl);

window.WaterPuzzle = {
  state, layout: () => LAYOUT, click: onTubeClick, pouring: () => !!pour,
  legalMoves, applyPour, isSolved, boardKey, solvePath,
  useUndo, useHint, useAdd, openAd, grantAd, openStore, buyPowerup,
  pourP: () => pourProgress(), freeze: (v) => { FREEZE = v; },
  fx: (i, back) => { markComplete(i, performance.now() - (back || 0)); },
};

loadPersisted();
resize();
loadLevel(loadProgress());
requestAnimationFrame(frame);
