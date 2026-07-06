import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { contractSelection } from "../actions/selection.js";

const contractCommand = {
    definition: {
        name: "we:contract",
        description: "Contract the selection. Direction defaults to where you look.",
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
        return toCommandResult(contractSelection(player, amount, direction));
    }
};

export { contractCommand };
