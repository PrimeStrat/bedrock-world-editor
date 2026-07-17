import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { setTerrain } from "../actions/tools.js";

const terrainCommand = {
    definition: {
        name: "we:terrain",
        description: "Set the Terrain Builder mode (raise, smooth, extrude...).",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Enum, name: "we:terrainop" }],
        optionalParameters: [
            { type: CustomCommandParamType.Float, name: "radius" },
            { type: CustomCommandParamType.Float, name: "strength" }
        ]
    },
    handler(origin, mode, radius, strength) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(setTerrain(player, mode, radius ?? 4, strength ?? 2));
    }
};

export { terrainCommand };
