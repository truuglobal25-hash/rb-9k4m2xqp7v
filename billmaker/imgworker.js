/* Bill Maker image worker.
   Runs the whole photograph clean-up off the main thread so the screen never
   freezes while a page is being straightened. Posts progress as it goes.

   Pipeline: EXIF-correct orientation -> downscale -> flat-field (kills the
   shadow and glare gradients a phone in a car always produces) -> percentile
   contrast stretch -> unsharp mask -> find the PAPER (the bright region, not
   the ink: a dark dashboard is darker than any pencil stroke) -> crop ->
   measure tilt from the page alone -> rotate.

   Kept greyscale on purpose. Hard black-and-white thresholding destroys the
   light strokes a vision reader can still make out. */

const MAXEDGE = 1900;   // enough for a reader, small enough to send quickly

function grey(d, w, h) {
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++)
    g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return g;
}

function boxBlur(src, w, h, r) {                    // separable, O(n)
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

/* Largest run of rows/columns that are mostly bright = the sheet of paper. */
function longestBrightRun(len, other, bright) {
  let bs = 0, be = -1, cs = -1;
  for (let i = 0; i < len; i++) {
    if (bright[i] >= other * 0.34) { if (cs < 0) cs = i; }
    else if (cs >= 0) { if (i - cs > be - bs) { bs = cs; be = i - 1; } cs = -1; }
  }
  if (cs >= 0 && len - cs > be - bs) { bs = cs; be = len - 1; }
  return be > bs ? [bs, be] : [0, len - 1];
}

/* Projection profile: the rotation whose row-sums vary most is the upright one. */
function skewAngle(g, w, h) {
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

/* A coarse hash of the cleaned page, so a page photographed twice is spotted. */
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

async function process(blob, opts) {
  const say = s => self.postMessage({ type: 'stage', stage: s });
  say('improving');
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const sc = Math.min(1, MAXEDGE / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * sc), h = Math.round(bmp.height * sc);
  const c = new OffscreenCanvas(w, h), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(bmp, 0, 0, w, h); bmp.close();

  const im = x.getImageData(0, 0, w, h), d = im.data, g = grey(d, w, h);
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
    let v = flat[j] + (flat[j] - sm[j]) * 0.9;              // unsharp mask
    v = (v - lo) / span * 255;
    d[i] = d[i + 1] = d[i + 2] = v < 0 ? 0 : v > 255 ? 255 : v; d[i + 3] = 255;
  }
  x.putImageData(im, 0, 0);

  const g2 = grey(d, w, h);
  let x0, x1, y0, y1;
  if (opts && opts.crop) {                                  // the owner corrected the crop by hand
    x0 = Math.round(opts.crop.x0 * w); x1 = Math.round(opts.crop.x1 * w);
    y0 = Math.round(opts.crop.y0 * h); y1 = Math.round(opts.crop.y1 * h);
  } else {
    const rowB = new Float32Array(h), colB = new Float32Array(w);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let xx = 0; xx < w; xx++) if (g2[row + xx] > 195) { rowB[y]++; colB[xx]++; }
    }
    const yr = longestBrightRun(h, w, rowB), xr = longestBrightRun(w, h, colB);
    const pad = Math.round(Math.min(w, h) * 0.012);
    y0 = Math.max(0, yr[0] - pad); y1 = Math.min(h - 1, yr[1] + pad);
    x0 = Math.max(0, xr[0] - pad); x1 = Math.min(w - 1, xr[1] + pad);
    if (x1 - x0 < w * 0.25 || y1 - y0 < h * 0.25) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
  }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;

  const pg = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++)
    for (let xx = 0; xx < cw; xx++) pg[y * cw + xx] = g2[(y + y0) * w + (x0 + xx)];
  const ang = (opts && opts.rotate != null) ? 0 : skewAngle(pg, cw, ch);
  const turn = (opts && opts.rotate) || 0;                  // extra 90-degree turns from the owner

  const swap = turn % 180 !== 0;
  const ow = swap ? ch : cw, oh = swap ? cw : ch;
  const o = new OffscreenCanvas(ow, oh), ox = o.getContext('2d');
  ox.fillStyle = '#fff'; ox.fillRect(0, 0, ow, oh);
  ox.translate(ow / 2, oh / 2);
  ox.rotate((turn - ang) * Math.PI / 180);
  ox.drawImage(c, x0, y0, cw, ch, -cw / 2, -ch / 2, cw, ch);

  const clean = await o.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
  const ts = Math.min(1, 320 / Math.max(ow, oh));
  const t = new OffscreenCanvas(Math.max(1, Math.round(ow * ts)), Math.max(1, Math.round(oh * ts)));
  t.getContext('2d').drawImage(o, 0, 0, t.width, t.height);
  const thumb = await t.convertToBlob({ type: 'image/jpeg', quality: 0.72 });

  return { clean, thumb, w: ow, h: oh, deskew: +ang.toFixed(1), turn, hash: pageHash(pg, cw, ch) };
}

self.onmessage = async (e) => {
  const { id, blob, opts } = e.data;
  try {
    const r = await process(blob, opts);
    self.postMessage({ type: 'done', id, ...r }, [
      /* blobs are not transferable; they are structured-cloned cheaply */
    ]);
  } catch (err) {
    self.postMessage({ type: 'error', id, message: String(err && err.message || err) });
  }
};
