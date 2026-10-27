import type { Request, Response } from "express";

// Every API response is `no-store` by default (set in app.ts). Public reads may be cached
// briefly by browsers, but only for anonymous visitors: a signed-in demo user gets different rows.
export const cachePublicResponse = (
	req: Request,
	res: Response,
	maxAgeSeconds: number,
) => {
	res.set("Vary", "Cookie");
	if (!req.user) res.set("Cache-Control", `public, max-age=${maxAgeSeconds}`);
};
