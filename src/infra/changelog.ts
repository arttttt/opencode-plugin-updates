/**
 * Appends applied updates to a Markdown changelog file.
 */

import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import type { AppliedUpdate } from "../domain/entities";
import type { Changelog } from "../app/ports";

const HEADER = "# Plugin Update Changelog\n";

export function defaultChangelogPath(env: NodeJS.ProcessEnv, home: string = homedir()): string {
  const xdg = env.XDG_DATA_HOME && env.XDG_DATA_HOME !== "" ? env.XDG_DATA_HOME : null;
  const dataRoot = xdg ?? path.join(home, ".local", "share");
  return path.join(dataRoot, "opencode", "plugin-updates.log.md");
}

export function formatChangelogEntry(entries: readonly AppliedUpdate[], isoTimestamp: string): string {
  const timestamp = isoTimestamp.replace("T", " ").replace(/\.\d+Z$/, " UTC");
  const lines = [`## ${timestamp}`, ""];
  for (const { name, from, to } of entries) lines.push(`- **${name}**: ${from} -> ${to}`);
  return lines.join("\n") + "\n";
}

export function createFileChangelog(filePath: string): Changelog {
  return {
    async append(entries: readonly AppliedUpdate[]): Promise<void> {
      if (entries.length === 0) return;
      let existing = "";
      try {
        existing = await fs.readFile(filePath, "utf8");
      } catch {
        // First entry: the file simply does not exist yet.
      }
      const body = existing.startsWith(HEADER) ? existing.slice(HEADER.length) : existing;
      const updated = HEADER + "\n" + formatChangelogEntry(entries, new Date().toISOString()) + body;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, updated);
    },
  };
}
