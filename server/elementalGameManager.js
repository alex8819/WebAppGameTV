// Elemental Clash Game Manager

const games = new Map();

// Mini-game types
const MINI_GAMES = {
    COLOR_TOUCH: {
        id: 'color_touch',
        name: 'Tocca il Colore!',
        description: 'Trova la SCRITTA giusta!',
        duration: 6000,
        colors: ['red', 'blue', 'green', 'yellow']
    },
    DODGE: {
        id: 'dodge',
        name: 'Schiva il Colpo!',
        description: 'Premi la direzione OPPOSTA!',
        duration: 5000,
        directions: ['up', 'down', 'left', 'right']
    },
    LUCKY_SYMBOL: {
        id: 'lucky_symbol',
        name: 'Simbolo Mancante!',
        description: 'Quale simbolo manca?',
        duration: 6000,
        symbols: ['🔺', '⭐', '⚫', '💎']
    },
    DOUBLE_NOTHING: {
        id: 'double_nothing',
        name: 'Testa o Croce!',
        description: 'Indovina il lancio della moneta!',
        duration: 5000
    },
    ELEMENT_BOOST: {
        id: 'element_boost',
        name: 'Batti l\'Elemento!',
        description: 'Clicca l\'elemento che VINCE!',
        duration: 5000
    },
    CHAOS_TARGET: {
        id: 'chaos_target',
        name: 'Riflessi!',
        description: 'Premi quando appare GO!',
        duration: 5000
    },
    MEMORY_FLASH: {
        id: 'memory_flash',
        name: 'Memory Flash!',
        description: 'Ricorda la sequenza!',
        duration: 8000,
        icons: ['🔥', '💧', '🌍', '💨', '⚡', '❄️']
    },
    TURBO_RUNNER: {
        id: 'turbo_runner',
        name: 'Turbo Runner!',
        description: 'Tappa più veloce che puoi!',
        duration: 6000,
        targetTaps: 30  // Taps needed to finish
    },
    QUICK_OPPOSITES: {
        id: 'quick_opposites',
        name: 'Opposti Rapidi!',
        description: 'Clicca la direzione OPPOSTA!',
        duration: 10000,  // 3 seconds per round + buffer
        directions: ['up', 'down', 'left', 'right'],
        rounds: 3,
        roundTime: 3000  // 3 seconds per direction
    }
};

// Mini-game bonuses
const MINIGAME_REWARDS = {
    first: { damageBonus: 0.3, description: '+30% danni' },
    second: { priority: true, description: 'Attacco prioritario' },
    last: { damageTaken: 10, description: '+10 danni subiti' }
};

// Element advantages: fire > air > earth > water > fire
const ELEMENT_ADVANTAGE = {
    fire: 'air',
    air: 'earth',
    earth: 'water',
    water: 'fire'
};

const ELEMENT_ICONS = {
    fire: '🔥',
    water: '💧',
    earth: '🌍',
    air: '💨'
};

// Base damage values
const BASE_DAMAGE = 15;
const ELEMENT_BONUS = 0.3; // +30% for advantage, -30% for disadvantage
const DEFENSE_REDUCTION = 0.7; // Reduces incoming damage by 70%
const FOCUS_HEAL = 5; // Small HP gain when focusing

// Special abilities
const SPECIALS = {
    'double-attack': { focusCost: 2, description: 'Attack both neighbors' },
    'mega-defense': { focusCost: 2, description: 'Full immunity this turn' },
    'heal': { focusCost: 2, description: 'Restore 30 HP' },
    'counter': { focusCost: 2, description: 'If attacked, deal double damage back' }
};

function generatePin() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

function createGame(hostSocketId) {
    let pin;
    do {
        pin = generatePin();
    } while (games.has(pin));

    const game = {
        pin,
        hostSocketId,
        players: new Map(),
        status: 'lobby', // lobby, playing, finished
        phase: 'lobby', // lobby, minigame, action, resolution
        round: 0,
        matchTimeRemaining: 600, // 10 minutes in seconds
        turnTimeRemaining: 10,
        turnTimer: null,
        matchTimer: null,
        currentActions: new Map(), // socketId -> action
        eliminationOrder: [],
        battleLog: [],
        exitVotes: new Set(), // socketIds who voted to exit
        // Mini-game state
        currentMiniGame: null,
        miniGameAnswers: new Map(), // socketId -> { answer, time }
        miniGameResults: new Map(), // socketId -> { rank, bonus }
        turnBonuses: new Map() // socketId -> { damageBonus, damageTaken, priority, shield, extraDamage, chaosTarget }
    };

    games.set(pin, game);
    return { pin, gameId: pin };
}

function getGame(pin) {
    return games.get(pin);
}

