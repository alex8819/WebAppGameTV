const socket = io();

// State
let gamePin = null;
let nickname = null;
let selectedAnimal = null;
let hasAnswered = false;
let timerInterval = null;
let abilities = { steal: false, double: false, block: false, challenge: false, shuffle: false, obfuscate: false, halve: false };
let pendingAbility = null;
let challengeAnswered = false;
let hasVotedExit = false;
let currentQuestionNum = 0;
let isLastQuestion = false;
let isShuffled = false;
let shuffleInterval = null;
let isObfuscated = false;
let currentTimeLeft = 0; // Tempo rimanente della domanda corrente

// Tracking poteri per mostrare stato durante la domanda
let activePower = null; // { type: 'double', target: 'Mario' } - potere che ho attivato
let sufferingPowers = []; // [{ type: 'shuffle', from: 'Gino' }] - poteri che sto subendo
let targetedPlayers = []; // socketId dei giocatori già bersagliati (non selezionabili)

// DOM Elements
const screens = {
    join: document.getElementById('join-screen'),
    lobby: document.getElementById('player-lobby'),
    question: document.getElementById('player-question'),
    result: document.getElementById('player-result'),
    final: document.getElementById('player-final'),
    challenge: document.getElementById('player-challenge'),
    challengeResult: document.getElementById('player-challenge-result'),
    watching: document.getElementById('player-watching')
};

// Show specific screen
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[screenName].classList.remove('hidden');

    // Show/hide exit button (only during game, not on join or final screen)
    const exitBtn = document.getElementById('exit-btn');
    if (screenName === 'join' || screenName === 'final') {
        exitBtn.classList.add('hidden');
        document.getElementById('exit-status').classList.add('hidden');
    } else {
        exitBtn.classList.remove('hidden');
    }
}

// Animal Selection
document.querySelectorAll('.animal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.animal-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedAnimal = btn.dataset.animal;
    });
});

// Join Game
document.getElementById('btn-join').addEventListener('click', joinGame);

document.getElementById('pin-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('nickname-input').focus();
});

document.getElementById('nickname-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinGame();
});

function joinGame() {
    const pin = document.getElementById('pin-input').value.trim();
    const nick = document.getElementById('nickname-input').value.trim();

    if (!pin || pin.length !== 4) {
        showError('Inserisci un PIN valido (4 cifre)');
        return;
    }

    if (!nick || nick.length < 2) {
        showError('Inserisci un nickname (min 2 caratteri)');
        return;
    }

    if (!selectedAnimal) {
        showError('Scegli un animaletto!');
        return;
    }

    gamePin = pin;
    nickname = nick;
    socket.emit('player:join', { pin, nickname: nick, animal: selectedAnimal });
}

function showError(message) {
    const errorEl = document.getElementById('join-error');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
}

socket.on('join:error', ({ message }) => {
    showError(message);
});

socket.on('lobby:joined', ({ gamePin: pin, players, reconnected }) => {
    document.getElementById('join-error').classList.add('hidden');
    document.getElementById('lobby-pin-display').textContent = pin;
    updateLobbyPlayers(players);
    showScreen('lobby');

    if (reconnected) {
        // Could show a notification
    }
});

socket.on('lobby:update', ({ players }) => {
    updateLobbyPlayers(players);
});

function updateLobbyPlayers(players) {
    const list = document.getElementById('lobby-players-list');
    list.innerHTML = '';
    players.forEach(p => {
        const li = document.createElement('li');
        li.className = 'player-item' + (p.nickname === nickname ? ' highlight' : '');
        li.innerHTML = `<span class="player-name">${p.nickname}</span>`;
        list.appendChild(li);
    });
    document.getElementById('lobby-player-count').textContent = players.length;
}

// Game Started
socket.on('game:started', () => {
    // Will receive question shortly
});

