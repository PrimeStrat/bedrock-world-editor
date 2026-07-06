import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { goCeil } from "../actions/navigation.js";

const ceilCommand = {
    definition: { name: "we:ceil", description: "Go up against the ceiling above you.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(goCeil(player));
    }
};

export { ceilCommand };
