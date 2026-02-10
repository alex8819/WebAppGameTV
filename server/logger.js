// Logger utility per Quiz Arena
// Traccia eventi, errori, domande e statistiche per debug

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'logs');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB per file

// Assicura che la directory logs esista
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Statistiche in memoria per analisi rapida
const stats = {
    quiz: {
        questionsUsed: new Map(), // questionId -> count
        sessions: 0,
        disconnections: 0,
        errors: []
    },
    elemental: {
        miniGamesPlayed: new Map(), // miniGameType -> count
        sessions: 0,
        disconnections: 0,
        errors: []
    },
    asso: {
        sessions: 0,
        disconnections: 0,
        knocks: 0,
        passes: 0,
        draws: 0,
        eliminations: 0,
        errors: []
    }
};

function getTimestamp() {
    return new Date().toISOString();
}

function getLogFileName(game) {
    const date = new Date().toISOString().split('T')[0];
    return path.join(LOG_DIR, `${game}-${date}.log`);
}

function rotateLogIfNeeded(filePath) {
    try {
        if (fs.existsSync(filePath)) {
            const stat = fs.statSync(filePath);
            if (stat.size > MAX_LOG_SIZE) {
                const backupPath = filePath.replace('.log', `-${Date.now()}.log`);
                fs.renameSync(filePath, backupPath);
            }
        }
    } catch (err) {
        console.error('Log rotation error:', err.message);
    }
}

function writeLog(game, level, category, message, data = {}) {
    const logFile = getLogFileName(game);
    rotateLogIfNeeded(logFile);

    const logEntry = {
        timestamp: getTimestamp(),
        level,
        category,
        message,
        ...data
    };

    const logLine = JSON.stringify(logEntry) + '\n';

    try {
        fs.appendFileSync(logFile, logLine);
    } catch (err) {
        console.error('Log write error:', err.message);
    }

    // Console output per livelli importanti
    if (level === 'ERROR' || level === 'WARN') {
        console.log(`[${game.toUpperCase()}] ${level}: ${message}`, data);
    }
}

// ============ QUIZ PARTY WAR LOGGING ============

