"use strict";
/* ================= Helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt = n => n == null || isNaN(n) ? "—" : (Math.round(n * 10) / 10).toString().replace(".", document.documentElement.lang === "en" ? "." : ",");
const pct = n => Math.round(n * 100) + (document.documentElement.lang === "en" ? "%" : " %");
const tone = r => r == null ? "none" : r >= 0.7 ? "ok" : r >= 0.5 ? "warn" : "bad";
const uid = (n = 10) => { const a = "abcdefghijkmnpqrstuvwxyz23456789"; let s = ""; const b = crypto.getRandomValues(new Uint8Array(n)); for (const x of b) s += a[x % a.length]; return s; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
const frDate = d => { if (!d) return ""; const x = new Date(d + (d.length === 10 ? "T12:00:00" : "")); return isNaN(x) ? d : x.toLocaleDateString("fr-FR", {day:"numeric", month:"long", year:"numeric"}); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const half = v => Math.round(v * 2) / 2;
/* Lecture des PDF dans un vrai « worker » : l'écran ne fige plus sur les gros PDF du copieur */
document.addEventListener("DOMContentLoaded", () => { try { if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js"; } catch(e){} });
/* Filet de sécurité : une erreur imprévue ne laisse pas l'écran figé sans explication */
window.addEventListener("error", ev => { if (!ev.error || /ResizeObserver|Script error/i.test(ev.message || "")) return; console.error(ev.error); try { toast("Un problème est survenu. Si un bouton ne répond plus, recharge la page.", 6000); } catch(e){} });
window.addEventListener("unhandledrejection", ev => { console.error(ev.reason); try { const c = ev.reason?.code; toast(c ? aiErr(c) : "Un problème est survenu. Réessaie, ou recharge la page.", 6000); } catch(e){} });
function toast(msg, ms = 3500){ const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), ms); }

const MATIERES = ["Mathématiques","Français","Histoire-Géographie","SVT","Physique-Chimie","Anglais","Espagnol","Allemand","Philosophie","SES","Technologie","NSI","Arts plastiques","Éducation musicale"];
const MAT_SUGG = [];
/* Matières : liste de base + matières ajoutées par le prof, + celles déjà utilisées */
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch(e){ return []; } };
/* Les matières que le prof enseigne (Mon compte) : seules celles-ci sont proposées. Vide = toute la liste. */
const enseigne = () => (window.TIKOUN_CONFIG?.accounts && S.me ? S.me.enseigne : lsGet("mastery.enseigne")) || [];
function myMatieres(all){ const ens = enseigne(); if (!all && ens.length) return ens;
  const perso = S.me?.matieres || lsGet("mastery.matieres");
  const used = [...(store.controles || []), ...(store.cours || []), ...(store.quizzes || [])].map(x => x.matiere).filter(Boolean);
  return [...new Set([...MATIERES, ...MAT_SUGG, ...perso, ...used])]; }
const matOpts = (cur, all) => { const l = myMatieres(all); return selOpts(cur && !l.includes(cur) ? [cur, ...l] : l, cur) + (!all && enseigne().length ? `<option value="__all">Autre matière…</option>` : `<option value="__add">+ Nouvelle matière…</option>`); };
async function saveMe(patch, lsKey){ if (window.TIKOUN_CONFIG?.accounts && S.me){ const j = await api("/api/me", {method:"PATCH", body:JSON.stringify(patch)}); S.me = j.user; }
  else { try { localStorage.setItem(lsKey, JSON.stringify(Object.values(patch)[0])); } catch(e){} } }
const clean = l => [...new Set(l.map(x => String(x).trim()).filter(Boolean))];
async function saveMatieres(list){ await saveMe({matieres:clean(list).slice(0, 40)}, "mastery.matieres"); }
async function saveEnseigne(list){ await saveMe({enseigne:clean(list).slice(0, 12)}, "mastery.enseigne"); }
/* Une matière utilisée qui n'est pas encore dans « mes matières » y est ajoutée toute seule */
async function learnMatiere(m){ if (!m || enseigne().includes(m)) return; try { await saveEnseigne([...enseigne(), m]); } catch(e){} }
document.addEventListener("change", async ev => { const el = ev.target; if (el.tagName !== "SELECT" || !["__add", "__all"].includes(el.value)) return;
  ev.stopImmediatePropagation();
  if (el.value === "__all"){ const cur = myMatieres()[0]; el.innerHTML = matOpts(cur, true); el.value = cur; return; }
  const n = (prompt("Nom de la nouvelle matière (ex. Guémara) :") || "").trim();
  if (n){ await saveMatieres([...(S.me?.matieres || lsGet("mastery.matieres")), n]); }
  const v = n || myMatieres()[0]; el.innerHTML = matOpts(v, true); el.value = v; el.dispatchEvent(new Event("change", {bubbles:true})); }, true);
const NIVEAUX = ["6e","5e","4e","3e","2de","1re","Terminale"];
const LEVELS = ["socle","standard","approfondi"];
const LVL = {socle:"Socle", standard:"Standard", approfondi:"Approfondi"};
const OLD_ENTETE = "Collège-Lycée Beth Mena'hem · Levallois-Perret";
/* En-tête des feuilles : choisi par le prof (école, son nom, ou les deux) ; un texte libre saisi dans la mise en page reste prioritaire. */
const AFFICHE = {les2:"École et mon nom", ecole:"École seulement", nom:"Mon nom seulement"};
/* Préférences du prof (Mon compte) : mise en page par défaut des feuilles et style des questions */
const PREF_DEF = {police:15, lh:30, bareme:true, consignes:"Écris uniquement dans les cadres.", q:{format:"mixte", justif:true, profondeur:"standard", longueur:"moyenne"}};
function prefs(){ let p = S.me?.prefs; if (!p){ try { p = JSON.parse(localStorage.getItem("mastery.prefs") || "null"); } catch(e){} }
  return {...PREF_DEF, ...(p || {}), q:{...PREF_DEF.q, ...(p?.q || {})}}; }
async function savePrefs(patch){ const cur = prefs(), next = {...cur, ...patch, q:{...cur.q, ...(patch.q || {})}};
  if (window.TIKOUN_CONFIG?.accounts && S.me){ const j = await api("/api/me", {method:"PATCH", body:JSON.stringify({prefs:next})}); S.me = j.user; }
  else { try { localStorage.setItem("mastery.prefs", JSON.stringify(next)); } catch(e){} } }
/* Les réglages d'un nouveau contrôle partent des préférences */
function applyPrefParams(){ const Q = prefs().q;
  S.params.difficulte = {simple:"facile", standard:"moyen", exigeant:"exigeant"}[Q.profondeur] || "moyen";
  S.params.types = Q.format === "redige" ? ["cours","application"] : Q.format === "qcm" ? ["qcm","application"] : ["cours","application","qcm"];
  S.params._pref = true; }
function questionRule(p){ const Q = prefs().q, L = {courte:"3 à 5", moyenne:"5 à 8", developpee:"8 à 14"}[Q.longueur] || "5 à 8";
  return `Réponses attendues : environ ${L} lignes par question (sauf QCM).` + ((p.types || []).includes("qcm") && Q.justif
    ? `\nQuestions à choix : n'utilise pas le type "qcm". Écris les propositions (A, B, C…) dans l'énoncé, demande à l'élève d'indiquer son choix ET de le justifier, et prévois des lignes de réponse ; le corrigé et les critères notent le choix et la justification. Le contrôle contient au moins une question à choix de ce genre.` : ""); }
function headerFrom(aff){
  const e = S.me?.ecole, ec = e?.nom ? e.nom + (e.ville ? " · " + e.ville : "") : "", nom = S.me?.nom || "";
  if (aff === "ecole") return ec || nom; if (aff === "nom") return nom || ec; return [ec, nom].filter(Boolean).join(" · ");
}
const enteteOf = c => { const t = c?.mise?.entete; return t && t !== OLD_ENTETE ? t : headerFrom(c?.mise?.affiche || S.me?.affichage || "les2"); };
const STATUT = {brouillon:["Brouillon",""], imprime:["Imprimé","blue"], correction:["En correction","warn"], corrige:["Corrigé","ok"]};

const aiErr = c => ({
  cancelled:"Annulé.", budget:"Plafond quotidien de l'IA atteint pour ton compte : réessaie demain (ou demande à l'administrateur de l'augmenter).", timeout:"L'IA met trop de temps à répondre : relance dans un instant.", must_change:"Choisis d'abord un nouveau mot de passe.",
  no_access:"Ton essai gratuit est terminé : choisis un abonnement dans Mon compte pour continuer.",
  not_granted:"L'IA n'a pas été autorisée pour cette page.", sampling_disabled:"L'IA n'est pas disponible pour ce compte.",
  rate_limited:"Trop de demandes d'un coup : attends une minute puis relance.", session_expired:"Session expirée : reconnecte-toi à Claude.",
  image_rejected:"Image refusée : essaie une photo JPG ou PNG plus nette.", invalid_json:"Réponse de l'IA illisible : relance.",
  refused:"Demande refusée par l'IA : reformule.", prompt_too_large:"Document trop long : raccourcis le cours.",
  images_unavailable:"Cette vue ne peut pas envoyer d'images à l'IA.", no_ai:"IA indisponible pour le moment (serveur non configuré ?).",
  no_key:"IA non configurée sur le serveur.", bad_key:"Clé IA refusée par le serveur.", need_code:"Code d'accès requis : recharge la page.", no_option:"Exercices en ligne non activés pour ton compte (à partir du forfait Essentiel).", no_cours:"Cours d'origine introuvable.", not_failed:"Rattrapage réservé aux élèves sous 10/20 (copie corrigée).", ratt_exists:"Cet élève a déjà un rattrapage pour ce contrôle.", api_400:"Requête refusée par l'API (document trop long ou modèle inconnu : vérifie les Réglages).", no_blob:"Image introuvable.", cloud_write:"Enregistrement en ligne impossible (connexion ?)."
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
  return { doc, _all:() => data, _remote:(p, val) => { if (val == null) delete data[p]; else data[p] = val; notify(colOf(p)); }, collection: col => ({ path:col, doc: id => doc(col + "/" + (id || uid(16))),
    onSnapshot: (fn) => { const s = {col, fn}; subs.push(s); setTimeout(() => fn(snapOf(col))); return () => subs.splice(subs.indexOf(s), 1); } }) };
}

/* Écran de chargement : rien n'est affiché tant que les données du serveur ne sont pas arrivées (évite l'accueil vide qui « saute ») */
let DATA_READY = false;
const vLoading = () => `<div style="min-height:55vh;display:grid;place-items:center"><div style="display:grid;justify-items:center;gap:14px;color:var(--muted)"><div class="spin" aria-hidden="true" style="width:28px;height:28px;border:2px solid var(--line);border-top-color:var(--gold);border-radius:50%;animation:spin .8s linear infinite"></div><span class="small">Chargement de tes classes…</span></div></div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;
/* ================= Store ================= */
const store = {classes:[], cours:[], controles:[], feuilles:{}, ecritures:{}, bilans:{}};
const S = {
  view:"home", wizStep:1, coursId:null, coursDraft:null, params:{classeId:"", titre:"", duree:55, nbq:5, difficulte:"moyen", types:["cours","application"], consignes:"", differencie:false, matiere:"", niveau:""},
  editId:null, vtab:{}, previewEleve:null, classeSel:null, levelMat:"Mathématiques", suggestions:null,
  su:null, bk:null, bankOpen:false, bkq:"", corrCtrl:null, corrEleve:null, editTr:{}, editCom:{}, anCtrl:null, queue:[], queueRunning:false, busy:{}
};


const classe = id => store.classes.find(c => c.id === id);
const nivOf = cl => cl ? cl.niveau || NIVEAUX.find(n => (cl.nom || "").split(" ")[0] === n) || "" : "";
const ctrl = id => (store.allCtrl || store.controles).find(c => c.id === id);
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
/* Barème affiché : sur 20 (France), sur 10 (Brésil), pourcentage, lettres A–F (États-Unis). Les calculs restent sur 20. */
const BAREMES = ["20","10","100","AF"];
const bareme = () => BAREMES.includes(S.me?.bareme) ? S.me.bareme : ({en:"AF", "pt-BR":"10"})[document.documentElement.lang] || "20";
const letterOf = p => p >= 90 ? "A" : p >= 80 ? "B" : p >= 70 ? "C" : p >= 60 ? "D" : "F";
const nv = n => { if (n == null || isNaN(n)) return "—"; const b = bareme(); return b === "10" ? fmt(n / 2) : b === "100" ? String(Math.round(n * 5)) : b === "AF" ? letterOf(n * 5) : fmt(n); };
const PCT = () => document.documentElement.lang === "en" ? "%" : " %";
const sfx = () => ({"10":"/10", "100":PCT(), "AF":""})[bareme()] ?? "/20";
const sfxN = n => bareme() === "AF" ? (n == null || isNaN(n) ? "" : ` ${Math.round(n * 5)}${PCT()}`) : sfx();
const noteS = n => n == null || isNaN(n) ? "—" : nv(n) + sfx() + (bareme() === "AF" ? ` (${Math.round(n * 5)}${PCT()})` : "");

/* Serialized writes: one at a time */
let wq = Promise.resolve();
function write(path, data, mode = "set"){
  const run = () => mode === "update" ? DB.doc(path).update(data) : mode === "delete" ? DB.doc(path).delete() : DB.doc(path).set(data);
  const retry = (n) => run().catch(e => { if (n > 0 && e?.code !== "no_access" && e?.code !== "quota_exceeded" && !/403/.test(e?.message || "")) return new Promise(r => setTimeout(r, n === 2 ? 1500 : 4000)).then(() => retry(n - 1)); throw e; });
  SAVE.n++; saveState();
  wq = wq.then(() => retry(2)).then(() => { SAVE.err = false; SAVE.at = Date.now(); })
    .catch(e => { SAVE.err = true; console.error(e); toast(e?.code === "no_access" ? aiErr("no_access") : e?.code === "quota_exceeded" ? "Base pleine : supprime d'anciens contrôles." : "⚠ Pas enregistré : la connexion au serveur a échoué. Vérifie le réseau puis refais la dernière modification.", 9000); })
    .finally(() => { SAVE.n--; saveState(); });
  return wq;
}
/* État de l'enregistrement, affiché dans l'éditeur : Enregistrement… / Enregistré / Échec */
const SAVE = {n:0, err:false, at:0, dirty:false};
let editPending = null, editTimer = null;
function flushEdit(){ clearTimeout(editTimer); editTimer = null; const c = editPending; editPending = null; SAVE.dirty = false; return c ? saveCtrl(c) : Promise.resolve(); }
function saveState(){ const e = document.getElementById("savest"); if (!e) return;
  const busy = SAVE.n > 0 || SAVE.dirty;
  e.className = "savest " + (SAVE.err && !busy ? "bad" : busy ? "busy" : SAVE.at ? "ok" : "");
  e.textContent = SAVE.err && !busy ? "⚠ Échec de l'enregistrement : vérifie ta connexion, puis refais la dernière modification" : busy ? "Enregistrement…" : SAVE.at ? "✓ Enregistré" : "Enregistrement automatique"; }
window.addEventListener("beforeunload", ev => { if (editPending || SAVE.n > 0){ flushEdit(); ev.preventDefault(); ev.returnValue = ""; } });
const saveCtrl = c => { const {id, ...d} = c; return write("controles/" + id, d); };
/* Relecture d'une page : les notes posées par le professeur et les copies validées ne sont jamais écrasées */
function keepTeacherNotes(cp, out){
  const ans = out.answers || {};
  for (const qid of Object.keys(ans)){
    const old = cp?.answers?.[qid];
    if (cp?.validee || old?.valide) delete ans[qid];
    else if (old && old.note != null) delete ans[qid].note;
  }
  if (!cp?.validee) out.validee = false; else delete out.validee;
  return out;
}
/* Élèves retirés (ou classe supprimée) : on efface leurs copies, images, notes, exercices et échantillons d'écriture */
async function purgeStudents(ids){
  const set = new Set(ids); if (!set.size) return;
  const assets = [];
  const grab = v => { if (typeof v === "string"){ if (/^[a-z0-9]{8,40}$/.test(v)) assets.push(v); } else if (Array.isArray(v)) v.forEach(grab); else if (v && typeof v === "object") Object.values(v).forEach(grab); };
  for (const [cid, f] of Object.entries(store.feuilles || {})){
    const copies = f?.copies || {}; if (!Object.keys(copies).some(e => set.has(e))) continue;
    const keep = {}; for (const [e, cp] of Object.entries(copies)){ if (set.has(e)){ grab(cp.scans); for (const a of Object.values(cp.answers || {})) grab(a?.crop); } else keep[e] = cp; }
    const {id, ...rest} = f; await write("feuilles/" + cid, {...rest, copies:keep});
  }
  for (const k of Object.keys(store.quizrep || {})){ const eid = k.slice(k.indexOf("_") + 1); if (set.has(eid)) await write("quizrep/" + k, null, "delete"); }
  for (const eid of set) if (store.ecritures?.[eid]){ grab(store.ecritures[eid].samples); await write("ecritures/" + eid, null, "delete"); }
  const still = new Set(); const keepRef = v => { if (typeof v === "string") still.add(v); else if (Array.isArray(v)) v.forEach(keepRef); else if (v && typeof v === "object") Object.values(v).forEach(keepRef); };
  keepRef(store.feuilles); keepRef(store.ecritures);   // une image encore utilisée ailleurs n'est jamais effacée
  for (const a of [...new Set(assets)]) if (!still.has(a)) fetch("/api/files/" + a, {method:"DELETE", credentials:"same-origin"}).catch(() => {});
}

/* ================= AI ================= */
async function ai(prompt, opts = {}){
  if (!AI) throw {code:"no_ai"};
  return AI.json(prompt, {cache:false, ...opts});
}
async function aiText(prompt, opts = {}){
  if (!AI) throw {code:"no_ai"};
  return (await AI(prompt, {cache:false, ...opts})).text;
}
const NOSRC = "N'invente aucune source, référence ni citation : appuie-toi uniquement sur le cours et le corrigé-type fournis. Recopie tout texte en hébreu exactement comme dans le cours.\nHébreu : écris-le en caractères hébreux, dans l'ordre logique de lecture (de droite à gauche), sans le translittérer, l'inverser ni le traduire ; garde le nikoud (voyelles) et les te'amim seulement s'ils sont dans la source ; respecte les lettres finales (ך ם ן ף ץ).";
const LANGUES = ["Français","Hébreu","Hébreu et français","Anglais","Portugais"];
const langueDef = texte => hebRatio(texte || "") > .3 ? "Hébreu" : document.documentElement.lang === "en" ? "Anglais" : document.documentElement.lang === "pt-BR" ? "Portugais" : "Français";
const langueRule = l => !l ? "" : l === "Hébreu" ? "Langue : rédige tout (titre, énoncés, choix, corrigés, critères, explications) en hébreu." : l === "Hébreu et français" ? "Langue : consignes et explications en français, citations et textes étudiés en hébreu (réponses attendues en hébreu quand la question porte sur le texte)." : `Langue : rédige tout en ${l.toLowerCase()}.`;
/* Hébreu : détection et remise à l'endroit des lignes extraites de PDF en ordre visuel */
const hebRatio = t => { const h = (t.match(/[\u05D0-\u05EA]/g) || []).length, l = (t.match(/[A-Za-zÀ-ÿ]/g) || []).length; return h / Math.max(1, h + l); };
function reverseVisual(line){
  const cl = line.match(/[^\u0591-\u05C7][\u0591-\u05C7]*/gu) || [];
  let r = cl.reverse().join("").replace(/[()[\]{}<>]/g, c => ({"(":")", ")":"(", "[":"]", "]":"[", "{":"}", "}":"{", "<":">", ">":"<"}[c]));
  return r.replace(/[A-Za-z0-9À-ÿ](?:[A-Za-z0-9À-ÿ.,:%\/+=\- ]*[A-Za-z0-9À-ÿ])?/g, m => [...m].reverse().join(""));
}
/* html2canvas ne « miroite » pas les parenthèses en contexte hébreu : on les inverse dans la copie rendue */
const MIRROR = {"(":")", ")":"(", "[":"]", "]":"[", "{":"}", "}":"{", "<":">", ">":"<", "«":"»", "»":"«"};
function fixBidiForCanvas(root){
  const heb = /[\u0590-\u05FF]/, strong = /[\u0590-\u05FFA-Za-zÀ-ÿ]/;
  const w = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT); const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
  for (const n of nodes){ const t = n.nodeValue; if (!heb.test(t) || !/[()[\]{}<>«»]/.test(t)) continue;
    const blk = n.parentElement?.closest("p,div,td,li,span,label") || n.parentElement; const first = (blk?.textContent || "").match(strong)?.[0] || ""; const rtlPara = heb.test(first);
    const chars = [...t]; const side = (i, dir) => { for (let j = i + dir; j >= 0 && j < chars.length; j += dir){ if (strong.test(chars[j])) return heb.test(chars[j]) ? "r" : "l"; } return rtlPara ? "r" : "l"; };
    n.nodeValue = chars.map((c, i) => { if (!MIRROR[c]) return c; const a = side(i, -1), b = side(i, 1); const rtl = a === "r" && b === "r" || ((a === "r" || b === "r") && rtlPara); return rtl ? MIRROR[c] : c; }).join(""); }
}
function fixHebrewText(t){
  return t.normalize("NFC").split("\n").map(line => {
    if (!/[\u05D0-\u05EA]/.test(line)) return line;
    let start = 0, end = 0;
    for (const w of line.match(/[\u05D0-\u05EA][\u0591-\u05C7\u05D0-\u05EA]*/g) || []){ const b = w.replace(/[\u0591-\u05C7]/g, ""); if (b.length < 2) continue; if (/^[ךםןףץ]/.test(b)) start++; if (/[ךםןףץ]$/.test(b)) end++; }
    return start > end ? reverseVisual(line) : line;
  }).join("\n");
}

/* ================= Render loop (keeps focus while data arrives) ================= */
let rq = false, skipped = false;
document.addEventListener("focusout", () => { if (skipped) setTimeout(scheduleRender, 0); });
function scheduleRender(){ if (rq) return; rq = true; requestAnimationFrame(() => { rq = false; render(); }); try { jobsPill(); } catch(e){} }
function render(){
  const a = document.activeElement, keep = a && a.id && $("#view").contains(a) ? {id:a.id, tag:a.tagName, s:a.selectionStart, e:a.selectionEnd, v:a.value, typing: ["INPUT","TEXTAREA"].includes(a.tagName) && !["file","checkbox","radio"].includes(a.type)} : null;
  if (keep?.typing && a.dataset.live !== undefined){ skipped = true; return; } // don't clobber a field being typed
  skipped = false;
  $$(".tab").forEach(t => t.setAttribute("aria-selected", t.dataset.r === navKey()));
  const LOADING = window.TIKOUN_CONFIG?.storage === "server" && !S.auth && (!S.me || typeof DATA_READY === "undefined" || !DATA_READY);
  const V = LOADING ? vLoading : S.auth ? vAuth : (typeof SB !== "undefined" && SB && !SB_USER) ? vLogin : (typeof NEED_CODE !== "undefined" && NEED_CODE) ? vCode : {home:vHome, classes:vClasses, new:vNew, edit:vEdit, scan:vScan, correct:vCorrect, analyse:vAnalyse, suivi:vSuivi, banque:vBanque, direction:vDirection, reglages:vReglages, controles:vControles, exercices:vExercices, quiznew:vQuizNew, quiz:vQuiz, compte:vCompte, comptes:vComptes, entrainement:vEntrainement}[S.view] || vHome;
  $("#tabs").hidden = V === vLogin || V === vCode || V === vAuth || V === vLoading; $("#umenu").hidden = $("#tabs").hidden && !(V === vAuth && S.me);
  { const acc = !!window.TIKOUN_CONFIG?.accounts; const tg = (id, h) => { const e = document.getElementById(id); if (e) e.hidden = h; };
    tg("tabComptes", !isAdmin()); tg("tabIA", !isAdmin()); { const n = (S.users || []).filter(u => u.statut === "en_attente").length, tc = document.getElementById("tabComptes"); if (tc) tc.textContent = n ? `Comptes (${n})` : "Comptes"; $("#ubtn")?.classList.toggle("dot", !!n && isAdmin()); } tg("tabCompte", !(acc && S.me)); tg("tabReglages", acc || !STANDALONE); tg("tabDir", acc && !isBoss()); }
  let html = V();
  const fc = S.inCtrl && ["edit","scan","correct","analyse"].includes(S.view) && V !== vLogin && ctrl(S.inCtrl);
  if (fc){
    if ((S.view === "correct" || S.view === "scan") && fc.statut === "brouillon") html = `<section class="panel empty">Les feuilles ne sont pas encore imprimées. Passe par l'étape « Imprimer ».</section>`;
    html = ctrlFrame(fc, html.replace(/<select id="(corrSel|anSel)"[\s\S]*?<\/select>/, "").replace(/<h2>(Correction|Classe & rattrapage|Scanner les copies)<\/h2>/, "<h3>$1</h3>"));
  }
  $("#view").innerHTML = `<div class="view">${LOCAL ? `<p class="banner">Base de données indisponible : rien n'est sauvegardé. Recharge la page.</p>` : ""}${typeof billBanner === "function" ? billBanner() : ""}${html}</div>`; saveState();
  if (keep){ const el = document.getElementById(keep.id); if (el){ if (keep.typing && el.tagName === keep.tag && el.value !== keep.v) el.value = keep.v; el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch(e){} } }
  if (S.view === "edit" && S.step === "mise-en-page") drawPreview();
  { const sp = $(".stepper"), on = $(".st.on"); if (sp && on) sp.scrollLeft = on.offsetLeft - sp.clientWidth / 2 + on.clientWidth / 2; }
  if (S.view === "correct" && window.MathJax?.typesetPromise){ const v = $("#view"); MathJax.typesetClear?.([v]); MathJax.typesetPromise([v]).catch(() => {}); }
}

