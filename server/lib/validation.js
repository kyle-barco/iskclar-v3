const path = require('path');
const fs = require('fs');
const sizeOf = require('image-size');

/* ── Profanity filter ────────────────────────────────────── */
const PROFANITY_LIST = [
  'fuck', 'shit', 'ass', 'bitch', 'damn', 'crap', 'dick', 'bastard',
  'piss', 'slut', 'whore', 'cock', 'cunt', 'douche', 'fag', 'nigger',
  'nigga', 'chink', 'spic', 'kike', 'gook', 'retard', 'faggot',
];

function containsProfanity(text) {
  if (!text) return false;
  const lowered = text.toLowerCase();
  return PROFANITY_LIST.some(word => {
    const regex = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    return regex.test(lowered);
  });
}

function sanitizeText(text) {
  if (!text) return text;
  let result = text;
  PROFANITY_LIST.forEach(word => {
    const regex = new RegExp('\\b' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
    result = result.replace(regex, match => '*'.repeat(match.length));
  });
  return result;
}

/* ── Name validation ─────────────────────────────────────── */
const NAME_REGEX = /^[A-Za-zÀ-ÿ\s'\-]+$/;

function validateName(name, fieldLabel) {
  if (!name || !name.trim()) return fieldLabel + ' is required.';
  const trimmed = name.trim();
  if (trimmed.length < 2) return fieldLabel + ' must be at least 2 characters.';
  if (trimmed.length > 60) return fieldLabel + ' must be at most 60 characters.';
  if (!/^[A-Za-zÀ-ÿ]/.test(trimmed)) return fieldLabel + ' must start with a letter.';
  if (!NAME_REGEX.test(trimmed)) return fieldLabel + ' can only contain letters, hyphens, and apostrophes.';
  if (containsProfanity(trimmed)) return fieldLabel + ' contains inappropriate language.';
  return '';
}

/* ── Password rules ──────────────────────────────────────── */
function validatePassword(password, username, email, firstName, lastName) {
  if (!password) return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 128) return 'Password must be at most 128 characters.';
  if (!/[A-Z]/.test(password)) return 'Password needs at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password needs at least one lowercase letter.';
  if (!/[0-9]/.test(password)) return 'Password needs at least one number.';
  if (!/[^A-Za-z0-9]/.test(password)) return 'Password needs at least one special character.';

  const lowerPw = password.toLowerCase();
  const checks = [username, email, firstName, lastName].filter(Boolean);
  for (const check of checks) {
    if (check && lowerPw.includes(check.toLowerCase())) {
      return 'Password cannot contain your username, email, or name.';
    }
  }

  return '';
}

/* ── Phone validation ────────────────────────────────────── */
function validatePhone(phone) {
  if (!phone || !phone.trim()) return '';
  const cleaned = phone.trim().replace(/[\s\-\(\)]/g, '');
  if (!/^\+639\d{9}$/.test(cleaned)) return 'Enter a valid PH mobile number (e.g. +639xxxxxxxxx).';
  return '';
}

/* ── Email validation ────────────────────────────────────── */
function validateEmail(email) {
  if (!email || !email.trim()) return '';
  if (email.trim().length > 254) return 'Email address is too long.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
  return '';
}

/* ── Image validation ────────────────────────────────────── */
const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
const MIN_IMAGE_DIMENSION = 100;

async function validateProfilePhoto(filePath, mimeType, fileSize) {
  if (!filePath) return 'No file provided.';
  if (!ALLOWED_IMAGE_MIMES.includes(mimeType)) return 'Profile photo must be JPG, PNG, or WEBP.';
  if (fileSize > MAX_IMAGE_SIZE) return 'Profile photo must be under 5 MB.';

  try {
    const dimensions = sizeOf(filePath);
    if (dimensions.width < MIN_IMAGE_DIMENSION || dimensions.height < MIN_IMAGE_DIMENSION) {
      fs.unlink(filePath, () => {});
      return 'Profile photo must be at least 100x100 pixels.';
    }
  } catch (err) {
    fs.unlink(filePath, () => {});
    return 'Could not process image. Please try a different file.';
  }

  return '';
}

/* ── Character limit helper ──────────────────────────────── */
const CHAR_LIMITS = {
  first_name: 60,
  last_name: 60,
  middle_name: 60,
  addr_street: 100,
  addr_barangay: 80,
  addr_municipality: 80,
  addr_province: 80,
  degree_program: 150,
  college: 100,
  father_name: 60,
  mother_name: 60,
  father_occ: 60,
  mother_occ: 60,
};

function getCharLimit(fieldName) {
  return CHAR_LIMITS[fieldName] || null;
}

/* ── Supported locales ──────────────────────────────────── */
const SUPPORTED_LOCALES = ['en', 'fil', 'tl', 'es', 'zh', 'ja', 'ko', 'vi', 'ar', 'fr', 'de'];

function validateLocale(locale) {
  if (!locale) return '';
  if (!SUPPORTED_LOCALES.includes(locale)) return 'Unsupported language locale.';
  return '';
}

/* ── Numerical thresholds ───────────────────────────────── */
function validateThreshold(value, min, max, label) {
  if (value === null || value === undefined) return '';
  const num = Number(value);
  if (isNaN(num)) return label + ' must be a number.';
  if (num < min) return label + ' must be at least ' + min + '.';
  if (num > max) return label + ' must be at most ' + max + '.';
  return '';
}

/* ── Email normalization ────────────────────────────────── */
function normalizeEmail(email) {
  if (!email) return '';
  return email.trim().toLowerCase();
}

/* ── Idempotency token ────────────────────────────────────── */
const crypto = require('crypto');

function generateIdempotencyToken() {
  return crypto.randomBytes(16).toString('hex');
}

/* ── File upload validation ──────────────────────────────── */
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function validateUploadedFile(file, fieldLabel) {
  if (!file) return fieldLabel + ' is required.';
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) return fieldLabel + ' must be PDF, JPG, PNG, or WEBP.';
  if (file.size > MAX_FILE_SIZE) return fieldLabel + ' exceeds the 10 MB limit.';
  return '';
}

/* ── Malware scan placeholder ───────────────────────────── */
async function malwareScan(filePath) {
  try {
    const fs = require('fs');
    if (!fs.existsSync(filePath)) return '';
    const size = fs.statSync(filePath).size;
    if (size === 0) return 'File is empty.';
    return '';
  } catch {
    return 'Could not scan file.';
  }
}

module.exports = {
  containsProfanity,
  sanitizeText,
  validateName,
  validatePassword,
  validatePhone,
  validateEmail,
  validateProfilePhoto,
  validateUploadedFile,
  malwareScan,
  getCharLimit,
  generateIdempotencyToken,
  NAME_REGEX,
  ALLOWED_IMAGE_MIMES,
  MAX_IMAGE_SIZE,
  MIN_IMAGE_DIMENSION,
  SUPPORTED_LOCALES,
  validateLocale,
  validateThreshold,
  normalizeEmail,
};
