import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { buildBridge } from "../actions/bridge.js";

/**
 * Builds a path/bridge command entry.
 * @param {string} name The command name.
 * @param {boolean} usePattern When true, block accepts a pattern string.
 * @returns {object} The command entry.
 */
function bridgeVariant(name, usePattern) {
    return {
        definition: {
            name,
            description: "Connect pos1 to pos2 with a path: curve type, curve amount, deck/tube shape, width across, thickness down, and extend-to-ground.",
            permissionLevel: CommandPermissionLevel.Admin,
            cheatsRequired: false,
            mandatoryParameters: [{ type: usePattern ? CustomCommandParamType.String : CustomCommandParamType.BlockType, name: "block" }],
            optionalParameters: [
                { type: CustomCommandParamType.Integer, name: "width" },
                { type: CustomCommandParamType.Integer, name: "thickness" },
                { type: CustomCommandParamType.Enum, name: "we:pathcurve" },
                { type: CustomCommandParamType.Integer, name: "amount" },
                { type: CustomCommandParamType.Enum, name: "we:pathshape" },
                { type: CustomCommandParamType.Boolean, name: "extendToGround" }
            ]
        },
        handler(origin, block, width, thickness, curve, amount, shape, extend) {
            const player = getPlayer(origin);
            if (!player) {
                return notPlayer();
            }
            return toCommandResult(buildBridge(player, {
                curve: curve ?? "line",
                amount: amount ?? 0,
                shape: shape ?? "deck",
                width: width ?? 5,
                thickness: thickness ?? 1,
                extendToGround: Boolean(extend),
                blockText: usePattern ? block : block.id
            }));
        }
    };
}

const bridgeCommand = bridgeVariant("we:bridge", false);
const ebridgeCommand = bridgeVariant("we:ebridge", true);

export { bridgeCommand, ebridgeCommand };
