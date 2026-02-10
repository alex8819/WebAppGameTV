const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

const gameManager = require('./gameManager');
const elementalManager = require('./elementalGameManager');
const racersManager = require('./racersGameManager');
const towerManager = require('./towerDefenseGameManager');
const mazeManager = require('./mazeGameManager');
const assoManager = require('./assoGameManager');
const logger = require('./logger');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: '*' }
});

// Serve file statici
app.use(express.static(path.join(__dirname, '..', 'public')));

// Route per host e player
app.get('/host', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'host.html'));
});

app.get('/play', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'player.html'));
});

// Elemental Clash routes
app.get('/elemental-host', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'elemental-host.html'));
});

app.get('/elemental-play', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'elemental-play.html'));
});

// Micro Racers routes
app.get('/racers-host', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'racers-host.html'));
});

app.get('/racers-play', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'racers-play.html'));
});

// Tower Defense routes
app.get('/tower-host', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'tower-host.html'));
});

app.get('/tower-play', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'tower-play.html'));
});

// Maze game routes
app.get('/maze-home', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'maze-home.html'));
});

app.get('/maze-host', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'maze-host.html'));
});

app.get('/maze-play', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'maze-play.html'));
});

// Asso che Fugge routes
app.get('/asso-host', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'asso-host.html'));
});

app.get('/asso-play', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'asso-play.html'));
});

// API per statistiche e log (utile per debug)
app.get('/api/stats', (req, res) => {
    res.json(logger.getAllStats());
});

