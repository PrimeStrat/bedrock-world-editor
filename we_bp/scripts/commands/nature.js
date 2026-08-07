import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { naturalize, green, snow, thaw, flora } from "../actions/nature.js";

const naturalizeCommand = {
    definition: { name: "we:naturalize", description: "Layer the surface into grass, dirt, then stone.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(naturalize(player));
    }
};

const greenCommand = {
    definition: { name: "we:green", description: "Turn exposed dirt on the surface into grass.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(green(player));
    }
};

const snowCommand = {
    definition: { name: "we:snow", description: "Lay snow on the surface; freeze surface water.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(snow(player));
    }
};

const thawCommand = {
    definition: { name: "we:thaw", description: "Remove snow and turn surface ice into water.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(thaw(player));
    }
};

const floraCommand = {
    definition: {
        name: "we:flora",
        description: "Scatter flowers and grass on grassy surfaces.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        optionalParameters: [{ type: CustomCommandParamType.Integer, name: "density" }]
    },
    handler(origin, density) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(flora(player, density ?? 25));
    }
};

export { naturalizeCommand, greenCommand, snowCommand, thawCommand, floraCommand };
