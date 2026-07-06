import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { drainNear } from "../actions/utility.js";

const drainCommand = {
    definition: {
        name: "we:drain",
        description: "Remove all liquids within a radius of you.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Integer, name: "radius" }]
    },
    handler(origin, radius) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(drainNear(player, radius));
    }
};

export { drainCommand };
