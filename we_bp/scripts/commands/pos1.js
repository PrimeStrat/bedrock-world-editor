import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { setPositionHere } from "../actions/selection.js";

const pos1Command = {
    definition: { name: "we:pos1", description: "Set selection position 1 to your location.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(setPositionHere(player, 1));
    }
};

export { pos1Command };
