require('dotenv').config();
const bcrypt = require('bcrypt');
const { createPrisma } = require('./server/lib/prisma');

const prisma = createPrisma();

async function main() {
  console.log('Seeding database...');

  // Create admin
  const adminHash = await bcrypt.hash('admin123', 10);
  await prisma.admins.upsert({
    where: { email: 'admin@iskolarly.com' },
    update: { password_hash: adminHash },
    create: {
      email: 'admin@iskolarly.com',
      password_hash: adminHash,
      role: 'admin',
      display_name: 'Admin User',
      is_active: true,
    },
  });
  console.log('  ✓ Admin created (admin@iskolarly.com / admin123)');

  // Create superadmin
  const superHash = await bcrypt.hash('superadmin123', 10);
  await prisma.admins.upsert({
    where: { email: 'superadmin@iskolarly.com' },
    update: { password_hash: superHash },
    create: {
      email: 'superadmin@iskolarly.com',
      password_hash: superHash,
      role: 'superadmin',
      display_name: 'Super Admin',
      is_active: true,
    },
  });
  console.log('  ✓ Superadmin created (superadmin@iskolarly.com / superadmin123)');

  // Create test student
  const studentHash = await bcrypt.hash('student123', 10);
  await prisma.students.upsert({
    where: { username: 'student' },
    update: {},
    create: {
      username: 'student',
      password_hash: studentHash,
      last_name: 'Doe',
      first_name: 'John',
      middle_name: 'M',
      date_of_birth: new Date('2000-01-15'),
      sex: 'Male',
      civil_status: 'Single',
      contact_number: '09123456789',
      email: 'john.doe@example.com',
      addr_street: '123 Main St',
      addr_barangay: 'Barangay 1',
      addr_municipality: 'Manila',
      addr_province: 'Metro Manila',
      addr_zip: '1000',
      student_id: '2020-00001',
      year_level: 3,
      college: 'College of Engineering',
      degree_program: 'BS Computer Science',
    },
  });
  console.log('  ✓ Student created (student / student123)');

  // Create scholarship programs
  const programs = [
    {
      name: 'Academic Excellence Scholarship',
      description: 'For students with outstanding academic performance. Minimum GPA of 1.75.',
      slots: 50,
      gpa_requirement: 1.75,
      application_start: new Date('2025-06-01'),
      application_end: new Date('2026-12-31'),
      academic_year: '2026-2027',
      semester: '1st',
      type: 'public',
    },
    {
      name: 'Financial Assistance Grant',
      description: 'Need-based scholarship for students from low-income families.',
      slots: 100,
      application_start: new Date('2025-06-01'),
      application_end: new Date('2026-12-31'),
      academic_year: '2026-2027',
      semester: '1st',
      type: 'public',
    },
    {
      name: 'Sports & Arts Scholarship',
      description: 'For students who excel in sports or the arts.',
      slots: 30,
      application_start: new Date('2025-06-01'),
      application_end: new Date('2026-12-31'),
      academic_year: '2026-2027',
      semester: '1st',
      type: 'public',
    },
    {
      name: 'CEU Merit Scholarship',
      description: 'Sponsored by collaborating private institutions for top-performing students.',
      slots: 20,
      gpa_requirement: 1.5,
      application_start: new Date('2025-06-01'),
      application_end: new Date('2026-06-30'),
      academic_year: '2026-2027',
      semester: '1st',
      type: 'private',
    },
    {
      name: 'Industry Partners Grant',
      description: 'Privately funded grant for students pursuing STEM degrees.',
      slots: 15,
      gpa_requirement: 2.0,
      application_start: new Date('2025-06-01'),
      application_end: new Date('2026-08-31'),
      academic_year: '2026-2027',
      semester: '1st',
      type: 'private',
    },
  ];

  for (const p of programs) {
    const existing = await prisma.scholarship_programs.findFirst({
      where: { name: p.name, academic_year: p.academic_year },
    });
    if (!existing) {
      await prisma.scholarship_programs.create({ data: p });
    }
  }
  console.log('  ✓ Scholarship programs created');

  // Create test application
  const student = await prisma.students.findUnique({ where: { username: 'student' } });
  const program = await prisma.scholarship_programs.findFirst();
  if (student && program) {
    const existingApp = await prisma.applications.findFirst({
      where: { student_id: student.id, program_id: program.id },
    });
    if (!existingApp) {
      await prisma.applications.create({
        data: {
          student_id: student.id,
          program_id: program.id,
          status: 'pending',
          academic_year: '2025-2026',
          semester: '1st',
        },
      });
      console.log('  ✓ Test application created');
    }
  }

  console.log('\nSeed complete!');
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = { seed: main };
