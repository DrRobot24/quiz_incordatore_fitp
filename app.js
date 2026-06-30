(function(){
  "use strict";

  const STORAGE_KEY = "incordatore_fitp_stats_v1";
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
    setup: $("#screen-setup"),
    quiz: $("#screen-quiz"),
    results: $("#screen-results")
  };

  function showScreen(name){
    Object.values(screens).forEach(s => s.classList.remove("active"));
    screens[name].classList.add("active");
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
  }

  function init(){
    fetch("data.json")
      .then(r => r.json())
      .then(data => {
        ALL_QUESTIONS = data;
        buildTopicsList();
        renderStats();
        bindEvents();
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
      <div class="topic-row">
        <input type="checkbox" class="topic-check" value="${t}" checked id="topic-${cssId(t)}">
        <label for="topic-${cssId(t)}">${TOPIC_SHORT[t] || t}</label>
        <span class="count">${counts[t]}</span>
      </div>
    `).join("");
  }

  function cssId(s){ return s.replace(/[^a-zA-Z0-9]/g, "_"); }

  function bindEvents(){
    document.querySelectorAll('input[name="timed"]').forEach(r => {
      r.addEventListener("change", () => {
        $("#time-limit-field").style.display = $('input[name="timed"]:checked').value === "yes" ? "flex" : "none";
      });
    });

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
    if(timed) startTimer();
    else $("#timer-display").textContent = "";
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
    const el = $("#timer-display");
    el.textContent = `${m}:${String(s).padStart(2,"0")}`;
    el.classList.toggle("warn", quiz.secondsLeft <= 60);
  }

  function renderQuestion(){
    const q = quiz.questions[quiz.index];
    quiz.answeredCurrent = false;

    $("#progress-label").textContent = `Domanda ${quiz.index+1} / ${quiz.questions.length}`;
    $("#progress-fill").style.width = `${(quiz.index/quiz.questions.length)*100}%`;

    const topicEl = $("#q-topic");
    topicEl.textContent = TOPIC_SHORT[q.topic] || q.topic;
    topicEl.className = "topic-tag conf-" + q.confidence;

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
    fb.innerHTML = `<div class="feedback ${correct?"ok":"ko"}">
      <span class="label">${correct ? "Esatto" : "Risposta errata · corretta: " + q.answer}</span>
      ${q.explanation}
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

  function finishQuiz(){
    const total = quiz.answers.length;
    const correctCount = quiz.answers.filter(a=>a.correct).length;

    stats.history.push({ date: new Date().toISOString(), score: correctCount, total });
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
          <div class="q">${a.question.question}</div>
          <div class="a">Hai risposto <b>${a.given}</b> · corretta <b>${a.question.answer}</b> — ${a.question.explanation}</div>
        </div>
      `).join("");
    } else {
      wrongCard.style.display = "none";
      retryBtn.style.display = "none";
    }

    renderStats();
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
    const lastFive = stats.history.slice(-5).reverse();
    const weakIds = Object.entries(stats.perQuestion)
      .filter(([id,s]) => s.wrong > 0)
      .sort((a,b) => b[1].wrong - a[1].wrong)
      .slice(0,5)
      .map(([id]) => parseInt(id,10));

    let html = `<p class="muted">${total} domande incontrate finora · ${attempts} quiz completati.</p>`;
    if(lastFive.length){
      html += `<div class="breakdown-row" style="border-bottom:none; padding-top:0;"><span class="name" style="font-family:var(--font-mono); font-size:.78rem; text-transform:uppercase; color:var(--ink-soft);">Ultimi tentativi</span></div>`;
      lastFive.forEach(h => {
        const d = new Date(h.date);
        const p = h.total ? Math.round((h.score/h.total)*100) : 0;
        html += `<div class="breakdown-row">
          <span class="name">${d.toLocaleDateString("it-IT")} ${d.toLocaleTimeString("it-IT",{hour:'2-digit',minute:'2-digit'})}</span>
          <div class="bar"><div class="bar-fill" style="width:${p}%"></div></div>
          <span class="pct">${h.score}/${h.total}</span>
        </div>`;
      });
    }
    if(weakIds.length){
      const weakQs = weakIds.map(id => ALL_QUESTIONS.find(q=>q.id===id)).filter(Boolean);
      html += `<p class="muted" style="margin-top:1rem;">Punti più deboli: ${weakQs.map(q => (TOPIC_SHORT[q.topic]||q.topic)).filter((v,i,a)=>a.indexOf(v)===i).join(", ")}.</p>`;
    }
    $("#stats-content").innerHTML = html;
  }

  init();
})();
