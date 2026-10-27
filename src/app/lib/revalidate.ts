import config from "../config";

// Tells the frontend to refresh cached public pages after doctor data changes.
// Fire-and-forget: the change is already saved; pages also refresh on their own schedule.
export const revalidateFrontend = (tags: string[]) => {
	if (!config.revalidate_secret) return;

	fetch(`${config.frontend_url}/api/revalidate`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${config.revalidate_secret}`,
		},
		body: JSON.stringify({ tags }),
		signal: AbortSignal.timeout(5000),
	}).catch((error) =>
		console.error("Frontend revalidation failed:", error.message),
	);
};

export const doctorTags = (doctorId: string) => [
	"doctors",
	`doctor:${doctorId}`,
];
