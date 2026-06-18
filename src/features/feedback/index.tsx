import { MessageSquareWarning } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";

export { FeedbackDialog } from "./feedback-dialog";

export function FeedbackButton({ onClick }: { onClick: () => void }) {
	const { t } = useTranslation("feedback");
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					onClick={onClick}
					className="text-muted-foreground hover:text-foreground"
				>
					<MessageSquareWarning className="size-[15px]" strokeWidth={1.8} />
				</Button>
			</TooltipTrigger>
			<TooltipContent
				side="top"
				sideOffset={6}
				className="flex h-[22px] items-center rounded-md px-1.5 text-mini leading-none"
			>
				<span className="leading-none">{t("button.tooltip")}</span>
			</TooltipContent>
		</Tooltip>
	);
}