const chipStatut = c => { const [l, t] = STATUT[c.statut] || STATUT.brouillon; return `<span class="chip ${t}">${l}</span>`; };
const selOpts = (arr, cur, lab = x => x, val = x => x) => arr.map(x => `<option value="${esc(val(x))}"${val(x) === cur ? " selected" : ""}>${esc(lab(x))}</option>`).join("");

/* ================= HOME ================= */
function vHome(){
  if (!store.classes.length) return `
  <div class="head"><div><h2>Bienvenue sur Mastery</h2><p>Du cours au rattrapage : l'IA prépare et corrige, le professeur décide.</p></div></div>
  <section class="panel grid">
    <div class="grid g3">
      <div><div class="label">1 · Classe</div><p>Crée ta classe et colle la liste des élèves.</p></div>
      <div><div class="label">2 · Contrôle</div><p>Importe le cours (PDF, photo ou texte). L'IA propose un contrôle, en 3 niveaux si tu le souhaites. Tu modifies, puis tu imprimes : une feuille par élève, avec son QR code.</p></div>
      <div><div class="label">3 · Copies</div><p>Photographie ou scanne les copies. Le QR code identifie l'élève. L'IA lit l'écriture et corrige. Tu valides, puis tu vois la classe et crées les rattrapages.</p></div>
    </div>
    <div class="row"><button class="btn primary" data-go="classes">Créer une classe</button><button class="btn" id="demo">Charger une classe de démonstration</button></div>
  </section>`;
  const cs = [...store.controles].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const todo = cs.filter(c => c.statut !== "corrige"), done = cs.filter(c => c.statut === "corrige");
  let aValider = 0; cs.forEach(c => { const f = feuille(c.id); if (f) Object.values(f.copies || {}).forEach(cp => { if (!cp.validee && Object.keys(cp.answers || {}).length) aValider++; }); });
  const line = c => ctrlRow(c, `${esc(c.matiere)} · ${esc(classe(c.classeId)?.nom || "?")}${c.type === "rattrapage" ? " · " + esc(studentsOf(c).map(e => e.prenom + " " + e.nom).join(", ")) : ""}${c.date ? " · " + esc(frDate(c.date)) : ""}`);
  const nEx = cs.filter(c => c.type === "exercices").length, nCtrl = cs.filter(c => !c.type || c.type === "controle").length;
  const hour = new Date().getHours(), hello = hour < 18 ? "Bonjour" : "Bonsoir";
  return `
  <section class="hero-card">
    <div class="hc-main"><div class="hc-kicker">${esc(new Date().toLocaleDateString("fr-FR", {weekday:"long", day:"numeric", month:"long"}))}</div>
      <h2>${hello}${S.me?.nom ? " " + esc(S.me.nom) : ""}</h2>
      <p>${aValider ? `<b>${aValider} ${aValider > 1 ? "copies à valider" : "copie à valider"}</b>` : "Tout est à jour. Prépare ton prochain contrôle ou un quiz d'exercices."}</p>
      <div class="row" style="margin-top:18px"><button class="btn gold" data-newctrl="1">+ Nouveau contrôle</button><button class="btn on-dark" data-newex="1">${canEx() ? "" : "🔒 "}+ Quiz d'exercices</button><button class="btn on-dark" data-go="scan">Scanner des copies</button></div></div>
    <div class="hc-stats">
      <div><b class="num">${store.classes.length}</b><span>Classes</span></div>
      <div><b class="num">${nCtrl}</b><span>Contrôles</span></div>
      <div><b class="num">${myQuizzes().length}</b><span>Quiz d'exercices</span></div>
      <div><b class="num"${aValider ? ' style="color:var(--gold-2)"' : ""}>${aValider}</b><span>Copies à valider</span></div>
    </div>
  </section>
  ${quotaHome()}
  <section class="panel"><h3>En cours</h3><div style="margin-top:4px">${todo.map(line).join("") || `<p class="muted" style="padding:10px 0">Aucun contrôle en cours.</p>`}</div></section>
  ${done.length ? `<section class="panel"><h3>Corrigés</h3><div style="margin-top:4px">${done.map(line).join("")}</div></section>` : ""}`;
}

function quotaHome(){
  const q = S.me?.quota; if (!q || q.illimite || typeof quotaHtml !== "function") return "";
  const left = Math.max(0, q.ctrl - q.used), msg = left === 0 ? "Tu as utilisé tous les contrôles de ton forfait ce mois-ci." : q.used / q.ctrl >= .5 ? (left > 1 ? `Il te reste ${left} contrôles ce mois-ci.` : "Il te reste 1 contrôle ce mois-ci.") : "";
  return `<section class="panel grid" style="gap:10px">${quotaHtml()}${msg ? `<div class="row between banner${left === 0 ? " bad" : ""}"><span>${msg}</span><a class="btn sm" href="#/compte">${left === 0 ? "Ajouter un contrôle ou changer de forfait" : "Voir mon forfait"}</a></div>` : ""}</section>`;
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
        <select id="nc-niv" aria-label="Niveau">${selOpts(NIVEAUX, "3e")}</select>
        <input id="nc-nom" placeholder="Libellé (facultatif) : A, Bleue…" aria-label="Libellé de la classe (facultatif)">
        <button class="btn sm primary" id="nc-go">Créer</button>
      </div>
    </aside>
    ${cl ? `<div class="grid" style="gap:22px;align-content:start"><section class="panel grid">
      <div class="row between"><h3 style="font-size:20px">${esc(cl.nom)} <button class="btn sm ghost" id="rn-cl" style="vertical-align:middle">Renommer</button></h3>
        <div class="row"><select id="lvlMat" style="width:auto" aria-label="Matière">${matOpts(S.levelMat)}</select>
        <button class="btn sm" id="sugg">Suggérer les niveaux</button><button class="btn sm ghost danger" id="del-cl" title="Supprimer cette classe">Supprimer la classe</button></div></div>
      ${sug ? `<div class="banner">Suggestions calculées sur les 3 derniers contrôles validés en ${esc(S.levelMat)} (socle : moins de ${noteS(10)} · standard : ${nv(10)}–${noteS(15)} · approfondi : plus de ${noteS(15)}). <button class="btn sm" id="applySug">Appliquer</button></div>` : ""}
      <div class="tbl-wrap"><table><thead><tr><th>Élève</th><th>Niveau · ${esc(S.levelMat)}</th>${sug ? "<th>Suggestion</th>" : ""}<th>Écriture</th><th></th></tr></thead><tbody>
      ${(cl.eleves || []).map(e => `<tr><td style="white-space:normal;min-width:120px"><b>${esc(e.prenom)} ${esc(e.nom)}</b></td>
        <td><select data-lvl="${e.id}" style="width:auto" aria-label="Niveau de ${esc(e.prenom)}">${selOpts(LEVELS, levelOf(e, S.levelMat), l => LVL[l])}</select></td>
        ${sug ? `<td>${sug[e.id] ? `<span class="lvl ${sug[e.id].lvl}">${LVL[sug[e.id].lvl]}</span> <span class="muted small num">${noteS(sug[e.id].avg)}</span>` : `<span class="muted small">pas de note</span>`}</td>` : ""}
        <td>${(() => { const w = store.ecritures[e.id]; const sc = w?.parUsage?.[usageOf(S.levelMat)] ?? w?.score; return w ? (sc != null ? `<span class="chip ${tone(sc >= .9 ? 1 : sc >= .75 ? .6 : 0)}" title="Lisibilité mesurée sur la fiche d'écriture">${pct(sc)}</span>` : `<span class="chip">fiche reçue</span>`) : `<span class="muted small">—</span>`; })()}</td>
        <td><button class="btn sm ghost" data-rmel="${e.id}" aria-label="Retirer">Retirer</button></td></tr>`).join("") || `<tr><td colspan="4" class="muted">Aucun élève.</td></tr>`}
      </tbody></table></div>
      <div class="field"><label for="add-el">Ajouter des élèves : un par ligne, « Prénom Nom »</label><textarea id="add-el" data-live placeholder="Léa Martin&#10;Hugo Bernard"></textarea></div>
      <div class="row"><button class="btn primary" id="add-go">Ajouter</button></div>
      <div class="grid" style="gap:6px;border-top:1px solid var(--line);padding-top:12px"><div class="row between"><div><b>Fiche d'écriture</b><div class="small muted">À faire remplir en septembre et en janvier (10 min), puis à scanner. Mesure la lisibilité de chaque élève et aide l'IA à relire son écriture.</div></div>
        <button class="btn" id="fiches">Fiches de la classe (PDF)</button></div><div class="status" id="fi-st"></div></div>
    </section>${codesPanel(cl)}</div>` : `<section class="panel empty">Crée ta première classe à gauche.</section>`}
  </div>`;
}

/* ================= NEW CONTROL (wizard) ================= */
function vNew(){
  const st = n => `<span class="step ${S.wizStep === n ? "on" : S.wizStep > n ? "done" : ""}">${n}. ${["Cours","Paramètres","Édition & impression"][n - 1]}</span>`;
  const EXO = S.params.kind === "exercices"; if (S.params.kind === "quiz" && S.wizStep === 1) return `<div class="crumbs small"><a href="#/exercices/nouveau">← Nouveau quiz</a></div><div class="head"><div><h2>Importer un cours</h2><p>Il servira de base au quiz d'exercices.</p></div></div>` + wizCours();
  return `<div class="head"><div><h2>${EXO ? "Nouvelle feuille d'exercices" : "Nouveau contrôle"}</h2><p>${EXO ? "Des exercices d'entraînement tirés du cours, régénérables à volonté, imprimables et corrigés au scan." : "Le cours sert de base. L'IA propose, tu gardes la main sur tout."}</p></div></div>
  <div class="steps">${st(1)}${st(2)}${st(3)}</div>
  ${S.wizStep === 1 ? wizCours() : wizParams()}`;
}
function wizCours(){
  const d = S.coursDraft;
  const list = [...store.cours].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return `
  ${list.length ? `<section class="panel"><h3>Reprendre un cours déjà importé</h3>
    <div style="margin-top:4px">${list.map(c => `<div class="item"><div><div class="t">${esc(c.titre)}</div><div class="s">${esc(c.matiere)} · ${esc(c.niveau)} · ${(c.texte || "").length.toLocaleString("fr-FR")} caractères</div></div>
      <div class="row"><button class="btn sm primary" data-usecours="${c.id}">Utiliser</button><button class="btn sm ghost danger" data-delcours="${c.id}">Supprimer</button></div></div>`).join("")}</div></section>` : ""}
  <section class="panel grid">
    <h3>Importer un cours</h3>
    <div class="form-row">
      <div class="field"><label for="c-titre">Titre du cours</label><input id="c-titre" data-live value="${esc(d?.titre || "")}" placeholder="ex. Fonctions affines"></div>
      ${matField(d?.matiere)}
      <div class="field"><label for="c-niv">Niveau</label><select id="c-niv">${selOpts(NIVEAUX, d?.niveau || "3e")}</select></div>
    </div>
    <label class="drop" for="c-files">Choisir des fichiers : PDF du cours, ou photos / scans des pages<br><span class="small">Plusieurs fichiers possibles</span></label>
    <input id="c-files" type="file" accept="application/pdf,image/*" multiple hidden>
    <div class="status" id="c-st"></div>
    <div class="field"><label for="c-texte">Texte du cours (extrait automatiquement, ou collé ici)</label><textarea id="c-texte" data-live style="min-height:200px">${esc(d?.texte || "")}</textarea></div>
    <div class="row"><button class="btn primary" id="c-save">Enregistrer le cours et continuer</button></div>
  </section>`;
}
/* Matière du cours : choisie toute seule si le prof n'enseigne qu'une matière */
function matField(cur){ const ens = enseigne(); cur = cur || ens[0] || "Mathématiques";
  if (ens.length === 1 && !S.matChg && cur === ens[0]) return `<div class="field"><label>Matière</label><div class="row" style="min-height:40px"><b>${esc(cur)}</b><button class="btn sm ghost" id="c-matchg" type="button">Changer</button></div><input type="hidden" id="c-mat" value="${esc(cur)}"></div>`;
  return `<div class="field"><label for="c-mat">Matière</label><select id="c-mat">${matOpts(cur, S.matChg)}</select></div>`; }
