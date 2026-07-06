import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { jumpTo } from "../actions/navigation.js";

const jumpToCommand = {
    definition: { name: "we:jumpto", description: "Teleport on top of the block you are looking at.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(jumpTo(player));
    }
};

export { jumpToCommand };