function joinGame(pin, nickname, socketId, avatar, element) {
    const game = games.get(pin);
    if (!game) {
        return { error: 'Partita non trovata' };
    }

    if (game.status !== 'lobby') {
        return { error: 'La partita è già iniziata' };
    }

    if (game.players.size >= 8) {
        return { error: 'Partita piena (max 8 giocatori)' };
    }

    // Check for duplicate nickname
    for (const [, player] of game.players) {
        if (player.nickname.toLowerCase() === nickname.toLowerCase()) {
            return { error: 'Nickname già in uso' };
        }
    }

    const player = {
        socketId,
        nickname,
        avatar,
        element,
        hp: 100,
        maxHp: 100,
        focus: 0,
        isAlive: true,
        position: game.players.size, // Position in circle
        stats: {
            damageDealt: 0,
            damageTaken: 0,
            kills: 0,
            roundsSurvived: 0
        }
    };

    game.players.set(socketId, player);

    return { player };
}

function getPlayers(pin) {
    const game = games.get(pin);
    if (!game) return [];

    return Array.from(game.players.values()).map(p => ({
        nickname: p.nickname,
        avatar: p.avatar,
        element: p.element,
        hp: p.hp,
        isAlive: p.isAlive,
        position: p.position
    }));
}

function startGame(pin) {
    const game = games.get(pin);
    if (!game) {
        return { error: 'Partita non trovata' };
    }

    if (game.players.size < 2) {
        return { error: 'Servono almeno 2 giocatori' };
    }

    game.status = 'playing';
    game.round = 1;

    // Assign positions in a circle
    const players = Array.from(game.players.values());
    players.forEach((player, index) => {
        player.position = index;
    });

    return { success: true };
}

function shufflePositions(pin) {
    const game = games.get(pin);
    if (!game) return null;

    const alivePlayers = Array.from(game.players.values()).filter(p => p.isAlive);
    if (alivePlayers.length < 2) return null;

    // Store old positions for animation
    const oldPositions = new Map();
    alivePlayers.forEach(p => {
        oldPositions.set(p.socketId, p.position);
    });

    // Create new random positions
    const positions = alivePlayers.map((_, i) => i);
    // Fisher-Yates shuffle
    for (let i = positions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [positions[i], positions[j]] = [positions[j], positions[i]];
    }

    // Assign new positions
    const shuffleData = [];
    alivePlayers.forEach((player, index) => {
        const newPos = positions[index];
        shuffleData.push({
            socketId: player.socketId,
            nickname: player.nickname,
            avatar: player.avatar,
            element: player.element,
            oldPosition: player.position,
            newPosition: newPos
        });
        player.position = newPos;
    });

    // Sort players by new position
    alivePlayers.sort((a, b) => a.position - b.position);

    return shuffleData;
}

function getNeighbors(pin, socketId) {
    const game = games.get(pin);
    if (!game) return { left: null, right: null };

    // Sort by position to get correct neighbors
    const players = Array.from(game.players.values())
        .filter(p => p.isAlive)
        .sort((a, b) => a.position - b.position);
    const playerIndex = players.findIndex(p => p.socketId === socketId);

    if (playerIndex === -1 || players.length < 2) {
        return { left: null, right: null };
    }

    const leftIndex = (playerIndex - 1 + players.length) % players.length;
    const rightIndex = (playerIndex + 1) % players.length;

    return {
        left: {
            socketId: players[leftIndex].socketId,
            nickname: players[leftIndex].nickname,
            avatar: players[leftIndex].avatar,
            element: players[leftIndex].element,
            hp: players[leftIndex].hp
        },
        right: {
            socketId: players[rightIndex].socketId,
            nickname: players[rightIndex].nickname,
            avatar: players[rightIndex].avatar,
            element: players[rightIndex].element,
            hp: players[rightIndex].hp
        }
    };
}

function submitAction(pin, socketId, action) {
    const game = games.get(pin);
    if (!game || game.status !== 'playing') {
        return { error: 'Partita non in corso' };
    }

    const player = game.players.get(socketId);
    if (!player || !player.isAlive) {
        return { error: 'Giocatore non valido' };
    }

    // Validate action
    const validActions = ['attack-left', 'attack-right', 'defend', 'focus'];
    const validSpecials = Object.keys(SPECIALS);

    if (!validActions.includes(action) && !validSpecials.includes(action)) {
        return { error: 'Azione non valida' };
    }

    // Check if special ability requires focus
    if (validSpecials.includes(action)) {
        if (player.focus < SPECIALS[action].focusCost) {
            return { error: 'Focus insufficiente' };
        }
    }

    game.currentActions.set(socketId, action);

    return {
        success: true,
        allActionsReceived: game.currentActions.size === getAlivePlayers(game).length
    };
}

function getAlivePlayers(game) {
    return Array.from(game.players.values()).filter(p => p.isAlive);
}

