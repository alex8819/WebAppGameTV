/**
 * Maze Game Manager - Labirinto Invisibile
 * Cooperative blind maze game with Navigator/Pilot teams
 */

const games = new Map();

// Maze configuration
const MAZE_CONFIG = {
    width: 15,
    height: 15,
    cellSize: 30,
    trapCount: 8
};

// Trap types
const TRAP_TYPES = {
    TELEPORT: { id: 'teleport', emoji: '🌀', name: 'Teletrasporto' },
    SLOW: { id: 'slow', emoji: '🕸️', name: 'Zona Lenta', duration: 3000 },
    MOVING_WALL: { id: 'moving_wall', emoji: '🚧', name: 'Muro Mobile', interval: 5000 }
};

// Team colors
const TEAM_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'];

// Generate unique PIN
function generatePin() {
    let pin;
    do {
        pin = Math.floor(1000 + Math.random() * 9000).toString();
    } while (games.has(pin));
    return pin;
}

// Generate maze using Recursive Backtracking
function generateMaze(width, height) {
    // Create grid filled with walls
    // 0 = wall, 1 = path
    const maze = [];
    for (let y = 0; y < height * 2 + 1; y++) {
        maze[y] = [];
        for (let x = 0; x < width * 2 + 1; x++) {
            maze[y][x] = 0; // All walls
        }
    }

    // Visited cells
    const visited = [];
    for (let y = 0; y < height; y++) {
        visited[y] = [];
        for (let x = 0; x < width; x++) {
            visited[y][x] = false;
        }
    }

    // Recursive backtracking
    function carve(x, y) {
        visited[y][x] = true;
        maze[y * 2 + 1][x * 2 + 1] = 1; // Mark cell as path

        // Shuffle directions
        const directions = [
            { dx: 0, dy: -1 }, // Up
            { dx: 1, dy: 0 },  // Right
            { dx: 0, dy: 1 },  // Down
            { dx: -1, dy: 0 }  // Left
        ].sort(() => Math.random() - 0.5);

        for (const { dx, dy } of directions) {
            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited[ny][nx]) {
                // Remove wall between cells
                maze[y * 2 + 1 + dy][x * 2 + 1 + dx] = 1;
                carve(nx, ny);
            }
        }
    }

    // Start from top-left
    carve(0, 0);

    // Ensure start and end are accessible
    maze[1][1] = 1; // Start
    maze[height * 2 - 1][width * 2 - 1] = 1; // End

    return maze;
}

// Add traps to maze
function addTraps(maze, count) {
    const traps = [];
    const height = maze.length;
    const width = maze[0].length;

    // Find valid positions (paths, not start/end)
    const validPositions = [];
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            if (maze[y][x] === 1) {
                // Not start or end
                if (!((x === 1 && y === 1) || (x === width - 2 && y === height - 2))) {
                    validPositions.push({ x, y });
                }
            }
        }
    }

    // Shuffle and pick random positions
    const shuffled = validPositions.sort(() => Math.random() - 0.5);
    const trapTypes = Object.values(TRAP_TYPES);

    for (let i = 0; i < Math.min(count, shuffled.length); i++) {
        const pos = shuffled[i];
        const trapType = trapTypes[Math.floor(Math.random() * trapTypes.length)];

        traps.push({
            id: `trap_${i}`,
            type: trapType.id,
            emoji: trapType.emoji,
            x: pos.x,
            y: pos.y,
            isActive: true
        });
    }

    return traps;
}

// Create new game
function createGame(hostSocketId) {
    const pin = generatePin();
    const maze = generateMaze(MAZE_CONFIG.width, MAZE_CONFIG.height);
    const traps = addTraps(maze, MAZE_CONFIG.trapCount);

    const game = {
        pin,
        hostSocketId,
        status: 'lobby', // lobby, countdown, playing, finished
        createdAt: Date.now(),

        maze,
        traps,
        mazeWidth: MAZE_CONFIG.width * 2 + 1,
        mazeHeight: MAZE_CONFIG.height * 2 + 1,

        teams: new Map(),
        maxTeams: 6,

        startPosition: { x: 1, y: 1 },
        endPosition: { x: MAZE_CONFIG.width * 2 - 1, y: MAZE_CONFIG.height * 2 - 1 },

        movingWallState: true, // true = closed, false = open
        movingWallTimer: null,

        gameLoopInterval: null,
        startTime: null,
        winner: null
    };

    games.set(pin, game);
    return { pin, maze, traps };
}

