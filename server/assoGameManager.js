// Cucù (Asso che Fugge) - Game Manager
// Gioco di carte tradizionale italiano

const logger = require('./logger');
const games = new Map();

// Carte napoletane - valore da 1 (Asso, peggiore) a 10 (Re, migliore)
const SUITS = ['denari', 'coppe', 'bastoni', 'spade'];
const CARD_NAMES = {
    1: 'Asso',
    2: 'Due',
    3: 'Tre',
    4: 'Quattro',
    5: 'Cinque',
    6: 'Sei',
    7: 'Sette',
    8: 'Fante',
    9: 'Cavallo',
    10: 'Re'
};

// Crea un mazzo completo di 40 carte
function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
        for (let value = 1; value <= 10; value++) {
            deck.push({
                suit,
                value,
                name: CARD_NAMES[value],
                fullName: `${CARD_NAMES[value]} di ${suit}`,
                isRe: value === 10,
                isCavallo: value === 9
            });
        }
    }
    return deck;
}

// Mescola il mazzo
function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function generatePin() {
    let pin;
    do {
        pin = Math.floor(1000 + Math.random() * 9000).toString();
    } while (games.has(pin));
    return pin;
}

const LOBBY_COUNTDOWN_SECONDS = 50;

function createGame(hostSocketId) {
    const pin = generatePin();
    const game = {
        pin,
        hostSocketId,
        players: new Map(),      // socketId -> player data
        playerOrder: [],          // Array of socketIds in seating order
        state: 'lobby',           // lobby, dealing, playing, revealing, round_end, finished

        // Round state
        deck: [],
        dealerIndex: 0,           // Chi è il mazziere (indice in playerOrder)
        currentPlayerIndex: 0,    // Di chi è il turno (indice in playerOrder)
        passTarget: null,         // A chi sta passando la carta
        roundNumber: 0,

        // Action tracking
        pendingAction: null,      // { type: 'pass', from: socketId, to: socketId }
        roundActions: [],         // Log delle azioni del round

        // Lobby countdown
        lobbyCountdown: LOBBY_COUNTDOWN_SECONDS,
        lobbyCountdownInterval: null,

        // Settings
        startingLives: 3,
        minPlayers: 2,
        maxPlayers: 10
    };

    games.set(pin, game);
    logger.asso.gameCreated(pin, hostSocketId);
    console.log(`[ASSO] Partita creata: PIN ${pin}`);
    return { pin };
}

function resetLobbyCountdown(pin) {
    const game = games.get(pin);
    if (!game) return;

    game.lobbyCountdown = LOBBY_COUNTDOWN_SECONDS;

    // Clear existing interval
    if (game.lobbyCountdownInterval) {
        clearInterval(game.lobbyCountdownInterval);
        game.lobbyCountdownInterval = null;
    }

    return game.lobbyCountdown;
}

function startLobbyCountdown(pin, onTick, onComplete) {
    const game = games.get(pin);
    if (!game) return;

    // Clear existing interval
    if (game.lobbyCountdownInterval) {
        clearInterval(game.lobbyCountdownInterval);
    }

    game.lobbyCountdown = LOBBY_COUNTDOWN_SECONDS;

    game.lobbyCountdownInterval = setInterval(() => {
        game.lobbyCountdown--;

        if (onTick) onTick(game.lobbyCountdown);

        if (game.lobbyCountdown <= 0) {
            clearInterval(game.lobbyCountdownInterval);
            game.lobbyCountdownInterval = null;
            if (onComplete && game.players.size >= game.minPlayers) {
                onComplete();
            }
        }
    }, 1000);

    return game.lobbyCountdown;
}

function stopLobbyCountdown(pin) {
    const game = games.get(pin);
    if (!game) return;

    if (game.lobbyCountdownInterval) {
        clearInterval(game.lobbyCountdownInterval);
        game.lobbyCountdownInterval = null;
    }
}

function getLobbyCountdown(pin) {
    const game = games.get(pin);
    return game?.lobbyCountdown || 0;
}

function getGame(pin) {
    return games.get(pin);
}

