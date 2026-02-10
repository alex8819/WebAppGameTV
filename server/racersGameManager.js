// Micro Racers Game Manager

const games = new Map();

// Car colors for players
const CAR_COLORS = [
    '#e74c3c', // rosso
    '#3498db', // blu
    '#2ecc71', // verde
    '#f1c40f', // giallo
    '#9b59b6', // viola
    '#e67e22', // arancione
    '#1abc9c', // turchese
    '#34495e'  // grigio scuro
];

// Power-up types
const POWERUPS = {
    BOOST: {
        id: 'boost',
        name: 'Turbo',
        icon: '🚀',
        duration: 2000,
        effect: { speedMultiplier: 1.5 }
    },
    OIL: {
        id: 'oil',
        name: 'Olio',
        icon: '🛢️',
        duration: 3000,
        effect: { slowMultiplier: 0.3 }
    },
    MISSILE: {
        id: 'missile',
        name: 'Missile',
        icon: '🎯',
        duration: 0,
        effect: { stunDuration: 1500 }
    }
};

// Physics constants
const PHYSICS = {
    maxSpeed: 8,
    acceleration: 0.3,
    brakeForce: 0.5,
    friction: 0.02,
    steeringSensitivity: 0.08,
    wallBounce: 0.3,
    trackWidth: 100
};

// Max race duration in ms (2 minutes)
const MAX_RACE_TIME = 120000;

// Track constants for oval
const TRACK = {
    centerX: 400,
    centerY: 300,
    radiusX: 280,  // Horizontal radius
    radiusY: 200,  // Vertical radius
    trackWidth: 80,
    numCheckpoints: 12
};

function generatePin() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

// Generate an oval track
function generateTrack() {
    const { centerX, centerY, radiusX, radiusY, trackWidth, numCheckpoints } = TRACK;

    // Generate checkpoints around the oval (COUNTER-CLOCKWISE, starting from right)
    // Counter-clockwise is more natural (like real racing)
    const checkpoints = [];
    for (let i = 0; i < numCheckpoints; i++) {
        // Start from right (angle = 0) and go counter-clockwise (negative direction)
        const angle = 0 - (i * 2 * Math.PI / numCheckpoints);
        const x = centerX + Math.cos(angle) * radiusX;
        const y = centerY + Math.sin(angle) * radiusY;

        // Tangent angle for counter-clockwise travel
        const tangentAngle = angle - Math.PI / 2;

        checkpoints.push({
            id: i,
            x: x,
            y: y,
            angle: tangentAngle,
            width: trackWidth
        });
    }

    // Generate power-up spawn points (4 spots around the track)
    const powerupSpawns = [];
    const powerupAngles = [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4];
    for (const angle of powerupAngles) {
        const x = centerX + Math.cos(angle) * radiusX;
        const y = centerY + Math.sin(angle) * radiusY;
        powerupSpawns.push({
            x: x,
            y: y,
            active: true,
            type: null
        });
    }

    // Start line on the RIGHT side of oval (vertical line)
    const startLine = {
        x: centerX + radiusX,
        y: centerY,
        angle: -Math.PI / 2  // Pointing up (counter-clockwise start)
    };

    return {
        type: 'oval',
        centerX,
        centerY,
        radiusX,
        radiusY,
        trackWidth,
        checkpoints,
        powerupSpawns,
        startLine,
        direction: 'counter-clockwise'
    };
}

function createGame(hostSocketId) {
    let pin;
    do {
        pin = generatePin();
    } while (games.has(pin));

    const track = generateTrack();

    const game = {
        pin,
        hostSocketId,
        players: new Map(),
        status: 'lobby', // lobby, countdown, racing, finished
        track,
        totalLaps: 3,
        countdown: 3,
        raceStartTime: null,
        gameLoop: null,
        powerupsOnTrack: [],
        hazards: [], // Oil slicks, etc.
        finishOrder: []
    };

    games.set(pin, game);
    return { pin, gameId: pin, track };
}

function getGame(pin) {
    return games.get(pin);
}

