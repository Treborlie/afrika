// Test: 4 Computer spielen eine Partie durch.  Aufruf: node tools/simulate.js
const fs = require("fs"), vm = require("vm"), path = require("path");
const store = {};
const ctx = { console, setTimeout: (f) => setImmediate(f), clearTimeout: () => {}, Math, JSON, Date, Promise, Map, Set, Object, Array, String, Number,
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } } };
vm.createContext(ctx);
for (const f of ["data.js", "game.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), ctx);
vm.runInContext(`
  var g = new Game(); g.fastAI = true;
  g.newGame([0,1,2,3].map(i => ({ name: DEFAULT_NAMES[i], kind: "computer", difficulty: i % 3 })),
            { startCountries: 3, randomStart: false, eventsEnabled: true });
`, ctx);
const start = Date.now();
(function check() {
  const s = ctx.g.state;
  if (s.phase === "finished" || s.round > 300 || Date.now() - start > 60000) {
    const owners = {}; s.territories.forEach(t => owners[t.owner] = (owners[t.owner] || 0) + 1);
    console.log("Phase:", s.phase, "| Runde:", s.round, "|", s.winnerText, "| Länder je Besitzer:", JSON.stringify(owners));
    // Speichern/Laden prüfen
    const ok = ctx.validateState(JSON.parse(JSON.stringify(s))) !== null && ctx.validateState({ players: "x" }) === null;
    console.log(ok ? "SPEICHERTEST OK" : "SPEICHERTEST FEHLER");
    process.exit(0);
  }
  setImmediate(check);
})();
