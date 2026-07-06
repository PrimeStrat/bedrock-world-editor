import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { unstuck } from "../actions/navigation.js";

const unstuckCommand = {
    definition: { name: "we:unstuck", description: "Escape from inside blocks.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(unstuck(player));
    }
};

export { unstuckCommand };
