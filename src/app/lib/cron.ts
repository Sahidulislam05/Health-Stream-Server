import cron from "node-cron";
import { DoctorVerificationStatus, Role } from "../../generated/prisma/enums";
import { prisma } from "./prisma";

// Doctor applications whose email was never verified within an hour are abandoned.
export const deleteExpiredDoctorApplications = async () => {
	const { count } = await prisma.user.deleteMany({
		where: {
			role: Role.DOCTOR,
			emailVerified: false,
			isDemo: false,
			createdAt: { lt: new Date(Date.now() - 60 * 60 * 1000) },
			doctor: { verificationStatus: DoctorVerificationStatus.PENDING },
		},
	});
	return count;
};

// Long-running server only (local dev). On Vercel the daily cron route does this instead.
export const startLocalCron = () => {
	cron.schedule("*/10 * * * *", async () => {
		try {
			const count = await deleteExpiredDoctorApplications();
			if (count > 0)
				console.log(`Cron: deleted ${count} expired doctor applications`);
		} catch (error) {
			console.error(
				"Cron: failed to delete expired doctor applications",
				error,
			);
		}
	});
};
