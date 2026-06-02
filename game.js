/* ============================================================
   GOMOKU — game.js
   Player vs AI · 10×10 · 5-in-a-row to win
   ============================================================ */
'use strict';

// ── Constants ──────────────────────────────────────────────────
const BOARD_SIZE   = 10;
const CELL_COUNT   = BOARD_SIZE;   // cells per row/col
const EMPTY        = 0;
const PLAYER       = 1;
const AI           = 2;
const WIN_COUNT    = 5;
const AI_DELAY_MS  = 500;

// ── Scene IDs ──────────────────────────────────────────────────
const SCENES = {
  intro:  document.getElementById('scene-intro'),
  game:   document.getElementById('scene-game'),
  result: document.getElementById('scene-result'),
};

// ============================================================
// PARTICLE SYSTEM
// ============================================================
class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this.particles = [];
    this.running   = false;
    this.raf       = null;
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _resize() {
    this.canvas.width  = this.canvas.offsetWidth  || window.innerWidth;
    this.canvas.height = this.canvas.offsetHeight || window.innerHeight;
  }

  spawnIntroParticles() {
    this.particles = [];
    const count = 80;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x:    Math.random() * this.canvas.width,
        y:    Math.random() * this.canvas.height,
        r:    Math.random() * 2.5 + 0.5,
        vx:   (Math.random() - 0.5) * 0.4,
        vy:   (Math.random() - 0.5) * 0.4,
        alpha: Math.random() * 0.6 + 0.2,
        color: Math.random() < 0.5 ? '#00f5d4' : '#f72585',
        type: 'float',
      });
    }
  }

  spawnBurst(cx, cy, color, count = 60) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.3;
      const speed = Math.random() * 6 + 2;
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        r:  Math.random() * 5 + 2,
        alpha: 1,
        color,
        type: 'burst',
        life: 1,
        decay: Math.random() * 0.025 + 0.015,
      });
    }
  }

  start() {
    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _loop() {
    if (!this.running) return;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this.particles = this.particles.filter(p => p.alpha > 0.01);

    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle   = p.color;
      ctx.shadowBlur  = 10;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      if (p.type === 'float') {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width)  p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
      } else {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;   // gravity
        p.alpha -= p.decay;
      }
    }

    this.raf = requestAnimationFrame(() => this._loop());
  }
}