// Join team
function joinTeam(pin, playerName, teamName, role, socketId) {
    const game = games.get(pin);

    if (!game) {
        return { error: 'Partita non trovata' };
    }

    if (game.status !== 'lobby') {
        return { error: 'Partita già iniziata' };
    }

    // Find or create team
    let team = null;
    for (const [teamId, t] of game.teams) {
        if (t.name.toLowerCase() === teamName.toLowerCase()) {
            team = t;
            break;
        }
    }

    if (!team) {
        // Create new team
        if (game.teams.size >= game.maxTeams) {
            return { error: 'Numero massimo di squadre raggiunto' };
        }

        const teamId = `team_${Date.now()}`;
        team = {
            id: teamId,
            name: teamName,
            color: TEAM_COLORS[game.teams.size],
            navigator: null,
            pilot: null,
            position: { ...game.startPosition },
            isSlowed: false,
            slowEndTime: null,
            isReady: false,
            finishTime: null
        };
        game.teams.set(teamId, team);
    }

    // Check if role is available
    if (role === 'navigator') {
        if (team.navigator) {
            return { error: 'Questa squadra ha già un navigatore' };
        }
        team.navigator = { socketId, name: playerName };
    } else if (role === 'pilot') {
        if (team.pilot) {
            return { error: 'Questa squadra ha già un pilota' };
        }
        team.pilot = { socketId, name: playerName };
    } else {
        return { error: 'Ruolo non valido' };
    }

    // Check if team is complete
    team.isReady = team.navigator && team.pilot;

    // Return teammate info for notification
    let teammate = null;
    if (role === 'navigator' && team.pilot) {
        teammate = team.pilot;
    } else if (role === 'pilot' && team.navigator) {
        teammate = team.navigator;
    }

    return {
        success: true,
        team,
        teams: getTeamsArray(pin),
        teammate
    };
}

// Get teams as array
function getTeamsArray(pin) {
    const game = games.get(pin);
    if (!game) return [];

    return Array.from(game.teams.values()).map(t => ({
        id: t.id,
        name: t.name,
        color: t.color,
        navigator: t.navigator ? { name: t.navigator.name } : null,
        pilot: t.pilot ? { name: t.pilot.name } : null,
        isReady: t.isReady,
        position: t.position
    }));
}

// Check if all teams are ready
function allTeamsReady(pin) {
    const game = games.get(pin);
    if (!game || game.teams.size === 0) return false;

    for (const team of game.teams.values()) {
        if (!team.isReady) return false;
    }
    return true;
}

// Start game
function startGame(pin) {
    const game = games.get(pin);

    if (!game) {
        return { error: 'Partita non trovata' };
    }

    if (game.teams.size < 1) {
        return { error: 'Serve almeno una squadra' };
    }

    if (!allTeamsReady(pin)) {
        return { error: 'Non tutte le squadre sono complete' };
    }

    game.status = 'countdown';

    return {
        success: true,
        maze: game.maze,
        traps: game.traps,
        teams: getTeamsArray(pin),
        startPosition: game.startPosition,
        endPosition: game.endPosition,
        width: game.mazeWidth,
        height: game.mazeHeight
    };
}

// Start playing (after countdown)
function startPlaying(pin) {
    const game = games.get(pin);
    if (!game) return { error: 'Partita non trovata' };

    game.status = 'playing';
    game.startTime = Date.now();

    return { success: true };
}