function joinGame(pin, nickname, socketId) {
    const game = games.get(pin);
    if (!game) {
        return { error: 'Gara non trovata' };
    }

    if (game.status !== 'lobby') {
        return { error: 'La gara è già iniziata' };
    }

    if (game.players.size >= 8) {
        return { error: 'Gara piena (max 8 piloti)' };
    }

    // Check for duplicate nickname
    for (const [, player] of game.players) {
        if (player.nickname.toLowerCase() === nickname.toLowerCase()) {
            return { error: 'Nome già in uso' };
        }
    }

    const playerIndex = game.players.size;
    const startPos = getStartPosition(game.track, playerIndex);

    const player = {
        socketId,
        nickname,
        color: CAR_COLORS[playerIndex],
        carIndex: playerIndex,
        // Position and physics
        x: startPos.x,
        y: startPos.y,
        angle: game.track.startLine.angle,
        speed: 0,
        // Input state
        steering: 0, // -1 to 1 (from device tilt)
        accelerating: false,
        braking: false,
        // Race state
        lap: 0,
        nextCheckpoint: 0,
        lastCheckpointTime: 0,
        finished: false,
        finishTime: null,
        finishPosition: null,
        // Power-ups
        powerup: null,
        activeEffects: [], // { type, endTime }
        // Stats
        topSpeed: 0,
        powerupsUsed: 0,
        collisions: 0
    };

    game.players.set(socketId, player);

    return { player, track: game.track };
}

function getStartPosition(track, playerIndex) {
    // Position cars on the right side of the oval (start line is vertical)
    // Cars line up vertically, slightly behind the start line
    const offsetY = (playerIndex - 2) * 35; // Spread vertically
    const offsetX = Math.floor(playerIndex / 4) * 40; // Two columns if many players

    return {
        x: track.startLine.x - 30 - offsetX, // Behind start line (to the left)
        y: track.startLine.y + offsetY
    };
}

function getPlayers(pin) {
    const game = games.get(pin);
    if (!game) return [];

    return Array.from(game.players.values()).map(p => ({
        socketId: p.socketId,
        nickname: p.nickname,
        color: p.color,
        carIndex: p.carIndex
    }));
}

function startCountdown(pin) {
    const game = games.get(pin);
    if (!game) return { error: 'Gara non trovata' };

    if (game.players.size < 1) {
        return { error: 'Servono almeno 1 pilota' };
    }

    game.status = 'countdown';
    game.countdown = 3;

    // Spawn all power-ups at race start
    spawnPowerups(game, true);

    return { success: true, countdown: game.countdown };
}

function startRace(pin) {
    const game = games.get(pin);
    if (!game) return { error: 'Gara non trovata' };

    game.status = 'racing';
    game.raceStartTime = Date.now();

    // Set all players to lap 1
    for (const player of game.players.values()) {
        player.lap = 1;
        player.lastCheckpointTime = Date.now();
    }

    return { success: true };
}

function updatePlayerInput(pin, socketId, input) {
    const game = games.get(pin);
    if (!game || game.status !== 'racing') return null;

    const player = game.players.get(socketId);
    if (!player || player.finished) return null;

    // Update steering from device tilt (-1 to 1)
    if (input.steering !== undefined) {
        player.steering = Math.max(-1, Math.min(1, input.steering));
    }

    // Update acceleration/brake from touch
    if (input.accelerating !== undefined) {
        player.accelerating = input.accelerating;
    }
    if (input.braking !== undefined) {
        player.braking = input.braking;
    }

    return { success: true };
}

function usePowerup(pin, socketId) {
    const game = games.get(pin);
    if (!game || game.status !== 'racing') return null;

    const player = game.players.get(socketId);
    if (!player || !player.powerup || player.finished) return null;

    const powerup = player.powerup;
    player.powerup = null;
    player.powerupsUsed++;

    const result = { type: powerup.id, user: player.nickname };

    switch (powerup.id) {
        case 'boost':
            player.activeEffects.push({
                type: 'boost',
                endTime: Date.now() + powerup.duration
            });
            result.effect = 'speed_boost';
            break;

        case 'oil':
            // Drop oil slick behind player
            const oilX = player.x - Math.cos(player.angle) * 40;
            const oilY = player.y + Math.sin(player.angle) * 40;
            game.hazards.push({
                type: 'oil',
                x: oilX,
                y: oilY,
                radius: 30,
                createdAt: Date.now(),
                duration: 8000,
                createdBy: socketId
            });
            result.effect = 'oil_dropped';
            result.position = { x: oilX, y: oilY };
            break;

        case 'missile':
            // Find player ahead
            const targetPlayer = findPlayerAhead(game, player);
            if (targetPlayer) {
                targetPlayer.activeEffects.push({
                    type: 'stun',
                    endTime: Date.now() + powerup.effect.stunDuration
                });
                targetPlayer.speed *= 0.3; // Slow down when hit
                result.effect = 'missile_hit';
                result.target = targetPlayer.nickname;
            } else {
                result.effect = 'missile_miss';
            }
            break;
    }

    return result;
}

