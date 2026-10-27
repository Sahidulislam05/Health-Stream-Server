import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { TokenPayload } from "google-auth-library";
import httpStatus from "http-status";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import {
	AuthProvider,
	Role,
	UserStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { googleClient } from "../../lib/googleAuth";
import { sendEmailSafely, sendTemplateEmail } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { getRedis } from "../../lib/redis";
import { AppError } from "../../utils/AppError";
import { jwtUtils } from "../../utils/jwt";
import type {
	DemoRole,
	IChangePasswordPayload,
	IForgotPasswordPayload,
	IGoogleLoginPayload,
	ILoginUserPayload,
	IRegisterPatientPayload,
	IRequestUser,
	IResetPasswordPayload,
	ISetPasswordPayload,
	IVerifyEmailPayload,
} from "./auth.interface";

const OTP_EXPIRATION_SECONDS = 5 * 60;

const generateOtp = () => crypto.randomInt(100000, 1000000).toString();

const createAuthTokens = (user: {
	id: string;
	name: string;
	email: string;
	role: Role;
}) => {
	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	return {
		accessToken: jwtUtils.createToken(
			jwtPayload,
			config.jwt_access_secret,
			config.jwt_access_expires_in as SignOptions,
		),
		refreshToken: jwtUtils.createToken(
			jwtPayload,
			config.jwt_refresh_secret,
			config.jwt_refresh_expires_in as SignOptions,
		),
	};
};

const assertUserIsActive = (user: {
	status: UserStatus;
	isDeleted: boolean;
}) => {
	if (user.status === UserStatus.BLOCKED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is blocked");
	}
	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new AppError(httpStatus.FORBIDDEN, "User is deleted");
	}
};

const registerPatient = async (payload: IRegisterPatientPayload) => {
	const redis = await getRedis();
	const { name, email, password, patient: patientData } = payload;

	const isUserExists = await prisma.user.findUnique({ where: { email } });

	if (isUserExists) {
		throw new AppError(
			httpStatus.CONFLICT,
			"User with this email already exists",
		);
	}

	const hashedPassword = await bcrypt.hash(password, config.bcrypt_salt_rounds);
	const otp = generateOtp();

	if (config.node_env === "development") {
		console.log(`[dev] OTP ${email} : ${otp}`);
	}

	const expiration = {
		expiration: { type: "EX" as const, value: OTP_EXPIRATION_SECONDS },
	};

	await redis.set(`patient-registration-otp:${email}`, otp, expiration);
	await redis.set(
		`patient-registration-data:${email}`,
		JSON.stringify({
			name,
			email,
			password: hashedPassword,
			patient: patientData,
		}),
		expiration,
	);

	await sendTemplateEmail(
		email,
		"Email Verification",
		"registration-user-otp",
		{
			name,
			email,
			otp,
			expirationMinutes: OTP_EXPIRATION_SECONDS / 60,
		},
	);
};

const verifyPatientEmail = async (payload: IVerifyEmailPayload) => {
	const redis = await getRedis();
	const { email, otp } = payload;

	const isUserExist = await prisma.user.findUnique({ where: { email } });

	if (isUserExist) {
		throw new AppError(httpStatus.CONFLICT, "Email Already Verified");
	}

	const otpKey = `patient-registration-otp:${email}`;
	const redisOtp = await redis.get(otpKey);

	if (!redisOtp || redisOtp !== otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
	}

	const patientRegistrationKey = `patient-registration-data:${email}`;
	const redisPatientData = await redis.get(patientRegistrationKey);

	if (!redisPatientData) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Registration expired. Please register again.",
		);
	}

	const patientPayload: IRegisterPatientPayload = JSON.parse(redisPatientData);

	const createdUser = await prisma.user.create({
		data: {
			name: patientPayload.name,
			email: patientPayload.email,
			password: patientPayload.password,
			role: Role.PATIENT,
			status: UserStatus.ACTIVE,
			emailVerified: true,
			patient: {
				create: {
					name: patientPayload.name,
					email: patientPayload.email,
					contactNumber: patientPayload?.patient?.contactNumber || "",
				},
			},
		},
		omit: { password: true },
		include: { patient: true },
	});

	await redis.del([otpKey, patientRegistrationKey]);

	sendEmailSafely(
		sendTemplateEmail(
			email,
			"Welcome To HealthStream System",
			"patient-welcome-email",
			{
				name: createdUser.name,
			},
		),
	);

	const { patient, ...user } = createdUser;

	return { user, patient, ...createAuthTokens(user) };
};

const loginUser = async (payload: ILoginUserPayload) => {
	const { email, password } = payload;

	const user = await prisma.user.findUnique({ where: { email } });

	// Same message for unknown email, no password and wrong password: no account enumeration.
	const isPasswordMatched =
		user?.password && (await bcrypt.compare(password, user.password));

	if (!user || !isPasswordMatched) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
	}

	assertUserIsActive(user);

	return {
		...createAuthTokens(user),
		needPasswordChange: user.needPasswordChange,
	};
};

const getMe = async (user: IRequestUser) => {
	const me = await prisma.user.findUnique({
		where: { id: user.userId },
		include: { patient: true, doctor: true, admin: true },
		omit: { password: true, googleId: true },
	});

	if (!me) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	return me;
};

const refreshToken = async (token: string) => {
	const verifiedRefreshToken = jwtUtils.verifyToken(
		token,
		config.jwt_refresh_secret,
	);

	if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid refresh token");
	}

	const data = verifiedRefreshToken.data as JwtPayload;

	const user = await prisma.user.findUnique({ where: { id: data.userId } });

	if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"User is inactive or not found",
		);
	}

	return createAuthTokens(user);
};

