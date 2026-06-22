const jwt = require('jsonwebtoken');
const { createPrisma } = require('../lib/prisma');
const { checkInactivity } = require('./inactivity');

const prisma = createPrisma({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

function signToken(user, expiresIn) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role || 'student' },
    process.env.JWT_SECRET,
    { expiresIn: expiresIn || '7d' }
  );
}

async function requireAuth(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.redirect('/auth/login');

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const student = await prisma.students.findUnique({ where: { id: payload.id } });
    if (!student) {
      res.clearCookie('token');
      return res.redirect('/auth/login');
    }
    req.user = payload;
    checkInactivity(req, res, next);
  } catch {
    res.clearCookie('token');
    return res.redirect('/auth/login');
  }
}

async function requireAdmin(req, res, next) {
  const token = req.cookies?.token || req.headers.authorization?.split('Bearer ')[1];
  if (!token) return res.redirect('/auth/admin');

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await prisma.admins.findUnique({ where: { id: payload.id } });
    if (!admin || !admin.is_active) return res.redirect('/auth/admin');
    req.user = payload;
    req.adminRole = admin.role;
    res.locals.adminName = admin.display_name || (admin.email ? admin.email.split('@')[0] : 'Admin');
    res.locals.adminRole = admin.role;
    checkInactivity(req, res, next);
  } catch {
    return res.redirect('/auth/admin');
  }
}

module.exports = { prisma, signToken, requireAuth, requireAdmin };