function findPlayerAhead(game, currentPlayer) {
    let closestAhead = null;
    let minDistance = Infinity;

    for (const [, player] of game.players) {
        if (player.socketId === currentPlayer.socketId || player.finished) continue;

        // Check if ahead (more laps or more checkpoints)
        const isAhead = player.lap > currentPlayer.lap ||
            (player.lap === currentPlayer.lap && player.nextCheckpoint > currentPlayer.nextCheckpoint);

        if (isAhead) {
            const dx = player.x - currentPlayer.x;
            const dy = player.y - currentPlayer.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < minDistance && dist < 500) { // Max range 500
                minDistance = dist;
                closestAhead = player;
            }
        }
    }

    return closestAhead;
}

function updateGameState(pin) {
    const game = games.get(pin);
    if (!game || game.status !== 'racing') return null;

    const now = Date.now();

    // Update each player
    for (const player of game.players.values()) {
        if (player.finished) continue;

        // Check active effects
        player.activeEffects = player.activeEffects.filter(e => e.endTime > now);

        const hasBoost = player.activeEffects.some(e => e.type === 'boost');
        const isStunned = player.activeEffects.some(e => e.type === 'stun');
        const onOil = player.activeEffects.some(e => e.type === 'oil_slip');

        // Apply physics
        if (!isStunned) {
            // Acceleration
            if (player.accelerating) {
                const accel = hasBoost ? PHYSICS.acceleration * 1.5 : PHYSICS.acceleration;
                player.speed += accel;
            }

            // Braking
            if (player.braking) {
                player.speed -= PHYSICS.brakeForce;
            }

            // Steering (reduced on oil)
            const steerMult = onOil ? 0.3 : 1;
            player.angle += player.steering * PHYSICS.steeringSensitivity * steerMult;
        }

        // Friction
        player.speed *= (1 - PHYSICS.friction);

        // Speed limits
        const maxSpd = hasBoost ? PHYSICS.maxSpeed * 1.5 : PHYSICS.maxSpeed;
        player.speed = Math.max(0, Math.min(maxSpd, player.speed));

        // Update position
        player.x += Math.cos(player.angle) * player.speed;
        player.y -= Math.sin(player.angle) * player.speed;

        // Track top speed
        if (player.speed > player.topSpeed) {
            player.topSpeed = player.speed;
        }

        // Check checkpoint crossing
        checkCheckpoints(game, player);

        // Check power-up pickup
        checkPowerupPickup(game, player);

        // Check hazard collision
        checkHazards(game, player, now);

        // Basic track bounds (simplified)
        keepOnTrack(game, player);
    }

    // Remove expired hazards
    game.hazards = game.hazards.filter(h => now - h.createdAt < h.duration);

    // Respawn power-ups periodically
    if (Math.random() < 0.01) { // ~1% chance per update
        spawnPowerups(game);
    }

    // Check if race is over
    const allFinished = Array.from(game.players.values()).every(p => p.finished);
    const raceTime = now - game.raceStartTime;
    const timeExpired = raceTime >= MAX_RACE_TIME;

    if ((allFinished || timeExpired) && game.players.size > 0) {
        // Mark remaining players as DNF
        if (timeExpired) {
            for (const player of game.players.values()) {
                if (!player.finished) {
                    player.finished = true;
                    player.finishTime = null; // DNF
                    player.finishPosition = game.finishOrder.length + 1;
                    game.finishOrder.push(player.socketId);
                }
            }
        }
        game.status = 'finished';
    }

    return getGameState(pin);
}

function checkCheckpoints(game, player) {
    const checkpoint = game.track.checkpoints[player.nextCheckpoint];
    if (!checkpoint) return;

    const dx = player.x - checkpoint.x;
    const dy = player.y - checkpoint.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < checkpoint.width) {
        player.lastCheckpointTime = Date.now();
        player.nextCheckpoint++;

        // Completed a lap
        if (player.nextCheckpoint >= game.track.checkpoints.length) {
            player.nextCheckpoint = 0;
            player.lap++;

            // Check if finished race
            if (player.lap > game.totalLaps) {
                player.finished = true;
                player.finishTime = Date.now() - game.raceStartTime;
                player.finishPosition = game.finishOrder.length + 1;
                game.finishOrder.push(player.socketId);
            }
        }
    }
}

