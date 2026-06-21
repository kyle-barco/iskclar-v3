const Joi = require('joi');

// ── Age validation helper ──────────────────────────────────────────────────
function validateCollegeAge(dob) {
  const today    = new Date();
  const birthDate = new Date(dob);
  const age = today.getFullYear() - birthDate.getFullYear()
    - (today < new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate()) ? 1 : 0);
  return age >= 15 && age <= 40;  // college range: 15 (early enrollee) to 40
}

// ── Date helpers ──────────────────────────────────────────────────────────
function isValidDate(str) {
  const d = new Date(str);
  return !isNaN(d.getTime());
}

function isFutureDate(str) {
  return new Date(str) > new Date();
}

// ── Schemas ───────────────────────────────────────────────────────────────

const registerSchema = Joi.object({
  // Account
  username:        Joi.string().alphanum().min(4).max(20).required(),
  email:           Joi.string().email().max(254).required(),
  password:        Joi.string().min(8).max(128)
                     .pattern(/[A-Z]/, 'uppercase')
                     .pattern(/[0-9]/, 'number')
                     .pattern(/[^A-Za-z0-9]/, 'special character')
                     .required(),

  // Name
  last_name:       Joi.string().pattern(/^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s'\-]{0,59}$/).required().messages({'string.pattern.base': 'Last name must start with a letter and contain only letters, spaces, apostrophes, or hyphens'}),
  first_name:      Joi.string().pattern(/^[A-Za-zÀ-ÿ\s'\-]{1,60}$/).required(),
  middle_name:     Joi.string().pattern(/^[A-Za-zÀ-ÿ\s'\-]{1,60}$/).optional().allow(''),
  suffix:          Joi.string().valid('Jr.', 'Sr.', 'II', 'III', 'IV', 'V').optional().allow(''),

  // Date of birth — validated further below
  date_of_birth:   Joi.string().required(),

  sex:             Joi.string().valid('Male', 'Female', 'Prefer not to say').required(),
  civil_status:    Joi.string().valid('Single', 'Married', 'Widowed', 'Separated').default('Single'),
  nationality:     Joi.string().min(2).max(60).default('Filipino'),

  // Contact
  contact_number:  Joi.string().pattern(/^+63\d{9}$/).required()
                     .messages({ 'string.pattern.base': 'Must be a valid PH mobile number (+639XXXXXXXXX)' }),
  
  // Address
  addr_street:       Joi.string().min(2).max(100).required(),
  addr_barangay:     Joi.string().min(2).max(80).required(),
  addr_municipality: Joi.string().min(2).max(80).required(),
  addr_province:     Joi.string().min(2).max(80).required(),
  addr_zip:          Joi.string().pattern(/^\d{4}$/).required()
                       .messages({ 'string.pattern.base': 'ZIP code must be exactly 4 digits' }),

  // Academic (optional at registration)
  student_id:      Joi.string().pattern(/^[A-Za-z0-9\-]{4,20}$/).optional().allow(''),
  year_level:      Joi.number().integer().min(1).max(7).optional(),
  college:         Joi.string().max(100).optional().allow(''),
  degree_program:  Joi.string().max(150).optional().allow(''),
  gpa:             Joi.number().min(1.00).max(5.00).optional(),
  enrolled_units:  Joi.number().integer().min(1).max(30).optional(),

  // Family
  father_name:     Joi.string().max(60).optional().allow(''),
  father_occ:      Joi.string().max(60).optional().allow(''),
  mother_name:     Joi.string().max(60).optional().allow(''),
  mother_occ:      Joi.string().max(60).optional().allow(''),
});

const loginSchema = Joi.object({
  username:    Joi.string().max(254).required(),
  password:    Joi.string().max(128).required(),
  remember_me: Joi.boolean().optional()
});

const updateProfileSchema = Joi.object({
  contact_number:    Joi.string().pattern(/^+63\d{9}$/).optional(),
  addr_street:       Joi.string().min(2).max(100).optional(),
  addr_barangay:     Joi.string().min(2).max(80).optional(),
  addr_municipality: Joi.string().min(2).max(80).optional(),
  addr_province:     Joi.string().min(2).max(80).optional(),
  addr_zip:          Joi.string().pattern(/^\d{4}$/).optional(),
  gpa:               Joi.number().min(1.00).max(5.00).optional(),
  enrolled_units:    Joi.number().integer().min(1).max(30).optional(),
  year_level:        Joi.number().integer().min(1).max(7).optional(),
});

const scholarshipProgramSchema = Joi.object({
  name:              Joi.string().min(3).max(200).required(),
  description:       Joi.string().max(2000).optional().allow(''),
  slots:             Joi.number().integer().min(1).optional(),
  gpa_requirement:   Joi.number().min(1.00).max(5.00).optional(),
  application_start: Joi.string().required(),
  application_end:   Joi.string().required(),
  academic_year:     Joi.string().pattern(/^\d{4}-\d{4}$/).optional(),
  semester:          Joi.string().valid('1st', '2nd', 'Summer').optional(),
});

// ── Validation middleware factory ─────────────────────────────────────────
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(d => d.message)
      });
    }
    req.validatedBody = value;
    next();
  };
}

module.exports = {
  validate,
  validateCollegeAge,
  isValidDate,
  isFutureDate,
  schemas: { registerSchema, loginSchema, updateProfileSchema, scholarshipProgramSchema }
};