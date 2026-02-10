# TV Gems - Guida Sviluppo Giochi

> Documento di riferimento per creare nuovi giochi sulla piattaforma TVGems.
> Ogni gioco segue lo stesso pattern: **TV (host)** + **Smartphone (player)** in tempo reale via Socket.io.

---

## Architettura Base

```
TV (Browser)                    Server (Node.js)                  Smartphone (Browser)
+-----------------+             +-------------------+             +------------------+
| [game]-host.html|  Socket.io  | index.js          |  Socket.io  | [game]-play.html |
| [game]-host.js  | <========> | [game]Manager.js  | <========> | [game]-player.js |
| [game]-host.css |             | logger.js         |             | [game]-player.css|
+-----------------+             +-------------------+             +------------------+
                                        |
                                   database/quiz.db
                                   logs/[game]-YYYY-MM-DD.log
```

### Stack Tecnologico
- **Backend:** Node.js + Express + Socket.io
- **Frontend:** HTML5 + CSS3 + Vanilla JS (no framework)
- **Database:** SQLite (better-sqlite3)
- **Process Manager:** PM2
- **Lingua UI:** Italiano

---

## Flusso Standard di un Gioco

```
1. MENU PRINCIPALE (index.html)
   └── Utente clicca card del gioco

2. HOME PAGE ([game]-home.html)
   ├── "OSPITA PARTITA" → apre [game]-host (sulla TV)
   └── "GIOCA" → apre [game]-play (sullo smartphone)

3. LOBBY (host crea partita, genera PIN)
   ├── Host mostra PIN a schermo
   ├── Players inseriscono PIN sullo smartphone
   ├── Lista giocatori aggiornata in tempo reale
   ├── Timer lobby 50s (resettato ad ogni nuovo giocatore)
   └── Host può avviare manualmente OPPURE timer auto-avvia

4. COUNTDOWN (3... 2... 1... VIA!)
   ├── Mostrato sia su TV che su smartphone
   └── Dopo "VIA!" → schermata di gioco

5. GIOCO IN CORSO
   ├── TV mostra stato globale (arena, pista, campo...)
   ├── Smartphone mostra controlli personali
   └── Server gestisce logica e broadcast stato

6. RISULTATI
   ├── Classifica finale su TV (podio)
   ├── Risultato personale su smartphone
   └── Countdown per nuova partita (30s) o bottone "NUOVA PARTITA"
```

---

## Struttura File per Nuovo Gioco

Quando crei un nuovo gioco `[game]`, devi creare questi file:

### Server (`/server`)

| File | Scopo |
|------|-------|
| `[game]GameManager.js` | Logica di gioco, stato, fisica |

### Public (`/public`)

| File | Scopo |
|------|-------|
| `[game]-home.html` | Landing page con bottoni Host/Gioca |
| `[game]-host.html` | Vista TV (host) |
| `[game]-play.html` | Vista smartphone (player) |
| `js/[game]-host.js` | Logica client host |
| `js/[game]-player.js` | Logica client player |
| `css/[game]-host.css` | Stili host |
| `css/[game]-player.css` | Stili player |

### File da Modificare

| File | Cosa aggiungere |
|------|-----------------|
| `server/index.js` | Route Express + Handler Socket.io + Disconnect handler + Game loop (se serve) |
| `server/logger.js` | Modulo di logging per il nuovo gioco |
| `public/index.html` | Card nel menu principale |

---

## Game Manager (`[game]GameManager.js`)

Ogni game manager DEVE esportare queste funzioni base:

