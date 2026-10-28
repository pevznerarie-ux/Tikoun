// Mastery · serveur de la plateforme (Railway ou tout hébergeur Node) — aucune dépendance.
// Il sert le site, garde les données (Volume Railway monté sur /data), gère les comptes des professeurs
// et relaie l'IA avec la clé de l'école (jamais envoyée aux navigateurs).
//
// Variables d'environnement (Railway → Variables) :
//   ANTHROPIC_API_KEY : clé IA de l'école
//   MASTERY_CODE      : code de l'établissement, demandé UNE fois pour créer le premier compte administrateur
//                       (l'ancienne variable TIKOUN_CODE reste acceptée)
//   AI_BUDGET_PER_CTRL : filet de sécurité IA par mois, en dollars par contrôle du forfait (défaut 3) ; AI_BUDGET_USER_MONTH pour les comptes sans forfait (défaut 60, ×5 administrateur)
//   AI_BUDGET_DAY      : budget IA total par jour, en dollars (défaut 150)
//   AI_MAX_PER_USER_DAY, AI_MAX_PER_DAY : plafonds d'appels (garde-fou supplémentaire)
//   FILE_RETENTION_DAYS : durée de conservation des images de copies (défaut 400 jours)
//   BACKUP_KEY        : si défini, les sauvegardes quotidiennes sont chiffrées (AES-256-GCM)
//   LEGAL_NAME, LEGAL_FORM, LEGAL_SIREN, LEGAL_ADDRESS, LEGAL_EMAIL, LEGAL_PHONE, LEGAL_DIRECTOR, LEGAL_HOST : mentions légales
//   ADMIN_EMAIL, ADMIN_PASSWORD (+ ADMIN_NAME) : crée automatiquement l'administrateur au démarrage s'il n'existe aucun compte
//   ADMIN_RESET_PASSWORD : mot de passe oublié, réinitialise le compte ADMIN_EMAIL (une fois par valeur)
//   SIGNUP            : "off" pour fermer l'inscription libre des professeurs (ouverte par défaut)
//   MODEL_QUICK, MODEL_DEFAULT, MODEL_COMPLEX : modèles (défaut économique)
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const ROOT = __dirname, PORT = process.env.PORT || 3000;
const TYPES = {".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json",
  ".md":"text/markdown; charset=utf-8", ".png":"image/png", ".jpg":"image/jpeg", ".svg":"image/svg+xml", ".ico":"image/x-icon", ".webmanifest":"application/manifest+json", ".txt":"text/plain; charset=utf-8"};
const env = k => (process.env[k] || "").trim();
/* Lecture des copies manuscrites : modèle le plus précis par défaut (GRADE_TIER=default pour revenir au modèle rapide) */
/* Rédaction des contrôles, rattrapages et variantes : modèle puissant par défaut (GEN_TIER=default pour le modèle rapide) */
const GEN_TIER = () => ["quick","default","complex"].includes(env("GEN_TIER")) ? env("GEN_TIER") : "complex";
const GRADE_TIER = () => ["quick","default","complex"].includes(env("GRADE_TIER")) ? env("GRADE_TIER") : "complex";
const MODELS = () => ({quick:env("MODEL_QUICK") || "claude-haiku-4-5-20251001", default:env("MODEL_DEFAULT") || "claude-haiku-4-5-20251001", complex:env("MODEL_COMPLEX") || "claude-sonnet-5"});

const SEC_HEADERS = {"X-Content-Type-Options":"nosniff", "Referrer-Policy":"same-origin", "X-Frame-Options":"DENY", "Strict-Transport-Security":"max-age=31536000",
  "Content-Security-Policy":"frame-ancestors 'none'; object-src 'none'; base-uri 'self'", "Permissions-Policy":"geolocation=(), microphone=()"};
function send(res, status, body, type = "text/plain; charset=utf-8", extra = {}){
  res.writeHead(status, {"Content-Type":type, ...SEC_HEADERS, ...extra}); res.end(body);
}
/* Langue : cookie « lang » (fr / en), sinon en-tête du navigateur. Messages d'erreur traduits pour l'anglais. */
const EN_MSG = {"Tu as utilisé tous les contrôles de ton forfait ce mois-ci : ajoute un contrôle ou passe au forfait supérieur dans Mon compte.":"You have used all the tests in your plan this month: add a test or upgrade your plan in My account.", "Ton forfait ne permet pas plus de classes : passe au forfait supérieur dans Mon compte.":"Your plan doesn't allow more classes: upgrade your plan in My account.", "Plafond mensuel de l'IA atteint pour ton compte : écris à l'équipe Mastery si tu en as besoin.":"Monthly AI limit reached for your account: contact the Mastery team if you need more.", "Contrôle introuvable":"Test not found", "Indique le nom de l'école et sa ville":"Enter the school's name and city", "8 caractères minimum":"8 characters minimum","ANTHROPIC_API_KEY manquante sur le serveur":"ANTHROPIC_API_KEY is missing on the server",
 "Annuaire officiel injoignable pour le moment : tu peux enregistrer ton école manuellement.":"School directory unavailable right now: you can enter your school manually.",
 "Ce compte existe déjà":"This account already exists","Ce document appartient à un autre professeur":"This document belongs to another teacher","Ce quiz est fermé":"This quiz is closed",
 "Chemin invalide":"Invalid path","Code de l'établissement incorrect":"Incorrect setup code","Code inconnu : vérifie ta carte":"Unknown code: check your card","Compte désactivé":"Account disabled",
 "Compte introuvable":"Account not found","Connexion requise":"Please sign in","Document introuvable":"Document not found","Définis la variable MASTERY_CODE sur le serveur":"Set the MASTERY_CODE variable on the server",
 "E-mail invalide":"Invalid email","E-mail ou mot de passe incorrect":"Incorrect email or password","E-mail valide et mot de passe de 8 caractères minimum":"A valid email and a password of at least 8 characters are required",
 "Exercices en ligne : à partir du forfait Essentiel":"Online practice: available from the Essential plan","IA injoignable":"AI service unreachable","Impossible sur ton propre compte":"Not possible on your own account",
 "Indique ton nom":"Please enter your name","Le compte administrateur existe déjà":"The admin account already exists","Les inscriptions sont fermées":"Sign-ups are closed",
 "Mot de passe : 8 caractères minimum":"Password: 8 characters minimum","Mot de passe actuel incorrect":"Current password is incorrect","Mot de passe provisoire : 8 caractères minimum":"Temporary password: 8 characters minimum",
 "Objet JSON attendu":"JSON object expected","Exercices en ligne non activés pour ce compte (à partir du forfait Essentiel)":"Online practice is not enabled for this account (available from the Essential plan)","Question invalide":"Invalid question",
 "Quiz introuvable":"Quiz not found","Requête invalide":"Invalid request","Route inconnue":"Unknown route","Réservé à l'administrateur":"Admins only","Session de quiz expirée : recommence":"Quiz session expired: please start again",
 "Ton inscription est en attente de validation par l'équipe Mastery. Tu pourras te connecter dès qu'elle sera acceptée.":"Your sign-up is awaiting approval by the Mastery team. You'll be able to sign in as soon as it's accepted.",
 "Ton inscription n'a pas été acceptée. Contacte l'équipe Mastery.":"Your sign-up was not accepted. Please contact the Mastery team.",
 "Trop d'essais : réessaie dans 15 minutes":"Too many attempts: try again in 15 minutes","Trop d'essais, réessaie dans 15 minutes":"Too many attempts: try again in 15 minutes",
 "Trop de recherches, réessaie dans quelques minutes":"Too many searches: try again in a few minutes","Tu ne peux pas te retirer tes propres droits":"You can't remove your own admin rights",
 "Un compte existe déjà avec cet e-mail":"An account already exists with this email","Indique ton école":"Please enter your school","École invalide":"Invalid school","Trop lourd":"Too large","Ton essai gratuit est terminé : choisis un abonnement dans Mon compte pour continuer.":"Your free trial has ended: choose a plan in My account to continue.","Tu fais déjà partie d'un établissement":"You already belong to a school","Indique le nom de l'établissement":"Enter the school name","Code d'établissement inconnu":"Unknown school code","Résilie d'abord l'abonnement de l'établissement":"Cancel the school subscription first","Réservé à la direction de l'établissement":"School leadership only","Le paiement n'est pas encore ouvert : la bêta est gratuite":"Payments aren't open yet: the beta is free","Tarif non configuré sur le serveur":"Price not configured on the server","Tu as déjà un abonnement : gère-le avec « Gérer mon abonnement »":"You already have a plan: use “Manage my plan”","L'établissement a déjà un abonnement":"The school already has a plan","Indique le nombre d'élèves de l'établissement":"Enter the school's number of students","Aucun abonnement à gérer":"No plan to manage","Paiement indisponible pour le moment : réessaie dans un instant.":"Payments are unavailable right now: try again in a moment.","Accepte les conditions d'utilisation et la politique de confidentialité":"Please accept the terms of use and the privacy policy",
 "Indique le nom de l'école, son code postal (5 chiffres) et sa ville":"Enter the school's name, ZIP code (5 digits) and city",
 "Nom de base invalide (format : auteur/nom)":"Invalid dataset name (format: author/name)","Hugging Face injoignable pour le moment":"Hugging Face is unreachable right now","Cette base n'a pas de colonne image + texte":"This dataset has no image + text columns","Appareil inconnu":"Unknown device","Trop de pages d'un coup : attends une minute":"Too many pages at once: wait a minute","Format accepté : JPEG, PNG ou PDF":"Accepted formats: JPEG, PNG or PDF","Fichier vide":"Empty file","Plafond quotidien d'appels IA atteint.":"Daily AI limit reached.","Code ou nom de famille incorrect : vérifie ta carte":"Incorrect code or last name: check your card","Lien expiré ou déjà utilisé : refais une demande de mot de passe oublié.":"This link has expired or was already used: request a new password reset.","Plafond quotidien d'appels IA atteint pour ton compte : réessaie demain.":"Your daily AI limit is reached: try again tomorrow.",
 "Trop d'appels IA depuis cet appareil : réessaie dans une heure.":"Too many AI requests from this device: try again in an hour."};
const PT_MSG = {"Code ou nom de famille incorrect : vérifie ta carte": "Código ou sobrenome incorreto: confira seu cartão", "Lien expiré ou déjà utilisé : refais une demande de mot de passe oublié.": "Link expirado ou já usado: faça um novo pedido de senha esquecida.", "Tu as utilisé tous les contrôles de ton forfait ce mois-ci : ajoute un contrôle ou passe au forfait supérieur dans Mon compte.": "Você usou todas as provas do seu plano neste mês: adicione uma prova ou mude para o plano superior em Minha conta.", "Ton forfait ne permet pas plus de classes : passe au forfait supérieur dans Mon compte.": "Seu plano não permite mais turmas: mude para o plano superior em Minha conta.", "Plafond mensuel de l'IA atteint pour ton compte : écris à l'équipe Mastery si tu en as besoin.": "Limite mensal de IA atingido para sua conta: escreva para a equipe Mastery se precisar.", "Contrôle introuvable": "Prova não encontrada", "Indique le nom de l'école et sa ville": "Informe o nome da escola e a cidade", "Appareil inconnu": "Aparelho desconhecido", "Trop de pages d'un coup : attends une minute": "Páginas demais de uma vez: espere um minuto", "Format accepté : JPEG, PNG ou PDF": "Formatos aceitos: JPEG, PNG ou PDF", "Fichier vide": "Arquivo vazio", "Nom de base invalide (format : auteur/nom)": "Nome de base inválido (formato: autor/nome)", "Hugging Face injoignable pour le moment": "Hugging Face indisponível no momento", "Cette base n'a pas de colonne image + texte": "Esta base não tem colunas de imagem + texto", "8 caractères minimum": "Mínimo de 8 caracteres", "ANTHROPIC_API_KEY manquante sur le serveur": "ANTHROPIC_API_KEY ausente no servidor", "Annuaire officiel injoignable pour le moment : tu peux enregistrer ton école manuellement.": "Diretório oficial de escolas indisponível no momento: você pode cadastrar sua escola manualmente.", "Ce compte existe déjà": "Esta conta já existe", "Ce document appartient à un autre professeur": "Este documento pertence a outro professor", "Ce quiz est fermé": "Este quiz está encerrado", "Chemin invalide": "Caminho inválido", "Code de l'établissement incorrect": "Código da escola incorreto", "Code inconnu : vérifie ta carte": "Código desconhecido: confira o seu cartão", "Compte désactivé": "Conta desativada", "Compte introuvable": "Conta não encontrada", "Connexion requise": "É necessário entrar na sua conta", "Document introuvable": "Documento não encontrado", "Définis la variable MASTERY_CODE sur le serveur": "Defina a variável MASTERY_CODE no servidor", "E-mail invalide": "E-mail inválido", "E-mail ou mot de passe incorrect": "E-mail ou senha incorretos", "E-mail valide et mot de passe de 8 caractères minimum": "Informe um e-mail válido e uma senha com no mínimo 8 caracteres", "Exercices en ligne : à partir du forfait Essentiel": "Exercícios on-line: a partir do plano Essencial", "IA injoignable": "Serviço de IA indisponível", "Impossible sur ton propre compte": "Não é possível na sua própria conta", "Indique ton nom": "Informe o seu nome", "Le compte administrateur existe déjà": "A conta de administrador já existe", "Les inscriptions sont fermées": "As inscrições estão encerradas", "Mot de passe : 8 caractères minimum": "Senha: mínimo de 8 caracteres", "Mot de passe actuel incorrect": "Senha atual incorreta", "Mot de passe provisoire : 8 caractères minimum": "Senha provisória: mínimo de 8 caracteres", "Objet JSON attendu": "Era esperado um objeto JSON", "Exercices en ligne non activés pour ce compte (à partir du forfait Essentiel)": "Exercícios on-line não ativados para esta conta (a partir do plano Essencial)", "Question invalide": "Questão inválida", "Quiz introuvable": "Quiz não encontrado", "Requête invalide": "Requisição inválida", "Route inconnue": "Rota desconhecida", "Réservé à l'administrateur": "Exclusivo para o administrador", "Session de quiz expirée : recommence": "Sessão do quiz expirada: comece de novo", "Ton inscription est en attente de validation par l'équipe Mastery. Tu pourras te connecter dès qu'elle sera acceptée.": "Sua inscrição está aguardando aprovação da equipe Mastery. Você poderá entrar assim que ela for aceita.", "Ton inscription n'a pas été acceptée. Contacte l'équipe Mastery.": "Sua inscrição não foi aceita. Entre em contato com a equipe Mastery.", "Trop d'essais : réessaie dans 15 minutes": "Muitas tentativas: tente novamente em 15 minutos", "Trop d'essais, réessaie dans 15 minutes": "Muitas tentativas: tente novamente em 15 minutos", "Trop de recherches, réessaie dans quelques minutes": "Muitas buscas: tente novamente em alguns minutos", "Tu ne peux pas te retirer tes propres droits": "Você não pode remover os seus próprios direitos de administrador", "Un compte existe déjà avec cet e-mail": "Já existe uma conta com este e-mail", "Indique ton école": "Informe a sua escola", "École invalide": "Escola inválida", "Trop lourd": "Arquivo grande demais", "Ton essai gratuit est terminé : choisis un abonnement dans Mon compte pour continuer.": "Seu teste grátis terminou: escolha uma assinatura em Minha conta para continuar.", "Tu fais déjà partie d'un établissement": "Você já faz parte de uma escola", "Indique le nom de l'établissement": "Informe o nome da escola", "Code d'établissement inconnu": "Código de escola desconhecido", "Résilie d'abord l'abonnement de l'établissement": "Cancele primeiro a assinatura da escola", "Réservé à la direction de l'établissement": "Exclusivo para a direção da escola", "Le paiement n'est pas encore ouvert : la bêta est gratuite": "O pagamento ainda não está disponível: a versão beta é gratuita", "Tarif non configuré sur le serveur": "Preço não configurado no servidor", "Tu as déjà un abonnement : gère-le avec « Gérer mon abonnement »": "Você já tem uma assinatura: gerencie-a em “Gerenciar minha assinatura”", "L'établissement a déjà un abonnement": "A escola já tem uma assinatura", "Indique le nombre d'élèves de l'établissement": "Informe o número de alunos da escola", "Aucun abonnement à gérer": "Nenhuma assinatura para gerenciar", "Paiement indisponible pour le moment : réessaie dans un instant.": "Pagamento indisponível no momento: tente novamente em instantes.", "Accepte les conditions d'utilisation et la politique de confidentialité": "Aceite os termos de uso e a política de privacidade", "Indique le nom de l'école, son code postal (5 chiffres) et sa ville": "Informe o nome da escola, o código postal (5 dígitos) e a cidade", "Plafond quotidien d'appels IA atteint.": "Limite diário de uso da IA atingido.", "Plafond quotidien d'appels IA atteint pour ton compte : réessaie demain.": "Sua conta atingiu o limite diário de uso da IA: tente novamente amanhã.", "Trop d'appels IA depuis cet appareil : réessaie dans une heure.": "Muitas solicitações de IA a partir deste dispositivo: tente novamente em uma hora."};
const langOf = req => { const c = ((req.headers.cookie || "").match(/(?:^|;\s*)lang=(fr|en|pt)/) || [])[1]; if (c) return c; const h = String(req.headers["x-lang"] || ""); if (/^(fr|en|pt)$/.test(h)) return h; const al = String(req.headers["accept-language"] || ""); return /^en\b/i.test(al) ? "en" : /^pt\b/i.test(al) ? "pt" : "fr"; };
const sendJ = (res, status, obj, extra) => { const DICT = res._lang === "en" ? EN_MSG : res._lang === "pt" ? PT_MSG : null; if (DICT && obj?.error?.message && DICT[obj.error.message]) obj = {...obj, error:{...obj.error, message:DICT[obj.error.message]}}; return send(res, status, JSON.stringify(obj), TYPES[".json"], extra); };
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
async function readBody(req, max){ const chunks = []; let size = 0; for await (const c of req){ size += c.length; if (size > max) throw new Error("too_large"); chunks.push(c); } return Buffer.concat(chunks); }
const readJSON = async (req, max = 8e6) => JSON.parse((await readBody(req, max)).toString("utf8") || "null");
const ipOf = req => { const real = String(req.headers["x-real-ip"] || "").trim(); if (real) return real;
  const xs = String(req.headers["x-forwarded-for"] || "").split(",").map(x => x.trim()).filter(Boolean); return xs.length ? xs[xs.length - 1] : String(req.socket.remoteAddress || ""); };

/* ---------- Stockage (Volume Railway) ---------- */
const DATA = env("DATA_DIR") || env("RAILWAY_VOLUME_MOUNT_PATH") || path.join(ROOT, "data");
const PERSISTENT = !!(env("DATA_DIR") || env("RAILWAY_VOLUME_MOUNT_PATH"));
const DOCDIR = path.join(DATA, "docs"), FILEDIR = path.join(DATA, "files");
fs.mkdirSync(DOCDIR, {recursive:true}); fs.mkdirSync(FILEDIR, {recursive:true});
const writeAtomic = (f, obj) => { const tmp = f + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(obj)); fs.renameSync(tmp, f); };
const readJ = (f, d, critical) => {
  let raw; try { raw = fs.readFileSync(f, "utf8"); } catch(e){ return d; }
  try { return JSON.parse(raw); } catch(e){
    const keep = f + ".illisible-" + Date.now(); try { fs.copyFileSync(f, keep); } catch(_){}
    if (critical){ console.error("Fichier illisible : " + f + " (copie gardée : " + keep + "). Démarrage arrêté pour ne rien écraser : restaure une sauvegarde."); process.exit(1); }
    console.warn("Fichier illisible, valeur par défaut utilisée :", f); return d; } };

/* Propriétaire de chaque image (copies scannées, cadres) : seul son espace peut la voir */
const FOWN_F = path.join(DATA, "files-owners.json"); let FOWN = readJ(FOWN_F, null);
let fownTimer = null; const saveFown = () => { clearTimeout(fownTimer); fownTimer = setTimeout(() => writeAtomic(FOWN_F, FOWN), 500); };
const setOwner = (id, u) => { FOWN[id] = {u:u.id, e:u.espace || u.id}; saveFown(); };
const DOCS = new Map();
for (const f of fs.readdirSync(DOCDIR)) if (f.endsWith(".json")){ try { DOCS.set(decodeURIComponent(f.slice(0, -5)), JSON.parse(fs.readFileSync(path.join(DOCDIR, f), "utf8"))); } catch(e){ console.warn("Document illisible", f); } }
const EPOCH = Date.now().toString(36) + crypto.randomBytes(3).toString("hex"); let SEQ = 0; const LOG = [];
const PATH_OK = p => /^[A-Za-z0-9_\-.~:@+]{1,200}(\/[A-Za-z0-9_\-.~:@+]{1,200}){1,15}$/.test(p) && !p.split("/").some(x => x === "." || x === "..");
const docFile = p => path.join(DOCDIR, encodeURIComponent(p) + ".json");
function persist(p, data){
  const esp = (data || DOCS.get(p))?.espace || null, own = (data || DOCS.get(p))?.owner || null;
  if (data == null){ DOCS.delete(p); fs.rmSync(docFile(p), {force:true}); } else { DOCS.set(p, data); writeAtomic(docFile(p), data); }
  LOG.push({seq:++SEQ, path:p, esp, own}); if (LOG.length > 20000) LOG.splice(0, LOG.length - 20000);
}
const isObj = x => x && typeof x === "object" && !Array.isArray(x);
const pipeFile = (f, res) => fs.createReadStream(f).on("error", () => { try { res.destroy(); } catch(e){} }).pipe(res);
process.on("uncaughtException", e => console.error("Erreur non prévue :", e && e.stack || e));
process.on("unhandledRejection", e => console.error("Promesse rejetée :", e && e.stack || e));
const merge = (a, b) => { if (!isObj(a) || !isObj(b)) return b; const r = {...a}; for (const k of Object.keys(b)) r[k] = merge(a[k], b[k]); return r; };

