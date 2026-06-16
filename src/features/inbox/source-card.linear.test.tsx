import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { IssueInboxItem } from "@/lib/api";
import { ComposerInsertProvider } from "@/lib/composer-insert-context";
import { issueItemToContextCard } from "@/lib/sources/issue-card";
import { WorkspaceToastProvider } from "@/lib/workspace-toast-context";
import { SourceCard } from "./source-card";

// Regression gate: the `linear` ContextCard.source variant must map from a
// generic IssueInboxItem and render inside SourceCard without throwing. Linear
// cards reference the human identifier (`ENG-42`) rather than a `#NN`
// suffix, so `buildCardContextLabel`'s fallback branch is exercised here.

const issue: IssueInboxItem = {
	id: "uuid-1",
	connectionId: "org-1",
	provider: "linear",
	title: "Fix the flaky login redirect",
	externalId: "ENG-42",
	url: "https://linear.app/acme/issue/ENG-42",
	state: { label: "In Progress", tone: "open" },
	lastActivityAt: Date.now(),
	assigneeName: "Ada",
	meta: {
		type: "linear",
		identifier: "ENG-42",
		priorityLabel: "Urgent",
		team: { name: "Engineering", key: "ENG" },
		project: { name: "Q1 Auth", color: "#5e6ad2" },
		labels: [{ name: "bug", color: "#ff0000" }],
	},
};

describe("issueItemToContextCard (linear)", () => {
	it("maps a Linear issue into a linear-source ContextCard", () => {
		const card = issueItemToContextCard(issue);
		expect(card.source).toBe("linear");
		expect(card.externalId).toBe("ENG-42");
		expect(card.externalUrl).toBe(issue.url);
		expect(card.title).toBe(issue.title);
		expect(card.subtitle).toBe("Engineering");
		// The backend-supplied tone passes through to the shared palette.
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
		const card = issueItemToContextCard(issue);
		expect(card.meta).toMatchObject({ type: "linear", connectionId: "org-1" });
	});

	it("prefixes the subtitle with the workspace only when multiple connected", () => {
		// Single workspace (default): subtitle stays just the team name.
		expect(
			issueItemToContextCard(issue, { displayName: "Acme" }).subtitle,
		).toBe("Engineering");
		// More than one workspace connected: org name prefixes the team.
		expect(
			issueItemToContextCard(issue, {
				displayName: "Acme",
				showWorkspace: true,
			}).subtitle,
		).toBe("Acme · Engineering");
	});

	it("clamps an unknown tone to neutral", () => {
		const card = issueItemToContextCard({
			...issue,
			state: { label: "Weird", tone: "totally-made-up" },
		});
		expect(card.state?.tone).toBe("neutral");
	});

	it("renders the mapped card inside SourceCard", () => {
		render(
			<TooltipProvider delayDuration={0}>
				<WorkspaceToastProvider value={vi.fn()}>
					<ComposerInsertProvider value={vi.fn()}>
						<SourceCard card={issueItemToContextCard(issue)} />
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
