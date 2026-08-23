/* Bill Maker image worker v2.
   THE RULE THAT CAUSED THE v1 FAILURE LIVES HERE, INVERTED:
   v1 auto-cropped every photograph to its "biggest bright region" before
   reading. On real photos that threw away up to ~35% of the frame - page
   edges, whole halves of two-page spreads - so the reader never saw them.
   v2 NEVER crops. The full frame is preserved, enhanced as a copy, and read
   whole PLUS in overlapping close-up sections so edge writing is never lost.
   The user's own approved crop (if any) applies only to the close-up pass. */

const OCR_EDGE = 2200;    // full-page reading copy
const TILE_EDGE = 1500;   // each close-up section

function grey(d, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++)
    g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return g;
}
function boxBlur(src, w, h, r) {
  const t = new Float32Array(w * h), o = new Float32Array(w * h), k = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0; const row = y * w;
    for (let x = -r; x <= r; x++) s += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      t[row + x] = s / k;
      s += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.min(w - 1, Math.max(0, x - r))];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += t[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      o[y * w + x] = s / k;
      s += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.min(h - 1, Math.max(0, y - r)) * w + x];
    }
  }
  return o;
}
function skewAngle(g, w, h) {          // measured and reported, never applied destructively
  let best = 0, bestV = -1;
  for (let a = -6; a <= 6; a += 0.5) {
    const t = Math.tan(a * Math.PI / 180), rows = new Float32Array(h);
    for (let y = 0; y < h; y += 2)
      for (let x = 0; x < w; x += 3) {
        const yy = y + ((x - w / 2) * t | 0);
        if (yy < 0 || yy >= h) continue;
        if (g[yy * w + x] < 170) rows[y]++;
      }
    let m = 0; for (let y = 0; y < h; y++) m += rows[y]; m /= h || 1;
    let v = 0; for (let y = 0; y < h; y++) v += (rows[y] - m) * (rows[y] - m);
    if (v > bestV) { bestV = v; best = a; }
  }
  return best;
}
function pageHash(g, w, h) {
  const S = 8, cell = new Float32Array(S * S), n = new Float32Array(S * S);
  for (let y = 0; y < h; y++) {
    const cy = (y * S / h) | 0;
    for (let x = 0; x < w; x++) { const i = cy * S + ((x * S / w) | 0); cell[i] += g[y * w + x]; n[i]++; }
  }
  let mean = 0;
  for (let i = 0; i < cell.length; i++) { cell[i] /= n[i] || 1; mean += cell[i]; }
  mean /= cell.length;
  let bits = '';
  for (let i = 0; i < cell.length; i++) bits += cell[i] > mean ? '1' : '0';
  return bits;
}

/* Flat-field + percentile stretch + unsharp, on a COPY, full frame. */
function enhance(im, w, h) {
  const d = im.data, g = grey(d, w, h);
  const bg = boxBlur(g, w, h, Math.max(8, Math.round(Math.min(w, h) / 22)));
  const flat = new Float32Array(w * h);
  for (let i = 0; i < flat.length; i++) flat[i] = Math.min(255, g[i] / Math.max(1, bg[i]) * 235);
  const sm = boxBlur(flat, w, h, 1);
  const hist = new Uint32Array(256);
  for (let i = 0; i < flat.length; i++) hist[flat[i] | 0]++;
  let lo = 0, hi = 255, acc = 0; const n = flat.length;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.02) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.02) { hi = i; break; } }
  const span = Math.max(24, hi - lo);
  for (let i = 0, j = 0; j < flat.length; i += 4, j++) {
    let v = flat[j] + (flat[j] - sm[j]) * 0.9;
    v = (v - lo) / span * 255;
    d[i] = d[i + 1] = d[i + 2] = v < 0 ? 0 : v > 255 ? 255 : v; d[i + 3] = 255;
  }
  return g;   // original grey, for metrics
}

