/* Mastery · moteur d'analyse des copies côté serveur (généré par build.py : ne pas modifier à la main).
   Mêmes fonctions de lecture que dans l'application (QR, repères, découpe des cadres), exécutées sur le serveur
   pour que le professeur puisse fermer l'application dès que le fichier est envoyé. */
"use strict";
const {createCanvas} = require("@napi-rs/canvas");
const jsQR = require("jsqr");
const window = {jsQR};
const document = {createElement: () => createCanvas(1, 1)};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const CORNERS = {tl:[58, 58], tr:[752, 42], bl:[42, 1081], br:[752, 1081]}; const CSIZE = {tl:84, tr:52, bl:52, br:52};
const LEVELS = ["socle","standard","approfondi"];
const vOf = (q, lvl) => { const v = q.v || {}; if (v[lvl]?.enonce) return v[lvl]; if (v.standard?.enonce) return v.standard; return LEVELS.map(l => v[l]).find(x => x?.enonce) || {enonce:"", corrige:"", criteres:""}; };
const pageQ = pg => Array.isArray(pg) ? pg : (pg?.q || []);
async function nativeQR(){ return []; }
function scaled(cv, maxSide){ const sc = Math.min(1, maxSide / Math.max(cv.width, cv.height)); const o = document.createElement("canvas"); o.width = Math.round(cv.width * sc); o.height = Math.round(cv.height * sc); o.getContext("2d").drawImage(cv, 0, 0, o.width, o.height); return o; }
function crop(cv, x, y, w, h){ const o = document.createElement("canvas"); o.width = Math.round(w); o.height = Math.round(h); o.getContext("2d").drawImage(cv, x, y, w, h, 0, 0, o.width, o.height); return o; }
function flatten(c){ /* divise chaque pixel par la luminosité moyenne autour de lui : ombres et dégradés disparaissent */
  const W = c.width, H = c.height, d = c.getContext("2d").getImageData(0, 0, W, H), p = d.data, g = new Float32Array(W * H), I = new Float64Array((W + 1) * (H + 1));
  for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.3 * p[j] + 0.59 * p[j + 1] + 0.11 * p[j + 2];
  for (let y = 0; y < H; y++){ let row = 0; for (let x = 0; x < W; x++){ row += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  const r = Math.max(8, Math.round(Math.max(W, H) / 14));
  for (let y = 0; y < H; y++){ const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
    for (let x = 0; x < W; x++){ const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
      const m = (I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]) / ((x1 - x0) * (y1 - y0));
      const v = clamp(Math.round(255 * (g[y * W + x] / (m + 1) - 0.55) / 0.4), 0, 255), o = (y * W + x) * 4; p[o] = p[o + 1] = p[o + 2] = v; p[o + 3] = 255; } }
  const o = document.createElement("canvas"); o.width = W; o.height = H; o.getContext("2d").putImageData(d, 0, 0); return o;
}
function jsqrOn(c){ if (!window.jsQR) return null; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height); return jsQR(d.data, c.width, c.height, {inversionAttempts:"attemptBoth"}); }
const centre = L => [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner].reduce((a, q) => [a[0] + q.x / 4, a[1] + q.y / 4], [0, 0]);
async function detectAll(cv){
  const W = cv.width, H = cv.height, found = await nativeQR(cv);
  const add = (data, x, y) => { if (/^TK1/.test(data) && !found.some(f => f.data === data)) found.push({data, x, y}); };
  const corners = () => found.filter(f => f.data.startsWith("TK1C|") || /^TK1W?\|/.test(f.data)).length;
  if (corners() >= 4 || !window.jsQR) return found;
  /* fenêtres de recherche : chaque coin (large puis serré), puis la page entière */
  const wins = [];
  for (const [fx, fy] of [[0, 0], [.5, 0], [0, .62], [.5, .62]]) wins.push([W * fx, H * fy, W * .5, H * .38]);
  for (const [fx, fy] of [[0, 0], [.7, 0], [0, .78], [.7, .78]]) wins.push([W * fx, H * fy, W * .3, H * .22]);
  for (const [x0, y0, w, h] of wins){
    const r0 = crop(cv, x0, y0, w, h);
    for (const [side, flat] of [[1000, false], [1000, true], [1500, false], [700, true]]){
      let r = scaled(r0, side); if (flat) r = flatten(r); const k = r0.width / r.width;
      const q = jsqrOn(r); if (!q || !/^TK1/.test(q.data)) continue;
      const [cx, cy] = centre(q.location); add(q.data, x0 + k * cx, y0 + k * cy); break;
    }
    if (corners() >= 4) break;
  }
  return found;
}
function readQR(cv){
  if (!window.jsQR) return null;
  const tryOn = c => { const r = jsqrOn(c); return r?.data?.startsWith("TK1|") ? r.data : null; };
  const W = cv.width, H = cv.height;
  return tryOn(scaled(cv, 1100)) || tryOn(crop(cv, W * 0.5, 0, W * 0.5, H * 0.4)) || tryOn(crop(cv, 0, 0, W * 0.5, H * 0.4)) || tryOn(flatten(scaled(crop(cv, 0, 0, W * 0.5, H * 0.4), 900)))
    || tryOn(flatten(scaled(crop(cv, W * 0.5, 0, W * 0.5, H * 0.4), 900))) || tryOn(crop(cv, W * 0.5, H * 0.6, W * 0.5, H * 0.4)) || tryOn(flatten(scaled(cv, 1100))) || tryOn(scaled(cv, 1700));
}
function blobMarkers(cv, have){
  const s = 600 / cv.width, c = scaled(cv, Math.max(cv.width, cv.height) * s), W = c.width, H = c.height, d = c.getContext("2d").getImageData(0, 0, W, H).data;
  const I = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++){ let row = 0; for (let x = 0; x < W; x++){ const o = (y * W + x) * 4; row += (0.3 * d[o] + 0.59 * d[o + 1] + 0.11 * d[o + 2]) < 140 ? 1 : 0; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
  const sum = (x0, y0, x1, y1) => { x0 = clamp(Math.round(x0), 0, W); x1 = clamp(Math.round(x1), 0, W); y0 = clamp(Math.round(y0), 0, H); y1 = clamp(Math.round(y1), 0, H);
    return x1 <= x0 || y1 <= y0 ? 0 : I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0]; };
  const out = [];
  for (const k of Object.keys(CORNERS)){
    if (have.includes(k)) continue;
    const e = CSIZE[k] / 794 * W, [cx, cy] = CORNERS[k], gx = cx / 794 * W, gy = cy / 1123 * H; let best = null;
    for (const f of [0.85, 1, 1.15]){ const z = e * f, m = z * 0.3;
      for (let y = Math.max(0, gy - 0.12 * H); y < Math.min(H - z, gy + 0.12 * H); y += 2) for (let x = Math.max(0, gx - 0.15 * W); x < Math.min(W - z, gx + 0.15 * W); x += 2){
        const dark = sum(x, y, x + z, y + z) / (z * z); if (dark < 0.3) continue;
        const ringA = (z + 2 * m) * (z + 2 * m) - z * z, ring = (sum(x - m, y - m, x + z + m, y + z + m) - sum(x, y, x + z, y + z)) / ringA;
        const sc = dark - 2.5 * ring; if (!best || sc > best.sc) best = {sc, x:x + z / 2, y:y + z / 2, ring}; } }
    if (best && best.ring < 0.08 && best.sc > 0.2) out.push({data:k === "tl" ? "TK1|?" : "TK1C|" + k, x:best.x / s, y:best.y / s, blob:true});
  }
  return out;
}
function markersOk(found){
  const m = {}; found.forEach(f => { const k = /^TK1W?\|/.test(f.data) ? "tl" : f.data.startsWith("TK1C|") && f.data.slice(5); if (CORNERS[k]) m[k] = [f.x, f.y]; });
  if (Object.keys(m).length < 4) return Object.keys(m).length >= 3;
  const D = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), C = CORNERS;
  const r1 = (D(m.tl, m.tr) / D(m.bl, m.br)), r2 = (D(m.tl, m.bl) / D(m.tr, m.br)), asp = D(m.tl, m.tr) / D(m.tl, m.bl), want = D(C.tl, C.tr) / D(C.tl, C.bl);
  return Math.abs(r1 - 1) < 0.12 && Math.abs(r2 - 1) < 0.12 && Math.abs(asp / want - 1) < 0.15;
}
const levD = (a, b) => { const d = Array.from({length:a.length + 1}, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
function closest(id, list){ let best = null, bd = 99; for (const x of list){ const v = levD(id, x); if (v < bd){ bd = v; best = x; } } return bd <= 2 ? best : null; }
function solve(A, b){ const n = b.length; A = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++){ let m = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[m][i])) m = k; [A[i], A[m]] = [A[m], A[i]];
    for (let k = i + 1; k < n; k++){ const f = A[k][i] / A[i][i]; for (let j = i; j <= n; j++) A[k][j] -= f * A[i][j]; } }
  const x = Array(n).fill(0); for (let i = n - 1; i >= 0; i--){ let s = A[i][n]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; } return x; }