const googleLogin = async (payload: IGoogleLoginPayload) => {
	let googleIdTokenPayload: TokenPayload | undefined;
	try {
		const ticket = await googleClient.verifyIdToken({
			idToken: payload.idToken,
			audience: config.google_client_id,
		});
		googleIdTokenPayload = ticket.getPayload();
	} catch {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"Invalid Or Expired Google Id Token",
		);
	}

	if (!googleIdTokenPayload?.email || !googleIdTokenPayload.email_verified) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Google account email is not verified",
		);
	}

	const email = googleIdTokenPayload.email.toLowerCase();
	const name = googleIdTokenPayload.name || email.split("@")[0];

	let user = await prisma.user.findUnique({ where: { email } });

	if (user && user.role !== Role.PATIENT) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Google login is available for patients only",
		);
	}

	if (user?.isDemo) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Use the demo login for demo accounts",
		);
	}

	if (user && !user.googleId) {
		// Same patient, same email: link Google to the existing credential account.
		user = await prisma.user.update({
			where: { id: user.id },
			data: { googleId: googleIdTokenPayload.sub },
		});
	}

	if (!user) {
		user = await prisma.user.create({
			data: {
				name,
				email,
				role: Role.PATIENT,
				googleId: googleIdTokenPayload.sub,
				authProvider: AuthProvider.GOOGLE,
				emailVerified: true,
				patient: { create: { name, email } },
			},
		});

		sendEmailSafely(
			sendTemplateEmail(
				email,
				"Welcome To HealthStream System",
				"patient-welcome-email",
				{
					name,
				},
			),
		);
	}

	assertUserIsActive(user);

	return createAuthTokens(user);
};

const forgotPassword = async (payload: IForgotPasswordPayload) => {
	const redis = await getRedis();
	const user = await prisma.user.findUnique({
		where: { email: payload.email },
	});

	// Respond the same way whether or not the account can reset: no account enumeration.
	if (
		!user ||
		user.isDemo ||
		!user.password ||
		!user.emailVerified ||
		user.isDeleted ||
		user.status !== UserStatus.ACTIVE
	) {
		return;
	}

	const otp = generateOtp();

	if (config.node_env === "development") {
		console.log(`[dev] Forgot-password OTP for ${user.email}: ${otp}`);
	}

	await redis.set(`forgot-password-otp:${user.email}`, otp, {
		expiration: { type: "EX", value: OTP_EXPIRATION_SECONDS },
	});

	await sendTemplateEmail(user.email, "Forgot Password", "forgot-password", {
		name: user.name,
		otp,
		expirationMinutes: OTP_EXPIRATION_SECONDS / 60,
	});
};

const resetPassword = async (payload: IResetPasswordPayload) => {
	const redis = await getRedis();
	const { email, otp, newPassword } = payload;

	const key = `forgot-password-otp:${email}`;
	const redisOtp = await redis.get(key);

	if (!redisOtp || redisOtp !== otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
	}

	const user = await prisma.user.findUnique({ where: { email } });

	if (!user) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid or expired OTP");
	}

	assertUserIsActive(user);

	await prisma.user.update({
		where: { id: user.id },
		data: {
			password: await bcrypt.hash(newPassword, config.bcrypt_salt_rounds),
			needPasswordChange: false,
		},
	});

	await redis.del(key);

	sendEmailSafely(
		sendTemplateEmail(
			user.email,
			"Password Changed",
			"reset-password-success",
			{
				name: user.name,
			},
		),
	);
};

const changePassword = async (
	requestUser: IRequestUser,
	payload: IChangePasswordPayload,
) => {
	const user = await prisma.user.findUnique({
		where: { id: requestUser.userId },
	});

	if (!user?.password) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"You don't have a password yet. Use set password instead.",
		);
	}

	if (!(await bcrypt.compare(payload.currentPassword, user.password))) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"Current password is incorrect",
		);
	}

	if (payload.currentPassword === payload.newPassword) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"New password must be different from the current password",
		);
	}

	await prisma.user.update({
		where: { id: user.id },
		data: {
			password: await bcrypt.hash(
				payload.newPassword,
				config.bcrypt_salt_rounds,
			),
			needPasswordChange: false,
		},
	});
};

// Patients who joined with Google have no password until they set one here.
const setPassword = async (
	requestUser: IRequestUser,
	payload: ISetPasswordPayload,
) => {
	const user = await prisma.user.findUnique({
		where: { id: requestUser.userId },
	});

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found");
	}

	if (user.password) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Password is already set. Use change password instead.",
		);
	}

	await prisma.user.update({
		where: { id: user.id },
		data: {
			password: await bcrypt.hash(payload.password, config.bcrypt_salt_rounds),
		},
	});
};

// Shared demo accounts have no usable password; this is their only way in, and only in demo mode.
const demoLogin = async (role: DemoRole) => {
	if (!config.demo_mode) {
		throw new AppError(httpStatus.NOT_FOUND, "Demo mode is not enabled");
	}

	const user = await prisma.user.findFirst({
		where: { isDemo: true, role, email: config.demo_emails[role] },
	});

	if (!user) {
		throw new AppError(
			httpStatus.SERVICE_UNAVAILABLE,
			"Demo data is being prepared. Try again shortly.",
		);
	}

	assertUserIsActive(user);

	return createAuthTokens(user);
};

// Demo login is offered only when demo mode is on and the demo accounts actually exist.
const isDemoAvailable = async () =>
	config.demo_mode &&
	(await prisma.user.count({ where: { isDemo: true } })) > 0;

export const AuthService = {
	demoLogin,
	isDemoAvailable,
	registerPatient,
	verifyPatientEmail,
	loginUser,
	getMe,
	refreshToken,
	googleLogin,
	forgotPassword,
	resetPassword,
	changePassword,
	setPassword,
};
