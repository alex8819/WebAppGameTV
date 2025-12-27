const socket = io();

// State
let gamePin = null;
let players = [];
let currentQuestion = null;
let timerInterval = null;
let timeLeft = 15;
let autoStartInterval = null;
let autoStartTimeLeft = 45;
let finalCountdownInterval = null;

// DOM Elements
const screens = {
    welcome: document.getElementById('welcome-screen'),
    lobby: document.getElementById('lobby-screen'),
    question: document.getElementById('question-screen'),
    results: document.getElementById('results-screen'),
    challenge: document.getElementById('challenge-screen'),
    challengeResult: document.getElementById('challenge-result-screen'),
    final: document.getElementById('final-screen')
};

// Show specific screen
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
    screens[screenName].classList.remove('hidden');
}

// Create Game automatically on page load
socket.emit('host:create-game');

socket.on('game:created', ({ pin }) => {
    gamePin = pin;
    players = [];
    document.getElementById('game-pin').textContent = pin;
    document.getElementById('game-url').textContent = window.location.origin + '/play';
    document.getElementById('players-grid').innerHTML = '';
    document.getElementById('player-count').textContent = '0';
    showScreen('lobby');
    // Nascondi il countdown finché non entra il primo giocatore
    document.getElementById('auto-start-countdown').style.display = 'none';
    stopAutoStartCountdown();
});

// Reload Game - create new PIN
document.getElementById('btn-reload-game').addEventListener('click', () => {
    stopAutoStartCountdown();
    socket.emit('host:create-game');
});

function startAutoStartCountdown() {
    autoStartTimeLeft = 45;
    const countdownEl = document.getElementById('countdown-timer');
    countdownEl.textContent = autoStartTimeLeft;

    if (autoStartInterval) clearInterval(autoStartInterval);

    autoStartInterval = setInterval(() => {
        autoStartTimeLeft--;
        countdownEl.textContent = autoStartTimeLeft;

        if (autoStartTimeLeft <= 0) {
            clearInterval(autoStartInterval);
            // Auto-start solo se c'è almeno 1 giocatore
            if (players.length >= 1) {
                socket.emit('host:start-game', { pin: gamePin });
            } else {
                // Riavvia il countdown se non ci sono giocatori
                startAutoStartCountdown();
            }
        }
    }, 1000);
}

function stopAutoStartCountdown() {
    if (autoStartInterval) {
        clearInterval(autoStartInterval);
        autoStartInterval = null;
    }
}

// Player joined
socket.on('game:player-joined', ({ player }) => {
    const isFirstPlayer = players.length === 0;
    players.push(player);
    updatePlayersGrid();
    updateStartButton();

    // Avvia countdown quando entra il primo giocatore
    if (isFirstPlayer) {
        document.getElementById('auto-start-countdown').style.display = 'block';
        startAutoStartCountdown();
    }
});

socket.on('game:player-left', ({ player }) => {
    players = players.filter(p => p.odId !== player.odId);
    updatePlayersGrid();
    updateStartButton();
});

socket.on('lobby:update', ({ players: updatedPlayers }) => {
    players = updatedPlayers;
    updatePlayersGrid();
    updateStartButton();
});

function updatePlayersGrid() {
    const grid = document.getElementById('players-grid');
    grid.innerHTML = '';
    players.forEach(p => {
        const card = document.createElement('div');
        card.className = 'player-card fade-in';
        card.innerHTML = `<span class="player-animal">${p.animal || '🦇'}</span> ${p.nickname}`;
        grid.appendChild(card);
    });
    document.getElementById('player-count').textContent = players.length;
}

function updateStartButton() {
    const btn = document.getElementById('btn-start-game');
    btn.disabled = players.length < 1;
}

// Start Game
document.getElementById('btn-start-game').addEventListener('click', () => {
    stopAutoStartCountdown();
    socket.emit('host:start-game', { pin: gamePin });
});

socket.on('game:error', ({ message }) => {
    alert(message);
});

