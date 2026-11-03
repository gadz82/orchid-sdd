export default {
  branches: ["main"],
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    ["@semantic-release/npm", { npmPublish: false }],
    ["@semantic-release/exec", { prepareCmd: "node scripts/sync-version.mjs ${nextRelease.version}" }],
    [
      "@semantic-release/git",
      {
        assets: ["package.json", "CHANGELOG.md", ".claude-plugin/plugin.json"],
        message: "chore(release): ${nextRelease.version} [skip ci] [skip release]\n\n${nextRelease.notes}",
      },
    ],
    "@semantic-release/github",
  ],
};
