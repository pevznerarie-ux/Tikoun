// Mastery · serveur de la plateforme (Railway ou tout hébergeur Node) — aucune dépendance.
// Il sert le site, garde les données (Volume Railway monté sur /data), gère les comptes des professeurs
// et relaie l'IA avec la clé de l'école (jamais envoyée aux navigateurs).
//
// Variables d'environnement (Railway → Variables) :
//   ANTHROPIC_API_KEY : clé IA de l'école
//   MASTERY_CODE      : code de l'établissement, demandé UNE fois pour créer le premier compte administrateur
//                       (l'ancienne variable TIKOUN_CODE reste acceptée)
//   AI_MAX_PER_DAY    : plafond d'appels IA par jour, tous comptes confondus (défaut 400)
//   AI_MAX_PER_USER_DAY : plafond d'appels IA par jour et par professeur (défaut 80)
//   SIGNUP            : "off" pour fermer l'inscription libre des professeurs (ouverte par défaut)
//   MODEL_QUICK, MODEL_DEFAULT, MODEL_COMPLEX : modèles (défaut économique)
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = __dirname, PORT = process.env.PORT || 3000;
const TYPES = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json",
  ".md":"text/markdown; charset=utf-8", ".png":"image/png", ".jpg":"image/jpeg", ".svg":"image/svg+xml", ".ico":"image/x-icon", ".webmanifest":"application/manifest+json", ".txt":"text/plain; charset=utf-8"};
const env = k => (process.env[k] || "").trim();
const MODELS = () => ({quick:env("MODEL_QUICK") || "claude-haiku-4-5-20251001", default:env("MODEL_DEFAULT") || "claude-haiku-4-5-20251001", complex:env("MODEL_COMPLEX") || "claude-sonnet-5"});

function send(res, status, body, type = "text/plain; charset=utf-8", extra = {}){
  res.writeHead(status, {"Content-Type":type, "X-Content-Type-Options":"nosniff", "Referrer-Policy":"same-origin", ...extra}); res.end(body);
}
const sendJ = (res, status, obj, extra) => send(res, status, JSON.stringify(obj), TYPES[".json"], extra);
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
async function readBody(req, max){ const chunks = []; let size = 0; for await (const c of req){ size += c.length; if (size > max) throw new Error("too_large"); chunks.push(c); } return Buffer.concat(chunks); }
const readJSON = async (req, max = 8e6) => JSON.parse((await readBody(req, max)).toString("utf8") || "null");
const ipOf = req => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();

/* ---------- Stockage (Volume Railway) ---------- */
const DATA = env("DATA_DIR") || env("RAILWAY_VOLUME_MOUNT_PATH") || path.join(ROOT, "data");
const PERSISTENT = !!(env("DATA_DIR") || env("RAILWAY_VOLUME_MOUNT_PATH"));
const DOCDIR = path.join(DATA, "docs"), FILEDIR = path.join(DATA, "files");
fs.mkdirSync(DOCDIR, {recursive:true}); fs.mkdirSync(FILEDIR, {recursive:true});
const writeAtomic = (f, obj) => { const tmp = f + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(obj)); fs.renameSync(tmp, f); };
const readJ = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch(e){ return d; } };

const DOCS = new Map();
for (const f of fs.readdirSync(DOCDIR)) if (f.endsWith(".json")){ try { DOCS.set(decodeURIComponent(f.slice(0, -5)), JSON.parse(fs.readFileSync(path.join(DOCDIR, f), "utf8"))); } catch(e){ console.warn("Document illisible", f); } }
const EPOCH = Date.now().toString(36) + crypto.randomBytes(3).toString("hex"); let SEQ = 0; const LOG = [];
const PATH_OK = p => /^[A-Za-z0-9_\-.~:@+]{1,200}(\/[A-Za-z0-9_\-.~:@+]{1,200}){1,15}$/.test(p) && !p.split("/").some(x => x === "." || x === "..");
const docFile = p => path.join(DOCDIR, encodeURIComponent(p) + ".json");
function persist(p, data){
  const esp = (data || DOCS.get(p))?.espace || null, own = (data || DOCS.get(p))?.owner || null;
  if (data == null){ DOCS.delete(p); fs.rmSync(docFile(p), {force:true}); } else { DOCS.set(p, data); writeAtomic(docFile(p), data); }
  LOG.push({seq:++SEQ, path:p, esp, own}); if (LOG.length > 20000) LOG.splice(0, LOG.length - 20000);
}
const isObj = x => x && typeof x === "object" && !Array.isArray(x);
const merge = (a, b) => { if (!isObj(a) || !isObj(b)) return b; const r = {...a}; for (const k of Object.keys(b)) r[k] = merge(a[k], b[k]); return r; };

/* ---------- Comptes des professeurs ---------- */
const USERS_F = path.join(DATA, "users.json"), SESS_F = path.join(DATA, "sessions.json");
let USERS = readJ(USERS_F, []); let SESS = readJ(SESS_F, {});
for (const u of USERS) if (!u.plan){ u.plan = u.role === "admin" ? "pro" : "essentiel"; u.options = {exercices:u.role === "admin"}; }
const saveUsers = () => writeAtomic(USERS_F, USERS);
/* Espaces : chaque professeur inscrit seul a son espace privé (ses classes, ses élèves, ses contrôles).
   Les comptes créés par un administrateur rejoignent l'espace de cet administrateur (classes partagées). */
