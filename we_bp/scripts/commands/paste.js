import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { pasteRegionAction } from "../actions/clipboard.js";

const pasteCommand = {
    definition: {
        name: "we:paste",
        description: "Paste your clipboard at your location. Pass true to skip air.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        optionalParameters: [{ type: CustomCommandParamType.Boolean, name: "skipAir" }]
    },
    handler(origin, skipAir) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(pasteRegionAction(player, Boolean(skipAir)));
    }
};

export { pasteCommand };
