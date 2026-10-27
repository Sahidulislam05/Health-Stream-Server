import type { Request, Response } from "express";
import httpStatus from "http-status";
import { cachePublicResponse } from "../../utils/cacheControl";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { DoctorServices } from "./doctor.service";

const applyAsDoctor = catchAsync(async (req: Request, res: Response) => {
	const result = await DoctorServices.applyAsDoctor(req.body);
	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Application Submitted. Please Verify Your Email.",
		data: result,
	});
});
const verifyDoctorEmail = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;

	const result = await DoctorServices.verifyDoctorEmail(payload);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctor Email Verified Successfully",
		data: result,
	});
});
const approveDoctor = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const user = req.user!;

	const result = await DoctorServices.approveDoctor(payload, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctor Application Reviewed Successfully",
		data: result,
	});
});
const getAllDoctors = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await DoctorServices.getAllDoctors(
		req.query,
		req.user!,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctors Retrieved Successfully",
		data: data,
		meta: meta,
	});
});
const updateDoctorProfile = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const user = req.user!;

	const result = await DoctorServices.updateDoctorProfile(payload, user);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctor Profile Updated Successfully",
		data: result,
	});
});

const getAvailableDoctorByTodaysSchedule = catchAsync(
	async (req: Request, res: Response) => {
		const { data, meta } =
			await DoctorServices.getAvailableDoctorByTodaysSchedule(
				req.query,
				Boolean(req.user?.isDemo),
			);
		cachePublicResponse(req, res, 15);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Today's Available Doctors Retrieved Successfully",
			data,
			meta,
		});
	},
);

const getAllDoctorsListPublic = catchAsync(
	async (req: Request, res: Response) => {
		const { data, meta } = await DoctorServices.getAllDoctorsListPublic(
			req.query,
			Boolean(req.user?.isDemo),
		);
		cachePublicResponse(req, res, 60);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Doctors Retrieved Successfully",
			data,
			meta,
		});
	},
);

const getSingleDoctorPublicProfile = catchAsync(
	async (req: Request, res: Response) => {
		const doctorId = req.params.doctorId as string;

		const result = await DoctorServices.getSingleDoctorPublicProfile(
			doctorId,
			Boolean(req.user?.isDemo),
		);
		cachePublicResponse(req, res, 60);
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Doctor Profile Retrieved Successfully",
			data: result,
		});
	},
);

export const DoctorController = {
	applyAsDoctor,
	verifyDoctorEmail,
	approveDoctor,
	getAllDoctors,
	updateDoctorProfile,
	getAvailableDoctorByTodaysSchedule,
	getAllDoctorsListPublic,
	getSingleDoctorPublicProfile,
};
