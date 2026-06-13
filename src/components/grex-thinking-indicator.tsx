import { GrexLogoAnimated } from "@/components/grex-logo-animated";
import { cn } from "@/lib/utils";

type GrexThinkingIndicatorProps = {
	size?: number | string;
	className?: string;
};

export function GrexThinkingIndicator({
	size = 14,
	className,
}: GrexThinkingIndicatorProps) {
	return (
		<span
			aria-hidden="true"
			data-slot="grex-thinking-indicator"
			className={cn(
				"inline-flex shrink-0 items-center justify-center",
				className,
			)}
			style={{ width: size, height: size }}
		>
			<GrexLogoAnimated size={size} className="shrink-0 opacity-80" />
		</span>
	);
}