// Socket.io handlers
io.on('connection', (socket) => {
    console.log(`Client connesso: ${socket.id}`);
    logger.general.clientConnected(socket.id);

    // === HOST EVENTS ===

    socket.on('host:create-game', () => {
        const { pin, gameId } = gameManager.createGame(socket.id);
        socket.join(`game:${pin}`);
        socket.join(`host:${pin}`);
        socket.emit('game:created', { pin });
        console.log(`Partita creata: PIN ${pin}`);
    });

    socket.on('host:start-game', ({ pin }) => {
        const result = gameManager.startGame(pin);
        if (result.error) {
            socket.emit('game:error', { message: result.error });
            return;
        }

        // Notifica tutti i giocatori
        io.to(`game:${pin}`).emit('game:started');

        // Invia prima domanda dopo breve pausa
        setTimeout(() => {
            const question = gameManager.nextQuestion(pin);
            if (question) {
                sendQuestion(pin, question);
            }
        }, 1000);
    });

    socket.on('host:next-question', ({ pin }) => {
        const question = gameManager.nextQuestion(pin);
        if (question) {
            if (question.finished) {
                // Partita finita
                io.to(`host:${pin}`).emit('game:final-results', { rankings: question.rankings });
                sendFinalToPlayers(pin, question.rankings);
            } else {
                sendQuestion(pin, question);
            }
        }
    });

    // === PLAYER EVENTS ===

    socket.on('player:join', ({ pin, nickname, animal }) => {
        const result = gameManager.joinGame(pin, nickname, socket.id, animal);

        if (result.error) {
            socket.emit('join:error', { message: result.error });
            return;
        }

        socket.join(`game:${pin}`);
        socket.data.pin = pin;
        socket.data.nickname = nickname;

        // Notifica il giocatore
        socket.emit('lobby:joined', {
            gamePin: pin,
            players: gameManager.getPlayers(pin),
            reconnected: result.reconnected
        });

        // Notifica l'host
        io.to(`host:${pin}`).emit('game:player-joined', {
            player: result.player
        });

        // Aggiorna tutti i giocatori sulla lobby
        io.to(`game:${pin}`).emit('lobby:update', {
            players: gameManager.getPlayers(pin)
        });

        console.log(`${nickname} si è unito alla partita ${pin}`);
    });

    socket.on('player:reconnect', ({ pin, nickname }) => {
        const result = gameManager.reconnectPlayer(pin, nickname, socket.id);

        if (result.error) {
            socket.emit('join:error', { message: result.error });
            return;
        }

        socket.join(`game:${pin}`);
        socket.data.pin = pin;
        socket.data.nickname = nickname;

        socket.emit('reconnect:success', {
            gamePin: pin,
            player: result.player,
            gameStatus: result.gameStatus
        });

        console.log(`${nickname} riconnesso alla partita ${pin}`);
    });

    socket.on('player:answer', ({ pin, answer }) => {
        const result = gameManager.submitAnswer(pin, socket.id, answer);

        if (result.error) {
            // Log se il giocatore non e' trovato
            if (result.error === 'Giocatore non trovato') {
                logger.quiz.error(pin, 'PLAYER_NOT_FOUND', 'Risposta da giocatore non trovato', {
                    socketId: socket.id,
                    answer
                });
                socket.emit('answer:error', { message: 'Sessione scaduta - ricarica la pagina' });
            } else {
                socket.emit('answer:error', { message: result.error });
            }
            return;
        }

        socket.emit('game:answer-confirmed');

        // Notifica host del progresso
        io.to(`host:${pin}`).emit('game:answers-update', {
            answeredCount: result.answeredCount,
            totalPlayers: result.totalPlayers
        });

        // Se tutti hanno risposto, mostra risultati
        if (gameManager.allAnswered(pin)) {
            showTurnResults(pin);
        }
    });

    socket.on('player:use-ability', ({ pin, ability, targetSocketId }) => {
        const game = gameManager.getGame(pin);
        if (!game) {
            socket.emit('ability:error', { message: 'Partita non trovata' });
            return;
        }

        const attacker = game.players.get(socket.id);
        if (!attacker) {
            logger.quiz.error(pin, 'PLAYER_NOT_FOUND', 'Uso abilita da giocatore non trovato', {
                socketId: socket.id,
                ability,
                playersInGame: Array.from(game.players.keys())
            });
            socket.emit('ability:error', { message: 'Sessione scaduta - ricarica la pagina' });
            return;
        }

        const result = gameManager.useAbility(pin, socket.id, ability, targetSocketId);

        if (result.error) {
            socket.emit('ability:error', { message: result.error });
            return;
        }

        socket.emit('game:ability-result', {
            success: true,
            ability,
            targetNickname: result.targetNickname,
            remainingAbilities: result.remainingAbilities
        });

        // Notifica immediatamente il giocatore bloccato
        if (ability === 'block' && targetSocketId) {
            io.to(targetSocketId).emit('game:blocked', {
                byPlayer: attacker?.nickname || 'Qualcuno'
            });
        }

        // Notifica immediatamente il giocatore sfidato
        if (ability === 'challenge' && targetSocketId) {
            io.to(targetSocketId).emit('game:challenged', {
                byPlayer: attacker?.nickname || 'Qualcuno'
            });
        }

        // Notifica immediatamente il giocatore shufflato
        if (ability === 'shuffle' && targetSocketId) {
            io.to(targetSocketId).emit('game:shuffled', {
                byPlayer: attacker?.nickname || 'Qualcuno'
            });
        }

        // Notifica immediatamente il giocatore offuscato
        if (ability === 'obfuscate' && targetSocketId) {
            io.to(targetSocketId).emit('game:obfuscated', {
                byPlayer: attacker?.nickname || 'Qualcuno'
            });
        }

        // Notifica immediatamente il giocatore dimezzato
        if (ability === 'halve' && targetSocketId) {
            io.to(targetSocketId).emit('game:halved', {
                byPlayer: attacker?.nickname || 'Qualcuno'
            });
        }

        // Notifica l'host del potere usato (popup in tempo reale)
        io.to(`host:${pin}`).emit('game:power-used', {
            type: ability,
            from: attacker?.nickname || 'Qualcuno',
            to: result.targetNickname || null
        });

        // Broadcast lista giocatori già bersagliati a tutti i player
        const targetedPlayers = gameManager.getTargetedPlayers(pin);
        for (const [playerSocketId] of game.players) {
            io.to(playerSocketId).emit('game:targeted-players-update', {
                targetedPlayers
            });
        }

        // Segna il giocatore come "pronto" per la prossima domanda
        gameManager.markPowerSelectionDone(pin, socket.id);
        broadcastPowerSelectionStatus(pin);
    });

    // Giocatore passa (non usa potere)
    socket.on('player:pass-power', ({ pin }) => {
        const game = gameManager.getGame(pin);
        if (!game) {
            socket.emit('game:error', { message: 'Partita non trovata' });
            return;
        }

        const player = game.players.get(socket.id);

        // LOG: Debug passa potere
        logger.quiz.error(pin, 'PASS_POWER', 'Giocatore ha passato', {
            nickname: player?.nickname || 'DISCONNECTED',
            socketId: socket.id,
            playersCount: game.players.size,
            alreadyDone: game.powerSelectionDone?.has(socket.id) || false,
            playerFound: !!player
        });

        // Se il giocatore non e' trovato, log ma continua comunque
        if (!player) {
            logger.quiz.error(pin, 'PLAYER_NOT_FOUND', 'Pass power da giocatore non trovato', {
                socketId: socket.id,
                playersInGame: Array.from(game.players.keys())
            });
            socket.emit('game:error', { message: 'Sessione scaduta - ricarica la pagina' });
            return;
        }

        gameManager.markPowerSelectionDone(pin, socket.id);
        socket.emit('game:power-passed');
        broadcastPowerSelectionStatus(pin);
    });

    socket.on('player:get-targets', ({ pin }) => {
        const targets = gameManager.getOtherPlayers(pin, socket.id);
        socket.emit('game:targets', { targets });
    });

    socket.on('player:reaction', ({ pin, emoji }) => {
        const game = gameManager.getGame(pin);
        if (!game) return;

        const player = game.players.get(socket.id);
        if (!player) {
            logger.quiz.error(pin, 'PLAYER_NOT_FOUND', 'Reaction da giocatore non trovato', { socketId: socket.id });
            return;
        }

        io.to(`host:${pin}`).emit('game:reaction', {
            nickname: player.nickname,
            emoji
        });
    });

    // === CHALLENGE EVENTS ===

    socket.on('player:challenge-answer', ({ pin, answer }) => {
        const result = gameManager.submitChallengeAnswer(pin, socket.id, answer);

        if (result.error) {
            socket.emit('challenge:error', { message: result.error });
            return;
        }

        socket.emit('challenge:answer-confirmed');

        // Se entrambi hanno risposto, mostra risultati
        if (result.bothAnswered) {
            showChallengeResults(pin);
        }
    });

    // === EXIT VOTE ===

    socket.on('player:vote-exit', ({ pin, vote }) => {
        const result = gameManager.voteExit(pin, socket.id, vote);
        if (!result) return;

        // Notifica tutti i giocatori dell'aggiornamento
        io.to(`game:${pin}`).emit('game:exit-update', {
            votedCount: result.votedCount,
            totalPlayers: result.totalPlayers
        });

        // Se tutti hanno votato, termina la partita
        if (result.allVoted) {
            io.to(`game:${pin}`).emit('game:ended-by-players');
            io.to(`host:${pin}`).emit('game:ended-by-players');
            gameManager.deleteGame(pin);
            console.log(`Partita ${pin} terminata dai giocatori`);
        }
    });

    // === ELEMENTAL CLASH EVENTS ===

    socket.on('elemental:host-create', () => {
        const { pin } = elementalManager.createGame(socket.id);
        socket.join(`elemental:${pin}`);
        socket.join(`elemental-host:${pin}`);
        socket.emit('elemental:created', { pin });
        console.log(`Elemental Clash creato: PIN ${pin}`);
    });

    socket.on('elemental:player-join', ({ pin, nickname, avatar, element }) => {
        const result = elementalManager.joinGame(pin, nickname, socket.id, avatar, element);

        if (result.error) {
            socket.emit('elemental:join-error', { message: result.error });
            return;
        }

        socket.join(`elemental:${pin}`);
        socket.data.elementalPin = pin;
        socket.data.elementalNickname = nickname;

        socket.emit('elemental:joined', {
            gamePin: pin,
            players: elementalManager.getPlayers(pin),
            player: result.player
        });

        io.to(`elemental-host:${pin}`).emit('elemental:player-joined', {
            player: result.player
        });

        io.to(`elemental:${pin}`).emit('elemental:lobby-update', {
            players: elementalManager.getPlayers(pin)
        });

        console.log(`${nickname} si è unito a Elemental Clash ${pin}`);
    });

    socket.on('elemental:host-start', ({ pin }) => {
        const result = elementalManager.startGame(pin);
        if (result.error) {
            socket.emit('elemental:error', { message: result.error });
            return;
        }

        io.to(`elemental:${pin}`).emit('elemental:game-started');

        // Start first round after a delay
        setTimeout(() => {
            startElementalRound(pin);
        }, 2000);
    });

    socket.on('elemental:player-action', ({ pin, action }) => {
        const result = elementalManager.submitAction(pin, socket.id, action);

        if (result.error) {
            socket.emit('elemental:action-error', { message: result.error });
            return;
        }

        socket.emit('elemental:action-confirmed');

        // Check if all actions received
        if (result.allActionsReceived) {
            resolveElementalRound(pin);
        }
    });

    socket.on('elemental:vote-exit', ({ pin, vote }) => {
        const result = elementalManager.voteExit(pin, socket.id, vote);
        if (!result) return;

        // Notify all players of the update
        io.to(`elemental:${pin}`).emit('elemental:exit-update', {
            votedCount: result.votedCount,
            totalPlayers: result.totalPlayers
        });

        // If all voted, end the game
        if (result.allVoted) {
            io.to(`elemental:${pin}`).emit('elemental:ended-by-players');
            io.to(`elemental-host:${pin}`).emit('elemental:ended-by-players');
            elementalManager.deleteGame(pin);
            console.log(`Elemental Clash ${pin} terminato dai giocatori`);
        }
    });

    socket.on('elemental:minigame-answer', ({ pin, answer }) => {
        const result = elementalManager.submitMiniGameAnswer(pin, socket.id, answer);

        if (result.error) {
            socket.emit('elemental:minigame-error', { message: result.error });
            return;
        }

        // Handle turbo_runner tap progress separately
        if (result.tapCount !== undefined) {
            // Send tap progress back to player
            socket.emit('elemental:tap-progress', {
                tapCount: result.tapCount,
                finished: result.finished
            });

            // Broadcast tap progress to host for racing animation
            const game = elementalManager.getGame(pin);
            const player = game?.players.get(socket.id);
            if (player) {
                io.to(`elemental-host:${pin}`).emit('elemental:runner-progress', {
                    socketId: socket.id,
                    nickname: player.nickname,
                    avatar: player.avatar,
                    tapCount: result.tapCount,
                    finished: result.finished
                });
            }
        } else if (result.round !== undefined) {
            // Handle quick_opposites round answer
            socket.emit('elemental:opposites-answer', {
                round: result.round,
                isCorrect: result.isCorrect,
                finished: result.finished
            });

            // Broadcast to host
            const game = elementalManager.getGame(pin);
            const player = game?.players.get(socket.id);
            if (player) {
                io.to(`elemental-host:${pin}`).emit('elemental:opposites-progress', {
                    socketId: socket.id,
                    nickname: player.nickname,
                    round: result.round,
                    isCorrect: result.isCorrect,
                    finished: result.finished
                });
            }
        } else {
            socket.emit('elemental:minigame-confirmed');
        }

        // Check if all answers received
        if (result.allAnswered) {
            resolveElementalMiniGame(pin);
        }
    });

    // === MICRO RACERS EVENTS ===

    socket.on('racers:host-create', () => {
        const { pin, track } = racersManager.createGame(socket.id);
        socket.join(`racers-host:${pin}`);
        socket.emit('racers:created', { pin, track });
        console.log(`Micro Racers creato: PIN ${pin}`);
    });

    socket.on('racers:player-join', ({ pin, nickname }) => {
        const result = racersManager.joinGame(pin, nickname, socket.id);

        if (result.error) {
            socket.emit('racers:join-error', { message: result.error });
            return;
        }

        socket.join(`racers:${pin}`);
        socket.data.racersPin = pin;
        socket.data.racersNickname = nickname;

        socket.emit('racers:joined', {
            gamePin: pin,
            players: racersManager.getPlayers(pin),
            player: result.player,
            track: result.track
        });

        io.to(`racers-host:${pin}`).emit('racers:player-joined', {
            player: result.player
        });

        io.to(`racers:${pin}`).emit('racers:lobby-update', {
            players: racersManager.getPlayers(pin)
        });
        io.to(`racers-host:${pin}`).emit('racers:lobby-update', {
            players: racersManager.getPlayers(pin)
        });

        // Start/reset lobby countdown timer
        startRacersLobbyTimer(pin);

        console.log(`${nickname} si è unito a Micro Racers ${pin}`);
    });

    socket.on('racers:host-start', ({ pin }) => {
        stopRacersLobbyTimer(pin);

        const result = racersManager.startCountdown(pin);
        if (result.error) {
            socket.emit('racers:error', { message: result.error });
            return;
        }

        // Start countdown
        let countdown = 3;
        io.to(`racers:${pin}`).emit('racers:countdown', { count: countdown });
        io.to(`racers-host:${pin}`).emit('racers:countdown', { count: countdown });

        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                io.to(`racers:${pin}`).emit('racers:countdown', { count: countdown });
                io.to(`racers-host:${pin}`).emit('racers:countdown', { count: countdown });
            } else {
                clearInterval(countdownInterval);
                io.to(`racers:${pin}`).emit('racers:go');
                io.to(`racers-host:${pin}`).emit('racers:go');

                // Start the race
                racersManager.startRace(pin);

                // Start game loop
                startRacersGameLoop(pin);
            }
        }, 1000);
    });

    socket.on('racers:player-input', ({ pin, input }) => {
        racersManager.updatePlayerInput(pin, socket.id, input);
    });

    socket.on('racers:use-powerup', ({ pin }) => {
        const result = racersManager.usePowerup(pin, socket.id);
        if (result) {
            // Notify all players of powerup use
            io.to(`racers:${pin}`).emit('racers:powerup-used', result);
            io.to(`racers-host:${pin}`).emit('racers:powerup-used', result);
        }
    });

    // === TOWER DEFENSE EVENTS ===

    socket.on('tower:host-create', () => {
        const { pin } = towerManager.createGame(socket.id);
        socket.join(`tower-host:${pin}`);
        socket.emit('tower:created', { pin });
        console.log(`Tower Defense creato: PIN ${pin}`);
    });

    socket.on('tower:player-join', ({ pin, nickname, avatar }) => {
        const result = towerManager.joinGame(pin, nickname, socket.id, avatar);

        if (result.error) {
            socket.emit('tower:join-error', { message: result.error });
            return;
        }

        socket.join(`tower:${pin}`);
        socket.data.towerPin = pin;
        socket.data.towerNickname = nickname;

        socket.emit('tower:joined', {
            gamePin: pin,
            players: towerManager.getPlayersArray(pin),
            player: result.player
        });

        io.to(`tower-host:${pin}`).emit('tower:player-joined', {
            player: result.player,
            players: towerManager.getPlayersArray(pin)
        });

        io.to(`tower:${pin}`).emit('tower:lobby-update', {
            players: towerManager.getPlayersArray(pin)
        });

        console.log(`${nickname} si è unito a Tower Defense ${pin}`);
    });

    socket.on('tower:host-start', ({ pin }) => {
        const result = towerManager.startGame(pin);
        if (result.error) {
            socket.emit('tower:error', { message: result.error });
            return;
        }

        io.to(`tower:${pin}`).emit('tower:game-started', {
            map: result.map,
            players: result.players
        });

        io.to(`tower-host:${pin}`).emit('tower:game-started', {
            map: result.map,
            players: result.players
        });

        // Send building phase start
        io.to(`tower:${pin}`).emit('tower:building-phase', { waveNumber: 0 });
        io.to(`tower-host:${pin}`).emit('tower:building-phase', { waveNumber: 0 });

        console.log(`Tower Defense ${pin} avviato`);
    });

    socket.on('tower:build-tower', ({ pin, slotId, towerType }) => {
        const result = towerManager.placeTower(pin, socket.id, slotId, towerType);

        if (result.error) {
            socket.emit('tower:build-error', { message: result.error });
            return;
        }

        // Get the slot
        const game = towerManager.getGame(pin);
        const slot = game?.map.towerSlots.find(s => s.id === slotId);

        // Notify player of success
        socket.emit('tower:tower-placed', {
            tower: result.tower,
            player: result.player,
            slot: { id: slotId }
        });

        // Notify host
        io.to(`tower-host:${pin}`).emit('tower:tower-placed', {
            tower: result.tower,
            player: result.player
        });

        // Update game state for host
        io.to(`tower-host:${pin}`).emit('tower:game-state', towerManager.getGameStateForBroadcast(pin));
    });

    socket.on('tower:upgrade-tower', ({ pin, slotId }) => {
        const result = towerManager.upgradeTower(pin, socket.id, slotId);

        if (result.error) {
            socket.emit('tower:build-error', { message: result.error });
            return;
        }

        socket.emit('tower:tower-upgraded', {
            tower: result.tower,
            player: result.player,
            slot: { id: slotId }
        });

        io.to(`tower-host:${pin}`).emit('tower:game-state', towerManager.getGameStateForBroadcast(pin));
    });

    socket.on('tower:sell-tower', ({ pin, slotId }) => {
        const result = towerManager.sellTower(pin, socket.id, slotId);

        if (result.error) {
            socket.emit('tower:build-error', { message: result.error });
            return;
        }

        socket.emit('tower:tower-sold', {
            slotId: result.slotId,
            player: result.player,
            refund: result.refund
        });

        io.to(`tower-host:${pin}`).emit('tower:game-state', towerManager.getGameStateForBroadcast(pin));
    });

    socket.on('tower:vote-ready', ({ pin }) => {
        const result = towerManager.voteReady(pin, socket.id);

        if (result.error) {
            return;
        }

        io.to(`tower:${pin}`).emit('tower:ready-update', {
            readyCount: result.readyCount,
            totalPlayers: result.totalPlayers
        });

        io.to(`tower-host:${pin}`).emit('tower:ready-update', {
            readyCount: result.readyCount,
            totalPlayers: result.totalPlayers
        });

        // If all ready, start wave
        if (result.allReady) {
            startTowerWave(pin);
        }
    });

    socket.on('tower:unvote-ready', ({ pin }) => {
        const result = towerManager.unvoteReady(pin, socket.id);

        if (result.error) {
            return;
        }

        io.to(`tower:${pin}`).emit('tower:ready-update', {
            readyCount: result.readyCount,
            totalPlayers: result.totalPlayers
        });

        io.to(`tower-host:${pin}`).emit('tower:ready-update', {
            readyCount: result.readyCount,
            totalPlayers: result.totalPlayers
        });
    });

    // === MAZE GAME EVENTS ===

    socket.on('maze:host-create', () => {
        const { pin } = mazeManager.createGame(socket.id);
        socket.join(`maze:${pin}`);
        socket.join(`maze-host:${pin}`);
        socket.emit('maze:created', { pin });
        console.log(`Labirinto Invisibile creato: PIN ${pin}`);
    });

    socket.on('maze:join-team', ({ pin, playerName, teamName, role }) => {
        const result = mazeManager.joinTeam(pin, playerName, teamName, role, socket.id);

        if (result.error) {
            socket.emit('maze:join-error', { message: result.error });
            return;
        }

        socket.join(`maze:${pin}`);
        socket.data.mazePin = pin;
        socket.data.mazeTeamId = result.team.id;
        socket.data.mazeRole = role;

        socket.emit('maze:joined', {
            team: result.team,
            role
        });

        // Notify host
        io.to(`maze-host:${pin}`).emit('maze:team-joined', {
            team: result.team,
            teams: mazeManager.getTeamsArray(pin)
        });

        // If teammate exists, notify them
        if (result.teammate) {
            io.to(result.teammate.socketId).emit('maze:team-updated', {
                team: result.team
            });
        }

        // Broadcast teams update
        io.to(`maze-host:${pin}`).emit('maze:team-updated', {
            teams: mazeManager.getTeamsArray(pin)
        });

        console.log(`${playerName} si è unito al labirinto ${pin} come ${role} nella squadra ${teamName}`);
    });

    socket.on('maze:host-start', ({ pin }) => {
        const result = mazeManager.startGame(pin);

        if (result.error) {
            socket.emit('maze:error', { message: result.error });
            return;
        }

        // Notify host with full maze data
        io.to(`maze-host:${pin}`).emit('maze:game-starting', {
            maze: result.maze,
            traps: result.traps,
            teams: result.teams,
            startPosition: result.startPosition,
            endPosition: result.endPosition,
            width: result.width,
            height: result.height
        });

        // Notify each player with their role
        const game = mazeManager.getGame(pin);
        for (const team of game.teams.values()) {
            if (team.navigator) {
                io.to(team.navigator.socketId).emit('maze:game-starting', { role: 'navigator' });
            }
            if (team.pilot) {
                io.to(team.pilot.socketId).emit('maze:game-starting', { role: 'pilot' });
            }
        }

        console.log(`Labirinto ${pin} in avvio...`);
    });

    socket.on('maze:countdown-done', ({ pin }) => {
        const result = mazeManager.startPlaying(pin);

        if (result.error) return;

        // Notify host
        io.to(`maze-host:${pin}`).emit('maze:game-started');

        // Notify all players
        const game = mazeManager.getGame(pin);
        for (const team of game.teams.values()) {
            if (team.navigator) {
                io.to(team.navigator.socketId).emit('maze:game-started', { role: 'navigator' });
            }
            if (team.pilot) {
                io.to(team.pilot.socketId).emit('maze:game-started', { role: 'pilot' });
            }
        }

        // Start moving walls timer
        startMazeWallsTimer(pin);

        console.log(`Labirinto ${pin} iniziato!`);
    });

    socket.on('maze:move', ({ pin, direction }) => {
        const result = mazeManager.movePlayer(pin, socket.id, direction);

        if (!result || result.error) return;

        if (result.collision) {
            socket.emit('maze:wall-collision');
            return;
        }

        if (result.slowed) return;

        if (result.trap) {
            socket.emit('maze:trap-triggered', { trapType: result.trap.type });

            io.to(`maze-host:${pin}`).emit('maze:trap-triggered', {
                teamId: result.teamId,
                trapType: result.trap.type,
                newPosition: result.trap.newPosition
            });
        }

        // Broadcast position update
        io.to(`maze-host:${pin}`).emit('maze:player-moved', {
            teamId: result.teamId,
            position: result.position
        });

        // Check for winner
        if (result.winner) {
            const game = mazeManager.getGame(pin);
            const winnerTeam = game.teams.get(result.teamId);

            // Stop walls timer
            stopMazeWallsTimer(pin);

            io.to(`maze-host:${pin}`).emit('maze:game-won', {
                winner: {
                    name: winnerTeam.name,
                    color: winnerTeam.color,
                    navigator: winnerTeam.navigator?.name,
                    pilot: winnerTeam.pilot?.name,
                    time: result.time
                }
            });

            // Notify all players
            for (const team of game.teams.values()) {
                const isWinner = team.id === result.teamId;

                if (team.navigator) {
                    io.to(team.navigator.socketId).emit('maze:game-won', {
                        winner: { name: winnerTeam.name },
                        isMyTeam: isWinner,
                        time: result.time
                    });
                }
                if (team.pilot) {
                    io.to(team.pilot.socketId).emit('maze:game-won', {
                        winner: { name: winnerTeam.name },
                        isMyTeam: isWinner,
                        time: result.time
                    });
                }
            }

            console.log(`Labirinto ${pin}: ${winnerTeam.name} ha vinto!`);
        }
    });

    // === ASSO CHE FUGGE (CUCÙ) EVENTS ===

    socket.on('asso:create-game', () => {
        const { pin } = assoManager.createGame(socket.id);
        socket.join(`asso-host:${pin}`);
        socket.emit('asso:game-created', { pin });
        console.log(`[CUCÙ] Partita creata: PIN ${pin}`);
    });

    socket.on('asso:join-game', ({ pin, nickname }) => {
        const result = assoManager.joinGame(pin, socket.id, nickname);

        if (result.error) {
            socket.emit('asso:join-error', { message: result.error });
            return;
        }

        socket.join(`asso-game:${pin}`);
        socket.data.assoPin = pin;
        socket.data.assoNickname = nickname;

        socket.emit('asso:joined', {
            player: result.player,
            players: result.players
        });

        // Notify host
        io.to(`asso-host:${pin}`).emit('asso:player-joined', {
            players: result.players
        });

        // Start/reset lobby countdown (50 seconds)
        const game = assoManager.getGame(pin);
        if (game && game.state === 'lobby') {
            assoManager.startLobbyCountdown(
                pin,
                // onTick - broadcast countdown to everyone
                (countdown) => {
                    io.to(`asso-host:${pin}`).emit('asso:lobby-countdown', { countdown });
                    io.to(`asso-game:${pin}`).emit('asso:lobby-countdown', { countdown });
                },
                // onComplete - auto-start game
                () => {
                    console.log(`[CUCÙ] Countdown terminato, avvio automatico partita ${pin}`);
                    const startResult = assoManager.startGame(pin);
                    if (!startResult.error) {
                        io.to(`asso-host:${pin}`).emit('asso:game-starting');
                        io.to(`asso-game:${pin}`).emit('asso:game-starting');

                        // Countdown 3-2-1 poi inizia il round
                        let count = 3;
                        const countdownInterval = setInterval(() => {
                            io.to(`asso-host:${pin}`).emit('asso:countdown', { count });
                            io.to(`asso-game:${pin}`).emit('asso:countdown', { count });
                            count--;
                            if (count < 0) {
                                clearInterval(countdownInterval);
                                startCucuRound(pin);
                            }
                        }, 1000);
                    }
                }
            );

            // Send initial countdown value to the new player
            socket.emit('asso:lobby-countdown', { countdown: assoManager.LOBBY_COUNTDOWN_SECONDS });
        }

        console.log(`[CUCÙ] ${nickname} si è unito alla partita ${pin}`);
    });

    socket.on('asso:start-game', ({ pin }) => {
        // Stop lobby countdown if running
        assoManager.stopLobbyCountdown(pin);

        const result = assoManager.startGame(pin);

        if (result.error) {
            socket.emit('asso:error', { message: result.error });
            return;
        }

        io.to(`asso-host:${pin}`).emit('asso:game-starting');
        io.to(`asso-game:${pin}`).emit('asso:game-starting');

        // Countdown poi inizia il primo round
        let count = 3;
        const countdownInterval = setInterval(() => {
            io.to(`asso-host:${pin}`).emit('asso:countdown', { count });
            io.to(`asso-game:${pin}`).emit('asso:countdown', { count });

            count--;
            if (count < 0) {
                clearInterval(countdownInterval);
                startCucuRound(pin);
            }
        }, 1000);
    });

    // Giocatore guarda la propria carta (tieni premuto)
    socket.on('asso:peek-card', ({ pin }) => {
        const result = assoManager.playerPeekedCard(pin, socket.id);

        if (result && result.revealed) {
            // Re o Cavallo: notifica tutti
            io.to(`asso-host:${pin}`).emit('asso:card-revealed', {
                socketId: result.socketId,
                nickname: result.nickname,
                card: result.card
            });
            io.to(`asso-game:${pin}`).emit('asso:card-revealed', {
                socketId: result.socketId,
                nickname: result.nickname,
                card: result.card
            });
        }
    });

    // Giocatore bussa (tiene la carta)
    socket.on('asso:knock', ({ pin }) => {
        const result = assoManager.playerKnock(pin, socket.id);

        if (result.error) {
            socket.emit('asso:action-error', { message: result.error });
            return;
        }

        const game = assoManager.getGame(pin);
        const player = game?.players.get(socket.id);

        // Notifica tutti dell'azione
        io.to(`asso-host:${pin}`).emit('asso:player-knocked', {
            socketId: socket.id,
            nickname: player?.nickname,
            players: result.players
        });
        io.to(`asso-game:${pin}`).emit('asso:player-knocked', {
            socketId: socket.id,
            nickname: player?.nickname
        });

        // Se round completo, rivela le carte
        if (result.roundComplete) {
            endCucuRound(pin);
        } else {
            // Notifica il prossimo giocatore
            notifyNextCucuPlayer(pin, result);
        }
    });

    // Giocatore passa (scambia carta)
    socket.on('asso:pass', ({ pin }) => {
        const result = assoManager.playerPass(pin, socket.id);

        if (result.error) {
            socket.emit('asso:action-error', { message: result.error });
            return;
        }

        const game = assoManager.getGame(pin);
        const player = game?.players.get(socket.id);

        if (result.action === 'blocked') {
            // Bloccato dal Re
            io.to(`asso-host:${pin}`).emit('asso:pass-blocked', {
                socketId: socket.id,
                nickname: player?.nickname,
                blockedBy: result.blockedBy,
                skipped: result.skipped,
                players: result.players
            });
            io.to(`asso-game:${pin}`).emit('asso:pass-blocked', {
                socketId: socket.id,
                nickname: player?.nickname,
                blockedBy: result.blockedBy
            });
        } else if (result.action === 'passed') {
            // Scambio riuscito - invia le nuove carte ai giocatori coinvolti
            const newPlayerCard = assoManager.getPlayerCard(pin, socket.id);
            const newTargetCard = assoManager.getPlayerCard(pin, result.target.socketId);

            // Notifica chi ha passato
            socket.emit('asso:card-changed', { card: newPlayerCard });

            // Notifica chi ha ricevuto
            io.to(result.target.socketId).emit('asso:card-changed', { card: newTargetCard });

            // Notifica host e tutti
            io.to(`asso-host:${pin}`).emit('asso:cards-swapped', {
                from: { socketId: socket.id, nickname: player?.nickname },
                to: result.target,
                skipped: result.skipped,
                players: result.players
            });
            io.to(`asso-game:${pin}`).emit('asso:cards-swapped', {
                from: { socketId: socket.id, nickname: player?.nickname },
                to: result.target,
                skipped: result.skipped
            });
        }

        // Se round completo, rivela le carte
        if (result.roundComplete) {
            endCucuRound(pin);
        } else {
            notifyNextCucuPlayer(pin, result);
        }
    });

    // Mazziere pesca dal mazzo
    socket.on('asso:draw', ({ pin }) => {
        const result = assoManager.dealerDraw(pin, socket.id);

        if (result.error) {
            socket.emit('asso:action-error', { message: result.error });
            return;
        }

        const game = assoManager.getGame(pin);
        const player = game?.players.get(socket.id);

        // Invia la nuova carta al mazziere
        socket.emit('asso:card-changed', { card: result.drawnCard });

        // Notifica tutti
        io.to(`asso-host:${pin}`).emit('asso:dealer-drew', {
            socketId: socket.id,
            nickname: player?.nickname,
            drewSpecial: result.drawnCard.isRe || result.drawnCard.isCavallo,
            card: (result.drawnCard.isRe || result.drawnCard.isCavallo) ? result.drawnCard : null,
            players: result.players
        });
        io.to(`asso-game:${pin}`).emit('asso:dealer-drew', {
            socketId: socket.id,
            nickname: player?.nickname
        });

        // Round completo dopo che il mazziere ha agito
        if (result.roundComplete) {
            endCucuRound(pin);
        }
    });

    // Host richiede di iniziare il prossimo round
    socket.on('asso:next-round', ({ pin }) => {
        const gameOver = assoManager.checkGameOver(pin);

        if (gameOver.gameOver) {
            io.to(`asso-host:${pin}`).emit('asso:game-over', {
                winner: gameOver.winner,
                standings: gameOver.finalStandings
            });
            io.to(`asso-game:${pin}`).emit('asso:game-over', {
                winner: gameOver.winner,
                standings: gameOver.finalStandings
            });
        } else {
            startCucuRound(pin);
        }
    });

    // === DISCONNECT ===

    socket.on('disconnect', () => {
        // Handle Quiz game disconnect
        const result = gameManager.leaveGame(socket.id);
        if (result) {
            if (result.isHost) {
                io.to(`game:${result.pin}`).emit('game:host-left');
            } else if (!result.gracePeriod) {
                // Solo notifica se NON siamo in grace period (lobby)
                io.to(`host:${result.pin}`).emit('game:player-left', {
                    player: result.player
                });
                io.to(`game:${result.pin}`).emit('lobby:update', {
                    players: gameManager.getPlayers(result.pin)
                });
            }
            // Se gracePeriod=true, il giocatore e' ancora nel gioco
            // e puo' riconnettersi senza problemi
        }

        // Handle Elemental Clash disconnect
        const elementalResult = elementalManager.leaveGame(socket.id);
        if (elementalResult) {
            if (elementalResult.isHost) {
                io.to(`elemental:${elementalResult.pin}`).emit('elemental:host-left');
            } else {
                io.to(`elemental-host:${elementalResult.pin}`).emit('elemental:player-left', {
                    player: elementalResult.player
                });
                io.to(`elemental:${elementalResult.pin}`).emit('elemental:lobby-update', {
                    players: elementalManager.getPlayers(elementalResult.pin)
                });
            }
        }

        // Handle Micro Racers disconnect
        const racersResult = racersManager.leaveGame(socket.id);
        if (racersResult) {
            if (racersResult.isHost) {
                io.to(`racers:${racersResult.pin}`).emit('racers:host-left');
                // Stop timers and game loop
                stopRacersLobbyTimer(racersResult.pin);
                stopRacersGameLoop(racersResult.pin);
            } else {
                io.to(`racers-host:${racersResult.pin}`).emit('racers:player-left', {
                    player: racersResult.player
                });
                io.to(`racers:${racersResult.pin}`).emit('racers:lobby-update', {
                    players: racersManager.getPlayers(racersResult.pin)
                });
                io.to(`racers-host:${racersResult.pin}`).emit('racers:lobby-update', {
                    players: racersManager.getPlayers(racersResult.pin)
                });

                // Stop lobby timer if no players left
                const remainingPlayers = racersManager.getPlayers(racersResult.pin);
                if (remainingPlayers.length === 0) {
                    stopRacersLobbyTimer(racersResult.pin);
                }
            }
        }

        // Handle Tower Defense disconnect
        const towerResult = towerManager.leaveGame(socket.id);
        if (towerResult) {
            if (towerResult.isHost) {
                io.to(`tower:${towerResult.pin}`).emit('tower:host-left');
                // Stop game loop
                stopTowerGameLoop(towerResult.pin);
                towerManager.deleteGame(towerResult.pin);
            } else {
                io.to(`tower-host:${towerResult.pin}`).emit('tower:player-left', {
                    player: towerResult.player
                });
                io.to(`tower:${towerResult.pin}`).emit('tower:lobby-update', {
                    players: towerManager.getPlayersArray(towerResult.pin)
                });
            }
        }

        // Handle Maze game disconnect
        const mazeResult = mazeManager.leaveGame(socket.id);
        if (mazeResult) {
            if (mazeResult.isHost) {
                io.to(`maze:${mazeResult.pin}`).emit('maze:host-left');
                stopMazeWallsTimer(mazeResult.pin);
                mazeManager.deleteGame(mazeResult.pin);
            } else {
                io.to(`maze-host:${mazeResult.pin}`).emit('maze:player-left', {
                    teams: mazeManager.getTeamsArray(mazeResult.pin)
                });
            }
        }

        // Handle Asso che Fugge disconnect
        const assoResult = assoManager.handleDisconnect(socket.id);
        if (assoResult) {
            if (assoResult.type === 'host') {
                io.to(`asso-game:${assoResult.pin}`).emit('asso:host-disconnected');
                const timerId = assoRoundTimers.get(assoResult.pin);
                if (timerId) {
                    clearTimeout(timerId);
                    assoRoundTimers.delete(assoResult.pin);
                }
            } else {
                io.to(`asso-host:${assoResult.pin}`).emit('asso:player-left', {
                    players: assoResult.players
                });
            }
        }

        console.log(`Client disconnesso: ${socket.id}`);
        logger.general.clientDisconnected(socket.id, {
            quiz: result ? result.pin : null,
            elemental: elementalResult ? elementalResult.pin : null,
            racers: racersResult ? racersResult.pin : null,
            tower: towerResult ? towerResult.pin : null,
            maze: mazeResult ? mazeResult.pin : null,
            asso: assoResult ? assoResult.pin : null
        });
    });
});

