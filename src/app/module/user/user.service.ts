import httpStatus from "http-status";
import { Role, type UserStatus } from "../../../generated/prisma/enums";
import type { PatientWhereInput } from "../../../generated/prisma/models";
import type { IQuery } from "../../interfaces";
import { cloudinary, verifyUpload } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";
import { doctorTags, revalidateFrontend } from "../../lib/revalidate";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { getMeta, getPagination } from "../../utils/pagination";

const updateProfileImage = async (publicId: string, userId: string) => {
	const currentUser = await prisma.user.findUnique({
		where: { id: userId },
		select: { imagePublicId: true },
	});

	const image = await verifyUpload("profileImage", publicId);

	const updatedUser = await prisma.user.update({
		where: { id: userId },
		data: {
			imageUrl: image.url,
			imagePublicId: image.publicId,
		},
		omit: { password: true },
	});

	// Storage cleanup only: the new image is already saved, so a failure here must not fail the request.
	if (
		currentUser?.imagePublicId &&
		currentUser.imagePublicId !== image.publicId
	) {
		await cloudinary.uploader
			.destroy(currentUser.imagePublicId)
			.catch((error) =>
				console.error("Old profile image cleanup failed:", error),
			);
	}

	return updatedUser;
};

const getAllPatients = async (query: IQuery, viewer: RequestUser) => {
	const { limit, page, skip, sortBy, sortOrder } = getPagination(query, [
		"name",
	]);

	const where: PatientWhereInput = {
		isDeleted: false,
		user: { isDemo: viewer.isDemo },
	};

	if (query.searchTerm) {
		where.OR = [
			{ name: { contains: query.searchTerm, mode: "insensitive" } },
			{ email: { contains: query.searchTerm, mode: "insensitive" } },
			{ contactNumber: { contains: query.searchTerm, mode: "insensitive" } },
		];
	}

	if (query.status) {
		where.user = { isDemo: viewer.isDemo, status: query.status as UserStatus };
	}

	const [patients, total] = await Promise.all([
		prisma.patient.findMany({
			where,
			take: limit,
			skip,
			orderBy: { [sortBy]: sortOrder },
			include: {
				user: {
					select: {
						id: true,
						status: true,
						imageUrl: true,
						authProvider: true,
					},
				},
			},
		}),
		prisma.patient.count({ where }),
	]);

	return { data: patients, meta: getMeta(page, limit, total) };
};

// Admin acts on doctors and patients; only a Super Admin acts on admins and super admins.
const updateUserStatus = async (
	userId: string,
	status: UserStatus,
	actor: RequestUser,
) => {
	if (userId === actor.userId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"You cannot change your own status",
		);
	}

	const targetUser = await prisma.user.findUnique({ where: { id: userId } });

	if (!targetUser || targetUser.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "User Not Found");
	}

	const isTargetAdmin =
		targetUser.role === Role.ADMIN || targetUser.role === Role.SUPER_ADMIN;

	if (isTargetAdmin && actor.role !== Role.SUPER_ADMIN) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Only a Super Admin can block or unblock an Admin or Super Admin",
		);
	}

	const updatedUser = await prisma.user.update({
		where: { id: userId },
		data: { status },
		select: {
			id: true,
			name: true,
			email: true,
			role: true,
			status: true,
			doctor: { select: { id: true } },
		},
	});

	// A blocked doctor must disappear from cached public pages right away.
	if (updatedUser.doctor) revalidateFrontend(doctorTags(updatedUser.doctor.id));
	return updatedUser;
};

export const UserServices = {
	updateProfileImage,
	getAllPatients,
	updateUserStatus,
};
