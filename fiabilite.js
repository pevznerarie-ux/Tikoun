/* Mastery · fiabilité de la correction et des contrôles générés.
   Fonctions pures, sans accès au disque ni au réseau : le serveur les charge par require, build.py les inclut dans la page.
   Elles sont couvertes par `npm test` (dossier test/) : toute modification du calcul des doutes, du journal de validation
   ou du barème doit garder ces tests au vert. Aucun texte affiché ici : seulement des codes, traduits par l'application. */
(function(root){
"use strict";
const half = x => Math.round(x * 2) / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isObj = x => !!x && typeof x === "object" && !Array.isArray(x);
const str = x => String(x == null ? "" : x);
/* Texte ramené à l'essentiel pour comparer : sans accents ni voyelles hébraïques, sans ponctuation, sans casse */
const norm = t => str(t).toLowerCase().normalize("NFD").replace(/[̀-֑ͯ-ׇ]/g, "").replace(/\$/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/* ---------- Comparaison de deux lectures ---------- */
function lev(a, b){
  a = [...a]; b = [...b]; if (!a.length) return b.length; if (!b.length) return a.length;
  let prev = Array.from({length:b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++){ const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur; }
  return prev[b.length];
}
/* 1 = même texte, 0 = rien de commun (comparaison sur les 1 500 premiers caractères) */
function proche(a, b){
  const A = norm(a).slice(0, 1500), B = norm(b).slice(0, 1500); if (!A && !B) return 1;
  return 1 - lev(A, B) / Math.max([...A].length, [...B].length);
}

/* ---------- Doute sur une réponse corrigée ----------
   Niveau 0 : rien à signaler · 1 : à regarder · 2 : à vérifier d'abord (exclue de la validation groupée).
   Codes : lecture (l'IA a dû deviner) · illisible (passage non lu) · confiance (l'IA se dit peu sûre) · hesite (note entre deux valeurs)
   · detail (le détail par critère ne donne pas la note) · max_fautes (note maximale malgré des erreurs relevées)
   · zero (zéro sans erreur relevée) · lectures (deux lectures différentes) · relu (deux lectures concordantes). */
const ILL = /\[(?:illisible|illegible|ilegível)\]/g;
function detail(raw, max){
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).slice(0, 8).map(d => ({c:str(d.critere != null ? d.critere : d.c).trim().slice(0, 140), p:clamp(half(Number(d.points != null ? d.points : d.p) || 0), 0, max)})).filter(d => d.c);
}
function doute(a, q, x){
  x = x || {}; const r = [], P = +(q && q.points) || 0, tr = str(a && a.transcription), note = +(a && a.noteIA) || 0; let n = 0;
  const add = (lvl, code) => { if (!r.includes(code)) r.push(code); if (lvl > n) n = lvl; };
  if (!a) return {n:0, r};
  if (a.lisible === false) add(2, "lecture");
  if (a.auto) return {n, r};                                   // QCM lu sans IA, cadre vide : seul un cochage ambigu compte
  const ill = (tr.match(ILL) || []).length;
  if (ill) add(ill >= 2 || tr.replace(ILL, "").trim().length < 40 ? 2 : 1, "illisible");
  if (x.vide) return {n, r};                                   // pas de réponse : rien d'autre à vérifier
  const conf = Number(x.confiance);
  if (conf === 1) add(2, "confiance"); else if (conf === 2) add(1, "confiance");
  if (str(a.hesite).trim()) add(1, "hesite");
  if (Array.isArray(a.detail) && a.detail.length && Math.abs(a.detail.reduce((t, d) => t + (+d.p || 0), 0) - note) >= 0.5) add(2, "detail");
  if (P > 0 && note >= P && x.fautes > 0) add(1, "max_fautes");
  if (P > 0 && note === 0 && tr.trim().length >= 25 && !(a.erreurs || []).length && !x.fautes) add(1, "zero");
  return {n, r};
}
/* Ajoute à une réponse construite ce que l'IA a dit de sa propre correction (détail par critère, hésitation) puis le doute.
   detail, hesite et alt sont toujours écrits, même vides : une nouvelle lecture efface ainsi ce que la précédente avait laissé. */
function completer(a, r, q, x){
  r = isObj(r) ? r : {}; const P = +(q && q.points) || 0, lu = !a.auto && !(x && x.vide);
  a.detail = lu ? detail(r.detail, P) : [];
  a.hesite = lu ? str(r.hesitation).trim().slice(0, 200) : "";
  a.alt = null;
  a.doute = doute(a, q, {confiance:r.confiance, fautes:Array.isArray(r.fautes) ? r.fautes.filter(f => str(f).trim()).length : 0, vide:!!(x && x.vide)});
  return a;
}
/* Doute encore ouvert pour le professeur : dès qu'il pose une note ou valide, la réponse n'est plus « à vérifier » */
function ouvert(a){
  if (!a || a.valide || a.note != null) return 0;
  if (isObj(a.doute)) return +a.doute.n || 0;
  return a.lisible === false ? 2 : 0;                          // réponses corrigées avant cette version
}
/* Seconde lecture d'une réponse douteuse. Deux cas.
   Même modèle que la première lecture : la relecture ne remplace jamais la réponse proposée, elle sert seulement à signaler.
     Mêmes texte et note : le doute de lecture retombe à « à regarder ». Sinon la réponse reste « à vérifier d'abord » et la seconde
     lecture est gardée à côté. (Essai sur de vraies copies, novembre 2026 : quand les deux lectures différaient, la relecture
     était plus loin de la note du professeur que la première lecture 5 fois sur 9.)
   Renfort (o.renfort) : la première lecture vient du modèle économique, la relecture du modèle le plus précis. C'est alors la
     relecture qui devient la proposition, avec son propre niveau de doute ; si elle diffère, la première lecture est gardée à côté
     et la réponse est au moins « à regarder ». (Même essai : ce montage approche la justesse du modèle précis seul.) */
const DOUTES_LECTURE = ["lecture", "illisible", "confiance", "relu", "lectures"];
function fusion(premiere, seconde, o){
  const s = proche(premiere.transcription, seconde.transcription), memes = s >= 0.9 && Math.abs((+premiere.noteIA || 0) - (+seconde.noteIA || 0)) < 0.5;
  const d1 = isObj(premiere.doute) ? premiere.doute : {n:0, r:[]}, d2 = isObj(seconde.doute) ? seconde.doute : {n:0, r:[]};
  const cote = a => ({transcription:str(a.transcription), noteIA:+a.noteIA || 0, commentaire:str(a.commentaire).slice(0, 400)});
  if (o && o.renfort){ const out = {...seconde}, r2 = d2.r.filter(k => k !== "relu" && k !== "lectures");
    if (memes){ out.doute = {n:d2.n, r:["relu", ...r2]}; out.alt = null; }
    else { out.doute = {n:Math.max(d2.n, 1), r:["lectures", ...r2]}; out.alt = cote(premiere); }
    return out; }
  const out = {...premiere};
  if (memes){ const reste = d1.r.filter(k => !DOUTES_LECTURE.includes(k));                          // ce qui ne tient pas à la lecture reste signalé
    out.doute = {n:d2.n === 2 || reste.includes("detail") ? 2 : 1, r:["relu", ...reste]}; out.alt = null; }
  else { out.doute = {n:2, r:["lectures", ...d1.r.filter(k => k !== "lectures" && k !== "relu")]}; out.alt = cote(seconde); }
  return out;
}
/* Écriture hébraïque dans une réponse : le modèle économique la lit mal, elle part en renfort */
const hebreu = t => /[\u05d0-\u05ea]/.test(str(t));
/* Gabarit de consigne : remplace {{CLE}} par sa valeur, sans interpréter le texte inséré */
function remplir(tpl, vars){ return str(tpl).replace(/\{\{([A-Z]+)\}\}/g, (m, k) => Object.prototype.hasOwnProperty.call(vars, k) ? str(vars[k]) : m); }

/* ---------- Journal de validation ----------
   Compare les copies d'un contrôle avant et après une écriture du professeur et rend les événements à consigner :
   valide (note proposée par l'IA, note retenue) · garde (le professeur confirme la note proposée) · note (note changée à la main)
   · rouvre (validation retirée). */
function journal(avant, apres, par, at){
  const ev = [], A = (isObj(avant) && isObj(avant.copies)) ? avant.copies : {}, B = (isObj(apres) && isObj(apres.copies)) ? apres.copies : {};
  let lot = 0; for (const e in B) if (B[e] && B[e].validee && !(A[e] && A[e].validee)) lot++;
  const noteOf = a => a ? (a.note != null ? a.note : a.noteIA != null ? a.noteIA : null) : null;
  for (const e in B){ const b = B[e] || {}, a = A[e] || {}, ba = isObj(b.answers) ? b.answers : {}, aa = isObj(a.answers) ? a.answers : {};
    for (const q in ba){ const y = ba[q] || {}, x = aa[q] || {}, ia = y.noteIA != null ? y.noteIA : null, base = {at, par, e, q};
      if (y.valide && !x.valide) ev.push({...base, act:"valide", ia, note:noteOf(y), ...(lot > 1 && b.validee && !a.validee ? {lot} : {})});
      else if (y.note != null && y.note !== x.note) ev.push({...base, act:x.note == null && y.note === noteOf(x) ? "garde" : "note", ia, avant:noteOf(x), note:y.note, ...(x.valide ? {rouvre:true} : {})});
      else if (x.valide && !y.valide) ev.push({...base, act:"rouvre", ia, note:noteOf(y)});
    } }
  return ev;
}

/* ---------- Barème ----------
   Ramène une liste de points à un total, par pas de 0,5, en gardant les proportions (méthode des plus forts restes). */
function repartir(points, total){
  const pts = (points || []).map(p => Math.max(0.5, half(+p || 0))), sum = pts.reduce((a, b) => a + b, 0), units = Math.round(total * 2);
  if (!pts.length || !(total > 0) || Math.abs(sum - total) < 1e-9 || units < pts.length) return pts;
  const exact = pts.map(p => p / sum * units), base = exact.map(x => Math.max(1, Math.floor(x)));
  let reste = units - base.reduce((a, b) => a + b, 0);
  const ordre = exact.map((x, i) => ({i, f:x - Math.floor(x)})).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; reste > 0; k++, reste--) base[ordre[k % ordre.length].i]++;
  for (let k = ordre.length - 1; reste < 0; k = (k - 1 + ordre.length) % ordre.length){ const i = ordre[k].i; if (base[i] > 1){ base[i]--; reste++; } }
  return base.map(u => u / 2);
}
/* Somme des points annoncés dans un texte de critères (« 1 pt pour… ; 2 pts pour… ») ; null si on ne peut pas la lire de façon sûre */
function sommeCriteres(txt, points){
  const t = str(txt); if (/(^|[^\p{L}])(par|chaque|chacune?|each|per|por|cada|max|maximum|jusqu|up to|até)([^\p{L}]|$)/iu.test(t)) return null;
  const vals = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:pts?|points?|pontos?)(?![\p{L}])/giu)].map(m => parseFloat(m[1].replace(",", ".")));
  if (vals.length < 2) return null;
  let s = vals.reduce((a, b) => a + b, 0);
  if (points > 0 && vals.length >= 3 && vals[0] === points && Math.abs(s - 2 * points) < 0.5) s -= points;   // « sur 4 points : 1 pt…, 3 pts… » : le total est rappelé en tête
  return s;
}

