const INACTIVITY_LIMIT = 30 * 60 * 1000;

const userActivity = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [sessionId, lastActive] of userActivity.entries()) {
    if (now - lastActive > INACTIVITY_LIMIT) {
      userActivity.delete(sessionId);
    }
  }
}, 60 * 1000);

function trackActivity(req, res, next) {
  if (req.user) {
    const key = req.user.id;
    userActivity.set(key, Date.now());
  }
  next();
}

function checkInactivity(req, res, next) {
  if (req.user) {
    const key = req.user.id;
    const lastActive = userActivity.get(key);
    if (lastActive && Date.now() - lastActive > INACTIVITY_LIMIT) {
      userActivity.delete(key);
      res.clearCookie('token');
      if (req.adminRole) {
        return res.redirect('/auth/admin');
      }
      return res.redirect('/auth/login');
    }
    userActivity.set(key, Date.now());
  }
  next();
}

module.exports = { trackActivity, checkInactivity, userActivity };
