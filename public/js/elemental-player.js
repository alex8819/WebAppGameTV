// Elemental Clash Player JavaScript

const socket = io();

// DOM Elements
const screens = {
    join: document.getElementById('join-screen'),
    lobby: document.getElementById('player-lobby'),
    minigame: document.getElementById('minigame-screen'),
    minigameResult: document.getElementById('minigame-result-screen'),
    battle: document.getElementById('battle-screen'),
    resolution: document.getElementById('resolution-screen'),
    spectator: document.getElementById('spectator-screen'),
    winner: document.getElementById('winner-screen')
};

const elements = {
    pinInput: document.getElementById('pin-input'),
    nicknameInput: document.getElementById('nickname-input'),
    avatarSelector: document.getElementById('avatar-selector'),
    elementSelector: document.getElementById('element-selector'),
    elementInfo: document.getElementById('element-info'),
    btnJoin: document.getElementById('btn-join'),
    joinError: document.getElementById('join-error'),
    lobbyPinDisplay: document.getElementById('lobby-pin-display'),
    yourAvatar: document.getElementById('your-avatar'),
    yourName: document.getElementById('your-name'),
    yourElement: document.getElementById('your-element'),
    lobbyPlayerCount: document.getElementById('lobby-player-count'),
    lobbyPlayersList: document.getElementById('lobby-players-list'),
    hpFill: document.getElementById('hp-fill'),
    hpValue: document.getElementById('hp-value'),
    battleTimer: document.getElementById('battle-timer'),
    focusDots: document.getElementById('focus-dots'),
    neighborLeft: document.getElementById('neighbor-left'),
    neighborRight: document.getElementById('neighbor-right'),
    actionButtons: document.getElementById('action-buttons'),
    specialActions: document.getElementById('special-actions'),
    actionSelected: document.getElementById('action-selected'),
    selectedActionText: document.getElementById('selected-action-text'),
    resolutionResult: document.getElementById('resolution-result'),
    hpChange: document.getElementById('hp-change'),
    playersRemaining: document.getElementById('players-remaining'),
    winnerResult: document.getElementById('winner-result'),
    playerFinalStats: document.getElementById('player-final-stats'),
    btnPlayAgain: document.getElementById('btn-play-again'),
    exitBtn: document.getElementById('exit-btn'),
    exitStatus: document.getElementById('exit-status'),
    exitCount: document.getElementById('exit-count'),
    exitTotal: document.getElementById('exit-total'),
    // Mini-game elements
    minigameTitle: document.getElementById('player-minigame-title'),
    minigameDescription: document.getElementById('player-minigame-description'),
    minigameTimer: document.getElementById('player-minigame-timer'),
    minigameButtons: document.getElementById('minigame-buttons'),
    minigameAnswered: document.getElementById('minigame-answered'),
    resultRank: document.getElementById('player-result-rank'),
    resultCorrect: document.getElementById('player-result-correct'),
    resultBonus: document.getElementById('player-result-bonus')
};

let hasVotedExit = false;
let minigameAnswerSent = false;
let minigameTimerInterval = null;
let currentMiniGame = null;

let gamePin = null;
let selectedAvatar = null;
let selectedElement = null;
let myState = {
    hp: 100,
    focus: 0,
    isAlive: true
};

// Element info texts
const elementInfoTexts = {
    fire: '🔥 Fuoco: +30% danno vs Aria, -30% danno vs Acqua',
    water: '💧 Acqua: +30% danno vs Fuoco, -30% danno vs Terra',
    earth: '🌍 Terra: +30% danno vs Acqua, -30% danno vs Aria',
    air: '💨 Aria: +30% danno vs Terra, -30% danno vs Fuoco'
};

// Direction icons helper
function getDirectionIcon(direction) {
    const icons = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️' };
    return icons[direction] || '❓';
}

// Initialize
function init() {
    setupEventListeners();
    checkUrlParams();
}

