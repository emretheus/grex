import { getRepoData } from "@/lib/github";
import "./marketing.css";
import { MarketingShell } from "./marketing-shell";

// Static export: this page is rendered once at build time, so `getRepoData()`
// runs during the build and bakes the release / version / commit into the
// static HTML. The deploy workflow rebuilds when the "Publish Release"
// workflow completes (deploy-marketing.yml `workflow_run` trigger), which
// keeps those values current without a runtime revalidation server.
export default async function HomePage() {
	const data = await getRepoData();
	return <MarketingShell data={data} />;
}
