import { z } from "zod";

export const CreateAdminValidationZodSchema = z.object({
	name: z
		.string()
		.trim()
		.min(3, "Name must be at least 3 characters long")
		.max(50),
	email: z.email("Invalid organization email").trim().toLowerCase(),
	personalEmail: z.email("Invalid personal email").trim().toLowerCase(),
	contactNumber: z.string().trim().max(20).optional(),
	role: z.enum(["ADMIN", "SUPER_ADMIN"], "Role must be ADMIN or SUPER_ADMIN"),
});