```javascript
const games = new Map(); // pin -> gameState

// === OBBLIGATORI ===

function createGame(hostSocketId) {
    // Genera PIN unico, crea stato iniziale
    // return { pin, ...extraData }
}

function getGame(pin) {
    return games.get(pin);
}

function joinGame(pin, nickname, socketId) {
    // Valida: gioco esiste, status === 'lobby', max giocatori, nome duplicato
    // Aggiunge giocatore alla Map
    // return { error? } oppure { player, ...extraData }
}

function getPlayers(pin) {
    // return Array di { socketId, nickname, color/avatar, ... }
}

function startCountdown(pin) {
    // Cambia status a 'countdown'
    // Valida: almeno 1 giocatore
    // return { error? } oppure { success: true }
}

function leaveGame(socketId) {
    // Cerca il giocatore in tutte le partite
    // Se host: elimina partita
    // Se player: rimuovi dalla Map
    // return { pin, isHost, player? }
}

function deleteGame(pin) {
    // Pulisci timer/interval, rimuovi dalla Map
}

// === SPECIFICI DEL GIOCO ===
// startGame(pin), updateGameState(pin), getGameState(pin), etc.

module.exports = {
    createGame, getGame, joinGame, getPlayers,
    startCountdown, leaveGame, deleteGame,
    // ...funzioni specifiche
};
```

### Struttura Stato Gioco (standard)

```javascript
const game = {
    pin: '1234',
    hostSocketId: 'socket-id-abc',
    status: 'lobby',        // lobby | countdown | playing | finished
    players: new Map(),      // socketId -> playerData
    // ... campi specifici del gioco
};
```

### Struttura Giocatore (campi comuni)

```javascript
const player = {
    socketId: 'socket-id-xyz',
    nickname: 'Mario',
    color: '#e74c3c',       // o avatar/elemento/etc
    score: 0,
    // ... campi specifici del gioco
};
```

### Generazione PIN

```javascript
function generatePin() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

// Nel createGame:
let pin;
do {
    pin = generatePin();
} while (games.has(pin));
```

### Validazioni nel joinGame (TUTTE obbligatorie)

```javascript
function joinGame(pin, nickname, socketId) {
    const game = games.get(pin);

    if (!game)
        return { error: 'Partita non trovata' };

    if (game.status !== 'lobby')
        return { error: 'La partita è già iniziata' };

    if (game.players.size >= MAX_PLAYERS)
        return { error: `Partita piena (max ${MAX_PLAYERS} giocatori)` };

    // Check nome duplicato
    for (const [, player] of game.players) {
        if (player.nickname.toLowerCase() === nickname.toLowerCase())
            return { error: 'Nome già in uso' };
    }

    // ... aggiungi giocatore
}
```

---

## Socket.io Events (`index.js`)

### Convenzione Nomi Eventi

```
[game]:host-create       → Host crea partita
[game]:created           → Server conferma creazione (→ host)
[game]:player-join       → Player chiede di entrare
[game]:joined            → Server conferma ingresso (→ player)
[game]:join-error        → Errore ingresso (→ player)
[game]:player-joined     → Notifica nuovo player (→ host)
[game]:lobby-update      → Lista aggiornata (→ tutti)
[game]:lobby-timer       → Countdown lobby 50s (→ tutti)
[game]:host-start        → Host avvia manualmente
[game]:countdown         → Countdown 3-2-1 (→ tutti)
[game]:go                → Via! (→ tutti)
[game]:game-state        → Stato gioco broadcast (→ host)
[game]:player-state      → Stato personale (→ singolo player)
[game]:player-input      → Input dal player (→ server)
[game]:race-finished     → Fine partita (→ tutti)  [nome generico: game-finished]
[game]:host-left         → Host disconnesso (→ players)
[game]:player-left       → Player disconnesso (→ host)
[game]:error             → Errore generico (→ chi lo ha causato)
```

### Convenzione Room

```javascript
// Room SOLO per i player
socket.join(`[game]:${pin}`);

// Room SOLO per l'host
socket.join(`[game]-host:${pin}`);
```

**IMPORTANTE: L'host NON deve essere nella room dei player.**
Se l'host è in entrambe le room, riceve gli eventi duplicati (countdown, go, finished...).
Questo causa bug gravi come doppi render loop.

