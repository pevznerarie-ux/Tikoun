
/* ================= Shared: document pages → PDF ================= */
function docPages(headHTML, blocks, footTxt){
  const stage = $("#sheetStage"); const pages = [];
  const np = () => { const p = document.createElement("div"); p.className = "sheet doc"; p.innerHTML = pages.length ? "" : headHTML;
    const f = document.createElement("div"); f.className = "sh-foot"; f.innerHTML = `<span>${esc(footTxt)}</span><span class="pn"></span>`; p.append(f); stage.append(p); pages.push(p); return p; };
  let page = np();
  for (const html of blocks){
    const b = document.createElement("div"); b.className = "sh-q"; b.innerHTML = html; page.insertBefore(b, page.querySelector(".sh-foot"));
    if (b.offsetTop + b.offsetHeight > 1123 - 70 && page.querySelectorAll(".sh-q").length > 1){ b.remove(); page = np(); page.insertBefore(b, page.querySelector(".sh-foot")); }
  }
  pages.forEach((p, i) => { p.querySelector(".pn").textContent = `page ${i + 1} / ${pages.length}`; });
  return pages;
}
async function buildPdf(builders, filename, st){
  if (!window.html2canvas || !window.jspdf){ st.textContent = "Bibliothèques PDF non chargées : recharge la page."; return false; }
  const ov = document.createElement("div"); ov.className = "zoom"; ov.style.alignItems = "center"; ov.innerHTML = `<div id="ovm" style="font-size:16px;color:#fff">Préparation…</div>`; document.body.append(ov);
  const stage = $("#sheetStage"); stage.style.left = "0"; stage.style.zIndex = "40";
  try{
    await document.fonts.ready;
    const pdf = new jspdf.jsPDF({unit:"pt", format:"a4"}); let first = true;
    for (let k = 0; k < builders.length; k++){
      stage.innerHTML = ""; const {pages, label} = builders[k]();
      await Promise.all($$("img", stage).map(im => im.decode ? im.decode().catch(() => {}) : null));
      for (let i = 0; i < pages.length; i++){
        $("#ovm").textContent = `${label} · ${k + 1} / ${builders.length}`;
        const cv = await html2canvas(pages[i], {scale:2, backgroundColor:"#ffffff", logging:false, scrollX:0, scrollY:-window.scrollY, windowWidth:900, useCORS:true, onclone:(doc, el) => fixBidiForCanvas(el)});
        if (!first) pdf.addPage(); first = false; pdf.addImage(cv.toDataURL("image/jpeg", 0.88), "JPEG", 0, 0, 595.28, 841.89);
      }
    }
    const blob = pdf.output("blob"); ov.remove();
    if (!DL){ st.textContent = "Téléchargement indisponible dans cette vue : ouvre l'application dans claude.ai."; return false; }
    try { await DL.save({filename:filename.replace(/[\\/:*?"<>|]/g, "-"), data:blob}); st.textContent = "PDF prêt."; return true; }
    catch(e){ st.textContent = e?.code === "declined" ? "Téléchargement annulé." : "Téléchargement impossible dans cette vue."; return false; }
  }catch(e){ console.error(e); st.textContent = "Échec de génération du PDF."; return false; }
  finally{ ov.remove(); stage.style.left = "-12000px"; stage.innerHTML = ""; }
}

/* ================= 1. Copie rendue à l'élève ================= */
function renduPages(c, e){
  const cp = feuille(c.id)?.copies?.[e.id], max = maxOf(c), cl = classe(c.classeId), b = bonusOf(c, cp);
  const rows = studentsOf(c).filter(x => !isAbs(c, x)).map(x => feuille(c.id)?.copies?.[x.id]).filter(k => copyDone(c, k));
  const moy = rows.length ? rows.reduce((a, k) => a + final20(c, k), 0) / rows.length : null;
  const ratt = store.controles.find(x => x.type === "rattrapage" && x.parentId === c.id && x.eleves?.includes(e.id));
  const head = `<div class="sh-head"><div><div class="sh-school">${esc(enteteOf(c))}</div>
    <div class="sh-title" dir="auto">Copie corrigée · ${esc(c.titre)}</div>
    <div class="sh-meta">${esc(c.matiere)} · ${esc(cl?.nom || "")}${c.date ? " · " + esc(frDate(c.date)) : ""}</div>
    <div class="sh-name">Élève : <b>${esc(e.prenom)} ${esc(e.nom)}</b></div></div></div>
    <div class="rd-note"><span class="rd-big">${nv(final20(c, cp))}</span><span>${sfxN(final20(c, cp))}</span>
      <span class="rd-sub">${[bonusMax(c) ? `note brute ${fmt(on20(copyTotal(c, cp), max))} · bonus propreté ${fmt(b.proprete)} · bonus orthographe ${fmt(b.orthographe)}` : "", moy != null ? `moyenne de la classe ${noteS(moy)}` : ""].filter(Boolean).join(" · ")}</span></div>`;
  const blocks = c.questions.map((q, k) => { const a = cp?.answers?.[q.id], v = vOf(q, cp?.version?.[q.id] || "standard");
    return `<div class="sh-qh"><span>Question ${k + 1}${q.notion ? " · " + esc(q.notion) : ""}</span><span class="rd-q">${fmt(noteOf(a))} / ${fmt(+q.points)}</span></div>
      <div class="sh-qt" dir="auto">${esc(v.enonce)}</div>
      ${a?.crop ? `<img class="rd-crop" alt="" src="${esc(blobSrc(a.crop))}">` : ""}
      ${a?.commentaire ? `<div class="rd-com" dir="auto">${esc(a.commentaire)}</div>` : ""}
      ${(a?.acquis || []).length ? `<div class="rd-tag">Acquis : ${esc(a.acquis.join(", "))}</div>` : ""}
      ${(a?.erreurs || []).length ? `<div class="rd-tag">À retravailler : ${esc(a.erreurs.join(", "))}</div>` : ""}`; });
  if (ratt) blocks.push(`<div class="sh-cons">Une feuille de rattrapage personnelle t'a été préparée : « ${esc(ratt.titre)} ». Fais-la sérieusement, elle cible exactement tes erreurs.</div>`);
  return docPages(head, blocks, `Mastery · copie corrigée · ${e.prenom} ${e.nom}`);
}

/* ================= 2. Suivi par notion ================= */
const nkey = s => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const slug = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-");
function notionStats(cl, mat){
  const cs = store.controles.filter(c => c.classeId === cl.id && c.matiere === mat);
  const labels = {}, per = {}, count = {};
  for (const c of cs){ const f = feuille(c.id); if (!f) continue;
    for (const e of cl.eleves || []){ const cp = f.copies?.[e.id]; if (!cp?.validee || isAbs(c, e)) continue;
      for (const q of c.questions || []){ const n = noteOf(cp.answers?.[q.id]); if (n == null || !+q.points) continue;
        const k = nkey(q.notion) || "(sans notion)"; labels[k] = labels[k] || q.notion || "(sans notion)"; count[k] = (count[k] || 0) + 1;
        const o = ((per[e.id] = per[e.id] || {})[k] = per[e.id]?.[k] || {s:0, n:0}); o.s += n / q.points; o.n++; } } }
  return {cs, labels, per, notions:Object.keys(count).sort((a, b) => count[b] - count[a])};
}
function studentCtrls(cl, mat, e){
  return store.controles.filter(c => c.classeId === cl.id && c.matiere === mat).map(c => ({c, cp:feuille(c.id)?.copies?.[e.id]})).filter(x => copyDone(x.c, x.cp) && !isAbs(x.c, e))
    .sort((a, b) => (a.c.date || a.c.createdAt || "").localeCompare(b.c.date || b.c.createdAt || ""));
}
function vSuivi(){
  const head = `<div class="head"><div><h2>Suivi des élèves</h2><p>Ouvre une classe pour voir la maîtrise de chaque notion (copies validées) et les exercices en ligne. Réduis-la pour passer à une autre.</p></div></div>`;
  if (!store.classes.length) return head + `<div class="panel empty">Crée d'abord une classe.</div>`;
  S.su = S.su || {};
  if (!("suivi" in S.acc)) S.acc.suivi = [classe(S.su.cl)?.id || store.classes[0].id];
  const sum = cl => { const n = store.controles.filter(c => c.classeId === cl.id && isCtrl(c)).length, q = (store.quizzes || []).filter(x => x.classeId === cl.id).length; return `${(cl.eleves || []).length} élèves · ${n} contrôle(s)${q ? " · " + q + " quiz" : ""}`; };
  return head + classAcc("suivi", store.classes, sum, cl => { S.su.cl = cl.id; return vSuiviBase() + (typeof quizSuivi === "function" ? quizSuivi() : ""); }, false);
}
/* ---------- Année scolaire : trimestres (ou semestres) et coefficients ---------- */
const ctrlDay = c => String(c.date || c.createdAt || "").slice(0, 10);
const yearOf = d => { if (!/^\d{4}-\d\d/.test(d || "")) return null; const y = +d.slice(0, 4); return +d.slice(5, 7) >= 8 ? y : y - 1; };   // l'année scolaire commence en août
const yearLab = y => y + "-" + (y + 1);
const curYear = () => yearOf(new Date().toISOString().slice(0, 10));
const isSem = () => prefs().periodes?.mode === "sem";
const bornes = () => { const P = prefs().periodes || {}; return isSem() ? [P.s2 || "02-01"] : [P.t2 || "12-01", P.t3 || "03-15"]; };
const perKey = md => (+md.slice(0, 2) >= 8 ? "0" : "1") + md;   // ordre de l'année scolaire : septembre … août
const periodOf = d => bornes().filter(b => perKey(d.slice(5, 10)) >= perKey(b)).length;
const perLab = i => (isSem() ? "Semestre " : "Trimestre ") + (i + 1);
const perAbr = i => (isSem() ? "S" : "T") + (i + 1);
const coefOf = c => +c.coef > 0 ? +c.coef : 1;
const noteDe = (c, e) => { const cp = feuille(c.id)?.copies?.[e.id]; return copyDone(c, cp) && !isAbs(c, e) ? noteRetenue(c, e)?.retenue ?? final20(c, cp) : null; };
/* Case d'un contrôle : la note, « Abs. », « ? » pour une copie scannée dont une question n'a pas encore de note, « — » sans copie */
const etatDe = (c, e) => { if (isAbs(c, e)) return "abs"; const cp = feuille(c.id)?.copies?.[e.id]; return copyDone(c, cp) ? "ok" : cp && Object.keys(cp.answers || {}).length ? "incomplete" : "none"; };
const noteCell = (c, e) => { const st = etatDe(c, e); if (st === "ok"){ const v = noteDe(c, e); return `<td class="c"><span class="cell ${tone(v / 20)}">${nv(v)}</span></td>`; }
  return st === "abs" ? `<td class="c"><span class="cell none" title="Absent">Abs.</span></td>` : st === "incomplete" ? `<td class="c"><span class="cell warn" title="${esc("Copie scannée, mais au moins une question n'a pas de note : à relire dans Correction")}">?</span></td>` : `<td class="c"><span class="cell none" title="Pas de copie">—</span></td>`; };
const wavg = xs => { const v = xs.filter(x => x.v != null), w = v.reduce((a, x) => a + x.w, 0); return w ? v.reduce((a, x) => a + x.v * x.w, 0) / w : null; };
const mean = xs => { const v = xs.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
function yearCtrls(cl, mat, y){ return store.controles.filter(c => c.classeId === cl.id && c.matiere === mat && isCtrl(c) && yearOf(ctrlDay(c)) === y).sort((a, b) => ctrlDay(a).localeCompare(ctrlDay(b))); }
function yearsOf(cl, mat){ const s = new Set(store.controles.filter(c => c.classeId === cl.id && c.matiere === mat && isCtrl(c)).map(c => yearOf(ctrlDay(c))).filter(y => y != null)); s.add(curYear()); return [...s].sort((a, b) => b - a); }
/* Notes d'un élève, moyennes par période et sur l'année, pondérées par les coefficients (rattrapage compris) */
function moyennes(cs, e){ const rows = cs.map(c => ({c, v:noteDe(c, e), w:coefOf(c), p:periodOf(ctrlDay(c))}));
  return {rows, per:Array.from({length:bornes().length + 1}, (_, i) => wavg(rows.filter(r => r.p === i))), an:wavg(rows)}; }
/* Compétences : part des points obtenus sur les questions qui évaluent chaque compétence */
function compStats(cs, e){ const acc = {};
  for (const c of cs){ const cp = feuille(c.id)?.copies?.[e.id]; if (!copyDone(c, cp) || isAbs(c, e)) continue;
    for (const q of c.questions || []){ const n = noteOf(cp.answers?.[q.id]); if (n == null || !+q.points) continue;
      for (const k of q.comps || []){ const o = acc[k] = acc[k] || {s:0, p:0}; o.s += n; o.p += +q.points; } } }
  return Object.fromEntries(Object.keys(COMPS).map(k => [k, acc[k] ? acc[k].s / acc[k].p : null])); }
const maiCell = r => { const m = MAITRISE(r); return m ? `<span class="cell ${m.t}" title="${esc(m.l)} · ${pct(r)}">${MAI_ABR[m.k]}</span>` : `<span class="cell none">—</span>`; };

/* ---------- Signaux à observer : des faits tirés des notes et des copies, jamais un diagnostic. Vus du seul professeur. ---------- */
function signaux(cl, mat, e, y){
  const out = [], cs = yearCtrls(cl, mat, y), M = moyennes(cs, e), done = M.rows.filter(r => r.v != null), cpOf = c => feuille(c.id).copies[e.id];
  const add = (k, txt, c) => out.push({k, txt, c, lvl:"obs"});
  if (done.length >= 3){ const last = done[done.length - 1], m = mean(done.slice(0, -1).map(r => r.v));
    if (last.v <= m - 4) add("chute|" + last.c.id, `Chute : ${noteS(last.v)} à « ${last.c.titre} », pour une moyenne de ${noteS(m)} avant.`, last.c);
    const [a, b, d] = done.slice(-3); if (a.v > b.v && b.v > d.v && a.v - d.v >= 3) add("baisse|" + d.c.id, `Trois contrôles en baisse de suite : ${[a, b, d].map(r => noteS(r.v)).join(" → ")}.`, d.c); }
  const pers = M.per.map((v, i) => ({v, i, n:done.filter(r => r.p === i).length})).filter(p => p.v != null), lp = pers[pers.length - 1];
  if (lp && lp.n >= 2 && lp.v < 8) add("periode|" + y + "|" + lp.i, `Moyenne du ${perLab(lp.i).toLowerCase()} : ${noteS(lp.v)}.`, null);
  if (pers.length >= 2){ const pp = pers[pers.length - 2]; if (pp.v - lp.v >= 3) add("recul|" + y + "|" + lp.i, `Moyenne en recul : ${perAbr(pp.i)} ${noteS(pp.v)} → ${perAbr(lp.i)} ${noteS(lp.v)}.`, null); }
  let fins = 0, finC = null;
  for (const r of done.slice(-3)){ const cp = cpOf(r.c), ws = (r.c.questions || []).filter(q => q.type !== "qcm"), vide = ws.map(q => isNoAnswer(cp.answers?.[q.id]?.transcription)), nv0 = vide.filter(Boolean).length;
    if (ws.length >= 3 && nv0 / ws.length >= .4) add("vide|" + r.c.id, `Copie en grande partie vide à « ${r.c.titre} » : ${nv0} réponse(s) sur ${ws.length} sans contenu.`, r.c);
    else if (ws.length >= 2 && vide[vide.length - 1] && vide.some(v => !v)){ fins++; finC = r.c; } }
  if (fins >= 2) add("fin|" + finC.id, "Les dernières questions restent souvent sans réponse : gestion du temps ?", finC);
  const hist = {};
  for (const r of done){ const cp = cpOf(r.c), by = {};
    for (const q of r.c.questions || []){ const n = noteOf(cp.answers?.[q.id]); if (n == null || !+q.points || !q.notion) continue; const k = nkey(q.notion), o = by[k] = by[k] || {s:0, p:0, l:q.notion}; o.s += n; o.p += +q.points; }
    for (const [k, o] of Object.entries(by)) (hist[k] = hist[k] || []).push({r:o.s / o.p, c:r.c, l:o.l}); }
  for (const [k, h] of Object.entries(hist)){ const last = h[h.length - 1];
    if (h.length >= 2 && last.r <= .4 && h.slice(0, -1).some(x => x.r >= .7)) add("notion|" + k + "|" + last.c.id, `Notion « ${last.l} » réussie auparavant, à nouveau non acquise à « ${last.c.titre} ».`, last.c); }
  for (const k of Object.keys(COMPS)){
    const pts = done.map(r => { const cp = cpOf(r.c); let s = 0, p = 0; for (const q of r.c.questions || []) if ((q.comps || []).includes(k) && +q.points){ const n = noteOf(cp.answers?.[q.id]); if (n != null){ s += n; p += +q.points; } } return p ? {r:s / p, c:r.c} : null; }).filter(Boolean), l2 = pts.slice(-2);
    if (l2.length === 2 && l2.every(x => x.r < .4)) add("comp|" + k + "|" + l2[1].c.id, `Compétence « ${COMPS[k]} » insuffisante aux deux derniers contrôles qui l'évaluent.`, l2[1].c); }
  const soin = done.map(r => { const b = Object.values(cpOf(r.c).bonusPages || {}).map(x => +x?.proprete).filter(x => !isNaN(x)); return b.length ? {v:mean(b), c:r.c} : null; }).filter(Boolean);
  if (soin.length >= 3){ const l = soin[soin.length - 1], m = mean(soin.slice(0, -1).map(x => x.v)); if (l.v <= m - .3) add("soin|" + l.c.id, `Présentation nettement moins soignée que d'habitude à « ${l.c.titre} ».`, l.c); }
  const abs = cs.filter(c => isAbs(c, e)); if (abs.length >= 2) add("abs|" + abs.map(c => c.id).join(","), `Absent à ${abs.length} contrôles cette année.`, abs[abs.length - 1]);
  return [...alertesEcrites(cl, e, y), ...out];
}
/* Écrits inquiétants relevés pendant la correction (toutes les matières du professeur) */
function alertesEcrites(cl, e, y){ const out = [];
  for (const c of store.controles) if (c.classeId === cl.id && yearOf(ctrlDay(c)) === y){
    for (const [pg, a] of Object.entries(feuille(c.id)?.copies?.[e.id]?.alertes || {})) if (a?.txt) out.push({k:"ecrit|" + c.id + "|" + pg, lvl:"alerte", c, txt:`Écrit à lire par un adulte (« ${c.titre} », page ${pg}) : « ${a.txt} »`}); }
  return out; }
const vusOf = cl => store.bilans?.["vus_" + cl.id]?.k || {};
const nonVus = (cl, e, list) => { const v = vusOf(cl); return list.filter(f => !v[e.id + "|" + f.k]); };
const flagBadge = list => list.length ? ` <span class="flag${list.some(f => f.lvl === "alerte") ? " al" : ""}" title="${esc(list.length + " signal(s) à observer")}">🚩${list.length > 1 ? " " + list.length : ""}</span>` : "";
/* Accueil : élèves avec des signaux non vus, toutes classes et matières */
function aObserver(){
  const y = curYear(), out = [];
  for (const cl of store.classes){ const mats = [...new Set(store.controles.filter(c => c.classeId === cl.id && isCtrl(c)).map(c => c.matiere))];
    for (const e of cl.eleves || []){ const seen = new Set(), all = [];
      for (const f of mats.length ? mats.flatMap(m => signaux(cl, m, e, y).map(x => ({...x, mat:m}))) : alertesEcrites(cl, e, y)) if (!seen.has(f.k)){ seen.add(f.k); all.push(f); }
      const n = nonVus(cl, e, all); if (n.length) out.push({cl, e, n, mat:n.find(f => f.mat)?.mat || mats[0] || ""}); } }
  if (!out.length) return "";
  const al = o => o.n.some(f => f.lvl === "alerte");
  out.sort((a, b) => al(b) - al(a) || b.n.length - a.n.length);
  return foldSec("observer", "Élèves à observer", out.length, out.slice(0, 15).map(o => `<div class="item clickable" data-suopen="${esc(o.cl.id + "|" + o.e.id + "|" + o.mat)}"><div><div class="t">${esc(o.e.prenom + " " + o.e.nom)} <span class="muted small">· ${esc(o.cl.nom)}</span></div><div class="s">${esc(o.n[0].txt)}${o.n.length > 1 ? " · +" + (o.n.length - 1) : ""}</div></div>${flagBadge(o.n)}</div>`).join("")
    + `<p class="small muted" style="margin:8px 0 0">Des faits tirés des notes et des copies, à observer : jamais un diagnostic. Jamais montré à l'élève ni à sa famille.</p>`);
}

/* ---------- Savoir-être : observé et noté par le professeur, jamais par l'IA ---------- */
const SE = {participation:"Participation", autonomie:"Autonomie", concentration:"Concentration", confiance:"Confiance en soi", soin:"Soin du travail"};
const SE_N = {1:"Insuffisant", 2:"Fragile", 3:"Satisfaisant", 4:"Très bien"};
const seId = (cl, e, mat) => `se_${cl.id}_${e.id}_${slug(mat)}`;

function vSuiviBase(){
  if (!store.classes.length) return `<div class="head"><h2>Suivi des élèves</h2></div><div class="panel empty">Crée d'abord une classe.</div>`;
  const cl = classe(S.su?.cl) || store.classes[0]; S.su = S.su || {}; S.su.cl = cl.id;
  const mats = [...new Set([...store.controles.filter(c => c.classeId === cl.id), ...(store.quizzes || []).filter(q => q.classeId === cl.id)].map(c => c.matiere))];
  const mat = mats.includes(S.su.mat) ? S.su.mat : mats[0]; S.su.mat = mat;
  if (!mat) return `<p class="muted">Aucun contrôle ni quiz pour cette classe pour l'instant.</p>`;
  const ys = yearsOf(cl, mat), y = ys.includes(+S.su.y) ? +S.su.y : yearCtrls(cl, mat, curYear()).length ? curYear() : ys.find(v => yearCtrls(cl, mat, v).length) ?? curYear(); S.su.y = y;
  const TABS = {annee:"Année", controle:"Par contrôle", notions:"Notions", comps:"Compétences"}, tab = TABS[S.su.tab] ? S.su.tab : "annee"; S.su.tab = tab;
  const top = `<div class="row between" style="gap:10px;flex-wrap:wrap"><div class="row" style="gap:8px">${mats.length > 1 ? `<select id="su-mat" style="width:auto" aria-label="Matière">${selOpts(mats, mat)}</select>` : `<div class="label">${esc(mat)}</div>`}
      ${ys.length > 1 ? `<select id="su-y" style="width:auto" aria-label="Année scolaire">${selOpts(ys.map(String), String(y), v => "Année " + yearLab(+v))}</select>` : `<span class="small muted">Année ${yearLab(y)}</span>`}</div>
    <div class="qchips" role="tablist">${Object.entries(TABS).map(([k, l]) => `<button class="chip${k === tab ? " cur" : ""}" role="tab" aria-selected="${k === tab}" data-sutab="${k}">${l}</button>`).join("")}</div></div>`;
  const cs = yearCtrls(cl, mat, y), els = cl.eleves || [], flags = Object.fromEntries(els.map(e => [e.id, nonVus(cl, e, signaux(cl, mat, e, y))]));
  const nameTd = x => `<td><b>${esc(x.prenom)} ${esc(x.nom)}</b>${flagBadge(flags[x.id])}</td>`, rowAttr = x => `class="clickable ${x.id === S.su.el ? "sel" : ""}" data-suel="${x.id}"`;
  const cell = v => `<td class="c"><span class="cell ${v == null ? "none" : tone(v / 20)}">${v == null ? "—" : nv(v)}</span></td>`;
  let body = "";
  if (tab === "annee"){
    const done = cs.filter(c => els.some(e => noteDe(c, e) != null)), num = new Map(done.map((c, k) => [c.id, k + 1]));
    const pers = Array.from({length:bornes().length + 1}, (_, i) => ({i, l:done.filter(c => periodOf(ctrlDay(c)) === i)})).filter(p => p.l.length);
    const M = Object.fromEntries(els.map(e => [e.id, moyennes(done, e)]));
    body = done.length ? `<section class="panel"><div class="row between"><p class="small muted" style="margin:0">Note retenue de chaque contrôle (rattrapage compris), moyennes par ${isSem() ? "semestre" : "trimestre"} et sur l'année, pondérées par les coefficients. Touche un élève pour sa fiche.</p><button class="btn sm" id="an-csv">Exporter (CSV)</button></div>
      <div class="tbl-wrap tbl-sticky" style="margin-top:8px"><table><thead><tr><th rowspan="2">Élève</th>${pers.map(p => `<th class="c" colspan="${p.l.length + 1}">${perLab(p.i)}</th>`).join("")}<th class="c" rowspan="2">Année</th></tr>
        <tr>${pers.map(p => p.l.map(c => `<th class="c" title="${esc(c.titre + (ctrlDay(c) ? " · " + frDate(ctrlDay(c)) : ""))}">C${num.get(c.id)}<div><select class="coef" data-coef="${c.id}" aria-label="Coefficient de ${esc(c.titre)}">${selOpts(["0.5","1","2","3","4"], String(coefOf(c)), x => "×" + x.replace(".", ","))}</select></div></th>`).join("") + `<th class="c">Moy. ${perAbr(p.i)}</th>`).join("")}</tr></thead><tbody>
      ${els.map(x => `<tr ${rowAttr(x)}>${nameTd(x)}${pers.map(p => p.l.map(c => noteCell(c, x)).join("") + `<td class="c"><b>${cell(M[x.id].per[p.i]).replace(/^<td class="c">|<\/td>$/g, "")}</b></td>`).join("")}<td class="c"><b>${cell(M[x.id].an).replace(/^<td class="c">|<\/td>$/g, "")}</b></td></tr>`).join("")}
      <tr class="tot"><td><b>Moyenne de la classe</b></td>${pers.map(p => p.l.map(c => cell(mean(els.map(e => noteDe(c, e))))).join("") + cell(mean(els.map(e => M[e.id].per[p.i])))).join("")}${cell(mean(els.map(e => M[e.id].an)))}</tr>
      </tbody></table></div>
      <p class="small muted" style="margin:8px 0 0">${done.map(c => `C${num.get(c.id)} : ${esc(c.titre)}${ctrlDay(c) ? " (" + esc(frDate(ctrlDay(c))) + ")" : ""}`).join(" · ")}</p>
      <p class="small muted" style="margin:4px 0 0"><b>Abs.</b> absent (ne compte pas) · <b>?</b> copie scannée avec une question sans note, à relire dans Correction · <b>—</b> pas de copie. Pour marquer un absent : page Analyse du contrôle ou Correction.</p></section>`
      : `<section class="panel empty">Aucun contrôle corrigé en ${esc(mat)} pour l'année ${yearLab(y)}.</section>`;
  }
  if (tab === "controle"){
    const done = cs.filter(c => els.some(e => noteDe(c, e) != null)), c = done.find(x => x.id === S.su.ctrl) || done[done.length - 1];
    if (c){ S.su.ctrl = c.id; const qs = c.questions || [], cpOf = e => feuille(c.id)?.copies?.[e.id];
      const qc = (q, e) => { const n = noteOf(cpOf(e)?.answers?.[q.id]); return `<td class="c"><span class="cell ${n == null ? "none" : tone(n / (+q.points || 1))}">${n == null ? "—" : fmt(n)}</span></td>`; };
      body = `<section class="panel"><div class="row between" style="gap:8px"><select id="su-ctrl" style="width:auto" aria-label="Contrôle">${selOpts(done.map(x => x.id), c.id, id => { const x = done.find(z => z.id === id); return x.titre + (ctrlDay(x) ? " · " + frDate(ctrlDay(x)) : ""); })}</select><a class="btn sm" href="#/controle/${c.id}/classe">Analyse complète</a></div>
        <div class="tbl-wrap tbl-sticky" style="margin-top:8px"><table><thead><tr><th>Élève</th>${qs.map((q, k) => `<th class="c" title="${esc(q.notion || "")}">Q${k + 1}<div class="small muted">/ ${fmt(+q.points)}</div></th>`).join("")}<th class="c">Note</th></tr></thead><tbody>
        ${els.map(x => isAbs(c, x) ? `<tr ${rowAttr(x)}>${nameTd(x)}<td colspan="${qs.length}" class="small muted">Absent</td>${noteCell(c, x)}</tr>` : `<tr ${rowAttr(x)}>${nameTd(x)}${qs.map(q => qc(q, x)).join("")}${noteCell(c, x)}</tr>`).join("")}
        <tr class="tot"><td><b>Moyenne</b></td>${qs.map(q => { const v = mean(els.filter(e => !isAbs(c, e)).map(e => noteOf(cpOf(e)?.answers?.[q.id]))); return `<td class="c"><span class="cell ${v == null ? "none" : tone(v / (+q.points || 1))}">${v == null ? "—" : fmt(Math.round(v * 10) / 10)}</span></td>`; }).join("")}${cell(mean(els.map(e => noteDe(c, e))))}</tr>
        </tbody></table></div></section>`; }
    else body = `<section class="panel empty">Aucun contrôle corrigé en ${esc(mat)} pour l'année ${yearLab(y)}.</section>`;
  }
  if (tab === "notions"){
    const st = notionStats(cl, mat), cols = st.notions.slice(0, 10), ms = (eid, k) => { const o = st.per[eid]?.[k]; return o ? o.s / o.n : null; }, lab = r => r == null ? "" : r >= .7 ? "Maîtrisé" : r >= .5 ? "Fragile" : "Non acquis";
    body = `<section class="panel"><p class="small muted">${cols.length ? "Vert : maîtrisé (70 % et plus) · orange : fragile · rouge : non acquis. Touche un élève pour son détail." : "Aucune copie validée pour l'instant : la maîtrise de chaque notion apparaîtra ici dès qu'une copie sera validée. Touche un élève pour son détail."}</p>
      <div class="tbl-wrap tbl-sticky" style="margin-top:8px"><table><thead><tr><th>Élève</th>${cols.map(k => `<th class="c" title="${esc(st.labels[k])}" style="max-width:110px;overflow:hidden;text-overflow:ellipsis">${esc(st.labels[k].slice(0, 16))}</th>`).join("")}</tr></thead><tbody>
      ${els.map(x => `<tr ${rowAttr(x)}>${nameTd(x)}${cols.map(k => { const r = ms(x.id, k); return `<td class="c"><span class="cell ${tone(r)}" title="${lab(r)}">${r == null ? "—" : Math.round(r * 100)}</span></td>`; }).join("")}</tr>`).join("")}
      </tbody></table></div></section>`;
  }
  if (tab === "comps"){
    const sans = cs.filter(c => (c.questions || []).some(q => !(q.comps || []).length)), CS = Object.fromEntries(els.map(e => [e.id, compStats(cs, e)]));
    body = `<section class="panel"><p class="small muted" style="margin:0">Échelle du livret scolaire, sur l'année : <b>TB</b> très bonne maîtrise · <b>S</b> satisfaisante · <b>F</b> fragile · <b>I</b> insuffisante. Chaque question compte pour la ou les compétences qu'elle évalue.</p>
      ${sans.length ? `<p class="banner" style="margin-top:8px">${sans.length} contrôle(s) de l'année ont des questions sans compétence. <button class="btn sm" id="compAll">Les indiquer avec l'IA</button> <span class="status" id="comp-st"></span></p>` : ""}
      <div class="tbl-wrap tbl-sticky" style="margin-top:8px"><table><thead><tr><th>Élève</th>${Object.values(COMPS).map(l => `<th class="c">${l}</th>`).join("")}</tr></thead><tbody>
      ${els.map(x => `<tr ${rowAttr(x)}>${nameTd(x)}${Object.keys(COMPS).map(k => `<td class="c">${maiCell(CS[x.id][k])}</td>`).join("")}</tr>`).join("")}
      <tr class="tot"><td><b>Classe</b></td>${Object.keys(COMPS).map(k => `<td class="c">${maiCell(mean(els.map(e => CS[e.id][k])))}</td>`).join("")}</tr>
      </tbody></table></div></section>`;
  }
  const e = els.find(x => x.id === S.su.el);
  return top + body + (e ? ficheEleve(cl, mat, e, y, cs) : "");
}

/* Fiche d'un élève : courbe, moyennes, compétences, signaux, savoir-être, appréciation */
function ficheEleve(cl, mat, e, y, cs){
  const st = notionStats(cl, mat), M = moyennes(cs, e), done = M.rows.filter(r => r.v != null), CS = compStats(cs, e);
  const ms = k => { const o = st.per[e.id]?.[k]; return o ? o.s / o.n : null; };
  const hist = studentCtrls(cl, mat, e).filter(x => yearOf(ctrlDay(x.c)) === y), bil = store.bilans[`${cl.id}_${e.id}_${slug(mat)}`];
  const nl = st.notions.map(k => ({k, r:ms(k), n:st.per[e.id]?.[k]?.n || 0})).filter(x => x.r != null).sort((a, b) => a.r - b.r);
  const all = signaux(cl, mat, e, y), vus = vusOf(cl), nouv = all.filter(f => !vus[e.id + "|" + f.k]), anciens = all.filter(f => vus[e.id + "|" + f.k]);
  const W = 560, H = 120, xs = i => done.length > 1 ? 20 + i * (W - 40) / (done.length - 1) : W / 2, ys = v => H - 14 - v / 20 * (H - 28);
  const courbe = done.length ? `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;height:auto" role="img" aria-label="Évolution des notes">
      <line x1="0" x2="${W}" y1="${ys(10)}" y2="${ys(10)}" stroke="var(--line)" stroke-dasharray="4 4"/>
      <polyline fill="none" stroke="var(--blue)" stroke-width="2" points="${done.map((r, i) => xs(i) + "," + ys(r.v)).join(" ")}"/>
      ${done.map((r, i) => `<circle cx="${xs(i)}" cy="${ys(r.v)}" r="4" fill="var(--${tone(r.v / 20)})"><title>${esc(r.c.titre)} : ${esc(noteS(r.v))}</title></circle>`).join("")}</svg>` : `<p class="muted small">Aucune note cette année.</p>`;
  const pnow = periodOf(new Date().toISOString().slice(0, 10)), sp = Number.isInteger(+S.su.sp) && +S.su.sp <= bornes().length ? +S.su.sp : (yearOf(new Date().toISOString().slice(0, 10)) === y ? pnow : 0);
  const seD = store.bilans[seId(cl, e, mat)]?.p?.[y + "-" + sp] || {};
  const flagLi = (f, vu) => `<div class="item${f.lvl === "alerte" ? " al" : ""}"><div><div class="t small">${f.lvl === "alerte" ? "⚠️ " : "🚩 "}${esc(f.txt)}</div>${f.c ? `<div class="s">${esc(frDate(ctrlDay(f.c)) || "")}</div>` : ""}</div>${vu ? `<span class="small muted">Vu</span>` : `<button class="btn sm" data-vu="${esc(e.id + "|" + f.k)}">Vu</button>`}</div>`;
  return `<section class="panel grid" id="fiche-el">
    <div class="row between"><div><div class="label">${esc(mat)} · ${yearLab(y)}</div><h3 style="font-size:20px">${esc(e.prenom)} ${esc(e.nom)}</h3></div>
      <div class="row" style="gap:6px">${M.per.map((v, i) => v == null ? "" : `<span class="chip">${perAbr(i)} <b class="num">${esc(noteS(v))}</b></span>`).join("")}<span class="chip">Année <b class="num">${esc(noteS(M.an))}</b></span></div></div>
    ${courbe}
    <div><div class="label" style="margin-bottom:6px">À observer</div>
      ${nouv.length ? nouv.map(f => flagLi(f, false)).join("") : `<p class="small muted" style="margin:0">Aucun signal en cours.</p>`}
      ${anciens.length ? `<details style="margin-top:6px"><summary class="small muted">Déjà vus (${anciens.length})</summary>${anciens.map(f => flagLi(f, true)).join("")}</details>` : ""}
      <p class="small muted" style="margin:6px 0 0">Des faits tirés des notes et des copies, pour t'aider à observer : jamais un diagnostic. Jamais montré à l'élève ni à sa famille.</p></div>
    <div class="grid g2">
      <div><div class="label" style="margin-bottom:6px">Compétences</div>
        <div class="bars">${Object.entries(COMPS).map(([k, l]) => { const r = CS[k], m = MAITRISE(r); return `<div class="bar" style="grid-template-columns:110px 1fr auto"><span class="small">${l}</span><div class="track"><div class="fill" style="width:${r == null ? 0 : Math.round(r * 100)}%;background:var(--${m ? m.t : "line"})"></div></div><span class="small ${m ? "" : "muted"}">${m ? esc(m.l) : "—"}</span></div>`; }).join("")}</div></div>
      <div><div class="label" style="margin-bottom:6px">Notions, de la plus fragile à la plus solide</div>
        <div class="bars">${nl.map(x => `<div class="bar" style="grid-template-columns:1fr 90px 44px"><span class="small">${esc(st.labels[x.k])} <span class="muted">(${x.n})</span></span><div class="track"><div class="fill" style="width:${Math.round(x.r * 100)}%;background:var(--${tone(x.r)})"></div></div><span class="num small" style="text-align:right">${pct(x.r)}</span></div>`).join("") || `<p class="muted small">Aucune copie validée.</p>`}</div></div>
    </div>
    <div><div class="label" style="margin-bottom:6px">Contrôles</div>${hist.map(x => `<div class="item"><div><div class="t small">${x.c.type === "rattrapage" ? "↺ " : ""}${esc(x.c.titre)}${isCtrl(x.c) && coefOf(x.c) !== 1 ? ` <span class="muted">· coef ${fmt(coefOf(x.c))}</span>` : ""}</div><div class="s">${esc(frDate(x.c.date) || "")}</div></div>${(() => { const N = isCtrl(x.c) ? noteRetenue(x.c, e) : null, v = N ? N.retenue : final20(x.c, x.cp), up = N && N.ratt != null && Math.abs(N.retenue - N.base) > 0.001;
      return `<span class="cell ${tone(v / 20)}" title="${up ? esc("Note initiale " + noteS(N.base) + " · " + ruleTxt(N.R)) : ""}">${noteS(v)}${up ? " ↺" : ""}</span>`; })()}</div>`).join("") || (cs.some(c => isAbs(c, e)) ? "" : `<p class="muted small">Aucun.</p>`)}
      ${cs.filter(c => isAbs(c, e)).map(c => `<div class="item"><div><div class="t small">${esc(c.titre)}</div><div class="s">${esc(frDate(ctrlDay(c)) || "")}</div></div><span class="cell none">Absent</span></div>`).join("")}</div>
    <div class="grid" style="gap:8px"><div class="row between"><div class="label">Savoir-être (observé par toi)</div><select id="se-p" style="width:auto" aria-label="Période">${selOpts(Array.from({length:bornes().length + 1}, (_, i) => String(i)), String(sp), i => perLab(+i))}</select></div>
      <div class="form-row" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">${Object.entries(SE).map(([k, l]) => `<div class="field"><label for="se-${k}">${l}</label><select id="se-${k}" data-se="${k}">${selOpts(["", "1", "2", "3", "4"], String(seD[k] || ""), v => v ? SE_N[v] : "—")}</select></div>`).join("")}</div>
      <textarea id="se-txt" data-live placeholder="Remarque (facultatif)">${esc(seD.txt || "")}</textarea>
      <div class="row"><button class="btn sm" id="se-save" data-e="${e.id}">Enregistrer</button><span class="small muted">Utilisé seulement pour rédiger l'appréciation, si tu le remplis.</span></div></div>
    <div class="grid" style="gap:8px"><div class="row between"><div class="label">Appréciation pour le bulletin</div><button class="btn sm" id="appr" data-e="${e.id}">${bil ? "Réécrire" : "Rédiger"} (IA)</button></div>
      <div class="status" id="appr-st"></div>
      ${bil ? `<textarea id="appr-txt" data-live>${esc(bil.texte)}</textarea><div class="row"><button class="btn sm" id="apprSave">Enregistrer ma version</button><button class="btn sm ghost" id="apprCopy">Copier</button></div>` : `<p class="muted small">Rédigée à partir des notes, des moyennes, des compétences, des commentaires de correction et de ton savoir-être. Tu la relis et la modifies.</p>`}</div>
  </section>`;
}

/* ================= 3. Vue direction ================= */
function vDirection_0(){
  const cls = store.classes; if (!cls.length) return `<div class="head"><h2>Direction</h2></div><div class="panel empty">Aucune classe.</div>`;
  const mats = [...new Set(store.controles.filter(isCtrl).map(c => c.matiere))];
  const avgOf = (cl, mat, e) => { const v = studentCtrls(cl, mat, e).filter(x => isCtrl(x.c) && x.cp.validee).slice(-3).map(x => noteRetenue(x.c, e)?.retenue ?? final20(x.c, x.cp)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const grid = cls.map(cl => ({cl, m:Object.fromEntries(mats.map(mat => { const v = (cl.eleves || []).map(e => avgOf(cl, mat, e)).filter(x => x != null); return [mat, v.length ? v.reduce((a, b) => a + b, 0) / v.length : null]; }))}));
  const risk = []; cls.forEach(cl => (cl.eleves || []).forEach(e => { const low = mats.map(m => [m, avgOf(cl, m, e)]).filter(([, a]) => a != null && a < 10); if (low.length >= 2) risk.push({cl, e, low}); }));
  const weak = []; cls.forEach(cl => mats.forEach(mat => { const st = notionStats(cl, mat); st.notions.forEach(k => { const v = Object.values(st.per).map(p => p[k]).filter(Boolean); if (v.length >= 3){ const r = v.reduce((a, o) => a + o.s / o.n, 0) / v.length; if (r < .5) weak.push({cl, mat, label:st.labels[k], r, n:v.length}); } }); }));
  weak.sort((a, b) => a.r - b.r);
  const since = Date.now() - 30 * 864e5, recent = store.controles.filter(c => Date.parse(c.createdAt || 0) > since);
  let pending = 0; store.controles.forEach(c => { const f = feuille(c.id); if (f) Object.values(f.copies || {}).forEach(cp => { if (!cp.validee && Object.keys(cp.answers || {}).length) pending++; }); });
  return `<div class="head"><div><h2>Vue direction</h2><p>Toutes les classes et matières d'un coup d'œil. Moyennes sur les 3 derniers contrôles validés.</p></div></div>
  <div class="grid g3">
    <div class="panel"><div class="label">Contrôles créés · 30 jours</div><div class="total num" style="color:var(--ink)">${recent.filter(isCtrl).length}</div></div>
    <div class="panel"><div class="label">Rattrapages · 30 jours</div><div class="total num" style="color:var(--ink)">${recent.filter(c => c.type === "rattrapage").length}</div></div>
    <div class="panel"><div class="label">Copies à valider</div><div class="total num" style="color:${pending ? "var(--pen)" : "var(--ink)"}">${pending}</div></div>
  </div>
  <section class="panel"><h3>Moyennes par classe et matière</h3><div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th>Classe</th>${mats.map(m => `<th class="c">${esc(m)}</th>`).join("")}</tr></thead><tbody>
    ${grid.map(g => `<tr><td><b>${esc(g.cl.nom)}</b> <span class="muted small">${(g.cl.eleves || []).length} él.</span></td>${mats.map(m => `<td class="c"><span class="cell ${g.m[m] == null ? "none" : tone(g.m[m] / 20)}">${fmt(g.m[m])}</span></td>`).join("")}</tr>`).join("")}
  </tbody></table></div></section>
  <div class="grid g2">
    <section class="panel"><h3>Élèves en difficulté dans 2 matières ou plus</h3><div style="margin-top:4px">${risk.map(r => `<div class="item"><div><div class="t">${esc(r.e.prenom)} ${esc(r.e.nom)}</div><div class="s">${esc(r.cl.nom)}</div></div><div class="tags">${r.low.map(([m, a]) => `<span class="chip bad">${esc(m)} ${fmt(a)}</span>`).join("")}</div></div>`).join("") || `<p class="muted small" style="padding:8px 0">Aucun pour l'instant.</p>`}</div></section>
    <section class="panel"><h3>Notions non acquises par la classe</h3><div style="margin-top:4px">${weak.slice(0, 12).map(w => `<div class="item"><div><div class="t">${esc(w.label)}</div><div class="s">${esc(w.cl.nom)} · ${esc(w.mat)} · ${w.n} élèves</div></div><span class="cell bad">${pct(w.r)}</span></div>`).join("") || `<p class="muted small" style="padding:8px 0">Aucune notion sous 50 %.</p>`}</div></section>
  </div>`;
}

/* ================= 5. Banque ================= */
function vBanque_0(){
  const b = S.bk = S.bk || {mat:"", niv:"", q:"", n:10, open:null}; b.n = b.n || 10;
  // Un seul modèle par contrôle : les copies réutilisées (même titre, mêmes questions) sont regroupées
  const sig = c => [nkey(c.titre), c.matiere, c.niveau, ...(c.questions || []).map(q => nkey(vOf(q, "standard").enonce).slice(0, 80))].join("|");
  const groups = new Map();
  [...store.controles].filter(isCtrl).sort((x, y) => (x.createdAt || "").localeCompare(y.createdAt || ""))
    .forEach(c => { const k = sig(c); const g = groups.get(k); if (g){ g.n++; g.last = c.createdAt || g.last; } else groups.set(k, {c, n:1, last:c.createdAt || ""}); });
  const all = [...groups.values()].filter(({c}) => (!b.mat || c.matiere === b.mat) && (!b.niv || c.niveau === b.niv)
    && (!b.q || nkey(c.titre + " " + (c.questions || []).map(q => q.notion + " " + vOf(q, "standard").enonce).join(" ")).includes(nkey(b.q))))
    .sort((x, y) => (y.last || "").localeCompare(x.last || ""));
  const mats = [...new Set(store.controles.map(c => c.matiere))], nivs = NIVEAUX.filter(n => store.controles.some(c => c.niveau === n));
  const row = ({c, n}) => { const notions = [...new Set((c.questions || []).map(q => q.notion).filter(Boolean))], open = b.open === c.id;
    return `<div class="bk-row${open ? " open" : ""}"><div class="bk-main"><div class="t">${esc(c.titre)}${n > 1 ? ` <span class="chip">${n} utilisations</span>` : ""}</div>
      <div class="s">${esc(c.matiere)}${c.niveau ? " · " + esc(c.niveau) : ""} · ${(c.questions || []).length} q.${notions.length ? " · " + esc(notions.slice(0, 4).join(", ")) + (notions.length > 4 ? "…" : "") : ""}</div></div>
      <div class="bk-act">${open ? `<select id="dup-${c.id}" aria-label="Classe">${selOpts(store.classes, c.classeId, x => x.nom, x => x.id)}</select><button class="btn sm primary" data-dup="${c.id}">Créer la copie</button><button class="btn sm ghost" data-bkx="1">Annuler</button>`
        : `<button class="btn sm" data-bkopen="${c.id}">Réutiliser</button>`}</div></div>`; };
  return `<div class="head"><div><h2>Banque de contrôles</h2><p>Tes contrôles déjà faits, prêts à réutiliser pour une autre classe ou une autre année.</p></div></div>
  <section class="panel bk">
    <div class="bk-bar"><input id="bk-q" type="search" value="${esc(b.q)}" placeholder="Rechercher un titre ou une notion" aria-label="Rechercher">
      ${mats.length > 1 ? `<select id="bk-mat" aria-label="Matière"><option value="">Toutes les matières</option>${selOpts(mats, b.mat)}</select>` : ""}
      ${nivs.length > 1 ? `<select id="bk-niv" aria-label="Niveau"><option value="">Tous les niveaux</option>${selOpts(nivs, b.niv)}</select>` : ""}</div>
    ${all.length ? all.slice(0, b.n).map(row).join("") + (all.length > b.n ? `<div class="bk-more"><button class="btn sm" data-bkmore="1">Voir plus · ${all.length - b.n}</button></div>` : "")
      : `<p class="empty">${b.q || b.mat || b.niv ? "Aucun contrôle ne correspond." : "Tes contrôles apparaîtront ici dès que tu en auras créé un."}</p>`}
  </section>`;
}
function bankPanel_0(c){
  const seen = new Set(), q = nkey(S.bkq || "");
  const list = [];
  store.controles.filter(x => x.id !== c.id && x.matiere === c.matiere).forEach(x => (x.questions || []).forEach(qq => { const en = vOf(qq, "standard").enonce, k = nkey(en);
    if (!k || seen.has(k)) return; seen.add(k); if (q && !nkey(en + " " + qq.notion).includes(q)) return; list.push({x, qq, en}); }));
  return `<section class="panel grid"><div class="row between"><h3>Banque · ${esc(c.matiere)}</h3><input id="bkq-search" value="${esc(S.bkq || "")}" placeholder="Filtrer…" style="max-width:220px"></div>
    <div>${list.slice(0, 40).map(({x, qq, en}) => `<div class="item"><div><div class="small" dir="auto">${esc(en.slice(0, 160))}${en.length > 160 ? "…" : ""}</div><div class="s">${esc(qq.notion || "")} · ${fmt(+qq.points)} pts${qq.type === "qcm" ? " · QCM" : ""} · ${esc(x.titre)}</div></div><button class="btn sm" data-bankadd="${x.id}|${qq.id}">Ajouter</button></div>`).join("") || `<p class="muted small">Aucune question dans cette matière pour l'instant.</p>`}</div></section>`;
}

/* ================= 6. Fiche d'écriture ================= */
const FICHE = [
  {id:"chiffres", titre:"Chiffres", texte:"0 1 2 3 4 5 6 7 8 9", usage:"maths"},
  {id:"symboles", titre:"Symboles", texte:"x  ×  +  −  =  ÷  (  )  ²  √  π  ≤  ≥", usage:"maths"},
  {id:"calculs", titre:"Calculs", texte:"2x − 3 = 7     (x + 3)²     √25 = 5     3/4 + 1/2", usage:"maths"},
  {id:"alefbet", titre:"Alef-beit, en cursive", texte:"א ב ג ד ה ו ז ח ט י כ ך ל מ ם נ ן ס ע פ ף צ ץ ק ר ש ת", usage:"hebreu"},
  {id:"michna", titre:"Michna, en cursive", texte:"שנים אוחזין בטלית זה אומר אני מצאתיה וזה אומר אני מצאתיה", usage:"hebreu"},
  {id:"francais", titre:"Français", texte:"Noël, août, cœur : où est passé le goûter ? Hélène a reçu déjà ça.", usage:"francais"}
];
const usageOf = mat => ["Guémara","Halakha","Houmach","Hébreu","Hassidout"].includes(mat) ? "hebreu" : ["Mathématiques","Physique-Chimie","SVT"].includes(mat) ? "maths" : "francais";
function fichePages(cl, e){
  const stage = $("#sheetStage"); stage.innerHTML = "";
  const p = document.createElement("div"); p.className = "sheet"; p.style.fontSize = "15px";
  p.innerHTML = `<div class="sh-head"><div><div class="sh-school">${esc(headerFrom(S.me?.affichage || "ecole"))}</div><div class="sh-title">Fiche d'écriture</div>
    <div class="sh-meta">${esc(cl.nom)} · à remplir en début d'année et en janvier</div><div class="sh-name">Élève : <b>${esc(e.prenom)} ${esc(e.nom)}</b></div></div></div>
    <div class="sh-cons">Recopie chaque modèle dans le cadre juste en dessous, avec ton écriture habituelle. L'hébreu en cursive. Écris au stylo foncé.</div>`;
  FICHE.forEach(f => { const b = document.createElement("div"); b.className = "sh-q";
    b.innerHTML = `<div class="sh-qh"><span>${esc(f.titre)}</span></div><div class="sh-qt ${f.usage === "hebreu" ? "he" : ""}" dir="auto" style="font-size:19px">${esc(f.texte)}</div><div class="sh-box" style="--lh:60px;height:66px"></div>`; p.append(b); });
  for (const [k, [x, y]] of Object.entries(CORNERS)){ const z = CSIZE[k], im = document.createElement("img"); im.className = "sh-corner"; im.alt = "";
    cornerQR(im, k === "tl" ? `TK1W|${cl.id}|${e.id}|1` : "TK1C|" + k, x, y, z); p.append(im); }
  stage.append(p);
  const pr = p.getBoundingClientRect(); const boxes = $$(".sh-box", p).map(el => { const r = el.getBoundingClientRect(); return {x:Math.round(r.left - pr.left), y:Math.round(r.top - pr.top), w:Math.round(r.width), h:Math.round(r.height)}; });
  return {pages:[p], boxes};
}
function lev(a, b){ const m = a.length, n = b.length; if (!m || !n) return Math.max(m, n); let prev = Array.from({length:n + 1}, (_, j) => j);
  for (let i = 1; i <= m; i++){ const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[n]; }
const simil = (ref, got) => { const A = ref.replace(/\s+/g, ""), B = String(got || "").replace(/\s+/g, ""); return Math.max(0, 1 - lev(A, B) / Math.max(A.length, 1)); };
async function processWriting(it, data){
  const [, clId, eid] = data.split("|"); const cl = classe(clId), e = cl?.eleves?.find(x => x.id === eid);
  it.ctrlId = null; it.eleveId = eid; it.kind = "fiche";
  if (!e){ it.status = "erreur"; it.msg = "Fiche d'écriture : élève introuvable."; return scheduleRender(); }
  it.label = `${e.prenom} ${e.nom} · fiche d'écriture`;
  const H = sheetToPhoto(it.found || []); if (!H){ it.status = "erreur"; it.msg = "Repères non trouvés : reprends la photo avec les 4 coins visibles."; return scheduleRender(); }
  it.status = "lecture"; it.msg = "Découpage des lignes…"; scheduleRender();
  try{
    const {boxes} = fichePages(cl, e); $("#sheetStage").innerHTML = "";
    const crops = boxes.map(b => warpBox(it.cv, H, b));
    const samples = FICHE.map(f => ({id:f.id, texte:f.texte, usage:f.usage, asset:null, lu:"", sim:null}));
    if (ASSETS) for (let k = 0; k < crops.length; k++){ try { samples[k].asset = (await ASSETS.upload(await toBlob(crops[k], .85))).id; } catch(x){} }
    if (AI && LIM?.images){
      it.msg = "Test de lecture de l'écriture…"; scheduleRender();
      const per = Math.max(1, LIM.images.maxCount || 1);
      for (let i = 0; i < crops.length; i += per){
        const part = crops.slice(i, i + per);
        const r = await ai(`Chaque image est une ligne manuscrite écrite par un élève. Transcris exactement ce qui est écrit, caractère par caractère, sans corriger. L'hébreu en caractères hébreux carrés.${lectureTips()} Réponds uniquement en JSON : {"lignes":["…"]} avec ${part.length} élément(s), dans l'ordre des images.`, {images: await Promise.all(part.map(cv => toBlob(cv, .9)))});
        (r?.lignes || []).forEach((t, j) => { if (samples[i + j]){ samples[i + j].lu = String(t); samples[i + j].sim = simil(samples[i + j].texte, t); } });
      }
      bankPush(samples.filter(s => s.asset && s.lu != null).map(s => ({asset:s.asset, texteIA:s.lu, texte:s.texte, source:"modele", langue:/[\u05D0-\u05EA]/.test(s.texte) ? "Hébreu" : langueDef(""), matiere:"", niveau:""})));
    }
    const sims = samples.map(s => s.sim).filter(x => x != null);
    const score = sims.length ? sims.reduce((a, b) => a + b, 0) / sims.length : null;
    const byUsage = u => { const v = samples.filter(s => s.usage === u && s.sim != null).map(s => s.sim); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
    await write("ecritures/" + eid, {classeId:clId, samples, score, parUsage:{maths:byUsage("maths"), hebreu:byUsage("hebreu"), francais:byUsage("francais")}, at:new Date().toISOString()});
    it.status = "ok"; it.msg = score != null ? `Écriture enregistrée · lisibilité ${pct(score)}` : "Écriture enregistrée"; it.cv = null;
  }catch(x){ console.error(x); it.status = "erreur"; it.msg = aiErr(x?.code); }
  scheduleRender();
}
async function sampleImages(eid, mat, max = 3){
  const w = store.ecritures[eid]; if (!w) return {blobs:[], txt:""};
  const u = usageOf(mat), sel = (w.samples || []).filter(s => s.asset && s.usage === u).slice(0, max);
  const blobs = []; for (const s of sel){ try { blobs.push(await getBlob(s.asset)); } catch(x){} }
  const ok = sel.slice(0, blobs.length);
  return {blobs, txt: ok.length ? `\nLes images 2 à ${ok.length + 1} sont des échantillons de l'écriture de CET élève, avec le texte exact qu'il a recopié : ${ok.map((s, k) => `image ${k + 2} = « ${s.texte} »`).join(" ; ")}. Sers-t'en pour reconnaître sa façon de former les lettres et les chiffres.` : ""};
}

/* ================= Events for the modules above ================= */
document.addEventListener("click", async ev => {
  const t = ev.target.closest("button, tr[data-suel], [data-suopen]"); if (!t) return;
  const d = t.dataset;
  if (d.suel){ S.su.el = d.suel; render(); $("#fiche-el")?.scrollIntoView({block:"start", behavior:"smooth"}); return; }
  if (d.suopen){ const [cid, eid, mat] = d.suopen.split("|"); S.acc.suivi = [cid]; S.su = {cl:cid, el:eid, mat, tab:"annee"}; location.hash = "#/suivi"; setTimeout(() => $("#fiche-el")?.scrollIntoView({block:"start"}), 400); return; }
  if (d.sutab){ S.su.tab = d.sutab; return render(); }
  if (d.vu){ const cl = classe(S.su.cl); if (!cl) return; const cur = vusOf(cl); await write("bilans/vus_" + cl.id, {classeId:cl.id, k:{...cur, [d.vu]:new Date().toISOString()}}); return; }
  if (t.id === "an-csv"){ const cl = classe(S.su.cl), mat = S.su.mat, y = S.su.y, els = cl.eleves || [], cs = yearCtrls(cl, mat, y).filter(c => els.some(e => noteDe(c, e) != null));
    const np = bornes().length + 1, f = v => v == null ? "" : String(Math.round(v * 100) / 100).replace(".", ","), q = x => '"' + String(x).replace(/"/g, '""') + '"';
    const head = ["Élève", ...cs.map(c => `${c.titre} (${ctrlDay(c)}, coef ${coefOf(c)})`), ...Array.from({length:np}, (_, i) => "Moyenne " + perAbr(i)), "Moyenne annuelle"];
    const rows = els.map(e => { const M = moyennes(cs, e); return [e.prenom + " " + e.nom, ...cs.map(c => isAbs(c, e) ? "ABS" : f(noteDe(c, e))), ...M.per.map(f), f(M.an)]; });
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + [head, ...rows].map(r => r.map(q).join(";")).join("\r\n")], {type:"text/csv;charset=utf-8"}));
    a.download = `Suivi ${cl.nom} - ${mat} - ${yearLab(y)}.csv`; a.click(); return; }
  if (t.id === "compAll"){ const cl = classe(S.su.cl), st = $("#comp-st"), list = yearCtrls(cl, S.su.mat, S.su.y).filter(c => (c.questions || []).some(q => !(q.comps || []).length));
    t.disabled = true; let n = 0;
    for (const c of list){ st.innerHTML = `<span class="thinking">${++n} / ${list.length}…</span>`; try { await tagComps(c); } catch(x){ st.textContent = aiErr(x?.code); t.disabled = false; return; } }
    toast("Compétences indiquées : tu peux les vérifier dans chaque contrôle."); return; }
  if (t.id === "se-save"){ const cl = classe(S.su.cl), e = cl.eleves.find(x => x.id === d.e), mat = S.su.mat, k = S.su.y + "-" + (+$("#se-p").value || 0), id = seId(cl, e, mat), cur = store.bilans[id]?.p || {};
    const v = Object.fromEntries(Object.keys(SE).map(c => [c, +$("#se-" + c).value || 0]).filter(([, n]) => n)); const txt = $("#se-txt").value.trim(); if (txt) v.txt = txt.slice(0, 600);
    await write("bilans/" + id, {classeId:cl.id, eleveId:e.id, matiere:mat, p:{...cur, [k]:v}}); toast("Savoir-être enregistré."); return; }
  if (t.id === "addQcm"){ const c = ctrl(S.editId); c.questions.push({...mapQ({type:"qcm", points:2, versions:{standard:{enonce:"", choix:["", "", "", ""], bonnes:[0]}}})}); await saveCtrl(c); return; }
  if (t.id === "bankOpen"){ S.bankOpen = !S.bankOpen; return render(); }
  if (d.bankadd){ const [cid, qid] = d.bankadd.split("|"); const src = ctrl(cid)?.questions?.find(q => q.id === qid), c = ctrl(S.editId);
    if (!src || !c) return; const nq = structuredClone(src); nq.id = "q" + uid(5); c.questions.push(nq); await saveCtrl(c); toast("Question ajoutée."); return; }
  if (d.bkopen){ S.bk.open = d.bkopen; return render(); }
  if (d.bkx){ S.bk.open = null; return render(); }
  if (d.bkmore){ S.bk.n = (S.bk.n || 10) + 20; return render(); }
  if (d.dup){ const src = ctrl(d.dup); const cl = $("#dup-" + src.id).value; const id = uid(12);
    const {id:_, analyse, ...rest} = structuredClone(src);
    await write("controles/" + id, {...rest, classeId:cl, niveau:classe(cl)?.niveau || rest.niveau, statut:"brouillon", date:"", createdAt:new Date().toISOString(), sourceId:src.id});
    S.editId = id; S.step = "preparer"; if (S.bk) S.bk.open = null; toast("Copie créée : modifie-la puis imprime."); return go("edit"); }
  if (t.id === "rendu1"){ const C = ctrl(S.corrCtrl), e = eleveOf(C, S.corrEleve), st = $("#rd-st");
    await buildPdf([() => ({pages:renduPages(C, e), label:e.prenom})], `Copie corrigée - ${C.titre} - ${e.prenom} ${e.nom}.pdf`, st); return; }
  if (t.id === "renduAll"){ const C = ctrl(S.corrCtrl), f = feuille(C.id), st = $("#rd-st");
    const list = studentsOf(C).filter(e => f?.copies?.[e.id]?.validee && copyDone(C, f.copies[e.id]));
    if (!list.length){ st.textContent = "Aucune copie validée pour l'instant."; return; }
    await buildPdf(list.map(e => () => ({pages:renduPages(C, e), label:e.prenom + " " + e.nom})), `Copies corrigées - ${C.titre}.pdf`, st); return; }
  if (t.id === "fiches"){ const cl = classe(S.classeSel), st = $("#fi-st");
    if (!(cl?.eleves || []).length){ st.textContent = "Ajoute d'abord des élèves."; return; }
    await buildPdf(cl.eleves.map(e => () => ({pages:fichePages(cl, e).pages, label:e.prenom + " " + e.nom})), `Fiches d'écriture - ${cl.nom}.pdf`, st); return; }
  if (t.id === "appr"){
    const cl = classe(S.su.cl), mat = S.su.mat, e = cl.eleves.find(x => x.id === d.e), st = $("#appr-st"), ns = notionStats(cl, mat);
    const hist = studentCtrls(cl, mat, e); if (!hist.length){ st.textContent = "Pas encore de copie corrigée pour cet élève."; return; }
    const notions = ns.notions.map(k => { const o = ns.per[e.id]?.[k]; return o ? `${ns.labels[k]} : ${pct(o.s / o.n)}` : null; }).filter(Boolean).join(" ; ");
    const coms = hist.flatMap(x => x.c.questions.map(q => x.cp.answers?.[q.id]?.commentaire).filter(Boolean)).slice(-6).join(" | ");
    const y = S.su.y ?? curYear(), cs = yearCtrls(cl, mat, y), M = moyennes(cs, e), CS = compStats(cs, e), pn = M.per.map((v, i) => v == null ? null : i).filter(i => i != null).pop() ?? 0;
    const moys = M.per.map((v, i) => v == null ? "" : `${perLab(i)} : ${noteS(v)}`).filter(Boolean).join(" ; ");
    const comps = Object.entries(CS).filter(([, r]) => r != null).map(([k, r]) => `${COMPS[k]} : ${MAITRISE(r).l.toLowerCase()}`).join(" ; ");
    const se = store.bilans[seId(cl, e, mat)]?.p?.[y + "-" + pn] || {}, seTxt = [...Object.entries(SE).filter(([k]) => se[k]).map(([k, l]) => `${l} : ${SE_N[se[k]].toLowerCase()}`), se.txt ? "remarque : " + se.txt : ""].filter(Boolean).join(" ; ");
    t.disabled = true; st.innerHTML = `<span class="thinking">Rédaction…</span>`;
    try{
      const txt = await aiText(`Rédige l'appréciation de bulletin trimestriel d'un élève en ${mat} (classe de ${cl.niveau}).
Prénom : ${e.prenom}
Notes : ${hist.map(x => `${x.c.titre} : ${noteS(isCtrl(x.c) ? noteRetenue(x.c, e)?.retenue ?? final20(x.c, x.cp) : final20(x.c, x.cp))}${x.c.type === "rattrapage" ? " (rattrapage)" : x.c.type === "exercices" ? " (exercices)" : ""}`).join(" ; ")}
Maîtrise par notion : ${notions}
${moys ? "Moyennes : " + moys + " (appréciation du " + perLab(pn).toLowerCase() + ")\n" : ""}${comps ? "Compétences : " + comps + "\n" : ""}${seTxt ? "Savoir-être observé par le professeur : " + seTxt + "\n" : ""}Extraits de commentaires de correction : ${coms}
Style bulletin scolaire français : 2 à 3 phrases, 300 caractères maximum, à la 3e personne avec le prénom, juste, ton ${TON_P[prefs().ton] || TON_P.bienveillant}, avec un point fort et un conseil précis. Uniquement l'appréciation, sans guillemets. N'invente rien qui ne soit pas dans ces données.`, {modelTier:"quick"});
      await write("bilans/" + `${cl.id}_${e.id}_${slug(mat)}`, {texte:txt.trim(), classeId:cl.id, eleveId:e.id, matiere:mat, at:new Date().toISOString()});
    }catch(x){ st.textContent = aiErr(x?.code); t.disabled = false; }
    return; }
  if (t.id === "apprSave"){ const cl = classe(S.su.cl); await write("bilans/" + `${cl.id}_${S.su.el}_${slug(S.su.mat)}`, {texte:$("#appr-txt").value, classeId:cl.id, eleveId:S.su.el, matiere:S.su.mat, at:new Date().toISOString()}); toast("Appréciation enregistrée."); return; }
  if (t.id === "apprCopy"){ const v = $("#appr-txt").value; try { await navigator.clipboard.writeText(v); toast("Copiée."); } catch(x){ $("#appr-txt").select(); toast("Sélectionnée : copie-la."); } return; }
});
document.addEventListener("change", ev => {
  const el = ev.target;
  if (el.id === "su-cl"){ S.su = {cl:el.value}; return render(); }
  if (el.id === "su-mat"){ S.su.mat = el.value; S.su.el = null; S.su.ctrl = null; return render(); }
  if (el.id === "su-y"){ S.su.y = +el.value; S.su.ctrl = null; return render(); }
  if (el.id === "su-ctrl"){ S.su.ctrl = el.value; return render(); }
  if (el.id === "se-p"){ S.su.sp = +el.value; return render(); }
  if (el.dataset.coef){ write("controles/" + el.dataset.coef, {coef:+el.value || 1}, "update"); return; }
  if (el.id === "bk-mat" || el.id === "bk-niv" || el.id === "bk-q"){ S.bk[el.id.slice(3)] = el.value; S.bk.n = 10; S.bk.open = null; return render(); }
  if (el.id === "bkq-search"){ S.bkq = el.value; return render(); }
});

function vDirection(...a){ const sv = store.controles, sc = store.classes; store.controles = store.allCtrl || sv; store.classes = store.allClasses || sc; try { return vDirection_0(...a); } finally { store.controles = sv; store.classes = sc; } }

function vBanque(...a){ const sv = store.controles; store.controles = store.allCtrl || sv; try { return vBanque_0(...a); } finally { store.controles = sv; } }

function bankPanel(...a){ const sv = store.controles; store.controles = store.allCtrl || sv; try { return bankPanel_0(...a); } finally { store.controles = sv; } }
