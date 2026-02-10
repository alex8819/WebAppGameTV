/**
 * Maze Game Player - Labirinto Invisibile
 * Phone controls for the blind maze game
 */

const socket = io();

// Player state
let gamePin = null;
let playerName = null;
let teamName = null;
let playerRole = 'pilot'; // 'pilot' or 'navigator'
let isSlowed = false;
let gameStartTime = null;
let timerInterval = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Role selection
    document.querySelectorAll('.role-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            playerRole = btn.dataset.role;
        });
    });

    // Join button
    document.getElementById('btn-join').addEventListener('click', joinGame);

    // Direction buttons
    document.querySelectorAll('.dir-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            sendMove(btn.dataset.dir);
        });

        // Touch feedback
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            btn.classList.add('active');
            sendMove(btn.dataset.dir);
        });

        btn.addEventListener('touchend', () => {
            btn.classList.remove('active');
        });
    });

    // Enter key for inputs
    document.querySelectorAll('.join-form input').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') joinGame();
        });
    });
});

// ==================== GAME FUNCTIONS ====================

function joinGame() {
    const pin = document.getElementById('pin-input').value.trim();
    const name = document.getElementById('name-input').value.trim();
    const team = document.getElementById('team-input').value.trim();

    if (!pin || pin.length !== 4) {
        showError('Inserisci un PIN valido di 4 cifre');
        return;
    }

    if (!name) {
        showError('Inserisci il tuo nome');
        return;
    }

    if (!team) {
        showError('Inserisci il nome della squadra');
        return;
    }

    gamePin = pin;
    playerName = name;
    teamName = team;

    socket.emit('maze:join-team', {
        pin,
        playerName: name,
        teamName: team,
        role: playerRole
    });
}

function sendMove(direction) {
    socket.emit('maze:move', {
        pin: gamePin,
        direction
    });

    // Quick vibration feedback for button press
    vibrate(10);
}

function showError(message) {
    const errorEl = document.getElementById('error-message');
    errorEl.textContent = message;
    setTimeout(() => {
        errorEl.textContent = '';
    }, 3000);
}

function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(`${screenName}-screen`).classList.remove('hidden');
}

function vibrate(pattern) {
    if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
}

function startTimer() {
    timerInterval = setInterval(() => {
        if (gameStartTime) {
            const elapsed = Date.now() - gameStartTime;
            document.getElementById('nav-timer').textContent = formatTime(elapsed);
        }
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
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ==================== SOCKET EVENTS ====================

socket.on('maze:joined', ({ team, role }) => {
    showScreen('lobby');

    document.getElementById('my-team').textContent = team.name;
    document.getElementById('my-name').textContent = playerName;

    if (role === 'pilot') {
        document.getElementById('my-role').innerHTML = '<span>🎮</span> Pilota';
    } else {
        document.getElementById('my-role').innerHTML = '<span>👀</span> Navigatore';
    }

    updateTeammateStatus(team);
});

socket.on('maze:team-updated', ({ team }) => {
    updateTeammateStatus(team);
});

socket.on('maze:join-error', ({ message }) => {
    showError(message);
});

socket.on('maze:game-starting', ({ role }) => {
    showScreen('countdown');

    const roleText = role === 'pilot' ? '🎮 Sei il Pilota!' : '👀 Sei il Navigatore!';
    document.getElementById('countdown-role').textContent = roleText;

    startCountdown();
});

socket.on('maze:game-started', ({ role }) => {
    gameStartTime = Date.now();

    if (role === 'pilot') {
        showScreen('pilot');
    } else {
        showScreen('navigator');
        startTimer();
    }
});

socket.on('maze:wall-collision', () => {
    // Long vibration for wall hit
    vibrate(200);

    // Visual feedback
    const controls = document.querySelector('.pilot-controls');
    controls.classList.add('wall-hit');
    setTimeout(() => controls.classList.remove('wall-hit'), 300);
});

socket.on('maze:trap-triggered', ({ trapType }) => {
    // Pattern vibration for trap
    vibrate([100, 50, 100, 50, 100]);

    // Visual feedback
    const controls = document.querySelector('.pilot-controls');
    controls.classList.add('trap-triggered');
    setTimeout(() => controls.classList.remove('trap-triggered'), 500);

    // Handle slow trap
    if (trapType === 'slow') {
        isSlowed = true;
        controls.classList.add('slowed');

        // Visual indicator
        document.querySelector('.pilot-hint').textContent = '🕸️ Rallentato!';

        setTimeout(() => {
            isSlowed = false;
            controls.classList.remove('slowed');
            document.querySelector('.pilot-hint').textContent = 'Ascolta il navigatore e muoviti!';
        }, 3000);
    }
});

socket.on('maze:game-won', ({ winner, isMyTeam, time }) => {
    stopTimer();
    showScreen('finished');

    if (isMyTeam) {
        document.getElementById('finished-icon').textContent = '🏆';
        document.getElementById('finished-title').textContent = 'VITTORIA!';
        document.getElementById('finished-message').textContent = 'Avete completato il labirinto!';
        vibrate([200, 100, 200, 100, 400]);
    } else {
        document.getElementById('finished-icon').textContent = '🏁';
        document.getElementById('finished-title').textContent = 'FINE PARTITA';
        document.getElementById('finished-message').textContent = `${winner.name} ha vinto!`;
        vibrate(100);
    }

    document.getElementById('finished-time').textContent = formatTime(time);
});

socket.on('maze:host-left', () => {
    alert('La partita è terminata.');
    location.reload();
});

// ==================== UI HELPERS ====================

function updateTeammateStatus(team) {
    const statusEl = document.getElementById('teammate-status');

    if (playerRole === 'pilot') {
        if (team.navigator) {
            statusEl.innerHTML = `<span style="color: #22c55e">👀 ${team.navigator.name} è pronto!</span>`;
            statusEl.classList.add('ready');
        } else {
            statusEl.textContent = 'In attesa del Navigatore...';
            statusEl.classList.remove('ready');
        }
    } else {
        if (team.pilot) {
            statusEl.innerHTML = `<span style="color: #22c55e">🎮 ${team.pilot.name} è pronto!</span>`;
            statusEl.classList.add('ready');
        } else {
            statusEl.textContent = 'In attesa del Pilota...';
            statusEl.classList.remove('ready');
        }
    }
}

function startCountdown() {
    let count = 3;
    const countdownEl = document.getElementById('countdown-number');
    countdownEl.textContent = count;
    vibrate(100);

    const interval = setInterval(() => {
        count--;
        if (count > 0) {
            countdownEl.textContent = count;
            vibrate(100);
        } else if (count === 0) {
            countdownEl.textContent = 'VIA!';
            vibrate([100, 50, 100, 50, 200]);
        } else {
            clearInterval(interval);
        }
    }, 1000);
}