function calculateDamage(attacker, defender, attackerBonus = {}, defenderBonus = {}) {
    let damage = BASE_DAMAGE;

    // Element advantage/disadvantage
    if (ELEMENT_ADVANTAGE[attacker.element] === defender.element) {
        damage = Math.round(damage * (1 + ELEMENT_BONUS));
    } else if (ELEMENT_ADVANTAGE[defender.element] === attacker.element) {
        damage = Math.round(damage * (1 - ELEMENT_BONUS));
    }

    // Apply mini-game bonuses
    // Attacker damage bonus (+30%)
    if (attackerBonus.damageBonus) {
        damage = Math.round(damage * (1 + attackerBonus.damageBonus));
    }

    // Chaos target bonus (+15 damage against specific target)
    if (attackerBonus.chaosTarget === defender.socketId && attackerBonus.chaosDamage) {
        damage += attackerBonus.chaosDamage;
    }

    return damage;
}

function resolveRound(pin) {
    const game = games.get(pin);
    if (!game) return null;

    const alivePlayers = getAlivePlayers(game);
    const results = [];
    const attacks = new Map(); // targetSocketId -> [{attacker, damage}]
    const defenses = new Set(); // socketIds that are defending
    const counters = new Set(); // socketIds that have counter active
    const megaDefenses = new Set(); // socketIds with full immunity

    // First pass: collect all actions
    for (const player of alivePlayers) {
        const action = game.currentActions.get(player.socketId) || 'defend';
        const neighbors = getNeighbors(pin, player.socketId);
        const attackerBonus = game.turnBonuses.get(player.socketId) || {};

        if (action === 'attack-left' && neighbors.left) {
            const defender = game.players.get(neighbors.left.socketId);
            const damage = calculateDamage(player, defender, attackerBonus);
            if (!attacks.has(neighbors.left.socketId)) {
                attacks.set(neighbors.left.socketId, []);
            }
            attacks.get(neighbors.left.socketId).push({ attacker: player, damage, direction: 'left' });
        }
        else if (action === 'attack-right' && neighbors.right) {
            const defender = game.players.get(neighbors.right.socketId);
            const damage = calculateDamage(player, defender, attackerBonus);
            if (!attacks.has(neighbors.right.socketId)) {
                attacks.set(neighbors.right.socketId, []);
            }
            attacks.get(neighbors.right.socketId).push({ attacker: player, damage, direction: 'right' });
        }
        else if (action === 'defend') {
            defenses.add(player.socketId);
        }
        else if (action === 'focus') {
            player.focus = Math.min(2, player.focus + 1);
            player.hp = Math.min(player.maxHp, player.hp + FOCUS_HEAL);
        }
        else if (action === 'double-attack') {
            player.focus = 0;
            if (neighbors.left) {
                const defenderL = game.players.get(neighbors.left.socketId);
                const damageL = calculateDamage(player, defenderL, attackerBonus);
                if (!attacks.has(neighbors.left.socketId)) {
                    attacks.set(neighbors.left.socketId, []);
                }
                attacks.get(neighbors.left.socketId).push({ attacker: player, damage: damageL, direction: 'left' });
            }
            if (neighbors.right) {
                const defenderR = game.players.get(neighbors.right.socketId);
                const damageR = calculateDamage(player, defenderR, attackerBonus);
                if (!attacks.has(neighbors.right.socketId)) {
                    attacks.set(neighbors.right.socketId, []);
                }
                attacks.get(neighbors.right.socketId).push({ attacker: player, damage: damageR, direction: 'right' });
            }
        }
        else if (action === 'mega-defense') {
            player.focus = 0;
            megaDefenses.add(player.socketId);
        }
        else if (action === 'heal') {
            player.focus = 0;
            player.hp = Math.min(player.maxHp, player.hp + 30);
        }
        else if (action === 'counter') {
            player.focus = 0;
            counters.add(player.socketId);
            defenses.add(player.socketId); // Counter also defends
        }
    }

    // Second pass: apply damage
    const eliminations = [];

    for (const player of alivePlayers) {
        const incomingAttacks = attacks.get(player.socketId) || [];
        const defenderBonus = game.turnBonuses.get(player.socketId) || {};
        let totalDamage = 0;
        const attackers = [];

        for (const attack of incomingAttacks) {
            let damage = attack.damage;

            // Mega defense blocks all damage
            if (megaDefenses.has(player.socketId)) {
                damage = 0;
            }
            // Normal defense reduces damage
            else if (defenses.has(player.socketId)) {
                damage = Math.round(damage * (1 - DEFENSE_REDUCTION));
            }
            // Mini-game shield bonus (30% reduction, stacks with defense)
            else if (defenderBonus.shield) {
                damage = Math.round(damage * (1 - defenderBonus.shield));
            }

            // Counter: if attacked and has counter, deal double damage back
            if (counters.has(player.socketId) && damage > 0) {
                const counterDamage = attack.damage * 2;
                attack.attacker.hp -= counterDamage;
                attack.attacker.stats.damageTaken += counterDamage;
                player.stats.damageDealt += counterDamage;

                results.push({
                    type: 'counter',
                    player: player.nickname,
                    target: attack.attacker.nickname,
                    damage: counterDamage
                });
            }

            totalDamage += damage;
            if (damage > 0) {
                attackers.push({
                    name: attack.attacker.nickname,
                    damage,
                    element: attack.attacker.element
                });
                attack.attacker.stats.damageDealt += damage;
            }
        }

        // Apply damageTaken penalty from mini-game
        if (defenderBonus.damageTaken && totalDamage > 0) {
            totalDamage += defenderBonus.damageTaken;
        }

        if (totalDamage > 0) {
            player.hp -= totalDamage;
            player.stats.damageTaken += totalDamage;

            results.push({
                type: defenses.has(player.socketId) ? 'blocked' : 'damage',
                player: player.nickname,
                damage: totalDamage,
                attackers,
                defended: defenses.has(player.socketId)
            });
        }

        // Check for elimination
        if (player.hp <= 0) {
            player.hp = 0;
            player.isAlive = false;
            player.stats.roundsSurvived = game.round;
            game.eliminationOrder.push(player.socketId);

            // Credit kills to attackers
            for (const attack of incomingAttacks) {
                attack.attacker.stats.kills++;
            }

            eliminations.push({
                player: player.nickname,
                avatar: player.avatar,
                killedBy: attackers.map(a => a.name)
            });
        }
    }

    // Check for eliminations from counter damage
    for (const player of alivePlayers) {
        if (player.hp <= 0 && player.isAlive) {
            player.hp = 0;
            player.isAlive = false;
            player.stats.roundsSurvived = game.round;
            game.eliminationOrder.push(player.socketId);

            eliminations.push({
                player: player.nickname,
                avatar: player.avatar,
                killedBy: ['Counter attack']
            });
        }
    }

    // Increment round survived for alive players
    for (const player of getAlivePlayers(game)) {
        player.stats.roundsSurvived = game.round;
    }

    game.round++;

    // Check for winner
    const remainingPlayers = getAlivePlayers(game);
    let winner = null;
    let gameOver = false;

    if (remainingPlayers.length <= 1) {
        gameOver = true;
        if (remainingPlayers.length === 1) {
            winner = remainingPlayers[0];
        }
    }

    // Collect action animations data
    const actionAnimations = [];
    for (const player of alivePlayers) {
        const action = game.currentActions.get(player.socketId) || 'defend';
        const neighbors = getNeighbors(pin, player.socketId);

        actionAnimations.push({
            socketId: player.socketId,
            nickname: player.nickname,
            avatar: player.avatar,
            element: player.element,
            action: action,
            targetLeft: neighbors.left?.nickname,
            targetRight: neighbors.right?.nickname
        });
    }

    // Add to battle log
    game.battleLog.push({
        round: game.round - 1,
        results,
        eliminations,
        actions: actionAnimations
    });

    // Clear actions for next round
    game.currentActions.clear();

    return {
        round: game.round - 1,
        results,
        eliminations,
        actions: actionAnimations,
        players: getPlayersStatus(game),
        gameOver,
        winner: winner ? {
            socketId: winner.socketId,
            nickname: winner.nickname,
            avatar: winner.avatar,
            element: winner.element,
            hp: winner.hp,
            stats: winner.stats
        } : null
    };
}

