// Micro Racers Host (TV Display)

const socket = io();

// Game state
let gamePin = null;
let players = [];
let track = null;
let raceStartTime = null;
let animationFrameId = null;

// Canvas
let canvas, ctx;

// DOM Elements
const lobbyScreen = document.getElementById('lobby-screen');
const countdownScreen = document.getElementById('countdown-screen');
const raceScreen = document.getElementById('race-screen');
const resultsScreen = document.getElementById('results-screen');

const gamePinDisplay = document.getElementById('game-pin');
const playersGrid = document.getElementById('players-grid');
const playerCountSpan = document.getElementById('player-count');
const btnStartRace = document.getElementById('btn-start-race');

const countdownDisplay = document.getElementById('countdown-display');
const raceTimer = document.getElementById('race-timer');
const currentLapSpan = document.getElementById('current-lap');
const totalLapsSpan = document.getElementById('total-laps');
const raceStandings = document.getElementById('race-standings');
const powerupNotifications = document.getElementById('powerup-notifications');

// Initialize
function init() {
    canvas = document.getElementById('race-canvas');
    ctx = canvas.getContext('2d');

    // Create game on load
    socket.emit('racers:host-create');

    // Setup event listeners
    btnStartRace.addEventListener('click', startRace);
    document.getElementById('btn-new-race').addEventListener('click', () => {
        location.reload();
    });
}

// Socket Events
socket.on('racers:created', (data) => {
    gamePin = data.pin;
    track = data.track;
    gamePinDisplay.textContent = gamePin;
    console.log('Gara creata:', gamePin);
});

socket.on('racers:player-joined', (data) => {
    addPlayer(data.player);
});

socket.on('racers:lobby-update', (data) => {
    updateLobby(data.players);
});

socket.on('racers:player-left', (data) => {
    removePlayer(data.player);
});

socket.on('racers:countdown', (data) => {
    showScreen('countdown');
    countdownDisplay.textContent = data.count;
    countdownDisplay.style.animation = 'none';
    setTimeout(() => {
        countdownDisplay.style.animation = 'countdownPulse 1s ease-in-out';
    }, 10);
});

socket.on('racers:go', () => {
    countdownDisplay.textContent = 'VIA!';
    countdownDisplay.style.color = '#2ecc71';
    setTimeout(() => {
        showScreen('race');
        raceStartTime = Date.now();
        startRenderLoop();
    }, 500);
});

socket.on('racers:game-state', (state) => {
    updateGameState(state);
});

socket.on('racers:powerup-used', (data) => {
    showPowerupNotification(data);
});

socket.on('racers:race-finished', (data) => {
    stopRenderLoop();
    showResults(data.results);
});

socket.on('racers:host-left', () => {
    alert('Connessione persa');
    location.reload();
});

// UI Functions
function showScreen(screenName) {
    lobbyScreen.classList.add('hidden');
    countdownScreen.classList.add('hidden');
    raceScreen.classList.add('hidden');
    resultsScreen.classList.add('hidden');

    switch (screenName) {
        case 'lobby':
            lobbyScreen.classList.remove('hidden');
            break;
        case 'countdown':
            countdownScreen.classList.remove('hidden');
            break;
        case 'race':
            raceScreen.classList.remove('hidden');
            break;
        case 'results':
            resultsScreen.classList.remove('hidden');
            break;
    }
}

function addPlayer(player) {
    players.push(player);
    renderPlayers();
    updateStartButton();
}

function removePlayer(player) {
    players = players.filter(p => p.socketId !== player.socketId);
    renderPlayers();
    updateStartButton();
}

function updateLobby(updatedPlayers) {
    players = updatedPlayers;
    renderPlayers();
    updateStartButton();
}

function renderPlayers() {
    playersGrid.innerHTML = '';
    playerCountSpan.textContent = players.length;

    players.forEach(player => {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.innerHTML = `
            <div class="car-preview" style="background: ${player.color}">🏎️</div>
            <div class="player-name">${player.nickname}</div>
        `;
        playersGrid.appendChild(card);
    });
}

function updateStartButton() {
    btnStartRace.disabled = players.length < 1;
}

function startRace() {
    btnStartRace.disabled = true;
    socket.emit('racers:host-start', { pin: gamePin });
}

// Game Rendering
let gameState = null;

