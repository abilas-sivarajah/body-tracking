// Hauptmodul der App. Oberfläche und Abläufe stammen aus der ursprünglichen Einzelnutzer-App.
import { onAuthChange, login, register, logout, resetPassword, hasMemberClaim, authFetch, deleteAccount, authErrorText } from './auth.js';
import { createStore, loadLeaderboard } from './store.js';
import { loadFoods } from './food-db.js';
import { estimateMeal, recalculate } from './food-parser.js';
import { renderPlanEditor } from './plan-editor.js';
import { bodySVG } from './body-figure.js';
import {
  pad, dayId, todayId, dateOf, num, clean, fmt, roundKg, cleanKg, uid6, RATINGS, rating, normalizePlan, defaultPlanDoc,
  exerciseMap, trainDays, planIdFor, planExercises, toggleTrainDay, entrySets, firstKg, dropRating, setsText, lastEntry, suggest, bestRun,
  cleanItems, sum, normKey, aggregate, removeOne, isWaterItem, cleanLog, mlSum, cleanSleep, sleepScore, DEFAULT_GOALS, cleanGoals, plannedFor,
  dayScore, weekIdOf
} from './logic.js';

var uid = null, store = null, profile = null, plan = normalizePlan(null), goals = { ...DEFAULT_GOALS }, ownFoods = [];
var sessions = [], foodDays = [], waterDays = [], dirty = {}, mode = "db", currentDay = todayId();
var PLAN = [], BYID = {}, ALLEX = [], ALLSTR = [], TRAIN_DAYS = [];

