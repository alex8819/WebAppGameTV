// Asso che Fugge - Host Client

const socket = io();

// DOM Elements
const lobbyScreen = document.getElementById('lobby-screen');
const countdownScreen = document.getElementById('countdown-screen');
const gameScreen = document.getElementById('game-screen');
const revealScreen = document.getElementById('reveal-screen');
const winnerScreen = document.getElementById('winner-screen');

const gamePinEl = document.getElementById('game-pin');
const playersCountEl = document.getElementById('players-count');
const playersGridEl = document.getElementById('players-grid');
const btnStart = document.getElementById('btn-start');
const startHintEl = document.getElementById('start-hint');

const countdownNumberEl = document.getElementById('countdown-number');
const roundValueEl = document.getElementById('round-value');
const timerValueEl = document.getElementById('timer-value');
const cardsDisplayEl = document.getElementById('cards-display');
const aceHintEl = document.getElementById('ace-hint');
const scoresListEl = document.getElementById('scores-list');

const revealCardEl = document.getElementById('reveal-card');
const revealTextEl = document.getElementById('reveal-text');
const roundWinnerEl = document.getElementById('round-winner');

const winnerNameEl = document.getElementById('winner-name');
const winnerScoreEl = document.getElementById('winner-score');
const finalRankingEl = document.getElementById('final-ranking');

let gamePin = null;
let timerInterval = null;
let currentRound = 0;
let totalRounds = 5;

// Initialize - Create game
socket.emit('asso:create-game');

socket.on('asso:game-created', ({ pin }) => {
    gamePin = pin;
    gamePinEl.textContent = pin;
});

socket.on('asso:player-joined', ({ players }) => {
    updatePlayersDisplay(players);
    checkCanStart(players.length);
});

socket.on('asso:player-left', ({ players }) => {
    updatePlayersDisplay(players);
    checkCanStart(players.length);
});

function updatePlayersDisplay(players) {
    playersCountEl.textContent = `(${players.length}/8)`;
    playersGridEl.innerHTML = '';

    players.forEach(player => {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.innerHTML = `
            <div class="avatar">${player.avatar}</div>
            <div class="name">${player.nickname}</div>
        `;
        playersGridEl.appendChild(card);
    });
}

function checkCanStart(playerCount) {
    const canStart = playerCount >= 2;
    btnStart.disabled = !canStart;
    startHintEl.textContent = canStart
        ? 'Premi per iniziare!'
        : 'In attesa di almeno 2 giocatori...';
}

btnStart.addEventListener('click', () => {
    if (!btnStart.disabled) {
        socket.emit('asso:start-game', { pin: gamePin });
    }
});

socket.on('asso:countdown', ({ count }) => {
    showScreen(countdownScreen);
    countdownNumberEl.textContent = count;
});

socket.on('asso:round-start', ({ round, totalRounds: total, cards, timeLimit }) => {
    currentRound = round;
    totalRounds = total;
    showScreen(gameScreen);

    roundValueEl.textContent = `${round}/${total}`;
    timerValueEl.textContent = timeLimit;
    aceHintEl.textContent = "L'asso si nasconde tra le carte...";

    renderCards(cards);
    startTimer(timeLimit);
});

function renderCards(cards) {
    cardsDisplayEl.innerHTML = '';
    cards.forEach((card, index) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'card';
        cardEl.dataset.id = card.id;
        cardEl.innerHTML = `<span>🎴</span>`;
        cardsDisplayEl.appendChild(cardEl);
    });
}

function startTimer(seconds) {
    if (timerInterval) clearInterval(timerInterval);

    let remaining = seconds;
    timerValueEl.textContent = remaining;

    timerInterval = setInterval(() => {
        remaining--;
        timerValueEl.textContent = remaining;

        if (remaining <= 0) {
            clearInterval(timerInterval);
        }
    }, 1000);
}

socket.on('asso:scores-update', ({ scores }) => {
    updateScoreboard(scores);
});

function updateScoreboard(scores) {
    scoresListEl.innerHTML = '';
    scores.forEach((player, index) => {
        const row = document.createElement('div');
        row.className = `score-row ${index === 0 ? 'first' : ''}`;
        row.innerHTML = `
            <span class="rank">${index + 1}.</span>
            <span class="name">${player.avatar} ${player.nickname}</span>
            <span class="points">${player.score}</span>
        `;
        scoresListEl.appendChild(row);
    });
}

socket.on('asso:round-end', ({ acePosition, roundWinner, scores }) => {
    if (timerInterval) clearInterval(timerInterval);

    showScreen(revealScreen);
    revealCardEl.textContent = '♠️';
    revealTextEl.textContent = `L'asso era nella posizione ${acePosition + 1}!`;
    roundWinnerEl.textContent = roundWinner
        ? `${roundWinner} l'ha trovato per primo!`
        : 'Nessuno ha trovato l\'asso!';

    updateScoreboard(scores);
});

socket.on('asso:next-round', () => {
    // Will receive round-start event
});

socket.on('asso:game-over', ({ winner, scores }) => {
    showScreen(winnerScreen);
    winnerNameEl.textContent = `${winner.avatar} ${winner.nickname}`;
    winnerScoreEl.textContent = `${winner.score} punti`;

    finalRankingEl.innerHTML = '';
    scores.forEach((player, index) => {
        const row = document.createElement('div');
        row.className = `score-row ${index === 0 ? 'first' : ''}`;
        row.innerHTML = `
            <span class="rank">${index + 1}.</span>
            <span class="name">${player.avatar} ${player.nickname}</span>
            <span class="points">${player.score}</span>
        `;
        finalRankingEl.appendChild(row);
    });
});

socket.on('asso:error', ({ message }) => {
    console.error('Asso Error:', message);
});

function showScreen(screen) {
    [lobbyScreen, countdownScreen, gameScreen, revealScreen, winnerScreen].forEach(s => {
        s.classList.add('hidden');
    });
    screen.classList.remove('hidden');
}
