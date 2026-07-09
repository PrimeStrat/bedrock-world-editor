import { system, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from "@minecraft/server";
import { getPlayer, notPlayer } from "./common.js";
import { setSymmetry, flipSymmetry, rotateSymmetry, radialSymmetry, statusSymmetry, clearSymmetry } from "../actions/symmetry.js";

const symmetryCommand = {
    definition: {
        name: "we:symmetry",
        description: "Mirror your placements/breaks and world-edits around a point: set it here, flip, rotate, radial N-fold, status, or clear.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Enum, name: "we:symmetryaction" }],
        optionalParameters: [
            { type: CustomCommandParamType.String, name: "axisOrCount" }
        ]
    },
    handler(origin, action, axisOrCount) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        system.run(() => {
            let result;
            if (action === "set") {
                result = setSymmetry(player);
            } else if (action === "flip") {
                result = flipSymmetry(player, axisOrCount ?? "");
            } else if (action === "rotate") {
                result = rotateSymmetry(player);
            } else if (action === "radial") {
                result = radialSymmetry(player, Number(axisOrCount) || 4);
            } else if (action === "status") {
                result = statusSymmetry(player);
            } else {
                result = clearSymmetry(player);
            }
            player.sendMessage(result.message);
        });
        return { status: CustomCommandStatus.Success };
    }
};

export { symmetryCommand };
