import { Router } from "express";
import { validateRequest } from "../../middleware/validateRequest";
import { ContactController } from "./contact.controller";
import { ContactValidationZodSchema } from "./contact.validation";

const router = Router();

router.post(
	"/",
	validateRequest(ContactValidationZodSchema),
	ContactController.sendContactMessage,
);

export const ContactRoutes = router;
