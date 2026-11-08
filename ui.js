// Oberfläche: Startseite, Spielbildschirm, Fenster. Verbindet Game (game.js) und MapView (map.js).
"use strict";

const $ = id => document.getElementById(id);
/** Text sicher in HTML einsetzen (Spielernamen kommen vom Benutzer). */
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
/** Farben/Breiten per JavaScript setzen (Inline-Styles sind aus Sicherheitsgründen gesperrt). */
function paint(root) {
  root.querySelectorAll("[data-c]").forEach(el => { el.style.background = el.dataset.c; });
  root.querySelectorAll("[data-w]").forEach(el => { el.style.width = el.dataset.w; });
}
const dot = (color, extra = "") => `<span class="dot ${extra}" data-c="${color}"></span>`;
const isWide = () => window.matchMedia("(min-width: 900px)").matches;

const game = new Game();
const map = new MapView($("map"), game);

// ---------- Klänge (selbst erzeugt, keine Dateien) ----------
const Sound = {
  ctx: null,
  unlock() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
  tone(freq, dur, type = "sine", vol = 0.15, delay = 0) {
    const c = this.ctx; if (!c) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur);
  },
  play(name) {
    switch (name) {
      case "pop": this.tone(660, 0.08, "sine", 0.2); break;
      case "tink": this.tone(1320, 0.06, "triangle", 0.12); break;
      case "basso": this.tone(140, 0.25, "square", 0.08); if (navigator.vibrate) navigator.vibrate(60); break;
      case "ping": this.tone(880, 0.3, "sine", 0.12); break;
      case "hero": [523, 659, 784].forEach((f, k) => this.tone(f, 0.18, "triangle", 0.14, k * 0.09)); break;
      case "glass": [784, 988, 1175, 1568].forEach((f, k) => this.tone(f, 0.35, "sine", 0.12, k * 0.12)); break;
    }
  },
};
document.addEventListener("pointerdown", () => Sound.unlock(), { capture: true });
game.onSound = n => Sound.play(n);

// ---------- Startseite ----------
const setup = {
  players: [0, 1, 2, 3].map(i => ({ name: DEFAULT_NAMES[i], kind: i === 0 ? "human" : i === 1 ? "computer" : "none", difficulty: 1 })),
  settings: { startCountries: 3, randomStart: false, eventsEnabled: true },
};

function renderSetup() {
  const box = $("players");
  box.innerHTML = setup.players.map((p, i) => `
    <div class="prow">
      ${dot(PLAYER_COLORS[i])}
      <input type="text" maxlength="20" value="${esc(p.name)}" data-i="${i}" aria-label="Name Spieler ${i + 1}" ${p.kind === "none" ? "disabled" : ""}>
      <select data-i="${i}" aria-label="Stärke" ${p.kind === "computer" ? "" : "hidden"}>${DIFF_LABELS.map((d, k) =>
        `<option value="${k}" ${p.difficulty === k ? "selected" : ""}>${d}</option>`).join("")}</select>
      <div class="seg" role="radiogroup">${["human", "computer", "none"].map(k =>
        `<button type="button" class="${p.kind === k ? "on" : ""}" data-i="${i}" data-k="${k}">${KIND_LABELS[k]}</button>`).join("")}</div>
    </div>`).join("");
  paint(box);
  $("startLabel").textContent = `Startländer: ${setup.settings.startCountries}`;
  $("optRandom").checked = setup.settings.randomStart;
  $("optEvents").checked = setup.settings.eventsEnabled;
  $("optSound").checked = game.soundOn;
  $("soundLabel").textContent = game.soundOn ? "🔊 Ton an" : "🔇 Ton aus";
  $("btnContinue").hidden = SaveStore.list().length === 0;
}

