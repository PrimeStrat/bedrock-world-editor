import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { giveWand } from "../actions/selection.js";

const wandCommand = {
    definition: { name: "we:wand", description: "Get the selection wand.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(giveWand(player));
    }
};

export { wandCommand };
