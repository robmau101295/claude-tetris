'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const recordsListEl = document.getElementById('records-list');
const recordsStatsEl = document.getElementById('records-stats');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const overlayRecords = document.getElementById('overlay-records');
const recordMsgEl = document.getElementById('record-msg');
const overlayRecordsListEl = document.getElementById('overlay-records-list');
const overlayRecordsStatsEl = document.getElementById('overlay-records-stats');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const nameSaveBtn = document.getElementById('name-save-btn');

const THEME_KEY = 'tetris-theme';
let gridColor = '#22222e';

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const isLight = theme === 'light';
  themeToggle.setAttribute('aria-pressed', String(isLight));
  themeToggle.setAttribute('aria-label', isLight ? 'Cambiar a tema oscuro' : 'Cambiar a tema claro');
  themeToggle.textContent = isLight ? '🌙 Tema oscuro' : '☀️ Tema claro';
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || gridColor;
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* almacenamiento no disponible */ }
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, combo;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  trackCombo(clearLines());
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  if (gameOver) return;
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
  showGameOverRecords();
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  combo = 0;
  hideGameOverRecords();
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return; // no atajos al escribir el nombre
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

themeToggle.addEventListener('click', () => {
  const isLight = document.documentElement.dataset.theme === 'light';
  applyTheme(isLight ? 'dark' : 'light');
  themeToggle.blur(); // evita que Space (hard drop) active el botón
  // repintar aunque el juego esté en pausa o terminado
  draw();
  drawNext();
});

// ---- Records ----
const RECORDS_KEY = 'tetris.records';
const MAX_RECORDS = 5;
let recordsData = loadRecords();
let pendingScore = null;     // { score, lines } si el game over espera nombre
let highlightRecord = null;  // entrada del top a resaltar

function loadRecords() {
  const empty = { top: [], bestCombo: 0, maxLines: 0 };
  try {
    const raw = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (!raw || typeof raw !== 'object') return empty;
    const top = Array.isArray(raw.top) ? raw.top
      .filter(r => r && Number.isFinite(r.score))
      .map(r => ({
        name: String(r.name || '').slice(0, 10),
        score: r.score,
        lines: Number.isFinite(r.lines) ? r.lines : 0,
        date: String(r.date || ''),
      }))
      .sort((a, b) => b.score - a.score).slice(0, MAX_RECORDS) : [];
    return {
      top,
      bestCombo: Number.isFinite(raw.bestCombo) ? raw.bestCombo : 0,
      maxLines: Number.isFinite(raw.maxLines) ? raw.maxLines : 0,
    };
  } catch (e) { return empty; }
}

function saveRecords() {
  try { localStorage.setItem(RECORDS_KEY, JSON.stringify(recordsData)); } catch (e) { /* ignorar */ }
}

function qualifiesForTop(sc) {
  return sc > 0 && (recordsData.top.length < MAX_RECORDS ||
    sc > recordsData.top[recordsData.top.length - 1].score);
}

// Combo = bloqueos consecutivos que limpian al menos una línea.
function trackCombo(cleared) {
  if (!cleared) { combo = 0; return; }
  combo++;
  if (combo > recordsData.bestCombo) {
    recordsData.bestCombo = combo;
    saveRecords();
    renderRecords();
  }
}

function fillRecordsList(listEl, statsEl) {
  listEl.textContent = '';
  if (!recordsData.top.length) {
    const li = document.createElement('li');
    li.className = 'records-empty';
    li.textContent = 'Sin records';
    listEl.appendChild(li);
  }
  recordsData.top.forEach((r, i) => {
    const li = document.createElement('li');
    if (r === highlightRecord) li.className = 'records-current';
    const pos = document.createElement('span');
    pos.textContent = (i + 1) + '.';
    const name = document.createElement('span');
    name.className = 'records-name';
    name.textContent = r.name || '---';
    const sc = document.createElement('span');
    sc.className = 'records-score';
    sc.textContent = r.score.toLocaleString();
    li.append(pos, name, sc);
    li.title = r.lines + ' líneas' + (r.date ? ' · ' + r.date : '');
    listEl.appendChild(li);
  });
  statsEl.textContent = `Mejor combo: ${recordsData.bestCombo} · Líneas máx.: ${recordsData.maxLines}`;
}

function renderRecords() {
  fillRecordsList(recordsListEl, recordsStatsEl);
  fillRecordsList(overlayRecordsListEl, overlayRecordsStatsEl);
}

function showGameOverRecords() {
  if (lines > recordsData.maxLines) {
    recordsData.maxLines = lines;
    saveRecords();
  }
  highlightRecord = null;
  pendingScore = null;
  if (qualifiesForTop(score)) {
    pendingScore = { score, lines };
    recordMsgEl.textContent = '¡Entras en el top 5! Escribe tu nombre:';
    nameInput.value = '';
    nameEntry.classList.remove('hidden');
  } else {
    recordMsgEl.textContent = '';
    nameEntry.classList.add('hidden');
  }
  renderRecords();
  overlayRecords.classList.remove('hidden');
  if (pendingScore) setTimeout(() => nameInput.focus(), 150); // evita que un Space mantenido se escriba
}

function hideGameOverRecords() {
  pendingScore = null;
  highlightRecord = null;
  nameEntry.classList.add('hidden');
  overlayRecords.classList.add('hidden');
  renderRecords();
}

function confirmName() {
  if (!pendingScore) return;
  const entry = {
    name: nameInput.value.trim().slice(0, 10) || 'Anónimo',
    score: pendingScore.score,
    lines: pendingScore.lines,
    date: new Date().toISOString().slice(0, 10),
  };
  pendingScore = null;
  recordsData.top.push(entry);
  recordsData.top.sort((a, b) => b.score - a.score);
  recordsData.top = recordsData.top.slice(0, MAX_RECORDS);
  highlightRecord = entry;
  saveRecords();
  nameEntry.classList.add('hidden');
  recordMsgEl.textContent = '¡Record guardado!';
  renderRecords();
  nameInput.blur();
}

nameSaveBtn.addEventListener('click', confirmName);
nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') confirmName(); });
resetRecordsBtn.addEventListener('click', () => {
  resetRecordsBtn.blur(); // evita que Space (hard drop) reactive el botón
  if (!confirm('¿Seguro que quieres borrar todos los records?')) return;
  recordsData = { top: [], bestCombo: 0, maxLines: 0 };
  highlightRecord = null;
  pendingScore = null;
  nameEntry.classList.add('hidden');
  recordMsgEl.textContent = '';
  saveRecords();
  renderRecords();
});
// ---- Fin Records ----

let savedTheme = 'dark';
try { savedTheme = localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'; } catch (e) { /* ignorar */ }
applyTheme(savedTheme);

init();
