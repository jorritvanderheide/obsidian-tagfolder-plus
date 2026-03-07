# Tag Folder Plus

> **A fork of [TagFolder](https://github.com/vrtmrz/obsidian-tagfolder) by vorotamoroz.**

Browse your vault through its (nested) tags. Each tag namespace (`domain/`, `source/`, `status/`, …) becomes an independent folder tree. A note tagged `#domain/coding` and `#source/book` appears under *both* `domain/coding` and `source/book` simultaneously — the same file in two places at once, like a symlink.

```
Meeting notes : #domain/work    #status/active
Research doc  : #domain/coding  #source/book   #status/active
Book summary  : #source/book  #status/done

domain/
  coding/   → Research doc
  work/     → Meeting notes
source/
  book/     → Research doc, Book summary
status/
  active/   → Meeting notes, Research doc
  done/     → Book summary
```

## Changes from upstream

**Bug fixes**

- **`ignoreTags` now matches prefixes** — adding `source` to the ignore list hides `source/book`, `source/ai`, and all other `source/*` sub-tags, not just the bare `source` tag.
- **Deduplication is namespace-aware** — notes tagged with both `domain/coding` and `source/book` now correctly appear under both namespaces. Previously the deduplication logic would silently drop the note from whichever namespace was processed second.

**New features**

- **Namespace-scoped sub-folders** — inside a tag folder, only sub-folders from the same root namespace are shown. Tags from other namespaces no longer bleed in as nested children. Togglable from the toolbar (on by default).
- **Cross-namespace filter folders** — when namespace isolation is off, a limited set of cross-namespace entry points appears inside a folder so you can narrow down by another dimension without leaving. Depth is configurable from the toolbar.
- **Folder icons** — assign a custom icon to any tag folder via its context menu.
- **Item count** — optionally show the number of files next to each folder.
- **Compact empty parent folders** — toggle collapsing of intermediate empty folders into a single `parent/child` entry from the toolbar.

**Removed from upstream**

- Link tree view and list view (ScrollView, TagFolderList) — this plugin is tag-only.
- Freshness virtual tags.
- Per-tag metadata system (pin/label/mark/redirect) — replaced by a simpler pinned folders list and folder icons.

## Installation

Install manually by copying `main.js` and `manifest.json` into `.obsidian/plugins/tag-folder-plus/`, then enable it in Settings → Community plugins.

Once installed, open the tag tree via `Ctrl+P` → *Show Tag Folder Plus*, or enable *Open on startup* in settings.

## Toolbar

| Button | Action |
|--------|--------|
| Sort order | Cycle through sort modes for files |
| Search | Open the search bar to filter tags and files |
| Isolate namespaces | Toggle namespace-scoped sub-folders on/off |
| Filter folder depth | (Visible when isolation is off) Set how many cross-namespace levels deep filter folders appear |
| Compact empty parents | Toggle collapsing of empty parent folders into `parent/child` |
| Collapse all | Collapse all open folders |

## Search

Type in the search bar to filter the tree. Matches are evaluated against tag names.

| Syntax | Meaning |
|--------|---------|
| `source` | tag contains "source" |
| `#source` | tag starts with "source" (namespace prefix) |
| `-source` | exclude tags containing "source" |
| `-#domain` | exclude the entire `domain/*` namespace |
| `A B` | AND — must match both |
| `A \| B` | OR — match A or B |

## Settings

### Files

**File title format** — How file names are displayed in the tag tree: path + name, name only, or name + path.

**File sort order** — Sort files by display name, filename, modified time, created time, or full path. Direction can be ascending or descending.

**Show display name** — Show the note's title from frontmatter or the first H1 heading instead of the filename.

**Title frontmatter key** — Dotted path to the frontmatter field used as the display title (e.g. `title` or `meta.title`).

**Show item count** — Display the number of files in each tag folder, to the right of the folder name.

### Tags

**Tag sort order** — Sort tag folders by name or by item count, ascending or descending.

**Intercept tag clicks** — When clicking a tag anywhere in Obsidian, navigate to it in the tag tree instead of opening the default tag search. Ctrl/Shift-click adds or removes exclusions from the search bar.

### Arrangement

**Hide files** — Control which files are hidden inside intermediate (non-leaf) tag folders:
- *Hide nothing* — files appear at every level.
- *Only intermediates of nested tags* — files are hidden inside nested tag levels (default).
- *All intermediates* — files only appear at the deepest level.

**Isolate sub-folders by namespace** — When inside a tag folder, only show sub-folders from the same root namespace. Also togglable from the toolbar.

**Keep intermediate empty folders** — Prevent empty parent tag folders from being collapsed into a single `parent/child` entry when all their files live in sub-folders. Also togglable from the toolbar.

**Show untagged files at root** — Display notes with no tags at the top level of the tag tree.

### Filters

**Scan only these folders** — Comma-separated list of vault folders. Only files inside these folders appear in the tag tree. Leave empty to scan the whole vault.

**Exclude folders** — Comma-separated list of folders to exclude (e.g. `templates, archive`).

**Exclude notes with tag** — Notes that have any of these tags are hidden from the tree entirely. Comma-separated.

**Hide tags** — These tags and all their sub-tags are hidden from the tree. Prefix matching applies: `source` also hides `source/book`, `source/ai`, etc. Comma-separated.

**Archive tags** — Notes with these tags are collected under an archive folder at the root and hidden from all other folders. Navigate into the archive folder to see them. Comma-separated.

### Advanced

**Metadata scan delay (ms)** — How long to wait after a file change before refreshing the tag tree. Increase if the tree flickers during rapid edits. Requires plugin reload.