function getPlayersStatus(game) {
    return Array.from(game.players.values()).map(p => ({
        socketId: p.socketId,
        nickname: p.nickname,
        avatar: p.avatar,
        element: p.element,
        hp: p.hp,
        maxHp: p.maxHp,
        focus: p.focus,
        isAlive: p.isAlive,
        position: p.position
    }));
}

function getPlayerState(pin, socketId) {
    const game = games.get(pin);
    if (!game) return null;

    const player = game.players.get(socketId);
    if (!player) return null;

    const neighbors = getNeighbors(pin, socketId);

    return {
        hp: player.hp,
        maxHp: player.maxHp,
        focus: player.focus,
        isAlive: player.isAlive,
        neighbors,
        round: game.round,
        matchTimeRemaining: game.matchTimeRemaining
    };
}

function endGame(pin) {
    const game = games.get(pin);
    if (!game) return null;

    game.status = 'finished';

    // Calculate rankings
    const rankings = Array.from(game.players.values())
        .sort((a, b) => {
            // Alive players first
            if (a.isAlive !== b.isAlive) return a.isAlive ? -1 : 1;
            // Then by HP
            if (a.hp !== b.hp) return b.hp - a.hp;
            // Then by rounds survived
            return b.stats.roundsSurvived - a.stats.roundsSurvived;
        })
        .map((p, index) => ({
            rank: index + 1,
            socketId: p.socketId,
            nickname: p.nickname,
            avatar: p.avatar,
            element: p.element,
            hp: p.hp,
            stats: p.stats
        }));

    return { rankings };
}