function $(s, el){ return (el || document).querySelector(s); }
function $$(s, el){ return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
function esc(s){ return String(s === null || s === undefined ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
function dateLong(id){ return dateOf(id).toLocaleDateString("de-DE", {weekday:"long", day:"numeric", month:"long"}); }
function dateShort(id){ return dateOf(id).toLocaleDateString("de-DE", {weekday:"short", day:"numeric", month:"short"}); }
function todaySession(){ var t = todayId(); for (var i = 0; i < sessions.length; i++) if (sessions[i].id === t) return sessions[i]; return null; }
function todayEntry(id){ var s = todaySession(); return s && s.entries ? (s.entries[id] || null) : null; }
function setBanner(text){ var b = $("#banner"); if (text){ b.textContent = text; b.hidden = false; } else b.hidden = true; }
function canEdit(){ return true; }
function errText(e){
  var c = e && e.code;
  if (c === "permission-denied") return "Speichern wurde abgelehnt. Bitte neu anmelden.";
  if (c === "resource-exhausted") return "Speicherlimit erreicht. Versuch es später nochmal.";
  return "Konnte nicht speichern. Versuch es nochmal.";
}
function scoreCtx(){ return {sessions:sessions, foodDays:foodDays, waterDays:waterDays, plan:plan, goals:goals, today:todayId()}; }

function updatePlan(){
  var today = todayId();
  BYID = exerciseMap(plan); ALLEX = plan.exercises; ALLSTR = ALLEX.filter(function(e){ return e.kind !== "time"; });
  TRAIN_DAYS = trainDays(plan);
  PLAN = planExercises(plan, planIdFor(plan, today));
}

// ---------- Speichern ----------
function saveEntry(exId, entry){ var r = store.saveEntry(todayId(), exId, entry, PLAN.map(function(e){ return e.id; })); queueSync(); return r; }
function saveSessionPatch(patch, dayIdOpt){ return store.patchDay(dayIdOpt || todayId(), patch); }
function deleteSession(id){
  var s = sessions.filter(function(x){ return x.id === id; })[0]; if (!s) return Promise.resolve();
  if (id === todayId()){ autoDone = {}; dirty = {}; }
  queueSync();
  return store.deleteTraining(s);
}

// ---------- Übungsliste ----------
function metaText(ex){
  if (ex.kind === "time") return esc(ex.target);
  return ex.sets + " Sätze, " + ex.reps[0] + "–" + ex.reps[1] + " Wdh." + (ex.drop ? " + Drop" : "");
}
function infoText(ex){
  var s = "Pause " + esc(ex.restText);
  if (ex.note) s += ", " + esc(ex.note);
  return s;
}
function setRow(cls, label, i, kgLabel, repLabel, ph){
  return '<div class="setrow' + (cls ? " " + cls : "") + '"><span class="sl">' + label + '</span>' +
    '<label class="num"><input class="' + (cls ? "d-kg" : "s-kg") + '"' + (i !== null ? ' data-i="' + i + '"' : '') + ' inputmode="decimal" autocomplete="off" aria-label="' + kgLabel + '"></label>' +
    '<span class="x" aria-hidden="true">×</span>' +
    '<label class="num"><input class="' + (cls ? "d-reps" : "s-reps") + '"' + (i !== null ? ' data-i="' + i + '"' : '') + ' inputmode="numeric" autocomplete="off" placeholder="' + ph + '" aria-label="' + repLabel + '"></label><button type="button" class="srate" data-r="" aria-label="Bewertung ' + label + '">–</button></div>';
}
function setSR(btn, r){ btn.dataset.r = r || ""; btn.textContent = r ? RATINGS[r] : "–"; btn.className = "srate" + (r ? " r-" + r : ""); }
function nextSetLabel(ex, li, i){ var k = $$(".s-kg", li)[i + 1], rp = $$(".s-reps", li)[i + 1]; return ex.name + " · Satz " + (i + 2) + (k && k.value ? " · " + k.value + " kg" : "") + (rp && rp.placeholder ? " × " + rp.placeholder : ""); }
function nextExLabel(nx){ var nli = $('.ex[data-id="' + nx.id + '"]'), k = nli && $(".s-kg", nli), rp = nli && $(".s-reps", nli); return "Weiter: " + nx.name + (k && k.value ? " · " + k.value + " kg" : "") + (rp && rp.placeholder ? " × " + rp.placeholder : ""); }

var RUNF = '<div class="runf"><label>Beste Steigung<span class="rf"><input class="run-inc" inputmode="decimal" autocomplete="off"><span class="unit">%</span></span></label><label>Beste Geschwindigkeit<span class="rf"><input class="run-spd" inputmode="decimal" autocomplete="off"><span class="unit">km/h</span></span></label></div><p class="runlast"></p>';
function strengthBody(ex){
  var rows = '<div class="setrow head" aria-hidden="true"><span></span><span>kg</span><span></span><span>Wdh.</span><span>Bewertung</span></div>';
  for (var i = 0; i < ex.sets; i++) rows += setRow("", "Satz " + (i + 1), i, "Satz " + (i + 1) + " Gewicht", "Satz " + (i + 1) + " Wiederholungen", ex.pr[i]);
  if (ex.drop) rows += setRow("drop", "Drop", null, "Dropsatz Gewicht", "Dropsatz Wiederholungen", ex.dropPr);
  return bodySVG(ex) + '<p class="info">' + infoText(ex) + '</p><p class="last"></p><p class="why"></p><div class="sets">' + rows + '</div>' +
    '<div class="actions"><button type="button" class="btn primary save">Speichern</button>' +
    '</div>';
}
function timeBody(ex){
  return '<p class="last"></p>' +
    '<div class="field"><label for="min-' + esc(ex.id) + '">Minuten</label>' +
      '<div class="stepper"><button type="button" class="step" data-d="-1" aria-label="Weniger Minuten">−</button>' +
      '<input id="min-' + esc(ex.id) + '" class="min" inputmode="numeric" autocomplete="off"><span class="unit">min</span>' +
      '<button type="button" class="step" data-d="1" aria-label="Mehr Minuten">+</button></div></div>' +
    (ex.id === "rennen" ? RUNF : '') + '<div class="actions"><button type="button" class="btn primary save">Erledigt</button></div>';
}
function buildList(){
  var ol = $("#exlist"); ol.innerHTML = "";
  PLAN.forEach(function(ex, i){
    var li = document.createElement("li"); li.className = "ex"; li.dataset.id = ex.id;
    li.innerHTML =
      '<button class="ex-head" type="button" aria-expanded="false" aria-controls="b-' + esc(ex.id) + '">' +
        '<span class="ex-num" aria-hidden="true">' + (i + 1) + '</span>' +
        '<span class="ex-main"><span class="ex-name">' + esc(ex.name) + '</span><span class="ex-meta">' + metaText(ex) + '</span></span>' +
        '<span class="ex-right"><span class="ex-kg"></span><span class="ex-state" aria-hidden="true"></span></span>' +
      '</button>' +
      '<div class="ex-body" id="b-' + esc(ex.id) + '" hidden>' + (ex.kind === "time" ? timeBody(ex) : strengthBody(ex)) + '</div>';
    ol.appendChild(li);
  });
  var sb = $("#segbar"); sb.innerHTML = "";
  PLAN.forEach(function(ex){ var s = document.createElement("span"); s.dataset.id = ex.id; sb.appendChild(s); });
}

// ---------- Eine Übung aktualisieren ----------
function refreshRow(ex){
  var li = $('.ex[data-id="' + ex.id + '"]'); if (!li) return;
  var te = todayEntry(ex.id);
  var kgEl = $(".ex-kg", li), st = $(".ex-state", li), last = $(".last", li), saveBtn = $(".save", li);
  var r = te ? (rating(te.rating) || "none") : null;
  li.classList.toggle("done", !!te);
  st.className = "ex-state" + (r ? " r-" + r : "");

  if (ex.kind === "time"){
    var m = te && clean(te.min) !== null ? clean(te.min) : null;
    kgEl.innerHTML = te ? fmt(m === null ? ex.min : m) + "<small>min</small>" : "";
    last.textContent = "";
    if (!dirty[ex.id]) $(".min", li).value = String(m === null ? ex.min : m);
    if (ex.id === "rennen"){
      var ri = $(".run-inc", li), rsp = $(".run-spd", li), bi = bestRun(sessions, "inc"), bs = bestRun(sessions, "spd");
      if (!dirty[ex.id]){ ri.value = te && clean(te.inc) !== null ? fmt(clean(te.inc)) : ""; rsp.value = te && clean(te.spd) !== null ? fmt(clean(te.spd)) : ""; }
      ri.placeholder = bi !== null ? fmt(bi) : "%"; rsp.placeholder = bs !== null ? fmt(bs) : "km/h";
      $(".runlast", li).textContent = (bi !== null || bs !== null) ? "Bestwerte bisher: " + (bi !== null ? fmt(bi) + " % Steigung" : "") + (bi !== null && bs !== null ? ", " : "") + (bs !== null ? fmt(bs) + " km/h" : "") : "";
    }
    saveBtn.textContent = te ? "Aktualisieren" : "Erledigt";
    return;
  }
  var sg = suggest(ex, lastEntry(sessions, ex.id, todayId()));
  var tSets = te ? entrySets(te) : null;
  var head = te && firstKg(te) !== null ? firstKg(te) : sg.sets[0];
  kgEl.innerHTML = fmt(head) + "<small>kg</small>";

  last.textContent = "";
  var why = $(".why", li); why.innerHTML = "";
  if (!te && (sg.delta > 0 || sg.repDelta > 0)){ var b = document.createElement("b"); b.textContent = sg.delta > 0 ? "Heute " + fmt(sg.delta) + " kg mehr als letztes Mal" : "Heute " + sg.repDelta + " Wdh. mehr als letztes Mal"; why.appendChild(b); }
  why.hidden = !why.firstChild;
  if (!dirty[ex.id]){
    $$(".s-kg", li).forEach(function(inp, i){
      var v = tSets ? (tSets[i] ? tSets[i].kg : null) : sg.sets[i];
      inp.value = v === null || v === undefined ? "" : fmt(v);
    });
    $$(".s-reps", li).forEach(function(inp, i){
      var v = tSets && tSets[i] ? tSets[i].reps : null; inp.value = v === null ? "" : String(v);
      inp.placeholder = String(sg.reps[i] != null ? sg.reps[i] : ex.pr[i]);
    });
    $$(".setrow:not(.drop) .srate", li).forEach(function(b, i){ setSR(b, tSets && tSets[i] ? rating(tSets[i].rating) : null); });
    if (ex.drop){ setSR($(".setrow.drop .srate", li), te ? dropRating(te) : null); }
    if (ex.drop){
      var dk = te ? cleanKg(te.dropKg) : sg.dropKg;
      $(".d-kg", li).value = dk === null || dk === undefined ? "" : fmt(dk);
      var dr = te ? clean(te.dropReps) : null;
      $(".d-reps", li).value = dr === null ? "" : String(dr);
      $(".d-reps", li).placeholder = sg.dropReps != null ? String(sg.dropReps) : "";
    }
  }
  saveBtn.textContent = te ? "Aktualisieren" : "Speichern";
}

// ---------- Tagesansicht ----------
function renderDay(){
  var t = todayId(), wd = new Date().getDay();
  $("#dayDate").textContent = dateLong(t);
  var sub;
  if (TRAIN_DAYS.indexOf(wd) >= 0) sub = "Trainingstag";
  else {
    var next = TRAIN_DAYS.map(function(d){ return (d - wd + 7) % 7 || 7; }).sort(function(a, b){ return a - b; })[0];
    if (next){ var nd = new Date(); nd.setDate(nd.getDate() + next); sub = "Nächstes Training: " + nd.toLocaleDateString("de-DE", {weekday:"long"}); }
    else sub = "";
  }
  var isTrain = TRAIN_DAYS.indexOf(wd) >= 0;
  $("#dayTitle").textContent = isTrain ? "Trainingstag" : "Ruhetag";
  $("#daySub").textContent = isTrain ? "" : sub;
  var done = 0;
  PLAN.forEach(function(ex){
    var te = todayEntry(ex.id), s = $('#segbar span[data-id="' + ex.id + '"]');
    if (te){ done++; s.className = "on r-" + (rating(te.rating) || "none"); } else s.className = "";
  });
  $("#cDone").textContent = done; $("#cAll").textContent = "/" + PLAN.length;
  $("#ringFg").style.strokeDashoffset = (163.36 * (1 - done / Math.max(1, PLAN.length))).toFixed(1);
  $(".ring").hidden = !isTrain; $("#segbar").hidden = !isTrain; $(".legend").hidden = !isTrain;
  var exWrap = $("#exWrap"), showBtn = $("#showEx");
  if (isTrain){ exWrap.hidden = false; showBtn.hidden = true; }
  else { showBtn.hidden = false; exWrap.hidden = !exShown; showBtn.textContent = exShown ? "Übungen ausblenden" : "Übungen anzeigen"; }
  renderSleep(); renderScores();
}

// ---------- Verlauf ----------
function foldEl(title, meta){
  var d = document.createElement("details"); d.className = "fold"; d.dataset.k = "h-" + title; if (foldSt()[d.dataset.k]) d.open = true;
  var sm = document.createElement("summary");
  var ft = document.createElement("span"); ft.className = "ft"; ft.textContent = title;
  var fm = document.createElement("span"); fm.className = "fm"; fm.textContent = meta || "";
  sm.appendChild(ft); sm.appendChild(fm); d.appendChild(sm);
  var inner = document.createElement("div"); inner.className = "fold-in"; d.appendChild(inner);
  return {el:d, inner:inner};
}
function renderHistory(){
  var wrap = $("#history"); wrap.innerHTML = "";
  var list = sessions.filter(function(s){ return ((s.entries && Object.keys(s.entries).length) || s.note); });
  if (!list.length){ var p = document.createElement("p"); p.className = "empty"; p.textContent = "Noch kein Training gespeichert."; wrap.appendChild(p); return; }
  var rows = ALLSTR.map(function(ex){
    var logs = list.filter(function(s){ return s.entries && s.entries[ex.id] && firstKg(s.entries[ex.id]) !== null; })
      .map(function(s){ return {d:s.id, kg:firstKg(s.entries[ex.id])}; })
      .sort(function(a, b){ return a.d < b.d ? -1 : 1; });
    return logs.length ? {ex:ex, first:logs[0].kg, last:logs[logs.length - 1].kg} : null;
  }).filter(Boolean);
  if (rows.length){
    var ups = rows.filter(function(r){ return r.last > r.first; }).length;
    var f = foldEl("Fortschritt", ups ? ups + " gesteigert" : rows.length + " Übungen");
    var ul = document.createElement("ul"); ul.className = "prog";
    rows.forEach(function(r){
      var li = document.createElement("li");
      var n = document.createElement("span"); n.textContent = r.ex.name;
      var v = document.createElement("span"); v.className = "v"; v.textContent = fmt(r.first) + " → " + fmt(r.last) + " kg";
      var diff = Math.round((r.last - r.first) * 10) / 10;
      if (diff !== 0){ var d = document.createElement("span"); d.className = "d" + (diff > 0 ? " up" : ""); d.textContent = (diff > 0 ? "+" : "") + fmt(diff); v.appendChild(d); }
      li.appendChild(n); li.appendChild(v); ul.appendChild(li);
    });
    f.inner.appendChild(ul); wrap.appendChild(f.el);
  }
  var tf = foldEl("Trainings", list.length + (list.length === 1 ? " Training" : " Trainings"));
  list.forEach(function(s){
    var entries = s.entries || {};
    var n = ALLEX.filter(function(ex){ return entries[ex.id]; }).length, planned = plannedFor(plan, s.id, s).length;
    var f = {inner: document.createElement("div")}; var hd = document.createElement("p"); hd.className = "shead"; hd.textContent = dateLong(s.id) + " · " + n + " von " + Math.max(n, planned) + (s.note ? " 📝" : ""); f.inner.appendChild(hd);
    var ul = document.createElement("ul"); ul.className = "hist";
    ALLEX.forEach(function(ex){
      var e = entries[ex.id]; if (!e) return;
      var li = document.createElement("li");
      var dot = document.createElement("span"); dot.className = "dot r-" + (rating(e.rating) || "none");
      var mid = document.createElement("span"); mid.textContent = ex.name;
      var right = document.createElement("span"); right.className = "kg";
      if (ex.kind === "time"){ right.textContent = fmt(clean(e.min) === null ? ex.min : clean(e.min)) + " min"; dot.style.visibility = "hidden";
        if (ex.id === "rennen" && (clean(e.inc) !== null || clean(e.spd) !== null)){ var det2 = document.createElement("span"); det2.className = "det"; det2.textContent = (clean(e.inc) !== null ? fmt(clean(e.inc)) + " % Steigung" : "") + (clean(e.inc) !== null && clean(e.spd) !== null ? ", " : "") + (clean(e.spd) !== null ? fmt(clean(e.spd)) + " km/h" : ""); mid.appendChild(det2); } }
      else {
        right.textContent = fmt(firstKg(e)) + " kg";
        var t = setsText(e);
        if (t){ var det = document.createElement("span"); det.className = "det"; det.textContent = t; mid.appendChild(det); }
      }
      li.appendChild(dot); li.appendChild(mid); li.appendChild(right); ul.appendChild(li);
    });
    if (ul.children.length) f.inner.appendChild(ul);
    if (s.note){ var np = document.createElement("p"); np.className = "snote"; np.textContent = s.note; f.inner.appendChild(np); }
    if (mode === "db" || mode === "local"){
      var del = document.createElement("button"); del.type = "button"; del.className = "del"; del.dataset.id = s.id; del.textContent = "Training löschen";
      f.inner.appendChild(del);
    }
    tf.inner.appendChild(f.inner);
  });
  wrap.appendChild(tf.el);
}
function renderTraining(){ PLAN.forEach(refreshRow); renderDay(); renderHistory(); renderNote(); renderBW(); }

// ---------- Notiz und Körpergewicht ----------
var exShown = false;
$("#showEx").addEventListener("click", function(){ exShown = !exShown; renderDay(); });
var noteDirty = false;
function renderNote(){
  var ta = $("#noteText"); if (document.activeElement === ta || noteDirty) return;
  var s = todaySession(); ta.value = s && s.note ? s.note : "";
}
$("#noteText").addEventListener("input", function(){ noteDirty = true; });
$("#noteSave").addEventListener("click", function(){
  var text = $("#noteText").value.trim().slice(0, 300);
  saveSessionPatch({note:text}).then(function(){ noteDirty = false; toast("Notiz gespeichert"); }).catch(function(e){ toast(errText(e)); });
});
function renderBW(){
  var list = sessions.filter(function(s){ return s.bw !== null && s.bw !== undefined && s.bw > 0; }).slice(0, 8);
  var ul = $("#bwList"); ul.innerHTML = "";
  list.forEach(function(s, i){
    var li = document.createElement("li");
    var a = document.createElement("span"); a.textContent = s.id === todayId() ? "Heute" : dateShort(s.id);
    var b = document.createElement("span"); b.className = "k"; b.textContent = fmt(s.bw) + " kg";
    var c = document.createElement("span"); c.className = "k";
    var prev = list[i + 1];
    if (prev){ var d = Math.round((s.bw - prev.bw) * 10) / 10; c.textContent = (d > 0 ? "+" : "") + fmt(d); }
    li.appendChild(a); li.appendChild(b); li.appendChild(c); ul.appendChild(li);
  });
  var hint = "";
  if (!list.length) hint = "Einmal pro Woche morgens nüchtern wiegen.";
  else { var days = Math.round((dateOf(todayId()) - dateOf(list[0].id)) / 86400000); if (days >= 7) hint = "Letztes Wiegen vor " + days + " Tagen, Zeit zum Wiegen."; }
  $("#bwHint").textContent = hint;
  var due = !list.length || Math.round((dateOf(todayId()) - dateOf(list[0].id)) / 86400000) >= 7;
  $("#bwMeta").textContent = list.length ? fmt(list[0].bw) + " kg" + (due ? ", wiegen fällig" : "") : "Noch nichts";
}
$("#bwSave").addEventListener("click", function(){
  var v = num($("#bwIn").value);
  if (v === null || v < 30 || v > 250){ toast("Gewicht in kg eintragen, z. B. 82,5."); $("#bwIn").focus(); return; }
  saveSessionPatch({bw: Math.round(v * 10) / 10}).then(function(){ $("#bwIn").value = ""; toast("Gewicht gespeichert"); }).catch(function(e){ toast(errText(e)); });
});

// ---------- Essen ----------
function todayFood(){ var t = todayId(); for (var i = 0; i < foodDays.length; i++) if (foodDays[i].id === t) return foodDays[i].items; return []; }

// ---------- Essen anzeigen ----------
function valEl(kcal, prot, cls){
  var v = document.createElement("span"); v.className = cls; v.textContent = kcal.toLocaleString("de-DE") + " kcal";
  var pp = document.createElement("span"); pp.textContent = prot + " g Eiweiß"; v.appendChild(pp); return v;
}
function rmBtn(label, attr, val){
  var b = document.createElement("button"); b.type = "button"; b.className = "rm"; b.dataset[attr] = val; b.setAttribute("aria-label", label); b.textContent = "×"; return b;
}
function renderFood(){
  var items = todayFood(), s = sum(items);
  $("#mKcal").textContent = s.k.toLocaleString("de-DE");
  $("#mProt").textContent = s.p + " g";
  var tk = $("#tKcal"), tp = $("#tProt");
  tk.firstElementChild.style.width = Math.min(100, s.k / goals.kcal * 100) + "%";
  tp.firstElementChild.style.width = Math.min(100, s.p / goals.protein * 100) + "%";
  tk.classList.toggle("full", s.k >= goals.kcal); tp.classList.toggle("full", s.p >= goals.protein);
  $("#stK").textContent = s.k.toLocaleString("de-DE"); $("#stP").textContent = s.p + " g";
  var kb = $("#stKb"), pb = $("#stPb");
  kb.style.width = Math.min(100, s.k / goals.kcal * 100) + "%"; pb.style.width = Math.min(100, s.p / goals.protein * 100) + "%";
  kb.classList.toggle("full", s.k >= goals.kcal); pb.classList.toggle("full", s.p >= goals.protein);
  renderScores();

  var box = $("#foodToday"); box.innerHTML = "";
  var edit = canEdit(), agg = aggregate(items);
  $("#todayMeta").textContent = agg.length ? agg.length + (agg.length === 1 ? " Eintrag" : " Einträge") : "Noch nichts";
  if (!agg.length){
    var e = document.createElement("p"); e.className = "empty"; e.textContent = "Noch nichts eingetragen."; box.appendChild(e);
  } else {
    var ul0 = document.createElement("ul"); ul0.className = "agg";
    agg.forEach(function(a){
      var li = document.createElement("li");
      var n = document.createElement("div"); n.className = "an";
      if (a.count > 1){ var c = document.createElement("span"); c.className = "ac"; c.textContent = a.count + "×"; n.appendChild(c); }
      n.appendChild(document.createTextNode(a.name));
      var v = document.createElement("div"); v.className = "av"; v.textContent = a.kcal.toLocaleString("de-DE") + " kcal, " + a.protein + " g";
      li.appendChild(n); li.appendChild(v);
      var parts = items.filter(function(it){ return (normKey(it.name) || it.id) === a.key; }), amts = [];
      parts.forEach(function(it){ if (it.amount && amts.indexOf(it.amount) < 0) amts.push(it.amount); });
      var tipLines = [], seenT = [];
      parts.forEach(function(it){ var l = it.name + (it.amount ? " – " + it.amount : ""); if (seenT.indexOf(l) < 0){ seenT.push(l); tipLines.push(l); } });
      if (!tipLines.length) tipLines.push(a.name);
      var ib = document.createElement("button"); ib.type = "button"; ib.className = "infob"; ib.textContent = "i"; ib.title = tipLines.join(" | "); ib.setAttribute("aria-label", a.name + ": Details anzeigen");
      var tp = document.createElement("div"); tp.className = "tip"; tp.hidden = true; tp.textContent = tipLines.join("\n");
      ib.addEventListener("click", function(ev){ ev.stopPropagation(); tp.hidden = !tp.hidden; });
      li.appendChild(ib); li.appendChild(tp);
      if (edit) li.appendChild(rmBtn((a.count > 1 ? "Ein " : "") + a.name + " entfernen", "key", a.key));
      if (edit){ var ad = document.createElement("button"); ad.type = "button"; ad.className = "add"; ad.dataset.add = a.key; ad.setAttribute("aria-label", a.name + " nochmal hinzufügen"); ad.textContent = "+1"; li.appendChild(ad); }
      ul0.appendChild(li);
    });
    box.appendChild(ul0);
  }


}

// ---------- Essen: Berechnen ohne KI ----------
var pending = null, pendingWater = 0, pendingTitle = "", calcBusy = false;
function setStatus(t){ $("#foodStatus").textContent = t || ""; }
function clearPending(){ pending = null; pendingWater = 0; renderPreview(); }

function previewRow(it, i){
  var li = document.createElement("li"); li.className = "prow";
  var nm = document.createElement("span"); nm.className = "nm"; nm.textContent = it.name;
  var sm = document.createElement("small");
  sm.textContent = it.notFound ? "Nicht gefunden, trag die Werte selbst ein" : (it.blsName && it.blsName !== it.name ? it.blsName + (it.amount ? " · " + it.amount : "") : it.amount);
  nm.appendChild(sm); li.appendChild(nm);
  if (it.notFound){
    var box = document.createElement("span"); box.className = "pin2";
    box.innerHTML = '<input inputmode="numeric" data-f="kcal" data-i="' + i + '" placeholder="kcal" aria-label="kcal"><input inputmode="numeric" data-f="protein" data-i="' + i + '" placeholder="g" aria-label="Eiweiß in Gramm">';
    if (it.kcal !== null) $('[data-f="kcal"]', box).value = it.kcal;
    if (it.protein !== null) $('[data-f="protein"]', box).value = it.protein;
    li.appendChild(box);
  } else li.appendChild(valEl(it.kcal, it.protein, "val"));
  var rm = document.createElement("button"); rm.type = "button"; rm.className = "rm"; rm.dataset.i = i; rm.setAttribute("aria-label", it.name + " entfernen"); rm.textContent = "×"; li.appendChild(rm);
  var tools = document.createElement("div"); tools.className = "ptools";
  if (it.candidates && it.candidates.length > 1){
    var sel = document.createElement("select"); sel.dataset.pick = i; sel.setAttribute("aria-label", "Anderer Treffer für " + it.name);
    it.candidates.forEach(function(c, k){ var o = document.createElement("option"); o.value = k; o.textContent = c[0]; if (c[0] === it.blsName) o.selected = true; sel.appendChild(o); });
    tools.appendChild(sel);
  }
  if (it.per100){
    var lb = document.createElement("label"); lb.className = "pgrams"; var inp = document.createElement("input"); inp.inputMode = "numeric"; inp.dataset.grams = i; inp.value = it.grams || ""; inp.setAttribute("aria-label", "Menge"); lb.appendChild(inp); lb.appendChild(document.createTextNode(it.ml ? " ml" : " g")); tools.appendChild(lb);
  }
  if (it.source !== "own"){ var keep = document.createElement("button"); keep.type = "button"; keep.className = "linkbtn"; keep.dataset.keep = i; keep.textContent = "Merken"; tools.appendChild(keep); }
  li.appendChild(tools);
  return li;
}
function renderPreview(){
  var box = $("#preview"), ul = $("#previewList");
  var hasFood = pending && pending.length, hasWater = pendingWater > 0;
  if (!hasFood && !hasWater){ box.hidden = true; return; }
  ul.innerHTML = ""; (pending || []).forEach(function(it, i){ ul.appendChild(previewRow(it, i)); });
  var s = (pending || []).reduce(function(a, it){ a.k += it.kcal || 0; a.p += it.protein || 0; return a; }, {k:0, p:0});
  $(".ptotal", box).hidden = !hasFood;
  $("#previewTotal").textContent = s.k.toLocaleString("de-DE") + " kcal, " + s.p + " g Eiweiß";
  var pw = $(".pwater", box);
  if (!pw){ pw = document.createElement("div"); pw.className = "pwater"; $(".ptotal", box).after(pw); }
  pw.hidden = !hasWater;
  pw.textContent = hasWater ? "Wasser " + liters(pendingWater) + " kommt in den Wasser-Tab" : "";
  box.hidden = false;
}
function doCalc(){
  if (calcBusy) return;
  var btn = $("#foodCalc"), text = $("#foodText").value.trim();
  if (!text){ toast("Schreib, was du gegessen hast."); $("#foodText").focus(); return; }
  if (text.length > 600) text = text.slice(0, 600);
  calcBusy = true; btn.disabled = true; setStatus("Rechne …");
  loadFoods().then(function(foods){
    var all = estimateMeal(text, {foods:foods, ownFoods:ownFoods});
    if (!all.length){ setStatus("Konnte nichts erkennen. Schreib es etwas genauer."); return; }
    var water = all.filter(function(it){ return !it.notFound && isWaterItem(it); });
    var noAmount = water.filter(function(it){ return !it.ml; });
    pending = all.filter(function(it){ return it.notFound || !isWaterItem(it); });
    pendingWater = water.reduce(function(a, it){ return a + (it.ml || 0); }, 0);
    pendingTitle = text.slice(0, 80);
    setStatus(noAmount.length ? "Wie viel Wasser? Schreib zum Beispiel „500 ml Wasser“." : "");
    renderPreview();
  }).catch(function(){ setStatus("Die Lebensmitteldaten konnten nicht geladen werden. Trag die Werte unten selbst ein."); $("#manual").open = true; })
    .then(function(){ calcBusy = false; btn.disabled = false; });
}
$("#foodCalc").addEventListener("click", doCalc);

$("#previewList").addEventListener("click", function(ev){
  var rm = ev.target.closest(".rm");
  if (rm){ pending.splice(Number(rm.dataset.i), 1); renderPreview(); return; }
  var kp = ev.target.closest("[data-keep]");
  if (kp){
    var it = pending[Number(kp.dataset.keep)];
    if (it.kcal === null || it.protein === null){ toast("Trag erst kcal und Eiweiß ein."); return; }
    var f = {id:uid6(), name:it.name.slice(0, 60), kcal:it.kcal, protein:it.protein, unit:"Portion"};
    if (it.grams) f.grams = it.grams;
    store.saveFoods(ownFoods.filter(function(x){ return normKey(x.name) !== normKey(f.name); }).concat([f]));
    toast(f.name + " gemerkt"); kp.remove();
  }
});
$("#previewList").addEventListener("change", function(ev){
  var t = ev.target, i;
  if (t.dataset.pick !== undefined){ i = Number(t.dataset.pick); pending[i] = recalculate(pending[i], {candidate:pending[i].candidates[Number(t.value)]}); renderPreview(); return; }
  if (t.dataset.grams !== undefined){ i = Number(t.dataset.grams); var g = num(t.value); if (g !== null && g > 0 && g <= 5000){ pending[i] = recalculate(pending[i], {grams:g}); renderPreview(); } else t.value = pending[i].grams || ""; return; }
  if (t.dataset.f){ i = Number(t.dataset.i); pending[i][t.dataset.f] = num(t.value); renderPreview(); }
});
$("#previewAdd").addEventListener("click", function(){
  if (!(pending && pending.length) && !(pendingWater > 0)) return;
  var open = (pending || []).filter(function(it){ return it.kcal === null || it.kcal === undefined || it.protein === null || it.protein === undefined; })[0];
  if (open){ toast("Trag Werte für „" + open.name + "“ ein oder entferne es."); return; }
  var g = uid6(), title = pendingTitle, ml = pendingWater, today = todayId();
  var add = cleanItems((pending || []).map(function(it){ return {name:it.name, amount:it.amount || "", kcal:it.kcal, protein:it.protein, n:it.n, ml:it.ml, id:uid6(), g:g, gt:title}; }));
  if (add.length) store.addFood(today, add);
  if (ml > 0) addWater(ml);
  clearPending(); $("#foodText").value = "";
  toast(ml > 0 && !add.length ? "Wasser hinzugefügt" : "Hinzugefügt");
});
$("#previewDrop").addEventListener("click", clearPending);

// ---------- Barcode ----------
function lookupBarcode(ean){
  setStatus("Suche Produkt …");
  authFetch("/api/product?ean=" + encodeURIComponent(ean)).then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(d){ if (!r.ok) throw new Error(d.error || "Produkt nicht gefunden."); return d; });
  }).then(function(p){
    var grams = p.servingG && p.servingG > 0 ? Math.round(p.servingG) : 100, item;
    if (p.kcal100 !== null && p.protein100 !== null){
      item = recalculate({name:p.name, amount:grams + " g", grams:grams, per100:{kcal:p.kcal100, protein:p.protein100}, source:"off", candidates:[]}, {grams:grams});
    } else item = {name:p.name, amount:"", kcal:null, protein:null, source:"off", notFound:true, candidates:[]};
    pending = (pending || []).concat([item]); pendingTitle = pendingTitle || p.name;
    setStatus(""); $("#bcBox").hidden = true; $("#bcIn").value = ""; renderPreview();
  }).catch(function(e){ setStatus(e.message || "Produkt nicht gefunden."); });
}
$("#photoBtn").addEventListener("click", function(){
  $("#bcBox").hidden = false;
  if ("BarcodeDetector" in window) $("#foodPhoto").click(); else $("#bcIn").focus();
});
$("#foodPhoto").addEventListener("change", function(){
  var file = this.files && this.files[0]; this.value = ""; if (!file) return;
  setStatus("Lese Barcode …");
  createImageBitmap(file).then(function(img){ return new window.BarcodeDetector().detect(img); }).then(function(codes){
    if (codes && codes.length) lookupBarcode(codes[0].rawValue);
    else { setStatus("Kein Barcode erkannt. Tipp die Nummer ein."); $("#bcIn").focus(); }
  }).catch(function(){ setStatus("Kein Barcode erkannt. Tipp die Nummer ein."); $("#bcIn").focus(); });
});
$("#bcGo").addEventListener("click", function(){
  var v = $("#bcIn").value.replace(/\s/g, "");
  if (!/^\d{8,14}$/.test(v)){ toast("Der Barcode hat 8 bis 14 Ziffern."); $("#bcIn").focus(); return; }
  lookupBarcode(v);
});

