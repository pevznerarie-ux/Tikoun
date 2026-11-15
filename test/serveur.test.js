/* Essai de bout en bout du serveur, avec un faux service IA local : correction d'une page (doutes, relecture automatique),
   journal de validation, génération vérifiée. Lancé par `npm test` ; aucune clé ni accès réseau nécessaires. */
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const http = require("http"), fs = require("fs"), os = require("os"), path = require("path"), {spawn} = require("child_process");

const Q = (o = {}) => { const v = x => ({enonce:(x || "") + (o.e || "Calcule 1/2 + 1/3."), corrige:"5/6", criteres:"2 pts méthode ; 2 pts résultat", ...(o.qcm ? {choix:o.choix || ["a", "b", "c"], bonnes:o.bonnes || [1]} : {})});
  return {notion:"Fractions", competences:["comprendre"], points:o.points ?? 4, lignes:5, erreurs:[], sujet:o.sujet, ...(o.qcm ? {type:"qcm"} : {}), versions:{socle:v("(aide) "), standard:v(), ...(o.sansApprofondi ? {} : {approfondi:v("(justifie) ")})}}; };
const ENONCES = ["Calcule la somme de un demi et un tiers.", "Explique ce que représente un dénominateur.", "Simplifie la fraction douze dix-huitièmes.", "Compare trois quarts avec cinq septièmes.", "Un gâteau est partagé en huit parts égales : exprime trois parts."];
/* Le faux service IA répond selon la consigne reçue et note chaque appel */
function fauxIA(calls){
  return http.createServer((req, res) => { let b = ""; req.on("data", c => b += c); req.on("end", () => {
    const parts = JSON.parse(b || "{}").messages?.[0]?.content || [], text = parts.filter(p => p.type === "text").map(p => p.text).join("\n"), imgs = parts.filter(p => p.type === "image").length;
    let kind, out;
    if (text.includes("Tu contrôles qu'une feuille ne répète pas")){ kind = "doublons"; out = {doublons:[]}; }
    else if (text.includes("Relis très attentivement")){ kind = "relecture"; const diff = text.includes("id=q2]");   // q2 : la relecture diffère de la première lecture
      out = {transcription:diff ? "x = 5 donc y = 7" : "La somme vaut 180 degrés", annotee:diff ? "x = 5 donc y = 7" : "La somme vaut 180 degrés", lisible:true, note:diff ? 2 : 1, detail:[{critere:"résultat", points:diff ? 2 : 1}], confiance:3, hesitation:"", commentaire:"Relu.", erreurs:[], acquis:[]}; }
    else if (text.includes('{"reponses":[')){ kind = "correction"; const ids = [...text.matchAll(/id=([A-Za-z0-9_-]+)\]/g)].map(m => m[1]);
      out = {reponses:ids.map(id => id === "q1" ? {id, transcription:"La somme vaut 180 degrés", fautes:[], lisible:false, note:1, detail:[{critere:"résultat", points:1}], confiance:2, hesitation:"", commentaire:"Bien.", erreurs:[], acquis:[]}
        : id === "q2" ? {id, transcription:"x = 3 donc y = [illisible] et z = [illisible]", fautes:["x = 3"], lisible:true, note:1, detail:[{critere:"résultat", points:2}], confiance:1, hesitation:"entre 1 et 2", commentaire:"Presque.", erreurs:["calcul"], acquis:[]}
        : {id, transcription:"Paris est la capitale de la France.", fautes:[], lisible:true, note:2, detail:[{critere:"réponse", points:2}], confiance:3, hesitation:"", commentaire:"Très bien.", erreurs:[], acquis:[]}), alerte:""}; }
    else if (text.includes("CORRECTION : les questions n°")){ kind = "remplacement"; out = {questions:[Q({e:"Quelle fraction est égale à un demi ?", qcm:true, choix:["2/4", "1/3", "3/5"], bonnes:[0], sujet:"Chapitre 2 · Les pourcentages"})]}; }
    else { kind = "generation"; out = {titre:"Les fractions", questions:ENONCES.map((e, i) => i === 1 ? Q({qcm:true, choix:["a", "a"], bonnes:[], e:"QCM inutilisable"}) : Q({e, points:i === 0 ? 6 : 4, sujet:"Chapitre 1 · Les fractions", sansApprofondi:i === 2}))}; }
    calls.push({kind, imgs});
    res.writeHead(200, {"content-type":"application/json"}); res.end(JSON.stringify({content:[{type:"text", text:JSON.stringify(out)}], stop_reason:"end_turn", usage:{input_tokens:100, output_tokens:50}})); }); });
}
const listen = srv => new Promise(r => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const sleep = ms => new Promise(r => setTimeout(r, ms));

test("serveur : correction, relecture des réponses douteuses, journal, génération vérifiée", {timeout:60000}, async t => {
  const calls = [], ia = fauxIA(calls), iaPort = await listen(ia), data = fs.mkdtempSync(path.join(os.tmpdir(), "mastery-test-"));
  const probe = http.createServer(), port = await listen(probe); await new Promise(r => probe.close(r));
  const srv = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {env:{...process.env, DATA_DIR:data, MASTERY_CODE:"test", ANTHROPIC_API_KEY:"x", ANTHROPIC_BASE_URL:"http://127.0.0.1:" + iaPort, PORT:String(port), STRIPE_SECRET_KEY:""}, stdio:"ignore"});
  t.after(async () => { await new Promise(r => { srv.once("exit", r); srv.kill(); });   // le serveur écrit ses fichiers en s'arrêtant : on attend sa sortie
    ia.close(); fs.rmSync(data, {recursive:true, force:true, maxRetries:5, retryDelay:100}); });
  const B = "http://127.0.0.1:" + port; let cookie = "";
  const call = async (method, p, body, raw) => { const r = await fetch(B + p, {method, headers:{"content-type":raw ? "image/jpeg" : "application/json", cookie}, body:raw || (body ? JSON.stringify(body) : undefined)});
    const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0]; const txt = await r.text(); try { return {status:r.status, ...JSON.parse(txt)}; } catch(e){ return {status:r.status, txt}; } };
  for (let k = 0; k < 50; k++){ try { if ((await fetch(B + "/health")).ok) break; } catch(e){} await sleep(100); }
  assert.equal((await call("POST", "/api/setup", {code:"test", email:"prof@example.org", password:"motdepasse123", nom:"Prof Test"})).status, 200);
  const doc = (p, b, m = "PUT") => call(m, "/api/db/doc?path=" + p, b), cid = "ctrlTest0001";
  const qs = ["q1", "q2", "q3"].map(id => ({id, points:2, notion:id, erreurs:[], v:{standard:{enonce:"Énoncé " + id, corrige:"Corrigé " + id, criteres:"2 pts"}}}));
  await doc("classes/cl1", {nom:"3e A", niveau:"3e", eleves:[{id:"e1", prenom:"Léa", nom:"Martin"}, {id:"e2", prenom:"Hugo", nom:"Bernard"}]});
  await doc("controles/" + cid, {type:"controle", titre:"Essai", matiere:"Mathématiques", niveau:"3e", classeId:"cl1", statut:"imprime", questions:qs});
  await doc("feuilles/" + cid, {copies:{e1:{pages:[["q1", "q2", "q3"]], answers:{}, version:{}}, e2:{pages:[["q1", "q2", "q3"]], answers:{}, version:{}}}});
  const imgs = []; for (let i = 0; i < 3; i++) imgs.push((await call("POST", "/api/files", null, Buffer.from([0xff, 0xd8, 0xff, i]))).id);
  const prompt = qs.map((q, i) => `[Q${i + 1} · id=${q.id}] (sur 2 points)`).join("\n") + '\nRéponds uniquement en JSON : {"reponses":[{"id":"…"}]}';
  const relire = "Relis très attentivement ce cadre.\n[Q1 · id={{ID}}] (sur {{PTS}} points)\nÉnoncé : {{ENONCE}}\nCorrigé-type : {{CORRIGE}}";
  for (const eleveId of ["e1", "e2"]) await call("POST", "/api/jobs", {ctrlId:cid, eleveId, page:1, name:"p", prompt, images:imgs, qs:qs.map((q, i) => ({id:q.id, points:2, crop:imgs[i]})), txt:{}, relire});
  let jobs = []; for (let k = 0; k < 100; k++){ await sleep(150); jobs = (await call("GET", "/api/jobs")).jobs; if (jobs.every(j => !["attente", "en_cours"].includes(j.status))) break; }
  assert.deepEqual(jobs.map(j => j.status), ["fait", "fait"]);

  await t.test("réponses douteuses relues, réponses nettes laissées", async () => {
    const a = (await call("GET", "/api/db")).docs["feuilles/" + cid].copies.e1.answers;
    assert.deepEqual(a.q1.doute, {n:1, r:["relu"]}); assert.equal(a.q1.alt, null);                                   // lecture devinée, deux lectures concordantes
    assert.equal(a.q2.doute.n, 2); assert.equal(a.q2.doute.r[0], "lectures"); assert.equal(a.q2.noteIA, 1);       // deux lectures différentes : la première reste proposée
    assert.equal(a.q2.transcription, "x = 3 donc y = [illisible] et z = [illisible]"); assert.deepEqual([a.q2.alt.transcription, a.q2.alt.noteIA], ["x = 5 donc y = 7", 2]);
    assert.deepEqual(a.q3.doute, {n:0, r:[]}); assert.deepEqual(a.q3.detail, [{c:"réponse", p:2}]);
    const relues = calls.filter(c => c.kind === "relecture");
    assert.equal(relues.length, 4); assert.ok(relues.every(c => c.imgs === 1), "une relecture = le seul cadre de la question");
  });
  await t.test("journal de validation", async () => {
    await doc("feuilles/" + cid, {copies:{e1:{validee:false, answers:{q1:{note:1, valide:false}}}}}, "PATCH");                                   // le professeur garde la note proposée
    await doc("feuilles/" + cid, {copies:{e1:{validee:true, answers:{q1:{valide:true}, q2:{valide:true}, q3:{valide:true}}}}}, "PATCH");
    await doc("feuilles/" + cid, {copies:{e1:{validee:false, answers:{q2:{note:1.5, valide:false}}}}}, "PATCH");                                 // il change une note déjà validée
    await doc("feuilles/" + cid, {copies:{e1:{validee:true, answers:{q2:{valide:true}}}, e2:{validee:true, answers:{q1:{valide:true}, q2:{valide:true}, q3:{valide:true}}}}}, "PATCH");
    const ev = (await call("GET", "/api/journal?ctrl=" + cid)).events;
    assert.deepEqual(ev.map(e => e.act), ["garde", "valide", "valide", "valide", "note", "valide", "valide", "valide", "valide"]);
    assert.deepEqual({...ev[4], at:0, par:0}, {at:0, par:0, e:"e1", q:"q2", act:"note", ia:1, avant:1, note:1.5, rouvre:true, nom:"Prof Test"});
    assert.ok(ev.slice(5).every(e => e.lot === 2), "validation groupée repérée");
    assert.equal((await call("GET", "/api/journal?ctrl=inconnu")).status, 404);
    await call("DELETE", "/api/db/doc?path=feuilles/" + cid);
    assert.equal(fs.existsSync(path.join(data, "journal", cid + ".jsonl")), false, "le journal part avec les feuilles du contrôle");
  });
  await t.test("contrôle généré : barème, QCM inutilisable, version absente", async () => {
    await call("POST", "/api/gen", {label:"Nouveau contrôle", check:true, prompt:"Nombre de questions : 5.", n:5, total:20, sujets:["Chapitre 1 · Les fractions", "Chapitre 2 · Les pourcentages"], path:"controles/genTest00001", mode:"create",
      base:{type:"controle", matiere:"Mathématiques", niveau:"3e", classeId:"cl1", differencie:true, statut:"brouillon"}, titre:{defaut:"Contrôle"}});
    let g; for (let k = 0; k < 100; k++){ await sleep(150); g = (await call("GET", "/api/gen")).gens.at(-1); if (!["attente", "en_cours"].includes(g.status)) break; }
    assert.equal(g.status, "fait", g.msg);
    const c = (await call("GET", "/api/db")).docs["controles/genTest00001"];
    assert.equal(c.questions.reduce((a, q) => a + q.points, 0), 20, "l'IA proposait 22 points");
    assert.deepEqual(c.questions[1].v.standard.bonnes, [0], "QCM inutilisable remplacé");
    assert.deepEqual(c.verif, [{k:"points", avant:22, total:20}, {k:"version", q:3, l:"approfondi"}]);
    assert.equal(c.questions[2].v.approfondi.enonce, c.questions[2].v.standard.enonce);
  });
});
