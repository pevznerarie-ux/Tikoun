"use strict";
/* ================= Helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = n => n == null || isNaN(n) ? "—" : (Math.round(n * 10) / 10).toString().replace(".", ",");
const pct = n => Math.round(n * 100) + " %";
const tone = r => r == null ? "none" : r >= 0.7 ? "ok" : r >= 0.5 ? "warn" : "bad";
const uid = (n = 10) => { const a = "abcdefghijkmnpqrstuvwxyz23456789"; let s = ""; const b = crypto.getRandomValues(new Uint8Array(n)); for (const x of b) s += a[x % a.length]; return s; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
const frDate = d => { if (!d) return ""; const x = new Date(d + (d.length === 10 ? "T12:00:00" : "")); return isNaN(x) ? d : x.toLocaleDateString("fr-FR", {day:"numeric", month:"long", year:"numeric"}); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const half = v => Math.round(v * 2) / 2;
function toast(msg, ms = 3500){ const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), ms); }

const MATIERES = ["Mathématiques","Français","Histoire-Géographie","SVT","Physique-Chimie","Anglais","Guémara","Halakha","Houmach","Hébreu","Hassidout","Philosophie","SES"];
const NIVEAUX = ["6e","5e","4e","3e","2de","1re","Terminale"];
const LEVELS = ["socle","standard","approfondi"];
const LVL = {socle:"Socle", standard:"Standard", approfondi:"Approfondi"};
const ECOLE = "Collège-Lycée Beth Mena'hem · Levallois-Perret";
const STATUT = {brouillon:["Brouillon",""], imprime:["Imprimé","blue"], correction:["En correction","warn"], corrige:["Corrigé","ok"]};

const aiErr = c => ({
  not_granted:"L'IA n'a pas été autorisée pour cette page.", sampling_disabled:"L'IA n'est pas disponible pour ce compte.",
  rate_limited:"Trop de demandes d'un coup : attends une minute puis relance.", session_expired:"Session expirée : reconnecte-toi à Claude.",
  image_rejected:"Image refusée : essaie une photo JPG ou PNG plus nette.", invalid_json:"Réponse de l'IA illisible : relance.",
  refused:"Demande refusée par l'IA : reformule.", prompt_too_large:"Document trop long : raccourcis le cours.",
  images_unavailable:"Cette vue ne peut pas envoyer d'images à l'IA.", no_ai:"IA indisponible dans cette vue.",
  no_key:"Ajoute la clé API dans l'onglet Réglages.", bad_key:"Clé API refusée : vérifie-la dans Réglages.", api_400:"Requête refusée par l'API (document trop long ou modèle inconnu : vérifie les Réglages).", no_blob:"Image introuvable.", cloud_write:"Enregistrement en ligne impossible (connexion ?)."
}[c] || "Échec temporaire de l'IA : relance.");

/* ================= Capabilities ================= */
let DB = null, AI = null, ASSETS = null, DL = null, LIM = null, LOCAL = false;

/* In-memory stand-in when the database is not available in this view */
function memDB(init = {}, persist = null){
  const data = {...init}; const subs = [];
  const colOf = p => p.split("/").slice(0, -1).join("/");
  const notify = col => subs.filter(s => s.col === col).forEach(s => s.fn(snapOf(col)));
  const snapOf = col => { const docs = Object.keys(data).filter(k => colOf(k) === col).map(k => ({id:k.split("/").pop(), exists:true, data:() => data[k], metadata:{}}));
    return {docs, size:docs.length, empty:!docs.length, docChanges:() => [], metadata:{}}; };
  const merge = (a, b) => { for (const k in b){ if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object" && !Array.isArray(a[k])) merge(a[k], b[k]); else a[k] = b[k]; } return a; };
  const doc = p => ({ id:p.split("/").pop(), path:p,
    get: async () => ({id:p.split("/").pop(), exists:!!data[p], data:() => data[p], metadata:{}}),
    set: async d => { data[p] = JSON.parse(JSON.stringify(d)); notify(colOf(p)); if (persist) await persist(p, data[p], "set"); },
    update: async d => { if (!data[p]) throw {code:"invalid_argument"}; const patch = JSON.parse(JSON.stringify(d)); merge(data[p], JSON.parse(JSON.stringify(d))); data[p] = {...data[p]}; notify(colOf(p)); if (persist) await persist(p, data[p], "update", patch); },
    delete: async () => { delete data[p]; notify(colOf(p)); if (persist) await persist(p, null, "delete"); } });
  return { doc, _remote:(p, val) => { if (val == null) delete data[p]; else data[p] = val; notify(colOf(p)); }, collection: col => ({ path:col, doc: id => doc(col + "/" + (id || uid(16))),
    onSnapshot: (fn) => { const s = {col, fn}; subs.push(s); setTimeout(() => fn(snapOf(col))); return () => subs.splice(subs.indexOf(s), 1); } }) };
}

/* ================= Store ================= */
const store = {classes:[], cours:[], controles:[], feuilles:{}, ecritures:{}, bilans:{}};
const S = {
  view:"home", wizStep:1, coursId:null, coursDraft:null, params:{classeId:"", titre:"", duree:55, nbq:5, difficulte:"moyen", types:["cours","application"], consignes:"", differencie:true, matiere:"", niveau:""},
  editId:null, vtab:{}, previewEleve:null, classeSel:null, levelMat:"Mathématiques", suggestions:null,
  su:null, bk:null, bankOpen:false, bkq:"", corrCtrl:null, corrEleve:null, editTr:{}, editCom:{}, anCtrl:null, queue:[], queueRunning:false, busy:{}
};
try { const v = localStorage.getItem("tikoun2.view"); if (v && v !== "edit") S.view = v; } catch(e){}

const classe = id => store.classes.find(c => c.id === id);
const ctrl = id => store.controles.find(c => c.id === id);
const feuille = id => store.feuilles[id];
const eleveOf = (c, eid) => (classe(c.classeId)?.eleves || []).find(e => e.id === eid);
const studentsOf = c => { const cl = classe(c.classeId); if (!cl) return []; return c.eleves?.length ? cl.eleves.filter(e => c.eleves.includes(e.id)) : cl.eleves; };
const levelOf = (e, mat) => e?.niveaux?.[mat] || "standard";
const versionFor = (c, e) => c.differencie ? levelOf(e, c.matiere) : "standard";
const vOf = (q, lvl) => { const v = q.v || {}; if (v[lvl]?.enonce) return v[lvl]; if (v.standard?.enonce) return v.standard; return LEVELS.map(l => v[l]).find(x => x?.enonce) || {enonce:"", corrige:"", criteres:""}; };
const maxOf = c => (c.questions || []).reduce((a, q) => a + (+q.points || 0), 0);
const noteOf = a => a ? (a.note ?? a.noteIA ?? null) : null;
const copyTotal = (c, cp) => (c.questions || []).reduce((s, q) => s + (+noteOf(cp?.answers?.[q.id]) || 0), 0);
const copyDone = (c, cp) => !!cp && (c.questions || []).every(q => noteOf(cp.answers?.[q.id]) != null);
const on20 = (t, m) => m ? t / m * 20 : null;
const bonusMax = c => (+c.bonus?.proprete || 0) + (+c.bonus?.orthographe || 0);
function bonusOf(c, cp){
  const out = {proprete:0, orthographe:0}; if (!cp) return out;
  for (const k of ["proprete","orthographe"]){ const mx = +c.bonus?.[k] || 0; if (!mx) continue;
    if (cp.bonusProf?.[k] != null){ out[k] = +cp.bonusProf[k]; continue; }
    const fr = Object.values(cp.bonusPages || {}).map(b => +b?.[k]).filter(x => !isNaN(x));
    out[k] = fr.length ? half(mx * fr.reduce((a, b) => a + b, 0) / fr.length) : 0; }
  return out;
}
const final20 = (c, cp) => { const b = bonusOf(c, cp); return Math.min(20, on20(copyTotal(c, cp), maxOf(c)) + b.proprete + b.orthographe); };

/* Serialized writes: one at a time */
let wq = Promise.resolve();
function write(path, data, mode = "set"){
  wq = wq.then(() => mode === "update" ? DB.doc(path).update(data) : mode === "delete" ? DB.doc(path).delete() : DB.doc(path).set(data))
    .catch(e => { console.error(e); toast(e?.code === "quota_exceeded" ? "Base pleine : supprime d'anciens contrôles." : "Enregistrement impossible (" + (e?.code || "erreur") + ")."); });
  return wq;
}
const saveCtrl = c => { const {id, ...d} = c; return write("controles/" + id, d); };

/* ================= AI ================= */
async function ai(prompt, opts = {}){
  if (!AI) throw {code:"no_ai"};
  return AI.json(prompt, {cache:false, ...opts});
}
async function aiText(prompt, opts = {}){
  if (!AI) throw {code:"no_ai"};
  return (await AI(prompt, {cache:false, ...opts})).text;
}
const NOSRC = "N'invente aucune source, référence ni citation : appuie-toi uniquement sur le cours et le corrigé-type fournis. Recopie tout texte en hébreu exactement comme dans le cours.";

/* ================= Render loop (keeps focus while data arrives) ================= */
let rq = false, skipped = false;
document.addEventListener("focusout", () => { if (skipped) setTimeout(scheduleRender, 0); });
function scheduleRender(){ if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; render(); }); }
function render(){
  const a = document.activeElement, keep = a && a.id && $("#view").contains(a) ? {id:a.id, s:a.selectionStart, e:a.selectionEnd, v:a.value, typing: ["INPUT","TEXTAREA"].includes(a.tagName) && a.type !== "file"} : null;
  if (keep?.typing && a.dataset.live !== undefined){ skipped = true; return; } // don't clobber a field being typed
  skipped = false;
  $$(".tab").forEach(t => t.setAttribute("aria-selected", t.dataset.v === (S.view === "edit" ? "new" : S.view)));
  const V = (typeof SB !== "undefined" && SB && !SB_USER) ? vLogin : {home:vHome, classes:vClasses, new:vNew, edit:vEdit, scan:vScan, correct:vCorrect, analyse:vAnalyse, suivi:vSuivi, banque:vBanque, direction:vDirection, reglages:vReglages}[S.view] || vHome;
  $("#tabs").hidden = V === vLogin;
  $("#view").innerHTML = `<div class="view">${LOCAL ? `<p class="banner">Base de données indisponible dans cette vue : rien n'est sauvegardé. Ouvre l'application depuis claude.ai.</p>` : ""}${V()}</div>`;
  if (keep){ const el = document.getElementById(keep.id); if (el){ el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch(e){} } }
  if (S.view === "edit") drawPreview();
  if (S.view === "correct" && window.MathJax?.typesetPromise){ const v = $("#view"); MathJax.typesetClear?.([v]); MathJax.typesetPromise([v]).catch(() => {}); }
  try { localStorage.setItem("tikoun2.view", S.view); } catch(e){}
}
function go(v){ S.view = v; render(); window.scrollTo({top:0}); }
const chipStatut = c => { const [l, t] = STATUT[c.statut] || STATUT.brouillon; return `<span class="chip ${t}">${l}</span>`; };
const selOpts = (arr, cur, lab = x => x, val = x => x) => arr.map(x => `<option value="${esc(val(x))}"${val(x) === cur ? " selected" : ""}>${esc(lab(x))}</option>`).join("");

/* ================= HOME ================= */
function vHome(){
  if (!store.classes.length) return `
  <div class="head"><div><h2>Bienvenue sur Tikoun</h2><p>Du cours au rattrapage : l'IA prépare et corrige, le professeur décide.</p></div></div>
  <section class="panel grid">
    <div class="grid g3">
      <div><div class="label">1 · Classe</div><p>Crée ta classe et colle la liste des élèves.</p></div>
      <div><div class="label">2 · Contrôle</div><p>Importe le cours (PDF, photo ou texte). L'IA propose un contrôle en 3 niveaux. Tu modifies, puis tu imprimes : une feuille par élève, avec son QR code.</p></div>
      <div><div class="label">3 · Copies</div><p>Photographie ou scanne les copies. Le QR code identifie l'élève. L'IA lit l'écriture et corrige. Tu valides, puis tu vois la classe et crées les rattrapages.</p></div>
    </div>
    <div class="row"><button class="btn primary" data-go="classes">Créer une classe</button><button class="btn" id="demo">Charger une classe de démonstration</button></div>
  </section>`;
  const cs = [...store.controles].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const todo = cs.filter(c => c.statut !== "corrige"), done = cs.filter(c => c.statut === "corrige");
  let aValider = 0; cs.forEach(c => { const f = feuille(c.id); if (f) Object.values(f.copies || {}).forEach(cp => { if (!cp.validee && Object.keys(cp.answers || {}).length) aValider++; }); });
  const line = c => `<div class="item"><div><div class="t">${c.type === "rattrapage" ? '<span class="chip blue">Rattrapage</span> ' : ""}${esc(c.titre)}</div>
      <div class="s">${esc(c.matiere)} · ${esc(classe(c.classeId)?.nom || "?")}${c.type === "rattrapage" ? " · " + esc(studentsOf(c).map(e => e.prenom + " " + e.nom).join(", ")) : ""} · ${frDate(c.date) || "sans date"}</div></div>
      <div class="row">${chipStatut(c)}<button class="btn sm" data-edit="${c.id}">${c.statut === "brouillon" ? "Modifier" : "Feuilles"}</button>
      ${c.statut !== "brouillon" ? `<button class="btn sm" data-corr="${c.id}">Correction</button>` : ""}${c.statut === "corrige" || c.statut === "correction" ? `<button class="btn sm" data-an="${c.id}">Analyse</button>` : ""}</div></div>`;
  return `
  <div class="head"><div><h2>Tableau de bord</h2><p>${store.classes.length} classe(s) · ${cs.length} contrôle(s)${aValider ? ` · <b style="color:var(--pen)">${aValider} copie(s) à valider</b>` : ""}</p></div>
    <div class="row"><button class="btn primary" data-go="new">+ Nouveau contrôle</button><button class="btn" data-go="scan">Scanner des copies</button></div></div>
  <section class="panel"><h3>En cours</h3><div style="margin-top:4px">${todo.map(line).join("") || `<p class="muted" style="padding:10px 0">Aucun contrôle en cours.</p>`}</div></section>
  ${done.length ? `<section class="panel"><h3>Corrigés</h3><div style="margin-top:4px">${done.map(line).join("")}</div></section>` : ""}`;
}

