import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { ContactServices } from "./contact.service";

const sendContactMessage = catchAsync(async (req: Request, res: Response) => {
	await ContactServices.sendContactMessage(req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Message sent. We will reply by email.",
		data: null,
	});
});

export const ContactController = { sendContactMessage };
