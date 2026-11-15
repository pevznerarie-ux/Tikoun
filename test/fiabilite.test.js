/* Tests de la logique de fiabilité : `npm test`. */
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const F = require("../fiabilite.js");

const rep = (o = {}) => ({transcription:"La somme des angles d'un triangle vaut 180 degrés.", lisible:true, noteIA:2, note:null, erreurs:[], acquis:[], valide:false, ...o});

test("doute : une réponse nette n'est pas signalée", () => {
  assert.deepEqual(F.doute(rep(), {points:2}, {confiance:3, fautes:0}), {n:0, r:[]});
});
test("doute : lecture devinée ou passages illisibles = à vérifier d'abord", () => {
  assert.equal(F.doute(rep({lisible:false}), {points:2}).n, 2);
  assert.deepEqual(F.doute(rep({transcription:"x = [illisible] et y = [illisible]"}), {points:2}).r, ["illisible"]);
  assert.equal(F.doute(rep({transcription:"x = [illisible] et y = [illisible]"}), {points:2}).n, 2);
  const long = "Le triangle ABC est rectangle en A car le carré de l'hypoténuse est égal à la somme [illisible] des deux autres côtés.";
  assert.equal(F.doute(rep({transcription:long}), {points:2}).n, 1);
});
test("doute : le détail par critère doit donner la note", () => {
  const a = rep({noteIA:2, detail:[{c:"définition", p:1}, {c:"exemple", p:0.5}]});
  assert.deepEqual(F.doute(a, {points:2}), {n:2, r:["detail"]});
  a.detail[1].p = 1;
  assert.equal(F.doute(a, {points:2}).n, 0);
});
test("doute : confiance déclarée, hésitation, note maximale avec erreurs, zéro sans erreur", () => {
  assert.equal(F.doute(rep(), {points:2}, {confiance:1}).n, 2);
  assert.equal(F.doute(rep(), {points:2}, {confiance:2}).n, 1);
  assert.deepEqual(F.doute(rep({hesite:"entre 1,5 et 2"}), {points:2}).r, ["hesite"]);
  assert.deepEqual(F.doute(rep({noteIA:2}), {points:2}, {fautes:1}).r, ["max_fautes"]);
  assert.deepEqual(F.doute(rep({noteIA:0}), {points:2}).r, ["zero"]);
  assert.equal(F.doute(rep({noteIA:0, erreurs:["confusion"]}), {points:2}).n, 0);
});
test("doute : QCM et cadre vide ne sont signalés que si le cochage est ambigu", () => {
  assert.equal(F.doute({auto:true, lisible:true, noteIA:0, transcription:""}, {points:1, type:"qcm"}).n, 0);
  assert.equal(F.doute({auto:true, lisible:false, noteIA:0, transcription:"Coché : A"}, {points:1, type:"qcm"}).n, 2);
  assert.equal(F.doute(rep({transcription:"je ne sais pas", noteIA:0}), {points:2}, {vide:true, confiance:1}).n, 0);
});
test("completer : garde le détail et l'hésitation, borne les points", () => {
  const a = F.completer(rep({noteIA:1.5}), {detail:[{critere:"formule", points:1}, {critere:"calcul", points:9}, {points:1}], hesitation:" entre 1,5 et 2 ", confiance:3, fautes:["x"]}, {points:2});
  assert.deepEqual(a.detail, [{c:"formule", p:1}, {c:"calcul", p:2}]);
  assert.equal(a.hesite, "entre 1,5 et 2");
  assert.deepEqual(a.doute, {n:2, r:["hesite", "detail"]});
  const vide = F.completer({transcription:"", lisible:true, noteIA:0, auto:true}, {detail:[{critere:"x", points:1}], hesitation:"?"}, {points:2});
  assert.deepEqual([vide.detail, vide.hesite, vide.alt, vide.doute.n], [[], "", null, 0], "une nouvelle lecture efface les restes de la précédente");
});
test("ouvert : le doute est levé dès que le professeur note ou valide", () => {
  const a = rep({doute:{n:2, r:["lecture"]}});
  assert.equal(F.ouvert(a), 2);
  assert.equal(F.ouvert({...a, note:1}), 0);
  assert.equal(F.ouvert({...a, valide:true}), 0);
  assert.equal(F.ouvert(rep({lisible:false})), 2, "réponses d'avant cette version");
  assert.equal(F.ouvert(null), 0);
});
test("proche : insensible aux accents, à la casse, à la ponctuation, au nikoud", () => {
  assert.equal(F.proche("L'élève a écrit : Été.", "l eleve a ecrit ete"), 1);
  assert.equal(F.proche("בְּרֵאשִׁית", "בראשית"), 1);
  assert.ok(F.proche("la capitale de la France est Paris", "la capitale de la France est Lyon") < 0.9);
  assert.equal(F.proche("", ""), 1);
});
test("fusion : la relecture ne remplace jamais la réponse proposée ; elle lève le doute ou garde les deux lectures", () => {
  const p = rep({doute:{n:2, r:["lecture", "hesite"]}, lisible:false, noteIA:2});
  const ok = F.fusion(p, rep({doute:{n:0, r:[]}}));
  assert.deepEqual(ok.doute, {n:1, r:["relu", "hesite"]}, "le doute de lecture tombe, l'hésitation sur la note reste"); assert.equal(ok.alt, null); assert.equal(ok.lisible, false);
  const ko = F.fusion(p, rep({transcription:"La somme des angles vaut 360 degrés.", noteIA:0, commentaire:"Faux.", doute:{n:0, r:[]}}));
  assert.deepEqual(ko.doute, {n:2, r:["lectures", "lecture", "hesite"]});
  assert.equal(ko.transcription, p.transcription); assert.equal(ko.noteIA, 2, "la note proposée reste celle de la première lecture");
  assert.deepEqual(ko.alt, {transcription:"La somme des angles vaut 360 degrés.", noteIA:0, commentaire:"Faux."});
  assert.equal(F.fusion(p, rep({noteIA:1, doute:{n:0, r:[]}})).doute.n, 2, "même texte mais note différente");
  assert.equal(F.fusion(p, rep({doute:{n:2, r:["illisible"]}})).doute.n, 2, "les deux lectures butent : le doute reste entier");
  assert.equal(F.fusion(rep({doute:{n:2, r:["detail"]}}), rep({doute:{n:0, r:[]}})).doute.n, 2, "un détail des points incohérent n'est pas levé par une relecture");
});
test("fusion en renfort : la lecture du modèle précis devient la proposition", () => {
  const eco = rep({transcription:"la brakha est מזונות", noteIA:1, commentaire:"Faux.", doute:{n:1, r:["confiance"]}});
  const fort = rep({transcription:"la brakha est האדמה", noteIA:3, doute:{n:0, r:[]}});
  const r = F.fusion(eco, fort, {renfort:true});
  assert.equal(r.transcription, "la brakha est האדמה"); assert.equal(r.noteIA, 3);
  assert.deepEqual(r.doute, {n:1, r:["lectures"]}, "deux lectures différentes : au moins « à regarder »");
  assert.deepEqual(r.alt, {transcription:"la brakha est מזונות", noteIA:1, commentaire:"Faux."});
  const pareil = F.fusion(rep({doute:{n:2, r:["lecture"]}}), rep({doute:{n:0, r:[]}}), {renfort:true});
  assert.deepEqual(pareil.doute, {n:0, r:["relu"]}); assert.equal(pareil.alt, null);
  assert.equal(F.fusion(eco, rep({transcription:"x [illisible] y [illisible]", noteIA:3, doute:{n:2, r:["illisible"]}}), {renfort:true}).doute.n, 2, "le modèle précis doute lui-même");
});
test("hebreu : repère l'écriture hébraïque", () => {
  assert.equal(F.hebreu("la brakha est האדמה"), true); assert.equal(F.hebreu("la brakha est haadama"), false); assert.equal(F.hebreu(null), false);
});
test("remplir : remplace les repères sans interpréter le texte inséré", () => {
  assert.equal(F.remplir("Q{{N}} : {{ENONCE}} {{INCONNU}}", {N:3, ENONCE:"prix $& de {{N}}"}), "Q3 : prix $& de {{N}} {{INCONNU}}");
});

