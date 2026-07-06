import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { undoEdit } from "../actions/history.js";

const undoCommand = {
    definition: { name: "we:undo", description: "Undo your last edit.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(undoEdit(player));
    }
};

export { undoCommand };
