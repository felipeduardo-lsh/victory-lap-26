/*
 * LATITUDE.SH / ARCADE INVITATION
 * Config, input, rendering and game state.
 * Rename the experience by changing CONFIG.title only.
 */
(() => {
  'use strict';

  const CONFIG = {
    title: "VICTORY LAP '26",
    duration: 45,
    eventDate: '2026-12-03',
    eventStart: '11:00',
    eventEnd: '16:00',
    venue: "Arena Pixel, R. Girassol, 925 - Vila Madalena, São Paulo - SP, 05433-002, Brazil",
    assets: {
      idle: 'assets/sprites/mascot-hover.png',
      move: 'assets/sprites/mascot-flight-c.png',
      fire: 'assets/sprites/mascot-fire-a.png', // Normal shot
      emp: 'assets/sprites/mascot-fire-b.png',  // EMP special
      victory: 'assets/logo-festa.svg'
    }
  };

  const IS_QA_MODE = new URLSearchParams(window.location.search).get('qa') === '1';

  const COLORS = {
    lime: '#E0FE56', dark: '#070800', red: '#E40046', blue: '#1AA0FF',
    orange: '#FF4901', purple: '#8261FB', white: '#F4F5F0'
  };
  document.addEventListener('latitude-theme-change', (event) => {
    COLORS.lime = event.detail?.light ? '#354500' : '#E0FE56';
  });

  const $ = (id) => document.getElementById(id);
  const canvas = $('gameCanvas');
  const ctx = canvas?.getContext('2d', { alpha: true });
  if (!canvas || !ctx) return;

  const ui = {
    hpBar: $('hudHpBar'), hpText: $('hudHpText'), timer: $('hudTimer'), countdown: $('countdownOverlay'), countdownNumber: $('countdownNumber'),
    empBar: $('hudOverclockBar'), empText: $('hudOverclockText'), killCount: $('killCount'),
    intro: $('prologueModal'), tutorial: $('tutorialModal'), victory: $('victoryModal'), gameOver: $('gameOverModal'),
    start: $('startMissionBtn'), storyNext: $('storyNextBtn'),
    storySlides: [...document.querySelectorAll('[data-story-slide]')],
    storyDots: [...document.querySelectorAll('[data-story-dot]')],
    begin: $('beginCombatBtn'), skipTraining: $('skipTrainingBtn'), skipGameplay: $('skipGameplayBtn'), retry: $('retryBtn'),
    gameOverStats: $('gameOverStats'),
    downloadIcs: $('downloadIcsBtn'), audioToggle: $('audioToggleBtn'), audioLabel: $('audioLabel'), audioIcon: $('audioIcon'),
    touchFire: $('touchFire'), touchEmp: $('touchEmp')
  };

  const googleCalendarLink = $('googleCalendarBtn');
  if (googleCalendarLink) {
    const start = `${CONFIG.eventDate.replace(/-/g, '')}T${CONFIG.eventStart.replace(':', '')}00`;
    const end = `${CONFIG.eventDate.replace(/-/g, '')}T${CONFIG.eventEnd.replace(':', '')}00`;
    const googleUrl = new URL('https://calendar.google.com/calendar/render');
    googleUrl.search = new URLSearchParams({
      action: 'TEMPLATE',
      text: "VICTORY LAP '26",
      dates: `${start}/${end}`,
      ctz: 'America/Sao_Paulo',
      details: "ARRIVAL TIME: 11:00 AM. Dress code: light summer clothing.",
      location: CONFIG.venue
    }).toString();
    googleCalendarLink.href = googleUrl.toString();
  }

  const images = {};
  function loadSprite(key, src) {
    if (typeof src !== 'string' || !src.trim()) return;
    const image = new Image();
    image.decoding = 'async';
    image.src = src;
    image.onload = () => { image.ready = true; };
    image.onerror = () => { image.ready = false; console.warn(`[game] Sprite unavailable: ${src}`); };
    images[key] = image;
  }
  for (const [key, src] of Object.entries(CONFIG.assets)) {
    loadSprite(key, src);
  }

  document.title = `LATITUDE.SH // ${CONFIG.title}`;
  const titleParts = CONFIG.title.split(':');
  const titlePrefix = titleParts.shift().trim();
  const titleSuffix = titleParts.join(':').trim();
  const titleMarkup = titleSuffix
    ? `${escapeHtml(titlePrefix)}: <span>${escapeHtml(titleSuffix)}</span>`
    : escapeHtml(CONFIG.title);
  document.querySelectorAll('[data-game-title]').forEach((node) => { node.innerHTML = titleMarkup; });

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  class AudioSystem {
    constructor() { this.context = null; this.enabled = true; }
    init() {
      if (!this.context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) this.context = new AudioContextClass();
      }
      if (this.context?.state === 'suspended') this.context.resume().catch(() => {});
    }
    tone({ frequency = 440, endFrequency = frequency, duration = 0.1, type = 'square', volume = 0.07 }) {
      if (!this.enabled || !this.context) return;
      const now = this.context.currentTime;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      if (endFrequency !== frequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration);
      gain.gain.setValueAtTime(volume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(gain);
      gain.connect(this.context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    }
    shot() { this.tone({ frequency: 760, endFrequency: 180, duration: .075, volume: .035 }); }
    hit() { this.tone({ frequency: 170, endFrequency: 55, duration: .16, type: 'sawtooth', volume: .1 }); }
    pickup() {
      this.tone({ frequency: 540, endFrequency: 810, duration: .09, volume: .06 });
      window.setTimeout(() => this.tone({ frequency: 810, endFrequency: 1080, duration: .1, volume: .05 }), 65);
    }
    blast() { this.tone({ frequency: 130, endFrequency: 520, duration: .42, type: 'triangle', volume: .09 }); }
    explosion() { this.tone({ frequency: 120, endFrequency: 42, duration: .12, type: 'triangle', volume: .035 }); }
    victory() {
      [440, 554, 659, 880].forEach((frequency, index) => {
        window.setTimeout(() => this.tone({ frequency, endFrequency: frequency, duration: .2, volume: .055 }), index * 105);
      });
    }
  }

  const audio = new AudioSystem();
  const world = { width: 0, height: 0, dpr: 1 };
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || false;
  const input = {
    up: false, down: false, left: false, right: false, fire: false,
    pointerDown: false, pointerX: 0, pointerY: 0,
    aimX: 0, aimY: 0
  };
  const state = {
    mode: 'BRIEFING', timeLeft: CONFIG.duration, kills: 0,
    spawnClock: 0, screenShake: 0, lastFrame: 0,
    empWave: null
  };
  let player;
  let projectiles = [];
  let enemies = [];
  let drops = [];
  let particles = [];

  function getArenaScale() {
    if (!world.width) return 1;
    return clamp(world.width / 820, 0.72, 1);
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const previousWidth = world.width;
    const previousHeight = world.height;
    const nextWidth = rect.width;
    const nextHeight = rect.height;

    world.dpr = Math.min(window.devicePixelRatio || 1, 2);
    world.width = nextWidth;
    world.height = nextHeight;
    canvas.width = Math.round(nextWidth * world.dpr);
    canvas.height = Math.round(nextHeight * world.dpr);
    ctx.setTransform(world.dpr, 0, 0, world.dpr, 0, 0);

    if (previousWidth > 0 && previousHeight > 0) {
      const scaleX = nextWidth / previousWidth;
      const scaleY = nextHeight / previousHeight;
      const scalePoint = (item) => {
        if (!item) return;
        if (Number.isFinite(item.x)) item.x *= scaleX;
        if (Number.isFinite(item.y)) item.y *= scaleY;
      };
      if (player) scalePoint(player);
      projectiles.forEach(scalePoint);
      enemies.forEach(scalePoint);
      drops.forEach(scalePoint);
      particles.forEach(scalePoint);
      if (state.empWave) {
        scalePoint(state.empWave);
        if (Number.isFinite(state.empWave.radius)) state.empWave.radius *= Math.min(scaleX, scaleY);
      }
    }
    if (player) player.clampToArena();
  }

  if (typeof ResizeObserver !== 'undefined') {
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);
  } else {
    window.addEventListener('resize', resizeCanvas);
  }
  window.addEventListener('orientationchange', () => window.setTimeout(resizeCanvas, 120));
  resizeCanvas();

  class Player {
    constructor() {
      const scale = getArenaScale();
      this.x = world.width / 2;
      this.y = world.height / 2;
      this.radius = Math.round(25 * scale);
      this.speed = 345 * (0.85 + 0.15 * scale);
      this.hp = 100;
      this.maxHp = 100;
      this.emp = 0;
      this.empTime = 0;
      this.hurtTime = 0;
      this.moveClock = 0;
      this.fireCooldown = 0;
      this.facing = 1;
      this.moving = false;
      this.firing = false;
      this.moveVector = { x: 1, y: 0 };
      this.aimVector = { x: 1, y: 0 };
    }
    clampToArena() {
      this.x = clamp(this.x, this.radius + 8, world.width - this.radius - 8);
      this.y = clamp(this.y, this.radius + 8, world.height - this.radius - 8);
    }
    update(dt) {
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
      this.hurtTime = Math.max(0, this.hurtTime - dt);
      if (this.empTime > 0) this.empTime = Math.max(0, this.empTime - dt);

      let dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      let dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
      const magnitude = Math.hypot(dx, dy);
      this.moving = magnitude > 0;
      if (magnitude > 0) {
        dx /= magnitude;
        dy /= magnitude;
        this.moveVector = { x: dx, y: dy };
        this.x += dx * this.speed * (this.empTime > 0 ? 1.22 : 1) * dt;
        this.y += dy * this.speed * (this.empTime > 0 ? 1.22 : 1) * dt;
        this.moveClock += dt;
        if (dx !== 0) this.facing = dx > 0 ? 1 : -1;
      }
      this.clampToArena();

      this.firing = input.fire || input.pointerDown;
      if (this.firing) this.aimVector = this.getShotVector();
      else if (this.moving) this.aimVector = this.moveVector;

      if (this.firing && this.fireCooldown <= 0) this.shoot();
    }
    getShotVector() {
      let dx = this.facing;
      let dy = 0;
      if (input.pointerDown) {
        const angle = Math.atan2(input.pointerY - this.y, input.pointerX - this.x);
        dx = Math.cos(angle);
        dy = Math.sin(angle);
      } else if (input.aimX || input.aimY) {
        const length = Math.hypot(input.aimX, input.aimY) || 1;
        dx = input.aimX / length;
        dy = input.aimY / length;
      }
      const length = Math.hypot(dx, dy) || 1;
      return { x: dx / length, y: dy / length };
    }
    shoot() {
      this.fireCooldown = .17;
      const direction = this.getShotVector();
      if (Math.abs(direction.x) > .1) this.facing = direction.x > 0 ? 1 : -1;
      this.aimVector = direction;
      projectiles.push(new Projectile(this.x + direction.x * 34, this.y + direction.y * 34, direction.x, direction.y));
      audio.shot();
    }
    activateEmp() {
      if (state.mode !== 'PLAYING' || this.emp < 100 || this.empTime > 0) return;
      this.emp = 0;
      this.empTime = 3.2;
      state.empWave = { radius: 0, life: .9, maxLife: .9 };
      state.screenShake = Math.max(state.screenShake, 4);
      audio.blast();
      enemies.forEach((enemy) => {
        burst(enemy.x, enemy.y, enemy.type.color, 9, 105);
        if (Math.random() < .55) drops.push(new MemoryDrop(enemy.x, enemy.y));
        state.kills += 1;
      });
      enemies = [];
      for (let i = 0; i < 34; i++) {
        const angle = (Math.PI * 2 * i) / 34;
        particles.push(new Particle(this.x, this.y, Math.cos(angle) * 120, Math.sin(angle) * 120, COLORS.blue, .48, 3));
      }
    }
    takeDamage(amount) {
      if (this.hurtTime > 0 || this.empTime > 0 || state.mode !== 'PLAYING') return;
      this.hp = Math.max(0, this.hp - amount);
      this.hurtTime = .72;
      state.screenShake = 5;
      audio.hit();
      if (this.hp <= 0) endGame(false);
    }
    draw() {
      const spriteKey = this.empTime > 0 ? 'emp'
        : this.firing ? 'fire'
        : this.moving ? 'move'
        : 'idle';
      const sprite = images[spriteKey];
      const facingLeft = this.firing ? this.aimVector.x < -.12 : this.facing < 0;
      const scale = getArenaScale();

      ctx.save();
      ctx.translate(this.x, this.y);
      if (facingLeft) ctx.scale(-1, 1);
      if (!this.moving && !this.firing && this.empTime <= 0) {
        ctx.translate(0, Math.sin(performance.now() / 360) * 2.5);
      }
      if (this.hurtTime > 0) ctx.globalAlpha = .78;
      if (sprite?.ready) {
        const box = Math.round((this.empTime > 0 ? 118 : 112) * scale);
        drawImageContain(sprite, -box / 2, -box / 2, box, box);
      } else {
        drawFallbackMascot();
      }
      if (this.empTime > 0) {
        const isExpiring = this.empTime < 0.8;
        const pulseAlpha = isExpiring ? (0.14 + Math.sin(performance.now() / 55) * 0.12) : 0.28;
        ctx.globalAlpha = Math.max(0.05, pulseAlpha);
        ctx.strokeStyle = COLORS.blue;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, (42 + (3.2 - this.empTime) * 10) * scale, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  class Projectile {
    constructor(x, y, dx, dy) {
      this.x = x; this.y = y; this.vx = dx * 900; this.vy = dy * 900;
      this.radius = 5; this.life = 1.15; this.dead = false;
    }
    update(dt) {
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.life -= dt;
      if (this.life <= 0 || this.x < -20 || this.x > world.width + 20 || this.y < -20 || this.y > world.height + 20) this.dead = true;
    }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.atan2(this.vy, this.vx));
      ctx.shadowColor = COLORS.lime;
      ctx.shadowBlur = 10;
      ctx.fillStyle = COLORS.lime;
      ctx.fillRect(-10, -2, 20, 4);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(-4, -1, 8, 2);
      ctx.restore();
    }
  }

  const ENEMY_TYPES = [
    { id: 'EGRESS_TAX', label: 'EGRESS TAX', radius: 20, speed: 142, hp: 1, color: COLORS.orange, damage: 12, score: 1 },
    { id: 'NOISY_NEIGHBOR', label: 'NOISY NEIGHBOR', radius: 28, speed: 102, hp: 2, color: COLORS.red, damage: 16, score: 2 },
    { id: 'MONOLITH', label: '2011 MONOLITH', radius: 39, speed: 69, hp: 4, color: COLORS.red, damage: 22, score: 4 }
  ];

  class Enemy {
    constructor(type) {
      const scale = getArenaScale();
      this.type = type;
      this.radius = Math.round(type.radius * scale);
      this.hp = type.hp;
      this.maxHp = type.hp;
      this.speed = type.speed * (0.82 + 0.18 * scale);
      this.dead = false;
      this.phase = Math.random() * Math.PI * 2;
      const edge = Math.floor(Math.random() * 4);
      if (edge === 0) { this.x = Math.random() * world.width; this.y = -this.radius - 8; }
      else if (edge === 1) { this.x = world.width + this.radius + 8; this.y = Math.random() * world.height; }
      else if (edge === 2) { this.x = Math.random() * world.width; this.y = world.height + this.radius + 8; }
      else { this.x = -this.radius - 8; this.y = Math.random() * world.height; }
    }
    update(dt) {
      const angle = Math.atan2(player.y - this.y, player.x - this.x);
      this.x += Math.cos(angle) * this.speed * dt;
      this.y += Math.sin(angle) * this.speed * dt;
      this.phase += dt * 2.2;
      if (distance(this.x, this.y, player.x, player.y) < this.radius + player.radius - 4) {
        player.takeDamage(this.type.damage);
        this.dead = true;
        burst(this.x, this.y, this.type.color, 10, 80);
      }
    }
    draw() {
      const pulse = Math.sin(this.phase) * 2;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.phase * .12);
      ctx.lineWidth = 2;
      ctx.fillStyle = 'rgba(7,8,0,.94)';
      ctx.strokeStyle = this.type.color;
      ctx.beginPath();
      const sides = this.type.id === 'MONOLITH' ? 8 : 6;
      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2;
        const radius = this.radius + (i % 2 ? -pulse : pulse);
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = this.type.color;
      ctx.fillRect(-this.radius * .32, -3, this.radius * .64, 6);
      ctx.fillStyle = document.body.classList.contains('light-mode') ? '#171910' : '#F4F5F0';
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(this.type.label, 0, -this.radius - 10);
      if (this.maxHp > 1) {
        ctx.fillStyle = '#26291F';
        ctx.fillRect(-17, this.radius + 7, 34, 3);
        ctx.fillStyle = this.type.color;
        ctx.fillRect(-17, this.radius + 7, 34 * (this.hp / this.maxHp), 3);
      }
      ctx.restore();
    }
  }

  class MemoryDrop {
    constructor(x, y) { this.x = x; this.y = y; this.radius = 11; this.phase = 0; this.dead = false; }
    update(dt) {
      this.phase += dt * 4;
      const d = distance(this.x, this.y, player.x, player.y);
      if (d < 150) {
        const angle = Math.atan2(player.y - this.y, player.x - this.x);
        this.x += Math.cos(angle) * 390 * dt;
        this.y += Math.sin(angle) * 390 * dt;
      }
      if (d < this.radius + player.radius + 5) {
        this.dead = true;
        player.emp = Math.min(100, player.emp + 22);
        audio.pickup();
      }
    }
    draw() {
      const pulse = 1 + Math.sin(this.phase) * .12;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(pulse, pulse);
      ctx.shadowColor = COLORS.lime;
      ctx.shadowBlur = 12;
      ctx.fillStyle = COLORS.lime;
      ctx.fillRect(-8, -6, 16, 12);
      ctx.fillStyle = COLORS.dark;
      ctx.fillRect(-4, -3, 8, 6);
      ctx.restore();
    }
  }

  class Particle {
    constructor(x, y, vx, vy, color, life, size) {
      this.x = x; this.y = y; this.vx = vx; this.vy = vy;
      this.color = color; this.life = life; this.maxLife = life; this.size = size;
      this.dead = false;
    }
    update(dt) {
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= Math.pow(.08, dt);
      this.vy *= Math.pow(.08, dt);
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = Math.max(0, this.life / this.maxLife);
      ctx.fillStyle = this.color;
      ctx.fillRect(this.x, this.y, this.size, this.size);
      ctx.restore();
    }
  }

  function drawFallbackMascot() {
    ctx.fillStyle = COLORS.lime;
    ctx.strokeStyle = COLORS.dark;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.dark;
    ctx.beginPath();
    ctx.ellipse(-10, -2, 5, 8, 0, 0, Math.PI * 2);
    ctx.ellipse(10, -2, 5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawImageContain(image, x, y, width, height) {
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  }

  function burst(x, y, color, count = 12, speed = 150) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = speed * (.35 + Math.random() * .65);
      particles.push(new Particle(x, y, Math.cos(angle) * velocity, Math.sin(angle) * velocity, color, .42 + Math.random() * .2, 3 + Math.random() * 2));
    }
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function distance(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }

  function resetGame() {
    resizeCanvas();
    player = new Player();
    projectiles = [];
    enemies = [];
    drops = [];
    particles = [];
    state.timeLeft = CONFIG.duration;
    state.kills = 0;
    state.spawnClock = .45;
    state.screenShake = 0;
    state.empWave = null;
    if (ui.countdown) ui.countdown.hidden = true;
    clearInput();
    updateHud();
  }

  function updateHud() {
    ui.hpBar.style.width = `${(player.hp / player.maxHp) * 100}%`;
    ui.hpText.textContent = `${Math.ceil(player.hp)}%`;
    ui.empBar.style.width = `${player.emp}%`;
    ui.empText.textContent = `${Math.round(player.emp)}%`;
    ui.killCount.textContent = String(state.kills).padStart(3, '0');
    const seconds = Math.max(0, state.timeLeft);
    const wholeSeconds = Math.floor(seconds);
    const tenths = Math.floor((seconds * 10) % 10);
    ui.timer.textContent = `00:${String(wholeSeconds).padStart(2, '0')}.${tenths}`;
    ui.timer.classList.toggle('urgent', seconds <= 10);
    const countdownValue = Math.ceil(seconds);
    const showCountdown = seconds > 0 && seconds <= 3;
    if (ui.countdown) {
      ui.countdown.hidden = !showCountdown;
      if (showCountdown && ui.countdownNumber && ui.countdownNumber.textContent !== String(countdownValue)) {
        ui.countdownNumber.textContent = String(countdownValue);
        ui.countdownNumber.style.animation = 'none';
        void ui.countdownNumber.offsetWidth;
        ui.countdownNumber.style.animation = '';
      }
    }
  }

  function updateSpawns(dt) {
    state.spawnClock -= dt;
    if (state.spawnClock > 0 || enemies.length >= 24) return;
    const elapsed = 1 - state.timeLeft / CONFIG.duration;
    const interval = Math.max(.52, 1.38 - elapsed * .72);
    state.spawnClock = interval;
    const roll = Math.random();
    const type = roll > .84 ? ENEMY_TYPES[2] : roll > .47 ? ENEMY_TYPES[1] : ENEMY_TYPES[0];
    enemies.push(new Enemy(type));
  }

  function update(dt) {
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      endGame(true);
      return;
    }
    updateSpawns(dt);
    player.update(dt);

    for (const projectile of projectiles) projectile.update(dt);
    for (const enemy of enemies) {
      enemy.update(dt);
      if (enemy.dead) continue;
      for (const projectile of projectiles) {
        if (projectile.dead) continue;
        if (distance(projectile.x, projectile.y, enemy.x, enemy.y) < projectile.radius + enemy.radius) {
          projectile.dead = true;
          enemy.hp -= 1;
          burst(projectile.x, projectile.y, enemy.type.color, 3, 45);
          if (enemy.hp <= 0) {
            enemy.dead = true;
            state.kills += 1;
            burst(enemy.x, enemy.y, enemy.type.color, enemy.type.id === 'MONOLITH' ? 22 : 12, 150);
            audio.explosion();
            if (Math.random() < .42) drops.push(new MemoryDrop(enemy.x, enemy.y));
          }
          break;
        }
      }
    }
    for (const drop of drops) drop.update(dt);
    for (const particle of particles) particle.update(dt);
    projectiles = projectiles.filter((item) => !item.dead);
    enemies = enemies.filter((item) => !item.dead);
    drops = drops.filter((item) => !item.dead);
    particles = particles.filter((item) => !item.dead);

    if (state.empWave) {
      state.empWave.life -= dt;
      state.empWave.radius += 580 * dt;
      if (state.empWave.life <= 0) state.empWave = null;
    }
    state.screenShake = Math.max(0, state.screenShake - dt * 18);
    updateHud();
  }

  function draw() {
    ctx.clearRect(0, 0, world.width, world.height);
    ctx.save();
    if (state.screenShake > .2 && !prefersReducedMotion) {
      const shake = state.screenShake;
      ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
    }
    drawArenaGrid();
    if (state.empWave) {
      const alpha = Math.max(0, state.empWave.life / state.empWave.maxLife) * .42;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = COLORS.blue;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(player.x, player.y, state.empWave.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.globalAlpha = alpha * .6;
      ctx.beginPath();
      ctx.arc(player.x, player.y, state.empWave.radius * .86, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    drops.forEach((item) => item.draw());
    projectiles.forEach((item) => item.draw());
    enemies.forEach((item) => item.draw());
    particles.forEach((item) => item.draw());
    player?.draw();
    ctx.restore();
  }

  function drawArenaGrid() {
    const grid = 60;
    const lightMode = document.body.classList.contains('light-mode');
    ctx.strokeStyle = lightMode ? 'rgba(7,8,0,.12)' : 'rgba(224,254,86,.07)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= world.width; x += grid) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, world.height); ctx.stroke();
    }
    for (let y = 0; y <= world.height; y += grid) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(world.width, y); ctx.stroke();
    }
    ctx.fillStyle = lightMode ? 'rgba(7,8,0,.24)' : 'rgba(224,254,86,.2)';
    for (let x = 20; x < world.width; x += grid) {
      for (let y = 20; y < world.height; y += grid) ctx.fillRect(x, y, 2, 2);
    }
  }

  function hideAllModals() {
    [ui.intro, ui.tutorial, ui.victory, ui.gameOver].forEach((modal) => {
      if (modal) modal.hidden = true;
    });
  }

  function showVictoryScreen() {
    hideAllModals();
    ui.victory.hidden = false;
    ui.downloadIcs?.focus({ preventScroll: true });
  }

  function endGame(won) {
    if (state.mode !== 'PLAYING') return;
    state.mode = won ? 'VICTORY' : 'GAMEOVER';
    clearInput();
    if (ui.skipGameplay) ui.skipGameplay.hidden = true;
    if (won) {
      audio.victory();
      showVictoryScreen();
    } else {
      hideAllModals();
      ui.gameOverStats.textContent = `THREATS CLEARED: ${String(state.kills).padStart(3, '0')}`;
      ui.gameOver.hidden = false;
      ui.retry?.focus({ preventScroll: true });
    }
  }

  // QA preview mode: available only when ?qa=1 is present in the URL.
  if (IS_QA_MODE) {
    let victoryCodeBuffer = '';
    let victoryCodeTimer = 0;
    function openVictoryPreview() {
      clearInput();
      ui.intro.hidden = true;
      ui.tutorial.hidden = true;
      ui.gameOver.hidden = true;
      state.mode = 'VICTORY';
      showVictoryScreen();
    }
    window.__VICTORY_LAP_SHOW_FINAL__ = openVictoryPreview;
    window.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName))) return;
      if (!/^[a-z]$/i.test(event.key)) return;
      victoryCodeBuffer = (victoryCodeBuffer + event.key.toLowerCase()).slice(-7);
      if (victoryCodeBuffer === 'victory') {
        victoryCodeBuffer = '';
        openVictoryPreview();
      }
      window.clearTimeout(victoryCodeTimer);
      victoryCodeTimer = window.setTimeout(() => { victoryCodeBuffer = ''; }, 2200);
    }, true);
  }

  let currentStoryIndex = 0;
  function showStoryChapter(index, moveFocus = false) {
    const last = ui.storySlides.length - 1;
    currentStoryIndex = Math.max(0, Math.min(last, index));
    ui.storySlides.forEach((slide, i) => {
      const active = i === currentStoryIndex;
      slide.classList.toggle('is-active', active);
      slide.hidden = !active;
      slide.setAttribute('aria-hidden', String(!active));
      slide.classList.remove('is-entering');
      if (active) {
        void slide.offsetWidth;
        slide.classList.add('is-entering');
      }
      const copy = slide.querySelector('.story-copy');
      if (active && copy) copy.scrollTop = 0;
    });
    const activeHeading = ui.storySlides[currentStoryIndex]?.querySelector('h1');
    if (activeHeading) {
      ui.intro.setAttribute('aria-labelledby', activeHeading.id);
      if (moveFocus) activeHeading.focus({ preventScroll: true });
    }
    ui.storyDots.forEach((dot, i) => {
      const active = i === currentStoryIndex;
      dot.classList.toggle('is-active', active);
      if (active) dot.setAttribute('aria-current', 'step');
      else dot.removeAttribute('aria-current');
    });
    const isLast = currentStoryIndex === last;
    if (ui.storyNext) ui.storyNext.hidden = isLast;
    if (ui.start) ui.start.hidden = !isLast;
  }

  function advanceStory() {
    if (currentStoryIndex < ui.storySlides.length - 1) showStoryChapter(currentStoryIndex + 1, true);
    else showTutorial();
  }

  function startCombat() {
    audio.init();
    hideAllModals();
    resetGame();
    state.mode = 'PLAYING';
    state.lastFrame = 0;
    if (ui.skipGameplay) ui.skipGameplay.hidden = false;
    canvas.focus?.();
  }

  function skipTraining() {
    clearInput();
    if (ui.skipGameplay) ui.skipGameplay.hidden = true;
    hideAllModals();
    state.mode = 'VICTORY';
    showVictoryScreen();
  }

  function showTutorial() {
    audio.init();
    hideAllModals();
    ui.tutorial.hidden = false;
    ui.begin?.focus({ preventScroll: true });
  }

  function gameLoop(timestamp) {
    const dt = state.lastFrame ? Math.min((timestamp - state.lastFrame) / 1000, .04) : 0;
    state.lastFrame = timestamp;
    if (state.mode === 'PLAYING') update(dt);
    draw();
    requestAnimationFrame(gameLoop);
  }

  function clearInput() {
    input.up = input.down = input.left = input.right = input.fire = false;
    input.pointerDown = false;
    document.querySelectorAll('.touch-btn.is-down').forEach((button) => button.classList.remove('is-down'));
  }

  function setDirection(key, isDown) {
    if (key === 'ArrowUp' || key === 'KeyW') input.up = isDown;
    if (key === 'ArrowDown' || key === 'KeyS') input.down = isDown;
    if (key === 'ArrowLeft' || key === 'KeyA') input.left = isDown;
    if (key === 'ArrowRight' || key === 'KeyD') input.right = isDown;
  }

  function refreshAimFromKeys() {
    const x = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const y = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    input.aimX = x;
    input.aimY = y;
  }

  window.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code) && state.mode === 'PLAYING') event.preventDefault();
    if (state.mode !== 'PLAYING') {
      if (!ui.intro.hidden) {
        const focusedControl = event.target?.closest?.('button, a, [role="button"]');
        if ((event.code === 'Enter' || event.code === 'Space') && focusedControl) return;
        if (event.code === 'ArrowRight' || event.code === 'Enter' || event.code === 'Space') {
          event.preventDefault();
          advanceStory();
        } else if (event.code === 'ArrowLeft') {
          event.preventDefault();
          showStoryChapter(currentStoryIndex - 1);
        }
      }
      return;
    }
    if (event.repeat && event.code === 'KeyE') return;
    setDirection(event.code, true);
    refreshAimFromKeys();
    if (event.code === 'Space') input.fire = true;
    if (event.code === 'KeyE') player.activateEmp();
  }, { passive: false });

  window.addEventListener('keyup', (event) => {
    setDirection(event.code, false);
    refreshAimFromKeys();
    if (event.code === 'Space') input.fire = false;
  });
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => { state.lastFrame = 0; if (document.hidden) clearInput(); });

  function updatePointer(event) {
    const rect = canvas.getBoundingClientRect();
    input.pointerX = event.clientX - rect.left;
    input.pointerY = event.clientY - rect.top;
  }
  canvas.addEventListener('pointermove', updatePointer);
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (state.mode !== 'PLAYING') return;
    updatePointer(event);
    input.pointerDown = true;
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointerup', () => { input.pointerDown = false; });
  canvas.addEventListener('pointercancel', () => { input.pointerDown = false; });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  document.querySelectorAll('[data-key]').forEach((button) => {
    const key = button.dataset.key;
    const down = (event) => {
      event.preventDefault();
      if (state.mode !== 'PLAYING') return;
      button.classList.add('is-down');
      setDirection(key, true);
      refreshAimFromKeys();
      button.setPointerCapture?.(event.pointerId);
    };
    const up = (event) => {
      event.preventDefault();
      button.classList.remove('is-down');
      setDirection(key, false);
      refreshAimFromKeys();
    };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
  });

  ui.touchFire?.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (state.mode !== 'PLAYING') return;
    input.fire = true;
    ui.touchFire.classList.add('is-down');
    ui.touchFire.setPointerCapture?.(event.pointerId);
  });
  const releaseFire = (event) => { event.preventDefault(); input.fire = false; ui.touchFire?.classList.remove('is-down'); };
  ui.touchFire?.addEventListener('pointerup', releaseFire);
  ui.touchFire?.addEventListener('pointercancel', releaseFire);
  ui.touchFire?.addEventListener('lostpointercapture', releaseFire);
  ui.touchEmp?.addEventListener('click', () => player?.activateEmp());

  ui.start?.addEventListener('click', showTutorial);
  ui.storyNext?.addEventListener('click', advanceStory);
  ui.storyDots.forEach((dot) => {
    dot.addEventListener('click', () => showStoryChapter(Number(dot.dataset.storyDot), true));
  });
  ui.begin?.addEventListener('click', startCombat);
  ui.skipTraining?.addEventListener('click', skipTraining);
  ui.skipGameplay?.addEventListener('click', skipTraining);
  ui.retry.addEventListener('click', startCombat);

  ui.audioToggle.addEventListener('click', () => {
    audio.enabled = !audio.enabled;
    ui.audioToggle.setAttribute('aria-pressed', String(audio.enabled));
    ui.audioLabel.textContent = audio.enabled ? 'AUDIO ACTIVE' : 'AUDIO MUTED';
    ui.audioIcon.textContent = audio.enabled ? '♫' : '×';
    if (audio.enabled) audio.init();
  });

  function icsEscape(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  }
  function downloadCalendar() {
    const now = new Date();
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const description = `ARRIVAL TIME: 11:00 AM. Dress code: light summer clothing.`;
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Latitude.sh//Arcade Invitation//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VTIMEZONE', 'TZID:America/Sao_Paulo', 'BEGIN:STANDARD', 'DTSTART:20190217T000000', 'TZOFFSETFROM:-0200', 'TZOFFSETTO:-0300', 'TZNAME:BRT', 'END:STANDARD', 'END:VTIMEZONE',
      'BEGIN:VEVENT', `UID:latitude-arcade-${CONFIG.eventDate}@latitude.sh`, `DTSTAMP:${stamp}`,
      `DTSTART;TZID=America/Sao_Paulo:${CONFIG.eventDate.replace(/-/g, '')}T${CONFIG.eventStart.replace(':', '')}00`,
      `DTEND;TZID=America/Sao_Paulo:${CONFIG.eventDate.replace(/-/g, '')}T${CONFIG.eventEnd.replace(':', '')}00`,
      `SUMMARY:${icsEscape("VICTORY LAP '26")}`,
      `DESCRIPTION:${icsEscape(description)}`,
      `LOCATION:${icsEscape(CONFIG.venue)}`,
      'URL:https://maps.app.goo.gl/dimSa2ssFywRghsR7',
      'STATUS:CONFIRMED',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:VICTORY LAP 26 starts in 1 hour', 'TRIGGER:-PT60M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ];
    const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Victory-Lap-2026.ics';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  ui.downloadIcs.addEventListener('click', downloadCalendar);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const dialog = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
      .find(node => !node.hidden && node.getClientRects().length);
    if (!dialog) return;
    const focusable = [...dialog.querySelectorAll(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter(node => node.getClientRects().length && !node.closest('[hidden]'));
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus?.();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  }, true);

  resetGame();
  state.mode = 'BRIEFING';
  showStoryChapter(0);
  requestAnimationFrame(gameLoop);
})();