/* ================= CLASSES ================= */
function vClasses(){
  const cl = classe(S.classeSel) || store.classes[0];
  if (cl) S.classeSel = cl.id;
  const sug = S.suggestions && S.suggestions.classeId === cl?.id && S.suggestions.mat === S.levelMat ? S.suggestions.map : null;
  return `
  <div class="head"><div><h2>Classes</h2><p>Chaque élève a un niveau par matière : il détermine la version de sa feuille (socle, standard ou approfondi).</p></div></div>
  <div class="split">
    <aside class="panel" style="padding:8px">
      ${store.classes.map(c => `<button class="stu" data-classe="${c.id}" aria-current="${c.id === cl?.id}"><span>${esc(c.nom)}</span><span class="chip">${(c.eleves || []).length}</span></button>`).join("")}
      <div class="grid" style="padding:10px 8px 6px;gap:8px;border-top:1px solid var(--line);margin-top:6px">
        <div class="label">Nouvelle classe</div>
        <input id="nc-nom" placeholder="ex. 3e A">
        <select id="nc-niv" aria-label="Niveau">${selOpts(NIVEAUX, "3e")}</select>
        <button class="btn sm primary" id="nc-go">Créer</button>
      </div>
    </aside>
    ${cl ? `<section class="panel grid">
      <div class="row between"><h3 style="font-size:20px">${esc(cl.nom)} <span class="muted small">· ${esc(cl.niveau)}</span></h3>
        <div class="row"><select id="lvlMat" style="width:auto" aria-label="Matière">${selOpts(MATIERES, S.levelMat)}</select>
        <button class="btn sm" id="sugg">Suggérer les niveaux</button></div></div>
      ${sug ? `<div class="banner">Suggestions calculées sur les 3 derniers contrôles validés en ${esc(S.levelMat)} (moins de 10/20 : socle · 10 à 15 : standard · plus de 15 : approfondi). <button class="btn sm" id="applySug">Appliquer</button></div>` : ""}
      <div class="tbl-wrap"><table><thead><tr><th>Élève</th><th>Niveau · ${esc(S.levelMat)}</th>${sug ? "<th>Suggestion</th>" : ""}<th>Écriture</th><th></th></tr></thead><tbody>
      ${(cl.eleves || []).map(e => `<tr><td><b>${esc(e.prenom)} ${esc(e.nom)}</b></td>
        <td><select data-lvl="${e.id}" style="width:auto" aria-label="Niveau de ${esc(e.prenom)}">${selOpts(LEVELS, levelOf(e, S.levelMat), l => LVL[l])}</select></td>
        ${sug ? `<td>${sug[e.id] ? `<span class="lvl ${sug[e.id].lvl}">${LVL[sug[e.id].lvl]}</span> <span class="muted small num">${fmt(sug[e.id].avg)}/20</span>` : `<span class="muted small">pas de note</span>`}</td>` : ""}
        <td>${(() => { const w = store.ecritures[e.id]; const sc = w?.parUsage?.[usageOf(S.levelMat)] ?? w?.score; return w ? (sc != null ? `<span class="chip ${tone(sc >= .9 ? 1 : sc >= .75 ? .6 : 0)}" title="Lisibilité mesurée sur la fiche d'écriture">${pct(sc)}</span>` : `<span class="chip">fiche reçue</span>`) : `<span class="muted small">—</span>`; })()}</td>
        <td><button class="btn sm ghost" data-rmel="${e.id}" aria-label="Retirer">Retirer</button></td></tr>`).join("") || `<tr><td colspan="4" class="muted">Aucun élève.</td></tr>`}
      </tbody></table></div>
      <div class="field"><label for="add-el">Ajouter des élèves : un par ligne, « Prénom Nom »</label><textarea id="add-el" data-live placeholder="Mendel Cohen&#10;Yossef Levy"></textarea></div>
      <div class="row between"><button class="btn primary" id="add-go">Ajouter</button><button class="btn sm ghost" id="del-cl">Supprimer la classe</button></div>
      <div class="grid" style="gap:6px;border-top:1px solid var(--line);padding-top:12px"><div class="row between"><div><b>Fiche d'écriture</b><div class="small muted">À faire remplir en septembre et en janvier (10 min), puis à scanner. Mesure la lisibilité de chaque élève et aide l'IA à relire son écriture.</div></div>
        <button class="btn" id="fiches">Fiches de la classe (PDF)</button></div><div class="status" id="fi-st"></div></div>
    </section>` : `<section class="panel empty">Crée ta première classe à gauche.</section>`}
  </div>`;
}