// Question
socket.on('game:question', (question) => {
    stopAutoStartCountdown();
    currentQuestion = question;
    showScreen('question');

    document.getElementById('question-number').textContent = `Domanda ${question.questionNum} / ${question.total}`;
    document.getElementById('question-text').textContent = question.text;

    // Display active powers for this turn (compact icon view)
    const activePowersEl = document.getElementById('active-powers');
    const powersList = document.getElementById('powers-list');

    if (question.activePowers && question.activePowers.length > 0) {
        activePowersEl.classList.remove('hidden');

        // Count powers by type
        const powerCounts = {
            steal: { icon: '🔥', label: 'RUBA', count: 0 },
            double: { icon: '✨', label: 'DOPPIO', count: 0 },
            block: { icon: '🚫', label: 'BLOCCO', count: 0 },
            challenge: { icon: '⚔️', label: 'SFIDA', count: 0 },
            shuffle: { icon: '🔀', label: 'SHUFFLE', count: 0 },
            obfuscate: { icon: '🌫️', label: 'OFFUSCA', count: 0 },
            halve: { icon: '➗', label: 'DIMEZZA', count: 0 }
        };

        question.activePowers.forEach(p => {
            if (powerCounts[p.type]) {
                powerCounts[p.type].count++;
            }
        });

        // Build compact display
        const activePowerTypes = Object.entries(powerCounts)
            .filter(([_, data]) => data.count > 0)
            .map(([_, data]) => `
                <div class="power-badge">
                    <span class="power-icon">${data.icon}</span>
                    <span class="power-count">x${data.count}</span>
                </div>
            `).join('');

        powersList.innerHTML = `<div class="powers-compact">${activePowerTypes}</div>`;
    } else {
        activePowersEl.classList.add('hidden');
    }

    // Update leaderboard
    updateMiniLeaderboard();

    // Reset answers progress
    document.getElementById('answers-progress').textContent = `Risposte: 0/${players.length}`;

    // Start timer
    startTimer(Math.floor(question.timeLimit / 1000), 'timer');
});

socket.on('game:answers-update', ({ answeredCount, totalPlayers }) => {
    document.getElementById('answers-progress').textContent = `Risposte: ${answeredCount}/${totalPlayers}`;
});

function startTimer(seconds, elementId) {
    timeLeft = seconds;
    const timerEl = document.getElementById(elementId);
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

function updateMiniLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';

    const sorted = [...players].sort((a, b) => b.score - a.score).slice(0, 8);

    // Split into two columns (4 each max)
    const leftColumn = sorted.slice(0, 4);
    const rightColumn = sorted.slice(4, 8);

    let html = '<div class="leaderboard-columns">';

    // Left column
    html += '<div class="leaderboard-col">';
    leftColumn.forEach((p, i) => {
        html += `<div class="player-item">
            <span class="player-rank">${i + 1}.</span>
            <span class="player-animal">${p.animal || '🦇'}</span>
            <span class="player-name">${p.nickname}</span>
            <span class="player-score">${p.score}</span>
        </div>`;
    });
    html += '</div>';

    // Right column (if exists)
    if (rightColumn.length > 0) {
        html += '<div class="leaderboard-col">';
        rightColumn.forEach((p, i) => {
            html += `<div class="player-item">
                <span class="player-rank">${i + 5}.</span>
                <span class="player-animal">${p.animal || '🦇'}</span>
                <span class="player-name">${p.nickname}</span>
                <span class="player-score">${p.score}</span>
            </div>`;
        });
        html += '</div>';
    }

    html += '</div>';

    // Show remaining count if more than 8 players
    if (players.length > 8) {
        html += `<div class="leaderboard-more">+${players.length - 8} altri</div>`;
    }

    list.innerHTML = html;
}

// Results
socket.on('game:question-results', (results) => {
    clearInterval(timerInterval);
    showScreen('results');

    // Show correct answer
    const correctOpt = results.correctAnswer;
    document.getElementById('correct-answer-display').innerHTML =
        `<span class="correct-label">Risposta corretta:</span><span class="correct-text">${correctOpt}) ${results.question.options[correctOpt]}</span>`;

    // Update players scores
    results.results.forEach(r => {
        const idx = players.findIndex(p => p.odId === r.odId);
        if (idx >= 0) {
            players[idx].score = r.totalScore;
        }
    });

    // Build results list
    const list = document.getElementById('results-list');
    list.innerHTML = '';

    results.results.forEach((r, i) => {
        const item = document.createElement('div');
        item.className = 'result-item fade-in';
        item.style.animationDelay = `${i * 0.1}s`;

        const answerClass = r.correct ? 'correct' : 'wrong';
        const pointsClass = r.points > 0 ? '' : 'zero';

        item.innerHTML = `
            <span class="result-rank">#${i + 1}</span>
            <span class="player-name">${r.nickname}</span>
            <span class="result-answer ${answerClass}">${r.answer}</span>
            <span class="result-points ${pointsClass}">+${r.points}</span>
            <span class="result-total">${r.totalScore} pts</span>
        `;
        list.appendChild(item);
    });

    // Nascondi la lista eventi (i popup appaiono in tempo reale quando vengono usati)
    const eventsContainer = document.getElementById('events-list');
    eventsContainer.classList.add('hidden');

    // Mostra stato attesa poteri (non più auto-advance)
    const powersWaiting = document.getElementById('powers-waiting');
    const resultsCountdown = document.getElementById('results-countdown');

    if (!results.hasChallenges && !results.isLastQuestion) {
        powersWaiting.style.display = 'flex';
        resultsCountdown.classList.add('hidden');
    } else {
        powersWaiting.style.display = 'none';
        resultsCountdown.classList.add('hidden');
    }
});

