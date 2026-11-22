"use strict";
const installer = (() => {
  const W = 426, H = 200, PANE = 221;
  const VIEW = { x: 6, y: 16, w: 212, h: 134 };
  const LIST = { x: 224, y: 4, w: 196, h: 192 };
  const CUES = { boot: 0, link: 1.2, transfer: 3.2, overload: 6.3, collapse: 7.7, done: 8.2 };
  const PHASES = Object.keys(CUES);
  const SPAN = CUES.done - CUES.link;
  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const TAU = Math.PI * 2;
  const oval = (x, y, rx, ry, n = 32, from = 0, to = TAU) => Array.from({ length: to - from < TAU ? n + 1 : n }, (_, i) => {
    const a = from + (to - from) * i / n;
    return [x + Math.cos(a) * rx, y + Math.sin(a) * ry];
  });

  function rng(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Seven rows per glyph, one base-32 digit per row of five pixels.
  const FONT = Object.fromEntries(`Aehhvhhh Buhhuhhu Cfgggggf Duhhhhhu Evgguggv Fvgguggg Gfggjhhf Hhhhvhhh Ie44444e J11111he Khikokih Lggggggv
    Mhrllhhh Nhppljjh Oehhhhhe Puhhuggg Qehhhlid Ruhhukih Sfgge11u Tv444444 Uhhhhhhe Vhhhhha4 Whhhllla Xhha4ahh Yhha4444 Zv1248gv
    0ehjlphe 14c4444e 2eh168gv 3v2421he 426aiv22 5vgu11he 668guhhe 7v124888 8ehhehhe 9ehhf12c
    .00000cc ,0000448 -000e000 :0cc0cc0 !4444404 ²ci48u00 c00eggge kggikoki m00qllll hggmphhh
    a00e1fhf d11djhjd e00ehvge g0fhhf1e i40c444e n00uhhhh r00mpggg s00fge1u t88s8896 y0hhhf1e ³s2c2s00`
    .split(/\s+/).map(g => [g[0], [...g.slice(1)].map(c => parseInt(c, 32))]));

  // Palette: 0 black, 1-7 phosphor ramp, 8-11 accent ramp, 12 red, 13 white, 14 frame.
  const RED = 12, WHITE = 13, FRAME = 14;
  function palette([main, accent]) {
    const shade = (rgb, k) => rgb.map(c => c * k);
    const colors = [[0, 0, 0], ...[0.14, 0.24, 0.36, 0.5, 0.66, 0.83, 1].map(k => shade(main, k)),
      ...[0.3, 0.52, 0.76, 1].map(k => shade(accent, k)), [255, 64, 40], [240, 244, 232], shade(main, 0.42)];
    return Uint32Array.from(colors, ([r, g, b]) => (255 << 24 | b << 16 | g << 8 | r) >>> 0);
  }

  function screen() {
    const px = new Uint8Array(W * H), copy = new Uint8Array(W * H);
    let x0 = 0, y0 = 0, x1 = W, y1 = H, drawn = 0, total = 0, share = 1;
    const g = {
      clip(x, y, w, h) { x0 = x; y0 = y; x1 = x + w; y1 = y + h; },
      unclip() { g.clip(0, 0, W, H); },
      clear() { px.fill(0); },
      dot(x, y, c) { x |= 0; y |= 0; if (x >= x0 && x < x1 && y >= y0 && y < y1) px[y * W + x] = c; },
      rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.dot(x + i, y + j, c); },
      box(x, y, w, h, c) { g.rect(x, y, w, 1, c); g.rect(x, y + h - 1, w, 1, c); g.rect(x, y, 1, h, c); g.rect(x + w - 1, y, 1, h, c); },
      // Draws only the first `part` of the lines, counted from the previous frame.
      reveal(part) { share = part; drawn = 0; },
      revealed() { total = drawn; share = 1; },
      line(ax, ay, bx, by, c) {
        if (share < 1 && drawn++ >= total * share) return;
        if (share >= 1) drawn++;
        ax = Math.round(ax); ay = Math.round(ay); bx = Math.round(bx); by = Math.round(by);
        const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay), sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
        for (let e = dx + dy; ;) {
          g.dot(ax, ay, c);
          if (ax === bx && ay === by) return;
          const e2 = 2 * e;
          if (e2 >= dy) { e += dy; ax += sx; }
          if (e2 <= dx) { e += dx; ay += sy; }
        }
      },
      poly(points, c) { points.forEach(([x, y], i) => { const [u, v] = points[(i + 1) % points.length]; g.line(x, y, u, v, c); }); },
      path(points, c) { for (let i = 0; i + 1 < points.length; i++) g.line(...points[i], ...points[i + 1], c); },
      fill(points, c) {
        const ys = points.map(p => p[1]);
        for (let y = Math.ceil(Math.min(...ys)); y <= Math.max(...ys); y++) {
          const xs = [];
          points.forEach(([ax, ay], i) => {
            const [bx, by] = points[(i + 1) % points.length];
            if (ay <= y !== by <= y) xs.push(ax + (y - ay) / (by - ay) * (bx - ax));
          });
          xs.sort((a, b) => a - b);
          for (let i = 0; i + 1 < xs.length; i += 2) for (let x = Math.ceil(xs[i]); x <= xs[i + 1]; x++) g.dot(x, y, c);
        }
      },
      text(x, y, str, c, size = 1) {
        for (const ch of str) {
          const rows = FONT[ch];
          if (rows) rows.forEach((bits, j) => { for (let i = 0; i < 5; i++) if (bits >> (4 - i) & 1) g.rect(x + i * size, y + j * size, size, size, c); });
          x += 6 * size;
        }
      },
      center(x, y, str, c, size = 1) { g.text(Math.round(x - (str.length * 6 - 1) * size / 2), y, str, c, size); },
      collapse(part) {
        const half = Math.max(0.5, (1 - part) * H / 2);
        copy.set(px);
        g.rect(0, 0, PANE, H, 0);
        for (let y = Math.ceil(H / 2 - half); y < H / 2 + half; y++) {
          const from = clamp(Math.round(H / 2 + (y - H / 2) * H / 2 / half), 0, H - 1);
          for (let x = 0; x < PANE; x++) px[y * W + x] = copy[from * W + x];
        }
        if (part > 0.6) { const wide = Math.round((1 - part) * PANE); g.rect((PANE >> 1) - wide, H / 2, wide * 2, 1, WHITE); }
      },
      paint(out, colors) { for (let i = 0; i < px.length; i++) out[i] = colors[px[i]]; },
    };
    return g;
  }

  function energyScene() {
    const rand = rng(11), cx = 68, cy = 83, outlet = [124, 83];
    const nodes = [];
    while (nodes.length < 18) {
      const p = [134 + rand() * 76, 26 + rand() * 114];
      if (nodes.every(q => Math.hypot(p[0] - q[0], p[1] - q[1]) > 17)) nodes.push(p);
    }
    nodes.sort((a, b) => a[0] - b[0]);
    const edges = nodes.flatMap((p, i) => {
      const before = nodes.slice(0, i).sort((a, b) => Math.hypot(a[0] - p[0], a[1] - p[1]) - Math.hypot(b[0] - p[0], b[1] - p[1])).slice(0, 2);
      return (i < 3 ? [outlet] : before).map(from => [from, p, i]);
    });
    const project = (x, y, z) => {
      const depth = z * 0.82 - x * 0.57, k = 170 / (170 + depth);
      return [cx + (x * 0.82 + z * 0.57) * k, cy + y * k];
    };
    const ring = (g, r, z, c, n = 28) => g.poly(Array.from({ length: n }, (_, i) => project(Math.cos(i / n * TAU) * r, Math.sin(i / n * TAU) * r, z)), c);
    return {
      colors: [[96, 255, 120], [255, 176, 48]],
      status: { link: "LINKING POWER GRID", transfer: "RECEIVING ENERGY DATA", overload: "OVERLOAD" },
      voice: { link: "Linking to the power grid.", transfer: "Receiving energy data.", overload: "Overload." },
      draw(g, s) {
        const u = Math.max(0, s.t - CUES.link), angle = 1.1 * u * u, shake = s.overload * Math.sin(s.t * 47) * 1.5;
        g.reveal(s.link);
        for (const z of [-36, 0, 36]) ring(g, 50 + shake, z, z < 0 ? 4 : 2);
        for (let i = 0; i < 10; i++) {
          const x = Math.cos(i / 10 * TAU) * 50, y = Math.sin(i / 10 * TAU) * 50;
          g.line(...project(x, y, -36), ...project(x, y, 36), 2);
        }
        [[36, 32, -1], [0, 39, 1], [-36, 46, 1]].forEach(([z, r, way], stage) => {
          const glow = 3 + stage + (s.transfer > 0.5 ? 1 : 0);
          for (let i = 0; i < 14; i++) {
            const a = i / 14 * TAU + angle * way, at = (rad, turn, dz) => project(Math.cos(a + turn) * rad, Math.sin(a + turn) * rad, z + dz);
            g.line(...at(11, 0, -4), ...at(r + shake, 0.2, -4), glow);
            g.line(...at(11, 0.14, 4), ...at(r + shake, 0.36, 4), glow - 1);
            g.line(...at(r + shake, 0.2, -4), ...at(r + shake, 0.36, 4), glow);
          }
          ring(g, 11, z, 5, 12);
        });
        ring(g, 5, -46, 7, 8);
        edges.forEach(([from, to, i]) => {
          const lit = s.transfer * 1.05 > (i + 1) / nodes.length;
          g.line(...from, ...to, lit ? 9 : 1);
          if (lit) {
            const p = (s.t * 1.6 + i * 0.37) % 1;
            g.rect(from[0] + (to[0] - from[0]) * p, from[1] + (to[1] - from[1]) * p, 2, 2, 11);
          }
        });
        g.revealed();
        nodes.forEach(([x, y], i) => {
          if (s.link * nodes.length < i) return;
          const lit = s.transfer * 1.05 > (i + 1) / nodes.length;
          g.box(x - 3, y - 3, 7, 7, lit ? 11 : 2);
          if (lit) g.rect(x - 1, y - 1, 3, 3, 10);
        });
        if (s.overload && !s.collapse) {
          const jag = rng(Math.floor(s.t * 11));
          for (let k = 0; k < 2 + s.overload * 3; k++) {
            const a = nodes[Math.floor(jag() * nodes.length)], b = jag() < 0.4 ? outlet : nodes[Math.floor(jag() * nodes.length)];
            let [x, y] = a;
            for (let n = 1; n <= 7; n++) {
              const nx = a[0] + (b[0] - a[0]) * n / 7 + (n < 7 ? (jag() - 0.5) * 14 : 0), ny = a[1] + (b[1] - a[1]) * n / 7 + (n < 7 ? (jag() - 0.5) * 14 : 0);
              g.line(x, y, nx, ny, WHITE);
              [x, y] = [nx, ny];
            }
          }
        }
      },
      score(a, T) {
        a.osc("sine", [[T.boot, 50], [T.collapse, 62]], [[T.boot, 0], [T.boot + 0.5, 0.16], [T.collapse, 0.2]]);
        a.osc("sawtooth", [[T.link, 28], [T.transfer, 62], [T.overload, 128], [T.collapse, 230]], [[T.link, 0], [T.transfer, 0.08], [T.overload, 0.13], [T.collapse, 0.17]], ["lowpass", [[T.link, 200], [T.overload, 1100], [T.collapse, 2400]], 3]);
        a.osc("sawtooth", [[T.link, 28.4], [T.transfer, 62.7], [T.overload, 129.4], [T.collapse, 233]], [[T.link, 0], [T.transfer, 0.06], [T.collapse, 0.12]], ["lowpass", [[T.link, 180], [T.collapse, 1700]], 2]);
        a.noise([[T.link, 0], [T.transfer, 0.06], [T.overload, 0.12], [T.collapse, 0.2]], ["bandpass", [[T.link, 180], [T.overload, 1300], [T.collapse, 2600]], 1.6]);
        const rand = rng(5);
        for (let t = T.transfer; t < T.collapse;) {
          const wild = t > T.overload;
          for (let n = 0; n < 4; n++) a.hit(t + n * 0.013 * (1 + rand()), 2500 + rand() * 4500, 0.02, wild ? 0.3 : 0.15, "bandpass");
          t += (wild ? 0.07 : 0.3) * (0.4 + rand() * 1.2);
        }
      },
    };
  }

  function seaIceScene() {
    const rand = rng(29), cx = VIEW.x + VIEW.w / 2, cy = VIEW.y + VIEW.h / 2 + 1, step = 11, R = 68;
    const corners = new Map();
    const corner = (x, y) => {
      const key = `${Math.round(x * 2)},${Math.round(y * 2)}`;
      if (!corners.has(key)) corners.set(key, [x + (rand() - 0.5) * 5, y + (rand() - 0.5) * 5]);
      return corners.get(key);
    };
    const floes = [];
    for (let row = -8; row <= 8; row++) for (let col = -8; col <= 8; col++) {
      const x = (col + (row & 1) / 2) * step, y = row * step * 0.866, far = Math.hypot(x, y) / R;
      if (far > 0.78 + rand() * 0.18) continue;
      const points = Array.from({ length: 6 }, (_, i) => corner(x + Math.sin(i / 6 * TAU) * step / 1.732, y + Math.cos(i / 6 * TAU) * step / 1.732));
      floes.push({ x, y, points, angle: (Math.atan2(y, x) + TAU) % TAU, shade: 5 + Math.floor(rand() * 3), rank: 1.2 - far + rand() * 0.45 });
    }
    floes.sort((a, b) => a.rank - b.rank).forEach((f, i) => { f.order = i / (floes.length - 1); });
    return {
      colors: [[112, 226, 255], [96, 255, 170]],
      status: { link: "LINKING SATELLITE", transfer: "RECEIVING SEA ICE DATA", overload: "SIGNAL BREAKING UP" },
      voice: { link: "Satellite link established.", transfer: "Receiving sea ice data.", overload: "Signal lost." },
      draw(g, s) {
        const turn = s.t * 0.05, cos = Math.cos(turn), sin = Math.sin(turn);
        const spot = (x, y) => [cx + (x * cos - y * sin) * 1.18, cy + (x * sin + y * cos) * 0.9];
        g.reveal(s.link);
        for (const r of [22, 45, R]) g.poly(Array.from({ length: 48 }, (_, i) => spot(Math.cos(i / 48 * TAU) * r, Math.sin(i / 48 * TAU) * r)), 2);
        for (let i = 0; i < 12; i++) g.line(...spot(Math.cos(i / 12 * TAU) * 8, Math.sin(i / 12 * TAU) * 8), ...spot(Math.cos(i / 12 * TAU) * R, Math.sin(i / 12 * TAU) * R), 1);
        g.revealed();
        const loss = s.transfer * 0.8 + s.overload * 0.2;
        for (const f of floes) {
          if (s.link < 1 && f.angle > s.link * TAU) continue;
          const gone = f.order === 1 ? 0 : clamp((loss * 1.1 - f.order) / 0.1);
          if (gone === 1) continue;
          const size = 0.86 * (1 - gone * gone), drift = gone * 9 / (Math.hypot(f.x, f.y) + 1);
          const shape = f.points.map(([x, y]) => spot(f.x + (x - f.x) * size + f.x * drift, f.y + (y - f.y) * size + f.y * drift));
          g.fill(shape, gone ? 3 : f.shade - 1);
          g.poly(shape, gone ? 11 : f.shade);
        }
        if (s.link) {
          const sweep = s.link < 1 ? s.link * TAU : (s.t - CUES.transfer) * 2.2;
          for (let k = 14; k >= 0; k--) {
            const a = sweep - k * 0.02;
            g.line(...spot(0, 0), ...spot(Math.cos(a) * R, Math.sin(a) * R), k ? (k < 7 ? 9 : 8) : 11);
          }
        }
        if (s.overload && !s.collapse) {
          const jag = rng(Math.floor(s.t * 7));
          for (let k = 0; k < 2 + s.overload * 4; k++) {
            let x = (jag() - 0.5) * R, y = (jag() - 0.5) * R, a = jag() * TAU;
            for (let n = 0; n < 9; n++) {
              const nx = x + Math.cos(a) * 8, ny = y + Math.sin(a) * 8;
              g.line(...spot(x, y), ...spot(nx, ny), WHITE);
              x = nx; y = ny; a += (jag() - 0.5) * 1.6;
            }
          }
        }
      },
      score(a, T) {
        a.noise([[T.boot, 0], [T.link, 0.1], [T.transfer, 0.16], [T.transfer + 1.5, 0.1], [T.overload, 0.18], [T.collapse, 0.3]],
          ["bandpass", [[T.boot, 260], [T.link + 1, 520], [T.transfer + 1, 330], [T.overload, 640], [T.collapse, 1100]], 3]);
        a.noise([[T.boot, 0], [T.transfer, 0.1], [T.collapse, 0.16]], ["lowpass", [[T.boot, 120], [T.collapse, 220]], 1]);
        for (let t = T.link + 0.1; t < T.transfer; t += 0.62) a.blip(t, 1480, 0.5, 0.09, "sine");
        const rand = rng(8);
        const crack = (t, level) => {
          a.osc("sine", [[t, 110 + rand() * 40], [t + 0.5, 30]], [[t, 0], [t + 0.012, level], [t + 0.6, 0]]);
          for (let n = 0; n < 5; n++) a.hit(t + rand() * 0.09, 500 + rand() * 1400, 0.08, level * 0.8, "lowpass");
        };
        for (const at of [0.35, 1.15, 1.75, 2.35, 2.8]) crack(T.transfer + at, 0.4);
        for (let t = T.overload; t < T.collapse - 0.1; t += 0.14 + rand() * 0.16) crack(t, 0.5);
      },
    };
  }

  function co2Scene() {
    const rand = rng(17), cx = 112, r = 56;
    const half = y => y > 72 ? r : r * Math.sqrt(Math.max(0, 1 - ((72 - y) / 44) ** 2));
    const motes = Array.from({ length: 240 }, () => ({ x: (rand() * 2 - 1) * 0.86, y: 34 + rand() * 94, a: rand() * TAU, b: rand() * TAU, u: 0.6 + rand() * 1.6 }));
    const cracks = Array.from({ length: 9 }, () => {
      let x = cx + (rand() - 0.5) * 80, y = 45 + rand() * 70, a = rand() * TAU;
      return Array.from({ length: 8 }, () => { const from = [x, y]; x += Math.cos(a) * 6; y += Math.sin(a) * 6; a += (rand() - 0.5) * 1.8; return [...from, x, y]; });
    });
    return {
      colors: [[214, 222, 150], [255, 120, 70]],
      status: { link: "SEALING JAR", transfer: "RECEIVING CO2 DATA", overload: "CONTAINMENT BREACH" },
      voice: { link: "Sealing the jar.", transfer: "Receiving carbon dioxide data.", overload: "Breach." },
      draw(g, s) {
        g.reveal(s.link);
        g.path(oval(cx, 72, r, 44, 24, Math.PI, TAU), 5);
        g.line(cx - r, 72, cx - r, 134, 5);
        g.line(cx + r, 72, cx + r, 134, 5);
        for (const y of [72, 103]) g.poly(oval(cx, y, r, 8), 2);
        g.poly(oval(cx, 134, r, 8), 5);
        g.poly(oval(cx, 137, r + 8, 10), 3);
        g.line(6, 138, cx - r - 6, 138, 4);
        g.line(6, 144, cx - r + 2, 144, 4);
        g.revealed();
        if (s.transfer && s.transfer < 1) for (let i = 0; i < 5; i++) g.rect(6 + ((s.t * 0.9 + i / 5) % 1) * 44, 140, 3, 3, 10);
        const push = s.overload ** 2 * 46, speed = 1 + s.transfer * 2;
        motes.slice(0, Math.ceil(s.transfer * motes.length)).forEach(m => {
          let y = clamp(m.y + Math.sin(s.t * speed * m.u + m.b) * 6, 33, 130);
          const room = Math.max(0, half(y) - 4);
          let x = cx + clamp(m.x * half(y) + Math.sin(s.t * speed * m.u * 0.8 + m.a) * 6, -room, room);
          x += (x - cx) / r * push;
          y += (y - 83) / 60 * push;
          g.rect(x, y, 2, 2, 7);
          g.dot(x - 2, y + 1, 10);
          g.dot(x + 3, y, 10);
        });
        cracks.forEach((crack, i) => crack.slice(0, Math.floor(clamp(s.overload * 14 - i) * 8)).forEach(c => g.line(...c, WHITE)));
      },
      score(a, T) {
        a.noise([[T.link, 0], [T.transfer, 0.03], [T.overload, 0.1], [T.collapse, 0.22]], ["highpass", [[T.link, 2200], [T.overload, 3400], [T.collapse, 1500]], 1]);
        a.osc("sine", [[T.boot, 46], [T.collapse, 58]], [[T.boot, 0], [T.link, 0.14], [T.collapse, 0.2]]);
        const rand = rng(6);
        for (let t = T.link + 0.2; t < T.overload; t += t < T.transfer ? 0.5 : 0.34) a.hit(t, 140, 0.16, 0.6);
        for (let t = T.transfer; t < T.collapse;) {
          const p = (t - T.transfer) / (T.collapse - T.transfer);
          a.hit(t, 3800, 0.007, 0.5, "bandpass");
          t += (0.22 - p * 0.2) * (0.2 + rand() * 1.6);
        }
        for (let t = T.overload; t < T.collapse - 0.1; t += 0.06 + rand() * 0.16) {
          a.blip(t, 2200 + rand() * 2400, 0.09, 0.07, "sine");
          a.hit(t, 5200, 0.05, 0.35, "highpass");
        }
      },
    };
  }

  function waterScene() {
    const rand = rng(41), left = 44, right = 156, top = 40, floor = 140;
    const bubbles = Array.from({ length: 26 }, () => ({ x: left + 6 + rand() * (right - left - 12), v: 0.3 + rand() * 0.5, p: rand() }));
    return {
      colors: [[90, 190, 255], [120, 255, 226]],
      status: { link: "OPENING VALVE", transfer: "RECEIVING WATER DATA", overload: "OVERFLOW" },
      voice: { link: "Opening the valve.", transfer: "Receiving water data.", overload: "Overflow." },
      draw(g, s) {
        const level = floor - (floor - top) * s.transfer, wave = (x, size) => Math.sin(x * 0.13 + s.t * 5) * size + Math.sin(x * 0.31 - s.t * 3.4) * size * 0.5;
        if (s.transfer) for (let x = left + 1; x < right; x++) {
          const surface = Math.max(top, level + wave(x, 1.4));
          for (let y = Math.round(surface); y < floor; y++) g.dot(x, y, y - surface < 1 ? 7 : y - surface < 3 ? 5 : x + y & 1 ? 2 : 3);
        }
        if (s.transfer && s.transfer < 1) {
          for (let x = 66; x < 72; x++) for (let y = 33; y < level; y++) if ((x * 7 + y - Math.floor(s.t * 130)) % 5) g.dot(x, y, 5);
        }
        g.reveal(s.link);
        g.poly([[left, top], [right, top], [right, floor], [left, floor]], 5);
        g.poly([[left, top], [left + 16, top - 10], [right + 16, top - 10], [right, top]], 3);
        g.path([[right, floor], [right + 16, floor - 10], [right + 16, top - 10]], 3);
        g.path([[6, 25], [72, 25], [72, 32]], 4);
        g.path([[6, 32], [66, 32]], 4);
        for (let i = 0; i <= 10; i++) g.line(right + 22, floor - i * 10, right + (i % 5 ? 26 : 31), floor - i * 10, i % 5 ? 3 : 5);
        g.poly(oval(28, 29, 10, 10, 16), 6);
        for (let i = 0; i < 4; i++) {
          const a = s.link * 5 + i * TAU / 4;
          g.line(28, 29, 28 + Math.cos(a) * 10, 29 + Math.sin(a) * 10, 6);
        }
        g.revealed();
        if (s.transfer) for (const b of bubbles) {
          const y = floor - 4 - ((s.t * b.v + b.p) % 1) * (floor - 4 - level);
          if (y > level + 4) g.box(b.x, y, 3, 3, 6);
        }
        const mark = level - s.overload * 24;
        if (s.link === 1) g.fill([[right + 34, mark], [right + 41, mark - 4], [right + 41, mark + 4]], 11);
        if (s.overload) {
          const flood = 152 - 138 * s.overload ** 1.4;
          for (let x = VIEW.x; x < VIEW.x + VIEW.w; x++) {
            const surface = Math.round(flood + wave(x, 2.4));
            g.rect(x, surface, 1, 2, 11);
            for (let y = surface + 2; y < 150; y++) if (x + y & 1) g.dot(x, y, 4);
          }
        }
      },
      score(a, T) {
        for (const t of [T.link + 0.25, T.link + 0.85, T.link + 1.4]) {
          a.hit(t, 1200, 0.06, 0.6, "bandpass");
          a.blip(t, 311, 0.3, 0.1, "triangle");
          a.blip(t, 474, 0.2, 0.06, "triangle");
        }
        a.noise([[T.link + 1.2, 0], [T.transfer, 0.3], [T.overload, 0.45], [T.collapse, 0.8]], ["bandpass", [[T.link, 700], [T.overload, 480], [T.collapse, 900]], 0.9]);
        a.noise([[T.transfer, 0], [T.overload, 0.4], [T.collapse, 0.8]], ["lowpass", [[T.transfer, 160], [T.collapse, 420]], 1]);
        const rand = rng(12);
        for (let t = T.transfer; t < T.collapse - 0.1; t += 0.04 + rand() * 0.13) {
          const f = 260 + rand() * 520;
          a.osc("sine", [[t, f], [t + 0.07, f * 1.9]], [[t, 0], [t + 0.01, 0.2], [t + 0.08, 0]]);
        }
      },
    };
  }

  function treesScene() {
    const rand = rng(53), ground = 140, DEPTH = 7, RINGS = 12, hub = [178, 88];
    const twist = Array.from({ length: 2 ** (DEPTH + 1) }, () => [rand() - 0.5, rand(), rand()]);
    const wobble = Array.from({ length: 28 }, () => rand() * 0.16);
    return {
      colors: [[130, 255, 96], [255, 190, 110]],
      status: { link: "LOCATING TREE", transfer: "RECEIVING TREE DATA", overload: "TIMBER" },
      voice: { link: "Locating tree.", transfer: "Receiving tree data.", overload: "Timber." },
      draw(g, s) {
        g.reveal(s.link);
        for (let i = 0; i < 5; i++) g.line(6, ground + i * i * 0.7, 218, ground + i * i * 0.7, 3 - Math.min(2, i));
        for (let i = -6; i <= 6; i++) g.line(112 + i * 18, ground, 112 + i * 34, 150, 1);
        g.poly(oval(...hub, 34, 34), 3);
        g.line(hub[0] - 37, hub[1], hub[0] + 37, hub[1], 1);
        g.line(hub[0], hub[1] - 37, hub[0], hub[1] + 37, 1);
        g.revealed();
        const grown = s.transfer * (DEPTH + 1.4), fall = s.overload ** 2;
        const branch = (x, y, angle, length, depth, id) => {
          const part = clamp(grown - depth);
          if (!part || depth > DEPTH) return;
          const [bend, p, q] = twist[id];
          const a = angle + Math.sin(s.t * 1.6 + id) * 0.02 * (1 + s.overload * 9);
          const nx = x + Math.cos(a) * length * part, ny = y + Math.sin(a) * length * part;
          for (let w = 0; w < Math.max(1, 4 - depth); w++) g.line(x + w, y, nx + w, ny, depth < 3 ? 9 : depth < 5 ? 5 : 4);
          if (depth >= DEPTH - 1) {
            const drop = fall * (0.4 + p) * 110, lx = nx + Math.sin(s.t * 3 + id) * fall * 10 + fall * (q - 0.5) * 60;
            g.rect(lx, Math.min(ground - 1, ny + drop), 2, 2, s.overload ? 10 : 6 + (id & 1));
          }
          for (const side of [-1, 1]) branch(nx, ny, a + side * (0.34 + p * 0.22) + bend * 0.2, length * (0.72 + q * 0.12), depth + 1, id * 2 + (side > 0 ? 1 : 0));
        };
        branch(66, ground, -Math.PI / 2 + fall * 0.5, 27, 0, 1);
        const count = Math.ceil(s.transfer * RINGS);
        for (let i = 1; i <= count; i++) g.poly(wobble.map((w, k) => {
          const a = k / wobble.length * TAU, size = i * 2.6 * (0.92 + w);
          return [hub[0] + Math.cos(a) * size, hub[1] + Math.sin(a) * size];
        }), i === count ? 11 : 8 + i % 2);
        g.rect(hub[0], hub[1], 1, 1, 11);
      },
      score(a, T) {
        a.noise([[T.boot, 0], [T.link, 0.16], [T.overload, 0.24], [T.collapse, 0.7]], ["bandpass", [[T.boot, 380], [T.transfer, 560], [T.overload, 420], [T.collapse, 1200]], 1.8]);
        const creak = (t, level) => a.osc("sawtooth", [[t, 58], [t + 0.15, 92], [t + 0.28, 71], [t + 0.42, 104]],
          [[t, 0], [t + 0.05, level], [t + 0.16, level * 0.3], [t + 0.26, level], [t + 0.42, 0]], ["bandpass", [[t, 420], [t + 0.42, 760]], 7]);
        for (const at of [0.2, 1.1]) creak(T.link + at, 1.1);
        for (const at of [0.4, 1.3, 2.3]) creak(T.transfer + at, 1.1);
        const scale = [392, 440, 523.25, 587.33, 659.25];
        for (let i = 0; i < RINGS; i++) a.blip(T.transfer + i / RINGS * 3.1, scale[i % 5] * (i >= 5 ? i >= 10 ? 4 : 2 : 1), 0.7, 0.13, "sine");
        const rand = rng(9);
        for (let t = T.overload; t < T.collapse - 0.45; t += 0.22) {
          creak(t, 1.3);
          for (let n = 0; n < 3; n++) a.hit(t + rand() * 0.2, 900 + rand() * 1600, 0.04, 0.6, "bandpass");
        }
        a.hit(T.collapse - 0.35, 260, 0.34, 1);
      },
    };
  }

  function landScene() {
    const rand = rng(67), cx = 112, cy = 83, R = 60, tilt = 0.36;
    const seeds = [[0.5, 0.4], [-0.2, 2.6], [0.3, 4.6]];
    const cells = [];
    for (let lat = -1.44; lat <= 1.45; lat += 0.09) {
      const n = Math.max(6, Math.round(70 * Math.cos(lat)));
      for (let i = 0; i < n; i++) {
        const lon = i / n * TAU;
        const land = Math.sin(lon * 2 + 1.3) * Math.cos(lat * 2.6) + 0.7 * Math.sin(lon * 3 - lat * 4 + 0.5) + 0.35 * Math.sin(lon * 7 + lat * 6) > 0.3;
        const rank = Math.min(...seeds.map(([a, o]) => Math.acos(clamp(Math.sin(a) * Math.sin(lat) + Math.cos(a) * Math.cos(lat) * Math.cos(lon - o), -1, 1)))) + rand() * 0.3;
        cells.push({ lat, lon, land, rank });
      }
    }
    for (const kind of [true, false]) {
      const some = cells.filter(c => c.land === kind).sort((a, b) => a.rank - b.rank);
      some.forEach((c, i) => { c.order = i / some.length; });
    }
    const spot = (lat, lon) => {
      const x = Math.cos(lat) * Math.sin(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon);
      return [cx + x * R, cy - (y * Math.cos(tilt) - z * Math.sin(tilt)) * R, y * Math.sin(tilt) + z * Math.cos(tilt)];
    };
    const arc = (g, at, c) => {
      let last;
      for (let i = 0; i <= 32; i++) {
        const p = spot(...at(i / 32));
        if (last && last[2] > 0 && p[2] > 0) g.line(last[0], last[1], p[0], p[1], c);
        last = p;
      }
    };
    return {
      colors: [[110, 255, 190], [255, 216, 70]],
      status: { link: "SCANNING GLOBE", transfer: "RECEIVING LAND DATA", overload: "OUT OF LAND" },
      voice: { link: "Scanning the globe.", transfer: "Receiving land data.", overload: "Out of land." },
      draw(g, s) {
        const turn = s.t * 0.45, scan = 1.5 - s.link * 3;
        g.reveal(s.link * 1.5);
        g.poly(oval(cx, cy, R, R, 48), 4);
        for (let i = 0; i < 12; i++) arc(g, p => [(p - 0.5) * Math.PI, i / 12 * TAU + turn], 2);
        for (let i = -2; i <= 2; i++) arc(g, p => [i * 0.5, p * TAU], 2);
        g.revealed();
        for (const c of cells) {
          if (c.lat < scan) continue;
          const [x, y, z] = spot(c.lat, c.lon + turn);
          if (z <= 0.03) continue;
          const claimed = c.land ? s.transfer > c.order : s.overload * 1.1 > c.order;
          if (claimed) g.rect(x, y, 3, 3, c.land ? (z > 0.5 ? 11 : 9) : z > 0.5 ? 7 : 4);
          else if (c.land) g.rect(x, y, 2, 2, z > 0.5 ? 5 : 3);
        }
        if (s.link && s.link < 1) arc(g, p => [scan, p * TAU], 7);
        if (s.transfer) for (let k = 3; k >= 0; k--) arc(g, p => [(p - 0.5) * Math.PI, s.t * 2.4 - k * 0.05], k ? 5 : 7);
      },
      score(a, T) {
        a.osc("sine", [[T.boot, 73], [T.collapse, 73]], [[T.boot, 0], [T.link, 0.12], [T.collapse, 0.18]]);
        a.osc("triangle", [[T.link, 109.6], [T.overload, 110.4], [T.collapse, 164]], [[T.link, 0], [T.transfer, 0.06], [T.collapse, 0.12]]);
        const ping = (t, f, level) => [1, 0.36, 0.14].forEach((k, i) => a.blip(t + i * 0.27, f, 0.55, level * k, "sine"));
        for (let t = T.link + 0.1; t < T.overload - 0.3; t += 1.05) ping(t, 988, 0.16);
        a.noise([[T.link, 0], [T.link + 1, 0.06], [T.overload, 0.08], [T.collapse, 0.14]], ["bandpass", [[T.link, 500], [T.transfer, 1800], [T.overload, 700], [T.collapse, 2400]], 6]);
        for (let t = T.transfer, i = 0; t < T.overload; t += 0.19, i++) a.hit(t, 320 + i % 4 * 70, 0.06, 0.4, "bandpass");
      },
    };
  }

  function roadScene() {
    const rand = rng(73), horizon = 64, GEARS = [0, 0.75, 1.5, 2.3, 3.1];
    const hills = Array.from({ length: 23 }, (_, i) => [i * 10, horizon - 3 - rand() * 18]);
    const revs = s => {
      if (s.overload) return s.collapse ? 0 : 0.94 + Math.sin(s.t * 40) * 0.04;
      const u = s.t - CUES.transfer;
      if (u < 0) return s.link * 0.16;
      const gear = GEARS.findLastIndex(from => u >= from), from = GEARS[gear], to = GEARS[gear + 1] ?? from + 1;
      return (gear ? 0.42 : 0.16) + (gear ? 0.46 : 0.7) * (u - from) / (to - from);
    };
    return {
      colors: [[255, 180, 70], [110, 230, 255]],
      status: { link: "STARTING ENGINE", transfer: "RECEIVING DISTANCE DATA", overload: "REDLINE" },
      voice: { link: "Starting engine.", transfer: "Receiving distance data.", overload: "Redline." },
      draw(g, s) {
        const u = Math.max(0, s.t - CUES.transfer), rough = s.overload * (1 - s.collapse) * 3;
        const travel = u < 3.1 ? 1.15 * u * u : 11.05 + 7.1 * (u - 3.1) + 2 * (u - 3.1) ** 2;
        const jx = Math.sin(s.t * 51) * rough, jy = Math.sin(s.t * 43) * rough * 0.6, bend = Math.sin(travel * 0.16) * 2.6;
        const at = (z, side) => [112 + jx + side * 92 / z + bend * (z - 1) * Math.min(1, 12 / (z + 4)), horizon + jy + 54 / z];
        g.clip(VIEW.x, VIEW.y, VIEW.w, 102);
        g.reveal(s.link);
        g.path(hills.map(([x, y]) => [x + jx * 0.4, y + jy * 0.4]), 3);
        g.line(6, horizon + jy, 218, horizon + jy, 4);
        const slip = travel % 1;
        for (let n = 16; n >= 0; n--) {
          const z = Math.max(0.6, 1 + (n - slip) * 0.8), next = z + 0.8, c = z < 3 ? 7 : z < 6 ? 5 : 3, stripe = (n + Math.floor(travel)) % 2;
          for (const side of [-1, 1]) {
            g.line(...at(z, side), ...at(next, side), c);
            const [x, y] = at(z, side * 1.4);
            g.line(x, y, x, y - 20 / z, stripe ? 10 : 9);
            g.rect(x - 1, y - 20 / z, stripe ? 2 : 0, 2, 11);
          }
          if (stripe) g.line(...at(z, 0), ...at(z + 0.45, 0), c);
          g.line(...at(z, -3), ...at(z, -1), 1);
          g.line(...at(z, 1), ...at(z, 3), 1);
        }
        g.clip(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
        g.line(6, 118, 218, 118, 5);
        g.path(oval(46, 147, 25, 25, 20, Math.PI, TAU), 5);
        for (let i = 0; i <= 8; i++) {
          const a = Math.PI + i / 8 * Math.PI;
          g.line(46 + Math.cos(a) * 21, 147 + Math.sin(a) * 21, 46 + Math.cos(a) * 25, 147 + Math.sin(a) * 25, i > 6 ? RED : 6);
        }
        g.revealed();
        const needle = Math.PI + revs(s) * Math.PI;
        g.line(46, 147, 46 + Math.cos(needle) * 19, 147 + Math.sin(needle) * 19, 11);
        if (s.link === 1) [...String(Math.floor(s.value)).padStart(6, "0").slice(-6)].forEach((digit, i) => {
          g.box(100 + i * 18, 124, 17, 22, 4);
          g.text(104 + i * 18, 128, digit, 7, 2);
        });
      },
      score(a, T) {
        const engine = [[T.link, 30], [T.link + 0.3, 46], [T.transfer, 42]], limiter = [];
        GEARS.slice(0, -1).forEach((from, i) => engine.push([T.transfer + from + 0.05, i ? 88 + i * 6 : 46], [T.transfer + GEARS[i + 1], 150 + i * 14]));
        for (let t = T.overload; t < T.collapse; t += 0.09) limiter.push([t, 232], [t + 0.05, 205]);
        for (const [detune, level] of [[1, 0.22], [1.007, 0.16], [0.5, 0.2]]) {
          a.osc("sawtooth", [...engine, ...limiter].map(([t, f]) => [t, f * detune]), [[T.link, 0], [T.link + 0.25, level], [T.link + 0.6, level * 0.6], [T.transfer, level * 0.6], [T.transfer + 0.4, level], [T.collapse, level * 1.2]],
            ["lowpass", [[T.link, 300], [T.transfer, 420], [T.overload, 1200], [T.collapse, 1700]], 2]);
        }
        for (let t = T.link; t < T.link + 0.35; t += 0.08) a.hit(t, 700, 0.06, 0.4, "bandpass");
        for (const from of GEARS.slice(1, -1)) a.hit(T.transfer + from, 420, 0.07, 0.7);
        a.noise([[T.transfer, 0], [T.overload, 0.12], [T.collapse, 0.2]], ["bandpass", [[T.transfer, 500], [T.collapse, 1400]], 0.8]);
        a.noise([[T.overload, 0], [T.overload + 0.2, 0.34], [T.collapse, 0.5]], ["bandpass", [[T.overload, 1900], [T.overload + 0.6, 2500], [T.collapse, 2150]], 22]);
      },
    };
  }

  function brainScene() {
    const rand = rng(83), cx = 112, cy = 70, FOLDS = 22, STEPS = 30;
    const surface = (a, b) => {
      const x = Math.sin(a) * Math.cos(b), y = Math.sin(a) * Math.sin(b), z = Math.cos(a), cleft = y < 0 ? 1 - 0.2 * Math.exp(-((x / 0.14) ** 2)) : 1;
      return [x * 40 * cleft, y * (y > 0 ? 26 : 43) * cleft * (1 + 0.1 * z), z * 58];
    };
    const folds = Array.from({ length: FOLDS }, (_, j) => Array.from({ length: STEPS + 1 }, (_, i) => {
      const a = 0.12 + i / STEPS * (Math.PI - 0.24);
      return surface(a, j / FOLDS * TAU + (0.17 * Math.sin(a * 13 + j * 2.4) + 0.08 * Math.sin(a * 23 + j)) * Math.sin(a));
    }));
    const sylvian = [0, Math.PI].map(b => Array.from({ length: 13 }, (_, i) => surface(0.75 + i * 0.11, b + (b ? 1 : -1) * (i * 0.035 - 0.3))));
    const cerebellum = Array.from({ length: 5 }, (_, i) => Array.from({ length: 13 }, (_, k) => [Math.cos(k / 12 * TAU) * (20 - Math.abs(i - 2) * 3), 21 + i * 4, 37 + Math.sin(k / 12 * TAU) * (15 - Math.abs(i - 2) * 3)]));
    const cells = Array.from({ length: 80 }, () => {
      const a = 0.3 + rand() * 2.5, b = rand() * TAU;
      return [surface(a, b), surface(a + 0.2 * (rand() - 0.5), b + 0.35), rand() * 10];
    });
    return {
      colors: [[255, 134, 190], [255, 240, 140]],
      status: { link: "LINKING BRAIN", transfer: "RECEIVING BRAIN DATA", overload: "OVERTHINKING" },
      voice: { link: "Linking to the brain.", transfer: "Receiving brain data.", overload: "Overthinking." },
      draw(g, s) {
        const yaw = Math.PI / 2 + Math.sin(s.t * 0.9) * 0.75, cos = Math.cos(yaw), sin = Math.sin(yaw);
        const spot = ([x, y, z]) => {
          const px = x * cos + z * sin, pz = z * cos - x * sin, k = 200 / (200 + pz * 0.9 + y * 0.2);
          return [cx + px * k, cy + (y + pz * 0.22) * k, pz];
        };
        const trace = (points, c, depth) => {
          for (let i = 0; i + 1 < points.length; i++) {
            const p = spot(points[i]), q = spot(points[i + 1]);
            if (p[2] < depth) g.line(p[0], p[1], q[0], q[1], p[2] > -8 && c > 3 ? c - 2 : c);
          }
        };
        g.reveal(s.link);
        for (const x of [-5, 0, 5]) trace([[x, 22, 16], [x * 0.8, 40, 22], [x * 0.6, 56, 27]], 4, 99);
        cerebellum.forEach(ring => trace(ring, 4, 4));
        folds.forEach(fold => trace(fold, 5, 6));
        sylvian.forEach(line => trace(line, 7, 0));
        g.revealed();
        const rate = s.link * 0.03 + s.transfer * 0.3 + s.overload * 0.35;
        if (s.link === 1) cells.forEach(([from, to, phase], i) => {
          if (rng(i * 97 + Math.floor(s.t * 5 + phase))() > rate) return;
          const p = spot(from), q = spot(to);
          if (p[2] > 0) return;
          g.line(p[0], p[1], q[0], q[1], 10);
          g.rect(p[0] - 1, p[1] - 1, 3, 3, s.overload ? WHITE : 11);
        });
        const size = (s.link * 1.5 + s.transfer * 5 + s.overload * 5) * (1 - s.collapse);
        let last = 138;
        for (let x = 8; x < 8 + 208 * s.link; x++) {
          const u = x * 0.11 + s.t * 9, y = 138 + size * (Math.sin(u) * 0.5 + Math.sin(u * 2.7) * 0.4 + Math.sin(u * 7.1) * 0.3 * (s.transfer + s.overload));
          g.line(x, last, x + 1, y, 6);
          last = y;
        }
      },
      score(a, T) {
        for (let t = T.boot + 0.3; t < T.collapse - 0.2;) {
          const p = clamp((t - T.link) / (T.collapse - T.link));
          for (const [at, level] of [[0, 0.6], [0.15, 0.4]]) a.osc("sine", [[t + at, 78], [t + at + 0.1, 42]], [[t + at, 0], [t + at + 0.012, level], [t + at + 0.16, 0]]);
          t += 0.95 - p * 0.58;
        }
        a.osc("triangle", [[T.link, 82], [T.collapse, 98]], [[T.link, 0], [T.transfer, 0.06], [T.collapse, 0.1]]);
        const rand = rng(14);
        for (let t = T.link + 0.6; t < T.collapse;) {
          const p = clamp((t - T.link) / (T.collapse - T.link));
          a.blip(t, 1400 + rand() * 2600, 0.012, 0.09);
          t += (0.2 - p * 0.18) * (0.3 + rand() * 1.4);
        }
      },
    };
  }

  function iceScene() {
    const rand = rng(97), cx = 112, base = 112;
    const sag = Array.from({ length: 12 }, () => rand());
    const drips = Array.from({ length: 12 }, () => ({ side: rand() * 2 - 1, v: 0.7 + rand() * 0.8, p: rand() }));
    const splash = Array.from({ length: 60 }, () => ({ x: (rand() - 0.5) * 190, y: 40 + rand() * 120 }));
    const cracks = Array.from({ length: 14 }, () => [(rand() - 0.5) * 1.5, rand(), (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.4]);
    return {
      colors: [[170, 225, 255], [255, 130, 60]],
      status: { link: "HEATING ICE", transfer: "RECEIVING ICE DATA", overload: "MELTDOWN" },
      voice: { link: "Heating the ice.", transfer: "Receiving ice data.", overload: "Meltdown." },
      draw(g, s) {
        const fall = clamp(s.overload * 1.6 - 0.3), h = 76 * (1 - 0.55 * s.transfer) * (1 - fall * 0.96), w = 44 * (1 - 0.22 * s.transfer) * (1 + fall * 0.3);
        const puddle = oval(cx, base + 12, 30 + s.transfer * 44 + fall * 20, 8 + s.transfer * 7 + fall * 3);
        if (s.transfer) { g.fill(puddle, 2); g.poly(puddle, 4); }
        g.reveal(s.link);
        const low = i => sag[i] * s.transfer * 15 * (1 - fall);
        const L = [cx - w, base], F = [cx, base + w * 0.42], Rt = [cx + w, base];
        const edge = (ax, ay, bx, by, from) => [0, 1, 2, 3].map(i => [ax + (bx - ax) * i / 3, ay + (by - ay) * i / 3 + low(from + i)]);
        const front = edge(cx - w, base - h, cx, base - h + w * 0.42, 0), side = edge(cx, base - h + w * 0.42, cx + w, base - h, 3);
        const back = [[cx + w, base - h + low(6)], [cx, base - h - w * 0.42 + low(8)]];
        if (s.link === 1) {
          g.fill([...front, F, L], 4);
          g.fill([...side, Rt, F], 2);
          g.fill([...front, ...side.slice(1), back[1]], 6);
        }
        g.path([...front, ...side, back[1], front[0]], 7);
        g.path([front[0], L, F, Rt, side[3]], 6);
        g.line(...side[0], ...F, 7);
        for (let i = 0; i < 24; i++) g.line(28 + i * 7, i & 1 ? 137 : 145, 35 + i * 7, i & 1 ? 145 : 137, 8 + Math.round(s.link * 2 + (s.overload ? 1 : 0)));
        g.revealed();
        if (s.link === 1) cracks.slice(0, Math.floor(s.transfer * 9 + s.overload * 5)).forEach(([x, y, dx, dy]) => {
          const on = k => [cx + k * w, base + (1 - Math.abs(k)) * w * 0.42];
          const [ax, ay] = on(x * 0.6), [bx, by] = on(x * 0.6 + dx * 0.5);
          g.line(ax, ay - y * h * 0.8, bx, by - clamp(y + dy, 0, 1) * h * 0.8, x < 0 ? 7 : 5);
        });
        if (s.transfer && !s.collapse) for (const d of drips) {
          const p = (s.t * d.v + d.p) % 1, x = cx + d.side * w, edgeY = base + (1 - Math.abs(d.side)) * w * 0.42, y = edgeY - h * (1 - p * p) + 6;
          if (y < edgeY + 6) g.rect(x, y, 1, 3, 7);
        }
        const u = s.t - CUES.overload - 0.35;
        if (u > 0) for (const d of splash) {
          const y = base - d.y * u + 130 * u * u;
          if (y < base + 22) g.rect(cx + d.x * u, y, 2, 2, d.y > 100 ? WHITE : 6);
        }
        if (s.link) for (let i = 0; i < 16 * s.link; i++) {
          const p = (s.t * 0.5 + sag[i % 12] + i / 16) % 1;
          g.dot(32 + i * 10 + Math.sin(p * 9 + i) * 3, 134 - p * 20, 10);
        }
      },
      score(a, T) {
        a.osc("sawtooth", [[T.boot, 55], [T.collapse, 58]], [[T.boot, 0], [T.link + 0.6, 0.16], [T.collapse, 0.24]], ["lowpass", [[T.boot, 120], [T.link + 1, 260], [T.collapse, 420]], 3]);
        a.noise([[T.link, 0], [T.transfer, 0.03], [T.collapse, 0.1]], ["highpass", [[T.link, 4200], [T.collapse, 3000]], 1]);
        const rand = rng(21);
        for (let t = T.link + 1.2; t < T.collapse - 0.15;) {
          const p = clamp((t - T.link) / (T.overload - T.link)), f = 620 + rand() * 500;
          a.osc("sine", [[t, f], [t + 0.02, f * 0.8], [t + 0.07, f * 1.9]], [[t, 0], [t + 0.006, 0.2], [t + 0.09, 0]]);
          t += (0.5 - p * 0.42) * (0.5 + rand());
        }
        const crack = (t, level) => { for (let n = 0; n < 5; n++) a.hit(t + rand() * 0.08, 800 + rand() * 2200, 0.05, level, "bandpass"); };
        for (const at of [0.6, 1.5, 2.2, 2.8]) crack(T.transfer + at, 0.55);
        crack(T.overload, 0.8);
        a.hit(T.overload + 0.35, 170, 0.5, 1);
        a.noise([[T.overload + 0.3, 0], [T.overload + 0.4, 0.5], [T.collapse, 0.1]], ["bandpass", [[T.overload + 0.3, 1500], [T.collapse, 500]], 0.8]);
      },
    };
  }

  const scenes = {
    energy: energyScene(), co2: co2Scene(), water: waterScene(), trees: treesScene(), gha: landScene(),
    seaice: seaIceScene(), km: roadScene(), brain: brainScene(), ice: iceScene(),
  };

  function synth(ctx) {
    const comp = ctx.createDynamicsCompressor(), crush = ctx.createWaveShaper(), out = ctx.createGain(), duck = ctx.createGain();
    crush.curve = Float32Array.from({ length: 4097 }, (_, i) => Math.round((i / 2048 - 1) * 90) / 90);
    out.gain.value = 0.55;
    duck.connect(comp).connect(crush).connect(out).connect(ctx.destination);
    const white = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), data = white.getChannelData(0), rand = rng(3);
    for (let i = 0; i < data.length; i++) data[i] = rand() * 2 - 1;
    let bus = ctx.createGain();
    bus.connect(duck);
    const ramp = (param, points) => points.forEach(([t, v], i) => i ? param.linearRampToValueAtTime(v, t) : param.setValueAtTime(v, t));
    const route = (source, gains, filter) => {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      ramp(gain.gain, gains);
      let node = source;
      if (filter) {
        const f = ctx.createBiquadFilter();
        [f.type, , f.Q.value] = filter;
        ramp(f.frequency, filter[1]);
        node = node.connect(f);
      }
      node.connect(gain).connect(bus);
      source.start(gains[0][0]);
      source.stop(gains.at(-1)[0] + 0.02);
    };
    const a = {
      duck,
      cut(t) {
        bus.gain.setValueAtTime(1, t - 0.01);
        bus.gain.linearRampToValueAtTime(0, t);
        bus = ctx.createGain();
        bus.connect(duck);
      },
      osc(type, freqs, gains, filter) { const o = ctx.createOscillator(); o.type = type; ramp(o.frequency, freqs); route(o, gains, filter); },
      noise(gains, filter) { const n = ctx.createBufferSource(); n.buffer = white; n.loop = true; route(n, gains, filter); },
      blip(t, freq, len, level, type = "square") { a.osc(type, [[t, freq]], [[t, 0], [t + 0.004, level], [t + len, 0]]); },
      hit(t, freq, len, level, type = "lowpass") { a.noise([[t, 0], [t + 0.002, level], [t + len, 0]], [type, [[t, freq]], 1]); },
    };
    return a;
  }

  function score(a, scene, start, first) {
    const T = Object.fromEntries(PHASES.map(p => [p, start + CUES[p]]));
    if (first) {
      a.hit(T.boot, 300, 0.12, 0.8);
      for (let i = 0; i < 9; i++) a.blip(T.boot + 0.2 + i * 0.09, i % 3 ? 880 : 1320, 0.03, 0.06);
    } else T.boot = T.link - 0.4;
    a.hit(T.link, 500, 0.08, 0.5);
    a.hit(T.transfer, 500, 0.08, 0.5);
    for (let t = T.transfer; t < T.overload;) {
      const p = (t - T.transfer) / (T.overload - T.transfer);
      a.blip(t, 1100 + p * 900, 0.014, 0.07);
      t += 0.15 - p * 0.118;
    }
    scene.score(a, T);
    a.cut(T.collapse);
    a.hit(T.collapse, 200, 0.25, 0.9);
  }
  function finale(a, t) {
    a.hit(t, 250, 0.15, 0.6);
    [196, 293.66, 440].forEach((f, i) => a.blip(t + 0.08 + i * 0.13, f, 1.6 - i * 0.13, 0.16, "triangle"));
  }

  // Remote voices send the text to a server, so only local ones are used.
  function pickVoice() {
    const local = speechSynthesis.getVoices().filter(v => v.localService && v.lang.startsWith("en"));
    return ["Samantha", "Karen", "Moira", "Tessa", "Zira"].map(n => local.find(v => v.name.includes(n))).find(Boolean) || local.find(v => v.default);
  }
  function speaker(duck, ctx) {
    const voice = pickVoice(), held = [];
    const level = v => duck.gain.setTargetAtTime(v, ctx.currentTime, 0.06);
    let timer;
    return {
      say(line) {
        if (!voice) return;
        const u = new SpeechSynthesisUtterance(line);
        Object.assign(u, { voice, lang: voice.lang, pitch: 0.75, rate: 1.05, onstart: () => level(0.4), onend: () => level(1), onerror: () => level(1) });
        // Chrome drops the events of an utterance nobody references.
        held.push(u);
        const late = speechSynthesis.speaking || speechSynthesis.pending;
        speechSynthesis.cancel();
        // Speaking right after cancel() is ignored in some browsers.
        timer = setTimeout(() => speechSynthesis.speak(u), late ? 80 : 0);
      },
      stop() { clearTimeout(timer); speechSynthesis.cancel(); },
    };
  }
  speechSynthesis.getVoices();

  function list(g, jobs, at, s) {
    const typing = Math.max(0, Math.floor((s.t - CUES.collapse) * 40)), right = LIST.x + LIST.w - 5, slot = i => LIST.y + 7 + i * 19;
    jobs.slice(0, at + 1).forEach((job, i) => {
      const value = job.format(job.values[1]).replace(` ${job.label.toLowerCase()}`, ""), typed = str => i < at ? str : str.slice(0, typing);
      g.text(LIST.x + 6, slot(i), typed(job.label.toUpperCase()), 6);
      g.text(right - value.length * 6, slot(i), typed(value), WHITE);
    });
    if (s.collapse) return;
    const { values, format } = jobs[at], load = s.transfer ** 3;
    ["LOW", "MID", "HIGH"].forEach((name, i) => {
      const y = slot(at) + i * 11, mid = i === 1;
      if (s.link * 3 <= i) return;
      g.text(LIST.x + 6, y, name, mid ? 7 : 5);
      g.box(LIST.x + 34, y - 1, 74, 9, FRAME);
      g.rect(LIST.x + 36, y + 1, Math.round(70 * values[i] / (values[2] || 1) * load), 5, mid ? 10 : 8);
      let amount = s.transfer ? format(values[i] * load) : "";
      if (amount.length > 13) amount = amount.split(" ")[0];
      g.text(right - amount.length * 6, y, amount, mid ? 11 : 9);
    });
  }

  function frame(g, jobs, at, t) {
    const job = jobs[at], scene = scenes[job.key], s = { t };
    PHASES.forEach((p, i) => { s[p] = i < PHASES.length - 1 ? clamp((t - CUES[p]) / (CUES[PHASES[i + 1]] - CUES[p])) : clamp((t - CUES[p]) / 0.5); });
    const phase = PHASES.findLast(p => t >= CUES[p]), since = t - CUES[phase];
    s.value = job.values[1] * s.transfer ** 3;
    g.clear();
    const on = clamp((t + at * SPAN) / 0.5);
    g.box(LIST.x, LIST.y, LIST.w, LIST.h * on, FRAME);
    list(g, jobs, at, s);
    if (phase === "done") {
      const c = 1 + Math.round(s.done * 6);
      g.center(PANE / 2, 80, "FOOTPRINT", c, 2);
      g.center(PANE / 2, 102, "CALCULATED", c, 2);
      return s;
    }
    g.clip(VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    if (s.link) scene.draw(g, s);
    g.unclip();
    const grit = rng(Math.floor(t * 20));
    for (let i = 0; i < (phase === "boot" ? 160 : 50); i++) g.dot(grit() * PANE, grit() * H, 1);
    g.text(6, 5, `CALCULATING: ${job.label.toUpperCase()}`.slice(0, Math.round(on * 40)), 7);
    g.box(VIEW.x - 2, VIEW.y - 2, (VIEW.w + 4) * on, VIEW.h + 4, FRAME);
    if (phase === "boot") {
      for (let i = 0; i < 14; i++) {
        const text = Array.from({ length: 5 }, (_, k) => (rng(i * 31 + k)() * 65536 | 0).toString(16).toUpperCase().padStart(4, "0")).join(" ");
        g.text(14, 22 + i * 9, text.slice(0, clamp(Math.floor((s.boot * 22 - i) * 24), 0, 24)), 3);
      }
    }
    g.text(6, 157, s.transfer ? job.format(s.value) : "", WHITE, 2);
    g.text(6, 176, (phase === "boot" ? "POWER ON" : scene.status[phase === "collapse" ? "overload" : phase]).slice(0, Math.floor(since * 40)), 6);
    g.box(6, 187, 212, 9, FRAME);
    const cells = Math.round((s.boot * 0.04 + s.link * 0.12 + s.transfer * 0.84) * 52);
    for (let i = 0; i < cells; i++) g.rect(8 + i * 4, 189, 3, 5, 6);
    if (s.collapse) g.collapse(s.collapse);
    else if (at && phase === "link" && since < 0.25) g.collapse(1 - since / 0.25);
    return s;
  }

  function play(jobs, wait) {
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches, end = jobs.length - 1;
    if (wait && still) return;
    const dialog = document.createElement("dialog"), canvas = document.createElement("canvas");
    dialog.id = "install";
    dialog.setAttribute("aria-label", jobs.map(job => {
      const [low, mid, high] = job.values.map(job.format);
      return `${job.label}: ${mid}, ${low} to ${high}`;
    }).join(". "));
    canvas.width = W;
    canvas.height = H;
    dialog.append(canvas);
    document.body.append(dialog);
    const pen = canvas.getContext("2d"), image = pen.createImageData(W, H), pixels = new Uint32Array(image.data.buffer), g = screen();
    let ctx, audio, voice, start, begin, request, spoken, scored = 0;
    // Scheduling all footprints up front would hold thousands of audio nodes at once.
    const compose = t => {
      for (; scored <= end && t >= scored * SPAN - 0.5; scored++) {
        score(audio, scenes[jobs[scored].key], start + scored * SPAN, !scored);
        if (scored === end) finale(audio, start + end * SPAN + CUES.done);
      }
    };
    const tick = now => {
      const clock = still ? end * SPAN + CUES.done + 9 : Math.max(0, now - begin) / 1000;
      const at = clamp(Math.floor((clock - CUES.link) / SPAN), 0, end), t = Math.max(at && CUES.link, clock - at * SPAN);
      const phase = PHASES.findLast(p => t >= CUES[p]), cue = at + phase, scene = scenes[jobs[at].key];
      const line = { boot: "Online.", ...scene.voice, done: "Footprint calculated." }[phase];
      if (!still) compose(clock);
      if (cue !== spoken && line) voice.say(line);
      if (cue !== spoken && phase === "collapse") voice.stop();
      spoken = cue;
      const s = frame(g, jobs, at, t);
      g.paint(pixels, palette(scene.colors));
      pen.putImageData(image, 0, 0);
      if (s.done < 1) request = requestAnimationFrame(tick);
    };
    const run = () => {
      dialog.onkeydown = null;
      dialog.onclick = () => dialog.close();
      ctx = new AudioContext();
      audio = synth(ctx);
      voice = speaker(audio.duck, ctx);
      start = ctx.currentTime + 0.05;
      begin = performance.now();
      if (still) finale(audio, start);
      tick(begin);
    };
    dialog.onclose = () => {
      cancelAnimationFrame(request);
      voice?.stop();
      ctx?.close();
      dialog.remove();
      document.getElementById("play").focus({ preventScroll: true });
    };
    dialog.showModal();
    if (!wait) return run();
    g.center(W / 2, 93, "PRESS ANY KEY", 7, 2);
    g.paint(pixels, palette(scenes[jobs[0].key].colors));
    pen.putImageData(image, 0, 0);
    dialog.onclick = run;
    dialog.onkeydown = e => {
      const modifier = e.metaKey || e.ctrlKey || e.altKey || e.key === "Shift";
      // Escape closes the dialog, and keys without activation would start it silent.
      if (e.key === "Escape" || modifier || navigator.userActivation?.isActive === false) return;
      e.preventDefault();
      run();
    };
  }

  return { scenes, play };
})();
