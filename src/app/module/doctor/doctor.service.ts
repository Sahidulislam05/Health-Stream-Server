import bcrypt from "bcryptjs";
import crypto from "crypto";
import { addDays } from "date-fns";
import httpStatus from "http-status";
import {
	DoctorVerificationStatus,
	Role,
	ScheduleStatus,
	UserStatus,
} from "../../../generated/prisma/enums";
import type {
	DoctorWhereInput,
	ScheduleWhereInput,
} from "../../../generated/prisma/models";
import config from "../../config";
import type { IQuery } from "../../interfaces";
import { verifyUpload } from "../../lib/cloudinary";
import { sendTemplateEmail } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { getRedis } from "../../lib/redis";
import { doctorTags, revalidateFrontend } from "../../lib/revalidate";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { startOfDhakaDay } from "../../utils/dhakaTime";
import { getMeta, getPagination } from "../../utils/pagination";
import generateRandomPassword from "../../utils/randomPassword";
import type {
	IApplyAsDoctorPayload,
	IApproveDoctorPayload,
	IUpdateDoctorProfilePayload,
	IVerifyDoctorEmailPayload,
} from "./doctor.interface";

// Fields safe to expose on public (unauthenticated) doctor-discovery endpoints.
const publicDoctorSelect = {
	id: true,
	name: true,
	specialization: true,
	licenseNumber: true,
	qualifications: true,
	experienceYears: true,
	bio: true,
	consultationFee: true,
	createdAt: true,
	user: { select: { imageUrl: true } },
} as const;

const publicSortFields = ["name", "experienceYears", "consultationFee"];

const applyAsDoctor = async (payload: IApplyAsDoctorPayload) => {
	const redis = await getRedis();
	const isUserExists = await prisma.user.findUnique({
		where: { email: payload.user.email },
	});

	if (isUserExists) {
		throw new AppError(
			httpStatus.CONFLICT,
			"User Already Exists With This Email",
		);
	}

	// Files were uploaded by the browser; confirm each one on Cloudinary before trusting it.
	const [resume, ...additionalFiles] = await Promise.all([
		payload.resumePublicId
			? verifyUpload("doctorDocument", payload.resumePublicId)
			: null,
		...(payload.additionalFilePublicIds ?? []).map((id) =>
			verifyUpload("doctorDocument", id),
		),
	]);

	const doctorApplication = await prisma.user.create({
		data: {
			...payload.user,
			role: Role.DOCTOR,
			needPasswordChange: true,
			doctor: {
				create: {
					name: payload.user.name,
					email: payload.user.email,
					...payload.doctor,
					resume: resume?.url,
					resumePublicId: resume?.publicId,
					additionalFiles: additionalFiles.map((file) => ({
						url: file?.url,
						publicId: file?.publicId,
					})),
				},
			},
		},
		omit: { password: true },
		include: { doctor: true },
	});

	const expirationSeconds = 60 * 60;
	const otp = crypto.randomInt(100000, 1000000).toString();

	if (config.node_env === "development") {
		console.log(
			`[dev] Doctor application OTP for ${payload.user.email}: ${otp}`,
		);
	}

	try {
		await redis.set(`doctor-application-otp:${payload.user.email}`, otp, {
			expiration: { type: "EX", value: expirationSeconds },
		});

		await sendTemplateEmail(
			payload.user.email,
			"Doctor Application - Email Verification",
			"registration-user-otp",
			{
				name: payload.user.name,
				email: payload.user.email,
				otp,
				expirationMinutes: expirationSeconds / 60,
			},
		);
	} catch (error) {
		// Without the OTP the application can never be verified; remove it so the doctor can apply again now.
		await prisma.user.delete({ where: { id: doctorApplication.id } });
		throw error;
	}

	return doctorApplication;
};

const verifyDoctorEmail = async (payload: IVerifyDoctorEmailPayload) => {
	const redis = await getRedis();
	const { email, otp } = payload;

	const existingUser = await prisma.user.findUnique({
		where: { email, role: Role.DOCTOR },
	});

	if (!existingUser) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Doctor Application Not Found. Please Apply Again.",
		);
	}

	if (existingUser.emailVerified) {
		throw new AppError(httpStatus.CONFLICT, "Email Already Verified");
	}

	const otpKey = `doctor-application-otp:${email}`;
	const redisOtp = await redis.get(otpKey);

	if (!redisOtp || redisOtp !== otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
	}

	await redis.del(otpKey);

	return prisma.user.update({
		where: { id: existingUser.id },
		data: { emailVerified: true },
		omit: { password: true },
		include: { doctor: true },
	});
};