test("journal : validation, note changée, validation retirée, validation groupée", () => {
  const avant = {copies:{e1:{validee:false, answers:{q1:{noteIA:2, note:null, valide:false}, q2:{noteIA:1, note:null, valide:false}}}, e2:{validee:false, answers:{q1:{noteIA:0, valide:false}}}}};
  const un = F.journal(avant, {copies:{e1:{validee:true, answers:{q1:{noteIA:2, note:null, valide:true}, q2:{noteIA:1, note:1.5, valide:true}}}, e2:avant.copies.e2}}, "prof", "2026-11-15T10:00:00Z");
  assert.deepEqual(un, [{at:"2026-11-15T10:00:00Z", par:"prof", e:"e1", q:"q1", act:"valide", ia:2, note:2}, {at:"2026-11-15T10:00:00Z", par:"prof", e:"e1", q:"q2", act:"valide", ia:1, note:1.5}]);
  const lot = F.journal(avant, {copies:{e1:{validee:true, answers:{q1:{noteIA:2, valide:true}}}, e2:{validee:true, answers:{q1:{noteIA:0, valide:true}}}}}, "prof", "t");
  assert.deepEqual(lot.map(x => x.lot), [2, 2]);
  const valide = {copies:{e1:{validee:true, answers:{q1:{noteIA:2, note:null, valide:true}}}}};
  assert.deepEqual(F.journal(valide, {copies:{e1:{validee:false, answers:{q1:{noteIA:2, note:1, valide:false}}}}}, "prof", "t"), [{at:"t", par:"prof", e:"e1", q:"q1", act:"note", ia:2, avant:2, note:1, rouvre:true}]);
  assert.deepEqual(F.journal(valide, {copies:{e1:{validee:false, answers:{q1:{noteIA:2, note:null, valide:false}}}}}, "prof", "t").map(x => x.act), ["rouvre"]);
  assert.deepEqual(F.journal(valide, valide, "prof", "t"), []);
  const propose = {copies:{e1:{answers:{q1:{noteIA:2, note:null, valide:false}}}}};
  assert.deepEqual(F.journal(propose, {copies:{e1:{answers:{q1:{noteIA:2, note:2, valide:false}}}}}, "prof", "t").map(x => x.act), ["garde"], "le professeur garde la note proposée");
  assert.deepEqual(F.journal(propose, {copies:{e1:{answers:{q1:{noteIA:2, note:1, valide:false}}}}}, "prof", "t").map(x => x.act), ["note"]);
  assert.deepEqual(F.journal(null, {copies:{}}, "prof", "t"), []);
});

