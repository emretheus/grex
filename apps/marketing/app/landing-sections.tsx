import type { ReactNode } from "react";
import type { RepoData } from "@/lib/github";
import { DownloadDropdown } from "./download-dropdown";

/* =======================================================================
   Static landing sections below the hero. Pure presentational components;
   no client state. Provider glyphs are inlined monochrome SVGs (tinted via
   currentColor) so the marketing bundle stays dependency-free.
   ======================================================================= */

// ---------------------------------------------------------------- Providers

type Provider = { name: string; icon: ReactNode };

const PROVIDERS: Provider[] = [
	{ name: "Claude", icon: <ClaudeIcon /> },
	{ name: "Codex", icon: <OpenAIIcon /> },
	{ name: "Cursor", icon: <CursorIcon /> },
	{ name: "Gemini", icon: <GeminiIcon /> },
	{ name: "Copilot", icon: <CopilotIcon /> },
	{ name: "Kimi", icon: <KimiIcon /> },
	{ name: "OpenCode", icon: <OpenCodeIcon /> },
];

export function ProvidersStrip() {
	return (
		<section className="providers" id="providers" aria-label="Supported agents">
			<p className="section-eyebrow">Works with the agents you already use</p>
			<ul className="provider-row">
				{PROVIDERS.map((p) => (
					<li className="provider" key={p.name}>
						<span className="provider-mark" aria-hidden="true">
							{p.icon}
						</span>
						{p.name}
					</li>
				))}
			</ul>
		</section>
	);
}

// ---------------------------------------------------------------- Features

type Feature = { title: string; body: string; icon: ReactNode };

const FEATURES: Feature[] = [
	{
		title: "Run agents in parallel",
		body: "Spin up as many agents as you like across isolated workspaces and let them work at the same time — no tab juggling.",
		icon: <ParallelIcon />,
	},
	{
		title: "Built-in chat",
		body: "Streaming, multi-turn conversations with every agent in one consistent interface — prompts, reasoning, and results.",
		icon: <ChatIcon />,
	},
	{
		title: "Diff review",
		body: "See exactly what each agent changed and review every diff before it lands. Nothing is committed without you.",
		icon: <DiffIcon />,
	},
	{
		title: "File explorer + editor",
		body: "Browse the tree and edit files inline with a full Monaco editor — read, tweak, and ship without leaving Grex.",
		icon: <EditorIcon />,
	},
	{
		title: "Integrated terminals",
		body: "Real terminals attached to each workspace, so you can run, test, and debug right alongside your agents.",
		icon: <TerminalIcon />,
	},
	{
		title: "Local-first & private",
		body: "Your workspaces, sessions, and messages live in a local SQLite database on your machine. Nothing leaves unless you send it.",
		icon: <ShieldIcon />,
	},
];

export function FeaturesSection() {
	return (
		<section className="features" id="features" aria-label="Features">
			<div className="section-head">
				<p className="section-eyebrow">Everything in one window</p>
				<h2 className="section-title">A complete cockpit for coding agents.</h2>
				<p className="section-lead">
					Chat, diffs, files, and terminals — the whole loop, without stitching
					together five different tools.
				</p>
			</div>
			<ul className="feature-grid">
				{FEATURES.map((f) => (
					<li className="feature-card" key={f.title}>
						<span className="feature-icon" aria-hidden="true">
							{f.icon}
						</span>
						<h3 className="feature-title">{f.title}</h3>
						<p className="feature-body">{f.body}</p>
					</li>
				))}
			</ul>
		</section>
	);
}

// ---------------------------------------------------------------- Context

const CONTEXT_POINTS = [
	"Each workspace keeps its own history, files, and sessions — context never bleeds between projects.",
	"Bring diffs, files, and terminal output into the conversation so the agent sees what you see.",
	"Switch models or agents mid-task without losing your place.",
];

export function ContextSection() {
	return (
		<section className="context" id="context" aria-label="Context">
			<div className="context-inner">
				<div className="context-copy">
					<p className="section-eyebrow">Context, under control</p>
					<h2 className="section-title">
						Give every agent exactly the right context.
					</h2>
					<p className="section-lead">
						Great output starts with great context. Grex scopes it per workspace
						and keeps it local — so every agent works with the full picture of
						one project, and nothing more.
					</p>
					<ul className="context-list">
						{CONTEXT_POINTS.map((point) => (
							<li key={point}>
								<CheckIcon />
								{point}
							</li>
						))}
					</ul>
				</div>
				<div className="context-visual" aria-hidden="true">
					<div className="ctx-card">
						<span className="ctx-dot" /> workspace · feature/auth
					</div>
					<div className="ctx-card ctx-card-2">
						<span className="ctx-dot ctx-dot-2" /> 12 files · 3 diffs in review
					</div>
					<div className="ctx-card ctx-card-3">
						<span className="ctx-dot ctx-dot-3" /> session · 8 messages
					</div>
				</div>
			</div>
		</section>
	);
}

// ---------------------------------------------------------------- CTA band

export function CtaBand({ data }: { data: RepoData }) {
	return (
		<section className="cta-band" aria-label="Download Grex">
			<h2 className="section-title">Ready to run every agent in one place?</h2>
			<p className="section-lead">
				Free, local-first, and open. Download Grex for macOS or Windows.
			</p>
			<div className="cta cta-center">
				<DownloadDropdown data={data} />
				<a className="btn outline" href={data.windowsSetupUrl}>
					<WindowsIcon />
					Download for Windows
				</a>
			</div>
			<p className="cta-note">
				{data.version} · macOS · Windows x64 · {data.license}
			</p>
		</section>
	);
}