function joinGame(pin, socketId, nickname) {
    const game = games.get(pin);
    if (!game) {
        return { error: 'Partita non trovata' };
    }
    if (game.state !== 'lobby') {
        return { error: 'Partita già iniziata' };
    }
    if (game.players.size >= game.maxPlayers) {
        return { error: `Partita piena (max ${game.maxPlayers} giocatori)` };
    }

    // Check duplicate nickname
    for (const [, player] of game.players) {
        if (player.nickname.toLowerCase() === nickname.toLowerCase()) {
            return { error: 'Nickname già in uso' };
        }
    }

    const position = game.players.size;
    const player = {
        socketId,
        nickname,
        lives: game.startingLives,
        card: null,
        cardRevealed: false,  // True se Re o Cavallo (visibile a tutti)
        hasActed: false,      // Ha già fatto la sua azione questo turno
        isEliminated: false,
        position
    };

    game.players.set(socketId, player);
    game.playerOrder.push(socketId);

    logger.asso.playerJoined(pin, nickname, position);
    console.log(`[ASSO] ${nickname} si è unito alla partita ${pin}`);

    return {
        success: true,
        player: getPlayerPublicInfo(player),
        players: getPlayersPublicInfo(game)
    };
}

function getPlayerPublicInfo(player) {
    return {
        socketId: player.socketId,
        nickname: player.nickname,
        lives: player.lives,
        hasCard: player.card !== null,
        cardRevealed: player.cardRevealed,
        revealedCard: player.cardRevealed ? player.card : null,
        hasActed: player.hasActed,
        isEliminated: player.isEliminated,
        position: player.position
    };
}

function getPlayersPublicInfo(game) {
    return game.playerOrder
        .map(sid => game.players.get(sid))
        .filter(p => p)
        .map(p => getPlayerPublicInfo(p));
}

function getAlivePlayers(game) {
    return game.playerOrder
        .map(sid => game.players.get(sid))
        .filter(p => p && !p.isEliminated);
}

function startGame(pin) {
    const game = games.get(pin);
    if (!game) {
        return { error: 'Partita non trovata' };
    }
    if (game.players.size < game.minPlayers) {
        return { error: `Servono almeno ${game.minPlayers} giocatori` };
    }

    game.state = 'dealing';
    game.roundNumber = 0;
    game.dealerIndex = 0; // Primo mazziere è il primo giocatore

    logger.asso.gameStarted(pin, game.players.size);
    console.log(`[ASSO] Partita ${pin} iniziata con ${game.players.size} giocatori`);

    return { success: true };
}

function startRound(pin) {
    const game = games.get(pin);
    if (!game) return null;

    const alivePlayers = getAlivePlayers(game);
    if (alivePlayers.length < 2) {
        return { error: 'Non abbastanza giocatori' };
    }

    game.roundNumber++;
    game.state = 'dealing';
    game.roundActions = [];

    // Reset player states
    for (const player of game.players.values()) {
        player.card = null;
        player.cardRevealed = false;
        player.hasActed = false;
    }

    // Crea e mescola il mazzo
    game.deck = shuffleDeck(createDeck());

    // Distribuisci una carta a ogni giocatore vivo
    const aliveSocketIds = alivePlayers.map(p => p.socketId);
    for (const socketId of aliveSocketIds) {
        const player = game.players.get(socketId);
        player.card = game.deck.pop();
    }

    // Trova il primo giocatore (a destra del mazziere, cioè quello prima in senso antiorario)
    // In senso antiorario: il turno va dealerIndex - 1, dealerIndex - 2, ... fino a dealerIndex
    const aliveIndices = aliveSocketIds.map(sid => game.playerOrder.indexOf(sid));
    const dealerAliveIndex = aliveIndices.indexOf(game.playerOrder.indexOf(aliveSocketIds[game.dealerIndex % alivePlayers.length]));

    // Il primo a giocare è quello a destra del mazziere (prima di lui nell'ordine)
    game.currentPlayerIndex = (dealerAliveIndex - 1 + alivePlayers.length) % alivePlayers.length;

    game.state = 'playing';

    const dealerNickname = alivePlayers[game.dealerIndex % alivePlayers.length]?.nickname;
    logger.asso.roundStarted(pin, game.roundNumber, dealerNickname);
    console.log(`[ASSO] Round ${game.roundNumber} iniziato. Mazziere: ${dealerNickname}`);

    return {
        roundNumber: game.roundNumber,
        dealerSocketId: aliveSocketIds[game.dealerIndex % alivePlayers.length],
        currentPlayerSocketId: aliveSocketIds[game.currentPlayerIndex],
        players: getPlayersPublicInfo(game)
    };
}

