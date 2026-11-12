// Vercel serverless function: emails the report (PDF + Excel) via Resend,
// and (optionally) saves the same files to Google Drive through an Apps Script web app.
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY  – API key from resend.com
//   MAIL_TO         – recipient address(es), comma-separated
//   MAIL_FROM       – optional sender, default "DRP SKY38 <onboarding@resend.dev>"
//   DRIVE_URL       – optional, Google Apps Script web app URL (ends with /exec)
//   DRIVE_TOKEN     – optional, the same secret word written in the Apps Script
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const key = process.env.RESEND_API_KEY;
  const to = process.env.MAIL_TO;
  if (!key || !to) return res.status(500).json({ error: "not_configured" });

  let b = req.body;
  try {
    if (typeof b === "string") b = JSON.parse(b);
  } catch (e) {
    return res.status(400).json({ error: "bad_json" });
  }
  if (!b || typeof b !== "object") return res.status(400).json({ error: "bad_request" });

  const attachments = (Array.isArray(b.attachments) ? b.attachments : [])
    .slice(0, 4)
    .filter((a) => a && /\.(pdf|xlsx)$/i.test(String(a.filename || "")) && a.content)
    .map((a) => ({ filename: String(a.filename).slice(0, 120), content: String(a.content) }));

  // 1) Google Drive (never blocks the email if it fails)
  let driveUrl = "";
  let driveNote = "";
  if (process.env.DRIVE_URL && attachments.length) {
    const kind = /^DRQ/i.test(attachments[0].filename) ? "Daily Request" : "Daily Report";
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    try {
      const d = await fetch(process.env.DRIVE_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ token: process.env.DRIVE_TOKEN || "", kind, files: attachments }),
        redirect: "follow",
        signal: ctrl.signal,
      });
      const dj = await d.json().catch(() => ({}));
      if (dj && dj.ok) driveUrl = dj.folderUrl || "";
      else driveNote = (dj && dj.error) || "drive_failed";
    } catch (e) {
      driveNote = "drive_unreachable";
    } finally {
      clearTimeout(t);
    }
  }

  // 2) Email
  let html = String(b.html || "").slice(0, 30000);
  if (driveUrl) html += `<p>📁 ไฟล์เก็บใน Google Drive: <a href="${driveUrl}">${driveUrl}</a></p>`;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || "DRP SKY38 <onboarding@resend.dev>",
        to: to.split(",").map((s) => s.trim()).filter(Boolean),
        subject: String(b.subject || "Daily Report").slice(0, 200),
        html,
        attachments,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: "send_failed", detail: j.message || j.name || String(r.status) });
    return res.status(200).json({ ok: true, id: j.id, driveUrl, driveNote });
  } catch (e) {
    return res.status(502).json({ error: "send_failed", detail: "network" });
  }
};

module.exports.config = { maxDuration: 60 };
