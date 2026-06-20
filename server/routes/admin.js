const express = require('express');
const router = express.Router();
const { prisma, requireAdmin } = require('../middleware/auth');

router.get('/', requireAdmin, async (req, res) => {
  try {
    const applications = await prisma.applications.count();
    const students = await prisma.students.count();
    const approved = await prisma.applications.count({ where: { status: 'approved' } });
    res.render('admin/dashboard', { adminRole: req.adminRole, stats: { applications, students, approved } });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.send('Server error');
  }
});

router.get('/applications', requireAdmin, async (req, res) => {
  try {
    const applications = await prisma.applications.findMany({
      include: { student: true, program: true },
      orderBy: { created_at: 'desc' },
    });
    res.render('admin/applications', { applications, adminRole: req.adminRole });
  } catch (err) {
    console.error('Fetch applications error:', err);
    res.send('Server error');
  }
});

router.post('/applications/:id', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const allowed = ['under_review', 'approved', 'rejected', 'waitlisted'];
  if (!allowed.includes(status)) return res.redirect('/admin/applications');

  try {
    await prisma.applications.update({
      where: { id: req.params.id },
      data: { status, reviewed_by: req.user.id, reviewed_at: new Date() },
    });
    res.redirect('/admin/applications');
  } catch (err) {
    console.error('Update application error:', err);
    res.redirect('/admin/applications');
  }
});

router.get('/students', requireAdmin, async (req, res) => {
  try {
    const students = await prisma.students.findMany({
      orderBy: { created_at: 'desc' },
    });
    res.render('admin/students', { students, adminRole: req.adminRole });
  } catch (err) {
    console.error('Fetch students error:', err);
    res.send('Server error');
  }
});

module.exports = router;
