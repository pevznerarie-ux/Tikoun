
/* ================= Exercices en ligne : quiz régénérables, accès élève par code personnel ================= */
store.quizzes = []; store.quizrep = {};
S.qz = {id:null, tab:"questions", el:null}; S.qn = {coursId:"", classeId:"", titre:"", banque:30, parTentative:10, types:["qcm","vf","num","trou"], fermeture:"", consignes:""};
const QTYPES = {qcm:"QCM", vf:"Vrai / faux", num:"Réponse numérique", trou:"Texte à trous", redige:"Réponse rédigée (sur ordinateur)"};
const QSTAT = {brouillon:["Brouillon",""], ouvert:["Ouvert aux élèves","ok"], clos:["Clos","warn"]};
const quizOf = id => store.quizzes.find(q => q.id === id);
const myQuizzes = () => store.quizzes.filter(q => !S.me || (isBoss() && S.scope === "ecole") || !q.owner || q.owner === S.me.id);
const repsOf = qid => Object.values(store.quizrep).filter(r => r.quizId === qid);
const quizNotions = q => [...new Set((q.questions || []).map(x => x.notion).filter(Boolean))];
const stars = n => "★".repeat(clamp(+n || 1, 1, 3));
const quizOpenNow = q => q.statut === "ouvert" && (!q.fermeture || new Date(q.fermeture + "T23:59:59") >= new Date());
const dur = s => { s = Math.round(+s || 0); if (s < 60) return s + " s"; const m = Math.round(s / 60); return m < 60 ? m + " min" : Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0"); };

function mapQuizQ(x){
  const t = QTYPES[x?.type] ? x.type : null; if (!t || !String(x.enonce || "").trim()) return null;
  const q = {id:"x" + uid(7), type:t, notion:String(x.notion || "").slice(0, 80), niveau:clamp(+x.niveau || 1, 1, 3), enonce:String(x.enonce).slice(0, 1200), explication:String(x.explication || "").slice(0, 1200)};
  if (t === "qcm"){ q.choix = (x.choix || []).map(String).filter(Boolean).slice(0, 6); q.bonnes = [...new Set((x.bonnes || []).map(Number))].filter(n => n >= 0 && n < q.choix.length); if (q.choix.length < 2 || !q.bonnes.length) return null; }
  if (t === "vf") q.bonne = x.bonne === true || x.bonne === "true" || x.bonne === "vrai";
  if (t === "num"){ q.reponse = Number(String(x.reponse).replace(",", ".")); if (!isFinite(q.reponse)) return null; q.tolerance = Math.abs(Number(x.tolerance) || 0); q.unite = String(x.unite || "").slice(0, 20); }
  if (t === "trou"){ q.reponses = (Array.isArray(x.reponses) ? x.reponses : [x.reponses]).map(String).filter(Boolean).slice(0, 6); if (!q.reponses.length) return null; }
  if (t === "redige"){ q.corrige = String(x.corrige || ""); q.criteres = String(x.criteres || ""); }
  return q;
}
function quizPrompt(co, o, n, deja){
  return `Tu es professeur de ${o.matiere} (niveau ${o.niveau}) en France. À partir du COURS ci-dessous, crée une banque de ${n} questions d'entraînement pour un quiz en ligne que les élèves refont plusieurs fois.
Règles :
- Couvre toutes les notions importantes du cours ; indique pour chaque question la notion (2 à 5 mots, réutilise exactement le même libellé pour une même notion).
- Mélange les niveaux : 1 = découverte, 2 = application, 3 = défi (environ 40 % / 40 % / 20 %).
- Types autorisés uniquement : ${o.types.map(t => QTYPES[t]).join(", ")}.
- Pas de LaTeX : écris les maths avec des symboles simples (x², √, ½, ×, ÷, ≤).
- Chaque question a une explication courte (1 à 3 phrases) montrée à l'élève après sa réponse.
- Réponses sans ambiguïté : une réponse numérique a une seule valeur ; un texte à trous a un trou marqué ___ et une liste de réponses acceptées (variantes d'orthographe incluses).
${o.langue ? langueRule(o.langue) + "\n" : ""}${o.consignes ? "Consignes du professeur : " + o.consignes + "\n" : ""}${deja ? "IMPORTANT : questions NOUVELLES, différentes de celles-ci : " + deja + "\n" : ""}${NOSRC}

COURS :
"""${(co?.texte || "").slice(0, 30000)}"""

Réponds uniquement en JSON : {"titre":"…","questions":[
 {"type":"qcm","notion":"…","niveau":1,"enonce":"…","choix":["…","…","…"],"bonnes":[0],"explication":"…"},
 {"type":"vf","notion":"…","niveau":1,"enonce":"…","bonne":true,"explication":"…"},
 {"type":"num","notion":"…","niveau":2,"enonce":"…","reponse":12.5,"tolerance":0,"unite":"cm","explication":"…"},
 {"type":"trou","notion":"…","niveau":1,"enonce":"Le ___ est …","reponses":["mot","variante"],"explication":"…"},
 {"type":"redige","notion":"…","niveau":3,"enonce":"…","corrige":"…","criteres":"…","explication":"…"}]}`;
}
async function genQuizQuestions(co, o, n, existing){
  const out = []; let titre = "";
  while (out.length < n){
    const k = Math.min(25, n - out.length), deja = [...(existing || []), ...out].map(q => q.enonce).join(" / ").slice(0, 6000);
    const r = await ai(quizPrompt(co, o, k, deja), {feature:"exercices"});
    const qs = (r?.questions || []).map(mapQuizQ).filter(Boolean).filter(q => o.types.includes(q.type));
    if (!qs.length) { if (!out.length) throw {code:"invalid_json"}; break; }
    titre = titre || r.titre || ""; out.push(...qs);
    if (qs.length < k / 2) break;
  }
  return {titre, questions:out.slice(0, n)};
}

/* ---------- Liste ---------- */
function quizClasses(){ const ids = new Set(myQuizzes().map(q => q.classeId)); return store.classes.filter(c => ids.has(c.id)); }
function vExercices(){
  const head = `<div class="head"><div><h2>Exercices en ligne</h2><p>Des quiz tirés de tes cours. Chaque élève s'entraîne avec son code personnel, autant qu'il veut : les questions changent à chaque tentative et la correction est immédiate.</p></div>
    ${canEx() ? `<div class="row"><a class="btn primary" href="#/exercices/nouveau">+ Nouveau quiz</a></div>` : ""}</div>`;
  if (!canEx()) return head + `<section class="panel grid" style="max-width:720px"><div class="row" style="gap:10px">${lockChip()}<b>Réservé au forfait Pro</b></div>
    <ul class="muted" style="margin:0;padding-left:20px;display:grid;gap:6px"><li>Une banque de 20 à 50 questions générée à partir de ton cours</li><li>Chaque élève refait le quiz autant qu'il veut, avec des questions différentes</li><li>Correction instantanée, explication après chaque réponse</li><li>Suivi par élève : tentatives, réussite, notions acquises</li></ul>
    <p class="small muted">Demande l'activation à l'équipe Mastery.</p></section>`;
  const list = [...myQuizzes()].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const row = q => { const cl = classe(q.classeId), n = (cl?.eleves || []).length, reps = repsOf(q.id), act = reps.filter(r => (r.tentatives || []).length).length, nn = quizNotions(q).length;
    const acq = reps.length && nn ? reps.reduce((s, r) => s + Object.values(r.notions || {}).filter(x => x.acquis).length, 0) / (n * nn || 1) : 0;
    return `<a class="item link" href="#/exercices/${q.id}/${q.statut === "brouillon" ? "questions" : "resultats"}"><div><div class="t">${esc(q.titre)}</div>
      <div class="s">${esc(q.matiere)} · ${esc(cl?.nom || "?")} · ${(q.questions || []).length} questions${q.fermeture ? " · jusqu'au " + esc(frDate(q.fermeture)) : ""}</div></div>
      <div class="row"><span class="chip ${QSTAT[q.statut]?.[1] || ""}">${QSTAT[q.statut]?.[0] || q.statut}</span>${q.statut !== "brouillon" ? `<span class="chip">${act}/${n} élèves</span><span class="chip">${Math.round(acq * 100)} % des notions acquises</span>` : ""}</div></a>`; };
  const sum = cl => { const qs = list.filter(q => q.classeId === cl.id), op = qs.filter(q => q.statut === "ouvert").length; return `${qs.length} quiz${op ? ` · <b style="color:var(--ok)">${op} ouvert(s)</b>` : ""} · ${(cl.eleves || []).length} élèves`; };
  return head + (list.length ? classAcc("quiz", quizClasses(), sum, cl => `<div>${list.filter(q => q.classeId === cl.id).map(row).join("")}</div>`) : `<section class="panel"><div class="empty">Aucun quiz pour l'instant. <a class="btn sm primary" href="#/exercices/nouveau">Créer mon premier quiz</a></div></section>`) + `
  <section class="panel grid" style="gap:6px"><div class="label">Accès des élèves</div><p>Chaque élève se connecte sur <b>${esc(location.origin)}/eleve</b> avec son code personnel. Génère et imprime les cartes dans <a href="#/classes">Classes → Codes élèves</a>.</p></section>`;
}

/* ---------- Création ---------- */
function vQuizNew(){
  if (!canEx()) return vExercices();
  const o = S.qn, cours = [...store.cours].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  if (!o.coursId && cours[0]) o.coursId = cours[0].id;
  const co = store.cours.find(c => c.id === o.coursId);
  if (!o.classeId && store.classes[0]) o.classeId = (store.classes.find(c => c.niveau === co?.niveau) || store.classes[0]).id;
  return `<div class="crumbs small"><a href="#/exercices">← Exercices</a></div>
  <div class="head"><div><h2>Nouveau quiz</h2><p>L'IA prépare une fois la banque de questions ; ensuite, les tentatives des élèves ne coûtent rien.</p></div></div>
  <section class="panel grid">
    <div class="form-row">
      <div class="field"><label for="qn-co">Cours</label>${cours.length ? `<select id="qn-co" data-qn="coursId">${selOpts(cours, o.coursId, c => c.titre + " · " + c.matiere + " " + c.niveau, c => c.id)}</select>` : `<div class="small muted">Aucun cours importé.</div>`}</div>
      <div class="field"><label for="qn-cl">Classe</label><select id="qn-cl" data-qn="classeId">${store.classes.length ? selOpts(store.classes, o.classeId, c => c.nom, c => c.id) : `<option value="">Crée d'abord une classe</option>`}</select></div>
    </div>
    <div class="row"><button class="btn sm" id="qn-import">+ Importer un nouveau cours</button></div>
    <div class="form-row">
      <div class="field"><label for="qn-ti">Titre (facultatif)</label><input id="qn-ti" data-qn="titre" value="${esc(o.titre)}" placeholder="Proposé par l'IA si vide"></div>
      <div class="field"><label for="qn-b">Questions dans la banque</label><select id="qn-b" data-qn="banque">${selOpts(["20","30","40","50"], String(o.banque))}</select></div>
      <div class="field"><label for="qn-p">Questions par tentative</label><select id="qn-p" data-qn="parTentative">${selOpts(["5","10","15","20"], String(o.parTentative))}</select></div>
      <div class="field"><label for="qn-l">Langue</label><select id="qn-l" data-qn="langue">${selOpts(LANGUES, o.langue || langueDef(co?.texte))}</select></div>
      <div class="field"><label for="qn-f">Date limite (facultatif)</label><input id="qn-f" type="date" data-qn="fermeture" value="${esc(o.fermeture)}"></div>
    </div>
    <div class="field"><label>Types de questions</label><div class="row">${Object.entries(QTYPES).map(([k, l]) => `<label class="row small" style="gap:6px"><input type="checkbox" data-qtype="${k}"${o.types.includes(k) ? " checked" : ""}> ${l}</label>`).join("")}</div>
      <p class="small muted" style="margin:0">Les réponses rédigées ne sont proposées que sur ordinateur ; tu les corriges ensuite (ou l'IA, à ta demande).</p></div>
    <div class="field"><label for="qn-c">Tes consignes à l'IA (facultatif)</label><textarea id="qn-c" data-qn="consignes" placeholder="ex. Insister sur les fractions de même dénominateur.">${esc(o.consignes)}</textarea></div>
    <div class="row"><button class="btn primary" id="qn-go" ${co && o.classeId ? "" : "disabled"}>Générer le quiz (IA)</button><span class="status" id="qn-st"></span></div>
  </section>`;
}

/* ---------- Un quiz ---------- */
function qAnswerEditor(q){
  const f = (k, v, ph) => `<input data-qqf="${q.id}" data-k="${k}" value="${esc(v ?? "")}" placeholder="${ph || ""}">`;
  if (q.type === "qcm") return `<div class="field"><label>Propositions (une par ligne, * devant les bonnes)</label><textarea data-qqf="${q.id}" data-k="choix" style="min-height:90px">${esc((q.choix || []).map((c, i) => ((q.bonnes || []).includes(i) ? "* " : "") + c).join("\n"))}</textarea></div>`;
  if (q.type === "vf") return `<div class="field"><label>Bonne réponse</label><select data-qqf="${q.id}" data-k="bonne">${selOpts(["true","false"], String(!!q.bonne), x => x === "true" ? "Vrai" : "Faux")}</select></div>`;
  if (q.type === "num") return `<div class="form-row"><div class="field"><label>Réponse</label>${f("reponse", q.reponse)}</div><div class="field"><label>Tolérance</label>${f("tolerance", q.tolerance || 0)}</div><div class="field"><label>Unité</label>${f("unite", q.unite)}</div></div>`;
  if (q.type === "trou") return `<div class="field"><label>Réponses acceptées (séparées par |)</label>${f("reponses", (q.reponses || []).join(" | "))}</div>`;
  return `<div class="field"><label>Corrigé-type</label><textarea data-qqf="${q.id}" data-k="corrige">${esc(q.corrige || "")}</textarea></div>`;
}
function vQuiz(){
  const q = quizOf(S.qz.id);
  if (!q) return `<div class="panel empty">Quiz introuvable. <a class="btn sm" href="#/exercices">Retour</a></div>`;
  const cl = classe(q.classeId), tab = S.qz.tab, notions = quizNotions(q);
  const tabs = [["questions", `Questions (${(q.questions || []).length})`], ["reglages", "Réglages"], ["resultats", "Résultats"]];
  let inner = "";
  if (tab === "questions"){
    const byT = Object.keys(QTYPES).map(t => [t, (q.questions || []).filter(x => x.type === t).length]).filter(x => x[1]);
    inner = `<section class="panel grid" style="gap:10px"><div class="row between"><div class="row">${byT.map(([t, n]) => `<span class="chip">${QTYPES[t].replace(" (sur ordinateur)", "")} × ${n}</span>`).join("")}<span class="chip">${notions.length} notions</span></div>
      <div class="row"><button class="btn sm" id="qz-more">+ 10 questions (IA)</button><button class="btn sm ghost" id="qz-regen">↻ Régénérer toute la banque</button></div></div><div class="status" id="qz-st"></div></section>
    ${(q.questions || []).map((x, i) => `<section class="panel grid" style="gap:10px">
      <div class="row between"><div class="row"><b>Q${i + 1}</b><span class="chip">${QTYPES[x.type].replace(" (sur ordinateur)", "")}</span><span class="chip" title="Niveau">${stars(x.niveau)}</span>${x.notion ? `<span class="chip blue">${esc(x.notion)}</span>` : ""}</div><button class="btn sm ghost" data-qqdel="${x.id}">Supprimer</button></div>
      <div class="field"><label>Énoncé</label><textarea data-qqf="${x.id}" data-k="enonce">${esc(x.enonce)}</textarea></div>
      ${qAnswerEditor(x)}
      <div class="form-row"><div class="field"><label>Notion</label><input data-qqf="${x.id}" data-k="notion" value="${esc(x.notion || "")}"></div><div class="field"><label>Niveau</label><select data-qqf="${x.id}" data-k="niveau">${selOpts(["1","2","3"], String(x.niveau || 1), n => stars(n))}</select></div></div>
      <div class="field"><label>Explication montrée à l'élève</label><textarea data-qqf="${x.id}" data-k="explication" style="min-height:54px">${esc(x.explication || "")}</textarea></div></section>`).join("")}`;
  }
  if (tab === "reglages"){
    inner = `<section class="panel grid">
      <div class="form-row"><div class="field"><label>Titre</label><input data-qzf="titre" value="${esc(q.titre)}"></div>
        <div class="field"><label>Classe</label><select data-qzf="classeId">${selOpts(store.classes, q.classeId, c => c.nom, c => c.id)}</select></div>
        <div class="field"><label>Questions par tentative</label><select data-qzf="parTentative">${selOpts(["5","10","15","20"], String(q.parTentative || 10))}</select></div>
        <div class="field"><label>Date limite</label><input type="date" data-qzf="fermeture" value="${esc(q.fermeture || "")}"></div></div>
      <label class="row small" style="gap:6px"><input type="checkbox" data-qzf="redige"${q.redige ? " checked" : ""}> Proposer les réponses rédigées (uniquement quand l'élève est sur ordinateur)</label>
      <p class="small muted" style="margin:0">Une notion est considérée comme acquise après 3 bonnes réponses d'affilée. Après une erreur, l'élève reçoit une autre question sur la même notion.</p></section>`;
  }
  if (tab === "resultats") inner = quizResults(q, cl, notions);
  const act = q.statut === "brouillon" ? `<button class="btn primary" data-qzstat="ouvert">Publier pour les élèves</button>` : q.statut === "ouvert" ? `<button class="btn" data-qzstat="clos">Clore le quiz</button>` : `<button class="btn" data-qzstat="ouvert">Rouvrir</button>`;
  return `<div class="crumbs small"><a href="#/exercices">← Tous les quiz</a></div>
  <div class="head"><div><div class="label">Exercices · ${esc(q.matiere)} · ${esc(cl?.nom || "?")}${q.fermeture ? " · jusqu'au " + esc(frDate(q.fermeture)) : ""}</div><h2>${esc(q.titre)}</h2>
    <div class="row" style="margin-top:6px"><span class="chip ${QSTAT[q.statut]?.[1] || ""}">${QSTAT[q.statut]?.[0]}</span>${q.statut === "ouvert" && !quizOpenNow(q) ? `<span class="chip warn">date limite passée</span>` : ""}</div></div>
    <div class="row">${act}<button class="btn ghost sm" id="qz-del">Supprimer</button></div></div>
  <nav class="stepper">${tabs.map(([k, l], j) => `<a class="st ${k === tab ? "on" : ""}" href="#/exercices/${q.id}/${k}"><b>${j + 1}</b><span>${l}</span></a>`).join("")}</nav>
  ${inner}`;
}
function quizResults(q, cl, notions){
  const studs = cl?.eleves || [], R = Object.fromEntries(repsOf(q.id).map(r => [r.eleveId, r]));
  if (q.statut === "brouillon") return `<section class="panel empty">Publie le quiz pour que les élèves puissent s'entraîner.</section>`;
  const rows = studs.map(e => { const r = R[e.id] || {}; const t = r.tentatives || []; const acq = notions.filter(n => r.notions?.[n]?.acquis).length;
    return {e, r, t:t.length, vues:r.vues || 0, taux:r.vues ? (r.ok || 0) / r.vues : null, acq, temps:t.reduce((s, x) => s + (x.dureeS || 0), 0), der:r.derniere}; });
  const sel = rows.find(x => x.e.id === S.qz.el);
  const qStats = (q.questions || []).map(x => { let v = 0, ok = 0; Object.values(R).forEach(r => { const s = r.q?.[x.id]; if (s){ v += s.v; ok += s.ok; } }); return {x, v, rate:v ? ok / v : null}; }).filter(s => s.v >= 2 && s.x.type !== "redige").sort((a, b) => a.rate - b.rate).slice(0, 6);
  const red = []; Object.values(R).forEach(r => (r.redigees || []).forEach((a, i) => { if (a.note == null){ const x = (q.questions || []).find(y => y.id === a.qid); if (x) red.push({r, a, i, x, e:studs.find(s => s.id === r.eleveId)}); } }));
  const tone = v => v == null ? "none" : v >= .7 ? "ok" : v >= .5 ? "warn" : "bad";
  return `<section class="panel"><div class="tbl-wrap"><table><thead><tr><th>Élève</th><th class="c">Tentatives</th><th class="c">Questions vues</th><th class="c">Réussite</th><th class="c">Notions acquises</th><th class="c">Temps</th><th>Dernière activité</th></tr></thead><tbody>
    ${rows.map(x => `<tr class="clickable" data-qzel="${x.e.id}"${S.qz.el === x.e.id ? ' style="background:var(--surface-2)"' : ""}><td><b>${esc(x.e.prenom)} ${esc(x.e.nom)}</b></td><td class="c num">${x.t}</td><td class="c num">${x.vues}</td>
      <td class="c"><span class="cell ${tone(x.taux)}">${x.taux == null ? "—" : Math.round(x.taux * 100) + " %"}</span></td><td class="c num">${x.acq}/${notions.length}</td><td class="c num">${x.t ? dur(x.temps) : "—"}</td><td class="small muted">${x.der ? esc(new Date(x.der).toLocaleString("fr-FR", {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"})) : "pas encore commencé"}</td></tr>`).join("")}
    </tbody></table></div></section>
  ${sel ? `<section class="panel grid"><div class="row between"><h3>${esc(sel.e.prenom)} ${esc(sel.e.nom)}</h3><span class="small muted">${sel.t} tentative(s) · ${sel.vues} question(s) · ${sel.t ? dur(sel.temps) : ""}</span></div>
    <div class="row">${notions.map(n => { const s = sel.r.notions?.[n]; const st = !s ? ["Pas vue", ""] : s.acquis ? ["Acquis", "ok"] : s.ok ? ["En cours", "warn"] : ["À revoir", "bad"]; return `<span class="chip ${st[1]}" title="${s ? s.ok + " bonne(s) sur " + s.vus : ""}">${esc(n)} · ${st[0]}</span>`; }).join("")}</div>
    ${(sel.r.tentatives || []).length ? `<div class="small muted">${sel.r.tentatives.slice(-8).map(t => `${esc(new Date(t.at).toLocaleDateString("fr-FR"))} : ${t.ok}/${t.auto}${t.n > t.auto ? " + " + (t.n - t.auto) + " rédigée(s)" : ""} en ${dur(t.dureeS)}`).join(" · ")}</div>` : ""}</section>` : ""}
  ${qStats.length ? `<section class="panel"><h3>Questions les plus ratées</h3><div style="margin-top:6px">${qStats.map(s => `<div class="item"><div><div class="t small">${esc(s.x.enonce.slice(0, 140))}</div><div class="s">${esc(s.x.notion || "")} · vue ${s.v} fois</div></div><span class="cell ${tone(s.rate)}">${Math.round(s.rate * 100)} %</span></div>`).join("")}</div></section>` : ""}
  ${red.length ? `<section class="panel grid"><div class="row between"><h3>Réponses rédigées à corriger (${red.length})</h3><button class="btn sm primary" id="qz-redai">Corriger avec l'IA</button></div><div class="status" id="qz-redst"></div>
    ${red.slice(0, 40).map(o => `<div class="item" style="align-items:start"><div style="display:grid;gap:4px"><div class="small muted">${esc(o.e ? o.e.prenom + " " + o.e.nom : "?")} · ${esc(o.x.notion || "")}</div><div class="t small">${esc(o.x.enonce)}</div>
      <div class="answer">${esc(o.a.rep)}</div>${o.x.corrige ? `<div class="small muted">Corrigé : ${esc(o.x.corrige)}</div>` : ""}</div>
      <div class="row" style="flex:none"><button class="btn sm" data-rednote="${o.r.eleveId}|${o.i}|1">✓ Juste</button><button class="btn sm" data-rednote="${o.r.eleveId}|${o.i}|0">✗ À revoir</button></div></div>`).join("")}</section>` : ""}`;
}

/* ---------- Suivi : exercices dans le suivi de la classe ---------- */
function quizSuivi(){
  const cl = classe(S.su?.cl); if (!cl) return "";
  const qs = myQuizzes().filter(q => q.classeId === cl.id && q.statut !== "brouillon" && (!S.su.mat || q.matiere === S.su.mat));
  if (!qs.length) return "";
  const studs = cl.eleves || [];
  const agg = e => { let t = 0, v = 0, ok = 0, acq = 0, nn = 0, der = ""; qs.forEach(q => { const r = store.quizrep["" + q.id + "_" + e.id] || repsOf(q.id).find(x => x.eleveId === e.id) || {}; const ns = quizNotions(q); t += (r.tentatives || []).length; v += r.vues || 0; ok += r.ok || 0; nn += ns.length; acq += ns.filter(n => r.notions?.[n]?.acquis).length; if ((r.derniere || "") > der) der = r.derniere; }); return {t, v, rate:v ? ok / v : null, acq, nn, der}; };
  const tone = v => v == null ? "none" : v >= .7 ? "ok" : v >= .5 ? "warn" : "bad";
  const e = studs.find(x => x.id === S.su.el);
  return `<section class="panel"><div class="row between"><h3>Exercices en ligne${S.su.mat ? " · " + esc(S.su.mat) : ""}</h3><span class="small muted">${qs.length} quiz</span></div>
    <div class="tbl-wrap" style="margin-top:8px"><table><thead><tr><th>Élève</th><th class="c">Tentatives</th><th class="c">Questions</th><th class="c">Réussite</th><th class="c">Notions acquises</th><th>Dernière activité</th></tr></thead><tbody>
    ${studs.map(s => { const a = agg(s); return `<tr${e && e.id === s.id ? ' style="background:var(--surface-2)"' : ""}><td><b>${esc(s.prenom)} ${esc(s.nom)}</b></td><td class="c num">${a.t}</td><td class="c num">${a.v}</td><td class="c"><span class="cell ${tone(a.rate)}">${a.rate == null ? "—" : Math.round(a.rate * 100) + " %"}</span></td><td class="c num">${a.acq}/${a.nn}</td><td class="small muted">${a.der ? esc(new Date(a.der).toLocaleDateString("fr-FR")) : "—"}</td></tr>`; }).join("")}
    </tbody></table></div>
    ${e ? `<div style="margin-top:12px"><div class="label" style="margin-bottom:6px">${esc(e.prenom)} · détail par quiz</div>${qs.map(q => { const r = repsOf(q.id).find(x => x.eleveId === e.id) || {}; const ns = quizNotions(q); return `<div class="item"><div><a class="t small" style="color:inherit" href="#/exercices/${q.id}/resultats">${esc(q.titre)}</a><div class="s">${(r.tentatives || []).length} tentative(s) · ${r.vues || 0} question(s) · ${ns.filter(n => r.notions?.[n]?.acquis).length}/${ns.length} notions acquises</div></div><span class="cell ${tone(r.vues ? (r.ok || 0) / r.vues : null)}">${r.vues ? Math.round((r.ok || 0) / r.vues * 100) + " %" : "—"}</span></div>`; }).join("")}</div>` : ""}</section>`;
}

/* ---------- Codes élèves (Classes) ---------- */
const CODE_ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () => { let s = ""; for (const b of crypto.getRandomValues(new Uint8Array(6))) s += CODE_ALPHA[b % CODE_ALPHA.length]; return s; };
function codesPanel(cl){
  if (!cl || !window.TIKOUN_CONFIG?.accounts) return "";
  const n = (cl.eleves || []).filter(e => e.code).length, tot = (cl.eleves || []).length;
  return `<section class="panel grid" style="gap:10px"><div class="row between"><div><h3>Codes élèves</h3><p class="small muted">Pour les exercices en ligne : chaque élève se connecte sur <b>${esc(location.origin)}/eleve</b> avec son code personnel (sans e-mail).</p></div>
    <div class="row"><button class="btn sm" id="codes-gen">${n < tot ? "Générer les codes manquants" : "Codes à jour"}</button>${n ? `<button class="btn sm primary" id="codes-print">Imprimer les cartes</button>` : ""}</div></div>
    ${n ? `<div class="row">${(cl.eleves || []).map(e => `<span class="chip">${esc(e.prenom)} ${esc((e.nom || "").slice(0, 1))}. · <b class="num">${esc(e.code || "—")}</b>${e.code ? ` <button class="btn sm ghost" style="padding:0 4px" data-recode="${e.id}" title="Nouveau code">↻</button>` : ""}</span>`).join("")}</div>` : ""}</section>`;
}
function printCards(cl){
  const url = location.origin + "/eleve?c=";
  const card = e => { let svg = ""; try { const qr = qrcode(0, "M"); qr.addData(url + e.code); qr.make(); svg = qr.createSvgTag({cellSize:3, margin:0}); } catch(err){}
    return `<div class="c"><div class="h"><b>Mastery</b><span>${esc(cl.nom)}</span></div><div class="n">${esc(e.prenom)} ${esc(e.nom)}</div><div class="b"><div>${svg}</div><div><div class="l">Ton code</div><div class="k">${esc(e.code)}</div><div class="u">${esc(location.host)}/eleve</div></div></div></div>`; };
  const w = window.open("", "_blank"); if (!w) return toast("Autorise les fenêtres pour imprimer les cartes.");
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Cartes élèves · ${esc(cl.nom)}</title><style>
    body{font-family:Inter,Arial,sans-serif;margin:0;padding:10mm;color:#15233F}.g{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
    .c{border:1px solid #cfc8b8;border-radius:4mm;padding:5mm;break-inside:avoid;display:grid;gap:3mm}.h{display:flex;justify-content:space-between;font-size:11pt}.h b{font-family:Georgia,serif}
    .n{font-size:14pt;font-weight:700}.b{display:flex;gap:5mm;align-items:center}.b svg{width:28mm;height:28mm}.l{font-size:9pt;color:#6b6758;text-transform:uppercase;letter-spacing:.1em}.k{font-size:22pt;font-weight:700;letter-spacing:.12em;font-family:monospace}.u{font-size:9pt;color:#6b6758}
    @media print{body{padding:6mm}}</style></head><body><div class="g">${(cl.eleves || []).filter(e => e.code).map(card).join("")}</div><script>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
}

/* ---------- Événements ---------- */
document.addEventListener("click", async ev => {
  const t = ev.target.closest("button,[data-qzel]"); if (!t) return; const d = t.dataset;
  try {
    if (d.qzel){ S.qz.el = S.qz.el === d.qzel ? null : d.qzel; return render(); }
    if (t.id === "qn-import"){ S.params.kind = "quiz"; S.wizStep = 1; return go("new"); }
    if (t.id === "qn-go"){ const o = S.qn, co = store.cours.find(c => c.id === o.coursId), cl = classe(o.classeId), st = $("#qn-st");
      if (!o.types.length) return toast("Choisis au moins un type de question.");
      t.disabled = true; st.innerHTML = `<span class="thinking">L'IA prépare ${o.banque} questions (1 à 2 minutes)…</span>`;
      try { const auto = o.types.filter(x => x !== "redige"); const lang = o.langue || langueDef(co.texte); const g = await genQuizQuestions(co, {matiere:co.matiere, niveau:co.niveau, types:o.types, consignes:o.consignes, langue:lang}, +o.banque);
        const id = uid(12); await write("quizzes/" + id, {titre:o.titre || g.titre || "Quiz · " + co.titre, matiere:co.matiere, niveau:co.niveau, classeId:cl.id, coursId:co.id, statut:"brouillon", parTentative:+o.parTentative, fermeture:o.fermeture || "", redige:o.types.includes("redige"), types:o.types, consignes:o.consignes || "", langue:lang, questions:g.questions, createdAt:new Date().toISOString()});
        S.qn.titre = ""; S.qz = {id, tab:"questions", el:null}; location.hash = `#/exercices/${id}/questions`; void auto; }
      catch(e){ st.textContent = aiErr(e?.code); t.disabled = false; } return; }
    const q = S.view === "quiz" ? quizOf(S.qz.id) : null;
    if (q){
      if (d.qzstat){ if (d.qzstat === "ouvert" && !(q.questions || []).length) return toast("Ajoute des questions avant de publier."); q.statut = d.qzstat; await write("quizzes/" + q.id, q); toast(d.qzstat === "ouvert" ? "Quiz ouvert : les élèves le voient avec leur code." : "Quiz clos."); return; }
      if (t.id === "qz-del"){ if (!confirm("Supprimer ce quiz et les résultats des élèves ?")) return; for (const r of repsOf(q.id)) await write("quizrep/" + q.id + "_" + r.eleveId, null, "delete"); await write("quizzes/" + q.id, null, "delete"); location.hash = "#/exercices"; return; }
      if (d.qqdel){ q.questions = q.questions.filter(x => x.id !== d.qqdel); await write("quizzes/" + q.id, q); return; }
      if (t.id === "qz-more" || t.id === "qz-regen"){ const co = store.cours.find(c => c.id === q.coursId); if (!co) return toast("Cours d'origine introuvable.");
        if (t.id === "qz-regen" && !confirm("Remplacer toutes les questions par une nouvelle banque ? Les résultats déjà obtenus restent.")) return;
        const st = $("#qz-st"); t.disabled = true; st.innerHTML = `<span class="thinking">L'IA prépare de nouvelles questions…</span>`;
        try { const n = t.id === "qz-more" ? 10 : (q.questions || []).length || 30; const g = await genQuizQuestions(co, {matiere:q.matiere, niveau:q.niveau, types:q.types || ["qcm","vf","num","trou"], consignes:q.consignes, langue:q.langue}, n, (q.questions || []).map(x => x.enonce));
          q.questions = t.id === "qz-more" ? [...(q.questions || []), ...g.questions] : g.questions; await write("quizzes/" + q.id, q); toast(g.questions.length + " nouvelle(s) question(s)."); }
        catch(e){ st.textContent = aiErr(e?.code); t.disabled = false; } return; }
      if (d.rednote){ const [eid, i, v] = d.rednote.split("|"); const k = "quizrep/" + q.id + "_" + eid, r = store.quizrep[q.id + "_" + eid]; if (!r) return;
        const red = structuredClone(r.redigees || []); if (red[+i]) red[+i].note = +v; await write(k, {redigees:red}, "update"); return; }
      if (t.id === "qz-redai"){ const st = $("#qz-redst"); const items = []; repsOf(q.id).forEach(r => (r.redigees || []).forEach((a, i) => { const x = (q.questions || []).find(y => y.id === a.qid); if (a.note == null && x) items.push({r, i, x, a}); }));
        if (!items.length) return; t.disabled = true; st.innerHTML = `<span class="thinking">Correction de ${Math.min(items.length, 30)} réponse(s)…</span>`;
        try { const batch = items.slice(0, 30);
          const res = await ai(`Tu corriges des réponses rédigées d'élèves (${q.matiere}, ${q.niveau}) à un quiz d'entraînement. Sois juste et bienveillant ; une réponse vide ou « je ne sais pas » est fausse.
${batch.map((o, k) => `#${k}\nQuestion : ${o.x.enonce}\nCorrigé : ${o.x.corrige || ""}\nCritères : ${o.x.criteres || ""}\nRéponse de l'élève : ${o.a.rep}`).join("\n\n")}
Réponds uniquement en JSON : {"notes":[{"k":0,"juste":true,"commentaire":"…"}]}`, {feature:"exercices", modelTier:"quick"});
          const byDoc = {}; (res?.notes || []).forEach(n => { const o = batch[+n.k]; if (!o) return; const key = q.id + "_" + o.r.eleveId; byDoc[key] = byDoc[key] || structuredClone(o.r.redigees || []); byDoc[key][o.i] = {...byDoc[key][o.i], note:n.juste ? 1 : 0, commentaire:String(n.commentaire || "")}; });
          for (const [key, red] of Object.entries(byDoc)) await write("quizrep/" + key, {redigees:red}, "update");
          st.textContent = Object.keys(byDoc).length ? "Corrections enregistrées : vérifie-les si besoin." : "Aucune correction reçue."; }
        catch(e){ st.textContent = aiErr(e?.code); } t.disabled = false; return; }
    }
    if (t.id === "codes-gen" || d.recode){ const cl = classe(S.classeSel) || store.classes[0]; if (!cl) return; const c = structuredClone(cl); delete c.id;
      c.eleves = (c.eleves || []).map(e => (d.recode ? e.id === d.recode : !e.code) ? {...e, code:newCode()} : e); await write("classes/" + cl.id, c); toast(d.recode ? "Nouveau code généré (l'ancien ne marche plus)." : "Codes générés."); return; }
    if (t.id === "codes-print"){ const cl = classe(S.classeSel) || store.classes[0]; if (cl) printCards(cl); return; }
  } catch(e){ console.error(e); toast(e?.message || "Erreur."); }
});
document.addEventListener("change", async ev => {
  const el = ev.target, d = el.dataset;
  if (d.qn){ S.qn[d.qn] = el.value; if (d.qn === "coursId") S.qn.classeId = ""; if (["coursId","classeId"].includes(d.qn)) render(); return; }
  if (d.qtype){ const s = new Set(S.qn.types); el.checked ? s.add(d.qtype) : s.delete(d.qtype); S.qn.types = [...s]; return; }
  const q = S.view === "quiz" ? quizOf(S.qz.id) : null; if (!q) return;
  if (d.qzf){ q[d.qzf] = el.type === "checkbox" ? el.checked : d.qzf === "parTentative" ? +el.value : el.value; await write("quizzes/" + q.id, q); return; }
  if (d.qqf){ const x = (q.questions || []).find(y => y.id === d.qqf); if (!x) return; const v = el.value, k = d.k;
    if (k === "choix"){ const lines = v.split("\n").map(s => s.trim()).filter(Boolean); x.choix = lines.map(s => s.replace(/^\*\s*/, "")); x.bonnes = lines.map((s, i) => s.startsWith("*") ? i : -1).filter(i => i >= 0); if (!x.bonnes.length) toast("Marque au moins une bonne réponse avec *."); }
    else if (k === "bonne") x.bonne = v === "true";
    else if (k === "reponse" || k === "tolerance"){ const n = Number(v.replace(",", ".")); if (!isFinite(n)) return toast("Nombre invalide."); x[k] = n; }
    else if (k === "reponses") x.reponses = v.split("|").map(s => s.trim()).filter(Boolean);
    else if (k === "niveau") x.niveau = +v;
    else x[k] = v;
    await write("quizzes/" + q.id, q); }
});
