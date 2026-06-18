import type { AutomationSchedule, AutomationStatus } from "@/lib/api";
import { i18n } from "@/lib/i18n";

const WEEKDAY_KEYS = [
	"sunday",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
] as const;

const MONTH_KEYS = [
	"jan",
	"feb",
	"mar",
	"apr",
	"may",
	"jun",
	"jul",
	"aug",
	"sep",
	"oct",
	"nov",
	"dec",
] as const;

/** Localized weekday names (Sunday-first), recomputed per call so a language
 *  switch is reflected without a cached stale array. */
export function weekdayNames(): string[] {
	return WEEKDAY_KEYS.map((key) => i18n.t(`automations:weekday.${key}`));
}

/** Wall-clock time used whenever a daily/weekly schedule needs a default. */
export const DEFAULT_TIME = "09:00";

/** Default interval for newly created automations: "Daily at 9:00 AM". */
export const DEFAULT_SCHEDULE: AutomationSchedule = {
	kind: "daily",
	time: DEFAULT_TIME,
};

/** "Hourly" / "Daily at 09:00" / "Weekly on Monday at 09:00" / "Every 15m". */
export function scheduleSummary(schedule: AutomationSchedule): string {
	switch (schedule.kind) {
		case "hourly":
			return i18n.t("automations:schedule.hourly");
		case "daily":
			return i18n.t("automations:schedule.dailyAt", { time: schedule.time });
		case "weekly":
			return i18n.t("automations:schedule.weeklyAt", {
				weekday:
					weekdayNames()[schedule.weekday] ??
					i18n.t("automations:weekday.sunday"),
				time: schedule.time,
			});
		case "every":
			return schedule.unit === "minutes"
				? i18n.t("automations:schedule.everyMinutes", {
						amount: schedule.amount,
					})
				: i18n.t("automations:schedule.everyHours", {
						amount: schedule.amount,
					});
	}
}

/** Right-aligned list-row label: "Hourly" / "Daily" / "Weekly" / "Every 15m". */
export function scheduleShortLabel(schedule: AutomationSchedule): string {
	switch (schedule.kind) {
		case "hourly":
			return i18n.t("automations:schedule.hourly");
		case "daily":
			return i18n.t("automations:schedule.daily");
		case "weekly":
			return i18n.t("automations:schedule.weekly");
		case "every":
			return scheduleSummary(schedule);
	}
}

function formatClockTime(date: Date): string {
	const hours24 = date.getHours();
	const hour12 = ((hours24 + 11) % 12) + 1;
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const meridiem =
		hours24 < 12
			? i18n.t("automations:runTime.meridiem.am")
			: i18n.t("automations:runTime.meridiem.pm");
	return `${hour12}:${minutes} ${meridiem}`;
}

function isSameLocalDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

/** "Today at 11:37 AM" / "Yesterday at 9:00 PM" / "Jun 12 at 8:15 AM" — all
 *  in the user's local timezone. Falls back to the raw input when the
 *  timestamp doesn't parse. */
export function formatRunTime(iso: string): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return iso;
	const clock = formatClockTime(date);
	const now = new Date();
	if (isSameLocalDay(date, now))
		return i18n.t("automations:runTime.today", { clock });
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	if (isSameLocalDay(date, yesterday))
		return i18n.t("automations:runTime.yesterday", { clock });
	return i18n.t("automations:runTime.date", {
		month: i18n.t(`automations:month.${MONTH_KEYS[date.getMonth()]}`),
		day: date.getDate(),
		clock,
	});
}

export function statusDotClass(status: AutomationStatus): string {
	return status === "active" ? "bg-emerald-500" : "bg-muted-foreground/40";
}

export function statusLabel(status: AutomationStatus): string {
	return status === "active"
		? i18n.t("automations:status.active")
		: i18n.t("automations:status.paused");
}
