const gridEl = document.getElementById("slotGrid");
const canvas = document.getElementById("lineCanvas");
const ctx = canvas.getContext("2d");
const spinBtn = document.getElementById("spinBtn");
const resetBtn = document.getElementById("resetBtn");
const minusBet = document.getElementById("minusBet");
const plusBet = document.getElementById("plusBet");
const creditsEl = document.getElementById("credits");
const betDisplay = document.getElementById("betDisplay");
const winEl = document.getElementById("win");
const messageEl = document.getElementById("message");
const playerNameEl = document.getElementById("playerName");
const leaderboardEl = document.getElementById("leaderboard");
const clearBoardBtn = document.getElementById("clearBoard");
const shareBtn = document.getElementById("shareBtn");
const machine = document.querySelector(".machine");

const cfg = window.SLOT_CONFIG || {};
const hasSupabase = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
const STARTING_CREDITS = 10000;
const STORAGE_PREFIX = "slotV10";

function supabaseHeaders(includeJson = false) {
  const headers = { "apikey": cfg.SUPABASE_ANON_KEY };
  if (includeJson) headers["Content-Type"] = "application/json";
  return headers;
}

const symbols = [
  { id:"yellow", img:"images/yellow-owl.png", name:"Yellow Owl", weight:12 },
  { id:"blue", img:"images/blue-pirate-owl.png", name:"Blue Pirate Owl", weight:12 },
  { id:"clown", img:"images/red-hair-owl.jpg", name:"Clown Owl", weight:11 },
  { id:"king", img:"images/king-owl.jpg", name:"King Owl", weight:11 },
  { id:"pink", img:"images/pink-full-owl.jpg", name:"Pink Owl", weight:11 },
  { id:"dreads", img:"images/dreads-owl.png", name:"Dreads Owl", weight:10 },
  { id:"gray", img:"images/gray-owl.png", name:"Gray Owl", weight:10 },
  { id:"logo", img:"images/project-logo.jpg", name:"Project Logo", weight:13, logo:true }
];

const paylines = [
  [0,1,2], [3,4,5], [6,7,8],
  [0,3,6], [1,4,7], [2,5,8],
  [0,4,8], [2,4,6]
];

let credits = STARTING_CREDITS;
let score = 0;
let bet = Number(localStorage.getItem(`${STORAGE_PREFIX}:bet`) || 100);
let current = [];
let spinning = false;
let lastWin = 0;
let winningLines = [];
let activeName = "";
let globalOnline = false;
let lastGlobalError = "";

function cleanName(name) {
  return (name || "Anon").replace(/[^\w .@-]/g, "").slice(0, 18) || "Anon";
}

function playerKey(name, field) {
  return `${STORAGE_PREFIX}:${cleanName(name).toLowerCase()}:${field}`;
}

function loadPlayerState(showMessage = false) {
  const name = cleanName(playerNameEl.value);
  activeName = name;
  localStorage.setItem(`${STORAGE_PREFIX}:activeName`, name);

  credits = Number(localStorage.getItem(playerKey(name, "credits")) || STARTING_CREDITS);
  score = Number(localStorage.getItem(playerKey(name, "score")) || 0);
  lastWin = 0;
  winningLines = [];
  updateUI();

  if (showMessage) {
    messageEl.textContent = `${name} loaded. ${credits.toLocaleString("en-US")} credits available.`;
  }
}

function savePlayerState() {
  const name = cleanName(playerNameEl.value);
  localStorage.setItem(`${STORAGE_PREFIX}:activeName`, name);
  localStorage.setItem(playerKey(name, "credits"), credits);
  localStorage.setItem(playerKey(name, "score"), score);
  localStorage.setItem(`${STORAGE_PREFIX}:bet`, bet);
}

function weightedRandom() {
  const total = symbols.reduce((sum, s) => sum + s.weight, 0);
  let roll = Math.random() * total;
  for (const symbol of symbols) {
    roll -= symbol.weight;
    if (roll <= 0) return symbol;
  }
  return symbols[symbols.length - 1];
}

