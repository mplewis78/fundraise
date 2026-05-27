const pdfParse = require('pdf-parse');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'No file data provided.' });

  try {
    const buffer = Buffer.from(data, 'base64');
    const result = await pdfParse(buffer);
    if (!result.text || !result.text.trim()) {
      return res.status(422).json({ error: 'No text found in PDF. It may be a scanned image — try copying and pasting your pitch text instead.' });
    }
    return res.status(200).json({ text: result.text });
  } catch (err) {
    console.error('PDF extract error:', err);
    return res.status(500).json({ error: 'Could not extract text from this PDF.' });
  }
};

module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
};
