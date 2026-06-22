const { createPrisma } = require('../lib/prisma');
const prisma = createPrisma({ log: ['error'] });

async function logActivity(adminId, action, targetType, targetId, details) {
  try {
    await prisma.activity_logs.create({
      data: {
        admin_id: adminId,
        action,
        target_type: targetType || null,
        target_id: targetId || null,
        details: details ? JSON.stringify(details) : null,
      },
    });
  } catch (err) {
    console.error('Activity log error:', err);
  }
}

module.exports = { logActivity };
