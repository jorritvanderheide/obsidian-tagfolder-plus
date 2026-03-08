import { ItemView, Menu, Notice } from "obsidian";
import { mount } from "svelte";
import TagFolderPlugin from "./main";
import {
	OrderDirection,
	OrderKeyItem,
	OrderKeyTag,
	VIEW_TYPE_TAGFOLDER,
	type TagFolderSettings,
	type ViewItem,
} from "./types";
import {
	ancestorToLongestTag,
	ancestorToTags,
	isSpecialTag,
	joinPartialPath,
	removeIntermediatePath,
	trimTrailingSlash,
} from "./util";
import { IconPickerModal } from "./IconPickerModal";

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
				.onClick(() => {
					const menu2 = new Menu();
					for (const key in OrderKeyTag) {
						for (const direction in OrderDirection) {
							menu2.addItem((item) => {
								const newSetting = `${key}_${direction}`;
								item.setTitle(OrderKeyTag[key] + " " + OrderDirection[direction]).onClick(() => {
									//@ts-ignore — string is a valid sort setting value, TypeScript can't narrow it here
									this.plugin.settings.sortTypeTag = newSetting;
									void this.plugin.saveSettings();
								});
								if (newSetting === this.plugin.settings.sortTypeTag) {
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
				.onClick(() => {
					const menu2 = new Menu();
					for (const key in OrderKeyItem) {
						for (const direction in OrderDirection) {
							menu2.addItem((item) => {
								const newSetting = `${key}_${direction}`;
								item.setTitle(OrderKeyItem[key] + " " + OrderDirection[direction]).onClick(() => {
									//@ts-ignore — string is a valid sort setting value, TypeScript can't narrow it here
									this.plugin.settings.sortType = newSetting;
									void this.plugin.saveSettings();
								});
								if (newSetting === this.plugin.settings.sortType) {
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

	abstract getViewType(): string;

	showMenu(evt: MouseEvent, trail: string[], targetTag?: string, targetItems?: ViewItem[]) {
		const isTagTree = this.getViewType() === VIEW_TYPE_TAGFOLDER;
		const menu = new Menu();
		if (isTagTree) {
			const expandedTagsAll = ancestorToLongestTag(
				ancestorToTags(joinPartialPath(removeIntermediatePath(trail)))
			).map((e) => trimTrailingSlash(e));
			const expandedTags = expandedTagsAll
				.map((e) =>
					e
						.split("/")
						.filter((ee) => !isSpecialTag(ee))
						.join("/")
				)
				.filter((e) => e != "")
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
						item
							.setTitle("Unpin folder")
							.setIcon("lucide-pin")
							.onClick(async () => {
								this.plugin.settings.pinnedFolders = this.plugin.settings.pinnedFolders.filter(
									(f) => f !== pinnedTag
								);
								await this.plugin.saveSettings();
							})
					);
				} else {
					menu.addItem((item) =>
						item
							.setTitle("Pin folder")
							.setIcon("lucide-pin")
							.onClick(async () => {
								this.plugin.settings.pinnedFolders = [...this.plugin.settings.pinnedFolders, pinnedTag];
								await this.plugin.saveSettings();
							})
					);
				}
				const iconTag = targetTag;
				const currentMark = this.plugin.settings.tagIcons?.[iconTag] ?? "";
				if (currentMark) {
					menu.addItem((item) =>
						item
							.setTitle("Remove folder icon")
							.setIcon("lucide-image-off")
							.onClick(async () => {
								delete this.plugin.settings.tagIcons[iconTag];
								await this.plugin.saveSettings();
							})
					);
				} else {
					menu.addItem((item) =>
						item
							.setTitle("Set folder icon")
							.setIcon("lucide-image-plus")
							.onClick(() => {
								new IconPickerModal(this.app, (iconId) => {
									this.plugin.settings.tagIcons = {
										...this.plugin.settings.tagIcons,
										[iconTag]: iconId,
									};
									void this.plugin.saveSettings();
								}).open();
							})
					);
				}
			}
		}
		if (!targetTag && targetItems && targetItems.length === 1) {
			const path = targetItems[0].path;
			const file = this.app.vault.getAbstractFileByPath(path);
			// Trigger
			this.app.workspace.trigger("file-menu", menu, file, "file-explorer");
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
							await this.app.fileManager.trashFile(file);
						}
					})
			);
		}
		if ("screenX" in evt) {
			menu.showAtPosition({ x: evt.pageX, y: evt.pageY });
		} else {
			menu.showAtPosition({
				// @ts-ignore — nativeEvent exists in the mobile Obsidian environment
				x: evt.nativeEvent.locationX,
				// @ts-ignore — nativeEvent exists in the mobile Obsidian environment
				y: evt.nativeEvent.locationY,
			});
		}
		evt.preventDefault();
	}
}
