// Tikoun · serveur de l'établissement (Railway ou tout hébergeur Node) — aucune dépendance.
// Il sert le site, garde les données (Volume Railway monté sur /data), gère les comptes des professeurs
// et relaie l'IA avec la clé de l'école (jamais envoyée aux navigateurs).
//
// Variables d'environnement (Railway → Variables) :
//   ANTHROPIC_API_KEY : clé IA de l'école
//   TIKOUN_CODE       : code de l'établissement, demandé UNE fois pour créer le premier compte administrateur
//   AI_MAX_PER_DAY    : plafond d'appels IA par jour (défaut 400)
//   MODEL_QUICK, MODEL_DEFAULT, MODEL_COMPLEX : modèles (défaut économique)
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = __dirname, PORT = process.env.PORT || 3000;
const TYPES = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json",
  ".md":"text/markdown; charset=utf-8", ".png":"image/png", ".jpg":"image/jpeg", ".svg":"image/svg+xml", ".ico":"image/x-icon", ".txt":"text/plain; charset=utf-8"};
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
  if (data == null){ DOCS.delete(p); fs.rmSync(docFile(p), {force:true}); } else { DOCS.set(p, data); writeAtomic(docFile(p), data); }
  LOG.push({seq:++SEQ, path:p}); if (LOG.length > 20000) LOG.splice(0, LOG.length - 20000);
}
const isObj = x => x && typeof x === "object" && !Array.isArray(x);
const merge = (a, b) => { if (!isObj(a) || !isObj(b)) return b; const r = {...a}; for (const k of Object.keys(b)) r[k] = merge(a[k], b[k]); return r; };