$("players").addEventListener("input", e => { if (e.target.matches("input[type=text]")) setup.players[+e.target.dataset.i].name = e.target.value; });
$("players").addEventListener("change", e => { if (e.target.matches("select")) setup.players[+e.target.dataset.i].difficulty = +e.target.value; });
$("players").addEventListener("click", e => {
  const b = e.target.closest(".seg button"); if (!b) return;
  setup.players[+b.dataset.i].kind = b.dataset.k; renderSetup();
});
$("startMinus").onclick = () => { setup.settings.startCountries = Math.max(1, setup.settings.startCountries - 1); renderSetup(); };
$("startPlus").onclick = () => { setup.settings.startCountries = Math.min(6, setup.settings.startCountries + 1); renderSetup(); };
$("optRandom").onchange = e => { setup.settings.randomStart = e.target.checked; };
$("optEvents").onchange = e => { setup.settings.eventsEnabled = e.target.checked; };
$("optSound").onchange = e => { game.setSound(e.target.checked); renderSetup(); };
$("btnRules").onclick = () => showRules();
$("btnLoad").onclick = () => showSaves("load");
$("btnContinue").onclick = () => { const s = SaveStore.list()[0]; if (s) game.loadState(s.state, s.name); };
$("btnStart").onclick = () => {
  const active = setup.players.filter(p => p.kind !== "none");
  const err = $("setupError");
  if (active.length < 2) { err.textContent = "Es müssen mindestens zwei Spieler mitspielen."; err.hidden = false; return; }
  err.hidden = true;
  const players = setup.players.map((p, i) => ({ ...p, name: p.name.trim() || DEFAULT_NAMES[i] }));
  map.resetZoom();
  game.newGame(players, { ...setup.settings });
};

// ---------- Spielbildschirm ----------
$("tbEnd").onclick = () => game.endTurn();
$("tbOverview").onclick = () => showOverview();
$("tbMenu").onclick = () => showMenu();
$("zoomIn").onclick = () => map.zoomBy(1.5);
$("zoomOut").onclick = () => map.zoomBy(1 / 1.5);
$("zoomReset").onclick = () => map.resetZoom();
$("btnWinnerNew").onclick = () => game.closeGame();
map.onZoom = () => { $("zoomReset").hidden = map.zoom <= 1.001; $("zoomOut").disabled = map.zoom <= 1.001; $("zoomIn").disabled = map.zoom >= map.maxZoom; };
map.onZoom();

function hint(s) {
  if (s.phase === "picking") return "Tippe auf ein freies Land, um es als Startland zu wählen. Mit zwei Fingern kannst du die Karte vergrößern.";
  if (s.phase === "playing") return game.isHumanTurn
    ? "Tippe eines deiner Länder an und dann ein weiß umrandetes Nachbarland – oder ziehe mit dem Finger von deinem Land auf das Ziel."
    : "Der Computer ist am Zug …";
  return s.winnerText || "";
}

