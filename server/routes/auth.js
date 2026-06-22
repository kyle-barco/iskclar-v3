const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { prisma, signToken } = require('../middleware/auth');
const { logActivity } = require('../middleware/activity');
const Joi = require('joi');
const { validateName, validatePassword, sanitizeText, containsProfanity, normalizeEmail, validatePhone } = require('../lib/validation');

const loginSchema = Joi.object({
  username: Joi.string().trim().required(),
  password: Joi.string().required(),
  rememberMe: Joi.any(),
});

router.get('/login', (req, res) => {
  res.render('auth/login', { error: null, message: null });
});

router.post('/login', async (req, res) => {
  const { error: valErr } = loginSchema.validate(req.body);
  if (valErr) return res.render('auth/login', { error: 'Invalid input.', message: null });

  const { username, password } = req.body;

  try {
    const student = await prisma.students.findUnique({ where: { username } });
    if (!student) return res.render('auth/login', { error: 'Invalid username or password.', message: null });

    const valid = await bcrypt.compare(password, student.password_hash);
    if (!valid) return res.render('auth/login', { error: 'Invalid username or password.', message: null });

    const remember = req.body.rememberMe === 'true';
    const token = signToken(
      { id: student.id, email: student.email },
      remember ? '7d' : '1h'
    );
    const cookieOpts = { httpOnly: true };
    if (remember) cookieOpts.maxAge = 7 * 24 * 60 * 60 * 1000;
    res.cookie('token', token, cookieOpts);
    res.redirect('/portal');
  } catch (err) {
    console.error('Login error:', err);
    res.render('auth/login', { error: 'Login failed.', message: null });
  }
});

router.get('/admin', (req, res) => {
  res.render('auth/admin', { error: null, username: null, role: null });
});

router.post('/admin', async (req, res) => {
  const { username, password, role: reqRole } = req.body;
  if (!username || !password) return res.render('auth/admin', { error: 'All fields required.', username, role: reqRole });
  if (!reqRole) return res.render('auth/admin', { error: 'Please select your role.', username, role: reqRole });

  try {
    const admin = await prisma.admins.findUnique({ where: { email: username } });
    if (!admin || !admin.is_active) return res.render('auth/admin', { error: 'Invalid credentials.', username, role: reqRole });

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.render('auth/admin', { error: 'Invalid credentials.', username, role: reqRole });

    if (reqRole !== admin.role) {
      return res.render('auth/admin', { error: 'The role selected does not match this account. Please choose the correct role.', username, role: reqRole });
    }

    const token = signToken({ id: admin.id, email: admin.email, role: admin.role });
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    logActivity(admin.id, 'time_in', 'session', null, { display_name: admin.display_name });
    res.redirect('/admin');
  } catch (err) {
    console.error('Admin login error:', err);
    res.render('auth/admin', { error: 'Login failed.' });
  }
});

router.get('/register', (req, res) => {
  const idempotencyToken = require('crypto').randomUUID();
  res.render('auth/register', { error: null, message: null, idempotencyToken });
});

router.post('/register', async (req, res) => {
  const body = req.body;
  if (!body.username || !body.password || !body.last_name || !body.first_name) {
    return res.render('auth/register', { error: 'Required fields missing.', message: null });
  }

  try {
    const username = sanitizeText(body.username);
    const first_name = sanitizeText(body.first_name);
    const last_name = sanitizeText(body.last_name);
    const middle_name = body.middle_name ? sanitizeText(body.middle_name) : null;
    const email = normalizeEmail(body.email);

    const nameErr = validateName(first_name) || validateName(last_name);
    if (nameErr) return res.render('auth/register', { error: nameErr, message: null });

    if (containsProfanity(first_name) || containsProfanity(last_name) || (middle_name && containsProfanity(middle_name))) {
      return res.render('auth/register', { error: 'Name contains inappropriate language.', message: null });
    }

    const pwErr = validatePassword(body.password, { first_name, last_name, username, email });
    if (pwErr) return res.render('auth/register', { error: pwErr, message: null });

    const existingUser = await prisma.students.findUnique({ where: { username } });
    if (existingUser) return res.render('auth/register', { error: 'Username already taken.', message: null });

    if (email) {
      const existingEmail = await prisma.students.findFirst({ where: { email } });
      if (existingEmail) return res.render('auth/register', { error: 'Email already registered. <a href="/auth/login">Sign in here</a>.', message: null });
    }

    if (body.contact_number) {
      var phoneVal = body.contact_number.startsWith('+63') ? body.contact_number : `+63${body.contact_number.replace(/^0?/, '')}`;
      const phoneErr = validatePhone(phoneVal);
      if (phoneErr) return res.render('auth/register', { error: phoneErr, message: null });

      const existingPhone = await prisma.students.findFirst({ where: { contact_number: phoneVal } });
      if (existingPhone) return res.render('auth/register', { error: 'Phone number already registered. <a href="/auth/login">Sign in here</a>.', message: null });
    }

    const password_hash = await bcrypt.hash(body.password, 10);

    await prisma.students.create({
      data: {
        username,
        last_name,
        first_name,
        middle_name,
        suffix: body.suffix || null,
        date_of_birth: body.date_of_birth ? new Date(body.date_of_birth) : new Date('2000-01-01'),
        sex: body.sex || 'Prefer not to say',
        civil_status: body.civil_status || 'Single',
        contact_number: body.contact_number
          ? (body.contact_number.startsWith('+63') ? body.contact_number : `+63${body.contact_number.replace(/^0?/, '')}`)
          : '',
        email,
        addr_street: body.addr_street || '',
        addr_barangay: body.addr_barangay || '',
        addr_municipality: body.addr_municipality || '',
        addr_province: body.addr_province || '',
        addr_zip: body.addr_zip || '0000',
        password_hash,
      },
    });

    res.render('auth/login', { error: null, message: 'Account created successfully! Please log in.' });
  } catch (err) {
    console.error('Register error:', err);
    res.render('auth/register', { error: 'Registration failed.', message: null });
  }
});

router.get('/logout', async (req, res) => {
  try {
    const token = req.cookies?.token;
    if (token) {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload.role && payload.role !== 'student') {
        await logActivity(payload.id, 'time_out', 'session', null, {});
      }
    }
  } catch (_) {}
  res.clearCookie('token');
  res.redirect('/auth/login');
});

module.exports = router;
