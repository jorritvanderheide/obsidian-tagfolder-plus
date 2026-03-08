import { WorkspaceLeaf } from "obsidian";
import TagFolderViewComponent from "./TagFolderViewComponent.svelte";
import { VIEW_TYPE_TAGFOLDER } from "./types";
import TagFolderPlugin from "./main";
import { TagFolderViewBase } from "./TagFolderViewBase";
import { mount, unmount } from "svelte";

export class TagFolderView extends TagFolderViewBase {
	icon = "stacked-levels";

	getIcon(): string {
		return "stacked-levels";
	}

	constructor(leaf: WorkspaceLeaf, plugin: TagFolderPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.showMenu = this.showMenu.bind(this);
		this.showOrder = this.showOrder.bind(this);
	}

	getViewType() {
		return VIEW_TYPE_TAGFOLDER;
	}

	getDisplayText() {
		return "Tag explorer";
	}

	async onOpen() {
		this.containerEl.empty();
		const app = mount(TagFolderViewComponent, {
			target: this.containerEl,
			props: {
				openFile: this.plugin.focusFile,
				hoverPreview: (a: MouseEvent, b: string) => this.plugin.hoverPreview(a, b),
				vaultName: this.app.vault.getName(),
				showMenu: this.showMenu.bind(this),
				showOrder: this.showOrder.bind(this),
				saveSettings: this.saveSettings.bind(this),
			},
		});
		this.component = app;
		return await Promise.resolve();
	}

	async onClose() {
		await unmount(this.component);
		this.component = undefined!;
		return await Promise.resolve();
	}
}
