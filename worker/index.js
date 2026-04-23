
import TRIAGE_PROMPT from '../prompts/triage.js';
import HAIKU_PROMPT from '../prompts/haiku.js';
import SONNET_PROMPT from '../prompts/sonnet.js';

const GRATIS_PROMPT = `Du bist ein Analyse-System für Verträge und Kündigungen in Deutschland.

Deine Aufgabe:
Lies das Dokument und erstelle eine kurze, kostenlose Ersteinschätzung für den Verbraucher.

Fokus: Gibt es eine Möglichkeit, den Vertrag früher oder günstiger zu beenden?

Gib deine Antwort IMMER exakt in dieser Struktur zurück:

[COMPANY]
Name des Unternehmens oder Anbieters
[/COMPANY]

[CONTRACT_TYPE]
Art des Vertrags (z.B. Handyvertrag, Stromvertrag, Fitnessstudio)
[/CONTRACT_TYPE]

[MONTHLY_COST]
Monatliche Kosten als Zahl (nur Zahl, kein €-Zeichen)
[/MONTHLY_COST]

[CANCELLATION_DATE]
Frühestmögliches Kündigungsdatum (z.B. 31.12.2025) oder "unklar"
[/CANCELLATION_DATE]

[RISK]
low oder medium oder high
[/RISK]

[TEASER]
Schreibe genau 1 Satz: Nenne NUR dass möglicherweise eine frühere Kündigung möglich ist.
Nenne KEINE Gründe, KEINE Paragraphen, KEINE Details.
[/TEASER]`;

// ── Claude API ────────────────────────────────────────────────────────────────

