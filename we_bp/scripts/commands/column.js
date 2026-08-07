import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { removeAbove, removeBelow, distribution } from "../actions/utility.js";

const removeAboveCommand = {
    definition: {
        name: "we:removeabove",
        description: "Clear a column of blocks above you.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        optionalParameters: [
            { type: CustomCommandParamType.Integer, name: "size" },
            { type: CustomCommandParamType.Integer, name: "height" }
        ]
    },
    handler(origin, size, height) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(removeAbove(player, size ?? 0, height ?? 256));
    }
};

const removeBelowCommand = {
    definition: {
        name: "we:removebelow",
        description: "Clear a column of blocks below you.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        optionalParameters: [
            { type: CustomCommandParamType.Integer, name: "size" },
            { type: CustomCommandParamType.Integer, name: "height" }
        ]
    },
    handler(origin, size, height) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(removeBelow(player, size ?? 0, height ?? 256));
    }
};

const distrCommand = {
    definition: { name: "we:distr", description: "Show the block distribution of the selection.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(distribution(player));
    }
};

export { removeAboveCommand, removeBelowCommand, distrCommand };
