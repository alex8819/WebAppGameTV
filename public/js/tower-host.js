/**
 * Tower Defense Host - Citadel Guardians
 * TV display for the cooperative tower defense game
 */

const socket = io();

// Game state
let gamePin = null;
let players = [];
let gameState = null;
let map = null;

// Canvas
let canvas, ctx;
let animationFrameId = null;

// Zone colors
const ZONE_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];
const ZONE_COLORS_LIGHT = ['rgba(239, 68, 68, 0.2)', 'rgba(59, 130, 246, 0.2)', 'rgba(34, 197, 94, 0.2)', 'rgba(245, 158, 11, 0.2)'];

// Tower ranges per level
const TOWER_RANGES = {
    sentinel: [120, 140, 160],
    arcane: [100, 120, 140],
    barracks: [80, 100, 120],
    cannon: [180, 200, 220]
};

// Tower emojis
const TOWER_EMOJIS = {
    sentinel: '🏹',
    arcane: '🔮',
    barracks: '⚔️',
    cannon: '💥'
};

// Enemy emojis
const ENEMY_EMOJIS = {
    grunt: '👹',
    runner: '🏃',
    tank: '🦍',
    boss: '👑'
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');

    // Create game on load
    socket.emit('tower:host-create');

    // Start button
    document.getElementById('btn-start').addEventListener('click', () => {
        socket.emit('tower:host-start', { pin: gamePin });
    });
});

// ==================== SOCKET EVENTS ====================

socket.on('tower:created', ({ pin }) => {
    gamePin = pin;
    document.getElementById('game-pin').textContent = pin;
    console.log('Game created with PIN:', pin);
});

socket.on('tower:player-joined', ({ player, players: allPlayers }) => {
    players = allPlayers;
    updateLobbyPlayers();
    updateStartButton();
});

socket.on('tower:player-left', ({ player, players: allPlayers }) => {
    players = allPlayers;
    updateLobbyPlayers();
    updateStartButton();
});

socket.on('tower:game-started', ({ map: gameMap, players: gamePlayers }) => {
    map = gameMap;
    players = gamePlayers;
    showScreen('game');
    updatePlayersStats();
    startRenderLoop();
});

socket.on('tower:building-phase', ({ waveNumber }) => {
    document.getElementById('phase-display').textContent = 'COSTRUZIONE';
    document.getElementById('wave-number').textContent = waveNumber;
});

socket.on('tower:ready-update', ({ readyCount, totalPlayers }) => {
    document.getElementById('ready-count').textContent = readyCount;
    document.getElementById('total-players').textContent = totalPlayers;
});

socket.on('tower:wave-start', ({ waveNumber, totalEnemies }) => {
    document.getElementById('phase-display').textContent = 'WAVE IN CORSO';
    document.getElementById('wave-number').textContent = waveNumber;
    addKillFeed(`Wave ${waveNumber} iniziata! (${totalEnemies} nemici)`);
});

socket.on('tower:game-state', (state) => {
    gameState = state;
    updateGameUI();
});

socket.on('tower:tower-placed', ({ tower, player }) => {
    addKillFeed(`${player.nickname} ha costruito ${TOWER_EMOJIS[tower.type]}`);
});

socket.on('tower:wave-complete', ({ waveNumber, bonus, nextWave }) => {
    document.getElementById('phase-display').textContent = 'COSTRUZIONE';
    addKillFeed(`Wave ${waveNumber} completata! +${bonus} oro`);
});

socket.on('tower:game-over', ({ victory, stats }) => {
    stopRenderLoop();
    showGameOver(victory, stats);
});

socket.on('tower:host-left', () => {
    alert('La partita è terminata.');
    location.reload();
});

// ==================== UI FUNCTIONS ====================

function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(`${screenName}-screen`).classList.remove('hidden');
}

function updateLobbyPlayers() {
    const grid = document.getElementById('players-grid');
    grid.innerHTML = '';

    players.forEach((player, index) => {
        const card = document.createElement('div');
        card.className = `player-card zone-${player.zoneIndex}`;
        card.innerHTML = `
            <div class="player-avatar">${player.avatar}</div>
            <div class="player-name">${player.nickname}</div>
            <div class="player-zone">Zona ${player.zoneIndex + 1}</div>
        `;
        grid.appendChild(card);
    });

    document.getElementById('player-count').textContent = `(${players.length}/4)`;
}

