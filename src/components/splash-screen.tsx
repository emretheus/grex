import grexLogoSrc from "@/assets/grex-logo.png";

export function SplashScreen({ visible }: { visible: boolean }) {
	return (
		<div
			aria-hidden="true"
			className="fixed inset-0 z-[9999] flex items-center justify-center bg-background transition-opacity duration-400"
			style={{ opacity: visible ? 1 : 0 }}
		>
			<img
				src={grexLogoSrc}
				alt=""
				width={72}
				height={72}
				draggable={false}
				className="grex-splash-logo size-18 select-none"
			/>
		</div>
	);
}
