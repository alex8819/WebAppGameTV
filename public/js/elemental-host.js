// Elemental Clash Host JavaScript

const socket = io();

// DOM Elements
const screens = {
    lobby: document.getElementById('lobby-screen'),
    minigame: document.getElementById('minigame-screen'),
    minigameResults: document.getElementById('minigame-results-screen'),
    battle: document.getElementById('battle-screen'),
    resolution: document.getElementById('resolution-screen'),
    final: document.getElementById('final-screen')
};

const elements = {
    gamePin: document.getElementById('game-pin'),
    playerCount: document.getElementById('player-count'),
    playersCircle: document.getElementById('players-circle'),
    btnStartGame: document.getElementById('btn-start-game'),
    countdownTimer: document.getElementById('countdown-timer'),
    autoStartCountdown: document.getElementById('auto-start-countdown'),
    matchTimer: document.getElementById('match-timer'),
    roundNumber: document.getElementById('round-number'),
    turnTimer: document.getElementById('turn-timer'),
    arena: document.getElementById('arena'),
    battleLog: document.getElementById('battle-log'),
    finalCountdownTimer: document.getElementById('final-countdown-timer'),
    btnNewGame: document.getElementById('btn-new-game'),
    winnerDisplay: document.getElementById('winner-display'),
    finalStats: document.getElementById('final-stats'),
    // Mini-game elements
    minigameRound: document.getElementById('minigame-round'),
    minigameTimer: document.getElementById('minigame-timer'),
    minigameTitle: document.getElementById('minigame-title'),
    minigameDescription: document.getElementById('minigame-description'),
    minigameDisplay: document.getElementById('minigame-display'),
    minigamePlayers: document.getElementById('minigame-players'),
    minigameResultsTitle: document.getElementById('minigame-results-title'),
    correctAnswerDisplay: document.getElementById('correct-answer-display'),
    minigameRankings: document.getElementById('minigame-rankings')
};

let gamePin = null;
let players = [];
let playerPositions = new Map(); // socketId -> {x, y}
let autoStartTimer = null;
let turnCountdown = null;
let matchCountdown = null;
let minigameCountdown = null;
let currentTargetTaps = 30; // For turbo runner

// Initialize
function init() {
    socket.emit('elemental:host-create');
    setupEventListeners();
}

function setupEventListeners() {
    elements.btnStartGame.addEventListener('click', () => {
        if (players.length >= 2) {
            socket.emit('elemental:host-start', { pin: gamePin });
        }
    });

    elements.btnNewGame.addEventListener('click', () => {
        location.reload();
    });
}

// Show screen helper
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[screenName].classList.remove('hidden');
}

// Socket Events
socket.on('elemental:created', ({ pin }) => {
    gamePin = pin;
    elements.gamePin.textContent = pin;
    showScreen('lobby');
    startAutoStartTimer();
});

socket.on('elemental:player-joined', ({ player }) => {
    players.push(player);
    updatePlayersDisplay();
    updateStartButton();
    resetAutoStartTimer();
});

socket.on('elemental:player-left', ({ player }) => {
    players = players.filter(p => p.nickname !== player.nickname);
    updatePlayersDisplay();
    updateStartButton();
});

socket.on('elemental:game-started', () => {
    clearInterval(autoStartTimer);
    startMatchTimer();
});

// Mini-game events
socket.on('elemental:minigame-start', ({ round, miniGame, players: gamePlayers }) => {
    showScreen('minigame');
    elements.minigameRound.textContent = round;
    elements.minigameTitle.textContent = miniGame.name;
    elements.minigameDescription.textContent = miniGame.description;

    // Store targetTaps for turbo runner
    if (miniGame.targetTaps) {
        currentTargetTaps = miniGame.targetTaps;
    }

    // Update players if provided (for turbo runner)
    if (gamePlayers) {
        players = gamePlayers;
    }

    // Display mini-game specific content
    displayMiniGameContent(miniGame);

    // Start mini-game timer
    startMiniGameTimer(miniGame.duration);

    // Reset player answered status (skip for turbo runner - has its own display)
    if (miniGame.type !== 'turbo_runner') {
        elements.minigamePlayers.innerHTML = players
            .filter(p => p.isAlive)
            .map(p => `<div class="minigame-player waiting" data-id="${p.socketId}">
                <span class="avatar">${p.avatar}</span>
                <span class="name">${p.nickname}</span>
                <span class="status">⏳</span>
            </div>`).join('');
    } else {
        elements.minigamePlayers.innerHTML = '';
    }
});