// Question
socket.on('game:question', (question) => {
    hasAnswered = false;
    currentQuestionNum = question.questionNum;
    isLastQuestion = question.questionNum >= question.total;
    // Manteniamo isShuffled se già impostato da game:shuffled, altrimenti usiamo il valore dal server
    isShuffled = isShuffled || question.isShuffled || false;
    isObfuscated = isObfuscated || question.isObfuscated || false;
    showScreen('question');

    document.getElementById('p-question-num').textContent = `${question.questionNum}/${question.total}`;
    document.getElementById('p-question-text').textContent = question.text;
    document.getElementById('p-option-a').textContent = question.options.A;
    document.getElementById('p-option-b').textContent = question.options.B;
    document.getElementById('p-option-c').textContent = question.options.C;
    document.getElementById('p-option-d').textContent = question.options.D;

    // Reset UI
    document.getElementById('answer-buttons').classList.remove('hidden');
    document.getElementById('answer-sent').classList.add('hidden');
    document.querySelectorAll('.answer-btn').forEach(btn => {
        btn.disabled = false;
        btn.classList.remove('selected');
    });

    // Update abilities
    if (question.abilities) {
        abilities = question.abilities;
    }
    updateAbilitiesUI();

    // Stop any existing shuffle interval
    if (shuffleInterval) {
        clearInterval(shuffleInterval);
        shuffleInterval = null;
    }

    // Clear any existing obfuscation overlay (ma non resettare il flag)
    if (obfuscationOverlayEl) {
        obfuscationOverlayEl.remove();
        obfuscationOverlayEl = null;
    }

    // Handle shuffle effect
    if (isShuffled || question.isShuffled) {
        isShuffled = true;
        startShuffleEffect();
    }

    // Handle obfuscation effect - controlla sia il flag che i dati dal server
    const hasObfuscation = isObfuscated || question.isObfuscated || sufferingPowers.some(p => p.type === 'obfuscate');
    if (hasObfuscation) {
        isObfuscated = true;
        applyObfuscation();
    }

    // Mostra stato poteri durante la domanda
    updatePowersStatus();

    // Timer
    startTimer(Math.floor(question.timeLimit / 1000));
});

function startTimer(seconds) {
    currentTimeLeft = seconds;
    const timerEl = document.getElementById('p-timer');
    timerEl.textContent = currentTimeLeft;
    timerEl.classList.remove('warning', 'danger');

    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        currentTimeLeft--;
        timerEl.textContent = currentTimeLeft;

        if (currentTimeLeft <= 5) {
            timerEl.classList.add('danger');
        } else if (currentTimeLeft <= 10) {
            timerEl.classList.add('warning');
        }

        if (currentTimeLeft <= 0) {
            clearInterval(timerInterval);
        }
    }, 1000);
}

// Mostra lo stato dei poteri durante la domanda
function updatePowersStatus() {
    const statusContainer = document.getElementById('powers-status');
    const activeEl = document.getElementById('power-active-status');
    const sufferingEl = document.getElementById('power-suffering-status');

    // Nascondi tutto inizialmente
    statusContainer.classList.add('hidden');
    activeEl.classList.add('hidden');
    sufferingEl.classList.add('hidden');

    let hasStatus = false;

    // Mostra potere attivato
    if (activePower) {
        const powerNames = {
            'steal': '🎯 RUBA',
            'double': '⭐ DOPPIO',
            'block': '🚫 BLOCCA',
            'challenge': '⚔️ SFIDA',
            'shuffle': '🔀 SHUFFLE',
            'obfuscate': '🌫️ OFFUSCA',
            'halve': '➗ DIMEZZA'
        };
        const name = powerNames[activePower.type] || activePower.type.toUpperCase();
        activeEl.textContent = activePower.target
            ? `${name} attivo su ${activePower.target}`
            : `${name} attivo`;
        activeEl.classList.remove('hidden');
        hasStatus = true;
    }

    // Mostra poteri che stai subendo
    if (sufferingPowers.length > 0) {
        const powerNames = {
            'shuffle': '🔀 SHUFFLE',
            'obfuscate': '🌫️ OFFUSCA',
            'block': '🚫 BLOCCA',
            'halve': '➗ DIMEZZA'
        };
        const sufferingTexts = sufferingPowers.map(p => {
            const name = powerNames[p.type] || p.type.toUpperCase();
            return `${name} da ${p.from}`;
        });
        sufferingEl.textContent = sufferingTexts.join(' | ');
        sufferingEl.classList.remove('hidden');
        hasStatus = true;
    }

    if (hasStatus) {
        statusContainer.classList.remove('hidden');
    }
}

