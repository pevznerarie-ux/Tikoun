/* ================= Scanners Wi-Fi, Mastery Box et boîte de réception =================
   Les pages envoyées par un appareil arrivent sur le serveur ; l'application les récupère toute seule,
   lit les QR codes, range chaque copie et lance la correction, comme un dépôt dans l'onglet Scanner. */
S.dev = {list:null, ssid:"", pass:"", busy:false};
S.inboxSeen = new Set(); const INBOX_ITEMS = {};
async function pollInbox(){
  if (!window.TIKOUN_CONFIG?.accounts || !S.me || typeof SERVERSTORE === "undefined" || !SERVERSTORE || !DATA_READY || S.inboxBusy) return;
  S.inboxBusy = true;
  try {
    const r = await fetch("/api/scan/inbox", {credentials:"same-origin"}); if (!r.ok) return;
    const items = ((await r.json()).items || []).filter(x => !S.inboxSeen.has(x.id)); if (!items.length) return;
    let pages = 0;
    for (const x of items){
      S.inboxSeen.add(x.id);
      try { const blob = await getBlob(x.asset); const f = new File([blob], x.mime === "application/pdf" ? "scanner.pdf" : "scanner.jpg", {type:x.mime});
        const pgs = await lazyPages(f); INBOX_ITEMS[x.id] = {left:pgs.length, mine:0, groupe:x.groupe};
        const h = new Date(x.at).toLocaleTimeString(document.documentElement.lang === "en" ? "en-US" : "fr-FR", {hour:"2-digit", minute:"2-digit"});
        pgs.forEach(pg => S.queue.push({id:uid(), name:`Scanner · ${h}` + (pg.n > 1 ? " · p." + pg.i : ""), load:pg.load, thumb:pg.thumb, status:"attente", msg:"", inbox:x.id}));
        pages += pgs.length; }
      catch(e){ console.warn("inbox", e); inboxMark(x.id, "manuel"); }
    }
    if (pages){ toast(`${pages} page(s) reçue(s) du scanner : correction en cours.`, 5000); scheduleRender(); runQueue(); }
  } catch(e){} finally { S.inboxBusy = false; }
}
function inboxMark(id, status){ fetch("/api/scan/inbox/" + id, {method:"POST", credentials:"same-origin", headers:{"content-type":"application/json"}, body:JSON.stringify({status})}).catch(() => {}); }
/* Appelé par la file du Scanner pour chaque page venue d'un appareil */
function inboxPage(it, mine){
  const m = INBOX_ITEMS[it.inbox]; if (!m) return; m.left--; if (mine) m.mine++;
  if (m.left <= 0){ inboxMark(it.inbox, m.mine ? (m.manuel ? "manuel" : "fait") : (m.groupe ? "autre" : "manuel")); delete INBOX_ITEMS[it.inbox]; }
}
setInterval(pollInbox, 20000); document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(pollInbox, 800); });
setInterval(() => { if (DATA_READY && S.me && !S.inboxFirst){ S.inboxFirst = true; pollInbox(); } }, 1500);

