import type { IQuery } from "../interfaces";

const MAX_LIMIT = 100;

// Only listed columns can be sorted on: an unknown or hidden column (e.g. email on a public list) falls back to createdAt.
export const getPagination = (
	query: IQuery,
	sortableFields: readonly string[] = [],
) => {
	const limit = Math.min(Math.max(Number(query.limit) || 10, 1), MAX_LIMIT);
	const page = Math.max(Number(query.page) || 1, 1);
	const sortBy = sortableFields.includes(query.sortBy ?? "")
		? (query.sortBy as string)
		: "createdAt";
	const sortOrder: "asc" | "desc" = query.sortOrder === "asc" ? "asc" : "desc";

	return { limit, page, skip: (page - 1) * limit, sortBy, sortOrder };
};

export const getMeta = (page: number, limit: number, total: number) => ({
	page,
	limit,
	total,
	totalPages: Math.ceil(total / limit),
});