// Helper functions
const countdownStarted = new Map(); // pin -> boolean

function broadcastPowerSelectionStatus(pin) {
    const status = gameManager.getPowerSelectionStatus(pin);
    const game = gameManager.getGame(pin);
    if (!game) return;

    // Controlla se è l'ultima domanda
    const isLastQuestion = game.currentQuestionIndex >= 9;

    // LOG: Debug power selection status
    logger.quiz.error(pin, 'POWER_SELECT_DEBUG', 'Status selezione poteri', {
        ready: status.ready,
        total: status.total,
        allReady: status.allReady,
        isLastQuestion,
        countdownStarted: countdownStarted.get(pin) || false,
        currentQuestionIndex: game.currentQuestionIndex
    });

    // Invia a tutti (host e giocatori)
    io.to(`host:${pin}`).emit('game:power-selection-update', status);
    for (const [socketId] of game.players) {
        io.to(socketId).emit('game:power-selection-update', status);
    }

    // Se tutti hanno scelto, avvia countdown di 3 secondi
    // Usa un flag per evitare timer multipli
    if (status.allReady && !countdownStarted.get(pin)) {
        countdownStarted.set(pin, true);

        io.to(`host:${pin}`).emit('game:all-powers-selected');
        for (const [socketId] of game.players) {
            io.to(socketId).emit('game:all-powers-selected');
        }

        // Dopo 3 secondi, prossima domanda o fine partita
        setTimeout(() => {
            countdownStarted.set(pin, false);

            if (isLastQuestion) {
                // Ultima domanda: controlla se ci sono sfide pendenti
                if (gameManager.hasPendingChallenges(pin)) {
                    logger.quiz.error(pin, 'POWER_SELECT', 'Ultima domanda - avvio sfide');
                    startNextChallenge(pin);
                } else {
                    // Nessuna sfida, mostra classifica finale
                    logger.quiz.error(pin, 'POWER_SELECT', 'Ultima domanda - fine partita');
                    const finalResults = gameManager.endGame(pin);
                    if (finalResults) {
                        io.to(`host:${pin}`).emit('game:final-results', { rankings: finalResults.rankings });
                        sendFinalToPlayers(pin, finalResults.rankings);
                    }
                }
            } else {
                // Non ultima domanda: prossima domanda
                const result = gameManager.nextQuestion(pin);
                if (result && !result.finished) {
                    sendQuestion(pin, result);
                }
            }
        }, 3000);
    }
}

