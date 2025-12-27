const { queries, generateUniquePin } = require('./db');

const BASE_POINTS = 10;
const TIME_LIMIT = 25000; // 25 secondi per le domande
const CHALLENGE_TIME_LIMIT = 9000; // 9 secondi per le sfide
const RESULTS_DELAY = 7000; // 7 secondi per mostrare i risultati

class GameManager {
    constructor() {
        this.games = new Map(); // pin -> gameState
    }

    createGame(hostSocketId) {
        const pin = generateUniquePin();
        const result = queries.createGame.run(pin);
        const gameId = result.lastInsertRowid;

        const gameState = {
            id: gameId,
            pin,
            hostSocketId,
            status: 'lobby',
            players: new Map(), // socketId -> playerData
            questions: [],
            currentQuestionIndex: -1,
            questionStartTime: null,
            answers: new Map(), // socketId -> answerData
            abilities: new Map(), // socketId -> abilitiesUsedThisTurn
            blockedPlayers: new Set(), // playerId bloccati questo turno
            shuffledPlayers: new Set(), // socketId con tasti mescolati questo turno
            obfuscatedPlayers: new Set(), // socketId con domanda offuscata questo turno
            halvedPlayers: new Set(), // socketId con punti dimezzati questo turno
            targetedPlayers: new Set(), // socketId già bersagliati da un potere questo turno
            powerSelectionDone: new Set(), // socketId che hanno scelto/passato il potere
            // Timer management
            questionTimerId: null, // ID del timeout della domanda corrente
            resultsShown: false, // Flag per evitare doppia chiamata dei risultati
            challengeTimerId: null, // ID del timeout della sfida corrente
            challengeResultsShown: false, // Flag per evitare doppia chiamata risultati sfida
            // Sfide
            pendingChallenges: [], // [{challengerSocketId, targetSocketId, challengerNickname, targetNickname}]
            currentChallenge: null, // sfida in corso
            challengeAnswers: new Map(), // socketId -> {answer, responseTime}
            usedChallengeQuestions: new Set(), // IDs delle domande già usate per sfide
            // Exit votes
            exitVotes: new Set() // socketIds che vogliono uscire
        };

        this.games.set(pin, gameState);
        return { pin, gameId };
    }

    getGame(pin) {
        return this.games.get(pin);
    }

    joinGame(pin, nickname, socketId, animal = '🦇') {
        const game = this.games.get(pin);
        if (!game) return { error: 'PIN non valido' };
        if (game.status !== 'lobby') return { error: 'Partita già iniziata' };

        // Controlla se esiste già questo nickname
        const existingPlayer = queries.getPlayerByNickname.get(game.id, nickname);
        if (existingPlayer) {
            // Riconnessione
            queries.setPlayerConnected.run(1, existingPlayer.id);
            game.players.set(socketId, {
                odId: existingPlayer.id,
                nickname: existingPlayer.nickname,
                animal: animal,
                score: existingPlayer.score,
                abilities: JSON.parse(existingPlayer.abilities_used)
            });
            return { success: true, player: game.players.get(socketId), reconnected: true };
        }

        // Nuovo giocatore
        const result = queries.addPlayer.run(game.id, nickname);
        const playerId = result.lastInsertRowid;

        const playerData = {
            odId: playerId,
            nickname,
            animal,
            score: 0,
            abilities: { steal: false, double: false, block: false, challenge: false, shuffle: false, obfuscate: false, halve: false }
        };

        game.players.set(socketId, playerData);
        return { success: true, player: playerData, reconnected: false };
    }

    reconnectPlayer(pin, nickname, socketId) {
        const game = this.games.get(pin);
        if (!game) return { error: 'PIN non valido' };

        const dbPlayer = queries.getPlayerByNickname.get(game.id, nickname);
        if (!dbPlayer) return { error: 'Giocatore non trovato' };

        // Trova e rimuovi vecchio socket se esiste
        for (const [oldSocketId, player] of game.players) {
            if (player.odId === dbPlayer.id) {
                game.players.delete(oldSocketId);
                break;
            }
        }

        queries.setPlayerConnected.run(1, dbPlayer.id);
        const playerData = {
            odId: dbPlayer.id,
            nickname: dbPlayer.nickname,
            score: dbPlayer.score,
            abilities: JSON.parse(dbPlayer.abilities_used)
        };

        game.players.set(socketId, playerData);
        return { success: true, player: playerData, gameStatus: game.status };
    }

