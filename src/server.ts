import app from "./app";
import config from "./app/config";
import { startLocalCron } from "./app/lib/cron";
import { transporter } from "./app/lib/nodemailer";
import { prisma } from "./app/lib/prisma";
import { getRedis, redisClient } from "./app/lib/redis";
import { ensureDemoData } from "./app/utils/demo";
import {
	backfillAdminProfiles,
	seedSuperAdmin,
	seedTesterAdmin,
	seedTesterDoctor,
} from "./app/utils/seed";

const PORT = config.port;

const main = async () => {
	try {
		await prisma.$connect();
		console.log("Connected to the database successfully.");

		await getRedis();
		console.log("Redis Connected Successfully.");

		await transporter.verify();
		console.log("Nodemailer Connected Successfully.");

		await seedSuperAdmin();
		if (config.node_env !== "production") {
			await seedTesterAdmin();
			await seedTesterDoctor();
		}
		await backfillAdminProfiles();

		// Demo is optional: a demo misconfiguration is reported but never stops the real app.
		await ensureDemoData().catch((error) =>
			console.error("Demo data not created:", error.message),
		);

		startLocalCron();

		const server = app.listen(PORT, () => {
			console.log(`Server is running on port ${PORT}`);
		});

		// Finish in-flight requests, then release DB and Redis connections.
		const shutdown = (signal: string) => {
			console.log(`${signal} received. Shutting down...`);
			server.close(async () => {
				await prisma.$disconnect();
				await redisClient.quit();
				process.exit(0);
			});
		};
		process.on("SIGTERM", () => shutdown("SIGTERM"));
		process.on("SIGINT", () => shutdown("SIGINT"));
	} catch (error) {
		console.error("Error starting the server:", error);
		await prisma.$disconnect();
		process.exit(1);
	}
};

main();
