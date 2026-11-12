// Vercel serverless function: emails the daily report (PDF + Excel) via Resend.
// Environment variables (Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY  – API key from resend.com
//   MAIL_TO         – recipient address(es), comma-separated
//   MAIL_FROM       – optional sender, default "DRP SKY38 <onboarding@resend.dev>"
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

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.MAIL_FROM || "DRP SKY38 <onboarding@resend.dev>",
        to: to.split(",").map((s) => s.trim()).filter(Boolean),
        subject: String(b.subject || "Daily Report").slice(0, 200),
        html: String(b.html || "").slice(0, 30000),
        attachments,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: "send_failed", detail: j.message || j.name || String(r.status) });
    return res.status(200).json({ ok: true, id: j.id });
  } catch (e) {
    return res.status(502).json({ error: "send_failed", detail: "network" });
  }
};
