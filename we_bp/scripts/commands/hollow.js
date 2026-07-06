import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { hollowSelection } from "../actions/region.js";

const hollowCommand = {
    definition: { name: "we:hollow", description: "Replace the selection interior with air, leaving a shell.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(hollowSelection(player));
    }
};

export { hollowCommand };
