// Micro Racers Player (Phone Controller)

const socket = io();

// Game state
let gamePin = null;
let playerData = null;
let isRacing = false;
let hasFinished = false;

// Controls state
let steering = 0;
let accelerating = false;
let braking = false;
let currentPowerup = null;

// Orientation tracking
let orientationPermission = false;
let baseOrientation = 0;

// DOM Elements
const joinScreen = document.getElementById('join-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const countdownScreen = document.getElementById('countdown-screen');
const raceScreen = document.getElementById('race-screen');
const finishedScreen = document.getElementById('finished-screen');
const resultsScreen = document.getElementById('results-screen');

const pinInput = document.getElementById('game-pin');
const nicknameInput = document.getElementById('nickname');
const btnJoin = document.getElementById('btn-join');
const errorMessage = document.getElementById('error-message');

const gasPedal = document.getElementById('gas-pedal');
const brakePedal = document.getElementById('brake-pedal');
const powerupSlot = document.getElementById('powerup-slot');
const steeringMarker = document.getElementById('steering-marker');
const calibrateBtn = document.getElementById('calibrate-btn');

// Current raw tilt for calibration
let currentRawTilt = 0;

// Debounce for powerup use
let lastPowerupUse = 0;
let powerupPickupTime = 0;

// Debug: track socket connection
socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
});

socket.on('disconnect', () => {
    console.log('Socket disconnected');
});

// Initialize
function init() {
    // Event listeners
    btnJoin.addEventListener('click', joinGame);
    pinInput.addEventListener('input', formatPinInput);
    nicknameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') joinGame();
    });

    // Touch controls
    setupTouchControls();

    // Check for saved data
    const savedPin = sessionStorage.getItem('racersPin');
    const savedNickname = sessionStorage.getItem('racersNickname');
    if (savedPin) pinInput.value = savedPin;
    if (savedNickname) nicknameInput.value = savedNickname;

    // Request orientation permission on iOS
    setupOrientationControls();
}

function formatPinInput(e) {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
}

function setupTouchControls() {
    // Gas pedal
    gasPedal.addEventListener('touchstart', (e) => {
        e.preventDefault();
        accelerating = true;
        gasPedal.classList.add('active');
        sendInput();
    });

    gasPedal.addEventListener('touchend', (e) => {
        e.preventDefault();
        accelerating = false;
        gasPedal.classList.remove('active');
        sendInput();
    });

    // Brake pedal
    brakePedal.addEventListener('touchstart', (e) => {
        e.preventDefault();
        braking = true;
        brakePedal.classList.add('active');
        sendInput();
    });

    brakePedal.addEventListener('touchend', (e) => {
        e.preventDefault();
        braking = false;
        brakePedal.classList.remove('active');
        sendInput();
    });

    // Mouse fallback for testing
    gasPedal.addEventListener('mousedown', () => {
        accelerating = true;
        gasPedal.classList.add('active');
        sendInput();
    });
    gasPedal.addEventListener('mouseup', () => {
        accelerating = false;
        gasPedal.classList.remove('active');
        sendInput();
    });
    gasPedal.addEventListener('mouseleave', () => {
        if (accelerating) {
            accelerating = false;
            gasPedal.classList.remove('active');
            sendInput();
        }
    });

    brakePedal.addEventListener('mousedown', () => {
        braking = true;
        brakePedal.classList.add('active');
        sendInput();
    });
    brakePedal.addEventListener('mouseup', () => {
        braking = false;
        brakePedal.classList.remove('active');
        sendInput();
    });
    brakePedal.addEventListener('mouseleave', () => {
        if (braking) {
            braking = false;
            brakePedal.classList.remove('active');
            sendInput();
        }
    });

    // Powerup use
    powerupSlot.addEventListener('click', usePowerup);
    powerupSlot.addEventListener('touchstart', (e) => {
        e.preventDefault();
        usePowerup();
    });

    // Calibrate button
    if (calibrateBtn) {
        calibrateBtn.addEventListener('click', calibrateSteering);
        calibrateBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            calibrateSteering();
        });
    }
}

