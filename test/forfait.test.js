/* Forfaits, avec le paiement activé (fausse clé : aucun appel à Stripe ici) : essai gratuit limité,
   taille d'un contrôle (un de plus par tranche d'élèves), réimpressions et rattrapages gratuits. */
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const http = require("http"), fs = require("fs"), os = require("os"), path = require("path"), {spawn} = require("child_process");
const listen = srv => new Promise(r => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Lance un serveur, crée l'administrateur, inscrit un professeur (inscription libre), le valide et le connecte */
async function lancer(t, env = {}){
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "mastery-forfait-")), probe = http.createServer(), port = await listen(probe); await new Promise(r => probe.close(r));
  const srv = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {env:{...process.env, DATA_DIR:data, MASTERY_CODE:"test", ANTHROPIC_API_KEY:"", STRIPE_SECRET_KEY:"sk_test_faux", PORT:String(port), TRIAL_CTRL:"", COPIES_PAR_CONTROLE:"", ...env}, stdio:"ignore"});
  t.after(async () => { await new Promise(r => { srv.once("exit", r); srv.kill(); }); fs.rmSync(data, {recursive:true, force:true, maxRetries:5, retryDelay:100}); });
  const B = "http://127.0.0.1:" + port;
  const client = () => { let cookie = ""; return async (method, p, body, lang) => { const r = await fetch(B + p, {method, headers:{"content-type":"application/json", cookie, ...(lang ? {"accept-language":lang} : {})}, body:body ? JSON.stringify(body) : undefined});
    const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0]; const txt = await r.text(); try { return {status:r.status, ...JSON.parse(txt)}; } catch(e){ return {status:r.status, txt}; } }; };
  for (let k = 0; k < 50; k++){ try { if ((await fetch(B + "/health")).ok) break; } catch(e){} await sleep(100); }
  const admin = client(), prof = client();
  await admin("POST", "/api/setup", {code:"test", email:"admin@example.org", password:"motdepasse123", nom:"Admin"});
  const insc = await prof("POST", "/api/register", {email:"prof@example.org", password:"motdepasse456", nom:"Prof Essai", cgu:true, ecole:{nom:"École d'essai", ville:"Paris"}});
  assert.equal(insc.pending, true);
  const id = (await admin("GET", "/api/users")).users.find(u => u.email === "prof@example.org").id;
  assert.equal((await admin("PATCH", "/api/users/" + id, {statut:"valide"})).status, 200);
  assert.equal((await prof("POST", "/api/login", {email:"prof@example.org", password:"motdepasse456"})).status, 200);
  const doc = (p, b) => prof("PUT", "/api/db/doc?path=" + p, b);
  const classe = (cid, n) => doc("classes/" + cid, {nom:cid, niveau:"2de", eleves:Array.from({length:n}, (_, i) => ({id:cid + "e" + i, prenom:"Élève", nom:"N" + i}))});
  const ctrl = (id, classeId, plus = {}) => doc("controles/" + id, {type:"controle", titre:id, matiere:"Maths", niveau:"2de", classeId, statut:"pret", questions:[], ...plus});
  const imprimer = (id, lang) => prof("POST", "/api/billing/use", {ctrlId:id}, lang);
  return {B, prof, classe, ctrl, imprimer, quota:async () => (await prof("GET", "/api/me")).user.quota};
}

test("essai gratuit : 1 contrôle par mois, réimpression et rattrapage gratuits", {timeout:60000}, async t => {
  const S = await lancer(t), q0 = await S.quota();
  assert.deepEqual([q0.illimite, q0.mode, q0.ctrl, q0.used, q0.par], [false, "essai", 1, 0, 35]);
  const cfg = await (await fetch(S.B + "/config.js")).text(); assert.match(cfg, /"trialCtrl":1,"copiesCtrl":35/);
  await S.classe("classeA000001", 30);
  for (const id of ["ctrlA0000001", "ctrlA0000002"]) await S.ctrl(id, "classeA000001");
  await S.ctrl("rattrapage01", "classeA000001", {type:"rattrapage"});
  assert.equal((await S.imprimer("ctrlA0000001")).quota.used, 1);
  const re = await S.imprimer("ctrlA0000001"); assert.deepEqual([re.status, re.quota.used], [200, 1], "une réimpression ne compte pas");
  const refus = await S.imprimer("ctrlA0000002"); assert.equal(refus.status, 402); assert.equal(refus.error.code, "quota"); assert.match(refus.error.message, /^Tu as utilisé tous les contrôles/);
  assert.equal((await S.imprimer("rattrapage01")).status, 200, "un rattrapage ne compte pas");
  assert.equal((await S.quota()).used, 1);
});

test("taille d'un contrôle : un de plus par tranche de 35 élèves", {timeout:60000}, async t => {
  const S = await lancer(t, {TRIAL_CTRL:"4"});
  assert.equal((await S.quota()).ctrl, 4);
  await S.classe("classeP000001", 35); await S.classe("classeM000001", 36); await S.classe("classeG000001", 72);
  await S.ctrl("ctrlP0000001", "classeP000001"); await S.ctrl("ctrlM0000001", "classeM000001"); await S.ctrl("ctrlG0000001", "classeG000001");
  await S.ctrl("ctrlG0000002", "classeG000001", {eleves:Array.from({length:10}, (_, i) => "classeG000001e" + i)});       // seulement 10 élèves de la grande classe
  assert.equal((await S.imprimer("ctrlP0000001")).quota.used, 1, "35 élèves : 1 contrôle");
  assert.equal((await S.imprimer("ctrlM0000001")).quota.used, 3, "36 élèves : 2 contrôles");
  // 72 élèves : il en faudrait 3, il n'en reste qu'un
  const refus = await S.imprimer("ctrlG0000001"); assert.equal(refus.status, 402); assert.match(refus.error.message, /^Cette classe dépasse la taille d'un contrôle/); assert.equal(refus.quota.used, 3);
  assert.match((await S.imprimer("ctrlG0000001", "en")).error.message, /^This class is larger than one test covers/);
  assert.equal((await S.imprimer("ctrlG0000002")).quota.used, 4, "10 élèves choisis dans la grande classe : 1 contrôle");
  // La petite classe grossit après l'impression : la réimpression demande un contrôle de plus, et il n'en reste pas
  await S.classe("classeP000001", 40);
  const re = await S.imprimer("ctrlP0000001"); assert.equal(re.status, 402); assert.match(re.error.message, /^Tu as utilisé tous les contrôles/);
  assert.equal((await S.imprimer("ctrlM0000001")).status, 200, "réimpression sans changement : gratuite");
  assert.equal((await S.quota()).used, 4);
});
