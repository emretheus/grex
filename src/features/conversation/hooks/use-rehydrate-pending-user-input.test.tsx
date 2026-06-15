import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { ThreadMessageLike, UserQuestionPart } from "@/lib/api";
import {
	__resetStreamingStoreForTests,
	useStreamingStore,
} from "../state/streaming-store";
import {
	__test,
	useRehydratePendingUserInput,
} from "./use-rehydrate-pending-user-input";

const CONTEXT = "session:s1";
const SESSION = "s1";

function questionPart(
	overrides: Partial<UserQuestionPart> = {},
): UserQuestionPart {
	return {
		type: "user-question",
		id: "tu-1",
		source: "Claude",
		status: "pending",
		questions: [
			{
				question: "Pick a color",
				options: [{ label: "Red" }, { label: "Blue" }],
				multiSelect: false,
			},
		],
		...overrides,
	};
}

function assistantMessage(
	parts: ThreadMessageLike["content"],
): ThreadMessageLike {
	return { role: "assistant", id: "m1", content: parts };
}

function thread(part = questionPart()): ThreadMessageLike[] {
	return [
		{
			role: "user",
			id: "u1",
			content: [{ type: "text", id: "t0", text: "hi" }],
		},
		assistantMessage([{ type: "text", id: "t1", text: "Let me ask." }, part]),
	];
}

function rehydrate(threadMessages: ThreadMessageLike[] | undefined) {
	return renderHook(() =>
		useRehydratePendingUserInput({
			contextKey: CONTEXT,
			sessionId: SESSION,
			threadMessages,
			provider: "claude",
			modelId: "opus",
			workingDirectory: "/tmp",
		}),
	);
}

describe("findTrailingUserQuestions", () => {
	it("returns the question parts from the most recent message that has any", () => {
		const found = __test.findTrailingUserQuestions(thread());
		expect(found).toHaveLength(1);
		expect(found[0].id).toBe("tu-1");
	});

	it("returns empty when there is no question", () => {
		const found = __test.findTrailingUserQuestions([
			{
				role: "user",
				id: "u1",
				content: [{ type: "text", id: "t0", text: "hi" }],
			},
		]);
		expect(found).toEqual([]);
	});

	it("ignores questions older than the lookback window", () => {
		const filler: ThreadMessageLike[] = Array.from(
			{ length: __test.MAX_LOOKBACK_MESSAGES + 2 },
			(_, i) => ({
				role: "assistant" as const,
				id: `f${i}`,
				content: [{ type: "text", id: "tx", text: "x" }],
			}),
		);
		const messages = [assistantMessage([questionPart()]), ...filler];
		expect(__test.findTrailingUserQuestions(messages)).toEqual([]);
	});
});

describe("buildFromPart", () => {
	it("routes by the persisted question id and passes questions through", () => {
		const built = __test.buildFromPart(questionPart(), {
			provider: "claude",
			modelId: "opus",
			workingDirectory: "/tmp",
			providerSessionId: "prov-1",
		});
		expect(built).not.toBeNull();
		expect(built?.userInputId).toBe("tu-1");
		expect(built?.payload.kind).toBe("ask-user-question");
		expect(built?.providerSessionId).toBe("prov-1");
	});

	it("returns null when the part has no id or no questions", () => {
		expect(
			__test.buildFromPart(questionPart({ id: "" }), {
				provider: "claude",
				modelId: null,
				workingDirectory: null,
				providerSessionId: null,
			}),
		).toBeNull();
		expect(
			__test.buildFromPart(questionPart({ questions: [] }), {
				provider: "claude",
				modelId: null,
				workingDirectory: null,
				providerSessionId: null,
			}),
		).toBeNull();
	});
});

describe("useRehydratePendingUserInput", () => {
	beforeEach(() => {
		__resetStreamingStoreForTests();
	});

	const live = () =>
		useStreamingStore.getState().pendingUserInputByContext[CONTEXT] ?? null;

	it("rebuilds the panel from a pending persisted question", () => {
		rehydrate(thread());
		expect(live()?.userInputId).toBe("tu-1");
	});

	it("does nothing when there is no pending question", () => {
		rehydrate(thread(questionPart({ status: "answered" })));
		expect(live()).toBeNull();
	});

	it("does not resurrect a question the user already acted on", () => {
		useStreamingStore.getState().markUserInputResolved("tu-1");
		rehydrate(thread());
		expect(live()).toBeNull();
	});

	it("leaves an existing live panel untouched", () => {
		const existing = __test.buildFromPart(questionPart(), {
			provider: "claude",
			modelId: "opus",
			workingDirectory: "/tmp",
			providerSessionId: null,
		});
		useStreamingStore.getState().setPendingUserInput(CONTEXT, existing);
		rehydrate(thread());
		expect(live()).toBe(existing);
	});

	it("clears a stale live panel once the question is resolved in the DB", () => {
		const existing = __test.buildFromPart(questionPart(), {
			provider: "claude",
			modelId: "opus",
			workingDirectory: "/tmp",
			providerSessionId: null,
		});
		useStreamingStore.getState().setPendingUserInput(CONTEXT, existing);
		rehydrate(thread(questionPart({ status: "answered" })));
		expect(live()).toBeNull();
	});
});