// Answer buttons
document.querySelectorAll('.answer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (hasAnswered) return;

        const answer = btn.dataset.answer;
        hasAnswered = true;

        // Visual feedback
        btn.classList.add('selected');
        document.querySelectorAll('.answer-btn').forEach(b => b.disabled = true);

        socket.emit('player:answer', { pin: gamePin, answer });
    });
});

socket.on('game:answer-confirmed', () => {
    document.getElementById('answer-buttons').classList.add('hidden');
    document.getElementById('answer-sent').classList.remove('hidden');
});

// Abilities
function updateAbilitiesUI() {
    document.getElementById('ability-steal').disabled = abilities.steal;
    document.getElementById('ability-double').disabled = abilities.double;
    document.getElementById('ability-block').disabled = abilities.block;
    document.getElementById('ability-challenge').disabled = abilities.challenge;
    document.getElementById('ability-shuffle').disabled = abilities.shuffle;
    document.getElementById('ability-obfuscate').disabled = abilities.obfuscate;
    document.getElementById('ability-halve').disabled = abilities.halve;
}

let powerSelectedThisTurn = false;

document.querySelectorAll('.ability-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (powerSelectedThisTurn) return; // Già scelto un potere

        const ability = btn.dataset.ability;

        if (ability === 'double') {
            // Double doesn't need target - blocca subito
            powerSelectedThisTurn = true;
            disableAllPowerButtons();
            socket.emit('player:use-ability', { pin: gamePin, ability });
        } else {
            // steal, block, challenge need to select target
            pendingAbility = ability;
            socket.emit('player:get-targets', { pin: gamePin });
        }
    });
});

function disableAllPowerButtons() {
    document.querySelectorAll('.ability-btn').forEach(b => b.disabled = true);
    document.getElementById('btn-pass').disabled = true;
}

socket.on('game:targets', ({ targets }) => {
    if (!pendingAbility) return;

    const modal = document.getElementById('target-modal');
    const list = document.getElementById('target-list');
    list.innerHTML = '';

    // Filtra i giocatori già bersagliati
    const availableTargets = targets.filter(t => !targetedPlayers.includes(t.socketId));

    if (availableTargets.length === 0) {
        // Nessun bersaglio disponibile
        const msg = document.createElement('div');
        msg.className = 'no-targets-msg';
        msg.textContent = 'Tutti i giocatori sono già bersaglio di un potere!';
        msg.style.padding = '20px';
        msg.style.textAlign = 'center';
        msg.style.color = '#ff6b6b';
        list.appendChild(msg);
    } else {
        availableTargets.forEach(t => {
            const btn = document.createElement('button');
            btn.className = 'target-btn';
            btn.textContent = t.nickname;
            btn.dataset.socketId = t.socketId; // Per rimozione dinamica
            btn.addEventListener('click', () => {
                // Blocca altri poteri quando si sceglie il target
                powerSelectedThisTurn = true;
                disableAllPowerButtons();

                socket.emit('player:use-ability', {
                    pin: gamePin,
                    ability: pendingAbility,
                    targetSocketId: t.socketId
                });
                modal.classList.add('hidden');
                pendingAbility = null;
            });
            list.appendChild(btn);
        });
    }

    modal.classList.remove('hidden');
});

