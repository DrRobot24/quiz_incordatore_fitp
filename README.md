# Super String 1.0 · Quiz Incordatore FITP

Applicazione web statica per esercitarsi sulle domande dell'esame ufficiale FITP (Federazione Italiana Tennis e Padel) per la certificazione di **incordatore**.

Contiene una banca di **360 domande** (sessione 2025), organizzate nei moduli ufficiali del corso:

| Modulo | Argomento | Domande |
| ------ | --------- | ------: |
| 1 | Corde & Fisica delle corde | 116 |
| 2 | Racchette & Fisica dell'attrezzo | 49 |
| 3 | Macchine & Attrezzi | 66 |
| 4 | Procedure & Casi pratici | 108 |
| 5 | Varie / Trasversali (storia, palline, consulenza al cliente…) | 21 |

Nessuna installazione, nessun account, nessun backend: è una pagina HTML che gira interamente nel browser.

## Demo

Apri il quiz: https://drrobot24.github.io/quiz_incordatore_fitp/

## Come si usa

1. Nella schermata iniziale scegli **quali moduli** vuoi esercitare (schede a selezione multipla, con pulsanti "Seleziona tutti" / "Nessuno"), il **livello di confidenza** delle domande (tutte, solo quelle "da rivedere", o solo le consolidate) e **quante domande** vuoi affrontare.
2. Puoi scegliere una **modalità libera**, senza limiti di tempo, oppure una **modalità a tempo** per simulare le condizioni d'esame (con timer a schermo).
3. Per ogni domanda ricevi un **feedback immediato**: risposta corretta o sbagliata, con la motivazione tratta dalle dispense ufficiali del corso.
4. Quando sbagli, il feedback mostra anche un **link diretto alla dispensa** (PDF) e alla **pagina** esatta da cui è tratta la risposta, così puoi approfondire subito.
5. Ogni domanda mostra il suo **numero univoco** (`N°`) corrispondente alla banca originale (file Excel), per ritrovarla facilmente.
6. Al termine vedi il **punteggio totale**, lo spaccato per argomento e l'elenco delle domande sbagliate. Con **"Rifai solo gli errori"** rilanci un quiz con le sole domande che hai appena sbagliato.
7. Il sito **pesa automaticamente** le domande: quelle già sbagliate in passato (o marcate con confidenza "Media") hanno più probabilità di ricomparire, così il ripasso si concentra sui punti deboli.
8. I progressi (punteggi, domande sbagliate, statistiche) restano salvati nel **browser stesso** (`localStorage`), senza registrazione.
9. Il pulsante **"Cerca nell'archivio"** apre la ricerca su tutte e 360 le domande: digiti una parola e trovi ogni domanda che la contiene, nel testo, nelle risposte o nella motivazione, con la risposta corretta già evidenziata.

### Archivio e ricerca

I moduli dicono *da dove viene* una domanda; la ricerca dice *di cosa parla*. Sono due tagli diversi della stessa banca: «tensione» compare in 92 domande sparse su 4 moduli su 5, quindi il filtro per modulo da solo non basta per ripassare quel concetto.

- cerca in **testo della domanda, opzioni e motivazione** insieme
- accenti indifferenti (`perche` trova `perché`), più parole in **AND**, match anche parziale
- **combinabile** con il filtro per modulo, con lo spaccato degli esiti modulo per modulo
- toccare un modulo senza digitare nulla lo **sfoglia** tutto
- risultati a pagine da 40, con "Mostra altri"

## Avviarlo in locale

Le domande sono in `data.json`, caricato via `fetch`: aprire `index.html` direttamente dal filesystem può fallire su alcuni browser. Conviene servire con un piccolo server locale:

```bash
git clone https://github.com/DrRobot24/quiz_incordatore_fitp.git
cd quiz_incordatore_fitp
npm run dev
```

Apre da solo `http://localhost:8000`. Non serve `npm install`: il sito è statico, non ha dipendenze da compilare (`@upstash/redis` serve solo alla funzione serverless `api/progress.js`, che gira su Vercel).

In alternativa, senza Node:

```bash
python3 -m http.server 8000   # su Windows: python -m http.server 8000
```

**Nota sul sync in locale.** Un server statico non esegue `api/progress.js`, quindi `/api/progress` risponde 404 e il salvataggio cloud si disattiva da solo con un avviso: i progressi restano nel `localStorage` del browser. Tutto il resto — quiz, archivio, ricerca, statistiche — funziona normalmente. Per provare anche il sync serve `npm run dev:api` (usa `vercel dev`, richiede login Vercel e le variabili d'ambiente Upstash).

## Deploy

Il progetto è un sito statico servito dalla root. `vercel.json` è configurato per il deploy su **Vercel** (`outputDirectory: "."`, `cleanUrls`, rewrite di `/` su `index.html`, nessun build step). È pubblicabile allo stesso modo su GitHub Pages o qualsiasi hosting statico.

## Struttura del progetto

```
quiz_incordatore_fitp/
├── index.html      schermate dell'app: configurazione, archivio, quiz, risultati
├── style.css       stile visivo (temi, sfondo, schede argomenti)
├── app.js          logica: generazione quiz pesata, timer, punteggio, ricerca, salvataggio progressi
├── data.json       le 360 domande (risposta, motivazione, argomento, confidenza, riferimento dispensa)
├── api/
│   └── progress.js funzione serverless per il sync dei progressi (Upstash Redis)
├── vercel.json     configurazione deploy statico su Vercel
├── public/         materiale di studio e asset
│   ├── 1_fisica_attrezzi.pdf
│   ├── 2_macchine_attrezzature.pdf
│   ├── 3_procedure.pdf
│   ├── 4_genitori_maestri.pdf
│   ├── Esame_Incordatore_FIT_360_RISPOSTE.xlsx   banca domande originale
│   └── tennis.webp                               immagine di sfondo
└── README.md       questo file
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
  "confidence": "Alta",
  "ref": { "pdf": "1_fisica_attrezzi.pdf", "label": "Fisica & attrezzi", "page": 101 }
}
```

- `id` — numero univoco della domanda nella banca originale (mostrato come `N°` durante il quiz).
- `confidence` — quanto la risposta è stata verificata rispetto alle dispense ufficiali: `Alta` = verificata con sicurezza (304 domande), `Media` = da ricontrollare su testo e tabelle originali (56 domande). Le domande `Media` compaiono più spesso nei quiz.
- `ref` — riferimento alla dispensa: file `pdf` in `public/`, `label` mostrata all'utente e `page` di partenza. Su risposta errata il quiz apre `public/<pdf>#page=<page>`. Se assente, viene mostrato un rimando generico alle dispense.

## Avvertenze

Progetto indipendente creato a scopo di studio personale. Le domande e le risposte sono state preparate a partire dal materiale didattico dei corsi ufficiali FITP, ma **non sono un prodotto ufficiale** della Federazione Italiana Tennis e Padel e potrebbero contenere imprecisioni, specialmente nelle voci con confidenza "Media". Prima dell'esame, verifica sempre le informazioni sulle dispense ufficiali del corso.

## Licenza

Materiale didattico ad uso personale e non commerciale.