socket.on('elemental:minigame-results', ({ miniGameType, miniGameName, correctAnswer, rankings }) => {
    clearInterval(minigameCountdown);
    showScreen('minigameResults');

    elements.minigameResultsTitle.textContent = miniGameName;

    // Show correct answer
    if (correctAnswer) {
        elements.correctAnswerDisplay.innerHTML = `Risposta corretta: <strong>${formatAnswer(correctAnswer, miniGameType)}</strong>`;
    } else {
        elements.correctAnswerDisplay.innerHTML = '';
    }

    // Show rankings with bonuses
    elements.minigameRankings.innerHTML = rankings.map((r, i) => {
        let bonusText = '';
        if (r.bonus) {
            const focusText = r.bonus.focusBoost ? ` +${r.bonus.focusBoost}✨` : '';

            if (r.bonus.coinWon === true) {
                bonusText = `🪙✅ INDOVINATO! +25% danni${focusText}`;
            } else if (r.bonus.coinWon === false) {
                bonusText = '🪙❌ SBAGLIATO! +20 danni subiti';
            } else if (r.bonus.tooEarly) {
                bonusText = '⏱️ TROPPO PRESTO! +15 danni subiti';
            } else if (r.bonus.reflexWin) {
                bonusText = `⚡ RIFLESSI! +30% danni${focusText}`;
            } else if (r.bonus.memoryWin) {
                bonusText = '🧠 MEMORIA! +1✨ +10 HP';
            } else if (r.bonus.racerWin) {
                bonusText = `🏆 VITTORIA! 10 danni a sinistra${focusText}`;
            } else if (r.bonus.oppositesWin) {
                bonusText = `💥 OPPOSTI! 10 danni a TUTTI${focusText}`;
            } else if (r.bonus.damageBonus) {
                const pct = Math.round(r.bonus.damageBonus * 100);
                bonusText = `⚔️ +${pct}% danni${focusText}`;
            } else if (r.bonus.priority) {
                bonusText = `⚡ Priorità${focusText}`;
            } else if (r.bonus.shield) {
                bonusText = `🛡️ Scudo 30%${focusText}`;
            } else if (r.bonus.focusBoost) {
                bonusText = `✨ +${r.bonus.focusBoost} Focus`;
            } else if (r.bonus.damageTaken) {
                bonusText = `💔 +${r.bonus.damageTaken} danni subiti`;
            }

            // Add HP loss for last place
            if (r.bonus.hpLoss) {
                bonusText = bonusText ? `${bonusText} | -${r.bonus.hpLoss} HP` : `💔 -${r.bonus.hpLoss} HP`;
            }
        }

        const rankClass = i === 0 ? 'first' : (i === 1 ? 'second' : (i === rankings.length - 1 ? 'last' : ''));
        const correctClass = r.isCorrect ? 'correct' : 'wrong';

        return `<div class="ranking-row ${rankClass} ${correctClass}">
            <span class="rank">#${r.rank}</span>
            <span class="player-info">
                <span class="nickname">${r.nickname}</span>
                ${r.isCorrect ? '✅' : '❌'}
            </span>
            <span class="bonus">${bonusText}</span>
        </div>`;
    }).join('');
});

socket.on('elemental:shuffle-positions', ({ round, shuffleData }) => {
    console.log('Shuffling positions:', shuffleData);
    showScreen('battle');

    // Show shuffle announcement
    showShuffleAnnouncement();

    // Animate players to new positions
    animatePositionShuffle(shuffleData);
});

socket.on('elemental:action-phase', ({ round, turnTime, players: updatedPlayers }) => {
    players = updatedPlayers;
    showScreen('battle');
    elements.roundNumber.textContent = round;
    updateArenaPlayers();
    startTurnTimer(turnTime);
});

socket.on('elemental:round-start', ({ round, turnTime, players: updatedPlayers }) => {
    players = updatedPlayers;
    elements.roundNumber.textContent = round;
    updateArenaPlayers();
    startTurnTimer(turnTime);
});

socket.on('elemental:round-results', ({ round, actions, results, eliminations, players: updatedPlayers, gameOver, winner }) => {
    clearInterval(turnCountdown);

    // Show action animations first
    showActionAnimations(actions, results, () => {
        // Then update players and show damage results
        players = updatedPlayers;
        showDamageResults(results, eliminations);

        // Update arena after results
        setTimeout(() => {
            updateArenaPlayers();

            if (gameOver) {
                setTimeout(() => {
                    showFinalScreen(winner);
                }, 1500);
            }
        }, 1500);
    });
});

socket.on('elemental:time-update', ({ matchTime }) => {
    updateMatchTimerDisplay(matchTime);
});

