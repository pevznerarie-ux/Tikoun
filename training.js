/* ================= Entraînement de la lecture (administrateur) =================
   Banque d'écriture anonymisée : image d'un cadre ou d'une copie + texte validé.
   Elle mesure la précision de lecture de l'IA et nourrit les « aides de lecture » ajoutées à chaque demande de lecture. */
S.tr = {queue:[], cur:0, stats:null, list:null, cons:null, q:"", busy:false, test:null, sel:null, meta:{matiere:"", langue:"", niveau:""}};
window.LECT = null; let LECT_AT = 0;
async function loadLect(){ LECT_AT = Date.now(); try { const r = await fetch("/api/banque/conseils", {credentials:"same-origin"}); if (r.ok) window.LECT = await r.json(); } catch(e){} }
setInterval(() => { if (window.TIKOUN_CONFIG?.accounts && S.me && Date.now() - LECT_AT > 20 * 60e3) loadLect(); }, 4000);
function lectureTips(){
  const c = window.LECT; if (!c) return "";
  const pairs = [...(c.ajouts || []), ...(c.confusions || [])].slice(0, 40).map(x => `« ${x.ia} » → « ${x.vrai} »`).join(" ; ");
  const r = String(c.regles || "").trim(); if (!pairs && !r) return "";
  return `\nAides de lecture, tirées des corrections des professeurs (elles servent seulement à mieux déchiffrer les lettres ; ne corrige jamais l'orthographe de l'élève) :${r ? "\n" + r.slice(0, 1500) : ""}${pairs ? `\nConfusions fréquentes (lu par erreur → vrai texte) : ${pairs}.` : ""}\n`;
}
/* Envoi à la banque (seulement si le prof a accepté le partage anonyme) */
function bankPush(items){
  if (!window.TIKOUN_CONFIG?.accounts || !S.me?.partageEcriture) return;
  const ok = items.filter(x => x && x.asset && String(x.texte || "").trim()); if (!ok.length) return;
  fetch("/api/banque", {method:"POST", credentials:"same-origin", headers:{"content-type":"application/json"}, body:JSON.stringify({items:ok})}).catch(() => {});
}
const bankMeta = C => ({matiere:C.matiere || "", langue:C.langue || langueDef(""), niveau:C.niveau || ""});
const pctS = x => x == null ? "—" : Math.round(x * 100) + (document.documentElement.lang === "en" ? "%" : " %");

