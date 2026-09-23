
/* ================= Online storage (Supabase: Postgres + Storage + Auth, EU region) =================
   Used by the standalone site when a Supabase project is configured (config.js or Réglages).
   Every teacher logs in; all devices share the same classes, contrôles, copies and photos. */
let SB = null, SB_USER = null;
function cloudCfg(){ const c = cfg(), w = window.TIKOUN_CONFIG || {};
  return {url:(c.sbUrl || w.supabaseUrl || "").trim().replace(/\/+$/, ""), anon:(c.sbAnon || w.supabaseAnonKey || "").trim(), proxy:c.aiProxy != null ? !!c.aiProxy : !!w.aiProxy, endpoint:(w.aiEndpoint || "").trim()}; }
const cloudOn = () => { const c = cloudCfg(); return !!(c.url && c.anon && window.supabase?.createClient); };

async function cloudDB(){
  const init = {};
  for (let from = 0; ; from += 1000){
    const {data, error} = await SB.from("docs").select("path,data").range(from, from + 999);
    if (error) throw error; data.forEach(r => init[r.path] = r.data); if (data.length < 1000) break;
  }
  const db = memDB(init, async (p, val, op, patch) => {
    let r;
    if (op === "delete") r = await SB.from("docs").delete().eq("path", p);
    else if (op === "update") r = await SB.rpc("tk_update", {p_path:p, p_patch:patch});
    else r = await SB.from("docs").upsert({path:p, col:p.split("/").slice(0, -1).join("/"), data:val});
    if (r.error){ console.error(r.error); throw {code:"cloud_write", message:r.error.message}; }
  });
  SB.channel("tikoun-docs").on("postgres_changes", {event:"*", schema:"public", table:"docs"}, pl => {
    if (pl.eventType === "DELETE") db._remote(pl.old.path, null); else db._remote(pl.new.path, pl.new.data);
  }).subscribe();
  document.addEventListener("visibilitychange", async () => { if (document.visibilityState !== "visible") return;
    for (let from = 0; ; from += 1000){ const {data, error} = await SB.from("docs").select("path,data").range(from, from + 999); if (error) return; data.forEach(r => db._remote(r.path, r.data)); if (data.length < 1000) break; } });
  return db;
}
const PENDING_URL = new Set(); let urlTimer = null;
function wantUrl(id){
  if (BLOBURL[id] || PENDING_URL.has(id)) return; PENDING_URL.add(id);
  clearTimeout(urlTimer); urlTimer = setTimeout(async () => {
    const ids = [...PENDING_URL]; PENDING_URL.clear();
    const {data} = await SB.storage.from("tikoun").createSignedUrls(ids.map(i => i + ".jpg"), 60 * 60 * 12);
    (data || []).forEach((d, k) => { if (d?.signedUrl) BLOBURL[ids[k]] = d.signedUrl; });
    scheduleRender();
  }, 60);
}
const cloudAssets = { upload: async blob => { const id = uid(16);
  const {error} = await SB.storage.from("tikoun").upload(id + ".jpg", blob, {contentType:blob.type || "image/jpeg", upsert:false});
  if (error) throw {code:"cloud_write", message:error.message}; BLOBURL[id] = URL.createObjectURL(blob); return {id, url:BLOBURL[id]}; } };
async function cloudBlob(id){ const {data, error} = await SB.storage.from("tikoun").download(id + ".jpg"); if (error) throw {code:"no_blob"}; return data; }

function vLogin(){
  return `<div class="head"><div><h2>Connexion</h2><p>Accès réservé aux professeurs de l'établissement. Ton compte est créé par l'administrateur.</p></div></div>
  <section class="panel grid" style="max-width:420px">
    <div class="field"><label for="lg-mail">E-mail</label><input id="lg-mail" type="email" autocomplete="username"></div>
    <div class="field"><label for="lg-pw">Mot de passe</label><input id="lg-pw" type="password" autocomplete="current-password"></div>
    <div class="row"><button class="btn primary" id="lg-go">Se connecter</button><button class="btn" id="lg-link">Recevoir un lien par e-mail</button></div>
    <div class="status" id="lg-st"></div>
  </section>`;
}
async function startCloud(){
  $("#caps").textContent = "Connexion au stockage en ligne…";
  try {
    DB = await cloudDB(); ASSETS = cloudAssets; LOCAL = false;
    for (const col of ["classes","cours","controles"]) DB.collection(col).onSnapshot(s => { store[col] = s.docs.map(x => ({id:x.id, ...structuredClone(x.data())})); scheduleRender(); });
    for (const col of ["ecritures","bilans"]) DB.collection(col).onSnapshot(s => { const m = {}; s.docs.forEach(x => m[x.id] = structuredClone(x.data())); store[col] = m; scheduleRender(); });
    DB.collection("feuilles").onSnapshot(s => { const m = {}; s.docs.forEach(x => m[x.id] = structuredClone(x.data())); store.feuilles = m; scheduleRender(); });
  } catch(e){ console.error(e); toast("Stockage en ligne inaccessible : vérifie les Réglages (" + (e?.message || e?.code || "erreur") + ")", 8000); }
  refreshCaps(); if (S.view === "login") S.view = "home"; render();
}
document.addEventListener("click", async ev => {
  const t = ev.target.closest("button"); if (!t || !SB) return;
  if (t.id === "lg-go"){ const st = $("#lg-st"); st.innerHTML = `<span class="thinking">Connexion…</span>`;
    const {data, error} = await SB.auth.signInWithPassword({email:$("#lg-mail").value.trim(), password:$("#lg-pw").value});
    if (error){ st.textContent = "E-mail ou mot de passe incorrect."; return; } SB_USER = data.user; await startCloud(); return; }
  if (t.id === "lg-link"){ const st = $("#lg-st"); const email = $("#lg-mail").value.trim(); if (!email){ st.textContent = "Indique ton e-mail."; return; }
    const {error} = await SB.auth.signInWithOtp({email, options:{shouldCreateUser:false, emailRedirectTo:location.origin + location.pathname}});
    st.textContent = error ? "Envoi impossible : ce compte existe-t-il ?" : "Lien envoyé : ouvre l'e-mail sur cet appareil."; return; }
  if (t.id === "sb-out"){ await SB.auth.signOut(); location.reload(); return; }
  if (t.id === "sb-migrate"){ const st = $("#sb-st"); st.innerHTML = `<span class="thinking">Transfert…</span>`;
    try { IDB = IDB || await idbOpen(); const docs = await idbAll("docs"), blobs = await idbAll("blobs"); let n = 0;
      for (const [k, b] of Object.entries(blobs)){ const {error} = await SB.storage.from("tikoun").upload(k + ".jpg", b, {contentType:b.type || "image/jpeg", upsert:true}); if (!error) n++; }
      for (const [p, v] of Object.entries(docs)) await DB.doc(p).set(v);
      st.textContent = `${Object.keys(docs).length} élément(s) et ${n} photo(s) transférés.`; } catch(e){ console.error(e); st.textContent = "Transfert impossible."; }
    return; }
});
