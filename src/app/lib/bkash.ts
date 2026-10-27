import httpStatus from "http-status";
import config from "../config";
import { AppError } from "../utils/AppError";
import { getRedis } from "./redis";

const BKASH_TIMEOUT_MS = 15000;

const getBkashIdToken = async () => {
	try {
		const redis = await getRedis();
		const IdTokenKey = "bkash:idToken";
		const RefreshTokenKey = "bkash:refreshToken";

		let bkashIdToken = await redis.get(IdTokenKey);
		const bkashIdTokenTTL = await redis.ttl(IdTokenKey);

		const bkashRefreshToken = await redis.get(RefreshTokenKey);
		const bkashRefreshTokenTTL = await redis.ttl(RefreshTokenKey);

		//bkash id token remaining time is less than equal 10 minutes or bkash id is expired
		// bkash refresh token must exist
		// bkash refresh token remaining time is more than 10 minutes
		if (
			(bkashIdTokenTTL <= 600 || !bkashIdToken) &&
			bkashRefreshToken &&
			bkashRefreshTokenTTL > 600
		) {
			const refreshTokenResponse = await fetch(
				`${config.bkash_base_url}/tokenized/checkout/token/refresh`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Accept: "application/json",
						username: config.bkash_username,
						password: config.bkash_password,
					},
					body: JSON.stringify({
						app_key: config.bkash_app_key,
						app_secret: config.bkash_app_secret,
						refresh_token: bkashRefreshToken,
					}),
					signal: AbortSignal.timeout(BKASH_TIMEOUT_MS),
				},
			);
			const bkashRefreshTokenResult = await refreshTokenResponse.json();

			// bKash reports some errors with HTTP 200, so the token itself is the success signal.
			if (!refreshTokenResponse.ok || !bkashRefreshTokenResult.id_token) {
				throw new AppError(
					httpStatus.BAD_GATEWAY,
					"Bkash Access Token Grant Failed",
				);
			}

			bkashIdToken = bkashRefreshTokenResult.id_token as string;

			await redis.set(IdTokenKey, bkashIdToken, {
				expiration: {
					type: "EX",
					value: 60 * 60,
				},
			});

			return bkashIdToken;
		}

		if (bkashIdTokenTTL > 600) {
			return bkashIdToken;
		}

		const response = await fetch(
			`${config.bkash_base_url}/tokenized/checkout/token/grant`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
					username: config.bkash_username,
					password: config.bkash_password,
				},
				body: JSON.stringify({
					app_key: config.bkash_app_key,
					app_secret: config.bkash_app_secret,
				}),
				signal: AbortSignal.timeout(BKASH_TIMEOUT_MS),
			},
		);
		const result = await response.json();

		if (!response.ok || !result.id_token || !result.refresh_token) {
			throw new AppError(
				httpStatus.BAD_GATEWAY,
				"Bkash Access Token Grant Failed",
			);
		}

		//bkash id token set
		await redis.set(IdTokenKey, result.id_token, {
			expiration: {
				type: "EX",
				value: 60 * 60, // 1hour
			},
		});

		//bkash refresh token set
		await redis.set(RefreshTokenKey, result.refresh_token, {
			expiration: {
				type: "EX",
				value: 60 * 60 * 24 * 28, // 28 days
			},
		});

		bkashIdToken = result.id_token;

		return bkashIdToken;
	} catch (error) {
		if (error instanceof AppError) {
			throw error;
		}
		console.error("bKash token request failed:", error);
		throw new AppError(
			httpStatus.BAD_GATEWAY,
			"bKash Is Not Reachable Right Now",
		);
	}
};

// Calls a bKash tokenized-checkout endpoint and returns the parsed JSON body.
export const bkashRequest = async (
	endpoint: string,
	body: Record<string, unknown>,
) => {
	const bkashIdToken = await getBkashIdToken();

	if (!bkashIdToken) {
		throw new AppError(httpStatus.BAD_GATEWAY, "No Bkash Access Token Found!");
	}

	const response = await fetch(
		`${config.bkash_base_url}/tokenized/checkout/${endpoint}`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: bkashIdToken,
				"X-App-Key": config.bkash_app_key,
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(BKASH_TIMEOUT_MS),
		},
	);

	return response.json();
};

export const createBkashPayment = async (
	appointmentId: string,
	amount: string,
	payerReference: string,
) => {
	const result = await bkashRequest("create", {
		mode: "0011",
		payerReference,
		callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
		amount,
		currency: "BDT",
		intent: "sale",
		merchantInvoiceNumber: appointmentId,
	});

	if (result.statusCode !== "0000" || !result.bkashURL) {
		throw new AppError(
			httpStatus.BAD_GATEWAY,
			result.statusMessage || "Could Not Start bKash Payment",
		);
	}

	return result;
};
