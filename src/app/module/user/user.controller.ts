import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { UserServices } from "./user.service";

const updateProfileImage = catchAsync(async (req: Request, res: Response) => {
	const result = await UserServices.updateProfileImage(
		req.body.publicId,
		req.user!.userId,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Profile Image Updated Successfully",
		data: result,
	});
});

const getAllPatients = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await UserServices.getAllPatients(
		req.query,
		req.user!,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Patients Retrieved Successfully",
		data,
		meta,
	});
});

const updateUserStatus = catchAsync(async (req: Request, res: Response) => {
	const result = await UserServices.updateUserStatus(
		req.params.userId as string,
		req.body.status,
		req.user!,
	);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User Status Updated Successfully",
		data: result,
	});
});

export const UserController = {
	updateProfileImage,
	getAllPatients,
	updateUserStatus,
};
