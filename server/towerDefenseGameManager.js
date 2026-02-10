/**
 * Tower Defense Game Manager - Citadel Guardians
 * Cooperative tower defense with alternating player zones
 */

const games = new Map();

// Tower configurations
const TOWER_TYPES = {
    sentinel: {
        name: 'Sentinel',
        emoji: '🏹',
        type: 'archer',
        baseCost: 100,
        upgradeCost: [0, 75, 150],
        sellRefund: 0.6,
        stats: [
            { damage: 15, fireRate: 500, range: 120 },
            { damage: 22, fireRate: 400, range: 140 },
            { damage: 35, fireRate: 300, range: 160 }
        ]
    },
    arcane: {
        name: 'Arcane Spire',
        emoji: '🔮',
        type: 'mage',
        baseCost: 150,
        upgradeCost: [0, 100, 200],
        sellRefund: 0.6,
        splashRadius: [50, 70, 90],
        stats: [
            { damage: 25, fireRate: 2000, range: 100 },
            { damage: 40, fireRate: 1800, range: 120 },
            { damage: 60, fireRate: 1500, range: 140 }
        ]
    },
    barracks: {
        name: 'Vanguard Post',
        emoji: '⚔️',
        type: 'barracks',
        baseCost: 125,
        upgradeCost: [0, 80, 160],
        sellRefund: 0.6,
        unitCount: [2, 3, 4],
        unitStats: [
            { hp: 50, damage: 8, blockTime: 3000 },
            { hp: 80, damage: 12, blockTime: 4000 },
            { hp: 120, damage: 18, blockTime: 5000 }
        ],
        stats: [
            { damage: 0, fireRate: 0, range: 80 },
            { damage: 0, fireRate: 0, range: 100 },
            { damage: 0, fireRate: 0, range: 120 }
        ]
    },
    cannon: {
        name: 'Thunder Cannon',
        emoji: '💥',
        type: 'artillery',
        baseCost: 200,
        upgradeCost: [0, 150, 300],
        sellRefund: 0.6,
        stats: [
            { damage: 80, fireRate: 4000, range: 180 },
            { damage: 130, fireRate: 3500, range: 200 },
            { damage: 200, fireRate: 3000, range: 220 }
        ]
    }
};

// Enemy configurations
const ENEMY_TYPES = {
    grunt: {
        name: 'Grunt',
        emoji: '👹',
        hp: 100,
        speed: 1.5,
        gold: 5,
        damage: 10,
        armor: 0
    },
    runner: {
        name: 'Runner',
        emoji: '🏃',
        hp: 60,
        speed: 3,
        gold: 3,
        damage: 5,
        armor: 0
    },
    tank: {
        name: 'Brute',
        emoji: '🦍',
        hp: 400,
        speed: 0.8,
        gold: 15,
        damage: 25,
        armor: 5
    },
    boss: {
        name: 'Overlord',
        emoji: '👑',
        hp: 1500,
        speed: 1,
        gold: 100,
        damage: 50,
        armor: 10
    }
};

// Wave configurations
const WAVE_CONFIG = {
    1: { enemies: [{ type: 'grunt', count: 5 }], spawnDelay: 1500 },
    2: { enemies: [{ type: 'grunt', count: 8 }], spawnDelay: 1400 },
    3: { enemies: [{ type: 'grunt', count: 6 }, { type: 'runner', count: 4 }], spawnDelay: 1300 },
    4: { enemies: [{ type: 'runner', count: 8 }, { type: 'grunt', count: 4 }], spawnDelay: 1200 },
    5: { enemies: [{ type: 'tank', count: 2 }, { type: 'grunt', count: 8 }], spawnDelay: 1100 },
    6: { enemies: [{ type: 'grunt', count: 10 }, { type: 'runner', count: 6 }], spawnDelay: 1000 },
    7: { enemies: [{ type: 'tank', count: 4 }, { type: 'runner', count: 8 }], spawnDelay: 900 },
    8: { enemies: [{ type: 'grunt', count: 12 }, { type: 'tank', count: 3 }, { type: 'runner', count: 6 }], spawnDelay: 800 },
    9: { enemies: [{ type: 'tank', count: 6 }, { type: 'runner', count: 10 }], spawnDelay: 700 },
    10: { enemies: [{ type: 'boss', count: 1 }, { type: 'tank', count: 4 }, { type: 'grunt', count: 10 }], spawnDelay: 600 }
};

