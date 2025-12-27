const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'quiz.db');
const db = new Database(dbPath);

// Abilita foreign keys
db.pragma('foreign_keys = ON');

// Crea le tabelle
db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL,
        option_c TEXT NOT NULL,
        option_d TEXT NOT NULL,
        correct_answer CHAR(1) NOT NULL,
        category TEXT DEFAULT 'generale',
        difficulty INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pin VARCHAR(6) NOT NULL UNIQUE,
        status TEXT DEFAULT 'lobby',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        finished_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        nickname TEXT NOT NULL,
        score INTEGER DEFAULT 0,
        abilities_used TEXT DEFAULT '{"steal":false,"double":false,"block":false}',
        connected BOOLEAN DEFAULT 1,
        FOREIGN KEY (game_id) REFERENCES games(id)
    );

    CREATE TABLE IF NOT EXISTS game_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        answer CHAR(1),
        correct BOOLEAN,
        points_earned INTEGER DEFAULT 0,
        response_time_ms INTEGER,
        ability_used TEXT,
        ability_target_id INTEGER,
        FOREIGN KEY (game_id) REFERENCES games(id),
        FOREIGN KEY (player_id) REFERENCES players(id),
        FOREIGN KEY (question_id) REFERENCES questions(id)
    );
`);

// Query preparate
const queries = {
    // Games
    createGame: db.prepare('INSERT INTO games (pin) VALUES (?)'),
    getGameByPin: db.prepare('SELECT * FROM games WHERE pin = ?'),
    updateGameStatus: db.prepare("UPDATE games SET status = ?, finished_at = CASE WHEN ? = 'finished' THEN CURRENT_TIMESTAMP ELSE finished_at END WHERE id = ?"),

    // Players
    addPlayer: db.prepare('INSERT INTO players (game_id, nickname) VALUES (?, ?)'),
    getPlayersByGame: db.prepare('SELECT * FROM players WHERE game_id = ? ORDER BY score DESC'),
    getPlayerByNickname: db.prepare('SELECT * FROM players WHERE game_id = ? AND nickname = ?'),
    updatePlayerScore: db.prepare('UPDATE players SET score = score + ? WHERE id = ?'),
    updatePlayerAbilities: db.prepare('UPDATE players SET abilities_used = ? WHERE id = ?'),
    setPlayerConnected: db.prepare('UPDATE players SET connected = ? WHERE id = ?'),

    // Questions
    getRandomQuestions: db.prepare('SELECT * FROM questions ORDER BY RANDOM() LIMIT ?'),
    countQuestions: db.prepare('SELECT COUNT(*) as count FROM questions'),
    insertQuestion: db.prepare('INSERT INTO questions (text, option_a, option_b, option_c, option_d, correct_answer, category, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),

    // History
    addHistory: db.prepare('INSERT INTO game_history (game_id, player_id, question_id, answer, correct, points_earned, response_time_ms, ability_used, ability_target_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
};

// Genera un PIN unico di 4 cifre
function generateUniquePin() {
    let pin;
    let attempts = 0;
    do {
        pin = String(Math.floor(1000 + Math.random() * 9000));
        attempts++;
        if (attempts > 100) throw new Error('Impossibile generare PIN unico');
    } while (queries.getGameByPin.get(pin));
    return pin;
}

// Inserisci domande di esempio se il database è vuoto
function seedQuestions() {
    const count = queries.countQuestions.get().count;
    if (count > 0) return;

    const sampleQuestions = [
        ['Qual è il pianeta più vicino al Sole?', 'Mercurio', 'Venere', 'Terra', 'Marte', 'A', 'scienza', 1],
        ['In che anno è caduto il Muro di Berlino?', '1985', '1989', '1991', '1993', 'B', 'storia', 2],
        ['Qual è la capitale dell\'Australia?', 'Sydney', 'Melbourne', 'Canberra', 'Perth', 'C', 'geografia', 2],
        ['Chi ha dipinto la Gioconda?', 'Michelangelo', 'Raffaello', 'Caravaggio', 'Leonardo da Vinci', 'D', 'arte', 1],
        ['Quanti lati ha un ettagono?', '6', '7', '8', '9', 'B', 'matematica', 1],
        ['Qual è l\'elemento chimico con simbolo "Au"?', 'Argento', 'Oro', 'Alluminio', 'Arsenico', 'B', 'scienza', 1],
        ['Chi ha scritto "La Divina Commedia"?', 'Petrarca', 'Boccaccio', 'Dante Alighieri', 'Ariosto', 'C', 'letteratura', 1],
        ['In quale oceano si trova il Triangolo delle Bermuda?', 'Pacifico', 'Indiano', 'Atlantico', 'Artico', 'C', 'geografia', 2],
        ['Qual è il mammifero più grande del mondo?', 'Elefante africano', 'Balenottera azzurra', 'Orca', 'Squalo balena', 'B', 'natura', 1],
        ['Quante corde ha una chitarra classica?', '4', '5', '6', '8', 'C', 'musica', 1],
        ['Quale paese ha vinto più Mondiali di calcio?', 'Germania', 'Argentina', 'Italia', 'Brasile', 'D', 'sport', 1],
        ['In che anno fu fondata Roma secondo la tradizione?', '753 a.C.', '509 a.C.', '476 d.C.', '800 a.C.', 'A', 'storia', 2],
        ['Qual è il fiume più lungo del mondo?', 'Nilo', 'Rio delle Amazzoni', 'Yangtze', 'Mississippi', 'B', 'geografia', 2],
        ['Chi ha formulato la teoria della relatività?', 'Newton', 'Einstein', 'Galileo', 'Hawking', 'B', 'scienza', 1],
        ['Quale di questi è un numero primo?', '15', '21', '17', '27', 'C', 'matematica', 1],
        ['In quale città si trova il Colosseo?', 'Atene', 'Roma', 'Napoli', 'Firenze', 'B', 'cultura', 1],
        ['Quanti pianeti ci sono nel Sistema Solare?', '7', '8', '9', '10', 'B', 'scienza', 1],
        ['Chi è l\'autore di "1984"?', 'Aldous Huxley', 'Ray Bradbury', 'George Orwell', 'Philip K. Dick', 'C', 'letteratura', 2],
        ['Quale paese ha la bandiera con la foglia d\'acero?', 'USA', 'Australia', 'Canada', 'Nuova Zelanda', 'C', 'geografia', 1],
        ['Quanti gradi ha un angolo retto?', '45', '90', '180', '360', 'B', 'matematica', 1]
    ];

    const insert = db.transaction((questions) => {
        for (const q of questions) {
            queries.insertQuestion.run(...q);
        }
    });

    insert(sampleQuestions);
    console.log(`Inserite ${sampleQuestions.length} domande di esempio`);
}

seedQuestions();

module.exports = { db, queries, generateUniquePin };