function sendQuestion(pin, question) {
    // Resetta le selezioni poteri per il prossimo turno
    gameManager.resetPowerSelections(pin);

    // Invia all'host
    io.to(`host:${pin}`).emit('game:question', question);

    // Invia ai giocatori (con info abilità e shuffle)
    const game = gameManager.getGame(pin);
    if (!game) return;

    for (const [socketId, player] of game.players) {
        io.to(socketId).emit('game:question', {
            ...question,
            abilities: player.abilities,
            isShuffled: game.shuffledPlayers.has(socketId),
            isObfuscated: game.obfuscatedPlayers.has(socketId)
        });
    }

    // Timer per fine domanda - salva l'ID per poterlo cancellare
    const timerId = setTimeout(() => {
        showTurnResults(pin);
    }, question.timeLimit + 500);

    gameManager.setQuestionTimer(pin, timerId);
}

function showTurnResults(pin) {
    // Verifica se possiamo mostrare i risultati (evita chiamate doppie)
    if (!gameManager.canShowResults(pin)) {
        return;
    }

    // Cancella il timer della domanda
    gameManager.clearQuestionTimer(pin);

    const results = gameManager.calculateTurnResults(pin);
    if (!results) return;

    // Invia all'host
    io.to(`host:${pin}`).emit('game:question-results', results);

    // Invia risultato personale a ogni giocatore
    for (const playerResult of results.results) {
        const game = gameManager.getGame(pin);
        const player = game?.players.get(playerResult.socketId);

        io.to(playerResult.socketId).emit('game:your-result', {
            correct: playerResult.correct,
            correctAnswer: results.correctAnswer,
            points: playerResult.points,
            totalScore: playerResult.totalScore,
            wasBlocked: playerResult.wasBlocked,
            abilities: player?.abilities,
            hasChallenges: results.hasChallenges
        });
    }

    // Controlla se ci sono sfide pendenti
    if (results.hasChallenges) {
        // Avvia le sfide dopo un delay
        setTimeout(() => {
            startNextChallenge(pin);
        }, 4000);
    } else if (results.isLastQuestion) {
        // Se è l'ultima domanda e non ci sono sfide, mostra classifica finale
        setTimeout(() => {
            const finalResults = gameManager.endGame(pin);
            io.to(`host:${pin}`).emit('game:final-results', { rankings: finalResults.rankings });
            sendFinalToPlayers(pin, finalResults.rankings);
        }, 4000);
    }
}

