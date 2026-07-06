import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { shiftSelection } from "../actions/selection.js";

const shiftCommand = {
    definition: {
        name: "we:shift",
        description: "Shift the whole selection. Direction defaults to where you look.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Integer, name: "amount" }],
        optionalParameters: [{ type: CustomCommandParamType.Enum, name: "we:direction" }]
    },
    handler(origin, amount, direction) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(shiftSelection(player, amount, direction));
    }
};

export { shiftCommand };
