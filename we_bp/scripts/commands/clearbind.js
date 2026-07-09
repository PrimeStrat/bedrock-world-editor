import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { clearAllTools } from "../actions/brush.js";

const clearBindCommand = {
    definition: {
        name: "we:clearbind",
        description: "Clear all brushes, paints, and terrain tools from items.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false
    },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(clearAllTools(player));
    }
};

export { clearBindCommand };
