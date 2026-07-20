import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { setBlockMask, setPresetMask, clearMask, maskStatus, saveMask, loadSavedMask, deleteSavedMask, listMasks } from "../actions/mask.js";

const maskCommand = {
    definition: {
        name: "we:mask",
        description: "Mask edits: set, save, load, delete, list, off.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Enum, name: "we:maskaction" }],
        optionalParameters: [{ type: CustomCommandParamType.String, name: "arg" }]
    },
    handler(origin, action, arg) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        if (action === "status") {
            return toCommandResult(maskStatus(player));
        }
        if (action === "list") {
            return toCommandResult(listMasks(player));
        }
        if (action === "off") {
            return toCommandResult(clearMask(player));
        }
        if (arg === undefined || String(arg).trim() === "") {
            return toCommandResult({ ok: false, message: "§cUsage: /we:mask " + action + " <" + (action === "set" ? "blocks" : "name") + ">" });
        }
        if (action === "save") {
            return toCommandResult(saveMask(player, arg));
        }
        if (action === "load") {
            return toCommandResult(loadSavedMask(player, arg));
        }
        if (action === "delete") {
            return toCommandResult(deleteSavedMask(player, arg));
        }
        return toCommandResult(setBlockMask(player, arg));
    }
};

const emaskCommand = {
    definition: {
        name: "we:emask",
        description: "Limit edits to a preset mask (all wool, foliage...).",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Enum, name: "we:maskpreset" }]
    },
    handler(origin, preset) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(setPresetMask(player, preset));
    }
};

export { maskCommand, emaskCommand };
