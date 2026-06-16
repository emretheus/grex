import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	type LexicalEditor,
} from "lexical";

/**
 * Append a Library prompt's text to the composer. Mirrors emdash: when the
 * composer already has content, the prompt is inserted *below* it (separated by
 * a blank line) rather than replacing it. Multi-line prompts become one
 * paragraph per line. Leaves the caret at the end and refocuses the editor.
 */
export function insertPromptText(editor: LexicalEditor, text: string): void {
	editor.update(() => {
		const root = $getRoot();
		const hasContent = root.getTextContent().trim().length > 0;

		const paragraphs = text.split("\n").map((line) => {
			const paragraph = $createParagraphNode();
			if (line.length > 0) paragraph.append($createTextNode(line));
			return paragraph;
		});

		if (hasContent) root.append($createParagraphNode());
		for (const paragraph of paragraphs) root.append(paragraph);

		paragraphs[paragraphs.length - 1]?.selectEnd();
	});
	editor.focus();
}