function updateGameState(state) {
    gameState = state;

    // Update race timer
    const elapsed = Math.floor(state.raceTime / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    raceTimer.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    // Update lap display
    if (state.players.length > 0) {
        const leadPlayer = state.players[0];
        currentLapSpan.textContent = Math.min(leadPlayer.lap, state.totalLaps);
        totalLapsSpan.textContent = state.totalLaps;
    }

    // Update standings
    updateStandings(state.players);
}

function updateStandings(players) {
    raceStandings.innerHTML = '<div style="font-weight:700; margin-bottom:10px;">Classifica</div>';

    players.forEach((player, index) => {
        const item = document.createElement('div');
        item.className = 'standing-item';

        const posClass = index < 3 ? `pos-${index + 1}` : 'pos-other';

        item.innerHTML = `
            <div class="standing-position ${posClass}">${index + 1}</div>
            <div class="standing-name" style="color: ${player.color}">${player.nickname}</div>
            <div class="standing-lap">Giro ${player.lap}/${gameState?.totalLaps || 3}</div>
        `;
        raceStandings.appendChild(item);
    });
}

function startRenderLoop() {
    function render() {
        drawTrack();
        if (gameState) {
            drawPowerups();
            drawHazards();
            drawCars();
        }
        animationFrameId = requestAnimationFrame(render);
    }
    render();
}

function stopRenderLoop() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

function drawTrack() {
    ctx.fillStyle = '#27ae60'; // Grass
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!track || !track.segments) return;

    // Draw track segments
    ctx.strokeStyle = '#3d3d5c';
    ctx.lineWidth = 80;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    track.segments.forEach((seg, i) => {
        if (i === 0) {
            ctx.moveTo(seg.startX, seg.startY);
        }
        ctx.lineTo(seg.endX, seg.endY);
    });
    ctx.closePath();
    ctx.stroke();

    // Draw track border (darker)
    ctx.strokeStyle = '#2d2d4c';
    ctx.lineWidth = 85;
    ctx.beginPath();
    track.segments.forEach((seg, i) => {
        if (i === 0) {
            ctx.moveTo(seg.startX, seg.startY);
        }
        ctx.lineTo(seg.endX, seg.endY);
    });
    ctx.closePath();
    ctx.stroke();

    // Draw road surface
    ctx.strokeStyle = '#5d5d7c';
    ctx.lineWidth = 70;
    ctx.beginPath();
    track.segments.forEach((seg, i) => {
        if (i === 0) {
            ctx.moveTo(seg.startX, seg.startY);
        }
        ctx.lineTo(seg.endX, seg.endY);
    });
    ctx.closePath();
    ctx.stroke();

    // Draw center line (dashed)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 20]);
    ctx.beginPath();
    track.segments.forEach((seg, i) => {
        if (i === 0) {
            ctx.moveTo(seg.startX, seg.startY);
        }
        ctx.lineTo(seg.endX, seg.endY);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw start/finish line
    if (track.startLine) {
        const sl = track.startLine;
        ctx.fillStyle = '#fff';
        ctx.save();
        ctx.translate(sl.x, sl.y);
        ctx.rotate(-sl.angle);

        // Checkered pattern
        const size = 10;
        for (let i = -4; i < 4; i++) {
            for (let j = 0; j < 2; j++) {
                ctx.fillStyle = (i + j) % 2 === 0 ? '#fff' : '#000';
                ctx.fillRect(j * size - size, i * size, size, size);
            }
        }
        ctx.restore();
    }
}

function drawPowerups() {
    if (!gameState || !gameState.powerups) return;

    gameState.powerups.forEach(powerup => {
        ctx.save();
        ctx.translate(powerup.x, powerup.y);

        // Draw powerup box
        ctx.fillStyle = '#f1c40f';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw icon
        ctx.fillStyle = '#000';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(powerup.icon, 0, 0);

        ctx.restore();
    });
}

function drawHazards() {
    if (!gameState || !gameState.hazards) return;

    gameState.hazards.forEach(hazard => {
        ctx.save();
        ctx.translate(hazard.x, hazard.y);

        if (hazard.type === 'oil') {
            // Draw oil slick
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.beginPath();
            ctx.ellipse(0, 0, hazard.radius, hazard.radius * 0.6, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    });
}

function drawCars() {
    if (!gameState || !gameState.players) return;

    gameState.players.forEach(player => {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(-player.angle);

        // Car body
        ctx.fillStyle = player.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;

        // Main body
        ctx.beginPath();
        ctx.roundRect(-20, -10, 40, 20, 5);
        ctx.fill();
        ctx.stroke();

        // Cockpit
        ctx.fillStyle = '#333';
        ctx.fillRect(-5, -6, 15, 12);

        // Wheels
        ctx.fillStyle = '#111';
        ctx.fillRect(-18, -13, 8, 4);
        ctx.fillRect(-18, 9, 8, 4);
        ctx.fillRect(10, -13, 8, 4);
        ctx.fillRect(10, 9, 8, 4);

        // Boost effect
        if (player.hasBoost) {
            ctx.fillStyle = '#ff6b35';
            ctx.beginPath();
            ctx.moveTo(-20, 0);
            ctx.lineTo(-35, -5);
            ctx.lineTo(-30, 0);
            ctx.lineTo(-35, 5);
            ctx.closePath();
            ctx.fill();
        }

        // Stun effect
        if (player.isStunned) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            for (let i = 0; i < 3; i++) {
                const angle = (Date.now() / 100 + i * 2) % (Math.PI * 2);
                ctx.beginPath();
                ctx.arc(0, 0, 25, angle, angle + 0.5);
                ctx.stroke();
            }
        }

        // Oil slip effect
        if (player.onOil) {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 22, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();

        // Draw name above car
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.strokeText(player.nickname, player.x, player.y - 25);
        ctx.fillText(player.nickname, player.x, player.y - 25);

        // Draw position badge
        if (player.position <= 3) {
            const badges = ['🥇', '🥈', '🥉'];
            ctx.font = '16px Arial';
            ctx.fillText(badges[player.position - 1], player.x, player.y - 40);
        }
    });
}

function showPowerupNotification(data) {
    const notification = document.createElement('div');
    notification.className = 'powerup-notification';

    let message = '';
    switch (data.type) {
        case 'boost':
            message = `🚀 ${data.user} usa TURBO!`;
            break;
        case 'oil':
            message = `🛢️ ${data.user} lascia OLIO!`;
            break;
        case 'missile':
            if (data.target) {
                message = `🎯 ${data.user} colpisce ${data.target}!`;
            } else {
                message = `🎯 ${data.user} manca il bersaglio!`;
            }
            break;
    }

    notification.textContent = message;
    powerupNotifications.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function showResults(results) {
    showScreen('results');

    // Build podium
    const podium = document.getElementById('podium');
    podium.innerHTML = '';

    const podiumPositions = ['second', 'first', 'third'];

    for (let i = 0; i < 3 && i < results.length; i++) {
        const result = results[i];
        const place = document.createElement('div');
        place.className = `podium-place ${podiumPositions[i]}`;

        const timeStr = result.finished
            ? formatTime(result.finishTime)
            : `Giro ${result.lap}`;

        place.innerHTML = `
            <div class="podium-avatar" style="background: ${result.color}">🏎️</div>
            <div class="podium-name">${result.nickname}</div>
            <div class="podium-time">${timeStr}</div>
            <div class="podium-base ${podiumPositions[i]}">${result.position}</div>
        `;
        podium.appendChild(place);
    }

    // Build full results
    const fullResults = document.getElementById('full-results');
    fullResults.innerHTML = '';

    results.forEach(result => {
        const row = document.createElement('div');
        row.className = 'result-row';

        const timeStr = result.finished
            ? formatTime(result.finishTime)
            : 'DNF';

        row.innerHTML = `
            <div class="result-position">${result.position}</div>
            <div class="result-color" style="background: ${result.color}"></div>
            <div class="result-name">${result.nickname}</div>
            <div class="result-time">${timeStr}</div>
            <div class="result-stats">
                <span>🔥 ${result.stats.powerupsUsed}</span>
                <span>💥 ${result.stats.collisions}</span>
            </div>
        `;
        fullResults.appendChild(row);
    });

    // Countdown to new race
    let countdown = 30;
    const countdownTimer = document.getElementById('results-countdown-timer');
    const countdownInterval = setInterval(() => {
        countdown--;
        countdownTimer.textContent = countdown;
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            location.reload();
        }
    }, 1000);
}

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const millis = Math.floor((ms % 1000) / 10);
    return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(2, '0')}`;
}

// Start
init();
