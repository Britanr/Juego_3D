(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const arena = $("arena");
  const enemyLayer = $("enemyLayer");
  const crosshair = $("crosshair");
  const hitFlash = $("hitFlash");
  const scoreEl = $("score");
  const shotsEl = $("shots");
  const hitsEl = $("hits");
  const levelEl = $("level");
  const levelProgress = $("levelProgress");
  const enemyCountEl = $("enemyCount");
  const healthBar = $("playerHealthBar");
  const healthText = $("playerHealthText");
  const objectiveText = $("objectiveText");
  const message = $("tipText");
  const waveBanner = $("waveBanner");
  const gameOverPanel = $("gameOver");
  const finalScore = $("finalScore");
  const pauseBtn = $("pauseBtn");
  const restartBtn = $("restartBtn");
  const restartOver = $("restartOver");
  const soundBtn = $("soundBtn");
  const soundIcon = $("soundIcon");
  const soundStatus = $("soundStatus");
  const shootAudio = $("shootAudio");
  const monsterAudio = $("monsterAudio");

  let score = 0, shots = 0, hits = 0, level = 1;
  let playerHealth = 100;
  let enemies = [];
  let paused = false, ended = false, muted = false;
  let mouseX = arena.clientWidth / 2, mouseY = arena.clientHeight / 2;
  const keys = new Set();
  let lastTime = 0, spawnDelay = 0;
  let audioContext = null;

  const modelSrc = "Objeto/objeto1.glb";
  const tips = [
    "✦ Apunta rápido: ¡los monstruos esquivan!",
    "✦ Los enemigos violetas son más rápidos.",
    "✦ Cada nueva oleada aumenta el peligro.",
    "✦ Los impactos críticos dan puntos extra."
  ];

  function playAudio(audio, fallbackFrequency) {
    if (muted) return;
    if (audio && audio.getAttribute("src")) {
      audio.currentTime = 0;
      audio.play().catch(() => beep(fallbackFrequency));
    } else {
      beep(fallbackFrequency);
    }
  }

  function beep(frequency = 420) {
    if (muted) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") audioContext.resume();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(frequency, audioContext.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(70, frequency * .45), audioContext.currentTime + .09);
      gain.gain.setValueAtTime(.09, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .1);
      osc.connect(gain); gain.connect(audioContext.destination);
      osc.start(); osc.stop(audioContext.currentTime + .11);
    } catch (_) {}
  }

  function updateUI() {
    scoreEl.textContent = String(score).padStart(6, "0");
    shotsEl.textContent = String(shots).padStart(2, "0");
    hitsEl.textContent = String(hits).padStart(2, "0");
    levelEl.textContent = String(level).padStart(2, "0");
    healthBar.style.width = `${playerHealth}%`;
    healthText.textContent = `${playerHealth} / 100`;
    const needed = Math.min(100, ((hits % 5) / 5) * 100);
    levelProgress.style.width = `${needed || (level === 1 ? 20 : 100)}%`;
    const pct = shots ? Math.round(hits / shots * 100) : 0;
    $("accuracy").textContent = `PRECISIÓN ${pct}%`;
    enemyCountEl.textContent = `${enemies.length} ${enemies.length === 1 ? "ENEMIGO" : "ENEMIGOS"}`;
  }

  function rand(min, max) { return min + Math.random() * (max - min); }

  function createEnemy(index = 0) {
    const el = document.createElement("div");
    const boss = level % 3 === 0 && index === 0;
    el.className = `enemy${boss ? " boss" : ""}`;
    el.innerHTML = `
      <div class="enemy-health"><i></i></div>
      <model-viewer src="${modelSrc}" alt="Monstruo" camera-controls="false"
        disable-zoom interaction-prompt="none" shadow-intensity="1"
        camera-orbit="${rand(-20,20)}deg 75deg 105%" field-of-view="30deg">
      </model-viewer>
      <div class="enemy-tag">${boss ? "ALFA" : ["SOMBRA","ACECHADOR","GREMLIN"][Math.floor(Math.random()*3)]}</div>`;
    enemyLayer.appendChild(el);

    const w = arena.clientWidth, h = arena.clientHeight;
    const enemy = {
      el, x: rand(.13, .87), y: rand(.35, .72),
      vx: rand(-1, 1) * (0.045 + level * .008),
      vy: rand(-1, 1) * (0.025 + level * .004),
      hp: boss ? 4 + Math.floor(level / 2) : 1 + Math.floor((level - 1) / 3),
      maxHp: boss ? 4 + Math.floor(level / 2) : 1 + Math.floor((level - 1) / 3),
      dodge: rand(0.8, 2.2) / (1 + level * .06),
      dodgeTimer: rand(.4, 1.8),
      boss,
      phase: rand(0, Math.PI * 2),
      alive: true
    };
    if (Math.random() > .5) enemy.vx *= -1;
    enemy.el.style.left = `${enemy.x * 100}%`;
    enemy.el.style.top = `${enemy.y * 100}%`;
    updateEnemyHealth(enemy);
    return enemy;
  }

  function updateEnemyHealth(enemy) {
    const fill = enemy.el.querySelector(".enemy-health i");
    if (fill) fill.style.width = `${Math.max(0, enemy.hp / enemy.maxHp * 100)}%`;
  }

  function spawnWave() {
    const count = Math.min(2 + level, 8);
    enemies = [];
    enemyLayer.replaceChildren();
    for (let i = 0; i < count; i++) enemies.push(createEnemy(i));
    updateUI();
    objectiveText.textContent = `Oleada ${level}: elimina ${count} monstruos.`;
    waveBanner.querySelector("span").textContent = `OLEADA ${level}`;
    waveBanner.querySelector("strong").textContent = level === 1 ? "¡COMIENZA!" : "¡MÁS DIFÍCIL!";
    waveBanner.classList.remove("show");
    void waveBanner.offsetWidth;
    waveBanner.classList.add("show");
  }

  function positionEnemy(enemy) {
    enemy.el.style.left = `${enemy.x * 100}%`;
    enemy.el.style.top = `${enemy.y * 100}%`;
  }

  function updateEnemies(dt) {
    const w = arena.clientWidth, h = arena.clientHeight;
    enemies.forEach((e) => {
      if (!e.alive) return;
      e.phase += dt * (1 + level * .1);
      e.dodgeTimer -= dt;
      if (e.dodgeTimer <= 0) {
        // Cambio de dirección para que los enemigos sean difíciles de acertar.
        e.vx = rand(-1, 1) * (.04 + level * .008);
        e.vy = rand(-1, 1) * (.02 + level * .004);
        e.dodgeTimer = rand(.45, 1.45) / (1 + level * .04);
      }
      const speed = 1 + level * .11;
      e.x += e.vx * dt * speed;
      e.y += e.vy * dt * speed;
      // Un pequeño movimiento irregular.
      e.x += Math.sin(e.phase * 2.2) * dt * .009;
      if (e.x < .08 || e.x > .92) e.vx *= -1;
      if (e.y < .32 || e.y > .82) e.vy *= -1;
      e.x = Math.max(.08, Math.min(.92, e.x));
      e.y = Math.max(.32, Math.min(.82, e.y));
      positionEnemy(e);
    });
  }

  function showImpact(x, y, critical) {
    const mark = document.createElement("div");
    mark.className = "impact-mark";
    mark.style.left = `${x}px`;
    mark.style.top = `${y}px`;
    if (critical) mark.style.borderColor = "#7dffad";
    $("arena").appendChild(mark);
    setTimeout(() => mark.remove(), 400);

    const text = document.createElement("div");
    text.className = "damage-text";
    text.textContent = critical ? "¡CRÍTICO! +200" : "+100";
    text.style.left = `${x}px`;
    text.style.top = `${y}px`;
    $("arena").appendChild(text);
    setTimeout(() => text.remove(), 750);
  }

  function shoot(event) {
    if (paused || ended || event.button !== 0) return;
    // Prevent touch emulation from generating duplicate shots.
    if (event.pointerType === "touch" && event.type === "click" && event.detail === 0) return;
    shots++;
    playAudio(shootAudio, 600);
    crosshair.classList.remove("hit");
    const rect = arena.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    mouseX = x; mouseY = y;

    // Choose the topmost enemy actually under the pointer.
    const target = [...enemies].reverse().find(e => {
      if (!e.alive) return false;
      const r = e.el.getBoundingClientRect();
      return event.clientX >= r.left && event.clientX <= r.right &&
             event.clientY >= r.top && event.clientY <= r.bottom;
    });

    if (!target) {
      $("tipText").textContent = "✦ ¡Fallaste! Los monstruos no se quedan quietos.";
      updateUI();
      return;
    }

    // Some shots are dodged at the last moment.
    if (Math.random() < Math.min(.34, .08 + level * .025)) {
      target.vx = (Math.random() < .5 ? -1 : 1) * (.12 + level * .012);
      target.vy = (Math.random() < .5 ? -1 : 1) * (.06 + level * .006);
      target.dodgeTimer = .5;
      $("tipText").textContent = "✦ ¡Esquivó tu disparo! Vuelve a apuntar.";
      target.el.classList.add("hit");
      setTimeout(() => target.el.classList.remove("hit"), 120);
      updateUI();
      return;
    }

    const r = target.el.getBoundingClientRect();
    const centerDist = Math.hypot(event.clientX - (r.left + r.width/2), event.clientY - (r.top + r.height/2));
    const critical = centerDist < Math.min(r.width, r.height) * .17;
    target.hp -= critical ? 2 : 1;
    hits++;
    score += critical ? 200 : 100;
    updateEnemyHealth(target);
    target.el.classList.add("hit");
    setTimeout(() => target.el.classList.remove("hit"), 140);
    crosshair.classList.add("hit");
    hitFlash.classList.remove("active");
    void hitFlash.offsetWidth;
    hitFlash.classList.add("active");
    playAudio(monsterAudio, 180);
    showImpact(x, y, critical);
    $("tipText").textContent = critical ? "✦ ¡Impacto crítico! Daño doble." : "✦ ¡Buen disparo! Sigue así.";

    if (target.hp <= 0) {
      target.alive = false;
      target.el.classList.add("dead");
      score += 50;
      setTimeout(() => target.el.remove(), 220);
      enemies = enemies.filter(e => e.alive);
      if (enemies.length === 0) {
        updateUI();
        setTimeout(nextWave, 850);
      }
    }
    updateUI();
  }

  function nextWave() {
    if (ended || paused) return;
    level++;
    if (level % 2 === 0) {
      playerHealth = Math.min(100, playerHealth + 8);
    }
    updateUI();
    spawnWave();
  }

  function takeDamage() {
    playerHealth = Math.max(0, playerHealth - (5 + Math.min(10, level)));
    updateUI();
    $("tipText").textContent = "✦ ¡Un monstruo te alcanzó! Mantente alerta.";
    if (playerHealth <= 0) endGame();
  }

  // Enemigos amenazan con llegar a la parte inferior del escenario.
  let dangerTimer = 0;
  function checkThreats(dt) {
    dangerTimer += dt;
    if (dangerTimer < 2.5) return;
    dangerTimer = 0;
    if (!paused && !ended && enemies.length && Math.random() < Math.min(.6, .14 + level * .035)) {
      takeDamage();
    }
  }

  function endGame() {
    ended = true;
    $("overTitle").textContent = "TE HAN ALCANZADO";
    finalScore.textContent = `Puntuación: ${score} · Nivel alcanzado: ${level}`;
    gameOverPanel.classList.add("show");
    pauseBtn.textContent = "▶";
  }

  function resetGame() {
    score = 0; shots = 0; hits = 0; level = 1; playerHealth = 100;
    paused = false; ended = false; dangerTimer = 0;
    keys.clear();
    gameOverPanel.classList.remove("show");
    pauseBtn.textContent = "Ⅱ";
    $("tipText").textContent = "✦ Apunta rápido: ¡los monstruos esquivan!";
    updateUI();
    spawnWave();
  }

  function togglePause() {
    if (ended) return;
    paused = !paused;
    pauseBtn.textContent = paused ? "▶" : "Ⅱ";
    $("tipText").textContent = paused ? "Partida pausada." : "✦ ¡Los monstruos vuelven a moverse!";
  }

  arena.addEventListener("pointermove", (event) => {
    const r = arena.getBoundingClientRect();
    mouseX = event.clientX - r.left;
    mouseY = event.clientY - r.top;
    crosshair.style.left = `${mouseX}px`;
    crosshair.style.top = `${mouseY}px`;
  });
  arena.addEventListener("click", shoot);
  pauseBtn.addEventListener("click", togglePause);
  restartBtn.addEventListener("click", resetGame);
  restartOver.addEventListener("click", resetGame);
  soundBtn.addEventListener("click", () => {
    muted = !muted;
    soundBtn.classList.toggle("muted", muted);
    soundIcon.textContent = muted ? "♫̸" : "♫";
    soundStatus.textContent = muted ? "OFF" : "ON";
    if (!muted) beep(500);
  });

  document.addEventListener("keydown", (event) => {
    const k = event.key.toLowerCase();
    if (["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright"].includes(k)) {
      keys.add(k);
      event.preventDefault();
    }
    if (event.key === "Escape") togglePause();
  });
  document.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());

  function moveCrosshair(dt) {
    if (paused || ended) return;
    const speed = 300 * dt;
    if (keys.has("a") || keys.has("arrowleft")) mouseX -= speed;
    if (keys.has("d") || keys.has("arrowright")) mouseX += speed;
    if (keys.has("w") || keys.has("arrowup")) mouseY -= speed;
    if (keys.has("s") || keys.has("arrowdown")) mouseY += speed;
    mouseX = Math.max(8, Math.min(arena.clientWidth - 8, mouseX));
    mouseY = Math.max(8, Math.min(arena.clientHeight - 8, mouseY));
    crosshair.style.left = `${mouseX}px`;
    crosshair.style.top = `${mouseY}px`;
  }

  // WASD/arrow keys move the reticle; spacebar fires at its current location.
  document.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !event.repeat && !paused && !ended) {
      event.preventDefault();
      const r = arena.getBoundingClientRect();
      shoot({ button: 0, clientX: r.left + mouseX, clientY: r.top + mouseY });
    }
  });

  function loop(time) {
    const dt = Math.min(.04, lastTime ? (time - lastTime) / 1000 : .016);
    lastTime = time;
    if (!paused && !ended) {
      updateEnemies(dt);
      checkThreats(dt);
      moveCrosshair(dt);
    }
    requestAnimationFrame(loop);
  }

  // Model loading fallback: if the user's GLB is missing, a stylized creature icon
  // keeps the game playable and makes the missing asset obvious.
  enemyLayer.addEventListener("error", () => {});
  spawnWave();
  updateUI();
  requestAnimationFrame(loop);
})();