    leaveGame(socketId) {
        for (const [pin, game] of this.games) {
            if (game.players.has(socketId)) {
                const player = game.players.get(socketId);
                queries.setPlayerConnected.run(0, player.odId);
                game.players.delete(socketId);
                return { pin, player, isHost: false };
            }
            if (game.hostSocketId === socketId) {
                return { pin, isHost: true };
            }
        }
        return null;
    }

    startGame(pin) {
        const game = this.games.get(pin);
        if (!game) return { error: 'Partita non trovata' };
        if (game.players.size < 1) return { error: 'Servono almeno 1 giocatore' };

        // Carica 10 domande random + extra per le sfide
        game.questions = queries.getRandomQuestions.all(20);
        if (game.questions.length < 10) {
            return { error: `Solo ${game.questions.length} domande disponibili` };
        }

        game.status = 'playing';
        game.currentQuestionIndex = -1;
        queries.updateGameStatus.run('playing', 'playing', game.id);

        return { success: true };
    }

    nextQuestion(pin) {
        const game = this.games.get(pin);
        if (!game) return null;

        game.currentQuestionIndex++;
        if (game.currentQuestionIndex >= 10) { // Solo 10 domande normali
            return this.endGame(pin);
        }

        // Cancella eventuali timer precedenti
        if (game.questionTimerId) {
            clearTimeout(game.questionTimerId);
            game.questionTimerId = null;
        }

        // Reset stato turno
        game.answers.clear();
        game.resultsShown = false; // Reset flag per nuova domanda
        // game.abilities e game.blockedPlayers vengono cancellati in calculateTurnResults dopo essere stati applicati
        // game.pendingChallenges viene svuotato man mano che le sfide vengono processate
        game.questionStartTime = Date.now();

        const q = game.questions[game.currentQuestionIndex];

        // Prepara lista poteri attivi per questo turno
        const activePowers = [];
        for (const [socketId, abilities] of game.abilities) {
            const player = game.players.get(socketId);
            if (!player) continue;

            for (const ability of abilities) {
                const target = ability.targetSocketId ? game.players.get(ability.targetSocketId) : null;
                activePowers.push({
                    type: ability.type,
                    user: player.nickname,
                    target: target?.nickname || null
                });
            }
        }

        return {
            questionNum: game.currentQuestionIndex + 1,
            total: 10,
            text: q.text,
            options: {
                A: q.option_a,
                B: q.option_b,
                C: q.option_c,
                D: q.option_d
            },
            timeLimit: TIME_LIMIT,
            activePowers
        };
    }

    submitAnswer(pin, socketId, answer) {
        const game = this.games.get(pin);
        if (!game || game.status !== 'playing') return { error: 'Partita non in corso' };

        const player = game.players.get(socketId);
        if (!player) return { error: 'Giocatore non trovato' };

        if (game.answers.has(socketId)) return { error: 'Hai già risposto' };

        const responseTime = Date.now() - game.questionStartTime;
        game.answers.set(socketId, {
            answer,
            responseTime,
            playerId: player.odId
        });

        return {
            success: true,
            answeredCount: game.answers.size,
            totalPlayers: game.players.size
        };
    }

