# Quiz Incordatore FITP

Applicazione web statica per esercitarsi sulle domande dell'esame ufficiale FITP (Federazione Italiana Tennis e Padel) per la certificazione di **incordatore**.

Contiene una banca di **360 domande** (sessione 2025), organizzate nei moduli ufficiali del corso:

1. Corde & Fisica delle corde
2. Racchette & Fisica dell'attrezzo
3. Macchine & Attrezzi
4. Procedure & Casi pratici
5. Varie / Trasversali (storia del tennis, palline, consulenza al cliente, ecc.)

Nessuna installazione, nessun account, nessun backend: è una pagina HTML che gira interamente nel browser.

## Demo

Apri il quiz: https://drrobot24.github.io/quiz_incordatore_fitp/

## Come si usa

1. Nella schermata iniziale scegli quali moduli vuoi esercitare, il livello di confidenza delle domande (tutte, solo quelle "da rivedere", o solo quelle consolidate) e quante domande vuoi affrontare.
2. Puoi scegliere una modalità libera, senza limiti di tempo, oppure una modalità a tempo per simulare le condizioni d'esame.
3. Per ogni domanda ricevi un feedback immediato: risposta corretta o sbagliata, con la motivazione tratta dalle dispense ufficiali del corso.
4. Al termine vedi il punteggio totale, lo spaccato per argomento e l'elenco delle domande sbagliate.
5. Il sito pesa automaticamente le domande: quelle che hai già sbagliato in passato hanno più probabilità di ricomparire nei quiz successivi, così il ripasso si concentra sui punti deboli.
6. I progressi (punteggi, domande sbagliate, statistiche) restano salvati nel browser stesso, senza bisogno di registrarsi: bastano i cookie/localStorage del dispositivo che usi.

## Avviarlo in locale

Basta aprire `index.html` in un browser. Per evitare problemi di caricamento del file `data.json` su alcuni browser, conviene servirlo con un piccolo server locale:

```bash
git clone https://github.com/DrRobot24/quiz_incordatore_fitp.git
cd quiz_incordatore_fitp
python3 -m http.server 8000
```

Poi apri `http://localhost:8000` nel browser.

## Struttura del progetto

```
quiz_incordatore_fitp/
├── index.html      schermate dell'app: configurazione, quiz, risultati
├── style.css        stile visivo
├── app.js           logica: generazione quiz, timer, punteggio, salvataggio progressi
├── data.json        le 360 domande, con risposta corretta, motivazione, argomento e confidenza
└── README.md        questo file
```

## Formato dei dati

Ogni domanda in `data.json` è un oggetto con questa struttura:

```json
{
  "id": 1,
  "topic": "1. Corde & Fisica corde",
  "question": "Testo della domanda",
  "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "answer": "D",
  "explanation": "Motivazione della risposta corretta",
  "confidence": "Alta"
}
```

Il campo `confidence` indica quanto la risposta è stata verificata rispetto alle dispense ufficiali (`Alta` = verificata con sicurezza, `Media` = da ricontrollare su testo e tabelle originali).

## Avvertenze

Questo è un progetto indipendente creato a scopo di studio personale. Le domande e le risposte sono state preparate a partire dal materiale didattico dei corsi ufficiali FITP, ma non sono un prodotto ufficiale della Federazione Italiana Tennis e Padel e potrebbero contenere imprecisioni, specialmente nelle voci segnalate con confidenza "Media". Prima dell'esame, verifica sempre le informazioni sulle dispense ufficiali del corso.

## Licenza

Materiale didattico ad uso personale e non commerciale.