async function callClaudeDocument(env, { model, maxTokens, prompt, fileBase64, mediaType }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        {
          role: "user",
          content: [
            mediaType === "application/pdf"
              ? { type: "document", source: { type: "base64", media_type: mediaType, data: fileBase64 } }
              : { type: "image", source: { type: "base64", media_type: mediaType, data: fileBase64 } },
            { type: "text", text: prompt }
          ]
        }
      ]
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude API Fehler: ${JSON.stringify(data)}`);
  return data?.content?.[0]?.text || "";
}

// ── Utils ─────────────────────────────────────────────────────────────────────

async function fileToBase64(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return { base64: btoa(binary), mediaType: file.type || "application/pdf" };
}

function safeJsonParse(str) {
  try {
    const match = String(str).match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch { return null; }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}

function validateUploadInput({ file, name, email }) {
  if (!file) return "Keine Datei empfangen";
  if (!name || !String(name).trim()) return "Name fehlt";
  if (!email || !String(email).includes("@")) return "Ungültige E-Mail-Adresse";
  return null;
}

function extractTaggedSection(text, tag) {
  const start = `[${tag}]`;
  const end = `[/${tag}]`;
  const startIndex = text.indexOf(start);
  const endIndex = text.indexOf(end);
  if (startIndex === -1 || endIndex === -1) return "";
  return text.substring(startIndex + start.length, endIndex).trim();
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

// ── RTF ───────────────────────────────────────────────────────────────────────

function rtfEscape(str) {
  return String(str || "")
    .replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}")
    .replace(/\n/g, "\\par\n")
    .replace(/[^\x00-\x7F]/g, c => `\\u${c.charCodeAt(0)}?`);
}

function rtfToBase64(rtfString) {
  const bytes = new TextEncoder().encode(rtfString);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function maakAnalyseRtf(analysis, customerName, customerEmail, triage) {
  const title = extractTaggedSection(analysis, "TITLE") || "Vertragsanalyse";
  const summary = extractTaggedSection(analysis, "SUMMARY");
  const issues = extractTaggedSection(analysis, "ISSUES");
  const assessment = extractTaggedSection(analysis, "ASSESSMENT");
  const nextSteps = extractTaggedSection(analysis, "NEXT_STEPS");

  const issueLines = String(issues || "").split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => `{\\pard\\sb0\\sa200\\fi-300\\li300\\f1\\fs22 \\bullet  ${rtfEscape(l.replace(/^- /, ""))}\\par}`)
    .join("\n");

  const nextLines = String(nextSteps || "").split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => `{\\pard\\sb0\\sa200\\fi-300\\li300\\f1\\fs22 \\bullet  ${rtfEscape(l.replace(/^- /, ""))}\\par}`)
    .join("\n");

  return `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}{\\f1\\fswiss\\fcharset0 Arial;}}
{\\colortbl;\\red27\\green58\\blue140;\\red153\\green26\\blue26;}
\\paperw11906\\paperh16838\\margl1800\\margr1800\\margt1440\\margb1440
\\f1\\fs22
{\\pard\\sb400\\sa200\\f1\\fs32\\b\\cf1 ${rtfEscape(title)}\\par}
{\\pard\\sb0\\sa100\\f1\\fs20\\cf0 Kunde: ${rtfEscape(customerName || "")} (${rtfEscape(customerEmail || "")})\\par}
{\\pard\\sb0\\sa200\\f1\\fs20\\cf0 Anbieter: ${rtfEscape(triage?.company || "unbekannt")} | Vertragsart: ${rtfEscape(triage?.contract_type || "unbekannt")} | Risiko: ${rtfEscape(triage?.risk || "")}\\par}
{\\pard\\sb300\\sa120\\f1\\fs24\\b Zusammenfassung\\par}
{\\pard\\sa200\\f1\\fs22 ${rtfEscape(summary)}\\par}
{\\pard\\sb300\\sa120\\f1\\fs24\\b M\\u246?gliche K\\u252?ndigungsm\\u246?glichkeiten\\par}
${issueLines}
{\\pard\\sb300\\sa120\\f1\\fs24\\b Einsch\\u228?tzung\\par}
{\\pard\\sa200\\f1\\fs22 ${rtfEscape(assessment)}\\par}
{\\pard\\sb300\\sa120\\f1\\fs24\\b N\\u228?chste Schritte\\par}
${nextLines}
{\\pard\\sb400\\sa100\\f1\\fs18\\cf0\\i Hinweis: Dies ist eine informative Analyse und keine Rechtsberatung.\\par}
}`;
}

function maakKuendigungRtf(analysis, customerName, triage) {
  const objection = extractTaggedSection(analysis, "OBJECTION");

  return `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}{\\f1\\fswiss\\fcharset0 Arial;}}
{\\colortbl;\\red27\\green58\\blue140;\\red153\\green26\\blue26;}
\\paperw11906\\paperh16838\\margl1800\\margr1800\\margt1440\\margb1440
\\f1\\fs22
{\\pard\\sb400\\sa200\\f1\\fs28\\b\\cf2 K\\u252?ndigungsschreiben\\par}
{\\pard\\sb0\\sa200\\f1\\fs20\\cf0 Erstellt f\\u252?r: ${rtfEscape(customerName || "")} | Anbieter: ${rtfEscape(triage?.company || "unbekannt")}\\par}
{\\pard\\sb300\\sa200\\f1\\fs22\\cf0 ${rtfEscape(objection)}\\par}
{\\pard\\sb400\\sa100\\f1\\fs18\\cf0\\i Hinweis: Dies ist ein Entwurf und keine Rechtsberatung. Bitte sende das Schreiben per Einschreiben, wenn eine schriftliche K\\u252?ndigung erforderlich ist.\\par}
}`;
}

function maakAdminRtf(analysis, customerName, customerEmail, triage) {
  const title = extractTaggedSection(analysis, "TITLE") || "Vertragsanalyse";
  const summary = extractTaggedSection(analysis, "SUMMARY");
  const issues = extractTaggedSection(analysis, "ISSUES");
  const assessment = extractTaggedSection(analysis, "ASSESSMENT");
  const nextSteps = extractTaggedSection(analysis, "NEXT_STEPS");
  const objection = extractTaggedSection(analysis, "OBJECTION");

  const issueLines = String(issues || "").split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => `{\\pard\\sb0\\sa200\\fi-300\\li300\\f1\\fs22 \\bullet  ${rtfEscape(l.replace(/^- /, ""))}\\par}`)
    .join("\n");

  const nextLines = String(nextSteps || "").split("\n").map(l => l.trim()).filter(Boolean)
    .map(l => `{\\pard\\sb0\\sa200\\fi-300\\li300\\f1\\fs22 \\bullet  ${rtfEscape(l.replace(/^- /, ""))}\\par}`)
    .join("\n");

  return `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0\\froman\\fcharset0 Times New Roman;}{\\f1\\fswiss\\fcharset0 Arial;}}
{\\colortbl;\\red27\\green58\\blue140;\\red153\\green26\\blue26;}
\\paperw11906\\paperh16838\\margl1800\\margr1800\\margt1440\\margb1440
\\f1\\fs22
{\\pard\\sb400\\sa200\\f1\\fs32\\b\\cf1 ${rtfEscape(title)}\\par}
{\\pard\\sb0\\sa100\\f1\\fs20\\cf0 Kunde: ${rtfEscape(customerName || "")} (${rtfEscape(customerEmail || "")})\\par}
{\\pard\\sb0\\sa200\\f1\\fs20\\cf0 Anbieter: ${rtfEscape(triage?.company || "unbekannt")} | Vertragsart: ${rtfEscape(triage?.contract_type || "unbekannt")} | Risiko: ${rtfEscape(triage?.risk || "")}\\par}
{\\pard\\sb300\\sa120\\f1\\fs24\\b Zusammenfassung\\par}
{\\pard\\sa200\\f1\\fs22 ${rtfEscape(summary)}\\par}
{\\pard\\sb300\\sa120\\f1\\fs24\\b M\\u246?gliche K\\u252?ndigungsm\\u246?glichkeiten\\par}
${issueLines}
{\\pard\\sb300\\sa120\\f1\\fs24\\b Einsch\\u228?tzung\\par}
{\\pard\\sa200\\f1\\fs22 ${rtfEscape(assessment)}\\par}
{\\pard\\sb300\\sa120\\f1\\fs24\\b N\\u228?chste Schritte\\par}
${nextLines}
{\\pard\\sa200\\par}
{\\pard\\sb300\\sa120\\f1\\fs24\\b\\cf2 K\\u252?ndigungsschreiben\\par}
{\\pard\\sa200\\f1\\fs22\\cf0 ${rtfEscape(objection)}\\par}
{\\pard\\sb400\\sa100\\f1\\fs18\\cf0\\i Hinweis: Dies ist eine informative Analyse und keine Rechtsberatung.\\par}
}`;
}

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleTriage(env, fileBase64, mediaType) {
  const raw = await callClaudeDocument(env, {
    model: "claude-haiku-4-5-20251001", maxTokens: 800,
    prompt: TRIAGE_PROMPT, fileBase64, mediaType
  });
  const parsed = safeJsonParse(raw);
  if (!parsed) return { company: null, contract_type: null, monthly_cost: null, cancellation_date: null, risk: "medium", route: "SONNET" };
  return {
    company: parsed.company || null,
    contract_type: parsed.contract_type || null,
    monthly_cost: typeof parsed.monthly_cost === "number" ? parsed.monthly_cost : null,
    cancellation_date: parsed.cancellation_date || null,
    risk: parsed.risk || "medium",
    route: parsed.route || "SONNET"
  };
}

async function handleGratisAnalyse(env, fileBase64, mediaType) {
  const raw = await callClaudeDocument(env, {
    model: "claude-haiku-4-5-20251001", maxTokens: 600,
    prompt: GRATIS_PROMPT, fileBase64, mediaType
  });
  return {
    company: extractTaggedSection(raw, "COMPANY") || null,
    contract_type: extractTaggedSection(raw, "CONTRACT_TYPE") || null,
    monthly_cost: parseFloat(extractTaggedSection(raw, "MONTHLY_COST")) || null,
    cancellation_date: extractTaggedSection(raw, "CANCELLATION_DATE") || null,
    risk: extractTaggedSection(raw, "RISK") || "medium",
    teaser: extractTaggedSection(raw, "TEASER") || null
  };
}

async function generateAnalysis(env, { fileBase64, mediaType, route }) {
  const useSonnet = route === "SONNET";
  const prompt = useSonnet ? SONNET_PROMPT : HAIKU_PROMPT;
  const model = useSonnet ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";
  const raw = await callClaudeDocument(env, {
    model, maxTokens: useSonnet ? 3500 : 1800, prompt, fileBase64, mediaType
  });
  return raw || "";
}

// ── Mail HTML helpers ─────────────────────────────────────────────────────────

function buildGratisMailHtml({ name, company, contract_type, monthly_cost, cancellation_date, risk, teaser, stripeLink }) {
  const riskLabel = { low: "Niedrig", medium: "Mittel", high: "Hoch" }[risk] || risk;
  const monthlyCostStr = monthly_cost ? `€ ${parseFloat(monthly_cost).toFixed(2)}/Monat` : "unbekannt";

  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
      <h2 style="color:#1d3a6e;">Deine kostenlose Ersteinschätzung</h2>
      <p>Hallo ${escapeHtml(name)},</p>
      <p>wir haben deinen Vertrag mit <strong>${escapeHtml(company || "unbekanntem Anbieter")}</strong> analysiert.</p>
      <table style="width:100%;border-collapse:collapse;margin:24px 0;">
        <tr style="background:#f3f4f6;">
          <td style="padding:10px 14px;font-weight:bold;">Vertragsart</td>
          <td style="padding:10px 14px;">${escapeHtml(contract_type || "unbekannt")}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:bold;">Monatliche Kosten</td>
          <td style="padding:10px 14px;">${monthlyCostStr}</td>
        </tr>
        ${cancellation_date && cancellation_date !== "unklar" ? `
        <tr style="background:#f3f4f6;">
          <td style="padding:10px 14px;font-weight:bold;">Frühestmögliche Kündigung</td>
          <td style="padding:10px 14px;font-weight:bold;color:#1d3a6e;">${escapeHtml(cancellation_date)}</td>
        </tr>` : ""}
        <tr style="background:#f3f4f6;">
          <td style="padding:10px 14px;font-weight:bold;">Risiko-Einschätzung</td>
          <td style="padding:10px 14px;">${riskLabel}</td>
        </tr>
      </table>
      <p style="background:#fef9c3;border-left:4px solid #eab308;padding:12px 16px;border-radius:4px;">
        ${escapeHtml(teaser || "Möglicherweise gibt es eine Möglichkeit, diesen Vertrag früher zu beenden.")}
      </p>
      <p>Für eine vollständige Analyse mit fertigem Kündigungsschreiben:</p>
      <a href="${stripeLink}" style="display:inline-block;background:#1d3a6e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;margin:8px 0;">
        Vollständige Analyse für €29 →
      </a>
      <p style="color:#6b7280;font-size:0.85rem;margin-top:32px;">
        Hinweis: Dies ist eine informative Ersteinschätzung und keine Rechtsberatung.
        Bei komplexen Situationen empfehlen wir, einen Anwalt oder die Verbraucherzentrale zu kontaktieren.
      </p>
    </div>
  `;
}

