"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RepoData } from "@/lib/github";
import { DownloadDropdown } from "./download-dropdown";
import {
	ContextSection,
	CtaBand,
	FeaturesSection,
	ProvidersStrip,
	SiteFooter,
} from "./landing-sections";

type Theme = "light" | "dark";

const STORAGE_KEY = "grex-marketing-theme";
// Keep the product preview tilt subtle so it reads as ambient polish.
const MAX_TILT_DEG = 4;

export function MarketingShell({ data }: { data: RepoData }) {
	// SSR default mirrors <html class="dark"> in layout; a useEffect reconciles
	// against localStorage to avoid hydration mismatch.
	const [theme, setTheme] = useState<Theme>("dark");

	// Mount: read persisted theme + sync <html class>. Matches the
	// pre-hydration bootstrap in layout.tsx: stored LS > system prefs > dark.
	useEffect(() => {
		let initial: Theme | null = null;
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (parsed === "light" || parsed === "dark") initial = parsed;
			}
		} catch {
			/* noop */
		}
		if (!initial) {
			initial = window.matchMedia("(prefers-color-scheme: light)").matches
				? "light"
				: "dark";
		}
		setTheme(initial);
	}, []);

	// Apply theme changes. First run is skipped: the pre-hydration bootstrap in
	// layout.tsx already set <html class>, and the mount-init above reconciles
	// React state. Without this guard the initial "dark" SSR state would briefly
	// revert the bootstrap's class — a visible flash + spurious opacity transition.
	const hasMountedRef = useRef(false);
	useEffect(() => {
		if (!hasMountedRef.current) {
			hasMountedRef.current = true;
			return;
		}
		const root = document.documentElement;
		root.classList.toggle("dark", theme === "dark");
		root.classList.toggle("light", theme === "light");
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
		} catch {
			/* noop */
		}
	}, [theme]);

	const toggleTheme = useCallback((mode: Theme) => setTheme(mode), []);

	// `T` / `t` toggles the theme globally.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			if (
				target &&
				(target.tagName === "INPUT" || target.tagName === "TEXTAREA")
			) {
				return;
			}
			if (e.key === "t" || e.key === "T") {
				setTheme((prev) => (prev === "dark" ? "light" : "dark"));
			}
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, []);

	// Subtle cursor-driven 3D tilt on the product screenshot. Gated on
	// prefers-reduced-motion. (The old smoke/dust atmosphere was removed.)
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const stageRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const wrap = wrapRef.current;
		const stage = stageRef.current;
		if (!wrap || !stage) return;

		const prefersReduced = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		if (prefersReduced) return;

		let targetRX = 0;
		let targetRY = 0;
		let curRX = 0;
		let curRY = 0;
		let rafId: number | null = null;

		const tick = () => {
			curRX += (targetRX - curRX) * 0.12;
			curRY += (targetRY - curRY) * 0.12;
			stage.style.transform = `rotateX(${curRX.toFixed(2)}deg) rotateY(${curRY.toFixed(2)}deg)`;
			if (
				Math.abs(curRX - targetRX) > 0.01 ||
				Math.abs(curRY - targetRY) > 0.01
			) {
				rafId = requestAnimationFrame(tick);
			} else {
				rafId = null;
			}
		};
		const schedule = () => {
			if (rafId == null) rafId = requestAnimationFrame(tick);
		};

		const onMove = (e: PointerEvent) => {
			const rect = stage.getBoundingClientRect();
			const cx = rect.left + rect.width / 2;
			const cy = rect.top + rect.height / 2;
			const dx = (e.clientX - cx) / (rect.width / 2);
			const dy = (e.clientY - cy) / (rect.height / 2);
			targetRY = Math.max(-1, Math.min(1, dx)) * MAX_TILT_DEG;
			targetRX = -Math.max(-1, Math.min(1, dy)) * MAX_TILT_DEG;
			schedule();
		};
		const onLeave = () => {
			targetRX = 0;
			targetRY = 0;
			schedule();
		};

		wrap.addEventListener("pointermove", onMove);
		wrap.addEventListener("pointerleave", onLeave);
		return () => {
			wrap.removeEventListener("pointermove", onMove);
			wrap.removeEventListener("pointerleave", onLeave);
			if (rafId != null) cancelAnimationFrame(rafId);
		};
	}, []);

	return (
		<div className="page">
			{/* ===================== TOP RAIL ===================== */}
			<header className="rail">
				<a className="brand" href="/">
					{/* Official Grex hexagon mark — gradient logo on transparent bg,
					 * reads on both themes with no light/dark swap. */}
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						className="brand-mark"
						src="/grex-logo.png"
						alt=""
						aria-hidden="true"
					/>
					Grex
				</a>
				<span className="version">{data.version}</span>
				<nav className="links" aria-label="Primary">
					<a href="#features">Features</a>
					<a href="#providers">Agents</a>
					<a href={data.releasesUrl}>Changelog</a>
				</nav>
				<div className="spacer" />
				<a
					className="rail-github"
					href={data.repoUrl}
					aria-label="View on GitHub"
				>
					<GithubIcon />
				</a>
				<div className="theme-toggle" role="tablist" aria-label="Theme">
					<button
						type="button"
						aria-label="Light"
						aria-pressed={theme === "light"}
						className={theme === "light" ? "active" : undefined}
						onClick={() => toggleTheme("light")}
					>
						<SunIcon />
					</button>
					<button
						type="button"
						aria-label="Dark"
						aria-pressed={theme === "dark"}
						className={theme === "dark" ? "active" : undefined}
						onClick={() => toggleTheme("dark")}
					>
						<MoonIcon />
					</button>
				</div>
			</header>

			<main className="content">
				{/* ===================== HERO ===================== */}
				<section className="hero">
					<div className="hero-glow" aria-hidden="true" />
					<div className="hero-grid">
						<div className="pitch">
							<a className="changelog-chip" href={data.latestReleaseUrl}>
								<span className="tag">{data.versionShort}</span>
								Now supporting 7 coding agents
								<span className="arrow">→</span>
							</a>

							<h1 className="hero-title">
								Every AI coding agent.
								<span className="line2"> One elegant desktop app.</span>
							</h1>

							<p className="sub">
								Run Claude, Codex, Cursor, Gemini, Copilot, Kimi and OpenCode
								from a single, clean, local-first interface — with built-in
								chat, diff review, file explorer, editor, and terminals.
							</p>

							<div className="cta">
								<DownloadDropdown data={data} />
								<a className="btn outline" href={data.windowsSetupUrl}>
									<WindowsIcon />
									Download for Windows
								</a>
							</div>

							<div className="meta">
								<span>
									<span className="ok">●</span> {data.branch} · {data.shortSha}
								</span>
								<span className="sep" />
								<span>{data.license}</span>
								<span className="sep" />
								<span>macOS · Windows x64</span>
							</div>
						</div>

						<div className="mock-wrap" ref={wrapRef}>
							<div
								className="mock-stage"
								aria-label="Grex product preview"
								ref={stageRef}
							>
								<div className="shot dark-layer">
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img
										src="/grex-screenshot-dark.png"
										alt="Grex (dark)"
										draggable={false}
									/>
								</div>
								<div className="shot light-layer">
									{/* eslint-disable-next-line @next/next/no-img-element */}
									<img
										src="/grex-screenshot-light.png"
										alt="Grex (light)"
										draggable={false}
									/>
								</div>
							</div>
						</div>
					</div>
				</section>

				<ProvidersStrip />
				<FeaturesSection />
				<ContextSection />
				<CtaBand data={data} />
			</main>

			<SiteFooter data={data} />
		</div>
	);
}

