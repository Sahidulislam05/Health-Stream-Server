import httpStatus from "http-status";
import { Role } from "../../../generated/prisma/enums";
import type { PaymentWhereInput } from "../../../generated/prisma/models";
import type { IQuery } from "../../interfaces";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { getMeta, getPagination } from "../../utils/pagination";

const paymentInclude = {
	appointment: {
		include: {
			patient: { select: { id: true, name: true, email: true } },
			doctor: { select: { id: true, name: true, specialization: true } },
			schedule: { select: { startDateTime: true, endDateTime: true } },
		},
	},
} as const;

const listPayments = async (query: IQuery, where: PaymentWhereInput) => {
	const { limit, page, skip, sortBy, sortOrder } = getPagination(query, [
		"amount",
	]);

	const [payments, total] = await Promise.all([
		prisma.payment.findMany({
			where,
			take: limit,
			skip,
			orderBy: { [sortBy]: sortOrder },
			include: paymentInclude,
			omit: { gatewayResponse: true },
		}),
		prisma.payment.count({ where }),
	]);

	return { data: payments, meta: getMeta(page, limit, total) };
};

const getMyPayments = (query: IQuery, user: RequestUser) =>
	listPayments(query, { appointment: { patient: { userId: user.userId } } });

const getAllPayments = (query: IQuery, viewer: RequestUser) => {
	const where: PaymentWhereInput = {
		appointment: {
			patient: {
				user: { isDemo: viewer.isDemo },
				...(query.patientEmail ? { email: query.patientEmail } : {}),
			},
		},
	};

	if (query.status) {
		where.status = query.status;
	}

	return listPayments(query, where);
};

const getSinglePayment = async (paymentId: string, user: RequestUser) => {
	const payment = await prisma.payment.findFirst({
		where: {
			id: paymentId,
			appointment: { patient: { user: { isDemo: user.isDemo } } },
		},
		include: {
			appointment: {
				include: {
					patient: {
						select: { id: true, name: true, email: true, userId: true },
					},
					doctor: { select: { id: true, name: true, specialization: true } },
					schedule: { select: { startDateTime: true, endDateTime: true } },
				},
			},
		},
		omit: { gatewayResponse: true },
	});

	if (!payment) {
		throw new AppError(httpStatus.NOT_FOUND, "Payment Not Found");
	}

	if (
		user.role === Role.PATIENT &&
		payment.appointment.patient.userId !== user.userId
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You Are Not Allowed To View This Payment",
		);
	}

	return payment;
};

export const PaymentServices = {
	getAllPayments,
	getMyPayments,
	getSinglePayment,
};