// Economy settings
const ECONOMY = {
    startingGold: 200,
    waveBonus: 50,
    baseHP: 100
};

// Zone colors
const ZONE_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b'];

// Generate unique PIN
function generatePin() {
    let pin;
    do {
        pin = Math.floor(1000 + Math.random() * 9000).toString();
    } while (games.has(pin));
    return pin;
}

// Generate map based on player count
function generateMap(playerCount) {
    const segments = 8;
    const slotsPerSegment = 3;
    const canvasWidth = 800;
    const canvasHeight = 600;
    const margin = 60;

    const path = [];
    const towerSlots = [];
    let slotId = 0;

    // Generate serpentine path
    const segmentHeight = (canvasHeight - margin * 2) / segments;

    for (let i = 0; i <= segments; i++) {
        const y = margin + i * segmentHeight;
        const x = (i % 2 === 0) ? margin : canvasWidth - margin;
        path.push({ x, y, segmentIndex: i });

        // Add intermediate point for smoother path
        if (i < segments) {
            const nextX = ((i + 1) % 2 === 0) ? margin : canvasWidth - margin;
            const midY = y + segmentHeight / 2;
            path.push({ x, y: midY, segmentIndex: i });
            path.push({ x: nextX, y: midY, segmentIndex: i });
        }
    }

    // Generate tower slots for each segment
    for (let i = 0; i < segments; i++) {
        const zoneOwnerIndex = i % playerCount;
        const y = margin + i * segmentHeight + segmentHeight / 2;
        const isLeftSide = (i % 2 === 0);

        for (let j = 0; j < slotsPerSegment; j++) {
            // Position slots along the segment
            const slotSpacing = (canvasWidth - margin * 4) / (slotsPerSegment + 1);
            let x;

            if (isLeftSide) {
                x = margin * 2 + slotSpacing * (j + 1);
            } else {
                x = canvasWidth - margin * 2 - slotSpacing * (j + 1);
            }

            towerSlots.push({
                id: slotId++,
                x,
                y: y + (j - 1) * 30,
                segmentIndex: i,
                zoneOwnerIndex,
                zoneColor: ZONE_COLORS[zoneOwnerIndex],
                tower: null
            });
        }
    }

    return {
        playerCount,
        segments,
        path,
        towerSlots,
        canvasWidth,
        canvasHeight,
        spawnPoint: path[0],
        basePoint: path[path.length - 1]
    };
}

// Create new game
function createGame(hostSocketId) {
    const pin = generatePin();

    const game = {
        pin,
        hostSocketId,
        status: 'lobby', // lobby, building, wave, paused, gameover, victory
        createdAt: Date.now(),

        map: null,
        baseHP: ECONOMY.baseHP,

        players: new Map(),

        wave: {
            currentWave: 0,
            maxWaves: 10,
            enemies: [],
            spawnQueue: [],
            spawnTimer: null,
            readyVotes: new Set()
        },

        towers: new Map(),
        projectiles: [],

        gameLoopInterval: null,
        lastUpdate: Date.now()
    };

    games.set(pin, game);
    return { pin };
}