function updateStartButton() {
    const btn = document.getElementById('btn-start');
    const hint = document.getElementById('start-hint');

    if (players.length >= 1) {
        btn.disabled = false;
        hint.textContent = `${players.length} giocatori pronti`;
    } else {
        btn.disabled = true;
        hint.textContent = 'In attesa di giocatori...';
    }
}

function updateGameUI() {
    if (!gameState) return;

    // Update base HP
    const hpPercent = (gameState.baseHP / gameState.maxBaseHP) * 100;
    const hpFill = document.getElementById('base-hp-fill');
    hpFill.style.width = `${hpPercent}%`;
    hpFill.classList.remove('danger', 'warning');
    if (hpPercent <= 25) hpFill.classList.add('danger');
    else if (hpPercent <= 50) hpFill.classList.add('warning');

    document.getElementById('base-hp').textContent = Math.max(0, gameState.baseHP);

    // Update players stats
    updatePlayersStats();
}

function updatePlayersStats() {
    const container = document.getElementById('players-stats');
    container.innerHTML = '';

    const playersList = gameState ? gameState.players : players;

    playersList.forEach(player => {
        const stat = document.createElement('div');
        stat.className = `player-stat zone-${player.zoneIndex}`;
        stat.innerHTML = `
            <div class="stat-avatar">${player.avatar}</div>
            <div class="stat-info">
                <div class="stat-name">${player.nickname}</div>
                <div class="stat-details">
                    <span class="stat-gold">💰 ${player.gold || 200}</span>
                    &nbsp;|&nbsp;
                    Kills: ${player.totalKills || 0}
                </div>
            </div>
        `;
        container.appendChild(stat);
    });
}

function addKillFeed(message) {
    const feed = document.getElementById('kill-feed');
    const entry = document.createElement('div');
    entry.className = 'kill-entry';
    entry.textContent = message;
    feed.insertBefore(entry, feed.firstChild);

    // Keep only last 5 entries
    while (feed.children.length > 5) {
        feed.removeChild(feed.lastChild);
    }

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (entry.parentNode) {
            entry.remove();
        }
    }, 5000);
}

function showGameOver(victory, stats) {
    showScreen('gameover');

    const icon = document.getElementById('gameover-icon');
    const title = document.getElementById('gameover-title');
    const subtitle = document.getElementById('gameover-subtitle');

    if (victory) {
        icon.textContent = '🏆';
        title.textContent = 'VITTORIA!';
        title.className = 'gameover-title victory';
        subtitle.textContent = 'La cittadella è salva!';
    } else {
        icon.textContent = '💀';
        title.textContent = 'SCONFITTA';
        title.className = 'gameover-title defeat';
        subtitle.textContent = 'La cittadella è caduta...';
    }

    document.getElementById('final-waves').textContent = stats.wavesCompleted;
    document.getElementById('final-hp').textContent = Math.max(0, stats.baseHPRemaining);

    // Rankings
    const rankings = document.getElementById('rankings');
    rankings.innerHTML = '';

    stats.players.forEach((player, index) => {
        const entry = document.createElement('div');
        entry.className = 'ranking-entry';
        entry.innerHTML = `
            <div class="ranking-position">${index + 1}</div>
            <div class="ranking-avatar">${player.avatar}</div>
            <div class="ranking-info">
                <div class="ranking-name">${player.nickname}</div>
                <div class="ranking-stats">
                    Kills: ${player.totalKills} | Danni: ${player.totalDamage} | Torrette: ${player.towersBuilt}
                </div>
            </div>
        `;
        rankings.appendChild(entry);
    });
}

// ==================== CANVAS RENDERING ====================

function startRenderLoop() {
    render();
}

function stopRenderLoop() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (map) {
        drawZones();
        drawPath();
        drawTowerSlots();
        drawTowers();
        drawEnemies();
        drawProjectiles();
        drawBase();
    }

    animationFrameId = requestAnimationFrame(render);
}

function drawZones() {
    if (!map || !map.towerSlots) return;

    // Group slots by zone
    const zones = {};
    map.towerSlots.forEach(slot => {
        if (!zones[slot.zoneOwnerIndex]) {
            zones[slot.zoneOwnerIndex] = [];
        }
        zones[slot.zoneOwnerIndex].push(slot);
    });

    // Draw zone backgrounds
    Object.entries(zones).forEach(([zoneIndex, slots]) => {
        if (slots.length === 0) return;

        ctx.fillStyle = ZONE_COLORS_LIGHT[zoneIndex];

        // Find zone bounds
        const minX = Math.min(...slots.map(s => s.x)) - 40;
        const maxX = Math.max(...slots.map(s => s.x)) + 40;
        const minY = Math.min(...slots.map(s => s.y)) - 40;
        const maxY = Math.max(...slots.map(s => s.y)) + 40;

        ctx.beginPath();
        ctx.roundRect(minX, minY, maxX - minX, maxY - minY, 10);
        ctx.fill();
    });
}

