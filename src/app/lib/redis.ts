import { createClient } from "redis";
import config from "../config";

export const redisClient = createClient({
	username: config.redis_user,
	password: config.redis_password,
	socket: {
		host: config.redis_host,
		port: Number(config.redis_port),
	},
});

// Without a listener, a dropped connection would crash the process; node-redis reconnects by itself.
redisClient.on("error", (error) =>
	console.error("Redis error:", error.message),
);

let connection: Promise<typeof redisClient> | undefined;

// Connect on first use: on Vercel there is no boot step, and tests never open a socket.
export const getRedis = () => {
	connection ??= redisClient.connect().catch((error) => {
		connection = undefined;
		throw error;
	});
	return connection;
};
