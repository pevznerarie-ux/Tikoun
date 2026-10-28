
/* ================= Comptes des professeurs (serveur de l'école) ================= */
S.auth = null; S.me = null; S.scope = "moi"; S.users = [];
const isAdmin = () => S.me?.role === "admin";
const canEx = () => !window.TIKOUN_CONFIG?.accounts || !!S.me?.can?.exercices;
const lockChip = () => `<span class="chip" title="Exercices en ligne : à partir du forfait Essentiel">🔒 Option Exercices</span>`;
const PLAN = {decouverte:"Découverte", essentiel:"Essentiel", complet:"Complet", pro:"Complet"};
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
/* Établissement : nom et ville, saisis librement (l'équipe valide chaque inscription) */
S.ec = {q:"", cp:"", res:null, sel:null, manual:false, busy:false, err:""};
const ecLine = e => `${esc(e.nom)}<div class="small muted">${esc([e.adresse, [e.cp, e.ville].filter(Boolean).join(" ")].filter(Boolean).join(" · "))}${e.type ? " · " + esc(e.type) + (e.statut ? " " + esc(e.statut.toLowerCase()) : "") : ""}</div>`;
const ecBadge = e => !e ? `<span class="chip">aucune école</span>` : "";
function ecoleWidget(){
  const v = S.ec.sel || {};
  return `<div class="form-row"><div class="field"><label for="ec-nom">Nom de l'école</label><input id="ec-nom" value="${esc(S.form["ec-nom"] ?? v.nom ?? "")}" placeholder="ex. Lycée Victor Hugo"></div>
    <div class="field"><label for="ec-ville">Ville</label><input id="ec-ville" value="${esc(S.form["ec-ville"] ?? v.ville ?? "")}" placeholder="ex. Lyon"></div></div>`;
}
const ecoleVal = () => ({nom:($("#ec-nom")?.value || "").trim(), ville:($("#ec-ville")?.value || "").trim()});
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
  if (S.auth === "forgot") return `<div class="auth"><section class="auth-card">
    <div class="auth-h"><h2>Mot de passe oublié</h2><p>Indique l'e-mail de ton compte.</p></div>
    ${S.forgot ? `<p class="banner">${S.forgot.mail ? "Si un compte existe avec cet e-mail, tu vas recevoir un lien pour choisir un nouveau mot de passe. Pense à regarder dans les indésirables." : "Ta demande est transmise à l'équipe Mastery, qui va réinitialiser ton mot de passe et te répondre par e-mail."}${S.forgot.contact ? ` Une question : <a href="mailto:${esc(S.forgot.contact)}">${esc(S.forgot.contact)}</a>` : ""}</p>`
      : `<div class="field"><label for="fg-mail">E-mail</label><input id="fg-mail" type="email" autocomplete="username" value="${esc(S.fgMail || "")}"></div><button class="btn primary auth-go" id="fg-go">Recevoir un lien</button>`}
    <div class="status" id="au-st"></div>
    <p class="small auth-note"><button class="btn ghost sm" id="fg-back">← Retour à la connexion</button></p></section></div>`;
  if (S.auth === "reset") return `<div class="auth"><section class="auth-card">
    <div class="auth-h"><h2>Nouveau mot de passe</h2><p>Choisis ton nouveau mot de passe Mastery.</p></div>
    <div class="field"><label for="npw-pw">Nouveau mot de passe (8 caractères minimum)</label><input id="npw-pw" type="password" autocomplete="new-password"></div>
    <div class="field"><label for="npw-pw2">Confirmer</label><input id="npw-pw2" type="password" autocomplete="new-password"></div>
    <button class="btn primary auth-go" id="npw-go">Enregistrer et me connecter</button><div class="status" id="au-st"></div></section></div>`;
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
  if (S.auth === "register") return `<div class="head"><div><h2>Créer mon compte professeur</h2><p>Ton espace est privé : les autres professeurs ne voient ni tes classes, ni tes élèves, ni tes contrôles. Y ont accès la direction de ton établissement si tu la rejoins dans Mastery, et l'équipe Mastery pour le support et la validation des inscriptions. <a href="/confidentialite" target="_blank" rel="noopener" style="color:var(--gold)">En savoir plus</a></p></div></div>
  <section class="panel grid" style="max-width:560px">
    <div class="field"><label for="rg-nom">Ton nom (affiché sur les feuilles si tu le choisis)</label><input id="rg-nom" placeholder="ex. M. Cohen" value="${esc(S.form["rg-nom"] || "")}"></div>
    <div class="field"><label for="rg-mail">E-mail</label><input id="rg-mail" type="email" autocomplete="username" value="${esc(S.form["rg-mail"] || "")}"></div>
    <div class="field"><label for="rg-pw">Mot de passe (8 caractères minimum)</label><input id="rg-pw" type="password" autocomplete="new-password" value="${esc(S.form["rg-pw"] || "")}"></div>
    <h3 style="margin-top:6px">Ton établissement</h3>
    ${ecoleWidget()}
    <div class="field"><label>En-tête de tes contrôles et exercices</label>${affRadios(S.regAff)}</div>
    <h3 style="margin-top:6px">Ton forfait <span class="chip ok" style="vertical-align:middle">${CFG().billing ? "1 mois gratuit" : "Bêta gratuite"}</span></h3>
    <div class="tiers">${["decouverte", "essentiel", "complet"].map(k => `<label class="tier${(S.regPlan || "essentiel") === k ? " sel" : ""}" style="cursor:pointer"><span class="row" style="gap:8px"><input type="radio" name="plan" style="width:auto;margin:0" data-plan="${k}"${(S.regPlan || "essentiel") === k ? " checked" : ""}><b>${PLAN[k]}</b></span>${CFG().billing && CFG().prix?.[k] ? `<div class="tier-p">${esc(CFG().prix[k])}</div>` : ""}<span class="small muted">${TIER_TXT[k]}</span></label>`).join("")}</div>
    <p class="small muted" style="margin:0">${CFG().billing ? "Tu commences par un mois d'essai gratuit sur le forfait Complet, sans carte bancaire : tu choisiras ton forfait à la fin de l'essai. Ton inscription sera validée par l'équipe Mastery." : "Pendant la bêta, tous les forfaits sont gratuits : aucun paiement n'est demandé. Ton inscription sera validée par l'équipe Mastery."}</p>
    <label class="small" style="display:flex;gap:8px;align-items:flex-start;cursor:pointer"><input type="checkbox" id="rg-cgu" style="width:auto;margin-top:3px" ${S.regCgu ? "checked" : ""}><span>J'accepte les <a href="/cgu" target="_blank" rel="noopener" style="color:var(--gold)">conditions d'utilisation</a> et la <a href="/confidentialite" target="_blank" rel="noopener" style="color:var(--gold)">politique de confidentialité</a>. Je m'engage à informer les familles de l'utilisation de Mastery pour mes classes.</span></label>
    <div class="row"><button class="btn primary" id="rg-go">Envoyer ma demande d'inscription</button><button class="btn ghost" id="rg-back">J'ai déjà un compte</button></div><div class="status" id="au-st"></div></section>`;
  return `<div class="auth"><section class="auth-card">
    <div class="auth-h"><h2>Connexion</h2><p>Crée, imprime et corrige tes contrôles avec l'IA.</p></div>
    <div class="field"><label for="lg-mail2">E-mail</label><input id="lg-mail2" type="email" autocomplete="username" placeholder="prenom.nom@ecole.fr"></div>
    <div class="field"><label for="lg-pw2">Mot de passe</label><input id="lg-pw2" type="password" autocomplete="current-password"></div>
    <button class="btn primary auth-go" id="lg-go2">Se connecter</button><div class="status" id="au-st"></div>
    <p class="small auth-note"><button class="btn ghost sm" id="pw-forgot">Mot de passe oublié ?</button></p>
    ${window.TIKOUN_CONFIG?.signup ? `<div class="auth-alt"><span class="small muted">Pas encore de compte ?</span><button class="btn" id="rg-open">Créer mon compte professeur</button></div>` : ""}
  </section>
  <p class="small muted auth-foot"><a href="/">← Retour au site</a> · <a href="?lang=fr">Français</a> · <a href="?lang=en">English</a> · <a href="?lang=pt">Português</a></p></div>`;
}
const KEEP = ["rg-nom","rg-mail","rg-pw","me-nom","ec-nom","ec-ville"]; let kept = {}; S.form = {};
document.addEventListener("change", async ev => { if (ev.target.id === "rg-cgu") S.regCgu = ev.target.checked;
  if (ev.target.id === "et-collecte"){ try { await api("/api/etab/reglages", {method:"POST", body:JSON.stringify({collecte:ev.target.checked})}); toast("Enregistré"); refreshMe(); } catch(e){ toast(e.message || "Impossible"); } return; }
  if (ev.target.id === "me-partage"){ try { const j = await api("/api/me", {method:"PATCH", body:JSON.stringify({partageEcriture:ev.target.checked})}); S.me = j.user; toast("Enregistré"); } catch(e){ toast(e.message); } }
  if (ev.target.id === "me-bareme"){ try { const j = await api("/api/me", {method:"PATCH", body:JSON.stringify({bareme:ev.target.value})}); S.me = j.user; toast("Enregistré"); render(); } catch(e){ toast(e.message); } } });