// ── Mailers ───────────────────────────────────────────────────────────────────

async function sendAdminGratisNotification(env, { name, email, gratis, stripeLink }) {
  const html = buildGratisMailHtml({ name, ...gratis, stripeLink });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Kündigungs Check DE <noreply@kuendigungscheck.de>",
      to: ["dickgroen2@gmail.com"],
      reply_to: [email],
      subject: `Neue Gratis-Anfrage: ${name} (${email})`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <p style="background:#f3f4f6;padding:10px 14px;border-radius:6px;font-size:0.85rem;color:#6b7280;">
            📬 Klantmail wordt morgen om 15:00 verstuurd naar <strong>${escapeHtml(email)}</strong>
          </p>
          ${html}
        </div>
      `
    })
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Admin-notificatie mislukt: ${err}`); }
}

async function sendAdminPaidNotification(env, { customerName, customerEmail, triage, analysis }) {
  const rtfContent = maakAdminRtf(analysis, customerName, customerEmail, triage);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Kündigungs Check DE <noreply@kuendigungscheck.de>",
      to: ["dickgroen2@gmail.com"],
      reply_to: [customerEmail],
      subject: `Neue bezahlte Analyse: ${customerName || "Unbekannt"} (${customerEmail})`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:720px;margin:0 auto;">
          <p style="background:#f3f4f6;padding:10px 14px;border-radius:6px;font-size:0.85rem;color:#6b7280;">
            📬 Klantmail (2 bijlagen) wordt morgen om 15:00 verstuurd naar <strong>${escapeHtml(customerEmail)}</strong>
          </p>
          <h2>Neue bezahlte Vertragsanalyse</h2>
          <p><strong>Name:</strong> ${escapeHtml(customerName || "")}</p>
          <p><strong>E-Mail:</strong> ${escapeHtml(customerEmail || "")}</p>
          <p><strong>Anbieter:</strong> ${escapeHtml(triage?.company || "unbekannt")}</p>
          <p><strong>Vertragsart:</strong> ${escapeHtml(triage?.contract_type || "unbekannt")}</p>
          <p><strong>Monatliche Kosten:</strong> ${triage?.monthly_cost ? `€ ${triage.monthly_cost}` : "unbekannt"}</p>
          <p><strong>Risiko:</strong> ${escapeHtml(triage?.risk || "")}</p>
          <p style="color:#6b7280;font-size:0.9rem;">Vollständige Analyse als RTF-Datei angehängt.</p>
        </div>
      `,
      attachments: [{ filename: "Vertragsanalyse.rtf", content: rtfToBase64(rtfContent) }]
    })
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Admin-Mail fehlgeschlagen: ${err}`); }
}

