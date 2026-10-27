
/* ================= Navigation : de vraies pages, avec adresse, Précédent / Suivant ================= */
const STEPS = [["preparer","Préparer"],["mise-en-page","Mise en page"],["imprimer","Imprimer"],["scanner","Scanner"],["corriger","Corriger"],["classe","Classe & rattrapage"]];
const stepIdx = s => STEPS.findIndex(x => x[0] === s);
function defaultStep(c){ return {brouillon:"preparer", imprime:"scanner", correction:"corriger", corrige:"classe"}[c?.statut] || "preparer"; }
function routeOf(){
  switch (S.view){
    case "home": return "accueil";
    case "new": return "nouveau";
    case "edit": return `controle/${S.editId}/${S.step || "preparer"}`;
    case "scan": return S.scanCtrl ? `controle/${S.scanCtrl}/scanner` : "scanner";
    case "correct": return S.corrCtrl && S.inCtrl ? `controle/${S.corrCtrl}/corriger` : "correction";
    case "analyse": return S.anCtrl && S.inCtrl ? `controle/${S.anCtrl}/classe` : "resultats";
    case "reglages": return "sauvegarde";
    case "quiznew": return "exercices/nouveau";
    case "quiz": return `exercices/${S.qz.id}/${S.qz.tab || "questions"}`;
    default: return S.view;
  }
}
function applyRoute(){
  const [a, b, c] = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  S.inCtrl = null; S.scanCtrl = null;
  if (a === "controle" && b){
    const step = STEPS.some(x => x[0] === c) ? c : "preparer"; S.inCtrl = b; S.step = step;
    if (stepIdx(step) <= 2){ S.view = "edit"; S.editId = b; }
    else if (step === "scanner"){ S.view = "scan"; S.scanCtrl = b; }
    else if (step === "corriger"){ S.view = "correct"; if (S.corrCtrl !== b){ S.corrCtrl = b; S.corrEleve = null; S.editTr = {}; S.editCom = {}; } }
    else { S.view = "analyse"; S.anCtrl = b; }
  }
  else if (a === "exercices" && b){ if (b === "nouveau") S.view = "quiznew"; else { if (S.qz.id !== b) S.qz.el = null; S.view = "quiz"; S.qz.id = b; S.qz.tab = ["questions","reglages","resultats"].includes(c) ? c : "questions"; } }
  else S.view = {accueil:"home", nouveau:"new", scanner:"scan", sauvegarde:"reglages", correction:"correct", resultats:"analyse"}[a] || (["controles","exercices","classes","suivi","banque","direction","compte","comptes","entrainement"].includes(a) ? a : "home");
}
function go(v){
  S.view = v;
  if (v === "edit"){ S.inCtrl = S.editId; if (stepIdx(S.step) < 0 || stepIdx(S.step) > 2) S.step = "preparer"; }
  else if (v === "correct" && S.corrCtrl){ S.inCtrl = S.corrCtrl; S.step = "corriger"; }
  else if (v === "analyse" && S.anCtrl){ S.inCtrl = S.anCtrl; S.step = "classe"; }
  else if (v !== "scan") S.inCtrl = null;
  const h = "#/" + routeOf();
  if (location.hash !== h) location.hash = h; else { render(); window.scrollTo({top:0}); }
}
function openCtrl(id, step){ const c = ctrl(id); location.hash = `#/controle/${id}/${step || defaultStep(c)}`; }
window.addEventListener("hashchange", () => { const a = document.activeElement; if (a && a !== document.body && $("#view")?.contains(a)) a.blur(); flushEdit(); applyRoute(); render(); window.scrollTo({top:0}); });

function navKey(){ if (S.inCtrl || S.view === "edit" || S.view === "new") return "controles"; return {home:"accueil", quiznew:"exercices", quiz:"exercices", scan:"scanner", reglages:"sauvegarde", correct:"controles", analyse:"controles"}[S.view] || S.view; }