document.addEventListener("click", ev => { if (ev.target.id === "c-matchg"){ S.coursDraft = {...(S.coursDraft || {}), titre:$("#c-titre")?.value, texte:$("#c-texte")?.value}; S.matChg = true; render(); } });
function wizParams(){
  if (!S.params._pref) applyPrefParams();
  const co = store.cours.find(c => c.id === S.coursId);
  const p = S.params;
  p.matiere = co?.matiere || p.matiere || enseigne()[0] || "Mathématiques";
  if (!p.niveau) p.niveau = co?.niveau || "3e";
  if (!p.classeId && store.classes[0]) p.classeId = (store.classes.find(c => c.niveau === p.niveau) || store.classes[0]).id;
  if (p.kind !== "controle") p.kind = "controle";
  const EXO = p.kind === "exercices";
  const T = [["cours","Questions de cours"],["application","Exercices d'application"],["probleme","Problème / rédaction"],["texte","Lecture / explication de texte"],["traduction","Traduction"],["qcm", prefs().q.justif ? "Questions à choix avec justification" : "QCM (corrigés sans IA, gratuit)"]];
  return `
  <section class="panel grid">
    <div class="row between"><div><div class="label">Cours</div><b>${esc(co?.titre || "?")}</b> <span class="muted small">· ${esc(co?.matiere)} · ${esc(co?.niveau)}</span></div><button class="btn sm" id="back1">Changer de cours</button></div>
    <div class="form-row">
      <div class="field"><label for="p-cl">Classe</label><select id="p-cl" data-p="classeId">${store.classes.length ? selOpts(store.classes, p.classeId, c => c.nom, c => c.id) : `<option value="">Crée d'abord une classe</option>`}</select></div>
      <div class="field"><label for="p-niv">Niveau</label><select id="p-niv" data-p="niveau">${selOpts(NIVEAUX, p.niveau)}</select></div>
      <div class="field"><label for="p-dur">Durée (min)</label><input id="p-dur" type="number" min="10" max="240" data-p="duree" value="${esc(p.duree)}"></div>
      <div class="field"><label for="p-nbq">Nombre de questions</label><input id="p-nbq" type="number" min="2" max="10" data-p="nbq" value="${esc(p.nbq)}"></div>
      <div class="field"><label for="p-lang">Langue du contrôle</label><select id="p-lang" data-p="langue">${selOpts(LANGUES, p.langue || langueDef(co?.texte))}</select></div>
      <div class="field"><label for="p-dif">Difficulté</label><select id="p-dif" data-p="difficulte">${selOpts(["facile","moyen","exigeant"], p.difficulte)}</select></div>
    </div>
    ${(() => { const cl = classe(p.classeId), nv = nivOf(cl); return cl && nv && p.niveau && nv !== p.niveau ? `<p class="banner">Attention : le niveau choisi (${esc(p.niveau)}) ne correspond pas à la classe ${esc(cl.nom)}. <button class="btn sm" id="p-niv-cl" data-niv="${esc(nv)}">Utiliser ${esc(nv)}</button></p>` : ""; })()}
    <div class="field"><label>Types de questions</label><div class="row">${T.map(([k, l]) => `<label class="row small" style="gap:6px"><input type="checkbox" data-type="${k}"${p.types.includes(k) ? " checked" : ""}> ${l}</label>`).join("")}</div>${prefs().q.justif ? `<p class="small muted" style="margin:6px 0 0">Questions à choix : les propositions sont dans l'énoncé, avec un cadre pour justifier (corrigé par l'IA). Pour de vrais QCM à cocher, corrigés sans IA, décoche « toujours laisser un cadre pour justifier » dans Mon compte.</p>` : ""}</div>
    <label class="row small" style="gap:6px"><input type="checkbox" id="p-diff"${p.differencie ? " checked" : ""}> Feuilles différenciées : chaque question en 3 niveaux (socle, standard, approfondi), selon le niveau de chaque élève</label>
    <div class="field"><label for="p-cons">Tes consignes à l'IA (facultatif)</label><textarea id="p-cons" data-p="consignes" data-live placeholder="ex. Insister sur la notion d'antécédent. Une question de rédaction à la fin.">${esc(p.consignes)}</textarea></div>
    <div class="row"><button class="btn primary" id="gen" ${store.classes.length ? "" : "disabled"}>${EXO ? "Générer les exercices (IA)" : "Générer le contrôle (IA)"}</button><button class="btn" id="genBlank" ${store.classes.length ? "" : "disabled"}>Partir d'un contrôle vide</button><span class="status" id="gen-st"></span></div>
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
  const partPrep = `  <section class="panel grid">
    <div class="form-row">
      <div class="field"><label for="e-titre">Nom du contrôle (imprimé en haut de la feuille)</label><input id="e-titre" data-c="titre" data-live value="${esc(c.titre)}"></div>
      <div class="field"><label for="e-date">Date</label><input id="e-date" type="date" data-c="date" value="${esc(c.date || "")}"></div>
      <div class="field"><label for="e-dur">Durée (min)</label><input id="e-dur" type="number" data-c="duree" value="${esc(c.duree || "")}"></div>
    </div>
    <label class="row small" style="gap:6px"><input type="checkbox" id="e-diff"${c.differencie ? " checked" : ""}> Feuilles différenciées selon le niveau de chaque élève</label>
  </section>
  <div class="head"><h3>Questions <span class="muted num" style="font-weight:500">· total ${fmt(tot)} pts${tot !== 20 && bareme() === "20" ? " (ramené sur 20)" : ""}</span></h3>
    <div class="row">${c.type === "exercices" ? (canEx() ? `<button class="btn sm primary" id="regenEx">↻ Régénérer les exercices (IA)</button>` : lockChip()) : (!c.type || c.type === "controle") && c.coursId ? `<button class="btn sm primary" id="regenCtrl">↻ Régénérer le contrôle (IA)</button>` + (canEx() ? `<button class="btn sm" data-exfrom="${c.id}">+ Quiz d'exercices sur ce cours</button>` : lockChip()) : ""}<button class="btn sm" id="addQ">+ Question vide</button><button class="btn sm" id="addQcm">+ QCM</button><button class="btn sm" id="addQai">+ Question (IA)</button><button class="btn sm" id="bankOpen">${S.bankOpen ? "Fermer la banque" : "+ Depuis la banque"}</button></div></div>
  ${S.bankOpen ? bankPanel(c) : ""}
  ${(c.questions || []).map((q, i) => qEditor(c, q, i)).join("") || `<div class="panel empty">Aucune question.</div>`}`;
  const partLayout = `  <section class="panel grid">
    <h3>Mise en page</h3>
    <div class="form-row">
      <div class="field"><label for="m-aff">En-tête affiché</label><select id="m-aff" data-m="affiche">${selOpts(Object.keys(AFFICHE), m.affiche || S.me?.affichage || "les2", x => AFFICHE[x])}</select></div>
      <div class="field"><label for="m-ent">Texte d'en-tête libre (facultatif)</label><input id="m-ent" data-m="entete" data-live value="${esc(m.entete && m.entete !== OLD_ENTETE ? m.entete : "")}" placeholder="${esc(headerFrom(m.affiche || S.me?.affichage || "les2"))}"></div>
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
  </section>`;
  const partPrint = `  <section class="panel grid">
    <h3>Impression</h3>
    <p class="muted small">Un PDF pour toute la classe : une feuille par élève, avec son nom et son QR code sur chaque page. Le niveau n'est pas écrit sur la feuille, il est seulement contenu dans le QR code.</p>
    ${scanned ? `<p class="banner">Des copies ont déjà été scannées. Réimprimer garde les scans et les notes existants, mais une mise en page différente peut décaler les questions par page.</p>` : ""}
    <div class="row"><button class="btn primary" id="print">${printed ? "Réimprimer" : "Générer"} les feuilles · ${studs.length} élève(s)</button>
      <button class="btn" id="print1">Feuille de l'élève affiché</button></div>
    <div class="status" id="pr-st"></div>
  </section>`;
  return S.step === "mise-en-page" ? partLayout : S.step === "imprimer" ? partPrint + `<section class="panel grid"><h3>Et ensuite</h3><p class="small muted">Fais passer le contrôle, puis scanne les copies à l'étape suivante. L'ordre des copies n'a pas d'importance.</p></section>` : partPrep;
}
function qEditor(c, q, i){
  const vt = c.differencie ? (S.vtab[q.id] || "standard") : "standard";
  const v = q.v?.[vt] || {enonce:"", corrige:"", criteres:""};
  return `<section class="qed">
    <div class="row between"><b>Question ${i + 1}</b><div class="row">
      <button class="btn sm ghost" data-qup="${i}" ${i ? "" : "disabled"} aria-label="Monter">↑</button>
      <button class="btn sm ghost" data-qdown="${i}" ${i < c.questions.length - 1 ? "" : "disabled"} aria-label="Descendre">↓</button>
      <button class="btn sm ghost danger" data-qdel="${i}">Supprimer</button></div></div>
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
/* QR des feuilles : avec une marge blanche de 2 modules DANS l'image. Sans elle, certains copieurs « mangent » la rangée
   extérieure du code (bord gauche / bas) et plus aucun lecteur ne le reconnaît. Le code garde exactement la même taille. */
function cornerQR(im, text, x, y, z){ const q = qrcode(0, "M"); q.addData(text); q.make(); const n = q.getModuleCount(), Z = z * (n + 4) / n;
  im.src = q.createDataURL(3, 6); im.style.cssText = `left:${x - Z / 2}px;top:${y - Z / 2}px;width:${Z}px;height:${Z}px;image-rendering:pixelated`; }
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
        <div class="sh-school">${esc(enteteOf(c))}</div>
        <div class="sh-title" dir="auto">${esc(c.titre)}</div>
        <div class="sh-meta">${esc(c.matiere)} · ${esc(cl?.nom || "")}${c.date ? " · " + esc(frDate(c.date)) : ""}${c.duree ? " · " + esc(c.duree) + " min" : ""}${m.bareme !== false ? " · noté sur " + fmt(maxOf(c)) : ""}</div>
        <div class="sh-name">Élève : <b>${esc(e.prenom)} ${esc(e.nom)}</b></div>
      </div></div>
      ${(m.consignes ?? "").trim() ? `<div class="sh-cons">${esc(m.consignes)}</div>` : ""}`
      : `<div class="sh-mini">${esc(e.prenom)} ${esc(e.nom)} · ${esc(c.titre)} · page ${n}</div>`;
    for (const [k, [x, y]] of Object.entries(CORNERS)){ const z = CSIZE[k], im = document.createElement("img"); im.className = "sh-corner"; im.alt = "";
      cornerQR(im, k === "tl" ? payload(c.id, e.id, n) : "TK1C|" + k, x, y, z); p.append(im); }
    const foot = document.createElement("div"); foot.className = "sh-foot"; foot.innerHTML = `<span>Mastery · ${esc(c.id)}·${esc(e.id)}</span><span class="pn">page ${n}</span>`; p.append(foot);
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
/* L'aperçu suit la largeur de l'écran (rotation du téléphone, fenêtre redimensionnée) */
let prevW = 0, prevT = 0;
window.addEventListener("resize", () => { clearTimeout(prevT); prevT = setTimeout(() => { const box = $("#preview"); if (!box || S.view !== "edit" || S.step !== "mise-en-page" || box.clientWidth === prevW) return; prevW = box.clientWidth; drawPreview(); }, 150); });
async function printSheets(c, list){
  const st = $("#pr-st");
  if (!window.html2canvas || !window.jspdf){ st.textContent = "Bibliothèques PDF non chargées : recharge la page."; return; }
  if (!list.length){ st.textContent = "Aucun élève dans cette classe."; return; }
  // Forfait : la première impression d'un contrôle utilise un contrôle du mois (réimpression gratuite)
  if (window.TIKOUN_CONFIG?.accounts && S.me){ try { const j = await api("/api/billing/use", {method:"POST", body:JSON.stringify({ctrlId:c.id})}); if (j.quota) S.me.quota = j.quota; }
    catch(e){ if (e.status === 402){ st.innerHTML = `${esc(e.message)} <a class="btn sm primary" href="#/compte">Mon abonnement</a>`; return; } } }
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
        const cv = await html2canvas(pages[i], {scale:2, backgroundColor:"#ffffff", logging:false, scrollX:0, scrollY:-window.scrollY, windowWidth:900, onclone:(doc, el) => fixBidiForCanvas(el)});
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
    else st.textContent = "Téléchargement impossible dans ce navigateur : essaie avec Chrome, Safari ou Firefox à jour.";
  }catch(e){ console.error(e); st.textContent = "Échec de génération du PDF."; }
  finally{ ov.remove(); stage.style.left = "-12000px"; stage.innerHTML = ""; }
}

/* ================= SCAN ================= */
/* Recommencer le scan : efface les pages scannées et les corrections (toute la classe ou un élève), pour tout redéposer */
function resetPanel(printed){
  const done = printed.filter(c => Object.values(feuille(c.id)?.copies || {}).some(cp => Object.keys(cp.scans || {}).length || Object.keys(cp.answers || {}).length));
  if (!done.length) return "";
  const cid = done.some(c => c.id === S.rsCtrl) ? S.rsCtrl : done.some(c => c.id === S.scanCtrl) ? S.scanCtrl : done[0].id; S.rsCtrl = cid; const c = ctrl(cid);
  return `<section class="panel grid"><h3>Recommencer le scan</h3>
    <p class="small muted" style="margin:0">Efface les pages scannées et les corrections déjà faites (y compris celles que tu as validées), puis redépose les copies. Les feuilles imprimées restent valables.</p>
    <div class="row"><select id="rs-ctrl" style="width:auto" aria-label="Contrôle">${selOpts(done, cid, x => x.titre + " · " + (classe(x.classeId)?.nom || ""), x => x.id)}</select>
      <select id="rs-el" style="width:auto" aria-label="Élève"><option value="">Toute la classe</option>${selOpts(studentsOf(c).filter(e => feuille(cid)?.copies?.[e.id]), S.rsEl || "", e => e.prenom + " " + e.nom, e => e.id)}</select>
      <button class="btn" id="rs-go">Effacer et recommencer</button></div></section>`;
}
async function resetScan(cid, eid){
  const c = ctrl(cid), f = feuille(cid); if (!c || !f) return;
  const who = eid ? (studentsOf(c).find(e => e.id === eid) || {}) : null;
  if (!confirm(who ? `Effacer le scan et la correction de ${who.prenom} ${who.nom} pour « ${c.titre} » ?` : `Effacer tous les scans et toutes les corrections de « ${c.titre} » ? Les notes déjà validées seront aussi effacées.`)) return;
  try { await api("/api/jobs/cancel", {method:"POST", body:JSON.stringify({ctrlId:cid, eleveId:eid || ""})}); } catch(e){}
  const doc = structuredClone(f); delete doc.owner; delete doc.espace; delete doc.id;
  for (const [k, cp] of Object.entries(doc.copies || {})){ if (eid && k !== eid) continue;
    for (const x of ["scans", "answers", "validee", "bonusPages", "bonusProf"]) delete cp[x]; }
  await write("feuilles/" + cid, doc);
  if (!eid && c.statut !== "imprime" && c.statut !== "brouillon"){ c.statut = "imprime"; await saveCtrl(c); }
  S.queue = S.queue.filter(x => x.ctrlId !== cid || (eid && x.eleveId !== eid));
  toast(who ? "Copie remise à zéro : redépose ses pages." : "Contrôle remis à zéro : redépose les copies.", 5000); render();
}
function vScan(){
  const printed = store.controles.filter(c => c.statut !== "brouillon");
  return `
  <div class="head"><div><h2>Scanner les copies</h2><p>Photos prises au téléphone ou PDF du copieur, dans n'importe quel ordre. Le QR code retrouve l'élève et la page. Chaque page est ensuite lue et corrigée par l'IA.</p></div></div>
  <section class="panel grid">
    <label class="drop" for="sc-files">Choisir des photos ou un PDF de copies<br><span class="small">Page bien à plat, entière, avec le QR code visible</span></label>
    <input id="sc-files" type="file" accept="image/*,application/pdf" multiple hidden>
    ${!AI ? `<p class="banner">L'IA n'est pas disponible dans cette vue : les QR codes seront lus, mais pas les réponses.</p>` : ""}
    ${!printed.length ? `<p class="muted small">Aucun contrôle imprimé pour l'instant.</p>` : ""}
  </section>
  ${resetPanel(printed)}
  ${S.queue.length ? `<section class="panel"><div class="row between"><h3>File de traitement</h3><button class="btn sm ghost" id="qclear">Vider la liste</button></div>
    <div class="queue" style="margin-top:6px">${S.queue.map(qItem).join("")}</div></section>` : ""}`;
}
function qItem(it){
  const c = it.ctrlId && ctrl(it.ctrlId), e = c && eleveOf(c, it.eleveId);
  const chip = {attente:["En attente",""], qr:["Lecture du QR…","blue"], lecture:["Lecture et correction…","blue"], ok:["Corrigée","ok"], manuel:["QR non lu","warn"], erreur:["Erreur","bad"], serveur:["Correction sur le serveur","blue"], envoi:["Envoi…","blue"], lot:["Sur le serveur","blue"]}[it.status];
  if (it.lot && it.status === "manuel") chip[0] = "À reprendre";
  const printed = store.controles.filter(x => x.statut !== "brouillon");
  return `<div class="qi">${it.thumb ? `<img alt="" src="${it.thumb}">` : `<div style="width:48px;height:64px;border:1px solid var(--line);border-radius:6px;display:grid;place-items:center;font-size:20px" aria-hidden="true">📄</div>`}<div><div class="t"><b>${it.label ? esc(it.label) : e ? esc(e.prenom + " " + e.nom) : esc(it.name)}</b>${c ? ` <span class="muted small">· ${esc(c.titre)} · p. ${it.page}</span>` : ""}</div>
    <div class="small ${it.status === "erreur" ? "err" : "muted"}">${esc(it.msg || "")}</div>
    ${it.lot && it.status === "envoi" ? `<div class="bar" style="margin-top:6px;height:4px;background:var(--line);border-radius:4px;overflow:hidden"><i style="display:block;height:100%;width:${it.pct || 0}%;background:var(--gold,#B7862B)"></i></div>` : ""}
    ${it.status === "manuel" && !it.lot ? `<div class="row" style="margin-top:6px">
      <select data-mq="${it.id}" data-f="ctrlId" style="width:auto" aria-label="Contrôle"><option value="">Contrôle…</option>${selOpts(printed, it.ctrlId || "", x => x.titre + " · " + (classe(x.classeId)?.nom || ""), x => x.id)}</select>
      ${c ? `<select data-mq="${it.id}" data-f="eleveId" style="width:auto" aria-label="Élève"><option value="">Élève…</option>${selOpts(studentsOf(c), it.eleveId || "", x => x.prenom + " " + x.nom, x => x.id)}</select>` : ""}
      <select data-mq="${it.id}" data-f="page" style="width:auto" aria-label="Page">${selOpts(Array.from({length:Math.max(4, ...Object.values(feuille(it.ctrlId)?.copies || {}).map(cp => (cp.pages || []).length))}, (_, i) => String(i + 1)), String(it.page || 1), x => "page " + x)}</select>
      <button class="btn sm primary" data-mgo="${it.id}" ${c && it.eleveId ? "" : "disabled"}>Traiter</button></div>` : ""}
  </div><div class="row">${chip ? `<span class="chip ${chip[1]}">${chip[0]}</span>` : ""}${it.status === "ok" && it.ctrlId ? `<button class="btn sm" data-corr="${it.ctrlId}" data-el="${it.eleveId}">Voir</button>` : ""}${it.status === "erreur" && !it.lot ? `<button class="btn sm" data-retry="${it.id}">Relancer</button>` : ""}${it.lotFix ? `<button class="btn sm primary" data-lotfix="${it.lotFix}">Reprendre ici</button>` : ""}</div></div>`;
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
/* Lecture des QR codes (QR de l'élève + 4 petits carrés de repère dans les coins).
   Photos de téléphone : ombres, flou, feuille petite dans l'image. On essaie donc, dans l'ordre :
   le lecteur natif du navigateur (bien plus robuste), puis jsQR sur plusieurs fenêtres, tailles et
   une version « éclairage corrigé » de l'image (ombre retirée, contraste renforcé). */
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
let NATIVE_QR;
async function nativeQR(cv){
  try {
    if (NATIVE_QR === undefined) NATIVE_QR = ("BarcodeDetector" in window && (await BarcodeDetector.getSupportedFormats()).includes("qr_code")) ? new BarcodeDetector({formats:["qr_code"]}) : null;
    if (!NATIVE_QR) return [];
    const out = [];
    for (const side of [2000, 1300]){
      const c = scaled(cv, side), k = cv.width / c.width;
      for (const r of await NATIVE_QR.detect(c)){ if (!/^TK1/.test(r.rawValue) || out.some(f => f.data === r.rawValue)) continue;
        const pts = r.cornerPoints || []; if (pts.length < 4) continue;
        out.push({data:r.rawValue, x:k * pts.reduce((a, q) => a + q.x, 0) / 4, y:k * pts.reduce((a, q) => a + q.y, 0) / 4}); }
      if (out.filter(f => f.data.startsWith("TK1C|")).length >= 3) break;
    }
    return out;
  } catch(e){ NATIVE_QR = null; return []; }
}
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
/* ---------- Secours quand les QR ne se lisent pas (scan de copieur très compressé) ----------
   1) Repères : on cherche les 4 carrés noirs dans les coins (zone sombre entourée de blanc) pour redresser la page.
   2) Identité : on lit la ligne imprimée en bas de page « Mastery · contrôle·élève … page 1 / 3 ». */
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
/* Garde-fou : les 4 repères doivent dessiner le rectangle attendu (sinon on n'utilise pas les carrés trouvés) */
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
const FOOTER_PROMPT = `Image : bas d'une feuille imprimée. Recopie exactement la ligne qui commence par « Mastery » (deux codes de lettres minuscules et chiffres séparés par un point) et le numéro de page « page X / Y ». Attention aux confusions l/1, o/0, q/g. Dans "page", mets seulement le nombre X (un entier). Réponds uniquement en JSON : {"ligne":"…","page":1}`;
async function footerId(cv){
  if (!AI) return null;
  const W = cv.width, H = cv.height, strip = crop(cv, 0, H * 0.9, W, H * 0.1);
  try {
    const r = await ai(FOOTER_PROMPT, {images:[await toBlob(scaled(strip, 1600), .9)], modelTier:"quick"});
    const m = String(r?.ligne || "").toLowerCase().replace(/\s+/g, "").match(/([a-z0-9]{8,16})[·.•:\-|,]+([a-z0-9]{5,12})/); if (!m) return null;
    const cid = closest(m[1], store.controles.map(c => c.id)); if (!cid) return null;
    const eid = closest(m[2], Object.keys(feuille(cid)?.copies || {})); if (!eid) return null;
    /* « page 2 / 3 » : on prend le premier nombre (avant, « 2 / 3 » donnait la page 1 par erreur) */
    const pn = +((String(r.page ?? "").match(/\d+/) || [])[0] || (String(r.ligne || "").match(/page\s*(\d+)/i) || [])[1] || 0);
    const nP = (feuille(cid)?.copies?.[eid]?.pages || []).length || 1;
    return `TK1|${cid}|${eid}|${pn >= 1 && pn <= nP ? pn : 0}`;
  } catch(e){ S.footErr = e?.message || aiErr(e?.code); console.warn("Bas de page", e); return null; }
}
/* Vérifie que les cadres attendus sont bien là où on va découper : on cherche leur bordure noire imprimée.
   Sert à choisir la bonne page de la copie et à refuser un redressement faux. */
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
/* Confidentialité : avant d'envoyer une page entière à l'IA, on masque l'en-tête (nom de l'élève, classe, école) */
function maskHeader(cv, H, boxes){
  const top = Math.max(0, Math.min(...boxes.map(b => b.y)) - 6);
  const o = document.createElement("canvas"); o.width = cv.width; o.height = cv.height; const g = o.getContext("2d"); g.drawImage(cv, 0, 0);
  if (!isFinite(top) || top <= 0) return o;
  const pts = [[-40, -40], [834, -40], [834, top], [-40, top]].map(([x, y]) => applyH(H, x, y));
  g.fillStyle = "#fff"; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fill(); return o;
}
/* Sans repères, on ne peut pas situer l'en-tête exactement : on blanchit le haut de la première page (nom de l'élève) */
function maskTop(cv, page){
  const o = document.createElement("canvas"); o.width = cv.width; o.height = cv.height; const g = o.getContext("2d"); g.drawImage(cv, 0, 0);
  if (+page === 1 || !page){ g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, Math.round(cv.height * 0.22)); } return o;
}
function inkRatio(cv, H, b){ /* part de pixels foncés dans le cadre (lignes grises et bordure exclues) */
  const d = pix(cv), SW = cv.width, SH = cv.height; let dark = 0, n = 0;
  for (let j = 0; j < 24; j++) for (let i = 0; i < 80; i++){
    const [x, y] = applyH(H, b.x + b.w * (0.04 + 0.92 * i / 79), b.y + b.h * (0.06 + 0.88 * j / 23)); const X = x | 0, Y = y | 0;
    if (X < 0 || Y < 0 || X >= SW || Y >= SH) continue; const o = (Y * SW + X) * 4; n++; if (0.3 * d[o] + 0.59 * d[o + 1] + 0.11 * d[o + 2] < 110) dark++; }
  return n ? dark / n : 1;
}
/* Garde-fou : une réponse sans contenu vaut 0, quoi qu'en dise l'IA */
const NO_ANSWER = /^\s*(je\s*(ne)?\s*sais\s*pas|j'?\s*sais\s*pas|jsp|aucune\s*id[ée]e|pas\s*d'?\s*id[ée]e|je\s*n'?\s*ai\s*pas\s*compris|rien|néant|\?+|-+|\.+|x)\s*[.!?]*\s*$/i;
const isNoAnswer = t => !String(t || "").replace(/\[illisible\]/g, "").replace(/\$/g, "").trim() || NO_ANSWER.test(String(t).replace(/\$/g, ""));
function markFautes(t, fautes){ let out = t; for (const f of (Array.isArray(fautes) ? fautes : []).map(String).filter(x => x.trim()).slice(0, 8)){ const i = out.indexOf(f); if (i >= 0 && !out.slice(0, i).endsWith("⟦")) out = out.slice(0, i) + "⟦" + f + "⟧" + out.slice(i + f.length); } return out; }
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
/* Pages d'un fichier SANS les garder toutes en mémoire : chaque page n'est dessinée en grand qu'au moment d'être lue,
   puis libérée. Un PDF de 20 contrôles (40 pages et plus) ne fait plus planter le navigateur. */
async function pdfPage(pdf, i, side){ const pg = await pdf.getPage(i); const vp = pg.getViewport({scale: side / Math.max(pg.view[2], pg.view[3])});
  const cv = document.createElement("canvas"); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height); await pg.render({canvasContext:cv.getContext("2d"), viewport:vp}).promise; pg.cleanup(); return cv; }