function setupEventListeners() {
    // Avatar selection
    elements.avatarSelector.addEventListener('click', (e) => {
        const btn = e.target.closest('.avatar-btn');
        if (!btn) return;

        elements.avatarSelector.querySelectorAll('.avatar-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedAvatar = btn.dataset.avatar;
    });

    // Element selection
    elements.elementSelector.addEventListener('click', (e) => {
        const btn = e.target.closest('.element-btn');
        if (!btn) return;

        elements.elementSelector.querySelectorAll('.element-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedElement = btn.dataset.element;
        elements.elementInfo.textContent = elementInfoTexts[selectedElement];
    });

    // Join button
    elements.btnJoin.addEventListener('click', () => {
        joinGame();
    });

    // Enter key on inputs
    elements.nicknameInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') joinGame();
    });

    // Action buttons
    elements.actionButtons.addEventListener('click', (e) => {
        const btn = e.target.closest('.action-btn');
        if (!btn) return;

        selectAction(btn.dataset.action);
    });

    // Special action buttons
    elements.specialActions.addEventListener('click', (e) => {
        const btn = e.target.closest('.special-btn');
        if (!btn || btn.disabled) return;

        selectAction(btn.dataset.special);
    });

    // Play again
    elements.btnPlayAgain.addEventListener('click', () => {
        location.reload();
    });

    // Exit button
    elements.exitBtn.addEventListener('click', () => {
        if (hasVotedExit) {
            // Cancel vote
            hasVotedExit = false;
            elements.exitBtn.classList.remove('voted');
            socket.emit('elemental:vote-exit', { pin: gamePin, vote: false });
        } else {
            // Vote to exit
            hasVotedExit = true;
            elements.exitBtn.classList.add('voted');
            socket.emit('elemental:vote-exit', { pin: gamePin, vote: true });
        }
    });
}

function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const pin = urlParams.get('pin');
    if (pin) {
        elements.pinInput.value = pin;
    }
}

function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[screenName].classList.remove('hidden');
}

function showError(message) {
    elements.joinError.textContent = message;
    elements.joinError.classList.remove('hidden');
    setTimeout(() => {
        elements.joinError.classList.add('hidden');
    }, 3000);
}

function joinGame() {
    const pin = elements.pinInput.value.trim();
    const nickname = elements.nicknameInput.value.trim();

    if (!pin || pin.length !== 4) {
        showError('Inserisci un PIN valido (4 cifre)');
        return;
    }

    if (!nickname || nickname.length < 1) {
        showError('Inserisci un nickname');
        return;
    }

    if (!selectedAvatar) {
        showError('Scegli un avatar');
        return;
    }

    if (!selectedElement) {
        showError('Scegli un elemento');
        return;
    }

    gamePin = pin;
    socket.emit('elemental:player-join', {
        pin,
        nickname,
        avatar: selectedAvatar,
        element: selectedElement
    });
}

function selectAction(action) {
    if (actionSent) return; // Prevent double submission
    actionSent = true;

    socket.emit('elemental:player-action', {
        pin: gamePin,
        action
    });

    // Show selected action
    elements.actionButtons.classList.add('hidden');
    elements.specialActions.classList.add('hidden');
    elements.actionSelected.classList.remove('hidden');

    const actionNames = {
        'attack-left': '⚔️ Attacco Sinistra',
        'attack-right': '⚔️ Attacco Destra',
        'defend': '🛡️ Difesa',
        'focus': '✨ Focus',
        'double-attack': '⚡ Doppio Attacco',
        'mega-defense': '🏰 Mega Difesa',
        'heal': '💚 Cura',
        'counter': '🔄 Contrattacco'
    };

    elements.selectedActionText.textContent = actionNames[action] || action;
    console.log(`Action sent: ${action}`);
}

