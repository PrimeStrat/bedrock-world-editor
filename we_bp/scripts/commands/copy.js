import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { copyRegion } from "../actions/clipboard.js";

const copyCommand = {
    definition: { name: "we:copy", description: "Copy selection; paste keeps its offset from you.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(copyRegion(player));
    }
};

export { copyCommand };
