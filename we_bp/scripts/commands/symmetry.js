import { system, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from "@minecraft/server";
import { getPlayer, notPlayer } from "./common.js";
import { setSymmetry, flipSymmetry, rotateSymmetry, clearSymmetry } from "../actions/symmetry.js";

const symmetryCommand = {
    definition: {
        name: "we:symmetry",
        description: "Mirror your block placements around a point: set it here, flip or rotate the mirroring, or clear it.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Enum, name: "we:symmetryaction" }]
    },
    handler(origin, action) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        system.run(() => {
            let result;
            if (action === "set") {
                result = setSymmetry(player);
            } else if (action === "flip") {
                result = flipSymmetry(player);
            } else if (action === "rotate") {
                result = rotateSymmetry(player);
            } else {
                result = clearSymmetry(player);
            }
            player.sendMessage(result.message);
        });
        return { status: CustomCommandStatus.Success };
    }
};

export { symmetryCommand };