// Aggiorna lista giocatori già bersagliati
socket.on('game:targeted-players-update', ({ targetedPlayers: updated }) => {
    targetedPlayers = updated || [];

    // Se il modal è aperto, aggiorna dinamicamente la lista
    const modal = document.getElementById('target-modal');
    if (!modal.classList.contains('hidden')) {
        const list = document.getElementById('target-list');
        // Rimuovi i pulsanti dei giocatori appena bersagliati
        targetedPlayers.forEach(socketId => {
            const btns = list.querySelectorAll('.target-btn');
            btns.forEach(btn => {
                if (btn.dataset.socketId === socketId) {
                    btn.remove();
                }
            });
        });

        // Se non ci sono più bersagli, mostra messaggio
        const remainingButtons = list.querySelectorAll('.target-btn');
        if (remainingButtons.length === 0 && !list.querySelector('.no-targets-msg')) {
            list.innerHTML = '';
            const msg = document.createElement('div');
            msg.className = 'no-targets-msg';
            msg.textContent = 'Tutti i giocatori sono già bersaglio di un potere!';
            msg.style.padding = '20px';
            msg.style.textAlign = 'center';
            msg.style.color = '#ff6b6b';
            list.appendChild(msg);
        }
    }
});

document.getElementById('modal-cancel').addEventListener('click', () => {
    document.getElementById('target-modal').classList.add('hidden');
    pendingAbility = null;
    // Non bloccare - l'utente può ancora scegliere un altro potere
});

socket.on('game:ability-result', ({ success, ability, targetNickname, remainingAbilities }) => {
    if (success) {
        abilities = remainingAbilities;

        // Salva il potere attivato per mostrarlo durante la domanda
        activePower = { type: ability, target: targetNickname || null };

        // Visual feedback
        const btn = document.querySelector(`[data-ability="${ability}"]`);
        if (btn) {
            btn.classList.add('pulse');
            setTimeout(() => btn.classList.remove('pulse'), 500);
        }

        // Mostra stato attesa dopo aver usato il potere
        showWaitingForPowers();
    }
});

socket.on('ability:error', ({ message }) => {
    alert(message);
});

// Notifica immediata quando vieni bloccato
socket.on('game:blocked', ({ byPlayer }) => {
    sufferingPowers.push({ type: 'block', from: byPlayer });
    showBlockedNotification(byPlayer);
});

function showBlockedNotification(byPlayer) {
    // Crea notifica overlay
    const notification = document.createElement('div');
    notification.className = 'blocked-notification';
    notification.innerHTML = `
        <div class="blocked-icon">🚫</div>
        <div class="blocked-text">Sei stato bloccato da <strong>${byPlayer}</strong>!</div>
        <div class="blocked-subtext">Non guadagnerai punti in questo turno</div>
    `;
    document.body.appendChild(notification);

    // Rimuovi dopo 3 secondi
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 3000);
}

// Notifica quando vieni shufflato
socket.on('game:shuffled', ({ byPlayer }) => {
    isShuffled = true;
    sufferingPowers.push({ type: 'shuffle', from: byPlayer });
    showShuffledNotification(byPlayer);

    // Se siamo già nella schermata domanda, applica subito lo shuffle
    if (!screens.question.classList.contains('hidden')) {
        startShuffleEffect();
    }
});

