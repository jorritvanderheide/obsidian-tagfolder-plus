/// <reference types="svelte" />

import {
	App,
	debounce,
	getAllTags,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	TAbstractFile,
} from "obsidian";

import {
	DEFAULT_SETTINGS,
	OrderDirection,
	OrderKeyItem,
	OrderKeyTag,
	type TagFolderSettings,
	VIEW_TYPE_TAGFOLDER,
	type ViewItem,
	type FileCache,
} from "types";
import { allViewItems, appliedFiles, currentFile, pluginInstance, searchString, tagFolderSetting } from "store";
import {
	compare,
	doEvents,
	fileCacheToCompare,
	unique,
	ancestorToLongestTag,
	ancestorToTags,
	joinPartialPath,
	removeIntermediatePath,
	trimTrailingSlash,
	isSpecialTag,
	matchesArchiveTag,
	parseTagList,
} from "./util";
import { TagFolderView } from "./TagFolderView";

export type DISPLAY_METHOD = "PATH/NAME" | "NAME" | "NAME : PATH";

// The `Intermidiate` is spelt incorrectly, but it is already used as the key of the configuration.
// Leave it to the future.
export type HIDE_ITEMS_TYPE = "NONE" | "DEDICATED_INTERMIDIATES" | "ALL_EXCEPT_BOTTOM";

const HideItemsType: Record<string, string> = {
	NONE: "Hide nothing",
	DEDICATED_INTERMIDIATES: "Only intermediates of nested tags",
	ALL_EXCEPT_BOTTOM: "All intermediates",
};


function dotted<T extends Record<string, any>>(object: T, notation: string) {
	return notation.split('.').reduce((a, b) => (a && (b in a)) ? a[b] : null, object);
}

function getCompareMethodItems(settings: TagFolderSettings) {
	const invert = settings.sortType.contains("_DESC") ? -1 : 1;
	switch (settings.sortType) {
		case "DISPNAME_ASC":
		case "DISPNAME_DESC":
			return (a: ViewItem, b: ViewItem) =>
				compare(a.displayName, b.displayName) * invert;
		case "FULLPATH_ASC":
		case "FULLPATH_DESC":
			return (a: ViewItem, b: ViewItem) =>
				compare(a.path, b.path) * invert;
		case "MTIME_ASC":
		case "MTIME_DESC":
			return (a: ViewItem, b: ViewItem) => (a.mtime - b.mtime) * invert;
		case "CTIME_ASC":
		case "CTIME_DESC":
			return (a: ViewItem, b: ViewItem) => (a.ctime - b.ctime) * invert;
		case "NAME_ASC":
		case "NAME_DESC":
			return (a: ViewItem, b: ViewItem) =>
				compare(a.filename, b.filename) * invert;
		default:
			console.warn("Compare method (items) corrupted");
			return (a: ViewItem, b: ViewItem) =>
				compare(a.displayName, b.displayName) * invert;
	}
}

// Thank you @pjeby!
function onElement<T extends HTMLElement | Document>(el: T, event: string, selector: string, callback: CallableFunction, options: EventListenerOptions) {
	//@ts-ignore
	el.on(event, selector, callback, options)
	//@ts-ignore
	return () => el.off(event, selector, callback, options);
}

export default class TagFolderPlugin extends Plugin {
	settings: TagFolderSettings = { ...DEFAULT_SETTINGS };

	// Folder opening status.
	expandedFolders: string[] = ["root"];

	// The File that now opening
	currentOpeningFile = "";

	searchString = "";

	allViewItems = [] as ViewItem[];

	compareItems: (a: ViewItem, b: ViewItem) => number = (_, __) => 0;

	getView(): TagFolderView | null {
		for (const leaf of this.app.workspace.getLeavesOfType(
			VIEW_TYPE_TAGFOLDER
		)) {
			const view = leaf.view;
			if (view instanceof TagFolderView) {
				return view;
			}
		}
		return null;
	}
	// Called when item clicked in the tag folder pane.
	readonly focusFile = (path: string, specialKey: boolean): void => {
		if (this.currentOpeningFile == path) return;
		const _targetFile = this.app.vault.getAbstractFileByPath(path);
		const targetFile = (_targetFile instanceof TFile) ? _targetFile : this.app.vault
			.getFiles()
			.find((f) => f.path === path);

		if (targetFile) {
			if (specialKey) {
				void this.app.workspace.openLinkText(targetFile.path, targetFile.path, "tab");
			} else {
				// const leaf = this.app.workspace.getLeaf(false);
				// leaf.openFile(targetFile);
				void this.app.workspace.openLinkText(targetFile.path, targetFile.path);
			}
		}
	};

