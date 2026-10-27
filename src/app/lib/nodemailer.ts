import ejs from "ejs";
import nodemailer from "nodemailer";
import config from "../config";
import { type EmailTemplate, emailTemplates } from "../templates";

export const transporter = nodemailer.createTransport({
	service: "gmail",
	auth: {
		user: config.smtp_user,
		pass: config.smtp_password,
	},
});

export const sendTemplateEmail = async (
	to: string,
	subject: string,
	template: EmailTemplate,
	data: Record<string, unknown>,
) => {
	const html = ejs.render(emailTemplates[template], data);

	await transporter.sendMail({ from: config.email_sender, to, subject, html });
};

// For emails that must not fail the request after the data is already saved.
export const sendEmailSafely = (send: Promise<unknown>) =>
	send.catch((error) => console.error("Email sending failed:", error));