function createGrid() {
  gridEl.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("div");
    cell.className = "cell";
    cell.innerHTML = `<div class="inner"></div>`;
    gridEl.appendChild(cell);
  }
  current = Array.from({length: 9}, () => weightedRandom());
  renderGrid();
}

function renderGrid() {
  const flatWinners = winningLines.flat();
  Array.from(gridEl.children).forEach((cell, i) => {
    const symbol = current[i];
    const inner = cell.querySelector(".inner");
    cell.classList.toggle("win-cell", flatWinners.includes(i));
    const extraClass = symbol.logo ? ' class="logo-symbol"' : '';
    inner.innerHTML = `<img src="${symbol.img}" alt="${symbol.name}"${extraClass}>`;
  });
  drawLines();
}

function updateUI() {
  creditsEl.textContent = credits.toLocaleString("en-US");
  betDisplay.textContent = bet.toLocaleString("en-US");
  winEl.textContent = lastWin.toLocaleString("en-US");
  savePlayerState();
}

function isGameOver() {
  return credits < bet;
}

function spin() {
  if (spinning) return;

  const currentName = cleanName(playerNameEl.value);
  if (currentName !== activeName) loadPlayerState(true);

  if (isGameOver()) {
    messageEl.textContent = `GAME OVER for ${currentName}. Final score: ${score.toLocaleString("en-US")}. No reset/refill in challenge mode.`;
    return;
  }

  spinning = true;
  lastWin = 0;
  winningLines = [];
  credits -= bet;
  updateUI();
  machine.classList.remove("flash");
  messageEl.textContent = "Spinning...";
  Array.from(gridEl.children).forEach(cell => cell.classList.add("spinning"));

  let ticks = 0;
  const interval = setInterval(() => {
    current = Array.from({length: 9}, () => weightedRandom());
    renderGrid();
    ticks++;
    if (ticks > 15) {
      clearInterval(interval);
      setTimeout(finishSpin, 180);
    }
  }, 95);
}

async function finishSpin() {
  Array.from(gridEl.children).forEach(cell => cell.classList.remove("spinning"));
  current = Array.from({length: 9}, () => weightedRandom());
  const result = evaluateWin();
  winningLines = result.lines;
  lastWin = result.win;

  if (lastWin > 0) {
    credits += lastWin;
    score += lastWin;
    machine.classList.add("flash");
    if (window.playWinSound) window.playWinSound();
    messageEl.textContent = isGameOver()
      ? `WIN +${lastWin.toLocaleString("en-US")} credits! GAME OVER. Final score: ${score.toLocaleString("en-US")}.`
      : `WIN! ${result.lines.length} line(s) · +${lastWin.toLocaleString("en-US")} credits`;
    await saveLeaderboard();
  } else {
    messageEl.textContent = isGameOver()
      ? `No line. GAME OVER. Final score: ${score.toLocaleString("en-US")}. No reset/refill in challenge mode.`
      : "No line. Spin again.";
  }

  renderGrid();
  updateUI();
  await renderLeaderboard();
  spinning = false;
}

function evaluateWin() {
  const lines = [];
  for (const line of paylines) {
    const [a, b, c] = line;
    if (current[a].id === current[b].id && current[b].id === current[c].id) {
      lines.push(line);
    }
  }
  if (!lines.length) return { win: 0, lines: [] };

  let multiplier = 0;
  for (const line of lines) {
    const id = current[line[0]].id;
    if (id === "logo") multiplier += 14;
    else if (id === "king" || id === "yellow" || id === "blue") multiplier += 9;
    else multiplier += 7;
  }

  const diag1 = lines.some(line => line.join(",") === "0,4,8");
  const diag2 = lines.some(line => line.join(",") === "2,4,6");
  if (diag1 && diag2) multiplier += 12;

  return { win: bet * multiplier, lines };
}

