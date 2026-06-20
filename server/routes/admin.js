const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { prisma, requireAdmin } = require('../middleware/auth');

/* ── Dashboard ──────────────────────────────────────────── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [applications, students, approved, pending, underReview, rejected, waitlisted, recent] = await Promise.all([
      prisma.applications.count(),
      prisma.students.count(),
      prisma.applications.count({ where: { status: 'approved' } }),
      prisma.applications.count({ where: { status: 'pending' } }),
      prisma.applications.count({ where: { status: 'under_review' } }),
      prisma.applications.count({ where: { status: 'rejected' } }),
      prisma.applications.count({ where: { status: 'waitlisted' } }),
      prisma.applications.findMany({
        take: 10,
        orderBy: { created_at: 'desc' },
        include: { student: true, program: true },
      }),
    ]);

    res.render('admin/dashboard', {
      adminRole: req.adminRole,
      stats: { applications, students, approved, pending, under_review: underReview, rejected, waitlisted },
      recentApplications: recent,
    });
  } catch (err) {
    console.error('Admin dashboard error:', err);
    res.send('Server error');
  }
});

/* ── Applications ───────────────────────────────────────── */
router.get('/applications', requireAdmin, async (req, res) => {
  try {
    const { status, search } = req.query;
    const where = {};

    if (status) where.status = status;
    if (search) {
      where.OR = [
        { student: { first_name: { contains: search, mode: 'insensitive' } } },
        { student: { last_name: { contains: search, mode: 'insensitive' } } },
        { student: { student_id: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const applications = await prisma.applications.findMany({
      where,
      include: { student: true, program: true },
      orderBy: { created_at: 'desc' },
    });

    res.render('admin/applications', {
      applications,
      adminRole: req.adminRole,
      statusFilter: status || '',
      search: search || '',
    });
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

/* ── Students ───────────────────────────────────────────── */
router.get('/students', requireAdmin, async (req, res) => {
  try {
    const { search } = req.query;
    const where = {};

    if (search) {
      where.OR = [
        { first_name: { contains: search, mode: 'insensitive' } },
        { last_name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { student_id: { contains: search, mode: 'insensitive' } },
      ];
    }

    const students = await prisma.students.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });

    res.render('admin/students', { students, adminRole: req.adminRole, search: search || '' });
  } catch (err) {
    console.error('Fetch students error:', err);
    res.send('Server error');
  }
});

router.get('/students/:id', requireAdmin, async (req, res) => {
  try {
    const s = await prisma.students.findUnique({ where: { id: req.params.id } });
    if (!s) return res.redirect('/admin/students?error=Student not found.');

    const applications = await prisma.applications.findMany({
      where: { student_id: req.params.id },
      include: { program: true },
      orderBy: { created_at: 'desc' },
    });

    res.render('admin/student-view', {
      s,
      applications,
      adminRole: req.adminRole,
      message: req.query.message || null,
      error: req.query.error || null,
    });
  } catch (err) {
    console.error('Fetch student error:', err);
    res.redirect('/admin/students?error=Failed to load student.');
  }
});

/* ── Scholarship Programs ───────────────────────────────── */
router.get('/programs', requireAdmin, async (req, res) => {
  try {
    const programs = await prisma.scholarship_programs.findMany({
      orderBy: { application_start: 'desc' },
      include: { _count: { select: { applications: true } } },
    });

    res.render('admin/programs', {
      programs,
      adminRole: req.adminRole,
      message: req.query.message || null,
      error: req.query.error || null,
    });
  } catch (err) {
    console.error('Fetch programs error:', err);
    res.send('Server error');
  }
});

router.get('/programs/new', requireAdmin, async (req, res) => {
  res.render('admin/program-form', { program: null, adminRole: req.adminRole, error: null });
});

router.post('/programs', requireAdmin, async (req, res) => {
  const body = req.body;
  if (!body.name || !body.type || !body.academic_year || !body.semester || !body.application_start || !body.application_end) {
    return res.render('admin/program-form', {
      program: null,
      adminRole: req.adminRole,
      error: 'Required fields missing.',
    });
  }

  try {
    await prisma.scholarship_programs.create({
      data: {
        name: body.name,
        description: body.description || '',
        slots: body.slots ? parseInt(body.slots) : null,
        gpa_requirement: body.gpa_requirement ? parseFloat(body.gpa_requirement) : null,
        type: body.type,
        academic_year: body.academic_year,
        semester: body.semester,
        application_start: new Date(body.application_start),
        application_end: new Date(body.application_end),
        is_active: body.is_active === 'on',
      },
    });

    res.redirect('/admin/programs?message=Program created successfully.');
  } catch (err) {
    console.error('Create program error:', err);
    res.render('admin/program-form', {
      program: null,
      adminRole: req.adminRole,
      error: 'Failed to create program.',
    });
  }
});

router.get('/programs/:id/edit', requireAdmin, async (req, res) => {
  try {
    const program = await prisma.scholarship_programs.findUnique({ where: { id: req.params.id } });
    if (!program) return res.redirect('/admin/programs?error=Program not found.');

    res.render('admin/program-form', { program, adminRole: req.adminRole, error: null });
  } catch (err) {
    console.error('Edit program error:', err);
    res.redirect('/admin/programs?error=Failed to load program.');
  }
});

router.post('/programs/:id', requireAdmin, async (req, res) => {
  const body = req.body;
  if (!body.name || !body.type || !body.academic_year || !body.semester || !body.application_start || !body.application_end) {
    return res.redirect('/admin/programs/' + req.params.id + '/edit?error=Required fields missing.');
  }

  try {
    await prisma.scholarship_programs.update({
      where: { id: req.params.id },
      data: {
        name: body.name,
        description: body.description || '',
        slots: body.slots ? parseInt(body.slots) : null,
        gpa_requirement: body.gpa_requirement ? parseFloat(body.gpa_requirement) : null,
        type: body.type,
        academic_year: body.academic_year,
        semester: body.semester,
        application_start: new Date(body.application_start),
        application_end: new Date(body.application_end),
        is_active: body.is_active === 'on',
      },
    });

    res.redirect('/admin/programs?message=Program updated successfully.');
  } catch (err) {
    console.error('Update program error:', err);
    res.redirect('/admin/programs/' + req.params.id + '/edit?error=Failed to update program.');
  }
});

router.post('/programs/:id/delete', requireAdmin, async (req, res) => {
  try {
    await prisma.applications.deleteMany({ where: { program_id: req.params.id } });
    await prisma.scholarship_programs.delete({ where: { id: req.params.id } });
    res.redirect('/admin/programs?message=Program deleted successfully.');
  } catch (err) {
    console.error('Delete program error:', err);
    res.redirect('/admin/programs?error=Failed to delete program.');
  }
});

/* ── Admin Users (superadmin only) ─────────────────────── */
async function requireSuperadmin(req, res, next) {
  if (req.adminRole !== 'superadmin') return res.redirect('/admin');
  next();
}

router.get('/admins', requireAdmin, requireSuperadmin, async (req, res) => {
  try {
    const admins = await prisma.admins.findMany({ orderBy: { email: 'asc' } });
    res.render('admin/admins', {
      admins,
      adminRole: req.adminRole,
      message: req.query.message || null,
      error: req.query.error || null,
    });
  } catch (err) {
    console.error('Fetch admins error:', err);
    res.send('Server error');
  }
});

router.post('/admins', requireAdmin, requireSuperadmin, async (req, res) => {
  const { email, display_name, password, role } = req.body;
  if (!email || !display_name || !password || !role) {
    return res.redirect('/admin/admins?error=All fields required.');
  }

  try {
    const existing = await prisma.admins.findUnique({ where: { email } });
    if (existing) return res.redirect('/admin/admins?error=Email already in use.');

    const password_hash = await bcrypt.hash(password, 10);
    await prisma.admins.create({
      data: { email, display_name, password_hash, role, is_active: true },
    });

    res.redirect('/admin/admins?message=Admin user created successfully.');
  } catch (err) {
    console.error('Create admin error:', err);
    res.redirect('/admin/admins?error=Failed to create admin.');
  }
});

router.post('/admins/:id/toggle-active', requireAdmin, requireSuperadmin, async (req, res) => {
  try {
    const admin = await prisma.admins.findUnique({ where: { id: req.params.id } });
    if (!admin) return res.redirect('/admin/admins?error=Admin not found.');

    await prisma.admins.update({
      where: { id: req.params.id },
      data: { is_active: !admin.is_active },
    });

    res.redirect('/admin/admins?message=Admin status updated.');
  } catch (err) {
    console.error('Toggle admin error:', err);
    res.redirect('/admin/admins?error=Failed to update admin.');
  }
});

router.post('/admins/:id/delete', requireAdmin, requireSuperadmin, async (req, res) => {
  try {
    const admin = await prisma.admins.findUnique({ where: { id: req.params.id } });
    if (!admin) return res.redirect('/admin/admins?error=Admin not found.');

    if (admin.id === req.user.id) {
      return res.redirect('/admin/admins?error=You cannot delete your own account.');
    }

    const superadminCount = await prisma.admins.count({ where: { role: 'superadmin', is_active: true } });
    if (admin.role === 'superadmin' && superadminCount <= 1) {
      return res.redirect('/admin/admins?error=Cannot delete the last active superadmin.');
    }

    await prisma.admins.delete({ where: { id: req.params.id } });
    res.redirect('/admin/admins?message=Admin deleted.');
  } catch (err) {
    console.error('Delete admin error:', err);
    res.redirect('/admin/admins?error=Failed to delete admin.');
  }
});

module.exports = router;
