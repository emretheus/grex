import { CodewitLogoAnimated } from "@/components/codewit-logo-animated";
import { cn } from "@/lib/utils";

type CodewitThinkingIndicatorProps = {
	size?: number | string;
	className?: string;
};

export function CodewitThinkingIndicator({
	size = 14,
	className,
}: CodewitThinkingIndicatorProps) {
	return (
		<span
			aria-hidden="true"
			data-slot="codewit-thinking-indicator"
			className={cn(
				"inline-flex shrink-0 items-center justify-center",
				className,
			)}
			style={{ width: size, height: size }}
		>
			<CodewitLogoAnimated size={size} className="shrink-0 opacity-80" />
		</span>
	);
}