/* ---------- Vérification d'un contrôle généré ----------
   qs : questions au format enregistré ({type, sujet, notion, points, v:{socle, standard, approfondi}}).
   o : {total, n, sujets, differencie, pointsFixes}. Corrige ce qui peut l'être (barème, versions absentes) et liste le reste.
   Rend {qs, verif:[{k, …}], invalides:[indices des questions inutilisables, à redemander]}. */
const GENERIQUE = new Set(["chapitre", "sujet", "partie", "theme", "lecon", "sequence", "unite", "chapter", "part", "topic", "lesson", "capitulo", "parte", "tema", "texte", "text", "texto"]);
const motsSujet = t => norm(t).split(" ").filter(x => x.length > 3 && !GENERIQUE.has(x));
const numsSujet = t => (norm(t).match(/\d+/g) || []).join(" ");
function memeSujet(a, b){
  const A = norm(a), B = norm(b); if (!A || !B) return false; if (A === B) return true;
  const ta = new Set(motsSujet(a)), tb = new Set(motsSujet(b));
  if (!ta.size || !tb.size) return !!numsSujet(a) && numsSujet(a) === numsSujet(b);          // « Chapitre 2 » et « Chap. 2 »
  return [...ta].filter(x => tb.has(x)).length / Math.min(ta.size, tb.size) >= 0.6;
}
/* Question inutilisable telle quelle : "vide" (pas d'énoncé), "qcm" (moins de deux choix différents, ou pas de bonne réponse), sinon "" */
function defaut(q){
  const std = isObj(q) && isObj(q.v) ? q.v.standard : null; if (!isObj(std) || !str(std.enonce).trim()) return "vide";
  if (q.type === "qcm"){ const ch = (Array.isArray(std.choix) ? std.choix : []).map(norm), bonnes = Array.isArray(std.bonnes) ? std.bonnes : [];
    if (ch.length < 2 || ch.some(x => !x) || new Set(ch).size !== ch.length || !bonnes.length || bonnes.some(b => !(b >= 0 && b < ch.length))) return "qcm"; }
  return "";
}
/* Indices des questions à redemander à l'IA avant la vérification complète */
const invalides = qs => (Array.isArray(qs) ? qs : []).map((q, i) => defaut(q) ? i : -1).filter(i => i >= 0);
function verifier(qs, o){
  o = o || {}; const verif = [], sansCriteres = new Set();
  qs = (Array.isArray(qs) ? qs : []).filter(isObj);
  qs.forEach(q => { q.points = o.pointsFixes && +q.points > 0 ? +q.points : Math.max(0.5, half(+q.points || 0)); if (!isObj(q.v)) q.v = {}; });   // les points fixés par le professeur ne sont jamais arrondis
  const sum = qs.reduce((a, q) => a + q.points, 0);
  if (!o.pointsFixes && o.total > 0 && qs.length > 1 && Math.abs(sum - o.total) >= 0.25){
    repartir(qs.map(q => q.points), o.total).forEach((p, i) => { if (p !== qs[i].points){ qs[i].points = p; sansCriteres.add(i); } });
    verif.push({k:"points", avant:sum, total:o.total});
  }
  qs.forEach((q, i) => { const n = i + 1, std = q.v.standard, qcm = q.type === "qcm";
    const ko = defaut(q); if (ko){ verif.push({k:ko, q:n}); return; }
    if (!qcm && !str(std.corrige).trim()) verif.push({k:"corrige", q:n});
    if (o.differencie){ let copie = false;
      for (const l of ["socle", "approfondi"]) if (!isObj(q.v[l]) || !str(q.v[l].enonce).trim()){ q.v[l] = JSON.parse(JSON.stringify(std)); verif.push({k:"version", q:n, l}); copie = true; }
      if (!copie && !qcm && norm(q.v.socle.enonce) === norm(std.enonce) && norm(q.v.approfondi.enonce) === norm(std.enonce)) verif.push({k:"memes", q:n}); }
    if (!qcm && !sansCriteres.has(i)){ const s = sommeCriteres(std.criteres, q.points); if (s != null && Math.abs(s - q.points) >= 0.5) verif.push({k:"criteres", q:n, somme:s, points:q.points}); }
  });
  const suj = (Array.isArray(o.sujets) ? o.sujets : []).map(str).filter(x => x.trim());
  if (suj.length >= 2 && qs.length >= suj.length && qs.some(q => str(q.sujet).trim()))
    for (const s of suj) if (!qs.some(q => memeSujet(q.sujet, s))) verif.push({k:"sujet", s:s.slice(0, 120)});
  if (o.n > 0 && qs.length < o.n) verif.push({k:"nombre", n:qs.length, voulu:o.n});
  return {qs, verif, invalides:invalides(qs)};
}