/* ================= NEW CONTROL (wizard) ================= */
function vNew(){
  const st = n => `<span class="step ${S.wizStep === n ? "on" : S.wizStep > n ? "done" : ""}">${n}. ${["Cours","Paramètres","Édition & impression"][n - 1]}</span>`;
  return `<div class="head"><div><h2>Nouveau contrôle</h2><p>Le cours sert de base. L'IA propose, tu gardes la main sur tout.</p></div></div>
  <div class="steps">${st(1)}${st(2)}${st(3)}</div>
  ${S.wizStep === 1 ? wizCours() : wizParams()}`;
}
function wizCours(){
  const d = S.coursDraft;
  const list = [...store.cours].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return `
  ${list.length ? `<section class="panel"><h3>Reprendre un cours déjà importé</h3>
    <div style="margin-top:4px">${list.map(c => `<div class="item"><div><div class="t">${esc(c.titre)}</div><div class="s">${esc(c.matiere)} · ${esc(c.niveau)} · ${(c.texte || "").length.toLocaleString("fr-FR")} caractères</div></div>
      <div class="row"><button class="btn sm primary" data-usecours="${c.id}">Utiliser</button><button class="btn sm ghost" data-delcours="${c.id}">Supprimer</button></div></div>`).join("")}</div></section>` : ""}
  <section class="panel grid">
    <h3>Importer un cours</h3>
    <div class="form-row">
      <div class="field"><label for="c-titre">Titre du cours</label><input id="c-titre" data-live value="${esc(d?.titre || "")}" placeholder="ex. Fonctions affines"></div>
      <div class="field"><label for="c-mat">Matière</label><select id="c-mat">${selOpts(MATIERES, d?.matiere || "Mathématiques")}</select></div>
      <div class="field"><label for="c-niv">Niveau</label><select id="c-niv">${selOpts(NIVEAUX, d?.niveau || "3e")}</select></div>
    </div>
    <label class="drop" for="c-files">Choisir des fichiers : PDF du cours, ou photos / scans des pages<br><span class="small">Plusieurs fichiers possibles</span></label>
    <input id="c-files" type="file" accept="application/pdf,image/*" multiple hidden>
    <div class="status" id="c-st"></div>
    <div class="field"><label for="c-texte">Texte du cours (extrait automatiquement, ou collé ici)</label><textarea id="c-texte" data-live style="min-height:200px">${esc(d?.texte || "")}</textarea></div>
    <div class="row"><button class="btn primary" id="c-save">Enregistrer le cours et continuer</button></div>
  </section>`;
}
function wizParams(){
  const co = store.cours.find(c => c.id === S.coursId);
  const p = S.params;
  if (!p.matiere) p.matiere = co?.matiere || "Mathématiques";
  if (!p.niveau) p.niveau = co?.niveau || "3e";
  if (!p.classeId && store.classes[0]) p.classeId = (store.classes.find(c => c.niveau === p.niveau) || store.classes[0]).id;
  const T = [["cours","Questions de cours"],["application","Exercices d'application"],["probleme","Problème / rédaction"],["texte","Lecture / explication de texte"],["traduction","Traduction"],["qcm","QCM (corrigés sans IA, gratuit)"]];
  return `
  <section class="panel grid">
    <div class="row between"><div><div class="label">Cours</div><b>${esc(co?.titre || "?")}</b> <span class="muted small">· ${esc(co?.matiere)} · ${esc(co?.niveau)}</span></div><button class="btn sm" id="back1">Changer de cours</button></div>
    <div class="form-row">
      <div class="field"><label for="p-cl">Classe</label><select id="p-cl" data-p="classeId">${store.classes.length ? selOpts(store.classes, p.classeId, c => c.nom, c => c.id) : `<option value="">Crée d'abord une classe</option>`}</select></div>
      <div class="field"><label for="p-mat">Matière</label><select id="p-mat" data-p="matiere">${selOpts(MATIERES, p.matiere)}</select></div>
      <div class="field"><label for="p-niv">Niveau</label><select id="p-niv" data-p="niveau">${selOpts(NIVEAUX, p.niveau)}</select></div>
      <div class="field"><label for="p-dur">Durée (min)</label><input id="p-dur" type="number" min="10" max="240" data-p="duree" value="${esc(p.duree)}"></div>
      <div class="field"><label for="p-nbq">Nombre de questions</label><input id="p-nbq" type="number" min="2" max="10" data-p="nbq" value="${esc(p.nbq)}"></div>
      <div class="field"><label for="p-dif">Difficulté</label><select id="p-dif" data-p="difficulte">${selOpts(["facile","moyen","exigeant"], p.difficulte)}</select></div>
    </div>
    <div class="field"><label for="p-titre">Titre du contrôle (facultatif)</label><input id="p-titre" data-p="titre" data-live value="${esc(p.titre)}" placeholder="Proposé par l'IA si vide"></div>
    <div class="field"><label>Types de questions</label><div class="row">${T.map(([k, l]) => `<label class="row small" style="gap:6px"><input type="checkbox" data-type="${k}"${p.types.includes(k) ? " checked" : ""}> ${l}</label>`).join("")}</div></div>
    <label class="row small" style="gap:6px"><input type="checkbox" id="p-diff"${p.differencie ? " checked" : ""}> Feuilles différenciées : chaque question en 3 niveaux (socle, standard, approfondi), selon le niveau de chaque élève</label>
    <div class="field"><label for="p-cons">Tes consignes à l'IA (facultatif)</label><textarea id="p-cons" data-p="consignes" data-live placeholder="ex. Insister sur la notion d'antécédent. Une question de rédaction à la fin.">${esc(p.consignes)}</textarea></div>
    <div class="row"><button class="btn primary" id="gen" ${store.classes.length ? "" : "disabled"}>Générer le contrôle (IA)</button><button class="btn" id="genBlank" ${store.classes.length ? "" : "disabled"}>Partir d'un contrôle vide</button><span class="status" id="gen-st"></span></div>
  </section>`;
}

/* ================= EDIT / LAYOUT / PRINT ================= */
function vEdit(){
  const c = ctrl(S.editId);
  if (!c) return `<div class="panel empty">Contrôle introuvable. <button class="btn sm" data-go="home">Retour</button></div>`;
  const cl = classe(c.classeId), studs = studentsOf(c), f = feuille(c.id);
  const m = c.mise || {}; const tot = maxOf(c);
  if (!S.previewEleve || !studs.find(e => e.id === S.previewEleve)) S.previewEleve = studs[0]?.id || null;
  const printed = !!f && Object.keys(f.copies || {}).length;
  const scanned = printed && Object.values(f.copies).some(cp => Object.keys(cp.scans || {}).length);
  return `
  <div class="head"><div><div class="label">${c.type === "rattrapage" ? "Rattrapage" : "Contrôle"} · ${esc(c.matiere)} · ${esc(cl?.nom || "?")}</div><h2>${esc(c.titre)}</h2></div>
    <div class="row">${chipStatut(c)}<button class="btn sm" data-go="home">Tableau de bord</button></div></div>
  <div class="steps"><span class="step done">1. Cours</span><span class="step done">2. Paramètres</span><span class="step on">3. Édition & impression</span></div>
  <section class="panel grid">
    <div class="form-row">
      <div class="field"><label for="e-titre">Titre</label><input id="e-titre" data-c="titre" data-live value="${esc(c.titre)}"></div>
      <div class="field"><label for="e-date">Date</label><input id="e-date" type="date" data-c="date" value="${esc(c.date || "")}"></div>
      <div class="field"><label for="e-dur">Durée (min)</label><input id="e-dur" type="number" data-c="duree" value="${esc(c.duree || "")}"></div>
    </div>
    <label class="row small" style="gap:6px"><input type="checkbox" id="e-diff"${c.differencie ? " checked" : ""}> Feuilles différenciées selon le niveau de chaque élève</label>
  </section>
  <div class="head"><h3>Questions <span class="muted num" style="font-weight:500">· total ${fmt(tot)} pts${tot !== 20 ? " (ramené sur 20)" : ""}</span></h3>
    <div class="row"><button class="btn sm" id="addQ">+ Question vide</button><button class="btn sm" id="addQcm">+ QCM</button><button class="btn sm" id="addQai">+ Question (IA)</button><button class="btn sm" id="bankOpen">${S.bankOpen ? "Fermer la banque" : "+ Depuis la banque"}</button></div></div>
  ${S.bankOpen ? bankPanel(c) : ""}
  ${(c.questions || []).map((q, i) => qEditor(c, q, i)).join("") || `<div class="panel empty">Aucune question.</div>`}
  <section class="panel grid">
    <h3>Mise en page</h3>
    <div class="form-row">
      <div class="field"><label for="m-ent">En-tête</label><input id="m-ent" data-m="entete" data-live value="${esc(m.entete ?? ECOLE)}"></div>
      <div class="field"><label for="m-pol">Taille du texte</label><select id="m-pol" data-m="police">${selOpts(["13","14","15","16","17"], String(m.police || 15), x => x + " pt")}</select></div>
      <div class="field"><label for="m-lh">Interligne des cadres</label><select id="m-lh" data-m="lh">${selOpts(["26","30","34","38"], String(m.lh || 30), x => ({26:"Serré",30:"Normal",34:"Large",38:"Très large"}[x]))}</select></div>
    </div>
    <div class="field"><label for="m-cons">Consignes imprimées en haut de la feuille</label><textarea id="m-cons" data-m="consignes" data-live>${esc(m.consignes ?? "Calculatrice interdite. Écris uniquement dans les cadres.")}</textarea></div>
    <label class="row small" style="gap:6px"><input type="checkbox" id="m-bar"${m.bareme !== false ? " checked" : ""}> Afficher le barème de chaque question</label>
    <div class="form-row">
      <div class="field"><label for="b-pr">Bonus propreté (en plus des 20)</label><select id="b-pr" data-bo="proprete">${selOpts(["0","0.5","1","2"], String(c.bonus?.proprete || 0), x => x === "0" ? "Aucun" : "jusqu'à +" + x.replace(".", ","))}</select></div>
      <div class="field"><label for="b-or">Bonus orthographe</label><select id="b-or" data-bo="orthographe">${selOpts(["0","0.5","1","2"], String(c.bonus?.orthographe || 0), x => x === "0" ? "Aucun" : "jusqu'à +" + x.replace(".", ","))}</select></div>
    </div>
    <div class="row between"><div class="label">Aperçu</div><select id="prevEl" style="width:auto" aria-label="Élève">${selOpts(studs, S.previewEleve, e => e.prenom + " " + e.nom + (c.differencie ? " · " + LVL[versionFor(c, e)] : ""), e => e.id)}</select></div>
    <div class="preview-wrap" id="preview"></div>
  </section>
  <section class="panel grid">
    <h3>Impression</h3>
    <p class="muted small">Un PDF pour toute la classe : une feuille par élève, avec son nom et son QR code sur chaque page. Le niveau n'est pas écrit sur la feuille, il est seulement contenu dans le QR code.</p>
    ${scanned ? `<p class="banner">Des copies ont déjà été scannées. Réimprimer garde les scans et les notes existants, mais une mise en page différente peut décaler les questions par page.</p>` : ""}
    <div class="row"><button class="btn primary" id="print">${printed ? "Réimprimer" : "Générer"} les feuilles · ${studs.length} élève(s)</button>
      <button class="btn" id="print1">Feuille de l'élève affiché</button><button class="btn ghost sm" id="delCtrl">Supprimer</button></div>
    <div class="status" id="pr-st"></div>
  </section>`;
}
function qEditor(c, q, i){
  const vt = c.differencie ? (S.vtab[q.id] || "standard") : "standard";
  const v = q.v?.[vt] || {enonce:"", corrige:"", criteres:""};
  return `<section class="qed">
    <div class="row between"><b>Question ${i + 1}</b><div class="row">
      <button class="btn sm ghost" data-qup="${i}" ${i ? "" : "disabled"} aria-label="Monter">↑</button>
      <button class="btn sm ghost" data-qdown="${i}" ${i < c.questions.length - 1 ? "" : "disabled"} aria-label="Descendre">↓</button>
      <button class="btn sm ghost" data-qdel="${i}">Supprimer</button></div></div>
    <div class="form-row">
      <div class="field"><label for="q-n-${q.id}">Notion</label><input id="q-n-${q.id}" data-q="${i}" data-k="notion" data-live value="${esc(q.notion || "")}"></div>
      <div class="field"><label for="q-p-${q.id}">Points</label><input id="q-p-${q.id}" type="number" min="0" step="0.5" data-q="${i}" data-k="points" value="${esc(q.points)}"></div>
      <div class="field"><label for="q-t-${q.id}">Type</label><select id="q-t-${q.id}" data-q="${i}" data-k="type">${selOpts(["", "qcm"], q.type || "", x => x ? "QCM (sans IA)" : "Réponse rédigée")}</select></div>
      ${q.type === "qcm" ? "" : `<div class="field"><label for="q-l-${q.id}">Lignes de réponse</label><input id="q-l-${q.id}" type="number" min="1" max="30" data-q="${i}" data-k="lignes" value="${esc(q.lignes || 5)}"></div>`}
    </div>
    ${c.differencie ? `<div class="vtabs" role="tablist">${LEVELS.map(l => `<button class="vtab" role="tab" data-vt="${q.id}" data-l="${l}" aria-selected="${l === vt}">${LVL[l]}</button>`).join("")}</div>` : ""}
    <div class="field"><label for="q-e-${q.id}-${vt}">Énoncé${c.differencie ? " · " + LVL[vt] : ""}</label><textarea id="q-e-${q.id}-${vt}" dir="auto" data-q="${i}" data-vk="enonce" data-lv="${vt}" data-live>${esc(v.enonce)}</textarea></div>
    ${q.type === "qcm" ? `<div class="field"><label for="q-ch-${q.id}-${vt}">Choix : un par ligne, mets * devant les bonnes réponses</label><textarea id="q-ch-${q.id}-${vt}" dir="auto" data-q="${i}" data-vk="choixRaw" data-lv="${vt}" data-live>${esc((v.choix || []).map((ch, j) => ((v.bonnes || []).includes(j) ? "*" : "") + ch).join("\n"))}</textarea></div>` : `
    <div class="field"><label for="q-c-${q.id}-${vt}">Corrigé-type</label><textarea id="q-c-${q.id}-${vt}" dir="auto" data-q="${i}" data-vk="corrige" data-lv="${vt}" data-live>${esc(v.corrige)}</textarea></div>
    <div class="field"><label for="q-k-${q.id}-${vt}">Critères de notation</label><textarea id="q-k-${q.id}-${vt}" data-q="${i}" data-vk="criteres" data-lv="${vt}" data-live style="min-height:50px">${esc(v.criteres)}</textarea></div>`}
    <div class="field"><label for="q-x-${q.id}">Erreurs types (séparées par « ; ») : servent à regrouper les erreurs de la classe</label><input id="q-x-${q.id}" data-q="${i}" data-k="erreurs" data-live value="${esc((q.erreurs || []).join(" ; "))}"></div>
    <div class="row"><input id="q-i-${q.id}" data-live placeholder="Retravailler avec l'IA : ex. plus court, plus difficile…" style="flex:1;min-width:180px"><button class="btn sm" data-qai="${i}">Retravailler (IA)</button><span class="status" id="q-st-${q.id}"></span></div>
  </section>`;
}

/* ---------- sheet building (paper) ---------- */
function qrURL(text, cell = 4){ const q = qrcode(0, "M"); q.addData(text); q.make(); return q.createDataURL(cell, 0); }
const payload = (cid, eid, p) => `TK1|${cid}|${eid}|${p}`;
const CORNERS = {tl:[58, 58], tr:[752, 42], bl:[42, 1081], br:[752, 1081]}; const CSIZE = {tl:84, tr:52, bl:52, br:52}; /* marker centres on the 794×1123 sheet */
const pageQ = pg => Array.isArray(pg) ? pg : (pg?.q || []);
function sheetPages(c, e){
  const stage = $("#sheetStage"); stage.innerHTML = "";
  const m = c.mise || {}, pol = +(m.police || 15), lh = +(m.lh || 30);
  const cl = classe(c.classeId), ver = versionFor(c, e);
  const pages = []; const layout = [];
  const newPage = first => {
    const p = document.createElement("div"); p.className = "sheet"; p.style.fontSize = pol + "px";
    const n = pages.length + 1;
    p.innerHTML = first ? `
      <div class="sh-head"><div>
        <div class="sh-school">${esc(m.entete ?? ECOLE)}</div>
        <div class="sh-title" dir="auto">${esc(c.titre)}</div>
        <div class="sh-meta">${esc(c.matiere)} · ${esc(cl?.nom || "")}${c.date ? " · " + esc(frDate(c.date)) : ""}${c.duree ? " · " + esc(c.duree) + " min" : ""}${m.bareme !== false ? " · noté sur " + fmt(maxOf(c)) : ""}</div>
        <div class="sh-name">Élève : <b>${esc(e.prenom)} ${esc(e.nom)}</b></div>
      </div></div>
      ${(m.consignes ?? "").trim() ? `<div class="sh-cons">${esc(m.consignes)}</div>` : ""}`
      : `<div class="sh-mini">${esc(e.prenom)} ${esc(e.nom)} · ${esc(c.titre)} · page ${n}</div>`;
    for (const [k, [x, y]] of Object.entries(CORNERS)){ const z = CSIZE[k], im = document.createElement("img"); im.className = "sh-corner"; im.alt = "";
      im.src = qrURL(k === "tl" ? payload(c.id, e.id, n) : "TK1C|" + k, 3); im.style.cssText = `left:${x - z / 2}px;top:${y - z / 2}px;width:${z}px;height:${z}px`; p.append(im); }
    const foot = document.createElement("div"); foot.className = "sh-foot"; foot.innerHTML = `<span>Tikoun · ${esc(c.id)}·${esc(e.id)}</span><span class="pn">page ${n}</span>`; p.append(foot);
    stage.append(p); pages.push(p); layout.push([]); return p;
  };
  let page = newPage(true);
  const limit = () => 1123 - 84;
  (c.questions || []).forEach((q, i) => {
    const v = vOf(q, ver);
    const b = document.createElement("div"); b.className = "sh-q";
    const isQ = q.type === "qcm";
    b.innerHTML = `<div class="sh-qh"><span>Question ${i + 1}${isQ ? " · coche la ou les bonnes réponses" : ""}</span>${m.bareme !== false ? `<span>/ ${fmt(+q.points)}</span>` : ""}</div>
      <div class="sh-qt" dir="auto">${esc(v.enonce)}</div>
      ${isQ ? `<div class="sh-qcm">${(v.choix || []).map((ch, j) => `<div class="sh-opt"><span class="sh-case"></span><b>${"ABCDEFGH"[j]}</b><span dir="auto">${esc(ch)}</span></div>`).join("")}</div>`
        : `<div class="sh-box" data-tag="Q${i + 1}" style="--lh:${lh}px;height:${(+q.lignes || 5) * (lh + 1) + 8}px"></div>`}`;
    page.insertBefore(b, page.querySelector(".sh-foot"));
    if (b.offsetTop + b.offsetHeight > limit() && layout[layout.length - 1].length){
      b.remove(); page = newPage(false); page.insertBefore(b, page.querySelector(".sh-foot"));
    }
    const pr = page.getBoundingClientRect(), rel = el => { const r = el.getBoundingClientRect(); return {x:Math.round(r.left - pr.left), y:Math.round(r.top - pr.top), w:Math.round(r.width), h:Math.round(r.height)}; };
    if (isQ) layout[layout.length - 1].push({q:q.id, type:"qcm", ...rel(b.querySelector(".sh-qcm")), cases:$$(".sh-case", b).map(rel)});
    else layout[layout.length - 1].push({q:q.id, ...rel(b.querySelector(".sh-box"))});
  });
  pages.forEach((p, i) => { p.querySelector(".pn").textContent = `page ${i + 1} / ${pages.length}`; });
  return {pages, layout: layout.map(l => ({q:l.map(b => b.q), b:l})), version: Object.fromEntries((c.questions || []).map(q => [q.id, ver]))};
}
function drawPreview(){
  const c = ctrl(S.editId), box = $("#preview"); if (!c || !box) return;
  const e = studentsOf(c).find(x => x.id === S.previewEleve);
  if (!e){ box.innerHTML = `<p class="empty">Ajoute des élèves à la classe pour voir l'aperçu.</p>`; return; }
  if (!window.qrcode){ box.innerHTML = `<p class="empty">Chargement…</p>`; return; }
  const {pages} = sheetPages(c, e);
  const w = box.clientWidth || 600, sc = Math.min(1, (w - 16) / 794);
  box.innerHTML = "";
  const inner = document.createElement("div"); inner.style.cssText = "display:grid;gap:12px;padding:8px;justify-content:center";
  pages.forEach(p => { const holder = document.createElement("div"); holder.style.cssText = `width:${794 * sc}px;height:${1123 * sc}px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.15)`;
    const cl = p.cloneNode(true); cl.style.transform = `scale(${sc})`; cl.style.transformOrigin = "0 0"; holder.append(cl); inner.append(holder); });
  box.append(inner); $("#sheetStage").innerHTML = "";
}
async function printSheets(c, list){
  const st = $("#pr-st");
  if (!window.html2canvas || !window.jspdf){ st.textContent = "Bibliothèques PDF non chargées : recharge la page."; return; }
  if (!list.length){ st.textContent = "Aucun élève dans cette classe."; return; }
  const ov = document.createElement("div"); ov.className = "zoom"; ov.style.alignItems = "center"; ov.style.color = "#fff"; ov.innerHTML = `<div id="ovm" style="font-size:16px">Préparation…</div>`; document.body.append(ov);
  const stage = $("#sheetStage"); stage.style.left = "0"; stage.style.zIndex = "40";
  try{
    await document.fonts.ready;
    const pdf = new jspdf.jsPDF({unit:"pt", format:"a4"}); let first = true;
    const f = feuille(c.id) || {copies:{}}; const copies = {};
    for (let k = 0; k < list.length; k++){
      const e = list[k]; const {pages, layout, version} = sheetPages(c, e);
      for (let i = 0; i < pages.length; i++){
        $("#ovm").textContent = `Feuille ${k + 1} / ${list.length} · ${e.prenom} ${e.nom} · page ${i + 1}`;
        const cv = await html2canvas(pages[i], {scale:2, backgroundColor:"#ffffff", logging:false, scrollX:0, scrollY:-window.scrollY, windowWidth:900});
        if (!first) pdf.addPage(); first = false;
        pdf.addImage(cv.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 595.28, 841.89);
      }
      const old = f.copies?.[e.id] || {};
      copies[e.id] = {version, pages:layout, scans:old.scans || {}, answers:old.answers || {}, validee:!!old.validee};
    }
    stage.innerHTML = "";
    const blob = pdf.output("blob");
    const name = `${c.titre} - ${classe(c.classeId)?.nom || ""}${list.length === 1 ? " - " + list[0].prenom + " " + list[0].nom : ""}.pdf`.replace(/[\\/:*?"<>|]/g, "-");
    const all = {...(f.copies || {}), ...copies};
    await write("feuilles/" + c.id, {copies:all, printedAt:new Date().toISOString()});
    if (c.statut === "brouillon"){ c.statut = "imprime"; await saveCtrl(c); }
    ov.remove();
    if (DL){ try { await DL.save({filename:name, data:blob}); st.textContent = "PDF prêt. Imprime-le, puis scanne les copies dans l'onglet Scanner."; }
      catch(e){ st.textContent = e?.code === "declined" ? "Téléchargement annulé." : "Téléchargement impossible dans cette vue."; } }
    else st.textContent = "Téléchargement indisponible dans cette vue : ouvre l'application dans claude.ai.";
  }catch(e){ console.error(e); st.textContent = "Échec de génération du PDF."; }
  finally{ ov.remove(); stage.style.left = "-12000px"; stage.innerHTML = ""; }
}

/* ================= SCAN ================= */
function vScan(){
  const printed = store.controles.filter(c => c.statut !== "brouillon");
  return `
  <div class="head"><div><h2>Scanner les copies</h2><p>Photos prises au téléphone ou PDF du copieur, dans n'importe quel ordre. Le QR code retrouve l'élève et la page. Chaque page est ensuite lue et corrigée par l'IA.</p></div></div>
  <section class="panel grid">
    <label class="drop" for="sc-files">📷 Choisir des photos ou un PDF de copies<br><span class="small">Page bien à plat, entière, avec le QR code visible</span></label>
    <input id="sc-files" type="file" accept="image/*,application/pdf" multiple hidden>
    ${!AI ? `<p class="banner">L'IA n'est pas disponible dans cette vue : les QR codes seront lus, mais pas les réponses.</p>` : ""}
    ${!printed.length ? `<p class="muted small">Aucun contrôle imprimé pour l'instant.</p>` : ""}
  </section>
  ${S.queue.length ? `<section class="panel"><div class="row between"><h3>File de traitement</h3><button class="btn sm ghost" id="qclear">Vider la liste</button></div>
    <div class="queue" style="margin-top:6px">${S.queue.map(qItem).join("")}</div></section>` : ""}`;
}
function qItem(it){
  const c = it.ctrlId && ctrl(it.ctrlId), e = c && eleveOf(c, it.eleveId);
  const chip = {attente:["En attente",""], qr:["Lecture du QR…","blue"], lecture:["Lecture et correction…","blue"], ok:["Corrigée","ok"], manuel:["QR non lu","warn"], erreur:["Erreur","bad"]}[it.status];
  const printed = store.controles.filter(x => x.statut !== "brouillon");
  return `<div class="qi"><img alt="" src="${it.thumb}"><div><div class="t"><b>${it.label ? esc(it.label) : e ? esc(e.prenom + " " + e.nom) : esc(it.name)}</b>${c ? ` <span class="muted small">· ${esc(c.titre)} · p. ${it.page}</span>` : ""}</div>
    <div class="small ${it.status === "erreur" ? "err" : "muted"}">${esc(it.msg || "")}</div>
    ${it.status === "manuel" ? `<div class="row" style="margin-top:6px">
      <select data-mq="${it.id}" data-f="ctrlId" style="width:auto" aria-label="Contrôle"><option value="">Contrôle…</option>${selOpts(printed, it.ctrlId || "", x => x.titre + " · " + (classe(x.classeId)?.nom || ""), x => x.id)}</select>
      ${c ? `<select data-mq="${it.id}" data-f="eleveId" style="width:auto" aria-label="Élève"><option value="">Élève…</option>${selOpts(studentsOf(c), it.eleveId || "", x => x.prenom + " " + x.nom, x => x.id)}</select>` : ""}
      <select data-mq="${it.id}" data-f="page" style="width:auto" aria-label="Page">${selOpts(["1","2","3","4"], String(it.page || 1), x => "page " + x)}</select>
      <button class="btn sm primary" data-mgo="${it.id}" ${c && it.eleveId ? "" : "disabled"}>Traiter</button></div>` : ""}
  </div><div class="row">${chip ? `<span class="chip ${chip[1]}">${chip[0]}</span>` : ""}${it.status === "ok" && it.ctrlId ? `<button class="btn sm" data-corr="${it.ctrlId}" data-el="${it.eleveId}">Voir</button>` : ""}${it.status === "erreur" ? `<button class="btn sm" data-retry="${it.id}">Relancer</button>` : ""}</div></div>`;
}
async function fileToCanvases(file){
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)){
    const pdf = await pdfjsLib.getDocument({data: await file.arrayBuffer()}).promise; const out = [];
    for (let i = 1; i <= pdf.numPages; i++){ const pg = await pdf.getPage(i); const vp = pg.getViewport({scale: 2000 / Math.max(pg.view[2], pg.view[3])});
      const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height; await pg.render({canvasContext:cv.getContext("2d"), viewport:vp}).promise; out.push(cv); }
    return out;
  }
  let bmp; try { bmp = await createImageBitmap(file, {imageOrientation:"from-image"}); } catch(e){ bmp = await createImageBitmap(file); }
  const sc = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * sc); cv.height = Math.round(bmp.height * sc);
  cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height); return [cv];
}
function scaled(cv, maxSide){ const sc = Math.min(1, maxSide / Math.max(cv.width, cv.height)); const o = document.createElement("canvas"); o.width = Math.round(cv.width * sc); o.height = Math.round(cv.height * sc); o.getContext("2d").drawImage(cv, 0, 0, o.width, o.height); return o; }
function crop(cv, x, y, w, h){ const o = document.createElement("canvas"); o.width = Math.round(w); o.height = Math.round(h); o.getContext("2d").drawImage(cv, x, y, w, h, 0, 0, o.width, o.height); return o; }
function readQR(cv){
  if (!window.jsQR) return null;
  const tryOn = c => { const d = c.getContext("2d").getImageData(0, 0, c.width, c.height); const r = jsQR(d.data, c.width, c.height, {inversionAttempts:"attemptBoth"}); return r?.data?.startsWith("TK1|") ? r.data : null; };
  const W = cv.width, H = cv.height;
  return tryOn(scaled(cv, 1100)) || tryOn(crop(cv, W * 0.5, 0, W * 0.5, H * 0.4)) || tryOn(crop(cv, 0, 0, W * 0.5, H * 0.4)) || tryOn(crop(cv, W * 0.5, H * 0.6, W * 0.5, H * 0.4)) || tryOn(scaled(cv, 1700));
}
function detectAll(cv){
  if (!window.jsQR) return [];
  const W = cv.width, H = cv.height, found = [];
  for (const [fx, fy] of [[0, 0], [.58, 0], [0, .7], [.58, .7]]){
    const x0 = W * fx, y0 = H * fy, w = W * .42, h = H * .3;
    const r0 = crop(cv, x0, y0, w, h), r = scaled(r0, 1000), k = r0.width / r.width;
    const d = r.getContext("2d").getImageData(0, 0, r.width, r.height);
    const q = jsQR(d.data, r.width, r.height, {inversionAttempts:"attemptBoth"});
    if (!q) continue;
    const L = q.location, pts = [L.topLeftCorner, L.topRightCorner, L.bottomRightCorner, L.bottomLeftCorner];
    found.push({data:q.data, x:x0 + k * pts.reduce((a, p) => a + p.x, 0) / 4, y:y0 + k * pts.reduce((a, p) => a + p.y, 0) / 4});
  }
  return found;
}
function solve(A, b){ const n = b.length; A = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++){ let m = i; for (let k = i + 1; k < n; k++) if (Math.abs(A[k][i]) > Math.abs(A[m][i])) m = k; [A[i], A[m]] = [A[m], A[i]];
    for (let k = i + 1; k < n; k++){ const f = A[k][i] / A[i][i]; for (let j = i; j <= n; j++) A[k][j] -= f * A[i][j]; } }
  const x = Array(n).fill(0); for (let i = n - 1; i >= 0; i--){ let s = A[i][n]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; } return x; }
function homography(src, dst){ const A = [], b = [];
  for (let i = 0; i < 4; i++){ const [x, y] = src[i], [u, v] = dst[i]; A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u); A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v); }
  return [...solve(A, b), 1]; }
const applyH = (H, x, y) => { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; };
/* sheet → photo mapping from the 4 corner markers (3 are enough) */
function sheetToPhoto(found){
  const m = {}; found.forEach(f => { const k = /^TK1W?\|/.test(f.data) ? "tl" : f.data.startsWith("TK1C|") && f.data.slice(5); if (CORNERS[k]) m[k] = [f.x, f.y]; });
  const ks = Object.keys(m); if (ks.length < 3) return null;
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
function pix(cv){ if (!cv._d) cv._d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; return cv._d; }
/* QCM: dark-pixel ratio inside each printed box */
function readMarks(cv, H, b){
  const d = pix(cv), SW = cv.width, SH = cv.height, ratios = (b.cases || []).map(cs => {
    let dark = 0, n = 0;
    for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++){
      const [x, y] = applyH(H, cs.x + cs.w * (0.22 + 0.56 * i / 11), cs.y + cs.h * (0.22 + 0.56 * j / 11)); const X = x | 0, Y = y | 0;
      if (X < 0 || Y < 0 || X >= SW || Y >= SH) continue; const o = (Y * SW + X) * 4; n++; if (0.3 * d[o] + 0.59 * d[o + 1] + 0.11 * d[o + 2] < 125) dark++; }
    return n ? dark / n : 0; });
  return {coches: ratios.map((r, j) => r > 0.14 ? j : -1).filter(j => j >= 0), ambigu: ratios.some(r => r > 0.05 && r <= 0.14), ratios};
}
function qcmAnswer(q, ver, coches, ambigu){
  const v = vOf(q, ver), L = "ABCDEFGH", good = new Set((v.bonnes || []).map(Number)), got = [...new Set(coches)].sort();
  const ok = got.length === good.size && got.every(j => good.has(j));
  const lettres = got.map(j => L[j]);
  return {transcription:"Coché : " + (lettres.join(", ") || "aucune case"), annot:"Coché : " + (got.map(j => good.has(j) ? L[j] : `⟦${L[j]}⟧`).join(", ") || "⟦aucune case⟧"),
    lisible:!ambigu, noteIA:ok ? +q.points : 0, note:null, commentaire:ok ? "Bonne réponse." : `La bonne réponse était : ${[...good].sort().map(j => L[j]).join(", ")}.`,
    erreurs:ok ? [] : ["réponse QCM incorrecte"], acquis:ok ? [q.notion || "QCM"] : [], valide:false, auto:true};
}
const toBlob = (cv, q = 0.85) => new Promise(r => cv.toBlob(r, "image/jpeg", q));
async function addScans(files){
  for (const f of files){
    let cvs; try { cvs = await fileToCanvases(f); } catch(e){ S.queue.push({id:uid(), name:f.name, thumb:"", status:"erreur", msg:"Fichier illisible."}); continue; }
    cvs.forEach((cv, i) => S.queue.push({id:uid(), name:f.name + (cvs.length > 1 ? " · p." + (i + 1) : ""), cv, thumb:scaled(cv, 160).toDataURL("image/jpeg", .7), status:"attente", msg:""}));
  }
  render(); runQueue();
}
async function runQueue(){
  if (S.queueRunning) return; S.queueRunning = true;
  try{
    let it;
    while ((it = S.queue.find(x => x.status === "attente"))){
      it.status = "qr"; it.msg = ""; scheduleRender();
      it.found = detectAll(it.cv);
      const data = it.found.find(f => /^TK1W?\|/.test(f.data))?.data || readQR(it.cv);
      if (!data){ it.status = "manuel"; it.msg = "Choisis le contrôle, l'élève et la page, ou reprends la photo avec le QR code bien net."; scheduleRender(); continue; }
      if (data.startsWith("TK1W|")){ await processWriting(it, data); continue; }
      const [, cid, eid, p] = data.split("|"); it.ctrlId = cid; it.eleveId = eid; it.page = +p || 1;
      await processPage(it);
    }
  } finally { S.queueRunning = false; scheduleRender(); }
}
async function processPage(it){
  const c = ctrl(it.ctrlId), f = feuille(it.ctrlId), cp = f?.copies?.[it.eleveId];
  if (!c){ it.status = "erreur"; it.msg = "Contrôle introuvable (supprimé ?)."; return scheduleRender(); }
  if (!cp){ it.status = "erreur"; it.msg = "Feuille de cet élève non trouvée : réimprime les feuilles depuis l'onglet du contrôle."; return scheduleRender(); }
  const pg = cp.pages?.[it.page - 1], qids = pageQ(pg), boxes = pg?.b || [];
  if (!qids.length){ it.status = "erreur"; it.msg = "Aucune question attendue sur cette page."; return scheduleRender(); }
  it.status = "lecture"; it.msg = "Envoi de l'image…"; scheduleRender();
  try{
    const upd = {copies:{[it.eleveId]:{scans:{}, answers:{}}}};
    if (ASSETS){ try { const a = await ASSETS.upload(await toBlob(scaled(it.cv, 1700), .8)); upd.copies[it.eleveId].scans[it.page] = {asset:a.id, url:a.url, at:new Date().toISOString()}; } catch(e){ console.warn("asset", e); } }
    if (!AI){ it.status = "erreur"; it.msg = "QR lu, mais l'IA n'est pas disponible pour lire les réponses."; if (Object.keys(upd.copies[it.eleveId].scans).length) await write("feuilles/" + c.id, upd, "update"); return scheduleRender(); }
    it.msg = "Lecture de l'écriture et correction (30 s à 1 min)…"; scheduleRender();
    const Hm = boxes.length ? sheetToPhoto(it.found || detectAll(it.cv)) : null;
    const maxImg = LIM?.images?.maxCount || 1;
    const qcmB = Hm ? boxes.filter(b => b.type === "qcm") : [];
    const aiQ = qids.filter(id => !qcmB.some(b => b.q === id));
    let arr = [], crops = {}, bon = null, marks = {};
    for (const b of qcmB){ marks[b.q] = readMarks(it.cv, Hm, b); crops[b.q] = warpBox(it.cv, Hm, b); }
    const aiB = boxes.filter(b => aiQ.includes(b.q));
    const cropMode = Hm && aiB.length && aiB.length <= Math.max(1, maxImg);
    if (cropMode) for (const b of aiB) crops[b.q] = warpBox(it.cv, Hm, b);
    if (ASSETS){ for (const k in crops){ try { const a = await ASSETS.upload(await toBlob(crops[k], .82)); crops[k].asset = a.id; } catch(e){} } }
    if (aiQ.length){
      if (!AI){ it.status = "erreur"; it.msg = "QR lu, mais l'IA n'est pas disponible pour lire les réponses rédigées."; await write("feuilles/" + c.id, upd, "update"); return scheduleRender(); }
      it.msg = cropMode ? "Lecture des " + aiB.length + " cadre(s) découpés et correction…" : "Lecture de la page et correction (30 s à 1 min)…"; scheduleRender();
      if (cropMode){
        const res = await ai(gradePrompt(c, cp, aiQ, "crops"), {images: await Promise.all(aiB.map(b => toBlob(crops[b.q], .9)))});
        arr = Array.isArray(res?.reponses) ? res.reponses : []; bon = res;
      } else {
        const big = scaled(it.cv, 2000), W = big.width, H = big.height;
        const many = maxImg >= 2;
        const imgs = many ? [await toBlob(crop(big, 0, 0, W, H * 0.56)), await toBlob(crop(big, 0, H * 0.44, W, H * 0.56))] : [await toBlob(big)];
        const res = await ai(gradePrompt(c, cp, aiQ, many ? "halves" : "page"), {images:imgs});
        arr = Array.isArray(res?.reponses) ? res.reponses : Array.isArray(res) ? res : []; bon = res;
      }
      if (bonusMax(c)) upd.copies[it.eleveId].bonusPages = {[it.page]:{proprete:clamp(+bon?.proprete || 0, 0, 1), orthographe:clamp(+bon?.orthographe || 0, 0, 1)}};
    }
    for (const qid of qids){
      const q = c.questions.find(x => x.id === qid); if (!q) continue;
      const ver = cp.version?.[qid] || "standard";
      const r = arr.find(x => x.id === qid) || {};
      let ans;
      if (marks[qid]) ans = qcmAnswer(q, ver, marks[qid].coches, marks[qid].ambigu);
      else if (q.type === "qcm") ans = qcmAnswer(q, ver, (r.coches || []).map(Number), r.lisible === false);
      else ans = {transcription:String(r.transcription ?? ""), annot:String(r.annotee ?? r.transcription ?? ""), lisible:r.lisible !== false,
        noteIA:clamp(half(Number(r.note) || 0), 0, +q.points), note:null, commentaire:String(r.commentaire ?? ""), erreurs:(r.erreurs || []).map(String).slice(0, 4), acquis:(r.acquis || []).map(String).slice(0, 4), valide:false};
      ans.crop = crops[qid]?.asset || null;
      upd.copies[it.eleveId].answers[qid] = ans;
    }
    upd.copies[it.eleveId].validee = false;
    await write("feuilles/" + c.id, upd, "update");
    if (c.statut === "imprime"){ c.statut = "correction"; await saveCtrl(c); }
    it.status = "ok"; it.msg = `${qids.length} question(s) lue(s)${qcmB.length ? ` · ${qcmB.length} QCM sans IA` : ""}${Hm ? " · cadres découpés" : " · page entière (repères non trouvés)"}` + (arr.some(r => r.lisible === false) ? " · passage peu lisible signalé" : ""); it.cv = null;
  }catch(e){ console.error(e); it.status = "erreur"; it.msg = aiErr(e?.code); }
  scheduleRender();
}
function qBlockPrompt(c, q, ver, i){
  const v = vOf(q, ver);
  if (q.type === "qcm") return `[Q${i + 1} · id=${q.id}] QCM (sur ${q.points} points) — ne note pas, indique seulement les cases cochées dans "coches" (indices à partir de 0).
Énoncé : ${v.enonce}
Choix : ${(v.choix || []).map((ch, j) => "ABCDEFGH"[j] + ") " + ch).join("  ")}`;
  return `[Q${i + 1} · id=${q.id}] (sur ${q.points} points)
Énoncé : ${v.enonce}
Corrigé-type : ${v.corrige || "(non fourni)"}
Critères : ${v.criteres || "selon le corrigé-type"}
Erreurs types possibles : ${(q.erreurs || []).join(" | ") || "(aucune)"}`;
}
const MATH_RULE = "Mathématiques en LaTeX entre $…$ (ex. $\\frac{2}{3}$, $x^2$, $\\sqrt{5}$, $3\\times 4$), le reste en texte normal.";
function gradePrompt(c, cp, qids, mode){
  const blocks = qids.map(id => { const i = c.questions.findIndex(q => q.id === id); return qBlockPrompt(c, c.questions[i], cp.version?.[id] || "standard", i); }).join("\n\n");
  const bm = bonusMax(c);
  const how = mode === "crops" ? `Tu reçois ${qids.length} image(s), dans l'ordre : ${qids.map((id, k) => `image ${k + 1} = cadre de réponse de la question id=${id}`).join(" ; ")}. Chaque image est le cadre ligné découpé, agrandi.`
    : mode === "halves" ? "Les deux images montrent la même page : la moitié haute puis la moitié basse (elles se chevauchent un peu). Chaque réponse est dans un cadre ligné repéré « Q1 », « Q2 »… en haut à droite." : "L'image montre la page entière. Chaque réponse est dans un cadre ligné repéré « Q1 », « Q2 »… en haut à droite.";
  return `Tu lis puis corriges une page de copie manuscrite d'élève (collège-lycée, ${c.matiere}, niveau ${c.niveau || ""}).
${how}

Questions présentes sur cette page :
${blocks}

Consignes :
1. Transcris fidèlement ce que l'élève a écrit dans chaque cadre, sans corriger l'orthographe, ligne par ligne. ${MATH_RULE} Hébreu en caractères hébreux. Passage illisible : [illisible]. Cadre vide : "". Ignore ce qui est barré.
2. "annotee" : la même transcription, avec chaque passage erroné entouré de ⟦ et ⟧ (toujours à l'extérieur des $…$).
3. Note par pas de 0,5 selon les critères. Réponse vide = 0.
4. "commentaire" : 2 à 3 phrases, tutoiement, bienveillant : d'abord ce qui est réussi, puis l'erreur précise et comment la corriger.
5. "erreurs" : choisis dans les erreurs types (texte exact) ; sinon une étiquette de 2 à 5 mots. "acquis" : 1 à 3 étiquettes courtes.
6. "lisible" : false si tu as dû deviner une partie importante de la réponse.
7. ${NOSRC}
${bm ? `8. Donne aussi pour la page "proprete" (0 à 1 : lisibilité, soin, ratures) et "orthographe" (0 à 1 : 1 = aucune faute).\n` : ""}Réponds uniquement en JSON : {"reponses":[{"id":"…","transcription":"…","annotee":"…","lisible":true,"note":0,"commentaire":"…","erreurs":["…"],"acquis":["…"],"coches":[]}]${bm ? ',"proprete":1,"orthographe":1' : ""}}`;
}

/* ================= CORRECTION ================= */
function vCorrect(){
  const list = store.controles.filter(c => c.statut !== "brouillon");
  if (!list.length) return `<div class="head"><h2>Correction</h2></div><div class="panel empty">Aucun contrôle imprimé pour l'instant.</div>`;
  const c = ctrl(S.corrCtrl) || list[0]; S.corrCtrl = c.id;
  const f = feuille(c.id) || {copies:{}}, studs = studentsOf(c), max = maxOf(c);
  if (!S.corrEleve || !studs.find(e => e.id === S.corrEleve)) S.corrEleve = (studs.find(e => { const cp = f.copies[e.id]; return cp && !cp.validee && Object.keys(cp.answers || {}).length; }) || studs[0])?.id;
  const e = studs.find(x => x.id === S.corrEleve), cp = f.copies?.[S.corrEleve];
  const nAlert = studs.filter(x => { const k = f.copies[x.id]; return k && !k.validee && copyDone(c, k) && !Object.values(k.answers || {}).some(a => !a.lisible); }).length;
  return `
  <div class="head"><div><h2>Correction</h2><p>L'IA propose ; tu valides. Les passages soulignés en rouge sont ceux que l'IA juge erronés.</p></div>
    <select id="corrSel" style="max-width:440px" aria-label="Contrôle">${selOpts(list, c.id, x => (x.type === "rattrapage" ? "Rattrapage · " : "") + x.titre + " · " + (classe(x.classeId)?.nom || ""), x => x.id)}</select></div>
  <div class="split">
    <aside class="panel" style="padding:8px">
      <div class="row between" style="padding:4px 8px 8px"><span class="label">Copies</span>
        ${nAlert ? `<button class="btn sm" id="valAll">Valider les ${nAlert} sans alerte</button>` : ""}</div>
      ${studs.map(x => { const k = f.copies[x.id]; const n = k ? Object.keys(k.answers || {}).length : 0; const done = copyDone(c, k); const warn = k && Object.values(k.answers || {}).some(a => !a.lisible);
        return `<button class="stu" data-cel="${x.id}" aria-current="${x.id === S.corrEleve}"><span>${esc(x.prenom)} ${esc(x.nom)}</span><span class="row" style="gap:6px">
        ${!n ? `<span class="chip">non scannée</span>` : done ? `<span class="num">${fmt(final20(c, k))}</span>${k.validee ? `<span class="chip ok">✓</span>` : `<span class="chip ${warn ? "bad" : "warn"}">${warn ? "à vérifier" : "à valider"}</span>`}` : `<span class="chip warn">${n}/${c.questions.length} q.</span>`}</span></button>`; }).join("")}
      <div style="padding:10px 8px 4px;border-top:1px solid var(--line);margin-top:6px" class="row"><button class="btn sm" id="csv">Exporter les notes (CSV)</button><button class="btn sm" id="renduAll">Copies rendues de la classe (PDF)</button></div>
    </aside>
    ${e ? copyView(c, e, cp) : `<div class="panel empty">Aucun élève.</div>`}
  </div>`;
}
function renderAnnot(s){
  return esc(s).replace(/⟦([\s\S]*?)⟧/g, "<mark>$1</mark>").replace(/\[illisible\]/g, '<span class="illisible">[illisible]</span>');
}
function copyView(c, e, cp){
  const max = maxOf(c), has = cp && Object.keys(cp.answers || {}).length, done = copyDone(c, cp);
  const scans = cp?.scans ? Object.entries(cp.scans).sort((a, b) => a[0] - b[0]) : [];
  return `<article class="copy">
    <div class="copy-h"><div><div class="label">Copie${c.differencie ? ` · <span class="lvl ${versionFor(c, e)}">${LVL[versionFor(c, e)]}</span>` : ""}</div><h3 style="font-size:20px">${esc(e.prenom)} ${esc(e.nom)}</h3></div>
      <div class="row">${done ? `<div><div class="total num">${fmt(final20(c, cp))}<small>/20</small></div>${bonusMax(c) ? `<div class="small muted num">brute ${fmt(on20(copyTotal(c, cp), max))} + bonus ${fmt(bonusOf(c, cp).proprete + bonusOf(c, cp).orthographe)}</div>` : ""}</div>` : ""}
      <button class="btn ${cp?.validee ? "" : "pen"}" id="validate" ${done ? "" : "disabled"}>${cp?.validee ? "Validée ✓" : "Valider la copie"}</button>
      <button class="btn sm" id="mkRatt">Rattrapage</button>${done ? `<button class="btn sm" id="rendu1">Copie rendue (PDF)</button>` : ""}</div><div class="status" id="rd-st" style="width:100%"></div></div>
    ${scans.length ? `<div class="scans">${scans.map(([p, s]) => `<img alt="Page ${p}" src="${esc(s.asset ? blobSrc(s.asset) : s.url)}" data-zoom="${esc(s.asset ? blobSrc(s.asset) : s.url)}">`).join("")}</div>` : ""}
    ${has && bonusMax(c) ? `<div class="row" style="padding:10px 16px;border-bottom:1px solid var(--line);gap:14px">${["proprete","orthographe"].filter(k => +c.bonus?.[k]).map(k => `<label class="row small" style="gap:6px">Bonus ${k === "proprete" ? "propreté" : "orthographe"} <input type="number" min="0" max="${c.bonus[k]}" step="0.5" id="bo-${k}" data-bonus="${k}" value="${bonusOf(c, cp)[k]}" style="width:70px"> / ${fmt(+c.bonus[k])}</label>`).join("")}</div>` : ""}
    ${!has ? `<div class="empty">Copie pas encore scannée. <button class="btn sm" data-go="scan">Scanner</button><br><span class="small">Tu peux aussi saisir les notes directement ci-dessous.</span></div>` : ""}
    ${(c.questions || []).map((q, k) => {
      const a = cp?.answers?.[q.id], ver = cp?.version?.[q.id] || versionFor(c, e), v = vOf(q, ver), n = noteOf(a);
      const edT = S.editTr[q.id], edC = S.editCom[q.id];
      return `<div class="q">
      <div class="q-top"><div><span class="label">Question ${k + 1}${q.notion ? " · " + esc(q.notion) : ""}</span><div style="font-weight:600" dir="auto">${esc(v.enonce)}</div></div>
        <div class="score"><input type="number" min="0" max="${q.points}" step="0.5" id="sc-${q.id}" data-score="${q.id}" value="${n ?? ""}" aria-label="Note question ${k + 1}"><span class="den">/${fmt(+q.points)}</span></div></div>
      ${a ? `${edT ? `<textarea id="tr-${q.id}" data-live dir="auto">${esc(a.transcription)}</textarea><div class="row"><button class="btn sm primary" data-retr="${q.id}">Recorriger avec ce texte (IA)</button><button class="btn sm ghost" data-trx="${q.id}">Annuler</button><span class="status" id="rs-${q.id}"></span></div>`
        : `<div class="answer" dir="auto">${renderAnnot(a.annot || a.transcription) || '<span class="muted">(cadre vide)</span>'}</div>`}
      ${a.crop ? `<img class="crop" alt="Cadre scanné" src="${esc(blobSrc(a.crop))}" data-zoom="${esc(blobSrc(a.crop))}">` : ""}
      ${!a.lisible ? `<div class="small" style="color:var(--warn)">⚠ Lecture incertaine : compare avec la photo${a.crop ? ` ou <button class="btn sm" data-precise="${q.id}">Relire en mode précis (IA)</button>` : "."}</div><span class="status" id="pr-${q.id}"></span>` : ""}
      <div class="comment">${edC ? `<textarea id="cm-${q.id}" data-live>${esc(a.commentaire)}</textarea><div class="row"><button class="btn sm primary" data-savecm="${q.id}">Enregistrer</button><button class="btn sm ghost" data-cmx="${q.id}">Annuler</button></div>`
        : `<div class="note" dir="auto">${esc(a.commentaire)}</div>`}
        <div class="tags">${(a.acquis || []).map(t => `<span class="chip ok">${esc(t)}</span>`).join("")}${(a.erreurs || []).map(t => `<span class="chip bad">${esc(t)}</span>`).join("")}</div>
        <div class="small muted">${a.note != null && a.note !== a.noteIA ? `Note IA : ${fmt(a.noteIA)} · modifiée par le professeur` : "Proposé par l'IA"}${a.valide ? " · validé" : ""}</div></div>
      <div class="row">${!edT ? `<button class="btn sm ghost" data-tr="${q.id}">Corriger la transcription</button>` : ""}${!edC ? `<button class="btn sm ghost" data-cm="${q.id}">Modifier le commentaire</button>` : ""}</div>` : ""}
    </div>`; }).join("")}
  </article>`;
}

/* ================= ANALYSE & RATTRAPAGE ================= */
function vAnalyse(){
  const list = store.controles.filter(c => { const f = feuille(c.id); return f && Object.values(f.copies || {}).some(cp => copyDone(c, cp)); });
  if (!list.length) return `<div class="head"><h2>Classe & rattrapage</h2></div><div class="panel empty">Les résultats apparaîtront ici dès que des copies auront été corrigées.</div>`;
  const c = ctrl(S.anCtrl) || list[0]; S.anCtrl = c.id;
  const f = feuille(c.id), max = maxOf(c), studs = studentsOf(c);
  const rows = studs.map(e => ({e, cp:f.copies[e.id]})).filter(r => copyDone(c, r.cp));
  const notes = rows.map(r => final20(c, r.cp));
  const avg = notes.reduce((a, b) => a + b, 0) / notes.length;
  const qs = c.questions.map((q, k) => {
    const got = rows.map(r => noteOf(r.cp.answers[q.id]) / q.points);
    const tags = {}; rows.forEach(r => (r.cp.answers[q.id]?.erreurs || []).forEach(t => { const key = t.trim().toLowerCase(); if (key) tags[key] = (tags[key] || 0) + 1; }));
    return {q, k, rate: got.reduce((a, b) => a + b, 0) / got.length, fail: got.filter(x => x < .5).length, tags:Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 3)};
  });
  const ratts = store.controles.filter(x => x.type === "rattrapage" && x.parentId === c.id);
  const unval = rows.filter(r => !r.cp.validee).length;
  return `
  <div class="head"><div><h2>Classe & rattrapage</h2><p>${rows.length} copie(s) corrigée(s) sur ${studs.length}${unval ? ` · <span style="color:var(--warn)">${unval} pas encore validée(s)</span>` : ""}</p></div>
    <select id="anSel" style="max-width:440px" aria-label="Contrôle">${selOpts(list, c.id, x => (x.type === "rattrapage" ? "Rattrapage · " : "") + x.titre + " · " + (classe(x.classeId)?.nom || ""), x => x.id)}</select></div>
  <div class="grid g3">
    <div class="panel"><div class="label">Moyenne</div><div class="total num" style="color:var(--ink)">${fmt(avg)}<small>/20</small></div></div>
    <div class="panel"><div class="label">Min – max</div><div class="total num" style="color:var(--ink)">${fmt(Math.min(...notes))} – ${fmt(Math.max(...notes))}</div></div>
    <div class="panel"><div class="label">Sous 10/20</div><div class="total num" style="color:var(--ink)">${notes.filter(n => n < 10).length}<small>/${notes.length}</small></div></div>
  </div>
  <section class="panel"><h3>Réussite et erreurs par question</h3>
    <div class="bars" style="margin-top:12px">${qs.map(x => `<div>
      <div class="bar"><b>Q${x.k + 1}</b><div class="track"><div class="fill" style="width:${Math.round(x.rate * 100)}%;background:var(--${tone(x.rate)})"></div></div><span class="num" style="text-align:right">${pct(x.rate)}</span></div>
      <div class="small muted" style="margin:2px 0 0 50px">${esc(x.q.notion || "")}${x.fail ? ` · ${x.fail} élève(s) sous la moitié des points` : ""}${x.tags.length ? " · " + x.tags.map(([t, n]) => `<span class="chip bad">${esc(t)} × ${n}</span>`).join(" ") : ""}</div></div>`).join("")}</div>
  </section>
  <section class="panel grid"><div class="row between"><h3>Synthèse pédagogique</h3><button class="btn sm" id="synth">${c.analyse ? "Actualiser" : "Rédiger"} (IA)</button></div>
    <div class="status" id="syn-st"></div>
    ${c.analyse ? `<div style="white-space:pre-wrap">${esc(c.analyse)}</div>` : `<p class="muted small">L'IA repère les notions non comprises et propose quoi reprendre en classe.</p>`}</section>
  <section class="panel"><div class="row between"><h3>Élèves</h3><button class="btn sm primary" id="rattAll">Rattrapages pour les élèves sous 10/20</button></div>
    <div class="status" id="ra-st"></div>
    <div class="tbl-wrap" style="margin-top:6px"><table><thead><tr><th>Élève</th>${c.questions.map((q, k) => `<th class="c">Q${k + 1}</th>`).join("")}<th class="c">/20</th><th>Rattrapage</th></tr></thead><tbody>
    ${studs.map(e => { const cp = f.copies[e.id]; const ok = copyDone(c, cp); const r = ratts.find(x => x.eleves?.includes(e.id));
      return `<tr><td><b>${esc(e.prenom)} ${esc(e.nom)}</b>${c.differencie ? ` <span class="lvl ${versionFor(c, e)}">${LVL[versionFor(c, e)][0]}</span>` : ""}</td>
      ${c.questions.map(q => { const n = noteOf(cp?.answers?.[q.id]); return `<td class="c"><span class="cell ${n == null ? "none" : tone(n / q.points)}">${fmt(n)}</span></td>`; }).join("")}
      <td class="c num"><b>${ok ? fmt(final20(c, cp)) : "—"}</b></td>
      <td>${r ? `<button class="btn sm" data-edit="${r.id}">${STATUT[r.statut]?.[0] || "Voir"}</button>` : ok ? `<button class="btn sm" data-ratt="${e.id}">Créer</button>` : ""}</td></tr>`; }).join("")}
    </tbody></table></div></section>`;
}
async function createRattrapage(c, e){
  const f = feuille(c.id), cp = f?.copies?.[e.id]; if (!cp) throw {code:"no_copy"};
  const weak = c.questions.map(q => ({q, a:cp.answers[q.id]})).filter(x => x.a && noteOf(x.a) / x.q.points < 0.6);
  const target = weak.length ? weak : c.questions.map(q => ({q, a:cp.answers[q.id]})).sort((x, y) => noteOf(x.a) / x.q.points - noteOf(y.a) / y.q.points).slice(0, 1);
  const lvl = levelOf(e, c.matiere);
  const ctx = target.map(({q, a}) => { const v = vOf(q, cp.version?.[q.id] || "standard");
    return `- Notion : ${q.notion || "?"}\n  Question : ${v.enonce}\n  Corrigé-type : ${v.corrige}\n  Réponse de l'élève (${fmt(noteOf(a))}/${q.points}) : ${a?.transcription || "(vide)"}\n  Erreurs relevées : ${(a?.erreurs || []).join(", ") || "?"}\n  Commentaire : ${a?.commentaire || ""}`; }).join("\n");
  const r = await ai(`Tu prépares une feuille de rattrapage individuelle pour un élève de ${c.niveau || ""} en ${c.matiere} (collège-lycée Beth Mena'hem).
Niveau habituel de l'élève dans cette matière : ${LVL[lvl]}.
Ses difficultés au contrôle « ${c.titre} » :
${ctx}

Crée exactement 3 exercices NOUVEAUX, de difficulté croissante, qui ciblent précisément ces erreurs :
1 = découverte (plus simple que le niveau de l'élève), 2 = application, 3 = retour au niveau ${LVL[lvl].toLowerCase()} du contrôle.
Total 20 points (par ex. 5, 7, 8). Chaque exercice : un énoncé autonome (avec un coup de pouce entre parenthèses pour le 1), un corrigé-type, des critères de notation, 2 ou 3 erreurs types, un nombre de lignes de réponse (3 à 12).
${NOSRC}
Réponds uniquement en JSON : {"titre":"…","questions":[{"notion":"…","points":5,"lignes":5,"enonce":"…","corrige":"…","criteres":"…","erreurs":["…"]}]}`);
  const qs = (r?.questions || []).slice(0, 3).map(x => ({id:"q" + uid(5), notion:String(x.notion || ""), points:+x.points || 5, lignes:clamp(+x.lignes || 6, 2, 20), erreurs:(x.erreurs || []).map(String),
    v:{standard:{enonce:String(x.enonce || ""), corrige:String(x.corrige || ""), criteres:String(x.criteres || "")}}}));
  if (!qs.length) throw {code:"invalid_json"};
  const id = uid(12);
  const doc = {type:"rattrapage", parentId:c.id, titre:"Rattrapage · " + (r.titre || c.titre), matiere:c.matiere, niveau:c.niveau, classeId:c.classeId, eleves:[e.id], coursId:c.coursId || null,
    duree:30, differencie:false, mise:{...(c.mise || {}), consignes:"Feuille de rattrapage personnelle. Prends ton temps et relis le coup de pouce."}, statut:"brouillon", date:today(), questions:qs, createdAt:new Date().toISOString()};
  await write("controles/" + id, doc);
  return id;
}

/* ================= Classes: level suggestions ================= */
function suggestLevels(cl, mat){
  const cs = store.controles.filter(c => c.classeId === cl.id && c.matiere === mat && c.type !== "rattrapage").sort((a, b) => (b.date || b.createdAt || "").localeCompare(a.date || a.createdAt || ""));
  const map = {};
  cl.eleves.forEach(e => {
    const ns = []; for (const c of cs){ const cp = feuille(c.id)?.copies?.[e.id]; if (cp?.validee && copyDone(c, cp)) ns.push(final20(c, cp)); if (ns.length === 3) break; }
    if (ns.length){ const avg = ns.reduce((a, b) => a + b, 0) / ns.length; map[e.id] = {avg, lvl: avg < 10 ? "socle" : avg <= 15 ? "standard" : "approfondi"}; }
  });
  return map;
}

/* ================= Course import ================= */
async function importCourseFiles(files){
  const st = $("#c-st"); const parts = [];
  const pendingImgs = [];
  for (const f of files){
    if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)){
      st.innerHTML = `<span class="thinking">Lecture du PDF « ${esc(f.name)} »…</span>`;
      const pdf = await pdfjsLib.getDocument({data: await f.arrayBuffer()}).promise; let txt = "";
      for (let i = 1; i <= pdf.numPages; i++){ const tc = await (await pdf.getPage(i)).getTextContent(); txt += tc.items.map(x => x.str + (x.hasEOL ? "\n" : " ")).join("") + "\n\n"; }
      if (txt.replace(/\s/g, "").length > 150 * pdf.numPages) parts.push(txt.trim());
      else { for (let i = 1; i <= Math.min(pdf.numPages, 12); i++){ const pg = await pdf.getPage(i); const vp = pg.getViewport({scale: 1800 / Math.max(pg.view[2], pg.view[3])}); const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height; await pg.render({canvasContext:cv.getContext("2d"), viewport:vp}).promise; pendingImgs.push(cv); } }
    } else { (await fileToCanvases(f)).forEach(cv => pendingImgs.push(cv)); }
  }
  if (pendingImgs.length){
    if (!AI || !LIM?.images){ st.textContent = "Ce document est une image : il faut l'IA avec images pour le lire. Colle le texte à la place."; }
    else {
      const per = Math.max(1, LIM.images.maxCount || 1);
      for (let i = 0; i < pendingImgs.length; i += per){
        st.innerHTML = `<span class="thinking">Lecture des pages ${i + 1} à ${Math.min(i + per, pendingImgs.length)} sur ${pendingImgs.length}…</span>`;
        const blobs = await Promise.all(pendingImgs.slice(i, i + per).map(cv => toBlob(scaled(cv, 1800))));
        const t = await aiText(`Transcris fidèlement le texte de ces pages de cours (dans l'ordre), en gardant titres, définitions, exemples et formules. Recopie l'hébreu en caractères hébreux, sans traduire. Pas de commentaire : uniquement le texte.`, {images:blobs});
        parts.push(t.trim());
      }
    }
  }
  const box = $("#c-texte"); const prev = box.value.trim();
  box.value = [prev, ...parts].filter(Boolean).join("\n\n").slice(0, 60000);
  S.coursDraft = {...(S.coursDraft || {}), texte:box.value};
  if (parts.length) st.textContent = "Texte extrait : relis-le, corrige si besoin, puis enregistre.";
}

