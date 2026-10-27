import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth, optionalAuth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { DoctorController } from "./doctor.controller";
import {
	ApplyAsDoctorValidationZodSchema,
	ApproveDoctorValidationZodSchema,
	UpdateDoctorProfileValidationZodSchema,
	VerifyDoctorEmailValidationZodSchema,
} from "./doctor.validation";

const router = Router();

router.post(
	"/apply-as-doctor",
	validateRequest(ApplyAsDoctorValidationZodSchema),
	DoctorController.applyAsDoctor,
);
router.post(
	"/apply-as-doctor/verify-email",
	validateRequest(VerifyDoctorEmailValidationZodSchema),
	DoctorController.verifyDoctorEmail,
);
router.post(
	"/approve-doctor",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	validateRequest(ApproveDoctorValidationZodSchema),
	DoctorController.approveDoctor,
);
router.get(
	"/all-doctors",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	DoctorController.getAllDoctors,
);

router.patch(
	"/update-my-profile",
	auth(Role.DOCTOR),
	validateRequest(UpdateDoctorProfileValidationZodSchema),
	DoctorController.updateDoctorProfile,
);

// Public doctor-discovery routes (no auth) — meant for patients browsing before login.
router.get(
	"/public/available-today",
	optionalAuth,
	DoctorController.getAvailableDoctorByTodaysSchedule,
);

router.get(
	"/public/all-doctors",
	optionalAuth,
	DoctorController.getAllDoctorsListPublic,
);

router.get(
	"/public/:doctorId",
	optionalAuth,
	DoctorController.getSingleDoctorPublicProfile,
);

export const DoctorRoutes = router;