function dealCards(pin) {
    const game = games.get(pin);
    if (!game) return null;

    // Restituisce le carte per ogni giocatore (da inviare privatamente)
    const cardAssignments = [];
    for (const [socketId, player] of game.players) {
        if (!player.isEliminated && player.card) {
            cardAssignments.push({
                socketId,
                card: player.card
            });
        }
    }

    return cardAssignments;
}

function getPlayerCard(pin, socketId) {
    const game = games.get(pin);
    if (!game) return null;

    const player = game.players.get(socketId);
    if (!player) return null;

    return player.card;
}

function getCurrentPlayer(game) {
    const alivePlayers = getAlivePlayers(game);
    if (alivePlayers.length === 0) return null;
    return alivePlayers[game.currentPlayerIndex % alivePlayers.length];
}

function getNextPlayer(game, fromIndex) {
    const alivePlayers = getAlivePlayers(game);
    if (alivePlayers.length <= 1) return null;

    // Senso antiorario (verso sinistra visivamente, indice decresce)
    let nextIndex = (fromIndex - 1 + alivePlayers.length) % alivePlayers.length;
    return alivePlayers[nextIndex];
}

function getDealerPlayer(game) {
    const alivePlayers = getAlivePlayers(game);
    if (alivePlayers.length === 0) return null;
    return alivePlayers[game.dealerIndex % alivePlayers.length];
}

// Giocatore decide di BUSSARE (tenere la carta)
function playerKnock(pin, socketId) {
    const game = games.get(pin);
    if (!game || game.state !== 'playing') {
        return { error: 'Azione non valida' };
    }

    const player = game.players.get(socketId);
    if (!player || player.isEliminated) {
        return { error: 'Giocatore non trovato' };
    }

    const currentPlayer = getCurrentPlayer(game);
    if (!currentPlayer || currentPlayer.socketId !== socketId) {
        return { error: 'Non è il tuo turno' };
    }

    if (player.hasActed) {
        return { error: 'Hai già agito questo turno' };
    }

    player.hasActed = true;

    game.roundActions.push({
        type: 'knock',
        player: player.nickname,
        socketId: player.socketId
    });

    logger.asso.playerKnocked(pin, player.nickname, player.card?.value);
    console.log(`[ASSO] ${player.nickname} bussa (tiene la carta)`);

    // Passa al prossimo giocatore
    return advanceToNextPlayer(game);
}