async function lazyPages(file){
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)){
    const pdf = await pdfjsLib.getDocument({data: await file.arrayBuffer()}).promise, out = [], src = {qrBad:0};
    for (let i = 1; i <= pdf.numPages; i++){ let thumb = ""; try { thumb = (await pdfPage(pdf, i, 120)).toDataURL("image/jpeg", .6); } catch(e){}
      out.push({n:pdf.numPages, i, thumb, src, load:() => pdfPage(pdf, i, 2000)}); }
    return out;
  }
  const cv = (await fileToCanvases(file))[0]; const thumb = scaled(cv, 160).toDataURL("image/jpeg", .7);
  return [{n:1, i:1, thumb, load:async () => (await fileToCanvases(file))[0]}];
}
async function addScans(files){
  if (lotsOn()){ for (const f of files) await uploadLot(f); return; }
  let n = 0;
  for (const f of files){
    let pages; try { pages = await lazyPages(f); } catch(e){ S.queue.push({id:uid(), name:f.name, thumb:"", status:"erreur", msg:"Fichier illisible."}); continue; }
    pages.forEach(pg => S.queue.push({id:uid(), name:f.name + (pg.n > 1 ? " · p." + pg.i : ""), load:pg.load, src:pg.src, thumb:pg.thumb, status:"attente", msg:""})); n += pages.length;
    scheduleRender();
  }
  if (n > 1) toast(n + " pages ajoutées : elles sont lues une par une.", 4000);
  render(); runQueue();
}
async function pageCv(it){ if (!it.cv && it.load) it.cv = await it.load(); return it.cv; }
/* iPhone/iPad : la mémoire d'un canvas n'est rendue qu'en le ramenant à 0 × 0 */
const freeCv = it => { if (!it.load || !it.cv) return; try { it.cv._d = null; it.cv.width = it.cv.height = 0; } catch(e){} it.cv = null; };
async function runQueue(){
  if (S.queueRunning) return; S.queueRunning = true;
  try{
    let it;
    while ((it = S.queue.find(x => x.status === "attente"))){
      it.status = "qr"; it.msg = ""; scheduleRender();
      try { await pageCv(it); } catch(e){ it.status = "erreur"; it.msg = "Page illisible."; continue; }
      if (!it.cv){ it.status = "erreur"; it.msg = "Image perdue : ajoute la photo à nouveau."; continue; }
      let data = null;
      /* Même fichier dont les QR précédents étaient illisibles : on lit directement le bas de page (bien plus rapide) */
      if (it.src?.qrBad >= 2){ it.msg = "Lecture du bas de page…"; scheduleRender(); data = await footerId(it.cv); if (data){ it.found = []; it.viaPied = true; } }
      if (!data){ it.found = await detectAll(it.cv);
        data = it.found.find(f => /^TK1W?\|/.test(f.data))?.data || readQR(it.cv);
        if (data){ if (it.src) it.src.qrBad = 0; }
        else { it.msg = "QR illisible : lecture du bas de page…"; scheduleRender(); data = await footerId(it.cv); if (data){ it.viaPied = true; if (it.src) it.src.qrBad++; } } }
      if (!data){ freeCv(it); it.status = "manuel"; it.msg = (S.footErr ? "IA indisponible pour lire le bas de page (" + S.footErr + "). " : "") + "Choisis le contrôle, l'élève et la page, ou reprends la photo avec le QR code bien net."; S.footErr = null; if (it.inbox){ const m = INBOX_ITEMS[it.inbox]; if (m) m.manuel = true; inboxPage(it, true); } scheduleRender(); continue; }
      if (data.startsWith("TK1W|")){ if (it.inbox && !classe(data.split("|")[1])){ S.queue = S.queue.filter(x => x !== it); inboxPage(it, false); continue; } await processWriting(it, data); freeCv(it); if (it.inbox) inboxPage(it, true); continue; }
      const [, cid, eid, p] = data.split("|"); it.ctrlId = cid; it.eleveId = eid; it.page = +p || 0;
      if (it.inbox && !ctrl(cid)){ S.queue = S.queue.filter(x => x !== it); inboxPage(it, false); continue; }
      await processPage(it); freeCv(it); if (it.inbox) inboxPage(it, true);
    }
  } finally { S.queueRunning = false; scheduleRender(); }
}
async function processPage(it){
  const c = ctrl(it.ctrlId), f = feuille(it.ctrlId), cp = f?.copies?.[it.eleveId];
  if (!c){ it.status = "erreur"; it.msg = "Contrôle introuvable (supprimé ?)."; return scheduleRender(); }
  if (!cp){ it.status = "erreur"; it.msg = "Feuille de cet élève non trouvée : réimprime les feuilles depuis l'onglet du contrôle."; return scheduleRender(); }
  let pg = cp.pages?.[it.page - 1], qids = pageQ(pg), boxes = pg?.b || [];
  if (!qids.length && !(it.page === 0 && cp.pages?.length)){ it.status = "erreur"; it.msg = "Aucune question attendue sur cette page."; return scheduleRender(); }
  it.status = "lecture"; it.msg = "Envoi de l'image…"; scheduleRender();
  try{
    await pageCv(it); if (!it.cv){ it.status = "erreur"; it.msg = "Image perdue : ajoute la photo à nouveau."; return scheduleRender(); }
    const upd = {copies:{[it.eleveId]:{scans:{}, answers:{}}}};
    if (ASSETS){ try { const a = await ASSETS.upload(await toBlob(scaled(it.cv, 1700), .8)); upd.copies[it.eleveId].scans[it.page] = {asset:a.id, url:a.url, at:new Date().toISOString()}; } catch(e){ console.warn("asset", e); } }
    if (!AI){ it.status = "erreur"; it.msg = "QR lu, mais l'IA n'est pas disponible pour lire les réponses."; if (Object.keys(upd.copies[it.eleveId].scans).length) await write("feuilles/" + c.id, upd, "update"); return scheduleRender(); }
    it.msg = "Lecture de l'écriture et correction (30 s à 1 min)…"; scheduleRender();
    let fnd = it.found || await detectAll(it.cv);
    const have = fnd.map(f => /^TK1W?\|/.test(f.data) ? "tl" : f.data.startsWith("TK1C|") ? f.data.slice(5) : "").filter(Boolean);
    if ((boxes.length || cp.pages?.some(p => p?.b?.length)) && have.length < 4){ const extra = blobMarkers(it.cv, have), all = fnd.concat(extra); if (extra.length && markersOk(all)) fnd = all; }
    let Hm = sheetToPhoto(fnd);
    /* Bonne page ? On compare la position des cadres de chaque page de la copie avec ce qu'on voit sur l'image */
    if (Hm && cp.pages?.length){
      const sc = cp.pages.map(p => (p?.b || []).length ? boxScore(it.cv, Hm, p.b) : 0);
      let best = it.page >= 1 ? it.page : 1; sc.forEach((v, i) => { if (v > sc[best - 1] + 0.1 || (it.page === 0 && v > sc[best - 1])) best = i + 1; });
      if (best !== it.page){ console.warn("Page corrigée", it.page, "→", best, sc); it.page = best; pg = cp.pages[best - 1]; qids = pageQ(pg); boxes = pg?.b || []; }
      if (sc[it.page - 1] < 0.45){ console.warn("Cadres non retrouvés sur l'image", sc); Hm = null; } }
    if (it.page < 1 || !qids.length){ it.status = "manuel"; it.msg = "Page de la copie non reconnue : choisis-la puis clique sur Traiter."; it.page = it.page || 1; return scheduleRender(); }
    if (!boxes.length) Hm = null;
    const maxImg = LIM?.images?.maxCount || 1;
    const qcmB = Hm ? boxes.filter(b => b.type === "qcm") : [];
    let aiQ = qids.filter(id => !qcmB.some(b => b.q === id));
    /* Économie : un cadre vide n'est pas envoyé à l'IA */
    const blank = new Set(Hm ? boxes.filter(b => b.type !== "qcm" && aiQ.includes(b.q) && inkRatio(it.cv, Hm, b) < 0.0008).map(b => b.q) : []);
    aiQ = aiQ.filter(id => !blank.has(id));
    let arr = [], crops = {}, bon = null, marks = {};
    for (const qb of blank){ const b = boxes.find(x => x.q === qb); if (b) crops[qb] = warpBox(it.cv, Hm, b); }
    for (const b of qcmB){ marks[b.q] = readMarks(it.cv, Hm, b); crops[b.q] = warpBox(it.cv, Hm, b); }
    const aiB = boxes.filter(b => aiQ.includes(b.q));
    const cropMode = Hm && aiB.length && aiB.length <= Math.max(1, maxImg);
    if (cropMode) for (const b of aiB) crops[b.q] = warpBox(it.cv, Hm, b);
    if (ASSETS){ for (const k in crops){ try { const a = await ASSETS.upload(await toBlob(crops[k], .88)); crops[k].asset = a.id; } catch(e){} } }
    const localAns = qid => { const q = c.questions.find(x => x.id === qid); if (!q) return null; const ver = cp.version?.[qid] || "standard";
      if (blank.has(qid)) return {transcription:"", annot:"", lisible:true, noteIA:0, note:null, commentaire:"Pas de réponse.", erreurs:["pas de réponse"], acquis:[], valide:false, auto:true};
      if (marks[qid]) return qcmAnswer(q, ver, marks[qid].coches, marks[qid].ambigu); return null; };
    /* Correction confiée au serveur : elle continue même si on quitte la page ou l'application */
    if (aiQ.length && jobsOn()){
      try {
        let images = [], mode;
        if (cropMode){ const aiB2 = aiB.filter(b => aiQ.includes(b.q)); if (aiB2.some(b => !crops[b.q]?.asset)) throw new Error("crop"); images = aiB2.map(b => crops[b.q].asset); mode = "crops"; }
        else { const big = scaled(Hm ? maskHeader(it.cv, Hm, boxes) : maskTop(it.cv, it.page), 2200), W = big.width, H = big.height, many = maxImg >= 2;
          const blobs = many ? [await toBlob(crop(big, 0, 0, W, H * 0.56)), await toBlob(crop(big, 0, H * 0.44, W, H * 0.56))] : [await toBlob(big)];
          for (const bl of blobs) images.push((await ASSETS.upload(bl)).id); mode = many ? "halves" : "page"; }
        const qs = aiQ.map(qid => { const q = c.questions.find(x => x.id === qid); if (!q) return null; const ver = cp.version?.[qid] || "standard";
          return {id:qid, points:+q.points, type:q.type === "qcm" ? "qcm" : "", good:vOf(q, ver).bonnes || [], notion:q.notion || "", crop:crops[qid]?.asset || null}; }).filter(Boolean);
        for (const qid of qids){ if (aiQ.includes(qid)) continue; const a = localAns(qid); if (a){ a.crop = crops[qid]?.asset || null; upd.copies[it.eleveId].answers[qid] = a; } }
        keepTeacherNotes(cp, upd.copies[it.eleveId]);
        await write("feuilles/" + c.id, upd, "update");
        if (c.statut === "imprime"){ c.statut = "correction"; await saveCtrl(c); }
        const j = await api("/api/jobs", {method:"POST", body:JSON.stringify({ctrlId:c.id, eleveId:it.eleveId, page:it.page, name:it.name, prompt:gradePrompt(c, cp, aiQ, mode) + JSON_ONLY, images, qs, bonus:!!bonusMax(c), txt:jobTxt()})});
        it.status = "serveur"; it.jobId = j.id; it.msg = "Page prête : la correction continue sur le serveur, tu peux quitter l'application."; if (it.load) freeCv(it); else it.cv = null;
        watchJobs(); return scheduleRender();
      } catch(e){ console.warn("Tâche serveur impossible, correction ici", e); }
    }
    if (aiQ.length){
      if (!AI){ it.status = "erreur"; it.msg = "QR lu, mais l'IA n'est pas disponible pour lire les réponses rédigées."; await write("feuilles/" + c.id, upd, "update"); return scheduleRender(); }
      it.msg = cropMode ? "Lecture des " + aiQ.length + " cadre(s) découpés et correction…" : "Lecture de la page et correction (30 s à 1 min)…"; scheduleRender();
      if (cropMode){
        const aiB2 = aiB.filter(b => aiQ.includes(b.q));
        const res = await ai(gradePrompt(c, cp, aiQ, "crops"), {images: await Promise.all(aiB2.map(b => toBlob(crops[b.q], .88))), modelTier:"complex"});
        arr = Array.isArray(res?.reponses) ? res.reponses : []; bon = res;
      } else {
        const big = scaled(Hm ? maskHeader(it.cv, Hm, boxes) : maskTop(it.cv, it.page), 2200), W = big.width, H = big.height;
        const many = maxImg >= 2;
        const imgs = many ? [await toBlob(crop(big, 0, 0, W, H * 0.56)), await toBlob(crop(big, 0, H * 0.44, W, H * 0.56))] : [await toBlob(big)];
        const res = await ai(gradePrompt(c, cp, aiQ, many ? "halves" : "page"), {images:imgs, modelTier:"complex"});
        arr = Array.isArray(res?.reponses) ? res.reponses : Array.isArray(res) ? res : []; bon = res;
      }
      if (bonusMax(c)) upd.copies[it.eleveId].bonusPages = {[it.page]:{proprete:clamp(+bon?.proprete || 0, 0, 1), orthographe:clamp(+bon?.orthographe || 0, 0, 1)}};
    }
    const missing = [];
    for (const qid of qids){
      const q = c.questions.find(x => x.id === qid); if (!q) continue;
      const ver = cp.version?.[qid] || "standard";
      const r0 = arr.find(x => String(x?.id) === String(qid)), r = r0 || {};
      let ans = localAns(qid);
      /* Question absente de la réponse de l'IA : jamais de 0 automatique, elle reste « à relire » */
      if (!ans && !r0 && aiQ.includes(qid)){ missing.push(qid); continue; }
      if (ans);
      else if (q.type === "qcm") ans = qcmAnswer(q, ver, (r.coches || []).map(Number), r.lisible === false);
      else ans = {transcription:String(r.transcription ?? ""), transcriptionIA:String(r.transcription ?? ""), annot:r.annotee != null ? String(r.annotee) : markFautes(String(r.transcription ?? ""), r.fautes), lisible:r.lisible !== false,
        noteIA:clamp(half(Number(r.note) || 0), 0, +q.points), note:null, commentaire:String(r.commentaire ?? ""), erreurs:(r.erreurs || []).map(String).slice(0, 4), acquis:(r.acquis || []).map(String).slice(0, 4), valide:false};
      if (!ans.auto && isNoAnswer(ans.transcription)){ ans.noteIA = 0; ans.commentaire = "Pas de réponse : revois cette notion."; ans.erreurs = ["pas de réponse"]; ans.acquis = []; }
      ans.crop = crops[qid]?.asset || null;
      upd.copies[it.eleveId].answers[qid] = ans;
    }
    keepTeacherNotes(cp, upd.copies[it.eleveId]);
    await write("feuilles/" + c.id, upd, "update");
    if (c.statut === "imprime"){ c.statut = "correction"; await saveCtrl(c); }
    it.status = missing.length ? "erreur" : "ok"; it.msg = (missing.length ? `${missing.length} question(s) non lue(s) par l'IA : relance la page ou recadre-les dans la correction. ` : "") + `${qids.length - missing.length} question(s) lue(s)${qcmB.length ? ` · ${qcmB.length} QCM sans IA` : ""}${Hm ? " · cadres découpés" : " · page entière (repères non trouvés)"}` + (arr.some(r => r.lisible === false) ? " · passage peu lisible signalé" : ""); if (it.load) freeCv(it); else it.cv = null;
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
${lectureTips()}
Consignes :
1. Transcris fidèlement ce que l'élève a écrit dans chaque cadre, sans corriger l'orthographe, ligne par ligne. ${MATH_RULE} Hébreu en caractères hébreux, dans l'ordre de lecture (l'écriture manuscrite hébraïque est souvent cursive : lis-la avec soin, lettre par lettre). Passage illisible : [illisible]. Cadre vide : "". Ignore ce qui est barré.
2. "fautes" : liste des passages erronés, recopiés exactement tels qu'ils figurent dans la transcription (courts : quelques mots). Liste vide si tout est juste.
3. Note par pas de 0,5, strictement selon les critères : chaque demi-point doit correspondre à un élément juste réellement écrit par l'élève. Jamais de point « d'encouragement ». Réponse vide, « je ne sais pas », « ? », énoncé recopié, hors sujet ou sans aucun élément juste = 0.
4. "commentaire" : 1 ou 2 phrases courtes (40 mots maximum), tutoiement, bienveillant : ce qui est réussi, puis l'erreur précise et comment la corriger.
5. "erreurs" : choisis dans les erreurs types (texte exact) ; sinon une étiquette de 2 à 5 mots. "acquis" : 1 à 3 étiquettes courtes.
6. "lisible" : false si tu as dû deviner une partie importante de la réponse.
7. ${NOSRC}
${bm ? `8. Donne aussi pour la page "proprete" (0 à 1 : lisibilité, soin, ratures) et "orthographe" (0 à 1 : 1 = aucune faute).\n` : ""}Réponds uniquement en JSON : {"reponses":[{"id":"…","transcription":"…","fautes":["…"],"lisible":true,"note":0,"commentaire":"…","erreurs":["…"],"acquis":["…"],"coches":[]}]${bm ? ',"proprete":1,"orthographe":1' : ""}}`;
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
    <select id="corrSel" style="max-width:440px" aria-label="Contrôle">${selOpts(list, c.id, x => (x.type === "rattrapage" ? "Rattrapage · " : x.type === "exercices" ? "Exercices · " : "") + x.titre + " · " + (classe(x.classeId)?.nom || ""), x => x.id)}</select></div>
  <div class="seg" role="tablist"><button data-cmode="copie" aria-pressed="${S.corrMode !== "question"}">Par copie</button><button data-cmode="question" aria-pressed="${S.corrMode === "question"}">Par question (toute la classe)</button></div>
  ${S.corrMode === "question" ? vByQuestion(c, f, studs) : `<div class="split">
    <aside class="panel" style="padding:8px">
      <div class="row between" style="padding:4px 8px 8px"><span class="label">Copies</span>
        ${nAlert ? `<button class="btn sm" id="valAll">Valider les ${nAlert} sans alerte</button>` : ""}</div>
      ${studs.map(x => { const k = f.copies[x.id]; const n = k ? Object.keys(k.answers || {}).length : 0; const done = copyDone(c, k); const warn = k && Object.values(k.answers || {}).some(a => !a.lisible);
        return `<button class="stu" data-cel="${x.id}" aria-current="${x.id === S.corrEleve}"><span>${esc(x.prenom)} ${esc(x.nom)}</span><span class="row" style="gap:6px">
        ${!n ? `<span class="chip">non scannée</span>` : done ? `<span class="num">${noteS(final20(c, k))}</span>${k.validee ? `<span class="chip ok">✓</span>` : `<span class="chip ${warn ? "bad" : "warn"}">${warn ? "à vérifier" : "à valider"}</span>`}` : `<span class="chip warn">${n}/${c.questions.length} q.</span>`}</span></button>`; }).join("")}
      <div style="padding:10px 8px 4px;border-top:1px solid var(--line);margin-top:6px" class="row"><button class="btn sm" id="csv">Exporter les notes (CSV)</button><button class="btn sm" id="renduAll">Copies rendues de la classe (PDF)</button></div>
    </aside>
    ${e ? copyView(c, e, cp, studs) : `<div class="panel empty">Aucun élève.</div>`}
  </div>`}`;
}
/* Note : boutons rapides (0, moitié, tout) + saisie libre, faciles à toucher sur téléphone */
function scoreCtl(q, a, eid, k){
  const n = noteOf(a), P = +q.points, opts = [...new Set([0, half(P / 2), P])];
  return `<div class="score">${opts.map(v => `<button class="qs${n === v ? " on" : ""}" data-qset="${v}" data-q="${q.id}" data-eid="${eid}" aria-label="${fmt(v)} point(s)">${fmt(v)}</button>`).join("")}
    <input type="number" inputmode="decimal" min="0" max="${q.points}" step="0.5" data-score="${q.id}" data-eid="${eid}" value="${n ?? ""}" aria-label="Note question ${k + 1}"><span class="den">/${fmt(P)}</span></div>`;
}
/* Correction question par question, pour toute la classe */
function vByQuestion(c, f, studs){
  const qs = c.questions || []; if (!qs.length) return `<div class="panel empty">Aucune question.</div>`;
  let qi = qs.findIndex(q => q.id === S.corrQ); if (qi < 0) qi = 0; const q = qs[qi]; S.corrQ = q.id;
  const rows = studs.map(e => ({e, cp:f.copies?.[e.id]})), withCp = rows.filter(r => r.cp && (Object.keys(r.cp.answers || {}).length || Object.keys(r.cp.scans || {}).length)), none = rows.filter(r => !withCp.includes(r));
  const noted = withCp.filter(r => noteOf(r.cp.answers?.[q.id]) != null), avg = noted.length ? noted.reduce((t, r) => t + noteOf(r.cp.answers[q.id]), 0) / noted.length : null;
  const ptsTo = qs.slice(0, qi + 1).reduce((t, x) => t + +x.points, 0);
  return `<section class="qbq">
    <div class="qnav panel">
      <div class="row between" style="gap:8px;flex-wrap:nowrap"><button class="btn sm" data-qgo="${qi - 1}" ${qi ? "" : "disabled"} aria-label="Question précédente">←</button>
        <select id="qbqSel" aria-label="Question">${qs.map((x, k) => `<option value="${x.id}" ${k === qi ? "selected" : ""}>Question ${k + 1}${x.notion ? " · " + esc(x.notion) : ""} (/${fmt(+x.points)})</option>`).join("")}</select>
        <button class="btn sm" data-qgo="${qi + 1}" ${qi < qs.length - 1 ? "" : "disabled"} aria-label="Question suivante">→</button></div>
      <div class="qchips">${qs.map((x, k) => { const all = withCp.length && withCp.every(r => noteOf(r.cp.answers?.[x.id]) != null); return `<button class="chip${k === qi ? " cur" : ""}${all ? " ok" : ""}" data-qgo="${k}">Q${k + 1}</button>`; }).join("")}</div>
      <details><summary class="small"><b>Énoncé et corrigé</b> · ${noted.length}/${withCp.length} noté(s)${avg != null ? ` · moyenne ${fmt(Math.round(avg * 10) / 10)}/${fmt(+q.points)}` : ""}</summary>
        <div dir="auto" style="margin-top:6px">${esc(vOf(q, "standard").enonce)}</div>${vOf(q, "standard").corrige ? `<div class="small muted" dir="auto" style="margin-top:6px;white-space:pre-wrap"><b>Corrigé :</b> ${esc(vOf(q, "standard").corrige)}</div>` : ""}</details>
    </div>
    ${withCp.map(({e, cp}, i) => { const a = cp.answers?.[q.id];
      const sofar = qs.slice(0, qi + 1).reduce((t, x) => t + (noteOf(cp.answers?.[x.id]) ?? 0), 0);
      return `<article class="qcard" id="qc-${e.id}">
      <div class="row between" style="gap:8px"><div><b>${esc(e.prenom)} ${esc(e.nom)}</b>${cp.validee ? ` <span class="chip ok">✓</span>` : ""}
        <div class="small muted num">Jusqu'ici ${fmt(sofar)} / ${fmt(ptsTo)} pts${copyDone(c, cp) ? ` · total ${noteS(final20(c, cp))}` : ""}</div></div>
        ${scoreCtl(q, a, e.id, qi)}</div>
      ${a ? `${a.crop ? `<img class="crop" alt="Cadre scanné" src="${esc(blobSrc(a.crop))}" data-zoom="${esc(blobSrc(a.crop))}">` : ""}
        <div class="answer" dir="auto">${renderAnnot(a.annot || a.transcription, q.id, e.id) || '<span class="muted">(cadre vide)</span>'}</div>
        ${!a.lisible ? `<div class="small" style="color:var(--warn)">⚠ Lecture incertaine : compare avec la photo.</div>` : ""}
        ${a.commentaire ? `<div class="small note" dir="auto">${esc(a.commentaire)}</div>` : ""}
        ${(a.erreurs || []).length ? `<div class="tags">${a.erreurs.map((t, j) => `<span class="chip bad">${esc(t)} <button class="btn sm ghost" style="padding:0 4px;min-height:0" data-unerr="${q.id}|${j}" data-eid="${e.id}" aria-label="Retirer cette erreur">×</button></span>`).join("")}</div>` : ""}`
        : `<div class="small muted">Pas encore de réponse lue pour cette question.</div>`}
      <div class="row" style="gap:6px">${cp ? `<button class="btn sm ghost" data-recrop="${q.id}" data-eid="${e.id}">Recadrer</button>` : ""}${a?.crop ? `<button class="btn sm ghost" data-precise="${q.id}" data-eid="${e.id}">Relire (IA)</button>` : ""}<span class="status" data-st="${e.id}|${q.id}"></span>
        <button class="btn sm ghost" data-opencopy="${e.id}">Voir la copie</button></div>
    </article>`; }).join("") || `<div class="panel empty">Aucune copie scannée pour ce contrôle.</div>`}
    ${none.length ? `<div class="small muted" style="padding:8px 4px">Pas encore scanné(s) : ${none.map(r => esc(r.e.prenom + " " + r.e.nom)).join(", ")}</div>` : ""}
    ${qi < qs.length - 1 ? `<div class="row" style="justify-content:center;padding:8px"><button class="btn primary" data-qgo="${qi + 1}">Question suivante →</button></div>` : ""}
  </section>`;
}
function renderAnnot(s, qid, eid){
  let n = 0;
  return esc(s).replace(/⟦([\s\S]*?)⟧/g, (m, x) => qid ? `<mark data-unmark="${qid}|${n++}${eid ? "|" + eid : ""}" title="Cliquer pour retirer ce soulignement" style="cursor:pointer">${x}</mark>` : `<mark>${x}</mark>`).replace(/\[(?:illisible|illegible|ilegível)\]/g, m => `<span class="illisible">${m}</span>`);
}
/* Page scannée où se trouve la question (pour recadrer) */
function pageScanOf(cp, qid){ const i = (cp?.pages || []).findIndex(pg => pageQ(pg).includes(qid)), page = i >= 0 ? i + 1 : 1;
  const scans = Object.entries(cp?.scans || {}).filter(([, s]) => s && (s.asset || s.url)).map(([p, s]) => ({page:+p, scan:s})).sort((a, b) => a.page - b.page);
  return {page, scan:cp?.scans?.[page] || null, box:i >= 0 ? (cp.pages[i]?.b || []).find(b => b.q === qid) : null, scans}; }