/* Handwriting bands: rows where ink density is real. Every band must later be
   accounted for by a read line, or the app flags COULD NOT READ. */
function inkBands(eg, w, h) {
  const dens = new Float32Array(h);
  for (let y = 0; y < h; y++) { let c = 0; const row = y * w;
    for (let x = 0; x < w; x += 2) if (eg[row + x] < 120) c++;
    dens[y] = c / (w / 2);
  }
  const bands = []; let start = -1;
  const ON = 0.012, MINH = Math.max(6, h * 0.008);
  for (let y = 0; y < h; y++) {
    if (dens[y] > ON) { if (start < 0) start = y; }
    else if (start >= 0) {
      if (y - start >= MINH) bands.push([start / h, y / h]);
      start = -1;
    }
  }
  if (start >= 0 && h - start >= MINH) bands.push([start / h, 1]);
  // merge bands separated by tiny gaps (same paragraph of writing)
  const out = [];
  for (const b of bands) {
    if (out.length && b[0] - out[out.length - 1][1] < 0.008) out[out.length - 1][1] = b[1];
    else out.push(b);
  }
  return out;
}

/* Capture-quality advice. Advisory only - it never blocks the user. */
function quality(eg, g, w, h) {
  let mean = 0; for (let i = 0; i < g.length; i += 7) mean += g[i];
  mean /= Math.ceil(g.length / 7);
  let varSum = 0, cnt = 0;                          // gradient variance ~= sharpness
  for (let y = 1; y < h - 1; y += 3) for (let x = 1; x < w - 1; x += 3) {
    const i = y * w + x, gx = g[i + 1] - g[i - 1], gy = g[i + w] - g[i - w];
    varSum += gx * gx + gy * gy; cnt++;
  }
  const sharp = varSum / cnt;
  const m = Math.round(Math.min(w, h) * 0.02);      // ink touching the frame edge
  const edge = { top: 0, bottom: 0, left: 0, right: 0 };
  for (let x = 0; x < w; x += 2) {
    for (let y = 0; y < m; y++) if (eg[y * w + x] < 110) { edge.top++; break; }
    for (let y = h - m; y < h; y++) if (eg[y * w + x] < 110) { edge.bottom++; break; }
  }
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < m; x++) if (eg[y * w + x] < 110) { edge.left++; break; }
    for (let x = w - m; x < w; x++) if (eg[y * w + x] < 110) { edge.right++; break; }
  }
  let minX = w, maxX = 0, minY = h, maxY = 0, inkN = 0;
  for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) if (eg[y * w + x] < 120) {
    inkN++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const inkArea = inkN ? ((maxX - minX) * (maxY - minY)) / (w * h) : 0;
  const warn = [];
  if (mean < 70) warn.push('The photograph is quite dark - more light would help.');
  if (sharp < 110) warn.push('The writing looks soft - hold steadier or move closer.');
  if (edge.top > w * 0.06 || edge.bottom > w * 0.06 || edge.left > h * 0.06 || edge.right > h * 0.06)
    warn.push('Writing touches the edge of the frame - part of the paper may be outside the photograph.');
  if (inkN && inkArea < 0.18) warn.push('The camera looks far from the page - closer fills the frame better.');
  return warn;
}

const jpeg = (cv, q) => cv.convertToBlob({ type: 'image/jpeg', quality: q });

async function draw(bmpOrCanvas, sx, sy, sw, sh, dw, dh) {
  const c = new OffscreenCanvas(dw, dh);
  c.getContext('2d').drawImage(bmpOrCanvas, sx, sy, sw, sh, 0, 0, dw, dh);
  return c;
}

/* Overlapping close-up sections. >=15% overlap so edge writing is never lost.
   Portrait: 3 horizontal strips. Landscape (spreads): 2x2. */