function showShuffledNotification(byPlayer) {
    const notification = document.createElement('div');
    notification.className = 'shuffled-notification';
    notification.innerHTML = `
        <div class="shuffled-icon">🔀</div>
        <div class="shuffled-text">${byPlayer ? `<strong>${byPlayer}</strong> ti ha shufflato!` : 'I tuoi tasti verranno mescolati!'}</div>
        <div class="shuffled-subtext">I tasti cambieranno ogni 4 secondi</div>
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 2500);
}

function startShuffleEffect() {
    const answerContainer = document.getElementById('answer-buttons');
    answerContainer.classList.add('shuffling');

    // Esegui il primo shuffle subito dopo 1 secondo
    setTimeout(() => {
        shuffleAnswerButtons();
    }, 1000);

    // Poi ogni 4 secondi
    shuffleInterval = setInterval(() => {
        if (!hasAnswered) {
            shuffleAnswerButtons();
        } else {
            clearInterval(shuffleInterval);
            shuffleInterval = null;
        }
    }, 4000);
}

function shuffleAnswerButtons() {
    const container = document.getElementById('answer-buttons');
    const buttons = Array.from(container.querySelectorAll('.answer-btn'));

    // Fisher-Yates shuffle
    for (let i = buttons.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [buttons[i], buttons[j]] = [buttons[j], buttons[i]];
    }

    // Applica animazione
    buttons.forEach(btn => {
        btn.classList.add('shuffle-move');
    });

    // Riordina i bottoni nel DOM
    buttons.forEach(btn => container.appendChild(btn));

    // Rimuovi classe animazione
    setTimeout(() => {
        buttons.forEach(btn => btn.classList.remove('shuffle-move'));
    }, 300);
}

// Notifica quando vieni offuscato
socket.on('game:obfuscated', ({ byPlayer }) => {
    isObfuscated = true;
    sufferingPowers.push({ type: 'obfuscate', from: byPlayer });
    showObfuscatedNotification(byPlayer);

    // Se siamo già nella schermata domanda, applica subito l'offuscamento
    if (!screens.question.classList.contains('hidden')) {
        applyObfuscation();
    }
});

// Notifica quando vieni dimezzato
socket.on('game:halved', ({ byPlayer }) => {
    sufferingPowers.push({ type: 'halve', from: byPlayer });
    showHalvedNotification(byPlayer);
});

function showHalvedNotification(byPlayer) {
    const notification = document.createElement('div');
    notification.className = 'halved-notification';
    notification.innerHTML = `
        <div class="halved-icon">➗</div>
        <div class="halved-text">${byPlayer ? `<strong>${byPlayer}</strong> ti ha dimezzato!` : 'Sei stato dimezzato!'}</div>
        <div class="halved-subtext">I tuoi punti saranno dimezzati se rispondi correttamente</div>
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 2500);
}

