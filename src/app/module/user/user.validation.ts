import { z } from "zod";

export const UpdateUserStatusValidationZodSchema = z.object({
	status: z.enum(["ACTIVE", "BLOCKED"], "Status must be ACTIVE or BLOCKED"),
});

export const UpdateProfileImageValidationZodSchema = z.object({
	publicId: z.string().min(1, "Image is required").max(300),
});
