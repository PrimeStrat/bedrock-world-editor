import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { selectionInfo } from "../actions/selection.js";

const sizeCommand = {
    definition: { name: "we:size", description: "Show the selection dimensions and volume.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(selectionInfo(player));
    }
};

export { sizeCommand };
