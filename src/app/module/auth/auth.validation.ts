import z from "zod";

const strongPassword = z
	.string()
	.min(8, "Password Must Minimum 8 Characters Long.")
	.max(64, "Password Must Be At Most 64 Characters Long.")
	.regex(/[a-z]/, "Password must contain atleast 1 Lowercase Letter")
	.regex(/[A-Z]/, "Password must contain atleast 1 Uppercase Letter")
	.regex(/[0-9]/, "Password must contain atleast 1 Number")
	.regex(/[^A-Za-z0-9]/, "Password must contain atleast 1 Special Character");

const email = z.email("Invalid email address").trim().toLowerCase();
const otp = z.string().regex(/^\d{6}$/, "OTP must be 6 digits");

const PatientRegistrationZodSchema = z.object({
	name: z
		.string("Name is required")
		.trim()
		.min(3, "Name must atleast 3 characters long")
		.max(50, "Name must be at most 50 characters long"),
	email,
	password: strongPassword,
	patient: z
		.object({
			contactNumber: z.string().trim().max(20).optional(),
		})
		.optional(),
});

const PatientEmailVerifyZodSchema = z.object({ email, otp });

// Login only checks presence; strength rules belong to the moment a password is set.
const LoginZodSchema = z.object({
	email,
	password: z.string().min(1, "Password is required").max(64),
});

const GoogleLoginZodSchema = z.object({
	idToken: z.string().min(1, "Google id token is required"),
});

const ForgotPasswordZodSchema = z.object({ email });

const ResetPasswordZodSchema = z.object({
	email,
	newPassword: strongPassword,
	otp,
});

const ChangePasswordZodSchema = z.object({
	currentPassword: z.string().min(1, "Current password is required").max(64),
	newPassword: strongPassword,
});

const SetPasswordZodSchema = z.object({ password: strongPassword });

const DemoLoginZodSchema = z.object({
	role: z.enum(
		["PATIENT", "DOCTOR", "ADMIN"],
		"Role must be PATIENT, DOCTOR or ADMIN",
	),
});

export const UserValidation = {
	PatientRegistrationZodSchema,
	PatientEmailVerifyZodSchema,
	LoginZodSchema,
	GoogleLoginZodSchema,
	ForgotPasswordZodSchema,
	ResetPasswordZodSchema,
	ChangePasswordZodSchema,
	SetPasswordZodSchema,
	DemoLoginZodSchema,
};
