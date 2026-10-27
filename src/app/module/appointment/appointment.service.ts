import crypto from "crypto";
import { addMinutes, isBefore, subHours } from "date-fns";
import httpStatus from "http-status";
import {
	AppointmentStatus,
	PaymentStatus,
	Role,
	ScheduleStatus,
} from "../../../generated/prisma/enums";
import type {
	ApppointmentInclude,
	ApppointmentWhereInput,
} from "../../../generated/prisma/models";
import config from "../../config";
import type { IQuery } from "../../interfaces";
import { bkashRequest, createBkashPayment } from "../../lib/bkash";
import { sendEmailSafely, transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import {
	formatDhakaDate,
	formatDhakaTime,
	isSameDhakaDay,
} from "../../utils/dhakaTime";
import { getMeta, getPagination } from "../../utils/pagination";
import { buildPdf } from "../../utils/pdf";
import { publicDoctorWhere } from "../doctor/doctor.service";
import type {
	IBookAppointmentPayload,
	ICancelAppointmentPayload,
	IPayAppointmentPayload,
	IUpdateAppointmentStatusPayload,
} from "./appointment.interface";

const MINUTES_PER_SLOT = 20;

// Raw bKash responses stay server-side, same as the payment endpoints.
const paymentWithoutGatewayResponse = {
	omit: { gatewayResponse: true },
} as const;

const appointmentsUrl = (status: string) =>
	`${config.frontend_url}/dashboard/my-appointments?status=${status}`;

const existingAppointmentMessages: Partial<Record<AppointmentStatus, string>> =
	{
		PENDING: "You Already Have A Pending Appointment. Please Pay For That",
		CONFIRMED: "You Already Have A Confirmed Appointment.",
		ONGOING: "You Already Have A Ongoing Appointment",
		COMPLETED: "You Already Have Completed An Appointment On This Schedule",
		CANCELLED:
			"You Cancelled An Appointment On This Schedule And Cannot Book It Again",
	};

const bookAppointment = async (
	payload: IBookAppointmentPayload,
	user: RequestUser,
) => {
	const [patient, schedule] = await Promise.all([
		prisma.patient.findUnique({ where: { userId: user.userId } }),
		// Same rule as public search: no blocked doctors, no crossing the demo boundary.
		prisma.schedule.findFirst({
			where: { id: payload.scheduleId, doctor: publicDoctorWhere(user.isDemo) },
			include: { doctor: true },
		}),
	]);

	if (!patient) {
		throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found");
	}

	if (!schedule || schedule.isDeleted) {
		throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
	}

	if (schedule.status !== ScheduleStatus.PUBLISHED) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This Schedule Is Not Published Yet",
		);
	}

	const now = new Date();

	if (!isSameDhakaDay(now, schedule.startDateTime)) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This Schedule Is Not Available Today",
		);
	}

	if (!isBefore(now, schedule.startDateTime)) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This Schedule Has Already Started",
		);
	}

	if (schedule.availableSlots < 1) {
		throw new AppError(httpStatus.BAD_REQUEST, "This Schedule Is Fully Booked");
	}

	if (!schedule.doctor.consultationFee) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Doctor Has Not Set A Consultation Fee Yet",
		);
	}

	const existingAppointment = await prisma.apppointment.findFirst({
		where: { patientId: patient.id, scheduleId: schedule.id },
		select: { status: true },
	});

	if (existingAppointment) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			existingAppointmentMessages[existingAppointment.status] as string,
		);
	}

	// Ask bKash first so a gateway failure leaves nothing half-created in the database.
	const appointmentId = crypto.randomUUID();
	const amount = schedule.doctor.consultationFee.toString();
	const bkashPayment = await createBkashPayment(
		appointmentId,
		amount,
		user.email,
	);

	await prisma.apppointment.create({
		data: {
			id: appointmentId,
			status: AppointmentStatus.PENDING,
			patientId: patient.id,
			doctorId: schedule.doctor.id,
			scheduleId: schedule.id,
			payment: {
				create: {
					merchantInvoiceNumber: appointmentId,
					amount,
					gatewayResponse: bkashPayment,
					bkashPaymentId: bkashPayment.paymentID,
					payerReference: user.email,
				},
			},
		},
	});

	return { appointmentId, paymentUrl: bkashPayment.bkashURL };
};

