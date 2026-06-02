import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const groupConfigPath = path.resolve(__dirname, "..", "config", "groups.json");

function readGroupConfig() {
  const parsed = JSON.parse(fs.readFileSync(groupConfigPath, "utf8"));
  return Array.isArray(parsed.groups) ? parsed.groups : [];
}

export const configuredGroups = readGroupConfig();

export const watchGroup = {
  id: "watch",
  name: "关注合集",
  description: "聚合所有关注分组，不包含综合兜底组。",
  virtual: true
};

export const groups = [watchGroup, ...configuredGroups];

export function getGroups() {
  return groups.map(({ id, name, description, virtual = false, mode = "focused" }) => ({
    id,
    name,
    description,
    virtual,
    mode
  }));
}

export function getConfiguredGroups() {
  return configuredGroups;
}

export function normalizeGroupId(groupId = "watch") {
  const id = String(groupId || "watch");
  return groups.some((group) => group.id === id) ? id : "watch";
}

export function isWatchGroup(groupId) {
  return normalizeGroupId(groupId) === watchGroup.id;
}
