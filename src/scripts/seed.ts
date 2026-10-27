import config from "../app/config";
import { prisma } from "../app/lib/prisma";
import { ensureDemoData } from "../app/utils/demo";
import {
	seedSuperAdmin,
	seedTesterAdmin,
	seedTesterDoctor,
} from "../app/utils/seed";

try {
	await seedSuperAdmin();
	if (config.node_env !== "production") {
		await seedTesterAdmin();
		await seedTesterDoctor();
	}
	await ensureDemoData();
	console.log("Seed finished.");
} finally {
	await prisma.$disconnect();
}