socket.on('elemental:game-ended', ({ rankings }) => {
    showFinalScreen(rankings[0], rankings);
});

socket.on('disconnect', () => {
    setTimeout(() => location.reload(), 2000);
});

socket.on('elemental:ended-by-players', () => {
    // Game ended by players, reload to start a new game
    location.reload();
});

// UI Functions
function updatePlayersDisplay() {
    elements.playerCount.textContent = players.length;
    elements.playersCircle.innerHTML = '';

    // Get container dimensions for horizontal oval
    const containerWidth = elements.playersCircle.offsetWidth || 1000;
    const containerHeight = elements.playersCircle.offsetHeight || 400;
    const radiusX = (containerWidth / 2) - 80; // Horizontal radius
    const radiusY = (containerHeight / 2) - 70; // Vertical radius (smaller for oval)
    const centerX = containerWidth / 2;
    const centerY = containerHeight / 2;

    players.forEach((player, index) => {
        const angle = (index / Math.max(players.length, 1)) * 2 * Math.PI - Math.PI / 2;
        const x = centerX + radiusX * Math.cos(angle);
        const y = centerY + radiusY * Math.sin(angle);

        const slot = document.createElement('div');
        slot.className = `player-slot ${player.element}`;
        slot.style.left = `${x}px`;
        slot.style.top = `${y}px`;
        slot.innerHTML = `
            <span class="avatar">${player.avatar}</span>
            <span class="name">${player.nickname}</span>
            <span class="element">${getElementIcon(player.element)}</span>
        `;

        elements.playersCircle.appendChild(slot);
    });
}

function updateArenaPlayers() {
    // Clear existing players except arena center
    const arenaCenter = elements.arena.querySelector('.arena-center');
    elements.arena.innerHTML = '';
    if (arenaCenter) elements.arena.appendChild(arenaCenter);

    const alivePlayers = players.filter(p => p.isAlive);

    // Horizontal oval for TV layout
    const arenaWidth = elements.arena.offsetWidth || 1200;
    const arenaHeight = elements.arena.offsetHeight || 500;
    const radiusX = (arenaWidth / 2) - 120; // Horizontal radius (larger)
    const radiusY = (arenaHeight / 2) - 100;  // Vertical radius (smaller for oval)
    const centerX = arenaWidth / 2;
    const centerY = arenaHeight / 2;

    playerPositions.clear();

    alivePlayers.forEach((player, index) => {
        const angle = (index / alivePlayers.length) * 2 * Math.PI - Math.PI / 2;
        const x = centerX + radiusX * Math.cos(angle);
        const y = centerY + radiusY * Math.sin(angle);

        playerPositions.set(player.socketId, { x, y, nickname: player.nickname });

        const playerEl = document.createElement('div');
        playerEl.className = `arena-player ${player.element}`;
        playerEl.id = `player-${player.socketId}`;
        playerEl.dataset.nickname = player.nickname;
        playerEl.style.left = `${x}px`;
        playerEl.style.top = `${y}px`;
        playerEl.innerHTML = `
            <div class="action-indicator"></div>
            <span class="player-avatar">${player.avatar}</span>
            <span class="player-name">${player.nickname}</span>
            <div class="player-hp">
                <div class="hp-fill" style="width: ${(player.hp / player.maxHp) * 100}%"></div>
            </div>
            <span class="player-element">${getElementIcon(player.element)}</span>
            <div class="focus-bar">
                ${[0,1].map(i => `<span class="focus-pip ${i < (player.focus || 0) ? 'filled' : ''}"></span>`).join('')}
            </div>
        `;

        if (!player.isAlive) {
            playerEl.classList.add('eliminated');
        }

        elements.arena.appendChild(playerEl);
    });
}