/* Retirer un soulignement rouge en cliquant dessus */
document.addEventListener("click", async ev => { const m = ev.target.closest("[data-unmark]"); if (!m) return; const C = ctrl(S.corrCtrl); if (!C) return;
  const [qid, n, e0] = m.dataset.unmark.split("|"), eid = e0 || S.corrEleve, a = feuille(C.id)?.copies?.[eid]?.answers?.[qid]; if (!a) return;
  let k = 0; const annot = String(a.annot || "").replace(/⟦([\s\S]*?)⟧/g, (all, x) => k++ === +n ? x : all);
  await write("feuilles/" + C.id, {copies:{[eid]:{answers:{[qid]:{annot}}}}}, "update"); });
/* Recadrer un cadre de réponse à la main sur la page scannée */
/* Page redressée (coordonnées de la feuille × k) à partir des repères des coins */
function rectifySheet(cv, H, k){
  const W = Math.round(794 * k), Hh = Math.round(1123 * k), src = pix(cv), SW = cv.width, SH = cv.height;
  const out = document.createElement("canvas"); out.width = W; out.height = Hh; const oc = out.getContext("2d"), od = oc.createImageData(W, Hh), D = od.data;
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++){
    const [sx, sy] = applyH(H, (i + .5) / k, (j + .5) / k), X = sx | 0, Y = sy | 0, o = (j * W + i) * 4;
    if (X < 0 || Y < 0 || X >= SW || Y >= SH){ D[o] = D[o + 1] = D[o + 2] = D[o + 3] = 255; continue; }
    const q = (Y * SW + X) * 4; D[o] = src[q]; D[o + 1] = src[q + 1]; D[o + 2] = src[q + 2]; D[o + 3] = 255; }
  oc.putImageData(od, 0, 0); return out;
}
async function sheetOfScan(cv, boxes){
  try {
    const found = await detectAll(cv);
    const have = found.map(x => /^TK1W?\|/.test(x.data) ? "tl" : x.data.startsWith("TK1C|") ? x.data.slice(5) : "").filter(Boolean);
    let fnd = found; if (have.length < 4){ const extra = blobMarkers(cv, have), all = fnd.concat(extra); if (extra.length && markersOk(all)) fnd = all; }
    const Hm = sheetToPhoto(fnd); if (!Hm) return null;
    if ((boxes || []).length && boxScore(cv, Hm, boxes) < 0.45) return null;
    return Hm;
  } catch(e){ console.warn("Redressement", e); return null; }
}
async function recropOpen(C, eid, qid){
  const cp = feuille(C.id)?.copies?.[eid]; if (!cp) return toast("Page scannée introuvable.");
  const ps = pageScanOf(cp, qid), k = C.questions.findIndex(q => q.id === qid), e = eleveOf(C, eid);
  const ov = document.createElement("div"); ov.id = "rc-modal";
  ov.style.cssText = "position:fixed;inset:0;z-index:80;background:rgba(10,16,30,.9);display:flex;flex-direction:column;align-items:center;padding:10px;gap:8px;overflow:auto;overscroll-behavior:contain";
  ov.innerHTML = `<div style="color:#fff;font-weight:600;text-align:center">${e ? esc(e.prenom + " " + e.nom) + " · " : ""}Question ${k + 1}</div>
    <div id="rc-pages" class="row" style="justify-content:center;flex-wrap:wrap;gap:6px"></div>
    <div id="rc-tip" class="small" style="color:#cfd6e4;text-align:center">Préparation de la page…</div>
    <div id="rc-wrap" style="position:relative;display:inline-block;touch-action:none;user-select:none;-webkit-user-select:none;line-height:0"><canvas id="rc-img" width="1" height="1" style="display:block;max-width:min(900px,calc(100vw - 20px));max-height:66vh;width:auto;height:auto;background:#fff"></canvas>
      <div id="rc-sel" style="position:absolute;border:3px solid #D9B26A;background:rgba(217,178,106,.18);display:none;pointer-events:none;box-sizing:border-box">${["nw","ne","sw","se"].map(h => `<span data-h="${h}" style="position:absolute;width:18px;height:18px;border-radius:50%;background:#D9B26A;border:2px solid #fff;${h[0] === "n" ? "top" : "bottom"}:-11px;${h[1] === "w" ? "left" : "right"}:-11px"></span>`).join("")}</div></div>
    <div class="row" style="justify-content:center;flex-wrap:wrap"><button class="btn primary" id="rc-ok2">Enregistrer et relire (IA)</button><button class="btn" id="rc-ok">Enregistrer le cadre</button><button class="btn ghost" id="rc-x" style="color:#fff">Annuler</button></div>`;
  document.body.append(ov); const prevOv = document.body.style.overflow; document.body.style.overflow = "hidden";
  const view = $("#rc-img"), sel = $("#rc-sel"), wrap = $("#rc-wrap"), tip = $("#rc-tip"), bar = $("#rc-pages");
  let scans = ps.scans, cur = null, pic = null, R = null;
  function show(){ if (!R){ sel.style.display = "none"; return; } const w = view.clientWidth, h = view.clientHeight; Object.assign(sel.style, {display:"block", left:R.x * w + "px", top:R.y * h + "px", width:R.w * w + "px", height:R.h * h + "px"}); }
  const close = () => { ov.remove(); document.body.style.overflow = prevOv; window.removeEventListener("resize", show); };
  $("#rc-x").onclick = close;
  const drawBar = () => { bar.innerHTML = scans.map(s => `<button class="btn sm${cur && cur.page === s.page ? " primary" : ""}" data-rcp="${s.page}">Page ${s.page}</button>`).join("")
    + `<label class="btn sm" style="cursor:pointer">Photo de la page ${ps.page}<input type="file" accept="image/*" id="rc-file" style="display:none"></label>`;
    bar.querySelectorAll("[data-rcp]").forEach(b => b.onclick = () => load(scans.find(s => s.page === +b.dataset.rcp)));
    $("#rc-file").onchange = async ev => { const fl = ev.target.files?.[0]; if (!fl) return; tip.textContent = "Préparation de la page…";
      try { const bmp = await createImageBitmap(fl); const c0 = document.createElement("canvas"); c0.width = bmp.width; c0.height = bmp.height; c0.getContext("2d").drawImage(bmp, 0, 0);
        const a = await ASSETS.upload(await toBlob(scaled(c0, 1700), .85)), sc = {asset:a.id, url:"/api/files/" + a.id, at:new Date().toISOString(), main:true};
        await write("feuilles/" + C.id, {copies:{[eid]:{scans:{[ps.page]:sc}}}}, "update");
        scans = scans.filter(s => s.page !== ps.page).concat([{page:ps.page, scan:sc}]).sort((x, y) => x.page - y.page); toast("Photo ajoutée."); await load(scans.find(s => s.page === ps.page), fl);
      } catch(err){ console.warn(err); toast("Ajout de la photo impossible."); tip.textContent = ""; } }; };
  async function load(pg, blob){
    if (!pg){ drawBar(); tip.textContent = "Aucune photo de cette page pour l'instant : ajoute-la avec le bouton ci-dessus."; return; }
    tip.textContent = "Préparation de la page…"; R = null; show();
    let src;
    try { const bl = blob || (pg.scan.asset ? await getBlob(pg.scan.asset) : await (await fetch(pg.scan.url)).blob()); const bmp = await createImageBitmap(bl);
      src = document.createElement("canvas"); src.width = bmp.width; src.height = bmp.height; src.getContext("2d").drawImage(bmp, 0, 0); }
    catch(err){ tip.textContent = "Image de la page introuvable."; return; }
    cur = pg; drawBar();
    /* On redresse la page avec les repères : le cadre se place alors exactement, quelle que soit l'inclinaison du scan */
    const Hm = await sheetOfScan(src, cp.pages?.[pg.page - 1]?.b);
    pic = Hm ? rectifySheet(src, Hm, Math.min(2, Math.max(1.2, src.width / 794))) : src;
    view.width = pic.width; view.height = pic.height; view.getContext("2d").drawImage(pic, 0, 0);
    tip.textContent = (Hm ? "Déplace le cadre ou tire sur ses coins ; trace un nouveau rectangle en dehors." : "Page non redressée : trace un rectangle autour de la réponse.") + (scans.length > 1 ? " " + "Choisis la page où se trouve la réponse." : "");
    if (Hm && pg.page === ps.page && ps.box){ const pad = 6; R = {x:(ps.box.x - pad) / 794, y:(ps.box.y - pad) / 1123, w:(ps.box.w + 2 * pad) / 794, h:(ps.box.h + 2 * pad) / 1123}; }
    requestAnimationFrame(show);
  }
  const pos = ev => { const r = view.getBoundingClientRect(); return [clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1)]; };
  let drag = null;
  wrap.addEventListener("pointerdown", ev => { if (!pic) return; ev.preventDefault(); wrap.setPointerCapture(ev.pointerId); const [x, y] = pos(ev), h = ev.target.dataset?.h;
    if (R && h) drag = {mode:h, R:{...R}, p:[x, y]};
    else if (R && x > R.x && x < R.x + R.w && y > R.y && y < R.y + R.h) drag = {mode:"move", R:{...R}, p:[x, y]};
    else { drag = {mode:"new", p:[x, y]}; R = {x, y, w:0, h:0}; } show(); });
  wrap.addEventListener("pointermove", ev => { if (!drag) return; ev.preventDefault(); const [x, y] = pos(ev), [px, py] = drag.p, o = drag.R;
    if (drag.mode === "new") R = {x:Math.min(x, px), y:Math.min(y, py), w:Math.abs(x - px), h:Math.abs(y - py)};
    else if (drag.mode === "move") R = {...o, x:clamp(o.x + x - px, 0, 1 - o.w), y:clamp(o.y + y - py, 0, 1 - o.h)};
    else { let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h; if (drag.mode[1] === "w") x0 = x; else x1 = x; if (drag.mode[0] === "n") y0 = y; else y1 = y;
      R = {x:Math.min(x0, x1), y:Math.min(y0, y1), w:Math.abs(x1 - x0), h:Math.abs(y1 - y0)}; }
    show(); });
  const end = () => { drag = null; }; wrap.addEventListener("pointerup", end); wrap.addEventListener("pointercancel", end);
  window.addEventListener("resize", show);
  const save = async relire => {
    if (!pic || !R || R.w < 0.03 || R.h < 0.02) return toast("Trace d'abord un rectangle autour de la réponse.");
    const W = pic.width, H = pic.height, cv = document.createElement("canvas");
    cv.width = Math.round(R.w * W); cv.height = Math.round(R.h * H); cv.getContext("2d").drawImage(pic, R.x * W, R.y * H, R.w * W, R.h * H, 0, 0, cv.width, cv.height);
    try { const a = await ASSETS.upload(await toBlob(scaled(cv, 1600), .9));
      const had = feuille(C.id)?.copies?.[eid]?.answers?.[qid];
      const ans = had ? {crop:a.id} : {crop:a.id, transcription:"", annot:"", lisible:true, noteIA:null, note:null, commentaire:"", erreurs:[], acquis:[], valide:false};
      await write("feuilles/" + C.id, {copies:{[eid]:{answers:{[qid]:ans}}}}, "update");
      S.recropped = {...(S.recropped || {}), [qid + "|" + eid]:true}; close(); toast("Cadre enregistré."); render();
      if (relire) setTimeout(() => document.querySelector(`[data-precise="${qid}"][data-eid="${eid}"]`)?.click() || document.querySelector(`[data-precise="${qid}"]:not([data-eid])`)?.click(), 300);
    } catch(err){ toast("Enregistrement impossible : " + (err?.message || "réessaie.")); }
  };
  $("#rc-ok").onclick = () => save(false); $("#rc-ok2").onclick = () => save(true);
  await load(scans.find(s => s.page === ps.page) || scans[0]);
}
function copyView(c, e, cp, studs){
  const max = maxOf(c), has = cp && Object.keys(cp.answers || {}).length, done = copyDone(c, cp);
  const scans = cp?.scans ? Object.entries(cp.scans).sort((a, b) => a[0] - b[0]) : [];
  return `<article class="copy">
    ${studs ? (() => { const i = studs.findIndex(x => x.id === e.id), p = studs[i - 1], n = studs[i + 1];
      return `<div class="copy-nav row between"><button class="btn sm" ${p ? `data-cel="${p.id}"` : "disabled"}>← ${p ? esc(p.prenom) : ""}</button><span class="small muted">${i + 1} / ${studs.length}</span><button class="btn sm" ${n ? `data-cel="${n.id}"` : "disabled"}>${n ? esc(n.prenom) : ""} →</button></div>`; })() : ""}
    <div class="copy-h"><div><div class="label">Copie${c.differencie ? ` · <span class="lvl ${versionFor(c, e)}">${LVL[versionFor(c, e)]}</span>` : ""}</div><h3 style="font-size:20px">${esc(e.prenom)} ${esc(e.nom)}</h3></div>
      <div class="row">${done ? `<div><div class="total num">${nv(final20(c, cp))}<small>${sfxN(final20(c, cp))}</small></div>${bonusMax(c) ? `<div class="small muted num">brute ${fmt(on20(copyTotal(c, cp), max))} + bonus ${fmt(bonusOf(c, cp).proprete + bonusOf(c, cp).orthographe)}</div>` : ""}</div>` : ""}
      <button class="btn ${cp?.validee ? "" : "primary"}" id="validate" ${has || done ? "" : "disabled"}>${cp?.validee ? "Validée ✓" : "Valider la copie"}</button>
      ${done && final20(c, cp) < SEUIL ? `<button class="btn sm" id="mkRatt">Rattrapage</button>` : ""}${done ? `<button class="btn sm" id="rendu1">Copie rendue (PDF)</button>` : ""}</div><div class="status" id="rd-st" style="width:100%"></div></div>
    ${scans.length ? `<div class="scans">${scans.map(([p, s]) => `<img alt="Page ${p}" src="${esc(s.asset ? blobSrc(s.asset) : s.url)}" data-zoom="${esc(s.asset ? blobSrc(s.asset) : s.url)}">`).join("")}</div>` : ""}
    ${has && bonusMax(c) ? `<div class="row" style="padding:10px 16px;border-bottom:1px solid var(--line);gap:14px">${["proprete","orthographe"].filter(k => +c.bonus?.[k]).map(k => `<label class="row small" style="gap:6px">Bonus ${k === "proprete" ? "propreté" : "orthographe"} <input type="number" min="0" max="${c.bonus[k]}" step="0.5" id="bo-${k}" data-bonus="${k}" value="${bonusOf(c, cp)[k]}" style="width:70px"> / ${fmt(+c.bonus[k])}</label>`).join("")}</div>` : ""}
    ${!has ? `<div class="empty">Copie pas encore scannée. <button class="btn sm" data-go="scan">Scanner</button><br><span class="small">Tu peux aussi saisir les notes directement ci-dessous.</span></div>` : ""}
    ${(c.questions || []).map((q, k) => {
      const a = cp?.answers?.[q.id], ver = cp?.version?.[q.id] || versionFor(c, e), v = vOf(q, ver), n = noteOf(a);
      const edT = S.editTr[q.id], edC = S.editCom[q.id];
      return `<div class="q">
      <div class="q-top"><div><span class="label">Question ${k + 1}${q.notion ? " · " + esc(q.notion) : ""}</span><div style="font-weight:600" dir="auto">${esc(v.enonce)}</div></div>
        ${scoreCtl(q, a, e.id, k)}</div>
      ${a ? `${edT ? `<textarea id="tr-${q.id}" data-live dir="auto">${esc(a.transcription)}</textarea><div class="row"><button class="btn sm primary" data-retr="${q.id}">Recorriger avec ce texte (IA)</button><button class="btn sm ghost" data-trx="${q.id}">Annuler</button><span class="status" id="rs-${q.id}"></span></div>`
        : `<div class="answer" dir="auto">${renderAnnot(a.annot || a.transcription, q.id) || '<span class="muted">(cadre vide)</span>'}</div>`}
      ${a.crop ? `<img class="crop" alt="Cadre scanné" src="${esc(blobSrc(a.crop))}" data-zoom="${esc(blobSrc(a.crop))}">` : ""}
      ${!a.lisible ? `<div class="small" style="color:var(--warn)">⚠ Lecture incertaine : compare avec la photo${a.crop ? ` ou <button class="btn sm" data-precise="${q.id}">Relire en mode précis (IA)</button>` : "."}</div><span class="status" id="pr-${q.id}"></span>` : ""}
      <div class="comment">${edC ? `<textarea id="cm-${q.id}" data-live>${esc(a.commentaire)}</textarea><div class="row"><button class="btn sm primary" data-savecm="${q.id}">Enregistrer</button><button class="btn sm ghost" data-cmx="${q.id}">Annuler</button></div>`
        : `<div class="note" dir="auto">${esc(a.commentaire)}</div>`}
        <div class="tags">${(a.acquis || []).map(t => `<span class="chip ok">${esc(t)}</span>`).join("")}${(a.erreurs || []).map((t, j) => `<span class="chip bad">${esc(t)} <button class="btn sm ghost" style="padding:0 4px;min-height:0" data-unerr="${q.id}|${j}" aria-label="Retirer cette erreur" title="Retirer">×</button></span>`).join("")}</div>
        <div class="small muted">${a.note != null && a.note !== a.noteIA ? `Note IA : ${fmt(a.noteIA)} · modifiée par le professeur` : "Proposé par l'IA"}${a.valide ? " · validé" : ""}</div></div>
      <div class="row">${cp ? `<button class="btn sm ghost" data-recrop="${q.id}">Recadrer</button>` : ""}${a.crop && a.lisible ? `<button class="btn sm ghost" data-precise="${q.id}">Relire (IA)</button>` : ""}<span class="status" id="pr2-${q.id}"></span>${!edT ? `<button class="btn sm ghost" data-tr="${q.id}">Corriger la transcription</button>` : ""}${!edC ? `<button class="btn sm ghost" data-cm="${q.id}">Modifier le commentaire</button>` : ""}</div>` : ""}
      ${!a && cp ? `<div class="small muted">Rien n'a été lu pour cette question.</div><div class="row"><button class="btn sm" data-recrop="${q.id}">Recadrer sur la photo</button><span class="status" id="pr2-${q.id}"></span></div>` : ""}
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
    <select id="anSel" style="max-width:440px" aria-label="Contrôle">${selOpts(list, c.id, x => (x.type === "rattrapage" ? "Rattrapage · " : x.type === "exercices" ? "Exercices · " : "") + x.titre + " · " + (classe(x.classeId)?.nom || ""), x => x.id)}</select></div>
  <div class="grid g3">
    <div class="panel"><div class="label">Moyenne</div><div class="total num" style="color:var(--ink)">${nv(avg)}<small>${sfxN(avg)}</small></div></div>
    <div class="panel"><div class="label">Min – max</div><div class="total num" style="color:var(--ink)">${nv(Math.min(...notes))} – ${nv(Math.max(...notes))}</div></div>
    <div class="panel"><div class="label">Sous ${noteS(10)}</div><div class="total num" style="color:var(--ink)">${notes.filter(n => n < 10).length}<small>/${notes.length}</small></div></div>
  </div>
  <section class="panel"><h3>Réussite et erreurs par question</h3>
    <div class="bars" style="margin-top:12px">${qs.map(x => `<div>
      <div class="bar"><b>Q${x.k + 1}</b><div class="track"><div class="fill" style="width:${Math.round(x.rate * 100)}%;background:var(--${tone(x.rate)})"></div></div><span class="num" style="text-align:right">${pct(x.rate)}</span></div>
      <div class="small muted" style="margin:2px 0 0 50px">${esc(x.q.notion || "")}${x.fail ? ` · ${x.fail} élève(s) sous la moitié des points` : ""}${x.tags.length ? " · " + x.tags.map(([t, n]) => `<span class="chip bad">${esc(t)} × ${n}</span>`).join(" ") : ""}</div></div>`).join("")}</div>
  </section>
  <section class="panel grid"><div class="row between"><h3>Synthèse pédagogique</h3><button class="btn sm" id="synth">${c.analyse ? "Actualiser" : "Rédiger"} (IA)</button></div>
    <div class="status" id="syn-st"></div>
    ${c.analyse ? `<div style="white-space:pre-wrap">${esc(c.analyse)}</div>` : `<p class="muted small">L'IA repère les notions non comprises et propose quoi reprendre en classe.</p>`}</section>
  <section class="panel"><div class="row between"><h3>Élèves</h3><span class="small muted">Rattrapage individuel possible pour chaque élève sous ${noteS(SEUIL)}</span></div>
    <div class="status" id="ra-st"></div>
    <div class="tbl-wrap" style="margin-top:6px"><table><thead><tr><th>Élève</th>${c.questions.map((q, k) => `<th class="c">Q${k + 1}</th>`).join("")}<th class="c">${bareme() === "AF" ? "A–F" : sfx().trim()}</th><th>Rattrapage</th></tr></thead><tbody>
    ${studs.map(e => { const cp = f.copies[e.id]; const ok = copyDone(c, cp); const r = ratts.find(x => x.eleves?.includes(e.id));
      return `<tr><td><b>${esc(e.prenom)} ${esc(e.nom)}</b>${c.differencie ? ` <span class="lvl ${versionFor(c, e)}">${LVL[versionFor(c, e)][0]}</span>` : ""}</td>
      ${c.questions.map(q => { const n = noteOf(cp?.answers?.[q.id]); return `<td class="c"><span class="cell ${n == null ? "none" : tone(n / q.points)}">${fmt(n)}</span></td>`; }).join("")}
      <td class="c num"><b>${ok ? noteS(final20(c, cp)) : "—"}</b></td>
      <td>${r ? `<button class="btn sm" data-edit="${r.id}">${STATUT[r.statut]?.[0] || "Voir"}</button>` : ok && final20(c, cp) < SEUIL ? `<button class="btn sm" data-ratt="${e.id}">Créer</button>` : ok ? `<span class="small muted">—</span>` : ""}</td></tr>`; }).join("")}
    </tbody></table></div></section>`;
}
async function createRattrapage(c, e, replaceId){
  const f = feuille(c.id), cp = f?.copies?.[e.id]; if (!cp) throw {code:"no_copy"};
  if (!copyDone(c, cp) || final20(c, cp) >= SEUIL) throw {code:"not_failed"};
  if (!cp.validee && !confirm(`La copie de ${e.prenom} n'est pas encore validée : le rattrapage serait basé sur la note proposée par l'IA. Continuer ?`)) throw {code:"cancelled"};
  if (!replaceId && store.controles.some(x => x.type === "rattrapage" && x.parentId === c.id && x.eleves?.includes(e.id))) throw {code:"ratt_exists"};
  const weak = c.questions.map(q => ({q, a:cp.answers[q.id]})).filter(x => x.a && noteOf(x.a) / x.q.points < 0.6);
  const target = weak.length ? weak : c.questions.map(q => ({q, a:cp.answers[q.id]})).sort((x, y) => noteOf(x.a) / x.q.points - noteOf(y.a) / y.q.points).slice(0, 1);
  const lvl = levelOf(e, c.matiere);
  const ctx = target.map(({q, a}) => { const v = vOf(q, cp.version?.[q.id] || "standard");
    return `- Notion : ${q.notion || "?"}\n  Question : ${v.enonce}\n  Corrigé-type : ${v.corrige}\n  Réponse de l'élève (${fmt(noteOf(a))}/${q.points}) : ${a?.transcription || "(vide)"}\n  Erreurs relevées : ${(a?.erreurs || []).join(", ") || "?"}\n  Commentaire : ${a?.commentaire || ""}`; }).join("\n");
  const r = await ai(`Tu prépares une feuille de rattrapage individuelle pour un élève de ${c.niveau || ""} en ${c.matiere} .
Niveau habituel de l'élève dans cette matière : ${LVL[lvl]}.
Ses difficultés au contrôle « ${c.titre} » :
${ctx}

${langueRule(c.langue)}
Crée exactement 3 exercices NOUVEAUX, de difficulté croissante, qui ciblent précisément ces erreurs :
1 = découverte (plus simple que le niveau de l'élève), 2 = application, 3 = retour au niveau ${LVL[lvl].toLowerCase()} du contrôle.
Total 20 points (par ex. 5, 7, 8). Chaque exercice : un énoncé autonome (avec un coup de pouce entre parenthèses pour le 1), un corrigé-type, des critères de notation, 2 ou 3 erreurs types, un nombre de lignes de réponse (3 à 12).
${NOSRC}
${replaceId ? "IMPORTANT : propose des exercices DIFFÉRENTS de ceux-ci : " + (ctrl(replaceId)?.questions || []).map(q => vOf(q, "standard").enonce).join(" / ") + "\n" : ""}Réponds uniquement en JSON : {"titre":"…","questions":[{"notion":"…","points":5,"lignes":5,"enonce":"…","corrige":"…","criteres":"…","erreurs":["…"]}]}`);
  const qs = (r?.questions || []).slice(0, 3).map(x => ({id:"q" + uid(5), notion:String(x.notion || ""), points:+x.points || 5, lignes:clamp(+x.lignes || 6, 2, 20), erreurs:(x.erreurs || []).map(String),
    v:{standard:{enonce:String(x.enonce || ""), corrige:String(x.corrige || ""), criteres:String(x.criteres || "")}}}));
  if (!qs.length) throw {code:"invalid_json"};
  const old = replaceId && ctrl(replaceId), printed = old && feuille(replaceId) && Object.keys(feuille(replaceId).copies || {}).length;
  if (old && !printed){ const o = structuredClone(old); o.questions = qs; o.titre = "Rattrapage · " + (r.titre || c.titre); await saveCtrl(o); return replaceId; }
  const round = store.controles.filter(x => x.type === "rattrapage" && x.parentId === c.id && x.eleves?.includes(e.id)).length;
  const id = uid(12);
  const doc = {type:"rattrapage", parentId:c.id, titre:"Rattrapage" + (round ? " " + (round + 1) : "") + " · " + (r.titre || c.titre), matiere:c.matiere, niveau:c.niveau, classeId:c.classeId, eleves:[e.id], coursId:c.coursId || null,
    duree:30, differencie:false, mise:{...(c.mise || {}), consignes:"Feuille de rattrapage personnelle. Prends ton temps et relis le coup de pouce."}, statut:"brouillon", date:today(), questions:qs, createdAt:new Date().toISOString()};
  await write("controles/" + id, doc);
  return id;
}

