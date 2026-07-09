import { Player } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";

const CHEST_TITLE_27 = "§w§e§u§i§2§7§r";
const NEUTRAL_CODE = "";
const CHEST_SLOTS = 27;

/**
 * @typedef {{slot: number, icon: string, hover: string, run: function(Player):void, menu: boolean|undefined}} ChestEntry
 */

/**
 * Shows a 27-slot chest menu (routed by the shared chest UI title sentinel).
 * Empty slots render invisible; each entry's hover text shows as its tooltip.
 * After an action entry runs the menu re-shows; entries flagged menu hand off
 * to another menu instead, and a real cancel (Esc/close) exits.
 * @param {Player} player The player to show to.
 * @param {string} title The chest label text.
 * @param {ChestEntry[]} entries The populated slots.
 * @returns {Promise<void>} Resolves when the menu is closed or handed off.
 */
async function showChestMenu(player, title, entries) {
    const form = new ActionFormData().title(CHEST_TITLE_27 + title);
    const bySlot = new Map();
    for (const entry of entries) {
        bySlot.set(entry.slot, entry);
    }
    const ordered = [];
    for (let i = 0; i < CHEST_SLOTS; i++) {
        const entry = bySlot.get(i);
        if (entry) {
            form.button(NEUTRAL_CODE + entry.hover, entry.icon);
            ordered.push(entry);
        } else {
            form.button("", "");
            ordered.push(null);
        }
    }
    const response = await form.show(player);
    if (response.canceled || response.selection === undefined) {
        return;
    }
    const entry = ordered[response.selection];
    if (!entry) {
        return;
    }
    if (entry.menu) {
        entry.run(player);
        return;
    }
    await entry.run(player);
    return showChestMenu(player, title, entries);
}

export { showChestMenu };
