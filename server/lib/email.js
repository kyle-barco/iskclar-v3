const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = 'Iskolarly <onboarding@resend.dev>';

async function sendResetEmail(email, resetUrl, displayName) {
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Reset Your Iskolarly Password',
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:40px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background:#520003;padding:32px;text-align:center;">
          <h1 style="color:#ffffff;margin:0;font-size:24px;">Iskolarly</h1>
          <p style="color:#e0b0b0;margin:4px 0 0;font-size:13px;">Password Reset</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#333;">Hi ${displayName},</p>
          <p style="margin:0 0 16px;font-size:14px;color:#555;line-height:1.6;">
            Someone requested a password reset for your Iskolarly account. 
            Click the button below to set a new password. This link expires in 1 hour.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
            <tr>
              <td align="center" style="background:#520003;border-radius:8px;padding:12px 32px;">
                <a href="${resetUrl}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;display:block;">Reset Password</a>
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0;font-size:13px;color:#888;">
            If you didn't request this, you can safely ignore this email.
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;" />
          <p style="margin:0;font-size:12px;color:#aaa;">
            Iskolarly &bull; Scholarship Management System
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
    `.trim(),
  });

  if (error) throw error;
  return data;
}

module.exports = { sendResetEmail };