/* ================= Classes: level suggestions ================= */
function suggestLevels(cl, mat){
  const cs = store.controles.filter(c => c.classeId === cl.id && c.matiere === mat && isCtrl(c)).sort((a, b) => (b.date || b.createdAt || "").localeCompare(a.date || a.createdAt || ""));
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
      if (hebRatio(txt) > .05){ txt = fixHebrewText(txt); S.hebPdf = [...(S.hebPdf || []), f]; }
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
        const t = await aiText(`Transcris fidèlement le texte de ces pages de cours (dans l'ordre), en gardant titres, définitions, exemples et formules. Recopie l'hébreu en caractères hébreux, dans l'ordre de lecture (droite à gauche), sans traduire ni inverser, avec le nikoud s'il est présent. Pas de commentaire : uniquement le texte.`, {images:blobs});
        parts.push(t.trim());
      }
    }
  }
  const box = $("#c-texte"); const prev = box.value.trim();
  box.value = [prev, ...parts].filter(Boolean).join("\n\n").slice(0, 60000);
  S.coursDraft = {...(S.coursDraft || {}), texte:box.value};
  if (parts.length) st.innerHTML = S.hebPdf?.length ? `Hébreu détecté : vérifie le texte. Si des mots sont à l'envers ou mélangés, <button class="btn sm" id="c-heb-ai">Relire le PDF avec l'IA (fiable pour l'hébreu)</button>` : "Texte extrait : relis-le, corrige si besoin, puis enregistre.";
}