/* ================= Generation ================= */
function genPrompt(co, p, n, extra){
  const T = {cours:"questions de cours", application:"exercices d'application", probleme:"problème ou rédaction", texte:"lecture / explication de texte", traduction:"traduction", qcm:"QCM"};
  return `Tu es un professeur expérimenté de ${p.matiere} au collège-lycée Beth Mena'hem (Levallois-Perret). Prépare ${n === 1 ? "UNE question" : "un contrôle"} pour une classe de ${p.niveau}, à partir du cours ci-dessous.

Durée : ${p.duree} minutes · Difficulté : ${p.difficulte} · Types : ${(p.types || []).map(t => T[t]).join(", ") || "variés"}
${n > 1 ? `Nombre de questions : ${n}. Total des points : 20 exactement.` : ""}
${p.consignes ? "Consignes du professeur : " + p.consignes : ""}
${extra || ""}
Pour chaque question, rédige 3 versions de la même question, portant sur la même notion et notées sur les mêmes points :
- "socle" : plus guidée (étapes, données simplifiées, coup de pouce), pour un élève en difficulté ;
- "standard" : niveau attendu de la classe ;
- "approfondi" : plus exigeante (justification, cas général, extension).
Chaque version a son énoncé, son corrigé-type détaillé et des critères de notation dont la somme fait les points de la question.
${(p.types || []).includes("qcm") ? `Tu peux inclure des QCM (corrigés automatiquement, sans IA) : pour eux "type":"qcm", et dans chaque version "choix" (3 à 5 propositions courtes, sans lettre) et "bonnes" (indices des bonnes réponses, à partir de 0) ; "lignes" inutile.\n` : ""}Ajoute pour chaque question : la notion évaluée, 2 à 4 erreurs types fréquentes (étiquettes de 2 à 5 mots), et le nombre de lignes de réponse nécessaires (3 à 14).
${NOSRC}

COURS :
"""${(co?.texte || "").slice(0, 30000)}"""

Réponds uniquement en JSON : {"titre":"…","questions":[{"notion":"…","points":4,"lignes":6,"erreurs":["…"],"versions":{"socle":{"enonce":"…","corrige":"…","criteres":"…"},"standard":{…},"approfondi":{…}}}]}`;
}
const mapQ = x => ({id:"q" + uid(5), ...(x.type === "qcm" ? {type:"qcm"} : {}), notion:String(x.notion || ""), points:+x.points || 4, lignes:clamp(+x.lignes || 6, 1, 30), erreurs:(x.erreurs || []).map(String).slice(0, 5),
  v:Object.fromEntries(LEVELS.map(l => { const y = x.versions?.[l] || {}; const o = {enonce:String(y.enonce || ""), corrige:String(y.corrige || ""), criteres:String(y.criteres || "")};
    if (x.type === "qcm"){ o.choix = (y.choix || []).map(String).slice(0, 6); o.bonnes = (y.bonnes || []).map(Number).filter(n => n >= 0 && n < o.choix.length); o.corrige = "Bonne(s) réponse(s) : " + o.bonnes.map(n => "ABCDEF"[n]).join(", "); o.criteres = "Tout ou rien."; }
    return [l, o]; }))});

