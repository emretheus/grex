import { Check, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SUPPORTED_LANGUAGES } from "@/lib/i18n/locales";
import { useSettings } from "@/lib/settings";
import { cn } from "@/lib/utils";

/** Compact language switcher shown in the onboarding chrome so users can
 *  pick their language before they ever reach Settings. Reuses the same
 *  `language` setting the Appearance panel writes. */
export function LanguageMenu() {
	const { settings, updateSettings } = useSettings();
	const current = SUPPORTED_LANGUAGES.find((l) => l.code === settings.language);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="pointer-events-auto h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					<Languages className="size-3.5" strokeWidth={1.8} />
					<span className="text-ui">{current?.label ?? settings.language}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="min-w-40"
				onCloseAutoFocus={(event) => event.preventDefault()}
			>
				{SUPPORTED_LANGUAGES.map((language) => (
					<DropdownMenuItem
						key={language.code}
						onClick={() => void updateSettings({ language: language.code })}
						className="gap-2"
					>
						<Check
							className={cn(
								"size-3.5 shrink-0",
								language.code === settings.language
									? "opacity-100"
									: "opacity-0",
							)}
							strokeWidth={2}
						/>
						<span className="flex-1">{language.label}</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