function checkPowerupPickup(game, player) {
    if (player.powerup) {
        // Already has powerup - log to verify
        return;
    }

    for (const spawn of game.track.powerupSpawns) {
        if (!spawn.active || !spawn.type) continue;

        const dx = player.x - spawn.x;
        const dy = player.y - spawn.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Debug: log when player is close to a powerup
        if (dist < 60) {
            console.log(`${player.nickname} near powerup at dist ${dist.toFixed(1)} (need < 30)`);
        }

        if (dist < 30) {
            const powerupType = POWERUPS[spawn.type];
            if (!powerupType) {
                spawn.active = false;
                spawn.type = null;
                return;
            }

            const now = Date.now();
            console.log(`${player.nickname} picked up ${powerupType.name} - activating immediately!`);

            // Apply powerup effect immediately
            switch (powerupType.id) {
                case 'boost':
                    // Speed boost for 3 seconds
                    player.activeEffects.push({
                        type: 'boost',
                        endTime: now + 3000
                    });
                    break;

                case 'oil':
                    // Drop oil slick behind player
                    const oilX = player.x - Math.cos(player.angle) * 50;
                    const oilY = player.y + Math.sin(player.angle) * 50;
                    game.hazards.push({
                        type: 'oil',
                        x: oilX,
                        y: oilY,
                        radius: 35,
                        createdAt: now,
                        duration: 10000,
                        createdBy: player.socketId
                    });
                    break;

                case 'missile':
                    // Find and hit player ahead
                    const targetPlayer = findPlayerAhead(game, player);
                    if (targetPlayer) {
                        targetPlayer.activeEffects.push({
                            type: 'stun',
                            endTime: now + 2000
                        });
                        targetPlayer.speed *= 0.2;
                        console.log(`${player.nickname} hit ${targetPlayer.nickname} with missile!`);
                    }
                    break;
            }

            player.powerupsUsed++;
            spawn.active = false;
            spawn.type = null;

            // Respawn after delay
            setTimeout(() => {
                spawn.active = true;
                spawn.type = getRandomPowerupType();
            }, 5000);

            return;
        }
    }
}

function checkHazards(game, player, now) {
    for (const hazard of game.hazards) {
        const dx = player.x - hazard.x;
        const dy = player.y - hazard.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < hazard.radius && hazard.createdBy !== player.socketId) {
            if (hazard.type === 'oil') {
                // Add oil slip effect if not already affected
                if (!player.activeEffects.some(e => e.type === 'oil_slip')) {
                    player.activeEffects.push({
                        type: 'oil_slip',
                        endTime: now + 2000
                    });
                    player.speed *= 0.5;
                }
            }
        }
    }
}

function keepOnTrack(game, player) {
    const track = game.track;
    const { centerX, centerY, radiusX, radiusY, trackWidth } = track;

    // Calculate normalized distance from center (ellipse equation)
    const dx = player.x - centerX;
    const dy = player.y - centerY;

    // Distance ratio for ellipse (1.0 = on the ellipse center line)
    const distRatio = Math.sqrt((dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY));

    // Track boundaries (inner and outer edges)
    const halfWidth = trackWidth / 2;
    const innerRatio = (radiusX - halfWidth) / radiusX;
    const outerRatio = (radiusX + halfWidth) / radiusX;

    // Check if outside track bounds
    if (distRatio < innerRatio || distRatio > outerRatio) {
        // Push back onto track
        const targetRatio = distRatio < innerRatio ? innerRatio : outerRatio;
        const correction = targetRatio / distRatio;

        player.x = centerX + dx * correction;
        player.y = centerY + dy * correction;
        player.speed *= PHYSICS.wallBounce;
        player.collisions++;
    }
}

function spawnPowerups(game, forceAll = false) {
    for (const spawn of game.track.powerupSpawns) {
        if (!spawn.active || spawn.type) continue;

        // Force spawn all at race start, or 50% chance during race
        if (forceAll || Math.random() < 0.5) {
            spawn.type = getRandomPowerupType();
            console.log(`Spawned powerup: ${spawn.type} at (${spawn.x.toFixed(0)}, ${spawn.y.toFixed(0)})`);
        }
    }
}

function getRandomPowerupType() {
    const types = Object.keys(POWERUPS);
    return types[Math.floor(Math.random() * types.length)];
}