/* ================= Generation ================= */
function genPrompt(co, p, n, extra){
  const T = {cours:"questions de cours", application:"exercices d'application", probleme:"problème ou rédaction", texte:"lecture / explication de texte", traduction:"traduction", qcm:"QCM"};
  return `Tu es un professeur expérimenté de ${p.matiere} en France. Prépare ${n === 1 ? "UNE question" : "un contrôle"} pour une classe de ${p.niveau}, à partir du cours ci-dessous.

Durée : ${p.duree} minutes · Difficulté : ${p.difficulte} · Types : ${(p.types || []).map(t => T[t]).join(", ") || "variés"}${(p.types || []).length > 1 && n > 1 ? " (chaque type demandé apparaît au moins une fois si le nombre de questions le permet)" : ""}
${n > 1 ? `Nombre de questions : ${n}. Total des points : 20 exactement.` : ""}
${p.consignes ? "Consignes du professeur : " + p.consignes : ""}
${langueRule(p.langue)}
${questionRule(p)}
${extra || ""}
Pour chaque question, rédige 3 versions de la même question, portant sur la même notion et notées sur les mêmes points :
- "socle" : plus guidée (étapes, données simplifiées, coup de pouce), pour un élève en difficulté ;
- "standard" : niveau attendu de la classe ;
- "approfondi" : plus exigeante (justification, cas général, extension).
Chaque version a son énoncé, son corrigé-type détaillé et des critères de notation dont la somme fait les points de la question.
${(p.types || []).includes("qcm") && !prefs().q.justif ? `Inclus au moins un QCM (corrigé automatiquement, sans IA) : pour lui "type":"qcm", et dans chaque version "choix" (3 à 5 propositions courtes, sans lettre) et "bonnes" (indices des bonnes réponses, à partir de 0) ; "lignes" inutile.\n` : ""}Ajoute pour chaque question : la notion évaluée, 2 à 4 erreurs types fréquentes (étiquettes de 2 à 5 mots), et le nombre de lignes de réponse nécessaires (3 à 14).
${NOSRC}

COURS :
"""${(co?.texte || "").slice(0, 30000)}"""

Réponds uniquement en JSON : {"titre":"…","questions":[{"notion":"…","points":4,"lignes":6,"erreurs":["…"],"versions":{"socle":{"enonce":"…","corrige":"…","criteres":"…"},"standard":{…},"approfondi":{…}}}]}`;
}
const mapQ = x => ({id:"q" + uid(5), ...(x.type === "qcm" ? {type:"qcm"} : {}), notion:String(x.notion || ""), points:+x.points || 4, lignes:clamp(+x.lignes || 6, 1, 30), erreurs:(x.erreurs || []).map(String).slice(0, 5),
  v:Object.fromEntries(LEVELS.map(l => { const y = x.versions?.[l] || {}; const o = {enonce:String(y.enonce || ""), corrige:String(y.corrige || ""), criteres:String(y.criteres || "")};
    if (x.type === "qcm"){ o.choix = (y.choix || []).map(String).slice(0, 6); o.bonnes = (y.bonnes || []).map(Number).filter(n => n >= 0 && n < o.choix.length); o.corrige = "Bonne(s) réponse(s) : " + o.bonnes.map(n => "ABCDEF"[n]).join(", "); o.criteres = "Tout ou rien."; }
    return [l, o]; }))});

/* Génère n questions ; si la réponse de l'IA a été coupée (trop longue), on garde les questions complètes et on demande la suite */
async function genQuestions(co, p, n, extra, opts = {}){
  let r = await ai(genPrompt(co, p, n, extra), opts), qs = (r?.questions || []).map(mapQ); const titre = r?.titre;
  for (let k = 0; k < 3 && qs.length < n && qs.length; k++){
    const reste = n - qs.length, deja = qs.map(q => vOf(q, "standard").enonce).join(" / ").slice(0, 3000);
    const r2 = await ai(genPrompt(co, p, reste, (extra || "") + `\nCe contrôle contient déjà ces questions : ${deja}\nRédige UNIQUEMENT les ${reste} question(s) qui manquent, sur d'autres notions, pour un total de 20 points avec les précédentes.`), opts);
    const add = (r2?.questions || []).map(mapQ); if (!add.length) break; qs = qs.concat(add.slice(0, reste));
  }
  if (!qs.length) throw {code:"invalid_json"};
  return {titre, questions:qs};
}
const SEUIL = 10;
const isCtrl = c => !c.type || c.type === "controle";
const EXO_TXT = "IMPORTANT : il s'agit d'une FEUILLE D'EXERCICES D'ENTRAÎNEMENT (pas d'un contrôle) : exercices progressifs, du plus simple au plus complet, pour pratiquer les notions du cours. Le mot « contrôle » ne doit pas apparaître.";
async function exercicesFrom(c){
  const co = store.cours.find(x => x.id === c.coursId); if (!co) throw {code:"no_cours"};
  const p = {matiere:c.matiere, niveau:c.niveau, duree:c.duree || 55, difficulte:c.gen?.difficulte || "moyen", types:c.gen?.types || [], consignes:""};
  const r = await genQuestions(co, p, clamp((c.questions || []).length || 5, 1, 10), EXO_TXT + "\nNotions à travailler (celles du contrôle « " + c.titre + " ») : " + (c.questions || []).map(q => q.notion).filter(Boolean).join(", "), {feature:"exercices"}), qs = r.questions;
  const id = uid(12);
  await write("controles/" + id, {type:"exercices", srcCtrl:c.id, titre:"Exercices · " + (r.titre || c.titre), matiere:c.matiere, niveau:c.niveau, classeId:c.classeId, coursId:c.coursId, duree:c.duree || 55, differencie:!!c.differencie,
    gen:{types:p.types, difficulte:p.difficulte, consignes:""}, statut:"brouillon", date:"", mise:{...(c.mise || {}), consignes:"Feuille d'exercices d'entraînement. Écris uniquement dans les cadres."}, questions:qs, createdAt:new Date().toISOString()});
  return id;
}
async function regenExercices(c){
  const co = store.cours.find(x => x.id === c.coursId);
  if (!co) throw {code:"no_cours"};
  const EXO = c.type === "exercices";
  const g = c.gen || {}, p = {matiere:c.matiere, niveau:c.niveau, duree:c.duree || 55, difficulte:g.difficulte || "moyen", types:g.types || [], consignes:g.consignes || "", langue:c.langue || ""};
  const deja = (c.questions || []).map(q => vOf(q, "standard").enonce).join(" / ").slice(0, 3000);
  const r = await genQuestions(co, p, clamp((c.questions || []).length || 5, 1, 10), EXO ? EXO_TXT + "\nPropose des exercices NOUVEAUX et DIFFÉRENTS de ceux-ci : " + deja : "Propose des questions NOUVELLES et DIFFÉRENTES de celles-ci : " + deja, EXO ? {feature:"exercices"} : {}), qs = r.questions;
  const f = feuille(c.id), printed = f && Object.keys(f.copies || {}).length;
  if (!printed){ const o = structuredClone(c); o.questions = qs; if (!EXO && r.titre) o.titre = r.titre; await saveCtrl(o); return c.id; }
  /* Feuilles déjà imprimées : on ne touche pas au contrôle d'origine (les copies doivent correspondre), on crée une nouvelle version */
  const n = store.controles.filter(x => (x.type || "controle") === (c.type || "controle") && (x.srcId || x.id) === (c.srcId || c.id)).length + 1;
  const id = uid(12), doc = structuredClone(c); delete doc.id; delete doc.owner;
  Object.assign(doc, {srcId:c.srcId || c.id, titre:EXO ? "Exercices " + n + " · " + (r.titre || co.titre) : (r.titre || c.titre) + " · version " + n, statut:"brouillon", date:"", questions:qs, createdAt:new Date().toISOString()});
  await write("controles/" + id, doc); return id;
}