const quiz = {
    // Traccia quando una partita viene creata
    gameCreated(pin, hostSocketId) {
        stats.quiz.sessions++;
        writeLog('quiz', 'INFO', 'GAME', 'Partita creata', { pin, hostSocketId, sessionNumber: stats.quiz.sessions });
    },

    // Traccia le domande caricate - IMPORTANTE per debug "stesse domande"
    questionsLoaded(pin, questions) {
        const questionIds = questions.map(q => q.id);
        const questionTexts = questions.slice(0, 10).map(q => ({ id: q.id, text: q.text.substring(0, 50) }));

        // Aggiorna contatore domande
        questionIds.forEach(id => {
            const count = stats.quiz.questionsUsed.get(id) || 0;
            stats.quiz.questionsUsed.set(id, count + 1);
        });

        writeLog('quiz', 'INFO', 'QUESTIONS', 'Domande caricate per partita', {
            pin,
            totalQuestions: questions.length,
            questionIds,
            preview: questionTexts
        });
    },

    // Traccia ogni domanda mostrata
    questionShown(pin, questionIndex, questionId, questionText) {
        writeLog('quiz', 'INFO', 'QUESTION', 'Domanda mostrata', {
            pin,
            questionNumber: questionIndex + 1,
            questionId,
            questionText: questionText.substring(0, 80)
        });
    },

    // Traccia risposte
    answerSubmitted(pin, nickname, questionId, answer, correct, responseTime) {
        writeLog('quiz', 'DEBUG', 'ANSWER', 'Risposta ricevuta', {
            pin,
            nickname,
            questionId,
            answer,
            correct,
            responseTimeMs: responseTime
        });
    },

    // Traccia uso abilita
    abilityUsed(pin, nickname, ability, targetNickname) {
        writeLog('quiz', 'INFO', 'ABILITY', 'Abilita usata', {
            pin,
            nickname,
            ability,
            target: targetNickname
        });
    },

    // Traccia sfide
    challengeStarted(pin, challenger, target) {
        writeLog('quiz', 'INFO', 'CHALLENGE', 'Sfida iniziata', { pin, challenger, target });
    },

    challengeResult(pin, winner, loser, isDraw) {
        writeLog('quiz', 'INFO', 'CHALLENGE', 'Sfida conclusa', { pin, winner, loser, isDraw });
    },

    // Traccia fine partita
    gameEnded(pin, rankings) {
        const topThree = rankings.slice(0, 3).map(r => ({ nickname: r.nickname, score: r.score }));
        writeLog('quiz', 'INFO', 'GAME', 'Partita terminata', { pin, topThree, totalPlayers: rankings.length });
    },

    // Traccia disconnessioni
    playerDisconnected(pin, nickname, wasHost) {
        stats.quiz.disconnections++;
        writeLog('quiz', 'WARN', 'DISCONNECT', 'Giocatore disconnesso', {
            pin,
            nickname,
            wasHost,
            totalDisconnections: stats.quiz.disconnections
        });
    },

    // Traccia errori
    error(pin, errorType, message, details = {}) {
        stats.quiz.errors.push({ timestamp: getTimestamp(), errorType, message });
        writeLog('quiz', 'ERROR', errorType, message, { pin, ...details });
    },

    // Ottieni statistiche domande (per capire quali escono piu spesso)
    getQuestionStats() {
        const sorted = Array.from(stats.quiz.questionsUsed.entries())
            .sort((a, b) => b[1] - a[1]);
        return {
            totalSessions: stats.quiz.sessions,
            totalDisconnections: stats.quiz.disconnections,
            mostUsedQuestions: sorted.slice(0, 10),
            leastUsedQuestions: sorted.slice(-10).reverse(),
            recentErrors: stats.quiz.errors.slice(-10)
        };
    }
};

// ============ ELEMENTAL CLASH LOGGING ============

const elemental = {
    // Traccia creazione partita
    gameCreated(pin, hostSocketId) {
        stats.elemental.sessions++;
        writeLog('elemental', 'INFO', 'GAME', 'Partita Elemental creata', { pin, hostSocketId, sessionNumber: stats.elemental.sessions });
    },

    // Traccia giocatore entrato
    playerJoined(pin, nickname, element, avatar) {
        writeLog('elemental', 'INFO', 'PLAYER', 'Giocatore entrato', { pin, nickname, element, avatar });
    },

    // Traccia inizio partita
    gameStarted(pin, playerCount) {
        writeLog('elemental', 'INFO', 'GAME', 'Partita iniziata', { pin, playerCount });
    },

    // Traccia mini-gioco - IMPORTANTE per debug
    miniGameStarted(pin, round, miniGameType, miniGameName) {
        const count = stats.elemental.miniGamesPlayed.get(miniGameType) || 0;
        stats.elemental.miniGamesPlayed.set(miniGameType, count + 1);

        writeLog('elemental', 'INFO', 'MINIGAME', 'Mini-gioco avviato', {
            pin,
            round,
            miniGameType,
            miniGameName,
            timesPlayed: count + 1
        });
    },

    // Traccia risultati mini-gioco
    miniGameResults(pin, round, miniGameType, rankings) {
        const summary = rankings.map(r => ({
            nickname: r.nickname,
            rank: r.rank,
            correct: r.isCorrect
        }));
        writeLog('elemental', 'INFO', 'MINIGAME', 'Mini-gioco concluso', {
            pin,
            round,
            miniGameType,
            results: summary
        });
    },

    // Traccia azioni round
    roundActions(pin, round, actions) {
        const actionSummary = actions.map(a => ({
            player: a.nickname,
            action: a.action
        }));
        writeLog('elemental', 'DEBUG', 'ROUND', 'Azioni round', { pin, round, actions: actionSummary });
    },

    // Traccia risultati round
    roundResults(pin, round, eliminations, playersRemaining) {
        writeLog('elemental', 'INFO', 'ROUND', 'Round concluso', {
            pin,
            round,
            eliminations: eliminations.map(e => e.player),
            playersRemaining
        });
    },

    // Traccia shuffle posizioni
    positionsShuffled(pin, round) {
        writeLog('elemental', 'INFO', 'GAME', 'Posizioni mescolate', { pin, round });
    },

    // Traccia fine partita
    gameEnded(pin, winner, rankings) {
        const topThree = rankings.slice(0, 3).map(r => ({ nickname: r.nickname, hp: r.hp }));
        writeLog('elemental', 'INFO', 'GAME', 'Partita terminata', {
            pin,
            winner: winner?.nickname,
            topThree
        });
    },

    // Traccia disconnessioni
    playerDisconnected(pin, nickname, wasHost) {
        stats.elemental.disconnections++;
        writeLog('elemental', 'WARN', 'DISCONNECT', 'Giocatore disconnesso', {
            pin,
            nickname,
            wasHost,
            totalDisconnections: stats.elemental.disconnections
        });
    },

    // Traccia errori
    error(pin, errorType, message, details = {}) {
        stats.elemental.errors.push({ timestamp: getTimestamp(), errorType, message });
        writeLog('elemental', 'ERROR', errorType, message, { pin, ...details });
    },

    // Ottieni statistiche mini-giochi
    getMiniGameStats() {
        const sorted = Array.from(stats.elemental.miniGamesPlayed.entries())
            .sort((a, b) => b[1] - a[1]);
        return {
            totalSessions: stats.elemental.sessions,
            totalDisconnections: stats.elemental.disconnections,
            miniGameFrequency: sorted,
            recentErrors: stats.elemental.errors.slice(-10)
        };
    }
};

