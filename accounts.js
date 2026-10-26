
/* ================= Comptes des professeurs (serveur de l'école) ================= */
S.auth = null; S.me = null; S.scope = "moi"; S.users = [];
const isAdmin = () => S.me?.role === "admin";
const canEx = () => !window.TIKOUN_CONFIG?.accounts || !!S.me?.can?.exercices;
const lockChip = () => `<span class="chip" title="Feuilles d'exercices régénérables et scannables : abonnement Pro + option activée par la direction">🔒 Option Exercices</span>`;
const PLAN = {essentiel:"Essentiel", pro:"Pro"};
const isBoss = () => isAdmin() || (S.me?.etab?.role === "direction" && S.me?.etab?.actif);
function scopeCtrls(all){ if (!S.me || (isBoss() && S.scope === "ecole")) return all; return all.filter(c => !c.owner || c.owner === S.me.id); }
function applyScope(){ store.controles = scopeCtrls(store.allCtrl || []); store.cours = scopeCours(store.allCours || store.cours); store.classes = scopeClasses(store.allClasses || store.classes || []); }
function scopeClasses(all){ if (!S.me || isAdmin() || (isBoss() && S.scope === "ecole")) return all; return all.filter(c => !c.espace || c.espace === S.me.espace); }
function scopeCours(all){ if (!S.me || (isBoss() && S.scope === "ecole")) return all; return all.filter(c => !c.owner || c.owner === S.me.id); }
const userName = id => S.users.find(u => u.id === id)?.nom || "";
async function api(path, opts = {}){
  const r = await fetch(path, {credentials:"same-origin", ...opts, headers:{"content-type":"application/json", ...(opts.headers || {})}});
  let j = {}; try { j = await r.json(); } catch(e){}
  if (!r.ok){ if (j?.error?.code === "must_change" && S.auth !== "change"){ S.auth = "change"; scheduleRender(); }
    throw {status:r.status, message:j?.error?.message || (r.status >= 500 ? "Serveur momentanément indisponible : réessaie dans un instant." : "Erreur " + r.status), setup:j?.setup}; }
  return j;
}
/* Établissement : recherche dans l'annuaire officiel de l'Éducation nationale, ou saisie manuelle (non vérifiée) */
S.ec = {q:"", cp:"", res:null, sel:null, manual:false, busy:false, err:""};
const ecLine = e => `${esc(e.nom)}<div class="small muted">${esc([e.adresse, [e.cp, e.ville].filter(Boolean).join(" ")].filter(Boolean).join(" · "))}${e.type ? " · " + esc(e.type) + (e.statut ? " " + esc(e.statut.toLowerCase()) : "") : ""}</div>`;
const ecBadge = e => !e ? `<span class="chip">aucune école</span>` : e.verifiee ? `<span class="chip ok" title="Retrouvée dans l'annuaire officiel de l'Éducation nationale${e.uai ? " (UAI " + esc(e.uai) + ")" : ""}">✓ vérifiée</span>` : `<span class="chip warn" title="Saisie manuellement : non retrouvée dans l'annuaire officiel">non vérifiée</span>`;
function ecoleWidget(){
  const E = S.ec, EN_UI = document.documentElement.lang !== "fr";
  if (EN_UI && !E.sel) E.manual = true;
  if (E.sel) return `<div class="panel" style="padding:12px;background:var(--surface-2)"><div class="row between"><div>${ecLine(E.sel)}<div style="margin-top:6px">${ecBadge(E.sel)}</div></div><button class="btn sm" id="ec-change">Changer</button></div></div>`;
  if (E.manual) return `<div class="grid" style="gap:10px">
    <p class="small muted" style="margin:0">Ton école sera enregistrée comme <b>non vérifiée</b>. Tu peux utiliser Mastery normalement.</p>
    <div class="field"><label for="ec-nom">Nom de l'école</label><input id="ec-nom" value="${esc(E.q)}"></div>
    <div class="field"><label for="ec-adr">Adresse postale</label><input id="ec-adr" placeholder="ex. 12 rue de la Paix" value="${esc(S.form["ec-adr"] || "")}"></div>
    <div class="form-row"><div class="field"><label for="ec-cp2">Code postal</label><input id="ec-cp2" maxlength="10" value="${esc(E.cp)}"></div><div class="field"><label for="ec-ville">Ville</label><input id="ec-ville" value="${esc(S.form["ec-ville"] || "")}"></div></div>
    <div class="row"><button class="btn sm primary" id="ec-mok">Valider cette école</button>${EN_UI ? "" : `<button class="btn sm ghost" id="ec-back">← Revenir à la recherche</button>`}</div></div>`;
  return `<div class="grid" style="gap:10px">
    <div class="form-row"><div class="field"><label for="ec-q">Nom de l'école</label><input id="ec-q" value="${esc(E.q)}" placeholder="ex. Lycée Victor Hugo"></div>
      <div class="field"><label for="ec-cp">Code postal</label><input id="ec-cp" inputmode="numeric" maxlength="5" value="${esc(E.cp)}" placeholder="ex. 75003"></div></div>
    <div class="row"><button class="btn sm primary" id="ec-find" ${E.busy ? "disabled" : ""}>${E.busy ? "Recherche…" : "Rechercher dans l'annuaire officiel"}</button></div>
    ${E.err ? `<div class="small" style="color:var(--warn)">${esc(E.err)}</div>` : ""}
    ${E.res ? (E.res.length ? `<div>${E.res.map((e, i) => `<button class="item link" style="width:100%;text-align:left;background:none;border:0;border-bottom:1px solid var(--line);cursor:pointer" data-ecpick="${i}"><div>${ecLine(e)}</div></button>`).join("")}</div>` : `<p class="small muted" style="margin:0">Aucun établissement trouvé. Vérifie le code postal ou essaie un autre mot du nom.</p>`) : ""}
    <button class="btn sm ghost" id="ec-manual" style="justify-self:start">Mon école n'est pas dans la liste</button></div>`;
}
const affRadios = cur => `<div class="row">${Object.entries(AFFICHE).map(([k, l]) => `<label class="row small" style="gap:6px"><input type="radio" style="width:auto" name="aff" data-aff="${k}"${(cur || "les2") === k ? " checked" : ""}> ${l}</label>`).join("")}</div>`;
const affValue = () => document.querySelector('input[name="aff"]:checked')?.dataset.aff || "les2";
async function loadUsers(){ if (!isAdmin()) return; try { S.users = (await api("/api/users")).users; } catch(e){} }

