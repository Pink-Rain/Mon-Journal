// Import d'un ancien wiki TiddlyWiki (fichier .html ou export .json).
// On ne garde que les données de la personne : le code de l'appli vient
// désormais du plugin intégré, et une vieille copie l'écraserait.

const SKIP_PREFIXES = [
	"$:/core", "$:/boot/", "$:/library/", "$:/themes/", "$:/languages/", "$:/language/",
	"$:/plugins/", "$:/state/", "$:/temp/", "$:/status/", "$:/config/", "$:/Site", "$:/Upload",
	"$:/journalapp/modules/", "$:/journalapp/styles", "$:/journalapp/ui/", "$:/journalapp/views/",
	"$:/journalapp/categories/", "$:/journalapp/icons/", "$:/tags/JournalApp/", "$:/palettes/"
];
const SKIP_TITLES = new Set([
	"$:/StoryList", "$:/HistoryList", "$:/Import", "$:/isEncrypted", "$:/layout", "$:/palette",
	"$:/journalapp/layout", "$:/DefaultTiddlers", "$:/language", "$:/theme"
]);

export function parseWikiFile(text) {
	const trimmed = text.trim();
	if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
		const data = JSON.parse(trimmed);
		return Array.isArray(data) ? data : [data];
	}
	const tiddlers = [];
	// TiddlyWiki ≥ 5.2 : une ou plusieurs balises <script class="tiddlywiki-tiddler-store">.
	const re = /<script class="tiddlywiki-tiddler-store" type="application\/json">([\s\S]*?)<\/script>/g;
	let m;
	while ((m = re.exec(text))) {
		tiddlers.push(...JSON.parse(m[1]));
	}
	if (tiddlers.length) {
		return tiddlers;
	}
	// Anciens wikis : <div id="storeArea"><div title="…"><pre>…</pre></div></div>.
	const doc = new DOMParser().parseFromString(text, "text/html");
	const store = doc.getElementById("storeArea");
	if (store) {
		for (const div of store.querySelectorAll(":scope > div[title]")) {
			const fields = {};
			for (const attr of div.attributes) {
				fields[attr.name] = attr.value;
			}
			const pre = div.querySelector("pre");
			fields.text = pre ? pre.textContent : div.textContent;
			tiddlers.push(fields);
		}
	}
	if (!tiddlers.length) {
		throw new Error("Aucun tiddler trouvé dans ce fichier");
	}
	return tiddlers;
}

export function isPersonalData(fields) {
	const title = String(fields.title || "");
	if (!title || SKIP_TITLES.has(title)) {
		return false;
	}
	if (fields["draft.of"] || title.startsWith("Draft of '")) {
		return false;
	}
	if (fields["plugin-type"]) {
		return false;
	}
	return !SKIP_PREFIXES.some((p) => title.startsWith(p));
}

export function summarize(tiddlers) {
	const kept = tiddlers.filter(isPersonalData);
	const count = (pred) => kept.filter(pred).length;
	return {
		kept,
		skipped: tiddlers.length - kept.length,
		entries: count((t) => t.kind === "Daily"),
		media: count((t) => String(t.title).startsWith("$:/journalapp/media/") || String(t.title).startsWith("$:/journalapp/banners/")),
		settings: count((t) => String(t.title).startsWith("$:/journalapp/config/") || String(t.title).startsWith("$:/journalapp/settings/"))
	};
}
