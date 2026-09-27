const FACES = ["U", "D", "L", "R", "F", "B"];
const OPP = { U: "D", D: "U", L: "R", R: "L", F: "B", B: "F" };
const MODS = ["", "'", "2"];
const COLORS = { U: "#f4f7ff", D: "#ffd54a", F: "#3dffb0", B: "#6ea8ff", L: "#ff9a3d", R: "#ff5d73" };

const EVENTS = {
  "333": { name: "3x3x3", moves: 20, faces: FACES, extra: [] },
  "222": { name: "2x2x2", moves: 9, faces: FACES, extra: [] },
  "444": { name: "4x4x4", moves: 44, faces: FACES, extra: ["Uw", "Dw", "Lw", "Rw", "Fw", "Bw"] },
  "pyram": { name: "Pyraminx", moves: 11, faces: ["U", "L", "R", "B"], extra: [] },
  "skewb": { name: "Skewb", moves: 9, faces: ["U", "L", "R", "B"], extra: [] },
  "333oh": { name: "3x3 OH", moves: 20, faces: FACES, extra: [] }
};

const storeKey = "flashmat.v1";

const state = {
  phase: "idle",
  holdTimer: null,
  inspectLeft: 0,
  inspectId: null,
  startAt: 0,
  raf: 0,
  current: 0,
  scramble: "",
  selectedId: null,
  lastBeep: ""
};

const defaultSettings = {
  theme: "dark",
  inspection: 15,
  hold: false,
  sound: true,
  milli: false,
  event: "333"
};

let db = load();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(storeKey));
    if (raw && raw.sessions) return raw;
  } catch {}
  const id = uid();
  return {
    settings: { ...defaultSettings },
    currentSession: id,
    sessions: [{ id, name: "Home practice", event: "333", solves: [] }]
  };
}
function save() { localStorage.setItem(storeKey, JSON.stringify(db)); }
function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
function session() { return db.sessions.find(s => s.id === db.currentSession) || db.sessions[0]; }

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 1600);
}

function beep(kind) {
  if (!db.settings.sound) return;
  const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  const now = ctx.currentTime;
  if (kind === "eight") { o.frequency.value = 740; g.gain.setValueAtTime(0.05, now); }
  else if (kind === "go") { o.frequency.value = 980; g.gain.setValueAtTime(0.06, now); }
  else { o.frequency.value = 420; g.gain.setValueAtTime(0.04, now); }
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  o.start(now); o.stop(now + 0.13);
}

function rand(arr) { return arr[(Math.random() * arr.length) | 0]; }

function generateScramble(eventId) {
  const ev = EVENTS[eventId] || EVENTS["333"];
  const pool = ev.faces.concat(ev.extra);
  const moves = [];
  let last = "", lastAxis = "";
  while (moves.length < ev.moves) {
    const face = rand(pool);
    const base = face[0];
    if (base === last) continue;
    if (OPP[base] && last && OPP[base] === last && lastAxis === base + last) continue;
    lastAxis = last ? [base, last].sort().join("") : "";
    last = base;
    moves.push(face + rand(MODS));
  }
  if (eventId === "pyram") {
    ["u", "l", "r", "b"].forEach(t => { if (Math.random() < 0.75) moves.push(t + rand(["", "'"])); });
  }
  return moves.join(" ");
}

