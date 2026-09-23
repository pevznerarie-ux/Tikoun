// Tikoun · petit serveur pour Railway (ou tout hébergeur Node) — aucune dépendance.
// Variables d'environnement (Railway → Variables), toutes facultatives :
//   SUPABASE_URL, SUPABASE_ANON_KEY : stockage en ligne partagé (voir SUPABASE.md)
//   ANTHROPIC_API_KEY               : clé IA gardée sur le serveur (exige SUPABASE_* pour la connexion des profs)
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = __dirname, PORT = process.env.PORT || 3000;
const TYPES = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json",
  ".md":"text/markdown; charset=utf-8", ".png":"image/png", ".jpg":"image/jpeg", ".svg":"image/svg+xml", ".ico":"image/x-icon", ".txt":"text/plain; charset=utf-8"};
const env = k => (process.env[k] || "").trim();
const cloud = () => !!(env("SUPABASE_URL") && env("SUPABASE_ANON_KEY"));

function send(res, status, body, type = "text/plain; charset=utf-8", extra = {}){
  res.writeHead(status, {"Content-Type":type, "X-Content-Type-Options":"nosniff", "Referrer-Policy":"same-origin", ...extra}); res.end(body);
}

async function aiProxy(req, res){
  if (!env("ANTHROPIC_API_KEY") || !cloud()) return send(res, 503, JSON.stringify({error:{message:"IA serveur non configurée"}}), TYPES[".json"]);
  const chunks = []; let size = 0;
  for await (const c of req){ size += c.length; if (size > 40e6) return send(res, 413, JSON.stringify({error:{message:"Requête trop lourde"}}), TYPES[".json"]); chunks.push(c); }
  // Seuls les professeurs connectés (compte Supabase) peuvent utiliser l'IA
  const u = await fetch(env("SUPABASE_URL").replace(/\/+$/, "") + "/auth/v1/user", {headers:{authorization:req.headers.authorization || "", apikey:env("SUPABASE_ANON_KEY")}}).catch(() => null);
  if (!u || !u.ok) return send(res, 401, JSON.stringify({error:{message:"Connexion requise"}}), TYPES[".json"]);
  let body; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch(e){ return send(res, 400, JSON.stringify({error:{message:"JSON invalide"}}), TYPES[".json"]); }
  const r = await fetch("https://api.anthropic.com/v1/messages", {method:"POST", headers:{"content-type":"application/json", "x-api-key":env("ANTHROPIC_API_KEY"), "anthropic-version":"2023-06-01"},
    body:JSON.stringify({model:String(body.model || "claude-sonnet-5"), max_tokens:Math.min(Number(body.max_tokens) || 4000, 16000), messages:body.messages})}).catch(() => null);
  if (!r) return send(res, 502, JSON.stringify({error:{message:"IA injoignable"}}), TYPES[".json"]);
  send(res, r.status, await r.text(), TYPES[".json"]);
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x"); let p = decodeURIComponent(url.pathname);
    if (req.method === "POST" && p === "/api/ai") return await aiProxy(req, res);
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Méthode non autorisée");
    if (p === "/health") return send(res, 200, "ok");
    if (p === "/config.js" && cloud()){
      const cfg = {supabaseUrl:env("SUPABASE_URL"), supabaseAnonKey:env("SUPABASE_ANON_KEY"), aiProxy:true, ...(env("ANTHROPIC_API_KEY") ? {aiEndpoint:"/api/ai"} : {})};
      return send(res, 200, "window.TIKOUN_CONFIG = " + JSON.stringify(cfg) + ";\n", TYPES[".js"], {"Cache-Control":"no-store"});
    }
    if (p === "/" || p === "") p = "/index.html";
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT + path.sep) || p.split("/").some(s => s.startsWith(".")) || /server\.js$|package(-lock)?\.json$/.test(file)) return send(res, 404, "Introuvable");
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, "Introuvable");
      res.writeHead(200, {"Content-Type":TYPES[path.extname(file)] || "application/octet-stream", "X-Content-Type-Options":"nosniff", "Cache-Control":p === "/index.html" ? "no-cache" : "public, max-age=300"});
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(file).pipe(res);
    });
  } catch(e){ send(res, 500, "Erreur serveur"); }
}).listen(PORT, "0.0.0.0", () => console.log("Tikoun en ligne sur le port " + PORT + (cloud() ? " · stockage en ligne" : " · mode local") + (env("ANTHROPIC_API_KEY") ? " · IA serveur" : "")));
