import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { floodFill } from "../actions/utility.js";

const floodFillCommand = {
    definition: {
        name: "we:floodfill",
        description: "Flood a connected area from your crosshair block.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.String, name: "block" }],
        optionalParameters: [
            { type: CustomCommandParamType.Integer, name: "limit" },
            { type: CustomCommandParamType.Boolean, name: "up" },
            { type: CustomCommandParamType.Boolean, name: "down" },
            { type: CustomCommandParamType.Boolean, name: "corners" }
        ]
    },
    handler(origin, block, limit, up, down, corners) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(floodFill(player, block, limit ?? 2048, true, up ?? false, down ?? true, corners ?? false));
    }
};

export { floodFillCommand };
