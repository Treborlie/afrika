// Spielregeln, Spielablauf und Computergegner – übertragen aus der Swift-Version
// (Model.swift, Game.swift, AI.swift). Keine Oberfläche in dieser Datei.
"use strict";

// ---------- Daten ----------

const ADJ = (() => {
  const index = new Map(COUNTRIES.map((c, i) => [c.code, i]));
  const sets = COUNTRIES.map(() => new Set());
  const link = (a, b) => { const i = index.get(a), j = index.get(b); sets[i].add(j); sets[j].add(i); };
  for (const [a, list] of Object.entries(LAND_BORDERS)) for (const b of list) link(a, b);
  for (const [a, b] of SEA_ROUTES) link(a, b);
  return sets.map(s => [...s].sort((x, y) => x - y));
})();

const SEA_LINKS = (() => {
  const index = new Map(COUNTRIES.map((c, i) => [c.code, i]));
  return new Set(SEA_ROUTES.map(([a, b]) => { const i = index.get(a), j = index.get(b); return Math.min(i, j) + "-" + Math.max(i, j); }));
})();

const PLAYER_COLORS = ["#d63d33", "#2e6bd1", "#299952", "#ed9e1a"];
const NEUTRAL_COLOR = "#8c8578";
const DEFAULT_NAMES = ["Rot", "Blau", "Grün", "Gold"];
const KIND_LABELS = { human: "Mensch", computer: "Computer", none: "nicht dabei" };
const DIFF_LABELS = ["leicht", "normal", "stark"];
const playerColor = i => (i === null || i === undefined) ? NEUTRAL_COLOR : PLAYER_COLORS[i % 4];

// ---------- Regeln ----------

