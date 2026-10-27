import bcrypt from "bcryptjs";
import crypto from "crypto";
import { addDays, differenceInMinutes } from "date-fns";
import type { Prisma } from "../../generated/prisma/client";
import {
	AppointmentStatus,
	DoctorVerificationStatus,
	PaymentStatus,
	Role,
	ScheduleStatus,
} from "../../generated/prisma/enums";
import config from "../config";
import { cloudinary } from "../lib/cloudinary";
import { prisma } from "../lib/prisma";
import { dhakaTimeOn } from "./dhakaTime";

const DEMO_FEE = 500;
const DEMO_MEETING_LINK = "https://meet.google.com/new";
const MINUTES_PER_SLOT = 20;

// Demo users can only sign in through POST /auth/demo-login; nobody knows this password.
const unusablePassword = () =>
	bcrypt.hash(
		crypto.randomBytes(32).toString("hex"),
		config.bcrypt_salt_rounds,
	);

const demoUser = (
	role: Role,
	email: string,
	name: string,
	password: string,
) => ({
	name,
	email,
	password,
	role,
	isDemo: true,
	emailVerified: true,
	needPasswordChange: false,
});

const HOUR = 60 * 60 * 1000;

// Today's session (Dhaka time) starts at 6 PM, or an hour after the next full hour if seeded later,
// so there is always time to book. It ends by 11 PM and lasts 3–4 hours (the schedule rules);
// only when that no longer fits today does it move to tomorrow 6–10 PM.
export const demoScheduleWindow = (now: Date) => {
	const nextFullHour = Math.ceil(now.getTime() / HOUR) * HOUR;
	const start = Math.max(dhakaTimeOn(now, 18).getTime(), nextFullHour + HOUR);
	const end = Math.min(start + 4 * HOUR, dhakaTimeOn(now, 23).getTime());

	if (end - start >= 3 * HOUR)
		return { start: new Date(start), end: new Date(end) };

	const tomorrow = dhakaTimeOn(addDays(now, 1), 18);
	return { start: tomorrow, end: new Date(tomorrow.getTime() + 4 * HOUR) };
};

// Demo accounts are deleted and recreated every night, so they must never share an email
// with a real account (the reset would otherwise fail, or worse, touch real data).
const assertDemoEmailsAreFree = async (tx: Prisma.TransactionClient) => {
	const clashes = await tx.user.findMany({
		where: { isDemo: false, email: { in: Object.values(config.demo_emails) } },
		select: { email: true },
	});
	if (!clashes.length) return;

	const used = new Set(clashes.map((user) => user.email));
	const slots = Object.entries(config.demo_emails)
		.filter(([, email]) => used.has(email))
		.map(([slot]) => `DEMO_${slot}_EMAIL`);
	throw new Error(
		`${slots.join(", ")} ${slots.length > 1 ? "belong" : "belongs"} to a real account. Use addresses no real user has.`,
	);
};