function sidebarHTML(s) {
  const p = s.players[s.current];
  const rows = s.players.filter(x => x.kind !== "none").map(x => {
    const st = game.stats(x.id);
    return `<tr class="${x.id === s.current ? "cur" : ""} ${x.alive ? "" : "dead"}"><td>${dot(PLAYER_COLORS[x.id])} <span class="n">${esc(x.name)}</span></td>
      <td>${st.countries}</td><td>${st.units}</td><td>${st.income}</td></tr>`;
  }).join("");
  const i = game.selected ?? game.hovered;
  let detail = `<p class="muted small">${esc(hint(s))}</p>`;
  if (i !== null && i !== undefined) {
    const c = COUNTRIES[i], t = s.territories[i];
    const owner = t.owner === null ? "neutral" : s.players[t.owner].name;
    detail = `<div><h3 class="side-head">${dot(playerColor(t.owner))} ${esc(c.name)}</h3>
      <dl class="facts">
        <dt>Hauptstadt</dt><dd>${esc(c.capital)}</dd>
        <dt>Besitzer</dt><dd>${esc(owner)}</dd>
        <dt>Einheiten</dt><dd>${t.owner === s.current && s.phase === "playing" ? `${t.units} (${game.available(i)} bewegbar)` : t.units}</dd>
        ${t.owner !== null ? `<dt>Rückhalt</dt><dd>${t.loyalty} %</dd>` : ""}
        <dt>Einkommen</dt><dd>+${game.income(i)} / Runde</dd>
        <dt>Bevölkerung</dt><dd>${c.population.toFixed(1).replace(".", ",")} Mio.</dd>
      </dl>
      <p class="muted small">Nachbarn: ${ADJ[i].map(j => esc(COUNTRIES[j].name)).join(", ")}</p></div>`;
    const h = game.hovered, sel = game.selected;
    if (h !== null && sel !== null && h !== sel) {
      detail += game.isNeighbor(sel, h)
        ? `<p class="small"><strong>→ Ziel: ${esc(COUNTRIES[h].name)} (${s.territories[h].units} Einheiten)</strong></p>`
        : `<p class="small warn">${esc(COUNTRIES[h].name)} grenzt nicht an ${esc(COUNTRIES[sel].name)}.</p>`;
    }
  }
  return `
    <div class="side-head"><h2>${s.phase === "picking" ? "Startländer wählen" : "Runde " + s.round}</h2><span class="grow"></span>
      ${game.aiRunning ? '<span class="spinner"></span>' : ""}<button type="button" class="icon-btn" data-act="menu" aria-label="Menü">⋯</button></div>
    <div class="side-head">${dot(PLAYER_COLORS[s.current])} <strong>${esc(p.name)}</strong>
      <span class="muted">${p.kind === "computer" ? `(Computer, ${DIFF_LABELS[p.difficulty]})` : "ist am Zug"}</span></div>
    ${s.phase === "picking" ? `<div class="small">Noch ${s.picksLeft[s.current]} Land/Länder wählen.</div>` : ""}
    ${s.phase === "playing" ? `<button type="button" class="btn primary big" data-act="end" ${game.isHumanTurn ? "" : "disabled"}>Zug beenden</button>` : ""}
    <div class="side-btns"><button type="button" class="btn" data-act="save" ${game.aiRunning ? "disabled" : ""}>Sichern</button>
      <button type="button" class="btn" data-act="load" ${game.aiRunning ? "disabled" : ""}>Laden</button></div>
    <hr>
    <table class="players"><tr><th>Spieler</th><th>Länder</th><th>Einh.</th><th>+/Rd</th></tr>${rows}</table>
    <hr>${detail}<hr>
    <strong>Chronik</strong>
    <div class="chron">${s.log.map(e => `<div>${dot(playerColor(e.player))}<span>${esc(e.text)}</span></div>`).join("")}</div>`;
}

function sidebarClick(e) {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act;
  if (act === "end") { closeModal(); game.endTurn(); }
  if (act === "save") showSaves("save");
  if (act === "load") showSaves("load");
  if (act === "menu") showMenu();
}
$("sidebar").addEventListener("click", sidebarClick);

function infoHTML(s) {
  const i = game.selected;
  if (i === null) return `<div class="muted small">${esc(hint(s))}</div>`;
  const c = COUNTRIES[i], t = s.territories[i];
  const owner = t.owner === null ? "neutral" : s.players[t.owner].name;
  const mine = t.owner === s.current && s.phase === "playing";
  return `<h3>${dot(playerColor(t.owner))} ${esc(c.name)} <span class="muted">· ${esc(owner)}</span></h3>
    <div>${t.units} Einheiten${mine ? ` (${game.available(i)} bewegbar)` : ""} · +${game.income(i)}/Runde</div>
    ${mine && game.isHumanTurn ? '<div class="muted small">Tippe jetzt auf ein weiß umrandetes Nachbarland.</div>' : ""}`;
}