```javascript
// CORRETTO
socket.on('[game]:host-create', () => {
    socket.join(`[game]-host:${pin}`);   // SOLO host room
});

// SBAGLIATO - causa eventi duplicati
socket.on('[game]:host-create', () => {
    socket.join(`[game]:${pin}`);        // NO! Mai aggiungere host qui
    socket.join(`[game]-host:${pin}`);
});
```

### Template Handler Socket (copia e adatta)

```javascript
// === [GAME] EVENTS ===

socket.on('[game]:host-create', () => {
    const { pin, ...extra } = [game]Manager.createGame(socket.id);
    socket.join(`[game]-host:${pin}`);
    socket.emit('[game]:created', { pin, ...extra });
    console.log(`[GAME] creato: PIN ${pin}`);
});

socket.on('[game]:player-join', ({ pin, nickname }) => {
    const result = [game]Manager.joinGame(pin, nickname, socket.id);

    if (result.error) {
        socket.emit('[game]:join-error', { message: result.error });
        return;
    }

    socket.join(`[game]:${pin}`);
    socket.data.[game]Pin = pin;
    socket.data.[game]Nickname = nickname;

    // Conferma al player
    socket.emit('[game]:joined', {
        gamePin: pin,
        player: result.player,
        players: [game]Manager.getPlayers(pin)
    });

    // Notifica host
    io.to(`[game]-host:${pin}`).emit('[game]:player-joined', {
        player: result.player
    });

    // Aggiorna lobby per tutti (player + host separatamente)
    io.to(`[game]:${pin}`).emit('[game]:lobby-update', {
        players: [game]Manager.getPlayers(pin)
    });
    io.to(`[game]-host:${pin}`).emit('[game]:lobby-update', {
        players: [game]Manager.getPlayers(pin)
    });

    // Avvia/resetta timer lobby 50s
    start[Game]LobbyTimer(pin);

    console.log(`${nickname} si è unito a [GAME] ${pin}`);
});

socket.on('[game]:host-start', ({ pin }) => {
    stop[Game]LobbyTimer(pin);  // Ferma timer lobby

    const result = [game]Manager.startCountdown(pin);
    if (result.error) {
        socket.emit('[game]:error', { message: result.error });
        return;
    }

    // Countdown 3-2-1
    let countdown = 3;
    io.to(`[game]:${pin}`).emit('[game]:countdown', { count: countdown });
    io.to(`[game]-host:${pin}`).emit('[game]:countdown', { count: countdown });

    const countdownInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            io.to(`[game]:${pin}`).emit('[game]:countdown', { count: countdown });
            io.to(`[game]-host:${pin}`).emit('[game]:countdown', { count: countdown });
        } else {
            clearInterval(countdownInterval);
            io.to(`[game]:${pin}`).emit('[game]:go');
            io.to(`[game]-host:${pin}`).emit('[game]:go');
            [game]Manager.startGame(pin);
            start[Game]GameLoop(pin);  // Se il gioco ha un loop server-side
        }
    }, 1000);
});
```

### Disconnect Handler (OBBLIGATORIO per ogni gioco)

```javascript
// Dentro socket.on('disconnect', () => { ... })

const [game]Result = [game]Manager.leaveGame(socket.id);
if ([game]Result) {
    if ([game]Result.isHost) {
        io.to(`[game]:${[game]Result.pin}`).emit('[game]:host-left');
        stop[Game]LobbyTimer([game]Result.pin);
        stop[Game]GameLoop([game]Result.pin);
    } else {
        io.to(`[game]-host:${[game]Result.pin}`).emit('[game]:player-left', {
            player: [game]Result.player
        });
        // Aggiorna lobby (entrambe le room)
        io.to(`[game]:${[game]Result.pin}`).emit('[game]:lobby-update', {
            players: [game]Manager.getPlayers([game]Result.pin)
        });
        io.to(`[game]-host:${[game]Result.pin}`).emit('[game]:lobby-update', {
            players: [game]Manager.getPlayers([game]Result.pin)
        });
        // Ferma timer se lobby vuota
        if ([game]Manager.getPlayers([game]Result.pin).length === 0) {
            stop[Game]LobbyTimer([game]Result.pin);
        }
    }
}
```