function deleteGame(pin) {
    const game = games.get(pin);
    if (game) {
        if (game.turnTimer) clearInterval(game.turnTimer);
        if (game.matchTimer) clearInterval(game.matchTimer);
        games.delete(pin);
    }
}

function leaveGame(socketId) {
    for (const [pin, game] of games) {
        if (game.hostSocketId === socketId) {
            deleteGame(pin);
            return { pin, isHost: true };
        }

        const player = game.players.get(socketId);
        if (player) {
            game.players.delete(socketId);
            return { pin, isHost: false, player };
        }
    }
    return null;
}

function allActionsReceived(pin) {
    const game = games.get(pin);
    if (!game) return false;

    const alivePlayers = getAlivePlayers(game);
    return game.currentActions.size >= alivePlayers.length;
}

function decrementMatchTime(pin) {
    const game = games.get(pin);
    if (!game) return null;

    game.matchTimeRemaining--;

    if (game.matchTimeRemaining <= 0) {
        return endGame(pin);
    }

    return { timeRemaining: game.matchTimeRemaining };
}

function voteExit(pin, socketId, vote) {
    const game = games.get(pin);
    if (!game) return null;

    if (vote) {
        game.exitVotes.add(socketId);
    } else {
        game.exitVotes.delete(socketId);
    }

    const totalPlayers = game.players.size;
    const votedCount = game.exitVotes.size;
    const allVoted = votedCount >= totalPlayers && totalPlayers > 0;

    return {
        votedCount,
        totalPlayers,
        allVoted
    };
}

// ============ MINI-GAME FUNCTIONS ============

function startMiniGame(pin) {
    const game = games.get(pin);
    if (!game) return null;

    game.phase = 'minigame';
    game.miniGameAnswers.clear();
    game.miniGameResults.clear();
    game.turnBonuses.clear();

    // Pick a random mini-game
    const miniGameTypes = Object.values(MINI_GAMES);
    const miniGameType = miniGameTypes[Math.floor(Math.random() * miniGameTypes.length)];

    // Generate mini-game data based on type
    let miniGameData = {
        type: miniGameType.id,
        name: miniGameType.name,
        description: miniGameType.description,
        duration: miniGameType.duration
    };

    switch (miniGameType.id) {
        case 'color_touch':
            // Stroop effect: button color ≠ text on button
            // Player must find the button with the correct TEXT
            const allColors = [...miniGameType.colors];
            const correctColor = allColors[Math.floor(Math.random() * allColors.length)];

            // Create Stroop buttons: each has a bgColor and textLabel (MUST be different)
            const shuffledBg = shuffleArray([...allColors]);
            let shuffledText;

            // Keep shuffling text until NO color matches its background (derangement)
            let hasMatch = true;
            let attempts = 0;
            while (hasMatch && attempts < 100) {
                shuffledText = shuffleArray([...allColors]);
                hasMatch = shuffledBg.some((bg, i) => bg === shuffledText[i]);
                attempts++;
            }

            // Fallback: manually shift by 1 position if still matching
            if (hasMatch) {
                shuffledText = [...shuffledBg.slice(1), shuffledBg[0]];
            }

            const stroopButtons = shuffledBg.map((bgColor, i) => ({
                bgColor,
                textLabel: shuffledText[i]
            }));

            miniGameData.correctAnswer = correctColor;
            miniGameData.stroopButtons = shuffleArray(stroopButtons); // Randomize button positions
            miniGameData.options = allColors; // For compatibility
            break;

        case 'dodge':
            // Pick a random direction to dodge
            const direction = miniGameType.directions[Math.floor(Math.random() * miniGameType.directions.length)];
            const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
            miniGameData.showDirection = direction;
            miniGameData.correctAnswer = opposites[direction];
            miniGameData.options = ['up', 'down', 'left', 'right'];
            break;

        case 'lucky_symbol':
            // Pick one symbol to hide (the missing one)
            const allSymbols = [...miniGameType.symbols];
            const missingIndex = Math.floor(Math.random() * allSymbols.length);
            const missingSymbol = allSymbols[missingIndex];
            // Show 3 symbols, hide 1
            const visibleSymbols = allSymbols.filter((_, i) => i !== missingIndex);
            miniGameData.correctAnswer = missingSymbol;
            miniGameData.visibleSymbols = shuffleArray(visibleSymbols); // 3 symbols to show on TV
            miniGameData.options = shuffleArray(allSymbols); // All 4 for player to pick from
            break;

        case 'double_nothing':
            // Coin flip: testa (heads) or croce (tails)
            const coinResult = Math.random() < 0.5 ? 'testa' : 'croce';
            miniGameData.coinResult = coinResult;
            miniGameData.correctAnswer = coinResult;
            miniGameData.options = ['testa', 'croce'];
            break;

        case 'element_boost':
            // Show an element, player must click the one that BEATS it
            const elements = ['fire', 'water', 'earth', 'air'];
            const elementToBeat = elements[Math.floor(Math.random() * elements.length)];
            // What beats what: fire->air, air->earth, earth->water, water->fire
            const whatBeats = { fire: 'water', water: 'earth', earth: 'air', air: 'fire' };
            miniGameData.showElement = elementToBeat;
            miniGameData.correctAnswer = whatBeats[elementToBeat];
            miniGameData.options = elements;
            break;

        case 'chaos_target':
            // Reflex game - random delay before GO signal
            const delayMs = 1500 + Math.floor(Math.random() * 2000); // 1.5-3.5 seconds
            miniGameData.goDelay = delayMs;
            miniGameData.goTime = Date.now() + delayMs; // When GO will appear
            break;

        case 'memory_flash':
            // Memory game - show sequence, player must pick correct one
            const availableIcons = [...miniGameType.icons];

            // Generate correct sequence of 3 random icons
            const correctSequence = [];
            for (let i = 0; i < 3; i++) {
                correctSequence.push(availableIcons[Math.floor(Math.random() * availableIcons.length)]);
            }

            // Generate 3 wrong sequences (similar but different)
            const wrongSequences = [];
            for (let w = 0; w < 3; w++) {
                let wrongSeq;
                let attempts = 0;
                do {
                    wrongSeq = [];
                    for (let i = 0; i < 3; i++) {
                        wrongSeq.push(availableIcons[Math.floor(Math.random() * availableIcons.length)]);
                    }
                    attempts++;
                } while (wrongSeq.join('') === correctSequence.join('') && attempts < 50);
                wrongSequences.push(wrongSeq);
            }

            // Combine and shuffle options
            const allSequences = [correctSequence, ...wrongSequences];
            miniGameData.correctSequence = correctSequence;
            miniGameData.correctAnswer = correctSequence.join('');
            miniGameData.sequenceOptions = shuffleArray(allSequences);
            miniGameData.showDuration = 2500; // Show sequence for 2.5 seconds
            break;

        case 'turbo_runner':
            // Racing game - tap as fast as possible
            miniGameData.targetTaps = miniGameType.targetTaps;
            miniGameData.tapCounts = new Map(); // Will track taps per player
            break;

        case 'quick_opposites':
            // Quick opposites - 3 directions, must answer opposite each time
            const oppositeMap = { up: 'down', down: 'up', left: 'right', right: 'left' };
            const dirOptions = miniGameType.directions;
            const sequence = [];
            for (let i = 0; i < 3; i++) {
                const dir = dirOptions[Math.floor(Math.random() * dirOptions.length)];
                sequence.push({
                    show: dir,
                    correct: oppositeMap[dir]
                });
            }
            miniGameData.sequence = sequence;
            miniGameData.roundTime = miniGameType.roundTime;
            miniGameData.currentRound = 0;
            miniGameData.playerAnswers = new Map(); // socketId -> [answers]
            miniGameData.playerTimes = new Map(); // socketId -> total time
            break;
    }

    game.currentMiniGame = miniGameData;

    return miniGameData;
}

