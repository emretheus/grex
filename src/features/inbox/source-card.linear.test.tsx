import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { LinearInboxItem } from "@/lib/api";
import { ComposerInsertProvider } from "@/lib/composer-insert-context";
import { WorkspaceToastProvider } from "@/lib/workspace-toast-context";
import { linearItemToContextCard } from "./linear-inbox-section";
import { SourceCard } from "./source-card";

// Regression gate: the `linear` ContextCard.source variant must map from a
// LinearInboxItem and render inside SourceCard without throwing. Linear
// cards reference the human identifier (`ENG-42`) rather than a `#NN`
// suffix, so `buildCardContextLabel`'s fallback branch is exercised here.

const issue: LinearInboxItem = {
	id: "uuid-1",
	connectionId: "org-1",
	identifier: "ENG-42",
	title: "Fix the flaky login redirect",
	url: "https://linear.app/acme/issue/ENG-42",
	stateName: "In Progress",
	stateType: "started",
	priority: 1,
	priorityLabel: "Urgent",
	teamName: "Engineering",
	teamKey: "ENG",
	project: { name: "Q1 Auth", color: "#5e6ad2" },
	labels: [{ name: "bug", color: "#ff0000" }],
	lastActivityAt: Date.now(),
	assigneeName: "Ada",
};

describe("linearItemToContextCard", () => {
	it("maps a Linear issue into a linear-source ContextCard", () => {
		const card = linearItemToContextCard(issue);
		expect(card.source).toBe("linear");
		expect(card.externalId).toBe("ENG-42");
		expect(card.externalUrl).toBe(issue.url);
		expect(card.title).toBe(issue.title);
		expect(card.subtitle).toBe("Engineering");
		// `started` collapses onto the "open" tone in the shared palette.
		expect(card.state).toEqual({ label: "In Progress", tone: "open" });
		expect(card.meta).toMatchObject({
			type: "linear",
			identifier: "ENG-42",
			priorityLabel: "Urgent",
			team: { name: "Engineering", key: "ENG" },
			project: { name: "Q1 Auth", color: "#5e6ad2" },
		});
	});

	it("carries the connection id into the card meta for detail routing", () => {
		const card = linearItemToContextCard(issue);
		expect(card.meta).toMatchObject({ type: "linear", connectionId: "org-1" });
	});

	it("prefixes the subtitle with the workspace only when multiple connected", () => {
		// Single workspace (default): subtitle stays just the team name.
		expect(
			linearItemToContextCard(issue, { workspaceName: "Acme" }).subtitle,
		).toBe("Engineering");
		// More than one workspace connected: org name prefixes the team.
		expect(
			linearItemToContextCard(issue, {
				workspaceName: "Acme",
				showWorkspace: true,
			}).subtitle,
		).toBe("Acme · Engineering");
	});

	it("maps workflow-state categories onto the shared tone palette", () => {
		const tones = (stateType: string) =>
			linearItemToContextCard({ ...issue, stateType }).state?.tone;
		expect(tones("completed")).toBe("merged");
		expect(tones("canceled")).toBe("closed");
		expect(tones("backlog")).toBe("neutral");
		expect(tones("triage")).toBe("neutral");
	});

	it("renders the mapped card inside SourceCard", () => {
		render(
			<TooltipProvider delayDuration={0}>
				<WorkspaceToastProvider value={vi.fn()}>
					<ComposerInsertProvider value={vi.fn()}>
						<SourceCard card={linearItemToContextCard(issue)} />
					</ComposerInsertProvider>
				</WorkspaceToastProvider>
			</TooltipProvider>,
		);

		expect(screen.getByText("ENG-42")).toBeInTheDocument();
		expect(screen.getByText(/flaky login redirect/)).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Add to context" }),
		).toBeInTheDocument();
	});
});