/* ---------- Comptes des professeurs ---------- */
const USERS_F = path.join(DATA, "users.json"), SESS_F = path.join(DATA, "sessions.json");
let USERS = readJ(USERS_F, [], true); let SESS = readJ(SESS_F, {});
for (const u of USERS) if (!u.plan){ u.plan = u.role === "admin" ? "pro" : "essentiel"; u.options = {exercices:u.role === "admin"}; }
const saveUsers = () => writeAtomic(USERS_F, USERS);
/* Espaces : chaque professeur inscrit seul a son espace privé (ses classes, ses élèves, ses contrôles).
   Les comptes créés par un administrateur rejoignent l'espace de cet administrateur (classes partagées). */
const firstAdmin = () => USERS.find(u => u.role === "admin");
function migrateEspaces(){
  let ch = false;
  for (const u of USERS) if (!u.espace){ u.espace = u.role === "admin" ? u.id : (firstAdmin()?.espace || firstAdmin()?.id || u.id); ch = true; }
  if (ch) saveUsers();
  const def = firstAdmin()?.espace; if (!def) return;
  for (const [k, v] of DOCS) if (isObj(v) && !v.espace){
    const who = USERS.find(u => u.id === (v.owner || v.createdBy)); persist(k, {...v, espace:who?.espace || def});
  }
}
let sessTimer = null; const saveSess = () => { clearTimeout(sessTimer); sessTimer = setTimeout(() => writeAtomic(SESS_F, SESS), 500); };
const hashPw = (pw, salt = crypto.randomBytes(16).toString("hex")) => salt + ":" + crypto.scryptSync(String(pw), salt, 64).toString("hex");
const checkPw = (pw, stored) => { const [salt, h] = String(stored || "").split(":"); if (!salt || !h) return false; return same(crypto.scryptSync(String(pw), salt, 64).toString("hex"), h); };
/* Abonnements : « essentiel » (contrôles, correction, suivi) · « pro » (+ option Exercices, activée par la direction) */
const PLANS = ["decouverte", "essentiel", "complet", "pro"];
const entitled = u => { if (!u) return false; const a = access(u); if (a.mode === "essai" || a.mode === "ecole") return true; if (a.mode === "abonne") return tierOf(a.plan) !== "decouverte"; if (!a.ok) return false; return tierOf(u.plan) !== "decouverte" && !!u.options?.exercices; };
const AFF = ["ecole", "nom", "les2"];
/* Préférences du prof : mise en page par défaut des feuilles et style des questions générées */
const PREF_Q = {format:["redige","mixte","qcm"], profondeur:["simple","standard","exigeant"], longueur:["courte","moyenne","developpee"]};
const cleanPrefs = p => { const n = (v, a, b, d) => { v = +v; return v >= a && v <= b ? v : d; }, q = isObj(p.q) ? p.q : {};
  return {police:n(p.police, 13, 17, 15), lh:n(p.lh, 26, 46, 30), reglure:["lignes", "seyes", "carreaux", "aucune"].includes(p.reglure) ? p.reglure : "lignes",
    ton:["bienveillant", "neutre", "exigeant", "chaleureux"].includes(p.ton) ? p.ton : "bienveillant", adresse:p.adresse === "vous" ? "vous" : "tu",
    ...(isObj(p.notation) && ["sur", "pct", "lettres"].includes(p.notation.type) ? {notation:(N => ({type:N.type, sur:Math.round(n(N.sur, 1, 1000, 20)), pas:[1, 0.5, 0.25, 0.1, 0.01].includes(+N.pas) ? +N.pas : N.type === "pct" ? 1 : 0.1,
      lettres:(Array.isArray(N.lettres) ? N.lettres : []).slice(0, 20).map(x => ({l:String(x?.l || "").trim().slice(0, 30), min:n(x?.min, 0, 100, 0)})).filter(x => x.l), pctLettre:N.pctLettre !== false}))(p.notation)} : {}),
    periodes:(r => { const md = (v, d) => /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v || "") ? v : d; return {mode:r.mode === "sem" ? "sem" : "trim", t2:md(r.t2, "12-01"), t3:md(r.t3, "03-15"), s2:md(r.s2, "02-01")}; })(isObj(p.periodes) ? p.periodes : {}), bareme:p.bareme !== false, consignes:String(p.consignes ?? "Écris uniquement dans les cadres.").slice(0, 400),
    q:Object.fromEntries(Object.entries(PREF_Q).map(([k, l]) => [k, l.includes(q[k]) ? q[k] : l[1]]).concat([["justif", q.justif !== false]])),
    ratt:(r => ({seuil:n(r.seuil, 5, 15, 10), regle:["meilleure", "bonus", "moyenne", "remplace", "formatif"].includes(r.regle) ? r.regle : "meilleure", plafond:n(r.plafond, 10, 20, 10), bonus:n(r.bonus, 1, 5, 3)}))(isObj(p.ratt) ? p.ratt : {})}; };
const pub = u => ({id:u.id, email:u.email, nom:u.nom, role:u.role, mustChange:!!u.mustChange, ecole:u.ecole || null, prefs:cleanPrefs(u.prefs || {}), quota:quota(u), matieres:u.matieres || [], enseigne:u.enseigne || [], affichage:AFF.includes(u.affichage) ? u.affichage : "les2", plan:u.plan || "essentiel", options:{exercices:!!u.options?.exercices}, can:{exercices:entitled(u)}, actif:u.actif !== false, statut:u.statut || "valide", planDemande:u.planDemande || null, createdAt:u.createdAt, bareme:u.bareme || null, partageEcriture:u.partageEcriture !== false, espace:u.espace, ref:refCode(u), acces:access(u), billing:BILLING(), parrainage:refStats(u), etab:etabPub(groupOf(u), u), inscription:u.inscription || "admin", resetDemande:u.resetDemande || null});
const sidOf = req => ((req.headers.cookie || "").match(/(?:^|;\s*)sid=([a-f0-9]{64})/) || [])[1] || "";
const SESSION_DAYS = 30;
function userOf(req){
  const s = SESS[sidOf(req)]; if (!s || s.exp < Date.now()) return null;
  if (s.exp - Date.now() < (SESSION_DAYS - 1) * 864e5){ s.exp = Date.now() + SESSION_DAYS * 864e5; saveSess(); }   // session glissante : 30 jours sans connexion
  const u = USERS.find(x => x.id === s.uid); return u && u.actif !== false && (u.statut || "valide") === "valide" ? u : null;
}
function openSession(req, res, u, body = {}){
  const sid = crypto.randomBytes(32).toString("hex"); SESS[sid] = {uid:u.id, exp:Date.now() + SESSION_DAYS * 864e5}; saveSess();
  for (const [k, v] of Object.entries(SESS)) if (v.exp < Date.now()) delete SESS[k];
  const secure = String(req.headers["x-forwarded-proto"] || "").includes("https") ? "; Secure" : "";
  return sendJ(res, 200, {user:pub(u), ...body}, {"Set-Cookie":`sid=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`});
}
const tries = new Map();
const tooMany = (ip, max = 20) => { const now = Date.now(), l = (tries.get(ip) || []).filter(t => now - t < 15 * 60e3); l.push(now); tries.set(ip, l); return l.length > max; };
setInterval(() => { const now = Date.now(); for (const [k, l] of tries){ const r = l.filter(t => now - t < 15 * 60e3); if (r.length) tries.set(k, r); else tries.delete(k); } }, 10 * 60e3).unref();
const validEmail = e => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e);
/* Contact affiché (mentions légales, mot de passe oublié) et e-mails transactionnels via Resend (RESEND_API_KEY + MAIL_FROM) */
const CONTACT = () => env("LEGAL_EMAIL") || env("ADMIN_EMAIL") || USERS.find(x => x.role === "admin")?.email || "";
const MAIL = () => !!(env("RESEND_API_KEY") && env("MAIL_FROM"));
async function sendMail(to, subject, text){
  const r = await fetch("https://api.resend.com/emails", {method:"POST", headers:{"Authorization":"Bearer " + env("RESEND_API_KEY"), "Content-Type":"application/json"}, body:JSON.stringify({from:env("MAIL_FROM"), to:[to], subject, text})});
  if (!r.ok) throw new Error("Resend " + r.status); }
const tokHash = t => crypto.createHash("sha256").update(String(t)).digest("hex");

/* Propriété : un prof modifie ses contrôles, cours, copies et bilans ; les classes sont communes ; l'admin peut tout. */
const OWNED = ["controles","cours","feuilles","bilans","quizzes","quizrep"];
function ownerOf(p){ const [col, id] = p.split("/"); if (col === "feuilles") return DOCS.get("controles/" + id)?.owner || DOCS.get(p)?.owner || null; return DOCS.get(p)?.owner || null; }
function espaceFor(p, u){ const [col, id] = p.split("/"); const cur = DOCS.get(p); if (cur?.espace) return cur.espace; if (col === "feuilles") return DOCS.get("controles/" + id)?.espace || u.espace; return u.espace; }
const dirSees = (u, esp) => { const g = esp && dirGroup(u); if (!g) return false; return [g.directeur, ...(g.membres || [])].some(id => id === esp && USERS.find(x => x.id === id)?.espace === esp); };
const visible = (u, v) => u.role === "admin" || (isObj(v) && (v.espace === u.espace || v.owner === u.id || dirSees(u, v.espace)));
const canWrite = (u, p) => { if (u.role === "admin") return true; const cur = DOCS.get(p); if (cur && cur.espace && cur.espace !== u.espace) return false; const o = ownerOf(p); return !o || o === u.id || !OWNED.includes(p.split("/")[0]); };
const docsFor = u => Object.fromEntries([...DOCS].filter(([k, v]) => visible(u, v)));

/* ---------- Abonnements, essai gratuit, parrainage, forfait établissement (Stripe) ----------
   Sans STRIPE_SECRET_KEY : mode bêta, tout est gratuit (comportement d'avant).
   Avec : chaque prof inscrit a un essai (TRIAL_DAYS, 30 j par défaut, +30 j s'il vient d'un parrain), puis choisit un abonnement.
   Les comptes créés par l'administrateur et l'administrateur lui-même restent inclus (établissement fondateur). */
const BILLING = () => !!env("STRIPE_SECRET_KEY");
const DAY = 864e5, TRIAL_DAYS = () => Number(env("TRIAL_DAYS")) || 30;
/* Forfaits du prof par paliers : nombre de classes et de contrôles imprimés par mois.
   Variables Stripe : STRIPE_PRICE_<DECOUVERTE|ESSENTIEL|COMPLET>_<MOIS|AN>, STRIPE_PRICE_CONTROLE (contrôle supplémentaire), STRIPE_PRICE_ECOLE (par élève et par an) ;
   suffixe _BRL pour les prix en reais (site en portugais). Les anciens forfaits « essentiel » et « pro » restent reconnus (pro → complet). */
const TIERS = {decouverte:{classes:1, ctrl:2}, essentiel:{classes:3, ctrl:6}, complet:{classes:6, ctrl:12}};
const tierOf = plan => TIERS[plan] ? plan : plan === "pro" ? "complet" : "essentiel";
const PRICE = (lang = "fr") => { const v = k => (lang === "pt" && env(k + "_BRL")) || env(k);
  return {decouverte_mois:v("STRIPE_PRICE_DECOUVERTE_MOIS"), decouverte_an:v("STRIPE_PRICE_DECOUVERTE_AN"), essentiel_mois:v("STRIPE_PRICE_ESSENTIEL_MOIS"), essentiel_an:v("STRIPE_PRICE_ESSENTIEL_AN"),
    complet_mois:v("STRIPE_PRICE_COMPLET_MOIS") || v("STRIPE_PRICE_PRO_MOIS"), complet_an:v("STRIPE_PRICE_COMPLET_AN") || v("STRIPE_PRICE_PRO_AN"), controle:v("STRIPE_PRICE_CONTROLE"), ecole:v("STRIPE_PRICE_ECOLE")}; };
const planOfPrice = id => { if (!id) return null; for (const lang of ["fr", "pt"]){ const P = PRICE(lang); for (const t of Object.keys(TIERS)) if (id === P[t + "_mois"] || id === P[t + "_an"]) return t; } return null; };
const LIVE = s => !!s && ["active", "trialing", "past_due"].includes(s.status);
const GROUPES_F = path.join(DATA, "etablissements.json"); let GROUPES = readJ(GROUPES_F, [], true);
const saveGroupes = () => writeAtomic(GROUPES_F, GROUPES);
const groupOf = u => u && GROUPES.find(g => g.directeur === u.id || (g.membres || []).includes(u.id)) || null;
const groupLive = g => !!g && (!BILLING() || LIVE(g.sub));
const dirGroup = u => { const g = u && GROUPES.find(x => x.directeur === u.id); return groupLive(g) ? g : null; };
const refCode = u => { if (!u.ref){ const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; do { u.ref = [...crypto.randomBytes(7)].map(b => a[b % a.length]).join(""); } while (USERS.some(v => v !== u && v.ref === u.ref)); saveUsers(); } return u.ref; };
function access(u){
  if (!u) return {ok:false, mode:"aucun"};
  if (!BILLING()) return {ok:true, mode:"beta"};
  if (u.role === "admin" || u.inscription !== "libre") return {ok:true, mode:"inclus"};
  const g = groupOf(u); if (g && LIVE(g.sub)) return {ok:true, mode:"ecole", plan:"complet", ecole:g.nom};
  if (LIVE(u.sub)) return {ok:true, mode:"abonne", plan:tierOf(u.sub.plan), status:u.sub.status, fin:u.sub.fin || null, annule:!!u.sub.annule};
  if (!u.trialEnd && (u.statut || "valide") === "valide"){ u.trialEnd = new Date(Date.now() + (TRIAL_DAYS() + (u.referredBy ? 30 : 0)) * DAY).toISOString(); saveUsers(); }
  const fin = Math.max(Date.parse(u.trialEnd || 0) || 0, Date.parse(u.freeUntil || 0) || 0);
  if (fin > Date.now()) return {ok:true, mode:"essai", plan:"complet", fin:new Date(fin).toISOString()};
  return {ok:false, mode:"expire", fin:new Date(fin).toISOString()};
}
/* Prix affichés (site public, inscription, Mon compte), modifiables par PRICE_LABEL_<CLÉ>[_EN|_PT] */
const PRIX_DEF = {fr:{decouverte:"7 €/mois", essentiel:"12 €/mois", complet:"19 €/mois", decouverteAn:"70 €/an", essentielAn:"120 €/an", completAn:"190 €/an", controle:"2 €", ecole:"6 € HT par élève et par an"},
  en:{decouverte:"$8/month", essentiel:"$13/month", complet:"$20/month", decouverteAn:"$80/year", essentielAn:"$130/year", completAn:"$200/year", controle:"$2", ecole:"$7 per student per year"},
  pt:{decouverte:"R$29,90/mês", essentiel:"R$54,90/mês", complet:"R$89,90/mês", decouverteAn:"R$299/ano", essentielAn:"R$549/ano", completAn:"R$899/ano", controle:"R$9,90", ecole:"R$25 por aluno por ano"}};
const prixLabels = lang => { const L = lang === "pt" || lang === "en" ? lang : "fr", sfx = L === "fr" ? "" : "_" + L.toUpperCase();
  return Object.fromEntries(Object.entries(PRIX_DEF[L]).map(([k, v]) => [k, env("PRICE_LABEL_" + k.replace(/An$/, "_AN").toUpperCase() + sfx) || v])); };
const ECOLE_MIN = () => Number(env("ECOLE_MIN_ELEVES")) || 100;
const MOIS = () => new Date().toISOString().slice(0, 7);
const classesOf = u => [...DOCS].filter(([k, v]) => k.startsWith("classes/") && isObj(v) && v.createdBy === u.id).length;
/* Ce que le forfait permet ce mois-ci : null = illimité (bêta, comptes inclus) */
function quota(u){
  const a = access(u); if (!BILLING() || a.mode === "inclus" || a.mode === "beta" || !a.ok) return {illimite:true, mode:a.mode};
  const c = u.credits?.[MOIS()] || {}, used = (c.ids || []).length, extra = c.extra || 0;
  if (a.mode === "ecole") return {illimite:false, mode:a.mode, plan:"ecole", classes:null, ctrl:2 * Math.max(1, classesOf(u)) + extra, used};
  const t = TIERS[tierOf(a.plan)]; return {illimite:false, mode:a.mode, plan:tierOf(a.plan), classes:t.classes, ctrl:t.ctrl + extra, used};
}
const QUOTA_MSG = "Tu as utilisé tous les contrôles de ton forfait ce mois-ci : ajoute un contrôle ou passe au forfait supérieur dans Mon compte.";
const CLASSES_MSG = "Ton forfait ne permet pas plus de classes : passe au forfait supérieur dans Mon compte.";
const refStats = u => { const f = USERS.filter(v => v.referredBy === u.id); return {filleuls:f.length, payants:f.filter(v => v.refRewarded).length, mois:(u.refMonths || []).length}; };
const NO_ACCESS = "Ton essai gratuit est terminé : choisis un abonnement dans Mon compte pour continuer.";

/* Appels à l'API Stripe (sans dépendance : formulaire encodé) */
function formEnc(o, pre = "", out = []){
  for (const [k, v] of Object.entries(o)){ if (v === undefined || v === null) continue; const key = pre ? `${pre}[${k}]` : k;
    if (typeof v === "object") formEnc(v, key, out); else out.push(encodeURIComponent(key) + "=" + encodeURIComponent(String(v))); }
  return out.join("&");
}
async function stripe(method, p, body){
  const r = await fetch((env("STRIPE_API_BASE") || "https://api.stripe.com/v1") + p, {method, headers:{"Authorization":"Bearer " + env("STRIPE_SECRET_KEY"), "Content-Type":"application/x-www-form-urlencoded", "Stripe-Version":"2024-06-20"},
    body:body ? formEnc(body) : undefined, signal:AbortSignal.timeout(20000)});
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j?.error?.message || "Stripe " + r.status); return j;
}
const baseUrl = req => (String(req.headers["x-forwarded-proto"] || "").includes("https") ? "https://" : "http://") + (req.headers["x-forwarded-host"] || req.headers.host);
function applySub(s){
  const meta = s.metadata || {}, st = {id:s.id, status:s.status, customer:s.customer, fin:s.current_period_end ? new Date(s.current_period_end * 1000).toISOString() : null, annule:!!s.cancel_at_period_end};
  if (meta.kind === "ecole"){ const g = GROUPES.find(x => x.id === meta.gid || x.sub?.id === s.id); if (!g) return; g.sub = st; saveGroupes(); if (LIVE(st)) stopOwnSubs(g); return; }
  const u = USERS.find(x => x.id === meta.uid || x.sub?.id === s.id); if (!u) return;
  u.sub = {...st, plan:planOfPrice(s.items?.data?.[0]?.price?.id) || tierOf(meta.plan)};
  if (LIVE(u.sub)){ u.plan = u.sub.plan; u.options = {...(u.options || {}), exercices:u.plan !== "decouverte"}; }
  saveUsers();
}
/* L'établissement paie pour tous ses profs : les abonnements personnels s'arrêtent à la fin de la période en cours */
function stopOwnSubs(g){ for (const id of [g.directeur, ...(g.membres || [])]){ const u = USERS.find(x => x.id === id);
  if (u && LIVE(u.sub) && !u.sub.annule) stripe("POST", "/subscriptions/" + u.sub.id, {cancel_at_period_end:true}).then(s => { u.sub.annule = !!s.cancel_at_period_end; saveUsers(); }).catch(e => console.warn("Stripe annulation", e.message)); } }