function createCube() {
  const face = (c) => Array(9).fill(c);
  return { U: face("U"), D: face("D"), F: face("F"), B: face("B"), L: face("L"), R: face("R") };
}
function rotateFace(f, n) {
  const c = f.slice();
  const cycles = [0, 2, 8, 6], edges = [1, 5, 7, 3];
  for (let k = 0; k < n; k++) {
    const a = cycles.map(i => c[i]), b = edges.map(i => c[i]);
    cycles.forEach((i, idx) => c[i] = a[(idx + 3) % 4]);
    edges.forEach((i, idx) => c[i] = b[(idx + 3) % 4]);
  }
  return c;
}
function cycle(cube, strips, n) {
  for (let k = 0; k < n; k++) {
    const vals = strips.map(([f, i]) => cube[f][i]);
    strips.forEach(([f, i], idx) => { cube[f][i] = vals[(idx + 3) % strips.length]; });
  }
}
const MOVE_MAP = {
  U: { face: "U", strips: [["B",0],["B",1],["B",2],["R",0],["R",1],["R",2],["F",0],["F",1],["F",2],["L",0],["L",1],["L",2]] },
  D: { face: "D", strips: [["F",6],["F",7],["F",8],["R",6],["R",7],["R",8],["B",6],["B",7],["B",8],["L",6],["L",7],["L",8]] },
  F: { face: "F", strips: [["U",6],["U",7],["U",8],["R",0],["R",3],["R",6],["D",2],["D",1],["D",0],["L",8],["L",5],["L",2]] },
  B: { face: "B", strips: [["U",2],["U",1],["U",0],["L",0],["L",3],["L",6],["D",6],["D",7],["D",8],["R",8],["R",5],["R",2]] },
  L: { face: "L", strips: [["U",0],["U",3],["U",6],["F",0],["F",3],["F",6],["D",0],["D",3],["D",6],["B",8],["B",5],["B",2]] },
  R: { face: "R", strips: [["U",8],["U",5],["U",2],["B",0],["B",3],["B",6],["D",8],["D",5],["D",2],["F",8],["F",5],["F",2]] }
};
function applyMove(cube, token) {
  const prime = token.endsWith("'");
  const dbl = token.endsWith("2");
  const face = token.replace(/['2]/g, "");
  if (!MOVE_MAP[face]) return;
  const n = dbl ? 2 : prime ? 3 : 1;
  cube[MOVE_MAP[face].face] = rotateFace(cube[MOVE_MAP[face].face], n);
  const s = MOVE_MAP[face].strips;
  const groups = [0,1,2].map(off => [0,1,2,3].map(g => s[g * 3 + off]));
  groups.forEach(g => cycle(cube, g, n));
}
function applyScramble(str) {
  const cube = createCube();
  str.split(/\s+/).filter(Boolean).forEach(m => applyMove(cube, m));
  return cube;
}
function renderPreview(scramble, eventId) {
  const box = document.getElementById("preview");
  if (!["333", "333oh"].includes(eventId)) {
    box.innerHTML = `<div style="font-size:11px;color:var(--faint);letter-spacing:.12em;text-transform:uppercase">${EVENTS[eventId].name}</div>`;
    return;
  }
  const cube = applyScramble(scramble);
  const faceHtml = (f) => `<div class="face">${cube[f].map(c => `<i class="sticker" style="background:${COLORS[c]}"></i>`).join("")}</div>`;
  box.innerHTML = `<div class="net">
    <div class="empty"></div>${faceHtml("U")}<div class="empty"></div><div class="empty"></div>
    ${faceHtml("L")}${faceHtml("F")}${faceHtml("R")}${faceHtml("B")}
    <div class="empty"></div>${faceHtml("D")}<div class="empty"></div><div class="empty"></div>
  </div>`;
}

function formatTime(ms, forceMilli) {
  if (ms == null) return "—";
  if (!isFinite(ms)) return "DNF";
  const milli = forceMilli || db.settings.milli;
  const abs = Math.max(0, ms);
  const m = Math.floor(abs / 60000);
  const s = Math.floor((abs % 60000) / 1000);
  const cs = Math.floor((abs % 1000) / (milli ? 1 : 10));
  const frac = milli ? String(cs).padStart(3, "0") : String(cs).padStart(2, "0");
  if (m > 0) return `${m}:${String(s).padStart(2, "0")}.${frac}`;
  return `${s}.${frac}`;
}
function effective(solve) {
  if (!solve || solve.penalty === "DNF") return Infinity;
  return solve.time + (solve.penalty === "+2" ? 2000 : 0);
}
function displaySolve(solve) {
  if (!solve) return "—";
  if (solve.penalty === "DNF") return "DNF";
  const t = formatTime(effective(solve));
  return solve.penalty === "+2" ? t + "+" : t;
}
function average(list, n, dropEach) {
  if (list.length < n) return null;
  const slice = list.slice(-n).map(effective).sort((a, b) => a - b);
  const mid = slice.slice(dropEach, n - dropEach);
  if (mid.some(v => !isFinite(v))) return Infinity;
  return mid.reduce((a, b) => a + b, 0) / mid.length;
}
function mean(list) {
  if (!list.length) return null;
  const vals = list.map(effective);
  if (vals.some(v => !isFinite(v))) return Infinity;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
function bestOf(list) {
  const vals = list.map(effective).filter(isFinite);
  return vals.length ? Math.min(...vals) : null;
}
function worstOf(list) {
  if (!list.length) return null;
  const vals = list.map(effective);
  if (vals.some(v => !isFinite(v))) return Infinity;
  return Math.max(...vals);
}

function setTheme(theme) {
  db.settings.theme = theme;
  document.documentElement.setAttribute("data-theme", theme);
  document.querySelector('meta[name="theme-color"]').setAttribute("content", theme === "light" ? "#eef2f8" : "#07090f");
  save();
}

function fillSelects() {
  const ev = document.getElementById("eventSelect");
  ev.innerHTML = Object.entries(EVENTS).map(([id, e]) => `<option value="${id}">${e.name}</option>`).join("");
  ev.value = db.settings.event;
  const ss = document.getElementById("sessionSelect");
  ss.innerHTML = db.sessions.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
  ss.value = session().id;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function newScramble() {
  state.scramble = generateScramble(db.settings.event);
  document.getElementById("scrambleText").textContent = state.scramble;
  renderPreview(state.scramble, db.settings.event);
}

function renderStats() {
  const solves = session().solves;
  const cells = [
    ["Solves", String(solves.length)],
    ["Best", formatTime(bestOf(solves))],
    ["Worst", formatTime(worstOf(solves))],
    ["Mean", formatTime(mean(solves))]
  ];
  document.getElementById("statsGrid").innerHTML = cells.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join("");
  const avgs = [
    ["Mo3", mean(solves.slice(-3))],
    ["Ao5", average(solves, 5, 1)],
    ["Ao12", average(solves, 12, 1)],
    ["Ao50", average(solves, 50, 3)],
    ["Ao100", average(solves, 100, 5)],
    ["Session", mean(solves)]
  ];
  document.getElementById("avgGrid").innerHTML = avgs.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v == null ? "—" : formatTime(v)}</b></div>`).join("");
}

function renderList() {
  const solves = session().solves;
  document.getElementById("countLabel").textContent = solves.length;
  const box = document.getElementById("solveList");
  if (!solves.length) {
    box.innerHTML = `<div class="solve"><span class="idx"></span><span class="t" style="color:var(--faint)">No times yet</span></div>`;
    return;
  }
  box.innerHTML = solves.slice().reverse().map((s, i) => {
    const n = solves.length - i;
    const cls = s.penalty === "DNF" ? "dnf" : s.penalty === "+2" ? "plus" : "";
    const active = s.id === state.selectedId ? "active" : "";
    return `<div class="solve ${active}" data-id="${s.id}">
      <span class="idx">${n}</span>
      <span class="t ${cls}">${displaySolve(s)}</span>
      <span class="meta">${new Date(s.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
    </div>`;
  }).join("");
}

function showDetail(id) {
  const solve = session().solves.find(s => s.id === id);
  const dock = document.getElementById("detailDock");
  if (!solve) { dock.style.display = "none"; return; }
  state.selectedId = id;
  dock.style.display = "flex";
  document.getElementById("detailBody").innerHTML = `
    <div class="big">${displaySolve(solve)}</div>
    <div>Raw ${formatTime(solve.time, true)}</div>
    <div style="margin:8px 0;font-family:JetBrains Mono,monospace;color:var(--text)">${escapeHtml(solve.scramble)}</div>
    <div class="actions">
      <button class="btn warn" data-act="plus">+2</button>
      <button class="btn bad" data-act="dnf">DNF</button>
      <button class="btn good" data-act="ok">OK</button>
      <button class="btn" data-act="copy">Copy scramble</button>
      <button class="btn bad" data-act="del">Delete</button>
    </div>`;
  renderList();
}

function applyThemeClock(cls) {
  const clock = document.getElementById("clock");
  clock.className = cls || "";
}

function setPhase(phase, extra) {
  state.phase = phase;
  const pill = document.getElementById("statePill");
  const hint = document.getElementById("hint");
  const insp = db.settings.inspection;
  if (phase === "idle") {
    pill.textContent = "Ready";
    applyThemeClock("");
    hint.innerHTML = insp > 0
      ? `Tap or press <kbd>space</kbd> to start inspection`
      : (db.settings.hold ? `Hold <kbd>space</kbd> or the pad, then release` : `Tap or press <kbd>space</kbd> to start`);
  } else if (phase === "holding") {
    pill.textContent = "Hold";
    applyThemeClock("ready");
    hint.textContent = "Release to start";
  } else if (phase === "inspect") {
    pill.textContent = "Inspection";
    hint.textContent = "Tap or space when you start turning";
  } else if (phase === "running") {
    pill.textContent = "Solving";
    applyThemeClock("running");
    hint.textContent = "Tap or space to stop";
  } else if (phase === "stopped") {
    pill.textContent = extra || "Stopped";
    applyThemeClock("");
    hint.textContent = "Next scramble is ready";
  }
}

function startInspection() {
  clearTimers();
  const total = db.settings.inspection;
  if (!total) { startRun(); return; }
  state.inspectLeft = total;
  state.lastBeep = "";
  setPhase("inspect");
  const tick = () => {
    const over = Math.ceil(state.inspectLeft);
    const clock = document.getElementById("clock");
    if (state.inspectLeft > 0) {
      clock.textContent = String(Math.max(0, over));
      clock.className = state.inspectLeft <= 3 ? "danger" : state.inspectLeft <= 8 ? "warn" : "inspect";
      if (over === 8 && state.lastBeep !== "8") { beep("eight"); state.lastBeep = "8"; }
    } else if (state.inspectLeft > -2) {
      clock.textContent = "+2";
      clock.className = "warn";
    } else {
      clock.textContent = "DNF";
      clock.className = "danger";
    }
  };
  tick();
  const started = performance.now();
  state.inspectId = setInterval(() => {
    state.inspectLeft = total - (performance.now() - started) / 1000;
    tick();
  }, 50);
}

function startRun() {
  clearTimers();
  let penalty = null;
  if (db.settings.inspection > 0 && state.phase === "inspect") {
    if (state.inspectLeft <= -2) penalty = "DNF";
    else if (state.inspectLeft <= 0) penalty = "+2";
  }
  state.pendingPenalty = penalty;
  state.startAt = performance.now();
  setPhase("running");
  beep("go");
  const loop = () => {
    if (state.phase !== "running") return;
    state.current = performance.now() - state.startAt;
    document.getElementById("clock").textContent = formatTime(state.current);
    state.raf = requestAnimationFrame(loop);
  };
  state.raf = requestAnimationFrame(loop);
}

function stopRun() {
  if (state.phase !== "running") return;
  const time = performance.now() - state.startAt;
  clearTimers();
  const solve = {
    id: uid(),
    time: Math.round(time),
    penalty: state.pendingPenalty || null,
    scramble: state.scramble,
    event: db.settings.event,
    at: Date.now()
  };
  session().solves.push(solve);
  save();
  state.selectedId = solve.id;
  document.getElementById("clock").textContent = displaySolve(solve);
  setPhase("stopped", solve.penalty === "DNF" ? "DNF" : "Logged");
  renderStats(); renderList(); showDetail(solve.id);
  newScramble();
  setTimeout(() => { if (state.phase === "stopped") setPhase("idle"); }, 450);
}

function clearTimers() {
  if (state.inspectId) clearInterval(state.inspectId);
  if (state.holdTimer) clearTimeout(state.holdTimer);
  if (state.raf) cancelAnimationFrame(state.raf);
  state.inspectId = state.holdTimer = state.raf = 0;
}

function cancelInspect() {
  if (state.phase !== "inspect" && state.phase !== "holding") return;
  clearTimers();
  document.getElementById("clock").textContent = session().solves.length
    ? displaySolve(session().solves.at(-1))
    : "0.00";
  setPhase("idle");
}

function onDown(e) {
  if (isTyping(e)) return;
  if (e.repeat) return;
  if (state.phase === "running") return;
  if (state.phase === "inspect") return;
  if (state.phase === "stopped") return;
  if (db.settings.hold && (db.settings.inspection === 0 || state.phase === "idle")) {
    state.holdTimer = setTimeout(() => setPhase("holding"), 280);
  }
}
function onUp(e) {
  if (isTyping(e)) return;
  if (state.phase === "running") { stopRun(); return; }
  if (state.phase === "inspect") { startRun(); return; }
  if (state.phase === "holding") { startInspection(); return; }
  if (state.holdTimer) { clearTimeout(state.holdTimer); state.holdTimer = 0; }
  if (state.phase === "idle") {
    if (db.settings.hold && db.settings.inspection === 0) return;
    startInspection();
  }
}

function isTyping(e) {
  const el = e.target;
  return el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

function lastSolve() { return session().solves.at(-1); }
function setPenalty(solve, p) {
  if (!solve) return;
  solve.penalty = solve.penalty === p ? null : p;
  save(); renderStats(); renderList();
  if (state.selectedId === solve.id) showDetail(solve.id);
  if (solve === lastSolve() && state.phase === "idle") {
    document.getElementById("clock").textContent = displaySolve(solve);
  }
}
function deleteSolve(id) {
  const s = session();
  s.solves = s.solves.filter(x => x.id !== id);
  save();
  if (state.selectedId === id) {
    state.selectedId = null;
    document.getElementById("detailDock").style.display = "none";
  }
  renderStats(); renderList();
}

function exportCsv() {
  const rows = [["index", "time_ms", "display", "penalty", "scramble", "event", "when"]];
  session().solves.forEach((s, i) => {
    rows.push([i + 1, s.time, displaySolve(s), s.penalty || "", s.scramble, s.event, new Date(s.at).toISOString()]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${session().name.replace(/\s+/g, "_")}.csv`;
  a.click();
}

async function promptText(title, text, value) {
  const dlg = document.getElementById("promptDlg");
  document.getElementById("promptTitle").textContent = title;
  document.getElementById("promptText").textContent = text;
  const input = document.getElementById("promptInput");
  input.value = value || "";
  dlg.showModal();
  setTimeout(() => input.focus(), 30);
  return new Promise(resolve => {
    document.getElementById("promptForm").onsubmit = (e) => {
      e.preventDefault();
      const ok = e.submitter && e.submitter.value === "ok";
      dlg.close();
      resolve(ok ? input.value.trim() : null);
    };
  });
}

function bind() {
  const pad = document.getElementById("timerPad");
  pad.addEventListener("pointerdown", (e) => { if (e.button === 0) onDown(e); });
  pad.addEventListener("pointerup", (e) => { if (e.button === 0) onUp(e); });
  pad.addEventListener("pointercancel", cancelInspect);

  window.addEventListener("keydown", (e) => {
    if (isTyping(e)) return;
    if (e.code === "Space") { e.preventDefault(); onDown(e); }
    if (e.key === "Escape") cancelInspect();
    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      const last = lastSolve();
      if (last) deleteSolve(last.id);
    }
    if (e.key === "2") setPenalty(lastSolve(), "+2");
    if (e.key.toLowerCase() === "d") setPenalty(lastSolve(), "DNF");
    if (e.key.toLowerCase() === "n") newScramble();
  });
  window.addEventListener("keyup", (e) => {
    if (isTyping(e)) return;
    if (e.code === "Space") { e.preventDefault(); onUp(e); }
  });

  document.getElementById("eventSelect").onchange = (e) => {
    db.settings.event = e.target.value;
    save(); newScramble();
  };
  document.getElementById("sessionSelect").onchange = (e) => {
    db.currentSession = e.target.value;
    save(); renderAll();
  };
  document.getElementById("nextScrambleBtn").onclick = newScramble;
  document.getElementById("newSessionBtn").onclick = async () => {
    const name = await promptText("New session", "Name this practice session", "School practice");
    if (!name) return;
    const s = { id: uid(), name, event: db.settings.event, solves: [] };
    db.sessions.push(s);
    db.currentSession = s.id;
    save(); fillSelects(); renderAll();
  };
  document.getElementById("themeBtn").onclick = () => setTheme(db.settings.theme === "dark" ? "light" : "dark");
  document.getElementById("settingsBtn").onclick = () => document.getElementById("settingsDlg").showModal();
  document.getElementById("helpBtn").onclick = () => document.getElementById("helpDlg").showModal();
  document.getElementById("closeSettings").onclick = () => document.getElementById("settingsDlg").close();
  document.getElementById("closeHelp").onclick = () => document.getElementById("helpDlg").close();
  document.getElementById("inspSelect").onchange = (e) => { db.settings.inspection = Number(e.target.value); save(); setPhase("idle"); };
  document.getElementById("holdToggle").onchange = (e) => { db.settings.hold = e.target.checked; save(); setPhase("idle"); };
  document.getElementById("soundToggle").onchange = (e) => { db.settings.sound = e.target.checked; save(); };
  document.getElementById("milliToggle").onchange = (e) => { db.settings.milli = e.target.checked; save(); renderAll(); };
  document.getElementById("scrambleBox").onclick = async () => {
    try { await navigator.clipboard.writeText(state.scramble); toast("Scramble copied"); }
    catch { newScramble(); }
  };
  document.getElementById("scrambleBox").ondblclick = newScramble;
  document.getElementById("solveList").onclick = (e) => {
    const row = e.target.closest(".solve");
    if (row && row.dataset.id) showDetail(row.dataset.id);
  };
  document.getElementById("closeDetail").onclick = () => {
    state.selectedId = null;
    document.getElementById("detailDock").style.display = "none";
    renderList();
  };
  document.getElementById("detailBody").onclick = async (e) => {
    const act = e.target.dataset.act;
    const solve = session().solves.find(s => s.id === state.selectedId);
    if (!solve || !act) return;
    if (act === "plus") setPenalty(solve, "+2");
    if (act === "dnf") setPenalty(solve, "DNF");
    if (act === "ok") { solve.penalty = null; save(); renderStats(); renderList(); showDetail(solve.id); }
    if (act === "del") deleteSolve(solve.id);
    if (act === "copy") {
      await navigator.clipboard.writeText(solve.scramble);
      toast("Scramble copied");
    }
  };
  document.getElementById("exportBtn").onclick = exportCsv;
  document.getElementById("addBtn").onclick = async () => {
    const raw = await promptText("Add a time", "Type seconds like 12.45", "");
    if (!raw) return;
    const n = Number(raw);
    if (!isFinite(n) || n <= 0) return toast("Could not read that time");
    session().solves.push({ id: uid(), time: Math.round(n * 1000), penalty: null, scramble: state.scramble, event: db.settings.event, at: Date.now() });
    save(); renderAll(); newScramble();
  };
  document.getElementById("clearBtn").onclick = async () => {
    const ok = await promptText("Clear session", "Type CLEAR to delete every time in this session", "");
    if (ok !== "CLEAR") return;
    session().solves = [];
    save(); renderAll();
    document.getElementById("clock").textContent = "0.00";
  };
}

function renderAll() {
  fillSelects();
  renderStats();
  renderList();
  document.getElementById("inspSelect").value = String(db.settings.inspection);
  document.getElementById("holdToggle").checked = db.settings.hold;
  document.getElementById("soundToggle").checked = db.settings.sound;
  document.getElementById("milliToggle").checked = db.settings.milli;
  if (state.phase === "idle") {
    const last = lastSolve();
    document.getElementById("clock").textContent = last ? displaySolve(last) : "0.00";
  }
}

function init() {
  db.settings = { ...defaultSettings, ...db.settings };
  setTheme(db.settings.theme || "dark");
  fillSelects();
  bind();
  newScramble();
  renderAll();
  setPhase("idle");
}
init();