// ---------- Heute gegessen ----------
$("#foodToday").addEventListener("click", function(ev){
  var today = todayId(), ad = ev.target.closest(".add");
  if (ad){
    var cur0 = todayFood(), src = null;
    for (var j = cur0.length - 1; j >= 0; j--) if ((normKey(cur0[j].name) || cur0[j].id) === ad.dataset.add){ src = cur0[j]; break; }
    if (!src) return;
    var cp = {}; for (var k in src) cp[k] = src[k];
    cp.id = uid6(); delete cp.g; delete cp.gt;
    if (src.n > 1){ cp.kcal = Math.round(src.kcal / src.n); cp.protein = Math.round(src.protein / src.n); cp.n = 1; cp.amount = "1 Stück"; }
    store.addFood(today, [cp]); toast("+1 " + src.name);
    return;
  }
  var b = ev.target.closest(".rm"); if (!b) return;
  if (b.dataset.key){
    var r = removeOne(todayFood(), b.dataset.key); if (!r) return;
    if (r.add) store.replaceFood(today, r.remove.id, r.add); else store.removeFood(today, r.remove.id);
  } else store.removeFood(today, b.dataset.id);
  toast("Entfernt");
});

// ---------- Meine Lebensmittel ----------
function renderOwnFoods(){
  var ul = $("#ownList"); ul.innerHTML = "";
  $("#ownMeta").textContent = ownFoods.length ? String(ownFoods.length) : "";
  ownFoods.forEach(function(f){
    var li = document.createElement("li");
    var nm = document.createElement("span"); nm.className = "nm"; nm.textContent = f.name;
    var sm = document.createElement("small"); sm.textContent = "1 " + (f.unit || "Portion") + (f.grams ? ", " + f.grams + " g" : ""); nm.appendChild(sm);
    li.appendChild(nm); li.appendChild(valEl(f.kcal, f.protein, "val")); li.appendChild(rmBtn(f.name + " entfernen", "own", f.id));
    ul.appendChild(li);
  });
}
$("#ownList").addEventListener("click", function(ev){
  var b = ev.target.closest(".rm"); if (!b) return;
  store.saveFoods(ownFoods.filter(function(f){ return f.id !== b.dataset.own; }));
});
$("#ownAdd").addEventListener("click", function(){
  var name = $("#ownName").value.trim(), k = num($("#ownK").value), p = num($("#ownP").value), g = num($("#ownG").value), unit = $("#ownUnit").value.trim();
  if (!name || k === null || p === null || k < 0 || p < 0){ toast("Bitte Name, kcal und Eiweiß eintragen."); return; }
  var f = {id:uid6(), name:name.slice(0, 60), kcal:Math.round(k), protein:Math.round(p * 10) / 10, unit:(unit || "Portion").slice(0, 20)};
  if (g !== null && g > 0) f.grams = Math.round(g);
  store.saveFoods(ownFoods.filter(function(x){ return normKey(x.name) !== normKey(f.name); }).concat([f]));
  ["#ownName", "#ownK", "#ownP", "#ownG", "#ownUnit"].forEach(function(s){ $(s).value = ""; });
  toast("Gespeichert");
});


