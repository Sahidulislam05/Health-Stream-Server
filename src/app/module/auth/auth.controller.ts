import type { CookieOptions, Request, Response } from "express";
import httpStatus from "http-status";
import config from "../../config";
import { AppError } from "../../utils/AppError";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AuthService } from "./auth.service";

const isDevelopment = config.node_env === "development";

// The browser reaches the API through the frontend's /api rewrite, so cookies are first-party.
const cookieOptions: CookieOptions = {
	httpOnly: true,
	secure: !isDevelopment,
	sameSite: "lax",
};

const ONE_DAY = 1000 * 60 * 60 * 24;

const setAuthCookies = (
	res: Response,
	tokens: { accessToken: string; refreshToken: string },
) => {
	res.cookie("accessToken", tokens.accessToken, {
		...cookieOptions,
		maxAge: ONE_DAY,
	});
	res.cookie("refreshToken", tokens.refreshToken, {
		...cookieOptions,
		maxAge: ONE_DAY * 7,
	});
};

const registerPatient = catchAsync(async (req: Request, res: Response) => {
	await AuthService.registerPatient(req.body);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Verification OTP Sent",
		data: null,
	});
});

const verifyPatientEmail = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthService.verifyPatientEmail(req.body);
	setAuthCookies(res, result);

	sendResponse(res, {
		statusCode: httpStatus.CREATED,
		success: true,
		message: "Email Verified Successfully",
		data: result,
	});
});

const loginUser = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthService.loginUser(req.body);
	setAuthCookies(res, result);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User logged in successfully",
		data: result,
	});
});

const getMe = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthService.getMe(req.user!);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User profile fetched successfully",
		data: result,
	});
});

const refreshToken = catchAsync(async (req: Request, res: Response) => {
	if (!req.cookies.refreshToken) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Refresh token is missing");
	}

	const result = await AuthService.refreshToken(req.cookies.refreshToken);
	setAuthCookies(res, result);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "New tokens generated successfully",
		data: result,
	});
});

const googleLogin = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthService.googleLogin(req.body);
	setAuthCookies(res, result);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User logged in successfully",
		data: result,
	});
});

const forgotPassword = catchAsync(async (req: Request, res: Response) => {
	await AuthService.forgotPassword(req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "If an account exists for this email, an OTP has been sent",
		data: null,
	});
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
	await AuthService.resetPassword(req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Password Changed Successfully",
		data: null,
	});
});

const changePassword = catchAsync(async (req: Request, res: Response) => {
	await AuthService.changePassword(req.user!, req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Password Changed Successfully",
		data: null,
	});
});

const setPassword = catchAsync(async (req: Request, res: Response) => {
	await AuthService.setPassword(req.user!, req.body);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Password Set Successfully",
		data: null,
	});
});

const demoLogin = catchAsync(async (req: Request, res: Response) => {
	const result = await AuthService.demoLogin(req.body.role);
	setAuthCookies(res, result);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Signed in to the demo account",
		data: null,
	});
});

// Lets the frontend decide whether to show the demo login panel.
const demoStatus = catchAsync(async (_req: Request, res: Response) => {
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Demo status",
		data: { enabled: await AuthService.isDemoAvailable() },
	});
});

const logout = catchAsync(async (_req: Request, res: Response) => {
	res.clearCookie("accessToken", cookieOptions);
	res.clearCookie("refreshToken", cookieOptions);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User Logged Out Successfully",
		data: null,
	});
});

export const AuthController = {
	demoLogin,
	demoStatus,
	registerPatient,
	verifyPatientEmail,
	loginUser,
	getMe,
	refreshToken,
	googleLogin,
	forgotPassword,
	resetPassword,
	changePassword,
	setPassword,
	logout,
};