function updateFocusDots(focusCount) {
    const dots = elements.focusDots.querySelectorAll('.focus-dot');
    dots.forEach((dot, index) => {
        dot.classList.toggle('filled', index < focusCount);
    });

    // Enable/disable special abilities
    const specialBtns = elements.specialActions.querySelectorAll('.special-btn');
    specialBtns.forEach(btn => {
        btn.disabled = focusCount < 2;
    });

    // Show special actions section if focus is full
    elements.specialActions.classList.toggle('hidden', focusCount < 2);
}

function updateNeighborsDisplay(neighbors) {
    // Wrapper function for position changes
    updateNeighbors(neighbors.left, neighbors.right);
}

function updateNeighbors(left, right) {
    if (left) {
        elements.neighborLeft.querySelector('.neighbor-avatar').textContent = left.avatar;
        elements.neighborLeft.querySelector('.neighbor-name').textContent = left.nickname;
        elements.neighborLeft.querySelector('.neighbor-element').textContent = getElementIcon(left.element);
    } else {
        elements.neighborLeft.querySelector('.neighbor-avatar').textContent = '?';
        elements.neighborLeft.querySelector('.neighbor-name').textContent = '---';
        elements.neighborLeft.querySelector('.neighbor-element').textContent = '?';
    }

    if (right) {
        elements.neighborRight.querySelector('.neighbor-avatar').textContent = right.avatar;
        elements.neighborRight.querySelector('.neighbor-name').textContent = right.nickname;
        elements.neighborRight.querySelector('.neighbor-element').textContent = getElementIcon(right.element);
    } else {
        elements.neighborRight.querySelector('.neighbor-avatar').textContent = '?';
        elements.neighborRight.querySelector('.neighbor-name').textContent = '---';
        elements.neighborRight.querySelector('.neighbor-element').textContent = '?';
    }
}

function updateHP(hp, maxHp) {
    const percent = (hp / maxHp) * 100;
    elements.hpFill.style.width = `${percent}%`;
    elements.hpValue.textContent = hp;

    // Change color based on HP
    if (percent <= 25) {
        elements.hpFill.style.background = 'linear-gradient(90deg, #ef4444, #f97316)';
    } else if (percent <= 50) {
        elements.hpFill.style.background = 'linear-gradient(90deg, #f97316, #eab308)';
    } else {
        elements.hpFill.style.background = 'linear-gradient(90deg, #22c55e, #84cc16)';
    }
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

// Socket Events
socket.on('elemental:join-error', ({ message }) => {
    showError(message);
});

socket.on('elemental:joined', ({ gamePin: pin, players, player }) => {
    gamePin = pin;
    showScreen('lobby');

    elements.lobbyPinDisplay.textContent = pin;
    elements.yourAvatar.textContent = player.avatar;
    elements.yourName.textContent = player.nickname;
    elements.yourElement.textContent = `${getElementIcon(player.element)} ${player.element.charAt(0).toUpperCase() + player.element.slice(1)}`;

    updateLobbyPlayers(players);
});

socket.on('elemental:lobby-update', ({ players }) => {
    updateLobbyPlayers(players);
});

socket.on('elemental:game-started', () => {
    // Show exit button
    elements.exitBtn.classList.remove('hidden');
    hasVotedExit = false;
    elements.exitBtn.classList.remove('voted');
    // Don't show battle screen yet - wait for mini-game
});

// Mini-game handlers
socket.on('elemental:minigame-start', ({ round, miniGame }) => {
    showScreen('minigame');
    currentMiniGame = miniGame;
    minigameAnswerSent = false;

    elements.minigameTitle.textContent = miniGame.name;
    elements.minigameDescription.textContent = miniGame.description;
    elements.minigameAnswered.classList.add('hidden');

    // Generate buttons based on mini-game type
    generateMiniGameButtons(miniGame);

    // Start timer
    startMiniGameTimer(miniGame.duration);
});

socket.on('elemental:minigame-confirmed', () => {
    // Answer was accepted
    elements.minigameButtons.classList.add('hidden');
    elements.minigameAnswered.classList.remove('hidden');
});

socket.on('elemental:tap-progress', ({ tapCount, finished }) => {
    // Update tap count display for turbo runner
    const tapCountEl = document.getElementById('player-tap-count');
    if (tapCountEl) {
        tapCountEl.textContent = tapCount;
    }

    const tapBtn = document.getElementById('turbo-tap-btn');
    if (finished && tapBtn) {
        // Player finished the race
        minigameAnswerSent = true;
        tapBtn.classList.add('finished');
        tapBtn.querySelector('.turbo-text').textContent = 'FINITO!';
        tapBtn.querySelector('.turbo-icon').textContent = '🏆';
    }
});

socket.on('elemental:race-damage', ({ damage, fromPlayer }) => {
    // Show damage notification from race winner
    const notification = document.createElement('div');
    notification.className = 'race-damage-notification';
    notification.innerHTML = `🏃💥 -${damage} HP da ${fromPlayer}!`;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 2000);
});