function getGameState(pin) {
    const game = games.get(pin);
    if (!game) return null;

    const players = Array.from(game.players.values()).map(p => ({
        socketId: p.socketId,
        nickname: p.nickname,
        color: p.color,
        x: p.x,
        y: p.y,
        angle: p.angle,
        speed: p.speed,
        lap: p.lap,
        nextCheckpoint: p.nextCheckpoint,
        finished: p.finished,
        finishPosition: p.finishPosition,
        powerup: p.powerup ? p.powerup.id : null,
        hasBoost: p.activeEffects.some(e => e.type === 'boost'),
        isStunned: p.activeEffects.some(e => e.type === 'stun'),
        onOil: p.activeEffects.some(e => e.type === 'oil_slip')
    }));

    // Sort by position (lap, checkpoint)
    players.sort((a, b) => {
        if (a.finished && !b.finished) return -1;
        if (!a.finished && b.finished) return 1;
        if (a.finished && b.finished) return a.finishPosition - b.finishPosition;
        if (a.lap !== b.lap) return b.lap - a.lap;
        return b.nextCheckpoint - a.nextCheckpoint;
    });

    // Add current position
    players.forEach((p, i) => {
        p.position = i + 1;
    });

    return {
        status: game.status,
        totalLaps: game.totalLaps,
        players,
        powerups: game.track.powerupSpawns.filter(s => s.active && s.type).map(s => ({
            x: s.x,
            y: s.y,
            type: s.type,
            icon: POWERUPS[s.type].icon
        })),
        hazards: game.hazards.map(h => ({
            type: h.type,
            x: h.x,
            y: h.y,
            radius: h.radius
        })),
        raceTime: game.raceStartTime ? Date.now() - game.raceStartTime : 0
    };
}

function getPlayerState(pin, socketId) {
    const game = games.get(pin);
    if (!game) return null;

    const player = game.players.get(socketId);
    if (!player) return null;

    // Calculate current race position
    const allPlayers = Array.from(game.players.values());
    allPlayers.sort((a, b) => {
        if (a.finished && !b.finished) return -1;
        if (!a.finished && b.finished) return 1;
        if (a.finished && b.finished) return a.finishPosition - b.finishPosition;
        if (a.lap !== b.lap) return b.lap - a.lap;
        return b.nextCheckpoint - a.nextCheckpoint;
    });
    const position = allPlayers.findIndex(p => p.socketId === socketId) + 1;

    return {
        x: player.x,
        y: player.y,
        angle: player.angle,
        speed: player.speed,
        lap: player.lap,
        totalLaps: game.totalLaps,
        nextCheckpoint: player.nextCheckpoint,
        position: position,
        finished: player.finished,
        finishPosition: player.finishPosition,
        finishTime: player.finishTime,
        hasBoost: player.activeEffects.some(e => e.type === 'boost'),
        isStunned: player.activeEffects.some(e => e.type === 'stun'),
        onOil: player.activeEffects.some(e => e.type === 'oil_slip')
    };
}

function getRaceResults(pin) {
    const game = games.get(pin);
    if (!game) return null;

    const results = Array.from(game.players.values())
        .sort((a, b) => {
            if (a.finished && !b.finished) return -1;
            if (!a.finished && b.finished) return 1;
            if (a.finished && b.finished) return a.finishPosition - b.finishPosition;
            // Not finished - sort by progress
            if (a.lap !== b.lap) return b.lap - a.lap;
            return b.nextCheckpoint - a.nextCheckpoint;
        })
        .map((p, index) => ({
            position: index + 1,
            socketId: p.socketId,
            nickname: p.nickname,
            color: p.color,
            finished: p.finished,
            finishTime: p.finishTime,
            lap: p.lap,
            stats: {
                topSpeed: Math.round(p.topSpeed * 10),
                powerupsUsed: p.powerupsUsed,
                collisions: p.collisions
            }
        }));

    return { results };
}

function deleteGame(pin) {
    const game = games.get(pin);
    if (game) {
        if (game.gameLoop) clearInterval(game.gameLoop);
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

module.exports = {
    createGame,
    getGame,
    joinGame,
    getPlayers,
    startCountdown,
    startRace,
    updatePlayerInput,
    usePowerup,
    updateGameState,
    getGameState,
    getPlayerState,
    getRaceResults,
    deleteGame,
    leaveGame,
    POWERUPS,
    CAR_COLORS
};