// Retry payment for a PENDING appointment (e.g. after a failed or cancelled bKash attempt).
const payAppointment = async (
	payload: IPayAppointmentPayload,
	user: RequestUser,
) => {
	const existingAppointment = await prisma.apppointment.findFirst({
		where: { id: payload.appointmentId, patient: { userId: user.userId } },
		include: { schedule: { include: { doctor: true } } },
	});

	if (!existingAppointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Does Not Exists");
	}

	if (existingAppointment.status !== AppointmentStatus.PENDING) {
		throw new AppError(httpStatus.BAD_REQUEST, "Appointment Is Not Pending!");
	}

	if (!isBefore(new Date(), existingAppointment.schedule.startDateTime)) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This Schedule Has Already Started",
		);
	}

	if (!existingAppointment.schedule.doctor.consultationFee) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Doctor Has Not Set A Consultation Fee Yet",
		);
	}

	const amount = existingAppointment.schedule.doctor.consultationFee.toString();
	const bkashPayment = await createBkashPayment(
		existingAppointment.id,
		amount,
		user.email,
	);

	await prisma.payment.update({
		where: { appointmentId: existingAppointment.id },
		data: {
			amount,
			gatewayResponse: bkashPayment,
			bkashPaymentId: bkashPayment.paymentID,
			status: PaymentStatus.UNPAID,
		},
	});

	return {
		appointmentId: existingAppointment.id,
		paymentUrl: bkashPayment.bkashURL,
	};
};

const sendInvoiceEmail = async (invoice: {
	patientName: string;
	patientEmail: string;
	doctorName: string;
	specialization: string;
	date: Date;
	joiningTime: Date;
	serialNumber: number;
	meetingLink: string;
	amount: string;
	trxId: string;
	paidAt: string;
}) => {
	const pdfBuffer = await buildPdf((doc) => {
		doc.fontSize(20).text("HealthStream System", { align: "center" });
		doc.fontSize(14).text("Appointment Invoice", { align: "center" });
		doc.moveDown(2);
		doc.fontSize(12).text(`Patient Name: ${invoice.patientName}`);
		doc.text(`Patient Email: ${invoice.patientEmail}`);
		doc.moveDown();
		doc.text(`Doctor Name: ${invoice.doctorName}`);
		doc.text(`Specialization: ${invoice.specialization}`);
		doc.moveDown();
		doc.text(`Appointment Date: ${formatDhakaDate(invoice.date)}`);
		doc.text(
			`Your Joining Time: ${formatDhakaTime(invoice.joiningTime)} (Bangladesh time)`,
		);
		doc.text(`Your Serial Number: ${invoice.serialNumber}`);
		doc.text(`Meeting Link: ${invoice.meetingLink}`);
		doc.moveDown();
		doc.text(`Amount Paid: ${invoice.amount} BDT`);
		doc.text("Payment Method: bKash");
		doc.text(`Transaction Id: ${invoice.trxId}`);
		doc.text(`Paid At: ${invoice.paidAt}`);
	});

	await transporter.sendMail({
		from: config.email_sender,
		to: invoice.patientEmail,
		subject: "Your Appointment Invoice - HealthStream System",
		text: "Thank you for booking an appointment. Please find your invoice attached.",
		attachments: [{ filename: "invoice.pdf", content: pdfBuffer }],
	});
};