const approveDoctor = async (
	payload: IApproveDoctorPayload,
	reviewer: RequestUser,
) => {
	const { doctorId, verificationStatus, rejectionReason } = payload;

	const existingDoctor = await prisma.doctor.findUnique({
		where: { id: doctorId },
		include: { user: true },
	});

	if (!existingDoctor || existingDoctor.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Application Not Found");
	}

	if (!existingDoctor.user.emailVerified) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Doctor Has Not Verified Their Email Yet. Application Cannot Be Reviewed.",
		);
	}

	if (existingDoctor.verificationStatus !== DoctorVerificationStatus.PENDING) {
		throw new AppError(
			httpStatus.CONFLICT,
			`Doctor Application Has Already Been ${existingDoctor.verificationStatus.toLowerCase()}`,
		);
	}

	const isApproved = verificationStatus === DoctorVerificationStatus.APPROVED;

	if (!isApproved && !rejectionReason) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Rejection Reason Is Required When Rejecting A Doctor Application",
		);
	}

	const password = isApproved ? generateRandomPassword(12) : undefined;
	const hashedPassword = password
		? await bcrypt.hash(password, config.bcrypt_salt_rounds)
		: undefined;

	// The approval email carries the only copy of the password, so a failed send rolls back.
	const reviewed = await prisma.$transaction(
		async (tx) => {
			// Still PENDING inside the transaction: two admins reviewing at once cannot both succeed.
			const updatedDoctor = await tx.doctor.update({
				where: {
					id: doctorId,
					verificationStatus: DoctorVerificationStatus.PENDING,
				},
				data: {
					verificationStatus,
					rejectionReason: isApproved ? null : rejectionReason,
					reviewedBy: reviewer.userId,
					reviewedAt: new Date(),
					...(hashedPassword
						? {
								user: {
									update: {
										password: hashedPassword,
										needPasswordChange: true,
									},
								},
							}
						: {}),
				},
			});

			await sendTemplateEmail(
				updatedDoctor.email,
				isApproved
					? "Your Doctor Application Has Been Approved"
					: "Your Doctor Application Has Been Rejected",
				isApproved
					? "doctor-application-approved"
					: "doctor-application-rejected",
				{
					name: updatedDoctor.name,
					reason: updatedDoctor.rejectionReason,
					password,
				},
			);

			return updatedDoctor;
		},
		{ timeout: 20000 },
	);

	if (isApproved) revalidateFrontend(doctorTags(reviewed.id));
	return reviewed;
};

const getAllDoctors = async (query: IQuery, viewer: RequestUser) => {
	const { limit, page, skip, sortBy, sortOrder } = getPagination(query, [
		...publicSortFields,
		"verificationStatus",
	]);

	const andConditions: DoctorWhereInput[] = [
		{ isDeleted: false },
		{ user: { isDemo: viewer.isDemo } },
	];

	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{ name: { contains: query.searchTerm, mode: "insensitive" } },
				{ email: { contains: query.searchTerm, mode: "insensitive" } },
				{ specialization: { contains: query.searchTerm, mode: "insensitive" } },
				{ licenseNumber: { contains: query.searchTerm, mode: "insensitive" } },
			],
		});
	}

	if (query.specialization) {
		andConditions.push({
			specialization: { equals: query.specialization, mode: "insensitive" },
		});
	}

	if (query.email) {
		andConditions.push({
			email: { contains: query.email, mode: "insensitive" },
		});
	}

	if (query.licenseNumber) {
		andConditions.push({
			licenseNumber: { equals: query.licenseNumber, mode: "insensitive" },
		});
	}

	if (query.verificationStatus) {
		andConditions.push({
			verificationStatus: query.verificationStatus as DoctorVerificationStatus,
		});
	}

	const where = { AND: andConditions };

	const [allDoctors, total] = await Promise.all([
		prisma.doctor.findMany({
			where,
			take: limit,
			skip,
			orderBy: { [sortBy]: sortOrder },
			include: { user: { omit: { password: true } } },
		}),
		prisma.doctor.count({ where }),
	]);

	return { data: allDoctors, meta: getMeta(page, limit, total) };
};