function showActionAnimations(actions, results, callback) {
    if (!actions || actions.length === 0) {
        callback();
        return;
    }

    // First show action icons on each player
    actions.forEach(action => {
        const playerEl = findPlayerElement(action.nickname);
        if (!playerEl) return;

        const indicator = playerEl.querySelector('.action-indicator');
        if (indicator) {
            indicator.innerHTML = getActionIcon(action.action);
            indicator.classList.add('show');
        }
    });

    // Wait a moment, then show attack projectiles
    setTimeout(() => {
        actions.forEach(action => {
            const fromPos = getPlayerPosition(action.nickname);
            if (!fromPos) return;

            if (action.action === 'attack-left' && action.targetLeft) {
                const toPos = getPlayerPosition(action.targetLeft);
                if (toPos) {
                    createAttackProjectile(fromPos, toPos, action.element);
                }
            } else if (action.action === 'attack-right' && action.targetRight) {
                const toPos = getPlayerPosition(action.targetRight);
                if (toPos) {
                    createAttackProjectile(fromPos, toPos, action.element);
                }
            } else if (action.action === 'double-attack') {
                if (action.targetLeft) {
                    const toPos = getPlayerPosition(action.targetLeft);
                    if (toPos) createAttackProjectile(fromPos, toPos, action.element);
                }
                if (action.targetRight) {
                    const toPos = getPlayerPosition(action.targetRight);
                    if (toPos) createAttackProjectile(fromPos, toPos, action.element);
                }
            } else if (action.action === 'defend' || action.action === 'mega-defense') {
                createDefenseShield(fromPos, action.action === 'mega-defense');
            } else if (action.action === 'focus') {
                createFocusEffect(fromPos);
            } else if (action.action === 'heal') {
                createHealEffect(fromPos);
            } else if (action.action === 'counter') {
                createCounterEffect(fromPos);
            }
        });

        // Clear action indicators after animations
        setTimeout(() => {
            document.querySelectorAll('.action-indicator').forEach(el => {
                el.classList.remove('show');
                el.innerHTML = '';
            });
            callback();
        }, 800);
    }, 500);
}

function showDamageResults(results, eliminations) {
    // Show damage numbers on affected players
    results.forEach(result => {
        const playerEl = findPlayerElement(result.player);
        if (!playerEl) return;

        if (result.type === 'damage') {
            playerEl.classList.add('damaged');
            createDamageNumber(playerEl, result.damage, 'damage');
            setTimeout(() => playerEl.classList.remove('damaged'), 600);
        } else if (result.type === 'blocked') {
            playerEl.classList.add('defending');
            createDamageNumber(playerEl, result.damage, 'blocked');
            setTimeout(() => playerEl.classList.remove('defending'), 600);
        } else if (result.type === 'counter') {
            // Show counter damage on the attacker (result.target is who got countered)
            const targetEl = findPlayerElement(result.target);
            if (targetEl) {
                targetEl.classList.add('damaged');
                createDamageNumber(targetEl, result.damage, 'counter');
                setTimeout(() => targetEl.classList.remove('damaged'), 600);
            }
        }
    });

    // Show eliminations with explosion effect
    eliminations.forEach(elim => {
        const playerEl = findPlayerElement(elim.player);
        if (playerEl) {
            createEliminationEffect(playerEl);
        }
        addBattleLogEntry(`💀 ${elim.player} eliminato!`);
    });
}

// Animation helper functions
function findPlayerElement(nickname) {
    return document.querySelector(`.arena-player[data-nickname="${nickname}"]`);
}

function getPlayerPosition(nickname) {
    for (const [socketId, pos] of playerPositions) {
        if (pos.nickname === nickname) {
            return pos;
        }
    }
    return null;
}

function getActionIcon(action) {
    const icons = {
        'attack-left': '⚔️←',
        'attack-right': '→⚔️',
        'defend': '🛡️',
        'focus': '✨',
        'double-attack': '⚡⚔️⚡',
        'mega-defense': '🏰',
        'heal': '💚',
        'counter': '🔄'
    };
    return icons[action] || '❓';
}

function createAttackProjectile(from, to, element) {
    const projectile = document.createElement('div');
    projectile.className = `attack-projectile ${element}`;

    const elementEmoji = {
        fire: '🔥',
        water: '💧',
        earth: '🪨',
        air: '💨'
    };
    projectile.innerHTML = elementEmoji[element] || '⚡';

    projectile.style.left = `${from.x}px`;
    projectile.style.top = `${from.y}px`;

    elements.arena.appendChild(projectile);

    // Animate to target
    requestAnimationFrame(() => {
        projectile.style.left = `${to.x}px`;
        projectile.style.top = `${to.y}px`;
        projectile.classList.add('flying');
    });

    // Remove after animation
    setTimeout(() => projectile.remove(), 600);
}

function createDefenseShield(pos, isMega) {
    const shield = document.createElement('div');
    shield.className = `defense-shield ${isMega ? 'mega' : ''}`;
    shield.innerHTML = isMega ? '🏰' : '🛡️';
    shield.style.left = `${pos.x}px`;
    shield.style.top = `${pos.y}px`;

    elements.arena.appendChild(shield);

    setTimeout(() => shield.remove(), 1000);
}