/* Parrainage : quand un filleul paie sa première facture, le parrain gagne 1 mois (12 au plus par an) */
async function rewardReferral(u){
  if (!u || u.refRewarded || !u.referredBy) return; const par = USERS.find(x => x.id === u.referredBy); u.refRewarded = new Date().toISOString(); saveUsers(); if (!par) return;
  par.refMonths = (par.refMonths || []).filter(t => Date.now() - Date.parse(t) < 365 * DAY); if (par.refMonths.length >= 12) return saveUsers();
  par.refMonths.push(new Date().toISOString());
  if (LIVE(par.sub) && par.sub.customer){ try { const pr = await stripe("GET", "/prices/" + (PRICE()[tierOf(par.sub.plan) + "_mois"] || PRICE().essentiel_mois));
      await stripe("POST", `/customers/${par.sub.customer}/balance_transactions`, {amount:-(pr.unit_amount || 0), currency:pr.currency || "eur", description:"Parrainage Mastery : 1 mois offert"}); }
    catch(e){ console.warn("Parrainage (crédit Stripe)", e.message); } }
  else { const base = Math.max(Date.now(), Date.parse(par.trialEnd || 0) || 0, Date.parse(par.freeUntil || 0) || 0); par.freeUntil = new Date(base + 30 * DAY).toISOString(); }
  saveUsers(); console.log(`Parrainage : 1 mois offert à ${par.email} (filleul ${u.email})`);
}
async function stripeWebhook(req, res){
  const raw = await readBody(req, 1e6), sig = String(req.headers["stripe-signature"] || ""), secret = env("STRIPE_WEBHOOK_SECRET");
  const t = (sig.match(/t=(\d+)/) || [])[1], v1 = [...sig.matchAll(/v1=([a-f0-9]+)/g)].map(m => m[1]);
  const want = secret && t ? crypto.createHmac("sha256", secret).update(t + "." + raw.toString("utf8")).digest("hex") : "";
  if (!want || !v1.some(x => same(x, want)) || Math.abs(Date.now() / 1000 - Number(t)) > 600) return send(res, 400, "Signature invalide");
  let ev; try { ev = JSON.parse(raw.toString("utf8")); } catch(e){ return send(res, 400, "JSON invalide"); }
  const o = ev.data?.object || {};
  try {
    if (ev.type === "checkout.session.completed" && o.metadata?.kind === "extra" && o.payment_status === "paid"){
      const u = USERS.find(x => x.id === o.metadata.uid), m = o.metadata.mois || MOIS(), n = Number(o.metadata.n) || 0;
      const items = n || (await stripe("GET", `/checkout/sessions/${o.id}/line_items`).catch(() => null))?.data?.[0]?.quantity || 1;
      if (u && !(u.extraSessions || []).includes(o.id)){ u.credits = u.credits || {}; u.credits[m] = {...(u.credits[m] || {}), extra:(u.credits[m]?.extra || 0) + items}; u.extraSessions = [...(u.extraSessions || []), o.id].slice(-50); saveUsers(); } }
    else if (ev.type === "checkout.session.completed" && o.subscription) applySub(await stripe("GET", "/subscriptions/" + o.subscription));
    else if (/^customer\.subscription\./.test(ev.type)) applySub(o);
    else if (ev.type === "invoice.paid" && o.amount_paid > 0){ const u = USERS.find(x => x.sub?.customer === o.customer); if (u) await rewardReferral(u); }
  } catch(e){ console.warn("Webhook Stripe", ev.type, e.message); }
  return sendJ(res, 200, {received:true});
}
function etabPub(g, u){
  if (!g) return null; const dir = g.directeur === u.id;
  return {id:g.id, nom:g.nom, role:dir ? "direction" : "membre", payeProfs:!!g.payeProfs, collecte:g.collecte !== false, actif:groupLive(g), ...(dir ? {code:g.code, eleves:g.eleves || 0, abonnement:g.sub ? {status:g.sub.status, fin:g.sub.fin, annule:g.sub.annule} : null,
    membres:(g.membres || []).map(id => USERS.find(x => x.id === id)).filter(Boolean).map(x => ({id:x.id, nom:x.nom, email:x.email}))} : {})};
}
async function billingApi(req, res, url, p, u){
  if (!u) return sendJ(res, 401, {error:{message:"Connexion requise"}});
  const b = req.method === "POST" ? await readJSON(req, 2e4) || {} : {};
  if (p === "/api/etab" && req.method === "GET") return sendJ(res, 200, {etab:etabPub(groupOf(u), u)});
  if (p === "/api/etab/creer" && req.method === "POST"){
    if (groupOf(u)) return sendJ(res, 409, {error:{message:"Tu fais déjà partie d'un établissement"}});
    const nom = String(b.nom || u.ecole?.nom || "").trim().slice(0, 120); if (!nom) return sendJ(res, 400, {error:{message:"Indique le nom de l'établissement"}});
    const a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; let code; do { code = [...crypto.randomBytes(8)].map(x => a[x % a.length]).join(""); } while (GROUPES.some(g => g.code === code));
    const g = {id:crypto.randomBytes(8).toString("hex"), nom, code, directeur:u.id, membres:[], eleves:Math.max(0, Math.min(20000, +b.eleves || 0)), payeProfs:!!b.payeProfs, createdAt:new Date().toISOString()};
    GROUPES.push(g); saveGroupes(); return sendJ(res, 200, {etab:etabPub(g, u)});
  }
  if (p === "/api/etab/rejoindre" && req.method === "POST"){
    if (groupOf(u)) return sendJ(res, 409, {error:{message:"Tu fais déjà partie d'un établissement"}});
    if (tooMany("etab:" + u.id)) return sendJ(res, 429, {error:{message:"Trop d'essais, réessaie dans 15 minutes"}});
    const g = GROUPES.find(x => x.code === String(b.code || "").trim().toUpperCase()); if (!g) return sendJ(res, 404, {error:{message:"Code d'établissement inconnu"}});
    g.membres = [...new Set([...(g.membres || []), u.id])]; saveGroupes(); if (LIVE(g.sub)) stopOwnSubs(g);
    if (BILLING() && LIVE(g.sub)) await syncEtab(g).catch(e => console.warn("Stripe sync", e.message));   // le nouveau prof est ajouté à la facture de l'établissement
    return sendJ(res, 200, {etab:etabPub(g, u)});
  }
  if (p === "/api/etab/quitter" && req.method === "POST"){
    const g = groupOf(u); if (!g) return sendJ(res, 200, {etab:null});
    if (g.directeur === u.id){ if (LIVE(g.sub)) return sendJ(res, 400, {error:{message:"Résilie d'abord l'abonnement de l'établissement"}}); GROUPES = GROUPES.filter(x => x !== g); }
    else g.membres = g.membres.filter(id => id !== u.id);
    saveGroupes(); if (g.directeur !== u.id && BILLING() && LIVE(g.sub)) await syncEtab(g).catch(e => console.warn("Stripe sync", e.message)); return sendJ(res, 200, {etab:null});
  }
  const dg = GROUPES.find(x => x.directeur === u.id);
  if (p === "/api/etab/reglages" && req.method === "POST"){
    if (!dg) return sendJ(res, 403, {error:{message:"Réservé à la direction de l'établissement"}});
    if (b.nom) dg.nom = String(b.nom).trim().slice(0, 120); if (b.eleves != null) dg.eleves = Math.max(0, Math.min(20000, +b.eleves || 0)); if (typeof b.payeProfs === "boolean") dg.payeProfs = b.payeProfs; if (typeof b.collecte === "boolean") dg.collecte = b.collecte;
    if (b.retirer) dg.membres = (dg.membres || []).filter(id => id !== b.retirer);
    saveGroupes(); if (BILLING() && LIVE(dg.sub)) await syncEtab(dg).catch(e => console.warn("Stripe sync", e.message)); return sendJ(res, 200, {etab:etabPub(dg, u)});
  }
  if (p === "/api/billing/use" && req.method === "POST"){
    const cid = String(b.ctrlId || "").slice(0, 40), c = DOCS.get("controles/" + cid); if (!cid || !c) return sendJ(res, 404, {error:{message:"Contrôle introuvable"}});
    const q = quota(u); if (q.illimite || c.type === "rattrapage" || (u.printed || []).includes(cid)) return sendJ(res, 200, {quota:q});
    if (q.used >= q.ctrl) return sendJ(res, 402, {error:{message:QUOTA_MSG, code:"quota"}, quota:q});
    const m = MOIS(), unAn = (+m.slice(0, 4) - 1) + m.slice(4); u.credits = Object.fromEntries(Object.entries(u.credits || {}).filter(([k]) => k >= unAn));   // on garde un an d'historique
    u.credits[m] = {...(u.credits[m] || {}), ids:[...(u.credits[m]?.ids || []), cid]}; u.printed = [...(u.printed || []), cid].slice(-500); saveUsers();
    return sendJ(res, 200, {quota:quota(u)});
  }
  if (!BILLING()) return sendJ(res, 400, {error:{message:"Le paiement n'est pas encore ouvert : la bêta est gratuite"}});
  if (p === "/api/billing/extra" && req.method === "POST"){
    const price = PRICE(res._lang).controle; if (!price) return sendJ(res, 503, {error:{message:"Tarif non configuré sur le serveur"}});
    const n = Math.max(1, Math.min(10, +b.n || 1));
    const s = await stripe("POST", "/checkout/sessions", {mode:"payment", client_reference_id:u.id, customer:u.sub?.customer || undefined, customer_email:u.sub?.customer ? undefined : u.email,
      line_items:[{price, quantity:n}], locale:res._lang === "en" ? "en" : res._lang === "pt" ? "pt-BR" : "fr",
      metadata:{kind:"extra", uid:u.id, mois:MOIS(), n}, success_url:baseUrl(req) + "/app#/compte?paiement=ok", cancel_url:baseUrl(req) + "/app#/compte"});
    return sendJ(res, 200, {url:s.url});
  }
  if (p === "/api/billing/checkout" && req.method === "POST"){
    const plan = TIERS[b.plan] ? b.plan : "essentiel", per = b.periode === "an" ? "an" : "mois", price = PRICE(res._lang)[plan + "_" + per];
    if (!price) return sendJ(res, 503, {error:{message:"Tarif non configuré sur le serveur"}});
    if (LIVE(u.sub)) return sendJ(res, 409, {error:{message:"Tu as déjà un abonnement : gère-le avec « Gérer mon abonnement »"}});
    const a = access(u), fin = a.mode === "essai" ? Date.parse(a.fin) : 0;
    const s = await stripe("POST", "/checkout/sessions", {mode:"subscription", client_reference_id:u.id, customer_email:u.sub?.customer ? undefined : u.email, customer:u.sub?.customer || undefined,
      line_items:[{price, quantity:1}], allow_promotion_codes:true, locale:res._lang === "en" ? "en" : res._lang === "pt" ? "pt-BR" : "fr",
      subscription_data:{metadata:{kind:"prof", uid:u.id, plan}, trial_end:fin > Date.now() + 2 * DAY ? Math.floor(fin / 1000) : undefined},
      success_url:baseUrl(req) + "/app#/compte?paiement=ok", cancel_url:baseUrl(req) + "/app#/compte"});
    return sendJ(res, 200, {url:s.url});
  }
  if (p === "/api/billing/etab" && req.method === "POST"){
    if (!dg) return sendJ(res, 403, {error:{message:"Réservé à la direction de l'établissement"}});
    if (LIVE(dg.sub)) return sendJ(res, 409, {error:{message:"L'établissement a déjà un abonnement"}});
    if (!PRICE(res._lang).ecole || !(dg.eleves > 0)) return sendJ(res, 400, {error:{message:"Indique le nombre d'élèves de l'établissement"}});
    const items = [{price:PRICE(res._lang).ecole, quantity:Math.max(ECOLE_MIN(), dg.eleves)}];
    const s = await stripe("POST", "/checkout/sessions", {mode:"subscription", client_reference_id:dg.id, customer_email:u.email, line_items:items, allow_promotion_codes:true, locale:res._lang === "en" ? "en" : res._lang === "pt" ? "pt-BR" : "fr",
      billing_address_collection:"required", tax_id_collection:{enabled:true}, subscription_data:{metadata:{kind:"ecole", gid:dg.id}},
      success_url:baseUrl(req) + "/app#/compte?paiement=ok", cancel_url:baseUrl(req) + "/app#/compte"});
    return sendJ(res, 200, {url:s.url});
  }
  if (p === "/api/billing/portal" && req.method === "POST"){
    const cust = b.etab ? dg?.sub?.customer : u.sub?.customer; if (!cust) return sendJ(res, 404, {error:{message:"Aucun abonnement à gérer"}});
    const s = await stripe("POST", "/billing_portal/sessions", {customer:cust, return_url:baseUrl(req) + "/app#/compte"}); return sendJ(res, 200, {url:s.url});
  }
  return sendJ(res, 404, {error:{message:"Route inconnue"}});
}
/* Met à jour les quantités (élèves, profs) de l'abonnement de l'établissement */
async function syncEtab(g){
  const s = await stripe("GET", "/subscriptions/" + g.sub.id), ids = [PRICE("fr").ecole, PRICE("pt").ecole].filter(Boolean);
  for (const it of s.items?.data || []){ if (!ids.includes(it.price?.id)) continue; const q = Math.max(ECOLE_MIN(), g.eleves || 0);
    if (q !== it.quantity) await stripe("POST", "/subscription_items/" + it.id, {quantity:q}); }
}