function submitMiniGameAnswer(pin, socketId, answer) {
    const game = games.get(pin);
    if (!game || game.phase !== 'minigame') return { error: 'Non in fase mini-gioco' };

    const player = game.players.get(socketId);
    if (!player || !player.isAlive) return { error: 'Giocatore non valido' };

    const miniGame = game.currentMiniGame;

    // Special handling for turbo_runner - allow multiple taps
    if (miniGame && miniGame.type === 'turbo_runner') {
        if (!miniGame.tapCounts) miniGame.tapCounts = new Map();

        const currentTaps = (miniGame.tapCounts.get(socketId) || 0) + 1;
        miniGame.tapCounts.set(socketId, currentTaps);

        // Check if player finished (reached target)
        const finished = currentTaps >= miniGame.targetTaps;
        if (finished && !game.miniGameAnswers.has(socketId)) {
            game.miniGameAnswers.set(socketId, {
                answer: currentTaps,
                time: Date.now()
            });
        }

        return {
            success: true,
            tapCount: currentTaps,
            finished,
            allAnswered: false // Race continues until timer
        };
    }

    // Special handling for quick_opposites - multiple answers
    if (miniGame && miniGame.type === 'quick_opposites') {
        if (!miniGame.playerAnswers) miniGame.playerAnswers = new Map();
        if (!miniGame.playerTimes) miniGame.playerTimes = new Map();

        const answers = miniGame.playerAnswers.get(socketId) || [];
        const currentRound = answers.length;

        // Check if already answered all 3
        if (currentRound >= 3) {
            return { error: 'Già risposto a tutte le direzioni' };
        }

        // Record this answer with time
        answers.push({
            answer: answer,
            time: Date.now(),
            correct: answer === miniGame.sequence[currentRound].correct
        });
        miniGame.playerAnswers.set(socketId, answers);

        // If all 3 answered, calculate total time and store final result
        if (answers.length >= 3) {
            const totalTime = answers[2].time - answers[0].time; // Time from first to last answer
            miniGame.playerTimes.set(socketId, totalTime);

            const allCorrect = answers.every(a => a.correct);
            const correctCount = answers.filter(a => a.correct).length;

            game.miniGameAnswers.set(socketId, {
                answer: answers,
                time: answers[0].time, // First answer time for ranking
                totalTime: totalTime,
                allCorrect: allCorrect,
                correctCount: correctCount
            });
        }

        return {
            success: true,
            round: currentRound + 1,
            isCorrect: answer === miniGame.sequence[currentRound].correct,
            finished: answers.length >= 3,
            allAnswered: false
        };
    }

    // Don't allow double submission for other games
    if (game.miniGameAnswers.has(socketId)) {
        return { error: 'Già risposto' };
    }

    game.miniGameAnswers.set(socketId, {
        answer,
        time: Date.now()
    });

    const alivePlayers = getAlivePlayers(game);
    const allAnswered = game.miniGameAnswers.size >= alivePlayers.length;

    return { success: true, allAnswered };
}

