import { useTranslation } from "react-i18next";

export function ReadyStatus() {
	const { t } = useTranslation("providers");
	return (
		<div className="flex shrink-0 items-center gap-2 text-small font-medium text-emerald-500">
			<span className="size-2 rounded-full bg-emerald-500" />
			{t("status.ready")}
		</div>
	);
}
