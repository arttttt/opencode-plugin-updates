# opencode-plugin-updates

An [OpenCode](https://opencode.ai) plugin that keeps your npm-installed plugins current.

OpenCode resolves a `@latest` plugin spec once and then treats the cached workspace as
permanently fresh, so newer npm releases never arrive on their own
([#6774](https://github.com/anomalyco/opencode/issues/6774),
[#25293](https://github.com/anomalyco/opencode/issues/25293)). This plugin re-checks the
npm registry, repins the stale workspaces, and reports what it did.

## What it does

- **Startup check** — shortly after OpenCode starts, compares every installed `@latest`
  plugin against npm and applies pending updates (a toast summarizes the result).
- **`/plugins-check`** — prints the version table for all plugins and applies updates
  without spending a model turn.
- **Changelog** — every applied update is recorded in `~/.local/share/opencode/plugin-updates.log.md`.

Both the XDG-style (`~/.cache/opencode/packages`) and macOS
(`~/Library/Caches/opencode/packages`) cache roots are supported; every existing root is
scanned and results are deduplicated.

## Install

```
opencode plugin opencode-plugin-updates -g
```

or add it to `opencode.json` manually:

```json
{
  "plugin": ["opencode-plugin-updates"]
}
```

## Options

```json
{
  "plugin": [
    ["opencode-plugin-updates", {
      "autoUpdate": true,
      "packages": [],
      "exclude": [],
      "packagesDir": [],
      "commandName": "plugins-check",
      "changelogPath": ""
    }]
  ]
}
```

| Option | Default | Description |
| --- | --- | --- |
| `autoUpdate` | `true` | Apply updates automatically on the startup check |
| `packages` | all | Whitelist of package names to consider |
| `exclude` | none | Blacklist of package names to skip |
| `packagesDir` | auto | Explicit package cache root(s) instead of auto-detection |
| `commandName` | `plugins-check` | Name of the slash command |
| `changelogPath` | auto | Changelog file location |

Updating runs `bun install` (falling back to `npm install`) inside each stale workspace
and then asks you to restart OpenCode so the new revisions load.

## Development

```
bun test
tsc --noEmit
```

## License

Apache-2.0
