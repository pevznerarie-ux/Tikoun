
/* ---------- Pipeline serveur : un fichier (PDF ou image) → pages identifiées, découpées, confiées à la correction ---------- */
const toJpeg = (cv, q = 0.82) => cv.encode("jpeg", Math.round(q * 100));
let PDFJS = null;
async function pdfjs(){ if (!PDFJS) PDFJS = await import("pdfjs-dist/legacy/build/pdf.mjs"); return PDFJS; }
const PDF_BASE = require("path").dirname(require.resolve("pdfjs-dist/package.json")) + "/";

/* Dimensions lues dans l'en-tête (PNG, JPEG) avant tout décodage : une image géante ne remplit pas la mémoire du serveur */
function imageSize(b){
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return {w:b.readUInt32BE(16), h:b.readUInt32BE(20)};
  if (b[0] === 0xFF && b[1] === 0xD8){ let i = 2; while (i + 9 < b.length){ if (b[i] !== 0xFF){ i++; continue; } const m = b[i + 1];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return {w:b.readUInt16BE(i + 7), h:b.readUInt16BE(i + 5)};
    if (m === 0xD8 || (m >= 0xD0 && m <= 0xD7) || m === 0x01){ i += 2; continue; } i += 2 + b.readUInt16BE(i + 2); } }
  return null;
}
async function openFile(buf, mime){
  if (mime === "application/pdf" || buf.slice(0, 5).toString() === "%PDF-"){
    const lib = await pdfjs();
    const task = lib.getDocument({data:new Uint8Array(buf), isEvalSupported:false, maxImageSize:40e6, wasmUrl:PDF_BASE + "wasm/", standardFontDataUrl:PDF_BASE + "standard_fonts/"}), pdf = await task.promise;
    return {n:pdf.numPages, page:async i => { const pg = await pdf.getPage(i); const pw = Math.abs(pg.view[2] - pg.view[0]), ph = Math.abs(pg.view[3] - pg.view[1]);
      if (!(pw > 10 && ph > 10) || Math.max(pw, ph) / Math.min(pw, ph) > 8) throw new Error("format de page non pris en charge");
      const vp = pg.getViewport({scale:2000 / Math.max(pw, ph)});
      const cc = pdf.canvasFactory.create(Math.round(vp.width), Math.round(vp.height)); await pg.render({canvasContext:cc.context, viewport:vp, canvas:cc.canvas}).promise; pg.cleanup(); return cc.canvas; },
      close:() => task.destroy()};
  }
  const dim = imageSize(buf); if (dim && dim.w * dim.h > 80e6) throw new Error("Image trop grande (" + Math.round(dim.w * dim.h / 1e6) + " mégapixels) : réduis-la.");
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
  found = await detectAll(cv); data = found.find(f => /^TK1W?\|/.test(f.data))?.data || readQR(cv);
  if (!data && (st.footFail || 0) < 12){ try { data = await footerId(cv, ctx); } catch(e){ if (e.quota) throw e; console.warn("Bas de page (IA)", e.message); data = null; }
    st.footFail = data ? 0 : (st.footFail || 0) + 1; }   // une douzaine d'échecs de suite : ce fichier n'est pas un lot de copies, on arrête d'appeler l'IA
  if (!data) return {status:"manuel", msg:"qr"};
  if (data.startsWith("TK1W|")) return {status:"manuel", msg:"ecriture"};
  const [, cid, eid, p] = data.split("|"); let page = +p || 0;
  const c = ctx.doc("controles/" + cid), f = ctx.doc("feuilles/" + cid), cp = f?.copies?.[eid];
  if (!c || !cp || !ctx.allowed(cid)) return {status:"manuel", msg:"inconnu", cid, eid};
  /* Copie déjà validée par le professeur : un nouveau dépôt du même fichier ne la modifie pas (« Recommencer le scan » pour la refaire) */
  if (cp.validee) return {status:"fait", msg:"validee", cid, eid, page, job:null};
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
      mode = "halves"; const big = scaled(Hm ? maskHeader(cv, Hm, boxes) : maskTop(cv, page), 2200), W = big.width, H = big.height;
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
    if (doc.n > 600) throw new Error("Fichier trop long (" + doc.n + " pages, 600 au plus) : découpe-le.");
    for (let i = 1; i <= doc.n; i++){
      if (ctx.done(i)) continue;
      await new Promise(r => setImmediate(r));   // laisse le serveur répondre aux autres (élèves, professeurs) entre deux pages
      ctx.pageStart?.(i);
      let r; try { const cv = await doc.page(i); r = await analysePage(cv, ctx, st); cv.width = cv.height = 0; }
      catch(e){ console.warn("Analyse page", i, e.message); r = {status:"erreur", msg:"erreur:" + e.message}; if (e.quota) { ctx.pageDone(i, r); throw e; } }
      ctx.pageDone(i, r);
    }
  } finally { doc.close(); }
}
module.exports = {analyseFile};
