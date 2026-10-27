import { type Request, type Response, Router } from "express";
import httpStatus from "http-status";
import { Role } from "../../../generated/prisma/enums";
import { signUpload } from "../../lib/cloudinary";
import { auth } from "../../middleware/checkAuth";
import { sendResponse } from "../../utils/sendResponse";

const router = Router();

const sendSignature =
	(kind: Parameters<typeof signUpload>[0]) =>
	(_req: Request, res: Response) => {
		sendResponse(res, {
			statusCode: httpStatus.OK,
			success: true,
			message: "Upload signature created",
			data: signUpload(kind),
		});
	};

// Public: doctor applicants have no account yet. Rate limited in app.ts.
router.get("/doctor-document-signature", sendSignature("doctorDocument"));

router.get(
	"/profile-image-signature",
	auth(Role.SUPER_ADMIN, Role.ADMIN, Role.DOCTOR, Role.PATIENT),
	sendSignature("profileImage"),
);

export const UploadRoutes = router;