    useAbility(pin, socketId, ability, targetSocketId) {
        const game = this.games.get(pin);
        if (!game || game.status !== 'playing') return { error: 'Partita non in corso' };

        const player = game.players.get(socketId);
        if (!player) return { error: 'Giocatore non trovato' };

        if (player.abilities[ability]) return { error: 'Abilità già usata' };

        const target = targetSocketId ? game.players.get(targetSocketId) : null;

        // Valida abilità che richiedono target
        if ((ability === 'steal' || ability === 'block' || ability === 'challenge' || ability === 'shuffle' || ability === 'obfuscate' || ability === 'halve') && !target) {
            return { error: 'Seleziona un bersaglio' };
        }

        // Verifica che il bersaglio non sia già stato colpito da un altro potere
        if (targetSocketId && game.targetedPlayers.has(targetSocketId)) {
            return { error: 'Questo giocatore è già bersaglio di un altro potere' };
        }

        // Segna abilità come usata
        player.abilities[ability] = true;
        queries.updatePlayerAbilities.run(JSON.stringify(player.abilities), player.odId);

        // Registra l'uso di abilità per questo turno
        if (!game.abilities.has(socketId)) {
            game.abilities.set(socketId, []);
        }
        game.abilities.get(socketId).push({
            type: ability,
            targetSocketId,
            targetId: target?.odId
        });

        // Se è un blocco, segna il giocatore come bloccato
        if (ability === 'block' && target) {
            game.blockedPlayers.add(target.odId);
        }

        // Se è uno shuffle, segna il giocatore con tasti mescolati
        if (ability === 'shuffle' && targetSocketId) {
            game.shuffledPlayers.add(targetSocketId);
        }

        // Se è un offuscamento, segna il giocatore con domanda offuscata
        if (ability === 'obfuscate' && targetSocketId) {
            game.obfuscatedPlayers.add(targetSocketId);
        }

        // Se è un dimezzamento, segna il giocatore con punti dimezzati
        if (ability === 'halve' && targetSocketId) {
            game.halvedPlayers.add(targetSocketId);
        }

        // Se è una sfida, aggiungi alle sfide pendenti
        if (ability === 'challenge' && target) {
            game.pendingChallenges.push({
                challengerSocketId: socketId,
                targetSocketId: targetSocketId,
                challengerNickname: player.nickname,
                targetNickname: target.nickname
            });
        }

        // Segna il bersaglio come già colpito (per impedire altri poteri su di lui)
        if (targetSocketId) {
            game.targetedPlayers.add(targetSocketId);
        }

        return {
            success: true,
            ability,
            targetNickname: target?.nickname,
            remainingAbilities: player.abilities
        };
    }

    // Metodi per gestire i timer
    setQuestionTimer(pin, timerId) {
        const game = this.games.get(pin);
        if (game) {
            game.questionTimerId = timerId;
        }
    }

    clearQuestionTimer(pin) {
        const game = this.games.get(pin);
        if (game && game.questionTimerId) {
            clearTimeout(game.questionTimerId);
            game.questionTimerId = null;
        }
    }

    setChallengeTimer(pin, timerId) {
        const game = this.games.get(pin);
        if (game) {
            game.challengeTimerId = timerId;
        }
    }

    clearChallengeTimer(pin) {
        const game = this.games.get(pin);
        if (game && game.challengeTimerId) {
            clearTimeout(game.challengeTimerId);
            game.challengeTimerId = null;
        }
    }

    canShowResults(pin) {
        const game = this.games.get(pin);
        if (!game || game.resultsShown) return false;
        game.resultsShown = true;
        return true;
    }

    canShowChallengeResults(pin) {
        const game = this.games.get(pin);
        if (!game || game.challengeResultsShown) return false;
        game.challengeResultsShown = true;
        return true;
    }

    resetChallengeResultsFlag(pin) {
        const game = this.games.get(pin);
        if (game) {
            game.challengeResultsShown = false;
        }
    }

    // Power selection tracking
    markPowerSelectionDone(pin, socketId) {
        const game = this.games.get(pin);
        if (game) {
            game.powerSelectionDone.add(socketId);
        }
    }

    getPowerSelectionStatus(pin) {
        const game = this.games.get(pin);
        if (!game) return { ready: 0, total: 0, allReady: false };

        const total = game.players.size;
        const ready = game.powerSelectionDone.size;
        return {
            ready,
            total,
            allReady: ready >= total
        };
    }

    resetPowerSelections(pin) {
        const game = this.games.get(pin);
        if (game) {
            game.powerSelectionDone.clear();
        }
    }

    getTargetedPlayers(pin) {
        const game = this.games.get(pin);
        if (!game) return [];
        return Array.from(game.targetedPlayers);
    }

