export default async function handler(req, res) {
  const apiKey = process.env.TRANSCRIBER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Transcriber API key not configured.' });

  const BASE = 'https://video-transcriber-mike1303.replit.app/api';

  try {
    if (req.method === 'POST') {
      const { action } = req.query;

      // Step 1 of file upload: request a presigned GCS URL
      if (action === 'request-upload') {
        const { name, size, contentType } = req.body;
        const r = await fetch(`${BASE}/storage/uploads/request-url`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, size, contentType }),
        });
        return res.status(r.status).json(await r.json());
      }

      // Step 3 of file upload: start transcription/extraction from stored object
      if (action === 'from-storage') {
        const { objectPath, filename } = req.body;
        const r = await fetch(`${BASE}/transcriptions/from-object-storage`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ objectPath, filename }),
        });
        return res.status(r.status).json(await r.json());
      }

      // Default: transcribe from a public video URL
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'URL required.' });
      const r = await fetch(`${BASE}/transcriptions/from-url`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      return res.status(r.status).json(await r.json());
    }

    if (req.method === 'GET') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Job ID required.' });
      const r = await fetch(`${BASE}/transcriptions/${id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      return res.status(r.status).json(await r.json());
    }

    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error('Transcribe proxy error:', err);
    return res.status(500).json({ error: 'Proxy request failed.' });
  }
}
