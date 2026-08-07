import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { hollowSelection } from "../actions/region.js";

const hollowCommand = {
    definition: {
        name: "we:hollow",
        description: "Hollow the selection, leaving a shell (thickness).",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        optionalParameters: [{ type: CustomCommandParamType.Integer, name: "thickness" }]
    },
    handler(origin, thickness) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(hollowSelection(player, thickness ?? 1));
    }
};

export { hollowCommand };