function resizeCanvas() {
  const rect = gridEl.getBoundingClientRect();
  const width = Math.floor(rect.width);
  const height = Math.floor(rect.height);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function drawLines() {
  resizeCanvas();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!winningLines.length) return;

  const w = canvas.width;
  const h = canvas.height;
  const centers = [
    [w * 1/6, h * 1/6], [w * 3/6, h * 1/6], [w * 5/6, h * 1/6],
    [w * 1/6, h * 3/6], [w * 3/6, h * 3/6], [w * 5/6, h * 3/6],
    [w * 1/6, h * 5/6], [w * 3/6, h * 5/6], [w * 5/6, h * 5/6]
  ];

  ctx.lineWidth = Math.max(7, w * 0.016);
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,216,115,.95)";
  ctx.shadowColor = "rgba(255,79,216,.95)";
  ctx.shadowBlur = 16;

  for (const line of winningLines) {
    ctx.beginPath();
    const [first, ...rest] = line;
    ctx.moveTo(...centers[first]);
    rest.forEach(i => ctx.lineTo(...centers[i]));
    ctx.stroke();
  }
}

async function saveLeaderboard() {
  const name = cleanName(playerNameEl.value);

  const localList = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}:leaderboard`) || "[]");
  const index = localList.findIndex(item => item.name.toLowerCase() === name.toLowerCase());
  const entry = { name, score, credits, lastWin, date: new Date().toISOString() };
  if (index >= 0) {
    if (score > localList[index].score) localList[index] = entry;
  } else {
    localList.push(entry);
  }
  localList.sort((a, b) => b.score - a.score || b.credits - a.credits);
  localStorage.setItem(`${STORAGE_PREFIX}:leaderboard`, JSON.stringify(localList.slice(0, 10)));

  if (!hasSupabase) return;
  try {
    const existing = await getPlayerGlobalScore(name);
    if (existing && Number(existing.score) >= score) return;

    const payload = JSON.stringify({ name, score, credits, last_win: lastWin });
    const url = existing
      ? `${cfg.SUPABASE_URL}/rest/v1/slot_scores?id=eq.${existing.id}`
      : `${cfg.SUPABASE_URL}/rest/v1/slot_scores`;
    const method = existing ? "PATCH" : "POST";

    const response = await fetch(url, {
      method,
      headers: {
        ...supabaseHeaders(true),
        "Prefer": "return=minimal"
      },
      body: payload
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${method} ${response.status}: ${text}`);
    }

    globalOnline = true;
    lastGlobalError = "";
  } catch (error) {
    globalOnline = false;
    lastGlobalError = String(error.message || error);
    console.warn("Global leaderboard save/update failed:", error);
    messageEl.textContent = `Local saved. GLOBAL failed: ${lastGlobalError.slice(0, 90)}`;
  }
}

async function getPlayerGlobalScore(name) {
  if (!hasSupabase) return null;
  try {
    const response = await fetch(`${cfg.SUPABASE_URL}/rest/v1/slot_scores?select=id,name,score,credits,last_win&name=eq.${encodeURIComponent(name)}&order=score.desc&limit=1`, {
      headers: supabaseHeaders(false)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GET PLAYER ${response.status}: ${text}`);
    }
    const data = await response.json();
    return data[0] || null;
  } catch (error) {
    lastGlobalError = String(error.message || error);
    console.warn("Player score load failed:", error);
    return null;
  }
}

async function getGlobalLeaderboard() {
  if (!hasSupabase) return null;
  try {
    const response = await fetch(`${cfg.SUPABASE_URL}/rest/v1/slot_scores?select=name,score,credits,last_win,created_at&order=score.desc&order=credits.desc&limit=100`, {
      headers: supabaseHeaders(false)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GET GLOBAL ${response.status}: ${text}`);
    }
    const rows = await response.json();
    globalOnline = true;
    lastGlobalError = "";
    const bestByName = new Map();
    for (const row of rows) {
      const key = String(row.name).toLowerCase();
      if (!bestByName.has(key) || Number(row.score) > Number(bestByName.get(key).score)) {
        bestByName.set(key, row);
      }
    }
    return Array.from(bestByName.values())
      .sort((a,b) => Number(b.score) - Number(a.score) || Number(b.credits) - Number(a.credits))
      .slice(0, 25);
  } catch (error) {
    globalOnline = false;
    lastGlobalError = String(error.message || error);
    console.warn("Global leaderboard load failed:", error);
    return null;
  }
}

