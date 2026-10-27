import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { UserController } from "./user.controller";
import {
	UpdateProfileImageValidationZodSchema,
	UpdateUserStatusValidationZodSchema,
} from "./user.validation";

const router = Router();

router.patch(
	"/profile-image",
	auth(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.PATIENT),
	validateRequest(UpdateProfileImageValidationZodSchema),
	UserController.updateProfileImage,
);

router.get(
	"/patients",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	UserController.getAllPatients,
);

router.patch(
	"/:userId/status",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	validateRequest(UpdateUserStatusValidationZodSchema),
	UserController.updateUserStatus,
);

export const UserRoutes = router;