function drawPath() {
    if (!map || !map.path) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Path border
    ctx.strokeStyle = '#2d3748';
    ctx.lineWidth = 34;
    ctx.beginPath();
    ctx.moveTo(map.path[0].x, map.path[0].y);
    for (let i = 1; i < map.path.length; i++) {
        ctx.lineTo(map.path[i].x, map.path[i].y);
    }
    ctx.stroke();

    // Inner path
    ctx.strokeStyle = '#4a5568';
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.moveTo(map.path[0].x, map.path[0].y);
    for (let i = 1; i < map.path.length; i++) {
        ctx.lineTo(map.path[i].x, map.path[i].y);
    }
    ctx.stroke();
}

function drawTowerSlots() {
    if (!map || !map.towerSlots) return;

    map.towerSlots.forEach(slot => {
        if (!slot.tower) {
            // Empty slot
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.strokeStyle = ZONE_COLORS[slot.zoneOwnerIndex];
            ctx.lineWidth = 2;

            ctx.beginPath();
            ctx.arc(slot.x, slot.y, 20, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Plus sign
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(slot.x - 8, slot.y);
            ctx.lineTo(slot.x + 8, slot.y);
            ctx.moveTo(slot.x, slot.y - 8);
            ctx.lineTo(slot.x, slot.y + 8);
            ctx.stroke();
        }
    });
}

function drawTowers() {
    if (!gameState || !gameState.towers) return;

    gameState.towers.forEach(tower => {
        // Tower base
        ctx.fillStyle = ZONE_COLORS[players.find(p => p.nickname === tower.ownerNickname)?.zoneIndex || 0];
        ctx.beginPath();
        ctx.arc(tower.x, tower.y, 25, 0, Math.PI * 2);
        ctx.fill();

        // Tower emoji
        ctx.font = '24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(TOWER_EMOJIS[tower.type], tower.x, tower.y);

        // Level indicator
        if (tower.level > 1) {
            ctx.fillStyle = '#fbbf24';
            ctx.font = 'bold 12px Arial';
            ctx.fillText('★'.repeat(tower.level), tower.x, tower.y + 22);
        }

        // Range indicator (subtle)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        const range = TOWER_RANGES[tower.type]?.[tower.level - 1] || 120;
        ctx.arc(tower.x, tower.y, range, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    });
}

function drawEnemies() {
    if (!gameState || !gameState.enemies) return;

    gameState.enemies.forEach(enemy => {
        // Health bar background
        const hpBarWidth = 30;
        const hpBarHeight = 4;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(enemy.x - hpBarWidth / 2, enemy.y - 25, hpBarWidth, hpBarHeight);

        // Health bar fill
        const hpPercent = enemy.currentHp / enemy.hp;
        ctx.fillStyle = hpPercent > 0.5 ? '#22c55e' : hpPercent > 0.25 ? '#f59e0b' : '#ef4444';
        ctx.fillRect(enemy.x - hpBarWidth / 2, enemy.y - 25, hpBarWidth * hpPercent, hpBarHeight);

        // Enemy emoji
        ctx.font = enemy.type === 'boss' ? '32px Arial' : '24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(enemy.emoji, enemy.x, enemy.y);
    });
}

function drawProjectiles() {
    if (!gameState || !gameState.projectiles) return;

    gameState.projectiles.forEach(proj => {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(proj.fromX, proj.fromY);
        ctx.lineTo(proj.toX, proj.toY);
        ctx.stroke();

        // Impact point
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(proj.toX, proj.toY, 5, 0, Math.PI * 2);
        ctx.fill();
    });
}

function drawBase() {
    if (!map) return;

    const base = map.basePoint;

    // Base circle
    ctx.fillStyle = gameState && gameState.baseHP < 50 ? '#ef4444' : '#22c55e';
    ctx.beginPath();
    ctx.arc(base.x, base.y, 35, 0, Math.PI * 2);
    ctx.fill();

    // Castle emoji
    ctx.font = '32px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏰', base.x, base.y);

    // Spawn point
    const spawn = map.spawnPoint;
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath();
    ctx.arc(spawn.x, spawn.y, 25, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '24px Arial';
    ctx.fillText('⚔️', spawn.x, spawn.y);
}