function startNextChallenge(pin) {
    const challenge = gameManager.getNextChallenge(pin);
    if (!challenge) {
        // Nessuna altra sfida, procedi con la prossima domanda o fine partita
        proceedAfterChallenges(pin);
        return;
    }

    // Notifica l'host della sfida
    io.to(`host:${pin}`).emit('challenge:start', {
        challenger: challenge.challenger,
        target: challenge.target,
        question: challenge.question,
        timeLimit: challenge.timeLimit,
        remainingChallenges: challenge.remainingChallenges
    });

    // Notifica i due sfidanti
    io.to(challenge.challengerSocketId).emit('challenge:your-turn', {
        opponent: challenge.target,
        question: challenge.question,
        timeLimit: challenge.timeLimit,
        isChallenger: true
    });

    io.to(challenge.targetSocketId).emit('challenge:your-turn', {
        opponent: challenge.challenger,
        question: challenge.question,
        timeLimit: challenge.timeLimit,
        isChallenger: false
    });

    // Notifica gli altri giocatori che stanno guardando
    const game = gameManager.getGame(pin);
    for (const [socketId, player] of game.players) {
        if (socketId !== challenge.challengerSocketId && socketId !== challenge.targetSocketId) {
            io.to(socketId).emit('challenge:watching', {
                challenger: challenge.challenger,
                target: challenge.target
            });
        }
    }

    // Reset flag per nuova sfida
    gameManager.resetChallengeResultsFlag(pin);

    // Timer per fine sfida - salva l'ID per poterlo cancellare
    const timerId = setTimeout(() => {
        showChallengeResults(pin);
    }, challenge.timeLimit + 500);

    gameManager.setChallengeTimer(pin, timerId);
}