/* ================= Demo ================= */
async function loadDemo(){
  const noms = [["Léa","Martin"],["Hugo","Bernard"],["Inès","Dubois"],["Nathan","Robert"],["Chloé","Petit"],["Adam","Durand"],["Jade","Leroy"],["Raphaël","Moreau"]];
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
  if (d.newctrl){ S.params.kind = "controle"; S.wizStep = 1; S.params._pref = false; return go("new"); }
  if (d.newex){ location.hash = canEx() ? "#/exercices/nouveau" : "#/exercices"; return; }
  if (d.exfrom){ if (!canEx()) return toast(aiErr("no_option")); const C = ctrl(d.exfrom);
    S.qn = {...S.qn, coursId:C.coursId, classeId:C.classeId, titre:"Entraînement · " + C.titre, consignes:"Cible surtout ces notions du contrôle : " + (C.questions || []).map(q => q.notion).filter(Boolean).join(", ")}; location.hash = "#/exercices/nouveau"; return; }
  if (d.go) return go(d.go);
  if (d.edit){ return openCtrl(d.edit); }
  if (d.corr){ S.corrCtrl = d.corr; S.corrEleve = d.el || null; return openCtrl(d.corr, "corriger"); }
  if (d.an){ S.anCtrl = d.an; return openCtrl(d.an, "classe"); }
  if (t.id === "demo"){ t.disabled = true; await loadDemo(); return; }

  /* classes */
  if (d.classe){ S.classeSel = d.classe; S.suggestions = null; return render(); }
  if (t.id === "nc-go"){ const niveau = $("#nc-niv").value, libelle = $("#nc-nom").value.trim(), nom = libelle ? niveau + " " + libelle : niveau;
    if (store.classes.some(c => c.nom === nom)){ toast("Tu as déjà une classe « " + nom + " » : ajoute un libellé (A, B, Bleue…) pour les distinguer."); $("#nc-nom").focus(); return; }
    const q = S.me?.quota; if (q && !q.illimite && q.classes != null && (store.allClasses || store.classes).filter(c => c.createdBy === S.me.id).length >= q.classes)
      return toast("Ton forfait ne permet pas plus de classes : passe au forfait supérieur dans Mon compte.");
    const id = uid(10); S.classeSel = id; await write("classes/" + id, {nom, niveau, libelle, eleves:[], createdAt:new Date().toISOString()}); return; }
  if (t.id === "rn-cl"){ const cl = classe(S.classeSel); if (!cl) return;
    const cur = cl.libelle ?? (cl.niveau && cl.nom.startsWith(cl.niveau + " ") ? cl.nom.slice(cl.niveau.length + 1) : cl.nom === cl.niveau ? "" : cl.nom);
    const v = prompt("Libellé de la classe (facultatif) : A, Bleue, Groupe 2…", cur); if (v === null) return;
    const libelle = v.trim(), nom = [cl.niveau, libelle].filter(Boolean).join(" ") || cl.nom;
    if (store.classes.some(c => c.id !== cl.id && c.nom === nom)) return toast("Tu as déjà une classe « " + nom + " » : choisis un autre libellé.");
    await write("classes/" + cl.id, {nom, libelle}, "update"); return; }
  if (t.id === "add-go"){ const cl = classe(S.classeSel); const lines = $("#add-el").value.split("\n").map(s => s.trim()).filter(Boolean);
    if (!lines.length){ toast("Écris un élève par ligne : « Prénom Nom »."); $("#add-el").focus(); return; } const add = lines.map(l => { const [p, ...n] = l.split(/\s+/); return {id:uid(8), prenom:p, nom:n.join(" "), niveaux:{}}; });
    $("#add-el").value = ""; await write("classes/" + cl.id, {eleves:[...(cl.eleves || []), ...add]}, "update"); toast(add.length + " élève(s) ajouté(s)."); return; }
  if (d.rmel){ const cl = classe(S.classeSel), e = (cl.eleves || []).find(x => x.id === d.rmel); if (!e) return;
    if (!confirm(`Retirer ${e.prenom} ${e.nom} de la classe ?\n\nSes copies scannées, ses notes et ses résultats d'exercices seront supprimés. Cette action est définitive.`)) return;
    await write("classes/" + cl.id, {eleves:cl.eleves.filter(x => x.id !== d.rmel)}, "update"); await purgeStudents([d.rmel]); toast("Élève retiré."); return; }
  if (t.id === "delCtrlTop"){ const c = ctrl(S.inCtrl); if (!c) return;
    const n = Object.values(feuille(c.id)?.copies || {}).filter(cp => Object.keys(cp.answers || {}).length).length;
    if (!confirm(`Supprimer le contrôle « ${c.titre} » ?` + (n ? `\n\n${n} copie(s) scannée(s) et leurs notes seront supprimées.` : "") + "\n\nCette action est définitive.")) return;
    try { await write("controles/" + c.id, null, "delete"); await write("feuilles/" + c.id, null, "delete"); toast("Contrôle supprimé."); return go("controles"); } catch(e){ toast("Suppression impossible : " + (e?.message || "réessaie.")); }
    return; }
  if (t.id === "del-cl"){ const cl = classe(S.classeSel); if (!cl) return;
    const n = (cl.eleves || []).length, nc = store.controles.filter(c => c.classeId === cl.id).length;
    if (!confirm(`Supprimer la classe « ${cl.nom} » et ses ${n} élève(s) ?\n\nLeurs copies scannées, notes et résultats d'exercices seront supprimés.` + (nc ? `\n\n${nc} contrôle(s) restent dans la liste des contrôles, sans classe ni copies.` : "") + "\n\nCette action est définitive.")) return;
    try { await purgeStudents((cl.eleves || []).map(e => e.id)); await write("classes/" + cl.id, null, "delete"); S.classeSel = null; toast("Classe supprimée."); render(); } catch(e){ toast("Suppression impossible : " + (e?.message || "réessaie.")); }
    return; }
  if (t.id === "sugg"){ const cl = classe(S.classeSel); S.suggestions = {classeId:cl.id, mat:S.levelMat, map:suggestLevels(cl, S.levelMat)};
    if (!Object.keys(S.suggestions.map).length) toast("Aucune copie validée en " + S.levelMat + " pour cette classe."); return render(); }
  if (t.id === "applySug"){ const cl = classe(S.classeSel), map = S.suggestions.map;
    await write("classes/" + cl.id, {eleves:cl.eleves.map(e => map[e.id] ? {...e, niveaux:{...(e.niveaux || {}), [S.levelMat]:map[e.id].lvl}} : e)}, "update"); S.suggestions = null; toast("Niveaux mis à jour."); return; }

  /* wizard */
  if (t.id === "c-heb-ai"){ const st = $("#c-st"), files = S.hebPdf || []; if (!files.length) return;
    if (!confirm("Remplacer le texte extrait du PDF par une lecture IA des pages ? (plus fiable pour l'hébreu, un peu plus coûteux)")) return;
    try { const cvs = [];
      for (const f of files){ const pdf = await pdfjsLib.getDocument({data: await f.arrayBuffer()}).promise;
        for (let i = 1; i <= Math.min(pdf.numPages, 12); i++){ const pg = await pdf.getPage(i); const vp = pg.getViewport({scale: 2000 / Math.max(pg.view[2], pg.view[3])}); const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height; await pg.render({canvasContext:cv.getContext("2d"), viewport:vp}).promise; cvs.push(cv); } }
      const per = Math.max(1, LIM?.images?.maxCount || 1), out = [];
      for (let i = 0; i < cvs.length; i += per){ st.innerHTML = `<span class="thinking">Lecture IA des pages ${i + 1} à ${Math.min(i + per, cvs.length)} sur ${cvs.length}…</span>`;
        const blobs = await Promise.all(cvs.slice(i, i + per).map(cv => toBlob(scaled(cv, 2000))));
        out.push((await aiText(`Transcris fidèlement le texte de ces pages de cours (dans l'ordre), en gardant titres, définitions, exemples et formules. Le texte contient de l'hébreu : recopie-le en caractères hébreux, dans l'ordre de lecture (droite à gauche), sans traduire ni inverser, avec le nikoud et les lettres finales tels qu'ils apparaissent. Pas de commentaire : uniquement le texte.`, {images:blobs})).trim()); }
      $("#c-texte").value = out.join("\n\n").slice(0, 60000); S.coursDraft = {...(S.coursDraft || {}), texte:$("#c-texte").value}; S.hebPdf = [];
      st.textContent = "Texte relu par l'IA : vérifie-le puis enregistre."; }
    catch(e){ console.error(e); st.textContent = e?.code ? aiErr(e.code) : "Lecture impossible."; } return; }
  if (t.id === "c-save"){ const texte = $("#c-texte").value.trim(), titre = $("#c-titre").value.trim() || "Cours sans titre";
    if (texte.length < 80) return toast("Le texte du cours est trop court.");
    const id = uid(10); await write("cours/" + id, {titre, matiere:$("#c-mat").value, niveau:$("#c-niv").value, texte:texte.slice(0, 60000), createdAt:new Date().toISOString()});
    if (S.params.kind === "quiz"){ S.coursDraft = null; S.params.kind = "controle"; S.qn.coursId = id; S.qn.classeId = ""; location.hash = "#/exercices/nouveau"; return; }
    learnMatiere($("#c-mat").value); S.matChg = false;
    S.coursId = id; S.coursDraft = null; S.params.matiere = $("#c-mat").value; S.params.niveau = $("#c-niv").value; S.params.classeId = ""; S.wizStep = 2; return render(); }
  if (d.usecours && S.params.kind === "quiz"){ S.params.kind = "controle"; S.qn.coursId = d.usecours; S.qn.classeId = ""; location.hash = "#/exercices/nouveau"; return; }
  if (d.usecours){ const co = store.cours.find(c => c.id === d.usecours); S.coursId = co.id; S.params.matiere = co.matiere; S.params.niveau = co.niveau; S.params.classeId = ""; S.wizStep = 2; return render(); }
  if (d.delcours){ if (!confirm("Supprimer ce cours ? Les contrôles déjà créés à partir de lui restent.")) return; await write("cours/" + d.delcours, null, "delete"); toast("Cours supprimé."); return; }
  if (t.id === "back1"){ S.wizStep = 1; return render(); }
  if (t.id === "p-niv-cl"){ S.params.niveau = t.dataset.niv; return render(); }
  if (t.id === "gen" || t.id === "genBlank"){
    if (!S.params.langue) S.params.langue = langueDef(store.cours.find(c => c.id === S.coursId)?.texte);
    const p = S.params, co = store.cours.find(c => c.id === S.coursId), st = $("#gen-st");
    const EXO = p.kind === "exercices" && canEx();
    const id = uid(12); const base = {type:EXO ? "exercices" : "controle", titre:p.titre || (EXO ? "Exercices · " : "") + (co?.titre || "Contrôle"), gen:{types:p.types, difficulte:p.difficulte, consignes:p.consignes || ""}, matiere:p.matiere, niveau:p.niveau, classeId:p.classeId, coursId:S.coursId, duree:+p.duree || 55,
      differencie:!!p.differencie, langue:p.langue || "", statut:"brouillon", date:"", mise:{affiche:S.me?.affichage || "les2", police:prefs().police, lh:prefs().lh, bareme:prefs().bareme, consignes:EXO ? "Feuille d'exercices d'entraînement. Écris uniquement dans les cadres." : prefs().consignes}, questions:[], createdAt:new Date().toISOString()};
    if (t.id === "genBlank"){ base.questions = [mapQ({points:4, lignes:6})]; await write("controles/" + id, base); S.editId = id; S.wizStep = 1; S.step = "preparer"; return go("edit"); }
    t.disabled = true; st.innerHTML = `<span class="thinking">${p.differencie ? `L'IA rédige ${EXO ? "les exercices" : "le contrôle"} en 3 niveaux (1 à 2 minutes)…` : `L'IA rédige ${EXO ? "les exercices" : "le contrôle"} (1 à 2 minutes)…`}</span>`;
    try{
      const r = await genQuestions(co, p, clamp(+p.nbq || 5, 1, 10), EXO ? EXO_TXT : "", EXO ? {feature:"exercices"} : {}), qs = r.questions;
      base.titre = p.titre || (EXO && r.titre ? "Exercices · " + r.titre : r.titre) || base.titre; base.questions = qs;
      await write("controles/" + id, base); S.editId = id; S.wizStep = 1; S.params.titre = ""; S.params._pref = false; S.step = "preparer"; return go("edit");
    }catch(e){ console.warn("gen", e); st.textContent = aiErr(e?.code) + (e?.message ? " (" + e.message + ")" : ""); t.disabled = false; }
    return;
  }

  /* editor */
  const c = S.view === "edit" ? ctrl(S.editId) : null;
  if (c){
    if (d.vt){ S.vtab[d.vt] = d.l; return render(); }
    if (d.qup !== undefined){ const i = +d.qup; [c.questions[i - 1], c.questions[i]] = [c.questions[i], c.questions[i - 1]]; await saveCtrl(c); return; }
    if (d.qdown !== undefined){ const i = +d.qdown; [c.questions[i + 1], c.questions[i]] = [c.questions[i], c.questions[i + 1]]; await saveCtrl(c); return; }
    if (d.qdel !== undefined){ const printed = c.statut && c.statut !== "brouillon";
      if (!confirm(printed ? "Les feuilles sont déjà imprimées : supprimer cette question retire aussi les réponses et les notes des élèves pour cette question, et change les totaux. Continuer ?" : "Supprimer cette question ?")) return;
      c.questions.splice(+d.qdel, 1); await saveCtrl(c); return; }
    if (t.id === "regenCtrl"){ if (!confirm("Remplacer toutes les questions par un nouveau contrôle généré par l'IA ?")) return;
      t.disabled = true; t.innerHTML = `<span class="thinking">Régénération (1 à 2 minutes)…</span>`;
      try { const nid = await regenExercices(c); if (nid !== c.id){ toast("Feuilles déjà imprimées : une nouvelle version du contrôle a été créée."); S.editId = nid; S.step = "preparer"; return go("edit"); } toast("Nouveau contrôle généré."); render(); }
      catch(er){ toast(aiErr(er?.code) + (er?.message ? " (" + er.message + ")" : ""), 7000); t.disabled = false; t.textContent = "↻ Régénérer le contrôle (IA)"; }
      return; }
    if (t.id === "regenEx"){ if (!canEx()) return toast(aiErr("no_option"));
      t.disabled = true; t.textContent = "Régénération…";
      try { const nid = await regenExercices(c); if (nid !== c.id){ toast("Feuille déjà imprimée : une nouvelle feuille d'exercices a été créée."); S.editId = nid; S.step = "preparer"; return go("edit"); } toast("Nouveaux exercices générés."); }
      catch(er){ toast(aiErr(er?.code)); t.disabled = false; t.textContent = "↻ Régénérer les exercices (IA)"; }
      return; }
    if (t.id === "addQ"){ if (c.statut && c.statut !== "brouillon" && !confirm("Les feuilles sont déjà imprimées : une nouvelle question n'aura pas de cadre sur les copies déjà distribuées et comptera dans le total. Ajouter quand même ?")) return;
      c.questions.push(mapQ({points:4, lignes:6})); await saveCtrl(c); return; }
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
  }

  /* scan */
  if (d.lotfix) return lotFix(d.lotfix);
  if (t.id === "rs-go") return resetScan($("#rs-ctrl").value, $("#rs-el").value);
  if (t.id === "qclear"){ S.queue.forEach(x => { if (x.lot && !["envoi"].includes(x.status)) S.lotGone.add(x.lot); }); S.queue = S.queue.filter(x => ["attente","qr","lecture","envoi"].includes(x.status)); return render(); }
  if (d.mgo){ const it = S.queue.find(x => x.id === d.mgo); it.status = "lecture"; render(); await processPage(it); freeCv(it); return; }
  if (d.retry && S.queue.find(x => x.id === d.retry)?.jobErr){ const it = S.queue.find(x => x.id === d.retry);
    try { await api("/api/jobs/" + it.jobId + "/retry", {method:"POST", body:"{}"}); it.status = "serveur"; it.jobErr = false; it.msg = "Relancée sur le serveur."; watchJobs(); } catch(e){ toast(e.message || "Relance impossible."); } return render(); }
  if (d.retry){ const it = S.queue.find(x => x.id === d.retry); if (!it.cv && !it.load){ toast("Image perdue : ajoute la photo à nouveau."); return; } it.status = it.ctrlId ? "lecture" : "attente"; render(); if (it.ctrlId) await processPage(it); else runQueue(); return; }

  /* correction */
  if (S.view === "correct"){
    const C = ctrl(S.corrCtrl);
    if (d.cmode){ S.corrMode = d.cmode; return render(); }
    if (d.qgo){ const q = C.questions[+d.qgo]; if (q){ S.corrQ = q.id; render(); scrollTo({top:0}); } return; }
    if (d.opencopy){ S.corrMode = "copie"; S.corrEleve = d.opencopy; S.editTr = {}; S.editCom = {}; render(); scrollTo({top:0}); return; }
    if (d.eid) S.corrEleve = d.eid;
    if (d.qset != null && d.q){ const q = C.questions.find(x => x.id === d.q); if (!q) return; const v = clamp(half(+d.qset), 0, +q.points);
      await write("feuilles/" + C.id, {copies:{[d.eid]:{validee:false, answers:{[d.q]:{note:v, valide:false}}}}}, "update");
      if (S.corrMode === "question"){ const cur = document.getElementById("qc-" + d.eid), nx = cur?.nextElementSibling; if (nx?.classList.contains("qcard")) nx.scrollIntoView({behavior:"smooth", block:"start"}); }
      return; }
    if (d.cel){ S.corrEleve = d.cel; S.editTr = {}; S.editCom = {}; render(); if (innerWidth < 760) document.querySelector(".copy")?.scrollIntoView({block:"start"}); return; }
    if (d.tr){ S.editTr[d.tr] = true; return render(); }
    if (d.trx){ delete S.editTr[d.trx]; return render(); }
    if (d.cm){ S.editCom[d.cm] = true; return render(); }
    if (d.cmx){ delete S.editCom[d.cmx]; return render(); }
    if (d.unerr){ const [qid, j] = d.unerr.split("|"), a = feuille(C.id)?.copies?.[S.corrEleve]?.answers?.[qid]; if (!a) return;
      await write("feuilles/" + C.id, {copies:{[S.corrEleve]:{answers:{[qid]:{erreurs:(a.erreurs || []).filter((_, k) => k !== +j)}}}}}, "update"); return; }
    if (d.recrop) return recropOpen(C, S.corrEleve, d.recrop);
    if (d.savecm){ const v = $("#cm-" + d.savecm).value; delete S.editCom[d.savecm];
      await write("feuilles/" + C.id, {copies:{[S.corrEleve]:{answers:{[d.savecm]:{commentaire:v}}, validee:false}}}, "update"); return; }
    if (d.precise){
      const qid = d.precise, q = C.questions.find(x => x.id === qid), cp = feuille(C.id).copies[S.corrEleve], a = cp.answers[qid], st = document.querySelector(`[data-st="${S.corrEleve}|${qid}"]`) || $("#pr-" + qid) || $("#pr2-" + qid);
      t.disabled = true; st.innerHTML = `<span class="thinking">Relecture précise (modèle le plus puissant)…</span>`;
      try{
        const blob = await getBlob(a.crop);
        const i = C.questions.indexOf(q);
        const smp = await sampleImages(S.corrEleve, C.matiere);
        const r = await ai(`Relis très attentivement ce cadre de réponse manuscrit d'un élève (${C.matiere}, ${C.niveau || ""}), puis corrige. L'image 1 est le cadre à lire.${smp.txt}${lectureTips()}\n${qBlockPrompt(C, q, cp.version?.[qid] || "standard", i)}${S.recropped?.[qid + "|" + S.corrEleve] ? "" : `\n\nUne première lecture a donné : """${a.transcription}""" (jugée incertaine).`}\nTranscris ligne par ligne, sans corriger l'orthographe. ${MATH_RULE} Hébreu en caractères hébreux. Passage vraiment illisible : [illisible]. "annotee" = transcription avec chaque passage erroné entouré de ⟦ ⟧ (hors des $…$). Note par pas de 0,5. Commentaire 2 à 3 phrases, tutoiement. ${NOSRC}\nRéponds uniquement en JSON : {"transcription":"…","annotee":"…","lisible":true,"note":0,"commentaire":"…","erreurs":["…"],"acquis":["…"]}`, {images:[blob, ...smp.blobs], modelTier:"complex"});
        await write("feuilles/" + C.id, {copies:{[S.corrEleve]:{validee:false, answers:{[qid]:{transcription:String(r.transcription || ""), transcriptionIA:String(r.transcription || ""), annot:String(r.annotee || r.transcription || ""), lisible:r.lisible !== false,
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
        const a0 = cp.answers?.[qid]; if (a0?.crop && q.type !== "qcm") bankPush([{asset:a0.crop, texteIA:a0.transcriptionIA ?? a0.transcription ?? "", texte:text, source:"correction", ...bankMeta(C)}]);
      }catch(e){ st.textContent = aiErr(e?.code); t.disabled = false; }
      return;
    }
    if (t.id === "validate"){ const cp = feuille(C.id).copies[S.corrEleve];
      const miss = C.questions.map((q, k) => ({q, k})).filter(x => noteOf(cp?.answers?.[x.q.id]) == null);
      if (miss.length && d.sure !== "1"){ d.sure = "1"; t.textContent = `Valider (${miss.map(x => "Q" + (x.k + 1)).join(", ")} à 0)`;
        toast(`Pas de note pour ${miss.map(x => "Q" + (x.k + 1)).join(", ")} : page non scannée ? Scanne-la, saisis la note, ou reclique pour mettre 0.`, 7000); return; }
      const answers = {}; C.questions.forEach(q => { answers[q.id] = noteOf(cp?.answers?.[q.id]) == null ? {valide:true, note:0, transcription:"", annot:"", commentaire:"Question non scannée ou sans réponse.", lisible:true} : {valide:true}; });
      await write("feuilles/" + C.id, {copies:{[S.corrEleve]:{validee:true, answers}}}, "update");
      bankPush(C.questions.filter(q => q.type !== "qcm").map(q => cp?.answers?.[q.id]).filter(a => a?.crop && a.transcription && a.lisible !== false && !a.auto).map(a => ({asset:a.crop, texteIA:a.transcriptionIA ?? a.transcription, texte:a.transcription, source:"validation", ...bankMeta(C)})));
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
      try { const id = await createRattrapage(C, eleveOf(C, S.corrEleve)); S.editId = id; S.step = "preparer"; return go("edit"); } catch(e){ toast(aiErr(e?.code)); t.disabled = false; t.textContent = "Rattrapage"; } return; }
  }

  /* analyse */
  if (S.view === "analyse"){
    const C = ctrl(S.anCtrl);
    if (d.ratt){ t.disabled = true; t.textContent = "Création…";
      try { await createRattrapage(C, eleveOf(C, d.ratt)); toast("Rattrapage créé : ouvre-le pour l'imprimer."); } catch(e){ toast(aiErr(e?.code)); t.disabled = false; t.textContent = "Créer"; } return; }
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

/* Champs de l'éditeur de contrôle : applique la saisie au contrôle et le renvoie (null si ce n'est pas un champ de l'éditeur) */
function applyEdit(el){
  const d = el.dataset, c = S.view === "edit" ? ctrl(S.editId) : null; if (!c) return null;
  if (editPending && editPending.id === c.id && editPending !== c) Object.assign(c, structuredClone(editPending));   // le magasin a été rechargé entre-temps : on garde la saisie en attente
  if (d.c){ c[d.c] = el.type === "number" ? +el.value : el.value; }
  else if (el.id === "e-diff"){ c.differencie = el.checked; }
  else if (d.m){ c.mise = {...(c.mise || {}), [d.m]: ["police","lh"].includes(d.m) ? +el.value : el.value}; }
  else if (d.bo){ c.bonus = {...(c.bonus || {}), [d.bo]:+el.value}; }
  else if (el.id === "m-bar"){ c.mise = {...(c.mise || {}), bareme:el.checked}; }
  else if (d.q !== undefined){ const q = c.questions[+d.q]; if (!q) return null;
    if (d.vk === "choixRaw"){ const lines = el.value.split("\n").map(x => x.trim()).filter(Boolean); q.v = q.v || {};
      const o = {...(q.v[d.lv] || {enonce:""}), choix:lines.map(x => x.replace(/^\*\s*/, "")), bonnes:lines.map((x, j) => x.startsWith("*") ? j : -1).filter(j => j >= 0)};
      o.corrige = "Bonne(s) réponse(s) : " + o.bonnes.map(n => "ABCDEF"[n]).join(", "); o.criteres = "Tout ou rien."; q.v[d.lv] = o; }
    else if (d.vk){ q.v = q.v || {}; q.v[d.lv] = {...(q.v[d.lv] || {enonce:"", corrige:"", criteres:""}), [d.vk]:el.value}; }
    else if (d.k === "erreurs") q.erreurs = el.value.split(";").map(s => s.trim()).filter(Boolean);
    else if (d.k === "type"){ if (el.value) q.type = "qcm"; else delete q.type; }
    else q[d.k] = ["points","lignes"].includes(d.k) ? +el.value : el.value; }
  else return null;
  return c;
}
document.addEventListener("input", ev => {
  const el = ev.target, d = el.dataset;
  if (el.id === "c-texte" || el.id === "c-titre"){ S.coursDraft = {...(S.coursDraft || {}), texte:$("#c-texte")?.value, titre:$("#c-titre")?.value}; }
  if (d.p){ S.params[d.p] = el.value; }
  if (d.live !== undefined && S.view === "edit" && (d.c || d.q !== undefined)){   // texte : enregistré pendant la frappe, sans attendre la sortie du champ
    const c = applyEdit(el); if (!c) return; editPending = c; SAVE.dirty = true; saveState(); clearTimeout(editTimer); editTimer = setTimeout(flushEdit, 700); }
});
document.addEventListener("change", async ev => {
  const el = ev.target, d = el.dataset;
  if (el.id === "c-files"){ const fs = Array.from(el.files); el.value = ""; if (!fs.length) return;
    S.coursDraft = {...(S.coursDraft || {}), titre:$("#c-titre").value, matiere:$("#c-mat").value, niveau:$("#c-niv").value, texte:$("#c-texte").value};
    if (!$("#c-titre").value) $("#c-titre").value = fs[0].name.replace(/\.[^.]+$/, "");
    try { await importCourseFiles(fs); } catch(e){ console.error(e); $("#c-st").textContent = e?.code ? aiErr(e.code) : "Lecture du fichier impossible."; } return; }
  if (el.id === "c-mat" || el.id === "c-niv"){ S.coursDraft = {...(S.coursDraft || {}), matiere:$("#c-mat").value, niveau:$("#c-niv").value}; return; }
  if (d.p){ S.params[d.p] = el.value; if (d.p === "niveau") S.params.classeId = S.params.classeId || ""; if (d.p === "niveau" || d.p === "classeId") render(); return; }
  if (d.type){ const s = new Set(S.params.types); el.checked ? s.add(d.type) : s.delete(d.type); S.params.types = [...s]; return; }
  if (el.id === "p-diff"){ S.params.differencie = el.checked; return; }
  if (d.kind){ S.params.kind = d.kind; return render(); }
  if (el.id === "sc-files"){ const fs = Array.from(el.files); el.value = ""; if (fs.length) addScans(fs); return; }
  if (d.mq){ const it = S.queue.find(x => x.id === d.mq); it[d.f] = d.f === "page" ? +el.value : el.value; if (d.f === "ctrlId") it.eleveId = ""; return render(); }
  if (el.id === "rs-ctrl"){ S.rsCtrl = el.value; S.rsEl = ""; return render(); }
  if (el.id === "rs-el"){ S.rsEl = el.value; return; }
  if (el.id === "lvlMat"){ S.levelMat = el.value; S.suggestions = null; return render(); }
  if (d.lvl){ const cl = classe(S.classeSel); await write("classes/" + cl.id, {eleves:cl.eleves.map(e => e.id === d.lvl ? {...e, niveaux:{...(e.niveaux || {}), [S.levelMat]:el.value}} : e)}, "update"); return; }
  if (el.id === "corrSel"){ S.corrCtrl = el.value; S.corrEleve = null; return render(); }
  if (el.id === "anSel"){ S.anCtrl = el.value; return render(); }
  if (d.bonus){ const C = ctrl(S.corrCtrl), mx = +C.bonus?.[d.bonus] || 0; const v = el.value === "" ? null : clamp(half(+el.value), 0, mx);
    await write("feuilles/" + C.id, {copies:{[S.corrEleve]:{validee:false, bonusProf:{[d.bonus]:v}}}}, "update"); return; }
  if (el.id === "qbqSel"){ S.corrQ = el.value; return render(); }
  if (d.score){ const C = ctrl(S.corrCtrl), q = C.questions.find(x => x.id === d.score); const v = el.value === "" ? null : clamp(half(+el.value), 0, +q.points);
    await write("feuilles/" + C.id, {copies:{[d.eid || S.corrEleve]:{validee:false, answers:{[d.score]:{note:v, valide:false}}}}}, "update"); return; }
  /* editor fields */
  if (el.id === "prevEl"){ S.previewEleve = el.value; return drawPreview(); }
  const c = applyEdit(el); if (!c) return;
  editPending = null; clearTimeout(editTimer);
  await saveCtrl(c);
});

/* ================= Boot ================= */
applyRoute(); render();
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
    if (window.TIKOUN_CONFIG?.accounts){ await bootAccounts(); return; }
    if (window.TIKOUN_CONFIG?.storage === "server"){
      const ok = await fetch("/api/check", {credentials:"same-origin", headers:{"x-tikoun-code":accessCode()}}).then(r => r.ok).catch(() => false);
      if (ok) await startServer(); else { NEED_CODE = true; refreshCaps(); render(); }
      return;
    }
    try { DB = await localDB(); ASSETS = await localAssets(); } catch(e){ console.warn(e); DB = memDB(); LOCAL = true; }
    NEED_CODE = !!(window.TIKOUN_CONFIG?.codeRequired && !accessCode());
    refreshCaps(); render();
  } else {
    const use = n => window.claude.use(n).catch(() => null);
    [DB, AI, ASSETS, DL] = await Promise.all([use("db"), use("sample"), use("assets"), use("downloads")]);
    if (AI) LIM = await AI.limits().catch(() => null);
    if (!DB){ DB = memDB(); LOCAL = true; }
    $("#caps").textContent = "Menu"; $("#upst").innerHTML = [["IA", AI], ["Photos IA", LIM?.images], ["Sauvegarde", !LOCAL], ["Scans stockés", ASSETS], ["PDF", DL]].map(([l, v]) => `${l} ${v ? "✓" : "✗"}`).join(" · ");
  }
  for (const col of ["classes","cours","controles"]){
    DB.collection(col).onSnapshot(s => { store[col] = s.docs.map(x => ({id:x.id, ...structuredClone(x.data())})); scheduleRender(); }, e => toast("Lecture impossible : " + (e?.code || "")));
  }
  for (const col of ["ecritures","bilans"]) DB.collection(col).onSnapshot(s => { const m = {}; s.docs.forEach(x => m[x.id] = structuredClone(x.data())); store[col] = m; scheduleRender(); }, e => console.warn(e));
  DB.collection("feuilles").onSnapshot(s => { const m = {}; s.docs.forEach(x => m[x.id] = structuredClone(x.data())); store.feuilles = m; scheduleRender(); }, e => console.warn(e));
})();