// Aggiornamento stato selezione poteri
socket.on('game:power-selection-update', ({ ready, total }) => {
    document.getElementById('powers-ready').textContent = ready;
    document.getElementById('powers-total').textContent = total;
});

// Tutti hanno scelto il potere - avvia countdown 3 secondi
socket.on('game:all-powers-selected', () => {
    const powersWaiting = document.getElementById('powers-waiting');
    const resultsCountdown = document.getElementById('results-countdown');

    powersWaiting.style.display = 'none';
    resultsCountdown.classList.remove('hidden');
    startResultsCountdown(3);
});

// Potere usato in tempo reale - mostra popup immediato
socket.on('game:power-used', (event) => {
    showPowerPopup(event);
});

function startResultsCountdown(seconds) {
    let timeLeft = seconds;
    const timerEl = document.getElementById('results-timer');
    timerEl.textContent = timeLeft;

    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
        timeLeft--;
        timerEl.textContent = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(timerInterval);
        }
    }, 1000);
}

// === CHALLENGE EVENTS ===

socket.on('challenge:start', ({ challenger, target, question, timeLimit, remainingChallenges }) => {
    showScreen('challenge');

    document.getElementById('challenger-name').textContent = challenger;
    document.getElementById('target-name').textContent = target;
    document.getElementById('challenge-question-text').textContent = question.text;

    // Show remaining challenges
    const remainingEl = document.getElementById('remaining-challenges');
    if (remainingChallenges > 0) {
        remainingEl.classList.remove('hidden');
        document.getElementById('remaining-count').textContent = remainingChallenges;
    } else {
        remainingEl.classList.add('hidden');
    }

    // Start timer
    startTimer(Math.floor(timeLimit / 1000), 'challenge-timer');
});

socket.on('challenge:result', ({ challenger, target, correctAnswer, winner, loser, isDraw, hasMoreChallenges }) => {
    clearInterval(timerInterval);
    showScreen('challengeResult');

    // Aggiorna nomi
    document.getElementById('result-challenger-name').textContent = challenger.nickname;
    document.getElementById('result-target-name').textContent = target.nickname;

    // Aggiorna risposte
    document.getElementById('result-challenger-answer').textContent = challenger.answer || '-';
    document.getElementById('result-target-answer').textContent = target.answer || '-';

    // Aggiorna status
    const challengerStatus = document.getElementById('result-challenger-status');
    const targetStatus = document.getElementById('result-target-status');

    challengerStatus.textContent = challenger.correct ? 'Corretto!' : 'Sbagliato';
    challengerStatus.className = 'challenge-player-status ' + (challenger.correct ? 'correct' : 'wrong');

    targetStatus.textContent = target.correct ? 'Corretto!' : 'Sbagliato';
    targetStatus.className = 'challenge-player-status ' + (target.correct ? 'correct' : 'wrong');

    // Aggiorna stili vincitore/perdente
    const challengerEl = document.getElementById('challenger-result');
    const targetEl = document.getElementById('target-result');

    challengerEl.classList.remove('winner', 'loser');
    targetEl.classList.remove('winner', 'loser');

    const winnerIcon = document.getElementById('winner-icon');
    const winnerText = document.getElementById('winner-text');
    const consequence = document.getElementById('challenge-consequence');

    if (isDraw) {
        winnerIcon.textContent = '🤝';
        winnerText.textContent = 'PAREGGIO!';
        winnerText.classList.add('draw');
        consequence.textContent = 'Nessuna modifica ai punteggi';
    } else {
        winnerText.classList.remove('draw');
        if (winner === challenger.nickname) {
            challengerEl.classList.add('winner');
            targetEl.classList.add('loser');
        } else {
            targetEl.classList.add('winner');
            challengerEl.classList.add('loser');
        }
        winnerIcon.textContent = '👑';
        winnerText.textContent = `${winner} VINCE!`;
        consequence.textContent = `${winner}: punti x2 | ${loser}: punti /2`;
    }

    // Aggiorna punteggi locali (verranno aggiornati dal server)
});

