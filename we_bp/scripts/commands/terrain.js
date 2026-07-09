import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { bindTerrain } from "../actions/brush.js";

const terrainCommand = {
    definition: {
        name: "we:terrain",
        description: "Bind a terrain sculpt brush: raise, lower, flatten, smooth.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Enum, name: "we:terrainop" }],
        optionalParameters: [
            { type: CustomCommandParamType.Integer, name: "radius" },
            { type: CustomCommandParamType.Integer, name: "strength" },
            { type: CustomCommandParamType.String, name: "item" }
        ]
    },
    handler(origin, mode, radius, strength, item) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(bindTerrain(player, mode, radius ?? 4, strength ?? 2, item ?? ""));
    }
};

export { terrainCommand };
