import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { validateRequest } from "../../middleware/validateRequest";
import { AdminController } from "./admin.controller";
import { CreateAdminValidationZodSchema } from "./admin.validation";

const router = Router();

router.post(
	"/create-admin",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	validateRequest(CreateAdminValidationZodSchema),
	AdminController.createAdmin,
);

router.get(
	"/all-admins",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	AdminController.getAllAdmins,
);

export const AdminRoutes = router;