// ---------- Eigenes eintragen ----------
$("#mAdd").addEventListener("click", function(){
  var name = $("#mName").value.trim(), k = num($("#mK").value), p = num($("#mP").value);
  if (!name || k === null || p === null){ toast("Bitte Name, kcal und Eiweiß eintragen."); return; }
  var items = cleanItems([{name:name, amount:"", kcal:k, protein:p}]);
  if (!items.length){ toast("Die Werte passen nicht."); return; }
  store.addFood(todayId(), items); $("#mName").value = ""; $("#mK").value = ""; $("#mP").value = ""; toast("Hinzugefügt");
});

// ---------- Wasser ----------
function todayWaterLog(){ var t = todayId(); for (var i = 0; i < waterDays.length; i++) if (waterDays[i].id === t) return waterDays[i].log; return []; }
function liters(ml){ return (ml / 1000).toLocaleString("de-DE", {minimumFractionDigits:1, maximumFractionDigits:2}) + " l"; }
function waterGoal(){ return goals.water; }
function addWater(ml){ queueSync(); return store.addWater(todayId(), {id:uid6(), ml:Math.round(ml), at:new Date().toISOString()}); }

function renderWater(){
  var log = todayWaterLog(), ml = mlSum(log), goal = waterGoal(), pct = Math.min(1, ml / goal);
  $("#wNow").textContent = liters(ml);
  $("#wGoal").textContent = "von " + liters(goal);
  $("#wLeft").textContent = ml >= goal ? "Ziel erreicht 💧" : "Noch " + liters(goal - ml);
  $("#wFill").style.transform = "translateY(" + (186 * (1 - pct)).toFixed(1) + "px)";
  $("#stW").textContent = liters(ml); var wb = $("#stWb"); wb.style.width = (pct * 100) + "%"; wb.classList.toggle("full", ml >= goal); renderScores();
  $("#wUndo").disabled = !log.length || !canEdit();
}

