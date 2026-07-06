import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { expandSelection } from "../actions/selection.js";

const expandCommand = {
    definition: {
        name: "we:expand",
        description: "Expand the selection. Direction defaults to where you look.",
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
        return toCommandResult(expandSelection(player, amount, direction));
    }
};

export { expandCommand };