function tileRects(w, h, crop) {
  const cx0 = crop ? crop.x0 : 0, cy0 = crop ? crop.y0 : 0;
  const cx1 = crop ? crop.x1 : 1, cy1 = crop ? crop.y1 : 1;
  const cw = cx1 - cx0, ch = cy1 - cy0;
  const R = [];
  if (h * ch >= w * cw) {
    for (const [a, b] of [[0, 0.42], [0.29, 0.71], [0.58, 1]])
      R.push({ x0: cx0, x1: cx1, y0: cy0 + ch * a, y1: cy0 + ch * b });
  } else {
    for (const [ya, yb] of [[0, 0.6], [0.4, 1]])
      for (const [xa, xb] of [[0, 0.58], [0.42, 1]])
        R.push({ x0: cx0 + cw * xa, x1: cx0 + cw * xb, y0: cy0 + ch * ya, y1: cy0 + ch * yb });
  }
  return R;
}

self.onmessage = async (e) => {
  const { id, op, blob, opts } = e.data;
  const say = s => self.postMessage({ type: 'stage', id, stage: s });
  try {
    if (op === 'prepare') {
      say('improving');
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      const sc = Math.min(1, OCR_EDGE / Math.max(bmp.width, bmp.height));
      let w = Math.round(bmp.width * sc), h = Math.round(bmp.height * sc);
      const turn = (opts && opts.rotate) || 0;                // user-chosen quarter turns only
      const swap = turn % 180 !== 0;
      const cv = new OffscreenCanvas(swap ? h : w, swap ? w : h);
      const cx2 = cv.getContext('2d', { willReadFrequently: true });
      cx2.translate(cv.width / 2, cv.height / 2);
      cx2.rotate(turn * Math.PI / 180);
      cx2.drawImage(bmp, -w / 2, -h / 2, w, h);
      bmp.close();
      if (swap) { const t = w; w = h; h = t; }

      const colorFull = await jpeg(cv, 0.85);                 // full frame, true colour
      const im = cx2.getImageData(0, 0, w, h);
      const g = enhance(im, w, h);                            // in-place on the copy
      const ec = new OffscreenCanvas(w, h);
      ec.getContext('2d').putImageData(im, 0, 0);
      const enhancedFull = await jpeg(ec, 0.85);              // full frame, enhanced

      const eg = grey(im.data, w, h);
      const bands = inkBands(eg, w, h);
      const warnings = quality(eg, g, w, h);
      const deskew = skewAngle(eg, w, h);
      const hash = pageHash(eg, w, h);

      const ts = Math.min(1, 480 / Math.max(w, h));
      const tc = await draw(cv, 0, 0, w, h, Math.max(1, Math.round(w * ts)), Math.max(1, Math.round(h * ts)));
      const thumb = await jpeg(tc, 0.75);

      self.postMessage({ type: 'done', id, colorFull, enhancedFull, thumb,
        w, h, deskew: +deskew.toFixed(1), hash, bands, warnings, turn });
      return;
    }
    if (op === 'tiles') {
      // opts.crop = user-approved region (fractions) or null for the full frame
      const bmp = await createImageBitmap(blob);              // blob = enhancedFull
      const w = bmp.width, h = bmp.height;
      const rects = tileRects(w, h, opts && opts.crop);
      const tiles = [];
      for (const r of rects) {
        const sw = Math.round((r.x1 - r.x0) * w), sh = Math.round((r.y1 - r.y0) * h);
        const sc = Math.min(1, TILE_EDGE / Math.max(sw, sh));
        const c = await draw(bmp, Math.round(r.x0 * w), Math.round(r.y0 * h), sw, sh,
          Math.max(1, Math.round(sw * sc)), Math.max(1, Math.round(sh * sc)));
        tiles.push({ blob: await jpeg(c, 0.85), rect: r });
      }
      bmp.close();
      self.postMessage({ type: 'done', id, tiles });
      return;
    }
    throw new Error('unknown op ' + op);
  } catch (err) {
    self.postMessage({ type: 'error', id, message: String(err && err.message || err) });
  }
};