$(".wbtns").addEventListener("click", function(ev){
  var b = ev.target.closest("button[data-ml]"); if (!b) return;
  var ml = Number(b.dataset.ml);
  addWater(ml); toast("+" + (ml >= 1000 ? liters(ml) : ml + " ml"));
});
$("#wAddC").addEventListener("click", function(){
  var v = num($("#wCustom").value);
  if (v === null || v <= 0 || v > 5000){ toast("Menge in ml eintragen, z. B. 330."); $("#wCustom").focus(); return; }
  addWater(v); $("#wCustom").value = ""; toast("+" + Math.round(v) + " ml");
});
$("#wUndo").addEventListener("click", function(){
  var log = todayWaterLog(); if (!log.length) return;
  store.removeWater(todayId(), log[log.length - 1].id); queueSync(); toast("Rückgängig gemacht");
});

// ---------- Schlaf ----------
function hrs(min){ return (Math.round(min / 6) / 10).toLocaleString("de-DE") + " h"; }
var sleepDirty = false;
var slNight = new Date().getHours() >= 12 ? "next" : "last";
function slWakeId(){ var d = new Date(); if (slNight === "next") d.setDate(d.getDate() + 1); return dayId(d); }
function wdName(dt){ return dt.toLocaleDateString("de-DE", {weekday:"long"}); }
function renderSleep(){
  var t = new Date(), y = new Date(), tm = new Date(); y.setDate(t.getDate() - 1); tm.setDate(t.getDate() + 1);
  $$("#slSeg button").forEach(function(b){
    b.textContent = b.dataset.n === "last" ? wdName(y) + " auf " + wdName(t) : wdName(t) + " auf " + wdName(tm);
    b.setAttribute("aria-pressed", String(b.dataset.n === slNight));
  });
  var wid = slWakeId(), ses = null, i;
  for (i = 0; i < sessions.length; i++) if (sessions[i].id === wid) ses = sessions[i];
  var sl = ses && ses.sl;
  if (!sleepDirty){
    var last = sl;
    if (!last) for (i = 0; i < sessions.length; i++) if (sessions[i].sl){ last = sessions[i].sl; break; }
    $("#slFrom").value = last ? last.from : "23:00"; $("#slTo").value = last ? last.to : "07:00";
  }
  var pv = cleanSleep({from:$("#slFrom").value, to:$("#slTo").value});
  $("#slDur").innerHTML = sl && !sleepDirty ? slHtml(sl.min) : pv ? slHtml(pv.min) : "";
  $("#slSave").textContent = sl ? "Ändern" : "Speichern";
}
$("#slSeg").addEventListener("click", function(ev){ var b = ev.target.closest("button[data-n]"); if (!b) return; slNight = b.dataset.n; sleepDirty = false; renderSleep(); });
function slPreview(){ sleepDirty = true; var pv = cleanSleep({from:$("#slFrom").value, to:$("#slTo").value}); $("#slDur").innerHTML = pv ? slHtml(pv.min) : ""; }
$("#slFrom").addEventListener("input", slPreview);
$("#slTo").addEventListener("input", slPreview);
$("#slSave").addEventListener("click", function(){
  var v = cleanSleep({from:$("#slFrom").value, to:$("#slTo").value});
  if (!v){ toast("Bitte Uhrzeiten prüfen."); return; }
  saveSessionPatch({sl:{from:v.from, to:v.to}}, slWakeId()).then(function(){ sleepDirty = false; toast("Schlaf: " + hrs(v.min)); }).catch(function(e){ toast(errText(e)); });
});

// ---------- Tagesbewertung ----------
function hlDay(id){
  var li = $('#daysList li[data-id="' + id + '"]'); if (!li) return;
  var d = li.closest("details"); if (d && !d.open) d.open = true;
  $$("#daysList li.hl").forEach(function(x){ x.classList.remove("hl"); });
  li.classList.add("hl");
  $$("#wkChart .bcol").forEach(function(c){ c.classList.toggle("sel", c.dataset.id === id); });
  setTimeout(function(){ li.scrollIntoView({behavior:"smooth", block:"center"}); }, 60);
}
function f1(n){ return Number(n).toLocaleString("de-DE", {maximumFractionDigits:1}); }
function slHtml(min){ var sc = sleepScore(min); return '<b class="slb ' + (sc >= 8 ? "g" : sc >= 5 ? "y" : "r") + '">Schlaf ' + f1(sc) + '/10</b> ' + hrs(min); }

