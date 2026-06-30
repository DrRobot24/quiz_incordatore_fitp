# Incordatore FITP — Quiz di studio

Sito statico per esercitarsi sulle 360 domande dell'esame ufficiale FITP per incordatori (sessione 2025). Nessuna build, nessuna dipendenza server: HTML + CSS + JS puro.

## Come usarlo in locale

Basta aprire `index.html` in un browser. Per evitare problemi di CORS con `fetch('data.json')` su alcuni browser, è meglio servirlo con un piccolo server locale:

```bash
cd incordatore-fitp-quiz
python3 -m http.server 8000
# poi apri http://localhost:8000
```

## Come pubblicarlo su GitHub Pages

1. Crea una repo su GitHub (es. `incordatore-fitp-quiz`) e pusha questi file nella root (o in `/docs`):
   ```bash
   git init
   git add .
   git commit -m "Quiz incordatore FITP - prima versione"
   git branch -M main
   git remote add origin https://github.com/<tuo-utente>/incordatore-fitp-quiz.git
   git push -u origin main
   ```
2. Su GitHub: Settings → Pages → Source → seleziona branch `main` e cartella `/ (root)`.
3. Dopo un minuto il sito sarà live su `https://<tuo-utente>.github.io/incordatore-fitp-quiz/`.

## Struttura del progetto

```
incordatore-fitp-quiz/
├── index.html      schermate: setup, quiz, risultati
├── style.css       tema visivo (campo da tennis / scoreboard)
├── app.js          logica: generazione quiz, timer, punteggio, salvataggio progressi
├── data.json       le 360 domande con risposta, motivazione, argomento, confidenza
└── README.md       questo file
```

## Funzionalità

- **Setup configurabile**: scegli i moduli (Corde & Fisica, Racchette, Macchine, Procedure, Varie), il livello di confidenza (Alta / Media / tutte), il numero di domande e se vuoi il tempo a cronometro.
- **Quiz**: una domanda alla volta, 4 opzioni, feedback immediato con motivazione tratta dalle dispense.
- **Pesatura intelligente**: il generatore dà più probabilità di uscire alle domande che hai già sbagliato in passato (tracciate in `localStorage`), così il ripasso si concentra sui punti deboli.
- **Risultati**: punteggio finale, spaccato per argomento, elenco degli errori con motivazione, pulsante per rifare solo le domande sbagliate.
- **Persistenza**: cronologia tentativi e statistiche per-domanda salvate nel browser (`localStorage`), niente account o backend necessari.

## Aggiornare le domande

Le domande vivono in `data.json`, un array di oggetti:

```json
{
  "id": 1,
  "topic": "1. Corde & Fisica corde",
  "question": "testo della domanda",
  "options": {"A": "...", "B": "...", "C": "...", "D": "..."},
  "answer": "D",
  "explanation": "motivazione",
  "confidence": "Alta"
}
```

Per rigenerare questo file dal tuo Excel aggiornato, puoi sempre chiedermi di rifare l'export — oppure usare lo script Python di conversione (pandas + openpyxl) che abbiamo già usato per produrlo.
