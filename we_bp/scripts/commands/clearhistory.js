import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { clearEditHistory } from "../actions/history.js";

const clearHistoryCommand = {
    definition: { name: "we:clearhistory", description: "Discard your undo and redo history.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(clearEditHistory(player));
    }
};

export { clearHistoryCommand };