function showObfuscatedNotification(byPlayer) {
    const notification = document.createElement('div');
    notification.className = 'obfuscated-notification';
    notification.innerHTML = `
        <div class="obfuscated-icon">🌫️</div>
        <div class="obfuscated-text">${byPlayer ? `<strong>${byPlayer}</strong> ti ha offuscato!` : 'Sei stato offuscato!'}</div>
        <div class="obfuscated-subtext">Vedrai la domanda solo negli ultimi 7 secondi</div>
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 2500);
}

// Variabili per l'offuscamento
let obfuscationTimeout = null;
let obfuscationInterval = null;
let obfuscationOverlayEl = null;

function applyObfuscation() {
    // Durata fissa: 20 secondi
    const OBFUSCATION_DURATION = 20;

    // Rimuovi overlay esistente se presente
    if (obfuscationOverlayEl) {
        obfuscationOverlayEl.remove();
        obfuscationOverlayEl = null;
    }
    if (obfuscationTimeout) {
        clearTimeout(obfuscationTimeout);
    }
    if (obfuscationInterval) {
        clearInterval(obfuscationInterval);
    }

    // Crea overlay che copre tutto lo schermo
    obfuscationOverlayEl = document.createElement('div');
    obfuscationOverlayEl.id = 'obfuscation-overlay';

    // Stile inline per massima compatibilità
    obfuscationOverlayEl.style.position = 'fixed';
    obfuscationOverlayEl.style.top = '0';
    obfuscationOverlayEl.style.left = '0';
    obfuscationOverlayEl.style.width = '100%';
    obfuscationOverlayEl.style.height = '100%';
    obfuscationOverlayEl.style.backgroundColor = 'rgba(6, 182, 212, 0.97)';
    obfuscationOverlayEl.style.display = 'flex';
    obfuscationOverlayEl.style.flexDirection = 'column';
    obfuscationOverlayEl.style.alignItems = 'center';
    obfuscationOverlayEl.style.justifyContent = 'center';
    obfuscationOverlayEl.style.zIndex = '99999';

    let secondsLeft = OBFUSCATION_DURATION;

    // Contenuto
    const content = document.createElement('div');
    content.style.textAlign = 'center';
    content.innerHTML = `
        <div style="font-size: 80px; margin-bottom: 20px;">🌫️</div>
        <div style="font-size: 28px; font-weight: bold; color: white; margin-bottom: 20px;">OFFUSCATO!</div>
        <div style="font-size: 18px; color: white; margin-bottom: 10px;">Risposte visibili tra</div>
        <div id="obfuscation-countdown" style="font-size: 72px; font-weight: bold; color: white;">${secondsLeft}</div>
        <div style="font-size: 16px; color: rgba(255,255,255,0.8); margin-top: 10px;">secondi</div>
    `;
    obfuscationOverlayEl.appendChild(content);

    document.body.appendChild(obfuscationOverlayEl);

    // Countdown ogni secondo
    const countdownEl = document.getElementById('obfuscation-countdown');
    obfuscationInterval = setInterval(() => {
        secondsLeft--;
        if (countdownEl) {
            countdownEl.textContent = secondsLeft;
        }
        if (secondsLeft <= 0) {
            clearObfuscation();
        }
    }, 1000);

    // Timeout di sicurezza
    obfuscationTimeout = setTimeout(() => {
        clearObfuscation();
    }, OBFUSCATION_DURATION * 1000 + 500);
}

function clearObfuscation() {
    if (obfuscationOverlayEl) {
        obfuscationOverlayEl.remove();
        obfuscationOverlayEl = null;
    }
    if (obfuscationTimeout) {
        clearTimeout(obfuscationTimeout);
        obfuscationTimeout = null;
    }
    if (obfuscationInterval) {
        clearInterval(obfuscationInterval);
        obfuscationInterval = null;
    }
    isObfuscated = false;
}

// Result
socket.on('game:your-result', ({ correct, correctAnswer, points, totalScore, wasBlocked, abilities: newAbilities, hasChallenges }) => {
    clearInterval(timerInterval);

    // Stop shuffle effect
    if (shuffleInterval) {
        clearInterval(shuffleInterval);
        shuffleInterval = null;
    }
    isShuffled = false;

    // Clear obfuscation
    clearObfuscation();

    // Reset power tracking per il prossimo turno
    activePower = null;
    sufferingPowers = [];
    targetedPlayers = [];

    showScreen('result');

    const icon = document.getElementById('result-icon');
    const text = document.getElementById('result-text');

    if (correct) {
        icon.className = 'result-icon correct';
        text.className = 'result-text correct';
        text.textContent = 'Corretto!';
    } else {
        icon.className = 'result-icon wrong';
        text.className = 'result-text wrong';
        text.textContent = 'Sbagliato!';
    }

    document.getElementById('points-earned').textContent = points > 0 ? `+${points}` : '0';
    document.getElementById('total-score').textContent = totalScore;

    // Show effect if blocked
    const effectEl = document.getElementById('ability-effect');
    if (wasBlocked) {
        effectEl.textContent = '🚫 Sei stato bloccato! Nessun punto questo turno.';
        effectEl.classList.remove('hidden');
    } else {
        effectEl.classList.add('hidden');
    }

    if (newAbilities) {
        abilities = newAbilities;
    }

    // Resetta il flag per permettere nuova scelta potere
    powerSelectedThisTurn = false;

    // Mostra poteri speciali solo dopo la prima domanda e se non è l'ultima
    const abilitiesSection = document.getElementById('abilities-section');
    const waitingPowers = document.getElementById('waiting-powers');

    if (currentQuestionNum >= 1 && !isLastQuestion && !hasChallenges) {
        abilitiesSection.classList.remove('hidden');
        waitingPowers.classList.add('hidden');
        updateAbilitiesUI();
        // Riabilita anche il pulsante passa
        document.getElementById('btn-pass').disabled = false;
    } else {
        abilitiesSection.classList.add('hidden');
        waitingPowers.classList.add('hidden');
    }
});

// Bottone PASSA (nessun potere)
document.getElementById('btn-pass').addEventListener('click', () => {
    if (powerSelectedThisTurn) return;
    powerSelectedThisTurn = true;
    disableAllPowerButtons();
    socket.emit('player:pass-power', { pin: gamePin });
});

// Conferma potere passato
socket.on('game:power-passed', () => {
    showWaitingForPowers();
});

// Aggiornamento stato selezione poteri
socket.on('game:power-selection-update', ({ ready, total }) => {
    document.getElementById('powers-ready-count').textContent = ready;
    document.getElementById('powers-total-count').textContent = total;
});

// Tutti hanno scelto - parte il countdown
socket.on('game:all-powers-selected', () => {
    const waitingText = document.querySelector('#waiting-powers .waiting-text');
    if (waitingText) {
        waitingText.textContent = 'Prossima domanda in arrivo...';
    }
});

function showWaitingForPowers() {
    document.getElementById('abilities-section').classList.add('hidden');
    document.getElementById('waiting-powers').classList.remove('hidden');
}

// Final
socket.on('game:final', ({ yourRank, yourScore, topThree }) => {
    showScreen('final');

    document.getElementById('your-rank').textContent = `#${yourRank}`;
    document.getElementById('your-final-score').textContent = `${yourScore} punti`;

    const top3Container = document.getElementById('top-three');
    top3Container.innerHTML = '<h4>Top 3</h4>';

    topThree.forEach((p, i) => {
        const medals = ['🏆', '🥈', '🥉'];
        const div = document.createElement('div');
        div.className = 'top-player' + (p.nickname === nickname ? ' you' : '');
        div.innerHTML = `
            <span>${medals[i]} ${p.nickname}</span>
            <span>${p.score} pts</span>
        `;
        top3Container.appendChild(div);
    });
});

