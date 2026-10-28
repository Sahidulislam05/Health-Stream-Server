import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type Application,
  type Request,
  type Response,
} from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import helmet from "helmet";
import httpStatus from "http-status";
import config from "./app/config";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { AdminRoutes } from "./app/module/admin/admin.route";
import { AnalyticsRoutes } from "./app/module/analytics/analytics.route";
import { AppointementRoutes } from "./app/module/appointment/appointment.route";
import { AuthRoutes } from "./app/module/auth/auth.route";
import { ContactRoutes } from "./app/module/contact/contact.route";
import { CronRoutes } from "./app/module/cron/cron.route";
import { DoctorRoutes } from "./app/module/doctor/doctor.route";
import { PaymentRoutes } from "./app/module/payment/payment.route";
import { PrescriptionRoutes } from "./app/module/prescription/prescription.route";
import { ScheduleRoutes } from "./app/module/schedule/schedule.route";
import { UploadRoutes } from "./app/module/upload/upload.route";
import { UserRoutes } from "./app/module/user/user.route";
import { requestLogger } from "./app/middleware/requestLogger";

const app: Application = express();

app.set("trust proxy", config.trust_proxy);

app.use(helmet());

app.use(requestLogger);

app.use(
  cors({
    origin: config.frontend_url,
    credentials: true,
  }),
);

const limit = (max: number, keyGenerator?: (req: express.Request) => string) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    keyGenerator,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      statusCode: httpStatus.TOO_MANY_REQUESTS,
      message: "Too many requests. Please try again later.",
    },
  });

app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.use("/api", limit(500));

app.use(
  [
    "/api/v1/auth/login",
    "/api/v1/auth/register",
    "/api/v1/auth/verify-email",
    "/api/v1/auth/google",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/reset-password",
    "/api/v1/auth/change-password",
    "/api/v1/auth/set-password",
    "/api/v1/auth/demo-login",
    "/api/v1/doctor/apply-as-doctor",
    "/api/v1/contact",
    "/api/v1/upload/doctor-document-signature",
  ],
  limit(30),
);

app.use(
  [
    "/api/v1/auth/login",
    "/api/v1/auth/verify-email",
    "/api/v1/auth/forgot-password",
    "/api/v1/auth/reset-password",
    "/api/v1/doctor/apply-as-doctor/verify-email",
  ],
  limit(10, (req) =>
    typeof req.body?.email === "string"
      ? `email:${req.body.email.trim().toLowerCase()}`
      : ipKeyGenerator(req.ip ?? ""),
  ),
);

app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use("/api/v1/auth", AuthRoutes);
app.use("/api/v1/user", UserRoutes);
app.use("/api/v1/admin", AdminRoutes);
app.use("/api/v1/appointment", AppointementRoutes);
app.use("/api/v1/doctor", DoctorRoutes);
app.use("/api/v1/schedule", ScheduleRoutes);
app.use("/api/v1/payment", PaymentRoutes);
app.use("/api/v1/prescription", PrescriptionRoutes);
app.use("/api/v1/analytics", AnalyticsRoutes);
app.use("/api/v1/contact", ContactRoutes);
app.use("/api/v1/cron", CronRoutes);
app.use("/api/v1/upload", UploadRoutes);

app.get("/", (_req: Request, res: Response) => {
  res.status(httpStatus.OK).json({
    success: true,
    message: "Welcome to HealthStream System Backend",
  });
});

app.use(notFound);
app.use(globalErrorHandler);

export default app;