function createFocusEffect(pos) {
    const focus = document.createElement('div');
    focus.className = 'focus-effect';
    focus.innerHTML = '✨';
    focus.style.left = `${pos.x}px`;
    focus.style.top = `${pos.y}px`;

    elements.arena.appendChild(focus);

    // Create orbiting sparkles
    for (let i = 0; i < 3; i++) {
        const sparkle = document.createElement('div');
        sparkle.className = 'focus-sparkle';
        sparkle.innerHTML = '⭐';
        sparkle.style.left = `${pos.x}px`;
        sparkle.style.top = `${pos.y}px`;
        sparkle.style.animationDelay = `${i * 0.2}s`;
        elements.arena.appendChild(sparkle);
        setTimeout(() => sparkle.remove(), 1000);
    }

    setTimeout(() => focus.remove(), 1000);
}

function createHealEffect(pos) {
    const heal = document.createElement('div');
    heal.className = 'heal-effect';
    heal.innerHTML = '💚+30';
    heal.style.left = `${pos.x}px`;
    heal.style.top = `${pos.y}px`;

    elements.arena.appendChild(heal);

    // Create green particles
    for (let i = 0; i < 5; i++) {
        const particle = document.createElement('div');
        particle.className = 'heal-particle';
        particle.innerHTML = '✚';
        particle.style.left = `${pos.x + (Math.random() - 0.5) * 60}px`;
        particle.style.top = `${pos.y + 30}px`;
        elements.arena.appendChild(particle);
        setTimeout(() => particle.remove(), 1000);
    }

    setTimeout(() => heal.remove(), 1000);
}

function createCounterEffect(pos) {
    const counter = document.createElement('div');
    counter.className = 'counter-effect';
    counter.innerHTML = '🔄';
    counter.style.left = `${pos.x}px`;
    counter.style.top = `${pos.y}px`;

    elements.arena.appendChild(counter);

    setTimeout(() => counter.remove(), 1000);
}

function createDamageNumber(playerEl, damage, type) {
    const rect = playerEl.getBoundingClientRect();
    const arenaRect = elements.arena.getBoundingClientRect();

    const dmgNum = document.createElement('div');
    dmgNum.className = `damage-number ${type}`;

    if (type === 'damage') {
        dmgNum.innerHTML = `-${damage}`;
    } else if (type === 'blocked') {
        dmgNum.innerHTML = `🛡️ -${damage}`;
    } else if (type === 'counter') {
        dmgNum.innerHTML = `🔄 -${damage}`;
    }

    dmgNum.style.left = `${rect.left - arenaRect.left + rect.width / 2}px`;
    dmgNum.style.top = `${rect.top - arenaRect.top}px`;

    elements.arena.appendChild(dmgNum);

    setTimeout(() => dmgNum.remove(), 1500);
}

function createEliminationEffect(playerEl) {
    playerEl.classList.add('eliminating');

    const rect = playerEl.getBoundingClientRect();
    const arenaRect = elements.arena.getBoundingClientRect();
    const x = rect.left - arenaRect.left + rect.width / 2;
    const y = rect.top - arenaRect.top + rect.height / 2;

    // Create explosion particles
    for (let i = 0; i < 12; i++) {
        const particle = document.createElement('div');
        particle.className = 'explosion-particle';
        particle.innerHTML = ['💥', '✨', '⭐', '💫'][Math.floor(Math.random() * 4)];
        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        particle.style.setProperty('--angle', `${(i / 12) * 360}deg`);
        elements.arena.appendChild(particle);
        setTimeout(() => particle.remove(), 1000);
    }

    // Show skull
    const skull = document.createElement('div');
    skull.className = 'elimination-skull';
    skull.innerHTML = '💀';
    skull.style.left = `${x}px`;
    skull.style.top = `${y}px`;
    elements.arena.appendChild(skull);
    setTimeout(() => skull.remove(), 1500);
}

function addBattleLogEntry(text) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = text;
    elements.battleLog.prepend(entry);

    // Keep only last 10 entries
    while (elements.battleLog.children.length > 10) {
        elements.battleLog.removeChild(elements.battleLog.lastChild);
    }
}

function showFinalScreen(winner, rankings) {
    clearInterval(matchCountdown);
    clearInterval(turnCountdown);
    showScreen('final');

    if (winner) {
        elements.winnerDisplay.innerHTML = `
            <span class="winner-avatar">${winner.avatar}</span>
            <div class="winner-name">${winner.nickname}</div>
            <div class="winner-element">${getElementIcon(winner.element)}</div>
        `;
    } else {
        elements.winnerDisplay.innerHTML = `<div class="winner-name">Pareggio!</div>`;
    }

    if (rankings) {
        elements.finalStats.innerHTML = rankings.map((p, i) => `
            <div class="final-rank">
                <span class="rank">#${i + 1}</span>
                <span class="avatar">${p.avatar}</span>
                <span class="name">${p.nickname}</span>
                <span class="stats">
                    ${p.stats.kills} kills | ${p.stats.damageDealt} danni
                </span>
            </div>
        `).join('');
    }

    startFinalCountdown();
}

