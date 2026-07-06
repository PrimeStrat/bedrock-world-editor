import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { goThru } from "../actions/navigation.js";

const thruCommand = {
    definition: { name: "we:thru", description: "Pass through the wall you are facing.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(goThru(player));
    }
};

export { thruCommand };