function vAuth(){
  if (S.auth === "setup") return `<div class="head"><div><h2>Premier démarrage</h2><p>Crée le compte administrateur (direction). Il faut le code de l'établissement défini sur le serveur (variable MASTERY_CODE).</p></div></div>
  <section class="panel grid" style="max-width:440px">
    <div class="field"><label for="su-code">Code de l'établissement</label><input id="su-code" type="password"></div>
    <div class="field"><label for="su-nom">Nom affiché</label><input id="su-nom" placeholder="ex. Direction · A. Pevzner"></div>
    <div class="field"><label for="su-mail">E-mail</label><input id="su-mail" type="email" autocomplete="username"></div>
    <div class="field"><label for="su-pw">Mot de passe (8 caractères minimum)</label><input id="su-pw" type="password" autocomplete="new-password"></div>
    <div class="row"><button class="btn primary" id="su-go">Créer le compte</button></div><div class="status" id="au-st"></div></section>`;
  if (S.auth === "change") return `<div class="head"><div><h2>Choisis ton mot de passe</h2><p>Bienvenue ${esc(S.me?.nom || "")} : remplace le mot de passe provisoire.</p></div></div>
  <section class="panel grid" style="max-width:440px">
    <div class="field"><label for="ch-pw">Nouveau mot de passe (8 caractères minimum)</label><input id="ch-pw" type="password" autocomplete="new-password"></div>
    <div class="field"><label for="ch-pw2">Confirmer</label><input id="ch-pw2" type="password" autocomplete="new-password"></div>
    <div class="row"><button class="btn primary" id="ch-go">Enregistrer</button></div><div class="status" id="au-st"></div></section>`;
  if (S.auth === "pending") return `<div class="head"><div><h2>Demande envoyée ✓</h2><p>Merci ${esc(S.pend?.nom || "")} ! L'équipe Mastery va vérifier et valider ton inscription.</p></div></div>
  <section class="panel grid" style="max-width:560px">
    <div>${S.pend?.ecole ? ecLine(S.pend.ecole) + `<div style="margin-top:6px">${ecBadge(S.pend.ecole)} <span class="chip">Forfait ${PLAN[S.pend.planDemande] || "Essentiel"} · bêta gratuite</span></div>` : ""}</div>
    <p style="margin:0">Dès que ton compte est validé, connecte-toi avec <b>${esc(S.pend?.email || "")}</b> et ton mot de passe.</p>
    <div class="row"><button class="btn primary" id="rg-back">Aller à la connexion</button><a class="btn ghost" href="/">Retour à l'accueil</a></div></section>`;
  if (S.auth === "register") return `<div class="head"><div><h2>Créer mon compte professeur</h2><p>Ton espace est privé : tes classes, tes élèves et tes contrôles ne sont visibles que par toi.</p></div></div>
  <section class="panel grid" style="max-width:560px">
    <div class="field"><label for="rg-nom">Ton nom (affiché sur les feuilles si tu le choisis)</label><input id="rg-nom" placeholder="ex. M. Cohen" value="${esc(S.form["rg-nom"] || "")}"></div>
    <div class="field"><label for="rg-mail">E-mail</label><input id="rg-mail" type="email" autocomplete="username" value="${esc(S.form["rg-mail"] || "")}"></div>
    <div class="field"><label for="rg-pw">Mot de passe (8 caractères minimum)</label><input id="rg-pw" type="password" autocomplete="new-password" value="${esc(S.form["rg-pw"] || "")}"></div>
    <h3 style="margin-top:6px">Ton établissement</h3>
    ${ecoleWidget()}
    <div class="field"><label>En-tête de tes contrôles et exercices</label>${affRadios(S.regAff)}</div>
    <h3 style="margin-top:6px">Ton forfait <span class="chip ok" style="vertical-align:middle">Bêta gratuite</span></h3>
    <div class="form-row">${[["essentiel","Essentiel","Contrôles générés par l'IA, feuilles avec QR code, scan et correction des copies, vue classe, rattrapages individuels."],["pro","Pro","Tout Essentiel + exercices en ligne : quiz régénérables, accès élève par code, suivi par notion."]].map(([k, t, d]) => `<label class="panel" style="padding:12px;cursor:pointer;display:grid;gap:4px;${(S.regPlan || "essentiel") === k ? "border-color:var(--blue);box-shadow:0 0 0 2px var(--blue-soft)" : ""}"><span class="row" style="gap:8px"><input type="radio" style="width:auto" name="plan" data-plan="${k}"${(S.regPlan || "essentiel") === k ? " checked" : ""}><b>${t}</b></span><span class="small muted">${d}</span></label>`).join("")}</div>
    <p class="small muted" style="margin:0">Pendant la bêta, les deux forfaits sont gratuits : aucun paiement n'est demandé. Ton inscription sera validée par l'équipe Mastery.</p>
    <label class="small" style="display:flex;gap:8px;align-items:flex-start;cursor:pointer"><input type="checkbox" id="rg-cgu" style="width:auto;margin-top:3px" ${S.regCgu ? "checked" : ""}><span>J'accepte les <a href="/cgu" target="_blank" rel="noopener" style="color:var(--gold)">conditions d'utilisation</a> et la <a href="/confidentialite" target="_blank" rel="noopener" style="color:var(--gold)">politique de confidentialité</a>. Je m'engage à informer les familles de l'utilisation de Mastery pour mes classes.</span></label>
    <div class="row"><button class="btn primary" id="rg-go">Envoyer ma demande d'inscription</button><button class="btn ghost" id="rg-back">J'ai déjà un compte</button></div><div class="status" id="au-st"></div></section>`;
  return `<div class="auth"><section class="auth-card">
    <div class="auth-h"><h2>Connexion</h2><p>Crée, imprime et corrige tes contrôles avec l'IA.</p></div>
    <div class="field"><label for="lg-mail2">E-mail</label><input id="lg-mail2" type="email" autocomplete="username" placeholder="prenom.nom@ecole.fr"></div>
    <div class="field"><label for="lg-pw2">Mot de passe</label><input id="lg-pw2" type="password" autocomplete="current-password"></div>
    <button class="btn primary auth-go" id="lg-go2">Se connecter</button><div class="status" id="au-st"></div>
    <p class="small muted auth-note">Mot de passe oublié : écris à l'administrateur de Mastery pour le réinitialiser.</p>
    ${window.TIKOUN_CONFIG?.signup ? `<div class="auth-alt"><span class="small muted">Pas encore de compte ?</span><button class="btn" id="rg-open">Créer mon compte professeur</button></div>` : ""}
  </section>
  <p class="small muted auth-foot"><a href="/">← Retour au site</a> · <a href="?lang=fr">Français</a> · <a href="?lang=en">English</a> · <a href="?lang=pt">Português</a></p></div>`;
}
const KEEP = ["rg-nom","rg-mail","rg-pw","me-nom","ec-adr","ec-ville","ec-q","ec-cp"]; let kept = {}; S.form = {};
document.addEventListener("change", async ev => { if (ev.target.id === "rg-cgu") S.regCgu = ev.target.checked;
  if (ev.target.id === "me-partage"){ try { const j = await api("/api/me", {method:"PATCH", body:JSON.stringify({partageEcriture:ev.target.checked})}); S.me = j.user; toast("Enregistré"); } catch(e){ toast(e.message); } }
  if (ev.target.id === "me-bareme"){ try { const j = await api("/api/me", {method:"PATCH", body:JSON.stringify({bareme:ev.target.value})}); S.me = j.user; toast("Enregistré"); render(); } catch(e){ toast(e.message); } } });
