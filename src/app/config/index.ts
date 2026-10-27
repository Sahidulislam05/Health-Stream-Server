import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

// Fail fast on boot instead of crashing on the first request that needs a value.
const requiredEnv = [
	"DATABASE_URL",
	"JWT_ACCESS_SECRET",
	"JWT_REFRESH_SECRET",
	"JWT_ACCESS_EXPIRES_IN",
	"JWT_REFRESH_EXPIRES_IN",
	"FRONTEND_URL",
];
const demoMode = process.env.DEMO_MODE === "true";
// Demo accounts send real email (invoices, prescriptions), so each needs an inbox the owner controls.
const demoEnv = [
	"DEMO_PATIENT_EMAIL",
	"DEMO_DOCTOR_EMAIL",
	"DEMO_ADMIN_EMAIL",
	"DEMO_APPLICANT_EMAIL",
];
if (demoMode) requiredEnv.push(...demoEnv);

const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
	throw new Error(`Missing environment variables: ${missingEnv.join(", ")}`);
}

export default {
	node_env: process.env.NODE_ENV,
	port: process.env.PORT,
	database_url: process.env.DATABASE_URL,
	frontend_url: process.env.FRONTEND_URL,
	bcrypt_salt_rounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,
	jwt_access_secret: process.env.JWT_ACCESS_SECRET!,
	jwt_refresh_secret: process.env.JWT_REFRESH_SECRET!,
	jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN!,
	jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN!,
	google_client_id: process.env.GOOGLE_CLIENT_ID!,
	super_admin_name: process.env.SUPER_ADMIN_NAME!,
	super_admin_email: process.env.SUPER_ADMIN_EMAIL!,
	super_admin_password: process.env.SUPER_ADMIN_PASSWORD!,
	tester_admin_name: process.env.TESTER_ADMIN_NAME!,
	tester_admin_email: process.env.TESTER_ADMIN_EMAIL!,
	tester_admin_password: process.env.TESTER_ADMIN_PASSWORD!,
	tester_doctor_name: process.env.TESTER_DOCTOR_NAME!,
	tester_doctor_email: process.env.TESTER_DOCTOR_EMAIL!,
	tester_doctor_password: process.env.TESTER_DOCTOR_PASSWORD!,
	redis_user: process.env.REDIS_USER!,
	redis_password: process.env.REDIS_PASSWORD!,
	redis_host: process.env.REDIS_HOST!,
	redis_port: process.env.REDIS_PORT!,
	smtp_user: process.env.SMTP_USER!,
	smtp_password: process.env.SMTP_PASSWORD!,
	email_sender: process.env.EMAIL_SENDER!,
	cloudinary_cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
	cloudinary_api_key: process.env.CLOUDINARY_API_KEY!,
	cloudinary_api_secret: process.env.CLOUDINARY_API_SECRET!,
	bkash_base_url: process.env.BKASH_BASE_URL!,
	bkash_username: process.env.BKASH_USERNAME!,
	bkash_password: process.env.BKASH_PASSWORD!,
	bkash_app_key: process.env.BKASH_APP_KEY!,
	bkash_app_secret: process.env.BKASH_APP_SECRET!,
	bkash_callback_url: process.env.BKASH_CALLBACK_URL!,
	// Vercel sends this as "Authorization: Bearer <secret>" when it calls a cron route.
	cron_secret: process.env.CRON_SECRET,
	trust_proxy: Number(process.env.TRUST_PROXY ?? 1),
	// Frontend Route Handler that refreshes cached public pages (FRONTEND_PLAN phase 6).
	revalidate_secret: process.env.REVALIDATE_SECRET,
	demo_mode: demoMode,
	demo_emails: {
		PATIENT: process.env.DEMO_PATIENT_EMAIL?.toLowerCase() ?? "",
		DOCTOR: process.env.DEMO_DOCTOR_EMAIL?.toLowerCase() ?? "",
		ADMIN: process.env.DEMO_ADMIN_EMAIL?.toLowerCase() ?? "",
		APPLICANT: process.env.DEMO_APPLICANT_EMAIL?.toLowerCase() ?? "",
	},
};
