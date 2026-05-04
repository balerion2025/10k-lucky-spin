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

let credits = Number(localStorage.getItem("slotV4Credits") || 10000);
let score = Number(localStorage.getItem("slotV4Score") || 0);
let bet = Number(localStorage.getItem("slotV4Bet") || 100);
let current = [];
let spinning = false;
let lastWin = 0;
let winningLines = [];

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

  localStorage.setItem("slotV4Credits", credits);
  localStorage.setItem("slotV4Score", score);
  localStorage.setItem("slotV4Bet", bet);
}

function cleanName(name) {
  return (name || "Anon").replace(/[^\w .@-]/g, "").slice(0, 18) || "Anon";
}

function spin() {
  if (spinning) return;
  if (credits < bet) {
    messageEl.textContent = "Not enough credits. Hit reset.";
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

function finishSpin() {
  Array.from(gridEl.children).forEach(cell => cell.classList.remove("spinning"));
  current = Array.from({length: 9}, () => weightedRandom());

  const result = evaluateWin();
  winningLines = result.lines;
  lastWin = result.win;

  if (lastWin > 0) {
    credits += lastWin;
    score += lastWin;
    machine.classList.add("flash");
    messageEl.textContent = `WIN! ${result.lines.length} line(s) · +${lastWin.toLocaleString("en-US")}`;
    saveLeaderboard();
  } else {
    messageEl.textContent = "No line. Spin again.";
  }

  renderGrid();
  updateUI();
  renderLeaderboard();
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

function saveLeaderboard() {
  const name = cleanName(playerNameEl.value);
  localStorage.setItem("slotV4Name", name);

  const list = JSON.parse(localStorage.getItem("slotV4Leaderboard") || "[]");
  const index = list.findIndex(item => item.name.toLowerCase() === name.toLowerCase());
  const entry = { name, score, credits, date: new Date().toISOString() };

  if (index >= 0) {
    if (score > list[index].score) list[index] = entry;
  } else {
    list.push(entry);
  }

  list.sort((a, b) => b.score - a.score || b.credits - a.credits);
  localStorage.setItem("slotV4Leaderboard", JSON.stringify(list.slice(0, 10)));
}

function renderLeaderboard() {
  const list = JSON.parse(localStorage.getItem("slotV4Leaderboard") || "[]");
  leaderboardEl.innerHTML = "";
  if (!list.length) {
    leaderboardEl.innerHTML = "<li>No wins yet. Be first.</li>";
    return;
  }
  list.forEach(item => {
    const li = document.createElement("li");
    li.textContent = `${item.name} · ${item.score.toLocaleString("en-US")} pts · ${item.credits.toLocaleString("en-US")} credits`;
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
  credits = 10000;
  score = 0;
  lastWin = 0;
  winningLines = [];
  messageEl.textContent = "Reset done. Ready again.";
  updateUI();
  renderGrid();
}

function shareOnX() {
  const name = cleanName(playerNameEl.value);
  const text = `I just played 10K Lucky Spin as ${name} and scored ${score.toLocaleString("en-US")} points. Match 3 on horizontal, vertical, or diagonal lines. 10K community fun only.`;
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank");
}

spinBtn.addEventListener("click", spin);
minusBet.addEventListener("click", () => changeBet(-1));
plusBet.addEventListener("click", () => changeBet(1));
resetBtn.addEventListener("click", resetGame);
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
playerNameEl.addEventListener("change", () => {
  localStorage.setItem("slotV4Name", cleanName(playerNameEl.value));
});

const savedName = localStorage.getItem("slotV4Name");
if (savedName) playerNameEl.value = savedName;

createGrid();
updateUI();
renderLeaderboard();