// Giocatore decide di PASSARE (scambiare con chi è a sinistra)
function playerPass(pin, socketId) {
    const game = games.get(pin);
    if (!game || game.state !== 'playing') {
        return { error: 'Azione non valida' };
    }

    const player = game.players.get(socketId);
    if (!player || player.isEliminated) {
        return { error: 'Giocatore non trovato' };
    }

    const currentPlayer = getCurrentPlayer(game);
    if (!currentPlayer || currentPlayer.socketId !== socketId) {
        return { error: 'Non è il tuo turno' };
    }

    if (player.hasActed) {
        return { error: 'Hai già agito questo turno' };
    }

    const alivePlayers = getAlivePlayers(game);
    const currentIndex = alivePlayers.findIndex(p => p.socketId === socketId);

    // Trova il bersaglio del passaggio (potrebbe saltare per via del Cavallo)
    let targetIndex = (currentIndex - 1 + alivePlayers.length) % alivePlayers.length;
    let target = alivePlayers[targetIndex];
    let skipped = [];
    let blocked = false;
    let blockedBy = null;

    // Gestisci Cavallo (salta) e Re (blocca)
    let attempts = 0;
    while (attempts < alivePlayers.length) {
        target = alivePlayers[targetIndex];

        // Se il target è il mazziere e non ha ancora agito, il passaggio si ferma
        const dealer = getDealerPlayer(game);
        const isTargetDealer = target.socketId === dealer?.socketId;

        if (target.card?.isCavallo && !target.cardRevealed) {
            // Cavallo: rivela la carta e salta
            target.cardRevealed = true;
            skipped.push({
                socketId: target.socketId,
                nickname: target.nickname,
                card: target.card
            });

            console.log(`[ASSO] ${target.nickname} ha il Cavallo - SALTA!`);

            targetIndex = (targetIndex - 1 + alivePlayers.length) % alivePlayers.length;
            attempts++;
            continue;
        }

        if (target.card?.isRe && !target.cardRevealed) {
            // Re: rivela la carta e blocca
            target.cardRevealed = true;
            blocked = true;
            blockedBy = {
                socketId: target.socketId,
                nickname: target.nickname,
                card: target.card
            };

            console.log(`[ASSO] ${target.nickname} ha il Re - CUCÙ! Blocca ${player.nickname}`);
            break;
        }

        // Target valido trovato
        break;
    }

    player.hasActed = true;

    if (blocked) {
        // Bloccato dal Re - nessuno scambio
        game.roundActions.push({
            type: 'blocked',
            player: player.nickname,
            socketId: player.socketId,
            blockedBy: blockedBy.nickname,
            skipped: skipped.map(s => s.nickname)
        });

        logger.asso.playerPassed(pin, player.nickname, blockedBy.nickname, true, blockedBy.nickname);
        logger.asso.cardRevealed(pin, blockedBy.nickname, blockedBy.card, 'Re - blocca passaggio');

        return {
            success: true,
            action: 'blocked',
            blockedBy,
            skipped,
            ...advanceToNextPlayer(game)
        };
    }

    // Se il target è lo stesso giocatore (tutti saltano/bloccano), nessuno scambio
    if (target.socketId === socketId) {
        game.roundActions.push({
            type: 'pass_failed',
            player: player.nickname,
            socketId: player.socketId,
            reason: 'no_valid_target'
        });

        return {
            success: true,
            action: 'no_target',
            ...advanceToNextPlayer(game)
        };
    }

    // Scambio carte
    const playerCard = player.card;
    const targetCard = target.card;

    player.card = targetCard;
    target.card = playerCard;

    // Se una delle carte scambiate è Re o Cavallo, rivelala
    if (player.card?.isRe || player.card?.isCavallo) {
        player.cardRevealed = true;
    }
    if (target.card?.isRe || target.card?.isCavallo) {
        target.cardRevealed = true;
    }

    game.roundActions.push({
        type: 'pass',
        player: player.nickname,
        socketId: player.socketId,
        target: target.nickname,
        targetSocketId: target.socketId,
        skipped: skipped.map(s => s.nickname)
    });

    logger.asso.playerPassed(pin, player.nickname, target.nickname, false, null);
    logger.asso.cardsSwapped(pin, player.nickname, target.nickname, targetCard, playerCard);
    console.log(`[ASSO] ${player.nickname} passa la carta a ${target.nickname}`);

    return {
        success: true,
        action: 'passed',
        target: {
            socketId: target.socketId,
            nickname: target.nickname
        },
        skipped,
        ...advanceToNextPlayer(game)
    };
}

// Mazziere pesca dal mazzo
function dealerDraw(pin, socketId) {
    const game = games.get(pin);
    if (!game || game.state !== 'playing') {
        return { error: 'Azione non valida' };
    }

    const player = game.players.get(socketId);
    if (!player || player.isEliminated) {
        return { error: 'Giocatore non trovato' };
    }

    const dealer = getDealerPlayer(game);
    if (!dealer || dealer.socketId !== socketId) {
        return { error: 'Solo il mazziere può pescare dal mazzo' };
    }

    const currentPlayer = getCurrentPlayer(game);
    if (!currentPlayer || currentPlayer.socketId !== socketId) {
        return { error: 'Non è il tuo turno' };
    }

    if (player.hasActed) {
        return { error: 'Hai già agito questo turno' };
    }

    if (game.deck.length === 0) {
        return { error: 'Mazzo vuoto' };
    }

    // Pesca una carta casuale dal mazzo
    const drawnCard = game.deck.pop();
    const oldCard = player.card;
    player.card = drawnCard;
    player.hasActed = true;

    // Se la carta pescata è Re o Cavallo, rivelala
    if (player.card?.isRe || player.card?.isCavallo) {
        player.cardRevealed = true;
    }

    game.roundActions.push({
        type: 'draw',
        player: player.nickname,
        socketId: player.socketId,
        drewSpecial: player.card?.isRe || player.card?.isCavallo
    });

    logger.asso.dealerDrew(pin, player.nickname, oldCard, drawnCard, false);
    console.log(`[ASSO] Mazziere ${player.nickname} pesca dal mazzo: ${drawnCard.fullName}`);

    return {
        success: true,
        action: 'drew',
        drawnCard,
        oldCard,
        ...advanceToNextPlayer(game)
    };
}

