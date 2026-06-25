import { describe, expect, test } from "bun:test";
import { ActiveTurnRegistry } from "./active-turn-registry.js";
import type { SidecarEmitter } from "./emitter.js";

function recordingEmitter() {
	const aborted: Array<{ requestId: string; reason: string }> = [];
	const ended: string[] = [];
	const errors: Array<{ requestId: string; message: string }> = [];
	const emitter = {
		aborted: (requestId: string, reason: string) =>
			aborted.push({ requestId, reason }),
		end: (requestId: string) => ended.push(requestId),
		error: (requestId: string, message: string) =>
			errors.push({ requestId, message }),
	} as unknown as SidecarEmitter;
	return { emitter, aborted, ended, errors };
}

describe("ActiveTurnRegistry", () => {
	test("activeSessionIds lists every live turn", () => {
		const registry = new ActiveTurnRegistry();
		expect(registry.activeSessionIds()).toEqual([]);
		registry.begin("s1", "r1", recordingEmitter().emitter, () => {});
		registry.begin("s2", "r2", recordingEmitter().emitter, () => {});
		expect(registry.activeSessionIds().sort()).toEqual(["s1", "s2"]);
		// Grex's `end` is single-arg.
		registry.end("s1");
		expect(registry.activeSessionIds()).toEqual(["s2"]);
	});

	// Backs the cascade fix: a worker-fatal scoped to one session must fail
	// ONLY that session's turn and leave siblings streaming.
	test("failOne fails only the target session and leaves siblings live", () => {
		const registry = new ActiveTurnRegistry();
		const a = recordingEmitter();
		const b = recordingEmitter();
		registry.begin("s1", "r1", a.emitter, () => {});
		registry.begin("s2", "r2", b.emitter, () => {});

		expect(registry.failOne("s1", "boom")).toBe("r1");
		expect(a.errors).toEqual([{ requestId: "r1", message: "boom" }]);
		expect(a.ended).toEqual(["r1"]);
		// Sibling untouched and still live.
		expect(b.errors).toEqual([]);
		expect(registry.activeSessionIds()).toEqual(["s2"]);
	});

	test("failOne is a no-op when the session has no live turn", () => {
		const registry = new ActiveTurnRegistry();
		expect(registry.failOne("ghost", "boom")).toBeNull();
	});
});