const firstAdmin = () => USERS.find(u => u.role === "admin");
function migrateEspaces(){
  let ch = false;
  for (const u of USERS) if (!u.espace){ u.espace = u.role === "admin" ? u.id : (firstAdmin()?.espace || firstAdmin()?.id || u.id); ch = true; }
  if (ch) saveUsers();
  const def = firstAdmin()?.espace; if (!def) return;
  for (const [k, v] of DOCS) if (isObj(v) && !v.espace){
    const who = USERS.find(u => u.id === (v.owner || v.createdBy)); persist(k, {...v, espace:who?.espace || def});
  }
}
let sessTimer = null; const saveSess = () => { clearTimeout(sessTimer); sessTimer = setTimeout(() => writeAtomic(SESS_F, SESS), 500); };
const hashPw = (pw, salt = crypto.randomBytes(16).toString("hex")) => salt + ":" + crypto.scryptSync(String(pw), salt, 64).toString("hex");
const checkPw = (pw, stored) => { const [salt, h] = String(stored || "").split(":"); if (!salt || !h) return false; return same(crypto.scryptSync(String(pw), salt, 64).toString("hex"), h); };
/* Abonnements : « essentiel » (contrôles, correction, suivi) · « pro » (+ option Exercices, activée par la direction) */
const PLANS = ["essentiel", "pro"];
const entitled = u => !!u && u.plan === "pro" && !!u.options?.exercices;
const AFF = ["ecole", "nom", "les2"];
const pub = u => ({id:u.id, email:u.email, nom:u.nom, role:u.role, ecole:u.ecole || null, affichage:AFF.includes(u.affichage) ? u.affichage : "les2", plan:u.plan || "essentiel", options:{exercices:!!u.options?.exercices}, can:{exercices:entitled(u)}, actif:u.actif !== false, statut:u.statut || "valide", planDemande:u.planDemande || null, createdAt:u.createdAt});
const sidOf = req => ((req.headers.cookie || "").match(/(?:^|;\s*)sid=([a-f0-9]{64})/) || [])[1] || "";
function userOf(req){
  const s = SESS[sidOf(req)]; if (!s || s.exp < Date.now()) return null;
  const u = USERS.find(x => x.id === s.uid); return u && u.actif !== false && (u.statut || "valide") === "valide" ? u : null;
}
function openSession(req, res, u, body = {}){
  const sid = crypto.randomBytes(32).toString("hex"); SESS[sid] = {uid:u.id, exp:Date.now() + 180 * 864e5}; saveSess();
  for (const [k, v] of Object.entries(SESS)) if (v.exp < Date.now()) delete SESS[k];
  const secure = String(req.headers["x-forwarded-proto"] || "").includes("https") ? "; Secure" : "";
  return sendJ(res, 200, {user:pub(u), ...body}, {"Set-Cookie":`sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${180 * 86400}${secure}`});
}
const tries = new Map();
const tooMany = ip => { const now = Date.now(), l = (tries.get(ip) || []).filter(t => now - t < 15 * 60e3); l.push(now); tries.set(ip, l); return l.length > 20; };
const validEmail = e => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e);

/* Propriété : un prof modifie ses contrôles, cours, copies et bilans ; les classes sont communes ; l'admin peut tout. */
const OWNED = ["controles","cours","feuilles","bilans","quizzes","quizrep"];
function ownerOf(p){ const [col, id] = p.split("/"); if (col === "feuilles") return DOCS.get("controles/" + id)?.owner || DOCS.get(p)?.owner || null; return DOCS.get(p)?.owner || null; }
function espaceFor(p, u){ const [col, id] = p.split("/"); const cur = DOCS.get(p); if (cur?.espace) return cur.espace; if (col === "feuilles") return DOCS.get("controles/" + id)?.espace || u.espace; return u.espace; }
const visible = (u, v) => u.role === "admin" || (isObj(v) && (v.espace === u.espace || v.owner === u.id));
const canWrite = (u, p) => { if (u.role === "admin") return true; const cur = DOCS.get(p); if (cur && cur.espace && cur.espace !== u.espace) return false; const o = ownerOf(p); return !o || o === u.id || !OWNED.includes(p.split("/")[0]); };
const docsFor = u => Object.fromEntries([...DOCS].filter(([k, v]) => visible(u, v)));