const Rules = {
  startUnits: 40, startLoyalty: 70, conquestLoyalty: 25, neutralLoyalty: 50, loyaltyGrowth: 8, defenseBonus: 1.2,
  neutralGarrison: c => Math.round(4 + Math.sqrt(c.population) * 2.5),
  income(c, loyalty) {
    const base = Math.sqrt(c.population) * 1.2;
    return Math.max(1, Math.round(base * (0.6 + 0.4 * loyalty / 100)));
  },
  moraleFactor: l => 0.7 + 0.6 * l / 100,
  /** Lanchester-artiges Kampfmodell → [Angreifer übrig, Verteidiger übrig] */
  resolveBattle(attackers, attackLoyalty, defenders, defenseLoyalty) {
    if (defenders <= 0) return [attackers, 0];
    const rnd = () => 0.85 + Math.random() * 0.3;
    const sa = attackers * this.moraleFactor(attackLoyalty) * rnd();
    const sd = defenders * this.moraleFactor(defenseLoyalty) * this.defenseBonus * rnd();
    if (sa > sd) { const r = sd / sa; return [Math.max(1, Math.round(attackers * Math.sqrt(1 - r * r))), 0]; }
    const r = sa / sd; return [0, Math.max(1, Math.round(defenders * Math.sqrt(1 - r * r)))];
  },
  attackersNeeded(defenders, attackLoyalty, defenseLoyalty) {
    if (defenders <= 0) return 1;
    return Math.ceil(defenders * this.moraleFactor(defenseLoyalty) * this.defenseBonus / this.moraleFactor(attackLoyalty)) + 1;
  },
  winChance(attackers, attackLoyalty, defenders, defenseLoyalty) {
    if (defenders <= 0) return 1;
    let wins = 0;
    for (let k = 0; k < 400; k++) if (this.resolveBattle(attackers, attackLoyalty, defenders, defenseLoyalty)[0] > 0) wins++;
    return wins / 400;
  },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------- Spielstände (im Browser gespeichert) ----------

const SaveStore = {
  key: "mosaik.saves.v1",
  readAll() {
    try { const o = JSON.parse(localStorage.getItem(this.key) || "{}"); return (o && typeof o === "object") ? o : {}; }
    catch { return {}; }
  },
  writeAll(o) { localStorage.setItem(this.key, JSON.stringify(o)); },
  cleanName: n => String(n || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 80),
  list() {
    return Object.entries(this.readAll())
      .map(([name, v]) => { const s = validateState(v && v.state); return s ? { name, date: v.date || 0, state: s } : null; })
      .filter(Boolean).sort((a, b) => b.date - a.date);
  },
  exists(name) { return Object.prototype.hasOwnProperty.call(this.readAll(), this.cleanName(name)); },
  save(name, state) { const all = this.readAll(); all[this.cleanName(name)] = { date: Date.now(), state }; this.writeAll(all); },
  remove(name) { const all = this.readAll(); delete all[name]; this.writeAll(all); },
  unusedName(name) { let c = this.cleanName(name), n = 2; while (this.exists(c)) c = this.cleanName(name) + " " + n++; return c; },
  suggestedName(state) {
    const d = new Date(), pad = x => String(x).padStart(2, "0");
    const when = `${d.getDate()}.${d.getMonth() + 1}. ${pad(d.getHours())}.${pad(d.getMinutes())}`;
    return (state.phase === "picking" ? "Startphase" : "Runde " + state.round) + " – " + when;
  },
};

/** Prüft einen Spielstand (aus Speicher oder Datei) gründlich, damit fremde Dateien nichts kaputt machen. */
function validateState(s) {
  try {
    if (!s || typeof s !== "object") return null;
    const isInt = (x, lo, hi) => Number.isInteger(x) && x >= lo && x <= hi;
    if (!Array.isArray(s.players) || s.players.length !== 4) return null;
    if (!Array.isArray(s.territories) || s.territories.length !== COUNTRIES.length) return null;
    if (!["picking", "playing", "finished"].includes(s.phase)) return null;
    if (!isInt(s.current, 0, 3) || !isInt(s.round, 1, 100000)) return null;
    const players = s.players.map((p, i) => {
      if (!p || !["human", "computer", "none"].includes(p.kind) || !isInt(p.difficulty, 0, 2)) throw 0;
      return { id: i, name: String(p.name || DEFAULT_NAMES[i]).slice(0, 40), kind: p.kind, difficulty: p.difficulty, alive: !!p.alive };
    });
    const territories = s.territories.map(t => {
      if (!t || !(t.owner === null || isInt(t.owner, 0, 3)) || !isInt(t.units, 0, 1e7) || !isInt(t.loyalty, 0, 100)) throw 0;
      return { owner: t.owner, units: t.units, moved: isInt(t.moved, 0, 1e7) ? t.moved : 0, loyalty: t.loyalty };
    });
    const st = s.settings || {};
    const settings = { startCountries: isInt(st.startCountries, 1, 6) ? st.startCountries : 3, randomStart: !!st.randomStart, eventsEnabled: st.eventsEnabled !== false };
    const picksLeft = Array.isArray(s.picksLeft) && s.picksLeft.length === 4 && s.picksLeft.every(x => isInt(x, 0, 6)) ? s.picksLeft : [0, 0, 0, 0];
    const log = (Array.isArray(s.log) ? s.log : []).slice(-400).map(e => ({
      round: isInt(e && e.round, 0, 100000) ? e.round : 0, text: String(e && e.text || "").slice(0, 300),
      player: e && isInt(e.player, 0, 3) ? e.player : null,
    }));
    return { version: 1, players, territories, settings, round: s.round, current: s.current, phase: s.phase, picksLeft, log,
             winnerText: typeof s.winnerText === "string" ? s.winnerText.slice(0, 300) : null };
  } catch { return null; }
}

// ---------- Spielablauf ----------

class Game {
  constructor() {
    this.state = null;
    this.selected = null;
    this.hovered = null;
    this.pendingMove = null;     // {source, target}
    this.battle = null;          // Kampfbericht
    this.flash = null;
    this.gains = {};
    this.toast = null;
    this.aiRunning = false;
    this.fastAI = false;
    this.soundOn = localStorage.getItem("mosaik.sound") !== "0";
    this.currentSaveName = null;
    this.lastSaved = null;
    this.aiGeneration = 0;
    this.onChange = () => {};
    this.onSound = () => {};
  }

  changed() { this.onChange(); }
  setSound(on) { this.soundOn = on; try { localStorage.setItem("mosaik.sound", on ? "1" : "0"); } catch {} this.changed(); }
  play(name) { if (this.soundOn) this.onSound(name); }

  // --- Start ---

  newGame(players, settings) {
    this.stopAI();
    const s = {
      version: 1,
      players: players.map((p, i) => ({ ...p, id: i, alive: p.kind !== "none" })),
      territories: COUNTRIES.map(c => ({ owner: null, units: Rules.neutralGarrison(c), moved: 0, loyalty: Rules.neutralLoyalty })),
      settings: { ...settings }, round: 1, current: 0, phase: "picking",
      picksLeft: players.map(p => p.kind === "none" ? 0 : settings.startCountries), log: [], winnerText: null,
    };
    s.current = Math.max(0, s.players.findIndex(p => p.alive));
    this.state = s; this.selected = null; this.currentSaveName = null; this.lastSaved = null;
    this.log("Neues Spiel gestartet.");
    if (settings.randomStart) this.randomDistribution();
    else { this.log(`Jeder Spieler wählt ${settings.startCountries} Startländer.`); this.continuePicking(); }
    this.changed();
  }

  closeGame() { this.stopAI(); this.state = null; this.currentSaveName = null; this.selected = null; this.pendingMove = null; this.battle = null; this.changed(); }

  randomDistribution() {
    const s = this.state;
    const free = shuffle(COUNTRIES.map((_, i) => i).filter(i => !COUNTRIES[i].island));
    s.players.forEach((p, pi) => {
      if (!p.alive) return;
      for (let k = 0; k < s.settings.startCountries && free.length; k++) {
        s.territories[free.pop()] = { owner: pi, units: Rules.startUnits, moved: 0, loyalty: Rules.startLoyalty };
      }
      s.picksLeft[pi] = 0;
    });
    this.startPlaying();
  }

  continuePicking() {
    const s = this.state;
    if (!s || s.phase !== "picking") return;
    if (s.picksLeft.every(x => x === 0)) return this.startPlaying();
    if (s.picksLeft[s.current] === 0) return this.advancePicker();
    if (s.players[s.current].kind === "computer") {
      const me = s.current;
      this.startAITask(async gen => {
        await this.wait(350);
        if (!this.alive(gen) || this.state?.phase !== "picking" || this.state.current !== me) return;
        this.aiRunning = false;
        const i = AI.pickStart(me, this);
        if (i !== null) this.pick(i);
      });
    }
  }

  pick(i) {
    const s = this.state;
    if (!s || s.phase !== "picking" || s.territories[i].owner !== null) return;
    s.territories[i] = { owner: s.current, units: Rules.startUnits, moved: 0, loyalty: Rules.startLoyalty };
    s.picksLeft[s.current]--;
    this.log(`${s.players[s.current].name} wählt ${COUNTRIES[i].name}.`, s.current);
    this.play("pop"); this.flashCountry(i);
    this.advancePicker();
    this.changed();
  }

  advancePicker() {
    const s = this.state;
    for (let step = 1; step <= 4; step++) {
      const next = (s.current + step) % 4;
      if (s.picksLeft[next] > 0) { s.current = next; this.continuePicking(); return; }
    }
    this.startPlaying();
  }

  startPlaying() {
    const s = this.state;
    s.phase = "playing"; s.round = 1; s.current = Math.max(0, s.players.findIndex(p => p.alive));
    this.log("Runde 1 beginnt.");
    this.beginTurn();
  }

  // --- Züge ---

  get isHumanTurn() { const s = this.state; return !!s && s.phase !== "finished" && s.players[s.current].kind === "human" && !this.aiRunning; }
  available(i) { const t = this.state?.territories[i]; return t ? Math.max(0, Math.min(t.units - t.moved, t.units - 1)) : 0; }
  income(i) { const t = this.state?.territories[i]; return t ? Rules.income(COUNTRIES[i], t.loyalty) : 0; }
  isNeighbor(a, b) { return ADJ[a].includes(b); }

  tap(i) {
    const s = this.state;
    if (!s) return;
    if (i === null) { this.selected = null; return this.changed(); }
    if (s.phase === "picking") {
      if (s.players[s.current].kind !== "human" || this.aiRunning) return;
      if (s.territories[i].owner !== null) { this.showToast(`${COUNTRIES[i].name} ist bereits vergeben.`); this.play("basso"); }
      else this.pick(i);
      return;
    }
    if (s.phase === "playing") {
      const src = this.selected;
      if (src !== null && src !== i && s.territories[src].owner === s.current && s.players[s.current].kind === "human") {
        if (this.isNeighbor(src, i)) return this.requestMove(src, i);
        if (s.territories[i].owner !== s.current) {
          this.showToast(`${COUNTRIES[i].name} grenzt nicht an ${COUNTRIES[src].name}. Mögliche Ziele sind weiß umrandet.`);
          this.play("basso"); return;
        }
      }
      this.selected = this.selected === i ? null : i;
      if (this.selected !== null) this.play("tink");
      return this.changed();
    }
    this.selected = i; this.changed();
  }

  requestMove(src, dst) {
    const s = this.state;
    if (!s || s.phase !== "playing" || s.territories[src].owner !== s.current || !this.isNeighbor(src, dst)) return;
    if (!this.isHumanTurn) return this.showToast("Bitte warten – der Computer ist noch am Zug.");
    this.selected = src;
    if (this.available(src) > 0) { this.pendingMove = { source: src, target: dst }; }
    else {
      const t = s.territories[src];
      this.showToast(t.units <= 1
        ? `In ${COUNTRIES[src].name} steht nur 1 Einheit – sie muss das Land halten.`
        : `Die ${t.moved} Einheiten in ${COUNTRIES[src].name} wurden in diesem Zug schon bewegt. Ab dem nächsten Zug sind sie wieder frei.`);
      this.play("basso");
    }
    this.changed();
  }

  execute(move, count) {
    this.pendingMove = null;
    const s = this.state;
    if (!s) return this.changed();
    const src = move.source, dst = move.target, me = s.territories[src].owner;
    const n = Math.min(count, this.available(src));
    if (n <= 0 || me === null) return this.changed();
    const target = { ...s.territories[dst] };

    if (target.owner === me) {
      s.territories[src].units -= n; s.territories[dst].units += n; s.territories[dst].moved += n;
      this.log(`${s.players[me].name} verlegt ${n} Einheiten von ${COUNTRIES[src].name} nach ${COUNTRIES[dst].name}.`, me);
      this.play("pop"); this.selected = dst; return this.changed();
    }

    s.territories[src].units -= n;
    s.territories[src].moved = Math.min(s.territories[src].moved, s.territories[src].units);
    const [aLeft, dLeft] = Rules.resolveBattle(n, s.territories[src].loyalty, target.units,
      target.owner === null ? Rules.neutralLoyalty : target.loyalty);
    const report = { attacker: me, defender: target.owner, source: src, target: dst, attackers: n, defenders: target.units, attackersLeft: aLeft, defendersLeft: dLeft };
    const defName = target.owner === null ? "neutrale Truppen" : s.players[target.owner].name;
    if (aLeft > 0) {
      s.territories[dst] = { owner: me, units: aLeft, moved: aLeft, loyalty: Rules.conquestLoyalty };
      this.log(target.units === 0 ? `${s.players[me].name} besetzt ${COUNTRIES[dst].name}.`
        : `${s.players[me].name} erobert ${COUNTRIES[dst].name} von ${defName} (${n} gegen ${target.units}, ${aLeft} übrig).`, me);
    } else {
      s.territories[dst].units = dLeft;
      this.log(`Angriff von ${s.players[me].name} auf ${COUNTRIES[dst].name} scheitert (${n} gegen ${target.units}).`, me);
    }
    this.flashCountry(dst);
    const humanInvolved = s.players[me].kind === "human" || (target.owner !== null && s.players[target.owner].kind === "human");
    if (humanInvolved) { if (s.players[me].kind === "human") this.battle = report; this.play(aLeft > 0 ? "hero" : "basso"); }
    if (aLeft > 0 && s.players[me].kind === "human") this.selected = dst;
    if (target.owner !== null) this.checkElimination(target.owner);
    this.changed();
  }

  checkElimination(p) {
    const s = this.state;
    if (!s || !s.players[p].alive || s.territories.some(t => t.owner === p)) return;
    s.players[p].alive = false;
    this.log(`${s.players[p].name} ist ausgeschieden!`, p);
    this.showToast(`${s.players[p].name} ist ausgeschieden!`);
    this.checkGameOver();
  }

  checkGameOver() {
    const s = this.state;
    const alive = s.players.filter(p => p.alive);
    const humansExisted = s.players.some(p => p.kind === "human"), humansAlive = alive.some(p => p.kind === "human");
    if (alive.length <= 1) {
      s.phase = "finished";
      const w = alive[0];
      s.winnerText = w ? (w.kind === "human" ? `${w.name} hat ganz Afrika vereint – Sieg!` : `${w.name} (Computer) hat gewonnen.`) : "Niemand hat gewonnen.";
    } else if (humansExisted && !humansAlive) {
      s.phase = "finished"; s.winnerText = "Alle menschlichen Spieler sind ausgeschieden. Der Computer hat gewonnen.";
    }
    if (s.phase === "finished") { this.stopAI(); this.log(s.winnerText); this.play("glass"); }
  }

  endTurn() {
    const s = this.state;
    if (!s || s.phase !== "playing") return;
    this.selected = null;
    let next = s.current;
    do { next = (next + 1) % 4; } while (!s.players[next].alive && next !== s.current);
    const wrapped = next <= s.current;
    s.current = next;
    if (wrapped) this.beginRound();
    this.beginTurn();
    this.changed();
  }

  beginRound() {
    const s = this.state;
    s.round++;
    this.log(`Runde ${s.round} beginnt.`);
    if (s.settings.eventsEnabled) this.randomEvent();
  }

  beginTurn() {
    const s = this.state;
    if (!s || s.phase !== "playing") return;
    const p = s.current;
    let gained = 0; const per = {};
    s.territories.forEach((t, i) => {
      if (t.owner !== p) return;
      t.moved = 0;
      if (s.round > 1) {
        let inc = Rules.income(COUNTRIES[i], t.loyalty);
        if (s.players[p].kind === "computer" && s.players[p].difficulty === 2) inc = Math.round(inc * 1.15);
        t.units += inc; gained += inc; per[i] = inc;
        t.loyalty = Math.min(100, t.loyalty + Rules.loyaltyGrowth);
      }
    });
    if (p === s.players.findIndex(x => x.alive)) {
      s.territories.forEach((t, i) => { if (t.owner === null && t.units < Rules.neutralGarrison(COUNTRIES[i])) t.units++; });
    }
    if (gained > 0) this.log(`${s.players[p].name} erhält ${gained} neue Einheiten.`, p);
    this.showGains(per);
    if (s.players[p].kind === "computer") this.runAI();
    else {
      if (gained > 0) this.showToast(`Runde ${s.round}: ${s.players[p].name} erhält ${gained} neue Einheiten (grüne +Zahlen auf der Karte).`);
      else if (s.round === 1) this.showToast(`${s.players[p].name}, du bist am Zug. Neue Einheiten gibt es ab Runde 2.`);
      this.play("ping");
    }
    this.changed();
  }

  randomEvent() {
    const s = this.state;
    if (Math.random() >= 0.6) return;
    const owned = s.territories.map((t, i) => i).filter(i => s.territories[i].owner !== null);
    if (!owned.length) return;
    const i = owned[Math.floor(Math.random() * owned.length)];
    const t = s.territories[i], owner = t.owner, name = COUNTRIES[i].name;
    const lose = (lo, hi) => { const k = Math.max(1, Math.floor(t.units * (lo + Math.random() * (hi - lo)))); t.units = Math.max(1, t.units - k); return k; };
    const roll = Math.floor(Math.random() * 100);
    let text;
    if (roll < 20) text = `Dürre in ${name}: ${lose(0.10, 0.25)} Einheiten verloren.`;
    else if (roll < 35) text = `Eine Seuche breitet sich in ${name} aus: ${lose(0.15, 0.30)} Einheiten verloren.`;
    else if (roll < 50) text = `Überschwemmungen in ${name}: ${lose(0.05, 0.20)} Einheiten verloren.`;
    else if (roll < 65) {
      if (t.loyalty < 45) { t.owner = null; t.units = Math.max(2, Math.floor(t.units / 2)); t.loyalty = Rules.neutralLoyalty; text = `Aufstand in ${name}! Das Land sagt sich los und wird neutral.`; }
      else { t.loyalty = Math.max(0, t.loyalty - 20); text = `Proteste in ${name}: Der Rückhalt sinkt deutlich.`; }
    } else if (roll < 82) { const k = randInt(5, 15); t.units += k; text = `Freiwillige melden sich in ${name}: +${k} Einheiten.`; }
    else { t.loyalty = Math.min(100, t.loyalty + 25); text = `Gute Ernte in ${name}: Der Rückhalt steigt.`; }
    this.log("Ereignis: " + text, owner);
    this.showToast(text); this.flashCountry(i);
    this.checkElimination(owner);
  }

  // --- Computer ---

  alive(gen) { return gen === this.aiGeneration; }
  wait(ms) { return sleep(this.fastAI ? ms * 0.3 : ms); }

  startAITask(body) {
    this.aiGeneration++;
    const gen = this.aiGeneration;
    this.aiRunning = true; this.changed();
    (async () => {
      try { await body(gen); } catch (e) { console.error(e); }
      if (this.aiGeneration === gen) { this.aiRunning = false; this.changed(); }
    })();
  }

  stopAI() { this.aiGeneration++; this.aiRunning = false; }

  runAI() {
    const s = this.state, me = s.current, round = s.round;
    this.startAITask(async gen => {
      await AI.playTurn(this, gen);
      const cur = this.state;
      if (!this.alive(gen) || !cur || cur.phase !== "playing" || cur.current !== me || cur.round !== round) return;
      this.aiRunning = false;
      this.endTurn();
    });
  }

  // --- Hilfen ---

  log(text, player = null) {
    const s = this.state;
    if (!s) return;
    s.log.push({ round: s.round, text, player });
    if (s.log.length > 400) s.log.splice(0, s.log.length - 400);
  }

  showToast(text) {
    this.toast = text; clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { this.toast = null; this.changed(); }, 3500);
    this.changed();
  }
  showGains(g) {
    this.gains = g; clearTimeout(this._gainT);
    if (Object.keys(g).length) this._gainT = setTimeout(() => { this.gains = {}; this.changed(); }, 4000);
  }
  flashCountry(i) {
    this.flash = i;
    setTimeout(() => { if (this.flash === i) { this.flash = null; this.changed(); } }, 700);
  }

  stats(p) {
    let c = 0, u = 0, inc = 0;
    this.state.territories.forEach((t, i) => { if (t.owner === p) { c++; u += t.units; inc += Rules.income(COUNTRIES[i], t.loyalty); } });
    return { countries: c, units: u, income: inc };
  }

  // --- Speichern / Laden ---

  get needsSaving() { const s = this.state; return !!s && s.phase !== "finished" && JSON.stringify(s) !== this.lastSaved; }
  get suggestedSaveName() { return this.currentSaveName || SaveStore.unusedName(SaveStore.suggestedName(this.state)); }

  saveAs(name) {
    const clean = SaveStore.cleanName(name);
    if (!clean) { this.showToast("Bitte einen Namen eingeben."); return false; }
    try { SaveStore.save(clean, this.state); }
    catch { this.showToast("Speichern fehlgeschlagen – ist der Speicher voll?"); return false; }
    this.lastSaved = JSON.stringify(this.state); this.currentSaveName = clean;
    this.showToast(`Gespeichert als „${clean}“.`);
    return true;
  }

  /** Still sichern (beim Verlassen der App). */
  autosave() { if (this.needsSaving) { try { SaveStore.save(this.suggestedSaveName, this.state); this.currentSaveName = this.suggestedSaveName; this.lastSaved = JSON.stringify(this.state); } catch {} } }

  markDiscarded() { this.lastSaved = JSON.stringify(this.state); }

  loadState(raw, name = null) {
    const s = validateState(raw);
    if (!s) { this.showToast("Das ist kein gültiger Spielstand."); return false; }
    this.stopAI();
    this.state = s; this.lastSaved = JSON.stringify(s); this.currentSaveName = name; this.selected = null;
    this.pendingMove = null; this.battle = null;
    this.showToast(`Spielstand geladen – Runde ${s.round}.`);
    if (s.phase === "playing" && s.players[s.current].kind === "computer") this.runAI();
    if (s.phase === "picking") this.continuePicking();
    this.changed();
    return true;
  }
}