function render() {
  const s = game.state;
  $("setup").hidden = !!s; $("game").hidden = !s;
  if (!s) { renderSetup(); if (modal.kind === "move" || modal.kind === "battle" || modal.kind === "overview") closeModal(); return; }
  const p = s.players[s.current];
  $("tbDot").dataset.c = PLAYER_COLORS[s.current]; paint($("tbDot").parentElement);
  $("tbName").textContent = p.name;
  $("tbRound").textContent = s.phase === "picking" ? `Startländer: noch ${s.picksLeft[s.current]}` : `Runde ${s.round}`;
  $("tbSpinner").hidden = !game.aiRunning;
  $("tbEnd").hidden = s.phase !== "playing"; $("tbEnd").disabled = !game.isHumanTurn;

  const side = $("sidebar");
  if (isWide()) { side.innerHTML = sidebarHTML(s); paint(side); scrollChron(side); }
  else { const inf = $("info"); inf.innerHTML = infoHTML(s); paint(inf); }
  if (modal.kind === "overview") { $("sheet").innerHTML = sidebarHTML(s); paint($("sheet")); scrollChron($("sheet")); }

  const toast = $("toast"); toast.hidden = !game.toast; toast.textContent = game.toast || "";
  $("winner").hidden = s.phase !== "finished"; $("winnerText").textContent = s.winnerText || "";

  if (game.pendingMove && modal.kind !== "move") showMove(game.pendingMove);
  if (!game.pendingMove && modal.kind === "move") closeModal();
  if (game.battle && modal.kind !== "battle" && !game.pendingMove) showBattle(game.battle);
  map.draw();
}
/** Chronik immer bis zum neuesten Eintrag zeigen */
function scrollChron(root) {
  const ch = root.querySelector(".chron"); if (ch) ch.scrollTop = ch.scrollHeight;
}
game.onChange = render;
window.addEventListener("resize", render);

// ---------- Fenster ----------
const modal = { kind: null };
function openModal(kind, html, onClick) {
  modal.kind = kind;
  const sheet = $("sheet");
  sheet.innerHTML = html; paint(sheet);
  sheet.onclick = onClick || null;
  $("modal").hidden = false;
}
function closeModal() { modal.kind = null; $("modal").hidden = true; $("sheet").innerHTML = ""; $("sheet").onclick = null; }
$("modal").addEventListener("click", e => {
  if (e.target !== $("modal")) return;   // Klick neben das Fenster schließt es
  if (modal.kind === "move") { game.pendingMove = null; }
  if (modal.kind === "battle") { game.battle = null; }
  if (modal.kind === "confirm") return;   // Rückfrage muss beantwortet werden
  closeModal(); render();
});

function showMove(move) {
  const s = game.state, src = COUNTRIES[move.source], dst = COUNTRIES[move.target];
  const tgt = s.territories[move.target], me = s.current, maxN = Math.max(1, game.available(move.source));
  const hostile = tgt.owner !== me;
  const title = !hostile ? "Einheiten verlegen" : (tgt.units === 0 ? "Land besetzen" : "Angriff");
  const side = (lbl, name, owner, units) => `<div><small>${lbl}</small><strong>${dot(playerColor(owner))} ${esc(name)}</strong><div>${units} Einheiten</div></div>`;
  openModal("move", `
    <h2>${title}</h2>
    <div class="sides">${side("von", src.name, me, s.territories[move.source].units)}<span class="icon">${hostile ? "🔥" : "➜"}</span>${side("nach", dst.name, tgt.owner, tgt.units)}</div>
    <strong id="mvCount"></strong>
    ${maxN > 1 ? `<input type="range" id="mvRange" min="1" max="${maxN}" step="1" value="${maxN}">` : ""}
    <div class="quick"><button type="button" class="btn" data-n="1">1</button><button type="button" class="btn" data-n="${Math.max(1, Math.floor(maxN / 2))}">Hälfte</button><button type="button" class="btn" data-n="${maxN}">Alle</button></div>
    ${hostile && tgt.units > 0 ? `<div>Geschätzte Siegchance: <strong id="mvChance"></strong></div><div class="muted small">Verteidiger erhalten einen Bonus von 20 %. Höherer Rückhalt stärkt die Truppen.</div>` : ""}
    <div class="actions"><button type="button" class="btn" data-act="cancel">Abbrechen</button><button type="button" class="btn primary" data-act="go">${hostile ? "Angreifen" : "Verlegen"}</button></div>`,
    e => {
      const n = e.target.closest("[data-n]"); if (n) { setN(+n.dataset.n); return; }
      const a = e.target.closest("[data-act]"); if (!a) return;
      if (a.dataset.act === "cancel") { game.pendingMove = null; closeModal(); render(); }
      if (a.dataset.act === "go") { closeModal(); game.execute(move, count); }
    });
  let count = maxN;
  const setN = n => {
    count = n; if ($("mvRange")) $("mvRange").value = n;
    $("mvCount").textContent = `Wie viele Einheiten? ${n} von ${maxN}`;
    const ch = $("mvChance");
    if (ch) {
      const defLoy = tgt.owner === null ? Rules.neutralLoyalty : tgt.loyalty;
      const p = Rules.winChance(n, s.territories[move.source].loyalty, tgt.units, defLoy);
      ch.textContent = Math.round(p * 100) + " %";
      ch.style.color = p > 0.7 ? "#1a9940" : p > 0.35 ? "#e08600" : "#d70015";
    }
  };
  if ($("mvRange")) $("mvRange").oninput = e => setN(+e.target.value);
  setN(maxN);
}