/* ================= Demo ================= */
async function loadDemo(){
  const noms = [["Mendel","Azoulay"],["Yossef","Benhamou"],["Levi","Cohen"],["David","Dahan"],["Nathan","Elbaz"],["Eliezer","Fitoussi"],["Samuel","Gozlan"],["Raphaël","Haddad"]];
  const lv = ["standard","standard","approfondi","socle","approfondi","socle","standard","standard"];
  const cid = uid(10);
  await write("classes/" + cid, {nom:"3e A (démo)", niveau:"3e", eleves:noms.map(([p, n], i) => ({id:uid(8), prenom:p, nom:n + " (démo)", niveaux:{"Mathématiques":lv[i]}})), createdAt:new Date().toISOString()});
  await write("cours/" + uid(10), {titre:"Fonctions affines (démo)", matiere:"Mathématiques", niveau:"3e", createdAt:new Date().toISOString(), texte:
`Chapitre : Fonctions affines

1. Définition
Une fonction affine est une fonction f définie par f(x) = ax + b, où a et b sont deux nombres fixés.
a est le coefficient directeur, b est l'ordonnée à l'origine.
Si b = 0, f(x) = ax : f est une fonction linéaire. Si a = 0, f(x) = b : f est une fonction constante.

2. Image et antécédent
L'image de x par f est le nombre f(x). Exemple : f(x) = 2x − 3 ; l'image de 4 est f(4) = 2×4 − 3 = 5.
Un antécédent de y par f est un nombre x tel que f(x) = y. Pour le trouver, on résout l'équation ax + b = y.
Exemple : antécédent de 7 par f : 2x − 3 = 7, donc 2x = 10, x = 5.

3. Représentation graphique
La représentation graphique d'une fonction affine est une droite. Elle passe par le point (0 ; b).
Quand x augmente de 1, f(x) augmente de a. Si a > 0, la fonction est croissante ; si a < 0, décroissante.

4. Déterminer une fonction affine à partir de deux points
Si f(x1) = y1 et f(x2) = y2, alors a = (y2 − y1) / (x2 − x1), puis on calcule b avec b = y1 − a×x1.

5. Problèmes
Comparer deux tarifs : tarif A = 20 € par mois ; tarif B = 8 € + 0,50 € par heure. On modélise B par f(h) = 0,5h + 8.
B est plus cher que A quand 0,5h + 8 > 20, c'est-à-dire h > 24.`});
  toast("Classe et cours de démonstration créés.");
}