/* ---------- Annuaire officiel des établissements (data.education.gouv.fr, données ouvertes) ---------- */
const ANNU = env("ANNUAIRE_URL") || "https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-annuaire-education/records";
const odsq = x => String(x || "").replace(/["\\]/g, " ").trim().slice(0, 80);
const mapEt = r => ({uai:String(r.identifiant_de_l_etablissement || ""), nom:String(r.nom_etablissement || ""), adresse:[r.adresse_1, r.adresse_2].filter(Boolean).join(", "),
  cp:String(r.code_postal || ""), ville:String(r.nom_commune || ""), type:String(r.type_etablissement || ""), statut:String(r.statut_public_prive || "")});
const annuCache = new Map();
async function annuaire(where){
  if (annuCache.has(where)) return annuCache.get(where);
  const r = await fetch(ANNU + "?limit=12&where=" + encodeURIComponent(where), {signal:AbortSignal.timeout(9000)});
  if (!r.ok) throw new Error("annuaire_" + r.status);
  const j = await r.json(); const list = (j.results || (j.records || []).map(x => x.record?.fields || x.fields || {})).map(mapEt).filter(x => x.nom && x.uai);
  annuCache.set(where, list); if (annuCache.size > 500) annuCache.delete(annuCache.keys().next().value); return list;
}
async function searchEcoles(q, cp){
  const parts = []; if (odsq(q)) parts.push(`"${odsq(q)}"`);
  cp = String(cp || "").replace(/\s/g, ""); if (/^\d{5}$/.test(cp)) parts.push(`code_postal="${cp}"`); else if (/^\d{2,4}$/.test(cp)) parts.push(`startswith(code_postal, "${cp}")`);
  return parts.length ? annuaire(parts.join(" AND ")) : [];
}
/* Établissement déclaré par un prof : vérifié si l'identifiant officiel (UAI) est retrouvé dans l'annuaire, sinon enregistré « non vérifié ». */
async function checkEcole(e){
  if (!isObj(e)) return null;
  const uai = String(e.uai || "").toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 10);
  if (uai){
    try { const hit = (await annuaire(`identifiant_de_l_etablissement="${uai}"`))[0]; if (hit) return {...hit, verifiee:true, source:"annuaire", at:new Date().toISOString()}; }
    catch(err){ console.warn("Annuaire injoignable :", err.message); }
  }
  const nom = String(e.nom || "").trim().slice(0, 120), cp = String(e.cp || "").trim().slice(0, 10), ville = String(e.ville || "").trim().slice(0, 80);
  if (!nom || !ville) return {error:"Indique le nom de l'école et sa ville"};
  return {uai:"", nom, adresse:String(e.adresse || "").trim().slice(0, 160), cp, ville, type:"", statut:"", verifiee:false, source:uai ? "a_verifier" : "manuel", at:new Date().toISOString()};
}
const signupOpen = () => env("SIGNUP").toLowerCase() !== "off";

async function accounts(req, res, url, p, u){
  if (p === "/api/ecoles" && req.method === "GET"){
    if (tooMany("ec:" + ipOf(req))) return sendJ(res, 429, {error:{message:"Trop de recherches, réessaie dans quelques minutes"}});
    try { return sendJ(res, 200, {ecoles:await searchEcoles(url.searchParams.get("q"), url.searchParams.get("cp"))}); }
    catch(e){ console.warn("Annuaire :", e.message); return sendJ(res, 502, {error:{message:"Annuaire officiel injoignable pour le moment : tu peux enregistrer ton école manuellement."}}); }
  }
  if (p === "/api/register" && req.method === "POST"){
    if (!signupOpen()) return sendJ(res, 403, {error:{message:"Les inscriptions sont fermées"}});
    if (tooMany(ipOf(req))) return sendJ(res, 429, {error:{message:"Trop d'essais, réessaie dans 15 minutes"}});
    const b = await readJSON(req, 2e4) || {}; const email = String(b.email || "").trim().toLowerCase();
    if (!validEmail(email)) return sendJ(res, 400, {error:{message:"E-mail invalide"}});
    if (USERS.some(v => v.email === email)) return sendJ(res, 409, {error:{message:"Un compte existe déjà avec cet e-mail"}});
    if (String(b.password || "").length < 8) return sendJ(res, 400, {error:{message:"Mot de passe : 8 caractères minimum"}});
    if (!String(b.nom || "").trim()) return sendJ(res, 400, {error:{message:"Indique ton nom"}});
    if (!b.cgu) return sendJ(res, 400, {error:{message:"Accepte les conditions d'utilisation et la politique de confidentialité"}});
    const ecole = await checkEcole(b.ecole); if (!ecole || ecole.error) return sendJ(res, 400, {error:{message:ecole?.error || "Indique ton école"}});
    const id = crypto.randomBytes(8).toString("hex");
    const planDemande = PLANS.includes(b.plan) ? b.plan : "essentiel";
    const n = {id, email, nom:String(b.nom).trim().slice(0, 80), role:"prof", plan:"essentiel", planDemande, statut:"en_attente", options:{exercices:false}, espace:id, ecole, affichage:AFF.includes(b.affichage) ? b.affichage : "les2", pw:hashPw(b.password), createdAt:new Date().toISOString(), cguAt:new Date().toISOString(), inscription:"libre"};
    const rc = String(b.ref || ((req.headers.cookie || "").match(/(?:^|;\s*)mref=([A-Z0-9]{7})/) || [])[1] || "").toUpperCase(), par = rc && USERS.find(v => v.ref === rc);
    if (par) n.referredBy = par.id;
    USERS.push(n); saveUsers(); console.log(`Inscription à valider · ${id} · ${planDemande} · ${ecole.nom} (${ecole.verifiee ? "vérifiée " + ecole.uai : "non vérifiée"})`);
    return sendJ(res, 200, {pending:true, user:{nom:n.nom, email:n.email, ecole:n.ecole, planDemande}});
  }
  if (p === "/api/me" && req.method === "GET") return u ? sendJ(res, 200, {user:pub(u)}) : sendJ(res, 401, {setup:USERS.length === 0});
  if (p === "/api/setup" && req.method === "POST"){
    if (USERS.length) return sendJ(res, 409, {error:{message:"Le compte administrateur existe déjà"}});
    if (!(env("MASTERY_CODE") || env("TIKOUN_CODE"))) return sendJ(res, 503, {error:{message:"Définis la variable MASTERY_CODE sur le serveur"}});
    if (tooMany(ipOf(req))) return sendJ(res, 429, {error:{message:"Trop d'essais, réessaie dans 15 minutes"}});
    const b = await readJSON(req, 1e4) || {};
    if (!same(String(b.code || ""), (env("MASTERY_CODE") || env("TIKOUN_CODE")))) return sendJ(res, 401, {error:{message:"Code de l'établissement incorrect"}});
    const email = String(b.email || "").trim().toLowerCase(); if (!validEmail(email) || String(b.password || "").length < 8) return sendJ(res, 400, {error:{message:"E-mail valide et mot de passe de 8 caractères minimum"}});
    const aid = crypto.randomBytes(8).toString("hex");
    const a = {id:aid, espace:aid, email, nom:String(b.nom || "Direction").slice(0, 80), role:"admin", plan:"pro", options:{exercices:true}, affichage:"les2", pw:hashPw(b.password), createdAt:new Date().toISOString()};
    USERS.push(a); saveUsers(); migrateEspaces();
    for (const [k, v] of DOCS) if (OWNED.includes(k.split("/")[0]) && isObj(v) && !v.owner) persist(k, {...v, owner:a.id});   // données déjà saisies → à l'admin
    return openSession(req, res, a);
  }
  if (p === "/api/login" && req.method === "POST"){
    if (tooMany(ipOf(req))) return sendJ(res, 429, {error:{message:"Trop d'essais, réessaie dans 15 minutes"}});
    const b = await readJSON(req, 1e4) || {}; const em = String(b.email || "").trim().toLowerCase(), x = USERS.find(v => v.email === em);
    const failK = "fail:" + em, fails = (tries.get(failK) || []).filter(t => Date.now() - t < 15 * 60e3);
    if (fails.length >= 8) return sendJ(res, 429, {error:{message:"Trop d'essais, réessaie dans 15 minutes"}});
    if (!x || !checkPw(b.password, x.pw)){ tooMany(failK); return sendJ(res, 401, {error:{message:"E-mail ou mot de passe incorrect"}}); }
    tries.delete(failK);
    if (x.statut === "en_attente") return sendJ(res, 403, {pending:true, error:{message:"Ton inscription est en attente de validation par l'équipe Mastery. Tu pourras te connecter dès qu'elle sera acceptée."}});
    if (x.statut === "refuse") return sendJ(res, 403, {error:{message:"Ton inscription n'a pas été acceptée. Contacte l'équipe Mastery."}});
    if (x.actif === false) return sendJ(res, 401, {error:{message:"Compte désactivé"}});
    return openSession(req, res, x, {mustChange:!!x.mustChange});
  }
  /* Mot de passe oublié : lien valable une heure par e-mail ; sans service d'e-mail, la demande apparaît dans Comptes pour l'administrateur */
  if (p === "/api/password/forgot" && req.method === "POST"){
    if (tooMany(ipOf(req))) return sendJ(res, 429, {error:{message:"Trop d'essais, réessaie dans 15 minutes"}});
    const b = await readJSON(req, 1e4) || {}; const em = String(b.email || "").trim().toLowerCase();
    if (!validEmail(em)) return sendJ(res, 400, {error:{message:"E-mail invalide"}});
    const x = USERS.find(v => v.email === em && v.actif !== false && (v.statut || "valide") === "valide");
    if (x && MAIL()){ const t = crypto.randomBytes(24).toString("hex"); x.reset = {h:tokHash(t), exp:Date.now() + 3600e3}; saveUsers();
      const base = env("APP_URL") || ((String(req.headers["x-forwarded-proto"] || "").includes("https") ? "https://" : "http://") + req.headers.host);
      const en = res._lang === "en", pt = res._lang === "pt";
      sendMail(x.email, en ? "Reset your Mastery password" : pt ? "Redefina sua senha do Mastery" : "Réinitialise ton mot de passe Mastery",
        (en ? "To choose a new password, open this link (valid for 1 hour):\n" : pt ? "Para escolher uma nova senha, abra este link (válido por 1 hora):\n" : "Pour choisir un nouveau mot de passe, ouvre ce lien (valable 1 heure) :\n") + base + "/app#/reset/" + t +
        (en ? "\n\nIf you didn't ask for this, ignore this email." : pt ? "\n\nSe você não pediu, ignore este e-mail." : "\n\nSi tu n'as rien demandé, ignore cet e-mail.")).catch(e => console.warn("E-mail non envoyé", e.message)); }
    else if (x){ x.resetDemande = new Date().toISOString(); saveUsers(); console.log(`Mot de passe oublié · ${x.id}`); }
    return sendJ(res, 200, {mail:MAIL(), contact:CONTACT()});
  }
  if (p === "/api/password/reset" && req.method === "POST"){
    if (tooMany(ipOf(req))) return sendJ(res, 429, {error:{message:"Trop d'essais, réessaie dans 15 minutes"}});
    const b = await readJSON(req, 1e4) || {}; const h = tokHash(b.token || "");
    const x = USERS.find(v => v.reset?.h && same(v.reset.h, h) && v.reset.exp > Date.now());
    if (!x) return sendJ(res, 400, {error:{message:"Lien expiré ou déjà utilisé : refais une demande de mot de passe oublié."}});
    if (String(b.password || "").length < 8) return sendJ(res, 400, {error:{message:"Mot de passe : 8 caractères minimum"}});
    x.pw = hashPw(b.password); delete x.reset; delete x.resetDemande; x.mustChange = false;
    for (const [k, v] of Object.entries(SESS)) if (v.uid === x.id) delete SESS[k];
    saveUsers(); return openSession(req, res, x);
  }
  if (p === "/api/logout" && req.method === "POST"){ delete SESS[sidOf(req)]; saveSess(); return sendJ(res, 200, {}, {"Set-Cookie":"sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"}); }
  if (!u) return sendJ(res, 401, {error:{message:"Connexion requise"}});
  if (p === "/api/me" && req.method === "DELETE") return deleteAccount(req, res, u, u);
  if (p === "/api/me/password" && req.method === "POST"){
    const b = await readJSON(req, 1e4) || {};
    if (!u.mustChange && !checkPw(b.old, u.pw)) return sendJ(res, 401, {error:{message:"Mot de passe actuel incorrect"}});
    if (String(b.password || "").length < 8) return sendJ(res, 400, {error:{message:"8 caractères minimum"}});
    u.pw = hashPw(b.password); delete u.mustChange; delete u.resetTag; saveUsers();
    const mine = sidOf(req); for (const [k, v] of Object.entries(SESS)) if (v.uid === u.id && k !== mine) delete SESS[k]; saveSess();
    return sendJ(res, 200, {user:pub(u)});
  }
  if (p === "/api/me" && req.method === "PATCH"){
    const b = await readJSON(req, 2e4) || {};
    if (b.nom && String(b.nom).trim()) u.nom = String(b.nom).trim().slice(0, 80);
    if (AFF.includes(b.affichage)) u.affichage = b.affichage;
    if (["20", "10", "100", "AF"].includes(b.bareme)) u.bareme = b.bareme;
    if (typeof b.partageEcriture === "boolean") u.partageEcriture = b.partageEcriture;
    if (isObj(b.prefs)) u.prefs = cleanPrefs({...(u.prefs || {}), ...b.prefs, q:{...(u.prefs?.q || {}), ...(isObj(b.prefs.q) ? b.prefs.q : {})}});
    if (Array.isArray(b.enseigne)) u.enseigne = [...new Set(b.enseigne.map(x => String(x).trim().slice(0, 40)).filter(Boolean))].slice(0, 12);
    if (Array.isArray(b.matieres)) u.matieres = [...new Set(b.matieres.map(x => String(x).trim().slice(0, 40)).filter(Boolean))].slice(0, 40);
    if (b.ecole){ const e = await checkEcole(b.ecole); if (!e || e.error) return sendJ(res, 400, {error:{message:e?.error || "École invalide"}}); u.ecole = e; }
    saveUsers(); return sendJ(res, 200, {user:pub(u)});
  }
  if (u.role !== "admin") return sendJ(res, 403, {error:{message:"Réservé à l'administrateur"}});
  if (p === "/api/users" && req.method === "GET") return sendJ(res, 200, {users:USERS.map(pub)});
  if (p === "/api/users" && req.method === "POST"){
    const b = await readJSON(req, 1e4) || {}; const email = String(b.email || "").trim().toLowerCase();
    if (!validEmail(email)) return sendJ(res, 400, {error:{message:"E-mail invalide"}});
    if (USERS.some(v => v.email === email)) return sendJ(res, 409, {error:{message:"Ce compte existe déjà"}});
    if (String(b.password || "").length < 8) return sendJ(res, 400, {error:{message:"Mot de passe provisoire : 8 caractères minimum"}});
    const n = {id:crypto.randomBytes(8).toString("hex"), email, nom:String(b.nom || email).slice(0, 80), role:b.role === "admin" ? "admin" : "prof", plan:PLANS.includes(b.plan) ? b.plan : "essentiel", pw:hashPw(b.password), mustChange:true, createdAt:new Date().toISOString(), espace:u.espace, ecole:u.ecole || null, affichage:"les2"};
    n.options = {exercices:tierOf(n.plan) !== "decouverte" && !!b.exercices};
    USERS.push(n); saveUsers(); return sendJ(res, 200, {user:pub(n)});
  }
  const m = p.match(/^\/api\/users\/([a-f0-9]{16})$/);
  if (m){
    const x = USERS.find(v => v.id === m[1]); if (!x) return sendJ(res, 404, {error:{message:"Compte introuvable"}});
    if (req.method === "DELETE"){ if (x.id === u.id) return sendJ(res, 400, {error:{message:"Impossible sur ton propre compte"}}); return deleteAccount(req, res, u, x); }
    if (req.method === "PATCH"){
      const b = await readJSON(req, 1e4) || {};
      if (x.id === u.id && (b.role === "prof" || b.actif === false)) return sendJ(res, 400, {error:{message:"Tu ne peux pas te retirer tes propres droits"}});
      if (b.nom) x.nom = String(b.nom).slice(0, 80);
      if (b.role === "admin" || b.role === "prof") x.role = b.role;
      if (typeof b.actif === "boolean") x.actif = b.actif;
      if (b.offrirMois){ const base = Math.max(Date.now(), Date.parse(x.trialEnd || 0) || 0, Date.parse(x.freeUntil || 0) || 0); x.freeUntil = new Date(base + 30 * DAY * Math.min(12, Math.max(1, +b.offrirMois || 1))).toISOString(); }
      if (b.statut === "valide" && x.statut !== "valide"){ x.statut = "valide"; x.valideAt = new Date().toISOString(); x.validePar = u.id;
        if (!b.plan){ x.plan = x.planDemande || x.plan || "essentiel"; x.options = {...(x.options || {}), exercices:tierOf(x.plan) !== "decouverte"}; } }
      if (b.statut === "refuse"){ if (x.id === u.id) return sendJ(res, 400, {error:{message:"Impossible sur ton propre compte"}}); x.statut = "refuse"; for (const [k, v] of Object.entries(SESS)) if (v.uid === x.id) delete SESS[k]; }
      if (PLANS.includes(b.plan)){ x.plan = b.plan; x.options = {...(x.options || {}), exercices:tierOf(b.plan) !== "decouverte"}; }
      if (typeof b.exercices === "boolean") x.options = {...(x.options || {}), exercices:b.exercices && tierOf(x.plan) !== "decouverte"};
      if (b.password){ if (String(b.password).length < 8) return sendJ(res, 400, {error:{message:"8 caractères minimum"}}); x.pw = hashPw(b.password); x.mustChange = true; delete x.resetDemande; delete x.reset; }
      if (x.actif === false) for (const [k, v] of Object.entries(SESS)) if (v.uid === x.id) delete SESS[k];
      saveUsers(); saveSess(); return sendJ(res, 200, {user:pub(x)});
    }
  }
  return sendJ(res, 404, {error:{message:"Route inconnue"}});
}

async function storage(req, res, url, p, u){
  if (!u) return sendJ(res, 401, {error:{message:"Connexion requise"}});
  try {
    if (p === "/api/db" && req.method === "GET") return sendJ(res, 200, {epoch:EPOCH, seq:SEQ, persistent:PERSISTENT, docs:docsFor(u)});
    if (p === "/api/db/changes" && req.method === "GET"){
      const since = Number(url.searchParams.get("since")) || 0, ep = url.searchParams.get("epoch");
      if (ep !== EPOCH || (LOG.length && since < LOG[0].seq - 1)) return sendJ(res, 200, {reset:true, epoch:EPOCH, seq:SEQ, docs:docsFor(u)});
      const changed = [...new Set(LOG.filter(l => l.seq > since && (u.role === "admin" || l.esp === u.espace || l.own === u.id || dirSees(u, l.esp))).map(l => l.path))];
      return sendJ(res, 200, {epoch:EPOCH, seq:SEQ, changes:changed.map(k => ({path:k, data:DOCS.has(k) ? DOCS.get(k) : null}))});
    }
    if (p === "/api/db/doc"){
      if (req.method !== "GET" && !access(u).ok) return sendJ(res, 402, {error:{message:NO_ACCESS, code:"no_access"}});
      const dp = url.searchParams.get("path") || ""; if (!PATH_OK(dp)) return sendJ(res, 400, {error:{message:"Chemin invalide"}});
      if (!canWrite(u, dp)) return sendJ(res, 403, {error:{message:"Ce document appartient à un autre professeur"}});
      if (req.method === "DELETE"){ persist(dp, null); return sendJ(res, 200, {seq:SEQ}); }
      const body = await readJSON(req); if (!isObj(body)) return sendJ(res, 400, {error:{message:"Objet JSON attendu"}});
      const col = dp.split("/")[0], cur = DOCS.get(dp);
      if (req.method === "PUT" && col === "classes" && !cur){ const q = quota(u); if (!q.illimite && q.classes != null && classesOf(u) >= q.classes) return sendJ(res, 402, {error:{message:CLASSES_MSG, code:"quota_classes"}}); }
      if (req.method === "PUT" && col === "quizzes" && !cur && !entitled(u))
        return sendJ(res, 403, {error:{message:"Exercices en ligne : à partir du forfait Essentiel"}});
      if (req.method === "PUT" && col === "controles" && body.type === "exercices" && !cur && !entitled(u))
        return sendJ(res, 403, {error:{message:"Exercices en ligne non activés pour ce compte (à partir du forfait Essentiel)"}});
      if (req.method === "PUT"){
        const own = cur?.owner || (col === "feuilles" ? ownerOf(dp) : null) || u.id;
        const esp = espaceFor(dp, u);
        persist(dp, OWNED.includes(col) ? {...body, owner:own, espace:esp} : {...body, espace:esp, ...(cur?.createdBy || !cur ? {createdBy:cur?.createdBy || u.id} : {})});
        return sendJ(res, 200, {seq:SEQ});
      }
      if (req.method === "PATCH"){ if (!cur) return sendJ(res, 404, {error:{message:"Document introuvable"}}); const {owner, espace, ...rest} = body; persist(dp, merge(cur, rest)); return sendJ(res, 200, {seq:SEQ}); }
    }
    if (p === "/api/files" && req.method === "POST"){
      if (!access(u).ok) return sendJ(res, 402, {error:{message:NO_ACCESS, code:"no_access"}});
      const want = url.searchParams.get("id") || "", reuse = /^[a-z0-9]{8,40}$/.test(want) && (!FOWN[want] || FOWN[want].u === u.id);
      const id = reuse ? want : crypto.randomBytes(10).toString("hex");   // on n'écrase jamais l'image d'un autre
      fs.writeFileSync(path.join(FILEDIR, id + ".jpg"), await readBody(req, 15e6)); setOwner(id, u); return sendJ(res, 200, {id});
    }
    const m = p.match(/^\/api\/files\/([a-z0-9]{8,40})$/);
    if (m && req.method === "DELETE"){ if (FOWN[m[1]] && (FOWN[m[1]].u === u.id || (FOWN[m[1]].e && FOWN[m[1]].e === u.espace) || u.role === "admin")){ fs.rmSync(path.join(FILEDIR, m[1] + ".jpg"), {force:true}); delete FOWN[m[1]]; saveFown(); } return sendJ(res, 200, {ok:true}); }
    if (m && req.method === "GET"){ const f = path.join(FILEDIR, m[1] + ".jpg"); if (!fs.existsSync(f) || !canSeeFile(u, m[1])) return send(res, 404, "Introuvable");
      res.writeHead(200, {"Content-Type":"image/jpeg", "Cache-Control":"private, max-age=86400", ...SEC_HEADERS}); return pipeFile(f, res); }
    if (p === "/api/export" && req.method === "GET"){
      const docs = Object.fromEntries([...DOCS].filter(([k, v]) => visible(u, v) && (u.role === "admin" || !OWNED.includes(k.split("/")[0]) || ownerOf(k) === u.id)));
      return send(res, 200, JSON.stringify({tikoun:1, at:new Date().toISOString(), docs, blobs:{}}), TYPES[".json"], {"Content-Disposition":`attachment; filename="mastery-sauvegarde-${new Date().toISOString().slice(0, 10)}.json"`});
    }
    return sendJ(res, 404, {error:{message:"Route inconnue"}});
  } catch(e){ return sendJ(res, e.message === "too_large" ? 413 : 400, {error:{message:e.message === "too_large" ? "Trop lourd" : "Requête invalide"}}); }
}

/* ---------- Suppression d'un compte (RGPD) : documents, copies, images, tâches, dépôts, échantillons d'écriture ---------- */
function purgeUser(x){
  const personal = x.espace === x.id && !USERS.some(v => v !== x && v.espace === x.espace);
  const docs = [...DOCS].filter(([k, v]) => isObj(v) && (v.owner === x.id || (personal && v.espace === x.espace))).map(([k]) => k);
  for (const k of docs) persist(k, null);
  let files = 0; for (const [id, o] of Object.entries(FOWN)) if (o.u === x.id || (personal && o.e === x.espace)){ fs.rmSync(path.join(FILEDIR, id + ".jpg"), {force:true}); delete FOWN[id]; files++; }
  saveFown();
  BANQUE = BANQUE.filter(b => b.par !== x.id); saveBanque();
  JOBS = JOBS.filter(j => j.user !== x.id); saveJobs();
  for (const l of LOTS.filter(l => l.user === x.id)) for (const ext of [".bin", ".kit.json"]) fs.rmSync(path.join(LOTDIR, l.id + ext), {force:true});
  LOTS = LOTS.filter(l => l.user !== x.id); saveLots();
  DEVICES = DEVICES.filter(d => d.par !== x.id); saveDevices();
  for (const g of GROUPES) g.membres = (g.membres || []).filter(id => id !== x.id);
  GROUPES = GROUPES.filter(g => g.directeur !== x.id); saveGroupes();
  for (const [k, v] of Object.entries(SESS)) if (v.uid === x.id) delete SESS[k]; saveSess();
  USERS = USERS.filter(v => v !== x); saveUsers();
  console.log(`Compte supprimé · ${x.id} · ${docs.length} document(s), ${files} image(s)`);
  return {documents:docs.length, images:files};
}
async function deleteAccount(req, res, u, x){
  const b = await readJSON(req, 1e4) || {};
  if (x === u && !checkPw(b.password, u.pw)) return sendJ(res, 401, {error:{message:"Mot de passe actuel incorrect"}});
  if (x.role === "admin" && USERS.filter(v => v.role === "admin" && v !== x).length === 0) return sendJ(res, 400, {error:{message:"Impossible de supprimer le dernier administrateur"}});
  if (LIVE(x.sub)) return sendJ(res, 400, {error:{message:"Résilie d'abord l'abonnement (Gérer mon abonnement)"}});
  const out = purgeUser(x);
  return sendJ(res, 200, {ok:true, ...out}, x === u ? {"Set-Cookie":"sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"} : undefined);
}

/* ---------- Espace élève : quiz d'exercices en ligne (code personnel, sans e-mail) ---------- */
const ESESS = new Map();                       // jeton élève → {classeId, eleveId, espace, exp}
const TIRAGES = new Map();                     // tirage en cours → {quizId, key, qids, used, answered, start, exp}
const esidOf = req => ((req.headers.cookie || "").match(/(?:^|;\s*)esid=([a-f0-9]{48})/) || [])[1] || "";
function eleveOf(req){ const s = ESESS.get(esidOf(req)); if (!s || s.exp < Date.now()) return null; const cl = DOCS.get("classes/" + s.classeId); const e = cl?.eleves?.find(x => x.id === s.eleveId && x.code === s.code); return e ? {...s, cl, e} : null; }
function findCode(code){
  code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); if (code.length < 5) return null;
  for (const [k, v] of DOCS) if (k.startsWith("classes/") && isObj(v)){ const e = (v.eleves || []).find(x => x.code === code); if (e) return {classeId:k.slice(8), cl:v, e, code}; }
  return null;
}
const quizOpen = q => q && q.statut === "ouvert" && (!q.fermeture || new Date(q.fermeture + "T23:59:59") >= new Date());
const quizzesFor = el => [...DOCS].filter(([k, q]) => k.startsWith("quizzes/") && isObj(q) && q.classeId === el.classeId && q.statut !== "brouillon").map(([k, q]) => ({id:k.slice(8), q}));
const norm = t => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, "'").replace(/[.;:!?]+$/g, "").replace(/\s+/g, " ").trim();
const numOf = t => { const x = String(t ?? "").replace(/\s/g, "").replace(",", ".").match(/-?\d+(\.\d+)?(\/\d+)?/); if (!x) return NaN; const [a, b] = x[0].split("/"); return b ? parseFloat(a) / parseFloat(b) : parseFloat(a); };
function correct(q, rep){
  if (q.type === "qcm"){ const want = [...(q.bonnes || [])].map(Number).sort().join(","), got = [...(Array.isArray(rep) ? rep : [rep])].map(Number).filter(n => !isNaN(n)).sort().join(","); return want === got; }
  if (q.type === "vf") return String(rep) === String(!!q.bonne);
  if (q.type === "num"){ const v = numOf(rep), w = Number(q.reponse), tol = Math.abs(Number(q.tolerance) || 0) || Math.max(1e-9, Math.abs(w) * 1e-6); return isFinite(v) && Math.abs(v - w) <= tol; }
  if (q.type === "trou") return (q.reponses || []).some(r => norm(r) === norm(rep));
  return null;   // rédigée : corrigée ensuite par le professeur (ou l'IA à sa demande)
}
const publicQ = q => ({id:q.id, type:q.type, notion:q.notion || "", niveau:q.niveau || 1, enonce:q.enonce, choix:q.type === "qcm" ? q.choix : undefined, multi:q.type === "qcm" && (q.bonnes || []).length > 1, unite:q.unite || ""});
const shuffle = a => { for (let i = a.length - 1; i > 0; i--){ const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function repDoc(qid, el, q){ const k = "quizrep/" + qid + "_" + el.eleveId; return {k, d:DOCS.get(k) || {quizId:qid, eleveId:el.eleveId, classeId:el.classeId, owner:q.owner, espace:q.espace, tentatives:[], notions:{}, vues:0, ok:0, redigees:[]}}; }
function pickNext(q, rd, used, notion){
  const acq = n => rd.notions?.[n]?.acquis;
  let pool = (q.questions || []).filter(x => !used.has(x.id) && (!notion || x.notion === notion));
  if (!pool.length) return null;
  const pri = pool.filter(x => !acq(x.notion)); if (pri.length) pool = pri;
  return pool[crypto.randomInt(pool.length)];
}
/* Espace élève : contrôles dont le professeur a publié les résultats, et rattrapages de l'élève */
const ctrlDocs = () => [...DOCS].filter(([k, v]) => k.startsWith("controles/") && isObj(v)).map(([k, v]) => ({id:k.slice(10), c:v}));
const ansNote = a => a ? (a.note ?? a.noteIA ?? null) : null;
function ctrlsEleve(el){
  return ctrlDocs().filter(({c}) => c.classeId === el.classeId && (c.type || "controle") === "controle" && c.pub?.res?.[el.eleveId])
    .map(({id, c}) => { const r = c.pub.res[el.eleveId]; return {id, titre:c.titre, matiere:c.matiere, date:c.date || "", publieLe:c.pub.at, note:r.aff?.retenue || "", base:r.aff?.base || "", ratt:r.aff?.ratt || "", rattrape:r.ratt != null && Math.abs(r.retenue - r.base) > 0.001}; })
    .sort((a, b) => (b.date || b.publieLe || "").localeCompare(a.date || a.publieLe || ""));
}
function rattsEleve(el){
  return ctrlDocs().filter(({c}) => c.type === "rattrapage" && (c.eleves || []).includes(el.eleveId) && c.statut && c.statut !== "brouillon")
    .map(({id, c}) => { const p = DOCS.get("controles/" + c.parentId), r = p?.pub?.res?.[el.eleveId]; return {id, titre:c.titre, matiere:c.matiere, date:c.date || "", parent:p?.titre || "", corrige:c.statut === "corrige" && r?.ratt != null, note:r?.ratt != null ? r.aff?.ratt || "" : ""}; })
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}
function detailEleve(el, id){
  const c = DOCS.get("controles/" + id); if (!isObj(c) || c.classeId !== el.classeId) return null;
  const isR = c.type === "rattrapage", parent = isR ? DOCS.get("controles/" + c.parentId) : null;
  if (isR ? !(c.eleves || []).includes(el.eleveId) || !c.statut || c.statut === "brouillon" : !c.pub?.res?.[el.eleveId]) return null;
  const res = isR ? parent?.pub?.res?.[el.eleveId] : c.pub.res[el.eleveId], corrige = isR ? c.statut === "corrige" && res?.ratt != null : true;
  const cp = DOCS.get("feuilles/" + id)?.copies?.[el.eleveId] || {};
  const qs = (c.questions || []).map((q, k) => { const lv = cp.version?.[q.id] || "standard", v = q.v?.[lv]?.enonce ? q.v[lv] : q.v?.standard || Object.values(q.v || {})[0] || {}, a = cp.answers?.[q.id];
    return {n:k + 1, notion:q.notion || "", points:+q.points || 0, enonce:v.enonce || "", choix:q.type === "qcm" ? v.choix || [] : null,
      ...(corrige ? {reponse:a?.transcription ?? "", note:ansNote(a), commentaire:a?.commentaire || "", corrige:v.corrige || ""} : {})}; });
  return {id, titre:c.titre, matiere:c.matiere, date:c.date || "", rattrapage:isR, parent:parent?.titre || "", corrige, consignes:c.mise?.consignes || "",
    notes:res ? {base:res.aff?.base || "", ratt:res.aff?.ratt || "", retenue:res.aff?.retenue || "", regle:res.regle || "", rattrape:res.ratt != null && Math.abs(res.retenue - res.base) > 0.001} : null, questions:qs};
}
async function eleveApi(req, res, url, p){
  if (p === "/api/eleve/login" && req.method === "POST"){
    if (tooMany("el:" + ipOf(req))) return sendJ(res, 429, {error:{message:"Trop d'essais : réessaie dans 15 minutes"}});
    const b = await readJSON(req, 2e3) || {}; const hit = findCode(b.code);
    /* Code personnel + nom de famille : deviner un code ne suffit pas */
    const norm = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\u0590-\u05ff]+/g, "");
    if (!hit || !norm(b.nom) || (norm(hit.e.nom) && norm(hit.e.nom) !== norm(b.nom))) return sendJ(res, 401, {error:{message:"Code ou nom de famille incorrect : vérifie ta carte"}});
    const tok = crypto.randomBytes(24).toString("hex"); ESESS.set(tok, {classeId:hit.classeId, eleveId:hit.e.id, code:hit.code, espace:hit.cl.espace, exp:Date.now() + 120 * 864e5});
    const secure = String(req.headers["x-forwarded-proto"] || "").includes("https") ? "; Secure" : "";
    return sendJ(res, 200, {ok:true}, {"Set-Cookie":`esid=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${120 * 86400}${secure}`});
  }
  if (p === "/api/eleve/logout" && req.method === "POST"){ ESESS.delete(esidOf(req)); return sendJ(res, 200, {}, {"Set-Cookie":"esid=; Path=/; Max-Age=0"}); }
  const el = eleveOf(req); if (!el) return sendJ(res, 401, {error:{message:"Connexion requise"}});
  if (p === "/api/eleve/me" && req.method === "GET"){
    const list = quizzesFor(el).map(({id, q}) => { const rd = DOCS.get("quizrep/" + id + "_" + el.eleveId) || {}; const notions = [...new Set((q.questions || []).map(x => x.notion).filter(Boolean))];
      return {id, titre:q.titre, matiere:q.matiere, fermeture:q.fermeture || null, ouvert:quizOpen(q), nbNotions:notions.length, acquises:notions.filter(n => rd.notions?.[n]?.acquis).length, tentatives:(rd.tentatives || []).length, redige:!!q.redige}; });
    return sendJ(res, 200, {eleve:{prenom:el.e.prenom, nom:(el.e.nom || "").slice(0, 1) + ".", classe:el.cl.nom}, quizzes:list, controles:ctrlsEleve(el), rattrapages:rattsEleve(el)});
  }
  const mc = p.match(/^\/api\/eleve\/controle\/([A-Za-z0-9_-]{4,40})$/);
  if (mc && req.method === "GET"){ const d = detailEleve(el, mc[1]); return d ? sendJ(res, 200, d) : sendJ(res, 404, {error:{message:"Contrôle introuvable"}}); }
  const m = p.match(/^\/api\/eleve\/quiz\/([A-Za-z0-9_-]{4,40})\/(tirage|reponse|fin)$/); if (!m || req.method !== "POST") return sendJ(res, 404, {error:{message:"Route inconnue"}});
  const qid = m[1], q = DOCS.get("quizzes/" + qid);
  if (!q || q.classeId !== el.classeId) return sendJ(res, 404, {error:{message:"Quiz introuvable"}});
  if (!quizOpen(q)) return sendJ(res, 403, {error:{message:"Ce quiz est fermé"}});
  const b = await readJSON(req, 2e5) || {};
  for (const [k, t] of TIRAGES) if (t.exp < Date.now()) TIRAGES.delete(k);
  if (m[2] === "tirage"){
    const {d:rd} = repDoc(qid, el, q), used = new Set(), qs = [];
    const allowRedige = !!q.redige && !!b.ordinateur;
    const eligible = {...q, questions:(q.questions || []).filter(x => x.type !== "redige" || allowRedige)};
    const n = Math.min(Number(q.parTentative) || 10, eligible.questions.length);
    while (qs.length < n){ const x = pickNext(eligible, rd, used); if (!x) break; used.add(x.id); qs.push(x); }
    const tid = crypto.randomBytes(12).toString("hex");
    TIRAGES.set(tid, {quizId:qid, eleveId:el.eleveId, qids:qs.map(x => x.id), used, answered:{}, allowRedige, start:Date.now(), exp:Date.now() + 3 * 3600e3});
    return sendJ(res, 200, {tirage:tid, titre:q.titre, questions:shuffle(qs).map(publicQ)});
  }
  const t = TIRAGES.get(String(b.tirage || "")); if (!t || t.quizId !== qid || t.eleveId !== el.eleveId) return sendJ(res, 410, {error:{message:"Session de quiz expirée : recommence"}});
  const {k, d:rd} = repDoc(qid, el, q);
  if (m[2] === "reponse"){
    const x = (q.questions || []).find(y => y.id === b.qid); if (!x || !t.qids.includes(x.id) || t.answered[x.id]) return sendJ(res, 400, {error:{message:"Question invalide"}});
    const ok = correct(x, b.rep); t.answered[x.id] = {ok, rep:b.rep, s:Math.round((Number(b.ms) || 0) / 1000)};
    rd.vues = (rd.vues || 0) + 1; if (ok) rd.ok = (rd.ok || 0) + 1;
    rd.q = rd.q || {}; const qs = rd.q[x.id] || {v:0, ok:0}; qs.v++; if (ok) qs.ok++; rd.q[x.id] = qs;
    if (x.notion){ const nn = rd.notions[x.notion] || {vus:0, ok:0, streak:0}; nn.vus++; if (ok === true){ nn.ok++; nn.streak++; } else if (ok === false) nn.streak = 0; if (nn.streak >= 3) nn.acquis = true; rd.notions[x.notion] = nn; }
    if (ok === null) rd.redigees = [...(rd.redigees || []).slice(-200), {qid:x.id, rep:String(b.rep || "").slice(0, 4000), at:new Date().toISOString(), note:null}];
    rd.derniere = new Date().toISOString(); persist(k, rd);
    let next = null;
    if (ok === false){ const pool = {...q, questions:(q.questions || []).filter(y => y.type !== "redige" || t.allowRedige)}; const y = pickNext(pool, rd, t.used, x.notion); if (y){ t.used.add(y.id); t.qids.push(y.id); next = publicQ(y); } }
    return sendJ(res, 200, {ok, bonne:x.type === "qcm" ? x.bonnes : x.type === "vf" ? !!x.bonne : x.type === "num" ? x.reponse + (x.unite ? " " + x.unite : "") : x.type === "trou" ? (x.reponses || [])[0] : "", explication:x.explication || "", next, acquis:x.notion ? !!rd.notions[x.notion]?.acquis : false});
  }
  if (m[2] === "fin"){
    const a = Object.entries(t.answered), nOk = a.filter(([, v]) => v.ok === true).length, nAuto = a.filter(([, v]) => v.ok !== null).length;
    rd.tentatives = [...(rd.tentatives || []).slice(-100), {at:new Date().toISOString(), n:a.length, ok:nOk, auto:nAuto, dureeS:Math.round((Date.now() - t.start) / 1000)}];
    persist(k, rd); TIRAGES.delete(String(b.tirage));
    const notions = [...new Set((q.questions || []).map(x => x.notion).filter(Boolean))];
    return sendJ(res, 200, {ok:nOk, total:nAuto, redigees:a.length - nAuto, acquises:notions.filter(n => rd.notions?.[n]?.acquis).length, nbNotions:notions.length});
  }
}

