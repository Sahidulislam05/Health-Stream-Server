import crypto from "crypto";
import { type Request, type Response, Router } from "express";
import httpStatus from "http-status";
import config from "../../config";
import { deleteExpiredDoctorApplications } from "../../lib/cron";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { resetDemoData } from "../../utils/demo";
import { sendResponse } from "../../utils/sendResponse";

const router = Router();

const isAuthorized = (header: string | undefined) => {
	if (!config.cron_secret || !header) return false;
	const expected = Buffer.from(`Bearer ${config.cron_secret}`);
	const received = Buffer.from(header);
	return (
		expected.length === received.length &&
		crypto.timingSafeEqual(expected, received)
	);
};

// Called once a day by Vercel Cron (vercel.json) with "Authorization: Bearer <CRON_SECRET>".
router.get(
	"/daily",
	catchAsync(async (req: Request, res: Response) => {
		if (!isAuthorized(req.headers.authorization)) {
			throw new AppError(httpStatus.UNAUTHORIZED, "Unauthorized");
		}

		const deletedApplications = await deleteExpiredDoctorApplications();
		if (config.demo_mode) await resetDemoData();

		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Daily jobs completed",
			data: { deletedApplications, demoReset: config.demo_mode },
		});
	}),
);

export const CronRoutes = router;