    calculateTurnResults(pin) {
        const game = this.games.get(pin);
        if (!game) return null;

        const question = game.questions[game.currentQuestionIndex];
        const correctAnswer = question.correct_answer;
        const results = [];

        // Prima passa: calcola punti base per tutti
        const pointsEarned = new Map();

        for (const [socketId, player] of game.players) {
            const answerData = game.answers.get(socketId);
            let points = 0;
            let correct = false;
            let answer = null;

            if (answerData) {
                answer = answerData.answer;
                correct = answer === correctAnswer;

                if (correct && !game.blockedPlayers.has(player.odId)) {
                    // Bonus velocità: max +5 punti se rispondi entro 2 secondi
                    const speedBonus = Math.max(0, 5 - Math.floor(answerData.responseTime / 3000));
                    points = BASE_POINTS + speedBonus;

                    // Controlla se ha usato DOUBLE
                    const abilities = game.abilities.get(socketId) || [];
                    const usedDouble = abilities.some(a => a.type === 'double');
                    if (usedDouble) {
                        points *= 2;
                    }

                    // Controlla se è stato dimezzato da qualcuno
                    if (game.halvedPlayers.has(socketId)) {
                        points = Math.floor(points / 2);
                    }
                }
            }

            pointsEarned.set(socketId, points);
        }

        // Seconda passa: applica STEAL
        const events = [];
        for (const [socketId, abilities] of game.abilities) {
            const player = game.players.get(socketId);
            for (const ability of abilities) {
                if (ability.type === 'steal' && ability.targetSocketId) {
                    const target = game.players.get(ability.targetSocketId);
                    if (target) {
                        // Ruba 2 punti
                        const currentPoints = pointsEarned.get(socketId) || 0;
                        pointsEarned.set(socketId, currentPoints + 2);

                        const targetPoints = pointsEarned.get(ability.targetSocketId) || 0;
                        pointsEarned.set(ability.targetSocketId, Math.max(0, targetPoints - 2));

                        events.push({
                            type: 'steal',
                            from: player.nickname,
                            to: target.nickname
                        });
                    }
                }
                if (ability.type === 'block' && ability.targetSocketId) {
                    const target = game.players.get(ability.targetSocketId);
                    if (target) {
                        events.push({
                            type: 'block',
                            from: player.nickname,
                            to: target.nickname
                        });
                    }
                }
                if (ability.type === 'double') {
                    events.push({
                        type: 'double',
                        from: player.nickname
                    });
                }
                if (ability.type === 'challenge' && ability.targetSocketId) {
                    const target = game.players.get(ability.targetSocketId);
                    if (target) {
                        events.push({
                            type: 'challenge',
                            from: player.nickname,
                            to: target.nickname
                        });
                    }
                }
                if (ability.type === 'shuffle' && ability.targetSocketId) {
                    const target = game.players.get(ability.targetSocketId);
                    if (target) {
                        events.push({
                            type: 'shuffle',
                            from: player.nickname,
                            to: target.nickname
                        });
                    }
                }
                if (ability.type === 'obfuscate' && ability.targetSocketId) {
                    const target = game.players.get(ability.targetSocketId);
                    if (target) {
                        events.push({
                            type: 'obfuscate',
                            from: player.nickname,
                            to: target.nickname
                        });
                    }
                }
                if (ability.type === 'halve' && ability.targetSocketId) {
                    const target = game.players.get(ability.targetSocketId);
                    if (target) {
                        events.push({
                            type: 'halve',
                            from: player.nickname,
                            to: target.nickname
                        });
                    }
                }
            }
        }

        // Aggiorna punteggi e prepara risultati
        for (const [socketId, player] of game.players) {
            const answerData = game.answers.get(socketId);
            const points = pointsEarned.get(socketId) || 0;

            // Aggiorna punteggio
            player.score += points;
            queries.updatePlayerScore.run(points, player.odId);

            // Salva nella history
            queries.addHistory.run(
                game.id,
                player.odId,
                question.id,
                answerData?.answer || null,
                answerData?.answer === correctAnswer ? 1 : 0,
                points,
                answerData?.responseTime || null,
                null, // ability_used - semplificato
                null  // ability_target_id
            );

            results.push({
                odId: player.odId,
                socketId,
                nickname: player.nickname,
                answer: answerData?.answer || '-',
                correct: answerData?.answer === correctAnswer,
                points,
                totalScore: player.score,
                wasBlocked: game.blockedPlayers.has(player.odId)
            });
        }

        // Ordina per punteggio
        results.sort((a, b) => b.totalScore - a.totalScore);

        // Cancella le abilità e i giocatori bloccati/shuffled/offuscati/dimezzati dopo averli applicati
        game.abilities.clear();
        game.blockedPlayers.clear();
        game.shuffledPlayers.clear();
        game.obfuscatedPlayers.clear();
        game.halvedPlayers.clear();
        game.targetedPlayers.clear();

        return {
            correctAnswer,
            question: {
                text: question.text,
                options: {
                    A: question.option_a,
                    B: question.option_b,
                    C: question.option_c,
                    D: question.option_d
                }
            },
            results,
            events,
            isLastQuestion: game.currentQuestionIndex >= 9,
            hasChallenges: game.pendingChallenges.length > 0
        };
    }