function showChallengeResults(pin) {
    // Verifica se possiamo mostrare i risultati (evita chiamate doppie)
    if (!gameManager.canShowChallengeResults(pin)) {
        return;
    }

    // Cancella il timer della sfida
    gameManager.clearChallengeTimer(pin);

    const result = gameManager.calculateChallengeResult(pin);
    if (!result) return;

    // Invia risultati all'host
    io.to(`host:${pin}`).emit('challenge:result', {
        challenger: result.challenger,
        target: result.target,
        correctAnswer: result.correctAnswer,
        winner: result.winner,
        loser: result.loser,
        isDraw: result.isDraw,
        hasMoreChallenges: result.hasMoreChallenges
    });

    // Invia risultati ai due sfidanti
    const game = gameManager.getGame(pin);

    if (result.challenger.socketId) {
        const challengerPlayer = game?.players.get(result.challenger.socketId);
        io.to(result.challenger.socketId).emit('challenge:your-result', {
            yourAnswer: result.challenger.answer,
            yourCorrect: result.challenger.correct,
            opponentAnswer: result.target.answer,
            opponentCorrect: result.target.correct,
            correctAnswer: result.correctAnswer,
            youWon: result.winnerSocketId === result.challenger.socketId,
            youLost: result.loserSocketId === result.challenger.socketId,
            isDraw: result.isDraw,
            newScore: challengerPlayer?.score || 0
        });
    }

    if (result.target.socketId) {
        const targetPlayer = game?.players.get(result.target.socketId);
        io.to(result.target.socketId).emit('challenge:your-result', {
            yourAnswer: result.target.answer,
            yourCorrect: result.target.correct,
            opponentAnswer: result.challenger.answer,
            opponentCorrect: result.challenger.correct,
            correctAnswer: result.correctAnswer,
            youWon: result.winnerSocketId === result.target.socketId,
            youLost: result.loserSocketId === result.target.socketId,
            isDraw: result.isDraw,
            newScore: targetPlayer?.score || 0
        });
    }

    // Notifica gli spettatori
    for (const [socketId, player] of game.players) {
        if (socketId !== result.challenger.socketId && socketId !== result.target.socketId) {
            io.to(socketId).emit('challenge:spectator-result', {
                winner: result.winner,
                loser: result.loser,
                isDraw: result.isDraw
            });
        }
    }

    // Dopo un delay, procedi con la prossima sfida o continua il gioco
    setTimeout(() => {
        if (result.hasMoreChallenges) {
            startNextChallenge(pin);
        } else {
            proceedAfterChallenges(pin);
        }
    }, 4000);
}

function proceedAfterChallenges(pin) {
    const game = gameManager.getGame(pin);
    if (!game) return;

    // Controlla se è l'ultima domanda
    if (game.currentQuestionIndex >= 9) {
        const finalResults = gameManager.endGame(pin);
        io.to(`host:${pin}`).emit('game:final-results', { rankings: finalResults.rankings });
        sendFinalToPlayers(pin, finalResults.rankings);
    } else {
        // Notifica che le sfide sono finite e si può procedere
        io.to(`host:${pin}`).emit('challenges:complete');
        io.to(`game:${pin}`).emit('challenges:complete');

        // Auto-avanza alla prossima domanda dopo un breve delay
        setTimeout(() => {
            const question = gameManager.nextQuestion(pin);
            if (question && !question.finished) {
                sendQuestion(pin, question);
            }
        }, 2000);
    }
}

function sendFinalToPlayers(pin, rankings) {
    const game = gameManager.getGame(pin);
    if (!game) return;

    for (const [socketId, player] of game.players) {
        const rank = rankings.findIndex(r => r.odId === player.odId) + 1;
        io.to(socketId).emit('game:final', {
            yourRank: rank,
            yourScore: player.score,
            topThree: rankings.slice(0, 3)
        });
    }
}

// === ELEMENTAL CLASH HELPER FUNCTIONS ===

const elementalTurnTimers = new Map();
const elementalMiniGameTimers = new Map();

function startElementalRound(pin) {
    const game = elementalManager.getGame(pin);
    if (!game || game.status !== 'playing') {
        console.log(`Cannot start round for PIN ${pin}: game not found or not playing`);
        return;
    }

    console.log(`Starting Elemental round ${game.round} for PIN ${pin}`);

    // Every 3 rounds, shuffle positions
    if (game.round > 1 && game.round % 3 === 0) {
        const shuffleData = elementalManager.shufflePositions(pin);
        if (shuffleData) {
            console.log(`Shuffling positions for round ${game.round}`);

            // Send shuffle animation to host
            io.to(`elemental-host:${pin}`).emit('elemental:shuffle-positions', {
                round: game.round,
                shuffleData: shuffleData
            });

            // Notify each player of their new neighbors
            for (const [socketId, player] of game.players) {
                if (player.isAlive) {
                    const neighbors = elementalManager.getNeighbors(pin, socketId);
                    io.to(socketId).emit('elemental:positions-changed', {
                        neighbors: neighbors
                    });
                }
            }

            // Wait for animation before starting mini-game
            setTimeout(() => {
                startElementalMiniGame(pin);
            }, 3000);
            return;
        }
    }

    // Start with mini-game
    startElementalMiniGame(pin);
}

function startElementalMiniGame(pin) {
    const game = elementalManager.getGame(pin);
    if (!game) return;

    const miniGame = elementalManager.startMiniGame(pin);
    if (!miniGame) {
        console.log(`Failed to start mini-game for PIN ${pin}`);
        // Fall back to action phase
        startElementalActionPhase(pin);
        return;
    }

    console.log(`Mini-game started: ${miniGame.name} (${miniGame.type})`);

    // Send mini-game to host
    io.to(`elemental-host:${pin}`).emit('elemental:minigame-start', {
        round: game.round,
        miniGame: {
            type: miniGame.type,
            name: miniGame.name,
            description: miniGame.description,
            duration: miniGame.duration,
            showDirection: miniGame.showDirection,
            chaosTarget: miniGame.chaosTarget,
            boostedElement: miniGame.boostedElement,
            showElement: miniGame.showElement,
            visibleSymbols: miniGame.visibleSymbols,
            targetColor: miniGame.correctAnswer,
            goDelay: miniGame.goDelay,
            stroopButtons: miniGame.stroopButtons,
            correctSequence: miniGame.correctSequence,
            showDuration: miniGame.showDuration,
            targetTaps: miniGame.targetTaps,
            sequence: miniGame.sequence,
            roundTime: miniGame.roundTime,
            options: miniGame.options
        },
        players: elementalManager.getPlayers(pin).filter(p => p.isAlive)
    });

    // Send mini-game to each player
    for (const [socketId, player] of game.players) {
        if (player.isAlive) {
            io.to(socketId).emit('elemental:minigame-start', {
                round: game.round,
                miniGame: {
                    type: miniGame.type,
                    name: miniGame.name,
                    description: miniGame.description,
                    duration: miniGame.duration,
                    showDirection: miniGame.showDirection,
                    chaosTarget: miniGame.chaosTarget,
                    boostedElement: miniGame.boostedElement,
                    goDelay: miniGame.goDelay,
                    stroopButtons: miniGame.stroopButtons,
                    sequenceOptions: miniGame.sequenceOptions,
                    showDuration: miniGame.showDuration,
                    targetTaps: miniGame.targetTaps,
                    sequence: miniGame.sequence,
                    roundTime: miniGame.roundTime,
                    options: miniGame.options
                }
            });
        }
    }

    // Set timer for mini-game end
    const timerId = setTimeout(() => {
        resolveElementalMiniGame(pin);
    }, miniGame.duration + 500);

    elementalMiniGameTimers.set(pin, timerId);
}

function resolveElementalMiniGame(pin) {
    // Clear mini-game timer
    const timerId = elementalMiniGameTimers.get(pin);
    if (timerId) {
        clearTimeout(timerId);
        elementalMiniGameTimers.delete(pin);
    }

    const game = elementalManager.getGame(pin);
    if (!game) return;

    console.log(`Resolving mini-game for PIN ${pin}`);

    const results = elementalManager.resolveMiniGame(pin);
    if (!results) {
        console.log(`No mini-game results for PIN ${pin}`);
        startElementalActionPhase(pin);
        return;
    }

    console.log(`Mini-game results:`, JSON.stringify(results.rankings, null, 2));

    // Send results to host
    io.to(`elemental-host:${pin}`).emit('elemental:minigame-results', {
        miniGameType: results.miniGameType,
        miniGameName: results.miniGameName,
        correctAnswer: results.correctAnswer,
        rankings: results.rankings
    });

    // Send personal results to each player
    for (const ranking of results.rankings) {
        io.to(ranking.socketId).emit('elemental:minigame-your-result', {
            rank: ranking.rank,
            isCorrect: ranking.isCorrect,
            bonus: ranking.bonus
        });
    }

    // After showing results, start action phase
    setTimeout(() => {
        startElementalActionPhase(pin);
    }, 2500);
}

