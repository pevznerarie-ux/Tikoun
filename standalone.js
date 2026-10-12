
/* ================= Standalone mode (GitHub Pages / any web host) =================
   Outside claude.ai there is no window.claude: data lives in this browser (IndexedDB),
   the AI is called directly with the school's Anthropic API key, files download normally. */
let STANDALONE = false;
const BLOBURL = {};
const blobSrc = id => (typeof SERVERSTORE !== "undefined" && SERVERSTORE) ? "/api/files/" + id : STANDALONE ? (BLOBURL[id] || (SB ? (wantUrl(id), "") : "")) : "/_blob/" + id;
async function getBlob(id){ if (SERVERSTORE){ const r = await fetch("/api/files/" + id, {credentials:"same-origin"}); if (!r.ok) throw {code:"no_blob"}; return r.blob(); } if (STANDALONE && SB) return cloudBlob(id); if (STANDALONE){ const b = await idbGet("blobs", id); if (!b) throw {code:"no_blob"}; return b; } return (await fetch("/_blob/" + id)).blob(); }

function idbOpen(){ return new Promise((res, rej) => { const r = indexedDB.open("tikoun", 1);
  r.onupgradeneeded = () => { r.result.createObjectStore("docs"); r.result.createObjectStore("blobs"); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
let IDB = null;
const idbReq = (store, mode, fn) => new Promise((res, rej) => { const tx = IDB.transaction(store, mode); const r = fn(tx.objectStore(store)); tx.oncomplete = () => res(r?.result); tx.onerror = () => rej(tx.error); });
const idbGet = (s, k) => idbReq(s, "readonly", o => o.get(k));
const idbPut = (s, k, v) => idbReq(s, "readwrite", o => o.put(v, k));
const idbDel = (s, k) => idbReq(s, "readwrite", o => o.delete(k));
const idbAll = s => new Promise((res, rej) => { const out = {}; const tx = IDB.transaction(s, "readonly"); const c = tx.objectStore(s).openCursor();
  c.onsuccess = () => { const cur = c.result; if (cur){ out[cur.key] = cur.value; cur.continue(); } }; tx.oncomplete = () => res(out); tx.onerror = () => rej(tx.error); });

async function localDB(){
  IDB = await idbOpen();
  const init = await idbAll("docs");
  const db = memDB(init, (path, val) => val == null ? idbDel("docs", path) : idbPut("docs", path, val));
  return db;
}
async function localAssets(){
  const all = await idbAll("blobs"); for (const [k, b] of Object.entries(all)) BLOBURL[k] = URL.createObjectURL(b);
  return { upload: async blob => { const id = uid(14); await idbPut("blobs", id, blob); BLOBURL[id] = URL.createObjectURL(blob); return {id, url:BLOBURL[id], sizeBytes:blob.size, contentType:blob.type}; } };
}
const localDownloads = { save: async ({filename, data}) => { const b = data instanceof Blob ? data : new Blob([data]); const a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = String(filename).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9 ._-]+/g, "-").replace(/-+/g, "-"); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); } };

/* AI: always through the school's server (/api/ai) — the API key never reaches the browser */
const CFG_DEF = {};
function cfg(){ try { return JSON.parse(localStorage.getItem("tikoun.cfg") || "{}"); } catch(e){ return {}; } }
function setCfg(c){ try { localStorage.setItem("tikoun.cfg", JSON.stringify(c)); } catch(e){} }
const accessCode = () => { try { return localStorage.getItem("tikoun.code") || ""; } catch(e){ return ""; } };
let NEED_CODE = false;
const b64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
function parseJSONloose(t){
  try { return JSON.parse(t); } catch(e){}
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (f){ try { return JSON.parse(f[1]); } catch(e){} }
  const a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (a >= 0 && b > a){ try { return JSON.parse(t.slice(a, b + 1)); } catch(e){} }
  const part = salvageJSON(t); if (part) return part;
  throw {code:"invalid_json", text:t};
}
/* Réponse coupée (trop longue) : on garde les questions complètes du tableau "questions" (jamais pour la correction des copies) */
function salvageJSON(t){
  const k = t.search(/"(questions)"\s*:\s*\[/); if (k < 0) return null;
  const key = t.slice(k + 1, t.indexOf('"', k + 1)), start = t.indexOf("[", k) + 1, items = [];
  let depth = 0, inStr = false, esc = false, from = -1;
  for (let i = start; i < t.length; i++){ const ch = t[i];
    if (inStr){ if (esc) esc = false; else if (ch === "\\") esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{"){ if (depth === 0) from = i; depth++; }
    else if (ch === "}"){ depth--; if (depth === 0 && from >= 0){ try { items.push(JSON.parse(t.slice(from, i + 1))); } catch(e){} from = -1; } }
    else if (ch === "]" && depth === 0) break; }
  if (!items.length) return null;
  const titre = (t.slice(0, k).match(/"titre"\s*:\s*"((?:[^"\\]|\\.)*)"/) || [])[1];
  return {[key]:items, ...(titre ? {titre:JSON.parse('"' + titre + '"')} : {}), _partiel:true};
}
function apiSample(){
  async function call(input, opts = {}, asJson){
    const cc = cloudCfg(); if (!cc.endpoint) throw {code:"no_ai"};
    const imgs = opts.images ? (opts.images instanceof Blob ? [opts.images] : Array.from(opts.images)) : [];
    const content = [];
    for (const im of imgs) content.push({type:"image", source:{type:"base64", media_type:im.type && im.type.startsWith("image/") ? im.type : "image/jpeg", data:await b64(im)}});
    content.push({type:"text", text:String(input) + (asJson ? "\n\n(Réponds uniquement avec le JSON demandé, sans texte autour.)" : "")});
    const headers = {"content-type":"application/json", "x-tikoun-code":accessCode()};
    if (SB && SB_USER){ const {data} = await SB.auth.getSession(); headers.authorization = "Bearer " + data.session.access_token; }
    let r;
    try { r = await fetch(cc.endpoint, {method:"POST", signal:opts.signal, headers, body:JSON.stringify({tier:opts.modelTier || "default", feature:opts.feature || "", messages:[{role:"user", content}]})}); }
    catch(e){ throw {code:e?.name === "AbortError" ? "cancelled" : "upstream_error"}; }
    if (!r.ok){
      if (r.status === 401 && window.TIKOUN_CONFIG?.accounts){ S.auth = "login"; scheduleRender(); }
      else if (r.status === 401 && !SB){ NEED_CODE = true; try { localStorage.removeItem("tikoun.code"); } catch(e){} scheduleRender(); }
      const code = r.status === 402 ? "no_access" : r.status === 403 ? "no_option" : r.status === 401 ? "need_code" : r.status === 429 ? "rate_limited" : r.status === 400 || r.status === 413 ? "api_400" : r.status === 503 ? "no_ai" : "upstream_error";
      let msg = ""; try { msg = (await r.json())?.error?.message || ""; } catch(e){} throw {code, message:msg}; }
    const j = await r.json(); const text = (j.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    if (!text.trim()) throw {code:"empty_completion"};
    return asJson ? parseJSONloose(text) : text;
  }
  const f = (input, opts) => call(input, opts, false).then(text => ({text, truncated:false, modelTierApplied:opts?.modelTier || "default"}));
  f.json = (input, opts) => call(input, opts, true);
  f.limits = async () => ({maxPromptBytes:400000, images:{maxCount:20, maxInputBytes:5e6, mediaTypes:["image/jpeg","image/png","image/webp"]}});
  return f;
}
function vCode(){
  return `<div class="head"><div><h2>Code d'accès</h2><p>Entre le code de l'établissement pour utiliser Mastery.</p></div></div>
  <section class="panel grid" style="max-width:420px">
    <div class="field"><label for="cd-in">Code</label><input id="cd-in" type="password" autocomplete="current-password"></div>
    <div class="row"><button class="btn primary" id="cd-go">Entrer</button></div><div class="status" id="cd-st"></div>
  </section>`;
}

/* Sauvegarde page (standalone, local mode) */
function vReglages(){
  if (SERVERSTORE) return `<div class="head"><div><h2>Sauvegarde</h2><p>Tes données (classes, contrôles, notes, photos des copies) sont stockées sur le serveur : tu les retrouves sur tous tes appareils en te connectant.</p></div></div>
  ${SRV_PERSIST ? "" : `<p class="banner">⚠ Le serveur n'a pas de Volume : les données seront effacées au prochain déploiement. Railway → service → Volume, monté sur /data.</p>`}
  <section class="panel grid"><div class="row"><button class="btn" id="srv-export">Télécharger une sauvegarde (données)</button><button class="btn ghost sm" id="srv-out">Se déconnecter de cet appareil</button></div>
    <div class="grid" style="gap:6px;border-top:1px solid var(--line);padding-top:12px"><b>Données saisies avant sur cet appareil ?</b><div class="small muted">Si tu avais utilisé Mastery en mode local sur ce navigateur, transfère-les sur le serveur (une seule fois).</div>
    <div class="row"><button class="btn" id="srv-migrate">Transférer vers le serveur</button></div><div class="status" id="srv-st"></div></div></section>
  ${S.me?.role === "admin" ? `<section class="panel grid"><div class="row" style="justify-content:space-between"><div><b>Sauvegardes automatiques</b><div class="small muted">Une copie complète de toute la plateforme chaque jour, gardée 14 jours sur le serveur.</div></div><button class="btn ghost sm" id="bak-now">Sauvegarder maintenant</button></div>
    <div id="bak-list" class="small muted">Chargement…</div></section>` : ""}`;
  return `<div class="head"><div><h2>Sauvegarde</h2><p>${SB ? "Les données sont stockées en ligne." : "Les données sont stockées dans ce navigateur. Exporte régulièrement une sauvegarde : tu peux l'importer sur un autre ordinateur ou chez un collègue."}</p></div></div>
  ${SB ? `<section class="panel grid"><p class="small">Connecté : <b>${esc(SB_USER?.email || "—")}</b> · <button class="btn sm" id="sb-out">Se déconnecter</button></p>
    ${SB_USER ? `<div class="row"><button class="btn" id="sb-migrate">Transférer les données de cet appareil en ligne</button></div><div class="status" id="sb-st"></div>` : ""}</section>` : `
  <section class="panel grid">
    <label class="row small" style="gap:6px"><input type="checkbox" id="ex-img"> Inclure les photos des copies (fichier plus lourd)</label>
    <div class="row"><button class="btn" id="ex-go">Exporter une sauvegarde</button>
      <label class="btn" for="im-file">Importer une sauvegarde</label><input id="im-file" type="file" accept="application/json,.json" hidden></div>
    <div class="status" id="ex-st"></div>
  </section>`}`;
}
async function exportAll(withImg){
  const docs = await idbAll("docs"); const out = {tikoun:1, at:new Date().toISOString(), docs, blobs:{}};
  if (withImg){ const bl = await idbAll("blobs"); for (const [k, b] of Object.entries(bl)) out.blobs[k] = {type:b.type, data:await b64(b)}; }
  await localDownloads.save({filename:`mastery-sauvegarde-${today()}.json`, data:new Blob([JSON.stringify(out)], {type:"application/json"})});
}
async function importAll(file){
  const j = JSON.parse(await file.text()); if (!j?.tikoun || !j.docs) throw new Error("format");
  for (const [k, v] of Object.entries(j.blobs || {})){ const bin = Uint8Array.from(atob(v.data), ch => ch.charCodeAt(0)); const b = new Blob([bin], {type:v.type}); await idbPut("blobs", k, b); BLOBURL[k] = URL.createObjectURL(b); }
  for (const [path, v] of Object.entries(j.docs)){ await DB.doc(path).set(v); }
  return Object.keys(j.docs).length;
}
document.addEventListener("click", async ev => {
  const t = ev.target.closest("button"); if (!t || !STANDALONE) return;
  if (t.id === "cd-go"){ const st = $("#cd-st"), code = $("#cd-in").value.trim(); if (!code) return;
    st.innerHTML = `<span class="thinking">Vérification…</span>`;
    const r = await fetch("/api/login", {method:"POST", credentials:"same-origin", headers:{"content-type":"application/json"}, body:JSON.stringify({code})}).catch(() => null);
    if (r?.ok){ try { localStorage.setItem("tikoun.code", code); } catch(e){} NEED_CODE = false;
      if (window.TIKOUN_CONFIG?.storage === "server" && !SERVERSTORE) await startServer(); else { refreshCaps(); render(); } }
    else st.textContent = "Code incorrect.";
    return; }
  if (t.id === "ex-go"){ try { await exportAll($("#ex-img").checked); $("#ex-st").textContent = "Sauvegarde téléchargée."; } catch(e){ $("#ex-st").textContent = "Export impossible."; } }
});
document.addEventListener("change", async ev => {
  if (ev.target.id !== "im-file" || !STANDALONE) return; const f = ev.target.files[0]; ev.target.value = ""; if (!f) return;
  try { const n = await importAll(f); $("#ex-st").textContent = n + " élément(s) importé(s)."; } catch(e){ $("#ex-st").textContent = "Fichier de sauvegarde invalide."; }
});
function refreshCaps(){
  if (!STANDALONE) return;
  const aiOk = !!cloudCfg().endpoint;
  if (window.TIKOUN_CONFIG?.accounts){ $("#caps").innerHTML = S.me ? `${esc(S.me.nom)}${isAdmin() ? " · admin" : ""} · IA ${aiOk ? "✓" : "✗"}${SERVERSTORE && !SRV_PERSIST ? " · ⚠ données temporaires" : ""}` : "Connexion requise"; return; }
  $("#caps").innerHTML = `IA ${aiOk ? "✓" : "✗ (serveur)"} · Données : ${SB ? (SB_USER ? "en ligne ✓" : "connexion requise") : SERVERSTORE ? (SRV_PERSIST ? "serveur ✓" : "serveur ⚠ temporaire") : (window.TIKOUN_CONFIG?.storage === "server" ? "code requis" : "cet appareil")}`;
}