/* ---------- IA ---------- */
const day = () => new Date().toISOString().slice(0, 10);
/* Budget IA en dollars (coût estimé d'après les jetons consommés), enregistré sur le disque : il ne repart pas à zéro à chaque mise à jour */
const USAGE_F = path.join(DATA, "ia-usage.json"); let USAGE = readJ(USAGE_F, {day:day(), users:{}, total:0});
let usageTimer = null; const saveUsage = () => { clearTimeout(usageTimer); usageTimer = setTimeout(() => writeAtomic(USAGE_F, USAGE), 1000); };
const PRICES = {quick:[1, 5], default:[1, 5], complex:[3, 15]};   // dollars par million de jetons (entrée, sortie), modifiables par AI_PRICE_<NIVEAU>="entrée,sortie"
/* Tarifs publics Anthropic (octobre 2026), reconnus d'après le nom du modèle : changer de modèle par MODEL_<NIVEAU> garde un suivi des coûts juste */
const MODEL_PRICES = [[/haiku-5/, [0.1, 0.5]], [/haiku-4/, [1, 5]], [/sonnet-5/, [2, 10]], [/sonnet-4/, [3, 15]], [/opus-5-5/, [4, 20]], [/opus/, [5, 25]]];
const priceOf = tier => { const e = env("AI_PRICE_" + String(tier).toUpperCase()).split(",").map(Number); if (e.length === 2 && e.every(x => x > 0)) return e;
  const m = MODELS()[tier] || ""; return (MODEL_PRICES.find(([r]) => r.test(m)) || [])[1] || PRICES[tier] || PRICES.default; };
const usageReset = () => { const m = new Date().toISOString().slice(0, 7), mois = USAGE.mois?.key === m ? USAGE.mois : {key:m, users:{}};
  if (USAGE.day !== day()) USAGE = {day:day(), users:{}, total:0, mois}; else USAGE.mois = mois; };
function budgetLeft(u){
  usageReset();
  // Filet de sécurité caché, par mois : environ 3 fois le coût normal des contrôles du forfait (il ne gêne pas un usage normal)
  const q = quota(u), capAll = Number(env("AI_BUDGET_DAY")) || 150;
  const capM = q.illimite ? (Number(env("AI_BUDGET_USER_MONTH")) || 60) * (u.role === "admin" ? 5 : 1) : q.ctrl * (Number(env("AI_BUDGET_PER_CTRL")) || 3) + 2;
  if ((USAGE.total || 0) >= capAll) return "Plafond quotidien de l'IA atteint pour la plateforme : réessaie demain.";
  if ((USAGE.mois.users[u.id] || 0) >= capM) return "Plafond mensuel de l'IA atteint pour ton compte : écris à l'équipe Mastery si tu en as besoin.";
  return null;
}
function spend(u, tier, usage){
  if (!usage) return; usageReset(); const [pi, po] = priceOf(tier);
  const cost = ((usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0)) * pi / 1e6 + (usage.output_tokens || 0) * po / 1e6 + (usage.cache_read_input_tokens || 0) * pi * 0.1 / 1e6;
  USAGE.users[u.id] = (USAGE.users[u.id] || 0) + cost; USAGE.mois.users[u.id] = (USAGE.mois.users[u.id] || 0) + cost; USAGE.total = (USAGE.total || 0) + cost; saveUsage();
}
const tierOk = t => ["quick", "default", "complex"].includes(t) ? t : "default";
const MAXTOK = {quick:2000, default:8000, complex:12000};
let counter = {day:day(), n:0}; const perIp = new Map(), perUser = new Map();
function allowCall(ip, uid){
  const who = USERS.find(x => x.id === uid); if (who){ const b = budgetLeft(who); if (b) return b; }
  const k = day() + ":" + uid, nu = perUser.get(k) || 0;
  if (nu >= (Number(env("AI_MAX_PER_USER_DAY")) || 1500)) return "Plafond quotidien d'appels IA atteint pour ton compte : réessaie demain.";
  if (perUser.size > 5000) perUser.clear();
  if (counter.day !== day()) counter = {day:day(), n:0};
  if (counter.n >= (Number(env("AI_MAX_PER_DAY")) || 10000)) return "Plafond quotidien d'appels IA atteint.";
  const now = Date.now(), list = (perIp.get(ip) || []).filter(t => now - t < 3600e3);
  if (list.length >= (Number(env("AI_MAX_PER_IP_HOUR")) || 900)) return "Trop d'appels IA depuis cet appareil : réessaie dans une heure.";
  list.push(now); perIp.set(ip, list); counter.n++; perUser.set(k, nu + 1); return null;
}
/* Confidentialité : les noms complets des élèves de l'espace ne partent jamais vers l'IA (remplacés par « l'élève »). */
const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function scrubNames(body, u){
  const names = new Set();
  for (const [k, v] of DOCS) if (k.startsWith("classes/") && isObj(v) && (u.role === "admin" || v.espace === u.espace))
    for (const e of v.eleves || []){ const a = String(e.prenom || "").trim(), b = String(e.nom || "").trim(); if (a && b){ names.add(a + " " + b); names.add(b + " " + a); } }
  if (!names.size || !Array.isArray(body?.messages)) return;
  const list = [...names].sort((x, y) => y.length - x.length).slice(0, 4000);
  const res = []; for (let i = 0; i < list.length; i += 300) res.push(new RegExp("(^|[^\\p{L}])(" + list.slice(i, i + 300).map(reEsc).join("|") + ")(?![\\p{L}])", "giu"));
  const clean = t => res.reduce((acc, re) => acc.replace(re, (m, pre) => pre + "l'élève"), t);
  for (const m of body.messages){
    if (typeof m.content === "string") m.content = clean(m.content);
    else if (Array.isArray(m.content)) for (const c of m.content) if (c && c.type === "text" && typeof c.text === "string") c.text = clean(c.text);
  }
}
async function aiProxy(req, res, u){
  if (!env("ANTHROPIC_API_KEY")) return sendJ(res, 503, {error:{message:"ANTHROPIC_API_KEY manquante sur le serveur"}});
  if (!u) return sendJ(res, 401, {error:{message:"Connexion requise"}});
  let body; try { body = await readJSON(req, 25e6); } catch(e){ return sendJ(res, e.message === "too_large" ? 413 : 400, {error:{message:"Requête invalide"}}); }
  if (!Array.isArray(body?.messages) || body.messages.length > 40) return sendJ(res, 400, {error:{message:"Requête invalide"}});
  if (body?.feature === "exercices" && !entitled(u)) return sendJ(res, 403, {error:{message:"Exercices en ligne non activés pour ce compte (à partir du forfait Essentiel)"}});
  if (!access(u).ok) return sendJ(res, 402, {error:{message:NO_ACCESS, code:"no_access"}});
  /* Numéro de demande : si la page perd la connexion (téléphone verrouillé, changement d'application), elle redemande
     avec le même numéro et reçoit le résultat déjà calculé, sans nouvel appel ni nouveau coût */
  const rid = /^[a-z0-9]{8,40}$/.test(String(body.rid || "")) ? u.id + ":" + body.rid : null;
  if (rid && AIR.has(rid)){ const o = await AIR.get(rid).p; return o.json ? sendJ(res, o.status, o.json) : send(res, o.status, o.txt, TYPES[".json"]); }
  const stop = allowCall(ipOf(req), u.id); if (stop) return sendJ(res, 429, {error:{message:stop}});
  const job = aiCall(body, u); if (rid){ AIR.set(rid, {p:job, at:Date.now()}); job.then(o => { if (o.status !== 200) AIR.delete(rid); }); }
  const o = await job; return o.json ? sendJ(res, o.status, o.json) : send(res, o.status, o.txt, TYPES[".json"]);
}
const AIR = new Map();
setInterval(() => { const old = Date.now() - 20 * 60e3; for (const [k, v] of AIR) if (v.at < old) AIR.delete(k); }, 60e3).unref();
async function aiCall(body, u){
  scrubNames(body, u);
  const tier = tierOk(body?.tier), M = MODELS(), model = M[tier];
  const r = await fetch((env("ANTHROPIC_BASE_URL") || "https://api.anthropic.com") + "/v1/messages", {method:"POST", signal:AbortSignal.timeout(200000),
    headers:{"content-type":"application/json", "x-api-key":env("ANTHROPIC_API_KEY"), "anthropic-version":"2023-06-01"},
    body:JSON.stringify({model, max_tokens:Math.min(+env("AI_MAX_TOKENS") || 32000, MAXTOK[tier]), messages:body.messages})}).catch(() => null);
  if (!r) return {status:502, json:{error:{message:"IA injoignable"}}};
  const txt = await r.text().catch(() => "");
  if (r.ok){ try { const us = JSON.parse(txt).usage; spend(u, tier, us); console.log(`IA ${model} · ${u.id} · entrée ${us?.input_tokens} · sortie ${us?.output_tokens}`); } catch(e){} }
  else console.warn("IA erreur", r.status, txt.slice(0, 300));
  // Clé IA refusée par Anthropic : ce n'est pas la session du professeur (401 le renverrait à la connexion)
  if (r.status === 401 || r.status === 403) return {status:502, json:{error:{message:"Clé IA du serveur refusée : vérifie ANTHROPIC_API_KEY sur Railway."}}};
  return {status:r.status, txt};
}

/* ---------- Correction en arrière-plan (sur le serveur) ----------
   L'application prépare chaque page (QR, découpe des cadres, images envoyées) puis confie la lecture et la correction
   au serveur : elles continuent même si le professeur change d'onglet, ferme l'application ou verrouille son téléphone. */
