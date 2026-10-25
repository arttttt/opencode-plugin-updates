/**
 * `./server` export: the entry OpenCode 1.3.4+ loads first.
 *
 * OpenCode 1 reads `id` + `server` from this object. There is deliberately
 * no `setup`: OpenCode 2 requires one, so it rejects the plugin rather than
 * run code written for OpenCode 1's plugin cache — OpenCode 2 installs
 * plugins differently and checks them for updates itself. OpenCode 1.0 –
 * 1.3.3 never look here; they import the package root, entry/legacy.ts.
 */

import { PLUGIN_ID, PluginUpdatesPlugin } from "../plugin";

export default {
  id: PLUGIN_ID,
  server: PluginUpdatesPlugin,
};