function showBattle(r) {
  const s = game.state;
  const aName = s.players[r.attacker].name, dName = r.defender === null ? "Neutrale Truppen" : s.players[r.defender].name;
  const target = COUNTRIES[r.target].name, maxU = Math.max(r.attackers, r.defenders, 1);
  const bar = (name, color, from, to) => `<div><div class="bar-row"><strong>${esc(name)}</strong><span>${from} → ${to} (−${from - to})</span></div>
    <div class="bar"><div data-c="${color}" data-w="${from / maxU * 100}%" data-to="${Math.max(0.5, to / maxU * 100)}%"></div></div></div>`;
  openModal("battle", `
    <h2>Kampf um ${esc(target)}</h2>
    ${bar(aName, playerColor(r.attacker), r.attackers, r.attackersLeft)}
    ${bar(dName, playerColor(r.defender), r.defenders, r.defendersLeft)}
    <div class="result" id="btResult">${r.attackersLeft > 0 ? `${esc(target)} gehört jetzt ${esc(aName)}!` : `${esc(target)} bleibt in der Hand von ${esc(dName)}.`}</div>
    <div class="actions"><button type="button" class="btn primary" data-act="ok">Weiter</button></div>`,
    e => { if (e.target.closest("[data-act=ok]")) { game.battle = null; closeModal(); render(); } });
  $("btResult").style.color = r.attackersLeft > 0 ? "#1a9940" : "#d70015";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $("sheet").querySelectorAll("[data-to]").forEach(el => { el.style.width = el.dataset.to; });
    $("btResult")?.classList.add("show");
  }));
}

function showRules() {
  const r = (t, x) => `<h3>${t}</h3><p>${x}</p>`;
  openModal("rules", `<h2>Spielregeln</h2><div class="rules">
    ${r("Ziel", "Bringe alle Staaten Afrikas unter deine Kontrolle. Wer kein Land mehr besitzt, scheidet aus.")}
    ${r("Start", `Jeder Spieler wählt reihum seine Startländer (oder sie werden zufällig verteilt). Jedes Startland beginnt mit ${Rules.startUnits} Einheiten. Alle übrigen Länder werden von neutralen Truppen gehalten – je bevölkerungsreicher, desto mehr.`)}
    ${r("Dein Zug", "Tippe ein eigenes Land an, dann ein Nachbarland (durchgezogene Linie = Landgrenze, gestrichelt = Seeweg). Ist es dein eigenes, verlegst du Einheiten. Sonst greifst du an. Jede Einheit darf pro Zug nur einmal eingesetzt werden, und mindestens eine Einheit bleibt immer zurück.")}
    ${r("Kampf", "Beide Seiten kämpfen, bis eine Seite aufgerieben ist. Entscheidend sind die Truppenstärke, der Rückhalt der Bevölkerung und ein Verteidigungsbonus von 20 %. Ein wenig Glück spielt auch mit. Die Siegchance wird vor jedem Angriff angezeigt.")}
    ${r("Einkommen", `Zu Beginn jedes Zuges erhält jedes deiner Länder neue Einheiten. Bevölkerungsreiche Länder bringen mehr. Frisch eroberte Länder haben wenig Rückhalt (25 %), der jede Runde um ${Rules.loyaltyGrowth} Punkte wächst und das Einkommen erhöht.`)}
    ${r("Ereignisse", "Dürre, Seuchen, Überschwemmungen, Proteste oder Aufstände können Truppen kosten. Länder mit geringem Rückhalt können sich bei einem Aufstand lossagen. Freiwillige und gute Ernten helfen dagegen.")}
    ${r("Bedienung", "Karte mit zwei Fingern vergrößern, mit einem Finger verschieben – oder die Knöpfe + und − nutzen. Am Computer geht auch das Mausrad.")}
    ${r("Tipps", "Sichere zuerst bevölkerungsreiche Nachbarn. Halte Grenzländer stark und schiebe Einheiten aus dem Hinterland an die Front.")}
    </div><div class="actions"><button type="button" class="btn primary" data-act="close">Schließen</button></div>`,
    e => { if (e.target.closest("[data-act=close]")) closeModal(); });
}