---

## Timer Lobby 50 Secondi

Ogni gioco DEVE avere il timer lobby automatico:

- **Si avvia** quando il primo player entra
- **Si resetta a 50s** quando un nuovo player entra
- **Si ferma** se l'host avvia manualmente
- **Si ferma** se tutti i player escono
- **Auto-avvia la partita** quando arriva a 0

### Implementazione Server

```javascript
const [game]LobbyTimers = new Map(); // pin -> intervalId

function start[Game]LobbyTimer(pin) {
    stop[Game]LobbyTimer(pin); // Reset se già attivo

    let remaining = 50;

    io.to(`[game]-host:${pin}`).emit('[game]:lobby-timer', { remaining });
    io.to(`[game]:${pin}`).emit('[game]:lobby-timer', { remaining });

    const intervalId = setInterval(() => {
        remaining--;
        io.to(`[game]-host:${pin}`).emit('[game]:lobby-timer', { remaining });
        io.to(`[game]:${pin}`).emit('[game]:lobby-timer', { remaining });

        if (remaining <= 0) {
            stop[Game]LobbyTimer(pin);
            // Auto-start: stessa logica di host-start
            const result = [game]Manager.startCountdown(pin);
            if (result.error) return;

            let countdown = 3;
            io.to(`[game]:${pin}`).emit('[game]:countdown', { count: countdown });
            io.to(`[game]-host:${pin}`).emit('[game]:countdown', { count: countdown });

            const countdownInterval = setInterval(() => {
                countdown--;
                if (countdown > 0) {
                    io.to(`[game]:${pin}`).emit('[game]:countdown', { count: countdown });
                    io.to(`[game]-host:${pin}`).emit('[game]:countdown', { count: countdown });
                } else {
                    clearInterval(countdownInterval);
                    io.to(`[game]:${pin}`).emit('[game]:go');
                    io.to(`[game]-host:${pin}`).emit('[game]:go');
                    [game]Manager.startGame(pin);
                    start[Game]GameLoop(pin);
                }
            }, 1000);
        }
    }, 1000);

    [game]LobbyTimers.set(pin, intervalId);
}

function stop[Game]LobbyTimer(pin) {
    const intervalId = [game]LobbyTimers.get(pin);
    if (intervalId) {
        clearInterval(intervalId);
        [game]LobbyTimers.delete(pin);
    }
}
```

### UI Timer (Host)

```html
<div class="lobby-timer hidden" id="lobby-timer">
    La partita parte tra <span id="lobby-timer-value">50</span>s
</div>
```

```javascript
socket.on('[game]:lobby-timer', (data) => {
    document.getElementById('lobby-timer').classList.remove('hidden');
    document.getElementById('lobby-timer-value').textContent = data.remaining;
});
```

---

## Game Loop Server-Side

Per giochi in tempo reale (racing, tower defense, etc.), serve un game loop:

```javascript
const [game]GameLoops = new Map(); // pin -> intervalId

function start[Game]GameLoop(pin) {
    const intervalId = setInterval(() => {
        const state = [game]Manager.updateGameState(pin);

        if (!state) {
            stop[Game]GameLoop(pin);
            return;
        }

        // Broadcast stato globale all'host
        io.to(`[game]-host:${pin}`).emit('[game]:game-state', state);

        // Stato personale a ogni player
        const game = [game]Manager.getGame(pin);
        if (game) {
            for (const [socketId] of game.players) {
                const playerState = [game]Manager.getPlayerState(pin, socketId);
                if (playerState) {
                    io.to(socketId).emit('[game]:player-state', playerState);
                }
            }
        }

        // Fine partita
        if (state.status === 'finished') {
            stop[Game]GameLoop(pin);
            const results = [game]Manager.getResults(pin);
            io.to(`[game]-host:${pin}`).emit('[game]:game-finished', results);
            io.to(`[game]:${pin}`).emit('[game]:game-finished', results);
        }
    }, 33); // ~30fps

    [game]GameLoops.set(pin, intervalId);
}
```

