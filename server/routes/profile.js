const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { prisma, requireAuth } = require('../middleware/auth');

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

router.post('/profile', requireAuth, async (req, res) => {
  try {
    const student = await prisma.students.findUnique({ where: { id: req.user.id } });
    const { last_name, first_name, middle_name, suffix, date_of_birth, sex, contact_number, email } = req.body;

    await prisma.students.update({
      where: { id: req.user.id },
      data: {
        last_name: last_name || student.last_name,
        first_name: first_name || student.first_name,
        middle_name: middle_name || student.middle_name,
        suffix: suffix || student.suffix,
        date_of_birth: date_of_birth ? new Date(date_of_birth) : student.date_of_birth,
        sex: sex || student.sex,
        contact_number: contact_number || student.contact_number,
        email: email || student.email,
      },
    });

    const updated = await prisma.students.findUnique({ where: { id: req.user.id } });
    res.render('portal/profile', {
      student: updated,
      message: 'Profile updated successfully!',
      error: null,
      suffix: (n) => { if (n === 1) return 'st'; if (n === 2) return 'nd'; if (n === 3) return 'rd'; return 'th'; },
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.redirect('/portal/profile');
  }
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
  if (!current_password || !new_password || new_password.length < 8) {
    const student = await prisma.students.findUnique({ where: { id: req.user.id } });
    return res.render('portal/profile', {
      student,
      error: 'New password must be at least 8 characters.',
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
