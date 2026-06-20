const express = require('express');
const router = express.Router();
const { prisma, requireAuth } = require('../middleware/auth');

router.get('/application', requireAuth, async (req, res) => {
  try {
    const student = await prisma.students.findUnique({ where: { id: req.user.id } });
    const programs = await prisma.scholarship_programs.findMany({
      where: {
        is_active: true,
        application_start: { lte: new Date() },
        application_end: { gte: new Date() },
      },
      orderBy: { application_end: 'asc' },
    });

    res.render('portal/application', {
      student,
      programs,
      error: null,
      message: null,
    });
  } catch (err) {
    console.error('Application page error:', err);
    res.redirect('/portal');
  }
});

router.post('/application', requireAuth, async (req, res) => {
  const { program_id, academic_year, semester } = req.body;
  if (!program_id) {
    const student = await prisma.students.findUnique({ where: { id: req.user.id } });
    const programs = await prisma.scholarship_programs.findMany({ where: { is_active: true } });
    return res.render('portal/application', { student, programs, error: 'Please select a program.', message: null });
  }

  try {
    const existing = await prisma.applications.findFirst({
      where: { student_id: req.user.id, program_id, status: { notIn: ['rejected', 'withdrawn'] } },
    });
    if (existing) {
      const student = await prisma.students.findUnique({ where: { id: req.user.id } });
      const programs = await prisma.scholarship_programs.findMany({ where: { is_active: true } });
      return res.render('portal/application', { student, programs, error: 'You already have an active application for this program.', message: null });
    }

    await prisma.applications.create({
      data: {
        student_id: req.user.id,
        program_id,
        academic_year: academic_year || null,
        semester: semester || null,
        status: 'pending',
      },
    });

    res.redirect('/portal');
  } catch (err) {
    console.error('Application submit error:', err);
    res.redirect('/portal/application');
  }
});

router.get('/renewal', requireAuth, async (req, res) => {
  try {
    const student = await prisma.students.findUnique({ where: { id: req.user.id } });
    const activeApps = await prisma.applications.findMany({
      where: { student_id: req.user.id, status: { in: ['approved', 'pending', 'review'] } },
      include: { program: true, documents: true },
      orderBy: { created_at: 'desc' },
    });
    const history = await prisma.applications.findMany({
      where: { student_id: req.user.id },
      include: { program: true },
      orderBy: { created_at: 'desc' },
    });
    const programs = await prisma.scholarship_programs.findMany({
      where: {
        is_active: true,
        application_start: { lte: new Date() },
        application_end: { gte: new Date() },
      },
      orderBy: { application_end: 'asc' },
    });

    res.render('portal/renewal', {
      student,
      activeApps,
      history,
      programs,
      error: null,
      message: null,
    });
  } catch (err) {
    console.error('Renewal page error:', err);
    res.redirect('/portal');
  }
});

router.get('/documents', requireAuth, async (req, res) => {
  try {
    const student = await prisma.students.findUnique({ where: { id: req.user.id } });
    const applications = await prisma.applications.findMany({
      where: { student_id: req.user.id },
      include: { program: true, documents: true },
      orderBy: { created_at: 'desc' },
    });
    const documents = await prisma.documents.findMany({
      where: { application: { student_id: req.user.id } },
      orderBy: { created_at: 'desc' },
    });
    const activeApps = applications.filter(a => a.status !== 'rejected' && a.status !== 'withdrawn');

    res.render('portal/documents', {
      student,
      applications,
      documents,
      activeApps,
      error: req.query.error || null,
      message: req.query.message || null,
    });
  } catch (err) {
    console.error('Documents page error:', err);
    res.redirect('/portal');
  }
});

router.get('/notifications', requireAuth, async (req, res) => {
  try {
    const student = await prisma.students.findUnique({ where: { id: req.user.id } });
    res.render('portal/notifications', { student });
  } catch (err) {
    console.error('Notifications page error:', err);
    res.redirect('/portal');
  }
});

module.exports = router;