// Join game
function joinGame(pin, nickname, socketId, avatar = '🛡️') {
    const game = games.get(pin);

    if (!game) {
        return { error: 'Partita non trovata' };
    }

    if (game.status !== 'lobby') {
        return { error: 'Partita già iniziata' };
    }

    if (game.players.size >= 4) {
        return { error: 'Partita piena (max 4 giocatori)' };
    }

    // Check duplicate nickname
    for (const player of game.players.values()) {
        if (player.nickname.toLowerCase() === nickname.toLowerCase()) {
            return { error: 'Nome già in uso' };
        }
    }

    const zoneIndex = game.players.size;

    const player = {
        socketId,
        nickname,
        avatar,
        zoneIndex,
        zoneColor: ZONE_COLORS[zoneIndex],
        gold: ECONOMY.startingGold,
        totalKills: 0,
        totalDamage: 0,
        towersBuilt: 0,
        isReady: false
    };

    game.players.set(socketId, player);

    return { success: true, player, players: getPlayersArray(pin) };
}

// Get players as array
function getPlayersArray(pin) {
    const game = games.get(pin);
    if (!game) return [];
    return Array.from(game.players.values());
}

// Start game
function startGame(pin) {
    const game = games.get(pin);

    if (!game) {
        return { error: 'Partita non trovata' };
    }

    if (game.players.size < 1) {
        return { error: 'Servono almeno 1 giocatore' };
    }

    // Generate map based on player count
    game.map = generateMap(game.players.size);

    // Reassign zones based on final player count
    let zoneIndex = 0;
    for (const player of game.players.values()) {
        player.zoneIndex = zoneIndex;
        player.zoneColor = ZONE_COLORS[zoneIndex];
        zoneIndex++;
    }

    // Update tower slots with correct zone owners
    for (const slot of game.map.towerSlots) {
        slot.zoneOwnerIndex = slot.segmentIndex % game.players.size;
        slot.zoneColor = ZONE_COLORS[slot.zoneOwnerIndex];
    }

    game.status = 'building';
    game.wave.currentWave = 0;

    return {
        success: true,
        map: game.map,
        players: getPlayersArray(pin)
    };
}

// Get player's zone slots
function getPlayerZoneSlots(pin, socketId) {
    const game = games.get(pin);
    if (!game || !game.map) return [];

    const player = game.players.get(socketId);
    if (!player) return [];

    return game.map.towerSlots.filter(slot => slot.zoneOwnerIndex === player.zoneIndex);
}

// Place tower
function placeTower(pin, socketId, slotId, towerType) {
    const game = games.get(pin);

    if (!game) {
        return { error: 'Partita non trovata' };
    }

    if (game.status !== 'building') {
        return { error: 'Non puoi costruire ora' };
    }

    const player = game.players.get(socketId);
    if (!player) {
        return { error: 'Giocatore non trovato' };
    }

    const slot = game.map.towerSlots.find(s => s.id === slotId);
    if (!slot) {
        return { error: 'Slot non trovato' };
    }

    // Check zone ownership
    if (slot.zoneOwnerIndex !== player.zoneIndex) {
        return { error: 'Non puoi costruire in questa zona' };
    }

    // Check if slot is empty
    if (slot.tower) {
        return { error: 'Slot già occupato' };
    }

    const towerConfig = TOWER_TYPES[towerType];
    if (!towerConfig) {
        return { error: 'Tipo torretta non valido' };
    }

    // Check gold
    if (player.gold < towerConfig.baseCost) {
        return { error: 'Oro insufficiente' };
    }

    // Deduct gold
    player.gold -= towerConfig.baseCost;
    player.towersBuilt++;

    // Create tower
    const tower = {
        id: `tower_${slotId}`,
        slotId,
        type: towerType,
        level: 1,
        ownerSocketId: socketId,
        ownerNickname: player.nickname,
        x: slot.x,
        y: slot.y,
        stats: { ...towerConfig.stats[0] },
        lastFired: 0,
        spawnedUnits: [],
        totalSpent: towerConfig.baseCost
    };

    slot.tower = tower;
    game.towers.set(slotId, tower);

    return {
        success: true,
        tower,
        player: {
            socketId: player.socketId,
            gold: player.gold
        }
    };
}

