import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { Prisma } from "../../generated/prisma/client";
import config from "../config";
import { AppError } from "../utils/AppError";

export const globalErrorHandler = (
	err: any,
	_req: Request,
	res: Response,
	_next: NextFunction,
) => {
	let statusCode: number = httpStatus.INTERNAL_SERVER_ERROR;
	let message = "Internal Server Error";

	if (err instanceof AppError) {
		statusCode = err.statusCode;
		message = err.message;
	} else if (err instanceof Prisma.PrismaClientValidationError) {
		statusCode = httpStatus.BAD_REQUEST;
		message = "You have provided incorrect field type or missing fields";
	} else if (err instanceof Prisma.PrismaClientKnownRequestError) {
		if (err.code === "P2002") {
			statusCode = httpStatus.CONFLICT;
			message = "This record already exists";
		} else if (err.code === "P2003") {
			statusCode = httpStatus.BAD_REQUEST;
			message = "Related record does not exist";
		} else if (err.code === "P2025") {
			statusCode = httpStatus.NOT_FOUND;
			message = "Record not found";
		}
	} else if (err?.type === "entity.too.large") {
		statusCode = httpStatus.REQUEST_ENTITY_TOO_LARGE;
		message = "Request body is too large";
	} else if (err?.type === "entity.parse.failed") {
		statusCode = httpStatus.BAD_REQUEST;
		message = "Invalid JSON body";
	}

	const isDevelopment = config.node_env === "development";

	// Unknown errors are logged but never leaked to clients outside development.
	if (statusCode >= 500) {
		console.error("Unhandled error:", err);
		if (isDevelopment) message = err?.message || message;
	}

	res.status(statusCode).json({
		success: false,
		statusCode,
		message,
		stack: isDevelopment && statusCode >= 500 ? err?.stack : undefined,
	});
};
