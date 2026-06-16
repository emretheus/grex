import {
	BookOpen,
	Brain,
	Bug,
	Drama,
	FileSearch,
	FileText,
	Flame,
	Folder,
	GitCommitHorizontal,
	GitPullRequest,
	Globe,
	Hash,
	LayoutDashboard,
	ListOrdered,
	type LucideIcon,
	MonitorCheck,
	Palette,
	Plug,
	Presentation,
	Shapes,
	Sheet,
	ShieldCheck,
	Sparkles,
	SwatchBook,
} from "lucide-react";
import {
	siAirtable,
	siAnthropic,
	siAsana,
	siAtlassian,
	siBrave,
	siClickhouse,
	siCloudflare,
	siCloudinary,
	siDiscord,
	siElasticsearch,
	siFigma,
	siGithub,
	siGitlab,
	siGooglechrome,
	siGooglemaps,
	siGrafana,
	siHuggingface,
	siLinear,
	siMongodb,
	siNeon,
	siNetlify,
	siNotion,
	siPerplexity,
	siPostgresql,
	siPuppeteer,
	siRailway,
	siRedis,
	siRender,
	siSanity,
	siSentry,
	siSnowflake,
	siSqlite,
	siStripe,
	siSupabase,
	siUpstash,
	siVercel,
} from "simple-icons";

type Glyph = { path: string };

/** Brand glyphs from simple-icons (bundled, offline). Keyed by catalog
 * `iconKey`; entries without a brand here fall back to a letter avatar. */
const ICONS: Record<string, Glyph> = {
	airtable: siAirtable,
	anthropic: siAnthropic,
	asana: siAsana,
	atlassian: siAtlassian,
	brave: siBrave,
	chrome: siGooglechrome,
	clickhouse: siClickhouse,
	cloudflare: siCloudflare,
	cloudinary: siCloudinary,
	discord: siDiscord,
	elasticsearch: siElasticsearch,
	figma: siFigma,
	github: siGithub,
	gitlab: siGitlab,
	googlemaps: siGooglemaps,
	grafana: siGrafana,
	huggingface: siHuggingface,
	linear: siLinear,
	mongodb: siMongodb,
	neon: siNeon,
	netlify: siNetlify,
	notion: siNotion,
	perplexity: siPerplexity,
	postgres: siPostgresql,
	puppeteer: siPuppeteer,
	railway: siRailway,
	redis: siRedis,
	render: siRender,
	sanity: siSanity,
	sentry: siSentry,
	snowflake: siSnowflake,
	sqlite: siSqlite,
	stripe: siStripe,
	supabase: siSupabase,
	upstash: siUpstash,
	vercel: siVercel,
};

/** Lucide fallbacks for entries with no brand glyph in simple-icons — generic
 * concept servers (filesystem, memory…) and a few brands simple-icons doesn't
 * ship (Playwright, Slack…). Keyed by the catalog `iconKey`. */
const LUCIDE: Record<string, LucideIcon> = {
	// MCP servers
	playwright: Drama,
	slack: Hash,
	firecrawl: Flame,
	deepwiki: BookOpen,
	filesystem: Folder,
	memory: Brain,
	"sequential-thinking": ListOrdered,
	fetch: Globe,
	// Skills (generic)
	"code-reviewer": FileSearch,
	"commit-message": GitCommitHorizontal,
	"pr-description": GitPullRequest,
	debugger: Bug,
	"security-review": ShieldCheck,
	// Skills (catalog)
	pdf: FileText,
	docx: FileText,
	xlsx: Sheet,
	pptx: Presentation,
	"webapp-testing": MonitorCheck,
	"mcp-builder": Plug,
	"frontend-design": LayoutDashboard,
	"canvas-design": Palette,
	"algorithmic-art": Shapes,
	"brand-guidelines": SwatchBook,
	"skill-creator": Sparkles,
};

/** Square brand badge for a catalog/server card. Monochrome (foreground on
 * muted) so it reads in both light and dark themes; prefers a simple-icons
 * brand glyph, then a lucide concept icon, then the first letter of the name. */
export function BrandIcon({
	iconKey,
	name,
}: {
	iconKey?: string;
	name: string;
}) {
	const glyph = iconKey ? ICONS[iconKey] : undefined;
	const Lucide = iconKey ? LUCIDE[iconKey] : undefined;
	return (
		<div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
			{glyph ? (
				<svg
					role="img"
					aria-hidden="true"
					viewBox="0 0 24 24"
					className="size-4 fill-foreground/80"
				>
					<path d={glyph.path} />
				</svg>
			) : Lucide ? (
				<Lucide className="size-4 text-foreground/80" strokeWidth={1.8} />
			) : (
				<span className="font-semibold text-muted-foreground text-small uppercase">
					{name.slice(0, 1)}
				</span>
			)}
		</div>
	);
}
