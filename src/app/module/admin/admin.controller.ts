import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AdminServices } from "./admin.service";

const createAdmin = catchAsync(async (req: Request, res: Response) => {
	const result = await AdminServices.createAdmin(req.body, req.user!);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Admin Created Successfully",
		data: result,
	});
});

const getAllAdmins = catchAsync(async (req: Request, res: Response) => {
	const { data, meta } = await AdminServices.getAllAdmins(req.query, req.user!);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Admins Retrieved Successfully",
		data,
		meta,
	});
});

export const AdminController = { createAdmin, getAllAdmins };
