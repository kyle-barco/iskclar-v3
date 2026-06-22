const express = require('express');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { prisma, requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../middleware/activity');
const { sanitizeText, containsProfanity, validateName, validatePassword } = require('../lib/validation');
const idempotency = require('../middleware/idempotency');

router.use(idempotency);

/* ── Dashboard ──────────────────────────────────────────── */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const notDeleted = { is_deleted: false };
    const [applications, students, approved, pending, underReview, rejected, waitlisted, recent] = await Promise.all([
      prisma.applications.count({ where: notDeleted }),
      prisma.students.count({ where: notDeleted }),
      prisma.applications.count({ where: { ...notDeleted, status: 'approved' } }),
      prisma.applications.count({ where: { ...notDeleted, status: 'pending' } }),
      prisma.applications.count({ where: { ...notDeleted, status: 'under_review' } }),
      prisma.applications.count({ where: { ...notDeleted, status: 'rejected' } }),
      prisma.applications.count({ where: { ...notDeleted, status: 'waitlisted' } }),
      prisma.applications.findMany({
        take: 10,
        where: notDeleted,
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
    const { status, search, sort: sortBy } = req.query;
    const where = {};

    if (status) where.status = status;
    if (search) {
      where.OR = [
        { student: { first_name: { contains: search, mode: 'insensitive' } } },
        { student: { last_name: { contains: search, mode: 'insensitive' } } },
        { student: { student_id: { contains: search, mode: 'insensitive' } } },
      ];
    }

    where.is_deleted = false;

    let orderBy = { created_at: 'desc' };
    if (sortBy === 'name_asc') orderBy = { student: { last_name: 'asc' } };
    else if (sortBy === 'name_desc') orderBy = { student: { last_name: 'desc' } };
    else if (sortBy === 'year_level') orderBy = { student: { year_level: 'asc' } };
    else if (sortBy === 'date_asc') orderBy = { created_at: 'asc' };
    else if (sortBy === 'college') orderBy = { student: { college: 'asc' } };

    const applications = await prisma.applications.findMany({
      where,
      include: { student: true, program: true },
      orderBy,
    });

    res.render('admin/applications', {
      applications,
      adminRole: req.adminRole,
      statusFilter: status || '',
      search: search || '',
      sortBy: sortBy || '',
    });
  } catch (err) {
    console.error('Fetch applications error:', err);
    res.send('Server error');
  }
});

router.post('/applications/:id', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const allowedTargets = ['under_review', 'approved', 'rejected', 'waitlisted'];
  if (!allowedTargets.includes(status)) return res.redirect('/admin/applications');

  const VALID_TRANSITIONS = {
    pending: ['under_review', 'rejected'],
    under_review: ['approved', 'rejected', 'waitlisted'],
    waitlisted: ['approved', 'rejected'],
    approved: [],
    rejected: [],
  };

  try {
    const app = await prisma.applications.findUnique({ where: { id: req.params.id } });
    if (!app) return res.redirect('/admin/applications');

    const allowedFrom = VALID_TRANSITIONS[app.status];
    if (!allowedFrom || !allowedFrom.includes(status)) {
      return res.redirect('/admin/applications');
    }

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
      include: { program: true, documents: true },
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
      where: { is_deleted: false },
      orderBy: { application_start: 'desc' },
      include: {
        _count: { select: { applications: { where: { is_deleted: false } } } },
        deletion_requester: { select: { id: true, display_name: true } },
        deletion_approver: { select: { id: true, display_name: true } },
      },
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

  var cleanName = sanitizeText(body.name.trim());
  var cleanDesc = sanitizeText((body.description || '').trim());

  if (containsProfanity(body.name) || containsProfanity(body.description)) {
    return res.render('admin/program-form', {
      program: null,
      adminRole: req.adminRole,
      error: 'Program name or description contains inappropriate language.',
    });
  }

  try {
    await prisma.scholarship_programs.create({
      data: {
        name: cleanName,
        description: cleanDesc,
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

  var cleanName = sanitizeText(body.name.trim());
  var cleanDesc = sanitizeText((body.description || '').trim());

  if (containsProfanity(body.name) || containsProfanity(body.description)) {
    return res.redirect('/admin/programs/' + req.params.id + '/edit?error=Inappropriate language detected.');
  }

  try {
    await prisma.scholarship_programs.update({
      where: { id: req.params.id },
      data: {
        name: cleanName,
        description: cleanDesc,
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
    await prisma.scholarship_programs.update({
      where: { id: req.params.id },
      data: {
        deletion_requested_by: req.user.id,
        deletion_requested_at: new Date(),
        deletion_approved_by: null,
        deletion_approved_at: null,
      },
    });
    await logActivity(req.user.id, 'request_delete_program', 'scholarship_program', req.params.id, { name: req.body._name });
    res.redirect('/admin/programs?message=Deletion request submitted. Awaiting superadmin approval.');
  } catch (err) {
    console.error('Request delete program error:', err);
    res.redirect('/admin/programs?error=Failed to request deletion.');
  }
});

router.post('/programs/:id/approve-deletion', requireAdmin, requireSuperadmin, async (req, res) => {
  try {
    await prisma.applications.updateMany({
      where: { program_id: req.params.id },
      data: { is_deleted: true, deleted_at: new Date() },
    });
    const program = await prisma.scholarship_programs.update({
      where: { id: req.params.id },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
        deletion_approved_by: req.user.id,
        deletion_approved_at: new Date(),
      },
    });
    await logActivity(req.user.id, 'approve_delete_program', 'scholarship_program', req.params.id, { name: program.name });
    res.redirect('/admin/programs?message=Deletion approved and program deleted.');
  } catch (err) {
    console.error('Approve deletion error:', err);
    res.redirect('/admin/programs?error=Failed to approve deletion.');
  }
});

router.post('/programs/:id/reject-deletion', requireAdmin, requireSuperadmin, async (req, res) => {
  try {
    const program = await prisma.scholarship_programs.update({
      where: { id: req.params.id },
      data: {
        deletion_requested_by: null,
        deletion_requested_at: null,
        deletion_approved_by: null,
        deletion_approved_at: null,
      },
    });
    await logActivity(req.user.id, 'restore_program', 'scholarship_program', req.params.id, { name: program.name });
    res.redirect('/admin/programs?message=Program restored successfully.');
  } catch (err) {
    console.error('Restore program error:', err);
    res.redirect('/admin/programs?error=Failed to restore program.');
  }
});

router.post('/programs/:id/permanent-delete', requireAdmin, requireSuperadmin, async (req, res) => {
  try {
    const program = await prisma.scholarship_programs.findUnique({ where: { id: req.params.id } });
    await prisma.documents.deleteMany({ where: { application: { program_id: req.params.id } } });
    await prisma.applications.deleteMany({ where: { program_id: req.params.id } });
    await prisma.scholarship_programs.delete({ where: { id: req.params.id } });
    await logActivity(req.user.id, 'permanent_delete_program', 'scholarship_program', req.params.id, { name: program ? program.name : 'Unknown' });
    res.redirect('/admin/programs?message=Program permanently deleted from the database.');
  } catch (err) {
    console.error('Permanent delete error:', err);
    res.redirect('/admin/programs?error=Failed to permanently delete program.');
  }
});

/* ── Admin Users (superadmin only) ─────────────────────── */
async function requireSuperadmin(req, res, next) {
  if (req.adminRole !== 'superadmin') return res.status(403).render('admin/403');
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

    if (display_name.toLowerCase() === email.split('@')[0].toLowerCase()) {
      return res.redirect('/admin/admins?error=Display name must be different from the email prefix.');
    }
    if (containsProfanity(display_name)) {
      return res.redirect('/admin/admins?error=Display name contains inappropriate language.');
    }

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

/* ── Notifications ──────────────────────────────────────── */
router.get('/notifications', requireAdmin, async (req, res) => {
  try {
    var where = {};
    if (req.adminRole !== 'superadmin') {
      where.OR = [
        { created_by: req.user.id },
        { status: 'approved' },
      ];
    }

    const notifications = await prisma.notifications.findMany({
      where,
      include: {
        creator: { select: { display_name: true, email: true } },
        approver: { select: { display_name: true, email: true } },
      },
      orderBy: [
        { status: 'asc' },
        { created_at: 'desc' },
      ],
    });

    const pendingCount = await prisma.notifications.count({ where: { status: 'pending' } });

    res.render('admin/notifications', {
      notifications,
      adminRole: req.adminRole,
      currentUserId: req.user.id,
      pendingCount,
      message: req.query.message || null,
      error: req.query.error || null,
    });
  } catch (err) {
    console.error('Notifications error:', err);
    res.render('admin/notifications', { notifications: [], adminRole: req.adminRole, currentUserId: req.user.id, pendingCount: 0, message: null, error: 'Failed to load notifications.' });
  }
});

router.post('/notifications', requireAdmin, async (req, res) => {
  var { title, message } = req.body;
  if (!title || !message) return res.redirect('/admin/notifications?error=Title and message are required.');

  title = sanitizeText(title.trim());
  message = sanitizeText(message.trim());

  if (containsProfanity(req.body.title) || containsProfanity(req.body.message)) {
    return res.redirect('/admin/notifications?error=Notification contains inappropriate language.');
  }

  try {
    var status = req.adminRole === 'superadmin' ? 'approved' : 'pending';
    var approvedBy = req.adminRole === 'superadmin' ? req.user.id : null;

    const notif = await prisma.notifications.create({
      data: {
        title,
        message,
        status,
        created_by: req.user.id,
        approved_by: approvedBy,
      },
    });

    logActivity(req.user.id, 'create_notification', 'notification', notif.id, { title });

    res.redirect('/admin/notifications?message=Notification created.');
  } catch (err) {
    console.error('Create notification error:', err);
    res.redirect('/admin/notifications?error=Failed to create notification.');
  }
});

router.post('/notifications/:id/approve', requireAdmin, async (req, res) => {
  if (req.adminRole !== 'superadmin') return res.redirect('/admin/notifications');

  try {
    const notif = await prisma.notifications.findUnique({ where: { id: req.params.id } });
    if (!notif) return res.redirect('/admin/notifications?error=Notification not found.');
    if (notif.status !== 'pending') return res.redirect('/admin/notifications?error=Only pending notifications can be approved.');

    await prisma.notifications.update({
      where: { id: req.params.id },
      data: { status: 'approved', approved_by: req.user.id },
    });

    logActivity(req.user.id, 'approve_notification', 'notification', req.params.id, { title: notif.title });

    res.redirect('/admin/notifications?message=Notification approved and published.');
  } catch (err) {
    console.error('Approve notification error:', err);
    res.redirect('/admin/notifications?error=Failed to approve notification.');
  }
});

router.post('/notifications/:id/reject', requireAdmin, async (req, res) => {
  if (req.adminRole !== 'superadmin') return res.redirect('/admin/notifications');

  try {
    const notif = await prisma.notifications.findUnique({ where: { id: req.params.id } });
    if (!notif) return res.redirect('/admin/notifications?error=Notification not found.');
    if (notif.status !== 'pending') return res.redirect('/admin/notifications?error=Only pending notifications can be rejected.');

    var reason = req.body.rejection_reason || 'No reason provided.';

    await prisma.notifications.update({
      where: { id: req.params.id },
      data: { status: 'rejected', approved_by: req.user.id, rejected_at: new Date(), rejection_reason: reason },
    });

    logActivity(req.user.id, 'reject_notification', 'notification', req.params.id, { title: notif.title, reason });

    res.redirect('/admin/notifications?message=Notification rejected.');
  } catch (err) {
    console.error('Reject notification error:', err);
    res.redirect('/admin/notifications?error=Failed to reject notification.');
  }
});

router.post('/notifications/:id/edit', requireAdmin, async (req, res) => {
  var { title, message, status, rejection_reason } = req.body;
  if (!title || !message) return res.redirect('/admin/notifications?error=Title and message are required.');

  title = sanitizeText(title.trim());
  message = sanitizeText(message.trim());

  if (containsProfanity(req.body.title) || containsProfanity(req.body.message)) {
    return res.redirect('/admin/notifications?error=Notification contains inappropriate language.');
  }

  try {
    const notif = await prisma.notifications.findUnique({ where: { id: req.params.id } });
    if (!notif) return res.redirect('/admin/notifications?error=Notification not found.');

    if (req.adminRole !== 'superadmin' && notif.created_by !== req.user.id) {
      return res.redirect('/admin/notifications?error=You can only edit your own notifications.');
    }
    if (req.adminRole !== 'superadmin' && notif.status !== 'pending') {
      return res.redirect('/admin/notifications?error=Only pending notifications can be edited.');
    }

    var updateData = { title, message };

    if (req.adminRole === 'superadmin' && status) {
      if (status === 'approved') {
        updateData.status = 'approved';
        updateData.approved_by = req.user.id;
      } else if (status === 'rejected') {
        if (!rejection_reason || !rejection_reason.trim()) {
          return res.redirect('/admin/notifications?error=Rejection reason is required.');
        }
        updateData.status = 'rejected';
        updateData.approved_by = req.user.id;
        updateData.rejected_at = new Date();
        updateData.rejection_reason = sanitizeText(rejection_reason.trim());
      }
    }

    await prisma.notifications.update({ where: { id: req.params.id }, data: updateData });

    logActivity(req.user.id, 'edit_notification', 'notification', req.params.id, { title, status: status || notif.status });

    res.redirect('/admin/notifications?message=Notification updated.');
  } catch (err) {
    console.error('Edit notification error:', err);
    res.redirect('/admin/notifications?error=Failed to update notification.');
  }
});

router.post('/notifications/:id/delete', requireAdmin, async (req, res) => {
  try {
    const notif = await prisma.notifications.findUnique({ where: { id: req.params.id } });
    if (!notif) return res.redirect('/admin/notifications?error=Notification not found.');

    if (req.adminRole !== 'superadmin' && notif.created_by !== req.user.id) {
      return res.redirect('/admin/notifications?error=You can only delete your own notifications.');
    }

    await prisma.notifications.delete({ where: { id: req.params.id } });

    logActivity(req.user.id, 'delete_notification', 'notification', req.params.id, { title: notif.title });

    res.redirect('/admin/notifications?message=Notification deleted.');
  } catch (err) {
    console.error('Delete notification error:', err);
    res.redirect('/admin/notifications?error=Failed to delete notification.');
  }
});

/* ── School Year ────────────────────────────────────────── */
const DEFAULT_EVENTS = [
  { title: 'Applications Open', event_date: new Date('2026-06-01'), color: '#2e7d32', type: 'application' },
  { title: 'Application Deadline', event_date: new Date('2026-07-15'), color: '#c62828', type: 'deadline' },
  { title: 'Screening', event_date: new Date('2026-07-18'), color: '#f9a825', type: 'verification' },
  { title: 'Evaluation', event_date: new Date('2026-08-05'), color: '#1565c0', type: 'evaluation' },
  { title: 'Scholar Release', event_date: new Date('2026-08-15'), color: '#8e24aa', type: 'interview' },
];

router.get('/school-year', requireAdmin, async (req, res) => {
  try {
    const appCount = await prisma.applications.count();
    var events = await prisma.school_events.findMany({ orderBy: { event_date: 'asc' } });
    if (events.length === 0) {
      for (var ev of DEFAULT_EVENTS) {
        await prisma.school_events.create({ data: ev });
      }
      events = await prisma.school_events.findMany({ orderBy: { event_date: 'asc' } });
    }
    const upcoming = events.filter(function(e) { return new Date(e.event_date) >= new Date(); });
    res.render('admin/school-year', {
      adminRole: req.adminRole,
      currentSy: '2026–2027',
      totalApplications: appCount,
      upcomingEvents: upcoming.length,
      daysRemaining: 28,
      events: JSON.stringify(events),
    });
  } catch (err) {
    console.error('School year error:', err);
    res.render('admin/school-year', {
      adminRole: req.adminRole,
      currentSy: '2026–2027',
      totalApplications: 0,
      upcomingEvents: 0,
      daysRemaining: '--',
      events: '[]',
    });
  }
});

router.get('/school-year/events', requireAdmin, async (req, res) => {
  try {
    const events = await prisma.school_events.findMany({ orderBy: { event_date: 'asc' } });
    res.json(events);
  } catch (err) {
    console.error('Fetch events error:', err);
    res.status(500).json({ error: 'Failed to fetch events.' });
  }
});

router.post('/school-year/events', requireAdmin, async (req, res) => {
  var { title, description, event_date, end_date, color, type } = req.body;
  if (!title || !event_date) return res.status(400).json({ error: 'Title and date are required.' });

  try {
    var event = await prisma.school_events.create({
      data: {
        title: title.trim(),
        description: (description || '').trim(),
        event_date: new Date(event_date),
        end_date: end_date ? new Date(end_date) : null,
        color: color || '#2e7d32',
        type: type || 'application',
        created_by: req.user.id,
      },
    });
    res.json(event);
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ error: 'Failed to create event.' });
  }
});

router.put('/school-year/events/:id', requireAdmin, async (req, res) => {
  var { title, description, event_date, end_date, color, type } = req.body;
  if (!title || !event_date) return res.status(400).json({ error: 'Title and date are required.' });

  try {
    var event = await prisma.school_events.update({
      where: { id: req.params.id },
      data: {
        title: title.trim(),
        description: (description || '').trim(),
        event_date: new Date(event_date),
        end_date: end_date ? new Date(end_date) : null,
        color: color || '#2e7d32',
        type: type || 'application',
      },
    });
    res.json(event);
  } catch (err) {
    console.error('Update event error:', err);
    res.status(500).json({ error: 'Failed to update event.' });
  }
});

router.delete('/school-year/events/:id', requireAdmin, async (req, res) => {
  try {
    await prisma.school_events.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete event error:', err);
    res.status(500).json({ error: 'Failed to delete event.' });
  }
});

/* ── Reports & Analytics (superadmin) ──────────────────── */
router.get('/reports', requireAdmin, requireSuperadmin, async (req, res) => {
  try {
    const [totalApps, approvedCount, rejectedCount, pendingReview, studentsCount] = await Promise.all([
      prisma.applications.count(),
      prisma.applications.count({ where: { status: 'approved' } }),
      prisma.applications.count({ where: { status: 'rejected' } }),
      prisma.applications.count({ where: { status: { in: ['pending', 'under_review'] } } }),
      prisma.students.count(),
    ]);

    var approvedPct = totalApps > 0 ? Math.round(approvedCount / totalApps * 100) : 0;
    var pendingPct = totalApps > 0 ? Math.round(pendingReview / totalApps * 100) : 0;
    var rejectedPct = totalApps > 0 ? Math.round(rejectedCount / totalApps * 100) : 0;

    res.render('admin/reports', {
      adminRole: req.adminRole,
      totalScholars: approvedCount,
      totalApplications: totalApps,
      totalApproved: approvedCount,
      pendingCount: pendingReview,
      rejectedCount,
      budgetReleased: '₱2.4M',
      approvedPct,
      pendingPct,
      rejectedPct,
      academicPct: 45,
      financialPct: 30,
      athleticPct: 15,
      specialPct: 10,
      currentSy: '2025-2026',
      annualReports: [
        { school_year: '2025-2026', applicants: totalApps, approved: approvedCount, rejected: rejectedCount, budget: '₱2.4M' },
      ],
    });
  } catch (err) {
    console.error('Reports error:', err);
    res.render('admin/reports', { adminRole: req.adminRole });
  }
});

/* ── Activity Logs (superadmin) ─────────────────────────── */
router.get('/activity-logs', requireAdmin, requireSuperadmin, async (req, res) => {
  try {
    const [logs, pendingDeletions] = await Promise.all([
      prisma.activity_logs.findMany({
        include: { admin: { select: { display_name: true, email: true } } },
        orderBy: { created_at: 'desc' },
        take: 200,
      }),
      prisma.scholarship_programs.findMany({
        where: { is_deleted: false, deletion_requested_by: { not: null }, deletion_approved_at: null },
        include: {
          deletion_requester: { select: { id: true, display_name: true } },
        },
      }),
    ]);

    res.render('admin/activity-logs', {
      logs,
      pendingDeletions,
      adminRole: req.adminRole,
    });
  } catch (err) {
    console.error('Activity logs error:', err);
    res.render('admin/activity-logs', { logs: [], pendingDeletions: [], adminRole: req.adminRole });
  }
});

/* ── Trash (superadmin) ────────────────────────────────── */
router.get('/trash', requireAdmin, requireSuperadmin, async (req, res) => {
  try {
    const [rejectedApps, withdrawnApps, inactiveAdmins, deletedPrograms] = await Promise.all([
      prisma.applications.findMany({
        where: { status: 'rejected' },
        include: { student: true, program: true },
        orderBy: { reviewed_at: 'desc' },
        take: 50,
      }),
      prisma.applications.findMany({
        where: { status: 'withdrawn' },
        include: { student: true, program: true },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
      prisma.admins.findMany({
        where: { is_active: false },
        orderBy: { email: 'asc' },
      }),
      prisma.scholarship_programs.findMany({
        where: { is_deleted: true },
        include: {
          deletion_requester: { select: { id: true, display_name: true } },
          deletion_approver: { select: { id: true, display_name: true } },
        },
        orderBy: { deleted_at: 'desc' },
        take: 50,
      }),
    ]);

    res.render('admin/trash', {
      rejectedApps,
      withdrawnApps,
      inactiveAdmins,
      deletedPrograms,
      adminRole: req.adminRole,
    });
  } catch (err) {
    console.error('Trash page error:', err);
    res.send('Server error.');
  }
});

router.post('/programs/:id/restore', requireAdmin, requireSuperadmin, async (req, res) => {
  try {
    await prisma.scholarship_programs.update({
      where: { id: req.params.id },
      data: {
        is_deleted: false,
        deleted_at: null,
        deletion_requested_by: null,
        deletion_requested_at: null,
        deletion_approved_by: null,
        deletion_approved_at: null,
      },
    });
    await prisma.applications.updateMany({
      where: { program_id: req.params.id },
      data: { is_deleted: false, deleted_at: null },
    });
    await logActivity(req.user.id, 'restore_program', 'scholarship_program', req.params.id, {});
    res.redirect('/admin/trash?message=Program restored successfully.');
  } catch (err) {
    console.error('Restore program error:', err);
    res.redirect('/admin/trash?error=Failed to restore program.');
  }
});

/* ── Serve uploaded documents (admin) ──────────────────── */
router.get('/documents/:id', requireAdmin, async (req, res) => {
  try {
    const doc = await prisma.documents.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).send('Document not found.');

    res.render('admin/document-view', {
      doc,
      adminRole: req.adminRole,
      backUrl: req.headers.referer || '/admin/applications',
    });
  } catch (err) {
    console.error('Serve document error:', err);
    res.status(500).send('Server error.');
  }
});

router.get('/documents/:id/download', requireAdmin, async (req, res) => {
  try {
    const doc = await prisma.documents.findUnique({ where: { id: req.params.id } });
    if (!doc) return res.status(404).send('Document not found.');

    const filePath = path.join(__dirname, '../../uploads', doc.file_path);
    if (!fs.existsSync(filePath)) return res.status(404).send('File not found.');

    res.setHeader('Content-Type', doc.mime_type);
    res.setHeader('Content-Disposition', `inline; filename="${doc.file_name}"`);
    res.sendFile(filePath);
  } catch (err) {
    console.error('Serve document error:', err);
    res.status(500).send('Server error.');
  }
});

/* ── Trash: Application restore / permanent-delete ───────── */
router.post('/applications/:id/restore', requireAdmin, requireSuperadmin, async (req, res) => {
  try {
    await prisma.applications.update({
      where: { id: req.params.id },
      data: { status: 'pending', reviewed_by: null, reviewed_at: null },
    });
    await logActivity(req.user.id, 'restore_application', 'application', req.params.id, {});
    res.redirect('/admin/trash?message=Application restored successfully.');
  } catch (err) {
    console.error('Restore application error:', err);
    res.redirect('/admin/trash?error=Failed to restore application.');
  }
});

router.post('/applications/:id/permanent-delete', requireAdmin, requireSuperadmin, async (req, res) => {
  try {
    await prisma.documents.deleteMany({ where: { application_id: req.params.id } });
    await prisma.applications.delete({ where: { id: req.params.id } });
    await logActivity(req.user.id, 'permanent_delete_application', 'application', req.params.id, {});
    res.redirect('/admin/trash?message=Application permanently deleted.');
  } catch (err) {
    console.error('Permanent delete application error:', err);
    res.redirect('/admin/trash?error=Failed to permanently delete application.');
  }
});

/* ── Trash: Admin restore / permanent-delete ─────────────── */
router.post('/admins/:id/restore', requireAdmin, requireSuperadmin, async (req, res) => {
  try {
    await prisma.admins.update({
      where: { id: req.params.id },
      data: { is_active: true },
    });
    await logActivity(req.user.id, 'restore_admin', 'admin', req.params.id, {});
    res.redirect('/admin/trash?message=Admin account restored successfully.');
  } catch (err) {
    console.error('Restore admin error:', err);
    res.redirect('/admin/trash?error=Failed to restore admin account.');
  }
});

router.post('/admins/:id/permanent-delete', requireAdmin, requireSuperadmin, async (req, res) => {
  try {
    const admin = await prisma.admins.findUnique({ where: { id: req.params.id } });
    if (!admin) return res.redirect('/admin/trash?error=Admin not found.');
    if (admin.id === req.user.id) return res.redirect('/admin/trash?error=You cannot delete your own account.');
    await prisma.admins.delete({ where: { id: req.params.id } });
    await logActivity(req.user.id, 'permanent_delete_admin', 'admin', req.params.id, {});
    res.redirect('/admin/trash?message=Admin permanently deleted.');
  } catch (err) {
    console.error('Permanent delete admin error:', err);
    res.redirect('/admin/trash?error=Failed to permanently delete admin.');
  }
});

module.exports = router;