function calibrateSteering() {
    // Set current tilt as the new center point
    baseOrientation = currentRawTilt;
    steering = 0;
    updateSteeringIndicator();

    // Visual feedback
    if (calibrateBtn) {
        calibrateBtn.textContent = '✓ OK!';
        calibrateBtn.classList.add('calibrated');
        setTimeout(() => {
            calibrateBtn.textContent = '🎯 CALIBRA';
            calibrateBtn.classList.remove('calibrated');
        }, 1000);
    }

    // Vibrate feedback
    if (navigator.vibrate) {
        navigator.vibrate(50);
    }
}

function setupOrientationControls() {
    // Request permission for iOS 13+
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS 13+ requires user gesture to request permission
        document.body.addEventListener('click', requestOrientationPermission, { once: true });
        document.body.addEventListener('touchstart', requestOrientationPermission, { once: true });
    } else {
        // Non-iOS or older iOS
        startOrientationTracking();
    }
}

async function requestOrientationPermission() {
    try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === 'granted') {
            orientationPermission = true;
            startOrientationTracking();
        }
    } catch (e) {
        console.log('Orientation permission error:', e);
        // Fallback to trying anyway
        startOrientationTracking();
    }
}

function startOrientationTracking() {
    window.addEventListener('deviceorientation', handleOrientation);

    // Reset calibration when orientation changes
    window.addEventListener('orientationchange', () => {
        baseOrientation = 0;
    });
}

function handleOrientation(event) {
    // Get screen orientation to determine which axis to use
    const screenOrientation = window.screen.orientation?.angle || window.orientation || 0;

    let tilt;

    // In landscape mode, use beta (front/back tilt becomes left/right)
    // Adjust based on which way the phone is rotated
    if (Math.abs(screenOrientation) === 90) {
        // Landscape mode - use beta
        tilt = event.beta || 0;
        // Flip direction based on landscape-left vs landscape-right
        if (screenOrientation === -90 || screenOrientation === 270) {
            tilt = -tilt;
        }
    } else {
        // Portrait mode - use gamma
        tilt = event.gamma || 0;
    }

    // Save raw tilt for calibration button
    currentRawTilt = tilt;

    // Don't process steering if not racing
    if (!isRacing || hasFinished) return;

    // Auto-calibrate on first reading
    if (baseOrientation === 0 && tilt !== 0) {
        baseOrientation = tilt;
    }

    // Calculate steering from tilt (normalized to -1 to 1)
    // Tilt range: -25 to 25 degrees for full steering
    // Inverted so tilt-left = steer-left
    const adjustedTilt = tilt - baseOrientation;
    steering = Math.max(-1, Math.min(1, -adjustedTilt / 25));

    // Update visual indicator
    updateSteeringIndicator();

    // Send to server
    sendInput();
}

function updateSteeringIndicator() {
    // Map steering (-1 to 1) to position (0% to 100%)
    const position = 50 + (steering * 40); // 10% to 90%
    steeringMarker.style.left = `${position}%`;
}

function sendInput() {
    if (!gamePin || !isRacing || hasFinished) return;

    socket.emit('racers:player-input', {
        pin: gamePin,
        input: {
            steering,
            accelerating,
            braking
        }
    });
}

function joinGame() {
    const pin = pinInput.value.trim();
    const nickname = nicknameInput.value.trim() || 'Pilota';

    if (pin.length !== 4) {
        showError('Inserisci un PIN valido (4 cifre)');
        return;
    }

    // Save for reconnection
    sessionStorage.setItem('racersPin', pin);
    sessionStorage.setItem('racersNickname', nickname);

    socket.emit('racers:player-join', { pin, nickname });
}

function showError(message) {
    errorMessage.textContent = message;
    setTimeout(() => {
        errorMessage.textContent = '';
    }, 3000);
}