const createDemoData = async (tx: Prisma.TransactionClient) => {
	const emails = config.demo_emails;
	const password = await unusablePassword();

	await tx.user.create({
		data: {
			...demoUser(Role.ADMIN, emails.ADMIN, "Demo Admin", password),
			admin: {
				create: {
					name: "Demo Admin",
					email: emails.ADMIN,
					personalEmail: emails.ADMIN,
				},
			},
		},
	});

	const doctorUser = await tx.user.create({
		data: {
			...demoUser(Role.DOCTOR, emails.DOCTOR, "Ayesha Rahman", password),
			doctor: {
				create: {
					name: "Ayesha Rahman",
					email: emails.DOCTOR,
					specialization: "Medicine",
					licenseNumber: "DEMO-BMDC-0001",
					qualifications: "MBBS, FCPS (Medicine)",
					experienceYears: 8,
					consultationFee: DEMO_FEE,
					bio: "Demo doctor account. Bookings here use bKash sandbox.",
					verificationStatus: DoctorVerificationStatus.APPROVED,
				},
			},
		},
		include: { doctor: true },
	});
	const doctorId = doctorUser.doctor!.id;

	const patientUser = await tx.user.create({
		data: {
			...demoUser(Role.PATIENT, emails.PATIENT, "Demo Patient", password),
			patient: {
				create: {
					name: "Demo Patient",
					email: emails.PATIENT,
					contactNumber: "01700000000",
				},
			},
		},
		include: { patient: true },
	});

	// A pending application for the admin to review (approving is blocked in demo mode).
	await tx.user.create({
		data: {
			...demoUser(Role.DOCTOR, emails.APPLICANT, "Tanvir Hasan", password),
			password: null,
			doctor: {
				create: {
					name: "Tanvir Hasan",
					email: emails.APPLICANT,
					specialization: "Pediatrics",
					licenseNumber: "DEMO-BMDC-0002",
					qualifications: "MBBS, DCH",
					experienceYears: 4,
					consultationFee: 400,
				},
			},
		},
	});

	const now = new Date();
	const { start, end } = demoScheduleWindow(now);
	const totalSlots = differenceInMinutes(end, start) / MINUTES_PER_SLOT;

	await tx.schedule.create({
		data: {
			doctorId,
			startDateTime: start,
			endDateTime: end,
			meetingLink: DEMO_MEETING_LINK,
			totalSlots,
			availableSlots: totalSlots,
			status: ScheduleStatus.PUBLISHED,
		},
	});

	// Yesterday's finished visit, so the patient and doctor dashboards have history.
	const pastStart = dhakaTimeOn(addDays(now, -1), 18);
	const pastSchedule = await tx.schedule.create({
		data: {
			doctorId,
			startDateTime: pastStart,
			endDateTime: new Date(pastStart.getTime() + 4 * 60 * 60 * 1000),
			meetingLink: DEMO_MEETING_LINK,
			totalSlots,
			availableSlots: totalSlots - 1,
			status: ScheduleStatus.PUBLISHED,
		},
	});

	const appointmentId = crypto.randomUUID();
	await tx.apppointment.create({
		data: {
			id: appointmentId,
			status: AppointmentStatus.COMPLETED,
			serialNumber: 1,
			joiningTime: pastStart,
			patientId: patientUser.patient!.id,
			doctorId,
			scheduleId: pastSchedule.id,
			payment: {
				create: {
					merchantInvoiceNumber: appointmentId,
					amount: DEMO_FEE,
					status: PaymentStatus.PAID,
					bkashTrxId: "DEMO-SEED",
					payerReference: emails.PATIENT,
					paidAt: pastStart.toISOString(),
				},
			},
		},
	});
};

// Deletes every demo user; FK cascades remove their profiles, schedules, appointments and payments.
// Real rows are never matched: the only filter is isDemo = true.
const deleteDemoUsers = (tx: Prisma.TransactionClient) =>
	tx.user.deleteMany({ where: { isDemo: true } });

const demoPrescriptionFiles = () =>
	prisma.apppointment.findMany({
		where: {
			patient: { user: { isDemo: true } },
			prescriptionPublicId: { not: null },
		},
		select: { prescriptionPublicId: true },
	});

export const resetDemoData = async () => {
	const files = await demoPrescriptionFiles();

	await prisma.$transaction(
		async (tx) => {
			await assertDemoEmailsAreFree(tx);
			await deleteDemoUsers(tx);
			await createDemoData(tx);
		},
		{ timeout: 30000 },
	);

	const publicIds = files.map((file) => file.prescriptionPublicId as string);
	if (publicIds.length) {
		// Storage cleanup only; a failure here must not undo the reset.
		await cloudinary.api
			.delete_resources(publicIds, { resource_type: "raw" })
			.catch((error) =>
				console.error("Demo reset: Cloudinary cleanup failed", error),
			);
	}
};

// Local/first boot: create demo data once if demo mode is on and none exists yet.
export const ensureDemoData = async () => {
	if (!config.demo_mode) return;
	const existing = await prisma.user.count({ where: { isDemo: true } });
	if (existing === 0) await resetDemoData();
};
