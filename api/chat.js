import { originOk, rateLimit, systemOk, deny } from './_guard.js';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;          // largest the page asks for (Full teardown)
const MAX_BODY_CHARS = 2_000_000; // decks are sent as base64 PDFs, so allow room

export default async function handler(req, res) {
  if (req.method !== 'POST') return deny(res, 405, 'Method not allowed');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return deny(res, 500, 'API key not configured on server.');

  if (!originOk(req)) return deny(res, 403, 'Forbidden');
  if (!(await rateLimit(req, 'chat-h', 40, 3600))) return deny(res, 429, 'Too many requests — please wait a bit and try again.');
  if (!(await rateLimit(req, 'chat-d', 150, 86400))) return deny(res, 429, 'Daily limit reached — please come back tomorrow.');

  const { system, messages, max_tokens } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 60) return deny(res, 400, 'Bad request');
  if (JSON.stringify(messages).length > MAX_BODY_CHARS) return deny(res, 413, 'That upload is too large.');
  if (!(await systemOk(req, system))) return deny(res, 403, 'Forbidden');

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      // Only forward the fields we use; model and token ceiling are fixed server-side.
      body: JSON.stringify({
        model: MODEL,
        max_tokens: Math.min(Number(max_tokens) || 2048, MAX_TOKENS),
        system,
        messages,
      }),
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    console.error('Proxy error:', err);
    return deny(res, 500, 'Proxy request failed.');
  }
}