async function renderLeaderboard() {
  leaderboardEl.innerHTML = "";
  const globalList = await getGlobalLeaderboard();
  if (globalList && globalList.length) {
    globalList.forEach(item => {
      const li = document.createElement("li");
      li.textContent = `${item.name} · ${Number(item.score).toLocaleString("en-US")} pts · ${Number(item.credits).toLocaleString("en-US")} credits left`;
      leaderboardEl.appendChild(li);
    });
    return;
  }

  if (globalOnline && globalList && !globalList.length) {
    leaderboardEl.innerHTML = "<li>Global leaderboard is online. No global wins yet.</li>";
    return;
  }

  if (!globalOnline && hasSupabase) {
    leaderboardEl.innerHTML = `<li>GLOBAL OFFLINE / BLOCKED: ${lastGlobalError.slice(0, 120)}</li>`;
    return;
  }

  const localList = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}:leaderboard`) || "[]");
  if (!localList.length) {
    leaderboardEl.innerHTML = "<li>No wins yet. Be first.</li>";
    return;
  }

  localList.forEach(item => {
    const li = document.createElement("li");
    li.textContent = `${item.name} · ${item.score.toLocaleString("en-US")} pts · ${item.credits.toLocaleString("en-US")} credits left`;
    leaderboardEl.appendChild(li);
  });
}

function changeBet(direction) {
  const bets = [50, 100, 250, 500, 1000];
  let idx = bets.indexOf(bet);
  if (idx === -1) idx = 1;
  idx = Math.max(0, Math.min(bets.length - 1, idx + direction));
  bet = bets[idx];
  updateUI();
}

function resetGame() {
  messageEl.textContent = "Reset/refill is disabled in challenge mode. Change X username only if this is a different player.";
}

function shareOnX() {
  const name = cleanName(playerNameEl.value);
  const text = `I just played 10K Lucky Spin as ${name} and scored ${score.toLocaleString("en-US")} points. Best run counts. 10K community fun only.`;
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
}

spinBtn.addEventListener("click", spin);
minusBet.addEventListener("click", () => changeBet(-1));
plusBet.addEventListener("click", () => changeBet(1));
if (resetBtn) resetBtn.addEventListener("click", resetGame);
if (clearBoardBtn) {
  clearBoardBtn.disabled = true;
  clearBoardBtn.textContent = "LOCKED";
  clearBoardBtn.title = "Leaderboard deletion is disabled.";
  clearBoardBtn.addEventListener("click", () => {
    messageEl.textContent = "Leaderboard is locked. Scores cannot be deleted.";
  });
}
shareBtn.addEventListener("click", shareOnX);
window.addEventListener("resize", drawLines);
playerNameEl.addEventListener("change", () => loadPlayerState(true));
playerNameEl.addEventListener("blur", () => loadPlayerState(false));

const savedName = localStorage.getItem(`${STORAGE_PREFIX}:activeName`) || localStorage.getItem("slotV9:activeName") || localStorage.getItem("slotV8:activeName") || localStorage.getItem("slotV7Name") || localStorage.getItem("slotV4Name") || "";
if (savedName) playerNameEl.value = savedName;

loadPlayerState(false);
createGrid();
updateUI();
renderLeaderboard();