document.addEventListener("input", ev => { const el = ev.target; if (KEEP.includes(el.id)) S.form[el.id] = el.value; if (el.id === "ec-q") S.ec.q = el.value; if (el.id === "ec-cp") S.ec.cp = el.value; });
const keepForm = () => { kept = {}; for (const id of KEEP){ const el = $("#" + id); if (el) kept[id] = el.value; } const a = document.querySelector('input[name="aff"]:checked'); if (a) kept.aff = a.dataset.aff; };
const restoreForm = () => { for (const [id, v] of Object.entries(kept)){ if (id === "aff"){ const r = document.querySelector(`input[data-aff="${v}"]`); if (r) r.checked = true; continue; } const el = $("#" + id); if (el) el.value = v; } };
async function afterLogin(user, mustChange){
  S.me = user; S.auth = mustChange ? "change" : null;
  if (!S.auth){ await loadUsers(); if (!SERVERSTORE) await startServer(); else { applyScope(); render(); } } else render();
}
async function bootAccounts(){
  try { const j = await api("/api/me"); await afterLogin(j.user, !!j.user?.mustChange); }
  catch(e){ S.auth = e.status === 401 && e.setup ? "setup" : /^#\/inscription/.test(location.hash) && window.TIKOUN_CONFIG?.signup ? "register" : "login"; if (S.auth === "register"){ const pl = location.hash.split("/")[2]; if (pl === "pro" || pl === "essentiel") S.regPlan = pl; S.ecFor = "reg"; S.ec = {q:"", cp:"", res:null, sel:null, manual:false, busy:false, err:""}; } refreshCaps(); render(); }
}

/* Mon compte */
function vCompte(){
  if (S.ecFor !== "me"){ S.ec = {q:"", cp:"", res:null, sel:S.me?.ecole || null, manual:false, busy:false, err:""}; S.ecFor = "me"; }
  return `<div class="head"><div><h2>Mon compte</h2><p>${esc(S.me?.nom || "")} · ${esc(S.me?.email || "")} · ${isAdmin() ? "Administrateur" : isDir() ? "Direction" : "Professeur"} · ${S.me?.billing && S.me?.acces?.mode !== "inclus" ? esc(accesLabel(S.me)) : `Abonnement ${PLAN[S.me?.plan] || "Essentiel"} · Option Exercices ${S.me?.can?.exercices ? "✓" : "✗"}`}</p></div>
    <button class="btn" id="out-go">Se déconnecter</button></div>
  ${abonnementPanel()}${etabPanel()}${devicesPanel()}${parrainagePanel()}
  <section class="panel grid" style="max-width:640px"><h3>Mon établissement et en-tête des feuilles</h3>
    <div class="field"><label for="me-nom">Mon nom</label><input id="me-nom" value="${esc(S.form["me-nom"] ?? S.me?.nom ?? "")}"></div>
    ${ecoleWidget()}
    <div class="field"><label>Afficher en haut des contrôles et exercices</label>${affRadios(S.me?.affichage)}</div>
    <p class="small muted" style="margin:0">Aperçu : <b id="me-prev">${esc(headerFrom(S.me?.affichage || "les2"))}</b></p>
    <div class="row"><button class="btn primary" id="me-save">Enregistrer</button></div><div class="status" id="me-st"></div></section>
  <section class="panel grid" style="max-width:640px"><h3>Les matières que j'enseigne</h3>
    <p class="small muted" style="margin:0">Seules ces matières te seront proposées. Si tu n'en enseignes qu'une, elle est choisie toute seule quand tu prépares un contrôle.</p>
    <div class="row">${enseigne().map(m => `<span class="chip">${esc(m)} <button class="btn sm ghost" style="padding:0 4px" data-ensdel="${esc(m)}" aria-label="Retirer">×</button></span>`).join("") || `<span class="small muted">Aucune matière choisie : toute la liste est proposée.</span>`}</div>
    <div class="row"><select id="ens-sel" style="max-width:260px" aria-label="Matière à ajouter"><option value="">Choisir une matière…</option>${selOpts(myMatieres(true).filter(m => !enseigne().includes(m)), "")}</select><button class="btn sm primary" id="ens-go">Ajouter</button></div>
    <div class="row"><input id="mat-new" placeholder="Matière absente de la liste" style="max-width:260px"><button class="btn sm" id="mat-go">Ajouter</button></div></section>
  <section class="panel grid" style="max-width:640px"><h3>Amélioration de la lecture</h3>
    <label class="row small" style="gap:8px;align-items:flex-start"><input type="checkbox" id="me-partage" style="width:auto;margin-top:3px"${S.me?.partageEcriture ? " checked" : ""}${isAdmin() ? " disabled" : ""}><span>Partager anonymement mes corrections de lecture (image du cadre de réponse et texte corrigé, jamais le nom de l'élève) pour améliorer la lecture de l'écriture manuscrite.</span></label></section>
  <section class="panel grid" style="max-width:640px"><h3>Notes affichées</h3>
    <p class="small muted" style="margin:0">Les calculs restent identiques ; seul l'affichage des notes change.</p>
    <select id="me-bareme" style="max-width:320px">${[["20","Sur 20 (France)"],["10","Sur 10 (Brésil)"],["100","Pourcentage (%)"],["AF","Lettres A à F (États-Unis)"]].map(([k, t]) => `<option value="${k}"${bareme() === k ? " selected" : ""}>${t}</option>`).join("")}</select></section>
  <section class="panel grid" style="max-width:640px"><h3>Langue</h3><p class="row">${[["fr","Français"],["en","English (US)"],["pt","Português (BR)"]].map(([k, l]) => `<a class="btn sm${(document.documentElement.lang || "fr").slice(0, 2) === k ? " cur" : ""}" href="?lang=${k}">${l}</a>`).join("")}</p></section>
  <section class="panel grid" style="max-width:640px"><h3>Apparence</h3><p class="small muted" style="margin:0">Choix propre à cet appareil. Automatique : clair la journée, sombre le soir et la nuit (de 20 h à 7 h).</p>
    <div class="seg" role="group" aria-label="Apparence">${[["clair","Clair"],["sombre","Sombre"],["auto","Automatique"]].map(([k, l]) => `<button data-th="${k}" aria-pressed="${themePref() === k}">${l}</button>`).join("")}</div></section>
  <section class="panel grid" style="max-width:640px"><h3>Changer de mot de passe</h3>
    <div class="field"><label for="mc-old">Mot de passe actuel</label><input id="mc-old" type="password" autocomplete="current-password"></div>
    <div class="field"><label for="mc-new">Nouveau mot de passe (8 caractères minimum)</label><input id="mc-new" type="password" autocomplete="new-password"></div>
    <div class="row"><button class="btn primary" id="mc-go">Enregistrer</button></div><div class="status" id="mc-st"></div></section>
  ${vReglages()}
  <section class="panel grid" style="max-width:640px"><h3>Supprimer mon compte</h3>
    <p class="small muted" style="margin:0">Efface définitivement ton compte et tout ce qui t'appartient : contrôles, copies scannées, notes, cours, exercices et images. Pense d'abord à exporter tes notes si tu en as besoin.</p>
    <div class="field"><label for="del-pw">Mot de passe actuel</label><input id="del-pw" type="password" autocomplete="current-password"></div>
    <div class="row"><button class="btn" id="del-me" style="color:var(--pen);border-color:var(--pen)">Supprimer définitivement mon compte</button></div><div class="status" id="del-st"></div></section>
  <p class="small muted"><a href="/mentions-legales" target="_blank" rel="noopener">Mentions légales</a> · <a href="/cgu" target="_blank" rel="noopener">Conditions d'utilisation</a> · <a href="/confidentialite" target="_blank" rel="noopener">Confidentialité</a></p>`;
}
/* Comptes (administrateur) */
const genPw = () => { const a = "abcdefghjkmnpqrstuvwxyz23456789"; let s = ""; for (const b of crypto.getRandomValues(new Uint8Array(10))) s += a[b % a.length]; return s; };
function vComptes(){
  if (!isAdmin()) return `<div class="panel empty">Réservé à la direction.</div>`;
  const nb = id => (store.allCtrl || []).filter(c => c.owner === id).length;
  const pend = S.users.filter(u => u.statut === "en_attente"), ok = S.users.filter(u => u.statut !== "en_attente");
  const pendHtml = pend.length ? `<section class="panel"><h3>Inscriptions à valider <span class="chip warn">${pend.length}</span></h3>
    <div style="margin-top:6px">${pend.map(u => `<div class="item"><div><div class="t">${esc(u.nom)} <span class="muted small">· ${esc(u.email)}</span></div>
      <div class="s">${u.ecole ? `${esc(u.ecole.nom)} · ${esc([u.ecole.adresse, [u.ecole.cp, u.ecole.ville].filter(Boolean).join(" ")].filter(Boolean).join(", "))}${u.ecole.uai ? " · UAI " + esc(u.ecole.uai) : ""} ` : ""}${ecBadge(u.ecole)} <span class="chip">Forfait demandé : ${PLAN[u.planDemande] || "Essentiel"}</span> <span class="small muted">· ${esc(frDate((u.createdAt || "").slice(0, 10)) || "")}</span></div></div>
      <div class="row"><button class="btn sm primary" data-uval="${u.id}">Valider</button><button class="btn sm ghost" data-uref="${u.id}">Refuser</button></div></div>`).join("")}</div></section>` : "";
  return `<div class="head"><div><h2>Comptes des professeurs</h2><p>Les professeurs inscrits seuls ont un espace privé. Ceux que tu crées ici partagent tes classes.</p></div></div>
  ${pendHtml}
  <section class="panel"><div class="tbl-wrap"><table><thead><tr><th>Nom</th><th>E-mail</th><th>École</th><th>Rôle</th><th>Accès</th><th>Abonnement</th><th>Option Exercices</th><th class="c">Contrôles</th><th></th></tr></thead><tbody>
  ${ok.map(u => `<tr><td><b>${esc(u.nom)}</b>${u.statut === "refuse" ? ' <span class="chip bad">refusé</span>' : u.actif ? "" : ' <span class="chip bad">désactivé</span>'}</td><td>${esc(u.email)}</td>
    <td>${u.ecole ? `<div class="small"><b>${esc(u.ecole.nom)}</b> ${ecBadge(u.ecole)}<div class="muted">${esc([u.ecole.cp, u.ecole.ville].filter(Boolean).join(" "))}${u.ecole.uai ? " · UAI " + esc(u.ecole.uai) : ""}</div></div>` : `<span class="muted small">—</span>`}</td>
    <td><select data-urole="${u.id}" style="width:auto" aria-label="Rôle">${selOpts(["prof","admin"], u.role, x => x === "admin" ? "Administrateur" : "Professeur")}</select></td>
    <td class="small">${esc(accesLabel(u))}${S.me?.billing && u.inscription === "libre" && u.acces?.mode !== "abonne" ? ` <button class="btn sm ghost" data-ugift="${u.id}" title="Prolonger l'essai d'un mois">+1 mois</button>` : ""}</td>
    <td><select data-uplan="${u.id}" style="width:auto" aria-label="Abonnement">${selOpts(["essentiel","pro"], u.plan || "essentiel", x => PLAN[x])}</select></td>
    <td>${(u.plan || "essentiel") === "pro" ? `<label class="row small" style="gap:6px"><input type="checkbox" data-uex="${u.id}"${u.options?.exercices ? " checked" : ""}> ${u.options?.exercices ? "Activée" : "Désactivée"}</label>` : `<span class="muted small">Pro requis</span>`}</td>
    <td class="c num">${nb(u.id)}</td>
    <td><div class="row">${u.id !== S.me.id ? `<button class="btn sm" data-ureset="${u.id}">Nouveau mot de passe</button><button class="btn sm ghost" data-uact="${u.id}" data-v="${u.actif ? 0 : 1}">${u.actif ? "Désactiver" : "Réactiver"}</button><button class="btn sm ghost danger" data-udel="${u.id}">Supprimer</button>` : ""}</div></td></tr>`).join("")}
  </tbody></table></div><div class="status" id="us-st"></div></section>
  <section class="panel grid" style="max-width:640px"><h3>Ajouter un professeur</h3>
    <div class="form-row"><div class="field"><label for="nu-nom">Nom</label><input id="nu-nom" placeholder="ex. M. Cohen (maths)"></div>
      <div class="field"><label for="nu-mail">E-mail</label><input id="nu-mail" type="email"></div></div>
    <div class="form-row"><div class="field"><label for="nu-pw">Mot de passe provisoire</label><input id="nu-pw" value="${genPw()}"></div>
      <div class="field"><label for="nu-role">Rôle</label><select id="nu-role">${selOpts(["prof","admin"], "prof", x => x === "admin" ? "Administrateur" : "Professeur")}</select></div></div>
    <div class="form-row"><div class="field"><label for="nu-plan">Abonnement</label><select id="nu-plan">${selOpts(["essentiel","pro"], "essentiel", x => PLAN[x])}</select></div>
      <label class="row small" style="gap:6px;align-self:end"><input type="checkbox" id="nu-ex"> Activer l'option Exercices (Pro)</label></div>
    <p class="small muted">Transmets l'e-mail et le mot de passe provisoire au professeur : il devra le changer à sa première connexion.</p>
    <div class="row"><button class="btn primary" id="nu-go">Créer le compte</button></div><div class="status" id="nu-st"></div></section>`;
}

document.addEventListener("click", async ev => {
  const t = ev.target.closest("button"); if (!t) return; const d = t.dataset;
  const st = () => $("#au-st");
  if (d.th){ try { localStorage.setItem("mastery.theme", d.th); } catch(e){} applyTheme(); return render(); }
  try {
    if (d.uval){ await api("/api/users/" + d.uval, {method:"PATCH", body:JSON.stringify({statut:"valide"})}); await loadUsers(); toast("Inscription validée"); return render(); }
    if (d.uref){ if (!confirm("Refuser cette inscription ?")) return; await api("/api/users/" + d.uref, {method:"PATCH", body:JSON.stringify({statut:"refuse"})}); await loadUsers(); return render(); }
    if (t.id === "ens-go"){ const n = $("#ens-sel").value; if (!n) return; await saveEnseigne([...enseigne(), n]); return render(); }
    if (t.id === "mat-go"){ const n = $("#mat-new").value.trim(); if (!n) return; await saveMatieres([...(S.me?.matieres || []), n]); await saveEnseigne([...enseigne(), n]); return render(); }
    if (d.ensdel){ await saveEnseigne(enseigne().filter(m => m !== d.ensdel)); return render(); }
    if (t.id === "rg-open"){ S.auth = "register"; S.ecFor = "reg"; S.ec = {q:"", cp:"", res:null, sel:null, manual:false, busy:false, err:""}; return render(); }
    if (t.id === "rg-back"){ S.auth = "login"; return render(); }
    if (t.id === "ec-find"){ S.ec.q = $("#ec-q").value.trim(); S.ec.cp = $("#ec-cp").value.trim(); keepForm();
      if (!S.ec.q && !S.ec.cp){ S.ec.err = "Indique au moins le nom ou le code postal."; return render(); }
      S.ec.busy = true; S.ec.err = ""; render();
      try { S.ec.res = (await api(`/api/ecoles?q=${encodeURIComponent(S.ec.q)}&cp=${encodeURIComponent(S.ec.cp)}`)).ecoles; } catch(e){ S.ec.err = e.message; S.ec.res = null; }
      S.ec.busy = false; render(); restoreForm(); return; }
    if (d.ecpick !== undefined){ keepForm(); S.ec.sel = {...S.ec.res[+d.ecpick], verifiee:true}; render(); restoreForm(); return; }
    if (t.id === "ec-change"){ keepForm(); S.ec.sel = null; S.ec.manual = false; render(); restoreForm(); return; }
    if (t.id === "ec-manual"){ keepForm(); S.ec.q = $("#ec-q")?.value.trim() || S.ec.q; S.ec.cp = $("#ec-cp")?.value.trim() || S.ec.cp; S.ec.manual = true; render(); restoreForm(); return; }
    if (t.id === "ec-back"){ keepForm(); S.ec.manual = false; render(); restoreForm(); return; }
    if (t.id === "ec-mok"){ const e = {nom:$("#ec-nom").value.trim(), adresse:$("#ec-adr").value.trim(), cp:$("#ec-cp2").value.trim(), ville:$("#ec-ville").value.trim(), verifiee:false};
      if (!e.nom || !/^[0-9A-Za-z][0-9A-Za-z\- ]{2,9}$/.test(e.cp) || !e.ville){ toast("Nom, code postal (5 chiffres) et ville sont nécessaires."); return; }
      keepForm(); S.ec.sel = e; S.ec.manual = false; render(); restoreForm(); return; }
    if (t.id === "rg-go"){ if (!S.ec.sel){ st().textContent = "Choisis ton établissement (ou saisis-le manuellement)."; return; }
      if (!$("#rg-cgu")?.checked){ st().textContent = "Coche la case pour accepter les conditions d'utilisation."; return; }
      st().innerHTML = `<span class="thinking">Création…</span>`;
      const j = await api("/api/register", {method:"POST", body:JSON.stringify({nom:$("#rg-nom").value, email:$("#rg-mail").value, password:$("#rg-pw").value, affichage:affValue(), plan:document.querySelector('input[name="plan"]:checked')?.dataset.plan || "essentiel", ecole:S.ec.sel, cgu:true})});
      S.pend = j.user; S.auth = "pending"; history.replaceState(null, "", "#/connexion"); return render(); }
    if (t.id === "me-save"){ const body = {nom:$("#me-nom").value, affichage:affValue()}; if (S.ec.sel && JSON.stringify(S.ec.sel) !== JSON.stringify(S.me.ecole)) body.ecole = S.ec.sel;
      const j = await api("/api/me", {method:"PATCH", body:JSON.stringify(body)}); S.me = j.user; S.ec.sel = j.user.ecole; render(); toast(j.user.ecole?.verifiee === false && body.ecole ? "Enregistré · école non vérifiée" : "Enregistré"); return; }
    if (t.id === "lg-go2"){ st().innerHTML = `<span class="thinking">Connexion…</span>`;
      const j = await api("/api/login", {method:"POST", body:JSON.stringify({email:$("#lg-mail2").value, password:$("#lg-pw2").value})}); return afterLogin(j.user, j.mustChange); }
    if (t.id === "su-go"){ st().innerHTML = `<span class="thinking">Création…</span>`;
      const j = await api("/api/setup", {method:"POST", body:JSON.stringify({code:$("#su-code").value, nom:$("#su-nom").value, email:$("#su-mail").value, password:$("#su-pw").value})}); return afterLogin(j.user, false); }
    if (t.id === "ch-go"){ if ($("#ch-pw").value !== $("#ch-pw2").value){ st().textContent = "Les deux mots de passe sont différents."; return; }
      const j = await api("/api/me/password", {method:"POST", body:JSON.stringify({password:$("#ch-pw").value})}); return afterLogin(j.user, false); }
    if (t.id === "out-go" || t.id === "srv-out"){ await api("/api/logout", {method:"POST"}).catch(() => {}); location.hash = "#/accueil"; location.reload(); return; }
    if (t.id === "mc-go"){ await api("/api/me/password", {method:"POST", body:JSON.stringify({old:$("#mc-old").value, password:$("#mc-new").value})}); $("#mc-st").textContent = "Mot de passe modifié."; return; }
    if (t.id === "nu-go"){ const j = await api("/api/users", {method:"POST", body:JSON.stringify({nom:$("#nu-nom").value, email:$("#nu-mail").value, password:$("#nu-pw").value, role:$("#nu-role").value, plan:$("#nu-plan").value, exercices:$("#nu-ex").checked})});
      await loadUsers(); render(); $("#nu-st").textContent = `Compte créé : ${j.user.email} · mot de passe provisoire à transmettre.`; return; }
    if (d.ureset){ if (!confirm(`Créer un nouveau mot de passe provisoire ? L'ancien ne fonctionnera plus.\n\n${S.users.find(u => u.id === d.ureset)?.email || ""}`)) return; const pw = genPw(); await api("/api/users/" + d.ureset, {method:"PATCH", body:JSON.stringify({password:pw})}); $("#us-st").innerHTML = `Nouveau mot de passe provisoire pour ${esc(S.users.find(u => u.id === d.ureset)?.email)} : <b class="num">${pw}</b>`; return; }
    if (d.uact){ await api("/api/users/" + d.uact, {method:"PATCH", body:JSON.stringify({actif:d.v === "1"})}); await loadUsers(); return render(); }
    if (d.udel){ const x = (S.users || []).find(u => u.id === d.udel); if (!x) return;
      if (!confirm(`Supprimer définitivement le compte de ${x.nom} (${x.email}) et toutes ses données (contrôles, copies, notes, images) ?`)) return;
      await api("/api/users/" + d.udel, {method:"DELETE", body:"{}"}); await loadUsers(); toast("Compte supprimé."); return render(); }
    if (t.id === "del-me"){ if (!$("#del-pw").value) return void ($("#del-st").textContent = "Entre ton mot de passe.");
      if (!confirm("Supprimer définitivement ton compte et toutes tes données ? Cette action ne peut pas être annulée.")) return;
      await api("/api/me", {method:"DELETE", body:JSON.stringify({password:$("#del-pw").value})}); alert("Ton compte et tes données ont été supprimés."); location.href = "/"; return; }
  } catch(e){ const box = (t.id === "del-me" && $("#del-st")) || $("#au-st") || $("#me-st") || $("#mc-st") || $("#nu-st") || $("#us-st"); if (box) box.textContent = e.message || "Erreur."; else toast(e.message || "Erreur."); }
});
document.addEventListener("change", async ev => {
  const el = ev.target;
  if (el.dataset.urole){ try { await api("/api/users/" + el.dataset.urole, {method:"PATCH", body:JSON.stringify({role:el.value})}); await loadUsers(); } catch(e){ toast(e.message); } render(); }
  if (el.dataset.uplan){ try { await api("/api/users/" + el.dataset.uplan, {method:"PATCH", body:JSON.stringify({plan:el.value})}); await loadUsers(); } catch(e){ toast(e.message); } render(); }
  if (el.dataset.uex){ try { await api("/api/users/" + el.dataset.uex, {method:"PATCH", body:JSON.stringify({exercices:el.checked})}); await loadUsers(); if (el.dataset.uex === S.me.id){ S.me = (await api("/api/me")).user; } } catch(e){ toast(e.message); } render(); }
  if (el.dataset.aff && $("#me-prev")) $("#me-prev").textContent = headerFrom(el.dataset.aff);
  if (el.dataset.aff && S.auth === "register") S.regAff = el.dataset.aff;
  if (el.dataset.plan && S.auth === "register"){ S.regPlan = el.dataset.plan; keepForm(); render(); restoreForm(); }
  if (el.id === "scope-sel"){ S.scope = el.value; applyScope(); render(); }
});

/* ================= Abonnement, parrainage, établissement ================= */
const CFG = () => window.TIKOUN_CONFIG || {};
const isDir = () => S.me?.etab?.role === "direction" && S.me?.etab?.actif;
const JRS = "jour(s) restant(s)";
const joursRest = iso => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 864e5));
function billBanner(){
  const a = S.me?.acces; if (!a || !S.me?.billing || S.view === "compte") return "";
  if (a.mode === "expire") return `<p class="banner">Ton essai gratuit est terminé : tes données restent consultables, mais pour créer, scanner et corriger, choisis un abonnement. <a href="#/compte" class="btn sm gold">Choisir mon abonnement</a></p>`;
  if (a.mode === "essai" && joursRest(a.fin) <= 7) return `<p class="banner">Essai gratuit : ${joursRest(a.fin)} ${JRS}. <a href="#/compte" class="btn sm">Voir les abonnements</a></p>`;
  return "";
}
function abonnementPanel(){
  const a = S.me?.acces || {}, P = CFG().prix || {};
  if (!S.me?.billing || a.mode === "beta") return `<section class="panel grid" style="max-width:640px"><h3>Mon abonnement <span class="chip ok" style="vertical-align:middle">Bêta gratuite</span></h3><p class="small muted" style="margin:0">Pendant la bêta, tout est gratuit. Tu seras prévenu avant l'ouverture des abonnements.</p></section>`;
  if (a.mode === "inclus") return `<section class="panel grid" style="max-width:640px"><h3>Mon abonnement</h3><p class="small muted" style="margin:0">Ton compte est inclus dans l'accès de ton établissement.</p></section>`;
  if (a.mode === "ecole") return `<section class="panel grid" style="max-width:640px"><h3>Mon abonnement <span class="chip ok" style="vertical-align:middle">Pro</span></h3><p class="small muted" style="margin:0">Payé par ton établissement : ${esc(a.ecole || "")}.</p></section>`;
  if (a.mode === "abonne") return `<section class="panel grid" style="max-width:640px"><h3>Mon abonnement <span class="chip ok" style="vertical-align:middle">${PLAN[a.plan] || ""}</span></h3>
    <p class="small muted" style="margin:0">${a.status === "past_due" ? "⚠ Le dernier paiement a échoué : mets à jour ta carte. " : ""}${a.annule ? "Se termine le " : "Prochain renouvellement le "}${a.fin ? frDate(a.fin.slice(0, 10)) : "—"}.</p>
    <div class="row"><button class="btn" id="bil-portal">Gérer mon abonnement (carte, factures, résiliation)</button></div><div class="status" id="bil-st"></div></section>`;
  const card = (k, t, d, m, an) => `<div class="panel" style="padding:14px;display:grid;gap:6px"><div class="row" style="justify-content:space-between"><b>${t}</b><span class="small muted">${esc(m)} · ou ${esc(an)}</span></div>
    <div class="small muted">${d}</div><div class="row"><button class="btn sm primary" data-buy="${k}" data-per="mois">${esc(m)}</button><button class="btn sm" data-buy="${k}" data-per="an">${esc(an)}</button></div></div>`;
  return `<section class="panel grid" style="max-width:640px"><h3>Mon abonnement ${a.mode === "essai" ? `<span class="chip ok" style="vertical-align:middle">Essai gratuit · ${joursRest(a.fin)} ${JRS}</span>` : `<span class="chip bad" style="vertical-align:middle">Essai terminé</span>`}</h3>
    <p class="small muted" style="margin:0">${a.mode === "essai" ? `Pendant l'essai, tout le forfait Pro est ouvert, jusqu'au ${frDate(a.fin.slice(0, 10))}. Si tu t'abonnes maintenant, le premier paiement n'a lieu qu'à la fin de l'essai.` : "Tes données sont conservées. Choisis un abonnement pour continuer à créer, scanner et corriger."}</p>
    <div class="form-row">${card("essentiel", "Essentiel", "Contrôles par l'IA, feuilles avec QR code, scan et correction, rattrapages, suivi.", P.essentiel || "", P.essentielAn || "")}
      ${card("pro", "Pro", "Tout Essentiel + quiz en ligne pour les élèves, accès par code, suivi par notion.", P.pro || "", P.proAn || "")}</div>
    <p class="small muted" style="margin:0">Paiement sécurisé par Stripe. Résiliable à tout moment.</p><div class="status" id="bil-st"></div></section>`;
}
function parrainagePanel(){
  if (!S.me?.ref) return ""; const link = location.origin + "/?ref=" + S.me.ref, st = S.me.parrainage || {};
  return `<section class="panel grid" style="max-width:640px"><h3>Parrainage</h3>
    <p class="small muted" style="margin:0">Partage ton lien avec tes collègues. Ils ont un mois d'essai en plus, et toi un mois offert dès qu'ils paient leur premier mois (jusqu'à 12 mois par an).</p>
    <div class="row"><input id="ref-link" readonly value="${esc(link)}" style="flex:1;min-width:220px"><button class="btn sm primary" id="ref-copy">Copier</button><a class="btn sm" href="https://wa.me/?text=${encodeURIComponent("Je corrige mes contrôles avec Mastery, essaie-le : " + link)}" target="_blank" rel="noopener">WhatsApp</a></div>
    <p class="small" style="margin:0"><b>${st.filleuls || 0}</b> collègue(s) inscrit(s) · <b>${st.payants || 0}</b> abonné(s) · <b>${st.mois || 0}</b> mois gagné(s) cette année</p></section>`;
}
function etabPanel(){
  const e = S.me?.etab, P = CFG().prix || {};
  if (!e) return `<section class="panel grid" style="max-width:640px"><h3>Forfait établissement</h3>
    <p class="small muted" style="margin:0">Ta direction t'a donné un code ? Rejoins ton établissement : elle pourra suivre les résultats de tes classes${S.me?.billing ? ", et peut prendre ton abonnement en charge" : ""}.</p>
    <div class="row"><input id="et-code" placeholder="Code de l'établissement" style="max-width:220px;text-transform:uppercase"><button class="btn sm primary" id="et-join">Rejoindre</button></div>
    <details><summary class="small" style="cursor:pointer">Tu es la direction ? Créer le forfait établissement</summary>
      <div class="grid" style="margin-top:10px"><div class="form-row"><div class="field"><label for="et-nom">Nom de l'établissement</label><input id="et-nom" value="${esc(S.me?.ecole?.nom || "")}"></div>
        <div class="field"><label for="et-el">Nombre d'élèves</label><input id="et-el" type="number" min="1" inputmode="numeric"></div></div>
      <label class="row small" style="gap:6px"><input type="checkbox" id="et-pay" style="width:auto"> L'établissement paie aussi l'abonnement Pro de tous ses professeurs</label>
      <p class="small muted" style="margin:0">Le forfait établissement ouvre la vue direction sur toutes les classes des professeurs qui le rejoignent${S.me?.billing && P.ecole ? ` (${esc(P.ecole)})` : ""}. Il est indépendant des abonnements des professeurs.</p>
      <div class="row"><button class="btn sm primary" id="et-new">Créer</button></div></div></details><div class="status" id="et-st"></div></section>`;
  if (e.role === "membre") return `<section class="panel grid" style="max-width:640px"><h3>Forfait établissement</h3>
    <p class="small" style="margin:0"><b>${esc(e.nom)}</b>${e.payeProfs && e.actif ? " · ton abonnement Pro est pris en charge" : ""}</p><p class="small muted" style="margin:0">La direction peut consulter les classes, contrôles et résultats de ton espace.</p>
    <div class="row"><button class="btn sm ghost" id="et-quit">Quitter l'établissement</button></div><div class="status" id="et-st"></div></section>`;
  const ab = e.abonnement;
  return `<section class="panel grid" style="max-width:640px"><h3>Forfait établissement · direction ${e.actif ? `<span class="chip ok" style="vertical-align:middle">Actif</span>` : `<span class="chip warn" style="vertical-align:middle">Non payé</span>`}</h3>
    <p class="small" style="margin:0"><b>${esc(e.nom)}</b> · code à donner aux professeurs : <b style="font-family:var(--mono,monospace);letter-spacing:.08em">${esc(e.code)}</b></p>
    <div class="form-row"><div class="field"><label for="et-el">Nombre d'élèves</label><input id="et-el" type="number" min="1" value="${e.eleves || ""}"></div>
      <label class="row small" style="gap:6px;align-self:end"><input type="checkbox" id="et-pay" style="width:auto"${e.payeProfs ? " checked" : ""}> Payer le Pro de tous les professeurs</label></div>
    <div class="row"><button class="btn sm" id="et-save">Enregistrer</button>${S.me?.billing ? (ab && ["active","trialing","past_due"].includes(ab.status) ? `<button class="btn sm" id="et-portal">Gérer l'abonnement de l'établissement</button>` : `<button class="btn sm primary" id="et-pay-go">Payer le forfait établissement</button>`) : ""}</div>
    ${ab?.fin ? `<p class="small muted" style="margin:0">${ab.annule ? "Se termine" : "Renouvellement"} le ${frDate(ab.fin.slice(0, 10))}.</p>` : ""}
    <div><b class="small">Professeurs (${(e.membres || []).length})</b>${(e.membres || []).map(m => `<div class="item"><div><div class="t">${esc(m.nom)}</div><div class="s">${esc(m.email)}</div></div><button class="btn sm ghost" data-etout="${m.id}">Retirer</button></div>`).join("") || `<p class="small muted">Aucun professeur pour l'instant : donne-leur le code.</p>`}</div>
    ${(e.membres || []).length ? "" : `<div class="row"><button class="btn sm ghost danger" id="et-quit">Supprimer cet établissement</button></div>`}<div class="status" id="et-st"></div></section>`;
}
async function refreshMe(){ try { const j = await api("/api/me"); S.me = j.user; } catch(e){} render(); }
document.addEventListener("click", async ev => {
  const t = ev.target.closest("button"); if (!t) return; const d = t.dataset;
  const say = (id, m) => { const el = $("#" + id); if (el) el.textContent = m; else toast(m); };
  try {
    if (d.buy){ t.disabled = true; say("bil-st", "Ouverture du paiement sécurisé…"); const j = await api("/api/billing/checkout", {method:"POST", body:JSON.stringify({plan:d.buy, periode:d.per})}); location.href = j.url; return; }
    if (t.id === "bil-portal" || t.id === "et-portal"){ t.disabled = true; const j = await api("/api/billing/portal", {method:"POST", body:JSON.stringify({etab:t.id === "et-portal"})}); location.href = j.url; return; }
    if (t.id === "ref-copy"){ const v = $("#ref-link").value; try { await navigator.clipboard.writeText(v); } catch(e){ $("#ref-link").select(); document.execCommand("copy"); } toast("Lien copié"); return; }
    if (t.id === "et-join"){ const code = $("#et-code").value.trim(); if (!code){ toast("Entre le code donné par ta direction."); $("#et-code").focus(); return; } await api("/api/etab/rejoindre", {method:"POST", body:JSON.stringify({code})}); toast("Établissement rejoint"); return refreshMe(); }
    if (t.id === "et-new"){ await api("/api/etab/creer", {method:"POST", body:JSON.stringify({nom:$("#et-nom").value, eleves:+$("#et-el").value || 0, payeProfs:$("#et-pay").checked})}); toast("Établissement créé : donne le code à tes professeurs"); return refreshMe(); }
    if (t.id === "et-save"){ await api("/api/etab/reglages", {method:"POST", body:JSON.stringify({eleves:+$("#et-el").value || 0, payeProfs:$("#et-pay").checked})}); toast("Enregistré"); return refreshMe(); }
    if (d.etout){ if (!confirm("Retirer ce professeur de l'établissement ?")) return; await api("/api/etab/reglages", {method:"POST", body:JSON.stringify({retirer:d.etout})}); return refreshMe(); }
    if (t.id === "et-quit"){ if (!confirm(S.me?.etab?.role === "direction" ? "Supprimer cet établissement ?" : "Quitter l'établissement ?")) return; await api("/api/etab/quitter", {method:"POST"}); return refreshMe(); }
    if (t.id === "et-pay-go"){ t.disabled = true; await api("/api/etab/reglages", {method:"POST", body:JSON.stringify({eleves:+$("#et-el").value || 0, payeProfs:$("#et-pay").checked})}); const j = await api("/api/billing/etab", {method:"POST"}); location.href = j.url; return; }
    if (d.ugift){ await api("/api/users/" + d.ugift, {method:"PATCH", body:JSON.stringify({offrirMois:1})}); await loadUsers(); toast("1 mois offert"); return render(); }
  } catch(e){ t.disabled = false; say(t.id?.startsWith("et") || d.etout ? "et-st" : "bil-st", e.message || "Erreur"); }
});
if (/paiement=ok/.test(location.hash)) setTimeout(() => { toast("Merci ! Ton abonnement est en cours d'activation."); history.replaceState(null, "", "#/compte"); setTimeout(refreshMe, 2500); }, 1500);
const accesLabel = u => { const a = u.acces || {}; return a.mode === "essai" ? `Essai · ${joursRest(a.fin)} ${JRS}` : a.mode === "abonne" ? `Abonné ${PLAN[a.plan] || ""}` : a.mode === "ecole" ? "Payé par l'école" : a.mode === "expire" ? "Essai terminé" : a.mode === "inclus" ? "Inclus" : "Bêta"; };
