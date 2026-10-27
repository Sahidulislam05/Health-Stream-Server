import config from "../../config";
import { transporter } from "../../lib/nodemailer";
import type { IContactPayload } from "./contact.validation";

// Plain-text email to the support inbox; replying answers the sender directly.
const sendContactMessage = async (payload: IContactPayload) => {
	await transporter.sendMail({
		from: config.email_sender,
		to: config.email_sender,
		replyTo: payload.email,
		subject: `[Contact · ${payload.topic}] ${payload.name}`,
		text: `From: ${payload.name} <${payload.email}>\nTopic: ${payload.topic}\n\n${payload.message}`,
	});
};

export const ContactServices = { sendContactMessage };
