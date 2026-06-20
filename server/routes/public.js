const express = require('express');
const router = express.Router();
const { prisma } = require('../middleware/auth');

router.get('/programs', async (req, res) => {
  try {
    const programs = await prisma.scholarship_programs.findMany({
      where: { is_active: true },
      orderBy: { application_end: 'asc' },
    });
    res.json(programs);
  } catch (err) {
    console.error('Fetch programs error:', err);
    res.status(500).json({ error: 'Failed to fetch programs.' });
  }
});

router.get('/programs/:id', async (req, res) => {
  try {
    const program = await prisma.scholarship_programs.findFirst({
      where: { id: req.params.id, is_active: true },
    });
    if (!program) return res.status(404).json({ error: 'Program not found.' });
    res.json(program);
  } catch (err) {
    console.error('Fetch program error:', err);
    res.status(500).json({ error: 'Failed to fetch program.' });
  }
});

module.exports = router;
