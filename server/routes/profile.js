const express = require('express');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { prisma, requireAuth } = require('../middleware/auth');
const { validateName, validatePassword, validateEmail, validatePhone, sanitizeText, containsProfanity, normalizeEmail, validateProfilePhoto } = require('../lib/validation');

router.use(function (req, res, next) {
  res.locals.idempotencyToken = require('crypto').randomUUID();
  next();
});

const UPLOAD_DIR = path.join(__dirname, '../../public/uploads/profile');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, UPLOAD_DIR); },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `user_${req.user.id}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, and WebP images are allowed.'), false);
  }
});

router.get('/', requireAuth, async (req, res) => {
  try {
    const student = await prisma.students.findUnique({ where: { id: req.user.id } });
    if (!student) return res.redirect('/auth/login');

    const applications = await prisma.applications.findMany({
      where: { student_id: req.user.id },
      include: { program: true },
      orderBy: { created_at: 'desc' },
    });

    const documents = await prisma.documents.findMany({
      where: { application: { student_id: req.user.id } },
      orderBy: { created_at: 'desc' },
    });

    const applicationCount = applications.length;
    const approvedCount = applications.filter(a => a.status === 'approved').length;
    const pendingCount = applications.filter(a => a.status === 'pending' || a.status === 'under_review').length;
    const latestApp = applications[0] || null;

    res.render('portal/dashboard', {
      student,
      applications,
      documents,
      applicationCount,
      approvedCount,
      pendingCount,
      latestApp,
      suffix: (n) => {
        if (n === 1) return 'st';
        if (n === 2) return 'nd';
        if (n === 3) return 'rd';
        return 'th';
      },
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.redirect('/auth/login');
  }
});

router.get('/profile', requireAuth, async (req, res) => {
  try {
    const student = await prisma.students.findUnique({ where: { id: req.user.id } });
    if (!student) return res.redirect('/auth/login');

    res.render('portal/profile', {
      student,
      message: null,
      error: null,
      suffix: (n) => {
        if (n === 1) return 'st';
        if (n === 2) return 'nd';
        if (n === 3) return 'rd';
        return 'th';
      },
    });
  } catch (err) {
    console.error('Profile error:', err);
    res.redirect('/auth/login');
  }
});

router.post('/profile', requireAuth, function (req, res) {
  upload.single('profile_photo')(req, res, async function (uploadErr) {
    try {
      if (uploadErr) {
        const student = await prisma.students.findUnique({ where: { id: req.user.id } });
        const suffix = (n) => { if (n===1) return 'st'; if (n===2) return 'nd'; if (n===3) return 'rd'; return 'th'; };
        return res.render('portal/profile', { student, error: uploadErr.message, message: null, suffix });
      }

      const student = await prisma.students.findUnique({ where: { id: req.user.id } });
      const suffix = (n) => { if (n===1) return 'st'; if (n===2) return 'nd'; if (n===3) return 'rd'; return 'th'; };
      const { last_name, first_name, middle_name, sex, contact_number, email } = req.body;

      const fname = first_name ? sanitizeText(first_name) : student.first_name;
      const lname = last_name ? sanitizeText(last_name) : student.last_name;
      const mname = middle_name ? sanitizeText(middle_name) : student.middle_name;
      const emailVal = normalizeEmail(email);

      const nameErr = validateName(fname) || validateName(lname);
      if (nameErr) return res.render('portal/profile', { student, error: nameErr, message: null, suffix });

      if (containsProfanity(fname) || containsProfanity(lname) || (mname && containsProfanity(mname))) {
        return res.render('portal/profile', { student, error: 'Name contains inappropriate language.', message: null, suffix });
      }

      if (emailVal && emailVal !== (student.email || '').toLowerCase()) {
        const emailErr = validateEmail(emailVal);
        if (emailErr) return res.render('portal/profile', { student, error: emailErr, message: null, suffix });
        const existingEmail = await prisma.students.findFirst({ where: { email: emailVal, NOT: { id: req.user.id } } });
        if (existingEmail) return res.render('portal/profile', { student, error: 'Email already in use.', message: null, suffix });
      }

      let phoneVal = contact_number ? contact_number.trim() : student.contact_number;
      if (phoneVal && phoneVal !== student.contact_number) {
        const phoneErr = validatePhone(phoneVal);
        if (phoneErr) return res.render('portal/profile', { student, error: phoneErr, message: null, suffix });
      }

      var updateData = {
        last_name: lname,
        first_name: fname,
        middle_name: mname || student.middle_name,
        suffix: req.body.suffix || student.suffix,
        date_of_birth: req.body.date_of_birth ? new Date(req.body.date_of_birth) : student.date_of_birth,
        sex: sex || student.sex,
        contact_number: phoneVal
          ? (phoneVal.startsWith('+63') ? phoneVal : `+63${phoneVal.replace(/^0?/, '')}`)
          : student.contact_number,
        email: emailVal || student.email,
      };

      if (req.file) {
        var imgErr = await validateProfilePhoto(req.file.path, req.file.mimetype, req.file.size);
        if (imgErr) {
          fs.unlink(req.file.path, function () {});
          return res.render('portal/profile', { student, error: imgErr, message: null, suffix });
        }
        updateData.profile_photo = 'profile/' + req.file.filename;
      }

      await prisma.students.update({ where: { id: req.user.id }, data: updateData });

      const updated = await prisma.students.findUnique({ where: { id: req.user.id } });
      res.render('portal/profile', { student: updated, message: 'Profile updated successfully!', error: null, suffix });
    } catch (err) {
      console.error('Update profile error:', err);
      res.redirect('/portal/profile');
    }
  });
});

router.post('/profile/academic', requireAuth, async (req, res) => {
  try {
    const { student_id, college, degree_program, year_level } = req.body;
    await prisma.students.update({
      where: { id: req.user.id },
      data: {
        student_id: student_id || null,
        college: college || null,
        degree_program: degree_program || null,
        year_level: year_level ? parseInt(year_level, 10) : null,
      },
    });

    const student = await prisma.students.findUnique({ where: { id: req.user.id } });
    res.render('portal/profile', {
      student,
      message: 'Academic information updated successfully!',
      error: null,
      suffix: (n) => { if (n === 1) return 'st'; if (n === 2) return 'nd'; if (n === 3) return 'rd'; return 'th'; },
    });
  } catch (err) {
    console.error('Update academic info error:', err);
    res.redirect('/portal/profile');
  }
});

router.post('/profile/password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    const student = await prisma.students.findUnique({ where: { id: req.user.id } });
    return res.render('portal/profile', {
      student,
      error: 'Both current and new password are required.',
      message: null,
      suffix: (n) => { if (n === 1) return 'st'; if (n === 2) return 'nd'; if (n === 3) return 'rd'; return 'th'; },
    });
  }

  try {
    const student = await prisma.students.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(current_password, student.password_hash);
    if (!valid) {
      return res.render('portal/profile', {
        student,
        error: 'Current password is incorrect.',
        message: null,
        suffix: (n) => { if (n === 1) return 'st'; if (n === 2) return 'nd'; if (n === 3) return 'rd'; return 'th'; },
      });
    }

    const pwErr = validatePassword(new_password, {
      first_name: student.first_name,
      last_name: student.last_name,
      username: student.username,
      email: student.email,
    });
    if (pwErr) {
      return res.render('portal/profile', {
        student,
        error: pwErr,
        message: null,
        suffix: (n) => { if (n === 1) return 'st'; if (n === 2) return 'nd'; if (n === 3) return 'rd'; return 'th'; },
      });
    }

    const password_hash = await bcrypt.hash(new_password, 10);
    await prisma.students.update({ where: { id: req.user.id }, data: { password_hash } });

    const updated = await prisma.students.findUnique({ where: { id: req.user.id } });
    res.render('portal/profile', {
      student: updated,
      message: 'Password updated successfully!',
      error: null,
      suffix: (n) => { if (n === 1) return 'st'; if (n === 2) return 'nd'; if (n === 3) return 'rd'; return 'th'; },
    });
  } catch (err) {
    console.error('Change password error:', err);
    res.redirect('/portal/profile');
  }
});

module.exports = router;
