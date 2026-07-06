import { GameMode, ItemStack, Player, system, world } from "@minecraft/server";
import { registerCommands } from "./commands/registry.js";
import { clearWorldEditStructures } from "./operations/undo.js";
import { setPos1, setPos2 } from "./session.js";
import { WE_CONFIG } from "./config.js";

/**
 * Returns whether a player is wielding the selection wand in creative mode.
 * @param {Player} player The interacting player.
 * @param {ItemStack|undefined} itemStack The item used in the event.
 * @returns {boolean} True when the wand should act.
 */
function isWandUse(player, itemStack) {
    return Boolean(itemStack) && itemStack.typeId === WE_CONFIG.wandItemId && player.getGameMode() === GameMode.Creative;
}

system.beforeEvents.startup.subscribe(ev => {
    registerCommands(ev.customCommandRegistry);
});

world.afterEvents.worldLoad.subscribe(() => {
    clearWorldEditStructures();
});

world.beforeEvents.playerBreakBlock.subscribe(ev => {
    if (!isWandUse(ev.player, ev.itemStack)) {
        return;
    }
    ev.cancel = true;
    const player = ev.player;
    const loc = ev.block.location;
    setPos1(player.name, loc);
    system.run(() => {
        player.sendMessage("§aPos1 set to §f" + loc.x + " " + loc.y + " " + loc.z + "§a.");
    });
});

world.beforeEvents.playerInteractWithBlock.subscribe(ev => {
    if (!ev.isFirstEvent || !isWandUse(ev.player, ev.itemStack)) {
        return;
    }
    ev.cancel = true;
    const player = ev.player;
    const loc = ev.block.location;
    setPos2(player.name, loc);
    system.run(() => {
        player.sendMessage("§aPos2 set to §f" + loc.x + " " + loc.y + " " + loc.z + "§a.");
    });
});
