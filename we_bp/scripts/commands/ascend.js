import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { ascendDescend } from "../actions/navigation.js";

const ascendCommand = {
    definition: { name: "we:ascend", description: "Go up to the next platform above you.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(ascendDescend(player, false));
    }
};

export { ascendCommand };
