import httpStatus from "http-status";
import { AppointmentStatus, Role } from "../../../generated/prisma/enums";
import config from "../../config";
import { cloudinary, uploadToCloudinary } from "../../lib/cloudinary";
import { sendEmailSafely, transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { formatDhakaDate } from "../../utils/dhakaTime";
import { buildPdf } from "../../utils/pdf";
import type { ICreatePrescriptionPayload } from "./prescription.interface";

const createPrescription = async (
	payload: ICreatePrescriptionPayload,
	user: RequestUser,
) => {
	const doctor = await prisma.doctor.findUnique({
		where: { userId: user.userId },
	});

	if (!doctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Profile Not Found");
	}

	const appointment = await prisma.apppointment.findUnique({
		where: { id: payload.appointmentId, doctorId: doctor.id },
		include: { patient: true },
	});

	if (!appointment) {
		throw new AppError(httpStatus.NOT_FOUND, "Appointment Not Found");
	}

	if (appointment.status !== AppointmentStatus.COMPLETED) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Prescription Can Only Be Written For A Completed Appointment",
		);
	}

	if (appointment.prescriptionUrl) {
		throw new AppError(
			httpStatus.CONFLICT,
			"A Prescription Already Exists For This Appointment",
		);
	}

	const pdfBuffer = await buildPdf((doc) => {
		doc.fontSize(20).text("HealthStream System", { align: "center" });
		doc.fontSize(14).text("Prescription", { align: "center" });
		doc.moveDown(2);

		doc.fontSize(12).text(`Patient Name: ${appointment.patient.name}`);
		doc.text(`Doctor Name: ${doctor.name}`);
		doc.text(`Specialization: ${doctor.specialization}`);
		doc.text(`Date: ${formatDhakaDate(new Date())}`);
		doc.moveDown();

		doc.fontSize(14).text("Findings");
		doc.fontSize(12).text(payload.findings);
		doc.moveDown();

		doc.fontSize(14).text("Medicines");
		doc.moveDown(0.5);

		payload.medicines.forEach((medicine, index) => {
			doc.fontSize(12).text(`${index + 1}. ${medicine.name}`);
			doc.text(`   Dosage: ${medicine.dosage}`);
			doc.text(`   Duration: ${medicine.duration}`);
			if (medicine.instructions) {
				doc.text(`   Instructions: ${medicine.instructions}`);
			}
			doc.moveDown(0.5);
		});
	});

	const uploadResult = await uploadToCloudinary(pdfBuffer, {
		resource_type: "raw",
		format: "pdf",
	});

	// Saved only if still empty: a double submit cannot overwrite the first prescription.
	const { count } = await prisma.apppointment.updateMany({
		where: { id: appointment.id, prescriptionUrl: null },
		data: {
			prescriptionUrl: uploadResult.secure_url,
			prescriptionPublicId: uploadResult.public_id,
		},
	});

	if (count === 0) {
		await cloudinary.uploader
			.destroy(uploadResult.public_id, { resource_type: "raw" })
			.catch((error) => console.error("Prescription cleanup failed:", error));
		throw new AppError(
			httpStatus.CONFLICT,
			"A Prescription Already Exists For This Appointment",
		);
	}

	// Prescription is already saved; a mail failure is logged, not returned as an error.
	sendEmailSafely(
		transporter.sendMail({
			from: config.email_sender,
			to: appointment.patient.email,
			subject: "Your Prescription - HealthStream System",
			text: "Please find your prescription attached.",
			attachments: [{ filename: "prescription.pdf", content: pdfBuffer }],
		}),
	);

	return prisma.apppointment.findUniqueOrThrow({
		where: { id: appointment.id },
	});
};

const getSinglePrescription = async (
	appointmentId: string,
	user: RequestUser,
) => {
	const appointment = await prisma.apppointment.findFirst({
		where: { id: appointmentId, patient: { user: { isDemo: user.isDemo } } },
		include: {
			patient: { select: { id: true, name: true, userId: true } },
			doctor: { select: { id: true, name: true, userId: true } },
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

	if (!appointment.prescriptionUrl) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"No Prescription Has Been Written Yet",
		);
	}

	return {
		appointment,
		prescription: appointment.prescriptionUrl,
	};
};

export const PrescriptionServices = {
	createPrescription,
	getSinglePrescription,
};