**IMPORTANTE: Timeout massimo partita.** Ogni game loop DEVE avere un timeout (es. 120s) per evitare che la partita giri all'infinito se un giocatore non finisce:

```javascript
const MAX_GAME_TIME = 120000; // 2 minuti

// Dentro updateGameState:
const elapsed = Date.now() - game.startTime;
if (elapsed >= MAX_GAME_TIME) {
    // Segna giocatori rimasti come DNF
    for (const player of game.players.values()) {
        if (!player.finished) {
            player.finished = true;
            player.finishTime = null; // DNF
        }
    }
    game.status = 'finished';
}
```

---

## Client Host (`[game]-host.js`)

### Struttura Standard

```javascript
const socket = io();

// State
let gamePin = null;
let players = [];
let gameState = null;

// DOM Elements
const lobbyScreen = document.getElementById('lobby-screen');
const countdownScreen = document.getElementById('countdown-screen');
const gameScreen = document.getElementById('game-screen');
const resultsScreen = document.getElementById('results-screen');

// === INIT ===
function init() {
    socket.emit('[game]:host-create');
    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-new-game').addEventListener('click', () => location.reload());
}

// === SCREEN MANAGEMENT ===
function showScreen(name) {
    [lobbyScreen, countdownScreen, gameScreen, resultsScreen]
        .forEach(s => s.classList.add('hidden'));
    document.getElementById(`${name}-screen`).classList.remove('hidden');
}

// === SOCKET EVENTS ===
socket.on('[game]:created', (data) => {
    gamePin = data.pin;
    document.getElementById('game-pin').textContent = gamePin;
});

socket.on('[game]:player-joined', (data) => { /* aggiorna lista */ });
socket.on('[game]:lobby-update', (data) => { /* aggiorna lista */ });
socket.on('[game]:lobby-timer', (data) => { /* aggiorna timer */ });

socket.on('[game]:countdown', (data) => {
    showScreen('countdown');
    document.getElementById('countdown-display').textContent = data.count;
});

socket.on('[game]:go', () => {
    setTimeout(() => {
        showScreen('game');
        // Avvia rendering
    }, 500);
});

socket.on('[game]:game-state', (state) => { /* aggiorna UI */ });
socket.on('[game]:game-finished', (data) => { showResults(data.results); });

socket.on('[game]:error', (data) => {
    document.getElementById('btn-start').disabled = false;
    alert(data.message);
});

socket.on('[game]:host-left', () => {
    alert('Connessione persa');
    location.reload();
});

// === START ===
function startGame() {
    document.getElementById('btn-start').disabled = true;
    socket.emit('[game]:host-start', { pin: gamePin });
}

init();
```

---

## Client Player (`[game]-player.js`)

### Struttura Standard

```javascript
const socket = io();

// State
let gamePin = null;
let playerData = null;
let isPlaying = false;

// DOM Elements (stessa logica dell'host)

// === INIT ===
function init() {
    document.getElementById('btn-join').addEventListener('click', joinGame);
    // Carica PIN/nickname da sessionStorage
}

// === JOIN ===
function joinGame() {
    const pin = document.getElementById('game-pin').value.trim();
    const nickname = document.getElementById('nickname').value.trim() || 'Giocatore';

    if (pin.length !== 4) {
        showError('Inserisci un PIN valido (4 cifre)');
        return;
    }

    sessionStorage.setItem('[game]Pin', pin);
    sessionStorage.setItem('[game]Nickname', nickname);
    socket.emit('[game]:player-join', { pin, nickname });
}

// === SOCKET EVENTS ===
socket.on('[game]:joined', (data) => {
    gamePin = data.gamePin;
    playerData = data.player;
    showScreen('lobby');
});

socket.on('[game]:join-error', (data) => { showError(data.message); });
socket.on('[game]:lobby-update', (data) => { /* aggiorna lista players */ });
socket.on('[game]:lobby-timer', (data) => { /* aggiorna timer */ });
socket.on('[game]:countdown', (data) => { showScreen('countdown'); });

socket.on('[game]:go', () => {
    setTimeout(() => {
        showScreen('game');
        isPlaying = true;
    }, 500);
});

socket.on('[game]:player-state', (state) => {
    if (!isPlaying) return;
    // Aggiorna HUD personale
});

socket.on('[game]:game-finished', (data) => { showResults(data.results); });
socket.on('[game]:host-left', () => {
    alert("L'host ha lasciato la partita");
    location.reload();
});

// === ERROR DISPLAY ===
function showError(message) {
    const el = document.getElementById('error-message');
    el.textContent = message;
    setTimeout(() => { el.textContent = ''; }, 3000);
}

init();
```