socket.on('elemental:opposites-answer', ({ round, isCorrect, finished }) => {
    // Update result display for quick opposites
    const resultEl = document.getElementById('player-opp-result');
    if (resultEl) {
        resultEl.innerHTML += isCorrect ? ' ✅' : ' ❌';
    }

    if (finished) {
        minigameAnswerSent = true;
        elements.minigameButtons.classList.add('hidden');
        elements.minigameAnswered.classList.remove('hidden');
    }
});

socket.on('elemental:opposites-damage', ({ damage, fromPlayer }) => {
    // Show damage notification from opposites winner
    const notification = document.createElement('div');
    notification.className = 'race-damage-notification';
    notification.innerHTML = `💥 -${damage} HP da ${fromPlayer}!`;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 2000);
});

socket.on('elemental:positions-changed', ({ neighbors }) => {
    // Show shuffle notification
    const notification = document.createElement('div');
    notification.className = 'shuffle-notification';
    notification.innerHTML = `🔀 Posizioni mischiate!`;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 2500);

    // Update neighbors display if on battle screen
    if (neighbors) {
        updateNeighborsDisplay(neighbors);
    }
});

socket.on('elemental:minigame-your-result', ({ rank, isCorrect, bonus }) => {
    clearInterval(minigameTimerInterval);
    showScreen('minigameResult');

    elements.resultRank.textContent = `#${rank}`;
    elements.resultRank.className = `result-rank ${rank === 1 ? 'first' : (rank === 2 ? 'second' : '')}`;
    elements.resultCorrect.textContent = isCorrect ? '✅' : '❌';

    // Show bonus
    let bonusText = '';
    if (bonus) {
        const focusText = bonus.focusBoost ? ` +${bonus.focusBoost}✨` : '';

        if (bonus.coinWon === true) {
            const coinName = bonus.coinResult === 'testa' ? '👑 TESTA' : '🦅 CROCE';
            bonusText = `🪙✅ ${coinName}! +25% danni${focusText}`;
        } else if (bonus.coinWon === false) {
            const coinName = bonus.coinResult === 'testa' ? '👑 TESTA' : '🦅 CROCE';
            bonusText = `🪙❌ Era ${coinName}! +20 danni subiti`;
        } else if (bonus.tooEarly) {
            bonusText = '⏱️ TROPPO PRESTO! +15 danni subiti';
        } else if (bonus.reflexWin) {
            bonusText = `⚡ RIFLESSI! +30% danni${focusText}`;
        } else if (bonus.memoryWin) {
            bonusText = '🧠 MEMORIA! +1✨ +10 HP';
        } else if (bonus.racerWin) {
            bonusText = `🏆 VITTORIA! 10 danni a sinistra${focusText}`;
        } else if (bonus.oppositesWin) {
            bonusText = `💥 OPPOSTI! 10 danni a TUTTI${focusText}`;
        } else if (bonus.damageBonus) {
            const percent = Math.round(bonus.damageBonus * 100);
            bonusText = `⚔️ +${percent}% danni${focusText}`;
        } else if (bonus.priority) {
            bonusText = `⚡ Priorità${focusText}`;
        } else if (bonus.shield) {
            bonusText = `🛡️ Scudo 30%${focusText}`;
        } else if (bonus.focusBoost) {
            bonusText = `✨ +${bonus.focusBoost} Focus`;
        } else if (bonus.damageTaken) {
            bonusText = `💔 +${bonus.damageTaken} danni subiti`;
        }

        // Add HP loss for last place
        if (bonus.hpLoss) {
            bonusText = bonusText ? `${bonusText} | -${bonus.hpLoss} HP` : `💔 -${bonus.hpLoss} HP`;
        }
    }
    elements.resultBonus.textContent = bonusText;
});