async function trLoad(){
  try { const [st, li, co] = await Promise.all([api("/api/banque/stats"), api("/api/banque?q=" + encodeURIComponent(S.tr.q)), api("/api/banque/conseils")]); S.tr.stats = st; S.tr.list = li; S.tr.cons = co; window.LECT = co; }
  catch(e){ toast(e.message); } render();
}
function vEntrainement(){
  if (!isAdmin()) return `<div class="panel empty">Réservé à l'administrateur.</div>`;
  if (!S.tr.stats && !S.tr.busy){ S.tr.busy = true; trLoad().finally(() => { S.tr.busy = false; }); }
  const st = S.tr.stats || {}, it = S.tr.queue[S.tr.cur];
  const card = (l, v, s) => `<div class="panel"><div class="label">${l}</div><div class="total num" style="color:var(--ink)">${v}</div>${s ? `<div class="small muted">${s}</div>` : ""}</div>`;
  const tbl = (title, rows) => rows?.length ? `<div><b class="small">${title}</b><div class="tbl-wrap"><table><thead><tr><th></th><th class="c">Échantillons</th><th class="c">Lettres justes</th><th class="c">Mots justes</th></tr></thead><tbody>${rows.slice(0, 8).map(r => `<tr><td>${esc(r.k)}</td><td class="c num">${r.n}</td><td class="c num">${pctS(r.lettres)}</td><td class="c num">${pctS(r.mots)}</td></tr>`).join("")}</tbody></table></div></div>` : "";
  const months = st.parMois || [];
  return `<div class="head"><div><h2>Entraînement de la lecture</h2><p>Fais passer d'anciennes copies une par une : l'IA lit, tu corriges. Chaque correction mesure la précision et apprend à l'IA les erreurs à ne plus faire.</p></div></div>
  <div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:14px">${card("Échantillons", st.total ?? "—", st.mesures ? st.mesures + " mesuré(s)" : "")}${card("Lettres lues justes", pctS(st.lettres))}${card("Mots lus justes", pctS(st.mots))}</div>
  ${months.length > 1 ? `<section class="panel"><h3>Évolution de la précision (mots justes)</h3><div class="row" style="align-items:flex-end;gap:10px;height:120px;margin-top:8px">${months.slice(-12).map(m => `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1"><span class="small num">${pctS(m.mots)}</span><div style="width:100%;max-width:36px;height:${Math.max(4, Math.round((m.mots || 0) * 80))}px;background:var(--gold);border-radius:3px"></div><span class="small muted">${esc(m.k.slice(5))}/${esc(m.k.slice(2, 4))}</span></div>`).join("")}</div></section>` : ""}

  <section class="panel grid"><div class="row between"><h3>Ajouter des copies</h3><label class="btn primary" for="tr-files">Choisir des photos ou des PDF</label><input id="tr-files" type="file" accept="image/*,application/pdf" multiple hidden></div>
    <p class="small muted" style="margin:0">Pour chaque photo : encadre un passage, l'IA le lit, tu corriges seulement les mots faux. Tu peux enregistrer plusieurs passages de la même copie.</p>
    ${it ? trItem(it) : `<p class="small muted" style="margin:0">Aucune copie en attente.</p>`}</section>

  <section class="panel grid"><h3>Importer une base publique</h3>
    <p class="small muted" style="margin:0">Le serveur télécharge depuis Hugging Face des lignes manuscrites avec leur texte exact. L'IA les lit, la précision et les erreurs fréquentes sont calculées toutes seules : rien à corriger, rien n'est mis dans GitHub. Chaque nouvel import reprend là où le précédent s'est arrêté.</p>
    <div class="form-row" style="grid-template-columns:minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) auto;align-items:end">
      <div class="field"><label for="hf-ds">Base (auteur/nom sur Hugging Face)</label><input id="hf-ds" value="${esc(S.tr.hfds || "Teklia/RIMES-2011-line")}" list="hf-list"><datalist id="hf-list"><option value="Teklia/RIMES-2011-line">RIMES · français</option></datalist></div>
      <div class="field"><label for="hf-lang">Langue</label><select id="hf-lang">${selOpts(LANGUES, S.tr.hflang || "Français")}</select></div>
      <div class="field"><label for="hf-n">Lignes</label><select id="hf-n">${selOpts(["20", "50", "100", "200", "300"], S.tr.hfn || "50")}</select></div>
      <button class="btn primary" id="hf-go" ${S.tr.hfBusy ? "disabled" : ""}>Importer et tester</button></div>
    <div class="status" id="hf-st">${esc(S.tr.hfMsg || "")}</div></section>

  <section class="panel grid"><h3>Aides de lecture envoyées à l'IA</h3>
    <div class="field"><label for="tr-regles">Règles écrites par toi (ex. : « Dans nos copies, le ה cursif ressemble souvent à un ח : regarde l'ouverture en haut à gauche. »)</label><textarea id="tr-regles" rows="4">${esc(S.tr.cons?.regles || "")}</textarea></div>
    <div class="form-row"><div class="field"><label for="tr-aia">L'IA lit</label><input id="tr-aia" placeholder="ex. Hashem"></div><div class="field"><label for="tr-avr">Il fallait lire</label><input id="tr-avr" placeholder="ex. Hachem"></div><button class="btn sm" id="tr-aadd" style="align-self:end">Ajouter</button></div>
    ${(S.tr.cons?.ajouts || []).length ? `<div class="row">${S.tr.cons.ajouts.map((x, i) => `<span class="chip">« ${esc(x.ia)} » → « ${esc(x.vrai)} » <button class="btn sm ghost" style="padding:0 4px" data-trad="${i}" aria-label="Retirer">×</button></span>`).join("")}</div>` : ""}
    <div><b class="small">Confusions trouvées automatiquement dans les corrections</b>${(S.tr.cons?.confusions || []).length ? `<div class="row" style="margin-top:6px">${S.tr.cons.confusions.map(x => `<span class="chip">« ${esc(x.ia)} » → « ${esc(x.vrai)} » <span class="muted">×${x.n}</span> <button class="btn sm ghost" style="padding:0 4px" data-troff="${esc(x.k)}" aria-label="Ignorer">×</button></span>`).join("")}</div>` : `<p class="small muted" style="margin:4px 0 0">Elles apparaissent dès qu'une même erreur a été corrigée au moins deux fois.</p>`}</div>
    <div class="row"><button class="btn primary" id="tr-rsave">Enregistrer les règles</button><button class="btn" id="tr-test">Tester la précision actuelle (10 copies)</button></div>
    <div class="status" id="tr-tst">${S.tr.test ? esc(S.tr.test) : ""}</div></section>

  ${st.mesures ? `<section class="panel grid"><div class="grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:16px">${tbl("Par langue", st.parLangue)}${tbl("Par matière", st.parMatiere)}</div>${tbl("Par origine", (st.parSource || []).map(r => ({...r, k:{correction:"Corrections des profs", validation:"Copies validées", modele:"Feuilles modèles d'écriture", admin:"Ajouts de l'admin", public:"Bases publiques"}[r.k] || r.k})))}</section>` : ""}

  <section class="panel grid"><div class="row between"><h3>Banque d'écriture ${S.tr.list ? `<span class="muted small">· ${S.tr.list.total}</span>` : ""}</h3><div class="row"><input id="tr-q" placeholder="Rechercher un mot" value="${esc(S.tr.q)}" style="max-width:220px"><button class="btn sm" id="tr-qgo">Chercher</button></div></div>
    ${(S.tr.list?.items || []).map(s => `<div class="item" style="align-items:flex-start;gap:14px"><img src="${esc(blobSrc(s.asset))}" alt="" loading="lazy" style="width:220px;max-height:120px;object-fit:contain;background:#fff;border:1px solid var(--line);border-radius:6px" data-zoom="${esc(blobSrc(s.asset))}">
      <div style="flex:1;min-width:0;display:grid;gap:4px"><div class="small muted">${esc([s.matiere, s.langue, s.niveau].filter(Boolean).join(" · "))} · ${esc(frDate((s.at || "").slice(0, 10)))}${s.cer != null ? ` · <b>${pctS(1 - s.cer)}</b> des lettres` : ""}</div>
        <div dir="auto" style="white-space:pre-wrap"><b>${esc(s.texte)}</b></div>${s.texteIA && s.texteIA !== s.texte ? `<div dir="auto" class="small muted" style="white-space:pre-wrap">IA : ${esc(s.texteIA)}</div>` : ""}</div>
      <div class="row"><button class="btn sm ghost" data-tred="${s.id}">Modifier</button><button class="btn sm ghost" data-trdel="${s.id}">Supprimer</button></div></div>`).join("") || `<p class="small muted">La banque est vide pour l'instant.</p>`}</section>`;
}
function trItem(it){
  const n = S.tr.queue.length, m = S.tr.meta, P = it.passage;
  const meta = `<div class="form-row" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="field"><label for="tr-mat">Matière</label><select id="tr-mat">${matOpts(m.matiere || myMatieres()[0])}</select></div><div class="field"><label for="tr-lang">Langue</label><select id="tr-lang">${selOpts(LANGUES, m.langue || langueDef(""))}</select></div><div class="field"><label for="tr-niv">Niveau</label><select id="tr-niv">${selOpts(NIVEAUX, m.niveau || NIVEAUX[3])}</select></div></div>`;
  const head = `<div class="row between"><span class="small muted">Copie ${S.tr.cur + 1} sur ${n} · ${esc(it.name)}${it.faits ? ` · <b>${it.faits}</b> passage(s) enregistré(s)` : ""}</span><div class="row"><button class="btn sm ghost" id="tr-skip">${it.faits ? "Copie suivante" : "Passer cette copie"}</button></div></div>`;
  if (!P) return `<div class="grid" style="gap:12px">${head}${meta}
    <p style="margin:0"><b>1.</b> Encadre un carré de texte manuscrit : quelques mots ou quelques lignes, sans le nom de l'élève.</p>
    <div id="tr-stage" style="position:relative;background:#fff;border:1px solid var(--line);border-radius:8px;overflow:hidden;touch-action:none;cursor:crosshair;max-width:900px"><canvas id="tr-cv" style="width:100%;display:block"></canvas><div id="tr-box" style="position:absolute;border:2px solid var(--gold);background:rgba(183,134,43,.12);display:none;pointer-events:none"></div></div>
    <div class="row"><button class="btn primary" id="tr-go">Lire ce passage</button><button class="btn sm ghost" id="tr-rot">Pivoter la photo</button></div></div>`;
  const lines = P.words || [], ne = Object.keys(P.edits || {}).length;
  const word = (w, key) => { const e = P.edits?.[key];
    if (S.tr.editing === key) return `<span class="row" style="gap:4px"><input id="tr-wed" dir="auto" value="${esc(e ?? w)}" style="width:${Math.max(6, (e ?? w).length + 3)}ch;padding:6px 8px"><button class="btn sm primary" data-wok="${key}" aria-label="Valider">✓</button></span>`;
    return e != null ? `<button class="btn sm" data-w="${key}" style="border-color:var(--gold);background:#FBF3E2" title="Cliquer pour modifier"><s class="muted">${esc(w)}</s>&nbsp;${e ? esc(e) : "<i>supprimé</i>"}</button>`
      : `<button class="btn sm ghost" data-w="${key}" style="border:1px solid var(--line)">${esc(w)}</button>`; };
  return `<div class="grid" style="gap:12px">${head}${meta}
    <div style="background:#fff;border:1px solid var(--line);border-radius:8px;padding:10px;display:grid;place-items:center"><img src="${P.url}" alt="Passage sélectionné" style="max-width:100%;max-height:260px"></div>
    ${P.reading ? `<p class="small"><span class="thinking">L'IA lit le passage…</span></p>` : `
    <p style="margin:0"><b>2.</b> Voici ce que l'IA a lu. Clique sur chaque mot faux et écris le bon (vide = mot en trop ; plusieurs mots possibles pour un mot oublié).</p>
    <div class="grid" style="gap:8px;padding:12px;background:var(--paper);border:1px solid var(--line);border-radius:8px">${lines.length ? lines.map((l, li) => `<div dir="auto" class="row" style="gap:6px;flex-wrap:wrap">${l.map((w, wi) => word(w, li + ":" + wi)).join("")}<button class="btn sm ghost" data-wadd="${li}" style="border:1px dashed var(--gold);color:var(--muted)" title="Mot oublié en fin de ligne">+ mot oublié</button>${(P.adds?.[li] || []).map((a, ai) => `<span class="chip" style="background:#FBF3E2">+ ${esc(a)} <button class="btn sm ghost" style="padding:0 4px" data-wadx="${li}:${ai}" aria-label="Retirer">×</button></span>`).join("")}</div>`).join("") : `<span class="small muted">L'IA n'a rien lu : écris le texte avec le + ci-dessous.</span><div><button class="btn sm ghost" data-wadd="0">+ Ajouter le texte</button></div>`}</div>
    <div class="row"><button class="btn primary" id="tr-save">${ne || Object.values(P.adds || {}).some(a => a.length) ? `Enregistrer les corrections` : "Tout est juste : enregistrer"}</button><button class="btn ghost" id="tr-redo">Choisir un autre passage</button></div>`}</div>`;
}
const trTokens = t => String(t || "").split(/\n/).map(l => l.trim().split(/\s+/).filter(Boolean)).filter(l => l.length);
function trFinal(P){ return (P.words.length ? P.words : [[]]).map((l, li) => [...l.map((w, wi) => P.edits?.[li + ":" + wi] ?? w), ...(P.adds?.[li] || [])].filter(Boolean).join(" ")).filter(Boolean).join("\n"); }
function trPairs(P){ const out = []; P.words.forEach((l, li) => l.forEach((w, wi) => { const e = P.edits?.[li + ":" + wi]; if (e != null && e !== w) out.push({ia:w, vrai:e}); })); return out; }
function trDraw(){
  const it = S.tr.queue[S.tr.cur], cv = $("#tr-cv"); if (!it || !cv) return;
  cv.width = it.cv.width; cv.height = it.cv.height; cv.getContext("2d").drawImage(it.cv, 0, 0);
}
new MutationObserver(() => { const cv = document.getElementById("tr-cv"); if (cv && !cv.dataset.done){ cv.dataset.done = 1; trDraw(); } const w = document.getElementById("tr-wed"); if (w && !w.dataset.f){ w.dataset.f = 1; w.focus(); w.select(); } }).observe(document.documentElement, {childList:true, subtree:true});
document.addEventListener("pointerdown", ev => {
  const st = ev.target.closest?.("#tr-stage"); if (!st) return; const r = st.getBoundingClientRect(), box = $("#tr-box");
  const x0 = ev.clientX - r.left, y0 = ev.clientY - r.top; S.tr.sel = null; st.setPointerCapture(ev.pointerId);
  const move = e => { const x = Math.max(0, Math.min(r.width, e.clientX - r.left)), y = Math.max(0, Math.min(r.height, e.clientY - r.top));
    const b = {x:Math.min(x0, x), y:Math.min(y0, y), w:Math.abs(x - x0), h:Math.abs(y - y0)}; Object.assign(box.style, {display:"block", left:b.x + "px", top:b.y + "px", width:b.w + "px", height:b.h + "px"}); S.tr.sel = {...b, W:r.width, H:r.height}; };
  const up = () => { st.removeEventListener("pointermove", move); st.removeEventListener("pointerup", up); if (!S.tr.sel || S.tr.sel.w < 12 || S.tr.sel.h < 12){ S.tr.sel = null; box.style.display = "none"; } };
  st.addEventListener("pointermove", move); st.addEventListener("pointerup", up);
});
async function trAddFiles(files){
  for (const f of files){ try { const cvs = await fileToCanvases(f); cvs.forEach((cv, i) => S.tr.queue.push({id:uid(8), name:f.name + (cvs.length > 1 ? " · p. " + (i + 1) : ""), cv, faits:0})); } catch(e){ toast("Fichier illisible : " + f.name); } }
  render(); setTimeout(() => $("#tr-stage")?.scrollIntoView({block:"center", behavior:"smooth"}), 60);
}
async function trRead(it){
  const P = it.passage; P.reading = true; render();
  try { const r = await ai(`Transcris exactement ce qui est écrit à la main sur cette image, ligne par ligne, caractère par caractère, sans corriger l'orthographe. ${MATH_RULE} L'hébreu en caractères hébreux carrés, dans l'ordre de lecture. Passage vraiment illisible : [illisible]. Ignore le texte imprimé (consignes, en-têtes, cadres) : seulement l'écriture manuscrite.${lectureTips()}\nRéponds uniquement en JSON : {"texte":"…"}`, {images:[P.blob]});
    P.texteIA = String(r?.texte ?? ""); P.words = trTokens(P.texteIA); P.edits = {}; P.adds = {}; }
  catch(e){ toast(aiErr(e?.code)); P.texteIA = ""; P.words = []; P.edits = {}; P.adds = {}; }
  P.reading = false; render();
}
document.addEventListener("change", ev => { if (ev.target.id === "tr-files"){ const fs = [...ev.target.files]; ev.target.value = ""; trAddFiles(fs); }
  if (["tr-mat", "tr-lang", "tr-niv"].includes(ev.target.id) && ev.target.value !== "__add") S.tr.meta[{"tr-mat":"matiere", "tr-lang":"langue", "tr-niv":"niveau"}[ev.target.id]] = ev.target.value; });
document.addEventListener("keydown", ev => { if (ev.target.id !== "tr-wed") return;
  if (ev.key === "Enter"){ ev.preventDefault(); document.querySelector("[data-wok]")?.click(); }
  if (ev.key === "Escape"){ S.tr.editing = null; render(); } });
document.addEventListener("click", async ev => {
  const t = ev.target.closest("button"); if (!t || S.view !== "entrainement") return; const d = t.dataset, it = S.tr.queue[S.tr.cur], P = it?.passage;
  try {
    if (t.id === "tr-go" && it){ if (!S.tr.sel) return toast("Encadre d'abord un passage en glissant sur la photo.");
      const s = S.tr.sel, k = it.cv.width / s.W, c = crop(it.cv, s.x * k, s.y * k, s.w * k, s.h * k); S.tr.sel = null;
      const blob = await toBlob(scaled(c, 1600), .88); it.passage = {cv:c, blob, url:URL.createObjectURL(blob)}; return trRead(it); }
    if (t.id === "tr-rot" && it){ const o = document.createElement("canvas"); o.width = it.cv.height; o.height = it.cv.width; const g = o.getContext("2d"); g.translate(o.width, 0); g.rotate(Math.PI / 2); g.drawImage(it.cv, 0, 0); it.cv = o; return render(); }
    if (t.id === "tr-redo" && it){ it.passage = null; S.tr.editing = null; return render(); }
    if (t.id === "tr-skip"){ S.tr.queue.splice(S.tr.cur, 1); if (S.tr.cur >= S.tr.queue.length) S.tr.cur = 0; S.tr.editing = null; return render(); }
    if (d.w && P){ S.tr.editing = d.w; return render(); }
    if (d.wok && P){ const [li, wi] = d.wok.split(":").map(Number), v = $("#tr-wed").value.trim(), orig = P.words[li][wi];
      if (v === orig) delete P.edits[d.wok]; else P.edits[d.wok] = v; S.tr.editing = null; return render(); }
    if (d.wadd != null && P){ const v = prompt("Mot(s) oublié(s) à ajouter en fin de ligne :"); if (!v || !v.trim()) return; if (!P.words.length) P.words = [[]];
      P.adds[d.wadd] = [...(P.adds[d.wadd] || []), v.trim()]; return render(); }
    if (d.wadx && P){ const [li, ai] = d.wadx.split(":").map(Number); P.adds[li].splice(ai, 1); return render(); }
    if (t.id === "tr-save" && P){
      const texte = trFinal(P); if (!texte.trim()) return toast("Le passage est vide : ajoute le texte avec le +.");
      t.disabled = true; const a = await ASSETS.upload(P.blob);
      await api("/api/banque", {method:"POST", body:JSON.stringify({asset:a.id, texte, texteIA:P.texteIA ?? "", corrections:trPairs(P), matiere:$("#tr-mat").value, langue:$("#tr-lang").value, niveau:$("#tr-niv").value, source:"admin"})});
      const nb = trPairs(P).length; it.faits = (it.faits || 0) + 1; it.passage = null; S.tr.editing = null;
      toast(nb ? `Enregistré : ${nb} mot(s) corrigé(s). Encadre un autre passage ou passe à la copie suivante.` : "Enregistré : lecture juste. Encadre un autre passage ou passe à la copie suivante.");
      trLoad(); return;
    }
    if (t.id === "hf-go"){
      const ds = $("#hf-ds").value.trim(), langue = $("#hf-lang").value, total = +$("#hf-n").value || 50; S.tr.hfds = ds; S.tr.hflang = langue; S.tr.hfn = String(total);
      const say = m => { S.tr.hfMsg = m; const el = $("#hf-st"); if (el) el.textContent = m; };
      S.tr.hfBusy = true; t.disabled = true; let done = 0, lu = 0, justes = 0;
      try {
        while (done < total){
          say(`Téléchargement depuis Hugging Face… (${done} / ${total})`);
          const j = await api("/api/banque/hf", {method:"POST", body:JSON.stringify({dataset:ds, length:Math.min(50, total - done)})});
          if (!(j.items || []).length){ if (j.total != null && j.offset >= j.total) say("Toute la base a déjà été importée."); break; }
          const per = Math.max(1, Math.min(10, LIM?.images?.maxCount || 1));
          for (let i = 0; i < j.items.length; i += per){
            const part = j.items.slice(i, i + per); say(`L'IA lit les lignes… ${done + i} / ${total}`);
            let lignes = [];
            try { const r = await ai(`Chaque image est une ligne manuscrite. Transcris exactement ce qui est écrit, caractère par caractère, sans corriger l'orthographe ni la ponctuation. L'hébreu en caractères hébreux carrés.${lectureTips()} Réponds uniquement en JSON : {"lignes":["…"]} avec ${part.length} élément(s), dans l'ordre des images.`, {images:await Promise.all(part.map(async x => { const bmp = await createImageBitmap(await getBlob(x.asset)); const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height; c.getContext("2d").drawImage(bmp, 0, 0); return toBlob(scaled(c, 1600), .9); })), modelTier:"quick"});
              lignes = (r?.lignes || []).map(String); } catch(e){ if (e?.code === "rate_limited" || e?.code === "no_access") throw e; }
            const items = part.map((x, k) => ({asset:x.asset, texte:x.texte, texteIA:lignes[k] ?? "", ref:x.ref, source:"public", langue, matiere:"", niveau:""}));
            await api("/api/banque", {method:"POST", body:JSON.stringify({items})});
            items.forEach(x => { lu++; if (cerOf(x.texteIA, x.texte) < .02) justes++; });
          }
          done += j.items.length;
        }
        say(lu ? `${lu} ligne(s) importée(s) et lues : ${justes} parfaitement lue(s). Les statistiques et les erreurs fréquentes sont à jour.` : (S.tr.hfMsg || "Aucune ligne importée."));
      } catch(e){ say(e?.code ? aiErr(e.code) : (e.message || "Erreur")); }
      S.tr.hfBusy = false; t.disabled = false; return trLoad();
    }
    if (t.id === "tr-aadd"){ const ia = $("#tr-aia").value.trim(), vrai = $("#tr-avr").value.trim(); if (!ia || !vrai) return;
      S.tr.cons = await api("/api/banque/regles", {method:"PUT", body:JSON.stringify({ajouts:[...(S.tr.cons?.ajouts || []), {ia, vrai}]})}); window.LECT = S.tr.cons; return render(); }
    if (d.trad){ const aj = (S.tr.cons?.ajouts || []).filter((_, i) => i !== +d.trad); S.tr.cons = await api("/api/banque/regles", {method:"PUT", body:JSON.stringify({ajouts:aj})}); window.LECT = S.tr.cons; return render(); }
    if (d.troff){ S.tr.cons = await api("/api/banque/regles", {method:"PUT", body:JSON.stringify({off:[...(S.tr.cons?.off || []), d.troff]})}); window.LECT = S.tr.cons; return render(); }
    if (t.id === "tr-rsave"){ S.tr.cons = await api("/api/banque/regles", {method:"PUT", body:JSON.stringify({texte:$("#tr-regles").value})}); window.LECT = S.tr.cons; toast("Règles enregistrées : elles s'appliquent à toutes les prochaines lectures."); return render(); }
    if (t.id === "tr-qgo"){ S.tr.q = $("#tr-q").value.trim(); return trLoad(); }
    if (d.trdel){ if (!confirm("Supprimer cet échantillon de la banque ?")) return; await api("/api/banque/" + d.trdel, {method:"DELETE"}); return trLoad(); }
    if (d.tred){ const s = (S.tr.list?.items || []).find(x => x.id === d.tred); const v = prompt("Texte exact écrit à la main :", s?.texte || ""); if (v == null || !v.trim()) return;
      await api("/api/banque/" + d.tred, {method:"PATCH", body:JSON.stringify({texte:v})}); return trLoad(); }
    if (t.id === "tr-test"){
      const pool = (S.tr.list?.items || []).filter(s => s.texteIA != null && s.cer != null); if (!pool.length) return toast("Il faut d'abord des copies avec une première lecture de l'IA.");
      const pick = pool.sort(() => Math.random() - .5).slice(0, 10); t.disabled = true; let avant = 0, apres = 0, n = 0;
      for (const s of pick){ S.tr.test = `Test en cours : ${n + 1} / ${pick.length}…`; $("#tr-tst").textContent = S.tr.test;
        try { const r = await ai(`Transcris exactement ce qui est écrit à la main sur cette image, ligne par ligne, caractère par caractère, sans corriger l'orthographe. ${MATH_RULE} L'hébreu en caractères hébreux carrés, dans l'ordre de lecture. Passage vraiment illisible : [illisible]. Ignore le texte imprimé.${lectureTips()}\nRéponds uniquement en JSON : {"texte":"…"}`, {images:[await getBlob(s.asset)]});
          avant += 1 - s.cer; apres += 1 - cerOf(String(r?.texte ?? ""), s.texte); n++; } catch(e){} }
      t.disabled = false; S.tr.test = n ? `Sur ${n} copie(s) : ${pctS(avant / n)} des lettres justes à la première lecture, ${pctS(apres / n)} aujourd'hui avec les aides de lecture.` : "Test impossible pour le moment."; return render();
    }
  } catch(e){ t.disabled = false; toast(e.message || "Erreur"); }
});
function cerOf(a, b){ a = [...String(a).normalize("NFC").replace(/\s+/g, " ").trim()]; b = [...String(b).normalize("NFC").replace(/\s+/g, " ").trim()]; if (!b.length) return a.length ? 1 : 0;
  let prev = Array.from({length:b.length + 1}, (_, j) => j); for (let i = 1; i <= a.length; i++){ const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return Math.min(1, prev[b.length] / b.length); }
