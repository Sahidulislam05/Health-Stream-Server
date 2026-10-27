import { z } from "zod";

// The link is shown to patients as a clickable link, so only https is accepted (never javascript: or data:).
const meetingLink = z
	.url({
		protocol: /^https$/,
		error: "Meeting link must be a valid https:// URL",
	})
	.trim()
	.max(500);

export const CreateScheduleValidationZodSchema = z.object({
	startDateTime: z.coerce.date("Invalid Start Date Time"),
	endDateTime: z.coerce.date("Invalid End Date Time"),
	meetingLink,
});

export const UpdateScheduleValidationZodSchema = z.object({
	startDateTime: z.coerce.date("Invalid Start Date Time").optional(),
	endDateTime: z.coerce.date("Invalid End Date Time").optional(),
	meetingLink: meetingLink.optional(),
});
