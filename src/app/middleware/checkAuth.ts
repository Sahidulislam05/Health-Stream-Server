import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import type { JwtPayload } from "jsonwebtoken";
import { type Role, UserStatus } from "../../generated/prisma/enums";
import config from "../config";
import { prisma } from "../lib/prisma";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { jwtUtils } from "../utils/jwt";

export interface RequestUser {
	email: string;
	name: string;
	userId: string;
	role: Role;
	isDemo: boolean;
}

declare global {
	namespace Express {
		interface Request {
			user?: RequestUser;
		}
	}
}

// The only routes a user with a generated password may call before changing it.
const passwordChangeAllowedPaths = [
	"/api/v1/auth/me",
	"/api/v1/auth/change-password",
	"/api/v1/auth/logout",
];

// Shared demo accounts may not lock themselves out, deface public pages or act on real people (FRONTEND_PLAN §2.2).
const demoBlockedRoutes = new Set([
	"POST /api/v1/auth/change-password",
	"POST /api/v1/auth/set-password",
	"PATCH /api/v1/user/profile-image",
	"GET /api/v1/upload/profile-image-signature",
	"PATCH /api/v1/user/:userId/status",
	"POST /api/v1/admin/create-admin",
	"POST /api/v1/doctor/approve-doctor",
	"PATCH /api/v1/doctor/update-my-profile",
	"DELETE /api/v1/schedule/:scheduleId",
]);

const readToken = (req: Request): string | undefined => {
	const authHeader = req.headers.authorization;
	return (
		req.cookies.accessToken ||
		(authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader)
	);
};

const findActiveUser = async (token: string) => {
	const verifiedToken = jwtUtils.verifyToken(token, config.jwt_access_secret);
	if (!verifiedToken.success)
		return { error: "Invalid or expired token" } as const;

	const { userId } = verifiedToken.data as JwtPayload;
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			email: true,
			role: true,
			status: true,
			isDeleted: true,
			isDemo: true,
			needPasswordChange: true,
		},
	});

	if (!user) return { error: "User not found. Please log in again." } as const;
	return { user } as const;
};

const toRequestUser = (user: {
	id: string;
	name: string;
	email: string;
	role: Role;
	isDemo: boolean;
}): RequestUser => ({
	email: user.email,
	name: user.name,
	userId: user.id,
	role: user.role,
	isDemo: user.isDemo,
});

export const auth = (...requiredRoles: Role[]) => {
	return catchAsync(
		async (req: Request, _res: Response, next: NextFunction) => {
			const token = readToken(req);

			if (!token) {
				throw new AppError(
					httpStatus.UNAUTHORIZED,
					"You are not logged in. Please log in to access this resource.",
				);
			}

			const result = await findActiveUser(token);

			if (!result.user) {
				throw new AppError(httpStatus.UNAUTHORIZED, result.error);
			}

			const { user } = result;

			if (user.status !== UserStatus.ACTIVE || user.isDeleted) {
				throw new AppError(
					httpStatus.FORBIDDEN,
					"Your account is inactive. Please contact support.",
				);
			}

			// Role comes from the database, so a role change takes effect immediately.
			if (requiredRoles.length && !requiredRoles.includes(user.role)) {
				throw new AppError(
					httpStatus.FORBIDDEN,
					"Forbidden. You don't have permission to access this resource.",
				);
			}

			if (
				user.needPasswordChange &&
				!passwordChangeAllowedPaths.includes(req.originalUrl.split("?")[0])
			) {
				throw new AppError(
					httpStatus.FORBIDDEN,
					"Please change your password before continuing.",
				);
			}

			if (
				user.isDemo &&
				demoBlockedRoutes.has(`${req.method} ${req.baseUrl}${req.route?.path}`)
			) {
				throw new AppError(httpStatus.FORBIDDEN, "Disabled in demo mode");
			}

			req.user = toRequestUser(user);

			next();
		},
	);
};

// Public routes: attach the caller when a valid session exists, never reject.
// Used so demo users see demo doctors and everyone else sees real ones.
export const optionalAuth = catchAsync(
	async (req: Request, _res: Response, next: NextFunction) => {
		const token = readToken(req);
		if (token) {
			const result = await findActiveUser(token);
			if (
				result.user &&
				result.user.status === UserStatus.ACTIVE &&
				!result.user.isDeleted
			) {
				req.user = toRequestUser(result.user);
			}
		}
		next();
	},
);
