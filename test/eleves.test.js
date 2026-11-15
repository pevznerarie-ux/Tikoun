/* Comptes élèves : création avec le code, connexion par e-mail, plusieurs classes réunies, mot de passe oublié par e-mail,
   remise à zéro par le professeur, suppression par l'élève. */
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const http = require("http"), fs = require("fs"), os = require("os"), path = require("path"), {spawn} = require("child_process");
const listen = srv => new Promise(r => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const sleep = ms => new Promise(r => setTimeout(r, ms));

test("comptes élèves", {timeout:90000}, async t => {
  /* Faux service d'e-mail : garde les messages envoyés */
  const mails = [], poste = http.createServer((req, res) => { let b = ""; req.on("data", c => b += c); req.on("end", () => { mails.push(JSON.parse(b)); res.writeHead(200, {"content-type":"application/json"}); res.end("{}"); }); });
  const mailPort = await listen(poste);
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "mastery-eleves-")), probe = http.createServer(), port = await listen(probe); await new Promise(r => probe.close(r));
  const srv = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {env:{...process.env, DATA_DIR:data, MASTERY_CODE:"test", ANTHROPIC_API_KEY:"", STRIPE_SECRET_KEY:"", PORT:String(port), RESEND_API_KEY:"x", MAIL_FROM:"Mastery <test@example.org>", RESEND_URL:"http://127.0.0.1:" + mailPort, APP_URL:""}, stdio:"ignore"});
  t.after(async () => { await new Promise(r => { srv.once("exit", r); srv.kill(); }); poste.close(); fs.rmSync(data, {recursive:true, force:true, maxRetries:5, retryDelay:100}); });
  const B = "http://127.0.0.1:" + port;
  const client = () => { let cookie = ""; return async (method, p, body) => { const r = await fetch(B + p, {method, headers:{"content-type":"application/json", cookie}, body:body ? JSON.stringify(body) : undefined});
    const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0]; const txt = await r.text(); try { return {status:r.status, ...JSON.parse(txt)}; } catch(e){ return {status:r.status, txt}; } }; };
  for (let k = 0; k < 50; k++){ try { if ((await fetch(B + "/health")).ok) break; } catch(e){} await sleep(100); }
  const prof = client(), lea = client(), hugo = client();
  await prof("POST", "/api/setup", {code:"test", email:"prof@example.org", password:"motdepasse123", nom:"Prof"});
  const doc = (p, b) => prof("PUT", "/api/db/doc?path=" + p, b);
  await doc("classes/maths2deB", {nom:"2de B · Maths", niveau:"2de", eleves:[{id:"e1", prenom:"Léa", nom:"Martin", code:"AAAAA111"}, {id:"e2", prenom:"Hugo", nom:"Bernard", code:"BBBBB222"}]});
  await doc("classes/histoire2deB", {nom:"2de B · Histoire", niveau:"2de", eleves:[{id:"h1", prenom:"Léa", nom:"Martin", code:"CCCCC333"}]});
  await doc("quizzes/quizHist0001", {classeId:"histoire2deB", statut:"ouvert", titre:"Révolution", matiere:"Histoire", parTentative:1, questions:[{id:"x1", type:"vf", bonne:true, notion:"1789", enonce:"La Bastille tombe en 1789."}]});

  // 1. La carte : code + nom de famille, comme avant
  assert.equal((await lea("POST", "/api/eleve/login", {code:"aaaaa111", nom:"martin"})).status, 200);
  let me = await lea("GET", "/api/eleve/me"); assert.deepEqual([me.eleve.prenom, me.eleve.classe, me.compte, me.dejaCompte], ["Léa", "2de B · Maths", null, false]);
  // 2. Elle crée son compte depuis sa session, puis se connecte avec son e-mail
  assert.equal((await lea("POST", "/api/eleve/compte", {email:"Lea@Example.org", password:"court"})).status, 400);
  assert.equal((await lea("POST", "/api/eleve/compte", {email:"Lea@Example.org", password:"monsecret1"})).status, 200);
  me = await lea("GET", "/api/eleve/me"); assert.equal(me.compte.email, "lea@example.org");
  for (let k = 0; k < 40 && !mails.length; k++) await sleep(50);
  assert.match(mails.at(-1).text, /\/eleve/); assert.match(mails.at(-1).text, /Made by Les Institutions Sinaï/); assert.deepEqual(mails.at(-1).to, ["lea@example.org"]);
  await lea("POST", "/api/eleve/logout", {}); assert.equal((await lea("GET", "/api/eleve/me")).status, 401);
  assert.equal((await lea("POST", "/api/eleve/login", {email:"lea@example.org", password:"mauvais-mot"})).status, 401);
  assert.equal((await lea("POST", "/api/eleve/login", {email:"lea@example.org", password:"monsecret1"})).status, 200);
  // 3. Un seul compte par élève, un seul compte par e-mail
  assert.equal((await hugo("POST", "/api/eleve/compte", {code:"AAAAA111", nom:"Martin", email:"autre@example.org", password:"monsecret1"})).status, 409);
  assert.equal((await hugo("POST", "/api/eleve/compte", {code:"BBBBB222", nom:"Bernard", email:"lea@example.org", password:"monsecret1"})).status, 409);
  assert.equal((await hugo("POST", "/api/eleve/compte", {code:"BBBBB222", nom:"Mauvais", email:"hugo@example.org", password:"monsecret1"})).status, 401);
  assert.equal((await hugo("POST", "/api/eleve/compte", {code:"BBBBB222", nom:"Bernard", email:"hugo@example.org", password:"monsecret1"})).status, 200);
  // 4. Une autre classe (un autre professeur) : le code s'ajoute au même compte, et le quiz de cette classe marche
  assert.equal((await hugo("POST", "/api/eleve/lier", {code:"CCCCC333", nom:"Bernard"})).status, 401, "le nom ne correspond pas");
  assert.equal((await lea("POST", "/api/eleve/lier", {code:"CCCCC333", nom:"Martin"})).status, 200);
  me = await lea("GET", "/api/eleve/me"); assert.equal(me.eleve.classe, "2de B · Maths · 2de B · Histoire"); assert.deepEqual(me.quizzes.map(q => [q.titre, q.classe]), [["Révolution", "2de B · Histoire"]]);
  const tir = await lea("POST", "/api/eleve/quiz/quizHist0001/tirage", {}); assert.equal(tir.questions.length, 1);
  assert.equal((await lea("POST", "/api/eleve/quiz/quizHist0001/reponse", {tirage:tir.tirage, qid:"x1", rep:true})).ok, true);
  assert.equal((await hugo("POST", "/api/eleve/quiz/quizHist0001/tirage", {})).status, 404, "Hugo n'est pas dans cette classe");
  // 5. Mot de passe oublié : un lien par e-mail, utilisable une seule fois ; rien ne dit si un e-mail est connu
  assert.deepEqual(await lea("POST", "/api/eleve/oubli", {email:"inconnu@example.org"}), {status:200, mail:true});
  const avant = mails.length; await lea("POST", "/api/eleve/oubli", {email:"lea@example.org"}); for (let k = 0; k < 30 && mails.length === avant; k++) await sleep(50);
  const tok = (mails.at(-1).text.match(/\/eleve#reset\/([a-f0-9]{48})/) || [])[1]; assert.ok(tok, "le lien est dans l'e-mail");
  const autre = client();
  assert.equal((await autre("POST", "/api/eleve/reset", {token:"0".repeat(48), password:"nouveau-secret"})).status, 400);
  assert.equal((await autre("POST", "/api/eleve/reset", {token:tok, password:"nouveau-secret"})).status, 200);
  assert.equal((await autre("GET", "/api/eleve/me")).compte.email, "lea@example.org");
  assert.equal((await autre("POST", "/api/eleve/reset", {token:tok, password:"encore-un-autre"})).status, 400, "lien déjà utilisé");
  assert.equal((await lea("GET", "/api/eleve/me")).status, 401, "les anciennes sessions sont fermées");
  assert.equal((await lea("POST", "/api/eleve/login", {email:"lea@example.org", password:"monsecret1"})).status, 401);
  assert.equal((await lea("POST", "/api/eleve/login", {email:"lea@example.org", password:"nouveau-secret"})).status, 200);
  // 6. Changer de mot de passe
  assert.equal((await lea("POST", "/api/eleve/compte/motdepasse", {actuel:"faux", nouveau:"troisieme-secret"})).status, 401);
  assert.equal((await lea("POST", "/api/eleve/compte/motdepasse", {actuel:"nouveau-secret", nouveau:"troisieme-secret"})).status, 200);
  // 7. Le professeur voit qui a un compte (e-mail masqué), jamais le mot de passe, et peut remettre un compte à zéro
  const vus = await prof("GET", "/api/classes/maths2deB/comptes"); assert.deepEqual(Object.keys(vus.comptes).sort(), ["e1", "e2"]); assert.equal(vus.comptes.e1.email, "l•••@example.org");
  assert.ok(!JSON.stringify((await prof("GET", "/api/export")) || {}).includes("lea@example.org"), "pas d'e-mail d'élève dans l'export du professeur");
  assert.equal((await hugo("GET", "/api/classes/maths2deB/comptes")).status, 401, "un élève n'y a pas accès");
  assert.equal((await prof("DELETE", "/api/classes/maths2deB/comptes/e2")).status, 200);
  assert.equal((await hugo("GET", "/api/eleve/me")).status, 401); assert.equal((await hugo("POST", "/api/eleve/login", {email:"hugo@example.org", password:"monsecret1"})).status, 401);
  assert.equal((await hugo("POST", "/api/eleve/compte", {code:"BBBBB222", nom:"Bernard", email:"hugo@example.org", password:"monsecret2"})).status, 200, "il recrée son compte avec son code");
  // 8. L'élève supprime son compte : sa carte continue de marcher
  assert.equal((await lea("POST", "/api/eleve/compte/supprimer", {password:"faux"})).status, 401);
  assert.equal((await lea("POST", "/api/eleve/compte/supprimer", {password:"troisieme-secret"})).status, 200);
  assert.equal((await lea("POST", "/api/eleve/login", {email:"lea@example.org", password:"troisieme-secret"})).status, 401);
  assert.equal((await lea("POST", "/api/eleve/login", {code:"AAAAA111", nom:"Martin"})).status, 200);
  assert.equal((await lea("GET", "/api/eleve/me")).dejaCompte, false);
  // 9. Le professeur désactive les comptes pour la classe : plus de création, la carte marche toujours
  await prof("PATCH", "/api/db/doc?path=classes/maths2deB", {sansCompte:true});
  assert.equal((await lea("GET", "/api/eleve/me")).peutCompte, false);
  assert.equal((await lea("POST", "/api/eleve/compte", {email:"lea2@example.org", password:"monsecret1"})).status, 403);
  // Sur le disque : mots de passe hachés
  const brut = fs.readFileSync(path.join(data, "comptes-eleves.json"), "utf8"); assert.ok(!brut.includes("monsecret2")); assert.ok(brut.includes("hugo@example.org"));
});
