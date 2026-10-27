import { z } from "zod";

export const ContactValidationZodSchema = z.object({
	name: z.string().trim().min(2, "Name is required").max(80),
	email: z.email("Invalid email address").trim().toLowerCase(),
	topic: z.enum(["PATIENT", "DOCTOR", "PAYMENT", "OTHER"], "Choose a topic"),
	message: z
		.string()
		.trim()
		.min(10, "Message must be at least 10 characters")
		.max(2000, "Message must be at most 2000 characters"),
});

export type IContactPayload = z.infer<typeof ContactValidationZodSchema>;
