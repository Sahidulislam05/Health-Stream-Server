import httpStatus from "http-status";
import {
	AppointmentStatus,
	DoctorVerificationStatus,
	PaymentStatus,
	ScheduleStatus,
} from "../../../generated/prisma/enums";
import type {
	ApppointmentWhereInput,
	PaymentWhereInput,
} from "../../../generated/prisma/models";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";

// Net income = paid + refunded payments, minus the refunded amounts.
const getRevenue = async (where: PaymentWhereInput) => {
	const [paid, refunded] = await Promise.all([
		prisma.payment.aggregate({
			where: {
				...where,
				status: { in: [PaymentStatus.PAID, PaymentStatus.REFUNDED] },
			},
			_sum: { amount: true },
		}),
		prisma.payment.aggregate({
			where: { ...where, status: PaymentStatus.REFUNDED },
			_sum: { refundAmount: true },
		}),
	]);

	const totalRefunded = refunded._sum.refundAmount?.toNumber() || 0;
	const totalPaid = paid._sum.amount?.toNumber() || 0;

	return { totalPaid, totalRefunded, netRevenue: totalPaid - totalRefunded };
};

const countAppointmentsByStatus = async (where: ApppointmentWhereInput) => {
	const groups = await prisma.apppointment.groupBy({
		by: ["status"],
		where,
		_count: { _all: true },
	});

	const countOf = (status: AppointmentStatus) =>
		groups.find((group) => group.status === status)?._count._all || 0;

	return {
		totalAppointments: groups.reduce(
			(sum, group) => sum + group._count._all,
			0,
		),
		upcomingAppointments: countOf(AppointmentStatus.CONFIRMED),
		ongoingAppointments: countOf(AppointmentStatus.ONGOING),
		completedAppointments: countOf(AppointmentStatus.COMPLETED),
		cancelledAppointments: countOf(AppointmentStatus.CANCELLED),
	};
};

// Demo admins see demo numbers only; real admins never see demo activity (FRONTEND_PLAN §2.3).
const getAdminAnalytics = async (viewer: RequestUser) => {
	const demoScope = { user: { isDemo: viewer.isDemo } };
	const [doctorGroups, totalPatients, appointments, revenue] =
		await Promise.all([
			prisma.doctor.groupBy({
				by: ["verificationStatus"],
				where: { isDeleted: false, ...demoScope },
				_count: { _all: true },
			}),
			prisma.patient.count({ where: { isDeleted: false, ...demoScope } }),
			countAppointmentsByStatus({ patient: demoScope }),
			getRevenue({ appointment: { patient: demoScope } }),
		]);

	const doctorsWith = (status: DoctorVerificationStatus) =>
		doctorGroups.find((group) => group.verificationStatus === status)?._count
			._all || 0;

	return {
		totalDoctors: doctorGroups.reduce(
			(sum, group) => sum + group._count._all,
			0,
		),
		totalPendingDoctorApplications: doctorsWith(
			DoctorVerificationStatus.PENDING,
		),
		totalApprovedDoctors: doctorsWith(DoctorVerificationStatus.APPROVED),
		totalRejectedDoctors: doctorsWith(DoctorVerificationStatus.REJECTED),
		totalPatients,
		totalAppointments: appointments.totalAppointments,
		totalCompletedAppointments: appointments.completedAppointments,
		totalCancelledAppointments: appointments.cancelledAppointments,
		totalRevenue: revenue.netRevenue,
		totalRefunded: revenue.totalRefunded,
	};
};

const getPatientAnalytics = async (user: RequestUser) => {
	const patient = await prisma.patient.findUnique({
		where: { userId: user.userId },
	});

	if (!patient) {
		throw new AppError(httpStatus.NOT_FOUND, "Patient Profile Not Found");
	}

	const [appointments, spentResult, revenue] = await Promise.all([
		countAppointmentsByStatus({ patientId: patient.id }),
		prisma.payment.aggregate({
			where: {
				appointment: { patientId: patient.id },
				status: PaymentStatus.PAID,
			},
			_sum: { amount: true },
		}),
		getRevenue({ appointment: { patientId: patient.id } }),
	]);

	return {
		totalAppointments: appointments.totalAppointments,
		upcomingAppointments: appointments.upcomingAppointments,
		completedAppointments: appointments.completedAppointments,
		cancelledAppointments: appointments.cancelledAppointments,
		totalAmountSpent: spentResult._sum.amount?.toNumber() || 0,
		totalRefunded: revenue.totalRefunded,
	};
};

const getDoctorAnalytics = async (user: RequestUser) => {
	const doctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}

	const [totalSchedules, publishedSchedules, appointments, revenue] =
		await Promise.all([
			prisma.schedule.count({
				where: { doctorId: doctor.id, isDeleted: false },
			}),
			prisma.schedule.count({
				where: {
					doctorId: doctor.id,
					isDeleted: false,
					status: ScheduleStatus.PUBLISHED,
				},
			}),
			countAppointmentsByStatus({ doctorId: doctor.id }),
			getRevenue({ appointment: { doctorId: doctor.id } }),
		]);

	return {
		totalSchedules,
		publishedSchedules,
		...appointments,
		totalDoctorEarnings: revenue.netRevenue,
		totalDoctorRefunded: revenue.totalRefunded,
	};
};

export const AnalyticsServices = {
	getAdminAnalytics,
	getPatientAnalytics,
	getDoctorAnalytics,
};
