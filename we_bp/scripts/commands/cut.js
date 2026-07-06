import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { cutRegion } from "../actions/clipboard.js";

const cutCommand = {
    definition: { name: "we:cut", description: "Copy the selection to your clipboard, then clear it.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(cutRegion(player));
    }
};

export { cutCommand };