function startElementalActionPhase(pin) {
    const game = elementalManager.getGame(pin);
    if (!game || game.status !== 'playing') {
        console.log(`Cannot start action phase for PIN ${pin}: game not found or not playing`);
        return;
    }

    console.log(`Starting action phase for round ${game.round}, PIN ${pin}`);
    const turnTime = 10;

    // Apply focus and heal boosts from mini-game before the action phase
    for (const [socketId, player] of game.players) {
        if (player.isAlive) {
            const bonus = elementalManager.getTurnBonus(pin, socketId);
            if (bonus) {
                if (bonus.focusBoost) {
                    player.focus = Math.min(2, player.focus + bonus.focusBoost);
                    console.log(`Applied Focus boost to ${player.nickname}: +${bonus.focusBoost} focus (now ${player.focus})`);
                }
                if (bonus.healBoost) {
                    player.hp = Math.min(player.maxHp, player.hp + bonus.healBoost);
                    console.log(`Applied Heal boost to ${player.nickname}: +${bonus.healBoost} HP (now ${player.hp})`);
                }
                // Last place loses HP
                if (bonus.hpLoss) {
                    player.hp = Math.max(0, player.hp - bonus.hpLoss);
                    console.log(`Applied HP loss to ${player.nickname}: -${bonus.hpLoss} HP (now ${player.hp})`);
                }
                // Turbo Runner: winner deals 10 damage to left neighbor
                if (bonus.extraDamageLeft) {
                    const neighbors = elementalManager.getNeighbors(pin, socketId);
                    if (neighbors.left) {
                        const leftPlayer = game.players.get(neighbors.left.socketId);
                        if (leftPlayer && leftPlayer.isAlive) {
                            leftPlayer.hp = Math.max(0, leftPlayer.hp - bonus.extraDamageLeft);
                            console.log(`Turbo Runner: ${player.nickname} dealt ${bonus.extraDamageLeft} damage to ${leftPlayer.nickname} (now ${leftPlayer.hp} HP)`);

                            // Notify the damaged player
                            io.to(neighbors.left.socketId).emit('elemental:race-damage', {
                                damage: bonus.extraDamageLeft,
                                fromPlayer: player.nickname
                            });
                        }
                    }
                }

                // Quick Opposites: winner deals 10 damage to ALL other players
                if (bonus.damageToAll) {
                    for (const [otherSocketId, otherPlayer] of game.players) {
                        if (otherSocketId !== socketId && otherPlayer.isAlive) {
                            otherPlayer.hp = Math.max(0, otherPlayer.hp - bonus.damageToAll);
                            console.log(`Quick Opposites: ${player.nickname} dealt ${bonus.damageToAll} damage to ${otherPlayer.nickname} (now ${otherPlayer.hp} HP)`);

                            // Notify the damaged player
                            io.to(otherSocketId).emit('elemental:opposites-damage', {
                                damage: bonus.damageToAll,
                                fromPlayer: player.nickname
                            });
                        }
                    }
                }
            }
        }
    }

    // Send round start to host
    io.to(`elemental-host:${pin}`).emit('elemental:action-phase', {
        round: game.round,
        turnTime,
        players: elementalManager.getPlayersStatus(game)
    });

    // Send round start to each player with their state and bonuses
    for (const [socketId, player] of game.players) {
        if (player.isAlive) {
            const bonus = elementalManager.getTurnBonus(pin, socketId);
            io.to(socketId).emit('elemental:round-start', {
                round: game.round,
                turnTime,
                state: elementalManager.getPlayerState(pin, socketId),
                bonus
            });
        }
    }

    // Set timer for turn end
    const actionTimerId = setTimeout(() => {
        resolveElementalRound(pin);
    }, (turnTime + 1) * 1000);

    elementalTurnTimers.set(pin, actionTimerId);
}

function resolveElementalRound(pin) {
    // Clear turn timer
    const timerId = elementalTurnTimers.get(pin);
    if (timerId) {
        clearTimeout(timerId);
        elementalTurnTimers.delete(pin);
    }

    console.log(`Resolving Elemental round for PIN ${pin}`);

    const result = elementalManager.resolveRound(pin);
    if (!result) {
        console.log(`No result from resolveRound for PIN ${pin}`);
        return;
    }

    console.log(`Round ${result.round} resolved:`, JSON.stringify(result.results, null, 2));

    // Send results to host
    io.to(`elemental-host:${pin}`).emit('elemental:round-results', {
        round: result.round,
        actions: result.actions,
        results: result.results,
        eliminations: result.eliminations,
        players: result.players,
        gameOver: result.gameOver,
        winner: result.winner
    });

    // Send personal results to each player
    const game = elementalManager.getGame(pin);
    for (const [socketId, player] of game.players) {
        const personalResults = result.results.filter(r => r.player === player.nickname);
        const wasAttackedResults = result.results.filter(r =>
            r.attackers?.some(a => a.name !== player.nickname) && r.player === player.nickname
        );

        let damage = 0;
        let healed = 0;
        let blocked = false;
        let attackedBy = [];

        for (const res of personalResults) {
            if (res.type === 'damage') {
                damage += res.damage;
                attackedBy = res.attackers || [];
            } else if (res.type === 'blocked') {
                damage += res.damage;
                blocked = true;
                attackedBy = res.attackers || [];
            }
        }

        const eliminated = result.eliminations.some(e => e.player === player.nickname);

        io.to(socketId).emit('elemental:your-result', {
            damage,
            healed,
            blocked,
            attackedBy,
            eliminated
        });

        if (eliminated) {
            io.to(socketId).emit('elemental:eliminated', {
                playersRemaining: elementalManager.getAlivePlayers(game).length
            });
        }
    }

    // Check for game over
    if (result.gameOver) {
        console.log(`Game over for PIN ${pin}, winner: ${result.winner?.nickname || 'none'}`);
        setTimeout(() => {
            const finalResult = elementalManager.endGame(pin);
            io.to(`elemental-host:${pin}`).emit('elemental:game-ended', {
                rankings: finalResult.rankings
            });

            // Send to each player
            for (const [socketId, player] of game.players) {
                const yourRank = finalResult.rankings.findIndex(r => r.socketId === socketId) + 1;
                io.to(socketId).emit('elemental:game-ended', {
                    rankings: finalResult.rankings,
                    yourRank
                });
            }
        }, 3000);
    } else {
        // Start next round after delay
        console.log(`Starting next round for PIN ${pin} in 3 seconds...`);
        setTimeout(() => {
            console.log(`Starting round for PIN ${pin} now`);
            startElementalRound(pin);
        }, 3000);
    }
}

// === MICRO RACERS HELPER FUNCTIONS ===

const racersGameLoops = new Map(); // pin -> intervalId
const racersLobbyTimers = new Map(); // pin -> { intervalId, remaining }

function startRacersLobbyTimer(pin) {
    stopRacersLobbyTimer(pin);

    let remaining = 50;

    // Emit initial value
    io.to(`racers-host:${pin}`).emit('racers:lobby-timer', { remaining });
    io.to(`racers:${pin}`).emit('racers:lobby-timer', { remaining });

    const intervalId = setInterval(() => {
        remaining--;
        io.to(`racers-host:${pin}`).emit('racers:lobby-timer', { remaining });
        io.to(`racers:${pin}`).emit('racers:lobby-timer', { remaining });

        if (remaining <= 0) {
            stopRacersLobbyTimer(pin);

            // Auto-start the race
            const result = racersManager.startCountdown(pin);
            if (result.error) return;

            let countdown = 3;
            io.to(`racers:${pin}`).emit('racers:countdown', { count: countdown });
            io.to(`racers-host:${pin}`).emit('racers:countdown', { count: countdown });

            const countdownInterval = setInterval(() => {
                countdown--;
                if (countdown > 0) {
                    io.to(`racers:${pin}`).emit('racers:countdown', { count: countdown });
                    io.to(`racers-host:${pin}`).emit('racers:countdown', { count: countdown });
                } else {
                    clearInterval(countdownInterval);
                    io.to(`racers:${pin}`).emit('racers:go');
                    io.to(`racers-host:${pin}`).emit('racers:go');
                    racersManager.startRace(pin);
                    startRacersGameLoop(pin);
                }
            }, 1000);
        }
    }, 1000);

    racersLobbyTimers.set(pin, intervalId);
}

function stopRacersLobbyTimer(pin) {
    const intervalId = racersLobbyTimers.get(pin);
    if (intervalId) {
        clearInterval(intervalId);
        racersLobbyTimers.delete(pin);
    }
}

function startRacersGameLoop(pin) {
    // Run at ~30fps
    const intervalId = setInterval(() => {
        const state = racersManager.updateGameState(pin);

        if (!state) {
            stopRacersGameLoop(pin);
            return;
        }

        // Broadcast game state to all
        io.to(`racers-host:${pin}`).emit('racers:game-state', state);

        // Send personal state to each player
        const game = racersManager.getGame(pin);
        if (game) {
            for (const [socketId] of game.players) {
                const playerState = racersManager.getPlayerState(pin, socketId);
                if (playerState) {
                    io.to(socketId).emit('racers:player-state', playerState);
                }
            }
        }

        // Check if race is finished
        if (state.status === 'finished') {
            stopRacersGameLoop(pin);

            // Send final results
            const results = racersManager.getRaceResults(pin);
            io.to(`racers-host:${pin}`).emit('racers:race-finished', results);
            io.to(`racers:${pin}`).emit('racers:race-finished', results);

            console.log(`Micro Racers ${pin} terminato`);
        }
    }, 33); // ~30fps

    racersGameLoops.set(pin, intervalId);
}

