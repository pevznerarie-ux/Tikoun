// Applique une traduction (clé = texte français exact, sans espaces autour) à un fichier HTML construit.
// Usage : node i18n/i18n.js apply in.html dict.json out.html   → écrit aussi out.html.missing.json
"use strict";
const fs = require("fs"), path = require("path");
const acorn = require(process.env.ACORN || path.join(__dirname, "..", "node_modules", "acorn"));
const [, , cmd, inF, dictF, outF] = process.argv;
if (cmd !== "apply") { console.error("usage: apply in dict out"); process.exit(1); }
const html = fs.readFileSync(inF, "utf8"), D = JSON.parse(fs.readFileSync(dictF, "utf8"));
const missing = new Set();
const FR = /[éèêàùçôîâûœÉÈÀÇ]|\b(le|la|les|des|du|une|un|et|pour|avec|dans|sur|pas|ton|ta|tes|vous|votre|est)\b/i;
function trPiece(p, unesc, esc){
  const m = p.match(/^(\s*)([\s\S]*?)(\s*)$/); const core = m[2]; if (!core) return p;
  const key = unesc(core), has = k => Object.prototype.hasOwnProperty.call(D, k);
  if (has(key)) return m[1] + esc(D[key]) + m[3];
  if (key.includes("&amp;") && has(key.replace(/&amp;/g, "&"))) return m[1] + esc(D[key.replace(/&amp;/g, "&")].replace(/&/g, "&amp;")) + m[3];
  if (/[A-Za-zÀ-ÿ]{3}/.test(key) && FR.test(key) && !/^[\w.-]+$/.test(key) && !/[{};=]|=>|function/.test(key)) missing.add(key);
  return p;
}
function trText(t, unesc = x => x, esc = x => x){
  const whole = t.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (whole[2] && Object.prototype.hasOwnProperty.call(D, unesc(whole[2]))) return whole[1] + esc(D[unesc(whole[2])]) + whole[3];
  // morceaux : balises complètes, début de chaîne qui termine une balise ouverte ailleurs, fin de chaîne qui en ouvre une
  const parts = []; let rest = t;
  const head = rest.match(/^[^<>]*>/); if (head && !/^\s*$/.test(head[0])){ parts.push({tag:true, v:head[0]}); rest = rest.slice(head[0].length); }
  let tail = null; const tm = rest.match(/<[^<>]*$/); if (tm){ tail = tm[0]; rest = rest.slice(0, tm.index); }
  rest.split(/(<[^<>]*>)/).forEach(seg => parts.push({tag:/^<[^<>]*>$/.test(seg), v:seg}));
  if (tail) parts.push({tag:true, v:tail});
  return parts.map(x => x.tag ? x.v.replace(/\b(placeholder|title|aria-label|alt)=(\\?")([^"$`\\]*)\2/g, (all, a, q, v) => `${a}=${q}${trPiece(v, unesc, esc)}${q}`) : trPiece(x.v, unesc, esc)).join("");
}
const unJS = q => s => s;
const enJS = q => s => q === "`" ? s.replace(/(^|[^\\])`/g, "$1\\`").replace(/(^|[^\\])\$\{/g, "$1\\${") : s.replace(new RegExp("(^|[^\\\\])" + q, "g"), "$1\\" + q);
function trJS(code){
  let ast; try { ast = acorn.parse(code, {ecmaVersion:"latest", sourceType:"script", allowReturnOutsideFunction:true}); } catch(e){ console.error("JS non analysable :", e.message); return code; }
  const spots = [];
  (function walk(n, isKey){ if (!n || typeof n.type !== "string") return;
    if (n.type === "Literal" && typeof n.value === "string" && !isKey) spots.push({s:n.start + 1, e:n.end - 1, q:code[n.start]});
    else if (n.type === "TemplateElement") spots.push({s:n.start, e:n.end, q:"`"});
    for (const k in n){ if (k === "parent") continue; const v = n[k]; const key = k === "key" && n.type === "Property" && !n.computed;
      if (Array.isArray(v)) v.forEach(x => walk(x, false)); else if (v && typeof v.type === "string") walk(v, key); } })(ast);
  // ignorer les clés d'objet et les noms de propriétés techniques : seulement si le texte ressemble à du texte affiché
  spots.sort((a, b) => b.s - a.s);
  for (const sp of spots){ const raw = code.slice(sp.s, sp.e); const out = trText(raw, unJS(sp.q), enJS(sp.q)); if (out !== raw) code = code.slice(0, sp.s) + out + code.slice(sp.e); }
  return code;
}
let out = "", i = 0; const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>|<style[^>]*>[\s\S]*?<\/style>/gi; let m;
while ((m = re.exec(html))){
  out += trText(html.slice(i, m.index));
  if (m[0].startsWith("<style")) out += m[0];
  else if (/\ssrc=/.test(m[1] || "") || /application\/ld\+json/.test(m[1] || "")) out += m[0];
  else { const open = m[0].slice(0, m[0].indexOf(">") + 1); out += open + trJS(m[2]) + "</script>"; }
  i = m.index + m[0].length;
}
out += trText(html.slice(i));
fs.writeFileSync(outF, out); fs.writeFileSync(outF + ".missing.json", JSON.stringify([...missing].sort(), null, 1));
