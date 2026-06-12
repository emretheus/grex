import { useEffect, useState } from "react";
import logoDarkSrc from "@/assets/codewit-logo.png";
import logoLightSrc from "@/assets/codewit-logo-light.png";
import { resolveTheme, useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

interface CodewitLogoAnimatedProps {
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

export function CodewitLogoAnimated({
	size,
	loop = true,
	autoplay = true,
	className,
}: CodewitLogoAnimatedProps) {
	const { settings } = useSettings();
	const effectiveTheme = resolveTheme(settings.theme);
	const reducedMotion = usePrefersReducedMotion();
	const shouldAnimate = autoplay && loop && !reducedMotion;

	if (shouldAnimate) {
		return <CodewitLogoCss size={size} className={className} />;
	}

	const src = effectiveTheme === "light" ? logoDarkSrc : logoLightSrc;

	return (
		<img
			aria-hidden="true"
			alt=""
			className={cn("block", className)}
			draggable={false}
			src={src}
			style={{ width: size, height: size }}
		/>
	);
}

function CodewitLogoCss({
	size,
	className,
}: {
	size?: string | number;
	className?: string;
}) {
	// The Codewit mark is a two-color stroke (blue "C" + green ">"), so it
	// reads the same on light and dark surfaces — no theme inversion needed.
	// While the agent works the chevron advances + brightens like a streaming
	// prompt and the C gently breathes.
	return (
		<svg
			aria-hidden="true"
			className={cn("block", className)}
			fill="none"
			style={{ width: size, height: size }}
			viewBox="0 0 1024 1024"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				className="codewit-logo-anim-piece codewit-logo-anim-c"
				d="M578 300 L318 300 L198 512 L318 724 L578 724"
				stroke="#1B5BFF"
				strokeWidth="102"
				strokeLinejoin="miter"
				strokeMiterlimit="10"
			/>
			<path
				className="codewit-logo-anim-piece codewit-logo-anim-chevron"
				d="M616 344 L826 512 L616 680"
				stroke="#16C98C"
				strokeWidth="96"
				strokeLinejoin="miter"
				strokeMiterlimit="10"
			/>
		</svg>
	);
}