function showOverview() { openModal("overview", "", sidebarClick); render(); }

function showMenu() {
  openModal("menu", `<h2>Menü</h2><div class="menu-list">
    <button type="button" data-act="save" ${game.aiRunning ? "disabled" : ""}>💾 Spiel sichern</button>
    <button type="button" data-act="load" ${game.aiRunning ? "disabled" : ""}>📂 Spiel laden</button>
    <button type="button" data-act="new">➕ Neues Spiel</button>
    <label>🔊 Klänge <input type="checkbox" class="switch" id="mnSound" ${game.soundOn ? "checked" : ""}></label>
    <label>🐇 Schneller Computer <input type="checkbox" class="switch" id="mnFast" ${game.fastAI ? "checked" : ""}></label>
    <button type="button" data-act="rules">❓ Spielregeln</button>
    </div><div class="actions"><button type="button" class="btn primary" data-act="close">Fertig</button></div>`,
    e => {
      const a = e.target.closest("[data-act]"); if (!a) return;
      ({ save: () => showSaves("save"), load: () => showSaves("load"), rules: showRules, close: closeModal,
         new: () => leaveGame("neuen Spiel", () => { closeModal(); game.closeGame(); }) })[a.dataset.act]();
    });
  $("mnSound").onchange = e => game.setSound(e.target.checked);
  $("mnFast").onchange = e => { game.fastAI = e.target.checked; };
}

/** Vor „Neues Spiel“ oder „Laden“: ungesicherte Partie sichern? */
function leaveGame(action, proceed) {
  if (!game.needsSaving) return proceed();
  const name = game.suggestedSaveName;
  openModal("confirm", `<h2>Spielstand vor dem ${esc(action)} sichern?</h2>
    <p>Die laufende Partie (Runde ${game.state.round}) ist noch nicht gesichert. „Sichern“ legt sie unter „${esc(name)}“ ab.</p>
    <div class="actions"><button type="button" class="btn" data-act="cancel">Abbrechen</button>
      <button type="button" class="btn danger" data-act="discard">Nicht sichern</button>
      <button type="button" class="btn primary" data-act="save">Sichern</button></div>`,
    e => {
      const a = e.target.closest("[data-act]"); if (!a) return;
      if (a.dataset.act === "cancel") return closeModal();
      if (a.dataset.act === "save" && !game.saveAs(name)) return;
      if (a.dataset.act === "discard") game.markDiscarded();
      closeModal(); proceed();
    });
}