    // === SFIDE ===

    hasPendingChallenges(pin) {
        const game = this.games.get(pin);
        return game && game.pendingChallenges.length > 0;
    }

    getNextChallenge(pin) {
        const game = this.games.get(pin);
        if (!game || game.pendingChallenges.length === 0) return null;

        // Prendi la prossima sfida
        const challenge = game.pendingChallenges.shift();
        game.currentChallenge = challenge;
        game.challengeAnswers.clear();

        // Trova una domanda non ancora usata per sfide
        let questionIndex = 10; // Le prime 10 sono per il gioco normale
        while (questionIndex < game.questions.length &&
               game.usedChallengeQuestions.has(game.questions[questionIndex].id)) {
            questionIndex++;
        }

        if (questionIndex >= game.questions.length) {
            // Non ci sono più domande, usa una random già usata
            questionIndex = 10 + Math.floor(Math.random() * (game.questions.length - 10));
        }

        const q = game.questions[questionIndex];
        game.usedChallengeQuestions.add(q.id);
        game.currentChallenge.questionId = q.id;
        game.currentChallenge.correctAnswer = q.correct_answer;
        game.questionStartTime = Date.now();

        return {
            challenger: challenge.challengerNickname,
            challengerSocketId: challenge.challengerSocketId,
            target: challenge.targetNickname,
            targetSocketId: challenge.targetSocketId,
            question: {
                text: q.text,
                options: {
                    A: q.option_a,
                    B: q.option_b,
                    C: q.option_c,
                    D: q.option_d
                }
            },
            timeLimit: CHALLENGE_TIME_LIMIT,
            remainingChallenges: game.pendingChallenges.length
        };
    }

    submitChallengeAnswer(pin, socketId, answer) {
        const game = this.games.get(pin);
        if (!game || !game.currentChallenge) return { error: 'Nessuna sfida in corso' };

        const challenge = game.currentChallenge;

        // Verifica che sia uno dei due sfidanti
        if (socketId !== challenge.challengerSocketId && socketId !== challenge.targetSocketId) {
            return { error: 'Non sei parte di questa sfida' };
        }

        if (game.challengeAnswers.has(socketId)) {
            return { error: 'Hai già risposto' };
        }

        const responseTime = Date.now() - game.questionStartTime;
        game.challengeAnswers.set(socketId, {
            answer,
            responseTime
        });

        const bothAnswered = game.challengeAnswers.size >= 2;

        return {
            success: true,
            bothAnswered
        };
    }

