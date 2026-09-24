// Tikoun · serveur pour Railway (ou tout hébergeur Node) — aucune dépendance.
// Variables d'environnement (Railway → Variables) :
//   ANTHROPIC_API_KEY  : clé IA de l'école, gardée ici (jamais envoyée aux navigateurs)
//   TIKOUN_CODE        : code d'accès demandé une fois par appareil (fortement conseillé si pas de Supabase)
//   SUPABASE_URL, SUPABASE_ANON_KEY : stockage en ligne partagé + comptes profs (facultatif, voir SUPABASE.md)
//   MODEL_QUICK, MODEL_DEFAULT, MODEL_COMPLEX : modèles (défauts économiques ci-dessous)
//   AI_MAX_PER_DAY     : plafond d'appels IA par jour (défaut 400)
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
  if (env("TIKOUN_CODE")) return same(req.headers["x-tikoun-code"] || "", env("TIKOUN_CODE"));
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
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Méthode non autorisée");
    if (p === "/health") return send(res, 200, "ok");
    if (p === "/api/check") return sendJ(res, (await authorized(req)) ? 200 : 401, {});
    if (p === "/config.js"){
      const cfg = {aiEndpoint:env("ANTHROPIC_API_KEY") ? "/api/ai" : "", codeRequired:!!env("TIKOUN_CODE") && !cloud(),
        ...(cloud() ? {supabaseUrl:env("SUPABASE_URL"), supabaseAnonKey:env("SUPABASE_ANON_KEY"), aiProxy:true} : {})};
      return send(res, 200, "window.TIKOUN_CONFIG = " + JSON.stringify(cfg) + ";\n", TYPES[".js"], {"Cache-Control":"no-store"});
    }
    if (p === "/" || p === "") p = "/index.html";
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT + path.sep) || p.split("/").some(s => s.startsWith(".")) || /server\.js$|package(-lock)?\.json$|railway\.json$/.test(file)) return send(res, 404, "Introuvable");
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, "Introuvable");
      res.writeHead(200, {"Content-Type":TYPES[path.extname(file)] || "application/octet-stream", "X-Content-Type-Options":"nosniff", "Cache-Control":p === "/index.html" ? "no-cache" : "public, max-age=300"});
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(file).pipe(res);
    });
  } catch(e){ send(res, 500, "Erreur serveur"); }
}).listen(PORT, "0.0.0.0", () => console.log("Tikoun en ligne sur le port " + PORT + (cloud() ? " · stockage en ligne" : " · données dans les navigateurs") + (env("ANTHROPIC_API_KEY") ? " · IA serveur" : " · IA non configurée") + (env("TIKOUN_CODE") ? " · code d'accès" : "")));