function showScreen(screenName) {
    joinScreen.classList.add('hidden');
    lobbyScreen.classList.add('hidden');
    countdownScreen.classList.add('hidden');
    raceScreen.classList.add('hidden');
    finishedScreen.classList.add('hidden');
    resultsScreen.classList.add('hidden');

    switch (screenName) {
        case 'join':
            joinScreen.classList.remove('hidden');
            break;
        case 'lobby':
            lobbyScreen.classList.remove('hidden');
            break;
        case 'countdown':
            countdownScreen.classList.remove('hidden');
            break;
        case 'race':
            raceScreen.classList.remove('hidden');
            break;
        case 'finished':
            finishedScreen.classList.remove('hidden');
            break;
        case 'results':
            resultsScreen.classList.remove('hidden');
            break;
    }
}

function usePowerup() {
    if (!currentPowerup || !isRacing) return;

    const now = Date.now();

    // Prevent accidental use right after pickup (300ms grace period)
    if (now - powerupPickupTime < 300) return;

    // Debounce - prevent accidental double-tap (500ms)
    if (now - lastPowerupUse < 500) return;
    lastPowerupUse = now;

    socket.emit('racers:use-powerup', { pin: gamePin });
    currentPowerup = null;
    updatePowerupDisplay();
}

function updatePowerupDisplay() {
    if (currentPowerup) {
        powerupSlot.classList.add('has-powerup');
        powerupSlot.innerHTML = `
            <div class="powerup-content">
                <div class="powerup-icon">${currentPowerup.icon}</div>
                <div class="powerup-name">${currentPowerup.name}</div>
            </div>
        `;
    } else {
        powerupSlot.classList.remove('has-powerup');
        powerupSlot.innerHTML = '<div class="powerup-hint">Nessun power-up</div>';
    }
}

// Socket Events
socket.on('racers:joined', (data) => {
    gamePin = data.gamePin;
    playerData = data.player;

    showScreen('lobby');

    document.getElementById('display-pin').textContent = gamePin;
    document.getElementById('player-name').textContent = playerData.nickname;
    document.getElementById('car-preview').style.background = playerData.color;

    updatePlayersList(data.players);
});

socket.on('racers:join-error', (data) => {
    showError(data.message);
});

socket.on('racers:lobby-update', (data) => {
    updatePlayersList(data.players);
});

socket.on('racers:lobby-timer', (data) => {
    const timerEl = document.getElementById('lobby-timer');
    const timerValue = document.getElementById('lobby-timer-value');
    if (timerEl && timerValue) {
        timerEl.classList.remove('hidden');
        timerValue.textContent = data.remaining;
    }
});

socket.on('racers:countdown', (data) => {
    showScreen('countdown');
    const countdownNumber = document.getElementById('countdown-number');
    countdownNumber.textContent = data.count;
    countdownNumber.style.animation = 'none';
    setTimeout(() => {
        countdownNumber.style.animation = 'countdownPulse 1s ease-in-out';
    }, 10);

    // Calibrate orientation at countdown start
    baseOrientation = 0;
});

socket.on('racers:go', () => {
    const countdownNumber = document.getElementById('countdown-number');
    countdownNumber.textContent = 'VIA!';
    countdownNumber.style.color = '#2ecc71';

    setTimeout(() => {
        showScreen('race');
        isRacing = true;
        updatePowerupDisplay();
    }, 500);
});