// Upgrade tower
function upgradeTower(pin, socketId, slotId) {
    const game = games.get(pin);

    if (!game) {
        return { error: 'Partita non trovata' };
    }

    if (game.status !== 'building') {
        return { error: 'Non puoi potenziare ora' };
    }

    const player = game.players.get(socketId);
    if (!player) {
        return { error: 'Giocatore non trovato' };
    }

    const slot = game.map.towerSlots.find(s => s.id === slotId);
    if (!slot || !slot.tower) {
        return { error: 'Torretta non trovata' };
    }

    const tower = slot.tower;

    // Check ownership
    if (tower.ownerSocketId !== socketId) {
        return { error: 'Non è la tua torretta' };
    }

    // Check max level
    if (tower.level >= 3) {
        return { error: 'Livello massimo raggiunto' };
    }

    const towerConfig = TOWER_TYPES[tower.type];
    const upgradeCost = towerConfig.upgradeCost[tower.level];

    // Check gold
    if (player.gold < upgradeCost) {
        return { error: 'Oro insufficiente' };
    }

    // Deduct gold and upgrade
    player.gold -= upgradeCost;
    tower.level++;
    tower.stats = { ...towerConfig.stats[tower.level - 1] };
    tower.totalSpent += upgradeCost;

    return {
        success: true,
        tower,
        player: {
            socketId: player.socketId,
            gold: player.gold
        }
    };
}

// Sell tower
function sellTower(pin, socketId, slotId) {
    const game = games.get(pin);

    if (!game) {
        return { error: 'Partita non trovata' };
    }

    if (game.status !== 'building') {
        return { error: 'Non puoi vendere ora' };
    }

    const player = game.players.get(socketId);
    if (!player) {
        return { error: 'Giocatore non trovato' };
    }

    const slot = game.map.towerSlots.find(s => s.id === slotId);
    if (!slot || !slot.tower) {
        return { error: 'Torretta non trovata' };
    }

    const tower = slot.tower;

    // Check ownership
    if (tower.ownerSocketId !== socketId) {
        return { error: 'Non è la tua torretta' };
    }

    const towerConfig = TOWER_TYPES[tower.type];
    const refund = Math.floor(tower.totalSpent * towerConfig.sellRefund);

    // Refund gold
    player.gold += refund;

    // Remove tower
    slot.tower = null;
    game.towers.delete(slotId);

    return {
        success: true,
        refund,
        slotId,
        player: {
            socketId: player.socketId,
            gold: player.gold
        }
    };
}

// Vote ready
function voteReady(pin, socketId) {
    const game = games.get(pin);

    if (!game) {
        return { error: 'Partita non trovata' };
    }

    if (game.status !== 'building') {
        return { error: 'Non in fase di costruzione' };
    }

    const player = game.players.get(socketId);
    if (!player) {
        return { error: 'Giocatore non trovato' };
    }

    player.isReady = true;
    game.wave.readyVotes.add(socketId);

    const readyCount = game.wave.readyVotes.size;
    const totalPlayers = game.players.size;
    const allReady = readyCount >= totalPlayers;

    return {
        success: true,
        readyCount,
        totalPlayers,
        allReady
    };
}

// Unvote ready
function unvoteReady(pin, socketId) {
    const game = games.get(pin);

    if (!game) return { error: 'Partita non trovata' };

    const player = game.players.get(socketId);
    if (player) {
        player.isReady = false;
    }

    game.wave.readyVotes.delete(socketId);

    return {
        success: true,
        readyCount: game.wave.readyVotes.size,
        totalPlayers: game.players.size
    };
}

