import { system, CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { setPolyVertex } from "../session.js";
import { blockUnder } from "../actions/common.js";
import { renderSelection } from "../actions/selectionRender.js";

const posCommand = {
    definition: {
        name: "we:pos",
        description: "Set polygon vertex N at your position (fills confine to it).",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Integer, name: "index" }]
    },
    handler(origin, index) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        if (index < 1) {
            return toCommandResult({ ok: false, message: "§cVertex number must be 1 or higher." });
        }
        const loc = blockUnder(player);
        const count = setPolyVertex(player.name, index, loc);
        system.run(() => renderSelection(player));
        const ready = count >= 3 ? "" : " §7(need " + (3 - count) + " more for a shape)";
        return toCommandResult({ ok: true, message: "§aVertex §f" + index + "§a set to §f" + loc.x + " " + loc.y + " " + loc.z + "§a." + ready });
    }
};

export { posCommand };
