import assert from "node:assert/strict";
import test from "node:test";
import {
	applyReplacements,
	buildDryRunMarkdownLink,
	extractExternalLinks,
} from "../src/features/linkRewrite";
import { DEFAULT_SETTINGS } from "../src/settings/defaults";
import { sanitizeSettings } from "../src/services/extensionPolicy";
import { parseLocalFileSource } from "../src/services/localFileSource";

test("extractExternalLinks handles markdown, html media, raw URLs, and data URIs", () => {
	const content = [
		"![cover|320](https://example.com/cover(one).png \"title\")",
		"[manual](https://example.com/manual.pdf)",
		"<img alt=\"x\" src=\"https://cdn.example.com/photo.avif\">",
		"https://example.com/raw.mp3",
		"![inline](data:image/png;base64,AAAA)",
		"`https://example.com/code.png`",
		"```",
		"https://example.com/fenced.png",
		"```",
	].join("\n");

	const matches = extractExternalLinks(content);
	assert.deepEqual(
		matches.map((match) => [match.kind, match.source, match.url]),
		[
			["embed", "remote", "https://example.com/cover(one).png"],
			["link", "remote", "https://example.com/manual.pdf"],
			["html-media", "remote", "https://cdn.example.com/photo.avif"],
			["raw", "remote", "https://example.com/raw.mp3"],
			["embed", "data-uri", "data:image/png;base64,AAAA"],
		]
	);
	assert.equal(matches[0]?.sizeOrAlias, "320");
});

test("buildDryRunMarkdownLink preserves embed size and link aliases", () => {
	const [embed, link] = extractExternalLinks(
		"![cover|480](https://example.com/a.png)\n[Read me](https://example.com/a.pdf)"
	);

	assert.ok(embed);
	assert.ok(link);
	assert.equal(buildDryRunMarkdownLink(embed, "note-1.png", true), "![[note-1.png|480]]");
	assert.equal(buildDryRunMarkdownLink(link, "note-2.pdf", true), "[[note-2.pdf|Read me]]");
});

test("applyReplacements applies ranges from the end of the document", () => {
	const content = "A https://example.com/a.png B https://example.com/b.png";
	const matches = extractExternalLinks(content);
	const updated = applyReplacements(
		content,
		matches.map((match, index) => ({
			startIndex: match.startIndex,
			endIndex: match.endIndex,
			replacementText: `[[file-${index + 1}.png]]`,
		}))
	);

	assert.equal(updated, "A [[file-1.png]] B [[file-2.png]]");
});

test("sanitizeSettings preserves the default attachment mode and repairs custom paths", () => {
	const defaultResult = sanitizeSettings(DEFAULT_SETTINGS);
	assert.equal(defaultResult.settings.attachmentFolderMode, "obsidian-default");

	const customResult = sanitizeSettings({
		...DEFAULT_SETTINGS,
		attachmentFolderMode: "custom",
		customAttachmentFolder: "/Assets//Imported/",
	});
	assert.equal(customResult.settings.customAttachmentFolder, "Assets/Imported");
});

test("extractExternalLinks recognizes absolute and Obsidian app local file sources", () => {
	const content = [
		"![](/Users/jaewone/Downloads/Kafka Producer-1.png)",
		"![](/Users/jaewone/Library/Mobile\\ Documents/iCloud\\~md\\~obsidian/Documents/JaewonE/00.Assets/Kafka\\ Producer-1.png)",
		"![](app://23874f0dfb64db9d6e44685b6a028c8c7ff6/Users/jaewone/Library/Mobile%20Documents/iCloud~md~obsidian/Documents/JaewonE/00.Assets/Kafka%20Producer-1.png?1783049791373)",
	].join("\n");

	const matches = extractExternalLinks(content);
	assert.deepEqual(matches.map((match) => match.source), ["local-file", "local-file", "local-file"]);
	assert.equal(parseLocalFileSource(matches[0]?.url ?? ""), "/Users/jaewone/Downloads/Kafka Producer-1.png");
	assert.equal(
		parseLocalFileSource(matches[1]?.url ?? ""),
		"/Users/jaewone/Library/Mobile Documents/iCloud~md~obsidian/Documents/JaewonE/00.Assets/Kafka Producer-1.png"
	);
	assert.equal(
		parseLocalFileSource(matches[2]?.url ?? ""),
		"/Users/jaewone/Library/Mobile Documents/iCloud~md~obsidian/Documents/JaewonE/00.Assets/Kafka Producer-1.png"
	);
});
