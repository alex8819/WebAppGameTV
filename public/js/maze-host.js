/**
 * Maze Game Host - Labirinto Invisibile
 * TV display for the blind maze game
 */

const socket = io();

// Game state
let gamePin = null;
let teams = [];
let mazeData = null;
let gameStartTime = null;
let timerInterval = null;

// Canvas
let canvas, ctx;
const CELL_SIZE = 20;

// Team colors
const TEAM_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('maze-canvas');
    ctx = canvas.getContext('2d');

    // Create game on load
    socket.emit('maze:host-create');

    // Start button
    document.getElementById('btn-start').addEventListener('click', () => {
        socket.emit('maze:host-start', { pin: gamePin });
    });
});

// ==================== SOCKET EVENTS ====================

socket.on('maze:created', ({ pin }) => {
    gamePin = pin;
    document.getElementById('game-pin').textContent = pin;
    console.log('Maze game created with PIN:', pin);
});

socket.on('maze:team-joined', ({ team, teams: allTeams }) => {
    teams = allTeams;
    updateLobbyTeams();
    updateStartButton();
});

socket.on('maze:team-updated', ({ teams: allTeams }) => {
    teams = allTeams;
    updateLobbyTeams();
    updateStartButton();
});

socket.on('maze:player-left', ({ teams: allTeams }) => {
    teams = allTeams;
    updateLobbyTeams();
    updateStartButton();
});

socket.on('maze:game-starting', ({ maze, traps, teams: allTeams, startPosition, endPosition, width, height }) => {
    teams = allTeams;
    mazeData = { maze, traps, startPosition, endPosition, width, height, movingWallState: true };

    // Setup canvas
    canvas.width = width * CELL_SIZE;
    canvas.height = height * CELL_SIZE;

    showScreen('countdown');
    startCountdown();
});

socket.on('maze:game-started', () => {
    showScreen('game');
    gameStartTime = Date.now();
    startTimer();
    updateTeamsStatus();
    drawMaze();
});

socket.on('maze:player-moved', ({ teamId, position }) => {
    // Update team position
    const team = teams.find(t => t.id === teamId);
    if (team) {
        team.position = position;
        drawMaze();
    }
});

socket.on('maze:trap-triggered', ({ teamId, trapType, newPosition }) => {
    const team = teams.find(t => t.id === teamId);
    if (team && newPosition) {
        team.position = newPosition;
        drawMaze();
    }
    // Show trap animation
    showTrapAnimation(trapType);
});

socket.on('maze:game-won', ({ winner }) => {
    stopTimer();
    showWinner(winner);
});

socket.on('maze:moving-wall-update', ({ state }) => {
    mazeData.movingWallState = state;
    drawMaze();
});

socket.on('maze:host-left', () => {
    alert('La partita è terminata.');
    location.reload();
});

// ==================== UI FUNCTIONS ====================

function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(`${screenName}-screen`).classList.remove('hidden');
}

function updateLobbyTeams() {
    const grid = document.getElementById('teams-grid');
    grid.innerHTML = '';

    teams.forEach((team, index) => {
        const card = document.createElement('div');
        card.className = `team-card ${team.isReady ? 'ready' : ''}`;
        card.style.borderColor = team.color;

        const navigatorHtml = team.navigator
            ? `<span class="role-icon">👀</span> ${team.navigator.name}`
            : `<span class="role-icon">👀</span> In attesa...`;

        const pilotHtml = team.pilot
            ? `<span class="role-icon">🎮</span> ${team.pilot.name}`
            : `<span class="role-icon">🎮</span> In attesa...`;

        card.innerHTML = `
            <div class="team-name" style="color: ${team.color}">${team.name}</div>
            <div class="team-members">
                <div class="team-member ${team.navigator ? '' : 'empty'}">${navigatorHtml}</div>
                <div class="team-member ${team.pilot ? '' : 'empty'}">${pilotHtml}</div>
            </div>
            <div class="team-status ${team.isReady ? 'ready' : 'waiting'}">
                ${team.isReady ? 'Pronta!' : 'In attesa'}
            </div>
        `;
        grid.appendChild(card);
    });

    document.getElementById('teams-count').textContent = `(${teams.length}/6)`;
}

