# opencode-plugin-updates

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![OpenCode Plugin](https://img.shields.io/badge/OpenCode-Plugin-green.svg)](https://opencode.ai)
[![npm version](https://img.shields.io/npm/v/opencode-plugin-updates.svg)](https://www.npmjs.com/package/opencode-plugin-updates)
[![GitHub repo](https://img.shields.io/badge/repo-arttttt%2Fopencode--plugin--updates-181717?logo=github)](https://github.com/arttttt/opencode-plugin-updates)

An [OpenCode](https://opencode.ai) plugin that **notifies you about outdated plugins** — it compares every npm-installed plugin against the registry and **names the stale ones**, so a silently pinned `@latest` never leaves you weeks behind.

OpenCode resolves a `@latest` plugin spec once, then treats the cached workspace as permanently fresh — newer npm releases never arrive on their own (known upstream issues #6774, #25293, #30631). This plugin surfaces exactly that staleness. **Automation is read-only: the startup check only notifies. Updates happen exclusively through the manual `/plugins-update` command.**

## How it works

```
OpenCode startup (15s settle delay)
  ↓
scan package cache roots:  $XDG_CACHE_HOME/opencode/packages
                           ~/.cache/opencode/packages
                           ~/Library/Caches/opencode/packages
  ├─ every existing root is scanned, results deduplicated (first hit wins)
  ├─ per <name>@latest workspace: installed = node_modules/<name> version
  ↓
npm registry: GET /-/package/<name>/dist-tags   (parallel, 5s timeout, failures skip)
  ↓
installed ≠ latest  →  toast: "plugin-updates: 2 outdated: a (1.0.0 -> 1.0.1), ..."
all fresh           →  silent
  ↓
/plugins-check  →  full table in chat, no model turn:
                   - a: 1.0.0 -> 1.0.1
                   - b: 2.0.0 =  up to date
```

## Features

- **Startup notification** — a toast naming every outdated plugin with its versions; silent when everything is current
- **`/plugins-check` command** — the full version table for all installed plugins, printed without spending a model turn
- **`/plugins-update` command** — manually applies pending updates: repins each stale workspace, removes its lock files, reinstalls (`bun`, falling back to `npm`), then asks you to restart OpenCode
- **Multi-root cache support** — both XDG-style (`~/.cache/opencode/packages`) and macOS (`~/Library/Caches/opencode/packages`) roots, scanned and deduplicated
- **Scoped packages** — `@scope/name@latest` workspaces are discovered alongside plain ones
- **Fail-soft** — registry timeouts and unreadable workspaces are skipped, never surfaced as errors

## Install

```jsonc
// ~/.config/opencode/opencode.json  (user)  or  .opencode/opencode.json  (project)
{
  "plugin": ["opencode-plugin-updates"]
}
```

or

```
opencode plugin opencode-plugin-updates -g
```

Restart OpenCode after adding it.

## Options

```jsonc
{
  "plugin": [
    ["opencode-plugin-updates", {
      "packages": [],              // whitelist of package names to consider
      "exclude": [],               // blacklist of package names to skip
      "packagesDir": [],           // explicit cache root(s) instead of auto-detection
      "checkCommandName": "plugins-check",
      "updateCommandName": "plugins-update"
    }]
  ]
}
```

## Develop

```
bun test
tsc --noEmit
```

## License

Apache-2.0 © Artem Bambalov
