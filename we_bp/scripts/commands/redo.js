import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { redoEdit } from "../actions/history.js";

const redoCommand = {
    definition: { name: "we:redo", description: "Redo your last undone edit.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(redoEdit(player));
    }
};

export { redoCommand };
