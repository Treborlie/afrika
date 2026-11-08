// Karte: Geometrie (aus MapGeometry.swift), Zeichnen und Bedienung (Tippen, Ziehen, Zoomen).
"use strict";

const MAP_W = 1000, MAP_H = 884;

const Geo = (() => {
  const project = (lon, lat) => [(lon + 26) / 86 * MAP_W, (40 - lat) / 76 * MAP_H];
  const area = r => { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; };
  const contains = (poly, x, y) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  };
  const edgeDistance = (x, y, r) => {
    let best = Infinity;
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length], dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / Math.max(1e-9, dx * dx + dy * dy)));
      best = Math.min(best, Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy)));
    }
    return best;
  };
  /** Gut sichtbarer Innenpunkt im größten Ring */
  const labelPoint = rings => {
    if (!rings.length) return null;
    const main = rings.reduce((m, r) => area(r) > area(m) ? r : m);
    if (main.length < 3) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of main) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    let best = null, cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    let sx = (maxX - minX) / 16, sy = (maxY - minY) / 16, rx = (maxX - minX) / 2, ry = (maxY - minY) / 2;
    for (let k = 0; k < 4; k++) {
      for (let y = cy - ry; y <= cy + ry; y += Math.max(sy, 0.05))
        for (let x = cx - rx; x <= cx + rx; x += Math.max(sx, 0.05))
          if (contains(main, x, y)) { const d = edgeDistance(x, y, main); if (!best || d > best[2]) best = [x, y, d]; }
      if (!best) break;
      cx = best[0]; cy = best[1]; rx = sx * 2; ry = sy * 2; sx /= 4; sy /= 4;
    }
    return best ? [best[0], best[1]] : null;
  };

  const shapes = COUNTRIES.map(c => SHAPES[c.code] || []);
  const disputed = SHAPES.SAH || [];
  const sizes = shapes.map(rs => rs.reduce((a, r) => a + area(r), 0));
  const seeds = COUNTRIES.map((c, i) =>
    (c.island && sizes[i] < 40) ? project(c.lon, c.lat) : (labelPoint(shapes[i]) || project(c.lon, c.lat)));
  const radii = COUNTRIES.map(c => 9 + 3.4 * Math.log10(c.area + 1));
  const pos = seeds.map(p => [...p]);
  for (let it = 0; it < 300; it++) {
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const dx = pos[j][0] - pos[i][0], dy = pos[j][1] - pos[i][1];
        const d = Math.max(0.01, Math.hypot(dx, dy)), minD = radii[i] + radii[j] + 5;
        if (d < minD) { const push = (minD - d) / 2 / d; pos[i][0] -= dx * push; pos[i][1] -= dy * push; pos[j][0] += dx * push; pos[j][1] += dy * push; }
      }
      pos[i][0] += (seeds[i][0] - pos[i][0]) * 0.03; pos[i][1] += (seeds[i][1] - pos[i][1]) * 0.03;
      pos[i][0] = Math.min(Math.max(pos[i][0], radii[i] + 4), MAP_W - radii[i] - 4);
      pos[i][1] = Math.min(Math.max(pos[i][1], radii[i] + 4), MAP_H - radii[i] - 4);
    }
  }
  const hitOrder = COUNTRIES.map((_, i) => i).sort((a, b) => sizes[a] - sizes[b]);
  const toPath = rings => { const p = new Path2D(); for (const r of rings) { r.forEach(([x, y], k) => k ? p.lineTo(x, y) : p.moveTo(x, y)); p.closePath(); } return p; };

  return {
    shapes, nodes: pos, radii,
    paths: shapes.map(toPath), disputedPath: toPath(disputed), disputedLabel: labelPoint(disputed),
    hitTest(x, y) {
      let best = null;
      pos.forEach(([nx, ny], i) => { const d = Math.hypot(nx - x, ny - y); if (d <= radii[i] + 3 && (!best || d < best[1])) best = [i, d]; });
      if (best) return best[0];
      for (const i of hitOrder) if (shapes[i].some(r => contains(r, x, y))) return i;
      return null;
    },
  };
})();