// ---------- Computergegner ----------

const AI = {
  pickStart(p, game) {
    const s = game.state; let best = null;
    s.territories.forEach((t, i) => {
      if (t.owner !== null) return;
      const c = COUNTRIES[i];
      const own = ADJ[i].filter(j => s.territories[j].owner === p).length;
      const foreign = ADJ[i].filter(j => s.territories[j].owner !== null && s.territories[j].owner !== p).length;
      let score = Math.sqrt(c.population) + own * 4 - foreign * 2 - Rules.neutralGarrison(c) * 0.05;
      if (c.island) score -= 3;
      score += Math.random() * 2.5;
      if (!best || score > best[1]) best = [i, score];
    });
    return best ? best[0] : null;
  },

  async playTurn(game, gen) {
    const s0 = game.state, me = s0.current, diff = s0.players[me].difficulty;
    const margin = [1.8, 1.35, 1.12][diff], skip = [0.35, 0.1, 0][diff];
    await game.wait(500);
    let actions = 0;
    while (actions < 40 && game.alive(gen)) {
      const s = game.state;
      if (!s || s.phase !== "playing" || s.current !== me) return;
      const a = this.bestAttack(me, margin, game, s);
      if (!a) break;
      if (Math.random() < skip && actions > 0) break;
      game.selected = a[0]; game.changed();
      await game.wait(450);
      if (!game.alive(gen) || game.state?.current !== me) return;
      game.execute({ source: a[0], target: a[1] }, a[2]);
      actions++;
      await game.wait(350);
    }
    const s = game.state;
    if (!s || s.phase !== "playing" || !game.alive(gen)) return;
    const dist = this.frontierDistance(me, s);
    for (let i = 0; i < s.territories.length; i++) {
      if (s.territories[i].owner !== me || dist[i] <= 0) continue;
      if (!game.alive(gen) || game.state?.current !== me) return;
      const n = game.available(i);
      if (n <= 0) continue;
      const cand = ADJ[i].filter(j => s.territories[j].owner === me).sort((a, b) => dist[a] - dist[b]);
      if (cand.length && dist[cand[0]] < dist[i]) {
        game.selected = i; game.changed();
        await game.wait(200);
        if (!game.alive(gen)) return;
        game.execute({ source: i, target: cand[0] }, n);
      }
    }
    game.selected = null; game.changed();
    await game.wait(300);
  },

  bestAttack(me, margin, game, s) {
    let best = null;
    s.territories.forEach((st, src) => {
      if (st.owner !== me) return;
      const avail = game.available(src);
      if (avail <= 0) return;
      const threatened = ADJ[src].some(j => s.territories[j].owner !== null && s.territories[j].owner !== me);
      for (const dst of ADJ[src]) {
        const t = s.territories[dst];
        if (t.owner === me) continue;
        const need = Rules.attackersNeeded(t.units, st.loyalty, t.owner === null ? Rules.neutralLoyalty : t.loyalty);
        const required = Math.ceil(need * margin);
        if (avail < required) continue;
        let send = Math.min(avail, Math.ceil(required * 1.25));
        if (threatened) send = Math.min(send, Math.max(required, Math.floor(avail * 2 / 3)));
        let value = Rules.income(COUNTRIES[dst], Rules.conquestLoyalty) + 2;
        if (t.owner !== null) { value += 3; if (s.territories.filter(x => x.owner === t.owner).length <= 2) value += 8; }
        value += ADJ[dst].filter(j => s.territories[j].owner === me).length * 1.5;
        const score = value * 10 / (send + t.units) + Math.random() * 0.3;
        if (!best || score > best[3]) best = [src, dst, send, score];
      }
    });
    return best;
  },

  frontierDistance(me, s) {
    const dist = s.territories.map(() => Infinity), queue = [];
    s.territories.forEach((t, i) => {
      if (t.owner === me && ADJ[i].some(j => s.territories[j].owner !== me)) { dist[i] = 0; queue.push(i); }
    });
    for (let h = 0; h < queue.length; h++) {
      const i = queue[h];
      for (const j of ADJ[i]) if (s.territories[j].owner === me && dist[j] === Infinity) { dist[j] = dist[i] + 1; queue.push(j); }
    }
    return dist;
  },
};