/* ---------- Comptes des professeurs ---------- */
const USERS_F = path.join(DATA, "users.json"), SESS_F = path.join(DATA, "sessions.json");
let USERS = readJ(USERS_F, []); let SESS = readJ(SESS_F, {});
const saveUsers = () => writeAtomic(USERS_F, USERS);
let sessTimer = null; const saveSess = () => { clearTimeout(sessTimer); sessTimer = setTimeout(() => writeAtomic(SESS_F, SESS), 500); };
const hashPw = (pw, salt = crypto.randomBytes(16).toString("hex")) => salt + ":" + crypto.scryptSync(String(pw), salt, 64).toString("hex");
const checkPw = (pw, stored) => { const [salt, h] = String(stored || "").split(":"); if (!salt || !h) return false; return same(crypto.scryptSync(String(pw), salt, 64).toString("hex"), h); };
const pub = u => ({id:u.id, email:u.email, nom:u.nom, role:u.role, actif:u.actif !== false, createdAt:u.createdAt});
const sidOf = req => ((req.headers.cookie || "").match(/(?:^|;\s*)sid=([a-f0-9]{64})/) || [])[1] || "";
function userOf(req){
  const s = SESS[sidOf(req)]; if (!s || s.exp < Date.now()) return null;
  const u = USERS.find(x => x.id === s.uid); return u && u.actif !== false ? u : null;
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
const OWNED = ["controles","cours","feuilles","bilans"];
function ownerOf(p){ const [col, id] = p.split("/"); if (col === "feuilles") return DOCS.get("controles/" + id)?.owner || DOCS.get(p)?.owner || null; return DOCS.get(p)?.owner || null; }
const canWrite = (u, p) => { if (u.role === "admin") return true; const o = ownerOf(p); return !o || o === u.id; };

async function accounts(req, res, url, p, u){
  if (p === "/api/me" && req.method === "GET") return u ? sendJ(res, 200, {user:pub(u)}) : sendJ(res, 401, {setup:USERS.length === 0});
  if (p === "/api/setup" && req.method === "POST"){
    if (USERS.length) return sendJ(res, 409, {error:{message:"Le compte administrateur existe déjà"}});
    if (!env("TIKOUN_CODE")) return sendJ(res, 503, {error:{message:"Définis la variable TIKOUN_CODE sur le serveur"}});
    if (tooMany(ipOf(req))) return sendJ(res, 429, {error:{message:"Trop d'essais, réessaie dans 15 minutes"}});
    const b = await readJSON(req, 1e4) || {};
    if (!same(String(b.code || ""), env("TIKOUN_CODE"))) return sendJ(res, 401, {error:{message:"Code de l'établissement incorrect"}});
    const email = String(b.email || "").trim().toLowerCase(); if (!validEmail(email) || String(b.password || "").length < 8) return sendJ(res, 400, {error:{message:"E-mail valide et mot de passe de 8 caractères minimum"}});
    const a = {id:crypto.randomBytes(8).toString("hex"), email, nom:String(b.nom || "Direction").slice(0, 80), role:"admin", pw:hashPw(b.password), createdAt:new Date().toISOString()};
    USERS.push(a); saveUsers();
    for (const [k, v] of DOCS) if (OWNED.includes(k.split("/")[0]) && isObj(v) && !v.owner) persist(k, {...v, owner:a.id});   // données déjà saisies → à l'admin
    return openSession(req, res, a);
  }
  if (p === "/api/login" && req.method === "POST"){
    if (tooMany(ipOf(req))) return sendJ(res, 429, {error:{message:"Trop d'essais, réessaie dans 15 minutes"}});
    const b = await readJSON(req, 1e4) || {}; const x = USERS.find(v => v.email === String(b.email || "").trim().toLowerCase());
    if (!x || x.actif === false || !checkPw(b.password, x.pw)) return sendJ(res, 401, {error:{message:"E-mail ou mot de passe incorrect"}});
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
  if (u.role !== "admin") return sendJ(res, 403, {error:{message:"Réservé à l'administrateur"}});
  if (p === "/api/users" && req.method === "GET") return sendJ(res, 200, {users:USERS.map(pub)});
  if (p === "/api/users" && req.method === "POST"){
    const b = await readJSON(req, 1e4) || {}; const email = String(b.email || "").trim().toLowerCase();
    if (!validEmail(email)) return sendJ(res, 400, {error:{message:"E-mail invalide"}});
    if (USERS.some(v => v.email === email)) return sendJ(res, 409, {error:{message:"Ce compte existe déjà"}});
    if (String(b.password || "").length < 8) return sendJ(res, 400, {error:{message:"Mot de passe provisoire : 8 caractères minimum"}});
    const n = {id:crypto.randomBytes(8).toString("hex"), email, nom:String(b.nom || email).slice(0, 80), role:b.role === "admin" ? "admin" : "prof", pw:hashPw(b.password), mustChange:true, createdAt:new Date().toISOString()};
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
    if (p === "/api/db" && req.method === "GET") return sendJ(res, 200, {epoch:EPOCH, seq:SEQ, persistent:PERSISTENT, docs:Object.fromEntries(DOCS)});
    if (p === "/api/db/changes" && req.method === "GET"){
      const since = Number(url.searchParams.get("since")) || 0, ep = url.searchParams.get("epoch");
      if (ep !== EPOCH || (LOG.length && since < LOG[0].seq - 1)) return sendJ(res, 200, {reset:true, epoch:EPOCH, seq:SEQ, docs:Object.fromEntries(DOCS)});
      const changed = [...new Set(LOG.filter(l => l.seq > since).map(l => l.path))];
      return sendJ(res, 200, {epoch:EPOCH, seq:SEQ, changes:changed.map(k => ({path:k, data:DOCS.has(k) ? DOCS.get(k) : null}))});
    }
    if (p === "/api/db/doc"){
      const dp = url.searchParams.get("path") || ""; if (!PATH_OK(dp)) return sendJ(res, 400, {error:{message:"Chemin invalide"}});
      if (!canWrite(u, dp)) return sendJ(res, 403, {error:{message:"Ce document appartient à un autre professeur"}});
      if (req.method === "DELETE"){ persist(dp, null); return sendJ(res, 200, {seq:SEQ}); }
      const body = await readJSON(req); if (!isObj(body)) return sendJ(res, 400, {error:{message:"Objet JSON attendu"}});
      const col = dp.split("/")[0], cur = DOCS.get(dp);
      if (req.method === "PUT"){
        const own = cur?.owner || (col === "feuilles" ? ownerOf(dp) : null) || u.id;
        persist(dp, OWNED.includes(col) ? {...body, owner:own} : {...body, ...(cur?.createdBy || !cur ? {createdBy:cur?.createdBy || u.id} : {})});
        return sendJ(res, 200, {seq:SEQ});
      }
      if (req.method === "PATCH"){ if (!cur) return sendJ(res, 404, {error:{message:"Document introuvable"}}); const {owner, ...rest} = body; persist(dp, merge(cur, rest)); return sendJ(res, 200, {seq:SEQ}); }
    }
    if (p === "/api/files" && req.method === "POST"){
      const want = url.searchParams.get("id") || "", id = /^[a-z0-9]{8,40}$/.test(want) ? want : crypto.randomBytes(10).toString("hex");
      fs.writeFileSync(path.join(FILEDIR, id + ".jpg"), await readBody(req, 15e6)); return sendJ(res, 200, {id});
    }
    const m = p.match(/^\/api\/files\/([a-z0-9]{8,40})$/);
    if (m && req.method === "GET"){ const f = path.join(FILEDIR, m[1] + ".jpg"); if (!fs.existsSync(f)) return send(res, 404, "Introuvable");
      res.writeHead(200, {"Content-Type":"image/jpeg", "Cache-Control":"private, max-age=86400"}); return fs.createReadStream(f).pipe(res); }
    if (p === "/api/export" && req.method === "GET"){
      const docs = Object.fromEntries([...DOCS].filter(([k, v]) => u.role === "admin" || !OWNED.includes(k.split("/")[0]) || ownerOf(k) === u.id));
      return send(res, 200, JSON.stringify({tikoun:1, at:new Date().toISOString(), docs, blobs:{}}), TYPES[".json"], {"Content-Disposition":`attachment; filename="tikoun-sauvegarde-${new Date().toISOString().slice(0, 10)}.json"`});
    }
    return sendJ(res, 404, {error:{message:"Route inconnue"}});
  } catch(e){ return sendJ(res, e.message === "too_large" ? 413 : 400, {error:{message:e.message === "too_large" ? "Trop lourd" : "Requête invalide"}}); }
}

/* ---------- IA ---------- */
const day = () => new Date().toISOString().slice(0, 10);
let counter = {day:day(), n:0}; const perIp = new Map();
function allowCall(ip){
  if (counter.day !== day()) counter = {day:day(), n:0};
  if (counter.n >= (Number(env("AI_MAX_PER_DAY")) || 400)) return "Plafond quotidien d'appels IA atteint.";
  const now = Date.now(), list = (perIp.get(ip) || []).filter(t => now - t < 3600e3);
  if (list.length >= 120) return "Trop d'appels IA depuis cet appareil : réessaie dans une heure.";
  list.push(now); perIp.set(ip, list); counter.n++; return null;
}
async function aiProxy(req, res, u){
  if (!env("ANTHROPIC_API_KEY")) return sendJ(res, 503, {error:{message:"ANTHROPIC_API_KEY manquante sur le serveur"}});
  if (!u) return sendJ(res, 401, {error:{message:"Connexion requise"}});
  let body; try { body = await readJSON(req, 40e6); } catch(e){ return sendJ(res, e.message === "too_large" ? 413 : 400, {error:{message:"Requête invalide"}}); }
  const stop = allowCall(ipOf(req)); if (stop) return sendJ(res, 429, {error:{message:stop}});
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
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x"); let p = decodeURIComponent(url.pathname);
    if (p === "/health") return send(res, 200, "ok");
    const u = userOf(req);
    if (p.startsWith("/api/")){
      if (req.method === "POST" && p === "/api/ai") return await aiProxy(req, res, u);
      if (p.startsWith("/api/db") || p.startsWith("/api/files") || p === "/api/export") return await storage(req, res, url, p, u);
      return await accounts(req, res, url, p, u);
    }
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Méthode non autorisée");
    if (p === "/config.js")
      return send(res, 200, "window.TIKOUN_CONFIG = " + JSON.stringify({aiEndpoint:env("ANTHROPIC_API_KEY") ? "/api/ai" : "", storage:"server", accounts:true, persistent:PERSISTENT}) + ";\n", TYPES[".js"], {"Cache-Control":"no-store"});
    if (p === "/" || p === "") p = "/index.html";
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT + path.sep) || file.startsWith(path.resolve(DATA)) || /^\/(data|src)(\/|$)/.test(p) || p.split("/").some(s => s.startsWith(".")) || /server\.js$|package(-lock)?\.json$|railway\.json$/.test(file)) return send(res, 404, "Introuvable");
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, "Introuvable");
      res.writeHead(200, {"Content-Type":TYPES[path.extname(file)] || "application/octet-stream", "X-Content-Type-Options":"nosniff", "Cache-Control":p === "/index.html" ? "no-cache" : "public, max-age=300"});
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(file).pipe(res);
    });
  } catch(e){ console.error(e); send(res, 500, "Erreur serveur"); }
}).listen(PORT, "0.0.0.0", () => console.log(`Tikoun en ligne sur le port ${PORT} · ${USERS.length} compte(s) · ${env("ANTHROPIC_API_KEY") ? "IA serveur" : "IA non configurée"} · données ${PERSISTENT ? "sur le volume " + DATA : "TEMPORAIRES : ajoute un Volume Railway monté sur /data"}`));
