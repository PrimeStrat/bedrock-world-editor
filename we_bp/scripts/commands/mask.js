import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { setBlockMask, setPresetMask, clearMask, maskStatus, saveMask, loadSavedMask, deleteSavedMask, listMasks } from "../actions/mask.js";

const CLEAR_WORDS = ["off", "none", "clear"];

const maskCommand = {
    definition: {
        name: "we:mask",
        description: "Mask edits to blocks; save, load, list, off.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        optionalParameters: [
            { type: CustomCommandParamType.String, name: "blocks" },
            { type: CustomCommandParamType.String, name: "name" }
        ]
    },
    handler(origin, blocks, name) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        const text = String(blocks ?? "").trim();
        const word = text.toLowerCase();
        if (text === "") {
            return toCommandResult(maskStatus(player));
        }
        if (word === "list") {
            return toCommandResult(listMasks(player));
        }
        if (CLEAR_WORDS.includes(word)) {
            return toCommandResult(clearMask(player));
        }
        if (word === "save") {
            return toCommandResult(saveMask(player, name));
        }
        if (word === "load") {
            return toCommandResult(loadSavedMask(player, name));
        }
        if (word === "delete") {
            return toCommandResult(deleteSavedMask(player, name));
        }
        return toCommandResult(setBlockMask(player, text));
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