async function sendDelayedGratisEmail(env, entry) {
  const html = buildGratisMailHtml({
    name: entry.name,
    company: entry.company,
    contract_type: entry.contract_type,
    monthly_cost: entry.monthly_cost,
    cancellation_date: entry.cancellation_date,
    risk: entry.risk,
    teaser: entry.teaser,
    stripeLink: entry.stripe_link || "https://kuendigungscheck.de"
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Kündigungs Check DE <noreply@kuendigungscheck.de>",
      to: [entry.email],
      subject: "Deine kostenlose Ersteinschätzung – Kündigungs Check DE",
      html
    })
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Gratis mail mislukt: ${err}`); }
}

async function sendDelayedPaidEmail(env, entry) {
  const analyseRtf = maakAnalyseRtf(entry.analysis, entry.name, entry.email, entry.triage);
  const kuendigungRtf = maakKuendigungRtf(entry.analysis, entry.name, entry.triage);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Kündigungs Check DE <noreply@kuendigungscheck.de>",
      to: [entry.email],
      subject: "Deine vollständige Vertragsanalyse – Kündigungs Check DE",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937;">
          <h2 style="color:#1d3a6e;">Deine vollständige Analyse ist fertig</h2>
          <p>Hallo ${escapeHtml(entry.name)},</p>
          <p>im Anhang findest du zwei Dateien:</p>
          <ul style="line-height:1.9;">
            <li><strong>Vertragsanalyse.rtf</strong> — vollständige Analyse mit allen Kündigungsmöglichkeiten, Einschätzung und nächsten Schritten</li>
            <li><strong>Kuendigungsschreiben.rtf</strong> — fertiges Kündigungsschreiben, direkt verwendbar</li>
          </ul>
          <p>Anbieter: <strong>${escapeHtml(entry.triage?.company || "unbekannt")}</strong></p>
          ${entry.triage?.cancellation_date && entry.triage.cancellation_date !== "unklar" ? `<p>Frühestmögliche Kündigung: <strong>${escapeHtml(entry.triage.cancellation_date)}</strong></p>` : ""}
          <p style="color:#6b7280;font-size:0.85rem;margin-top:32px;">
            Hinweis: Dies ist eine informative Analyse und keine Rechtsberatung.
            Bitte sende das Kündigungsschreiben per Einschreiben, wenn eine schriftliche Form erforderlich ist.
          </p>
        </div>
      `,
      attachments: [
        { filename: "Vertragsanalyse.rtf", content: rtfToBase64(analyseRtf) },
        { filename: "Kuendigungsschreiben.rtf", content: rtfToBase64(kuendigungRtf) }
      ]
    })
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`Betaalde mail mislukt: ${err}`); }
}

