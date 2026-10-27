import { addDays, differenceInMinutes, isBefore } from "date-fns";
import httpStatus from "http-status";
import { ScheduleStatus } from "../../../generated/prisma/enums";
import type { ScheduleWhereInput } from "../../../generated/prisma/models";
import type { IQuery } from "../../interfaces";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { isSameDhakaDay, startOfDhakaDay } from "../../utils/dhakaTime";
import { getMeta, getPagination } from "../../utils/pagination";
import {
	bookableTodayScheduleWhere,
	publicDoctorWhere,
} from "../doctor/doctor.service";
import type {
	ICreateSchedulePayload,
	IUpdateSchedulePayload,
} from "./schedule.interface";

const MINUTES_PER_SLOT = 20;
const MIN_SCHEDULE_MINUTES = 3 * 60;
const MAX_SCHEDULE_MINUTES = 8 * 60;

const getDoctorByUserId = async (userId: string) => {
	const doctor = await prisma.doctor.findUnique({ where: { userId } });

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}

	return doctor;
};

// Validates the time range rules and returns how many 20-minute slots fit in it.
export const getTotalSlots = (startDateTime: Date, endDateTime: Date) => {
	if (!isSameDhakaDay(startDateTime, endDateTime)) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Start And End Time Must Be On The Same Calendar Day",
		);
	}

	if (!isBefore(startDateTime, endDateTime)) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Start Time Must Be Before End Time",
		);
	}

	const durationInMinutes = differenceInMinutes(endDateTime, startDateTime);

	if (
		durationInMinutes < MIN_SCHEDULE_MINUTES ||
		durationInMinutes > MAX_SCHEDULE_MINUTES
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Schedule Must Be Between 3 And 8 Hours Long",
		);
	}

	return Math.floor(durationInMinutes / MINUTES_PER_SLOT);
};

// A schedule that has already started can never be booked, so it may not be created or moved there.
const assertStartsInFuture = (startDateTime: Date) => {
	if (!isBefore(new Date(), startDateTime)) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Schedule Must Start In The Future",
		);
	}
};

const assertNoOtherScheduleOnDate = async (
	doctorId: string,
	date: Date,
	excludeScheduleId?: string,
) => {
	const startOfTheDay = startOfDhakaDay(date);

	const existingSchedule = await prisma.schedule.findFirst({
		where: {
			doctorId,
			isDeleted: false,
			id: excludeScheduleId ? { not: excludeScheduleId } : undefined,
			startDateTime: { gte: startOfTheDay, lt: addDays(startOfTheDay, 1) },
		},
		select: { id: true },
	});

	if (existingSchedule) {
		throw new AppError(
			httpStatus.CONFLICT,
			"You Already Have A Schedule For This Date",
		);
	}
};

const createSchedule = async (
	payload: ICreateSchedulePayload,
	user: RequestUser,
) => {
	const doctor = await getDoctorByUserId(user.userId);

	const totalSlots = getTotalSlots(payload.startDateTime, payload.endDateTime);
	assertStartsInFuture(payload.startDateTime);
	await assertNoOtherScheduleOnDate(doctor.id, payload.startDateTime);

	return prisma.schedule.create({
		data: {
			startDateTime: payload.startDateTime,
			endDateTime: payload.endDateTime,
			meetingLink: payload.meetingLink,
			totalSlots,
			availableSlots: totalSlots,
			doctorId: doctor.id,
		},
	});
};

const getMySchedules = async (query: IQuery, user: RequestUser) => {
	const { limit, page, skip, sortBy, sortOrder } = getPagination(query, [
		"startDateTime",
	]);
	const doctor = await getDoctorByUserId(user.userId);

	const where: ScheduleWhereInput = { doctorId: doctor.id, isDeleted: false };

	if (query.status) {
		where.status = query.status as ScheduleStatus;
	}

	const [schedules, total] = await Promise.all([
		prisma.schedule.findMany({
			where,
			take: limit,
			skip,
			orderBy: { [sortBy]: sortOrder },
			include: {
				appointments: {
					include: {
						patient: {
							select: {
								id: true,
								name: true,
								email: true,
								contactNumber: true,
							},
						},
					},
				},
			},
		}),
		prisma.schedule.count({ where }),
	]);

	return { data: schedules, meta: getMeta(page, limit, total) };
};

const getAllSchedules = async (query: IQuery, viewer: RequestUser) => {
	const { limit, page, skip, sortBy, sortOrder } = getPagination(query, [
		"startDateTime",
	]);

	const andConditions: ScheduleWhereInput[] = [
		{ isDeleted: false },
		{ doctor: { user: { isDemo: viewer.isDemo } } },
	];

	if (query.doctorId) {
		andConditions.push({ doctorId: query.doctorId });
	}

	if (query.email) {
		andConditions.push({ doctor: { email: query.email } });
	}

	if (query.status) {
		andConditions.push({ status: query.status as ScheduleStatus });
	}

	if (query.searchTerm) {
		andConditions.push({
			doctor: {
				OR: [
					{ name: { contains: query.searchTerm, mode: "insensitive" } },
					{ email: { contains: query.searchTerm, mode: "insensitive" } },
					{
						specialization: { contains: query.searchTerm, mode: "insensitive" },
					},
				],
			},
		});
	}

	const where = { AND: andConditions };

	const [schedules, total] = await Promise.all([
		prisma.schedule.findMany({
			where,
			take: limit,
			skip,
			orderBy: { [sortBy]: sortOrder },
			include: {
				doctor: {
					select: { id: true, name: true, email: true, specialization: true },
				},
				_count: { select: { appointments: true } },
			},
		}),
		prisma.schedule.count({ where }),
	]);

	return { data: schedules, meta: getMeta(page, limit, total) };
};

