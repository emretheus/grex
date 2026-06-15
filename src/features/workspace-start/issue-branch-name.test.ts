import { describe, expect, it } from "vitest";
import type { RepositoryCreateOption } from "@/lib/api";
import type { ContextCard } from "@/lib/sources/types";
import { buildIssueBranchName, defaultBranchPrefix } from "./issue-branch-name";

function linearCard(overrides?: Partial<ContextCard>): ContextCard {
	return {
		id: "uuid-1",
		source: "linear",
		externalId: "ENG-123",
		externalUrl: "https://linear.app/acme/issue/ENG-123",
		title: "Fix the flaky login redirect!",
		lastActivityAt: 0,
		meta: {
			type: "linear",
			identifier: "ENG-123",
			priorityLabel: "Urgent",
			team: { name: "Engineering", key: "ENG" },
			labels: [],
		},
		...overrides,
	};
}

function repo(
	overrides?: Partial<RepositoryCreateOption>,
): RepositoryCreateOption {
	return {
		id: "r1",
		name: "acme",
		branchPrefixType: "username",
		forgeLogin: "emre",
		// Only the prefix-relevant fields matter for these helpers; the rest
		// of RepositoryCreateOption is irrelevant to branch naming.
		...overrides,
	} as RepositoryCreateOption;
}

describe("defaultBranchPrefix", () => {
	it("uses the forge login for the username prefix type", () => {
		expect(defaultBranchPrefix(repo({ branchPrefixType: "username" }))).toBe(
			"emre/",
		);
	});
	it("uses the custom literal for the custom type", () => {
		expect(
			defaultBranchPrefix(
				repo({ branchPrefixType: "custom", branchPrefixCustom: "feat/" }),
			),
		).toBe("feat/");
	});
	it("returns empty for the none type and for a null repo", () => {
		expect(defaultBranchPrefix(repo({ branchPrefixType: "none" }))).toBe("");
		expect(defaultBranchPrefix(null)).toBe("");
	});
});

describe("buildIssueBranchName", () => {
	it("derives `<prefix><identifier>-<title-slug>` from a Linear card", () => {
		expect(buildIssueBranchName(linearCard(), repo())).toBe(
			"emre/eng-123-fix-the-flaky-login-redirect",
		);
	});

	it("omits the prefix when the repo uses no prefix", () => {
		expect(
			buildIssueBranchName(linearCard(), repo({ branchPrefixType: "none" })),
		).toBe("eng-123-fix-the-flaky-login-redirect");
	});

	it("slugs special characters and collapses separators", () => {
		const card = linearCard({ title: "  Weird   ~Title!! (v2)  " });
		expect(buildIssueBranchName(card, repo({ branchPrefixType: "none" }))).toBe(
			"eng-123-weird-title-v2",
		);
	});

	it("caps the slug length and trims a trailing hyphen", () => {
		const card = linearCard({
			title: "a very long issue title that keeps going and going and going",
		});
		const branch = buildIssueBranchName(
			card,
			repo({ branchPrefixType: "none" }),
		);
		// Slug (excluding prefix) is capped at 48 chars and never ends in `-`.
		expect(branch.length).toBeLessThanOrEqual(48);
		expect(branch.endsWith("-")).toBe(false);
		expect(branch.startsWith("eng-123-")).toBe(true);
	});

	it("falls back to the externalId when the card isn't Linear", () => {
		const card = linearCard({
			meta: { type: "slack_thread" } as ContextCard["meta"],
			externalId: "#eng",
			title: "hi",
		});
		expect(buildIssueBranchName(card, repo({ branchPrefixType: "none" }))).toBe(
			"eng-hi",
		);
	});
});