const bookAppointmentCallback = async (query: Record<string, unknown>) => {
	const paymentId = query.paymentID;
	const status = query.status;

	if (typeof paymentId !== "string" || !paymentId) {
		throw new AppError(httpStatus.BAD_REQUEST, "Payment Id Missing");
	}

	if (status !== "success" && status !== "failure" && status !== "cancel") {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid Payment Status");
	}

	const result = await prisma.$transaction(
		async (tx) => {
			const existingPayment = await tx.payment.findUnique({
				where: { bkashPaymentId: paymentId },
				select: { appointment: { select: { scheduleId: true } } },
			});

			if (!existingPayment) {
				throw new AppError(httpStatus.NOT_FOUND, "Payment Not Found");
			}

			// Row lock: concurrent callbacks for one schedule get serial numbers one at a time.
			await tx.$queryRaw`
				SELECT "id" FROM "schedules"
				WHERE "id" = ${existingPayment.appointment.scheduleId}
				FOR UPDATE
			`;

			const payment = await tx.payment.findUnique({
				where: { bkashPaymentId: paymentId },
				include: {
					appointment: {
						include: { schedule: true, patient: true, doctor: true },
					},
				},
			});

			if (!payment) {
				throw new AppError(httpStatus.NOT_FOUND, "Payment Not Found");
			}

			// bKash may call back twice; the second call just redirects.
			if (payment.status === PaymentStatus.PAID) {
				return { redirectUrl: appointmentsUrl("success") };
			}

			const { appointment } = payment;
			const { schedule } = appointment;

			if (payment.status !== PaymentStatus.UNPAID) {
				throw new AppError(
					httpStatus.CONFLICT,
					"Payment Is Not Awaiting Confirmation",
				);
			}

			if (appointment.status !== AppointmentStatus.PENDING) {
				throw new AppError(
					httpStatus.CONFLICT,
					"Appointment Is No Longer Pending",
				);
			}

			if (status !== "success") {
				await tx.payment.update({
					where: { id: payment.id },
					data: {
						status:
							status === "failure"
								? PaymentStatus.FAILED
								: PaymentStatus.CANCELLED,
					},
				});

				return { redirectUrl: appointmentsUrl(status) };
			}

			const appointmentsWithSlots = await tx.apppointment.findMany({
				where: {
					scheduleId: schedule.id,
					status: { not: AppointmentStatus.CANCELLED },
					serialNumber: { not: null },
				},
				select: { serialNumber: true },
			});
			const usedSerialNumbers = new Set(
				appointmentsWithSlots.map((item) => item.serialNumber),
			);
			const serialNumber = Array.from(
				{ length: schedule.totalSlots },
				(_, index) => index + 1,
			).find((number) => !usedSerialNumbers.has(number));

			if (schedule.availableSlots < 1 || !serialNumber) {
				throw new AppError(
					httpStatus.CONFLICT,
					"This Schedule Is Fully Booked",
				);
			}

			const executedPayment = await bkashRequest("execute", {
				paymentID: paymentId,
			});

			if (
				executedPayment.transactionStatus !== "Completed" ||
				executedPayment.paymentID !== paymentId ||
				executedPayment.merchantInvoiceNumber !==
					payment.merchantInvoiceNumber ||
				Number(executedPayment.amount) !== Number(payment.amount) ||
				executedPayment.currency !== payment.currency
			) {
				throw new AppError(
					httpStatus.BAD_GATEWAY,
					"Payment Gateway Response Could Not Be Verified",
				);
			}

			const joiningTime = addMinutes(
				schedule.startDateTime,
				(serialNumber - 1) * MINUTES_PER_SLOT,
			);

			await tx.apppointment.update({
				where: { id: appointment.id },
				data: {
					status: AppointmentStatus.CONFIRMED,
					joiningTime,
					serialNumber,
				},
			});

			await tx.schedule.update({
				where: { id: schedule.id },
				data: { availableSlots: { decrement: 1 } },
			});

			await tx.payment.update({
				where: { id: payment.id },
				data: {
					status: PaymentStatus.PAID,
					bkashTrxId: executedPayment.trxID,
					paidAt: executedPayment.paymentExecuteTime,
					gatewayResponse: executedPayment,
				},
			});

			return {
				redirectUrl: appointmentsUrl("success"),
				invoice: {
					patientName: appointment.patient.name,
					patientEmail: appointment.patient.email,
					doctorName: appointment.doctor.name,
					specialization: appointment.doctor.specialization,
					date: schedule.startDateTime,
					joiningTime,
					serialNumber,
					meetingLink: schedule.meetingLink,
					amount: String(executedPayment.amount),
					trxId: executedPayment.trxID,
					paidAt: executedPayment.paymentExecuteTime,
				},
			};
		},
		{ maxWait: 10000, timeout: 30000 },
	);

	// Sent after commit: a mail failure must never roll back a payment bKash already took.
	if ("invoice" in result && result.invoice) {
		sendEmailSafely(sendInvoiceEmail(result.invoice));
	}

	return { redirectUrl: result.redirectUrl };
};