---

## HTML Templates

### Home Page (`[game]-home.html`)

```html
<!DOCTYPE html>
<html lang="it">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>[Nome Gioco]</title>
    <link rel="stylesheet" href="/css/common.css">
    <!-- Stili inline o CSS dedicato -->
</head>
<body>
    <a href="/" class="back-link">< Torna ai giochi</a>

    <div class="landing">
        <h1 class="logo">[Nome Gioco]</h1>
        <p class="tagline">[Descrizione breve]</p>

        <div class="mode-buttons">
            <a href="/[game]-host" class="mode-btn host">
                OSPITA PARTITA
                <div class="mode-desc">Apri sulla TV per creare la partita</div>
            </a>
            <a href="/[game]-play" class="mode-btn player">
                GIOCA
                <div class="mode-desc">Unisciti con il PIN dal tuo smartphone</div>
            </a>
        </div>

        <div class="game-info">
            <!-- Regole, controlli, etc -->
        </div>
    </div>
</body>
</html>
```

### Host HTML (struttura schermate)

```html
<div class="game-container">
    <!-- 1. LOBBY -->
    <div id="lobby-screen">
        <h1>[Nome Gioco]</h1>
        <div class="pin-display">
            <div class="pin-label">Inserisci il PIN:</div>
            <div class="pin-code" id="game-pin">----</div>
        </div>
        <div id="players-grid"></div>
        <div>Giocatori: <span id="player-count">0</span>/[MAX]</div>
        <div class="lobby-timer hidden" id="lobby-timer">
            La partita parte tra <span id="lobby-timer-value">50</span>s
        </div>
        <button id="btn-start" class="btn" disabled>AVVIA</button>
    </div>

    <!-- 2. COUNTDOWN -->
    <div id="countdown-screen" class="hidden">
        <div id="countdown-display">3</div>
    </div>

    <!-- 3. GIOCO -->
    <div id="game-screen" class="hidden">
        <!-- Contenuto specifico del gioco -->
    </div>

    <!-- 4. RISULTATI -->
    <div id="results-screen" class="hidden">
        <h1>CLASSIFICA FINALE</h1>
        <div id="podium"></div>
        <div id="full-results"></div>
        <div>Nuova partita tra <span id="results-countdown">30</span>s</div>
        <button id="btn-new-game" class="btn">NUOVA PARTITA</button>
    </div>
</div>
```

### Player HTML (struttura schermate)

```html
<div class="controller-container">
    <!-- 1. JOIN -->
    <div id="join-screen">
        <h1>[Nome Gioco]</h1>
        <input type="text" id="game-pin" maxlength="4" placeholder="----" inputmode="numeric">
        <input type="text" id="nickname" maxlength="12" placeholder="Nickname">
        <button id="btn-join" class="btn">ENTRA</button>
        <div id="error-message"></div>
    </div>

    <!-- 2. LOBBY -->
    <div id="lobby-screen" class="hidden">
        <div>PIN: <span id="display-pin">----</span></div>
        <div id="players-list"></div>
        <div class="lobby-timer hidden" id="lobby-timer">
            La partita parte tra <span id="lobby-timer-value">50</span>s
        </div>
        <div>Attendi che l'host avvii la partita...</div>
    </div>

    <!-- 3. COUNTDOWN -->
    <div id="countdown-screen" class="hidden">
        <div id="countdown-number">3</div>
    </div>

    <!-- 4. GIOCO -->
    <div id="game-screen" class="hidden">
        <!-- Controlli specifici -->
    </div>

    <!-- 5. RISULTATI -->
    <div id="results-screen" class="hidden">
        <div id="your-result"></div>
        <div id="top-three"></div>
        <button id="btn-play-again" class="btn">GIOCA ANCORA</button>
    </div>
</div>
```