function updateStartButton() {
    const btn = document.getElementById('btn-start');
    const hint = document.getElementById('start-hint');

    const readyTeams = teams.filter(t => t.isReady);

    if (readyTeams.length >= 1 && readyTeams.length === teams.length) {
        btn.disabled = false;
        hint.textContent = `${readyTeams.length} squadre pronte!`;
    } else {
        btn.disabled = true;
        hint.textContent = `${readyTeams.length}/${teams.length} squadre pronte`;
    }
}

function startCountdown() {
    let count = 3;
    const countdownEl = document.getElementById('countdown-number');
    countdownEl.textContent = count;

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownEl.textContent = count;
        } else if (count === 0) {
            countdownEl.textContent = 'VIA!';
        } else {
            clearInterval(interval);
            socket.emit('maze:countdown-done', { pin: gamePin });
        }
    }, 1000);
}

function startTimer() {
    timerInterval = setInterval(() => {
        const elapsed = Date.now() - gameStartTime;
        document.getElementById('timer-value').textContent = formatTime(elapsed);
    }, 100);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
}

function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
}

function updateTeamsStatus() {
    const container = document.getElementById('teams-status');
    container.innerHTML = '';

    teams.forEach(team => {
        const indicator = document.createElement('div');
        indicator.className = `team-indicator ${team.finishTime ? 'finished' : ''}`;
        indicator.innerHTML = `
            <div class="team-dot" style="background-color: ${team.color}"></div>
            <span>${team.name}</span>
        `;
        container.appendChild(indicator);
    });
}

function showTrapAnimation(trapType) {
    // Could add visual feedback for traps
    console.log('Trap triggered:', trapType);
}

function showWinner(winner) {
    showScreen('winner');

    document.getElementById('winner-team-name').textContent = winner.name;
    document.getElementById('winner-team-name').style.color = winner.color;
    document.getElementById('winner-navigator').textContent = `👀 ${winner.navigator}`;
    document.getElementById('winner-pilot').textContent = `🎮 ${winner.pilot}`;
    document.getElementById('winner-time').textContent = formatTime(winner.time);
}

// ==================== MAZE RENDERING ====================

function drawMaze() {
    if (!mazeData) return;

    const { maze, traps, startPosition, endPosition, width, height } = mazeData;

    // Clear canvas
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw maze cells
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const cellX = x * CELL_SIZE;
            const cellY = y * CELL_SIZE;

            if (maze[y][x] === 0) {
                // Wall
                ctx.fillStyle = '#0f172a';
                ctx.fillRect(cellX, cellY, CELL_SIZE, CELL_SIZE);
            } else {
                // Path
                ctx.fillStyle = '#334155';
                ctx.fillRect(cellX, cellY, CELL_SIZE, CELL_SIZE);
            }
        }
    }

    // Draw traps
    for (const trap of traps) {
        const trapX = trap.x * CELL_SIZE;
        const trapY = trap.y * CELL_SIZE;

        // Skip moving walls if they're open
        if (trap.type === 'moving_wall' && !mazeData.movingWallState) {
            continue;
        }

        ctx.font = `${CELL_SIZE - 4}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(trap.emoji, trapX + CELL_SIZE / 2, trapY + CELL_SIZE / 2);
    }

    // Draw start
    ctx.font = `${CELL_SIZE - 2}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🟢', startPosition.x * CELL_SIZE + CELL_SIZE / 2, startPosition.y * CELL_SIZE + CELL_SIZE / 2);

    // Draw end
    ctx.fillText('🏁', endPosition.x * CELL_SIZE + CELL_SIZE / 2, endPosition.y * CELL_SIZE + CELL_SIZE / 2);

    // Draw team positions
    teams.forEach((team, index) => {
        if (!team.position) return;

        const x = team.position.x * CELL_SIZE + CELL_SIZE / 2;
        const y = team.position.y * CELL_SIZE + CELL_SIZE / 2;

        // Team marker
        ctx.beginPath();
        ctx.arc(x, y, CELL_SIZE / 2 - 2, 0, Math.PI * 2);
        ctx.fillStyle = team.color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Team initial
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(team.name.charAt(0).toUpperCase(), x, y);
    });
}