const cancelAppointment = async (
	payload: ICancelAppointmentPayload,
	user: RequestUser,
) => {
	return prisma.$transaction(
		async (tx) => {
			const appointmentWhere = {
				id: payload.appointmentId,
				patient: { userId: user.userId },
			};

			const found = await tx.apppointment.findFirst({
				where: appointmentWhere,
				select: { scheduleId: true },
			});

			if (!found) {
				throw new AppError(httpStatus.NOT_FOUND, "Appointment Does Not Exists");
			}

			await tx.$queryRaw`
				SELECT "id" FROM "schedules"
				WHERE "id" = ${found.scheduleId}
				FOR UPDATE
			`;

			const appointment = await tx.apppointment.findFirst({
				where: appointmentWhere,
				include: { payment: true, schedule: true },
			});

			if (!appointment) {
				throw new AppError(httpStatus.NOT_FOUND, "Appointment Does Not Exists");
			}

			if (
				appointment.status === AppointmentStatus.ONGOING ||
				appointment.status === AppointmentStatus.COMPLETED
			) {
				throw new AppError(
					httpStatus.BAD_REQUEST,
					"Appointment Ongoing or Completed",
				);
			}

			if (appointment.status === AppointmentStatus.CANCELLED) {
				throw new AppError(
					httpStatus.BAD_REQUEST,
					"Appointment Already Cancelled",
				);
			}

			const wasConfirmed = appointment.status === AppointmentStatus.CONFIRMED;

			const updatedAppointment = await tx.apppointment.update({
				where: { id: appointment.id },
				data: {
					status: AppointmentStatus.CANCELLED,
					...(wasConfirmed ? { joiningTime: null, serialNumber: null } : {}),
				},
			});

			if (wasConfirmed) {
				await tx.schedule.update({
					where: { id: appointment.scheduleId },
					data: { availableSlots: { increment: 1 } },
				});
			} else if (appointment.payment?.status === PaymentStatus.UNPAID) {
				await tx.payment.update({
					where: { appointmentId: appointment.id },
					data: { status: PaymentStatus.CANCELLED },
				});
			}

			// Refund only when cancelled more than 1 hour before the schedule starts.
			const isEligibleForRefund = isBefore(
				new Date(),
				subHours(appointment.schedule.startDateTime, 1),
			);
			const isRefundable =
				isEligibleForRefund &&
				appointment.payment?.status === PaymentStatus.PAID;

			if (isRefundable && appointment.payment) {
				const refund = await bkashRequest("payment/refund", {
					paymentID: appointment.payment.bkashPaymentId,
					trxID: appointment.payment.bkashTrxId,
					amount: appointment.payment.amount.toString(),
					sku: "Appointment Cancellation",
					reason: "Patient Cancelled The Appointment",
				});

				// Throwing rolls the cancellation back, so the patient can retry instead of losing money.
				if (refund.transactionStatus !== "Completed" || !refund.refundTrxID) {
					throw new AppError(
						httpStatus.BAD_GATEWAY,
						refund.statusMessage || "Refund Failed. Please Try Again.",
					);
				}

				await tx.payment.update({
					where: { appointmentId: appointment.id },
					data: {
						refundTrxId: refund.refundTrxID,
						refundedAt: refund.completedTime,
						refundAmount: refund.amount,
						refundReason: "Patient Cancelled The Appointment",
						status: PaymentStatus.REFUNDED,
						gatewayResponse: refund,
					},
				});
			}

			const payment = await tx.payment.findUnique({
				where: { appointmentId: appointment.id },
			});

			return {
				appointment: updatedAppointment,
				payment,
				refunded: isRefundable,
			};
		},
		{ maxWait: 10000, timeout: 30000 },
	);
};

// Doctor only: CONFIRMED => ONGOING => COMPLETED
const nextStatus: Partial<Record<AppointmentStatus, AppointmentStatus>> = {
	CONFIRMED: AppointmentStatus.ONGOING,
	ONGOING: AppointmentStatus.COMPLETED,
};