// ---------------------------------------------------------------- Footer

export function SiteFooter({ data }: { data: RepoData }) {
	return (
		<footer className="footer">
			<div className="footer-brand">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src="/grex-logo.png"
					alt=""
					aria-hidden="true"
					width={18}
					height={18}
				/>
				<span>Grex</span>
				<span className="footer-version">{data.version}</span>
			</div>
			<nav className="footer-links" aria-label="Footer">
				<a href={data.repoUrl}>GitHub</a>
				<a href={data.releasesUrl}>Releases</a>
				<a href={`${data.repoUrl}/discussions`}>Discussions</a>
			</nav>
			<span className="footer-copy">© 2026 Grex · {data.license}</span>
		</footer>
	);
}

/* ---------------------------------------------------------------- Provider glyphs
   Monochrome single-path marks (24x24). Claude, Cursor, Gemini, Copilot,
   Kimi (Moonshot AI) and OpenCode are from Simple Icons; OpenAI mirrors the
   in-app Codex mark. */

function svgProps() {
	return {
		viewBox: "0 0 24 24",
		fill: "currentColor",
		xmlns: "http://www.w3.org/2000/svg",
		"aria-hidden": true as const,
	};
}

function ClaudeIcon() {
	return (
		<svg {...svgProps()}>
			<path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
		</svg>
	);
}

function OpenAIIcon() {
	return (
		<svg {...svgProps()} fillRule="evenodd">
			<path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z" />
		</svg>
	);
}

function CursorIcon() {
	return (
		<svg {...svgProps()}>
			<path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" />
		</svg>
	);
}

function GeminiIcon() {
	return (
		<svg {...svgProps()}>
			<path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" />
		</svg>
	);
}

function CopilotIcon() {
	return (
		<svg {...svgProps()}>
			<path d="M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Zm-11.75-5.992h-.344a4.359 4.359 0 0 1-.355.508c-.77.947-1.918 1.492-3.508 1.492-1.725 0-2.989-.359-3.782-1.259a2.137 2.137 0 0 1-.085-.104L4 11.746v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.359 4.359 0 0 1-.355-.508Zm2.328 3.25c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm-5 0c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm3.313-6.185c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z" />
		</svg>
	);
}

function KimiIcon() {
	return (
		<svg {...svgProps()}>
			<path d="m1.053 16.91 9.538 2.55a21 20.981 0 0 0 .06 2.031l5.956 1.592a12 11.99 0 0 1-15.554-6.172m-1.02-5.79 11.352 3.035a21 20.981 0 0 0-.469 2.01l10.817 2.89a12 11.99 0 0 1-1.845 2.004L.658 15.918a12 11.99 0 0 1-.625-4.796m1.593-5.146L13.573 9.17a21 20.981 0 0 0-1.01 1.874l11.297 3.02a21 20.981 0 0 1-.67 2.362l-11.55-3.087L.125 10.26a12 11.99 0 0 1 1.499-4.285ZM6.067 1.58l11.285 3.016a21 20.981 0 0 0-1.688 1.719l7.824 2.091a21 20.981 0 0 1 .513 2.664L2.107 5.218a12 11.99 0 0 1 3.96-3.638M21.68 4.866 7.222 1.003A12 11.99 0 0 1 21.68 4.866" />
		</svg>
	);
}

function OpenCodeIcon() {
	return (
		<svg {...svgProps()}>
			<path d="M22 24H2V0h20zM17 4.8H7v14.4h10z" />
		</svg>
	);
}

/* ---------------------------------------------------------------- Feature glyphs
   Lucide-equivalent stroke icons, no runtime dep. */

function strokeProps() {
	return {
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.75,
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
		"aria-hidden": true as const,
	};
}

function ParallelIcon() {
	return (
		<svg {...strokeProps()}>
			<rect x="3" y="4" width="7" height="16" rx="1.5" />
			<rect x="14" y="4" width="7" height="10" rx="1.5" />
		</svg>
	);
}
function ChatIcon() {
	return (
		<svg {...strokeProps()}>
			<path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
		</svg>
	);
}
function DiffIcon() {
	return (
		<svg {...strokeProps()}>
			<path d="M12 3v6M9 6h6M5 9l-2 3 2 3M19 9l2 3-2 3M12 15v6M9 18h6" />
		</svg>
	);
}
function EditorIcon() {
	return (
		<svg {...strokeProps()}>
			<path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
			<path d="M9 3v18M12 8l2 2-2 2M16 8l-2 2 2 2" />
		</svg>
	);
}
function TerminalIcon() {
	return (
		<svg {...strokeProps()}>
			<path d="M4 17l6-5-6-5M12 19h8" />
		</svg>
	);
}
function ShieldIcon() {
	return (
		<svg {...strokeProps()}>
			<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
			<path d="m9 12 2 2 4-4" />
		</svg>
	);
}
function CheckIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			className="ctx-check"
		>
			<polyline points="20 6 9 17 4 12" />
		</svg>
	);
}
function WindowsIcon() {
	return (
		<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M3 5.4 10.4 4.4v7.1H3V5.4zM10.4 12.5v7.1L3 18.6v-6.1h7.4zM11.3 4.3 21 3v8.5h-9.7V4.3zM21 12.5V21l-9.7-1.3v-7.2H21z" />
		</svg>
	);
}
