// All "today" and "same day" rules use Bangladesh time. Vercel reserves the TZ variable
// (servers run in UTC), so the offset is applied explicitly. Bangladesh has no DST.
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

export const startOfDhakaDay = (date: Date) => {
	const shifted = new Date(date.getTime() + DHAKA_OFFSET_MS);
	shifted.setUTCHours(0, 0, 0, 0);
	return new Date(shifted.getTime() - DHAKA_OFFSET_MS);
};

export const isSameDhakaDay = (a: Date, b: Date) =>
	startOfDhakaDay(a).getTime() === startOfDhakaDay(b).getTime();

// A Dhaka wall-clock time on the day of `date`, e.g. dhakaTimeOn(now, 18) = today 6:00 PM in Dhaka.
export const dhakaTimeOn = (date: Date, hours: number, minutes = 0) =>
	new Date(
		startOfDhakaDay(date).getTime() + (hours * 60 + minutes) * 60 * 1000,
	);

const formatter = (options: Intl.DateTimeFormatOptions) =>
	new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", ...options });

export const formatDhakaDate = (date: Date) =>
	formatter({ dateStyle: "full" }).format(date);

export const formatDhakaTime = (date: Date) =>
	formatter({ timeStyle: "short" }).format(date);