const updateAppointmentStatus = async (
	appointmentId: string,
	payload: IUpdateAppointmentStatusPayload,
	user: RequestUser,
) => {
	const appointment = await prisma.apppointment.findFirst({
		where: { id: appointmentId, doctor: { userId: user.userId } },
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
	}

	const allowedNextStatus = nextStatus[appointment.status];

	if (!allowedNextStatus) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Appointment Is ${appointment.status.toLowerCase()} And Cannot Change Status`,
		);
	}

	if (payload.status !== allowedNextStatus) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`A ${appointment.status.toLowerCase()} Appointment Can Only Move To ${allowedNextStatus}`,
		);
	}

	return prisma.apppointment.update({
		where: { id: appointment.id },
		data: { status: allowedNextStatus },
	});
};

const listAppointments = async (
	query: IQuery,
	baseWhere: ApppointmentWhereInput,
	include: ApppointmentInclude,
) => {
	const { limit, page, skip, sortBy, sortOrder } = getPagination(query, [
		"joiningTime",
	]);

	const where: ApppointmentWhereInput = { ...baseWhere };
	if (query.status) {
		where.status = query.status as AppointmentStatus;
	}

	const [appointments, total] = await Promise.all([
		prisma.apppointment.findMany({
			where,
			take: limit,
			skip,
			orderBy: { [sortBy]: sortOrder },
			include,
		}),
		prisma.apppointment.count({ where }),
	]);

	return { data: appointments, meta: getMeta(page, limit, total) };
};

// Meet link is only shown once the appointment is paid.
const hideUnpaidMeetingLink = <
	T extends {
		status: AppointmentStatus;
		schedule?: { meetingLink: string } | null;
	},
>(
	appointment: T,
) =>
	appointment.status === AppointmentStatus.PENDING ||
	appointment.status === AppointmentStatus.CANCELLED
		? {
				...appointment,
				schedule: appointment.schedule && {
					...appointment.schedule,
					meetingLink: "",
				},
			}
		: appointment;

const getMyAppointments = async (query: IQuery, user: RequestUser) => {
	const result = await listAppointments(
		query,
		{ patient: { userId: user.userId } },
		{
			doctor: { select: { id: true, name: true, specialization: true } },
			schedule: true,
			payment: paymentWithoutGatewayResponse,
		},
	);

	return { ...result, data: result.data.map(hideUnpaidMeetingLink) };
};

const getDoctorAppointments = (query: IQuery, user: RequestUser) =>
	listAppointments(
		query,
		{ doctor: { userId: user.userId } },
		{
			patient: {
				select: { id: true, name: true, email: true, contactNumber: true },
			},
			schedule: true,
			payment: paymentWithoutGatewayResponse,
		},
	);

const getAllAppointments = (query: IQuery, viewer: RequestUser) => {
	const where: ApppointmentWhereInput = {
		patient: {
			user: { isDemo: viewer.isDemo },
			...(query.patientEmail ? { email: query.patientEmail } : {}),
		},
	};

	if (query.doctorId) where.doctorId = query.doctorId;
	if (query.patientId) where.patientId = query.patientId;
	if (query.doctorEmail) where.doctor = { email: query.doctorEmail };

	return listAppointments(query, where, {
		patient: { select: { id: true, name: true, email: true } },
		doctor: { select: { id: true, name: true, specialization: true } },
		schedule: true,
		payment: paymentWithoutGatewayResponse,
	});
};

const getSingleAppointment = async (
	appointmentId: string,
	user: RequestUser,
) => {
	const appointment = await prisma.apppointment.findFirst({
		where: { id: appointmentId, patient: { user: { isDemo: user.isDemo } } },
		include: {
			patient: { select: { id: true, name: true, email: true, userId: true } },
			doctor: {
				select: { id: true, name: true, specialization: true, userId: true },
			},
			schedule: true,
			payment: paymentWithoutGatewayResponse,
		},
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
	}

	const isOwnPatient =
		user.role === Role.PATIENT && appointment.patient.userId === user.userId;
	const isOwnDoctor =
		user.role === Role.DOCTOR && appointment.doctor.userId === user.userId;
	const isAdmin = user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN;

	if (!isOwnPatient && !isOwnDoctor && !isAdmin) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You Are Not Allowed To View This Appointment",
		);
	}

	return user.role === Role.PATIENT
		? hideUnpaidMeetingLink(appointment)
		: appointment;
};

export const AppointmentServices = {
	bookAppointment,
	payAppointment,
	bookAppointmentCallback,
	cancelAppointment,
	updateAppointmentStatus,
	getMyAppointments,
	getDoctorAppointments,
	getAllAppointments,
	getSingleAppointment,
};