function updateStartButton() {
    elements.btnStartGame.disabled = players.length < 2;
    elements.btnStartGame.textContent = players.length < 2
        ? 'ATTENDI GIOCATORI'
        : 'INIZIA BATTAGLIA';
}

function startAutoStartTimer() {
    let countdown = 60;
    elements.countdownTimer.textContent = countdown;

    autoStartTimer = setInterval(() => {
        countdown--;
        elements.countdownTimer.textContent = countdown;

        if (countdown <= 0) {
            clearInterval(autoStartTimer);
            if (players.length >= 2) {
                socket.emit('elemental:host-start', { pin: gamePin });
            } else {
                startAutoStartTimer();
            }
        }
    }, 1000);
}

function resetAutoStartTimer() {
    clearInterval(autoStartTimer);
    startAutoStartTimer();
}

function startTurnTimer(duration) {
    let remaining = duration;
    elements.turnTimer.textContent = remaining;

    clearInterval(turnCountdown);
    turnCountdown = setInterval(() => {
        remaining--;
        elements.turnTimer.textContent = remaining;

        if (remaining <= 0) {
            clearInterval(turnCountdown);
        }
    }, 1000);
}

function startMatchTimer() {
    let remaining = 600; // 10 minutes
    updateMatchTimerDisplay(remaining);

    matchCountdown = setInterval(() => {
        remaining--;
        updateMatchTimerDisplay(remaining);

        if (remaining <= 0) {
            clearInterval(matchCountdown);
        }
    }, 1000);
}

function updateMatchTimerDisplay(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    elements.matchTimer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
}

function startFinalCountdown() {
    let countdown = 30;
    elements.finalCountdownTimer.textContent = countdown;

    const timer = setInterval(() => {
        countdown--;
        elements.finalCountdownTimer.textContent = countdown;

        if (countdown <= 0) {
            clearInterval(timer);
            location.reload();
        }
    }, 1000);
}

function getElementIcon(element) {
    const icons = {
        fire: '🔥',
        water: '💧',
        earth: '🌍',
        air: '💨'
    };
    return icons[element] || '?';
}