// ============ ASSO CHE FUGGE (CUCÙ) LOGGING ============

const asso = {
    // Traccia creazione partita
    gameCreated(pin, hostSocketId) {
        stats.asso.sessions++;
        writeLog('asso', 'INFO', 'GAME', 'Partita Cucù creata', { pin, hostSocketId, sessionNumber: stats.asso.sessions });
    },

    // Traccia giocatore entrato
    playerJoined(pin, nickname, position) {
        writeLog('asso', 'INFO', 'PLAYER', 'Giocatore entrato', { pin, nickname, position });
    },

    // Traccia inizio partita
    gameStarted(pin, playerCount) {
        writeLog('asso', 'INFO', 'GAME', 'Partita iniziata', { pin, playerCount });
    },

    // Traccia inizio round
    roundStarted(pin, roundNumber, dealerNickname) {
        writeLog('asso', 'INFO', 'ROUND', 'Round iniziato', { pin, roundNumber, dealer: dealerNickname });
    },

    // Traccia carte distribuite
    cardsDealt(pin, roundNumber, cardAssignments) {
        const summary = cardAssignments.map(c => ({ nickname: c.nickname, card: c.card.fullName }));
        writeLog('asso', 'DEBUG', 'CARDS', 'Carte distribuite', { pin, roundNumber, cards: summary });
    },

    // Traccia azione giocatore - BUSSA
    playerKnocked(pin, nickname, cardValue) {
        stats.asso.knocks++;
        writeLog('asso', 'INFO', 'ACTION', 'Giocatore ha bussato', { pin, nickname, cardValue, totalKnocks: stats.asso.knocks });
    },

    // Traccia azione giocatore - PASSA
    playerPassed(pin, fromNickname, toNickname, blocked, blockedBy) {
        stats.asso.passes++;
        writeLog('asso', 'INFO', 'ACTION', 'Giocatore ha passato', {
            pin,
            from: fromNickname,
            to: toNickname,
            blocked: blocked || false,
            blockedBy: blockedBy || null,
            totalPasses: stats.asso.passes
        });
    },

    // Traccia scambio carte
    cardsSwapped(pin, fromNickname, toNickname, fromCard, toCard) {
        writeLog('asso', 'DEBUG', 'SWAP', 'Carte scambiate', {
            pin,
            from: fromNickname,
            to: toNickname,
            fromCard: fromCard?.fullName,
            toCard: toCard?.fullName
        });
    },

    // Traccia mazziere pesca
    dealerDrew(pin, nickname, oldCard, newCard, keptOld) {
        stats.asso.draws++;
        writeLog('asso', 'INFO', 'ACTION', 'Mazziere ha pescato', {
            pin,
            nickname,
            oldCard: oldCard?.fullName,
            newCard: newCard?.fullName,
            keptOld,
            totalDraws: stats.asso.draws
        });
    },

    // Traccia carta rivelata (Re o Cavallo)
    cardRevealed(pin, nickname, card, reason) {
        writeLog('asso', 'INFO', 'REVEAL', 'Carta rivelata', { pin, nickname, card: card.fullName, reason });
    },

    // Traccia fine round
    roundEnded(pin, roundNumber, losers, lowestCard) {
        const loserNames = losers.map(l => l.nickname);
        writeLog('asso', 'INFO', 'ROUND', 'Round terminato', {
            pin,
            roundNumber,
            losers: loserNames,
            lowestCard: lowestCard?.fullName
        });
    },

    // Traccia eliminazione
    playerEliminated(pin, nickname, atRound) {
        stats.asso.eliminations++;
        writeLog('asso', 'WARN', 'ELIMINATION', 'Giocatore eliminato', {
            pin,
            nickname,
            atRound,
            totalEliminations: stats.asso.eliminations
        });
    },

    // Traccia fine partita
    gameEnded(pin, winnerNickname, totalRounds) {
        writeLog('asso', 'INFO', 'GAME', 'Partita terminata', { pin, winner: winnerNickname, totalRounds });
    },

    // Traccia disconnessioni
    playerDisconnected(pin, nickname, wasHost) {
        stats.asso.disconnections++;
        writeLog('asso', 'WARN', 'DISCONNECT', 'Giocatore disconnesso', {
            pin,
            nickname,
            wasHost,
            totalDisconnections: stats.asso.disconnections
        });
    },

    // Traccia errori
    error(pin, errorType, message, details = {}) {
        stats.asso.errors.push({ timestamp: getTimestamp(), errorType, message });
        writeLog('asso', 'ERROR', errorType, message, { pin, ...details });
    },

    // Ottieni statistiche
    getStats() {
        return {
            totalSessions: stats.asso.sessions,
            totalDisconnections: stats.asso.disconnections,
            totalKnocks: stats.asso.knocks,
            totalPasses: stats.asso.passes,
            totalDraws: stats.asso.draws,
            totalEliminations: stats.asso.eliminations,
            recentErrors: stats.asso.errors.slice(-10)
        };
    }
};

// ============ GENERAL LOGGING ============

const general = {
    // Traccia connessione client
    clientConnected(socketId) {
        writeLog('general', 'DEBUG', 'CONNECTION', 'Client connesso', { socketId });
    },

    // Traccia disconnessione client
    clientDisconnected(socketId, games = {}) {
        writeLog('general', 'INFO', 'CONNECTION', 'Client disconnesso', { socketId, activeGames: games });
    },

    // Traccia errore socket
    socketError(socketId, event, error) {
        writeLog('general', 'ERROR', 'SOCKET', 'Errore socket', {
            socketId,
            event,
            error: error.message || error
        });
    },

    // Server startup
    serverStarted(port) {
        writeLog('general', 'INFO', 'SERVER', 'Server avviato', { port, timestamp: getTimestamp() });
    }
};

// API per visualizzare statistiche via endpoint (opzionale)
function getAllStats() {
    return {
        quiz: quiz.getQuestionStats(),
        elemental: elemental.getMiniGameStats(),
        asso: asso.getStats(),
        generatedAt: getTimestamp()
    };
}

module.exports = {
    quiz,
    elemental,
    asso,
    general,
    getAllStats
};
