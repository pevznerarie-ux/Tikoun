/* Mastery · moteur d'analyse des copies côté serveur (généré par build.py : ne pas modifier à la main).
   Mêmes fonctions de lecture que dans l'application (QR, repères, découpe des cadres), exécutées sur le serveur
   pour que le professeur puisse fermer l'application dès que le fichier est envoyé. */
"use strict";
const {createCanvas} = require("@napi-rs/canvas");
const jsQR = require("jsqr");
const window = {jsQR};
const document = {createElement: () => createCanvas(1, 1)};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const CORNERS = {tl:[58, 58], tr:[752, 42], bl:[42, 1081], br:[752, 1081]}; const CSIZE = {tl:84, tr:52, bl:52, br:52};
const LEVELS = ["socle","standard","approfondi"];
const vOf = (q, lvl) => { const v = q.v || {}; if (v[lvl]?.enonce) return v[lvl]; if (v.standard?.enonce) return v.standard; return LEVELS.map(l => v[l]).find(x => x?.enonce) || {enonce:"", corrige:"", criteres:""}; };
const pageQ = pg => Array.isArray(pg) ? pg : (pg?.q || []);
async function nativeQR(){ return []; }