class MapView {
  constructor(canvas, game) {
    this.canvas = canvas; this.ctx = canvas.getContext("2d"); this.game = game;
    this.zoom = 1; this.pan = { x: 0, y: 0 }; this.maxZoom = 5;
    this.pointers = new Map(); this.gesture = null;
    this.dragFrom = null; this.dragPoint = null;
    this.size = { w: 1, h: 1 };
    new ResizeObserver(() => this.resize()).observe(canvas);
    this.bindInput();
  }

  // --- Umrechnung ---
  get fit() { return Math.min(this.size.w / MAP_W, this.size.h / MAP_H); }
  get scale() { return this.fit * this.zoom; }
  toScreen(x, y) { const s = this.scale; return [this.size.w / 2 + (x - MAP_W / 2) * s + this.pan.x, this.size.h / 2 + (y - MAP_H / 2) * s + this.pan.y]; }
  toMap(x, y) { const s = this.scale; return [(x - this.size.w / 2 - this.pan.x) / s + MAP_W / 2, (y - this.size.h / 2 - this.pan.y) / s + MAP_H / 2]; }

  /** Land unter dem Finger; mit Finger trifft auch knapp daneben noch das nächste Land. */
  hit(x, y, touch) {
    const [mx, my] = this.toMap(x, y);
    const i = Geo.hitTest(mx, my);
    if (i !== null || !touch) return i;
    const tol = 22 / this.scale; let best = null;
    Geo.nodes.forEach(([nx, ny], k) => { const d = Math.hypot(nx - mx, ny - my); if (d <= tol && (!best || d < best[1])) best = [k, d]; });
    return best ? best[0] : null;
  }

  clampPan() {
    if (this.zoom <= 1.001) { this.pan = { x: 0, y: 0 }; return; }
    const mx = Math.max(0, (MAP_W * this.scale - this.size.w) / 2) + 40, my = Math.max(0, (MAP_H * this.scale - this.size.h) / 2) + 40;
    this.pan.x = Math.min(Math.max(this.pan.x, -mx), mx); this.pan.y = Math.min(Math.max(this.pan.y, -my), my);
  }

  /** Zoomt so, dass der Punkt (ax, ay) an derselben Stelle bleibt. */
  setZoom(z, ax, ay, fromZoom = this.zoom, fromPan = this.pan) {
    z = Math.min(Math.max(z, 1), this.maxZoom);
    const f = z / fromZoom, cx = ax - this.size.w / 2, cy = ay - this.size.h / 2;
    this.zoom = z; this.pan = { x: cx - (cx - fromPan.x) * f, y: cy - (cy - fromPan.y) * f };
    this.clampPan(); this.draw(); this.onZoom && this.onZoom();
  }
  zoomBy(f) { this.setZoom(this.zoom * f, this.size.w / 2, this.size.h / 2); }
  resetZoom() { this.zoom = 1; this.pan = { x: 0, y: 0 }; this.draw(); this.onZoom && this.onZoom(); }

  resize() {
    const r = this.canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    this.size = { w: Math.max(1, r.width), h: Math.max(1, r.height) };
    this.canvas.width = Math.round(this.size.w * dpr); this.canvas.height = Math.round(this.size.h * dpr);
    this.clampPan(); this.draw();
  }