// ============================================================
// BOARD RENDERER
// ============================================================
class BoardRenderer {
  constructor(canvas) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.cellSize = 0;
    this.margin   = 0;
    this.stones   = [];  // animated stone list
    this.winLine  = null;
    this.winAnim  = 0;
    this.raf      = null;
    this.running  = false;
  }

  resize(availW, availH) {
    const size = Math.floor(Math.min(availW, availH) * 0.96);
    this.canvas.width  = size;
    this.canvas.height = size;
    this.canvas.style.width  = size + 'px';
    this.canvas.style.height = size + 'px';

    // margin so grid lines sit nicely inset
    this.margin   = Math.floor(size / (CELL_COUNT + 1));
    this.cellSize = Math.floor((size - this.margin * 2) / (CELL_COUNT - 1));
  }

  gridToPixel(col, row) {
    return {
      x: this.margin + col * this.cellSize,
      y: this.margin + row * this.cellSize,
    };
  }

  pixelToGrid(px, py) {
    const col = Math.round((px - this.margin) / this.cellSize);
    const row = Math.round((py - this.margin) / this.cellSize);
    if (col < 0 || col >= CELL_COUNT || row < 0 || row >= CELL_COUNT) return null;
    return { col, row };
  }

  addStone(col, row, player) {
    this.stones.push({ col, row, player, scale: 0, targetScale: 1 });
  }

  setWinLine(cells) {
    this.winLine = cells;
    this.winAnim = 0;
  }

  start(board) {
    this.board   = board;
    this.running = true;
    this._loop();
  }

  stop() {
    this.running = false;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
  }

  _loop() {
    if (!this.running) return;
    this._render();
    this.raf = requestAnimationFrame(() => this._loop());
  }

  _render() {
    const { ctx, canvas, cellSize, margin } = this;
    const s = canvas.width;

    // ── Board background ────────────────────────────────────
    const bgGrad = ctx.createLinearGradient(0, 0, s, s);
    bgGrad.addColorStop(0, '#221a08');
    bgGrad.addColorStop(0.5, '#1a1208');
    bgGrad.addColorStop(1, '#120e06');
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.roundRect(0, 0, s, s, 10);
    ctx.fill();

    // subtle texture dots
    ctx.fillStyle = 'rgba(255,200,100,0.03)';
    for (let r = 0; r < CELL_COUNT; r++) {
      for (let c = 0; c < CELL_COUNT; c++) {
        const p = this.gridToPixel(c, r);
        if ((r + c) % 2 === 0) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, cellSize / 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // ── Grid lines ──────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255,210,120,0.30)';
    ctx.lineWidth   = 1;

    for (let i = 0; i < CELL_COUNT; i++) {
      const startH = this.gridToPixel(0, i);
      const endH   = this.gridToPixel(CELL_COUNT - 1, i);
      ctx.beginPath();
      ctx.moveTo(startH.x, startH.y);
      ctx.lineTo(endH.x,   endH.y);
      ctx.stroke();

      const startV = this.gridToPixel(i, 0);
      const endV   = this.gridToPixel(i, CELL_COUNT - 1);
      ctx.beginPath();
      ctx.moveTo(startV.x, startV.y);
      ctx.lineTo(endV.x,   endV.y);
      ctx.stroke();
    }

    // star points (like go board)
    const starPoints = [];
    const sp = [2, 4, 7, 9];
    for (const r of [2, 7]) for (const c of [2, 7]) starPoints.push([c, r]);
    starPoints.push([4, 4]);

    ctx.fillStyle = 'rgba(255,210,120,0.55)';
    for (const [c, r] of starPoints) {
      const p = this.gridToPixel(c, r);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Stones ──────────────────────────────────────────────
    // Animate scaling
    for (const st of this.stones) {
      if (st.scale < st.targetScale) {
        st.scale = Math.min(st.scale + 0.12, st.targetScale);
      }
    }

    for (const st of this.stones) {
      this._drawStone(st.col, st.row, st.player, st.scale);
    }

    // ── Win line ────────────────────────────────────────────
    if (this.winLine) {
      this.winAnim += 0.06;
      const pulse = 0.55 + 0.45 * Math.sin(this.winAnim * Math.PI * 2);

      ctx.save();
      ctx.globalAlpha  = pulse;
      ctx.strokeStyle  = '#ffd60a';
      ctx.lineWidth    = 5;
      ctx.lineCap      = 'round';
      ctx.shadowBlur   = 20;
      ctx.shadowColor  = '#ffd60a';

      const first = this.gridToPixel(this.winLine[0].col, this.winLine[0].row);
      const last  = this.gridToPixel(
        this.winLine[WIN_COUNT - 1].col,
        this.winLine[WIN_COUNT - 1].row
      );
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      ctx.lineTo(last.x,  last.y);
      ctx.stroke();

      // highlight each winning stone
      for (const cell of this.winLine) {
        const p = this.gridToPixel(cell.col, cell.row);
        ctx.beginPath();
        ctx.arc(p.x, p.y, cellSize * 0.38, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  _drawStone(col, row, player, scale = 1) {
    const { ctx, cellSize } = this;
    const p = this.gridToPixel(col, row);
    const r = cellSize * 0.40 * scale;
    if (r <= 0) return;

    ctx.save();
    ctx.translate(p.x, p.y);

    if (player === PLAYER) {
      // Black stone — dark blue-black metallic
      const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.05, 0, 0, r);
      grad.addColorStop(0,   '#7799dd');
      grad.addColorStop(0.4, '#223366');
      grad.addColorStop(1,   '#050510');
      ctx.shadowBlur  = 14;
      ctx.shadowColor = 'rgba(60,100,220,0.6)';
      ctx.fillStyle   = grad;
    } else {
      // White stone — pearlescent
      const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.05, 0, 0, r);
      grad.addColorStop(0,   '#ffffff');
      grad.addColorStop(0.5, '#d8d8f0');
      grad.addColorStop(1,   '#9090b8');
      ctx.shadowBlur  = 14;
      ctx.shadowColor = 'rgba(200,180,255,0.5)';
      ctx.fillStyle   = grad;
    }

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // shine highlight
    const shine = ctx.createRadialGradient(-r * 0.28, -r * 0.28, 0, -r * 0.28, -r * 0.28, r * 0.45);
    shine.addColorStop(0, 'rgba(255,255,255,0.55)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = shine;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// ============================================================
// AI ENGINE  (Heuristic scoring)
// ============================================================
const SCORE_TABLE = {
  5: 1_000_000,
  4: 50_000,
  3: 1_000,
  2: 50,
  1: 5,
};

function evaluateLine(board, col, row, dc, dr, player) {
  let count = 1;
  let openEnds = 0;

  // forward
  let c = col + dc, r = row + dr;
  while (c >= 0 && c < CELL_COUNT && r >= 0 && r < CELL_COUNT && board[r][c] === player) {
    count++; c += dc; r += dr;
  }
  if (c >= 0 && c < CELL_COUNT && r >= 0 && r < CELL_COUNT && board[r][c] === EMPTY) openEnds++;

  // backward
  c = col - dc; r = row - dr;
  while (c >= 0 && c < CELL_COUNT && r >= 0 && r < CELL_COUNT && board[r][c] === player) {
    count++; c -= dc; r -= dr;
  }
  if (c >= 0 && c < CELL_COUNT && r >= 0 && r < CELL_COUNT && board[r][c] === EMPTY) openEnds++;

  if (count >= WIN_COUNT) return SCORE_TABLE[5];
  if (openEnds === 0) return 0;   // blocked both ends

  const base = SCORE_TABLE[Math.min(count, 4)] ?? 0;
  return openEnds === 2 ? base : Math.floor(base / 3);
}

const DIRS = [[1,0],[0,1],[1,1],[1,-1]];

function scorePosition(board, col, row, player) {
  let score = 0;
  for (const [dc, dr] of DIRS) {
    score += evaluateLine(board, col, row, dc, dr, player);
  }
  // center bonus
  const cx = Math.floor(CELL_COUNT / 2);
  score += Math.max(0, 3 - Math.abs(col - cx) - Math.abs(row - cx));
  return score;
}

function getBestMove(board) {
  let bestScore = -Infinity;
  let bestMoves = [];

  for (let r = 0; r < CELL_COUNT; r++) {
    for (let c = 0; c < CELL_COUNT; c++) {
      if (board[r][c] !== EMPTY) continue;

      // Skip if no neighbor within 2
      let hasNeighbor = false;
      outer:
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < CELL_COUNT && nc >= 0 && nc < CELL_COUNT && board[nr][nc] !== EMPTY) {
            hasNeighbor = true; break outer;
          }
        }
      }
      // always allow center at start
      const mid = Math.floor(CELL_COUNT / 2);
      if (!hasNeighbor && !(r === mid && c === mid)) continue;

      // Temporarily place AI stone
      board[r][c] = AI;
      const attackScore = scorePosition(board, c, r, AI);
      board[r][c] = EMPTY;

      // Temporarily place PLAYER stone (defense)
      board[r][c] = PLAYER;
      const defenseScore = scorePosition(board, c, r, PLAYER);
      board[r][c] = EMPTY;

      const total = attackScore * 1.1 + defenseScore;

      if (total > bestScore) {
        bestScore = total;
        bestMoves = [{ col: c, row: r }];
      } else if (total === bestScore) {
        bestMoves.push({ col: c, row: r });
      }
    }
  }

  if (bestMoves.length === 0) {
    // fallback: any empty cell
    for (let r = 0; r < CELL_COUNT; r++)
      for (let c = 0; c < CELL_COUNT; c++)
        if (board[r][c] === EMPTY) return { col: c, row: r };
    return null;
  }

  return bestMoves[Math.floor(Math.random() * bestMoves.length)];
}

// ============================================================
// WIN CHECKER
// ============================================================
function checkWin(board, col, row, player) {
  for (const [dc, dr] of DIRS) {
    const cells = [{ col, row }];

    for (let s = 1; s < WIN_COUNT; s++) {
      const c = col + dc * s, r = row + dr * s;
      if (c < 0 || c >= CELL_COUNT || r < 0 || r >= CELL_COUNT || board[r][c] !== player) break;
      cells.push({ col: c, row: r });
    }
    for (let s = 1; s < WIN_COUNT; s++) {
      const c = col - dc * s, r = row - dr * s;
      if (c < 0 || c >= CELL_COUNT || r < 0 || r >= CELL_COUNT || board[r][c] !== player) break;
      cells.push({ col: c, row: r });
    }

    if (cells.length >= WIN_COUNT) {
      // sort for consistent line drawing
      cells.sort((a, b) => a.col - b.col || a.row - b.row);
      return cells.slice(0, WIN_COUNT);
    }
  }
  return null;
}

function isBoardFull(board) {
  return board.every(row => row.every(cell => cell !== EMPTY));
}

// ============================================================
// GAME MANAGER
// ============================================================
class GameManager {
  constructor() {
    // Canvases
    this.particleCanvas       = document.getElementById('particle-canvas');
    this.boardCanvas          = document.getElementById('board-canvas');
    this.resultParticleCanvas = document.getElementById('result-particle-canvas');

    // Renderers
    this.introPS  = new ParticleSystem(this.particleCanvas);
    this.resultPS = new ParticleSystem(this.resultParticleCanvas);
    this.renderer = new BoardRenderer(this.boardCanvas);

    // State
    this.board        = [];
    this.currentTurn  = PLAYER;
    this.gameOver     = false;
    this.aiThinking   = false;
    this.moveCount    = 0;
    this.scores       = { [PLAYER]: 0, [AI]: 0 };

    // UI refs
    this.turnBadge    = document.getElementById('turn-badge');
    this.turnText     = document.getElementById('turn-text');
    this.moveCountEl  = document.getElementById('move-count');
    this.scorePl      = document.getElementById('score-player');
    this.scoreAI      = document.getElementById('score-ai');
    this.turnPlInd    = document.getElementById('turn-player');
    this.turnAIInd    = document.getElementById('turn-ai');
    this.boardOverlay = document.getElementById('board-overlay');

    this._bindEvents();
    this._showScene('intro');
    this.introPS.spawnIntroParticles();
    this.introPS.start();

    window.addEventListener('resize', () => this._onResize());
  }

  // ── Scene Transitions ──────────────────────────────────────
  _showScene(name) {
    const current = document.querySelector('.scene.active');
    if (current && current !== SCENES[name]) {
      current.classList.add('exit');
      setTimeout(() => current.classList.remove('exit', 'active'), 400);
    }
    SCENES[name].classList.add('active');
    this.currentScene = name;
  }

  // ── Events ─────────────────────────────────────────────────
  _bindEvents() {
    document.getElementById('btn-start').addEventListener('click', () => this._startGame());
    document.getElementById('btn-restart-game').addEventListener('click', () => this._startGame());
    document.getElementById('btn-play-again').addEventListener('click', () => {
      this.resultPS.stop();
      this._showScene('intro');
    });
    this.boardCanvas.addEventListener('click', (e) => this._onBoardClick(e));
    this.boardCanvas.addEventListener('mousemove', (e) => this._onBoardHover(e));
    this.boardCanvas.addEventListener('mouseleave', () => this._clearHover());
  }

  _onResize() {
    if (this.currentScene === 'game') {
      this._resizeBoard();
      this.renderer._render();
    }
  }

  // ── Game Start ─────────────────────────────────────────────
  _startGame() {
    // Reset board
    this.board = Array.from({ length: CELL_COUNT }, () => Array(CELL_COUNT).fill(EMPTY));
    this.gameOver    = false;
    this.aiThinking  = false;
    this.moveCount   = 0;
    this.hoverCell   = null;

    // Random first turn
    this.currentTurn = Math.random() < 0.5 ? PLAYER : AI;

    // Reset renderer
    this.renderer.stones  = [];
    this.renderer.winLine = null;
    this._clearOverlay();

    // Switch scene
    this._showScene('game');

    // Start render loop
    setTimeout(() => {
      this._resizeBoard();
      this.renderer.start(this.board);
      this._updateHUD();

      // If AI goes first
      if (this.currentTurn === AI) {
        this._scheduleAI();
      }
    }, 100);
  }

  _resizeBoard() {
    const container = document.querySelector('.board-container');
    const w = container.offsetWidth;
    const h = container.offsetHeight;
    this.renderer.resize(w, h);
  }

  // ── Player Input ───────────────────────────────────────────
  _onBoardClick(e) {
    if (this.gameOver || this.aiThinking || this.currentTurn !== PLAYER) return;
    const rect = this.boardCanvas.getBoundingClientRect();
    const px   = e.clientX - rect.left;
    const py   = e.clientY - rect.top;
    const cell = this.renderer.pixelToGrid(px, py);
    if (!cell) return;
    if (this.board[cell.row][cell.col] !== EMPTY) return;

    this._placeStone(cell.col, cell.row, PLAYER);
  }

  _onBoardHover(e) {
    if (this.gameOver || this.aiThinking || this.currentTurn !== PLAYER) return;
    const rect = this.boardCanvas.getBoundingClientRect();
    const cell = this.renderer.pixelToGrid(e.clientX - rect.left, e.clientY - rect.top);
    if (!cell) { this._clearHover(); return; }
    if (this.board[cell.row][cell.col] !== EMPTY) { this._clearHover(); return; }
    this.boardCanvas.style.cursor = 'pointer';
    this._setHover(cell.col, cell.row);
  }

  _clearHover() {
    this.boardCanvas.style.cursor = 'crosshair';
    this._setHover(null, null);
  }

  _setHover(col, row) {
    // draw a ghost stone in the render loop
    this.renderer.hoverCol = col;
    this.renderer.hoverRow = row;
  }

  // ── Stone Placement ────────────────────────────────────────
  _placeStone(col, row, player) {
    this.board[row][col] = player;
    this.moveCount++;
    this.renderer.addStone(col, row, player);

    const winCells = checkWin(this.board, col, row, player);
    if (winCells) {
      this.gameOver = true;
      this.renderer.setWinLine(winCells);
      this.scores[player]++;
      this._updateHUD();
      setTimeout(() => this._showResult(player), 1500);
      return;
    }

    if (isBoardFull(this.board)) {
      this.gameOver = true;
      setTimeout(() => this._showResult(null), 1000);
      return;
    }

    // Switch turn
    this.currentTurn = player === PLAYER ? AI : PLAYER;
    this._updateHUD();

    if (this.currentTurn === AI) {
      this._scheduleAI();
    }
  }

  _scheduleAI() {
    this.aiThinking = true;
    this._updateHUD();
    setTimeout(() => this._doAIMove(), AI_DELAY_MS);
  }

  _doAIMove() {
    if (this.gameOver) return;
    const move = getBestMove(this.board);
    this.aiThinking = false;
    if (move) {
      this._placeStone(move.col, move.row, AI);
    }
  }

  // ── HUD Update ─────────────────────────────────────────────
  _updateHUD() {
    this.scorePl.textContent = this.scores[PLAYER];
    this.scoreAI.textContent = this.scores[AI];
    this.moveCountEl.textContent = this.moveCount;

    if (this.gameOver) {
      this.turnText.textContent = '게임 종료';
      this.turnBadge.className  = 'turn-badge';
      this.turnPlInd.className  = 'hud-turn-indicator';
      this.turnAIInd.className  = 'hud-turn-indicator';
      return;
    }

    if (this.aiThinking) {
      this.turnText.textContent = 'AI 생각 중...';
      this.turnBadge.className  = 'turn-badge ai-turn';
      this.turnPlInd.className  = 'hud-turn-indicator';
      this.turnAIInd.className  = 'hud-turn-indicator active-ai';
    } else if (this.currentTurn === PLAYER) {
      this.turnText.textContent = '당신의 차례';
      this.turnBadge.className  = 'turn-badge player-turn';
      this.turnPlInd.className  = 'hud-turn-indicator active-player';
      this.turnAIInd.className  = 'hud-turn-indicator';
    } else {
      this.turnText.textContent = 'AI 차례';
      this.turnBadge.className  = 'turn-badge ai-turn';
      this.turnPlInd.className  = 'hud-turn-indicator';
      this.turnAIInd.className  = 'hud-turn-indicator active-ai';
    }
  }

  _clearOverlay() {
    this.boardOverlay.textContent = '';
    this.boardOverlay.classList.remove('show-msg');
  }

  // ── Result Screen ──────────────────────────────────────────
  _showResult(winner) {
    this.renderer.stop();

    const icon    = document.getElementById('result-icon');
    const title   = document.getElementById('result-title');
    const sub     = document.getElementById('result-sub');
    const s1      = document.getElementById('res-stone-1');
    const sw      = document.getElementById('res-stone-winner');
    const s2      = document.getElementById('res-stone-2');

    if (winner === PLAYER) {
      icon.textContent   = '🏆';
      title.textContent  = '당신의 승리!';
      title.className    = 'result-title win-player';
      sub.textContent    = '훌륭합니다! AI를 이겼습니다.';
      sw.className       = 'res-stone winner-stone black-stone cyan-glow';
      s1.className       = 'res-stone white-stone';
      s2.className       = 'res-stone white-stone';
      this._burstResultParticles('#00f5d4');
    } else if (winner === AI) {
      icon.textContent   = '🤖';
      title.textContent  = 'AI의 승리!';
      title.className    = 'result-title win-ai';
      sub.textContent    = '아쉽네요! 다시 도전해보세요.';
      sw.className       = 'res-stone winner-stone white-stone pink-glow';
      s1.className       = 'res-stone black-stone';
      s2.className       = 'res-stone black-stone';
      this._burstResultParticles('#f72585');
    } else {
      icon.textContent   = '🤝';
      title.textContent  = '무승부!';
      title.className    = 'result-title draw';
      sub.textContent    = '막상막하의 대결이었습니다.';
      sw.className       = 'res-stone winner-stone';
      sw.style.background = 'radial-gradient(circle at 35% 35%, #ffd60a, #996600)';
      sw.style.boxShadow  = '0 0 20px #ffd60a, 0 0 50px rgba(255,214,10,0.5)';
      s1.className       = 'res-stone black-stone';
      s2.className       = 'res-stone white-stone';
      this._burstResultParticles('#ffd60a');
    }

    this._showScene('result');
    this.resultPS.spawnIntroParticles();
    this.resultPS.start();
  }

  _burstResultParticles(color) {
    setTimeout(() => {
      const cx = this.resultParticleCanvas.offsetWidth  / 2;
      const cy = this.resultParticleCanvas.offsetHeight / 2;
      this.resultPS._resize();
      this.resultPS.spawnBurst(cx, cy, color, 80);
      this.resultPS.start();
    }, 200);
  }
}

// ── Patch BoardRenderer to draw hover ghost ────────────────
const _origRender = BoardRenderer.prototype._render;
BoardRenderer.prototype._render = function() {
  _origRender.call(this);

  // draw ghost hover stone
  if (this.hoverCol !== null && this.hoverCol !== undefined) {
    const { ctx } = this;
    const p = this.gridToPixel(this.hoverCol, this.hoverRow);
    const r = this.cellSize * 0.40;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.shadowBlur  = 12;
    ctx.shadowColor = '#00f5d4';
    const grad = ctx.createRadialGradient(-r*0.3, -r*0.3, r*0.05, 0, 0, r);
    grad.addColorStop(0, '#7799dd');
    grad.addColorStop(1, '#050510');
    ctx.fillStyle = grad;
    ctx.translate(p.x, p.y);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
};

// ── Bootstrap ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  window.gomoku = new GameManager();
});
