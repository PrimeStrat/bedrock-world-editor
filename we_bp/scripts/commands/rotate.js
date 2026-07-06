import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { rotateAction } from "../actions/clipboard.js";

const rotateCommand = {
    definition: {
        name: "we:rotate",
        description: "Rotate your clipboard for the next paste.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Integer, name: "degrees" }]
    },
    handler(origin, degrees) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(rotateAction(player, degrees));
    }
};

export { rotateCommand };
