import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AuthController } from "./auth.controller";
import { UserValidation } from "./auth.validation";

const router = Router();

router.post(
	"/register",
	validateRequest(UserValidation.PatientRegistrationZodSchema),
	AuthController.registerPatient,
);
router.post(
	"/verify-email",
	validateRequest(UserValidation.PatientEmailVerifyZodSchema),
	AuthController.verifyPatientEmail,
);
router.post(
	"/login",
	validateRequest(UserValidation.LoginZodSchema),
	AuthController.loginUser,
);
router.get(
	"/me",
	auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
	AuthController.getMe,
);
router.post("/refresh-token", AuthController.refreshToken);
router.post(
	"/google",
	validateRequest(UserValidation.GoogleLoginZodSchema),
	AuthController.googleLogin,
);
router.post(
	"/forgot-password",
	validateRequest(UserValidation.ForgotPasswordZodSchema),
	AuthController.forgotPassword,
);
router.post(
	"/reset-password",
	validateRequest(UserValidation.ResetPasswordZodSchema),
	AuthController.resetPassword,
);
router.post(
	"/change-password",
	auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
	validateRequest(UserValidation.ChangePasswordZodSchema),
	AuthController.changePassword,
);
router.post(
	"/set-password",
	auth(Role.PATIENT),
	validateRequest(UserValidation.SetPasswordZodSchema),
	AuthController.setPassword,
);
router.post(
	"/demo-login",
	validateRequest(UserValidation.DemoLoginZodSchema),
	AuthController.demoLogin,
);
router.get("/demo", AuthController.demoStatus);
router.post("/logout", AuthController.logout);

export const AuthRoutes = router;
