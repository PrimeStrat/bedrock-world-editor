import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { addPathPoint, clearPathPoints, listPathPoints, buildPathSweep, pastePathStamps } from "../actions/path.js";

const pathCommand = {
    definition: {
        name: "we:path",
        description: "Curve a path: sweep blocks or stamp your clipboard.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Enum, name: "we:pathaction" }],
        optionalParameters: [
            { type: CustomCommandParamType.Float, name: "size" },
            { type: CustomCommandParamType.String, name: "block" },
            { type: CustomCommandParamType.Boolean, name: "skipAir" }
        ]
    },
    handler(origin, action, size, block, skipAir) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        if (action === "add") {
            return toCommandResult(addPathPoint(player));
        }
        if (action === "build") {
            return toCommandResult(buildPathSweep(player, block ?? "stone", size ?? 2));
        }
        if (action === "paste") {
            return toCommandResult(pastePathStamps(player, size, skipAir ?? true));
        }
        if (action === "list") {
            return toCommandResult(listPathPoints(player));
        }
        return toCommandResult(clearPathPoints(player));
    }
};

export { pathCommand };
