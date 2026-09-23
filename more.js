
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
        const cv = await html2canvas(pages[i], {scale:2, backgroundColor:"#ffffff", logging:false, scrollX:0, scrollY:-window.scrollY, windowWidth:900, useCORS:true});
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
  const rows = studentsOf(c).map(x => feuille(c.id)?.copies?.[x.id]).filter(k => copyDone(c, k));
  const moy = rows.length ? rows.reduce((a, k) => a + final20(c, k), 0) / rows.length : null;
  const ratt = store.controles.find(x => x.type === "rattrapage" && x.parentId === c.id && x.eleves?.includes(e.id));
  const head = `<div class="sh-head"><div><div class="sh-school">${esc(c.mise?.entete ?? ECOLE)}</div>
    <div class="sh-title" dir="auto">Copie corrigée · ${esc(c.titre)}</div>
    <div class="sh-meta">${esc(c.matiere)} · ${esc(cl?.nom || "")}${c.date ? " · " + esc(frDate(c.date)) : ""}</div>
    <div class="sh-name">Élève : <b>${esc(e.prenom)} ${esc(e.nom)}</b></div></div></div>
    <div class="rd-note"><span class="rd-big">${fmt(final20(c, cp))}</span><span> / 20</span>
      <span class="rd-sub">${[bonusMax(c) ? `note brute ${fmt(on20(copyTotal(c, cp), max))} · bonus propreté ${fmt(b.proprete)} · bonus orthographe ${fmt(b.orthographe)}` : "", moy != null ? `moyenne de la classe ${fmt(moy)}` : ""].filter(Boolean).join(" · ")}</span></div>`;
  const blocks = c.questions.map((q, k) => { const a = cp?.answers?.[q.id], v = vOf(q, cp?.version?.[q.id] || "standard");
    return `<div class="sh-qh"><span>Question ${k + 1}${q.notion ? " · " + esc(q.notion) : ""}</span><span class="rd-q">${fmt(noteOf(a))} / ${fmt(+q.points)}</span></div>
      <div class="sh-qt" dir="auto">${esc(v.enonce)}</div>
      ${a?.crop ? `<img class="rd-crop" alt="" src="${esc(blobSrc(a.crop))}">` : ""}
      ${a?.commentaire ? `<div class="rd-com" dir="auto">${esc(a.commentaire)}</div>` : ""}
      ${(a?.acquis || []).length ? `<div class="rd-tag">Acquis : ${esc(a.acquis.join(", "))}</div>` : ""}
      ${(a?.erreurs || []).length ? `<div class="rd-tag">À retravailler : ${esc(a.erreurs.join(", "))}</div>` : ""}`; });
  if (ratt) blocks.push(`<div class="sh-cons">Une feuille de rattrapage personnelle t'a été préparée : « ${esc(ratt.titre)} ». Fais-la sérieusement, elle cible exactement tes erreurs.</div>`);
  return docPages(head, blocks, `Tikoun · copie corrigée · ${e.prenom} ${e.nom}`);
}