function stopRacersGameLoop(pin) {
    const intervalId = racersGameLoops.get(pin);
    if (intervalId) {
        clearInterval(intervalId);
        racersGameLoops.delete(pin);
    }
}

// === TOWER DEFENSE HELPER FUNCTIONS ===

const towerGameLoops = new Map(); // pin -> intervalId
const towerWaveTimeouts = new Map(); // pin -> timeoutId

function startTowerWave(pin) {
    const result = towerManager.startWave(pin);

    if (result.error) {
        console.log(`Error starting wave: ${result.error}`);
        return;
    }

    // Notify everyone
    io.to(`tower:${pin}`).emit('tower:wave-start', {
        waveNumber: result.waveNumber,
        totalEnemies: result.totalEnemies
    });

    io.to(`tower-host:${pin}`).emit('tower:wave-start', {
        waveNumber: result.waveNumber,
        totalEnemies: result.totalEnemies
    });

    console.log(`Tower Defense ${pin}: Wave ${result.waveNumber} started`);

    // Start game loop
    startTowerGameLoop(pin);
}

function startTowerGameLoop(pin) {
    // Run at ~30fps
    const intervalId = setInterval(() => {
        const state = towerManager.updateGameState(pin);

        if (!state) {
            stopTowerGameLoop(pin);
            return;
        }

        // Broadcast game state to host
        io.to(`tower-host:${pin}`).emit('tower:game-state', state);

        // Send gold updates to players
        if (state.players) {
            for (const player of state.players) {
                io.to(player.socketId).emit('tower:gold-update', { gold: player.gold });
            }
        }

        // Check if wave is complete
        if (state.waveComplete) {
            stopTowerGameLoop(pin);
            handleTowerWaveComplete(pin);
            return;
        }

        // Check if game over
        if (state.gameOver) {
            stopTowerGameLoop(pin);
            handleTowerGameOver(pin, state.victory);
            return;
        }
    }, 33); // ~30fps

    towerGameLoops.set(pin, intervalId);

    // Wave timeout (120s max)
    const timeoutId = setTimeout(() => {
        const game = towerManager.getGame(pin);
        if (game && game.status === 'wave') {
            stopTowerGameLoop(pin);
            handleTowerWaveComplete(pin);
        }
    }, 120000);
    towerWaveTimeouts.set(pin, timeoutId);
}

function stopTowerGameLoop(pin) {
    const intervalId = towerGameLoops.get(pin);
    if (intervalId) {
        clearInterval(intervalId);
        towerGameLoops.delete(pin);
    }
    const timeoutId = towerWaveTimeouts.get(pin);
    if (timeoutId) {
        clearTimeout(timeoutId);
        towerWaveTimeouts.delete(pin);
    }
}

// Cleanup stale tower defense games every 5 minutes
setInterval(() => {
    const cleaned = towerManager.cleanupStaleGames();
    if (cleaned.length > 0) {
        cleaned.forEach(p => stopTowerGameLoop(p));
        console.log(`Cleaned ${cleaned.length} stale tower defense games`);
    }
}, 5 * 60 * 1000);

function handleTowerWaveComplete(pin) {
    const result = towerManager.completeWave(pin);

    if (!result) return;

    if (result.victory) {
        handleTowerGameOver(pin, true);
        return;
    }

    // Notify everyone
    io.to(`tower:${pin}`).emit('tower:wave-complete', {
        waveNumber: result.waveNumber,
        bonus: result.bonus,
        nextWave: result.nextWave,
        players: result.players
    });

    io.to(`tower-host:${pin}`).emit('tower:wave-complete', {
        waveNumber: result.waveNumber,
        bonus: result.bonus,
        nextWave: result.nextWave
    });

    // Return to building phase
    io.to(`tower:${pin}`).emit('tower:building-phase', { waveNumber: result.waveNumber });
    io.to(`tower-host:${pin}`).emit('tower:building-phase', { waveNumber: result.waveNumber });

    console.log(`Tower Defense ${pin}: Wave ${result.waveNumber} completed`);
}

function handleTowerGameOver(pin, victory) {
    const stats = towerManager.getGameStats(pin);

    io.to(`tower:${pin}`).emit('tower:game-over', {
        victory,
        stats
    });

    io.to(`tower-host:${pin}`).emit('tower:game-over', {
        victory,
        stats
    });

    console.log(`Tower Defense ${pin}: Game over - ${victory ? 'Victory' : 'Defeat'}`);
}

// === MAZE GAME HELPER FUNCTIONS ===

const mazeWallsTimers = new Map(); // pin -> intervalId

function startMazeWallsTimer(pin) {
    // Toggle moving walls every 5 seconds
    const intervalId = setInterval(() => {
        const result = mazeManager.toggleMovingWalls(pin);
        if (result) {
            io.to(`maze-host:${pin}`).emit('maze:moving-wall-update', {
                state: result.state
            });
        }
    }, 5000);

    mazeWallsTimers.set(pin, intervalId);
}

function stopMazeWallsTimer(pin) {
    const intervalId = mazeWallsTimers.get(pin);
    if (intervalId) {
        clearInterval(intervalId);
        mazeWallsTimers.delete(pin);
    }
}

// === CUCÙ (ASSO CHE FUGGE) HELPER FUNCTIONS ===

function startCucuRound(pin) {
    const roundData = assoManager.startRound(pin);
    if (!roundData || roundData.error) {
        console.log(`[CUCÙ] Errore avvio round: ${roundData?.error}`);
        return;
    }

    // Invia info round a tutti
    io.to(`asso-host:${pin}`).emit('asso:round-start', {
        roundNumber: roundData.roundNumber,
        dealerSocketId: roundData.dealerSocketId,
        currentPlayerSocketId: roundData.currentPlayerSocketId,
        players: roundData.players
    });

    // Invia le carte privatamente a ogni giocatore
    const cardAssignments = assoManager.dealCards(pin);
    for (const assignment of cardAssignments) {
        io.to(assignment.socketId).emit('asso:your-card', {
            card: assignment.card
        });
    }

    // Notifica il primo giocatore che è il suo turno
    io.to(roundData.currentPlayerSocketId).emit('asso:your-turn', {
        isDealer: roundData.currentPlayerSocketId === roundData.dealerSocketId
    });

    io.to(`asso-game:${pin}`).emit('asso:turn-changed', {
        currentPlayerSocketId: roundData.currentPlayerSocketId
    });

    console.log(`[CUCÙ] Round ${roundData.roundNumber} iniziato`);
}

function notifyNextCucuPlayer(pin, result) {
    if (!result.nextPlayerSocketId) return;

    // Notifica il prossimo giocatore
    io.to(result.nextPlayerSocketId).emit('asso:your-turn', {
        isDealer: result.isDealer
    });

    // Notifica tutti del cambio turno
    io.to(`asso-host:${pin}`).emit('asso:turn-changed', {
        currentPlayerSocketId: result.nextPlayerSocketId,
        currentPlayerNickname: result.nextPlayerNickname,
        isDealer: result.isDealer,
        players: result.players
    });

    io.to(`asso-game:${pin}`).emit('asso:turn-changed', {
        currentPlayerSocketId: result.nextPlayerSocketId
    });
}

function endCucuRound(pin) {
    // Rivela tutte le carte
    const reveals = assoManager.revealAllCards(pin);

    io.to(`asso-host:${pin}`).emit('asso:reveal-cards', { cards: reveals });
    io.to(`asso-game:${pin}`).emit('asso:reveal-cards', { cards: reveals });

    // Dopo un delay, calcola chi perde
    setTimeout(() => {
        const result = assoManager.endRound(pin);
        if (!result) return;

        io.to(`asso-host:${pin}`).emit('asso:round-result', {
            losers: result.losers,
            lowestCardName: result.lowestCardName,
            allCards: result.allCards,
            eliminatedThisRound: result.eliminatedThisRound,
            players: result.players
        });

        // Invia risultato personale a ogni giocatore
        for (const card of result.allCards) {
            const isLoser = result.losers.some(l => l.socketId === card.socketId);
            const wasEliminated = result.eliminatedThisRound.includes(card.nickname);

            io.to(card.socketId).emit('asso:your-round-result', {
                isLoser,
                wasEliminated,
                lives: card.lives,
                card: card.card
            });
        }

        // Controlla se la partita è finita
        const gameOver = assoManager.checkGameOver(pin);
        if (gameOver.gameOver) {
            setTimeout(() => {
                io.to(`asso-host:${pin}`).emit('asso:game-over', {
                    winner: gameOver.winner,
                    standings: gameOver.finalStandings
                });
                io.to(`asso-game:${pin}`).emit('asso:game-over', {
                    winner: gameOver.winner,
                    standings: gameOver.finalStandings
                });
            }, 3000);
        } else {
            // Notifica che si può iniziare il prossimo round
            setTimeout(() => {
                io.to(`asso-host:${pin}`).emit('asso:ready-for-next-round');
            }, 3000);
        }
    }, 3000);
}

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Quiz Arena server in esecuzione su http://localhost:${PORT}`);
    logger.general.serverStarted(PORT);
});