socket.on('racers:player-state', (state) => {
    // Debug: flash position indicator to show we're receiving updates
    const posElement = document.getElementById('position');
    if (posElement && state.position) {
        posElement.textContent = state.position;
    }

    if (!isRacing) {
        console.log('Received player-state but isRacing is false');
        return;
    }

    // Update HUD
    document.getElementById('current-lap').textContent = state.lap;
    document.getElementById('total-laps').textContent = state.totalLaps;
    document.getElementById('speed').textContent = Math.round(state.speed * 15);

    // Debug: log powerup state
    if (state.powerup) {
        console.log('Server sent powerup:', state.powerup);
    }

    // Update powerup - simplified logic
    if (state.powerup) {
        if (!currentPowerup || currentPowerup.id !== state.powerup.id) {
            currentPowerup = state.powerup;
            powerupPickupTime = Date.now();
            updatePowerupDisplay();
            console.log('Powerup display updated:', currentPowerup);
            // Vibrate on pickup
            if (navigator.vibrate) {
                navigator.vibrate(100);
            }
        }
    } else if (currentPowerup) {
        currentPowerup = null;
        updatePowerupDisplay();
    }

    // Update status effects
    const effectsContainer = document.getElementById('status-effects');
    effectsContainer.innerHTML = '';

    if (state.hasBoost) {
        const effect = document.createElement('div');
        effect.className = 'status-effect boost';
        effect.textContent = '🚀 TURBO!';
        effectsContainer.appendChild(effect);
    }

    if (state.isStunned) {
        const effect = document.createElement('div');
        effect.className = 'status-effect stun';
        effect.textContent = '💥 COLPITO!';
        effectsContainer.appendChild(effect);
        // Vibrate on stun
        if (navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
        }
    }

    if (state.onOil) {
        const effect = document.createElement('div');
        effect.className = 'status-effect oil';
        effect.textContent = '🛢️ SCIVOLANDO!';
        effectsContainer.appendChild(effect);
    }

    // Check if finished
    if (state.finished && !hasFinished) {
        hasFinished = true;
        isRacing = false;
        showFinished(state.finishPosition, state.finishTime);
    }
});

socket.on('racers:powerup-used', (data) => {
    // Vibrate on powerup use (especially when hit)
    if (data.type === 'missile' && data.target === playerData?.nickname) {
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
        }
    }
});

socket.on('racers:race-finished', (data) => {
    showResults(data.results);
});

socket.on('racers:host-left', () => {
    alert('L\'host ha lasciato la gara');
    location.reload();
});

// UI Update Functions
function updatePlayersList(players) {
    const playersList = document.getElementById('players-list');
    playersList.innerHTML = '';

    players.forEach(player => {
        const chip = document.createElement('div');
        chip.className = 'player-chip';
        chip.innerHTML = `
            <div class="chip-color" style="background: ${player.color}"></div>
            <span>${player.nickname}</span>
        `;
        playersList.appendChild(chip);
    });
}

function showFinished(position, finishTime) {
    showScreen('finished');

    const positionSuffix = ['', '°', '°', '°'][position] || '°';
    document.getElementById('finish-position').textContent = position + positionSuffix;
    document.getElementById('finish-time').textContent = formatTime(finishTime);

    // Vibrate for finish
    if (navigator.vibrate) {
        if (position === 1) {
            navigator.vibrate([100, 50, 100, 50, 300]);
        } else {
            navigator.vibrate(200);
        }
    }
}

function showResults(results) {
    showScreen('results');

    // Find your result
    const myResult = results.find(r => r.socketId === socket.id);

    if (myResult) {
        const yourResult = document.getElementById('your-result');
        yourResult.innerHTML = `
            <div class="your-position">${myResult.position}°</div>
            <div class="your-time">${myResult.finished ? formatTime(myResult.finishTime) : 'DNF'}</div>
            <div class="your-stats">
                <span>🔥 Power-ups: ${myResult.stats.powerupsUsed}</span>
                <span>💥 Collisioni: ${myResult.stats.collisions}</span>
            </div>
        `;
    }

    // Top 3
    const topThree = document.getElementById('top-three');
    topThree.innerHTML = '';

    const positionClasses = ['first', 'second', 'third'];

    results.slice(0, 3).forEach((result, index) => {
        const row = document.createElement('div');
        row.className = 'top-result';
        row.innerHTML = `
            <div class="top-position ${positionClasses[index]}">${result.position}</div>
            <div class="top-color" style="background: ${result.color}"></div>
            <div class="top-name">${result.nickname}</div>
            <div class="top-time">${result.finished ? formatTime(result.finishTime) : 'DNF'}</div>
        `;
        topThree.appendChild(row);
    });

    // Play again button
    document.getElementById('btn-play-again').addEventListener('click', () => {
        location.reload();
    });
}

function formatTime(ms) {
    if (!ms) return '--:--';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const millis = Math.floor((ms % 1000) / 10);
    return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(2, '0')}`;
}

// Start
init();