function homography(src, dst){ const A = [], b = [];
  for (let i = 0; i < 4; i++){ const [x, y] = src[i], [u, v] = dst[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
  return [...solve(A, b), 1]; }
const applyH = (H, x, y) => { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; };
function sheetToPhoto(found){
  const m = {}; found.forEach(f => { const k = /^TK1W?\|/.test(f.data) ? "tl" : f.data.startsWith("TK1C|") && f.data.slice(5); if (CORNERS[k]) m[k] = [f.x, f.y]; });
  const ks = Object.keys(m); if (ks.length < 2) return null;
  if (ks.length === 2){ /* 2 repères seulement (scanner, feuille à plat) : rotation + échelle + décalage */
    const [[x1, y1], [x2, y2]] = ks.map(k => CORNERS[k]), [[u1, v1], [u2, v2]] = ks.map(k => m[k]);
    const dx = x2 - x1, dy = y2 - y1, du = u2 - u1, dv = v2 - v1, n = dx * dx + dy * dy; if (n < 1e4) return null;
    const a = (du * dx + dv * dy) / n, b = (dv * dx - du * dy) / n; /* u = a·x − b·y + tx ; v = b·x + a·y + ty */
    return [a, -b, u1 - a * x1 + b * y1, b, a, v1 - b * x1 - a * y1, 0, 0, 1]; }
  if (ks.length === 3){ /* affine from the 3 known markers */
    const A = [], bb = []; ks.forEach(k => { const [x, y] = CORNERS[k], [u, v] = m[k]; A.push([x, y, 1, 0, 0, 0]); bb.push(u); A.push([0, 0, 0, x, y, 1]); bb.push(v); });
    return [...solve(A, bb), 0, 0, 1]; }
  const K = ["tl","tr","bl","br"]; return homography(K.map(k => CORNERS[k]), K.map(k => m[k]));
}
function warpBox(cv, H, bx, pad = 8){
  const x0 = bx.x - pad, y0 = bx.y - pad, w = bx.w + 2 * pad, h = bx.h + 2 * pad;
  const [ax, ay] = applyH(H, x0, y0), [bx2, by2] = applyH(H, x0 + w, y0);
  const srcScale = Math.hypot(bx2 - ax, by2 - ay) / w; const k = clamp(srcScale, 1, 1400 / w);
  const W = Math.round(w * k), Hh = Math.round(h * k);
  const src = pix(cv), SW = cv.width, SH = cv.height;
  const out = document.createElement("canvas"); out.width = W; out.height = Hh; const oc = out.getContext("2d"), od = oc.createImageData(W, Hh);
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++){
    const [sx, sy] = applyH(H, x0 + (i + .5) / k, y0 + (j + .5) / k); const X = sx | 0, Y = sy | 0, o = (j * W + i) * 4;
    if (X < 0 || Y < 0 || X >= SW || Y >= SH){ od.data[o] = od.data[o + 1] = od.data[o + 2] = 255; od.data[o + 3] = 255; continue; }
    const q = (Y * SW + X) * 4; od.data[o] = src[q]; od.data[o + 1] = src[q + 1]; od.data[o + 2] = src[q + 2]; od.data[o + 3] = 255; }
  oc.putImageData(od, 0, 0); return out;
}
function maskHeader(cv, H, boxes){
  const top = Math.max(0, Math.min(...boxes.map(b => b.y)) - 6);
  const o = document.createElement("canvas"); o.width = cv.width; o.height = cv.height; const g = o.getContext("2d"); g.drawImage(cv, 0, 0);
  if (!isFinite(top) || top <= 0) return o;
  const pts = [[-40, -40], [834, -40], [834, top], [-40, top]].map(([x, y]) => applyH(H, x, y));
  g.fillStyle = "#fff"; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); return o;
}
function inkRatio(cv, H, b){ /* part de pixels foncés dans le cadre (lignes grises et bordure exclues) */
  const d = pix(cv), SW = cv.width, SH = cv.height; let dark = 0, n = 0;
  for (let j = 0; j < 24; j++) for (let i = 0; i < 80; i++){
    const [x, y] = applyH(H, b.x + b.w * (0.04 + 0.92 * i / 79), b.y + b.h * (0.06 + 0.88 * j / 23)); const X = x | 0, Y = y | 0;
    if (X < 0 || Y < 0 || X >= SW || Y >= SH) continue; const o = (Y * SW + X) * 4; n++; if (0.3 * d[o] + 0.59 * d[o + 1] + 0.11 * d[o + 2] < 110) dark++; }
  return n ? dark / n : 1;
}
function pix(cv){ if (!cv._d) cv._d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; return cv._d; }
function readMarks(cv, H, b){
  const d = pix(cv), SW = cv.width, SH = cv.height, ratios = (b.cases || []).map(cs => {
    let dark = 0, n = 0;
    for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++){
      const [x, y] = applyH(H, cs.x + cs.w * (0.22 + 0.56 * i / 11), cs.y + cs.h * (0.22 + 0.56 * j / 11)); const X = x | 0, Y = y | 0;
      if (X < 0 || Y < 0 || X >= SW || Y >= SH) continue; const o = (Y * SW + X) * 4; n++; if (0.3 * d[o] + 0.59 * d[o + 1] + 0.11 * d[o + 2] < 125) dark++; }
    return n ? dark / n : 0; });
  return {coches: ratios.map((r, j) => r > 0.14 ? j : -1).filter(j => j >= 0), ambigu: ratios.some(r => r > 0.05 && r <= 0.14), ratios};
}
function boxScore(cv, H, boxes){
  const d = pix(cv), SW = cv.width, SH = cv.height; let hit = 0, n = 0;
  const lum = (x, y) => { const [u, v] = applyH(H, x, y), X = u | 0, Y = v | 0; if (X < 0 || Y < 0 || X >= SW || Y >= SH) return 255; const o = (Y * SW + X) * 4; return 0.3 * d[o] + 0.59 * d[o + 1] + 0.11 * d[o + 2]; };
  for (const b of boxes || []){ if (!(b.w > 20 && b.h > 20)) continue;
    const edges = [[b.x, b.y, b.x + b.w, b.y, 0, 1], [b.x, b.y + b.h, b.x + b.w, b.y + b.h, 0, 1], [b.x, b.y, b.x, b.y + b.h, 1, 0], [b.x + b.w, b.y, b.x + b.w, b.y + b.h, 1, 0]];
    for (const [x0, y0, x1, y1, px, py] of edges) for (let t = 0.12; t <= 0.88; t += 0.04){
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t; let m = 255;
      for (let k = -3; k <= 3; k++) m = Math.min(m, lum(x + px * k, y + py * k));
      n++; if (m < 150) hit++; } }
  return n ? hit / n : 0;
}

