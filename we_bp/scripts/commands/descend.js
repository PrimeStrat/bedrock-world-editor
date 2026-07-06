import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { ascendDescend } from "../actions/navigation.js";

const descendCommand = {
    definition: { name: "we:descend", description: "Go down to the next platform below you.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(ascendDescend(player, true));
    }
};

export { descendCommand };
