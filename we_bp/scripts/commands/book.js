import { system, ItemStack, CommandPermissionLevel, CustomCommandStatus } from "@minecraft/server";
import { getPlayer, notPlayer } from "./common.js";

const GUIDE_ITEM = "we:guide";

const bookCommand = {
    definition: {
        name: "we:book",
        description: "Get the World Editor guide book.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false
    },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        system.run(() => {
            const inv = player.getComponent("minecraft:inventory");
            const container = inv ? inv.container : undefined;
            if (!container) {
                return;
            }
            for (let i = 0; i < container.size; i++) {
                const item = container.getItem(i);
                if (item && item.typeId === GUIDE_ITEM) {
                    player.sendMessage("§aYou already have the guide book. Right-click it to open.");
                    return;
                }
            }
            container.addItem(new ItemStack(GUIDE_ITEM, 1));
            player.sendMessage("§aGuide book given. Right-click it to open.");
        });
        return { status: CustomCommandStatus.Success };
    }
};

export { bookCommand };