// Mini-game helper functions
function displayMiniGameContent(miniGame) {
    let content = '';

    switch (miniGame.type) {
        case 'color_touch':
            // Stroop effect: show which TEXT to find (not color)
            const targetText = miniGame.targetColor || 'red';
            const colorNamesIt = { red: 'ROSSO', blue: 'BLU', green: 'VERDE', yellow: 'GIALLO' };
            content = `
                <div class="stroop-challenge">
                    <div class="stroop-instruction">Clicca il tasto con la scritta:</div>
                    <div class="stroop-target">${colorNamesIt[targetText]}</div>
                </div>
                <div class="hint">Attento! Il colore del tasto è diverso dalla scritta!</div>
            `;
            break;

        case 'dodge':
            const arrows = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️' };
            content = `
                <div class="dodge-display">
                    <div class="attack-direction">${arrows[miniGame.showDirection]}</div>
                    <div class="dodge-hint">Premi la direzione OPPOSTA!</div>
                </div>
            `;
            break;

        case 'lucky_symbol':
            // Show only 3 visible symbols, player must find the missing one
            const symbols = miniGame.visibleSymbols || miniGame.options.slice(0, 3);
            content = `
                <div class="symbols-display">
                    ${symbols.map(symbol => `
                        <div class="symbol-option">${symbol}</div>
                    `).join('')}
                    <div class="symbol-option missing">❓</div>
                </div>
                <div class="hint">Quale simbolo manca?</div>
            `;
            break;

        case 'double_nothing':
            content = `
                <div class="coin-flip-display">
                    <div class="coin spinning" id="coin-display">
                        <div class="coin-side">🪙</div>
                    </div>
                    <div class="coin-options">
                        <span class="coin-option">👑 TESTA</span>
                        <span class="coin-vs">o</span>
                        <span class="coin-option">🦅 CROCE</span>
                    </div>
                </div>
                <div class="hint">Indovina il lancio!</div>
            `;
            break;

        case 'element_boost':
            // Show the element to beat
            const elementToShow = miniGame.showElement || 'fire';
            content = `
                <div class="element-challenge">
                    <div class="challenge-element ${elementToShow}">
                        ${getElementIcon(elementToShow)}
                    </div>
                </div>
                <div class="hint">Quale elemento BATTE ${getElementIcon(elementToShow)}?</div>
            `;
            break;

        case 'chaos_target':
            // Reflex game - show WAIT then GO
            const goDelay = miniGame.goDelay || 2000;
            content = `
                <div class="reflex-display">
                    <div class="reflex-signal" id="reflex-signal">ATTENDI...</div>
                </div>
                <div class="hint">Premi quando appare GO!</div>
            `;
            // Schedule the GO signal
            setTimeout(() => {
                const signal = document.getElementById('reflex-signal');
                if (signal) {
                    signal.textContent = 'GO!';
                    signal.classList.add('go');
                }
            }, goDelay);
            break;

        case 'memory_flash':
            // Show sequence for a few seconds, then hide
            const sequence = miniGame.correctSequence || ['🔥', '💧', '🌍'];
            const showTime = miniGame.showDuration || 2500;
            content = `
                <div class="memory-display">
                    <div class="memory-instruction">MEMORIZZA!</div>
                    <div class="memory-sequence" id="memory-sequence">
                        ${sequence.map(icon => `<span class="memory-icon">${icon}</span>`).join('')}
                    </div>
                </div>
            `;
            // Hide sequence after showDuration
            setTimeout(() => {
                const seqEl = document.getElementById('memory-sequence');
                if (seqEl) {
                    seqEl.innerHTML = '<span class="memory-hidden">❓ ❓ ❓</span>';
                    seqEl.classList.add('hidden-mode');
                }
                const instrEl = document.querySelector('.memory-instruction');
                if (instrEl) {
                    instrEl.textContent = 'Qual era la sequenza?';
                }
            }, showTime);
            break;

        case 'turbo_runner':
            // Racing game - show track with runners
            const targetTaps = miniGame.targetTaps || 30;
            content = `
                <div class="race-display">
                    <div class="race-track" id="race-track">
                        <div class="race-start">🏁</div>
                        <div class="race-lanes" id="race-lanes">
                            <!-- Runners will be added dynamically -->
                        </div>
                        <div class="race-finish">🏆</div>
                    </div>
                    <div class="race-hint">Tappa veloce per correre! (${targetTaps} tap per vincere)</div>
                </div>
            `;
            // Initialize runners for current players
            setTimeout(() => {
                initializeRaceRunners();
            }, 100);
            break;

        case 'quick_opposites':
            // Quick opposites - show direction arrows one at a time
            const directionIcons = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️' };
            const oppSeq = miniGame.sequence || [];
            content = `
                <div class="opposites-display">
                    <div class="opposites-round">Round <span id="opposites-round-num">1</span>/3</div>
                    <div class="opposites-direction" id="opposites-direction">
                        <span class="direction-arrow">${oppSeq[0] ? directionIcons[oppSeq[0].show] : '❓'}</span>
                    </div>
                    <div class="opposites-hint">Clicca la direzione OPPOSTA!</div>
                </div>
            `;
            // Change direction every roundTime
            if (oppSeq.length > 0) {
                const roundTime = miniGame.roundTime || 3000;
                setTimeout(() => {
                    const dirEl = document.getElementById('opposites-direction');
                    const roundEl = document.getElementById('opposites-round-num');
                    if (dirEl && oppSeq[1]) {
                        dirEl.innerHTML = `<span class="direction-arrow">${directionIcons[oppSeq[1].show]}</span>`;
                        if (roundEl) roundEl.textContent = '2';
                    }
                }, roundTime);
                setTimeout(() => {
                    const dirEl = document.getElementById('opposites-direction');
                    const roundEl = document.getElementById('opposites-round-num');
                    if (dirEl && oppSeq[2]) {
                        dirEl.innerHTML = `<span class="direction-arrow">${directionIcons[oppSeq[2].show]}</span>`;
                        if (roundEl) roundEl.textContent = '3';
                    }
                }, roundTime * 2);
            }
            break;

        default:
            content = '<div class="generic-display">Preparati!</div>';
    }

    elements.minigameDisplay.innerHTML = content;
}

function getColorHex(color) {
    const colors = {
        red: '#ef4444',
        blue: '#3b82f6',
        green: '#22c55e',
        yellow: '#eab308'
    };
    return colors[color] || '#888';
}

