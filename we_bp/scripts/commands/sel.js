import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { deselect } from "../actions/selection.js";

const selCommand = {
    definition: { name: "we:sel", description: "Clear your selection.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(deselect(player));
    }
};

export { selCommand };
