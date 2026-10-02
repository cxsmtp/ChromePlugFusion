// Recognises a "sparkle" icon (✦) from its SVG geometry, so no icon name or
// manual picking is needed. A sparkle is a four-pointed star with its points
// facing up, down, left and right and deeply pinched sides between them.
//
// Method: walk the outline of the largest shape in the SVG, measure its
// distance from the centre in 2° steps, then check for long sharp points on
// the four axes and short distances on the diagonals. That rules out a "+"
// (blunt arm ends), an "×" (points on the diagonals), circles, shields, logos,
// chevrons, etc.

// Assigned on globalThis (not `const`) so the file can be injected again after an
// extension update without a "has already been declared" error.
globalThis.cpfSparkleShape = (() => {
  const GEOMETRY = "path, polygon, polyline";
  const BIN_DEG = 2;
  const BINS = 360 / BIN_DEG;
  const cache = new Map(); // geometry text -> boolean

  function shapesOf(svg) {
    let shapes = [...svg.querySelectorAll(GEOMETRY)];
    if (!shapes.length) {
      const use = svg.querySelector("use");
      const href = use && (use.getAttribute("href") || use.getAttribute("xlink:href"));
      const ref = href && href.startsWith("#") && svg.ownerDocument.getElementById(href.slice(1));
      if (ref) shapes = ref.matches(GEOMETRY) ? [ref] : [...ref.querySelectorAll(GEOMETRY)];
    }
    return shapes;
  }

  // ---- Outline from the SVG source, without asking the browser ----
  // getTotalLength()/getPointAtLength() force a page layout, which can start web
  // font downloads that Chrome then reports as this extension's errors. Parsing
  // the path data ourselves avoids touching layout at all (and is faster).

  const CURVE_STEPS = 16;
  const NUMBER = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/y;

  function arcPoints(x1, y1, rx, ry, angle, largeArc, sweep, x2, y2) {
    if (!rx || !ry || (x1 === x2 && y1 === y2)) return [{ x: x2, y: y2 }];
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const phi = (angle * Math.PI) / 180;
    const cos = Math.cos(phi), sin = Math.sin(phi);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1) {
      rx *= Math.sqrt(lambda);
      ry *= Math.sqrt(lambda);
    }
    const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    let k = Math.sqrt(Math.max(0, num / den));
    if (largeArc === sweep) k = -k;
    const cxp = (k * rx * y1p) / ry, cyp = (-k * ry * x1p) / rx;
    const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
    const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
    const vecAngle = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const ux = (x1p - cxp) / rx, uy = (y1p - cyp) / ry;
    const start = vecAngle(1, 0, ux, uy);
    let delta = vecAngle(ux, uy, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && delta > 0) delta -= 2 * Math.PI;
    else if (sweep && delta < 0) delta += 2 * Math.PI;
    const n = Math.max(4, Math.ceil(Math.abs(delta) / (Math.PI / 16)));
    const pts = [];
    for (let i = 1; i <= n; i++) {
      const t = start + (delta * i) / n;
      pts.push({
        x: cos * rx * Math.cos(t) - sin * ry * Math.sin(t) + cx,
        y: sin * rx * Math.cos(t) + cos * ry * Math.sin(t) + cy
      });
    }
    return pts;
  }

  // Flattens SVG path data into sub-paths of points (curves and arcs sampled).
  function parsePath(d) {
    const parts = [];
    let cur = null;
    let x = 0, y = 0, startX = 0, startY = 0;
    let cubicCtrl = null, quadCtrl = null;
    let cmd = null;
    let i = 0;

    const skip = () => { while (i < d.length && /[\s,]/.test(d[i])) i++; };
    const num = () => {
      skip();
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(d);
      if (!m) throw new Error("bad number");
      i = NUMBER.lastIndex;
      return parseFloat(m[0]);
    };
    const flag = () => {
      skip();
      const c = d[i++];
      if (c !== "0" && c !== "1") throw new Error("bad flag");
      return c === "1";
    };
    const to = (px, py) => {
      if (!cur) { cur = [{ x, y }]; parts.push(cur); }
      cur.push({ x: px, y: py });
      x = px;
      y = py;
    };

    try {
      for (;;) {
        skip();
        if (i >= d.length) break;
        if (/[a-zA-Z]/.test(d[i])) cmd = d[i++];
        else if (!cmd || cmd === "z" || cmd === "Z") break;
        else if (cmd === "M") cmd = "L"; // extra pairs after a move-to are line-tos
        else if (cmd === "m") cmd = "l";

        const rel = cmd !== cmd.toUpperCase();
        const ox = rel ? x : 0, oy = rel ? y : 0;
        let nextCubic = null, nextQuad = null;

        switch (cmd.toUpperCase()) {
          case "M":
            x = ox + num(); y = oy + num();
            startX = x; startY = y;
            cur = [{ x, y }];
            parts.push(cur);
            break;
          case "L": { const nx = ox + num(); to(nx, oy + num()); break; }
          case "H": to(ox + num(), y); break;
          case "V": to(x, oy + num()); break;
          case "C":
          case "S": {
            let c1x, c1y;
            if (cmd.toUpperCase() === "C") { c1x = ox + num(); c1y = oy + num(); }
            else if (cubicCtrl) { c1x = 2 * x - cubicCtrl.x; c1y = 2 * y - cubicCtrl.y; }
            else { c1x = x; c1y = y; }
            const c2x = ox + num(), c2y = oy + num(), ex = ox + num(), ey = oy + num();
            const x0 = x, y0 = y;
            for (let s = 1; s <= CURVE_STEPS; s++) {
              const t = s / CURVE_STEPS, u = 1 - t;
              to(u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * ex,
                 u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * ey);
            }
            nextCubic = { x: c2x, y: c2y };
            break;
          }
          case "Q":
          case "T": {
            let qx, qy;
            if (cmd.toUpperCase() === "Q") { qx = ox + num(); qy = oy + num(); }
            else if (quadCtrl) { qx = 2 * x - quadCtrl.x; qy = 2 * y - quadCtrl.y; }
            else { qx = x; qy = y; }
            const ex = ox + num(), ey = oy + num();
            const x0 = x, y0 = y;
            for (let s = 1; s <= CURVE_STEPS; s++) {
              const t = s / CURVE_STEPS, u = 1 - t;
              to(u * u * x0 + 2 * u * t * qx + t * t * ex, u * u * y0 + 2 * u * t * qy + t * t * ey);
            }
            nextQuad = { x: qx, y: qy };
            break;
          }
          case "A": {
            const rx = num(), ry = num(), rot = num(), large = flag(), sweep = flag();
            const ex = ox + num(), ey = oy + num();
            for (const p of arcPoints(x, y, rx, ry, rot, large, sweep, ex, ey)) to(p.x, p.y);
            break;
          }
          case "Z":
            to(startX, startY);
            cur = null; // drawing after Z starts a new sub-path at the same point
            break;
          default:
            throw new Error("unknown command");
        }
        cubicCtrl = nextCubic;
        quadCtrl = nextQuad;
      }
    } catch (_) {
      /* malformed data: use what was read so far */
    }
    return parts;
  }

  function parsePoints(shape) {
    const nums = (shape.getAttribute("points") || "").match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
    const pts = [];
    for (let k = 0; k + 1 < nums.length; k += 2) pts.push({ x: +nums[k], y: +nums[k + 1] });
    if (pts.length && shape.tagName.toLowerCase() === "polygon") pts.push(pts[0]);
    return pts;
  }

  function subpaths(shapes) {
    const parts = [];
    for (const shape of shapes) {
      if (shape.tagName.toLowerCase() === "path") parts.push(...parsePath(shape.getAttribute("d") || ""));
      else parts.push(parsePoints(shape));
    }
    return parts.filter((p) => p.length >= 3);
  }

  function bbox(points) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }

  function isSparkleOutline(points) {
    const b = bbox(points);
    if (!b.w || !b.h) return false;
    const aspect = b.w / b.h;
    if (aspect < 0.75 || aspect > 1.33) return false;

    const cx = (b.x0 + b.x1) / 2;
    const cy = (b.y0 + b.y1) / 2;
    const r = new Array(BINS).fill(0);
    // Interpolate along each segment so every angle is covered.
    const stepLen = Math.hypot(b.w, b.h) / 300;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], c = points[i];
      const steps = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.y - a.y) / stepLen));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const x = a.x + (c.x - a.x) * t - cx;
        const y = a.y + (c.y - a.y) * t - cy;
        const bin = Math.floor(((Math.atan2(y, x) * 180 / Math.PI + 360 + BIN_DEG / 2) % 360) / BIN_DEG) % BINS;
        r[bin] = Math.max(r[bin], Math.hypot(x, y));
      }
    }
    if (r.filter((v) => v === 0).length > BINS * 0.1) return false;
    const rmax = Math.max(...r);
    // Largest radius within ±spread degrees of an angle, relative to the longest point.
    const at = (deg, spread = 0) => {
      let m = 0;
      for (let d = -spread; d <= spread; d += BIN_DEG) {
        const bin = Math.round((deg + d) / BIN_DEG);
        m = Math.max(m, r[((bin % BINS) + BINS) % BINS]);
      }
      return m / rmax;
    };

    for (const axis of [0, 90, 180, 270]) {
      if (at(axis, 4) < 0.85) return false; // long point on each axis
      // Sharp, not blunt like a "+": the outline already falls away 6° beside the
      // point (a "+" arm's flat end is still at full length there), and more by 12°.
      for (const side of [-1, 1]) {
        if (at(axis + side * 6) > 0.92 || at(axis + side * 12) > 0.8) return false;
      }
    }
    for (const diag of [45, 135, 225, 315]) {
      // Pinched in between the points, but not down to a thin "+" sign's inner corner.
      const d = at(diag, 4);
      if (d > 0.55 || d < 0.15) return false;
    }
    return true;
  }

  function isSparkle(svg) {
    const shapes = shapesOf(svg);
    if (!shapes.length) return false;
    const key = shapes.map((s) => s.getAttribute("d") || s.getAttribute("points") || "").join("|");
    if (cache.has(key)) return cache.get(key);

    const parts = subpaths(shapes);
    let result = false;
    if (parts.length) {
      // Judge the biggest piece; small extras (a little "+" or second star) are decoration.
      const area = (p) => { const b = bbox(p); return b.w * b.h; };
      const largest = parts.reduce((a, c) => (area(c) > area(a) ? c : a));
      result = isSparkleOutline(largest);
    }
    cache.set(key, result);
    return result;
  }

  return { isSparkle };
})();