/* Mon compte : appareils */
async function devLoad(){ try { S.dev.list = (await api("/api/devices")).appareils; } catch(e){ S.dev.list = []; } render(); }
function devicesPanel(){
  if (!window.TIKOUN_CONFIG?.accounts) return "";
  if (S.dev.list == null && !S.dev.busy){ S.dev.busy = true; devLoad().finally(() => { S.dev.busy = false; }); }
  const dir = S.me?.etab?.role === "direction";
  return `<section class="panel grid" style="max-width:640px"><h3>Scanner et Mastery Box</h3>
    <p class="small muted" style="margin:0">Relie un scanner Wi-Fi : les copies que tu y passes arrivent directement dans Mastery, sont rangées par QR code et corrigées. Garde l'application ouverte (ordinateur ou téléphone) : la correction démarre dès qu'une page arrive.</p>
    ${(S.dev.list || []).map(d => `<div class="item"><div><div class="t">${esc(d.nom)} <span class="chip">${d.portee === "ecole" ? "Tout l'établissement" : "Mes copies"}</span></div>
      <div class="s">${d.pages} page(s) reçue(s)${d.dernier ? " · dernier envoi le " + esc(frDate(d.dernier.slice(0, 10))) : " · encore aucun envoi"}</div></div>
      <div class="row"><button class="btn sm" data-devsheet="${d.id}">Feuille de réglage</button><button class="btn sm ghost" data-devdel="${d.id}">Retirer</button></div></div>`).join("")}
    <div class="form-row" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) auto;align-items:end"><div class="field"><label for="dev-nom">Nom de l'appareil</label><input id="dev-nom" placeholder="ex. Scanner salle des profs"></div>
      <div class="field"><label for="dev-portee">Copies de</label><select id="dev-portee"><option value="moi">Moi seulement</option>${dir ? `<option value="ecole">Tout l'établissement</option>` : ""}</select></div>
      <button class="btn primary" id="dev-add">Ajouter</button></div>
    <details><summary class="small" style="cursor:pointer">Réglage Wi-Fi imprimé sur la feuille de réglage (facultatif)</summary>
      <div class="form-row" style="margin-top:8px"><div class="field"><label for="dev-ssid">Nom du Wi-Fi</label><input id="dev-ssid" value="${esc(S.dev.ssid)}" autocomplete="off"></div><div class="field"><label for="dev-pass">Mot de passe du Wi-Fi</label><input id="dev-pass" type="password" value="${esc(S.dev.pass)}" autocomplete="off"></div></div>
      <p class="small muted" style="margin:0">Il n'est jamais envoyé au serveur : il est seulement imprimé dans le QR code de la feuille.</p></details></section>`;
}
function devSheet(d){
  const url = location.origin + "/api/scan/upload";
  const conf = JSON.stringify({v:1, u:url, t:d.token, ...(S.dev.ssid ? {s:S.dev.ssid, p:S.dev.pass} : {})});
  const w = window.open("", "_blank"); if (!w) return toast("Autorise les fenêtres pour imprimer la feuille.");
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Feuille de réglage · ${esc(d.nom)}</title><style>body{font-family:Inter,system-ui,sans-serif;color:#15233F;margin:48px;max-width:720px}h1{font-family:Georgia,serif;font-weight:600}img{image-rendering:pixelated;width:260px;height:260px}.box{border:2px solid #15233F;border-radius:12px;padding:24px;display:flex;gap:28px;align-items:center}code{font-size:12px;word-break:break-all;background:#F1ECE0;padding:2px 6px;border-radius:4px}ol{line-height:1.7}@media print{button{display:none}}</style></head><body>
    <h1>Feuille de réglage · ${esc(d.nom)}</h1>
    <div class="box"><img src="${qrURL(conf, 6)}" alt="QR code de réglage"><div><b>Mastery Box</b><p>Passe cette feuille dans la machine : elle se règle toute seule (Wi-Fi et compte).</p><p style="font-size:13px">Copies de : <b>${d.portee === "ecole" ? "tout l'établissement" : "ce professeur"}</b></p></div></div>
    <h2>Autre scanner Wi-Fi</h2><ol><li>Adresse d'envoi (HTTP POST, image JPEG/PNG ou PDF) :<br><code>${esc(url)}?t=${esc(d.token)}</code></li><li>Chaque page envoyée arrive dans Mastery et est corrigée automatiquement.</li></ol>
    <p style="font-size:12px;color:#5B6478">Garde cette feuille à l'abri : elle permet d'envoyer des copies sur ce compte. Pour la désactiver, retire l'appareil dans Mon compte.</p>
    <button onclick="print()">Imprimer</button></body></html>`);
  w.document.close();
}
document.addEventListener("input", ev => { if (ev.target.id === "dev-ssid") S.dev.ssid = ev.target.value; if (ev.target.id === "dev-pass") S.dev.pass = ev.target.value; });
document.addEventListener("click", async ev => {
  const t = ev.target.closest("button"); if (!t) return; const d = t.dataset;
  try {
    if (t.id === "dev-add"){ const j = await api("/api/devices", {method:"POST", body:JSON.stringify({nom:$("#dev-nom").value, portee:$("#dev-portee").value})}); S.dev.list = [...(S.dev.list || []), j.appareil]; render(); toast("Appareil ajouté : imprime sa feuille de réglage."); return; }
    if (d.devdel){ if (!confirm("Retirer cet appareil ? Il ne pourra plus envoyer de copies.")) return; await api("/api/devices/" + d.devdel, {method:"DELETE"}); return devLoad(); }
    if (d.devsheet){ const x = (S.dev.list || []).find(y => y.id === d.devsheet); if (x) devSheet(x); return; }
  } catch(e){ toast(e.message || "Erreur"); }
});

/* ================= Correction en arrière-plan : suivi des pages confiées au serveur =================
   Un encart « Correction en cours » reste visible sur toutes les pages de l'application. */
const JSON_ONLY = "\n\n(Réponds uniquement avec le JSON demandé, sans texte autour.)";
const jobsOn = () => !!(window.TIKOUN_CONFIG?.jobs && ASSETS && typeof SERVERSTORE !== "undefined" && SERVERSTORE);
const jobTxt = () => ({coche:"Coché : ", aucune:"aucune case", bonne:"Bonne réponse.", etait:"La bonne réponse était : ", qcmFaux:"réponse QCM incorrecte", vide:"Pas de réponse : revois cette notion.", videTag:"pas de réponse"});
S.jobs = []; S.jobsHide = 0; let jobsTimer = null;
async function pollJobs(){
  try { const r = await fetch("/api/jobs", {credentials:"same-origin"}); if (!r.ok) return; S.jobs = (await r.json()).jobs || []; } catch(e){ return; }
  for (const it of S.queue) if (it.jobId){ const j = S.jobs.find(x => x.id === it.jobId); if (!j) continue;
    if (j.status === "fait" && it.status !== "ok"){ it.status = "ok"; it.msg = j.msg || "Corrigée."; }
    else if (j.status === "erreur" && it.status !== "erreur"){ it.status = "erreur"; it.msg = j.msg || "Échec de la correction."; it.jobErr = true; } }
  jobsPill(); if (S.view === "scanner" || S.step === "scanner") scheduleRender();
  const pending = S.jobs.some(j => j.status === "attente" || j.status === "en_cours");
  if (pending) watchJobs(); else { clearTimeout(jobsTimer); jobsTimer = null; }
}
function watchJobs(){ clearTimeout(jobsTimer); jobsTimer = setTimeout(pollJobs, document.hidden ? 30000 : 6000); jobsPill(); }
document.addEventListener("visibilitychange", () => { if (!document.hidden && jobsOn()) pollJobs(); });
setTimeout(() => { if (jobsOn()) pollJobs(); }, 2500);
function jobsPill(){
  let el = document.getElementById("jobs-pill");
  const prep = S.queue.filter(x => ["attente", "qr", "lecture"].includes(x.status)).length, prepTot = S.queue.length;
  const recent = S.jobs.filter(j => Date.parse(j.createdAt) > S.jobsHide), tot = recent.length, done = recent.filter(j => j.status === "fait").length, err = recent.filter(j => j.status === "erreur").length;
  const pend = tot - done - err;
  if (!prep && !tot){ if (el) el.remove(); return; }
  if (!el){ el = document.createElement("div"); el.id = "jobs-pill"; el.setAttribute("role", "status"); document.body.append(el);
    el.addEventListener("click", ev => { const b = ev.target.closest("button"); if (!b) return;
      if (b.dataset.jp === "hide"){ S.jobsHide = Date.now(); jobsPill(); }
      if (b.dataset.jp === "voir"){ const ids = [...new Set(recent.map(j => j.ctrlId))]; if (ids.length === 1){ S.corrCtrl = ids[0]; S.corrEleve = null; openCtrl(ids[0], "corriger"); } else go("controles"); }
      if (b.dataset.jp === "scan") go("scanner"); }); }
  const pct = tot ? Math.round(100 * (done + err) / tot) : 0;
  el.className = !prep && !pend ? "done" : "";
  el.innerHTML = prep ? `<div><b>Préparation des pages : ${prepTot - prep} / ${prepTot}</b><span>Garde Mastery ouvert quelques instants, puis la correction continue seule.</span></div><button class="btn sm" data-jp="scan">Voir</button>`
    : pend ? `<div><b>Correction en cours : ${done} / ${tot} page(s)</b><span>Elle continue sur le serveur : tu peux changer de page ou fermer l'application.</span><i style="--p:${pct}%"></i></div><button class="btn sm" data-jp="scan">Détail</button>`
    : `<div><b>✓ Correction terminée : ${done} page(s)${err ? ` · ${err} à revoir` : ""}</b><span>Les notes sont prêtes à valider.</span></div><button class="btn sm primary" data-jp="voir">Voir</button><button class="btn sm ghost" data-jp="hide" aria-label="Fermer">×</button>`;
}
