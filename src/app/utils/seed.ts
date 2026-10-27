import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import { DoctorVerificationStatus, Role } from "../../generated/prisma/enums";
import config from "../config";
import { prisma } from "../lib/prisma";
import { AppError } from "./AppError";

export const seedSuperAdmin = async () => {
	try {
		const isSuperAdminExist = await prisma.user.findFirst({
			where: {
				role: Role.SUPER_ADMIN,
			},
		});

		if (isSuperAdminExist) {
			console.log("Super Admin Already Exists!");
			return;
		}

		const name = config.super_admin_name;
		const email = config.super_admin_email;
		const password = config.super_admin_password;

		if (!name || !email || !password) {
			throw new AppError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Super Admin Name , Email, Password Missing In Env File!!!",
			);
		}

		const hashedPassword = await bcrypt.hash(
			password,
			config.bcrypt_salt_rounds,
		);

		const superAdmin = await prisma.user.create({
			data: {
				name,
				email,
				password: hashedPassword,
				role: Role.SUPER_ADMIN,
				needPasswordChange: false,
				emailVerified: true,
				admin: { create: { name, email, personalEmail: email } },
			},
		});

		console.log("Super Admin Created : ", {
			id: superAdmin.id,
			email: superAdmin.email,
		});
	} catch (error) {
		console.error("Error Seeding Super Admin : ", error);
		throw error;
	}
};

//create tester admin

export const seedTesterAdmin = async () => {
	try {
		const isTesterAdminExist = await prisma.user.findUnique({
			where: {
				email: config.tester_admin_email,
			},
		});

		if (isTesterAdminExist) {
			console.log("Tester Admin Already Exists!");
			return;
		}

		const name = config.tester_admin_name;
		const email = config.tester_admin_email;
		const password = config.tester_admin_password;

		if (!name || !email || !password) {
			throw new AppError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Tester Admin Name , Email, Password Missing In Env File!!!",
			);
		}

		const hashedPassword = await bcrypt.hash(
			password,
			config.bcrypt_salt_rounds,
		);

		const testerAdmin = await prisma.user.create({
			data: {
				name,
				email,
				password: hashedPassword,
				role: Role.ADMIN,
				needPasswordChange: false,
				emailVerified: true,
				admin: { create: { name, email, personalEmail: email } },
			},
		});

		console.log("Tester Admin Created : ", {
			id: testerAdmin.id,
			email: testerAdmin.email,
		});
	} catch (error) {
		console.error("Error Seeding Tester Admin : ", error);
		throw error;
	}
};

// create tester doctor

export const seedTesterDoctor = async () => {
	try {
		const isTesterDoctorExist = await prisma.user.findUnique({
			where: {
				email: config.tester_doctor_email,
			},
		});

		if (isTesterDoctorExist) {
			console.log("Tester Doctor Already Exists!");
			return;
		}

		const name = config.tester_doctor_name;
		const email = config.tester_doctor_email;
		const password = config.tester_doctor_password;

		if (!name || !email || !password) {
			throw new AppError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Tester Doctor Name , Email, Password Missing In Env File!!!",
			);
		}

		const hashedPassword = await bcrypt.hash(
			password,
			config.bcrypt_salt_rounds,
		);

		const testerDoctor = await prisma.user.create({
			data: {
				name,
				email,
				password: hashedPassword,
				role: Role.DOCTOR,
				needPasswordChange: false,
				emailVerified: true,
				doctor: {
					create: {
						email,
						name,
						experienceYears: 5,
						licenseNumber: "BMDC0000",
						qualifications: "MBBS",
						specialization: "Neurology",
						verificationStatus: DoctorVerificationStatus.APPROVED,
					},
				},
			},
		});

		console.log("Tester Doctor Created : ", {
			id: testerDoctor.id,
			email: testerDoctor.email,
		});
	} catch (error) {
		console.error("Error Seeding Tester Doctor : ", error);
		throw error;
	}
};

// Admins created before the admins table existed have no profile; give them one.
// Their personal email is unknown, so the login email is used, same as the seeds above.
export const backfillAdminProfiles = async () => {
	const adminsWithoutProfile = await prisma.user.findMany({
		where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] }, admin: null },
		select: { id: true, name: true, email: true },
	});

	if (!adminsWithoutProfile.length) return;

	const { count } = await prisma.admin.createMany({
		data: adminsWithoutProfile.map((user) => ({
			userId: user.id,
			name: user.name,
			email: user.email,
			personalEmail: user.email,
		})),
		skipDuplicates: true,
	});

	console.log(`Admin profiles backfilled: ${count}`);
};
