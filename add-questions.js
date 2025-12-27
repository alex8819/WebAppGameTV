const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'database', 'quiz.db'));

const questions = [
    // TARANTO - Storia e Geografia (25 domande)
    ['In che anno fu fondata Taranto secondo la tradizione?', '706 a.C.', '510 a.C.', '850 a.C.', '264 a.C.', 'A', 'taranto'],
    ['Taranto è chiamata "la città dei..."?', 'Due mari', 'Tre ponti', 'Cento chiese', 'Mille ulivi', 'A', 'taranto'],
    ['Di quale civiltà greca Taranto fu colonia?', 'Sparta', 'Atene', 'Corinto', 'Tebe', 'A', 'taranto'],
    ['Come si chiamano i due mari che bagnano Taranto?', 'Mar Grande e Mar Piccolo', 'Mar Ionio e Mar Adriatico', 'Mar Alto e Mar Basso', 'Mar Interno e Mar Esterno', 'A', 'taranto'],
    ['Chi era Taras secondo la mitologia greca?', 'Figlio di Poseidone', 'Figlio di Zeus', 'Figlio di Apollo', 'Figlio di Ares', 'A', 'taranto'],
    ['Su cosa viaggiava Taras quando arrivò a Taranto?', 'Un delfino', 'Una nave', 'Un cavallo marino', 'Un aquila', 'A', 'taranto'],
    ['Quale museo famoso si trova a Taranto?', 'MArTA', 'MUSA', 'MART', 'MAXXI', 'A', 'taranto'],
    ['A quale secolo risale il Tempio Dorico di Taranto?', 'VI secolo a.C.', 'III secolo a.C.', 'I secolo d.C.', 'V secolo d.C.', 'A', 'taranto'],
    ['Chi fece costruire il Castello Aragonese di Taranto?', 'Ferdinando II d\'Aragona', 'Federico II di Svevia', 'Carlo V', 'Alfonso I', 'A', 'taranto'],
    ['Qual è la cattedrale più antica della Puglia romanica?', 'San Cataldo a Taranto', 'San Nicola a Bari', 'Santa Maria a Lecce', 'San Sabino a Canosa', 'A', 'taranto'],
    ['Chi è il santo patrono di Taranto?', 'San Cataldo', 'San Nicola', 'San Michele', 'San Vito', 'A', 'taranto'],
    ['Quando avvenne "La notte di Taranto" durante la WWII?', '11-12 novembre 1940', '8 settembre 1943', '25 luglio 1943', '6 giugno 1944', 'A', 'taranto'],
    ['Chi attaccò Taranto nella "Notte di Taranto"?', 'Royal Navy britannica', 'US Navy americana', 'Luftwaffe tedesca', 'Marina francese', 'A', 'taranto'],
    ['Quale famoso compositore nacque a Taranto?', 'Giovanni Paisiello', 'Gioachino Rossini', 'Giuseppe Verdi', 'Giacomo Puccini', 'A', 'taranto'],
    ['Come si chiamano le isole di fronte a Taranto?', 'Isole Cheradi', 'Isole Tremiti', 'Isole Eolie', 'Isole Ponziane', 'A', 'taranto'],
    ['Quante isole compongono le Cheradi?', 'Tre', 'Due', 'Cinque', 'Sette', 'A', 'taranto'],
    ['Quale filosofo e matematico era di Taranto?', 'Archita', 'Pitagora', 'Aristotele', 'Platone', 'A', 'taranto'],
    ['Di cosa era capitale Taranto nell\'antichità?', 'Magna Grecia', 'Impero Romano', 'Regno di Napoli', 'Sicilia', 'A', 'taranto'],
    ['Quanto durò il Principato di Taranto?', '377 anni', '200 anni', '500 anni', '100 anni', 'A', 'taranto'],
    ['In che periodo esistette il Principato di Taranto?', '1088-1465', '800-1200', '1500-1800', '500-900', 'A', 'taranto'],
    ['Quale industria è storicamente importante a Taranto?', 'Siderurgica', 'Tessile', 'Automobilistica', 'Alimentare', 'A', 'taranto'],
    ['In quale regione si trova Taranto?', 'Puglia', 'Calabria', 'Basilicata', 'Campania', 'A', 'taranto'],
    ['Cosa si può ammirare al MArTA di Taranto?', 'Gli ori di Taranto', 'I bronzi di Riace', 'I marmi del Partenone', 'Le ceramiche etrusche', 'A', 'taranto'],
    ['A chi apparteneva in origine il Castello Aragonese?', 'I Bizantini', 'I Romani', 'I Greci', 'I Longobardi', 'A', 'taranto'],
    ['A chi appartiene oggi il Castello Aragonese?', 'Marina Militare Italiana', 'Comune di Taranto', 'Regione Puglia', 'Stato Italiano', 'A', 'taranto'],

    // PUGLIA - Storia, Geografia e Cultura (25 domande)
    ['Quanti siti UNESCO ha la Puglia?', 'Tre', 'Due', 'Cinque', 'Uno', 'A', 'puglia'],
    ['Chi fece costruire Castel del Monte?', 'Federico II di Svevia', 'Federico Barbarossa', 'Carlo Magno', 'Ruggero II', 'A', 'puglia'],
    ['Quale forma ha Castel del Monte?', 'Ottagonale', 'Quadrata', 'Circolare', 'Esagonale', 'A', 'puglia'],
    ['Dove si trovano i famosi Trulli?', 'Alberobello', 'Lecce', 'Bari', 'Foggia', 'A', 'puglia'],
    ['Come sono costruiti i Trulli?', 'Senza malta', 'Con cemento', 'Con mattoni', 'Con legno', 'A', 'puglia'],
    ['Quale città pugliese è detta "del Barocco"?', 'Lecce', 'Bari', 'Taranto', 'Brindisi', 'A', 'puglia'],
    ['Chi è il santo patrono di Bari?', 'San Nicola', 'San Cataldo', 'San Michele', 'Sant\'Oronzo', 'A', 'puglia'],
    ['Quando si festeggia San Nicola a Bari?', '6 dicembre', '25 dicembre', '15 agosto', '1 maggio', 'A', 'puglia'],
    ['Come si chiama la danza tradizionale pugliese?', 'Taranta', 'Tarantella', 'Pizzica', 'Saltarello', 'A', 'puglia'],
    ['Quale città ha il Carnevale più famoso della Puglia?', 'Putignano', 'Bari', 'Lecce', 'Foggia', 'A', 'puglia'],
    ['Qual è il punto più a Est d\'Italia?', 'Otranto', 'Lecce', 'Brindisi', 'Taranto', 'A', 'puglia'],
    ['Come è chiamata Otranto?', 'Città dei Martiri', 'Città Bianca', 'Città del Sole', 'Città del Mare', 'A', 'puglia'],
    ['Come sono chiamate Ostuni, Cisternino e simili?', 'Città bianche', 'Città rosse', 'Città blu', 'Città verdi', 'A', 'puglia'],
    ['Perché le città pugliesi erano dipinte di bianco?', 'Protezione da epidemie', 'Motivi estetici', 'Per il caldo', 'Tradizione greca', 'A', 'puglia'],
    ['Dove si trova il Santuario di San Michele Arcangelo?', 'Monte Sant\'Angelo', 'San Giovanni Rotondo', 'Bari', 'Lecce', 'A', 'puglia'],
    ['In quale valle si trovano i Trulli?', 'Valle d\'Itria', 'Valle dei Templi', 'Val di Noto', 'Valle Caudina', 'A', 'puglia'],
    ['Quale strumento accompagna la Taranta?', 'Tamburello', 'Fisarmonica', 'Mandolino', 'Tutti questi', 'D', 'puglia'],
    ['Cosa sono le "cartellate" pugliesi?', 'Dolci natalizi', 'Paste salate', 'Focacce', 'Taralli', 'A', 'puglia'],
    ['Per cosa sono famosi gli ulivi pugliesi?', 'Sono millenari', 'Sono i più alti', 'Sono rossi', 'Sono nani', 'A', 'puglia'],
    ['Quale minoranza linguistica vive in Puglia?', 'Grika', 'Ladina', 'Sarda', 'Friulana', 'A', 'puglia'],
    ['Dove si trova il santuario di Finibus Terrae?', 'Santa Maria di Leuca', 'Otranto', 'Gallipoli', 'Taranto', 'A', 'puglia'],
    ['Quale castello domina Bari Vecchia?', 'Castello Normanno Svevo', 'Castel del Monte', 'Castello Aragonese', 'Castello Federiciano', 'A', 'puglia'],
    ['Cosa si produce tradizionalmente a Lecce?', 'Oggetti in cartapesta', 'Ceramiche', 'Vetro soffiato', 'Tessuti', 'A', 'puglia'],
    ['Quale mare bagna la Puglia a est?', 'Mar Adriatico', 'Mar Tirreno', 'Mar Ligure', 'Mar Ionio', 'A', 'puglia'],
    ['Quante province ha la Puglia?', 'Sei', 'Cinque', 'Quattro', 'Sette', 'A', 'puglia'],

    // ITALIA - Geografia (25 domande)
    ['Qual è la montagna più alta d\'Italia?', 'Monte Bianco', 'Monte Rosa', 'Cervino', 'Gran Paradiso', 'A', 'italia'],
    ['Qual è il fiume più lungo d\'Italia?', 'Po', 'Tevere', 'Adige', 'Arno', 'A', 'italia'],
    ['Quante regioni ha l\'Italia?', 'Venti', 'Diciotto', 'Ventidue', 'Quindici', 'A', 'italia'],
    ['Quale lago italiano è il più grande?', 'Lago di Garda', 'Lago Maggiore', 'Lago di Como', 'Lago Trasimeno', 'A', 'italia'],
    ['Quale vulcano si trova in Sicilia?', 'Etna', 'Vesuvio', 'Stromboli', 'Vulcano', 'A', 'italia'],
    ['Quale città è attraversata dal fiume Arno?', 'Firenze', 'Roma', 'Milano', 'Napoli', 'A', 'italia'],
    ['In quale regione si trova Venezia?', 'Veneto', 'Friuli Venezia Giulia', 'Emilia-Romagna', 'Lombardia', 'A', 'italia'],
    ['Quale isola italiana è la più grande?', 'Sicilia', 'Sardegna', 'Elba', 'Capri', 'A', 'italia'],
    ['Con quanti Stati confina l\'Italia?', 'Quattro', 'Tre', 'Cinque', 'Due', 'A', 'italia'],
    ['Qual è la capitale della Lombardia?', 'Milano', 'Brescia', 'Bergamo', 'Como', 'A', 'italia'],
    ['Dove si trova la Costiera Amalfitana?', 'Campania', 'Calabria', 'Puglia', 'Liguria', 'A', 'italia'],
    ['Quale regione ha come capoluogo Torino?', 'Piemonte', 'Lombardia', 'Liguria', 'Valle d\'Aosta', 'A', 'italia'],
    ['In quale mare si trova la Sardegna?', 'Mar Tirreno', 'Mar Adriatico', 'Mar Ionio', 'Mar Ligure', 'A', 'italia'],
    ['Quale città è famosa per la torre pendente?', 'Pisa', 'Bologna', 'Siena', 'Lucca', 'A', 'italia'],
    ['Dove si trovano le Cinque Terre?', 'Liguria', 'Toscana', 'Emilia-Romagna', 'Veneto', 'A', 'italia'],
    ['Quale regione italiana è la più piccola?', 'Valle d\'Aosta', 'Molise', 'Liguria', 'Umbria', 'A', 'italia'],
    ['In quale regione si trova Matera?', 'Basilicata', 'Puglia', 'Calabria', 'Campania', 'A', 'italia'],
    ['Qual è la città più popolosa d\'Italia?', 'Roma', 'Milano', 'Napoli', 'Torino', 'A', 'italia'],
    ['Quale stretto separa Sicilia e Calabria?', 'Stretto di Messina', 'Stretto di Gibilterra', 'Stretto del Bosforo', 'Canale di Sicilia', 'A', 'italia'],
    ['Dove si trova il Gran Sasso?', 'Abruzzo', 'Marche', 'Umbria', 'Lazio', 'A', 'italia'],
    ['Quale regione confina solo con la Francia?', 'Valle d\'Aosta', 'Piemonte', 'Liguria', 'Lombardia', 'A', 'italia'],
    ['In quale città si trova il Colosseo?', 'Roma', 'Napoli', 'Verona', 'Firenze', 'A', 'italia'],
    ['Quale fiume attraversa Roma?', 'Tevere', 'Po', 'Arno', 'Adige', 'A', 'italia'],
    ['Dove si trova la Valle dei Templi?', 'Sicilia', 'Campania', 'Calabria', 'Puglia', 'A', 'italia'],
    ['Qual è il golfo più grande d\'Italia?', 'Golfo di Taranto', 'Golfo di Napoli', 'Golfo di Genova', 'Golfo di Venezia', 'A', 'italia'],

    // ITALIA - Storia (25 domande)
    ['In che anno l\'Italia divenne una repubblica?', '1946', '1948', '1945', '1950', 'A', 'italia'],
    ['Chi fu il primo Presidente della Repubblica Italiana?', 'Enrico De Nicola', 'Luigi Einaudi', 'Giovanni Gronchi', 'Alcide De Gasperi', 'A', 'italia'],
    ['In che anno fu unificata l\'Italia?', '1861', '1848', '1870', '1815', 'A', 'italia'],
    ['Chi fu il primo Re d\'Italia?', 'Vittorio Emanuele II', 'Vittorio Emanuele I', 'Umberto I', 'Carlo Alberto', 'A', 'italia'],
    ['Chi guidò la spedizione dei Mille?', 'Giuseppe Garibaldi', 'Giuseppe Mazzini', 'Camillo Cavour', 'Vittorio Emanuele II', 'A', 'italia'],
    ['Quando Roma divenne capitale d\'Italia?', '1871', '1861', '1870', '1866', 'A', 'italia'],
    ['Quale imperatore romano costruì il Colosseo?', 'Vespasiano', 'Nerone', 'Augusto', 'Traiano', 'A', 'italia'],
    ['In che anno cadde l\'Impero Romano d\'Occidente?', '476 d.C.', '410 d.C.', '395 d.C.', '500 d.C.', 'A', 'italia'],
    ['Chi scoprì l\'America nel 1492?', 'Cristoforo Colombo', 'Amerigo Vespucci', 'Marco Polo', 'Giovanni Caboto', 'A', 'italia'],
    ['Quale famiglia governò Firenze nel Rinascimento?', 'Medici', 'Borgia', 'Sforza', 'Este', 'A', 'italia'],
    ['Chi dipinse la Cappella Sistina?', 'Michelangelo', 'Leonardo da Vinci', 'Raffaello', 'Botticelli', 'A', 'italia'],
    ['In che anno iniziò la Prima Guerra Mondiale per l\'Italia?', '1915', '1914', '1916', '1917', 'A', 'italia'],
    ['Chi fu il dittatore fascista italiano?', 'Benito Mussolini', 'Vittorio Emanuele III', 'Galeazzo Ciano', 'Pietro Badoglio', 'A', 'italia'],
    ['Quando finì la Seconda Guerra Mondiale in Italia?', '25 aprile 1945', '8 settembre 1943', '2 giugno 1946', '4 novembre 1918', 'A', 'italia'],
    ['Chi scrisse la Divina Commedia?', 'Dante Alighieri', 'Francesco Petrarca', 'Giovanni Boccaccio', 'Ludovico Ariosto', 'A', 'italia'],
    ['Quale città fu capitale prima di Roma?', 'Firenze', 'Torino', 'Milano', 'Napoli', 'A', 'italia'],
    ['In che anno fu firmata la Costituzione Italiana?', '1948', '1946', '1947', '1950', 'A', 'italia'],
    ['Chi inventò la radio?', 'Guglielmo Marconi', 'Alessandro Volta', 'Antonio Meucci', 'Galileo Galilei', 'A', 'italia'],
    ['Quale scienziato italiano inventò la pila?', 'Alessandro Volta', 'Guglielmo Marconi', 'Galileo Galilei', 'Enrico Fermi', 'A', 'italia'],
    ['Chi fondò Roma secondo la leggenda?', 'Romolo e Remo', 'Enea', 'Cesare', 'Augusto', 'A', 'italia'],
    ['In che anno Pompei fu distrutta dal Vesuvio?', '79 d.C.', '100 d.C.', '50 a.C.', '200 d.C.', 'A', 'italia'],
    ['Chi fu Leonardo da Vinci?', 'Artista e scienziato', 'Solo pittore', 'Solo scultore', 'Solo inventore', 'A', 'italia'],
    ['Quale esploratore veneziano viaggiò in Cina?', 'Marco Polo', 'Cristoforo Colombo', 'Amerigo Vespucci', 'Giovanni Caboto', 'A', 'italia'],
    ['In che anno l\'Italia entrò nell\'UE?', '1957 (fondatore)', '1973', '1986', '1995', 'A', 'italia'],
    ['Chi fu Giulio Cesare?', 'Generale e politico romano', 'Imperatore', 'Filosofo greco', 'Re d\'Italia', 'A', 'italia'],

    // SCIENZA (25 domande)
    ['Qual è il pianeta più grande del sistema solare?', 'Giove', 'Saturno', 'Nettuno', 'Urano', 'A', 'scienza'],
    ['Quanti pianeti ci sono nel sistema solare?', 'Otto', 'Nove', 'Sette', 'Dieci', 'A', 'scienza'],
    ['Qual è l\'elemento più abbondante nell\'universo?', 'Idrogeno', 'Elio', 'Ossigeno', 'Carbonio', 'A', 'scienza'],
    ['Cosa misura il termometro?', 'Temperatura', 'Pressione', 'Umidità', 'Velocità', 'A', 'scienza'],
    ['Quanti cromosomi ha l\'essere umano?', '46', '44', '48', '42', 'A', 'scienza'],
    ['Qual è la velocità della luce?', '300.000 km/s', '150.000 km/s', '500.000 km/s', '100.000 km/s', 'A', 'scienza'],
    ['Quale gas respiriamo principalmente?', 'Azoto', 'Ossigeno', 'Anidride carbonica', 'Argon', 'A', 'scienza'],
    ['Qual è il simbolo chimico dell\'oro?', 'Au', 'Ag', 'Fe', 'Cu', 'A', 'scienza'],
    ['Quante ossa ha il corpo umano adulto?', '206', '208', '200', '212', 'A', 'scienza'],
    ['Chi formulò la teoria della relatività?', 'Albert Einstein', 'Isaac Newton', 'Galileo Galilei', 'Stephen Hawking', 'A', 'scienza'],
    ['Qual è l\'organo più grande del corpo umano?', 'La pelle', 'Il fegato', 'Il cervello', 'I polmoni', 'A', 'scienza'],
    ['Quanti litri di sangue ha un adulto?', 'Circa 5 litri', 'Circa 3 litri', 'Circa 8 litri', 'Circa 10 litri', 'A', 'scienza'],
    ['Qual è il pianeta più vicino al Sole?', 'Mercurio', 'Venere', 'Marte', 'Terra', 'A', 'scienza'],
    ['Cosa studia la botanica?', 'Le piante', 'Gli animali', 'Le rocce', 'Le stelle', 'A', 'scienza'],
    ['Qual è la formula dell\'acqua?', 'H2O', 'CO2', 'NaCl', 'O2', 'A', 'scienza'],
    ['Quanti giorni impiega la Terra a girare intorno al Sole?', '365', '360', '366', '300', 'A', 'scienza'],
    ['Quale pianeta è noto come pianeta rosso?', 'Marte', 'Giove', 'Saturno', 'Venere', 'A', 'scienza'],
    ['Chi formulò la legge di gravità?', 'Isaac Newton', 'Albert Einstein', 'Galileo Galilei', 'Archimede', 'A', 'scienza'],
    ['Qual è il punto di ebollizione dell\'acqua?', '100°C', '90°C', '110°C', '80°C', 'A', 'scienza'],
    ['Cosa studia l\'astronomia?', 'I corpi celesti', 'Il tempo atmosferico', 'Gli oceani', 'I vulcani', 'A', 'scienza'],
    ['Qual è il satellite naturale della Terra?', 'La Luna', 'Phobos', 'Europa', 'Titano', 'A', 'scienza'],
    ['Quanti elementi ci sono nella tavola periodica?', 'Circa 118', 'Circa 100', 'Circa 150', 'Circa 80', 'A', 'scienza'],
    ['Quale gas assorbono le piante?', 'Anidride carbonica', 'Ossigeno', 'Azoto', 'Metano', 'A', 'scienza'],
    ['Cosa produce la fotosintesi?', 'Ossigeno e glucosio', 'Solo ossigeno', 'Anidride carbonica', 'Azoto', 'A', 'scienza'],
    ['Quale parte del cervello controlla l\'equilibrio?', 'Cervelletto', 'Cervello', 'Midollo', 'Ipotalamo', 'A', 'scienza'],

    // SPORT (20 domande)
    ['Quanti giocatori ci sono in una squadra di calcio?', 'Undici', 'Dieci', 'Dodici', 'Nove', 'A', 'sport'],
    ['Quale squadra ha vinto più Mondiali di calcio?', 'Brasile', 'Germania', 'Italia', 'Argentina', 'A', 'sport'],
    ['Quanto dura una partita di calcio regolamentare?', '90 minuti', '80 minuti', '100 minuti', '70 minuti', 'A', 'sport'],
    ['In quale sport si usa il termine "ace"?', 'Tennis', 'Golf', 'Pallavolo', 'Basket', 'A', 'sport'],
    ['Quanti set servono per vincere a tennis maschile Slam?', 'Tre su cinque', 'Due su tre', 'Quattro su sette', 'Tre su quattro', 'A', 'sport'],
    ['Quale paese ha inventato il basket?', 'Stati Uniti', 'Canada', 'Inghilterra', 'Francia', 'A', 'sport'],
    ['Quanti punti vale un canestro da 3 punti?', 'Tre', 'Due', 'Quattro', 'Uno', 'A', 'sport'],
    ['Dove si svolsero le Olimpiadi del 2020?', 'Tokyo', 'Parigi', 'Pechino', 'Londra', 'A', 'sport'],
    ['Ogni quanti anni si tengono le Olimpiadi?', 'Quattro', 'Due', 'Tre', 'Cinque', 'A', 'sport'],
    ['In quale sport si usa il termine "home run"?', 'Baseball', 'Cricket', 'Golf', 'Rugby', 'A', 'sport'],
    ['Quanti giocatori ci sono in una squadra di pallavolo?', 'Sei', 'Cinque', 'Sette', 'Otto', 'A', 'sport'],
    ['Chi ha vinto più palloni d\'oro?', 'Lionel Messi', 'Cristiano Ronaldo', 'Johan Cruyff', 'Michel Platini', 'A', 'sport'],
    ['Quale sport pratica Jannik Sinner?', 'Tennis', 'Sci', 'Calcio', 'Nuoto', 'A', 'sport'],
    ['In quale sport si corre il Tour de France?', 'Ciclismo', 'Atletica', 'Automobilismo', 'Motociclismo', 'A', 'sport'],
    ['Quale nazionale ha vinto i Mondiali 2006?', 'Italia', 'Francia', 'Germania', 'Brasile', 'A', 'sport'],
    ['Chi è stato il pilota F1 più vincente?', 'Lewis Hamilton', 'Michael Schumacher', 'Ayrton Senna', 'Sebastian Vettel', 'A', 'sport'],
    ['Quanti anelli ha il simbolo olimpico?', 'Cinque', 'Quattro', 'Sei', 'Tre', 'A', 'sport'],
    ['Di che colore è la maglia del leader al Giro?', 'Rosa', 'Gialla', 'Verde', 'Blu', 'A', 'sport'],
    ['Dove si terranno le Olimpiadi 2024?', 'Parigi', 'Los Angeles', 'Brisbane', 'Roma', 'A', 'sport'],
    ['Chi è il calciatore più pagato al mondo nel 2024?', 'Cristiano Ronaldo', 'Lionel Messi', 'Kylian Mbappé', 'Neymar', 'A', 'sport'],

    // INTRATTENIMENTO (20 domande)
    ['Chi ha diretto il film "Titanic"?', 'James Cameron', 'Steven Spielberg', 'Martin Scorsese', 'Christopher Nolan', 'A', 'intrattenimento'],
    ['Quale film Disney racconta la storia di un leone?', 'Il Re Leone', 'Il Libro della Giungla', 'Tarzan', 'Bambi', 'A', 'intrattenimento'],
    ['Chi è l\'autore di Harry Potter?', 'J.K. Rowling', 'Stephen King', 'J.R.R. Tolkien', 'George R.R. Martin', 'A', 'intrattenimento'],
    ['Quale band ha cantato "Bohemian Rhapsody"?', 'Queen', 'The Beatles', 'Led Zeppelin', 'Pink Floyd', 'A', 'intrattenimento'],
    ['Chi è l\'interprete di Iron Man nel MCU?', 'Robert Downey Jr.', 'Chris Evans', 'Chris Hemsworth', 'Mark Ruffalo', 'A', 'intrattenimento'],
    ['Quale serie TV racconta di un professore e una rapina?', 'La Casa di Carta', 'Breaking Bad', 'Narcos', 'Prison Break', 'A', 'intrattenimento'],
    ['Chi canta "Shallow" con Lady Gaga?', 'Bradley Cooper', 'Adam Levine', 'Justin Timberlake', 'Bruno Mars', 'A', 'intrattenimento'],
    ['Quale film ha vinto l\'Oscar 2024 come miglior film?', 'Oppenheimer', 'Barbie', 'Killers of the Flower Moon', 'Poor Things', 'A', 'intrattenimento'],
    ['Quale saga ha come protagonista Frodo?', 'Il Signore degli Anelli', 'Harry Potter', 'Narnia', 'Game of Thrones', 'A', 'intrattenimento'],
    ['Chi interpreta Jack Sparrow?', 'Johnny Depp', 'Orlando Bloom', 'Javier Bardem', 'Geoffrey Rush', 'A', 'intrattenimento'],
    ['Quale cantante italiana ha vinto Sanremo 2024?', 'Angelina Mango', 'Annalisa', 'Geolier', 'Mahmood', 'A', 'intrattenimento'],
    ['Chi ha scritto "I Promessi Sposi"?', 'Alessandro Manzoni', 'Giovanni Verga', 'Ugo Foscolo', 'Giacomo Leopardi', 'A', 'intrattenimento'],
    ['Quale attore italiano ha vinto l\'Oscar?', 'Roberto Benigni', 'Marcello Mastroianni', 'Alberto Sordi', 'Vittorio Gassman', 'A', 'intrattenimento'],
    ['Chi è il regista di "La Dolce Vita"?', 'Federico Fellini', 'Michelangelo Antonioni', 'Luchino Visconti', 'Vittorio De Sica', 'A', 'intrattenimento'],
    ['Quale supereroe viene da Krypton?', 'Superman', 'Batman', 'Spider-Man', 'Flash', 'A', 'intrattenimento'],
    ['Chi ha cantato "Nel blu dipinto di blu"?', 'Domenico Modugno', 'Adriano Celentano', 'Mina', 'Lucio Dalla', 'A', 'intrattenimento'],
    ['Quale serie Netflix è ambientata in un liceo spagnolo?', 'Elite', 'La Casa di Carta', 'Vis a Vis', 'Las Chicas del Cable', 'A', 'intrattenimento'],
    ['Chi è il protagonista di "Forrest Gump"?', 'Tom Hanks', 'Robin Williams', 'Jim Carrey', 'Kevin Costner', 'A', 'intrattenimento'],
    ['Quale band ha cantato "Stairway to Heaven"?', 'Led Zeppelin', 'Pink Floyd', 'The Rolling Stones', 'The Who', 'A', 'intrattenimento'],
    ['Chi ha vinto X Factor Italia 2023?', 'Sarafine', 'Francamente', 'Lumen', 'Disco Club Paradiso', 'A', 'intrattenimento'],

    // CULTURA GENERALE (20 domande)
    ['Quale animale è simbolo di saggezza?', 'Gufo', 'Aquila', 'Leone', 'Elefante', 'A', 'generale'],
    ['Quanti giorni ha febbraio in un anno bisestile?', '29', '28', '30', '27', 'A', 'generale'],
    ['Quale nota musicale viene dopo il DO?', 'RE', 'MI', 'FA', 'SOL', 'A', 'generale'],
    ['Di che colore è lo smeraldo?', 'Verde', 'Blu', 'Rosso', 'Giallo', 'A', 'generale'],
    ['Quanti lati ha un pentagono?', 'Cinque', 'Sei', 'Quattro', 'Sette', 'A', 'generale'],
    ['Quale paese ha la bandiera con il sole rosso?', 'Giappone', 'Cina', 'Corea', 'Vietnam', 'A', 'generale'],
    ['Come si chiama il verso del lupo?', 'Ululato', 'Latrato', 'Ruggito', 'Guaito', 'A', 'generale'],
    ['Quante lettere ha l\'alfabeto italiano?', '21', '26', '24', '22', 'A', 'generale'],
    ['Quale festa si celebra il 25 dicembre?', 'Natale', 'Capodanno', 'Epifania', 'Pasqua', 'A', 'generale'],
    ['Di che colore è il semaforo quando bisogna fermarsi?', 'Rosso', 'Verde', 'Giallo', 'Arancione', 'A', 'generale'],
    ['Quante sono le note musicali?', 'Sette', 'Cinque', 'Otto', 'Sei', 'A', 'generale'],
    ['In quale continente si trova l\'Egitto?', 'Africa', 'Asia', 'Europa', 'Medio Oriente', 'A', 'generale'],
    ['Quale organo pompa il sangue?', 'Cuore', 'Polmoni', 'Fegato', 'Reni', 'A', 'generale'],
    ['Quanti minuti ci sono in un\'ora?', '60', '100', '50', '45', 'A', 'generale'],
    ['Chi ha inventato la lampadina?', 'Thomas Edison', 'Nikola Tesla', 'Benjamin Franklin', 'Alexander Bell', 'A', 'generale'],
    ['Quale frutto è simbolo di New York?', 'Mela', 'Arancia', 'Pesca', 'Ciliegia', 'A', 'generale'],
    ['Quanti sensi ha l\'essere umano?', 'Cinque', 'Quattro', 'Sei', 'Sette', 'A', 'generale'],
    ['Quale metallo è liquido a temperatura ambiente?', 'Mercurio', 'Piombo', 'Argento', 'Zinco', 'A', 'generale'],
    ['Di che colore è il rubino?', 'Rosso', 'Blu', 'Verde', 'Viola', 'A', 'generale'],
    ['Qual è la capitale della Francia?', 'Parigi', 'Londra', 'Berlino', 'Madrid', 'A', 'generale']
];

const insert = db.prepare(`
    INSERT INTO questions (text, option_a, option_b, option_c, option_d, correct_answer, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertMany = db.transaction((questions) => {
    for (const q of questions) {
        insert.run(q[0], q[1], q[2], q[3], q[4], q[5], q[6]);
    }
});

try {
    insertMany(questions);
    console.log(`✅ Aggiunte ${questions.length} nuove domande al database!`);

    // Conta totale domande
    const count = db.prepare('SELECT COUNT(*) as total FROM questions').get();
    console.log(`📊 Totale domande nel database: ${count.total}`);
} catch (err) {
    console.error('❌ Errore:', err.message);
}

db.close();
