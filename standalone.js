
/* ================= Standalone mode (GitHub Pages / any web host) =================
   Outside claude.ai there is no window.claude: data lives in this browser (IndexedDB),
   the AI is called directly with the school's Anthropic API key, files download normally. */
let STANDALONE = false;
const BLOBURL = {};
const blobSrc = id => STANDALONE ? (BLOBURL[id] || (SB ? (wantUrl(id), "") : "")) : "/_blob/" + id;
async function getBlob(id){ if (STANDALONE && SB) return cloudBlob(id); if (STANDALONE){ const b = await idbGet("blobs", id); if (!b) throw {code:"no_blob"}; return b; } return (await fetch("/_blob/" + id)).blob(); }

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

/* AI through the Anthropic Messages API, called from the browser */
const CFG_DEF = {key:"", quick:"claude-haiku-4-5-20251001", default:"claude-sonnet-5", complex:"claude-opus-5-5"};
function cfg(){ try { return {...CFG_DEF, ...JSON.parse(localStorage.getItem("tikoun.cfg") || "{}")}; } catch(e){ return {...CFG_DEF}; } }
function setCfg(c){ try { localStorage.setItem("tikoun.cfg", JSON.stringify(c)); } catch(e){ toast("Réglages non enregistrés (stockage bloqué)."); } }
const b64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
function parseJSONloose(t){
  try { return JSON.parse(t); } catch(e){}
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (f){ try { return JSON.parse(f[1]); } catch(e){} }
  const a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (a >= 0 && b > a){ try { return JSON.parse(t.slice(a, b + 1)); } catch(e){} }
  throw {code:"invalid_json", text:t};
}
function apiSample(){
  async function call(input, opts = {}, asJson){
    const c = cfg(), cc = cloudCfg(), viaProxy = !!(SB && SB_USER && (cc.proxy || cc.endpoint));
    if (!viaProxy && !c.key) throw {code:"no_key"};
    const imgs = opts.images ? (opts.images instanceof Blob ? [opts.images] : Array.from(opts.images)) : [];
    const content = [];
    for (const im of imgs) content.push({type:"image", source:{type:"base64", media_type:im.type && im.type.startsWith("image/") ? im.type : "image/jpeg", data:await b64(im)}});
    content.push({type:"text", text:String(input) + (asJson ? "\n\n(Ta réponse sera lue par un programme : réponds uniquement avec le JSON demandé, sans texte autour.)" : "")});
    let r;
    try {
      const body = JSON.stringify({model:c[opts.modelTier || "default"] || c.default, max_tokens:16000, messages:[{role:"user", content}]});
      if (viaProxy){ const {data} = await SB.auth.getSession();
        r = await fetch(cc.endpoint || cc.url + "/functions/v1/ai", {method:"POST", signal:opts.signal, headers:{"content-type":"application/json", "authorization":"Bearer " + data.session.access_token, "apikey":cc.anon}, body}); }
      else r = await fetch("https://api.anthropic.com/v1/messages", {method:"POST", signal:opts.signal, headers:{"content-type":"application/json", "x-api-key":c.key, "anthropic-version":"2023-06-01", "anthropic-dangerous-direct-browser-access":"true"}, body});
    } catch(e){ throw {code:e?.name === "AbortError" ? "cancelled" : "upstream_error"}; }
    if (!r.ok){ const code = r.status === 401 || r.status === 403 ? "bad_key" : r.status === 429 ? "rate_limited" : r.status === 400 || r.status === 413 ? "api_400" : "upstream_error";
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

/* Settings page (standalone only) */
function vReglages(){
  const c = cfg();
  return `<div class="head"><div><h2>Réglages</h2><p>Version autonome : les données restent dans ce navigateur, l'IA est appelée avec la clé API de l'école.</p></div></div>
  <section class="panel grid">
    <h3>Clé API Anthropic</h3>
    <p class="small muted">Crée une clé sur console.anthropic.com (compte de l'école), fixe une limite de dépense mensuelle, puis colle-la ici. Elle est gardée uniquement sur cet appareil.</p>
    <div class="field"><label for="cf-key">Clé API</label><input id="cf-key" type="password" autocomplete="off" value="${esc(c.key)}" placeholder="sk-ant-…"></div>
    <div class="form-row">
      <div class="field"><label for="cf-quick">Modèle rapide</label><input id="cf-quick" value="${esc(c.quick)}"></div>
      <div class="field"><label for="cf-default">Modèle standard</label><input id="cf-default" value="${esc(c.default)}"></div>
      <div class="field"><label for="cf-complex">Modèle précis</label><input id="cf-complex" value="${esc(c.complex)}"></div>
    </div>
    <div class="row"><button class="btn primary" id="cf-save">Enregistrer</button><button class="btn" id="cf-test">Tester la clé</button><span class="status" id="cf-st"></span></div>
  </section>
  <section class="panel grid">
    <h3>Stockage en ligne (Supabase)</h3>
    <p class="small muted">Avec un projet Supabase (hébergé en Europe), tous les professeurs partagent les mêmes classes, contrôles, notes et photos, depuis n'importe quel appareil. Voir le guide SUPABASE.md du dépôt.</p>
    ${SB ? `<p class="small">Connecté : <b>${esc(SB_USER?.email || "—")}</b> · <button class="btn sm" id="sb-out">Se déconnecter</button></p>` : ""}
    <div class="form-row">
      <div class="field"><label for="sb-url">URL du projet</label><input id="sb-url" value="${esc(cloudCfg().url)}" placeholder="https://xxxx.supabase.co"></div>
      <div class="field"><label for="sb-anon">Clé publique (anon / publishable)</label><input id="sb-anon" value="${esc(cloudCfg().anon)}"></div>
    </div>
    <label class="row small" style="gap:6px"><input type="checkbox" id="sb-proxy"${cloudCfg().proxy ? " checked" : ""}> IA via le serveur de l'école (fonction « ai ») : aucune clé API dans les navigateurs</label>
    <div class="row"><button class="btn primary" id="sb-save">Enregistrer et recharger</button>${SB && SB_USER ? `<button class="btn" id="sb-migrate">Transférer les données de cet appareil en ligne</button>` : ""}</div>
    <div class="status" id="sb-st"></div>
  </section>
  <section class="panel grid">
    <h3>Sauvegarde des données</h3>
    <p class="small muted">Tout est stocké dans ce navigateur. Exporte régulièrement une sauvegarde ; tu peux l'importer sur un autre ordinateur (ou chez un collègue).</p>
    <label class="row small" style="gap:6px"><input type="checkbox" id="ex-img"> Inclure les photos des copies (fichier plus lourd)</label>
    <div class="row"><button class="btn" id="ex-go">Exporter une sauvegarde</button>
      <label class="btn" for="im-file">Importer une sauvegarde</label><input id="im-file" type="file" accept="application/json,.json" hidden></div>
    <div class="status" id="ex-st"></div>
  </section>`;
}
async function exportAll(withImg){
  const docs = await idbAll("docs"); const out = {tikoun:1, at:new Date().toISOString(), docs, blobs:{}};
  if (withImg){ const bl = await idbAll("blobs"); for (const [k, b] of Object.entries(bl)) out.blobs[k] = {type:b.type, data:await b64(b)}; }
  await localDownloads.save({filename:`tikoun-sauvegarde-${today()}.json`, data:new Blob([JSON.stringify(out)], {type:"application/json"})});
}
async function importAll(file){
  const j = JSON.parse(await file.text()); if (!j?.tikoun || !j.docs) throw new Error("format");
  for (const [k, v] of Object.entries(j.blobs || {})){ const bin = Uint8Array.from(atob(v.data), ch => ch.charCodeAt(0)); const b = new Blob([bin], {type:v.type}); await idbPut("blobs", k, b); BLOBURL[k] = URL.createObjectURL(b); }
  for (const [path, v] of Object.entries(j.docs)){ await DB.doc(path).set(v); }
  return Object.keys(j.docs).length;
}
document.addEventListener("click", async ev => {
  const t = ev.target.closest("button"); if (!t || !STANDALONE) return;
  if (t.id === "cf-save" || t.id === "cf-test"){
    const c = {key:$("#cf-key").value.trim(), quick:$("#cf-quick").value.trim() || CFG_DEF.quick, default:$("#cf-default").value.trim() || CFG_DEF.default, complex:$("#cf-complex").value.trim() || CFG_DEF.complex};
    setCfg(c); refreshCaps();
    const st = $("#cf-st");
    if (t.id === "cf-save"){ st.textContent = "Enregistré."; return; }
    st.innerHTML = `<span class="thinking">Test…</span>`;
    try { const r = await AI.json(`Réponds {"ok":true}`, {modelTier:"quick"}); st.textContent = r?.ok ? "La clé fonctionne ✓" : "Réponse inattendue."; } catch(e){ st.textContent = aiErr(e?.code) + (e?.message ? " (" + e.message + ")" : ""); }
    return;
  }
  if (t.id === "sb-save"){ const c = cfg(); c.sbUrl = $("#sb-url").value.trim(); c.sbAnon = $("#sb-anon").value.trim(); c.aiProxy = $("#sb-proxy").checked; setCfg(c); location.reload(); return; }
  if (t.id === "ex-go"){ try { await exportAll($("#ex-img").checked); $("#ex-st").textContent = "Sauvegarde téléchargée."; } catch(e){ $("#ex-st").textContent = "Export impossible."; } }
});
document.addEventListener("change", async ev => {
  if (ev.target.id !== "im-file" || !STANDALONE) return; const f = ev.target.files[0]; ev.target.value = ""; if (!f) return;
  try { const n = await importAll(f); $("#ex-st").textContent = n + " élément(s) importé(s)."; } catch(e){ $("#ex-st").textContent = "Fichier de sauvegarde invalide."; }
});
function refreshCaps(){
  if (!STANDALONE) return;
  const cc = cloudCfg(), aiOk = cfg().key || (SB && (cc.proxy || cc.endpoint));
  $("#caps").innerHTML = `IA ${aiOk ? "✓" : "✗ (Réglages)"} · Données : ${SB ? (SB_USER ? "en ligne ✓" : "connexion requise") : "cet appareil"}`;
}