const getScheduleById = async (scheduleId: string, user: RequestUser) => {
	const schedule = await prisma.schedule.findFirst({
		where: { id: scheduleId, doctor: { user: { isDemo: user.isDemo } } },
		include: {
			doctor: {
				select: {
					id: true,
					name: true,
					email: true,
					specialization: true,
					userId: true,
				},
			},
			appointments: {
				include: {
					patient: {
						select: { id: true, name: true, email: true, contactNumber: true },
					},
				},
			},
		},
	});

	if (!schedule || schedule.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
	}

	if (user.role === "DOCTOR" && schedule.doctor.userId !== user.userId) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You Are Not Allowed To View This Schedule",
		);
	}

	return schedule;
};

// Date locks on publish; time range locks on first booking; meet link is always editable.
const updateSchedule = async (
	scheduleId: string,
	payload: IUpdateSchedulePayload,
	user: RequestUser,
) => {
	const doctor = await getDoctorByUserId(user.userId);

	const schedule = await prisma.schedule.findUnique({
		where: { id: scheduleId, doctorId: doctor.id },
	});

	if (!schedule || schedule.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
	}

	const startDateTime = payload.startDateTime ?? schedule.startDateTime;
	const endDateTime = payload.endDateTime ?? schedule.endDateTime;

	const isTimeChanged =
		startDateTime.getTime() !== schedule.startDateTime.getTime() ||
		endDateTime.getTime() !== schedule.endDateTime.getTime();
	const isDateChanged = !isSameDhakaDay(startDateTime, schedule.startDateTime);

	if (isDateChanged && schedule.status === ScheduleStatus.PUBLISHED) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Schedule Date Cannot Change After Publishing",
		);
	}

	if (isTimeChanged && schedule.availableSlots !== schedule.totalSlots) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Schedule Time Cannot Change After An Appointment Is Booked",
		);
	}

	let slots = {};

	if (isTimeChanged) {
		const totalSlots = getTotalSlots(startDateTime, endDateTime);
		assertStartsInFuture(startDateTime);
		if (isDateChanged) {
			await assertNoOtherScheduleOnDate(doctor.id, startDateTime, schedule.id);
		}
		slots = { totalSlots, availableSlots: totalSlots };
	}

	return prisma.schedule.update({
		where: { id: schedule.id },
		data: {
			startDateTime,
			endDateTime,
			meetingLink: payload.meetingLink ?? schedule.meetingLink,
			...slots,
		},
	});
};

const publishSchedule = async (scheduleId: string, user: RequestUser) => {
	const doctor = await getDoctorByUserId(user.userId);

	const schedule = await prisma.schedule.findUnique({
		where: { id: scheduleId, doctorId: doctor.id },
	});

	if (!schedule || schedule.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
	}

	if (schedule.status === ScheduleStatus.PUBLISHED) {
		throw new AppError(httpStatus.CONFLICT, "Schedule Is Already Published");
	}

	return prisma.schedule.update({
		where: { id: schedule.id },
		data: { status: ScheduleStatus.PUBLISHED },
	});
};

const deleteSchedule = async (scheduleId: string, user: RequestUser) => {
	const doctor = await getDoctorByUserId(user.userId);

	const schedule = await prisma.schedule.findUnique({
		where: { id: scheduleId, doctorId: doctor.id },
	});

	if (!schedule || schedule.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
	}

	if (schedule.totalSlots !== schedule.availableSlots) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Schedule With Booked Appointments Cannot Be Deleted",
		);
	}

	return prisma.schedule.update({
		where: { id: schedule.id },
		data: { isDeleted: true, deletedAt: new Date() },
	});
};

const getTodaysSchedules = async (query: IQuery, viewerIsDemo: boolean) => {
	if (!query.doctorId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Doctor Id Must Be Provided In Query",
		);
	}

	const doctor = await prisma.doctor.findFirst({
		where: { id: query.doctorId, ...publicDoctorWhere(viewerIsDemo) },
		select: { id: true },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}

	const { limit, page, skip } = getPagination(query);
	const where: ScheduleWhereInput = {
		...bookableTodayScheduleWhere(),
		doctorId: doctor.id,
	};

	const [schedules, total] = await Promise.all([
		prisma.schedule.findMany({
			where,
			take: limit,
			skip,
			orderBy: { startDateTime: "asc" },
			select: {
				id: true,
				startDateTime: true,
				endDateTime: true,
				totalSlots: true,
				availableSlots: true,
				status: true,
				doctorId: true,
			},
		}),
		prisma.schedule.count({ where }),
	]);

	return { data: schedules, meta: getMeta(page, limit, total) };
};

export const ScheduleServices = {
	createSchedule,
	getMySchedules,
	getAllSchedules,
	getScheduleById,
	updateSchedule,
	publishSchedule,
	deleteSchedule,
	getTodaysSchedules,
};
