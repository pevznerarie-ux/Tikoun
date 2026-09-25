// Tikoun · serveur pour Railway (ou tout hébergeur Node) — aucune dépendance.
// Variables d'environnement (Railway → Variables) :
//   ANTHROPIC_API_KEY  : clé IA de l'école, gardée ici (jamais envoyée aux navigateurs)
//   TIKOUN_CODE        : code d'accès demandé une fois par appareil (fortement conseillé si pas de Supabase)
//   SUPABASE_URL, SUPABASE_ANON_KEY : stockage en ligne partagé + comptes profs (facultatif, voir SUPABASE.md)
//   MODEL_QUICK, MODEL_DEFAULT, MODEL_COMPLEX : modèles (défauts économiques ci-dessous)
//   AI_MAX_PER_DAY     : plafond d'appels IA par jour (défaut 400)
// Stockage : les données (classes, contrôles, notes) et les photos des copies sont gardées sur le serveur,
// dans un Volume Railway (Railway → service → Volume, monté sur /data). Exige TIKOUN_CODE.
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = __dirname, PORT = process.env.PORT || 3000;
const TYPES = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json",
  ".md":"text/markdown; charset=utf-8", ".png":"image/png", ".jpg":"image/jpeg", ".svg":"image/svg+xml", ".ico":"image/x-icon", ".txt":"text/plain; charset=utf-8"};
const env = k => (process.env[k] || "").trim();
const cloud = () => !!(env("SUPABASE_URL") && env("SUPABASE_ANON_KEY"));
// Économique par défaut : Haiku pour tout, Sonnet seulement pour la relecture précise.
const MODELS = () => ({quick:env("MODEL_QUICK") || "claude-haiku-4-5-20251001", default:env("MODEL_DEFAULT") || "claude-haiku-4-5-20251001", complex:env("MODEL_COMPLEX") || "claude-sonnet-5"});

function send(res, status, body, type = "text/plain; charset=utf-8", extra = {}){
  res.writeHead(status, {"Content-Type":type, "X-Content-Type-Options":"nosniff", "Referrer-Policy":"same-origin", ...extra}); res.end(body);
}
const sendJ = (res, status, obj) => send(res, status, JSON.stringify(obj), TYPES[".json"]);
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/* ---------- Stockage sur le serveur (Volume Railway) ---------- */
const DATA = env("DATA_DIR") || env("RAILWAY_VOLUME_MOUNT_PATH") || path.join(ROOT, "data");
const PERSISTENT = !!(env("DATA_DIR") || env("RAILWAY_VOLUME_MOUNT_PATH"));
const DOCDIR = path.join(DATA, "docs"), FILEDIR = path.join(DATA, "files");
fs.mkdirSync(DOCDIR, {recursive:true}); fs.mkdirSync(FILEDIR, {recursive:true});
const DOCS = new Map();
for (const f of fs.readdirSync(DOCDIR)) if (f.endsWith(".json")){ try { DOCS.set(decodeURIComponent(f.slice(0, -5)), JSON.parse(fs.readFileSync(path.join(DOCDIR, f), "utf8"))); } catch(e){ console.warn("Document illisible", f); } }
const EPOCH = Date.now().toString(36) + crypto.randomBytes(3).toString("hex"); let SEQ = 0; const LOG = [];
const PATH_OK = p => /^[A-Za-z0-9_\-.~:@+]{1,200}(\/[A-Za-z0-9_\-.~:@+]{1,200}){1,15}$/.test(p) && !p.split("/").some(x => x === "." || x === "..");
const docFile = p => path.join(DOCDIR, encodeURIComponent(p) + ".json");
function persist(p, data){
  if (data == null){ DOCS.delete(p); fs.rmSync(docFile(p), {force:true}); }
  else { DOCS.set(p, data); const tmp = docFile(p) + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(data)); fs.renameSync(tmp, docFile(p)); }
  LOG.push({seq:++SEQ, path:p}); if (LOG.length > 20000) LOG.splice(0, LOG.length - 20000);
}
const isObj = x => x && typeof x === "object" && !Array.isArray(x);
const merge = (a, b) => { if (!isObj(a) || !isObj(b)) return b; const r = {...a}; for (const k of Object.keys(b)) r[k] = merge(a[k], b[k]); return r; };
async function readBody(req, max){ const chunks = []; let size = 0; for await (const c of req){ size += c.length; if (size > max) throw new Error("too_large"); chunks.push(c); } return Buffer.concat(chunks); }
const storageOn = () => !!env("TIKOUN_CODE") && !cloud();
const TOKEN = () => crypto.createHash("sha256").update("tikoun:" + env("TIKOUN_CODE")).digest("hex");
const cookieTok = req => ((req.headers.cookie || "").match(/(?:^|;\s*)tk=([a-f0-9]{64})/) || [])[1] || "";

