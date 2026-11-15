/* Envoi des e-mails par SMTP : un faux serveur SMTP reçoit l'e-mail d'essai de l'administrateur et le lien de mot de passe oublié. */
"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const http = require("http"), net = require("net"), fs = require("fs"), os = require("os"), path = require("path"), {spawn} = require("child_process");
const listen = srv => new Promise(r => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const sleep = ms => new Promise(r => setTimeout(r, ms));

test("e-mails par SMTP", {timeout:60000}, async t => {
  const recus = [];
  const smtp = net.createServer(sock => { let data = false, corps = "", buf = "", m = {auth:[]}; sock.setEncoding("utf8"); sock.write("220 faux.smtp ESMTP\r\n");
    sock.on("data", d => { buf += d; let i;
      while ((i = buf.indexOf("\r\n")) >= 0){ const l = buf.slice(0, i); buf = buf.slice(i + 2);
        if (data){ if (l === "."){ data = false; m.corps = corps; recus.push(m); sock.write("250 2.0.0 OK\r\n"); } else corps += l + "\n"; continue; }
        if (/^EHLO/i.test(l)) sock.write("250-faux.smtp\r\n250-AUTH LOGIN PLAIN\r\n250 SIZE 1000000\r\n");
        else if (/^AUTH LOGIN/i.test(l)){ m.etape = 1; sock.write("334 VXNlcm5hbWU6\r\n"); }
        else if (m.etape === 1){ m.auth.push(Buffer.from(l, "base64").toString()); m.etape = 2; sock.write("334 UGFzc3dvcmQ6\r\n"); }
        else if (m.etape === 2){ m.auth.push(Buffer.from(l, "base64").toString()); m.etape = 0; sock.write(m.auth[1] === "abcdefghijklmnop" ? "235 2.7.0 Accepted\r\n" : "535 5.7.8 Username and Password not accepted\r\n"); }
        else if (/^MAIL FROM:/i.test(l)){ m.de = l; sock.write("250 OK\r\n"); }
        else if (/^RCPT TO:/i.test(l)){ m.a = l; sock.write("250 OK\r\n"); }
        else if (/^DATA/i.test(l)){ data = true; sock.write("354 Go ahead\r\n"); }
        else if (/^QUIT/i.test(l)){ sock.end("221 Bye\r\n"); }
        else sock.write("500 ?\r\n"); } }); sock.on("error", () => {}); });
  const smtpPort = await listen(smtp);
  const lancer = async pass => { const data = fs.mkdtempSync(path.join(os.tmpdir(), "mastery-mail-")), probe = http.createServer(), port = await listen(probe); await new Promise(r => probe.close(r));
    const srv = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {env:{...process.env, DATA_DIR:data, MASTERY_CODE:"test", ANTHROPIC_API_KEY:"", STRIPE_SECRET_KEY:"", RESEND_API_KEY:"", MAIL_FROM:"", APP_URL:"", PORT:String(port), SMTP_HOST:"127.0.0.1", SMTP_PORT:String(smtpPort), SMTP_USER:"mastery.essai@gmail.com", SMTP_PASS:pass}, stdio:"ignore"});
    t.after(async () => { await new Promise(r => { srv.once("exit", r); srv.kill(); }); fs.rmSync(data, {recursive:true, force:true, maxRetries:5, retryDelay:100}); });
    const B = "http://127.0.0.1:" + port; let cookie = "";
    const call = async (method, p, body) => { const r = await fetch(B + p, {method, headers:{"content-type":"application/json", cookie}, body:body ? JSON.stringify(body) : undefined}); const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0]; const txt = await r.text(); try { return {status:r.status, ...JSON.parse(txt)}; } catch(e){ return {status:r.status, txt}; } };
    for (let k = 0; k < 50; k++){ try { if ((await fetch(B + "/health")).ok) break; } catch(e){} await sleep(100); }
    await call("POST", "/api/setup", {code:"test", email:"direction@example.org", password:"motdepasse123", nom:"Direction"}); return call; };
  t.after(() => smtp.close());
  const texte = m => Buffer.from(m.corps.split("\n\n").slice(1).join(""), "base64").toString("utf8");

  // Mot de passe d'application écrit avec des espaces, comme Google l'affiche : accepté
  const call = await lancer("abcd efgh ijkl mnop");
  const essai = await call("POST", "/api/mail/test"); assert.deepEqual([essai.status, essai.to, essai.via], [200, "direction@example.org", "smtp"]);
  assert.equal(recus.length, 1); assert.deepEqual(recus[0].auth, ["mastery.essai@gmail.com", "abcdefghijklmnop"]);
  assert.equal(recus[0].de, "MAIL FROM:<mastery.essai@gmail.com>"); assert.equal(recus[0].a, "RCPT TO:<direction@example.org>");
  assert.match(recus[0].corps, /^From: Mastery <mastery\.essai@gmail\.com>$/m); assert.match(recus[0].corps, /^Subject: =\?UTF-8\?B\?/m);
  assert.match(texte(recus[0]), /Made by Les Institutions Sinaï/);
  // Mot de passe oublié d'un professeur : le lien part par SMTP
  assert.deepEqual(await call("POST", "/api/password/forgot", {email:"direction@example.org"}), {status:200, mail:true, contact:"direction@example.org"});
  for (let k = 0; k < 40 && recus.length < 2; k++) await sleep(50);
  assert.match(texte(recus[1]), /\/app#\/reset\/[a-f0-9]{48}/);
  // Mauvais mot de passe : l'essai dit pourquoi
  const call2 = await lancer("mauvais");
  const rate = await call2("POST", "/api/mail/test"); assert.equal(rate.status, 502); assert.match(rate.error.message, /535/);
});
