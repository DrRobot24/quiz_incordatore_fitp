(function(){
  "use strict";

  const STORAGE_KEY = "incordatore_fitp_stats_v1";
  const SYNC_CODE_KEY = "incordatore_fitp_sync_code";
  const API_URL = "/api/progress";
  const TOPIC_SHORT = {
    "1. Corde & Fisica corde": "Corde & fisica",
    "2. Racchette & Fisica attrezzo": "Racchette",
    "3. Macchine & Attrezzi": "Macchine & attrezzi",
    "4. Procedure & Casi pratici": "Procedure",
    "5. Varie / Trasversali": "Varie"
  };

  let ALL_QUESTIONS = [];
  let stats = loadStats();

  let quiz = {
    questions: [],
    index: 0,
    answers: [],
    timed: false,
    timeLimitSec: 0,
    timerHandle: null,
    secondsLeft: 0,
    answeredCurrent: false
  };

  const $ = (sel) => document.querySelector(sel);
  const screens = {
    welcome: $("#screen-welcome"),
    setup: $("#screen-setup"),
    quiz: $("#screen-quiz"),
    results: $("#screen-results")
  };

  function showScreen(name){
    Object.values(screens).forEach(s => s.classList.remove("active"));
    screens[name].classList.add("active");
    // Lo splash ha il suo titolo grande: nascondo l'header compatto lì.
    const header = $("#app-header");
    if(header) header.style.display = (name === "welcome") ? "none" : "";
    window.scrollTo(0, 0);
  }

  function loadStats(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return { perQuestion: {}, history: [] };
      return JSON.parse(raw);
    }catch(e){ return { perQuestion: {}, history: [] }; }
  }
  function saveStats(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    autoCloudPush();
  }

  // ---- Sync cloud (Redis via /api/progress) ----
  const CODE_RE = /^[a-z0-9]+(-[a-z0-9]+){1,4}$/;
  let cloudPushTimer = null;

  function getSyncCode(){
    return (localStorage.getItem(SYNC_CODE_KEY) || "").trim();
  }
  function setSyncCode(code){
    localStorage.setItem(SYNC_CODE_KEY, code);
  }
  function isValidCode(code){
    return typeof code === "string" && code.length >= 4 && code.length <= 60 && CODE_RE.test(code);
  }
  function generateCode(){
    const a = ["tennis","corda","racchetta","tensione","gioco","match","set","ace","volee","rovescio","dritto","servizio"];
    const pick = () => a[Math.floor(Math.random()*a.length)];
    const num = Math.floor(1000 + Math.random()*9000);
    return `${pick()}-${pick()}-${num}`;
  }
  function setSyncStatus(msg, kind){
    const el = $("#sync-status");
    if(!el) return;
    el.innerHTML = msg || "";
    el.className = "muted sync-status" + (kind ? " " + kind : "");
  }

  // Fonde due stati: max di seen/wrong per domanda, unione delle history.
  function mergeStats(local, remote){
    if(!remote || typeof remote !== "object") return local;
    const out = { perQuestion: {}, history: [] };
    const ids = new Set([
      ...Object.keys(local.perQuestion || {}),
      ...Object.keys(remote.perQuestion || {})
    ]);
    ids.forEach(id => {
      const l = (local.perQuestion || {})[id] || { seen:0, wrong:0 };
      const r = (remote.perQuestion || {})[id] || { seen:0, wrong:0 };
      out.perQuestion[id] = {
        seen: Math.max(l.seen||0, r.seen||0),
        wrong: Math.max(l.wrong||0, r.wrong||0)
      };
    });
    const seen = new Set();
    [...(local.history||[]), ...(remote.history||[])].forEach(h => {
      const k = (h && h.date) ? h.date : JSON.stringify(h);
      if(seen.has(k)) return;
      seen.add(k);
      out.history.push(h);
    });
    out.history.sort((a,b) => new Date(a.date) - new Date(b.date));
    return out;
  }

  function autoCloudPush(){
    const code = getSyncCode();
    if(!isValidCode(code)) return;
    clearTimeout(cloudPushTimer);
    cloudPushTimer = setTimeout(() => { cloudPush(code, true); }, 1500);
  }

  // Aperto in locale (python http.server) la function /api non esiste:
  // il server risponde 501/404/405 invece di eseguire il codice serverless.
  function isApiUnavailable(status){
    return status === 501 || status === 404 || status === 405;
  }
  const OFFLINE_MSG = "ℹ️ Sync disponibile solo online, sul sito pubblicato. In locale i progressi restano su questo browser.";

  function cloudPush(code, silent){
    if(!isValidCode(code)){ setSyncStatus("Codice non valido.", "ko"); return Promise.resolve(false); }
    if(!silent) setSyncStatus("Salvataggio sul cloud…");
    return fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, data: stats })
    }).then(r => {
      if(isApiUnavailable(r.status)){ if(!silent) setSyncStatus(OFFLINE_MSG, ""); return false; }
      if(!r.ok) throw new Error("HTTP " + r.status);
      if(!silent) setSyncStatus("✅ Progressi salvati sul cloud.", "ok");
      return true;
    }).catch(err => {
      // In locale la fetch fallisce comunque: non spammare la console.
      if(!silent) setSyncStatus("⚠️ Errore nel salvataggio cloud.", "ko");
      return false;
    });
  }

  function cloudLoad(code){
    if(!isValidCode(code)){ setSyncStatus("Codice non valido. Usa lettere/numeri e trattini, es. tennis-corda-4821.", "ko"); return; }
    setSyncStatus("Caricamento dal cloud…");
    fetch(API_URL + "?code=" + encodeURIComponent(code))
      .then(r => {
        if(isApiUnavailable(r.status)){ setSyncStatus(OFFLINE_MSG, ""); return null; }
        if(!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(res => {
        if(res === null) return;
        if(!res.data){
          setSyncStatus("Nessun progresso trovato per questo codice. Verrà creato al primo salvataggio.", "");
          return;
        }
        stats = mergeStats(stats, res.data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
        renderStats();
        renderSyncBadge();
        setSyncStatus("✅ Progressi caricati e uniti.", "ok");
        cloudPush(code, true);
      })
      .catch(err => {
        setSyncStatus("⚠️ Errore nel caricamento dal cloud.", "ko");
      });
  }

  // Salvataggio esplicito "alla Mario": localStorage subito + push cloud
  // immediato (bypassa il debounce) + feedback visibile sul bottone.
  function saveProgressExplicit(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    const btn = $("#btn-save");
    const code = getSyncCode();

    flashSaveButton(btn, "💾 Salvato!", "saved");

    if(isValidCode(code)){
      clearTimeout(cloudPushTimer);
      cloudPush(code, true).then(ok => {
        if(ok) flashSaveButton(btn, "☁️ Salvato nel cloud!", "saved");
        else flashSaveButton(btn, "💾 Salvato in locale", "");
      });
    } else {
      flashSaveButton(btn, "💾 Salvato su questo dispositivo", "");
    }
  }

  function flashSaveButton(btn, text, cls){
    if(!btn) return;
    if(!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.classList.remove("saved");
    // reflow per riavviare l'animazione anche a click ravvicinati
    void btn.offsetWidth;
    btn.textContent = text;
    if(cls) btn.classList.add(cls);
    clearTimeout(btn._flashTimer);
    btn._flashTimer = setTimeout(() => {
      btn.textContent = btn.dataset.label;
      btn.classList.remove("saved");
    }, 1800);
  }

  // Riga di stato discreta nel setup: mostra se c'è un codice sync attivo.
  function renderSyncBadge(){
    const el = $("#sync-badge");
    if(!el) return;
    const code = getSyncCode();
    if(isValidCode(code)){
      el.className = "sync-badge active";
      el.innerHTML = `<span class="dot"></span>☁️ Sincronizzato · <b>${code}</b> <span class="muted">— i progressi si salvano nel cloud</span>`;
    } else {
      el.className = "sync-badge";
      el.innerHTML = `<span class="dot"></span>💾 Solo su questo dispositivo <span class="muted">— aggiungi un codice sync dalla schermata iniziale per salvarli nel cloud</span>`;
    }
  }

  function init(){
    fetch("data.json?v=8")
      .then(r => r.json())
      .then(data => {
        ALL_QUESTIONS = data;
        buildTopicsList();
        renderStats();
        bindEvents();
        renderSyncBadge();
      })
      .catch(err => {
        $("#topics-list").innerHTML = "<p class='muted'>Impossibile caricare data.json. Se hai aperto il file direttamente nel browser, avvia un piccolo server locale (vedi README) oppure pubblica su GitHub Pages.</p>";
        console.error(err);
      });
  }

  function buildTopicsList(){
    const counts = {};
    ALL_QUESTIONS.forEach(q => counts[q.topic] = (counts[q.topic]||0) + 1);
    const topics = Object.keys(counts).sort();
    const container = $("#topics-list");
    container.innerHTML = topics.map(t => `
      <label class="topic-card" for="topic-${cssId(t)}">
        <input type="checkbox" class="topic-check" value="${t}" checked id="topic-${cssId(t)}">
        <span class="topic-card-check" aria-hidden="true"></span>
        <span class="topic-card-name">${TOPIC_SHORT[t] || t}</span>
        <span class="count">${counts[t]}</span>
      </label>
    `).join("");
    container.querySelectorAll(".topic-check").forEach(c => {
      c.addEventListener("change", updateTopicsCount);
    });
    updateTopicsCount();
  }

  function updateTopicsCount(){
    const el = $("#topics-selected-count");
    if(!el) return;
    const n = getSelectedTopics().length;
    const tot = document.querySelectorAll(".topic-check").length;
    el.textContent = `${n}/${tot} selezionati`;
  }

  function setAllTopics(checked){
    document.querySelectorAll(".topic-check").forEach(c => { c.checked = checked; });
    updateTopicsCount();
  }

  function cssId(s){ return s.replace(/[^a-zA-Z0-9]/g, "_"); }

  function bindEvents(){
    const enterBtn = $("#btn-enter");
    if(enterBtn) enterBtn.addEventListener("click", () => showScreen("setup"));

    document.querySelectorAll('input[name="timed"]').forEach(r => {
      r.addEventListener("change", () => {
        $("#time-limit-field").style.display = $('input[name="timed"]:checked').value === "yes" ? "flex" : "none";
      });
    });

    $("#btn-topics-all").addEventListener("click", () => setAllTopics(true));
    $("#btn-topics-none").addEventListener("click", () => setAllTopics(false));

    $("#btn-start").addEventListener("click", startQuiz);
    $("#btn-confirm").addEventListener("click", confirmAnswer);
    $("#btn-next").addEventListener("click", nextQuestion);
    $("#btn-quit").addEventListener("click", () => {
      if(confirm("Interrompere il quiz? Il progresso di questo tentativo andrà perso.")){
        stopTimer();
        showScreen("setup");
        renderStats();
      }
    });
    const exitBtn = $("#btn-exit");
    if(exitBtn) exitBtn.addEventListener("click", () => {
      if(confirm("Uscire e tornare alla schermata iniziale? Il quiz in corso andrà perso (le risposte già date restano salvate).")){
        stopTimer();
        showScreen("welcome");
      }
    });
    const saveBtn = $("#btn-save");
    if(saveBtn) saveBtn.addEventListener("click", () => saveProgressExplicit());
    $("#btn-restart").addEventListener("click", () => { showScreen("setup"); renderStats(); });
    $("#btn-reset-stats").addEventListener("click", () => {
      if(confirm("Azzerare tutte le statistiche salvate nel browser?")){
        stats = { perQuestion: {}, history: [] };
        saveStats();
        renderStats();
      }
    });
    $("#btn-retry-wrong").addEventListener("click", () => {
      const wrongQuestions = quiz.answers.filter(a => !a.correct).map(a => a.question);
      if(wrongQuestions.length === 0) return;
      launchQuiz(wrongQuestions, quiz.timed, quiz.timeLimitSec);
    });

    // ---- Sync (nella welcome) ----
    const codeInput = $("#sync-code");
    if(codeInput){
      const saved = getSyncCode();
      if(saved) codeInput.value = saved;
      codeInput.addEventListener("input", () => {
        const v = codeInput.value.trim().toLowerCase();
        codeInput.value = v;
        if(isValidCode(v)){ setSyncCode(v); setSyncStatus(""); }
        renderSyncBadge();
      });
    }
    const genBtn = $("#btn-sync-generate");
    if(genBtn) genBtn.addEventListener("click", () => {
      const code = generateCode();
      $("#sync-code").value = code;
      setSyncCode(code);
      renderSyncBadge();
      setSyncStatus("Codice generato e salvato: <b>" + code + "</b>. Conservalo! I progressi ora si sincronizzano automaticamente.", "ok");
    });
    const loadBtn = $("#btn-sync-load");
    if(loadBtn) loadBtn.addEventListener("click", () => {
      const code = $("#sync-code").value.trim().toLowerCase();
      setSyncCode(code);
      cloudLoad(code);
    });
  }

  function getSelectedTopics(){
    return Array.from(document.querySelectorAll(".topic-check:checked")).map(c => c.value);
  }

  function startQuiz(){
    const topics = getSelectedTopics();
    if(topics.length === 0){ alert("Seleziona almeno un argomento."); return; }
    const confidence = document.querySelector('input[name="confidence"]:checked').value;
    let pool = ALL_QUESTIONS.filter(q => topics.includes(q.topic));
    if(confidence !== "all") pool = pool.filter(q => q.confidence === confidence);
    if(pool.length === 0){ alert("Nessuna domanda corrisponde ai filtri scelti."); return; }

    const numWanted = Math.min(parseInt($("#num-questions").value, 10) || 20, pool.length);
    const selected = weightedSample(pool, numWanted);

    const timed = document.querySelector('input[name="timed"]:checked').value === "yes";
    const minutes = parseInt($("#time-limit").value, 10) || 30;
    launchQuiz(selected, timed, minutes * 60);
  }

  function weightForQuestion(q){
    const s = stats.perQuestion[q.id];
    let w = 1;
    if(q.confidence === "Media") w += 1;
    if(s){
      w += (s.wrong || 0) * 2;
      if(s.seen > 0 && s.wrong === 0) w = Math.max(0.4, w - 0.6);
    }
    return w;
  }

  function weightedSample(pool, n){
    const items = pool.map(q => ({ q, w: weightForQuestion(q) }));
    const result = [];
    for(let i=0; i<n && items.length>0; i++){
      const total = items.reduce((s,it)=>s+it.w, 0);
      let r = Math.random() * total;
      let idx = 0;
      for(; idx<items.length; idx++){
        r -= items[idx].w;
        if(r <= 0) break;
      }
      idx = Math.min(idx, items.length-1);
      result.push(items[idx].q);
      items.splice(idx,1);
    }
    return result;
  }

  function shuffle(arr){
    const a = arr.slice();
    for(let i=a.length-1; i>0; i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]] = [a[j],a[i]];
    }
    return a;
  }

  function launchQuiz(questions, timed, timeLimitSec){
    quiz = {
      questions: shuffle(questions),
      index: 0,
      answers: [],
      timed,
      timeLimitSec,
      timerHandle: null,
      secondsLeft: timeLimitSec,
      answeredCurrent: false
    };
    showScreen("quiz");
    const panel = $("#timer-panel");
    if(timed){
      panel.style.display = "flex";
      startTimer();
    } else {
      panel.style.display = "none";
      $("#timer-display").textContent = "";
    }
    renderQuestion();
  }

  function startTimer(){
    updateTimerDisplay();
    quiz.timerHandle = setInterval(() => {
      quiz.secondsLeft--;
      updateTimerDisplay();
      if(quiz.secondsLeft <= 0){
        stopTimer();
        finishQuiz();
      }
    }, 1000);
  }
  function stopTimer(){
    if(quiz.timerHandle){ clearInterval(quiz.timerHandle); quiz.timerHandle = null; }
  }
  function updateTimerDisplay(){
    const m = Math.floor(quiz.secondsLeft/60);
    const s = quiz.secondsLeft%60;
    const text = `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    const warn = quiz.secondsLeft <= 60;

    const inline = $("#timer-display");
    inline.textContent = text;
    inline.classList.toggle("warn", warn);

    const big = $("#timer-big");
    const panel = $("#timer-panel");
    if(big) big.textContent = text;
    if(panel) panel.classList.toggle("warn", warn);
  }

  function renderQuestion(){
    const q = quiz.questions[quiz.index];
    quiz.answeredCurrent = false;

    $("#progress-label").textContent = `Domanda ${quiz.index+1} / ${quiz.questions.length}`;
    $("#progress-fill").style.width = `${(quiz.index/quiz.questions.length)*100}%`;

    const topicEl = $("#q-topic");
    topicEl.textContent = TOPIC_SHORT[q.topic] || q.topic;
    topicEl.className = "topic-tag conf-" + q.confidence;

    $("#q-id").textContent = "N° " + q.id;

    $("#q-text").textContent = q.question;

    const optsContainer = $("#q-options");
    optsContainer.innerHTML = "";
    ["A","B","C","D"].forEach(letter => {
      const div = document.createElement("div");
      div.className = "option";
      div.dataset.letter = letter;
      div.innerHTML = `<span class="letter">${letter}</span><span>${q.options[letter]}</span>`;
      div.addEventListener("click", () => selectOption(letter));
      optsContainer.appendChild(div);
    });

    $("#q-feedback").innerHTML = "";
    $("#btn-confirm").style.display = "inline-block";
    $("#btn-confirm").disabled = true;
    $("#btn-next").style.display = "none";
  }

  let selectedLetter = null;

  function selectOption(letter){
    if(quiz.answeredCurrent) return;
    selectedLetter = letter;
    document.querySelectorAll(".option").forEach(el => {
      el.classList.toggle("selected", el.dataset.letter === letter);
    });
    $("#btn-confirm").disabled = false;
  }

  function refHtml(ref){
    if(!ref || !ref.pdf){
      return `<div class="ref ref-none">📖 Argomento trasversale — rivedi le dispense generali.</div>`;
    }
    const hasPage = Number.isInteger(ref.page);
    const url = "public/" + encodeURIComponent(ref.pdf) + (hasPage ? "#page=" + ref.page : "");
    const pageLabel = hasPage ? ` · pag. <b>${ref.page}</b>` : "";
    return `<a class="ref" href="${url}" target="_blank" rel="noopener">
      📖 Dispensa: <b>${ref.label}</b>${pageLabel} <span class="ref-open">apri ↗</span>
    </a>`;
  }

  function confirmAnswer(){
    if(!selectedLetter || quiz.answeredCurrent) return;
    quiz.answeredCurrent = true;
    const q = quiz.questions[quiz.index];
    const correct = selectedLetter === q.answer;

    document.querySelectorAll(".option").forEach(el => {
      el.classList.add("disabled");
      if(el.dataset.letter === q.answer) el.classList.add("correct");
      else if(el.dataset.letter === selectedLetter) el.classList.add("wrong");
    });

    const fb = $("#q-feedback");
    const whyLabel = correct ? "Perché è corretta" : "Perché hai sbagliato";
    fb.innerHTML = `<div class="feedback ${correct?"ok":"ko"}">
      <span class="label">${correct ? "Esatto" : "Risposta errata · corretta: " + q.answer}</span>
      <div class="why"><span class="why-tag">${whyLabel}</span>${q.explanation}</div>
      ${(!correct) ? refHtml(q.ref) : ""}
    </div>`;

    quiz.answers.push({ question: q, given: selectedLetter, correct });
    recordStat(q, correct);

    $("#btn-confirm").style.display = "none";
    $("#btn-next").style.display = "inline-block";
    $("#btn-next").textContent = (quiz.index === quiz.questions.length-1) ? "Vedi risultato" : "Prossima domanda";
    selectedLetter = null;
  }

  function recordStat(q, correct){
    if(!stats.perQuestion[q.id]) stats.perQuestion[q.id] = { seen:0, wrong:0 };
    stats.perQuestion[q.id].seen++;
    if(!correct) stats.perQuestion[q.id].wrong++;
    saveStats();
  }

  function nextQuestion(){
    quiz.index++;
    if(quiz.index >= quiz.questions.length){
      stopTimer();
      finishQuiz();
    } else {
      renderQuestion();
    }
  }

  const MAX_HISTORY = 50; // tiene leggero il payload cloud

  function finishQuiz(){
    const total = quiz.answers.length;
    const correctCount = quiz.answers.filter(a=>a.correct).length;

    stats.history.push({
      date: new Date().toISOString(),
      score: correctCount,
      total,
      ids: quiz.answers.map(a => a.question.id),
      timed: !!quiz.timed,
      timeLimitSec: quiz.timeLimitSec || 0
    });
    if(stats.history.length > MAX_HISTORY){
      stats.history = stats.history.slice(-MAX_HISTORY);
    }
    saveStats();

    $("#progress-fill").style.width = "100%";
    showScreen("results");
    $("#score-big").textContent = `${correctCount}/${total}`;
    const pct = total ? Math.round((correctCount/total)*100) : 0;
    $("#score-sub").textContent = `${pct}% di risposte corrette`;

    const byTopic = {};
    quiz.answers.forEach(a => {
      const t = a.question.topic;
      if(!byTopic[t]) byTopic[t] = { correct:0, total:0 };
      byTopic[t].total++;
      if(a.correct) byTopic[t].correct++;
    });
    $("#breakdown").innerHTML = Object.keys(byTopic).sort().map(t => {
      const b = byTopic[t];
      const p = Math.round((b.correct/b.total)*100);
      return `<div class="breakdown-row">
        <span class="name">${TOPIC_SHORT[t]||t}</span>
        <div class="bar"><div class="bar-fill" style="width:${p}%"></div></div>
        <span class="pct">${b.correct}/${b.total}</span>
      </div>`;
    }).join("");

    const wrongs = quiz.answers.filter(a=>!a.correct);
    const wrongCard = $("#wrong-card");
    const retryBtn = $("#btn-retry-wrong");
    if(wrongs.length > 0){
      wrongCard.style.display = "block";
      retryBtn.style.display = "inline-block";
      $("#wrong-list").innerHTML = wrongs.map(a => `
        <div class="wrong-item">
          <div class="q"><span class="q-num">N° ${a.question.id}</span>${a.question.question}</div>
          <div class="a">Hai risposto <b>${a.given}</b> · corretta <b>${a.question.answer}</b> — ${a.question.explanation}</div>
          ${refHtml(a.question.ref)}
        </div>
      `).join("");
    } else {
      wrongCard.style.display = "none";
      retryBtn.style.display = "none";
    }

    renderStats();
  }

  // Rilancia un test passato con le stesse identiche domande.
  function retryHistoryQuiz(idx){
    const h = stats.history[idx];
    if(!h || !Array.isArray(h.ids) || h.ids.length === 0){
      alert("Questo tentativo non ha le domande salvate (è precedente all'aggiornamento). Riprova con i quiz più recenti.");
      return;
    }
    const byId = {};
    ALL_QUESTIONS.forEach(q => { byId[q.id] = q; });
    const questions = h.ids.map(id => byId[id]).filter(Boolean);
    if(questions.length === 0){ alert("Domande non più disponibili."); return; }
    launchQuiz(questions, !!h.timed, h.timeLimitSec || 0);
  }

  // Allenamento mirato: pesca dalle domande sbagliate almeno una volta.
  function trainOnErrors(){
    const wrongIds = Object.entries(stats.perQuestion)
      .filter(([id,s]) => (s.wrong||0) > 0)
      .map(([id]) => parseInt(id,10));
    if(wrongIds.length === 0){
      alert("Nessun errore registrato finora. Completa qualche quiz e i tuoi punti deboli appariranno qui.");
      return;
    }
    const byId = {};
    ALL_QUESTIONS.forEach(q => { byId[q.id] = q; });
    let questions = wrongIds.map(id => byId[id]).filter(Boolean);
    const cap = parseInt($("#num-questions").value, 10) || 20;
    if(questions.length > cap) questions = weightedSample(questions, cap);
    const timed = document.querySelector('input[name="timed"]:checked').value === "yes";
    const minutes = parseInt($("#time-limit").value, 10) || 30;
    launchQuiz(questions, timed, minutes * 60);
  }

  function renderStats(){
    const statsCard = $("#stats-card");
    const total = Object.keys(stats.perQuestion).length;
    if(total === 0 && stats.history.length === 0){
      statsCard.style.display = "none";
      return;
    }
    statsCard.style.display = "block";

    const attempts = stats.history.length;
    // indice reale nell'array history per ogni riga mostrata (per il "Rifai")
    const lastFive = stats.history
      .map((h, i) => ({ h, i }))
      .slice(-5)
      .reverse();
    const weakEntries = Object.entries(stats.perQuestion)
      .filter(([id,s]) => s.wrong > 0);
    const weakIds = weakEntries
      .sort((a,b) => b[1].wrong - a[1].wrong)
      .slice(0,5)
      .map(([id]) => parseInt(id,10));

    let html = `<p class="muted">${total}/${ALL_QUESTIONS.length} domande già affrontate · ${attempts} quiz completati.</p>`;

    if(weakEntries.length){
      html += `<button class="clay btn-train" id="btn-train-errors" type="button">🎯 Allenati sui tuoi errori (${weakEntries.length})</button>`;
    }

    if(lastFive.length){
      html += `<div class="stats-section-label">Ultimi tentativi</div>`;
      lastFive.forEach(({h, i}) => {
        const d = new Date(h.date);
        const p = h.total ? Math.round((h.score/h.total)*100) : 0;
        const canRetry = Array.isArray(h.ids) && h.ids.length > 0;
        html += `<div class="history-row">
          <div class="history-info">
            <span class="history-date">${d.toLocaleDateString("it-IT")} ${d.toLocaleTimeString("it-IT",{hour:'2-digit',minute:'2-digit'})}</span>
            <div class="bar"><div class="bar-fill" style="width:${p}%"></div></div>
            <span class="pct">${h.score}/${h.total}</span>
          </div>
          ${canRetry ? `<button class="ghost small btn-retry-history" type="button" data-idx="${i}">🔁 Rifai</button>` : ""}
        </div>`;
      });
    }
    if(weakIds.length){
      const weakQs = weakIds.map(id => ALL_QUESTIONS.find(q=>q.id===id)).filter(Boolean);
      html += `<p class="muted" style="margin-top:1rem;">Punti più deboli: ${weakQs.map(q => (TOPIC_SHORT[q.topic]||q.topic)).filter((v,i,a)=>a.indexOf(v)===i).join(", ")}.</p>`;
    }
    const container = $("#stats-content");
    container.innerHTML = html;

    const trainBtn = $("#btn-train-errors");
    if(trainBtn) trainBtn.addEventListener("click", trainOnErrors);
    container.querySelectorAll(".btn-retry-history").forEach(btn => {
      btn.addEventListener("click", () => retryHistoryQuiz(parseInt(btn.dataset.idx, 10)));
    });
  }

  init();
})();