/* ---------- Annuaire officiel des établissements (data.education.gouv.fr, données ouvertes) ---------- */
const ANNU = env("ANNUAIRE_URL") || "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records";
const odsq = x => String(x || "").replace(/["\\]/g, " ").trim().slice(0, 80);
const mapEt = r => ({uai:String(r.identifiant_de_l_etablissement || ""), nom:String(r.nom_etablissement || ""), adresse:[r.adresse_1, r.adresse_2].filter(Boolean).join(", "),
  cp:String(r.code_postal || ""), ville:String(r.nom_commune || ""), type:String(r.type_etablissement || ""), statut:String(r.statut_public_prive || "")});
const annuCache = new Map();
async function annuaire(where){
  if (annuCache.has(where)) return annuCache.get(where);
  const r = await fetch(ANNU + "?limit=12&where=" + encodeURIComponent(where), {signal:AbortSignal.timeout(9000)});
  if (!r.ok) throw new Error("annuaire_" + r.status);
  const j = await r.json(); const list = (j.results || (j.records || []).map(x => x.record?.fields || x.fields || {})).map(mapEt).filter(x => x.nom && x.uai);
  annuCache.set(where, list); if (annuCache.size > 500) annuCache.delete(annuCache.keys().next().value); return list;
}
async function searchEcoles(q, cp){
  const parts = []; if (odsq(q)) parts.push(`"${odsq(q)}"`);
  cp = String(cp || "").replace(/\s/g, ""); if (/^\d{5}$/.test(cp)) parts.push(`code_postal="${cp}"`); else if (/^\d{2,4}$/.test(cp)) parts.push(`startswith(code_postal, "${cp}")`);
  return parts.length ? annuaire(parts.join(" AND ")) : [];
}
/* Établissement déclaré par un prof : vérifié si l'identifiant officiel (UAI) est retrouvé dans l'annuaire, sinon enregistré « non vérifié ». */
async function checkEcole(e){
  if (!isObj(e)) return null;
  const uai = String(e.uai || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 10);
  if (uai){
    try { const hit = (await annuaire(`identifiant_de_l_etablissement="${uai}"`))[0]; if (hit) return {...hit, verifiee:true, source:"annuaire", at:new Date().toISOString()}; }
    catch(err){ console.warn("Annuaire injoignable :", err.message); }
  }
  const nom = String(e.nom || "").trim().slice(0, 120), cp = String(e.cp || "").replace(/\s/g, "").slice(0, 5), ville = String(e.ville || "").trim().slice(0, 80);
  if (!nom || !/^\d{5}$/.test(cp) || !ville) return {error:"Indique le nom de l'école, son code postal (5 chiffres) et sa ville"};
  return {uai:"", nom, adresse:String(e.adresse || "").trim().slice(0, 160), cp, ville, type:"", statut:"", verifiee:false, source:uai ? "a_verifier" : "manuel", at:new Date().toISOString()};
}
const signupOpen = () => env("SIGNUP").toLowerCase() !== "off";

async function accounts(req, res, url, p, u){
  if (p === "/api/ecoles" && req.method === "GET"){
    if (tooMany("ec:" + ipOf(req))) return sendJ(res, 429, {error:{message:"Trop de recherches, réessaie dans quelques minutes"}});
    try { return sendJ(res, 200, {ecoles:await searchEcoles(url.searchParams.get("q"), url.searchParams.get("cp"))}); }
    catch(e){ console.warn("Annuaire :", e.message); return sendJ(res, 502, {error:{message:"Annuaire officiel injoignable pour le moment : tu peux enregistrer ton école manuellement."}}); }
  }
  if (p === "/api/register" && req.method === "POST"){
    if (!signupOpen()) return sendJ(res, 403, {error:{message:"Les inscriptions sont fermées"}});
    if (tooMany(ipOf(req))) return sendJ(res, 429, {error:{message:"Trop d'essais, réessaie dans 15 minutes"}});
    const b = await readJSON(req, 2e4) || {}; const email = String(b.email || "").trim().toLowerCase();
    if (!validEmail(email)) return sendJ(res, 400, {error:{message:"E-mail invalide"}});
    if (USERS.some(v => v.email === email)) return sendJ(res, 409, {error:{message:"Un compte existe déjà avec cet e-mail"}});
    if (String(b.password || "").length < 8) return sendJ(res, 400, {error:{message:"Mot de passe : 8 caractères minimum"}});
    if (!String(b.nom || "").trim()) return sendJ(res, 400, {error:{message:"Indique ton nom"}});
    const ecole = await checkEcole(b.ecole); if (!ecole || ecole.error) return sendJ(res, 400, {error:{message:ecole?.error || "Indique ton école"}});
    const id = crypto.randomBytes(8).toString("hex");
    const planDemande = PLANS.includes(b.plan) ? b.plan : "essentiel";
    const n = {id, email, nom:String(b.nom).trim().slice(0, 80), role:"prof", plan:"essentiel", planDemande, statut:"en_attente", options:{exercices:false}, espace:id, ecole, affichage:AFF.includes(b.affichage) ? b.affichage : "les2", pw:hashPw(b.password), createdAt:new Date().toISOString(), inscription:"libre"};
    USERS.push(n); saveUsers(); console.log(`Inscription à valider · ${email} · ${planDemande} · ${ecole.nom} (${ecole.verifiee ? "vérifiée " + ecole.uai : "non vérifiée"})`);
    return sendJ(res, 200, {pending:true, user:{nom:n.nom, email:n.email, ecole:n.ecole, planDemande}});
  }
  if (p === "/api/me" && req.method === "GET") return u ? sendJ(res, 200, {user:pub(u)}) : sendJ(res, 401, {setup:USERS.length === 0});
  if (p === "/api/setup" && req.method === "POST"){
    if (USERS.length) return sendJ(res, 409, {error:{message:"Le compte administrateur existe déjà"}});
    if (!(env("MASTERY_CODE") || env("TIKOUN_CODE"))) return sendJ(res, 503, {error:{message:"Définis la variable MASTERY_CODE sur le serveur"}});
    if (tooMany(ipOf(req))) return sendJ(res, 429, {error:{message:"Trop d'essais, réessaie dans 15 minutes"}});
    const b = await readJSON(req, 1e4) || {};
    if (!same(String(b.code || ""), (env("MASTERY_CODE") || env("TIKOUN_CODE")))) return sendJ(res, 401, {error:{message:"Code de l'établissement incorrect"}});
    const email = String(b.email || "").trim().toLowerCase(); if (!validEmail(email) || String(b.password || "").length < 8) return sendJ(res, 400, {error:{message:"E-mail valide et mot de passe de 8 caractères minimum"}});
    const aid = crypto.randomBytes(8).toString("hex");
    const a = {id:aid, espace:aid, email, nom:String(b.nom || "Direction").slice(0, 80), role:"admin", plan:"pro", options:{exercices:true}, affichage:"les2", pw:hashPw(b.password), createdAt:new Date().toISOString()};
    USERS.push(a); saveUsers(); migrateEspaces();
    for (const [k, v] of DOCS) if (OWNED.includes(k.split("/")[0]) && isObj(v) && !v.owner) persist(k, {...v, owner:a.id});   // données déjà saisies → à l'admin
    return openSession(req, res, a);
  }
  if (p === "/api/login" && req.method === "POST"){
    if (tooMany(ipOf(req))) return sendJ(res, 429, {error:{message:"Trop d'essais, réessaie dans 15 minutes"}});
    const b = await readJSON(req, 1e4) || {}; const x = USERS.find(v => v.email === String(b.email || "").trim().toLowerCase());
    if (!x || !checkPw(b.password, x.pw)) return sendJ(res, 401, {error:{message:"E-mail ou mot de passe incorrect"}});
    if (x.statut === "en_attente") return sendJ(res, 403, {pending:true, error:{message:"Ton inscription est en attente de validation par l'équipe Mastery. Tu pourras te connecter dès qu'elle sera acceptée."}});
    if (x.statut === "refuse") return sendJ(res, 403, {error:{message:"Ton inscription n'a pas été acceptée. Contacte l'équipe Mastery."}});
    if (x.actif === false) return sendJ(res, 401, {error:{message:"Compte désactivé"}});
    return openSession(req, res, x, {mustChange:!!x.mustChange});
  }
  if (p === "/api/logout" && req.method === "POST"){ delete SESS[sidOf(req)]; saveSess(); return sendJ(res, 200, {}, {"Set-Cookie":"sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"}); }
  if (!u) return sendJ(res, 401, {error:{message:"Connexion requise"}});
  if (p === "/api/me/password" && req.method === "POST"){
    const b = await readJSON(req, 1e4) || {};
    if (!u.mustChange && !checkPw(b.old, u.pw)) return sendJ(res, 401, {error:{message:"Mot de passe actuel incorrect"}});
    if (String(b.password || "").length < 8) return sendJ(res, 400, {error:{message:"8 caractères minimum"}});
    u.pw = hashPw(b.password); delete u.mustChange; saveUsers(); return sendJ(res, 200, {user:pub(u)});
  }
  if (p === "/api/me" && req.method === "PATCH"){
    const b = await readJSON(req, 2e4) || {};
    if (b.nom && String(b.nom).trim()) u.nom = String(b.nom).trim().slice(0, 80);
    if (AFF.includes(b.affichage)) u.affichage = b.affichage;
    if (b.ecole){ const e = await checkEcole(b.ecole); if (!e || e.error) return sendJ(res, 400, {error:{message:e?.error || "École invalide"}}); u.ecole = e; }
    saveUsers(); return sendJ(res, 200, {user:pub(u)});
  }
  if (u.role !== "admin") return sendJ(res, 403, {error:{message:"Réservé à l'administrateur"}});
  if (p === "/api/users" && req.method === "GET") return sendJ(res, 200, {users:USERS.map(pub)});
  if (p === "/api/users" && req.method === "POST"){
    const b = await readJSON(req, 1e4) || {}; const email = String(b.email || "").trim().toLowerCase();
    if (!validEmail(email)) return sendJ(res, 400, {error:{message:"E-mail invalide"}});
    if (USERS.some(v => v.email === email)) return sendJ(res, 409, {error:{message:"Ce compte existe déjà"}});
    if (String(b.password || "").length < 8) return sendJ(res, 400, {error:{message:"Mot de passe provisoire : 8 caractères minimum"}});
    const n = {id:crypto.randomBytes(8).toString("hex"), email, nom:String(b.nom || email).slice(0, 80), role:b.role === "admin" ? "admin" : "prof", plan:PLANS.includes(b.plan) ? b.plan : "essentiel", pw:hashPw(b.password), mustChange:true, createdAt:new Date().toISOString(), espace:u.espace, ecole:u.ecole || null, affichage:"les2"};
    n.options = {exercices:n.plan === "pro" && !!b.exercices};
    USERS.push(n); saveUsers(); return sendJ(res, 200, {user:pub(n)});
  }
  const m = p.match(/^\/api\/users\/([a-f0-9]{16})$/);
  if (m){
    const x = USERS.find(v => v.id === m[1]); if (!x) return sendJ(res, 404, {error:{message:"Compte introuvable"}});
    if (req.method === "PATCH"){
      const b = await readJSON(req, 1e4) || {};
      if (x.id === u.id && (b.role === "prof" || b.actif === false)) return sendJ(res, 400, {error:{message:"Tu ne peux pas te retirer tes propres droits"}});
      if (b.nom) x.nom = String(b.nom).slice(0, 80);
      if (b.role === "admin" || b.role === "prof") x.role = b.role;
      if (typeof b.actif === "boolean") x.actif = b.actif;
      if (b.statut === "valide" && x.statut !== "valide"){ x.statut = "valide"; x.valideAt = new Date().toISOString(); x.validePar = u.id;
        if (!b.plan){ x.plan = x.planDemande || x.plan || "essentiel"; x.options = {...(x.options || {}), exercices:x.plan === "pro"}; } }
      if (b.statut === "refuse"){ if (x.id === u.id) return sendJ(res, 400, {error:{message:"Impossible sur ton propre compte"}}); x.statut = "refuse"; for (const [k, v] of Object.entries(SESS)) if (v.uid === x.id) delete SESS[k]; }
      if (PLANS.includes(b.plan)){ x.plan = b.plan; if (b.plan !== "pro") x.options = {...(x.options || {}), exercices:false}; }
      if (typeof b.exercices === "boolean") x.options = {...(x.options || {}), exercices:b.exercices && (x.plan || "essentiel") === "pro"};
      if (b.password){ if (String(b.password).length < 8) return sendJ(res, 400, {error:{message:"8 caractères minimum"}}); x.pw = hashPw(b.password); x.mustChange = true; }
      if (x.actif === false) for (const [k, v] of Object.entries(SESS)) if (v.uid === x.id) delete SESS[k];
      saveUsers(); saveSess(); return sendJ(res, 200, {user:pub(x)});
    }
  }
  return sendJ(res, 404, {error:{message:"Route inconnue"}});
}

async function storage(req, res, url, p, u){
  if (!u) return sendJ(res, 401, {error:{message:"Connexion requise"}});
  try {
    if (p === "/api/db" && req.method === "GET") return sendJ(res, 200, {epoch:EPOCH, seq:SEQ, persistent:PERSISTENT, docs:docsFor(u)});
    if (p === "/api/db/changes" && req.method === "GET"){
      const since = Number(url.searchParams.get("since")) || 0, ep = url.searchParams.get("epoch");
      if (ep !== EPOCH || (LOG.length && since < LOG[0].seq - 1)) return sendJ(res, 200, {reset:true, epoch:EPOCH, seq:SEQ, docs:docsFor(u)});
      const changed = [...new Set(LOG.filter(l => l.seq > since && (u.role === "admin" || l.esp === u.espace || l.own === u.id)).map(l => l.path))];
      return sendJ(res, 200, {epoch:EPOCH, seq:SEQ, changes:changed.map(k => ({path:k, data:DOCS.has(k) ? DOCS.get(k) : null}))});
    }
    if (p === "/api/db/doc"){
      const dp = url.searchParams.get("path") || ""; if (!PATH_OK(dp)) return sendJ(res, 400, {error:{message:"Chemin invalide"}});
      if (!canWrite(u, dp)) return sendJ(res, 403, {error:{message:"Ce document appartient à un autre professeur"}});
      if (req.method === "DELETE"){ persist(dp, null); return sendJ(res, 200, {seq:SEQ}); }
      const body = await readJSON(req); if (!isObj(body)) return sendJ(res, 400, {error:{message:"Objet JSON attendu"}});
      const col = dp.split("/")[0], cur = DOCS.get(dp);
      if (req.method === "PUT" && col === "quizzes" && !cur && !entitled(u))
        return sendJ(res, 403, {error:{message:"Exercices en ligne : forfait Pro avec l'option Exercices"}});
      if (req.method === "PUT" && col === "controles" && body.type === "exercices" && !cur && !entitled(u))
        return sendJ(res, 403, {error:{message:"Option Exercices non activée pour ce compte (abonnement Pro)"}});
      if (req.method === "PUT"){
        const own = cur?.owner || (col === "feuilles" ? ownerOf(dp) : null) || u.id;
        const esp = espaceFor(dp, u);
        persist(dp, OWNED.includes(col) ? {...body, owner:own, espace:esp} : {...body, espace:esp, ...(cur?.createdBy || !cur ? {createdBy:cur?.createdBy || u.id} : {})});
        return sendJ(res, 200, {seq:SEQ});
      }
      if (req.method === "PATCH"){ if (!cur) return sendJ(res, 404, {error:{message:"Document introuvable"}}); const {owner, espace, ...rest} = body; persist(dp, merge(cur, rest)); return sendJ(res, 200, {seq:SEQ}); }
    }
    if (p === "/api/files" && req.method === "POST"){
      const want = url.searchParams.get("id") || "", id = /^[a-z0-9]{8,40}$/.test(want) ? want : crypto.randomBytes(10).toString("hex");
      fs.writeFileSync(path.join(FILEDIR, id + ".jpg"), await readBody(req, 15e6)); return sendJ(res, 200, {id});
    }
    const m = p.match(/^\/api\/files\/([a-z0-9]{8,40})$/);
    if (m && req.method === "GET"){ const f = path.join(FILEDIR, m[1] + ".jpg"); if (!fs.existsSync(f)) return send(res, 404, "Introuvable");
      res.writeHead(200, {"Content-Type":"image/jpeg", "Cache-Control":"private, max-age=86400"}); return fs.createReadStream(f).pipe(res); }
    if (p === "/api/export" && req.method === "GET"){
      const docs = Object.fromEntries([...DOCS].filter(([k, v]) => visible(u, v) && (u.role === "admin" || !OWNED.includes(k.split("/")[0]) || ownerOf(k) === u.id)));
      return send(res, 200, JSON.stringify({tikoun:1, at:new Date().toISOString(), docs, blobs:{}}), TYPES[".json"], {"Content-Disposition":`attachment; filename="mastery-sauvegarde-${new Date().toISOString().slice(0, 10)}.json"`});
    }
    return sendJ(res, 404, {error:{message:"Route inconnue"}});
  } catch(e){ return sendJ(res, e.message === "too_large" ? 413 : 400, {error:{message:e.message === "too_large" ? "Trop lourd" : "Requête invalide"}}); }
}

/* ---------- Espace élève : quiz d'exercices en ligne (code personnel, sans e-mail) ---------- */
const ESESS = new Map();                       // jeton élève → {classeId, eleveId, espace, exp}
const TIRAGES = new Map();                     // tirage en cours → {quizId, key, qids, used, answered, start, exp}
const esidOf = req => ((req.headers.cookie || "").match(/(?:^|;\s*)esid=([a-f0-9]{48})/) || [])[1] || "";
function eleveOf(req){ const s = ESESS.get(esidOf(req)); if (!s || s.exp < Date.now()) return null; const cl = DOCS.get("classes/" + s.classeId); const e = cl?.eleves?.find(x => x.id === s.eleveId && x.code === s.code); return e ? {...s, cl, e} : null; }
function findCode(code){
  code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); if (code.length < 5) return null;
  for (const [k, v] of DOCS) if (k.startsWith("classes/") && isObj(v)){ const e = (v.eleves || []).find(x => x.code === code); if (e) return {classeId:k.slice(8), cl:v, e, code}; }
  return null;
}
const quizOpen = q => q && q.statut === "ouvert" && (!q.fermeture || new Date(q.fermeture + "T23:59:59") >= new Date());
const quizzesFor = el => [...DOCS].filter(([k, q]) => k.startsWith("quizzes/") && isObj(q) && q.classeId === el.classeId && q.statut !== "brouillon").map(([k, q]) => ({id:k.slice(8), q}));
const norm = t => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, "'").replace(/[.;:!?]+$/g, "").replace(/\s+/g, " ").trim();
const numOf = t => { const x = String(t ?? "").replace(/\s/g, "").replace(",", ".").match(/-?\d+(\.\d+)?(\/\d+)?/); if (!x) return NaN; const [a, b] = x[0].split("/"); return b ? parseFloat(a) / parseFloat(b) : parseFloat(a); };
function correct(q, rep){
  if (q.type === "qcm"){ const want = [...(q.bonnes || [])].map(Number).sort().join(","), got = [...(Array.isArray(rep) ? rep : [rep])].map(Number).filter(n => !isNaN(n)).sort().join(","); return want === got; }
  if (q.type === "vf") return String(rep) === String(!!q.bonne);
  if (q.type === "num"){ const v = numOf(rep), w = Number(q.reponse), tol = Math.abs(Number(q.tolerance) || 0) || Math.max(1e-9, Math.abs(w) * 1e-6); return isFinite(v) && Math.abs(v - w) <= tol; }
  if (q.type === "trou") return (q.reponses || []).some(r => norm(r) === norm(rep));
  return null;   // rédigée : corrigée ensuite par le professeur (ou l'IA à sa demande)
}
const publicQ = q => ({id:q.id, type:q.type, notion:q.notion || "", niveau:q.niveau || 1, enonce:q.enonce, choix:q.type === "qcm" ? q.choix : undefined, multi:q.type === "qcm" && (q.bonnes || []).length > 1, unite:q.unite || ""});
const shuffle = a => { for (let i = a.length - 1; i > 0; i--){ const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function repDoc(qid, el, q){ const k = "quizrep/" + qid + "_" + el.eleveId; return {k, d:DOCS.get(k) || {quizId:qid, eleveId:el.eleveId, classeId:el.classeId, owner:q.owner, espace:q.espace, tentatives:[], notions:{}, vues:0, ok:0, redigees:[]}}; }
function pickNext(q, rd, used, notion){
  const acq = n => rd.notions?.[n]?.acquis;
  let pool = (q.questions || []).filter(x => !used.has(x.id) && (!notion || x.notion === notion));
  if (!pool.length) return null;
  const pri = pool.filter(x => !acq(x.notion)); if (pri.length) pool = pri;
  return pool[crypto.randomInt(pool.length)];
}
async function eleveApi(req, res, url, p){
  if (p === "/api/eleve/login" && req.method === "POST"){
    if (tooMany("el:" + ipOf(req))) return sendJ(res, 429, {error:{message:"Trop d'essais : réessaie dans 15 minutes"}});
    const b = await readJSON(req, 2e3) || {}; const hit = findCode(b.code);
    if (!hit) return sendJ(res, 401, {error:{message:"Code inconnu : vérifie ta carte"}});
    const tok = crypto.randomBytes(24).toString("hex"); ESESS.set(tok, {classeId:hit.classeId, eleveId:hit.e.id, code:hit.code, espace:hit.cl.espace, exp:Date.now() + 120 * 864e5});
    const secure = String(req.headers["x-forwarded-proto"] || "").includes("https") ? "; Secure" : "";
    return sendJ(res, 200, {ok:true}, {"Set-Cookie":`esid=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${120 * 86400}${secure}`});
  }
  if (p === "/api/eleve/logout" && req.method === "POST"){ ESESS.delete(esidOf(req)); return sendJ(res, 200, {}, {"Set-Cookie":"esid=; Path=/; Max-Age=0"}); }
  const el = eleveOf(req); if (!el) return sendJ(res, 401, {error:{message:"Connexion requise"}});
  if (p === "/api/eleve/me" && req.method === "GET"){
    const list = quizzesFor(el).map(({id, q}) => { const rd = DOCS.get("quizrep/" + id + "_" + el.eleveId) || {}; const notions = [...new Set((q.questions || []).map(x => x.notion).filter(Boolean))];
      return {id, titre:q.titre, matiere:q.matiere, fermeture:q.fermeture || null, ouvert:quizOpen(q), nbNotions:notions.length, acquises:notions.filter(n => rd.notions?.[n]?.acquis).length, tentatives:(rd.tentatives || []).length, redige:!!q.redige}; });
    return sendJ(res, 200, {eleve:{prenom:el.e.prenom, nom:(el.e.nom || "").slice(0, 1) + ".", classe:el.cl.nom}, quizzes:list});
  }
  const m = p.match(/^\/api\/eleve\/quiz\/([A-Za-z0-9_-]{4,40})\/(tirage|reponse|fin)$/); if (!m || req.method !== "POST") return sendJ(res, 404, {error:{message:"Route inconnue"}});
  const qid = m[1], q = DOCS.get("quizzes/" + qid);
  if (!q || q.classeId !== el.classeId) return sendJ(res, 404, {error:{message:"Quiz introuvable"}});
  if (!quizOpen(q)) return sendJ(res, 403, {error:{message:"Ce quiz est fermé"}});
  const b = await readJSON(req, 2e5) || {};
  for (const [k, t] of TIRAGES) if (t.exp < Date.now()) TIRAGES.delete(k);
  if (m[2] === "tirage"){
    const {d:rd} = repDoc(qid, el, q), used = new Set(), qs = [];
    const allowRedige = !!q.redige && !!b.ordinateur;
    const eligible = {...q, questions:(q.questions || []).filter(x => x.type !== "redige" || allowRedige)};
    const n = Math.min(Number(q.parTentative) || 10, eligible.questions.length);
    while (qs.length < n){ const x = pickNext(eligible, rd, used); if (!x) break; used.add(x.id); qs.push(x); }
    const tid = crypto.randomBytes(12).toString("hex");
    TIRAGES.set(tid, {quizId:qid, eleveId:el.eleveId, qids:qs.map(x => x.id), used, answered:{}, allowRedige, start:Date.now(), exp:Date.now() + 3 * 3600e3});
    return sendJ(res, 200, {tirage:tid, titre:q.titre, questions:shuffle(qs).map(publicQ)});
  }
  const t = TIRAGES.get(String(b.tirage || "")); if (!t || t.quizId !== qid || t.eleveId !== el.eleveId) return sendJ(res, 410, {error:{message:"Session de quiz expirée : recommence"}});
  const {k, d:rd} = repDoc(qid, el, q);
  if (m[2] === "reponse"){
    const x = (q.questions || []).find(y => y.id === b.qid); if (!x || !t.qids.includes(x.id) || t.answered[x.id]) return sendJ(res, 400, {error:{message:"Question invalide"}});
    const ok = correct(x, b.rep); t.answered[x.id] = {ok, rep:b.rep, s:Math.round((Number(b.ms) || 0) / 1000)};
    rd.vues = (rd.vues || 0) + 1; if (ok) rd.ok = (rd.ok || 0) + 1;
    rd.q = rd.q || {}; const qs = rd.q[x.id] || {v:0, ok:0}; qs.v++; if (ok) qs.ok++; rd.q[x.id] = qs;
    if (x.notion){ const nn = rd.notions[x.notion] || {vus:0, ok:0, streak:0}; nn.vus++; if (ok === true){ nn.ok++; nn.streak++; } else if (ok === false) nn.streak = 0; if (nn.streak >= 3) nn.acquis = true; rd.notions[x.notion] = nn; }
    if (ok === null) rd.redigees = [...(rd.redigees || []).slice(-200), {qid:x.id, rep:String(b.rep || "").slice(0, 4000), at:new Date().toISOString(), note:null}];
    rd.derniere = new Date().toISOString(); persist(k, rd);
    let next = null;
    if (ok === false){ const pool = {...q, questions:(q.questions || []).filter(y => y.type !== "redige" || t.allowRedige)}; const y = pickNext(pool, rd, t.used, x.notion); if (y){ t.used.add(y.id); t.qids.push(y.id); next = publicQ(y); } }
    return sendJ(res, 200, {ok, bonne:x.type === "qcm" ? x.bonnes : x.type === "vf" ? !!x.bonne : x.type === "num" ? x.reponse + (x.unite ? " " + x.unite : "") : x.type === "trou" ? (x.reponses || [])[0] : "", explication:x.explication || "", next, acquis:x.notion ? !!rd.notions[x.notion]?.acquis : false});
  }
  if (m[2] === "fin"){
    const a = Object.entries(t.answered), nOk = a.filter(([, v]) => v.ok === true).length, nAuto = a.filter(([, v]) => v.ok !== null).length;
    rd.tentatives = [...(rd.tentatives || []).slice(-100), {at:new Date().toISOString(), n:a.length, ok:nOk, auto:nAuto, dureeS:Math.round((Date.now() - t.start) / 1000)}];
    persist(k, rd); TIRAGES.delete(String(b.tirage));
    const notions = [...new Set((q.questions || []).map(x => x.notion).filter(Boolean))];
    return sendJ(res, 200, {ok:nOk, total:nAuto, redigees:a.length - nAuto, acquises:notions.filter(n => rd.notions?.[n]?.acquis).length, nbNotions:notions.length});
  }
}

/* ---------- IA ---------- */
const day = () => new Date().toISOString().slice(0, 10);
let counter = {day:day(), n:0}; const perIp = new Map(), perUser = new Map();
function allowCall(ip, uid){
  const k = day() + ":" + uid, nu = perUser.get(k) || 0;
  if (nu >= (Number(env("AI_MAX_PER_USER_DAY")) || 80)) return "Plafond quotidien d'appels IA atteint pour ton compte : réessaie demain.";
  if (perUser.size > 5000) perUser.clear();
  if (counter.day !== day()) counter = {day:day(), n:0};
  if (counter.n >= (Number(env("AI_MAX_PER_DAY")) || 400)) return "Plafond quotidien d'appels IA atteint.";
  const now = Date.now(), list = (perIp.get(ip) || []).filter(t => now - t < 3600e3);
  if (list.length >= 120) return "Trop d'appels IA depuis cet appareil : réessaie dans une heure.";
  list.push(now); perIp.set(ip, list); counter.n++; perUser.set(k, nu + 1); return null;
}
async function aiProxy(req, res, u){
  if (!env("ANTHROPIC_API_KEY")) return sendJ(res, 503, {error:{message:"ANTHROPIC_API_KEY manquante sur le serveur"}});
  if (!u) return sendJ(res, 401, {error:{message:"Connexion requise"}});
  let body; try { body = await readJSON(req, 40e6); } catch(e){ return sendJ(res, e.message === "too_large" ? 413 : 400, {error:{message:"Requête invalide"}}); }
  if (body?.feature === "exercices" && !entitled(u)) return sendJ(res, 403, {error:{message:"Option Exercices non activée pour ce compte (abonnement Pro)"}});
  const stop = allowCall(ipOf(req), u.id); if (stop) return sendJ(res, 429, {error:{message:stop}});
  const M = MODELS(), model = M[body?.tier] || M.default;
  const r = await fetch((env("ANTHROPIC_BASE_URL") || "https://api.anthropic.com") + "/v1/messages", {method:"POST",
    headers:{"content-type":"application/json", "x-api-key":env("ANTHROPIC_API_KEY"), "anthropic-version":"2023-06-01"},
    body:JSON.stringify({model, max_tokens:8000, messages:body?.messages})}).catch(() => null);
  if (!r) return sendJ(res, 502, {error:{message:"IA injoignable"}});
  const txt = await r.text();
  if (r.ok){ try { const us = JSON.parse(txt).usage; console.log(`IA ${model} · ${u.email} · entrée ${us?.input_tokens} · sortie ${us?.output_tokens}`); } catch(e){} }
  else console.warn("IA erreur", r.status, txt.slice(0, 300));
  send(res, r.status, txt, TYPES[".json"]);
}

/* ---------- Routes ---------- */
migrateEspaces();
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x"); let p = decodeURIComponent(url.pathname);
    if (p === "/health") return send(res, 200, "ok");
    const u = userOf(req);
    if (p.startsWith("/api/eleve/")) return await eleveApi(req, res, url, p);
    if (p === "/eleve" || p === "/eleve/") p = "/eleve.html";
    if (p.startsWith("/api/")){
      if (req.method === "POST" && p === "/api/ai") return await aiProxy(req, res, u);
      if (p.startsWith("/api/db") || p.startsWith("/api/files") || p === "/api/export") return await storage(req, res, url, p, u);
      return await accounts(req, res, url, p, u);
    }
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Méthode non autorisée");
    if (p === "/config.js")
      return send(res, 200, "window.TIKOUN_CONFIG = " + JSON.stringify({aiEndpoint:env("ANTHROPIC_API_KEY") ? "/api/ai" : "", storage:"server", accounts:true, signup:signupOpen(), persistent:PERSISTENT}) + ";\n", TYPES[".js"], {"Cache-Control":"no-store"});
    if (p === "/" || p === "") p = u ? "/index.html" : "/landing.html";
    if (p === "/app" || p === "/app/") p = "/index.html";
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT + path.sep) || file.startsWith(path.resolve(DATA)) || /^\/(data|src)(\/|$)/.test(p) || p.split("/").some(s => s.startsWith(".")) || /server\.js$|package(-lock)?\.json$|railway\.json$/.test(file)) return send(res, 404, "Introuvable");
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, "Introuvable");
      res.writeHead(200, {"Content-Type":TYPES[path.extname(file)] || "application/octet-stream", "X-Content-Type-Options":"nosniff", "Cache-Control":/\.html$/.test(p) ? "no-cache" : "public, max-age=300"});
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(file).pipe(res);
    });
  } catch(e){ console.error(e); send(res, 500, "Erreur serveur"); }
}).listen(PORT, "0.0.0.0", () => console.log(`Mastery en ligne sur le port ${PORT} · ${USERS.length} compte(s) · ${env("ANTHROPIC_API_KEY") ? "IA serveur" : "IA non configurée"} · données ${PERSISTENT ? "sur le volume " + DATA : "TEMPORAIRES : ajoute un Volume Railway monté sur /data"}`));
