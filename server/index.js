require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const { createPrisma } = require('./lib/prisma');

const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const applicationRoutes = require('./routes/application');
const documentRoutes = require('./routes/documents');
const adminRoutes = require('./routes/admin');
const publicRoutes = require('./routes/public');
const healthRoutes = require('./routes/health');
const { startKeepAlive } = require('../keep-alive');

const app = express();
const prisma = createPrisma();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://code.iconify.design"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://code.iconify.design"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
    },
  },
}));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => res.render('index'));

app.use('/auth', authRoutes);
app.use('/portal', profileRoutes);
app.use('/portal', applicationRoutes);
app.use('/documents', documentRoutes);
app.use('/admin', adminRoutes);
app.use('/api/public', publicRoutes);
app.use('/api', healthRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Iskolarly running on port ${PORT}`);

  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_KEEPALIVE === 'true') {
    startKeepAlive(PORT);
  }
});

process.on('SIGINT', async () => { await prisma.$disconnect(); process.exit(0); });
process.on('SIGTERM', async () => { await prisma.$disconnect(); process.exit(0); });

module.exports = app;
