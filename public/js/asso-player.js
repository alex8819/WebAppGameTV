// Asso che Fugge - Player Client

const socket = io();

// DOM Elements
const joinScreen = document.getElementById('join-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const countdownScreen = document.getElementById('countdown-screen');
const gameScreen = document.getElementById('game-screen');
const resultScreen = document.getElementById('result-screen');
const finalScreen = document.getElementById('final-screen');

const pinInput = document.getElementById('pin-input');
const nicknameInput = document.getElementById('nickname-input');
const btnJoin = document.getElementById('btn-join');
const errorMessageEl = document.getElementById('error-message');

const playerAvatarEl = document.getElementById('player-avatar');
const playerNameEl = document.getElementById('player-name');

const countdownNumberEl = document.getElementById('countdown-number');
const roundNumberEl = document.getElementById('round-number');
const scoreValueEl = document.getElementById('score-value');
const instructionEl = document.getElementById('instruction');
const cardsGridEl = document.getElementById('cards-grid');
const timerFillEl = document.getElementById('timer-fill');

const resultIconEl = document.getElementById('result-icon');
const resultTextEl = document.getElementById('result-text');
const pointsEarnedEl = document.getElementById('points-earned');

const finalTrophyEl = document.getElementById('final-trophy');
const finalPositionEl = document.getElementById('final-position');
const finalScoreEl = document.getElementById('final-score');

let gamePin = null;
let nickname = null;
let avatar = null;
let currentScore = 0;
let hasSelected = false;
let timerInterval = null;
let timeRemaining = 10;

// Join Game
btnJoin.addEventListener('click', joinGame);
pinInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') nicknameInput.focus(); });
nicknameInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') joinGame(); });

function joinGame() {
    const pin = pinInput.value.trim();
    const name = nicknameInput.value.trim();

    if (!pin || pin.length !== 4) {
        showError('Inserisci un codice valido (4 cifre)');
        return;
    }
    if (!name || name.length < 2) {
        showError('Inserisci un nickname (min 2 caratteri)');
        return;
    }

    gamePin = pin;
    nickname = name;
    socket.emit('asso:join-game', { pin, nickname: name });
}

function showError(message) {
    errorMessageEl.textContent = message;
    setTimeout(() => { errorMessageEl.textContent = ''; }, 3000);
}

socket.on('asso:joined', ({ avatar: playerAvatar }) => {
    avatar = playerAvatar;
    playerAvatarEl.textContent = avatar;
    playerNameEl.textContent = nickname;
    showScreen(lobbyScreen);
});

socket.on('asso:join-error', ({ message }) => {
    showError(message);
});

socket.on('asso:countdown', ({ count }) => {
    showScreen(countdownScreen);
    countdownNumberEl.textContent = count;
});

socket.on('asso:round-start', ({ round, totalRounds, cards, timeLimit }) => {
    showScreen(gameScreen);
    hasSelected = false;
    timeRemaining = timeLimit;

    roundNumberEl.textContent = round;
    instructionEl.textContent = "Tocca la carta dove pensi si nasconda l'Asso!";
    instructionEl.style.background = 'rgba(16, 185, 129, 0.1)';

    renderCards(cards);
    startTimer(timeLimit);
});

function renderCards(cards) {
    cardsGridEl.innerHTML = '';
    cards.forEach((card) => {
        const btn = document.createElement('button');
        btn.className = 'card-btn';
        btn.dataset.id = card.id;
        btn.innerHTML = '🎴';
        btn.addEventListener('click', () => selectCard(card.id, btn));
        cardsGridEl.appendChild(btn);
    });
}

function selectCard(cardId, btnEl) {
    if (hasSelected) return;
    hasSelected = true;

    // Disable all cards
    document.querySelectorAll('.card-btn').forEach(btn => {
        btn.classList.add('disabled');
    });

    // Mark selected
    btnEl.classList.remove('disabled');
    btnEl.classList.add('selected');

    instructionEl.textContent = 'Selezione inviata! Attendi...';
    instructionEl.style.background = 'rgba(99, 102, 241, 0.1)';

    socket.emit('asso:select-card', { pin: gamePin, cardId });
}

function startTimer(seconds) {
    if (timerInterval) clearInterval(timerInterval);

    timeRemaining = seconds;
    timerFillEl.style.width = '100%';
    timerFillEl.classList.remove('warning', 'danger');

    timerInterval = setInterval(() => {
        timeRemaining -= 0.1;
        const percent = (timeRemaining / seconds) * 100;
        timerFillEl.style.width = `${percent}%`;

        if (timeRemaining <= 3) {
            timerFillEl.classList.add('danger');
        } else if (timeRemaining <= 5) {
            timerFillEl.classList.add('warning');
        }

        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            if (!hasSelected) {
                instructionEl.textContent = 'Tempo scaduto!';
                instructionEl.style.background = 'rgba(239, 68, 68, 0.1)';
            }
        }
    }, 100);
}

socket.on('asso:selection-result', ({ isCorrect, points }) => {
    if (timerInterval) clearInterval(timerInterval);

    showScreen(resultScreen);

    if (isCorrect) {
        resultIconEl.textContent = '✓';
        resultIconEl.className = 'result-icon correct';
        resultTextEl.textContent = 'Hai trovato l\'asso!';
        pointsEarnedEl.textContent = `+${points}`;
        pointsEarnedEl.classList.remove('negative');
    } else {
        resultIconEl.textContent = '✗';
        resultIconEl.className = 'result-icon wrong';
        resultTextEl.textContent = 'Sbagliato!';
        pointsEarnedEl.textContent = '+0';
        pointsEarnedEl.classList.remove('negative');
    }

    currentScore += points;
    scoreValueEl.textContent = currentScore;
});

socket.on('asso:score-update', ({ score }) => {
    currentScore = score;
    scoreValueEl.textContent = score;
});

socket.on('asso:next-round', () => {
    // Will receive round-start
});

socket.on('asso:game-over', ({ rank, score, totalPlayers }) => {
    showScreen(finalScreen);

    const positions = ['', '1°', '2°', '3°', '4°', '5°', '6°', '7°', '8°'];
    const trophies = ['', '🏆', '🥈', '🥉', '🎖️', '🎖️', '🎖️', '🎖️', '🎖️'];

    finalTrophyEl.textContent = trophies[rank] || '🎖️';
    finalTrophyEl.className = rank === 1 ? 'final-trophy first' : 'final-trophy';

    finalPositionEl.textContent = positions[rank] || `${rank}°`;
    finalPositionEl.className = 'final-position';
    if (rank === 1) finalPositionEl.classList.add('first');
    else if (rank === 2) finalPositionEl.classList.add('second');
    else if (rank === 3) finalPositionEl.classList.add('third');

    finalScoreEl.textContent = `${score} punti`;
});

socket.on('asso:host-disconnected', () => {
    alert('L\'host ha chiuso la partita');
    location.reload();
});

socket.on('asso:error', ({ message }) => {
    showError(message);
});

function showScreen(screen) {
    [joinScreen, lobbyScreen, countdownScreen, gameScreen, resultScreen, finalScreen].forEach(s => {
        s.classList.add('hidden');
    });
    screen.classList.remove('hidden');
}
