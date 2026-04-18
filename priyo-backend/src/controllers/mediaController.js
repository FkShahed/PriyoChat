const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

const uploadFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0)
      return res.status(400).json({ message: 'No files provided' });

    const uploadPromises = req.files.map((file) => {
      return new Promise((resolve, reject) => {
        const isAudio = file.mimetype.startsWith('audio/');
        const folder = isAudio ? 'priyochat/voice-notes' : 'priyochat/messages';
        const resourceType = isAudio ? 'video' : 'image'; // Cloudinary uses "video" for audio
        const stream = cloudinary.uploader.upload_stream(
          { folder, resource_type: resourceType },
          (err, result) => (err ? reject(err) : resolve({ url: result.secure_url, publicId: result.public_id }))
        );
        streamifier.createReadStream(file.buffer).pipe(stream);
      });
    });

    const results = await Promise.all(uploadPromises);
    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { uploadFiles };