function formatAnswer(answer, type) {
    if (type === 'color_touch') {
        const colorNames = { red: 'Rosso', blue: 'Blu', green: 'Verde', yellow: 'Giallo' };
        return colorNames[answer] || answer;
    }
    if (type === 'dodge') {
        const dirNames = { up: '⬆️ Su', down: '⬇️ Giù', left: '⬅️ Sinistra', right: '➡️ Destra' };
        return dirNames[answer] || answer;
    }
    if (type === 'double_nothing') {
        const coinNames = { testa: '👑 TESTA', croce: '🦅 CROCE' };
        return coinNames[answer] || answer;
    }
    if (type === 'element_boost') {
        const elemNames = { fire: '🔥 Fuoco', water: '💧 Acqua', earth: '🌍 Terra', air: '💨 Aria' };
        return elemNames[answer] || answer;
    }
    return answer;
}

function startMiniGameTimer(duration) {
    let remaining = Math.ceil(duration / 1000);
    elements.minigameTimer.textContent = remaining;

    clearInterval(minigameCountdown);
    minigameCountdown = setInterval(() => {
        remaining--;
        elements.minigameTimer.textContent = remaining;

        if (remaining <= 0) {
            clearInterval(minigameCountdown);
        }
    }, 1000);
}

// Turbo Runner helper functions
function initializeRaceRunners() {
    const lanesContainer = document.getElementById('race-lanes');
    if (!lanesContainer) return;

    const alivePlayers = players.filter(p => p.isAlive);
    lanesContainer.innerHTML = alivePlayers.map(p => `
        <div class="race-lane" data-socket-id="${p.socketId}">
            <div class="runner" id="runner-${p.socketId}" style="left: 0%">
                <span class="runner-avatar">${p.avatar}</span>
                <span class="runner-name">${p.nickname}</span>
            </div>
            <div class="lane-progress">
                <span class="tap-count" id="taps-${p.socketId}">0</span>/<span>${currentTargetTaps}</span>
            </div>
        </div>
    `).join('');
}

function updateRunnerProgress(socketId, tapCount, finished) {
    const runner = document.getElementById(`runner-${socketId}`);
    const tapCountEl = document.getElementById(`taps-${socketId}`);

    if (runner) {
        const progress = Math.min(100, (tapCount / currentTargetTaps) * 100);
        runner.style.left = `${progress}%`;

        if (finished) {
            runner.classList.add('finished');
        }
    }

    if (tapCountEl) {
        tapCountEl.textContent = tapCount;
    }
}

// Socket handler for runner progress
socket.on('elemental:runner-progress', ({ socketId, nickname, avatar, tapCount, finished }) => {
    updateRunnerProgress(socketId, tapCount, finished);
});

// Shuffle position animation functions
function showShuffleAnnouncement() {
    const announcement = document.createElement('div');
    announcement.className = 'shuffle-announcement';
    announcement.innerHTML = `
        <div class="shuffle-icon">🔀</div>
        <div class="shuffle-text">POSIZIONI MISCHIATE!</div>
    `;
    document.body.appendChild(announcement);

    setTimeout(() => {
        announcement.classList.add('fade-out');
        setTimeout(() => announcement.remove(), 500);
    }, 2500);
}

function animatePositionShuffle(shuffleData) {
    const arena = document.getElementById('arena-players');
    if (!arena) return;

    const totalPlayers = shuffleData.length;

    // Calculate positions in a circle (same as updateArenaPlayers)
    function getCirclePosition(index, total) {
        const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
        const radiusX = 42;
        const radiusY = 38;
        return {
            x: 50 + radiusX * Math.cos(angle),
            y: 50 + radiusY * Math.sin(angle)
        };
    }

    // Animate each player to their new position
    shuffleData.forEach((playerData) => {
        const playerEl = arena.querySelector(`[data-socket-id="${playerData.socketId}"]`);
        if (playerEl) {
            // Add shuffle animation class
            playerEl.classList.add('shuffling');

            // Calculate new position
            const newPos = getCirclePosition(playerData.newPosition, totalPlayers);

            // First, move to center
            setTimeout(() => {
                playerEl.style.left = '50%';
                playerEl.style.top = '50%';
            }, 100);

            // Then, move to new position
            setTimeout(() => {
                playerEl.style.left = `${newPos.x}%`;
                playerEl.style.top = `${newPos.y}%`;
            }, 1000);

            // Remove animation class
            setTimeout(() => {
                playerEl.classList.remove('shuffling');
            }, 2000);
        }
    });

    // Update players array with new positions
    shuffleData.forEach((playerData) => {
        const player = players.find(p => p.socketId === playerData.socketId);
        if (player) {
            player.position = playerData.newPosition;
        }
    });

    // Re-sort players by new position
    players.sort((a, b) => (a.position || 0) - (b.position || 0));
}

// Start
init();
