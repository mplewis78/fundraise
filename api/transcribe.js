export default async function handler(req, res) {
  const apiKey = process.env.TRANSCRIBER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Transcriber API key not configured on server.' });
  }

  const BASE = 'https://video-transcriber-mike1303.replit.app/api';

  try {
    // POST /api/transcribe — start a new transcription job
    if (req.method === 'POST') {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'URL is required.' });

      const response = await fetch(`${BASE}/transcriptions/from-url`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    }

    // GET /api/transcribe?id=X — poll for job status
    if (req.method === 'GET') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Job ID is required.' });

      const response = await fetch(`${BASE}/transcriptions/${id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error('Transcribe proxy error:', err);
    return res.status(500).json({ error: 'Proxy request failed.' });
  }
}