---

## CSS Guidelines

### Viewport (OBBLIGATORIO per evitare bottom cutoff)

```css
/* Usare SEMPRE dvh con fallback vh */
body {
    min-height: 100vh;
    min-height: 100dvh;       /* Tiene conto della barra indirizzi mobile */
    overflow: hidden;
}

.game-container {
    height: 100vh;
    height: 100dvh;
}
```

### Common CSS (`common.css`)

Importa sempre common.css come primo stylesheet. Fornisce:
- CSS variables (colori, fonts)
- `.btn`, `.btn-primary`, `.btn-success`, `.btn-danger`
- `.card` (glassmorphism)
- `.hidden` (display: none !important)
- Input styling
- Animazioni: `.fade-in`, `.pulse`, `.shake`

### Cache Busting

Aggiungere `?v=N` a tutti gli asset e incrementare ad ogni modifica:

```html
<link rel="stylesheet" href="/css/common.css?v=2">
<link rel="stylesheet" href="/css/[game]-host.css?v=2">
<script src="/js/[game]-host.js?v=2"></script>
```

---

## Route Express (`index.js`)

```javascript
// Home pages
app.get('/[game]-home', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', '[game]-home.html'));
});

// Host e Player
app.get('/[game]-host', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', '[game]-host.html'));
});

app.get('/[game]-play', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', '[game]-play.html'));
});
```

---

## Card Menu Principale (`index.html`)

```html
<a href="/[game]-home.html" class="game-card [game]">
    <span class="game-icon">[EMOJI]</span>
    <h2 class="game-name">[Nome Gioco]</h2>
    <p class="game-desc">[Descrizione]</p>
    <span class="game-tag">Gioca Ora</span>
</a>
```

Aggiungere il CSS per la card:
```css
.game-card.[game] {
    border-color: [colore-tema];
    background: linear-gradient(135deg, [colore1], [colore2]);
}
```

---

## Logging (OBBLIGATORIO)

Ogni gioco DEVE avere il logging. Aggiungere modulo in `logger.js`:

### Struttura Minima

```javascript
const [game] = {
    gameCreated(pin, hostSocketId) {
        writeLog('[game]', 'INFO', 'GAME', 'Partita creata', { pin, hostSocketId });
    },

    playerJoined(pin, nickname) {
        writeLog('[game]', 'INFO', 'PLAYER', 'Giocatore entrato', { pin, nickname });
    },

    gameStarted(pin, playerCount) {
        writeLog('[game]', 'INFO', 'GAME', 'Partita iniziata', { pin, playerCount });
    },

    gameEnded(pin, rankings) {
        writeLog('[game]', 'INFO', 'GAME', 'Partita terminata', { pin, rankings });
    },

    playerDisconnected(pin, nickname, wasHost) {
        writeLog('[game]', 'WARN', 'DISCONNECT', 'Disconnesso', { pin, nickname, wasHost });
    },

    error(pin, errorType, message, details = {}) {
        writeLog('[game]', 'ERROR', errorType, message, { pin, ...details });
    }
};
```

### Livelli di Log

| Livello | Quando usare |
|---------|-------------|
| `INFO` | Creazione partita, inizio, fine, player join |
| `DEBUG` | Azioni di gioco, turni, risposte |
| `WARN` | Disconnessioni, timeout |
| `ERROR` | Errori logica, stati invalidi |

### Console.log nel Server

Usare `console.log()` per eventi importanti visibili nei log PM2:

```javascript
console.log(`[GAME] creato: PIN ${pin}`);
console.log(`${nickname} si è unito a [GAME] ${pin}`);
console.log(`[GAME] ${pin} terminato`);
```

---

## Checklist Nuovo Gioco

Prima di considerare un gioco completo, verifica:

### Server
- [ ] Game Manager con tutte le funzioni obbligatorie
- [ ] PIN generation con check unicità
- [ ] Validazioni joinGame (partita esiste, lobby, max players, nome duplicato)
- [ ] Socket handlers in index.js (create, join, start, game-specific, input)
- [ ] Room separate per host e player (host NON in room player)
- [ ] Disconnect handler completo (host e player)
- [ ] Timer lobby 50s con reset su join e stop su start/disconnect
- [ ] Countdown 3-2-1 prima del via
- [ ] Game loop con timeout massimo (se applicabile)
- [ ] Logging in logger.js
- [ ] Route Express (home, host, play)

### Client Host
- [ ] 4 schermate: lobby, countdown, gioco, risultati
- [ ] Mostra PIN grande e leggibile
- [ ] Lista giocatori aggiornata in tempo reale
- [ ] Timer lobby visibile
- [ ] Bottone start (disabilitato se 0 player)
- [ ] Handler per `[game]:error` (ri-abilita bottone)
- [ ] Handler per `[game]:host-left`
- [ ] Podio/classifica nei risultati
- [ ] Countdown 30s per nuova partita

### Client Player
- [ ] 5 schermate: join, lobby, countdown, gioco, risultati
- [ ] Input PIN (4 cifre, inputmode numeric)
- [ ] Input nickname (max 12 char)
- [ ] Salvataggio PIN/nickname in sessionStorage
- [ ] Messaggio errore visibile
- [ ] Timer lobby visibile
- [ ] Controlli di gioco (touch-friendly, landscape se necessario)
- [ ] Risultato personale

### CSS
- [ ] `100dvh` con fallback `100vh` su tutti i container fullscreen
- [ ] `overflow: hidden` su body
- [ ] Import common.css
- [ ] Cache busting `?v=N` sugli asset
- [ ] Touch: `-webkit-tap-highlight-color: transparent` e `touch-action: manipulation`
- [ ] Mobile landscape: `user-select: none` se necessario
- [ ] Canvas responsive (se usato): `max-width: 100%`, `max-height: 100%`, resize via JS

### Testing
- [ ] Testare con 1 player
- [ ] Testare con max players
- [ ] Testare disconnessione host durante lobby
- [ ] Testare disconnessione player durante gioco
- [ ] Testare timeout partita (aspettare che scada)
- [ ] Testare timer lobby (aspettare 50s)
- [ ] Testare su mobile (landscape + portrait)
- [ ] Verificare che il fondo dello schermo sia visibile
- [ ] Verificare log in `logs/[game]-YYYY-MM-DD.log`

---

## Errori Comuni da Evitare

| Errore | Conseguenza | Soluzione |
|--------|------------|-----------|
| Host nella room player | Eventi duplicati, doppio render loop, freeze | Host SOLO in `[game]-host:PIN` |
| Nessun timeout partita | Game loop infinito, server si riempie | Max 120s, poi DNF per tutti |
| `100vh` senza `100dvh` | Bottom tagliato su mobile | Aggiungere `100dvh` come fallback |
| Canvas dimensioni fisse | Non si adatta a schermi diversi | Resize dinamico con JS |
| Nessun handler `[game]:error` | Bottone start resta disabilitato | Gestire errore, ri-abilitare |
| Lobby update solo a una room | Host o player non vedono aggiornamenti | Emettere a ENTRAMBE le room |
| Nessun logging | Impossibile debuggare in produzione | Logger obbligatorio |
| `console.log` come unico log | Persi al restart PM2 | Usare `writeLog` su file |
| Timer lobby non stoppato | Auto-start durante partita già avviata | Stop su start manuale e disconnect |
| Player `position` non inviata | HUD mostra "-" | Calcolare e includere in player-state |