/* Cadre commun d'un contrôle : en-tête, étapes, Précédent / Suivant */
function ctrlProgress(c){
  const f = feuille(c.id), studs = studentsOf(c), n = studs.length;
  const sc = studs.filter(e => Object.keys(f?.copies?.[e.id]?.answers || {}).length).length, va = studs.filter(e => f?.copies?.[e.id]?.validee).length;
  return {n, sc, va, printed:!!f && Object.keys(f.copies || {}).length > 0};
}
function ctrlFrame(c, inner){
  const i = stepIdx(S.step), pr = ctrlProgress(c), cl = classe(c.classeId);
  const doneUpTo = {brouillon:-1, imprime:2, correction:3, corrige:4}[c.statut] ?? -1;
  const prev = STEPS[i - 1], next = STEPS[i + 1];
  return `<div class="crumbs small row between"><a href="#/controles">← Tous les contrôles</a><button class="btn sm ghost danger" id="delCtrlTop">Supprimer le contrôle</button></div>
  <div class="head"><div><div class="label">${c.type === "rattrapage" ? "Rattrapage" : c.type === "exercices" ? "Exercices" : "Contrôle"} · ${esc(c.matiere)} · ${esc(cl?.nom || "?")}${c.date ? " · " + esc(frDate(c.date)) : ""}</div><h2>${esc(c.titre)}</h2></div>
    <div class="row">${chipStatut(c)}${pr.printed ? `<span class="chip">${pr.sc}/${pr.n} scannées · ${pr.va}/${pr.n} validées</span>` : ""}</div></div>
  <nav class="stepper" aria-label="Étapes">${STEPS.map(([k, l], j) => `<a href="#/controle/${c.id}/${k}" class="st ${j === i ? "on" : j <= doneUpTo ? "done" : ""}" ${j === i ? 'aria-current="step"' : ""}><b>${j + 1}</b><span>${l}</span></a>`).join("")}</nav>
  <p class="small muted" style="margin:0">${i <= 2 && c.statut === "brouillon" ? "Brouillon · " : ""}<span id="savest" class="savest"></span></p>
  ${inner}
  <div class="stepnav">${prev ? `<a class="btn" href="#/controle/${c.id}/${prev[0]}">← ${prev[1]}</a>` : "<span></span>"}${next ? `<a class="btn primary" href="#/controle/${c.id}/${next[0]}">${next[1]} →</a>` : `<a class="btn" href="#/controles">Terminer</a>`}</div>`;
}


/* Ligne de contrôle : une progression lisible et un seul bouton qui mène à l'étape suivante */
function ctrlNext(c){
  const pr = ctrlProgress(c), k = pr.sc - pr.va;
  if (c.statut === "corrige") return {i:5, txt:"Corrigé", tone:"ok"};
  if (c.statut === "correction") return k > 0 ? {i:4, txt:`${k} ${k > 1 ? "copies à valider" : "copie à valider"}`, tone:"warn"} : {i:4, txt:"Toutes les copies sont validées", tone:"ok"};
  if (c.statut === "imprime") return {i:3, txt:"Imprimé · copies à scanner", tone:""};
  return {i:0, txt:"À préparer", tone:""};
}
function ctrlRow(c, meta){
  const nx = ctrlNext(c);
  return `<a class="crow" href="#/controle/${c.id}/${defaultStep(c)}">
    <div class="crow-main"><div class="t">${c.type === "rattrapage" ? '<span class="chip blue">Rattrapage</span> ' : c.type === "exercices" ? '<span class="chip">Exercices</span> ' : ""}${esc(c.titre)}</div><div class="s">${meta}</div></div>
    <div class="crow-prog"><span class="pdots" aria-hidden="true">${STEPS.map((x, j) => `<i class="${j < nx.i ? "d" : j === nx.i ? "c" : ""}"></i>`).join("")}</span><span class="crow-st ${nx.tone}">${nx.txt}</span></div>
    <span class="btn sm crow-go">${c.statut === "corrige" ? "Voir" : "Continuer"} →</span></a>`;
}