const updateDoctorProfile = async (
	payload: IUpdateDoctorProfilePayload,
	user: RequestUser,
) => {
	const existingDoctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!existingDoctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}

	const updatedDoctor = await prisma.doctor.update({
		where: { id: existingDoctor.id },
		data: payload,
	});

	revalidateFrontend(doctorTags(updatedDoctor.id));
	return updatedDoctor;
};

// Doctors a visitor may see or book: approved, not blocked or deleted, and on the same side
// of the demo boundary as the viewer (anonymous viewers count as real).
export const publicDoctorWhere = (viewerIsDemo: boolean): DoctorWhereInput => ({
	isDeleted: false,
	verificationStatus: DoctorVerificationStatus.APPROVED,
	user: { status: UserStatus.ACTIVE, isDeleted: false, isDemo: viewerIsDemo },
});

// Patients only see today's published schedules that have not started yet and still have free slots.
export const bookableTodayScheduleWhere = (): ScheduleWhereInput => {
	const now = new Date();
	return {
		isDeleted: false,
		status: ScheduleStatus.PUBLISHED,
		availableSlots: { gt: 0 },
		startDateTime: { gt: now, lt: addDays(startOfDhakaDay(now), 1) },
	};
};

const getAvailableDoctorByTodaysSchedule = async (
	query: IQuery,
	viewerIsDemo: boolean,
) => {
	const { limit, page, skip, sortBy, sortOrder } = getPagination(
		query,
		publicSortFields,
	);
	const scheduleWhere = bookableTodayScheduleWhere();

	const andConditions: DoctorWhereInput[] = [
		publicDoctorWhere(viewerIsDemo),
		{ schedules: { some: scheduleWhere } },
	];

	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{ name: { contains: query.searchTerm, mode: "insensitive" } },
				{ specialization: { contains: query.searchTerm, mode: "insensitive" } },
			],
		});
	}

	if (query.specialization) {
		andConditions.push({
			specialization: { equals: query.specialization, mode: "insensitive" },
		});
	}

	const where = { AND: andConditions };

	const [availableDoctors, total] = await Promise.all([
		prisma.doctor.findMany({
			where,
			take: limit,
			skip,
			orderBy: { [sortBy]: sortOrder },
			select: {
				...publicDoctorSelect,
				schedules: {
					where: scheduleWhere,
					orderBy: { startDateTime: "asc" },
					select: {
						id: true,
						startDateTime: true,
						endDateTime: true,
						availableSlots: true,
						totalSlots: true,
					},
				},
			},
		}),
		prisma.doctor.count({ where }),
	]);

	return { data: availableDoctors, meta: getMeta(page, limit, total) };
};

const getAllDoctorsListPublic = async (
	query: IQuery,
	viewerIsDemo: boolean,
) => {
	const { limit, page, skip, sortBy, sortOrder } = getPagination(
		query,
		publicSortFields,
	);

	const andConditions: DoctorWhereInput[] = [publicDoctorWhere(viewerIsDemo)];

	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{ name: { contains: query.searchTerm, mode: "insensitive" } },
				{ specialization: { contains: query.searchTerm, mode: "insensitive" } },
				{ qualifications: { contains: query.searchTerm, mode: "insensitive" } },
			],
		});
	}

	if (query.specialization) {
		andConditions.push({
			specialization: { equals: query.specialization, mode: "insensitive" },
		});
	}

	const where = { AND: andConditions };

	const [allDoctors, total] = await Promise.all([
		prisma.doctor.findMany({
			where,
			take: limit,
			skip,
			orderBy: { [sortBy]: sortOrder },
			select: publicDoctorSelect,
		}),
		prisma.doctor.count({ where }),
	]);

	return { data: allDoctors, meta: getMeta(page, limit, total) };
};

const getSingleDoctorPublicProfile = async (
	doctorId: string,
	viewerIsDemo: boolean,
) => {
	const doctor = await prisma.doctor.findFirst({
		where: { id: doctorId, ...publicDoctorWhere(viewerIsDemo) },
		select: publicDoctorSelect,
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Not Found");
	}

	return doctor;
};

export const DoctorServices = {
	applyAsDoctor,
	verifyDoctorEmail,
	approveDoctor,
	getAllDoctors,
	updateDoctorProfile,
	getAvailableDoctorByTodaysSchedule,
	getAllDoctorsListPublic,
	getSingleDoctorPublicProfile,
};
