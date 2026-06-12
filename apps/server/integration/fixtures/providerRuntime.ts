import { EventId, RuntimeRequestId } from "@t3tools/contracts";
import type { LegacyProviderRuntimeEvent } from "../TestProviderAdapter.integration.ts";

const PROVIDER = "codex" as const;
const SESSION_ID = "fixture-session";
const THREAD_ID = "fixture-thread";
const TURN_ID = "fixture-turn";
const REQUEST_ID = RuntimeRequestId.makeUnsafe("req-1");

function baseEvent(
  eventId: string,
  createdAt: string,
): Pick<LegacyProviderRuntimeEvent, "eventId" | "provider" | "sessionId" | "createdAt"> {
  return {
    eventId: EventId.makeUnsafe(eventId),
    provider: PROVIDER,
    sessionId: SESSION_ID,
    createdAt,
  };
}

export const codexTurnTextFixture = [
  {
    type: "turn.started",
    ...baseEvent("evt-1", "2026-02-23T00:00:00.000Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {},
  },
  {
    type: "content.delta",
    ...baseEvent("evt-2", "2026-02-23T00:00:00.100Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {
      streamKind: "assistant_text",
      delta: "I will make a small update.\n",
    },
  },
  {
    type: "content.delta",
    ...baseEvent("evt-3", "2026-02-23T00:00:00.200Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {
      streamKind: "assistant_text",
      delta: "Done.\n",
    },
  },
  {
    type: "turn.completed",
    ...baseEvent("evt-4", "2026-02-23T00:00:00.300Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {
      state: "completed",
    },
  },
] satisfies ReadonlyArray<LegacyProviderRuntimeEvent>;

export const codexTurnToolFixture = [
  {
    type: "turn.started",
    ...baseEvent("evt-11", "2026-02-23T00:01:00.000Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {},
  },
  {
    type: "item.started",
    ...baseEvent("evt-12", "2026-02-23T00:01:00.100Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {
      itemType: "command_execution",
      title: "Ran command",
      detail: "echo integration",
    },
  },
  {
    type: "item.completed",
    ...baseEvent("evt-13", "2026-02-23T00:01:00.200Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {
      itemType: "command_execution",
      status: "completed",
      title: "Ran command",
      detail: "echo integration",
    },
  },
  {
    type: "content.delta",
    ...baseEvent("evt-14", "2026-02-23T00:01:00.300Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {
      streamKind: "assistant_text",
      delta: "Applied the requested edit.\n",
    },
  },
  {
    type: "turn.completed",
    ...baseEvent("evt-15", "2026-02-23T00:01:00.400Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {
      state: "completed",
    },
  },
] satisfies ReadonlyArray<LegacyProviderRuntimeEvent>;

const GOOSE_PROVIDER = "goose" as const;

function gooseBaseEvent(
  eventId: string,
  createdAt: string,
): Pick<LegacyProviderRuntimeEvent, "eventId" | "provider" | "sessionId" | "createdAt"> {
  return {
    eventId: EventId.makeUnsafe(eventId),
    provider: GOOSE_PROVIDER,
    sessionId: SESSION_ID,
    createdAt,
  };
}

export const gooseTurnTextFixture = [
  {
    type: "turn.started",
    ...gooseBaseEvent("evt-goose-1", "2026-02-23T00:10:00.000Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {},
  },
  {
    type: "content.delta",
    ...gooseBaseEvent("evt-goose-2", "2026-02-23T00:10:00.100Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {
      streamKind: "assistant_text",
      delta: "Goose is ready to help.\n",
    },
  },
  {
    type: "content.delta",
    ...gooseBaseEvent("evt-goose-3", "2026-02-23T00:10:00.200Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {
      streamKind: "assistant_text",
      delta: "Task completed.\n",
    },
  },
  {
    type: "turn.completed",
    ...gooseBaseEvent("evt-goose-4", "2026-02-23T00:10:00.300Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {
      state: "completed",
    },
  },
] satisfies ReadonlyArray<LegacyProviderRuntimeEvent>;

export const gooseTurnToolFixture = [
  {
    type: "turn.started",
    ...gooseBaseEvent("evt-goose-11", "2026-02-23T00:11:00.000Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {},
  },
  {
    type: "item.started",
    ...gooseBaseEvent("evt-goose-12", "2026-02-23T00:11:00.100Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {
      itemType: "command_execution",
      title: "Running goose task",
      detail: "goose run build",
    },
  },
  {
    type: "item.completed",
    ...gooseBaseEvent("evt-goose-13", "2026-02-23T00:11:00.200Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {
      itemType: "command_execution",
      status: "completed",
      title: "Running goose task",
      detail: "goose run build",
    },
  },
  {
    type: "content.delta",
    ...gooseBaseEvent("evt-goose-14", "2026-02-23T00:11:00.300Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {
      streamKind: "assistant_text",
      delta: "Build completed successfully.\n",
    },
  },
  {
    type: "turn.completed",
    ...gooseBaseEvent("evt-goose-15", "2026-02-23T00:11:00.400Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {
      state: "completed",
    },
  },
] satisfies ReadonlyArray<LegacyProviderRuntimeEvent>;

export const codexTurnApprovalFixture = [
  {
    type: "turn.started",
    ...baseEvent("evt-21", "2026-02-23T00:02:00.000Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {},
  },
  {
    type: "request.opened",
    ...baseEvent("evt-22", "2026-02-23T00:02:00.100Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    requestId: REQUEST_ID,
    payload: {
      requestType: "command_execution_approval",
      detail: "Please approve command",
    },
  },
  {
    type: "request.resolved",
    ...baseEvent("evt-23", "2026-02-23T00:02:00.200Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    requestId: REQUEST_ID,
    payload: {
      requestType: "command_execution_approval",
      decision: "accept",
    },
  },
  {
    type: "content.delta",
    ...baseEvent("evt-24", "2026-02-23T00:02:00.300Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {
      streamKind: "assistant_text",
      delta: "Approval received and command executed.\n",
    },
  },
  {
    type: "turn.completed",
    ...baseEvent("evt-25", "2026-02-23T00:02:00.400Z"),
    threadId: THREAD_ID,
    turnId: TURN_ID,
    payload: {
      state: "completed",
    },
  },
] satisfies ReadonlyArray<LegacyProviderRuntimeEvent>;
