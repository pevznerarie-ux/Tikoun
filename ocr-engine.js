/* Mastery OCR experiment — isolated server module. No third-party dependency.
 * Input: one ORIGINAL, tightly cropped answer image as PNG/JPEG base64.
 * This module never assigns a score and never sees the expected solution.
 * Example integration is documented in ocr-engine-README.md.
 */
'use strict';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_CONTEXT = 500;
const PROMPT = `Lis UNIQUEMENT l'écriture manuscrite visible dans cette image de réponse d'élève.
Tu ne connais ni le corrigé ni la note. Ne résous aucun exercice et ne rectifie aucun calcul.
Transcris ligne par ligne, dans l'ordre spatial. Préserve chiffres, signes +/−, exposants, indices, barres de fraction, égalités, unités et décimales. Pour une fraction empilée, écris (numérateur)/(dénominateur). Préserve les ratures en indiquant "barree":true et transcris aussi l'ajout définitif. Ne transforme pas une réponse incohérente en réponse correcte.
Si tu hésites entre deux symboles, écris [?] à cet endroit et renseigne les lectures possibles. Une marque manuscrite visible interdit "cadre_vide":true. N'invente pas les traits cachés.
Réponds en JSON strict : {"cadre_vide":false,"lignes":[{"texte":"...","barree":false,"doutes":[{"segment":"...","lectures_possibles":["...","..."]}]}]}.`;

function parseOutput(value) {
  const raw = typeof value === 'string' ? value :
    Array.isArray(value?.content) ? value.content.filter(x => x.type === 'text').map(x => x.text).join('\n') : value;
  let result;
  try { result = typeof raw === 'string' ? JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) : raw; }
  catch { throw new Error('Réponse OCR non JSON'); }
  if (!result || typeof result.cadre_vide !== 'boolean' || !Array.isArray(result.lignes))
    throw new Error('Format OCR invalide');
  if (result.lignes.length > 100) throw new Error('Réponse OCR trop longue');
  return {
    cadre_vide: result.cadre_vide,
    lignes: result.lignes.map(line => ({
      texte: String(line?.texte ?? '').slice(0, 1000),
      barree: line?.barree === true,
      doutes: Array.isArray(line?.doutes) ? line.doutes.slice(0, 10).map(d => ({
        segment: String(d?.segment ?? '').slice(0, 80),
        lectures_possibles: Array.isArray(d?.lectures_possibles) ? d.lectures_possibles.slice(0, 4).map(x => String(x).slice(0, 80)) : []
      })) : []
    }))
  };
}

function inspect(result, hasInk) {
  const issues = [];
  if (result.cadre_vide && hasInk === true) issues.push('encre_detectee_mais_cadre_vide');
  if (!result.cadre_vide && result.lignes.length === 0) issues.push('aucune_ligne');
  if (result.lignes.some(l => l.texte.includes('[?]') || l.doutes.length)) issues.push('symboles_incertains');
  if (result.cadre_vide && result.lignes.some(l => l.texte.trim())) issues.push('vide_contradictoire');
  return issues;
}

function imageSource({mediaType, base64}) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mediaType)) throw new Error('Image PNG/JPEG/WebP requise');
  if (typeof base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0)
    throw new Error('Image base64 invalide');
  const bytes = Buffer.from(base64, 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('Image absente ou trop lourde');
  return {type:'image',source:{type:'base64',media_type:mediaType,data:base64}};
}

/* callModel({tier,messages}) must call a server-side AI provider and return its response.
 * hasInk must come from an independent image/pixel check; omit when unavailable.
 * A second, more expensive read happens only for an explicit OCR uncertainty.
 */
async function recognize({mediaType, base64, context = '', hasInk, callModel, quickTier = 'quick', preciseTier = 'complex'}) {
  if (typeof callModel !== 'function') throw new Error('callModel requis');
  const image = imageSource({mediaType,base64});
  const instruction = PROMPT + (context ? `\nContexte de lecture uniquement (pas de corrigé) : ${String(context).slice(0,MAX_CONTEXT)}` : '');
  const messages = [{role:'user',content:[image,{type:'text',text:instruction}]}];
  let first, firstIssue = [];
  try { first = parseOutput(await callModel({tier:quickTier,messages})); firstIssue = inspect(first,hasInk); }
  catch (e) { firstIssue = ['sortie_invalide']; }
  if (first && firstIssue.length === 0) return {lecture:first,lecture_initiale:first,relue:false,a_verifier:false,motifs:[]};
  const second = parseOutput(await callModel({tier:preciseTier,messages}));
  const issues = inspect(second,hasInk);
  const disagreement = !!first && JSON.stringify(first) !== JSON.stringify(second);
  return {lecture:second,lecture_initiale:first || null,relue:true,a_verifier:issues.length > 0 || disagreement,
    motifs:[...new Set([...issues,...(disagreement ? ['lectures_divergentes'] : [])])]};
}

module.exports = {recognize,parseOutput,inspect};