socket.on('elemental:round-start', ({ round, turnTime, state, bonus }) => {
    myState = state;

    // Show battle screen (might be coming from resolution)
    showScreen('battle');

    // Reset UI for new round
    elements.actionButtons.classList.remove('hidden');
    elements.actionSelected.classList.add('hidden');

    // Reset all action button states
    elements.actionButtons.querySelectorAll('.action-btn').forEach(btn => {
        btn.classList.remove('selected');
        btn.disabled = false;
    });

    updateHP(state.hp, state.maxHp || 100);
    updateFocusDots(state.focus);
    updateNeighbors(state.neighbors?.left, state.neighbors?.right);

    // Start timer
    startTurnTimer(turnTime);

    console.log(`Round ${round} started, turn time: ${turnTime}s`);
});

socket.on('elemental:your-result', ({ damage, healed, blocked, attackedBy, eliminated }) => {
    showScreen('resolution');

    let resultText = '';
    let changeClass = '';
    let changeText = '';

    if (eliminated) {
        resultText = '💀 Sei stato eliminato!';
        changeClass = 'damage';
        changeText = `-${damage || 0}`;
    } else if (blocked && damage > 0) {
        const reducedDamage = Math.round(damage);
        resultText = '🛡️ Hai bloccato parte del danno!';
        changeClass = 'blocked';
        changeText = `-${reducedDamage}`;
    } else if (damage > 0) {
        const attackerNames = attackedBy?.map(a => a.name).join(' e ') || 'qualcuno';
        resultText = `⚔️ Attaccato da ${attackerNames}`;
        changeClass = 'damage';
        changeText = `-${damage}`;
    } else if (healed > 0) {
        resultText = '💚 Ti sei curato!';
        changeClass = 'heal';
        changeText = `+${healed}`;
    } else {
        resultText = 'Nessun danno subito questo round';
        changeClass = '';
        changeText = '+0';
    }

    elements.resolutionResult.textContent = resultText;
    elements.hpChange.textContent = changeText;
    elements.hpChange.className = `hp-change ${changeClass}`;

    console.log(`Result received: damage=${damage}, healed=${healed}, blocked=${blocked}, eliminated=${eliminated}`);

    // If eliminated, show spectator after delay
    if (eliminated) {
        setTimeout(() => {
            showScreen('spectator');
        }, 2500);
    }
    // Otherwise, wait for next round-start event from server
});

socket.on('elemental:eliminated', ({ playersRemaining }) => {
    showScreen('spectator');
    elements.playersRemaining.textContent = playersRemaining;
});

socket.on('elemental:game-ended', ({ rankings, yourRank }) => {
    showScreen('winner');

    if (yourRank === 1) {
        elements.winnerResult.innerHTML = '<span class="victory">🏆 VITTORIA! 🏆</span>';
        elements.winnerResult.classList.add('victory');
    } else {
        elements.winnerResult.innerHTML = `Posizione: <strong>#${yourRank}</strong>`;
        elements.winnerResult.classList.remove('victory');
    }

    elements.playerFinalStats.innerHTML = `
        <div>Partita terminata!</div>
        <div>Sei arrivato #${yourRank} su ${rankings.length} giocatori</div>
    `;
});

