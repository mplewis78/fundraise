const pdfParse = require('pdf-parse');
const formidable = require('formidable');
const fs = require('fs');

// Disable Vercel's default body parser so formidable can read the raw stream
module.exports.config = {
  api: { bodyParser: false }
};

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse the multipart form upload
    const form = formidable({ maxFileSize: 15 * 1024 * 1024 }); // 15MB
    const [, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve([fields, files]);
      });
    });

    const fileEntry = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!fileEntry) return res.status(400).json({ error: 'No file received.' });

    const buffer = fs.readFileSync(fileEntry.filepath);
    fs.unlinkSync(fileEntry.filepath); // clean up tmp file

    const result = await pdfParse(buffer);

    if (!result.text || !result.text.trim()) {
      return res.status(422).json({
        error: 'No readable text found in this PDF — it may be a scanned image. Try pasting your pitch text directly instead.'
      });
    }

    return res.status(200).json({ text: result.text });

  } catch (err) {
    console.error('PDF extract error:', err);
    if (err.code === 1016) { // formidable file too large
      return res.status(413).json({ error: 'File too large. Please use a PDF under 15MB.' });
    }
    return res.status(500).json({ error: 'Could not extract text from this PDF.' });
  }
};