function advanceToNextPlayer(game) {
    const alivePlayers = getAlivePlayers(game);
    const dealer = getDealerPlayer(game);
    const currentPlayer = getCurrentPlayer(game);

    // Trova il prossimo giocatore che non ha ancora agito
    let nextIndex = (game.currentPlayerIndex - 1 + alivePlayers.length) % alivePlayers.length;
    let attempts = 0;

    while (attempts < alivePlayers.length) {
        const nextPlayer = alivePlayers[nextIndex];

        if (!nextPlayer.hasActed) {
            game.currentPlayerIndex = nextIndex;

            return {
                nextPlayerSocketId: nextPlayer.socketId,
                nextPlayerNickname: nextPlayer.nickname,
                isDealer: nextPlayer.socketId === dealer?.socketId,
                roundComplete: false,
                players: getPlayersPublicInfo(game)
            };
        }

        nextIndex = (nextIndex - 1 + alivePlayers.length) % alivePlayers.length;
        attempts++;
    }

    // Tutti hanno agito - round completo
    game.state = 'revealing';

    return {
        roundComplete: true,
        players: getPlayersPublicInfo(game)
    };
}

function revealAllCards(pin) {
    const game = games.get(pin);
    if (!game) return null;

    const alivePlayers = getAlivePlayers(game);
    const reveals = [];

    for (const player of alivePlayers) {
        reveals.push({
            socketId: player.socketId,
            nickname: player.nickname,
            card: player.card,
            lives: player.lives
        });
    }

    // Ordina per valore carta (dal più basso al più alto)
    reveals.sort((a, b) => a.card.value - b.card.value);

    return reveals;
}

function endRound(pin) {
    const game = games.get(pin);
    if (!game) return null;

    const alivePlayers = getAlivePlayers(game);
    if (alivePlayers.length === 0) return null;

    // Trova il valore più basso
    let lowestValue = Infinity;
    for (const player of alivePlayers) {
        if (player.card && player.card.value < lowestValue) {
            lowestValue = player.card.value;
        }
    }

    // Trova tutti i giocatori con il valore più basso (perdono una vita)
    const losers = [];
    for (const player of alivePlayers) {
        if (player.card && player.card.value === lowestValue) {
            player.lives--;
            losers.push({
                socketId: player.socketId,
                nickname: player.nickname,
                card: player.card,
                livesRemaining: player.lives
            });

            if (player.lives <= 0) {
                player.isEliminated = true;
                logger.asso.playerEliminated(pin, player.nickname, game.roundNumber);
                console.log(`[ASSO] ${player.nickname} ELIMINATO!`);
            }
        }
    }

    // Ruota il mazziere per il prossimo round
    const stillAlivePlayers = getAlivePlayers(game);
    if (stillAlivePlayers.length > 0) {
        game.dealerIndex = (game.dealerIndex + 1) % stillAlivePlayers.length;
    }

    game.state = 'round_end';

    const lowestCard = alivePlayers.find(p => p.card?.value === lowestValue)?.card;
    logger.asso.roundEnded(pin, game.roundNumber, losers, lowestCard);
    console.log(`[ASSO] Round ${game.roundNumber} finito. Perdenti: ${losers.map(l => l.nickname).join(', ')}`);

    return {
        losers,
        lowestValue,
        lowestCardName: CARD_NAMES[lowestValue],
        allCards: alivePlayers.map(p => ({
            socketId: p.socketId,
            nickname: p.nickname,
            card: p.card,
            lives: p.lives,
            isEliminated: p.isEliminated
        })),
        eliminatedThisRound: losers.filter(l => l.livesRemaining <= 0).map(l => l.nickname),
        players: getPlayersPublicInfo(game)
    };
}

