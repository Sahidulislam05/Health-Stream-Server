import assert from "node:assert/strict";
import { test } from "node:test";
import { getTotalSlots } from "../module/schedule/schedule.service";
import { demoScheduleWindow } from "./demo";
import { dhakaTimeOn, isSameDhakaDay, startOfDhakaDay } from "./dhakaTime";
import { getPagination } from "./pagination";

test("pagination clamps limit and page, whitelists sort field and order", () => {
	assert.deepEqual(
		getPagination({
			limit: "5000",
			page: "-3",
			sortBy: "email",
			sortOrder: "DROP",
		}),
		{
			limit: 100,
			page: 1,
			skip: 0,
			sortBy: "createdAt",
			sortOrder: "desc",
		},
	);
	assert.equal(getPagination({ limit: "10", page: "3" }).skip, 20);
	assert.equal(getPagination({ sortBy: "name" }, ["name"]).sortBy, "name");
});

test("schedule must be 3-8 hours on one day, split into 20-minute slots", () => {
	const at = (time: string) => new Date(`2027-01-10T${time}:00+06:00`);

	assert.equal(getTotalSlots(at("15:00"), at("21:00")), 18);
	assert.equal(getTotalSlots(at("09:00"), at("12:00")), 9);
	assert.throws(() => getTotalSlots(at("09:00"), at("11:59")), /3 And 8 Hours/);
	assert.throws(() => getTotalSlots(at("09:00"), at("17:01")), /3 And 8 Hours/);
	assert.throws(
		() => getTotalSlots(at("12:00"), at("09:00")),
		/Before End Time/,
	);
	assert.throws(
		() => getTotalSlots(at("21:00"), new Date("2027-01-11T03:00:00+06:00")),
		/Same Calendar Day/,
	);
});

test("day rules use Dhaka time no matter the server time zone", () => {
	// 02:00 on 11 Jan in Dhaka is still 10 Jan in UTC.
	const lateNight = new Date("2027-01-10T20:00:00Z");
	assert.equal(
		startOfDhakaDay(lateNight).toISOString(),
		"2027-01-10T18:00:00.000Z",
	);
	assert.equal(
		isSameDhakaDay(
			new Date("2027-01-10T17:59:00Z"),
			new Date("2027-01-10T18:00:00Z"),
		),
		false,
	);
	assert.equal(
		dhakaTimeOn(lateNight, 18).toISOString(),
		"2027-01-11T12:00:00.000Z",
	);
});

test("demo session is always bookable today when it still fits", () => {
	const dhaka = (time: string, day = "10") =>
		new Date(`2027-01-${day}T${time}:00+06:00`);
	const window = (now: Date) => {
		const { start, end } = demoScheduleWindow(now);
		return [start.toISOString(), end.toISOString()];
	};

	// Nightly reset just after midnight: 6–10 PM today.
	assert.deepEqual(window(dhaka("00:30")), [
		dhaka("18:00").toISOString(),
		dhaka("22:00").toISOString(),
	]);
	// Seeded at 5:21 PM: starts 7 PM, ends 11 PM — still bookable today.
	assert.deepEqual(window(dhaka("17:21")), [
		dhaka("19:00").toISOString(),
		dhaka("23:00").toISOString(),
	]);
	// Seeded at 7:40 PM: 9 PM start leaves only 2 hours, so it moves to tomorrow.
	assert.deepEqual(window(dhaka("19:40")), [
		dhaka("18:00", "11").toISOString(),
		dhaka("22:00", "11").toISOString(),
	]);
	// Every window passes the real schedule rules (same day, 3–8 hours).
	for (const time of ["00:30", "17:21", "19:40", "23:50"]) {
		const { start, end } = demoScheduleWindow(dhaka(time));
		assert.ok(getTotalSlots(start, end) >= 9);
	}
});
