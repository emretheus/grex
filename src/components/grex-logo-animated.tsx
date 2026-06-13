import { useEffect, useState } from "react";
import logoSrc from "@/assets/grex-logo.png";
import { cn } from "@/lib/utils";

interface GrexLogoAnimatedProps {
	/** CSS width/height */
	size?: string | number;
	loop?: boolean;
	autoplay?: boolean;
	className?: string;
}

function usePrefersReducedMotion() {
	const [reducedMotion, setReducedMotion] = useState(false);

	useEffect(() => {
		if (typeof window.matchMedia !== "function") {
			return;
		}

		const query = window.matchMedia("(prefers-reduced-motion: reduce)");
		const handleChange = () => setReducedMotion(query.matches);

		handleChange();
		query.addEventListener("change", handleChange);
		return () => query.removeEventListener("change", handleChange);
	}, []);

	return reducedMotion;
}

/**
 * The Grex hexagon mark, used as the "agent working" indicator. The mark is a
 * two-tone gem (theme-independent), so it renders identically on light and dark
 * surfaces; while a turn is active it gently breathes (scale + opacity).
 */
export function GrexLogoAnimated({
	size,
	loop = true,
	autoplay = true,
	className,
}: GrexLogoAnimatedProps) {
	const reducedMotion = usePrefersReducedMotion();
	const shouldAnimate = autoplay && loop && !reducedMotion;

	return (
		<img
			aria-hidden="true"
			alt=""
			className={cn("block", shouldAnimate && "grex-logo-pulse", className)}
			draggable={false}
			src={logoSrc}
			style={{ width: size, height: size }}
		/>
	);
}
