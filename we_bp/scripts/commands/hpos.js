import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { setPositionLooked } from "../actions/selection.js";

const hpos1Command = {
    definition: { name: "we:hpos1", description: "Set position 1 to the block you look at.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(setPositionLooked(player, 1));
    }
};

const hpos2Command = {
    definition: { name: "we:hpos2", description: "Set position 2 to the block you look at.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(setPositionLooked(player, 2));
    }
};

export { hpos1Command, hpos2Command };