// Start wave
function startWave(pin) {
    const game = games.get(pin);

    if (!game) {
        return { error: 'Partita non trovata' };
    }

    game.wave.currentWave++;
    game.status = 'wave';

    // Reset ready votes
    game.wave.readyVotes.clear();
    for (const player of game.players.values()) {
        player.isReady = false;
    }

    // Prepare spawn queue
    const waveConfig = WAVE_CONFIG[game.wave.currentWave];
    game.wave.spawnQueue = [];
    game.wave.enemies = [];

    let enemyId = 0;
    for (const enemyGroup of waveConfig.enemies) {
        for (let i = 0; i < enemyGroup.count; i++) {
            const enemyType = ENEMY_TYPES[enemyGroup.type];
            game.wave.spawnQueue.push({
                id: `enemy_${game.wave.currentWave}_${enemyId++}`,
                type: enemyGroup.type,
                ...enemyType,
                currentHp: enemyType.hp,
                pathIndex: 0,
                x: game.map.spawnPoint.x,
                y: game.map.spawnPoint.y,
                blocked: false,
                blockedBy: null
            });
        }
    }

    game.wave.spawnDelay = waveConfig.spawnDelay;
    game.wave.lastSpawn = 0;
    game.lastUpdate = Date.now();

    return {
        success: true,
        waveNumber: game.wave.currentWave,
        totalEnemies: game.wave.spawnQueue.length
    };
}

