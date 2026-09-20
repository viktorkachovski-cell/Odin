const path = require('node:path');

const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// The shared packages live outside this app, so Metro has to watch the whole
// workspace and resolve from both module folders.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// Hierarchical lookup stays on: native packages legitimately nest their own
// build-time dependencies. A duplicate React would be the real hazard here, and
// that is prevented at the source by the `overrides` block in the root
// package.json, which pins one React version for the whole workspace.

module.exports = config;