// Reactions
document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        socket.emit('player:reaction', { pin: gamePin, emoji });

        // Visual feedback
        btn.classList.add('pulse');
        setTimeout(() => btn.classList.remove('pulse'), 300);
    });
});

// Back to home
document.getElementById('btn-back-home').addEventListener('click', () => {
    window.location.href = '/';
});

// Disconnect handling
socket.on('disconnect', () => {
    // Try to reconnect
});

socket.on('reconnect:success', ({ gamePin: pin, player, gameStatus }) => {
    gamePin = pin;
    abilities = player.abilities;

    if (gameStatus === 'lobby') {
        showScreen('lobby');
    } else if (gameStatus === 'playing') {
        // Will receive current question
    }
});

socket.on('game:host-left', () => {
    showScreen('join');
});

// === CHALLENGE EVENTS ===

// Notifica quando vieni sfidato
socket.on('game:challenged', ({ byPlayer }) => {
    showChallengedNotification(byPlayer);
});

function showChallengedNotification(byPlayer) {
    const notification = document.createElement('div');
    notification.className = 'challenged-notification';
    notification.innerHTML = `
        <div class="challenged-icon">⚔️</div>
        <div class="challenged-text"><strong>${byPlayer}</strong> ti ha sfidato!</div>
        <div class="challenged-subtext">Preparati al duello...</div>
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 2500);
}

// Quando è il tuo turno nella sfida
socket.on('challenge:your-turn', ({ opponent, question, timeLimit, isChallenger }) => {
    challengeAnswered = false;
    showScreen('challenge');

    document.getElementById('challenge-opponent').textContent = opponent;
    document.getElementById('challenge-mobile-question').textContent = question.text;
    document.getElementById('challenge-option-a').textContent = question.options.A;
    document.getElementById('challenge-option-b').textContent = question.options.B;
    document.getElementById('challenge-option-c').textContent = question.options.C;
    document.getElementById('challenge-option-d').textContent = question.options.D;

    // Reset UI
    document.getElementById('challenge-answer-buttons').classList.remove('hidden');
    document.getElementById('challenge-sent').classList.add('hidden');
    document.querySelectorAll('#challenge-answer-buttons .answer-btn').forEach(btn => {
        btn.disabled = false;
        btn.classList.remove('selected');
    });

    // Start timer
    startChallengeTimer(Math.floor(timeLimit / 1000));
});

function startChallengeTimer(seconds) {
    let timeLeft = seconds;
    const timerEl = document.getElementById('challenge-mobile-timer');
    timerEl.textContent = timeLeft;
    timerEl.classList.remove('warning', 'danger');

    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        timeLeft--;
        timerEl.textContent = timeLeft;

        if (timeLeft <= 5) {
            timerEl.classList.add('danger');
        } else if (timeLeft <= 10) {
            timerEl.classList.add('warning');
        }

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
        }
    }, 1000);
}

// Challenge answer buttons
document.querySelectorAll('#challenge-answer-buttons .answer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (challengeAnswered) return;

        const answer = btn.dataset.answer;
        challengeAnswered = true;

        // Visual feedback
        btn.classList.add('selected');
        document.querySelectorAll('#challenge-answer-buttons .answer-btn').forEach(b => b.disabled = true);

        socket.emit('player:challenge-answer', { pin: gamePin, answer });
    });
});

socket.on('challenge:answer-confirmed', () => {
    document.getElementById('challenge-answer-buttons').classList.add('hidden');
    document.getElementById('challenge-sent').classList.remove('hidden');
});

// Risultato della sfida
socket.on('challenge:your-result', ({ yourAnswer, yourCorrect, opponentAnswer, opponentCorrect, correctAnswer, youWon, youLost, isDraw, newScore }) => {
    clearInterval(timerInterval);
    showScreen('challengeResult');

    const iconEl = document.getElementById('challenge-result-icon');
    const textEl = document.getElementById('challenge-result-text');
    const scoreEl = document.getElementById('challenge-new-score');

    if (isDraw) {
        iconEl.textContent = '🤝';
        textEl.textContent = 'PAREGGIO!';
        textEl.className = 'challenge-result-text draw';
    } else if (youWon) {
        iconEl.textContent = '👑';
        textEl.textContent = 'HAI VINTO!';
        textEl.className = 'challenge-result-text win';
    } else {
        iconEl.textContent = '💔';
        textEl.textContent = 'HAI PERSO!';
        textEl.className = 'challenge-result-text lose';
    }

    scoreEl.textContent = newScore;
});

// Stai guardando una sfida
socket.on('challenge:watching', ({ challenger, target }) => {
    showScreen('watching');
    document.getElementById('watching-challenger').textContent = challenger;
    document.getElementById('watching-target').textContent = target;
});

// Risultato sfida per spettatori
socket.on('challenge:spectator-result', ({ winner, loser, isDraw }) => {
    // Gli spettatori rimangono sulla schermata watching, verrà aggiornata dopo
});

// Le sfide sono finite
socket.on('challenges:complete', () => {
    // Aspetta la prossima domanda o i risultati finali
});

// Prevent zoom on double tap
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        e.preventDefault();
    }
    lastTouchEnd = now;
}, false);

let lastTouchEnd = 0;

// === EXIT GAME LOGIC ===

document.getElementById('exit-btn').addEventListener('click', () => {
    if (!gamePin) return;

    hasVotedExit = !hasVotedExit; // Toggle vote
    const exitBtn = document.getElementById('exit-btn');

    if (hasVotedExit) {
        exitBtn.classList.add('voted');
        socket.emit('player:vote-exit', { pin: gamePin, vote: true });
    } else {
        exitBtn.classList.remove('voted');
        socket.emit('player:vote-exit', { pin: gamePin, vote: false });
    }
});

socket.on('game:exit-update', ({ votedCount, totalPlayers }) => {
    const statusEl = document.getElementById('exit-status');
    const countEl = document.getElementById('exit-count');
    const totalEl = document.getElementById('exit-total');

    countEl.textContent = votedCount;
    totalEl.textContent = totalPlayers;

    if (votedCount > 0) {
        statusEl.classList.remove('hidden');
    } else {
        statusEl.classList.add('hidden');
    }
});

socket.on('game:ended-by-players', () => {
    hasVotedExit = false;
    document.getElementById('exit-btn').classList.remove('voted');
    showScreen('join');
});