/* ---------- Pipeline serveur : un fichier (PDF ou image) → pages identifiées, découpées, confiées à la correction ---------- */
const toJpeg = (cv, q = 0.82) => cv.encode("jpeg", Math.round(q * 100));
let PDFJS = null;
async function pdfjs(){ if (!PDFJS) PDFJS = await import("pdfjs-dist/legacy/build/pdf.mjs"); return PDFJS; }
const PDF_BASE = require("path").dirname(require.resolve("pdfjs-dist/package.json")) + "/";

async function openFile(buf, mime){
  if (mime === "application/pdf" || buf.slice(0, 5).toString() === "%PDF-"){
    const lib = await pdfjs();
    const pdf = await lib.getDocument({data:new Uint8Array(buf), isEvalSupported:false, wasmUrl:PDF_BASE + "wasm/", standardFontDataUrl:PDF_BASE + "standard_fonts/"}).promise;
    return {n:pdf.numPages, page:async i => { const pg = await pdf.getPage(i); const vp = pg.getViewport({scale:2000 / Math.max(pg.view[2], pg.view[3])});
      const cc = pdf.canvasFactory.create(Math.round(vp.width), Math.round(vp.height)); await pg.render({canvasContext:cc.context, viewport:vp, canvas:cc.canvas}).promise; pg.cleanup(); return cc.canvas; },
      close:() => pdf.destroy()};
  }
  const {loadImage} = require("@napi-rs/canvas"); const im = await loadImage(buf);
  const sc = Math.min(1, 2200 / Math.max(im.width, im.height)), cv = createCanvas(Math.round(im.width * sc), Math.round(im.height * sc));
  cv.getContext("2d").drawImage(im, 0, 0, cv.width, cv.height);
  return {n:1, page:async () => cv, close:() => {}};
}

