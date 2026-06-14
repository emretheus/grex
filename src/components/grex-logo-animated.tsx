import { useEffect, useState } from "react";
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

// --- Tile grid ---------------------------------------------------------------
// The mark is the letter "G" drawn as a front-facing grid of square tiles. The
// 3D character comes entirely from the per-tile flip animation (each tile turns
// on its vertical axis like the Helmor mark), NOT from a static isometric
// skew — a sheared "G" is unreadable at icon sizes, so the letter faces the
// viewer and stays legible.
const CELL = 20; // grid cell size
const GAP = 2.2; // gap between tiles ("mortar" lines)
const OX = 6;
const OY = 6;
const RADIUS = 2.5;

// Blocky "G" on a 4-wide x 5-tall grid. Each entry is a grid cell [col, row].
// The wide-open upper-right "mouth" and the inward spur (cols 2-3 of the middle
// row, stopping short of the left spine) are what make this read as a G and not
// a C / O / 8:
//   X X X X
//   X . . .
//   X . X X   <- inward spur (the G bar)
//   X . . X
//   X X X X
const G_CELLS: ReadonlyArray<readonly [number, number]> = [
	[0, 0],
	[1, 0],
	[2, 0],
	[3, 0],
	[0, 1],
	[0, 2],
	[2, 2],
	[3, 2],
	[0, 3],
	[3, 3],
	[0, 4],
	[1, 4],
	[2, 4],
	[3, 4],
];

const COLS = 4;
const ROWS = 5;
const MAX_RANK = COLS - 1 + (ROWS - 1); // largest (col + row), for the wave

// Grex blue ramp: royal -> cyan, sampled per tile so the letter reads as a
// single gradient even though each face is a flat shade.
function lerpHex(a: string, b: string, t: number): string {
	const pa = [1, 3, 5].map((i) => Number.parseInt(a.slice(i, i + 2), 16));
	const pb = [1, 3, 5].map((i) => Number.parseInt(b.slice(i, i + 2), 16));
	const mix = pa.map((c, i) =>
		Math.round(c + (pb[i] - c) * t)
			.toString(16)
			.padStart(2, "0"),
	);
	return `#${mix.join("")}`;
}

const FRONT_FROM = "#1e5bff";
const FRONT_TO = "#38bdf8";
const BACK_FACE = "#0b1e6b"; // shaded back face, seen mid-flip

const VIEW_W = OX * 2 + COLS * CELL;
const VIEW_H = OY * 2 + ROWS * CELL;

/**
 * The Grex "G" mark, used as the "agent working" indicator. It is the letter G
 * assembled from a front-facing grid of square tiles in the Grex blue ramp.
 * While a turn is active the tiles flip around their vertical axis in a
 * staggered wave (echoing the original Helmor mark): each tile squishes
 * edge-on, shows its shaded back face, and swings back to front.
 * Theme-independent; respects `prefers-reduced-motion` (static G, no motion).
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
		<svg
			aria-hidden="true"
			className={cn("block", className)}
			style={{ width: size, height: size }}
			viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>Grex</title>
			{G_CELLS.map(([u, v]) => {
				const front = lerpHex(FRONT_FROM, FRONT_TO, (u + v) / MAX_RANK);
				// Negative delay so tiles start already spread across the flip cycle.
				const delayMs = -((u + v) / MAX_RANK) * 900;
				return (
					<rect
						key={`${u}-${v}`}
						className={shouldAnimate ? "grex-tile" : undefined}
						x={OX + u * CELL + GAP / 2}
						y={OY + v * CELL + GAP / 2}
						width={CELL - GAP}
						height={CELL - GAP}
						rx={RADIUS}
						fill={front}
						style={
							shouldAnimate
								? ({
										"--g-front": front,
										"--g-back": BACK_FACE,
										animationDelay: `${delayMs}ms`,
									} as React.CSSProperties)
								: undefined
						}
					/>
				);
			})}
		</svg>
	);
}