/* Liste des contrôles, rangés */
function ctrlList(){
  const f = S.cf = S.cf || {st:"tous", mat:""};
  return store.controles.filter(c => (f.st === "tous" || (f.st === "rattrapage" || f.st === "exercices" ? c.type === f.st : isCtrl(c) && c.statut === f.st)) && (!f.mat || c.matiere === f.mat))
    .sort((a, b) => (b.date || b.createdAt || "").localeCompare(a.date || a.createdAt || ""));
}
function ctrlClasses(){ const ids = new Set(ctrlList().map(c => c.classeId)); const cls = store.classes.filter(c => ids.has(c.id)); if (ids.has(undefined) || [...ids].some(id => !classe(id))) cls.push({id:"__none", nom:"Sans classe"}); return cls; }
function vControles(){
  const f = S.cf = S.cf || {st:"tous", mat:""};
  const all = store.controles;
  const cnt = k => all.filter(c => k === "tous" ? true : k === "rattrapage" || k === "exercices" ? c.type === k : isCtrl(c) && c.statut === k).length;
  const list = ctrlList();
  const F = [["tous","Tous"],["brouillon","Brouillons"],["imprime","Imprimés"],["correction","En correction"],["corrige","Corrigés"],["rattrapage","Rattrapages"]];
  const mats = [...new Set(all.map(c => c.matiere))];
  const of = cl => list.filter(c => cl.id === "__none" ? !classe(c.classeId) : c.classeId === cl.id);
  const line = c => { const pr = ctrlProgress(c);
    return ctrlRow(c, `${esc(c.matiere)}${c.date ? " · " + esc(frDate(c.date)) : ""}${c.type === "rattrapage" ? " · " + esc(studentsOf(c).map(e => e.prenom + " " + e.nom).join(", ")) : ""}${S.scope === "ecole" && c.owner ? " · " + esc(userName(c.owner) || "?") : ""}${pr.printed ? ` · ${pr.sc}/${pr.n} scannées` : ""}`); };
  const sum = cl => { const cs = of(cl), todo = cs.filter(c => c.statut === "correction").length; return `${cs.length} contrôle(s)${todo ? ` · <b style="color:var(--warn)">${todo} en correction</b>` : ""}${cl.eleves ? " · " + cl.eleves.length + " élèves" : ""}`; };
  return `<div class="head"><div><h2>${S.me && S.scope !== "ecole" ? "Mes contrôles" : "Contrôles"}</h2><p>Classe par classe : ouvre une classe pour voir ses contrôles, réduis-la quand tu as fini.</p></div>
    <div class="row">${isBoss() ? `<select id="scope-sel" style="width:auto" aria-label="Portée">${selOpts(["moi","ecole"], S.scope, x => x === "moi" ? "Mes contrôles" : "Toute l'école")}</select>` : ""}<a class="btn primary" href="#/nouveau">+ Nouveau contrôle</a></div></div>
  <div class="row">${F.map(([k, l]) => `<button class="fchip ${f.st === k ? "on" : ""}" data-cf="${k}">${l} <span class="num">${cnt(k)}</span></button>`).join("")}
    ${mats.length > 1 ? `<select id="cf-mat" style="width:auto;margin-left:auto" aria-label="Matière"><option value="">Toutes les matières</option>${selOpts(mats, f.mat)}</select>` : ""}</div>
  ${list.length ? classAcc("ctrl", ctrlClasses(), sum, cl => `<div>${of(cl).map(line).join("")}</div>`) : `<section class="panel empty">Aucun contrôle ${f.st !== "tous" ? "dans cette catégorie" : "pour l'instant"}.</section>`}`;
}
document.addEventListener("click", ev => { const t = ev.target.closest("[data-cf]"); if (!t) return; S.cf.st = t.dataset.cf; render(); });
document.addEventListener("change", ev => { if (ev.target.id === "cf-cl"){ S.cf.cl = ev.target.value; render(); } if (ev.target.id === "cf-mat"){ S.cf.mat = ev.target.value; render(); } });

/* Onglets de classe repliables : chaque classe s'ouvre dans la page et peut se réduire */
S.acc = S.acc || {};
function classAcc(key, classes, summary, body, multi = true){
  if (!classes.length) return "";
  if (!(key in S.acc)) S.acc[key] = [classes[0].id];
  const open = new Set(S.acc[key]);
  const all = classes.length > 1 ? `<div class="row" style="justify-content:flex-end;margin-bottom:-6px"><button class="btn sm ghost" data-accall="${key}" data-v="${open.size ? 0 : 1}">${open.size ? "Tout réduire" : "Tout déplier"}</button></div>` : "";
  return all + classes.map(cl => { const o = open.has(cl.id);
    return `<section class="acc ${o ? "open" : ""}"><button class="acc-h" data-acc="${key}" data-accid="${esc(cl.id)}" aria-expanded="${o}"><span class="acc-n">${esc(cl.nom)}</span><span class="acc-s">${summary(cl)}</span><span class="acc-c" aria-hidden="true">›</span></button>${o ? `<div class="acc-b">${body(cl)}</div>` : ""}</section>`; }).join("");
}
document.addEventListener("click", ev => {
  const t = ev.target.closest("[data-acc],[data-accall]"); if (!t) return; const d = t.dataset;
  if (d.accall){ const k = d.accall; S.acc[k] = d.v === "1" ? accClasses(k).map(c => c.id) : []; return render(); }
  const k = d.acc, id = d.accid, cur = new Set(S.acc[k] || []), single = k === "suivi";
  if (cur.has(id)) cur.delete(id); else { if (single) cur.clear(); cur.add(id); }
  S.acc[k] = [...cur]; if (k === "suivi" && cur.size){ S.su = {...(S.su || {}), cl:id, el:null}; }
  render();
});
const accClasses = k => k === "ctrl" ? ctrlClasses() : k === "quiz" ? quizClasses() : store.classes;

/* Menu du compte (en haut à droite) : pages personnelles et de l'établissement */
function setAvatar(nom){ const el = document.getElementById("uav"); if (!el) return; const ini = String(nom || "").split(/\s+/).filter(w => /^\p{L}/u.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join(""); el.textContent = ini; el.hidden = !ini; }
function umenu(open){ const b = $("#ubtn"), p = $("#upop"); if (!b || !p) return; p.hidden = !open; b.setAttribute("aria-expanded", open); }
document.addEventListener("click", ev => { if (ev.target.closest("#ubtn")) return umenu($("#upop").hidden); if (!ev.target.closest("#upop") || ev.target.closest("a")) umenu(false); });
document.addEventListener("keydown", ev => { if (ev.key === "Escape") umenu(false); });