  // --- Bedienung ---
  bindInput() {
    const c = this.canvas;
    const local = e => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener("pointerdown", e => {
      c.setPointerCapture(e.pointerId);
      const [x, y] = local(e);
      this.pointers.set(e.pointerId, { x, y, sx: x, sy: y, touch: e.pointerType !== "mouse" });
      if (this.pointers.size === 2) {
        // zweiter Finger: Zoomen und Verschieben
        const [a, b] = [...this.pointers.values()];
        this.dragFrom = null; this.dragPoint = null;
        this.gesture = { type: "pinch", dist: Math.hypot(a.x - b.x, a.y - b.y), mid: [(a.x + b.x) / 2, (a.y + b.y) / 2], zoom: this.zoom, pan: { ...this.pan } };
      } else if (this.pointers.size === 1) this.gesture = { type: "maybeTap" };
    });
    c.addEventListener("pointermove", e => {
      const [x, y] = local(e);
      const p = this.pointers.get(e.pointerId);
      if (!p) { if (e.pointerType === "mouse") this.setHover(this.hit(x, y, false)); return; }
      p.x = x; p.y = y;
      const g = this.gesture;
      if (!g) return;
      if (g.type === "pinch" && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2], dist = Math.hypot(a.x - b.x, a.y - b.y);
        const z = Math.min(Math.max(g.zoom * dist / Math.max(1, g.dist), 1), this.maxZoom);
        this.setZoom(z, g.mid[0], g.mid[1], g.zoom, g.pan);
        this.pan.x += mid[0] - g.mid[0]; this.pan.y += mid[1] - g.mid[1]; this.clampPan(); this.draw();
        return;
      }
      if (g.type === "maybeTap" && Math.hypot(x - p.sx, y - p.sy) > 8) {
        const s = this.game.state, i = this.hit(p.sx, p.sy, p.touch);
        if (s && s.phase === "playing" && i !== null && s.territories[i].owner === s.current && s.players[s.current].kind === "human") {
          this.gesture = { type: "move" }; this.dragFrom = i; this.game.selected = i; this.game.changed();
        } else this.gesture = { type: "pan", pan: { ...this.pan } };
      }
      if (this.gesture.type === "pan") {
        this.pan = { x: this.gesture.pan.x + x - p.sx, y: this.gesture.pan.y + y - p.sy }; this.clampPan(); this.draw();
      } else if (this.gesture.type === "move") {
        this.dragPoint = [x, y]; this.setHover(this.hit(x, y, p.touch)); this.draw();
      }
    });
    const end = e => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.pointers.delete(e.pointerId);
      const g = this.gesture;
      if (g && g.type === "pinch") { if (this.pointers.size === 0) this.gesture = null; return; }
      this.gesture = null;
      if (e.type === "pointercancel") { this.dragFrom = null; this.dragPoint = null; this.draw(); return; }
      if (g && g.type === "maybeTap") { this.game.tap(this.hit(p.x, p.y, p.touch)); }
      else if (g && g.type === "move") {
        const src = this.dragFrom, dst = this.hit(p.x, p.y, p.touch);
        this.dragFrom = null; this.dragPoint = null;
        if (p.touch) this.game.hovered = null;
        if (dst !== null && dst !== src) { if (this.game.isNeighbor(src, dst)) this.game.requestMove(src, dst); else this.game.tap(dst); }
        this.game.changed();
      }
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("pointerleave", e => { if (e.pointerType === "mouse" && !this.pointers.size) this.setHover(null); });
    c.addEventListener("wheel", e => {
      e.preventDefault();
      const [x, y] = local(e);
      this.setZoom(this.zoom * Math.exp(-e.deltaY * 0.0025), x, y);
    }, { passive: false });
  }

  setHover(i) { if (this.game.hovered !== i) { this.game.hovered = i; this.game.changed(); } }

  isTargetOfSelection(i, s) {
    const sel = this.game.selected;
    return sel !== null && sel !== i && s.phase === "playing" && s.territories[sel].owner === s.current && this.game.isHumanTurn && this.game.isNeighbor(sel, i);
  }

  // --- Zeichnen ---
  draw() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; this.render(); });
  }

  render() {
    const ctx = this.ctx, g = this.game, s = g.state, dpr = window.devicePixelRatio || 1;
    const { w, h } = this.size, sc = this.scale;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const bg = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, Math.max(w, h) * 0.8);
    bg.addColorStop(0, "#9ec7e0"); bg.addColorStop(1, "#73a3cc");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    if (!s) return;
    const sel = g.selected;
    // Kreise und Schrift wachsen beim Zoomen langsamer als die Karte; auf kleinen Bildschirmen etwas größer
    let sym = this.fit * Math.sqrt(this.zoom);
    sym = sym >= 0.75 ? sym : Math.max(sym * 1.3, 0.45);

    const mapTransform = (dx = 0, dy = 0) => {
      const [ox, oy] = this.toScreen(0, 0);
      ctx.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * (ox + dx), dpr * (oy + dy));
    };
    // Schatten
    mapTransform(2.5, 3.5);
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    for (const p of Geo.paths) ctx.fill(p);
    ctx.fill(Geo.disputedPath);
    // Westsahara
    mapTransform();
    ctx.fillStyle = "#c7c7c7"; ctx.fill(Geo.disputedPath);
    ctx.setLineDash([3 / sc, 2 / sc]); ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = 0.8 / sc; ctx.stroke(Geo.disputedPath); ctx.setLineDash([]);
    // Länder
    Geo.paths.forEach((p, i) => {
      const t = s.territories[i];
      ctx.fillStyle = "#e6d6ad"; ctx.fill(p);
      if (t.owner !== null) { ctx.globalAlpha = 0.55; ctx.fillStyle = playerColor(t.owner); ctx.fill(p); ctx.globalAlpha = 1; }
      if (g.hovered === i) { ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fill(p); }
      if (this.isTargetOfSelection(i, s)) { ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fill(p); }
      ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = (sel === i ? 1.6 : 0.7) / sc; ctx.stroke(p);
    });

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (Geo.disputedLabel) {
      const [x, y] = this.toScreen(...Geo.disputedLabel);
      ctx.font = `italic ${Math.max(8, 9 * sym)}px -apple-system, system-ui, sans-serif`;
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("Westsahara", x, y);
    }
    // Verbindungen: Seewege immer, Landwege beim gewählten Land
    for (let i = 0; i < ADJ.length; i++) for (const j of ADJ[i]) {
      if (j <= i) continue;
      const sea = SEA_LINKS.has(i + "-" + j);
      if (!sea && sel !== i && sel !== j) continue;
      const active = sel === i || sel === j;
      const [ax, ay] = this.toScreen(...Geo.nodes[i]), [bx, by] = this.toScreen(...Geo.nodes[j]);
      ctx.strokeStyle = active ? "#fff" : `rgba(0,0,0,${sea ? 0.35 : 0.18})`;
      ctx.lineWidth = active ? 2 : 1; ctx.setLineDash(sea ? [5, 4] : []);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    ctx.setLineDash([]);
    // Knoten
    Geo.nodes.forEach((n, i) => {
      const t = s.territories[i], [cx, cy] = this.toScreen(...n), r = Geo.radii[i] * Math.max(0.75, sym);
      const circle = (rr, ox = 0, oy = 0) => { ctx.beginPath(); ctx.arc(cx + ox, cy + oy, Math.max(0.5, rr), 0, Math.PI * 2); };
      if (g.flash === i) { circle(r + 8); ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.fill(); }
      circle(r); ctx.fillStyle = playerColor(t.owner); ctx.fill();
      circle(r * 0.5, -r * 0.2, -r * 0.25); ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fill();
      if (sel === i) { circle(r + 3); ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke(); }
      else if (this.isTargetOfSelection(i, s)) { circle(r + 2); ctx.setLineDash([3, 2]); ctx.strokeStyle = "rgba(255,255,255,0.9)"; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]); }
      circle(r); ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1; ctx.stroke();
      const fs = Math.max(sym < 0.75 ? 7 : 9, Math.min(15, r * 0.85));
      ctx.font = `bold ${fs}px ui-rounded, -apple-system, system-ui, sans-serif`;
      ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(String(t.units), cx, cy + 0.5);
      const gain = g.gains[i];
      if (gain > 0) {
        const bx = cx + r * 0.9, by = cy - r * 0.9, bw = 10 + 7 * String(gain).length;
        ctx.fillStyle = "#1a9940"; ctx.beginPath(); ctx.roundRect(bx - bw / 2, by - 8, bw, 16, 8); ctx.fill();
        ctx.font = `800 ${Math.max(10, 11 * sym)}px ui-rounded, -apple-system, system-ui, sans-serif`;
        ctx.fillStyle = "#fff"; ctx.fillText("+" + gain, bx, by + 0.5);
      }
      const minArea = sym < 0.6 ? 900 : 250;
      if (COUNTRIES[i].area >= minArea || sel === i || g.hovered === i) {
        ctx.font = `${sel === i ? "bold" : "500"} ${Math.max(sym < 0.75 ? 8 : 9, 10 * sym)}px -apple-system, system-ui, sans-serif`;
        ctx.fillStyle = "rgba(0,0,0,0.8)";
        ctx.fillText(COUNTRIES[i].name, cx, cy + r + 7 * Math.max(1, sym));
      }
    });
    // Ziehen von einem Land
    if (this.dragFrom !== null && this.dragPoint) {
      const [ax, ay] = this.toScreen(...Geo.nodes[this.dragFrom]), [px, py] = this.dragPoint;
      const ok = g.hovered !== null && g.isNeighbor(this.dragFrom, g.hovered);
      ctx.strokeStyle = ok ? "#fff" : "rgba(255,0,0,0.8)"; ctx.lineWidth = 4; ctx.lineCap = "round"; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(px, py); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
    }
  }
}
