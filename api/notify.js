import { originOk, rateLimit } from './_guard.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Spam protection: only our own pages, a sane per-IP volume, and only real sessions
  // (the page always sends a transcript that includes at least one COACH reply).
  // Rejections return 200 so bots learn nothing, and no email is sent.
  if (!originOk(req)) return res.status(200).json({ ok: false });
  if (!(await rateLimit(req, 'notify', 20, 3600))) return res.status(200).json({ ok: false });
  {
    const b = req.body || {};
    const sidOk = typeof b.sessionId === 'string' && /^[a-z0-9]{1,12}$/.test(b.sessionId);
    const t = typeof b.transcript === 'string' ? b.transcript : '';
    const realSession = /(^|\n)COACH:\n/.test(t) && /(^|\n)FOUNDER:\n/.test(t);
    if (!sidOk || !realSession || t.length > 100000) return res.status(200).json({ ok: false });
    if (b.link && !/^https:\/\/(www\.)?enjoythefundraise\.ai\/r\/[A-Za-z0-9_-]{8,32}$/.test(String(b.link))) b.link = '';
  }

  const apiKey = process.env.RESEND_API_KEY;
  // If no key is configured, quietly do nothing — never break the app over a notification.
  if (!apiKey) {
    return res.status(200).json({ ok: false, skipped: 'RESEND_API_KEY not set' });
  }

  const to = process.env.NOTIFY_EMAIL || 'mike@lewhouse.com';
  // 'from' must be a Resend-verified domain. onboarding@resend.dev works out of the
  // box but only delivers to your own Resend account email. Set NOTIFY_FROM once you
  // verify a domain (e.g. 'Founder Pitch Coach <coach@yourdomain.com>').
  const from = process.env.NOTIFY_FROM || 'Founder Pitch Coach <onboarding@resend.dev>';

  try {
    const { sessionId, link, count, transcript, snippet, ts, ua } = req.body || {};
    const when = ts || new Date().toISOString();
    const sid = sessionId || 'unknown';
    const body =
      'Founder Pitch Coach — session activity.\n\n' +
      'Session: ' + sid + '\n' +
      (link ? 'Report link: ' + link + '\n' : '') +
      'When: ' + when + '\n' +
      'Messages so far: ' + (count != null ? count : 'n/a') + '\n' +
      'Browser: ' + (ua || 'unknown') + '\n\n' +
      '===== CONVERSATION =====\n\n' +
      (transcript || snippet || '(no transcript captured)');

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from,
        to: [to],
        subject: 'Pitch Coach — session ' + sid + (count != null ? ' (' + count + ' msgs)' : ''),
        text: body,
      }),
    });

    const data = await r.json().catch(() => ({}));
    return res.status(r.ok ? 200 : r.status).json(data);
  } catch (err) {
    console.error('notify error:', err);
    // Swallow errors — a failed notification should never surface to the founder.
    return res.status(200).json({ ok: false });
  }
}