async function footerId(cv, ctx){
  const W = cv.width, H = cv.height, strip = scaled(crop(cv, 0, H * 0.9, W, H * 0.1), 1600);
  const r = await ctx.footerAI(await toJpeg(strip, 0.9));
  const m = String(r?.ligne || "").toLowerCase().replace(/\s+/g, "").match(/([a-z0-9]{8,16})[·.•:\-|,]+([a-z0-9]{5,12})/); if (!m) return null;
  const cid = closest(m[1], ctx.controls()); if (!cid) return null;
  const f = ctx.doc("feuilles/" + cid); const eid = closest(m[2], Object.keys(f?.copies || {})); if (!eid) return null;
  const pn = +((String(r.page ?? "").match(/\d+/) || [])[0] || (String(r.ligne || "").match(/page\s*(\d+)/i) || [])[1] || 0);
  const nP = (f.copies[eid].pages || []).length || 1;
  return `TK1|${cid}|${eid}|${pn >= 1 && pn <= nP ? pn : 0}`;
}

function qcmFrom(q, ver, coches, ambigu, T){
  const v = vOf(q, ver), L = "ABCDEFGH", good = new Set((v.bonnes || []).map(Number)), got = [...new Set(coches)].sort();
  const ok = got.length === good.size && got.every(j => good.has(j)), co = T.coche || "Coché : ", au = T.aucune || "aucune case";
  return {transcription:co + (got.map(j => L[j]).join(", ") || au), annot:co + (got.map(j => good.has(j) ? L[j] : `⟦${L[j]}⟧`).join(", ") || `⟦${au}⟧`),
    lisible:!ambigu, noteIA:ok ? +q.points : 0, note:null, commentaire:ok ? (T.bonne || "Bonne réponse.") : (T.etait || "La bonne réponse était : ") + [...good].sort().map(j => L[j]).join(", ") + ".",
    erreurs:ok ? [] : [T.qcmFaux || "réponse QCM incorrecte"], acquis:ok ? [q.notion || "QCM"] : [], valide:false, auto:true};
}