// Update game state (called in game loop)
function updateGameState(pin) {
    const game = games.get(pin);

    if (!game || game.status !== 'wave') {
        return null;
    }

    const now = Date.now();
    const deltaTime = now - game.lastUpdate;
    const speedMultiplier = deltaTime / 33;
    game.lastUpdate = now;

    // 1. Spawn enemies from queue
    if (game.wave.spawnQueue.length > 0 && now - game.wave.lastSpawn >= game.wave.spawnDelay) {
        const enemy = game.wave.spawnQueue.shift();
        enemy.x = game.map.spawnPoint.x;
        enemy.y = game.map.spawnPoint.y;
        game.wave.enemies.push(enemy);
        game.wave.lastSpawn = now;
    }

    // 2. Update enemy positions
    for (const enemy of game.wave.enemies) {
        if (enemy.blocked) {
            // Handle blocked enemy combat
            continue;
        }

        // Move along path
        if (enemy.pathIndex < game.map.path.length - 1) {
            const target = game.map.path[enemy.pathIndex + 1];
            const dx = target.x - enemy.x;
            const dy = target.y - enemy.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < enemy.speed * speedMultiplier * 2) {
                enemy.pathIndex++;
                enemy.x = target.x;
                enemy.y = target.y;
            } else {
                enemy.x += (dx / dist) * enemy.speed * speedMultiplier;
                enemy.y += (dy / dist) * enemy.speed * speedMultiplier;
            }
        }

        // Check if reached base
        const basePoint = game.map.basePoint;
        const distToBase = Math.sqrt(
            Math.pow(enemy.x - basePoint.x, 2) +
            Math.pow(enemy.y - basePoint.y, 2)
        );

        if (distToBase < 20) {
            game.baseHP -= enemy.damage;
            enemy.reachedBase = true; // Mark for removal without kill credit
        }
    }

    // 3. Towers attack
    for (const [slotId, tower] of game.towers) {
        if (now - tower.lastFired < tower.stats.fireRate) {
            continue;
        }

        const towerConfig = TOWER_TYPES[tower.type];

        // Handle barracks - block and damage enemies
        if (tower.type === 'barracks') {
            const bConfig = TOWER_TYPES.barracks;
            const unitStats = bConfig.unitStats[tower.level - 1];
            const unitCount = bConfig.unitCount[tower.level - 1];

            // Deal damage to currently blocked enemies and check expiry
            let blockedCount = 0;
            for (const enemy of game.wave.enemies) {
                if (enemy.blockedBy !== tower.id || enemy.currentHp <= 0) continue;

                if (now >= enemy.blockExpires) {
                    enemy.blocked = false;
                    enemy.blockedBy = null;
                    continue;
                }

                blockedCount++;
                const baseDps = Math.max(1, unitCount * unitStats.damage - (enemy.armor || 0));
                const frameDamage = (baseDps * deltaTime) / 1000;
                enemy.currentHp -= frameDamage;
                enemy.lastDamagedBy = tower.ownerSocketId;

                const owner = game.players.get(tower.ownerSocketId);
                if (owner) {
                    owner.totalDamage += frameDamage;
                }
            }

            // Block new enemies in range (up to unitCount)
            if (blockedCount < unitCount) {
                for (const enemy of game.wave.enemies) {
                    if (blockedCount >= unitCount) break;
                    if (enemy.currentHp <= 0 || enemy.blocked) continue;

                    const dist = Math.sqrt(
                        Math.pow(enemy.x - tower.x, 2) +
                        Math.pow(enemy.y - tower.y, 2)
                    );

                    if (dist <= tower.stats.range) {
                        enemy.blocked = true;
                        enemy.blockedBy = tower.id;
                        enemy.blockExpires = now + unitStats.blockTime;
                        blockedCount++;
                    }
                }
            }

            continue;
        }

        // Find target in range
        let target = null;
        let minDist = tower.stats.range;

        for (const enemy of game.wave.enemies) {
            if (enemy.currentHp <= 0) continue;

            const dist = Math.sqrt(
                Math.pow(enemy.x - tower.x, 2) +
                Math.pow(enemy.y - tower.y, 2)
            );

            if (dist <= minDist) {
                minDist = dist;
                target = enemy;
            }
        }

        if (target) {
            tower.lastFired = now;

            // Calculate damage
            let damage = tower.stats.damage;
            const effectiveDamage = Math.max(1, damage - (target.armor || 0));

            // Apply damage
            if (towerConfig.splashRadius) {
                // Splash damage for mage towers
                const splashRadius = towerConfig.splashRadius[tower.level - 1];
                for (const enemy of game.wave.enemies) {
                    const dist = Math.sqrt(
                        Math.pow(enemy.x - target.x, 2) +
                        Math.pow(enemy.y - target.y, 2)
                    );
                    if (dist <= splashRadius) {
                        const splashDamage = Math.max(1, damage - (enemy.armor || 0));
                        enemy.currentHp -= splashDamage;
                        enemy.lastDamagedBy = tower.ownerSocketId;
                    }
                }
            } else {
                target.currentHp -= effectiveDamage;
                target.lastDamagedBy = tower.ownerSocketId;
            }

            // Create projectile for visual
            game.projectiles.push({
                id: `proj_${now}_${slotId}`,
                fromX: tower.x,
                fromY: tower.y,
                toX: target.x,
                toY: target.y,
                type: tower.type,
                createdAt: now
            });

            // Track damage for stats
            const owner = game.players.get(tower.ownerSocketId);
            if (owner) {
                owner.totalDamage += effectiveDamage;
            }
        }
    }

    // 4. Check for killed enemies and award gold
    const killedEnemies = [];
    game.wave.enemies = game.wave.enemies.filter(enemy => {
        if (enemy.reachedBase) return false; // Remove without rewards
        if (enemy.currentHp <= 0) {
            killedEnemies.push(enemy);
            return false;
        }
        return true;
    });

    // Award gold for kills (split among all players for coop)
    for (const enemy of killedEnemies) {
        const goldPerPlayer = Math.ceil(enemy.gold / game.players.size);
        for (const player of game.players.values()) {
            player.gold += goldPerPlayer;
        }
        // Kill credit to the tower owner who dealt the final blow
        if (enemy.lastDamagedBy) {
            const killer = game.players.get(enemy.lastDamagedBy);
            if (killer) {
                killer.totalKills++;
            }
        }
    }

    // 5. Remove old projectiles
    game.projectiles = game.projectiles.filter(p => now - p.createdAt < 300);

    // 6. Check wave complete
    if (game.wave.enemies.length === 0 && game.wave.spawnQueue.length === 0) {
        return { waveComplete: true, ...getGameStateForBroadcast(pin) };
    }

    // 7. Check game over
    if (game.baseHP <= 0) {
        game.status = 'gameover';
        return { gameOver: true, victory: false, ...getGameStateForBroadcast(pin) };
    }

    return getGameStateForBroadcast(pin);
}

