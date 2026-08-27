export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
    const { snippet, ts, ua } = req.body || {};
    const when = ts || new Date().toISOString();
    const body =
      'Someone just started using the Founder Pitch Coach.\n\n' +
      'When: ' + when + '\n' +
      'Browser: ' + (ua || 'unknown') + '\n\n' +
      'First message:\n' + (snippet || '(no text — likely a deck or video upload)');

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: from,
        to: [to],
        subject: 'New Founder Pitch Coach session',
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
