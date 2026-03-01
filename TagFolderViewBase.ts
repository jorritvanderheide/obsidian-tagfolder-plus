import { ItemView, Menu, Notice } from "obsidian";
import { mount } from 'svelte'
import TagFolderPlugin from "./main";
import {
	OrderDirection,
	OrderKeyItem,
	OrderKeyTag,
	VIEW_TYPE_TAGFOLDER,
	VIEW_TYPE_TAGFOLDER_LIST,
	type TagFolderSettings,
	type ViewItem
} from "./types";
import { maxDepth, selectedTags } from "./store";
import { ancestorToLongestTag, ancestorToTags, isSpecialTag, renderSpecialTag, joinPartialPath, removeIntermediatePath, trimTrailingSlash } from "./util";
import { askString } from "dialog";
import { IconPickerModal } from "./IconPickerModal";

function toggleObjectProp(obj: { [key: string]: any }, propName: string, value: string | false) {
	if (value === false) {
		const newTagInfoEntries = Object.entries(obj || {}).filter(([key]) => key != propName);
		if (newTagInfoEntries.length == 0) {
			return {};
		} else {
			return Object.fromEntries(newTagInfoEntries);
		}
	} else {
		return { ...(obj ?? {}), [propName]: value };
	}
}
export abstract class TagFolderViewBase extends ItemView {
	component!: ReturnType<typeof mount>;
	plugin!: TagFolderPlugin;
	navigation = false;
	async saveSettings(settings: TagFolderSettings) {
		this.plugin.settings = { ...this.plugin.settings, ...settings };
		await this.plugin.saveSettings();
		this.plugin.updateFileCaches();
	}
	showOrder(evt: MouseEvent) {
		const menu = new Menu();

		menu.addItem((item) => {
			item.setTitle("Tags")
				.setIcon("hashtag")
				.onClick((evt2) => {
					const menu2 = new Menu();
					for (const key in OrderKeyTag) {
						for (const direction in OrderDirection) {
							menu2.addItem((item) => {
								const newSetting = `${key}_${direction}`;
								item.setTitle(
									OrderKeyTag[key] +
									" " +
									OrderDirection[direction]
								).onClick(async () => {
									//@ts-ignore
									this.plugin.settings.sortTypeTag =
										newSetting;
									await this.plugin.saveSettings();
								});
								if (
									newSetting ==
									this.plugin.settings.sortTypeTag
								) {
									item.setIcon("checkmark");
								}
								return item;
							});
						}
					}
					menu2.showAtPosition({ x: evt.x, y: evt.y });
				});
			return item;
		});
		menu.addItem((item) => {
			item.setTitle("Items")
				.setIcon("document")
				.onClick((evt2) => {
					const menu2 = new Menu();
					for (const key in OrderKeyItem) {
						for (const direction in OrderDirection) {
							menu2.addItem((item) => {
								const newSetting = `${key}_${direction}`;
								item.setTitle(
									OrderKeyItem[key] +
									" " +
									OrderDirection[direction]
								).onClick(async () => {
									//@ts-ignore
									this.plugin.settings.sortType = newSetting;
									await this.plugin.saveSettings();
								});
								if (
									newSetting == this.plugin.settings.sortType
								) {
									item.setIcon("checkmark");
								}
								return item;
							});
						}
					}
					menu2.showAtPosition({ x: evt.x, y: evt.y });
				});
			return item;
		});
		menu.showAtMouseEvent(evt);
	}

	showLevelSelect(evt: MouseEvent) {
		const menu = new Menu();
		const setLevel = async (level: number) => {
			this.plugin.settings.expandLimit = level;
			await this.plugin.saveSettings();
			maxDepth.set(level);
		};
		for (const level of [2, 3, 4, 5]) {
			menu.addItem((item) => {
				item.setTitle(`Level ${level - 1}`).onClick(() => {
					void setLevel(level);
				});
				if (this.plugin.settings.expandLimit == level)
					item.setIcon("checkmark");
				return item;
			});
		}

		menu.addItem((item) => {
			item.setTitle("No limit")
				// .setIcon("hashtag")
				.onClick(() => {
					void setLevel(0);
				});
			if (this.plugin.settings.expandLimit == 0)
				item.setIcon("checkmark");

			return item;
		});
		menu.showAtMouseEvent(evt);
	}

	abstract getViewType(): string;