document.addEventListener("input", ev => { const el = ev.target; if (KEEP.includes(el.id)) S.form[el.id] = el.value; });
const keepForm = () => { kept = {}; for (const id of KEEP){ const el = $("#" + id); if (el) kept[id] = el.value; } const a = document.querySelector('input[name="aff"]:checked'); if (a) kept.aff = a.dataset.aff; };
const restoreForm = () => { for (const [id, v] of Object.entries(kept)){ if (id === "aff"){ const r = document.querySelector(`input[data-aff="${v}"]`); if (r) r.checked = true; continue; } const el = $("#" + id); if (el) el.value = v; } };
async function afterLogin(user, mustChange){
  S.me = user; S.auth = mustChange ? "change" : null;
  if (!S.auth){ await loadUsers(); if (!SERVERSTORE) await startServer(); else { applyScope(); render(); } } else render();
}
async function bootAccounts(){
  try { const j = await api("/api/me"); await afterLogin(j.user, !!j.user?.mustChange); }
  catch(e){ S.auth = e.status === 401 && e.setup ? "setup" : /^#\/reset\/[a-f0-9]{48}$/.test(location.hash) ? "reset" : /^#\/inscription/.test(location.hash) && window.TIKOUN_CONFIG?.signup ? "register" : "login";
    if (S.auth === "reset") S.resetTok = location.hash.split("/")[2]; if (S.auth === "register"){ const pl = location.hash.split("/")[2]; if (["decouverte", "essentiel", "complet"].includes(pl)) S.regPlan = pl; else if (pl === "pro") S.regPlan = "complet"; S.ecFor = "reg"; S.ec = {q:"", cp:"", res:null, sel:null, manual:false, busy:false, err:""}; } refreshCaps(); render(); }
}

