import {
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
	getCliStatus: vi.fn(),
	getGrexSkillsStatus: vi.fn(),
	installCli: vi.fn(),
	installGrexSkills: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/api")>();
	return {
		...actual,
		getCliStatus: apiMocks.getCliStatus,
		getGrexSkillsStatus: apiMocks.getGrexSkillsStatus,
		installCli: apiMocks.installCli,
		installGrexSkills: apiMocks.installGrexSkills,
	};
});

vi.mock("sonner", () => ({
	toast: vi.fn(),
}));

import { SkillsStep } from "./skills-step";

describe("SkillsStep", () => {
	beforeEach(() => {
		apiMocks.getCliStatus.mockReset();
		apiMocks.getGrexSkillsStatus.mockReset();
		apiMocks.installCli.mockReset();
		apiMocks.installGrexSkills.mockReset();
		// Default: skills not installed yet, default install call succeeds.
		// Individual tests override these per scenario.
		apiMocks.getGrexSkillsStatus.mockResolvedValue({
			installed: false,
			claude: false,
			codex: false,
			command:
				"npx --yes skills add emretheus/grex/.agents/skills/grex-cli -g -s grex-cli -y --copy -a claude-code -a codex",
		});
		apiMocks.installGrexSkills.mockResolvedValue({
			installed: true,
			claude: true,
			codex: true,
			command:
				"npx --yes skills add emretheus/grex/.agents/skills/grex-cli -g -s grex-cli -y --copy -a claude-code -a codex",
		});
	});

	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	// --- already-installed paths --------------------------------------

	it("shows Ready and skips install when the Grex CLI is already installed", async () => {
		apiMocks.getCliStatus.mockResolvedValue({
			installed: true,
			installPath: "/usr/local/bin/grex-dev",
			buildMode: "development",
			installState: "managed",
		});
		apiMocks.getGrexSkillsStatus.mockResolvedValue({
			installed: true,
			claude: true,
			codex: true,
			command: "",
		});

		render(
			<SkillsStep
				step="skills"
				onBack={vi.fn()}
				onNext={vi.fn()}
				isRoutingImport={false}
			/>,
		);

		const cliItem = screen.getByRole("group", { name: "Grex CLI" });

		await waitFor(() => {
			expect(within(cliItem).getByText("Ready")).toBeInTheDocument();
		});
		// No retry button surfaces — the install hook never fires for an
		// already-managed CLI.
		expect(
			within(cliItem).queryByRole("button", { name: "Retry" }),
		).not.toBeInTheDocument();
		expect(apiMocks.installCli).not.toHaveBeenCalled();
	});

	// --- silent-auto-install happy paths ------------------------------

	it("auto-installs the Grex CLI on mount when missing", async () => {
		apiMocks.getCliStatus.mockResolvedValue({
			installed: false,
			installPath: null,
			buildMode: "development",
			installState: "missing",
		});
		apiMocks.installCli.mockResolvedValue({
			installed: true,
			installPath: "/usr/local/bin/grex-dev",
			buildMode: "development",
			installState: "managed",
		});

		render(
			<SkillsStep
				step="skills"
				onBack={vi.fn()}
				onNext={vi.fn()}
				isRoutingImport={false}
			/>,
		);

		const cliItem = screen.getByRole("group", { name: "Grex CLI" });

		// Install fires WITHOUT any click — the auto-install effect
		// kicks in once the status probe resolves.
		await waitFor(() => {
			expect(apiMocks.installCli).toHaveBeenCalledTimes(1);
		});
		await waitFor(() => {
			expect(within(cliItem).getByText("Ready")).toBeInTheDocument();
		});
		expect(
			within(cliItem).queryByRole("button", { name: "Retry" }),
		).not.toBeInTheDocument();
	});

	it("auto-installs Grex Skills on mount when missing", async () => {
		apiMocks.getCliStatus.mockResolvedValue({
			installed: true,
			installPath: "/usr/local/bin/grex-dev",
			buildMode: "development",
			installState: "managed",
		});

		render(
			<SkillsStep
				step="skills"
				onBack={vi.fn()}
				onNext={vi.fn()}
				isRoutingImport={false}
			/>,
		);

		const skillsItem = screen.getByRole("group", {
			name: "Grex Skills (Beta)",
		});

		await waitFor(() => {
			expect(apiMocks.installGrexSkills).toHaveBeenCalledTimes(1);
		});
		await waitFor(() => {
			expect(within(skillsItem).getByText("Ready")).toBeInTheDocument();
		});
	});

	// --- failure + retry path ----------------------------------------

	it("surfaces the failure hint and exposes a Retry button when skills install throws", async () => {
		const user = userEvent.setup();
		apiMocks.getCliStatus.mockResolvedValue({
			installed: true,
			installPath: "/usr/local/bin/grex-dev",
			buildMode: "development",
			installState: "managed",
		});
		// First call fails; the retry call succeeds.
		apiMocks.installGrexSkills
			.mockRejectedValueOnce(
				new Error("Grex skills setup failed with a long stack trace."),
			)
			.mockResolvedValueOnce({
				installed: true,
				claude: true,
				codex: true,
				command: "",
			});

		render(
			<SkillsStep
				step="skills"
				onBack={vi.fn()}
				onNext={vi.fn()}
				isRoutingImport={false}
			/>,
		);

		const skillsItem = screen.getByRole("group", {
			name: "Grex Skills (Beta)",
		});

		// The auto-install fires once on mount and fails — the user-
		// facing error is the unified, sanitised hint (no raw stack).
		await waitFor(() => {
			expect(
				within(skillsItem).getByText(/something went wrong/i),
			).toBeInTheDocument();
		});
		expect(within(skillsItem).getByText(/don't worry/i)).toBeInTheDocument();
		expect(
			within(skillsItem).queryByText(/long stack trace/i),
		).not.toBeInTheDocument();

		// Retry button is the recovery path the user can click.
		const retryBtn = await within(skillsItem).findByRole("button", {
			name: "Retry",
		});
		await user.click(retryBtn);

		await waitFor(() => {
			expect(apiMocks.installGrexSkills).toHaveBeenCalledTimes(2);
		});
		await waitFor(() => {
			expect(within(skillsItem).getByText("Ready")).toBeInTheDocument();
		});
	});
});