	showMenu(evt: MouseEvent, trail: string[], targetTag?: string, targetItems?: ViewItem[]) {

		const isTagTree = this.getViewType() == VIEW_TYPE_TAGFOLDER;
		const menu = new Menu();
		if (isTagTree) {

			const expandedTagsAll = ancestorToLongestTag(ancestorToTags(joinPartialPath(removeIntermediatePath(trail)))).map(e => trimTrailingSlash(e));
			const expandedTags = expandedTagsAll
				.map(e => e.split("/")
					.filter(ee => !isSpecialTag(ee))
					.join("/")).filter(e => e != "")
				.map((e) => "#" + e)
				.join(" ")
				.trim();
			const displayExpandedTags = expandedTagsAll
				.map(e => e.split("/")
					.filter(ee => renderSpecialTag(ee))
					.join("/")).filter(e => e != "")
				.map((e) => "#" + e)
				.join(" ")
				.trim();


			if (navigator && navigator.clipboard) {
				menu.addItem((item) =>
					item
						.setTitle(`Copy tags: ${expandedTags}`)
						.setIcon("copy")
						.onClick(async () => {
							await navigator.clipboard.writeText(expandedTags);
							new Notice("Copied");
						})
				);
			}
			if (targetTag) {
				const pinnedTag = targetTag;
				const isPinned = this.plugin.settings.pinnedFolders.contains(pinnedTag);
				if (isPinned) {
					menu.addItem((item) =>
						item.setTitle("Unpin folder")
							.setIcon("lucide-pin")
							.onClick(async () => {
								this.plugin.settings.pinnedFolders = this.plugin.settings.pinnedFolders.filter(f => f !== pinnedTag);
								await this.plugin.saveSettings();
							})
					);
				} else {
					menu.addItem((item) =>
						item.setTitle("Pin folder")
							.setIcon("lucide-pin")
							.onClick(async () => {
								this.plugin.settings.pinnedFolders = [...this.plugin.settings.pinnedFolders, pinnedTag];
								await this.plugin.saveSettings();
							})
					);
				}
				const iconTag = targetTag;
				const currentMark = this.plugin.tagInfo?.[iconTag]?.mark ?? "";
				if (currentMark) {
					menu.addItem((item) =>
						item.setTitle("Remove folder icon")
							.setIcon("lucide-image-off")
							.onClick(async () => {
								this.plugin.tagInfo[iconTag] = toggleObjectProp(this.plugin.tagInfo[iconTag] ?? {}, "mark", false);
								this.plugin.applyTagInfo();
								await this.plugin.saveTagInfo();
							})
					);
				} else {
					menu.addItem((item) =>
						item.setTitle("Set folder icon")
							.setIcon("lucide-image-plus")
							.onClick(() => {
								new IconPickerModal(this.app, async (iconId) => {
									this.plugin.tagInfo[iconTag] = toggleObjectProp(this.plugin.tagInfo[iconTag] ?? {}, "mark", iconId);
									this.plugin.applyTagInfo();
									await this.plugin.saveTagInfo();
								}).open();
							})
					);
				}
			}
		}
		if (!targetTag && targetItems && targetItems.length == 1) {
			const path = targetItems[0].path;
			const file = this.app.vault.getAbstractFileByPath(path);
			// Trigger
			this.app.workspace.trigger(
				"file-menu",
				menu,
				file,
				"file-explorer"
			);
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle(`Open in new tab`)
					.setSection("open")
					.setIcon("lucide-file-plus")
					.onClick(async () => {
						await this.app.workspace.openLinkText(path, path, "tab");
					})
			);
			menu.addItem((item) =>
				item
					.setTitle(`Open to the right`)
					.setSection("open")
					.setIcon("lucide-separator-vertical")
					.onClick(async () => {
						await this.app.workspace.openLinkText(path, path, "split");
					})
			);
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle("Delete")
					.setIcon("trash")
					.setWarning(true)
					.onClick(async () => {
						if (file) {
							await this.app.vault.trash(file, true);
						}
					})
			);
		} else if (!isTagTree && targetTag) {
			const path = targetTag;
			const file = this.app.vault.getAbstractFileByPath(path);
			// Trigger
			this.app.workspace.trigger(
				"file-menu",
				menu,
				file,
				"file-explorer"
			);
			menu.addSeparator();
			menu.addItem((item) =>
				item
					.setTitle(`Open in new tab`)
					.setSection("open")
					.setIcon("lucide-file-plus")
					.onClick(async () => {
						await this.app.workspace.openLinkText(path, path, "tab");
					})
			);
			menu.addItem((item) =>
				item
					.setTitle(`Open to the right`)
					.setSection("open")
					.setIcon("lucide-separator-vertical")
					.onClick(async () => {
						await this.app.workspace.openLinkText(path, path, "split");
					})
			);
		}
		if ("screenX" in evt) {
			menu.showAtPosition({ x: evt.pageX, y: evt.pageY });
		} else {
			menu.showAtPosition({
				// @ts-ignore
				x: evt.nativeEvent.locationX,
				// @ts-ignore
				y: evt.nativeEvent.locationY,
			});
		}
		evt.preventDefault();
		// menu.showAtMouseEvent(evt);
	}

	switchView() {
		let viewType = VIEW_TYPE_TAGFOLDER;
		const currentType = this.getViewType();
		if (currentType == VIEW_TYPE_TAGFOLDER) {
			viewType = VIEW_TYPE_TAGFOLDER_LIST;
		} else if (currentType == VIEW_TYPE_TAGFOLDER_LIST) {
			viewType = VIEW_TYPE_TAGFOLDER;
		}

		const leaves = this.app.workspace.getLeavesOfType(viewType).filter(e => !e.getViewState().pinned && e != this.leaf);
		if (leaves.length) {
			void this.app.workspace.revealLeaf(
				leaves[0]
			);
		}
	}
}