function showSaves(mode) {
  let slots = SaveStore.list(), sel = mode === "load" ? (slots[0]?.name ?? null) : null;
  const draw = () => {
    const list = slots.length ? slots.map(sl => {
      const st = sl.state, label = st.phase === "picking" ? "Startphase" : st.phase === "finished" ? "Beendet" : "Runde " + st.round;
      const when = new Date(sl.date).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
      return `<button type="button" class="slot ${sel === sl.name ? "on" : ""}" data-name="${esc(sl.name)}"><strong>${esc(sl.name)}</strong>
        <small>${label} · ${st.players.filter(p => p.kind !== "none").map(p => esc(p.name)).join(", ")} · ${when}</small></button>`;
    }).join("") : `<div class="empty">Noch keine Spielstände gespeichert.</div>`;
    openModal("saves", `<h2>${mode === "save" ? "Spiel sichern" : "Spiel laden"}</h2>
      ${mode === "save" ? `<input class="text-input" id="svName" maxlength="80" aria-label="Name des Spielstands">` : ""}
      <div class="slots">${list}</div>
      <div class="actions">
        <button type="button" class="btn danger" data-act="del" ${sel ? "" : "disabled"}>Löschen</button>
        ${mode === "save" ? `<button type="button" class="btn" data-act="export">Als Datei</button>` : `<button type="button" class="btn" data-act="import">Datei öffnen</button>`}
        <span class="grow"></span>
        <button type="button" class="btn" data-act="cancel">Abbrechen</button>
        <button type="button" class="btn primary" data-act="ok" ${mode === "load" && !sel ? "disabled" : ""}>${mode === "save" ? "Sichern" : "Laden"}</button>
      </div>`, onClick);
    if (mode === "save") { const inp = $("svName"); inp.value = name; inp.oninput = e => { name = e.target.value; }; }
  };
  let name = mode === "save" ? game.suggestedSaveName : "";
  const onClick = e => {
    const sl = e.target.closest(".slot");
    if (sl) { sel = sl.dataset.name; if (mode === "save") name = sel; return draw(); }
    const a = e.target.closest("[data-act]"); if (!a) return;
    const act = a.dataset.act;
    if (act === "cancel") return closeModal();
    if (act === "del" && sel) {
      if (!window.confirm(`„${sel}“ wirklich löschen?`)) return;
      SaveStore.remove(sel); slots = SaveStore.list(); sel = null; return draw();
    }
    if (act === "export") return exportGame();
    if (act === "import") return importGame();
    if (act === "ok" && mode === "save") {
      const clean = SaveStore.cleanName(name);
      if (!clean) return;
      if (SaveStore.exists(clean) && clean !== game.currentSaveName && !window.confirm(`„${clean}“ ersetzen?`)) return;
      if (game.saveAs(clean)) closeModal();
    }
    if (act === "ok" && mode === "load" && sel) {
      const slot = slots.find(x => x.name === sel);
      if (slot) leaveGame("Laden", () => { closeModal(); map.resetZoom(); game.loadState(slot.state, slot.name); });
    }
  };
  draw();
}

function exportGame() {
  const blob = new Blob([JSON.stringify(game.state, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `Mosaik-Afrika-Runde-${game.state.round}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function importGame() {
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "application/json,.json";
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    if (f.size > 2_000_000) return game.showToast("Die Datei ist zu groß.");
    f.text().then(t => {
      let raw; try { raw = JSON.parse(t); } catch { return game.showToast("Das ist kein gültiger Spielstand."); }
      leaveGame("Laden", () => { closeModal(); map.resetZoom(); game.loadState(raw); });
    });
  };
  inp.click();
}

// ---------- App-Verhalten ----------
// Beim Verlassen still sichern (Handys beenden Web-Apps im Hintergrund oft ohne Vorwarnung)
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") game.autosave(); });
window.addEventListener("pagehide", () => game.autosave());

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// Nur zum Testen: ?demo startet sofort eine Partie, ?demo&move öffnet das Angriffs-Fenster
(() => {
  const q = new URLSearchParams(location.search);
  if (!q.has("demo")) return render();
  game.soundOn = false;
  game.newGame([0, 1, 2, 3].map(i => ({ name: DEFAULT_NAMES[i], kind: i ? "computer" : "human", difficulty: 1 })),
    { startCountries: 5, randomStart: true, eventsEnabled: true });
  const s = game.state, mine = s.territories.findIndex(t => t.owner === 0);
  game.selected = mine;
  if (q.has("move")) { const t = ADJ[mine].find(j => s.territories[j].owner !== 0); if (t !== undefined) game.requestMove(mine, t); }
  render();
})();