/* ================= 2. Suivi par notion ================= */
const nkey = s => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
const slug = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-");
function notionStats(cl, mat){
  const cs = store.controles.filter(c => c.classeId === cl.id && c.matiere === mat);
  const labels = {}, per = {}, count = {};
  for (const c of cs){ const f = feuille(c.id); if (!f) continue;
    for (const e of cl.eleves || []){ const cp = f.copies?.[e.id]; if (!cp?.validee) continue;
      for (const q of c.questions || []){ const n = noteOf(cp.answers?.[q.id]); if (n == null || !+q.points) continue;
        const k = nkey(q.notion) || "(sans notion)"; labels[k] = labels[k] || q.notion || "(sans notion)"; count[k] = (count[k] || 0) + 1;
        const o = ((per[e.id] = per[e.id] || {})[k] = per[e.id]?.[k] || {s:0, n:0}); o.s += n / q.points; o.n++; } } }
  return {cs, labels, per, notions:Object.keys(count).sort((a, b) => count[b] - count[a])};
}
function studentCtrls(cl, mat, e){
  return store.controles.filter(c => c.classeId === cl.id && c.matiere === mat).map(c => ({c, cp:feuille(c.id)?.copies?.[e.id]})).filter(x => copyDone(x.c, x.cp))
    .sort((a, b) => (a.c.date || a.c.createdAt || "").localeCompare(b.c.date || b.c.createdAt || ""));
}
function vSuivi(){
  if (!store.classes.length) return `<div class="head"><h2>Suivi des élèves</h2></div><div class="panel empty">Crée d'abord une classe.</div>`;
  const cl = classe(S.su?.cl) || store.classes[0]; S.su = S.su || {}; S.su.cl = cl.id;
  const mats = [...new Set(store.controles.filter(c => c.classeId === cl.id).map(c => c.matiere))];
  const mat = mats.includes(S.su.mat) ? S.su.mat : mats[0]; S.su.mat = mat;
  const top = `<div class="head"><div><h2>Suivi des élèves</h2><p>Maîtrise de chaque notion sur toute l'année, calculée sur les copies validées.</p></div>
    <div class="row"><select id="su-cl" style="width:auto" aria-label="Classe">${selOpts(store.classes, cl.id, x => x.nom, x => x.id)}</select>
    ${mats.length ? `<select id="su-mat" style="width:auto" aria-label="Matière">${selOpts(mats, mat)}</select>` : ""}</div></div>`;
  if (!mat) return top + `<div class="panel empty">Aucun contrôle pour cette classe.</div>`;
  const st = notionStats(cl, mat), cols = st.notions.slice(0, 10);
  const ms = (eid, k) => { const o = st.per[eid]?.[k]; return o ? o.s / o.n : null; };
  const lab = r => r == null ? "" : r >= .7 ? "Maîtrisé" : r >= .5 ? "Fragile" : "Non acquis";
  const e = (cl.eleves || []).find(x => x.id === S.su.el);
  let detail = "";
  if (e){
    const hist = studentCtrls(cl, mat, e), avg = hist.filter(x => x.c.type !== "rattrapage").map(x => final20(x.c, x.cp));
    const bil = store.bilans[`${cl.id}_${e.id}_${slug(mat)}`];
    const nl = st.notions.map(k => ({k, r:ms(e.id, k), n:st.per[e.id]?.[k]?.n || 0})).filter(x => x.r != null).sort((a, b) => a.r - b.r);
    detail = `<section class="panel grid">
      <div class="row between"><div><div class="label">${esc(mat)}</div><h3 style="font-size:20px">${esc(e.prenom)} ${esc(e.nom)}</h3></div>
        <div class="total num" style="color:var(--ink)">${avg.length ? fmt(avg.reduce((a, b) => a + b, 0) / avg.length) : "—"}<small>/20</small></div></div>
      <div class="grid g2">
        <div><div class="label" style="margin-bottom:6px">Notions, de la plus fragile à la plus solide</div>
          <div class="bars">${nl.map(x => `<div class="bar" style="grid-template-columns:1fr 90px 44px"><span class="small">${esc(st.labels[x.k])} <span class="muted">(${x.n})</span></span><div class="track"><div class="fill" style="width:${Math.round(x.r * 100)}%;background:var(--${tone(x.r)})"></div></div><span class="num small" style="text-align:right">${pct(x.r)}</span></div>`).join("") || `<p class="muted small">Aucune copie validée.</p>`}</div></div>
        <div><div class="label" style="margin-bottom:6px">Contrôles</div>${hist.map(x => `<div class="item"><div><div class="t small">${x.c.type === "rattrapage" ? "↺ " : ""}${esc(x.c.titre)}</div><div class="s">${esc(frDate(x.c.date) || "")}</div></div><span class="cell ${tone(final20(x.c, x.cp) / 20)}">${fmt(final20(x.c, x.cp))}</span></div>`).join("") || `<p class="muted small">Aucun.</p>`}</div>
      </div>
      <div class="grid" style="gap:8px"><div class="row between"><div class="label">Appréciation pour le bulletin</div><button class="btn sm" id="appr" data-e="${e.id}">${bil ? "Réécrire" : "Rédiger"} (IA)</button></div>
        <div class="status" id="appr-st"></div>
        ${bil ? `<textarea id="appr-txt" data-live>${esc(bil.texte)}</textarea><div class="row"><button class="btn sm" id="apprSave">Enregistrer ma version</button><button class="btn sm ghost" id="apprCopy">Copier</button></div>` : `<p class="muted small">Rédigée à partir des notes, des notions et des commentaires de l'année. Tu la relis et la modifies.</p>`}</div>
    </section>`;
  }
  return top + `<section class="panel"><p class="small muted">Vert : maîtrisé (70 % et plus) · orange : fragile · rouge : non acquis. Touche un élève pour son détail.</p>
    <div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th>Élève</th>${cols.map(k => `<th class="c" title="${esc(st.labels[k])}" style="max-width:110px;overflow:hidden;text-overflow:ellipsis">${esc(st.labels[k].slice(0, 16))}</th>`).join("")}</tr></thead><tbody>
    ${(cl.eleves || []).map(x => `<tr class="clickable ${x.id === S.su.el ? "sel" : ""}" data-suel="${x.id}"><td><b>${esc(x.prenom)} ${esc(x.nom)}</b></td>${cols.map(k => { const r = ms(x.id, k); return `<td class="c"><span class="cell ${tone(r)}" title="${lab(r)}">${r == null ? "—" : Math.round(r * 100)}</span></td>`; }).join("")}</tr>`).join("")}
    </tbody></table></div></section>` + detail;
}

/* ================= 3. Vue direction ================= */
function vDirection(){
  const cls = store.classes; if (!cls.length) return `<div class="head"><h2>Direction</h2></div><div class="panel empty">Aucune classe.</div>`;
  const mats = [...new Set(store.controles.filter(c => c.type !== "rattrapage").map(c => c.matiere))];
  const avgOf = (cl, mat, e) => { const v = studentCtrls(cl, mat, e).filter(x => x.c.type !== "rattrapage" && x.cp.validee).slice(-3).map(x => final20(x.c, x.cp)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const grid = cls.map(cl => ({cl, m:Object.fromEntries(mats.map(mat => { const v = (cl.eleves || []).map(e => avgOf(cl, mat, e)).filter(x => x != null); return [mat, v.length ? v.reduce((a, b) => a + b, 0) / v.length : null]; }))}));
  const risk = []; cls.forEach(cl => (cl.eleves || []).forEach(e => { const low = mats.map(m => [m, avgOf(cl, m, e)]).filter(([, a]) => a != null && a < 10); if (low.length >= 2) risk.push({cl, e, low}); }));
  const weak = []; cls.forEach(cl => mats.forEach(mat => { const st = notionStats(cl, mat); st.notions.forEach(k => { const v = Object.values(st.per).map(p => p[k]).filter(Boolean); if (v.length >= 3){ const r = v.reduce((a, o) => a + o.s / o.n, 0) / v.length; if (r < .5) weak.push({cl, mat, label:st.labels[k], r, n:v.length}); } }); }));
  weak.sort((a, b) => a.r - b.r);
  const since = Date.now() - 30 * 864e5, recent = store.controles.filter(c => Date.parse(c.createdAt || 0) > since);
  let pending = 0; store.controles.forEach(c => { const f = feuille(c.id); if (f) Object.values(f.copies || {}).forEach(cp => { if (!cp.validee && Object.keys(cp.answers || {}).length) pending++; }); });
  return `<div class="head"><div><h2>Vue direction</h2><p>Toutes les classes et matières d'un coup d'œil. Moyennes sur les 3 derniers contrôles validés.</p></div></div>
  <div class="grid g3">
    <div class="panel"><div class="label">Contrôles créés · 30 jours</div><div class="total num" style="color:var(--ink)">${recent.filter(c => c.type !== "rattrapage").length}</div></div>
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
function vBanque(){
  const b = S.bk = S.bk || {mat:"", niv:"", q:""};
  const all = store.controles.filter(c => c.type !== "rattrapage" && (!b.mat || c.matiere === b.mat) && (!b.niv || c.niveau === b.niv)
    && (!b.q || nkey(c.titre + " " + (c.questions || []).map(q => q.notion + " " + vOf(q, "standard").enonce).join(" ")).includes(nkey(b.q))))
    .sort((x, y) => (y.createdAt || "").localeCompare(x.createdAt || ""));
  const mats = [...new Set(store.controles.map(c => c.matiere))];
  return `<div class="head"><div><h2>Banque de contrôles</h2><p>Tout contrôle créé ici se réutilise : pour une autre classe, une autre année, ou question par question. Partage l'application aux autres profs (et aux autres sites) pour une banque commune.</p></div></div>
  <section class="panel"><div class="form-row">
    <div class="field"><label for="bk-mat">Matière</label><select id="bk-mat"><option value="">Toutes</option>${selOpts(mats, b.mat)}</select></div>
    <div class="field"><label for="bk-niv">Niveau</label><select id="bk-niv"><option value="">Tous</option>${selOpts(NIVEAUX, b.niv)}</select></div>
    <div class="field"><label for="bk-q">Rechercher (notion, mot)</label><input id="bk-q" value="${esc(b.q)}" placeholder="ex. antécédent"></div></div></section>
  <section class="panel">${all.map(c => `<div class="item" style="align-items:flex-start"><div><div class="t">${esc(c.titre)}</div>
      <div class="s">${esc(c.matiere)} · ${esc(c.niveau || "")} · ${(c.questions || []).length} questions · créé pour ${esc(classe(c.classeId)?.nom || "?")}</div>
      <div class="tags" style="margin-top:4px">${[...new Set((c.questions || []).map(q => q.notion).filter(Boolean))].slice(0, 5).map(n => `<span class="chip">${esc(n)}</span>`).join("")}</div></div>
      <div class="row" style="justify-content:flex-end"><select id="dup-${c.id}" style="width:auto" aria-label="Classe">${selOpts(store.classes, c.classeId, x => x.nom, x => x.id)}</select><button class="btn sm primary" data-dup="${c.id}">Dupliquer</button></div></div>`).join("") || `<p class="empty">Aucun contrôle ne correspond.</p>`}</section>`;
}
function bankPanel(c){
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
  p.innerHTML = `<div class="sh-head"><div><div class="sh-school">${esc(ECOLE)}</div><div class="sh-title">Fiche d'écriture</div>
    <div class="sh-meta">${esc(cl.nom)} · à remplir en début d'année et en janvier</div><div class="sh-name">Élève : <b>${esc(e.prenom)} ${esc(e.nom)}</b></div></div></div>
    <div class="sh-cons">Recopie chaque modèle dans le cadre juste en dessous, avec ton écriture habituelle. L'hébreu en cursive. Écris au stylo foncé.</div>`;
  FICHE.forEach(f => { const b = document.createElement("div"); b.className = "sh-q";
    b.innerHTML = `<div class="sh-qh"><span>${esc(f.titre)}</span></div><div class="sh-qt ${f.usage === "hebreu" ? "he" : ""}" dir="auto" style="font-size:19px">${esc(f.texte)}</div><div class="sh-box" style="--lh:60px;height:66px"></div>`; p.append(b); });
  for (const [k, [x, y]] of Object.entries(CORNERS)){ const z = CSIZE[k], im = document.createElement("img"); im.className = "sh-corner"; im.alt = "";
    im.src = qrURL(k === "tl" ? `TK1W|${cl.id}|${e.id}|1` : "TK1C|" + k, 3); im.style.cssText = `left:${x - z / 2}px;top:${y - z / 2}px;width:${z}px;height:${z}px`; p.append(im); }
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
        const r = await ai(`Chaque image est une ligne manuscrite écrite par un élève. Transcris exactement ce qui est écrit, caractère par caractère, sans corriger. L'hébreu en caractères hébreux carrés. Réponds uniquement en JSON : {"lignes":["…"]} avec ${part.length} élément(s), dans l'ordre des images.`, {images: await Promise.all(part.map(cv => toBlob(cv, .9)))});
        (r?.lignes || []).forEach((t, j) => { if (samples[i + j]){ samples[i + j].lu = String(t); samples[i + j].sim = simil(samples[i + j].texte, t); } });
      }
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
  const t = ev.target.closest("button, tr[data-suel]"); if (!t) return;
  const d = t.dataset;
  if (d.suel){ S.su.el = d.suel; render(); $("#appr")?.scrollIntoView({block:"center"}); return; }
  if (t.id === "addQcm"){ const c = ctrl(S.editId); c.questions.push({...mapQ({type:"qcm", points:2, versions:{standard:{enonce:"", choix:["", "", "", ""], bonnes:[0]}}})}); await saveCtrl(c); return; }
  if (t.id === "bankOpen"){ S.bankOpen = !S.bankOpen; return render(); }
  if (d.bankadd){ const [cid, qid] = d.bankadd.split("|"); const src = ctrl(cid)?.questions?.find(q => q.id === qid), c = ctrl(S.editId);
    if (!src || !c) return; const nq = structuredClone(src); nq.id = "q" + uid(5); c.questions.push(nq); await saveCtrl(c); toast("Question ajoutée."); return; }
  if (d.dup){ const src = ctrl(d.dup); const cl = $("#dup-" + src.id).value; const id = uid(12);
    const {id:_, analyse, ...rest} = structuredClone(src);
    await write("controles/" + id, {...rest, classeId:cl, niveau:classe(cl)?.niveau || rest.niveau, statut:"brouillon", date:"", createdAt:new Date().toISOString(), sourceId:src.id});
    S.editId = id; toast("Copie créée : modifie-la puis imprime."); return go("edit"); }
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
    t.disabled = true; st.innerHTML = `<span class="thinking">Rédaction…</span>`;
    try{
      const txt = await aiText(`Rédige l'appréciation de bulletin trimestriel d'un élève en ${mat} (classe de ${cl.niveau}).
Prénom : ${e.prenom}
Notes : ${hist.map(x => `${x.c.titre} : ${fmt(final20(x.c, x.cp))}/20${x.c.type === "rattrapage" ? " (rattrapage)" : ""}`).join(" ; ")}
Maîtrise par notion : ${notions}
Extraits de commentaires de correction : ${coms}
Style bulletin scolaire français : 2 à 3 phrases, 300 caractères maximum, à la 3e personne avec le prénom, juste et encourageante, avec un point fort et un conseil précis. Uniquement l'appréciation, sans guillemets. N'invente rien qui ne soit pas dans ces données.`, {modelTier:"quick"});
      await write("bilans/" + `${cl.id}_${e.id}_${slug(mat)}`, {texte:txt.trim(), classeId:cl.id, eleveId:e.id, matiere:mat, at:new Date().toISOString()});
    }catch(x){ st.textContent = aiErr(x?.code); t.disabled = false; }
    return; }
  if (t.id === "apprSave"){ const cl = classe(S.su.cl); await write("bilans/" + `${cl.id}_${S.su.el}_${slug(S.su.mat)}`, {texte:$("#appr-txt").value, classeId:cl.id, eleveId:S.su.el, matiere:S.su.mat, at:new Date().toISOString()}); toast("Appréciation enregistrée."); return; }
  if (t.id === "apprCopy"){ const v = $("#appr-txt").value; try { await navigator.clipboard.writeText(v); toast("Copiée."); } catch(x){ $("#appr-txt").select(); toast("Sélectionnée : copie-la."); } return; }
});
document.addEventListener("change", ev => {
  const el = ev.target;
  if (el.id === "su-cl"){ S.su = {cl:el.value}; return render(); }
  if (el.id === "su-mat"){ S.su.mat = el.value; S.su.el = null; return render(); }
  if (el.id === "bk-mat" || el.id === "bk-niv" || el.id === "bk-q"){ S.bk[el.id.slice(3)] = el.value; return render(); }
  if (el.id === "bkq-search"){ S.bkq = el.value; return render(); }
});