function resolveMiniGame(pin) {
    const game = games.get(pin);
    if (!game || !game.currentMiniGame) return null;

    const miniGame = game.currentMiniGame;
    const alivePlayers = getAlivePlayers(game);
    const results = [];

    // Evaluate each player's answer
    for (const player of alivePlayers) {
        const answer = game.miniGameAnswers.get(player.socketId);
        let score = 0;
        let isCorrect = false;
        let responseTime = answer ? answer.time : Infinity;

        if (answer) {
            switch (miniGame.type) {
                case 'color_touch':
                case 'dodge':
                case 'lucky_symbol':
                    isCorrect = answer.answer === miniGame.correctAnswer;
                    // Score based on correctness and speed
                    score = isCorrect ? (10000 - (responseTime % 10000)) : 0;
                    break;

                case 'double_nothing':
                    // Coin flip - check if guessed correctly
                    isCorrect = answer.answer === miniGame.coinResult;
                    score = isCorrect ? (10000 - (responseTime % 10000)) : 0;
                    break;

                case 'element_boost':
                    // Correct if they picked the element that beats the shown one
                    isCorrect = answer.answer === miniGame.correctAnswer;
                    score = isCorrect ? (10000 - (responseTime % 10000)) : 0;
                    break;

                case 'chaos_target':
                    // Reflex game - check if pressed after GO signal
                    const pressTime = answer.time;
                    const goTime = miniGame.goTime;
                    isCorrect = pressTime >= goTime; // Valid only if pressed after GO
                    if (isCorrect) {
                        // Score based on reaction time (lower is better)
                        score = 10000 - Math.min(pressTime - goTime, 9999);
                    } else {
                        score = -1; // Pressed too early = disqualified
                    }
                    break;

                case 'memory_flash':
                    // Memory game - check if sequence matches
                    isCorrect = answer.answer === miniGame.correctAnswer;
                    score = isCorrect ? (10000 - (responseTime % 10000)) : 0;
                    break;

                case 'turbo_runner':
                    // Racing game - score based on tap count and finish time
                    const tapCount = miniGame.tapCounts?.get(player.socketId) || 0;
                    const finished = tapCount >= miniGame.targetTaps;
                    isCorrect = finished; // "Correct" means finished the race
                    // Score: finished players score by speed (10000 - time), unfinished by tap count
                    if (finished) {
                        score = 20000 - (responseTime % 10000); // Finished players ranked higher
                    } else {
                        score = tapCount; // Unfinished ranked by tap count
                    }
                    break;

                case 'quick_opposites':
                    // Quick opposites - score based on correct answers and speed
                    const playerData = answer;
                    if (playerData && playerData.correctCount !== undefined) {
                        isCorrect = playerData.allCorrect;
                        // Score: all correct = 30000 - totalTime, partial = correctCount * 1000
                        if (playerData.allCorrect) {
                            score = 30000 - Math.min(playerData.totalTime || 0, 29000);
                        } else {
                            score = playerData.correctCount * 1000;
                        }
                    }
                    break;
            }
        }

        results.push({
            socketId: player.socketId,
            nickname: player.nickname,
            answer: answer?.answer || null,
            isCorrect,
            score,
            responseTime
        });
    }

    // Sort by score (highest first)
    results.sort((a, b) => b.score - a.score);

    // Assign ranks and bonuses
    const rankings = [];
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const rank = i + 1;
        let bonus = {};

        // Base focus boost for top 2 correct answers (applies to most games)
        const topPerformer = rank <= 2 && result.isCorrect;

        if (miniGame.type === 'double_nothing') {
            // Coin flip - correct guess wins, wrong guess loses
            if (result.isCorrect) {
                bonus = {
                    coinWon: true,
                    coinResult: miniGame.coinResult,
                    damageBonus: 0.25,  // +25% damage
                    focusBoost: 1       // +1 Focus for correct guess
                };
            } else {
                bonus = {
                    coinWon: false,
                    coinResult: miniGame.coinResult,
                    damageTaken: 20    // +20 damage taken
                };
            }
        } else if (miniGame.type === 'lucky_symbol') {
            // Lucky symbol gives shield + focus for correct
            if (result.isCorrect) {
                bonus = { shield: 0.3, focusBoost: topPerformer ? 1 : 0 };
            }
        } else if (miniGame.type === 'element_boost' && result.isCorrect) {
            // Correct element answer - faster = more bonus + focus
            if (rank === 1) {
                bonus = { damageBonus: 0.3, focusBoost: 1 }; // +30% damage + focus
            } else {
                bonus = { damageBonus: 0.15, focusBoost: rank === 2 ? 1 : 0 }; // +15% damage
            }
        } else if (miniGame.type === 'chaos_target') {
            // Reflex game - fastest valid reaction wins + focus
            if (rank === 1 && result.isCorrect) {
                bonus = { damageBonus: 0.3, reflexWin: true, focusBoost: 1 }; // +30% damage + focus
            } else if (rank === 2 && result.isCorrect) {
                bonus = { focusBoost: 1 }; // 2nd place gets focus
            } else if (!result.isCorrect) {
                bonus = { tooEarly: true, damageTaken: 15 }; // Pressed too early = penalty
            }
        } else if (miniGame.type === 'memory_flash') {
            // Memory game - correct = Focus boost + HP
            if (result.isCorrect) {
                bonus = { focusBoost: 1, healBoost: 10, memoryWin: true }; // +1 Focus + 10 HP
            }
        } else if (miniGame.type === 'turbo_runner') {
            // Racing game - winner deals 10 damage to left neighbor
            if (rank === 1 && result.isCorrect) {
                bonus = { racerWin: true, extraDamageLeft: 10, focusBoost: 1 }; // Winner: 10 damage to left + focus
            } else if (rank === 2 && result.isCorrect) {
                bonus = { focusBoost: 1 }; // 2nd place gets focus
            }
        } else if (miniGame.type === 'quick_opposites') {
            // Quick opposites - winner deals 10 damage to ALL others
            if (rank === 1 && result.isCorrect) {
                bonus = { oppositesWin: true, damageToAll: 10, focusBoost: 1 }; // Winner: 10 damage to all + focus
            } else if (rank === 2 && result.isCorrect) {
                bonus = { focusBoost: 1 }; // 2nd place gets focus
            }
        } else {
            // Standard ranking bonuses (color_touch, dodge, etc.)
            if (rank === 1 && result.isCorrect) {
                bonus = { damageBonus: 0.3, focusBoost: 1 }; // +30% damage + focus
            } else if (rank === 2 && result.isCorrect) {
                bonus = { priority: true, focusBoost: 1 }; // Priority + focus
            } else if (rank === results.length && !result.isCorrect) {
                bonus = { damageTaken: 10 }; // Last place penalty
            }
        }

        // Last place always loses 5 HP (applies to all mini-games)
        if (rank === results.length) {
            bonus.hpLoss = 5;
            bonus.isLast = true;
        }

        game.turnBonuses.set(result.socketId, bonus);
        game.miniGameResults.set(result.socketId, { rank, bonus, isCorrect: result.isCorrect });

        rankings.push({
            socketId: result.socketId,
            nickname: result.nickname,
            rank,
            isCorrect: result.isCorrect,
            bonus
        });
    }

    game.phase = 'action';

    return {
        miniGameType: miniGame.type,
        miniGameName: miniGame.name,
        correctAnswer: miniGame.correctAnswer,
        rankings
    };
}

function getTurnBonus(pin, socketId) {
    const game = games.get(pin);
    if (!game) return {};
    return game.turnBonuses.get(socketId) || {};
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function allMiniGameAnswered(pin) {
    const game = games.get(pin);
    if (!game) return false;

    const alivePlayers = getAlivePlayers(game);
    return game.miniGameAnswers.size >= alivePlayers.length;
}

module.exports = {
    createGame,
    getGame,
    joinGame,
    getPlayers,
    startGame,
    getNeighbors,
    shufflePositions,
    submitAction,
    resolveRound,
    getPlayerState,
    getPlayersStatus,
    endGame,
    deleteGame,
    leaveGame,
    allActionsReceived,
    decrementMatchTime,
    voteExit,
    getAlivePlayers,
    ELEMENT_ICONS,
    ELEMENT_ADVANTAGE,
    // Mini-game functions
    startMiniGame,
    submitMiniGameAnswer,
    resolveMiniGame,
    getTurnBonus,
    allMiniGameAnswered,
    MINI_GAMES
};
