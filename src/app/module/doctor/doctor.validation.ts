import { z } from "zod";

export const ApplyAsDoctorValidationZodSchema = z.object({
	user: z.object({
		name: z
			.string()
			.trim()
			.min(2, "Name must be at least 2 characters long")
			.max(80),

		email: z.email("Invalid email address").trim().toLowerCase(),
	}),

	doctor: z.object({
		address: z
			.string()
			.trim()
			.min(5, "Address must be at least 5 characters long")
			.max(300)
			.optional(),

		specialization: z
			.string()
			.trim()
			.min(2, "Specialization is required")
			.max(100),

		licenseNumber: z
			.string()
			.trim()
			.min(3, "License number is required")
			.max(50),

		qualifications: z
			.string()
			.trim()
			.min(2, "Qualifications are required")
			.max(300),

		experienceYears: z
			.number()
			.int("Experience years must be an integer")
			.min(0, "Experience years cannot be negative")
			.max(70, "Experience years looks wrong"),

		bio: z
			.string()
			.trim()
			.max(1000, "Bio cannot exceed 1000 characters")
			.optional(),

		consultationFee: z
			.number()
			.min(0, "Consultation fee cannot be negative")
			.max(100000, "Consultation fee is too high")
			.optional(),
		contactNumber: z
			.string()
			.trim()
			.min(5, "Contact number is invalid")
			.max(20, "Contact number is invalid")
			.optional(),
	}),

	resumePublicId: z.string().min(1).max(300).optional(),
	additionalFilePublicIds: z
		.array(z.string().min(1).max(300))
		.max(10, "Up to 10 certificates")
		.optional(),
});

export const UpdateDoctorProfileValidationZodSchema = z.object({
	address: z
		.string()
		.trim()
		.min(5, "Address must be at least 5 characters long")
		.max(300)
		.optional(),

	bio: z
		.string()
		.trim()
		.max(1000, "Bio cannot exceed 1000 characters")
		.optional(),

	consultationFee: z
		.number()
		.min(0, "Consultation fee cannot be negative")
		.max(100000, "Consultation fee is too high")
		.optional(),

	contactNumber: z
		.string()
		.trim()
		.min(5, "Contact number is invalid")
		.max(20, "Contact number is invalid")
		.optional(),
});

export const VerifyDoctorEmailValidationZodSchema = z.object({
	email: z.email("Invalid email address").trim().toLowerCase(),
	otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
});

export const ApproveDoctorValidationZodSchema = z.object({
	doctorId: z.string().min(1, "Doctor Id Is Required"),
	verificationStatus: z.enum(
		["APPROVED", "REJECTED"],
		"Verification Status Must Be APPROVED Or REJECTED",
	),
	rejectionReason: z.string().trim().max(500).optional(),
});