// ── Cron handler ──────────────────────────────────────────────────────────────

async function handleCron(env) {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const list = await env.KUENDIGUNG_QUEUE.list();

  for (const key of list.keys) {
    try {
      const raw = await env.KUENDIGUNG_QUEUE.get(key.name);
      if (!raw) continue;
      const entry = JSON.parse(raw);
      const createdAt = new Date(entry.created_at).getTime();
      if (now - createdAt < oneDayMs) continue;
      if (entry.type === "paid") {
        await sendDelayedPaidEmail(env, entry);
      } else {
        await sendDelayedGratisEmail(env, entry);
      }
      await env.KUENDIGUNG_QUEUE.delete(key.name);
    } catch (err) {
      console.error(`Cron fout voor ${key.name}:`, err.message);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type"
        }
      });
    }

    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/analyze") {
      try {
        const formData = await request.formData();
        const file = formData.get("file");
        if (!file) return jsonResponse({ ok: false, error: "Keine Datei empfangen" }, 400);
        const { base64, mediaType } = await fileToBase64(file);
        const triage = await handleTriage(env, base64, mediaType);
        return jsonResponse({ ok: true, ...triage });
      } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/analyze-free") {
      try {
        const formData = await request.formData();
        const file = formData.get("file");
        const name = formData.get("name");
        const email = formData.get("email");
        const stripeLink = env.STRIPE_LINK || "https://kuendigungscheck.de";

        const validationError = validateUploadInput({ file, name, email });
        if (validationError) return jsonResponse({ ok: false, error: validationError }, 400);

        const { base64, mediaType } = await fileToBase64(file);
        const gratis = await handleGratisAnalyse(env, base64, mediaType);

        const kvKey = `gratis:${Date.now()}:${email}`;
        await env.KUENDIGUNG_QUEUE.put(kvKey, JSON.stringify({
          type: "gratis",
          name, email,
          company: gratis.company || "",
          contract_type: gratis.contract_type || "",
          monthly_cost: String(gratis.monthly_cost || ""),
          cancellation_date: gratis.cancellation_date || "",
          risk: gratis.risk || "medium",
          teaser: gratis.teaser || "",
          stripe_link: stripeLink,
          created_at: new Date().toISOString()
        }));

        try { await sendAdminGratisNotification(env, { name, email, gratis, stripeLink }); } catch (_) {}

        return jsonResponse({
          ok: true,
          message: "Sie erhalten Ihre Einschätzung spätestens am nächsten Werktag vor 16:00 Uhr per E-Mail."
        });
      } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }

    if (request.method === "POST" && url.pathname === "/submit") {
      try {
        const formData = await request.formData();
        const file = formData.get("file");
        const name = formData.get("name");
        const email = formData.get("email");

        const validationError = validateUploadInput({ file, name, email });
        if (validationError) return jsonResponse({ ok: false, error: validationError }, 400);

        const { base64, mediaType } = await fileToBase64(file);
        const triage = await handleTriage(env, base64, mediaType);
        const analysis = await generateAnalysis(env, { fileBase64: base64, mediaType, route: triage.route });

        const kvKey = `paid:${Date.now()}:${email}`;
        await env.KUENDIGUNG_QUEUE.put(kvKey, JSON.stringify({
          type: "paid",
          name, email,
          analysis,
          triage,
          created_at: new Date().toISOString()
        }));

        await sendAdminPaidNotification(env, { customerName: name, customerEmail: email, triage, analysis });

        return jsonResponse({
          ok: true,
          message: "Upload erfolgreich. Du erhältst deine vollständige Analyse spätestens am nächsten Werktag vor 16:00 Uhr per E-Mail."
        });
      } catch (err) {
        return jsonResponse({ ok: false, error: err.message }, 500);
      }
    }

    return new Response("Not found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleCron(env));
  }
};