// Complete wave
function completeWave(pin) {
    const game = games.get(pin);

    if (!game) return null;

    // Award wave bonus
    for (const player of game.players.values()) {
        player.gold += ECONOMY.waveBonus;
    }

    // Check victory
    if (game.wave.currentWave >= game.wave.maxWaves) {
        game.status = 'victory';
        return {
            victory: true,
            waveNumber: game.wave.currentWave,
            stats: getGameStats(pin)
        };
    }

    // Return to building phase
    game.status = 'building';

    return {
        victory: false,
        waveNumber: game.wave.currentWave,
        nextWave: game.wave.currentWave + 1,
        bonus: ECONOMY.waveBonus,
        players: getPlayersArray(pin)
    };
}

// Get game state for broadcast
function getGameStateForBroadcast(pin) {
    const game = games.get(pin);
    if (!game) return null;

    return {
        status: game.status,
        baseHP: game.baseHP,
        maxBaseHP: ECONOMY.baseHP,
        waveNumber: game.wave.currentWave,
        maxWaves: game.wave.maxWaves,
        enemies: game.wave.enemies.map(e => ({
            id: e.id,
            type: e.type,
            emoji: e.emoji,
            x: e.x,
            y: e.y,
            currentHp: e.currentHp,
            hp: e.hp
        })),
        towers: Array.from(game.towers.values()).map(t => ({
            id: t.id,
            slotId: t.slotId,
            type: t.type,
            level: t.level,
            x: t.x,
            y: t.y,
            ownerNickname: t.ownerNickname
        })),
        projectiles: game.projectiles,
        players: getPlayersArray(pin),
        remainingEnemies: game.wave.enemies.length + game.wave.spawnQueue.length
    };
}

// Get game stats
function getGameStats(pin) {
    const game = games.get(pin);
    if (!game) return null;

    const players = getPlayersArray(pin).map(p => ({
        nickname: p.nickname,
        avatar: p.avatar,
        totalKills: p.totalKills,
        totalDamage: p.totalDamage,
        towersBuilt: p.towersBuilt,
        gold: p.gold
    }));

    // Sort by kills
    players.sort((a, b) => b.totalKills - a.totalKills);

    return {
        wavesCompleted: game.wave.currentWave,
        baseHPRemaining: game.baseHP,
        players
    };
}

// Leave game
function leaveGame(socketId) {
    for (const [pin, game] of games) {
        if (game.hostSocketId === socketId) {
            return { isHost: true, pin };
        }

        if (game.players.has(socketId)) {
            const player = game.players.get(socketId);
            game.players.delete(socketId);
            game.wave.readyVotes.delete(socketId);
            return { isHost: false, pin, player };
        }
    }
    return null;
}

// Delete game
function deleteGame(pin) {
    const game = games.get(pin);
    if (game) {
        if (game.gameLoopInterval) {
            clearInterval(game.gameLoopInterval);
        }
        games.delete(pin);
    }
}

// Get game
function getGame(pin) {
    return games.get(pin);
}

// Export constants for client use
const GAME_CONSTANTS = {
    TOWER_TYPES,
    ENEMY_TYPES,
    WAVE_CONFIG,
    ECONOMY,
    ZONE_COLORS
};

// Cleanup stale games (no activity for 60 minutes)
function cleanupStaleGames(maxAge = 60 * 60 * 1000) {
    const now = Date.now();
    const cleaned = [];
    for (const [pin, game] of games) {
        if (now - game.createdAt > maxAge) {
            if (game.gameLoopInterval) {
                clearInterval(game.gameLoopInterval);
            }
            games.delete(pin);
            cleaned.push(pin);
        }
    }
    return cleaned;
}

module.exports = {
    createGame,
    joinGame,
    getGame,
    getPlayersArray,
    startGame,
    getPlayerZoneSlots,
    placeTower,
    upgradeTower,
    sellTower,
    voteReady,
    unvoteReady,
    startWave,
    updateGameState,
    completeWave,
    getGameStateForBroadcast,
    getGameStats,
    leaveGame,
    deleteGame,
    cleanupStaleGames,
    GAME_CONSTANTS
};
