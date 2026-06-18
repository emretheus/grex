import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	type Automation,
	type AutomationStatus,
	type CreateAutomationRequest,
	createAutomation,
	deleteAutomation,
	runAutomationNow,
	setAutomationStatus,
	type UpdateAutomationRequest,
	updateAutomation,
} from "@/lib/api";
import { i18n } from "@/lib/i18n";
import { grexQueryKeys } from "@/lib/query-client";

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Mutations shared by the list rows, the detail view and the create
 *  dialog. The backend also pushes `automationsChanged` ui-sync events
 *  that invalidate the query globally; we still invalidate locally so
 *  the UI snaps without waiting for the broadcast round-trip. */
export function useAutomationMutations() {
	const queryClient = useQueryClient();

	const invalidate = () => {
		void queryClient.invalidateQueries({
			queryKey: grexQueryKeys.automations,
		});
	};

	const replaceInCache = (updated: Automation) => {
		queryClient.setQueryData<Automation[]>(grexQueryKeys.automations, (prev) =>
			prev?.map((automation) =>
				automation.id === updated.id ? updated : automation,
			),
		);
	};

	const create = useMutation({
		mutationFn: (request: CreateAutomationRequest) => createAutomation(request),
		onSuccess: invalidate,
		onError: (error) =>
			toast.error(i18n.t("automations:toast.createFailed"), {
				description: errorMessage(error),
			}),
	});

	const update = useMutation({
		mutationFn: (request: UpdateAutomationRequest) => updateAutomation(request),
		onSuccess: (updated) => {
			replaceInCache(updated);
			invalidate();
		},
		onError: (error) =>
			toast.error(i18n.t("automations:toast.updateFailed"), {
				description: errorMessage(error),
			}),
	});

	const remove = useMutation({
		mutationFn: (automationId: string) => deleteAutomation(automationId),
		onSuccess: invalidate,
		onError: (error) =>
			toast.error(i18n.t("automations:toast.deleteFailed"), {
				description: errorMessage(error),
			}),
	});

	const setStatus = useMutation({
		mutationFn: (input: { automationId: string; status: AutomationStatus }) =>
			setAutomationStatus(input.automationId, input.status),
		onSuccess: (updated) => {
			replaceInCache(updated);
			invalidate();
		},
		onError: (error) =>
			toast.error(i18n.t("automations:toast.statusFailed"), {
				description: errorMessage(error),
			}),
	});

	const runNow = useMutation({
		mutationFn: (automationId: string) => runAutomationNow(automationId),
		onSuccess: invalidate,
		onError: (error) =>
			toast.error(i18n.t("automations:toast.runFailed"), {
				description: errorMessage(error),
			}),
	});

	return { create, update, remove, setStatus, runNow };
}
