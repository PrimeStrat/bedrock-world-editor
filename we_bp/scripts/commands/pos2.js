import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { setPositionHere } from "../actions/selection.js";

const pos2Command = {
    definition: { name: "we:pos2", description: "Set selection position 2 to your location.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(setPositionHere(player, 2));
    }
};

export { pos2Command };
