const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedExts = /jpeg|jpg|png|gif|webp|mp4|m4a|aac|mp3|wav/;
  const ext = allowedExts.test(path.extname(file.originalname).toLowerCase());
  const isImageOrMedia = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/');
  if (ext && isImageOrMedia) return cb(null, true);
  cb(new Error('Only image and audio/video files are allowed'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

module.exports = upload;