test("repartir : total exact, pas de 0,5, proportions gardées", () => {
  for (const [pts, total] of [[[4, 4, 4, 4, 6], 20], [[3, 3, 3], 20], [[5, 5, 5, 5, 5], 20], [[1, 1, 1, 1, 1, 1, 1], 20], [[10, 0.5], 20], [[2.5, 7, 3.5, 4, 1], 20], [[4, 4], 10]]){
    const r = F.repartir(pts, total);
    assert.equal(r.reduce((a, b) => a + b, 0), total, JSON.stringify(pts));
    assert.ok(r.every(p => p >= 0.5 && p * 2 === Math.round(p * 2)), JSON.stringify(r));
  }
  assert.deepEqual(F.repartir([4, 4, 4, 4, 4], 20), [4, 4, 4, 4, 4]);
  assert.deepEqual(F.repartir([2, 2, 2, 2, 2], 20), [4, 4, 4, 4, 4]);
  const r = F.repartir([8, 4, 4, 4, 4], 20); assert.ok(r[0] > r[1], "la plus grosse question reste la plus grosse");
});
test("sommeCriteres : lit les points annoncés, se tait quand ce n'est pas sûr", () => {
  assert.equal(F.sommeCriteres("1 pt pour la formule ; 2 pts pour le calcul ; 0,5 point pour l'unité", 4), 3.5);
  assert.equal(F.sommeCriteres("Sur 4 points : 1 pt pour la définition, 3 pts pour l'exemple.", 4), 4);
  assert.equal(F.sommeCriteres("0,5 point par élément juste, maximum 2 points", 2), null);
  assert.equal(F.sommeCriteres("Réponse complète attendue.", 2), null);
  assert.equal(F.sommeCriteres("2 points si juste", 2), null, "une seule mention ne suffit pas");
  assert.equal(F.sommeCriteres("2 pts méthode ; 2 pts résultat", 2), 4, "deux critères qui valent chacun le total : le total n'est pas « rappelé en tête »");
});

