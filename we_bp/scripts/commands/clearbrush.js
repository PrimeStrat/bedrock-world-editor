import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { clearBrush } from "../actions/tools.js";

const clearBrushCommand = {
    definition: {
        name: "we:clearbrush",
        description: "Clear the brush equipped on the World Brush item.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false
    },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(clearBrush(player));
    }
};

export { clearBrushCommand };
