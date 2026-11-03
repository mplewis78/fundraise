import crypto from 'crypto';

// Saved, shareable reports. Each report lives in Upstash Redis under report:<id>
// and expires automatically TTL_DAYS after it was created.
//
//   POST /api/report                      { messages, meta }        -> { id, url, expiresAt }
//   GET  /api/report?id=<id>                                         -> the saved report
//   POST /api/report?action=followup      { id, text, system }      -> { reply, expiresAt }

const TTL_DAYS = 90;
const TTL_SECONDS = TTL_DAYS * 24 * 60 * 60;
const MODEL = 'claude-sonnet-4-6';
const ID_RE = /^[A-Za-z0-9_-]{8,32}$/;

// Vercel's Upstash integration may name the vars either way, so accept both.
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

async function redis(command) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await r.json();
  if (data.error) throw new Error('Redis: ' + data.error);
  return data.result;
}

async function load(id) {
  const raw = await redis(['GET', 'report:' + id]);
  return raw ? JSON.parse(raw) : null;
}

export default async function handler(req, res) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({ error: 'Report storage is not configured.' });
  }

  try {
    // ── Load a saved report ──
    if (req.method === 'GET') {
      const id = String(req.query.id || '');
      if (!ID_RE.test(id)) return res.status(404).json({ error: 'not_found' });
      const record = await load(id);
      if (!record) return res.status(404).json({ error: 'not_found' });
      return res.status(200).json(record);
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // ── Ask a follow-up on a saved report ──
    if (req.query.action === 'followup') {
      const { id, text, system } = req.body || {};
      if (!ID_RE.test(String(id || ''))) return res.status(404).json({ error: 'not_found' });
      if (!text || typeof text !== 'string' || text.length > 20000) {
        return res.status(400).json({ error: 'Please enter a question.' });
      }
      const record = await load(id);
      if (!record) return res.status(404).json({ error: 'not_found' });

      const messages = record.messages.concat([{ role: 'user', content: text }]);
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model: MODEL, max_tokens: 2048, system: system || '', messages }),
      });
      const data = await r.json();
      if (data.error || !data.content || !data.content[0]) {
        return res.status(r.ok ? 502 : r.status).json({ error: (data.error && data.error.message) || 'Something went wrong.' });
      }

      const reply = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
      record.messages = messages.concat([{ role: 'assistant', content: reply }]);
      record.updatedAt = new Date().toISOString();
      // KEEPTTL: follow-ups don't extend the link's life — it still expires TTL_DAYS after creation.
      await redis(['SET', 'report:' + id, JSON.stringify(record), 'KEEPTTL']);
      return res.status(200).json({ reply, expiresAt: record.expiresAt });
    }

    // ── Save a new report ──
    const { messages, meta } = req.body || {};
    if (!Array.isArray(messages) || messages.length < 2) {
      return res.status(400).json({ error: 'Nothing to save.' });
    }
    const id = crypto.randomBytes(9).toString('base64url'); // 12 chars, unguessable
    const now = new Date();
    const record = {
      id,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + TTL_SECONDS * 1000).toISOString(),
      meta: meta || {},
      messages,
    };
    await redis(['SET', 'report:' + id, JSON.stringify(record), 'EX', TTL_SECONDS]);
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    return res.status(200).json({ id, url: 'https://' + host + '/r/' + id, expiresAt: record.expiresAt });
  } catch (err) {
    console.error('report error:', err);
    return res.status(500).json({ error: 'Report storage failed.' });
  }
}