socket.on('challenges:complete', () => {
    // Le sfide sono finite, il server invierà la prossima domanda
});

// Final Results
socket.on('game:final-results', ({ rankings }) => {
    clearInterval(timerInterval);
    showScreen('final');

    // Aggiorna punteggi finali dei players
    rankings.forEach(r => {
        const idx = players.findIndex(p => p.odId === r.odId);
        if (idx >= 0) {
            players[idx].score = r.score;
        }
    });

    const podium = document.getElementById('podium');
    podium.innerHTML = '';

    const places = ['first', 'second', 'third'];
    const medals = ['🏆', '🥈', '🥉'];

    rankings.slice(0, 3).forEach((r, i) => {
        const place = document.createElement('div');
        place.className = `podium-place ${places[i]} fade-in`;
        place.style.animationDelay = `${(2 - i) * 0.2}s`;
        place.innerHTML = `
            <div class="podium-rank">${medals[i]}</div>
            <div class="podium-name">${r.nickname}</div>
            <div class="podium-score">${r.score} punti</div>
        `;
        podium.appendChild(place);
    });

    // Avvia countdown per nuova partita automatica
    startFinalCountdown();
});

function startFinalCountdown() {
    let countdown = 60;
    const countdownEl = document.getElementById('final-countdown-timer');
    countdownEl.textContent = countdown;

    if (finalCountdownInterval) {
        clearInterval(finalCountdownInterval);
    }

    finalCountdownInterval = setInterval(() => {
        countdown--;
        countdownEl.textContent = countdown;

        if (countdown <= 0) {
            clearInterval(finalCountdownInterval);
            // Redirect alla pagina host per nuova partita
            window.location.href = '/host';
        }
    }, 1000);
}

// New Game (manuale)
document.getElementById('btn-new-game').addEventListener('click', () => {
    if (finalCountdownInterval) {
        clearInterval(finalCountdownInterval);
    }
    // Redirect alla pagina host per nuova partita
    window.location.href = '/host';
});

// Reactions
socket.on('game:reaction', ({ nickname, emoji }) => {
    showReaction(nickname, emoji);
});

function showReaction(nickname, emoji) {
    const container = document.getElementById('reactions-container');
    const reaction = document.createElement('div');
    reaction.className = 'reaction';
    reaction.textContent = emoji;

    // Posizione casuale su tutto lo schermo
    reaction.style.left = Math.random() * 80 + 10 + '%';
    reaction.style.top = Math.random() * 50 + 30 + '%';

    const label = document.createElement('div');
    label.style.fontSize = '1rem';
    label.style.marginTop = '5px';
    label.style.color = 'white';
    label.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
    label.textContent = nickname;
    reaction.appendChild(label);

    container.appendChild(reaction);

    setTimeout(() => {
        reaction.remove();
    }, 2000);
}

function showPowerPopup(event) {
    const container = document.getElementById('reactions-container');
    const popup = document.createElement('div');
    popup.className = 'power-popup';

    const icons = {
        steal: '🔥',
        block: '🚫',
        double: '✨',
        challenge: '⚔️',
        shuffle: '🔀',
        obfuscate: '🌫️',
        halve: '➗'
    };

    const messages = {
        steal: `${event.from} → RUBA → ${event.to}`,
        block: `${event.from} → BLOCCA → ${event.to}`,
        double: `${event.from} → DOPPIO`,
        challenge: `${event.from} → SFIDA → ${event.to}`,
        shuffle: `${event.from} → SHUFFLE → ${event.to}`,
        obfuscate: `${event.from} → OFFUSCA → ${event.to}`,
        halve: `${event.from} → DIMEZZA → ${event.to}`
    };

    popup.innerHTML = `
        <div class="power-popup-icon">${icons[event.type] || '⚡'}</div>
        <div class="power-popup-text">${messages[event.type] || ''}</div>
    `;

    popup.style.left = Math.random() * 60 + 20 + '%';
    container.appendChild(popup);

    setTimeout(() => {
        popup.classList.add('fade-out');
        setTimeout(() => popup.remove(), 500);
    }, 2500);
}

// Host disconnect - ricarica automaticamente
socket.on('disconnect', () => {
    setTimeout(() => location.reload(), 2000);
});

// Game ended by players vote - crea nuova partita automaticamente
socket.on('game:ended-by-players', () => {
    clearInterval(timerInterval);
    stopAutoStartCountdown();
    if (finalCountdownInterval) {
        clearInterval(finalCountdownInterval);
        finalCountdownInterval = null;
    }
    players = [];
    gamePin = null;
    socket.emit('host:create-game');
});
