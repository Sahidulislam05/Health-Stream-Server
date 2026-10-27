import { z } from "zod";

// A doctor writes this after an appointment is COMPLETED (Project
// Requirements section 9): key findings, plus a list of prescribed medicines.
export const CreatePrescriptionValidationZodSchema = z.object({
	appointmentId: z.string().min(1, "Appointment Id Is Required"),

	findings: z
		.string()
		.trim()
		.min(5, "Findings Must Be At Least 5 Characters Long")
		.max(3000, "Findings Must Be At Most 3000 Characters Long"),

	medicines: z
		.array(
			z.object({
				name: z.string().trim().min(1, "Medicine Name Is Required").max(150),
				dosage: z.string().trim().min(1, "Dosage Is Required").max(150),
				duration: z.string().trim().min(1, "Duration Is Required").max(150),
				instructions: z.string().trim().max(500).optional(),
			}),
		)
		.min(1, "At Least One Medicine Is Required")
		.max(30, "At Most 30 Medicines"),
});