/* Mon compte */
function vCompte(){
  if (S.ecFor !== "me"){ S.ec = {q:"", cp:"", res:null, sel:S.me?.ecole || null, manual:false, busy:false, err:""}; S.ecFor = "me"; }
  return `<div class="head"><div><h2>Mon compte</h2><p>${esc(S.me?.nom || "")} · ${esc(S.me?.email || "")} · ${isAdmin() ? "Administrateur" : isDir() ? "Direction" : "Professeur"} · ${S.me?.billing && S.me?.acces?.mode !== "inclus" ? esc(accesLabel(S.me)) : `Abonnement ${PLAN[S.me?.plan] || "Essentiel"} · Option Exercices ${S.me?.can?.exercices ? "✓" : "✗"}`}</p></div>
    <button class="btn" id="out-go">Se déconnecter</button></div>
  <section class="panel grid" style="max-width:640px"><h3>Mon profil</h3>
    <div class="field"><label for="me-nom">Mon nom</label><input id="me-nom" value="${esc(S.form["me-nom"] ?? S.me?.nom ?? "")}"></div>
    ${ecoleWidget()}
    <div class="row"><button class="btn primary" id="me-save">Enregistrer</button></div><div class="status" id="me-st"></div></section>
  ${(() => { const P = prefs(), Q = P.q; return `<section class="panel grid" style="max-width:640px"><h3>Mise en page des feuilles</h3>
    <p class="small muted" style="margin:0">Chaque nouveau contrôle part de ces réglages. Tu peux toujours les ajuster dans son étape « Mise en page ».</p>
    <div class="field"><label>En-tête des feuilles</label>${affRadios(S.me?.affichage)}</div>
    <p class="small muted" style="margin:0">Aperçu : <b id="me-prev">${esc(headerFrom(S.me?.affichage || "les2"))}</b></p>
    <div class="form-row"><div class="field"><label for="mp-pol">Taille du texte</label><select id="mp-pol">${selOpts(["13","14","15","16","17"], String(P.police), x => x + " pt")}</select></div>
      <div class="field"><label for="mp-lh">Interligne des cadres</label><select id="mp-lh">${selOpts(["26","30","34","38","46"], String(P.lh), x => LH_LAB[x])}</select></div></div>
    <div class="field"><label for="mp-reg">Réglure des cadres</label><select id="mp-reg">${selOpts(Object.keys(REGLURES), P.reglure, x => REGLURES[x])}</select></div>
    <p class="small muted" style="margin:0">Pour une classe de primaire (CP à CM2), les nouveaux contrôles passent automatiquement en Seyès, interligne très large.</p>
    <div class="field"><label for="mp-cons">Consignes imprimées en haut de la feuille</label><textarea id="mp-cons">${esc(P.consignes)}</textarea></div>
    <label class="row small" style="gap:6px"><input type="checkbox" id="mp-bar"${P.bareme ? " checked" : ""}> Afficher le barème de chaque question</label>
    <div class="row"><button class="btn primary" id="mp-save">Enregistrer</button></div></section>
  <section class="panel grid" style="max-width:640px"><h3>Questions</h3>
    <p class="small muted" style="margin:0">Le style des questions que l'IA te propose. Le niveau de la classe est toujours pris en compte, et tu peux tout modifier contrôle par contrôle.</p>
    <div class="form-row"><div class="field"><label for="qp-fmt">Format</label><select id="qp-fmt">${selOpts(["redige","mixte","qcm"], Q.format, x => ({redige:"Réponses rédigées", mixte:"Rédigé et questions à choix", qcm:"Surtout des questions à choix"}[x]))}</select></div>
      <div class="field"><label for="qp-prof">Profondeur</label><select id="qp-prof">${selOpts(["simple","standard","exigeant"], Q.profondeur, x => ({simple:"Simple : appliquer le cours", standard:"Standard : comprendre et expliquer", exigeant:"Exigeant : raisonner et argumenter"}[x]))}</select></div></div>
    <div class="field"><label for="qp-long">Longueur des réponses</label><select id="qp-long">${selOpts(["courte","moyenne","developpee"], Q.longueur, x => ({courte:"Courtes (3 à 5 lignes)", moyenne:"Moyennes (5 à 8 lignes)", developpee:"Développées (8 à 14 lignes)"}[x]))}</select></div>
    <label class="row small" style="gap:6px"><input type="checkbox" id="qp-just"${Q.justif ? " checked" : ""}> <span>Questions à choix : toujours laisser un cadre pour justifier la réponse (corrigé par l'IA)</span></label>
    <div class="row"><button class="btn primary" id="qp-save">Enregistrer</button></div></section>
  <section class="panel grid" style="max-width:640px" id="ton-pref"><h3>Ton des commentaires</h3>
    <p class="small muted" style="margin:0">La façon dont l'IA s'adresse aux élèves dans les commentaires de correction et des quiz, et le ton des appréciations de bulletin.</p>
    <div class="form-row"><div class="field"><label for="tp-ton">Ton</label><select id="tp-ton">${selOpts(Object.keys(TONS), P.ton, x => TONS[x])}</select></div>
      <div class="field"><label for="tp-adr">S'adresser à l'élève</label><select id="tp-adr">${selOpts(["tu","vous"], P.adresse, x => x === "vous" ? "En le vouvoyant" : "En le tutoyant")}</select></div></div>
    <p class="small" style="margin:0;padding:10px 12px;border-radius:10px;background:var(--surface-2)">Exemple : <i>${esc(TON_EX[P.ton]?.[P.adresse] || "")}</i></p></section>
  <section class="panel grid" style="max-width:640px" id="ratt-regles"><h3>Rattrapage</h3>
    <p class="small muted" style="margin:0">Qui peut avoir un rattrapage, et comment sa note compte. Chaque rattrapage peut avoir sa propre règle (bouton « ⚙ Règles » sur la page du rattrapage).</p>
    <div class="form-row"><div class="field"><label for="rp-seuil">Rattrapage proposé sous</label><select id="rp-seuil">${selOpts(["8","9","10","11","12"], String(P.ratt.seuil), x => noteS(+x))}</select></div>
      <div class="field"><label for="rp-regle">Note retenue</label><select id="rp-regle">${selOpts(Object.keys(RREGLES), P.ratt.regle, x => RREGLES[x])}</select></div></div>
    <div class="form-row">${P.ratt.regle === "bonus" ? `<div class="field"><label for="rp-bonus">Bonus maximum (20/20 au rattrapage)</label><select id="rp-bonus">${selOpts(["1","2","3","4","5"], String(P.ratt.bonus), x => "+" + x + " point" + (x > 1 ? "s" : ""))}</select></div>` : ""}
      ${["meilleure", "bonus", "remplace"].includes(P.ratt.regle) ? `<div class="field"><label for="rp-plaf">Plafond de la note retenue</label><select id="rp-plaf">${selOpts(["10","12","14","16","20"], String(P.ratt.plafond), x => x === "20" ? "Aucun" : noteS(+x))}</select></div>` : ""}</div>
    <p class="small" style="margin:0;padding:10px 12px;border-radius:10px;background:var(--surface-2)">Exemple : 6 au contrôle et 16 au rattrapage → note retenue <b>${(() => { const R = P.ratt, b = 6, n = 16, cap = v => Math.min(v, R.plafond); return noteS(R.regle === "bonus" ? Math.max(b, cap(b + R.bonus * n / 20)) : R.regle === "moyenne" ? (b + n) / 2 : R.regle === "remplace" ? cap(n) : R.regle === "formatif" ? b : Math.max(b, cap(n))); })()}</b> (${esc(ruleTxt(P.ratt))}).</p></section>`; })()}
  <section class="panel grid" style="max-width:640px"><h3>Les matières que j'enseigne</h3>
    <p class="small muted" style="margin:0">Seules ces matières te seront proposées. Si tu n'en enseignes qu'une, elle est choisie toute seule quand tu prépares un contrôle.</p>
    <div class="row">${enseigne().map(m => `<span class="chip">${esc(m)} <button class="btn sm ghost" style="padding:0 4px" data-ensdel="${esc(m)}" aria-label="Retirer">×</button></span>`).join("") || `<span class="small muted">Aucune matière choisie : toute la liste est proposée.</span>`}</div>
    <div class="row"><select id="ens-sel" style="max-width:260px" aria-label="Matière à ajouter"><option value="">Choisir une matière…</option>${selOpts(myMatieres(true).filter(m => !enseigne().includes(m)), "")}</select><button class="btn sm primary" id="ens-go">Ajouter</button></div>
    <div class="row"><input id="mat-new" placeholder="Matière absente de la liste" style="max-width:260px"><button class="btn sm" id="mat-go">Ajouter</button></div></section>
  ${abonnementPanel()}${etabPanel()}${devicesPanel()}${parrainagePanel()}
  <section class="panel grid" style="max-width:640px"><h3>Amélioration de la lecture</h3>
    <label class="row small" style="gap:8px;align-items:flex-start"><input type="checkbox" id="me-partage" style="width:auto;margin-top:3px"${S.me?.partageEcriture ? " checked" : ""}${isAdmin() ? " disabled" : ""}><span>Aider Mastery à mieux lire l'écriture manuscrite : quand je corrige une lecture, l'image du cadre de réponse et mon texte corrigé sont conservés, sans nom d'élève, de classe, de note ni d'établissement, 2 ans au plus, uniquement pour améliorer la lecture de Mastery.</span></label>
    ${S.me?.etab && S.me.etab.collecte === false ? `<p class="small muted" style="margin:0">Désactivé par la direction de ton établissement.</p>` : ""}</section>
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
  ${ok.map(u => `<tr><td><b>${esc(u.nom)}</b>${u.statut === "refuse" ? ' <span class="chip bad">refusé</span>' : u.actif ? "" : ' <span class="chip bad">désactivé</span>'}${u.resetDemande ? ' <span class="chip warn">Mot de passe oublié</span>' : ""}</td><td>${esc(u.email)}</td>
    <td>${u.ecole ? `<div class="small"><b>${esc(u.ecole.nom)}</b> ${ecBadge(u.ecole)}<div class="muted">${esc([u.ecole.cp, u.ecole.ville].filter(Boolean).join(" "))}${u.ecole.uai ? " · UAI " + esc(u.ecole.uai) : ""}</div></div>` : `<span class="muted small">—</span>`}</td>
    <td><select data-urole="${u.id}" style="width:auto" aria-label="Rôle">${selOpts(["prof","admin"], u.role, x => x === "admin" ? "Administrateur" : "Professeur")}</select></td>
    <td class="small">${esc(accesLabel(u))}${S.me?.billing && u.inscription === "libre" && u.acces?.mode !== "abonne" ? ` <button class="btn sm ghost" data-ugift="${u.id}" title="Prolonger l'essai d'un mois">+1 mois</button>` : ""}</td>
    <td><select data-uplan="${u.id}" style="width:auto" aria-label="Abonnement">${selOpts(["decouverte","essentiel","complet"], u.plan === "pro" ? "complet" : u.plan || "essentiel", x => PLAN[x])}</select></td>
    <td>${u.plan !== "decouverte" ? `<label class="row small" style="gap:6px"><input type="checkbox" data-uex="${u.id}"${u.options?.exercices ? " checked" : ""}> ${u.options?.exercices ? "Activée" : "Désactivée"}</label>` : `<span class="muted small">À partir d'Essentiel</span>`}</td>
    <td class="c num">${nb(u.id)}</td>
    <td><div class="row">${u.id !== S.me.id ? `<button class="btn sm" data-ureset="${u.id}">Nouveau mot de passe</button><button class="btn sm ghost" data-uact="${u.id}" data-v="${u.actif ? 0 : 1}">${u.actif ? "Désactiver" : "Réactiver"}</button><button class="btn sm ghost danger" data-udel="${u.id}">Supprimer</button>` : ""}</div></td></tr>`).join("")}
  </tbody></table></div><div class="status" id="us-st"></div></section>
  <section class="panel grid" style="max-width:640px"><h3>Ajouter un professeur</h3>
    <div class="form-row"><div class="field"><label for="nu-nom">Nom</label><input id="nu-nom" placeholder="ex. M. Cohen (maths)"></div>
      <div class="field"><label for="nu-mail">E-mail</label><input id="nu-mail" type="email"></div></div>
    <div class="form-row"><div class="field"><label for="nu-pw">Mot de passe provisoire</label><input id="nu-pw" value="${genPw()}"></div>
      <div class="field"><label for="nu-role">Rôle</label><select id="nu-role">${selOpts(["prof","admin"], "prof", x => x === "admin" ? "Administrateur" : "Professeur")}</select></div></div>
    <div class="form-row"><div class="field"><label for="nu-plan">Abonnement</label><select id="nu-plan">${selOpts(["decouverte","essentiel","complet"], "complet", x => PLAN[x])}</select></div>
      <label class="row small" style="gap:6px;align-self:end"><input type="checkbox" id="nu-ex" checked> Activer les exercices en ligne (à partir d'Essentiel)</label></div>
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
    if (t.id === "pw-forgot"){ S.auth = "forgot"; S.forgot = null; S.fgMail = $("#lg-mail2")?.value || ""; return render(); }
    if (t.id === "fg-back"){ S.auth = "login"; return render(); }
    if (t.id === "fg-go"){ st().innerHTML = `<span class="thinking">Envoi…</span>`;
      S.forgot = await api("/api/password/forgot", {method:"POST", body:JSON.stringify({email:$("#fg-mail").value})}); return render(); }
    if (t.id === "npw-go"){ if ($("#npw-pw").value !== $("#npw-pw2").value){ st().textContent = "Les deux mots de passe sont différents."; return; }
      const j = await api("/api/password/reset", {method:"POST", body:JSON.stringify({token:S.resetTok, password:$("#npw-pw").value})}); history.replaceState(null, "", "#/accueil"); return afterLogin(j.user, false); }
    if (t.id === "rg-go"){ S.ec.sel = ecoleVal(); if (!S.ec.sel.nom || !S.ec.sel.ville){ st().textContent = "Indique le nom de ton école et sa ville."; return; }
      if (!$("#rg-cgu")?.checked){ st().textContent = "Coche la case pour accepter les conditions d'utilisation."; return; }
      st().innerHTML = `<span class="thinking">Création…</span>`;
      const j = await api("/api/register", {method:"POST", body:JSON.stringify({nom:$("#rg-nom").value, email:$("#rg-mail").value, password:$("#rg-pw").value, affichage:affValue(), plan:document.querySelector('input[name="plan"]:checked')?.dataset.plan || "essentiel", ecole:S.ec.sel, cgu:true})});
      S.pend = j.user; S.auth = "pending"; history.replaceState(null, "", "#/connexion"); return render(); }
    if (t.id === "mp-save"){ const j = await api("/api/me", {method:"PATCH", body:JSON.stringify({affichage:affValue()})}); S.me = j.user;
      await savePrefs({police:+$("#mp-pol").value, lh:+$("#mp-lh").value, reglure:$("#mp-reg").value, consignes:$("#mp-cons").value.trim(), bareme:$("#mp-bar").checked}); render(); toast("Enregistré"); return; }
    if (t.id === "qp-save"){ await savePrefs({q:{format:$("#qp-fmt").value, profondeur:$("#qp-prof").value, longueur:$("#qp-long").value, justif:$("#qp-just").checked}}); S.params._pref = false; render(); toast("Enregistré"); return; }
    if (t.id === "me-save"){ const body = {nom:$("#me-nom").value}, e = ecoleVal();
      if (e.nom && e.ville && (e.nom !== S.me.ecole?.nom || e.ville !== S.me.ecole?.ville)) body.ecole = e;
      else if (e.nom || e.ville){ if (!e.nom || !e.ville) return toast("Indique le nom de l'école et sa ville."); }
      const j = await api("/api/me", {method:"PATCH", body:JSON.stringify(body)}); S.me = j.user; S.ec.sel = j.user.ecole; delete S.form["ec-nom"]; delete S.form["ec-ville"]; render(); toast("Enregistré"); return; }
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
/* Compteur du mois : contrôles imprimés et classes, selon le forfait */
function quotaHtml(){
  const q = S.me?.quota; if (!q || q.illimite) return "";
  const r = q.ctrl ? Math.min(1, q.used / q.ctrl) : 1, left = Math.max(0, q.ctrl - q.used);
  return `<div class="quota"><div class="row between"><b>${q.used} / ${q.ctrl} ${q.ctrl > 1 ? "contrôles" : "contrôle"} ce mois-ci</b><span class="small muted">${left > 1 ? left + " restants" : left === 1 ? "1 restant" : "crédit épuisé"}</span></div>
    <div class="qbar"><i style="width:${Math.round(r * 100)}%" class="${r >= 1 ? "full" : r >= .5 ? "half" : ""}"></i></div>
    ${q.classes != null ? `<div class="small muted">Classes : ${(store.allClasses || store.classes).filter(c => c.createdBy === S.me?.id).length} / ${q.classes}</div>` : `<div class="small muted">2 contrôles par mois et par classe.</div>`}</div>`;
}
const TIER_TXT = {decouverte:"1 classe · 2 contrôles par mois", essentiel:"Jusqu'à 3 classes · 6 contrôles par mois · exercices en ligne", complet:"Jusqu'à 6 classes · 12 contrôles par mois · exercices en ligne"};
function abonnementPanel(){
  const a = S.me?.acces || {}, P = CFG().prix || {};
  if (!S.me?.billing || a.mode === "beta") return `<section class="panel grid" style="max-width:640px"><h3>Mon abonnement <span class="chip ok" style="vertical-align:middle">Bêta gratuite</span></h3><p class="small muted" style="margin:0">Pendant la bêta, tout est gratuit et illimité. Tu seras prévenu avant l'ouverture des abonnements.</p></section>`;
  if (a.mode === "inclus") return `<section class="panel grid" style="max-width:640px"><h3>Mon abonnement</h3><p class="small muted" style="margin:0">Ton compte est inclus dans l'accès de ton établissement.</p></section>`;
  if (a.mode === "ecole") return `<section class="panel grid" style="max-width:640px"><h3>Mon abonnement <span class="chip ok" style="vertical-align:middle">Établissement</span></h3><p class="small muted" style="margin:0">Payé par ton établissement : ${esc(a.ecole || "")}.</p>${quotaHtml()}</section>`;
  const extra = P.controle ? `<button class="btn sm" id="bil-extra">Ajouter un contrôle · ${esc(P.controle)}</button>` : "";
  if (a.mode === "abonne") return `<section class="panel grid" style="max-width:640px"><h3>Mon abonnement <span class="chip ok" style="vertical-align:middle">${PLAN[a.plan] || ""}</span></h3>
    <p class="small muted" style="margin:0">${TIER_TXT[a.plan] || ""}. ${a.status === "past_due" ? "⚠ Le dernier paiement a échoué : mets à jour ta carte. " : ""}${a.annule ? "Se termine le " : "Prochain renouvellement le "}${a.fin ? frDate(a.fin.slice(0, 10)) : "—"}.</p>
    ${quotaHtml()}
    <div class="row">${extra}<button class="btn sm" id="bil-portal">Changer de forfait, carte, factures</button></div><div class="status" id="bil-st"></div></section>`;
  const card = k => `<div class="tier${k === "essentiel" ? " best" : ""}"><b>${PLAN[k]}</b><div class="tier-p">${esc(P[k] || "")}</div><div class="small muted">${TIER_TXT[k]}</div>
    <div class="grid" style="gap:6px;margin-top:auto"><button class="btn sm ${k === "essentiel" ? "primary" : ""}" data-buy="${k}" data-per="mois">Mensuel</button><button class="btn sm ghost" data-buy="${k}" data-per="an">Annuel · ${esc(P[k + "An"] || "")}</button></div></div>`;
  return `<section class="panel grid" style="max-width:760px"><h3>Mon abonnement ${a.mode === "essai" ? `<span class="chip ok" style="vertical-align:middle">Essai gratuit · ${joursRest(a.fin)} ${JRS}</span>` : `<span class="chip bad" style="vertical-align:middle">Essai terminé</span>`}</h3>
    <p class="small muted" style="margin:0">${a.mode === "essai" ? `Pendant l'essai, le forfait Complet est ouvert jusqu'au ${frDate(a.fin.slice(0, 10))}. Si tu t'abonnes maintenant, le premier paiement n'a lieu qu'à la fin de l'essai.` : "Tes données sont conservées. Choisis un forfait pour continuer à créer, scanner et corriger."}</p>
    ${a.mode === "essai" ? quotaHtml() : ""}
    <div class="tiers">${["decouverte", "essentiel", "complet"].map(card).join("")}</div>
    <p class="small muted" style="margin:0">Un contrôle compte quand ses feuilles sont imprimées ; réimpressions et rattrapages ne comptent pas. Annuel : 2 mois offerts. Paiement sécurisé par Stripe, résiliable à tout moment.</p><div class="status" id="bil-st"></div></section>`;
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
      <p class="small muted" style="margin:0">Un prix par élève et par an${S.me?.billing && P.ecole ? ` (${esc(P.ecole)}, 100 élèves au minimum)` : ""} : tous les professeurs qui rejoignent l'établissement sont inclus, avec 2 contrôles par mois et par classe, et la direction voit toutes les classes.</p>
      <div class="row"><button class="btn sm primary" id="et-new">Créer</button></div></div></details><div class="status" id="et-st"></div></section>`;
  if (e.role === "membre") return `<section class="panel grid" style="max-width:640px"><h3>Forfait établissement</h3>
    <p class="small" style="margin:0"><b>${esc(e.nom)}</b>${e.actif ? " · ton abonnement est pris en charge" : ""}</p><p class="small muted" style="margin:0">La direction peut consulter les classes, contrôles et résultats de ton espace.</p>
    <div class="row"><button class="btn sm ghost" id="et-quit">Quitter l'établissement</button></div><div class="status" id="et-st"></div></section>`;
  const ab = e.abonnement;
  return `<section class="panel grid" style="max-width:640px"><h3>Forfait établissement · direction ${e.actif ? `<span class="chip ok" style="vertical-align:middle">Actif</span>` : `<span class="chip warn" style="vertical-align:middle">Non payé</span>`}</h3>
    <p class="small" style="margin:0"><b>${esc(e.nom)}</b> · code à donner aux professeurs : <b style="font-family:var(--mono,monospace);letter-spacing:.08em">${esc(e.code)}</b></p>
    <div class="form-row"><div class="field"><label for="et-el">Nombre d'élèves</label><input id="et-el" type="number" min="1" value="${e.eleves || ""}"></div>
      <p class="small muted" style="margin:0;align-self:end">${P.ecole ? esc(P.ecole) + " · " : ""}tous les professeurs sont inclus.</p></div>
    <div class="row"><button class="btn sm" id="et-save">Enregistrer</button>${S.me?.billing ? (ab && ["active","trialing","past_due"].includes(ab.status) ? `<button class="btn sm" id="et-portal">Gérer l'abonnement de l'établissement</button>` : `<button class="btn sm primary" id="et-pay-go">Payer le forfait établissement</button>`) : ""}</div>
    ${ab?.fin ? `<p class="small muted" style="margin:0">${ab.annule ? "Se termine" : "Renouvellement"} le ${frDate(ab.fin.slice(0, 10))}.</p>` : ""}
    <label class="row small" style="gap:8px;align-items:flex-start"><input type="checkbox" id="et-collecte" style="width:auto;margin-top:3px"${e.collecte !== false ? " checked" : ""}><span>Les corrections de lecture des professeurs aident Mastery à mieux lire l'écriture manuscrite (sans nom d'élève, de classe, de note ni d'établissement). Décoche pour l'arrêter dans tout l'établissement.</span></label>
    <div><b class="small">Professeurs (${(e.membres || []).length})</b>${(e.membres || []).map(m => `<div class="item"><div><div class="t">${esc(m.nom)}</div><div class="s">${esc(m.email)}</div></div><button class="btn sm ghost" data-etout="${m.id}">Retirer</button></div>`).join("") || `<p class="small muted">Aucun professeur pour l'instant : donne-leur le code.</p>`}</div>
    ${(e.membres || []).length ? "" : `<div class="row"><button class="btn sm ghost danger" id="et-quit">Supprimer cet établissement</button></div>`}<div class="status" id="et-st"></div></section>`;
}
async function refreshMe(){ try { const j = await api("/api/me"); S.me = j.user; } catch(e){} render(); }
document.addEventListener("click", async ev => {
  const t = ev.target.closest("button"); if (!t) return; const d = t.dataset;
  const say = (id, m) => { const el = $("#" + id); if (el) el.textContent = m; else toast(m); };
  try {
    if (t.id === "bil-extra"){ t.disabled = true; say("bil-st", "Ouverture du paiement sécurisé…"); const j = await api("/api/billing/extra", {method:"POST", body:JSON.stringify({n:1})}); location.href = j.url; return; }
    if (d.buy){ t.disabled = true; say("bil-st", "Ouverture du paiement sécurisé…"); const j = await api("/api/billing/checkout", {method:"POST", body:JSON.stringify({plan:d.buy, periode:d.per})}); location.href = j.url; return; }
    if (t.id === "bil-portal" || t.id === "et-portal"){ t.disabled = true; const j = await api("/api/billing/portal", {method:"POST", body:JSON.stringify({etab:t.id === "et-portal"})}); location.href = j.url; return; }
    if (t.id === "ref-copy"){ const v = $("#ref-link").value; try { await navigator.clipboard.writeText(v); } catch(e){ $("#ref-link").select(); document.execCommand("copy"); } toast("Lien copié"); return; }
    if (t.id === "et-join"){ const code = $("#et-code").value.trim(); if (!code){ toast("Entre le code donné par ta direction."); $("#et-code").focus(); return; } await api("/api/etab/rejoindre", {method:"POST", body:JSON.stringify({code})}); toast("Établissement rejoint"); return refreshMe(); }
    if (t.id === "et-new"){ await api("/api/etab/creer", {method:"POST", body:JSON.stringify({nom:$("#et-nom").value, eleves:+$("#et-el").value || 0, payeProfs:true})}); toast("Établissement créé : donne le code à tes professeurs"); return refreshMe(); }
    if (t.id === "et-save"){ await api("/api/etab/reglages", {method:"POST", body:JSON.stringify({eleves:+$("#et-el").value || 0})}); toast("Enregistré"); return refreshMe(); }
    if (d.etout){ if (!confirm("Retirer ce professeur de l'établissement ?")) return; await api("/api/etab/reglages", {method:"POST", body:JSON.stringify({retirer:d.etout})}); return refreshMe(); }
    if (t.id === "et-quit"){ if (!confirm(S.me?.etab?.role === "direction" ? "Supprimer cet établissement ?" : "Quitter l'établissement ?")) return; await api("/api/etab/quitter", {method:"POST"}); return refreshMe(); }
    if (t.id === "et-pay-go"){ t.disabled = true; await api("/api/etab/reglages", {method:"POST", body:JSON.stringify({eleves:+$("#et-el").value || 0})}); const j = await api("/api/billing/etab", {method:"POST"}); location.href = j.url; return; }
    if (d.ugift){ await api("/api/users/" + d.ugift, {method:"PATCH", body:JSON.stringify({offrirMois:1})}); await loadUsers(); toast("1 mois offert"); return render(); }
  } catch(e){ t.disabled = false; say(t.id?.startsWith("et") || d.etout ? "et-st" : "bil-st", e.message || "Erreur"); }
});
if (/paiement=ok/.test(location.hash)) setTimeout(() => { toast("Merci ! Ton abonnement est en cours d'activation."); history.replaceState(null, "", "#/compte"); setTimeout(refreshMe, 2500); }, 1500);
const accesLabel = u => { const a = u.acces || {}; return a.mode === "essai" ? `Essai · ${joursRest(a.fin)} ${JRS}` : a.mode === "abonne" ? `Abonné ${PLAN[a.plan] || ""}` : a.mode === "ecole" ? "Payé par l'établissement" : a.mode === "expire" ? "Essai terminé" : a.mode === "inclus" ? "Inclus" : "Bêta"; };
