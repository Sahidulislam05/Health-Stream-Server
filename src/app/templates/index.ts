// Email templates (EJS syntax) kept in code so serverless bundles always include them.
export const emailTemplates = {
	"admin-welcome": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Welcome To HealthStream</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        background: #f7f7f7;
        color: #333;
      }
      .container {
        max-width: 500px;
        margin: 40px auto;
        background: #fff;
        padding: 30px;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      }
      .footer {
        margin-top: 30px;
        font-size: 12px;
        color: #888;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>Welcome, <%= name %>!</h2>
      <p>An <%= roleLabel %> account has been created for you on HealthStream System.</p>
      <p>Login email: <strong><%= email %></strong></p>
      <p>Temporary password: <strong><%= password %></strong></p>
      <p>You must change this password right after your first login.</p>
      <div class="footer">
        &copy; HealthStream System. All rights reserved.
      </div>
    </div>
  </body>
</html>
`,
	"doctor-application-approved": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Application Approved</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        background: #f7f7f7;
        color: #333;
      }
      .container {
        max-width: 500px;
        margin: 40px auto;
        background: #fff;
        padding: 30px;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      }
      .footer {
        margin-top: 30px;
        font-size: 12px;
        color: #888;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>Congratulations, Dr. <%= name %>!</h2>
      <p>
        Your application to join HealthStream System as a doctor has been
        reviewed and approved.
      </p>
      <p>
        You can now log in and start managing your schedule and consultations.
        Your temporary password is: <strong><%= password %></strong>. Please
        change it after your first login for security purposes.
      </p>
      <div class="footer">
        &copy; HealthStream System. All rights reserved.
      </div>
    </div>
  </body>
</html>
`,
	"doctor-application-rejected": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Application Update</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f7f7f7; color: #333; }
      .container { max-width: 500px; margin: 40px auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
      .reason { margin-top: 16px; padding: 12px 16px; background: #fdf2f2; border-left: 4px solid #e02424; color: #611a15; }
      .footer { margin-top: 30px; font-size: 12px; color: #888; }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>Application Update</h2>
      <p>Hello Dr. <%= name %>, thank you for applying to HealthStream System.</p>
      <p>After review, we are unable to approve your application at this time.</p>
      <% if (reason) { %>
        <div class="reason"><strong>Reason:</strong> <%= reason %></div>
      <% } %>
      <div class="footer">&copy; HealthStream System. All rights reserved.</div>
    </div>
  </body>
</html>
`,
	"forgot-password": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Forgot Password</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f7f7f7; color: #333; }
      .container { max-width: 500px; margin: 40px auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
      .otp { display: inline-block; padding: 12px 24px; background: #f0f4ff; color: #007bff; font-size: 28px; font-weight: bold; letter-spacing: 8px; border-radius: 4px; margin-top: 20px; }
      .footer { margin-top: 30px; font-size: 12px; color: #888; }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>Password Reset Request</h2>
      <p>Hello <%= name %>, we received a request to reset your password.</p>
      <p>Use the OTP below to reset your password:</p>
      <div class="otp"><%= otp %></div>
      <p>This OTP will expire in <%= expirationMinutes %> minutes. If you did not request a password reset, please ignore this email.</p>
      <div class="footer">&copy; HealthStream System. All rights reserved.</div>
    </div>
  </body>
</html>
`,
	"patient-welcome-email": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Welcome</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f7f7f7; color: #333; }
      .container { max-width: 500px; margin: 40px auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
      .footer { margin-top: 30px; font-size: 12px; color: #888; }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>Welcome to HealthStream System, <%= name %>!</h2>
      <p>Thanks for joining HealthStream System. Your account has been created successfully.</p>
      <p>You can now book appointments, consult with doctors, and manage your health records all in one place.</p>
      <div class="footer">&copy; HealthStream System. All rights reserved.</div>
    </div>
  </body>
</html>
`,
	"registration-user-otp": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Email Verification</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f7f7f7; color: #333; }
      .container { max-width: 500px; margin: 40px auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
      .otp { display: inline-block; padding: 12px 24px; background: #f0f4ff; color: #007bff; font-size: 28px; font-weight: bold; letter-spacing: 8px; border-radius: 4px; margin-top: 20px; }
      .footer { margin-top: 30px; font-size: 12px; color: #888; }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>Email Verification Request</h2>
      <p>Hello <%= name %>, we received a request to verify your email for <%= email %>.</p>
      <p>Use the OTP below to verify your email:</p>
      <div class="otp"><%= otp %></div>
      <p>This OTP will expire in <%= expirationMinutes %> minutes. If you did not request a email verification, please ignore this email.</p>
      <div class="footer">&copy; HealthStream System. All rights reserved.</div>
    </div>
  </body>
</html>
`,
	"reset-password-success": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Password Reset Successful</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f7f7f7; color: #333; }
      .container { max-width: 500px; margin: 40px auto; background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
      .icon { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 50%; background: #e6f7ec; color: #17a34a; font-size: 26px; font-weight: bold; }
      .footer { margin-top: 30px; font-size: 12px; color: #888; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="icon">&#10003;</div>
      <h2>Password Reset Successful</h2>
      <p>Hello <%= name %>, your password has been changed successfully.</p>
      <p>You can now log in to your HealthStream System account using your new password.</p>
      <p>If you did not make this change, please contact support immediately.</p>
      <div class="footer">&copy; HealthStream System. All rights reserved.</div>
    </div>
  </body>
</html>
`,
} as const;

export type EmailTemplate = keyof typeof emailTemplates;