function renderBWProg(){
  var list = sessions.filter(function(x){ return x.bw > 0 && x.id <= todayId(); }).slice().sort(function(a, b){ return a.id < b.id ? -1 : 1; });
  var due = !list.length || Math.round((dateOf(todayId()) - dateOf(list[list.length - 1].id)) / 86400000) >= 7;
  var hasToday = list.length && list[list.length - 1].id === todayId();
  var c = $("#bwCard"); if (c) c.hidden = !(due || hasToday);
  var sb = $("#bwSave"); if (sb) sb.textContent = hasToday ? "Ändern" : "Eintragen";
  var dot = $("#tabDot"); if (dot) dot.hidden = !due;
  var el = $("#bwProg"); if (!el) return;
  if (!list.length){ el.textContent = "Noch kein Gewicht eingetragen."; return; }
  var first = list[0].bw, last = list[list.length - 1].bw, d = Math.round((last - first) * 10) / 10;
  el.innerHTML = "<b>" + fmt(last) + " kg</b>" + (list.length > 1 ? ", seit " + dateShort(list[0].id) + " " + (d > 0 ? "+" : "") + fmt(d) + " kg" : "");
}
function renderScores(){
  var el = $("#dayScore"); if (!el) return;
  var late = new Date().getHours() >= 17, t = dayScore(todayId(), scoreCtx());
  el.hidden = !late; el.innerHTML = "";
  if (late){ el.appendChild(document.createTextNode("Heute ")); var b0 = document.createElement("b"); b0.textContent = f1(t.score) + "/10"; el.appendChild(b0); }
  var ids = [], d0 = new Date();
  for (var i = 6; i >= 0; i--){ var d = new Date(d0); d.setDate(d0.getDate() - i); ids.push(dayId(d)); }
  var rs = ids.map(function(id){ return {id:id, r:dayScore(id, scoreCtx())}; });
  var rw = []; for (var j = 7; j >= 1; j--){ var dj = new Date(d0); dj.setDate(d0.getDate() - j); var idj = dayId(dj); rw.push({id:idj, r:dayScore(idj, scoreCtx())}); }
  var wf = rw.filter(function(x){ return x.r.kcal > 0; }), ws = rw.filter(function(x){ return x.r.sl; });
  var aK = wf.length ? Math.round(wf.reduce(function(a, x){ return a + x.r.kcal; }, 0) / wf.length) : 0;
  var aP = wf.length ? Math.round(wf.reduce(function(a, x){ return a + x.r.prot; }, 0) / wf.length) : 0;
  var aS = ws.length ? Math.round(ws.reduce(function(a, x){ return a + sleepScore(x.r.sl.min); }, 0) / ws.length * 10) / 10 : null;
  if (!$("#wkK")) return;
  $("#wkK").textContent = aK ? aK.toLocaleString("de-DE") : "–"; $("#wkKb").style.width = Math.min(100, aK / goals.kcal * 100) + "%";
  $("#wkP").textContent = aP ? aP + " g" : "–"; $("#wkPb").style.width = Math.min(100, aP / goals.protein * 100) + "%";
  $("#wkS").textContent = aS !== null ? f1(aS) + "/10" : "–"; $("#wkSb").style.width = (aS !== null ? aS * 10 : 0) + "%";
  var maxP = Math.max(160, Math.max.apply(null, rw.map(function(x){ return x.r.prot; })));
  $("#wkGoal").style.bottom = "calc(20px + (100% - 20px) * " + (goals.protein / maxP).toFixed(3) + ")";
  var ch = $("#wkChart"); ch.innerHTML = "";
  rw.forEach(function(x){
    var col = document.createElement("div"); col.className = "bcol";
    var bar = document.createElement("i"); bar.className = "bar" + (x.r.prot >= goals.protein - 5 ? " ok" : "");
    bar.style.height = "max(3px, calc((100% - 20px) * " + (x.r.prot / maxP).toFixed(3) + "))"; bar.title = x.r.prot + " g Eiweiß";
    var lb = document.createElement("span"); lb.textContent = dateOf(x.id).toLocaleDateString("de-DE", {weekday:"short"}).replace(".", "");
    col.dataset.id = x.id; col.setAttribute("role", "button"); col.addEventListener("click", function(){ hlDay(x.id); });
    col.appendChild(bar); col.appendChild(lb); ch.appendChild(col);
  });
  var ul = $("#daysList"); ul.innerHTML = "";
  rs.slice().reverse().forEach(function(x){
    var r = x.r, early = x.id === todayId() && !late; if (early) return;
    var li = document.createElement("li"), left = document.createElement("div"); left.className = "dleft"; li.dataset.id = x.id;
    var h = document.createElement("b"); h.textContent = dateOf(x.id).toLocaleDateString("de-DE", {weekday:"long", day:"numeric", month:"numeric"}); left.appendChild(h);
    function line(t){ var sp = document.createElement("span"); sp.textContent = t; left.appendChild(sp); }
    if (!r.has) line("Keine Einträge");
    else {
      line(r.kcal.toLocaleString("de-DE") + " kcal, " + r.prot + " g Eiweiß, " + liters(r.ml));
      var st = [r.prot >= goals.protein - 10 ? "Eiweiß gut" : r.prot >= goals.protein * 0.7 ? "Eiweiß knapp" : "Eiweiß zu niedrig"];
      if (r.isTrain) st.push(/fehl/.test(r.tTxt) ? r.tTxt : "Training " + r.tTxt);
      st.push(r.ml >= r.wg ? "Wasser gut" : r.ml >= r.wg * 0.7 ? "Wasser fast" : "Wasser zu wenig");
      if (!early) line(st.join(", "));
      if (r.sl){ var sp = document.createElement("span"); sp.className = "slline"; sp.innerHTML = slHtml(r.sl.min); left.appendChild(sp); }
    }
    var ring = document.createElement("span"); ring.className = "ring2";
    if (r.has && !early){ ring.textContent = f1(r.score); ring.classList.add(r.score >= 8 ? "g" : r.score >= 5 ? "y" : "r"); } else ring.textContent = "–";
    li.appendChild(left); li.appendChild(ring); ul.appendChild(li);
  });
  var scd = rs.filter(function(x){ return x.r.has && !(x.id === todayId() && !late); });
  $("#wkMeta").textContent = "";
  $("#tageMeta").textContent = scd.length ? "Schnitt " + f1(Math.round(scd.reduce(function(a, x){ return a + x.r.score; }, 0) / scd.length * 10) / 10) : "";
  renderBWProg();
}

// ---------- Zuklapp-Zustand ----------
var FOLDKEY = "folds-v1";
function foldSt(){ try { return JSON.parse(localStorage.getItem(FOLDKEY) || "{}") || {}; } catch (e) { return {}; } }
function keyFolds(){ $$("details").forEach(function(d){ if (!d.dataset.k){ var t = d.querySelector("summary .ft") || d.querySelector("summary"); d.dataset.k = "d-" + (d.id || (t ? t.textContent.trim() : "")); } }); }
function applyFolds(){ var st = foldSt(); $$("details[data-k]").forEach(function(d){ if (Object.prototype.hasOwnProperty.call(st, d.dataset.k)) d.open = !!st[d.dataset.k]; }); }
document.addEventListener("toggle", function(ev){ var d = ev.target; if (!d || !d.dataset || !d.dataset.k) return; var st = foldSt(); st[d.dataset.k] = d.open; try { localStorage.setItem(FOLDKEY, JSON.stringify(st)); } catch (e) {} }, true);

// ---------- Interaktion Training ----------
function setOpen(li, open){
  li.classList.toggle("open", open); $(".ex-head", li).setAttribute("aria-expanded", String(open)); $(".ex-body", li).hidden = !open;
}
$("#exlist").addEventListener("click", function(ev){
  var li = ev.target.closest(".ex"); if (!li) return;
  var ex = BYID[li.dataset.id];
  if (ev.target.closest(".ex-head")){
    var willOpen = !li.classList.contains("open"); setOpen(li, willOpen);
    if (willOpen){ refreshRow(ex); li.scrollIntoView({block:"nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"}); }
    return;
  }
  var stepBtn = ev.target.closest(".step");
  if (stepBtn){ var mi = $(".min", li), mv = num(mi.value); mi.value = String(Math.max(0, (mv === null ? ex.min : mv) + Number(stepBtn.dataset.d))); dirty[ex.id] = true; return; }
  var sr = ev.target.closest(".srate");
  if (sr){ var ord = ["", "leicht", "passt", "limit"], cu = ord.indexOf(sr.dataset.r || ""); setSR(sr, ord[(cu + 1) % 4]); dirty[ex.id] = true; if (todayEntry(ex.id)) saveRow(ex, li, true); return; }
  if (ev.target.closest(".rest")){ startTimer(ex); return; }
  var save = ev.target.closest(".save");
  if (save){
    saveRow(ex, li, false).then(function(ok){
      if (ok && ex.kind === "time") goNext(ex, li, false);
    });
  }
});

function collectEntry(ex, li){
  if (ex.kind === "time"){
    var m = num($(".min", li).value);
    var out = {done:true, min: m === null ? ex.min : Math.round(m), at:new Date().toISOString()};
    if (ex.id === "rennen"){ var ii = num($(".run-inc", li).value), ss = num($(".run-spd", li).value); if (ii !== null) out.inc = ii; if (ss !== null) out.spd = ss; }
    return out;
  }
  var kgs = $$(".s-kg", li).map(function(i){ return num(i.value); });
  var reps = $$(".s-reps", li).map(function(i){ var n = num(i.value); return n === null ? null : Math.round(n); });
  if (kgs[0] === null) return null;
  var srs = $$('.setrow:not(.drop) .srate', li).map(function(b){ return rating(b.dataset.r); });
  var sets = kgs.map(function(k, i){ return {kg: k === null ? null : roundKg(k), reps: reps[i], rating: srs[i] || null}; });
  var dk = ex.drop ? num($(".d-kg", li).value) : null, dr = ex.drop ? num($(".d-reps", li).value) : null;
  var dsb = ex.drop ? $('.setrow.drop .srate', li) : null, dsr = dsb ? rating(dsb.dataset.r) : null, rr = null;
  sets.forEach(function(x){ if (x.rating) rr = x.rating; }); if (!rr) rr = dsr;
  return {kg:roundKg(kgs[0]), sets:sets, dropKg: dk === null ? null : roundKg(dk), dropReps: dr === null ? null : Math.round(dr),
          rating: rr, dropRating: dsr, at:new Date().toISOString()};
}
function saveRow(ex, li, quiet){
  var entry = collectEntry(ex, li), btn = $(".save", li);
  if (!entry){ toast("Trag erst das Gewicht für Satz 1 ein."); $(".s-kg", li).focus(); return Promise.resolve(false); }
  if (btn) btn.disabled = true;
  return saveEntry(ex.id, entry).then(function(){
    delete dirty[ex.id];
    if (!quiet) toast(ex.kind === "time" ? "Erledigt" : "Gespeichert");
    refreshRow(ex); renderDay(); return true;
  }).catch(function(e){ toast(errText(e)); return false; }).then(function(ok){ if (btn) btn.disabled = false; return ok; });
}
function nextOf(ex){ var i = PLAN.indexOf(ex); return i >= 0 && i < PLAN.length - 1 ? PLAN[i + 1] : null; }
function goNext(ex, li, withPause){
  var nx = nextOf(ex);
  setOpen(li, false);
  if (withPause) startTimer(ex, Math.max(120, (ex.rest || 90) + 30), nx ? nextExLabel(nx) : "Fertig 💪");
  if (!nx){ toast("Training fertig 💪"); return; }
  var nli = $('.ex[data-id="' + nx.id + '"]');
  setOpen(nli, true); refreshRow(nx);
  var smooth = matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  setTimeout(function(){ nli.scrollIntoView({block:"start", behavior:smooth}); }, 60);
}

