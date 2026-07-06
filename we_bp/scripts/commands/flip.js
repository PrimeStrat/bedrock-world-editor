import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { flipAction } from "../actions/clipboard.js";

const flipCommand = {
    definition: {
        name: "we:flip",
        description: "Flip your clipboard along an axis for the next paste.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Enum, name: "we:axis" }]
    },
    handler(origin, axis) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(flipAction(player, axis));
    }
};

export { flipCommand };
