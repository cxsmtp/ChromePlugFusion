// Recognises a "sparkle" icon (✦) from its SVG geometry, so no icon name or
// manual picking is needed. A sparkle is a four-pointed star with its points
// facing up, down, left and right and deeply pinched sides between them.
//
// Method: walk the outline of the largest shape in the SVG, measure its
// distance from the centre in 2° steps, then check for long sharp points on
// the four axes and short distances on the diagonals. That rules out a "+"
// (blunt arm ends), an "×" (points on the diagonals), circles, shields, logos,
// chevrons, etc.

// eslint-disable-next-line no-unused-vars
const cpfSparkleShape = (() => {
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

  // Sample each shape's outline and split it into its sub-paths (a move-to shows
  // up as a jump between consecutive samples).
  function subpaths(shapes) {
    const parts = [];
    for (const shape of shapes) {
      let len = 0;
      try { len = shape.getTotalLength(); } catch (_) { continue; }
      if (!len) continue;
      const n = 360;
      const step = len / n;
      let cur = [];
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const p = shape.getPointAtLength(Math.min(i * step, len));
        if (prev && Math.hypot(p.x - prev.x, p.y - prev.y) > step * 1.5 + 1e-6) {
          parts.push(cur);
          cur = [];
        }
        cur.push(p);
        prev = p;
      }
      parts.push(cur);
    }
    return parts.filter((p) => p.length >= 8);
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
    // Interpolate between samples so every angle is covered.
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], c = points[i];
      for (let t = 0; t <= 1; t += 0.1) {
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
