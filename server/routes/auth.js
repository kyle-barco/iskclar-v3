const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const router = express.Router();
const { prisma, signToken } = require('../middleware/auth');
const { logActivity } = require('../middleware/activity');
const { sendResetEmail } = require('../lib/email');
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

router.get('/forgot-password', (req, res) => {
  res.render('auth/forgot-password', { error: null, success: null, email: null, admin: false });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.render('auth/forgot-password', { error: 'Please enter your email.', success: null, email: null, admin: false });

  try {
    const student = await prisma.students.findFirst({ where: { email, is_deleted: false } });
    if (!student) {
      return res.render('auth/forgot-password', { error: 'No account found with that email.', success: null, email, admin: false });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000);

    await prisma.students.update({
      where: { id: student.id },
      data: { reset_token: token, reset_token_expires: expires },
    });

    const resetUrl = `${req.protocol}://${req.get('host')}/auth/reset-password/${token}`;
    const displayName = `${student.first_name} ${student.last_name}`;
    await sendResetEmail(email, resetUrl, displayName);

    res.render('auth/forgot-password', { error: null, success: 'Reset link sent! Check your email.', email: null, admin: false });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.render('auth/forgot-password', { error: 'Failed to send reset email. Please try again.', success: null, email, admin: false });
  }
});

router.get('/admin/forgot-password', (req, res) => {
  res.render('auth/forgot-password', { error: null, success: null, email: null, admin: true });
});

router.post('/admin/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.render('auth/forgot-password', { error: 'Please enter your email.', success: null, email: null, admin: true });

  try {
    const admin = await prisma.admins.findUnique({ where: { email } });
    if (!admin) {
      return res.render('auth/forgot-password', { error: 'No admin account found with that email.', success: null, email, admin: true });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600000);

    await prisma.admins.update({
      where: { id: admin.id },
      data: { reset_token: token, reset_token_expires: expires },
    });

    const resetUrl = `${req.protocol}://${req.get('host')}/auth/reset-password/${token}`;
    await sendResetEmail(email, resetUrl, admin.display_name);

    res.render('auth/forgot-password', { error: null, success: 'Reset link sent! Check your email.', email: null, admin: true });
  } catch (err) {
    console.error('Admin forgot password error:', err);
    res.render('auth/forgot-password', { error: 'Failed to send reset email. Please try again.', success: null, email, admin: true });
  }
});

router.get('/reset-password/:token', async (req, res) => {
  const { token } = req.params;

  try {
    let user = await prisma.students.findFirst({
      where: { reset_token: token, reset_token_expires: { gt: new Date() }, is_deleted: false },
    });
    if (!user) {
      user = await prisma.admins.findFirst({
        where: { reset_token: token, reset_token_expires: { gt: new Date() } },
      });
    }
    if (!user) {
      return res.render('auth/reset-password', { error: 'Invalid or expired reset link.', success: null, token: null });
    }

    res.render('auth/reset-password', { error: null, success: null, token });
  } catch (err) {
    console.error('Reset password load error:', err);
    res.render('auth/reset-password', { error: 'Something went wrong.', success: null, token: null });
  }
});

router.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { password, confirmPassword } = req.body;

  if (!password || !confirmPassword) {
    return res.render('auth/reset-password', { error: 'All fields are required.', success: null, token });
  }
  if (password.length < 8) {
    return res.render('auth/reset-password', { error: 'Password must be at least 8 characters.', success: null, token });
  }
  if (password !== confirmPassword) {
    return res.render('auth/reset-password', { error: 'Passwords do not match.', success: null, token });
  }

  try {
    let user = await prisma.students.findFirst({
      where: { reset_token: token, reset_token_expires: { gt: new Date() }, is_deleted: false },
    });
    let model = 'students';
    if (!user) {
      user = await prisma.admins.findFirst({
        where: { reset_token: token, reset_token_expires: { gt: new Date() } },
      });
      model = 'admins';
    }
    if (!user) {
      return res.render('auth/reset-password', { error: 'Invalid or expired reset link.', success: null, token: null });
    }

    const password_hash = await bcrypt.hash(password, 10);

    if (model === 'students') {
      await prisma.students.update({
        where: { id: user.id },
        data: { password_hash, reset_token: null, reset_token_expires: null },
      });
    } else {
      await prisma.admins.update({
        where: { id: user.id },
        data: { password_hash, reset_token: null, reset_token_expires: null },
      });
    }

    res.render('auth/reset-password', { error: null, success: 'Password reset successfully! You can now sign in with your new password.', token: null });
  } catch (err) {
    console.error('Reset password error:', err);
    res.render('auth/reset-password', { error: 'Failed to reset password. Please try again.', success: null, token });
  }
});

router.get('/register', (req, res) => {
  const idempotencyToken = require('crypto').randomUUID();
  res.render('auth/register', { error: null, message: null, idempotencyToken });
});

router.post('/register', async (req, res) => {
  const idempotencyToken = require('crypto').randomUUID();
  const renderErr = (error) => res.render('auth/register', { error, message: null, idempotencyToken });

  const body = req.body;
  if (!body.username || !body.password || !body.last_name || !body.first_name) {
    return renderErr('Required fields missing.');
  }

  try {
    const username = sanitizeText(body.username);
    const first_name = sanitizeText(body.first_name);
    const last_name = sanitizeText(body.last_name);
    const middle_name = body.middle_name ? sanitizeText(body.middle_name) : null;
    const email = normalizeEmail(body.email);

    const nameErr = validateName(first_name) || validateName(last_name);
    if (nameErr) return renderErr(nameErr);

    if (containsProfanity(first_name) || containsProfanity(last_name) || (middle_name && containsProfanity(middle_name))) {
      return renderErr('Name contains inappropriate language.');
    }

    const pwErr = validatePassword(body.password, username, email, first_name, last_name);
    if (pwErr) return renderErr(pwErr);

    const existingUser = await prisma.students.findUnique({ where: { username } });
    if (existingUser) return renderErr('Username already taken.');

    if (email) {
      const existingEmail = await prisma.students.findFirst({ where: { email } });
      if (existingEmail) return renderErr('Email already registered. <a href="/auth/login">Sign in here</a>.');
    }

    if (body.contact_number) {
      var phoneVal = body.contact_number.startsWith('+63') ? body.contact_number : `+63${body.contact_number.replace(/^0?/, '')}`;
      const phoneErr = validatePhone(phoneVal);
      if (phoneErr) return renderErr(phoneErr);

      const existingPhone = await prisma.students.findFirst({ where: { contact_number: phoneVal } });
      if (existingPhone) return renderErr('Phone number already registered. <a href="/auth/login">Sign in here</a>.');
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
    renderErr('Registration failed.');
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
