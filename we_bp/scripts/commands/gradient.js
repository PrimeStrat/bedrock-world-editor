import { system, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { startGradient, stopGradient, listGradients } from "../actions/gradient.js";

const gradientCommand = {
    definition: {
        name: "we:gradient",
        description: "Build a weighted gradient from your inventory (block chances scale with count). start <name> to build, stop <name> to remove, list to view. Use it anywhere as #name.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Enum, name: "we:gradientaction" }],
        optionalParameters: [{ type: CustomCommandParamType.String, name: "name" }]
    },
    handler(origin, action, name) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        if (action === "list") {
            system.run(() => player.sendMessage(listGradients(player).message));
            return { status: CustomCommandStatus.Success };
        }
        if (name === undefined) {
            return toCommandResult({ ok: false, message: "§cUsage: /we:gradient " + action + " <name>" });
        }
        if (action === "start") {
            return toCommandResult(startGradient(player, name));
        }
        return toCommandResult(stopGradient(player, name));
    }
};

export { gradientCommand };