	hoverPreview(e: MouseEvent, path: string) {
		this.app.workspace.trigger("hover-link", {
			event: e,
			source: "file-explorer",
			hoverParent: this,
			targetEl: e.target,
			linktext: path,
		});
	}

	setSearchString(search: string) {
		searchString.set(search);
	}

	getFileTitle(file: TFile): string {
		if (!this.settings.useTitle) return file.basename;
		const metadata = this.app.metadataCache.getCache(file.path);
		if (metadata?.frontmatter && (this.settings.frontmatterKey)) {
			const d = dotted(metadata.frontmatter, this.settings.frontmatterKey);
			if (d) return `${d}`;
		}
		if (metadata?.headings) {
			const h1 = metadata.headings.find((e) => e.level == 1);
			if (h1) {
				return h1.heading;
			}
		}
		return file.basename;
	}

	getDisplayName(file: TFile): string {
		const filename = this.getFileTitle(file) || file.basename;
		if (this.settings.displayMethod == "NAME") {
			return filename;
		}
		const path = file.path.split("/");
		path.pop();
		const displayPath = path.join("/");

		if (this.settings.displayMethod == "NAME : PATH") {
			return `${filename} : ${displayPath}`;
		}
		if (this.settings.displayMethod == "PATH/NAME") {
			return `${displayPath}/${filename}`;
		}
		return filename;
	}

