/**
 * DB-truth rehydration for a stuck "Awaiting answer" question.
 *
 * The interactive AskUserQuestion / elicitation panel is driven by the
 * in-memory `pendingUserInput` zustand slice, which is populated ONLY by a
 * live `userInputRequest` stream event (see `dispatch-stream-event.ts`). That
 * slice does not survive a webview reload, and `useWatchSessionStream`
 * deliberately ignores `userInputRequest` for turns this client didn't start.
 *
 * So after a reload / re-attach the user is left with the read-only
 * "Question — Awaiting answer" transcript card (rendered from the persisted
 * thread) but NO way to answer — the turn is still parked in the sidecar
 * waiting on the user, forever.
 *
 * This hook reconciles the two. When the displayed session's persisted thread
 * ends in a `user-question` part that is still `pending`, and there is no live
 * `pendingUserInput` for the context, it reconstructs a `PendingUserInput`
 * from the persisted part so the interactive panel reappears. The panel's
 * answer routes back by `userInputId` (the persisted part's `id` IS the
 * tool-use id the sidecar keys its parked waiter on), so submitting resumes
 * the parked turn exactly as the live path would have.
 *
 * It also clears a now-stale live `pendingUserInput` when the persisted
 * question has flipped away from `pending` (e.g. answered from another window
 * / the mobile companion), so a resolved panel doesn't linger.
 */

import { useEffect } from "react";
import type { PendingUserInput } from "@/features/conversation/pending-user-input";
import { useStreamingStore } from "@/features/conversation/state/streaming-store";
import type {
	AgentProvider,
	ExtendedMessagePart,
	ThreadMessageLike,
	UserQuestionPart,
} from "@/lib/api";

/**
 * How far back from the tail to look for the question. A pending (or
 * just-resolved) question always lives in one of the last few assistant
 * turns; bounding the scan keeps it cheap even when the effect re-runs on
 * every streaming frame for a long thread.
 */
const MAX_LOOKBACK_MESSAGES = 15;

function isUserQuestionPart(
	part: ExtendedMessagePart,
): part is UserQuestionPart {
	return (
		typeof part === "object" &&
		part !== null &&
		(part as { type?: unknown }).type === "user-question" &&
		Array.isArray((part as { questions?: unknown }).questions)
	);
}

/**
 * Walk the thread from the tail and return the user-question parts in the
 * most recent message that has any. One-question-at-a-time is the invariant,
 * so this is the active question's message (whether still pending or freshly
 * resolved). Returns an empty array when none is found within the lookback.
 */
function findTrailingUserQuestions(
	messages: readonly ThreadMessageLike[],
): UserQuestionPart[] {
	const floor = Math.max(0, messages.length - MAX_LOOKBACK_MESSAGES);
	for (let i = messages.length - 1; i >= floor; i--) {
		const parts = messages[i]?.content;
		if (!Array.isArray(parts)) continue;
		const found = parts.filter(isUserQuestionPart);
		if (found.length > 0) return found;
	}
	return [];
}

type RehydrateArgs = {
	contextKey: string;
	sessionId: string | null;
	/** Pipeline-rendered thread for the displayed session (React Query data). */
	threadMessages: readonly ThreadMessageLike[] | undefined;
	/** Best-effort streaming context — only `userInputId` matters for routing
	 *  the answer back; the rest is filled in so the panel renders cleanly. */
	provider: AgentProvider | null;
	modelId: string | null;
	workingDirectory: string | null;
};

function buildFromPart(
	part: UserQuestionPart,
	ctx: {
		provider: AgentProvider | null;
		modelId: string | null;
		workingDirectory: string | null;
		providerSessionId: string | null;
	},
): PendingUserInput | null {
	if (!part.id || part.questions.length === 0) return null;
	const modelId = ctx.modelId ?? "";
	return {
		// Claude is the only provider that persists a still-`pending`
		// question (Codex/OpenCode persist only after the user answers), so
		// it's the correct fallback when the displayed model is unknown.
		provider: ctx.provider ?? "claude",
		modelId,
		resolvedModel: modelId,
		providerSessionId: ctx.providerSessionId,
		workingDirectory: ctx.workingDirectory ?? "",
		permissionMode: null,
		userInputId: part.id,
		source: part.source || "Claude",
		message: "Awaiting your answer.",
		payload: {
			kind: "ask-user-question",
			// The persisted questions are already in the canonical
			// `UserQuestionItem` shape — identical to what the live wire
			// payload carries (the Rust bridge normalizes before emitting),
			// so the renderer's view-model builder consumes them unchanged.
			questions: part.questions as unknown as Array<Record<string, unknown>>,
		},
	};
}

export function useRehydratePendingUserInput({
	contextKey,
	sessionId,
	threadMessages,
	provider,
	modelId,
	workingDirectory,
}: RehydrateArgs): void {
	const setPendingUserInput = useStreamingStore(
		(state) => state.setPendingUserInput,
	);

	useEffect(() => {
		if (!sessionId || !threadMessages || threadMessages.length === 0) return;

		const trailing = findTrailingUserQuestions(threadMessages);
		// Read the rest of the store imperatively: this reconciliation is
		// driven by the thread changing (DB refresh), not by store writes, so
		// subscribing to these slices would only add render churn.
		const store = useStreamingStore.getState();
		const live = store.pendingUserInputByContext[contextKey] ?? null;

		if (live) {
			// A live panel is up. Only intervene to retire it once the DB
			// confirms its question is no longer pending (answered/declined/
			// cancelled elsewhere). If the matching part isn't in the thread
			// yet (the live event can outrun its persisted row), leave it be.
			const matching = trailing.find((part) => part.id === live.userInputId);
			if (matching && matching.status !== "pending") {
				setPendingUserInput(contextKey, null);
			}
			return;
		}

		// No live panel. Resurrect it from a still-pending persisted question
		// unless the user already acted on it this session.
		const pending = trailing.find((part) => part.status === "pending");
		if (!pending || store.resolvedUserInputIds.has(pending.id)) return;

		const rebuilt = buildFromPart(pending, {
			provider,
			modelId,
			workingDirectory,
			providerSessionId:
				store.liveSessionsByContext[contextKey]?.providerSessionId ?? null,
		});
		if (rebuilt) {
			setPendingUserInput(contextKey, rebuilt);
		}
	}, [
		contextKey,
		sessionId,
		threadMessages,
		provider,
		modelId,
		workingDirectory,
		setPendingUserInput,
	]);
}

// Exported for unit tests.
export const __test = {
	findTrailingUserQuestions,
	buildFromPart,
	MAX_LOOKBACK_MESSAGES,
};