/* ---------- Plan d'un contrôle (proposé par l'IA, approuvé par le professeur avant la rédaction) ---------- */
const TYPES_Q = ["cours", "application", "probleme", "texte", "traduction", "qcm", "choix"], COMPS_Q = ["connaitre", "comprendre", "raisonner", "lire", "ecrire"];
const sansAccent = x => str(x).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
function plan(raw, o){
  o = o || {}; const types = Array.isArray(o.types) && o.types.length ? o.types.filter(t => TYPES_Q.includes(t)) : TYPES_Q;
  let items = (Array.isArray(raw) ? raw : []).filter(isObj).map(x => { const t = sansAccent(x.type), c = sansAccent(x.competence != null ? x.competence : x.comp);
    return {sujet:str(x.sujet).trim().slice(0, 120), notion:str(x.notion).trim().slice(0, 160), type:TYPES_Q.includes(t) ? t : (types[0] || "cours"), comp:COMPS_Q.includes(c) ? c : "", points:Math.max(0.5, half(+x.points || 0))}; }).filter(x => x.notion);
  if (o.n > 0) items = items.slice(0, o.n);
  if (o.total > 0 && items.length > 1) repartir(items.map(x => x.points), o.total).forEach((p, i) => { items[i].points = p; });
  return items;
}

const API = {half, norm, proche, detail, doute, completer, ouvert, fusion, hebreu, remplir, journal, repartir, sommeCriteres, invalides, verifier, plan, TYPES_Q, COMPS_Q};
if (typeof module !== "undefined" && module.exports) module.exports = API; else root.FIAB = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
