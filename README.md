# MassCode Search for Alfred

Search your [massCode](https://masscode.io/) snippets from Alfred and paste them straight into the focused app — no clicking through the snippet manager.

![Searching snippets by name](screenshot-search.png)

![Filtering snippets by tag](screenshot-tag-filter.png)

## Features

- Three keywords: `m` (all), `mn` (notes), `mc` (code)
- Filter by tag using `#tagname` (e.g. `m #llm prompt`)
- Filter by folder using `/foldername` (e.g. `m /Inbox prompt`)
- Tab-autocomplete tags and folders — type `m #` or `m /` to browse
- Fuzzy name matching (fzf-style — characters can be non-contiguous)
- `Enter` copies the snippet contents to the clipboard (for `m` / `mn`)
- For code (`mc`), `Enter` opens the snippet in massCode and `Alt + Enter` copies to clipboard
- `Alt + Enter` opens the snippet directly in massCode (for `m` / `mn`)

Notes vs. code is detected by content language: `markdown` is treated as a note, anything else as code.

## Requirements

- [Alfred](https://www.alfredapp.com/) with the **Powerpack** (required for Script Filters)
- [massCode](https://masscode.io/) v3+ with the **REST API enabled** (Preferences → Storage → REST API)
- Node.js 18+ (built-in `fetch` is required)

## Installation

1. Download the latest `.alfredworkflow` file from the [Releases](../../releases) page.
2. Double-click it to import into Alfred.

Or, to install from source:

```sh
git clone https://github.com/harryhan24/masscode-search-for-alfred.git
# then in Alfred: drag the folder into the Workflows list, or symlink it into
# ~/Library/Application\ Support/Alfred/Alfred.alfredpreferences/workflows/
```

## Configuration

Open **Alfred Preferences → Workflows → MassCode Search → Configure Workflow…** to set:

| Setting | Default | Description |
| --- | --- | --- |
| **massCode Port** | `4321` | Port that the massCode REST API is listening on |

### Node path

The workflow calls Node at `/opt/homebrew/bin/node` (Homebrew on Apple Silicon). If you use a different setup, edit the **Script Filter**'s script field in Alfred:

- Intel Mac (Homebrew): `/usr/local/bin/node index.mjs all "$1"`
- nvm / fnm / asdf: use the absolute path printed by `which node`

(Each Script Filter passes a different mode argument: `all`, `note`, or `code`. Keep that first argument when changing the node path.)

## Usage

| Input | Result |
| --- | --- |
| `m` | List all snippets (notes + code) |
| `mn` | Notes only |
| `mc` | Code snippets only |
| `m react` | Snippets whose name fuzzy-matches `react` |
| `m #` | Tag picker (autocomplete) |
| `m #llm` | Snippets tagged `llm` |
| `m #llm prompt` | Snippets tagged `llm` whose name fuzzy-matches `prompt` |
| `m /` | Folder picker (autocomplete) |
| `m /Inbox` | Snippets in the `Inbox` folder |
| `m /Inbox prompt` | Snippets in `Inbox` whose name fuzzy-matches `prompt` |

Tag filtering and name search work the same way under `mn` and `mc`.

Then:

- `m` / `mn` — `↵` copies snippet contents, `⌥ + ↵` opens in massCode
- `mc` — `↵` opens in massCode, `⌥ + ↵` copies snippet contents

## How it works

`index.mjs` is a single-file Node script (no `node_modules`, no build step) that hits the massCode REST API at `localhost:<port>/snippets` and `/tags`, then prints an Alfred Script Filter JSON document to stdout. The port is read from the `masscode_port` env var that Alfred injects from the workflow's user configuration.

## License

TBD — add a `LICENSE` file before publishing.