    calculateChallengeResult(pin) {
        const game = this.games.get(pin);
        if (!game || !game.currentChallenge) return null;

        const challenge = game.currentChallenge;
        const correctAnswer = challenge.correctAnswer;

        const challengerAnswer = game.challengeAnswers.get(challenge.challengerSocketId);
        const targetAnswer = game.challengeAnswers.get(challenge.targetSocketId);

        const challengerCorrect = challengerAnswer?.answer === correctAnswer;
        const targetCorrect = targetAnswer?.answer === correctAnswer;

        let winner = null;
        let loser = null;
        let winnerSocketId = null;
        let loserSocketId = null;

        if (challengerCorrect && targetCorrect) {
            // Entrambi corretti: vince il più veloce
            if (challengerAnswer.responseTime <= targetAnswer.responseTime) {
                winner = challenge.challengerNickname;
                loser = challenge.targetNickname;
                winnerSocketId = challenge.challengerSocketId;
                loserSocketId = challenge.targetSocketId;
            } else {
                winner = challenge.targetNickname;
                loser = challenge.challengerNickname;
                winnerSocketId = challenge.targetSocketId;
                loserSocketId = challenge.challengerSocketId;
            }
        } else if (challengerCorrect) {
            winner = challenge.challengerNickname;
            loser = challenge.targetNickname;
            winnerSocketId = challenge.challengerSocketId;
            loserSocketId = challenge.targetSocketId;
        } else if (targetCorrect) {
            winner = challenge.targetNickname;
            loser = challenge.challengerNickname;
            winnerSocketId = challenge.targetSocketId;
            loserSocketId = challenge.challengerSocketId;
        }
        // Se nessuno ha risposto correttamente, winner rimane null

        // Applica modifiche ai punteggi
        if (winner && loser) {
            const winnerPlayer = game.players.get(winnerSocketId);
            const loserPlayer = game.players.get(loserSocketId);

            if (winnerPlayer && loserPlayer) {
                const winnerOldScore = winnerPlayer.score;
                const loserOldScore = loserPlayer.score;

                // Raddoppia i punti del vincitore
                winnerPlayer.score = winnerOldScore * 2;
                // Dimezza i punti del perdente (arrotonda per difetto)
                loserPlayer.score = Math.floor(loserOldScore / 2);

                // Aggiorna nel database
                queries.updatePlayerScore.run(winnerPlayer.score - winnerOldScore, winnerPlayer.odId);
                queries.updatePlayerScore.run(loserPlayer.score - loserOldScore, loserPlayer.odId);
            }
        }

        // Reset sfida corrente
        game.currentChallenge = null;

        return {
            correctAnswer,
            challenger: {
                nickname: challenge.challengerNickname,
                socketId: challenge.challengerSocketId,
                answer: challengerAnswer?.answer || null,
                correct: challengerCorrect,
                responseTime: challengerAnswer?.responseTime || null
            },
            target: {
                nickname: challenge.targetNickname,
                socketId: challenge.targetSocketId,
                answer: targetAnswer?.answer || null,
                correct: targetCorrect,
                responseTime: targetAnswer?.responseTime || null
            },
            winner,
            loser,
            winnerSocketId,
            loserSocketId,
            isDraw: !winner,
            hasMoreChallenges: game.pendingChallenges.length > 0
        };
    }

    bothChallengeAnswered(pin) {
        const game = this.games.get(pin);
        if (!game || !game.currentChallenge) return false;
        return game.challengeAnswers.size >= 2;
    }

    endGame(pin) {
        const game = this.games.get(pin);
        if (!game) return null;

        game.status = 'finished';
        queries.updateGameStatus.run('finished', 'finished', game.id);

        const rankings = [];
        for (const [socketId, player] of game.players) {
            rankings.push({
                odId: player.odId,
                socketId,
                nickname: player.nickname,
                score: player.score
            });
        }

        rankings.sort((a, b) => b.score - a.score);

        return {
            finished: true,
            rankings
        };
    }

    getPlayers(pin) {
        const game = this.games.get(pin);
        if (!game) return [];

        return Array.from(game.players.values()).map(p => ({
            odId: p.odId,
            nickname: p.nickname,
            animal: p.animal,
            score: p.score
        }));
    }

    getOtherPlayers(pin, excludeSocketId) {
        const game = this.games.get(pin);
        if (!game) return [];

        const others = [];
        for (const [socketId, player] of game.players) {
            if (socketId !== excludeSocketId) {
                others.push({
                    socketId,
                    odId: player.odId,
                    nickname: player.nickname,
                    animal: player.animal
                });
            }
        }
        return others;
    }

    allAnswered(pin) {
        const game = this.games.get(pin);
        if (!game) return false;
        return game.answers.size >= game.players.size;
    }

    deleteGame(pin) {
        this.games.delete(pin);
    }

    voteExit(pin, socketId, vote) {
        const game = this.games.get(pin);
        if (!game) return null;

        if (vote) {
            game.exitVotes.add(socketId);
        } else {
            game.exitVotes.delete(socketId);
        }

        const votedCount = game.exitVotes.size;
        const totalPlayers = game.players.size;
        const allVoted = votedCount >= totalPlayers && totalPlayers > 0;

        return {
            votedCount,
            totalPlayers,
            allVoted
        };
    }

    resetExitVotes(pin) {
        const game = this.games.get(pin);
        if (game) {
            game.exitVotes.clear();
        }
    }
}

module.exports = new GameManager();