const JOBS_F = path.join(DATA, "jobs.json"); let JOBS = readJ(JOBS_F, []);
for (const j of JOBS) if (j.status === "en_cours") j.status = "attente";
let jobsTimer = null; const saveJobs = () => { clearTimeout(jobsTimer); jobsTimer = setTimeout(() => writeAtomic(JOBS_F, JOBS), 300); };
const jobPub = j => ({id:j.id, status:j.status, name:j.name, ctrlId:j.ctrlId, eleveId:j.eleveId, page:j.page, msg:j.msg || "", createdAt:j.createdAt, doneAt:j.doneAt || null});
const NO_ANS = /^\s*(je\s*(ne)?\s*sais\s*pas|j'?\s*sais\s*pas|jsp|aucune\s*id[ée]e|pas\s*d'?\s*id[ée]e|je\s*n'?\s*ai\s*pas\s*compris|rien|néant|\?+|-+|\.+|x|i\s*don'?t\s*know|n[ãa]o\s*sei)\s*[.!?]*\s*$/i;
const isNoAns = t => !String(t || "").replace(/\[illisible\]/g, "").replace(/\$/g, "").trim() || NO_ANS.test(String(t).replace(/\$/g, ""));
const halfN = x => Math.round(x * 2) / 2, clampN = (v, a, b) => Math.max(a, Math.min(b, v));
function looseJSON(t){
  try { return JSON.parse(t); } catch(e){}
  const f = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (f){ try { return JSON.parse(f[1]); } catch(e){} }
  const a = t.search(/[\[{]/), b = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]")); if (a >= 0 && b > a){ try { return JSON.parse(t.slice(a, b + 1)); } catch(e){} }
  return null;
}
function markF(t, fautes){ let out = t; for (const f of (Array.isArray(fautes) ? fautes : []).map(String).filter(x => x.trim()).slice(0, 8)){ const i = out.indexOf(f); if (i >= 0 && !out.slice(0, i).endsWith("⟦")) out = out.slice(0, i) + "⟦" + f + "⟧" + out.slice(i + f.length); } return out; }
function jobAnswers(j, res){
  const T = j.txt || {}, arr = Array.isArray(res?.reponses) ? res.reponses : Array.isArray(res) ? res : [], answers = {}, missing = [];
  for (const q of j.qs || []){
    const r0 = arr.find(x => x && String(x.id) === String(q.id));
    /* Question absente de la réponse de l'IA : on ne met surtout pas 0, on la signale pour relecture */
    if (!r0){ missing.push(q.id); continue; }
    const r = r0; let ans;
    if (q.type === "qcm"){ const L = "ABCDEFGH", good = new Set((q.good || []).map(Number)), got = [...new Set((r.coches || []).map(Number))].sort(), ok = got.length === good.size && got.every(n => good.has(n));
      ans = {transcription:(T.coche || "Coché : ") + (got.map(n => L[n]).join(", ") || T.aucune || "aucune case"), annot:(T.coche || "Coché : ") + (got.map(n => good.has(n) ? L[n] : `⟦${L[n]}⟧`).join(", ") || `⟦${T.aucune || "aucune case"}⟧`),
        lisible:r.lisible !== false, noteIA:ok ? +q.points : 0, note:null, commentaire:ok ? (T.bonne || "Bonne réponse.") : (T.etait || "La bonne réponse était : ") + [...good].sort().map(n => L[n]).join(", ") + ".",
        erreurs:ok ? [] : [T.qcmFaux || "réponse QCM incorrecte"], acquis:ok ? [q.notion || "QCM"] : [], valide:false, auto:true}; }
    else { const tr = String(r.transcription ?? "");
      ans = {transcription:tr, transcriptionIA:tr, annot:r.annotee != null ? String(r.annotee) : markF(tr, r.fautes), lisible:r.lisible !== false, noteIA:clampN(halfN(Number(r.note) || 0), 0, +q.points), note:null,
        commentaire:String(r.commentaire ?? ""), erreurs:(r.erreurs || []).map(String).slice(0, 4), acquis:(r.acquis || []).map(String).slice(0, 4), valide:false};
      if (isNoAns(tr)){ ans.noteIA = 0; ans.commentaire = T.vide || "Pas de réponse : revois cette notion."; ans.erreurs = [T.videTag || "pas de réponse"]; ans.acquis = []; } }
    ans.crop = q.crop || null; answers[q.id] = ans;
  }
  return {answers, missing, lisibleKo:arr.some(r => r && r.lisible === false)};
}
/* Une copie déjà validée (ou une note posée par le professeur) n'est pas écrasée par un nouveau passage de l'IA */
function keepTeacher(cur, eid, answers){
  const cp = cur?.copies?.[eid], out = {}; let kept = 0;
  for (const [qid, a] of Object.entries(answers)){
    const old = cp?.answers?.[qid];
    if (cp?.validee || old?.valide){ kept++; continue; }
    if (old && old.note != null){ const {note, ...rest} = a; out[qid] = rest; kept++; } else out[qid] = a;
  }
  return {answers:out, kept, validee:!!cp?.validee};
}
async function runJob(j){
  const u = USERS.find(x => x.id === j.user); if (!u){ j.status = "erreur"; j.msg = "Compte introuvable"; return; }
  if (!access(u).ok){ j.status = "erreur"; j.msg = NO_ACCESS; return; }
  const stop = allowCall("job:" + u.id, u.id); if (stop){ j.status = "erreur"; j.msg = stop; return; }
  const content = [];
  for (const id of j.images || []){ const f = path.join(FILEDIR, id + ".jpg"); if (!fs.existsSync(f)){ j.status = "erreur"; j.msg = "Image introuvable"; return; }
    content.push({type:"image", source:{type:"base64", media_type:"image/jpeg", data:fs.readFileSync(f).toString("base64")}}); }
  content.push({type:"text", text:String(j.prompt || "")});
  const body = {messages:[{role:"user", content}]}; scrubNames(body, u);
  const tier = tierOk(j.tier), M = MODELS(), model = M[tier];
  const r = await fetch((env("ANTHROPIC_BASE_URL") || "https://api.anthropic.com") + "/v1/messages", {method:"POST", signal:AbortSignal.timeout(240000),
    headers:{"content-type":"application/json", "x-api-key":env("ANTHROPIC_API_KEY"), "anthropic-version":"2023-06-01"},
    body:JSON.stringify({model, max_tokens:Math.min(+env("AI_MAX_TOKENS") || 32000, MAXTOK[tier]), messages:body.messages})}).catch(e => null);
  if (!r || r.status === 429 || r.status >= 500){ j.tries = (j.tries || 0) + 1; j.status = j.tries >= 4 ? "erreur" : "attente"; j.msg = j.tries >= 4 ? "IA indisponible, relance plus tard" : "Nouvel essai bientôt"; j.notBefore = Date.now() + 20000 * j.tries; return; }
  const txt = await r.text(); let jr = null; try { jr = JSON.parse(txt); } catch(e){}
  if (!r.ok){ j.status = "erreur"; j.msg = "IA : " + (jr?.error?.message || r.status); console.warn("Tâche IA", r.status, txt.slice(0, 200)); return; }
  spend(u, tier, jr?.usage); console.log(`IA (tâche) ${model} · ${u.id} · entrée ${jr?.usage?.input_tokens} · sortie ${jr?.usage?.output_tokens}`);
  const res = looseJSON((jr?.content || []).filter(b => b.type === "text").map(b => b.text).join(""));
  if (!res){ j.tries = (j.tries || 0) + 1; j.status = j.tries >= 3 ? "erreur" : "attente"; j.msg = "Réponse de l'IA illisible"; return; }
  if (j.status === "annule" || cancelled(j.ctrlId, j.eleveId, j.createdAt)){ j.status = "annule"; j.msg = "Annulée (scan recommencé)"; return; }
  const dp = "feuilles/" + j.ctrlId, cur = DOCS.get(dp); if (!cur){ j.status = "erreur"; j.msg = "Feuilles du contrôle introuvables"; return; }
  if (j.status === "annule" || cancelled(j.ctrlId, j.eleveId, j.createdAt)){ j.status = "annule"; j.msg = "Annulée (scan recommencé)"; return; }
  const jr0 = jobAnswers(j, res);
  if (jr0.missing.length && (j.tries || 0) < 2){ j.tries = (j.tries || 0) + 1; j.status = "attente"; j.msg = "Réponse de l'IA incomplète : nouvel essai"; j.notBefore = Date.now() + 5000; return; }
  const kt = keepTeacher(cur, j.eleveId, jr0.answers), answers = kt.answers, lisibleKo = jr0.lisibleKo;
  const patch = {copies:{[j.eleveId]:kt.validee ? {answers} : {answers, validee:false}}};
  if (String(res?.alerte || "").trim()) patch.copies[j.eleveId].alertes = {[j.page]:{txt:String(res.alerte).trim().slice(0, 600), at:new Date().toISOString()}};   // écrit inquiétant : signalé au seul professeur
  if (j.bonus) patch.copies[j.eleveId].bonusPages = {[j.page]:{proprete:clampN(+res?.proprete || 0, 0, 1), orthographe:clampN(+res?.orthographe || 0, 0, 1)}};
  persist(dp, merge(cur, patch));
  j.status = jr0.missing.length ? "erreur" : "fait"; j.doneAt = new Date().toISOString();
  j.msg = kt.validee ? "Copie déjà validée : rien n'a été modifié (« Recommencer le scan » pour la refaire)" : Object.keys(answers).length + " question(s) corrigée(s)" + (lisibleKo ? " · passage peu lisible signalé" : "") + (kt.kept ? " · " + kt.kept + " note(s) du professeur gardée(s)" : "")
    + (jr0.missing.length ? " · " + jr0.missing.length + " question(s) non lue(s) : recadre-les ou relance" : "");
  if (!jr0.missing.length){ delete j.prompt; delete j.qs; }
}
/* ---------- Génération en arrière-plan (sur le serveur) ----------
   Nouveau contrôle, dictée, régénération, variante, rattrapage : l'application prépare la consigne, puis le serveur fait tout
   (appel à l'IA, suite si la réponse est coupée, vérification des doublons, enregistrement du document). Le professeur peut
   fermer l'application ou verrouiller son téléphone : le résultat l'attend, et une notification s'affiche à son retour. */
const GENS_F = path.join(DATA, "gens.json"); let GENS = readJ(GENS_F, []);
let gensTimer = null; const saveGens = () => { clearTimeout(gensTimer); gensTimer = setTimeout(() => writeAtomic(GENS_F, GENS), 300); };
const genPub = j => ({id:j.id, status:j.status, label:j.label, open:j.open || null, msg:j.msg || "", seen:!!j.seen, createdAt:j.createdAt, doneAt:j.doneAt || null});
const LVLS = ["socle", "standard", "approfondi"];
function genQ(x){
  const id = "q" + crypto.randomBytes(4).toString("hex").slice(0, 5), qcm = x?.type === "qcm";
  const one = y => { const o = {enonce:String(y?.enonce || ""), corrige:String(y?.corrige || ""), criteres:String(y?.criteres || "")};
    if (qcm){ o.choix = (Array.isArray(y?.choix) ? y.choix : []).map(String).slice(0, 6); o.bonnes = (Array.isArray(y?.bonnes) ? y.bonnes : []).map(Number).filter(n => n >= 0 && n < o.choix.length);
      o.corrige = "Bonne(s) réponse(s) : " + o.bonnes.map(n => "ABCDEF"[n]).join(", "); o.criteres = "Tout ou rien."; } return o; };
  const v = isObj(x?.versions) ? Object.fromEntries(LVLS.filter(l => isObj(x.versions[l])).map(l => [l, one(x.versions[l])])) : {standard:one(x)};
  if (!v.standard) v.standard = Object.values(v)[0] || one({});
  return {id, ...(qcm ? {type:"qcm"} : {}), notion:String(x?.notion || "").slice(0, 120), comps:COMPK.filter(k => (Array.isArray(x?.competences) ? x.competences : []).map(c => String(c).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")).includes(k)).slice(0, 2), points:+x?.points || 4, lignes:clampN(+x?.lignes || 6, 1, 30), erreurs:(Array.isArray(x?.erreurs) ? x.erreurs : []).map(String).slice(0, 5), v};
}
const COMPK = ["connaitre", "comprendre", "raisonner", "lire", "ecrire"];
const stdOf = q => q.v.standard?.enonce ? q.v.standard : Object.values(q.v).find(y => y?.enonce) || {enonce:"", corrige:""};
const tokOf = t => new Set(String(t).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9֐-׿ ]+/g, " ").split(/\s+/).filter(x => x.length > 3).map(x => x.slice(0, 5)));
const closeTo = (a, b, seuil) => { const A = tokOf(a), B = tokOf(b); if (!A.size || !B.size) return false; return [...A].filter(x => B.has(x)).length / Math.min(A.size, B.size) >= seuil; };
async function genAI(u, prompt, tier){
  const stop = allowCall("gen:" + u.id, u.id); if (stop) throw new Error(stop);
  let o = null;
  for (let k = 0; k < 3; k++){ o = await aiCall({tier, messages:[{role:"user", content:[{type:"text", text:prompt + "\n\n(Réponds uniquement avec le JSON demandé, sans texte autour.)"}]}]}, u);
    if (o.status === 200 || (o.status !== 429 && o.status < 500)) break; await new Promise(r => setTimeout(r, 8000 * (k + 1))); }
  if (o.status !== 200) throw new Error(o.json?.error?.message || "IA indisponible (" + o.status + ")");
  const jr = JSON.parse(o.txt || "{}"), txt = (jr.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  const res = looseJSON(txt); if (!res) throw new Error("Réponse de l'IA illisible"); return res;
}
async function dupCheck(u, news, olds){
  if (!news.length || (!olds.length && news.length < 2)) return [];
  let sem = [], ok = false;
  try { const r = await genAI(u, `Tu contrôles qu'une feuille ne répète pas un contrôle.
QUESTIONS DÉJÀ POSÉES :
${olds.map((o, k) => `A${k + 1}. ${String(o.enonce).slice(0, 300)} → réponse attendue : ${String(o.corrige || "").slice(0, 200)}`).join("\n") || "(aucune)"}

NOUVELLES QUESTIONS :
${news.map((n, k) => `N${k + 1}. ${String(n.enonce).slice(0, 300)} → réponse attendue : ${String(n.corrige || "").slice(0, 200)}`).join("\n")}

Une nouvelle question est un DOUBLON si elle demande la même information ou attend pour l'essentiel la même réponse qu'une question déjà posée, OU qu'une autre nouvelle question placée avant elle, même formulée autrement (reformulation, vrai/faux, texte à trous, QCM, mise en situation qui revient à réciter la même chose). Elle n'est PAS un doublon si elle porte sur la même notion mais demande un autre élément, une application nouvelle ou une explication différente.
Sois exigeant : un professeur doit trouver chaque question vraiment différente des autres.
Réponds uniquement en JSON : {"doublons":[numéros N des nouvelles questions en doublon]}`, GEN_TIER());
    sem = (Array.isArray(r?.doublons) ? r.doublons : []).map(x => +String(x).replace(/\D/g, "") - 1).filter(i => i >= 0 && i < news.length); ok = Array.isArray(r?.doublons); } catch(e){ console.warn("Doublons", e.message); }
  const sl = ok ? 0.85 : 0.6, lex = news.map((n, i) => olds.some(o => closeTo(n.enonce, o.enonce, sl)) || news.slice(0, i).some(o => closeTo(n.enonce, o.enonce, sl)) ? i : -1).filter(i => i >= 0);
  return [...new Set([...lex, ...sem])].sort((a, b) => a - b);
}
async function runGen(j){
  const u = USERS.find(x => x.id === j.user); if (!u) throw new Error("Compte introuvable");
  if (!access(u).ok) throw new Error(NO_ACCESS);
  let res = await genAI(u, j.prompt, j.tier); const titreIA = typeof res?.titre === "string" ? res.titre : "", manque = typeof res?.manque === "string" ? res.manque.trim() : "";
  let qs = (Array.isArray(res?.questions) ? res.questions : []).map(genQ);
  /* Réponse coupée (trop longue) : on demande la suite */
  for (let k = 0; k < 3 && j.n && !manque && qs.length && qs.length < j.n; k++){
    const reste = j.n - qs.length, deja = qs.map(q => stdOf(q).enonce).join(" / ").slice(0, 3000);
    const r2 = await genAI(u, j.prompt + `\n\nCe contrôle contient déjà ces questions : ${deja}\nRédige UNIQUEMENT les ${reste} question(s) qui manquent, sur d'autres notions, avec le même format JSON.`, j.tier);
    const add = (Array.isArray(r2?.questions) ? r2.questions : []).map(genQ); if (!add.length) break; qs = qs.concat(add.slice(0, reste)); }
  if (j.n) qs = qs.slice(0, j.n);
  if (!qs.length) throw new Error("L'IA n'a proposé aucune question : réessaie.");
  /* Doublons d'une question déjà posée : remplacés (deux essais) */
  if ((Array.isArray(j.olds) && j.olds.length) || j.check) for (let k = 0; k < 2; k++){
    const dup = await dupCheck(u, qs.map(stdOf), j.olds || []); if (!dup.length) break;
    const refus = dup.map(i => stdOf(qs[i]).enonce), garde = qs.filter((q, i) => !dup.includes(i)).map(q => stdOf(q).enonce);
    const r3 = await genAI(u, j.prompt + `\n\nCORRECTION : ces questions de ta réponse sont refusées car elles répètent une question déjà posée ou une autre question de la feuille : ${refus.map(t => "« " + t.slice(0, 200) + " »").join(" / ")}.${garde.length ? `\nQuestions gardées dans la feuille (à ne pas répéter non plus) : ${garde.map(t => "« " + t.slice(0, 200) + " »").join(" / ")}.` : ""}\nRédige UNIQUEMENT ${dup.length} nouvelle(s) question(s) pour les remplacer (questions n° ${dup.map(i => i + 1).join(", ")} de ta réponse : même notion et mêmes points), chacune sur un angle que la feuille n'utilise pas encore, en respectant toutes les règles ci-dessus. Même format JSON.`, j.tier);
    const add = (Array.isArray(r3?.questions) ? r3.questions : []).map(genQ).slice(0, dup.length);
    dup.forEach((i, m) => { if (add[m]){ add[m].points = qs[i].points; qs[i] = add[m]; } }); }
  if (Array.isArray(j.points)) qs.forEach((q, i) => { if (j.points[i] != null) q.points = +j.points[i]; if (j.lignes?.[i]) q.lignes = +j.lignes[i]; });
  const dp = j.path, cur = DOCS.get(dp);
  if (!canWrite(u, dp)) throw new Error("Ce contrôle appartient à un autre professeur");
  const tIA = /rattrapage/i.test(j.titre?.prefixe || "") ? titreIA.replace(/^(feuille de |fiche de )?rattrapage\s*[-:·–]?\s*/i, "") : titreIA;
  const titre = j.titre?.fixe || (tIA ? (j.titre?.prefixe || "") + tIA + (j.titre?.suffixe || "") : "") || j.titre?.defaut || "Contrôle";
  if (j.mode === "update"){ if (!cur) throw new Error("Contrôle introuvable");
    persist(dp, {...cur, questions:qs, ...(j.titre?.ia && titreIA ? {titre:titreIA} : j.titre?.fixe ? {titre:j.titre.fixe} : {}), ...(manque ? {remarques:[manque]} : {})}); }
  else { const base = isObj(j.base) ? j.base : {};
    const rem = [...(j.remarques && Array.isArray(res?.remarques) ? res.remarques.map(String).filter(Boolean) : []), ...(manque ? [manque] : [])].slice(0, 12);
    persist(dp, {...base, titre, questions:qs, ...(rem.length || j.remarques ? {remarques:rem} : {}), owner:u.id, espace:espaceFor(dp, u), createdAt:new Date().toISOString()}); }
  j.open = j.openHash || ("#/controle/" + dp.split("/")[1] + "/preparer");
  j.msg = (j.msgOk || "Prêt") + (j.mode === "update" ? "" : " : « " + titre + " »") + "." + (manque ? " Le cours ne suffit pas pour plus de questions vraiment différentes : regarde « À vérifier »." : "");
}
let gensRunning = 0;
async function pumpGens(){
  while (gensRunning < (+env("AI_GEN_PARALLEL") || 4)){
    const j = GENS.find(x => x.status === "attente"); if (!j) break;
    j.status = "en_cours"; gensRunning++; saveGens();
    runGen(j).then(() => { j.status = "fait"; j.doneAt = new Date().toISOString(); delete j.prompt; delete j.base; delete j.olds; })
      .catch(e => { j.status = "erreur"; j.msg = String(e?.message || e).slice(0, 300); console.warn("Génération", j.id, j.msg); })
      .finally(() => { gensRunning--; saveGens(); setTimeout(pumpGens, 50); });
  }
  const old = Date.now() - 7 * 864e5, n = GENS.length; GENS = GENS.filter(j => j.status === "attente" || j.status === "en_cours" || Date.parse(j.createdAt) > old); if (GENS.length !== n) saveGens();
}
for (const j of GENS) if (j.status === "en_cours") j.status = "attente";
setInterval(pumpGens, 5000); setTimeout(pumpGens, 2000);
async function genApi(req, res, p, u){
  if (!u) return sendJ(res, 401, {error:{message:"Connexion requise"}});
  if (p === "/api/gen" && req.method === "GET") return sendJ(res, 200, {gens:GENS.filter(j => j.user === u.id).slice(-40).map(genPub)});
  if (p === "/api/gen" && req.method === "POST"){
    if (!env("ANTHROPIC_API_KEY")) return sendJ(res, 503, {error:{message:"IA non configurée"}});
    if (!access(u).ok) return sendJ(res, 402, {error:{message:NO_ACCESS, code:"no_access"}});
    const b = await readJSON(req, 2e6) || {};
    if (b.feature === "exercices" && !entitled(u)) return sendJ(res, 403, {error:{message:"Exercices en ligne non activés pour ce compte (à partir du forfait Essentiel)"}});
    const dp = String(b.path || ""); if (!/^controles\/[A-Za-z0-9_-]{4,40}$/.test(dp) || !canWrite(u, dp)) return sendJ(res, 400, {error:{message:"Tâche invalide"}});
    if (GENS.filter(j => j.user === u.id && (j.status === "attente" || j.status === "en_cours")).length >= 12) return sendJ(res, 429, {error:{message:"Trop de générations en cours : attends qu'une se termine."}});
    const j = {id:crypto.randomBytes(8).toString("hex"), user:u.id, status:"attente", createdAt:new Date().toISOString(), label:String(b.label || "Génération").slice(0, 160),
      prompt:String(b.prompt || "").slice(0, 120000), tier:GEN_TIER(), check:!!b.check, n:clampN(+b.n || 0, 0, 12), path:dp, mode:b.mode === "update" ? "update" : "create",
      base:isObj(b.base) ? b.base : null, titre:isObj(b.titre) ? {fixe:String(b.titre.fixe || "").slice(0, 200), prefixe:String(b.titre.prefixe || "").slice(0, 60), suffixe:String(b.titre.suffixe || "").slice(0, 60), defaut:String(b.titre.defaut || "").slice(0, 200), ia:!!b.titre.ia} : null,
      remarques:!!b.remarques, points:Array.isArray(b.points) ? b.points.slice(0, 12).map(Number) : null, lignes:Array.isArray(b.lignes) ? b.lignes.slice(0, 12).map(Number) : null,
      olds:(Array.isArray(b.olds) ? b.olds : []).slice(0, 60).map(o => ({enonce:String(o?.enonce || "").slice(0, 600), corrige:String(o?.corrige || "").slice(0, 400)})).filter(o => o.enonce),
      msgOk:String(b.msgOk || "Prêt").slice(0, 120), openHash:/^#\/[\w\/-]{1,80}$/.test(b.open || "") ? b.open : null};
    if (!j.prompt) return sendJ(res, 400, {error:{message:"Tâche vide"}});
    GENS.push(j); saveGens(); setTimeout(pumpGens, 10); return sendJ(res, 200, {gen:genPub(j)});
  }
  const m = p.match(/^\/api\/gen\/([a-f0-9]{16})\/vu$/);
  if (m && req.method === "POST"){ const j = GENS.find(x => x.id === m[1] && x.user === u.id); if (j){ j.seen = true; saveGens(); } return sendJ(res, 200, {}); }
  return sendJ(res, 404, {error:{message:"Route inconnue"}});
}
/* « Recommencer le scan » : ce qui était en route pour ce contrôle (ou cet élève) avant la remise à zéro est abandonné */
const CANCEL = {};
const cancelled = (cid, eid, at) => { const t = Math.max(CANCEL[cid] || 0, CANCEL[cid + "|" + eid] || 0); return t && Date.parse(at) <= t; };
let jobsRunning = 0;
async function pumpJobs(){
  const now = Date.now(), MAX = +env("AI_JOBS_PARALLEL") || 3;
  while (jobsRunning < MAX){
    const j = JOBS.find(x => x.status === "attente" && (!x.notBefore || x.notBefore <= now)); if (!j) break;
    j.status = "en_cours"; jobsRunning++; saveJobs();
    runJob(j).catch(e => { j.status = "erreur"; j.msg = "Erreur : " + e.message; }).finally(() => { jobsRunning--; saveJobs(); setTimeout(pumpJobs, 50); });
  }
  const old = Date.now() - 3 * 864e5; const n = JOBS.length; JOBS = JOBS.filter(j => !(j.status !== "attente" && j.status !== "en_cours" && Date.parse(j.createdAt) < old)); if (JOBS.length !== n) saveJobs();
}
setInterval(pumpJobs, 3000);
async function jobsApi(req, res, url, p, u){
  if (!u) return sendJ(res, 401, {error:{message:"Connexion requise"}});
  if (p === "/api/jobs" && req.method === "GET"){ const since = Date.now() - 864e5;
    return sendJ(res, 200, {jobs:JOBS.filter(j => j.user === u.id && (Date.parse(j.createdAt) > since || j.status === "attente" || j.status === "en_cours")).map(jobPub)}); }
  if (p === "/api/jobs" && req.method === "POST"){
    if (!env("ANTHROPIC_API_KEY")) return sendJ(res, 503, {error:{message:"IA non configurée"}});
    if (!access(u).ok) return sendJ(res, 402, {error:{message:NO_ACCESS, code:"no_access"}});
    const b = await readJSON(req, 2e6) || {};
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(String(b.ctrlId || "")) || !/^[A-Za-z0-9_-]{2,40}$/.test(String(b.eleveId || ""))) return sendJ(res, 400, {error:{message:"Tâche invalide"}});
    if (!canWrite(u, "feuilles/" + b.ctrlId)) return sendJ(res, 403, {error:{message:"Ce contrôle appartient à un autre professeur"}});
    if (JOBS.filter(j => j.user === u.id && (j.status === "attente" || j.status === "en_cours")).length > 400) return sendJ(res, 429, {error:{message:"Trop de pages en attente"}});
    const j = {id:crypto.randomBytes(8).toString("hex"), user:u.id, status:"attente", createdAt:new Date().toISOString(), name:String(b.name || "").slice(0, 120),
      ctrlId:b.ctrlId, eleveId:b.eleveId, page:Math.max(1, +b.page || 1), prompt:String(b.prompt || "").slice(0, 60000), tier:GRADE_TIER(),
      images:(Array.isArray(b.images) ? b.images : []).filter(x => /^[a-z0-9]{8,40}$/.test(x) && canSeeFile(u, x)).slice(0, 12), bonus:!!b.bonus, txt:isObj(b.txt) ? b.txt : {},
      qs:(Array.isArray(b.qs) ? b.qs : []).slice(0, 40).map(q => ({id:String(q.id), points:+q.points || 0, type:q.type === "qcm" ? "qcm" : "", good:Array.isArray(q.good) ? q.good.map(Number) : [], notion:String(q.notion || "").slice(0, 80), crop:/^[a-z0-9]{8,40}$/.test(q.crop || "") ? q.crop : null}))};
    if (!j.images.length || !j.qs.length) return sendJ(res, 400, {error:{message:"Tâche vide"}});
    JOBS.push(j); saveJobs(); setTimeout(pumpJobs, 10); return sendJ(res, 200, {id:j.id});
  }
  const m = p.match(/^\/api\/jobs\/([a-f0-9]{16})\/retry$/);
  if (m && req.method === "POST"){ const j = JOBS.find(x => x.id === m[1] && x.user === u.id); if (!j || !j.prompt) return sendJ(res, 404, {error:{message:"Tâche introuvable"}}); j.status = "attente"; j.tries = 0; j.msg = ""; saveJobs(); setTimeout(pumpJobs, 10); return sendJ(res, 200, {}); }
  if (p === "/api/jobs/cancel" && req.method === "POST"){ const b = await readJSON(req, 2e3) || {}; const cid = String(b.ctrlId || ""), eid = b.eleveId ? String(b.eleveId) : "";
    if (!canWrite(u, "feuilles/" + cid)) return sendJ(res, 403, {error:{message:"Ce contrôle appartient à un autre professeur"}});
    const now = Date.now(); CANCEL[eid ? cid + "|" + eid : cid] = now; let n = 0;
    for (const j of JOBS) if (j.ctrlId === cid && (!eid || j.eleveId === eid) && (j.status === "attente" || j.status === "en_cours")){ j.status = "annule"; j.msg = "Annulée (scan recommencé)"; n++; }
    saveJobs(); return sendJ(res, 200, {annulees:n}); }
  if (p === "/api/jobs/clear" && req.method === "POST"){ JOBS = JOBS.filter(j => j.user !== u.id || j.status === "attente" || j.status === "en_cours"); saveJobs(); return sendJ(res, 200, {}); }
  return sendJ(res, 404, {error:{message:"Route inconnue"}});
}

/* ---------- Dépôt de copies analysé sur le serveur ----------
   Le professeur envoie le fichier tel quel (PDF du copieur, photos) : c'est tout ce qui demande l'application ouverte.
   Le serveur le découpe en pages, les identifie, découpe les cadres et lance la correction. */
let ENGINE = null; try { ENGINE = require("./scan-engine.js"); } catch(e){ console.warn("Analyse serveur indisponible (npm install ?) :", e.message); }
const LOTDIR = path.join(DATA, "lots"); fs.mkdirSync(LOTDIR, {recursive:true});
const LOTS_F = path.join(DATA, "lots.json"); let LOTS = readJ(LOTS_F, []);
for (const l of LOTS) if (l.status === "analyse") l.status = "attente";
let lotsTimer = null; const saveLots = () => { clearTimeout(lotsTimer); lotsTimer = setTimeout(() => writeAtomic(LOTS_F, LOTS), 400); };
const lotPub = l => ({id:l.id, name:l.name, status:l.status, total:l.total || 0, done:Object.keys(l.pages || {}).length, msg:l.msg || "", createdAt:l.createdAt,
  pages:Object.entries(l.pages || {}).filter(([, r]) => r.status !== "serveur" && r.status !== "fait").map(([i, r]) => ({i:+i, status:r.status, msg:r.msg || "", cid:r.cid || null, eid:r.eid || null})),
  jobs:Object.values(l.pages || {}).map(r => r.job).filter(Boolean)});
async function claude(u, content, tier, maxTok){
  const stop = allowCall("lot:" + u.id, u.id); if (stop){ const e = new Error(stop); e.quota = true; throw e; }
  const body = {messages:[{role:"user", content}]}; scrubNames(body, u);
  tier = tierOk(tier); const M = MODELS(), model = M[tier];
  const r = await fetch((env("ANTHROPIC_BASE_URL") || "https://api.anthropic.com") + "/v1/messages", {method:"POST", signal:AbortSignal.timeout(120000),
    headers:{"content-type":"application/json", "x-api-key":env("ANTHROPIC_API_KEY"), "anthropic-version":"2023-06-01"},
    body:JSON.stringify({model, max_tokens:maxTok || 1000, messages:body.messages})});
  const txt = await r.text(); let j = null; try { j = JSON.parse(txt); } catch(e){}
  if (!r.ok) throw new Error("IA " + r.status + " " + (j?.error?.message || ""));
  spend(u, tier, j?.usage);
  return (j?.content || []).filter(b => b.type === "text").map(b => b.text).join("");
}
let lotRunning = false;
async function pumpLots(){
  if (lotRunning || !ENGINE) return; const l = LOTS.find(x => x.status === "attente" && x.file); if (!l) return;
  const u = USERS.find(x => x.id === l.user); if (!u){ l.status = "erreur"; l.msg = "Compte introuvable"; saveLots(); return; }
  lotRunning = true; l.status = "analyse"; l.pages = l.pages || {}; saveLots();
  let kit = {}; try { kit = JSON.parse(fs.readFileSync(path.join(LOTDIR, l.id + ".kit.json"), "utf8")); } catch(e){}
  const ctx = {kit, user:u,
    doc:p => DOCS.get(p),
    controls:() => [...DOCS.keys()].filter(k => k.startsWith("feuilles/") && visible(u, DOCS.get(k))).map(k => k.slice(9)),
    allowed:cid => canWrite(u, "feuilles/" + cid),
    saveAsset:async buf => { const id = crypto.randomBytes(10).toString("hex"); fs.writeFileSync(path.join(FILEDIR, id + ".jpg"), buf); setOwner(id, u); return id; },
    patch:(dp, upd) => { const cid = dp.split("/")[1], eid = Object.keys(upd.copies || {})[0]; if (cancelled(cid, eid, l.createdAt)) return; const cur = DOCS.get(dp); if (cur) persist(dp, merge(cur, upd)); },
    addJob:b => { if (cancelled(b.ctrlId, b.eleveId, l.createdAt)) return null; const j = {id:crypto.randomBytes(8).toString("hex"), user:u.id, status:"attente", createdAt:new Date().toISOString(), name:l.name, lot:l.id,
      ctrlId:b.ctrlId, eleveId:b.eleveId, page:b.page, prompt:b.prompt, tier:GRADE_TIER(), images:b.images, bonus:b.bonus, txt:b.txt, qs:b.qs}; JOBS.push(j); saveJobs(); setTimeout(pumpJobs, 10); return j.id; },
    footerAI:async jpg => looseJSON(await claude(u, [{type:"image", source:{type:"base64", media_type:"image/jpeg", data:jpg.toString("base64")}}, {type:"text", text:String(kit.footerPrompt || "")}], "quick", 300)),
    setTotal:n => { l.total = n; saveLots(); },
    done:i => !!l.pages[i],
    pageDone:(i, r) => { l.pages[i] = {status:r.status, msg:r.msg || "", cid:r.cid, eid:r.eid, page:r.page, job:r.job || null}; saveLots(); }};
  try {
    const buf = fs.readFileSync(path.join(LOTDIR, l.id + ".bin"));
    await ENGINE.analyseFile(buf, l.mime, ctx);
    l.status = "fini";
  } catch(e){ console.warn("Lot", l.id, e.message); l.status = e.quota ? "attente" : "erreur"; l.msg = e.message; if (e.quota) l.notBefore = Date.now() + 3600e3; }
  finally { lotRunning = false; saveLots(); setTimeout(pumpLots, 100); }
}
setInterval(() => { const now = Date.now(); for (const l of LOTS) if (l.notBefore && l.notBefore <= now) delete l.notBefore; pumpLots();
  const old = now - 3 * 864e5; for (const l of LOTS.filter(x => Date.parse(x.createdAt) < old && x.status !== "attente" && x.status !== "analyse")){ for (const ext of [".bin", ".kit.json"]) fs.rmSync(path.join(LOTDIR, l.id + ext), {force:true}); }
  const n = LOTS.length; LOTS = LOTS.filter(x => !(Date.parse(x.createdAt) < old && x.status !== "attente" && x.status !== "analyse")); if (LOTS.length !== n) saveLots(); }, 5000);
async function lotsApi(req, res, url, p, u){
  if (!u) return sendJ(res, 401, {error:{message:"Connexion requise"}});
  if (p === "/api/lots" && req.method === "GET"){ const since = Date.now() - 864e5;
    return sendJ(res, 200, {lots:LOTS.filter(l => l.user === u.id && (Date.parse(l.createdAt) > since || l.status === "attente" || l.status === "analyse")).map(lotPub)}); }
  if (p === "/api/lots" && req.method === "POST"){
    if (!ENGINE || !env("ANTHROPIC_API_KEY")) return sendJ(res, 503, {error:{message:"Analyse serveur indisponible"}});
    if (!access(u).ok) return sendJ(res, 402, {error:{message:NO_ACCESS, code:"no_access"}});
    const b = await readJSON(req, 30e6) || {};
    const l = {id:crypto.randomBytes(8).toString("hex"), user:u.id, status:"envoi", name:String(b.name || "copies").slice(0, 120), mime:String(b.mime || "").slice(0, 60), createdAt:new Date().toISOString(), pages:{}};
    fs.writeFileSync(path.join(LOTDIR, l.id + ".kit.json"), JSON.stringify(isObj(b.kit) ? b.kit : {}));
    LOTS.push(l); saveLots(); return sendJ(res, 200, {id:l.id});
  }
  const m = p.match(/^\/api\/lots\/([a-f0-9]{16})(\/file)?$/); const l = m && LOTS.find(x => x.id === m[1] && x.user === u.id);
  if (m && !l) return sendJ(res, 404, {error:{message:"Dépôt introuvable"}});
  if (m && m[2] && req.method === "PUT"){
    const buf = await readBody(req, 120e6); if (buf.length < 100) return sendJ(res, 400, {error:{message:"Fichier vide"}});
    fs.writeFileSync(path.join(LOTDIR, l.id + ".bin"), buf); l.file = true; l.status = "attente"; saveLots(); setTimeout(pumpLots, 10); return sendJ(res, 200, {});
  }
  if (m && m[2] && req.method === "GET"){ const f = path.join(LOTDIR, l.id + ".bin"); if (!fs.existsSync(f)) return send(res, 404, "Introuvable");
    res.writeHead(200, {"Content-Type":l.mime || "application/octet-stream"}); return pipeFile(f, res); }
  return sendJ(res, 404, {error:{message:"Route inconnue"}});
}

/* ---------- Routes ---------- */
/* Sécurité : si aucun compte n'existe (ex. données perdues sans Volume), recrée l'administrateur depuis ADMIN_EMAIL / ADMIN_PASSWORD */
if (!USERS.length && validEmail(env("ADMIN_EMAIL").toLowerCase()) && env("ADMIN_PASSWORD").length >= 8){
  const aid = crypto.randomBytes(8).toString("hex");
  USERS.push({id:aid, espace:aid, email:env("ADMIN_EMAIL").toLowerCase(), nom:env("ADMIN_NAME") || "Admin", role:"admin", plan:"pro", options:{exercices:true}, affichage:"les2", pw:hashPw(env("ADMIN_PASSWORD")), createdAt:new Date().toISOString()});
  saveUsers(); console.log("Compte administrateur créé depuis ADMIN_EMAIL");
}

/* Mot de passe administrateur oublié : mettre ADMIN_EMAIL + ADMIN_RESET_PASSWORD (8 caractères min.) dans Railway.
   Au redémarrage, ce compte reçoit ce mot de passe provisoire et devra en choisir un nouveau à la connexion.
   Appliqué une seule fois par valeur : on peut retirer la variable ensuite (conseillé). */
{ const em = env("ADMIN_EMAIL").toLowerCase(), rp = env("ADMIN_RESET_PASSWORD");
  if (em && rp.length >= 8){ const u = USERS.find(x => x.email === em), tag = crypto.createHash("sha256").update(rp).digest("hex").slice(0, 16);
    if (!u) console.log("ADMIN_RESET_PASSWORD : aucun compte avec ADMIN_EMAIL");
    else if (u.resetTag !== tag){ u.pw = hashPw(rp); u.mustChange = true; u.resetTag = tag; u.actif = true; if (u.role !== "admin") u.role = "admin"; saveUsers(); console.log("Mot de passe administrateur réinitialisé pour", em); } } }

/* ---------- Banque d'écriture : copies manuscrites anonymisées (image du cadre + texte validé) ----------
   Sert à mesurer la précision de lecture de l'IA et à lui donner des aides de lecture (erreurs fréquentes, règles de l'admin).
   Aucun nom d'élève : seulement l'image du cadre de réponse, le texte, la matière, la langue et le niveau. */
const BANQUE_F = path.join(DATA, "banque.json"), REGLES_F = path.join(DATA, "banque-regles.json");
let BANQUE = readJ(BANQUE_F, []), REGLES = readJ(REGLES_F, {texte:"", off:[], ajouts:[]});
let bqTimer = null; const saveBanque = () => { clearTimeout(bqTimer); bqTimer = setTimeout(() => writeAtomic(BANQUE_F, BANQUE), 400); };
const saveRegles = () => writeAtomic(REGLES_F, REGLES);
const normTxt = s => String(s || "").normalize("NFC").replace(/\s+/g, " ").trim();
function lev(a, b){ a = [...a]; b = [...b]; if (!a.length) return b.length; if (!b.length) return a.length; if (a.length * b.length > 4e6) return Math.max(a.length, b.length);
  let prev = Array.from({length:b.length + 1}, (_, j) => j);
  for (let i = 1; i <= a.length; i++){ const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[b.length]; }
const wordsOf = s => normTxt(s).split(" ").filter(Boolean);
function scoreOf(ia, vrai){ const A = normTxt(ia), V = normTxt(vrai); const n = Math.max(1, [...V].length), wn = Math.max(1, wordsOf(V).length);
  return {cer:Math.min(1, lev(A, V) / n), wer:Math.min(1, lev(wordsOf(A), wordsOf(V)) / wn)}; }
/* Mots mal lus : alignement mot à mot (LCS), paires « lu par l'IA → vrai texte » */
function confusions(ia, vrai){
  const A = wordsOf(ia), V = wordsOf(vrai), out = []; if (A.length * V.length > 250000) return out;
  const L = Array.from({length:A.length + 1}, () => new Array(V.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) for (let j = V.length - 1; j >= 0; j--) L[i][j] = A[i] === V[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  let i = 0, j = 0, ga = [], gv = [];
  const flush = () => { if (ga.length && gv.length && ga.length <= 3 && gv.length <= 3) out.push([ga.join(" "), gv.join(" ")]); ga = []; gv = []; };
  while (i < A.length || j < V.length){
    if (i < A.length && j < V.length && A[i] === V[j]){ flush(); i++; j++; }
    else if (j < V.length && (i >= A.length || L[i][j + 1] >= L[i + 1][j])) gv.push(V[j++]);
    else ga.push(A[i++]);
  }
  flush(); return out.filter(([a, v]) => a.replace(/[^\p{L}\p{N}]/gu, "") !== v.replace(/[^\p{L}\p{N}]/gu, "") || a !== v);
}
function conseils(){
  const cnt = new Map();
  for (const s of BANQUE){
    const pairs = Array.isArray(s.corrections) ? s.corrections.map(x => [x.ia, x.vrai]) : s.texteIA && s.texte && s.texteIA !== s.texte ? confusions(s.texteIA, s.texte) : [];
    for (const [a, v] of pairs){ if (!a || a === v) continue; const k = a + "→" + v; const c = cnt.get(k) || {ia:a, vrai:v, n:0, langues:new Set(), explicite:false}; c.n++; c.langues.add(s.langue || ""); if (Array.isArray(s.corrections)) c.explicite = true; cnt.set(k, c); } }
  const auto = [...cnt.entries()].filter(([k, c]) => (c.n >= 2 || c.explicite) && !REGLES.off.includes(k)).sort((x, y) => y[1].n - x[1].n).slice(0, 60).map(([k, c]) => ({k, ia:c.ia, vrai:c.vrai, n:c.n, langues:[...c.langues].filter(Boolean)}));
  return {regles:REGLES.texte || "", ajouts:REGLES.ajouts || [], off:REGLES.off || [], confusions:auto};
}
function banqueStats(){
  const grp = (key) => { const m = {}; for (const s of BANQUE){ if (s.cer == null) continue; const k = key(s) || "—"; const g = m[k] || (m[k] = {n:0, cer:0, wer:0}); g.n++; g.cer += s.cer; g.wer += s.wer; }
    return Object.entries(m).map(([k, g]) => ({k, n:g.n, lettres:1 - g.cer / g.n, mots:1 - g.wer / g.n})).sort((a, b) => b.n - a.n); };
  const tot = grp(() => "Total")[0] || {n:0, lettres:null, mots:null};
  return {total:BANQUE.length, mesures:tot.n, lettres:tot.lettres, mots:tot.mots, parLangue:grp(s => s.langue), parMatiere:grp(s => s.matiere), parMois:grp(s => String(s.at || "").slice(0, 7)).sort((a, b) => a.k.localeCompare(b.k)), parSource:grp(s => s.source)};
}
const SRC_OK = ["correction", "validation", "modele", "admin", "public"];
/* Conservation limitée : les exemples de plus de 2 ans sont effacés */
function purgeBanque(){ const lim = Date.now() - 730 * 864e5, n = BANQUE.length; BANQUE = BANQUE.filter(x => x.source !== "correction" || !x.at || Date.parse(x.at) > lim); if (BANQUE.length !== n){ saveBanque(); console.log("Banque d'écriture : " + (n - BANQUE.length) + " exemple(s) de plus de 2 ans effacé(s)"); } }
setTimeout(() => { try { purgeBanque(); } catch(e){} }, 5000); setInterval(() => { try { purgeBanque(); } catch(e){} }, 864e5).unref();
function addSample(u, b){
  const texte = String(b.texte || "").slice(0, 4000), texteIA = String(b.texteIA ?? "").slice(0, 4000), asset = /^[a-z0-9]{8,40}$/.test(b.asset || "") ? b.asset : null;
  if (!asset || !normTxt(texte)) return null;
  const sc = b.texteIA != null ? scoreOf(texteIA, texte) : {cer:null, wer:null};
  const s = {id:crypto.randomBytes(8).toString("hex"), asset, texte, texteIA, ...sc, matiere:String(b.matiere || "").slice(0, 60), langue:String(b.langue || "").slice(0, 40), niveau:String(b.niveau || "").slice(0, 30),
    source:SRC_OK.includes(b.source) ? b.source : "correction", par:u.id, at:new Date().toISOString(),
    ...(b.ref ? {ref:String(b.ref).slice(0, 200)} : {}),
    ...(Array.isArray(b.corrections) ? {corrections:b.corrections.filter(x => x && typeof x.ia === "string" && typeof x.vrai === "string").map(x => ({ia:x.ia.slice(0, 80), vrai:x.vrai.slice(0, 80)})).slice(0, 100)} : {})};
  const i = BANQUE.findIndex(x => x.asset === asset);
  if (i >= 0) BANQUE[i] = {...BANQUE[i], ...s, id:BANQUE[i].id, texteIA:BANQUE[i].texteIA || s.texteIA, ...(BANQUE[i].texteIA ? scoreOf(BANQUE[i].texteIA, texte) : sc)}; else BANQUE.push(s);
  if (BANQUE.length > 60000) BANQUE.splice(0, BANQUE.length - 60000);
  saveBanque(); return i >= 0 ? BANQUE[i] : s;
}
async function banqueApi(req, res, url, p, u){
  if (!u) return sendJ(res, 401, {error:{message:"Connexion requise"}});
  if (p === "/api/banque/conseils" && req.method === "GET") return sendJ(res, 200, conseils());
  if (p === "/api/banque" && req.method === "POST"){
    /* Corrections de lecture : conservées par défaut pour améliorer la lecture (sans nom d'élève, de classe, de note ni d'établissement) ;
       le professeur peut le désactiver dans Mon compte, la direction pour tout l'établissement */
    if (u.partageEcriture === false || groupOf(u)?.collecte === false) return sendJ(res, 200, {ignore:true});
    const b = await readJSON(req, 2e5) || {}; const list = Array.isArray(b.items) ? b.items.slice(0, 60) : [b];
    const out = list.map(x => addSample(u, x)).filter(Boolean); return sendJ(res, 200, {ajoutes:out.length, items:u.role === "admin" ? out : undefined});
  }
  if (u.role !== "admin") return sendJ(res, 403, {error:{message:"Réservé à l'administrateur"}});
  if (p === "/api/banque/stats" && req.method === "GET") return sendJ(res, 200, banqueStats());
  if (p === "/api/banque" && req.method === "GET"){
    const q = String(url.searchParams.get("q") || "").toLowerCase(), lg = url.searchParams.get("langue") || "", off = Math.max(0, +url.searchParams.get("offset") || 0);
    const l = BANQUE.filter(s => (!lg || s.langue === lg) && (!q || (s.texte + " " + s.texteIA + " " + s.matiere).toLowerCase().includes(q))).slice().reverse();
    return sendJ(res, 200, {total:l.length, items:l.slice(off, off + 40)});
  }
  /* Import d'une base publique Hugging Face (lignes manuscrites + texte exact) : le serveur télécharge les images, rien ne passe par GitHub */
  if (p === "/api/banque/hf" && req.method === "POST"){
    const b = await readJSON(req, 1e4) || {}; const ds = String(b.dataset || "").trim();
    if (!/^[\w.-]{1,96}\/[\w.-]{1,96}$/.test(ds)) return sendJ(res, 400, {error:{message:"Nom de base invalide (format : auteur/nom)"}});
    const split = /^[\w.-]{1,40}$/.test(b.split || "") ? b.split : "train", config = /^[\w.-]{1,60}$/.test(b.config || "") ? b.config : "default";
    const want = Math.max(1, Math.min(50, +b.length || 20)); REGLES.hf = REGLES.hf || {}; const key = ds + ":" + config + ":" + split;
    const offset = b.offset != null ? Math.max(0, +b.offset || 0) : (REGLES.hf[key] || 0);
    let j; try { const r = await fetch(`${env("HF_ROWS_URL") || "https://datasets-server.huggingface.co/rows"}?dataset=${encodeURIComponent(ds)}&config=${encodeURIComponent(config)}&split=${encodeURIComponent(split)}&offset=${offset}&length=${want}`, {signal:AbortSignal.timeout(30000)});
      j = await r.json(); if (!r.ok) return sendJ(res, 502, {error:{message:"Hugging Face : " + String(j?.error || r.status).slice(0, 200)}}); }
    catch(e){ return sendJ(res, 502, {error:{message:"Hugging Face injoignable pour le moment"}}); }
    const feats = j.features || [], imgCol = feats.find(f => f.type?._type === "Image")?.name, txtCol = (feats.find(f => /^(text|transcription|label|sentence|ground_truth)$/i.test(f.name) && f.type?.dtype === "string") || feats.find(f => f.type?.dtype === "string"))?.name;
    if (!imgCol || !txtCol) return sendJ(res, 400, {error:{message:"Cette base n'a pas de colonne image + texte"}});
    const out = [];
    for (const r of j.rows || []){
      const src = r.row?.[imgCol]?.src, texte = String(r.row?.[txtCol] ?? "").trim(), ref = "hf:" + key + ":" + r.row_idx;
      if (!src || !texte || BANQUE.some(x => x.ref === ref)) continue;
      try { const im = await fetch(src, {signal:AbortSignal.timeout(20000)}); if (!im.ok) continue; const buf = Buffer.from(await im.arrayBuffer()); if (buf.length > 4e6) continue;
        const id = crypto.randomBytes(10).toString("hex"); fs.writeFileSync(path.join(FILEDIR, id + ".jpg"), buf); setOwner(id, u); out.push({asset:id, texte, ref}); } catch(e){}
    }
    REGLES.hf[key] = offset + (j.rows || []).length; saveRegles();
    return sendJ(res, 200, {items:out, offset:REGLES.hf[key], total:j.num_rows_total ?? null});
  }
  if (p === "/api/banque/regles" && req.method === "PUT"){
    const b = await readJSON(req, 1e5) || {};
    if (typeof b.texte === "string") REGLES.texte = b.texte.slice(0, 3000);
    if (Array.isArray(b.off)) REGLES.off = [...new Set(b.off.map(String))].slice(0, 2000);
    if (Array.isArray(b.ajouts)) REGLES.ajouts = b.ajouts.filter(x => x && x.ia && x.vrai).map(x => ({ia:String(x.ia).slice(0, 80), vrai:String(x.vrai).slice(0, 80)})).slice(0, 200);
    saveRegles(); return sendJ(res, 200, conseils());
  }
  const m = p.match(/^\/api\/banque\/([a-f0-9]{16})$/);
  if (m){ const i = BANQUE.findIndex(s => s.id === m[1]); if (i < 0) return sendJ(res, 404, {error:{message:"Document introuvable"}});
    if (req.method === "DELETE"){ BANQUE.splice(i, 1); saveBanque(); return sendJ(res, 200, {ok:true}); }
    if (req.method === "PATCH"){ const b = await readJSON(req, 2e4) || {}; const s = BANQUE[i];
      if (typeof b.texte === "string" && normTxt(b.texte)){ s.texte = b.texte.slice(0, 4000); Object.assign(s, s.texteIA != null ? scoreOf(s.texteIA, s.texte) : {}); }
      for (const k of ["matiere", "langue", "niveau"]) if (typeof b[k] === "string") s[k] = b[k].slice(0, 60);
      saveBanque(); return sendJ(res, 200, {item:s}); } }
  return sendJ(res, 404, {error:{message:"Route inconnue"}});
}


/* ---------- Appareils de scan (Mastery Box, scanners Wi-Fi) et boîte de réception des copies ----------
   Un appareil reçoit un jeton secret. Il envoie chaque page (image ou PDF) à /api/scan/upload?t=JETON.
   Les pages arrivent dans la boîte de réception du prof (ou de l'établissement) ; l'application du prof
   les récupère, lit les QR codes, range chaque copie dans le bon contrôle et lance la correction. */
const DEV_F = path.join(DATA, "appareils.json"), INBOX_F = path.join(DATA, "inbox.json");
let DEVICES = readJ(DEV_F, []), INBOX = readJ(INBOX_F, []);
const saveDevices = () => writeAtomic(DEV_F, DEVICES);
let inTimer = null; const saveInbox = () => { clearTimeout(inTimer); inTimer = setTimeout(() => writeAtomic(INBOX_F, INBOX), 300); };
const devPub = d => ({id:d.id, nom:d.nom, portee:d.portee, token:d.token, createdAt:d.createdAt, dernier:d.dernier || null, pages:d.pages || 0});
const inboxFor = u => INBOX.filter(it => it.status !== "fait" && (it.cible === "u:" + u.id || (it.cible.startsWith("g:") && (() => { const g = GROUPES.find(x => "g:" + x.id === it.cible); return g && (g.directeur === u.id || (g.membres || []).includes(u.id)); })()))
  && !(it.autres || []).includes(u.id));
const devHits = new Map();
async function scanApi(req, res, url, p, u){
  if (p === "/api/scan/upload" && req.method === "POST"){
    const tok = String(url.searchParams.get("t") || (req.headers.authorization || "").replace(/^Bearer\s+/i, "")).trim();
    const d = /^[a-f0-9]{40}$/.test(tok) && DEVICES.find(x => same(x.token, tok));
    if (!d) return sendJ(res, 401, {error:{message:"Appareil inconnu"}});
    const now = Date.now(), l = (devHits.get(d.id) || []).filter(t => now - t < 60e3); if (l.length >= 120) return sendJ(res, 429, {error:{message:"Trop de pages d'un coup : attends une minute"}}); l.push(now); devHits.set(d.id, l);
    const ct = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!["image/jpeg", "image/png", "application/pdf"].includes(ct)) return sendJ(res, 415, {error:{message:"Format accepté : JPEG, PNG ou PDF"}});
    const buf = await readBody(req, 30e6); if (buf.length < 100) return sendJ(res, 400, {error:{message:"Fichier vide"}});
    const id = crypto.randomBytes(10).toString("hex"), iid = crypto.randomBytes(8).toString("hex"); fs.writeFileSync(path.join(FILEDIR, id + ".jpg"), buf); FOWN[id] = {inbox:iid}; saveFown();
    INBOX.push({id:iid, asset:id, mime:ct, cible:d.cible, appareil:d.id, at:new Date().toISOString(), status:"nouveau"});
    if (INBOX.length > 20000) INBOX = INBOX.filter(x => x.status !== "fait").slice(-20000);
    d.dernier = new Date().toISOString(); d.pages = (d.pages || 0) + 1; saveDevices(); saveInbox();
    return sendJ(res, 200, {ok:true});
  }
  if (!u) return sendJ(res, 401, {error:{message:"Connexion requise"}});
  if (p === "/api/devices" && req.method === "GET") return sendJ(res, 200, {appareils:DEVICES.filter(d => d.par === u.id).map(devPub)});
  if (p === "/api/devices" && req.method === "POST"){
    const b = await readJSON(req, 1e4) || {}; const g = groupOf(u);
    const ecole = b.portee === "ecole" && g && g.directeur === u.id;
    const d = {id:crypto.randomBytes(8).toString("hex"), token:crypto.randomBytes(20).toString("hex"), nom:String(b.nom || "Scanner").trim().slice(0, 60) || "Scanner", portee:ecole ? "ecole" : "moi", cible:ecole ? "g:" + g.id : "u:" + u.id, par:u.id, createdAt:new Date().toISOString()};
    DEVICES.push(d); saveDevices(); return sendJ(res, 200, {appareil:devPub(d)});
  }
  const dm = p.match(/^\/api\/devices\/([a-f0-9]{16})$/);
  if (dm && req.method === "DELETE"){ DEVICES = DEVICES.filter(d => !(d.id === dm[1] && d.par === u.id)); saveDevices(); return sendJ(res, 200, {ok:true}); }
  if (p === "/api/scan/inbox" && req.method === "GET"){
    const now = Date.now(), l = inboxFor(u).filter(it => !it.pris || it.pris.u === u.id || now - it.pris.t > 10 * 60e3).slice(0, 60);
    for (const it of l) it.pris = {u:u.id, t:now}; if (l.length) saveInbox();
    return sendJ(res, 200, {items:l.map(it => ({id:it.id, asset:it.asset, mime:it.mime, at:it.at, groupe:it.cible.startsWith("g:"), status:it.status}))});
  }
  const im = p.match(/^\/api\/scan\/inbox\/([a-f0-9]{16})$/);
  if (im && req.method === "POST"){
    const it = INBOX.find(x => x.id === im[1]); if (!it || !inboxFor(u).includes(it)) return sendJ(res, 404, {error:{message:"Document introuvable"}});
    const b = await readJSON(req, 1e4) || {};
    if (b.status === "autre"){ it.autres = [...new Set([...(it.autres || []), u.id])]; delete it.pris; }
    else if (["fait", "manuel"].includes(b.status)){ it.status = b.status; it.par = u.id; if (b.status === "fait") it.faitAt = new Date().toISOString(); }
    saveInbox(); return sendJ(res, 200, {ok:true});
  }
  return sendJ(res, 404, {error:{message:"Route inconnue"}});
}

migrateEspaces();
/* Première fois : on retrouve à qui appartient chaque image déjà enregistrée (documents, banque, boîte de réception) */
if (!FOWN){
  FOWN = {}; const ID = /^[a-z0-9]{8,40}$/;
  const walk = (v, own) => { if (typeof v === "string"){ if (ID.test(v) && !FOWN[v]) FOWN[v] = own; return; } if (Array.isArray(v)) v.forEach(x => walk(x, own)); else if (isObj(v)) for (const k in v) walk(v[k], own); };
  for (const [, v] of DOCS) if (isObj(v)) walk(v, {u:v.owner || v.createdBy || null, e:v.espace || null});
  for (const smp of BANQUE) if (smp.asset && !FOWN[smp.asset]){ const w = USERS.find(x => x.id === smp.par); FOWN[smp.asset] = {u:smp.par || null, e:w?.espace || null}; }
  for (const it of INBOX) if (it.asset && !FOWN[it.asset]) FOWN[it.asset] = {inbox:it.id};
  for (const k of Object.keys(FOWN)) if (!fs.existsSync(path.join(FILEDIR, k + ".jpg"))) delete FOWN[k];
  writeAtomic(FOWN_F, FOWN); console.log("Propriétaires des images :", Object.keys(FOWN).length);
}
function canSeeFile(u, id){
  if (u.role === "admin") return true;
  const o = FOWN[id]; if (!o) return false;
  if (o.inbox){ const it = INBOX.find(x => x.id === o.inbox); return !!it && inboxFor(u).includes(it); }
  return o.u === u.id || (!!o.e && (o.e === u.espace || dirSees(u, o.e)));
}
/* ---------- Sauvegardes automatiques : une copie complète par jour sur le Volume, 14 jours gardés ---------- */
const BAKDIR = path.join(DATA, "backups"); fs.mkdirSync(BAKDIR, {recursive:true});
function autoBackup(){
  try {
    const key = env("BACKUP_KEY"), f = path.join(BAKDIR, "mastery-" + new Date().toISOString().slice(0, 10) + ".json" + (key ? ".enc" : ""));
    if (fs.existsSync(f) || (!USERS.length && !DOCS.size)) return;
    const data = {mastery:1, at:new Date().toISOString(), users:USERS, docs:Object.fromEntries(DOCS), banque:BANQUE, banqueRegles:REGLES, appareils:DEVICES, inbox:INBOX, etablissements:GROUPES, fichiers:FOWN};
    if (key){ /* AES-256-GCM : sel(16) · iv(12) · tag(16) · données ; clé dérivée de BACKUP_KEY (scrypt) */
      const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), k = crypto.scryptSync(key, salt, 32), c = crypto.createCipheriv("aes-256-gcm", k, iv);
      const enc = Buffer.concat([c.update(JSON.stringify(data)), c.final()]); fs.writeFileSync(f + ".tmp", Buffer.concat([salt, iv, c.getAuthTag(), enc])); fs.renameSync(f + ".tmp", f); }
    else writeAtomic(f, data);
    const all = fs.readdirSync(BAKDIR).filter(x => /^mastery-\d{4}-\d{2}-\d{2}\.json(\.enc)?$/.test(x)).sort();
    for (const x of all.slice(0, Math.max(0, all.length - (Number(env("BACKUP_KEEP")) || 14)))) fs.rmSync(path.join(BAKDIR, x), {force:true});
    console.log("Sauvegarde automatique :", path.basename(f));
  } catch(e){ console.warn("Sauvegarde automatique impossible :", e.message); }
}
setTimeout(autoBackup, 60e3); setInterval(autoBackup, 3600e3);
function purgeOldFiles(){
  try {
    const keepDays = Number(env("FILE_RETENTION_DAYS")) || 400, lim = Date.now() - keepDays * 864e5, inBank = new Set(BANQUE.map(b => b.asset)); let n = 0;
    for (const f of fs.readdirSync(FILEDIR)){ if (!f.endsWith(".jpg")) continue; const id = f.slice(0, -4); if (inBank.has(id)) continue;
      const st = fs.statSync(path.join(FILEDIR, f)); if (st.mtimeMs < lim){ fs.rmSync(path.join(FILEDIR, f), {force:true}); delete FOWN[id]; n++; } }
    if (n){ saveFown(); console.log("Images de copies supprimées (plus de " + keepDays + " jours) :", n); }
  } catch(e){ console.warn("Purge des images :", e.message); }
}
setTimeout(purgeOldFiles, 120e3); setInterval(purgeOldFiles, 24 * 3600e3);
function backups(req, res, p, u){
  if (!u) return sendJ(res, 401, {error:{message:"Connexion requise"}});
  if (u.role !== "admin") return sendJ(res, 403, {error:{message:"Réservé à l'administrateur"}});
  if (p === "/api/backups" && req.method === "GET")
    return sendJ(res, 200, {persistent:PERSISTENT, chiffre:!!env("BACKUP_KEY"), backups:fs.readdirSync(BAKDIR).filter(x => /^mastery-[\d-]+\.json(\.enc)?$/.test(x)).sort().reverse().map(x => ({nom:x, taille:fs.statSync(path.join(BAKDIR, x)).size}))});
  if (p === "/api/backups/now" && req.method === "POST"){ for (const x of [".json", ".json.enc"]) fs.rmSync(path.join(BAKDIR, "mastery-" + new Date().toISOString().slice(0, 10) + x), {force:true}); autoBackup(); return sendJ(res, 200, {ok:true}); }
  const m = p.match(/^\/api\/backups\/(mastery-\d{4}-\d{2}-\d{2}\.json(?:\.enc)?)$/);
  if (m && req.method === "GET"){ const f = path.join(BAKDIR, m[1]); if (!fs.existsSync(f)) return sendJ(res, 404, {error:{message:"Document introuvable"}});
    res.writeHead(200, {"Content-Type":m[1].endsWith(".enc") ? "application/octet-stream" : TYPES[".json"], "Content-Disposition":`attachment; filename="${m[1]}"`, "Cache-Control":"no-store"}); return pipeFile(f, res); }
  return sendJ(res, 404, {error:{message:"Route inconnue"}});
}
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x"); let p = decodeURIComponent(url.pathname);
    res._lang = langOf(req);
    const wantLang = url.searchParams.get("lang");
    if (/^(fr|en|pt)$/.test(wantLang || "") && !p.startsWith("/api/")){ url.searchParams.delete("lang"); const q = url.searchParams.toString();
      res.writeHead(302, {"Location":p + (q ? "?" + q : ""), "Set-Cookie":`lang=${wantLang}; Path=/; SameSite=Lax; Max-Age=${365 * 86400}`}); return res.end(); }
    if (p === "/health") return send(res, 200, "ok");
    const wantRef = url.searchParams.get("ref");
    if (/^[A-Za-z0-9]{7}$/.test(wantRef || "") && !p.startsWith("/api/")){ url.searchParams.delete("ref"); const q = url.searchParams.toString();
      res.writeHead(302, {"Location":p + (q ? "?" + q : ""), "Set-Cookie":`mref=${wantRef.toUpperCase()}; Path=/; SameSite=Lax; Max-Age=${60 * 86400}`}); return res.end(); }
    if (p === "/api/stripe/webhook" && req.method === "POST") return await stripeWebhook(req, res);
    if (p === "/api/scan/upload") return await scanApi(req, res, url, p, null);
    const u = userOf(req);
    if (u && u.mustChange && p.startsWith("/api/") && !["/api/me", "/api/me/password", "/api/logout"].includes(p)) return sendJ(res, 403, {error:{message:"Choisis d'abord un nouveau mot de passe", code:"must_change"}});
    if (p.startsWith("/api/eleve/")) return await eleveApi(req, res, url, p);
    if (p === "/eleve" || p === "/eleve/") p = "/eleve.html";
    if (p.startsWith("/api/")){
      if (req.method === "POST" && p === "/api/ai") return await aiProxy(req, res, u);
      if (p.startsWith("/api/backups")) return backups(req, res, p, u);
      if (p === "/api/jobs" || p.startsWith("/api/jobs/")) return await jobsApi(req, res, url, p, u);
      if (p === "/api/gen" || p.startsWith("/api/gen/")) return await genApi(req, res, p, u);
      if (p === "/api/lots" || p.startsWith("/api/lots/")) return await lotsApi(req, res, url, p, u);
      if (p === "/api/banque" || p.startsWith("/api/banque/")) return await banqueApi(req, res, url, p, u);
      if (p === "/api/devices" || p.startsWith("/api/devices/") || p.startsWith("/api/scan/")) return await scanApi(req, res, url, p, u);
      if (p === "/api/etab" || p.startsWith("/api/etab/") || p.startsWith("/api/billing/")){ try { return await billingApi(req, res, url, p, u); } catch(e){ console.warn("Abonnement :", e.message); return sendJ(res, 502, {error:{message:"Paiement indisponible pour le moment : réessaie dans un instant."}}); } }
      if (p.startsWith("/api/db") || p.startsWith("/api/files") || p === "/api/export") return await storage(req, res, url, p, u);
      return await accounts(req, res, url, p, u);
    }
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Méthode non autorisée");
    if (p === "/config.js")
      return send(res, 200, "window.TIKOUN_CONFIG = " + JSON.stringify({aiEndpoint:env("ANTHROPIC_API_KEY") ? "/api/ai" : "", jobs:!!env("ANTHROPIC_API_KEY"), lots:!!(ENGINE && env("ANTHROPIC_API_KEY")), storage:"server", accounts:true, signup:signupOpen(), persistent:PERSISTENT, billing:BILLING(), trialDays:TRIAL_DAYS(),
        prix:prixLabels(res._lang), contact:CONTACT()}) + ";\n", TYPES[".js"], {"Cache-Control":"no-store"});
    if (p === "/" || p === "") p = u ? "/index.html" : "/landing.html";
    if (p === "/app" || p === "/app/") p = "/index.html";
    const LEGAL = {"/cgu":"cgu", "/terms":"cgu", "/confidentialite":"confidentialite", "/privacy":"confidentialite", "/mentions-legales":"mentions-legales", "/legal":"mentions-legales"}[p.replace(/\/$/, "").replace(/(\.(en|pt))?\.html$/, "")];
    if (LEGAL){ const lg = (p.match(/\.(en|pt)\.html$/) || [])[1] || res._lang; const f = path.join(ROOT, LEGAL + (lg === "en" ? ".en" : lg === "pt" ? ".pt" : "") + ".html"); const en = lg === "en";
      const nd = en ? "to be completed" : lg === "pt" ? "a completar" : "à compléter";
      const V = {EDITEUR:env("LEGAL_NAME") || "Mastery", ADRESSE:env("LEGAL_ADDRESS") || nd, CONTACT:CONTACT() || "contact",
        FORME:env("LEGAL_FORM") || nd, SIREN:env("LEGAL_SIREN") || nd, TEL:env("LEGAL_PHONE") || nd, DIRECTEUR:env("LEGAL_DIRECTOR") || nd, REGION:env("HOST_REGION") || (en ? "United States (us-west2)" : lg === "pt" ? "Estados Unidos (us-west2)" : "États-Unis (us-west2)"),
        HEBERGEUR:env("LEGAL_HOST") || "Railway Corporation (railway.com), 548 Market St, San Francisco, CA 94104, " + (en ? "USA" : lg === "pt" ? "EUA" : "États-Unis")};
      const html = fs.readFileSync(f, "utf8").replace(/\{\{(EDITEUR|ADRESSE|CONTACT|HEBERGEUR|FORME|SIREN|TEL|DIRECTEUR|REGION)\}\}/g, (m, k) => V[k].replace(/[<>&"]/g, c => ({"<":"&lt;", ">":"&gt;", "&":"&amp;", '"':"&quot;"}[c])));
      return send(res, 200, html, TYPES[".html"], {"Cache-Control":"no-cache"}); }
    if (res._lang !== "fr" && /\.html$/.test(p) && fs.existsSync(path.join(ROOT, p.replace(/\.html$/, "." + res._lang + ".html")))) p = p.replace(/\.html$/, "." + res._lang + ".html");
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT + path.sep) || file.startsWith(path.resolve(DATA)) || /^\/(data|src|node_modules)(\/|$)/.test(p) || p.split("/").some(s => s.startsWith("."))
      || !/\.(html|png|jpg|svg|ico|webmanifest|txt|xml|woff2?)$/.test(file) || /\/(README|RAILWAY|SUPABASE)/i.test(file)) return send(res, 404, "Introuvable");
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, "Introuvable");
      res.writeHead(200, {"Content-Type":TYPES[path.extname(file)] || "application/octet-stream", ...SEC_HEADERS, "Cache-Control":/\.html$/.test(p) ? "no-cache" : "public, max-age=300"});
      if (req.method === "HEAD") return res.end();
      pipeFile(file, res);
    });
  } catch(e){ console.error(e); send(res, 500, "Erreur serveur"); }
}).listen(PORT, "0.0.0.0", () => console.log(`Mastery en ligne sur le port ${PORT} · ${USERS.length} compte(s) · ${env("ANTHROPIC_API_KEY") ? "IA serveur" : "IA non configurée"} · données ${PERSISTENT ? "sur le volume " + DATA : "TEMPORAIRES : ajoute un Volume Railway monté sur /data"}`));