// ---------- Inline SVG icons (lucide-equivalent, no runtime dep) ----------

function SunIcon() {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="4" />
			<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
		</svg>
	);
}

function MoonIcon() {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
		</svg>
	);
}

function WindowsIcon() {
	return (
		<svg
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="currentColor"
			aria-hidden="true"
		>
			<path d="M3 5.4 10.4 4.4v7.1H3V5.4zM10.4 12.5v7.1L3 18.6v-6.1h7.4zM11.3 4.3 21 3v8.5h-9.7V4.3zM21 12.5V21l-9.7-1.3v-7.2H21z" />
		</svg>
	);
}

function GithubIcon() {
	return (
		<svg
			width="13"
			height="13"
			viewBox="0 0 24 24"
			fill="currentColor"
			aria-hidden="true"
		>
			<path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.93c.58.11.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.68-1.28-1.68-1.04-.72.08-.7.08-.7 1.16.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.18-3.08-.12-.29-.51-1.47.11-3.06 0 0 .97-.31 3.18 1.17a11 11 0 0 1 5.78 0c2.21-1.48 3.17-1.17 3.17-1.17.63 1.59.23 2.77.12 3.06.74.8 1.18 1.82 1.18 3.08 0 4.41-2.7 5.39-5.27 5.67.42.36.78 1.05.78 2.13v3.15c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
		</svg>
	);
}