// Move player
function movePlayer(pin, socketId, direction) {
    const game = games.get(pin);

    if (!game || game.status !== 'playing') {
        return { error: 'Partita non in corso' };
    }

    // Find team by pilot socketId
    let team = null;
    for (const t of game.teams.values()) {
        if (t.pilot && t.pilot.socketId === socketId) {
            team = t;
            break;
        }
    }

    if (!team) {
        return { error: 'Non sei un pilota' };
    }

    if (team.finishTime) {
        return { error: 'Hai già finito' };
    }

    // Calculate new position
    let dx = 0, dy = 0;
    switch (direction) {
        case 'up': dy = -1; break;
        case 'down': dy = 1; break;
        case 'left': dx = -1; break;
        case 'right': dx = 1; break;
        default: return { error: 'Direzione non valida' };
    }

    // Check if slowed
    if (team.isSlowed && Date.now() < team.slowEndTime) {
        // 50% chance to ignore move when slowed
        if (Math.random() < 0.5) {
            return { slowed: true, teamId: team.id, position: team.position };
        }
    } else {
        team.isSlowed = false;
    }

    const newX = team.position.x + dx;
    const newY = team.position.y + dy;

    // Check bounds
    if (newX < 0 || newX >= game.mazeWidth || newY < 0 || newY >= game.mazeHeight) {
        return { collision: true, position: team.position };
    }

    // Check wall
    if (game.maze[newY][newX] === 0) {
        return { collision: true, position: team.position };
    }

    // Check moving wall traps
    const movingWallTrap = game.traps.find(t =>
        t.type === 'moving_wall' && t.x === newX && t.y === newY && t.isActive
    );
    if (movingWallTrap && game.movingWallState) {
        return { collision: true, position: team.position, movingWall: true };
    }

    // Move successful
    team.position = { x: newX, y: newY };

    // Check traps
    const trap = game.traps.find(t =>
        t.x === newX && t.y === newY && t.isActive && t.type !== 'moving_wall'
    );

    let trapTriggered = null;

    if (trap) {
        trapTriggered = { type: trap.type, emoji: trap.emoji };

        if (trap.type === 'teleport') {
            // Teleport to random valid position
            const validPositions = [];
            for (let y = 1; y < game.mazeHeight - 1; y++) {
                for (let x = 1; x < game.mazeWidth - 1; x++) {
                    if (game.maze[y][x] === 1 && !(x === newX && y === newY)) {
                        validPositions.push({ x, y });
                    }
                }
            }
            const randomPos = validPositions[Math.floor(Math.random() * validPositions.length)];
            team.position = randomPos;
            trapTriggered.newPosition = randomPos;
        } else if (trap.type === 'slow') {
            team.isSlowed = true;
            team.slowEndTime = Date.now() + TRAP_TYPES.SLOW.duration;
        }
    }

    // Check win
    if (team.position.x === game.endPosition.x && team.position.y === game.endPosition.y) {
        team.finishTime = Date.now() - game.startTime;
        const isWinner = !game.winner;
        if (isWinner) {
            game.winner = team;
            game.status = 'finished';
        }
        return {
            teamId: team.id,
            position: team.position,
            finished: true,
            winner: isWinner,
            time: team.finishTime
        };
    }

    return {
        teamId: team.id,
        position: team.position,
        trap: trapTriggered
    };
}

// Get game state for broadcast
function getGameState(pin) {
    const game = games.get(pin);
    if (!game) return null;

    return {
        status: game.status,
        teams: getTeamsArray(pin).map(t => ({
            ...t,
            position: game.teams.get(t.id)?.position
        })),
        movingWallState: game.movingWallState,
        elapsedTime: game.startTime ? Date.now() - game.startTime : 0
    };
}

// Get maze data
function getMazeData(pin) {
    const game = games.get(pin);
    if (!game) return null;

    return {
        maze: game.maze,
        traps: game.traps,
        width: game.mazeWidth,
        height: game.mazeHeight,
        startPosition: game.startPosition,
        endPosition: game.endPosition
    };
}

// Get winner
function getWinner(pin) {
    const game = games.get(pin);
    if (!game || !game.winner) return null;

    return {
        team: {
            id: game.winner.id,
            name: game.winner.name,
            color: game.winner.color,
            navigator: game.winner.navigator?.name,
            pilot: game.winner.pilot?.name,
            time: game.winner.finishTime
        }
    };
}

// Leave game
function leaveGame(socketId) {
    for (const [pin, game] of games) {
        if (game.hostSocketId === socketId) {
            return { isHost: true, pin };
        }

        for (const [teamId, team] of game.teams) {
            if (team.navigator?.socketId === socketId) {
                team.navigator = null;
                team.isReady = false;
                return { isHost: false, pin, team, role: 'navigator' };
            }
            if (team.pilot?.socketId === socketId) {
                team.pilot = null;
                team.isReady = false;
                return { isHost: false, pin, team, role: 'pilot' };
            }
        }
    }
    return null;
}

// Toggle moving walls state
function toggleMovingWalls(pin) {
    const game = games.get(pin);
    if (!game || game.status !== 'playing') return null;

    game.movingWallState = !game.movingWallState;
    return { state: game.movingWallState };
}

// Delete game
function deleteGame(pin) {
    const game = games.get(pin);
    if (game) {
        if (game.movingWallTimer) {
            clearInterval(game.movingWallTimer);
        }
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

module.exports = {
    createGame,
    joinTeam,
    getTeamsArray,
    allTeamsReady,
    startGame,
    startPlaying,
    movePlayer,
    getGameState,
    getMazeData,
    getWinner,
    leaveGame,
    deleteGame,
    toggleMovingWalls,
    getGame,
    MAZE_CONFIG,
    TRAP_TYPES,
    TEAM_COLORS
};