// Automatischer Ablauf: Wiederholungen eingetragen → Pause, letzter Satz → nächste Übung
var autoDone = {};
$("#exlist").addEventListener("change", function(ev){
  var t = ev.target;
  var isSet = t.classList.contains("s-reps"), isDrop = t.classList.contains("d-reps");
  if (!isSet && !isDrop) return;
  var v = num(t.value); if (v === null || v <= 0) return;
  var li = t.closest(".ex"), ex = BYID[li.dataset.id];
  var st = autoDone[ex.id] || (autoDone[ex.id] = {});
  var i = isSet ? Number(t.dataset.i) : -1, tag = isDrop ? "d" : "s" + i;
  if (st[tag]) return;
  st[tag] = true;
  var last = isSet && i === ex.sets - 1;
  if (isSet && !last){ startTimer(ex, ex.rest, nextSetLabel(ex, li, i)); return; }
  if (last && ex.drop){
    var dkv = num($(".d-kg", li).value);
    toast("Jetzt Drop" + (dkv !== null ? " mit " + fmt(dkv) + " kg" : "") + ", ohne Pause");
    return;
  }
  saveRow(ex, li, true).then(function(ok){ if (ok) goNext(ex, li, true); });
});
$("#exlist").addEventListener("input", function(ev){ var li = ev.target.closest(".ex"); if (li) dirty[li.dataset.id] = true; });

var delTimer = null;
$("#history").addEventListener("click", function(ev){
  var b = ev.target.closest(".del"); if (!b) return;
  if (!b.classList.contains("confirm")){
    $$(".del.confirm").forEach(function(x){ x.classList.remove("confirm"); x.textContent = "Training löschen"; });
    b.classList.add("confirm"); b.textContent = "Wirklich löschen? Nochmal tippen";
    clearTimeout(delTimer); delTimer = setTimeout(function(){ b.classList.remove("confirm"); b.textContent = "Training löschen"; }, 4000);
    return;
  }
  clearTimeout(delTimer);
  deleteSession(b.dataset.id).then(function(){ toast("Training gelöscht"); }).catch(function(e){ toast(errText(e)); });
});

// ---------- Ansichten ----------
var VIEWS = ["training", "verlauf", "essen", "wasser"];
function showView(){
  if (!uid) return;
  var h = (location.hash || "").replace("#", ""), v = VIEWS.indexOf(h) >= 0 ? h : "training";
  $$(".view").forEach(function(s){ s.hidden = s.dataset.name !== v; });
  $$(".tabs a").forEach(function(a){ if (a.dataset.view === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
}
window.addEventListener("hashchange", function(){ showView(); window.scrollTo(0, 0); });

// ---------- Timer ----------
var tState = null, tIv = null, audio = null;
function ensureAudio(){ try { if (!audio){ var AC = window.AudioContext || window.webkitAudioContext; if (AC) audio = new AC(); } if (audio && audio.state === "suspended") audio.resume(); } catch (e) { audio = null; } }
function beep(){
  if (!audio) return;
  try { [0, 0.25, 0.5].forEach(function(t){
    var o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = 880; o.connect(g); g.connect(audio.destination);
    var s = audio.currentTime + t; g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.25, s + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, s + 0.18);
    o.start(s); o.stop(s + 0.2);
  }); } catch (e) {}
}
function mmss(ms){ var s = Math.ceil(ms / 1000); return Math.floor(s / 60) + ":" + pad(s % 60); }
function tick(){
  if (!tState) return;
  var rem = Math.max(0, tState.end - Date.now()); $("#tTime").textContent = mmss(rem);
  $("#timer").style.setProperty("--p", (tState.total ? Math.min(100, (1 - rem / (tState.total * 1000)) * 100) : 0) + "%");
  if (rem === 0 && !tState.over){ tState.over = true; $("#timer").classList.add("over"); $("#tName").textContent = "Los geht’s: " + (tState.label || ""); $("#live").textContent = "Pause vorbei"; beep(); clearInterval(tIv); tIv = null; var ts0 = tState; setTimeout(function(){ if (tState === ts0 && ts0.over){ tState = null; var tm = $("#timer"); tm.classList.add("out"); setTimeout(function(){ if (!tState) tm.hidden = true; tm.classList.remove("out"); }, 300); } }, 2000); }
}
var wakeLock = null;
function keepAwake(){
  try { if (navigator.wakeLock && !wakeLock) navigator.wakeLock.request("screen").then(function(l){ wakeLock = l; l.addEventListener("release", function(){ wakeLock = null; }); }).catch(function(){}); } catch (e) {}
}
function startTimer(ex, secs, label){
  ensureAudio(); keepAwake();
  var lbl = label || "Pause";
  tState = {total:(secs || ex.rest || 90), end:Date.now() + (secs || ex.rest || 90) * 1000, over:false, name:ex.name, label:lbl};
  var t = $("#timer"); t.hidden = false; t.classList.remove("over"); t.classList.remove("out"); $("#tName").textContent = lbl;
  clearInterval(tIv); tIv = setInterval(tick, 250); tick();
}
$("#tPlus").addEventListener("click", function(){
  if (!tState) return;
  if (tState.over){ tState.over = false; tState.end = Date.now() + 30000; $("#timer").classList.remove("over"); $("#tName").textContent = tState.label || ("Pause nach " + tState.name); clearInterval(tIv); tIv = setInterval(tick, 250); }
  else tState.end += 30000;
  tick();
});
$("#tStop").addEventListener("click", function(){ clearInterval(tIv); tIv = null; tState = null; $("#timer").hidden = true; });

var toastT = null;
function toast(msg){ var t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function(){ t.hidden = true; }, 2200); }
// ---------- Trainingstage und Pläne ----------
var DAYN = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"], DAYORDER = [1, 2, 3, 4, 5, 6, 0], planSig = "";
function renderTDays(){
  var box = $("#tDays"); box.innerHTML = "";
  DAYORDER.forEach(function(d){ var b = document.createElement("button"); b.type = "button"; b.textContent = DAYN[d]; b.dataset.d = d; b.setAttribute("aria-pressed", String(TRAIN_DAYS.indexOf(d) >= 0)); box.appendChild(b); });
  $("#tdMeta").textContent = TRAIN_DAYS.length ? DAYORDER.filter(function(d){ return TRAIN_DAYS.indexOf(d) >= 0; }).map(function(d){ return DAYN[d]; }).join(", ") : "keine";
  renderPlanEditor($("#planEditor"), {plan:plan, today:todayId(), onChange:changePlan, toast:toast});
}
// Nur neu aufbauen, wenn sich der Plan wirklich ändert. Sonst gingen getippte Werte verloren.
function applyPlan(next){
  plan = next; updatePlan();
  var sig = JSON.stringify(PLAN);
  if (sig !== planSig){ planSig = sig; buildList(); }
  renderTDays(); renderTraining(); renderWater();
}
function changePlan(next){ applyPlan(next); store.savePlan(next); }
$("#tDays").addEventListener("click", function(ev){
  var b = ev.target.closest("button[data-d]"); if (!b) return;
  changePlan(toggleTrainDay(plan, Number(b.dataset.d), todayId()));
});

// ---------- Tageswechsel ----------
function checkDayChange(){
  if (todayId() === currentDay) return;
  currentDay = todayId(); autoDone = {}; dirty = {}; exShown = false; noteDirty = false; sleepDirty = false;
  slNight = new Date().getHours() >= 12 ? "next" : "last";
  planSig = ""; applyPlan(plan); renderFood();
}
document.addEventListener("visibilitychange", function(){ if (!document.hidden) checkDayChange(); });

// ---------- Rangliste ----------
var syncT = null;
function queueSync(){
  if (!profile || profile.leaderboardOptIn !== true) return;
  clearTimeout(syncT); syncT = setTimeout(runSync, 5000);
}
function runSync(){
  return authFetch("/api/leaderboard-sync", {method:"POST"}).then(function(){ if ($("#boardFold").open) renderBoards(); }).catch(function(){ /* offline: beim nächsten Eintrag erneut */ });
}
function boardList(el, rows, unit){
  el.innerHTML = "";
  if (!rows.length){ var e = document.createElement("li"); e.className = "empty"; e.textContent = "Noch keine Einträge diese Woche."; el.appendChild(e); return; }
  rows.forEach(function(r, i){
    var li = document.createElement("li"); if (r.uid === uid) li.className = "me";
    var a = document.createElement("span"); a.className = "brank"; a.textContent = (i + 1) + ".";
    var b = document.createElement("span"); b.className = "bname"; b.textContent = r.username || "Anonym";
    var c = document.createElement("span"); c.className = "k"; c.textContent = unit(r.value);
    li.appendChild(a); li.appendChild(b); li.appendChild(c); el.appendChild(li);
  });
}
function renderBoards(){
  var week = weekIdOf(todayId());
  $("#boardMeta").textContent = "Woche " + Number(week.slice(-2));
  Promise.all([loadLeaderboard(week, "training"), loadLeaderboard(week, "water")]).then(function(res){
    boardList($("#boardTraining"), res[0], function(v){ return Math.round(v).toLocaleString("de-DE") + " kg"; });
    boardList($("#boardWater"), res[1], function(v){ return liters(v); });
  }).catch(function(e){ console.error(e); $("#boardMeta").textContent = "Gerade nicht verfügbar"; });
}
$("#boardFold").addEventListener("toggle", function(){ if (this.open) renderBoards(); });
$("#boardOpt").addEventListener("change", function(){
  var on = this.checked;
  profile = Object.assign({}, profile, {leaderboardOptIn:on});
  store.saveProfile({leaderboardOptIn:on});
  setTimeout(runSync, 1500);
  toast(on ? "Du bist in der Rangliste dabei" : "Du wirst aus der Rangliste entfernt");
});

// ---------- Ziele und Konto ----------
function applyGoals(){
  $("#kcalOf").textContent = "von " + goals.kcal.toLocaleString("de-DE") + " kcal";
  $("#protOf").textContent = "von " + goals.protein + " g";
  $("#wkLine").textContent = "Eiweiß pro Tag, Linie = " + goals.protein + " g";
  $("#goalMeta").textContent = goals.kcal.toLocaleString("de-DE") + " kcal, " + goals.protein + " g";
  if (document.activeElement !== $("#gKcal")) $("#gKcal").value = goals.kcal;
  if (document.activeElement !== $("#gProt")) $("#gProt").value = goals.protein;
  if (document.activeElement !== $("#gWater")) $("#gWater").value = goals.water;
}
$("#goalSave").addEventListener("click", function(){
  goals = cleanGoals({kcal:num($("#gKcal").value), protein:num($("#gProt").value), water:num($("#gWater").value)});
  store.saveProfile({goals:goals}); applyGoals(); renderFood(); renderWater(); toast("Ziele gespeichert");
});
$("#nameSave").addEventListener("click", function(){
  var v = $("#accName").value.trim();
  if (v.length < 2 || v.length > 30){ toast("Der Name braucht 2 bis 30 Zeichen."); return; }
  store.saveProfile({username:v}); queueSync(); toast("Name gespeichert");
});
$("#logoutBtn").addEventListener("click", function(){
  if (!navigator.onLine && !confirm("Du bist offline. Nicht synchronisierte Einträge gehen beim Abmelden verloren. Trotzdem abmelden?")) return;
  if (store) store.stop();
  logout().then(function(){ location.reload(); });
});
$("#exportBtn").addEventListener("click", function(){
  store.exportAll().then(function(data){
    var url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:"application/json"}));
    var a = document.createElement("a"); a.href = url; a.download = "body-tracking-" + todayId() + ".json"; a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
  }).catch(function(){ toast("Export hat nicht geklappt. Bist du online?"); });
});
$("#delBtn").addEventListener("click", function(){
  var pw = $("#delPw").value;
  if (!pw){ toast("Bestätige das Löschen mit deinem Passwort."); $("#delPw").focus(); return; }
  var btn = this; btn.disabled = true;
  if (store) store.stop();
  deleteAccount(pw).then(function(){ location.reload(); }).catch(function(e){
    btn.disabled = false; toast(authErrorText(e)); startData();
  });
});

