'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');

const MIME_BY_EXT = {
  '.pdf': new Set(['application/pdf']),
  '.docx': new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  '.doc': new Set(['application/msword', 'application/octet-stream']),
  '.txt': new Set(['text/plain']),
  '.md': new Set(['text/markdown', 'text/plain', 'application/octet-stream']),
};
const ALLOWED_MIME = new Set(Object.values(MIME_BY_EXT).flatMap(set => [...set]));
const ALLOWED_EXT = new Set(['.pdf', '.docx', '.doc', '.txt', '.md']);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(env.UPLOAD_DIR, 'materials');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(path.basename(file.originalname || 'upload')).toLowerCase();
    const safeExt = ALLOWED_EXT.has(ext) ? ext : '.bin';
    const random = crypto.randomBytes(12).toString('hex');
    cb(null, `${Date.now()}-${random}${safeExt}`);
  },
});

function fileFilter(req, file, cb) {
  const ext = path.extname(path.basename(file.originalname || '')).toLowerCase();
  const mimes = MIME_BY_EXT[ext];
  if (mimes && mimes.has(file.mimetype)) {
    return cb(null, true);
  }
  const err = new Error('unsupported_media_type');
  err.status = 415;
  err.code = 'unsupported_media_type';
  cb(err);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: env.MAX_UPLOAD_MB * 1024 * 1024,
    files: 1,
    fields: 8,
    parts: 12,
    headerPairs: 50,
  },
});

module.exports = { upload, ALLOWED_MIME, ALLOWED_EXT };
