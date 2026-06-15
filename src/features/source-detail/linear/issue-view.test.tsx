import { describe, expect, it } from "vitest";
import type { LinearIssueDetail } from "@/lib/api";
import type { ContextCard } from "@/lib/sources/types";
import { buildLinearStartInsert } from "./issue-view";

const card: ContextCard = {
	id: "uuid-1",
	source: "linear",
	externalId: "ENG-42",
	externalUrl: "https://linear.app/acme/issue/ENG-42",
	title: "Fix the thing",
	state: { label: "In Progress", tone: "open" },
	lastActivityAt: 0,
	meta: {
		type: "linear",
		identifier: "ENG-42",
		priorityLabel: "Urgent",
		team: { name: "Engineering", key: "ENG" },
		labels: [
			{ name: "bug", color: "#f00" },
			{ name: "p1", color: "#0f0" },
		],
	},
};

const detail: LinearIssueDetail = {
	id: "uuid-1",
	identifier: "ENG-42",
	title: "Fix the thing",
	description: "Steps to reproduce:\n1. Do X\n2. See crash",
	url: card.externalUrl,
	stateName: "In Progress",
	stateType: "started",
	priority: 1,
	priorityLabel: "Urgent",
	teamName: "Engineering",
	teamKey: "ENG",
	labels: [],
	lastActivityAt: 0,
};

describe("buildLinearStartInsert", () => {
	it("packs identifier, url, meta, and description into the submit text", () => {
		const request = buildLinearStartInsert(card, detail, {
			contextKey: "start:repo:r1",
		});
		expect(request.behavior).toBe("append");
		expect(request.target).toEqual({ contextKey: "start:repo:r1" });
		expect(request.items).toHaveLength(1);
		const item = request.items[0];
		expect(item.kind).toBe("custom-tag");
		expect(item.submitText).toContain("Linear issue ENG-42: Fix the thing");
		expect(item.submitText).toContain(`URL: ${card.externalUrl}`);
		expect(item.submitText).toContain("Team: Engineering");
		expect(item.submitText).toContain("Priority: Urgent");
		expect(item.submitText).toContain("Labels: bug, p1");
		expect(item.submitText).toContain("Steps to reproduce:");
		expect(item.key).toBe("linear-start:uuid-1");
		expect(item.source).toBe("linear");
	});

	it("omits the body block when no description is loaded yet", () => {
		const request = buildLinearStartInsert(card, null);
		const item = request.items[0];
		expect(item.submitText).toContain("Linear issue ENG-42");
		expect(item.submitText).not.toContain("Steps to reproduce");
		// No trailing blank-line block when there's no body.
		expect(item.submitText.endsWith("\n\n")).toBe(false);
	});
});
