import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import { Role } from "../../../generated/prisma/enums";
import type { AdminWhereInput } from "../../../generated/prisma/models";
import config from "../../config";
import type { IQuery } from "../../interfaces";
import { sendTemplateEmail } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { getMeta, getPagination } from "../../utils/pagination";
import generateRandomPassword from "../../utils/randomPassword";
import type { ICreateAdminPayload } from "./admin.interface";

const createAdmin = async (
	payload: ICreateAdminPayload,
	creator: RequestUser,
) => {
	if (payload.role === Role.SUPER_ADMIN && creator.role !== Role.SUPER_ADMIN) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only a Super Admin can create a Super Admin",
		);
	}

	const isUserExists = await prisma.user.findUnique({
		where: { email: payload.email },
	});

	if (isUserExists) {
		throw new AppError(
			httpStatus.CONFLICT,
			"User Already Exists With This Email",
		);
	}

	const password = generateRandomPassword(12);
	const hashedPassword = await bcrypt.hash(password, config.bcrypt_salt_rounds);

	// The email is the only way the password reaches the new admin, so a failed send rolls back.
	return prisma.$transaction(
		async (tx) => {
			const admin = await tx.user.create({
				data: {
					name: payload.name,
					email: payload.email,
					password: hashedPassword,
					role: payload.role,
					emailVerified: true,
					needPasswordChange: true,
					admin: {
						create: {
							name: payload.name,
							email: payload.email,
							personalEmail: payload.personalEmail,
							contactNumber: payload.contactNumber,
						},
					},
				},
				omit: { password: true },
				include: { admin: true },
			});

			await sendTemplateEmail(
				payload.personalEmail,
				"Your HealthStream Account",
				"admin-welcome",
				{
					name: payload.name,
					email: payload.email,
					password,
					roleLabel:
						payload.role === Role.SUPER_ADMIN ? "Super Admin" : "Admin",
				},
			);

			return admin;
		},
		{ timeout: 20000 },
	);
};

const getAllAdmins = async (query: IQuery, viewer: RequestUser) => {
	const { limit, page, skip, sortBy, sortOrder } = getPagination(query, [
		"name",
	]);

	const where: AdminWhereInput = {
		isDeleted: false,
		user: { isDemo: viewer.isDemo },
	};

	if (query.searchTerm) {
		where.OR = [
			{ name: { contains: query.searchTerm, mode: "insensitive" } },
			{ email: { contains: query.searchTerm, mode: "insensitive" } },
		];
	}

	const [admins, total] = await Promise.all([
		prisma.admin.findMany({
			where,
			take: limit,
			skip,
			orderBy: { [sortBy]: sortOrder },
			include: {
				user: {
					select: { id: true, role: true, status: true, imageUrl: true },
				},
			},
		}),
		prisma.admin.count({ where }),
	]);

	return { data: admins, meta: getMeta(page, limit, total) };
};

export const AdminServices = { createAdmin, getAllAdmins };