	async onload() {
		await this.loadSettings();
		this.hoverPreview = this.hoverPreview.bind(this);
		this.setSearchString = this.setSearchString.bind(this);
		// Make loadFileInfo debounced .
		this.loadFileInfo = debounce(
			this.loadFileInfo.bind(this),
			this.settings.scanDelay,
			true
		);
		pluginInstance.set(this);
		this.registerView(
			VIEW_TYPE_TAGFOLDER,
			(leaf) => new TagFolderView(leaf, this)
		);
		this.app.workspace.onLayoutReady(async () => {
			this.loadFileInfo();
			if (this.settings.alwaysOpen) {
				await this.initView();
				await this.activateView();
			}
		});
		this.addCommand({
			id: "tagfolder-open",
			name: "Show Tag Folder Plus",
			callback: () => {
				void this.activateView();
			},
		});
		this.addCommand({
			id: "tagfolder-rebuild-tree",
			name: "Force Rebuild",
			callback: () => {
				this.refreshAllTree();
			},
		});
		this.metadataCacheChanged = this.metadataCacheChanged.bind(this);
		this.watchWorkspaceOpen = this.watchWorkspaceOpen.bind(this);
		this.loadFileInfo = this.loadFileInfo.bind(this);
		this.registerEvent(
			this.app.metadataCache.on("changed", this.metadataCacheChanged)
		);

		this.refreshAllTree = this.refreshAllTree.bind(this);
		this.refreshTree = this.refreshTree.bind(this);
		this.registerEvent(this.app.vault.on("rename", this.refreshTree));
		this.registerEvent(this.app.vault.on("delete", this.refreshTree));
		this.registerEvent(
			this.app.workspace.on("file-open", this.watchWorkspaceOpen)
		);
		this.watchWorkspaceOpen(this.app.workspace.getActiveFile());

		this.addSettingTab(new TagFolderSettingTab(this.app, this));

		searchString.subscribe((search => {
			this.searchString = search;
			this.refreshAllTree();
		}))


		const setTagSearchString = (event: MouseEvent, tagString: string) => {
			if (tagString) {
				const regExpTagStr = new RegExp(`(^|\\s)${tagString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, "u");
				const regExpTagStrInv = new RegExp(`(^|\\s)-${tagString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`, "u");
				if (event.altKey) {
					return;
				} else if (event.ctrlKey && event.shiftKey) {
					if (this.searchString.match(regExpTagStr)) {
						this.setSearchString(this.searchString.replace(regExpTagStr, ""));
					} else if (!this.searchString.match(regExpTagStrInv)) {
						this.setSearchString(this.searchString + (this.searchString.length == 0 ? "" : " ") + `-${tagString}`);
					}
				} else if (event.ctrlKey) {
					if (this.searchString.match(regExpTagStrInv)) {
						this.setSearchString(this.searchString.replace(regExpTagStrInv, ""));
					} else if (!this.searchString.match(regExpTagStr)) {
						this.setSearchString(this.searchString + (this.searchString.length == 0 ? "" : " ") + `${tagString}`);
					}
				} else {
					this.setSearchString(tagString);
				}
				event.preventDefault();
				event.stopPropagation();

			}
		}

		const selectorHashTagLink = 'a.tag[href^="#"]';
		const selectorHashTagSpan = "span.cm-hashtag.cm-meta";
		// The tag selectors in the attribute list 
		const selectorMetadataTag = '.metadata-property[data-property-key="tags"] .multi-select-pill-content span, .metadata-property[data-property-key="tags"] .multi-select-pill';
		//If the user double-clicks to enter the editing mode instead of performing a search
		let metadataTagClickTimer: number | null = null;
		const SINGLE_CLICK_DELAY_MS = 200;

		// Handle the label clicks in the attribute list (with the highest priority, registered first)
		this.register(
			onElement(document, "click", selectorMetadataTag, (event: MouseEvent, targetEl: HTMLElement) => {
				if (!this.settings.overrideTagClicking) return;

				// If the clicked button is the delete button or one of its sub-elements, the search function will not be triggered.
				const clickedRemoveButton = (event.target as HTMLElement).closest('.multi-select-pill-remove-button');
				if (clickedRemoveButton) {
					return;
				}

				if (event.detail > 1) {
					if (metadataTagClickTimer) {
						window.clearTimeout(metadataTagClickTimer);
						metadataTagClickTimer = null;
					}
					return;
				}

				// Immediately stop the default behavior and event propagation
				event.preventDefault();
				event.stopPropagation();
				event.stopImmediatePropagation();

				if (metadataTagClickTimer) {
					window.clearTimeout(metadataTagClickTimer);
					metadataTagClickTimer = null;
				}

				metadataTagClickTimer = window.setTimeout(() => {
					metadataTagClickTimer = null;

					// Find the element that contains the label text.
					let tagElement: HTMLElement = targetEl;
					// If the clicked element is a `.multi-select-pill`, find the `span` within it.
					if (targetEl.classList.contains('multi-select-pill')) {
						const span = targetEl.querySelector('.multi-select-pill-content span');
						if (span instanceof HTMLElement) {
							tagElement = span;
						}
					}

					let tagString = tagElement.innerText.trim();
					// Remove the # prefix (if it exists)
					if (tagString.startsWith("#")) {
						tagString = tagString.substring(1);
					}

					if (tagString) {
						setTagSearchString(event, tagString);
						const leaf = this.getView()?.leaf;
						if (leaf) {
							void this.app.workspace.revealLeaf(leaf);
						}
					}
				}, SINGLE_CLICK_DELAY_MS);
			}, { capture: true })
		);
		
		// Handle the label links in other places (excluding those in the attribute list, as they have already been handled above)
		this.register(
			onElement(document, "click", selectorHashTagLink, (event: MouseEvent, targetEl: HTMLElement) => {
				if (!this.settings.overrideTagClicking) return;
								
				// Check if it is in the attribute list. If so, skip it (as it has already been handled above)
				if (targetEl.closest('.metadata-property[data-property-key="tags"]')) {
					return;
				}
				
				const tagString = targetEl.innerText.substring(1);
				if (tagString) {
					setTagSearchString(event, tagString);
					const leaf = this.getView()?.leaf;
					if (leaf) {
						void this.app.workspace.revealLeaf(leaf);
					}
				}
			}, { capture: true })
		);
		this.register(
			onElement(document, "click", selectorHashTagSpan, (event: MouseEvent, targetEl: HTMLElement) => {
				if (!this.settings.overrideTagClicking) return;
				let enumTags: Element | null = targetEl;
				let tagString = "";
				// A tag is consisted of possibly several spans having each class.
				// Usually, they have been merged into two spans. but can be more.
				// In any event, the first item has `cm-hashtag-begin`, and the last
				// item has `cm-hashtag-end` but both (or all) spans possibly raises events.
				// So we have to find the head and trace them to the tail.
				while (!enumTags.classList.contains("cm-hashtag-begin")) {
					enumTags = enumTags.previousElementSibling;
					if (!enumTags) {
						console.log("Error! start tag not found.");
						return;
					}
				}

				do {
					if (enumTags instanceof HTMLElement) {
						tagString += enumTags.innerText;
						if (enumTags.classList.contains("cm-hashtag-end")) {
							break;
						}
					}
					enumTags = enumTags.nextElementSibling;

				} while (enumTags);
				tagString = tagString.substring(1) //Snip hash.
				setTagSearchString(event, tagString);
				const leaf = this.getView()?.leaf;
				if (leaf) {
					void this.app.workspace.revealLeaf(leaf);
				}
			}, { capture: true })
		);
	}

	watchWorkspaceOpen(file: TFile | null) {
		if (file) {
			this.currentOpeningFile = file.path;
		} else {
			this.currentOpeningFile = "";
		}
		currentFile.set(this.currentOpeningFile);
	}

	metadataCacheChanged(file: TFile) {
		void this.loadFileInfoAsync(file);
	}
	refreshTree(file: TAbstractFile, oldName?: string) {
		if (oldName) {
			this.refreshAllTree();
		} else {
			if (file instanceof TFile) {
				this.loadFileInfo(file);
			}
		}
	}

	refreshAllTree() {
		this.loadFileInfo();
	}

	fileCaches: FileCache[] = [];

	oldFileCache = "";


	getFileCacheData(file: TFile): FileCache | false {
		const metadata = this.app.metadataCache.getFileCache(file);
		if (!metadata) return false;
		return {
			file: file,
			tags: getAllTags(metadata) || [],
		};
	}
	updateFileCachesAll(): boolean {
		const filesAll = [...this.app.vault.getMarkdownFiles(), ...this.app.vault.getAllLoadedFiles().filter(e => "extension" in e && e.extension == "canvas") as TFile[]];
		const caches = filesAll.map(entry => this.getFileCacheData(entry)).filter(e => e !== false)
		this.fileCaches = [...caches];
		return this.isFileCacheChanged();
	}
	isFileCacheChanged() {
		const fileCacheDump = JSON.stringify(
			this.fileCaches.map((e) => ({
				path: e.file.path,
				tags: e.tags,
			}))
		);
		if (this.oldFileCache == fileCacheDump) {
			return false;
		} else {
			this.oldFileCache = fileCacheDump;
			return true;
		}
	}


	updateFileCaches(diffs: (TFile | undefined)[] = []): boolean {
		let anyUpdated = false;

		if (this.fileCaches.length == 0 || diffs.length == 0) {
			return this.updateFileCachesAll();
		} else {
			const processDiffs = [...diffs];
			let newCaches = [...this.fileCaches];
			let diff = processDiffs.shift();
			do {
				const procDiff = diff;
				if (!procDiff) break;
				// Find old one and remove if exist once.
				const old = newCaches.find(
					(fileCache) => fileCache.file.path == procDiff.path
				);

				if (old) {
					newCaches = newCaches.filter(
						(fileCache) => fileCache !== old
					);
				}
				const newCache = this.getFileCacheData(procDiff);
				if (newCache) {
					newCaches.push(newCache);
				}
				anyUpdated = anyUpdated || (JSON.stringify(fileCacheToCompare(old)) != JSON.stringify(fileCacheToCompare(newCache)));
				diff = processDiffs.shift();
			} while (diff !== undefined);
			this.fileCaches = newCaches;

		}
		return anyUpdated;
	}

	async getItemsList(): Promise<ViewItem[]> {
		const items: ViewItem[] = [];
		const ignoreDocTags = parseTagList(this.settings.ignoreDocTags);
		const ignoreTags = parseTagList(this.settings.ignoreTags).map((e) => e.replace(/\/+$/, ""));
		const ignoreFolders = this.settings.ignoreFolders
			.toLowerCase()
			.replace(/\n/g, "")
			.split(",")
			.map((e) => e.trim())
			.filter((e) => !!e);
		const targetFolders = this.settings.targetFolders
			.toLowerCase()
			.replace(/\n/g, "")
			.split(",")
			.map((e) => e.trim())
			.filter((e) => !!e);

		const searchItems = this.searchString
			.toLowerCase()
			.split("|")
			.map((ee) => ee.split(" ").map((e) => e.trim()));

		const archiveTags = parseTagList(this.settings.archiveTags);
		for (const fileCache of this.fileCaches) {
			if (
				targetFolders.length > 0 &&
				!targetFolders.some(
					(e) => {
						return e != "" &&
							fileCache.file.path.toLowerCase().startsWith(e)
					}
				)
			) {
				continue;
			}
			if (
				ignoreFolders.some(
					(e) =>
						e != "" &&
						fileCache.file.path.toLowerCase().startsWith(e)
				)
			) {
				continue;
			}
			await doEvents();
			const allTagsDocs = unique(fileCache.tags);
			let allTags = unique(allTagsDocs.map((e) => e.substring(1)));
			if (allTags.length == 0) {
				allTags = ["_untagged"];
			}
			if (fileCache.file.extension == "canvas") {
				allTags.push("_VIRTUAL_TAG_CANVAS")
			}
	
			if (
				allTags.some((tag) =>
					ignoreDocTags.contains(tag.toLowerCase())
				)
			) {
				continue;
			}

			// filter the items
			const w = searchItems.map((searchItem) => {
				let bx = false;
				if (allTags.length == 0) return false;
				for (const searchSrc of searchItem) {
					let search = searchSrc;
					let func = "contains" as "contains" | "startsWith";
					if (search.startsWith("#")) {
						search = search.substring(1);
						func = "startsWith";
					}
					if (search.startsWith("-")) {
						bx =
							bx ||
							allTags.some((tag) =>
								tag
									.toLowerCase()[func](search.substring(1))
							);
						// if (bx) continue;
					} else {
						bx =
							bx ||
							allTags.every(
								(tag) =>
									!tag.toLowerCase()[func](search)
							);
						// if (bx) continue;
					}
				}
				return bx;
			});

			if (w.every((e) => e)) continue;

			allTags = allTags.filter((tag) => {
				const tagLC = tag.toLowerCase();
				return !ignoreTags.some(
					(ignore) => ignore !== "" && (
						tagLC === ignore ||
						tagLC.startsWith(ignore + "/")
					)
				);
			});

			// if (this.settings.reduceNestedParent) {
			// 	allTags = mergeSameParents(allTags);
			// }

			const archiveTagsMatched = allTags.filter(e =>
				archiveTags.some(a => a !== "" && matchesArchiveTag(e.toLowerCase(), a))
			);
			if (archiveTagsMatched.length > 0) {
				// Hoist to root by stripping namespace: type/inbox → inbox
				allTags = unique(archiveTagsMatched.map(t => t.split("/").pop()!));
			}
			items.push({
				tags: allTags,
				path: fileCache.file.path,
				displayName: this.getDisplayName(fileCache.file),
				mtime: fileCache.file.stat.mtime,
				ctime: fileCache.file.stat.ctime,
				filename: fileCache.file.basename,
			});
		}
		return items;
	}

	lastSettings = "";
	lastSearchString = "";

	loadFileInfo(diff?: TFile) {
		void this.loadFileInfoAsync(diff);
	}

	processingFileInfo = false;
	isSettingChanged() {
		const strSetting = JSON.stringify(this.settings);
		const isSettingChanged = strSetting != this.lastSettings;
		const isSearchStringModified =
			this.searchString != this.lastSearchString;
		if (isSettingChanged) {
			this.lastSettings = strSetting;
		}
		if (isSearchStringModified) {
			this.lastSearchString = this.searchString;
		}
		return isSearchStringModified || isSettingChanged;
	}
	loadFileQueue = [] as TFile[];
	loadFileTimer?: ReturnType<typeof setTimeout> = undefined;
	async loadFileInfos(diffs: TFile[]) {
		if (this.processingFileInfo) {
			diffs.forEach(e => void this.loadFileInfoAsync(e));
			return;
		}
		try {
			this.processingFileInfo = true;
			const cacheUpdated = this.updateFileCaches(diffs);
			if (this.isSettingChanged() || cacheUpdated) {
				appliedFiles.set(diffs.map(e => e.path));
				await this.applyFileInfoToView();
			}
			// Apply content of diffs to each view.
			const af = this.app.workspace.getActiveFile();
			if (af && this.currentOpeningFile != af.path) {
				this.currentOpeningFile = af.path;
				currentFile.set(this.currentOpeningFile);
			}

		} finally {
			this.processingFileInfo = false;
		}
	}
	async applyFileInfoToView() {
		const items = await this.getItemsList();
		const itemsSorted = items.sort(this.compareItems);
		this.allViewItems = itemsSorted;
		allViewItems.set(this.allViewItems);
	}

	// Sweep updated file or all files to retrieve tags.
	async loadFileInfoAsync(diff?: TFile) {
		if (!diff) {
			this.loadFileQueue = [];
			if (this.loadFileTimer) {
				clearTimeout(this.loadFileTimer);
				this.loadFileTimer = undefined;
			}
			await this.loadFileInfos([]);
			return;
		}
		if (diff && this.loadFileQueue.some(e => e.path == diff?.path)) {
			//console.log(`LoadFileInfo already in queue:${diff?.path}`)
		} else {
			this.loadFileQueue.push(diff);
			//console.log(`LoadFileInfo queued:${diff.path}`);
		}
		if (this.loadFileTimer) {
			clearTimeout(this.loadFileTimer);
		}
		this.loadFileTimer = setTimeout(() => {
			if (this.loadFileQueue.length === 0) {
				// console.log(`No need to LoadFile`);
			} else {
				const diffs = [...this.loadFileQueue];
				this.loadFileQueue = [];
				void this.loadFileInfos(diffs);
			}
		}, 200);
	}

	onunload() {
		pluginInstance.set(undefined);
	}



	async _initTagView() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TAGFOLDER);
		if (leaves.length == 0) {
			await this.app.workspace.getLeftLeaf(false)?.setViewState({
				type: VIEW_TYPE_TAGFOLDER,
				state: { treeViewType: "tags" }
			});
		} else {
			const newState = leaves[0].getViewState();
			await leaves[0].setViewState({
				type: VIEW_TYPE_TAGFOLDER,
				state: { ...newState, treeViewType: "tags" }
			})
		}
	}

	async initView() {
		this.loadFileInfo();
		await this._initTagView();
	}

	async activateView() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TAGFOLDER);
		await this.initView();
		if (leaves.length > 0) {
			await this.app.workspace.revealLeaf(
				leaves[0]
			);
		}
	}
	async refreshAllViewItems() {
		const items = await this.getItemsList();
		const itemsSorted = items.sort(this.compareItems);
		this.allViewItems = itemsSorted;
		allViewItems.set(this.allViewItems);

	}
	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
		tagFolderSetting.set({ ...this.settings });
		this.compareItems = getCompareMethodItems(this.settings);
		// this.compareTags = getCompareMethodTags(this.settings);
	}

	async saveSettings() {
		tagFolderSetting.set({ ...this.settings });
		this.compareItems = getCompareMethodItems(this.settings);
		void this.refreshAllViewItems(); // (Do not wait for it)
		await this.saveData(this.settings);
		// this.compareTags = getCompareMethodTags(this.settings);
	}

	async createNewNote(tags?: string[]) {
		const expandedTagsAll = ancestorToLongestTag(ancestorToTags(joinPartialPath(removeIntermediatePath(tags ?? []))))
			.map((e) => trimTrailingSlash(e));

		const expandedTags = expandedTagsAll
			.map((e) => e
				.split("/")
				.filter((ee) => !isSpecialTag(ee))
				.join("/"))
			.filter((e) => e != "")
			.map((e) => "#" + e)
			.join(" ")
			.trim();

		//@ts-ignore
		const ww = await this.app.fileManager.createAndOpenMarkdownFile() as TFile;
		if (this.settings.useFrontmatterTagsForNewNotes) {
			await this.app.fileManager.processFrontMatter(ww, (matter) => {
				matter.tags = matter.tags ?? [];
				matter.tags = expandedTagsAll
					.filter(e => !isSpecialTag(e))
					.filter(e => matter.tags.indexOf(e) < 0)
					.concat(matter.tags);
			});
		}
		else {
			await this.app.vault.append(ww, expandedTags);
		}
	}
}

class TagFolderSettingTab extends PluginSettingTab {
	plugin: TagFolderPlugin;

	constructor(app: App, plugin: TagFolderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	hide() {
		this.plugin.loadFileInfo();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Behavior" });
		new Setting(containerEl)
			.setName("Open on startup")
			.setDesc("Automatically open the tag tree in the left sidebar every time Obsidian starts.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.alwaysOpen)
					.onChange(async (value) => {
						this.plugin.settings.alwaysOpen = value;
						await this.plugin.saveSettings();
					})
			);
		containerEl.createEl("h2", { text: "Files" });
		new Setting(containerEl)
			.setName("File title format")
			.setDesc("How file names are displayed in the tag tree.")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						"PATH/NAME": "PATH/NAME",
						NAME: "NAME",
						"NAME : PATH": "NAME : PATH",
					})
					.setValue(this.plugin.settings.displayMethod)
					.onChange(async (value) => {
						this.plugin.settings.displayMethod = value as DISPLAY_METHOD;
						this.plugin.loadFileInfo();
						await this.plugin.saveSettings();
					})
			);
		const setOrderMethod = async (key?: string, order?: string) => {
			const oldSetting = this.plugin.settings.sortType.split("_");
			if (!key) key = oldSetting[0];
			if (!order) order = oldSetting[1];
			//@ts-ignore
			this.plugin.settings.sortType = `${key}_${order}`;
			await this.plugin.saveSettings();
			// this.plugin.setRoot(this.plugin.root);
		};
		new Setting(containerEl)
			.setName("File sort order")
			.setDesc("Sort order for files within each tag folder.")
			.addDropdown((dd) => {
				dd.addOptions(OrderKeyItem)
					.setValue(this.plugin.settings.sortType.split("_")[0])
					.onChange((key) => setOrderMethod(key, undefined));
			})
			.addDropdown((dd) => {
				dd.addOptions(OrderDirection)
					.setValue(this.plugin.settings.sortType.split("_")[1])
					.onChange((order) => setOrderMethod(undefined, order));
			});
		new Setting(containerEl)
			.setName("Show display name")
			.setDesc(
				"Show the note’s title from frontmatter or the first H1 heading instead of the filename."
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.useTitle)
					.onChange(async (value) => {
						this.plugin.settings.useTitle = value;
						fpath.setDisabled(!value);
						await this.plugin.saveSettings();
					});
			});
		const fpath = new Setting(containerEl)
			.setName("Title frontmatter key")
			.setDisabled(!this.plugin.settings.useTitle)
			.addText((text) => {
				text
					.setValue(this.plugin.settings.frontmatterKey)
					.onChange(async (value) => {
						this.plugin.settings.frontmatterKey = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Show item count")
			.setDesc("Display the number of files in each tag folder, shown to the right of the folder name.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showItemCount)
					.onChange(async (value) => {
						this.plugin.settings.showItemCount = value;
						await this.plugin.saveSettings();
					});
			});
		containerEl.createEl("h2", { text: "Tags" });

		const setOrderMethodTag = async (key?: string, order?: string) => {
			const oldSetting = this.plugin.settings.sortTypeTag.split("_");
			if (!key) key = oldSetting[0];
			if (!order) order = oldSetting[1];
			//@ts-ignore
			this.plugin.settings.sortTypeTag = `${key}_${order}`;
			await this.plugin.saveSettings();
			// this.plugin.setRoot(this.plugin.root);
		};
		new Setting(containerEl)
			.setName("Tag sort order")
			.setDesc("Sort order for tag folders.")
			.addDropdown((dd) => {
				dd.addOptions(OrderKeyTag)
					.setValue(this.plugin.settings.sortTypeTag.split("_")[0])
					.onChange((key) => setOrderMethodTag(key, undefined));
			})
			.addDropdown((dd) => {
				dd.addOptions(OrderDirection)
					.setValue(this.plugin.settings.sortTypeTag.split("_")[1])
					.onChange((order) => setOrderMethodTag(undefined, order));
			});


		containerEl.createEl("h2", { text: "Actions" });
		new Setting(containerEl)
			.setName("Intercept tag clicks")
			.setDesc("When clicking a tag anywhere in Obsidian, navigate to it in the tag tree instead of opening the default tag search.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.overrideTagClicking)
					.onChange(async (value) => {
						this.plugin.settings.overrideTagClicking = value;
						await this.plugin.saveSettings();
					});
			});
		containerEl.createEl("h2", { text: "Arrangements" });

		new Setting(containerEl)
			.setName("Hide files")
			.setDesc("Control which files are hidden inside intermediate (non-leaf) tag folders.")
			.addDropdown((dd) => {
				dd.addOptions(HideItemsType)
					.setValue(this.plugin.settings.hideItems)
					.onChange(async (key) => {
						if (
							key == "NONE" ||
							key == "DEDICATED_INTERMIDIATES" ||
							key == "ALL_EXCEPT_BOTTOM"
						) {
							this.plugin.settings.hideItems = key;
						}
						await this.plugin.saveSettings();
					});
			});
		new Setting(containerEl)
			.setName("Isolate sub-folders by namespace")
			.setDesc(
				"Only show sub-folders that belong to the same root namespace as the current folder. For example, inside source/, folders from area/ or project/ will not appear."
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.namespacedTagGuard)
					.onChange(async (value) => {
						this.plugin.settings.namespacedTagGuard = value;
						await this.plugin.saveSettings();
					});
			});
		new Setting(containerEl)
			.setName("Keep intermediate empty folders")
			.setDesc(
				"Prevent empty parent tag folders from being collapsed when all their files live in sub-folders."
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.doNotSimplifyTags)
					.onChange(async (value) => {
						this.plugin.settings.doNotSimplifyTags = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Show untagged files at root")
			.setDesc("Display notes with no tags at the top level of the tag tree.")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.expandUntaggedToRoot)
					.onChange(async (value) => {
						this.plugin.settings.expandUntaggedToRoot = value;
						await this.plugin.saveSettings();
					});
			});

		containerEl.createEl("h2", { text: "Filters" });
		new Setting(containerEl)
			.setName("Scan only these folders")
			.setDesc("Comma-separated list of vault folders. Only files inside these folders will appear in the tag tree. Leave empty to scan the whole vault.")
			.addTextArea((text) =>
				text
					.setValue(this.plugin.settings.targetFolders)
					.setPlaceholder("study,documents/summary")
					.onChange(async (value) => {
						this.plugin.settings.targetFolders = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("Exclude folders")
			.setDesc("Comma-separated list of folders to exclude from the tag tree (e.g. templates, archive).")
			.addTextArea((text) =>
				text
					.setValue(this.plugin.settings.ignoreFolders)
					.setPlaceholder("template,list/standard_tags")
					.onChange(async (value) => {
						this.plugin.settings.ignoreFolders = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("Exclude notes with tag")
			.setDesc(
				"Notes that have any of these tags are hidden from the tag tree entirely. Comma-separated."
			)
			.addTextArea((text) =>
				text
					.setValue(this.plugin.settings.ignoreDocTags)
					.setPlaceholder("test,test1,test2")
					.onChange(async (value) => {
						this.plugin.settings.ignoreDocTags = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("Hide tags")
			.setDesc("These tags and all their sub-tags will be hidden from the tag tree. Comma-separated.")
			.addTextArea((text) =>
				text
					.setValue(this.plugin.settings.ignoreTags)
					.setPlaceholder("test,test1,test2")
					.onChange(async (value) => {
						this.plugin.settings.ignoreTags = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("Archive tags")
			.setDesc("Notes with these tags are grouped under an archive folder at the root and hidden from other folders. Comma-separated.")
			.addTextArea((text) =>
				text
					.setValue(this.plugin.settings.archiveTags)
					.setPlaceholder("archived, discontinued")
					.onChange(async (value) => {
						this.plugin.settings.archiveTags = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h2", { text: "Misc" });

		new Setting(containerEl)
			.setName("Metadata scan delay (ms)")
			.setDesc(
				"Milliseconds to wait after a file change before refreshing the tag tree. Increase if the tree flickers during edits. Requires plugin reload."
			)
			.addText((text) => {
				text = text
					.setValue(this.plugin.settings.scanDelay + "")

					.onChange(async (value) => {
						const newDelay = Number.parseInt(value, 10);
						if (newDelay) {
							this.plugin.settings.scanDelay = newDelay;
							await this.plugin.saveSettings();
						}
					});
				text.inputEl.setAttribute("type", "number");
				text.inputEl.setAttribute("min", "250");
				return text;
			});
	}
}