async function storage(req, res, url, p){
  if (!storageOn()) return sendJ(res, 403, {error:{message:"Stockage serveur désactivé (définis TIKOUN_CODE)"}});
  if (!(await authorized(req))) return sendJ(res, 401, {error:{message:"Code d'accès requis"}});
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
      if (req.method === "DELETE"){ persist(dp, null); return sendJ(res, 200, {seq:SEQ}); }
      const body = JSON.parse((await readBody(req, 8e6)).toString("utf8") || "null");
      if (!isObj(body)) return sendJ(res, 400, {error:{message:"Objet JSON attendu"}});
      if (req.method === "PUT"){ persist(dp, body); return sendJ(res, 200, {seq:SEQ}); }
      if (req.method === "PATCH"){ if (!DOCS.has(dp)) return sendJ(res, 404, {error:{message:"Document introuvable"}}); persist(dp, merge(DOCS.get(dp), body)); return sendJ(res, 200, {seq:SEQ}); }
    }
    if (p === "/api/files" && req.method === "POST"){
      const want = url.searchParams.get("id") || "", id = /^[a-z0-9]{8,40}$/.test(want) ? want : crypto.randomBytes(10).toString("hex");
      const buf = await readBody(req, 15e6); fs.writeFileSync(path.join(FILEDIR, id + ".jpg"), buf); return sendJ(res, 200, {id});
    }
    const m = p.match(/^\/api\/files\/([a-z0-9]{8,40})$/);
    if (m && req.method === "GET"){ const f = path.join(FILEDIR, m[1] + ".jpg"); if (!fs.existsSync(f)) return send(res, 404, "Introuvable");
      res.writeHead(200, {"Content-Type":"image/jpeg", "Cache-Control":"private, max-age=86400"}); return fs.createReadStream(f).pipe(res); }
    if (p === "/api/export" && req.method === "GET") return send(res, 200, JSON.stringify({tikoun:1, at:new Date().toISOString(), docs:Object.fromEntries(DOCS), blobs:{}}), TYPES[".json"],
      {"Content-Disposition":`attachment; filename="tikoun-sauvegarde-${new Date().toISOString().slice(0, 10)}.json"`});
    return sendJ(res, 404, {error:{message:"Route inconnue"}});
  } catch(e){ return sendJ(res, e.message === "too_large" ? 413 : 400, {error:{message:e.message === "too_large" ? "Trop lourd" : "Requête invalide"}}); }
}

// Garde-fous de dépense
const day = () => new Date().toISOString().slice(0, 10);
let counter = {day:day(), n:0}; const perIp = new Map();
function allowCall(ip){
  if (counter.day !== day()) counter = {day:day(), n:0};
  if (counter.n >= (Number(env("AI_MAX_PER_DAY")) || 400)) return "Plafond quotidien d'appels IA atteint.";
  const now = Date.now(), list = (perIp.get(ip) || []).filter(t => now - t < 3600e3);
  if (list.length >= 120) return "Trop d'appels IA depuis cet appareil : réessaie dans une heure.";
  list.push(now); perIp.set(ip, list); counter.n++; return null;
}
async function authorized(req){
  if (cloud()){
    const u = await fetch(env("SUPABASE_URL").replace(/\/+$/, "") + "/auth/v1/user", {headers:{authorization:req.headers.authorization || "", apikey:env("SUPABASE_ANON_KEY")}}).catch(() => null);
    if (u && u.ok) return true;
  }
  if (env("TIKOUN_CODE")) return same(req.headers["x-tikoun-code"] || "", env("TIKOUN_CODE")) || same(cookieTok(req), TOKEN());
  return !cloud();   // ni comptes ni code : ouvert (déconseillé)
}

