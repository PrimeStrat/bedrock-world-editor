import { system, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { ensureItem } from "../actions/tools.js";
import { WE_CONFIG } from "../config.js";

const TOOL_ITEMS = {
    brush: { id: "we:brush", label: "World Brush" },
    terrain: { id: "we:terrain_builder", label: "Terrain Builder" },
    path: { id: "we:path_tool", label: "Path Tool" },
    guide: { id: "we:guide", label: "Guide Book" },
    wand: { id: WE_CONFIG.wandItemId, label: "Selection Wand" }
};

const toolCommand = {
    definition: {
        name: "we:tool",
        description: "Gives an editor tool.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Enum, name: "we:toolitem" }]
    },
    handler(origin, tool) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        const entry = TOOL_ITEMS[tool];
        if (!entry) {
            return toCommandResult({ ok: false, message: "§cUnknown tool §f" + tool + "§c." });
        }
        system.run(() => {
            const given = ensureItem(player, entry.id);
            player.sendMessage(given
                ? "§aGave you the §f" + entry.label + "§a."
                : "§7You already have the §f" + entry.label + "§7.");
        });
        return { status: CustomCommandStatus.Success };
    }
};

/**
 * Returns the tool item enum names, for command registration.
 * @returns {string[]} The tool names.
 */
function toolItemNames() {
    return Object.keys(TOOL_ITEMS);
}

export { toolCommand, toolItemNames };