socket.on('disconnect', () => {
    showError('Connessione persa!');
});

// Exit vote handlers
socket.on('elemental:exit-update', ({ votedCount, totalPlayers }) => {
    elements.exitCount.textContent = votedCount;
    elements.exitTotal.textContent = totalPlayers;

    if (votedCount > 0) {
        elements.exitStatus.classList.remove('hidden');
    } else {
        elements.exitStatus.classList.add('hidden');
    }
});

socket.on('elemental:ended-by-players', () => {
    // Game ended, reload to go back to join screen
    location.reload();
});

socket.on('elemental:host-left', () => {
    // Host left, reload
    location.reload();
});

// Helper functions
function updateLobbyPlayers(players) {
    elements.lobbyPlayerCount.textContent = players.length;
    elements.lobbyPlayersList.innerHTML = players.map(p => `
        <li>
            <span class="avatar">${p.avatar}</span>
            <span class="name">${p.nickname}</span>
            <span class="element">${getElementIcon(p.element)}</span>
        </li>
    `).join('');
}

let turnTimer = null;
let actionSent = false;

function startTurnTimer(duration) {
    let remaining = duration;
    elements.battleTimer.textContent = remaining;
    actionSent = false; // Reset for new round

    clearInterval(turnTimer);
    turnTimer = setInterval(() => {
        remaining--;
        elements.battleTimer.textContent = remaining;

        if (remaining <= 3) {
            elements.battleTimer.style.color = '#ef4444';
        } else {
            elements.battleTimer.style.color = '';
        }

        if (remaining <= 0) {
            clearInterval(turnTimer);
            // Auto-select defend if no action chosen yet
            if (!actionSent) {
                selectAction('defend');
            }
        }
    }, 1000);
}