async function aiProxy(req, res){
  if (!env("ANTHROPIC_API_KEY")) return sendJ(res, 503, {error:{message:"ANTHROPIC_API_KEY manquante sur le serveur"}});
  if (!(await authorized(req))) return sendJ(res, 401, {error:{message:"Accès refusé"}});
  const chunks = []; let size = 0;
  for await (const c of req){ size += c.length; if (size > 40e6) return sendJ(res, 413, {error:{message:"Requête trop lourde"}}); chunks.push(c); }
  let body; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch(e){ return sendJ(res, 400, {error:{message:"JSON invalide"}}); }
  const ip = String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
  const stop = allowCall(ip); if (stop) return sendJ(res, 429, {error:{message:stop}});
  const M = MODELS(), model = M[body.tier] || M.default;
  const r = await fetch((env("ANTHROPIC_BASE_URL") || "https://api.anthropic.com") + "/v1/messages", {method:"POST",
    headers:{"content-type":"application/json", "x-api-key":env("ANTHROPIC_API_KEY"), "anthropic-version":"2023-06-01"},
    body:JSON.stringify({model, max_tokens:8000, messages:body.messages})}).catch(() => null);
  if (!r) return sendJ(res, 502, {error:{message:"IA injoignable"}});
  const txt = await r.text();
  if (r.ok){ try { const u = JSON.parse(txt).usage; console.log(`IA ${model} · entrée ${u?.input_tokens} · sortie ${u?.output_tokens}`); } catch(e){} }
  else console.warn("IA erreur", r.status, txt.slice(0, 300));
  send(res, r.status, txt, TYPES[".json"]);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x"); let p = decodeURIComponent(url.pathname);
    if (req.method === "POST" && p === "/api/ai") return await aiProxy(req, res);
    if (req.method === "POST" && p === "/api/login"){
      let code = ""; try { code = String(JSON.parse((await readBody(req, 1e4)).toString("utf8")).code || ""); } catch(e){}
      if (!env("TIKOUN_CODE") || !same(code, env("TIKOUN_CODE"))) return sendJ(res, 401, {error:{message:"Code incorrect"}});
      const secure = String(req.headers["x-forwarded-proto"] || "").includes("https") ? "; Secure" : "";
      return send(res, 200, "{}", TYPES[".json"], {"Set-Cookie":`tk=${TOKEN()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`});
    }
    if (req.method === "POST" && p === "/api/logout") return send(res, 200, "{}", TYPES[".json"], {"Set-Cookie":"tk=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"});
    if (p.startsWith("/api/db") || p.startsWith("/api/files") || p === "/api/export") return await storage(req, res, url, p);
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Méthode non autorisée");
    if (p === "/health") return send(res, 200, "ok");
    if (p === "/api/check") return sendJ(res, (await authorized(req)) ? 200 : 401, {});
    if (p === "/config.js"){
      const cfg = {aiEndpoint:env("ANTHROPIC_API_KEY") ? "/api/ai" : "", codeRequired:!!env("TIKOUN_CODE") && !cloud(), storage:storageOn() ? "server" : "", persistent:PERSISTENT,
        ...(cloud() ? {supabaseUrl:env("SUPABASE_URL"), supabaseAnonKey:env("SUPABASE_ANON_KEY"), aiProxy:true} : {})};
      return send(res, 200, "window.TIKOUN_CONFIG = " + JSON.stringify(cfg) + ";\n", TYPES[".js"], {"Cache-Control":"no-store"});
    }
    if (p === "/" || p === "") p = "/index.html";
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT + path.sep) || file.startsWith(path.resolve(DATA)) || /^\/(data|src)(\/|$)/.test(p) || p.split("/").some(s => s.startsWith(".")) || /server\.js$|package(-lock)?\.json$|railway\.json$/.test(file)) return send(res, 404, "Introuvable");
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, "Introuvable");
      res.writeHead(200, {"Content-Type":TYPES[path.extname(file)] || "application/octet-stream", "X-Content-Type-Options":"nosniff", "Cache-Control":p === "/index.html" ? "no-cache" : "public, max-age=300"});
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(file).pipe(res);
    });
  } catch(e){ send(res, 500, "Erreur serveur"); }
}).listen(PORT, "0.0.0.0", () => console.log("Tikoun en ligne sur le port " + PORT + (cloud() ? " · stockage en ligne" : " · données dans les navigateurs") + (env("ANTHROPIC_API_KEY") ? " · IA serveur" : " · IA non configurée") + (env("TIKOUN_CODE") ? " · code d'accès" : "") + (storageOn() ? " · stockage serveur " + (PERSISTENT ? "(volume " + DATA + ")" : "TEMPORAIRE : ajoute un Volume Railway monté sur /data") : "")));