/* Une page : identification, vérification de la page, découpe, puis tâche de correction */
async function analysePage(cv, ctx, st){
  const T = ctx.kit.txt || {};
  let data = null, found = [];
  if (st.qrBad >= 2){ data = await footerId(cv, ctx); }
  if (!data){ found = await detectAll(cv); data = found.find(f => /^TK1W?\|/.test(f.data))?.data || readQR(cv);
    if (data) st.qrBad = 0; else { data = await footerId(cv, ctx); if (data) st.qrBad++; } }
  if (!data) return {status:"manuel", msg:"qr"};
  if (data.startsWith("TK1W|")) return {status:"manuel", msg:"ecriture"};
  const [, cid, eid, p] = data.split("|"); let page = +p || 0;
  const c = ctx.doc("controles/" + cid), f = ctx.doc("feuilles/" + cid), cp = f?.copies?.[eid];
  if (!c || !cp || !ctx.allowed(cid)) return {status:"manuel", msg:"inconnu", cid, eid};
  const have = found.map(x => /^TK1W?\|/.test(x.data) ? "tl" : x.data.startsWith("TK1C|") ? x.data.slice(5) : "").filter(Boolean);
  let fnd = found;
  if (have.length < 4 && (cp.pages || []).some(pg => pg?.b?.length)){ const extra = blobMarkers(cv, have), all = fnd.concat(extra); if (extra.length && markersOk(all)) fnd = all; }
  let Hm = sheetToPhoto(fnd);
  if (Hm && cp.pages?.length){
    const sc = cp.pages.map(pg => (pg?.b || []).length ? boxScore(cv, Hm, pg.b) : 0);
    let best = page >= 1 ? page : 1; sc.forEach((v, i) => { if (v > sc[best - 1] + 0.1 || (page === 0 && v > sc[best - 1])) best = i + 1; });
    page = best; if (sc[page - 1] < 0.45) Hm = null;
  }
  const pg = cp.pages?.[page - 1], qids = pageQ(pg); let boxes = pg?.b || [];
  if (page < 1 || !qids.length) return {status:"manuel", msg:"page", cid, eid};
  if (!boxes.length) Hm = null;
  const res = {cid, eid, page};
  /* image de la page (consultable dans la correction) */
  const scanId = await ctx.saveAsset(await toJpeg(scaled(cv, 1700), 0.8));
  const upd = {copies:{[eid]:{scans:{[page]:{asset:scanId, url:"/api/files/" + scanId, at:new Date().toISOString()}}, answers:{}, validee:false}}};
  const qcmB = Hm ? boxes.filter(b => b.type === "qcm") : [];
  const aiQ = qids.filter(id => !qcmB.some(b => b.q === id));
  const fixed = {}, crops = {};
  for (const b of qcmB){ const q = c.questions.find(x => x.id === b.q); if (!q) continue; const mk = readMarks(cv, Hm, b);
    const a = qcmFrom(q, cp.version?.[b.q] || "standard", mk.coches, mk.ambigu, T); a.crop = await ctx.saveAsset(await toJpeg(warpBox(cv, Hm, b))); upd.copies[eid].answers[b.q] = a; }
  if (Hm) for (const b of boxes) if (b.type !== "qcm" && aiQ.includes(b.q) && inkRatio(cv, Hm, b) < 0.0008)
    fixed[b.q] = {transcription:"", annot:"", lisible:true, noteIA:0, note:null, commentaire:T.vide0 || "Pas de réponse.", erreurs:[T.videTag || "pas de réponse"], acquis:[], valide:false, auto:true};
  const P = ctx.kit.prompts?.[cid]?.[eid]?.[page];
  if (aiQ.length && !P) return {...res, status:"manuel", msg:"kit"};
  let images = [], prompt = "", mode = "";
  const aiB = boxes.filter(b => aiQ.includes(b.q));
  if (aiQ.length){
    if (Hm && aiB.length === aiQ.length && P.crops && P.crops.qids.join() === aiQ.join()){
      mode = "crops"; for (const qid of aiQ){ const b = aiB.find(x => x.q === qid); const id = await ctx.saveAsset(await toJpeg(warpBox(cv, Hm, b), 0.88)); crops[qid] = id; images.push(id); }
      prompt = P.crops.prompt;
    } else {
      mode = "halves"; const big = scaled(Hm ? maskHeader(cv, Hm, boxes) : cv, 2200), W = big.width, H = big.height;
      images.push(await ctx.saveAsset(await toJpeg(crop(big, 0, 0, W, H * 0.56)))); images.push(await ctx.saveAsset(await toJpeg(crop(big, 0, H * 0.44, W, H * 0.56))));
      prompt = P.halves.prompt;
    }
  }
  for (const qid in fixed){ const fb = boxes.find(b => b.q === qid); fixed[qid].crop = crops[qid] || (Hm && fb ? await ctx.saveAsset(await toJpeg(warpBox(cv, Hm, fb), 0.88)) : null); upd.copies[eid].answers[qid] = fixed[qid]; }
  ctx.patch("feuilles/" + cid, upd);
  if (c.statut === "imprime") ctx.patch("controles/" + cid, {statut:"correction"});
  const toGrade = (mode === "halves" ? (P.halves.qids || aiQ) : aiQ).filter(q => !fixed[q] && !upd.copies[eid].answers[q]);
  if (!toGrade.length) return {...res, status:"fait", job:null, hm:!!Hm};
  const qs = toGrade.map(qid => { const q = c.questions.find(x => x.id === qid); if (!q) return null; const ver = cp.version?.[qid] || "standard";
    return {id:qid, points:+q.points, type:q.type === "qcm" ? "qcm" : "", good:vOf(q, ver).bonnes || [], notion:q.notion || "", crop:crops[qid] || null}; }).filter(Boolean);
  const job = ctx.addJob({ctrlId:cid, eleveId:eid, page, prompt:prompt + (ctx.kit.jsonOnly || ""), images, qs, bonus:!!((+c.bonus?.proprete || 0) + (+c.bonus?.orthographe || 0)), txt:T});
  return {...res, status:"serveur", job, hm:!!Hm};
}

async function analyseFile(buf, mime, ctx){
  const doc = await openFile(buf, mime), st = {qrBad:0};
  ctx.setTotal(doc.n);
  try {
    for (let i = 1; i <= doc.n; i++){
      if (ctx.done(i)) continue;
      let r; try { const cv = await doc.page(i); r = await analysePage(cv, ctx, st); cv.width = cv.height = 0; }
      catch(e){ console.warn("Analyse page", i, e.message); r = {status:"erreur", msg:"erreur:" + e.message}; if (e.quota) { ctx.pageDone(i, r); throw e; } }
      ctx.pageDone(i, r);
    }
  } finally { doc.close(); }
}
module.exports = {analyseFile};
