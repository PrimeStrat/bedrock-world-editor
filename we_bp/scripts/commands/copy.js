import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { copyRegion } from "../actions/clipboard.js";

const copyCommand = {
    definition: { name: "we:copy", description: "Copy the selection to your clipboard.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(copyRegion(player));
    }
};

export { copyCommand };
