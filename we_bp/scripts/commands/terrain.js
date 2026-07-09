import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { terrainEdit } from "../actions/terrain.js";

const terrainCommand = {
    definition: {
        name: "we:terrain",
        description: "Edit the selection's surface: raise/lower by N, set to a Y level, or flatten to the average height.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Enum, name: "we:terrainop" }],
        optionalParameters: [{ type: CustomCommandParamType.Integer, name: "amount" }]
    },
    handler(origin, op, amount) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(terrainEdit(player, op, amount ?? 1));
    }
};

export { terrainCommand };
