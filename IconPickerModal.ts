import { App, getIconIds, Modal, setIcon } from "obsidian";

export class IconPickerModal extends Modal {
	private onSelect: (iconId: string) => void;

	constructor(app: App, onSelect: (iconId: string) => void) {
		super(app);
		this.onSelect = onSelect;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("tagfolder-icon-picker");

		const searchEl = contentEl.createEl("input", {
			type: "text",
			placeholder: "Search icons…",
			cls: "tagfolder-icon-search",
		});

		const gridEl = contentEl.createEl("div", { cls: "tagfolder-icon-grid" });
		const allIcons = getIconIds().sort();

		const render = (filter: string) => {
			gridEl.empty();
			const lower = filter.toLowerCase();
			const filtered = lower
				? allIcons.filter((id) => id.toLowerCase().contains(lower))
				: allIcons;
			for (const id of filtered.slice(0, 300)) {
				const btn = gridEl.createEl("button", { cls: "tagfolder-icon-btn", attr: { "aria-label": id } });
				setIcon(btn, id);
				btn.addEventListener("click", () => {
					this.onSelect(id);
					this.close();
				});
			}
		};

		render("");
		searchEl.addEventListener("input", () => render(searchEl.value));
		// Focus after the modal animation settles
		setTimeout(() => searchEl.focus(), 50);
	}

	onClose() {
		this.contentEl.empty();
	}
}
