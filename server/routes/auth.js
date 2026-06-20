const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { prisma, signToken } = require('../middleware/auth');
const Joi = require('joi');

const loginSchema = Joi.object({
  username: Joi.string().trim().required(),
  password: Joi.string().required(),
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

    const token = signToken({ id: student.id, email: student.email });
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.redirect('/portal');
  } catch (err) {
    console.error('Login error:', err);
    res.render('auth/login', { error: 'Login failed.', message: null });
  }
});

router.get('/admin', (req, res) => {
  res.render('auth/admin', { error: null });
});

router.post('/admin', async (req, res) => {
  const { username, password, role: reqRole } = req.body;
  if (!username || !password) return res.render('auth/admin', { error: 'All fields required.' });

  try {
    const admin = await prisma.admins.findUnique({ where: { email: username } });
    if (!admin || !admin.is_active) return res.render('auth/admin', { error: 'Invalid credentials.' });

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res.render('auth/admin', { error: 'Invalid credentials.' });

    const token = signToken({ id: admin.id, email: admin.email, role: admin.role });
    res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.redirect('/admin');
  } catch (err) {
    console.error('Admin login error:', err);
    res.render('auth/admin', { error: 'Login failed.' });
  }
});

router.get('/register', (req, res) => {
  res.render('auth/register', { error: null, message: null });
});

router.post('/register', async (req, res) => {
  const body = req.body;
  if (!body.username || !body.password || !body.last_name || !body.first_name) {
    return res.render('auth/register', { error: 'Required fields missing.', message: null });
  }

  try {
    const existing = await prisma.students.findUnique({ where: { username: body.username } });
    if (existing) return res.render('auth/register', { error: 'Username already taken.', message: null });

    const password_hash = await bcrypt.hash(body.password, 10);

    await prisma.students.create({
      data: {
        username: body.username,
        last_name: body.last_name,
        first_name: body.first_name,
        middle_name: body.middle_name || null,
        suffix: body.suffix || null,
        date_of_birth: body.date_of_birth ? new Date(body.date_of_birth) : new Date('2000-01-01'),
        sex: body.sex || 'Prefer not to say',
        civil_status: body.civil_status || 'Single',
        contact_number: body.contact_number || '',
        email: body.email || '',
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

router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/auth/login');
});

module.exports = router;