/* ================= Events ================= */
document.addEventListener("click", async ev => {
  const t = ev.target.closest("button, [data-zoom]"); if (!t) return;
  const d = t.dataset;
  if (d.zoom){ const z = document.createElement("div"); z.className = "zoom"; z.innerHTML = `<img alt="" src="${esc(d.zoom)}">`; z.onclick = () => z.remove(); document.body.append(z); return; }
  if (t.classList.contains("tab")){ if (d.v === "new"){ S.wizStep = S.coursId ? S.wizStep : 1; if (S.view === "edit") S.wizStep = 1; } return go(d.v); }
  if (d.go) return go(d.go);
  if (d.edit){ S.editId = d.edit; return go("edit"); }
  if (d.corr){ S.corrCtrl = d.corr; S.corrEleve = d.el || null; return go("correct"); }
  if (d.an){ S.anCtrl = d.an; return go("analyse"); }
  if (t.id === "demo"){ t.disabled = true; await loadDemo(); return; }

  /* classes */
  if (d.classe){ S.classeSel = d.classe; S.suggestions = null; return render(); }
  if (t.id === "nc-go"){ const nom = $("#nc-nom").value.trim(); if (!nom) return toast("Donne un nom à la classe.");
    const id = uid(10); S.classeSel = id; await write("classes/" + id, {nom, niveau:$("#nc-niv").value, eleves:[], createdAt:new Date().toISOString()}); return; }
  if (t.id === "add-go"){ const cl = classe(S.classeSel); const lines = $("#add-el").value.split("\n").map(s => s.trim()).filter(Boolean);
    if (!lines.length) return; const add = lines.map(l => { const [p, ...n] = l.split(/\s+/); return {id:uid(8), prenom:p, nom:n.join(" "), niveaux:{}}; });
    $("#add-el").value = ""; await write("classes/" + cl.id, {eleves:[...(cl.eleves || []), ...add]}, "update"); toast(add.length + " élève(s) ajouté(s)."); return; }
  if (d.rmel){ const cl = classe(S.classeSel); await write("classes/" + cl.id, {eleves:cl.eleves.filter(e => e.id !== d.rmel)}, "update"); return; }
  if (t.id === "del-cl"){ if (t.dataset.sure !== "1"){ t.dataset.sure = "1"; t.textContent = "Confirmer la suppression"; t.classList.add("pen"); return; }
    await write("classes/" + S.classeSel, null, "delete"); S.classeSel = null; return; }
  if (t.id === "sugg"){ const cl = classe(S.classeSel); S.suggestions = {classeId:cl.id, mat:S.levelMat, map:suggestLevels(cl, S.levelMat)};
    if (!Object.keys(S.suggestions.map).length) toast("Aucune copie validée en " + S.levelMat + " pour cette classe."); return render(); }
  if (t.id === "applySug"){ const cl = classe(S.classeSel), map = S.suggestions.map;
    await write("classes/" + cl.id, {eleves:cl.eleves.map(e => map[e.id] ? {...e, niveaux:{...(e.niveaux || {}), [S.levelMat]:map[e.id].lvl}} : e)}, "update"); S.suggestions = null; toast("Niveaux mis à jour."); return; }

  /* wizard */
  if (t.id === "c-save"){ const texte = $("#c-texte").value.trim(), titre = $("#c-titre").value.trim() || "Cours sans titre";
    if (texte.length < 80) return toast("Le texte du cours est trop court.");
    const id = uid(10); await write("cours/" + id, {titre, matiere:$("#c-mat").value, niveau:$("#c-niv").value, texte:texte.slice(0, 60000), createdAt:new Date().toISOString()});
    S.coursId = id; S.coursDraft = null; S.params.matiere = $("#c-mat").value; S.params.niveau = $("#c-niv").value; S.params.classeId = ""; S.wizStep = 2; return render(); }
  if (d.usecours){ const co = store.cours.find(c => c.id === d.usecours); S.coursId = co.id; S.params.matiere = co.matiere; S.params.niveau = co.niveau; S.params.classeId = ""; S.wizStep = 2; return render(); }
  if (d.delcours){ await write("cours/" + d.delcours, null, "delete"); return; }
  if (t.id === "back1"){ S.wizStep = 1; return render(); }
  if (t.id === "gen" || t.id === "genBlank"){
    const p = S.params, co = store.cours.find(c => c.id === S.coursId), st = $("#gen-st");
    const id = uid(12); const base = {type:"controle", titre:p.titre || co?.titre || "Contrôle", matiere:p.matiere, niveau:p.niveau, classeId:p.classeId, coursId:S.coursId, duree:+p.duree || 55,
      differencie:!!p.differencie, statut:"brouillon", date:"", mise:{entete:ECOLE, police:15, lh:30, bareme:true, consignes:"Écris uniquement dans les cadres."}, questions:[], createdAt:new Date().toISOString()};
    if (t.id === "genBlank"){ base.questions = [mapQ({points:4, lignes:6})]; await write("controles/" + id, base); S.editId = id; S.wizStep = 1; return go("edit"); }
    t.disabled = true; st.innerHTML = `<span class="thinking">L'IA rédige le contrôle en 3 niveaux (1 à 2 minutes)…</span>`;
    try{
      const r = await ai(genPrompt(co, p, clamp(+p.nbq || 5, 1, 10)));
      const qs = (r?.questions || []).map(mapQ); if (!qs.length) throw {code:"invalid_json"};
      base.titre = p.titre || r.titre || base.titre; base.questions = qs;
      await write("controles/" + id, base); S.editId = id; S.wizStep = 1; S.params.titre = ""; return go("edit");
    }catch(e){ st.textContent = aiErr(e?.code); t.disabled = false; }
    return;
  }

  /* editor */
  const c = S.view === "edit" ? ctrl(S.editId) : null;
  if (c){
    if (d.vt){ S.vtab[d.vt] = d.l; return render(); }
    if (d.qup !== undefined){ const i = +d.qup; [c.questions[i - 1], c.questions[i]] = [c.questions[i], c.questions[i - 1]]; await saveCtrl(c); return; }
    if (d.qdown !== undefined){ const i = +d.qdown; [c.questions[i + 1], c.questions[i]] = [c.questions[i], c.questions[i + 1]]; await saveCtrl(c); return; }
    if (d.qdel !== undefined){ c.questions.splice(+d.qdel, 1); await saveCtrl(c); return; }
    if (t.id === "addQ"){ c.questions.push(mapQ({points:4, lignes:6})); await saveCtrl(c); return; }
    if (t.id === "addQai" || d.qai !== undefined){
      const co = store.cours.find(x => x.id === c.coursId); const i = d.qai !== undefined ? +d.qai : -1; const q = c.questions[i];
      const st = q ? $("#q-st-" + q.id) : null; t.disabled = true; if (st) st.innerHTML = `<span class="thinking">Réécriture…</span>`; else toast("L'IA rédige une question…");
      const instr = q ? ($("#q-i-" + q.id).value.trim() || "améliore la question") : "";
      const extra = q ? `Réécris la question suivante selon cette demande du professeur : « ${instr} ». Garde ${q.points} points.\nQuestion actuelle (version standard) : ${vOf(q, "standard").enonce}` :
        `Ajoute une nouvelle question différente de celles-ci : ${c.questions.map(x => vOf(x, "standard").enonce).join(" / ")}`;
      try{
        const r = await ai(genPrompt(co, {...c, types:["cours","application","probleme"], difficulte:"moyen", consignes:""}, 1, extra) + `\nRéponds avec {"questions":[ une seule question ]}.`);
        const nq = (r?.questions || []).map(mapQ)[0]; if (!nq) throw {code:"invalid_json"};
        if (q){ nq.id = q.id; nq.points = q.points; c.questions[i] = nq; } else c.questions.push(nq);
        await saveCtrl(c);
      }catch(e){ if (st) st.textContent = aiErr(e?.code); else toast(aiErr(e?.code)); t.disabled = false; }
      return;
    }
    if (t.id === "print") return printSheets(c, studentsOf(c));
    if (t.id === "print1") return printSheets(c, studentsOf(c).filter(e => e.id === S.previewEleve));
    if (t.id === "delCtrl"){ if (d.sure !== "1"){ d.sure = "1"; t.textContent = "Confirmer : supprimer contrôle et copies"; t.classList.add("pen"); return; }
      await write("controles/" + c.id, null, "delete"); await write("feuilles/" + c.id, null, "delete"); return go("home"); }
  }

  /* scan */
  if (t.id === "qclear"){ S.queue = S.queue.filter(x => ["attente","qr","lecture"].includes(x.status)); return render(); }
  if (d.mgo){ const it = S.queue.find(x => x.id === d.mgo); it.status = "lecture"; render(); await processPage(it); return; }
  if (d.retry){ const it = S.queue.find(x => x.id === d.retry); if (!it.cv){ toast("Image perdue : ajoute la photo à nouveau."); return; } it.status = it.ctrlId ? "lecture" : "attente"; render(); if (it.ctrlId) await processPage(it); else runQueue(); return; }

  /* correction */
  if (S.view === "correct"){
    const C = ctrl(S.corrCtrl);
    if (d.cel){ S.corrEleve = d.cel; S.editTr = {}; S.editCom = {}; return render(); }
    if (d.tr){ S.editTr[d.tr] = true; return render(); }
    if (d.trx){ delete S.editTr[d.trx]; return render(); }
    if (d.cm){ S.editCom[d.cm] = true; return render(); }
    if (d.cmx){ delete S.editCom[d.cmx]; return render(); }
    if (d.savecm){ const v = $("#cm-" + d.savecm).value; delete S.editCom[d.savecm];
      await write("feuilles/" + C.id, {copies:{[S.corrEleve]:{answers:{[d.savecm]:{commentaire:v}}, validee:false}}}, "update"); return; }
    if (d.precise){
      const qid = d.precise, q = C.questions.find(x => x.id === qid), cp = feuille(C.id).copies[S.corrEleve], a = cp.answers[qid], st = $("#pr-" + qid);
      t.disabled = true; st.innerHTML = `<span class="thinking">Relecture précise (modèle le plus puissant)…</span>`;
      try{
        const blob = await getBlob(a.crop);
        const i = C.questions.indexOf(q);
        const smp = await sampleImages(S.corrEleve, C.matiere);
        const r = await ai(`Relis très attentivement ce cadre de réponse manuscrit d'un élève (${C.matiere}, ${C.niveau || ""}), puis corrige. L'image 1 est le cadre à lire.${smp.txt}\n${qBlockPrompt(C, q, cp.version?.[qid] || "standard", i)}\n\nUne première lecture a donné : """${a.transcription}""" (jugée incertaine).\nTranscris ligne par ligne, sans corriger l'orthographe. ${MATH_RULE} Hébreu en caractères hébreux. Passage vraiment illisible : [illisible]. "annotee" = transcription avec chaque passage erroné entouré de ⟦ ⟧ (hors des $…$). Note par pas de 0,5. Commentaire 2 à 3 phrases, tutoiement. ${NOSRC}\nRéponds uniquement en JSON : {"transcription":"…","annotee":"…","lisible":true,"note":0,"commentaire":"…","erreurs":["…"],"acquis":["…"]}`, {images:[blob, ...smp.blobs], modelTier:"complex"});
        await write("feuilles/" + C.id, {copies:{[S.corrEleve]:{validee:false, answers:{[qid]:{transcription:String(r.transcription || ""), annot:String(r.annotee || r.transcription || ""), lisible:r.lisible !== false,
          noteIA:clamp(half(+r.note || 0), 0, +q.points), note:null, commentaire:String(r.commentaire || ""), erreurs:(r.erreurs || []).map(String).slice(0, 4), acquis:(r.acquis || []).map(String).slice(0, 4), valide:false}}}}}, "update");
      }catch(e){ st.textContent = e?.code ? aiErr(e.code) : "Image du cadre introuvable."; t.disabled = false; }
      return;
    }
    if (d.retr){
      const qid = d.retr, q = C.questions.find(x => x.id === qid), cp = feuille(C.id).copies[S.corrEleve], text = $("#tr-" + qid).value, st = $("#rs-" + qid);
      t.disabled = true; st.innerHTML = `<span class="thinking">Correction…</span>`;
      try{
        const i = C.questions.indexOf(q);
        const r = await ai(`Corrige la réponse d'un élève (${C.matiere}, ${C.niveau || ""}).\n${qBlockPrompt(C, q, cp.version?.[qid] || "standard", i)}\n\nRéponse de l'élève (transcrite et vérifiée par le professeur) :\n"""${text}"""\n\nNote par pas de 0,5. "annotee" = la réponse avec chaque passage erroné entouré de ⟦ ⟧ (hors des $…$). ${MATH_RULE} Commentaire 2 à 3 phrases, tutoiement, bienveillant. "erreurs" choisies dans les erreurs types si possible. ${NOSRC}\nRéponds uniquement en JSON : {"annotee":"…","note":0,"commentaire":"…","erreurs":["…"],"acquis":["…"]}`);
        await write("feuilles/" + C.id, {copies:{[S.corrEleve]:{validee:false, answers:{[qid]:{transcription:text, annot:String(r.annotee || text), lisible:true, noteIA:clamp(half(+r.note || 0), 0, +q.points), note:null,
          commentaire:String(r.commentaire || ""), erreurs:(r.erreurs || []).map(String).slice(0, 4), acquis:(r.acquis || []).map(String).slice(0, 4), valide:false}}}}}, "update");
        delete S.editTr[qid];
      }catch(e){ st.textContent = aiErr(e?.code); t.disabled = false; }
      return;
    }
    if (t.id === "validate"){ const cp = feuille(C.id).copies[S.corrEleve]; const answers = {}; C.questions.forEach(q => { answers[q.id] = {valide:true}; });
      await write("feuilles/" + C.id, {copies:{[S.corrEleve]:{validee:true, answers}}}, "update");
      const f = feuille(C.id), studs = studentsOf(C); const next = studs.find(e => e.id !== S.corrEleve && f.copies[e.id] && !f.copies[e.id].validee && copyDone(C, f.copies[e.id]));
      if (studs.every(e => e.id === S.corrEleve || f.copies[e.id]?.validee) && C.statut !== "corrige"){ C.statut = "corrige"; await saveCtrl(C); toast("Toutes les copies sont validées."); }
      if (next){ S.corrEleve = next.id; S.editTr = {}; S.editCom = {}; } return render(); }
    if (t.id === "valAll"){ const f = feuille(C.id); const upd = {copies:{}};
      studentsOf(C).forEach(e => { const k = f.copies[e.id]; if (k && !k.validee && copyDone(C, k) && !Object.values(k.answers || {}).some(a => !a.lisible)) upd.copies[e.id] = {validee:true, answers:Object.fromEntries(C.questions.map(q => [q.id, {valide:true}]))}; });
      await write("feuilles/" + C.id, upd, "update"); toast(Object.keys(upd.copies).length + " copie(s) validée(s)."); return; }
    if (t.id === "csv"){ const f = feuille(C.id) || {copies:{}}, max = maxOf(C);
      const rows = [["Élève", ...C.questions.map((q, k) => `Q${k + 1} (/${q.points})`), "Total", "Sur 20 (brute)", "Note finale /20", "Validée"]];
      studentsOf(C).forEach(e => { const k = f.copies[e.id]; rows.push([e.prenom + " " + e.nom, ...C.questions.map(q => fmt(noteOf(k?.answers?.[q.id]))), copyDone(C, k) ? fmt(copyTotal(C, k)) : "", copyDone(C, k) ? fmt(on20(copyTotal(C, k), max)) : "", copyDone(C, k) ? fmt(final20(C, k)) : "", k?.validee ? "oui" : "non"]); });
      const csv = "﻿" + rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(";")).join("\n");
      if (!DL) return toast("Téléchargement indisponible dans cette vue.");
      try { await DL.save({filename:`Notes - ${C.titre}.csv`.replace(/[\\/:*?"<>|]/g, "-"), data:csv}); } catch(e){ if (e?.code !== "declined") toast("Téléchargement impossible."); } return; }
    if (t.id === "mkRatt"){ t.disabled = true; t.textContent = "Création…";
      try { const id = await createRattrapage(C, eleveOf(C, S.corrEleve)); S.editId = id; return go("edit"); } catch(e){ toast(aiErr(e?.code)); t.disabled = false; t.textContent = "Rattrapage"; } return; }
  }

  /* analyse */
  if (S.view === "analyse"){
    const C = ctrl(S.anCtrl);
    if (d.ratt){ t.disabled = true; t.textContent = "Création…";
      try { await createRattrapage(C, eleveOf(C, d.ratt)); toast("Rattrapage créé : ouvre-le pour l'imprimer."); } catch(e){ toast(aiErr(e?.code)); t.disabled = false; t.textContent = "Créer"; } return; }
    if (t.id === "rattAll"){ const f = feuille(C.id), max = maxOf(C), st = $("#ra-st"); const ratts = store.controles.filter(x => x.type === "rattrapage" && x.parentId === C.id);
      const who = studentsOf(C).filter(e => { const k = f.copies[e.id]; return copyDone(C, k) && final20(C, k) < 10 && !ratts.some(r => r.eleves?.includes(e.id)); });
      if (!who.length){ st.textContent = "Aucun élève sous 10/20 sans rattrapage."; return; }
      t.disabled = true;
      for (let i = 0; i < who.length; i++){ st.innerHTML = `<span class="thinking">Rattrapage ${i + 1} / ${who.length} · ${esc(who[i].prenom)}…</span>`;
        try { await createRattrapage(C, who[i]); } catch(e){ st.textContent = aiErr(e?.code); t.disabled = false; return; } }
      st.textContent = who.length + " rattrapage(s) créé(s). Ouvre chacun pour l'imprimer."; t.disabled = false; return; }
    if (t.id === "synth"){ const f = feuille(C.id), max = maxOf(C), st = $("#syn-st"); t.disabled = true; st.innerHTML = `<span class="thinking">Analyse de la classe…</span>`;
      const rows = studentsOf(C).map(e => f.copies[e.id]).filter(k => copyDone(C, k));
      const lines = C.questions.map((q, k) => { const got = rows.map(r => noteOf(r.answers[q.id]) / q.points); const tags = {}; rows.forEach(r => (r.answers[q.id]?.erreurs || []).forEach(x => tags[x] = (tags[x] || 0) + 1));
        const coms = rows.map(r => r.answers[q.id]?.commentaire).filter(Boolean).slice(0, 6);
        return `Q${k + 1} — ${q.notion || ""} (${q.points} pts) : ${vOf(q, "standard").enonce}\nRéussite moyenne ${pct(got.reduce((a, b) => a + b, 0) / got.length)} ; erreurs : ${Object.entries(tags).map(([x, n]) => x + " ×" + n).join(", ") || "aucune"}\nExtraits de commentaires : ${coms.join(" | ")}`; }).join("\n\n");
      try{
        const txt = await aiText(`Tu aides un professeur de ${C.matiere} (${C.niveau || ""}) à analyser les résultats de sa classe au contrôle « ${C.titre} » (${rows.length} copies, moyenne ${fmt(rows.reduce((a, r) => a + final20(C, r), 0) / rows.length)}/20).\n\n${lines}\n\nRédige en français, en texte simple sans markdown ni titres, 8 à 12 lignes : (1) les notions non comprises par une part importante de la classe, avec le chiffre ; (2) l'erreur la plus répandue et sa cause probable ; (3) trois actions concrètes pour le prochain cours. ${NOSRC}`);
        C.analyse = txt.trim(); await saveCtrl(C);
      }catch(e){ st.textContent = aiErr(e?.code); t.disabled = false; }
      return; }
  }
});

document.addEventListener("input", ev => {
  const el = ev.target, d = el.dataset;
  if (el.id === "c-texte" || el.id === "c-titre"){ S.coursDraft = {...(S.coursDraft || {}), texte:$("#c-texte")?.value, titre:$("#c-titre")?.value}; }
  if (d.p){ S.params[d.p] = el.value; }
});
document.addEventListener("change", async ev => {
  const el = ev.target, d = el.dataset;
  if (el.id === "c-files"){ const fs = Array.from(el.files); el.value = ""; if (!fs.length) return;
    S.coursDraft = {...(S.coursDraft || {}), titre:$("#c-titre").value, matiere:$("#c-mat").value, niveau:$("#c-niv").value, texte:$("#c-texte").value};
    if (!$("#c-titre").value) $("#c-titre").value = fs[0].name.replace(/\.[^.]+$/, "");
    try { await importCourseFiles(fs); } catch(e){ console.error(e); $("#c-st").textContent = e?.code ? aiErr(e.code) : "Lecture du fichier impossible."; } return; }
  if (el.id === "c-mat" || el.id === "c-niv"){ S.coursDraft = {...(S.coursDraft || {}), matiere:$("#c-mat").value, niveau:$("#c-niv").value}; return; }
  if (d.p){ S.params[d.p] = el.value; if (d.p === "niveau") S.params.classeId = S.params.classeId || ""; return; }
  if (d.type){ const s = new Set(S.params.types); el.checked ? s.add(d.type) : s.delete(d.type); S.params.types = [...s]; return; }
  if (el.id === "p-diff"){ S.params.differencie = el.checked; return; }
  if (el.id === "sc-files"){ const fs = Array.from(el.files); el.value = ""; if (fs.length) addScans(fs); return; }
  if (d.mq){ const it = S.queue.find(x => x.id === d.mq); it[d.f] = d.f === "page" ? +el.value : el.value; if (d.f === "ctrlId") it.eleveId = ""; return render(); }
  if (el.id === "lvlMat"){ S.levelMat = el.value; S.suggestions = null; return render(); }
  if (d.lvl){ const cl = classe(S.classeSel); await write("classes/" + cl.id, {eleves:cl.eleves.map(e => e.id === d.lvl ? {...e, niveaux:{...(e.niveaux || {}), [S.levelMat]:el.value}} : e)}, "update"); return; }
  if (el.id === "corrSel"){ S.corrCtrl = el.value; S.corrEleve = null; return render(); }
  if (el.id === "anSel"){ S.anCtrl = el.value; return render(); }
  if (d.bonus){ const C = ctrl(S.corrCtrl), mx = +C.bonus?.[d.bonus] || 0; const v = el.value === "" ? null : clamp(half(+el.value), 0, mx);
    await write("feuilles/" + C.id, {copies:{[S.corrEleve]:{validee:false, bonusProf:{[d.bonus]:v}}}}, "update"); return; }
  if (d.score){ const C = ctrl(S.corrCtrl), q = C.questions.find(x => x.id === d.score); const v = el.value === "" ? null : clamp(half(+el.value), 0, +q.points);
    await write("feuilles/" + C.id, {copies:{[S.corrEleve]:{validee:false, answers:{[d.score]:{note:v, valide:false}}}}}, "update"); return; }
  /* editor fields */
  const c = S.view === "edit" ? ctrl(S.editId) : null; if (!c) return;
  if (el.id === "prevEl"){ S.previewEleve = el.value; return drawPreview(); }
  if (d.c){ c[d.c] = el.type === "number" ? +el.value : el.value; }
  else if (el.id === "e-diff"){ c.differencie = el.checked; }
  else if (d.m){ c.mise = {...(c.mise || {}), [d.m]: ["police","lh"].includes(d.m) ? +el.value : el.value}; }
  else if (d.bo){ c.bonus = {...(c.bonus || {}), [d.bo]:+el.value}; }
  else if (el.id === "m-bar"){ c.mise = {...(c.mise || {}), bareme:el.checked}; }
  else if (d.q !== undefined){ const q = c.questions[+d.q]; if (!q) return;
    if (d.vk === "choixRaw"){ const lines = el.value.split("\n").map(x => x.trim()).filter(Boolean); q.v = q.v || {};
      const o = {...(q.v[d.lv] || {enonce:""}), choix:lines.map(x => x.replace(/^\*\s*/, "")), bonnes:lines.map((x, j) => x.startsWith("*") ? j : -1).filter(j => j >= 0)};
      o.corrige = "Bonne(s) réponse(s) : " + o.bonnes.map(n => "ABCDEF"[n]).join(", "); o.criteres = "Tout ou rien."; q.v[d.lv] = o; }
    else if (d.vk){ q.v = q.v || {}; q.v[d.lv] = {...(q.v[d.lv] || {enonce:"", corrige:"", criteres:""}), [d.vk]:el.value}; }
    else if (d.k === "erreurs") q.erreurs = el.value.split(";").map(s => s.trim()).filter(Boolean);
    else if (d.k === "type"){ if (el.value) q.type = "qcm"; else delete q.type; }
    else q[d.k] = ["points","lignes"].includes(d.k) ? +el.value : el.value; }
  else return;
  await saveCtrl(c);
});

/* ================= Boot ================= */
render();
(async () => {
  if (!window.claude?.use){
    STANDALONE = true; $("#tabReglages").hidden = false;
    AI = apiSample(); DL = localDownloads; LIM = await AI.limits();
    if (cloudOn()){
      const c = cloudCfg(); SB = supabase.createClient(c.url, c.anon);
      const {data} = await SB.auth.getSession(); SB_USER = data?.session?.user || null;
      SB.auth.onAuthStateChange((ev, sess) => { if (!SB_USER && sess?.user){ SB_USER = sess.user; startCloud(); } });
      if (SB_USER) await startCloud(); else { refreshCaps(); render(); }
      return;
    }
    try { DB = await localDB(); ASSETS = await localAssets(); } catch(e){ console.warn(e); DB = memDB(); LOCAL = true; }
    refreshCaps(); if (!cfg().key && S.view === "home") toast("Ajoute la clé API dans Réglages pour activer l'IA.", 6000);
  } else {
    const use = n => window.claude.use(n).catch(() => null);
    [DB, AI, ASSETS, DL] = await Promise.all([use("db"), use("sample"), use("assets"), use("downloads")]);
    if (AI) LIM = await AI.limits().catch(() => null);
    if (!DB){ DB = memDB(); LOCAL = true; }
    $("#caps").innerHTML = [["IA", AI], ["Photos IA", LIM?.images], ["Sauvegarde", !LOCAL], ["Scans stockés", ASSETS], ["PDF", DL]].map(([l, v]) => `${l} ${v ? "✓" : "✗"}`).join(" · ");
  }
  for (const col of ["classes","cours","controles"]){
    DB.collection(col).onSnapshot(s => { store[col] = s.docs.map(x => ({id:x.id, ...structuredClone(x.data())})); scheduleRender(); }, e => toast("Lecture impossible : " + (e?.code || "")));
  }
  for (const col of ["ecritures","bilans"]) DB.collection(col).onSnapshot(s => { const m = {}; s.docs.forEach(x => m[x.id] = structuredClone(x.data())); store[col] = m; scheduleRender(); }, e => console.warn(e));
  DB.collection("feuilles").onSnapshot(s => { const m = {}; s.docs.forEach(x => m[x.id] = structuredClone(x.data())); store.feuilles = m; scheduleRender(); }, e => console.warn(e));
})();
