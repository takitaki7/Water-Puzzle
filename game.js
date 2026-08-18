/* ============================================================
   Water Puzzle  —  a "Magic Sort!"-style color sorting game
   Pure vanilla JS. No dependencies.
   ============================================================ */

const CAPACITY = 4; // liquid units per tube

// A generous, well-separated palette. Index 0 is unused so colors
// map to 1..N (0 == empty).
const COLORS = [
  null,
  "#ef4444", // red
  "#3b82f6", // blue
  "#22c55e", // green
  "#eab308", // yellow
  "#a855f7", // purple
  "#f97316", // orange
  "#ec4899", // pink
  "#14b8a6", // teal
  "#84cc16", // lime
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f43f5e", // rose
];

/* ---------- Level configuration by difficulty ---------- */
function levelConfig(level) {
  // Number of distinct colors grows with the level, capped by palette.
  const maxColors = COLORS.length - 1;
  const colors = Math.min(3 + Math.floor((level - 1) / 1.5), maxColors);
  // Two spare (empty) tubes keep every generated level solvable.
  const emptyTubes = level <= 2 ? 2 : 2;
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
   Level generation
   Strategy: start from the solved state (each color fills one
   tube) then perform many random *legal reverse pours*. Because
   every scrambling move is itself a legal pour, the resulting
   position is guaranteed solvable.
   ============================================================ */
function generateLevel(level) {
  const { colors, emptyTubes } = levelConfig(level);

  // Deal a randomly shuffled pool of colors into the color tubes, add the
  // spare empties, and keep only boards that are (a) not already solved and
  // (b) provably solvable. With two spare tubes the solvable rate is near
  // 100%, so this settles in one or two tries; the solver is fast for these
  // sizes. Cap the retries and fall back to a mild reshuffle just in case.
  for (let attempt = 0; attempt < 60; attempt++) {
    const pool = [];
    for (let c = 1; c <= colors; c++) for (let i = 0; i < CAPACITY; i++) pool.push(c);
    shuffle(pool);

    const tubes = [];
    for (let c = 0; c < colors; c++) tubes.push(pool.slice(c * CAPACITY, c * CAPACITY + CAPACITY));
    for (let e = 0; e < emptyTubes; e++) tubes.push([]);

    if (isSolved(tubes)) continue;               // too easy — reshuffle
    if (isSolvable(tubes)) return tubes;
  }

  // Fallback (essentially never reached): a guaranteed-solvable staircase.
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

// Every legal (from,to) pour available during actual play.
function legalMoves(tubes) {
  const res = [];
  for (let from = 0; from < tubes.length; from++) {
    for (let to = 0; to < tubes.length; to++) {
      if (from !== to && canPour(tubes, from, to)) res.push({ from, to });
    }
  }
  return res;
}

// Depth-first solvability check over the (small) state space, with a
// visited-set on canonical keys and a hard node cap for safety.
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
// Order-independent signature of a board (tube order never matters).
function boardKey(tubes) {
  return tubes.map((t) => t.join(",")).sort().join("|");
}

/* ---------- Pour rules ---------- */
function topColor(tube) {
  return tube.length ? tube[tube.length - 1] : 0;
}
// count of same-colored units on top
function topRun(tube) {
  if (!tube.length) return 0;
  const c = topColor(tube);
  let n = 0;
  for (let i = tube.length - 1; i >= 0 && tube[i] === c; i--) n++;
  return n;
}
function canPour(tubes, from, to) {
  const a = tubes[from], b = tubes[to];
  if (!a.length) return false;               // nothing to pour
  if (b.length >= CAPACITY) return false;    // destination full
  if (from === to) return false;
  if (!b.length) {
    // Pouring a full single-color tube into an empty one is a no-op waste.
    if (a.length === CAPACITY && topRun(a) === CAPACITY) return false;
    return true;
  }
  return topColor(a) === topColor(b);        // colors must match
}
function applyPour(tubes, from, to) {
  const a = tubes[from], b = tubes[to];
  const color = topColor(a);
  let amount = Math.min(topRun(a), CAPACITY - b.length);
  for (let i = 0; i < amount; i++) { a.pop(); b.push(color); }
  return amount;
}

/* ---------- Win detection ---------- */
function isTubeComplete(tube) {
  return tube.length === CAPACITY && topRun(tube) === CAPACITY;
}
function isSolved(tubes) {
  return tubes.every((t) => t.length === 0 || isTubeComplete(t));
}

/* ============================================================
   Rendering
   ============================================================ */
const boardEl = document.getElementById("board");
const levelValueEl = document.getElementById("levelValue");
const movesValueEl = document.getElementById("movesValue");

function render() {
  boardEl.innerHTML = "";
  state.tubes.forEach((tube, idx) => {
    const tubeEl = document.createElement("div");
    tubeEl.className = "tube";
    tubeEl.dataset.index = String(idx);
    if (state.selected === idx) tubeEl.classList.add("selected");
    if (isTubeComplete(tube)) tubeEl.classList.add("complete-static");

    const badge = document.createElement("div");
    badge.className = "complete-badge";
    badge.textContent = "✓";
    tubeEl.appendChild(badge);

    // Render bottom-to-top; column-reverse handles visual order.
    tube.forEach((c) => {
      const seg = document.createElement("div");
      seg.className = "seg";
      seg.style.background = shade(COLORS[c]);
      tubeEl.appendChild(seg);
    });

    tubeEl.addEventListener("click", () => onTubeClick(idx));
    boardEl.appendChild(tubeEl);
  });

  levelValueEl.textContent = String(state.level);
  movesValueEl.textContent = String(state.moves);

  const addBtn = document.getElementById("addTubeBtn");
  addBtn.disabled = state.addUsed || state.won;
  document.getElementById("undoBtn").disabled = state.history.length === 0 || state.won;
}

// Slightly enrich flat colors with a vertical gradient for depth.
function shade(hex) {
  return `linear-gradient(180deg, ${lighten(hex, 0.18)}, ${hex} 55%, ${darken(hex, 0.16)})`;
}
function lighten(hex, amt) { return mix(hex, "#ffffff", amt); }
function darken(hex, amt) { return mix(hex, "#000000", amt); }
function mix(hex, other, amt) {
  const a = h2rgb(hex), b = h2rgb(other);
  const r = Math.round(a[0] + (b[0] - a[0]) * amt);
  const g = Math.round(a[1] + (b[1] - a[1]) * amt);
  const bl = Math.round(a[2] + (b[2] - a[2]) * amt);
  return `rgb(${r},${g},${bl})`;
}
function h2rgb(hex) {
  const v = hex.replace("#", "");
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

/* ============================================================
   Interaction
   ============================================================ */
function onTubeClick(idx) {
  if (state.won) return;

  if (state.selected === null) {
    if (state.tubes[idx].length === 0) return; // nothing to pick up
    state.selected = idx;
    render();
    return;
  }

  if (state.selected === idx) {
    // Tapping the same tube cancels the selection.
    state.selected = null;
    render();
    return;
  }

  const from = state.selected;
  const to = idx;
  if (canPour(state.tubes, from, to)) {
    pushHistory();
    const moved = applyPour(state.tubes, from, to);
    if (moved > 0) state.moves++;
    state.selected = null;
    render();
    flash(to);
    checkComplete(to);
    if (isSolved(state.tubes)) onWin();
  } else {
    // Illegal target: reselect it if it has liquid, else just cancel.
    state.selected = state.tubes[to].length ? to : null;
    render();
  }
}

function pushHistory() {
  state.history.push({
    tubes: state.tubes.map((t) => t.slice()),
    moves: state.moves,
  });
  if (state.history.length > 200) state.history.shift();
}

function flash(idx) {
  const el = boardEl.querySelector(`.tube[data-index="${idx}"]`);
  if (!el) return;
  el.classList.add("pour-flash");
  setTimeout(() => el.classList.remove("pour-flash"), 260);
}
function checkComplete(idx) {
  if (!isTubeComplete(state.tubes[idx])) return;
  const el = boardEl.querySelector(`.tube[data-index="${idx}"]`);
  if (el) {
    el.classList.add("complete");
    setTimeout(() => el.classList.remove("complete"), 400);
  }
}

/* ============================================================
   Controls
   ============================================================ */
function undo() {
  if (!state.history.length || state.won) return;
  const prev = state.history.pop();
  state.tubes = prev.tubes;
  state.moves = prev.moves;
  state.selected = null;
  render();
}

function restart() {
  // Rewind the whole history in one step.
  if (state.won) return;
  if (state.history.length) {
    const first = state.history[0];
    state.tubes = first.tubes.map((t) => t.slice());
    state.moves = 0;
    state.history = [];
    state.selected = null;
    render();
  }
}

function addTube() {
  if (state.addUsed || state.won) return;
  pushHistory();
  state.tubes.push([]);
  state.addUsed = true;
  state.selected = null;
  render();
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
  hideWin();
  render();
}

/* ---------- Win overlay ---------- */
const overlay = document.getElementById("winOverlay");
function onWin() {
  state.won = true;
  state.selected = null;
  render();
  document.getElementById("winSub").innerHTML =
    `レベル <b>${state.level}</b> を <b>${state.moves}</b> 手でクリアしました。`;
  setTimeout(() => overlay.classList.remove("hidden"), 450);
  saveProgress();
}
function hideWin() { overlay.classList.add("hidden"); }

/* ---------- Persistence (best-effort) ---------- */
function saveProgress() {
  try {
    localStorage.setItem("waterpuzzle.level", String(state.level + 1));
  } catch (_) { /* ignore */ }
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

// Keyboard: U = undo, R = restart, N = next.
document.addEventListener("keydown", (e) => {
  if (e.key === "u" || e.key === "U") undo();
  else if (e.key === "r" || e.key === "R") restart();
  else if (e.key === "n" || e.key === "N") newLevel(true);
});

loadLevel(loadProgress());