// Mini-game functions
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function generateMiniGameButtons(miniGame) {
    elements.minigameButtons.innerHTML = '';
    elements.minigameButtons.classList.remove('hidden');

    let buttonsHTML = '';

    switch (miniGame.type) {
        case 'color_touch':
            // Stroop effect: button background color ≠ text label
            // Player must click button with matching TEXT (not color)
            const colorNames = { red: 'ROSSO', blue: 'BLU', green: 'VERDE', yellow: 'GIALLO' };
            if (miniGame.stroopButtons) {
                buttonsHTML = miniGame.stroopButtons.map(btn => `
                    <button class="minigame-btn stroop-btn ${btn.bgColor}" data-answer="${btn.textLabel}">
                        ${colorNames[btn.textLabel]}
                    </button>
                `).join('');
            } else {
                // Fallback for old format
                const shuffledColors = shuffleArray(miniGame.options);
                buttonsHTML = shuffledColors.map(color => `
                    <button class="minigame-btn color-btn ${color}" data-answer="${color}">
                        ${colorNames[color]}
                    </button>
                `).join('');
            }
            break;

        case 'dodge':
            const arrows = { up: '⬆️', down: '⬇️', left: '⬅️', right: '➡️' };
            const dirNames = { up: 'SU', down: 'GIÙ', left: 'SINISTRA', right: 'DESTRA' };
            // Randomize button positions
            const directions = shuffleArray(['up', 'down', 'left', 'right']);
            buttonsHTML = directions.map(dir => `
                <button class="minigame-btn direction-btn" data-answer="${dir}">
                    <span class="btn-icon">${arrows[dir]}</span>
                    <span class="btn-label">${dirNames[dir]}</span>
                </button>
            `).join('');
            break;

        case 'lucky_symbol':
            // Randomize symbol positions
            const shuffledSymbols = shuffleArray(miniGame.options);
            buttonsHTML = shuffledSymbols.map(symbol => `
                <button class="minigame-btn symbol-btn" data-answer="${symbol}">
                    ${symbol}
                </button>
            `).join('');
            break;

        case 'double_nothing':
            // Coin flip - randomize button positions
            const coinOptions = shuffleArray(['testa', 'croce']);
            buttonsHTML = coinOptions.map(opt => `
                <button class="minigame-btn coin-btn ${opt}" data-answer="${opt}">
                    ${opt === 'testa' ? '👑 TESTA' : '🦅 CROCE'}
                </button>
            `).join('');
            break;

        case 'element_boost':
            // Randomize element positions
            const shuffledElements = shuffleArray(miniGame.options);
            buttonsHTML = shuffledElements.map(el => `
                <button class="minigame-btn element-choice-btn ${el}" data-answer="${el}">
                    ${getElementIcon(el)}
                </button>
            `).join('');
            break;

        case 'chaos_target':
            // Reflex game - show ATTENDI, then change to PREMI after delay
            // Players CAN press early but will be penalized by server
            const goDelay = miniGame.goDelay || 2000;
            buttonsHTML = `
                <button class="minigame-btn reflex-btn waiting" data-answer="press">
                    <span class="reflex-text">ATTENDI...</span>
                </button>
            `;
            // Schedule the GO signal to match host display
            setTimeout(() => {
                const reflexBtn = elements.minigameButtons.querySelector('.reflex-btn');
                if (reflexBtn && !minigameAnswerSent) {
                    reflexBtn.classList.remove('waiting');
                    reflexBtn.classList.add('ready');
                    reflexBtn.querySelector('.reflex-text').textContent = 'PREMI!';
                }
            }, goDelay);
            break;

        case 'memory_flash':
            // Memory game - show 4 sequence options after delay
            const sequences = miniGame.sequenceOptions || [];
            const showDuration = miniGame.showDuration || 2500;

            // Initially show waiting message
            buttonsHTML = `<div class="memory-wait">Memorizza la sequenza sulla TV...</div>`;
            elements.minigameButtons.innerHTML = buttonsHTML;

            // After sequence hides on TV, show options
            setTimeout(() => {
                if (minigameAnswerSent) return;
                const optionsHTML = sequences.map(seq => `
                    <button class="minigame-btn memory-btn" data-answer="${seq.join('')}">
                        ${seq.map(icon => `<span>${icon}</span>`).join('')}
                    </button>
                `).join('');
                elements.minigameButtons.innerHTML = optionsHTML;

                // Re-add click handlers
                elements.minigameButtons.querySelectorAll('.minigame-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        if (minigameAnswerSent) return;
                        submitMiniGameAnswer(btn.dataset.answer);
                    });
                });
            }, showDuration);
            return; // Don't add handlers yet

        case 'turbo_runner':
            // Racing game - tap button as fast as possible
            const targetTaps = miniGame.targetTaps || 30;
            buttonsHTML = `
                <div class="turbo-runner-container">
                    <div class="tap-progress">
                        <span class="tap-count" id="player-tap-count">0</span>/<span>${targetTaps}</span>
                    </div>
                    <button class="minigame-btn turbo-btn" id="turbo-tap-btn">
                        <span class="turbo-icon">🏃</span>
                        <span class="turbo-text">TAPPA!</span>
                    </button>
                    <div class="tap-hint">Tappa più veloce che puoi!</div>
                </div>
            `;
            elements.minigameButtons.innerHTML = buttonsHTML;

            // Add tap handler - can tap multiple times
            const tapBtn = document.getElementById('turbo-tap-btn');
            if (tapBtn) {
                tapBtn.addEventListener('click', () => {
                    if (minigameAnswerSent) return; // Already finished
                    socket.emit('elemental:minigame-answer', {
                        pin: gamePin,
                        answer: 'tap'
                    });
                });
            }
            return; // Don't add standard handlers

        case 'quick_opposites':
            // Quick opposites - 4 direction buttons, must press opposite
            const oppSequence = miniGame.sequence || [];
            const oppRoundTime = miniGame.roundTime || 3000;
            buttonsHTML = `
                <div class="opposites-container">
                    <div class="opposites-status">
                        <span>Round <span id="player-opp-round">1</span>/3</span>
                        <span id="player-opp-result"></span>
                    </div>
                    <div class="opposites-current" id="player-opp-direction">
                        Direzione: <span class="current-dir">${getDirectionIcon(oppSequence[0]?.show)}</span>
                    </div>
                    <div class="opposites-buttons">
                        <button class="minigame-btn direction-btn opp-btn" data-direction="up">
                            <span class="btn-icon">⬆️</span>
                            <span>SOPRA</span>
                        </button>
                        <button class="minigame-btn direction-btn opp-btn" data-direction="down">
                            <span class="btn-icon">⬇️</span>
                            <span>SOTTO</span>
                        </button>
                        <button class="minigame-btn direction-btn opp-btn" data-direction="left">
                            <span class="btn-icon">⬅️</span>
                            <span>SINISTRA</span>
                        </button>
                        <button class="minigame-btn direction-btn opp-btn" data-direction="right">
                            <span class="btn-icon">➡️</span>
                            <span>DESTRA</span>
                        </button>
                    </div>
                    <div class="opposites-hint">Clicca l'OPPOSTO!</div>
                </div>
            `;
            elements.minigameButtons.innerHTML = buttonsHTML;

            // Track current round on player side
            let playerOppRound = 0;

            // Update direction display when round changes
            setTimeout(() => {
                if (oppSequence[1]) {
                    const dirEl = document.getElementById('player-opp-direction');
                    const roundEl = document.getElementById('player-opp-round');
                    if (dirEl) dirEl.innerHTML = `Direzione: <span class="current-dir">${getDirectionIcon(oppSequence[1].show)}</span>`;
                    if (roundEl) roundEl.textContent = '2';
                }
            }, oppRoundTime);
            setTimeout(() => {
                if (oppSequence[2]) {
                    const dirEl = document.getElementById('player-opp-direction');
                    const roundEl = document.getElementById('player-opp-round');
                    if (dirEl) dirEl.innerHTML = `Direzione: <span class="current-dir">${getDirectionIcon(oppSequence[2].show)}</span>`;
                    if (roundEl) roundEl.textContent = '3';
                }
            }, oppRoundTime * 2);

            // Add click handlers for direction buttons
            elements.minigameButtons.querySelectorAll('.opp-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (minigameAnswerSent) return;
                    socket.emit('elemental:minigame-answer', {
                        pin: gamePin,
                        answer: btn.dataset.direction
                    });
                });
            });
            return;

        default:
            buttonsHTML = '<div>Mini-gioco sconosciuto</div>';
    }

    elements.minigameButtons.innerHTML = buttonsHTML;

    // Add click handlers to all buttons
    elements.minigameButtons.querySelectorAll('.minigame-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (minigameAnswerSent) return;
            submitMiniGameAnswer(btn.dataset.answer);
        });
    });
}

function submitMiniGameAnswer(answer) {
    if (minigameAnswerSent) return;
    minigameAnswerSent = true;

    socket.emit('elemental:minigame-answer', {
        pin: gamePin,
        answer
    });

    // Visual feedback
    elements.minigameButtons.classList.add('hidden');
    elements.minigameAnswered.classList.remove('hidden');
}

function startMiniGameTimer(duration) {
    let remaining = Math.ceil(duration / 1000);
    elements.minigameTimer.textContent = remaining;

    clearInterval(minigameTimerInterval);
    minigameTimerInterval = setInterval(() => {
        remaining--;
        elements.minigameTimer.textContent = remaining;

        if (remaining <= 2) {
            elements.minigameTimer.classList.add('urgent');
        }

        if (remaining <= 0) {
            clearInterval(minigameTimerInterval);
            elements.minigameTimer.classList.remove('urgent');
        }
    }, 1000);
}

// Start
init();
