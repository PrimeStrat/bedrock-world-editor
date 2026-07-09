import { system, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from "@minecraft/server";
import { getPlayer, notPlayer } from "./common.js";
import { setSymmetry, flipSymmetry, rotateSymmetry, radialSymmetry, statusSymmetry, clearSymmetry } from "../actions/symmetry.js";

const symmetryCommand = {
    definition: {
        name: "we:symmetry",
        description: "Mirror edits around a point: set, flip, rotate, radial.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Enum, name: "we:symmetryaction" }],
        optionalParameters: [
            { type: CustomCommandParamType.Enum, name: "we:flipaxis" },
            { type: CustomCommandParamType.Integer, name: "count" }
        ]
    },
    handler(origin, action, axis, count) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        system.run(() => {
            let result;
            if (action === "set") {
                result = setSymmetry(player);
            } else if (action === "flip") {
                result = flipSymmetry(player, axis ?? "");
            } else if (action === "rotate") {
                result = rotateSymmetry(player);
            } else if (action === "radial") {
                result = radialSymmetry(player, count ?? 4);
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