function checkGameOver(pin) {
    const game = games.get(pin);
    if (!game) return { gameOver: true };

    const alivePlayers = getAlivePlayers(game);

    if (alivePlayers.length <= 1) {
        game.state = 'finished';
        const winner = alivePlayers[0] || null;

        logger.asso.gameEnded(pin, winner?.nickname, game.roundNumber);
        console.log(`[ASSO] Partita ${pin} terminata. Vincitore: ${winner?.nickname || 'nessuno'}`);

        return {
            gameOver: true,
            winner: winner ? {
                socketId: winner.socketId,
                nickname: winner.nickname,
                lives: winner.lives
            } : null,
            finalStandings: Array.from(game.players.values())
                .sort((a, b) => {
                    if (a.isEliminated && !b.isEliminated) return 1;
                    if (!a.isEliminated && b.isEliminated) return -1;
                    return b.lives - a.lives;
                })
                .map((p, i) => ({
                    rank: i + 1,
                    nickname: p.nickname,
                    lives: p.lives,
                    isEliminated: p.isEliminated
                }))
        };
    }

    return { gameOver: false };
}

function handleDisconnect(socketId) {
    for (const [pin, game] of games) {
        // Host disconnected
        if (game.hostSocketId === socketId) {
            logger.asso.playerDisconnected(pin, 'HOST', true);
            games.delete(pin);
            return { type: 'host', pin };
        }

        // Player disconnected
        if (game.players.has(socketId)) {
            const player = game.players.get(socketId);
            logger.asso.playerDisconnected(pin, player.nickname, false);

            if (game.state === 'lobby') {
                // In lobby: rimuovi completamente
                game.players.delete(socketId);
                game.playerOrder = game.playerOrder.filter(sid => sid !== socketId);
            } else {
                // Durante il gioco: elimina
                player.isEliminated = true;
                player.lives = 0;
                logger.asso.playerEliminated(pin, player.nickname, game.roundNumber);
            }

            return {
                type: 'player',
                pin,
                nickname: player.nickname,
                wasInGame: game.state !== 'lobby',
                players: getPlayersPublicInfo(game)
            };
        }
    }
    return null;
}

function deleteGame(pin) {
    games.delete(pin);
}

// Controlla se il giocatore corrente è il mazziere
function isCurrentPlayerDealer(pin) {
    const game = games.get(pin);
    if (!game) return false;

    const currentPlayer = getCurrentPlayer(game);
    const dealer = getDealerPlayer(game);

    return currentPlayer?.socketId === dealer?.socketId;
}

// Notifica che un giocatore ha visto la propria carta (per Re/Cavallo)
function playerPeekedCard(pin, socketId) {
    const game = games.get(pin);
    if (!game) return null;

    const player = game.players.get(socketId);
    if (!player || !player.card) return null;

    // Se è Re o Cavallo, rivela a tutti
    if (player.card.isRe || player.card.isCavallo) {
        player.cardRevealed = true;
        const reason = player.card.isRe ? 'Re - protezione' : 'Cavallo - salta turno';
        logger.asso.cardRevealed(pin, player.nickname, player.card, reason);

        return {
            revealed: true,
            socketId: player.socketId,
            nickname: player.nickname,
            card: player.card
        };
    }

    return { revealed: false };
}

module.exports = {
    createGame,
    getGame,
    joinGame,
    startGame,
    startRound,
    dealCards,
    getPlayerCard,
    playerKnock,
    playerPass,
    dealerDraw,
    playerPeekedCard,
    revealAllCards,
    endRound,
    checkGameOver,
    handleDisconnect,
    deleteGame,
    getPlayersPublicInfo,
    getCurrentPlayer,
    getDealerPlayer,
    isCurrentPlayerDealer,
    getAlivePlayers,
    // Lobby countdown
    resetLobbyCountdown,
    startLobbyCountdown,
    stopLobbyCountdown,
    getLobbyCountdown,
    LOBBY_COUNTDOWN_SECONDS
};
