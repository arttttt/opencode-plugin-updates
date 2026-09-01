# opencode-plugin-updates

An [OpenCode](https://opencode.ai) plugin that notifies you about outdated npm-installed plugins.

OpenCode resolves a `@latest` plugin spec once and then treats the cached workspace as
permanently fresh, so newer npm releases never arrive on their own
([#6774](https://github.com/anomalyco/opencode/issues/6774),
[#25293](https://github.com/anomalyco/opencode/issues/25293)). This plugin compares the
cache against the npm registry and reports what is stale.

**The plugin is read-only: it never installs, updates, or deletes anything.**

## What it does

- **Startup notification** — shortly after OpenCode starts, shows a toast naming every
  outdated plugin with its versions. Silent when everything is current.
- **`/plugins-check`** — prints the full version table for all installed plugins,
  without spending a model turn.

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
      "packages": [],
      "exclude": [],
      "packagesDir": [],
      "commandName": "plugins-check"
    }]
  ]
}
```

| Option | Default | Description |
| --- | --- | --- |
| `packages` | all | Whitelist of package names to consider |
| `exclude` | none | Blacklist of package names to skip |
| `packagesDir` | auto | Explicit package cache root(s) instead of auto-detection |
| `commandName` | `plugins-check` | Name of the slash command |

## Development

```
bun test
tsc --noEmit
```

## License

Apache-2.0