// ---------- Einladungen ----------
function inviteRequest(method){
  return authFetch("/api/invite", {method:method}).then(function(r){
    return r.json().catch(function(){ return {}; }).then(function(d){
      if (!r.ok) throw Object.assign(new Error(d.error || "Das hat nicht geklappt. Versuch es nochmal."), {status:d});
      return d;
    });
  });
}
function showInviteStatus(s){
  if (!s || typeof s.remaining !== "number") return;
  $("#inviteMeta").textContent = "Noch " + s.remaining + " von " + s.limit;
  $("#inviteBtn").disabled = s.remaining <= 0;
}
$("#inviteFold").addEventListener("toggle", function(){
  if (!this.open) return;
  inviteRequest("GET").then(showInviteStatus).catch(function(){ $("#inviteMeta").textContent = "Gerade nicht verfügbar"; });
});
$("#inviteBtn").addEventListener("click", function(){
  var btn = this; btn.disabled = true;
  inviteRequest("POST").then(function(d){
    $("#inviteLink").value = location.origin + "/?invite=" + encodeURIComponent(d.code);
    $("#inviteResult").hidden = false;
    btn.disabled = false;
    showInviteStatus(d);
    toast("Einladung erstellt");
  }).catch(function(e){
    btn.disabled = false;
    showInviteStatus(e.status);
    toast(e.message || "Das hat nicht geklappt. Versuch es nochmal.");
  });
});
$("#inviteCopy").addEventListener("click", function(){
  var field = $("#inviteLink");
  field.select();
  var copied = navigator.clipboard ? navigator.clipboard.writeText(field.value) : Promise.reject();
  copied.then(function(){ toast("Link kopiert"); }).catch(function(){ toast("Bitte den markierten Link selbst kopieren."); });
});

// ---------- Anmeldung ----------
// Der Code aus dem Einladungslink soll nicht in Verlauf oder Adresszeile bleiben.
var linkInvite = (function(){
  var params = new URLSearchParams(location.search), code = params.get("invite");
  if (!params.has("invite")) return "";
  params.delete("invite");
  var rest = params.toString();
  history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
  return code && /^[A-Za-z0-9-]{5,40}$/.test(code) ? code : "";
})();
function authMsg(t){ $("#authMsg").textContent = t || ""; }
function setAuthMode(m){
  $("#authView").dataset.mode = m;
  $$("#authView [data-only]").forEach(function(n){ n.hidden = n.dataset.only.split(" ").indexOf(m) < 0; });
  $("#authSubmit").textContent = m === "register" ? "Konto anlegen" : m === "reset" ? "Link senden" : "Anmelden";
  $("#authPw").autocomplete = m === "register" ? "new-password" : "current-password";
  authMsg("");
}
$("#authView").addEventListener("click", function(ev){ var b = ev.target.closest("[data-go]"); if (b) setAuthMode(b.dataset.go); });
$("#authForm").addEventListener("submit", function(ev){
  ev.preventDefault();
  var m = $("#authView").dataset.mode, email = $("#authEmail").value.trim(), pw = $("#authPw").value, btn = $("#authSubmit"), job;
  if (m === "reset") job = resetPassword(email).then(function(){ setAuthMode("login"); authMsg("Falls es das Konto gibt, ist der Link unterwegs."); });
  else if (m === "register") job = register({inviteCode:$("#authCode").value, username:$("#authName").value, email:email, password:pw});
  else job = login(email, pw);
  btn.disabled = true; authMsg("");
  job.catch(function(e){ authMsg(authErrorText(e)); }).then(function(){ btn.disabled = false; });
});

function showGate(on){
  $("#authView").hidden = !on;
  $(".top").hidden = on;
  if (on) $$(".view").forEach(function(s){ s.hidden = true; }); else showView();
}
var appReady = false;
function startData(){
  store = createStore(uid, function(e){ toast(errText(e)); });
  var fail = function(){ setBanner("Deine Daten konnten nicht geladen werden. Prüf die Verbindung oder melde dich neu an."); };
  store.onProfile(function(p){
    profile = p || {};
    goals = cleanGoals(profile.goals);
    applyGoals();
    if (document.activeElement !== $("#accName")) $("#accName").value = profile.username || "";
    $("#boardOpt").checked = profile.leaderboardOptIn === true;
    renderFood(); renderWater();
    if (!appReady && profile.leaderboardOptIn === true) queueSync();
  }, fail);
  store.onPlan(function(doc){
    if (!doc){ var fresh = defaultPlanDoc(todayId()); store.savePlan(fresh); applyPlan(fresh); }
    else applyPlan(normalizePlan(doc, todayId()));
    if (!appReady){ appReady = true; showGate(false); }
  }, fail);
  store.onFoods(function(items){ ownFoods = items; renderOwnFoods(); }, fail);
  store.onDays(function(list){
    sessions = list.map(function(d){
      var x = d.data || {};
      return {id:d.id, entries:(x.entries && typeof x.entries === "object") ? x.entries : {}, note:typeof x.note === "string" ? x.note.slice(0, 300) : "", bw:clean(x.bw), sl:cleanSleep(x.sl), plannedIds:Array.isArray(x.plannedIds) ? x.plannedIds : null};
    });
    renderTraining();
  }, fail);
  store.onFood(function(list){ foodDays = list.map(function(d){ return {id:d.id, items:cleanItems(d.items)}; }); renderFood(); }, fail);
  store.onWater(function(list){ waterDays = list.map(function(d){ return {id:d.id, log:cleanLog(d.log)}; }); renderWater(); }, fail);
}

onAuthChange(function(user){
  if (!user){
    uid = null; showGate(true);
    setAuthMode(linkInvite ? "register" : "login");
    if (linkInvite){ $("#authCode").value = linkInvite; linkInvite = ""; }
    return;
  }
  hasMemberClaim(user).then(function(ok){
    if (!ok){ showGate(true); setAuthMode("login"); authMsg("Dieses Konto hat keinen Zugang. Du brauchst eine Einladung."); logout(); return; }
    if (uid === user.uid) return;
    uid = user.uid; FOLDKEY = "folds-v1:" + uid;
    keyFolds(); applyFolds();
    updatePlan(); planSig = JSON.stringify(PLAN); buildList(); startData();
  }).catch(function(){ showGate(true); authMsg("Anmeldung konnte nicht geprüft werden. Bist du online?"); });
});

updatePlan(); planSig = JSON.stringify(PLAN); buildList(); renderTDays(); renderFood(); renderWater(); renderTraining();
setInterval(function(){ checkDayChange(); renderScores(); }, 60000);