const q = (o = {}) => ({notion:"fractions", points:4, v:{standard:{enonce:"Calcule 1/2 + 1/3.", corrige:"5/6", criteres:"2 pts pour le dénominateur commun ; 2 pts pour le résultat"}}, ...o});
test("verifier : un contrôle correct passe sans remarque", () => {
  const V = F.verifier([q(), q(), q(), q(), q()], {total:20, n:5});
  assert.deepEqual(V.verif, []); assert.deepEqual(V.invalides, []);
});
test("verifier : le barème est ramené au total demandé", () => {
  const V = F.verifier([q(), q(), q(), q(), q({points:6})], {total:20, n:5});
  assert.equal(V.qs.reduce((a, x) => a + x.points, 0), 20);
  assert.deepEqual(V.verif, [{k:"points", avant:22, total:20}]);
  const fixe = F.verifier([q(), q({points:6})], {total:20, pointsFixes:true});
  assert.deepEqual(fixe.qs.map(x => x.points), [4, 6], "les points fixés par le professeur ne bougent pas");
  assert.deepEqual(F.verifier([q({points:1.25}), q({points:0})], {pointsFixes:true}).qs.map(x => x.points), [1.25, 0.5]);
});
test("verifier : questions inutilisables signalées et listées pour être redemandées", () => {
  const V = F.verifier([q({v:{standard:{enonce:" ", corrige:""}}}), q({type:"qcm", v:{standard:{enonce:"Choisis", choix:["a", "a"], bonnes:[0]}}}), q({type:"qcm", v:{standard:{enonce:"Choisis", choix:["a", "b"], bonnes:[]}}}),
    q({type:"qcm", v:{standard:{enonce:"Choisis", choix:["a", "b", "c"], bonnes:[2]}}}), q({v:{standard:{enonce:"Explique.", corrige:""}}})], {});
  assert.deepEqual(V.invalides, [0, 1, 2]);
  assert.deepEqual(V.verif.map(x => x.k + x.q), ["vide1", "qcm2", "qcm3", "corrige5"]);
  assert.deepEqual(F.invalides(V.qs), [0, 1, 2]);
  assert.deepEqual(F.invalides([q()]), []);
});
test("verifier : versions différenciées absentes remplacées, niveaux identiques signalés", () => {
  const std = {enonce:"Calcule 1/2 + 1/3.", corrige:"5/6", criteres:""};
  const V = F.verifier([q({v:{standard:std}}), q({v:{socle:{...std}, standard:std, approfondi:{...std}}}), q({v:{socle:{...std, enonce:"Aide : mets au même dénominateur. Calcule 1/2 + 1/3."}, standard:std, approfondi:{...std, enonce:"Calcule 1/2 + 1/3 et justifie."}}})], {differencie:true});
  assert.deepEqual(V.verif, [{k:"version", q:1, l:"socle"}, {k:"version", q:1, l:"approfondi"}, {k:"memes", q:2}]);
  assert.equal(V.qs[0].v.socle.enonce, std.enonce);
  assert.deepEqual(F.verifier([q({v:{standard:std}})], {}).verif, [], "sans feuilles différenciées, une seule version suffit");
});
test("verifier : critères, sujets non couverts, nombre de questions", () => {
  const V = F.verifier([q({sujet:"Chapitre 1 · Les fractions", v:{standard:{enonce:"Calcule.", corrige:"5/6", criteres:"1 pt pour la méthode ; 1 pt pour le résultat"}}}), q({sujet:"Les fractions"})], {sujets:["Chapitre 1 · Les fractions", "Chapitre 2 · Les pourcentages"], n:3});
  assert.deepEqual(V.verif, [{k:"criteres", q:1, somme:2, points:4}, {k:"sujet", s:"Chapitre 2 · Les pourcentages"}, {k:"nombre", n:2, voulu:3}]);
  assert.deepEqual(F.verifier([q(), q()], {sujets:["A", "B"]}).verif, [], "sans sujet indiqué par l'IA, on ne conclut rien");
  assert.deepEqual(F.verifier([q({sujet:"Chapitre 1"}), q({sujet:"Chap. 2 : pourcentages"})], {sujets:["Chapitre 1 · Les fractions", "Chapitre 2 · Les pourcentages"]}).verif, [{k:"sujet", s:"Chapitre 1 · Les fractions"}].slice(1), "numéro ou mot du titre reconnu");
});
test("plan : types et compétences reconnus, total ramené à 20", () => {
  const P = F.plan([{sujet:"Ch. 1", notion:"Additionner deux fractions", type:"Application", competence:"Raisonner", points:5}, {notion:"Définition", type:"inconnu", competence:"x", points:5}, {notion:"", points:3}, {notion:"Problème", type:"probleme", points:5}], {total:20, n:5, types:["cours", "application", "probleme"]});
  assert.equal(P.length, 3);
  assert.deepEqual(P.map(x => x.type), ["application", "cours", "probleme"]);
  assert.deepEqual(P.map(x => x.comp), ["raisonner", "", ""]);
  assert.equal(P.reduce((a, x) => a + x.points, 0), 20);
});
