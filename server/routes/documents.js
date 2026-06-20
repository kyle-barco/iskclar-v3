const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { prisma, requireAuth } = require('../middleware/auth');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
      const sanitized = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}_${sanitized}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('Only PDF, JPG, PNG, and WEBP files are allowed.'));
    }
    cb(null, true);
  },
});

router.post('/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  const { application_id, doc_type } = req.body;
  if (!application_id || !doc_type) return res.status(400).json({ error: 'application_id and doc_type are required.' });

  try {
    const app = await prisma.applications.findFirst({
      where: { id: application_id, student_id: req.user.id },
    });
    if (!app) return res.status(403).json({ error: 'Application not found or access denied.' });

    const doc = await prisma.documents.create({
      data: {
        application_id,
        doc_type,
        file_path: req.file.filename,
        file_name: req.file.originalname,
        mime_type: req.file.mimetype,
        file_size_kb: Math.ceil(req.file.size / 1024),
      },
    });

    res.json({ id: doc.id, message: 'Document uploaded successfully.' });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed.' });
  }
});

module.exports = router;
